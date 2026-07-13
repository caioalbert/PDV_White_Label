import api from '../../api.js';
import icons from '../../icons.js';
import { formatCurrency, formatDate, formatDateTime, getUnidadeLabel } from '../../utils.js';
import { openModal, closeModal } from '../../components/modal.js';
import { createTable } from '../../components/table.js';
import { showToast } from '../../components/toast.js';

let currentTab = 'receitas';

// ==================== RECEITAS ====================

async function loadReceitas(tableContainer, tableRef) {
    try {
        const res = await api.get('/producao/receitas');
        const receitas = res.data || res || [];
        if (tableRef.instance) {
            tableRef.instance.update(receitas);
        }
    } catch (err) {
        showToast('Erro ao carregar receitas', 'error');
    }
}

async function openReceitaModal(receita = null, onSaved = null) {
    const isEdit = !!receita;
    let insumos = receita?.insumos ? [...receita.insumos] : [];
    let produtosDisponiveis = [];

    try {
        const res = await api.get('/produtos?ativo=true');
        produtosDisponiveis = res.data || res || [];
    } catch {
        produtosDisponiveis = [];
    }

    const content = document.createElement('div');
    content.innerHTML = `
        <form id="form-receita">
            <div class="form-row" style="display: flex; gap: 1rem;">
                <div class="form-group" style="flex: 1;">
                    <label for="receita-nome">Nome da Receita *</label>
                    <input type="text" id="receita-nome" class="form-control" required value="${receita?.nome || ''}" />
                </div>
                <div class="form-group" style="flex: 1;">
                    <label for="receita-produto">Produto Final *</label>
                    <select id="receita-produto" class="form-control" required>
                        <option value="">Selecione...</option>
                        ${produtosDisponiveis.map(p => `<option value="${p.id}" ${receita?.produto_id == p.id ? 'selected' : ''}>${p.nome}</option>`).join('')}
                    </select>
                </div>
            </div>

            <hr style="margin: 1rem 0;" />
            <h4 style="margin-bottom: 0.5rem;">Insumos</h4>

            <div id="receita-insumos-list"></div>

            <div class="insumo-add" style="margin-top: 1rem;">
                <div style="display: flex; gap: 0.5rem; align-items: flex-end;">
                    <div class="form-group" style="flex: 2; margin-bottom: 0;">
                        <label>Produto</label>
                        <select id="receita-insumo-select" class="form-control">
                            <option value="">Selecione um insumo...</option>
                        </select>
                    </div>
                    <div class="form-group" style="flex: 1; margin-bottom: 0;">
                        <label>Quantidade</label>
                        <input type="number" id="receita-insumo-qtd" class="form-control" step="0.001" min="0.001" value="1" />
                    </div>
                    <button type="button" class="btn btn-primary btn-sm" id="btn-add-insumo-receita">
                        ${icons.plus()} Adicionar
                    </button>
                </div>
            </div>
        </form>
    `;

    function updateInsumoSelect() {
        const select = content.querySelector('#receita-insumo-select');
        const produtoFinalId = content.querySelector('#receita-produto').value;
        select.innerHTML = '<option value="">Selecione um insumo...</option>';
        produtosDisponiveis
            .filter(p => p.id != produtoFinalId && !insumos.find(i => i.produto_id == p.id))
            .forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.nome} (${getUnidadeLabel(p.unidade)})`;
                select.appendChild(opt);
            });
    }

    function renderInsumos() {
        const listEl = content.querySelector('#receita-insumos-list');
        if (insumos.length === 0) {
            listEl.innerHTML = '<p class="text-muted">Nenhum insumo adicionado.</p>';
            return;
        }

        listEl.innerHTML = `
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Insumo</th>
                        <th>Quantidade</th>
                        <th style="width: 60px;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${insumos.map((item, index) => {
                        const prod = produtosDisponiveis.find(p => p.id == item.produto_id);
                        const nome = prod ? prod.nome : (item.produto_nome || 'Produto #' + item.produto_id);
                        const unid = prod ? getUnidadeLabel(prod.unidade) : '';
                        return `
                            <tr>
                                <td>${nome} ${unid ? `<span class="text-muted">(${unid})</span>` : ''}</td>
                                <td>${item.quantidade}</td>
                                <td>
                                    <button class="btn btn-danger btn-sm btn-remove-insumo" data-index="${index}">
                                        ${icons.trash2()}
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;

        listEl.querySelectorAll('.btn-remove-insumo').forEach(btn => {
            btn.addEventListener('click', () => {
                insumos.splice(parseInt(btn.dataset.index), 1);
                renderInsumos();
                updateInsumoSelect();
            });
        });
    }

    openModal({
        title: isEdit ? 'Editar Receita' : 'Nova Receita',
        content,
        size: 'lg',
        confirmText: 'Salvar',
        cancelText: 'Cancelar',
        onConfirm: async () => {
            const nome = content.querySelector('#receita-nome').value.trim();
            const produto_id = parseInt(content.querySelector('#receita-produto').value);

            if (!nome) {
                showToast('Nome da receita é obrigatório', 'error');
                return;
            }
            if (!produto_id) {
                showToast('Selecione o produto final', 'error');
                return;
            }
            if (insumos.length === 0) {
                showToast('Adicione pelo menos um insumo', 'error');
                return;
            }

            const data = {
                nome,
                produto_id,
                insumos: insumos.map(i => ({
                    produto_id: i.produto_id,
                    quantidade: i.quantidade
                }))
            };

            try {
                if (isEdit) {
                    await api.put('/producao/receitas/' + receita.id, data);
                    showToast('Receita atualizada com sucesso', 'success');
                } else {
                    await api.post('/producao/receitas', data);
                    showToast('Receita criada com sucesso', 'success');
                }
                closeModal();
                if (onSaved) onSaved();
            } catch (err) {
                showToast('Erro ao salvar receita', 'error');
            }
        }
    });

    // Bind add insumo
    content.querySelector('#btn-add-insumo-receita').addEventListener('click', () => {
        const select = content.querySelector('#receita-insumo-select');
        const prodId = select.value;
        const qtd = parseFloat(content.querySelector('#receita-insumo-qtd').value);

        if (!prodId) {
            showToast('Selecione um insumo', 'error');
            return;
        }
        if (!qtd || qtd <= 0) {
            showToast('Informe uma quantidade válida', 'error');
            return;
        }

        const prod = produtosDisponiveis.find(p => p.id == prodId);
        insumos.push({
            produto_id: parseInt(prodId),
            produto_nome: prod?.nome || '',
            quantidade: qtd
        });

        content.querySelector('#receita-insumo-qtd').value = '1';
        renderInsumos();
        updateInsumoSelect();
    });

    // Update select when produto final changes
    content.querySelector('#receita-produto').addEventListener('change', updateInsumoSelect);

    updateInsumoSelect();
    renderInsumos();
}

async function deleteReceita(receita, onDeleted) {
    openModal({
        title: 'Confirmar Exclusão',
        content: `<p>Deseja realmente excluir a receita <strong>${receita.nome}</strong>?</p>`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        onConfirm: async () => {
            try {
                await api.del('/producao/receitas/' + receita.id);
                showToast('Receita excluída com sucesso', 'success');
                closeModal();
                if (onDeleted) onDeleted();
            } catch (err) {
                showToast('Erro ao excluir receita', 'error');
            }
        }
    });
}

function renderReceitasTab(tabContent) {
    tabContent.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `
        <h1>Receitas</h1>
        <button class="btn btn-primary" id="btn-nova-receita">
            ${icons.plus()} Nova Receita
        </button>
    `;
    tabContent.appendChild(header);

    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';
    tabContent.appendChild(tableContainer);

    const tableRef = { instance: null };

    tableRef.instance = createTable(tableContainer, {
        columns: [
            { key: 'nome', label: 'Nome da Receita', sortable: true },
            {
                key: 'produto_nome',
                label: 'Produto Final',
                sortable: true,
                render: (val, row) => val || row.produto?.nome || '-'
            },
            {
                key: 'insumos',
                label: 'Nº Insumos',
                render: (val) => (val && val.length) || 0
            },
            {
                key: 'ativo',
                label: 'Status',
                render: (val) => val !== false
                    ? '<span class="badge badge-success">Ativo</span>'
                    : '<span class="badge badge-danger">Inativo</span>'
            }
        ],
        data: [],
        searchable: true,
        pageSize: 15,
        actions: [
            {
                icon: icons.edit(),
                title: 'Editar',
                onClick: (receita) => openReceitaModal(receita, () => loadReceitas(tableContainer, tableRef))
            },
            {
                icon: icons.eye(),
                title: 'Ver Insumos',
                onClick: (receita) => openVerInsumosModal(receita)
            },
            {
                icon: icons.trash2(),
                title: 'Excluir',
                onClick: (receita) => deleteReceita(receita, () => loadReceitas(tableContainer, tableRef))
            }
        ]
    });

    header.querySelector('#btn-nova-receita').addEventListener('click', () => {
        openReceitaModal(null, () => loadReceitas(tableContainer, tableRef));
    });

    loadReceitas(tableContainer, tableRef);
}

function openVerInsumosModal(receita) {
    const insumos = receita.insumos || [];
    const content = document.createElement('div');
    content.innerHTML = `
        <div>
            <p><strong>Produto Final:</strong> ${receita.produto_nome || receita.produto?.nome || '-'}</p>
            ${insumos.length === 0 ? '<p class="text-muted">Nenhum insumo cadastrado.</p>' : `
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Insumo</th>
                            <th>Quantidade</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${insumos.map(i => `
                            <tr>
                                <td>${i.produto_nome || i.produto?.nome || '-'}</td>
                                <td>${i.quantidade}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}
        </div>
    `;

    openModal({
        title: 'Insumos - ' + receita.nome,
        content,
        hideFooter: true
    });
}

// ==================== PRODUÇÃO ====================

async function loadOrdens(tableContainer, tableRef) {
    try {
        const res = await api.get('/producao/ordens');
        const ordens = res.data || res || [];
        if (tableRef.instance) {
            tableRef.instance.update(ordens);
        }
    } catch (err) {
        showToast('Erro ao carregar ordens de produção', 'error');
    }
}

function getOrdemStatusBadge(status) {
    const map = {
        concluido: 'badge-success',
        concluida: 'badge-success',
        pendente: 'badge-warning',
        cancelado: 'badge-danger',
        cancelada: 'badge-danger',
        em_producao: 'badge-info'
    };
    return map[status] || 'badge-secondary';
}

function getOrdemStatusLabel(status) {
    const map = {
        concluido: 'Concluído',
        concluida: 'Concluída',
        pendente: 'Pendente',
        cancelado: 'Cancelado',
        cancelada: 'Cancelada',
        em_producao: 'Em Produção'
    };
    return map[status] || status;
}

async function openNovaProducaoModal(onSaved) {
    let receitas = [];
    let lojas = [];

    try {
        const [resReceitas, resLojas] = await Promise.all([
            api.get('/producao/receitas'),
            api.get('/lojas?situacao=ativa')
        ]);
        receitas = resReceitas.data || resReceitas || [];
        lojas = resLojas.data || resLojas || [];
    } catch {
        showToast('Erro ao carregar dados', 'error');
        return;
    }

    const content = document.createElement('div');
    content.innerHTML = `
        <form id="form-producao">
            <div class="form-group">
                <label for="prod-receita">Receita *</label>
                <select id="prod-receita" class="form-control" required>
                    <option value="">Selecione uma receita...</option>
                    ${receitas.map(r => `<option value="${r.id}">${r.nome}</option>`).join('')}
                </select>
            </div>
            <div class="form-row" style="display: flex; gap: 1rem;">
                <div class="form-group" style="flex: 1;">
                    <label for="prod-quantidade">Quantidade a Produzir *</label>
                    <input type="number" id="prod-quantidade" class="form-control" min="1" step="1" value="1" required />
                </div>
                <div class="form-group" style="flex: 1;">
                    <label for="prod-loja">Unidade de Produção *</label>
                    <select id="prod-loja" class="form-control" required>
                        <option value="">Selecione...</option>
                        ${lojas.map(l => `<option value="${l.id}">${l.nome}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div id="prod-consumo-container" style="margin-top: 1rem; display: none;">
                <h4>Consumo Estimado de Insumos</h4>
                <table class="table table-sm" id="prod-consumo-table">
                    <thead>
                        <tr>
                            <th>Insumo</th>
                            <th>Qtd/Unidade</th>
                            <th>Qtd Necessária</th>
                            <th>Estoque Atual</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="prod-consumo-body"></tbody>
                </table>
            </div>
        </form>
    `;

    let selectedReceita = null;
    let estoqueData = [];

    async function updateConsumo() {
        const receitaId = content.querySelector('#prod-receita').value;
        const quantidade = parseInt(content.querySelector('#prod-quantidade').value) || 0;
        const lojaId = content.querySelector('#prod-loja').value;
        const consumoContainer = content.querySelector('#prod-consumo-container');
        const tbody = content.querySelector('#prod-consumo-body');

        if (!receitaId || !quantidade || !lojaId) {
            consumoContainer.style.display = 'none';
            return;
        }

        selectedReceita = receitas.find(r => r.id == receitaId);
        if (!selectedReceita || !selectedReceita.insumos || selectedReceita.insumos.length === 0) {
            consumoContainer.style.display = 'none';
            return;
        }

        // Fetch estoque for loja
        try {
            const res = await api.get('/estoque?loja_id=' + lojaId);
            estoqueData = res.data || res || [];
        } catch {
            estoqueData = [];
        }

        consumoContainer.style.display = 'block';

        tbody.innerHTML = selectedReceita.insumos.map(insumo => {
            const qtdNecessaria = insumo.quantidade * quantidade;
            const estoqueItem = estoqueData.find(e =>
                (e.produto_id || e.produto?.id) == insumo.produto_id
            );
            const estoqueAtual = estoqueItem?.quantidade || 0;
            const suficiente = estoqueAtual >= qtdNecessaria;

            return `
                <tr class="${suficiente ? '' : 'row-danger'}">
                    <td>${insumo.produto_nome || insumo.produto?.nome || '-'}</td>
                    <td>${insumo.quantidade}</td>
                    <td>${qtdNecessaria}</td>
                    <td>${estoqueAtual}</td>
                    <td>
                        ${suficiente
                            ? '<span class="badge badge-success">OK</span>'
                            : '<span class="badge badge-danger">Insuficiente</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    }

    openModal({
        title: 'Nova Produção',
        content,
        size: 'lg',
        confirmText: 'Produzir',
        cancelText: 'Cancelar',
        onConfirm: async () => {
            const receita_id = parseInt(content.querySelector('#prod-receita').value);
            const quantidade = parseInt(content.querySelector('#prod-quantidade').value);
            const loja_id = parseInt(content.querySelector('#prod-loja').value);

            if (!receita_id) {
                showToast('Selecione uma receita', 'error');
                return;
            }
            if (!quantidade || quantidade <= 0) {
                showToast('Informe a quantidade a produzir', 'error');
                return;
            }
            if (!loja_id) {
                showToast('Selecione a unidade de produção', 'error');
                return;
            }

            // Check stock sufficiency
            if (selectedReceita && selectedReceita.insumos) {
                const insuficiente = selectedReceita.insumos.some(insumo => {
                    const qtdNecessaria = insumo.quantidade * quantidade;
                    const estoqueItem = estoqueData.find(e =>
                        (e.produto_id || e.produto?.id) == insumo.produto_id
                    );
                    const estoqueAtual = estoqueItem?.quantidade || 0;
                    return estoqueAtual < qtdNecessaria;
                });

                if (insuficiente) {
                    showToast('Estoque insuficiente para um ou mais insumos', 'error');
                    return;
                }
            }

            try {
                await api.post('/producao/produzir', {
                    receita_id,
                    quantidade,
                    loja_id
                });
                showToast('Produção registrada com sucesso', 'success');
                closeModal();
                if (onSaved) onSaved();
            } catch (err) {
                showToast('Erro ao registrar produção', 'error');
            }
        }
    });

    // Bind change events
    content.querySelector('#prod-receita').addEventListener('change', updateConsumo);
    content.querySelector('#prod-quantidade').addEventListener('input', updateConsumo);
    content.querySelector('#prod-loja').addEventListener('change', updateConsumo);
}

function renderProducaoTab(tabContent) {
    tabContent.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `
        <h1>Produção</h1>
        <button class="btn btn-primary" id="btn-nova-producao">
            ${icons.plus()} Nova Produção
        </button>
    `;
    tabContent.appendChild(header);

    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';
    tabContent.appendChild(tableContainer);

    const tableRef = { instance: null };

    tableRef.instance = createTable(tableContainer, {
        columns: [
            {
                key: 'created_at',
                label: 'Data',
                sortable: true,
                render: (val) => formatDateTime(val || '')
            },
            {
                key: 'receita_nome',
                label: 'Receita',
                sortable: true,
                render: (val, row) => val || row.receita?.nome || '-'
            },
            {
                key: 'produto_nome',
                label: 'Produto',
                sortable: true,
                render: (val, row) => val || row.produto?.nome || '-'
            },
            {
                key: 'quantidade_produzida',
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
                key: 'status',
                label: 'Status',
                render: (val) => `<span class="badge ${getOrdemStatusBadge(val)}">${getOrdemStatusLabel(val)}</span>`
            }
        ],
        data: [],
        searchable: true,
        pageSize: 15
    });

    header.querySelector('#btn-nova-producao').addEventListener('click', () => {
        openNovaProducaoModal(() => loadOrdens(tableContainer, tableRef));
    });

    loadOrdens(tableContainer, tableRef);
}

// ==================== MAIN RENDER ====================

export function render(container) {
    container.innerHTML = '';

    // Tabs
    const tabs = document.createElement('div');
    tabs.className = 'tab-nav';
    tabs.innerHTML = `
        <button class="tab-btn active" data-tab="receitas">Receitas</button>
        <button class="tab-btn" data-tab="producao">Produção</button>
    `;
    container.appendChild(tabs);

    const tabContent = document.createElement('div');
    tabContent.className = 'tab-content';
    container.appendChild(tabContent);

    function switchTab(tab) {
        currentTab = tab;
        tabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        tabs.querySelector(`[data-tab="${tab}"]`).classList.add('active');

        if (tab === 'receitas') {
            renderReceitasTab(tabContent);
        } else {
            renderProducaoTab(tabContent);
        }
    }

    tabs.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    switchTab('receitas');
}
