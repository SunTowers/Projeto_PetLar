/**
 * Direct database helpers for backend tests.
 * These bypass the HTTP layer for test setup/teardown that would otherwise
 * be too verbose (e.g., promoting a user to admin).
 */
import { Pool } from 'pg';

let _pool;

function pool() {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
      max: 2,
    });
  }
  return _pool;
}

export async function promoteToAdmin(userId) {
  await pool().query("UPDATE users SET role = 'admin' WHERE id = $1", [userId]);
}

export async function getUserByEmail(email) {
  const { rows } = await pool().query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0];
}

export async function getAdoptionRequestsByAnimal(animalId) {
  const { rows } = await pool().query(
    'SELECT * FROM adoption_requests WHERE animal_id = $1',
    [animalId]
  );
  return rows;
}

export async function closeDbHelperPool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
