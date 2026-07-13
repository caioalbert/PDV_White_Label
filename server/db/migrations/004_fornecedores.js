/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('fornecedores', (table) => {
    table.increments('id').primary();
    table.string('nome', 150).notNullable();
    table.string('cnpj', 20);
    table.string('telefone', 20);
    table.string('cidade', 100);
    table.text('observacoes');
    table.timestamps(true, true);
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('fornecedores');
}
