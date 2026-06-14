const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.scale(20, 20);

const nextCtx = document.getElementById("next").getContext("2d");
nextCtx.scale(20, 20);

const holdCtx = document.getElementById("hold").getContext("2d");
holdCtx.scale(20, 20);

const arena = createMatrix(12, 20);

const player = {
  pos: {x: 5, y: 0},
  matrix: null
};

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

let holdPiece = null;
let canHold = true;
let bag = [];

let score = 0;
let highScore = 0;
let level = 1;
let totalLines = 0;

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let nextQueue = [];
let clearingLines = [];
let clearTimer = 0;
const CLEAR_DURATION = 200;
let isGameOver = false;

// DAS
const DAS_DELAY = 170;
const DAS_INTERVAL = 50;
let dasDir = 0;
let dasTimer = 0;
let dasActive = false;
let dasRepeatTimer = 0;

// Game state
let isPaused = false;
let combo = 0;

// Visual effects
let particles = [];
let shakeTimer = 0;
let flashTimer = 0;
let comboDisplayTimer = 0;

// BGM
const BGM_NOTES = [
  [659,0.2],[494,0.1],[523,0.1],[587,0.2],[523,0.1],[494,0.1],
  [440,0.2],[440,0.1],[523,0.1],[659,0.2],[587,0.1],[523,0.1],
  [494,0.3],[523,0.1],[587,0.2],[659,0.2],
  [523,0.2],[440,0.2],[440,0.3],[0,0.1],
  [587,0.2],[698,0.1],[880,0.2],[784,0.1],[698,0.1],
  [659,0.3],[523,0.1],[659,0.2],[587,0.1],[523,0.1],
  [494,0.2],[494,0.1],[523,0.1],[587,0.2],[659,0.2],
  [523,0.2],[440,0.2],[440,0.3],[0,0.1],
];
let bgmEnabled = false;
let bgmIndex = 0;
let bgmNextTime = 0;
let bgmNodes = [];

/* ---------- 基本 ---------- */

function createMatrix(w, h) {
  return Array.from({length: h}, () => Array(w).fill(0));
}

function createPiece(type) {
  if (type === 'T') return [[0,1,0],[1,1,1],[0,0,0]];
  if (type === 'O') return [[2,2],[2,2]];
  if (type === 'L') return [[0,0,3],[3,3,3],[0,0,0]];
  if (type === 'J') return [[4,0,0],[4,4,4],[0,0,0]];
  if (type === 'I') return [[5,5,5,5]];
  if (type === 'S') return [[0,6,6],[6,6,0],[0,0,0]];
  if (type === 'Z') return [[7,7,0],[0,7,7],[0,0,0]];
}

function getNextPiece() {
  if (bag.length === 0) {
    bag = ['T','J','L','O','S','Z','I'];
    shuffle(bag);
  }
  return createPiece(bag.pop());
}

/* ---------- 描画 ---------- */

function drawMatrix(matrix, offset, context) {
  const colors = [
    null,
    "#ff4d4d", // T
    "#ffd700", // O
    "#4da6ff", // L
    "#ff8c00", // J
    "#00ffff", // I
    "#00ff00", // S
    "#ff0000"  // Z
  ];
  matrix.forEach((row,y)=>{
    row.forEach((value,x)=>{
      if(value){
        context.fillStyle = colors[value];
        context.fillRect(x+offset.x, y+offset.y, 1, 1);
        context.strokeStyle = "#fff";
        context.lineWidth = 0.05;
        context.strokeRect(x+offset.x, y+offset.y, 1, 1);
      }
    });
  });
}

function draw() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  if (shakeTimer > 0) {
    const intensity = (shakeTimer / 150) * 0.35;
    ctx.translate((Math.random()-0.5)*intensity, (Math.random()-0.5)*intensity);
  }

  drawGrid();
  drawGhost();
  drawMatrix(arena, {x:0, y:0}, ctx);

  if (clearTimer > 0) {
    const t = clearTimer / CLEAR_DURATION;
    ctx.fillStyle = `hsl(${(1-t)*360}, 100%, 60%)`;
    clearingLines.forEach(y => ctx.fillRect(0, y, 12, 1));
  }

  drawMatrix(player.matrix, player.pos, ctx);
  drawParticles();
  ctx.restore();

  // レベルアップフラッシュ
  if (flashTimer > 0) {
    ctx.fillStyle = `rgba(0,255,255,${(flashTimer/300)*0.35})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // コンボ表示
  if (comboDisplayTimer > 0 && combo >= 2) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, comboDisplayTimer / 300);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 0.8px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`COMBO ×${combo}`, 6, 2.5);
    ctx.restore();
  }
}

function drawNext() {
  nextCtx.clearRect(0, 0, 80, 240);
  nextQueue.forEach((piece, index) => {
    drawMatrix(piece, {x:1, y: index * 3 + 1}, nextCtx);
  });
}

function drawHold() {
  holdCtx.clearRect(0, 0, 80, 80);
  if (holdPiece) drawMatrix(holdPiece, {x:1, y:1}, holdCtx);
}

/* ---------- ゴースト ---------- */

function drawGhost() {
  const ghost = {
    pos: {x: player.pos.x, y: player.pos.y},
    matrix: player.matrix
  };
  while (!collide(arena, ghost)) ghost.pos.y++;
  ghost.pos.y--;
  ctx.globalAlpha = 0.3;
  drawMatrix(ghost.matrix, ghost.pos, ctx);
  ctx.globalAlpha = 1;
}

/* ---------- パーティクル ---------- */

function spawnParticles(lines) {
  const colors = ['#ff4d4d','#ffd700','#4da6ff','#00ffff','#00ff00','#ff8c00'];
  lines.forEach(y => {
    for (let x = 0; x < 12; x += 1.5) {
      particles.push({
        x: x + 0.5, y: y + 0.5,
        vx: (Math.random()-0.5) * 0.4,
        vy: (Math.random()-0.5) * 0.4 - 0.15,
        life: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 0.25 + 0.1
      });
    }
  });
}

function updateParticles(delta) {
  const dt = delta / 1000;
  particles = particles.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.02;
    p.life -= dt * 2.5;
    return p.life > 0;
  });
}

function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

/* ---------- ロジック ---------- */

function merge(arena, player) {
  player.matrix.forEach((row,y)=>{
    row.forEach((value,x)=>{
      if(value) arena[y+player.pos.y][x+player.pos.x] = value;
    });
  });
}

function collide(arena, player) {
  return player.matrix.some((row,y)=>
    row.some((value,x)=>
      value && (arena[y+player.pos.y]?.[x+player.pos.x] !== 0)
    )
  );
}

/* ---------- 操作 ---------- */

function playerMove(dir){
  player.pos.x += dir;
  if (collide(arena, player)) player.pos.x -= dir;
}

function rotate(matrix){
  return matrix[0].map((_,i) => matrix.map(r => r[i]).reverse());
}

function playerRotate(){
  const old = player.matrix;
  player.matrix = rotate(player.matrix);
  if (collide(arena, player)) player.matrix = old;
}

function playerDrop(){
  player.pos.y++;
  if (collide(arena, player)){
    player.pos.y--;
    merge(arena, player);
    playDrop();
    shakeTimer = 150;
    vibrate(30);
    canHold = true;
    playerReset();
    arenaSweep();
  }
  dropCounter = 0;
}

function hardDrop(){
  while (!collide(arena, player)) player.pos.y++;
  player.pos.y--;
  playerDrop();
}

/* ---------- ホールド ---------- */

function hold(){
  if (!canHold) return;
  if (!holdPiece){
    holdPiece = player.matrix;
    playerReset();
  } else {
    [player.matrix, holdPiece] = [holdPiece, player.matrix];
    player.pos = {x:5, y:0};
  }
  canHold = false;
  drawHold();
}

/* ---------- ライン消去 ---------- */

function arenaSweep(){
  clearingLines = [];
  outer: for (let y = arena.length-1; y > 0; y--){
    for (let x = 0; x < arena[y].length; x++){
      if (arena[y][x] === 0) continue outer;
    }
    clearingLines.push(y);
  }
  if (clearingLines.length){
    clearTimer = CLEAR_DURATION;
  } else {
    combo = 0;
  }
}

/* ---------- UI ---------- */

function updateScore(){
  document.getElementById("score").textContent = score;
  if (score > highScore){
    highScore = score;
    localStorage.setItem("tetrisHighScore", highScore);
  }
  document.getElementById("highscore").textContent = highScore;
}

function updateLevel(){
  document.getElementById("level").textContent = level;
}

function loadHighScore(){
  const s = localStorage.getItem("tetrisHighScore");
  if (s) highScore = parseInt(s);
}

function drawGrid() {
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 0.05;
  for (let x = 0; x < 12; x++) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 20); ctx.stroke();
  }
  for (let y = 0; y < 20; y++) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(12, y); ctx.stroke();
  }
}

function initNextQueue() {
  nextQueue = [getNextPiece(), getNextPiece(), getNextPiece()];
}

function removeLines(){
  const lines = clearingLines.length;
  spawnParticles(clearingLines);

  // 昇順ソートでsplice+unshift後もインデックスがずれない
  clearingLines.sort((a,b) => a - b);
  clearingLines.forEach(y=>{
    arena.splice(y, 1);
    arena.unshift(new Array(12).fill(0));
  });

  combo++;
  const comboBonus = combo >= 2 ? (combo - 1) * 50 * level : 0;
  comboDisplayTimer = 1200;

  score += [0,100,300,500,800][lines] + comboBonus;
  totalLines += lines;

  if (totalLines >= level * 10){
    level++;
    dropInterval *= 0.8;
    updateLevel();
    playLevelUp();
    flashTimer = 300;
  }

  updateScore();
  clearingLines = [];

  if (lines > 0){
    playClear();
    vibrate(100);
  }
}

/* ---------- 初期化 ---------- */

function playerReset(){
  player.matrix = nextQueue.shift();
  nextQueue.push(getNextPiece());
  player.pos = {x:5, y:0};
  drawNext();
  if (collide(arena, player)){
    showGameOver();
    return;
  }
}

/* ---------- ループ ---------- */

function update(time=0){
  if (isGameOver) return;
  const delta = time - lastTime;
  lastTime = time;

  if (!isPaused) {
    // DAS（長押し連続移動）
    if (dasDir !== 0) {
      if (!dasActive) {
        dasTimer += delta;
        if (dasTimer >= DAS_DELAY) { dasActive = true; dasRepeatTimer = 0; }
      } else {
        dasRepeatTimer += delta;
        while (dasRepeatTimer >= DAS_INTERVAL) {
          playerMove(dasDir);
          dasRepeatTimer -= DAS_INTERVAL;
        }
      }
    }

    dropCounter += delta;
    if (dropCounter > dropInterval && clearTimer <= 0) playerDrop();

    if (clearTimer > 0){
      clearTimer -= delta;
      if (clearTimer <= 0) removeLines();
    }

    if (shakeTimer > 0) shakeTimer -= delta;
    if (flashTimer > 0) flashTimer -= delta;
    if (comboDisplayTimer > 0) comboDisplayTimer -= delta;

    updateParticles(delta);
    scheduleBGM();
  }

  draw();
  requestAnimationFrame(update);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/* ---------- サウンド ---------- */

function resumeAudio() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function scheduleBGM() {
  if (!bgmEnabled) return;
  if (bgmNextTime < audioCtx.currentTime) bgmNextTime = audioCtx.currentTime;
  while (bgmNextTime < audioCtx.currentTime + 0.5) {
    const [freq, dur] = BGM_NOTES[bgmIndex % BGM_NOTES.length];
    bgmIndex++;
    if (freq > 0) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, bgmNextTime);
      gain.gain.setValueAtTime(0.001, bgmNextTime + dur * 0.85);
      osc.start(bgmNextTime);
      osc.stop(bgmNextTime + dur);
      bgmNodes.push({ osc, gain });
      osc.onended = () => { bgmNodes = bgmNodes.filter(n => n.osc !== osc); };
    }
    bgmNextTime += dur;
  }
}

function stopBGMNodes() {
  bgmNodes.forEach(({ osc, gain }) => {
    try {
      gain.gain.cancelScheduledValues(audioCtx.currentTime);
      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.01);
    } catch(e) {}
  });
  bgmNodes = [];
}

function playDrop() {
  resumeAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.15);
}

function playLevelUp() {
  resumeAudio();
  [523, 659, 784, 1047].forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'square';
    osc.frequency.value = freq;
    const t = audioCtx.currentTime + i * 0.12;
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.start(t);
    osc.stop(t + 0.25);
  });
}

function playGameOver() {
  resumeAudio();
  [440, 370, 294, 220].forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const t = audioCtx.currentTime + i * 0.22;
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.start(t);
    osc.stop(t + 0.45);
  });
}

function playClear() {
  resumeAudio();
  [523, 659, 784].forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.1 + 0.3);
    osc.start(audioCtx.currentTime + i * 0.1);
    osc.stop(audioCtx.currentTime + i * 0.1 + 0.3);
  });
}

function vibrate(ms) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

/* ---------- ポーズ ---------- */

function togglePause() {
  if (isGameOver) return;
  isPaused = !isPaused;
  document.getElementById('pause').classList.toggle('show', isPaused);
}

function toggleBGM() {
  bgmEnabled = !bgmEnabled;
  if (bgmEnabled) {
    bgmNextTime = audioCtx.currentTime;
  } else {
    stopBGMNodes();
  }
  document.getElementById('bgm-btn').textContent = bgmEnabled ? '♪ BGM' : '♪ OFF';
}

/* ---------- ゲームオーバー ---------- */

function showGameOver() {
  isGameOver = true;
  bgmEnabled = false;
  playGameOver();
  const isNewRecord = score > 0 && score >= highScore;
  document.getElementById('go-score').textContent = score;
  document.getElementById('go-best').textContent = highScore;
  document.getElementById('go-new-record').style.display = isNewRecord ? 'block' : 'none';
  document.getElementById('gameover').classList.add('show');
}

function restartGame() {
  document.getElementById('gameover').classList.remove('show');

  arena.forEach(row => row.fill(0));
  score = 0;
  level = 1;
  totalLines = 0;
  dropInterval = 1000;
  dropCounter = 0;
  holdPiece = null;
  canHold = true;
  bag = [];
  clearingLines = [];
  clearTimer = 0;
  nextQueue = [];
  lastTime = 0;
  combo = 0;
  particles = [];
  shakeTimer = 0;
  flashTimer = 0;
  comboDisplayTimer = 0;
  isPaused = false;
  dasDir = 0;
  dasActive = false;
  bgmEnabled = false;
  bgmIndex = 0;
  bgmNextTime = 0;
  bgmNodes = [];
  document.getElementById('bgm-btn').textContent = '♪ OFF';

  initNextQueue();
  playerReset();
  updateScore();
  updateLevel();
  drawHold();

  isGameOver = false;
  requestAnimationFrame(update);
}

/* ---------- 入力 ---------- */

document.addEventListener("keydown", e=>{
  if (e.key === "p" || e.key === "P") { togglePause(); return; }
  if (e.key === "m" || e.key === "M") { toggleBGM(); return; }
  if (isPaused || isGameOver) return;
  if      (e.key === "ArrowLeft")  { dasDir=-1; dasTimer=0; dasActive=false; playerMove(-1); }
  else if (e.key === "ArrowRight") { dasDir=1;  dasTimer=0; dasActive=false; playerMove(1); }
  else if (e.key === "ArrowDown")  playerDrop();
  else if (e.key === "ArrowUp")    playerRotate();
  else if (e.key === " ")          { e.preventDefault(); hardDrop(); }
  else if (e.key === "c" || e.key === "C") hold();
});

document.addEventListener("keyup", e=>{
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") { dasDir=0; dasActive=false; }
});

document.addEventListener("keydown", resumeAudio, { once: true });
document.addEventListener("touchstart", resumeAudio, { once: true });

/* ---------- 起動 ---------- */

loadHighScore();
initNextQueue();
playerReset();
updateScore();
updateLevel();
update();
