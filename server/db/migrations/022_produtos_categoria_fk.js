/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  const hasCategoriaId = await knex.schema.hasColumn('produtos', 'categoria_id');

  if (!hasCategoriaId) {
    await knex.schema.alterTable('produtos', (table) => {
      table.integer('categoria_id');
    });
  }

  await knex.raw(`
    INSERT INTO produto_categorias (slug, nome, permite_composicao, ativo, created_at, updated_at)
    SELECT DISTINCT
      TRIM(produtos.categoria) AS slug,
      INITCAP(REPLACE(REPLACE(TRIM(produtos.categoria), '_', ' '), '-', ' ')) AS nome,
      CASE WHEN TRIM(produtos.categoria) = 'producao_propria' THEN true ELSE false END,
      true,
      NOW(),
      NOW()
    FROM produtos
    LEFT JOIN produto_categorias
      ON produto_categorias.slug = TRIM(produtos.categoria)
    WHERE produtos.categoria IS NOT NULL
      AND TRIM(produtos.categoria) <> ''
      AND produto_categorias.id IS NULL
    ON CONFLICT (slug) DO NOTHING
  `);

  await knex.raw(`
    UPDATE produtos
    SET categoria = TRIM(categoria)
    WHERE categoria IS NOT NULL
      AND categoria <> TRIM(categoria)
  `);

  await knex.raw(`
    UPDATE produtos
    SET categoria_id = produto_categorias.id
    FROM produto_categorias
    WHERE produtos.categoria_id IS NULL
      AND produto_categorias.slug = produtos.categoria
  `);

  const [{ count }] = await knex('produtos')
    .whereNull('categoria_id')
    .count('* as count');

  if (Number(count) > 0) {
    throw new Error('Existem produtos sem categoria valida para preencher categoria_id');
  }

  await knex.schema.alterTable('produtos', (table) => {
    table.integer('categoria_id').notNullable().alter();
    table.index(['categoria_id'], 'idx_produtos_categoria_id');
    table
      .foreign('categoria_id', 'produtos_categoria_id_foreign')
      .references('id')
      .inTable('produto_categorias')
      .onUpdate('CASCADE')
      .onDelete('RESTRICT');
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('produtos', (table) => {
    table.dropForeign(['categoria_id'], 'produtos_categoria_id_foreign');
    table.dropIndex(['categoria_id'], 'idx_produtos_categoria_id');
  });

  await knex.schema.alterTable('produtos', (table) => {
    table.dropColumn('categoria_id');
  });
}
