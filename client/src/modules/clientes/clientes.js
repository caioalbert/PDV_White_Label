import api from '../../api.js';
import icons from '../../icons.js';
import { escapeHtml, formatCPFCNPJ, formatPhone, maskInput } from '../../utils.js';
import { openModal, closeModal } from '../../components/modal.js';
import { createTable } from '../../components/table.js';
import { showToast } from '../../components/toast.js';

export async function render(container) {
    let tableInstance = null;

    container.innerHTML = `
        <div class="page-header">
            <h1>${icons.users()} Clientes</h1>
            <button class="btn btn-primary" id="btn-novo-cliente">
                ${icons.plus()} Novo Cliente
            </button>
        </div>
        <div class="card">
            <div class="card-body" id="clientes-table-container"></div>
        </div>
    `;

    const tableContainer = container.querySelector('#clientes-table-container');

    async function loadClientes(search = '') {
        try {
            const clientes = await api.get('/clientes?search=' + encodeURIComponent(search));
            if (tableInstance) {
                tableInstance.update(clientes);
            } else {
                tableInstance = createTable(tableContainer, {
                    columns: [
                        { label: 'Nome', field: 'nome' },
                        {
                            label: 'CPF/CNPJ',
                            field: 'cpf_cnpj',
                            render: (val) => val ? formatCPFCNPJ(val) : '-'
                        },
                        {
                            label: 'Telefone',
                            field: 'telefone',
                            render: (val) => val ? formatPhone(val) : '-'
                        },
                        { label: 'Endereço', field: 'endereco' }
                    ],
                    data: clientes,
                    searchable: true,
                    searchPlaceholder: 'Buscar cliente...',
                    pageSize: 10,
                    actions: [
                        {
                            icon: icons.edit(),
                            title: 'Editar',
                            class: 'btn-secondary',
                            onClick: (cliente) => openClienteModal(cliente)
                        },
                        {
                            icon: icons.trash2(),
                            title: 'Excluir',
                            class: 'btn-danger',
                            onClick: (cliente) => confirmDeleteCliente(cliente)
                        }
                    ]
                });
            }
        } catch (err) {
            tableContainer.innerHTML = '<p style="color:#E63946;">Erro ao carregar clientes.</p>';
            console.error(err);
        }
    }

    function openClienteModal(cliente = null) {
        const isEdit = cliente !== null;
        const title = isEdit ? 'Editar Cliente' : 'Novo Cliente';

        const content = document.createElement('div');
        content.innerHTML = `
            <form id="form-cliente">
                <div class="form-group">
                    <label class="form-label">Nome *</label>
                    <input type="text" class="form-control" id="cliente-nome"
                        value="${isEdit ? escapeHtml(cliente.nome || '') : ''}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">CPF/CNPJ</label>
                    <input type="text" class="form-control" id="cliente-cpf-cnpj"
                        inputmode="numeric" maxlength="18"
                        value="${isEdit ? escapeHtml(formatCPFCNPJ(cliente.cpf_cnpj || '')) : ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Telefone</label>
                    <input type="tel" class="form-control" id="cliente-telefone"
                        inputmode="tel" maxlength="15"
                        value="${isEdit ? escapeHtml(formatPhone(cliente.telefone || '')) : ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Endereço</label>
                    <input type="text" class="form-control" id="cliente-endereco"
                        value="${isEdit ? escapeHtml(cliente.endereco || '') : ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Observações</label>
                    <textarea class="form-control" id="cliente-observacoes"
                        rows="3">${isEdit ? escapeHtml(cliente.observacoes || '') : ''}</textarea>
                </div>
            </form>
        `;

        maskInput(content.querySelector('#cliente-cpf-cnpj'), 'cpf_cnpj');
        maskInput(content.querySelector('#cliente-telefone'), 'phone');

        openModal({
            title,
            content,
            confirmText: 'Salvar',
            cancelText: 'Cancelar',
            onConfirm: async () => {
                const nome = content.querySelector('#cliente-nome').value.trim();
                const cpf_cnpj = content.querySelector('#cliente-cpf-cnpj').value.trim();
                const telefone = content.querySelector('#cliente-telefone').value.trim();
                const endereco = content.querySelector('#cliente-endereco').value.trim();
                const observacoes = content.querySelector('#cliente-observacoes').value.trim();

                if (!nome) {
                    showToast('Nome é obrigatório.', 'error');
                    return;
                }

                const payload = { nome, cpf_cnpj, telefone, endereco, observacoes };

                try {
                    if (isEdit) {
                        await api.put('/clientes/' + cliente.id, payload);
                        showToast('Cliente atualizado com sucesso!', 'success');
                    } else {
                        await api.post('/clientes', payload);
                        showToast('Cliente criado com sucesso!', 'success');
                    }
                    closeModal();
                    await loadClientes();
                } catch (err) {
                    showToast(err.message || 'Erro ao salvar cliente.', 'error');
                }
            }
        });
    }

    function confirmDeleteCliente(cliente) {
        if (!cliente) return;

        const content = document.createElement('div');
        content.innerHTML = `
            <p>Tem certeza que deseja excluir o cliente <strong>${cliente.nome}</strong>?</p>
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
                    await api.del('/clientes/' + cliente.id);
                    showToast('Cliente excluído com sucesso!', 'success');
                    closeModal();
                    await loadClientes();
                } catch (err) {
                    showToast(err.message || 'Erro ao excluir cliente.', 'error');
                }
            }
        });
    }

    // Bind "Novo Cliente" button
    container.querySelector('#btn-novo-cliente').addEventListener('click', () => {
        openClienteModal();
    });

    // Initial load
    await loadClientes();
}
