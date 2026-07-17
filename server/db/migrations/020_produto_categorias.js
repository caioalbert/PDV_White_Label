const defaultCategories = [
  { slug: 'gesso_convencional', nome: 'Gesso Convencional', permite_composicao: false },
  { slug: 'drywall', nome: 'Drywall', permite_composicao: false },
  { slug: 'producao_propria', nome: 'Produção Própria', permite_composicao: true },
];

function labelFromSlug(slug) {
  return String(slug || '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('produto_categorias', (table) => {
    table.increments('id').primary();
    table.string('slug', 50).notNullable().unique();
    table.string('nome', 100).notNullable();
    table.boolean('permite_composicao').notNullable().defaultTo(false);
    table.boolean('ativo').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });

  await knex('produto_categorias')
    .insert(defaultCategories)
    .onConflict('slug')
    .ignore();

  const existingCategories = await knex('produtos')
    .distinct('categoria')
    .whereNotNull('categoria');

  const knownSlugs = new Set(defaultCategories.map((category) => category.slug));
  const missingCategories = existingCategories
    .map((row) => String(row.categoria || '').trim())
    .filter((categoria) => categoria && !knownSlugs.has(categoria))
    .map((categoria) => ({
      slug: categoria,
      nome: labelFromSlug(categoria),
      permite_composicao: false,
      ativo: true,
    }));

  if (missingCategories.length > 0) {
    await knex('produto_categorias')
      .insert(missingCategories)
      .onConflict('slug')
      .ignore();
  }
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('produto_categorias');
}
