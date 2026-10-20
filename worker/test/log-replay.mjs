// The replay of the game log (issue #12): plays each logged game again, move by move, with the same
// pieces, dice and cards, and checks that it reaches the end the log names.
// The input is the file of `npx wrangler d1 export <database> --output=./log.sql`, or a SQLite file of a stage.
// A log with no "# end" line belongs to a game that stopped: the replay plays it to its last line.
// It prints one line per game in the form of worker/test/log-play.mjs, so the two outputs can be compared.
// Run: node worker/test/log-replay.mjs <log.sql or .sqlite file> [game ids, comma-separated]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const [file, ids] = process.argv.slice(2);
const only = ids && new Set(ids.split(','));
if (!file) throw new Error('Name the log file: node worker/test/log-replay.mjs <log.sql or .sqlite file> [game ids, comma-separated]');
const AREAS = path.join(import.meta.dirname, '../../areas');
const read = f => fs.readFileSync(path.join(AREAS, f), 'utf8');

let db;
if (file.endsWith('.sql')) {
  db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(file, 'utf8'));
} else {
  db = new DatabaseSync(file, { readOnly: true });
}
const rows = db.prepare('SELECT game, game_id, seq, line FROM log_lines ORDER BY game_id, seq').all();
const games = new Map();
for (const r of rows) {
  if (only && !only.has(r.game_id)) continue;
  if (!games.has(r.game_id)) games.set(r.game_id, { game: r.game, id: r.game_id, lines: [] });
  games.get(r.game_id).lines.push(r);
}

// A page with no screen: the game script runs with stubs, as in the headless tests.
function page(script) {
  const fakeCtx = new Proxy({}, { get: () => () => {}, set: () => true });
  const fakeEl = () => ({ textContent: '', innerHTML: '', style: {}, getContext: () => fakeCtx, addEventListener() {}, appendChild() {} });
  const els = {};
  const ctx = {
    document: { getElementById: id => (els[id] ||= fakeEl()), addEventListener() {}, createElement: fakeEl },
    requestAnimationFrame: () => {}, clearTimeout, setTimeout: () => {}, console, Set, Number, crypto,
    performance: { now: () => 0 },
  };
  vm.createContext(ctx);
  vm.runInContext(read('jev.js'), ctx);
  vm.runInContext(read('log.js'), ctx); // the replay writes its own log in page memory; it sends nothing
  vm.runInContext(script, ctx);
  return ctx;
}

// Chess: the moves alone give the replay.
function chess(lines) {
  const api = page(read('chess/chess.js')
    + ';this.api = { legalMoves, san, play, undo, game: () => ({ status, fen: toFEN(state) }), get state() { return state; } };').api;
  let end = null;
  for (const { seq, line } of lines) {
    if (line.startsWith('# game')) continue;
    if (line === '# undo') { api.undo(); continue; }
    if (line.startsWith('# end ')) { end = line.slice(6); continue; }
    const text = line.split('\t')[1];
    const m = api.legalMoves(api.state).find(x => api.san(api.state, x) === text);
    if (!m) throw new Error(`line ${seq}: ${text} is not a legal move`);
    api.play(m);
  }
  const g = api.game();
  const got = g.status.over ? `${g.status.result} ${g.status.reason}` : 'not over';
  return { got, want: end ? end.replace(/ after move \d+$/, '') : 'not over', final: g.fen };
}

// Tetris: each piece lands where its line says. The replay checks that the cell is free, that the piece
// rests there, and that it clears the lines the log names.
function tetris(lines) {
  const { SHAPES, rotate, ROWS, COLS } = page(read('tetris/tetris.js') + ';this.api = { SHAPES, rotate, ROWS, COLS };').api;
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const collides = (m, x, y) => m.some((row, r) => row.some((v, c) => v
    && (x + c < 0 || x + c >= COLS || y + r >= ROWS || (y + r >= 0 && board[y + r][x + c]))));
  let total = 0, end = null, over = false;
  for (const { seq, line } of lines) {
    if (line.startsWith('# game')) continue;
    if (line.startsWith('# end ')) { end = line.slice(6); continue; }
    const [, , act, type, rot, col, row, cleared] = line.split('\t');
    if (act === 'hold') continue;
    let m = SHAPES[type];
    for (let i = 0; i < Number(rot); i++) m = rotate(m, 1);
    const x = Number(col), y = Number(row);
    if (collides(m, x, y)) throw new Error(`line ${seq}: ${type} at ${col},${row} overlaps the stack`);
    if (!collides(m, x, y + 1)) throw new Error(`line ${seq}: ${type} at ${col},${row} does not rest on the stack`);
    m.forEach((r, dr) => r.forEach((v, dc) => { if (v && y + dr >= 0) board[y + dr][x + dc] = type; }));
    if (m.some((r, dr) => r.some(v => v) && y + dr < 0)) { over = true; continue; } // it locks above the top
    let n = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every(v => v)) { board.splice(r, 1); board.unshift(Array(COLS).fill(null)); n++; r++; }
    }
    if (n !== Number(cleared)) throw new Error(`line ${seq}: clears ${n} lines, the log says ${cleared}`);
    total += n;
  }
  // The next piece cannot appear: a spawn cell of some piece is taken.
  const spawnBlocked = Object.entries(SHAPES).some(([t, m]) =>
    collides(m, Math.floor((COLS - m[0].length) / 2), t === 'I' ? -1 : 0));
  const got = !end ? 'not over' : over || spawnBlocked ? `${total} top-out` : `${total} restart`;
  return { got, want: end || 'not over', final: board.map(r => r.map(v => (v ? '#' : '.')).join('')).join('/') };
}

// Mitropoly: each roll line holds the dice and the cards. The replay sets them up before the roll,
// then plays each choice as the seat made it.
function mitropoly(lines) {
  const queue = [];
  const math = Object.create(Math);
  math.random = () => (queue.length ? queue.shift() : Math.random());
  const ctx = { console, Math: math };
  vm.createContext(ctx);
  vm.runInContext(`${read('mitropoly/mitropoly.js')}\nthis.api = { newGame, choose, CHANCE, CHEST, get G() { return G; } };`, ctx);
  const { api } = ctx;
  let end = null;
  for (const { seq, line } of lines) {
    if (line.startsWith('# game')) {
      const seats = line.split('\t').slice(1).map(s => s.split(':'));
      api.newGame(seats.map(s => s.slice(0, -2).join(':')), seats.map(s => s[s.length - 2] === 'j'));
      continue;
    }
    if (line.startsWith('# end ')) { end = line.slice(6); continue; }
    const [turn, seat, , , choice, draw] = line.split('\t');
    const G = api.G;
    const acting = G.debts.length ? G.debts[0].i : G.cur;
    if (Number(turn) !== G.turn || Number(seat) !== acting) {
      throw new Error(`line ${seq}: the log says turn ${turn} seat ${seat}, the replay is at turn ${G.turn} seat ${acting}`);
    }
    if (draw !== '-') {
      const [dice, ...cards] = draw.split(';');
      for (const d of dice.split(',')) queue.push((Number(d) - 1) / 6 + 0.01); // die() reads Math.random
      for (const c of cards.reverse()) {
        const [kind, i] = c.split(':');
        const card = (kind === 'chance' ? api.CHANCE : api.CHEST)[Number(i)];
        const deck = G[kind];
        deck.splice(deck.indexOf(card), 1);
        deck.unshift(card); // the next draw of this deck takes this card
      }
    }
    api.choose(choice);
    G.fx.length = 0;
    if (queue.length) throw new Error(`line ${seq}: the roll did not use its dice`);
  }
  const G = api.G;
  const got = G.winner ? `${G.players.indexOf(G.winner)} bankruptcy` : 'not over';
  return { got, want: end || 'not over', final: `turn ${G.turn} money ${G.players.map(q => q.money).join(',')}` };
}

const REPLAY = { chess, tetris, mitropoly };
let failed = 0;
for (const g of games.values()) {
  const gaps = g.lines.filter((l, i) => l.seq !== i + 1).length;
  let r;
  try {
    if (gaps) throw new Error(`the log misses lines: ${g.lines.length} rows, last seq ${g.lines[g.lines.length - 1].seq}`);
    r = REPLAY[g.game](g.lines);
  } catch (e) {
    failed++;
    console.log(`FAIL ${g.game}\t${g.id}\t${e.message}`);
    continue;
  }
  const ok = r.got === r.want;
  if (!ok) failed++;
  console.log(`${g.game}\t${g.id}\tend ${r.got}\tfinal ${r.final}`);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${g.lines.length} lines; the replay ends as the log: ${r.got}${ok ? '' : ` (the log says ${r.want})`}`);
}
console.log(failed ? `${failed} replay(s) failed` : `ALL PASS: ${games.size} game(s) replayed`);
process.exit(failed ? 1 : 0);
