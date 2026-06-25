/**
 * vitest.unit.config.mjs
 * Runs ONLY unit tests — no real PostgreSQL required.
 * Unit tests mock the db module entirely.
 */
import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '.env.test') });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/backend/unit/**/*.test.js'],
    // No globalSetup or setupFiles that need a real DB.
    testTimeout: 15_000,
    reporters: ['verbose'],
    pool: 'vmForks',
    poolOptions: { vmForks: { memoryLimit: '512MB' } },
    coverage: {
      provider: 'v8',
      include: ['server.js'],
      exclude: ['node_modules/**', 'tests/**', 'db.js'],
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/unit',
    },
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret-do-not-use-in-production',
      DATABASE_URL: 'postgresql://petlar_user:dummy@localhost:5432/petlar_test',
      PG_SSL: 'false',
      PORT: '0',
    },
  },
});
