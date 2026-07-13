import bcrypt from 'bcryptjs';
import { validatePassword } from '../../src/security/password.js';

/**
 * @param {import('knex').Knex} knex
 */
export async function seed(knex) {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    throw new Error('Seed de demonstração bloqueado em ambiente de produção');
  }
  if (process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
    throw new Error('Seed destrutivo bloqueado. Use explicitamente npm run seed:dev');
  }

  const senhaAdminInicial = process.env.SEED_ADMIN_PASSWORD;
  const senhaVendedorInicial = process.env.SEED_VENDOR_PASSWORD;
  const senhaCaixaInicial = process.env.SEED_CASHIER_PASSWORD;
  const senhaAdminError = validatePassword(senhaAdminInicial);
  const senhaVendedorError = validatePassword(senhaVendedorInicial);
  const senhaCaixaError = validatePassword(senhaCaixaInicial);
  if (senhaAdminError || senhaVendedorError || senhaCaixaError) {
    throw new Error(
      'Defina SEED_ADMIN_PASSWORD, SEED_VENDOR_PASSWORD e SEED_CASHIER_PASSWORD válidas. '
      + `Admin: ${senhaAdminError || 'ok'}. `
      + `Vendedor: ${senhaVendedorError || 'ok'}. `
      + `Caixa: ${senhaCaixaError || 'ok'}`
    );
  }

  // Limpar tabelas na ordem correta (respeitar FKs)
  await knex('financeiro_lancamentos').del();
  await knex('caixa').del();
  await knex('venda_pagamentos').del();
  await knex('venda_itens').del();
  await knex('vendas').del();
  await knex('ordens_producao').del();
  await knex('receita_insumos').del();
  await knex('receitas').del();
  await knex('compra_itens').del();
  await knex('compras').del();
  await knex('estoque_movimentacoes').del();
  await knex('estoque').del();
  await knex('produtos').del();
  await knex('fornecedores').del();
  await knex('clientes').del();
  await knex('usuarios').del();
  await knex('lojas').del();
  await knex('configuracoes').del();

  // === LOJAS ===
  const [lojaMundubim] = await knex('lojas').insert([
    { nome: 'Mundubim', cidade: 'Fortaleza', situacao: 'ativa', comissao_percentual: 0, tipo: 'loja' },
  ]).returning('id');

  const [lojaAquiraz] = await knex('lojas').insert([
    { nome: 'Aquiraz', cidade: 'Aquiraz', situacao: 'ativa', comissao_percentual: 2, tipo: 'loja' },
  ]).returning('id');

  const [lojaMaracanau] = await knex('lojas').insert([
    { nome: 'Maracanaú', cidade: 'Maracanaú', situacao: 'ativa', comissao_percentual: 0, tipo: 'loja' },
  ]).returning('id');

  const [galpaoFabrica] = await knex('lojas').insert([
    {
      nome: 'Galpão/Fábrica',
      cidade: null,
      situacao: 'ativa',
      comissao_percentual: 0,
      tipo: 'galpao_fabrica',
    },
  ]).returning('id');

  const unidadeIds = [
    lojaMundubim.id,
    lojaAquiraz.id,
    lojaMaracanau.id,
    galpaoFabrica.id,
  ];

  // === USUARIOS ===
  const senhaAdmin = await bcrypt.hash(senhaAdminInicial, 12);
  const senhaVendedor = await bcrypt.hash(senhaVendedorInicial, 12);
  const senhaCaixa = await bcrypt.hash(senhaCaixaInicial, 12);

  await knex('usuarios').insert([
    {
      nome: 'Administrador',
      login: 'admin',
      senha_hash: senhaAdmin,
      perfil: 'admin',
      loja_id: lojaMundubim.id,
      permissoes: JSON.stringify([]),
      deve_trocar_senha: true,
      token_version: 0,
    },
    ...[
      { nome: 'Mundubim', slug: 'mundubim', id: lojaMundubim.id },
      { nome: 'Aquiraz', slug: 'aquiraz', id: lojaAquiraz.id },
      { nome: 'Maracanaú', slug: 'maracanau', id: lojaMaracanau.id },
    ].flatMap((loja) => [
      {
        nome: `Vendedor ${loja.nome}`,
        login: `vendedor.${loja.slug}@gesso.com`,
        senha_hash: senhaVendedor,
        perfil: 'vendedor',
        loja_id: loja.id,
        permissoes: JSON.stringify(['dashboard', 'vendas', 'clientes', 'estoque']),
        deve_trocar_senha: true,
        token_version: 0,
      },
      {
        nome: `Caixa ${loja.nome}`,
        login: `caixa.${loja.slug}@gesso.com`,
        senha_hash: senhaCaixa,
        perfil: 'vendedor',
        loja_id: loja.id,
        permissoes: JSON.stringify(['dashboard', 'vendas', 'clientes', 'estoque', 'caixa']),
        deve_trocar_senha: true,
        token_version: 0,
      },
    ]),
  ]);

  // === PRODUTOS - Produção Própria ===
  const produtosProducao = [
    { nome: 'Prancha 35cm x 2,00m', categoria: 'producao_propria', unidade: 'unidade', preco_venda: 0 },
    { nome: 'Prancha 40cm x 2,00m', categoria: 'producao_propria', unidade: 'unidade', preco_venda: 0 },
    { nome: 'Prancha 45cm x 2,00m', categoria: 'producao_propria', unidade: 'unidade', preco_venda: 0 },
    { nome: 'Prancha 50cm x 2,00m', categoria: 'producao_propria', unidade: 'unidade', preco_venda: 0 },
    { nome: 'Prancha 55cm x 2,00m', categoria: 'producao_propria', unidade: 'unidade', preco_venda: 0 },
    { nome: 'Prancha 60cm x 2,00m', categoria: 'producao_propria', unidade: 'unidade', preco_venda: 0 },
    { nome: 'Bloco divisória branco', categoria: 'producao_propria', unidade: 'unidade', preco_venda: 0 },
    { nome: 'Bloco hidro azul', categoria: 'producao_propria', unidade: 'unidade', preco_venda: 0 },
    { nome: 'Moldura tradicional 10cm', categoria: 'producao_propria', unidade: 'unidade', preco_venda: 0 },
    { nome: 'Moldura peito de pombo 10cm', categoria: 'producao_propria', unidade: 'unidade', preco_venda: 0 },
    { nome: 'Moldura escadinha 10cm', categoria: 'producao_propria', unidade: 'unidade', preco_venda: 0 },
    { nome: 'Moldura dilatação', categoria: 'producao_propria', unidade: 'unidade', preco_venda: 0 },
    { nome: 'Ripado 33,3cm x 1m', categoria: 'producao_propria', unidade: 'metro', preco_venda: 0 },
    { nome: 'Placas 3D', categoria: 'producao_propria', unidade: 'unidade', preco_venda: 0 },
  ];

  // === PRODUTOS - Outros ===
  const produtosOutros = [
    { nome: 'Gesso em pó', categoria: 'gesso_convencional', unidade: 'kg', preco_venda: 15 },
    { nome: 'Placa de gesso 60x60', categoria: 'gesso_convencional', unidade: 'unidade', preco_venda: 8 },
    { nome: 'Placa Drywall ST 1,20x1,80', categoria: 'drywall', unidade: 'unidade', preco_venda: 45 },
    { nome: 'Parafuso Drywall', categoria: 'drywall', unidade: 'caixa', preco_venda: 25 },
    { nome: 'Massa para Drywall', categoria: 'drywall', unidade: 'saco', preco_venda: 35 },
    { nome: 'Fita Telada Drywall', categoria: 'drywall', unidade: 'unidade', preco_venda: 12 },
  ];

  const todosProdutos = [...produtosProducao, ...produtosOutros];
  const produtosInseridos = await knex('produtos').insert(todosProdutos).returning('id');
  await Promise.all(produtosInseridos.map((produto) =>
    knex('produtos')
      .where({ id: produto.id })
      .update({ codigo_interno: `PRD${String(produto.id).padStart(6, '0')}` })
  ));

  // === ESTOQUE INICIAL - 100 unidades de cada produto em cada loja ===
  const estoqueInicial = [];
  for (const produto of produtosInseridos) {
    for (const lojaId of unidadeIds) {
      estoqueInicial.push({
        produto_id: produto.id,
        loja_id: lojaId,
        quantidade: lojaId === galpaoFabrica.id ? 0 : 100,
      });
    }
  }
  await knex('estoque').insert(estoqueInicial);

  // === CONFIGURAÇÕES ===
  await knex('configuracoes').insert([
    { chave: 'taxa_debito', valor: '1.5', descricao: 'Taxa do cartão de débito (%)' },
    { chave: 'taxa_credito', valor: '3.5', descricao: 'Taxa do cartão de crédito (%)' },
    { chave: 'desconto_maximo', valor: '20', descricao: 'Desconto máximo permitido (%)' },
  ]);

  console.log('✅ Seed executado com sucesso!');
}
