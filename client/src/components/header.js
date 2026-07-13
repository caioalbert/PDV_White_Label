/**
 * Header component
 */
import icons from '../icons.js';
import { getUser, isAdmin, logout, getCurrentLojaId, setCurrentLoja } from '../auth.js';
import api from '../api.js';
import { escapeHtml } from '../utils.js';

const pageTitles = {
  '/dashboard':     'Dashboard',
  '/':              'Dashboard',
  '/lojas':         'Lojas',
  '/clientes':      'Clientes',
  '/fornecedores':  'Fornecedores',
  '/produtos':      'Produtos',
  '/compras':       'Compras',
  '/estoque':       'Estoque',
  '/producao':      'Produção',
  '/vendas':        'Vendas PDV',
  '/financeiro':    'Financeiro',
  '/caixa':         'Caixa',
  '/relatorios':    'Relatórios',
  '/configuracoes': 'Configurações',
  '/sem-acesso':    'Sem acesso',
};

export function renderHeader(path) {
  const user = getUser();
  const title = pageTitles[path] || 'Sistema';
  const admin = isAdmin();

  return `
    <div class="header-left">
      <button class="hamburger" id="hamburger-btn" aria-label="Menu">
        ${icons.menu()}
      </button>
      <h1 class="header-title">${title}</h1>
    </div>
    <div class="header-right">
      ${admin ? '<select class="header-store-select" id="header-store-select"><option value="">Todas as Lojas</option></select>' : ''}
      <div class="header-user">
        <div class="header-user-avatar">${icons.user()}</div>
        <span>${escapeHtml(user?.nome || 'Usuário')}</span>
      </div>
    </div>
  `;
}

/** Load stores into header dropdown (called after render) */
export async function loadHeaderStores() {
  const select = document.getElementById('header-store-select');
  if (!select) return;

  try {
    const lojas = await api.get('/lojas?tipo=loja&situacao=ativa');
    const arr = Array.isArray(lojas) ? lojas : (lojas.lojas || []);
    const currentId = getCurrentLojaId();

    arr.forEach((loja) => {
      if (loja.situacao === 'ativa') {
        const opt = document.createElement('option');
        opt.value = loja.id;
        opt.textContent = loja.nome;
        if (loja.id == currentId) opt.selected = true;
        select.appendChild(opt);
      }
    });

    select.addEventListener('change', () => {
      const val = select.value;
      setCurrentLoja(val ? parseInt(val, 10) : '');
    });
  } catch {
    // Silently fail — stores may not be available
  }
}
