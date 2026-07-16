import api from '../../api.js';
import icons from '../../icons.js';
import { formatCurrency, formatDate, formatDateTime, getUnidadeLabel } from '../../utils.js';
import { openModal, closeModal } from '../../components/modal.js';
import { createTable } from '../../components/table.js';
import { showToast } from '../../components/toast.js';

let currentTab = 'producao';

// ==================== RECEITAS ====================

async function loadReceitas(tableContainer, tableRef) {
    try {
        const res = await api.get('/producao/receitas');
        const receitas = res.data || res || [];
        if (tableRef.instance) {
            tableRef.instance.update(receitas);
        }
    } catch (err) {
        showToast('Erro ao carregar composições', 'error');
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
                    <label for="receita-nome">Nome da Composição *</label>
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
        title: isEdit ? 'Editar Composição' : 'Nova Composição',
        content,
        size: 'lg',
        confirmText: 'Salvar',
        cancelText: 'Cancelar',
        onConfirm: async () => {
            const nome = content.querySelector('#receita-nome').value.trim();
            const produto_id = parseInt(content.querySelector('#receita-produto').value);

            if (!nome) {
                showToast('Nome da composição é obrigatório', 'error');
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
                    showToast('Composição atualizada com sucesso', 'success');
                } else {
                    await api.post('/producao/receitas', data);
                    showToast('Composição criada com sucesso', 'success');
                }
                closeModal();
                if (onSaved) onSaved();
            } catch (err) {
                showToast('Erro ao salvar composição', 'error');
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
        content: `<p>Deseja realmente excluir a composição <strong>${receita.nome}</strong>?</p>`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        onConfirm: async () => {
            try {
                await api.del('/producao/receitas/' + receita.id);
                showToast('Composição excluída com sucesso', 'success');
                closeModal();
                if (onDeleted) onDeleted();
            } catch (err) {
                showToast('Erro ao excluir composição', 'error');
            }
        }
    });
}

function renderReceitasTab(tabContent) {
    tabContent.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `
        <h1>Composições</h1>
        <button class="btn btn-primary" id="btn-nova-receita">
            ${icons.plus()} Nova Composição
        </button>
    `;
    tabContent.appendChild(header);

    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';
    tabContent.appendChild(tableContainer);

    const tableRef = { instance: null };

    tableRef.instance = createTable(tableContainer, {
        columns: [
            { key: 'nome', label: 'Nome da Composição', sortable: true },
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

async function loadProdutosProducao(tableRef) {
    try {
        const res = await api.get('/producao/produtos');
        const produtos = res.data || res || [];
        if (tableRef.instance) {
            tableRef.instance.update(produtos);
        }
    } catch (err) {
        showToast('Erro ao carregar produtos de produção', 'error');
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

async function openNovaProducaoModal(onSaved, produtoInicial = null) {
    if (produtoInicial && !produtoInicial.tem_composicao) {
        showToast('Produto sem composição cadastrada', 'warning');
        return;
    }

    let produtos = [];
    let lojas = [];

    try {
        const [resProdutos, resLojas] = await Promise.all([
            api.get('/producao/produtos'),
            api.get('/lojas?situacao=ativa')
        ]);
        produtos = resProdutos.data || resProdutos || [];
        lojas = resLojas.data || resLojas || [];
    } catch {
        showToast('Erro ao carregar dados', 'error');
        return;
    }

    const produtoSelecionadoInicial = produtoInicial
        ? produtos.find(p => p.id == produtoInicial.id)
        : null;
    const produtosComComposicao = produtos.filter(p => p.tem_composicao);

    if (produtosComComposicao.length === 0) {
        showToast('Nenhum produto de produção própria possui composição cadastrada', 'warning');
        return;
    }

    const produtoOptions = produtos.map((produto) => {
        const selected = produtoSelecionadoInicial?.id == produto.id ? 'selected' : '';
        const disabled = !produto.tem_composicao ? 'disabled' : '';
        const label = `${produto.nome}${!produto.tem_composicao ? ' - sem composição' : ''}`;
        return `<option value="${produto.id}" ${selected} ${disabled}>${label}</option>`;
    }).join('');

    const content = document.createElement('div');
    content.innerHTML = `
        <form id="form-producao">
            <div class="form-group">
                <label for="prod-produto">Produto Final *</label>
                <select id="prod-produto" class="form-control" required>
                    <option value="">Selecione um produto...</option>
                    ${produtoOptions}
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

    let selectedProduto = null;
    let estoqueData = [];

    async function updateConsumo() {
        const produtoId = content.querySelector('#prod-produto').value;
        const quantidade = parseInt(content.querySelector('#prod-quantidade').value) || 0;
        const lojaId = content.querySelector('#prod-loja').value;
        const consumoContainer = content.querySelector('#prod-consumo-container');
        const tbody = content.querySelector('#prod-consumo-body');

        if (!produtoId || !quantidade || !lojaId) {
            consumoContainer.style.display = 'none';
            return;
        }

        selectedProduto = produtos.find(p => p.id == produtoId);
        if (!selectedProduto || !selectedProduto.insumos || selectedProduto.insumos.length === 0) {
            consumoContainer.style.display = 'none';
            showToast('Produto sem composição cadastrada', 'warning');
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

        tbody.innerHTML = selectedProduto.insumos.map(insumo => {
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
            const produto_id = parseInt(content.querySelector('#prod-produto').value);
            const quantidade = parseInt(content.querySelector('#prod-quantidade').value);
            const loja_id = parseInt(content.querySelector('#prod-loja').value);

            if (!produto_id) {
                showToast('Selecione o produto final', 'error');
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
            selectedProduto = produtos.find(p => p.id == produto_id);
            if (!selectedProduto?.tem_composicao || !selectedProduto.insumos?.length) {
                showToast('Produto sem composição cadastrada', 'error');
                return;
            }

            if (selectedProduto && selectedProduto.insumos) {
                const insuficiente = selectedProduto.insumos.some(insumo => {
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
                    produto_id,
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
    content.querySelector('#prod-produto').addEventListener('change', updateConsumo);
    content.querySelector('#prod-quantidade').addEventListener('input', updateConsumo);
    content.querySelector('#prod-loja').addEventListener('change', updateConsumo);

    updateConsumo();
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

    const produtosTitle = document.createElement('h2');
    produtosTitle.style.margin = '0 0 1rem';
    produtosTitle.textContent = 'Produtos de produção própria';
    tabContent.appendChild(produtosTitle);

    const produtosContainer = document.createElement('div');
    produtosContainer.className = 'table-container';
    tabContent.appendChild(produtosContainer);

    const produtosRef = { instance: null };

    produtosRef.instance = createTable(produtosContainer, {
        columns: [
            {
                key: 'codigo_interno',
                label: 'Código',
                sortable: true,
                render: (val) => val || '-'
            },
            {
                key: 'nome',
                label: 'Produto',
                sortable: true
            },
            {
                key: 'unidade',
                label: 'Unidade',
                render: (val) => getUnidadeLabel(val)
            },
            {
                key: 'tem_composicao',
                label: 'Composição',
                render: (val, row) => val
                    ? `<span class="badge badge-success">Configurada</span> <span class="text-muted">${row.insumos?.length || 0} insumo(s)</span>`
                    : '<span class="badge badge-warning">Sem composição</span>'
            },
            {
                key: 'receita_nome',
                label: 'Referência',
                render: (val, row) => row.tem_composicao ? (val || 'Composição cadastrada') : 'Configure em Produtos'
            }
        ],
        data: [],
        searchable: true,
        pageSize: 10,
        rowClass: (produto) => produto.tem_composicao ? '' : 'row-warning',
        actions: [
            {
                icon: icons.play ? icons.play() : icons.plus(),
                title: 'Produzir',
                label: 'Produzir',
                showLabel: true,
                show: (produto) => produto.tem_composicao,
                onClick: (produto) => openNovaProducaoModal(() => {
                    loadProdutosProducao(produtosRef);
                    loadOrdens(ordensContainer, ordensRef);
                }, produto)
            }
        ]
    });

    const ordensTitle = document.createElement('h2');
    ordensTitle.style.margin = '2rem 0 1rem';
    ordensTitle.textContent = 'Histórico de produção';
    tabContent.appendChild(ordensTitle);

    const ordensContainer = document.createElement('div');
    ordensContainer.className = 'table-container';
    tabContent.appendChild(ordensContainer);

    const ordensRef = { instance: null };

    ordensRef.instance = createTable(ordensContainer, {
        columns: [
            {
                key: 'created_at',
                label: 'Data',
                sortable: true,
                render: (val) => formatDateTime(val || '')
            },
            {
                key: 'receita_nome',
                label: 'Composição',
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
        openNovaProducaoModal(() => {
            loadProdutosProducao(produtosRef);
            loadOrdens(ordensContainer, ordensRef);
        });
    });

    loadProdutosProducao(produtosRef);
    loadOrdens(ordensContainer, ordensRef);
}

// ==================== MAIN RENDER ====================

export function render(container) {
    container.innerHTML = '';

    // Tabs
    const tabs = document.createElement('div');
    tabs.className = 'tab-nav';
    tabs.innerHTML = `
        <button class="tab-btn active" data-tab="producao">Produção</button>
        <button class="tab-btn" data-tab="receitas">Composições</button>
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

    switchTab(currentTab);
}
