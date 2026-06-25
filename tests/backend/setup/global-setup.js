/**
 * Vitest globalSetup — runs ONCE in the main thread before any workers spawn.
 *
 * Strategy:
 *  1. Try to connect to an existing PostgreSQL (TEST_DATABASE_URL / local default).
 *  2. If unavailable, start an embedded PostgreSQL process automatically.
 *  3. Run schema migration (initDb) on the test database.
 *  4. On teardown, stop the embedded instance if one was started.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Pool } from 'pg';
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: join(__dirname, '../../../.env.test') });

// Must match vitest.config.mjs EMBEDDED_PG_PORT.
const EMBEDDED_PG_PORT = 25432;
const EMBEDDED_PG_USER = 'petlar_test_user';
const EMBEDDED_PG_PASS = 'petlar_test_pass';
const EMBEDDED_PG_DB   = 'petlar_test';
const EMBEDDED_PG_URL  = `postgresql://${EMBEDDED_PG_USER}:${EMBEDDED_PG_PASS}@localhost:${EMBEDDED_PG_PORT}/${EMBEDDED_PG_DB}`;
const EMBEDDED_INITDB_FLAGS = ['--locale=English_United States.1252', '--lc-messages=en_US'];

let embeddedPg = null;

async function canConnect(url) {
  const pool = new Pool({ connectionString: url, ssl: false, connectionTimeoutMillis: 3000 });
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

async function startEmbedded() {
  const EmbeddedPostgres = require('embedded-postgres').default;
  const dataDir = path.join(tmpdir(), 'petlar-test-pgdata');
  mkdirSync(dataDir, { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: EMBEDDED_PG_USER,
    password: EMBEDDED_PG_PASS,
    port: EMBEDDED_PG_PORT,
    initdbFlags: EMBEDDED_INITDB_FLAGS,
    persistent: false,
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase(EMBEDDED_PG_DB).catch(() => {}); // ignore if already exists

  embeddedPg = pg;
  return EMBEDDED_PG_URL;
}

export async function setup() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
  process.env.PG_SSL = 'false';

  const configured = process.env.TEST_DATABASE_URL || '';

  // Block obvious production databases.
  if (
    configured &&
    (configured.includes('supabase.co') ||
      configured.includes('render.com') ||
      configured.includes('neon.tech'))
  ) {
    throw new Error(
      'TEST_DATABASE_URL appears to be a production database. ' +
        'Set TEST_DATABASE_URL to a dedicated local test database, or leave it empty to use embedded PostgreSQL.'
    );
  }

  let testDbUrl = configured || EMBEDDED_PG_URL;

  const connected = await canConnect(testDbUrl);
  if (!connected) {
    console.log('[test] No external PostgreSQL available — starting embedded PostgreSQL...');
    testDbUrl = await startEmbedded();
    console.log('[test] Embedded PostgreSQL started.');
  }

  process.env.DATABASE_URL = testDbUrl;

  const { initDb } = await import('../../../db.js');
  await initDb();

  console.log(`[test] Schema ready at: ${testDbUrl.replace(/:([^@]+)@/, ':***@')}`);
}

export async function teardown() {
  if (embeddedPg) {
    try {
      await embeddedPg.stop();
      console.log('[test] Embedded PostgreSQL stopped.');
    } catch {
      // Non-fatal.
    }
  }

  // Remove temp url file.
  try {
    const { unlinkSync } = await import('fs');
    unlinkSync(join(__dirname, '../../../.test-db-url'));
  } catch {}
}
