export const PERMISSIONS = [
  'dashboard',
  'lojas',
  'clientes',
  'fornecedores',
  'produtos',
  'compras',
  'estoque',
  'producao',
  'vendas',
  'caixa',
  'financeiro',
  'relatorios',
];

export const DEFAULT_VENDOR_PERMISSIONS = [
  'dashboard',
  'vendas',
  'clientes',
  'estoque',
  'caixa',
];

export function normalizePermissions(value) {
  const permissions = Array.isArray(value) ? value : [];
  return [...new Set(permissions.filter((permission) => PERMISSIONS.includes(permission)))];
}

export function userHasPermission(user, permission) {
  if (user?.perfil === 'admin') return true;
  return normalizePermissions(user?.permissoes).includes(permission);
}
