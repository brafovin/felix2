// Core game loop
const WORLD_SIZE = 3000;
const INITIAL_PLAYERS = 40;
const TILE_SIZE = 100;

let canvas, ctx, minimap, minimapCtx;
let player, enemies, bullets, pickups, particles;
let keys = {};
let mouseX = 0, mouseY = 0, shooting = false;
let gameState = 'menu'; // menu | bus | gliding | playing | dead | won
let gameTime = 0;
let startTime = 0;
let animFrame;

// Map
let mapObjects = [];

// Battle Bus
let bus = null;
let playerAlt = 0;
let gliderOpen = false;
let freefallTimer = 0;

// Storm
let storm = {
  cx: 0, cy: 0,
  cr: WORLD_SIZE * 0.6,
  tx: 0, ty: 0,
  tr: 0,
  shrinking: false,
  timer: 30,
  phase: 0,
  damage: 2,
  warningShown: false
};

const STORM_PHASES = [
  { waitTime: 60, targetRadius: 1200, duration: 30, damage: 2 },
  { waitTime: 45, targetRadius: 700,  duration: 25, damage: 3 },
  { waitTime: 35, targetRadius: 400,  duration: 20, damage: 5 },
  { waitTime: 25, targetRadius: 200,  duration: 15, damage: 8 },
  { waitTime: 20, targetRadius: 80,   duration: 12, damage: 12 },
];

// ─── MAP GENERATION ──────────────────────────────────────────────────────────

function generateMap() {
  mapObjects = [];
  for (let i = 0; i < 300; i++) {
    const x = (Math.random() - 0.5) * WORLD_SIZE;
    const y = (Math.random() - 0.5) * WORLD_SIZE;
    const r = Math.random();
    if      (r < 0.50) mapObjects.push({ x, y, type: 'tree',  radius: 20, hp: 80  });
    else if (r < 0.70) mapObjects.push({ x, y, type: 'rock',  radius: 24, hp: 150 });
    else if (r < 0.85) mapObjects.push({ x, y, type: 'bush',  radius: 18, hp: 30  });
    else               mapObjects.push({ x, y, type: 'house', w: 90, h: 70, hp: 250 });
  }
}

function spawnPickups() {
  pickups = [];
  const types = ['medkit', 'shield', 'ammo', 'shield_small'];
  for (let i = 0; i < 80; i++) {
    pickups.push({
      x: (Math.random() - 0.5) * WORLD_SIZE,
      y: (Math.random() - 0.5) * WORLD_SIZE,
      type: types[Math.floor(Math.random() * types.length)],
      radius: 12,
      collected: false
    });
  }
}

// ─── GAME START ───────────────────────────────────────────────────────────────

function startGame() {
  showScreen('game-screen');

  canvas       = document.getElementById('game-canvas');
  ctx          = canvas.getContext('2d');
  minimap      = document.getElementById('minimap');
  minimapCtx   = minimap.getContext('2d');

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  generateMap();
  spawnPickups();

  player  = new Player(0, 0, getCurrentSkin());
  enemies = spawnEnemies(INITIAL_PLAYERS - 1, WORLD_SIZE, 0, 0);
  bullets = [];
  particles = [];

  // ── Battle Bus path ───────────────────────────────────────────
  const angle   = (Math.random() * 0.5 - 0.25);           // slight random tilt
  const pathLen = WORLD_SIZE + 700;
  const offX    = (Math.random() - 0.5) * 300;
  const offY    = (Math.random() - 0.5) * 300;

  bus = {
    x:      offX - Math.cos(angle) * pathLen / 2,
    y:      offY - Math.sin(angle) * pathLen / 2,
    startX: offX - Math.cos(angle) * pathLen / 2,
    startY: offY - Math.sin(angle) * pathLen / 2,
    endX:   offX + Math.cos(angle) * pathLen / 2,
    endY:   offY + Math.sin(angle) * pathLen / 2,
    angle,
    speed: 270,
    totalDist: pathLen,
    distTraveled: 0,
    progress: 0,
    playerJumped: false,
    exhaustTimer: 0,
    propAngle: 0
  };

  // Assign a point along the path where each bot "jumps off"
  const half = WORLD_SIZE / 2;
  enemies.forEach((e, i) => {
    const t  = Math.max(0.04, Math.min(0.96, 0.04 + (i / enemies.length) * 0.92 + (Math.random()-0.5)*0.04));
    e.busJumpT  = t;
    e.busLandX  = Math.max(-half, Math.min(half, bus.startX + (bus.endX - bus.startX) * t + (Math.random()-0.5)*280));
    e.busLandY  = Math.max(-half, Math.min(half, bus.startY + (bus.endY - bus.startY) * t + (Math.random()-0.5)*280));
    e.activated = false;
  });

  // Player rides the bus
  player.x = bus.x;
  player.y = bus.y;

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

  gameTime     = 0;
  startTime    = Date.now();
  playerAlt    = 0;
  gliderOpen   = false;
  freefallTimer = 0;
  gameState    = 'bus';
  keys         = {};
  shooting     = false;

  setupInput();

  if (animFrame) cancelAnimationFrame(animFrame);
  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime  = now;
    update(dt);
    render();
    animFrame = requestAnimationFrame(loop);
  }
  animFrame = requestAnimationFrame(loop);
}

function jumpFromBus() {
  if (!bus || bus.playerJumped) return;
  bus.playerJumped = true;
  playerAlt    = 700;
  gliderOpen   = false;
  freefallTimer = 0;
  gameState    = 'gliding';
}

function resizeCanvas() {
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

// ─── INPUT ────────────────────────────────────────────────────────────────────

function setupInput() {
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup',   onKeyUp);
  canvas.addEventListener('mousemove',     onMouseMove);
  canvas.addEventListener('mousedown',     onMouseDown);
  canvas.addEventListener('mouseup',       onMouseUp);
  canvas.addEventListener('contextmenu',   e => e.preventDefault());
}

function teardownInput() {
  document.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('keyup',   onKeyUp);
  if (canvas) {
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('mouseup',   onMouseUp);
  }
}

function onKeyDown(e) {
  keys[e.code] = true;
  if (e.code === 'Space') {
    e.preventDefault();
    if (gameState === 'bus') jumpFromBus();
  }
}
function onKeyUp(e)      { keys[e.code] = false; }
function onMouseMove(e)  { mouseX = e.clientX; mouseY = e.clientY; }
function onMouseDown(e)  { if (e.button === 0) shooting = true;  }
function onMouseUp(e)    { if (e.button === 0) shooting = false; }

// ─── MAIN UPDATE ─────────────────────────────────────────────────────────────

function update(dt) {
  if (gameState === 'bus') {
    updateBus(dt);
    tickParticles(dt);
    return;
  }
  if (gameState === 'gliding') {
    updateGliding(dt);
    tickParticles(dt);
    return;
  }
  if (gameState !== 'playing') return;

  gameTime += dt;

  player.update(dt, keys, mouseX, mouseY);
  if (shooting) player.tryShoot(bullets);

  const half = WORLD_SIZE / 2;
  player.x = Math.max(-half, Math.min(half, player.x));
  player.y = Math.max(-half, Math.min(half, player.y));

  updateStorm(dt);

  enemies.forEach(e => {
    if (e.alive && e.activated) {
      e.update(dt, player, enemies, WORLD_SIZE, { x: storm.cx, y: storm.cy }, storm.cr, bullets);
    }
  });

  updateBullets(dt);
  tickParticles(dt);
  checkPickups();
  updateBotCombat(dt);
  updateHUD();

  const alive = enemies.filter(e => e.alive).length;
  if (!player.alive)  endGame(false);
  else if (alive === 0) endGame(true);
}

// ─── BUS UPDATE ───────────────────────────────────────────────────────────────

function updateBus(dt) {
  bus.propAngle += dt * 12;

  // Exhaust clouds
  bus.exhaustTimer -= dt;
  if (bus.exhaustTimer <= 0) {
    bus.exhaustTimer = 0.18;
    const ex = bus.x - Math.cos(bus.angle) * 82;
    const ey = bus.y - Math.sin(bus.angle) * 82;
    for (let i = 0; i < 2; i++) {
      particles.push({
        x: ex + (Math.random()-0.5)*8,
        y: ey + (Math.random()-0.5)*8,
        vx: -Math.cos(bus.angle)*22 + (Math.random()-0.5)*18,
        vy: -Math.sin(bus.angle)*22 + (Math.random()-0.5)*18,
        color: '#94a3b8',
        life: 1.4 + Math.random()*0.8,
        maxLife: 2.2,
        size: 10 + Math.random()*6
      });
    }
  }

  // Advance bus along path
  const moveDist = bus.speed * dt;
  const nx = (bus.endX - bus.startX) / bus.totalDist;
  const ny = (bus.endY - bus.startY) / bus.totalDist;
  bus.x += nx * moveDist;
  bus.y += ny * moveDist;
  bus.distTraveled += moveDist;
  bus.progress      = bus.distTraveled / bus.totalDist;

  // Drop enemies as bus passes their jump-point
  enemies.forEach(e => {
    if (!e.activated && bus.progress >= e.busJumpT) {
      e.activated = true;
      e.x = e.busLandX;
      e.y = e.busLandY;
    }
  });

  // Keep player glued to bus
  if (!bus.playerJumped) {
    player.x = bus.x + 12;
    player.y = bus.y + 4;
  }

  // Force jump when bus is about to leave the map
  if (bus.progress >= 0.95 && !bus.playerJumped) jumpFromBus();
}

// ─── GLIDING UPDATE ───────────────────────────────────────────────────────────

function updateGliding(dt) {
  freefallTimer += dt;

  // Freefall until glider opens
  const fallSpeed = gliderOpen ? 110 : 380;
  playerAlt = Math.max(0, playerAlt - fallSpeed * dt);

  if (!gliderOpen && freefallTimer >= 1.5) gliderOpen = true;

  // Steer with WASD
  let dx = 0, dy = 0;
  if (keys['KeyW'] || keys['ArrowUp'])    dy -= 1;
  if (keys['KeyS'] || keys['ArrowDown'])  dy += 1;
  if (keys['KeyA'] || keys['ArrowLeft'])  dx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) dx += 1;
  if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
  const glideSpeed = gliderOpen ? 240 : 60;
  player.x += dx * glideSpeed * dt;
  player.y += dy * glideSpeed * dt;

  const half = WORLD_SIZE / 2;
  player.x = Math.max(-half, Math.min(half, player.x));
  player.y = Math.max(-half, Math.min(half, player.y));

  // Landed!
  if (playerAlt <= 0) {
    playerAlt  = 0;
    gliderOpen = false;
    gameState  = 'playing';

    // Activate any enemies not yet placed
    enemies.forEach(e => {
      if (!e.activated) {
        e.activated = true;
        e.x = (Math.random()-0.5) * WORLD_SIZE;
        e.y = (Math.random()-0.5) * WORLD_SIZE;
      }
    });

    // Landing dust burst
    for (let i = 0; i < 22; i++) {
      const a = (i/22) * Math.PI * 2;
      particles.push({
        x: player.x, y: player.y,
        vx: Math.cos(a) * (70 + Math.random()*90),
        vy: Math.sin(a) * (70 + Math.random()*90),
        color: ['#a3e635','#86efac','#bef264'][i%3],
        life: 0.5 + Math.random()*0.5,
        maxLife: 1.0,
        size: 3 + Math.random()*5
      });
    }
  }
}

function tickParticles(dt) {
  particles = particles.filter(p => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    return p.life > 0;
  });
}

// ─── STORM ───────────────────────────────────────────────────────────────────

function updateStorm(dt) {
  if (storm.shrinking) {
    storm.timer -= dt;
    storm.cx = storm.cx + (storm.tx - storm.cx) * dt / Math.max(0.1, storm.timer);
    storm.cy = storm.cy + (storm.ty - storm.cy) * dt / Math.max(0.1, storm.timer);
    storm.cr = lerp(storm.cr, storm.tr, dt / Math.max(0.1, storm.timer));

    if (storm.timer <= 0) {
      storm.shrinking = false;
      storm.phase++;
      storm.timer       = storm.phase < STORM_PHASES.length ? STORM_PHASES[storm.phase].waitTime : 999;
      storm.warningShown = false;
    }
  } else {
    storm.timer -= dt;
    if (storm.timer <= 10 && !storm.warningShown) {
      storm.warningShown = true;
      showStormWarning();
    }
    if (storm.timer <= 0) {
      const phase      = STORM_PHASES[Math.min(storm.phase, STORM_PHASES.length - 1)];
      storm.shrinking  = true;
      storm.timer      = phase.duration;
      storm.tx         = (Math.random()-0.5) * storm.cr * 0.4;
      storm.ty         = (Math.random()-0.5) * storm.cr * 0.4;
      storm.tr         = phase.targetRadius;
      storm.damage     = phase.damage;
    }
  }

  if (Math.hypot(player.x - storm.cx, player.y - storm.cy) > storm.cr && player.alive) {
    player.takeDamage(storm.damage * (1/60));
  }
  enemies.forEach(e => {
    if (!e.alive) return;
    if (Math.hypot(e.x - storm.cx, e.y - storm.cy) > storm.cr) {
      e.hp -= storm.damage * (1/60);
      if (e.hp <= 0) e.alive = false;
    }
  });

  const timerEl = document.getElementById('storm-timer');
  if (timerEl) {
    timerEl.textContent = storm.shrinking
      ? 'Sturm zieht sich zusammen...'
      : `Nächste Phase: ${Math.ceil(storm.timer)}s`;
  }
}

// ─── BULLETS ─────────────────────────────────────────────────────────────────

function updateBullets(dt) {
  const toRemove = new Set();
  bullets.forEach((b, i) => {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { toRemove.add(i); return; }

    if (b.owner === 'player') {
      for (const e of enemies) {
        if (!e.alive || !e.activated) continue;
        if (Math.hypot(b.x - e.x, b.y - e.y) < e.radius + b.radius) {
          const killed = e.takeDamage(b.damage);
          spawnHitParticles(b.x, b.y, '#ef4444');
          showDamageNumber(b.x, b.y, b.damage, b.crit);
          if (killed) {
            player.kills++;
            addKillFeedEntry('Du', e.name, '🔫');
            spawnDeathParticles(e.x, e.y);
          }
          toRemove.add(i);
          break;
        }
      }
    }
    if (b.owner === 'enemy' && player.alive) {
      if (Math.hypot(b.x - player.x, b.y - player.y) < player.radius + b.radius) {
        player.takeDamage(b.damage);
        spawnHitParticles(b.x, b.y, '#60a5fa');
        toRemove.add(i);
      }
    }
  });
  bullets = bullets.filter((_, i) => !toRemove.has(i));
}

function updateBotCombat(dt) {
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (!a.alive || !a.activated) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (!b.alive || !b.activated) continue;
      if (Math.hypot(a.x-b.x, a.y-b.y) < 200 && Math.random() < 0.002) {
        const dmg = 10 + Math.floor(Math.random()*10);
        if (Math.random() < 0.5) { if (b.takeDamage(dmg)) addKillFeedEntry(a.name, b.name, '🔫'); }
        else                     { if (a.takeDamage(dmg)) addKillFeedEntry(b.name, a.name, '🔫'); }
      }
    }
  }
}

function checkPickups() {
  pickups.forEach(p => {
    if (p.collected) return;
    if (Math.hypot(p.x-player.x, p.y-player.y) < player.radius + p.radius) {
      p.collected = true;
      switch (p.type) {
        case 'medkit':      player.heal(50);       showXPNotif('+50 HP');       break;
        case 'shield':      player.addShield(50);  showXPNotif('+50 Schild');   break;
        case 'shield_small':player.addShield(25);  showXPNotif('+25 Schild');   break;
        case 'ammo':
          player.ammoReserve = Math.min(999, player.ammoReserve+30);
          showXPNotif('+30 Munition');
          break;
      }
    }
  });
}

function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

function spawnHitParticles(x, y, color) {
  for (let i = 0; i < 5; i++) particles.push({
    x, y,
    vx: (Math.random()-0.5)*200, vy: (Math.random()-0.5)*200,
    color, life: 0.3+Math.random()*0.3, maxLife: 0.6, size: 2+Math.random()*3
  });
}

function spawnDeathParticles(x, y) {
  for (let i = 0; i < 16; i++) {
    const a = (i/16)*Math.PI*2;
    particles.push({
      x, y,
      vx: Math.cos(a)*(100+Math.random()*150), vy: Math.sin(a)*(100+Math.random()*150),
      color: '#ef4444', life: 0.8+Math.random()*0.5, maxLife: 1.3, size: 3+Math.random()*5
    });
  }
}

function updateHUD() {
  const hud = document.getElementById('hud');
  if (gameState === 'bus' || gameState === 'gliding') {
    hud.style.opacity = '0';
    return;
  }
  hud.style.opacity = '1';
  document.getElementById('health-bar').style.width   = `${player.hp}%`;
  document.getElementById('health-value').textContent = Math.ceil(player.hp);
  document.getElementById('shield-bar').style.width   = `${(player.shield/player.maxShield)*100}%`;
  document.getElementById('shield-value').textContent = Math.ceil(player.shield);
  document.getElementById('ammo-current').textContent = player.reloading ? 'LADEN...' : player.ammo;
  document.getElementById('ammo-reserve').textContent = player.ammoReserve;
  document.getElementById('kill-count').textContent   = player.kills;
  document.getElementById('player-count').textContent =
    enemies.filter(e => e.alive).length + (player.alive ? 1 : 0);
  const w = player.weapons[player.currentWeapon];
  document.getElementById('weapon-icon').textContent = w.icon;
  document.getElementById('weapon-name').textContent = w.name;
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

function render() {
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;

  ctx.fillStyle = '#0a1a0a';
  ctx.fillRect(0, 0, W, H);

  // Camera setup based on state
  let focusX, focusY, zoom;
  if (gameState === 'bus') {
    focusX = bus.x;
    focusY = bus.y;
    zoom   = 0.6;
  } else if (gameState === 'gliding') {
    focusX = player.x;
    focusY = player.y;
    zoom   = 0.45 + 0.55 * (1 - playerAlt / 700);
  } else {
    focusX = player.x;
    focusY = player.y;
    zoom   = 1.0;
  }

  // Culling rect in world space
  const camW = W / zoom;
  const camH = H / zoom;
  const camL = focusX - camW / 2;
  const camT = focusY - camH / 2;

  ctx.save();
  ctx.translate(W/2, H/2);
  ctx.scale(zoom, zoom);
  ctx.translate(-focusX, -focusY);

  drawMap(ctx, camL, camT, camW, camH);
  drawPickups(ctx, camL, camT, camW, camH);
  drawStorm(ctx);

  enemies.forEach(e => { if (e.alive && e.activated) e.draw(ctx); });

  // Draw bus (visible during bus + early glide)
  if (bus && gameState !== 'playing') drawBus(ctx);

  if (gameState !== 'bus') {
    if (gameState === 'gliding') drawGlider(ctx, player.x, player.y);
    player.draw(ctx);
  }

  drawBullets(ctx);
  drawParticles(ctx);

  ctx.restore();

  // Screen-space overlays
  if (gameState === 'bus' || gameState === 'gliding') drawBusPhaseHUD(W, H);
  drawMinimap();
}

// ─── BUS DRAWING ─────────────────────────────────────────────────────────────

function drawBus(ctx) {
  ctx.save();
  ctx.translate(bus.x, bus.y);
  ctx.rotate(bus.angle);

  const py = -62; // balloon center Y

  // ── Balloon ──
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.ellipse(0, py, 72, 40, 0, 0, Math.PI*2);
  ctx.fill();

  // Balloon panel lines
  ctx.strokeStyle = 'rgba(180,100,0,0.5)';
  ctx.lineWidth = 1.5;
  for (let i = -2; i <= 2; i++) {
    ctx.save();
    ctx.scale(1, 1);
    ctx.beginPath();
    const panelX = i * 22;
    ctx.moveTo(panelX, py - 40);
    ctx.quadraticCurveTo(panelX + 8, py, panelX, py + 40);
    ctx.stroke();
    ctx.restore();
  }

  // Balloon sheen
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(-22, py - 14, 28, 14, -0.4, 0, Math.PI*2);
  ctx.fill();

  // Balloon text
  ctx.fillStyle = '#7c2d12';
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BATTLE BUS', 0, py);

  // ── Chains ──
  ctx.strokeStyle = '#78716c';
  ctx.lineWidth = 1.5;
  [-44, -22, 0, 22, 44].forEach(cx2 => {
    ctx.beginPath();
    ctx.moveTo(cx2, py + 40);
    ctx.lineTo(cx2 * 0.8, -24);
    ctx.stroke();
  });

  // ── Bus body ──
  ctx.fillStyle = '#1d4ed8';
  ctx.beginPath();
  ctx.roundRect(-68, -24, 136, 48, 6);
  ctx.fill();

  // Side stripe
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(-68, -6, 136, 12);

  // Roof
  ctx.fillStyle = '#1e3a8a';
  ctx.beginPath();
  ctx.roundRect(-63, -24, 126, 8, 3);
  ctx.fill();

  // Front section
  ctx.fillStyle = '#1e3a8a';
  ctx.beginPath();
  ctx.roundRect(56, -22, 12, 44, 4);
  ctx.fill();

  // Headlights
  ctx.fillStyle = '#fef9c3';
  ctx.shadowBlur = 8;
  ctx.shadowColor = '#fef08a';
  ctx.fillRect(64, -16, 7, 9);
  ctx.fillRect(64,  7,  7, 9);
  ctx.shadowBlur = 0;

  // Windows
  ctx.fillStyle = '#bae6fd';
  for (let wx = -52; wx <= 42; wx += 24) {
    ctx.beginPath();
    ctx.roundRect(wx, -18, 18, 20, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(wx+1, -17, 5, 5);
    ctx.fillStyle = '#bae6fd';
  }

  // ── Propeller (front, rotating) ──
  ctx.save();
  ctx.translate(72, 0);
  ctx.rotate(bus.propAngle);
  ctx.fillStyle = '#94a3b8';
  for (let b2 = 0; b2 < 3; b2++) {
    ctx.save();
    ctx.rotate((b2/3) * Math.PI*2);
    ctx.beginPath();
    ctx.ellipse(0, -12, 3, 12, 0.2, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  // ── Player hanging from bus (only during bus phase) ──
  if (gameState === 'bus') {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(8, 24);
    ctx.lineTo(8, 55);
    ctx.stroke();
    ctx.setLineDash([]);

    // Tiny player silhouette
    const skin = player.skin;
    ctx.save();
    ctx.translate(8, 62);
    ctx.scale(0.45, 0.45);
    drawSkinOnCanvas(ctx, skin, 0, 0, 1, false);
    ctx.restore();
  }

  ctx.restore();
}

// ─── GLIDER DRAWING ───────────────────────────────────────────────────────────

function drawGlider(ctx, x, y) {
  if (!gliderOpen || playerAlt <= 0) return;

  ctx.save();
  ctx.translate(x, y);

  const gH = 55, gW = 78;
  const skinColor = player.skin ? player.skin.colors.body : '#3b82f6';

  // Suspension lines
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth   = 1;
  [[-gW/2, 0], [0, 0], [gW/2, 0]].forEach(([lx]) => {
    ctx.beginPath();
    ctx.moveTo((Math.random()*4-2), -20);
    ctx.lineTo(lx, -gH - 20);
    ctx.stroke();
  });

  // Canopy
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.ellipse(0, -gH - 20, gW/2, 22, 0, Math.PI, 0);
  ctx.fill();

  // Canopy panel dividers
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth   = 1.5;
  for (let s = -2; s <= 2; s++) {
    const sx = s * (gW / 4);
    ctx.beginPath();
    ctx.moveTo(sx, -gH - 20);
    ctx.lineTo(sx, -gH - 42);
    ctx.stroke();
  }

  // Canopy highlight
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.ellipse(-18, -gH - 32, 20, 10, -0.3, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}

// ─── BUS PHASE HUD ───────────────────────────────────────────────────────────

function drawBusPhaseHUD(W, H) {
  ctx.save();
  ctx.textAlign = 'center';

  if (gameState === 'bus') {
    // Prompt box
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.beginPath();
    ctx.roundRect(W/2 - 220, H - 115, 440, 84, 10);
    ctx.fill();

    ctx.strokeStyle = 'rgba(251,191,36,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(W/2 - 220, H - 115, 440, 84, 10);
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 22px "Segoe UI", Arial';
    ctx.fillText('LEERTASTE — Abspringen!', W/2, H - 83);

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '13px Arial';
    ctx.fillText('Bus verlässt die Karte automatisch', W/2, H - 57);

    // Progress bar
    const bw = 200, bx = W/2 - bw/2, by = H - 44;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, 6, 3); ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.roundRect(bx, by, bw * Math.min(1, bus.progress), 6, 3); ctx.fill();

  } else if (gameState === 'gliding') {
    // Background box
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.beginPath();
    ctx.roundRect(W/2 - 130, H - 105, 260, 80, 8);
    ctx.fill();

    if (!gliderOpen) {
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 20px "Segoe UI", Arial';
      ctx.fillText('FREIER FALL! ↓', W/2, H - 78);
    } else {
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 20px "Segoe UI", Arial';
      ctx.fillText('🪂 Gleiter aktiv', W/2, H - 78);
    }

    // Altitude bar
    const pct = playerAlt / 700;
    const bw = 200, bx = W/2 - bw/2, by = H - 60;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, 10, 4); ctx.fill();
    ctx.fillStyle = gliderOpen ? '#22c55e' : '#ef4444';
    ctx.beginPath(); ctx.roundRect(bx, by, bw * pct, 10, 4); ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '11px Arial';
    ctx.fillText(`Höhe: ${Math.round(playerAlt)}m`, W/2, H - 42);
  }

  ctx.restore();
}

// ─── MAP DRAWING ─────────────────────────────────────────────────────────────

function drawMap(ctx, camL, camT, camW, camH) {
  const tileColors = {
    grass: ['#2d5a1b', '#3a6b22', '#234815'],
    dirt:  ['#7a5c3a', '#8a6a45', '#6a4f30'],
    stone: ['#5a5a6a', '#6a6a7a', '#4a4a5a']
  };

  const startTX = Math.floor(camL / TILE_SIZE) - 1;
  const endTX   = Math.ceil((camL + camW) / TILE_SIZE) + 1;
  const startTY = Math.floor(camT / TILE_SIZE) - 1;
  const endTY   = Math.ceil((camT + camH) / TILE_SIZE) + 1;

  for (let tx = startTX; tx <= endTX; tx++) {
    for (let ty = startTY; ty <= endTY; ty++) {
      const noise = Math.sin(tx*0.3)*Math.cos(ty*0.3) + Math.sin(tx*0.7+ty*0.5)*0.5;
      const type  = noise > 0.6 ? 'stone' : noise > 0.2 ? 'dirt' : 'grass';
      const ci    = Math.abs((tx*3 + ty*7)) % tileColors[type].length;
      ctx.fillStyle = tileColors[type][ci];
      ctx.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE+1, TILE_SIZE+1);
    }
  }

  // Faint grid
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 0.5;
  for (let tx = startTX; tx <= endTX; tx++) {
    ctx.beginPath();
    ctx.moveTo(tx*TILE_SIZE, startTY*TILE_SIZE);
    ctx.lineTo(tx*TILE_SIZE, endTY*TILE_SIZE);
    ctx.stroke();
  }

  mapObjects.forEach(obj => {
    if (obj.x < camL - 80 || obj.x > camL + camW + 80) return;
    if (obj.y < camT - 80 || obj.y > camT + camH + 80) return;
    drawMapObject(ctx, obj);
  });
}

function drawMapObject(ctx, obj) {
  ctx.save();
  ctx.translate(obj.x, obj.y);
  switch (obj.type) {
    case 'tree':
      ctx.fillStyle = '#1a3a0a';
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#2d5a1b';
      ctx.beginPath(); ctx.arc(-3, -3, 15, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(-4, 8, 8, 12);
      break;
    case 'rock':
      ctx.fillStyle = '#4a4a5a';
      ctx.beginPath(); ctx.ellipse(0, 0, 24, 16, 0.3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#6a6a7a';
      ctx.beginPath(); ctx.ellipse(-4, -4, 16, 10, 0.3, 0, Math.PI*2); ctx.fill();
      break;
    case 'bush':
      ctx.fillStyle = '#1e4a10';
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#2d6a1b';
      for (let i = 0; i < 5; i++) {
        const a = (i/5)*Math.PI*2;
        ctx.beginPath(); ctx.arc(Math.cos(a)*10, Math.sin(a)*8, 10, 0, Math.PI*2); ctx.fill();
      }
      break;
    case 'house':
      ctx.fillStyle = '#6b5a3a';
      ctx.fillRect(-obj.w/2, -obj.h/2, obj.w, obj.h);
      ctx.fillStyle = '#8a7050';
      ctx.fillRect(-obj.w/2, -obj.h/2, obj.w, 8);
      ctx.fillStyle = '#4a3a25';
      ctx.beginPath();
      ctx.moveTo(-obj.w/2-4, -obj.h/2); ctx.lineTo(0, -obj.h/2-20); ctx.lineTo(obj.w/2+4, -obj.h/2);
      ctx.fill();
      ctx.fillStyle = '#2a1a0a'; ctx.fillRect(-8, obj.h/2-20, 16, 20);
      ctx.fillStyle = '#90cff0';
      ctx.fillRect(-obj.w/2+10, -10, 14, 14);
      ctx.fillRect(obj.w/2-24, -10, 14, 14);
      break;
  }
  ctx.restore();
}

// ─── PICKUPS DRAWING ─────────────────────────────────────────────────────────

function drawPickups(ctx, camL, camT, camW, camH) {
  const t = Date.now() / 400;
  pickups.forEach(p => {
    if (p.collected) return;
    if (p.x < camL-20 || p.x > camL+camW+20 || p.y < camT-20 || p.y > camT+camH+20) return;
    const colors = { medkit:'#ef4444', shield:'#3b82f6', shield_small:'#60a5fa', ammo:'#f59e0b' };
    const icons  = { medkit:'➕', shield:'🛡️', shield_small:'🛡️', ammo:'📦' };
    ctx.save();
    ctx.translate(p.x, p.y + Math.sin(t + p.x)*3);
    ctx.fillStyle = colors[p.type] || '#fff';
    ctx.globalAlpha = 0.28;
    ctx.beginPath(); ctx.arc(0,0,p.radius,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors[p.type] || '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0,0,p.radius,0,Math.PI*2); ctx.stroke();
    ctx.font = '14px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(icons[p.type] || '?', 0, 0);
    ctx.restore();
  });
}

// ─── STORM DRAWING ───────────────────────────────────────────────────────────

function drawStorm(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(138,43,226,0.25)';
  ctx.fillRect(-WORLD_SIZE, -WORLD_SIZE, WORLD_SIZE*3, WORLD_SIZE*3);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(storm.cx, storm.cy, storm.cr, 0, Math.PI*2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(180,50,255,0.8)';
  ctx.lineWidth   = 6;
  ctx.shadowBlur  = 20;
  ctx.shadowColor = 'rgba(180,50,255,0.6)';
  ctx.beginPath(); ctx.arc(storm.cx, storm.cy, storm.cr, 0, Math.PI*2); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawBullets(ctx) {
  bullets.forEach(b => {
    ctx.save();
    ctx.fillStyle   = b.owner === 'player' ? '#fbbf24' : '#f87171';
    ctx.shadowBlur  = 8;
    ctx.shadowColor = ctx.fillStyle;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  });
}

function drawParticles(ctx) {
  particles.forEach(p => {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle   = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.life/p.maxLife), 0, Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// ─── MINIMAP ─────────────────────────────────────────────────────────────────

function drawMinimap() {
  const mCtx   = minimapCtx;
  const mSize  = 150;
  const scale  = mSize / WORLD_SIZE;

  mCtx.fillStyle = '#0a1a0a';
  mCtx.fillRect(0, 0, mSize, mSize);

  // Storm overlay
  mCtx.fillStyle = 'rgba(138,43,226,0.4)';
  mCtx.fillRect(0, 0, mSize, mSize);
  mCtx.globalCompositeOperation = 'destination-out';
  mCtx.beginPath();
  mCtx.arc((storm.cx+WORLD_SIZE/2)*scale, (storm.cy+WORLD_SIZE/2)*scale, storm.cr*scale, 0, Math.PI*2);
  mCtx.fill();
  mCtx.globalCompositeOperation = 'source-over';

  // Bus route line
  if (bus) {
    const bsx = (bus.startX + WORLD_SIZE/2) * scale;
    const bsy = (bus.startY + WORLD_SIZE/2) * scale;
    const bex = (bus.endX   + WORLD_SIZE/2) * scale;
    const bey = (bus.endY   + WORLD_SIZE/2) * scale;
    mCtx.strokeStyle = 'rgba(251,191,36,0.45)';
    mCtx.lineWidth   = 1.5;
    mCtx.setLineDash([4, 4]);
    mCtx.beginPath(); mCtx.moveTo(bsx, bsy); mCtx.lineTo(bex, bey); mCtx.stroke();
    mCtx.setLineDash([]);
    // Bus marker
    const bx = (bus.x + WORLD_SIZE/2) * scale;
    const by = (bus.y + WORLD_SIZE/2) * scale;
    mCtx.fillStyle = '#fbbf24';
    mCtx.beginPath(); mCtx.arc(bx, by, 4, 0, Math.PI*2); mCtx.fill();
  }

  // Enemies
  mCtx.fillStyle = '#ef4444';
  enemies.forEach(e => {
    if (!e.alive || !e.activated) return;
    mCtx.fillRect((e.x+WORLD_SIZE/2)*scale-2, (e.y+WORLD_SIZE/2)*scale-2, 4, 4);
  });

  // Pickups
  mCtx.fillStyle = '#22c55e';
  pickups.forEach(p => {
    if (p.collected) return;
    mCtx.fillRect((p.x+WORLD_SIZE/2)*scale-1, (p.y+WORLD_SIZE/2)*scale-1, 3, 3);
  });

  // Player
  const plx = (player.x + WORLD_SIZE/2) * scale;
  const ply = (player.y + WORLD_SIZE/2) * scale;
  mCtx.fillStyle = '#fff';
  mCtx.beginPath(); mCtx.arc(plx, ply, 4, 0, Math.PI*2); mCtx.fill();

  // Player direction arrow
  mCtx.strokeStyle = '#fff';
  mCtx.lineWidth   = 1.5;
  mCtx.beginPath();
  mCtx.moveTo(plx, ply);
  mCtx.lineTo(plx + Math.cos(player.angle)*8, ply + Math.sin(player.angle)*8);
  mCtx.stroke();

  mCtx.strokeStyle = 'rgba(255,255,255,0.25)';
  mCtx.lineWidth   = 1;
  mCtx.strokeRect(0, 0, mSize, mSize);
}

// ─── END GAME ────────────────────────────────────────────────────────────────

function endGame(won) {
  gameState = won ? 'won' : 'dead';
  cancelAnimationFrame(animFrame);
  teardownInput();
  window.removeEventListener('resize', resizeCanvas);

  const elapsed  = (Date.now() - startTime) / 1000;
  const mins     = Math.floor(elapsed / 60);
  const secs     = Math.floor(elapsed % 60);
  const timeStr  = `${mins}:${secs.toString().padStart(2,'0')}`;
  const xpEarned = player.kills * 200 + (won ? 1000 : 50) + Math.floor(elapsed * 2);

  const notifications = addXP(xpEarned);
  saveData.kills += player.kills;
  if (won) saveData.wins++;
  saveSaveData(saveData);
  updateMenuStats();

  if (won) {
    document.getElementById('win-kills').textContent = player.kills;
    document.getElementById('win-time').textContent  = timeStr;
    document.getElementById('win-xp').textContent    = `+${xpEarned}`;
    showScreen('win-screen');
  } else {
    document.getElementById('death-placement').textContent = `#${enemies.filter(e=>e.alive).length + 1}`;
    document.getElementById('death-kills').textContent     = player.kills;
    document.getElementById('death-time').textContent      = timeStr;
    document.getElementById('death-xp').textContent        = `+${xpEarned}`;
    showScreen('death-screen');
  }
  notifications.forEach(n => { if (n.type==='levelup') showLevelUpNotification(n.level); });
}

function showStormWarning() {
  const el = document.getElementById('storm-warning');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}
