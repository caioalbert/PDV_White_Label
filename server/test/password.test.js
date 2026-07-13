import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  validatePassword,
} from '../src/security/password.js';

test('rejeita senha ausente ou abaixo do tamanho mínimo', () => {
  assert.equal(validatePassword(undefined), 'Senha inválida');
  assert.match(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH - 1)), /pelo menos/);
});

test('aceita senha dentro dos limites', () => {
  assert.equal(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH)), null);
});

test('rejeita senha acima do limite em bytes do bcrypt', () => {
  assert.match(validatePassword('á'.repeat((MAX_PASSWORD_BYTES / 2) + 1)), /no máximo/);
});
