export const DEFAULT_PRODUCT_CATEGORIES = [
  { slug: 'gesso_convencional', nome: 'Gesso Convencional', permite_composicao: false },
  { slug: 'drywall', nome: 'Drywall', permite_composicao: false },
  { slug: 'producao_propria', nome: 'Produção Própria', permite_composicao: true },
];

export function slugifyCategoryName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

export function categoryAllowsComposition(product) {
  return Boolean(product?.categoria_permite_composicao)
    || product?.categoria === 'producao_propria'
    || product?.categoria_slug === 'producao_propria';
}
