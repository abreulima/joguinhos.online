const BASE_ZOOM = 1.4;
const BATTLE_ZOOM = 1.82;
const FPS = 60;
const PLAYER_SPEED = 5;
const PROJECTILE_SPEED = 11;
const GRAVITY = 0.8;
const JUMP_VELOCITY = 14;

const ASSETS = {
  background: "Artes/fundo.png",
  title: "Artes/capa.png",
  player: "Artes/jogador.png",
  enemy: "Artes/inimigo.png",
  boss: "Artes/boss.png",
  objective: "Artes/objetivo.png",
  heal: "Artes/cura.png",
  collect: "Artes/coletavel.png",
  special: "Artes/especial.png",
};

const LEVELS = [
  ["Guardiao do Eco", "dash"],
  ["Bruxa do Circulo", "orbit"],
  ["Cacador do Veu", "homing"],
  ["Espirito da Nevoa", "teleport"],
  ["Arauto do Sangue", "split"],
  ["Boss Final", "boss"],
];

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function rectsIntersect(a, b) {
  return !(
    a.x + a.w < b.x ||
    a.x > b.x + b.w ||
    a.y + a.h < b.y ||
    a.y > b.y + b.h
  );
}

function normalizeKey(raw) {
  const key = raw.toLowerCase();
  if (key === " ") return "space";
  if (key === "arrowleft") return "left";
  if (key === "arrowright") return "right";
  if (key === "arrowup") return "up";
  if (key === "arrowdown") return "down";
  return key;
}

class SpriteBank {
  constructor() {
    this.cache = new Map();
  }

  load(path) {
    if (this.cache.has(path)) {
      return this.cache.get(path);
    }
    const image = new Image();
    const promise = new Promise((resolve) => {
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
    });
    image.src = path;
    this.cache.set(path, promise);
    return promise;
  }

  async loadAll() {
    const entries = await Promise.all(
      Object.entries(ASSETS).map(async ([key, path]) => [key, await this.load(path)])
    );
    this.images = Object.fromEntries(entries);
  }

  get(key) {
    return this.images?.[key] ?? null;
  }
}

class Entity {
  constructor(x, y, w, h, hp = 1) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.hp = hp;
    this.maxHp = hp;
    this.alive = true;
  }

  get rect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }
}

class Platform extends Entity {}

class BloodParticle extends Entity {
  constructor(x, y, vx, vy, color, life) {
    super(x, y, 4, 4);
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.life = life;
    this.gravity = 0.35;
  }
}

class Player extends Entity {
  constructor(x, y) {
    super(x, y, 28, 28, 6);
    this.vx = 0;
    this.vy = 0;
    this.invulnerable = 0;
    this.attackCooldown = 0;
    this.specialCooldown = 0;
    this.facingDir = 1;
    this.onGround = false;
  }
}

class Enemy extends Entity {
  constructor(x, y, kind, hp = 3) {
    super(x, y, 34, 34, hp);
    this.kind = kind;
    this.timer = 0;
    this.phase = 0;
    this.anchorX = x;
    this.anchorY = y;
  }
}

class Projectile extends Entity {
  constructor(x, y, vx, vy, owner, color, damage = 1, radius = 6) {
    super(x - radius, y - radius, radius * 2, radius * 2);
    this.vx = vx;
    this.vy = vy;
    this.owner = owner;
    this.color = color;
    this.damage = damage;
  }
}

class Pickup extends Entity {
  constructor(x, y, kind) {
    super(x, y, 20, 20);
    this.kind = kind;
  }
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = true;

    this.sprites = new SpriteBank();
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.state = "title";
    this.running = true;
    this.fullscreen = false;
    this.message = "";
    this.messageTimer = 0;
    this.keysDown = new Set();
    this.uiButtons = [];
    this.awaitingBinding = null;
    this.controlBindings = {
      left: "a",
      right: "d",
      jump: "w",
      attack: "x",
      special: "lshift",
    };

    this.levelIndex = 0;
    this.maxUnlockedLevel = 0;
    this.levels = LEVELS;
    this.worldWidth = 2800;
    this.groundY = Math.floor(this.height * 0.82);
    this.worldHeight = this.groundY + 320;

    this.cameraX = 0;
    this.cameraY = 0;
    this.cameraShakeX = 0;
    this.cameraShakeY = 0;
    this.cameraZoom = BASE_ZOOM;
    this.shake = 0;

    this.goalSpawned = false;
    this.collectiblesTotal = 5;
    this.collectiblesCollected = 0;
    this.doorOpen = false;
    this.keysTotal = 5;
    this.keysCollected = 0;
    this.bossSpawned = false;

    this.score = 0;
    this.currentLevel = null;
    this.objective = null;
    this.boss = null;

    this.player = new Player(160, this.groundY - 28);
    this.platforms = [];
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.bloodParticles = [];

    this.boundLoop = this.loop.bind(this);
    this.bindEvents();
  }

  async init() {
    await this.sprites.loadAll();
    this.startTitle();
    requestAnimationFrame(this.boundLoop);
  }

  bindEvents() {
    window.addEventListener("keydown", (event) => this.onKeyDown(event));
    window.addEventListener("keyup", (event) => this.onKeyUp(event));
    this.canvas.addEventListener("click", (event) => this.onClick(event));
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "playing") {
        this.state = "paused";
      }
    });
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    if (this.state !== "playing") {
      this.draw();
    }
  }

  setMessage(text, timer = 90) {
    this.message = text;
    this.messageTimer = timer;
  }

  isPressed(binding) {
    if (this.keysDown.has(binding)) return true;
    if (binding === "left" && this.keysDown.has("arrowleft")) return true;
    if (binding === "right" && this.keysDown.has("arrowright")) return true;
    if (binding === "jump" && (this.keysDown.has("up") || this.keysDown.has("space"))) return true;
    if (binding === "attack" && this.keysDown.has("z")) return true;
    if (binding === "special" && this.keysDown.has("shift")) return true;
    return false;
  }

  onKeyDown(event) {
    const key = normalizeKey(event.key);
    this.keysDown.add(key);

    if (["arrowleft", "arrowright", "arrowup", "arrowdown", "space"].includes(key)) {
      event.preventDefault();
    }

    if (this.awaitingBinding) {
      if (key === "escape") {
        this.awaitingBinding = null;
        return;
      }
      this.controlBindings[this.awaitingBinding] = key;
      this.awaitingBinding = null;
      this.setMessage(`Comando atualizado: ${key.toUpperCase()}`, 100);
      return;
    }

    if (key === "f11") {
      this.toggleFullscreen();
      return;
    }

    if (key === "escape") {
      if (this.state === "title") {
        this.running = false;
      } else if (this.state === "level_select" || this.state === "commands") {
        this.startTitle();
      } else if (this.state === "paused") {
        this.state = "playing";
      } else {
        this.state = this.state === "playing" ? "paused" : "playing";
      }
      return;
    }

    if (this.state === "title" && (key === "enter" || key === "space")) {
      this.startLevelSelect();
      return;
    }

    if (this.state === "level_select" && (key === "enter" || key === "space")) {
      this.startGame(0);
      return;
    }

    if (this.state === "commands" && key === "enter") {
      this.startTitle();
      return;
    }

    if ((this.state === "gameover" || this.state === "victory") && (key === "enter" || key === "r")) {
      this.startTitle();
      return;
    }

    if (this.state !== "playing") return;

    if (key === this.controlBindings.jump || key === "space" || key === "up") {
      if (this.player.onGround) {
        this.player.vy = -JUMP_VELOCITY;
        this.player.onGround = false;
      }
    }
  }

  onKeyUp(event) {
    this.keysDown.delete(normalizeKey(event.key));
  }

  onClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (this.canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (this.canvas.height / rect.height);

    for (const button of this.uiButtons) {
      if (x >= button.x1 && x <= button.x2 && y >= button.y1 && y <= button.y2) {
        if (button.locked) {
          this.setMessage("Nivel bloqueado", 90);
          return;
        }

        switch (button.action) {
          case "play":
            this.startLevelSelect();
            return;
          case "commands":
            this.state = "commands";
            this.awaitingBinding = null;
            return;
          case "back_title":
            this.startTitle();
            return;
          case "back_select":
            this.startLevelSelect();
            return;
          case "start_level":
            this.startGame(button.levelIndex);
            return;
          default:
            if (button.action.startsWith("bind_")) {
              this.awaitingBinding = button.action.replace("bind_", "");
              return;
            }
        }
      }
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  startTitle() {
    this.state = "title";
    this.message = "";
    this.messageTimer = 0;
    this.awaitingBinding = null;
    this.levelIndex = 0;
    this.cameraX = 0;
    this.cameraY = 0;
    this.cameraShakeX = 0;
    this.cameraShakeY = 0;
    this.cameraZoom = BASE_ZOOM;
    this.goalSpawned = false;
    this.collectiblesCollected = 0;
    this.doorOpen = false;
    this.bossSpawned = false;
    this.platforms = [];
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.bloodParticles = [];
    this.objective = null;
    this.boss = null;
    this.currentLevel = null;
    this.score = 0;
    this.player = new Player(160, this.groundY - 28);
  }

  startLevelSelect() {
    this.state = "level_select";
    this.message = "";
    this.messageTimer = 0;
    this.awaitingBinding = null;
  }

  startGame(levelIndex) {
    this.levelIndex = levelIndex;
    this.state = "playing";
    this.score = 0;
    this.shake = 0;
    this.player = new Player(160, this.groundY - 28);
    this.cameraZoom = BASE_ZOOM;
    this.spawnLevel(levelIndex);
  }

  spawnLevel(index) {
    this.currentLevel = this.levels[index];
    this.worldWidth = 2800;
    this.groundY = Math.floor(this.height * 0.82);
    this.worldHeight = this.groundY + 320;
    this.cameraX = 0;
    this.cameraY = 0;
    this.cameraShakeX = 0;
    this.cameraShakeY = 0;
    this.cameraZoom = BASE_ZOOM;
    this.goalSpawned = false;
    this.collectiblesTotal = 5;
    this.collectiblesCollected = 0;
    this.doorOpen = false;
    this.bossSpawned = false;
    this.objective = null;
    this.boss = null;
    this.projectiles = [];
    this.pickups = [];
    this.bloodParticles = [];
    this.platforms = this.buildPlatformLevel(index);
    this.enemies = [];

    const enemyX = this.worldWidth - 360;
    let enemyY = this.groundY - 34;
    const enemyKind = this.currentLevel[1];

    if (enemyKind !== "boss") {
      if (enemyKind === "orbit") enemyY -= 90;
      if (enemyKind === "homing") enemyY -= 40;
      if (enemyKind === "teleport") enemyY -= 120;
      if (enemyKind === "split") enemyY -= 30;
      this.enemies.push(new Enemy(enemyX, enemyY, enemyKind, 3 + index));
    }

    this.pickups.push(
      new Pickup(280, this.groundY - 110, "collect"),
      new Pickup(620, this.groundY - 180, "collect"),
      new Pickup(1040, this.groundY - 140, "collect"),
      new Pickup(1560, this.groundY - 190, "collect"),
      new Pickup(this.worldWidth - 620, this.groundY - 150, "collect"),
      new Pickup(920, this.groundY - 90, "heal"),
      new Pickup(1400, this.groundY - 120, "special")
    );

    if (index !== this.levels.length - 1) {
      this.spawnExit();
    } else {
      this.spawnExit();
    }
  }

  buildPlatformLevel(index) {
    const p = [];
    const groundH = 40;
    p.push(
      new Platform(0, this.groundY, 500, groundH),
      new Platform(640, this.groundY, 440, groundH),
      new Platform(1180, this.groundY, 420, groundH),
      new Platform(1760, this.groundY, 1040, groundH)
    );

    if (index === 0) {
      p.push(
        new Platform(180, this.groundY - 90, 220, 20),
        new Platform(760, this.groundY - 130, 180, 20),
        new Platform(1320, this.groundY - 100, 200, 20),
        new Platform(1960, this.groundY - 150, 180, 20)
      );
    } else if (index === 1) {
      p.push(
        new Platform(160, this.groundY - 60, 160, 20),
        new Platform(420, this.groundY - 150, 170, 20),
        new Platform(860, this.groundY - 210, 190, 20),
        new Platform(1500, this.groundY - 120, 210, 20),
        new Platform(2060, this.groundY - 180, 160, 20)
      );
    } else if (index === 2) {
      p.push(
        new Platform(240, this.groundY - 100, 150, 20),
        new Platform(560, this.groundY - 180, 200, 20),
        new Platform(940, this.groundY - 240, 170, 20),
        new Platform(1320, this.groundY - 150, 180, 20),
        new Platform(2140, this.groundY - 220, 180, 20)
      );
    } else if (index === 3) {
      p.push(
        new Platform(240, this.groundY - 80, 170, 20),
        new Platform(500, this.groundY - 170, 160, 20),
        new Platform(840, this.groundY - 110, 180, 20),
        new Platform(1180, this.groundY - 220, 220, 20),
        new Platform(1620, this.groundY - 140, 200, 20),
        new Platform(2140, this.groundY - 170, 170, 20)
      );
    } else if (index === 4) {
      p.push(
        new Platform(180, this.groundY - 120, 160, 20),
        new Platform(460, this.groundY - 200, 170, 20),
        new Platform(820, this.groundY - 260, 200, 20),
        new Platform(1200, this.groundY - 200, 160, 20),
        new Platform(1560, this.groundY - 120, 200, 20),
        new Platform(2040, this.groundY - 240, 210, 20)
      );
    }

    return p;
  }

  spawnExit() {
    if (this.goalSpawned) return;
    this.goalSpawned = true;
    this.objective = new Pickup(this.worldWidth - 120, this.groundY - 34, "objective");
    this.objective.w = 34;
    this.objective.h = 34;
    this.doorOpen = false;
  }

  spawnBoss() {
    this.boss = new Enemy(this.worldWidth - 360, this.groundY - 130, "boss", 24);
    this.boss.w = 92;
    this.boss.h = 92;
    this.enemies = [this.boss];
    this.bossSpawned = true;
    this.doorOpen = true;
    this.setMessage("O boss apareceu", 150);
    this.shake = Math.max(this.shake, 6);
  }

  spawnKeyDrop(enemy) {
    this.pickups.push(new Pickup(enemy.x + enemy.w / 2, enemy.y, "key"));
  }

  spawnBloodExplosion(enemy) {
    const colors = ["#6f0000", "#9f0000", "#c00018", "#7d0d0d"];
    for (let i = 0; i < 28; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 6;
      this.bloodParticles.push(
        new BloodParticle(
          enemy.x + enemy.w / 2,
          enemy.y + enemy.h / 2,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed - Math.random() * 2,
          colors[Math.floor(Math.random() * colors.length)],
          25 + Math.floor(Math.random() * 45)
        )
      );
    }
  }

  update() {
    if (this.state !== "playing") return;

    this.handlePlayerMovement();
    this.handlePlayerAttacks();
    this.updateEnemies();
    this.updateProjectiles();
    this.updateBloodParticles();
    this.updatePickups();
    this.updateObjective();
    this.resolveCollisions();
    this.updateCamera();
  }

  updateCamera() {
    const bossActive = this.boss && this.boss.alive;
    const targetZoom = bossActive ? BATTLE_ZOOM : BASE_ZOOM;
    this.cameraZoom += (targetZoom - this.cameraZoom) * 0.08;

    const viewportWidth = this.width / this.cameraZoom;
    const viewportHeight = this.height / this.cameraZoom;

    let targetX;
    let targetY;
    if (bossActive) {
      const focusX = (this.player.x + this.player.w / 2 + this.boss.x + this.boss.w / 2) / 2;
      const focusY = (this.player.y + this.player.h / 2 + this.boss.y + this.boss.h / 2) / 2 - 20;
      targetX = focusX - viewportWidth * 0.5;
      targetY = focusY - viewportHeight * 0.5;
    } else {
      const lookAheadX = clamp(this.player.vx * 8 + this.player.facingDir * 30, -75, 75);
      const lookAheadY = clamp(this.player.vy * 2.8, -48, 60);
      targetX = this.player.x + this.player.w / 2 + lookAheadX - viewportWidth * 0.44;
      targetY = this.player.y + this.player.h / 2 + lookAheadY - viewportHeight * 0.54;
    }

    targetX = clamp(targetX, 0, Math.max(0, this.worldWidth - viewportWidth));
    targetY = clamp(targetY, 0, Math.max(0, this.worldHeight - viewportHeight));

    const lerpX = this.player.onGround ? 0.11 : 0.07;
    const lerpY = this.player.onGround ? 0.1 : 0.08;
    this.cameraX += (targetX - this.cameraX) * lerpX;
    this.cameraY += (targetY - this.cameraY) * lerpY;

    if (this.shake > 0) {
      const strength = this.shake * 0.6;
      this.cameraShakeX = (Math.random() * 2 - 1) * strength;
      this.cameraShakeY = (Math.random() * 2 - 1) * strength;
    } else {
      this.cameraShakeX = 0;
      this.cameraShakeY = 0;
    }
  }

  handlePlayerMovement() {
    let dx = 0;
    if (this.isPressed(this.controlBindings.left)) dx -= PLAYER_SPEED;
    if (this.isPressed(this.controlBindings.right)) dx += PLAYER_SPEED;
    if (dx !== 0) {
      this.player.facingDir = dx > 0 ? 1 : -1;
    }

    this.player.vx = dx;
    this.player.x += dx;
    this.player.vy += GRAVITY;
    this.player.y += this.player.vy;
    this.player.x = clamp(this.player.x, 0, this.worldWidth - this.player.w);
    this.resolvePlatformCollisions();

    if (this.player.attackCooldown > 0) this.player.attackCooldown -= 1;
    if (this.player.specialCooldown > 0) this.player.specialCooldown -= 1;
  }

  handlePlayerAttacks() {
    if (this.isPressed(this.controlBindings.attack) && this.player.attackCooldown === 0) {
      const fx = this.player.facingDir;
      this.projectiles.push(
        new Projectile(
          this.player.x + this.player.w / 2 + fx * 16,
          this.player.y + this.player.h / 2,
          fx * PROJECTILE_SPEED,
          0,
          "player",
          "#d8c38c",
          1,
          6
        )
      );
      this.player.attackCooldown = 12;
    }

    if (this.isPressed(this.controlBindings.special) && this.player.specialCooldown === 0) {
      const fx = this.player.facingDir;
      for (const angle of [-0.2, 0, 0.2]) {
        const vx = fx * Math.cos(angle) * PROJECTILE_SPEED * 1.25;
        const vy = Math.sin(angle) * PROJECTILE_SPEED * 1.25;
        this.projectiles.push(
          new Projectile(
            this.player.x + this.player.w / 2,
            this.player.y + this.player.h / 2,
            vx,
            vy,
            "player",
            "#ff8f6b",
            2,
            7
          )
        );
      }
      this.player.specialCooldown = 90;
    }
  }

  updateEnemies() {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.timer += 1;
      if (this.boss && enemy === this.boss) {
        this.bossPattern(enemy);
        continue;
      }
      if (enemy.kind === "dash") this.enemyDash(enemy);
      if (enemy.kind === "orbit") this.enemyOrbit(enemy);
      if (enemy.kind === "homing") this.enemyHoming(enemy);
      if (enemy.kind === "teleport") this.enemyTeleport(enemy);
      if (enemy.kind === "split") this.enemySplit(enemy);
    }
  }

  enemyDash(enemy) {
    if (enemy.timer % 70 === 1) {
      enemy.phase = 18;
      enemy.anchorX = enemy.x;
    }
    if (enemy.phase > 0) {
      const direction = this.player.x > enemy.x ? 1 : -1;
      enemy.x += direction * 7;
      enemy.phase -= 1;
    }
  }

  enemyOrbit(enemy) {
    enemy.anchorX = enemy.anchorX || enemy.x;
    enemy.anchorY = enemy.anchorY || enemy.y;
    enemy.x = enemy.anchorX + Math.cos(enemy.timer * 0.05) * 120;
    enemy.y = enemy.anchorY + Math.sin(enemy.timer * 0.05) * 60;
    if (enemy.timer % 80 === 0) this.fireAtPlayer(enemy, 1, "#ccff66");
  }

  enemyHoming(enemy) {
    if (enemy.timer % 2 === 0) {
      const direction = this.player.x > enemy.x ? 1 : -1;
      enemy.x += direction * 3.2;
    }
    if (enemy.timer % 70 === 0) this.fireAtPlayer(enemy, 1.4, "#7bffcf");
  }

  enemyTeleport(enemy) {
    if (enemy.timer % 75 === 0) {
      enemy.x = this.width * 0.4 + Math.random() * (this.worldWidth - 240 - this.width * 0.4);
      enemy.y = this.groundY - 280 + Math.random() * 160;
      this.fireSpread(enemy, 6, 1, "#ffcc66");
    }
    if (enemy.timer % 16 === 0) {
      this.shake = Math.max(this.shake, 2);
    }
  }

  enemySplit(enemy) {
    if (enemy.timer % 50 === 0) this.fireSpread(enemy, 8, 1, "#ff4b70");
    if (enemy.timer % 90 === 0) enemy.phase = 1 - enemy.phase;
    enemy.x += (enemy.phase ? 1.2 : -1.2) + Math.sin(enemy.timer * 0.05) * 1.2;
    enemy.y += Math.cos(enemy.timer * 0.03) * 1.2;
  }

  bossPattern(boss) {
    if (boss.timer % 18 === 0) this.fireAtPlayer(boss, 1.8, "#ffffff");
    if (boss.timer % 46 === 0) this.fireSpread(boss, 10, 1.2, "#e06cff");
    if (boss.timer % 110 === 0) {
      boss.x = this.width * 0.5 + Math.random() * (this.worldWidth - 260 - this.width * 0.5);
      boss.y = this.groundY - 280 + Math.random() * 160;
      this.shake = Math.max(this.shake, 6);
    }
  }

  fireAtPlayer(enemy, speedFactor = 1, color = "#ccff66") {
    const dx = this.player.x - enemy.x;
    const dy = this.player.y - enemy.y;
    const angle = Math.atan2(dy, dx);
    this.projectiles.push(
      new Projectile(
        enemy.x + enemy.w / 2,
        enemy.y + enemy.h / 2,
        Math.cos(angle) * PROJECTILE_SPEED * speedFactor,
        Math.sin(angle) * PROJECTILE_SPEED * speedFactor,
        "enemy",
        color,
        1,
        6
      )
    );
  }

  fireSpread(enemy, count = 5, speedFactor = 1, color = "#ffcc66") {
    const baseAngle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
    const spread = 0.38;
    const angles = count === 1
      ? [baseAngle]
      : Array.from({ length: count }, (_, i) => baseAngle + spread * (i - (count - 1) / 2));
    for (const angle of angles) {
      this.projectiles.push(
        new Projectile(
          enemy.x + enemy.w / 2,
          enemy.y + enemy.h / 2,
          Math.cos(angle) * PROJECTILE_SPEED * speedFactor,
          Math.sin(angle) * PROJECTILE_SPEED * speedFactor,
          "enemy",
          color,
          1,
          5
        )
      );
    }
  }

  updateProjectiles() {
    for (const projectile of this.projectiles) {
      projectile.x += projectile.vx;
      projectile.y += projectile.vy;
      if (
        projectile.x < -40 ||
        projectile.x > this.worldWidth + 80 ||
        projectile.y < -80 ||
        projectile.y > this.height + 120
      ) {
        projectile.alive = false;
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  updateBloodParticles() {
    for (const particle of this.bloodParticles) {
      particle.life -= 1;
      particle.vy += particle.gravity;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vx *= 0.98;
      particle.vy *= 0.98;
      if (particle.life <= 0 || particle.y > this.height + 120) {
        particle.alive = false;
      }
    }
    this.bloodParticles = this.bloodParticles.filter((p) => p.alive);
  }

  updatePickups() {
    for (const pickup of this.pickups) {
      if (!pickup.alive) continue;
      if (!rectsIntersect(this.player.rect, pickup.rect)) continue;

      pickup.alive = false;
      if (pickup.kind === "heal") {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
        this.setMessage("Encontraste cura", 120);
      } else if (pickup.kind === "special") {
        this.score += 50;
        this.setMessage("Poder especial absorvido", 120);
      } else if (pickup.kind === "collect") {
        this.score += 25;
        this.collectiblesCollected += 1;
        if (this.collectiblesCollected < this.collectiblesTotal) {
          this.setMessage(`Coletavel ${this.collectiblesCollected}/${this.collectiblesTotal}`, 90);
        } else {
          this.doorOpen = true;
          this.setMessage("A porta abriu", 120);
        }
      } else if (pickup.kind === "key") {
        this.keysCollected += 1;
        this.setMessage(`Chave ${this.keysCollected}/${this.keysTotal}`, 120);
        if (this.keysCollected >= this.keysTotal) {
          this.doorOpen = true;
        }
      }
    }
    this.pickups = this.pickups.filter((p) => p.alive);
  }

  updateObjective() {
    if (!this.objective || !this.objective.alive) return;
    if (!rectsIntersect(this.player.rect, this.objective.rect)) return;

    const finalLevel = this.levelIndex >= this.levels.length - 1;
    if (finalLevel) {
      if (this.enemies.some((enemy) => enemy.alive && enemy.kind !== "boss")) {
        this.setMessage("Derrota todos os inimigos primeiro", 90);
        return;
      }
      if (this.keysCollected < this.keysTotal) {
        this.setMessage("Precisas das 5 chaves", 90);
        return;
      }
      if (!this.bossSpawned) {
        this.spawnBoss();
        return;
      }
      if (this.boss && this.boss.alive) {
        return;
      }
      this.state = "victory";
      this.setMessage("Voltaste ao mundo normal", 999);
      return;
    }

    if (this.enemies.some((enemy) => enemy.alive)) {
      this.setMessage("Derrota o inimigo antes de sair", 90);
      return;
    }
    if (!this.doorOpen) {
      this.setMessage("Precisas dos 5 coletaveis", 90);
      return;
    }
    this.levelIndex += 1;
    this.maxUnlockedLevel = Math.max(this.maxUnlockedLevel, this.levelIndex);
    this.spawnLevel(this.levelIndex);
  }

  updateTimers() {
    if (this.player.invulnerable > 0) this.player.invulnerable -= 1;
    if (this.messageTimer > 0) this.messageTimer -= 1;
    if (this.shake > 0) this.shake -= 1;
  }

  resolvePlatformCollisions() {
    this.player.onGround = false;
    const beforeY = this.player.y - this.player.vy;
    for (const platform of this.platforms) {
      if (!rectsIntersect(this.player.rect, platform.rect)) continue;

      if (this.player.vy >= 0 && beforeY + this.player.h <= platform.y + 10) {
        this.player.y = platform.y - this.player.h;
        this.player.vy = 0;
        this.player.onGround = true;
      } else if (this.player.vy < 0 && beforeY >= platform.y + platform.h - 10) {
        this.player.y = platform.y + platform.h;
        this.player.vy = 0;
      }
    }

    if (this.player.y > this.height + 200) {
      this.state = "gameover";
    }
  }

  resolveCollisions() {
    for (const projectile of this.projectiles) {
      if (projectile.owner === "player") {
        const targets = this.enemies.filter((enemy) => enemy.alive);
        for (const enemy of targets) {
          if (!rectsIntersect(projectile.rect, enemy.rect)) continue;
          enemy.hp -= projectile.damage;
          projectile.alive = false;
          if (enemy.hp <= 0 && enemy.alive) {
            enemy.alive = false;
            this.score += 100;
            this.setMessage("Inimigo derrotado", 90);
            this.spawnBloodExplosion(enemy);
            if (enemy.kind !== "boss") {
              this.spawnKeyDrop(enemy);
            }
            this.spawnExit();
          }
          break;
        }
      } else if (rectsIntersect(projectile.rect, this.player.rect) && this.player.invulnerable === 0) {
        this.player.hp -= projectile.damage;
        this.player.invulnerable = 60;
        projectile.alive = false;
        this.shake = Math.max(this.shake, 4);
        if (this.player.hp <= 0) {
          this.state = "gameover";
        }
      }
    }

    this.projectiles = this.projectiles.filter((p) => p.alive);

    for (const enemy of this.enemies) {
      if (enemy.alive && rectsIntersect(this.player.rect, enemy.rect) && this.player.invulnerable === 0) {
        this.player.hp -= 1;
        this.player.invulnerable = 45;
        this.shake = Math.max(this.shake, 3);
        if (this.player.hp <= 0) {
          this.state = "gameover";
        }
      }
    }
  }

  loop() {
    if (!this.running) return;
    this.updateTimers();
    if (this.state === "playing") {
      this.update();
    }
    this.draw();
    requestAnimationFrame(this.boundLoop);
  }

  draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.uiButtons = [];

    if (this.state === "title") {
      this.drawTitle();
    } else if (this.state === "level_select") {
      this.drawLevelSelect();
    } else if (this.state === "commands") {
      this.drawCommands();
    } else {
      this.drawGameplay();
      if (this.state === "paused") this.drawOverlay("PAUSADO", "Pressiona Esc para voltar");
      if (this.state === "gameover") this.drawOverlay("GAME OVER", "Enter ou R para recomeçar");
      if (this.state === "victory") this.drawOverlay("VITORIA", "Enter ou R para voltar ao inicio");
    }
  }

  drawTitle() {
    const ctx = this.ctx;
    ctx.fillStyle = "#050407";
    ctx.fillRect(0, 0, this.width, this.height);
    const bg = this.sprites.get("title");
    if (bg) {
      ctx.drawImage(bg, 0, 0, this.width, this.height);
    }
    ctx.fillStyle = "rgba(5, 4, 7, 0.50)";
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawButton(this.width * 0.18, this.height * 0.82, 220, 60, "JOGAR", "play");
    this.drawButton(this.width * 0.42, this.height * 0.82, 260, 60, "COMANDOS", "commands");
    ctx.fillStyle = "#f0dfcf";
    ctx.font = "14px Consolas";
    ctx.textAlign = "center";
    ctx.fillText("F11 fullscreen | Esc sair | Enter jogar", this.width * 0.5, this.height * 0.93);
  }

  drawLevelSelect() {
    const ctx = this.ctx;
    ctx.fillStyle = "#050407";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = "#f0dfcf";
    ctx.font = "bold 30px Georgia";
    ctx.textAlign = "center";
    ctx.fillText("Selecao de Niveis", this.width * 0.5, 70);

    const levelW = 220;
    const levelH = 90;
    const startX = this.width * 0.10;
    const startY = 160;
    const gapX = 40;
    const gapY = 30;
    const cols = 3;

    this.levels.forEach((level, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = startX + col * (levelW + gapX);
      const y = startY + row * (levelH + gapY);
      const label = i === this.levels.length - 1 ? "5 CADEADOS" : `${i + 1}`;
      const locked = i > this.maxUnlockedLevel;
      const fill = locked ? "#171117" : "#2b1d24";
      const outline = locked ? "#4c3a44" : "#7f5663";
      const text = locked ? `${label}\nBLOQUEADO` : `${label}\n${level[0]}`;
      this.drawButton(x, y, levelW, levelH, text, "start_level", fill, outline, i, locked);
    });

    this.drawButton(this.width * 0.36, this.height * 0.86, 260, 56, "VOLTAR", "back_title");
    ctx.fillStyle = "#cdb8b8";
    ctx.font = "14px Consolas";
    ctx.fillText("Escolhe um nivel e entra no submundo", this.width * 0.5, this.height * 0.78);

    if (this.message && this.messageTimer > 0) {
      ctx.fillStyle = "#f7d8b7";
      ctx.font = "bold 14px Consolas";
      ctx.fillText(this.message, this.width * 0.5, this.height * 0.90);
    }
  }

  drawCommands() {
    const ctx = this.ctx;
    ctx.fillStyle = "#050407";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = "#f0dfcf";
    ctx.font = "bold 30px Georgia";
    ctx.textAlign = "center";
    ctx.fillText("Comandos", this.width * 0.5, 60);

    const actions = [
      ["left", "Mover esquerda"],
      ["right", "Mover direita"],
      ["jump", "Saltar"],
      ["attack", "Atacar"],
      ["special", "Especial"],
    ];

    let y = 150;
    for (const [action, label] of actions) {
      let current = this.controlBindings[action].toUpperCase();
      if (this.awaitingBinding === action) {
        current = "PRESSIONA UMA TECLA";
      }
      this.drawButton(
        this.width * 0.20,
        y,
        this.width * 0.60,
        52,
        `${label}: ${current}`,
        `bind_${action}`,
        "#24161c",
        "#8b6574"
      );
      y += 70;
    }

    this.drawButton(this.width * 0.36, this.height * 0.84, 260, 56, "VOLTAR", "back_title");
    ctx.fillStyle = "#cdb8b8";
    ctx.font = "14px Consolas";
    ctx.fillText("Clica num comando e depois pressiona a nova tecla", this.width * 0.5, this.height * 0.74);
  }

  drawGameplay() {
    this.drawBackground();
    this.drawPlatforms(0, 0);
    this.drawPickups(0, 0);
    this.drawObjective(0, 0);
    this.drawEnemies(0, 0);
    this.drawBloodParticles(0, 0);
    this.drawProjectiles(0, 0);
    this.drawPlayer(0, 0);
    this.drawHud();

    if (this.message && this.messageTimer > 0) {
      const ctx = this.ctx;
      ctx.fillStyle = "#f7d8b7";
      ctx.font = "bold 16px Consolas";
      ctx.textAlign = "center";
      ctx.fillText(this.message, this.width * 0.5, this.height * 0.11);
    }
  }

  drawBackground() {
    const ctx = this.ctx;
    const image = this.sprites.get("background");
    if (image) {
      const tileW = image.width;
      const tileH = image.height;
      const startX = -((this.cameraX * 0.35) % tileW) - tileW;
      const startY = -((this.cameraY * 0.18) % tileH) - tileH;
      for (let x = Math.floor(startX); x < this.width + tileW; x += tileW) {
        for (let y = Math.floor(startY); y < this.height + tileH; y += tileH) {
          ctx.drawImage(image, x, y);
        }
      }
    } else {
      ctx.fillStyle = "#09070b";
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  worldToScreen(x, y) {
    return {
      x: (x - this.cameraX + this.cameraShakeX) * this.cameraZoom,
      y: (y - this.cameraY + this.cameraShakeY) * this.cameraZoom,
    };
  }

  worldRectToScreen(x, y, w, h) {
    const pos = this.worldToScreen(x, y);
    return { x: pos.x, y: pos.y, w: w * this.cameraZoom, h: h * this.cameraZoom };
  }

  drawPlatforms(ox, oy) {
    const ctx = this.ctx;
    for (const platform of this.platforms) {
      const rect = this.worldRectToScreen(platform.x + ox, platform.y + oy, platform.w, platform.h);
      ctx.fillStyle = "#1a1016";
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = "#4e2d34";
      ctx.lineWidth = Math.max(1, Math.floor(2 * this.cameraZoom));
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = "#6d3b43";
      ctx.beginPath();
      ctx.moveTo(rect.x, rect.y + 6 * this.cameraZoom);
      ctx.lineTo(rect.x + rect.w, rect.y + 6 * this.cameraZoom);
      ctx.stroke();
    }
  }

  drawPlayer(ox, oy) {
    const ctx = this.ctx;
    const rect = this.worldRectToScreen(this.player.x + ox, this.player.y + oy, this.player.w, this.player.h);
    const image = this.sprites.get("player");
    if (image) {
      ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
    } else {
      ctx.fillStyle = this.player.invulnerable % 2 === 0 ? "#f0d9a7" : "#ff8080";
      ctx.beginPath();
      ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawEnemies(ox, oy) {
    const ctx = this.ctx;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const rect = this.worldRectToScreen(enemy.x + ox, enemy.y + oy, enemy.w, enemy.h);
      const isBoss = enemy === this.boss;
      const image = isBoss ? this.sprites.get("boss") : this.sprites.get("enemy");
      if (image) {
        ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
      } else {
        const colors = {
          dash: "#aa534d",
          orbit: "#7a4cab",
          homing: "#4aab8f",
          teleport: "#a96c2f",
          split: "#b14a5d",
          boss: "#d4d4d4",
        };
        ctx.fillStyle = colors[enemy.kind] || "#ddd";
        ctx.beginPath();
        ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      this.drawHealthBar(rect.x, rect.y - 10 * this.cameraZoom, enemy.hp, enemy.maxHp, rect.w);
    }
  }

  drawProjectiles(ox, oy) {
    const ctx = this.ctx;
    for (const projectile of this.projectiles) {
      const rect = this.worldRectToScreen(projectile.x + ox, projectile.y + oy, projectile.w, projectile.h);
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBloodParticles(ox, oy) {
    const ctx = this.ctx;
    for (const particle of this.bloodParticles) {
      const size = 4;
      const rect = this.worldRectToScreen(particle.x + ox, particle.y + oy, size, size);
      ctx.fillStyle = particle.color;
      ctx.fillRect(rect.x, rect.y, size * this.cameraZoom, size * this.cameraZoom);
    }
  }

  drawPickups(ox, oy) {
    const ctx = this.ctx;
    for (const pickup of this.pickups) {
      if (!pickup.alive) continue;
      const rect = this.worldRectToScreen(pickup.x + ox, pickup.y + oy, pickup.w, pickup.h);
      let image = null;
      if (pickup.kind === "heal") image = this.sprites.get("heal");
      if (pickup.kind === "special") image = this.sprites.get("special");
      if (pickup.kind === "collect") image = this.sprites.get("collect");
      if (pickup.kind === "objective") image = this.sprites.get("objective");
      if (image) {
        ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
      } else if (pickup.kind === "key") {
        ctx.fillStyle = "#d7c35a";
        ctx.strokeStyle = "#8d7420";
        ctx.beginPath();
        ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = "#fff";
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
    }
  }

  drawObjective(ox, oy) {
    const ctx = this.ctx;
    if (!this.objective || !this.objective.alive) return;
    const rect = this.worldRectToScreen(this.objective.x + ox, this.objective.y + oy, this.objective.w, this.objective.h);
    const finalLevel = this.levelIndex >= this.levels.length - 1;

    if (finalLevel && this.keysCollected < this.keysTotal) {
      ctx.fillStyle = "#3b2230";
      ctx.strokeStyle = "#795866";
      ctx.lineWidth = Math.max(1, Math.floor(2 * this.cameraZoom));
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      for (let i = 0; i < this.keysTotal; i += 1) {
        const lx = rect.x + 4 * this.cameraZoom + i * ((rect.w - 8 * this.cameraZoom) / this.keysTotal);
        ctx.fillStyle = "#d7c35a";
        ctx.strokeStyle = "#8d7420";
        ctx.fillRect(lx, rect.y - 10 * this.cameraZoom, 6 * this.cameraZoom, 20 * this.cameraZoom);
        ctx.strokeRect(lx, rect.y - 10 * this.cameraZoom, 6 * this.cameraZoom, 20 * this.cameraZoom);
      }
      return;
    }

    const image = this.sprites.get("objective");
    if (image) {
      ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
    } else {
      ctx.fillStyle = this.doorOpen ? "#b8a8ff" : "#5a3d4d";
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
  }

  drawHud() {
    const ctx = this.ctx;
    ctx.fillStyle = "#0a070c";
    ctx.fillRect(0, 0, this.width, 56);
    ctx.fillStyle = "#f0dfcf";
    ctx.font = "18px Georgia";
    ctx.textAlign = "left";
    ctx.fillText("A Lenda dos Olhos", 20, 22);
    ctx.fillStyle = "#8d8585";
    ctx.font = "11px Consolas";
    const levelName = this.currentLevel ? this.currentLevel[0] : "Prologo";
    ctx.fillText(
      `Nivel: ${levelName}  Coletaveis: ${this.collectiblesCollected}/${this.collectiblesTotal}  Chaves: ${this.keysCollected}/${this.keysTotal}`,
      20,
      40
    );
    ctx.fillText(`Vida: ${this.player.hp}/${this.player.maxHp}`, this.width - 20, 22);
    ctx.textAlign = "right";
    ctx.fillText(
      `Mover ${this.controlBindings.left.toUpperCase()} / ${this.controlBindings.right.toUpperCase()}  Saltar ${this.controlBindings.jump.toUpperCase()}  Atacar ${this.controlBindings.attack.toUpperCase()}  Especial ${this.controlBindings.special.toUpperCase()}`,
      this.width - 20,
      40
    );
  }

  drawHealthBar(x, y, hp, maxHp, width) {
    const ctx = this.ctx;
    const ratio = Math.max(0, hp) / Math.max(1, maxHp);
    const barH = 6 * this.cameraZoom;
    ctx.fillStyle = "#30161b";
    ctx.fillRect(x, y, width, barH);
    ctx.fillStyle = "#c74343";
    ctx.fillRect(x, y, width * ratio, barH);
  }

  drawButton(x, y, w, h, text, action, fill = "#2b1d24", outline = "#8b6574", levelIndex = null, locked = false) {
    const ctx = this.ctx;
    ctx.fillStyle = fill;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#f5e7d8";
    ctx.font = "bold 16px Consolas";
    ctx.textAlign = "center";
    const lines = text.split("\n");
    const baseY = y + h / 2 - ((lines.length - 1) * 16) / 2 + 6;
    lines.forEach((line, index) => {
      ctx.fillText(line, x + w / 2, baseY + index * 18);
    });
    const button = { x1: x, y1: y, x2: x + w, y2: y + h, action };
    if (levelIndex !== null) button.levelIndex = levelIndex;
    if (locked) button.locked = true;
    this.uiButtons.push(button);
  }

  drawOverlay(title, subtitle) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = "#140d13";
    ctx.strokeStyle = "#6d4b4b";
    ctx.lineWidth = 2;
    ctx.fillRect(this.width * 0.28, this.height * 0.28, this.width * 0.44, this.height * 0.30);
    ctx.strokeRect(this.width * 0.28, this.height * 0.28, this.width * 0.44, this.height * 0.30);
    ctx.fillStyle = "#f0dfcf";
    ctx.font = "bold 34px Georgia";
    ctx.textAlign = "center";
    ctx.fillText(title, this.width * 0.5, this.height * 0.38);
    ctx.fillStyle = "#d7c6ba";
    ctx.font = "16px Consolas";
    ctx.fillText(subtitle, this.width * 0.5, this.height * 0.48);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game");
  const game = new Game(canvas);
  game.init();
});
