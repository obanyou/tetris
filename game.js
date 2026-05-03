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

let nextPiece = null;
let holdPiece = null;
let canHold = true;

let score = 0;
let highScore = 0;
let level = 1;
let totalLines = 0;

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;

/* ---------- 基本 ---------- */

function createMatrix(w, h) {
  return Array.from({length: h}, () => Array(w).fill(0));
}

function createPiece(type) {
  if (type === 'T') return [[0,1,0],[1,1,1],[0,0,0]];
  if (type === 'O') return [[2,2],[2,2]];
  if (type === 'L') return [[0,0,3],[3,3,3],[0,0,0]];
  if (type === 'I') return [[4,4,4,4]];
}

function randomPiece() {
  const pieces = 'TOLI';
  return createPiece(pieces[Math.floor(Math.random()*pieces.length)]);
}

/* ---------- 描画 ---------- */

function drawMatrix(matrix, offset, context) {
  const colors = [null,"#ff4d4d","#ffd700","#4da6ff","#00ffff"];

  matrix.forEach((row,y)=>{
    row.forEach((value,x)=>{
      if(value){
        context.fillStyle = colors[value];
        context.fillRect(x+offset.x,y+offset.y,1,1);

        context.strokeStyle="#fff";
        context.lineWidth=0.05;
        context.strokeRect(x+offset.x,y+offset.y,1,1);
      }
    });
  });
}

function draw() {
  ctx.fillStyle="#111";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  drawGhost();
  drawMatrix(arena,{x:0,y:0},ctx);
  drawMatrix(player.matrix,player.pos,ctx);
}

function drawNext() {
  nextCtx.clearRect(0,0,80,80);
  drawMatrix(nextPiece,{x:1,y:1},nextCtx);
}

function drawHold() {
  holdCtx.clearRect(0,0,80,80);
  if(holdPiece){
    drawMatrix(holdPiece,{x:1,y:1},holdCtx);
  }
  function draw() {
    ctx.fillStyle="#111";
    ctx.fillRect(0,0,canvas.width,canvas.height);
  
    drawGrid();   // ⭐これ追加
  
    drawGhost();
    drawMatrix(arena,{x:0,y:0},ctx);
    drawMatrix(player.matrix,player.pos,ctx);
  }
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

/* ---------- ロジック ---------- */

function merge(arena, player) {
  player.matrix.forEach((row,y)=>{
    row.forEach((value,x)=>{
      if(value){
        arena[y+player.pos.y][x+player.pos.x]=value;
      }
    });
  });
}

function collide(arena, player) {
  return player.matrix.some((row,y)=>
    row.some((value,x)=>
      value && (arena[y+player.pos.y]?.[x+player.pos.x]!==0)
    )
  );
}

/* ---------- 操作 ---------- */

function playerMove(dir){
  player.pos.x+=dir;
  if(collide(arena,player)) player.pos.x-=dir;
}

function rotate(matrix){
  return matrix[0].map((_,i)=>matrix.map(r=>r[i]).reverse());
}

function playerRotate(){
  const old=player.matrix;
  player.matrix=rotate(player.matrix);
  if(collide(arena,player)) player.matrix=old;
}

function playerDrop(){
  player.pos.y++;
  if(collide(arena,player)){
    player.pos.y--;
    merge(arena,player);
    canHold=true;
    playerReset();
    arenaSweep();
  }
  dropCounter=0;
}

function hardDrop(){
  while(!collide(arena,player)) player.pos.y++;
  player.pos.y--;
  playerDrop();
}

/* ---------- ホールド ---------- */

function hold(){
  if(!canHold) return;

  if(!holdPiece){
    holdPiece=player.matrix;
    playerReset();
  }else{
    [player.matrix,holdPiece]=[holdPiece,player.matrix];
    player.pos={x:5,y:0};
  }

  canHold=false;
  drawHold();
}

/* ---------- ライン消去 ---------- */

function arenaSweep(){
  let lines=0;

  outer: for(let y=arena.length-1;y>0;y--){
    for(let x=0;x<arena[y].length;x++){
      if(arena[y][x]===0) continue outer;
    }
    arena.splice(y,1);
    arena.unshift(new Array(12).fill(0));
    y++;
    lines++;
  }

  if(lines){
    score += [0,100,300,500,800][lines];
    totalLines += lines;

    if(totalLines >= level*10){
      level++;
      dropInterval*=0.8;
      updateLevel();
    }

    updateScore();
  }
}

/* ---------- UI ---------- */

function updateScore(){
  document.getElementById("score").textContent=score;
  if(score>highScore){
    highScore=score;
    localStorage.setItem("tetrisHighScore",highScore);
  }
  document.getElementById("highscore").textContent=highScore;
}

function updateLevel(){
  document.getElementById("level").textContent=level;
}

function loadHighScore(){
  const s=localStorage.getItem("tetrisHighScore");
  if(s) highScore=parseInt(s);
}

function drawGrid() {
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 0.05;
  
    for (let x = 0; x < 12; x++) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 20);
      ctx.stroke();
    }
  
    for (let y = 0; y < 20; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(12, y);
      ctx.stroke();
    }
  }

/* ---------- 初期化 ---------- */

function playerReset(){
  player.matrix = nextPiece || randomPiece();
  nextPiece = randomPiece();
  player.pos={x:5,y:0};

  drawNext();

  if(collide(arena,player)){
    alert("ゲームオーバー");
    location.reload();
  }
}

/* ---------- ループ ---------- */

function update(time=0){
  const delta=time-lastTime;
  lastTime=time;

  dropCounter+=delta;
  if(dropCounter>dropInterval) playerDrop();

  draw();
  requestAnimationFrame(update);
}

/* ---------- 入力 ---------- */

document.addEventListener("keydown", e=>{
  if(e.key==="ArrowLeft") playerMove(-1);
  else if(e.key==="ArrowRight") playerMove(1);
  else if(e.key==="ArrowDown") playerDrop();
  else if(e.key==="ArrowUp") playerRotate();
  else if(e.key==="c") hold();
});

/* ---------- 起動 ---------- */

loadHighScore();
nextPiece=randomPiece();
playerReset();
updateScore();
updateLevel();
update();