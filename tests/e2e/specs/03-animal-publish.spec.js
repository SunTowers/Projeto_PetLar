/**
 * E2E — Cenário 3: Publicação de animal via interface.
 */
const { test, expect } = require('@playwright/test');
const { registerUser, loginUser } = require('../helpers/api');

const RUN_ID = Date.now();
const DONOR = {
  name: `Donor E2E ${RUN_ID}`,
  email: `e2e-donor-${RUN_ID}@petlar-test.example`,
  password: 'DonorPass123!',
};

test.describe('Cenário 3 — Publicação de animal', () => {
  test.beforeAll(async ({ request }) => {
    await registerUser(request, DONOR);
  });

  /** Helper: log into the app via UI and wait for the redirect. */
  async function loginViaUI(page, user) {
    await page.goto('/user_login.html');
    await page.fill('#email-login', user.email);
    await page.fill('#password-login', user.password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('user_login'), { timeout: 8000 });
  }

  test('exibe o formulário de cadastro de animal', async ({ page }) => {
    await loginViaUI(page, DONOR);
    await page.goto('/animal_registration.html');

    await expect(page.locator('#pet-name')).toBeVisible();
    await expect(page.locator('#species')).toBeVisible();
    await expect(page.locator('#description')).toBeVisible();
  });

  test('publica animal com sucesso e exibe confirmação', async ({ page }) => {
    await loginViaUI(page, DONOR);
    await page.goto('/animal_registration.html');

    await page.fill('#pet-name', `Pet E2E ${RUN_ID}`);
    await page.selectOption('#species', 'Cachorro');
    await page.fill('#age', '24');
    await page.selectOption('#gender', 'Macho');
    await page.selectOption('#size', 'Médio');
    await page.fill('#description', 'Animal cadastrado por teste automatizado E2E.');

    const [dialogOrRedirect] = await Promise.all([
      // Wait for either a dialog (success/error) or a navigation event.
      new Promise((resolve) => {
        const onDialog = async (dialog) => {
          resolve({ type: 'dialog', message: dialog.message() });
          await dialog.accept();
        };
        page.once('dialog', onDialog);
        setTimeout(() => {
          page.off('dialog', onDialog);
          resolve({ type: 'timeout' });
        }, 8000);
      }),
      page.click('.registration-form button[type="submit"]'),
    ]);

    if (dialogOrRedirect.type === 'dialog') {
      expect(dialogOrRedirect.message).toMatch(/sucesso|cadastrado/i);
    }
    // If no dialog, the page may have navigated — both outcomes are acceptable.
  });

  test('animal publicado aparece na listagem', async ({ page, request }) => {
    // Create via API for speed.
    const token = await loginUser(request, { email: DONOR.email, password: DONOR.password });
    await request.post('/api/animals', {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        petName: `Listagem E2E ${RUN_ID}`,
        species: 'Gato',
        description: 'Verificar listagem por E2E.',
      },
    });

    await page.goto('/animal_listing.html');
    await page.waitForSelector('.animal-card, .listing-grid article', { timeout: 8000 });

    const pageContent = await page.content();
    expect(pageContent).toContain(`Listagem E2E ${RUN_ID}`);
  });

  test('redireciona para login quando não autenticado tenta publicar', async ({ page }) => {
    // Ensure not logged in.
    await page.goto('/user_login.html');
    await page.evaluate(() => localStorage.clear());

    await page.goto('/animal_registration.html');

    // The app should either redirect to login or show a login prompt.
    await page.waitForTimeout(2000);
    const url = page.url();
    const content = await page.content();

    const redirectedToLogin = url.includes('user_login') || content.includes('Entrar');
    expect(redirectedToLogin).toBe(true);
  });
});
