import api from './api.js';
import { escapeHtml, getCategoriaLabel } from './utils.js';

export const DEFAULT_PRODUCT_CATEGORIES = [
  { slug: 'gesso_convencional', nome: 'Gesso Convencional', permite_composicao: false },
  { slug: 'drywall', nome: 'Drywall', permite_composicao: false },
  { slug: 'producao_propria', nome: 'Produção Própria', permite_composicao: true },
];

let cachedCategories = null;

function normalizeCategory(category) {
  return {
    slug: category.slug || category.categoria,
    nome: category.nome || getCategoriaLabel(category.slug || category.categoria),
    permite_composicao: Boolean(category.permite_composicao),
    ativo: category.ativo !== false,
  };
}

export async function loadProductCategories({ force = false } = {}) {
  if (cachedCategories && !force) return cachedCategories;

  try {
    const response = await api.get('/produtos/categorias');
    const categories = response.data || response || [];
    cachedCategories = categories.map(normalizeCategory).filter((category) => category.slug);
  } catch {
    cachedCategories = DEFAULT_PRODUCT_CATEGORIES;
  }

  return cachedCategories;
}

export function productCategoryLabel(value, categories = cachedCategories || DEFAULT_PRODUCT_CATEGORIES) {
  const slug = typeof value === 'object' ? value?.categoria : value;
  const directLabel = typeof value === 'object' ? value?.categoria_nome : null;
  if (directLabel) return directLabel;

  return categories.find((category) => category.slug === slug)?.nome
    || getCategoriaLabel(slug);
}

export function categoryAllowsComposition(value, categories = cachedCategories || DEFAULT_PRODUCT_CATEGORIES) {
  if (typeof value === 'object') {
    return Boolean(value?.categoria_permite_composicao)
      || value?.categoria === 'producao_propria';
  }

  return categories.some((category) =>
    category.slug === value && category.permite_composicao
  ) || value === 'producao_propria';
}

export function renderCategoryOptions(categories, selected = '') {
  return categories
    .map((category) => `
      <option value="${escapeHtml(category.slug)}" ${category.slug === selected ? 'selected' : ''}>
        ${escapeHtml(category.nome)}
      </option>
    `)
    .join('');
}

export function renderCategoryFilterButtons(categories, current = '') {
  return `
    <button class="btn btn-filter ${current === '' ? 'active' : ''}" data-categoria="">Todos</button>
    ${categories.map((category) => `
      <button class="btn btn-filter ${current === category.slug ? 'active' : ''}"
        data-categoria="${escapeHtml(category.slug)}">
        ${escapeHtml(category.nome)}
      </button>
    `).join('')}
  `;
}
