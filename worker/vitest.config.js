import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// The tests apply the D1 migrations themselves (test/apply-migrations.js): the plugin does not.
const migrations = await readD1Migrations('./migrations');

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: { bindings: { TYPESAFE_API_KEY: 'test-key', DAILY_CAP: '25', TEST_MIGRATIONS: migrations } },
    }),
  ],
  test: { setupFiles: ['./test/apply-migrations.js'] },
});
