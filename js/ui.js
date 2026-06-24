// UI / screen management
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = '';
  });
  const el = document.getElementById(id);
  if (el) {
    el.style.display = 'flex';
    el.classList.add('active');
  }

  if (id === 'battlepass') renderBattlePass();
  if (id === 'locker') renderLocker('outfits');
  if (id === 'lobby') renderLobbyPreview();
  if (id === 'main-menu') updateMenuStats();
}

function updateMenuStats() {
  const el = id => document.getElementById(id);
  if (el('menu-wins')) el('menu-wins').textContent = saveData.wins;
  if (el('menu-kills')) el('menu-kills').textContent = saveData.kills;
  if (el('menu-level')) el('menu-level').textContent = saveData.level;
}

// ─── LOCKER ───────────────────────────────────────────────────────────────────
let currentLockerTab = 'outfits';

function setLockerTab(tab, btn) {
  currentLockerTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderLocker(tab);
}

function renderLocker(tab) {
  const grid = document.getElementById('locker-grid');
  if (!grid) return;
  grid.innerHTML = '';

  syncUnlockState();
  const items = SKINS_DATA[tab];
  if (!items) return;

  items.forEach(item => {
    const card = document.createElement('div');
    const isSelected = tab === 'outfits' ? saveData.selectedSkin === item.id
      : tab === 'pickaxes' ? saveData.selectedPickaxe === item.id
      : saveData.selectedGlider === item.id;

    card.className = `skin-card rarity-${item.rarity}${item.unlocked ? '' : ' locked'}${isSelected ? ' selected' : ''}`;

    let innerContent = '';
    if (tab === 'outfits') {
      innerContent = `<div class="skin-canvas-wrapper"><canvas id="locker-skin-${item.id}" width="80" height="120"></canvas></div>`;
    } else {
      innerContent = `<div class="skin-canvas-wrapper" style="font-size:48px">${item.icon}</div>`;
    }

    card.innerHTML = `
      ${innerContent}
      <div class="skin-info">
        <div class="skin-name">${item.name}</div>
        <div class="skin-rarity" style="color:${RARITY_COLORS[item.rarity]}">${RARITY_NAMES[item.rarity]}</div>
      </div>
      ${!item.unlocked ? `<div class="lock-overlay">🔒</div>` : ''}
    `;

    if (item.unlocked) {
      card.addEventListener('click', () => selectItem(tab, item.id));
    }

    grid.appendChild(card);
  });

  // Draw skin canvases after DOM insertion
  if (tab === 'outfits') {
    items.forEach(item => {
      const canvas = document.getElementById(`locker-skin-${item.id}`);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        drawSkinOnCanvas(ctx, item, 40, 90, 0.9, false);
      }
    });
  }
}

function selectItem(tab, id) {
  if (tab === 'outfits') {
    saveData.selectedSkin = id;
  } else if (tab === 'pickaxes') {
    saveData.selectedPickaxe = id;
  } else {
    saveData.selectedGlider = id;
  }
  saveSaveData(saveData);
  renderLocker(tab);
  renderLobbyPreview();
}

// ─── LOBBY PREVIEW ────────────────────────────────────────────────────────────
function renderLobbyPreview() {
  const canvas = document.getElementById('player-preview');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const skin = getCurrentSkin();
  drawSkinOnCanvas(ctx, skin, canvas.width / 2, canvas.height * 0.65, 2.5, true);

  document.getElementById('selected-skin-name').textContent = skin.name;

  requestAnimationFrame(renderLobbyPreview);
}

// ─── DAMAGE NUMBERS ───────────────────────────────────────────────────────────
function showDamageNumber(worldX, worldY, damage, crit) {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;
  const player_ref = player;
  const screenX = worldX - (player_ref.x - canvas.width / 2);
  const screenY = worldY - (player_ref.y - canvas.height / 2);

  const el = document.createElement('div');
  el.className = `dmg-num${crit ? ' crit' : ''}`;
  el.textContent = crit ? `${damage}!` : damage;
  el.style.left = `${screenX - 20 + (Math.random() - 0.5) * 30}px`;
  el.style.top = `${screenY - 20}px`;

  document.getElementById('damage-numbers').appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

// ─── KILL FEED ────────────────────────────────────────────────────────────────
const killFeedEntries = [];
function addKillFeedEntry(killer, victim, weapon) {
  const feed = document.getElementById('kill-feed');
  if (!feed) return;

  const el = document.createElement('div');
  el.className = 'kill-entry';
  el.innerHTML = `<span class="killer">${killer}</span><span class="weapon">${weapon}</span><span class="victim">${victim}</span>`;
  feed.insertBefore(el, feed.firstChild);

  killFeedEntries.push(el);
  if (killFeedEntries.length > 5) {
    const old = killFeedEntries.shift();
    old.remove();
  }

  setTimeout(() => {
    el.style.transition = 'opacity 0.5s';
    el.style.opacity = '0';
    setTimeout(() => {
      if (el.parentNode) el.remove();
      const idx = killFeedEntries.indexOf(el);
      if (idx > -1) killFeedEntries.splice(idx, 1);
    }, 500);
  }, 4000);
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
function showXPNotif(text) {
  const el = document.createElement('div');
  el.className = 'xp-notification';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

function showLevelUpNotification(level) {
  const el = document.createElement('div');
  el.className = 'level-up-notification';
  el.innerHTML = `<h2>LEVEL UP!</h2><p>Level ${level} erreicht!</p>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  syncUnlockState();
  updateMenuStats();

  // Restore previously chosen control mode so returning players skip the selector
  try {
    const saved = localStorage.getItem('fortclash_control');
    if (saved && window.selectControlMode) {
      selectControlMode(saved);   // sets controlMode + shows main-menu
    } else {
      showScreen('control-select');
    }
  } catch (e) {
    showScreen('control-select');
  }

  // Auto-join if URL contains ?room=CODE
  if (window.mpCheckUrlRoom) mpCheckUrlRoom();
});
