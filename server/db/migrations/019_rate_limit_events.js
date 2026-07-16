/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('rate_limit_events', (table) => {
    table.increments('id').primary();
    table.string('scope', 80).notNullable();
    table.string('identifier', 255).notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX rate_limit_events_scope_identifier_created_at_idx
    ON rate_limit_events (scope, identifier, created_at DESC)
  `);

  await knex.raw(`
    CREATE INDEX rate_limit_events_created_at_idx
    ON rate_limit_events (created_at)
  `);
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('rate_limit_events');
}
