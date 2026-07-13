/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('compra_itens', (table) => {
    table.string('unidade_compra', 30);
    table.decimal('fator_conversao_estoque', 12, 3).notNullable().defaultTo(1);
    table.decimal('quantidade_estoque_recebida', 12, 3).notNullable().defaultTo(0);
  });

  // Mantém o significado das compras antigas, que eram registradas diretamente
  // na unidade de estoque do produto.
  await knex.raw(`
    UPDATE compra_itens
    SET
      unidade_compra = produtos.unidade,
      quantidade_estoque_recebida = compra_itens.quantidade_recebida
    FROM produtos
    WHERE produtos.id = compra_itens.produto_id
  `);

  await knex.raw(`
    ALTER TABLE compra_itens
      ALTER COLUMN unidade_compra SET DEFAULT 'tonelada',
      ALTER COLUMN unidade_compra SET NOT NULL
  `);
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('compra_itens', (table) => {
    table.dropColumn('quantidade_estoque_recebida');
    table.dropColumn('fator_conversao_estoque');
    table.dropColumn('unidade_compra');
  });
}
