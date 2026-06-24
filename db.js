
const { Pool } = require('pg');

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function parseFamily(value) {
  const parsed = Number(value);
  if (parsed === 4 || parsed === 6) {
    return parsed;
  }
  return undefined;
}

const databaseUrl = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING || '';
const useSsl = isTruthy(process.env.PG_SSL) || isTruthy(process.env.DATABASE_SSL);
const ipFamily = parseFamily(process.env.PG_FAMILY);

const pool = new Pool({
  ...(databaseUrl ? { connectionString: databaseUrl } : {
    host: process.env.PG_HOST || 'localhost',
    port: process.env.PG_PORT || 5432,
    user: process.env.PG_USER || 'petlar_user',
    password: process.env.PG_PASSWORD || '',
    database: process.env.PG_DATABASE || 'petlar_db'
  }),
  ...(ipFamily ? { family: ipFamily } : {}),
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {})
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool de conexões PostgreSQL:', err);
});

async function query(text, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

async function initDb() {
  // Create users table
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      phone VARCHAR(20),
      country VARCHAR(100),
      state VARCHAR(100),
      city VARCHAR(100),
      street VARCHAR(255),
      apartment_unit VARCHAR(100),
      zip_code VARCHAR(30),
      profile_image_url VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(100)');
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS state VARCHAR(100)');
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(100)');
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS street VARCHAR(255)');
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS apartment_unit VARCHAR(100)');
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS zip_code VARCHAR(30)');
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url VARCHAR(500)');
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'");
  await query("UPDATE users SET role = 'user' WHERE role IS NULL OR role NOT IN ('user', 'admin')");
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE');
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP');
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT');

  // Create animals table
  await query(`
    CREATE TABLE IF NOT EXISTS animals (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      species VARCHAR(100) NOT NULL,
      age VARCHAR(100),
      age_months INTEGER,
      age_label VARCHAR(100),
      gender VARCHAR(50),
      size VARCHAR(50),
      description TEXT NOT NULL,
      location VARCHAR(255),
      image_url VARCHAR(500),
      tags TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query('ALTER TABLE animals ADD COLUMN IF NOT EXISTS age_months INTEGER');
  await query("ALTER TABLE animals ADD COLUMN IF NOT EXISTS age_label VARCHAR(100)");

  await query('ALTER TABLE animals ADD COLUMN IF NOT EXISTS posted_by INTEGER REFERENCES users(id) ON DELETE SET NULL');
  await query('ALTER TABLE animals ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT \'available\'');
  await query('ALTER TABLE animals ADD COLUMN IF NOT EXISTS adopted_at TIMESTAMP');
  await query('ALTER TABLE animals ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE');
  await query('ALTER TABLE animals ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP');
  await query('ALTER TABLE animals ADD COLUMN IF NOT EXISTS hidden_reason TEXT');
  await query('UPDATE animals SET posted_by = created_by WHERE posted_by IS NULL AND created_by IS NOT NULL');
  await query("UPDATE animals SET status = 'available' WHERE status IS NULL");

  const legacyAgeColumnCheck = await query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'animals' AND column_name = 'age'
    ) AS has_age_column
  `);

  if (legacyAgeColumnCheck.rows[0].has_age_column) {
    await query(`
      UPDATE animals
      SET age_months = CASE
        WHEN age_months IS NOT NULL THEN age_months
        WHEN lower(age) ~ '^[0-9]+\s*mes' THEN regexp_replace(lower(age), '[^0-9]', '', 'g')::INTEGER
        WHEN lower(age) ~ '^[0-9]+\s*ano' THEN regexp_replace(lower(age), '[^0-9]', '', 'g')::INTEGER * 12
        WHEN lower(age) ~ '^[0-9]+$' THEN age::INTEGER * 12
        ELSE NULL
      END,
      age_label = CASE
        WHEN age_label IS NOT NULL AND age_label <> '' THEN age_label
        WHEN age IS NOT NULL THEN age
        ELSE NULL
      END
    `);

    await query(`
      UPDATE animals
      SET age = NULL
      WHERE age_months IS NOT NULL
    `);
  }

  const migrationCheck = await query(`
    SELECT
      COUNT(*) FILTER (WHERE age_months IS NULL) AS unmigrated_count
    FROM animals
  `);

  const unmigratedCount = Number(migrationCheck.rows[0].unmigrated_count || 0);
  if (unmigratedCount === 0) {
    await query('ALTER TABLE animals DROP COLUMN IF EXISTS age');
  }

  // Create adoption requests table
  await query(`
    CREATE TABLE IF NOT EXISTS adoption_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query("UPDATE adoption_requests SET status = 'pending' WHERE status IS NULL");

  await query('DROP INDEX IF EXISTS adoption_requests_user_animal_unique');
  await query("CREATE UNIQUE INDEX IF NOT EXISTS adoption_requests_active_unique ON adoption_requests(user_id, animal_id) WHERE status IN ('pending', 'approved')");

  // Check if default animals already exist
  const result = await query('SELECT COUNT(*) as count FROM animals');
  
  if (result.rows[0].count === 0) {
    const defaultAnimals = [
      {
        name: 'Luna',
        species: 'Cachorro',
        age_months: 24,
        gender: 'Fêmea',
        size: 'Médio',
        description: 'SRD, dócil e brincalhona. Ideal para famílias que desejam carinho e alegria.',
        location: 'São Paulo, SP',
        image_url: '/fotos_animais_mockups/dog1.jfif',
        tags: JSON.stringify(['Dócil', 'Brincalhona', 'Vacinas em dia'])
      },
      {
        name: 'Mia',
        species: 'Gata',
        age_months: 36,
        gender: 'Fêmea',
        size: 'Pequeno',
        description: 'Adulta, vacinada e tranquila. Adapta-se bem em apartamentos tranquilos.',
        location: 'Campinas, SP',
        image_url: '/fotos_animais_mockups/gato1.jfif',
        tags: JSON.stringify(['Tranquila', 'Vacinada', 'Amigável'])
      },
      {
        name: 'Thor',
        species: 'Cachorro',
        age_months: 12,
        gender: 'Macho',
        size: 'Médio',
        description: 'Ativo, carinhoso e sociável. Perfeito para quem gosta de passeios largos.',
        location: 'Curitiba, PR',
        image_url: '/fotos_animais_mockups/dog2.jfif',
        tags: JSON.stringify(['Ativo', 'Sociável', 'Amigável'])
      },
      {
        name: 'Lola',
        species: 'Cachorro',
        age_months: 6,
        gender: 'Fêmea',
        size: 'Pequeno',
        description: 'Filhote pequena, cheia de energia e amor. Pronta para brincar e receber afeto.',
        location: 'Belo Horizonte, MG',
        image_url: '/fotos_animais_mockups/dog3.jfif',
        tags: JSON.stringify(['Filhote', 'Energia', 'Carinhosa'])
      },
      {
        name: 'Bilu',
        species: 'Gato',
        age_months: 48,
        gender: 'Macho',
        size: 'Médio',
        description: 'Carinhoso, curioso e já castrado. Ama um colo e brincadeiras leves.',
        location: 'Fortaleza, CE',
        image_url: '/fotos_animais_mockups/gato2.jfif',
        tags: JSON.stringify(['Carinhoso', 'Castrado', 'Curioso'])
      },
      {
        name: 'Bella',
        species: 'Cachorro',
        age_months: 36,
        gender: 'Fêmea',
        size: 'Médio',
        description: 'Adora longos passeios e se dá bem com crianças. Muito alegre e afetuosa.',
        location: 'Recife, PE',
        image_url: '/fotos_animais_mockups/dog4.jfif',
        tags: JSON.stringify(['Alegre', 'Amigável', 'Boa com crianças'])
      }
    ];

    for (const animal of defaultAnimals) {
      await query(
        'INSERT INTO animals (name, species, age_months, age_label, gender, size, description, location, image_url, tags) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [
          animal.name,
          animal.species,
          animal.age_months,
          animal.age_months < 12 ? `${animal.age_months} meses` : `${Math.round(animal.age_months / 12)} anos`,
          animal.gender,
          animal.size,
          animal.description,
          animal.location,
          animal.image_url,
          animal.tags
        ]
      );
    }
  }
}

async function getUserByEmail(email) {
  const result = await query(
    'SELECT id, name, email, phone, country, state, city, street, apartment_unit, zip_code, profile_image_url, password_hash, role, is_suspended, suspended_at, suspension_reason FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0];
}

async function createUser({ name, email, passwordHash, phone, country, state, city, street, apartmentUnit, zipCode, profileImageUrl }) {
  const result = await query(
    "INSERT INTO users (name, email, password_hash, phone, country, state, city, street, apartment_unit, zip_code, profile_image_url, role) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'user') RETURNING id, name, email, phone, country, state, city, street, apartment_unit, zip_code, profile_image_url, role, is_suspended, created_at",
    [
      name,
      email,
      passwordHash,
      phone || null,
      country || null,
      state || null,
      city || null,
      street || null,
      apartmentUnit || null,
      zipCode || null,
      profileImageUrl || null
    ]
  );
  return result.rows[0];
}

async function getUserById(id) {
  const result = await query(
    'SELECT id, name, email, phone, country, state, city, street, apartment_unit, zip_code, profile_image_url, role, is_suspended, suspended_at, suspension_reason FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0];
}

async function updateUser({ id, name, email, passwordHash, phone, country, state, city, street, apartmentUnit, zipCode, profileImageUrl }) {
  const fields = [];
  const values = [];

  if (name !== undefined) {
    fields.push('name = $' + (values.length + 1));
    values.push(name);
  }
  if (email !== undefined) {
    fields.push('email = $' + (values.length + 1));
    values.push(email);
  }
  if (passwordHash !== undefined) {
    fields.push('password_hash = $' + (values.length + 1));
    values.push(passwordHash);
  }
  if (phone !== undefined) {
    fields.push('phone = $' + (values.length + 1));
    values.push(phone || null);
  }
  if (country !== undefined) {
    fields.push('country = $' + (values.length + 1));
    values.push(country || null);
  }
  if (state !== undefined) {
    fields.push('state = $' + (values.length + 1));
    values.push(state || null);
  }
  if (city !== undefined) {
    fields.push('city = $' + (values.length + 1));
    values.push(city || null);
  }
  if (street !== undefined) {
    fields.push('street = $' + (values.length + 1));
    values.push(street || null);
  }
  if (apartmentUnit !== undefined) {
    fields.push('apartment_unit = $' + (values.length + 1));
    values.push(apartmentUnit || null);
  }
  if (zipCode !== undefined) {
    fields.push('zip_code = $' + (values.length + 1));
    values.push(zipCode || null);
  }
  if (profileImageUrl !== undefined) {
    fields.push('profile_image_url = $' + (values.length + 1));
    values.push(profileImageUrl || null);
  }

  if (fields.length === 0) {
    return getUserById(id);
  }

  values.push(id);
  const result = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING id, name, email, phone, country, state, city, street, apartment_unit, zip_code, profile_image_url, role, is_suspended, suspended_at, suspension_reason`,
    values
  );
  return result.rows[0];
}

async function getAdmins() {
  const result = await query(
    "SELECT id, name, email, role, is_suspended, created_at FROM users WHERE role = 'admin' ORDER BY created_at ASC"
  );
  return result.rows;
}

async function countAdmins() {
  const result = await query("SELECT COUNT(*)::INTEGER AS count FROM users WHERE role = 'admin'");
  return result.rows[0].count;
}

async function setUserRole(userId, role) {
  const result = await query(
    'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role, is_suspended, suspended_at, suspension_reason, created_at',
    [role, userId]
  );
  return result.rows[0];
}

async function setUserSuspension(userId, suspended, reason = null) {
  const result = await query(
    `UPDATE users
     SET is_suspended = $1,
         suspended_at = CASE WHEN $1 THEN CURRENT_TIMESTAMP ELSE NULL END,
         suspension_reason = CASE WHEN $1 THEN $2 ELSE NULL END
     WHERE id = $3
     RETURNING id, name, email, role, is_suspended, suspended_at, suspension_reason, created_at`,
    [suspended, reason, userId]
  );
  return result.rows[0];
}

async function getAllUsers() {
  const result = await query(`
    SELECT id, name, email, phone, country, state, city, street, apartment_unit, zip_code,
           profile_image_url, role, is_suspended, suspended_at, suspension_reason, created_at
    FROM users
    ORDER BY created_at DESC
  `);
  return result.rows;
}

async function deleteUser(userId) {
  await query('DELETE FROM users WHERE id = $1', [userId]);
}

async function getAnimalsByUser(userId) {
  const result = await query(`
    SELECT a.id, a.name, a.species AS type, a.age_months, a.age_label, a.gender, a.size, a.description, a.location, a.image_url, a.tags,
           a.posted_by, a.status, a.is_hidden, a.hidden_at, a.hidden_reason, a.created_at, a.adopted_at,
           COALESCE(p.pending_requests_count, 0) AS pending_requests_count
    FROM animals a
    LEFT JOIN (
      SELECT animal_id, COUNT(*)::INTEGER AS pending_requests_count
      FROM adoption_requests
      WHERE status = 'pending'
      GROUP BY animal_id
    ) p ON p.animal_id = a.id
    WHERE a.posted_by = $1 AND a.status = 'available' AND a.is_hidden = FALSE
    ORDER BY a.created_at DESC
  `, [userId]);
  return result.rows;
}

async function getAnimalsHistoryByUser(userId) {
  const result = await query(`
    SELECT id, name, species AS type, age_months, age_label, gender, size, description, location, image_url, tags,
           posted_by, status, is_hidden, hidden_at, hidden_reason, created_at, adopted_at
    FROM animals
    WHERE posted_by = $1
    ORDER BY created_at DESC
  `, [userId]);
  return result.rows;
}

async function getAllAnimalsAdmin() {
  const result = await query(`
    SELECT id, name, species AS type, age_months, age_label, gender, size, description, location, image_url, tags,
           posted_by, status, is_hidden, hidden_at, hidden_reason, created_at, adopted_at
    FROM animals
    ORDER BY created_at DESC
  `);
  return result.rows;
}

async function getAdoptionRequestsByUser(userId) {
  const result = await query(`
    SELECT ar.id, ar.status, ar.message, ar.created_at, ar.updated_at,
           a.id AS animal_id, a.name AS animal_name, a.species AS animal_type, a.image_url AS animal_image,
           a.location AS animal_location
    FROM adoption_requests ar
    JOIN animals a ON a.id = ar.animal_id
    WHERE ar.user_id = $1
    ORDER BY ar.created_at DESC
  `, [userId]);
  return result.rows;
}

async function getAdoptionRequestsByUserForAnimal(userId, animalId) {
  const result = await query(`
    SELECT id, user_id, animal_id, status, message, created_at, updated_at
    FROM adoption_requests
    WHERE user_id = $1 AND animal_id = $2
    ORDER BY created_at DESC
  `, [userId, animalId]);
  return result.rows;
}

async function getAdoptionRequestsForUserAnimals(userId) {
  const result = await query(`
    SELECT ar.id, ar.status, ar.message, ar.created_at, ar.updated_at,
           u.id AS requester_id, u.name AS requester_name, u.email AS requester_email,
           a.id AS animal_id, a.name AS animal_name, a.species AS animal_type, a.image_url AS animal_image,
           a.location AS animal_location
    FROM adoption_requests ar
    JOIN animals a ON a.id = ar.animal_id
    JOIN users u ON u.id = ar.user_id
    WHERE a.posted_by = $1
    ORDER BY ar.created_at DESC
  `, [userId]);
  return result.rows;
}

async function getAllAdoptionRequestsAdmin() {
  const result = await query(`
    SELECT ar.id, ar.status, ar.message, ar.created_at, ar.updated_at,
           ar.user_id AS requester_id,
           requester.name AS requester_name,
           requester.email AS requester_email,
           a.id AS animal_id,
           a.name AS animal_name,
           a.species AS animal_type,
           a.image_url AS animal_image,
           a.location AS animal_location,
           a.posted_by AS donor_id,
           donor.name AS donor_name,
           donor.email AS donor_email
    FROM adoption_requests ar
    JOIN animals a ON a.id = ar.animal_id
    JOIN users requester ON requester.id = ar.user_id
    LEFT JOIN users donor ON donor.id = a.posted_by
    ORDER BY ar.created_at DESC
  `);
  return result.rows;
}

async function getAnimalById(id) {
  const result = await query(`
    SELECT id, name, species AS type, age_months, age_label, gender, size, description, location, image_url, tags,
           posted_by, posted_by AS created_by, status, is_hidden, hidden_at, hidden_reason, created_at, adopted_at
    FROM animals
    WHERE id = $1
  `, [id]);
  return result.rows[0];
}

async function setAnimalHidden(animalId, hidden, reason = null) {
  const result = await query(
    `UPDATE animals
     SET is_hidden = $1,
         hidden_at = CASE WHEN $1 THEN CURRENT_TIMESTAMP ELSE NULL END,
         hidden_reason = CASE WHEN $1 THEN $2 ELSE NULL END
     WHERE id = $3
     RETURNING id, name, species AS type, age_months, age_label, gender, size, description, location, image_url, tags,
               posted_by, posted_by AS created_by, status, is_hidden, hidden_at, hidden_reason, created_at, adopted_at`,
    [hidden, reason, animalId]
  );
  return result.rows[0];
}

async function getSystemMetrics() {
  const usersResult = await query('SELECT COUNT(*)::INTEGER AS total_users FROM users');
  const activeUsersResult = await query('SELECT COUNT(*)::INTEGER AS active_users FROM users WHERE is_suspended = FALSE');
  const suspendedUsersResult = await query('SELECT COUNT(*)::INTEGER AS suspended_users FROM users WHERE is_suspended = TRUE');
  const adminsResult = await query("SELECT COUNT(*)::INTEGER AS total_admins FROM users WHERE role = 'admin'");
  const animalsResult = await query('SELECT COUNT(*)::INTEGER AS total_animals FROM animals');
  const availableAnimalsResult = await query("SELECT COUNT(*)::INTEGER AS available_animals FROM animals WHERE status = 'available' AND is_hidden = FALSE");
  const adoptedAnimalsResult = await query("SELECT COUNT(*)::INTEGER AS adopted_animals FROM animals WHERE status = 'adopted'");
  const hiddenAnimalsResult = await query('SELECT COUNT(*)::INTEGER AS hidden_animals FROM animals WHERE is_hidden = TRUE');
  const requestsResult = await query('SELECT COUNT(*)::INTEGER AS total_requests FROM adoption_requests');
  const pendingRequestsResult = await query("SELECT COUNT(*)::INTEGER AS pending_requests FROM adoption_requests WHERE status = 'pending'");
  const approvedRequestsResult = await query("SELECT COUNT(*)::INTEGER AS approved_requests FROM adoption_requests WHERE status = 'approved'");

  return {
    totalUsers: usersResult.rows[0].total_users,
    activeUsers: activeUsersResult.rows[0].active_users,
    suspendedUsers: suspendedUsersResult.rows[0].suspended_users,
    totalAdmins: adminsResult.rows[0].total_admins,
    totalAnimals: animalsResult.rows[0].total_animals,
    availableAnimals: availableAnimalsResult.rows[0].available_animals,
    adoptedAnimals: adoptedAnimalsResult.rows[0].adopted_animals,
    hiddenAnimals: hiddenAnimalsResult.rows[0].hidden_animals,
    totalRequests: requestsResult.rows[0].total_requests,
    pendingRequests: pendingRequestsResult.rows[0].pending_requests,
    approvedRequests: approvedRequestsResult.rows[0].approved_requests
  };
}

async function createAdoptionRequest({ userId, animalId, message }) {
  const result = await query(
    'INSERT INTO adoption_requests (user_id, animal_id, message) VALUES ($1, $2, $3) RETURNING id, user_id, animal_id, status, message, created_at, updated_at',
    [userId, animalId, message || null]
  );
  return result.rows[0];
}

async function updateAdoptionRequestStatus(requestId, status) {
  const result = await query(
    'UPDATE adoption_requests SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, user_id, animal_id, status, message, created_at, updated_at',
    [status, requestId]
  );
  return result.rows[0];
}

async function getAdoptionRequestById(requestId) {
  const result = await query(`
    SELECT ar.id, ar.user_id, ar.animal_id, ar.status, ar.message, ar.created_at, ar.updated_at,
           a.posted_by, a.status AS animal_status
    FROM adoption_requests ar
    JOIN animals a ON a.id = ar.animal_id
    WHERE ar.id = $1
  `, [requestId]);
  return result.rows[0];
}

async function approveAdoptionRequestWithTransaction(requestId, donorUserId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const requestResult = await client.query(`
      SELECT ar.id, ar.user_id, ar.animal_id, ar.status,
             a.posted_by, a.status AS animal_status
      FROM adoption_requests ar
      JOIN animals a ON a.id = ar.animal_id
      WHERE ar.id = $1
      FOR UPDATE
    `, [requestId]);

    const request = requestResult.rows[0];
    if (!request || Number(request.posted_by) !== Number(donorUserId)) {
      const notFoundError = new Error('Solicitação não encontrada ou sem permissão.');
      notFoundError.code = 'REQUEST_NOT_FOUND';
      throw notFoundError;
    }

    if (request.status !== 'pending') {
      const statusError = new Error('Apenas solicitações pendentes podem ser aprovadas.');
      statusError.code = 'INVALID_REQUEST_STATUS';
      throw statusError;
    }

    if (request.animal_status !== 'available') {
      const animalError = new Error('Este animal não está mais disponível para adoção.');
      animalError.code = 'ANIMAL_NOT_AVAILABLE';
      throw animalError;
    }

    const approvedResult = await client.query(
      "UPDATE adoption_requests SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, user_id, animal_id, status, message, created_at, updated_at",
      [requestId]
    );

    await client.query(
      "UPDATE adoption_requests SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE animal_id = $1 AND status = 'pending' AND id <> $2",
      [request.animal_id, requestId]
    );

    await client.query(
      "UPDATE animals SET status = 'adopted', adopted_at = CURRENT_TIMESTAMP WHERE id = $1",
      [request.animal_id]
    );

    await client.query('COMMIT');
    return approvedResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function unpublishAnimal(animalId, donorUserId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const animalResult = await client.query(
      'SELECT id, posted_by, status FROM animals WHERE id = $1 FOR UPDATE',
      [animalId]
    );
    const animal = animalResult.rows[0];

    if (!animal || Number(animal.posted_by) !== Number(donorUserId)) {
      const notFoundError = new Error('Animal não encontrado ou sem permissão.');
      notFoundError.code = 'ANIMAL_NOT_FOUND';
      throw notFoundError;
    }

    if (animal.status !== 'available') {
      const invalidStatusError = new Error('Somente animais disponíveis podem ser despublicados.');
      invalidStatusError.code = 'INVALID_ANIMAL_STATUS';
      throw invalidStatusError;
    }

    const pendingResult = await client.query(
      "SELECT COUNT(*)::INTEGER AS count FROM adoption_requests WHERE animal_id = $1 AND status = 'pending'",
      [animalId]
    );

    if (pendingResult.rows[0].count > 0) {
      const pendingError = new Error('Não é possível despublicar: há solicitações pendentes para este animal.');
      pendingError.code = 'PENDING_REQUESTS_EXIST';
      throw pendingError;
    }

    const updatedResult = await client.query(
      "UPDATE animals SET status = 'adopted' WHERE id = $1 RETURNING id, name, species AS type, age_months, age_label, gender, size, description, location, image_url, tags, posted_by, status, created_at, adopted_at",
      [animalId]
    );

    await client.query('COMMIT');
    return updatedResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getAnimals() {
  const result = await query(`
    SELECT id, name, species AS type, age_months, age_label, gender, size, description, location, image_url, tags,
           posted_by, posted_by AS created_by, status, is_hidden, hidden_at, hidden_reason, created_at, adopted_at
    FROM animals
    WHERE status = 'available' AND is_hidden = FALSE
    ORDER BY created_at DESC
  `);
  return result.rows;
}

async function createAnimal({ name, species, age, gender, size, description, location, image_url, tags, posted_by }) {
  const ageMonths = Number.isFinite(Number(age)) ? Number(age) : null;
  const ageLabel = ageMonths === null ? null : (ageMonths < 12 ? `${ageMonths} meses` : `${Math.round(ageMonths / 12)} anos`);
  const result = await query(
    "INSERT INTO animals (name, species, age_months, age_label, gender, size, description, location, image_url, tags, posted_by, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'available') RETURNING id, name, species AS type, age_months, age_label, gender, size, description, location, image_url, tags, posted_by, posted_by AS created_by, status, created_at, adopted_at",
    [
      name,
      species,
      ageMonths,
      ageLabel,
      gender || null,
      size || null,
      description,
      location || null,
      image_url || null,
      tags || JSON.stringify([]),
      posted_by || null
    ]
  );
  return result.rows[0];
}

async function updateAnimal({ id, name, species, age, gender, size, description, location, image_url, tags }) {
  const ageMonths = Number.isFinite(Number(age)) ? Number(age) : null;
  const ageLabel = ageMonths === null ? null : (ageMonths < 12 ? `${ageMonths} meses` : `${Math.round(ageMonths / 12)} anos`);
  const result = await query(
    'UPDATE animals SET name = $1, species = $2, age_months = $3, age_label = $4, gender = $5, size = $6, description = $7, location = $8, image_url = $9, tags = $10 WHERE id = $11 RETURNING id, name, species AS type, age_months, age_label, gender, size, description, location, image_url, tags, posted_by, posted_by AS created_by, status, is_hidden, hidden_at, hidden_reason, created_at, adopted_at',
    [
      name,
      species,
      ageMonths,
      ageLabel,
      gender || null,
      size || null,
      description,
      location || null,
      image_url || null,
      tags || JSON.stringify([]),
      id
    ]
  );
  return result.rows[0];
}

module.exports = {
  pool,
  query,
  initDb,
  getUserByEmail,
  getUserById,
  createUser,
  updateUser,
  getAdmins,
  countAdmins,
  setUserRole,
  setUserSuspension,
  getAllUsers,
  deleteUser,
  getAnimals,
  getAnimalsByUser,
  getAnimalsHistoryByUser,
  getAllAnimalsAdmin,
  getAdoptionRequestsByUser,
  getAdoptionRequestsByUserForAnimal,
  getAdoptionRequestsForUserAnimals,
  getAllAdoptionRequestsAdmin,
  getAnimalById,
  setAnimalHidden,
  getSystemMetrics,
  getAdoptionRequestById,
  createAdoptionRequest,
  updateAdoptionRequestStatus,
  approveAdoptionRequestWithTransaction,
  unpublishAnimal,
  createAnimal,
  updateAnimal
};
