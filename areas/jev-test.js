// Headless tests of areas/jev.js: the call to /api/jev, the semaphore and the stop at the daily cap.
// A stub page and a fake fetch stand in for the browser and the Worker.
// Run: node areas/jev-test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(path.join(__dirname, 'jev.js'), 'utf8');

// Loads jev.js in a fresh page. `store` is the localStorage of the browser; `answer` is what the fake Worker returns.
function page({ store = new Map(), answer } = {}) {
  const ctx = {
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    fetch: async () => answer,
  };
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx);
  const light = { textContent: '', className: '' };
  ctx.Jev.mount(light);
  return { Jev: ctx.Jev, light };
}

const reply = (status, left, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: name => (name === 'X-Jev-Calls-Left' ? String(left) : null) },
  json: async () => body,
});

test('after a call, the semaphore shows the calls left in green above 1,000', async () => {
  const { Jev, light } = page({ answer: reply(200, 4200, { answers: { pick: { choice: 'a' } } }) });

  const answers = await Jev.call({ questions: {} });

  assert.deepStrictEqual(answers, { pick: { choice: 'a' } });
  assert.strictEqual(light.textContent, 'About 4200 Jev calls left today');
  assert.strictEqual(light.className, 'semaphore green');
});

test('the semaphore turns yellow from 1 to 1,000 calls left, and red at 0', async () => {
  const colour = async left => {
    const { Jev, light } = page({ answer: reply(200, left, { answers: {} }) });
    await Jev.call({});
    return light.className;
  };

  assert.strictEqual(await colour(1001), 'semaphore green');
  assert.strictEqual(await colour(1000), 'semaphore yellow');
  assert.strictEqual(await colour(1), 'semaphore yellow');
  assert.strictEqual(await colour(0), 'semaphore red');
});

test('at the daily cap, the call fails with dailyCap and the semaphore says Jev rests', async () => {
  const { Jev, light } = page({
    answer: reply(429, 0, { error: 'daily_cap', resets_at: '2026-11-02T00:00:00.000Z' }),
  });

  await assert.rejects(Jev.call({}), e => e.dailyCap === true);
  assert.strictEqual(light.textContent, 'Jev rests until 00:00 UTC');
  assert.strictEqual(light.className, 'semaphore red');
});

test('another failed call fails with its HTTP status', async () => {
  const { Jev } = page({ answer: reply(502, 4000, { error: 'network down' }) });

  await assert.rejects(Jev.call({}), e => e.message === 'HTTP 502' && !e.dailyCap);
});

test('a new page shows the last value this browser saw, in grey, until the first call', async () => {
  const store = new Map();
  const first = page({ store, answer: reply(200, 4200, { answers: {} }) });
  await first.Jev.call({});

  const next = page({ store });

  assert.strictEqual(next.light.textContent, 'About 4200 Jev calls left today');
  assert.strictEqual(next.light.className, 'semaphore grey');
});

test('a browser that saw no value shows no number', () => {
  const { light } = page();

  assert.strictEqual(light.textContent, 'Jev calls left today: not known yet');
  assert.strictEqual(light.className, 'semaphore grey');
});
