import dotenv from 'dotenv';
import knex from 'knex';
import config from '../knexfile.js';
import { seed } from '../db/seeds/001_initial.js';

dotenv.config();

const databaseName = process.env.E2E_DB_NAME || 'pdv_carlos_e2e';
const initialPassword = process.env.E2E_INITIAL_PASSWORD || 'TesteE2E8!';

if (!/^[a-z0-9_]+_e2e$/.test(databaseName)) {
  throw new Error('E2E_DB_NAME deve terminar com _e2e e usar apenas letras, números e underscore');
}
if (process.env.DB_NAME === databaseName) {
  throw new Error('O banco E2E não pode ser o banco configurado como DB_NAME principal');
}

const connection = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

const maintenanceDb = knex({
  client: 'pg',
  connection: { ...connection, database: 'postgres' },
});

let testDb;

try {
  await maintenanceDb.raw(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await maintenanceDb.raw(`CREATE DATABASE "${databaseName}"`);

  testDb = knex({
    ...config,
    connection: { ...connection, database: databaseName },
    migrations: {
      ...config.migrations,
      directory: new URL('../db/migrations', import.meta.url).pathname,
    },
  });

  await testDb.migrate.latest();

  process.env.NODE_ENV = 'test';
  process.env.ALLOW_DESTRUCTIVE_SEED = 'true';
  process.env.SEED_ADMIN_PASSWORD = initialPassword;
  process.env.SEED_VENDOR_PASSWORD = initialPassword;
  process.env.SEED_CASHIER_PASSWORD = initialPassword;
  delete process.env.VERCEL;

  await seed(testDb);
  console.log(`Banco E2E recriado com sucesso: ${databaseName}`);
} finally {
  await testDb?.destroy();
  await maintenanceDb.destroy();
}
