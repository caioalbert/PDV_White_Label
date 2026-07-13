import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import db from '../src/database.js';
import { validatePassword } from '../src/security/password.js';

dotenv.config();

async function main() {
  const login = String(process.env.TARGET_USER_LOGIN || '').trim();
  const password = process.env.TEMPORARY_PASSWORD;
  const passwordError = validatePassword(password);

  if (!login) {
    throw new Error('TARGET_USER_LOGIN é obrigatório');
  }
  if (passwordError) {
    throw new Error(`TEMPORARY_PASSWORD: ${passwordError}`);
  }

  const senhaHash = await bcrypt.hash(password, 12);
  const [usuario] = await db('usuarios')
    .where({ login })
    .update({
      senha_hash: senhaHash,
      deve_trocar_senha: true,
      token_version: db.raw('token_version + 1'),
      updated_at: db.fn.now(),
    })
    .returning(['id', 'login']);

  if (!usuario) {
    throw new Error(`Usuário não encontrado: ${login}`);
  }

  console.log(`Senha temporária rotacionada para ${usuario.login} (id ${usuario.id}).`);
  console.log('Todas as sessões anteriores foram revogadas.');
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
