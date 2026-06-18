(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const stateBadge = document.getElementById("stateBadge");
  const W = canvas.width;
  const H = canvas.height;
  const WORLD = 3200;
  const GROUND_H = 64;

  const keys = new Set();
  const input = {
    left: false,
    right: false,
    jump: false,
    shoot: false,
    special: false,
  };

  const assets = {};
  const assetList = {
    capa: "../artes/capa.png",
    fundo: "../artes/fundo.png",
    jogador: "../artes/jogador.png",
    inimigo: "../artes/inimigo.png",
    boss: "../artes/boss.png",
    arma: "../artes/arma.png",
    vida: "../artes/vida.png",
    coletavel: "../artes/coletavel.png",
    especial: "../artes/especial.png",
    objetivo: "../artes/objetivo.png",
    relvatopo: "../artes/relvatopo.png",
    relvameio: "../artes/relvameio.png",
  };

  const state = {
    mode: "menu",
    bossActive: false,
    won: false,
    cameraX: 0,
    time: 0,
  };

  let player;
  let world;
  let bullets = [];
  let bossShots = [];
  let lastShot = 0;

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function rect(x, y, w, h) {
    return { x, y, w, h };
  }

  function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function setBadge(text) {
    stateBadge.textContent = text;
  }

  class Platform {
    constructor(x, y, w, h, type = "block") {
      this.r = rect(x, y, w, h);
      this.type = type;
    }

    draw(ctx, camX) {
      const x = this.r.x - camX;
      const y = this.r.y;
      if (this.type === "ground" && assets.relvatopo && assets.relvameio) {
        const top = assets.relvatopo;
        const mid = assets.relvameio;
        for (let dx = 0; dx < this.r.w; dx += top.width) {
          ctx.drawImage(top, x + dx, y);
        }
        for (let dy = top.height; dy < this.r.h; dy += mid.height) {
          for (let dx = 0; dx < this.r.w; dx += mid.width) {
            ctx.drawImage(mid, x + dx, y + dy);
          }
        }
        return;
      }
      ctx.fillStyle = "#785036";
      ctx.fillRect(x, y, this.r.w, this.r.h);
      ctx.fillStyle = "#af7f4a";
      ctx.fillRect(x, y, this.r.w, 10);
    }
  }

  class Pickup {
    constructor(x, y, type) {
      this.r = rect(x, y, 30, 30);
      this.type = type;
      this.spin = Math.random() * Math.PI * 2;
    }

    update() {
      this.spin += 0.05;
    }

    draw(ctx, camX) {
      const img = assets[this.type];
      const bob = Math.sin(this.spin) * 3;
      if (img) ctx.drawImage(img, this.r.x - camX, this.r.y + bob, 30, 30);
      else {
        ctx.fillStyle = this.type === "vida" ? "#ff7070" : this.type === "especial" ? "#6be6ff" : "#f2c96b";
        ctx.beginPath();
        ctx.arc(this.r.x - camX + 15, this.r.y + 15 + bob, 12, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  class Enemy {
    constructor(x, y, platform = null) {
      this.r = rect(x, y, 40, 40);
      this.vel = Math.random() < 0.5 ? -2 : 2;
      this.platform = platform;
      if (platform) {
        this.r.y = platform.r.y - 40;
        this.minX = platform.r.x + 8;
        this.maxX = Math.max(this.minX, platform.r.x + platform.r.w - 48);
      } else {
        this.minX = x - 120;
        this.maxX = x + 120;
      }
    }

    update() {
      this.r.x += this.vel;
      if (this.r.x <= this.minX || this.r.x >= this.maxX) {
        this.vel *= -1;
        this.r.x = clamp(this.r.x, this.minX, this.maxX);
      }
      if (this.platform) this.r.y = this.platform.r.y - 40;
    }

    draw(ctx, camX) {
      const img = assets.inimigo;
      if (img) ctx.drawImage(img, this.r.x - camX - 2, this.r.y - 2, 48, 48);
      else {
        ctx.fillStyle = "#9be27b";
        ctx.beginPath();
        ctx.arc(this.r.x - camX + 20, this.r.y + 20, 18, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  class Bullet {
    constructor(player, type = "normal") {
      this.type = type;
      this.dir = player.dir;
      this.active = true;
      this.frames = type === "normal" ? 6 : 90;
      this.r = type === "normal" ? rect(0, 0, 34, 24) : rect(0, 0, 18, 18);
      this.x = player.r.x;
      this.y = player.r.y + (type === "especial" ? 18 : 0);
      this.vx = type === "especial" ? 11 * this.dir : 0;
      this.sync(player);
      if (type === "especial") {
        this.r.y = player.r.y + 18;
      }
    }

    sync(player) {
      if (this.type !== "normal") return;
      if (this.dir === 1) this.r = rect(player.r.x + player.r.w - 4, player.r.y + 8, 34, 24);
      else this.r = rect(player.r.x - 34 + 4, player.r.y + 8, 34, 24);
    }

    update(player) {
      if (this.type === "especial") {
        this.x += this.vx;
        this.r.x = this.x;
      } else {
        this.sync(player);
      }
      this.frames -= 1;
      if (this.type === "especial" && (this.r.x + this.r.w < 0 || this.r.x > WORLD)) this.active = false;
      if (this.frames <= 0) this.active = false;
    }

    draw(ctx, camX) {
      const x = this.r.x - camX;
      const y = this.r.y;
      if (this.type === "normal") {
        ctx.fillStyle = "rgba(255, 220, 120, 0.28)";
        ctx.beginPath();
        ctx.ellipse(x + 18, y + 12, 22, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        const img = assets.arma;
        if (img) {
          ctx.save();
          ctx.translate(x + 10, y + 12);
          ctx.rotate(this.dir === 1 ? -0.38 : 0.38);
          if (this.dir === -1) {
            ctx.scale(-1, 1);
            ctx.drawImage(img, -14, -14, 28, 28);
          } else {
            ctx.drawImage(img, -14, -14, 28, 28);
          }
          ctx.restore();
        }
      } else {
        ctx.fillStyle = "rgba(80, 240, 255, 0.26)";
        ctx.beginPath();
        ctx.ellipse(x + 9, y + 9, 16, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        const img = assets.especial;
        if (img) ctx.drawImage(img, x - 3, y - 3, 24, 24);
      }
    }
  }

  class BossShot {
    constructor(x, y, target) {
      this.x = x;
      this.y = y;
      this.r = rect(x, y, 18, 18);
      const dx = target.r.x + target.r.w / 2 - x;
      const dy = target.r.y + target.r.h / 2 - y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const speed = 4.5;
      this.vx = (dx / dist) * speed;
      this.vy = (dy / dist) * speed;
      this.active = true;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.r.x = this.x;
      this.r.y = this.y;
      if (this.r.x + this.r.w < 0 || this.r.x > WORLD || this.r.y + this.r.h < 0 || this.r.y > H) {
        this.active = false;
      }
    }

    draw(ctx, camX) {
      const x = this.r.x - camX;
      const y = this.r.y;
      ctx.fillStyle = "rgba(190, 120, 40, 0.55)";
      ctx.beginPath();
      ctx.ellipse(x + 9, y + 9, 14, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      const img = assets.coletavel;
      if (img) ctx.drawImage(img, x, y, 18, 18);
    }
  }

  class Boss {
    constructor(x) {
      this.r = rect(x, H - GROUND_H - 160, 160, 160);
      this.hpMax = 36;
      this.hp = this.hpMax;
      this.dir = -1;
      this.speed = 1.3;
      this.active = false;
      this.cooldown = 0;
    }

    update() {
      if (!this.active || this.hp <= 0) return;
      this.r.x += this.speed * this.dir;
      if (this.r.x <= 0 || this.r.x + this.r.w >= WORLD) this.dir *= -1;
      this.r.y = H - GROUND_H - 160;
      if (this.cooldown > 0) this.cooldown -= 1;
      else {
        bossShots.push(new BossShot(this.r.x + this.r.w / 2, this.r.y + this.r.h / 2, player));
        this.cooldown = 120;
      }
    }

    draw(ctx, camX) {
      if (this.hp <= 0) return;
      const img = assets.boss;
      if (img) ctx.drawImage(img, this.r.x - camX, this.r.y, 160, 160);
      else {
        ctx.fillStyle = "#b56a3d";
        ctx.fillRect(this.r.x - camX, this.r.y, 160, 160);
      }
      const pct = Math.max(0, this.hp) / this.hpMax;
      ctx.fillStyle = "#d64646";
      ctx.fillRect(this.r.x - camX, this.r.y - 18, 160, 10);
      ctx.fillStyle = "#77e3a2";
      ctx.fillRect(this.r.x - camX, this.r.y - 18, 160 * pct, 10);
    }
  }

  class Player {
    constructor(x, y) {
      this.r = rect(x, y, 40, 44);
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.dir = 1;
      this.lives = 3;
      this.energy = 0;
      this.score = 0;
      this.invincible = 0;
      this.fireCooldown = 0;
      this.pendingJump = false;
    }

    reset() {
      this.r.x = 80;
      this.r.y = 200;
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.dir = 1;
      this.lives = 3;
      this.energy = 0;
      this.score = 0;
      this.invincible = 0;
      this.fireCooldown = 0;
      this.pendingJump = false;
    }

    takeDamage() {
      if (this.invincible > 0) return;
      this.lives -= 1;
      this.r.x = 80;
      this.r.y = 180;
      this.vx = 0;
      this.vy = 0;
      this.invincible = 120;
    }

    shoot() {
      if (this.fireCooldown > 0) return null;
      this.fireCooldown = 14;
      return new Bullet(this, "normal");
    }

    special() {
      const cost = state.bossActive ? 0 : 5;
      if (this.fireCooldown > 0) return null;
      if (!state.bossActive && this.energy < cost) return null;
      if (!state.bossActive) this.energy -= cost;
      this.fireCooldown = state.bossActive ? 10 : 28;
      return new Bullet(this, "especial");
    }

    update(platforms) {
      this.vx = 0;
      if (input.left) {
        this.vx = -5;
        this.dir = -1;
      }
      if (input.right) {
        this.vx = 5;
        this.dir = 1;
      }
      if ((input.jump || this.pendingJump) && this.onGround) {
        this.vy = -12;
        this.onGround = false;
        this.pendingJump = false;
        input.jump = false;
      }

      this.vy = Math.min(12, this.vy + 0.55);
      this.r.x += this.vx;
      resolveHorizontal(this.r, this.vx, platforms);
      this.r.y += this.vy;
      this.onGround = false;
      if (this.vy > 0) {
        if (resolveVertical(this.r, this.vy, platforms, "down")) {
          this.vy = 0;
          this.onGround = true;
        }
      } else if (this.vy < 0) {
        if (resolveVertical(this.r, this.vy, platforms, "up")) this.vy = 0;
      }

      if (this.r.y > H + 100) this.takeDamage();
      if (this.fireCooldown > 0) this.fireCooldown -= 1;
      if (this.invincible > 0) this.invincible -= 1;
    }

    draw(ctx, camX) {
      if (this.invincible > 0 && Math.floor(this.invincible / 8) % 2 === 0) return;
      const x = this.r.x - camX;
      const y = this.r.y;
      const bob = this.vx !== 0 && Math.floor(state.time / 100) % 2 === 0 ? -2 : 0;
      if (assets.jogador) ctx.drawImage(assets.jogador, x - 2, y - 2 + bob, 40, 44);
      else {
        ctx.fillStyle = "#ffd86b";
        ctx.fillRect(x, y, 40, 44);
      }
      const img = assets.arma;
      if (img) {
        ctx.save();
        const armaX = this.dir === 1 ? 36 : -10;
        const armaY = 12 + bob;
        ctx.translate(x + armaX, y + armaY);
        if (this.dir === -1) ctx.scale(-1, 1);
        ctx.rotate(this.dir === 1 ? -0.18 : 0.18);
        ctx.drawImage(img, -14, -14, 28, 28);
        ctx.restore();
      }
    }
  }

  function resolveHorizontal(r, vx, platforms) {
    for (const p of platforms) {
      if (!intersects(r, p.r)) continue;
      if (vx > 0) r.x = p.r.x - r.w;
      else if (vx < 0) r.x = p.r.x + p.r.w;
    }
  }

  function resolveVertical(r, vy, platforms, dir) {
    let hit = false;
    for (const p of platforms) {
      if (!intersects(r, p.r)) continue;
      if (dir === "down" && vy > 0) {
        r.y = p.r.y - r.h;
        hit = true;
      } else if (dir === "up" && vy < 0) {
        r.y = p.r.y + p.r.h;
        hit = true;
      }
    }
    return hit;
  }

  function buildWorld() {
    world = {
      platforms: [],
      enemies: [],
      pickups: [],
      boss: new Boss(2800),
      portal: rect(3000, 170, 42, 72),
      width: WORLD,
    };

    for (let x = 0; x < WORLD; x += 48) {
      world.platforms.push(new Platform(x, H - GROUND_H, 48, GROUND_H, "ground"));
    }

    const blocks = [
      [240, 380, 160, 48],
      [460, 320, 180, 48],
      [760, 270, 180, 48],
      [1080, 360, 210, 48],
      [1360, 300, 160, 48],
      [1620, 250, 190, 48],
      [1900, 340, 200, 48],
      [2200, 280, 170, 48],
      [2500, 340, 180, 48],
      [2800, 220, 240, 48],
    ];
    for (const b of blocks) world.platforms.push(new Platform(...b, "block"));

    world.pickups.push(
      new Pickup(320, 330, "coletavel"),
      new Pickup(540, 270, "coletavel"),
      new Pickup(870, 220, "coletavel"),
      new Pickup(1440, 250, "especial"),
      new Pickup(1720, 200, "coletavel"),
      new Pickup(1990, 290, "vida"),
      new Pickup(2320, 230, "coletavel"),
      new Pickup(2600, 290, "especial")
    );

    const enemyGround = [420, 620, 860, 1120, 1380, 1660, 1940, 2240, 2520, 2860];
    for (const x of enemyGround) world.enemies.push(new Enemy(x, H - GROUND_H - 40));

    const platformBlocks = world.platforms.filter((p) => p.type === "block");
    for (let i = 0; i < 10; i += 1) {
      const platform = platformBlocks[i % platformBlocks.length];
      const x = platform.r.x + 8 + Math.floor(Math.random() * Math.max(1, platform.r.w - 56));
      world.enemies.push(new Enemy(x, platform.r.y - 40, platform));
    }
  }

  function resetGame() {
    player.reset();
    buildWorld();
    bullets = [];
    bossShots = [];
    state.mode = "playing";
    state.bossActive = false;
    state.won = false;
    setBadge("A jogar");
  }

  function startGame() {
    if (state.mode === "menu") {
      state.mode = "playing";
      setBadge("A jogar");
    }
  }

  function showEndState(win) {
    state.mode = win ? "victory" : "defeat";
    state.won = win;
    setBadge(win ? "Vitoria" : "Game Over");
  }

  function collectPickups() {
    for (let i = world.pickups.length - 1; i >= 0; i -= 1) {
      const p = world.pickups[i];
      if (!intersects(player.r, p.r)) continue;
      world.pickups.splice(i, 1);
      if (p.type === "coletavel") {
        player.score += 50;
        player.energy = Math.min(99, player.energy + 1);
      } else if (p.type === "especial") {
        player.score += 100;
        player.energy = Math.min(99, player.energy + 3);
      } else if (p.type === "vida") {
        player.score += 75;
        player.lives = Math.min(5, player.lives + 1);
      }
    }
  }

  function enemyCollisions() {
    for (let i = world.enemies.length - 1; i >= 0; i -= 1) {
      if (intersects(player.r, world.enemies[i].r)) {
        player.takeDamage();
        world.enemies.splice(i, 1);
      }
    }
  }

  function updateBullets() {
    let bossDead = false;
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const b = bullets[i];
      b.update(player);
      if (!b.active) {
        bullets.splice(i, 1);
        continue;
      }
      let removed = false;
      for (let j = world.enemies.length - 1; j >= 0; j -= 1) {
        if (!intersects(b.r, world.enemies[j].r)) continue;
        world.enemies.splice(j, 1);
        bullets.splice(i, 1);
        player.score += b.type === "especial" ? 150 : 100;
        removed = true;
        break;
      }
      if (removed) continue;
      if (world.boss.active && world.boss.hp > 0 && intersects(b.r, world.boss.r)) {
        world.boss.hp -= b.type === "especial" ? 3 : 2;
        player.score += b.type === "especial" ? 100 : 25;
        bullets.splice(i, 1);
        if (world.boss.hp <= 0) bossDead = true;
      }
    }
    return bossDead;
  }

  function updateBossShots() {
    for (let i = bossShots.length - 1; i >= 0; i -= 1) {
      const s = bossShots[i];
      s.update();
      if (!s.active) {
        bossShots.splice(i, 1);
        continue;
      }
      if (intersects(player.r, s.r)) {
        player.takeDamage();
        bossShots.splice(i, 1);
      }
    }
  }

  function drawBackground(camX) {
    const bg = assets.fundo;
    if (bg) ctx.drawImage(bg, 0, 0, W, H);
    else {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#192f57");
      grad.addColorStop(1, "#07111d");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    for (let i = 0; i < WORLD; i += 220) {
      const x = i - camX * 0.35;
      const h = 90 + (i % 180);
      ctx.fillStyle = "#47495d";
      ctx.fillRect(x, 250, 130, h);
      ctx.fillStyle = "#ffd86b";
      for (let y = 0; y < h; y += 28) {
        for (let k = 0; k < 110; k += 22) {
          ctx.fillRect(x + 14 + k, 260 + y, 8, 10);
        }
      }
    }
  }

  function drawHud() {
    ctx.fillStyle = "rgba(8, 18, 38, 0.62)";
    ctx.fillRect(0, 0, W, 64);

    drawIconText(14, 14, assets.vida, `x ${player.lives}`, "#f4f6fb");
    drawIconText(118, 14, assets.arma, `x ${player.score}`, "#ffd86b");

    ctx.fillStyle = "#282828";
    ctx.fillRect(330, 18, 250, 20);
    const pct = clamp(world.boss.hp / world.boss.hpMax, 0, 1);
    ctx.fillStyle = "#77e3a2";
    ctx.fillRect(330, 18, 250 * pct, 20);
    ctx.fillStyle = "#f4f6fb";
    ctx.font = "bold 22px Trebuchet MS, sans-serif";
    ctx.fillText("Batata Gigante", 330, 56);

    drawIconText(630, 16, assets.coletavel, `${world.pickups.filter((p) => p.type === "coletavel").length} batatas`, "#f4f6fb");
    drawIconText(790, 16, assets.especial, `energia ${player.energy}`, "#f4f6fb");
  }

  function drawIconText(x, y, img, text, color) {
    if (img) ctx.drawImage(img, x, y, 28, 28);
    ctx.fillStyle = color;
    ctx.font = "bold 22px Trebuchet MS, sans-serif";
    ctx.fillText(text, x + 34, y + 22);
  }

  function drawCentered(text, y, size, color, bold = false) {
    ctx.fillStyle = color;
    ctx.font = `${bold ? "bold " : ""}${size}px Trebuchet MS, sans-serif`;
    const width = ctx.measureText(text).width;
    ctx.fillText(text, W / 2 - width / 2, y);
  }

  function drawMenu() {
    drawBackground(0);
    ctx.fillStyle = "rgba(6, 12, 26, 0.5)";
    ctx.fillRect(0, 0, W, H);
    const cover = assets.capa;
    if (cover) ctx.drawImage(cover, 0, 0, W, H);
    drawCentered("JOGO DAS BATATAS", 82, 52, "#ffd86b", true);
    drawCentered("Mata as batatas inimigas, recolhe os itens e derrota a Batata Gigante", 122, 22, "#f4f6fb");

    ctx.fillStyle = "rgba(10, 16, 30, 0.8)";
    ctx.fillRect(W / 2 - 320, 165, 640, 170);
    ctx.strokeStyle = "#ffd86b";
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 320, 165, 640, 170);
    ctx.fillStyle = "#ffd86b";
    ctx.font = "bold 28px Trebuchet MS, sans-serif";
    ctx.fillText("Controlos", W / 2 - 296, 196);
    ctx.fillStyle = "#f4f6fb";
    ctx.font = "24px Trebuchet MS, sans-serif";
    const lines = [
      "Mover: A / D ou setas",
      "Saltar: Espaco",
      "Atacar: F ou clique",
      "Especial: E",
      "Reiniciar: R",
    ];
    lines.forEach((line, i) => ctx.fillText(line, W / 2 - 296, 236 + i * 24));
    drawCentered("Carrega Enter para jogar", 360, 30, "#77e3a2", true);
  }

  function drawEnd(win) {
    drawWorld();
    ctx.fillStyle = win ? "rgba(0, 0, 0, 0.12)" : "rgba(0, 0, 0, 0.14)";
    ctx.fillRect(0, 0, W, H);
    drawCentered(win ? "VITORIA" : "GAME OVER", 155, 64, win ? "#77e3a2" : "#d64646", true);
    drawCentered(win ? "O mundo das batatas foi salvo" : "As batatas venceram desta vez", 220, 28, "#f4f6fb");
    drawCentered("Premir R para recomeçar", 270, 24, "#ffd86b");
  }

  function drawPortal() {
    if (state.bossActive) return;
    const x = world.portal.x - state.cameraX - 3;
    const y = world.portal.y + 10;
    const img = assets.objetivo;
    if (img) ctx.drawImage(img, x, y, 48, 48);
    ctx.strokeStyle = "#78c8ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(world.portal.x - state.cameraX, world.portal.y, world.portal.w, world.portal.h);
  }

  function drawWorld() {
    drawBackground(state.cameraX);
    for (const p of world.platforms) p.draw(ctx, state.cameraX);
    for (const p of world.pickups) p.draw(ctx, state.cameraX);
    for (const e of world.enemies) e.draw(ctx, state.cameraX);
    if (world.boss.active && world.boss.hp > 0) world.boss.draw(ctx, state.cameraX);
    drawPortal();
    for (const b of bullets) b.draw(ctx, state.cameraX);
    for (const s of bossShots) s.draw(ctx, state.cameraX);
    player.draw(ctx, state.cameraX);
    drawHud();
  }

  function update() {
    state.time += 16;
    if (state.mode !== "playing") return;

    player.update(world.platforms);
    for (const p of world.pickups) p.update();
    for (const e of world.enemies) e.update();

    collectPickups();
    enemyCollisions();

    if (!state.bossActive && intersects(player.r, world.portal)) {
      if (world.pickups.filter((p) => p.type === "coletavel").length === 0) {
        state.bossActive = true;
        world.boss.active = true;
      }
    }

    if (state.bossActive) {
      world.boss.active = true;
      world.boss.update();
      if (intersects(player.r, world.boss.r)) player.takeDamage();
    }

    updateBossShots();

    if (updateBullets()) {
      showEndState(true);
      return;
    }

    if (player.lives <= 0) {
      showEndState(false);
      return;
    }

    if (state.bossActive && world.boss.hp <= 0) {
      showEndState(true);
      return;
    }

    state.cameraX = clamp(player.r.x + player.r.w / 2 - W / 2, 0, WORLD - W);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (state.mode === "menu") drawMenu();
    else if (state.mode === "playing") {
      drawWorld();
      if (!state.bossActive) {
        drawCentered("Recolhe todas as batatas antes de entrar no portal!", 80, 22, "#ffd86b", true);
      }
    } else {
      drawEnd(state.won);
    }
  }

  function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
  }

  function handleAction(action, isDown) {
    if (action === "left") input.left = isDown;
    if (action === "right") input.right = isDown;
    if (action === "jump" && isDown) input.jump = true;
    if (action === "jump" && !isDown) input.jump = false;
    if (action === "shoot" && isDown) shootNormal();
    if (action === "special" && isDown) shootSpecial();
    if (action === "restart" && isDown) resetGame();
  }

  function shootNormal() {
    if (state.mode !== "playing") return;
    if (Date.now() - lastShot < 120) return;
    const b = player.shoot();
    if (b) {
      bullets.push(b);
      lastShot = Date.now();
    }
  }

  function shootSpecial() {
    if (state.mode !== "playing") return;
    const b = player.special();
    if (b) bullets.push(b);
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === "Enter") startGame();
    if (e.code === "KeyR") {
      resetGame();
      return;
    }
    if (e.code === "KeyF" || e.code === "Space" || e.code === "KeyE") e.preventDefault();
    if (e.code === "KeyA" || e.code === "ArrowLeft") input.left = true;
    if (e.code === "KeyD" || e.code === "ArrowRight") input.right = true;
    if (e.code === "Space" || e.code === "KeyW" || e.code === "ArrowUp") input.jump = true;
    if (e.code === "KeyF") shootNormal();
    if (e.code === "KeyE") shootSpecial();
  });

  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
    if (e.code === "KeyA" || e.code === "ArrowLeft") input.left = false;
    if (e.code === "KeyD" || e.code === "ArrowRight") input.right = false;
    if (e.code === "Space" || e.code === "KeyW" || e.code === "ArrowUp") input.jump = false;
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) shootNormal();
  });

  canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });

  document.querySelectorAll("[data-action]").forEach((button) => {
    const action = button.getAttribute("data-action");
    const down = (ev) => {
      ev.preventDefault();
      handleAction(action, true);
    };
    const up = (ev) => {
      ev.preventDefault();
      if (action === "left" || action === "right" || action === "jump") handleAction(action, false);
    };
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointerleave", up);
    button.addEventListener("pointercancel", up);
  });

  async function init() {
    const loaded = await Promise.all(Object.entries(assetList).map(async ([name, src]) => [name, await loadImage(src)]));
    for (const [name, img] of loaded) assets[name] = img;
    player = new Player(80, 200);
    buildWorld();
    setBadge("Menu");
    requestAnimationFrame(gameLoop);
  }

  init();
})();
