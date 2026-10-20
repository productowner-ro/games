// Headless tests of areas/log.js: the lines in page memory, the push to /api/log and the 500-line buffer.
// A fake fetch stands in for the Worker; the test pushes by hand instead of waiting a minute.
// Run: node areas/log-test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(path.join(__dirname, 'log.js'), 'utf8');

// Loads log.js in a fresh page. `answer` is the status the fake Worker returns, or 'offline'.
function page({ answer = 204 } = {}) {
  const sent = [];
  const beacons = [];
  const timers = [];
  const ctx = {
    crypto: require('crypto').webcrypto,
    setInterval: (fn, ms) => timers.push({ fn, ms }),
    fetch: async (url, init) => {
      if (ctx.answer === 'offline') throw new TypeError('Failed to fetch');
      sent.push({ url, body: init.body, type: init.headers['Content-Type'] });
      return { ok: ctx.answer >= 200 && ctx.answer < 300, status: ctx.answer };
    },
    navigator: { sendBeacon: (url, body) => { beacons.push({ url, body }); return true; } },
    addEventListener: (type, fn) => { ctx[`on${type}`] = fn; },
    answer,
  };
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx);
  return { ctx, GameLog: ctx.GameLog, sent, beacons, timers };
}

const lines = body => body.split('\n');

test('a push sends the game, the game id and each line with its seq, as text/plain', async () => {
  const { GameLog, sent } = page();
  const id = GameLog.start('tetris');
  GameLog.write(`# game ${id}`);
  GameLog.write([1, 'h', 'lock', 'T', 0, 3, 18, 0, null, undefined, '', 'A:.5']);

  await GameLog.push();

  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].url, '/api/log');
  assert.strictEqual(sent[0].type, 'text/plain');
  assert.deepStrictEqual(lines(sent[0].body), [
    `tetris\t${id}`,
    `1\t# game ${id}`,
    '2\t1\th\tlock\tT\t0\t3\t18\t0\t-\t-\t-\tA:.5',
  ]);
  assert.strictEqual(GameLog.waiting(), 0);
});

test('a tab or a line break inside a field becomes a space', async () => {
  const { GameLog, sent } = page();
  GameLog.start('mitropoly');
  GameLog.write(['# game', 'x', 'Ion\tPop\nescu:h:-']);

  await GameLog.push();

  assert.strictEqual(lines(sent[0].body)[1], '1\t# game\tx\tIon Pop escu:h:-');
});

test('no push goes out when no line waits', async () => {
  const { GameLog, sent } = page();
  GameLog.start('chess');

  await GameLog.push();

  assert.strictEqual(sent.length, 0);
});

test('the page pushes every minute', () => {
  const { timers } = page();

  assert.strictEqual(timers.length, 1);
  assert.strictEqual(timers[0].ms, 60000);
});

test('50 waiting lines start a push of 50 lines', async () => {
  const { GameLog, sent } = page();
  GameLog.start('chess');
  for (let i = 1; i <= 49; i++) GameLog.write(`line ${i}`);
  assert.strictEqual(sent.length, 0);

  GameLog.write('line 50');
  await new Promise(r => setImmediate(r));

  assert.strictEqual(sent.length, 1);
  assert.strictEqual(lines(sent[0].body).length, 51); // the game line and 50 log lines
  assert.strictEqual(GameLog.waiting(), 0);
});

test('one push holds one game: lines of two games go in two pushes', async () => {
  const { GameLog, sent } = page();
  const a = GameLog.start('chess');
  GameLog.write('a1');
  const b = GameLog.start('chess');
  GameLog.write('b1');
  GameLog.write('b2');

  await GameLog.push();

  assert.deepStrictEqual(sent.map(s => lines(s.body)), [
    [`chess\t${a}`, '1\ta1'],
    [`chess\t${b}`, '1\tb1', '2\tb2'],
  ]);
});

test('past 500 waiting lines, the oldest line goes', async () => {
  const { ctx, GameLog, sent } = page({ answer: 503 }); // D1 is past its limit: the lines wait
  GameLog.start('tetris');
  for (let i = 1; i <= 501; i++) GameLog.write(`line ${i}`);
  await new Promise(r => setImmediate(r));
  assert.strictEqual(GameLog.waiting(), 500);

  ctx.answer = 204;
  sent.length = 0;
  await GameLog.push();

  const seqs = sent.flatMap(s => lines(s.body).slice(1).map(l => Number(l.split('\t')[0])));
  assert.strictEqual(seqs.length, 500);
  assert.strictEqual(seqs[0], 2); // line 1 went
  assert.strictEqual(seqs[499], 501);
  assert.strictEqual(sent.length, 10); // 50 lines per push
});

test('while D1 answers 503, the page tries again after 50 new lines, not after each line', async () => {
  const { GameLog, sent } = page({ answer: 503 });
  GameLog.start('tetris');

  for (let i = 1; i <= 120; i++) {
    GameLog.write(`line ${i}`);
    await new Promise(r => setImmediate(r));
  }

  assert.strictEqual(sent.length, 2); // at line 50 and at line 100
});

test('503 and a lost connection keep the lines; 400 drops them', async () => {
  const { ctx, GameLog } = page({ answer: 503 });
  GameLog.start('chess');
  GameLog.write('one');

  await GameLog.push();
  assert.strictEqual(GameLog.waiting(), 1);

  ctx.answer = 'offline';
  await GameLog.push();
  assert.strictEqual(GameLog.waiting(), 1);

  ctx.answer = 400;
  await GameLog.push();
  assert.strictEqual(GameLog.waiting(), 0);
});

test('when the page closes, the waiting lines go out with sendBeacon', () => {
  const { ctx, GameLog, beacons } = page();
  const id = GameLog.start('mitropoly');
  GameLog.write(`# game ${id}`);

  ctx.onpagehide();

  assert.deepStrictEqual(beacons.map(b => lines(b.body)), [[`mitropoly\t${id}`, `1\t# game ${id}`]]);
  assert.strictEqual(GameLog.waiting(), 0);
});

test('a page with no game writes no line', async () => {
  const { GameLog, sent } = page();

  GameLog.write('lost');
  await GameLog.push();

  assert.strictEqual(sent.length, 0);
});
