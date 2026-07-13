import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));

/**
 * @type {import('knex').Knex.Config}
 */
const localConnection = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'pdv_carlos',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

const isServerless = !!process.env.VERCEL;

function getConnection() {
  const connectionString = process.env.USE_UNPOOLED_DATABASE_URL === 'true'
    ? process.env.DATABASE_URL_UNPOOLED
    : process.env.DATABASE_URL;

  if (connectionString) {
    return connectionString;
  }

  return localConnection;
}

const config = {
  client: 'pg',
  connection: getConnection(),
  migrations: {
    directory: path.join(serverDirectory, 'db/migrations'),
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: path.join(serverDirectory, 'db/seeds'),
  },
  pool: {
    min: 0,
    max: isServerless ? 3 : 10,
    // Em serverless, destruir conexões ociosas rapidamente
    ...(isServerless && {
      idleTimeoutMillis: 20000,
      reapIntervalMillis: 1000,
    }),
  },
  acquireConnectionTimeout: 10000,
};

export default config;
