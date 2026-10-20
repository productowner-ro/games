// Seam 2: checks a running Docker stage over HTTP. The /api/jev check makes one real Jev call,
// and runs only when the env var TYPESAFE_API_KEY is set.
// Run: node worker/test/stage-check.mjs [base URL, default http://localhost:8787]
const base = process.argv[2] || 'http://localhost:8787';
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}: ${e.message}`);
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

for (const game of ['tetris', 'chess', 'mitropoly']) {
  await check(`/${game}/ serves the game`, async () => {
    const res = await fetch(`${base}/${game}/`);
    expect(res.status === 200, `status ${res.status}`);
    expect((await res.text()).includes(`<script src="${game}.js">`), 'no game script in the page');
  });
  await check(`/${game}/server.js is not served`, async () => {
    const res = await fetch(`${base}/${game}/server.js`);
    expect(res.status === 404, `status ${res.status}`);
  });
}

// The game log (issue #12): a new game id each run, so the 204 shows a real write.
const log = body => fetch(`${base}/api/log`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body });
const id = crypto.randomUUID();
await check('POST /api/log writes the lines: 204', async () => {
  const res = await log(`chess\t${id}\n1\t# game ${id}\n2\t1.\te4\th\t-\t-\t-\t-\t-\t-\t-\t-`);
  expect(res.status === 204, `status ${res.status}: ${await res.text()}`);
});
await check('POST /api/log past 50 lines: 400', async () => {
  const lines = Array.from({ length: 51 }, (_, i) => `${i + 1}\tx`).join('\n');
  const res = await log(`chess\t${id}\n${lines}`);
  expect(res.status === 400, `status ${res.status}`);
});

if (process.env.TYPESAFE_API_KEY) await check('POST /api/jev returns a Jev answer', async () => {
  const res = await fetch(`${base}/api/jev`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'jev-latest',
      state: { note: 'A check of the games Worker.' },
      questions: { pick: { type: 'choice', instructions: 'Pick one.', criteria: { a: 'Option a.', b: 'Option b.' } } },
    }),
  });
  const body = await res.text();
  expect(res.status === 200, `status ${res.status}: ${body.slice(0, 200)}`);
  expect(JSON.parse(body).answers?.pick?.choice, `no choice in ${body.slice(0, 200)}`);
});
else console.log('skip POST /api/jev: no TYPESAFE_API_KEY');

console.log(failed ? `${failed} check(s) failed` : 'ALL PASS');
process.exit(failed ? 1 : 0);
