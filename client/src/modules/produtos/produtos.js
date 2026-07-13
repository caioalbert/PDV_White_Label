import api from '../../api.js';
import icons from '../../icons.js';
import { formatCurrency, getCategoriaLabel, getUnidadeLabel } from '../../utils.js';
import { openModal, closeModal } from '../../components/modal.js';
import { createTable } from '../../components/table.js';
import { showToast } from '../../components/toast.js';

let tableInstance = null;
let currentCategoria = '';
let allProdutos = [];

async function loadProdutos() {
    try {
        const params = new URLSearchParams();
        if (currentCategoria) params.set('categoria', currentCategoria);
        const res = await api.get('/produtos?' + params.toString());
        allProdutos = res.data || res;
        if (tableInstance) {
            tableInstance.update(allProdutos);
        }
    } catch (err) {
        showToast('Erro ao carregar produtos', 'error');
    }
}

function openProdutoModal(produto = null) {
    const isEdit = !!produto;

    const content = document.createElement('div');
    content.innerHTML = `
        <form id="form-produto" class="form-grid">
            <div class="form-group">
                <label for="prod-nome">Nome *</label>
                <input type="text" id="prod-nome" class="form-control" required value="${produto?.nome || ''}" />
            </div>
            <div class="form-group">
                <label for="prod-categoria">Categoria</label>
                <select id="prod-categoria" class="form-control">
                    <option value="gesso_convencional" ${produto?.categoria === 'gesso_convencional' ? 'selected' : ''}>Gesso Convencional</option>
                    <option value="drywall" ${produto?.categoria === 'drywall' ? 'selected' : ''}>Drywall</option>
                    <option value="producao_propria" ${produto?.categoria === 'producao_propria' ? 'selected' : ''}>Produção Própria</option>
                </select>
            </div>
            <div class="form-group">
                <label>Código interno</label>
                ${isEdit ? `
                    <div class="product-system-code">
                        <code>${produto.codigo_interno}</code>
                        <span>Identificador global gerado pelo sistema</span>
                    </div>
                ` : `
                    <div class="product-system-code pending">
                        <span>Será gerado automaticamente após salvar</span>
                    </div>
                `}
            </div>
            <div class="form-group">
                <label for="prod-codigo-barras">Código de barras</label>
                <input type="text" id="prod-codigo-barras" class="form-control"
                    inputmode="numeric" value="${produto?.codigo_barras || ''}" />
            </div>
            <div class="form-group">
                <label for="prod-unidade">Unidade</label>
                <select id="prod-unidade" class="form-control">
                    <option value="unidade" ${produto?.unidade === 'unidade' ? 'selected' : ''}>Unidade</option>
                    <option value="saco" ${produto?.unidade === 'saco' ? 'selected' : ''}>Saco</option>
                    <option value="pacote" ${produto?.unidade === 'pacote' ? 'selected' : ''}>Pacote</option>
                    <option value="balde" ${produto?.unidade === 'balde' ? 'selected' : ''}>Balde</option>
                    <option value="kg" ${produto?.unidade === 'kg' ? 'selected' : ''}>Kg</option>
                    <option value="caixa" ${produto?.unidade === 'caixa' ? 'selected' : ''}>Caixa</option>
                    <option value="barra" ${produto?.unidade === 'barra' ? 'selected' : ''}>Barra</option>
                    <option value="rolo" ${produto?.unidade === 'rolo' ? 'selected' : ''}>Rolo</option>
                    <option value="chapa" ${produto?.unidade === 'chapa' ? 'selected' : ''}>Chapa</option>
                    <option value="metro" ${produto?.unidade === 'metro' ? 'selected' : ''}>Metro</option>
                </select>
            </div>
            <div class="form-group">
                <label for="prod-preco">Preço Venda (R$)</label>
                <input type="number" id="prod-preco" class="form-control" step="0.01" min="0" value="${produto?.preco_venda || ''}" />
            </div>
            <div class="form-group">
                <label for="prod-estoque-min">Estoque Mínimo</label>
                <input type="number" id="prod-estoque-min" class="form-control" min="0" value="${produto?.estoque_minimo || 0}" />
            </div>
            <div class="form-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="prod-ativo" ${produto?.ativo !== false ? 'checked' : ''} />
                    Ativo
                </label>
            </div>
            <div class="product-composition-entry" id="product-composition-entry">
                <div class="product-composition-entry-icon">${icons.layers()}</div>
                <div class="product-composition-entry-copy">
                    <div class="product-composition-entry-title">
                        <strong>Composição do produto</strong>
                        ${isEdit
                            ? `<span class="badge ${produto.tem_composicao ? 'badge-success' : 'badge-warning'}">
                                ${produto.tem_composicao ? 'Configurada' : 'Pendente'}
                               </span>`
                            : '<span class="badge badge-warning">Próxima etapa</span>'}
                    </div>
                    <span>
                        ${isEdit
                            ? 'Defina os itens do estoque consumidos para fabricar uma unidade.'
                            : 'Depois de salvar, informe os itens consumidos para fabricar uma unidade.'}
                    </span>
                </div>
                ${isEdit ? `
                    <button type="button" class="btn btn-secondary" id="btn-configurar-composicao">
                        ${icons.layers()} Salvar e configurar
                    </button>
                ` : ''}
            </div>
        </form>
    `;

    const categoriaInput = content.querySelector('#prod-categoria');
    const composicaoEntry = content.querySelector('#product-composition-entry');

    const updateComposicaoVisibility = () => {
        composicaoEntry.hidden = categoriaInput.value !== 'producao_propria';
    };

    const getFormData = () => ({
        nome: content.querySelector('#prod-nome').value.trim(),
        categoria: categoriaInput.value,
        unidade: content.querySelector('#prod-unidade').value,
        codigo_barras: content.querySelector('#prod-codigo-barras').value.trim(),
        preco_venda: parseFloat(content.querySelector('#prod-preco').value) || 0,
        estoque_minimo: parseInt(content.querySelector('#prod-estoque-min').value) || 0,
        ativo: content.querySelector('#prod-ativo').checked
    });

    openModal({
        title: isEdit ? 'Editar Produto' : 'Novo Produto',
        content,
        confirmText: 'Salvar',
        cancelText: 'Cancelar',
        onConfirm: async () => {
            const data = getFormData();
            if (!data.nome) {
                showToast('Nome é obrigatório', 'error');
                return;
            }

            try {
                let produtoSalvo;
                if (isEdit) {
                    produtoSalvo = await api.put('/produtos/' + produto.id, data);
                    showToast('Produto atualizado com sucesso', 'success');
                } else {
                    produtoSalvo = await api.post('/produtos', data);
                    showToast('Produto criado com sucesso', 'success');
                }
                closeModal();
                await loadProdutos();

                if (!isEdit && produtoSalvo.categoria === 'producao_propria') {
                    produtoSalvo.tem_composicao = false;
                    setTimeout(() => openComposicaoModal(produtoSalvo), 300);
                }
            } catch (err) {
                showToast(err.message || 'Erro ao salvar produto', 'error');
            }
        }
    });

    categoriaInput.addEventListener('change', updateComposicaoVisibility);
    updateComposicaoVisibility();

    content.querySelector('#btn-configurar-composicao')?.addEventListener('click', async () => {
        const data = getFormData();
        if (!data.nome) {
            showToast('Nome é obrigatório', 'error');
            return;
        }

        try {
            const produtoAtualizado = await api.put('/produtos/' + produto.id, data);
            produtoAtualizado.tem_composicao = produto.tem_composicao;
            showToast('Produto atualizado com sucesso', 'success');
            closeModal();
            await loadProdutos();
            setTimeout(() => openComposicaoModal(produtoAtualizado), 300);
        } catch (err) {
            showToast(err.message || 'Erro ao salvar produto', 'error');
        }
    });
}

async function openComposicaoModal(produto) {
    const content = document.createElement('div');
    content.innerHTML = `
        <div class="composicao-container">
            <div class="composicao-header">
                <h4>Composição de: ${produto.nome}</h4>
                <p class="text-muted">
                    Informe o consumo necessário para fabricar
                    <strong>1 ${getUnidadeLabel(produto.unidade).toLowerCase()}</strong> deste produto.
                </p>
            </div>
            <div class="composicao-list" id="composicao-list">
                <p class="text-muted">Carregando...</p>
            </div>
            <div class="composicao-add" style="margin-top: 1rem;">
                <div class="composition-add-row">
                    <div class="form-group">
                        <label>Insumo</label>
                        <select id="comp-produto-select" class="form-control">
                            <option value="">Selecione um insumo...</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Consumo por unidade</label>
                        <input type="number" id="comp-quantidade" class="form-control" step="0.001" min="0.001" value="1" />
                    </div>
                    <button type="button" class="btn btn-primary btn-sm" id="btn-add-insumo">
                        ${icons.plus()} Adicionar
                    </button>
                </div>
            </div>
        </div>
    `;

    let composicao = [];

    try {
        const res = await api.get('/produtos/' + produto.id + '/composicao');
        composicao = res.data || res || [];
    } catch {
        composicao = [];
    }

    let produtosDisponiveis = [];
    try {
        const res = await api.get('/produtos?ativo=true');
        produtosDisponiveis = (res.data || res || []).filter(p => p.id !== produto.id);
    } catch {
        produtosDisponiveis = [];
    }

    openModal({
        title: 'Composição do Produto',
        content,
        size: 'lg',
        confirmText: 'Salvar Composição',
        cancelText: 'Cancelar',
        onConfirm: async () => {
            try {
                await api.put('/produtos/' + produto.id + '/composicao', { insumos: composicao });
                showToast('Composição salva com sucesso', 'success');
                closeModal();
                await loadProdutos();
            } catch (err) {
                showToast(err.message || 'Erro ao salvar composição', 'error');
            }
        }
    });

    const select = content.querySelector('#comp-produto-select');
    produtosDisponiveis.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.nome} (${getUnidadeLabel(p.unidade)})`;
        select.appendChild(opt);
    });

    function renderComposicao() {
        const listEl = content.querySelector('#composicao-list');
        if (composicao.length === 0) {
            listEl.innerHTML = `
                <div class="composition-empty">
                    ${icons.layers()}
                    <strong>Nenhum insumo adicionado</strong>
                    <span>Adicione os produtos do estoque que compõem uma unidade do produto final.</span>
                </div>
            `;
            return;
        }
        listEl.innerHTML = `
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Insumo</th>
                        <th>Consumo por unidade</th>
                        <th>Unidade</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${composicao.map((item, index) => {
                        const prod = produtosDisponiveis.find(p => p.id === item.produto_id);
                        const nome = prod ? prod.nome : (item.produto_nome || 'Produto #' + item.produto_id);
                        const unidade = prod?.unidade || item.unidade;
                        return `
                            <tr>
                                <td>${nome}</td>
                                <td>${item.quantidade}</td>
                                <td>${getUnidadeLabel(unidade)}</td>
                                <td>
                                    <button class="btn-icon danger btn-remove-insumo" data-index="${index}"
                                        title="Remover insumo" aria-label="Remover insumo">
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
                const idx = parseInt(btn.dataset.index);
                composicao.splice(idx, 1);
                renderComposicao();
            });
        });
    }

    renderComposicao();

    content.querySelector('#btn-add-insumo').addEventListener('click', () => {
        const prodId = select.value;
        const qtd = parseFloat(content.querySelector('#comp-quantidade').value);

        if (!prodId) {
            showToast('Selecione um insumo', 'error');
            return;
        }
        if (!qtd || qtd <= 0) {
            showToast('Informe uma quantidade válida', 'error');
            return;
        }

        const existing = composicao.find(c => c.produto_id == prodId);
        if (existing) {
            showToast('Insumo já adicionado. Remova e adicione novamente.', 'error');
            return;
        }

        const prod = produtosDisponiveis.find(p => p.id == prodId);
        composicao.push({
            produto_id: parseInt(prodId),
            produto_nome: prod?.nome || '',
            quantidade: qtd
        });

        select.value = '';
        content.querySelector('#comp-quantidade').value = '1';
        renderComposicao();
    });
}

async function deleteProduto(produto) {
    openModal({
        title: 'Confirmar Exclusão',
        content: `<p>Deseja realmente excluir o produto <strong>${produto.nome}</strong>?</p>`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        onConfirm: async () => {
            try {
                await api.del('/produtos/' + produto.id);
                showToast('Produto excluído com sucesso', 'success');
                closeModal();
                loadProdutos();
            } catch (err) {
                showToast('Erro ao excluir produto', 'error');
            }
        }
    });
}

function getCategoriaBadge(categoria) {
    const map = {
        gesso_convencional: 'badge-info',
        drywall: 'badge-success',
        producao_propria: 'badge-warning'
    };
    return map[categoria] || 'badge-secondary';
}

export function render(container) {
    container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `
        <h1>Produtos</h1>
        <button class="btn btn-primary" id="btn-novo-produto">
            ${icons.plus()} Novo Produto
        </button>
    `;
    container.appendChild(header);

    // Category filter tabs
    const filters = document.createElement('div');
    filters.className = 'filter-tabs';
    filters.innerHTML = `
        <button class="btn btn-filter active" data-categoria="">Todos</button>
        <button class="btn btn-filter" data-categoria="gesso_convencional">Gesso Convencional</button>
        <button class="btn btn-filter" data-categoria="drywall">Drywall</button>
        <button class="btn btn-filter" data-categoria="producao_propria">Produção Própria</button>
    `;
    container.appendChild(filters);

    // Table container
    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';
    container.appendChild(tableContainer);

    tableInstance = createTable(tableContainer, {
        columns: [
            { key: 'codigo_interno', label: 'Código', sortable: true },
            { key: 'nome', label: 'Nome', sortable: true },
            {
                key: 'categoria',
                label: 'Categoria',
                sortable: true,
                render: (val) => `<span class="badge ${getCategoriaBadge(val)}">${getCategoriaLabel(val)}</span>`
            },
            {
                key: 'unidade',
                label: 'Unidade',
                render: (val) => getUnidadeLabel(val)
            },
            {
                key: 'preco_venda',
                label: 'Preço Venda',
                sortable: true,
                render: (val) => parseFloat(val || 0) > 0
                    ? formatCurrency(val)
                    : '<span class="badge badge-warning">Sem preço</span>'
            },
            {
                key: 'estoque_minimo',
                label: 'Est. Mínimo',
                sortable: true
            },
            {
                key: 'tem_composicao',
                label: 'Composição',
                sortable: false,
                render: (val, produto) => {
                    if (produto.categoria !== 'producao_propria') return '—';
                    return val
                        ? '<span class="badge badge-success">Configurada</span>'
                        : '<span class="badge badge-warning">Pendente</span>';
                }
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
                onClick: (produto) => openProdutoModal(produto)
            },
            {
                icon: icons.layers(),
                title: 'Configurar composição',
                onClick: (produto) => openComposicaoModal(produto),
                show: (produto) => produto.categoria === 'producao_propria'
            },
            {
                icon: icons.trash2(),
                title: 'Excluir',
                onClick: (produto) => deleteProduto(produto)
            }
        ]
    });

    // Event: new product
    header.querySelector('#btn-novo-produto').addEventListener('click', () => {
        openProdutoModal();
    });

    // Event: category filter
    filters.querySelectorAll('.btn-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            filters.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategoria = btn.dataset.categoria;
            loadProdutos();
        });
    });

    // Initial load
    currentCategoria = '';
    loadProdutos();
}
