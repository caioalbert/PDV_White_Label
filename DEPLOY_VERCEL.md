# Deploy unico na Vercel com Neon

O frontend Vite e a API Express sao publicados no mesmo projeto Vercel:

- `/` e `/assets/*`: frontend estatico servido pela CDN;
- `/api/*`: uma Vercel Function com o aplicativo Express;
- PostgreSQL: Neon integrado pelo Marketplace da Vercel.

Esse desenho elimina um segundo projeto, `VITE_API_URL` em producao e CORS
entre frontend e backend.

## 1. Pre-requisitos

- Node.js 24;
- Vercel CLI 47.0.5 ou superior;
- repositorio Git conectado ao GitHub;
- conta autenticada na Vercel (`vercel login`).

Instale e valide o workspace:

```bash
npm ci
npm test
npm run build
```

## 2. Projeto Vercel

Crie um unico projeto apontando para a raiz do repositorio:

- Root Directory: `.`;
- Framework Preset: Other;
- Build Command e Output Directory: definidos em `vercel.json`;
- Node.js: 24.

Depois de autenticar a CLI:

```bash
vercel link
```

O arquivo `.vercel/project.json` deve existir antes de configurar recursos.

## 3. Neon

Instale o Neon pelo Marketplace da Vercel no projeto vinculado. A Function deve
usar a regiao Vercel correspondente a regiao efetivamente provisionada no Neon.
O recurso atual usa Neon `us-east-1`, portanto `vercel.json` usa `iad1`.

O ambiente precisa conter:

```text
DATABASE_URL
DATABASE_URL_UNPOOLED
JWT_SECRET
```

- `DATABASE_URL`: URL pooled do Neon; o host contem `-pooler`.
- `DATABASE_URL_UNPOOLED`: URL direta, usada somente pelas migrations.
- `JWT_SECRET`: segredo aleatorio com pelo menos 32 caracteres.

Nao configure `VITE_API_URL`: a API usa o mesmo host do frontend.
`CORS_ORIGINS` so e necessario para clientes hospedados em outra origem.

Confirme apenas os nomes das variaveis, nunca seus valores:

```bash
vercel env ls
vercel env pull .env.production.local --environment=production --yes
```

## 4. Banco de producao

Migrations nao rodam durante o build. Aplique-as de forma explicita usando a
URL direta:

```bash
node --env-file=.env.production.local server/scripts/migrate.js status
node --env-file=.env.production.local server/scripts/migrate.js latest
```

O seed de demonstracao apaga dados e e bloqueado quando `NODE_ENV=production`
ou `VERCEL` esta definido. Nunca execute `seed`, `seed:dev` ou `setup:dev` no
Neon de producao.

Crie o primeiro administrador sem salvar a senha na Vercel:

```bash
INITIAL_ADMIN_NAME='Administrador' \
INITIAL_ADMIN_LOGIN='admin' \
INITIAL_ADMIN_PASSWORD='senha-temporaria-forte' \
node --env-file=.env.production.local server/scripts/bootstrap-admin.js
```

Troque a senha temporaria no primeiro login.

## 5. Validacao antes de producao

Crie primeiro um Preview Deployment:

```bash
vercel
```

Valide:

```text
GET https://URL-DO-PREVIEW.vercel.app/api/health
GET https://URL-DO-PREVIEW.vercel.app/api/health/ready
```

Depois valide login, dashboard e um fluxo transacional completo. Somente entao
publique/promova para producao.

## 6. Producao

O deploy de producao deve ocorrer pelo GitHub depois que o Preview estiver
aprovado. Como alternativa operacional:

```bash
vercel --prod
```

As Functions usam Fluid Compute e executam em `iad1`, junto do Neon. Os limites
de memoria e duracao ficam nos defaults gerenciados pela Vercel.
