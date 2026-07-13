/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  // Tabela de vendas
  await knex.schema.createTable('vendas', (table) => {
    table.increments('id').primary();
    table.integer('cliente_id').unsigned().references('id').inTable('clientes').onDelete('SET NULL');
    table.integer('loja_id').unsigned().notNullable().references('id').inTable('lojas');
    table.integer('usuario_id').unsigned().notNullable().references('id').inTable('usuarios');
    table.string('tipo', 20).defaultTo('varejo'); // varejo, atacado
    table.decimal('subtotal', 10, 2).defaultTo(0);
    table.decimal('desconto_percentual', 5, 2).defaultTo(0);
    table.decimal('desconto_valor', 10, 2).defaultTo(0);
    table.decimal('taxa_cartao', 10, 2).defaultTo(0);
    table.decimal('total', 10, 2).defaultTo(0);
    table.string('forma_pagamento', 30); // dinheiro, pix, debito, credito
    table.decimal('comissao_valor', 10, 2).defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Itens da venda
  await knex.schema.createTable('venda_itens', (table) => {
    table.increments('id').primary();
    table.integer('venda_id').unsigned().notNullable().references('id').inTable('vendas').onDelete('CASCADE');
    table.integer('produto_id').unsigned().notNullable().references('id').inTable('produtos');
    table.decimal('quantidade', 10, 2).notNullable();
    table.decimal('preco_unitario', 10, 2).notNullable();
    table.decimal('subtotal', 10, 2).notNullable();
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('venda_itens');
  await knex.schema.dropTableIfExists('vendas');
}
