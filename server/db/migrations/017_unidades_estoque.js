/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('lojas', (table) => {
    table.string('tipo', 30).notNullable().defaultTo('loja');
  });

  await knex.raw(`
    ALTER TABLE lojas
      ADD CONSTRAINT lojas_tipo_valido
      CHECK (tipo IN ('loja', 'galpao_fabrica'))
  `);

  let galpao = await knex('lojas')
    .whereRaw('LOWER(nome) = LOWER(?)', ['Galpão/Fábrica'])
    .first();

  if (!galpao) {
    [galpao] = await knex('lojas')
      .insert({
        nome: 'Galpão/Fábrica',
        cidade: null,
        situacao: 'ativa',
        comissao_percentual: 0,
        tipo: 'galpao_fabrica',
      })
      .returning('*');
  } else {
    [galpao] = await knex('lojas')
      .where({ id: galpao.id })
      .update({ tipo: 'galpao_fabrica', comissao_percentual: 0 })
      .returning('*');
  }

  const produtos = await knex('produtos').select('id');
  if (produtos.length > 0) {
    await knex('estoque')
      .insert(produtos.map((produto) => ({
        produto_id: produto.id,
        loja_id: galpao.id,
        quantidade: 0,
      })))
      .onConflict(['produto_id', 'loja_id'])
      .ignore();
  }
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  const galpoes = await knex('lojas')
    .where({ tipo: 'galpao_fabrica' })
    .select('id');

  if (galpoes.length > 0) {
    const ids = galpoes.map((unidade) => unidade.id);
    await knex('estoque').whereIn('loja_id', ids).del();
    await knex('lojas').whereIn('id', ids).del();
  }

  await knex.raw('ALTER TABLE lojas DROP CONSTRAINT IF EXISTS lojas_tipo_valido');
  await knex.schema.alterTable('lojas', (table) => {
    table.dropColumn('tipo');
  });
}
