// net.js — WebRTC multiplayer via PeerJS (host-authoritative star relay)
/* globals Peer, showScreen, startGame, mpUpsert, mpRemove, mpSpawnTracer,
           mpApplyDamage, mpLocalState */
(function () {
  const PREFIX = 'fortclashv1-';
  let peer = null, isHost = false, myId = null, hostConn = null;
  const conns = {};
  let roomCode = null, maxPlayers = 4, localName = 'Spieler';
  let lobbyPlayers = [];
  let started = false, lastSent = 0;
  let _createRetries = 0;

  // STUN + free TURN servers for reliable NAT traversal across all platforms/networks
  const ICE_CFG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.relay.metered.ca:80' },
      { urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject', credential: 'openrelayproject' },
    ]
  };

  const $ = id => document.getElementById(id);

  function rcode() {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  }

  function netStatus(msg, ok) {
    const e = $('mp-status');
    if (!e) return;
    e.textContent = msg || '';
    e.style.color = ok ? '#22c55e' : (msg ? '#f87171' : '#aaa');
  }

  function _setUrl(code) {
    try {
      const u = new URL(location.href);
      if (code) u.searchParams.set('room', code);
      else u.searchParams.delete('room');
      history.replaceState(null, '', u.toString());
    } catch (e) {}
  }

  function _shareUrl() {
    try {
      const u = new URL(location.href);
      u.searchParams.set('room', roomCode);
      return u.toString();
    } catch (e) { return roomCode; }
  }

  function ensurePeerLib(cb) {
    if (window.Peer) return cb();
    netStatus('Lade Netzwerk-Bibliothek…', false);
    let tries = 0;
    const iv = setInterval(() => {
      if (window.Peer) { clearInterval(iv); cb(); }
      else if (++tries > 80) {
        clearInterval(iv);
        netStatus('Peer.js konnte nicht geladen werden – Internet-Verbindung prüfen.');
      }
    }, 100);
  }

  // ── HOST ──────────────────────────────────────────────────────────────────
  function createRoom() {
    isHost = true; started = false;
    maxPlayers = Math.max(2, Math.min(10, parseInt(($('mp-maxplayers') || {}).value) || 4));
    localName = (($('mp-name') || {}).value || 'Host').slice(0, 14) || 'Host';
    if (_createRetries === 0) roomCode = rcode();
    netStatus('Erstelle Raum…', false);
    ensurePeerLib(() => {
      if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
      peer = new Peer(PREFIX + roomCode, { debug: 0, config: ICE_CFG });
      peer.on('open', () => {
        _createRetries = 0;
        myId = 'HOST';
        lobbyPlayers = [{ id: 'HOST', name: localName }];
        _setUrl(roomCode);
        showRoom(); renderLobby(); netStatus('', true);
        _updateShareBtn();
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
          conn.on('error', err => console.warn('conn error', err));
        });
      });
      peer.on('error', e => {
        if (e.type === 'unavailable-id' && _createRetries < 5) {
          _createRetries++;
          roomCode = rcode();
          netStatus('Code vergeben, versuche neuen Code…', false);
          setTimeout(createRoom, 600);
        } else {
          _createRetries = 0;
          const msgs = {
            'network': 'Netzwerkfehler – Internet-Verbindung prüfen.',
            'server-error': 'Server-Fehler – bitte erneut versuchen.',
            'browser-incompatible': 'Browser unterstützt WebRTC nicht.',
          };
          netStatus(msgs[e.type] || ('Fehler: ' + (e.type || e)));
        }
      });
      peer.on('disconnected', () => { if (!started) netStatus('Verbindung zum Server verloren.'); });
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
    Object.entries(conns).forEach(([id, c]) => {
      if (id !== exceptId) { try { c.send(d); } catch (e) {} }
    });
  }

  function startMatchHost() {
    if (!isHost) return;
    started = true;
    Object.values(conns).forEach(c => { try { c.send({ t: 'start' }); } catch (e) {} });
    beginGame();
  }

  // ── CLIENT ────────────────────────────────────────────────────────────────
  function joinRoom(codeOverride) {
    isHost = false; started = false;
    const raw = codeOverride || (($('mp-joincode') || {}).value) || '';
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (code.length < 4) { netStatus('Bitte 4-stelligen Code eingeben.'); return; }
    roomCode = code;
    localName = (($('mp-name') || {}).value || 'Spieler').slice(0, 14) || 'Spieler';
    netStatus('Verbinde mit Raum ' + code + '…', false);
    ensurePeerLib(() => {
      if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
      peer = new Peer({ debug: 0, config: ICE_CFG });
      peer.on('open', id => {
        myId = id;
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        hostConn = conn;
        conn.on('open', () => {
          conn.send({ t: 'hello', name: localName });
          showRoom();
          netStatus('Verbunden — warte auf Host…', true);
        });
        conn.on('data', d => clientOnData(d));
        conn.on('close', () => { if (!started) netStatus('Verbindung getrennt.'); });
        conn.on('error', err => netStatus('Verbindungsfehler: ' + (err.type || err)));
      });
      peer.on('error', e => {
        const msgs = {
          'peer-unavailable': 'Kein Raum mit Code ' + code + ' gefunden.',
          'network': 'Netzwerkfehler – Internet-Verbindung prüfen.',
          'server-error': 'Server-Fehler – bitte erneut versuchen.',
          'browser-incompatible': 'Browser unterstützt WebRTC nicht.',
        };
        netStatus(msgs[e.type] || ('Fehler: ' + (e.type || e)));
      });
      peer.on('disconnected', () => { if (!started) netStatus('Verbindung zum Server verloren.'); });
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

  function _updateShareBtn() {
    const btn = $('mp-share-btn');
    if (!btn) return;
    btn.dataset.url = _shareUrl();
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
      const obj = { t: 'shot', id: isHost ? 'HOST' : myId,
        sx: a.x, sy: a.y, sz: a.z, ex: b.x, ey: b.y, ez: b.z };
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
      NET.active = false; started = false; _createRetries = 0;
      _setUrl(null);
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

  window.openMultiplayer = function () {
    if (window.showScreen) showScreen('multiplayer');
    netStatus('');
  };
  window.mpCreateRoom  = createRoom;
  window.mpJoinRoom    = joinRoom;
  window.mpStartMatch  = startMatchHost;
  window.mpLeaveRoom   = function () {
    NET.leave();
    if (window.showScreen) showScreen('main-menu');
  };
  window.mpShareCopy   = function (btn) {
    const url = btn.dataset.url || _shareUrl();
    navigator.clipboard && navigator.clipboard.writeText(url)
      .then(() => { btn.textContent = '✓ Link kopiert!'; setTimeout(() => btn.textContent = '🔗 Link teilen', 2000); })
      .catch(() => { btn.textContent = url; });
  };

  // ── URL auto-join ──────────────────────────────────────────────────────────
  // Called from ui.js after the page loads to check for ?room=CODE
  window.mpCheckUrlRoom = function () {
    try {
      const params = new URLSearchParams(location.search);
      const code = (params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      if (code.length === 4) {
        const el = $('mp-joincode'); if (el) el.value = code;
        if (window.showScreen) showScreen('multiplayer');
        netStatus('Raum ' + code + ' — Drücke BEITRETEN!', true);
        return true;
      }
    } catch (e) {}
    return false;
  };
})();
