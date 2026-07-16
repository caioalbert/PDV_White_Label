import { expect, test } from '@playwright/test';

const API_URL = 'http://127.0.0.1:3101/api';
const INITIAL_PASSWORD = process.env.E2E_INITIAL_PASSWORD || 'TesteE2E8!';
const NEW_PASSWORD = process.env.E2E_NEW_PASSWORD || 'TesteNova8!';

const data = {
  store: 'Loja E2E',
  supplier: 'Fornecedor E2E',
  rawProduct: 'Gesso em Pó E2E',
  finishedProduct: 'Placa Fabricada E2E',
};

test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => {
    return route.fulfill({ status: 204 });
  });
});

async function clickSidebar(page, route) {
  await page.locator(`a[href="#${route}"]`).click();
  await expect(page).toHaveURL(new RegExp(`#${route.replace('/', '\\/')}$`));
}

async function confirmModal(page) {
  await page.locator('#modal-confirm-btn').click();
}

async function expectToast(page, text) {
  await expect(page.locator('.toast-message').filter({ hasText: text }).last()).toBeVisible();
}

async function apiGet(page, endpoint) {
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const response = await page.request.get(`${API_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(response.ok(), `${endpoint} retornou ${response.status()}`).toBeTruthy();
  return response.json();
}

test('fluxo completo: cadastro, compra, produção, caixa e venda', async ({ page }) => {
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await test.step('primeiro acesso e troca obrigatória de senha', async () => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/#\/login$/);

    await page.locator('#login-usuario').fill('admin');
    await page.locator('#login-senha').fill(INITIAL_PASSWORD);
    await page.locator('#btn-login').click();

    await expect(page).toHaveURL(/#\/alterar-senha$/);
    await page.locator('#current-password').fill(INITIAL_PASSWORD);
    await page.locator('#new-password').fill(NEW_PASSWORD);
    await page.locator('#confirm-password').fill(NEW_PASSWORD);
    await page.locator('#btn-change-password').click();

    await expect(page).toHaveURL(/#\/dashboard$/);
    await expectToast(page, 'Senha alterada com sucesso');
  });

  await test.step('cadastrar loja', async () => {
    await clickSidebar(page, '/lojas');
    await page.locator('#btn-nova-loja').click();
    await page.locator('#loja-nome').fill(data.store);
    await page.locator('#loja-cidade').fill('Fortaleza');
    await page.locator('#loja-tipo').selectOption('loja');
    await page.locator('#loja-situacao').selectOption('ativa');
    await page.locator('#loja-comissao').fill('2');
    await confirmModal(page);

    await expectToast(page, 'Unidade criada com sucesso');
    await expect(page.locator('#lojas-grid')).toContainText(data.store);
  });

  await test.step('cadastrar fornecedor', async () => {
    await clickSidebar(page, '/fornecedores');
    await page.locator('#btn-novo-fornecedor').click();
    await page.locator('#fornecedor-nome').fill(data.supplier);
    await page.locator('#fornecedor-cnpj').fill('12.345.678/0001-99');
    await page.locator('#fornecedor-telefone').fill('(85) 99999-9999');
    await page.locator('#fornecedor-cidade').fill('Fortaleza');
    await confirmModal(page);

    await expectToast(page, 'Fornecedor criado com sucesso');
    await expect(page.locator('#fornecedores-table-container')).toContainText(data.supplier);
  });

  await test.step('cadastrar matéria-prima', async () => {
    await clickSidebar(page, '/produtos');
    await page.locator('#btn-novo-produto').click();
    await page.locator('#prod-nome').fill(data.rawProduct);
    await page.locator('#prod-categoria').selectOption('gesso_convencional');
    await page.locator('#prod-unidade').selectOption('kg');
    await page.locator('#prod-preco').fill('5');
    await page.locator('#prod-estoque-min').fill('100');
    await confirmModal(page);

    await expectToast(page, 'Produto criado com sucesso');
    await expect(page.locator('.data-table')).toContainText(data.rawProduct);
  });

  await test.step('cadastrar produto fabricado e composição', async () => {
    await page.locator('#btn-novo-produto').click();
    await page.locator('#prod-nome').fill(data.finishedProduct);
    await page.locator('#prod-categoria').selectOption('producao_propria');
    await page.locator('#prod-unidade').selectOption('unidade');
    await page.locator('#prod-preco').fill('50');
    await page.locator('#prod-estoque-min').fill('5');
    await confirmModal(page);

    await expectToast(page, 'Produto criado com sucesso');
    await expect(page.locator('#comp-produto-select')).toBeVisible();
    await page.locator('#comp-produto-select').selectOption({ label: `${data.rawProduct} (Kg)` });
    await page.locator('#comp-quantidade').fill('5');
    await page.locator('#btn-add-insumo').click();
    await expect(page.locator('#composicao-list')).toContainText(data.rawProduct);
    await confirmModal(page);

    await expectToast(page, 'Composição salva com sucesso');
    await expect(page.locator('.data-table')).toContainText(data.finishedProduct);
  });

  await test.step('registrar e receber compra', async () => {
    await clickSidebar(page, '/compras');
    await page.locator('#btn-nova-compra').click();
    await page.locator('#compra-fornecedor').selectOption({ label: data.supplier });
    await page.locator('#compra-loja').selectOption({ label: data.store });

    await page.locator('#compra-busca-produto').fill(data.rawProduct);
    const result = page.locator('.purchase-product-result').filter({ hasText: data.rawProduct });
    await expect(result).toBeVisible();
    await result.click();

    await page.locator('.item-qtd').fill('1');
    await page.locator('.item-qtd').blur();
    await page.locator('.item-conversao').fill('1000');
    await page.locator('.item-conversao').blur();
    await page.locator('.item-preco').fill('800');
    await page.locator('.item-preco').blur();
    await expect(page.locator('#compra-total')).toContainText('800');
    await confirmModal(page);

    await expectToast(page, 'Compra registrada com sucesso');
    await page.locator('[data-tab="recebimento"]').click();
    const purchaseRow = page.locator('.data-table tbody tr').filter({ hasText: data.supplier });
    await expect(purchaseRow).toBeVisible();
    await purchaseRow.getByRole('button', { name: 'Receber' }).click();
    await expect(page.locator('#recebimento-itens-body')).toContainText(data.rawProduct);
    await confirmModal(page);
    await expectToast(page, 'Recebimento confirmado com sucesso');

    const stores = await apiGet(page, '/lojas');
    const store = stores.find((item) => item.nome === data.store);
    expect(store).toBeTruthy();
    const stock = await apiGet(page, `/estoque?loja_id=${store.id}`);
    const rawStock = stock.find((item) => item.produto_nome === data.rawProduct);
    expect(Number(rawStock?.quantidade)).toBe(1000);
  });

  await test.step('produzir e abater matéria-prima', async () => {
    await clickSidebar(page, '/producao');
    await page.locator('[data-tab="producao"]').click();
    await page.locator('#btn-nova-producao').click();
    await page.locator('#prod-produto').selectOption({ label: data.finishedProduct });
    await page.locator('#prod-loja').selectOption({ label: data.store });
    await page.locator('#prod-quantidade').fill('10');
    await expect(page.locator('#prod-consumo-container')).toBeVisible();
    await expect(page.locator('#prod-consumo-body')).toContainText('OK');
    await confirmModal(page);
    await expectToast(page, 'Produção registrada com sucesso');

    const stores = await apiGet(page, '/lojas');
    const store = stores.find((item) => item.nome === data.store);
    const stock = await apiGet(page, `/estoque?loja_id=${store.id}`);
    const rawStock = stock.find((item) => item.produto_nome === data.rawProduct);
    const finishedStock = stock.find((item) => item.produto_nome === data.finishedProduct);
    expect(Number(rawStock?.quantidade)).toBe(950);
    expect(Number(finishedStock?.quantidade)).toBe(10);
  });

  await test.step('abrir caixa', async () => {
    await clickSidebar(page, '/financeiro');
    await page.locator('[data-tab="caixa"]').click();
    await page.locator('#caixa-loja').selectOption({ label: data.store });
    await expect(page.locator('#btn-abrir-caixa')).toBeVisible();
    await page.locator('#btn-abrir-caixa').click();
    await page.locator('#caixa-modal-loja').selectOption({ label: data.store });
    await page.locator('#caixa-saldo').fill('100');
    await confirmModal(page);
    await expectToast(page, 'Caixa aberto com sucesso');
    await expect(page.locator('#caixa-status')).toContainText('Caixa aberto');
  });

  await test.step('realizar venda e receber pagamento', async () => {
    await clickSidebar(page, '/vendas');
    await page.locator('#pdv-loja-contexto').selectOption({ label: data.store });
    await page.locator('#pdv-busca').fill(data.finishedProduct);

    const productRow = page.locator('[data-produto-row]').filter({ hasText: data.finishedProduct });
    await expect(productRow).toBeVisible();
    await productRow.locator('[data-quantidade-produto]').fill('2');
    await productRow.locator('[data-adicionar-produto]').click();
    await expect(page.locator('#pdv-itens-count')).toContainText('2 itens');
    await page.locator('#btn-finalizar-venda').click();

    await expectToast(page, 'Pagamento pendente');
    await expect(page.locator('#modal-formas-pagamento')).toBeVisible();
    await page.locator('[data-forma="dinheiro"]').click();
    await page.locator('#pagamento-valor-recebido').fill('120');
    await page.locator('#btn-registrar-pagamento').click();
    await expectToast(page, 'Pagamento registrado');
    await expect(page.locator('.payment-complete-message')).toContainText('Pagamento concluído');

    const stores = await apiGet(page, '/lojas');
    const store = stores.find((item) => item.nome === data.store);
    const stock = await apiGet(page, `/estoque?loja_id=${store.id}`);
    const finishedStock = stock.find((item) => item.produto_nome === data.finishedProduct);
    expect(Number(finishedStock?.quantidade)).toBe(8);

    const sales = await apiGet(page, `/vendas?loja_id=${store.id}`);
    expect(sales[0].status_pagamento).toBe('pago');
    expect(Number(sales[0].total)).toBe(100);
  });

  await test.step('fechar caixa e conferir saldo', async () => {
    await page.locator('#modal-close-btn').click();
    await clickSidebar(page, '/financeiro');
    await page.locator('[data-tab="caixa"]').click();
    await page.locator('#caixa-loja').selectOption({ label: data.store });
    await expect(page.locator('#caixa-status')).toContainText('R$ 200,00');
    await page.locator('#btn-fechar-caixa').click();
    await confirmModal(page);
    await expectToast(page, 'Caixa fechado com saldo de R$ 200,00');

    const stores = await apiGet(page, '/lojas');
    const store = stores.find((item) => item.nome === data.store);
    const history = await apiGet(page, `/financeiro/caixa/historico?loja_id=${store.id}`);
    expect(history[0].status).toBe('fechado');
    expect(Number(history[0].saldo_fechamento)).toBe(200);
  });

  expect(browserErrors).toEqual([]);
});
