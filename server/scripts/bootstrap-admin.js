import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import db from '../src/database.js';
import { validatePassword } from '../src/security/password.js';

dotenv.config();

async function main() {
  const nome = String(process.env.INITIAL_ADMIN_NAME || 'Administrador').trim();
  const login = String(process.env.INITIAL_ADMIN_LOGIN || 'admin').trim();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const passwordError = validatePassword(password);

  if (!nome || !login) {
    throw new Error('INITIAL_ADMIN_NAME e INITIAL_ADMIN_LOGIN não podem ser vazios');
  }
  if (passwordError) {
    throw new Error(`INITIAL_ADMIN_PASSWORD: ${passwordError}`);
  }

  const existingAdmin = await db('usuarios')
    .where((query) => query.where({ login }).orWhere({ perfil: 'admin' }))
    .first();

  if (existingAdmin) {
    throw new Error('Já existe um administrador. O bootstrap não altera contas existentes');
  }

  const senhaHash = await bcrypt.hash(password, 12);
  const [admin] = await db('usuarios')
    .insert({
      nome,
      login,
      senha_hash: senhaHash,
      perfil: 'admin',
      loja_id: null,
      permissoes: JSON.stringify([]),
      deve_trocar_senha: true,
      token_version: 0,
    })
    .returning(['id', 'login']);

  console.log(`Administrador inicial criado: ${admin.login} (id ${admin.id})`);
  console.log('Remova INITIAL_ADMIN_PASSWORD do ambiente e troque a senha no primeiro login.');
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
