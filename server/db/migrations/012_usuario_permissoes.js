const permissoesVendedor = ['dashboard', 'vendas', 'clientes', 'estoque', 'caixa'];

/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('usuarios', (table) => {
    table.jsonb('permissoes').notNullable().defaultTo('[]');
  });

  await knex('usuarios')
    .where({ perfil: 'vendedor' })
    .update({ permissoes: JSON.stringify(permissoesVendedor) });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('usuarios', (table) => {
    table.dropColumn('permissoes');
  });
}
