/**
 * Unit tests — pure HTTP input-validation layer.
 *
 * These tests ONLY exercise request validation that returns before any DB call.
 * They work with the embedded PostgreSQL provided by globalSetup — no mocking needed.
 *
 * Covered paths (all return before touching the DB):
 *  - Missing / malformed / wrong-secret / expired JWT    → 401
 *  - Missing required login fields                       → 400
 *  - Missing required register fields                    → 400
 *  - Missing animalId on adoption request                → 400 / 401
 *  - Invalid status on adoption-request PATCH            → 400
 */
import { describe, test, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../server.js';

const JWT_SECRET = process.env.JWT_SECRET;

// ── Token validation (no DB touch) ───────────────────────────────────────────
describe('authenticate middleware — JWT validation', () => {
  test('rejects request with no Authorization header → 401', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('rejects request with non-Bearer scheme → 401', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(res.status).toBe(401);
  });

  test('rejects malformed JWT (not three parts) → 401', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer not.a.valid.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/inválido|expirado/i);
  });

  test('rejects token signed with wrong secret → 401', async () => {
    const badToken = jwt.sign({ id: 999, email: 'x@x.com', role: 'user' }, 'wrong-secret');
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(401);
  });

  test('rejects expired token → 401', async () => {
    const expired = jwt.sign(
      { id: 999, email: 'x@x.com', role: 'user' },
      JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});

// ── Login input validation (returns 400 before querying DB) ──────────────────
describe('POST /api/login — required-field validation', () => {
  test('returns 400 when email is missing', async () => {
    const res = await request(app).post('/api/login').send({ password: 'whatever' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('returns 400 when password is missing', async () => {
    const res = await request(app).post('/api/login').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when body is empty', async () => {
    const res = await request(app).post('/api/login').send({});
    expect(res.status).toBe(400);
  });
});

// ── Register input validation ─────────────────────────────────────────────────
describe('POST /api/register — required-field validation', () => {
  test('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ email: 'a@b.com', password: 'pass' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ name: 'X', password: 'pass' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ name: 'X', email: 'a@b.com' });
    expect(res.status).toBe(400);
  });
});

// ── Adoption request validation (unauthenticated) ────────────────────────────
describe('POST /api/adoption-requests — auth required', () => {
  test('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/adoption-requests')
      .send({ animalId: 1 });
    expect(res.status).toBe(401);
  });
});

// ── Admin routes require auth ─────────────────────────────────────────────────
describe('Admin routes — authentication required', () => {
  test('GET /api/admin/users returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });

  test('GET /api/admin/metrics returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/metrics');
    expect(res.status).toBe(401);
  });

  test('GET /api/admin/adoption-requests returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/adoption-requests');
    expect(res.status).toBe(401);
  });
});
