/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.raw(`
    CREATE UNIQUE INDEX receitas_produto_unique
      ON receitas (produto_id)
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX caixa_loja_aberto_unique
      ON caixa (loja_id)
      WHERE status = 'aberto'
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX clientes_documento_normalizado_unique
      ON clientes (
        (REGEXP_REPLACE(COALESCE(cpf_cnpj, ''), '[^0-9]', '', 'g'))
      )
      WHERE REGEXP_REPLACE(COALESCE(cpf_cnpj, ''), '[^0-9]', '', 'g') <> ''
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX fornecedores_documento_normalizado_unique
      ON fornecedores (
        (REGEXP_REPLACE(COALESCE(cnpj, ''), '[^0-9]', '', 'g'))
      )
      WHERE REGEXP_REPLACE(COALESCE(cnpj, ''), '[^0-9]', '', 'g') <> ''
  `);

  await knex.raw(`
    ALTER TABLE estoque
      ADD CONSTRAINT estoque_quantidade_nao_negativa
      CHECK (quantidade >= 0)
  `);

  await knex.raw(`
    ALTER TABLE receita_insumos
      ADD CONSTRAINT receita_insumo_quantidade_positiva
      CHECK (quantidade > 0)
  `);

  await knex.raw(`
    ALTER TABLE ordens_producao
      ADD CONSTRAINT ordem_producao_quantidade_positiva
      CHECK (quantidade_produzida > 0)
  `);

  await knex.raw(`
    ALTER TABLE compra_itens
      ADD CONSTRAINT compra_quantidade_positiva
      CHECK (quantidade_comprada > 0),
      ADD CONSTRAINT compra_recebimento_valido
      CHECK (
        quantidade_recebida >= 0
        AND quantidade_recebida <= quantidade_comprada
      ),
      ADD CONSTRAINT compra_preco_nao_negativo
      CHECK (preco_unitario >= 0),
      ADD CONSTRAINT compra_conversao_positiva
      CHECK (fator_conversao_estoque > 0)
  `);

  await knex.raw(`
    ALTER TABLE venda_itens
      ADD CONSTRAINT venda_item_quantidade_positiva
      CHECK (quantidade > 0),
      ADD CONSTRAINT venda_item_preco_positivo
      CHECK (preco_unitario > 0),
      ADD CONSTRAINT venda_item_subtotal_positivo
      CHECK (subtotal > 0)
  `);

  await knex.raw(`
    ALTER TABLE venda_pagamentos
      ADD CONSTRAINT venda_pagamento_valor_positivo
      CHECK (valor > 0),
      ADD CONSTRAINT venda_pagamento_recebido_positivo
      CHECK (valor_recebido > 0),
      ADD CONSTRAINT venda_pagamento_taxa_nao_negativa
      CHECK (taxa_valor >= 0),
      ADD CONSTRAINT venda_pagamento_troco_nao_negativo
      CHECK (troco >= 0)
  `);

  await knex.raw(`
    ALTER TABLE financeiro_lancamentos
      ADD CONSTRAINT financeiro_valor_positivo
      CHECK (valor > 0)
  `);
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.raw('ALTER TABLE financeiro_lancamentos DROP CONSTRAINT IF EXISTS financeiro_valor_positivo');

  await knex.raw(`
    ALTER TABLE venda_pagamentos
      DROP CONSTRAINT IF EXISTS venda_pagamento_valor_positivo,
      DROP CONSTRAINT IF EXISTS venda_pagamento_recebido_positivo,
      DROP CONSTRAINT IF EXISTS venda_pagamento_taxa_nao_negativa,
      DROP CONSTRAINT IF EXISTS venda_pagamento_troco_nao_negativo
  `);

  await knex.raw(`
    ALTER TABLE venda_itens
      DROP CONSTRAINT IF EXISTS venda_item_quantidade_positiva,
      DROP CONSTRAINT IF EXISTS venda_item_preco_positivo,
      DROP CONSTRAINT IF EXISTS venda_item_subtotal_positivo
  `);

  await knex.raw(`
    ALTER TABLE compra_itens
      DROP CONSTRAINT IF EXISTS compra_quantidade_positiva,
      DROP CONSTRAINT IF EXISTS compra_recebimento_valido,
      DROP CONSTRAINT IF EXISTS compra_preco_nao_negativo,
      DROP CONSTRAINT IF EXISTS compra_conversao_positiva
  `);

  await knex.raw('ALTER TABLE ordens_producao DROP CONSTRAINT IF EXISTS ordem_producao_quantidade_positiva');
  await knex.raw('ALTER TABLE receita_insumos DROP CONSTRAINT IF EXISTS receita_insumo_quantidade_positiva');
  await knex.raw('ALTER TABLE estoque DROP CONSTRAINT IF EXISTS estoque_quantidade_nao_negativa');

  await knex.raw('DROP INDEX IF EXISTS fornecedores_documento_normalizado_unique');
  await knex.raw('DROP INDEX IF EXISTS clientes_documento_normalizado_unique');
  await knex.raw('DROP INDEX IF EXISTS caixa_loja_aberto_unique');
  await knex.raw('DROP INDEX IF EXISTS receitas_produto_unique');
}
