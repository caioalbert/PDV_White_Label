/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('enteidades_financeiras', (table) => {
    table.string('codigo', 50).primary();
    table.string('descricao', 255).notNullable();
  });

  await knex.schema.createTable('taxas', (table) => {
    table.increments('id').primary();
    table.string('entidade_financeira_codigo', 50).notNullable();
    table.string('bandeira', 100).notNullable();
    table.decimal('taxa', 10, 2).notNullable();

    table
      .foreign('entidade_financeira_codigo')
      .references('codigo')
      .inTable('enteidades_financeiras')
      .onUpdate('CASCADE')
      .onDelete('CASCADE');

    table.unique(['entidade_financeira_codigo', 'bandeira']);
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('taxas');
  await knex.schema.dropTableIfExists('enteidades_financeiras');
}
