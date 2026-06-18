const WIDTH = 1100;
const HEIGHT = 700;
const GROUND_Y = HEIGHT - 86;
const GRAVITY = 0.55;
const MAX_LEVEL = 3;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const colors = {
  white: "#f5f7ff",
  black: "#0a0c14",
  sky: "#6cd0ff",
  gold: "#ffd75c",
  red: "#ff6060",
  green: "#5adc96",
  purple: "#b178ff",
};

const assets = {
  background: "./Artes/fundo.png",
  cover: "./Artes/capa.png",
  player: "./Artes/jogador.png",
  enemy: "./Artes/inimigo.png",
  boss: "./Artes/boss.png",
  energy: "./Artes/coletavel.png",
  goal: "./Artes/objetivo.png",
  special: "./Artes/especial.png",
  knife: "./Artes/arma.png",
  heart: "./Artes/vida.png",
  grassTop: "./Artes/relvatopo.png",
  grassMid: "./Artes/relvameio.png",
};

const images = {};
const keys = new Set();
const stars = Array.from({ length: 70 }, () => ({
  x: Math.random() * WIDTH,
  y: Math.random() * HEIGHT,
  radius: 1 + Math.random() * 2,
  speed: 0.4 + Math.random() * 1.8,
}));

const LEVEL_LAYOUTS = {
  1: {
    platforms: [
      [120, 560, 200, 26],
      [390, 495, 210, 26],
      [700, 430, 220, 26],
      [520, 315, 190, 26],
      [200, 245, 180, 26],
    ],
    collectibles: [[200, 520], [480, 455], [790, 390], [580, 275]],
    enemies: [[455, 441, 140], [760, 376, 120], [245, 191, 95]],
    boss: [920, GROUND_Y - 98, 120],
    goal: [1000, GROUND_Y - 39],
  },
  2: {
    platforms: [
      [70, 560, 180, 26],
      [300, 500, 200, 26],
      [560, 550, 180, 26],
      [760, 420, 220, 26],
      [470, 320, 180, 26],
      [170, 250, 200, 26],
    ],
    collectibles: [[120, 520], [390, 460], [620, 510], [840, 380], [240, 210]],
    enemies: [[355, 446, 125], [615, 496, 105], [830, 366, 130], [230, 196, 90]],
    boss: [940, GROUND_Y - 106, 130],
    goal: [1000, GROUND_Y - 39],
  },
  3: {
    platforms: [
      [90, 585, 170, 26],
      [290, 520, 170, 26],
      [540, 455, 170, 26],
      [790, 390, 190, 26],
      [610, 285, 170, 26],
      [360, 220, 170, 26],
      [130, 310, 170, 26],
    ],
    collectibles: [[140, 545], [350, 480], [600, 415], [850, 350], [680, 245], [420, 180]],
    enemies: [[340, 466, 110], [590, 401, 105], [850, 336, 120], [660, 231, 90], [180, 256, 95]],
    boss: [945, GROUND_Y - 112, 140],
    goal: [1000, GROUND_Y - 39],
  },
};

let lastFrame = 0;
let game = null;

function loadImages() {
  const entries = Object.entries(assets);
  return Promise.all(entries.map(([name, src]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      images[name] = image;
      resolve();
    };
    image.onerror = reject;
    image.src = src;
  })));
}

function rect(x, y, width, height) {
  return { x, y, width, height };
}

function cloneRect(r) {
  return rect(r.x, r.y, r.width, r.height);
}

function intersects(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function inflateRect(r, dx, dy) {
  return rect(r.x - dx / 2, r.y - dy / 2, r.width + dx, r.height + dy);
}

function createPlayer() {
  return {
    rect: rect(80, GROUND_Y - 64, 64, 64),
    velocityX: 0,
    velocityY: 0,
    speed: 5.5,
    jumpForce: 12.5,
    onGround: false,
    facing: 1,
    maxHealth: 4,
    health: 4,
    level: 1,
    invulnerableUntil: 0,
    attackDelay: 120,
    lastAttack: -120,
    attackUntil: 0,
    attackDamage: 1,
    specialDelay: 2600,
    lastSpecial: -2600,
    specialDamage: 2,
    jumpBufferUntil: 0,
    coyoteUntil: 0,
  };
}

function enemyHealthForLevel(level) {
  return 3 + level * 2;
}

function bossHealthForLevel(level) {
  return 18 + level * 10;
}

function createLevel(levelIndex, player) {
  const layout = LEVEL_LAYOUTS[levelIndex];
  const platforms = [rect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y)];
  for (const data of layout.platforms) {
    platforms.push(rect(...data));
  }

  const collectibles = layout.collectibles.map(([x, y]) => ({
    rect: rect(x - 16, y - 16, 32, 32),
    bobOffset: Math.random() * Math.PI * 2,
  }));

  const enemies = layout.enemies.map(([x, y, patrol]) => ({
    rect: rect(x, y, 44 + levelIndex * 5, 44 + levelIndex * 5),
    originX: x,
    speed: 2.8 + levelIndex * 0.9,
    direction: Math.random() > 0.5 ? 1 : -1,
    health: enemyHealthForLevel(levelIndex),
    patrol,
  }));

  const extraEnemyCount = levelIndex * 2;
  for (let i = 0; i < extraEnemyCount; i += 1) {
    const [baseX, baseY, basePatrol] = layout.enemies[i % layout.enemies.length];
    const size = 44 + levelIndex * 6;
    const spawnX = Math.min(WIDTH - 200, baseX + 70 + i * 55);
    const spawnY = Math.max(120, baseY - (i % 2) * 18);
    enemies.push({
      rect: rect(spawnX, spawnY, size, size),
      originX: spawnX,
      speed: 3.0 + levelIndex * 0.95,
      direction: i % 2 === 0 ? -1 : 1,
      health: 4 + levelIndex * 2,
      patrol: Math.max(70, basePatrol - 20),
    });
  }

  const [bossX, bossY, patrol] = layout.boss;
  const bossSize = 118 + levelIndex * 12;
  const pendingBoss = {
    rect: rect(bossX, bossY, bossSize, bossSize),
    originX: bossX,
    speed: 3.3 + levelIndex * 0.8,
    direction: -1,
    health: bossHealthForLevel(levelIndex),
    patrol,
  };

  player.rect.x = 80;
  player.rect.y = GROUND_Y - player.rect.height;
  player.velocityX = 0;
  player.velocityY = 0;
  player.onGround = false;
  player.jumpBufferUntil = 0;
  player.coyoteUntil = 0;

  const goalSpriteRect = rect(layout.goal[0] - 39, layout.goal[1] - 39, 78, 78);
  const goalRect = inflateRect(goalSpriteRect, 70, 40);

  return {
    platforms,
    collectibles,
    enemies,
    boss: null,
    pendingBoss,
    bossSpawned: false,
    bossDefeated: false,
    goalRect,
    goalSpriteRect,
    goalOpen: false,
    collected: 0,
    totalCollectibles: collectibles.length,
    message: "Collect everything, defeat the boss, and reach the goal.",
  };
}

function resetGame() {
  const player = createPlayer();
  return {
    state: "menu",
    player,
    levelIndex: 1,
    score: 0,
    stage: createLevel(1, player),
    specials: [],
  };
}

function attackRect(player) {
  const width = 66;
  const height = 30;
  const y = player.rect.y + player.rect.height / 2 - height / 2;
  const x = player.facing === 1 ? player.rect.x + player.rect.width - 4 : player.rect.x - width + 4;
  return rect(x, y, width, height);
}

function canSpecial(player, now) {
  return now - player.lastSpecial >= player.specialDelay;
}

function castSpecial(player, now) {
  if (!canSpecial(player, now)) {
    return null;
  }
  player.lastSpecial = now;
  const width = images.special.width;
  const height = images.special.height;
  const x = player.facing === 1 ? player.rect.x + player.rect.width - 4 : player.rect.x - width + 4;
  return {
    rect: rect(x, player.rect.y + player.rect.height / 2 - height / 2, width, height),
    speed: 8 * player.facing,
    damage: player.specialDamage,
    distanceLeft: 320,
  };
}

function queueJump(player, now) {
  player.jumpBufferUntil = now + 140;
}

function tryJump(player, now) {
  if (now <= player.jumpBufferUntil && (player.onGround || now <= player.coyoteUntil)) {
    player.velocityY = -player.jumpForce;
    player.onGround = false;
    player.jumpBufferUntil = 0;
    player.coyoteUntil = 0;
    return true;
  }
  return false;
}

function moveHorizontal(r, vx, platforms) {
  r.x += vx;
  for (const platform of platforms) {
    if (intersects(r, platform)) {
      if (vx > 0) {
        r.x = platform.x - r.width;
      } else if (vx < 0) {
        r.x = platform.x + platform.width;
      }
    }
  }
}

function moveVertical(r, vy, platforms) {
  let landed = false;
  r.y += vy;
  for (const platform of platforms) {
    if (intersects(r, platform)) {
      if (vy > 0) {
        r.y = platform.y - r.height;
        landed = true;
      } else if (vy < 0) {
        r.y = platform.y + platform.height;
      }
      vy = 0;
    }
  }
  return { vy, landed };
}

function updatePlayer(delta, now) {
  const player = game.player;
  const stage = game.stage;

  player.velocityX = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) {
    player.velocityX = -player.speed;
    player.facing = -1;
  }
  if (keys.has("KeyD") || keys.has("ArrowRight")) {
    player.velocityX = player.speed;
    player.facing = 1;
  }

  moveHorizontal(player.rect, player.velocityX * 60 * delta, stage.platforms);

  if (player.onGround) {
    player.coyoteUntil = now + 110;
  }
  tryJump(player, now);
  player.velocityY += GRAVITY;
  player.velocityY = Math.min(player.velocityY, 14);
  const vertical = moveVertical(player.rect, player.velocityY * 60 * delta, stage.platforms);
  player.velocityY = vertical.vy;
  player.onGround = vertical.landed;
  if (vertical.landed) {
    player.coyoteUntil = now + 110;
  }

  if (player.rect.y > HEIGHT + 80) {
    player.rect.x = 80;
    player.rect.y = GROUND_Y - player.rect.height;
    player.velocityY = 0;
    player.jumpBufferUntil = 0;
    player.coyoteUntil = 0;
    takeHit(player, now);
    stage.message = "You fell. Try again.";
  }
}

function takeHit(player, now) {
  if (now < player.invulnerableUntil) {
    return false;
  }
  player.health -= 1;
  player.invulnerableUntil = now + 1000;
  return true;
}

function updateCollectibles() {
  const stage = game.stage;
  for (let i = stage.collectibles.length - 1; i >= 0; i -= 1) {
    if (intersects(game.player.rect, stage.collectibles[i].rect)) {
      stage.collectibles.splice(i, 1);
      stage.collected += 1;
      game.score += 20;
      const remaining = stage.totalCollectibles - stage.collected;
      stage.message = remaining === 0
        ? "All collectibles found. Clear the enemies to summon the boss."
        : `Collectible secured. ${remaining} left.`;
    }
  }
}

function moveEnemy(enemy, platforms) {
  enemy.rect.x += enemy.speed * enemy.direction;
  let collided = false;
  for (const platform of platforms) {
    if (intersects(enemy.rect, platform)) {
      if (enemy.direction > 0) {
        enemy.rect.x = platform.x - enemy.rect.width;
      } else {
        enemy.rect.x = platform.x + platform.width;
      }
      collided = true;
    }
  }

  const support = rect(enemy.rect.x + enemy.rect.width / 2 - 5, enemy.rect.y + enemy.rect.height + 2, 10, 4);
  const hasFloor = platforms.some((platform) => intersects(support, platform));
  if (collided || !hasFloor || Math.abs(enemy.rect.x - enemy.originX) > enemy.patrol) {
    enemy.direction *= -1;
  }
}

function updateEnemies(now) {
  const stage = game.stage;
  for (const enemy of stage.enemies) {
    moveEnemy(enemy, stage.platforms);
    if (intersects(enemy.rect, game.player.rect) && takeHit(game.player, now)) {
      stage.message = "An enemy hit you at close range.";
    }
  }

  if (stage.boss) {
    const boss = stage.boss;
    moveEnemy(boss, stage.platforms);
    if (Math.abs(game.player.rect.x - boss.rect.x) < 320) {
      boss.direction = game.player.rect.x > boss.rect.x ? 1 : -1;
      boss.rect.x += boss.direction * Math.max(1, boss.speed * 0.45);
    }
    if (intersects(boss.rect, game.player.rect) && takeHit(game.player, now)) {
      stage.message = "The boss crushed you.";
    }
  }
}

function updateBossSpawn() {
  const stage = game.stage;
  if (stage.bossSpawned || stage.bossDefeated) {
    return;
  }
  if (stage.collected >= stage.totalCollectibles && stage.enemies.length === 0) {
    stage.boss = stage.pendingBoss;
    stage.pendingBoss = null;
    stage.bossSpawned = true;
    stage.message = "Boss incoming. Defeat it to unlock the goal.";
  }
}

function handleKnifeHits() {
  const player = game.player;
  const stage = game.stage;
  if (performance.now() > player.attackUntil) {
    return;
  }
  const knife = attackRect(player);

  for (let i = stage.enemies.length - 1; i >= 0; i -= 1) {
    if (intersects(knife, stage.enemies[i].rect)) {
      stage.enemies[i].health -= player.attackDamage;
      player.attackUntil = 0;
      if (stage.enemies[i].health <= 0) {
        stage.enemies.splice(i, 1);
        game.score += 35;
        stage.message = "Enemy taken down with the knife.";
      } else {
        stage.message = "Clean hit.";
      }
      return;
    }
  }

  if (stage.boss && intersects(knife, stage.boss.rect)) {
    stage.boss.health -= player.attackDamage;
    player.attackUntil = 0;
    game.score += 10;
    stage.message = "Boss hit.";
    if (stage.boss.health <= 0) {
      stage.boss = null;
      stage.bossDefeated = true;
      stage.message = "Boss defeated. Run to the goal.";
    }
  }
}

function updateSpecials() {
  const stage = game.stage;
  for (let i = game.specials.length - 1; i >= 0; i -= 1) {
    const special = game.specials[i];
    special.rect.x += special.speed;
    special.distanceLeft -= Math.abs(special.speed);
    if (special.distanceLeft <= 0 || special.rect.x > WIDTH + 40 || special.rect.x + special.rect.width < -40) {
      game.specials.splice(i, 1);
      continue;
    }

    if (stage.platforms.some((platform) => intersects(special.rect, platform))) {
      game.specials.splice(i, 1);
      continue;
    }

    let removed = false;
    for (let j = stage.enemies.length - 1; j >= 0; j -= 1) {
      if (intersects(special.rect, stage.enemies[j].rect)) {
        stage.enemies[j].health -= special.damage;
        game.specials.splice(i, 1);
        removed = true;
        if (stage.enemies[j].health <= 0) {
          stage.enemies.splice(j, 1);
          game.score += 35;
          stage.message = "Special shot eliminated an enemy.";
        } else {
          stage.message = "Special shot hit the target.";
        }
        break;
      }
    }
    if (removed) {
      continue;
    }

    if (stage.boss && intersects(special.rect, stage.boss.rect)) {
      stage.boss.health -= special.damage;
      game.specials.splice(i, 1);
      game.score += 12;
      stage.message = "Special shot struck the boss.";
      if (stage.boss.health <= 0) {
        stage.boss = null;
        stage.bossDefeated = true;
        stage.message = "Boss defeated. Run to the goal.";
      }
    }
  }
}

function updateGoalState() {
  const stage = game.stage;
  if (stage.collected >= stage.totalCollectibles && stage.boss === null && stage.bossDefeated) {
    stage.goalOpen = true;
    stage.message = "Goal unlocked. Move into the objective to reach the next level.";
  } else {
    stage.goalOpen = false;
  }
}

function advanceLevel() {
  if (game.levelIndex >= MAX_LEVEL) {
    game.state = "victory";
    return;
  }
  game.levelIndex += 1;
  game.player.level = game.levelIndex;
  game.player.attackDamage = 1 + Math.floor(game.levelIndex / 2);
  game.player.speed += 0.25;
  game.player.health = Math.min(game.player.maxHealth, game.player.health + 1);
  game.specials = [];
  game.stage = createLevel(game.levelIndex, game.player);
  game.stage.message = `Level ${game.levelIndex} started. Collect everything again.`;
}

function checkGoal() {
  const stage = game.stage;
  if (intersects(game.player.rect, stage.goalRect) || intersects(game.player.rect, stage.goalSpriteRect)) {
    if (stage.goalOpen) {
      game.score += 100;
      advanceLevel();
    } else if (stage.collected < stage.totalCollectibles) {
      stage.message = `The goal is locked. ${stage.totalCollectibles - stage.collected} collectibles remain.`;
    } else if (stage.boss || !stage.bossDefeated) {
      stage.message = "The goal only opens after the boss falls.";
    }
  }
}

function drawImage(image, x, y, width, height) {
  ctx.drawImage(image, x, y, width, height);
}

function drawText(text, x, y, size, color, align = "left", family = "Orbitron", weight = "700") {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${family}, sans-serif`;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawSpace() {
  drawImage(images.background, 0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "rgba(15, 10, 40, 0.42)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  for (const star of stars) {
    star.x -= star.speed;
    if (star.x < -6) {
      star.x = WIDTH + Math.random() * 120;
      star.y = Math.random() * HEIGHT;
    }
    ctx.beginPath();
    ctx.fillStyle = colors.white;
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlatform(platform, ground = false) {
  const image = ground ? images.grassMid : images.grassTop;
  const tileWidth = 110;
  for (let x = platform.x; x < platform.x + platform.width; x += tileWidth) {
    const width = Math.min(tileWidth, platform.x + platform.width - x);
    drawImage(image, x, platform.y, width, platform.height);
  }
}

function drawHud(now) {
  const player = game.player;
  const stage = game.stage;
  for (let i = 0; i < player.health; i += 1) {
    drawImage(images.heart, 24 + i * 34, 18, 28, 28);
  }
  drawText(`Level ${game.levelIndex}`, 24, 76, 28, colors.white, "left", "Rajdhani");
  drawText(`Score ${game.score}`, 24, 104, 28, colors.white, "left", "Rajdhani");
  drawText(`Collectibles ${stage.collected}/${stage.totalCollectibles}`, 24, 132, 24, colors.gold, "left", "Rajdhani");

  ctx.strokeStyle = colors.white;
  ctx.strokeRect(24, 148, 210, 16);
  if (stage.boss) {
    const ratio = Math.max(0, Math.min(1, stage.boss.health / bossHealthForLevel(game.levelIndex)));
    ctx.fillStyle = colors.red;
    ctx.fillRect(27, 151, Math.min(204, 204 * ratio), 10);
    drawText("Boss", 240, 160, 18, colors.white, "left", "Rajdhani");
  } else {
    ctx.fillStyle = stage.bossDefeated ? colors.green : colors.purple;
    ctx.fillRect(27, 151, 204, 10);
    drawText(stage.bossDefeated ? "Boss defeated" : "Boss locked", 240, 160, 18, colors.white, "left", "Rajdhani");
  }

  drawText("Knife [Left Mouse]", 24, 190, 18, now - player.lastAttack >= player.attackDelay ? colors.white : colors.purple, "left", "Rajdhani");
  drawText("Special [Right Mouse]", 24, 216, 18, canSpecial(player, now) ? colors.gold : colors.purple, "left", "Rajdhani");
  drawText(stage.message, 24, 242, 18, colors.sky, "left", "Rajdhani");
}

function drawMenu() {
  drawImage(images.cover, 0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "rgba(10, 12, 20, 0.45)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const controls = [
    "Enter  Start",
    "A / D or Arrows  Move",
    "Space  Jump",
    "Left Mouse  Knife",
    "Right Mouse  Special",
  ];
  const lineHeight = 22;
  const panel = rect(WIDTH - 273, HEIGHT - 152, 245, lineHeight * controls.length + 18);
  ctx.fillStyle = "rgba(8, 12, 28, 0.92)";
  roundRect(panel, 14, true, false);
  ctx.strokeStyle = colors.sky;
  roundRect(panel, 14, false, true);
  controls.forEach((line, index) => {
    drawText(line, panel.x + 14, panel.y + 28 + index * lineHeight, 16, colors.white, "left", "Roboto");
  });
}

function drawEndScreen(victory) {
  drawSpace();
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawText(victory ? "Galaxy secured!" : "Mission failed!", WIDTH / 2, 230, 52, victory ? colors.gold : colors.red, "center");
  drawText(`Final score: ${game.score}`, WIDTH / 2, 304, 30, colors.white, "center", "Rajdhani");
  drawText("Press ENTER to play again", WIDTH / 2, 364, 28, colors.sky, "center", "Rajdhani");
}

function drawGame(now) {
  drawSpace();
  const stage = game.stage;
  const player = game.player;

  stage.platforms.forEach((platform, index) => drawPlatform(platform, index === 0));

  const bobTime = now / 220;
  for (const item of stage.collectibles) {
    const floatY = item.rect.y + Math.sin(bobTime + item.bobOffset) * 4;
    drawImage(images.energy, item.rect.x, floatY, item.rect.width, item.rect.height);
  }

  for (const enemy of stage.enemies) {
    drawImage(images.enemy, enemy.rect.x, enemy.rect.y, enemy.rect.width, enemy.rect.height);
    const ratio = Math.max(0, Math.min(1, enemy.health / (enemy.rect.width > 50 ? 4 + game.levelIndex * 2 : enemyHealthForLevel(game.levelIndex))));
    ctx.fillStyle = colors.red;
    roundRect(rect(enemy.rect.x, enemy.rect.y - 10, enemy.rect.width, 5), 2, true, false);
    ctx.fillStyle = colors.green;
    roundRect(rect(enemy.rect.x, enemy.rect.y - 10, enemy.rect.width * ratio, 5), 2, true, false);
  }

  for (const special of game.specials) {
    const sprite = special.speed > 0 ? images.special : flipImage(images.special);
    drawImage(sprite, special.rect.x, special.rect.y, special.rect.width, special.rect.height);
    ctx.strokeStyle = colors.gold;
    roundRect(special.rect, 6, false, true);
  }

  if (stage.boss) {
    drawImage(images.boss, stage.boss.rect.x, stage.boss.rect.y, stage.boss.rect.width, stage.boss.rect.height);
    ctx.fillStyle = colors.red;
    roundRect(rect(stage.boss.rect.x, stage.boss.rect.y - 14, stage.boss.rect.width, 7), 3, true, false);
    ctx.fillStyle = colors.gold;
    roundRect(rect(stage.boss.rect.x, stage.boss.rect.y - 14, stage.boss.rect.width * Math.max(0, Math.min(1, stage.boss.health / bossHealthForLevel(game.levelIndex))), 7), 3, true, false);
  }

  drawImage(images.goal, stage.goalSpriteRect.x, stage.goalSpriteRect.y, stage.goalSpriteRect.width, stage.goalSpriteRect.height);
  ctx.strokeStyle = stage.goalOpen ? colors.gold : colors.purple;
  roundRect(stage.goalSpriteRect, 10, false, true);
  if (stage.goalOpen) {
    ctx.strokeStyle = colors.gold;
    roundRect(stage.goalRect, 16, false, true);
  }

  if (Math.floor(now / 110) % 2 === 0 || now > player.invulnerableUntil) {
    drawImage(images.player, player.rect.x, player.rect.y, player.rect.width, player.rect.height);
  }

  if (now <= player.attackUntil) {
    const knife = attackRect(player);
    const knifeSprite = player.facing === 1 ? images.knife : flipImage(images.knife);
    drawImage(knifeSprite, knife.x, knife.y, knife.width, knife.height);
    ctx.strokeStyle = colors.gold;
    roundRect(knife, 6, false, true);
  }

  drawHud(now);
}

let flippedCache = new WeakMap();
function flipImage(image) {
  if (flippedCache.has(image)) {
    return flippedCache.get(image);
  }
  const off = document.createElement("canvas");
  off.width = image.width;
  off.height = image.height;
  const offCtx = off.getContext("2d");
  offCtx.translate(image.width, 0);
  offCtx.scale(-1, 1);
  offCtx.drawImage(image, 0, 0);
  flippedCache.set(image, off);
  return off;
}

function roundRect(r, radius, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(r.x + radius, r.y);
  ctx.lineTo(r.x + r.width - radius, r.y);
  ctx.quadraticCurveTo(r.x + r.width, r.y, r.x + r.width, r.y + radius);
  ctx.lineTo(r.x + r.width, r.y + r.height - radius);
  ctx.quadraticCurveTo(r.x + r.width, r.y + r.height, r.x + r.width - radius, r.y + r.height);
  ctx.lineTo(r.x + radius, r.y + r.height);
  ctx.quadraticCurveTo(r.x, r.y + r.height, r.x, r.y + r.height - radius);
  ctx.lineTo(r.x, r.y + radius);
  ctx.quadraticCurveTo(r.x, r.y, r.x + radius, r.y);
  ctx.closePath();
  if (fill) {
    ctx.fill();
  }
  if (stroke) {
    ctx.stroke();
  }
}

function update(delta, now) {
  if (game.state === "menu") {
    drawMenu();
    return;
  }
  if (game.state === "victory" || game.state === "game_over") {
    drawEndScreen(game.state === "victory");
    return;
  }

  updatePlayer(delta, now);
  updateCollectibles();
  updateEnemies(now);
  handleKnifeHits();
  updateSpecials();
  updateBossSpawn();
  updateGoalState();
  checkGoal();

  if (game.player.health <= 0) {
    game.state = "game_over";
  }

  drawGame(now);
}

function frame(now) {
  const delta = Math.min(0.033, (now - lastFrame) / 1000 || 0);
  lastFrame = now;
  update(delta, now);
  requestAnimationFrame(frame);
}

window.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("keydown", (event) => {
  if (["Space", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.code)) {
    event.preventDefault();
  }
  keys.add(event.code);

  if (event.code === "Enter") {
    if (game.state === "menu" || game.state === "victory" || game.state === "game_over") {
      game = resetGame();
      game.state = "playing";
    }
  }

  if (game.state === "playing" && ["Space", "ArrowUp", "KeyW"].includes(event.code)) {
    queueJump(game.player, performance.now());
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("mousedown", (event) => {
  if (game.state !== "playing") {
    return;
  }
  if (event.button === 0) {
    const now = performance.now();
    if (now - game.player.lastAttack >= game.player.attackDelay) {
      game.player.lastAttack = now;
      game.player.attackUntil = now + 150;
      game.stage.message = "Knife ready. Get close.";
    }
  } else if (event.button === 2) {
    const special = castSpecial(game.player, performance.now());
    if (special) {
      game.specials.push(special);
      game.stage.message = "Special fired.";
    }
  }
});

async function start() {
  game = resetGame();
  try {
    await loadImages();
    requestAnimationFrame((now) => {
      lastFrame = now;
      frame(now);
    });
  } catch (error) {
    ctx.fillStyle = "#120f1e";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawText("Failed to load assets", WIDTH / 2, HEIGHT / 2, 32, colors.red, "center");
    console.error(error);
  }
}

start();
