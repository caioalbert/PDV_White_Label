/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  // Receitas de produção
  await knex.schema.createTable('receitas', (table) => {
    table.increments('id').primary();
    table.integer('produto_id').unsigned().notNullable().references('id').inTable('produtos');
    table.string('nome', 150).notNullable();
    table.boolean('ativo').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Insumos de cada receita
  await knex.schema.createTable('receita_insumos', (table) => {
    table.increments('id').primary();
    table.integer('receita_id').unsigned().notNullable().references('id').inTable('receitas').onDelete('CASCADE');
    table.integer('produto_id').unsigned().notNullable().references('id').inTable('produtos');
    table.decimal('quantidade', 10, 3).notNullable();
  });

  // Ordens de produção
  await knex.schema.createTable('ordens_producao', (table) => {
    table.increments('id').primary();
    table.integer('receita_id').unsigned().notNullable().references('id').inTable('receitas');
    table.integer('loja_id').unsigned().notNullable().references('id').inTable('lojas');
    table.decimal('quantidade_produzida', 10, 2).notNullable();
    table.integer('usuario_id').unsigned().references('id').inTable('usuarios');
    table.string('status', 30).defaultTo('concluida');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('ordens_producao');
  await knex.schema.dropTableIfExists('receita_insumos');
  await knex.schema.dropTableIfExists('receitas');
}
