/**
 * E2E API helpers — used in beforeEach hooks to set up test state via HTTP
 * without going through the UI (faster and more reliable than UI-based setup).
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

/**
 * Register a new user and return the response body.
 * @param {import('@playwright/test').APIRequestContext} request
 */
async function registerUser(request, data) {
  const res = await request.post(`${BASE_URL}/api/register`, { data });
  return res.json();
}

/**
 * Login and return the JWT token.
 * @param {import('@playwright/test').APIRequestContext} request
 */
async function loginUser(request, credentials) {
  const res = await request.post(`${BASE_URL}/api/login`, { data: credentials });
  const body = await res.json();
  return body.data?.token;
}

/**
 * Register + login shortcut; returns JWT.
 */
async function createUser(request, userData) {
  await registerUser(request, userData);
  return loginUser(request, { email: userData.email, password: userData.password });
}

/**
 * Create an animal via API (multipart form to match multer route).
 */
async function createAnimalViaApi(request, token, animalData) {
  const form = new FormData();
  Object.entries(animalData).forEach(([k, v]) => form.append(k, String(v)));

  const res = await request.post(`${BASE_URL}/api/animals`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: animalData,
  });
  const body = await res.json();
  return body.data?.animal;
}

/**
 * Request adoption via API.
 */
async function requestAdoptionViaApi(request, token, animalId) {
  const res = await request.post(`${BASE_URL}/api/adoption-requests`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { animalId },
  });
  const body = await res.json();
  return body.data?.request;
}

module.exports = { registerUser, loginUser, createUser, createAnimalViaApi, requestAdoptionViaApi };
