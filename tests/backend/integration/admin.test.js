/**
 * Integration tests — Cenário 11: controle de acesso administrativo.
 * Uses a real test PostgreSQL database.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { app } from '../../../server.js';
import { ANIMALS } from '../fixtures/index.js';
import {
  createAuthenticatedUser,
  createAnimal,
  adminGetUsers,
  adminSetRole,
  adminSuspendUser,
  adminReactivateUser,
  adminHideAnimal,
  adminUnhideAnimal,
  adminGetMetrics,
  adminGetAdoptionRequests,
  registerUser,
} from '../helpers/api.js';
import { promoteToAdmin } from '../helpers/db.js';

// ─── Tokens re-created before each test ──────────────────────────────────────
let regularToken;
let adminToken;
let adminUserId;
let regularUserId;

function issueTestToken(user) {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret-do-not-use-in-production';
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    secret,
    { expiresIn: '2h' }
  );
}

async function seedAdminUsers() {
  // Use unique emails per test execution to avoid rare collisions.
  const unique = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const A_REGULAR = {
    name: 'Admin Regular',
    email: `admin-test-regular-${unique}@petlar-test.example`,
    password: 'RegPass123!'
  };
  const A_ADMIN = {
    name: 'Admin Tester',
    email: `admin-test-admin-${unique}@petlar-test.example`,
    password: 'AdminPass000!'
  };

  const aliceRes = await registerUser(app, A_REGULAR);
  expect(aliceRes.status).toBe(201);
  regularUserId = aliceRes.body.data.user.id;
  regularToken = issueTestToken({
    id: regularUserId,
    email: A_REGULAR.email,
    role: 'user'
  });

  const adminRes = await registerUser(app, A_ADMIN);
  expect(adminRes.status).toBe(201);
  adminUserId = adminRes.body.data.user.id;

  await promoteToAdmin(adminUserId);
  adminToken = issueTestToken({
    id: adminUserId,
    email: A_ADMIN.email,
    role: 'admin'
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cenário 11 — Controle de acesso administrativo
// ─────────────────────────────────────────────────────────────────────────────

describe('Cenário 11 — Controle de acesso: bloqueio de usuário comum', () => {
  beforeEach(seedAdminUsers);

  test('GET /api/admin/users retorna 403 para usuário comum', async () => {
    const res = await adminGetUsers(app, regularToken);
    expect(res.status).toBe(403);
  });

  test('GET /api/admin/metrics retorna 403 para usuário comum', async () => {
    const res = await adminGetMetrics(app, regularToken);
    expect(res.status).toBe(403);
  });

  test('GET /api/admin/adoption-requests retorna 403 para usuário comum', async () => {
    const res = await adminGetAdoptionRequests(app, regularToken);
    expect(res.status).toBe(403);
  });

  test('PATCH /api/admin/users/:id/role retorna 403 para usuário comum', async () => {
    const res = await adminSetRole(app, regularToken, adminUserId, 'user');
    expect(res.status).toBe(403);
  });

  test('PATCH /api/admin/users/:id/suspend retorna 403 para usuário comum', async () => {
    const res = await adminSuspendUser(app, regularToken, adminUserId);
    expect(res.status).toBe(403);
  });

  test('rotas admin retornam 401 sem token', async () => {
    const res = await adminGetUsers(app, '');
    expect(res.status).toBe(401);
  });
});

describe('Cenário 11 — Controle de acesso: permissões de administrador', () => {
  beforeEach(seedAdminUsers);

  test('admin consegue listar todos os usuários', async () => {
    const res = await adminGetUsers(app, adminToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.users)).toBe(true);
  });

  test('admin consegue promover usuário para admin', async () => {
    const res = await adminSetRole(app, adminToken, regularUserId, 'admin');

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('admin');
  });

  test('admin consegue rebaixar outro admin para usuário comum', async () => {
    // Criar segundo admin para não ficar sem admins
    const secondAdminRes = await registerUser(app, { name: 'Second Admin', email: 'admin-test-second@petlar-test.example', password: 'SecondPass!' });
    await promoteToAdmin(secondAdminRes.body.data.user.id);
    const aliceAdminRes = await adminSetRole(app, adminToken, regularUserId, 'admin');
    expect(aliceAdminRes.status).toBe(200);

    const demoteRes = await adminSetRole(app, adminToken, regularUserId, 'user');
    expect(demoteRes.status).toBe(200);
    expect(demoteRes.body.data.user.role).toBe('user');
  });

  test('admin não pode remover o único administrador', async () => {
    const res = await adminSetRole(app, adminToken, adminUserId, 'user');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/último administrador/i);
  });

  test('admin consegue suspender usuário comum', async () => {
    const res = await adminSuspendUser(app, adminToken, regularUserId, 'Motivo de teste');

    expect(res.status).toBe(200);
    expect(res.body.data.user.is_suspended).toBe(true);
    expect(res.body.data.user.suspension_reason).toBe('Motivo de teste');
  });

  test('admin consegue reativar usuário suspenso', async () => {
    await adminSuspendUser(app, adminToken, regularUserId);
    const res = await adminReactivateUser(app, adminToken, regularUserId);

    expect(res.status).toBe(200);
    expect(res.body.data.user.is_suspended).toBe(false);
  });

  test('admin não pode se auto-suspender', async () => {
    const res = await adminSuspendUser(app, adminToken, adminUserId);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/própria conta/i);
  });

  test('admin consegue ocultar anúncio de animal', async () => {
    const bobToken = await createAuthenticatedUser(app, { name: 'Anm Donor 1', email: 'admin-test-donor1@petlar-test.example', password: 'Donor1Pass!' });
    const animalRes = await createAnimal(app, bobToken, ANIMALS.dog);
    const animalId = animalRes.body.data.animal.id;

    const res = await adminHideAnimal(app, adminToken, animalId, 'Conteúdo impróprio');

    expect(res.status).toBe(200);
    expect(res.body.data.animal.is_hidden).toBe(true);
    expect(res.body.data.animal.hidden_reason).toBe('Conteúdo impróprio');
  });

  test('admin consegue reexibir anúncio oculto', async () => {
    const bobToken = await createAuthenticatedUser(app, { name: 'Anm Donor 2', email: 'admin-test-donor2@petlar-test.example', password: 'Donor2Pass!' });
    const animalRes = await createAnimal(app, bobToken, ANIMALS.dog);
    const animalId = animalRes.body.data.animal.id;

    await adminHideAnimal(app, adminToken, animalId);
    const res = await adminUnhideAnimal(app, adminToken, animalId);

    expect(res.status).toBe(200);
    expect(res.body.data.animal.is_hidden).toBe(false);
  });

  test('admin consegue ver métricas do sistema', async () => {
    const res = await adminGetMetrics(app, adminToken);

    expect(res.status).toBe(200);
    expect(res.body.data.metrics).toMatchObject({
      totalUsers: expect.any(Number),
      totalAnimals: expect.any(Number),
      totalRequests: expect.any(Number),
    });
  });

  test('admin consegue listar todas as solicitações de adoção', async () => {
    const res = await adminGetAdoptionRequests(app, adminToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.requests)).toBe(true);
  });

  test('retorna 404 ao tentar operar em usuário inexistente', async () => {
    const res = await adminSuspendUser(app, adminToken, 99999);
    expect(res.status).toBe(404);
  });

  test('retorna 400 ao tentar definir role inválida', async () => {
    const res = await adminSetRole(app, adminToken, regularUserId, 'superuser');
    expect(res.status).toBe(400);
  });
});
