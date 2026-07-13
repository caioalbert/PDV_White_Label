import assert from 'node:assert/strict';
import test from 'node:test';
import {
  businessDateKey,
  caixaAbertoNoDia,
} from '../src/routes/financeiro.js';

test('identifica a data operacional do caixa no fuso de Sao Paulo', () => {
  assert.equal(
    businessDateKey('2026-07-13T02:59:59.000Z', 'America/Sao_Paulo'),
    '2026-07-12'
  );
  assert.equal(
    businessDateKey('2026-07-13T03:00:00.000Z', 'America/Sao_Paulo'),
    '2026-07-13'
  );
});

test('caixa so pode ser fechado no mesmo dia operacional da abertura', () => {
  const referenceDate = new Date('2026-07-13T18:00:00.000Z');

  assert.equal(
    caixaAbertoNoDia(
      { aberto_em: '2026-07-13T11:30:00.000Z' },
      referenceDate,
      'America/Sao_Paulo'
    ),
    true
  );
  assert.equal(
    caixaAbertoNoDia(
      { aberto_em: '2026-07-13T02:59:59.000Z' },
      referenceDate,
      'America/Sao_Paulo'
    ),
    false
  );
});
