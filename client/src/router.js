/**
 * Hash-based SPA router with dynamic imports.
 */
import {
  getDefaultRoute,
  hasPermission,
  isLoggedIn,
  mustChangePassword,
  refreshCurrentUser,
} from './auth.js';
import { ROUTE_PERMISSIONS } from './permissions.js';
import { renderSidebar, bindSidebarLogout } from './components/sidebar.js';
import { renderHeader, loadHeaderStores } from './components/header.js';
import { escapeHtml } from './utils.js';

const routes = {
  '/login':          () => import('./modules/login/login.js'),
  '/alterar-senha':  () => import('./modules/alterar-senha/alterar-senha.js'),
  '/dashboard':      () => import('./modules/dashboard/dashboard.js'),
  '/':               () => import('./modules/dashboard/dashboard.js'),
  '/lojas':          () => import('./modules/lojas/lojas.js'),
  '/clientes':       () => import('./modules/clientes/clientes.js'),
  '/fornecedores':   () => import('./modules/fornecedores/fornecedores.js'),
  '/produtos':       () => import('./modules/produtos/produtos.js'),
  '/compras':        () => import('./modules/compras/compras.js'),
  '/estoque':        () => import('./modules/estoque/estoque.js'),
  '/producao':       () => import('./modules/producao/producao.js'),
  '/vendas':         () => import('./modules/vendas/vendas.js'),
  '/financeiro':     () => import('./modules/financeiro/financeiro.js'),
  '/caixa':          () => import('./modules/financeiro/financeiro.js'),
  '/relatorios':     () => import('./modules/relatorios/relatorios.js'),
  '/configuracoes':  () => import('./modules/configuracoes/configuracoes.js'),
  '/sem-acesso':     () => import('./modules/sem-acesso/sem-acesso.js'),
};

function getPath() {
  const hash = window.location.hash.replace('#', '') || '/';
  return hash;
}

function buildAppShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-layout">
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <aside class="sidebar" id="sidebar"></aside>
      <div class="main-area">
        <header class="header" id="header"></header>
        <main class="content" id="content">
          <div class="loading-overlay"><div class="loading-spinner"></div></div>
        </main>
      </div>
    </div>
  `;
}

function updateSidebarActive(path) {
  document.querySelectorAll('.sidebar-item').forEach((el) => {
    const route = el.getAttribute('data-route');
    if (route === path || (path === '/' && route === '/dashboard')) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
}

let routeVersion = 0;
const CHUNK_RELOAD_KEY = 'pdv:chunk-reload-attempt';

function getCurrentBundleKey() {
  return document.querySelector('script[type="module"][src*="/assets/index-"]')?.src
    || window.location.origin;
}

function isChunkLoadError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('dynamically imported module')
    || message.includes('failed to fetch dynamically imported module')
    || message.includes('importing a module script failed')
    || message.includes('error loading dynamically imported module');
}

function reloadAfterStaleChunk(error) {
  if (!isChunkLoadError(error)) return false;

  const attemptKey = `${getCurrentBundleKey()}:${String(error?.message || '')}`;
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === attemptKey) {
    return false;
  }

  sessionStorage.setItem(CHUNK_RELOAD_KEY, attemptKey);
  window.location.reload();
  return true;
}

async function handleRoute() {
  const version = ++routeVersion;
  const path = getPath();

  // ---- Auth guard ----
  if (path !== '/login' && !isLoggedIn()) {
    window.location.hash = '#/login';
    return;
  }

  if (path !== '/login') {
    try {
      await refreshCurrentUser();
    } catch {
      return;
    }
    if (version !== routeVersion) return;
  }

  if (path !== '/login' && mustChangePassword() && path !== '/alterar-senha') {
    window.location.hash = '#/alterar-senha';
    return;
  }

  if (path === '/alterar-senha' && !mustChangePassword()) {
    window.location.hash = `#${getDefaultRoute()}`;
    return;
  }

  if (path === '/') {
    window.location.hash = `#${getDefaultRoute()}`;
    return;
  }

  // ---- Authentication pages (no shell) ----
  if (path === '/login' || path === '/alterar-senha') {
    try {
      const loader = routes[path];
      const mod = await loader();
      if (version !== routeVersion) return;
      const app = document.getElementById('app');
      app.innerHTML = '<div id="auth-root"></div>';
      await mod.render(document.getElementById('auth-root'));
    } catch (err) {
      if (reloadAfterStaleChunk(err)) return;
      console.error('Erro ao carregar módulo:', err);
      document.getElementById('app').innerHTML = `
        <div class="empty-state">
          <h4>Erro ao carregar página</h4>
          <p>${escapeHtml(err.message)}</p>
        </div>
      `;
    }
    return;
  }

  // ---- Permission guard ----
  const requiredPermission = ROUTE_PERMISSIONS[path];
  if (requiredPermission && !hasPermission(requiredPermission)) {
    window.location.hash = `#${getDefaultRoute()}`;
    return;
  }

  // ---- Build shell if needed ----
  if (!document.getElementById('sidebar')) {
    buildAppShell();
  }

  // ---- Render sidebar + header ----
  const sidebarEl = document.getElementById('sidebar');
  const headerEl = document.getElementById('header');
  if (sidebarEl) sidebarEl.innerHTML = renderSidebar();
  if (headerEl) headerEl.innerHTML = renderHeader(path);

  // ---- Bind sidebar interactions ----
  bindSidebar();
  bindSidebarLogout();
  loadHeaderStores();

  // ---- Update active state ----
  updateSidebarActive(path);

  // ---- Load module ----
  const contentEl = document.getElementById('content');
  const loader = routes[path];
  if (!loader) {
    contentEl.innerHTML = '<div class="empty-state"><h4>Página não encontrada</h4></div>';
    return;
  }

  contentEl.innerHTML = '<div class="loading-overlay"><div class="loading-spinner"></div></div>';

  try {
    const mod = await loader();
    if (version !== routeVersion) return;
    await mod.render(contentEl);
  } catch (err) {
    if (version !== routeVersion) return;
    if (reloadAfterStaleChunk(err)) return;
    console.error('Erro ao carregar módulo:', err);
    contentEl.innerHTML = `
      <div class="empty-state">
        <h4>Erro ao carregar página</h4>
        <p>${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

function bindSidebar() {
  // Mobile overlay click
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) {
    overlay.addEventListener('click', closeSidebar);
  }

  // Hamburger
  const hamburger = document.getElementById('hamburger-btn');
  if (hamburger) {
    hamburger.addEventListener('click', toggleSidebar);
  }

  // Sidebar item clicks close mobile sidebar
  document.querySelectorAll('.sidebar-item').forEach((el) => {
    el.addEventListener('click', () => {
      closeSidebar();
    });
  });
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar?.classList.toggle('open');
  overlay?.classList.toggle('active');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar?.classList.remove('open');
  overlay?.classList.remove('active');
}

export function navigate(path) {
  window.location.hash = `#${path}`;
}

export async function init() {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    reloadAfterStaleChunk(event.payload);
  });
  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('lojaChanged', handleRoute);
  handleRoute();
}
