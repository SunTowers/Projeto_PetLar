const { default: EmbeddedPostgres } = require('embedded-postgres');
const path = require('path');
const { tmpdir } = require('os');
const fs = require('fs');

const EMBEDDED_PG_PORT = Number(process.env.TEST_EMBEDDED_PG_PORT || '25432');
const DB_USER = 'petlar_test_user';
const DB_PASS = 'petlar_test_pass';
const DB_NAME = 'petlar_test';
const DB_URL = `postgresql://${DB_USER}:${DB_PASS}@localhost:${EMBEDDED_PG_PORT}/${DB_NAME}`;
const EMBEDDED_INITDB_FLAGS = ['--locale=English_United States.1252', '--lc-messages=en_US'];

const PORT = Number(process.env.PORT || '3001');
const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-do-not-use-in-production';

let embeddedPg;
let httpServer;

async function start() {
  const dataDir = path.join(tmpdir(), 'petlar-e2e-pgdata');
  fs.mkdirSync(dataDir, { recursive: true });

  embeddedPg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: DB_USER,
    password: DB_PASS,
    port: EMBEDDED_PG_PORT,
    initdbFlags: EMBEDDED_INITDB_FLAGS,
    persistent: false,
  });

  try {
    await embeddedPg.initialise();
  } catch (error) {
    const message = String(error && error.message ? error.message : '');
    if (!message.includes('exists but is not empty')) {
      throw error;
    }
  }

  await embeddedPg.start();
  await embeddedPg.createDatabase(DB_NAME).catch(() => {});

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = DB_URL;
  process.env.PG_SSL = 'false';
  process.env.PG_FAMILY = '4';
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.PORT = String(PORT);

  const { app, initDb } = require('../../server');
  await initDb();

  await new Promise((resolve) => {
    httpServer = app.listen(PORT, resolve);
  });

  process.stdout.write(`[e2e-webserver] running on http://localhost:${PORT}\n`);
}

async function stop() {
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }

  if (embeddedPg) {
    await embeddedPg.stop().catch(() => {});
  }
}

process.on('SIGINT', async () => {
  await stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await stop();
  process.exit(0);
});

start().catch(async (error) => {
  console.error('[e2e-webserver] failed to start', error);
  await stop();
  process.exit(1);
});
