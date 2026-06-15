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
  matrix: null,
  type: null,
  rotState: 0,
};

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

let holdPiece = null; // { matrix, type }
let canHold = true;
let bag = [];
let nextQueue = []; // [{ matrix, type }]

let score = 0;
let highScore = 0;
let level = 1;
let totalLines = 0;

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let clearingLines = [];
let clearTimer = 0;
const CLEAR_DURATION = 200;
let isGameOver = false;

// ロックディレイ
const LOCK_DELAY = 500;
const MAX_LOCK_RESETS = 15;
let isLocking = false;
let lockTimer = 0;
let lockResetCount = 0;

// T-Spin
let wasTSpinLock = false;
let lastMoveWasTSpin = false;

// DAS
const DAS_DELAY = 170;
const DAS_INTERVAL = 50;
let dasDir = 0;
let dasTimer = 0;
let dasActive = false;
let dasRepeatTimer = 0;

let isPaused = false;
let combo = 0;

// エフェクト
let particles = [];
let shakeTimer = 0;
let flashTimer = 0;
let comboDisplayTimer = 0;
let tspinDisplayTimer = 0;
let tspinText = '';
let perfectClearTimer = 0;

// スコアアニメーション
let displayScore = 0;
let targetScore = 0;

// 統計
let stats = { lines: 0, pieces: 0, startTime: 0, tspins: 0, tetrises: 0 };

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

// SRS壁キックテーブル（キャンバス座標系：y下向き）
const KICKS_JLSTZ = {
  '0>1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '1>0': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '1>2': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '2>1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '2>3': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '3>2': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '3>0': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '0>3': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
};
const KICKS_I = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  '1>0': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
  '2>1': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  '3>2': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  '0>3': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
};

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
  const type = bag.pop();
  return { matrix: createPiece(type), type };
}

/* ---------- 描画 ---------- */

function drawMatrix(matrix, offset, context) {
  const colors = [null,'#ff4d4d','#ffd700','#4da6ff','#ff8c00','#00ffff','#00ff00','#ff0000'];
  matrix.forEach((row,y) => {
    row.forEach((value,x) => {
      if (value) {
        context.fillStyle = colors[value];
        context.fillRect(x+offset.x, y+offset.y, 1, 1);
        context.strokeStyle = '#fff';
        context.lineWidth = 0.05;
        context.strokeRect(x+offset.x, y+offset.y, 1, 1);
      }
    });
  });
}

function draw() {
  ctx.fillStyle = '#111';
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

  // ロックディレイ警告点滅
  if (isLocking && lockTimer / LOCK_DELAY > 0.5) {
    ctx.globalAlpha = ((lockTimer / LOCK_DELAY) - 0.5) * 0.5;
    ctx.fillStyle = '#fff';
    player.matrix.forEach((row,y) => {
      row.forEach((v,x) => {
        if (v) ctx.fillRect(x+player.pos.x, y+player.pos.y, 1, 1);
      });
    });
    ctx.globalAlpha = 1;
  }

  drawMatrix(player.matrix, player.pos, ctx);
  drawParticles();
  ctx.restore();

  if (flashTimer > 0) {
    ctx.fillStyle = `rgba(0,255,255,${(flashTimer/300)*0.35})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (comboDisplayTimer > 0 && combo >= 2) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, comboDisplayTimer / 300);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 0.8px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`COMBO ×${combo}`, 6, 2);
    ctx.restore();
  }

  if (tspinDisplayTimer > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, tspinDisplayTimer / 300);
    ctx.fillStyle = '#ff44ff';
    ctx.font = 'bold 0.7px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(tspinText, 6, combo >= 2 ? 3.2 : 2);
    ctx.restore();
  }

  if (perfectClearTimer > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, perfectClearTimer / 400);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 0.9px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PERFECT!', 6, 10);
    ctx.restore();
  }
}

function drawNext() {
  nextCtx.clearRect(0, 0, 80, 240);
  nextQueue.forEach((piece, index) => {
    drawMatrix(piece.matrix, {x:1, y: index * 3 + 1}, nextCtx);
  });
}

function drawHold() {
  holdCtx.clearRect(0, 0, 80, 80);
  if (holdPiece) drawMatrix(holdPiece.matrix, {x:1, y:1}, holdCtx);
}

/* ---------- ゴースト ---------- */

function drawGhost() {
  const ghost = { pos: {...player.pos}, matrix: player.matrix };
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
        x: x+0.5, y: y+0.5,
        vx: (Math.random()-0.5)*0.4,
        vy: (Math.random()-0.5)*0.4 - 0.15,
        life: 1,
        color: colors[Math.floor(Math.random()*colors.length)],
        size: Math.random()*0.25+0.1
      });
    }
  });
}

function updateParticles(delta) {
  const dt = delta / 1000;
  particles = particles.filter(p => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.02; p.life -= dt * 2.5;
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
  player.matrix.forEach((row,y) => {
    row.forEach((value,x) => {
      if (value) arena[y+player.pos.y][x+player.pos.x] = value;
    });
  });
}

function collide(arena, player) {
  return player.matrix.some((row,y) =>
    row.some((value,x) =>
      value && (arena[y+player.pos.y]?.[x+player.pos.x] !== 0)
    )
  );
}

/* ---------- 操作 ---------- */

function playerMove(dir) {
  player.pos.x += dir;
  if (collide(arena, player)) {
    player.pos.x -= dir;
    return;
  }
  lastMoveWasTSpin = false;
  if (isLocking && lockResetCount < MAX_LOCK_RESETS) {
    lockTimer = 0;
    lockResetCount++;
  }
  player.pos.y++;
  isLocking = !!collide(arena, player);
  player.pos.y--;
}

function rotateMatrix(matrix) {
  return matrix[0].map((_,i) => matrix.map(r => r[i]).reverse());
}

function playerRotate(dir = 1) {
  if (player.type === 'O') return;

  const prevState = player.rotState;
  const nextState = (prevState + dir + 4) % 4;
  const key = `${prevState}>${nextState}`;
  const kicks = player.type === 'I' ? KICKS_I[key] : KICKS_JLSTZ[key];

  const oldMatrix = player.matrix;
  const oldX = player.pos.x;
  const oldY = player.pos.y;

  // CW: 1回, CCW: 3回
  let m = player.matrix;
  const times = ((dir % 4) + 4) % 4;
  for (let i = 0; i < times; i++) m = rotateMatrix(m);
  player.matrix = m;
  player.rotState = nextState;

  for (const [kx, ky] of kicks) {
    player.pos.x = oldX + kx;
    player.pos.y = oldY + ky;
    if (!collide(arena, player)) {
      lastMoveWasTSpin = checkTSpin();
      if (isLocking && lockResetCount < MAX_LOCK_RESETS) {
        lockTimer = 0;
        lockResetCount++;
      }
      player.pos.y++;
      isLocking = !!collide(arena, player);
      player.pos.y--;
      return;
    }
  }

  player.matrix = oldMatrix;
  player.rotState = prevState;
  player.pos.x = oldX;
  player.pos.y = oldY;
}

function checkTSpin() {
  if (player.type !== 'T') return false;
  const cx = player.pos.x + 1;
  const cy = player.pos.y + 1;
  let corners = 0;
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([dx,dy]) => {
    const x = cx+dx, y = cy+dy;
    if (x < 0 || x >= 12 || y >= 20 || (y >= 0 && arena[y]?.[x] !== 0)) corners++;
  });
  return corners >= 3;
}

function playerDrop() {
  player.pos.y++;
  if (collide(arena, player)) {
    player.pos.y--;
    if (!isLocking) { isLocking = true; lockTimer = 0; }
  } else {
    if (isLocking) isLocking = false;
  }
  dropCounter = 0;
}

function lockPiece() {
  merge(arena, player);
  wasTSpinLock = lastMoveWasTSpin;
  lastMoveWasTSpin = false;
  isLocking = false;
  lockTimer = 0;
  lockResetCount = 0;
  dropCounter = 0;
  playDrop();
  shakeTimer = 150;
  vibrate(30);
  canHold = true;
  stats.pieces++;
  playerReset();
  arenaSweep();
}

function hardDrop() {
  while (!collide(arena, player)) player.pos.y++;
  player.pos.y--;
  lockPiece();
}

/* ---------- ホールド ---------- */

function hold() {
  if (!canHold) return;
  const current = { matrix: player.matrix, type: player.type };
  if (!holdPiece) {
    holdPiece = current;
    playerReset();
  } else {
    const temp = holdPiece;
    holdPiece = current;
    player.matrix = temp.matrix;
    player.type = temp.type;
    player.rotState = 0;
    player.pos = { x:5, y:0 };
  }
  canHold = false;
  isLocking = false;
  lastMoveWasTSpin = false;
  drawHold();
}

/* ---------- ライン消去 ---------- */

function arenaSweep() {
  clearingLines = [];
  outer: for (let y = arena.length-1; y > 0; y--) {
    for (let x = 0; x < arena[y].length; x++) {
      if (arena[y][x] === 0) continue outer;
    }
    clearingLines.push(y);
  }
  if (clearingLines.length) {
    clearTimer = CLEAR_DURATION;
  } else {
    combo = 0;
    wasTSpinLock = false;
  }
}

function isPerfectClear() {
  return arena.every(row => row.every(cell => cell === 0));
}

/* ---------- UI ---------- */

function updateScore() {
  targetScore = score;
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('tetrisHighScore', highScore);
  }
  document.getElementById('highscore').textContent = highScore;
}

function updateLevel() {
  document.getElementById('level').textContent = level;
}

function loadHighScore() {
  const s = localStorage.getItem('tetrisHighScore');
  if (s) highScore = parseInt(s);
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
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

function removeLines() {
  const lines = clearingLines.length;
  spawnParticles(clearingLines);

  clearingLines.sort((a,b) => a - b);
  clearingLines.forEach(y => {
    arena.splice(y, 1);
    arena.unshift(new Array(12).fill(0));
  });

  stats.lines += lines;
  if (lines === 4) stats.tetrises++;

  combo++;
  const comboBonus = combo >= 2 ? (combo - 1) * 50 * level : 0;
  comboDisplayTimer = 1200;

  let baseScore = 0;
  if (wasTSpinLock) {
    baseScore = [400, 800, 1200, 1600][Math.min(lines, 3)] * level;
    tspinText = lines > 0 ? `T-SPIN ${['','SINGLE','DOUBLE','TRIPLE'][lines]}` : 'T-SPIN';
    tspinDisplayTimer = 1500;
    stats.tspins++;
  } else {
    baseScore = [0, 100, 300, 500, 800][lines] || 0;
  }

  score += baseScore + comboBonus;
  wasTSpinLock = false;

  if (lines > 0 && isPerfectClear()) {
    score += 2000 * level;
    perfectClearTimer = 1500;
  }

  totalLines += lines;
  if (totalLines >= level * 10) {
    level++;
    dropInterval *= 0.8;
    updateLevel();
    playLevelUp();
    flashTimer = 300;
  }

  updateScore();
  clearingLines = [];

  if (lines > 0) { playClear(); vibrate(100); }
}

/* ---------- 初期化 ---------- */

function playerReset() {
  const next = nextQueue.shift();
  nextQueue.push(getNextPiece());
  player.matrix = next.matrix;
  player.type = next.type;
  player.rotState = 0;
  player.pos = {
    x: Math.floor(12/2) - Math.floor(next.matrix[0].length/2),
    y: 0
  };
  lastMoveWasTSpin = false;
  drawNext();
  if (collide(arena, player)) { showGameOver(); return; }
}

/* ---------- ループ ---------- */

function update(time=0) {
  if (isGameOver) return;
  const delta = time - lastTime;
  lastTime = time;

  if (!isPaused) {
    // DAS
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

    if (clearTimer <= 0) {
      if (!isLocking) {
        dropCounter += delta;
        if (dropCounter > dropInterval) {
          player.pos.y++;
          if (collide(arena, player)) {
            player.pos.y--;
            isLocking = true;
            lockTimer = 0;
          }
          dropCounter = 0;
        }
      } else {
        lockTimer += delta;
        if (lockTimer >= LOCK_DELAY) lockPiece();
      }
    }

    if (clearTimer > 0) {
      clearTimer -= delta;
      if (clearTimer <= 0) removeLines();
    }

    // スコアカウントアップ
    if (displayScore < targetScore) {
      const diff = targetScore - displayScore;
      displayScore = Math.min(targetScore, displayScore + Math.max(1, Math.ceil(diff / 8)));
      document.getElementById('score').textContent = displayScore;
    }

    if (shakeTimer > 0) shakeTimer -= delta;
    if (flashTimer > 0) flashTimer -= delta;
    if (comboDisplayTimer > 0) comboDisplayTimer -= delta;
    if (tspinDisplayTimer > 0) tspinDisplayTimer -= delta;
    if (perfectClearTimer > 0) perfectClearTimer -= delta;

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
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
  osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.15);
}

function playLevelUp() {
  resumeAudio();
  [523,659,784,1047].forEach((freq,i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'square'; osc.frequency.value = freq;
    const t = audioCtx.currentTime + i * 0.12;
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.start(t); osc.stop(t + 0.25);
  });
}

function playGameOver() {
  resumeAudio();
  [440,370,294,220].forEach((freq,i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'sawtooth'; osc.frequency.value = freq;
    const t = audioCtx.currentTime + i * 0.22;
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.start(t); osc.stop(t + 0.45);
  });
}

function playClear() {
  resumeAudio();
  [523,659,784].forEach((freq,i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'triangle'; osc.frequency.value = freq;
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

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

document.addEventListener('fullscreenchange', () => {
  document.getElementById('fs-btn').textContent =
    document.fullscreenElement ? '✕ 全画面解除' : '⛶ 全画面';
});

function togglePause() {
  if (isGameOver) return;
  isPaused = !isPaused;
  document.getElementById('pause').classList.toggle('show', isPaused);
}

function toggleBGM() {
  bgmEnabled = !bgmEnabled;
  if (bgmEnabled) { bgmNextTime = audioCtx.currentTime; }
  else { stopBGMNodes(); }
  document.getElementById('bgm-btn').textContent = bgmEnabled ? '♪ BGM' : '♪ OFF';
}

/* ---------- ゲームオーバー ---------- */

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
}

function showGameOver() {
  isGameOver = true;
  bgmEnabled = false;
  playGameOver();
  const elapsed = Date.now() - stats.startTime;
  const isNewRecord = score > 0 && score >= highScore;
  document.getElementById('go-score').textContent = score;
  document.getElementById('go-best').textContent = highScore;
  document.getElementById('go-new-record').style.display = isNewRecord ? 'block' : 'none';
  document.getElementById('go-lines').textContent = stats.lines;
  document.getElementById('go-pieces').textContent = stats.pieces;
  document.getElementById('go-level').textContent = level;
  document.getElementById('go-time').textContent = formatTime(elapsed);
  document.getElementById('gameover').classList.add('show');
}

function restartGame() {
  document.getElementById('gameover').classList.remove('show');
  arena.forEach(row => row.fill(0));
  score = 0; displayScore = 0; targetScore = 0;
  level = 1; totalLines = 0; dropInterval = 1000;
  dropCounter = 0; holdPiece = null; canHold = true;
  bag = []; clearingLines = []; clearTimer = 0; nextQueue = []; lastTime = 0;
  combo = 0; particles = []; shakeTimer = 0; flashTimer = 0;
  comboDisplayTimer = 0; tspinDisplayTimer = 0; perfectClearTimer = 0;
  isPaused = false; isLocking = false; lockTimer = 0; lockResetCount = 0;
  wasTSpinLock = false; lastMoveWasTSpin = false;
  dasDir = 0; dasActive = false;
  bgmEnabled = false; bgmIndex = 0; bgmNextTime = 0; bgmNodes = [];
  stats = { lines:0, pieces:0, startTime: Date.now(), tspins:0, tetrises:0 };
  document.getElementById('bgm-btn').textContent = '♪ OFF';
  initNextQueue();
  playerReset();
  updateScore();
  updateLevel();
  drawHold();
  isGameOver = false;
  requestAnimationFrame(update);
}

/* ---------- タッチ操作 ---------- */

let touchStartX = 0, touchStartY = 0, touchLastX = 0, touchMoved = false;
const TOUCH_CELL = 25;

document.addEventListener('touchstart', e => {
  if (e.target.tagName === 'BUTTON') return;
  resumeAudio();
  touchStartX = touchLastX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchMoved = false;
}, { passive: true });

document.addEventListener('touchmove', e => {
  if (e.target.tagName === 'BUTTON') return;
  if (isPaused || isGameOver) return;
  const dx = e.touches[0].clientX - touchLastX;
  if (Math.abs(dx) >= TOUCH_CELL) {
    playerMove(dx > 0 ? 1 : -1);
    touchLastX = e.touches[0].clientX;
    touchMoved = true;
  }
}, { passive: true });

document.addEventListener('touchend', e => {
  if (e.target.tagName === 'BUTTON') return;
  if (isPaused) { togglePause(); return; }
  if (isGameOver) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const absDx = Math.abs(dx), absDy = Math.abs(dy);
  if (!touchMoved && absDx < 12 && absDy < 12) {
    playerRotate();
  } else if (absDy > 50 && absDy > absDx * 1.5) {
    if (dy > 0) hardDrop(); else hold();
  }
}, { passive: true });

/* ---------- キーボード入力 ---------- */

document.addEventListener('keydown', e => {
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
  if (e.key === 'p' || e.key === 'P') { togglePause(); return; }
  if (e.key === 'm' || e.key === 'M') { toggleBGM(); return; }
  if (isPaused || isGameOver) return;
  if      (e.key === 'ArrowLeft')            { dasDir=-1; dasTimer=0; dasActive=false; playerMove(-1); }
  else if (e.key === 'ArrowRight')           { dasDir=1;  dasTimer=0; dasActive=false; playerMove(1); }
  else if (e.key === 'ArrowDown')            playerDrop();
  else if (e.key === 'ArrowUp')              playerRotate(1);
  else if (e.key === 'z' || e.key === 'Z')   playerRotate(-1);
  else if (e.key === ' ')                    hardDrop();
  else if (e.key === 'c' || e.key === 'C')  hold();
});

document.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { dasDir=0; dasActive=false; }
});

document.addEventListener('keydown', resumeAudio, { once: true });
document.addEventListener('touchstart', resumeAudio, { once: true });

/* ---------- 起動 ---------- */

loadHighScore();
stats.startTime = Date.now();
initNextQueue();
playerReset();
updateScore();
updateLevel();
update();
