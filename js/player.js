// Player class
class Player {
  constructor(x, y, skin) {
    this.x = x;
    this.y = y;
    this.skin = skin;
    this.hp = 100;
    this.maxHp = 100;
    this.shield = 0;
    this.maxShield = 50;
    this.speed = 200;
    this.radius = 14;
    this.angle = 0;

    this.ammo = 30;
    this.ammoReserve = 90;
    this.fireRate = 0.1;
    this.fireCooldown = 0;
    this.reloading = false;
    this.reloadTime = 2.2;
    this.reloadTimer = 0;
    this.damage = 22;
    this.critChance = 0.15;

    this.kills = 0;
    this.alive = true;

    // Movement
    this.vx = 0;
    this.vy = 0;

    // Weapons
    this.weapons = [
      { name: 'Sturmgewehr', icon: '🔫', ammo: 30, reserve: 90, damage: 22, fireRate: 0.1, reloadTime: 2.2, spread: 0.05 },
      { name: 'Schrotflinte', icon: '🪃', ammo: 6, reserve: 36, damage: 80, fireRate: 0.7, reloadTime: 2.8, spread: 0.25, pellets: 6 },
      { name: 'Scharfschütze', icon: '🎯', ammo: 10, reserve: 40, damage: 100, fireRate: 1.5, reloadTime: 3.0, spread: 0.01 }
    ];
    this.currentWeapon = 0;
    this.initWeapon();

    // Inventory items
    this.items = [];
  }

  initWeapon() {
    const w = this.weapons[this.currentWeapon];
    this.ammo = w.ammo;
    this.ammoReserve = w.reserve;
    this.damage = w.damage;
    this.fireRate = w.fireRate;
    this.reloadTime = w.reloadTime;
    this.fireCooldown = 0;
    this.reloading = false;
    this.reloadTimer = 0;
  }

  switchWeapon(idx) {
    if (idx === this.currentWeapon) return;
    const old = this.weapons[this.currentWeapon];
    old.ammo = this.ammo;
    old.reserve = this.ammoReserve;

    this.currentWeapon = idx;
    const w = this.weapons[idx];
    this.ammo = w.ammo;
    this.ammoReserve = w.reserve;
    this.damage = w.damage;
    this.fireRate = w.fireRate;
    this.reloadTime = w.reloadTime;
    this.fireCooldown = 0;
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
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  addShield(amount) {
    this.shield = Math.min(this.maxShield, this.shield + amount);
  }

  startReload() {
    if (this.reloading) return;
    if (this.ammoReserve <= 0) return;
    if (this.ammo >= this.weapons[this.currentWeapon].ammo) return;
    this.reloading = true;
    this.reloadTimer = this.reloadTime;
  }

  update(dt, keys, mouseX, mouseY) {
    if (!this.alive) return;

    const canvas = document.getElementById('game-canvas');
    const mx = mouseX - canvas.width / 2;
    const my = mouseY - canvas.height / 2;
    this.angle = Math.atan2(my, mx);

    // Movement
    let dx = 0, dy = 0;
    if (keys['KeyW'] || keys['ArrowUp'])    dy -= 1;
    if (keys['KeyS'] || keys['ArrowDown'])  dy += 1;
    if (keys['KeyA'] || keys['ArrowLeft'])  dx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) dx += 1;

    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

    this.vx += (dx * this.speed - this.vx) * Math.min(1, dt * 12);
    this.vy += (dy * this.speed - this.vy) * Math.min(1, dt * 12);
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Reload
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const w = this.weapons[this.currentWeapon];
        const needed = w.ammo - this.ammo;
        const take = Math.min(needed, this.ammoReserve);
        this.ammo += take;
        this.ammoReserve -= take;
        this.reloading = false;
      }
    }

    // Fire cooldown
    if (this.fireCooldown > 0) this.fireCooldown -= dt;

    // Auto reload on empty
    if (this.ammo <= 0 && !this.reloading) this.startReload();

    // Weapon switch
    if (keys['Digit1']) this.switchWeapon(0);
    if (keys['Digit2']) this.switchWeapon(1);
    if (keys['Digit3']) this.switchWeapon(2);
    if (keys['KeyR']) this.startReload();
  }

  tryShoot(bullets) {
    if (this.fireCooldown > 0 || this.reloading || this.ammo <= 0) return false;
    const w = this.weapons[this.currentWeapon];
    const pellets = w.pellets || 1;

    for (let i = 0; i < pellets; i++) {
      const spread = (Math.random() - 0.5) * w.spread;
      const angle = this.angle + spread;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? Math.floor(w.damage * 1.5) : w.damage;

      bullets.push({
        x: this.x + Math.cos(this.angle) * 20,
        y: this.y + Math.sin(this.angle) * 20,
        vx: Math.cos(angle) * 700,
        vy: Math.sin(angle) * 700,
        damage: dmg,
        crit,
        radius: 4,
        owner: 'player',
        life: 0.8
      });
    }

    this.ammo--;
    this.fireCooldown = w.fireRate;
    return true;
  }

  draw(ctx) {
    if (!this.alive) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2);

    drawSkinOnCanvas(ctx, this.skin, 0, 0, 1, false);

    // Gun
    ctx.save();
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#333';
    ctx.fillRect(12, -3, 18, 5);
    ctx.fillStyle = '#555';
    ctx.fillRect(12, -2, 14, 3);
    ctx.restore();

    ctx.restore();

    // Shield bar above player
    if (this.shield > 0) {
      ctx.save();
      ctx.translate(this.x, this.y - 28);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-18, 0, 36, 5);
      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(-18, 0, 36 * (this.shield / this.maxShield), 5);
      ctx.restore();
    }
  }
}
