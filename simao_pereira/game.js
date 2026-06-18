const WIDTH = 900;
const HEIGHT = 500;
const FPS = 60;
const TILE = 32;
const WORLD_WIDTH = 2400;
const GRAVITY = 0.65;

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const loadingEl = document.getElementById("loading");

const assetPaths = {
  capa: "../artes/capa.png",
  bg: "../artes/fundo.png",
  grassTop: "../artes/relvatopo.png",
  grassMid: "../artes/relvameio.png",
  player: "../artes/jogador.png",
  enemy: "../artes/inimigo.png",
  boss: "../artes/boss.png",
  goal: "../artes/objetivo.png",
  collect: "../artes/coletavel.png",
  special: "../artes/especial.png",
  potion: "../artes/pocao.png",
  life: "../artes/vida.png",
  weapon: "../artes/arma.png",
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function rectsOverlap(a, b) {
  return a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y;
}

function createRect(x, y, w, h) {
  return { x, y, w, h };
}

function drawImage(image, x, y, w, h, flipX = false, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  if (flipX) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(image, 0, 0, w, h);
  } else {
    ctx.drawImage(image, x, y, w, h);
  }
  ctx.restore();
}

function drawText(text, x, y, size = 18, color = "#1f311d", align = "left", weight = "normal") {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px Georgia, serif`;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function buildChallengePlatforms(seed) {
  const patterns = [
    [
      [0, 74, 13, 2],
      [5, 11, 11, 1],
      [15, 21, 9, 1],
      [25, 31, 7, 1],
      [35, 41, 10, 1],
      [45, 51, 8, 1],
      [55, 61, 6, 1],
      [65, 71, 9, 1],
    ],
    [
      [0, 74, 13, 2],
      [4, 9, 10, 1],
      [13, 18, 8, 1],
      [22, 27, 11, 1],
      [31, 36, 9, 1],
      [40, 45, 7, 1],
      [49, 54, 10, 1],
      [58, 63, 8, 1],
      [67, 72, 6, 1],
    ],
    [
      [0, 74, 13, 2],
      [3, 8, 11, 1],
      [12, 17, 9, 1],
      [21, 26, 7, 1],
      [30, 35, 10, 1],
      [39, 44, 8, 1],
      [48, 53, 6, 1],
      [57, 62, 9, 1],
      [66, 71, 7, 1],
    ],
  ];
  return patterns[seed % patterns.length];
}

function buildExtraLevels() {
  const extraLevels = [];
  const enemyStarts = [320, 680, 1040, 1400, 1760, 2020];
  const descriptions = [
    "Troncos altos",
    "Mudas traicoeiras",
    "Caminho estreito",
    "Fora da trilha",
    "Bicos e rampas",
    "Tempestade verde",
  ];

  for (let levelNum = 4; levelNum < 10; levelNum++) {
    const seed = levelNum - 4;
    const platforms = buildChallengePlatforms(seed);
    const enemyCount = 4 + (seed % 2);
    const enemies = [];
    for (let idx = 0; idx < enemyCount; idx++) {
      const x = enemyStarts[idx] + seed * 20;
      const y = [300, 268, 236, 204, 268, 236][idx];
      const left = Math.max(160, x - 110);
      const right = Math.min(2280, x + 140);
      const speed = 1.1 + 0.08 * ((seed + idx) % 3);
      enemies.push([x, y, left, right, speed]);
    }

    extraLevels.push({
      name: `Nivel ${levelNum}`,
      description: descriptions[seed],
      platforms,
      playerStart: [64, 300],
      enemies,
      boss: [2140, 160 - (seed % 3) * 8, 2060, 2280, 14 + seed],
      pickups: [
        ["collect", 500 + seed * 20, 236, 1],
        ["collect", 940 + seed * 18, 180, 1],
        ["potion", 1280 + seed * 10, 210, 2],
        ["life", 470 + seed * 15, 230, 1],
      ],
      goal: [2290, 380],
    });
  }

  extraLevels.push({
    name: "boss fight",
    description: "Batalha final extrema",
    platforms: [
      [0, 74, 13, 2],
      [6, 11, 11, 1],
      [14, 19, 9, 1],
      [22, 27, 7, 1],
      [30, 35, 10, 1],
      [38, 43, 8, 1],
      [46, 51, 6, 1],
      [54, 59, 9, 1],
      [62, 67, 7, 1],
    ],
    playerStart: [64, 300],
    enemies: [
      [280, 300, 180, 420, 1.8],
      [540, 268, 420, 720, 2.0],
      [820, 236, 700, 980, 2.1],
      [1100, 204, 980, 1280, 2.2],
      [1420, 236, 1300, 1600, 2.0],
      [1700, 268, 1580, 1880, 2.1],
      [1960, 204, 1840, 2160, 2.2],
      [2200, 236, 2080, 2280, 2.4],
    ],
    boss: [2140, 148, 2060, 2280, 100],
    pickups: [],
    goal: [2290, 380],
  });

  return extraLevels;
}

const LEVELS = [
  {
    name: "Nivel 1",
    description: "Floresta inicial",
    platforms: [
      [0, 74, 13, 2],
      [3, 9, 10, 1],
      [11, 16, 8, 1],
      [18, 24, 11, 1],
      [27, 34, 9, 1],
      [37, 45, 7, 1],
      [49, 57, 10, 1],
      [61, 68, 8, 1],
      [70, 74, 11, 1],
    ],
    playerStart: [64, 300],
    enemies: [
      [320, 300, 256, 420, 1.2],
      [720, 236, 640, 900, 1.0],
      [1180, 268, 1088, 1310, 1.4],
      [1720, 300, 1600, 1860, 1.1],
      [2050, 236, 1980, 2190, 1.3],
    ],
    boss: [2140, 180, 2060, 2280, 12],
    pickups: [
      ["collect", 560, 260, 1],
      ["collect", 990, 180, 1],
      ["collect", 1430, 140, 1],
      ["collect", 1810, 260, 1],
      ["potion", 1280, 210, 2],
      ["life", 470, 230, 1],
    ],
    goal: [2290, 380],
  },
  {
    name: "Nivel 2",
    description: "Trilhos altos",
    platforms: [
      [0, 74, 13, 2],
      [4, 10, 11, 1],
      [13, 19, 9, 1],
      [22, 28, 7, 1],
      [31, 38, 10, 1],
      [42, 49, 8, 1],
      [53, 60, 6, 1],
      [63, 69, 9, 1],
    ],
    playerStart: [64, 300],
    enemies: [
      [400, 268, 320, 520, 1.4],
      [780, 204, 640, 960, 1.3],
      [1260, 172, 1140, 1400, 1.5],
      [1650, 236, 1520, 1800, 1.4],
      [2020, 268, 1900, 2180, 1.5],
    ],
    boss: [2180, 148, 2080, 2320, 14],
    pickups: [
      ["collect", 520, 260, 1],
      ["collect", 880, 180, 1],
      ["collect", 1320, 140, 1],
      ["collect", 1700, 210, 1],
      ["potion", 1140, 140, 2],
      ["life", 1540, 110, 1],
    ],
    goal: [2290, 380],
  },
  {
    name: "Nivel 3 - Guardiao",
    description: "Ultimo teste da floresta",
    platforms: [
      [0, 74, 13, 2],
      [2, 8, 10, 1],
      [10, 15, 8, 1],
      [18, 23, 11, 1],
      [27, 32, 9, 1],
      [36, 42, 7, 1],
      [46, 52, 10, 1],
      [56, 62, 8, 1],
      [66, 72, 6, 1],
    ],
    playerStart: [64, 300],
    enemies: [
      [340, 300, 240, 440, 1.5],
      [700, 236, 600, 840, 1.4],
      [1080, 172, 980, 1260, 1.6],
      [1470, 268, 1360, 1620, 1.5],
      [1840, 204, 1720, 2020, 1.6],
      [2080, 236, 1980, 2200, 1.7],
    ],
    boss: [2140, 148, 2060, 2320, 18],
    pickups: [
      ["collect", 500, 260, 1],
      ["collect", 920, 180, 1],
      ["collect", 1360, 140, 1],
      ["collect", 1760, 210, 1],
      ["potion", 1180, 140, 2],
      ["life", 1560, 110, 1],
    ],
    goal: [2290, 380],
  },
  ...buildExtraLevels(),
];

class TileMap {
  constructor(platforms = null) {
    this.rows = 15;
    this.cols = Math.floor(WORLD_WIDTH / TILE);
    this.grid = Array.from({ length: this.rows }, () => Array.from({ length: this.cols }, () => false));
    this.platforms = platforms;
    this.build();
  }

  setCell(c, r) {
    if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) {
      this.grid[r][c] = true;
    }
  }

  platform(start, end, row, thickness = 1) {
    for (let c = start; c < end; c++) {
      for (let t = 0; t < thickness; t++) {
        this.setCell(c, row + t);
      }
    }
  }

  build() {
    for (const [start, end, row, thickness] of this.platforms) {
      this.platform(start, end, row, thickness);
    }
  }

  solidRects() {
    const rects = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c]) {
          rects.push(createRect(c * TILE, r * TILE, TILE, TILE));
        }
      }
    }
    return rects;
  }

  draw(cameraX, assets) {
    const firstCol = Math.max(0, Math.floor(cameraX / TILE) - 2);
    const lastCol = Math.min(this.cols, Math.floor(cameraX / TILE) + Math.ceil(WIDTH / TILE) + 4);
    for (let r = 0; r < this.rows; r++) {
      for (let c = firstCol; c < lastCol; c++) {
        if (!this.grid[r][c]) continue;
        const x = c * TILE - cameraX;
        const y = r * TILE;
        const above = r === 0 || !this.grid[r - 1][c];
        const tile = above ? assets.grassTop : assets.grassMid;
        ctx.drawImage(tile, x, y, TILE, TILE);
      }
    }
  }
}

class Pickup {
  constructor(kind, x, y, image, value = 1) {
    this.kind = kind;
    this.rect = createRect(x, y, 20, 20);
    this.image = image;
    this.value = value;
    this.active = true;
  }

  draw(cameraX) {
    if (this.active) {
      ctx.drawImage(this.image, this.rect.x - cameraX, this.rect.y, 20, 20);
    }
  }
}

class Projectile {
  constructor(x, y, direction, image, damage = 1, driftY = 0) {
    this.rect = createRect(x, y, 20, 20);
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.image = image;
    this.damage = damage;
    this.speed = 7.5;
    this.driftY = driftY;
    this.dead = false;
  }

  update(solids) {
    this.x += this.direction * this.speed;
    this.y += this.driftY;
    this.rect.x = this.x;
    this.rect.y = this.y;
    const hitWall = solids.some((tile) => rectsOverlap(this.rect, tile));
    if (this.rect.x + this.rect.w < 0 || this.rect.x > WORLD_WIDTH || hitWall) {
      this.dead = true;
    }
  }

  draw(cameraX) {
    if (!this.dead) {
      ctx.drawImage(this.image, this.rect.x - cameraX, this.rect.y, 20, 20);
    }
  }
}

class BossProjectile {
  constructor(x, y, vx, vy) {
    this.rect = createRect(x, y, 26, 26);
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.gravity = 0.45;
    this.dead = false;
  }

  update(solids) {
    this.vy = Math.min(this.vy + this.gravity, 12);
    this.x += this.vx;
    this.y += this.vy;
    this.rect.x = this.x;
    this.rect.y = this.y;
    if (solids.some((tile) => rectsOverlap(this.rect, tile)) || this.rect.x + this.rect.w < 0 || this.rect.x > WORLD_WIDTH || this.rect.y > HEIGHT + 80) {
      this.dead = true;
    }
  }

  draw(cameraX) {
    if (this.dead) return;
    ctx.save();
    ctx.fillStyle = "#5a3a20";
    ctx.beginPath();
    ctx.ellipse(this.rect.x - cameraX + 13, this.rect.y + 13, 13, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8b6430";
    ctx.beginPath();
    ctx.ellipse(this.rect.x - cameraX + 15, this.rect.y + 10, 8, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2f1b11";
    ctx.beginPath();
    ctx.ellipse(this.rect.x - cameraX + 17, this.rect.y + 15, 4, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Enemy {
  constructor(x, y, leftBound, rightBound, image, hp = 1, speed = 1.2, size = [32, 32]) {
    this.rect = createRect(x, y, size[0], size[1]);
    this.x = x;
    this.y = y;
    this.leftBound = leftBound;
    this.rightBound = rightBound;
    this.image = image;
    this.hp = hp;
    this.speed = speed;
    this.vy = 0;
    this.dead = false;
    this.dir = -1;
  }

  hurt(amount = 1) {
    this.hp -= amount;
    if (this.hp <= 0) this.dead = true;
  }

  update(solids) {
    if (this.dead) return;
    const edgeProbe = createRect(
      this.dir > 0 ? this.rect.x + this.rect.w + 1 : this.rect.x - 5,
      this.rect.y + this.rect.h + 1,
      4,
      2,
    );
    if (!solids.some((tile) => rectsOverlap(edgeProbe, tile))) {
      this.dir *= -1;
    }

    this.x += this.dir * this.speed;
    this.rect.x = this.x;
    for (const tile of solids) {
      if (rectsOverlap(this.rect, tile)) {
        if (this.dir > 0) this.rect.x = tile.x - this.rect.w;
        else this.rect.x = tile.x + tile.w;
        this.x = this.rect.x;
        this.dir *= -1;
        break;
      }
    }

    if (this.rect.x < this.leftBound) {
      this.rect.x = this.leftBound;
      this.x = this.rect.x;
      this.dir = 1;
    } else if (this.rect.x + this.rect.w > this.rightBound) {
      this.rect.x = this.rightBound - this.rect.w;
      this.x = this.rect.x;
      this.dir = -1;
    }

    this.vy = Math.min(this.vy + 0.6, 10);
    this.y += this.vy;
    this.rect.y = this.y;
    let onGround = false;
    for (const tile of solids) {
      if (rectsOverlap(this.rect, tile)) {
        if (this.vy > 0) {
          this.rect.y = tile.y - this.rect.h;
          onGround = true;
        } else if (this.vy < 0) {
          this.rect.y = tile.y + tile.h;
        }
        this.y = this.rect.y;
        this.vy = 0;
      }
    }
    if (!onGround) {
      this.vy = Math.min(this.vy + 0.2, 10);
    }
  }

  draw(cameraX) {
    if (!this.dead) {
      drawImage(this.image, this.rect.x - cameraX, this.rect.y, this.rect.w, this.rect.h, false, 1);
    }
  }
}

class Boss extends Enemy {
  constructor(x, y, leftBound, rightBound, image, hp = 12) {
    super(x, y, leftBound, rightBound, image, hp, 2.0, [64, 64]);
  }
}

class Player {
  constructor(x, y, image, attackImage) {
    this.rect = createRect(x, y, 28, 30);
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.image = image;
    this.attackImage = attackImage;
    this.facing = 1;
    this.health = 3;
    this.maxHealth = 10;
    this.score = 0;
    this.jumpsLeft = 1;
    this.extraJump = 1;
    this.specialCooldown = 0;
    this.specialCooldownMax = FPS * 5;
    this.invuln = 0;
    this.attackTimer = 0;
    this.attackCooldown = 0;
    this.attackRect = null;
  }

  move(input) {
    const accel = 0.6;
    const maxSpeed = 4.5;
    if (input.left) {
      this.vx -= accel;
      this.facing = -1;
    }
    if (input.right) {
      this.vx += accel;
      this.facing = 1;
    }
    if (!input.left && !input.right) {
      this.vx *= 0.82;
    }
    this.vx = clamp(this.vx, -maxSpeed, maxSpeed);
  }

  jump() {
    if (this.onGround) {
      this.vy = -11.5;
      this.onGround = false;
      this.jumpsLeft = 1 + this.extraJump;
    } else if (this.jumpsLeft > 0) {
      this.vy = -10.5;
      this.jumpsLeft -= 1;
    }
  }

  startAttack() {
    if (this.attackCooldown <= 0) {
      this.attackTimer = 12;
      this.attackCooldown = 24;
    }
  }

  update(solids) {
    this.invuln = Math.max(0, this.invuln - 1);
    this.attackCooldown = Math.max(0, this.attackCooldown - 1);
    this.attackTimer = Math.max(0, this.attackTimer - 1);
    if (this.attackTimer > 0) {
      const width = 28;
      const height = 24;
      if (this.facing > 0) {
        this.attackRect = createRect(this.rect.x + this.rect.w - 2, this.rect.y + 3, width, height);
      } else {
        this.attackRect = createRect(this.rect.x - width + 2, this.rect.y + 3, width, height);
      }
    } else {
      this.attackRect = null;
    }

    this.vy = Math.min(this.vy + GRAVITY, 12);
    this.x += this.vx;
    this.rect.x = this.x;
    for (const tile of solids) {
      if (rectsOverlap(this.rect, tile)) {
        if (this.vx > 0) this.rect.x = tile.x - this.rect.w;
        else if (this.vx < 0) this.rect.x = tile.x + tile.w;
        this.x = this.rect.x;
        this.vx = 0;
      }
    }

    this.y += this.vy;
    this.rect.y = this.y;
    this.onGround = false;
    for (const tile of solids) {
      if (rectsOverlap(this.rect, tile)) {
        if (this.vy > 0) {
          this.rect.y = tile.y - this.rect.h;
          this.onGround = true;
          this.jumpsLeft = 1 + this.extraJump;
        } else if (this.vy < 0) {
          this.rect.y = tile.y + tile.h;
        }
        this.y = this.rect.y;
        this.vy = 0;
      }
    }

    if (this.rect.x < 0) {
      this.rect.x = 0;
      this.x = this.rect.x;
    }
    if (this.rect.x + this.rect.w > WORLD_WIDTH) {
      this.rect.x = WORLD_WIDTH - this.rect.w;
      this.x = this.rect.x;
    }
    if (this.rect.y > HEIGHT + 100) {
      this.health = 0;
    }
  }

  draw(cameraX) {
    const flipped = this.facing < 0;
    const alpha = this.invuln > 0 && this.invuln % 4 < 2 ? 0.55 : 1;
    drawImage(this.image, this.rect.x - cameraX, this.rect.y, 32, 32, flipped, alpha);
    if (this.attackRect) {
      drawImage(this.attackImage, this.attackRect.x - cameraX, this.attackRect.y, 20, 20, flipped, 1);
    }
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

class Game {
  constructor(assets) {
    this.assets = assets;
    this.state = "title";
    this.currentLevelIndex = 0;
    this.unlockedLevelCount = 1;
    this.carryHealth = 3;
    this.specialCheat = false;
    this.levelMessage = "";
    this.levelMessageTimer = 0;
    this.levelButtons = this.buildLevelButtons(LEVELS.length);
    this.message = "";
    this.messageTimer = 0;
    this.cameraX = 0;
    this.input = { left: false, right: false, jumpQueued: false, attackQueued: false, specialQueued: false, resetQueued: false };
    this.loadLevel(0, 3);
  }

  buildLevelButtons(count) {
    const cols = count > 5 ? 5 : count;
    const cardW = 150;
    const cardH = 88;
    const gapX = 22;
    const gapY = 24;
    const totalW = cols * cardW + (cols - 1) * gapX;
    const startX = Math.round((WIDTH - totalW) / 2);
    const rows = Math.ceil(count / cols);
    const totalH = rows * cardH + (rows - 1) * gapY;
    const startY = 175 - Math.round(totalH / 2);
    return Array.from({ length: count }, (_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return createRect(startX + col * (cardW + gapX), startY + row * (cardH + gapY), cardW, cardH);
    });
  }

  loadLevel(levelIndex, startingHealth = null) {
    this.currentLevelIndex = levelIndex;
    this.level = LEVELS[levelIndex];
    this.map = new TileMap(this.level.platforms);
    this.solids = this.map.solidRects();
    this.player = new Player(this.level.playerStart[0], this.level.playerStart[1], this.assets.player, this.assets.weapon);
    if (startingHealth === null) {
      startingHealth = this.carryHealth;
    }
    this.player.maxHealth = 10;
    this.player.health = clamp(startingHealth, 1, this.player.maxHealth);
    this.player.specialCooldownMax = levelIndex === 9 ? FPS * 3 : FPS * 5;
    this.enemies = this.level.enemies.map(([x, y, left, right, speed]) => new Enemy(x, y, left, right, this.assets.enemy, 1, speed));
    const [bossX, bossY, bossLeft, bossRight, bossHp] = this.level.boss;
    this.boss = new Boss(bossX, bossY, bossLeft, bossRight, this.assets.boss, bossHp);
    if (levelIndex === 9) {
      this.boss.speed = 3.1;
    }
    this.bossHpMax = bossHp;
    this.projectiles = [];
    this.bossProjectiles = [];
    this.bossThrowTimer = levelIndex === 9 ? 30 : 999999;
    this.pickups = this.level.pickups.map(([kind, x, y, value]) => {
      const key = kind === "collect" ? "collect" : kind;
      return new Pickup(kind, x, y, this.assets[key], value);
    });
    this.goalRect = createRect(this.level.goal[0], this.level.goal[1], 48, 60);
    this.cameraX = 0;
    this.message = "";
    this.messageTimer = 0;
  }

  resetGame() {
    this.loadLevel(this.currentLevelIndex, this.carryHealth);
  }

  startLevelSelect(message = "") {
    this.state = "level_select";
    this.levelMessage = message;
    this.levelMessageTimer = message ? 180 : 0;
  }

  showMessage(text, duration = 120) {
    this.message = text;
    this.messageTimer = duration;
  }

  updateCamera() {
    this.cameraX = clamp(this.player.rect.x + this.player.rect.w / 2 - WIDTH / 2, 0, WORLD_WIDTH - WIDTH);
  }

  onKeyDown(key) {
    if (key === "ArrowLeft" || key === "a" || key === "A") this.input.left = true;
    if (key === "ArrowRight" || key === "d" || key === "D") this.input.right = true;
    if (key === " " || key === "ArrowUp" || key === "w" || key === "W") this.input.jumpQueued = true;
    if (key === "r" || key === "R") this.input.resetQueued = true;
    if (key === "v" || key === "V") {
      this.specialCheat = true;
      this.player.specialCooldown = 0;
    }
    if (key === "b" || key === "B") {
      this.specialCheat = false;
      this.player.specialCooldown = this.player.specialCooldownMax;
    }
    if (key === "m" || key === "M") {
      this.player.health = this.player.maxHealth;
      this.carryHealth = this.player.maxHealth;
    }
    if (key === "n" || key === "N") {
      this.unlockedLevelCount = LEVELS.length;
      this.state = "level_select";
    }
    if (key === "Escape") {
      if (this.state === "playing") this.state = "level_select";
      else if (this.state === "level_select") this.state = "title";
    }
    if (this.state === "title" && key === "Enter") {
      this.state = "level_select";
    } else if (this.state === "level_select") {
      if (/^[1-9]$/.test(key)) {
        this.startLevelFromSelect(Number(key) - 1);
      } else if (key === "0") {
        this.startLevelFromSelect(9);
      } else if (key === "Backspace") {
        this.state = "title";
      }
    } else if (this.state === "win" && key === "Enter") {
      this.state = "level_select";
    } else if (this.state === "gameover" && key === "Enter") {
      this.state = "level_select";
    }
  }

  onMouseDown(button) {
    if (button === 0) this.input.attackQueued = true;
    if (button === 2) this.input.specialQueued = true;
  }

  screenToCanvasPos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  startLevelFromSelect(levelIndex) {
    if (levelIndex >= 0 && levelIndex < LEVELS.length && levelIndex < this.unlockedLevelCount) {
      this.loadLevel(levelIndex, this.carryHealth);
      this.state = "playing";
    }
  }

  handlePickups() {
    for (const pickup of this.pickups) {
      if (pickup.active && rectsOverlap(this.player.rect, pickup.rect)) {
        pickup.active = false;
        if (pickup.kind === "collect") {
          this.player.score += 10 * pickup.value;
          this.showMessage("Coletavel encontrado!");
        } else if (pickup.kind === "potion") {
          this.player.health = Math.min(this.player.maxHealth, this.player.health + 2);
          this.showMessage("Pocao usada! Vida restaurada.");
        } else if (pickup.kind === "life") {
          this.player.health = Math.min(this.player.maxHealth, this.player.health + 1);
          this.showMessage("Vida extra!");
        }
      }
    }
  }

  handleAttacks() {
    if (!this.player.attackRect) return;
    for (const enemy of this.enemies) {
      if (!enemy.dead && rectsOverlap(this.player.attackRect, enemy.rect)) {
        enemy.hurt(1);
        this.player.score += 25;
      }
    }
    if (!this.boss.dead && rectsOverlap(this.player.attackRect, this.boss.rect)) {
      this.boss.hurt(1);
      this.player.score += 50;
    }
  }

  fireSpecial() {
    if (this.player.specialCooldown > 0) {
      const remaining = Math.max(1, Math.ceil(this.player.specialCooldown / FPS));
      this.showMessage(`Especial a recarregar: ${remaining}s`);
      return;
    }
    const offset = this.player.facing > 0 ? 26 : -10;
    const x = this.player.rect.x + this.player.rect.w / 2 + offset;
    const y = this.player.rect.y + this.player.rect.h / 2 - 10;
    const damage = this.specialCheat ? 999999 : (this.currentLevelIndex === 9 ? 5 : 2);
    this.projectiles.push(new Projectile(x, y, this.player.facing, this.assets.special, damage));
    this.showMessage("Especial lancado!");
    if (!this.specialCheat) {
      this.player.specialCooldown = this.player.specialCooldownMax;
    }
  }

  bossThrowObject() {
    if (this.boss.dead || this.currentLevelIndex !== 9) return;
    const direction = this.player.rect.x + this.player.rect.w / 2 >= this.boss.rect.x + this.boss.rect.w / 2 ? 1 : -1;
    const spawnX = this.boss.rect.x + this.boss.rect.w / 2 + direction * 22;
    const spawnY = this.boss.rect.y + 10;
    const distance = Math.abs(this.player.rect.x + this.player.rect.w / 2 - (this.boss.rect.x + this.boss.rect.w / 2));
    const baseVx = direction * (5.0 + Math.min(2.4, distance / 520));
    this.bossProjectiles.push(new BossProjectile(spawnX, spawnY, baseVx, -9.6));
    this.bossProjectiles.push(new BossProjectile(spawnX, spawnY + 6, baseVx * 0.9, -11.0));
    this.bossThrowTimer = 22 + Math.floor(Math.random() * 19);
  }

  handleEnemyContact() {
    if (this.player.invuln > 0) return;
    for (const enemy of this.enemies) {
      if (!enemy.dead && rectsOverlap(this.player.rect, enemy.rect)) {
        this.player.health -= 1;
        this.player.invuln = 60;
        this.player.vy = -8;
        this.player.vx = this.player.rect.x + this.player.rect.w / 2 < enemy.rect.x + enemy.rect.w / 2 ? -3 : 3;
        return;
      }
    }
    if (!this.boss.dead && rectsOverlap(this.player.rect, this.boss.rect)) {
      this.player.health -= 1;
      this.player.invuln = 75;
      this.player.vy = -9;
      this.player.vx = this.player.rect.x + this.player.rect.w / 2 < this.boss.rect.x + this.boss.rect.w / 2 ? -4 : 4;
    }
  }

  enemiesCleared() {
    return this.enemies.every((enemy) => enemy.dead) && this.boss.dead;
  }

  drawHud() {
    for (let i = 0; i < this.player.health; i++) {
      ctx.drawImage(this.assets.life, 16 + i * 22, 12, 20, 20);
    }
    drawText(`Pontos: ${this.player.score}`, 16, 54, 18, "#1f311d");
    drawText(`${this.level.name} - ${this.level.description}`, 16, 78, 18, "#1f311d");
    drawText(`Inimigos restantes: ${this.enemies.filter((enemy) => !enemy.dead).length}`, 16, 102, 18, "#1f311d");
    drawText("Especial", 16, 128, 18, "#1f311d");

    const barX = 96;
    const barY = 122;
    const barW = 160;
    const barH = 12;
    ctx.fillStyle = "#323232";
    ctx.fillRect(barX, barY, barW, barH);
    if (this.player.specialCooldown <= 0) {
      ctx.fillStyle = "#46a85d";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.strokeStyle = "#151515";
      ctx.strokeRect(barX, barY, barW, barH);
      drawText("Pronto", barX + barW + 10, 131, 18, "#1f311d");
    } else {
      const fillW = Math.max(0, Math.floor(barW * (1 - this.player.specialCooldown / this.player.specialCooldownMax)));
      ctx.fillStyle = "#ecaa4a";
      ctx.fillRect(barX, barY, fillW, barH);
      ctx.strokeStyle = "#151515";
      ctx.strokeRect(barX, barY, barW, barH);
      drawText(`${Math.max(1, Math.ceil(this.player.specialCooldown / FPS))}s`, barX + barW + 10, 131, 18, "#1f311d");
    }

    if (this.currentLevelIndex === 9) {
      drawText("Vida do Boss", WIDTH - 230, 30, 18, "#1f311d");
      const bossBarX = WIDTH - 230;
      const bossBarY = 40;
      const bossBarW = 200;
      const bossBarH = 14;
      ctx.fillStyle = "#323232";
      ctx.fillRect(bossBarX, bossBarY, bossBarW, bossBarH);
      ctx.fillStyle = "#c84646";
      ctx.fillRect(bossBarX, bossBarY, Math.max(0, Math.floor(bossBarW * (this.boss.hp / this.bossHpMax))), bossBarH);
      ctx.strokeStyle = "#151515";
      ctx.strokeRect(bossBarX, bossBarY, bossBarW, bossBarH);
      drawText(`${this.boss.hp}/${this.bossHpMax}`, bossBarX + bossBarW + 8, 24, 18, "#1f311d");
    }

    if (!this.enemiesCleared()) {
      drawText("Mate todos os inimigos para liberar a bandeira.", WIDTH / 2, 24, 18, "#1f311d", "center");
    } else {
      drawText("A bandeira final esta ativa. Alcance-a!", WIDTH / 2, 24, 18, "#1f311d", "center");
    }

    if (this.messageTimer > 0) {
      const padX = 10;
      const padY = 8;
      ctx.save();
      ctx.font = "18px Georgia, serif";
      const width = ctx.measureText(this.message).width + padX * 2;
      const boxX = WIDTH / 2 - width / 2;
      const boxY = HEIGHT - 58;
      ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
      ctx.fillRect(boxX, boxY, width, 30);
      drawText(this.message, WIDTH / 2, HEIGHT - 37, 18, "#ffffff", "center");
      ctx.restore();
    }
  }

  drawScene() {
    ctx.drawImage(this.assets.bg, 0, 0, WIDTH, HEIGHT);
    this.map.draw(this.cameraX, this.assets);

    for (const pickup of this.pickups) pickup.draw(this.cameraX);
    for (const projectile of this.projectiles) projectile.draw(this.cameraX);

    const goalX = this.goalRect.x - this.cameraX;
    if (this.enemiesCleared()) {
      ctx.drawImage(this.assets.goal, goalX, this.goalRect.y - 12, 48, 48);
    } else {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.drawImage(this.assets.goal, goalX, this.goalRect.y - 12, 48, 48);
      ctx.restore();
    }

    for (const enemy of this.enemies) enemy.draw(this.cameraX);
    for (const projectile of this.bossProjectiles) projectile.draw(this.cameraX);
    drawImage(this.assets.boss, this.boss.rect.x - this.cameraX, this.boss.rect.y, 64, 64, false, this.boss.dead ? 0.45 : 1);
    this.player.draw(this.cameraX);
    this.drawHud();
  }

  updateGameplay() {
    this.player.move(this.input);
    if (this.specialCheat) {
      this.player.specialCooldown = 0;
    } else {
      this.player.specialCooldown = Math.max(0, this.player.specialCooldown - 1);
    }

    if (this.input.jumpQueued) {
      this.player.jump();
      this.input.jumpQueued = false;
    }
    if (this.input.resetQueued) {
      this.resetGame();
      this.input.resetQueued = false;
    }
    if (this.input.attackQueued) {
      this.player.startAttack();
      this.input.attackQueued = false;
    }
    if (this.input.specialQueued) {
      this.fireSpecial();
      this.input.specialQueued = false;
    }

    this.player.update(this.solids);
    for (const enemy of this.enemies) enemy.update(this.solids);
    this.boss.update(this.solids);

    if (this.currentLevelIndex === 9 && !this.boss.dead) {
      this.bossThrowTimer -= 1;
      if (this.bossThrowTimer <= 0) this.bossThrowObject();
    }

    this.handleAttacks();
    this.handleEnemyContact();
    this.handlePickups();

    for (const projectile of this.projectiles) projectile.update(this.solids);
    for (const projectile of this.bossProjectiles) projectile.update(this.solids);

    for (const projectile of this.projectiles) {
      if (projectile.dead) continue;
      for (const enemy of this.enemies) {
        if (!enemy.dead && rectsOverlap(projectile.rect, enemy.rect)) {
          enemy.hurt(projectile.damage);
          this.player.score += 40 * projectile.damage;
          projectile.dead = true;
          break;
        }
      }
      if (!projectile.dead && !this.boss.dead && rectsOverlap(projectile.rect, this.boss.rect)) {
        this.boss.hurt(projectile.damage);
        this.player.score += 60 * projectile.damage;
        projectile.dead = true;
      }
    }

    for (const projectile of this.bossProjectiles) {
      if (projectile.dead) continue;
      if (rectsOverlap(projectile.rect, this.player.rect)) {
        this.player.health -= 1;
        this.player.invuln = 55;
        this.player.vy = -8;
        this.player.vx = this.player.rect.x + this.player.rect.w / 2 < projectile.rect.x + projectile.rect.w / 2 ? -3 : 3;
        projectile.dead = true;
      }
    }

    this.projectiles = this.projectiles.filter((projectile) => !projectile.dead);
    this.bossProjectiles = this.bossProjectiles.filter((projectile) => !projectile.dead);

    if (rectsOverlap(this.player.rect, this.goalRect) && this.enemiesCleared()) {
      this.unlockedLevelCount = Math.min(LEVELS.length, Math.max(this.unlockedLevelCount, this.currentLevelIndex + 2));
      this.carryHealth = this.player.health;
      if (this.currentLevelIndex === 9) {
        this.message = "tu ganhas-te parabens";
        this.messageTimer = FPS * 3;
        this.state = "win";
      } else {
        this.startLevelSelect(`${this.level.name} concluido!`);
      }
    }

    if (this.player.health <= 0) {
      this.carryHealth = 3;
      this.state = "gameover";
    } else if (this.state === "playing") {
      this.carryHealth = this.player.health;
    }

    this.messageTimer = Math.max(0, this.messageTimer - 1);
    this.updateCamera();
  }

  drawTitle() {
    ctx.drawImage(this.assets.capa, 0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "rgba(255, 255, 255, 0.32)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = "rgba(255, 248, 235, 0.86)";
    ctx.fillRect(30, 175, 520, 170);
    drawText("Explora o mapa de niveis e escolhe a fase que queres jogar.", 50, 205, 18, "#20351d");
    drawText("Setas ou WASD: mover | Espaco: pular | Clique esquerdo: atacar", 50, 240, 18, "#20351d");
    drawText("Clique direito: lancar o especial quando estiver pronto", 50, 270, 18, "#20351d");
    drawText("Enter: abrir mapa de niveis | Esc: sair", 50, 300, 18, "#20351d");
  }

  drawEndScreen(win = true) {
    ctx.drawImage(this.assets.capa, 0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = win ? "rgba(20, 35, 20, 0.48)" : "rgba(20, 20, 20, 0.58)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawText(win ? "tu ganhas-te parabens" : "GAME OVER", WIDTH / 2, 210, 44, win ? "#e6ffe0" : "#ffdcdc", "center", "bold");
    drawText("Enter para voltar ao mapa", WIDTH / 2, 270, 28, win ? "#e6ffe0" : "#ffdcdc", "center", "bold");
    drawText(`Pontuacao final: ${this.player.score}`, WIDTH / 2, 320, 20, win ? "#e6ffe0" : "#ffdcdc", "center");
  }

  drawLevelSelect() {
    ctx.drawImage(this.assets.bg, 0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "rgba(245, 238, 220, 0.82)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawText("Mapa de Niveis", WIDTH / 2, 78, 40, "#1e301d", "center", "bold");
    drawText("Escolhe o nivel que queres jogar.", WIDTH / 2, 118, 18, "#1e301d", "center");
    drawText("Clique num nivel desbloqueado ou usa 1-9 e 0 para o ultimo.", WIDTH / 2, 146, 18, "#1e301d", "center");

    if (this.levelMessageTimer > 0 && this.levelMessage) {
      drawText(this.levelMessage, WIDTH / 2, 180, 28, "#1f1f1f", "center", "bold");
    }

    for (let i = 0; i < this.levelButtons.length; i++) {
      const rect = this.levelButtons[i];
      const level = LEVELS[i];
      const unlocked = i < this.unlockedLevelCount;
      const color = unlocked ? "#bbe3a8" : "#aaaaaa";
      const outline = unlocked ? "#4a6e45" : "#666666";
      ctx.fillStyle = color;
      ctx.strokeStyle = outline;
      ctx.lineWidth = 3;
      roundRect(rect.x, rect.y, rect.w, rect.h, 14, true, true);

      const node = createRect(rect.x + rect.w / 2 - 20, rect.y - 35, 40, 40);
      ctx.fillStyle = "#fff7e6";
      ctx.strokeStyle = outline;
      roundRect(node.x, node.y, node.w, node.h, 20, true, true);
      drawText(String(i + 1), node.x + node.w / 2, node.y + 27, 26, outline, "center", "bold");

      drawText(level.name, rect.x + rect.w / 2, rect.y + 38, 18, "#1a1a1a", "center", "bold");
      drawText(level.description, rect.x + rect.w / 2, rect.y + 60, 16, "#1a1a1a", "center");
      drawText(unlocked ? "Pronto para jogar" : "Bloqueado", rect.x + rect.w / 2, rect.y + 82, 14, "#4d5f4d", "center");

      if (i > 0) {
        const prev = this.levelButtons[i - 1];
        ctx.strokeStyle = "#777777";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(prev.x + prev.w, prev.y + prev.h / 2);
        ctx.lineTo(rect.x, rect.y + rect.h / 2);
        ctx.stroke();
      }
    }
  }

  draw() {
    if (this.state === "title") this.drawTitle();
    else if (this.state === "level_select") this.drawLevelSelect();
    else if (this.state === "playing") this.drawScene();
    else if (this.state === "win") this.drawEndScreen(true);
    else if (this.state === "gameover") this.drawEndScreen(false);
  }

  update() {
    if (this.state === "playing") {
      this.updateGameplay();
    } else if (this.state === "level_select") {
      this.levelMessageTimer = Math.max(0, this.levelMessageTimer - 1);
    } else if (this.state === "win" || this.state === "gameover") {
      this.messageTimer = Math.max(0, this.messageTimer - 1);
    }
  }
}

function roundRect(x, y, w, h, r, fill, stroke) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

async function boot() {
  const keys = Object.entries(assetPaths);
  const images = await Promise.all(keys.map(([, src]) => loadImage(src)));
  const assets = Object.fromEntries(keys.map(([key], index) => [key, images[index]]));
  loadingEl.style.display = "none";
  const game = new Game(assets);

  window.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Tab"].includes(event.key)) {
      event.preventDefault();
    }
    game.onKeyDown(event.key);
  });

  window.addEventListener("keyup", (event) => {
    if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
      game.input.left = false;
    }
    if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
      game.input.right = false;
    }
  });

  window.addEventListener("mousedown", (event) => {
    game.onMouseDown(event.button);
  });

  window.addEventListener("blur", () => {
    game.input.left = false;
    game.input.right = false;
    game.input.jumpQueued = false;
    game.input.attackQueued = false;
    game.input.specialQueued = false;
  });

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  canvas.addEventListener("click", (event) => {
    const pos = game.screenToCanvasPos(event.clientX, event.clientY);
    if (game.state !== "level_select") return;
    for (let i = 0; i < game.levelButtons.length; i++) {
      const rect = game.levelButtons[i];
      if (pos.x >= rect.x && pos.x <= rect.x + rect.w && pos.y >= rect.y && pos.y <= rect.y + rect.h) {
        game.startLevelFromSelect(i);
        break;
      }
    }
  });

  let last = 0;
  function frame(now) {
    if (!last) last = now;
    const elapsed = now - last;
    if (elapsed >= 1000 / FPS) {
      last = now - (elapsed % (1000 / FPS));
      game.update();
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      game.draw();
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

boot().catch((error) => {
  loadingEl.textContent = "Nao foi possivel carregar os assets. Abre o projeto com um servidor local.";
  console.error(error);
});
