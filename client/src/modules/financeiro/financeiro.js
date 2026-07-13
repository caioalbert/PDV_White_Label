import api from '../../api.js';
import icons from '../../icons.js';
import { getCurrentLojaId, getUser, isAdmin } from '../../auth.js';
import { formatCurrency, formatDateTime } from '../../utils.js';
import { createTable } from '../../components/table.js';
import { closeModal, openModal } from '../../components/modal.js';
import { showToast } from '../../components/toast.js';

let lojas = [];
let lojaId = null;

function arrayFrom(response) {
  return response?.data || response || [];
}

function categoriaLabel(categoria) {
  const labels = {
    venda: 'Venda',
    compra: 'Compra',
    frete: 'Frete',
    imposto: 'Imposto',
    descarregamento: 'Descarregamento',
    producao: 'Produção',
    despesa: 'Despesa diversa',
    sangria: 'Sangria',
  };
  return labels[categoria] || categoria || '-';
}

async function loadLojas() {
  lojas = arrayFrom(await api.get('/lojas?tipo=loja&situacao=ativa'));
  if (!isAdmin()) {
    lojas = lojas.filter((loja) => loja.id == getUser()?.loja_id);
  }
  const lojaPreferida = getCurrentLojaId();
  lojaId = lojas.some((loja) => loja.id == lojaPreferida)
    ? lojaPreferida
    : lojas[0]?.id || null;
}

function lojaSelect(id, todas = false) {
  return `
    <select class="form-control" id="${id}" ${isAdmin() ? '' : 'disabled'}>
      ${todas && isAdmin() ? '<option value="">Todas as lojas</option>' : ''}
      ${lojas.map((loja) => `
        <option value="${loja.id}" ${loja.id == lojaId ? 'selected' : ''}>${loja.nome}</option>
      `).join('')}
    </select>
  `;
}

function openLancamentoModal(onSaved) {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label">Loja *</label>
      ${lojaSelect('lancamento-loja')}
    </div>
    <div class="form-group">
      <label class="form-label">Categoria *</label>
      <select class="form-control" id="lancamento-categoria">
        <option value="frete">Frete</option>
        <option value="imposto">Imposto</option>
        <option value="descarregamento">Descarregamento</option>
        <option value="producao">Produção</option>
        <option value="despesa">Despesa diversa</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Descrição *</label>
      <input class="form-control" id="lancamento-descricao" maxlength="255">
    </div>
    <div class="form-group">
      <label class="form-label">Valor (R$) *</label>
      <input class="form-control" type="number" id="lancamento-valor" min="0.01" step="0.01">
    </div>
  `;

  openModal({
    title: 'Nova saída financeira',
    content,
    confirmText: 'Registrar saída',
    onConfirm: async () => {
      const payload = {
        loja_id: parseInt(content.querySelector('#lancamento-loja').value, 10),
        tipo: 'saida',
        categoria: content.querySelector('#lancamento-categoria').value,
        descricao: content.querySelector('#lancamento-descricao').value.trim(),
        valor: parseFloat(content.querySelector('#lancamento-valor').value),
      };

      if (!payload.loja_id || !payload.descricao || !payload.valor || payload.valor <= 0) {
        showToast('Preencha loja, descrição e valor', 'error');
        return;
      }

      try {
        await api.post('/financeiro/lancamentos', payload);
        closeModal();
        showToast('Saída registrada com sucesso', 'success');
        onSaved();
      } catch (error) {
        showToast(error.message, 'error');
      }
    },
  });
}

function renderLancamentos(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Movimentações Financeiras</h1>
        <p class="page-subtitle">Entradas de vendas e saídas operacionais por loja.</p>
      </div>
      <button class="btn btn-primary" id="btn-nova-saida">${icons.minus()} Nova saída</button>
    </div>
    <div class="card filters-panel">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Loja</label>
          ${lojaSelect('financeiro-loja', true)}
        </div>
        <div class="form-group">
          <label class="form-label">Tipo</label>
          <select class="form-control" id="financeiro-tipo">
            <option value="">Entradas e saídas</option>
            <option value="entrada">Entradas</option>
            <option value="saida">Saídas</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Data inicial</label>
          <input class="form-control" type="date" id="financeiro-inicio">
        </div>
        <div class="form-group">
          <label class="form-label">Data final</label>
          <input class="form-control" type="date" id="financeiro-fim">
        </div>
        <div class="form-group form-action">
          <button class="btn btn-primary" id="btn-filtrar-financeiro">${icons.filter()} Filtrar</button>
        </div>
      </div>
    </div>
    <div class="stats-grid compact-stats" id="financeiro-resumo"></div>
    <div id="financeiro-table"></div>
  `;

  const table = createTable(container.querySelector('#financeiro-table'), {
    columns: [
      { key: 'created_at', label: 'Data', render: formatDateTime },
      { key: 'loja_nome', label: 'Loja' },
      {
        key: 'tipo',
        label: 'Tipo',
        render: (value) => value === 'entrada'
          ? '<span class="badge badge-success">Entrada</span>'
          : '<span class="badge badge-danger">Saída</span>',
      },
      { key: 'categoria', label: 'Categoria', render: categoriaLabel },
      { key: 'descricao', label: 'Descrição' },
      {
        key: 'valor',
        label: 'Valor',
        render: (value, row) => `<strong class="${row.tipo === 'entrada' ? 'text-success' : 'text-danger'}">${formatCurrency(value)}</strong>`,
      },
    ],
    data: [],
    searchable: true,
    pageSize: 20,
  });

  async function carregar() {
    const params = new URLSearchParams();
    const filtroLoja = container.querySelector('#financeiro-loja').value;
    const tipo = container.querySelector('#financeiro-tipo').value;
    const inicio = container.querySelector('#financeiro-inicio').value;
    const fim = container.querySelector('#financeiro-fim').value;
    if (filtroLoja) params.set('loja_id', filtroLoja);
    if (tipo) params.set('tipo', tipo);
    if (inicio) params.set('data_inicio', inicio);
    if (fim) params.set('data_fim', fim);

    try {
      const dados = arrayFrom(await api.get(`/financeiro/lancamentos?${params}`));
      table.update(dados);
      const entradas = dados
        .filter((item) => item.tipo === 'entrada')
        .reduce((total, item) => total + parseFloat(item.valor || 0), 0);
      const saidas = dados
        .filter((item) => item.tipo === 'saida')
        .reduce((total, item) => total + parseFloat(item.valor || 0), 0);
      container.querySelector('#financeiro-resumo').innerHTML = `
        <div class="stat-card green">
          <div class="stat-icon">${icons.trendingUp()}</div>
          <span class="stat-label">Entradas no filtro</span>
          <span class="stat-value">${formatCurrency(entradas)}</span>
        </div>
        <div class="stat-card red">
          <div class="stat-icon">${icons.trendingDown()}</div>
          <span class="stat-label">Saídas no filtro</span>
          <span class="stat-value">${formatCurrency(saidas)}</span>
        </div>
        <div class="stat-card blue">
          <div class="stat-icon">${icons.wallet()}</div>
          <span class="stat-label">Saldo no filtro</span>
          <span class="stat-value">${formatCurrency(entradas - saidas)}</span>
        </div>
      `;
    } catch (error) {
      showToast(error.message || 'Erro ao carregar financeiro', 'error');
    }
  }

  container.querySelector('#btn-filtrar-financeiro').addEventListener('click', carregar);
  container.querySelector('#btn-nova-saida').addEventListener('click', () => openLancamentoModal(carregar));
  carregar();
}

function openSangriaModal(onSaved) {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label">Loja *</label>
      ${lojaSelect('sangria-loja')}
    </div>
    <div class="form-group">
      <label class="form-label">Valor (R$) *</label>
      <input class="form-control" type="number" min="0.01" step="0.01" id="sangria-valor">
    </div>
    <div class="form-group">
      <label class="form-label">Motivo *</label>
      <textarea class="form-control" id="sangria-motivo"></textarea>
    </div>
  `;

  openModal({
    title: 'Registrar sangria',
    content,
    confirmText: 'Confirmar sangria',
    onConfirm: async () => {
      const payload = {
        loja_id: parseInt(content.querySelector('#sangria-loja').value, 10),
        valor: parseFloat(content.querySelector('#sangria-valor').value),
        descricao: content.querySelector('#sangria-motivo').value.trim(),
      };

      if (!payload.loja_id || !payload.valor || payload.valor <= 0 || !payload.descricao) {
        showToast('Preencha todos os campos', 'error');
        return;
      }

      try {
        await api.post('/financeiro/sangria', payload);
        closeModal();
        showToast('Sangria registrada com sucesso', 'success');
        onSaved();
      } catch (error) {
        showToast(error.message, 'error');
      }
    },
  });
}

function renderSangrias(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Sangrias</h1>
        <p class="page-subtitle">Retiradas registradas no caixa de cada loja.</p>
      </div>
      <button class="btn btn-primary" id="btn-nova-sangria">${icons.banknote()} Nova sangria</button>
    </div>
    <div class="card filters-panel">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Loja</label>
          ${lojaSelect('sangria-filtro-loja', true)}
        </div>
        <div class="form-group form-action">
          <button class="btn btn-primary" id="btn-filtrar-sangria">${icons.filter()} Filtrar</button>
        </div>
      </div>
    </div>
    <div id="sangrias-table"></div>
  `;

  const table = createTable(container.querySelector('#sangrias-table'), {
    columns: [
      { key: 'created_at', label: 'Data', render: formatDateTime },
      { key: 'loja_nome', label: 'Loja' },
      { key: 'descricao', label: 'Motivo' },
      { key: 'usuario_nome', label: 'Responsável' },
      { key: 'valor', label: 'Valor', render: formatCurrency },
    ],
    data: [],
    searchable: true,
  });

  async function carregar() {
    const params = new URLSearchParams();
    const filtroLoja = container.querySelector('#sangria-filtro-loja').value;
    if (filtroLoja) params.set('loja_id', filtroLoja);
    try {
      table.update(arrayFrom(await api.get(`/relatorios/sangrias?${params}`)));
    } catch (error) {
      showToast(error.message || 'Erro ao carregar sangrias', 'error');
    }
  }

  container.querySelector('#btn-filtrar-sangria').addEventListener('click', carregar);
  container.querySelector('#btn-nova-sangria').addEventListener('click', () => openSangriaModal(carregar));
  carregar();
}

function openCaixaModal(tipo, onSaved) {
  const isAbertura = tipo === 'abrir';
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label">Loja</label>
      ${lojaSelect('caixa-modal-loja')}
    </div>
    ${isAbertura ? `
      <div class="form-group">
        <label class="form-label">Saldo de abertura (R$)</label>
        <input class="form-control" type="number" id="caixa-saldo" min="0" step="0.01" value="0">
      </div>
    ` : '<p>O saldo será calculado com base nas entradas e saídas desde a abertura.</p>'}
  `;

  openModal({
    title: isAbertura ? 'Abrir caixa' : 'Fechar caixa',
    content,
    confirmText: isAbertura ? 'Abrir caixa' : 'Fechar caixa',
    onConfirm: async () => {
      const payload = {
        loja_id: parseInt(content.querySelector('#caixa-modal-loja').value, 10),
      };
      if (isAbertura) {
        payload.saldo_abertura = parseFloat(content.querySelector('#caixa-saldo').value) || 0;
      }

      try {
        const response = await api.post(`/financeiro/caixa/${tipo}`, payload);
        closeModal();
        if (!isAbertura && response.resumo) {
          showToast(`Caixa fechado com saldo de ${formatCurrency(response.resumo.saldo_fechamento)}`, 'success');
        } else {
          showToast('Caixa aberto com sucesso', 'success');
        }
        onSaved();
      } catch (error) {
        showToast(error.message, 'error');
      }
    },
  });
}

function renderCaixa(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Controle de Caixa</h1>
        <p class="page-subtitle">Abertura, fechamento e histórico por loja.</p>
      </div>
    </div>
    <div class="card filters-panel">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Loja</label>
          ${lojaSelect('caixa-loja')}
        </div>
      </div>
    </div>
    <div id="caixa-status"></div>
    <div class="page-header mt-lg">
      <h2>Histórico</h2>
    </div>
    <div id="caixa-historico"></div>
  `;

  const table = createTable(container.querySelector('#caixa-historico'), {
    columns: [
      { key: 'aberto_em', label: 'Abertura', render: formatDateTime },
      { key: 'fechado_em', label: 'Fechamento', render: (value) => value ? formatDateTime(value) : '-' },
      { key: 'loja_nome', label: 'Loja' },
      { key: 'usuario_nome', label: 'Responsável' },
      { key: 'saldo_abertura', label: 'Saldo inicial', render: formatCurrency },
      { key: 'total_entradas', label: 'Entradas', render: formatCurrency },
      { key: 'total_saidas', label: 'Saídas', render: formatCurrency },
      {
        key: 'saldo_atual',
        label: 'Saldo atual/final',
        render: formatCurrency,
      },
      {
        key: 'status',
        label: 'Status',
        render: (value) => value === 'aberto'
          ? '<span class="badge badge-success">Aberto</span>'
          : '<span class="badge badge-neutral">Fechado</span>',
      },
    ],
    data: [],
    searchable: false,
  });

  async function carregar() {
    const selectedLoja = parseInt(container.querySelector('#caixa-loja').value, 10);
    lojaId = selectedLoja || lojaId;
    const params = new URLSearchParams({ loja_id: lojaId });

    try {
      const [caixa, historico] = await Promise.all([
        api.get(`/financeiro/caixa?${params}`),
        api.get(`/financeiro/caixa/historico?${params}`),
      ]);
      const caixaAbertoHoje = caixa && caixa.aberto_hoje !== false;
      const caixaAbertoAntigo = caixa && !caixaAbertoHoje;

      container.querySelector('#caixa-status').innerHTML = caixa
        ? caixaAbertoHoje
          ? `
          <div class="card cash-status cash-open">
            <div>
              <span class="badge badge-success">Caixa aberto</span>
              <h2>${caixa.loja_nome}</h2>
              <p class="text-muted">Aberto por ${caixa.usuario_nome || '-'} em ${formatDateTime(caixa.aberto_em)}</p>
            </div>
            <div class="cash-live-summary">
              <div>
                <span>Saldo de abertura</span>
                <strong>${formatCurrency(caixa.resumo?.saldo_abertura)}</strong>
              </div>
              <div>
                <span>Entradas</span>
                <strong class="text-success">+ ${formatCurrency(caixa.resumo?.total_entradas)}</strong>
              </div>
              <div>
                <span>Saídas</span>
                <strong class="text-danger">- ${formatCurrency(caixa.resumo?.total_saidas)}</strong>
              </div>
              <div class="cash-current-balance">
                <span>Saldo atual</span>
                <strong>${formatCurrency(caixa.resumo?.saldo_atual)}</strong>
              </div>
            </div>
            <button class="btn btn-danger" id="btn-fechar-caixa">${icons.x()} Fechar caixa</button>
          </div>
        `
          : `
          <div class="card cash-status">
            <div>
              <span class="badge badge-warning">Caixa pendente</span>
              <h2>${caixa.loja_nome}</h2>
              <p class="text-muted">Aberto em ${formatDateTime(caixa.aberto_em)}. Fechamento permitido somente no dia de abertura.</p>
            </div>
          </div>
        `
        : `
          <div class="card cash-status">
            <div>
              <span class="badge badge-neutral">Caixa fechado</span>
              <h2>${lojas.find((loja) => loja.id == lojaId)?.nome || 'Loja'}</h2>
              <p class="text-muted">Abra o caixa para iniciar o turno.</p>
            </div>
            <button class="btn btn-primary" id="btn-abrir-caixa">${icons.plus()} Abrir caixa</button>
          </div>
        `;

      const abrir = container.querySelector('#btn-abrir-caixa');
      const fechar = container.querySelector('#btn-fechar-caixa');
      if (abrir) abrir.addEventListener('click', () => openCaixaModal('abrir', carregar));
      if (fechar && !caixaAbertoAntigo) fechar.addEventListener('click', () => openCaixaModal('fechar', carregar));

      table.update(arrayFrom(historico));
    } catch (error) {
      showToast(error.message || 'Erro ao carregar caixa', 'error');
    }
  }

  container.querySelector('#caixa-loja').addEventListener('change', carregar);
  carregar();
}

export async function render(container) {
  container.innerHTML = '<div class="loading-overlay"><div class="loading-spinner"></div></div>';

  try {
    await loadLojas();
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><h4>Erro ao carregar financeiro</h4><p>${error.message}</p></div>`;
    return;
  }

  if (!isAdmin()) {
    renderCaixa(container);
    return;
  }

  container.innerHTML = `
    <div class="tab-nav">
      <button class="tab-btn active" data-tab="lancamentos">Lançamentos</button>
      <button class="tab-btn" data-tab="sangrias">Sangrias</button>
      <button class="tab-btn" data-tab="caixa">Caixa</button>
    </div>
    <div class="tab-content" id="financeiro-conteudo"></div>
  `;

  const conteudo = container.querySelector('#financeiro-conteudo');
  function trocarAba(aba) {
    container.querySelectorAll('[data-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === aba);
    });
    if (aba === 'lancamentos') renderLancamentos(conteudo);
    if (aba === 'sangrias') renderSangrias(conteudo);
    if (aba === 'caixa') renderCaixa(conteudo);
  }

  container.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => trocarAba(button.dataset.tab));
  });
  trocarAba('lancamentos');
}
