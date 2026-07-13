export const PERMISSION_OPTIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'vendas', label: 'Vendas' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'estoque', label: 'Consulta de estoque' },
  { key: 'caixa', label: 'Caixa da loja' },
  { key: 'lojas', label: 'Lojas' },
  { key: 'fornecedores', label: 'Fornecedores' },
  { key: 'produtos', label: 'Produtos' },
  { key: 'compras', label: 'Compras' },
  { key: 'producao', label: 'Produção' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'relatorios', label: 'Relatórios' },
];

export const DEFAULT_VENDOR_PERMISSIONS = [
  'dashboard',
  'vendas',
  'clientes',
  'estoque',
  'caixa',
];

export const ROUTE_PERMISSIONS = {
  '/dashboard': 'dashboard',
  '/lojas': 'lojas',
  '/clientes': 'clientes',
  '/fornecedores': 'fornecedores',
  '/produtos': 'produtos',
  '/compras': 'compras',
  '/estoque': 'estoque',
  '/producao': 'producao',
  '/vendas': 'vendas',
  '/caixa': 'caixa',
  '/financeiro': 'financeiro',
  '/relatorios': 'relatorios',
  '/configuracoes': 'configuracoes',
};

export const DEFAULT_ROUTE_ORDER = [
  '/dashboard',
  '/vendas',
  '/clientes',
  '/estoque',
  '/caixa',
  '/lojas',
  '/fornecedores',
  '/produtos',
  '/compras',
  '/producao',
  '/financeiro',
  '/relatorios',
];
