/**
 * Playwright globalSetup — runs ONCE before all E2E tests.
 * Truncates the test database so E2E tests start with a clean state.
 */
const { config } = require('dotenv');
const path = require('path');
const { Pool } = require('pg');

config({ path: path.join(__dirname, '../../.env.test') });

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://petlar_user:petlar_password@localhost:5432/petlar_test';

module.exports = async function globalSetup() {
  // Safety guard
  if (
    testDbUrl.includes('supabase.co') ||
    testDbUrl.includes('render.com') ||
    testDbUrl.includes('neon.tech')
  ) {
    throw new Error(
      'TEST_DATABASE_URL appears to be a production database. ' +
        'E2E tests must run against a dedicated local test database.'
    );
  }

  const pool = new Pool({ connectionString: testDbUrl, ssl: false, max: 2 });
  try {
    await pool.query(
      'TRUNCATE adoption_requests, animals, users RESTART IDENTITY CASCADE'
    );
    console.log('[e2e] Test database truncated successfully.');
  } finally {
    await pool.end();
  }
};
