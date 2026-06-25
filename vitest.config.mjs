import { defineConfig } from 'vitest/config';

// Dedicated port for the embedded PostgreSQL test server.
// globalSetup will start an embedded PG instance on this exact port.
// Workers read DATABASE_URL from env below — both point to the same instance.
const EMBEDDED_PG_PORT = 25432;
const EMBEDDED_PG_URL = `postgresql://petlar_test_user:petlar_test_pass@localhost:${EMBEDDED_PG_PORT}/petlar_test`;

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    maxConcurrency: 1,

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

    // Injected into every worker BEFORE any module loads.
    // Workers always connect to the embedded PG instance started by globalSetup.
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret-do-not-use-in-production',
      DATABASE_URL: EMBEDDED_PG_URL,
      PG_SSL: 'false',
      PG_FAMILY: '4',
      PORT: '0',
    },
  },
});
