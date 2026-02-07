// Cucumber Panic
// A very serious simulation of being a cat.
// Catch fish, dodge cucumbers and spray bottles. You get nine lives.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

// ---------- Settings (change these to tune the game) ----------

const START_LIVES = 9;
const CAT_SIZE = 110;
const CAT_SPEED = 420; // pixels per second when using the keyboard
const FLOOR_HEIGHT = 40;

// What can fall from the sky. "chance" values are compared against each other.
const ITEM_TYPES = [
  { name: "fish", chance: 55, points: 1, hurts: false, size: 44 },
  { name: "tuna", chance: 8, points: 5, hurts: false, size: 40 },
  { name: "cucumber", chance: 25, points: 0, hurts: true, size: 56 },
  { name: "spray", chance: 12, points: 0, hurts: true, size: 46 },
];

// ---------- Funny text ----------

const FISH_LINES = ["nom", "yoink", "mine", "fish acquired", "delicious", "chomp"];
const TUNA_LINES = ["THE GOOD STUFF", "premium can", "tuna jackpot"];
const CUCUMBER_LINES = ["AAAAAAA", "CUCUMBER", "it's a snake", "betrayal", "not again"];
const SPRAY_LINES = ["pspsps DENIED", "I was being good", "wet. disgusting.", "rude"];

// Game over title depends on your score. First match (score >= min) wins.
const RANKS = [
  { min: 150, title: "Ancient Egyptian deity" },
  { min: 100, title: "Apex predator of the kitchen" },
  { min: 60, title: "Certified fish enjoyer" },
  { min: 30, title: "Respectable house cat" },
  { min: 10, title: "Easily startled loaf" },
  { min: 0, title: "Lost a fight with a salad" },
];

// ---------- Mascot ----------
// Put your picture at assets/mascot.png and the game uses it as the cat.
// If the file is missing, we draw a simple cat with shapes instead.

const mascot = new Image();
let mascotLoaded = false;
mascot.onload = function () {
  mascotLoaded = true;
};
mascot.src = "assets/mascot.png";

// ---------- Game state ----------

let state = "menu"; // "menu", "playing" or "over"
let score = 0;
let lives = START_LIVES;
let best = loadBest();
let items = []; // things falling
let popups = []; // little floating texts
let spawnTimer = 0;
let scaredTimer = 0; // > 0 while the cat is freaking out

const cat = {
  x: W / 2 - CAT_SIZE / 2,
  y: H - FLOOR_HEIGHT - CAT_SIZE,
  w: CAT_SIZE,
  h: CAT_SIZE,
};

function loadBest() {
  // localStorage can fail in private windows, so we wrap it
  try {
    return Number(localStorage.getItem("cucumberPanicBest")) || 0;
  } catch (e) {
    return 0;
  }
}

function saveBest() {
  try {
    localStorage.setItem("cucumberPanicBest", String(best));
  } catch (e) {
    // no high score saving, the game still works
  }
}

function startGame() {
  state = "playing";
  score = 0;
  lives = START_LIVES;
  items = [];
  popups = [];
  spawnTimer = 0;
  scaredTimer = 0;
  cat.x = W / 2 - cat.w / 2;
}

// ---------- Input ----------

const keys = {};

document.addEventListener("keydown", function (e) {
  keys[e.key.toLowerCase()] = true;

  if (e.key === " " || e.key === "Enter") {
    e.preventDefault(); // stop the page from scrolling on Space
    if (state !== "playing") startGame();
  }
});

document.addEventListener("keyup", function (e) {
  keys[e.key.toLowerCase()] = false;
});

// Mouse and touch: the cat follows your pointer
function movePointer(clientX) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (W / rect.width);
  cat.x = x - cat.w / 2;
}

canvas.addEventListener("mousemove", function (e) {
  if (state === "playing") movePointer(e.clientX);
});

canvas.addEventListener("touchmove", function (e) {
  e.preventDefault();
  if (state === "playing") movePointer(e.touches[0].clientX);
});

canvas.addEventListener("click", function () {
  if (state !== "playing") startGame();
});

// ---------- Helpers ----------

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function pickItemType() {
  let total = 0;
  for (const type of ITEM_TYPES) total += type.chance;

  let roll = Math.random() * total;
  for (const type of ITEM_TYPES) {
    roll -= type.chance;
    if (roll <= 0) return type;
  }
  return ITEM_TYPES[0];
}

function spawnItem() {
  const type = pickItemType();
  items.push({
    type: type,
    x: Math.random() * (W - type.size),
    y: -type.size,
    size: type.size,
    speed: Math.min(160 + score * 4, 520) + Math.random() * 60,
  });
}

function addPopup(text, x, y, color) {
  popups.push({ text: text, x: x, y: y, color: color, life: 1 });
}

function isTouching(a, b) {
  // classic rectangle overlap check
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

// ---------- Update (game logic) ----------

function update(dt) {
  if (state !== "playing") return;

  // move the cat
  if (keys["arrowleft"] || keys["a"]) cat.x -= CAT_SPEED * dt;
  if (keys["arrowright"] || keys["d"]) cat.x += CAT_SPEED * dt;

  // keep the cat on screen
  if (cat.x < 0) cat.x = 0;
  if (cat.x > W - cat.w) cat.x = W - cat.w;

  // spawn new items, faster as the score goes up
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnItem();
    spawnTimer = Math.max(0.35, 0.9 - score * 0.01);
  }

  if (scaredTimer > 0) scaredTimer -= dt;

  // move items and check if the cat touched them
  for (const item of items) {
    item.y += item.speed * dt;

    const itemBox = { x: item.x, y: item.y, w: item.size, h: item.size };
    // slightly smaller box for the cat so near misses feel fair
    const catBox = { x: cat.x + 12, y: cat.y + 12, w: cat.w - 24, h: cat.h - 12 };

    if (isTouching(itemBox, catBox)) {
      item.caught = true;
      handleCatch(item);
    }
  }

  // remove caught items and items that fell off the screen
  items = items.filter(function (item) {
    return !item.caught && item.y < H;
  });

  // float the popup texts up and fade them
  for (const p of popups) {
    p.y -= 50 * dt;
    p.life -= dt;
  }
  popups = popups.filter(function (p) {
    return p.life > 0;
  });
}

function handleCatch(item) {
  const name = item.type.name;
  const textX = cat.x + cat.w / 2;
  const textY = cat.y - 10;

  if (item.type.hurts) {
    lives -= 1;
    scaredTimer = 0.5;
    const line = name === "cucumber" ? randomFrom(CUCUMBER_LINES) : randomFrom(SPRAY_LINES);
    addPopup(line, textX, textY, "#c0392b");

    if (lives <= 0) {
      state = "over";
      if (score > best) {
        best = score;
        saveBest();
      }
    }
  } else {
    score += item.type.points;
    const line = name === "tuna" ? randomFrom(TUNA_LINES) : randomFrom(FISH_LINES);
    addPopup("+" + item.type.points + " " + line, textX, textY, "#2c7a2c");
  }
}

// ---------- Draw ----------

function draw() {
  drawBackground();

  for (const item of items) drawItem(item);
  drawCat();
  drawPopups();
  drawHud();

  if (state === "menu") drawMenu();
  if (state === "over") drawGameOver();
}

function drawBackground() {
  // wall
  ctx.fillStyle = "#fff8e8";
  ctx.fillRect(0, 0, W, H);

  // kitchen floor tiles
  const tile = 40;
  for (let x = 0; x < W; x += tile) {
    ctx.fillStyle = (x / tile) % 2 === 0 ? "#e8c890" : "#d9b77c";
    ctx.fillRect(x, H - FLOOR_HEIGHT, tile, FLOOR_HEIGHT);
  }
}

function drawCat() {
  let x = cat.x;
  const y = cat.y;

  // shake when scared
  if (scaredTimer > 0) x += Math.random() * 10 - 5;

  if (mascotLoaded) {
    ctx.drawImage(mascot, x, y, cat.w, cat.h);
    return;
  }

  // Backup cat made of shapes (used until you add assets/mascot.png)
  const cx = x + cat.w / 2;
  const cy = y + cat.h / 2 + 8;
  const r = cat.w / 2 - 8;

  ctx.fillStyle = "#f29a3f";

  // ears
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - r * 0.3);
  ctx.lineTo(cx - r * 0.8, cy - r * 1.3);
  ctx.lineTo(cx - r * 0.2, cy - r * 0.8);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + r, cy - r * 0.3);
  ctx.lineTo(cx + r * 0.8, cy - r * 1.3);
  ctx.lineTo(cx + r * 0.2, cy - r * 0.8);
  ctx.fill();

  // head
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // eyes (they get huge when scared)
  const eyeSize = scaredTimer > 0 ? 10 : 5;
  ctx.fillStyle = "#3b2a1a";
  ctx.beginPath();
  ctx.arc(cx - r * 0.4, cy - r * 0.15, eyeSize, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.4, cy - r * 0.15, eyeSize, 0, Math.PI * 2);
  ctx.fill();

  // nose
  ctx.fillStyle = "#e86a8a";
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy + 4);
  ctx.lineTo(cx + 5, cy + 4);
  ctx.lineTo(cx, cy + 10);
  ctx.fill();

  // mouth: smile normally, big "O" when scared
  ctx.strokeStyle = "#3b2a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (scaredTimer > 0) {
    ctx.arc(cx, cy + 20, 6, 0, Math.PI * 2);
  } else {
    ctx.arc(cx - 6, cy + 10, 6, 0, Math.PI);
    ctx.moveTo(cx + 12, cy + 10);
    ctx.arc(cx + 6, cy + 10, 6, 0, Math.PI);
  }
  ctx.stroke();

  // whiskers
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy + 8);
  ctx.lineTo(cx - r - 6, cy + 2);
  ctx.moveTo(cx - 12, cy + 12);
  ctx.lineTo(cx - r - 6, cy + 16);
  ctx.moveTo(cx + 12, cy + 8);
  ctx.lineTo(cx + r + 6, cy + 2);
  ctx.moveTo(cx + 12, cy + 12);
  ctx.lineTo(cx + r + 6, cy + 16);
  ctx.stroke();
}

function drawItem(item) {
  const x = item.x;
  const y = item.y;
  const s = item.size;
  const name = item.type.name;

  if (name === "fish") {
    // body
    ctx.fillStyle = "#4a90d9";
    ctx.beginPath();
    ctx.ellipse(x + s * 0.45, y + s / 2, s * 0.4, s * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    // tail
    ctx.beginPath();
    ctx.moveTo(x + s * 0.75, y + s / 2);
    ctx.lineTo(x + s, y + s * 0.2);
    ctx.lineTo(x + s, y + s * 0.8);
    ctx.fill();
    // eye
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x + s * 0.25, y + s * 0.45, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (name === "tuna") {
    // a can of the good stuff
    ctx.fillStyle = "#b8bcc4";
    ctx.fillRect(x, y + s * 0.25, s, s * 0.55);
    ctx.fillStyle = "#e0b030";
    ctx.fillRect(x, y + s * 0.4, s, s * 0.25);
    ctx.fillStyle = "#3b2a1a";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("TUNA", x + s / 2, y + s * 0.58);
  }

  if (name === "cucumber") {
    // the enemy
    ctx.fillStyle = "#3f8f3a";
    ctx.beginPath();
    ctx.ellipse(x + s / 2, y + s / 2, s * 0.2, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // little bumps
    ctx.fillStyle = "#2c6b28";
    ctx.fillRect(x + s * 0.42, y + s * 0.2, 3, 3);
    ctx.fillRect(x + s * 0.55, y + s * 0.45, 3, 3);
    ctx.fillRect(x + s * 0.42, y + s * 0.7, 3, 3);
  }

  if (name === "spray") {
    // bottle
    ctx.fillStyle = "#6ec6e8";
    ctx.fillRect(x + s * 0.25, y + s * 0.35, s * 0.5, s * 0.65);
    // neck and trigger
    ctx.fillStyle = "#d94a4a";
    ctx.fillRect(x + s * 0.4, y + s * 0.15, s * 0.2, s * 0.2);
    ctx.fillRect(x + s * 0.1, y + s * 0.1, s * 0.5, s * 0.1);
  }
}

function drawPopups() {
  ctx.textAlign = "center";
  ctx.font = "bold 18px sans-serif";
  for (const p of popups) {
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

function drawHud() {
  ctx.fillStyle = "#3b2a1a";
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Fish: " + score, 12, 26);
  ctx.textAlign = "center";
  ctx.fillText("Best: " + best, W / 2, 26);
  ctx.textAlign = "right";
  ctx.fillText("Lives: " + lives, W - 12, 26);
}

function drawOverlay() {
  ctx.fillStyle = "rgba(255, 248, 232, 0.88)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#3b2a1a";
  ctx.textAlign = "center";
}

function drawMenu() {
  drawOverlay();
  // show the mascot nice and big on the start screen
  if (mascotLoaded) ctx.drawImage(mascot, W / 2 - 80, 20, 160, 160);
  ctx.font = "bold 40px sans-serif";
  ctx.fillText("CUCUMBER PANIC", W / 2, 220);
  ctx.font = "18px sans-serif";
  ctx.fillText("Fish and tuna: good.", W / 2, 280);
  ctx.fillText("Cucumbers and spray bottles: very bad.", W / 2, 308);
  ctx.fillText("You have nine lives. Obviously.", W / 2, 336);
  ctx.font = "bold 20px sans-serif";
  ctx.fillText("Press Space or click to start", W / 2, 410);
}

function drawGameOver() {
  drawOverlay();

  let rank = RANKS[RANKS.length - 1];
  for (const r of RANKS) {
    if (score >= r.min) {
      rank = r;
      break;
    }
  }

  ctx.font = "bold 36px sans-serif";
  ctx.fillText("OUT OF LIVES", W / 2, 210);
  ctx.font = "20px sans-serif";
  ctx.fillText("Fish eaten: " + score, W / 2, 265);
  ctx.fillText("Best: " + best, W / 2, 293);
  ctx.font = "16px sans-serif";
  ctx.fillText("Your rank:", W / 2, 345);
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(rank.title, W / 2, 375);
  ctx.font = "bold 20px sans-serif";
  ctx.fillText("Press Space or click to try again", W / 2, 450);
}

// ---------- Main loop ----------

let lastTime = 0;

function loop(time) {
  // dt = seconds since the last frame (capped so tab switching doesn't break things)
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
