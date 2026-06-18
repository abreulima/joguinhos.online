const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const WIDTH = 960;
const HEIGHT = 640;
const TILE = 64;
const FOV = Math.PI * 68 / 180;
const RAYS = 420;
const MAX_DEPTH = 900;

const LEVELS = [
  [
    "###############",
    "#P............#",
    "#..###...###..#",
    "#..#.....#K...#",
    "#..#..####....#",
    "#.............#",
    "#..######..#..#",
    "#.....S.....#D#",
    "###############",
  ],
  [
    "#################",
    "#P........K.....#",
    "#..###...#####..#",
    "#..#.....#......#",
    "#..#..####..##..#",
    "#.........#K....#",
    "#..#########....#",
    "#.....S........D#",
    "#################",
  ],
  [
    "###################",
    "#P........K.......#",
    "#..###...#####....#",
    "#..#.....#...#....#",
    "#..#..####...##...#",
    "#K........#.......#",
    "#..###########....#",
    "#.....S....K.....D#",
    "###################",
  ],
];

const keys = new Set();
const cover = new Image();
cover.src = "artes/capa.png";

let state = "menu";
let levelIndex = 0;
let grid = [];
let player;
let sorcerer;
let door;
let pickups = [];
let keysFound = 0;
let totalKeys = 1;
let message = "";
let messageTime = 0;
let guidance = false;
let caughtTimer = 0;
let transitionTimer = 0;
let transitionNext = null;
let boss = null;
let bossProjectiles = [];
let playerScreenX = WIDTH / 2;
let playerScreenY = HEIGHT - 112;
let lastTime = 0;
let objectiveVisible = false;
const objectiveButton = { x: 14, y: 12, w: 118, h: 34 };
const objectiveText = "Objetivo: apanha todas as chaves, encontra a porta e derrota o feiticeiro.";
let audioCtx = null;
let musicGain = null;
let playerStepTimer = 0;
let sorcererStepTimer = 0;

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function ensureAudio() {
  if (audioCtx) {
    if (audioCtx.state === "suspended") audioCtx.resume();
    return;
  }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  audioCtx = new AudioContext();
  musicGain = audioCtx.createGain();
  musicGain.gain.value = 0.035;
  musicGain.connect(audioCtx.destination);
  for (const freq of [146.83, 174.61, 220.0]) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0.34;
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start();
  }
  const pulse = audioCtx.createOscillator();
  const pulseGain = audioCtx.createGain();
  pulse.type = "sine";
  pulse.frequency.value = 0.18;
  pulseGain.gain.value = 0.18;
  pulse.connect(pulseGain);
  pulseGain.connect(musicGain);
  pulse.start();
}

function playStep(kind, volume = 0.2) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const noiseBuffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.12), audioCtx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const noise = audioCtx.createBufferSource();
  const noiseGain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(kind === "sorcerer" ? 72 : 120, now);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + (kind === "sorcerer" ? 0.18 : 0.12));
  noise.buffer = noiseBuffer;
  noiseGain.gain.setValueAtTime(volume * 0.22, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  osc.connect(gain);
  noise.connect(noiseGain);
  gain.connect(audioCtx.destination);
  noiseGain.connect(audioCtx.destination);
  osc.start(now);
  noise.start(now);
  osc.stop(now + 0.2);
  noise.stop(now + 0.13);
}

function playToneEvent(kind) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.connect(audioCtx.destination);

  if (kind === "key") {
    out.gain.setValueAtTime(0.32, now);
    out.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    for (const [freq, delay] of [[780, 0], [1040, 0.06], [1560, 0.12]]) {
      const osc = audioCtx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + delay);
      osc.connect(out);
      osc.start(now + delay);
      osc.stop(now + delay + 0.22);
    }
  } else if (kind === "door") {
    out.gain.setValueAtTime(0.4, now);
    out.gain.exponentialRampToValueAtTime(0.001, now + 0.62);
    for (const freq of [92, 184, 330]) {
      const osc = audioCtx.createOscillator();
      osc.type = freq === 92 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.linearRampToValueAtTime(freq * 1.22, now + 0.45);
      osc.connect(out);
      osc.start(now);
      osc.stop(now + 0.62);
    }
  } else if (kind === "caught") {
    out.gain.setValueAtTime(0.55, now);
    out.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    const osc = audioCtx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.75);
    osc.connect(out);
    osc.start(now);
    osc.stop(now + 0.85);
    const noiseBuffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.7), audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = audioCtx.createBufferSource();
    const noiseGain = audioCtx.createGain();
    noise.buffer = noiseBuffer;
    noiseGain.gain.setValueAtTime(0.12, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    noise.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    noise.start(now);
    noise.stop(now + 0.7);
  }
}

function normalizeAngle(angle) {
  return (angle + Math.PI * 3) % (Math.PI * 2) - Math.PI;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function blocked(x, y) {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (ty < 0 || ty >= grid.length || tx < 0 || tx >= grid[0].length) return true;
  return grid[ty][tx] === "#";
}

function hasLineOfSight(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(2, Math.floor(dist / 10));
  for (let i = 1; i < steps; i += 1) {
    if (blocked(x1 + dx * i / steps, y1 + dy * i / steps)) return false;
  }
  return true;
}

function openDirections(x, y) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !blocked(x + dx * TILE * 0.7, y + dy * TILE * 0.7));
}

function loadLevel(index) {
  levelIndex = index;
  grid = LEVELS[index].map((row) => row.split(""));
  pickups = [];
  door = null;
  let start = { x: TILE * 1.5, y: TILE * 1.5 };
  let enemy = { x: TILE * 7.5, y: TILE * 7.5 };

  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[y].length; x += 1) {
      const pos = { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
      if (grid[y][x] === "P") {
        start = pos;
        grid[y][x] = ".";
      } else if (grid[y][x] === "S") {
        enemy = pos;
        grid[y][x] = ".";
      } else if (grid[y][x] === "K") {
        pickups.push({ ...pos, active: true });
        grid[y][x] = ".";
      } else if (grid[y][x] === "D") {
        door = { x: x * TILE + 8, y: y * TILE + 8, w: TILE - 16, h: TILE - 16 };
      }
    }
  }

  player = { ...start, angle: 0, hp: 100 };
  sorcerer = { ...enemy, speed: 1.95, dir: [1, 0], timer: 0 };
  totalKeys = index + 1;
  keysFound = 0;
  message = `Nivel ${index + 1}: encontra ${totalKeys} chave(s).`;
  messageTime = 150;
  guidance = false;
}

function resetToStart(text) {
  playToneEvent("caught");
  state = "caught";
  caughtTimer = 240;
  message = text;
}

function startTransition(next) {
  playToneEvent("door");
  state = "transition";
  transitionTimer = 240;
  transitionNext = next;
}

function startBoss() {
  state = "boss";
  player.hp = 100;
  playerScreenX = WIDTH / 2;
  bossProjectiles = [];
  boss = { x: WIDTH / 2, y: 155, hp: 360, maxHp: 360, phase: 0, cooldown: 60 };
  message = "Luta final: derrota o feiticeiro.";
  messageTime = 150;
}

function tryMovePlayer(dx, dy) {
  if (!blocked(player.x + dx, player.y)) player.x += dx;
  if (!blocked(player.x, player.y + dy)) player.y += dy;
}

function updateSorcerer() {
  const dist = Math.hypot(player.x - sorcerer.x, player.y - sorcerer.y);
  let angle;
  if (dist < 520 && hasLineOfSight(sorcerer.x, sorcerer.y, player.x, player.y)) {
    angle = Math.atan2(player.y - sorcerer.y, player.x - sorcerer.x);
    sorcerer.timer = 0;
  } else {
    if (sorcerer.timer <= 0 || blocked(sorcerer.x + sorcerer.dir[0] * TILE * 0.7, sorcerer.y + sorcerer.dir[1] * TILE * 0.7)) {
      const options = openDirections(sorcerer.x, sorcerer.y);
      sorcerer.dir = options[Math.floor(Math.random() * options.length)] || [1, 0];
      sorcerer.timer = 80 + Math.random() * 130;
    }
    sorcerer.timer -= 1;
    angle = Math.atan2(sorcerer.dir[1], sorcerer.dir[0]);
  }

  const speed = sorcerer.speed + levelIndex * 0.32;
  const dx = Math.cos(angle) * speed;
  const dy = Math.sin(angle) * speed;
  if (!blocked(sorcerer.x + dx, sorcerer.y)) sorcerer.x += dx;
  if (!blocked(sorcerer.x, sorcerer.y + dy)) sorcerer.y += dy;
  if (dist < 28) resetToStart("Foste apanhado");
}

function updatePlaying() {
  const rot = 0.055;
  if (keys.has("ArrowLeft") || keys.has("a")) player.angle -= rot;
  if (keys.has("ArrowRight") || keys.has("d")) player.angle += rot;

  const speed = 3.65;
  let dx = 0;
  let dy = 0;
  if (keys.has("w") || keys.has("ArrowUp")) {
    dx += Math.cos(player.angle) * speed;
    dy += Math.sin(player.angle) * speed;
  }
  if (keys.has("s") || keys.has("ArrowDown")) {
    dx -= Math.cos(player.angle) * speed;
    dy -= Math.sin(player.angle) * speed;
  }
  if (keys.has("q")) {
    dx += Math.cos(player.angle - Math.PI / 2) * speed;
    dy += Math.sin(player.angle - Math.PI / 2) * speed;
  }
  if (keys.has("e")) {
    dx += Math.cos(player.angle + Math.PI / 2) * speed;
    dy += Math.sin(player.angle + Math.PI / 2) * speed;
  }
  tryMovePlayer(dx, dy);
  updateSorcerer();
  const moving = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;
  if (playerStepTimer > 0) playerStepTimer -= 1;
  if (moving && playerStepTimer <= 0) {
    playStep("player", 0.18);
    playerStepTimer = 22;
  }
  const distToSorcerer = Math.hypot(player.x - sorcerer.x, player.y - sorcerer.y);
  if (sorcererStepTimer > 0) sorcererStepTimer -= 1;
  if (distToSorcerer < 360 && sorcererStepTimer <= 0) {
    playStep("sorcerer", clamp(0.42 - distToSorcerer / 980, 0.11, 0.34));
    sorcererStepTimer = Math.floor(clamp(distToSorcerer / 11, 16, 34));
  }

  for (const key of pickups) {
    if (key.active && Math.hypot(player.x - key.x, player.y - key.y) < 34) {
      key.active = false;
      keysFound += 1;
      playToneEvent("key");
      message = `Chave encontrada: ${keysFound}/${totalKeys}`;
      messageTime = 120;
      if (keysFound >= totalKeys) guidance = true;
    }
  }

  if (door && keysFound >= totalKeys && player.x > door.x && player.x < door.x + door.w && player.y > door.y && player.y < door.y + door.h) {
    startTransition(levelIndex < 2 ? levelIndex + 1 : "boss");
  }
  if (messageTime > 0) messageTime -= 1;
}

function castRays() {
  const colW = WIDTH / RAYS;
  const start = player.angle - FOV / 2;
  for (let ray = 0; ray < RAYS; ray += 1) {
    const angle = start + FOV * ray / RAYS;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    let hit = MAX_DEPTH;
    let sideShade = 1;
    for (let depth = 4; depth < MAX_DEPTH; depth += 3) {
      const x = player.x + cos * depth;
      const y = player.y + sin * depth;
      if (blocked(x, y)) {
        hit = depth * Math.cos(angle - player.angle);
        sideShade = (Math.floor(x / TILE) % 2 === Math.floor(y / TILE) % 2) ? 1 : 0.82;
        break;
      }
    }
    const wallH = Math.min(HEIGHT, TILE * 470 / Math.max(hit, 1));
    const falloff = clamp(1 - hit / 1120, 0.18, 1) * sideShade;
    const glow = Math.max(0, 1 - Math.abs(ray / RAYS - 0.5) * 1.7);
    const r = Math.floor((70 + glow * 70) * falloff);
    const g = Math.floor((82 + glow * 86) * falloff);
    const b = Math.floor((88 + glow * 92) * falloff);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(ray * colW, HEIGHT / 2 - wallH / 2, Math.ceil(colW) + 1, wallH);
    ctx.fillStyle = `rgba(0,0,0,${clamp(hit / 720, 0, 0.55)})`;
    ctx.fillRect(ray * colW, HEIGHT / 2 - wallH / 2, Math.ceil(colW) + 1, wallH);
    if (ray % 18 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(ray * colW, HEIGHT / 2 - wallH / 2, 1, wallH);
    }
  }
}

function drawWorldSprite(x, y, type, heightScale = 1) {
  const dx = x - player.x;
  const dy = y - player.y;
  const dist = Math.hypot(dx, dy);
  let angle = normalizeAngle(Math.atan2(dy, dx) - player.angle);
  if (Math.abs(angle) > FOV / 2 + 0.25 || dist < 10) return;
  const size = clamp(26000 / dist, 16, 190);
  const sx = WIDTH / 2 + Math.tan(angle) * WIDTH / 1.45;
  const baseY = HEIGHT / 2 + size * 0.45;
  const h = size * heightScale;

  ctx.save();
  ctx.translate(sx, baseY);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 5, size * 0.32, size * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  if (type === "key") {
    ctx.scale(size / 95, size / 95);
    ctx.fillStyle = "#d6a738";
    ctx.strokeStyle = "#6f5013";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(-22, -18, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-5, -24, 44, 12);
    ctx.fillRect(28, -33, 8, 18);
    ctx.fillRect(38, -33, 8, 24);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(-34, -31, 54, 4);
  } else if (type === "door") {
    ctx.scale(size / 80, h / 135);
    const open = keysFound >= totalKeys;
    ctx.fillStyle = "#15191d";
    roundRect(-34, -120, 68, 120, 8, true);
    ctx.fillStyle = open ? "#2c624c" : "#693033";
    roundRect(-27, -112, 54, 108, 6, true);
    ctx.strokeStyle = open ? "#62e6a4" : "#e64e52";
    ctx.lineWidth = 4;
    ctx.strokeRect(-18, -96, 36, 78);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(20, -58, 6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.scale(size / 90, h / 120);
    ctx.fillStyle = "#241632";
    ctx.beginPath();
    ctx.moveTo(0, -120);
    ctx.lineTo(-34, 0);
    ctx.lineTo(34, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#7c50a8";
    ctx.beginPath();
    ctx.ellipse(0, -58, 28, 54, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d8c1a8";
    ctx.beginPath();
    ctx.arc(0, -86, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8ff0ff";
    ctx.beginPath();
    ctx.arc(-8, -88, 4, 0, Math.PI * 2);
    ctx.arc(8, -88, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlaying() {
  const ceil = ctx.createLinearGradient(0, 0, 0, HEIGHT / 2);
  ceil.addColorStop(0, "#4a555c");
  ceil.addColorStop(1, "#11171a");
  ctx.fillStyle = ceil;
  ctx.fillRect(0, 0, WIDTH, HEIGHT / 2);

  const floor = ctx.createLinearGradient(0, HEIGHT / 2, 0, HEIGHT);
  floor.addColorStop(0, "#244f32");
  floor.addColorStop(1, "#07120b");
  ctx.fillStyle = floor;
  ctx.fillRect(0, HEIGHT / 2, WIDTH, HEIGHT / 2);

  ctx.strokeStyle = "rgba(15,28,18,0.7)";
  for (let i = 0; i < 16; i += 1) {
    const y = HEIGHT / 2 + Math.pow(i / 16, 1.9) * HEIGHT / 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }

  castRays();
  for (const key of pickups) {
    if (key.active && hasLineOfSight(player.x, player.y, key.x, key.y)) drawWorldSprite(key.x, key.y, "key", 0.65);
  }
  if (hasLineOfSight(player.x, player.y, sorcerer.x, sorcerer.y)) drawWorldSprite(sorcerer.x, sorcerer.y, "sorcerer", 1.45);
  if (door && hasLineOfSight(player.x, player.y, door.x + door.w / 2, door.y + door.h / 2)) {
    drawWorldSprite(door.x + door.w / 2, door.y + door.h / 2, "door", 1.5);
  }
  drawVignette();
  drawHud();
  drawGun();
}

function drawHud() {
  ctx.fillStyle = "rgba(8,10,13,0.84)";
  roundRect(objectiveButton.x, objectiveButton.y, objectiveButton.w, objectiveButton.h, 6, true);
  ctx.strokeStyle = "#78c2d2";
  ctx.strokeRect(objectiveButton.x, objectiveButton.y, objectiveButton.w, objectiveButton.h);
  ctx.fillStyle = "#eef2f5";
  ctx.font = "22px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Objetivo", objectiveButton.x + objectiveButton.w / 2, 36);
  ctx.textAlign = "start";

  ctx.fillStyle = "rgba(8,10,13,0.84)";
  roundRect(14, 54, 220, 34, 6, true);
  ctx.strokeStyle = "#46505a";
  ctx.strokeRect(14, 54, 220, 34);
  ctx.fillStyle = "#eef2f5";
  ctx.font = "26px Arial";
  ctx.fillText(`Nivel ${levelIndex + 1}  Chaves ${keysFound}/${totalKeys}`, 24, 79);

  if (objectiveVisible) {
    ctx.fillStyle = "rgba(8,10,13,0.92)";
    roundRect(14, 96, 555, 54, 6, true);
    ctx.strokeStyle = "#46505a";
    ctx.strokeRect(14, 96, 555, 54);
    ctx.fillStyle = "#eef2f5";
    ctx.font = "21px Arial";
    ctx.fillText(objectiveText, 26, 130);
  }

  if (guidance) centerText("Procure a porta e abra-a.", 30, "#eef2f5", 26);
  if (messageTime > 0) centerText(message, guidance ? 66 : 30, "#eef2f5", 26);
  const dist = Math.hypot(player.x - sorcerer.x, player.y - sorcerer.y);
  if (dist < 280) {
    const pulse = Math.floor(120 + 80 * Math.sin(performance.now() / 90));
    centerText("Feiticeiro a aproximar-se, corra!", 66, `rgb(255,${pulse},${pulse})`, 26);
  }
}

function drawMinimap() {
  const scale = 8;
  const ox = WIDTH - grid[0].length * scale - 20;
  const oy = 18;
  ctx.fillStyle = "rgba(7,8,12,0.9)";
  ctx.fillRect(ox - 6, oy - 6, grid[0].length * scale + 12, grid.length * scale + 12);
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[y].length; x += 1) {
      ctx.fillStyle = grid[y][x] === "#" ? "#a5aeb4" : "#1c2028";
      ctx.fillRect(ox + x * scale, oy + y * scale, scale - 1, scale - 1);
    }
  }
  if (door) {
    ctx.fillStyle = keysFound >= totalKeys ? "#60dc77" : "#d23034";
    ctx.fillRect(ox + door.x / TILE * scale + 3, oy + door.y / TILE * scale + 3, 6, 6);
    ctx.strokeStyle = "#eef2f5";
    ctx.strokeRect(ox + door.x / TILE * scale + 2, oy + door.y / TILE * scale + 2, 8, 8);
  }
  ctx.fillStyle = "#f5d256";
  ctx.beginPath();
  ctx.arc(ox + player.x / TILE * scale, oy + player.y / TILE * scale, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#9c54dc";
  ctx.beginPath();
  ctx.arc(ox + sorcerer.x / TILE * scale, oy + sorcerer.y / TILE * scale, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawGun() {
  ctx.save();
  ctx.translate(WIDTH / 2 + 42, HEIGHT - 78);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(0, 58, 120, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#252a30";
  roundRect(-100, -28, 190, 44, 15, true);
  ctx.fillStyle = "#87939a";
  roundRect(-82, -16, 135, 16, 8, true);
  ctx.fillStyle = "#191d22";
  roundRect(58, -17, 78, 16, 8, true);
  ctx.fillStyle = "#46a5b4";
  roundRect(-6, -11, 45, 9, 5, true);
  ctx.fillStyle = "#96eeff";
  ctx.beginPath();
  ctx.arc(140, -9, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#eef2f5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 8, HEIGHT / 2);
  ctx.lineTo(WIDTH / 2 + 8, HEIGHT / 2);
  ctx.moveTo(WIDTH / 2, HEIGHT / 2 - 8);
  ctx.lineTo(WIDTH / 2, HEIGHT / 2 + 8);
  ctx.stroke();
}

function updateBoss() {
  if (keys.has("a") || keys.has("ArrowLeft")) playerScreenX -= 5;
  if (keys.has("d") || keys.has("ArrowRight")) playerScreenX += 5;
  playerScreenX = clamp(playerScreenX, 50, WIDTH - 50);

  boss.phase += 0.062;
  boss.x = WIDTH / 2 + Math.sin(boss.phase) * 250;
  boss.cooldown -= 1;
  if (boss.cooldown <= 0) {
    boss.cooldown = 45;
    const angle = Math.atan2(playerScreenY - boss.y, playerScreenX - boss.x);
    bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(angle) * 5.4, vy: Math.sin(angle) * 5.4, type: "boss" });
  }

  for (const shot of [...bossProjectiles]) {
    shot.x += shot.vx;
    shot.y += shot.vy;
    if (shot.type === "player" && Math.hypot(shot.x - boss.x, shot.y - boss.y) < 55) {
      boss.hp -= 15;
      bossProjectiles.splice(bossProjectiles.indexOf(shot), 1);
      if (boss.hp <= 0) state = "win";
    } else if (shot.type === "boss" && Math.hypot(shot.x - playerScreenX, shot.y - playerScreenY) < 36) {
      player.hp -= 20;
      bossProjectiles.splice(bossProjectiles.indexOf(shot), 1);
      if (player.hp <= 0) resetToStart("Foste apanhado");
    } else if (shot.y < -40 || shot.y > HEIGHT + 40 || shot.x < -40 || shot.x > WIDTH + 40) {
      bossProjectiles.splice(bossProjectiles.indexOf(shot), 1);
    }
  }
  if (messageTime > 0) messageTime -= 1;
}

function drawBoss() {
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, "#12151a");
  bg.addColorStop(1, "#262a2e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#23272a";
  ctx.fillRect(0, HEIGHT - 142, WIDTH, 142);

  drawBossFigure(boss.x, boss.y + Math.sin(performance.now() / 180) * 8, 1.25);
  ctx.fillStyle = "#d23034";
  ctx.fillRect(250, 24, 460, 18);
  ctx.fillStyle = "#60dc77";
  ctx.fillRect(250, 24, 460 * Math.max(boss.hp, 0) / boss.maxHp, 18);
  ctx.strokeStyle = "#eef2f5";
  ctx.strokeRect(250, 24, 460, 18);

  ctx.fillStyle = "#1c2228";
  ctx.beginPath();
  ctx.moveTo(playerScreenX, playerScreenY - 34);
  ctx.lineTo(playerScreenX - 42, playerScreenY + 26);
  ctx.lineTo(playerScreenX, playerScreenY + 12);
  ctx.lineTo(playerScreenX + 42, playerScreenY + 26);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#76919c";
  ctx.stroke();

  for (const shot of bossProjectiles) {
    ctx.fillStyle = shot.type === "player" ? "#eef2f5" : "#5ce8ff";
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, shot.type === "player" ? 6 : 11, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#eef2f5";
  ctx.font = "28px Arial";
  ctx.fillText(`Vida ${player.hp}`, 24, 40);
  centerText("A/D para esquivar | ESPACO para disparar", HEIGHT - 20, "#eef2f5", 22);
  if (messageTime > 0) centerText(message, 60, "#f5d256", 28);
}

function drawBossFigure(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.beginPath();
  ctx.ellipse(0, 95, 66, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1c102a";
  ctx.beginPath();
  ctx.moveTo(0, -112);
  ctx.lineTo(-60, 92);
  ctx.lineTo(60, 92);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#5e2f86";
  ctx.beginPath();
  ctx.moveTo(0, -98);
  ctx.lineTo(-42, 80);
  ctx.lineTo(0, 98);
  ctx.lineTo(42, 80);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#160b22";
  ctx.beginPath();
  ctx.moveTo(0, -118);
  ctx.lineTo(-43, -48);
  ctx.lineTo(43, -48);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#d2beac";
  ctx.beginPath();
  ctx.ellipse(0, -50, 30, 36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#140a1e";
  roundRect(-27, -72, 54, 28, 12, true);
  ctx.fillStyle = "#8ff0ff";
  ctx.shadowColor = "#5ce8ff";
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(-12, -55, 5, 0, Math.PI * 2);
  ctx.arc(12, -55, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#220f18";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -41, 13, 0.15, Math.PI - 0.15);
  ctx.stroke();
  ctx.strokeStyle = "#70429a";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(-40, -20);
  ctx.lineTo(-76, 46);
  ctx.moveTo(40, -20);
  ctx.lineTo(76, 46);
  ctx.stroke();
  for (const hand of [-76, 76]) {
    ctx.fillStyle = "#50cdf5";
    ctx.shadowColor = "#5ce8ff";
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(hand, 48, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8fcff";
    ctx.beginPath();
    ctx.arc(hand - Math.sign(hand) * 4, 44, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawMenu() {
  if (cover.complete && cover.naturalWidth) {
    ctx.drawImage(cover, 0, 0, WIDTH, HEIGHT);
  } else {
    ctx.fillStyle = "#050607";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  centerText("THE BIG SORCERER", 145, "#eef2f5", 68);
  centerText("Escapa do laboratorio.", 290, "#eef2f5", 30);
  centerText("Prime W para andar para a frente e setas para te virares.", 346, "#eef2f5", 30);
  centerText("Prime ENTER para entrar", 402, "#52deeb", 30);
}

function drawWin() {
  ctx.fillStyle = "#0c1614";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  centerText("VITORIA!", 210, "#60dc77", 68);
  centerText("Derrotaste o feiticeiro e escapaste do laboratorio.", 290, "#eef2f5", 30);
  centerText("ENTER para jogar outra vez", 370, "#52deeb", 30);
}

function drawCaught() {
  ctx.fillStyle = caughtTimer > 180 ? "#0e0a0e" : "#b9141c";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (caughtTimer > 180) {
    drawBossFigure(WIDTH / 2, HEIGHT / 2 - 20, 2.2);
    centerText("!", 92, "#d23034", 76);
  } else {
    centerText(message, 230, "#eef2f5", 64);
    centerText("A recomecar o jogo...", 310, "#eef2f5", 30);
  }
}

function drawTransition() {
  ctx.fillStyle = "#121216";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  centerText("PORTA ABERTA", 210, "#eef2f5", 68);
  centerText(transitionNext === "boss" ? "Batalha final em" : "Proximo nivel em", 285, "#52deeb", 30);
  centerText(String(Math.ceil(transitionTimer / 60)), 355, "#f5d256", 70);
  if (transitionNext === "boss") centerText("ESPACO para disparar", 450, "#eef2f5", 30);
}

function centerText(text, y, color, size) {
  ctx.font = `${size}px Arial`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(text, WIDTH / 2, y);
  ctx.textAlign = "start";
}

function roundRect(x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  if (fill) ctx.fill();
}

function drawVignette() {
  const grad = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 120, WIDTH / 2, HEIGHT / 2, 620);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function loop(now) {
  lastTime = now;
  if (state === "playing") {
    updatePlaying();
    drawPlaying();
  } else if (state === "boss") {
    updateBoss();
    drawBoss();
  } else if (state === "caught") {
    caughtTimer -= 1;
    drawCaught();
    if (caughtTimer <= 0) {
      loadLevel(0);
      state = "playing";
    }
  } else if (state === "transition") {
    transitionTimer -= 1;
    drawTransition();
    if (transitionTimer <= 0) {
      if (transitionNext === "boss") startBoss();
      else {
        loadLevel(transitionNext);
        state = "playing";
      }
    }
  } else if (state === "win") {
    drawWin();
  } else {
    drawMenu();
  }
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  ensureAudio();
  keys.add(event.key.length === 1 ? event.key.toLowerCase() : event.key);
  if (event.key === "Enter" && (state === "menu" || state === "win")) {
    loadLevel(0);
    state = "playing";
  }
  if (event.code === "Space" && state === "boss") {
    bossProjectiles.push({ x: playerScreenX, y: playerScreenY, vx: 0, vy: -8, type: "player" });
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
});

canvas.addEventListener("click", (event) => {
  ensureAudio();
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * WIDTH / rect.width;
  const y = (event.clientY - rect.top) * HEIGHT / rect.height;
  if (x >= objectiveButton.x && x <= objectiveButton.x + objectiveButton.w && y >= objectiveButton.y && y <= objectiveButton.y + objectiveButton.h) {
    objectiveVisible = !objectiveVisible;
  }
});

loadLevel(0);
requestAnimationFrame(loop);
