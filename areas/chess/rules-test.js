// Headless check: runs chess.js with a fake DOM and counts legal move trees (perft)
// against known reference counts. Any mismatch means a bug in the move rules.
// Run: node areas/chess/rules-test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const fakeCtx = new Proxy({}, { get: () => () => {}, set: () => true });
const fakeEl = () => ({ textContent: '', innerHTML: '', style: {}, getContext: () => fakeCtx,
  addEventListener() {}, appendChild() {} });
const els = {};
const sandbox = {
  document: { getElementById: id => (els[id] ||= fakeEl()), addEventListener() {}, createElement: fakeEl },
  requestAnimationFrame: () => {}, clearTimeout, console, Math, Set, Number,
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'chess.js'), 'utf8')
  + ';this.api = { parseFEN, legalMoves, makeMove, san, gameStatus, insufficientMaterial, describe, play,'
  + ' load: fen => { reset(); state = parseFEN(fen); }, current: () => state };', sandbox);
const { parseFEN, legalMoves, makeMove, san, gameStatus } = sandbox.api;

function perft(s, depth) {
  if (depth === 0) return 1;
  const moves = legalMoves(s);
  if (depth === 1) return moves.length;
  return moves.reduce((n, m) => n + perft(makeMove(s, m), depth - 1), 0);
}

// Reference counts: https://www.chessprogramming.org/Perft_Results
const CASES = [
  ['start', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['position 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['position 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];

let failed = 0;
for (const [name, fen, counts] of CASES) {
  counts.forEach((want, i) => {
    const got = perft(parseFEN(fen), i + 1);
    const ok = got === want;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} depth ${i + 1}: ${got}${ok ? '' : ` (want ${want})`}`);
  });
}

// Game-end and notation checks.
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${got}${ok ? '' : ` (want ${want})`}`);
};
let s = parseFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
const history = [];
for (const text of ['f3', 'e5', 'g4', 'Qh4#']) {
  const m = legalMoves(s).find(x => san(s, x) === text);
  history.push({ state: s });
  s = makeMove(s, m);
}
check('fool\'s mate', JSON.stringify(gameStatus(s, history)), JSON.stringify({ over: true, result: '0-1', reason: 'checkmate' }));
check('stalemate', gameStatus(parseFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), []).reason, 'stalemate');
check('K+N insufficient', gameStatus(parseFEN('8/8/4k3/8/8/3NK3/8/8 w - - 0 1'), []).reason, 'insufficient material');
check('50-move rule', gameStatus(parseFEN('8/8/4k3/8/8/3RK3/8/8 w - - 100 80'), []).reason, '50-move rule');
const kn = parseFEN('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1'); // knights on b1 and f1 both reach d2
check('knight disambiguation', legalMoves(kn).filter(m => m.to === 51 && m.piece === 'N').map(m => san(kn, m)).sort().join(','), 'Nbd2,Nfd2');

// Repetition facts: the rook-check loop from a real bot game (Rc8+ Kb6 Rb8+ Kc5, twice).
const { describe, play, load, current } = sandbox.api;
const bySan = text => legalMoves(current()).find(x => san(current(), x) === text);
load('1r6/7p/4pp2/2K1k3/6P1/8/6PP/8 b - - 0 25');
check('fresh move does not repeat', describe(current(), bySan('Rc8+')).repeats_position, false);
for (const text of ['Rc8+', 'Kb6', 'Rb8+', 'Kc5']) play(bySan(text));
check('second Rc8+ repeats', describe(current(), bySan('Rc8+')).repeats_position, true);
check('second Rc8+ is not yet a draw', describe(current(), bySan('Rc8+')).draws_by_repetition, false);
for (const text of ['Rc8+', 'Kb6', 'Rb8+', 'Kc5']) play(bySan(text));
check('third Rc8+ draws', describe(current(), bySan('Rc8+')).draws_by_repetition, true);

console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
