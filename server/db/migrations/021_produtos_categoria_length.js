/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('produtos', (table) => {
    table.string('categoria', 50).notNullable().alter();
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('produtos', (table) => {
    table.string('categoria', 30).notNullable().alter();
  });
}
