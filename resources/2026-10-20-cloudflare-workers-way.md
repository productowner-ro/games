# How the games run on Cloudflare Workers

Research for the issue "Research how the games run on Cloudflare Workers". Date of the reads: 2026-10-20.

## The answer

One Worker serves the three games as static assets and runs the code of `/api/*`. The Worker holds the TypeSafe key as a Worker secret. Two parts of the Node servers have no direct match on Workers: the chess log file and the count of the daily cap. A Durable Object holds the count, D1 holds the log lines, and `wrangler d1 export` reads the log back.

## One Worker for three games and the key

- **Static assets.** The Worker config names an assets directory. "If a requested URL matches a file in the static assets directory, that file will be served" without the Worker code (https://developers.cloudflare.com/workers/static-assets/).
- **Three games in one directory.** The directory holds `tetris/`, `chess/` and `mitropoly/`. With the default `html_handling`, `/chess/` serves `chess/index.html` (https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/). The pages load their script with a relative path, so they need no change.
- **The API routes.** `run_worker_first = [ "/api/*" ]` sends `/api/jev` and `/api/log` to the Worker script (https://developers.cloudflare.com/workers/static-assets/).
- **Cost.** "Requests to static assets are free and unlimited." Requests to the script count as Worker requests (https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/). Workers Free allows 100,000 requests per day (https://developers.cloudflare.com/workers/platform/limits/). The daily cap of Jev calls must sit below that.
- **The key.** `npx wrangler secret put TYPESAFE_API_KEY` stores it, and the script reads `env.TYPESAFE_API_KEY` (https://developers.cloudflare.com/workers/configuration/secrets/).
- **The proxy.** The Node handler of `/api/jev` calls TypeSafe with `fetch`. A Worker has the same `fetch`, so the handler moves with few changes.

## What has no direct match on Workers

1. **The daily count: a Durable Object.** KV is eventually consistent and "not ideal for applications where you need support for atomic operations" (https://developers.cloudflare.com/kv/concepts/how-kv-works/). A Durable Object has "strongly consistent storage" (https://developers.cloudflare.com/durable-objects/what-are-durable-objects/). Durable Objects with SQLite storage run on Workers Free (https://developers.cloudflare.com/durable-objects/platform/pricing/).
2. **The chess log lines: D1.** Today `/api/log` appends to `areas/chess/games.log`, and a Worker has no file system. D1 stores one row per line (https://developers.cloudflare.com/d1/worker-api/). R2 has no append (https://developers.cloudflare.com/r2/api/workers/workers-api-reference/). Workers Logs keeps lines 3 days on Free (https://developers.cloudflare.com/workers/observability/logs/workers-logs/).
3. **Reading the log back: `wrangler d1 export`.** No `games.log` file exists on Workers. `npx wrangler d1 export <database> --remote --output=./database.sql` exports the rows (https://developers.cloudflare.com/d1/best-practices/import-export-data/).
