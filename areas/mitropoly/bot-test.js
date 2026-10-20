// Headless check with real Jev calls: 4 Jev seats play mitropoly, and each Jev pick prints.
// Run: node areas/mitropoly/bot-test.js [Jev calls, default 50]
// The game alone seldom reaches jail or debt in 50 calls. For a kind with no pick near the end,
// the test sets up a position where that decision comes up, so each kind gets a pick.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CALLS = Number(process.argv[2] || 50);
const KEY = process.env.TYPESAFE_API_KEY;
if (!KEY) throw new Error('Set the env var TYPESAFE_API_KEY before you run this test.');
const KINDS = ['buy', 'jail', 'manage', 'debt'];

const sandbox = {
  console,
  fetch: (url, opts) => fetch('https://api.typesafe.ai/v1/systemone', {
    ...opts, headers: { ...opts.headers, Authorization: `Bearer ${KEY}` },
  }),
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../jev.js'), 'utf8'), sandbox); // the page loads jev.js first
vm.runInContext(`${fs.readFileSync(path.join(__dirname, 'mitropoly.js'), 'utf8')}
this.api = { newGame, jevStep, pay, decision, get G() { return G; }, BOARD };`, sandbox);
const { api } = sandbox;

// Positions that bring up a decision kind the game has not reached.
const SETUPS = {
  jail: () => {
    const p = api.G.players[api.G.cur];
    Object.assign(p, { pos: 10, jail: true, jailTurns: 0, getOut: 1 });
    api.G.phase = 'roll';
  },
  debt: () => {
    const G = api.G, p = G.players[G.cur];
    const free = api.BOARD.map((s, k) => k).filter(k => api.BOARD[k].price && !G.props[k]).slice(0, 2);
    free.forEach(k => { G.props[k] = { owner: G.cur, houses: 0, mortgaged: false }; });
    p.money = 10;
    api.pay(p, 100, G.players[(G.cur + 1) % G.players.length]);
  },
  buy: () => {
    const G = api.G, p = G.players[G.cur];
    p.pos = api.BOARD.findIndex((s, k) => s.price && !G.props[k]);
    G.phase = 'buy';
  },
  manage: () => { api.G.phase = 'end'; },
};

(async () => {
  api.newGame(['Părintele Gigel', 'Barosanul din Teleorman', 'Maica Stareță', 'Consilierul Local'], [true, true, true, true]);
  const picks = Object.fromEntries(KINDS.map(k => [k, 0]));
  let calls = 0;
  while (calls < CALLS && api.G.phase !== 'over') {
    const missing = KINDS.filter(k => !picks[k]);
    if (missing.length && CALLS - calls <= missing.length) SETUPS[missing[0]]();
    const step = await api.jevStep();
    if (!step) throw new Error(`no decision in phase ${api.G.phase}`);
    if (!step.answer) continue;
    calls++;
    picks[step.d.kind]++;
    const p = step.answer.probabilities[step.key] || 0;
    console.log(`${String(calls).padStart(2)}. turn ${api.G.turn} ${api.G.players[step.d.seat].name}: ${step.d.kind} -> ${step.key} (p ${p.toFixed(2)}, ${Object.keys(step.d.options).length} options)`);
  }
  const missing = KINDS.filter(k => !picks[k]);
  console.log(`\nJev picks per kind: ${JSON.stringify(picks)}`);
  console.log(missing.length ? `FAIL: no Jev pick for ${missing.join(', ')}` : 'ALL PASS: each decision kind has a Jev pick');
  process.exit(missing.length ? 1 : 0);
})();
