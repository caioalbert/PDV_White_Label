import api from '../../api.js';
import icons from '../../icons.js';
import { formatCNPJ, formatPhone, maskInput } from '../../utils.js';
import { openModal, closeModal } from '../../components/modal.js';
import { createTable } from '../../components/table.js';
import { showToast } from '../../components/toast.js';

export async function render(container) {
    let tableInstance = null;

    container.innerHTML = `
        <div class="page-header">
            <h1>${icons.truck()} Fornecedores</h1>
            <button class="btn btn-primary" id="btn-novo-fornecedor">
                ${icons.plus()} Novo Fornecedor
            </button>
        </div>
        <div class="card">
            <div class="card-body" id="fornecedores-table-container"></div>
        </div>
    `;

    const tableContainer = container.querySelector('#fornecedores-table-container');

    async function loadFornecedores(search = '') {
        try {
            const fornecedores = await api.get('/fornecedores?search=' + encodeURIComponent(search));
            if (tableInstance) {
                tableInstance.update(fornecedores);
            } else {
                tableInstance = createTable(tableContainer, {
                    columns: [
                        { label: 'Nome', field: 'nome' },
                        {
                            label: 'CNPJ',
                            field: 'cnpj',
                            render: (val) => val ? formatCNPJ(val) : '-'
                        },
                        {
                            label: 'Telefone',
                            field: 'telefone',
                            render: (val) => val ? formatPhone(val) : '-'
                        },
                        { label: 'Cidade', field: 'cidade' }
                    ],
                    data: fornecedores,
                    searchable: true,
                    searchPlaceholder: 'Buscar fornecedor...',
                    pageSize: 10,
                    actions: [
                        {
                            icon: icons.edit(),
                            title: 'Editar',
                            class: 'btn-secondary',
                            onClick: (fornecedor) => openFornecedorModal(fornecedor)
                        },
                        {
                            icon: icons.trash2(),
                            title: 'Excluir',
                            class: 'btn-danger',
                            onClick: (fornecedor) => confirmDeleteFornecedor(fornecedor)
                        }
                    ]
                });
            }
        } catch (err) {
            tableContainer.innerHTML = '<p style="color:#E63946;">Erro ao carregar fornecedores.</p>';
            console.error(err);
        }
    }

    function openFornecedorModal(fornecedor = null) {
        const isEdit = fornecedor !== null;
        const title = isEdit ? 'Editar Fornecedor' : 'Novo Fornecedor';

        const content = document.createElement('div');
        content.innerHTML = `
            <form id="form-fornecedor">
                <div class="form-group">
                    <label class="form-label">Nome *</label>
                    <input type="text" class="form-control" id="fornecedor-nome" value="${isEdit ? (fornecedor.nome || '') : ''}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">CNPJ</label>
                    <input
                        type="text"
                        class="form-control"
                        id="fornecedor-cnpj"
                        value="${isEdit ? formatCNPJ(fornecedor.cnpj || '') : ''}"
                        inputmode="numeric"
                        maxlength="18"
                        placeholder="00.000.000/0000-00"
                    >
                </div>
                <div class="form-group">
                    <label class="form-label">Telefone</label>
                    <input
                        type="tel"
                        class="form-control"
                        id="fornecedor-telefone"
                        value="${isEdit ? formatPhone(fornecedor.telefone || '') : ''}"
                        inputmode="tel"
                        maxlength="15"
                        placeholder="(00) 00000-0000"
                    >
                </div>
                <div class="form-group">
                    <label class="form-label">Cidade</label>
                    <input type="text" class="form-control" id="fornecedor-cidade" value="${isEdit ? (fornecedor.cidade || '') : ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Observações</label>
                    <textarea class="form-control" id="fornecedor-observacoes" rows="3">${isEdit ? (fornecedor.observacoes || '') : ''}</textarea>
                </div>
            </form>
        `;

        maskInput(content.querySelector('#fornecedor-cnpj'), 'cnpj');
        maskInput(content.querySelector('#fornecedor-telefone'), 'phone');

        openModal({
            title,
            content,
            confirmText: 'Salvar',
            cancelText: 'Cancelar',
            onConfirm: async () => {
                const nome = content.querySelector('#fornecedor-nome').value.trim();
                const cnpj = content.querySelector('#fornecedor-cnpj').value.trim();
                const telefone = content.querySelector('#fornecedor-telefone').value.trim();
                const cidade = content.querySelector('#fornecedor-cidade').value.trim();
                const observacoes = content.querySelector('#fornecedor-observacoes').value.trim();

                if (!nome) {
                    showToast('Nome é obrigatório.', 'error');
                    return;
                }

                const payload = { nome, cnpj, telefone, cidade, observacoes };

                try {
                    if (isEdit) {
                        await api.put('/fornecedores/' + fornecedor.id, payload);
                        showToast('Fornecedor atualizado com sucesso!', 'success');
                    } else {
                        await api.post('/fornecedores', payload);
                        showToast('Fornecedor criado com sucesso!', 'success');
                    }
                    closeModal();
                    await loadFornecedores();
                } catch (err) {
                    showToast(err.message || 'Erro ao salvar fornecedor.', 'error');
                }
            }
        });
    }

    function confirmDeleteFornecedor(fornecedor) {
        if (!fornecedor) return;

        const content = document.createElement('div');
        content.innerHTML = `
            <p>Tem certeza que deseja excluir o fornecedor <strong>${fornecedor.nome}</strong>?</p>
            <p style="color: #E63946; font-size: 0.875rem;">
                ${icons.alertTriangle()} Esta ação não pode ser desfeita.
            </p>
        `;

        openModal({
            title: 'Confirmar Exclusão',
            content,
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            onConfirm: async () => {
                try {
                    await api.del('/fornecedores/' + fornecedor.id);
                    showToast('Fornecedor excluído com sucesso!', 'success');
                    closeModal();
                    await loadFornecedores();
                } catch (err) {
                    showToast(err.message || 'Erro ao excluir fornecedor.', 'error');
                }
            }
        });
    }

    // Bind "Novo Fornecedor" button
    container.querySelector('#btn-novo-fornecedor').addEventListener('click', () => {
        openFornecedorModal();
    });

    // Initial load
    await loadFornecedores();
}
