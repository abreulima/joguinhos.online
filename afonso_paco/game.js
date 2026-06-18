(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  ctx.imageSmoothingEnabled = false;

  const W = canvas.width;
  const H = canvas.height;
  const TILE = 32;
  const STORAGE_KEY = "climb_higher_web_unlocked";
  const ASSET_VERSION = String(Date.now());

  const keys = new Set();
  const mouse = { left: false, right: false };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rand = (seed) => {
    const x = Math.sin(seed * 999 + 0.123) * 10000;
    return x - Math.floor(x);
  };
  const rectsOverlap = (a, b) =>
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y;

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function loadAssets() {
    const base = new URL("../Artes/", window.location.href);
    const sources = {
      player: "jogador.png",
      enemy: "inimigo.png",
      boss: "boss.png",
      ghostBoss: "boss.png",
      blood: "sangue.png",
      special: "especial.png",
      key: "objetivo.png",
      coin: "coletavel.png",
      portal: "objetivo2.png",
      weapon: "arma.png",
      slash: "corteespada.png",
      life: "vida.png",
      ground: "pacos.png",
      ground2: "relvatopo.png",
      platform: "relvameio.png",
      bg: "fundo.png",
      armor: "armadura.png",
    };
    const entries = Object.entries(sources).map(([name, file]) =>
      loadImage(`${new URL(file, base).href}?v=${ASSET_VERSION}`).then((img) => [name, img])
    );
    return Promise.all(entries).then((pairs) => Object.fromEntries(pairs));
  }

  function drawText(text, x, y, options = {}) {
    const {
      color = "#fff",
      align = "left",
      size = 20,
      weight = "normal",
      alpha = 1,
      stroke = null,
      shadow = true,
      font = "Trebuchet MS, Segoe UI, sans-serif",
    } = options;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    if (shadow) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillText(text, x + 2, y + 2);
    }
    if (stroke) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = stroke;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawImage(img, x, y, w, h, fallbackColor) {
    if (img) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, x, y, w, h);
      return;
    }
    ctx.fillStyle = fallbackColor;
    ctx.fillRect(x, y, w, h);
  }

  function drawTiledImage(img, x, y, w, h, fallbackColor, tileW = TILE, tileH = TILE) {
    if (!img) {
      ctx.fillStyle = fallbackColor;
      ctx.fillRect(x, y, w, h);
      return;
    }
    ctx.imageSmoothingEnabled = false;
    for (let tx = 0; tx < w; tx += tileW) {
      for (let ty = 0; ty < h; ty += tileH) {
        const dw = Math.min(tileW, w - tx);
        const dh = Math.min(tileH, h - ty);
        ctx.drawImage(img, 0, 0, tileW, tileH, x + tx, y + ty, dw, dh);
      }
    }
  }

  class Player {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.w = 24;
      this.h = 30;
      this.vx = 0;
      this.vy = 0;
      this.speed = 260;
      this.jumpSpeed = 640;
      this.gravity = 1400;
      this.facing = 1;
      this.onGround = false;
      this.hp = 5;
      this.invincible = 0;
      this.godMode = false;
      this.flying = false;
      this.attackTimer = 0;
      this.attackCooldown = 0;
      this.attackRect = null;
      this.shielding = false;
      this.coyote = 0;
    }

    respawn(x, y) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.hp = 5;
      this.invincible = 1;
      this.attackTimer = 0;
      this.attackCooldown = 0;
      this.attackRect = null;
      this.shielding = false;
      this.coyote = 0;
    }

    attack() {
      if (this.attackCooldown > 0) return;
      const width = 180;
      const height = 90;
      const reach = 28;
      const x = this.facing >= 0 ? this.x + this.w - reach : this.x - width + reach;
      const y = this.y + this.h / 2 - height / 2;
      this.attackRect = { x, y, w: width, h: height };
      this.attackTimer = 0.18;
      this.attackCooldown = 1.0;
    }

    requestJump() {
      if (this.onGround || this.coyote > 0) {
        this.vy = -this.jumpSpeed;
        this.onGround = false;
        this.coyote = 0;
      }
    }

    update(dt, level) {
      const left = keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
      const right = keys.has("ArrowRight") || keys.has("d") || keys.has("D");
      const up = keys.has("ArrowUp") || keys.has("w") || keys.has("W") || keys.has(" ");
      const down = keys.has("ArrowDown") || keys.has("s") || keys.has("S");

      let move = 0;
      if (left) move -= 1;
      if (right) move += 1;
      if (move !== 0) this.facing = move;

      if (this.flying) {
        const flyForward = up ? 1.45 : 1.0;
        this.vx = this.facing * this.speed * 2.0 * flyForward;
        this.vy = 0;
        if (down) this.vy = this.speed * 1.7;
        if (up) this.vy = -this.speed * 1.7;
        this.onGround = false;
      } else if (level.theme === "underwater") {
        this.vx = move * this.speed * 0.82;
        this.vy += this.gravity * 0.55 * dt;
      } else if (level.theme === "ice") {
        this.vx = move * this.speed * 1.08;
        this.vy += this.gravity * 0.88 * dt;
      } else {
        this.vx = move * this.speed;
        this.vy += this.gravity * dt;
      }

      this.x += this.vx * dt;
      level.resolveHorizontal(this);
      this.y += this.vy * dt;
      this.onGround = false;
      level.resolveVertical(this);

      this.coyote = Math.max(0, this.coyote - dt);
      if (this.onGround) this.coyote = 0.1;

      if (!this.godMode) {
        this.invincible = Math.max(0, this.invincible - dt);
      }
      this.attackTimer = Math.max(0, this.attackTimer - dt);
      this.attackCooldown = Math.max(0, this.attackCooldown - dt);
      if (this.attackTimer <= 0) this.attackRect = null;
    }
  }

  class Enemy {
    constructor(kind, x, y, w = 32, h = 32) {
      this.kind = kind;
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
      this.vx = 0;
      this.vy = 0;
      this.dir = 1;
      this.hp = kind === "boss" ? 36 : 2;
      this.alive = true;
      this.attackTimer = 0;
      this.floatTimer = 0;
      this.shotTimer = 0;
      this.floatBaseY = y;
    }

    get rect() {
      return { x: this.x, y: this.y, w: this.w, h: this.h };
    }

    update(dt, level, player) {
      if (!this.alive) return;
      if (this.kind === "ghost") {
        this.floatTimer += dt;
        this.x += this.dir * 34 * dt;
        this.y = this.floatBaseY + Math.sin(this.floatTimer * 5) * 8;
        if (player.x < this.x) this.dir = -1;
        else this.dir = 1;
        this.shotTimer -= dt;
        if (this.shotTimer <= 0) {
          this.shotTimer = 1.25;
          for (const offset of [-90, -20, 50]) {
                  const dropX = clamp(player.x + player.w / 2 + offset, 20, level.worldW - 20);
            level.projectiles.push(new Projectile(dropX - 9, -28, 18, 18, 0, 360, 7, "special", this.assets.special));
          }
        }
        return;
      }

      if (this.kind === "boss") {
        if (player.x < this.x) this.dir = -1;
        else this.dir = 1;
        this.x += this.dir * 44 * dt;
        this.attackTimer -= dt;
        if (this.attackTimer <= 0) {
          this.attackTimer = 1.2;
          const dx = player.x - this.x;
          const dy = player.y - this.y;
          const len = Math.hypot(dx, dy) || 1;
          const speed = 320;
          level.projectiles.push(
            new Projectile(
              this.x + this.w / 2 - 9,
              this.y + this.h / 2 - 9,
              18,
              18,
              dx / len * speed,
              dy / len * speed,
              4,
              "enemy"
            )
          );
        }
        return;
      }

      this.attackTimer -= dt;
      const speed = 80;
      this.x += this.dir * speed * dt;
      if (this.x < 40) this.dir = 1;
      if (this.x + this.w > level.worldW - 40) this.dir = -1;
    }
  }

  class Projectile {
    constructor(x, y, w, h, vx, vy, damage, kind = "enemy", sprite = null) {
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
      this.vx = vx;
      this.vy = vy;
      this.damage = damage;
      this.kind = kind;
      this.sprite = sprite;
      this.alive = true;
    }

    get rect() {
      return { x: this.x, y: this.y, w: this.w, h: this.h };
    }

    update(dt, level) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      for (const s of level.solids) {
        if (rectsOverlap(this.rect, s)) {
          this.alive = false;
          return;
        }
      }
      if (this.x < -120 || this.x > level.worldW + 120 || this.y < -220 || this.y > level.worldH + 220) {
        this.alive = false;
      }
    }
  }

  class Level {
    constructor(index, name, theme, worldW, boss = false) {
      this.index = index;
      this.name = name;
      this.theme = theme;
      this.worldW = worldW;
      this.worldH = 760;
      this.boss = boss;
      this.solids = [];
      this.platforms = [];
      this.enemies = [];
      this.projectiles = [];
      this.bloodPickups = [];
      this.bloodSpawnPoints = [];
      this.keyRect = null;
      this.keyTaken = false;
      this.exitRect = null;
      this.completed = false;
      this.bossPhase = 0;
      this.bloodSpawnTimer = 0;
      this.spawn = { x: 80, y: 380 };
      this._build();
    }

    addSolid(x, y, w, h = 32) {
      const rect = { x, y, w, h };
      this.solids.push(rect);
      this.platforms.push(rect);
      return rect;
    }

    addEnemy(kind, x, y, w = 32, h = 32) {
      const enemy = new Enemy(kind, x, y, w, h);
      this.enemies.push(enemy);
      return enemy;
    }

    addBloodPoint(x, y) {
      this.bloodSpawnPoints.push({ x, y, w: 32, h: 32 });
    }

    buildSteps(startX, groundY, stepCount, stepWidth, gap, rise) {
      let x = startX;
      let y = groundY;
      for (let i = 0; i < stepCount; i++) {
        this.addSolid(x, y, stepWidth, 24);
        x += stepWidth + gap;
        y -= rise;
      }
      return { x, y };
    }

    _build() {
      const baseGround = this.theme === "castle" ? 470 : 500;
      this.floorY = baseGround;
      this.addSolid(0, baseGround, this.worldW, 70);
      this.spawn = { x: 80, y: baseGround - 48 };

      if (this.theme === "mountain") {
        this.addSolid(280, 420, 180, 20);
        this.addSolid(540, 360, 160, 20);
        this.addSolid(780, 300, 180, 20);
        this.addSolid(1080, 340, 180, 20);
        this.addSolid(1380, 280, 180, 20);
        this.addSolid(1660, 220, 180, 20);
        this.addSolid(1980, 280, 220, 20);
        this.addSolid(2320, 340, 220, 20);
        this.keyRect = { x: 2380, y: 300, w: 28, h: 28 };
        this.exitRect = { x: this.worldW - 110, y: baseGround - 60, w: 70, h: 92 };
        this.addEnemy("enemy", 520, 324);
        this.addEnemy("enemy", 1220, 304);
        this.addEnemy("enemy", 2100, 244);
      } else if (this.theme === "underwater") {
        this.addSolid(220, 440, 220, 20);
        this.addSolid(520, 390, 180, 20);
        this.addSolid(840, 330, 200, 20);
        this.addSolid(1140, 390, 170, 20);
        this.addSolid(1430, 320, 170, 20);
        this.addSolid(1700, 260, 200, 20);
        this.addSolid(1980, 320, 200, 20);
        this.addSolid(2300, 410, 220, 20);
        this.keyRect = { x: 2260, y: 370, w: 28, h: 28 };
        this.exitRect = { x: this.worldW - 110, y: baseGround - 60, w: 70, h: 92 };
        this.addEnemy("enemy", 640, 350);
        this.addEnemy("enemy", 1530, 280);
        this.addEnemy("enemy", 2110, 292);
      } else if (this.theme === "ice") {
        this.addSolid(200, 420, 180, 20);
        this.addSolid(460, 370, 180, 20);
        this.addSolid(700, 320, 180, 20);
        this.addSolid(960, 260, 180, 20);
        this.addSolid(1240, 320, 180, 20);
        this.addSolid(1540, 260, 180, 20);
        this.addSolid(1820, 220, 180, 20);
        this.addSolid(2100, 280, 220, 20);
        this.addSolid(2450, 350, 160, 20);
        this.keyRect = { x: 2480, y: 310, w: 28, h: 28 };
        this.exitRect = { x: this.worldW - 110, y: baseGround - 60, w: 70, h: 92 };
        this.addEnemy("enemy", 760, 284);
        this.addEnemy("enemy", 1600, 224);
        this.addEnemy("enemy", 2200, 244);
      } else if (this.theme === "desert") {
        this.addSolid(260, 430, 160, 20);
        this.addSolid(520, 360, 160, 20);
        this.addSolid(780, 410, 160, 20);
        this.addSolid(1020, 330, 160, 20);
        this.addSolid(1270, 270, 160, 20);
        this.addSolid(1540, 330, 180, 20);
        this.addSolid(1820, 250, 200, 20);
        this.addSolid(2140, 340, 180, 20);
        this.addSolid(2430, 280, 180, 20);
        this.keyRect = { x: 2485, y: 240, w: 28, h: 28 };
        this.exitRect = { x: this.worldW - 110, y: baseGround - 60, w: 70, h: 92 };
        this.addEnemy("enemy", 600, 324);
        this.addEnemy("enemy", 1120, 294);
        this.addEnemy("enemy", 1900, 214);
        this.addEnemy("enemy", 2360, 244);
      } else if (this.theme === "lava") {
        const st = this.buildSteps(220, 440, 18, 120, 70, 10);
        this.addSolid(st.x + 120, 280, 150, 20);
        this.addSolid(st.x + 380, 220, 170, 20);
        this.addSolid(st.x + 680, 300, 180, 20);
        this.addSolid(st.x + 980, 240, 180, 20);
        this.addSolid(st.x + 1260, 180, 180, 20);
        this.keyRect = { x: st.x + 1390, y: 140, w: 28, h: 28 };
        this.exitRect = { x: this.worldW - 120, y: 110, w: 76, h: 96 };
        this.addEnemy("enemy", 820, 382);
        this.addEnemy("enemy", 1460, 322);
        this.addEnemy("enemy", 2140, 252);
      } else if (this.theme === "castle") {
        this.addSolid(240, 420, 200, 20);
        this.addSolid(520, 370, 180, 20);
        this.addSolid(800, 320, 180, 20);
        this.addSolid(1100, 260, 180, 20);
        this.addSolid(1400, 220, 180, 20);
        this.addSolid(1700, 260, 180, 20);
        this.addSolid(2000, 320, 180, 20);
        this.addSolid(2280, 360, 180, 20);
        this.addSolid(2580, 390, 180, 20);
        this.addSolid(2960, 420, 240, 20);
        this.addSolid(3260, 360, 220, 20);
        this.addSolid(3560, 320, 180, 20);
        this.addSolid(3860, 300, 180, 20);
        this.addSolid(4180, 340, 180, 20);
        this.keyRect = null;
        this.exitRect = null;
        this.boss = true;
        this.addBloodPoint(620, 438);
        this.addBloodPoint(1040, 438);
        this.addBloodPoint(1480, 438);
        this.addBloodPoint(1920, 438);
        this.addBloodPoint(2360, 438);
        this.addBloodPoint(2800, 438);
        this.addBloodPoint(3340, 438);
        this.addBloodPoint(3880, 438);
        this.addBloodPoint(4420, 438);
        this.addEnemy("boss", this.worldW / 2 + 220, 330, 74, 74);
      }
    }

    resolveHorizontal(player) {
      for (const solid of this.solids) {
        if (!rectsOverlap({ x: player.x, y: player.y, w: player.w, h: player.h }, solid)) continue;
        if (player.vx > 0) {
          player.x = solid.x - player.w;
        } else if (player.vx < 0) {
          player.x = solid.x + solid.w;
        }
      }
      player.x = clamp(player.x, 0, this.worldW - player.w);
    }

    resolveVertical(player) {
      for (const solid of this.solids) {
        if (!rectsOverlap({ x: player.x, y: player.y, w: player.w, h: player.h }, solid)) continue;
        if (player.vy > 0) {
          player.y = solid.y - player.h;
          player.vy = 0;
          player.onGround = true;
        } else if (player.vy < 0) {
          player.y = solid.y + solid.h;
          player.vy = 0;
        }
      }
      if (player.y > this.worldH + 200) {
        player.y = this.spawn.y;
        player.vy = 0;
      }
    }
  }

  function createLevels() {
    return [
      new Level(1, "Mountain", "mountain", 2800, false),
      new Level(2, "Underwater", "underwater", 2800, false),
      new Level(3, "Ice", "ice", 3000, false),
      new Level(4, "Desert", "desert", 3200, false),
      new Level(5, "Lava", "lava", 4600, false),
      new Level(6, "Castle", "castle", 5200, true),
    ];
  }

  class Game {
    constructor(assets) {
      this.assets = assets;
      this.levels = createLevels();
      this.unlocked = Math.max(1, Number(localStorage.getItem(STORAGE_KEY) || "1"));
      this.state = "menu";
      this.menuIndex = 0;
      this.currentLevel = null;
      this.player = new Player(80, 380);
      this.cameraX = 0;
      this.cameraY = 0;
      this.message = "";
      this.messageTimer = 0;
      this.victoryTimer = 0;
      this.cutsceneTimer = 0;
      this.messageQueue = [];
      this.cutsceneSkip = false;
      this.keysDown = false;
      this.bgPulse = 0;
      this.enteredFromMenu = true;
      this.showOverlay = true;
      this.applyOverlay();
    }

    applyOverlay() {
      overlay.style.display = this.state === "menu" ? "grid" : "none";
    }

    saveProgress() {
      localStorage.setItem(STORAGE_KEY, String(this.unlocked));
    }

    startLevel(index) {
      const level = this.levels[index - 1];
      this.currentLevel = level;
      this.menuIndex = index - 1;
      this.player.respawn(level.spawn.x, level.spawn.y);
      this.player.invincible = 1.0;
      this.player.godMode = false;
      this.player.flying = false;
      this.state = "playing";
      this.message = "";
      this.messageTimer = 0;
      this.cameraX = 0;
      this.cameraY = 0;
      this.applyOverlay();
    }

    openMenu() {
      this.state = "menu";
      this.currentLevel = null;
      this.player.shielding = false;
      this.message = "";
      this.messageTimer = 0;
      this.applyOverlay();
    }

    startVictory() {
      this.state = "victory";
      this.currentLevel = null;
      this.victoryTimer = 0;
      this.cutsceneTimer = 0;
      this.message = "";
      this.applyOverlay();
    }

    unlockAll() {
      this.unlocked = this.levels.length;
      this.saveProgress();
      this.message = "All maps unlocked!";
      this.messageTimer = 2;
    }

    restart() {
      this.unlocked = 1;
      this.saveProgress();
      this.startLevel(1);
    }

    handleKeyDown(e) {
      keys.add(e.key);
      if (e.key === "F11") {
        e.preventDefault();
        return;
      }
      if (e.key === "v" || e.key === "V") {
        this.player.godMode = !this.player.godMode;
        this.player.flying = this.player.godMode;
        this.message = this.player.godMode ? "God mode on!" : "God mode off!";
        this.messageTimer = 1.5;
        return;
      }
      if (e.key === "p" || e.key === "P") {
        this.unlockAll();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        this.restart();
        return;
      }
      if (e.key === "b" || e.key === "B") {
        this.startLevel(this.levels.length);
        this.message = "Boss fight started!";
        this.messageTimer = 2;
        return;
      }

      if (this.state === "menu") {
        if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
          this.menuIndex = (this.menuIndex - 1 + this.levels.length) % this.levels.length;
        } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
          this.menuIndex = (this.menuIndex + 1) % this.levels.length;
        } else if (e.key === "Enter" || e.key === " ") {
          const levelNum = this.menuIndex + 1;
          if (levelNum <= this.unlocked) {
            this.startLevel(levelNum);
          } else {
            this.message = "Level locked. Complete the previous one.";
            this.messageTimer = 2;
          }
        } else if (e.key === "h" || e.key === "H") {
          this.state = "help";
          this.applyOverlay();
        } else if (e.key === "Escape") {
          this.state = "menu";
        }
      } else if (this.state === "help") {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
          this.state = "menu";
          this.applyOverlay();
        }
      } else if (this.state === "playing") {
        if (e.key === "Escape") {
          this.openMenu();
        } else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W" || e.key === " ") {
          this.player.requestJump();
        } else if (e.key === "j" || e.key === "J") {
          this.player.attack();
        }
      } else if (this.state === "gameover") {
        if (e.key === "Enter" || e.key === " ") this.openMenu();
        if (e.key === "Escape") this.openMenu();
      } else if (this.state === "levelclear") {
        if (e.key === "Enter" || e.key === " " || e.key === "Escape") this.openMenu();
      } else if (this.state === "victory") {
        if (e.key === "Enter" || e.key === " ") this.openMenu();
        if (e.key === "Escape") return;
      }
    }

    handleKeyUp(e) {
      keys.delete(e.key);
    }

    handleMouseDown(e) {
      if (e.button === 0) {
        mouse.left = true;
        if (this.state === "playing") this.player.attack();
      }
      if (e.button === 2) {
        mouse.right = true;
        if (this.state === "playing") this.player.shielding = true;
      }
    }

    handleMouseUp(e) {
      if (e.button === 0) mouse.left = false;
      if (e.button === 2) {
        mouse.right = false;
        this.player.shielding = false;
      }
    }

    update(dt) {
      this.bgPulse += dt;
      if (this.messageTimer > 0) {
        this.messageTimer -= dt;
        if (this.messageTimer <= 0) this.message = "";
      }

      if (this.state === "victory") {
        this.victoryTimer += dt;
        this.cutsceneTimer += dt;
        if (this.victoryTimer >= 9) this.openMenu();
        return;
      }

      if (this.state !== "playing" || !this.currentLevel) return;

      const level = this.currentLevel;
      this.player.update(dt, level);

      for (const enemy of level.enemies) {
        enemy.update(dt, level, this.player);
      }
      for (const proj of level.projectiles) {
        proj.update(dt, level);
      }

      if (level.theme === "castle" && level.enemies.some((e) => e.kind === "ghost" && e.alive)) {
        level.bloodSpawnTimer += dt;
        while (level.bloodSpawnTimer >= 2.0) {
          level.bloodSpawnTimer -= 2.0;
          this.spawnBloodPickup(level);
        }
      }

      this.resolveCombat(level);
      this.resolveProjectiles(level);
      this.resolvePickups(level);

      level.enemies = level.enemies.filter((e) => e.alive);
      level.projectiles = level.projectiles.filter((p) => p.alive);

      if (this.player.hp <= 0) {
        this.state = "gameover";
        this.message = "The village has fallen, but you can try again.";
        this.messageTimer = 5;
        this.applyOverlay();
        return;
      }

      if (level.exitRect && level.keyTaken && rectsOverlap(this.playerRect(), level.exitRect)) {
        if (!level.boss) {
          this.unlocked = Math.max(this.unlocked, Math.min(this.levels.length, level.index + 1));
          this.saveProgress();
          this.state = "levelclear";
          this.message = `${level.name} completed!`;
          this.messageTimer = 2.5;
          this.applyOverlay();
        }
      }

      this.updateCamera(level);
    }

    playerRect() {
      return { x: this.player.x, y: this.player.y, w: this.player.w, h: this.player.h };
    }

    resolveCombat(level) {
      if (this.player.attackRect) {
        for (const enemy of level.enemies) {
          if (!enemy.alive) continue;
          if (rectsOverlap(this.player.attackRect, enemy.rect)) {
            if (level.boss && level.theme === "castle" && enemy.kind === "ghost") {
              this.message = "The sword is useless against the ghost.";
              this.messageTimer = 1;
              continue;
            }
            this.damageEnemy(level, enemy, 1);
          }
        }
      }

      for (const enemy of level.enemies) {
        if (!enemy.alive) continue;
        if (rectsOverlap(this.playerRect(), enemy.rect) && this.player.invincible <= 0 && !this.player.godMode) {
          this.player.hp -= 1;
          this.player.invincible = 0.9;
          this.player.vy = -340;
        }
      }
    }

    resolveProjectiles(level) {
      for (const proj of level.projectiles) {
        if (!proj.alive) continue;

        if (proj.kind === "blood") {
          for (const enemy of level.enemies) {
            if (enemy.alive && rectsOverlap(proj.rect, enemy.rect)) {
              this.damageEnemy(level, enemy, 1);
              proj.alive = false;
              break;
            }
          }
          continue;
        }

        const shieldRect = {
          x: this.player.x + this.player.w / 2 - 30,
          y: this.player.y - 28,
          w: 60,
          h: 18,
        };
        if (this.player.shielding && proj.kind === "special" && rectsOverlap(proj.rect, shieldRect)) {
          proj.alive = false;
          this.message = "Shield up!";
          this.messageTimer = 0.4;
          continue;
        }

        if ((proj.kind === "enemy" || proj.kind === "special") && !this.player.godMode && this.player.invincible <= 0 && rectsOverlap(proj.rect, this.playerRect())) {
          this.player.hp -= proj.damage;
          this.player.invincible = 0.7;
          this.player.vy = -260;
          proj.alive = false;
        }
      }
    }

    resolvePickups(level) {
      if (level.keyRect && !level.keyTaken && rectsOverlap(this.playerRect(), level.keyRect)) {
        level.keyTaken = true;
        this.message = "Key collected! Find the exit.";
        this.messageTimer = 2;
      }

      if (level.theme === "castle" && level.bloodPickups.length) {
        for (const pickup of [...level.bloodPickups]) {
          if (rectsOverlap(this.playerRect(), pickup)) {
            level.bloodPickups.splice(level.bloodPickups.indexOf(pickup), 1);
            this.spawnBloodShot(level, pickup);
            this.message = "Blood picked up! Shot fired.";
            this.messageTimer = 1.2;
          }
        }
      }
    }

    damageEnemy(level, enemy, damage) {
      enemy.hp -= damage;
      if (level.boss && level.theme === "castle" && enemy.kind === "boss" && enemy.hp <= 0 && level.bossPhase === 0) {
        enemy.kind = "ghost";
        enemy.hp = 20;
        enemy.w = 78;
        enemy.h = 78;
        enemy.x -= 8;
        enemy.y -= 6;
        enemy.floatBaseY = enemy.y;
        enemy.floatTimer = 0;
        level.bossPhase = 1;
        level.bloodPickups.length = 0;
        level.bloodSpawnTimer = 0;
        this.message = "The boss ghost has awakened!";
        this.messageTimer = 2;
        return;
      }
      if (level.boss && level.theme === "castle" && enemy.kind === "ghost" && enemy.hp <= 0 && level.bossPhase === 1) {
        enemy.alive = false;
        this.message = "The final battle is over!";
        this.messageTimer = 2;
        this.startVictory();
        return;
      }
      if (enemy.hp <= 0) {
        enemy.alive = false;
      }
    }

    spawnBloodPickup(level) {
      if (!level.bloodSpawnPoints.length) return;
      if (level.bloodPickups.length >= 4) return;
      const next = level.bloodSpawnPoints[level.bloodPickups.length % level.bloodSpawnPoints.length];
      level.bloodPickups.push({ x: next.x, y: next.y, w: next.w, h: next.h });
    }

    spawnBloodShot(level, origin) {
      const target = level.enemies.find((e) => e.alive && (e.kind === "boss" || e.kind === "ghost"));
      if (!target) return;
      const sx = origin.x + origin.w / 2;
      const sy = origin.y - 18;
      const dx = target.x + target.w / 2 - sx;
      const dy = target.y + target.h / 2 - sy;
      const len = Math.hypot(dx, dy) || 1;
      const speed = 560;
      level.projectiles.push(new Projectile(sx - 8, sy, 16, 16, dx / len * speed, dy / len * speed, 3, "blood"));
    }

    updateCamera(level) {
      const targetX = clamp(this.player.x + this.player.w / 2 - W / 2, 0, Math.max(0, level.worldW - W));
      const targetY = clamp(this.player.y + this.player.h / 2 - H / 2, 0, Math.max(0, level.worldH - H));
      this.cameraX += (targetX - this.cameraX) * 0.12;
      this.cameraY += (targetY - this.cameraY) * 0.06;
    }

    draw() {
      if (this.state === "menu") return this.drawMenu();
      if (this.state === "help") return this.drawHelp();
      if (this.state === "playing") return this.drawLevel();
      if (this.state === "gameover") {
        this.drawLevel();
        return this.drawOverlay("Game Over", this.message, "Press Enter to return to the menu");
      }
      if (this.state === "levelclear") {
        this.drawLevel();
        return this.drawOverlay(this.currentLevel ? `${this.currentLevel.name} completed!` : "Level completed", this.message, "Press Enter to return to the menu");
      }
      if (this.state === "victory") return this.drawVictory();
    }

    drawMenu() {
      ctx.clearRect(0, 0, W, H);
      this.drawBackdrop("menu");
      this.drawTitle("CLIMB HIGHER", "Browser Edition");
      drawText("Select a level", 78, 154, { color: "#f5efe6", size: 22, weight: "bold" });
      for (let i = 0; i < this.levels.length; i++) {
        const level = this.levels[i];
        const unlocked = i + 1 <= this.unlocked;
        const marker = i === this.menuIndex ? ">" : " ";
        const text = `${marker} ${i + 1}. ${level.name}${unlocked ? "" : " [locked]"}`;
        drawText(text, 88, 190 + i * 34, {
          color: unlocked ? "#ffffff" : "#a0a0a0",
          size: 20,
          weight: i === this.menuIndex ? "bold" : "normal",
        });
      }
      const info = [
        "A/D or arrows: move",
        "W or Space: jump",
        "Left click or J: attack",
        "Right click: shield",
        "V: god mode + flight",
        "B: jump to boss",
        "Enter: start / skip",
        "H: help",
      ];
      info.forEach((line, i) => drawText(line, 88, 410 + i * 22, { color: "#ddd", size: 16 }));
      if (this.message) {
        drawText(this.message, W / 2, H - 36, { color: "#ffd27d", size: 18, align: "center" });
      }
    }

    drawHelp() {
      ctx.clearRect(0, 0, W, H);
      this.drawBackdrop("help");
      this.drawTitle("HELP", "How to play");
      const lines = [
        "Collect the key to open the exit in normal levels.",
        "In the lava stage, the jumps are longer and the level is tougher.",
        "In the castle, the sword works on the real boss.",
        "When the ghost appears, collect red blood orbs to fire at it.",
        "The sword is useless against the ghost.",
        "Right click raises the shield above your head.",
        "V gives you god mode and flight.",
        "Press Escape or Enter to go back.",
      ];
      lines.forEach((line, i) => drawText(line, 88, 180 + i * 34, { color: "#f2f2f6", size: 18 }));
    }

    drawTitle(title, subtitle) {
      drawText(title, W / 2, 36, { color: "#ffe8c6", size: 44, weight: "bold", align: "center" });
      drawText(subtitle, W / 2, 88, { color: "#d7d9ef", size: 18, align: "center" });
    }

    drawOverlay(title, subtitle, footer) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, W, H);
      drawText(title, W / 2, H / 2 - 54, { color: "#ffe8c6", size: 42, weight: "bold", align: "center" });
      drawText(subtitle, W / 2, H / 2 - 4, { color: "#f2f2f6", size: 22, align: "center" });
      drawText(footer, W / 2, H / 2 + 34, { color: "#ddd", size: 18, align: "center" });
    }

    drawBackdrop(theme) {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      if (theme === "help") {
        grad.addColorStop(0, "#16111d");
        grad.addColorStop(1, "#0b101a");
      } else {
        grad.addColorStop(0, "#13243d");
        grad.addColorStop(1, "#090d15");
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      if (this.assets.bg) {
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.drawImage(this.assets.bg, 0, 0, W, H);
        ctx.restore();
      }
      for (let i = 0; i < 18; i++) {
        const x = (i * 137 + (this.bgPulse * 10)) % (W + 40) - 20;
        const y = 20 + (i % 6) * 36;
        ctx.fillStyle = `rgba(255,255,255,${0.04 + (i % 3) * 0.02})`;
        ctx.beginPath();
        ctx.arc(x, y, 2 + (i % 4), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawLevel() {
      const level = this.currentLevel;
      if (!level) return;
      ctx.clearRect(0, 0, W, H);
      this.drawBackdrop(level.theme);

      const camX = this.cameraX;
      const camY = this.cameraY;
      const themeColor = {
        mountain: "#7c8ca8",
        underwater: "#79b8ff",
        ice: "#d9f2ff",
        desert: "#d9b36c",
        lava: "#ff9466",
        castle: "#9e8bc2",
      }[level.theme] || "#fff";

      for (const solid of level.solids) {
        const x = solid.x - camX;
        const y = solid.y - camY;
        if (x > W || x + solid.w < -20 || y > H || y + solid.h < -20) continue;
        const isFloor = solid.y >= level.floorY;
        if (isFloor) {
          drawTiledImage(this.assets.ground, x, y, solid.w, 32, themeColor);
          drawTiledImage(this.assets.ground2, x, y + 32, solid.w, Math.max(0, solid.h - 32), themeColor);
        } else {
          const platformY = y - Math.max(0, TILE - solid.h);
          drawTiledImage(this.assets.platform, x, platformY, solid.w, TILE, themeColor);
        }
      }

      if (level.keyRect && !level.keyTaken) {
        const kx = level.keyRect.x - camX;
        const ky = level.keyRect.y - camY;
        drawImage(this.assets.key, kx, ky, 28, 28, "#ffd45a");
      }

      if (level.exitRect) {
        const ex = level.exitRect.x - camX;
        const ey = level.exitRect.y - camY;
        if (this.assets.portal) {
          ctx.save();
          ctx.globalAlpha = level.keyTaken ? 0.95 : 0.72;
          ctx.drawImage(this.assets.portal, ex, ey, level.exitRect.w, level.exitRect.h);
          ctx.restore();
        } else {
          ctx.fillStyle = "#77d8ff";
          ctx.fillRect(ex, ey, level.exitRect.w, level.exitRect.h);
        }
      }

      if (level.theme === "castle" && level.enemies.some((e) => e.kind === "ghost")) {
        // Blood pickups only appear while the ghost is alive.
        for (const pickup of level.bloodPickups) {
          const x = pickup.x - camX;
          const y = pickup.y - camY;
          ctx.save();
          ctx.shadowColor = "rgba(255,60,60,0.9)";
          ctx.shadowBlur = 12;
          drawImage(this.assets.blood, x, y, 20, 20, "#ff3b3b");
          ctx.restore();
        }
      }

      if (level.theme === "castle" && this.assets.armor) {
        const armorX = W - 116;
        const armorY = 82;
        ctx.save();
        ctx.globalAlpha = 0.32;
        ctx.drawImage(this.assets.armor, armorX, armorY, 70, 70);
        ctx.restore();
      }

      for (const enemy of level.enemies) {
        const x = enemy.x - camX;
        const y = enemy.y - camY;
        const img = enemy.kind === "boss" ? this.assets.boss : this.assets.enemy;
        const ghostImg = this.assets.ghostBoss || this.assets.boss;
        if (enemy.kind === "ghost") {
          ctx.save();
          ctx.globalAlpha = 0.72;
          ctx.shadowColor = "rgba(190,120,255,0.9)";
          ctx.shadowBlur = 18;
          drawImage(ghostImg, x, y, enemy.w, enemy.h, "#c596ff");
          ctx.restore();
        } else {
          drawImage(img, x, y, enemy.w, enemy.h, enemy.kind === "boss" ? "#ff6a4d" : "#df9d6d");
        }
      }

      for (const proj of level.projectiles) {
        const x = proj.x - camX;
        const y = proj.y - camY;
        if (proj.kind === "blood") {
          ctx.save();
          ctx.shadowColor = "rgba(255,60,60,0.9)";
          ctx.shadowBlur = 14;
          drawImage(this.assets.blood, x, y, 18, 18, "#ff3434");
          ctx.restore();
        } else if (proj.kind === "special") {
          if (proj.sprite || this.assets.special) {
            drawImage(proj.sprite || this.assets.special, x, y, 22, 22, "#ff6b3d");
          } else {
            ctx.fillStyle = "#ff6b3d";
            ctx.beginPath();
            ctx.arc(x + proj.w / 2, y + proj.h / 2, 9, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          ctx.fillStyle = "#ffb35c";
          ctx.beginPath();
          ctx.arc(x + proj.w / 2, y + proj.h / 2, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const p = this.player;
      const px = p.x - camX;
      const py = p.y - camY;
      let playerImg = this.assets.player;
      if (p.invincible > 0 && Math.floor(performance.now() / 80) % 2 === 0) {
        ctx.save();
        ctx.globalAlpha = 0.8;
      }
      if (playerImg) {
        if (p.facing < 0) {
          ctx.save();
          ctx.translate(px + p.w, py);
          ctx.scale(-1, 1);
          ctx.drawImage(playerImg, 0, 0, p.w + 6, p.h + 10);
          ctx.restore();
        } else {
          ctx.drawImage(playerImg, px - 2, py - 5, p.w + 6, p.h + 10);
        }
      } else {
        ctx.fillStyle = "#ddd";
        ctx.fillRect(px, py, p.w, p.h);
      }
      if (p.invincible > 0 && Math.floor(performance.now() / 80) % 2 === 0) {
        ctx.restore();
      }

      if (p.shielding) {
        const sx = px + p.w / 2 - 34;
        const sy = py - 28;
        ctx.save();
        ctx.fillStyle = "rgba(140,210,255,0.28)";
        ctx.beginPath();
        ctx.ellipse(sx + 34, sy + 20, 34, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(230,245,255,0.95)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      if (p.attackRect) {
        const ax = p.attackRect.x - camX;
        const ay = p.attackRect.y - camY;
        ctx.save();
        if (this.assets.slash) {
          ctx.globalAlpha = 1;
          const slashX = p.facing >= 0 ? ax + 26 : ax + p.attackRect.w - 28;
          const slashY = ay + p.attackRect.h / 2 - 10;
          ctx.drawImage(this.assets.slash, slashX, slashY, 56, 34);
        } else {
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = "#fff2c7";
          ctx.fillRect(ax, ay, p.attackRect.w, p.attackRect.h);
        }
        ctx.restore();
      }

      this.drawHud(level);
      if (this.message) {
        drawText(this.message, W / 2, H - 36, { color: "#ffd27d", size: 18, align: "center" });
      }
    }

    drawHud(level) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.38)";
      ctx.fillRect(0, 0, W, 48);
      ctx.restore();

      drawText(`Level: ${level.name}`, 12, 12, { color: "#fff", size: 18, weight: "bold" });
      let obj = "Find the key and reach the exit";
      if (level.boss) obj = "Use the sword on the normal boss";
      if (level.boss && level.theme === "castle") obj = "Collect the red orb to attack the ghost";
      drawText(obj, 200, 12, { color: "#e5e6ef", size: 16 });

      for (let i = 0; i < 5; i++) {
        const img = this.assets.life;
        const x = W - 150 + i * 24;
        if (i < this.player.hp) {
          drawImage(img, x, 10, 18, 18, "#ff6e6e");
        } else {
          ctx.save();
          ctx.globalAlpha = 0.35;
          drawImage(img, x, 10, 18, 18, "#733");
          ctx.restore();
        }
      }

      if (level.keyTaken) {
        drawImage(this.assets.key, W - 50, 10, 24, 24, "#ffd45a");
      } else {
        drawImage(this.assets.coin || this.assets.key, W - 50, 10, 24, 24, "#ffd45a");
      }

      if (level.theme === "castle") {
        const boss = level.enemies.find((e) => e.alive && (e.kind === "boss" || e.kind === "ghost"));
        if (boss) {
          const maxHp = boss.kind === "boss" ? 36 : 20;
          const barW = boss.kind === "boss" ? 320 : 220;
          const label = boss.kind === "boss" ? "REAL BOSS" : "GHOST";
          const hint = boss.kind === "boss" ? "Use the sword" : "The sword is useless against the ghost";
          const ratio = clamp(boss.hp / maxHp, 0, 1);
          const bx = W / 2 - barW / 2;
          const by = 50;
          ctx.fillStyle = "rgba(20,10,18,0.85)";
          ctx.fillRect(bx - 4, by - 6, barW + 8, 28);
          ctx.fillStyle = "rgba(75,50,70,0.95)";
          ctx.fillRect(bx, by, barW, 16);
          ctx.fillStyle = boss.kind === "boss" ? "#ff5f45" : "#c07dff";
          ctx.fillRect(bx, by, barW * ratio, 16);
          drawText(label, W / 2, 28, { color: "#ffe8c6", size: 16, align: "center" });
          drawText(hint, W / 2, 68, { color: "#ffd27d", size: 16, align: "center" });
        }
      }
    }

    drawVictory() {
      ctx.clearRect(0, 0, W, H);
      this.drawBackdrop("castle");
      ctx.fillStyle = "rgba(20,10,32,0.66)";
      ctx.fillRect(0, 0, W, H);

      drawText("THE END OF THE GAME", W / 2, 28, { color: "#ffe8c6", size: 40, weight: "bold", align: "center" });
      drawText("Press Enter to skip the scene.", W / 2, 86, { color: "#edf0ff", size: 18, align: "center" });
      drawText("The hero returns the sword to its place.", W / 2, 112, { color: "#edf0ff", size: 18, align: "center" });
      drawText("Then he is taken back to his world.", W / 2, 138, { color: "#edf0ff", size: 18, align: "center" });

      const t = this.victoryTimer;
      const groundY = H - 112;
      const stoneX = W / 2 - 22;
      const stoneY = groundY - 86;
      ctx.fillStyle = "#70728a";
      ctx.fillRect(stoneX, stoneY, 44, 86);
      ctx.fillStyle = "#b5b6c8";
      ctx.fillRect(stoneX + 8, stoneY + 8, 28, 68);
      ctx.strokeStyle = "#4d4d60";
      ctx.strokeRect(stoneX, stoneY, 44, 86);

      let heroX = W / 2 - 180 + Math.min(1, t / 2.2) * 120;
      let heroY = groundY - 40 + Math.sin(t * 8) * 2;
      if (t >= 6) heroY -= Math.min(120, (t - 6) * 140);
      const heroAlpha = t < 6 ? 1 : Math.max(0, 1 - (t - 6) * 0.2);

      ctx.save();
      ctx.globalAlpha = heroAlpha;
      if (this.assets.player) {
        ctx.drawImage(this.assets.player, heroX - 16, heroY - 40, 32, 48);
      } else {
        ctx.fillStyle = "#ddd";
        ctx.fillRect(heroX - 12, heroY - 30, 24, 30);
      }
      ctx.restore();

      const sword = this.assets.weapon;
      const swordX = t < 3.2 ? stoneX + 12 : stoneX + 22;
      const swordY = t < 3.2 ? stoneY - 24 : stoneY - 4;
      if (sword) {
        ctx.save();
        ctx.translate(swordX, swordY);
        ctx.rotate((t < 3.2 ? -0.45 : 0) + Math.sin(t * 2) * 0.02);
        ctx.drawImage(sword, -8, -18, 28, 28);
        ctx.restore();
      }

      drawText("Thank you for playing.", W / 2, H - 40, { color: "#f5efe6", size: 18, align: "center" });
    }

    updateAndRender(dt) {
      this.update(dt);
      this.draw();
    }
  }

  let game = null;
  let lastTime = performance.now();

  function loop(now) {
    const dt = clamp((now - lastTime) / 1000, 0, 1 / 20);
    lastTime = now;
    if (game) game.updateAndRender(dt);
    requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Enter"].includes(e.key)) {
      e.preventDefault();
    }
    if (game) game.handleKeyDown(e);
  });
  window.addEventListener("keyup", (e) => {
    if (game) game.handleKeyUp(e);
  });
  window.addEventListener("mousedown", (e) => {
    if (game) game.handleMouseDown(e);
  });
  window.addEventListener("mouseup", (e) => {
    if (game) game.handleMouseUp(e);
  });
  window.addEventListener("contextmenu", (e) => e.preventDefault());

  loadAssets().then((assets) => {
    game = new Game(assets);
    game.openMenu();
    requestAnimationFrame(loop);
  });
})();
