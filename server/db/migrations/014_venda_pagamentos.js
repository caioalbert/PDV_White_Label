/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('vendas', (table) => {
    table.string('status_pagamento', 30).notNullable().defaultTo('aguardando_pagamento');
    table.decimal('valor_pago', 10, 2).notNullable().defaultTo(0);
    table.timestamp('pago_em');
  });

  await knex.schema.createTable('venda_pagamentos', (table) => {
    table.increments('id').primary();
    table.integer('venda_id').unsigned().notNullable()
      .references('id').inTable('vendas').onDelete('CASCADE');
    table.integer('usuario_id').unsigned().references('id').inTable('usuarios');
    table.string('forma_pagamento', 30).notNullable();
    table.decimal('valor', 10, 2).notNullable();
    table.decimal('taxa_percentual', 5, 2).notNullable().defaultTo(0);
    table.decimal('taxa_valor', 10, 2).notNullable().defaultTo(0);
    table.decimal('valor_recebido', 10, 2).notNullable();
    table.decimal('troco', 10, 2).notNullable().defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index(['venda_id', 'created_at']);
  });

  // Preserva as vendas anteriores como pagas e cria o detalhamento legado.
  await knex.raw(`
    INSERT INTO venda_pagamentos (
      venda_id,
      usuario_id,
      forma_pagamento,
      valor,
      taxa_percentual,
      taxa_valor,
      valor_recebido,
      troco,
      created_at
    )
    SELECT
      id,
      usuario_id,
      COALESCE(forma_pagamento, 'dinheiro'),
      GREATEST(subtotal - desconto_valor, 0),
      CASE
        WHEN subtotal - desconto_valor > 0
          THEN ROUND((taxa_cartao / (subtotal - desconto_valor) * 100)::numeric, 2)
        ELSE 0
      END,
      taxa_cartao,
      total,
      0,
      created_at
    FROM vendas
  `);

  await knex.raw(`
    UPDATE vendas
    SET
      status_pagamento = 'pago',
      valor_pago = GREATEST(subtotal - desconto_valor, 0),
      pago_em = created_at
  `);
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('venda_pagamentos');
  await knex.schema.alterTable('vendas', (table) => {
    table.dropColumn('pago_em');
    table.dropColumn('valor_pago');
    table.dropColumn('status_pagamento');
  });
}
