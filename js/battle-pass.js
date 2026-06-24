// Battle Pass System
const BP_MAX_TIERS = 30;
const XP_PER_TIER = 1000;

const BP_REWARDS = [
  { tier: 1,  type: 'xp_boost', name: '2x XP Boost',  icon: '⚡', desc: '1 Stunde' },
  { tier: 2,  type: 'spray',    name: 'Spray: Lachen', icon: '😂', desc: 'Emote' },
  { tier: 3,  type: 'outfit',   name: 'Arktis',        icon: null, skinId: 'arctic' },
  { tier: 4,  type: 'emote',    name: 'Tanzen',        icon: '💃', desc: 'Emote' },
  { tier: 5,  type: 'outfit',   name: 'Shadow Ops',    icon: null, skinId: 'shadow_ops' },
  { tier: 6,  type: 'vbucks',   name: '200 V-Münzen',  icon: '🪙', desc: 'Währung' },
  { tier: 7,  type: 'outfit',   name: 'Tarnung',       icon: null, skinId: 'camo' },
  { tier: 8,  type: 'pickaxe',  name: 'Donnerschlag',  icon: '⚡', pickId: 'thunder_pick' },
  { tier: 9,  type: 'spray',    name: 'Spray: Feuer',  icon: '🔥', desc: 'Emote' },
  { tier: 10, type: 'outfit',   name: 'Blaze',         icon: null, skinId: 'blaze' },
  { tier: 11, type: 'vbucks',   name: '200 V-Münzen',  icon: '🪙', desc: 'Währung' },
  { tier: 12, type: 'glider',   name: 'Sturmflügel',   icon: '🦅', gliderId: 'storm_wing' },
  { tier: 13, type: 'emote',    name: 'Jubel',         icon: '🎉', desc: 'Emote' },
  { tier: 14, type: 'spray',    name: 'Spray: Blitz',  icon: '⚡', desc: 'Spray' },
  { tier: 15, type: 'outfit',   name: 'Aurora',        icon: null, skinId: 'aurora' },
  { tier: 16, type: 'vbucks',   name: '400 V-Münzen',  icon: '🪙', desc: 'Währung' },
  { tier: 17, type: 'emote',    name: 'Siegestanz',    icon: '🕺', desc: 'Emote' },
  { tier: 18, type: 'pickaxe',  name: 'Schattenklinge',icon: '⚔️', pickId: 'shadow_blade' },
  { tier: 19, type: 'spray',    name: 'Spray: Stern',  icon: '⭐', desc: 'Spray' },
  { tier: 20, type: 'outfit',   name: 'Neon Licht',    icon: null, skinId: 'neon' },
  { tier: 21, type: 'emote',    name: 'Moonwalk',      icon: '🌙', desc: 'Emote' },
  { tier: 22, type: 'glider',   name: 'Nebula',        icon: '🌌', gliderId: 'nebula' },
  { tier: 23, type: 'vbucks',   name: '400 V-Münzen',  icon: '🪙', desc: 'Währung' },
  { tier: 24, type: 'spray',    name: 'Spray: Galaxy', icon: '🌌', desc: 'Spray' },
  { tier: 25, type: 'outfit',   name: 'Gold König',    icon: null, skinId: 'golden' },
  { tier: 26, type: 'emote',    name: 'Feuerwerk',     icon: '🎆', desc: 'Emote' },
  { tier: 27, type: 'vbucks',   name: '600 V-Münzen',  icon: '🪙', desc: 'Währung' },
  { tier: 28, type: 'spray',    name: 'Spray: Krone',  icon: '👑', desc: 'Spray' },
  { tier: 29, type: 'emote',    name: 'Legendentanz',  icon: '✨', desc: 'Emote' },
  { tier: 30, type: 'pickaxe',  name: 'Regenbogen-Sense', icon: '🌈', pickId: 'rainbow_scythe' }
];

// All unlockable IDs — owner gets everything on first launch
const ALL_SKINS     = ['default','shadow_ops','aurora','blaze','arctic','camo','neon','golden'];
const ALL_PICKAXES  = ['default_pick','thunder_pick','shadow_blade','rainbow_scythe'];
const ALL_GLIDERS   = ['default_glider','storm_wing','nebula'];

// Persistent save data
function loadSaveData() {
  // Preserve only player stats and selections — unlock data is always forced
  let wins = 0, kills = 0;
  let selectedSkin    = 'default';
  let selectedPickaxe = 'default_pick';
  let selectedGlider  = 'default_glider';

  try {
    const saved = localStorage.getItem('fortclash_save');
    if (saved) {
      const p = JSON.parse(saved);
      wins            = p.wins            || 0;
      kills           = p.kills           || 0;
      selectedSkin    = p.selectedSkin    || 'default';
      selectedPickaxe = p.selectedPickaxe || 'default_pick';
      selectedGlider  = p.selectedGlider  || 'default_glider';
    }
  } catch {}

  // Owner always has everything unlocked — no conditional, no old-data override
  const data = {
    wins, kills, selectedSkin, selectedPickaxe, selectedGlider,
    level:            BP_MAX_TIERS,
    xp:               0,
    totalXp:          0,
    bpOwned:          true,
    ownerUnlocked:    true,
    unlockedTiers:    Array.from({length: BP_MAX_TIERS}, (_, i) => i + 1),
    unlockedSkins:    [...ALL_SKINS],
    unlockedPickaxes: [...ALL_PICKAXES],
    unlockedGliders:  [...ALL_GLIDERS],
  };

  try { localStorage.setItem('fortclash_save', JSON.stringify(data)); } catch {}
  return data;
}

function saveSaveData(data) {
  try { localStorage.setItem('fortclash_save', JSON.stringify(data)); } catch {}
}

let saveData = loadSaveData();

function addXP(amount) {
  saveData.xp += amount;
  saveData.totalXp += amount;

  const notifications = [];

  while (saveData.xp >= XP_PER_TIER && saveData.level < BP_MAX_TIERS) {
    saveData.xp -= XP_PER_TIER;
    saveData.level++;
    unlockBPTier(saveData.level);
    notifications.push({ type: 'levelup', level: saveData.level });
  }

  if (saveData.level >= BP_MAX_TIERS) saveData.xp = XP_PER_TIER;

  saveSaveData(saveData);
  updateXPBar();
  return notifications;
}

function unlockBPTier(tier) {
  if (saveData.unlockedTiers.includes(tier)) return;
  saveData.unlockedTiers.push(tier);

  const reward = BP_REWARDS.find(r => r.tier === tier);
  if (!reward) return;

  if (reward.type === 'outfit' && reward.skinId) {
    if (!saveData.unlockedSkins.includes(reward.skinId)) {
      saveData.unlockedSkins.push(reward.skinId);
    }
    const skin = SKINS_DATA.outfits.find(s => s.id === reward.skinId);
    if (skin) skin.unlocked = true;
  }
  if (reward.type === 'pickaxe' && reward.pickId) {
    if (!saveData.unlockedPickaxes.includes(reward.pickId)) {
      saveData.unlockedPickaxes.push(reward.pickId);
    }
    const pick = SKINS_DATA.pickaxes.find(p => p.id === reward.pickId);
    if (pick) pick.unlocked = true;
  }
  if (reward.type === 'glider' && reward.gliderId) {
    if (!saveData.unlockedGliders.includes(reward.gliderId)) {
      saveData.unlockedGliders.push(reward.gliderId);
    }
    const glider = SKINS_DATA.gliders.find(g => g.id === reward.gliderId);
    if (glider) glider.unlocked = true;
  }
}

// Sync unlock state from save data
function syncUnlockState() {
  SKINS_DATA.outfits.forEach(s => { s.unlocked = saveData.unlockedSkins.includes(s.id); });
  SKINS_DATA.pickaxes.forEach(p => { p.unlocked = saveData.unlockedPickaxes.includes(p.id); });
  SKINS_DATA.gliders.forEach(g => { g.unlocked = saveData.unlockedGliders.includes(g.id); });
}

function getCurrentSkin() {
  return SKINS_DATA.outfits.find(s => s.id === saveData.selectedSkin) || SKINS_DATA.outfits[0];
}

function updateXPBar() {
  const pct = Math.min(100, (saveData.xp / XP_PER_TIER) * 100);
  const bar = document.getElementById('xp-bar');
  const text = document.getElementById('xp-text');
  const lvl = document.getElementById('bp-current-level');
  if (bar) bar.style.width = pct + '%';
  if (text) text.textContent = `${saveData.xp} / ${XP_PER_TIER} XP`;
  if (lvl) lvl.textContent = saveData.level;
}

function renderBattlePass() {
  updateXPBar();
  const tiersEl = document.getElementById('bp-tiers');
  if (!tiersEl) return;
  tiersEl.innerHTML = '';

  const statusEl = document.getElementById('bp-status');
  if (statusEl) {
    if (saveData.bpOwned) {
      statusEl.className = 'bp-owned';
      statusEl.textContent = '✓ BATTLE PASS BESESSEN';
    } else {
      statusEl.className = 'bp-free';
      statusEl.textContent = 'KOSTENLOS';
    }
  }

  BP_REWARDS.forEach(reward => {
    const unlocked = saveData.unlockedTiers.includes(reward.tier);
    const isCurrent = saveData.level === reward.tier;

    const tier = document.createElement('div');
    tier.className = 'bp-tier';

    const xpNeeded = (reward.tier - saveData.level) * XP_PER_TIER - saveData.xp;

    let rewardClass = `tier-reward rarity-${getRarityForReward(reward)}`;
    if (unlocked) rewardClass += ' unlocked';
    if (isCurrent) rewardClass += ' current';

    let innerContent = '';
    if (reward.type === 'outfit' && reward.skinId) {
      innerContent = `<canvas id="bp-skin-${reward.skinId}" width="60" height="80"></canvas>`;
    } else {
      innerContent = `<div class="tier-reward-icon">${reward.icon}</div>`;
    }

    tier.innerHTML = `
      <div class="tier-number">TIER ${reward.tier}</div>
      <div class="${rewardClass}">
        ${innerContent}
        <div class="tier-reward-name">${reward.name}</div>
        ${unlocked ? '<div class="tier-check">✓</div>' : (!saveData.bpOwned || reward.tier > saveData.level ? '<div class="tier-lock">🔒</div>' : '')}
      </div>
      <div class="tier-xp-needed">${unlocked ? 'Freigeschaltet' : (reward.tier <= saveData.level ? 'Verfügbar' : `~${Math.max(0,Math.ceil(xpNeeded/100)*100)} XP`)}</div>
    `;
    tiersEl.appendChild(tier);
  });

  // Draw skin previews
  BP_REWARDS.forEach(reward => {
    if (reward.type === 'outfit' && reward.skinId) {
      const canvas = document.getElementById(`bp-skin-${reward.skinId}`);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const skin = SKINS_DATA.outfits.find(s => s.id === reward.skinId);
        if (skin) drawSkinOnCanvas(ctx, skin, 30, 60, 0.7);
      }
    }
  });
}

function getRarityForReward(reward) {
  if (reward.type === 'outfit') {
    const skin = SKINS_DATA.outfits.find(s => s.id === reward.skinId);
    return skin ? skin.rarity : 'common';
  }
  if (reward.type === 'pickaxe') {
    const p = SKINS_DATA.pickaxes.find(p => p.id === reward.pickId);
    return p ? p.rarity : 'rare';
  }
  if (reward.type === 'glider') return 'epic';
  if (reward.type === 'vbucks') return 'legendary';
  return 'common';
}
