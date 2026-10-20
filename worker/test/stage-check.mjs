// Seam 2: checks a running Docker stage over HTTP. The /api/jev check makes one real Jev call.
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

await check('POST /api/jev returns a Jev answer', async () => {
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

console.log(failed ? `${failed} check(s) failed` : 'ALL PASS');
process.exit(failed ? 1 : 0);
