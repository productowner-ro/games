// The prod stage on workerd: this small Worker stands in for D1, as the local mode of wrangler does.
// workerd has the D1 API of the Worker (the module cloudflare-internal:d1-api) but no D1 database.
// That API sends each query to a fetcher: POST /query or /execute, with JSON { sql, params } or a list of them.
// Here one Durable Object answers, with its SQLite storage in /data. It runs the migrations of
// worker/migrations once, in order, as `wrangler d1 migrations apply` does.
import { DurableObject } from 'cloudflare:workers';
import m0001 from '0001_log_lines.sql';

const MIGRATIONS = [['0001_log_lines.sql', m0001]];

export class Database extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS d1_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
    for (const [name, text] of MIGRATIONS) {
      if (sql.exec('SELECT name FROM d1_migrations WHERE name = ?', name).toArray().length) continue;
      ctx.storage.transactionSync(() => {
        sql.exec(text);
        sql.exec('INSERT INTO d1_migrations (name, applied_at) VALUES (?, ?)', name, new Date().toISOString());
      });
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || !['/query', '/execute'].includes(url.pathname)) return new Response('not found', { status: 404 });
    const body = await request.json();
    const queries = Array.isArray(body) ? body : [body];
    const format = url.searchParams.get('resultsFormat') || 'ARRAY_OF_OBJECTS';
    try {
      // One list of queries is one transaction, as a D1 batch.
      const results = this.ctx.storage.transactionSync(() => queries.map(q => this.run(q, format)));
      return Response.json(results);
    } catch (e) {
      return Response.json({ success: false, error: e.message });
    }
  }

  run({ sql, params }, format) {
    const t0 = Date.now();
    const cursor = this.ctx.storage.sql.exec(sql, ...(params || []));
    const columns = cursor.columnNames;
    const rows = cursor.raw().toArray();
    const changes = this.ctx.storage.sql.exec('SELECT changes() AS n, last_insert_rowid() AS id').one();
    const results = format === 'ROWS_AND_COLUMNS' ? { columns, rows }
      : format === 'NONE' ? null
        : rows.map(r => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
    return {
      success: true,
      results,
      meta: {
        served_by: 'workerd-d1', duration: Date.now() - t0, changes: changes.n, last_row_id: changes.id,
        changed_db: cursor.rowsWritten > 0, size_after: this.ctx.storage.sql.databaseSize,
        rows_read: cursor.rowsRead, rows_written: cursor.rowsWritten,
      },
    };
  }
}

// The fetcher of the D1 API: every query goes to the one database.
export default {
  fetch(request, env) {
    return env.DB.get(env.DB.idFromName('games-log')).fetch(request);
  },
};
