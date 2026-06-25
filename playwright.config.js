// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const { config } = require('dotenv');

config({ path: '.env.test' });

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';
const serverPort = process.env.TEST_SERVER_PORT || '3001';
const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://petlar_user:petlar_password@localhost:5432/petlar_test';

module.exports = defineConfig({
  testDir: './tests/e2e/specs',
  outputDir: './coverage/e2e/results',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'coverage/e2e/report', open: 'never' }],
    ['json', { outputFile: 'coverage/e2e/results.json' }],
  ],

  use: {
    baseURL,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  globalSetup: './tests/e2e/global-setup.js',

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: `cross-env PORT=${serverPort} NODE_ENV=test DATABASE_URL="${testDbUrl}" JWT_SECRET=test-jwt-secret-do-not-use-in-production PG_SSL=false node server.js`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
