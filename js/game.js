// Core game loop
const WORLD_SIZE = 3000;
const INITIAL_PLAYERS = 40;
const TILE_SIZE = 100;

let canvas, ctx, minimap, minimapCtx;
let player, enemies, bullets, pickups, particles;
let keys = {};
let mouseX, mouseY, shooting = false;
let gameState = 'menu'; // menu | playing | dead | won
let gameTime = 0;
let startTime = 0;
let animFrame;

// Map tiles
let mapData = [];
let mapObjects = []; // trees, rocks, buildings

// Storm
let storm = {
  cx: 0, cy: 0,       // current circle center
  cr: WORLD_SIZE * 0.6, // current radius
  tx: 0, ty: 0,       // target center
  tr: 0,              // target radius
  shrinking: false,
  timer: 30,          // seconds until next shrink
  phase: 0,
  damage: 2,
  warningShown: false
};

const STORM_PHASES = [
  { waitTime: 60, targetRadius: 1200, duration: 30, damage: 2 },
  { waitTime: 45, targetRadius: 700, duration: 25, damage: 3 },
  { waitTime: 35, targetRadius: 400, duration: 20, damage: 5 },
  { waitTime: 25, targetRadius: 200, duration: 15, damage: 8 },
  { waitTime: 20, targetRadius: 80, duration: 12, damage: 12 },
];

function generateMap() {
  mapData = [];
  mapObjects = [];

  // Ground tiles (color-coded terrain)
  const types = ['grass', 'dirt', 'grass', 'grass', 'stone'];
  const half = Math.ceil(WORLD_SIZE / TILE_SIZE / 2);
  for (let tx = -half; tx <= half; tx++) {
    for (let ty = -half; ty <= half; ty++) {
      const noise = Math.sin(tx * 0.3) * Math.cos(ty * 0.3) + Math.sin(tx * 0.7 + ty * 0.5) * 0.5;
      const type = noise > 0.6 ? 'stone' : noise > 0.2 ? 'dirt' : 'grass';
      mapData.push({ tx, ty, type });
    }
  }

  // Generate objects
  for (let i = 0; i < 300; i++) {
    const x = (Math.random() - 0.5) * WORLD_SIZE;
    const y = (Math.random() - 0.5) * WORLD_SIZE;
    const r = Math.random();
    if (r < 0.5) {
      mapObjects.push({ x, y, type: 'tree', radius: 20, hp: 80 });
    } else if (r < 0.7) {
      mapObjects.push({ x, y, type: 'rock', radius: 24, hp: 150 });
    } else if (r < 0.85) {
      mapObjects.push({ x, y, type: 'bush', radius: 18, hp: 30 });
    } else {
      mapObjects.push({ x, y, type: 'house', w: 90, h: 70, hp: 250 });
    }
  }
}

function spawnPickups() {
  pickups = [];
  for (let i = 0; i < 80; i++) {
    const types = ['medkit', 'shield', 'ammo', 'shield_small'];
    const t = types[Math.floor(Math.random() * types.length)];
    pickups.push({
      x: (Math.random() - 0.5) * WORLD_SIZE,
      y: (Math.random() - 0.5) * WORLD_SIZE,
      type: t,
      radius: 12,
      collected: false
    });
  }
}

function startGame() {
  showScreen('game-screen');
  gameState = 'playing';

  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  minimap = document.getElementById('minimap');
  minimapCtx = minimap.getContext('2d');

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  generateMap();
  spawnPickups();

  const skin = getCurrentSkin();
  player = new Player(0, 0, skin);

  enemies = spawnEnemies(INITIAL_PLAYERS - 1, WORLD_SIZE, 0, 0);
  bullets = [];
  particles = [];

  storm = {
    cx: 0, cy: 0,
    cr: WORLD_SIZE * 0.55,
    tx: 0, ty: 0,
    tr: WORLD_SIZE * 0.55,
    shrinking: false,
    timer: STORM_PHASES[0].waitTime,
    phase: 0,
    damage: 2,
    warningShown: false
  };

  gameTime = 0;
  startTime = Date.now();

  keys = {};
  setupInput();

  if (animFrame) cancelAnimationFrame(animFrame);
  let lastTime = performance.now();

  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    update(dt);
    render();
    animFrame = requestAnimationFrame(loop);
  }
  animFrame = requestAnimationFrame(loop);
}

function resizeCanvas() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function setupInput() {
  document.addEventListener('keydown', e => { keys[e.code] = true; });
  document.addEventListener('keyup', e => { keys[e.code] = false; });

  canvas.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });
  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) shooting = true;
  });
  canvas.addEventListener('mouseup', e => {
    if (e.button === 0) shooting = false;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
}

function update(dt) {
  if (gameState !== 'playing') return;
  gameTime += dt;

  // Update player
  player.update(dt, keys, mouseX, mouseY);

  // Shooting
  if (shooting) {
    player.tryShoot(bullets);
  }

  // Clamp player to world
  const half = WORLD_SIZE / 2;
  player.x = Math.max(-half, Math.min(half, player.x));
  player.y = Math.max(-half, Math.min(half, player.y));

  // Storm update
  updateStorm(dt);

  // Update enemies
  enemies.forEach(e => {
    if (e.alive) {
      e.update(dt, player, enemies, WORLD_SIZE,
        { x: storm.cx, y: storm.cy }, storm.cr, bullets);
    }
  });

  // Update bullets
  updateBullets(dt);

  // Update particles
  particles = particles.filter(p => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.vx *= 0.95;
    p.vy *= 0.95;
    return p.life > 0;
  });

  // Check pickups
  checkPickups();

  // Bot vs bot combat (simplified — bots near each other occasionally fight)
  updateBotCombat(dt);

  // Update HUD
  updateHUD();

  // Check win/lose
  const aliveEnemies = enemies.filter(e => e.alive).length;
  if (!player.alive) {
    endGame(false);
  } else if (aliveEnemies === 0) {
    endGame(true);
  }
}

function updateStorm(dt) {
  if (storm.shrinking) {
    const phase = STORM_PHASES[Math.min(storm.phase, STORM_PHASES.length - 1)];
    const totalDur = phase.duration;
    storm.timer -= dt;
    const t = 1 - Math.max(0, storm.timer / totalDur);

    storm.cx = storm.cx + (storm.tx - storm.cx) * dt / Math.max(0.1, storm.timer);
    storm.cy = storm.cy + (storm.ty - storm.cy) * dt / Math.max(0.1, storm.timer);
    storm.cr = lerp(storm.cr, storm.tr, dt / Math.max(0.1, storm.timer));

    if (storm.timer <= 0) {
      storm.shrinking = false;
      storm.phase++;
      if (storm.phase < STORM_PHASES.length) {
        storm.timer = STORM_PHASES[storm.phase].waitTime;
      } else {
        storm.timer = 999;
      }
      storm.warningShown = false;
    }
  } else {
    storm.timer -= dt;
    if (storm.timer <= 10 && !storm.warningShown) {
      storm.warningShown = true;
      showStormWarning();
    }
    if (storm.timer <= 0) {
      const phase = STORM_PHASES[Math.min(storm.phase, STORM_PHASES.length - 1)];
      storm.shrinking = true;
      storm.timer = phase.duration;
      storm.tx = (Math.random() - 0.5) * storm.cr * 0.4;
      storm.ty = (Math.random() - 0.5) * storm.cr * 0.4;
      storm.tr = phase.targetRadius;
      storm.damage = phase.damage;
    }
  }

  // Storm damage to player
  const distPlayer = Math.hypot(player.x - storm.cx, player.y - storm.cy);
  if (distPlayer > storm.cr && player.alive) {
    player.takeDamage(storm.damage * (1/60)); // per frame approx
  }

  // Storm damage to enemies
  enemies.forEach(e => {
    if (!e.alive) return;
    const dist = Math.hypot(e.x - storm.cx, e.y - storm.cy);
    if (dist > storm.cr) {
      e.hp -= storm.damage * (1/60);
      if (e.hp <= 0) { e.alive = false; }
    }
  });

  // Update storm timer display
  const timerEl = document.getElementById('storm-timer');
  if (timerEl) {
    if (storm.shrinking) {
      timerEl.textContent = `Sturm zieht sich zusammen...`;
    } else {
      timerEl.textContent = `Nächste Phase: ${Math.ceil(storm.timer)}s`;
    }
  }
}

function updateBullets(dt) {
  const toRemove = [];
  bullets.forEach((b, i) => {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    if (b.life <= 0) { toRemove.push(i); return; }

    // Player bullet hits enemies
    if (b.owner === 'player') {
      for (const e of enemies) {
        if (!e.alive) continue;
        const dist = Math.hypot(b.x - e.x, b.y - e.y);
        if (dist < e.radius + b.radius) {
          const killed = e.takeDamage(b.damage);
          spawnHitParticles(b.x, b.y, '#ef4444');
          showDamageNumber(b.x, b.y, b.damage, b.crit);
          if (killed) {
            player.kills++;
            addKillFeedEntry('Du', e.name, '🔫');
            spawnDeathParticles(e.x, e.y);
          }
          toRemove.push(i);
          break;
        }
      }
    }

    // Enemy bullet hits player
    if (b.owner === 'enemy' && player.alive) {
      const dist = Math.hypot(b.x - player.x, b.y - player.y);
      if (dist < player.radius + b.radius) {
        player.takeDamage(b.damage);
        spawnHitParticles(b.x, b.y, '#60a5fa');
        toRemove.push(i);
      }
    }
  });

  bullets = bullets.filter((_, i) => !toRemove.includes(i));
}

function updateBotCombat(dt) {
  // Bots occasionally shoot each other
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (!b.alive) continue;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist < 200 && Math.random() < 0.002) {
        const dmg = 10 + Math.floor(Math.random() * 10);
        if (Math.random() < 0.5) {
          const killed = b.takeDamage(dmg);
          if (killed) addKillFeedEntry(a.name, b.name, '🔫');
        } else {
          const killed = a.takeDamage(dmg);
          if (killed) addKillFeedEntry(b.name, a.name, '🔫');
        }
      }
    }
  }
}

function checkPickups() {
  pickups.forEach(p => {
    if (p.collected) return;
    const dist = Math.hypot(p.x - player.x, p.y - player.y);
    if (dist < player.radius + p.radius) {
      p.collected = true;
      switch (p.type) {
        case 'medkit':    player.heal(50);       showXPNotif('+10 HP'); break;
        case 'shield':    player.addShield(50);  showXPNotif('+50 Schild'); break;
        case 'shield_small': player.addShield(25); showXPNotif('+25 Schild'); break;
        case 'ammo':
          player.ammoReserve = Math.min(999, player.ammoReserve + 30);
          showXPNotif('+30 Munition');
          break;
      }
    }
  });
}

function lerp(a, b, t) { return a + (b - a) * Math.clamp01(t); }
Math.clamp01 = t => Math.max(0, Math.min(1, t));

function spawnHitParticles(x, y, color) {
  for (let i = 0; i < 5; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 200,
      vy: (Math.random() - 0.5) * 200,
      color,
      life: 0.3 + Math.random() * 0.3,
      maxLife: 0.6,
      size: 2 + Math.random() * 3
    });
  }
}

function spawnDeathParticles(x, y) {
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    particles.push({
      x, y,
      vx: Math.cos(angle) * (100 + Math.random() * 150),
      vy: Math.sin(angle) * (100 + Math.random() * 150),
      color: '#ef4444',
      life: 0.8 + Math.random() * 0.5,
      maxLife: 1.3,
      size: 3 + Math.random() * 5
    });
  }
}

function updateHUD() {
  document.getElementById('health-bar').style.width = `${player.hp}%`;
  document.getElementById('health-value').textContent = Math.ceil(player.hp);
  document.getElementById('shield-bar').style.width = `${(player.shield / player.maxShield) * 100}%`;
  document.getElementById('shield-value').textContent = Math.ceil(player.shield);
  document.getElementById('ammo-current').textContent = player.reloading ? 'NACHLADEN...' : player.ammo;
  document.getElementById('ammo-reserve').textContent = player.ammoReserve;
  document.getElementById('kill-count').textContent = player.kills;
  document.getElementById('player-count').textContent = enemies.filter(e => e.alive).length + (player.alive ? 1 : 0);
  const w = player.weapons[player.currentWeapon];
  document.getElementById('weapon-icon').textContent = w.icon;
  document.getElementById('weapon-name').textContent = w.name;
}

// ─── RENDERING ───────────────────────────────────────────────────────────────

function render() {
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const cam = { x: player.x - W / 2, y: player.y - H / 2 };

  ctx.fillStyle = '#0a1a0a';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  drawMap(ctx, cam, W, H);
  drawPickups(ctx);
  drawStorm(ctx);

  // Draw enemies
  enemies.forEach(e => e.draw(ctx));

  // Draw player
  player.draw(ctx);

  // Draw bullets
  drawBullets(ctx);

  // Draw particles
  drawParticles(ctx);

  ctx.restore();

  drawMinimap(cam);
}

function drawMap(ctx, cam, W, H) {
  const tileColors = {
    grass: ['#2d5a1b', '#3a6b22', '#234815'],
    dirt: ['#7a5c3a', '#8a6a45', '#6a4f30'],
    stone: ['#5a5a6a', '#6a6a7a', '#4a4a5a']
  };

  // Only draw visible tiles
  const startTX = Math.floor((cam.x - W) / TILE_SIZE);
  const endTX = Math.ceil((cam.x + W + W) / TILE_SIZE);
  const startTY = Math.floor((cam.y - H) / TILE_SIZE);
  const endTY = Math.ceil((cam.y + H + H) / TILE_SIZE);

  for (let tx = startTX; tx <= endTX; tx++) {
    for (let ty = startTY; ty <= endTY; ty++) {
      const wx = tx * TILE_SIZE;
      const wy = ty * TILE_SIZE;
      const noise = Math.sin(tx * 0.3) * Math.cos(ty * 0.3) + Math.sin(tx * 0.7 + ty * 0.5) * 0.5;
      const type = noise > 0.6 ? 'stone' : noise > 0.2 ? 'dirt' : 'grass';
      const colors = tileColors[type];
      const ci = ((tx * 3 + ty * 7) & 0xFFFF) % colors.length;
      ctx.fillStyle = colors[ci];
      ctx.fillRect(wx, wy, TILE_SIZE + 1, TILE_SIZE + 1);
    }
  }

  // Grid lines (very faint)
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 0.5;
  for (let tx = startTX; tx <= endTX; tx++) {
    ctx.beginPath();
    ctx.moveTo(tx * TILE_SIZE, startTY * TILE_SIZE);
    ctx.lineTo(tx * TILE_SIZE, endTY * TILE_SIZE);
    ctx.stroke();
  }

  // Draw map objects
  mapObjects.forEach(obj => {
    if (obj.x < cam.x - 60 || obj.x > cam.x + W + 60) return;
    if (obj.y < cam.y - 60 || obj.y > cam.y + H + 60) return;
    drawMapObject(ctx, obj);
  });
}

function drawMapObject(ctx, obj) {
  ctx.save();
  ctx.translate(obj.x, obj.y);

  switch (obj.type) {
    case 'tree':
      ctx.fillStyle = '#1a3a0a';
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2d5a1b';
      ctx.beginPath();
      ctx.arc(-3, -3, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(-4, 8, 8, 12);
      break;

    case 'rock':
      ctx.fillStyle = '#4a4a5a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 24, 16, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6a6a7a';
      ctx.beginPath();
      ctx.ellipse(-4, -4, 16, 10, 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'bush':
      ctx.fillStyle = '#1e4a10';
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2d6a1b';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 10, Math.sin(a) * 8, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case 'house':
      ctx.fillStyle = '#6b5a3a';
      ctx.fillRect(-obj.w/2, -obj.h/2, obj.w, obj.h);
      ctx.fillStyle = '#8a7050';
      ctx.fillRect(-obj.w/2, -obj.h/2, obj.w, 8);
      ctx.fillStyle = '#4a3a25';
      ctx.beginPath();
      ctx.moveTo(-obj.w/2 - 4, -obj.h/2);
      ctx.lineTo(0, -obj.h/2 - 20);
      ctx.lineTo(obj.w/2 + 4, -obj.h/2);
      ctx.fill();
      // Door
      ctx.fillStyle = '#2a1a0a';
      ctx.fillRect(-8, obj.h/2 - 20, 16, 20);
      // Windows
      ctx.fillStyle = '#90cff0';
      ctx.fillRect(-obj.w/2 + 10, -10, 14, 14);
      ctx.fillRect(obj.w/2 - 24, -10, 14, 14);
      break;
  }
  ctx.restore();
}

function drawPickups(ctx) {
  pickups.forEach(p => {
    if (p.collected) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    const bob = Math.sin(Date.now() / 400) * 3;
    ctx.translate(0, bob);

    const colors = { medkit: '#ef4444', shield: '#3b82f6', shield_small: '#60a5fa', ammo: '#f59e0b' };
    const icons = { medkit: '➕', shield: '🛡️', shield_small: '🛡️', ammo: '📦' };

    ctx.fillStyle = colors[p.type] || '#fff';
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors[p.type] || '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icons[p.type] || '?', 0, 0);

    ctx.restore();
  });
}

function drawStorm(ctx) {
  // Storm outside = purple overlay
  ctx.save();
  ctx.fillStyle = 'rgba(138,43,226,0.25)';
  ctx.fillRect(-WORLD_SIZE, -WORLD_SIZE, WORLD_SIZE * 3, WORLD_SIZE * 3);

  // Clear the safe zone
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(storm.cx, storm.cy, storm.cr, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Storm border glow
  ctx.strokeStyle = 'rgba(180,50,255,0.8)';
  ctx.lineWidth = 6;
  ctx.shadowBlur = 20;
  ctx.shadowColor = 'rgba(180,50,255,0.6)';
  ctx.beginPath();
  ctx.arc(storm.cx, storm.cy, storm.cr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawBullets(ctx) {
  bullets.forEach(b => {
    ctx.save();
    ctx.fillStyle = b.owner === 'player' ? '#fbbf24' : '#f87171';
    ctx.shadowBlur = 8;
    ctx.shadowColor = ctx.fillStyle;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  });
}

function drawParticles(ctx) {
  particles.forEach(p => {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawMinimap(cam) {
  const mCtx = minimapCtx;
  const mSize = 150;
  const scale = mSize / WORLD_SIZE;

  mCtx.fillStyle = '#0a1a0a';
  mCtx.fillRect(0, 0, mSize, mSize);

  // Storm
  mCtx.fillStyle = 'rgba(138,43,226,0.4)';
  mCtx.fillRect(0, 0, mSize, mSize);
  mCtx.globalCompositeOperation = 'destination-out';
  mCtx.beginPath();
  const scx = (storm.cx + WORLD_SIZE/2) * scale;
  const scy = (storm.cy + WORLD_SIZE/2) * scale;
  mCtx.arc(scx, scy, storm.cr * scale, 0, Math.PI * 2);
  mCtx.fill();
  mCtx.globalCompositeOperation = 'source-over';

  // Enemies
  mCtx.fillStyle = '#ef4444';
  enemies.forEach(e => {
    if (!e.alive) return;
    const ex = (e.x + WORLD_SIZE/2) * scale;
    const ey = (e.y + WORLD_SIZE/2) * scale;
    mCtx.fillRect(ex - 2, ey - 2, 4, 4);
  });

  // Pickups
  mCtx.fillStyle = '#22c55e';
  pickups.forEach(p => {
    if (p.collected) return;
    const px = (p.x + WORLD_SIZE/2) * scale;
    const py = (p.y + WORLD_SIZE/2) * scale;
    mCtx.fillRect(px - 1, py - 1, 3, 3);
  });

  // Player
  const plx = (player.x + WORLD_SIZE/2) * scale;
  const ply = (player.y + WORLD_SIZE/2) * scale;
  mCtx.fillStyle = '#fff';
  mCtx.beginPath();
  mCtx.arc(plx, ply, 4, 0, Math.PI * 2);
  mCtx.fill();

  // Player direction
  mCtx.strokeStyle = '#fff';
  mCtx.lineWidth = 1.5;
  mCtx.beginPath();
  mCtx.moveTo(plx, ply);
  mCtx.lineTo(plx + Math.cos(player.angle) * 8, ply + Math.sin(player.angle) * 8);
  mCtx.stroke();

  // Border
  mCtx.strokeStyle = 'rgba(255,255,255,0.3)';
  mCtx.lineWidth = 1;
  mCtx.strokeRect(0, 0, mSize, mSize);
}

function endGame(won) {
  gameState = won ? 'won' : 'dead';
  cancelAnimationFrame(animFrame);

  const elapsed = (Date.now() - startTime) / 1000;
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

  const xpEarned = player.kills * 200 + (won ? 1000 : 50) + Math.floor(elapsed * 2);

  const notifications = addXP(xpEarned);
  saveData.kills += player.kills;
  if (won) saveData.wins++;
  saveSaveData(saveData);

  updateMenuStats();

  if (won) {
    document.getElementById('win-kills').textContent = player.kills;
    document.getElementById('win-time').textContent = timeStr;
    document.getElementById('win-xp').textContent = `+${xpEarned}`;
    showScreen('win-screen');
    notifications.forEach(n => {
      if (n.type === 'levelup') showLevelUpNotification(n.level);
    });
  } else {
    const alive = enemies.filter(e => e.alive).length;
    document.getElementById('death-placement').textContent = `#${alive + 1}`;
    document.getElementById('death-kills').textContent = player.kills;
    document.getElementById('death-time').textContent = timeStr;
    document.getElementById('death-xp').textContent = `+${xpEarned}`;
    showScreen('death-screen');
    notifications.forEach(n => {
      if (n.type === 'levelup') showLevelUpNotification(n.level);
    });
  }

  // Remove input listeners to avoid leaks
  window.removeEventListener('resize', resizeCanvas);
}

function showStormWarning() {
  const el = document.getElementById('storm-warning');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}
