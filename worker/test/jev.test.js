// Seam 1: the HTTP seam of the Worker. TypeSafe is the only fake, at the network edge.
import { env } from 'cloudflare:test';
import { afterEach, expect, it, vi } from 'vitest';
import worker from '../src/index.js';

afterEach(() => vi.restoreAllMocks());

it('POST /api/jev returns the answer of TypeSafe', async () => {
  const answer = { answers: { plan: { choice: 'buy' } } };
  const typesafe = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(answer));

  const res = await worker.fetch(
    new Request('https://games.test/api/jev', { method: 'POST', body: '{"questions":{}}' }),
    env,
  );

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(answer);
  const [url, init] = typesafe.mock.calls[0];
  expect(url).toBe('https://api.typesafe.ai/v1/systemone');
  expect(init.headers.Authorization).toBe('Bearer test-key');
  expect(init.body).toBe('{"questions":{}}');
});

it('another path returns 404 and calls no TypeSafe', async () => {
  const typesafe = vi.spyOn(globalThis, 'fetch');

  const res = await worker.fetch(new Request('https://games.test/tetris/server.js'), env);

  expect(res.status).toBe(404);
  expect(typesafe).not.toHaveBeenCalled();
});
