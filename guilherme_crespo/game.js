const BASE_WIDTH = 960;
const BASE_HEIGHT = 540;
const FPS = 60;
const GRAVITY = 1800;
const PLAYER_SPEED = 320;
const JUMP_FORCE = -620;
const MAX_FALL = 900;
const FINAL_ARENA_WIDTH = 1900;
const FINAL_ARENA_START = 13700;
const WORLD_END = 16050;
const ASSET_DIR = "./artes/";
const LEVELS = [
  ["1", "Pradaria", "saltos simples e moedas"],
  ["2", "Deserto", "plataformas mais apertadas"],
  ["3", "Neve", "ritmo mais alto"],
  ["4", "Selva", "mais poções e inimigos"],
  ["5", "Vulcao", "lavas e rotas altas"],
  ["6", "Ruinas", "jogo mais vertical"],
  ["7", "Cavernas", "inimigos mais duros"],
  ["8", "Costa tempestuosa", "novo bloco de nivel"],
  ["9", "Picos de cristal", "mais especial e vida"],
  ["10", "Arena final", "boss, objetivo e fim"],
];
const LEVEL_STARTS = [
  [110, 380],
  [1670, 380],
  [3320, 380],
  [4820, 380],
  [6270, 380],
  [7780, 380],
  [9225, 380],
  [10680, 380],
  [12180, 380],
  [FINAL_ARENA_START + 30, 380],
];

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");

const keyState = new Set();
let mouseDown = false;
let gameLoop = null;
let lastTime = 0;
let allLevelsUnlocked = false;
let selectedLevel = 0;

function assetUrl(name) {
  return new URL(ASSET_DIR + name, window.location.href).href;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function makeRect(x, y, w, h) {
  return { x, y, w, h };
}

function getLevelCardRect(index) {
  const levelW = 168;
  const levelH = 88;
  const gapX = 8;
  const gapY = 10;
  const startX = 28;
  const startY = 208;
  const col = index % 5;
  const row = Math.floor(index / 5);
  return makeRect(
    startX + col * (levelW + gapX),
    startY + row * (levelH + gapY),
    levelW,
    levelH,
  );
}

function drawTitleScreen(images, selectedLevelIndex) {
  ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  drawImageOrRect(images.bg, 0, 0, BASE_WIDTH, BASE_HEIGHT, "#1c2431");
  tintRect(BASE_WIDTH, BASE_HEIGHT, "#1d2230", 0.38);

  ctx.fillStyle = "#f7f2e9";
  ctx.font = "54px Trebuchet MS, sans-serif";
  ctx.fillText("Tenta chegar ao fim", 120, 68);
  ctx.font = "26px Trebuchet MS, sans-serif";
  ctx.fillText("Plataforma 2D com moedas, poções e pera especial", 120, 116);

  ctx.fillStyle = "#ffd67e";
  ctx.font = "20px Trebuchet MS, sans-serif";
  ctx.fillText("Niveis do jogo", 440, 156);
  ctx.fillStyle = allLevelsUnlocked ? "#9df0b0" : "#ff8d8d";
  ctx.fillText(
    allLevelsUnlocked ? "Estado: todos desbloqueados" : "Estado: apenas o primeiro nivel",
    338,
    180,
  );

  ctx.fillStyle = "#cfd7e1";
  ctx.fillText("ENTER ou ESPACO para jogar", 338, 510);
  ctx.fillText("A/D ou setas: mover   SPACE: salto duplo   Botao esquerdo: atacar   F: pera", 124, 534);

  const panel = { x: 18, y: 194, w: BASE_WIDTH - 36, h: 218 };
  ctx.fillStyle = "#0e121a";
  ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
  ctx.strokeStyle = "#ffffff";
  ctx.strokeRect(panel.x, panel.y, panel.w, panel.h);

  LEVELS.forEach(([num, name, desc], index) => {
    const card = getLevelCardRect(index);
    const unlocked = allLevelsUnlocked || index === 0;
    const selected = index === selectedLevelIndex;
    ctx.fillStyle = selected
      ? (unlocked ? "#56b46e" : "#bc5858")
      : (unlocked ? "#2d7c51" : "#8d3232");
    ctx.fillRect(card.x, card.y, card.w, card.h);
    ctx.strokeStyle = selected ? "#ffe6a0" : "#ffffff";
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(card.x, card.y, card.w, card.h);

    ctx.fillStyle = unlocked ? "#9df0b0" : "#ffb0b0";
    ctx.fillRect(card.x + 10, card.y + 10, 28, 28);
    ctx.fillStyle = "#08111d";
    ctx.font = "20px Trebuchet MS, sans-serif";
    ctx.fillText(num, card.x + 18, card.y + 31);
    ctx.fillStyle = "#f7f2e9";
    ctx.font = "20px Trebuchet MS, sans-serif";
    ctx.fillText(name, card.x + 50, card.y + 28);
    ctx.font = "12px Trebuchet MS, sans-serif";
    ctx.fillStyle = "#e0e6ef";
    ctx.fillText(desc, card.x + 10, card.y + 60);
  });
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function tintRect(width, height, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

class Pickup {
  constructor(kind, x, y, image, value = 1) {
    this.kind = kind;
    this.image = image;
    this.rect = makeRect(x, y, image?.width ?? 24, image?.height ?? 24);
    this.value = value;
    this.collected = false;
  }

  draw(cameraX) {
    if (!this.collected && this.image) {
      ctx.drawImage(this.image, this.rect.x - cameraX, this.rect.y, this.rect.w, this.rect.h);
    }
  }
}

class Enemy {
  constructor(x, y, image, patrolRange = 120, speed = 80) {
    this.image = image;
    this.rect = makeRect(x, y, image?.width ?? 42, image?.height ?? 42);
    this.spawnX = x;
    this.patrolRange = patrolRange;
    this.speed = speed;
    this.dead = false;
    this.direction = 1;
    this.velY = 0;
  }

  update(dt, platforms) {
    if (this.dead) return;
    this.rect.x += this.direction * this.speed * dt;
    if (this.rect.x < this.spawnX - this.patrolRange) {
      this.rect.x = this.spawnX - this.patrolRange;
      this.direction = 1;
    } else if (this.rect.x > this.spawnX + this.patrolRange) {
      this.rect.x = this.spawnX + this.patrolRange;
      this.direction = -1;
    }
    this.velY = Math.min(this.velY + GRAVITY * dt, MAX_FALL);
    this.rect.y += this.velY * dt;
    for (const platform of platforms) {
      if (rectsOverlap(this.rect, platform) && this.velY >= 0) {
        this.rect.y = platform.y - this.rect.h;
        this.velY = 0;
        break;
      }
    }
  }

  draw(cameraX) {
    if (!this.dead && this.image) {
      ctx.drawImage(this.image, this.rect.x - cameraX, this.rect.y, this.rect.w, this.rect.h);
    }
  }
}

class BossShot {
  constructor(x, y, direction) {
    this.rect = makeRect(x, y, 24, 24);
    this.direction = direction;
    this.speed = 420;
    this.dead = false;
  }

  update(dt) {
    this.rect.x += this.direction * this.speed * dt;
    if (this.rect.x + this.rect.w < -200 || this.rect.x > WORLD_END + 250) {
      this.dead = true;
    }
  }

  draw(cameraX) {
    ctx.save();
    ctx.fillStyle = "#d84d40";
    ctx.beginPath();
    ctx.arc(this.rect.x - cameraX + 12, this.rect.y + 12, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffddb0";
    ctx.beginPath();
    ctx.arc(this.rect.x - cameraX + 9, this.rect.y + 9, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Boss {
  constructor(x, y, image) {
    this.image = image;
    this.rect = makeRect(x, y, image?.width ?? 112, image?.height ?? 112);
    this.hp = 24;
    this.dead = false;
    this.direction = -1;
    this.speed = 110;
    this.attackCooldown = 0.75;
  }

  update(dt, player, shots) {
    if (this.dead) return;
    const dx = player.rect.x + player.rect.w / 2 - (this.rect.x + this.rect.w / 2);
    if (Math.abs(dx) < 420) {
      this.direction = dx > 0 ? 1 : -1;
      this.attackCooldown -= dt;
      if (this.attackCooldown <= 0) {
        shots.push(new BossShot(this.rect.x + this.rect.w / 2, this.rect.y + 18, this.direction));
        this.attackCooldown = 1.2;
      }
    } else {
      this.attackCooldown = Math.max(0, this.attackCooldown - dt * 0.25);
    }
    this.rect.x += this.direction * this.speed * dt;
    const arenaLeft = FINAL_ARENA_START - 500;
    const arenaRight = FINAL_ARENA_START + FINAL_ARENA_WIDTH - this.rect.w;
    if (this.rect.x < arenaLeft) {
      this.rect.x = arenaLeft;
      this.direction = 1;
    } else if (this.rect.x > arenaRight) {
      this.rect.x = arenaRight;
      this.direction = -1;
    }
  }

  draw(cameraX) {
    if (!this.dead && this.image) {
      ctx.drawImage(this.image, this.rect.x - cameraX, this.rect.y, this.rect.w, this.rect.h);
    }
  }
}

class Projectile {
  constructor(x, y, direction, image) {
    this.image = image;
    this.rect = makeRect(x, y, 28, 28);
    this.direction = direction;
    this.speed = 680;
    this.dead = false;
  }

  update(dt) {
    this.rect.x += this.direction * this.speed * dt;
    if (this.rect.x + this.rect.w < -200 || this.rect.x > WORLD_END) {
      this.dead = true;
    }
  }

  draw(cameraX) {
    if (this.image) {
      ctx.drawImage(this.image, this.rect.x - cameraX, this.rect.y, this.rect.w, this.rect.h);
    }
  }
}

class Player {
  constructor(x, y, sprite, weaponSprite) {
    this.spriteRight = sprite;
    this.spriteLeft = sprite;
    this.weaponSprite = weaponSprite;
    this.rect = makeRect(x, y, sprite?.width ?? 52, sprite?.height ?? 60);
    this.velX = 0;
    this.velY = 0;
    this.facing = 1;
    this.maxHp = 5;
    this.hp = this.maxHp;
    this.invincibleTime = 0;
    this.strengthTime = 0;
    this.attackTime = 0;
    this.attackCooldown = 0;
    this.attackDamage = 0.5;
    this.specialCharges = 0;
    this.jumpsLeft = 2;
    this.coins = 0;
  }

  startJump() {
    if (this.jumpsLeft > 0) {
      this.velY = JUMP_FORCE;
      this.jumpsLeft -= 1;
    }
  }

  startAttack() {
    if (this.attackCooldown <= 0) {
      this.attackTime = 0.16;
      this.attackCooldown = 0.28;
    }
  }

  useSpecial() {
    if (this.specialCharges > 0) {
      this.specialCharges -= 1;
      return true;
    }
    return false;
  }

  collect(pickup) {
    if (pickup.kind === "coin") {
      this.coins += pickup.value;
    } else if (pickup.kind === "heal") {
      this.hp = Math.min(this.maxHp, this.hp + pickup.value);
    } else if (pickup.kind === "strength") {
      this.specialCharges += 1;
      this.strengthTime = 10;
      this.attackDamage = 1;
    }
  }

  takeDamage(amount) {
    if (this.invincibleTime <= 0) {
      this.hp -= amount;
      this.invincibleTime = 1.5;
    }
  }

  attackHitbox() {
    if (this.attackTime <= 0) return null;
    return this.facing > 0
      ? makeRect(this.rect.x + this.rect.w, this.rect.y + 10, 42, 28)
      : makeRect(this.rect.x - 42, this.rect.y + 10, 42, 28);
  }

  update(dt, platforms) {
    const left = keyState.has("ArrowLeft") || keyState.has("KeyA");
    const right = keyState.has("ArrowRight") || keyState.has("KeyD");
    let move = 0;
    if (left) move -= 1;
    if (right) move += 1;
    if (move !== 0) this.facing = move;

    this.velX = move * PLAYER_SPEED;
    this.velY = Math.min(this.velY + GRAVITY * dt, MAX_FALL);
    this.rect.x += this.velX * dt;
    for (const platform of platforms) {
      if (rectsOverlap(this.rect, platform)) {
        if (this.velX > 0) this.rect.x = platform.x - this.rect.w;
        else if (this.velX < 0) this.rect.x = platform.x + platform.w;
      }
    }

    this.rect.y += this.velY * dt;
    let grounded = false;
    for (const platform of platforms) {
      if (rectsOverlap(this.rect, platform)) {
        if (this.velY > 0) {
          this.rect.y = platform.y - this.rect.h;
          this.velY = 0;
          grounded = true;
          this.jumpsLeft = 2;
        } else if (this.velY < 0) {
          this.rect.y = platform.y + platform.h;
          this.velY = 0;
        }
      }
    }

    this.invincibleTime = Math.max(0, this.invincibleTime - dt);
    this.strengthTime = Math.max(0, this.strengthTime - dt);
    if (this.strengthTime === 0) this.attackDamage = 0.5;
    this.attackTime = Math.max(0, this.attackTime - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    return grounded;
  }

  draw(cameraX) {
    const img = this.facing >= 0 ? this.spriteRight : this.spriteLeft;
    if (img) {
      const flashing = this.invincibleTime > 0 && Math.floor(this.invincibleTime * 12) % 2 === 0;
      if (flashing) ctx.globalAlpha = 0.55;
      ctx.drawImage(img, this.rect.x - cameraX, this.rect.y, this.rect.w, this.rect.h);
      ctx.globalAlpha = 1;
    }

    const hitbox = this.attackHitbox();
    if (hitbox && this.weaponSprite) {
      const flipped = this.facing < 0;
      ctx.save();
      if (flipped) {
        ctx.translate(hitbox.x - cameraX + hitbox.w, hitbox.y);
        ctx.scale(-1, 1);
        ctx.drawImage(this.weaponSprite, 0, 0, 42, 24);
      } else {
        ctx.drawImage(this.weaponSprite, hitbox.x - cameraX + 4, hitbox.y - 2, 42, 24);
      }
      ctx.restore();
    }
  }
}

function buildWorld(images) {
  const platforms = [];
  const coins = [];
  const pickups = [];
  const enemies = [];

  const addPlatform = (x, y, w, h = 24) => platforms.push(makeRect(x, y, w, h));
  const addCoin = (x, y) => coins.push(new Pickup("coin", x, y, images.coin));
  const addHeal = (x, y) => pickups.push(new Pickup("heal", x, y, images.life, 2));
  const addStrength = (x, y) => pickups.push(new Pickup("strength", x, y, images.strength, 1));

  addPlatform(0, 470, 590);
  addPlatform(110, 395, 120);
  addPlatform(300, 340, 120);
  addPlatform(510, 285, 150);
  addPlatform(760, 410, 150);
  addPlatform(1010, 360, 130);
  addPlatform(1230, 300, 130);
  addPlatform(1430, 250, 130);

  addPlatform(1650, 470, 430);
  addPlatform(1790, 395, 110);
  addPlatform(1980, 335, 120);
  addPlatform(2190, 280, 130);
  addPlatform(2400, 410, 130);
  addPlatform(2610, 350, 120);
  addPlatform(2820, 295, 140);
  addPlatform(3050, 240, 120);

  addPlatform(3300, 470, 400);
  addPlatform(3430, 405, 120);
  addPlatform(3630, 345, 120);
  addPlatform(3840, 285, 130);
  addPlatform(4070, 400, 140);
  addPlatform(4290, 330, 140);
  addPlatform(4520, 270, 120);

  addPlatform(4800, 470, 390);
  addPlatform(4930, 405, 120);
  addPlatform(5130, 345, 110);
  addPlatform(5320, 290, 120);
  addPlatform(5530, 235, 120);
  addPlatform(5750, 380, 130);
  addPlatform(5950, 320, 140);

  addPlatform(6250, 470, 390);
  addPlatform(6390, 400, 110);
  addPlatform(6580, 340, 110);
  addPlatform(6770, 285, 120);
  addPlatform(6980, 390, 130);
  addPlatform(7200, 330, 120);
  addPlatform(7420, 270, 120);

  addPlatform(7750, 470, 420);
  addPlatform(7900, 405, 120);
  addPlatform(8090, 345, 120);
  addPlatform(8290, 285, 130);
  addPlatform(8500, 405, 140);
  addPlatform(8730, 335, 140);
  addPlatform(8970, 275, 120);

  addPlatform(9200, 470, 420);
  addPlatform(9350, 405, 120);
  addPlatform(9540, 345, 120);
  addPlatform(9740, 285, 130);
  addPlatform(9950, 405, 140);
  addPlatform(10180, 335, 140);
  addPlatform(10420, 275, 120);

  addPlatform(10650, 470, 1500);
  addPlatform(10790, 405, 120);
  addPlatform(10980, 345, 120);
  addPlatform(11170, 285, 130);
  addPlatform(11395, 390, 140);
  addPlatform(11630, 330, 140);
  addPlatform(11870, 270, 120);

  addPlatform(12150, 470, 1550);
  addPlatform(12300, 400, 120);
  addPlatform(12500, 340, 120);
  addPlatform(12700, 280, 130);
  addPlatform(12920, 390, 140);
  addPlatform(13140, 330, 140);
  addPlatform(13380, 260, 120);

  addPlatform(FINAL_ARENA_START, 470, FINAL_ARENA_WIDTH);
  addPlatform(FINAL_ARENA_START + 140, 405, 120);
  addPlatform(FINAL_ARENA_START + 330, 345, 120);
  addPlatform(FINAL_ARENA_START + 530, 285, 130);
  addPlatform(FINAL_ARENA_START + 750, 235, 150);
  addPlatform(FINAL_ARENA_START + 1000, 360, 160);
  addPlatform(FINAL_ARENA_START + 1250, 300, 170);

  [
    [160, 350], [360, 285], [600, 240], [1060, 310], [1290, 250],
    [1710, 355], [1990, 295], [2390, 365], [2620, 305], [3070, 195],
    [3440, 360], [3650, 300], [4070, 350], [4300, 280], [4540, 220],
    [4930, 365], [5140, 305], [5340, 250], [5540, 200], [5770, 340],
    [6390, 350], [6590, 290], [6790, 235], [6995, 345], [7210, 285],
    [7430, 225], [7905, 360], [8100, 300], [8300, 240], [8520, 190],
    [8740, 315], [8980, 255], [9340, 350], [9550, 290], [9750, 235],
    [9960, 345], [10190, 285], [10430, 225], [10700, 355], [10900, 300],
    [11100, 245], [11320, 190], [11670, 315], [11920, 255],
    [12220, 350], [12410, 290], [12620, 235], [12840, 345], [13060, 285],
    [13280, 225], [13520, 315], [13820, 355], [14020, 295], [14220, 245],
    [14420, 190], [14710, 320], [14920, 260]
  ].forEach(([x, y]) => addCoin(x, y));

  addStrength(560, 245);
  addStrength(5535, 200);
  addStrength(8525, 190);
  addStrength(11310, 190);
  addStrength(2475, 255);
  addStrength(7050, 280);
  addStrength(10890, 335);
  addStrength(12140, 320);
  addStrength(12480, 335);
  addStrength(13920, 320);
  addStrength(14680, 335);

  addHeal(1290, 250);
  addHeal(4300, 280);
  addHeal(7215, 285);
  addHeal(9955, 285);
  addHeal(11650, 315);
  addHeal(5850, 335);
  addHeal(10980, 300);
  addHeal(12310, 315);
  addHeal(12720, 300);
  addHeal(14340, 300);

  const enemyImg = images.enemy;
  [
    [430, 380, 130, 110], [1170, 282, 90, 95], [1800, 342, 110, 105],
    [2470, 357, 120, 100], [3060, 192, 90, 90], [3430, 357, 100, 95],
    [4090, 352, 120, 110], [4960, 357, 120, 100], [5600, 197, 100, 90],
    [6430, 352, 120, 110], [7060, 292, 110, 110], [7910, 357, 130, 110],
    [8580, 187, 120, 100], [9350, 357, 130, 110], [10020, 187, 120, 100],
    [10710, 357, 130, 110], [11430, 187, 120, 100],
    [12190, 357, 130, 110], [12820, 287, 120, 100], [13420, 257, 110, 95],
    [13880, 357, 130, 110], [14500, 187, 120, 100]
  ].forEach(([x, y, range, speed]) => enemies.push(new Enemy(x, y, enemyImg, range, speed)));

  const boss = new Boss(FINAL_ARENA_START + 580, 358, images.boss);
  const objective = makeRect(FINAL_ARENA_START + 760, 350, 64, 120);

  return { platforms, coins, pickups, enemies, boss, objective };
}

function drawImageOrRect(image, x, y, w, h, fallback) {
  if (image) {
    ctx.drawImage(image, x, y, w, h);
  } else {
    ctx.fillStyle = fallback;
    ctx.fillRect(x, y, w, h);
  }
}

function drawHUD(images, player, boss, bossDead, lives) {
  for (let i = 0; i < player.maxHp; i += 1) {
    ctx.save();
    ctx.globalAlpha = i < player.hp ? 1 : 0.35;
    drawImageOrRect(images.life, 18 + i * 34, 14, 26, 26, "#ff6666");
    ctx.restore();
  }

  ctx.fillStyle = "#f7f2e9";
  ctx.font = "20px Trebuchet MS, sans-serif";
  ctx.fillText(`Lives: ${lives}`, 18, 70);

  drawImageOrRect(images.coin, 18, 84, 28, 28, "#f5d36f");
  ctx.fillStyle = "#f7f2e9";
  ctx.font = "26px Trebuchet MS, sans-serif";
  ctx.fillText(`${player.coins}`, 56, 106);

  drawImageOrRect(images.strength, 18, 122, 30, 30, "#6ee88c");
  ctx.fillStyle = player.strengthTime > 0 ? "#ffd66a" : "#c7c7c7";
  const strengthText = player.strengthTime > 0
    ? `Forca: ${Math.ceil(player.strengthTime)}s`
    : "Forca: off";
  ctx.fillText(strengthText, 56, 146);

  drawImageOrRect(images.special, 18, 160, 28, 28, "#d9e4f5");
  ctx.fillStyle = "#f7f2e9";
  ctx.fillText(`Especiais: ${player.specialCharges}`, 56, 184);

  if (!bossDead) {
    ctx.fillStyle = "#ffd0d0";
    ctx.fillText(`Boss HP: ${Math.max(0, Math.ceil(boss.hp))}`, BASE_WIDTH - 160, 34);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "17px Trebuchet MS, sans-serif";
  ctx.fillText("Mover: A/D ou setas  Saltar: Espaco  Atacar: clique esquerdo ou J  Especial: F", 18, BASE_HEIGHT - 18);
}

function drawWorld(images, cameraX, world, gameState) {
  const { platforms, objective, boss } = world;
  ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  drawImageOrRect(images.bg, 0, 0, BASE_WIDTH, BASE_HEIGHT, "#1c2431");

  const zones = [
    [0, 1650, "rgba(100, 190, 120, 0.43)"],
    [1650, 1650, "rgba(220, 190, 90, 0.43)"],
    [3300, 1500, "rgba(170, 210, 240, 0.43)"],
    [4800, 1450, "rgba(90, 170, 120, 0.34)"],
    [6250, 1500, "rgba(150, 80, 60, 0.34)"],
    [7750, 1450, "rgba(120, 140, 120, 0.30)"],
    [9200, 1450, "rgba(130, 110, 180, 0.30)"],
    [10650, 1500, "rgba(95, 145, 180, 0.28)"],
    [12150, 1550, "rgba(150, 120, 200, 0.28)"],
    [FINAL_ARENA_START, FINAL_ARENA_WIDTH, "rgba(120, 140, 120, 0.28)"],
  ];

  for (const [start, width, color] of zones) {
    ctx.fillStyle = color;
    ctx.fillRect(start - cameraX, 0, width, BASE_HEIGHT);
  }

  const mixX = FINAL_ARENA_START - cameraX;
  const gradient = ctx.createLinearGradient(mixX, 0, mixX + FINAL_ARENA_WIDTH, 0);
  gradient.addColorStop(0, "rgba(90, 150, 120, 0.25)");
  gradient.addColorStop(0.33, "rgba(190, 160, 80, 0.25)");
  gradient.addColorStop(0.66, "rgba(180, 210, 230, 0.24)");
  gradient.addColorStop(1, "rgba(100, 140, 120, 0.24)");
  ctx.fillStyle = gradient;
  ctx.fillRect(mixX, 0, FINAL_ARENA_WIDTH, BASE_HEIGHT);

  for (const platform of platforms) {
    let shade = "#503c2b";
    if (platform.y >= 450) shade = "#5e482c";
    else if (platform.y >= 390) shade = "#785c32";
    else if (platform.y >= 320) shade = "#967846";
    ctx.fillStyle = shade;
    ctx.fillRect(platform.x - cameraX, platform.y, platform.w, platform.h);
    ctx.strokeStyle = "#1e140c";
    ctx.lineWidth = 2;
    ctx.strokeRect(platform.x - cameraX + 1, platform.y + 1, platform.w - 2, platform.h - 2);
  }

  if (gameState.boss.dead) {
    drawImageOrRect(images.objective, objective.x - cameraX, objective.y, 64, 120, "#cfd7e1");
  } else {
    ctx.fillStyle = "#343434";
    ctx.fillRect(objective.x - cameraX, objective.y, objective.w, objective.h);
    ctx.strokeStyle = "#111";
    ctx.strokeRect(objective.x - cameraX, objective.y, objective.w, objective.h);
    ctx.fillStyle = "#fff2d0";
    ctx.font = "20px Trebuchet MS, sans-serif";
    ctx.fillText("Boss first", objective.x - cameraX - 10, objective.y - 12);
  }
}

async function main() {
  const images = {
    bg: await loadImage(assetUrl("fundo.png")),
    player: await loadImage(assetUrl("jogador.png")),
    weapon: await loadImage(assetUrl("arma.png")),
    pear: await loadImage(assetUrl("pera.png")),
    coin: await loadImage(assetUrl("coletavel.png")),
    heal: await loadImage(assetUrl("POÇÃO DE CURA.png")),
    strength: await loadImage(assetUrl("poção de força.png")),
    life: await loadImage(assetUrl("vida.png")),
    dimLife: null,
    boss: await loadImage(assetUrl("boss.png")),
    objective: await loadImage(assetUrl("objetivo.png")),
    enemy: await loadImage(assetUrl("inimigo.png")),
    special: await loadImage(assetUrl("especial.png")),
  };
  images.dimLife = images.life;

  let world = buildWorld(images);
  let player = new Player(110, 380, images.player, images.weapon);
  let projectiles = [];
  let bossShots = [];
  let cameraX = 0;
  let lives = 3;
  let checkpoint = [...LEVEL_STARTS[0]];
  let gameState = "title";
  let win = false;
  let lose = false;

  function resetGame() {
    world = buildWorld(images);
    player = new Player(110, 380, images.player, images.weapon);
    projectiles = [];
    bossShots = [];
    cameraX = 0;
    lives = 3;
    checkpoint = [...LEVEL_STARTS[selectedLevel]];
    gameState = "title";
    win = false;
    lose = false;
    overlay.classList.remove("visible");
  }

  function startGame(levelIndex = selectedLevel) {
    selectedLevel = clamp(levelIndex, 0, LEVELS.length - 1);
    if (!allLevelsUnlocked && selectedLevel > 0) {
      selectedLevel = 0;
    }
    checkpoint = [...LEVEL_STARTS[selectedLevel]];
    player.rect.x = checkpoint[0];
    player.rect.y = checkpoint[1];
    player.velX = 0;
    player.velY = 0;
    player.hp = player.maxHp;
    player.jumpsLeft = 2;
    projectiles = [];
    bossShots = [];
    gameState = "playing";
    win = false;
    lose = false;
    overlay.classList.remove("visible");
  }

  function respawnPlayer() {
    player.rect.x = checkpoint[0];
    player.rect.y = checkpoint[1];
    player.velX = 0;
    player.velY = 0;
    player.jumpsLeft = 2;
    player.invincibleTime = 1.5;
    projectiles = [];
    bossShots = [];
  }

  function loseLifeOrGameOver() {
    lives -= 1;
    if (lives > 0) {
      player.hp = player.maxHp;
      respawnPlayer();
    } else {
      gameState = "lose";
      lose = true;
      overlay.classList.remove("visible");
    }
  }

  function stompBoss() {
    world.boss.hp -= player.attackDamage;
    if (world.boss.hp <= 0) {
      world.boss.dead = true;
    }
  }

  function handleBossCollision() {
    const boss = world.boss;
    if (boss.dead) return;

    if (rectsOverlap(player.rect, boss.rect)) {
      const stompZone = player.velY > 0 && player.rect.y + player.rect.h <= boss.rect.y + 48;
      const centered = player.rect.x + player.rect.w / 2 >= boss.rect.x + 4 && player.rect.x + player.rect.w / 2 <= boss.rect.x + boss.rect.w - 4;
      if (player.strengthTime > 0 && stompZone && centered) {
        stompBoss();
        player.rect.y = boss.rect.y - player.rect.h;
        player.velY = JUMP_FORCE * 0.82;
        player.jumpsLeft = 1;
      } else {
        player.takeDamage(1);
      }
    }

    const hitbox = player.attackHitbox();
    if (hitbox && rectsOverlap(hitbox, boss.rect)) {
      stompBoss();
    }
  }

  function update(dt) {
    if (gameState !== "playing") return;

    player.update(dt, world.platforms);
    world.boss.update(dt, player, bossShots);
    for (const enemy of world.enemies) enemy.update(dt, world.platforms);

    for (const projectile of projectiles) {
      projectile.update(dt);
      for (const enemy of world.enemies) {
        if (!enemy.dead && rectsOverlap(projectile.rect, enemy.rect)) {
          enemy.dead = true;
          projectile.dead = true;
        }
      }
      if (!projectile.dead && !world.boss.dead && rectsOverlap(projectile.rect, world.boss.rect)) {
        world.boss.hp -= 2;
        if (world.boss.hp <= 0) world.boss.dead = true;
        projectile.dead = true;
      }
    }
    projectiles = projectiles.filter((p) => !p.dead);

    for (const shot of bossShots) {
      shot.update(dt);
      if (rectsOverlap(shot.rect, player.rect)) {
        player.takeDamage(1);
        shot.dead = true;
      }
    }
    bossShots = bossShots.filter((s) => !s.dead);

    const attackHitbox = player.attackHitbox();
    if (attackHitbox) {
      for (const enemy of world.enemies) {
        if (!enemy.dead && rectsOverlap(attackHitbox, enemy.rect)) enemy.dead = true;
      }
    }

    for (const enemy of world.enemies) {
      if (enemy.dead) continue;
      if (rectsOverlap(player.rect, enemy.rect)) {
        const canStomp = player.strengthTime > 0 && player.velY > 0 && player.rect.y + player.rect.h - enemy.rect.y < 24;
        if (canStomp) {
          enemy.dead = true;
          player.velY = JUMP_FORCE * 0.72;
        } else {
          player.takeDamage(1);
        }
      }
    }

    handleBossCollision();

    for (const pickup of [...world.coins, ...world.pickups]) {
      if (!pickup.collected && rectsOverlap(player.rect, pickup.rect)) {
        pickup.collected = true;
        if (pickup.kind === "heal") {
          if (player.hp < player.maxHp) {
            player.collect(pickup);
          } else {
            lives += 1;
          }
        } else {
          player.collect(pickup);
        }
      }
    }

    const centerX = player.rect.x + player.rect.w / 2;
    if (centerX >= FINAL_ARENA_START) {
      checkpoint = [FINAL_ARENA_START + 30, 380];
    } else if (centerX >= 12150) {
      checkpoint = [12180, 380];
    } else if (centerX >= 10650) {
      checkpoint = [10680, 380];
    } else if (centerX >= 9200) {
      checkpoint = [9225, 380];
    } else if (centerX >= 7750) {
      checkpoint = [7780, 380];
    } else if (centerX >= 6250) {
      checkpoint = [6270, 380];
    } else if (centerX >= 4800) {
      checkpoint = [4820, 380];
    } else if (centerX >= 3300) {
      checkpoint = [3320, 380];
    } else if (centerX >= 1650) {
      checkpoint = [1670, 380];
    }

    if (player.rect.y > BASE_HEIGHT) {
      loseLifeOrGameOver();
    }
    if (player.hp <= 0) {
      loseLifeOrGameOver();
    }

    if (world.boss.dead && rectsOverlap(player.rect, world.objective)) {
      gameState = "win";
      win = true;
      overlay.classList.remove("visible");
    }

    cameraX = clamp(player.rect.x + player.rect.w / 2 - BASE_WIDTH / 2, 0, world.objective.x + world.objective.w + 120 - BASE_WIDTH);
  }

  function draw() {
    drawWorld(images, cameraX, world, { boss: world.boss });

    for (const pickup of world.coins) pickup.draw(cameraX);
    for (const pickup of world.pickups) pickup.draw(cameraX);
    for (const enemy of world.enemies) enemy.draw(cameraX);
    world.boss.draw(cameraX);
    for (const projectile of projectiles) projectile.draw(cameraX);
    for (const shot of bossShots) shot.draw(cameraX);
    player.draw(cameraX);
    drawHUD(images, player, world.boss, world.boss.dead, lives);

    if (gameState === "title") {
      drawTitleScreen(images, selectedLevel);
    }

    if (win) {
      ctx.fillStyle = "rgba(14, 70, 40, 0.42)";
      ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
      ctx.fillStyle = "#ffffff";
      ctx.font = "54px Trebuchet MS, sans-serif";
      ctx.fillText("Voce venceu!", 300, 230);
      ctx.font = "24px Trebuchet MS, sans-serif";
      ctx.fillText("Pressiona R ou Enter para recomeçar", 240, 280);
    }

    if (lose) {
      ctx.fillStyle = "rgba(80, 20, 20, 0.48)";
      ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
      ctx.fillStyle = "#ffffff";
      ctx.font = "54px Trebuchet MS, sans-serif";
      ctx.fillText("Voce perdeu", 304, 230);
      ctx.font = "24px Trebuchet MS, sans-serif";
      ctx.fillText("Pressiona R ou Enter para tentar outra vez", 164, 280);
    }
  }

  function loop(timestamp) {
    const dt = Math.min(0.033, (timestamp - lastTime) / 1000 || 0);
    lastTime = timestamp;
    update(dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    draw();
    gameLoop = window.requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", (event) => {
    keyState.add(event.code);
    if (event.code === "Escape") {
      resetGame();
    }
    if (event.code === "KeyQ") {
      allLevelsUnlocked = !allLevelsUnlocked;
      if (!allLevelsUnlocked) {
        selectedLevel = 0;
      }
    }
    if (gameState === "title" && (event.code === "Enter" || event.code === "Space")) {
      startGame(selectedLevel);
    }
    if (gameState === "playing") {
      if (event.code === "Space") player.startJump();
      if (event.code === "KeyJ" && player.attackCooldown <= 0) player.startAttack();
      if (event.code === "KeyF") {
        if (player.useSpecial()) {
          const direction = player.facing >= 0 ? 1 : -1;
          projectiles.push(new Projectile(player.rect.x + player.rect.w / 2 + direction * 28, player.rect.y + 16, direction, images.pear));
        }
      }
      if ((event.code === "Enter" || event.code === "KeyR") && (win || lose)) {
        resetGame();
      }
    }
  });

  window.addEventListener("keyup", (event) => {
    keyState.delete(event.code);
  });

  window.addEventListener("mousedown", (event) => {
    if (event.button === 0) {
      mouseDown = true;
      if (gameState === "playing") {
        player.startAttack();
      } else if (gameState === "title") {
        const mx = event.offsetX * (BASE_WIDTH / canvas.clientWidth);
        const my = event.offsetY * (BASE_HEIGHT / canvas.clientHeight);
        for (let index = 0; index < LEVELS.length; index += 1) {
          const card = getLevelCardRect(index);
          const unlocked = allLevelsUnlocked || index === 0;
          if (unlocked && mx >= card.x && mx <= card.x + card.w && my >= card.y && my <= card.y + card.h) {
            selectedLevel = index;
            break;
          }
        }
      }
    }
  });

  window.addEventListener("mouseup", () => {
    mouseDown = false;
  });

  startBtn.addEventListener("click", () => startGame());
  restartBtn.addEventListener("click", () => resetGame());

    overlay.classList.remove("visible");
  gameLoop = window.requestAnimationFrame(loop);
}

main();
