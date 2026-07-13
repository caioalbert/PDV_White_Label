import api from '../../api.js';
import icons from '../../icons.js';
import { openModal, closeModal } from '../../components/modal.js';
import { showToast } from '../../components/toast.js';
import { isAdmin } from '../../auth.js';
import { escapeHtml } from '../../utils.js';

export async function render(container) {
    if (!isAdmin()) {
        container.innerHTML = '<div class="card" style="padding:40px;text-align:center;"><h2>Acesso Negado</h2><p>Apenas administradores podem acessar este módulo.</p></div>';
        return;
    }

    container.innerHTML = `
        <div class="page-header">
            <h1>${icons.store()} Lojas e Unidades</h1>
            <button class="btn btn-primary" id="btn-nova-loja">
                ${icons.plus()} Nova Unidade
            </button>
        </div>
        <div class="stats-grid" id="lojas-grid">
            <p style="color:#888;">Carregando...</p>
        </div>
    `;

    const grid = container.querySelector('#lojas-grid');

    async function loadLojas() {
        try {
            const lojas = await api.get('/lojas');
            renderLojas(lojas);
        } catch (err) {
            grid.innerHTML = '<p style="color:#E63946;">Erro ao carregar lojas.</p>';
            console.error(err);
        }
    }

    function renderLojas(lojas) {
        if (!lojas || lojas.length === 0) {
            grid.innerHTML = '<p style="color:#888; text-align:center;">Nenhuma unidade cadastrada.</p>';
            return;
        }

        grid.innerHTML = lojas.map(loja => {
            const galpao = loja.tipo === 'galpao_fabrica';
            return `
            <div class="card loja-card" data-id="${loja.id}">
                <div class="card-body">
                    <h3 style="margin:0 0 8px 0; color:#1B4332;">
                        ${galpao ? icons.factory() : icons.store()} ${escapeHtml(loja.nome || '')}
                    </h3>
                    <p style="margin:4px 0; color:#666;">${escapeHtml(loja.cidade || 'Cidade não informada')}</p>
                    <p style="margin:4px 0;">
                        <span class="badge badge-neutral">${galpao ? 'Galpão/Fábrica' : 'Loja'}</span>
                        <span class="badge ${loja.situacao === 'ativa' ? 'badge-success' : 'badge-danger'}">
                            ${loja.situacao === 'ativa' ? 'Ativa' : 'Inativa'}
                        </span>
                    </p>
                    ${galpao ? '' : `
                        <p style="margin:8px 0 0 0; color:#555; font-size:0.9rem;">
                            Comissão: <strong>${loja.comissao_percentual != null ? loja.comissao_percentual : 0}%</strong>
                        </p>
                    `}
                    <div style="margin-top:16px; display:flex; gap:8px;">
                        <button class="btn btn-sm btn-secondary btn-edit-loja" data-id="${loja.id}" title="Editar">
                            ${icons.edit()} Editar
                        </button>
                        <button class="btn btn-sm btn-danger btn-delete-loja" data-id="${loja.id}" title="Excluir">
                            ${icons.trash2()} Excluir
                        </button>
                    </div>
                </div>
            </div>
        `;
        }).join('');

        // Bind edit buttons
        grid.querySelectorAll('.btn-edit-loja').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const loja = lojas.find(l => String(l.id) === String(id));
                if (loja) openLojaModal(loja);
            });
        });

        // Bind delete buttons
        grid.querySelectorAll('.btn-delete-loja').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const loja = lojas.find(l => String(l.id) === String(id));
                confirmDeleteLoja(loja);
            });
        });
    }

    function openLojaModal(loja = null) {
        const isEdit = loja !== null;
        const title = isEdit ? 'Editar Unidade' : 'Nova Unidade';

        const content = document.createElement('div');
        content.innerHTML = `
            <form id="form-loja">
                <div class="form-group">
                    <label class="form-label">Nome *</label>
                    <input type="text" class="form-control" id="loja-nome"
                        value="${isEdit ? escapeHtml(loja.nome || '') : ''}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Cidade</label>
                    <input type="text" class="form-control" id="loja-cidade"
                        value="${isEdit ? escapeHtml(loja.cidade || '') : ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Tipo</label>
                    <select class="form-control" id="loja-tipo">
                        <option value="loja" ${!isEdit || loja.tipo === 'loja' ? 'selected' : ''}>Loja</option>
                        <option value="galpao_fabrica" ${loja?.tipo === 'galpao_fabrica' ? 'selected' : ''}>
                            Galpão/Fábrica
                        </option>
                    </select>
                </div>
                <div class="form-group" id="loja-comissao-grupo">
                    <label class="form-label">Situação</label>
                    <select class="form-control" id="loja-situacao">
                        <option value="ativa" ${isEdit && loja.situacao === 'ativa' ? 'selected' : ''}>Ativa</option>
                        <option value="inativa" ${isEdit && loja.situacao === 'inativa' ? 'selected' : ''}>Inativa</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Comissão (%)</label>
                    <input type="number" class="form-control" id="loja-comissao" step="0.1" min="0" max="100" value="${isEdit ? (loja.comissao_percentual || 0) : '0'}">
                </div>
            </form>
        `;

        const tipoInput = content.querySelector('#loja-tipo');
        const comissaoGrupo = content.querySelector('#loja-comissao-grupo');
        const updateTipo = () => {
            comissaoGrupo.hidden = tipoInput.value !== 'loja';
        };
        tipoInput.addEventListener('change', updateTipo);
        updateTipo();

        openModal({
            title,
            content,
            confirmText: 'Salvar',
            cancelText: 'Cancelar',
            onConfirm: async () => {
                const nome = content.querySelector('#loja-nome').value.trim();
                const cidade = content.querySelector('#loja-cidade').value.trim();
                const situacao = content.querySelector('#loja-situacao').value;
                const tipo = tipoInput.value;
                const comissao_percentual = parseFloat(content.querySelector('#loja-comissao').value) || 0;

                if (!nome) {
                    showToast('Nome é obrigatório.', 'error');
                    return;
                }

                const payload = { nome, cidade, situacao, tipo, comissao_percentual };

                try {
                    if (isEdit) {
                        await api.put('/lojas/' + loja.id, payload);
                        showToast('Unidade atualizada com sucesso!', 'success');
                    } else {
                        await api.post('/lojas', payload);
                        showToast('Unidade criada com sucesso!', 'success');
                    }
                    closeModal();
                    loadLojas();
                } catch (err) {
                    showToast(err.message || 'Erro ao salvar loja.', 'error');
                }
            }
        });
    }

    function confirmDeleteLoja(loja) {
        if (!loja) return;

        const content = document.createElement('div');
        content.innerHTML = `
            <p>Tem certeza que deseja excluir a unidade <strong>${escapeHtml(loja.nome)}</strong>?</p>
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
                    await api.del('/lojas/' + loja.id);
                    showToast('Unidade excluída com sucesso!', 'success');
                    closeModal();
                    loadLojas();
                } catch (err) {
                    showToast(err.message || 'Erro ao excluir loja.', 'error');
                }
            }
        });
    }

    // Bind "Nova Loja" button
    container.querySelector('#btn-nova-loja').addEventListener('click', () => {
        openLojaModal();
    });

    // Initial load
    await loadLojas();
}
