# PDV Carlos - Sandbox

ERP/PDV para operacao de lojas, estoque, compras, producao, vendas, financeiro
e relatorios.

## Arquitetura

- `client`: SPA em Vite;
- `server`: API Express com Knex e PostgreSQL;
- `api/index.js`: entrada da API na Vercel;
- Neon: PostgreSQL gerenciado;
- Vercel: um unico projeto para frontend e API.

## Desenvolvimento

Requisitos: Node.js 24 e PostgreSQL.

```bash
npm ci
cp server/.env.example server/.env
npm run db:migrate
```

Execute a API e o frontend em terminais separados:

```bash
npm run dev:api
npm run dev:web
```

## Verificacao

```bash
npm test
npm run build
```

Os testes ponta a ponta estao descritos em [TESTES_E2E.md](TESTES_E2E.md).

## Deploy

O procedimento seguro para Vercel e Neon esta em
[DEPLOY_VERCEL.md](DEPLOY_VERCEL.md).
