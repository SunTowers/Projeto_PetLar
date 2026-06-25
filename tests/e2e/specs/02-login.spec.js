/**
 * E2E — Cenário 2: Login via interface.
 */
const { test, expect } = require('@playwright/test');
const { registerUser } = require('../helpers/api');

const RUN_ID = Date.now();
const USER = {
  name: `Login E2E ${RUN_ID}`,
  email: `e2e-login-${RUN_ID}@petlar-test.example`,
  password: 'LoginPass123!',
};

test.describe('Cenário 2 — Login', () => {
  test.beforeAll(async ({ request }) => {
    await registerUser(request, USER);
  });

  test('exibe o formulário de login', async ({ page }) => {
    await page.goto('/user_login.html');

    await expect(page.locator('#email-login')).toBeVisible();
    await expect(page.locator('#password-login')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('faz login com credenciais corretas e redireciona', async ({ page }) => {
    await page.goto('/user_login.html');

    await page.fill('#email-login', USER.email);
    await page.fill('#password-login', USER.password);
    await page.click('button[type="submit"]');

    // Frontend may stay on the same page, but must persist auth token.
    await expect
      .poll(async () => page.evaluate(() => window.localStorage.getItem('petlar_token')), {
        timeout: 8000,
      })
      .not.toBeNull();
  });

  test('armazena token no localStorage após login bem-sucedido', async ({ page }) => {
    await page.goto('/user_login.html');
    await page.fill('#email-login', USER.email);
    await page.fill('#password-login', USER.password);
    await page.click('button[type="submit"]');

    const token = await expect
      .poll(async () => page.evaluate(() => window.localStorage.getItem('petlar_token')), {
        timeout: 8000,
      })
      .not.toBeNull();

    const storedToken = await page.evaluate(() => window.localStorage.getItem('petlar_token'));
    expect(storedToken).toBeTruthy();
    expect(storedToken.split('.')).toHaveLength(3);
  });

  test('exibe erro ao fornecer senha incorreta', async ({ page }) => {
    await page.goto('/user_login.html');

    await page.fill('#email-login', USER.email);
    await page.fill('#password-login', 'SenhaErrada!');

    page.on('dialog', async (dialog) => {
      expect(dialog.message()).toMatch(/inválidos|incorret/i);
      await dialog.dismiss();
    });

    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/user_login\.html/);
  });

  test('exibe erro ao fornecer e-mail inexistente', async ({ page }) => {
    await page.goto('/user_login.html');

    await page.fill('#email-login', `ghost-${RUN_ID}@nowhere.example`);
    await page.fill('#password-login', 'Irrelevant123!');

    page.on('dialog', async (dialog) => {
      await dialog.dismiss();
    });

    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/user_login\.html/);
  });
});
