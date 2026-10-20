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

// The game log (issue #12): resources/2026-10-20-game-log-spec.md holds the format and the limits.
const LOG_GAMES = new Set(['chess', 'tetris', 'mitropoly']);
const LOG_MAX_LINES = 50;
const LOG_MAX_CHARS = 500;
const LOG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Reads the body of one push: the line "<game>\t<game id>", then one "<seq>\t<line>" per log line.
// Returns the rows to write, or a text that says which limit the body breaks.
function parseLog(body) {
  const lines = body.split('\n');
  if (lines[lines.length - 1] === '') lines.pop(); // a body may end with a newline
  if (lines.length > LOG_MAX_LINES + 1) return `more than ${LOG_MAX_LINES} lines`;
  const [game, id, ...rest] = (lines[0] || '').split('\t');
  if (!LOG_GAMES.has(game) || !LOG_ID.test(id || '') || rest.length) return 'the first line is not <game>\\t<game id>';
  if (lines.length < 2) return 'no log line';
  const rows = [];
  for (const text of lines.slice(1)) {
    const tab = text.indexOf('\t');
    const seq = Number(text.slice(0, tab));
    const line = text.slice(tab + 1);
    if (tab < 1 || !Number.isInteger(seq) || seq < 1) return 'a line is not <seq>\\t<line>';
    if (line.length > LOG_MAX_CHARS) return `a line has more than ${LOG_MAX_CHARS} characters`;
    rows.push({ seq, line });
  }
  return { game, id, rows };
}

// POST /api/log writes one D1 row per log line. A push sent twice writes no duplicate rows.
async function writeLog(request, env) {
  const body = await request.text();
  if (body.length > (LOG_MAX_LINES + 1) * (LOG_MAX_CHARS + 20)) return new Response('body too long', { status: 400 });
  const push = parseLog(body);
  if (typeof push === 'string') return new Response(push, { status: 400 });

  const at = new Date().toISOString();
  try {
    const insert = env.LOG.prepare(
      'INSERT OR IGNORE INTO log_lines (game, game_id, seq, line, received_at) VALUES (?, ?, ?, ?, ?)',
    );
    await env.LOG.batch(push.rows.map(r => insert.bind(push.game, push.id, r.seq, r.line, at)));
  } catch (e) {
    // Past the daily limit of D1 Free, every query fails until 00:00 UTC. The page keeps the lines.
    return new Response(`D1 failed: ${e.message}`, { status: 503 });
  }
  return new Response(null, { status: 204 });
}

export default {
  async fetch(request, env) {
    // A path that is no static file and no API route, for example a file that .assetsignore keeps out.
    const { pathname } = new URL(request.url);
    if (request.method === 'POST' && pathname === '/api/log') return writeLog(request, env);
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
