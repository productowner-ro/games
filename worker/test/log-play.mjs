// Seam 2, the game log (issue #12): plays one game of each game headless and sends its log to a running stage.
// The page code of each game runs with a stub page. A fake Jev answers /api/jev with random probabilities,
// so the run makes no Jev call. A person plays the first moves of each game, Jev seats play the rest.
// /api/log goes to the stage. At the end the script prints the game id and the end of each game;
// worker/test/log-replay.mjs replays the log and prints the same end.
// Run: node worker/test/log-play.mjs [base URL, default http://localhost:8787] [games, default chess,tetris,mitropoly]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const base = process.argv[2] || 'http://localhost:8787';
const AREAS = path.join(import.meta.dirname, '../../areas');
const read = file => fs.readFileSync(path.join(AREAS, file), 'utf8');

// The fake Jev: a random probability for each option of each question. `bias` can add weight to an option.
function fakeJev(body, bias = () => 0) {
  const answers = {};
  for (const [name, q] of Object.entries(body.questions)) {
    if (q.type === 'noul') { answers[name] = { noul: Math.random() }; continue; }
    const keys = Object.keys(q.criteria);
    const w = keys.map(k => Math.max(0.01, Math.random() + bias(name, k)));
    const sum = w.reduce((a, b) => a + b, 0);
    const probabilities = Object.fromEntries(keys.map((k, i) => [k, w[i] / sum]));
    const choice = keys[w.indexOf(Math.max(...w))];
    answers[name] = { choice, confidence: probabilities[choice], probabilities };
  }
  return answers;
}

// The fetch of a page: /api/jev answers from the fake Jev, /api/log goes to the stage.
function pageFetch(bias, gate) {
  return async (url, init) => {
    if (url === '/api/log') return fetch(`${base}/api/log`, init);
    if (gate && gate.off) throw new TypeError('Failed to fetch');
    const answers = fakeJev(JSON.parse(init.body), bias);
    return { ok: true, status: 200, headers: { get: () => '4000' }, json: async () => ({ answers }) };
  };
}

// A stub element: any property is another stub, any call returns a stub. Set values stay.
// addEventListener keeps the handler as on<type>, so the script can click.
function stub(values = {}) {
  const store = { ...values };
  store.addEventListener = (type, fn) => { store[`on${type}`] = fn; };
  const target = function () {};
  return new Proxy(target, {
    get: (t, k) => {
      if (k in store) return store[k];
      if (k === 'then') return undefined;
      if (k === Symbol.toPrimitive) return () => '';
      if (typeof k === 'symbol') return undefined;
      return (store[k] = stub());
    },
    set: (t, k, v) => { store[k] = v; return true; },
    apply: () => stub(),
  });
}

// A fresh page with jev.js and log.js, then the game script. `extra` adds globals the game needs.
function page(script, bias, extra = {}, gate) {
  const handlers = {};
  const els = {};
  const element = id => (els[id] ||= stub({ textContent: '', innerHTML: '' }));
  const document = {
    getElementById: element,
    querySelector: element,
    querySelectorAll: () => [],
    createElement: () => stub(),
    addEventListener: (type, fn) => { handlers[type] = fn; },
    getAnimations: () => [],
    hidden: false,
  };
  const ctx = {
    document, console, Math, JSON, Promise, Set, Map, Error, TypeError, Array, Number, Object, Boolean, String,
    crypto, navigator: {}, location: { protocol: 'http:' },
    performance: { now: () => performance.now() },
    setTimeout: fn => setImmediate(fn), // no pauses, but each step still waits for the network
    clearTimeout: () => {},
    requestAnimationFrame: () => {},
    fetch: pageFetch(bias, gate),
    ...extra,
  };
  vm.createContext(ctx);
  vm.runInContext(read('jev.js'), ctx);
  vm.runInContext(read('log.js'), ctx);
  vm.runInContext(script, ctx);
  return { ctx, handlers, els };
}

const key = code => ({ code, preventDefault() {} });
const until = (cond, ms = 20) => new Promise(resolve => {
  const t = setInterval(() => { if (cond()) { clearInterval(t); resolve(); } }, ms);
});

// Pushes the waiting lines until none waits; a failed push leaves lines, so the stage must answer 204.
async function flush(GameLog) {
  for (let i = 0; i < 50 && GameLog.waiting(); i++) {
    await GameLog.push(); // returns at once while another push is on the way
    await new Promise(r => setTimeout(r, 100));
  }
  if (GameLog.waiting()) throw new Error(`${GameLog.waiting()} lines did not reach ${base}`);
}

async function chess() {
  const { ctx, handlers } = page(read('chess/chess.js')
    + ';this.game = () => ({ id: logId, status, fen: toFEN(state), plies: history.length });'
    + ';this.bySan = text => legalMoves(state).find(m => san(state, m) === text);');
  // A person plays e4 e5, takes e5 back, and plays d5. Then the two Jev bots play.
  for (const text of ['e4', 'e5']) ctx.play(ctx.bySan(text));
  ctx.undo();
  ctx.play(ctx.bySan('d5'));
  handlers.keydown(key('KeyA'));
  await until(() => ctx.game().status.over);
  await flush(ctx.GameLog);
  const g = ctx.game();
  return { game: 'chess', id: g.id, end: `${g.status.result} ${g.status.reason}`, final: g.fen };
}

async function tetris() {
  const { ctx, handlers } = page(read('tetris/tetris.js')
    + ';this.game = () => ({ id: logId, over, lines, board: boardText(board) });');
  // A person holds the first piece, turns the next one, moves it and drops it. Then Jev plays.
  for (const code of ['KeyC', 'KeyX', 'ArrowLeft', 'ArrowLeft', 'Space', 'Space']) handlers.keydown(key(code));
  handlers.keydown(key('KeyA'));
  await until(() => ctx.game().over);
  await flush(ctx.GameLog);
  const g = ctx.game();
  return { game: 'tetris', id: g.id, end: `${g.lines} top-out`, final: g.board.replace(/\n/g, '/') };
}

// A random game of Mitropoly can go on for thousands of turns, as squares split between the seats and nobody
// builds. So a try stops at MAX_TURNS: Jev stops (its call fails, as on a lost connection) and the person stops
// clicking. Its log has no "# end" line. The next try starts a new game, until one ends in bankruptcy.
const MAX_TURNS = 1000, MAX_TRIES = 30;

async function mitropoly() {
  // Jev seats buy most squares, build when they can and seldom mortgage, so that a game ends.
  const bias = (q, k) => (k === 'buy' ? 3 : k.startsWith('build') ? 4 : k === 'end_turn' ? 1
    : k.startsWith('buyback') ? -1 : k.startsWith('mortgage') ? -0.5 : 0);
  const names = ['Ion\tPopescu', 'Barosanul din Teleorman', 'Maica Stareță']; // the tab becomes a space in the log
  const form = {};
  names.forEach((n, i) => { form[`#n${i}`] = stub({ value: n }); form[`#j${i}`] = stub({ checked: i > 0 }); });
  const gate = { off: false };
  const { ctx, handlers } = page(read('mitropoly/mitropoly.js')
    + '\nthis.api = { decision, cur, canBuild, get G() { return G; } };', bias,
  { window: {}, matchMedia: () => ({ matches: true }), localStorage: { getItem: () => null, setItem() {} }, addEventListener() {} },
  gate);
  const { document: doc, api } = ctx;
  let id;
  const start = ctx.GameLog.start;
  ctx.GameLog.start = name => (id = start(name)); // the page keeps the game id inside its closure
  const element = doc.querySelector;
  doc.querySelector = s => form[s] || element(s);
  // The setup form: 3 seats, a person in seat 0 and Jev in seats 1 and 2.
  doc.querySelector('#count').onclick({ target: { closest: () => ({ dataset: { n: '3' } }) } });

  // The person in seat 0 clicks the buttons of the page: buy 4 squares of 5, build, roll, end the turn.
  const click = (act, k) => handlers.click({
    target: { closest: s => (s === 'button[data-act]' ? { dataset: { act, k }, disabled: false } : null) },
  });
  const results = [];
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    gate.off = false;
    await doc.querySelector('#start').onclick();
    await until(() => {
      const G = api.G;
      if (G.phase === 'over') return true;
      if (G.turn > MAX_TURNS) { gate.off = true; return true; }
      if (api.decision() || G.cur !== 0 || G.debts.length) return false; // a Jev seat acts
      const p = api.cur();
      const k = Array.from({ length: 40 }, (_, i) => i).find(i => api.canBuild(i));
      if (G.phase === 'buy') click(Math.random() < 0.8 ? 'buy' : 'skip');
      else if (G.phase === 'end' && k !== undefined && p.money > 300) click('build', k);
      else if (G.phase === 'end') click('end');
      else if (p.jail && p.money >= 50 && Math.random() < 0.5) click('bribe');
      else click('roll');
      return false;
    }, 5);
    await new Promise(r => setTimeout(r, 200)); // the last action plays out
    await flush(ctx.GameLog);
    const G = api.G;
    results.push({
      game: 'mitropoly', id, end: G.winner ? `${G.players.indexOf(G.winner)} bankruptcy` : 'not over',
      final: `turn ${G.turn} money ${G.players.map(q => q.money).join(',')}`,
    });
    if (G.winner) break;
  }
  return results;
}

const GAMES = { chess, tetris, mitropoly };
const results = [];
for (const name of (process.argv[3] || 'chess,tetris,mitropoly').split(',')) results.push(...[await GAMES[name]()].flat());
for (const r of results) console.log(`${r.game}\t${r.id}\tend ${r.end}\tfinal ${r.final}`);
