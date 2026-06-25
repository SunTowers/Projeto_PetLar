/**
 * Integration tests — Cenários 4 a 10: fluxo completo de adoção.
 *
 *  4. Solicitação de adoção
 *  5. Cancelamento de solicitação
 *  6. Aprovação de solicitação
 *  7. Rejeição de solicitação
 *  8. Usuário tentando adotar o próprio animal
 *  9. Animal já adotado recebendo nova solicitação
 * 10. Rejeição automática das demais solicitações após aprovação
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { app } from '../../../server.js';
import { USERS, ANIMALS } from '../fixtures/index.js';
import {
  createAuthenticatedUser,
  createAnimal,
  requestAdoption,
  updateRequestStatus,
  getMyRequests,
  getReceivedRequests,
} from '../helpers/api.js';
import { getAdoptionRequestsByAnimal } from '../helpers/db.js';

// ─── Shared state populated in beforeEach ────────────────────────────────────
let aliceToken, bobToken, carolToken;
let animalId;

beforeEach(async () => {
  aliceToken = await createAuthenticatedUser(app, USERS.alice); // donor
  bobToken = await createAuthenticatedUser(app, USERS.bob);     // adopter 1
  carolToken = await createAuthenticatedUser(app, USERS.carol); // adopter 2

  const created = await createAnimal(app, aliceToken, ANIMALS.dog);
  animalId = created.body.data.animal.id;
});

// ─────────────────────────────────────────────────────────────────────────────
// Cenário 4 — Solicitação de adoção
// ─────────────────────────────────────────────────────────────────────────────
describe('Cenário 4 — Solicitação de adoção', () => {
  test('usuário autenticado consegue solicitar adoção', async () => {
    const res = await requestAdoption(app, bobToken, animalId, 'Quero muito adotar!');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.request.status).toBe('pending');
    expect(res.body.data.request.animal_id).toBe(animalId);
  });

  test('retorna 401 ao tentar solicitar sem autenticação', async () => {
    const res = await requestAdoption(app, '', animalId);
    expect(res.status).toBe(401);
  });

  test('retorna 400 quando animalId não é fornecido', async () => {
    const res = await requestAdoption(app, bobToken, null);
    expect(res.status).toBe(400);
  });

  test('retorna 409 ao solicitar adoção duplicada para o mesmo animal', async () => {
    await requestAdoption(app, bobToken, animalId);
    const res = await requestAdoption(app, bobToken, animalId);
    expect(res.status).toBe(409);
  });

  test('solicitação aparece em GET /api/adoption-requests/my', async () => {
    await requestAdoption(app, bobToken, animalId);
    const res = await getMyRequests(app, bobToken);

    expect(res.status).toBe(200);
    expect(res.body.data.requests.some((r) => r.animal_id === animalId)).toBe(true);
  });

  test('solicitação aparece em GET /api/adoption-requests/received para o dono', async () => {
    await requestAdoption(app, bobToken, animalId);
    const res = await getReceivedRequests(app, aliceToken);

    expect(res.status).toBe(200);
    expect(res.body.data.requests.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cenário 5 — Cancelamento de solicitação
// ─────────────────────────────────────────────────────────────────────────────
describe('Cenário 5 — Cancelamento de solicitação', () => {
  test('adotante consegue cancelar solicitação pendente própria', async () => {
    const reqRes = await requestAdoption(app, bobToken, animalId);
    const requestId = reqRes.body.data.request.id;

    const res = await updateRequestStatus(app, bobToken, requestId, 'cancelled');

    expect(res.status).toBe(200);
    expect(res.body.data.request.status).toBe('cancelled');
  });

  test('dono do animal não pode cancelar a solicitação do adotante', async () => {
    const reqRes = await requestAdoption(app, bobToken, animalId);
    const requestId = reqRes.body.data.request.id;

    const res = await updateRequestStatus(app, aliceToken, requestId, 'cancelled');
    expect(res.status).toBe(403);
  });

  test('terceiros não podem cancelar solicitação alheia', async () => {
    const reqRes = await requestAdoption(app, bobToken, animalId);
    const requestId = reqRes.body.data.request.id;

    const res = await updateRequestStatus(app, carolToken, requestId, 'cancelled');
    expect(res.status).toBe(403);
  });

  test('não é possível cancelar solicitação já aprovada', async () => {
    const reqRes = await requestAdoption(app, bobToken, animalId);
    const requestId = reqRes.body.data.request.id;

    // Aprovar primeiro
    await updateRequestStatus(app, aliceToken, requestId, 'approved');

    const cancelRes = await updateRequestStatus(app, bobToken, requestId, 'cancelled');
    expect(cancelRes.status).toBe(400);
    expect(cancelRes.body.error).toMatch(/imutáveis/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cenário 6 — Aprovação de solicitação
// ─────────────────────────────────────────────────────────────────────────────
describe('Cenário 6 — Aprovação de solicitação', () => {
  test('dono aprova solicitação pendente e animal fica adotado', async () => {
    const reqRes = await requestAdoption(app, bobToken, animalId);
    const requestId = reqRes.body.data.request.id;

    const res = await updateRequestStatus(app, aliceToken, requestId, 'approved');

    expect(res.status).toBe(200);
    expect(res.body.data.request.status).toBe('approved');
  });

  test('terceiro não pode aprovar solicitação', async () => {
    const reqRes = await requestAdoption(app, bobToken, animalId);
    const requestId = reqRes.body.data.request.id;

    const res = await updateRequestStatus(app, carolToken, requestId, 'approved');
    expect(res.status).toBe(403);
  });

  test('não é possível aprovar solicitação já aprovada novamente', async () => {
    const reqRes = await requestAdoption(app, bobToken, animalId);
    const requestId = reqRes.body.data.request.id;

    await updateRequestStatus(app, aliceToken, requestId, 'approved');

    const res = await updateRequestStatus(app, aliceToken, requestId, 'approved');
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cenário 7 — Rejeição de solicitação
// ─────────────────────────────────────────────────────────────────────────────
describe('Cenário 7 — Rejeição de solicitação', () => {
  test('dono rejeita solicitação pendente com sucesso', async () => {
    const reqRes = await requestAdoption(app, bobToken, animalId);
    const requestId = reqRes.body.data.request.id;

    const res = await updateRequestStatus(app, aliceToken, requestId, 'rejected');

    expect(res.status).toBe(200);
    expect(res.body.data.request.status).toBe('rejected');
  });

  test('terceiro não pode rejeitar solicitação alheia', async () => {
    const reqRes = await requestAdoption(app, bobToken, animalId);
    const requestId = reqRes.body.data.request.id;

    const res = await updateRequestStatus(app, carolToken, requestId, 'rejected');
    expect(res.status).toBe(403);
  });

  test('status inválido retorna 400', async () => {
    const reqRes = await requestAdoption(app, bobToken, animalId);
    const requestId = reqRes.body.data.request.id;

    const res = await updateRequestStatus(app, aliceToken, requestId, 'invalid_status');
    expect(res.status).toBe(400);
  });

  test('depois de rejeitado, adotante pode enviar nova solicitação', async () => {
    const reqRes = await requestAdoption(app, bobToken, animalId);
    const requestId = reqRes.body.data.request.id;
    await updateRequestStatus(app, aliceToken, requestId, 'rejected');

    const newReq = await requestAdoption(app, bobToken, animalId, 'Segunda tentativa');
    expect(newReq.status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cenário 8 — Usuário tentando adotar o próprio animal
// ─────────────────────────────────────────────────────────────────────────────
describe('Cenário 8 — Usuário tentando adotar o próprio animal', () => {
  test('retorna 400 ao solicitar adoção do próprio animal publicado', async () => {
    const res = await requestAdoption(app, aliceToken, animalId, 'Tentando adotar o meu próprio animal');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/publicou/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cenário 9 — Animal adotado recebendo nova solicitação
// ─────────────────────────────────────────────────────────────────────────────
describe('Cenário 9 — Animal adotado recebendo nova solicitação', () => {
  test('retorna 400 ao tentar solicitar adoção de animal já adotado', async () => {
    // Bob solicita e Alice aprova
    const reqRes = await requestAdoption(app, bobToken, animalId);
    await updateRequestStatus(app, aliceToken, reqRes.body.data.request.id, 'approved');

    // Carol tenta solicitar para o mesmo animal (agora adotado)
    const res = await requestAdoption(app, carolToken, animalId, 'Também quero');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/disponível/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cenário 10 — Rejeição automática das demais após aprovação
// ─────────────────────────────────────────────────────────────────────────────
describe('Cenário 10 — Rejeição automática das demais solicitações após aprovação', () => {
  test('ao aprovar uma solicitação, as demais ficam automaticamente rejeitadas', async () => {
    // Bob e Carol ambos solicitam adoção do mesmo animal
    const bobReqRes = await requestAdoption(app, bobToken, animalId, 'Bob quer adotar');
    const carolReqRes = await requestAdoption(app, carolToken, animalId, 'Carol quer adotar');

    const bobRequestId = bobReqRes.body.data.request.id;
    const carolRequestId = carolReqRes.body.data.request.id;

    // Alice aprova a solicitação do Bob
    const approveRes = await updateRequestStatus(app, aliceToken, bobRequestId, 'approved');
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.request.status).toBe('approved');

    // Verificar no banco que a solicitação da Carol foi rejeitada automaticamente
    const allRequests = await getAdoptionRequestsByAnimal(animalId);
    const carolRequest = allRequests.find((r) => r.id === carolRequestId);
    const bobRequest = allRequests.find((r) => r.id === bobRequestId);

    expect(bobRequest.status).toBe('approved');
    expect(carolRequest.status).toBe('rejected');
  });

  test('animal muda de status para "adopted" após aprovação', async () => {
    const reqRes = await requestAdoption(app, bobToken, animalId);
    await updateRequestStatus(app, aliceToken, reqRes.body.data.request.id, 'approved');

    const { getAnimal } = await import('../helpers/api.js');
    const animalRes = await getAnimal(app, animalId);

    expect(animalRes.body.data.animal.status).toBe('adopted');
  });
});
