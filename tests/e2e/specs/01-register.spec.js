/**
 * E2E — Cenário 1: Cadastro de usuário via interface.
 */
const { test, expect } = require('@playwright/test');

// Unique suffix per run to avoid conflicts if tests are re-run without DB cleanup.
const RUN_ID = Date.now();

test.describe('Cenário 1 — Cadastro de usuário', () => {
  test('exibe o formulário de cadastro', async ({ page }) => {
    await page.goto('/user_registration.html');

    await expect(page.locator('#name')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#termsConsent')).toBeVisible();
  });

  test('cadastra novo usuário com sucesso', async ({ page }) => {
    await page.goto('/user_registration.html');

    await page.fill('#name', `Usuário E2E ${RUN_ID}`);
    await page.fill('#email', `e2e-register-${RUN_ID}@petlar-test.example`);
    await page.fill('#password', 'E2EPass123!');
    await page.check('#termsConsent');

    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/user_login\.html/, { timeout: 8000 });
  });

  test('exibe erro ao tentar cadastrar e-mail já existente', async ({ page, request }) => {
    const email = `e2e-dup-${RUN_ID}@petlar-test.example`;

    // Pre-register via API so the email already exists.
    await request.post('/api/register', {
      data: { name: 'Primeiro', email, password: 'FirstPass123!' },
    });

    await page.goto('/user_registration.html');
    await page.fill('#name', 'Segundo');
    await page.fill('#email', email);
    await page.fill('#password', 'SecondPass456!');
    await page.check('#termsConsent');

    // Listen for the alert dialog that the frontend shows on API error.
    page.on('dialog', async (dialog) => {
      expect(dialog.message()).toMatch(/já existe/i);
      await dialog.dismiss();
    });

    await page.click('button[type="submit"]');
    // Should stay on the registration page
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/user_registration\.html/);
  });

  test('não submete o formulário sem aceitar os termos', async ({ page }) => {
    await page.goto('/user_registration.html');

    await page.fill('#name', 'Sem Termos');
    await page.fill('#email', `e2e-noterms-${RUN_ID}@petlar-test.example`);
    await page.fill('#password', 'NoTermsPass!');
    // termsConsent NOT checked

    // The button triggers HTML5 validation or a JS check.
    await page.click('button[type="submit"]');

    // The form should NOT have submitted (still on registration page).
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/user_registration\.html/);
  });
});
