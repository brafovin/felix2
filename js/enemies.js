// Bot / Enemy AI
const BOT_NAMES = [
  'NoobSlayer99', 'ProGamer', 'xXDarkXx', 'Storm_Rider', 'SniperElite',
  'ChaosAgent', 'NightHawk', 'IronFist', 'ShadowWolf', 'BlazeKing',
  'TurboKiller', 'MegaBot', 'AceHunter', 'DeathMark', 'VortexX',
  'FrostByte', 'NebulaX', 'ZenMaster', 'PhantomOP', 'DragonSlayer'
];

const BOT_COLORS = [
  { body: '#dc2626', head: '#fca5a5', legs: '#7f1d1d', arms: '#ef4444' },
  { body: '#16a34a', head: '#86efac', legs: '#14532d', arms: '#22c55e' },
  { body: '#d97706', head: '#fde68a', legs: '#78350f', arms: '#f59e0b' },
  { body: '#7c3aed', head: '#c4b5fd', legs: '#4c1d95', arms: '#8b5cf6' },
  { body: '#0e7490', head: '#67e8f9', legs: '#083344', arms: '#06b6d4' },
  { body: '#be185d', head: '#f9a8d4', legs: '#831843', arms: '#ec4899' },
  { body: '#1e3a5f', head: '#93c5fd', legs: '#0f2030', arms: '#3b82f6' },
  { body: '#5a3e1b', head: '#d4a574', legs: '#2d1f0a', arms: '#92652a' }
];

class Enemy {
  constructor(x, y, id) {
    this.x = x;
    this.y = y;
    this.id = id;
    this.name = BOT_NAMES[id % BOT_NAMES.length];
    this.skin = { colors: BOT_COLORS[id % BOT_COLORS.length] };

    this.hp = 100;
    this.maxHp = 100;
    this.shield = Math.random() > 0.5 ? 50 : 0;
    this.maxShield = 50;
    this.speed = 100 + Math.random() * 80;
    this.radius = 14;
    this.angle = 0;
    this.alive = true;

    // AI state
    this.state = 'roam';   // roam | hunt | flee | cover
    this.target = null;
    this.roamTarget = { x, y };
    this.fireCooldown = 0;
    this.fireRate = 0.35 + Math.random() * 0.4;
    this.damage = 15 + Math.floor(Math.random() * 10);
    this.detectionRange = 250 + Math.random() * 150;
    this.fleeHp = 20;
    this.stateTimer = 0;
    this.coverPos = null;

    this.ammo = 30;
    this.reloading = false;
    this.reloadTimer = 0;
  }

  takeDamage(amount) {
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      amount -= absorbed;
    }
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) this.alive = false;
    return !this.alive;
  }

  update(dt, player, allEnemies, worldSize, stormCenter, stormRadius, bullets) {
    if (!this.alive) return;

    const stormMargin = 60;

    // Storm avoidance
    const distToCenter = Math.hypot(this.x - stormCenter.x, this.y - stormCenter.y);
    const inStorm = distToCenter > stormRadius - stormMargin;

    this.fireCooldown -= dt;
    this.stateTimer -= dt;

    // Reload
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.ammo = 30;
        this.reloading = false;
      }
      return;
    }
    if (this.ammo <= 0) {
      this.reloading = true;
      this.reloadTimer = 2.5;
      return;
    }

    let moveTarget = null;

    if (inStorm) {
      // Run towards storm center
      moveTarget = stormCenter;
      this.state = 'storm_flee';
    } else {
      const distToPlayer = player.alive ? Math.hypot(this.x - player.x, this.y - player.y) : Infinity;

      if (this.hp < this.fleeHp) {
        this.state = 'flee';
      } else if (distToPlayer < this.detectionRange) {
        this.state = 'hunt';
        this.target = player;
      } else if (this.stateTimer <= 0) {
        this.state = 'roam';
        this.roamTarget = {
          x: this.x + (Math.random() - 0.5) * 400,
          y: this.y + (Math.random() - 0.5) * 400
        };
        this.stateTimer = 3 + Math.random() * 4;
      }

      if (this.state === 'hunt' && this.target) {
        const dist = Math.hypot(this.x - this.target.x, this.y - this.target.y);
        if (dist > 120) {
          moveTarget = this.target;
        }
        // Shoot at player
        if (dist < 350 && this.fireCooldown <= 0 && player.alive) {
          this.shoot(player, bullets);
        }
      } else if (this.state === 'flee') {
        moveTarget = {
          x: this.x + (player.alive ? this.x - player.x : 0) * 2,
          y: this.y + (player.alive ? this.y - player.y : 0) * 2
        };
      } else if (this.state === 'roam') {
        moveTarget = this.roamTarget;
      }
    }

    // Move towards target
    if (moveTarget) {
      const dx = moveTarget.x - this.x;
      const dy = moveTarget.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 5) {
        const nx = dx / dist;
        const ny = dy / dist;
        this.x += nx * this.speed * dt;
        this.y += ny * this.speed * dt;
        this.angle = Math.atan2(ny, nx);
      }
    }

    // Clamp to world
    const half = worldSize / 2;
    this.x = Math.max(-half, Math.min(half, this.x));
    this.y = Math.max(-half, Math.min(half, this.y));
  }

  shoot(target, bullets) {
    if (this.ammo <= 0) return;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.2;

    bullets.push({
      x: this.x + Math.cos(angle) * 20,
      y: this.y + Math.sin(angle) * 20,
      vx: Math.cos(angle) * 550,
      vy: Math.sin(angle) * 550,
      damage: this.damage,
      crit: false,
      radius: 4,
      owner: 'enemy',
      enemyId: this.id,
      life: 0.9
    });

    this.ammo--;
    this.fireCooldown = this.fireRate;
  }

  draw(ctx) {
    if (!this.alive) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2);

    drawSkinOnCanvas(ctx, this.skin, 0, 0, 1, false);

    ctx.restore();

    // HP bar
    const barW = 36;
    ctx.save();
    ctx.translate(this.x - barW / 2, this.y - 30);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, barW, 4);
    ctx.fillStyle = this.hp > 60 ? '#22c55e' : this.hp > 30 ? '#f59e0b' : '#ef4444';
    ctx.fillRect(0, 0, barW * (this.hp / this.maxHp), 4);
    if (this.shield > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 5, barW, 3);
      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(0, 5, barW * (this.shield / this.maxShield), 3);
    }
    ctx.restore();
  }
}

function spawnEnemies(count, worldSize, playerX, playerY) {
  const enemies = [];
  for (let i = 0; i < count; i++) {
    let x, y;
    let attempts = 0;
    do {
      x = (Math.random() - 0.5) * worldSize;
      y = (Math.random() - 0.5) * worldSize;
      attempts++;
    } while (Math.hypot(x - playerX, y - playerY) < 200 && attempts < 20);
    enemies.push(new Enemy(x, y, i));
  }
  return enemies;
}
