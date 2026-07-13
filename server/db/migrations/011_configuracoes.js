/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('configuracoes', (table) => {
    table.increments('id').primary();
    table.string('chave', 100).notNullable().unique();
    table.string('valor', 255);
    table.string('descricao', 255);
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('configuracoes');
}
