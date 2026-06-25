/**
 * Integration tests — Cenários 1 (cadastro) e 2 (login).
 * Uses a real test PostgreSQL database.
 */
import { describe, test, expect } from 'vitest';
import { app } from '../../../server.js';
import { USERS } from '../fixtures/index.js';
import { registerUser, loginUser, getMe, createAuthenticatedUser } from '../helpers/api.js';

// ─────────────────────────────────────────────────────────────────────────────
// Cenário 1 — Cadastro de usuário
// ─────────────────────────────────────────────────────────────────────────────
describe('Cenário 1 — Cadastro de usuário', () => {
  test('registra um novo usuário com sucesso', async () => {
    const res = await registerUser(app, USERS.alice);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({
      name: USERS.alice.name,
      email: USERS.alice.email,
    });
    // Senha nunca deve ser exposta na resposta.
    expect(res.body.data.user.password_hash).toBeUndefined();
    expect(res.body.data.user.password).toBeUndefined();
  });

  test('rejeita cadastro sem nome', async () => {
    const res = await registerUser(app, { email: 'x@x.com', password: 'pass123' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('rejeita cadastro sem e-mail', async () => {
    const res = await registerUser(app, { name: 'X', password: 'pass123' });
    expect(res.status).toBe(400);
  });

  test('rejeita cadastro sem senha', async () => {
    const res = await registerUser(app, { name: 'X', email: 'x@x.com' });
    expect(res.status).toBe(400);
  });

  test('retorna 409 ao cadastrar e-mail já existente', async () => {
    await registerUser(app, USERS.alice);
    const res = await registerUser(app, { ...USERS.alice, name: 'Outra Alice' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/já existe/i);
  });

  test('normaliza e-mail para lowercase', async () => {
    const res = await registerUser(app, {
      ...USERS.alice,
      email: 'ALICE@PETLAR-TEST.EXAMPLE',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('alice@petlar-test.example');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cenário 2 — Login
// ─────────────────────────────────────────────────────────────────────────────
describe('Cenário 2 — Login', () => {
  test('faz login com sucesso e retorna JWT', async () => {
    await registerUser(app, USERS.alice);
    const res = await loginUser(app, {
      email: USERS.alice.email,
      password: USERS.alice.password,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    // Token deve ser uma string JWT (3 partes separadas por ".")
    expect(res.body.data.token.split('.')).toHaveLength(3);
  });

  test('rejeita senha incorreta', async () => {
    await registerUser(app, USERS.alice);
    const res = await loginUser(app, {
      email: USERS.alice.email,
      password: 'senhaErrada',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/inválidos/i);
  });

  test('rejeita e-mail inexistente', async () => {
    const res = await loginUser(app, {
      email: 'ghost@nowhere.example',
      password: 'irrelevant',
    });

    expect(res.status).toBe(401);
  });

  test('retorna 400 quando e-mail não é fornecido', async () => {
    const res = await loginUser(app, { password: 'pass' });
    expect(res.status).toBe(400);
  });

  test('retorna 400 quando senha não é fornecida', async () => {
    const res = await loginUser(app, { email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  test('token retornado permite acessar GET /api/me', async () => {
    const token = await createAuthenticatedUser(app, USERS.alice);
    const res = await getMe(app, token);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(USERS.alice.email);
  });

  test('GET /api/me rejeita requisição sem token', async () => {
    const res = await getMe(app, '');
    expect(res.status).toBe(401);
  });

  test('bloqueia login de usuário suspenso', async () => {
    // Registrar usuário
    const regRes = await registerUser(app, USERS.bob);
    const bobId = regRes.body.data.user.id;

    // Promover alice para admin e suspender bob
    const adminToken = await createAuthenticatedUser(app, {
      ...USERS.alice,
      email: 'adminfortest@petlar-test.example',
    });
    // Promover para admin via db helper para evitar dependência de outros testes
    const { promoteToAdmin } = await import('../helpers/db.js');
    const { getUserByEmail } = await import('../helpers/db.js');
    const adminUser = await getUserByEmail('adminfortest@petlar-test.example');
    await promoteToAdmin(adminUser.id);

    const freshAdminToken = await (await import('../helpers/api.js')).createAuthenticatedUser(
      app,
      { email: 'adminfortest@petlar-test.example', password: USERS.alice.password }
    );

    await import('../helpers/api.js').then((m) =>
      m.adminSuspendUser(app, freshAdminToken, bobId, 'Teste de suspensão')
    );

    const loginRes = await loginUser(app, { email: USERS.bob.email, password: USERS.bob.password });
    expect(loginRes.status).toBe(403);
    expect(loginRes.body.error).toMatch(/suspensa/i);
  });
});
