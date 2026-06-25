/**
 * Integration tests — Cenário 3 (publicação de animal) e operações relacionadas.
 * Uses a real test PostgreSQL database.
 */
import { describe, test, expect } from 'vitest';
import { app } from '../../../server.js';
import { USERS, ANIMALS } from '../fixtures/index.js';
import {
  createAuthenticatedUser,
  createAnimal,
  getAnimals,
  getAnimal,
  updateAnimal,
  unpublishAnimal,
} from '../helpers/api.js';

// ─────────────────────────────────────────────────────────────────────────────
// Cenário 3 — Publicação de animal
// ─────────────────────────────────────────────────────────────────────────────
describe('Cenário 3 — Publicação de animal', () => {
  test('publica um animal com sucesso quando autenticado', async () => {
    const token = await createAuthenticatedUser(app, USERS.alice);
    const res = await createAnimal(app, token, ANIMALS.dog);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.animal).toMatchObject({
      name: ANIMALS.dog.petName,
      status: 'available',
    });
  });

  test('retorna 401 ao tentar publicar animal sem autenticação', async () => {
    const res = await createAnimal(app, '', ANIMALS.dog);
    expect(res.status).toBe(401);
  });

  test('retorna 400 quando nome do animal está faltando', async () => {
    const token = await createAuthenticatedUser(app, USERS.alice);
    const { petName: _, ...withoutName } = ANIMALS.dog;
    const res = await createAnimal(app, token, { ...withoutName, species: 'Cachorro', description: 'ok' });
    expect(res.status).toBe(400);
  });

  test('retorna 400 quando descrição está faltando', async () => {
    const token = await createAuthenticatedUser(app, USERS.alice);
    const res = await createAnimal(app, token, { petName: 'X', species: 'Gato' });
    expect(res.status).toBe(400);
  });

  test('animal publicado aparece na listagem pública', async () => {
    const token = await createAuthenticatedUser(app, USERS.alice);
    await createAnimal(app, token, ANIMALS.dog);

    const res = await getAnimals(app);
    expect(res.status).toBe(200);
    expect(res.body.data.animals.some((a) => a.name === ANIMALS.dog.petName)).toBe(true);
  });

  test('GET /api/animals/:id retorna os dados do animal', async () => {
    const token = await createAuthenticatedUser(app, USERS.alice);
    const created = await createAnimal(app, token, ANIMALS.cat);
    const animalId = created.body.data.animal.id;

    const res = await getAnimal(app, animalId);
    expect(res.status).toBe(200);
    expect(res.body.data.animal.id).toBe(animalId);
  });

  test('GET /api/animals/:id retorna 404 para animal inexistente', async () => {
    const res = await getAnimal(app, 99999);
    expect(res.status).toBe(404);
  });

  test('dono consegue editar o próprio animal disponível', async () => {
    const token = await createAuthenticatedUser(app, USERS.alice);
    const created = await createAnimal(app, token, ANIMALS.dog);
    const animalId = created.body.data.animal.id;

    const res = await updateAnimal(app, token, animalId, {
      ...ANIMALS.dog,
      petName: 'Rex Editado',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.animal.name).toBe('Rex Editado');
  });

  test('outro usuário não pode editar animal alheio', async () => {
    const aliceToken = await createAuthenticatedUser(app, USERS.alice);
    const bobToken = await createAuthenticatedUser(app, USERS.bob);
    const created = await createAnimal(app, aliceToken, ANIMALS.dog);
    const animalId = created.body.data.animal.id;

    const res = await updateAnimal(app, bobToken, animalId, ANIMALS.dog);
    expect(res.status).toBe(403);
  });

  test('dono consegue despublicar o próprio animal sem solicitações pendentes', async () => {
    const token = await createAuthenticatedUser(app, USERS.alice);
    const created = await createAnimal(app, token, ANIMALS.dog);
    const animalId = created.body.data.animal.id;

    const res = await unpublishAnimal(app, token, animalId);
    expect(res.status).toBe(200);
  });

  test('não pode despublicar animal com solicitações pendentes', async () => {
    const aliceToken = await createAuthenticatedUser(app, USERS.alice);
    const bobToken = await createAuthenticatedUser(app, USERS.bob);

    const created = await createAnimal(app, aliceToken, ANIMALS.dog);
    const animalId = created.body.data.animal.id;

    // Bob solicita adoção
    const { requestAdoption } = await import('../helpers/api.js');
    await requestAdoption(app, bobToken, animalId);

    const res = await unpublishAnimal(app, aliceToken, animalId);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pendentes/i);
  });
});
