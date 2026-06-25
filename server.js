require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const crypto = require('crypto');
const { initDb, getUserByEmail, getUserById, createUser, updateUser, getAdmins, countAdmins, setUserRole, setUserSuspension, getAllUsers, deleteUser, getAnimals, getAnimalsByUser, getAnimalsHistoryByUser, getAllAnimalsAdmin, getAdoptionRequestsByUser, getAdoptionRequestsByUserForAnimal, getAdoptionRequestsForUserAnimals, getAllAdoptionRequestsAdmin, getAnimalById, setAnimalHidden, getSystemMetrics, getAdoptionRequestById, createAdoptionRequest, updateAdoptionRequestStatus, approveAdoptionRequestWithTransaction, unpublishAnimal, createAnimal, updateAnimal } = require('./db');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'replace-with-a-secure-secret';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ADMIN_BOOTSTRAP_KEY = process.env.ADMIN_BOOTSTRAP_KEY || '';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET is not defined in .env; the default secret is insecure for production.');
}

const app = express();
app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Avoid stale frontend in local/dev browsers by disabling cache for app documents/assets.
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path.endsWith('.js') || req.path.endsWith('.css')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  next();
});

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas como arquivo de upload.'));
    }
  }
});

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));
app.get('/', (req, res) => {
  res.redirect('/home.html');
});
app.use(express.static(path.join(__dirname)));

function sendSuccess(res, data = null, message = '', status = 200) {
  const payload = { success: true, data };
  if (message) {
    payload.message = message;
  }
  return res.status(status).json(payload);
}

function sendError(res, status, error, details = null) {
  const payload = { success: false, error };
  if (details !== null && details !== undefined) {
    payload.details = details;
  }
  return res.status(status).json(payload);
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 401, 'Autenticação é necessária.');
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (error) {
    return sendError(res, 401, 'Token inválido ou expirado.');
  }
}

async function hydrateAuthenticatedUser(req, res, next) {
  if (!req.user || !req.user.id) {
    return sendError(res, 401, 'Autenticação é necessária.');
  }

  const user = await getUserById(req.user.id);
  if (!user) {
    return sendError(res, 401, 'Usuário não encontrado para este token.');
  }

  if (user.is_suspended) {
    return sendError(res, 403, 'Sua conta está suspensa.', {
      suspendedAt: user.suspended_at,
      reason: user.suspension_reason || null
    });
  }

  req.user = {
    id: user.id,
    email: user.email,
    role: user.role
  };
  req.authUser = user;
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return sendError(res, 403, 'Apenas administradores podem acessar este recurso.');
  }
  return next();
}

function secureStringEquals(a, b) {
  const valueA = Buffer.from(a || '');
  const valueB = Buffer.from(b || '');
  if (valueA.length !== valueB.length) {
    return false;
  }
  return crypto.timingSafeEqual(valueA, valueB);
}

app.post('/api/admin/bootstrap-first', async (req, res) => {
  const providedKey = req.headers['x-bootstrap-key'];
  const { email } = req.body || {};

  if (!ADMIN_BOOTSTRAP_KEY) {
    return sendError(res, 503, 'ADMIN_BOOTSTRAP_KEY não configurada no servidor.');
  }

  if (!providedKey || !secureStringEquals(String(providedKey), ADMIN_BOOTSTRAP_KEY)) {
    return sendError(res, 403, 'Chave de bootstrap inválida.');
  }

  if (!email) {
    return sendError(res, 400, 'E-mail é obrigatório para bootstrap do administrador.');
  }

  const totalAdmins = await countAdmins();
  if (totalAdmins > 0) {
    return sendError(res, 409, 'Já existe pelo menos um administrador. Use os endpoints administrativos para promoção.');
  }

  const user = await getUserByEmail(email.toLowerCase().trim());
  if (!user) {
    return sendError(res, 404, 'Usuário não encontrado para promoção inicial.');
  }

  const updated = await setUserRole(user.id, 'admin');
  return sendSuccess(res, { user: updated }, 'Primeiro administrador criado com sucesso.');
});

app.post('/api/register', upload.single('profilePhoto'), async (req, res) => {
  const {
    name,
    email,
    password,
    phone,
    country,
    state,
    city,
    street,
    apartmentUnit,
    zipCode
  } = req.body;

  if (!name || !email || !password) {
    return sendError(res, 400, 'Nome, e-mail e senha são obrigatórios.');
  }

  const existingUser = await getUserByEmail(email.toLowerCase());
  if (existingUser) {
    return sendError(res, 409, 'Já existe um usuário cadastrado com este e-mail.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const profileImageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const user = await createUser({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    phone: phone ? phone.trim() : null,
    country: country ? country.trim() : null,
    state: state ? state.trim() : null,
    city: city ? city.trim() : null,
    street: street ? street.trim() : null,
    apartmentUnit: apartmentUnit ? apartmentUnit.trim() : null,
    zipCode: zipCode ? zipCode.trim() : null,
    profileImageUrl
  });

  return sendSuccess(res, {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      country: user.country,
      state: user.state,
      city: user.city,
      street: user.street,
      apartmentUnit: user.apartment_unit,
      zipCode: user.zip_code,
      profileImageUrl: user.profile_image_url
    }
  }, 'Usuário registrado com sucesso.', 201);
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return sendError(res, 400, 'E-mail e senha são obrigatórios.');
  }

  const user = await getUserByEmail(email.toLowerCase());
  if (!user) {
    return sendError(res, 401, 'E-mail ou senha inválidos.');
  }

  if (user.is_suspended) {
    return sendError(res, 403, 'Sua conta está suspensa.', {
      suspendedAt: user.suspended_at,
      reason: user.suspension_reason || null
    });
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    return sendError(res, 401, 'E-mail ou senha inválidos.');
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
  return sendSuccess(res, { token }, 'Login concluído com sucesso.');
});

app.get('/api/me', authenticate, hydrateAuthenticatedUser, async (req, res) => {
  return sendSuccess(res, { user: req.authUser });
});

app.post('/api/adoption-requests', authenticate, hydrateAuthenticatedUser, async (req, res) => {
  const { animalId, message } = req.body;
  if (!animalId) {
    return sendError(res, 400, 'ID do animal é obrigatório para solicitar a adoção.');
  }

  const animal = await getAnimalById(animalId);
  if (!animal) {
    return sendError(res, 404, 'Animal não encontrado.');
  }

  if (Number(animal.posted_by) === Number(req.user.id)) {
    return sendError(res, 400, 'Você não pode solicitar adoção para um animal que você publicou.');
  }

  if (animal.status !== 'available') {
    return sendError(res, 400, 'Este animal não está mais disponível para adoção.');
  }

  if (animal.is_hidden) {
    return sendError(res, 400, 'Este anúncio está oculto e não recebe solicitações.');
  }

  const existingRequests = await getAdoptionRequestsByUserForAnimal(req.user.id, animalId);
  const hasActiveRequest = existingRequests.some((item) => item.status === 'pending' || item.status === 'approved');
  if (hasActiveRequest) {
    return sendError(res, 409, 'Você já possui uma solicitação ativa para este animal.');
  }

  try {
    const request = await createAdoptionRequest({
      userId: req.user.id,
      animalId,
      message
    });
    return sendSuccess(res, { request }, 'Solicitação criada com sucesso.', 201);
  } catch (error) {
    if (error.code === '23505') {
      return sendError(res, 409, 'Você já enviou uma solicitação para este animal.');
    }
    throw error;
  }
});

app.get('/api/adoption-requests/my', authenticate, hydrateAuthenticatedUser, async (req, res) => {
  const requests = await getAdoptionRequestsByUser(req.user.id);
  return sendSuccess(res, { requests });
});

app.get('/api/adoption-requests/received', authenticate, hydrateAuthenticatedUser, async (req, res) => {
  const requests = await getAdoptionRequestsForUserAnimals(req.user.id);
  return sendSuccess(res, { requests });
});

app.patch('/api/adoption-requests/:id', authenticate, hydrateAuthenticatedUser, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['approved', 'rejected', 'cancelled'].includes(status)) {
    return sendError(res, 400, 'Status inválido para atualização da solicitação.');
  }

  const request = await getAdoptionRequestById(id);
  if (!request) {
    return sendError(res, 404, 'Solicitação não encontrada.');
  }

  if (request.status === 'approved') {
    return sendError(res, 400, 'Solicitações aprovadas são imutáveis.');
  }

  if (status === 'cancelled') {
    if (Number(request.user_id) !== Number(req.user.id)) {
      return sendError(res, 403, 'Somente o adotante pode cancelar esta solicitação.');
    }
    if (request.status !== 'pending') {
      return sendError(res, 400, 'Somente solicitações pendentes podem ser canceladas.');
    }
    const cancelled = await updateAdoptionRequestStatus(id, 'cancelled');
    return sendSuccess(res, { request: cancelled }, 'Solicitação cancelada com sucesso.');
  }

  if (Number(request.posted_by) !== Number(req.user.id)) {
    return sendError(res, 403, 'Somente o publicador do animal pode aprovar ou rejeitar solicitações.');
  }

  if (status === 'approved') {
    try {
      const approved = await approveAdoptionRequestWithTransaction(id, req.user.id);
      return sendSuccess(res, { request: approved }, 'Solicitação aprovada com sucesso.');
    } catch (error) {
      if (error.code === 'REQUEST_NOT_FOUND') {
        return sendError(res, 404, 'Solicitação não encontrada ou sem permissão.');
      }
      if (error.code === 'INVALID_REQUEST_STATUS' || error.code === 'ANIMAL_NOT_AVAILABLE') {
        return sendError(res, 400, error.message);
      }
      throw error;
    }
  }

  if (request.status !== 'pending') {
    return sendError(res, 400, 'Somente solicitações pendentes podem ser rejeitadas.');
  }

  const updated = await updateAdoptionRequestStatus(id, status);
  return sendSuccess(res, { request: updated }, 'Solicitação rejeitada com sucesso.');
});

app.get('/api/animals/:id', async (req, res) => {
  const animal = await getAnimalById(req.params.id);
  if (!animal) {
    return sendError(res, 404, 'Animal não encontrado.');
  }

  let owner = null;
  if (animal.posted_by) {
    const user = await getUserById(animal.posted_by);
    if (user) {
      owner = {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        country: user.country,
        state: user.state,
        city: user.city,
        street: user.street,
        apartment_unit: user.apartment_unit,
        zip_code: user.zip_code
      };
    }
  }

  return sendSuccess(res, { animal, owner });
});

app.get('/api/user/animals', authenticate, hydrateAuthenticatedUser, async (req, res) => {
  const animals = await getAnimalsByUser(req.user.id);
  return sendSuccess(res, { animals });
});

app.get('/api/user/animals/history', authenticate, hydrateAuthenticatedUser, async (req, res) => {
  const animals = await getAnimalsHistoryByUser(req.user.id);
  return sendSuccess(res, { animals });
});

app.patch('/api/user', authenticate, hydrateAuthenticatedUser, upload.single('profilePhoto'), async (req, res) => {
  const { name, email, password, phone, country, state, city, street, apartmentUnit, zipCode } = req.body;

  if (!name || !email) {
    return sendError(res, 400, 'Nome e e-mail são obrigatórios.');
  }

  const existingUser = await getUserByEmail(email.toLowerCase());
  if (existingUser && existingUser.id !== req.user.id) {
    return sendError(res, 409, 'Já existe um usuário cadastrado com este e-mail.');
  }

  let passwordHash;
  if (password) {
    passwordHash = await bcrypt.hash(password, 12);
  }

  const profileImageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
  const updatedUser = await updateUser({
    id: req.user.id,
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    phone: phone ? phone.trim() : null,
    country: country ? country.trim() : null,
    state: state ? state.trim() : null,
    city: city ? city.trim() : null,
    street: street ? street.trim() : null,
    apartmentUnit: apartmentUnit ? apartmentUnit.trim() : null,
    zipCode: zipCode ? zipCode.trim() : null,
    profileImageUrl
  });

  return sendSuccess(res, { user: updatedUser }, 'Usuário atualizado com sucesso.');
});

app.delete('/api/user', authenticate, hydrateAuthenticatedUser, async (req, res) => {
  await deleteUser(req.user.id);
  return sendSuccess(res, null, 'Conta excluída com sucesso.');
});

app.get('/api/animals', async (req, res) => {
  const animals = await getAnimals();
  return sendSuccess(res, { animals });
});

app.post('/api/animals', authenticate, hydrateAuthenticatedUser, upload.single('mainPhoto'), async (req, res) => {
  const { petName, species, age, gender, size, description, tags } = req.body;

  if (!petName || !species || !description) {
    return sendError(res, 400, 'Nome do animal, espécie e descrição são obrigatórios.');
  }

  const imageUrl = req.file ? `/uploads/${req.file.filename}` : '/fotos_animais_mockups/dog1.jfif';
  let parsedTags = [];

  if (tags) {
    try {
      parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      if (!Array.isArray(parsedTags)) {
        parsedTags = [];
      }
    } catch (err) {
      parsedTags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    }
  }

  const animal = await createAnimal({
    name: petName.trim(),
    species: species.trim(),
    age: age ? age.trim() : null,
    gender: gender ? gender.trim() : null,
    size: size ? size.trim() : null,
    description: description.trim(),
    location: 'Não informado',
    image_url: imageUrl,
    tags: JSON.stringify(parsedTags),
    posted_by: req.user.id
  });

  return sendSuccess(res, { animal }, 'Animal cadastrado com sucesso.', 201);
});

app.patch('/api/animals/:id', authenticate, hydrateAuthenticatedUser, upload.single('mainPhoto'), async (req, res) => {
  const animalId = req.params.id;
  const animal = await getAnimalById(animalId);
  if (!animal) {
    return sendError(res, 404, 'Animal não encontrado.');
  }
  if (Number(animal.posted_by) !== Number(req.user.id)) {
    return sendError(res, 403, 'Você não tem permissão para editar este animal.');
  }

  if (animal.status !== 'available') {
    return sendError(res, 400, 'Somente animais disponíveis podem ser editados.');
  }

  const { petName, species, age, gender, size, description, tags } = req.body;
  if (!petName || !species || !description) {
    return sendError(res, 400, 'Nome do animal, espécie e descrição são obrigatórios.');
  }

  const imageUrl = req.file ? `/uploads/${req.file.filename}` : animal.image_url;
  let parsedTags = [];

  if (tags) {
    try {
      parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      if (!Array.isArray(parsedTags)) {
        parsedTags = [];
      }
    } catch (err) {
      parsedTags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    }
  }

  const updatedAnimal = await updateAnimal({
    id: animalId,
    name: petName.trim(),
    species: species.trim(),
    age: age ? age.trim() : null,
    gender: gender ? gender.trim() : null,
    size: size ? size.trim() : null,
    description: description.trim(),
    location: animal.location || 'Não informado',
    image_url: imageUrl,
    tags: JSON.stringify(parsedTags)
  });

  return sendSuccess(res, { animal: updatedAnimal }, 'Animal atualizado com sucesso.');
});

app.delete('/api/animals/:id', authenticate, hydrateAuthenticatedUser, async (req, res) => {
  const animalId = req.params.id;
  try {
    const animal = await unpublishAnimal(animalId, req.user.id);
    return sendSuccess(res, { animal }, 'Animal despublicado com sucesso.');
  } catch (err) {
    if (err.code === 'ANIMAL_NOT_FOUND') {
      return sendError(res, 404, err.message);
    }
    if (err.code === 'INVALID_ANIMAL_STATUS' || err.code === 'PENDING_REQUESTS_EXIST') {
      return sendError(res, 400, err.message);
    }
    console.error('Erro ao despublicar animal:', err);
    return sendError(res, 500, 'Erro ao despublicar o animal.');
  }
});

app.get('/api/admin/users', authenticate, hydrateAuthenticatedUser, requireAdmin, async (req, res) => {
  const users = await getAllUsers();
  return sendSuccess(res, { users });
});

app.get('/api/admin/users/admins', authenticate, hydrateAuthenticatedUser, requireAdmin, async (req, res) => {
  const admins = await getAdmins();
  return sendSuccess(res, { admins });
});

app.patch('/api/admin/users/:id/role', authenticate, hydrateAuthenticatedUser, requireAdmin, async (req, res) => {
  const targetUserId = Number(req.params.id);
  const { role } = req.body || {};

  if (!Number.isFinite(targetUserId)) {
    return sendError(res, 400, 'ID de usuário inválido.');
  }

  if (!['user', 'admin'].includes(role)) {
    return sendError(res, 400, 'Role inválida. Use user ou admin.');
  }

  const targetUser = await getUserById(targetUserId);
  if (!targetUser) {
    return sendError(res, 404, 'Usuário alvo não encontrado.');
  }

  if (targetUser.role === role) {
    return sendSuccess(res, { user: targetUser }, 'Nenhuma alteração foi necessária.');
  }

  if (role === 'user' && targetUser.role === 'admin') {
    const adminCount = await countAdmins();
    if (adminCount <= 1) {
      return sendError(res, 400, 'Não é possível remover o último administrador do sistema.');
    }
  }

  const updatedUser = await setUserRole(targetUserId, role);
  const message = role === 'admin' ? 'Usuário promovido para administrador.' : 'Privilégios administrativos removidos.';
  return sendSuccess(res, { user: updatedUser }, message);
});

app.patch('/api/admin/users/:id/suspend', authenticate, hydrateAuthenticatedUser, requireAdmin, async (req, res) => {
  const targetUserId = Number(req.params.id);
  const reason = req.body && req.body.reason ? String(req.body.reason).trim() : null;

  if (!Number.isFinite(targetUserId)) {
    return sendError(res, 400, 'ID de usuário inválido.');
  }

  if (targetUserId === Number(req.user.id)) {
    return sendError(res, 400, 'Administradores não podem suspender a própria conta.');
  }

  const targetUser = await getUserById(targetUserId);
  if (!targetUser) {
    return sendError(res, 404, 'Usuário alvo não encontrado.');
  }

  const updatedUser = await setUserSuspension(targetUserId, true, reason);
  return sendSuccess(res, { user: updatedUser }, 'Usuário suspenso com sucesso.');
});

app.patch('/api/admin/users/:id/reactivate', authenticate, hydrateAuthenticatedUser, requireAdmin, async (req, res) => {
  const targetUserId = Number(req.params.id);
  if (!Number.isFinite(targetUserId)) {
    return sendError(res, 400, 'ID de usuário inválido.');
  }

  const targetUser = await getUserById(targetUserId);
  if (!targetUser) {
    return sendError(res, 404, 'Usuário alvo não encontrado.');
  }

  const updatedUser = await setUserSuspension(targetUserId, false, null);
  return sendSuccess(res, { user: updatedUser }, 'Usuário reativado com sucesso.');
});

app.get('/api/admin/animals', authenticate, hydrateAuthenticatedUser, requireAdmin, async (req, res) => {
  const animals = await getAllAnimalsAdmin();
  return sendSuccess(res, { animals });
});

app.patch('/api/admin/animals/:id/hide', authenticate, hydrateAuthenticatedUser, requireAdmin, async (req, res) => {
  const animalId = Number(req.params.id);
  const reason = req.body && req.body.reason ? String(req.body.reason).trim() : null;

  if (!Number.isFinite(animalId)) {
    return sendError(res, 400, 'ID de animal inválido.');
  }

  const animal = await getAnimalById(animalId);
  if (!animal) {
    return sendError(res, 404, 'Animal não encontrado.');
  }

  const updatedAnimal = await setAnimalHidden(animalId, true, reason);
  return sendSuccess(res, { animal: updatedAnimal }, 'Anúncio ocultado com sucesso.');
});

app.patch('/api/admin/animals/:id/unhide', authenticate, hydrateAuthenticatedUser, requireAdmin, async (req, res) => {
  const animalId = Number(req.params.id);

  if (!Number.isFinite(animalId)) {
    return sendError(res, 400, 'ID de animal inválido.');
  }

  const animal = await getAnimalById(animalId);
  if (!animal) {
    return sendError(res, 404, 'Animal não encontrado.');
  }

  const updatedAnimal = await setAnimalHidden(animalId, false, null);
  return sendSuccess(res, { animal: updatedAnimal }, 'Anúncio reativado com sucesso.');
});

app.get('/api/admin/adoption-requests', authenticate, hydrateAuthenticatedUser, requireAdmin, async (req, res) => {
  const requests = await getAllAdoptionRequestsAdmin();
  return sendSuccess(res, { requests });
});

app.get('/api/admin/metrics', authenticate, hydrateAuthenticatedUser, requireAdmin, async (req, res) => {
  const metrics = await getSystemMetrics();
  return sendSuccess(res, { metrics });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError) {
    return sendError(res, 400, 'Falha no upload do arquivo. Tente novamente com uma imagem menor.');
  }
  return sendError(res, 500, 'Erro interno do servidor.');
});

if (require.main === module) {
  initDb()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`PetLar server is running on http://localhost:${PORT}`);
      });
    })
    .catch((error) => {
      console.error('Não foi possível inicializar o banco de dados.', error);
      process.exit(1);
    });
}

module.exports = { app, initDb };
