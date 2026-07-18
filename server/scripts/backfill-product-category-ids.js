import { slugifyCategoryName } from '../src/productCategories.js';

const dryRun = process.argv.includes('--dry-run');

if (process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
  throw new Error(
    'DATABASE_URL_UNPOOLED e obrigatoria para backfill remoto. '
      + 'Use a URL direta do Neon, sem "-pooler" no host.',
  );
}

if (process.env.DATABASE_URL_UNPOOLED) {
  const migrationUrl = new URL(process.env.DATABASE_URL_UNPOOLED);
  if (
    migrationUrl.hostname.endsWith('.neon.tech')
    && migrationUrl.hostname.includes('-pooler.')
  ) {
    throw new Error('DATABASE_URL_UNPOOLED nao pode usar o pooler do Neon');
  }
  if (
    migrationUrl.hostname.endsWith('.neon.tech')
    && migrationUrl.searchParams.get('sslmode') !== 'require'
  ) {
    throw new Error('DATABASE_URL_UNPOOLED do Neon deve usar sslmode=require');
  }
}

process.env.USE_UNPOOLED_DATABASE_URL = 'true';
const { default: db } = await import('../src/database.js');

function sameId(left, right) {
  return Number(left) === Number(right);
}

function addUniqueLookup(map, key, category, collisions) {
  if (!key) return;

  const existing = map.get(key);
  if (existing && !sameId(existing.id, category.id)) {
    collisions.add(key);
    return;
  }

  map.set(key, category);
}

function resolveCategory(product, lookups) {
  const categoria = String(product.categoria || '').trim();
  const normalizedCategoria = slugifyCategoryName(categoria);

  if (categoria && lookups.bySlug.has(categoria)) {
    return lookups.bySlug.get(categoria);
  }
  if (
    normalizedCategoria
    && lookups.byNormalizedSlug.has(normalizedCategoria)
    && !lookups.normalizedSlugCollisions.has(normalizedCategoria)
  ) {
    return lookups.byNormalizedSlug.get(normalizedCategoria);
  }
  if (
    normalizedCategoria
    && lookups.byNormalizedName.has(normalizedCategoria)
    && !lookups.normalizedNameCollisions.has(normalizedCategoria)
  ) {
    return lookups.byNormalizedName.get(normalizedCategoria);
  }
  if (product.categoria_id && lookups.byId.has(Number(product.categoria_id))) {
    return lookups.byId.get(Number(product.categoria_id));
  }

  return null;
}

function buildLookups(categories) {
  const lookups = {
    byId: new Map(),
    bySlug: new Map(),
    byNormalizedSlug: new Map(),
    byNormalizedName: new Map(),
    normalizedSlugCollisions: new Set(),
    normalizedNameCollisions: new Set(),
  };

  for (const category of categories) {
    lookups.byId.set(Number(category.id), category);
    lookups.bySlug.set(category.slug, category);
    addUniqueLookup(
      lookups.byNormalizedSlug,
      slugifyCategoryName(category.slug),
      category,
      lookups.normalizedSlugCollisions,
    );
    addUniqueLookup(
      lookups.byNormalizedName,
      slugifyCategoryName(category.nome),
      category,
      lookups.normalizedNameCollisions,
    );
  }

  return lookups;
}

try {
  const hasCategoriaId = await db.schema.hasColumn('produtos', 'categoria_id');
  if (!hasCategoriaId) {
    throw new Error('A coluna produtos.categoria_id nao existe. Rode as migrations antes do backfill.');
  }

  const [categories, products] = await Promise.all([
    db('produto_categorias')
      .select('id', 'slug', 'nome')
      .orderBy('id'),
    db('produtos')
      .select('id', 'nome', 'categoria', 'categoria_id')
      .orderBy('id'),
  ]);

  const lookups = buildLookups(categories);
  const updates = [];
  const unmatched = [];

  for (const product of products) {
    const category = resolveCategory(product, lookups);

    if (!category) {
      unmatched.push({
        id: product.id,
        nome: product.nome,
        categoria: product.categoria,
        categoria_id: product.categoria_id,
      });
      continue;
    }

    const needsUpdate = !sameId(product.categoria_id, category.id)
      || product.categoria !== category.slug;

    if (needsUpdate) {
      updates.push({
        id: product.id,
        nome: product.nome,
        categoria_atual: product.categoria,
        categoria_id_atual: product.categoria_id,
        categoria_nova: category.slug,
        categoria_id_nova: category.id,
      });
    }
  }

  console.log(JSON.stringify({
    dry_run: dryRun,
    categorias: categories.length,
    produtos: products.length,
    atualizacoes: updates.length,
    sem_correspondencia: unmatched.length,
  }, null, 2));

  if (unmatched.length > 0) {
    console.table(unmatched);
    throw new Error('Existem produtos sem categoria correspondente em produto_categorias');
  }

  if (updates.length > 0) {
    console.table(updates);
  }

  if (!dryRun && updates.length > 0) {
    await db.transaction(async (trx) => {
      for (const update of updates) {
        await trx('produtos')
          .where({ id: update.id })
          .update({
            categoria: update.categoria_nova,
            categoria_id: update.categoria_id_nova,
          });
      }
    });
  }

  console.log(dryRun
    ? 'Dry run concluido. Nenhuma alteracao foi aplicada.'
    : 'Backfill de categoria_id concluido.');
} finally {
  await db.destroy();
}
