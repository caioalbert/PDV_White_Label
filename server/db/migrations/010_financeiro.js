/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  // Lançamentos financeiros
  await knex.schema.createTable('financeiro_lancamentos', (table) => {
    table.increments('id').primary();
    table.integer('loja_id').unsigned().notNullable().references('id').inTable('lojas');
    table.string('tipo', 20).notNullable(); // entrada, saida
    table.string('categoria', 50); // venda, compra, frete, imposto, descarregamento, producao, despesa, sangria
    table.string('descricao', 255);
    table.decimal('valor', 10, 2).notNullable();
    table.string('referencia_tipo', 50); // venda, compra, producao, manual
    table.integer('referencia_id');
    table.integer('usuario_id').unsigned().references('id').inTable('usuarios');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Controle de caixa
  await knex.schema.createTable('caixa', (table) => {
    table.increments('id').primary();
    table.integer('loja_id').unsigned().notNullable().references('id').inTable('lojas');
    table.integer('usuario_id').unsigned().notNullable().references('id').inTable('usuarios');
    table.decimal('saldo_abertura', 10, 2).defaultTo(0);
    table.decimal('saldo_fechamento', 10, 2);
    table.string('status', 20).defaultTo('aberto'); // aberto, fechado
    table.timestamp('aberto_em').defaultTo(knex.fn.now());
    table.timestamp('fechado_em');
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('caixa');
  await knex.schema.dropTableIfExists('financeiro_lancamentos');
}
