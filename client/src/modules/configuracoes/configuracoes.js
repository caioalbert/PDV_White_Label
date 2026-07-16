import api from '../../api.js';
import icons from '../../icons.js';
import { escapeHtml, formatDate } from '../../utils.js';
import { createTable } from '../../components/table.js';
import { closeModal, openModal } from '../../components/modal.js';
import { showToast } from '../../components/toast.js';
import { loadAppConfig, updateCachedAppConfig } from '../../app-config.js';
import {
  DEFAULT_VENDOR_PERMISSIONS,
  PERMISSION_OPTIONS,
} from '../../permissions.js';

let configuracoes = [];
let usuarios = [];
let lojas = [];
let entidadesFinanceiras = [];

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
        <h1>Configura\u00e7\u00f5es gerais</h1>
        <p class="page-subtitle">Identidade da empresa e limite de desconto do PDV.</p>
      </div>
      <button class="btn btn-primary" id="btn-salvar-config">${icons.save()} Salvar alterações</button>
    </div>

    <div class="settings-grid">
      <section class="card settings-section">
        <div class="settings-section-icon">${icons.store()}</div>
        <div>
          <h3>Empresa</h3>
          <p class="text-muted">Nome exibido no acesso, navega\u00e7\u00e3o e t\u00edtulo do sistema.</p>
        </div>
        <div class="form-group mt-md">
          <label class="form-label">Nome da empresa</label>
          <input class="form-control" type="text" id="config-nome-empresa" maxlength="120"
            value="${escapeHtml(configValue('nome_empresa', 'Sistema de Gest\u00e3o'))}">
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
      nome_empresa: container.querySelector('#config-nome-empresa').value.trim(),
      desconto_maximo: parseFloat(container.querySelector('#config-desconto').value),
    };

    if (!valores.nome_empresa || valores.nome_empresa.length > 120) {
      showToast('Informe um nome de empresa com at\u00e9 120 caracteres', 'error');
      return;
    }

    const percentuais = [valores.desconto_maximo];
    if (percentuais.some((valor) => !Number.isFinite(valor) || valor < 0)) {
      showToast('Informe percentuais v\u00e1lidos', 'error');
      return;
    }

    try {
      await Promise.all(
        Object.entries(valores).map(([chave, valor]) =>
          api.put(`/configuracoes/${chave}`, { valor: String(valor) })
        )
      );
      configuracoes = arrayFrom(await api.get('/configuracoes'));
      updateCachedAppConfig({ nome_empresa: valores.nome_empresa });
      await loadAppConfig({ force: true });
      showToast('Configura\u00e7\u00f5es atualizadas com sucesso', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function entidadeEndpoint(codigo) {
  return `/configuracoes/entidades-financeiras/${encodeURIComponent(codigo)}`;
}

function openEntidadeFinanceiraModal(entidade, onSaved) {
  const isEdit = Boolean(entidade);
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Código *</label>
        <input class="form-control" id="entidade-codigo" maxlength="50"
          value="${escapeHtml(entidade?.codigo || '')}" placeholder="Ex.: CIELO">
      </div>
      <div class="form-group">
        <label class="form-label">Descrição *</label>
        <input class="form-control" id="entidade-descricao" maxlength="255"
          value="${escapeHtml(entidade?.descricao || '')}" placeholder="Ex.: Cielo Pagamentos">
      </div>
    </div>
  `;

  openModal({
    title: isEdit ? 'Editar entidade financeira' : 'Nova entidade financeira',
    content,
    confirmText: 'Salvar entidade',
    onConfirm: async () => {
      const payload = {
        codigo: content.querySelector('#entidade-codigo').value.trim(),
        descricao: content.querySelector('#entidade-descricao').value.trim(),
      };
      if (!payload.codigo || !payload.descricao) {
        showToast('Informe o código e a descrição', 'error');
        return;
      }

      try {
        if (isEdit) {
          await api.put(entidadeEndpoint(entidade.codigo), payload);
        } else {
          await api.post('/configuracoes/entidades-financeiras', payload);
        }
        closeModal();
        showToast('Entidade financeira salva com sucesso', 'success');
        await onSaved();
      } catch (error) {
        showToast(error.message, 'error');
      }
    },
  });
}

function deleteEntidadeFinanceira(entidade, onDeleted) {
  openModal({
    title: 'Excluir entidade financeira',
    content: `
      <p>Confirma a exclusão de <strong>${escapeHtml(entidade.descricao)}</strong>?</p>
      <p class="text-muted mt-sm">As taxas vinculadas a essa entidade também serão excluídas.</p>
    `,
    confirmText: 'Excluir entidade',
    onConfirm: async () => {
      try {
        await api.del(entidadeEndpoint(entidade.codigo));
        closeModal();
        showToast('Entidade financeira excluída', 'success');
        await onDeleted();
      } catch (error) {
        showToast(error.message, 'error');
      }
    },
  });
}

function openTaxasModal(entidade, onChanged) {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="card mb-lg">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Bandeira *</label>
          <input class="form-control" id="taxa-bandeira" maxlength="100" placeholder="Ex.: Visa">
        </div>
        <div class="form-group">
          <label class="form-label">Taxa (%) *</label>
          <input class="form-control" type="number" id="taxa-percentual"
            min="0" max="100" step="0.01" placeholder="0,00">
        </div>
      </div>
      <div class="financial-rate-form-actions mt-md">
        <button class="btn btn-secondary" id="btn-cancelar-edicao-taxa" type="button" hidden>Cancelar edição</button>
        <button class="btn btn-primary" id="btn-salvar-taxa" type="button">${icons.plus()} Adicionar taxa</button>
      </div>
    </div>
    <div id="taxas-lista"><div class="loading-overlay"><div class="loading-spinner"></div></div></div>
  `;

  openModal({
    title: `Taxas — ${escapeHtml(entidade.descricao)}`,
    content,
    size: 'lg',
    hideFooter: true,
  });

  const bandeiraInput = content.querySelector('#taxa-bandeira');
  const taxaInput = content.querySelector('#taxa-percentual');
  const salvarButton = content.querySelector('#btn-salvar-taxa');
  const cancelarButton = content.querySelector('#btn-cancelar-edicao-taxa');
  const lista = content.querySelector('#taxas-lista');
  let taxas = [];
  let editingId = null;

  function resetForm() {
    editingId = null;
    bandeiraInput.value = '';
    taxaInput.value = '';
    cancelarButton.hidden = true;
    salvarButton.innerHTML = `${icons.plus()} Adicionar taxa`;
    bandeiraInput.focus();
  }

  function renderTaxas() {
    lista.innerHTML = `
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr><th>Bandeira</th><th>Taxa</th><th style="width:100px;">Ações</th></tr>
          </thead>
          <tbody>
            ${taxas.length ? taxas.map((registro) => `
              <tr>
                <td>${escapeHtml(registro.bandeira)}</td>
                <td>${Number(registro.taxa).toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}%</td>
                <td>
                  <div class="actions">
                    <button class="btn-icon" data-edit-taxa="${registro.id}" title="Editar" aria-label="Editar">
                      ${icons.edit()}
                    </button>
                    <button class="btn-icon danger" data-delete-taxa="${registro.id}" title="Excluir" aria-label="Excluir">
                      ${icons.trash2()}
                    </button>
                  </div>
                </td>
              </tr>
            `).join('') : `
              <tr><td colspan="3" class="text-center text-muted" style="padding:40px;">Nenhuma taxa cadastrada</td></tr>
            `}
          </tbody>
        </table>
      </div>
    `;

    lista.querySelectorAll('[data-edit-taxa]').forEach((button) => {
      button.addEventListener('click', () => {
        const registro = taxas.find((item) => item.id === Number(button.dataset.editTaxa));
        if (!registro) return;
        editingId = registro.id;
        bandeiraInput.value = registro.bandeira;
        taxaInput.value = Number(registro.taxa);
        cancelarButton.hidden = false;
        salvarButton.innerHTML = `${icons.save()} Salvar taxa`;
        bandeiraInput.focus();
      });
    });

    lista.querySelectorAll('[data-delete-taxa]').forEach((button) => {
      button.addEventListener('click', async () => {
        const registro = taxas.find((item) => item.id === Number(button.dataset.deleteTaxa));
        if (!registro || !window.confirm(`Excluir a taxa da bandeira ${registro.bandeira}?`)) return;
        try {
          await api.del(`${entidadeEndpoint(entidade.codigo)}/taxas/${registro.id}`);
          showToast('Taxa excluída', 'success');
          await carregarTaxas();
          await onChanged();
        } catch (error) {
          showToast(error.message, 'error');
        }
      });
    });
  }

  async function carregarTaxas() {
    try {
      taxas = arrayFrom(await api.get(`${entidadeEndpoint(entidade.codigo)}/taxas`));
      renderTaxas();
    } catch (error) {
      lista.innerHTML = `<div class="empty-state"><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  cancelarButton.addEventListener('click', resetForm);
  salvarButton.addEventListener('click', async () => {
    const taxaInformada = taxaInput.value.trim();
    const payload = {
      bandeira: bandeiraInput.value.trim(),
      taxa: Number(taxaInformada),
    };
    if (!payload.bandeira || !taxaInformada || !Number.isFinite(payload.taxa)
      || payload.taxa < 0 || payload.taxa > 100) {
      showToast('Informe a bandeira e uma taxa entre 0% e 100%', 'error');
      return;
    }

    try {
      const endpoint = `${entidadeEndpoint(entidade.codigo)}/taxas`;
      if (editingId) {
        await api.put(`${endpoint}/${editingId}`, payload);
      } else {
        await api.post(endpoint, payload);
      }
      showToast('Taxa salva com sucesso', 'success');
      resetForm();
      await carregarTaxas();
      await onChanged();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  carregarTaxas();
}

async function renderEntidadesFinanceiras(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Entidades financeiras</h1>
        <p class="page-subtitle">Cadastre operadoras, bancos e as taxas aplicadas por bandeira.</p>
      </div>
      <button class="btn btn-primary" id="btn-nova-entidade">${icons.plus()} Nova entidade</button>
    </div>
    <div id="entidades-financeiras-table"><div class="loading-overlay"><div class="loading-spinner"></div></div></div>
  `;

  const tableContainer = container.querySelector('#entidades-financeiras-table');
  let table = null;

  async function carregar() {
    try {
      entidadesFinanceiras = arrayFrom(await api.get('/configuracoes/entidades-financeiras'));
      if (table) {
        table.update(entidadesFinanceiras);
        return;
      }
      table = createTable(tableContainer, {
        columns: [
          { key: 'codigo', label: 'Código' },
          { key: 'descricao', label: 'Descrição' },
          {
            key: 'quantidade_taxas',
            label: 'Bandeiras cadastradas',
            render: (value) => String(Number(value) || 0),
          },
        ],
        data: entidadesFinanceiras,
        searchable: true,
        searchPlaceholder: 'Buscar entidade financeira...',
        actions: [
          {
            icon: icons.creditCard(),
            label: 'Taxas',
            title: 'Gerenciar taxas',
            showLabel: true,
            onClick: (entidade) => openTaxasModal(entidade, carregar),
          },
          {
            icon: icons.edit(),
            title: 'Editar',
            onClick: (entidade) => openEntidadeFinanceiraModal(entidade, carregar),
          },
          {
            icon: icons.trash2(),
            title: 'Excluir',
            class: 'danger',
            onClick: (entidade) => deleteEntidadeFinanceira(entidade, carregar),
          },
        ],
      });
    } catch (error) {
      tableContainer.innerHTML = `
        <div class="empty-state">
          <h4>Não foi possível carregar as entidades financeiras</h4>
          <p>${escapeHtml(error.message)}</p>
        </div>
      `;
    }
  }

  container.querySelector('#btn-nova-entidade').addEventListener('click', () => {
    openEntidadeFinanceiraModal(null, carregar);
  });
  await carregar();
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
      <button class="tab-btn active" data-tab="gerais">Gerais</button>
      <button class="tab-btn" data-tab="entidades-financeiras">Entidades financeiras</button>
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
    if (aba === 'entidades-financeiras') renderEntidadesFinanceiras(conteudo);
    if (aba === 'usuarios') renderUsuarios(conteudo);
    if (aba === 'comissoes') renderComissoes(conteudo);
  }

  container.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => trocarAba(button.dataset.tab));
  });
  trocarAba('gerais');
}
