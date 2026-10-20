// Seam 1, the game log: POST /api/log of the spec in resources/2026-10-20-game-log-spec.md (issue #12).
// The rows go to the local D1 of the tests. Each test uses its own game id.
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import worker from '../src/index.js';

const ID = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const push = (body, e = env) =>
  worker.fetch(new Request('https://games.test/api/log', { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } }), e);
const rows = async id =>
  (await env.LOG.prepare('SELECT game, seq, line FROM log_lines WHERE game_id = ? ORDER BY seq').bind(id).all()).results;

it('a push writes one D1 row per log line and answers 204', async () => {
  const res = await push(`tetris\t${ID(1)}\n1\t# game ${ID(1)}\n2\t1\th\tlock\tT\t0\t3\t18\t0\t-\t-\t-\t-\n`);

  expect(res.status).toBe(204);
  expect(await rows(ID(1))).toEqual([
    { game: 'tetris', seq: 1, line: `# game ${ID(1)}` },
    { game: 'tetris', seq: 2, line: '1\th\tlock\tT\t0\t3\t18\t0\t-\t-\t-\t-' },
  ]);
});

it('a push sent twice writes no duplicate rows', async () => {
  const body = `chess\t${ID(2)}\n1\t# game ${ID(2)}\n2\t1.\te4\th\t-\t-\t-\t-\t-\t-\t-\t-`;

  expect((await push(body)).status).toBe(204);
  expect((await push(body)).status).toBe(204);

  expect(await rows(ID(2))).toHaveLength(2);
});

it('50 lines pass; 51 lines answer 400 and write nothing', async () => {
  const lines = n => Array.from({ length: n }, (_, i) => `${i + 1}\tline ${i + 1}`).join('\n');

  expect((await push(`mitropoly\t${ID(3)}\n${lines(50)}`)).status).toBe(204);
  expect((await push(`mitropoly\t${ID(4)}\n${lines(51)}`)).status).toBe(400);

  expect(await rows(ID(3))).toHaveLength(50);
  expect(await rows(ID(4))).toHaveLength(0);
});

it('a line of 500 characters passes; 501 characters answer 400', async () => {
  expect((await push(`chess\t${ID(5)}\n1\t${'x'.repeat(500)}`)).status).toBe(204);
  expect((await push(`chess\t${ID(6)}\n1\t${'x'.repeat(501)}`)).status).toBe(400);

  expect(await rows(ID(6))).toHaveLength(0);
});

it('a body that breaks the format answers 400', async () => {
  const bad = [
    '',
    `chess\t${ID(7)}`, // no log line
    `poker\t${ID(7)}\n1\tx`, // no such game
    `chess\tnot-an-id\n1\tx`,
    `chess\t${ID(7)}\nx\tline`, // no seq
    `chess\t${ID(7)}\n0\tline`,
    `chess\t${ID(7)}\nline without a seq`,
  ];

  for (const body of bad) expect((await push(body)).status, JSON.stringify(body)).toBe(400);
  expect(await rows(ID(7))).toHaveLength(0);
});

it('when D1 fails, as past its daily limit, the push answers 503', async () => {
  const failing = { prepare() { throw new Error('D1 is past its daily limit'); } };

  const res = await push(`tetris\t${ID(8)}\n1\t# game ${ID(8)}`, { ...env, LOG: failing });

  expect(res.status).toBe(503);
});

it('GET /api/log answers 404', async () => {
  const res = await worker.fetch(new Request('https://games.test/api/log'), env);

  expect(res.status).toBe(404);
});
