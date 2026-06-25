/**
 * Unit tests — auth middleware (JWT) behaviour.
 * The db module is mocked so no real DB is needed.
 */
import { vi, describe, test, expect, beforeEach } from 'vitest';

// ── Mock db module BEFORE importing server ────────────────────────────────────
vi.mock('../../../db.js', () => ({
  initDb: vi.fn().mockResolvedValue(undefined),
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  getAdmins: vi.fn().mockResolvedValue([]),
  countAdmins: vi.fn().mockResolvedValue(0),
  setUserRole: vi.fn(),
  setUserSuspension: vi.fn(),
  getAllUsers: vi.fn().mockResolvedValue([]),
  getAnimals: vi.fn().mockResolvedValue([]),
  getAnimalsByUser: vi.fn().mockResolvedValue([]),
  getAnimalsHistoryByUser: vi.fn().mockResolvedValue([]),
  getAllAnimalsAdmin: vi.fn().mockResolvedValue([]),
  getAdoptionRequestsByUser: vi.fn().mockResolvedValue([]),
  getAdoptionRequestsByUserForAnimal: vi.fn().mockResolvedValue([]),
  getAdoptionRequestsForUserAnimals: vi.fn().mockResolvedValue([]),
  getAllAdoptionRequestsAdmin: vi.fn().mockResolvedValue([]),
  getAnimalById: vi.fn(),
  setAnimalHidden: vi.fn(),
  getSystemMetrics: vi.fn().mockResolvedValue({}),
  getAdoptionRequestById: vi.fn(),
  createAdoptionRequest: vi.fn(),
  updateAdoptionRequestStatus: vi.fn(),
  approveAdoptionRequestWithTransaction: vi.fn(),
  unpublishAnimal: vi.fn(),
  createAnimal: vi.fn(),
  updateAnimal: vi.fn(),
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../server.js';
import * as db from '../../../db.js';

const JWT_SECRET = process.env.JWT_SECRET;

const MOCK_USER = {
  id: 1,
  name: 'Test User',
  email: 'user@test.example',
  role: 'user',
  is_suspended: false,
  suspended_at: null,
  suspension_reason: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Token validation ──────────────────────────────────────────────────────────

describe('authenticate middleware', () => {
  test('rejects requests with no Authorization header', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('rejects requests with a malformed Bearer token', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer not.a.valid.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/inválido|expirado/i);
  });

  test('rejects tokens signed with a wrong secret', async () => {
    const badToken = jwt.sign({ id: 1, email: 'x@x.com', role: 'user' }, 'wrong-secret');
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(401);
  });

  test('rejects expired tokens', async () => {
    const expiredToken = jwt.sign(
      { id: 1, email: 'x@x.com', role: 'user' },
      JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  test('accepts valid tokens and returns user data', async () => {
    db.getUserById.mockResolvedValue(MOCK_USER);

    const token = jwt.sign({ id: 1, email: MOCK_USER.email, role: 'user' }, JWT_SECRET, {
      expiresIn: '1h',
    });

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(MOCK_USER.email);
  });

  test('blocks suspended users after token validation', async () => {
    db.getUserById.mockResolvedValue({
      ...MOCK_USER,
      is_suspended: true,
      suspended_at: new Date().toISOString(),
      suspension_reason: 'Violação de termos',
    });

    const token = jwt.sign({ id: 1, email: MOCK_USER.email, role: 'user' }, JWT_SECRET, {
      expiresIn: '1h',
    });

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/suspensa/i);
  });
});

// ── Admin access guard ────────────────────────────────────────────────────────

describe('requireAdmin middleware', () => {
  test('blocks non-admin users from admin routes', async () => {
    db.getUserById.mockResolvedValue(MOCK_USER);

    const token = jwt.sign({ id: 1, email: MOCK_USER.email, role: 'user' }, JWT_SECRET, {
      expiresIn: '1h',
    });

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/administradores/i);
  });

  test('allows admin users to access admin routes', async () => {
    const adminUser = { ...MOCK_USER, role: 'admin' };
    db.getUserById.mockResolvedValue(adminUser);
    db.getAllUsers.mockResolvedValue([adminUser]);

    const token = jwt.sign({ id: 1, email: adminUser.email, role: 'admin' }, JWT_SECRET, {
      expiresIn: '1h',
    });

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

// ── Login input validation ────────────────────────────────────────────────────

describe('POST /api/login — input validation (mocked db)', () => {
  test('returns 400 when email is missing', async () => {
    const res = await request(app).post('/api/login').send({ password: 'pass' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when password is missing', async () => {
    const res = await request(app).post('/api/login').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  test('returns 401 for non-existent user', async () => {
    db.getUserByEmail.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'ghost@test.example', password: 'whatever' });
    expect(res.status).toBe(401);
  });
});
