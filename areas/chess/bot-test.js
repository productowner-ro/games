// Headless check: runs chess.js with a fake DOM and lets the two Jev bots play.
// Run: node areas/chess/bot-test.js [half-moves] [games] [start FEN]
// With games > 1, the games run in parallel and only the summary per game prints.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PLIES = Number(process.argv[2] || 20);
const GAMES = Number(process.argv[3] || 1);
const FEN = process.argv[4] || null;
const KEY = process.env.TYPESAFE_API_KEY;
if (!KEY) throw new Error('Set the env var TYPESAFE_API_KEY before you run this test.');
const SOURCE = fs.readFileSync(path.join(__dirname, 'chess.js'), 'utf8')
  + ';this.game = () => ({ plies: history.length, sans: history.map(h => h.san), status, fen: toFEN(state), lastPick,'
  + ' mats: history.map(h => material(h.state.board)).concat(material(state.board)) });'
  + ';this.load = fen => { reset(); state = parseFEN(fen); };';

function playGame(n) {
  return new Promise(resolve => {
    const els = {};
    const fakeCtx = new Proxy({}, { get: () => () => {}, set: () => true });
    const fakeEl = () => ({ textContent: '', innerHTML: '', style: {}, getContext: () => fakeCtx,
      addEventListener() {}, appendChild() {} });
    const document = {
      getElementById: id => (els[id] ||= fakeEl()),
      createElement: fakeEl,
      addEventListener: (type, fn) => { if (type === 'keydown') document.keydown = fn; },
    };
    const sandbox = {
      document, console, clearTimeout, Math, JSON, Promise, Set, Error, Array, Number, Object, Boolean,
      setTimeout: fn => setTimeout(fn, 0), // no pause between moves in the test
      location: { protocol: 'http:' },
      performance: { now: () => performance.now() },
      requestAnimationFrame: () => {},
      fetch: (url, opts) => (url === '/api/log' ? Promise.resolve() // the test keeps no game log
        : fetch('https://api.typesafe.ai/v1/systemone', {
          ...opts, headers: { ...opts.headers, Authorization: `Bearer ${KEY}` },
        })),
    };
    vm.createContext(sandbox);
    vm.runInContext(SOURCE, sandbox);
    if (FEN) sandbox.load(FEN);
    document.keydown({ code: 'KeyA', preventDefault() {} });

    const plans = {}, sources = { jev: 0, code: 0, fallback: 0 };
    const giveaways = []; // picks that let the opponent win material with the best reply
    let lastPick = null;
    const timer = setInterval(() => {
      const g = sandbox.game();
      if (g.lastPick && g.lastPick !== lastPick) {
        lastPick = g.lastPick;
        const text = els[`bot-${lastPick.side}`].textContent;
        sources[text.includes('Plan ') ? 'jev' : text.includes('Heuristic') ? 'fallback' : 'code']++;
        if (lastPick.plan) plans[`${lastPick.side}:${lastPick.plan}`] = (plans[`${lastPick.side}:${lastPick.plan}`] || 0) + 1;
        if (lastPick.facts.advantage_after_best_reply < lastPick.advantageBefore)
          giveaways.push(`${g.plies}. ${lastPick.facts.move} (${lastPick.advantageBefore} -> ${lastPick.facts.advantage_after_best_reply})`);
        if (GAMES === 1) console.log(`${g.plies}. ${text}`);
      }
      if (g.status.over || g.plies >= PLIES) {
        clearInterval(timer);
        const moves = g.sans.map((s, i) => (i % 2 ? s : `${i / 2 + 1}. ${s}`)).join(' ');
        // Real losses: the mover's material lead dropped by 2 or more within the next 3 half-moves.
        const first = FEN ? FEN.split(' ')[1] : 'w';
        const side = i => (i % 2 === 0 ? first : first === 'w' ? 'b' : 'w');
        const lead = (i, c) => g.mats[i][c] - g.mats[i][c === 'w' ? 'b' : 'w'];
        const losses = [];
        for (let i = 0; i + 1 < g.mats.length; i++) {
          const c = side(i), j = Math.min(i + 3, g.mats.length - 1); // near the end, compare with the final position
          if (lead(j, c) <= lead(i, c) - 2) losses.push(`${g.sans[i]} (${lead(i, c)} -> ${lead(j, c)})`);
        }
        resolve({ n, plies: g.plies, over: g.status.over, result: g.status.result || '-',
          reason: g.status.reason || 'move limit', plans, sources, giveaways, losses, moves, fen: g.fen });
      }
    }, 20);
  });
}

(async () => {
  const t0 = Date.now();
  const results = await Promise.all(Array.from({ length: GAMES }, (_, i) => playGame(i + 1)));
  for (const r of results) {
    console.log(`\nGAME ${r.n}: ${r.result} ${r.reason} after ${r.plies} half-moves`);
    console.log(`  plans: ${JSON.stringify(r.plans)}  picks: ${JSON.stringify(r.sources)}`);
    console.log(`  risky picks (by the fact): ${r.giveaways.length ? r.giveaways.join(', ') : 'none'}`);
    console.log(`  real losses: ${r.losses.length ? r.losses.join(', ') : 'none'}`);
    if (GAMES === 1) console.log(`  moves: ${r.moves}\n  FEN: ${r.fen}`);
    else console.log(`  opening: ${r.moves.split(' ').slice(0, 15).join(' ')}`);
  }
  const tally = {};
  results.forEach(r => { const k = `${r.result} ${r.reason}`; tally[k] = (tally[k] || 0) + 1; });
  console.log(`\nSUMMARY: ${JSON.stringify(tally)}, risky picks ${results.reduce((a, r) => a + r.giveaways.length, 0)}, `
    + `real losses ${results.reduce((a, r) => a + r.losses.length, 0)}, `
    + `${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(0);
})();
