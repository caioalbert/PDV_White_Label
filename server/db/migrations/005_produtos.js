/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('produtos', (table) => {
    table.increments('id').primary();
    table.string('nome', 150).notNullable();
    table.string('categoria', 30).notNullable(); // gesso_convencional, drywall, producao_propria
    table.string('unidade', 20).notNullable().defaultTo('unidade'); // unidade, saco, kg, caixa, metro
    table.decimal('preco_venda', 10, 2).defaultTo(0);
    table.integer('estoque_minimo').defaultTo(0);
    table.boolean('ativo').defaultTo(true);
    table.timestamps(true, true);
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('produtos');
}
