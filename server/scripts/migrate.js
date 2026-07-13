import knex from 'knex';
import dotenv from 'dotenv';

dotenv.config();

const action = process.argv[2] || 'latest';
const supportedActions = new Set(['latest', 'status', 'rollback']);

if (!supportedActions.has(action)) {
  throw new Error(`Acao de migration invalida: ${action}`);
}

if (process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
  throw new Error(
    'DATABASE_URL_UNPOOLED e obrigatoria para migrations remotas. '
      + 'Use a URL direta do Neon, sem "-pooler" no host.',
  );
}

if (process.env.DATABASE_URL_UNPOOLED) {
  const migrationUrl = new URL(process.env.DATABASE_URL_UNPOOLED);
  if (
    migrationUrl.hostname.endsWith('.neon.tech')
    && migrationUrl.hostname.includes('-pooler.')
  ) {
    throw new Error('DATABASE_URL_UNPOOLED nao pode usar o pooler do Neon');
  }
  if (
    migrationUrl.hostname.endsWith('.neon.tech')
    && migrationUrl.searchParams.get('sslmode') !== 'require'
  ) {
    throw new Error('DATABASE_URL_UNPOOLED do Neon deve usar sslmode=require');
  }
}

process.env.USE_UNPOOLED_DATABASE_URL = 'true';
const { default: config } = await import('../knexfile.js');
const db = knex(config);

try {
  if (action === 'status') {
    const [completed, pending] = await db.migrate.list();
    console.log(`Migrations aplicadas: ${completed.length}`);
    console.log(`Migrations pendentes: ${pending.length}`);
    for (const migration of pending) {
      console.log(`- ${migration.file}`);
    }
  } else if (action === 'rollback') {
    const [batch, migrations] = await db.migrate.rollback();
    console.log(`Rollback do lote ${batch}: ${migrations.length} migration(s).`);
  } else {
    const [batch, migrations] = await db.migrate.latest();
    console.log(`Migration lote ${batch}: ${migrations.length} aplicada(s).`);
  }
} finally {
  await db.destroy();
}
