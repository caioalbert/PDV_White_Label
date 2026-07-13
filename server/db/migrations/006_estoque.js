/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  // Tabela de estoque por produto/loja
  await knex.schema.createTable('estoque', (table) => {
    table.increments('id').primary();
    table.integer('produto_id').unsigned().notNullable().references('id').inTable('produtos').onDelete('CASCADE');
    table.integer('loja_id').unsigned().notNullable().references('id').inTable('lojas').onDelete('CASCADE');
    table.decimal('quantidade', 10, 2).defaultTo(0);
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['produto_id', 'loja_id']);
  });

  // Tabela de movimentações de estoque
  await knex.schema.createTable('estoque_movimentacoes', (table) => {
    table.increments('id').primary();
    table.integer('produto_id').unsigned().notNullable().references('id').inTable('produtos');
    table.integer('loja_id').unsigned().notNullable().references('id').inTable('lojas');
    table.integer('loja_destino_id').unsigned().references('id').inTable('lojas');
    table.string('tipo', 30).notNullable(); // entrada, saida, transferencia, ajuste, perda
    table.decimal('quantidade', 10, 2).notNullable();
    table.text('motivo');
    table.string('referencia_tipo', 50); // compra, venda, producao, manual
    table.integer('referencia_id');
    table.integer('usuario_id').unsigned().references('id').inTable('usuarios');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('estoque_movimentacoes');
  await knex.schema.dropTableIfExists('estoque');
}
