/**
 * Sidebar component
 */
import icons from '../icons.js';
import { getUser, hasPermission, isAdmin, logout } from '../auth.js';
import { getCompanyLogoAlt } from '../app-config.js';

const allMenuItems = [
  { route: '/dashboard',     permission: 'dashboard',     label: 'Dashboard',      icon: 'layoutDashboard', section: 'principal' },
  { route: '/lojas',         permission: 'lojas',         label: 'Lojas',           icon: 'store',           section: 'cadastros' },
  { route: '/clientes',      permission: 'clientes',      label: 'Clientes',        icon: 'users',           section: 'cadastros' },
  { route: '/fornecedores',  permission: 'fornecedores',  label: 'Fornecedores',    icon: 'truck',           section: 'cadastros' },
  { route: '/produtos',      permission: 'produtos',      label: 'Produtos',        icon: 'package2',        section: 'cadastros' },
  { route: '/compras',       permission: 'compras',       label: 'Compras',         icon: 'shoppingCart',    section: 'operacoes' },
  { route: '/estoque',       permission: 'estoque',       label: 'Estoque',         icon: 'warehouse',       section: 'operacoes' },
  { route: '/producao',      permission: 'producao',      label: 'Produção',        icon: 'factory',         section: 'operacoes' },
  { route: '/vendas',        permission: 'vendas',        label: 'Vendas',          icon: 'receipt',         section: 'operacoes' },
  { route: '/caixa',         permission: 'caixa',         label: 'Caixa',           icon: 'wallet',          section: 'financeiro', hideForAdmin: true },
  { route: '/financeiro',    permission: 'financeiro',    label: 'Financeiro',      icon: 'wallet',          section: 'financeiro' },
  { route: '/relatorios',    permission: 'relatorios',    label: 'Relatórios',      icon: 'barChart3',       section: 'financeiro' },
  { route: '/configuracoes', permission: 'configuracoes', label: 'Configurações',   icon: 'settings',        section: 'sistema' },
];

const sectionLabels = {
  principal:  '',
  cadastros:  'Cadastros',
  operacoes:  'Operações',
  financeiro: 'Financeiro',
  sistema:    'Sistema',
};

export function renderSidebar() {
  const user = getUser();
  const admin = isAdmin();
  const items = allMenuItems.filter((item) => {
    if (admin) return !item.hideForAdmin;
    return hasPermission(item.permission);
  });
  const currentHash = (window.location.hash.replace('#', '') || '/dashboard');

  let lastSection = '';
  let nav = '';

  items.forEach((item) => {
    if (item.section !== lastSection && sectionLabels[item.section]) {
      nav += `<div class="sidebar-section-label">${sectionLabels[item.section]}</div>`;
      lastSection = item.section;
    }
    const active = currentHash === item.route ? 'active' : '';
    const iconFn = icons[item.icon];
    nav += `
      <a href="#${item.route}" class="sidebar-item ${active}" data-route="${item.route}">
        ${iconFn ? iconFn() : ''}
        <span class="sidebar-text">${item.label}</span>
      </a>`;
  });

  const userName = user?.nome || 'Usuário';
  const userRole = user?.perfil || 'vendedor';

  return `
    <div class="sidebar-logo">
      <img src="/logo.png" alt="${getCompanyLogoAlt()}">
    </div>
    <nav class="sidebar-nav">
      ${nav}
    </nav>
    <div class="sidebar-user">
      <div class="sidebar-user-avatar">${icons.user()}</div>
      <div class="sidebar-user-info">
        <div class="sidebar-user-name">${userName}</div>
        <div class="sidebar-user-role">${userRole}</div>
      </div>
      <button class="sidebar-logout" id="sidebar-logout-btn" title="Sair">
        ${icons.logOut()}
      </button>
    </div>
  `;
}

/** Must be called after innerHTML is set */
export function bindSidebarLogout() {
  const btn = document.getElementById('sidebar-logout-btn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }
}
