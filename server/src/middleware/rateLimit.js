import db from '../database.js';

const DEFAULT_GLOBAL_LIMIT = 600;
const DEFAULT_GLOBAL_WINDOW_SECONDS = 60;
const DEFAULT_LOGIN_WINDOW_SECONDS = 15 * 60;
const DEFAULT_LOGIN_MAX_ACCOUNT_IP = 5;
const DEFAULT_LOGIN_MAX_IP = 20;
const LOGIN_ACCOUNT_IP_SCOPE = 'auth_login_account_ip';
const LOGIN_IP_SCOPE = 'auth_login_ip';
const RATE_LIMIT_TABLE = 'rate_limit_events';
const missingRateLimitTableCodes = new Set(['42P01', '42703']);
const memoryHits = new Map();

function parsePositiveInteger(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function rateLimitsDisabled() {
  return String(process.env.RATE_LIMIT_DISABLED || '').toLowerCase() === 'true';
}

export function getClientIp(req) {
  const forwardedFor = req.get?.('x-forwarded-for') || req.headers?.['x-forwarded-for'];
  if (forwardedFor) {
    return String(forwardedFor).split(',')[0].trim();
  }

  const realIp = req.get?.('x-real-ip') || req.headers?.['x-real-ip'];
  return String(realIp || req.ip || req.socket?.remoteAddress || 'unknown').trim();
}

export function normalizeLoginIdentifier(login) {
  return String(login || '').trim().toLowerCase() || 'sem-login';
}

export function retryAfterSeconds(oldestAttempt, windowSeconds, now = new Date()) {
  const oldestTime = oldestAttempt ? new Date(oldestAttempt).getTime() : now.getTime();
  const resetAt = oldestTime + (windowSeconds * 1000);
  return Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000));
}

function setRateLimitHeaders(res, { limit, remaining, resetSeconds, retryAfter }) {
  res.set('RateLimit-Limit', String(limit));
  res.set('RateLimit-Remaining', String(Math.max(remaining, 0)));
  res.set('RateLimit-Reset', String(resetSeconds));
  res.set('X-RateLimit-Limit', String(limit));
  res.set('X-RateLimit-Remaining', String(Math.max(remaining, 0)));
  if (retryAfter) {
    res.set('Retry-After', String(retryAfter));
  }
}

function sendTooManyRequests(res, retryAfter, message, limit = 0) {
  setRateLimitHeaders(res, {
    limit,
    remaining: 0,
    resetSeconds: retryAfter,
    retryAfter,
  });
  return res.status(429).json({
    error: message,
    retry_after_seconds: retryAfter,
  });
}

export function createInMemoryRateLimiter(options = {}) {
  const windowSeconds = parsePositiveInteger(
    options.windowSeconds || process.env.RATE_LIMIT_GLOBAL_WINDOW_SECONDS,
    DEFAULT_GLOBAL_WINDOW_SECONDS
  );
  const limit = parsePositiveInteger(
    options.limit || process.env.RATE_LIMIT_GLOBAL_LIMIT,
    DEFAULT_GLOBAL_LIMIT
  );
  const windowMs = windowSeconds * 1000;

  return (req, res, next) => {
    if (rateLimitsDisabled() || req.method === 'OPTIONS') {
      next();
      return;
    }

    const now = Date.now();
    const key = options.keyGenerator ? options.keyGenerator(req) : getClientIp(req);
    const current = memoryHits.get(key);
    const hit = !current || current.resetAt <= now
      ? { count: 1, resetAt: now + windowMs }
      : { count: current.count + 1, resetAt: current.resetAt };

    memoryHits.set(key, hit);

    if (memoryHits.size > 5000) {
      for (const [storedKey, storedHit] of memoryHits.entries()) {
        if (storedHit.resetAt <= now) memoryHits.delete(storedKey);
      }
    }

    const retryAfter = Math.max(1, Math.ceil((hit.resetAt - now) / 1000));
    const remaining = Math.max(limit - hit.count, 0);
    setRateLimitHeaders(res, {
      limit,
      remaining,
      resetSeconds: retryAfter,
      retryAfter: hit.count > limit ? retryAfter : null,
    });

    if (hit.count > limit) {
      return res.status(429).json({
        error: 'Muitas requisições. Tente novamente em instantes.',
        retry_after_seconds: retryAfter,
      });
    }

    next();
  };
}

function getLoginRateLimitKeys(req) {
  const ip = getClientIp(req);
  const login = normalizeLoginIdentifier(req.body?.login);

  return [
    {
      scope: LOGIN_ACCOUNT_IP_SCOPE,
      identifier: `${login}:${ip}`,
      limit: parsePositiveInteger(
        process.env.RATE_LIMIT_LOGIN_MAX_ACCOUNT_IP,
        DEFAULT_LOGIN_MAX_ACCOUNT_IP
      ),
    },
    {
      scope: LOGIN_IP_SCOPE,
      identifier: ip,
      limit: parsePositiveInteger(process.env.RATE_LIMIT_LOGIN_MAX_IP, DEFAULT_LOGIN_MAX_IP),
    },
  ];
}

function isMissingRateLimitTable(error) {
  return missingRateLimitTableCodes.has(error?.code);
}

async function countEvents(scope, identifier, cutoff) {
  const row = await db(RATE_LIMIT_TABLE)
    .where({ scope, identifier })
    .where('created_at', '>=', cutoff)
    .count({ total: '*' })
    .min({ oldest_attempt: 'created_at' })
    .first();

  return {
    total: parseInt(row?.total || 0, 10),
    oldestAttempt: row?.oldest_attempt || null,
  };
}

export async function loginRateLimit(req, res, next) {
  if (rateLimitsDisabled()) {
    next();
    return;
  }

  try {
    const windowSeconds = parsePositiveInteger(
      process.env.RATE_LIMIT_LOGIN_WINDOW_SECONDS,
      DEFAULT_LOGIN_WINDOW_SECONDS
    );
    const cutoff = new Date(Date.now() - (windowSeconds * 1000));
    const checks = await Promise.all(
      getLoginRateLimitKeys(req).map(async (key) => ({
        ...key,
        ...(await countEvents(key.scope, key.identifier, cutoff)),
      }))
    );
    const blocked = checks.find((check) => check.total >= check.limit);

    if (blocked) {
      const retryAfter = retryAfterSeconds(blocked.oldestAttempt, windowSeconds);
      return sendTooManyRequests(
        res,
        retryAfter,
        'Muitas tentativas de login. Aguarde antes de tentar novamente.',
        blocked.limit
      );
    }

    next();
  } catch (error) {
    if (isMissingRateLimitTable(error)) {
      console.error('Tabela de rate limit ausente. Login liberado sem bloqueio persistente.');
      next();
      return;
    }
    next(error);
  }
}

export async function recordLoginFailure(req) {
  if (rateLimitsDisabled()) return;

  try {
    const events = getLoginRateLimitKeys(req).map(({ scope, identifier }) => ({
      scope,
      identifier,
    }));
    await db(RATE_LIMIT_TABLE).insert(events);
    await db(RATE_LIMIT_TABLE)
      .where('created_at', '<', new Date(Date.now() - (24 * 60 * 60 * 1000)))
      .del();
  } catch (error) {
    if (!isMissingRateLimitTable(error)) {
      console.error('Erro ao registrar falha de login no rate limit:', error);
    }
  }
}

export async function clearLoginFailures(req) {
  if (rateLimitsDisabled()) return;

  try {
    const [accountIpKey] = getLoginRateLimitKeys(req);
    await db(RATE_LIMIT_TABLE)
      .where({
        scope: accountIpKey.scope,
        identifier: accountIpKey.identifier,
      })
      .del();
  } catch (error) {
    if (!isMissingRateLimitTable(error)) {
      console.error('Erro ao limpar falhas de login no rate limit:', error);
    }
  }
}
