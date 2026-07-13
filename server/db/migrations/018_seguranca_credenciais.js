/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('usuarios', (table) => {
    table.boolean('deve_trocar_senha').notNullable().defaultTo(false);
    table.integer('token_version').notNullable().defaultTo(0);
  });

  await knex('usuarios')
    .where({ ativo: true })
    .update({ deve_trocar_senha: true });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('usuarios', (table) => {
    table.dropColumn('token_version');
    table.dropColumn('deve_trocar_senha');
  });
}
