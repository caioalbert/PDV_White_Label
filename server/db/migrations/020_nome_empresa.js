/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex('configuracoes')
    .insert({
      chave: 'nome_empresa',
      valor: 'Sistema de Gest\u00e3o',
      descricao: 'Nome da empresa exibido no sistema',
    })
    .onConflict('chave')
    .ignore();
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex('configuracoes').where({ chave: 'nome_empresa' }).del();
}
