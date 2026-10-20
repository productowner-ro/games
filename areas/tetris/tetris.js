const COLS = 10, ROWS = 20, SIZE = 30;
const COLORS = { I: '#0ff', O: '#ff0', T: '#a0f', S: '#0f0', Z: '#f00', J: '#00f', L: '#f80' };
const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
};
const LINE_POINTS = [0, 100, 300, 500, 800];

const ctx = document.getElementById('game').getContext('2d');
const nextCtx = document.getElementById('next').getContext('2d');
const holdCtx = document.getElementById('hold').getContext('2d');
const msg = document.getElementById('msg');

let board, piece, queue, bag, hold, canHold, score, lines, level, dropTimer, lastTime, paused, over;
let autoplay = false, pieceId = 0, lastStack = 0;
const botInfo = document.getElementById('bot');
Jev.mount(document.getElementById('semaphore'));

function newBag() {
  const b = Object.keys(SHAPES);
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function nextType() {
  if (bag.length === 0) bag = newBag();
  return bag.pop();
}

function makePiece(type) {
  const m = SHAPES[type].map(r => r.slice());
  return { type, m, x: Math.floor((COLS - m[0].length) / 2), y: type === 'I' ? -1 : 0 };
}

function collides(m, x, y) {
  for (let r = 0; r < m.length; r++)
    for (let c = 0; c < m[r].length; c++) {
      if (!m[r][c]) continue;
      const nx = x + c, ny = y + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  return false;
}

function rotate(m, dir) {
  const n = m.length;
  const out = Array.from({ length: n }, () => Array(n).fill(0));
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (dir > 0) out[c][n - 1 - r] = m[r][c];
      else out[n - 1 - c][r] = m[r][c];
  return out;
}

function tryRotate(dir) {
  if (piece.type === 'O') return;
  const m = rotate(piece.m, dir);
  // Simple wall kicks: try offsets in order.
  for (const [dx, dy] of [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1]]) {
    if (!collides(m, piece.x + dx, piece.y + dy)) {
      piece.m = m; piece.x += dx; piece.y += dy;
      return;
    }
  }
}

function spawn() {
  piece = makePiece(queue.shift());
  queue.push(nextType());
  canHold = true;
  pieceId++;
  if (collides(piece.m, piece.x, piece.y)) {
    over = true;
    msg.textContent = 'GAME OVER - press R';
    return;
  }
  if (autoplay) planMove();
}

function lock() {
  piece.m.forEach((row, r) => row.forEach((v, c) => {
    if (v && piece.y + r >= 0) board[piece.y + r][piece.x + c] = piece.type;
  }));
  if (piece.m.some((row, r) => row.some(v => v) && piece.y + r < 0)) {
    over = true;
    msg.textContent = 'GAME OVER - press R';
    return;
  }
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v)) {
      board.splice(r, 1);
      board.unshift(Array(COLS).fill(null));
      cleared++;
      r++;
    }
  }
  lines += cleared;
  score += LINE_POINTS[cleared] * level;
  level = Math.floor(lines / 10) + 1;
  updateStats();
  spawn();
}

function move(dx, dy) {
  if (!collides(piece.m, piece.x + dx, piece.y + dy)) {
    piece.x += dx; piece.y += dy;
    return true;
  }
  return false;
}

function softDrop() {
  if (move(0, 1)) score += 1;
  else lock();
  dropTimer = 0;
  updateStats();
}

function hardDrop() {
  let d = 0;
  while (move(0, 1)) d++;
  score += d * 2;
  lock();
  dropTimer = 0;
}

function doHold() {
  if (!canHold) return;
  const t = piece.type;
  if (hold) piece = makePiece(hold);
  else { piece = makePiece(queue.shift()); queue.push(nextType()); }
  hold = t;
  canHold = false;
}

function ghostY() {
  let y = piece.y;
  while (!collides(piece.m, piece.x, y + 1)) y++;
  return y;
}

function drawCell(c, x, y, color, size = SIZE, alpha = 1) {
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.fillRect(x * size, y * size, size, size);
  c.strokeStyle = '#000';
  c.strokeRect(x * size + 0.5, y * size + 0.5, size - 1, size - 1);
  c.globalAlpha = 1;
}

function drawMini(c, type, ox, oy) {
  const m = SHAPES[type], s = 20;
  const w = m[0].length, h = m.filter(r => r.some(v => v)).length;
  const firstRow = m.findIndex(r => r.some(v => v));
  const px = ox + (120 - w * s) / 2, py = oy + (60 - h * s) / 2;
  m.forEach((row, r) => row.forEach((v, col) => {
    if (!v) return;
    c.fillStyle = COLORS[type];
    c.fillRect(px + col * s, py + (r - firstRow) * s, s - 1, s - 1);
  }));
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, COLS * SIZE, ROWS * SIZE);
  ctx.strokeStyle = '#1a1a1a';
  for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * SIZE, 0); ctx.lineTo(x * SIZE, ROWS * SIZE); ctx.stroke(); }
  for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * SIZE); ctx.lineTo(COLS * SIZE, y * SIZE); ctx.stroke(); }

  board.forEach((row, r) => row.forEach((v, c) => { if (v) drawCell(ctx, c, r, COLORS[v]); }));

  if (autoplay) { // the edge: the bot keeps every column under this line
    ctx.strokeStyle = '#f33';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, (ROWS - EDGE_LIMIT) * SIZE);
    ctx.lineTo(COLS * SIZE, (ROWS - EDGE_LIMIT) * SIZE);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  if (!over) {
    const gy = ghostY();
    piece.m.forEach((row, r) => row.forEach((v, c) => {
      if (v && gy + r >= 0) drawCell(ctx, piece.x + c, gy + r, COLORS[piece.type], SIZE, 0.25);
    }));
    piece.m.forEach((row, r) => row.forEach((v, c) => {
      if (v && piece.y + r >= 0) drawCell(ctx, piece.x + c, piece.y + r, COLORS[piece.type]);
    }));
  }

  nextCtx.clearRect(0, 0, 120, 260);
  queue.slice(0, 4).forEach((t, i) => drawMini(nextCtx, t, 0, i * 65));
  holdCtx.clearRect(0, 0, 120, 80);
  if (hold) {
    holdCtx.globalAlpha = canHold ? 1 : 0.4;
    drawMini(holdCtx, hold, 0, 10);
    holdCtx.globalAlpha = 1;
  }
}

function updateStats() {
  document.getElementById('score').textContent = score;
  document.getElementById('lines').textContent = lines;
  document.getElementById('level').textContent = level;
}

function dropInterval() {
  return Math.max(50, 800 - (level - 1) * 70);
}

function loop(t = 0) {
  const dt = t - lastTime;
  lastTime = t;
  if (!paused && !over && !autoplay) {
    dropTimer += dt;
    if (dropTimer > dropInterval()) {
      if (!move(0, 1)) lock();
      dropTimer = 0;
    }
  }
  draw();
  requestAnimationFrame(loop);
}

function reset() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  bag = [];
  queue = [nextType(), nextType(), nextType(), nextType()];
  hold = null;
  score = 0; lines = 0; level = 1;
  dropTimer = 0; paused = false; over = false;
  msg.textContent = '';
  updateStats();
  spawn();
}

// ---------- Autoplay with Jev ----------
// Goal: play on the edge. Keep the stack as high as possible without losing.
// Code lists every reachable placement and enforces the hard height limit.
// Jev judges the danger and picks a placement for "edge" mode and "safe" mode.
// Code uses the danger judgment to choose the mode. When a Jev call fails, the bot stops: no code pick replaces Jev.

const EDGE_LIMIT = ROWS - 3;   // no column may pass this height: rows 1-3 stay free for spawn and moves
const DANGER_THRESHOLD = 0.5;  // Jev danger above this switches the bot to safe mode
const DANGER_ZONE = 4;        // Jev's danger counts only when the stack is this close to the limit
const HOLE_LIMIT = 3;         // more covered holes than this: safe mode, whatever the height
const WELL = COLS - 1;        // edge mode keeps this column open for I pieces (4-line clears)
const PER_MODE = 4;            // candidates per mode sent to Jev
const LABELS = 'ABCDEFGH';

function boardStats(b) {
  const heights = [];
  let holes = 0;
  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r < ROWS && !b[r][c]) r++;
    heights.push(ROWS - r);
    for (; r < ROWS; r++) if (!b[r][c]) holes++;
  }
  let bumpiness = 0;
  for (let c = 0; c < COLS - 1; c++) bumpiness += Math.abs(heights[c] - heights[c + 1]);
  return { heights, holes, bumpiness, aggHeight: heights.reduce((a, h) => a + h, 0), maxHeight: Math.max(...heights) };
}

function boardText(b) {
  return b.map(row => row.map(v => (v ? '#' : '.')).join('')).join('\n');
}

function reachable(m, rot, x) {
  // The executor turns the piece at spawn, then slides it along the spawn row.
  let cur = piece.m;
  for (let i = 0; i < rot; i++) {
    cur = rotate(cur, 1);
    if (collides(cur, piece.x, piece.y)) return false;
  }
  for (let cx = piece.x; cx !== x; cx += Math.sign(x - piece.x))
    if (collides(m, cx + Math.sign(x - piece.x), piece.y)) return false;
  return true;
}

function candidatePlacements() {
  const before = boardStats(board);
  const out = [];
  const seen = new Set();
  let m = piece.m;
  for (let rot = 0; rot < 4; rot++) {
    for (let x = -3; x < COLS; x++) {
      if (collides(m, x, piece.y) || !reachable(m, rot, x)) continue;
      let y = piece.y;
      while (!collides(m, x, y + 1)) y++;
      const b = board.map(r => r.slice());
      let above = false;
      m.forEach((row, r) => row.forEach((v, c) => {
        if (!v) return;
        if (y + r < 0) above = true;
        else b[y + r][x + c] = piece.type;
      }));
      if (above) continue;
      const kept = b.filter(row => !row.every(v => v));
      const cleared = ROWS - kept.length;
      const after = Array.from({ length: cleared }, () => Array(COLS).fill(null)).concat(kept);
      const key = boardText(after);
      if (seen.has(key)) continue;
      seen.add(key);
      const s = boardStats(after);
      const fillsWell = m.some((row, r) => row.some((v, c) => v && x + c === WELL));
      const stack = s.heights.slice(0, WELL); // the columns outside the well
      let stackBump = 0;
      for (let c = 0; c < WELL - 1; c++) stackBump += Math.abs(stack[c] - stack[c + 1]);
      const newHoles = Math.max(0, s.holes - before.holes);
      out.push({ fillsWell,
        rot, x, m, cleared, newHoles, ...s, board: key,
        withinLimit: s.maxHeight <= EDGE_LIMIT,
        // edge: build the 9 stack columns high, flat and without holes; keep the well open;
        // clear lines only 4 at a time with an I piece in the well
        edge: 0.3 * stack.reduce((a, h) => a + h, 0) - 4 * newHoles - 1 * s.holes - 0.35 * stackBump
          - (fillsWell && cleared < 4 ? 3 : 0) + (cleared === 4 ? 6 : -0.5 * cleared),
        // safe: the classic survival heuristic, brings the stack down
        safe: -0.51 * s.aggHeight + 0.76 * cleared - 0.36 * s.holes - 0.18 * s.bumpiness,
      });
    }
    m = rotate(m, 1);
  }
  const legal = out.filter(c => c.withinLimit);
  const pool = legal.length ? legal : out; // nothing fits under the limit: all options stay open
  const top = key => [...pool].sort((a, b) => b[key] - a[key]).slice(0, PER_MODE);
  const edgeTop = top('edge'), safeTop = top('safe');
  const union = [...new Set([...edgeTop, ...safeTop])];
  return { union, edgeTop, safeTop, overLimit: legal.length === 0 };
}

async function askJev(cands) {
  const candidates = {};
  const criteria = {};
  cands.forEach((c, i) => {
    const id = LABELS[i];
    candidates[id] = {
      lines_cleared: c.cleared,
      new_holes_created: c.newHoles,
      fills_the_well: c.fillsWell,
      total_holes: c.holes,
      max_column_height: c.maxHeight,
      bumpiness: c.bumpiness,
      board_after: c.board,
    };
    criteria[id] = `Place the piece as in \`candidates.${id}\`.`;
  });
  const answers = await Jev.call({
    model: 'jev-latest',
    state: {
      game: 'Tetris, 10 columns x 20 rows. In boards, row 1 is the top, "#" is a filled cell, "." is empty. '
        + 'New pieces appear in rows 1-2, columns 4-7. The game is lost when a new piece cannot appear.',
      height_limit: `No column may be taller than ${EDGE_LIMIT} cells. The top ${ROWS - EDGE_LIMIT} rows must stay empty.`,
      well: `Column ${WELL + 1} (the rightmost) is the well. In edge play it stays empty until an I piece drops into it and clears 4 lines.`,
      stack_height_now: boardStats(board).maxHeight,
      covered_holes_now: boardStats(board).holes,
      rows_left_before_limit: EDGE_LIMIT - boardStats(board).maxHeight,
      current_piece: piece.type,
      next_pieces: queue.slice(0, 3),
      board_now: boardText(board),
      candidates,
    },
    questions: {
      danger: {
        type: 'noul',
        instructions: 'Look at `board_now`, `current_piece` and `next_pieces`. '
          + 'If the player keeps stacking higher, will the stack likely pass `height_limit` or lose the game '
          + 'within the next 3 pieces, because no piece placement clears a line?',
        criteria: {
          true: 'The stack is in real danger: holes or an uneven top block line clears, and the next pieces do not fit.',
          false: 'The player can still build higher safely: open lines can be completed with the coming pieces.',
        },
      },
      edge_pick: {
        type: 'choice',
        instructions: 'The player wants to play on the edge: keep the stack as close to `height_limit` as possible '
          + 'without losing. Pick the placement that builds the stack higher and flat, creates no covered holes, '
          + 'and keeps `well` empty, unless the piece is an I that drops into `well` and clears 4 lines.',
        criteria,
      },
      safe_pick: {
        type: 'choice',
        instructions: 'The stack is in danger. Pick the placement that best lowers the risk right now: '
          + 'clear lines, open covered holes, and bring the stack down.',
        criteria,
      },
    },
  });
  return {
    danger: answers.danger.noul,
    edge: { index: LABELS.indexOf(answers.edge_pick.choice), confidence: answers.edge_pick.confidence },
    safe: { index: LABELS.indexOf(answers.safe_pick.choice), confidence: answers.safe_pick.confidence },
  };
}

async function planMove() {
  const id = pieceId;
  const { union, edgeTop, safeTop, overLimit } = candidatePlacements();
  if (union.length === 0) return hardDrop();
  let target, info;
  try {
    botInfo.textContent = 'Jev thinks…';
    const t0 = performance.now();
    const r = await askJev(union);
    const now = boardStats(board);
    const nearEdge = now.maxHeight >= EDGE_LIMIT - DANGER_ZONE;
    const tooManyHoles = now.holes > HOLE_LIMIT;
    const mode = overLimit || tooManyHoles || (nearEdge && r.danger > DANGER_THRESHOLD) ? 'safe' : 'edge';
    const pick = r[mode];
    target = union[pick.index];
    if (!target) throw new Error(`Jev named an unknown placement: ${pick.index}`);
    const why = overLimit ? ' (no move fits under the limit)' : tooManyHoles ? ` (${now.holes} holes)` : '';
    info = `Mode ${mode.toUpperCase()}${why}. `
      + `Danger ${r.danger.toFixed(2)}. Pick ${LABELS[union.indexOf(target)]} of ${union.length} `
      + `(confidence ${pick.confidence.toFixed(2)}). Stack ${target.maxHeight}/${EDGE_LIMIT}. `
      + `${Math.round(performance.now() - t0)} ms.`;
  } catch (e) {
    // No code pick replaces Jev: past the daily cap or after a failed call, the bot stops.
    // Autoplay on is the retry.
    autoplay = false;
    botInfo.textContent = e.dailyCap
      ? 'Jev rests until 00:00 UTC. Autoplay off.'
      : location.protocol === 'file:'
        ? 'Jev needs the Worker: run docker compose up dev and open http://localhost:8787/tetris/. Autoplay off.'
        : `Jev failed (${e.message}). Autoplay off. Turn autoplay on to try again.`;
    return;
  }
  if (id !== pieceId || !autoplay || over) return; // the piece changed while we waited
  botInfo.textContent = info;
  lastStack = target.maxHeight;
  await executePlacement(target, id);
}

function executePlacement(target, id) {
  return new Promise(resolve => {
    let rotations = target.rot;
    const step = () => {
      if (id !== pieceId || !autoplay || over) return resolve();
      if (paused) return setTimeout(step, 100);
      if (rotations > 0) {
        tryRotate(1); // wall kicks may shift x; the move step below corrects it
        rotations--;
      } else if (piece.x !== target.x && move(Math.sign(target.x - piece.x), 0)) {
        // moved one column toward the target
      } else {
        // at the target, or the path is blocked: drop where the piece is
        hardDrop();
        return resolve();
      }
      setTimeout(step, 40);
    };
    step();
  });
}

function toggleAutoplay() {
  autoplay = !autoplay;
  botInfo.textContent = autoplay ? 'Autoplay on.' : 'Autoplay off.';
  dropTimer = 0;
  if (autoplay && !over) { pieceId++; planMove(); }
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyR') { reset(); return; }
  if (e.code === 'KeyA') { toggleAutoplay(); return; }
  if (e.code === 'KeyP') {
    if (over) return;
    paused = !paused;
    msg.textContent = paused ? 'PAUSED' : '';
    return;
  }
  if (paused || over || autoplay) return;
  switch (e.code) {
    case 'ArrowLeft': move(-1, 0); break;
    case 'ArrowRight': move(1, 0); break;
    case 'ArrowDown': softDrop(); break;
    case 'ArrowUp': case 'KeyX': tryRotate(1); break;
    case 'KeyZ': tryRotate(-1); break;
    case 'Space': hardDrop(); break;
    case 'KeyC': case 'ShiftLeft': case 'ShiftRight': doHold(); break;
    default: return;
  }
  e.preventDefault();
});

reset();
lastTime = performance.now();
requestAnimationFrame(loop);
