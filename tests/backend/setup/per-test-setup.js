/**
 * Vitest setupFiles — runs in every worker before each test file.
 * Clears all test data so every test starts with a clean slate.
 * DATABASE_URL is set by vitest.config.mjs env (points to embedded PG on port 25432).
 */
import { beforeEach, afterAll } from 'vitest';
import { Pool } from 'pg';

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
      max: 2,
    });
  }
  return pool;
}

beforeEach(async () => {
  await getPool().query(
    'TRUNCATE adoption_requests, animals, users RESTART IDENTITY CASCADE'
  );
});

afterAll(async () => {
  if (pool) {
    await pool.end();
    pool = null;
  }
});
