import api from '../../api.js';
import icons from '../../icons.js';
import { formatCurrency, getUnidadeLabel } from '../../utils.js';
import { openModal, closeModal } from '../../components/modal.js';
import { createTable } from '../../components/table.js';
import { showToast } from '../../components/toast.js';

let tableInstance = null;
let allProdutos = [];

async function loadProdutos() {
    try {
        const res = await api.get('/produtos');
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
        </form>
    `;

    const getFormData = () => ({
        nome: content.querySelector('#prod-nome').value.trim(),
        categoria: 'geral',
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
                if (isEdit) {
                    await api.put('/produtos/' + produto.id, data);
                    showToast('Produto atualizado com sucesso', 'success');
                } else {
                    await api.post('/produtos', data);
                    showToast('Produto criado com sucesso', 'success');
                }
                closeModal();
                await loadProdutos();
            } catch (err) {
                showToast(err.message || 'Erro ao salvar produto', 'error');
            }
        }
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

    // Table container
    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';
    container.appendChild(tableContainer);

    tableInstance = createTable(tableContainer, {
        columns: [
            { key: 'codigo_interno', label: 'Código', sortable: true },
            { key: 'nome', label: 'Nome', sortable: true },
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

    // Initial load
    loadProdutos();
}
