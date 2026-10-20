// Creates the log_lines table of migrations/ in the D1 of the tests. applyD1Migrations skips a migration it already ran.
import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.LOG, env.TEST_MIGRATIONS);
