// Headless check: runs tetris.js with a fake DOM and lets Jev play N pieces.
// Run: node areas/tetris/bot-test.js [pieces]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PIECES = Number(process.argv[2] || 15);
const KEY = process.env.TYPESAFE_API_KEY;
if (!KEY) throw new Error('Set the env var TYPESAFE_API_KEY before you run this test.');

const fakeCtx = new Proxy({}, { get: () => () => {}, set: () => true });
// The bot panel records each line when the game writes it. A piece that needs no turn and no move
// drops in the same tick as its Jev line, and the next "Jev thinks" overwrites that line at once.
const botLines = [];
let botText = '';
const els = {
  bot: {
    getContext: () => fakeCtx,
    get textContent() { return botText; },
    set textContent(v) {
      botText = v;
      if (/^(Mode|Jev failed|Jev needs)/.test(v)) botLines.push({ line: v, ...sandbox.state() });
    },
  },
};
const document = {
  getElementById: id => (els[id] ||= { textContent: '', getContext: () => fakeCtx }),
  addEventListener: (type, fn) => { if (type === 'keydown') document.keydown = fn; },
};
const log = [];
const sandbox = {
  document, console, setTimeout, Math, JSON, Promise, Set, Error, Array, Number,
  performance: { now: () => performance.now() },
  requestAnimationFrame: () => {},
  fetch: (url, opts) => fetch('https://api.typesafe.ai/v1/systemone', {
    ...opts, headers: { ...opts.headers, Authorization: `Bearer ${KEY}` },
  }),
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../jev.js'), 'utf8'), sandbox); // the page loads jev.js first
vm.runInContext(fs.readFileSync(path.join(__dirname, 'tetris.js'), 'utf8') + ';this.state = () => ({ over, lines, score, pieceId, stack: boardStats(board).maxHeight, holes: boardStats(board).holes });', sandbox);

document.keydown({ code: 'KeyA', preventDefault() {} });
// Autoplay adds 1 to pieceId for the piece that already falls, so Jev's first piece has this id.
const firstId = sandbox.state().pieceId;
const stacks = [];
const modes = { EDGE: 0, SAFE: 0, fallback: 0 };
let maxHoles = 0;
const timer = setInterval(() => {
  while (botLines.length) {
    const b = botLines.shift();
    const m = b.line.match(/Mode (EDGE|SAFE)/);
    modes[m ? m[1] : 'fallback']++;
    stacks.push(b.stack);
    maxHoles = Math.max(maxHoles, b.holes);
    console.log(`piece ${b.pieceId - firstId + 1}: ${b.line}`);
  }
  const s = sandbox.state();
  const placed = s.pieceId - firstId;
  if (s.over || placed >= PIECES) {
    clearInterval(timer);
    const avg = stacks.reduce((a, b) => a + b, 0) / stacks.length;
    const late = stacks.slice(10);
    console.log(`DONE: pieces=${placed} lines=${s.lines} score=${s.score} over=${s.over}`);
    console.log(`stack: avg ${avg.toFixed(1)}, avg after piece 10 ${(late.reduce((a, b) => a + b, 0) / late.length).toFixed(1)}, max ${Math.max(...stacks)}, pieces at >=14: ${stacks.filter(h => h >= 14).length}`);
    console.log(`modes: ${JSON.stringify(modes)}, max holes: ${maxHoles}`);
    process.exit(0);
  }
}, 50);
