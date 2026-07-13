/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('lojas', (table) => {
    table.increments('id').primary();
    table.string('nome', 100).notNullable();
    table.string('cidade', 100);
    table.string('situacao', 20).defaultTo('ativa');
    table.decimal('comissao_percentual', 5, 2).defaultTo(0);
    table.timestamps(true, true);
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('lojas');
}
