/**
 * Vitest globalSetup — runs ONCE in the main thread before any workers spawn.
 * Responsible for initialising the test database schema.
 * Workers each set DATABASE_URL via vitest.config.mjs env before module load.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Pool } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: join(__dirname, '../../../.env.test') });

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://petlar_user:petlar_password@localhost:5432/petlar_test';

/**
 * Run once before all tests.
 */
export async function setup() {
  // Expose to the global-setup's own process (workers receive it via vitest config env).
  process.env.DATABASE_URL = testDbUrl;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
  process.env.PG_SSL = 'false';

  // Verify we are NOT pointing at a production database.
  if (
    testDbUrl.includes('supabase.co') ||
    testDbUrl.includes('render.com') ||
    testDbUrl.includes('neon.tech')
  ) {
    throw new Error(
      'TEST_DATABASE_URL appears to be a production database. ' +
        'Tests must run against a dedicated local test database.'
    );
  }

  // Dynamic import ensures the pool is created with the updated env vars.
  const { initDb } = await import('../../../db.js');
  await initDb();

  console.log(`[test] Database initialised at: ${testDbUrl.replace(/:([^@]+)@/, ':***@')}`);
}

/**
 * Run once after all tests finish.
 */
export async function teardown() {
  // Gracefully close the pool used during globalSetup.
  try {
    const dbModule = await import('../../../db.js');
    if (dbModule.pool && typeof dbModule.pool.end === 'function') {
      await dbModule.pool.end();
    }
  } catch {
    // Non-fatal — process is exiting anyway.
  }
}
