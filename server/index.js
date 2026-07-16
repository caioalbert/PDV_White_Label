import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import db from './src/database.js';

// Importação das rotas
import authRoutes from './src/routes/auth.js';
import dashboardRoutes from './src/routes/dashboard.js';
import lojasRoutes from './src/routes/lojas.js';
import clientesRoutes from './src/routes/clientes.js';
import fornecedoresRoutes from './src/routes/fornecedores.js';
import produtosRoutes from './src/routes/produtos.js';
import comprasRoutes from './src/routes/compras.js';
import estoqueRoutes from './src/routes/estoque.js';
import producaoRoutes from './src/routes/producao.js';
import vendasRoutes from './src/routes/vendas.js';
import financeiroRoutes from './src/routes/financeiro.js';
import relatoriosRoutes from './src/routes/relatorios.js';
import configuracoesRoutes from './src/routes/configuracoes.js';
import { createInMemoryRateLimiter } from './src/middleware/rateLimit.js';

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3001;
const localCorsOrigins = 'http://localhost:*,http://127.0.0.1:*';
const corsOriginRules = [
  process.env.CORS_ORIGINS,
  process.env.VERCEL ? '' : localCorsOrigins,
]
  .filter(Boolean)
  .join(',')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

function assertRuntimeEnvironment() {
  if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
    return;
  }

  const missing = ['DATABASE_URL', 'JWT_SECRET'].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Variaveis obrigatorias ausentes: ${missing.join(', ')}`);
  }

  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres');
  }

  const databaseUrl = new URL(process.env.DATABASE_URL);
  if (databaseUrl.hostname.endsWith('.neon.tech')) {
    if (!databaseUrl.hostname.includes('-pooler.')) {
      throw new Error('DATABASE_URL deve usar a conexao pooled do Neon');
    }
    if (databaseUrl.searchParams.get('sslmode') !== 'require') {
      throw new Error('DATABASE_URL do Neon deve usar sslmode=require');
    }
  }
}

assertRuntimeEnvironment();

function matchesCorsOrigin(origin) {
  const normalizedOrigin = origin.replace(/\/$/, '');

  return corsOriginRules.some((rule) => {
    if (!rule.includes('*')) {
      return rule === normalizedOrigin;
    }

    const pattern = rule
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');

    return new RegExp(`^${pattern}$`).test(normalizedOrigin);
  });
}

function isSameOriginRequest(req, origin) {
  try {
    const originUrl = new URL(origin);
    const forwardedHost = req.get('x-forwarded-host') || req.get('host');
    const requestHost = forwardedHost?.split(',')[0].trim();
    return Boolean(requestHost) && originUrl.host === requestHost;
  } catch {
    return false;
  }
}

// Middlewares globais
const corsMiddleware = cors({
  origin: true,
  credentials: true,
  maxAge: 86400,
});

app.use((req, res, next) => {
  const origin = req.get('origin');
  if (!origin || isSameOriginRequest(req, origin) || matchesCorsOrigin(origin)) {
    corsMiddleware(req, res, next);
    return;
  }

  console.warn('Origem recusada pelo CORS:', origin);
  const error = new Error('Origem não autorizada pelo CORS');
  error.status = 403;
  next(error);
});
app.use(express.json({ limit: '10mb' }));

// Rota de saúde
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness inclui a dependencia externa mais importante: PostgreSQL.
app.get('/api/health/ready', async (_req, res) => {
  try {
    await db.raw('select 1 as ok');
    res.json({
      status: 'ready',
      database: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Falha no readiness check:', error);
    res.status(503).json({
      status: 'unavailable',
      database: 'error',
      timestamp: new Date().toISOString(),
    });
  }
});

app.use('/api', createInMemoryRateLimiter());

// Montagem das rotas
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/lojas', lojasRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/fornecedores', fornecedoresRoutes);
app.use('/api/produtos', produtosRoutes);
app.use('/api/compras', comprasRoutes);
app.use('/api/estoque', estoqueRoutes);
app.use('/api/producao', producaoRoutes);
app.use('/api/vendas', vendasRoutes);
app.use('/api/financeiro', financeiroRoutes);
app.use('/api/relatorios', relatoriosRoutes);
app.use('/api/configuracoes', configuracoesRoutes);

// Middleware de tratamento de erros
app.use((err, _req, res, _next) => {
  console.error('Erro não tratado:', err);
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status <= 599
    ? err.status
    : 500;
  const canExposeMessage = status < 500 || process.env.NODE_ENV !== 'production';
  const message = canExposeMessage
    ? err.message || 'Erro interno do servidor'
    : 'Erro interno do servidor';
  res.status(status).json({ error: message });
});

// Rota 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

const isDirectExecution = process.argv[1]
  && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectExecution && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`API disponível em http://localhost:${PORT}/api`);
  });
}

export default app;
