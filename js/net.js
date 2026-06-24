// net.js — WebRTC multiplayer via PeerJS (host-authoritative star relay)
/* globals Peer, showScreen, startGame, mpUpsert, mpRemove, mpSpawnTracer,
           mpApplyDamage, mpLocalState */
(function () {
  const PREFIX = 'fortclashv1-';
  let peer = null, isHost = false, myId = null, hostConn = null;
  const conns = {};                 // host: peerId -> DataConnection
  let roomCode = null, maxPlayers = 4, localName = 'Spieler';
  let lobbyPlayers = [];            // [{id, name}]
  let started = false, lastSent = 0;

  const $ = id => document.getElementById(id);

  function rcode() {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  }

  function netStatus(msg) { const e = $('mp-status'); if (e) e.textContent = msg || ''; }

  function ensurePeerLib(cb) {
    if (window.Peer) return cb();
    netStatus('Lade Netzwerk-Bibliothek…');
    let tries = 0;
    const iv = setInterval(() => {
      if (window.Peer) { clearInterval(iv); cb(); }
      else if (++tries > 60) { clearInterval(iv); netStatus('Konnte Peer.js nicht laden (Internet?).'); }
    }, 100);
  }

  // ── HOST ──────────────────────────────────────────────────────────────────
  function createRoom() {
    isHost = true; started = false;
    maxPlayers = Math.max(2, Math.min(10, parseInt(($('mp-maxplayers') || {}).value) || 4));
    localName = (($('mp-name') || {}).value || 'Host').slice(0, 14) || 'Host';
    roomCode = rcode();
    netStatus('Erstelle Raum…');
    ensurePeerLib(() => {
      peer = new Peer(PREFIX + roomCode, { debug: 1 });
      peer.on('open', () => {
        myId = 'HOST';
        lobbyPlayers = [{ id: 'HOST', name: localName }];
        showRoom(); renderLobby(); netStatus('');
      });
      peer.on('connection', conn => {
        if (started || Object.keys(conns).length + 1 >= maxPlayers) {
          conn.on('open', () => conn.close());
          return;
        }
        conn.on('open', () => {
          conns[conn.peer] = conn;
          conn.on('data', d => hostOnData(conn, d));
          conn.on('close', () => {
            delete conns[conn.peer];
            lobbyPlayers = lobbyPlayers.filter(p => p.id !== conn.peer);
            if (window.mpRemove) mpRemove(conn.peer);
            broadcastLobby(); renderLobby();
          });
        });
      });
      peer.on('error', e => netStatus('Fehler: ' + (e.type || e)));
    });
  }

  function hostOnData(conn, d) {
    if (d.t === 'hello') {
      if (!lobbyPlayers.find(p => p.id === conn.peer))
        lobbyPlayers.push({ id: conn.peer, name: (d.name || 'Spieler').slice(0, 14) });
      broadcastLobby(); renderLobby();
    } else if (d.t === 'state') {
      d.id = conn.peer;
      if (window.mpUpsert) mpUpsert(conn.peer, d);
      relay(d, conn.peer);
    } else if (d.t === 'shot') {
      d.id = conn.peer;
      if (window.mpSpawnTracer) mpSpawnTracer(d.sx, d.sy, d.sz, d.ex, d.ey, d.ez);
      relay(d, conn.peer);
    } else if (d.t === 'hit') {
      routeHit(d);
    }
  }

  function routeHit(d) {
    if (d.target === 'HOST') { if (window.mpApplyDamage) mpApplyDamage(d.dmg); }
    else if (conns[d.target]) { try { conns[d.target].send(d); } catch (e) {} }
  }

  function broadcastLobby() {
    const msg = { t: 'lobby', players: lobbyPlayers, max: maxPlayers, code: roomCode };
    Object.values(conns).forEach(c => { try { c.send(msg); } catch (e) {} });
  }
  function relay(d, exceptId) {
    Object.entries(conns).forEach(([id, c]) => { if (id !== exceptId) { try { c.send(d); } catch (e) {} } });
  }

  function startMatchHost() {
    if (!isHost) return;
    started = true;
    Object.values(conns).forEach(c => { try { c.send({ t: 'start' }); } catch (e) {} });
    beginGame();
  }

  // ── CLIENT ────────────────────────────────────────────────────────────────
  function joinRoom() {
    isHost = false; started = false;
    const code = (($('mp-joincode') || {}).value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (code.length < 4) { netStatus('Bitte 4-stelligen Code eingeben.'); return; }
    roomCode = code;
    localName = (($('mp-name') || {}).value || 'Spieler').slice(0, 14) || 'Spieler';
    netStatus('Verbinde mit Raum ' + code + '…');
    ensurePeerLib(() => {
      peer = new Peer({ debug: 1 });
      peer.on('open', id => {
        myId = id;
        const conn = peer.connect(PREFIX + code, { reliable: true });
        hostConn = conn;
        conn.on('open', () => { conn.send({ t: 'hello', name: localName }); showRoom(); netStatus('Verbunden — warte auf Host…'); });
        conn.on('data', d => clientOnData(d));
        conn.on('close', () => { if (!started) netStatus('Verbindung getrennt.'); });
        setTimeout(() => { if (!hostConn || !hostConn.open) netStatus('Kein Raum mit Code ' + code + ' gefunden?'); }, 7000);
      });
      peer.on('error', e => netStatus('Fehler: ' + (e.type || e)));
    });
  }

  function clientOnData(d) {
    if (d.t === 'lobby') { lobbyPlayers = d.players; maxPlayers = d.max; roomCode = d.code; renderLobby(); }
    else if (d.t === 'start') { beginGame(); }
    else if (d.t === 'state') { if (window.mpUpsert) mpUpsert(d.id, d); }
    else if (d.t === 'shot')  { if (window.mpSpawnTracer) mpSpawnTracer(d.sx, d.sy, d.sz, d.ex, d.ey, d.ez); }
    else if (d.t === 'hit')   { if (d.target === myId && window.mpApplyDamage) mpApplyDamage(d.dmg); }
  }

  // ── COMMON ────────────────────────────────────────────────────────────────
  function beginGame() {
    started = true;
    NET.active = true;
    if (window.startGame) startGame({ mp: true });
  }

  function sendLocal(obj) {
    if (isHost) Object.values(conns).forEach(c => { try { c.send(obj); } catch (e) {} });
    else if (hostConn && hostConn.open) { try { hostConn.send(obj); } catch (e) {} }
  }

  const NET = {
    active: false,
    tick() {
      if (!NET.active) return;
      const now = performance.now();
      if (now - lastSent < 55) return;
      lastSent = now;
      const s = window.mpLocalState ? mpLocalState() : null;
      if (!s) return;
      s.t = 'state'; s.id = isHost ? 'HOST' : myId; s.name = localName;
      sendLocal(s);
    },
    sendShot(a, b) {
      const obj = { t: 'shot', id: isHost ? 'HOST' : myId, sx: a.x, sy: a.y, sz: a.z, ex: b.x, ey: b.y, ez: b.z };
      sendLocal(obj);
    },
    sendHit(targetId, dmg) {
      if (isHost) {
        if (targetId === 'HOST') { if (window.mpApplyDamage) mpApplyDamage(dmg); }
        else if (conns[targetId]) { try { conns[targetId].send({ t: 'hit', target: targetId, dmg }); } catch (e) {} }
      } else if (hostConn && hostConn.open) {
        try { hostConn.send({ t: 'hit', target: targetId, dmg }); } catch (e) {}
      }
    },
    leave() {
      NET.active = false; started = false;
      try { Object.values(conns).forEach(c => c.close()); } catch (e) {}
      try { if (hostConn) hostConn.close(); } catch (e) {}
      try { if (peer) peer.destroy(); } catch (e) {}
      peer = null; hostConn = null; isHost = false;
      for (const k in conns) delete conns[k];
      lobbyPlayers = [];
    },
  };
  window.NET = NET;

  // ── LOBBY UI ────────────────────────────────────────────────────────────────
  function renderLobby() {
    const list = $('mp-player-list');
    if (list) {
      list.innerHTML = '';
      lobbyPlayers.forEach(p => {
        const d = document.createElement('div');
        d.className = 'mp-player';
        d.textContent = p.name + (p.id === 'HOST' ? ' 👑' : '');
        list.appendChild(d);
      });
    }
    const cc = $('mp-room-code'); if (cc) cc.textContent = roomCode || '----';
    const cnt = $('mp-count'); if (cnt) cnt.textContent = `${lobbyPlayers.length}/${maxPlayers}`;
    const sb = $('mp-start-btn'); if (sb) sb.style.display = isHost ? 'inline-block' : 'none';
    const wm = $('mp-wait'); if (wm) wm.style.display = isHost ? 'none' : 'block';
  }
  function showRoom() { if (window.showScreen) showScreen('mp-room'); renderLobby(); }

  window.openMultiplayer = function () { if (window.showScreen) showScreen('multiplayer'); netStatus(''); };
  window.mpCreateRoom = createRoom;
  window.mpJoinRoom = joinRoom;
  window.mpStartMatch = startMatchHost;
  window.mpLeaveRoom = function () { NET.leave(); if (window.showScreen) showScreen('main-menu'); };
})();
