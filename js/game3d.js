// FortClash 3D — First-Person Battle Royale
/* globals THREE, saveData, saveSaveData, addXP, syncUnlockState,
           showScreen, addKillFeedEntry, showXPNotif, showLevelUpNotification,
           updateMenuStats, SKINS_DATA */

const WORLD_SIZE  = 3000;
const INIT_BOTS   = 39;

// ── Scene globals ─────────────────────────────────────────────────────────────
let scene, camera, renderer;
let weaponScene, weaponCamera, weaponGroup;
let gameState = 'menu';
let gameTime = 0, startTime = 0, animFrame = null;

// ── Input / look ──────────────────────────────────────────────────────────────
let keys = {}, shooting = false;
let yaw = 0, pitch = 0, pointerLocked = false;

// ── Player state ──────────────────────────────────────────────────────────────
let camPos, camVY = 0, camGrounded = true;
let playerHP = 100, playerShield = 0, playerAlive = true, playerKills = 0;
const PLAYER_SPEED = 9, EYE_H = 1.75, GRAVITY = -24;
const SPRINT_MULT  = 1.65;

// ── Weapons ───────────────────────────────────────────────────────────────────
const GUNS = [
  { name:'Sturmgewehr',   icon:'🔫', dmg:22, rate:0.11, maxAmmo:30, maxRes:90, spread:0.024, range:500, crit:0.10 },
  { name:'Schrotflinte',  icon:'🔫', dmg:13, rate:0.65, maxAmmo:6,  maxRes:30, spread:0.13,  range:75,  crit:0.05, pellets:8 },
  { name:'Scharfschütze', icon:'🔭', dmg:90, rate:1.6,  maxAmmo:5,  maxRes:20, spread:0.001, range:1200,crit:0.40 },
];
let wIdx = 0;
let wAmmo    = [30, 6, 5];
let wReserve = [90, 30, 20];
let reloading = false, reloadTimer = 0, fireCooldown = 0;
let weaponBobT = 0, weaponSwayX = 0, weaponSwayY = 0;
let muzzleLight = null;

// ── Bus / glide ───────────────────────────────────────────────────────────────
let bus = null, busGroup = null;
let playerAlt = 0, gliderOpen = false, freefallT = 0;

// ── Storm ─────────────────────────────────────────────────────────────────────
let sCX = 0, sCZ = 0, sCR = WORLD_SIZE * 0.55;
let sTX = 0, sTZ = 0, sTR = sCR;
let sShrinking = false, sTimer = 60, sPhase = 0, sDmg = 2, sWarned = false;
let stormWall = null;
const S_PHASES = [
  {wait:60, tr:1200, dur:30, dmg:2 },
  {wait:45, tr:700,  dur:25, dmg:3 },
  {wait:35, tr:400,  dur:20, dmg:5 },
  {wait:25, tr:200,  dur:15, dmg:8 },
  {wait:20, tr:80,   dur:12, dmg:12},
];

// ── Enemies ───────────────────────────────────────────────────────────────────
const BOT_NAMES = ['NoobSlayer99','ProGamer','xXDarkXx','Storm_Rider','SniperElite',
  'ChaosAgent','NightHawk','IronFist','ShadowWolf','BlazeKing','TurboKiller',
  'MegaBot','AceHunter','DeathMark','VortexX','FrostByte','NebulaX',
  'ZenMaster','PhantomOP','DragonSlayer'];
const BOT_COLORS = [0xdc2626,0x16a34a,0xd97706,0x7c3aed,0x0e7490,0xbe185d,0x1e3a5f,0x5a3e1b];
let enemies3d = [];

// ── Pickups ───────────────────────────────────────────────────────────────────
let pickups3d = [];

// ── Bullets (enemy projectiles for visual) ────────────────────────────────────
let eBullets = [];

// ── Hit effects ───────────────────────────────────────────────────────────────
let hitFX = [];

// ── Scene objects pool ────────────────────────────────────────────────────────
let mapGroup = null;

// ── Raycaster ─────────────────────────────────────────────────────────────────
let raycaster;

// ── Shared geometry/material pools ────────────────────────────────────────────
let _treeMat, _rockMat, _bushMat, _groundMat;

// =============================================================================
//  INIT THREE.JS
// =============================================================================

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x5a9fd4);
  scene.fog = new THREE.Fog(0x5a9fd4, 120, 550);

  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 1000);
  camPos = new THREE.Vector3(0, EYE_H, 0);
  camera.position.copy(camPos);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const gs = document.getElementById('game-screen');
  renderer.domElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
  gs.insertBefore(renderer.domElement, gs.firstChild);

  // Weapon overlay scene (renders on top, no depth conflicts)
  weaponScene  = new THREE.Scene();
  weaponCamera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 20);
  weaponScene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const wSun = new THREE.DirectionalLight(0xfff8e1, 1.0);
  wSun.position.set(0.5, 1, 0.5);
  weaponScene.add(wSun);

  // Scene lights
  scene.add(new THREE.AmbientLight(0xd0e8ff, 0.45));
  const sun = new THREE.DirectionalLight(0xfff8e1, 1.2);
  sun.position.set(400, 800, 400);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far  = 1200;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -250;
  sun.shadow.camera.right = sun.shadow.camera.top   =  250;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x87ceeb, 0x3a6b22, 0.35));

  raycaster = new THREE.Raycaster();

  // Pointer lock
  renderer.domElement.addEventListener('click', () => {
    if (gameState === 'playing' || gameState === 'bus' || gameState === 'gliding') renderer.domElement.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === renderer.domElement;
    const msg = document.getElementById('pointer-lock-msg');
    if (msg) msg.style.display = pointerLocked ? 'none' : (gameState === 'playing' ? 'flex' : 'none');
  });

  window.addEventListener('resize', () => {
    camera.aspect = weaponCamera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    weaponCamera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // Shared materials
  _treeMat  = new THREE.MeshLambertMaterial({ color: 0x1a5c0a });
  _rockMat  = new THREE.MeshLambertMaterial({ color: 0x5a5a6a });
  _bushMat  = new THREE.MeshLambertMaterial({ color: 0x1e4a10 });
  _groundMat= new THREE.MeshLambertMaterial({ color: 0x3a6b22 });
}

// =============================================================================
//  WORLD BUILD
// =============================================================================

function buildWorld() {
  if (mapGroup) scene.remove(mapGroup);
  mapGroup = new THREE.Group();

  // Ground plane
  const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 80, 80);
  addGroundVariation(groundGeo);
  const ground = new THREE.Mesh(groundGeo, _groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  mapGroup.add(ground);

  // Objects
  const rng = seededRng(42);
  for (let i = 0; i < 180; i++) {
    const x = (rng() - 0.5) * WORLD_SIZE * 0.92;
    const z = (rng() - 0.5) * WORLD_SIZE * 0.92;
    const r = rng();
    if      (r < 0.42) addTree(mapGroup, x, z, rng);
    else if (r < 0.62) addRock(mapGroup, x, z, rng);
    else if (r < 0.76) addBush(mapGroup, x, z, rng);
    else               addBuilding(mapGroup, x, z, rng);
  }

  scene.add(mapGroup);
}

function addGroundVariation(geo) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const h = Math.sin(x * 0.008) * Math.cos(y * 0.007) * 2.0 + Math.sin(x * 0.022 + y * 0.015) * 0.8;
    pos.setZ(i, h);
  }
  geo.computeVertexNormals();
}

function seededRng(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function addTree(g, x, z, rng) {
  const tr = new THREE.Group();
  const h  = 6 + rng() * 5;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.35, h * 0.38, 6),
    new THREE.MeshLambertMaterial({ color: 0x5a3a1a })
  );
  trunk.position.y = h * 0.19;
  trunk.castShadow = true;
  tr.add(trunk);

  const sizes = [[3.8, 6], [2.8, 4.5], [2.0, 3.5]];
  let cy = h * 0.3;
  sizes.forEach(([r, ch]) => {
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(r, ch, 7), _treeMat);
    leaves.position.y = cy + ch * 0.5;
    leaves.castShadow = true;
    tr.add(leaves);
    cy += ch * 0.55;
  });

  tr.position.set(x, 0, z);
  tr.userData = { solidR: 0.4 };
  g.add(tr);
}

function addRock(g, x, z, rng) {
  const r = 1.0 + rng() * 1.8;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 6), _rockMat);
  mesh.scale.set(0.9 + rng()*0.4, 0.45 + rng()*0.35, 0.85 + rng()*0.4);
  mesh.position.set(x, r * 0.5, z);
  mesh.castShadow = true;
  mesh.userData = { solidR: r * 1.1 };
  g.add(mesh);
}

function addBush(g, x, z, rng) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.1 + rng(), 6, 5), _bushMat);
  mesh.scale.set(1.2 + rng()*0.4, 0.55 + rng()*0.3, 1.0 + rng()*0.3);
  mesh.position.set(x, 0.7, z);
  g.add(mesh);
}

function addBuilding(g, x, z, rng) {
  const w = 7 + rng() * 8,  d = 6 + rng() * 7, h = 3.5 + rng() * 4;
  const grp = new THREE.Group();

  const wallMat = new THREE.MeshLambertMaterial({ color: 0x8a7050 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a3a25 });
  const winMat  = new THREE.MeshLambertMaterial({ color: 0x90d0f0, emissive: 0x305060, emissiveIntensity: 0.4 });

  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  walls.position.y = h / 2;
  walls.castShadow = true; walls.receiveShadow = true;
  grp.add(walls);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5), roofMat);
  roof.position.y = h + 0.25;
  roof.castShadow = true;
  grp.add(roof);

  // Windows
  const wGeo = new THREE.BoxGeometry(0.05, 1.0, 1.2);
  [-w/2 + 1.8, w/2 - 1.8].forEach(wx => {
    const win = new THREE.Mesh(wGeo, winMat);
    win.position.set(wx, h * 0.55, 0);
    grp.add(win);
  });

  grp.position.set(x, 0, z);
  grp.userData = { solidHW: w / 2, solidHD: d / 2, h };
  g.add(grp);
}

// =============================================================================
//  STORM MESH
// =============================================================================

function buildStormMesh() {
  if (stormWall) scene.remove(stormWall);
  const geo = new THREE.CylinderGeometry(sCR, sCR, 400, 80, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x9b30ff, transparent: true, opacity: 0.28, side: THREE.BackSide
  });
  stormWall = new THREE.Mesh(geo, mat);
  stormWall.position.set(sCX, 100, sCZ);
  scene.add(stormWall);
}

function refreshStormMesh() {
  if (!stormWall) return;
  stormWall.geometry.dispose();
  stormWall.geometry = new THREE.CylinderGeometry(sCR, sCR, 400, 80, 1, true);
  stormWall.position.set(sCX, 100, sCZ);
  stormWall.material.opacity = 0.22 + 0.12 * Math.sin(Date.now() * 0.0018);
}

// =============================================================================
//  PICKUPS
// =============================================================================

function spawnPickups3d() {
  pickups3d.forEach(p => scene.remove(p.mesh));
  pickups3d = [];
  const types = ['medkit','shield','ammo','shield_small'];
  const colors = { medkit:0xef4444, shield:0x3b82f6, shield_small:0x60a5fa, ammo:0xf59e0b };
  const rng = seededRng(99);
  for (let i = 0; i < 80; i++) {
    const x = (rng() - 0.5) * WORLD_SIZE * 0.88;
    const z = (rng() - 0.5) * WORLD_SIZE * 0.88;
    const type = types[i % types.length];
    const geo  = new THREE.SphereGeometry(0.42, 8, 6);
    const mat  = new THREE.MeshLambertMaterial({
      color: colors[type], emissive: colors[type], emissiveIntensity: 0.3
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.5, z);
    scene.add(mesh);
    pickups3d.push({ mesh, type, collected: false });
  }
}

// =============================================================================
//  ENEMY CLASS
// =============================================================================

class Enemy3D {
  constructor(x, z, id) {
    this.id = id;
    this.name = BOT_NAMES[id % BOT_NAMES.length];
    this.x = x; this.z = z;
    this.hp = 100; this.maxHP = 100;
    this.shield = (id % 2 === 0) ? 50 : 0; this.maxShield = 50;
    this.alive = true;
    this.speed = 3.5 + (id % 7) * 0.4;
    this.state = 'roam';
    this.roamTX = x; this.roamTZ = z;
    this.fireCd  = (id % 5) * 0.35;
    this.fireRate = 0.75 + (id % 4) * 0.25;
    this.dmg  = 10 + (id % 8) * 2;
    this.detR = 45 + (id % 6) * 8;
    this.stateT = 0; this.fleeHP = 18;
    this.activated = false;
    this.busJumpT = 0; this.busLandX = x; this.busLandZ = z;

    this.group = this._buildMesh();
    this.group.position.set(x, 0, z);
    scene.add(this.group);
  }

  _buildMesh() {
    const g   = new THREE.Group();
    const col = BOT_COLORS[this.id % BOT_COLORS.length];
    const bm  = new THREE.MeshLambertMaterial({ color: col });
    const hm  = new THREE.MeshLambertMaterial({ color: 0xfde08a });
    const lm  = new THREE.MeshLambertMaterial({ color: Math.max(0, col - 0x222222) });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.1, 0.36), bm);
    body.position.y = 1.2; body.castShadow = true; g.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.6, 0.58), hm);
    head.position.y = 2.05; head.castShadow = true; g.add(head);

    const legGeo = new THREE.BoxGeometry(0.3, 0.88, 0.3);
    const lL = new THREE.Mesh(legGeo, lm); lL.position.set(-0.22, 0.44, 0); g.add(lL);
    const lR = new THREE.Mesh(legGeo, lm); lR.position.set( 0.22, 0.44, 0); g.add(lR);

    const armGeo = new THREE.BoxGeometry(0.24, 0.78, 0.24);
    const aL = new THREE.Mesh(armGeo, bm); aL.position.set(-0.52, 1.2, 0); g.add(aL);
    const aR = new THREE.Mesh(armGeo, bm); aR.position.set( 0.52, 1.2, 0); g.add(aR);

    // HP bar (canvas sprite)
    this._hpCanvas = document.createElement('canvas');
    this._hpCanvas.width = 64; this._hpCanvas.height = 10;
    this._hpTex = new THREE.CanvasTexture(this._hpCanvas);
    const bar = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.22),
      new THREE.MeshBasicMaterial({ map: this._hpTex, transparent: true, depthTest: false })
    );
    bar.renderOrder = 50;
    bar.position.y = 3.0;
    this._bar = bar;
    g.add(bar);
    this._refreshBar();

    return g;
  }

  _refreshBar() {
    const c = this._hpCanvas, ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 64, 10);
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 64, 10);
    ctx.fillStyle = this.hp > 60 ? '#22c55e' : this.hp > 30 ? '#f59e0b' : '#ef4444';
    ctx.fillRect(0, 0, Math.round(64 * this.hp / this.maxHP), 10);
    if (this.shield > 0) {
      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(0, 8, Math.round(64 * this.shield / this.maxShield), 2);
    }
    this._hpTex.needsUpdate = true;
  }

  takeDamage(amount) {
    if (!this.alive) return false;
    if (this.shield > 0) {
      const a = Math.min(this.shield, amount);
      this.shield -= a; amount -= a;
    }
    this.hp = Math.max(0, this.hp - amount);
    this._refreshBar();
    if (this.hp <= 0) { this._die(); return true; }
    return false;
  }

  _die() {
    this.alive = false;
    scene.remove(this.group);
    for (let i = 0; i < 8; i++) spawnHitFX(this.group.position.clone().setY(1.2), 0xef4444);
  }

  update(dt) {
    if (!this.alive || !this.activated) return;

    const px = camPos.x, pz = camPos.z;
    const dp = Math.hypot(this.x - px, this.z - pz);

    this.fireCd  -= dt;
    this.stateT  -= dt;

    // Storm avoidance
    if (Math.hypot(this.x - sCX, this.z - sCZ) > sCR - 5) {
      this.state = 'storm';
    } else if (this.hp < this.fleeHP) {
      this.state = 'flee';
    } else if (dp < this.detR) {
      this.state = 'hunt';
    } else if (this.stateT <= 0) {
      this.state = 'roam';
      this.roamTX = this.x + (Math.random()-0.5)*120;
      this.roamTZ = this.z + (Math.random()-0.5)*120;
      this.stateT = 3 + Math.random() * 4;
    }

    let tx = this.roamTX, tz = this.roamTZ;
    if (this.state === 'hunt') {
      if (dp > 7) { tx = px; tz = pz; }
      if (dp < 90 && this.fireCd <= 0 && playerAlive) {
        this._shoot();
        this.fireCd = this.fireRate;
      }
    } else if (this.state === 'flee') {
      tx = this.x + (this.x - px) * 3;
      tz = this.z + (this.z - pz) * 3;
    } else if (this.state === 'storm') {
      tx = sCX + (this.x - sCX) * 0.3;
      tz = sCZ + (this.z - sCZ) * 0.3;
    }

    const dx = tx - this.x, dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.5) {
      this.x += (dx / dist) * this.speed * dt;
      this.z += (dz / dist) * this.speed * dt;
      this.group.rotation.y = Math.atan2(dx, dz);
    }

    const half = WORLD_SIZE / 2;
    this.x = Math.max(-half, Math.min(half, this.x));
    this.z = Math.max(-half, Math.min(half, this.z));
    this.group.position.set(this.x, 0, this.z);
    this._bar.lookAt(camera.position);
  }

  _shoot() {
    const angle = Math.atan2(camPos.x - this.x, camPos.z - this.z) + (Math.random()-0.5)*0.18;
    eBullets.push({
      x: this.x, y: 1.5, z: this.z,
      vx: Math.sin(angle)*38, vz: Math.cos(angle)*38,
      dmg: this.dmg, life: 2.2
    });
  }
}

function spawnEnemies3d() {
  enemies3d.forEach(e => { if (e.group) scene.remove(e.group); });
  enemies3d = [];
  for (let i = 0; i < INIT_BOTS; i++) {
    enemies3d.push(new Enemy3D(
      (Math.random()-0.5)*WORLD_SIZE,
      (Math.random()-0.5)*WORLD_SIZE,
      i
    ));
  }
}

// =============================================================================
//  WEAPON MESH (first-person overlay)
// =============================================================================

function buildWeaponMesh() {
  if (weaponGroup) weaponScene.remove(weaponGroup);
  weaponGroup = new THREE.Group();

  const w  = GUNS[wIdx];
  // Use MeshBasicMaterial so color shows regardless of lighting
  const bm = c => new THREE.MeshBasicMaterial({ color: c });

  const isSniper  = w.id === 'sniper';
  const isShotgun = w.id === 'shotgun';
  const isLaser   = w.id === 'laser';
  const isPistol  = w.id === 'pistol' || w.id === 'deagle';

  // Rarity-tinted body color
  const rarityTint = { common:0x888888, uncommon:0x5a8a5a, rare:0x3a5a8a, epic:0x7a3a8a, legendary:0xb8860b };
  const bodyCol    = rarityTint[w.rarity] || 0x666666;

  // Main body — visibly sized
  const bodyLen = isSniper ? 0.60 : (isPistol ? 0.34 : 0.50);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, bodyLen), bm(bodyCol));
  weaponGroup.add(body);

  // Barrel
  const barLen = isSniper ? 0.40 : (isPistol ? 0.18 : 0.28);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, barLen, 8), bm(0x444455));
  bar.rotation.x = Math.PI / 2;
  bar.position.set(0, 0.012, -(bodyLen * 0.5 + barLen * 0.5));
  weaponGroup.add(bar);

  // Barrel tip flash guard
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.045, 6), bm(0x333344));
  tip.rotation.x = Math.PI / 2;
  tip.position.set(0, 0.012, -(bodyLen * 0.5 + barLen + 0.022));
  weaponGroup.add(tip);

  // Grip
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.075), bm(0x5a3a1a));
  grip.position.set(0.01, -0.115, bodyLen * 0.15);
  grip.rotation.x = 0.18;
  weaponGroup.add(grip);

  // Magazine
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.07), bm(0x555555));
  mag.position.set(0, -0.065, bodyLen * 0.05);
  mag.rotation.x = 0.08;
  weaponGroup.add(mag);

  // Top rail / receiver highlight
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, bodyLen * 0.7), bm(0x999999));
  rail.position.set(0, 0.072, 0);
  weaponGroup.add(rail);

  if (isShotgun) {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.07, 0.18), bm(0x6a5a3a));
    pump.position.set(0, -0.03, -(bodyLen * 0.2));
    weaponGroup.add(pump);
  }

  if (isSniper) {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.26, 8), bm(0x222233));
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.09, -0.04);
    weaponGroup.add(scope);
    const lensL = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.022, 8), bm(0x334466));
    lensL.rotation.x = Math.PI / 2;
    lensL.position.set(0, 0.09, -0.175);
    weaponGroup.add(lensL);
  }

  if (isLaser) {
    const emitter = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.06), bm(0x00ccff));
    emitter.position.set(0, 0.06, -(bodyLen * 0.5 + 0.03));
    weaponGroup.add(emitter);
  }

  // Position: right of center, below horizon, clearly in front
  weaponGroup.position.set(0.21, -0.26, -0.42);
  weaponScene.add(weaponGroup);
}

// =============================================================================
//  BULLET TRACER
// =============================================================================

function spawnTracer(start, end) {
  const dir = end.clone().sub(start);
  const len = Math.max(0.1, dir.length());
  const mid = start.clone().add(dir.clone().multiplyScalar(0.5));
  const geo = new THREE.BoxGeometry(0.025, 0.025, len);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.85 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(mid);
  mesh.lookAt(end);
  scene.add(mesh);
  hitFX.push({ mesh, life: 0.09, maxLife: 0.09, vx: 0, vy: 0, vz: 0 });
}

// =============================================================================
//  HIT EFFECTS
// =============================================================================

function spawnHitFX(pos, color) {
  for (let i = 0; i < 5; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 4, 4),
      new THREE.MeshBasicMaterial({ color, transparent: true })
    );
    mesh.position.copy(pos);
    scene.add(mesh);
    hitFX.push({
      mesh, life: 0.3,
      vx: (Math.random()-0.5)*6, vy: 2+Math.random()*4, vz: (Math.random()-0.5)*6
    });
  }
}

function tickFX(dt) {
  hitFX = hitFX.filter(f => {
    f.life -= dt;
    f.mesh.position.x += f.vx * dt;
    f.mesh.position.y += f.vy * dt;
    f.mesh.position.z += f.vz * dt;
    f.vy -= 12 * dt;
    f.mesh.material.opacity = f.life / 0.3;
    if (f.life <= 0) { scene.remove(f.mesh); return false; }
    return true;
  });
}

// =============================================================================
//  BUS MESH
// =============================================================================

function buildBusMesh() {
  if (busGroup) scene.remove(busGroup);
  busGroup = new THREE.Group();

  const blue  = new THREE.MeshLambertMaterial({ color: 0x1d4ed8 });
  const gold  = new THREE.MeshLambertMaterial({ color: 0xfbbf24 });
  const dark  = new THREE.MeshLambertMaterial({ color: 0x1e3a8a });
  const win   = new THREE.MeshLambertMaterial({ color: 0xbae6fd, transparent:true, opacity:0.75 });
  const rope  = new THREE.MeshLambertMaterial({ color: 0x78716c });

  // Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(18, 5, 6.5), blue);
  body.castShadow = true; busGroup.add(body);

  // Roof detail
  const roof = new THREE.Mesh(new THREE.BoxGeometry(18.4, 0.6, 6.8), dark);
  roof.position.y = 2.8; busGroup.add(roof);

  // Windows
  for (let wx = -7; wx <= 7; wx += 3.5) {
    const w2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.8, 2.2), win);
    w2.position.set(wx, 0.3, 3.26); busGroup.add(w2);
    const w3 = w2.clone(); w3.position.z = -3.26; busGroup.add(w3);
  }

  // Headlights
  const hLight = new THREE.MeshLambertMaterial({ color: 0xfef9c3, emissive: 0xfef08a, emissiveIntensity: 1 });
  [-1.5, 1.5].forEach(hy => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.8), hLight);
    hl.position.set(9.15, hy, 0); busGroup.add(hl);
  });

  // Balloon
  const balloon = new THREE.Mesh(new THREE.SphereGeometry(5.5, 14, 10), gold);
  balloon.scale.set(1.6, 1.1, 1.3);
  balloon.position.y = 10; balloon.castShadow = true; busGroup.add(balloon);

  // Ropes
  for (let rx = -6; rx <= 6; rx += 3) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6, 4), rope);
    r.position.set(rx, 5, 0); busGroup.add(r);
  }

  scene.add(busGroup);
}

// =============================================================================
//  START GAME
// =============================================================================

function startGame() {
  showScreen('game-screen');
  if (!renderer) initThree();

  // Reset state
  eBullets = []; hitFX = [];

  buildWorld();
  spawnPickups3d();
  spawnEnemies3d();

  camPos = new THREE.Vector3(0, EYE_H, 0);
  camVY = 0; camGrounded = true;
  playerHP = 100; playerShield = 0; playerAlive = true; playerKills = 0;
  yaw = 0; pitch = 0; weaponBobT = 0;
  wIdx = 0; wAmmo = [30, 6, 5]; wReserve = [90, 30, 20];
  reloading = false; fireCooldown = 0;

  // Bus path
  const pathLen = WORLD_SIZE + 800;
  const ang = (Math.random() - 0.5) * 0.35;
  const offX = (Math.random()-0.5)*300, offZ = (Math.random()-0.5)*300;
  bus = {
    x:  offX - Math.cos(ang)*pathLen/2,
    z:  offZ - Math.sin(ang)*pathLen/2,
    sx: offX - Math.cos(ang)*pathLen/2,
    sz: offZ - Math.sin(ang)*pathLen/2,
    ex: offX + Math.cos(ang)*pathLen/2,
    ez: offZ + Math.sin(ang)*pathLen/2,
    cdx: Math.cos(ang), cdz: Math.sin(ang),
    dist: 0, totalDist: pathLen, progress: 0, speed: 95, jumped: false
  };

  // Bot jump points
  const half = WORLD_SIZE / 2;
  enemies3d.forEach((e, i) => {
    const t = Math.max(0.04, Math.min(0.96, 0.05 + (i / INIT_BOTS)*0.9 + (Math.random()-0.5)*0.05));
    e.busJumpT  = t;
    e.busLandX  = Math.max(-half, Math.min(half, bus.sx + (bus.ex-bus.sx)*t + (Math.random()-0.5)*350));
    e.busLandZ  = Math.max(-half, Math.min(half, bus.sz + (bus.ez-bus.sz)*t + (Math.random()-0.5)*350));
    e.activated = false;
    e.group.position.set(e.busLandX, 0, e.busLandZ);
  });

  // Storm
  sCX = 0; sCZ = 0; sCR = WORLD_SIZE * 0.55;
  sTX = 0; sTZ = 0; sTR = sCR;
  sShrinking = false; sTimer = S_PHASES[0].wait; sPhase = 0; sDmg = 2; sWarned = false;
  buildStormMesh();

  playerAlt = 0; gliderOpen = false; freefallT = 0;
  gameState = 'bus';
  gameTime = 0; startTime = Date.now();
  keys = {}; shooting = false;

  buildBusMesh();
  buildWeaponMesh();

  // Camera attaches to bus
  camPos.set(bus.x, 80, bus.z);
  yaw   = Math.atan2(bus.cdx, bus.cdz) + Math.PI;
  pitch = -0.22;

  setupInput3d();
  showBusHUD(true);

  const msg = document.getElementById('pointer-lock-msg');
  if (msg) msg.style.display = 'none';

  if (animFrame) cancelAnimationFrame(animFrame);
  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    tick3d(dt);
    render3d();
    animFrame = requestAnimationFrame(loop);
  }
  animFrame = requestAnimationFrame(loop);
}

// =============================================================================
//  INPUT
// =============================================================================

const _kd = e => {
  keys[e.code] = true;
  if (e.code === 'Space')  { e.preventDefault(); if (gameState === 'bus') _jumpBus(); }
  if (e.code === 'KeyR'   && gameState === 'playing') startReload3d();
  if (e.code === 'Digit1') switchGun(0);
  if (e.code === 'Digit2') switchGun(1);
  if (e.code === 'Digit3') switchGun(2);
  if (e.code === 'KeyF'   && gameState === 'playing') { /* medkit shortcut */ }
};
const _ku = e => { keys[e.code] = false; };
const _mm = e => {
  if (!pointerLocked) return;
  yaw   -= e.movementX * 0.0017;
  pitch -= e.movementY * 0.0017;
  pitch  = Math.max(-1.45, Math.min(1.45, pitch));
};
const _md = e => { if (e.button === 0) shooting = true;  };
const _mu = e => { if (e.button === 0) shooting = false; };

function setupInput3d() {
  document.addEventListener('keydown', _kd);
  document.addEventListener('keyup',   _ku);
  document.addEventListener('mousemove',_mm);
  document.addEventListener('mousedown',_md);
  document.addEventListener('mouseup',  _mu);
}
function teardownInput3d() {
  document.removeEventListener('keydown', _kd);
  document.removeEventListener('keyup',   _ku);
  document.removeEventListener('mousemove',_mm);
  document.removeEventListener('mousedown',_md);
  document.removeEventListener('mouseup',  _mu);
  if (document.pointerLockElement) document.exitPointerLock();
}

// =============================================================================
//  MAIN TICK
// =============================================================================

function tick3d(dt) {
  if (gameState === 'bus') {
    _tickBus(dt);
  } else if (gameState === 'gliding') {
    _tickGlide(dt);
  } else if (gameState === 'playing') {
    gameTime += dt;
    _tickMove(dt);
    _tickWeapon(dt);
    _tickStorm(dt);
    _tickEnemies(dt);
    _tickEBullets(dt);
    _tickPickups();
    _tickBotFights(dt);
    tickFX(dt);
    _tickPickupBob(dt);
    updateHUD3d();

    if (!playerAlive) endGame3d(false);
    if (enemies3d.filter(e=>e.alive).length === 0) endGame3d(true);
  }
}

// ─── BUS ─────────────────────────────────────────────────────────────────────

function _tickBus(dt) {
  bus.dist     += bus.speed * dt;
  bus.progress  = bus.dist / bus.totalDist;
  bus.x = bus.sx + bus.cdx * bus.dist;
  bus.z = bus.sz + bus.cdz * bus.dist;

  enemies3d.forEach(e => {
    if (!e.activated && bus.progress >= e.busJumpT) {
      e.activated = true;
      e.x = e.busLandX; e.z = e.busLandZ;
      e.group.position.set(e.x, 0, e.z);
    }
  });

  if (busGroup) {
    busGroup.position.set(bus.x, 80, bus.z);
    busGroup.rotation.y = Math.atan2(bus.cdx, bus.cdz);
  }

  if (!bus.jumped) {
    camPos.set(bus.x + Math.cos(bus.cdx)*2, 78, bus.z + Math.cos(bus.cdz)*2);
    camera.position.copy(camPos);
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  }

  updateBusHUDProgress(bus.progress);

  if (bus.progress >= 0.95 && !bus.jumped) _jumpBus();
}

function _jumpBus() {
  if (!bus || bus.jumped) return;
  bus.jumped  = true;
  playerAlt   = 80;
  gliderOpen  = false;
  freefallT   = 0;
  gameState   = 'gliding';
  showBusHUD(false);
  showGlideHUD(true);
}

// ─── GLIDE ────────────────────────────────────────────────────────────────────

function _tickGlide(dt) {
  freefallT += dt;
  const fallSpd = gliderOpen ? 7 : 30;
  playerAlt = Math.max(0, playerAlt - fallSpd * dt);
  if (!gliderOpen && freefallT >= 1.4) gliderOpen = true;

  const fwd   = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const right  = { x:  Math.cos(yaw), z: -Math.sin(yaw) };
  let dx = 0, dz = 0;
  if (keys['KeyW'] || keys['ArrowUp'])    { dx += fwd.x;   dz += fwd.z; }
  if (keys['KeyS'] || keys['ArrowDown'])  { dx -= fwd.x;   dz -= fwd.z; }
  if (keys['KeyA'] || keys['ArrowLeft'])  { dx -= right.x; dz -= right.z; }
  if (keys['KeyD'] || keys['ArrowRight']) { dx += right.x; dz += right.z; }
  const spd = gliderOpen ? 20 : 5;
  camPos.x += dx * spd * dt;
  camPos.z += dz * spd * dt;
  camPos.y  = playerAlt + EYE_H;

  const half = WORLD_SIZE / 2;
  camPos.x = Math.max(-half, Math.min(half, camPos.x));
  camPos.z = Math.max(-half, Math.min(half, camPos.z));

  updateGlideHUDAlt(playerAlt);

  if (playerAlt <= 0) {
    playerAlt = 0; gliderOpen = false;
    gameState = 'playing';
    camPos.y  = EYE_H; camGrounded = true;
    showGlideHUD(false);
    renderer.domElement.requestPointerLock();

    const msg = document.getElementById('pointer-lock-msg');
    if (msg) msg.style.display = 'flex';

    enemies3d.forEach(e => {
      if (!e.activated) {
        e.activated = true;
        e.x = (Math.random()-0.5)*WORLD_SIZE;
        e.z = (Math.random()-0.5)*WORLD_SIZE;
        e.group.position.set(e.x, 0, e.z);
      }
    });
  }
}

// ─── MOVEMENT ─────────────────────────────────────────────────────────────────

function _tickMove(dt) {
  const fwd   = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const right  = { x:  Math.cos(yaw), z: -Math.sin(yaw) };
  let dx = 0, dz = 0;
  if (keys['KeyW'] || keys['ArrowUp'])    { dx += fwd.x;   dz += fwd.z; }
  if (keys['KeyS'] || keys['ArrowDown'])  { dx -= fwd.x;   dz -= fwd.z; }
  if (keys['KeyA'] || keys['ArrowLeft'])  { dx -= right.x; dz -= right.z; }
  if (keys['KeyD'] || keys['ArrowRight']) { dx += right.x; dz += right.z; }

  const moving = Math.hypot(dx, dz) > 0;
  if (moving) { const l = Math.hypot(dx, dz); dx /= l; dz /= l; }

  const sprint = (keys['ShiftLeft'] || keys['ShiftRight']) ? SPRINT_MULT : 1;
  camPos.x += dx * PLAYER_SPEED * sprint * dt;
  camPos.z += dz * PLAYER_SPEED * sprint * dt;

  if (keys['Space'] && camGrounded) { camVY = 7; camGrounded = false; }
  camVY += GRAVITY * dt;
  camPos.y += camVY * dt;
  if (camPos.y <= EYE_H) { camPos.y = EYE_H; camVY = 0; camGrounded = true; }

  const half = WORLD_SIZE / 2;
  camPos.x = Math.max(-half, Math.min(half, camPos.x));
  camPos.z = Math.max(-half, Math.min(half, camPos.z));

  camera.position.copy(camPos);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  // Weapon bob
  if (moving && weaponGroup) {
    weaponBobT += dt * (sprint > 1 ? 14 : 9);
    weaponGroup.position.y = -0.26 + Math.sin(weaponBobT) * 0.013;
    weaponGroup.position.x = 0.21 + Math.cos(weaponBobT * 0.5) * 0.007;
  }
}

// ─── WEAPON ───────────────────────────────────────────────────────────────────

function _tickWeapon(dt) {
  fireCooldown -= dt;
  if (reloading) {
    reloadTimer -= dt;
    if (reloadTimer <= 0) {
      const needed = GUNS[wIdx].maxAmmo - wAmmo[wIdx];
      const take   = Math.min(needed, wReserve[wIdx]);
      wAmmo[wIdx]   += take;
      wReserve[wIdx] -= take;
      reloading = false;
    }
    return;
  }
  if (shooting && fireCooldown <= 0 && wAmmo[wIdx] > 0) _fire();
  else if (wAmmo[wIdx] === 0 && !reloading) startReload3d();
}

function _fire() {
  const g      = GUNS[wIdx];
  const pellets = g.pellets || 1;
  wAmmo[wIdx]--;
  fireCooldown = g.rate;

  // Muzzle flash light
  if (muzzleLight) scene.remove(muzzleLight);
  muzzleLight = new THREE.PointLight(0xffee88, 4, 6);
  const muzzlePos = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation).multiplyScalar(1.5).add(camPos);
  muzzleLight.position.copy(muzzlePos);
  scene.add(muzzleLight);
  setTimeout(() => { if (muzzleLight) scene.remove(muzzleLight); muzzleLight = null; }, 55);

  for (let p = 0; p < pellets; p++) {
    const dir = new THREE.Vector3(
      (Math.random()-0.5)*g.spread*2,
      (Math.random()-0.5)*g.spread*2,
      -1
    ).normalize().applyQuaternion(camera.quaternion);

    raycaster.set(camera.position, dir);
    raycaster.far = g.range;

    const targets = enemies3d.filter(e => e.alive && e.activated).map(e => e.group);
    const hits    = raycaster.intersectObjects(targets, true);

    // Tracer start: just in front of camera (gun barrel position)
    const tracerStart = camera.position.clone().add(dir.clone().multiplyScalar(0.6));

    if (hits.length > 0) {
      const hit = hits[0];
      spawnTracer(tracerStart, hit.point);

      // Walk up to find the Enemy3D group
      let obj = hit.object;
      while (obj.parent && obj.parent !== scene) obj = obj.parent;
      const enemy = enemies3d.find(e => e.group === obj);

      if (enemy && enemy.alive) {
        const isHead = hit.object.position.y > 1.6;
        const crit   = isHead || Math.random() < g.crit;
        const dmg    = Math.round(g.dmg * (crit ? 2.2 : 1) * (isHead ? 1.5 : 1));
        const killed = enemy.takeDamage(dmg);
        _showDmgNum(hit.point, dmg, crit);
        spawnHitFX(hit.point.clone(), 0xef4444);
        if (killed) { playerKills++; addKillFeedEntry('Du', enemy.name, '🔫'); }
      }
    } else {
      // Miss — tracer flies to max range
      const missEnd = tracerStart.clone().add(dir.clone().multiplyScalar(g.range));
      spawnTracer(tracerStart, missEnd);
    }
  }
}

function _showDmgNum(worldPos, dmg, crit) {
  const v = worldPos.clone().project(camera);
  const x = ((v.x + 1) / 2) * innerWidth;
  const y = ((1 - v.y) / 2) * innerHeight;
  const el = document.createElement('div');
  el.className = `dmg-num${crit ? ' crit' : ''}`;
  el.textContent = crit ? `${dmg}!` : dmg;
  el.style.left = `${x - 20 + (Math.random()-0.5)*28}px`;
  el.style.top  = `${y - 20}px`;
  document.getElementById('damage-numbers').appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function startReload3d() {
  if (reloading || wReserve[wIdx] === 0 || wAmmo[wIdx] === GUNS[wIdx].maxAmmo) return;
  reloading = true; reloadTimer = 1.9;
  showXPNotif('Nachladen...');
}

function switchGun(idx) {
  if (idx === wIdx) return;
  wIdx = idx; reloading = false; fireCooldown = 0;
  buildWeaponMesh();
}

// ─── ENEMY BULLETS ───────────────────────────────────────────────────────────

function _tickEBullets(dt) {
  eBullets = eBullets.filter(b => {
    b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
    if (b.life <= 0) return false;
    const dist = Math.hypot(b.x - camPos.x, b.z - camPos.z);
    if (dist < 1.0 && Math.abs(b.y - camPos.y) < 2.0) {
      _hurtPlayer(b.dmg); return false;
    }
    return true;
  });
}

function _hurtPlayer(amount) {
  if (!playerAlive) return;
  if (playerShield > 0) {
    const a = Math.min(playerShield, amount);
    playerShield -= a; amount -= a;
  }
  playerHP -= amount;
  if (playerHP <= 0) { playerHP = 0; playerAlive = false; }
  _flashRed();
}

function _flashRed() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;background:rgba(220,0,0,0.35);pointer-events:none;z-index:9998;transition:opacity 0.35s';
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 350); });
}

// ─── PICKUPS ──────────────────────────────────────────────────────────────────

function _tickPickups() {
  pickups3d.forEach(p => {
    if (p.collected) return;
    if (Math.hypot(p.mesh.position.x - camPos.x, p.mesh.position.z - camPos.z) < 2.2) {
      p.collected = true; scene.remove(p.mesh);
      switch (p.type) {
        case 'medkit':      playerHP     = Math.min(100, playerHP+50);    showXPNotif('+50 HP');      break;
        case 'shield':      playerShield = Math.min(100, playerShield+50);showXPNotif('+50 Schild');  break;
        case 'shield_small':playerShield = Math.min(100, playerShield+25);showXPNotif('+25 Schild');  break;
        case 'ammo':        wReserve = wReserve.map(r=>Math.min(999,r+30)); showXPNotif('+30 Munition'); break;
      }
    }
  });
}

function _tickPickupBob(dt) {
  const t = Date.now() * 0.0018;
  pickups3d.forEach((p, i) => {
    if (!p.collected) p.mesh.position.y = 0.5 + Math.sin(t + i) * 0.2;
  });
}

// ─── STORM ────────────────────────────────────────────────────────────────────

function _tickStorm(dt) {
  if (sShrinking) {
    sTimer -= dt;
    sCR = lerp3(sCR, sTR, dt / Math.max(0.1, sTimer));
    sCX = lerp3(sCX, sTX, dt / Math.max(0.1, sTimer));
    sCZ = lerp3(sCZ, sTZ, dt / Math.max(0.1, sTimer));
    if (sTimer <= 0) {
      sShrinking = false; sPhase++;
      sTimer  = sPhase < S_PHASES.length ? S_PHASES[sPhase].wait : 999;
      sWarned = false;
    }
  } else {
    sTimer -= dt;
    if (sTimer <= 10 && !sWarned) { sWarned = true; _stormWarn(); }
    if (sTimer <= 0) {
      const ph = S_PHASES[Math.min(sPhase, S_PHASES.length-1)];
      sShrinking = true; sTimer = ph.dur;
      sTX = (Math.random()-0.5)*sCR*0.4; sTZ = (Math.random()-0.5)*sCR*0.4;
      sTR = ph.tr; sDmg = ph.dmg;
    }
  }

  // Player storm damage
  if (Math.hypot(camPos.x-sCX, camPos.z-sCZ) > sCR) {
    _hurtPlayer(sDmg * dt);
    if (Math.random() < 0.03) _flashPurple();
  }

  // Enemy storm damage
  enemies3d.forEach(e => {
    if (!e.alive || !e.activated) return;
    if (Math.hypot(e.x-sCX, e.z-sCZ) > sCR) { e.hp -= sDmg*dt; if (e.hp<=0) e._die(); }
  });

  refreshStormMesh();

  const tel = document.getElementById('storm-timer');
  if (tel) tel.textContent = sShrinking
    ? 'Sturm zieht sich zusammen...'
    : `Nächste Phase: ${Math.ceil(sTimer)}s`;
}

function _stormWarn() {
  const el = document.getElementById('storm-warning');
  if (el) { el.classList.remove('hidden'); setTimeout(() => el.classList.add('hidden'), 3000); }
}

function _flashPurple() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;background:rgba(138,43,226,0.22);pointer-events:none;z-index:9997;transition:opacity 0.4s';
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); });
}

// ─── BOT vs BOT ───────────────────────────────────────────────────────────────

function _tickBotFights(dt) {
  for (let i = 0; i < enemies3d.length; i++) {
    const a = enemies3d[i];
    if (!a.alive || !a.activated) continue;
    for (let j = i+1; j < enemies3d.length; j++) {
      const b = enemies3d[j];
      if (!b.alive || !b.activated) continue;
      if (Math.hypot(a.x-b.x, a.z-b.z) < 25 && Math.random() < 0.0015) {
        const d = 6 + Math.floor(Math.random()*10);
        if (Math.random() < 0.5) { if (b.takeDamage(d)) addKillFeedEntry(a.name, b.name, '🔫'); }
        else                     { if (a.takeDamage(d)) addKillFeedEntry(b.name, a.name, '🔫'); }
      }
    }
  }
}

function _tickEnemies(dt) {
  enemies3d.forEach(e => e.update(dt));
}

// =============================================================================
//  HUD
// =============================================================================

function updateHUD3d() {
  const hud = document.getElementById('hud');
  if (hud) hud.style.opacity = '1';

  const el = id => document.getElementById(id);
  if (el('health-bar'))   el('health-bar').style.width   = `${Math.max(0, playerHP)}%`;
  if (el('health-value')) el('health-value').textContent  = Math.ceil(Math.max(0, playerHP));
  if (el('shield-bar'))   el('shield-bar').style.width    = `${playerShield}%`;
  if (el('shield-value')) el('shield-value').textContent  = Math.ceil(playerShield);
  if (el('ammo-current')) el('ammo-current').textContent  = reloading ? 'LADEN...' : wAmmo[wIdx];
  if (el('ammo-reserve')) el('ammo-reserve').textContent  = wReserve[wIdx];
  if (el('kill-count'))   el('kill-count').textContent    = playerKills;
  if (el('player-count')) el('player-count').textContent  = enemies3d.filter(e=>e.alive).length + (playerAlive?1:0);
  if (el('weapon-name'))  el('weapon-name').textContent   = GUNS[wIdx].name;
  if (el('weapon-icon'))  el('weapon-icon').textContent   = GUNS[wIdx].icon;

  // Weapon slot highlight
  for (let i = 0; i < 3; i++) {
    const s = el(`wslot-${i}`);
    if (s) s.className = `wslot${i === wIdx ? ' active' : ''}`;
  }
}

function _drawMinimap() {
  const mm = document.getElementById('minimap');
  if (!mm) return;
  const mc = mm.getContext('2d'), mS = 150, sc = mS / WORLD_SIZE;
  mc.fillStyle = '#0a1a0a'; mc.fillRect(0,0,mS,mS);

  // Storm
  mc.fillStyle = 'rgba(138,43,226,0.4)'; mc.fillRect(0,0,mS,mS);
  mc.globalCompositeOperation = 'destination-out';
  mc.beginPath();
  mc.arc((sCX+WORLD_SIZE/2)*sc, (sCZ+WORLD_SIZE/2)*sc, sCR*sc, 0, Math.PI*2);
  mc.fill();
  mc.globalCompositeOperation = 'source-over';

  // Bus route
  if (bus) {
    mc.strokeStyle='rgba(251,191,36,0.5)'; mc.lineWidth=1.5; mc.setLineDash([4,4]);
    mc.beginPath();
    mc.moveTo((bus.sx+WORLD_SIZE/2)*sc,(bus.sz+WORLD_SIZE/2)*sc);
    mc.lineTo((bus.ex+WORLD_SIZE/2)*sc,(bus.ez+WORLD_SIZE/2)*sc);
    mc.stroke(); mc.setLineDash([]);
    mc.fillStyle='#fbbf24'; mc.beginPath();
    mc.arc((bus.x+WORLD_SIZE/2)*sc,(bus.z+WORLD_SIZE/2)*sc,3,0,Math.PI*2); mc.fill();
  }

  // Enemies
  mc.fillStyle='#ef4444';
  enemies3d.forEach(e => {
    if (!e.alive||!e.activated) return;
    mc.fillRect((e.x+WORLD_SIZE/2)*sc-2,(e.z+WORLD_SIZE/2)*sc-2,4,4);
  });

  // Player dot + direction
  const px=(camPos.x+WORLD_SIZE/2)*sc, pz=(camPos.z+WORLD_SIZE/2)*sc;
  mc.fillStyle='#fff'; mc.beginPath(); mc.arc(px,pz,4,0,Math.PI*2); mc.fill();
  mc.strokeStyle='#fff'; mc.lineWidth=1.5; mc.beginPath();
  mc.moveTo(px,pz);
  mc.lineTo(px-Math.sin(yaw)*9, pz-Math.cos(yaw)*9);
  mc.stroke();
  mc.strokeStyle='rgba(255,255,255,0.2)'; mc.lineWidth=1; mc.strokeRect(0,0,mS,mS);
}

// =============================================================================
//  RENDER
// =============================================================================

function render3d() {
  if (!renderer) return;

  camera.position.copy(camPos);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  renderer.render(scene, camera);

  // Weapon overlay
  renderer.autoClear = false;
  renderer.clearDepth();
  if (weaponGroup && gameState === 'playing') renderer.render(weaponScene, weaponCamera);
  renderer.autoClear = true;

  _drawMinimap();
}

// =============================================================================
//  BUS / GLIDE HUD helpers
// =============================================================================

function showBusHUD(visible) {
  const el = document.getElementById('bus-hud');
  if (el) el.style.display = visible ? 'block' : 'none';
  const gl = document.getElementById('glide-hud');
  if (gl) gl.style.display = 'none';
  const hud = document.getElementById('hud');
  if (hud) hud.style.opacity = visible ? '0' : '1';
}

function showGlideHUD(visible) {
  const el = document.getElementById('glide-hud');
  if (el) el.style.display = visible ? 'block' : 'none';
  const bh = document.getElementById('bus-hud');
  if (bh) bh.style.display = 'none';
}

function updateBusHUDProgress(t) {
  const bar = document.getElementById('bus-progress-fill');
  if (bar) bar.style.width = `${Math.min(100, t*100)}%`;
}

function updateGlideHUDAlt(alt) {
  const bar = document.getElementById('glide-alt-fill');
  if (bar) bar.style.width = `${(alt/80)*100}%`;
  const el = document.getElementById('glide-state-text');
  if (el) el.textContent = gliderOpen ? '🪂 Gleiter aktiv' : '⬇ FREIER FALL!';
  if (el) el.style.color = gliderOpen ? '#22c55e' : '#ef4444';
}

// =============================================================================
//  END GAME
// =============================================================================

function endGame3d(won) {
  gameState = won ? 'won' : 'dead';
  cancelAnimationFrame(animFrame);
  teardownInput3d();
  showBusHUD(false); showGlideHUD(false);

  const elapsed = (Date.now() - startTime) / 1000;
  const mins = Math.floor(elapsed/60), secs = Math.floor(elapsed%60);
  const ts   = `${mins}:${secs.toString().padStart(2,'0')}`;
  const xp   = playerKills*200 + (won?1000:50) + Math.floor(elapsed*2);

  const notifs = addXP(xp);
  saveData.kills += playerKills;
  if (won) saveData.wins++;
  saveSaveData(saveData);
  updateMenuStats();

  if (won) {
    document.getElementById('win-kills').textContent = playerKills;
    document.getElementById('win-time').textContent  = ts;
    document.getElementById('win-xp').textContent    = `+${xp}`;
    showScreen('win-screen');
  } else {
    document.getElementById('death-placement').textContent = `#${enemies3d.filter(e=>e.alive).length+1}`;
    document.getElementById('death-kills').textContent     = playerKills;
    document.getElementById('death-time').textContent      = ts;
    document.getElementById('death-xp').textContent        = `+${xp}`;
    showScreen('death-screen');
  }
  notifs.forEach(n => { if (n.type==='levelup') showLevelUpNotification(n.level); });
}

// =============================================================================
//  UTILS
// =============================================================================

function lerp3(a, b, t) { return a + (b-a) * Math.max(0, Math.min(1, t)); }

// =============================================================================
//  WEAPON LOCKER DATA
// =============================================================================

const ALL_GUNS = [
  { id:'ar',      name:'Sturmgewehr',    icon:'⚙️',  dmg:22,  rate:0.11, maxAmmo:30, maxRes:90,  spread:0.024, range:500,  crit:0.10, rarity:'uncommon', desc:'Ausgeglichen · 22 Schaden' },
  { id:'shotgun', name:'Schrotflinte',   icon:'💥',  dmg:13,  rate:0.65, maxAmmo:6,  maxRes:30,  spread:0.13,  range:75,   crit:0.05, rarity:'uncommon', desc:'8 Schuss · Nahkampf', pellets:8 },
  { id:'sniper',  name:'Scharfschütze',  icon:'🔭',  dmg:90,  rate:1.60, maxAmmo:5,  maxRes:20,  spread:0.001, range:1200, crit:0.40, rarity:'epic',      desc:'90 Schaden · Langstrecke' },
  { id:'pistol',  name:'Pistole',        icon:'🔫',  dmg:28,  rate:0.35, maxAmmo:15, maxRes:60,  spread:0.040, range:300,  crit:0.08, rarity:'common',    desc:'Schnell nachladen · 28 Schaden' },
  { id:'smg',     name:'MP5',            icon:'⚡',  dmg:14,  rate:0.07, maxAmmo:35, maxRes:105, spread:0.055, range:200,  crit:0.05, rarity:'uncommon',  desc:'Hohes Feuerrate · 14 Schaden' },
  { id:'lmg',     name:'Maschinengewehr',icon:'🔥',  dmg:18,  rate:0.09, maxAmmo:60, maxRes:120, spread:0.045, range:400,  crit:0.06, rarity:'rare',      desc:'60 Schuss Magazin · 18 Schaden' },
  { id:'deagle',  name:'Desert Eagle',   icon:'💫',  dmg:55,  rate:0.55, maxAmmo:7,  maxRes:28,  spread:0.030, range:450,  crit:0.20, rarity:'rare',      desc:'Halbautomatisch · 55 Schaden' },
  { id:'laser',   name:'Lasergewehr',    icon:'🌟',  dmg:35,  rate:0.15, maxAmmo:20, maxRes:60,  spread:0.005, range:800,  crit:0.15, rarity:'legendary', desc:'Kein Streuung · 35 Schaden' },
];

// Selected loadout (3 indices into ALL_GUNS)
let selectedLoadout = [0, 1, 2];

function loadWeaponLoadout() {
  try {
    const s = localStorage.getItem('fortclash_loadout');
    if (s) {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) selectedLoadout = arr.filter(i => i >= 0 && i < ALL_GUNS.length).slice(0, 3);
    }
  } catch {}
  while (selectedLoadout.length < 3) {
    const next = ALL_GUNS.findIndex((_, i) => !selectedLoadout.includes(i));
    selectedLoadout.push(next >= 0 ? next : 0);
  }
}

function saveWeaponLoadout() {
  try { localStorage.setItem('fortclash_loadout', JSON.stringify(selectedLoadout)); } catch {}
}

loadWeaponLoadout();

// =============================================================================
//  WEAPON LOCKER UI
// =============================================================================

function openWeaponLocker() {
  renderWeaponSelect();
  showScreen('weapon-locker');
}

function renderWeaponSelect() {
  const grid = document.getElementById('weapon-select-grid');
  if (!grid) return;
  grid.innerHTML = '';

  // Update slot display
  for (let s = 0; s < 3; s++) {
    const nameEl = document.getElementById(`wl-name-${s}`);
    const boxEl  = document.getElementById(`wl-slot-${s}`);
    const gunIdx = selectedLoadout[s];
    const gun    = ALL_GUNS[gunIdx];
    if (nameEl) nameEl.textContent = gun ? gun.name : '-';
    if (boxEl)  boxEl.className = `weapon-slot-box${gun ? ' filled' : ''}`;
  }

  // Render weapon cards
  ALL_GUNS.forEach((gun, idx) => {
    const slotNum = selectedLoadout.indexOf(idx);
    const inLoadout = slotNum >= 0;

    const card = document.createElement('div');
    card.className = `weapon-card rarity-${gun.rarity}${inLoadout ? ' selected' : ''}`;
    card.innerHTML = `
      <div class="weapon-card-icon">${gun.icon}</div>
      <div class="weapon-card-info">
        <div class="weapon-card-name">${gun.name}</div>
        <div class="weapon-card-rarity" style="color:${RARITY_COLORS[gun.rarity]}">${RARITY_NAMES[gun.rarity]}</div>
        <div class="weapon-card-desc">${gun.desc}</div>
      </div>
      ${inLoadout ? `<div class="weapon-card-slot">SLOT ${slotNum + 1}</div>` : ''}
    `;
    card.addEventListener('click', () => toggleWeapon(idx));
    grid.appendChild(card);
  });
}

function toggleWeapon(idx) {
  const slotNum = selectedLoadout.indexOf(idx);
  if (slotNum >= 0) {
    // Remove from loadout
    selectedLoadout.splice(slotNum, 1);
  } else if (selectedLoadout.length < 3) {
    // Add to loadout
    selectedLoadout.push(idx);
  }
  // Ensure exactly 3 slots
  while (selectedLoadout.length < 3) {
    const next = ALL_GUNS.findIndex((_, i) => !selectedLoadout.includes(i));
    if (next >= 0) selectedLoadout.push(next);
    else break;
  }
  saveWeaponLoadout();
  renderWeaponSelect();
}
