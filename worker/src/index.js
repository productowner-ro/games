// The Worker of games.productowner.ro. Cloudflare serves the files of areas/ as static assets;
// only /api/* reaches this code. It uses only standard Worker APIs, so workerd can run it too.
import { DurableObject } from 'cloudflare:workers';

const API_URL = 'https://api.typesafe.ai/v1/systemone';
const BLOCK = 20; // calls that one Worker instance reserves at a time (issue #5)

// One Durable Object holds the count for the whole site: one row per UTC date, with the calls reserved.
export class JevCount extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS days (date TEXT PRIMARY KEY, reserved INTEGER NOT NULL)');
  }

  // Reserves up to `want` calls for `date`, never past `cap`. Returns the calls reserved and the calls left.
  reserve(date, want, cap) {
    const row = this.ctx.storage.sql.exec('SELECT reserved FROM days WHERE date = ?', date).toArray()[0];
    const reserved = row ? row.reserved : 0;
    const granted = Math.max(0, Math.min(want, cap - reserved));
    if (granted > 0) {
      this.ctx.storage.sql.exec(
        'INSERT INTO days (date, reserved) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET reserved = excluded.reserved',
        date, reserved + granted,
      );
    }
    return { granted, left: Math.max(0, cap - reserved - granted) };
  }
}

// The block of this Worker instance: the calls it reserved and has not spent yet.
let block = { date: '', calls: 0, left: 0 };

async function spendOne(env, date) {
  // The last reservation took the last calls of the day: the Durable Object has none to give until 00:00 UTC.
  if (block.date === date && block.calls === 0 && block.left === 0) return false;
  if (block.date !== date || block.calls === 0) {
    const stub = env.JEV_COUNT.get(env.JEV_COUNT.idFromName('site'));
    const { granted, left } = await stub.reserve(date, BLOCK, Number(env.DAILY_CAP || 5000));
    block = { date, calls: granted, left };
  }
  if (block.calls === 0) return false;
  block.calls--;
  return true;
}

// The semaphore on the page reads the calls left from this header (issue #5).
const headers = () => ({ 'Content-Type': 'application/json', 'X-Jev-Calls-Left': String(block.left) });
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: headers() });

export default {
  async fetch(request, env) {
    // A path that is no static file and no API route, for example a file that .assetsignore keeps out.
    const { pathname } = new URL(request.url);
    if (request.method !== 'POST' || pathname !== '/api/jev') return new Response('not found', { status: 404 });

    const now = new Date();
    if (!(await spendOne(env, now.toISOString().slice(0, 10)))) {
      const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      return json(429, { error: 'daily_cap', resets_at: midnight.toISOString() });
    }

    // POST /api/jev passes the request on to TypeSafe, so the key stays out of the browser.
    // The call is already spent: a failed call to TypeSafe still counts (issue #5).
    let upstream;
    try {
      upstream = await fetch(API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
        body: await request.text(),
      });
    } catch (e) {
      return json(502, { error: e.message });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: headers(),
    });
  },
};
