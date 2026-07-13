import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import db from '../src/database.js';

dotenv.config();

const sellerPermissions = ['dashboard', 'vendas', 'clientes', 'estoque'];
const cashierPermissions = ['dashboard', 'vendas', 'clientes', 'estoque', 'caixa'];

function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

function isCashier(user) {
  return /^caixa([.@]|$)/i.test(user.login) || /^caixa\b/i.test(user.nome);
}

function hasPermission(user, permission) {
  return Array.isArray(user.permissoes) && user.permissoes.includes(permission);
}

async function createTemporaryUser(trx, { nome, login, lojaId, permissoes }) {
  const temporaryPassword = randomBytes(12).toString('hex');
  const senhaHash = await bcrypt.hash(temporaryPassword, 12);
  const [user] = await trx('usuarios')
    .insert({
      nome,
      login,
      senha_hash: senhaHash,
      perfil: 'vendedor',
      loja_id: lojaId,
      permissoes: JSON.stringify(permissoes),
      ativo: true,
      deve_trocar_senha: true,
      token_version: 0,
    })
    .returning(['id', 'nome', 'login', 'loja_id']);

  return {
    ...user,
    senha_temporaria: temporaryPassword,
  };
}

async function main() {
  const created = await db.transaction(async (trx) => {
    const stores = await trx('lojas')
      .where({ tipo: 'loja', situacao: 'ativa' })
      .select('id', 'nome')
      .orderBy('id');
    const users = await trx('usuarios')
      .where({ ativo: true })
      .select('id', 'nome', 'login', 'perfil', 'loja_id', 'permissoes');
    const newUsers = [];

    for (const store of stores) {
      const storeUsers = users.filter((user) => user.loja_id === store.id);
      const seller = storeUsers.find((user) =>
        user.perfil === 'vendedor'
        && hasPermission(user, 'vendas')
        && !isCashier(user)
      );
      const cashier = storeUsers.find((user) => isCashier(user));
      const storeSlug = slugify(store.nome);

      if (!seller) {
        newUsers.push(await createTemporaryUser(trx, {
          nome: `Vendedor ${store.nome}`,
          login: `vendedor.${storeSlug}@gesso.com`,
          lojaId: store.id,
          permissoes: sellerPermissions,
        }));
      }

      if (!cashier) {
        newUsers.push(await createTemporaryUser(trx, {
          nome: `Caixa ${store.nome}`,
          login: `caixa.${storeSlug}@gesso.com`,
          lojaId: store.id,
          permissoes: cashierPermissions,
        }));
      }
    }

    return newUsers;
  });

  if (created.length === 0) {
    console.log('Cada loja ativa já possui ao menos um vendedor e um caixa.');
    return;
  }

  console.log('Contas temporárias criadas:');
  console.table(created.map((user) => ({
    loja_id: user.loja_id,
    nome: user.nome,
    login: user.login,
    senha_temporaria: user.senha_temporaria,
  })));
  console.log('As senhas devem ser trocadas no primeiro login.');
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
