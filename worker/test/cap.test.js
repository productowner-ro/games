// Seam 1, the daily cap: the spec of issue #5. The test config sets the cap to 25 calls.
// Each test runs on its own UTC date, so no count carries over from another test.
import { env } from 'cloudflare:test';
import { afterEach, expect, it, vi } from 'vitest';
import worker from '../src/index.js';

const jev = () =>
  worker.fetch(new Request('https://games.test/api/jev', { method: 'POST', body: '{}' }), env);

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('past the daily cap, /api/jev returns 429 until 00:00 UTC and calls no TypeSafe', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-01T15:30:00Z'));
  const typesafe = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ answers: {} }));

  for (let i = 0; i < 25; i++) expect((await jev()).status).toBe(200);
  const res = await jev();

  expect(res.status).toBe(429);
  expect(await res.json()).toEqual({ error: 'daily_cap', resets_at: '2026-11-02T00:00:00.000Z' });
  expect(typesafe).toHaveBeenCalledTimes(25);
});

it('each answer carries X-Jev-Calls-Left from the last reservation', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-02T09:00:00Z'));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ answers: {} }));

  const first = await jev(); // reserves 20 of 25: 5 left to reserve
  for (let i = 0; i < 19; i++) await jev();
  const twentyFirst = await jev(); // reserves the last 5: 0 left
  for (let i = 0; i < 4; i++) await jev();
  const past = await jev();

  expect(first.headers.get('X-Jev-Calls-Left')).toBe('5');
  expect(twentyFirst.headers.get('X-Jev-Calls-Left')).toBe('0');
  expect(past.headers.get('X-Jev-Calls-Left')).toBe('0');
});

it('a cap lowered below the calls reserved today leaves 0 calls, not fewer', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-07T09:00:00Z'));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ answers: {} }));
  for (let i = 0; i < 20; i++) await jev(); // 20 reserved and spent under the cap of 25

  const res = await worker.fetch(
    new Request('https://games.test/api/jev', { method: 'POST', body: '{}' }),
    { ...env, DAILY_CAP: '10' },
  );

  expect(res.status).toBe(429);
  expect(res.headers.get('X-Jev-Calls-Left')).toBe('0');
});

it('a failed call to TypeSafe returns 502 and still counts', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T09:00:00Z'));
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

  const statuses = [];
  for (let i = 0; i < 26; i++) statuses.push((await jev()).status);

  expect(statuses.slice(0, 25)).toEqual(Array(25).fill(502));
  expect(statuses[25]).toBe(429);
});

// The one test that looks inside: issue #5 counts the Durable Object requests per day.
it('past the cap, the Worker stops asking the Durable Object until 00:00 UTC', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-06T09:00:00Z'));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ answers: {} }));
  const asks = vi.spyOn(env.JEV_COUNT, 'get');
  for (let i = 0; i < 26; i++) await jev(); // 25 calls in 2 blocks, then the first 429
  const asksAtCap = asks.mock.calls.length;

  for (let i = 0; i < 10; i++) expect((await jev()).status).toBe(429);

  expect(asks.mock.calls.length).toBe(asksAtCap);
});

it('a new UTC day starts a new count', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-04T23:59:00Z'));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ answers: {} }));
  for (let i = 0; i < 25; i++) await jev();
  expect((await jev()).status).toBe(429);

  vi.setSystemTime(new Date('2026-11-05T00:00:00Z'));

  expect((await jev()).status).toBe(200);
});
