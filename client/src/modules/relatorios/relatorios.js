import api from '../../api.js';
import icons from '../../icons.js';
import { formatCurrency, formatDate, formatDateTime, getCategoriaLabel, getUnidadeLabel } from '../../utils.js';
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
    descricao: 'Comparativo de vendas e ticket médio.',
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

function formatValue(value, type) {
  if (type === 'currency') return formatCurrency(value);
  if (type === 'date') return formatDate(value);
  if (type === 'datetime') return formatDateTime(value);
  if (type === 'category') return getCategoriaLabel(value);
  if (type === 'unit') return getUnidadeLabel(value);
  return value ?? '-';
}

function csvValue(value) {
  const texto = String(value ?? '').replaceAll('"', '""');
  return `"${texto}"`;
}

function exportarCsv() {
  const definicao = relatorios[relatorioAtual];
  const linhas = [
    definicao.colunas.map((coluna) => csvValue(coluna.label)).join(';'),
    ...dadosAtuais.map((item) =>
      definicao.colunas.map((coluna) =>
        csvValue(formatValue(item[coluna.key], coluna.type))
      ).join(';')
    ),
  ];

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

  function montarTabela() {
    const definicao = relatorios[relatorioAtual];
    const tabelaContainer = container.querySelector('#relatorio-tabela');
    tabelaContainer.innerHTML = '';
    table = createTable(tabelaContainer, {
      columns: definicao.colunas.map((coluna) => ({
        key: coluna.key,
        label: coluna.label,
        sortable: true,
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
      table.update(dadosAtuais);
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
