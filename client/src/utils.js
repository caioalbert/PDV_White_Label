/**
 * Utility / helper functions
 */

/** Escape text before interpolation into HTML. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Format a number as BRL currency: R$ 1.234,56 */
export function formatCurrency(value) {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Format a date (string | Date) as dd/mm/aaaa */
export function formatDate(date) {
  if (!date) return '—';
  const d = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T00:00:00`)
    : typeof date === 'string'
      ? new Date(date)
      : date;
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR');
}

/** Format a date (string | Date) as dd/mm/aaaa HH:mm */
export function formatDateTime(date) {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Auto-mask CPF (xxx.xxx.xxx-xx) or CNPJ (xx.xxx.xxx/xxxx-xx) */
export function formatCPFCNPJ(value) {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2}\.\d{3})(\d)/, '$1.$2')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

/** Format CNPJ as xx.xxx.xxx/xxxx-xx */
export function formatCNPJ(value) {
  if (!value) return '';

  return value
    .replace(/\D/g, '')
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2}\.\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/** Mask phone (xx) xxxxx-xxxx */
export function formatPhone(value) {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

/** Generate UUID */
export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Standard debounce */
export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(null, args), ms);
  };
}

/** Apply input mask on keyup */
export function maskInput(input, type) {
  const handler = () => {
    const raw = input.value;
    switch (type) {
      case 'cpf_cnpj':
        input.value = formatCPFCNPJ(raw);
        break;
      case 'cnpj':
        input.value = formatCNPJ(raw);
        break;
      case 'phone':
        input.value = formatPhone(raw);
        break;
      case 'currency': {
        const digits = raw.replace(/\D/g, '');
        const num = parseInt(digits || '0', 10) / 100;
        input.value = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        break;
      }
    }
  };
  input.addEventListener('input', handler);
  return () => input.removeEventListener('input', handler);
}

/** Currency string → number */
export function parseCurrency(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  return parseFloat(str.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
}

/** Category labels */
const categorias = {
  gesso_convencional: 'Gesso Convencional',
  drywall: 'Drywall',
  producao_propria: 'Produção Própria',
  insumo: 'Insumo',
  ferramenta: 'Ferramenta',
  outro: 'Outro',
};
export function getCategoriaLabel(cat) {
  if (categorias[cat]) return categorias[cat];
  if (!cat) return '—';

  return String(cat)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Unit labels */
const unidades = {
  kg: 'Kg',
  saco: 'Saco',
  pacote: 'Pacote',
  balde: 'Balde',
  unidade: 'Unidade',
  metro: 'Metro',
  barra: 'Barra',
  rolo: 'Rolo',
  chapa: 'Chapa',
  placa: 'Placa',
  litro: 'Litro',
  caixa: 'Caixa',
  peca: 'Peça',
};
export function getUnidadeLabel(unit) {
  return unidades[unit] || unit || '—';
}

/** Movement type labels */
const tiposMovimentacao = {
  entrada_compra: 'Entrada (Compra)',
  saida_venda: 'Saída (Venda)',
  transferencia_entrada: 'Transferência (Entrada)',
  transferencia_saida: 'Transferência (Saída)',
  ajuste: 'Ajuste',
  producao_entrada: 'Produção (Entrada)',
  producao_saida: 'Produção (Consumo)',
  perda: 'Perda',
};
export function getTipoMovimentacaoLabel(tipo) {
  return tiposMovimentacao[tipo] || tipo || '—';
}

/** Payment method labels */
const formasPagamento = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  debito: 'Cartão Débito',
  credito: 'Cartão Crédito',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
};
export function getFormaPagamentoLabel(fp) {
  return formasPagamento[fp] || fp || '—';
}

/** Situacao label */
export function getSituacaoLabel(sit) {
  const map = { ativa: 'Ativa', inativa: 'Inativa', ativo: 'Ativo', inativo: 'Inativo' };
  return map[sit] || sit || '—';
}

/** Situacao badge class */
export function getSituacaoBadge(sit) {
  return sit === 'ativa' || sit === 'ativo' ? 'badge-success' : 'badge-danger';
}
