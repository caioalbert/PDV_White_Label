/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('usuarios', (table) => {
    table.increments('id').primary();
    table.string('nome', 100).notNullable();
    table.string('login', 50).notNullable().unique();
    table.string('senha_hash', 255).notNullable();
    table.string('perfil', 20).notNullable().defaultTo('vendedor');
    table.integer('loja_id').unsigned().references('id').inTable('lojas').onDelete('SET NULL');
    table.boolean('ativo').defaultTo(true);
    table.timestamps(true, true);
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('usuarios');
}
