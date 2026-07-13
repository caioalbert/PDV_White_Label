import api from '../../api.js';
import icons from '../../icons.js';
import { formatCurrency, formatDateTime, getCategoriaLabel, getUnidadeLabel } from '../../utils.js';
import { openModal, closeModal } from '../../components/modal.js';
import { createTable } from '../../components/table.js';
import { showToast } from '../../components/toast.js';
import { getCurrentLojaId, isAdmin } from '../../auth.js';

let tableInstance = null;
let currentLojaId = null;
let lojas = [];

async function loadLojas() {
    try {
        const res = await api.get('/lojas?situacao=ativa');
        lojas = res.data || res || [];
        if (!isAdmin()) {
            const lojaId = getCurrentLojaId();
            lojas = lojas.filter((loja) => loja.id == lojaId);
        }
    } catch {
        lojas = [];
    }
    return lojas;
}

async function loadEstoque(container) {
    if (!currentLojaId) return;
    try {
        const res = await api.get('/estoque?loja_id=' + currentLojaId);
        const estoque = res.data || res || [];
        if (tableInstance) {
            tableInstance.update(estoque);
        }
    } catch (err) {
        showToast('Erro ao carregar estoque', 'error');
    }
}

function getCategoriaBadge(categoria) {
    const map = {
        gesso_convencional: 'badge-info',
        drywall: 'badge-success',
        producao_propria: 'badge-warning'
    };
    return map[categoria] || 'badge-secondary';
}

function getTipoBadge(tipo) {
    const map = {
        entrada: 'badge-success',
        saida: 'badge-danger',
        transferencia: 'badge-info',
        ajuste: 'badge-warning',
        perda: 'badge-danger',
        producao: 'badge-primary',
        venda: 'badge-danger',
        compra: 'badge-success'
    };
    return map[tipo] || 'badge-secondary';
}

function getTipoLabel(tipo) {
    const map = {
        entrada: 'Entrada',
        saida: 'Saída',
        transferencia: 'Transferência',
        ajuste: 'Ajuste',
        perda: 'Perda',
        producao: 'Produção',
        venda: 'Venda',
        compra: 'Compra'
    };
    return map[tipo] || tipo;
}

async function openMovimentacaoModal(tipo) {
    let produtos = [];
    try {
        const res = await api.get('/produtos?ativo=true');
        produtos = res.data || res || [];
    } catch {
        produtos = [];
    }

    const tipoLabels = {
        entrada: 'Entrada de Estoque',
        saida: 'Saída de Estoque',
        ajuste: 'Ajuste de Estoque',
        perda: 'Registro de Perda'
    };

    const content = document.createElement('div');
    content.innerHTML = `
        <form id="form-movimentacao">
            <div class="form-group">
                <label for="mov-produto">Produto *</label>
                <select id="mov-produto" class="form-control" required>
                    <option value="">Selecione...</option>
                    ${produtos.map(p => `<option value="${p.id}">${p.nome} (${getUnidadeLabel(p.unidade)})</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="mov-quantidade">Quantidade *</label>
                <input type="number" id="mov-quantidade" class="form-control" min="1" step="1" required />
            </div>
            <div class="form-group">
                <label for="mov-motivo">Motivo</label>
                <input type="text" id="mov-motivo" class="form-control" placeholder="Descreva o motivo..." />
            </div>
        </form>
    `;

    openModal({
        title: tipoLabels[tipo] || tipo,
        content,
        confirmText: 'Confirmar',
        cancelText: 'Cancelar',
        onConfirm: async () => {
            const produto_id = parseInt(content.querySelector('#mov-produto').value);
            const quantidade = parseInt(content.querySelector('#mov-quantidade').value);
            const motivo = content.querySelector('#mov-motivo').value.trim();

            if (!produto_id) {
                showToast('Selecione um produto', 'error');
                return;
            }
            if (!quantidade || quantidade <= 0) {
                showToast('Informe uma quantidade válida', 'error');
                return;
            }

            try {
                const payload = {
                    produto_id,
                    loja_id: currentLojaId,
                    quantidade,
                    motivo
                };
                if (tipo === 'ajuste') {
                    payload.quantidade_nova = quantidade;
                    delete payload.quantidade;
                }
                if (tipo === 'perda' && !motivo) {
                    showToast('Informe o motivo da perda', 'error');
                    return;
                }
                await api.post('/estoque/' + tipo, payload);
                showToast('Movimentação registrada com sucesso', 'success');
                closeModal();
                loadEstoque();
            } catch (err) {
                showToast('Erro ao registrar movimentação', 'error');
            }
        }
    });
}

async function openTransferenciaModal() {
    let produtos = [];
    try {
        const res = await api.get('/produtos?ativo=true');
        produtos = res.data || res || [];
    } catch {
        produtos = [];
    }

    const lojasDestino = lojas.filter(l => l.id != currentLojaId);
    const lojaOrigem = lojas.find(l => l.id == currentLojaId);

    const content = document.createElement('div');
    content.innerHTML = `
        <form id="form-transferencia">
            <div class="form-group">
                <label>Unidade de Origem</label>
                <input type="text" class="form-control" value="${lojaOrigem?.nome || '-'}" disabled />
            </div>
            <div class="form-group">
                <label for="transf-destino">Unidade de Destino *</label>
                <select id="transf-destino" class="form-control" required>
                    <option value="">Selecione...</option>
                    ${lojasDestino.map(l => `<option value="${l.id}">${l.nome}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="transf-produto">Produto *</label>
                <select id="transf-produto" class="form-control" required>
                    <option value="">Selecione...</option>
                    ${produtos.map(p => `<option value="${p.id}">${p.nome} (${getUnidadeLabel(p.unidade)})</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="transf-quantidade">Quantidade *</label>
                <input type="number" id="transf-quantidade" class="form-control" min="1" step="1" required />
            </div>
        </form>
    `;

    openModal({
        title: 'Transferência entre Unidades',
        content,
        confirmText: 'Confirmar Transferência',
        cancelText: 'Cancelar',
        onConfirm: async () => {
            const loja_destino_id = parseInt(content.querySelector('#transf-destino').value);
            const produto_id = parseInt(content.querySelector('#transf-produto').value);
            const quantidade = parseInt(content.querySelector('#transf-quantidade').value);

            if (!loja_destino_id) {
                showToast('Selecione a unidade de destino', 'error');
                return;
            }
            if (!produto_id) {
                showToast('Selecione um produto', 'error');
                return;
            }
            if (!quantidade || quantidade <= 0) {
                showToast('Informe uma quantidade válida', 'error');
                return;
            }

            try {
                await api.post('/estoque/transferir', {
                    produto_id,
                    loja_origem_id: currentLojaId,
                    loja_destino_id,
                    quantidade
                });
                showToast('Transferência realizada com sucesso', 'success');
                closeModal();
                loadEstoque();
            } catch (err) {
                showToast('Erro ao realizar transferência', 'error');
            }
        }
    });
}

function renderEstoqueTab(tabContent) {
    tabContent.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `<h1>Estoque</h1>`;
    tabContent.appendChild(header);

    // Store filter
    const lojaFilter = document.createElement('div');
    lojaFilter.className = 'filter-tabs';
    lojaFilter.id = 'loja-filter';
    tabContent.appendChild(lojaFilter);

    // Action buttons
    const actionsBar = document.createElement('div');
    actionsBar.className = 'actions-bar';
    actionsBar.style.cssText = 'display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;';
    actionsBar.innerHTML = `
        <button class="btn btn-success btn-sm" id="btn-entrada">
            ${icons.plus()} Entrada
        </button>
        <button class="btn btn-danger btn-sm" id="btn-saida">
            ${icons.minus()} Saída
        </button>
        <button class="btn btn-info btn-sm" id="btn-transferencia">
            ${icons.arrowLeftRight()} Transferência
        </button>
        <button class="btn btn-warning btn-sm" id="btn-ajuste">
            ${icons.edit()} Ajuste
        </button>
        <button class="btn btn-danger btn-sm" id="btn-perda">
            ${icons.trash2()} Perda
        </button>
    `;
    if (isAdmin()) {
        tabContent.appendChild(actionsBar);
    }

    // Table container
    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';
    tabContent.appendChild(tableContainer);

    tableInstance = createTable(tableContainer, {
        columns: [
            {
                key: 'produto_nome',
                label: 'Produto',
                sortable: true,
                render: (val, row) => val || row.produto?.nome || '-'
            },
            {
                key: 'categoria',
                label: 'Categoria',
                sortable: true,
                render: (val, row) => {
                    const cat = val || row.produto?.categoria || '';
                    return `<span class="badge ${getCategoriaBadge(cat)}">${getCategoriaLabel(cat)}</span>`;
                }
            },
            {
                key: 'unidade',
                label: 'Unidade',
                render: (val, row) => getUnidadeLabel(val || row.produto?.unidade || '')
            },
            {
                key: 'quantidade',
                label: 'Quantidade',
                sortable: true
            },
            {
                key: 'estoque_minimo',
                label: 'Est. Mínimo',
                sortable: true,
                render: (val, row) => val ?? row.produto?.estoque_minimo ?? 0
            },
            {
                key: 'status',
                label: 'Status',
                render: (val, row) => {
                    const qtd = row.quantidade || 0;
                    const min = row.estoque_minimo ?? row.produto?.estoque_minimo ?? 0;
                    if (qtd >= min) {
                        return '<span class="badge badge-success">OK</span>';
                    }
                    return '<span class="badge badge-danger">BAIXO</span>';
                }
            }
        ],
        data: [],
        searchable: true,
        pageSize: 20,
        rowClass: (row) => {
            const qtd = row.quantidade || 0;
            const min = row.estoque_minimo ?? row.produto?.estoque_minimo ?? 0;
            return qtd < min ? 'row-danger' : '';
        }
    });

    // Action button events
    if (isAdmin()) {
        actionsBar.querySelector('#btn-entrada').addEventListener('click', () => {
            if (!currentLojaId) { showToast('Selecione uma unidade primeiro', 'error'); return; }
            openMovimentacaoModal('entrada');
        });
        actionsBar.querySelector('#btn-saida').addEventListener('click', () => {
            if (!currentLojaId) { showToast('Selecione uma unidade primeiro', 'error'); return; }
            openMovimentacaoModal('saida');
        });
        actionsBar.querySelector('#btn-transferencia').addEventListener('click', () => {
            if (!currentLojaId) { showToast('Selecione uma unidade primeiro', 'error'); return; }
            openTransferenciaModal();
        });
        actionsBar.querySelector('#btn-ajuste').addEventListener('click', () => {
            if (!currentLojaId) { showToast('Selecione uma unidade primeiro', 'error'); return; }
            openMovimentacaoModal('ajuste');
        });
        actionsBar.querySelector('#btn-perda').addEventListener('click', () => {
            if (!currentLojaId) { showToast('Selecione uma unidade primeiro', 'error'); return; }
            openMovimentacaoModal('perda');
        });
    }

    // Render store filter buttons
    renderLojaFilter(lojaFilter);
}

function renderLojaFilter(filterContainer) {
    filterContainer.innerHTML = lojas.map(l =>
        `<button class="btn btn-filter ${l.id == currentLojaId ? 'active' : ''}" data-loja-id="${l.id}">${l.nome}</button>`
    ).join('');

    filterContainer.querySelectorAll('.btn-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            filterContainer.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLojaId = parseInt(btn.dataset.lojaId);
            loadEstoque();
        });
    });
}

function renderMovimentacoesTab(tabContent) {
    tabContent.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `<h1>Movimentações</h1>`;
    tabContent.appendChild(header);

    // Filters
    const filtersDiv = document.createElement('div');
    filtersDiv.className = 'filters-row';
    filtersDiv.style.cssText = 'display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; align-items: flex-end;';
    filtersDiv.innerHTML = `
        <div class="form-group" style="margin-bottom: 0;">
            <label for="mov-filter-loja">Unidade</label>
            <select id="mov-filter-loja" class="form-control">
                <option value="">Todas</option>
                ${lojas.map(l => `<option value="${l.id}">${l.nome}</option>`).join('')}
            </select>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
            <label for="mov-filter-tipo">Tipo</label>
            <select id="mov-filter-tipo" class="form-control">
                <option value="">Todos</option>
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
                <option value="transferencia">Transferência</option>
                <option value="ajuste">Ajuste</option>
                <option value="perda">Perda</option>
                <option value="producao">Produção</option>
                <option value="venda">Venda</option>
                <option value="compra">Compra</option>
            </select>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
            <label for="mov-filter-inicio">Data Início</label>
            <input type="date" id="mov-filter-inicio" class="form-control" />
        </div>
        <div class="form-group" style="margin-bottom: 0;">
            <label for="mov-filter-fim">Data Fim</label>
            <input type="date" id="mov-filter-fim" class="form-control" />
        </div>
        <button class="btn btn-primary btn-sm" id="btn-filtrar-mov">Filtrar</button>
    `;
    tabContent.appendChild(filtersDiv);

    // Table
    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';
    tabContent.appendChild(tableContainer);

    let movTable = createTable(tableContainer, {
        columns: [
            {
                key: 'created_at',
                label: 'Data',
                sortable: true,
                render: (val) => formatDateTime(val || '')
            },
            {
                key: 'tipo',
                label: 'Tipo',
                sortable: true,
                render: (val) => `<span class="badge ${getTipoBadge(val)}">${getTipoLabel(val)}</span>`
            },
            {
                key: 'produto_nome',
                label: 'Produto',
                sortable: true,
                render: (val, row) => val || row.produto?.nome || '-'
            },
            {
                key: 'quantidade',
                label: 'Quantidade',
                sortable: true
            },
            {
                key: 'loja_nome',
                label: 'Unidade',
                sortable: true,
                render: (val, row) => val || row.loja?.nome || '-'
            },
            {
                key: 'motivo',
                label: 'Motivo',
                render: (val) => val || '-'
            }
        ],
        data: [],
        searchable: true,
        pageSize: 20
    });

    async function loadMovimentacoes() {
        const params = new URLSearchParams();
        const lojaId = filtersDiv.querySelector('#mov-filter-loja').value;
        const tipo = filtersDiv.querySelector('#mov-filter-tipo').value;
        const dataInicio = filtersDiv.querySelector('#mov-filter-inicio').value;
        const dataFim = filtersDiv.querySelector('#mov-filter-fim').value;

        if (lojaId) params.set('loja_id', lojaId);
        if (tipo) params.set('tipo', tipo);
        if (dataInicio) params.set('data_inicio', dataInicio);
        if (dataFim) params.set('data_fim', dataFim);

        try {
            const res = await api.get('/estoque/movimentacoes?' + params.toString());
            const movimentacoes = res.data || res || [];
            movTable.update(movimentacoes);
        } catch (err) {
            showToast('Erro ao carregar movimentações', 'error');
        }
    }

    filtersDiv.querySelector('#btn-filtrar-mov').addEventListener('click', loadMovimentacoes);

    loadMovimentacoes();
}

export function render(container) {
    container.innerHTML = '';

    // Tabs
    const tabs = document.createElement('div');
    tabs.className = 'tab-nav';
    tabs.innerHTML = `
        <button class="tab-btn active" data-tab="estoque">Estoque</button>
        <button class="tab-btn" data-tab="movimentacoes">Movimentações</button>
    `;
    container.appendChild(tabs);

    const tabContent = document.createElement('div');
    tabContent.className = 'tab-content';
    container.appendChild(tabContent);

    let currentTab = 'estoque';

    async function switchTab(tab) {
        currentTab = tab;
        tabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        tabs.querySelector(`[data-tab="${tab}"]`).classList.add('active');

        if (lojas.length === 0) {
            await loadLojas();
            if (lojas.length > 0 && !currentLojaId) {
                currentLojaId = getCurrentLojaId() || lojas[0].id;
            }
        }

        if (tab === 'estoque') {
            renderEstoqueTab(tabContent);
            loadEstoque();
        } else {
            renderMovimentacoesTab(tabContent);
        }
    }

    tabs.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    switchTab('estoque');
}
