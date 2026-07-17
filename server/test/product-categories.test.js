import assert from 'node:assert/strict';
import test from 'node:test';
import {
  categoryAllowsComposition,
  slugifyCategoryName,
} from '../src/productCategories.js';

test('normaliza nome de categoria para slug estavel', () => {
  assert.equal(slugifyCategoryName(' Produção Própria '), 'producao_propria');
  assert.equal(slugifyCategoryName('Argamassa & Colantes'), 'argamassa_colantes');
});

test('identifica categorias que permitem composicao', () => {
  assert.equal(categoryAllowsComposition({ categoria_permite_composicao: true }), true);
  assert.equal(categoryAllowsComposition({ categoria: 'producao_propria' }), true);
  assert.equal(categoryAllowsComposition({ categoria: 'drywall' }), false);
});
