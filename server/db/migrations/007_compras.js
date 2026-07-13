/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  // Tabela de compras (pedidos de compra)
  await knex.schema.createTable('compras', (table) => {
    table.increments('id').primary();
    table.integer('fornecedor_id').unsigned().references('id').inTable('fornecedores');
    table.integer('loja_id').unsigned().notNullable().references('id').inTable('lojas');
    table.string('status', 30).defaultTo('pendente'); // pendente, recebido_parcial, recebido
    table.text('observacoes');
    table.decimal('total', 10, 2).defaultTo(0);
    table.integer('usuario_id').unsigned().references('id').inTable('usuarios');
    table.timestamps(true, true);
  });

  // Itens da compra
  await knex.schema.createTable('compra_itens', (table) => {
    table.increments('id').primary();
    table.integer('compra_id').unsigned().notNullable().references('id').inTable('compras').onDelete('CASCADE');
    table.integer('produto_id').unsigned().notNullable().references('id').inTable('produtos');
    table.decimal('quantidade_comprada', 10, 2).notNullable();
    table.decimal('quantidade_recebida', 10, 2).defaultTo(0);
    table.decimal('preco_unitario', 10, 2).notNullable();
    table.decimal('divergencia', 10, 2).defaultTo(0);
    table.text('motivo_divergencia');
    table.timestamp('recebido_em');
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('compra_itens');
  await knex.schema.dropTableIfExists('compras');
}
