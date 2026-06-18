const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const WIDTH = 1280;
const HEIGHT = 720;
const FPS_DT = 1 / 60;

const GRAVITY = 0.75;
const PLAYER_SPEED = 6;
const JUMP_SPEED = -15;
const PLAYER_HP_MAX = 100;
const PLAYER_LIVES_MAX = 10;

const COLORS = {
  platform: "#4e5841",
  platformStroke: "#232f23",
  ground: "#374d2d",
  red: "#eb3636",
  cyan: "#48d2f5",
  purple: "#aa5cff",
  yellow: "#f8d850",
  white: "#ebf1f5",
  muted: "#becdd6",
  blood: "#87161b",
};

const assetNames = {
  player: "../artes/jogador.png",
  enemy: "../artes/inimigo.png",
  npc: "../artes/npc.png",
  boss: "../artes/boss.png",
  xp: "../artes/xp.png",
  life: "../artes/vida.png",
  objective: "../artes/objetivo.png",
  night: "../artes/fundo.png",
  day: "../artes/floresta.png",
};

const images = {};
let loaded = 0;
for (const [key, src] of Object.entries(assetNames)) {
  const img = new Image();
  img.src = src;
  img.onload = img.onerror = () => {
    loaded += 1;
    if (loaded === Object.keys(assetNames).length) requestAnimationFrame(loop);
  };
  images[key] = img;
}

const keys = new Set();
const mouse = { x: WIDTH / 2, y: HEIGHT / 2 };

window.addEventListener("keydown", (event) => {
  keys.add(event.key.toLowerCase());
  if (event.key === "F11") event.preventDefault();
  if (event.key === "«") game.player.gainLife();
  if (["x", "z", "c"].includes(event.key.toLowerCase())) {
    game.shoot(event.key.toLowerCase());
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * WIDTH;
  mouse.y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
});

canvas.addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    try {
      await document.documentElement.requestFullscreen();
    } catch (_) {
      // Fullscreen is optional in the browser version.
    }
  }
});

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function drawText(text, x, y, size = 22, color = COLORS.white, align = "left") {
  ctx.font = `700 ${size}px Consolas, monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
}

class Platform {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }

  draw(cameraX) {
    ctx.fillStyle = COLORS.platform;
    ctx.fillRect(this.x - cameraX, this.y, this.w, this.h);
    ctx.strokeStyle = COLORS.platformStroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(this.x - cameraX, this.y, this.w, this.h);
  }
}

class Player {
  constructor() {
    this.x = 90;
    this.y = HEIGHT - 180;
    this.w = 42;
    this.h = 58;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.hp = PLAYER_HP_MAX;
    this.lives = PLAYER_LIVES_MAX;
    this.hasWeapon = false;
    this.invuln = 0;
  }

  get rect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  reset(level) {
    this.x = 90;
    this.y = level < 10 ? HEIGHT - 180 : HEIGHT - 205;
    this.vx = 0;
    this.vy = 0;
    this.hp = PLAYER_HP_MAX;
    this.invuln = 90;
  }

  gainLife() {
    this.lives = Math.min(this.lives + 1, PLAYER_LIVES_MAX);
  }

  update(platforms, levelWidth) {
    this.vx = 0;
    if (keys.has("a") || keys.has("arrowleft")) this.vx = -PLAYER_SPEED;
    if (keys.has("d") || keys.has("arrowright")) this.vx = PLAYER_SPEED;
    if ((keys.has("w") || keys.has("arrowup") || keys.has(" ")) && this.onGround) {
      this.vy = JUMP_SPEED;
      this.onGround = false;
    }

    this.vy = Math.min(this.vy + GRAVITY, 18);
    this.x = clamp(this.x + this.vx, 0, levelWidth - this.w);
    for (const p of platforms) {
      if (rectsOverlap(this.rect, p)) {
        if (this.vx > 0) this.x = p.x - this.w;
        if (this.vx < 0) this.x = p.x + p.w;
      }
    }

    this.y += this.vy;
    this.onGround = false;
    for (const p of platforms) {
      if (rectsOverlap(this.rect, p)) {
        if (this.vy > 0) {
          this.y = p.y - this.h;
          this.vy = 0;
          this.onGround = true;
        } else if (this.vy < 0) {
          this.y = p.y + p.h;
          this.vy = 0;
        }
      }
    }

    this.invuln = Math.max(0, this.invuln - 1);
  }

  draw(cameraX) {
    if (this.invuln && this.invuln % 10 < 5) return;
    ctx.drawImage(images.player, this.x - cameraX, this.y, this.w, this.h);
  }
}

class Enemy {
  constructor(x, y, level) {
    this.x = x;
    this.y = y;
    this.w = 42;
    this.h = 58;
    this.startX = x;
    this.hp = 5;
    this.cured = false;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.speed = 1.2 + Math.min(2.4, level * 0.12);
    this.hitTimer = 0;
  }

  get rect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  update(platforms) {
    if (this.cured) return;
    this.x += this.dir * this.speed;
    if (Math.abs(this.x - this.startX) > 170) this.dir *= -1;
    for (const p of platforms) {
      if (rectsOverlap(this.rect, p)) {
        this.x = this.dir > 0 ? p.x - this.w : p.x + p.w;
        this.dir *= -1;
      }
    }
    this.hitTimer = Math.max(0, this.hitTimer - 1);
  }

  takeDamage(amount) {
    if (this.cured) return;
    this.hp -= amount;
    this.hitTimer = 8;
    if (this.hp <= 0) this.cured = true;
  }

  draw(cameraX) {
    ctx.drawImage(this.cured ? images.npc : images.enemy, this.x - cameraX, this.y, this.w, this.h);
    if (this.hitTimer) {
      ctx.strokeStyle = COLORS.white;
      ctx.strokeRect(this.x - cameraX, this.y, this.w, this.h);
    }
  }
}

class Bullet {
  constructor(x, y, targetX, targetY, damage, speed, color, radius, blast = 0) {
    const dx = targetX - x;
    const dy = targetY - y;
    const length = Math.max(1, Math.hypot(dx, dy));
    this.x = x;
    this.y = y;
    this.vx = (dx / length) * speed;
    this.vy = (dy / length) * speed;
    this.damage = damage;
    this.color = color;
    this.radius = radius;
    this.blast = blast;
    this.life = 130;
  }

  get rect() {
    return { x: this.x - this.radius, y: this.y - this.radius, w: this.radius * 2, h: this.radius * 2 };
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life -= 1;
  }

  draw(cameraX) {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x - cameraX, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Boss {
  constructor(levelWidth) {
    this.x = levelWidth - 270;
    this.y = HEIGHT - 265;
    this.w = 128;
    this.h = 128;
    this.hp = 2000;
    this.maxHp = 2000;
    this.state = "idle";
    this.timer = 120;
    this.laserStart = { x: this.x + this.w / 2, y: this.y + this.h / 2 };
    this.laserEnd = { x: this.x - 800, y: HEIGHT - 200 };
  }

  get rect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  get alive() {
    return this.hp > 0;
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }

  update(player, cameraX) {
    if (!this.alive) return;
    const onScreen = this.x + this.w > cameraX && this.x < cameraX + WIDTH;
    if (!onScreen) return;
    this.timer -= 1;
    if (this.state === "idle" && this.timer <= 0) {
      this.state = "warn";
      this.timer = 30;
      this.laserStart = { x: this.x + this.w / 2, y: this.y + this.h / 2 };
      this.laserEnd = { x: player.x + player.w / 2 + Math.random() * 180 - 90, y: player.y + player.h / 2 };
    } else if (this.state === "warn" && this.timer <= 0) {
      this.state = "fire";
      this.timer = 18;
    } else if (this.state === "fire" && this.timer <= 0) {
      this.state = "idle";
      this.timer = 80 + Math.floor(Math.random() * 40);
    }
  }

  laserHits(player) {
    if (this.state !== "fire") return false;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    const ax = this.laserStart.x;
    const ay = this.laserStart.y;
    const bx = this.laserEnd.x;
    const by = this.laserEnd.y;
    const abx = bx - ax;
    const aby = by - ay;
    const t = clamp(((px - ax) * abx + (py - ay) * aby) / Math.max(1, abx * abx + aby * aby), 0, 1);
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    return Math.hypot(px - cx, py - cy) < 34;
  }

  draw(cameraX) {
    if (this.alive) ctx.drawImage(images.boss, this.x - cameraX, this.y, this.w, this.h);
    if (this.state === "warn" || this.state === "fire") {
      ctx.save();
      ctx.globalAlpha = this.state === "warn" ? 0.5 : 0.95;
      ctx.strokeStyle = "#ff2424";
      ctx.lineWidth = this.state === "warn" ? 18 : 28;
      ctx.beginPath();
      ctx.moveTo(this.laserStart.x - cameraX, this.laserStart.y);
      ctx.lineTo(this.laserEnd.x - cameraX, this.laserEnd.y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

class Game {
  constructor() {
    this.player = new Player();
    this.level = 1;
    this.levelWidth = 3600;
    this.platforms = [];
    this.enemies = [];
    this.pickups = [];
    this.crate = null;
    this.bullets = [];
    this.boss = null;
    this.bossRoomClosed = false;
    this.gameWon = false;
    this.message = "";
    this.messageTimer = 0;
    this.totalXp = 0;
    this.collectedXp = 0;
    this.xAmmo = 0;
    this.zAmmo = 0;
    this.cAmmo = 0;
    this.xCharge = 0;
    this.zCharge = 0;
    this.cCooldown = 0;
    this.buildLevel(1, true);
  }

  setMessage(text, frames = 150) {
    this.message = text;
    this.messageTimer = frames;
  }

  buildLevel(level, fresh = false) {
    const rand = seededRandom(level * 91);
    this.level = level;
    this.levelWidth = level === 10 ? 4200 : 2500 + level * 260;
    this.platforms = [new Platform(0, HEIGHT - 70, this.levelWidth, 70)];
    this.enemies = [];
    this.pickups = [];
    this.crate = null;
    this.bullets = [];
    this.boss = null;
    this.bossRoomClosed = false;

    for (let i = 0; i < 5 + level; i += 1) {
      const x = 330 + i * 280 + Math.floor(rand() * 130 - 65);
      const y = HEIGHT - 170 - (i % 3) * 78 - Math.floor(rand() * 35);
      this.platforms.push(new Platform(x, y, 180, 24));
      if (i % 2 === 0) this.pickups.push({ x: x + 80, y: y - 26, w: 16, h: 16, kind: "xp", taken: false });
    }

    for (let i = 0; i < Math.max(2, level + 1); i += 1) {
      const x = 520 + i * 360 + Math.floor(rand() * 180 - 90);
      this.enemies.push(new Enemy(x, HEIGHT - 128, level));
    }

    if (level === 1 && !this.player.hasWeapon) this.crate = { x: 430, y: HEIGHT - 112, w: 42, h: 42, opened: false };

    if (level < 10) {
      this.pickups.push({ x: this.levelWidth - 150, y: HEIGHT - 110, w: 40, h: 40, kind: "exit", taken: false });
    } else {
      this.platforms.push(
        new Platform(this.levelWidth - 1110, HEIGHT - 175, 210, 24),
        new Platform(this.levelWidth - 875, HEIGHT - 285, 210, 24),
        new Platform(this.levelWidth - 640, HEIGHT - 405, 210, 24),
        new Platform(this.levelWidth - 430, HEIGHT - 285, 190, 24),
        new Platform(this.levelWidth - 335, HEIGHT - 175, 160, 24),
      );
      this.boss = new Boss(this.levelWidth);
    }

    if (fresh) {
      this.totalXp = 0;
      for (let lvl = 1; lvl <= 10; lvl += 1) {
        for (let i = 0; i < 5 + lvl; i += 1) if (i % 2 === 0) this.totalXp += 1;
      }
      this.collectedXp = 0;
    }
    this.player.reset(level);
    this.setMessage(`Level ${level}`, 90);
  }

  restartFromLevelOne() {
    this.player.lives = PLAYER_LIVES_MAX;
    this.player.hp = PLAYER_HP_MAX;
    this.player.hasWeapon = false;
    this.xAmmo = 0;
    this.zAmmo = 0;
    this.cAmmo = 0;
    this.collectedXp = 0;
    this.gameWon = false;
    this.buildLevel(1);
    this.setMessage("Sem vidas: voltaste ao level 1", 180);
  }

  damagePlayer(amount) {
    if (this.player.invuln) return;
    this.player.hp -= amount;
    this.player.invuln = 80;
    if (this.player.hp <= 0) {
      this.player.lives -= 1;
      if (this.player.lives <= 0) this.restartFromLevelOne();
      else {
        this.buildLevel(this.level);
        this.setMessage("Perdeste uma vida", 120);
      }
    }
  }

  shoot(key) {
    if (!this.player.hasWeapon) {
      this.setMessage("Abre a caixa para usar a arma", 90);
      return;
    }
    const targetX = mouse.x + this.cameraX();
    const targetY = mouse.y;
    const originX = this.player.x + this.player.w / 2;
    const originY = this.player.y + this.player.h / 2;
    if (key === "x" && this.xAmmo >= 1) {
      this.xAmmo -= 1;
      this.bullets.push(new Bullet(originX, originY, targetX, targetY, 1, 14, COLORS.cyan, 5));
    } else if (key === "z" && this.zAmmo >= 1) {
      this.zAmmo -= 1;
      this.bullets.push(new Bullet(originX, originY, targetX, targetY, 5, 11, COLORS.purple, 8));
    } else if (key === "c") {
      if (this.collectedXp < this.totalXp) this.setMessage("O poder C pede todos os XP", 100);
      else if (this.cCooldown <= 0 || this.cAmmo > 0) {
        this.cAmmo = Math.max(0, this.cAmmo - 1);
        this.cCooldown = 30;
        this.bullets.push(new Bullet(originX, originY, targetX, targetY, 20, 9, COLORS.yellow, 12, 90));
      }
    }
  }

  cameraX() {
    return clamp(this.player.x + this.player.w / 2 - WIDTH / 2, 0, Math.max(0, this.levelWidth - WIDTH));
  }

  updateAmmo(dt) {
    if (!this.player.hasWeapon) return;
    this.xCharge += dt;
    this.zCharge += dt;
    while (this.xCharge >= 1) {
      this.xAmmo += 1;
      this.xCharge -= 1;
    }
    while (this.zCharge >= 15) {
      this.zAmmo += 1;
      this.zCharge -= 15;
    }
    this.cCooldown = Math.max(0, this.cCooldown - dt);
  }

  updatePickups() {
    if (this.crate && !this.crate.opened && rectsOverlap(this.player.rect, this.crate)) {
      this.crate.opened = true;
      this.player.hasWeapon = true;
      this.xAmmo = Math.max(this.xAmmo, 3);
      this.setMessage("Arma desbloqueada: X, Z e C", 140);
    }
    for (const pickup of this.pickups) {
      if (pickup.taken || !rectsOverlap(this.player.rect, pickup)) continue;
      pickup.taken = true;
      if (pickup.kind === "xp") {
        this.collectedXp += 1;
        this.setMessage(`XP ${this.collectedXp}/${this.totalXp}`, 60);
      } else if (pickup.kind === "exit") {
        this.buildLevel(this.level + 1);
      }
    }
  }

  updateBullets() {
    for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = this.bullets[i];
      bullet.update();
      let remove = bullet.life <= 0 || bullet.x < 0 || bullet.x > this.levelWidth || bullet.y < -80 || bullet.y > HEIGHT + 80;
      const targets = this.enemies.filter((enemy) => !enemy.cured);
      if (this.boss?.alive) targets.push(this.boss);
      for (const target of targets) {
        if (rectsOverlap(bullet.rect, target.rect)) {
          target.takeDamage(bullet.damage);
          if (bullet.blast) {
            for (const enemy of this.enemies) {
              if (!enemy.cured && Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y) < bullet.blast) enemy.takeDamage(bullet.damage);
            }
          }
          remove = true;
          break;
        }
      }
      if (remove) this.bullets.splice(i, 1);
    }
  }

  updateBoss() {
    if (!this.boss) return;
    const gate = this.levelWidth - 1180;
    if (this.player.x + this.player.w / 2 > gate) this.bossRoomClosed = true;
    if (this.bossRoomClosed && this.player.x < gate) this.player.x = gate;
    this.boss.update(this.player, this.cameraX());
    if (this.boss.laserHits(this.player)) {
      this.player.lives -= 1;
      if (this.player.lives <= 0) this.restartFromLevelOne();
      else {
        this.buildLevel(10);
        this.setMessage("Laser do boss: voltaste ao inicio do level 10", 150);
      }
    }
    if (this.boss && !this.boss.alive && !this.gameWon) {
      this.gameWon = true;
      this.enemies.forEach((enemy) => {
        enemy.cured = true;
      });
      this.setMessage("Salvaste a floresta. A floresta voltou a ser dia!", 360);
    }
  }

  update(dt) {
    if (!this.gameWon) {
      this.player.update(this.platforms, this.levelWidth);
      this.updateAmmo(dt);
      this.updatePickups();
      for (const enemy of this.enemies) {
        enemy.update(this.platforms);
        if (!enemy.cured && rectsOverlap(enemy.rect, this.player.rect)) this.damagePlayer(50);
      }
      this.updateBullets();
      this.updateBoss();
      if (this.player.y > HEIGHT + 120) this.damagePlayer(PLAYER_HP_MAX);
    }
    this.messageTimer = Math.max(0, this.messageTimer - 1);
  }

  drawBackground(cameraX) {
    const bg = this.gameWon ? images.day : images.night;
    if (this.gameWon) {
      ctx.drawImage(bg, 0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "rgba(255,255,200,0.12)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    } else {
      const bgX = -((cameraX * 0.2) % WIDTH);
      ctx.drawImage(bg, bgX, 0, WIDTH, HEIGHT);
      ctx.drawImage(bg, bgX + WIDTH, 0, WIDTH, HEIGHT);
    }
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, HEIGHT - 70, WIDTH, 70);
    ctx.strokeStyle = "#2d4123";
    for (let i = 0; i < WIDTH / 20 + 1; i += 1) {
      const gx = i * 20 - ((cameraX * 0.5) % 20);
      ctx.beginPath();
      ctx.moveTo(gx, HEIGHT - 70);
      ctx.lineTo(gx + 10, HEIGHT - 65);
      ctx.stroke();
    }
  }

  drawHud() {
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.fillRect(0, 0, WIDTH, 82);
    drawText(`Save the World  Level ${this.level}/10`, 22, 15, 24);
    drawText("WASD mover  Mouse mirar  X bala  Z especial  C poder final  « +vida", 22, 48, 16, COLORS.muted);
    for (let i = 0; i < this.player.lives; i += 1) ctx.drawImage(images.life, WIDTH - 330 + i * 29, 12, 24, 24);
    ctx.fillStyle = "#3c1212";
    ctx.fillRect(WIDTH - 330, 46, 220, 18);
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(WIDTH - 330, 46, 220 * (this.player.hp / PLAYER_HP_MAX), 18);
    drawText(`HP ${this.player.hp}/${PLAYER_HP_MAX}`, WIDTH - 104, 45, 16);
    drawText(`XP ${this.collectedXp}/${this.totalXp}`, 22, 92, 16, COLORS.yellow);
    const weaponText = this.player.hasWeapon
      ? `Arma: sim  X:${this.xAmmo}  Z:${this.zAmmo}  C:${this.cAmmo}`
      : "Arma: nao (abre a caixa!)";
    drawText(weaponText, 22, 116, 16, this.player.hasWeapon ? COLORS.cyan : "#969696");
    if (this.boss?.alive) {
      ctx.fillStyle = "#2d0a0a";
      ctx.fillRect(WIDTH / 2 - 260, 96, 520, 22);
      ctx.fillStyle = COLORS.red;
      ctx.fillRect(WIDTH / 2 - 260, 96, 520 * (this.boss.hp / this.boss.maxHp), 22);
      drawText(`BOSS ${this.boss.hp}/${this.boss.maxHp}`, WIDTH / 2 - 70, 98, 16);
    }
    if (this.messageTimer && this.message) drawText(this.message, WIDTH / 2, 145, 24, COLORS.white, "center");
    if (this.gameWon) {
      drawText("VITORIA", WIDTH / 2, HEIGHT / 2 - 50, 54, COLORS.white, "center");
      drawText("A floresta esta salva.", WIDTH / 2, HEIGHT / 2 + 8, 24, COLORS.white, "center");
    }
  }

  draw() {
    const cameraX = this.cameraX();
    this.drawBackground(cameraX);
    this.platforms.forEach((platform) => platform.draw(cameraX));
    if (this.crate) {
      ctx.fillStyle = this.crate.opened ? "#46321e" : "#764e26";
      ctx.fillRect(this.crate.x - cameraX, this.crate.y, this.crate.w, this.crate.h);
      ctx.strokeStyle = "#d2a65c";
      ctx.lineWidth = 3;
      ctx.strokeRect(this.crate.x - cameraX, this.crate.y, this.crate.w, this.crate.h);
    }
    for (const pickup of this.pickups) {
      if (pickup.taken) continue;
      const img = pickup.kind === "xp" ? images.xp : images.objective;
      ctx.drawImage(img, pickup.x - cameraX, pickup.y, pickup.w, pickup.h);
    }
    this.enemies.forEach((enemy) => enemy.draw(cameraX));
    if (this.boss) this.boss.draw(cameraX);
    this.bullets.forEach((bullet) => bullet.draw(cameraX));
    this.player.draw(cameraX);
    if (this.bossRoomClosed) {
      ctx.fillStyle = "#501414";
      ctx.fillRect(this.levelWidth - 1180 - cameraX, 80, 18, HEIGHT - 150);
    }
    this.drawHud();
  }
}

const game = new Game();
let last = performance.now();

function loop(now) {
  const elapsed = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(elapsed || FPS_DT);
  game.draw();
  requestAnimationFrame(loop);
}
