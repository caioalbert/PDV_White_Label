import api from '../../api.js';
import icons from '../../icons.js';
import {
  escapeHtml,
  formatCurrency,
  formatDate,
  formatDateTime,
  getCategoriaLabel,
  getUnidadeLabel,
} from '../../utils.js';
import { createTable } from '../../components/table.js';
import { showToast } from '../../components/toast.js';

const relatorios = {
  'vendas-periodo': {
    titulo: 'Vendas por período',
    descricao: 'Totais diários separados por loja.',
    colunas: [
      { key: 'data', label: 'Data', type: 'date' },
      { key: 'loja', label: 'Unidade' },
      { key: 'quantidade_vendas', label: 'Vendas' },
      { key: 'total', label: 'Faturamento', type: 'currency' },
      { key: 'total_descontos', label: 'Descontos', type: 'currency' },
      { key: 'total_taxas', label: 'Taxas', type: 'currency' },
      { key: 'total_comissoes', label: 'Comissões', type: 'currency' },
    ],
  },
  'vendas-loja': {
    titulo: 'Vendas por loja',
    descricao: 'Faturamento por loja e produtos vendidos no período.',
    colunas: [
      { key: 'loja', label: 'Unidade' },
      { key: 'quantidade_vendas', label: 'Vendas' },
      { key: 'total', label: 'Faturamento', type: 'currency' },
      { key: 'ticket_medio', label: 'Ticket médio', type: 'currency' },
    ],
  },
  'produtos-mais-vendidos': {
    titulo: 'Produtos mais vendidos',
    descricao: 'Ranking por quantidade e receita.',
    colunas: [
      { key: 'produto', label: 'Produto' },
      { key: 'categoria', label: 'Categoria', type: 'category' },
      { key: 'quantidade_total', label: 'Quantidade' },
      { key: 'receita_total', label: 'Receita', type: 'currency' },
    ],
  },
  'estoque-atual': {
    titulo: 'Estoque atual',
    descricao: 'Saldo e valor de estoque por loja.',
    semPeriodo: true,
    colunas: [
      { key: 'produto', label: 'Produto' },
      { key: 'categoria', label: 'Categoria', type: 'category' },
      { key: 'unidade', label: 'Unidade', type: 'unit' },
      { key: 'loja', label: 'Loja' },
      { key: 'quantidade', label: 'Quantidade' },
      { key: 'estoque_minimo', label: 'Mínimo' },
      { key: 'valor_em_estoque', label: 'Valor em estoque', type: 'currency' },
    ],
  },
  'estoque-minimo': {
    titulo: 'Produtos abaixo do estoque mínimo',
    descricao: 'Itens que precisam de reposição.',
    semPeriodo: true,
    colunas: [
      { key: 'produto', label: 'Produto' },
      { key: 'categoria', label: 'Categoria', type: 'category' },
      { key: 'loja', label: 'Loja' },
      { key: 'quantidade', label: 'Atual' },
      { key: 'estoque_minimo', label: 'Mínimo' },
      { key: 'falta', label: 'Falta' },
    ],
  },
  'compras-fornecedor': {
    titulo: 'Compras por fornecedor',
    descricao: 'Volume de compras agrupado por fornecedor e loja.',
    colunas: [
      { key: 'fornecedor', label: 'Fornecedor' },
      { key: 'loja', label: 'Loja' },
      { key: 'quantidade_compras', label: 'Compras' },
      { key: 'total', label: 'Total', type: 'currency' },
    ],
  },
  'fluxo-caixa': {
    titulo: 'Fluxo de caixa',
    descricao: 'Entradas, saídas e saldo diário.',
    colunas: [
      { key: 'data', label: 'Data', type: 'date' },
      { key: 'entradas', label: 'Entradas', type: 'currency' },
      { key: 'saidas', label: 'Saídas', type: 'currency' },
      { key: 'saldo', label: 'Saldo', type: 'currency' },
    ],
  },
  sangrias: {
    titulo: 'Sangrias',
    descricao: 'Retiradas de caixa registradas.',
    colunas: [
      { key: 'created_at', label: 'Data', type: 'datetime' },
      { key: 'loja_nome', label: 'Loja' },
      { key: 'descricao', label: 'Motivo' },
      { key: 'usuario_nome', label: 'Responsável' },
      { key: 'valor', label: 'Valor', type: 'currency' },
    ],
  },
  comissao: {
    titulo: 'Comissões',
    descricao: 'Comissão gerada por loja e vendedor.',
    colunas: [
      { key: 'loja', label: 'Loja' },
      { key: 'vendedor', label: 'Vendedor' },
      { key: 'quantidade_vendas', label: 'Vendas' },
      { key: 'total_vendas', label: 'Total vendido', type: 'currency' },
      { key: 'total_comissao', label: 'Comissão', type: 'currency' },
    ],
  },
};

let lojas = [];
let dadosAtuais = [];
let relatorioAtual = 'vendas-periodo';

function arrayFrom(response) {
  return response?.data || response || [];
}

function formatNumber(value, maximumFractionDigits = 3) {
  const num = typeof value === 'string' ? parseFloat(value) : Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString('pt-BR', { maximumFractionDigits });
}

function getProdutosVendidosAgregados(dados) {
  const produtosPorId = new Map();

  dados.forEach((loja) => {
    const produtos = Array.isArray(loja.produtos_vendidos) ? loja.produtos_vendidos : [];
    produtos.forEach((produto) => {
      const chave = `${produto.produto_id || produto.produto}|${produto.unidade || ''}`;
      const atual = produtosPorId.get(chave) || {
        produto: produto.produto || '-',
        unidade: produto.unidade || '',
        quantidade_total: 0,
      };

      atual.quantidade_total += parseFloat(produto.quantidade_total) || 0;
      produtosPorId.set(chave, atual);
    });
  });

  return [...produtosPorId.values()].sort((a, b) => {
    const diff = b.quantidade_total - a.quantidade_total;
    if (diff !== 0) return diff;
    return a.produto.localeCompare(b.produto);
  });
}

function formatValue(value, type) {
  if (type === 'currency') return formatCurrency(value);
  if (type === 'date') return formatDate(value);
  if (type === 'datetime') return formatDateTime(value);
  if (type === 'category') return getCategoriaLabel(value);
  if (type === 'unit') return getUnidadeLabel(value);
  return value ?? '-';
}

function formatCsvValue(value, type) {
  return formatValue(value, type);
}

function csvValue(value) {
  const texto = String(value ?? '').replaceAll('"', '""');
  return `"${texto}"`;
}

function exportarCsv() {
  const definicao = relatorios[relatorioAtual];
  let linhas;

  if (relatorioAtual === 'vendas-loja') {
    const produtos = getProdutosVendidosAgregados(dadosAtuais);
    linhas = [
      csvValue('Faturamento'),
      definicao.colunas.map((coluna) => csvValue(coluna.label)).join(';'),
      ...dadosAtuais.map((item) =>
        definicao.colunas.map((coluna) =>
          csvValue(formatCsvValue(item[coluna.key], coluna.type))
        ).join(';')
      ),
      '',
      csvValue('Produtos vendidos'),
      [csvValue('Produto'), csvValue('Quantidade')].join(';'),
      ...produtos.map((produto) => [
        csvValue(produto.produto),
        csvValue(`${formatNumber(produto.quantidade_total)} ${getUnidadeLabel(produto.unidade)}`),
      ].join(';')),
    ];
  } else {
    linhas = [
      definicao.colunas.map((coluna) => csvValue(coluna.label)).join(';'),
      ...dadosAtuais.map((item) =>
        definicao.colunas.map((coluna) =>
          csvValue(formatCsvValue(item[coluna.key], coluna.type))
        ).join(';')
      ),
    ];
  }

  const blob = new Blob([`\uFEFF${linhas.join('\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${relatorioAtual}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function render(container) {
  container.innerHTML = '<div class="loading-overlay"><div class="loading-spinner"></div></div>';

  try {
    lojas = arrayFrom(await api.get('/lojas')).filter((loja) => loja.situacao === 'ativa');
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><h4>Erro ao carregar relatórios</h4><p>${error.message}</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Relatórios</h1>
        <p class="page-subtitle">Consultas gerenciais com exportação para planilha.</p>
      </div>
      <button class="btn btn-outline" id="btn-exportar-relatorio" disabled>
        ${icons.download()} Exportar CSV
      </button>
    </div>

    <div class="reports-layout">
      <aside class="report-menu" id="report-menu">
        ${Object.entries(relatorios).map(([chave, relatorio], index) => `
          <button class="report-menu-item ${index === 0 ? 'active' : ''}" data-relatorio="${chave}">
            ${icons.fileText()}
            <span>${relatorio.titulo}</span>
          </button>
        `).join('')}
      </aside>

      <section class="report-content">
        <div class="card filters-panel">
          <div class="report-heading">
            <div>
              <h2 id="relatorio-titulo"></h2>
              <p class="text-muted" id="relatorio-descricao"></p>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Unidade</label>
              <select class="form-control" id="relatorio-loja">
                <option value="">Todas as unidades</option>
                ${lojas.map((loja) => `<option value="${loja.id}">${loja.nome}</option>`).join('')}
              </select>
            </div>
            <div class="form-group period-filter">
              <label class="form-label">Data inicial</label>
              <input class="form-control" type="date" id="relatorio-inicio">
            </div>
            <div class="form-group period-filter">
              <label class="form-label">Data final</label>
              <input class="form-control" type="date" id="relatorio-fim">
            </div>
            <div class="form-group form-action">
              <button class="btn btn-primary" id="btn-gerar-relatorio">${icons.refreshCw()} Gerar</button>
            </div>
          </div>
        </div>
        <div id="relatorio-resumo"></div>
        <div id="relatorio-tabela"></div>
      </section>
    </div>
  `;

  let table = null;

  function renderVendasLoja(dados) {
    const tabelaContainer = container.querySelector('#relatorio-tabela');
    const produtos = getProdutosVendidosAgregados(dados);
    const totalVendas = dados.reduce(
      (total, loja) => total + (parseInt(loja.quantidade_vendas, 10) || 0),
      0
    );
    const totalFaturamento = dados.reduce(
      (total, loja) => total + (parseFloat(loja.total) || 0),
      0
    );
    const ticketMedio = totalVendas > 0 ? totalFaturamento / totalVendas : 0;

    const faturamentoPorLoja = dados.length > 0
      ? dados.map((loja) => `
          <div class="report-store-metric">
            <span>${escapeHtml(loja.loja || '-')}</span>
            <strong>${escapeHtml(formatCurrency(loja.total))}</strong>
            <small>${escapeHtml(formatNumber(loja.quantidade_vendas, 0))} venda(s) · Ticket ${escapeHtml(formatCurrency(loja.ticket_medio))}</small>
          </div>
        `).join('')
      : '<p class="text-muted">Nenhuma venda encontrada no período.</p>';

    const produtosRows = produtos.length > 0
      ? produtos.map((produto) => `
          <tr>
            <td>${escapeHtml(produto.produto)}</td>
            <td>${escapeHtml(formatNumber(produto.quantidade_total))} ${escapeHtml(getUnidadeLabel(produto.unidade))}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="2" class="text-center text-muted" style="padding:24px;">Nenhum produto vendido</td></tr>';

    tabelaContainer.innerHTML = `
      <div class="report-sales-store-view">
        <div class="card report-sales-card">
          <div class="report-card-header">
            <div>
              <h3>Faturamento</h3>
              <p class="text-muted">Resumo financeiro por loja</p>
            </div>
            <div class="report-total-billing">
              <span>Total</span>
              <strong>${escapeHtml(formatCurrency(totalFaturamento))}</strong>
              <small>${escapeHtml(formatNumber(totalVendas, 0))} venda(s) · Ticket ${escapeHtml(formatCurrency(ticketMedio))}</small>
            </div>
          </div>
          <div class="report-store-grid">
            ${faturamentoPorLoja}
          </div>
        </div>

        <div class="card report-sales-card">
          <div class="report-card-header">
            <div>
              <h3>Produtos vendidos</h3>
            </div>
          </div>
          <div class="report-products-table-wrap">
            <table class="data-table report-products-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Quantidade</th>
                </tr>
              </thead>
              <tbody>
                ${produtosRows}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function montarTabela() {
    const definicao = relatorios[relatorioAtual];
    const tabelaContainer = container.querySelector('#relatorio-tabela');
    tabelaContainer.innerHTML = '';
    if (relatorioAtual === 'vendas-loja') {
      table = null;
      return;
    }
    table = createTable(tabelaContainer, {
      columns: definicao.colunas.map((coluna) => ({
        key: coluna.key,
        label: coluna.label,
        sortable: coluna.sortable !== false,
        render: (value) => formatValue(value, coluna.type),
      })),
      data: [],
      searchable: true,
      pageSize: 20,
    });
  }

  function atualizarCabecalho() {
    const definicao = relatorios[relatorioAtual];
    container.querySelector('#relatorio-titulo').textContent = definicao.titulo;
    container.querySelector('#relatorio-descricao').textContent = definicao.descricao;
    container.querySelectorAll('.period-filter').forEach((elemento) => {
      elemento.style.display = definicao.semPeriodo ? 'none' : '';
    });
    montarTabela();
  }

  async function gerar() {
    const params = new URLSearchParams();
    const lojaId = container.querySelector('#relatorio-loja').value;
    const inicio = container.querySelector('#relatorio-inicio').value;
    const fim = container.querySelector('#relatorio-fim').value;
    if (lojaId) params.set('loja_id', lojaId);
    if (!relatorios[relatorioAtual].semPeriodo && inicio) params.set('data_inicio', inicio);
    if (!relatorios[relatorioAtual].semPeriodo && fim) params.set('data_fim', fim);

    const button = container.querySelector('#btn-gerar-relatorio');
    button.disabled = true;

    try {
      dadosAtuais = arrayFrom(await api.get(`/relatorios/${relatorioAtual}?${params}`));
      if (relatorioAtual === 'vendas-loja') {
        renderVendasLoja(dadosAtuais);
      } else {
        table.update(dadosAtuais);
      }
      container.querySelector('#btn-exportar-relatorio').disabled = dadosAtuais.length === 0;
      container.querySelector('#relatorio-resumo').innerHTML = `
        <div class="report-result-summary">
          <span>${dadosAtuais.length} registro(s) encontrado(s)</span>
        </div>
      `;
    } catch (error) {
      showToast(error.message || 'Erro ao gerar relatório', 'error');
    } finally {
      button.disabled = false;
    }
  }

  container.querySelectorAll('[data-relatorio]').forEach((button) => {
    button.addEventListener('click', () => {
      relatorioAtual = button.dataset.relatorio;
      dadosAtuais = [];
      container.querySelectorAll('[data-relatorio]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      container.querySelector('#btn-exportar-relatorio').disabled = true;
      container.querySelector('#relatorio-resumo').innerHTML = '';
      atualizarCabecalho();
      gerar();
    });
  });

  container.querySelector('#btn-gerar-relatorio').addEventListener('click', gerar);
  container.querySelector('#btn-exportar-relatorio').addEventListener('click', exportarCsv);

  atualizarCabecalho();
  gerar();
}
