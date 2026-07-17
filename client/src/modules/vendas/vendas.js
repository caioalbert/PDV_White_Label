import api from '../../api.js';
import icons from '../../icons.js';
import {
  getCurrentLojaId,
  getUser,
  hasPermission,
  isAdmin,
} from '../../auth.js';
import {
  formatCurrency,
  formatCPFCNPJ,
  formatDate,
  formatDateTime,
  formatPhone,
  getUnidadeLabel,
  maskInput,
} from '../../utils.js';
import {
  DEFAULT_PRODUCT_CATEGORIES,
  loadProductCategories,
  productCategoryLabel,
  renderCategoryFilterButtons,
} from '../../productCategories.js';
import { createTable } from '../../components/table.js';
import { closeModal, openModal } from '../../components/modal.js';
import { showToast } from '../../components/toast.js';

let produtos = [];
let categoriasProduto = [...DEFAULT_PRODUCT_CATEGORIES];
let lojas = [];
let estoque = [];
let estoqueOutrasLojas = new Map();
let configuracoes = {};
let carrinho = [];
let lojaId = null;
let clienteSelecionado = null;
let pendenciasCliente = null;
let documentoClienteNaoEncontrado = '';
let caixaAtual = null;
let caixaPendente = null;
let produtoSelecionadoId = null;
let itemCarrinhoSelecionado = null;
let pdvKeyboardCleanup = null;

function arrayFrom(response) {
  return response?.data || response || [];
}

function configNumber(chave, fallback) {
  const valor = configuracoes[chave];
  const numero = parseFloat(valor);
  return Number.isFinite(numero) ? numero : fallback;
}

function formaPagamentoLabel(forma) {
  const labels = {
    pix: 'PIX',
    dinheiro: 'Dinheiro',
    debito: 'Cartão Débito',
    credito: 'Cartão Crédito',
    misto: 'Pagamento dividido',
  };
  return labels[forma] || 'Não informado';
}

function statusPagamentoLabel(status) {
  const labels = {
    aguardando_pagamento: 'Aguardando pagamento',
    parcial: 'Pagamento parcial',
    pago: 'Pago',
  };
  return labels[status] || status;
}

async function loadBaseData() {
  const [produtosRes, lojasRes, configsRes, categoriasRes] = await Promise.all([
    api.get('/produtos?ativo=true'),
    api.get('/lojas?tipo=loja&situacao=ativa'),
    api.get('/configuracoes'),
    loadProductCategories(),
  ]);

  produtos = arrayFrom(produtosRes);
  categoriasProduto = categoriasRes;
  lojas = arrayFrom(lojasRes).filter((loja) => loja.situacao === 'ativa');

  if (!isAdmin()) {
    lojas = lojas.filter((loja) => loja.id == getUser()?.loja_id);
  }

  configuracoes = Object.fromEntries(
    arrayFrom(configsRes).map((item) => [item.chave, item.valor])
  );

  const lojaPreferida = getCurrentLojaId();
  lojaId = lojas.some((loja) => loja.id == lojaPreferida)
    ? lojaPreferida
    : lojas[0]?.id || null;
}

async function loadEstoque() {
  if (!lojaId) {
    estoque = [];
    estoqueOutrasLojas = new Map();
    return;
  }

  const [estoqueAtual, outrasLojas] = await Promise.all([
    api.get(`/estoque?loja_id=${lojaId}`),
    api.get(`/estoque/outras-lojas?loja_id=${lojaId}`),
  ]);

  estoque = arrayFrom(estoqueAtual);
  estoqueOutrasLojas = arrayFrom(outrasLojas).reduce((map, item) => {
    const atual = map.get(item.produto_id) || [];
    atual.push(item);
    map.set(item.produto_id, atual);
    return map;
  }, new Map());
}

async function loadCaixa() {
  if (!lojaId) {
    caixaAtual = null;
    caixaPendente = null;
    return;
  }

  try {
    const caixa = await api.get(`/financeiro/caixa?loja_id=${lojaId}`);
    caixaAtual = caixa?.aberto_hoje === false ? null : caixa;
    caixaPendente = caixa?.aberto_hoje === false ? caixa : null;
  } catch {
    caixaAtual = null;
    caixaPendente = null;
  }
}

function estoqueProduto(produtoId) {
  return estoque.find((item) => item.produto_id == produtoId);
}

function adicionarProduto(produto, quantidade = 1) {
  const saldo = parseFloat(estoqueProduto(produto.id)?.quantidade || 0);
  const preco = parseFloat(produto.preco_venda || 0);
  const item = carrinho.find((atual) => atual.produto_id === produto.id);
  const quantidadeInformada = parseFloat(quantidade);

  if (saldo <= 0) {
    showToast('Estoque insuficiente para esta loja', 'warning');
    return false;
  }

  if (!Number.isFinite(preco) || preco <= 0) {
    showToast('Produto sem preço cadastrado', 'warning');
    return false;
  }

  if (!Number.isFinite(quantidadeInformada) || quantidadeInformada <= 0) {
    showToast('Informe uma quantidade válida', 'warning');
    return false;
  }

  if (item) {
    if (item.quantidade + quantidadeInformada > saldo) {
      showToast(`Estoque insuficiente. Disponível: ${saldo}`, 'warning');
      return false;
    }
    item.quantidade += quantidadeInformada;
  } else {
    if (quantidadeInformada > saldo) {
      showToast(`Estoque insuficiente. Disponível: ${saldo}`, 'warning');
      return false;
    }
    carrinho.push({
      produto_id: produto.id,
      nome: produto.nome,
      categoria: produto.categoria,
      categoria_nome: produto.categoria_nome,
      unidade: produto.unidade,
      preco_unitario: preco,
      quantidade: quantidadeInformada,
      saldo,
    });
  }

  itemCarrinhoSelecionado = produto.id;
  return true;
}

function calcularTotais(descontoPercentual = 0) {
  const subtotal = carrinho.reduce(
    (total, item) => total + item.quantidade * item.preco_unitario,
    0
  );
  const desconto = subtotal * (descontoPercentual / 100);

  return {
    subtotal,
    desconto,
    total: subtotal - desconto,
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function saldoPendenteVenda(venda) {
  if (venda.saldo_pendente != null) return Math.max(parseFloat(venda.saldo_pendente) || 0, 0);
  const totalBase = Math.max(
    (parseFloat(venda.subtotal) || 0) - (parseFloat(venda.desconto_valor) || 0),
    0
  );
  return Math.max(totalBase - (parseFloat(venda.valor_pago) || 0), 0);
}

async function abrirPagamentoVenda(vendaInicial, onUpdate) {
  let venda = vendaInicial.pagamentos
    ? vendaInicial
    : await api.get(`/vendas/${vendaInicial.id}`);
  let formaPagamento = 'pix';

  const content = document.createElement('div');
  openModal({
    title: `Recebimento da venda #${venda.id}`,
    content,
    size: 'lg',
    hideFooter: true,
  });

  function taxaPercentualAtual() {
    if (formaPagamento === 'debito') return configNumber('taxa_debito', 1.5);
    if (formaPagamento === 'credito') return configNumber('taxa_credito', 3.5);
    return 0;
  }

  function atualizarPrevia() {
    const valorInput = content.querySelector('#pagamento-valor');
    const recebidoInput = content.querySelector('#pagamento-valor-recebido');
    const valor = Math.max(parseFloat(valorInput?.value) || 0, 0);
    const taxa = valor * (taxaPercentualAtual() / 100);
    const cobrado = valor + taxa;
    const recebido = Math.max(parseFloat(recebidoInput?.value) || 0, 0);

    content.querySelector('[data-pagamento-taxa]').textContent = formatCurrency(taxa);
    content.querySelector('[data-pagamento-cobrado]').textContent = formatCurrency(cobrado);
    content.querySelector('[data-pagamento-troco]').textContent =
      formatCurrency(formaPagamento === 'dinheiro' ? Math.max(recebido - valor, 0) : 0);
  }

  function render() {
    const saldo = saldoPendenteVenda(venda);
    const pagamentos = venda.pagamentos || [];
    const pago = saldo <= 0.009;

    content.innerHTML = `
      <div class="payment-modal-summary">
        <div>
          <span>Total dos produtos</span>
          <strong>${formatCurrency((parseFloat(venda.subtotal) || 0) - (parseFloat(venda.desconto_valor) || 0))}</strong>
        </div>
        <div>
          <span>Valor pago</span>
          <strong>${formatCurrency(venda.valor_pago)}</strong>
        </div>
        <div class="payment-modal-balance ${pago ? 'paid' : ''}">
          <span>Saldo pendente</span>
          <strong>${formatCurrency(saldo)}</strong>
        </div>
      </div>

      <div class="payment-status-line">
        <span class="badge ${pago ? 'badge-success' : venda.status_pagamento === 'parcial' ? 'badge-warning' : 'badge-neutral'}">
          ${statusPagamentoLabel(venda.status_pagamento)}
        </span>
        <span>O pagamento é registrado manualmente, sem confirmação bancária.</span>
      </div>

      ${pagamentos.length ? `
        <div class="payment-history">
          <h4>Pagamentos registrados</h4>
          ${pagamentos.map((pagamento) => `
            <div class="payment-history-row">
              <div>
                <strong>${formaPagamentoLabel(pagamento.forma_pagamento)}</strong>
                <small>${formatDateTime(pagamento.created_at)}</small>
              </div>
              <div>
                <strong>${formatCurrency(pagamento.valor)}</strong>
                ${parseFloat(pagamento.taxa_valor) > 0
                  ? `<small>Taxa: ${formatCurrency(pagamento.taxa_valor)}</small>`
                  : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${!pago ? `
        <div class="payment-entry">
          <div class="pdv-field-heading">
            <span>Registrar pagamento</span>
          </div>
          <div class="payment-methods" id="modal-formas-pagamento">
            <button class="payment-method active" data-forma="pix">${icons.circleDollarSign()} PIX</button>
            <button class="payment-method" data-forma="dinheiro">${icons.banknote()} Dinheiro</button>
            <button class="payment-method" data-forma="debito">${icons.creditCard()} Débito</button>
            <button class="payment-method" data-forma="credito">${icons.creditCard()} Crédito</button>
          </div>
          <div class="payment-entry-fields">
            <label>
              <span>Valor deste pagamento</span>
              <input class="form-control" id="pagamento-valor" type="number" min="0.01" max="${saldo}" step="0.01" value="${saldo.toFixed(2)}">
            </label>
            <label class="payment-cash-received" hidden>
              <span>Valor recebido em dinheiro</span>
              <input class="form-control" id="pagamento-valor-recebido" type="number" min="0" step="0.01" value="${saldo.toFixed(2)}">
            </label>
          </div>
          <div class="payment-preview">
            <span>Taxa: <strong data-pagamento-taxa>${formatCurrency(0)}</strong></span>
            <span>Total cobrado: <strong data-pagamento-cobrado>${formatCurrency(saldo)}</strong></span>
            <span>Troco: <strong data-pagamento-troco>${formatCurrency(0)}</strong></span>
          </div>
          <button class="btn btn-primary btn-block" id="btn-registrar-pagamento" type="button">
            ${icons.plus()} Adicionar pagamento
          </button>
        </div>
      ` : `
        <div class="payment-complete-message">
          ${icons.check()}
          <div>
            <strong>Pagamento concluído</strong>
            <span>A venda está totalmente quitada.</span>
          </div>
        </div>
      `}
    `;

    if (pago) return;

    const valorInput = content.querySelector('#pagamento-valor');
    const recebidoInput = content.querySelector('#pagamento-valor-recebido');
    const recebidoLabel = content.querySelector('.payment-cash-received');

    content.querySelectorAll('[data-forma]').forEach((button) => {
      button.addEventListener('click', () => {
        formaPagamento = button.dataset.forma;
        content.querySelectorAll('[data-forma]').forEach((item) => {
          item.classList.toggle('active', item === button);
        });
        recebidoLabel.hidden = formaPagamento !== 'dinheiro';
        if (formaPagamento === 'dinheiro') recebidoInput.value = valorInput.value;
        atualizarPrevia();
      });
    });

    valorInput.addEventListener('input', () => {
      if (formaPagamento === 'dinheiro') recebidoInput.value = valorInput.value;
      atualizarPrevia();
    });
    recebidoInput.addEventListener('input', atualizarPrevia);

    content.querySelector('#btn-registrar-pagamento').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const valor = parseFloat(valorInput.value);
      if (!Number.isFinite(valor) || valor <= 0 || valor > saldo + 0.009) {
        showToast(`Informe um valor entre R$ 0,01 e ${formatCurrency(saldo)}`, 'warning');
        valorInput.focus();
        return;
      }

      button.disabled = true;
      try {
        venda = await api.post(`/vendas/${venda.id}/pagamentos`, {
          forma_pagamento: formaPagamento,
          valor,
          valor_recebido: formaPagamento === 'dinheiro'
            ? parseFloat(recebidoInput.value) || valor
            : undefined,
        });
        showToast('Pagamento registrado', 'success');
        onUpdate?.(venda);
        render();
      } catch (error) {
        showToast(error.message || 'Erro ao registrar pagamento', 'error');
      } finally {
        button.disabled = false;
      }
    });

    atualizarPrevia();
    requestAnimationFrame(() => valorInput.focus());
  }

  render();
}

function abrirCadastroRapidoCliente(documento, onSaved) {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label" for="cliente-rapido-nome">Nome *</label>
      <input class="form-control" id="cliente-rapido-nome" autocomplete="name">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="cliente-rapido-documento">CPF/CNPJ</label>
        <input
          class="form-control"
          id="cliente-rapido-documento"
          value="${escapeHtml(formatCPFCNPJ(documento))}"
          readonly
        >
      </div>
      <div class="form-group">
        <label class="form-label" for="cliente-rapido-telefone">Telefone</label>
        <input
          class="form-control"
          id="cliente-rapido-telefone"
          type="tel"
          inputmode="tel"
          maxlength="15"
          placeholder="(00) 00000-0000"
        >
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="cliente-rapido-endereco">Endereço</label>
      <input class="form-control" id="cliente-rapido-endereco" autocomplete="street-address">
    </div>
    <p class="text-muted text-small">
      O cadastro é opcional e não interfere na finalização da venda.
    </p>
  `;

  maskInput(content.querySelector('#cliente-rapido-telefone'), 'phone');

  openModal({
    title: 'Cadastrar cliente',
    content,
    confirmText: 'Cadastrar e selecionar',
    onConfirm: async () => {
      const nome = content.querySelector('#cliente-rapido-nome').value.trim();
      if (!nome) {
        showToast('Informe o nome do cliente', 'error');
        return;
      }

      try {
        const cliente = await api.post('/clientes', {
          nome,
          cpf_cnpj: formatCPFCNPJ(documento),
          telefone: content.querySelector('#cliente-rapido-telefone').value.trim(),
          endereco: content.querySelector('#cliente-rapido-endereco').value.trim(),
          observacoes: '',
        });
        closeModal();
        onSaved(cliente);
        showToast('Cliente cadastrado e selecionado', 'success');
      } catch (error) {
        showToast(error.message || 'Erro ao cadastrar cliente', 'error');
      }
    },
  });

  requestAnimationFrame(() => content.querySelector('#cliente-rapido-nome')?.focus());
}

function renderPdv(container) {
  pdvKeyboardCleanup?.();

  const descontoMaximo = configNumber('desconto_maximo', 20);
  const usuario = getUser();
  let categoria = '';
  let produtosFiltrados = [];
  let clientePainelAberto = false;
  let tipoVenda = 'varejo';

  container.innerHTML = `
    <div class="pdv-screen">
      <header class="pdv-operation-header">
        <div>
          <div class="pdv-operation-label">Operação de balcão</div>
          <div class="pdv-context-chips" id="pdv-contexto"></div>
        </div>
        <div class="pdv-header-actions">
          <label class="pdv-sale-type">
            <span>Tipo</span>
            <select id="venda-tipo">
              <option value="varejo">Varejo</option>
              <option value="atacado">Atacado</option>
            </select>
          </label>
          <div class="pdv-more-actions">
            <button class="btn btn-ghost" id="btn-mais-acoes" type="button">
              ${icons.moreHorizontal()} Mais ações
            </button>
            <div class="pdv-actions-menu" id="pdv-acoes-menu">
              <button type="button" data-acao="cliente">${icons.userPlus()} Identificar cliente</button>
              <button type="button" data-acao="historico">${icons.receipt()} Histórico de vendas</button>
              <button type="button" class="danger" data-acao="esvaziar">${icons.trash2()} Esvaziar carrinho</button>
            </div>
          </div>
        </div>
      </header>

      <div class="pdv-layout">
        <section class="pdv-products card">
          <div class="pdv-main-search">
            ${icons.search()}
            <input
              id="pdv-busca"
              autocomplete="off"
              placeholder="Buscar produto por nome, código ou código de barras"
              aria-label="Buscar produto"
            >
            <kbd>F2</kbd>
          </div>

          <div class="pdv-customer-card" id="pdv-cliente-card"></div>

          <div class="filter-tabs compact-tabs" id="pdv-categorias">
            ${renderCategoryFilterButtons(categoriasProduto)}
          </div>

          <div class="pdv-product-list-header">
            <span>Produtos</span>
            <span id="pdv-resultados-count"></span>
          </div>
          <div class="pdv-products-scroll" id="pdv-produtos-lista" role="listbox"></div>
        </section>

        <aside class="pdv-cart">
          <div class="pdv-cart-header">
            <div>
              <strong>Carrinho</strong>
              <span id="pdv-itens-count">0 itens</span>
            </div>
            <button class="btn btn-ghost btn-sm pdv-clear-cart" id="btn-esvaziar-carrinho" type="button">
              ${icons.trash2()} Esvaziar
            </button>
          </div>

          <div class="pdv-cart-items" id="pdv-carrinho"></div>

          <div class="pdv-cart-footer">
            <div class="pdv-discount-section">
              <div class="pdv-field-heading">
                <label for="venda-desconto">Desconto (%)</label>
                <kbd>F4</kbd>
              </div>
              <div class="pdv-discount-row">
                <input class="form-control" type="number" id="venda-desconto" min="0" step="0.01" value="0">
                <span>Limite: ${descontoMaximo}%</span>
              </div>
              <div id="pdv-desconto-alerta"></div>
            </div>

            <div class="pdv-financial-summary" id="pdv-resumo"></div>
            <div class="pdv-payment-note">
              ${icons.info()} O pagamento pode ser registrado agora ou posteriormente.
            </div>
            <div class="pdv-validation-message" id="pdv-validacao"></div>
            <button class="pdv-finalize-button" id="btn-finalizar-venda" type="button">
              ${icons.check()}
              <span>Concluir venda</span>
              <kbd>F8</kbd>
            </button>
          </div>
        </aside>
      </div>

      <footer class="pdv-shortcuts">
        <span><kbd>F2</kbd> Buscar</span>
        <span><kbd>Enter</kbd> Confirmar quantidade</span>
        <span><kbd>+</kbd>/<kbd>-</kbd> Quantidade</span>
        <span><kbd>F4</kbd> Desconto</span>
        <span><kbd>F8</kbd> Concluir venda</span>
      </footer>
    </div>
  `;

  const buscaInput = container.querySelector('#pdv-busca');
  const produtosLista = container.querySelector('#pdv-produtos-lista');
  const carrinhoEl = container.querySelector('#pdv-carrinho');
  const descontoInput = container.querySelector('#venda-desconto');
  const clienteCard = container.querySelector('#pdv-cliente-card');
  const finalizarButton = container.querySelector('#btn-finalizar-venda');
  const menuAcoes = container.querySelector('#pdv-acoes-menu');

  function renderContexto() {
    const loja = lojas.find((item) => item.id == lojaId);
    const dataVenda = formatDate(new Date());
    const caixaLabel = caixaAtual?.id
      ? String(caixaAtual.id).padStart(2, '0')
      : caixaPendente
        ? 'Pendente'
        : 'Fechado';

    container.querySelector('#pdv-contexto').innerHTML = `
      <span class="pdv-context-chip primary">
        ${icons.store()} Loja: <strong>${escapeHtml(loja?.nome || 'Não selecionada')}</strong>
        ${isAdmin() ? `
          <select id="pdv-loja-contexto" aria-label="Selecionar loja">
            ${lojas.map((item) => `
              <option value="${item.id}" ${item.id == lojaId ? 'selected' : ''}>${escapeHtml(item.nome)}</option>
            `).join('')}
          </select>
        ` : ''}
      </span>
      <span class="pdv-context-chip ${caixaAtual ? 'success' : 'warning'}">
        ${icons.wallet()} Caixa: <strong>${caixaLabel}</strong>
      </span>
      <span class="pdv-context-chip">
        ${icons.calendar()} Referente: <strong>${dataVenda}</strong>
      </span>
      <span class="pdv-context-chip">
        ${icons.user()} Vendedor: <strong>${escapeHtml(usuario?.nome || 'Usuário')}</strong>
      </span>
    `;

    container.querySelector('#pdv-loja-contexto')?.addEventListener('change', async (event) => {
      lojaId = parseInt(event.target.value, 10);
      carrinho = [];
      itemCarrinhoSelecionado = null;
      await Promise.all([loadEstoque(), loadCaixa()]);
      renderContexto();
      renderProdutos();
      renderCarrinho();
    });
  }

  async function carregarPendenciasCliente() {
    if (!clienteSelecionado?.id) {
      pendenciasCliente = null;
      return;
    }

    try {
      pendenciasCliente = await api.get(`/clientes/${clienteSelecionado.id}/pendencias`);
    } catch {
      pendenciasCliente = null;
    }
  }

  function renderClienteCard() {
    const documento = formatCPFCNPJ(clienteSelecionado?.cpf_cnpj || '');

    clienteCard.innerHTML = `
      <div class="pdv-customer-summary">
        <div class="pdv-customer-avatar">${icons.user()}</div>
        <div class="pdv-customer-copy">
          <span>Cliente</span>
          <strong>${escapeHtml(clienteSelecionado?.nome || 'Consumidor final')}</strong>
          <small>${clienteSelecionado ? escapeHtml(documento || 'Cliente identificado') : 'Venda sem identificação'}</small>
        </div>
        ${clienteSelecionado ? `
          <button class="btn btn-ghost btn-sm" id="btn-remover-cliente" type="button">
            ${icons.x()} Remover
          </button>
        ` : ''}
        <button class="btn btn-outline btn-sm" id="btn-identificar-cliente" type="button">
          ${icons.userPlus()} ${clienteSelecionado ? 'Alterar cliente' : 'Identificar cliente'}
        </button>
      </div>
      ${pendenciasCliente?.quantidade ? `
        <div class="pdv-customer-debt-alert">
          ${icons.alertTriangle()}
          <div>
            <strong>Cliente com compra em aberto</strong>
            <span>
              ${pendenciasCliente.quantidade} pedido${pendenciasCliente.quantidade === 1 ? '' : 's'}
              · saldo ${formatCurrency(pendenciasCliente.saldo_total)}
            </span>
          </div>
        </div>
      ` : ''}
      ${clientePainelAberto ? `
        <div class="pdv-customer-panel">
          <div class="pdv-customer-search">
            <input
              class="form-control"
              id="venda-cliente-documento"
              inputmode="numeric"
              maxlength="18"
              placeholder="CPF ou CNPJ"
              value="${escapeHtml(documentoClienteNaoEncontrado || documento)}"
              autocomplete="off"
            >
            <button class="btn btn-secondary" id="btn-buscar-cliente" type="button">
              ${icons.search()} Buscar
            </button>
          </div>
          <div class="pdv-customer-status" id="venda-cliente-status"></div>
        </div>
      ` : ''}
    `;

    clienteCard.querySelector('#btn-identificar-cliente').addEventListener('click', () => {
      clientePainelAberto = !clientePainelAberto;
      renderClienteCard();
      requestAnimationFrame(() => clienteCard.querySelector('#venda-cliente-documento')?.focus());
    });

    clienteCard.querySelector('#btn-remover-cliente')?.addEventListener('click', () => {
      clienteSelecionado = null;
      pendenciasCliente = null;
      documentoClienteNaoEncontrado = '';
      clientePainelAberto = false;
      renderClienteCard();
    });

    if (!clientePainelAberto) return;

    const documentoInput = clienteCard.querySelector('#venda-cliente-documento');
    const buscarButton = clienteCard.querySelector('#btn-buscar-cliente');
    const statusEl = clienteCard.querySelector('#venda-cliente-status');
    maskInput(documentoInput, 'cpf_cnpj');

    function renderStatus() {
      if (clienteSelecionado) {
        statusEl.innerHTML = `
          <span class="pdv-inline-success">
            ${icons.check()} ${escapeHtml(clienteSelecionado.nome)} selecionado
          </span>
        `;
        return;
      }

      if (documentoClienteNaoEncontrado) {
        statusEl.innerHTML = `
          <div class="pdv-customer-not-found">
            <span>Cliente não encontrado. A venda pode continuar sem identificação.</span>
            ${hasPermission('clientes') ? `
              <button class="btn btn-outline btn-sm" id="btn-cadastrar-cliente" type="button">
                ${icons.plus()} Cadastrar
              </button>
            ` : ''}
          </div>
        `;
        statusEl.querySelector('#btn-cadastrar-cliente')?.addEventListener('click', () => {
          abrirCadastroRapidoCliente(documentoClienteNaoEncontrado, async (cliente) => {
            clienteSelecionado = cliente;
            await carregarPendenciasCliente();
            documentoClienteNaoEncontrado = '';
            clientePainelAberto = false;
            renderClienteCard();
          });
        });
        return;
      }

      statusEl.innerHTML = '<span class="text-muted text-small">A identificação é opcional.</span>';
    }

    async function buscarCliente() {
      const documentoBusca = documentoInput.value.replace(/\D/g, '');
      if (![11, 14].includes(documentoBusca.length)) {
        showToast('Informe um CPF com 11 dígitos ou CNPJ com 14 dígitos', 'warning');
        documentoInput.focus();
        return;
      }

      buscarButton.disabled = true;
      try {
        const encontrados = arrayFrom(
          await api.get(`/clientes?documento=${encodeURIComponent(documentoBusca)}`)
        );
        clienteSelecionado = encontrados[0] || null;
        documentoClienteNaoEncontrado = clienteSelecionado ? '' : documentoBusca;
        if (clienteSelecionado) {
          await carregarPendenciasCliente();
          clientePainelAberto = false;
        } else {
          pendenciasCliente = null;
        }
        renderClienteCard();
      } catch (error) {
        showToast(error.message || 'Erro ao buscar cliente', 'error');
      } finally {
        buscarButton.disabled = false;
      }
    }

    documentoInput.addEventListener('input', () => {
      documentoClienteNaoEncontrado = '';
      statusEl.innerHTML = '<span class="text-muted text-small">A identificação é opcional.</span>';
    });
    documentoInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        buscarCliente();
      }
    });
    buscarButton.addEventListener('click', buscarCliente);
    renderStatus();
  }

  function produtoEstado(produto) {
    const registro = estoqueProduto(produto.id);
    const saldo = parseFloat(registro?.quantidade || 0);
    const minimo = parseFloat(produto.estoque_minimo || registro?.estoque_minimo || 0);
    const preco = parseFloat(produto.preco_venda || 0);

    if (saldo <= 0) return { key: 'out', label: 'Sem estoque', saldo, minimo, preco };
    if (minimo > 0 && saldo <= minimo) return { key: 'low', label: 'Estoque baixo', saldo, minimo, preco };
    return { key: 'normal', label: 'Em estoque', saldo, minimo, preco };
  }

  function produtoCorrespondeBusca(produto, termo) {
    if (!termo) return true;
    const busca = termo.toLowerCase();
    return [
      produto.nome,
      produto.codigo_interno,
      produto.codigo_barras,
      String(produto.id),
    ].some((valor) => String(valor || '').toLowerCase().includes(busca));
  }

  function quantidadeStep(produto) {
    return ['kg', 'metro'].includes(produto.unidade) ? '0.01' : '1';
  }

  function selecionarProduto(produtoId, focusQuantidade = false) {
    produtoSelecionadoId = parseInt(produtoId, 10);
    produtosLista.querySelectorAll('[data-produto-row]').forEach((row) => {
      const selecionado = parseInt(row.dataset.produtoRow, 10) === produtoSelecionadoId;
      row.classList.toggle('selected', selecionado);
      row.setAttribute('aria-selected', selecionado ? 'true' : 'false');
    });

    if (focusQuantidade) {
      const input = produtosLista.querySelector(
        `[data-quantidade-produto="${produtoSelecionadoId}"]`
      );
      input?.focus();
      input?.select();
    }
  }

  function adicionarProdutoDaLista(produtoId) {
    const produto = produtos.find((item) => item.id == produtoId);
    const quantidadeInput = produtosLista.querySelector(
      `[data-quantidade-produto="${produtoId}"]`
    );
    if (!produto || !quantidadeInput) return;

    selecionarProduto(produto.id);
    if (adicionarProduto(produto, quantidadeInput.value)) {
      quantidadeInput.value = '1';
      renderCarrinho();
      buscaInput.focus();
      buscaInput.select();
    } else {
      quantidadeInput.focus();
      quantidadeInput.select();
    }
  }

  function renderProdutos() {
    const termo = buscaInput.value.trim();
    produtosFiltrados = produtos.filter((produto) =>
      (!categoria || produto.categoria === categoria)
      && produtoCorrespondeBusca(produto, termo)
    );

    if (!produtosFiltrados.some((produto) => produto.id === produtoSelecionadoId)) {
      produtoSelecionadoId = produtosFiltrados[0]?.id || null;
    }

    container.querySelector('#pdv-resultados-count').textContent =
      `${produtosFiltrados.length} resultado${produtosFiltrados.length === 1 ? '' : 's'}`;

    produtosLista.innerHTML = produtosFiltrados.length
      ? produtosFiltrados.map((produto) => {
        const estado = produtoEstado(produto);
        const semPreco = !Number.isFinite(estado.preco) || estado.preco <= 0;
        const bloqueado = semPreco || estado.saldo <= 0;
        const outrasLojas = estoqueOutrasLojas.get(produto.id) || [];
        return `
          <div
            class="pdv-product-item stock-${estado.key} ${semPreco ? 'no-price' : ''} ${produto.id === produtoSelecionadoId ? 'selected' : ''}"
            data-produto-row="${produto.id}"
            role="option"
            aria-selected="${produto.id === produtoSelecionadoId}"
          >
            <div class="pdv-product-thumb">${icons.package2()}</div>
            <div class="pdv-product-main">
              <div class="pdv-product-name">${escapeHtml(produto.nome)}</div>
              <div class="pdv-product-info">
                <span>${escapeHtml(produto.codigo_interno || `#${produto.id}`)}</span>
                <span>${escapeHtml(productCategoryLabel(produto, categoriasProduto))}</span>
                <span>${getUnidadeLabel(produto.unidade)}</span>
              </div>
              <div class="pdv-stock-line">
                <span class="pdv-stock-badge ${estado.key}">${estado.label}</span>
                <span>${estado.saldo} ${getUnidadeLabel(produto.unidade)}</span>
              </div>
              ${estado.saldo <= 0 && outrasLojas.length ? `
                <div class="pdv-other-stock">
                  Disponível em ${outrasLojas.slice(0, 2).map((item) =>
                    `${escapeHtml(item.loja_nome)} (${parseFloat(item.quantidade)})`
                  ).join(', ')}
                </div>
              ` : ''}
            </div>
            <div class="pdv-product-sale">
              ${semPreco
                ? '<span class="badge badge-warning">Sem preço</span>'
                : `<strong>${formatCurrency(estado.preco)}</strong>`}
              <div class="pdv-product-add-controls">
                <label class="pdv-product-quantity">
                  <span>Qtd.</span>
                  <input
                    type="number"
                    min="${quantidadeStep(produto)}"
                    max="${estado.saldo}"
                    step="${quantidadeStep(produto)}"
                    value="1"
                    data-quantidade-produto="${produto.id}"
                    aria-label="Quantidade de ${escapeHtml(produto.nome)}"
                    ${bloqueado ? 'disabled' : ''}
                  >
                </label>
                <button
                  class="btn ${bloqueado ? 'btn-secondary' : 'btn-primary'} btn-sm"
                  data-adicionar-produto="${produto.id}"
                  type="button"
                  ${bloqueado ? 'disabled' : ''}
                >
                  ${icons.plus()} Adicionar
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('')
      : `
        <div class="empty-state pdv-empty-state">
          ${icons.search()}
          <h4>Nenhum produto encontrado</h4>
          <p>Revise o nome, código interno ou código de barras.</p>
        </div>
      `;

    produtosLista.querySelectorAll('[data-produto-row]').forEach((row) => {
      row.addEventListener('click', (event) => {
        if (event.target.closest('button, input')) return;
        selecionarProduto(row.dataset.produtoRow, true);
      });
    });

    produtosLista.querySelectorAll('[data-quantidade-produto]').forEach((input) => {
      input.addEventListener('focus', () => selecionarProduto(input.dataset.quantidadeProduto));
      input.addEventListener('click', (event) => event.stopPropagation());
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          adicionarProdutoDaLista(input.dataset.quantidadeProduto);
        }
      });
    });

    produtosLista.querySelectorAll('[data-adicionar-produto]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        adicionarProdutoDaLista(button.dataset.adicionarProduto);
      });
    });
  }

  function alterarQuantidade(index, delta) {
    const item = carrinho[index];
    if (!item) return;
    const novaQuantidade = item.quantidade + delta;

    if (novaQuantidade <= 0) {
      carrinho.splice(index, 1);
    } else if (novaQuantidade > item.saldo) {
      showToast('Estoque insuficiente para esta loja', 'warning');
      return;
    } else {
      item.quantidade = novaQuantidade;
      itemCarrinhoSelecionado = item.produto_id;
    }
    renderCarrinho();
  }

  function renderCarrinho() {
    const quantidadeItens = carrinho.reduce((total, item) => total + item.quantidade, 0);
    container.querySelector('#pdv-itens-count').textContent =
      `${quantidadeItens} ${quantidadeItens === 1 ? 'item' : 'itens'}`;
    carrinhoEl.classList.toggle('is-empty', carrinho.length === 0);

    carrinhoEl.innerHTML = carrinho.length
      ? carrinho.map((item, index) => `
        <article
          class="pdv-cart-item ${item.produto_id === itemCarrinhoSelecionado ? 'selected' : ''}"
          data-cart-item="${index}"
        >
          <div class="pdv-cart-thumb">${icons.package2()}</div>
          <div class="pdv-cart-item-content">
            <div class="pdv-cart-item-top">
              <div>
                <strong>${escapeHtml(item.nome)}</strong>
                <small>${escapeHtml(productCategoryLabel(item, categoriasProduto))} · ${getUnidadeLabel(item.unidade)}</small>
              </div>
              <button class="pdv-cart-item-remove" data-remover="${index}" title="Remover item" aria-label="Remover item">
                ${icons.trash2()}
              </button>
            </div>
            <div class="pdv-cart-item-bottom">
              <div>
                <span class="pdv-unit-price">${formatCurrency(item.preco_unitario)} / ${getUnidadeLabel(item.unidade)}</span>
                <div class="pdv-quantity-control">
                  <button type="button" data-diminuir="${index}" aria-label="Diminuir quantidade">${icons.minus()}</button>
                  <input
                    type="number"
                    min="0.01"
                    max="${item.saldo}"
                    step="0.01"
                    value="${item.quantidade}"
                    data-quantidade="${index}"
                    aria-label="Quantidade de ${escapeHtml(item.nome)}"
                  >
                  <button type="button" data-aumentar="${index}" aria-label="Aumentar quantidade">${icons.plus()}</button>
                </div>
              </div>
              <strong class="pdv-cart-item-subtotal">${formatCurrency(item.quantidade * item.preco_unitario)}</strong>
            </div>
          </div>
        </article>
      `).join('')
      : `
        <div class="empty-state pdv-cart-empty">
          ${icons.shoppingCart()}
          <h4>Nenhum item adicionado</h4>
          <p>Use a busca ou pressione F2 para localizar um produto.</p>
        </div>
      `;

    carrinhoEl.querySelectorAll('[data-cart-item]').forEach((row) => {
      row.addEventListener('click', () => {
        const item = carrinho[parseInt(row.dataset.cartItem, 10)];
        itemCarrinhoSelecionado = item?.produto_id || null;
        renderCarrinho();
      });
    });
    carrinhoEl.querySelectorAll('[data-diminuir]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        alterarQuantidade(parseInt(button.dataset.diminuir, 10), -1);
      });
    });
    carrinhoEl.querySelectorAll('[data-aumentar]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        alterarQuantidade(parseInt(button.dataset.aumentar, 10), 1);
      });
    });
    carrinhoEl.querySelectorAll('[data-quantidade]').forEach((input) => {
      input.addEventListener('click', (event) => event.stopPropagation());
      input.addEventListener('change', () => {
        const index = parseInt(input.dataset.quantidade, 10);
        const quantidade = parseFloat(input.value);
        const item = carrinho[index];
        if (!item) return;
        if (!Number.isFinite(quantidade) || quantidade <= 0) {
          carrinho.splice(index, 1);
        } else if (quantidade > item.saldo) {
          showToast('Estoque insuficiente para esta loja', 'warning');
          item.quantidade = item.saldo;
        } else {
          item.quantidade = quantidade;
          itemCarrinhoSelecionado = item.produto_id;
        }
        renderCarrinho();
      });
    });
    carrinhoEl.querySelectorAll('[data-remover]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        carrinho.splice(parseInt(button.dataset.remover, 10), 1);
        renderCarrinho();
      });
    });

    renderResumo();
  }

  function descontoAtual() {
    return Math.max(parseFloat(descontoInput.value) || 0, 0);
  }

  function getValidation() {
    if (!lojaId) return 'Selecione a loja da venda';
    if (carrinho.length === 0) return 'Adicione pelo menos um produto ao carrinho';
    if (carrinho.some((item) => item.preco_unitario <= 0)) return 'Produto sem preço cadastrado';
    if (carrinho.some((item) => item.quantidade <= 0 || item.quantidade > item.saldo)) {
      return 'Estoque insuficiente para esta loja';
    }
    if (descontoAtual() > descontoMaximo) {
      return 'Desconto acima do permitido. Solicite autorização.';
    }
    return '';
  }

  function renderResumo() {
    const desconto = descontoAtual();
    const totais = calcularTotais(desconto);
    const acimaLimite = desconto > descontoMaximo;
    const alerta = container.querySelector('#pdv-desconto-alerta');

    descontoInput.classList.toggle('error', acimaLimite);
    alerta.innerHTML = acimaLimite ? `
      <div class="pdv-discount-alert">
        ${icons.alertTriangle()}
        <span>Desconto acima do permitido. Solicite autorização.</span>
      </div>
      <input class="form-control" id="venda-desconto-motivo" placeholder="Motivo para autorização">
    ` : '';

    container.querySelector('#pdv-resumo').innerHTML = `
      <div class="pdv-summary-row"><span>Subtotal</span><strong>${formatCurrency(totais.subtotal)}</strong></div>
      <div class="pdv-summary-row"><span>Desconto</span><strong>- ${formatCurrency(totais.desconto)}</strong></div>
      <div class="pdv-total-block">
        <span>TOTAL</span>
        <strong>${formatCurrency(totais.total)}</strong>
      </div>
    `;

    const validation = getValidation();
    container.querySelector('#pdv-validacao').textContent = validation;
    finalizarButton.disabled = Boolean(validation);
    finalizarButton.title = validation || 'Concluir venda';
  }

  function confirmarEsvaziarCarrinho() {
    if (carrinho.length === 0) {
      showToast('Nenhum item adicionado', 'info');
      return;
    }
    openModal({
      title: 'Esvaziar carrinho',
      content: '<p>Remover todos os itens da venda atual?</p>',
      confirmText: 'Esvaziar carrinho',
      onConfirm: () => {
        carrinho = [];
        itemCarrinhoSelecionado = null;
        closeModal();
        renderCarrinho();
        buscaInput.focus();
      },
    });
  }

  async function finalizarVenda() {
    const validation = getValidation();
    if (validation) {
      showToast(validation, 'warning');
      return;
    }

    finalizarButton.disabled = true;
    try {
      const venda = await api.post('/vendas', {
        cliente_id: clienteSelecionado?.id || null,
        loja_id: lojaId,
        tipo: tipoVenda,
        desconto_percentual: descontoAtual(),
        itens: carrinho.map((item) => ({
          produto_id: item.produto_id,
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario,
        })),
      });

      showToast(`Venda #${venda.id} concluída. Pagamento pendente.`, 'success');
      carrinho = [];
      clienteSelecionado = null;
      pendenciasCliente = null;
      documentoClienteNaoEncontrado = '';
      clientePainelAberto = false;
      itemCarrinhoSelecionado = null;
      produtoSelecionadoId = null;
      descontoInput.value = '0';
      await loadEstoque();
      buscaInput.value = '';
      renderClienteCard();
      renderProdutos();
      renderCarrinho();
      await abrirPagamentoVenda(venda);
      buscaInput.focus();
    } catch (error) {
      showToast(error.message || 'Erro ao finalizar venda', 'error');
    } finally {
      renderResumo();
    }
  }

  buscaInput.addEventListener('input', renderProdutos);
  descontoInput.addEventListener('input', renderResumo);
  finalizarButton.addEventListener('click', finalizarVenda);
  container.querySelector('#btn-esvaziar-carrinho').addEventListener('click', confirmarEsvaziarCarrinho);

  container.querySelector('#venda-tipo').addEventListener('change', (event) => {
    tipoVenda = event.target.value;
  });

  container.querySelectorAll('#pdv-categorias [data-categoria]').forEach((button) => {
    button.addEventListener('click', () => {
      container.querySelectorAll('#pdv-categorias [data-categoria]').forEach((item) => {
        item.classList.remove('active');
      });
      button.classList.add('active');
      categoria = button.dataset.categoria;
      renderProdutos();
    });
  });

  container.querySelector('#btn-mais-acoes').addEventListener('click', () => {
    menuAcoes.classList.toggle('open');
  });
  menuAcoes.querySelector('[data-acao="cliente"]').addEventListener('click', () => {
    clientePainelAberto = true;
    menuAcoes.classList.remove('open');
    renderClienteCard();
    requestAnimationFrame(() => clienteCard.querySelector('#venda-cliente-documento')?.focus());
  });
  menuAcoes.querySelector('[data-acao="historico"]').addEventListener('click', () => {
    container.closest('.vendas-page')?.querySelector('[data-tab="historico"]')?.click();
  });
  menuAcoes.querySelector('[data-acao="esvaziar"]').addEventListener('click', () => {
    menuAcoes.classList.remove('open');
    confirmarEsvaziarCarrinho();
  });

  const outsideClick = (event) => {
    if (!event.target.closest('.pdv-more-actions')) menuAcoes.classList.remove('open');
  };
  document.addEventListener('click', outsideClick);

  const keyboardHandler = (event) => {
    if (document.querySelector('.modal-overlay.active')) return;
    const tag = event.target.tagName;
    const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);

    if (event.key === 'F2') {
      event.preventDefault();
      buscaInput.focus();
      buscaInput.select();
      return;
    }
    if (event.key === 'F4') {
      event.preventDefault();
      descontoInput.focus();
      descontoInput.select();
      return;
    }
    if (event.key === 'F8') {
      event.preventDefault();
      finalizarVenda();
      return;
    }
    if (event.key === 'Escape') {
      if (clientePainelAberto) {
        clientePainelAberto = false;
        renderClienteCard();
      } else if (buscaInput.value) {
        buscaInput.value = '';
        renderProdutos();
      } else {
        produtoSelecionadoId = null;
        itemCarrinhoSelecionado = null;
        renderProdutos();
        renderCarrinho();
      }
      return;
    }
    if (event.key === 'Enter' && event.target === buscaInput) {
      event.preventDefault();
      selecionarProduto(produtoSelecionadoId, true);
      return;
    }
    if (!editing && (event.key === '+' || event.code === 'NumpadAdd')) {
      event.preventDefault();
      const index = carrinho.findIndex((item) => item.produto_id === itemCarrinhoSelecionado);
      if (index >= 0) alterarQuantidade(index, 1);
      return;
    }
    if (!editing && (event.key === '-' || event.code === 'NumpadSubtract')) {
      event.preventDefault();
      const index = carrinho.findIndex((item) => item.produto_id === itemCarrinhoSelecionado);
      if (index >= 0) alterarQuantidade(index, -1);
    }
  };
  document.addEventListener('keydown', keyboardHandler);
  pdvKeyboardCleanup = () => {
    document.removeEventListener('keydown', keyboardHandler);
    document.removeEventListener('click', outsideClick);
    pdvKeyboardCleanup = null;
  };

  renderContexto();
  renderClienteCard();
  renderProdutos();
  renderCarrinho();
  requestAnimationFrame(() => buscaInput.focus());
}

function abrirDetalhesVenda(venda) {
  api.get(`/vendas/${venda.id}`)
    .then((detalhes) => {
      const saldo = saldoPendenteVenda(detalhes);
      const overlay = openModal({
        title: `Venda #${detalhes.id}`,
        size: 'lg',
        hideFooter: true,
        content: `
          <div class="info-grid">
            <div><strong>Loja:</strong> ${detalhes.loja_nome}</div>
            <div><strong>Cliente:</strong> ${detalhes.cliente_nome || 'Consumidor não identificado'}</div>
            <div><strong>Status:</strong> ${statusPagamentoLabel(detalhes.status_pagamento)}</div>
            <div><strong>Data:</strong> ${formatDateTime(detalhes.created_at)}</div>
          </div>
          <table class="table mt-md">
            <thead><tr><th>Produto</th><th>Quantidade</th><th>Preço</th><th>Subtotal</th></tr></thead>
            <tbody>
              ${detalhes.itens.map((item) => `
                <tr>
                  <td>${item.produto_nome}</td>
                  <td>${item.quantidade}</td>
                  <td>${formatCurrency(item.preco_unitario)}</td>
                  <td>${formatCurrency(item.subtotal)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="sale-details-total">
            <span>Subtotal: ${formatCurrency(detalhes.subtotal)}</span>
            <span>Desconto: ${formatCurrency(detalhes.desconto_valor)}</span>
            <span>Taxa: ${formatCurrency(detalhes.taxa_cartao)}</span>
            <strong>Total: ${formatCurrency(detalhes.total)}</strong>
          </div>
          <div class="sale-payment-overview">
            <div>
              <span>Recebido</span>
              <strong>${formatCurrency(detalhes.valor_pago)}</strong>
            </div>
            <div>
              <span>Saldo pendente</span>
              <strong>${formatCurrency(saldo)}</strong>
            </div>
            ${saldo > 0.009 ? `
              <button class="btn btn-primary" id="btn-receber-venda" type="button">
                ${icons.wallet()} Registrar pagamento
              </button>
            ` : ''}
          </div>
          ${detalhes.pagamentos?.length ? `
            <div class="payment-history mt-md">
              <h4>Pagamentos</h4>
              ${detalhes.pagamentos.map((pagamento) => `
                <div class="payment-history-row">
                  <div>
                    <strong>${formaPagamentoLabel(pagamento.forma_pagamento)}</strong>
                    <small>${formatDateTime(pagamento.created_at)}</small>
                  </div>
                  <strong>${formatCurrency(pagamento.valor)}</strong>
                </div>
              `).join('')}
            </div>
          ` : ''}
        `,
      });

      overlay.querySelector('#btn-receber-venda')?.addEventListener('click', () => {
        abrirPagamentoVenda(detalhes).catch((error) => {
          showToast(error.message || 'Erro ao abrir pagamento', 'error');
        });
      });
    })
    .catch((error) => showToast(error.message, 'error'));
}

function renderHistorico(container) {
  pdvKeyboardCleanup?.();
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Histórico de Vendas</h1>
        <p class="page-subtitle">Consulte vendas finalizadas por loja e período.</p>
      </div>
    </div>
    <div class="card filters-panel">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Loja</label>
          <select class="form-control" id="historico-loja">
            <option value="">Todas</option>
            ${lojas.map((loja) => `<option value="${loja.id}" ${loja.id == lojaId ? 'selected' : ''}>${loja.nome}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Data inicial</label>
          <input class="form-control" type="date" id="historico-inicio">
        </div>
        <div class="form-group">
          <label class="form-label">Data final</label>
          <input class="form-control" type="date" id="historico-fim">
        </div>
        <div class="form-group form-action">
          <button class="btn btn-primary" id="btn-filtrar-vendas">${icons.filter()} Filtrar</button>
        </div>
      </div>
    </div>
    <div id="vendas-table"></div>
  `;

  const table = createTable(container.querySelector('#vendas-table'), {
    columns: [
      { key: 'id', label: '#' },
      { key: 'created_at', label: 'Data', render: (value) => formatDateTime(value) },
      { key: 'loja_nome', label: 'Loja' },
      { key: 'cliente_nome', label: 'Cliente', render: (value) => value || 'Consumidor' },
      { key: 'tipo', label: 'Tipo', render: (value) => value === 'atacado' ? 'Atacado' : 'Varejo' },
      {
        key: 'status_pagamento',
        label: 'Pagamento',
        render: (value) => `<span class="badge ${
          value === 'pago' ? 'badge-success' : value === 'parcial' ? 'badge-warning' : 'badge-neutral'
        }">${statusPagamentoLabel(value)}</span>`,
      },
      {
        key: 'saldo_pendente',
        label: 'Saldo',
        render: (_value, row) => formatCurrency(saldoPendenteVenda(row)),
      },
      { key: 'total', label: 'Total', render: formatCurrency },
    ],
    data: [],
    searchable: true,
    actions: [
      {
        icon: icons.eye(),
        title: 'Ver venda',
        onClick: abrirDetalhesVenda,
      },
      {
        icon: icons.wallet(),
        title: 'Registrar pagamento',
        show: (row) => saldoPendenteVenda(row) > 0.009,
        onClick: (row) => {
          abrirPagamentoVenda(row, carregar).catch((error) => {
            showToast(error.message || 'Erro ao abrir pagamento', 'error');
          });
        },
      },
    ],
  });

  async function carregar() {
    const params = new URLSearchParams();
    const filtroLoja = container.querySelector('#historico-loja').value;
    const inicio = container.querySelector('#historico-inicio').value;
    const fim = container.querySelector('#historico-fim').value;
    if (filtroLoja) params.set('loja_id', filtroLoja);
    if (inicio) params.set('data_inicio', inicio);
    if (fim) params.set('data_fim', fim);

    try {
      table.update(arrayFrom(await api.get(`/vendas?${params}`)));
    } catch (error) {
      showToast(error.message || 'Erro ao carregar vendas', 'error');
    }
  }

  container.querySelector('#btn-filtrar-vendas').addEventListener('click', carregar);
  carregar();
}

export async function render(container) {
  container.innerHTML = '<div class="loading-overlay"><div class="loading-spinner"></div></div>';
  carrinho = [];
  clienteSelecionado = null;
  pendenciasCliente = null;
  documentoClienteNaoEncontrado = '';
  caixaAtual = null;
  caixaPendente = null;
  produtoSelecionadoId = null;
  itemCarrinhoSelecionado = null;

  try {
    await loadBaseData();
    await Promise.all([loadEstoque(), loadCaixa()]);
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><h4>Não foi possível carregar o PDV</h4><p>${error.message}</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="vendas-page">
      <div class="tab-nav">
        <button class="tab-btn active" data-tab="pdv">Nova venda</button>
        <button class="tab-btn" data-tab="historico">Histórico</button>
      </div>
      <div class="tab-content" id="vendas-conteudo"></div>
    </div>
  `;

  const conteudo = container.querySelector('#vendas-conteudo');

  function trocarAba(aba) {
    container.querySelectorAll('[data-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === aba);
    });
    if (aba === 'pdv') renderPdv(conteudo);
    else renderHistorico(conteudo);
  }

  container.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => trocarAba(button.dataset.tab));
  });

  trocarAba('pdv');
}
