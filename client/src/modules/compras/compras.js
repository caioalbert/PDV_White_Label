import api from '../../api.js';
import icons from '../../icons.js';
import {
    DEFAULT_PRODUCT_CATEGORIES,
    loadProductCategories,
    renderCategoryOptions,
} from '../../productCategories.js';
import {
    escapeHtml,
    formatCurrency,
    formatDate,
    getUnidadeLabel
} from '../../utils.js';
import { openModal, closeModal } from '../../components/modal.js';
import { createTable } from '../../components/table.js';
import { showToast } from '../../components/toast.js';

let tableInstance = null;
let currentTab = 'compras';

function formatQuantity(value, maximumFractionDigits = 3) {
    return (parseFloat(value) || 0).toLocaleString('pt-BR', {
        maximumFractionDigits
    });
}

function defaultConversionFactor(produto) {
    return produto.unidade === 'kg' ? 1000 : '';
}

function purchaseUnitLabel(unidade) {
    return unidade === 'tonelada' ? 't' : getUnidadeLabel(unidade);
}

async function loadCompras() {
    try {
        const res = await api.get('/compras');
        const compras = res.data || res || [];
        if (tableInstance) {
            tableInstance.update(compras);
        }
    } catch (err) {
        showToast('Erro ao carregar compras', 'error');
    }
}

function getStatusBadge(status) {
    const map = {
        pendente: 'badge-warning',
        recebido_parcial: 'badge-info',
        recebido: 'badge-success'
    };
    return map[status] || 'badge-secondary';
}

function getStatusLabel(status) {
    const map = {
        pendente: 'Pendente',
        recebido_parcial: 'Recebido Parcial',
        recebido: 'Recebido'
    };
    return map[status] || status;
}

async function openNovaCompraModal(compraParaEditar = null) {
    let fornecedores = [];
    let lojas = [];
    let produtosDisponiveis = [];
    let categoriasProduto = [...DEFAULT_PRODUCT_CATEGORIES];
    let itensCompra = [];
    let compraEdicao = null;
    const isEdicao = Boolean(compraParaEditar?.id);

    try {
        const [resFornecedores, resLojas, resProdutos, resCategorias] = await Promise.all([
            api.get('/fornecedores'),
            api.get('/lojas?situacao=ativa'),
            api.get('/produtos?ativo=true'),
            loadProductCategories()
        ]);
        fornecedores = resFornecedores.data || resFornecedores || [];
        lojas = resLojas.data || resLojas || [];
        produtosDisponiveis = resProdutos.data || resProdutos || [];
        categoriasProduto = resCategorias;
        if (isEdicao) {
            const resCompra = await api.get('/compras/' + compraParaEditar.id);
            compraEdicao = resCompra.data || resCompra;
            if (compraEdicao.status !== 'pendente') {
                showToast('Só é possível editar compras pendentes', 'warning');
                return;
            }
            itensCompra = (compraEdicao.itens || []).map((item) => ({
                produto_id: item.produto_id,
                nome: item.produto_nome || item.produto?.nome || `Produto #${item.produto_id}`,
                unidade: item.unidade,
                quantidade: parseFloat(item.quantidade_comprada) || 0,
                preco_unitario: parseFloat(item.preco_unitario) || 0,
                fator_conversao_estoque: parseFloat(item.fator_conversao_estoque) || defaultConversionFactor(item)
            }));
        }
    } catch (err) {
        showToast('Erro ao carregar dados', 'error');
        return;
    }

    const content = document.createElement('div');
    content.innerHTML = `
        <form id="form-compra">
            <div class="form-row">
                <div class="form-group" style="flex: 1;">
                    <label for="compra-fornecedor">Fornecedor *</label>
                    <select id="compra-fornecedor" class="form-control" required>
                        <option value="">Selecione...</option>
                        ${fornecedores.map(f =>
                            `<option value="${f.id}">${escapeHtml(f.nome)}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group" style="flex: 1;">
                    <label for="compra-loja">Unidade de Destino *</label>
                    <select id="compra-loja" class="form-control" required>
                        <option value="">Selecione...</option>
                        ${lojas.map(l => `
                            <option value="${l.id}">
                                ${escapeHtml(l.nome)}${l.tipo === 'galpao_fabrica' ? ' - Galpão/Fábrica' : ''}
                            </option>
                        `).join('')}
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label>Buscar Produto</label>
                <div class="search-produtos-wrapper" style="position: relative;">
                    <input type="text" id="compra-busca-produto" class="form-control"
                        placeholder="Buscar por nome, código ou código de barras" autocomplete="off" />
                    <div id="compra-busca-results" class="purchase-product-results" hidden></div>
                </div>
            </div>

            <section class="purchase-quick-product" id="compra-cadastro-produto" hidden>
                <div class="purchase-quick-product-header">
                    <div>
                        <strong>Cadastrar novo produto</strong>
                        <span>O produto ficará disponível para todas as unidades.</span>
                    </div>
                    <button type="button" class="btn-icon" id="btn-cancelar-produto"
                        title="Fechar cadastro" aria-label="Fechar cadastro">
                        ${icons.x()}
                    </button>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="novo-produto-nome">Nome *</label>
                        <input type="text" id="novo-produto-nome" class="form-control">
                    </div>
                    <div class="form-group">
                        <label for="novo-produto-categoria">Categoria *</label>
                        <select id="novo-produto-categoria" class="form-control">
                            ${renderCategoryOptions(categoriasProduto, categoriasProduto[0]?.slug || '')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="novo-produto-unidade">Unidade de estoque *</label>
                        <select id="novo-produto-unidade" class="form-control">
                            <option value="kg">Kg</option>
                            <option value="saco">Saco</option>
                            <option value="pacote">Pacote</option>
                            <option value="balde">Balde</option>
                            <option value="unidade">Unidade</option>
                            <option value="caixa">Caixa</option>
                            <option value="barra">Barra</option>
                            <option value="rolo">Rolo</option>
                            <option value="chapa">Chapa</option>
                            <option value="metro">Metro</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="novo-produto-codigo-barras">Código de barras</label>
                        <input type="text" id="novo-produto-codigo-barras" class="form-control"
                            inputmode="numeric">
                    </div>
                    <div class="form-group">
                        <label for="novo-produto-preco">Preço de venda (R$)</label>
                        <input type="number" id="novo-produto-preco" class="form-control"
                            min="0" step="0.01" value="0">
                    </div>
                    <div class="form-group">
                        <label for="novo-produto-estoque-minimo">Estoque mínimo</label>
                        <input type="number" id="novo-produto-estoque-minimo" class="form-control"
                            min="0" step="0.001" value="0">
                    </div>
                </div>
                <div class="purchase-quick-product-actions">
                    <button type="button" class="btn btn-secondary" id="btn-cancelar-produto-rodape">
                        Cancelar
                    </button>
                    <button type="button" class="btn btn-primary" id="btn-salvar-produto">
                        ${icons.plus()} Cadastrar e adicionar
                    </button>
                </div>
            </section>

            <div id="compra-itens-container">
                <table class="table table-sm" id="compra-itens-table" style="display: none;">
                    <thead>
                        <tr>
                            <th>Produto</th>
                            <th style="width: 110px;">Toneladas</th>
                            <th style="width: 180px;">Conversão p/ estoque</th>
                            <th style="width: 140px;">Preço / t</th>
                            <th style="width: 120px;">Subtotal</th>
                            <th style="width: 60px;">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="compra-itens-body"></tbody>
                    <tfoot>
                        <tr>
                            <td colspan="4" style="text-align: right;"><strong>Total:</strong></td>
                            <td><strong id="compra-total">R$ 0,00</strong></td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
                <p class="text-muted" id="compra-sem-itens">Nenhum produto adicionado.</p>
            </div>

            <div class="form-group" style="margin-top: 1rem;">
                <label for="compra-obs">Observações</label>
                <textarea id="compra-obs" class="form-control" rows="2"></textarea>
            </div>
        </form>
    `;
    if (compraEdicao) {
        content.querySelector('#compra-fornecedor').value = compraEdicao.fornecedor_id || '';
        content.querySelector('#compra-loja').value = compraEdicao.loja_id || '';
        content.querySelector('#compra-obs').value = compraEdicao.observacoes || '';
    }

    function renderItens() {
        const tbody = content.querySelector('#compra-itens-body');
        const table = content.querySelector('#compra-itens-table');
        const semItens = content.querySelector('#compra-sem-itens');

        if (itensCompra.length === 0) {
            table.style.display = 'none';
            semItens.style.display = 'block';
        } else {
            table.style.display = '';
            semItens.style.display = 'none';
        }

        tbody.innerHTML = itensCompra.map((item, index) => `
            <tr>
                <td>${escapeHtml(item.nome)}</td>
                <td>
                    <input type="number" class="form-control form-control-sm item-qtd" data-index="${index}" min="0.001" step="0.001" value="${item.quantidade}" />
                </td>
                <td>
                    <div class="purchase-conversion-field">
                        <span>1 t =</span>
                        <input
                            type="number"
                            class="form-control form-control-sm item-conversao"
                            data-index="${index}"
                            min="0.001"
                            step="0.001"
                            value="${item.fator_conversao_estoque}"
                            placeholder="Ex.: 40"
                        />
                        <span>${getUnidadeLabel(item.unidade)}</span>
                    </div>
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm item-preco" data-index="${index}" step="0.01" min="0" value="${item.preco_unitario}" />
                </td>
                <td>${formatCurrency(item.quantidade * item.preco_unitario)}</td>
                <td>
                    <button type="button" class="btn btn-danger btn-sm btn-remove-item" data-index="${index}">
                        ${icons.trash2()}
                    </button>
                </td>
            </tr>
        `).join('');

        const total = itensCompra.reduce((sum, item) => sum + (item.quantidade * item.preco_unitario), 0);
        content.querySelector('#compra-total').textContent = formatCurrency(total);

        // Bind events
        tbody.querySelectorAll('.item-qtd').forEach(input => {
            input.addEventListener('change', () => {
                const idx = parseInt(input.dataset.index);
                itensCompra[idx].quantidade = parseFloat(input.value) || 0;
                renderItens();
            });
        });

        tbody.querySelectorAll('.item-conversao').forEach(input => {
            input.addEventListener('change', () => {
                const idx = parseInt(input.dataset.index);
                itensCompra[idx].fator_conversao_estoque = parseFloat(input.value) || '';
                renderItens();
            });
        });

        tbody.querySelectorAll('.item-preco').forEach(input => {
            input.addEventListener('change', () => {
                const idx = parseInt(input.dataset.index);
                itensCompra[idx].preco_unitario = parseFloat(input.value) || 0;
                renderItens();
            });
        });

        tbody.querySelectorAll('.btn-remove-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                itensCompra.splice(idx, 1);
                renderItens();
            });
        });
    }

    // Product search
    const searchInput = content.querySelector('#compra-busca-produto');
    const resultsDiv = content.querySelector('#compra-busca-results');
    const quickProduct = content.querySelector('#compra-cadastro-produto');
    let searchTimeout = null;

    function normalizeSearch(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function addProdutoCompra(produto) {
        if (itensCompra.some((item) => item.produto_id === produto.id)) {
            showToast('Produto já adicionado à compra', 'info');
            return;
        }

        itensCompra.push({
            produto_id: produto.id,
            nome: produto.nome,
            unidade: produto.unidade,
            quantidade: 1,
            preco_unitario: 0,
            fator_conversao_estoque: defaultConversionFactor(produto)
        });
        renderItens();
        searchInput.value = '';
        resultsDiv.hidden = true;
    }

    function openQuickProduct(nomeSugerido) {
        quickProduct.hidden = false;
        resultsDiv.hidden = true;
        content.querySelector('#novo-produto-nome').value = nomeSugerido.trim();
        content.querySelector('#novo-produto-nome').focus();
    }

    function closeQuickProduct() {
        quickProduct.hidden = true;
    }

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const rawQuery = searchInput.value.trim();
        const query = normalizeSearch(rawQuery);
        if (query.length < 2) {
            resultsDiv.hidden = true;
            return;
        }

        searchTimeout = setTimeout(() => {
            const matched = produtosDisponiveis.filter(p =>
                [
                    p.nome,
                    p.codigo_interno,
                    p.codigo_barras
                ].some((value) => normalizeSearch(value).includes(query))
            );
            const filtered = matched.filter(p =>
                !itensCompra.find(i => i.produto_id === p.id)
            );

            if (filtered.length === 0 && matched.length > 0) {
                resultsDiv.innerHTML = `
                    <div class="purchase-product-empty">
                        <span>Produto já adicionado à compra</span>
                    </div>
                `;
            } else if (filtered.length === 0) {
                resultsDiv.innerHTML = `
                    <div class="purchase-product-empty">
                        <span>Nenhum produto encontrado</span>
                        <button type="button" class="btn btn-primary btn-sm" id="btn-cadastrar-produto-busca">
                            ${icons.plus()} Cadastrar “${escapeHtml(rawQuery)}”
                        </button>
                    </div>
                `;
                resultsDiv.querySelector('#btn-cadastrar-produto-busca')
                    .addEventListener('mousedown', (event) => event.preventDefault());
                resultsDiv.querySelector('#btn-cadastrar-produto-busca')
                    .addEventListener('click', () => openQuickProduct(rawQuery));
            } else {
                resultsDiv.innerHTML = filtered.slice(0, 10).map(p => `
                    <button type="button" class="purchase-product-result" data-id="${p.id}">
                        <span>
                            <strong>${escapeHtml(p.nome)}</strong>
                            <small>${escapeHtml(p.codigo_interno || 'Sem código interno')}</small>
                        </span>
                        <span class="badge badge-neutral">${getUnidadeLabel(p.unidade)}</span>
                    </button>
                `).join('') + `
                    <button type="button" class="purchase-create-another" id="btn-cadastrar-outro-produto">
                        ${icons.plus()} O produto não está na lista? Cadastrar novo
                    </button>
                `;

                resultsDiv.querySelectorAll('.purchase-product-result').forEach(item => {
                    item.addEventListener('mousedown', (event) => event.preventDefault());
                    item.addEventListener('click', () => {
                        const prodId = parseInt(item.dataset.id);
                        const prod = produtosDisponiveis.find(p => p.id === prodId);
                        if (prod) addProdutoCompra(prod);
                    });
                });
                resultsDiv.querySelector('#btn-cadastrar-outro-produto')
                    .addEventListener('mousedown', (event) => event.preventDefault());
                resultsDiv.querySelector('#btn-cadastrar-outro-produto')
                    .addEventListener('click', () => openQuickProduct(rawQuery));
            }

            resultsDiv.hidden = false;
        }, 200);
    });

    searchInput.addEventListener('blur', () => {
        setTimeout(() => { resultsDiv.hidden = true; }, 200);
    });

    content.querySelector('#btn-cancelar-produto').addEventListener('click', closeQuickProduct);
    content.querySelector('#btn-cancelar-produto-rodape').addEventListener('click', closeQuickProduct);
    content.querySelector('#btn-salvar-produto').addEventListener('click', async () => {
        const data = {
            nome: content.querySelector('#novo-produto-nome').value.trim(),
            categoria: content.querySelector('#novo-produto-categoria').value,
            unidade: content.querySelector('#novo-produto-unidade').value,
            codigo_barras: content.querySelector('#novo-produto-codigo-barras').value.trim(),
            preco_venda: parseFloat(content.querySelector('#novo-produto-preco').value) || 0,
            estoque_minimo: parseFloat(content.querySelector('#novo-produto-estoque-minimo').value) || 0,
            ativo: true
        };

        if (!data.nome) {
            showToast('Informe o nome do produto', 'error');
            return;
        }

        const produtoExistente = produtosDisponiveis.find((produto) =>
            normalizeSearch(produto.nome) === normalizeSearch(data.nome)
        );
        if (produtoExistente) {
            addProdutoCompra(produtoExistente);
            closeQuickProduct();
            showToast('Produto já cadastrado e adicionado à compra', 'info');
            return;
        }

        try {
            const produto = await api.post('/produtos', data);
            produtosDisponiveis.push(produto);
            addProdutoCompra(produto);
            closeQuickProduct();
            showToast('Produto cadastrado e adicionado à compra', 'success');
        } catch (err) {
            showToast(err.message || 'Erro ao cadastrar produto', 'error');
        }
    });

    openModal({
        title: isEdicao ? 'Editar Compra #' + compraEdicao.id : 'Nova Compra',
        content,
        size: 'xl',
        confirmText: isEdicao ? 'Salvar Alterações' : 'Salvar Compra',
        cancelText: 'Cancelar',
        onConfirm: async () => {
            const fornecedor_id = parseInt(content.querySelector('#compra-fornecedor').value);
            const loja_id = parseInt(content.querySelector('#compra-loja').value);
            const observacoes = content.querySelector('#compra-obs').value.trim();

            if (!fornecedor_id) {
                showToast('Selecione um fornecedor', 'error');
                return;
            }
            if (!loja_id) {
                showToast('Selecione a unidade de destino', 'error');
                return;
            }
            if (itensCompra.length === 0) {
                showToast('Adicione pelo menos um produto', 'error');
                return;
            }
            if (itensCompra.some(item =>
                !Number.isFinite(parseFloat(item.quantidade)) ||
                parseFloat(item.quantidade) <= 0 ||
                !Number.isFinite(parseFloat(item.fator_conversao_estoque)) ||
                parseFloat(item.fator_conversao_estoque) <= 0
            )) {
                showToast('Informe as toneladas e a conversão para estoque de todos os itens', 'error');
                return;
            }

            const data = {
                fornecedor_id,
                loja_id,
                observacoes,
                itens: itensCompra.map(i => ({
                    produto_id: i.produto_id,
                    quantidade_comprada: i.quantidade,
                    preco_unitario: i.preco_unitario,
                    fator_conversao_estoque: i.fator_conversao_estoque
                }))
            };

            try {
                if (isEdicao) {
                    await api.put('/compras/' + compraEdicao.id, data);
                    showToast('Compra atualizada com sucesso', 'success');
                } else {
                    await api.post('/compras', data);
                    showToast('Compra registrada com sucesso', 'success');
                }
                closeModal();
                loadCompras();
            } catch (err) {
                showToast(err.message || 'Erro ao salvar compra', 'error');
            }
        }
    });

    renderItens();
}

async function openDetalhesModal(compra) {
    let detalhes = compra;
    try {
        const res = await api.get('/compras/' + compra.id);
        detalhes = res.data || res;
    } catch (err) {
        showToast(err.message || 'Erro ao carregar detalhes da compra', 'error');
        return;
    }

    const content = document.createElement('div');
    content.innerHTML = `
        <div class="compra-detalhes">
            <div class="info-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                <div><strong>Fornecedor:</strong> ${detalhes.fornecedor_nome || '-'}</div>
                <div><strong>Data:</strong> ${formatDate(detalhes.created_at)}</div>
                <div><strong>Unidade:</strong> ${escapeHtml(detalhes.loja_nome || '-')}</div>
                <div><strong>Status:</strong> <span class="badge ${getStatusBadge(detalhes.status)}">${getStatusLabel(detalhes.status)}</span></div>
            </div>
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Produto</th>
                        <th>Quantidade</th>
                        <th>Conversão</th>
                        <th>Preço / t</th>
                        <th>Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${(detalhes.itens || []).map(i => `
                        <tr>
                            <td>${i.produto_nome || i.produto?.nome || '-'}</td>
                            <td>
                                ${formatQuantity(i.quantidade_comprada)}
                                ${purchaseUnitLabel(i.unidade_compra)}
                            </td>
                            <td>
                                1 ${purchaseUnitLabel(i.unidade_compra)}
                                = ${formatQuantity(i.fator_conversao_estoque)}
                                ${getUnidadeLabel(i.unidade)}
                            </td>
                            <td>${formatCurrency(i.preco_unitario)}</td>
                            <td>${formatCurrency(i.quantidade_comprada * i.preco_unitario)}</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="4" style="text-align: right;"><strong>Total:</strong></td>
                        <td><strong>${formatCurrency(detalhes.total)}</strong></td>
                    </tr>
                </tfoot>
            </table>
            ${detalhes.observacoes ? `<p><strong>Observações:</strong> ${detalhes.observacoes}</p>` : ''}
        </div>
    `;

    openModal({
        title: 'Detalhes da Compra #' + compra.id,
        content,
        hideFooter: true,
        size: 'xl'
    });
}

function openCancelarCompraModal(compra) {
    if (compra.status !== 'pendente') {
        showToast('Só é possível cancelar compras pendentes', 'warning');
        return;
    }

    const content = document.createElement('div');
    content.innerHTML = `
        <p>Cancelar a compra #${compra.id}?</p>
        <p class="text-muted">Esta ação remove o lançamento pendente e seus itens. Compras recebidas ou parciais não podem ser canceladas.</p>
    `;

    openModal({
        title: 'Cancelar Compra',
        content,
        confirmText: 'Cancelar Compra',
        cancelText: 'Voltar',
        onConfirm: async () => {
            try {
                await api.del('/compras/' + compra.id);
                showToast('Compra cancelada com sucesso', 'success');
                closeModal();
                loadCompras();
            } catch (err) {
                showToast(err.message || 'Erro ao cancelar compra', 'error');
            }
        }
    });
}

async function openRecebimentoModal(compra) {
    let detalhes = compra;
    try {
        const res = await api.get('/compras/' + compra.id);
        detalhes = res.data || res;
    } catch {
        // use the compra data we already have
    }

    const itens = (detalhes.itens || []).filter((item) => !item.recebido_em);
    if (itens.length === 0) {
        showToast('Todos os itens desta compra já foram recebidos', 'info');
        return;
    }

    const content = document.createElement('div');
    content.innerHTML = `
        <div class="recebimento-container">
            <div class="info-grid" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                <div><strong>Fornecedor:</strong> ${detalhes.fornecedor_nome || detalhes.fornecedor?.nome || '-'}</div>
                <div><strong>Data:</strong> ${formatDate(detalhes.created_at || detalhes.data)}</div>
                <div><strong>Unidade:</strong> ${escapeHtml(
                    detalhes.loja_nome || detalhes.loja?.nome || '-'
                )}</div>
            </div>

            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Produto</th>
                        <th style="width: 105px;">Comprada</th>
                        <th style="width: 115px;">Recebida</th>
                        <th style="width: 130px;">Entrada estoque</th>
                        <th style="width: 100px;">Divergência</th>
                        <th style="width: 180px;">Motivo</th>
                    </tr>
                </thead>
                <tbody id="recebimento-itens-body">
                    ${itens.map((item, index) => `
                        <tr>
                            <td>${item.produto_nome || item.produto?.nome || '-'}</td>
                            <td>${formatQuantity(item.quantidade_comprada)} ${purchaseUnitLabel(item.unidade_compra)}</td>
                            <td>
                                <input type="number" class="form-control form-control-sm receb-qtd"
                                    data-index="${index}" min="0" step="0.001" max="${item.quantidade_comprada}" value="${item.quantidade_comprada}" />
                            </td>
                            <td class="receb-estoque" data-index="${index}"></td>
                            <td class="receb-divergencia" data-index="${index}">0</td>
                            <td class="receb-motivo-cell" data-index="${index}" style="display: none;">
                                <select class="form-control form-control-sm receb-motivo" data-index="${index}">
                                    <option value="">Selecione...</option>
                                    <option value="quebra">Quebra</option>
                                    <option value="transporte">Transporte</option>
                                    <option value="descarregamento">Descarregamento</option>
                                    <option value="erro_fornecedor">Erro do Fornecedor</option>
                                </select>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    // Update divergence on quantity change
    function updateDivergencias() {
        content.querySelectorAll('.receb-qtd').forEach(input => {
            const idx = input.dataset.index;
            const comprada = parseFloat(itens[idx].quantidade_comprada);
            const recebida = parseFloat(input.value) || 0;
            const fatorConversao = parseFloat(itens[idx].fator_conversao_estoque) || 1;
            const quantidadeEstoque = recebida * fatorConversao;
            const divergencia = comprada - recebida;

            const divCell = content.querySelector(`.receb-divergencia[data-index="${idx}"]`);
            const estoqueCell = content.querySelector(`.receb-estoque[data-index="${idx}"]`);
            const motivoCell = content.querySelector(`.receb-motivo-cell[data-index="${idx}"]`);

            estoqueCell.textContent =
                `${formatQuantity(quantidadeEstoque)} ${getUnidadeLabel(itens[idx].unidade)}`;
            divCell.textContent =
                `${formatQuantity(divergencia)} ${purchaseUnitLabel(itens[idx].unidade_compra)}`;

            if (divergencia > 0) {
                divCell.style.color = 'var(--danger, #e74c3c)';
                divCell.style.fontWeight = 'bold';
                motivoCell.style.display = '';
            } else {
                divCell.style.color = '';
                divCell.style.fontWeight = '';
                motivoCell.style.display = 'none';
            }
        });
    }

    openModal({
        title: 'Recebimento - Compra #' + compra.id,
        content,
        size: 'xl',
        confirmText: 'Confirmar Recebimento',
        cancelText: 'Cancelar',
        onConfirm: async () => {
            const itensRecebimento = itens.map((item, index) => {
                const qtdInput = content.querySelector(`.receb-qtd[data-index="${index}"]`);
                const motivoSelect = content.querySelector(`.receb-motivo[data-index="${index}"]`);
                const quantidade_recebida = parseFloat(qtdInput.value) || 0;
                const divergencia = parseFloat(item.quantidade_comprada) - quantidade_recebida;

                return {
                    compra_item_id: item.id,
                    produto_id: item.produto_id,
                    quantidade_recebida,
                    divergencia,
                    motivo_divergencia: divergencia > 0 ? (motivoSelect?.value || '') : ''
                };
            });

            // Validate motivos
            const semMotivo = itensRecebimento.find(i => i.divergencia > 0 && !i.motivo_divergencia);
            if (semMotivo) {
                showToast('Informe o motivo da divergência para todos os itens', 'error');
                return;
            }

            try {
                await api.post('/compras/' + compra.id + '/receber', { itens: itensRecebimento });
                showToast('Recebimento confirmado com sucesso', 'success');
                closeModal();
                loadCompras();
            } catch (err) {
                showToast(err.message || 'Erro ao confirmar recebimento', 'error');
            }
        }
    });

    // Bind events after modal is opened
    content.querySelectorAll('.receb-qtd').forEach(input => {
        input.addEventListener('input', updateDivergencias);
    });

    updateDivergencias();
}

function renderComprasTab(container) {
    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `
        <h1>Compras</h1>
        <button class="btn btn-primary" id="btn-nova-compra">
            ${icons.plus()} Nova Compra
        </button>
    `;
    container.appendChild(header);

    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';
    container.appendChild(tableContainer);

    tableInstance = createTable(tableContainer, {
        columns: [
            { key: 'id', label: '#', sortable: true },
            {
                key: 'created_at',
                label: 'Data',
                sortable: true,
                render: (val) => formatDate(val || '')
            },
            {
                key: 'fornecedor_nome',
                label: 'Fornecedor',
                sortable: true,
                render: (val, row) => val || row.fornecedor?.nome || '-'
            },
            {
                key: 'loja_nome',
                label: 'Unidade',
                sortable: true,
                render: (val, row) => val || row.loja?.nome || '-'
            },
            {
                key: 'total',
                label: 'Total',
                sortable: true,
                render: (val) => formatCurrency(val)
            },
            {
                key: 'status',
                label: 'Status',
                render: (val) => `<span class="badge ${getStatusBadge(val)}">${getStatusLabel(val)}</span>`
            }
        ],
        data: [],
        searchable: true,
        pageSize: 15,
        actions: [
            {
                icon: icons.eye(),
                title: 'Ver Detalhes',
                onClick: (compra) => openDetalhesModal(compra)
            },
            {
                icon: icons.edit(),
                label: 'Editar',
                onClick: (compra) => openNovaCompraModal(compra),
                show: (compra) => compra.status === 'pendente',
                showLabel: true
            },
            {
                icon: icons.trash2(),
                label: 'Cancelar',
                class: 'danger',
                onClick: (compra) => openCancelarCompraModal(compra),
                show: (compra) => compra.status === 'pendente',
                showLabel: true
            },
            {
                icon: icons.shoppingCart(),
                label: 'Receber',
                onClick: (compra) => openRecebimentoModal(compra),
                show: (compra) => compra.status !== 'recebido',
                showLabel: true
            }
        ]
    });

    header.querySelector('#btn-nova-compra').addEventListener('click', () => {
        openNovaCompraModal();
    });

    loadCompras();
}

export function render(container) {
    container.innerHTML = '';

    // Tabs
    const tabs = document.createElement('div');
    tabs.className = 'tab-nav';
    tabs.innerHTML = `
        <button class="tab-btn active" data-tab="compras">Compras</button>
        <button class="tab-btn" data-tab="recebimento">Recebimento</button>
    `;
    container.appendChild(tabs);

    const tabContent = document.createElement('div');
    tabContent.className = 'tab-content';
    container.appendChild(tabContent);

    function switchTab(tab) {
        currentTab = tab;
        tabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        tabs.querySelector(`[data-tab="${tab}"]`).classList.add('active');

        if (tab === 'compras') {
            renderComprasTab(tabContent);
        } else {
            renderRecebimentoTab(tabContent);
        }
    }

    function renderRecebimentoTab(container) {
        container.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'page-header';
        header.innerHTML = `<h1>Recebimento de Compras</h1>`;
        container.appendChild(header);

        const tableContainer = document.createElement('div');
        tableContainer.className = 'table-container';
        container.appendChild(tableContainer);

        let recebimentoTable = null;

        async function loadPendentes() {
            try {
                const res = await api.get('/compras');
                const compras = (res.data || res || []).filter(c => c.status !== 'recebido');
                if (recebimentoTable) {
                    recebimentoTable.update(compras);
                }
            } catch (err) {
                showToast('Erro ao carregar compras pendentes', 'error');
            }
        }

        recebimentoTable = createTable(tableContainer, {
            columns: [
                { key: 'id', label: '#', sortable: true },
                {
                    key: 'created_at',
                    label: 'Data',
                    sortable: true,
                    render: (val) => formatDate(val || '')
                },
                {
                    key: 'fornecedor_nome',
                    label: 'Fornecedor',
                    sortable: true,
                    render: (val, row) => val || row.fornecedor?.nome || '-'
                },
                {
                    key: 'loja_nome',
                    label: 'Unidade',
                    sortable: true,
                    render: (val, row) => val || row.loja?.nome || '-'
                },
                {
                    key: 'total',
                    label: 'Total',
                    sortable: true,
                    render: (val) => formatCurrency(val)
                },
                {
                    key: 'status',
                    label: 'Status',
                    render: (val) => `<span class="badge ${getStatusBadge(val)}">${getStatusLabel(val)}</span>`
                }
            ],
            data: [],
            searchable: true,
            pageSize: 15,
            actions: [
                {
                    icon: icons.eye(),
                    title: 'Ver Detalhes',
                    onClick: (compra) => openDetalhesModal(compra)
                },
                {
                    icon: icons.edit(),
                    label: 'Editar',
                    onClick: (compra) => openNovaCompraModal(compra),
                    show: (compra) => compra.status === 'pendente',
                    showLabel: true
                },
                {
                    icon: icons.trash2(),
                    label: 'Cancelar',
                    class: 'danger',
                    onClick: (compra) => openCancelarCompraModal(compra),
                    show: (compra) => compra.status === 'pendente',
                    showLabel: true
                },
                {
                    icon: icons.shoppingCart(),
                    label: 'Receber',
                    onClick: (compra) => openRecebimentoModal(compra),
                    showLabel: true
                }
            ]
        });

        loadPendentes();
    }

    tabs.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    switchTab('compras');
}
