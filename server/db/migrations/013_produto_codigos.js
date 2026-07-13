/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('produtos', (table) => {
    table.string('codigo_interno', 30);
    table.string('codigo_barras', 50);
  });

  await knex.raw(`
    UPDATE produtos
    SET codigo_interno = 'PRD' || LPAD(id::text, 6, '0')
    WHERE codigo_interno IS NULL
  `);

  await knex.schema.alterTable('produtos', (table) => {
    table.unique('codigo_interno');
    table.unique('codigo_barras');
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('produtos', (table) => {
    table.dropUnique('codigo_barras');
    table.dropUnique('codigo_interno');
    table.dropColumn('codigo_barras');
    table.dropColumn('codigo_interno');
  });
}
