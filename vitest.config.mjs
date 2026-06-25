import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load test env vars into the config process so they're available for the env block below.
config({ path: join(__dirname, '.env.test') });

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://petlar_user:petlar_password@localhost:5432/petlar_test';

export default defineConfig({
  test: {
    environment: 'node',

    // Backend integration + unit tests only.
    include: ['tests/backend/**/*.test.js'],
    exclude: ['node_modules', 'tests/e2e'],

    // Global setup runs once (in main thread) before any worker spawns.
    globalSetup: ['./tests/backend/setup/global-setup.js'],

    // Per-file setup runs in each worker before every test file.
    setupFiles: ['./tests/backend/setup/per-test-setup.js'],

    // Prevent tests from running in parallel — DB state must be predictable.
    sequence: { concurrent: false },
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },

    testTimeout: 30_000,
    hookTimeout: 30_000,

    coverage: {
      provider: 'v8',
      include: ['server.js', 'db.js'],
      exclude: ['node_modules/**', 'tests/**', 'uploads/**'],
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/backend',
      thresholds: {
        global: {
          branches: 55,
          functions: 65,
          lines: 65,
          statements: 65,
        },
      },
    },

    // These env vars are injected into every worker process BEFORE any module loads.
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret-do-not-use-in-production',
      DATABASE_URL: testDatabaseUrl,
      PG_SSL: 'false',
      PORT: '0',
    },
  },
});
