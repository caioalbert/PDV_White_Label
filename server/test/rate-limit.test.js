import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInMemoryRateLimiter,
  getClientIp,
  normalizeLoginIdentifier,
  retryAfterSeconds,
} from '../src/middleware/rateLimit.js';

function fakeRequest(headers = {}) {
  return {
    method: 'GET',
    headers,
    get(name) {
      return this.headers[name.toLowerCase()];
    },
  };
}

function fakeResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    set(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('extrai o primeiro IP do x-forwarded-for', () => {
  const req = fakeRequest({ 'x-forwarded-for': '203.0.113.10, 10.0.0.1' });
  assert.equal(getClientIp(req), '203.0.113.10');
});

test('normaliza login para chave de rate limit', () => {
  assert.equal(normalizeLoginIdentifier(' Admin '), 'admin');
  assert.equal(normalizeLoginIdentifier(''), 'sem-login');
});

test('calcula retry-after pela tentativa mais antiga da janela', () => {
  const now = new Date('2026-07-16T12:00:30.000Z');
  const oldest = new Date('2026-07-16T12:00:00.000Z');
  assert.equal(retryAfterSeconds(oldest, 60, now), 30);
});

test('bloqueia requisicoes acima do limite em memoria', () => {
  const limiter = createInMemoryRateLimiter({
    limit: 2,
    windowSeconds: 60,
    keyGenerator: () => 'rate-limit-test-ip',
  });
  let nextCalls = 0;

  limiter(fakeRequest(), fakeResponse(), () => { nextCalls += 1; });
  limiter(fakeRequest(), fakeResponse(), () => { nextCalls += 1; });

  const blockedResponse = fakeResponse();
  limiter(fakeRequest(), blockedResponse, () => { nextCalls += 1; });

  assert.equal(nextCalls, 2);
  assert.equal(blockedResponse.statusCode, 429);
  assert.match(blockedResponse.body.error, /Muitas requisições/);
});
