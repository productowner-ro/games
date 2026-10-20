const SIZE = 70;
const FILES = 'abcdefgh';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// U+FE0E asks for the text glyph: without it, macOS may draw the pawn as a color emoji.
const GLYPHS = { k: '♚︎', q: '♛︎', r: '♜︎', b: '♝︎', n: '♞︎', p: '♟︎' };
const OUTLINES = { k: '♔︎', q: '♕︎', r: '♖︎', b: '♗︎', n: '♘︎', p: '♙︎' };
const LIGHT = '#eed7b5', DARK = '#b48764';

// ---------- Rules engine ----------
// The board is an array of 64 squares. Index 0 is a8, index 63 is h1.
// A piece is one letter: uppercase is white, lowercase is black. An empty square is null.

const KNIGHT = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const KING = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const DIAG = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ORTHO = [[-1,0],[1,0],[0,-1],[0,1]];

const colorOf = p => (p === p.toUpperCase() ? 'w' : 'b');
const other = c => (c === 'w' ? 'b' : 'w');
const sqName = i => FILES[i % 8] + (8 - Math.floor(i / 8));
const sqIndex = n => (8 - Number(n[1])) * 8 + FILES.indexOf(n[0]);
const onBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

function parseFEN(fen) {
  const [placement, turn, castling, ep, half, full] = fen.split(' ');
  const board = [];
  for (const ch of placement.replace(/\//g, '')) {
    if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) board.push(null);
    else board.push(ch);
  }
  return { board, turn, castling: castling === '-' ? '' : castling,
    ep: ep === '-' ? null : sqIndex(ep), half: Number(half || 0), full: Number(full || 1) };
}

function toFEN(s) {
  let out = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = s.board[r * 8 + c];
      if (!p) { empty++; continue; }
      if (empty) { out += empty; empty = 0; }
      out += p;
    }
    if (empty) out += empty;
    if (r < 7) out += '/';
  }
  return `${out} ${s.turn} ${s.castling || '-'} ${s.ep === null ? '-' : sqName(s.ep)} ${s.half} ${s.full}`;
}

// Is square `sq` attacked by a piece of color `by`?
function attacked(board, sq, by) {
  const r = Math.floor(sq / 8), c = sq % 8;
  const is = (rr, cc, types) => {
    if (!onBoard(rr, cc)) return false;
    const p = board[rr * 8 + cc];
    return p && colorOf(p) === by && types.includes(p.toLowerCase());
  };
  const pr = by === 'w' ? r + 1 : r - 1; // an attacking pawn stands one row behind the square
  if (is(pr, c - 1, 'p') || is(pr, c + 1, 'p')) return true;
  if (KNIGHT.some(([dr, dc]) => is(r + dr, c + dc, 'n'))) return true;
  if (KING.some(([dr, dc]) => is(r + dr, c + dc, 'k'))) return true;
  const ray = (dirs, types) => dirs.some(([dr, dc]) => {
    for (let rr = r + dr, cc = c + dc; onBoard(rr, cc); rr += dr, cc += dc) {
      const p = board[rr * 8 + cc];
      if (p) return colorOf(p) === by && types.includes(p.toLowerCase());
    }
    return false;
  });
  return ray(DIAG, 'bq') || ray(ORTHO, 'rq');
}

function inCheck(s, color) {
  const king = s.board.indexOf(color === 'w' ? 'K' : 'k');
  return attacked(s.board, king, other(color));
}

function pseudoMoves(s) {
  const moves = [];
  const b = s.board, me = s.turn;
  const add = (from, to, extra = {}) => moves.push({ from, to, piece: b[from], capture: b[to], ...extra });
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || colorOf(p) !== me) continue;
    const r = Math.floor(i / 8), c = i % 8, t = p.toLowerCase();
    if (t === 'p') {
      const dir = me === 'w' ? -1 : 1, startRow = me === 'w' ? 6 : 1, lastRow = me === 'w' ? 0 : 7;
      const addPawn = (to, extra = {}) => {
        if (Math.floor(to / 8) === lastRow) for (const promo of 'qrbn') add(i, to, { ...extra, promo });
        else add(i, to, extra);
      };
      const one = (r + dir) * 8 + c;
      if (!b[one]) {
        addPawn(one);
        const two = (r + 2 * dir) * 8 + c;
        if (r === startRow && !b[two]) add(i, two, { double: true });
      }
      for (const dc of [-1, 1]) {
        if (!onBoard(r + dir, c + dc)) continue;
        const to = (r + dir) * 8 + c + dc;
        if (b[to] && colorOf(b[to]) !== me) addPawn(to);
        else if (to === s.ep) add(i, to, { ep: true, capture: me === 'w' ? 'p' : 'P' });
      }
    } else if (t === 'n' || t === 'k') {
      for (const [dr, dc] of t === 'n' ? KNIGHT : KING) {
        if (!onBoard(r + dr, c + dc)) continue;
        const to = (r + dr) * 8 + c + dc;
        if (!b[to] || colorOf(b[to]) !== me) add(i, to);
      }
    } else {
      const dirs = t === 'b' ? DIAG : t === 'r' ? ORTHO : DIAG.concat(ORTHO);
      for (const [dr, dc] of dirs) {
        for (let rr = r + dr, cc = c + dc; onBoard(rr, cc); rr += dr, cc += dc) {
          const to = rr * 8 + cc;
          if (b[to]) { if (colorOf(b[to]) !== me) add(i, to); break; }
          add(i, to);
        }
      }
    }
  }
  // Castling: the king may not start in, pass through, or land in check.
  const them = other(me);
  const castle = (right, king, path, safe, to) => {
    if (!s.castling.includes(right) || b[king] !== (me === 'w' ? 'K' : 'k')) return;
    if (path.some(q => b[q]) || safe.some(q => attacked(b, q, them))) return;
    add(king, to, { castle: right });
  };
  if (me === 'w') {
    castle('K', 60, [61, 62], [60, 61, 62], 62);
    castle('Q', 60, [57, 58, 59], [60, 59, 58], 58);
  } else {
    castle('k', 4, [5, 6], [4, 5, 6], 6);
    castle('q', 4, [1, 2, 3], [4, 3, 2], 2);
  }
  return moves;
}

const ROOK_CASTLE = { K: [63, 61], Q: [56, 59], k: [7, 5], q: [0, 3] };
const CORNER_RIGHT = { 63: 'K', 56: 'Q', 7: 'k', 0: 'q' };

function makeMove(s, m) {
  const b = s.board.slice();
  const white = s.turn === 'w';
  b[m.to] = m.promo ? (white ? m.promo.toUpperCase() : m.promo) : b[m.from];
  b[m.from] = null;
  if (m.ep) b[m.to + (white ? 8 : -8)] = null;
  if (m.castle) { const [rf, rt] = ROOK_CASTLE[m.castle]; b[rt] = b[rf]; b[rf] = null; }
  let castling = s.castling;
  if (m.piece === 'K') castling = castling.replace(/[KQ]/g, '');
  if (m.piece === 'k') castling = castling.replace(/[kq]/g, '');
  for (const sq of [m.from, m.to]) if (CORNER_RIGHT[sq]) castling = castling.replace(CORNER_RIGHT[sq], '');
  const pawn = m.piece.toLowerCase() === 'p';
  return {
    board: b, turn: other(s.turn), castling,
    ep: m.double ? (m.from + m.to) / 2 : null,
    half: pawn || m.capture ? 0 : s.half + 1,
    full: white ? s.full : s.full + 1,
  };
}

function legalMoves(s) {
  return pseudoMoves(s).filter(m => !inCheck(makeMove(s, m), s.turn));
}

function san(s, m, legal = legalMoves(s)) {
  let out;
  if (m.castle) out = 'Kk'.includes(m.castle) ? 'O-O' : 'O-O-O';
  else {
    const t = m.piece.toLowerCase();
    if (t === 'p') {
      out = (m.capture ? FILES[m.from % 8] + 'x' : '') + sqName(m.to) + (m.promo ? '=' + m.promo.toUpperCase() : '');
    } else {
      const rivals = legal.filter(o => o.piece === m.piece && o.to === m.to && o.from !== m.from);
      let dis = '';
      if (rivals.length) {
        const sameFile = rivals.some(o => o.from % 8 === m.from % 8);
        const sameRank = rivals.some(o => Math.floor(o.from / 8) === Math.floor(m.from / 8));
        if (!sameFile) dis = FILES[m.from % 8];
        else if (!sameRank) dis = sqName(m.from)[1];
        else dis = sqName(m.from);
      }
      out = t.toUpperCase() + dis + (m.capture ? 'x' : '') + sqName(m.to);
    }
  }
  const next = makeMove(s, m);
  if (inCheck(next, next.turn)) out += legalMoves(next).length ? '+' : '#';
  return out;
}

// Same position for the threefold rule: pieces, side to move, castling rights, en passant square.
const positionKey = s => toFEN(s).split(' ').slice(0, 4).join(' ');

function insufficientMaterial(s) {
  const rest = s.board.filter(p => p && p.toLowerCase() !== 'k');
  if (rest.length === 0) return true;
  if (rest.length === 1 && 'nb'.includes(rest[0].toLowerCase())) return true;
  if (rest.every(p => p.toLowerCase() === 'b')) { // only bishops, all on one square color
    const colors = new Set();
    s.board.forEach((p, i) => { if (p && p.toLowerCase() === 'b') colors.add((Math.floor(i / 8) + i % 8) % 2); });
    return colors.size === 1;
  }
  return false;
}

// Returns { over, result, reason }. result is '1-0', '0-1' or '1/2-1/2'.
function gameStatus(s, history) {
  const legal = legalMoves(s);
  if (legal.length === 0) {
    if (inCheck(s, s.turn)) return { over: true, result: s.turn === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
    return { over: true, result: '1/2-1/2', reason: 'stalemate' };
  }
  if (s.half >= 100) return { over: true, result: '1/2-1/2', reason: '50-move rule' };
  const key = positionKey(s);
  if (history.filter(h => positionKey(h.state) === key).length >= 2)
    return { over: true, result: '1/2-1/2', reason: 'threefold repetition' };
  if (insufficientMaterial(s)) return { over: true, result: '1/2-1/2', reason: 'insufficient material' };
  return { over: false };
}

// ---------- Game ----------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const msg = document.getElementById('msg');
const promoBox = document.getElementById('promo');

// history holds every earlier position with the move played from it: [{ state, move, san }]
let state, history, selected, targets, pendingPromo, flipped, status;
let logId, logStarted; // names the current game in the log; the header goes out with the first move

// The game log: one line per move, tab-separated:
//   no move src plan planP drawnP conf adv advBR flags top3
//   no: the move number as the UI shows it: "38." is White's move 38, "38..." is Black's reply
//   src: j=Jev, m=code played mate, o=code played the only safe move, h=human click
//   plan: dev=develop, mat=win material, atk=attack king, mate=mate weak king, draw=hold draw
//   planP: probability of the chosen plan. drawnP: probability of the drawn move. conf: Jev's move confidence
//   adv: mover's material lead before the move. advBR: lead after the opponent's best capture reply
//   flags: R=repeats a position, D=draws by repetition, S=stalemates, -=none
//   top3: Jev's top moves as move:p:advBR
// "# game <id>" starts a game, "# undo" takes one move back, "# end <result> <reason> after move <no>" ends it.
// GameLog (areas/log.js) keeps the lines in page memory and pushes them to /api/log (issue #12).
function logLine(line) {
  GameLog.write(line);
}

// One PostHog event (areas/analytics.js, issue #13). The headless tests load no analytics.js.
const track = (event, props) => { if (typeof Analytics !== 'undefined') Analytics.track(event, props); };

function reset() {
  state = parseFEN(START_FEN);
  history = [];
  selected = null; targets = []; pendingPromo = null;
  status = { over: false };
  msg.textContent = '';
  gameId++;
  logId = GameLog.start('chess');
  logStarted = false;
  for (const c of 'wb') document.getElementById(`bot-${c}`).textContent = '';
  updateSide();
  scheduleBot();
}

// `bot` holds the log columns for how a bot chose the move; a click move has none.
function play(m, bot = null) {
  const move = san(state, m);
  if (!logStarted) { logLine(`# game ${logId}`); logStarted = true; track('game_started'); }
  const b = bot || { src: 'h' };
  const no = state.turn === 'w' ? `${state.full}.` : `${state.full}...`; // the move number the UI shows
  logLine([no, move, b.src, b.plan, b.planP, b.drawnP, b.conf, b.adv, b.advBR, b.flags, b.top]);
  history.push({ state, move: m, san: move });
  state = makeMove(state, m);
  selected = null; targets = []; pendingPromo = null;
  status = gameStatus(state, history);
  if (status.over) {
    logLine(`# end ${status.result} ${status.reason} after move ${no.replace(/\.+$/, '')}`);
    track('game_over', { result: status.result, moves: history.length });
  }
  msg.textContent = status.over ? `${status.result} - ${status.reason}` : '';
  updateSide();
  scheduleBot();
}

function undo() {
  if (!history.length) return;
  state = history.pop().state;
  logLine('# undo');
  selected = null; targets = []; pendingPromo = null;
  status = gameStatus(state, history);
  msg.textContent = '';
  gameId++;
  updateSide();
  scheduleBot();
}

function updateSide() {
  document.getElementById('turn').textContent = state.turn === 'w' ? 'White' : 'Black';
  document.getElementById('status').textContent = status.over
    ? `Game over: ${status.reason}. Result ${status.result}. Press R.`
    : inCheck(state, state.turn) ? 'Check!' : 'Game on.';
  const rows = [];
  for (let i = 0; i < history.length; i += 2) {
    rows.push(`<span class="n">${i / 2 + 1}.</span><span class="m">${history[i].san}</span>`
      + `<span class="m">${history[i + 1] ? history[i + 1].san : ''}</span>`);
  }
  const moves = document.getElementById('moves');
  moves.innerHTML = rows.join('<br>');
  moves.scrollTop = moves.scrollHeight;
  document.getElementById('promo-wrap').style.display = pendingPromo ? 'block' : 'none';
  promoBox.style.display = pendingPromo ? 'flex' : 'none';
  promoBox.innerHTML = '';
  if (pendingPromo) {
    for (const promo of 'qrbn') {
      const btn = document.createElement('button');
      btn.textContent = GLYPHS[promo];
      btn.onclick = () => play(pendingPromo.find(m => m.promo === promo));
      promoBox.appendChild(btn);
    }
  }
}

// Screen cell (row, col) to board index, with the board flipped for black's view.
const toIndex = (row, col) => (flipped ? (7 - row) * 8 + (7 - col) : row * 8 + col);
const toCell = i => (flipped ? [7 - Math.floor(i / 8), 7 - (i % 8)] : [Math.floor(i / 8), i % 8]);

function onClick(e) {
  if (status.over || autoplay) return;
  const col = Math.floor(e.offsetX / SIZE), row = Math.floor(e.offsetY / SIZE); // offsetX starts inside the border
  if (!onBoard(row, col)) return;
  const i = toIndex(row, col);
  const hits = targets.filter(m => m.to === i);
  if (hits.length > 1) { pendingPromo = hits; updateSide(); return; } // the 4 promotion moves
  if (hits.length === 1) { play(hits[0]); return; }
  const p = state.board[i];
  pendingPromo = null;
  if (p && colorOf(p) === state.turn && selected !== i) {
    selected = i;
    targets = legalMoves(state).filter(m => m.from === i);
  } else {
    selected = null; targets = [];
  }
  updateSide();
}

function draw() {
  const last = history.length ? history[history.length - 1].move : null;
  const checked = inCheck(state, state.turn) ? state.board.indexOf(state.turn === 'w' ? 'K' : 'k') : -1;
  for (let i = 0; i < 64; i++) {
    const [row, col] = toCell(i);
    const x = col * SIZE, y = row * SIZE;
    ctx.fillStyle = (Math.floor(i / 8) + i % 8) % 2 ? DARK : LIGHT;
    ctx.fillRect(x, y, SIZE, SIZE);
    if (last && (i === last.from || i === last.to)) { ctx.fillStyle = 'rgba(255,230,0,0.35)'; ctx.fillRect(x, y, SIZE, SIZE); }
    if (i === selected) { ctx.fillStyle = 'rgba(0,160,255,0.45)'; ctx.fillRect(x, y, SIZE, SIZE); }
    if (i === checked) { ctx.fillStyle = 'rgba(255,0,0,0.55)'; ctx.fillRect(x, y, SIZE, SIZE); }
    const p = state.board[i];
    if (p) {
      ctx.font = `${SIZE * 0.8}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // The solid glyph gives the body color; the outline glyph on top draws the black lines.
      ctx.fillStyle = colorOf(p) === 'w' ? '#fff' : '#000';
      ctx.fillText(GLYPHS[p.toLowerCase()], x + SIZE / 2, y + SIZE / 2 + 4);
      ctx.fillStyle = '#000';
      ctx.fillText(OUTLINES[p.toLowerCase()], x + SIZE / 2, y + SIZE / 2 + 4);
    }
    if (targets.some(m => m.to === i)) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      if (p) { ctx.arc(x + SIZE / 2, y + SIZE / 2, SIZE / 2 - 3, 0, Math.PI * 2); ctx.arc(x + SIZE / 2, y + SIZE / 2, SIZE / 2 - 9, 0, Math.PI * 2, true); }
      else ctx.arc(x + SIZE / 2, y + SIZE / 2, SIZE / 8, 0, Math.PI * 2);
      ctx.fill();
    }
    // Coordinates along the left and bottom edges.
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = (Math.floor(i / 8) + i % 8) % 2 ? LIGHT : DARK;
    if (col === 0) ctx.fillText(sqName(i)[1], x + 3, y + 13);
    if (row === 7) ctx.fillText(sqName(i)[0], x + SIZE - 10, y + SIZE - 4);
  }
}

function loop() {
  draw();
  requestAnimationFrame(loop);
}

// ---------- Autoplay with Jev ----------
// Two Jev bots play each other. Each bot has its own style.
// Code lists every legal move and computes one-move facts for it (captures, checks, safety).
// Code enforces two hard rules: play a checkmate when one exists, never allow mate in one.
// In one request, Jev picks a plan for the position and a move for every plan.
// Code plays the move of the plan Jev picked. When a Jev call fails, the bots stop: no code pick replaces Jev.

const BOTS = {
  w: { name: 'Attacker', style: 'You play sharp, attacking chess. You prefer checks, captures and moves '
    + 'that bring pieces toward the enemy king, as long as they do not give away material.' },
  b: { name: 'Solid', style: 'You play solid, positional chess. You prefer safe development, castling early, '
    + 'and a healthy pawn structure. You take material only when it is safe.' },
};
const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const BOT_DELAY = 400; // ms between moves, so the viewer can follow the game

// The plans Jev chooses from. Each plan gets its own move question.
const PLANS = {
  develop: {
    when: 'The opening or a quiet middlegame: pieces still need to come out, the king needs to castle.',
    how: 'Develop a piece, castle, or take control of the center.',
  },
  win_material: {
    when: 'An opponent piece can be taken safely, or a trade leaves you ahead in material.',
    how: 'Pick the move with the highest `advantage_after_best_reply`.',
  },
  attack_king: {
    when: 'The enemy king is exposed, and your pieces can reach it with checks and threats.',
    how: 'Bring pieces toward the enemy king and give checks that do not lose material.',
  },
  mate_weak_king: {
    when: 'You are far ahead in material and the opponent has few pieces left.',
    how: 'Do not give aimless checks. Pick the move with the lowest `enemy_king_squares`, and bring your king '
      + 'closer (lower `king_distance`), so that the enemy king is pushed to the edge and mated.',
  },
  hold_draw: {
    when: 'You are behind in material and have no real winning chances.',
    how: 'Trade pieces, repeat the position, or keep your king safe to save a draw.',
  },
};

// The bot draws its move from Jev's probabilities, so no two games are the same.
// Below 1, the draw favors Jev's top moves more; at 1, it follows the probabilities exactly.
const TEMPERATURE = 0.5;

const PLAN_CODES = { develop: 'dev', win_material: 'mat', attack_king: 'atk', mate_weak_king: 'mate', hold_draw: 'draw' };
const p2 = x => x.toFixed(2).replace(/^0\./, '.'); // 0.46 -> .46, for the log

let autoplay = false, gameId = 0, botTimer = null, lastPick = null;

function sampleKey(probabilities) {
  const weights = Object.entries(probabilities).map(([k, p]) => [k, Math.pow(p, 1 / TEMPERATURE)]);
  let r = Math.random() * weights.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of weights) if ((r -= w) <= 0) return k;
  return weights[weights.length - 1][0];
}

const uci = m => sqName(m.from) + sqName(m.to) + (m.promo || '');

function material(board) {
  const sum = { w: 0, b: 0 };
  board.forEach(p => { if (p) sum[colorOf(p)] += VALUES[p.toLowerCase()]; });
  return sum;
}

function boardText(board) {
  const rows = [];
  for (let r = 0; r < 8; r++) rows.push(`${8 - r} ${board.slice(r * 8, r * 8 + 8).map(p => p || '.').join('')}`);
  return rows.concat('  abcdefgh').join('\n');
}

// The facts code knows about one move, one move deep.
function describe(s, m) {
  const me = s.turn, them = other(me);
  const next = makeMove(s, m);
  const replies = legalMoves(next);
  const check = inCheck(next, them);
  const t = m.piece.toLowerCase();
  const mat = material(next.board);
  const advantage = mat[me] - mat[them];
  // The opponent's best capture, net of your recapture: when you can take back on that square,
  // the opponent also loses the capturing piece. Deeper exchanges are not counted.
  const bestGrab = Math.max(0, ...replies.filter(r => r.capture || r.promo).map(r => {
    const gain = (r.capture ? VALUES[r.capture.toLowerCase()] : 0) + (r.promo ? VALUES[r.promo] - 1 : 0);
    const retake = attacked(makeMove(next, r).board, r.to, me) ? VALUES[(r.promo || r.piece).toLowerCase()] : 0;
    return gain - retake;
  }));
  const myKing = next.board.indexOf(me === 'w' ? 'K' : 'k');
  const theirKing = next.board.indexOf(them === 'w' ? 'K' : 'k');
  const key = positionKey(next);
  const seen = history.map(h => h.state).concat(s).filter(p => positionKey(p) === key).length;
  return {
    move: san(s, m),
    piece: NAMES[t],
    captures: m.capture ? NAMES[m.capture.toLowerCase()] : 'nothing',
    gives_check: check,
    is_checkmate: check && replies.length === 0,
    causes_stalemate: !check && replies.length === 0,
    promotes_to: m.promo ? NAMES[m.promo] : 'nothing',
    castles: Boolean(m.castle),
    lets_opponent_mate_next_move: replies.some(r => {
      const n2 = makeMove(next, r);
      return inCheck(n2, n2.turn) && legalMoves(n2).length === 0;
    }),
    // Material: your points minus the opponent's points (pawn 1, knight 3, bishop 3, rook 5, queen 9).
    advantage_after_move: advantage,
    advantage_after_best_reply: advantage - bestGrab,
    // How many squares the enemy king can move to after this move. Fewer squares: closer to mate.
    enemy_king_squares: replies.filter(r => r.piece.toLowerCase() === 'k').length,
    // Squares between the two kings, counted as a king walks.
    king_distance: Math.max(Math.abs(Math.floor(myKing / 8) - Math.floor(theirKing / 8)),
      Math.abs(myKing % 8 - theirKing % 8)),
    // The position after this move was on the board before. The third time ends the game in a draw.
    repeats_position: seen > 0,
    draws_by_repetition: seen >= 2,
  };
}

async function askJev(bot, s, cands) {
  const candidates = {}, criteria = {};
  const color = s.turn === 'w' ? 'White' : 'Black';
  cands.forEach(c => {
    candidates[c.key] = c.facts;
    criteria[c.key] = `Play ${c.facts.move}, as in \`candidates.${c.key}\`.`;
  });
  const mat = material(s.board);
  const planCriteria = {};
  const questions = { plan: {
    type: 'choice',
    instructions: `You play ${color} in \`your_style\`. Look at \`board\`, \`advantage_now\` and \`recent_moves\`. `
      + 'Which plan fits this position best right now?',
    criteria: planCriteria,
  } };
  for (const [id, plan] of Object.entries(PLANS)) {
    planCriteria[id] = plan.when;
    questions[`move_${id}`] = {
      type: 'choice',
      instructions: `You play ${color} in \`your_style\`, and your plan is: ${plan.when} ${plan.how} `
        + 'Pick the best move from `candidates` for this plan. Losing material ruins every plan: '
        + 'avoid a move whose `advantage_after_best_reply` is lower than `advantage_now`, '
        + 'unless no other move keeps the material. When you are ahead, avoid `causes_stalemate`, '
        + '`draws_by_repetition` and `repeats_position`: a draw throws away your win.',
      criteria,
    };
  }
  const answers = await Jev.call({
    model: 'jev-latest',
    state: {
      game: 'Chess. In `board`, rank 8 is the top row. Uppercase letters are white pieces, '
        + 'lowercase are black: K king, Q queen, R rook, B bishop, N knight, P pawn. "." is an empty square.',
      you_play: color,
      your_style: bot.style,
      fen: toFEN(s),
      board: boardText(s.board),
      you_are_in_check: inCheck(s, s.turn),
      material_now: `you ${mat[s.turn]}, opponent ${mat[other(s.turn)]}`,
      advantage_now: mat[s.turn] - mat[other(s.turn)],
      recent_moves: history.slice(-10).map(h => h.san).join(' ') || 'none, the game just started',
      candidates,
    },
    questions,
  });
  return { plan: answers.plan, move: answers[`move_${answers.plan.choice}`] };
}

async function botMove() {
  if (!autoplay || status.over) return;
  const id = gameId, s = state, bot = BOTS[s.turn];
  const box = document.getElementById(`bot-${s.turn}`);
  const cands = legalMoves(s).map(m => ({ m, key: uci(m), facts: describe(s, m) }));
  const mate = cands.find(c => c.facts.is_checkmate);
  const safe = cands.filter(c => !c.facts.lets_opponent_mate_next_move);
  const pool = safe.length ? safe : cands; // every move allows mate: all options stay open
  let pick, info, plan = null;
  const detail = {}; // the log columns, see the legend above logLine
  if (mate) {
    pick = mate;
    info = 'Code found checkmate.';
    detail.src = 'm';
  } else if (pool.length === 1) {
    pick = pool[0];
    info = 'Only one safe move.';
    detail.src = 'o';
  } else {
    try {
      box.textContent = `${bot.name} thinks…`;
      const t0 = performance.now();
      const { plan: p, move: r } = await askJev(bot, s, pool);
      plan = p.choice;
      const key = sampleKey(r.probabilities);
      pick = pool.find(c => c.key === key);
      if (!pick) throw new Error(`Jev named an unknown move: ${key}`);
      Object.assign(detail, {
        src: 'j',
        plan: PLAN_CODES[plan],
        planP: p2(p.probabilities[plan]),
        drawnP: p2(r.probabilities[pick.key] || 0),
        conf: p2(r.confidence),
        top: Object.entries(r.probabilities).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, pr]) => {
          const f = pool.find(c => c.key === k)?.facts;
          return `${f ? f.move : k}:${p2(pr)}:${f ? f.advantage_after_best_reply : '?'}`;
        }).join(' '),
      });
      const top = Object.entries(r.probabilities).sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([k, pr]) => `${pool.find(c => c.key === k)?.facts.move || k} ${pr.toFixed(2)}`).join(', ');
      info = `Plan ${plan.replace(/_/g, ' ')} (confidence ${p.confidence.toFixed(2)}). `
        + `Drew ${pick.facts.move} (p ${(r.probabilities[pick.key] || 0).toFixed(2)}). `
        + `Move confidence ${r.confidence.toFixed(2)} of ${pool.length} moves. Top: ${top}. `
        + `${Math.round(performance.now() - t0)} ms.`;
    } catch (e) {
      // No code pick replaces Jev: past the daily cap or after a failed call, the bots stop.
      // Autoplay on is the retry.
      autoplay = false;
      if (e.dailyCap) track('jev_rested');
      else track('jev_failed', { error: e.message });
      box.textContent = '';
      document.getElementById('bot-status').textContent = e.dailyCap
        ? 'Jev rests until 00:00 UTC. Autoplay off.'
        : location.protocol === 'file:'
          ? 'Jev needs the Worker: run docker compose up dev and open http://localhost:8787/chess/. Autoplay off.'
          : `Jev failed (${e.message}). Autoplay off. Turn autoplay on to try again.`;
      return;
    }
  }
  if (id !== gameId || !autoplay) return; // the game changed while we waited
  box.textContent = `${bot.name}: ${pick.facts.move}. ${info}`;
  const advantageBefore = material(s.board)[s.turn] - material(s.board)[other(s.turn)];
  lastPick = { side: s.turn, plan, facts: pick.facts, advantageBefore };
  const f = pick.facts;
  play(pick.m, { ...detail, adv: advantageBefore, advBR: f.advantage_after_best_reply,
    flags: (f.draws_by_repetition ? 'D' : f.repeats_position ? 'R' : '') + (f.causes_stalemate ? 'S' : '') || '-' });
}

// Starts the next bot move after a short pause. Any earlier pending move is dropped.
function scheduleBot() {
  clearTimeout(botTimer);
  if (autoplay && !status.over) botTimer = setTimeout(botMove, BOT_DELAY);
}

function toggleAutoplay() {
  autoplay = !autoplay;
  track('jev_toggled', { on: autoplay });
  gameId++;
  document.getElementById('bot-status').textContent = autoplay ? 'Autoplay on.' : 'Autoplay off.';
  scheduleBot();
}

Jev.mount(document.getElementById('semaphore'));
canvas.addEventListener('click', onClick);
document.addEventListener('keydown', e => {
  switch (e.code) {
    case 'KeyR': reset(); break;
    case 'KeyU': undo(); break;
    case 'KeyA': toggleAutoplay(); break;
    case 'KeyF': flipped = !flipped; break;
    default: return;
  }
  e.preventDefault();
});

flipped = false;
reset();
requestAnimationFrame(loop);
