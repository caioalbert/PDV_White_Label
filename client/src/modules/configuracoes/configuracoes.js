import api from '../../api.js';
import icons from '../../icons.js';
import { formatDate } from '../../utils.js';
import { createTable } from '../../components/table.js';
import { closeModal, openModal } from '../../components/modal.js';
import { showToast } from '../../components/toast.js';
import {
  DEFAULT_VENDOR_PERMISSIONS,
  PERMISSION_OPTIONS,
} from '../../permissions.js';

let configuracoes = [];
let usuarios = [];
let lojas = [];

function arrayFrom(response) {
  return response?.data || response || [];
}

function configValue(chave, fallback = '') {
  return configuracoes.find((item) => item.chave === chave)?.valor ?? fallback;
}

async function loadData() {
  const [configRes, usuariosRes, lojasRes] = await Promise.all([
    api.get('/configuracoes'),
    api.get('/configuracoes/usuarios'),
    api.get('/lojas'),
  ]);
  configuracoes = arrayFrom(configRes);
  usuarios = arrayFrom(usuariosRes);
  lojas = arrayFrom(lojasRes);
}

function renderGerais(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Regras Comerciais</h1>
        <p class="page-subtitle">Taxas repassadas ao cliente e limite de desconto do PDV.</p>
      </div>
      <button class="btn btn-primary" id="btn-salvar-config">${icons.save()} Salvar alterações</button>
    </div>

    <div class="settings-grid">
      <section class="card settings-section">
        <div class="settings-section-icon">${icons.creditCard()}</div>
        <div>
          <h3>Taxas de cartão</h3>
          <p class="text-muted">Percentuais adicionados automaticamente ao total da venda.</p>
        </div>
        <div class="form-row mt-md">
          <div class="form-group">
            <label class="form-label">Débito (%)</label>
            <input class="form-control" type="number" id="config-taxa-debito" min="0" step="0.01"
              value="${configValue('taxa_debito', '1.5')}">
          </div>
          <div class="form-group">
            <label class="form-label">Crédito (%)</label>
            <input class="form-control" type="number" id="config-taxa-credito" min="0" step="0.01"
              value="${configValue('taxa_credito', '3.5')}">
          </div>
        </div>
      </section>

      <section class="card settings-section">
        <div class="settings-section-icon">${icons.scale()}</div>
        <div>
          <h3>Desconto máximo</h3>
          <p class="text-muted">Limite permitido para vendedores e administradores no PDV.</p>
        </div>
        <div class="form-group mt-md">
          <label class="form-label">Percentual máximo (%)</label>
          <input class="form-control" type="number" id="config-desconto" min="0" max="100" step="0.01"
            value="${configValue('desconto_maximo', '20')}">
        </div>
      </section>
    </div>
  `;

  container.querySelector('#btn-salvar-config').addEventListener('click', async () => {
    const valores = {
      taxa_debito: parseFloat(container.querySelector('#config-taxa-debito').value),
      taxa_credito: parseFloat(container.querySelector('#config-taxa-credito').value),
      desconto_maximo: parseFloat(container.querySelector('#config-desconto').value),
    };

    if (Object.values(valores).some((valor) => !Number.isFinite(valor) || valor < 0)) {
      showToast('Informe percentuais válidos', 'error');
      return;
    }

    try {
      await Promise.all(
        Object.entries(valores).map(([chave, valor]) =>
          api.put(`/configuracoes/${chave}`, { valor: String(valor) })
        )
      );
      configuracoes = arrayFrom(await api.get('/configuracoes'));
      showToast('Configurações atualizadas com sucesso', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function openUsuarioModal(usuario, onSaved) {
  const isEdit = Boolean(usuario);
  const selectedPermissions = new Set(
    usuario?.permissoes || DEFAULT_VENDOR_PERMISSIONS
  );
  const lojasComerciais = lojas.filter((loja) => loja.tipo === 'loja');
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nome *</label>
        <input class="form-control" id="usuario-nome" value="${usuario?.nome || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Login *</label>
        <input class="form-control" id="usuario-login" value="${usuario?.login || ''}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">${isEdit ? 'Nova senha' : 'Senha *'}</label>
        <input
          class="form-control"
          type="password"
          id="usuario-senha"
          minlength="8"
          maxlength="72"
          autocomplete="new-password"
        >
        ${isEdit ? '<small class="text-muted">Deixe em branco para manter a senha atual.</small>' : ''}
      </div>
      <div class="form-group">
        <label class="form-label">Perfil *</label>
        <select class="form-control" id="usuario-perfil">
          <option value="vendedor" ${usuario?.perfil === 'vendedor' ? 'selected' : ''}>Vendedor</option>
          <option value="admin" ${usuario?.perfil === 'admin' ? 'selected' : ''}>Administrador</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Loja</label>
      <select class="form-control" id="usuario-loja">
        <option value="">Sem loja vinculada</option>
        ${lojasComerciais.map((loja) => `
          <option value="${loja.id}" ${usuario?.loja_id == loja.id ? 'selected' : ''}>${loja.nome}</option>
        `).join('')}
      </select>
    </div>
    <div class="form-group permission-section">
      <label class="form-label">Permissões de acesso</label>
      <small class="text-muted">Defina os módulos disponíveis para este usuário.</small>
      <div class="permission-grid" id="usuario-permissoes">
        ${PERMISSION_OPTIONS.map((permission) => `
          <label class="permission-option">
            <input
              type="checkbox"
              value="${permission.key}"
              ${selectedPermissions.has(permission.key) ? 'checked' : ''}
            >
            <span>${permission.label}</span>
          </label>
        `).join('')}
      </div>
      <p class="permission-admin-message" id="permission-admin-message">
        Administradores possuem acesso total ao sistema.
      </p>
    </div>
    ${isEdit ? `
      <label class="checkbox-label">
        <input type="checkbox" id="usuario-ativo" ${usuario.ativo !== false ? 'checked' : ''}>
        Usuário ativo
      </label>
    ` : ''}
  `;

  const perfilSelect = content.querySelector('#usuario-perfil');
  const permissionGrid = content.querySelector('#usuario-permissoes');
  const adminMessage = content.querySelector('#permission-admin-message');

  function updatePermissionState() {
    const admin = perfilSelect.value === 'admin';
    permissionGrid.classList.toggle('is-disabled', admin);
    permissionGrid.querySelectorAll('input').forEach((input) => {
      input.disabled = admin;
    });
    adminMessage.classList.toggle('visible', admin);
  }

  perfilSelect.addEventListener('change', updatePermissionState);
  updatePermissionState();

  openModal({
    title: isEdit ? 'Editar usuário' : 'Novo usuário',
    content,
    size: 'lg',
    confirmText: 'Salvar usuário',
    onConfirm: async () => {
      const perfil = content.querySelector('#usuario-perfil').value;
      const payload = {
        nome: content.querySelector('#usuario-nome').value.trim(),
        login: content.querySelector('#usuario-login').value.trim(),
        senha: content.querySelector('#usuario-senha').value,
        perfil,
        loja_id: parseInt(content.querySelector('#usuario-loja').value, 10) || null,
        permissoes: perfil === 'admin'
          ? []
          : [...content.querySelectorAll('#usuario-permissoes input:checked')]
            .map((input) => input.value),
      };
      if (isEdit) payload.ativo = content.querySelector('#usuario-ativo').checked;

      if (!payload.nome || !payload.login || (!isEdit && !payload.senha)) {
        showToast('Nome, login e senha são obrigatórios', 'error');
        return;
      }
      if (payload.senha && payload.senha.length < 8) {
        showToast('A senha temporária deve ter pelo menos 8 caracteres', 'error');
        return;
      }
      if (perfil === 'vendedor' && !payload.loja_id) {
        showToast('Selecione a loja do vendedor', 'error');
        return;
      }

      try {
        if (isEdit) {
          await api.put(`/configuracoes/usuarios/${usuario.id}`, payload);
        } else {
          await api.post('/configuracoes/usuarios', payload);
        }
        closeModal();
        showToast('Usuário salvo com sucesso', 'success');
        onSaved();
      } catch (error) {
        showToast(error.message, 'error');
      }
    },
  });
}

function deleteUsuario(usuario, onDeleted) {
  openModal({
    title: 'Excluir usuário',
    content: `<p>Confirma a exclusão de <strong>${usuario.nome}</strong>?</p>`,
    confirmText: 'Excluir',
    onConfirm: async () => {
      try {
        await api.del(`/configuracoes/usuarios/${usuario.id}`);
        closeModal();
        showToast('Usuário excluído', 'success');
        onDeleted();
      } catch (error) {
        showToast(error.message, 'error');
      }
    },
  });
}

function renderUsuarios(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Usuários</h1>
        <p class="page-subtitle">Acessos administrativos e vendedores vinculados às lojas.</p>
      </div>
      <button class="btn btn-primary" id="btn-novo-usuario">${icons.plus()} Novo usuário</button>
    </div>
    <div id="usuarios-table"></div>
  `;

  const table = createTable(container.querySelector('#usuarios-table'), {
    columns: [
      { key: 'nome', label: 'Nome' },
      { key: 'login', label: 'Login' },
      {
        key: 'perfil',
        label: 'Perfil',
        render: (value) => value === 'admin'
          ? '<span class="badge badge-primary">Administrador</span>'
          : '<span class="badge badge-info">Vendedor</span>',
      },
      { key: 'loja_nome', label: 'Loja', render: (value) => value || '-' },
      {
        key: 'permissoes',
        label: 'Acessos',
        sortable: false,
        render: (value, usuario) => {
          if (usuario.perfil === 'admin') return 'Acesso total';
          const permissions = Array.isArray(value) ? value : [];
          return permissions.length
            ? `${permissions.length} módulo${permissions.length === 1 ? '' : 's'}`
            : 'Sem acesso';
        },
      },
      {
        key: 'ativo',
        label: 'Status',
        render: (value) => value !== false
          ? '<span class="badge badge-success">Ativo</span>'
          : '<span class="badge badge-danger">Inativo</span>',
      },
      { key: 'created_at', label: 'Criado em', render: formatDate },
    ],
    data: usuarios,
    searchable: true,
    actions: [
      {
        icon: icons.edit(),
        title: 'Editar',
        onClick: (usuario) => openUsuarioModal(usuario, carregar),
      },
      {
        icon: icons.trash2(),
        title: 'Excluir',
        class: 'danger',
        onClick: (usuario) => deleteUsuario(usuario, carregar),
      },
    ],
  });

  async function carregar() {
    try {
      usuarios = arrayFrom(await api.get('/configuracoes/usuarios'));
      table.update(usuarios);
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  container.querySelector('#btn-novo-usuario').addEventListener('click', () => {
    openUsuarioModal(null, carregar);
  });
}

function renderComissoes(container) {
  const lojasComerciais = lojas.filter((loja) => loja.tipo === 'loja');
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Comissão por Loja</h1>
        <p class="page-subtitle">Percentual calculado automaticamente sobre as vendas da loja.</p>
      </div>
      <button class="btn btn-primary" id="btn-salvar-comissoes">${icons.save()} Salvar comissões</button>
    </div>
    <div class="cards-grid">
      ${lojasComerciais.map((loja) => `
        <section class="card commission-card">
          <div class="commission-store">
            <div class="stat-icon">${icons.store()}</div>
            <div>
              <h3>${loja.nome}</h3>
              <p class="text-muted">${loja.cidade || '-'}</p>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Comissão (%)</label>
            <input class="form-control commission-input" type="number" min="0" max="100" step="0.01"
              data-loja-id="${loja.id}" value="${parseFloat(loja.comissao_percentual || 0)}">
          </div>
        </section>
      `).join('')}
    </div>
  `;

  container.querySelector('#btn-salvar-comissoes').addEventListener('click', async () => {
    const alteracoes = [...container.querySelectorAll('.commission-input')].map((input) => {
      const loja = lojasComerciais.find((item) => item.id == input.dataset.lojaId);
      return {
        loja,
        percentual: parseFloat(input.value),
      };
    });

    if (alteracoes.some((item) =>
      !Number.isFinite(item.percentual) || item.percentual < 0 || item.percentual > 100
    )) {
      showToast('Informe percentuais entre 0 e 100', 'error');
      return;
    }

    try {
      await Promise.all(alteracoes.map(({ loja, percentual }) =>
        api.put(`/lojas/${loja.id}`, {
          nome: loja.nome,
          cidade: loja.cidade,
          situacao: loja.situacao,
          comissao_percentual: percentual,
          tipo: loja.tipo,
        })
      ));
      lojas = arrayFrom(await api.get('/lojas'));
      showToast('Comissões atualizadas com sucesso', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

export async function render(container) {
  container.innerHTML = '<div class="loading-overlay"><div class="loading-spinner"></div></div>';

  try {
    await loadData();
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><h4>Erro ao carregar configurações</h4><p>${error.message}</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="tab-nav">
      <button class="tab-btn active" data-tab="gerais">Regras comerciais</button>
      <button class="tab-btn" data-tab="usuarios">Usuários</button>
      <button class="tab-btn" data-tab="comissoes">Comissões</button>
    </div>
    <div class="tab-content" id="configuracoes-conteudo"></div>
  `;

  const conteudo = container.querySelector('#configuracoes-conteudo');
  function trocarAba(aba) {
    container.querySelectorAll('[data-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === aba);
    });
    if (aba === 'gerais') renderGerais(conteudo);
    if (aba === 'usuarios') renderUsuarios(conteudo);
    if (aba === 'comissoes') renderComissoes(conteudo);
  }

  container.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => trocarAba(button.dataset.tab));
  });
  trocarAba('gerais');
}
