/**
 * HTTP API helpers for backend tests.
 * All functions return the full supertest response so callers can assert status/body.
 */
import request from 'supertest';

// ── Auth ─────────────────────────────────────────────────────────────────────

export function registerUser(app, data) {
  return request(app).post('/api/register').send(data);
}

export function loginUser(app, data) {
  return request(app).post('/api/login').send(data);
}

/** Register + login a user and return their JWT token. */
export async function createAuthenticatedUser(app, userData) {
  await registerUser(app, userData);
  const res = await loginUser(app, { email: userData.email, password: userData.password });
  return res.body.data.token;
}

export function getMe(app, token) {
  return request(app).get('/api/me').set('Authorization', `Bearer ${token}`);
}

// ── Animals ───────────────────────────────────────────────────────────────────

export function createAnimal(app, token, animalData) {
  const req = request(app)
    .post('/api/animals')
    .set('Authorization', `Bearer ${token}`);

  // Use .field() since the route uses multer (multipart).
  Object.entries(animalData).forEach(([key, value]) => {
    if (value !== undefined && value !== null) req.field(key, String(value));
  });

  return req;
}

export function getAnimals(app) {
  return request(app).get('/api/animals');
}

export function getAnimal(app, id) {
  return request(app).get(`/api/animals/${id}`);
}

export function updateAnimal(app, token, id, data) {
  const req = request(app)
    .patch(`/api/animals/${id}`)
    .set('Authorization', `Bearer ${token}`);

  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null) req.field(key, String(value));
  });

  return req;
}

export function unpublishAnimal(app, token, id) {
  return request(app)
    .delete(`/api/animals/${id}`)
    .set('Authorization', `Bearer ${token}`);
}

// ── Adoption requests ────────────────────────────────────────────────────────

export function requestAdoption(app, token, animalId, message = '') {
  return request(app)
    .post('/api/adoption-requests')
    .set('Authorization', `Bearer ${token}`)
    .send({ animalId, message });
}

export function getMyRequests(app, token) {
  return request(app)
    .get('/api/adoption-requests/my')
    .set('Authorization', `Bearer ${token}`);
}

export function getReceivedRequests(app, token) {
  return request(app)
    .get('/api/adoption-requests/received')
    .set('Authorization', `Bearer ${token}`);
}

export function updateRequestStatus(app, token, requestId, status) {
  return request(app)
    .patch(`/api/adoption-requests/${requestId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status });
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export function adminGetUsers(app, token) {
  return request(app)
    .get('/api/admin/users')
    .set('Authorization', `Bearer ${token}`);
}

export function adminSetRole(app, token, userId, role) {
  return request(app)
    .patch(`/api/admin/users/${userId}/role`)
    .set('Authorization', `Bearer ${token}`)
    .send({ role });
}

export function adminSuspendUser(app, token, userId, reason = null) {
  return request(app)
    .patch(`/api/admin/users/${userId}/suspend`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reason });
}

export function adminReactivateUser(app, token, userId) {
  return request(app)
    .patch(`/api/admin/users/${userId}/reactivate`)
    .set('Authorization', `Bearer ${token}`);
}

export function adminHideAnimal(app, token, animalId, reason = null) {
  return request(app)
    .patch(`/api/admin/animals/${animalId}/hide`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reason });
}

export function adminUnhideAnimal(app, token, animalId) {
  return request(app)
    .patch(`/api/admin/animals/${animalId}/unhide`)
    .set('Authorization', `Bearer ${token}`);
}

export function adminGetMetrics(app, token) {
  return request(app)
    .get('/api/admin/metrics')
    .set('Authorization', `Bearer ${token}`);
}

export function adminGetAdoptionRequests(app, token) {
  return request(app)
    .get('/api/admin/adoption-requests')
    .set('Authorization', `Bearer ${token}`);
}
