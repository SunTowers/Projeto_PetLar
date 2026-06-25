/**
 * E2E — Cenários 4-10: Fluxo de adoção.
 *
 * State is set up via API calls; UI interactions validate the frontend behaviour.
 */
const { test, expect } = require('@playwright/test');
const { registerUser, loginUser, createAnimalViaApi, requestAdoptionViaApi } = require('../helpers/api');

const RUN_ID = Date.now();

const DONOR = {
  name: `Donor Adopt E2E ${RUN_ID}`,
  email: `e2e-adopt-donor-${RUN_ID}@petlar-test.example`,
  password: 'DonorAdopt123!',
};
const ADOPTER = {
  name: `Adopter E2E ${RUN_ID}`,
  email: `e2e-adopter-${RUN_ID}@petlar-test.example`,
  password: 'AdopterPass123!',
};

let donorToken;
let adopterToken;
let testAnimalId;

test.describe('Cenários 4-10 — Fluxo completo de adoção', () => {
  test.beforeAll(async ({ request }) => {
    await registerUser(request, DONOR);
    await registerUser(request, ADOPTER);
    donorToken = await loginUser(request, { email: DONOR.email, password: DONOR.password });
    adopterToken = await loginUser(request, { email: ADOPTER.email, password: ADOPTER.password });

    const animal = await createAnimalViaApi(request, donorToken, {
      petName: `Pet Adoção E2E ${RUN_ID}`,
      species: 'Cachorro',
      description: 'Animal para teste de fluxo de adoção E2E.',
    });
    testAnimalId = animal?.id;
  });

  // ── Cenário 4 ── Solicitação de adoção via UI ─────────────────────────────
  test('Cenário 4 — adotante logado vê botão "Quero Adotar" na página do animal', async ({ page }) => {
    // Log adopter in via localStorage injection (faster than UI login).
    await page.goto('/home.html');
    await page.evaluate((token) => localStorage.setItem('token', token), adopterToken);

    await page.goto(`/animal_details.html?id=${testAnimalId}`);
    await page.waitForTimeout(2000);

    const adoptBtn = page.locator('#adoptAnimalButton');
    await expect(adoptBtn).toBeVisible({ timeout: 6000 });
  });

  test('Cenário 4 — adotante consegue solicitar adoção na página de adoção', async ({ page }) => {
    await page.goto('/home.html');
    await page.evaluate((token) => localStorage.setItem('token', token), adopterToken);

    await page.goto(`/animal_adoption.html?id=${testAnimalId}`);
    await page.waitForTimeout(2000);

    // The page should show the "Solicitar adoção" button for logged-in users.
    const requestSection = page.locator('#adoptionRequestSection');
    await expect(requestSection).not.toHaveClass(/hidden/, { timeout: 5000 });

    page.on('dialog', async (dialog) => {
      expect(dialog.message()).toMatch(/sucesso|solicitaç/i);
      await dialog.accept();
    });

    await page.click('#requestAdoptionButton');
    await page.waitForTimeout(3000);
  });

  // ── Cenário 5 ── Cancelamento via API (UI is minimal for cancellation) ───
  test('Cenário 5 — adotante consegue cancelar solicitação pendente', async ({ request }) => {
    // Create a fresh animal and request for this specific test.
    const freshAnimal = await createAnimalViaApi(request, donorToken, {
      petName: `Cancel Test ${RUN_ID}`,
      species: 'Gato',
      description: 'Para testar cancelamento.',
    });

    const adoptReq = await requestAdoptionViaApi(request, adopterToken, freshAnimal.id);

    const cancelRes = await request.patch(`/api/adoption-requests/${adoptReq.id}`, {
      headers: { Authorization: `Bearer ${adopterToken}` },
      data: { status: 'cancelled' },
    });
    const body = await cancelRes.json();

    expect(cancelRes.status()).toBe(200);
    expect(body.data.request.status).toBe('cancelled');
  });

  // ── Cenário 6 ── Aprovação de solicitação ─────────────────────────────────
  test('Cenário 6 — dono aprova solicitação e animal muda para adotado', async ({ request }) => {
    const freshAnimal = await createAnimalViaApi(request, donorToken, {
      petName: `Approve Test ${RUN_ID}`,
      species: 'Cachorro',
      description: 'Para testar aprovação.',
    });

    const adoptReq = await requestAdoptionViaApi(request, adopterToken, freshAnimal.id);

    const approveRes = await request.patch(`/api/adoption-requests/${adoptReq.id}`, {
      headers: { Authorization: `Bearer ${donorToken}` },
      data: { status: 'approved' },
    });
    const body = await approveRes.json();

    expect(approveRes.status()).toBe(200);
    expect(body.data.request.status).toBe('approved');

    // Verify animal status via public API.
    const animalRes = await request.get(`/api/animals/${freshAnimal.id}`);
    const animalBody = await animalRes.json();
    expect(animalBody.data.animal.status).toBe('adopted');
  });

  // ── Cenário 7 ── Rejeição de solicitação ─────────────────────────────────
  test('Cenário 7 — dono rejeita solicitação pendente', async ({ request }) => {
    const freshAnimal = await createAnimalViaApi(request, donorToken, {
      petName: `Reject Test ${RUN_ID}`,
      species: 'Gato',
      description: 'Para testar rejeição.',
    });

    const adoptReq = await requestAdoptionViaApi(request, adopterToken, freshAnimal.id);

    const rejectRes = await request.patch(`/api/adoption-requests/${adoptReq.id}`, {
      headers: { Authorization: `Bearer ${donorToken}` },
      data: { status: 'rejected' },
    });
    const body = await rejectRes.json();

    expect(rejectRes.status()).toBe(200);
    expect(body.data.request.status).toBe('rejected');
  });

  // ── Cenário 8 ── Usuário tentando adotar o próprio animal ─────────────────
  test('Cenário 8 — dono não pode solicitar adoção do próprio animal', async ({ request }) => {
    const res = await request.post('/api/adoption-requests', {
      headers: { Authorization: `Bearer ${donorToken}` },
      data: { animalId: testAnimalId },
    });
    const body = await res.json();

    expect(res.status()).toBe(400);
    expect(body.error).toMatch(/publicou/i);
  });

  // ── Cenário 9 ── Animal adotado não aceita novas solicitações ────────────
  test('Cenário 9 — animal adotado não recebe nova solicitação', async ({ request }) => {
    // Create a third user as a second adopter.
    const ADOPTER2 = {
      name: `Adopter2 E2E ${RUN_ID}`,
      email: `e2e-adopter2-${RUN_ID}@petlar-test.example`,
      password: 'Adopter2Pass123!',
    };
    await registerUser(request, ADOPTER2);
    const adopter2Token = await loginUser(request, {
      email: ADOPTER2.email,
      password: ADOPTER2.password,
    });

    // Create animal, approve first adoption.
    const freshAnimal = await createAnimalViaApi(request, donorToken, {
      petName: `Already Adopted ${RUN_ID}`,
      species: 'Cachorro',
      description: 'Já adotado.',
    });
    const req1 = await requestAdoptionViaApi(request, adopterToken, freshAnimal.id);
    await request.patch(`/api/adoption-requests/${req1.id}`, {
      headers: { Authorization: `Bearer ${donorToken}` },
      data: { status: 'approved' },
    });

    // Second adopter tries to request — should fail.
    const res = await request.post('/api/adoption-requests', {
      headers: { Authorization: `Bearer ${adopter2Token}` },
      data: { animalId: freshAnimal.id },
    });
    const body = await res.json();

    expect(res.status()).toBe(400);
    expect(body.error).toMatch(/disponível/i);
  });

  // ── Cenário 10 ── Rejeição automática das demais após aprovação ──────────
  test('Cenário 10 — outras solicitações são rejeitadas automaticamente na aprovação', async ({ request }) => {
    const ADOPTER3 = {
      name: `Adopter3 E2E ${RUN_ID}`,
      email: `e2e-adopter3-${RUN_ID}@petlar-test.example`,
      password: 'Adopter3Pass123!',
    };
    await registerUser(request, ADOPTER3);
    const adopter3Token = await loginUser(request, {
      email: ADOPTER3.email,
      password: ADOPTER3.password,
    });

    const freshAnimal = await createAnimalViaApi(request, donorToken, {
      petName: `Multi-Request ${RUN_ID}`,
      species: 'Gato',
      description: 'Múltiplas solicitações.',
    });

    const req1 = await requestAdoptionViaApi(request, adopterToken, freshAnimal.id);
    const req2 = await requestAdoptionViaApi(request, adopter3Token, freshAnimal.id);

    // Approve req1 → req2 should become rejected.
    await request.patch(`/api/adoption-requests/${req1.id}`, {
      headers: { Authorization: `Bearer ${donorToken}` },
      data: { status: 'approved' },
    });

    // Fetch adopter3's requests to verify auto-rejection.
    const myReqsRes = await request.get('/api/adoption-requests/my', {
      headers: { Authorization: `Bearer ${adopter3Token}` },
    });
    const myReqsBody = await myReqsRes.json();
    const rejected = myReqsBody.data.requests.find((r) => r.animal_id === freshAnimal.id);

    expect(rejected?.status).toBe('rejected');
  });
});
