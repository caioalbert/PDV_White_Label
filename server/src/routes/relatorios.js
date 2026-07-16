import { Router } from 'express';
import db from '../database.js';
import { requirePermission, verifyToken } from '../middleware/auth.js';

const router = Router();

// Helper para aplicar filtros comuns
function aplicarFiltros(query, req, tabelaLoja = 'loja_id', tabelaData = 'created_at') {
  const { data_inicio, data_fim } = req.query;
  const loja_id = req.user.perfil === 'vendedor' ? req.user.loja_id : req.query.loja_id;
  if (loja_id) query = query.where(tabelaLoja, loja_id);
  if (data_inicio) query = query.where(tabelaData, '>=', data_inicio);
  if (data_fim) query = query.where(tabelaData, '<=', `${data_fim} 23:59:59`);
  return query;
}

// GET /api/relatorios/vendas-periodo
router.get('/vendas-periodo', verifyToken, requirePermission('relatorios'), async (req, res) => {
  try {
    let query = db('vendas')
      .join('lojas', 'vendas.loja_id', 'lojas.id')
      .select(
        db.raw("TO_CHAR(vendas.created_at, 'YYYY-MM-DD') as data"),
        'lojas.nome as loja',
        db.raw('COUNT(vendas.id) as quantidade_vendas'),
        db.raw('SUM(vendas.total) as total'),
        db.raw('SUM(vendas.desconto_valor) as total_descontos'),
        db.raw('SUM(vendas.taxa_cartao) as total_taxas'),
        db.raw('SUM(vendas.comissao_valor) as total_comissoes')
      )
      .groupByRaw("TO_CHAR(vendas.created_at, 'YYYY-MM-DD'), lojas.nome, lojas.id")
      .orderBy('data', 'desc');

    query = aplicarFiltros(query, req, 'vendas.loja_id', 'vendas.created_at');
    const resultado = await query;
    res.json(resultado);
  } catch (err) {
    console.error('Erro no relatório vendas-periodo:', err);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// GET /api/relatorios/vendas-loja
router.get('/vendas-loja', verifyToken, requirePermission('relatorios'), async (req, res) => {
  try {
    let query = db('vendas')
      .join('lojas', 'vendas.loja_id', 'lojas.id')
      .select(
        'lojas.id as loja_id',
        'lojas.nome as loja',
        db.raw('COUNT(vendas.id) as quantidade_vendas'),
        db.raw('SUM(vendas.total) as total'),
        db.raw('AVG(vendas.total) as ticket_medio')
      )
      .groupBy('lojas.id', 'lojas.nome')
      .orderBy('lojas.nome');

    let produtosQuery = db('venda_itens')
      .join('vendas', 'venda_itens.venda_id', 'vendas.id')
      .join('produtos', 'venda_itens.produto_id', 'produtos.id')
      .join('lojas', 'vendas.loja_id', 'lojas.id')
      .select(
        'lojas.id as loja_id',
        'produtos.id as produto_id',
        'produtos.nome as produto',
        'produtos.unidade',
        db.raw('SUM(venda_itens.quantidade) as quantidade_total'),
        db.raw('SUM(venda_itens.subtotal) as receita_total')
      )
      .groupBy('lojas.id', 'produtos.id', 'produtos.nome', 'produtos.unidade')
      .orderBy('lojas.id')
      .orderBy('quantidade_total', 'desc');

    query = aplicarFiltros(query, req, 'vendas.loja_id', 'vendas.created_at');
    produtosQuery = aplicarFiltros(produtosQuery, req, 'vendas.loja_id', 'vendas.created_at');

    const [resultado, produtosVendidos] = await Promise.all([query, produtosQuery]);
    const produtosPorLoja = produtosVendidos.reduce((acc, produto) => {
      const lista = acc.get(produto.loja_id) || [];
      lista.push(produto);
      acc.set(produto.loja_id, lista);
      return acc;
    }, new Map());

    res.json(resultado.map((loja) => ({
      ...loja,
      produtos_vendidos: produtosPorLoja.get(loja.loja_id) || [],
    })));
  } catch (err) {
    console.error('Erro no relatório vendas-loja:', err);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// GET /api/relatorios/produtos-mais-vendidos
router.get('/produtos-mais-vendidos', verifyToken, requirePermission('relatorios'), async (req, res) => {
  try {
    let query = db('venda_itens')
      .join('vendas', 'venda_itens.venda_id', 'vendas.id')
      .join('produtos', 'venda_itens.produto_id', 'produtos.id')
      .select(
        'produtos.nome as produto',
        'produtos.categoria',
        db.raw('SUM(venda_itens.quantidade) as quantidade_total'),
        db.raw('SUM(venda_itens.subtotal) as receita_total')
      )
      .groupBy('produtos.nome', 'produtos.categoria', 'produtos.id')
      .orderBy('quantidade_total', 'desc')
      .limit(20);

    const { data_inicio, data_fim } = req.query;
    const loja_id = req.user.perfil === 'vendedor' ? req.user.loja_id : req.query.loja_id;
    if (loja_id) query = query.where('vendas.loja_id', loja_id);
    if (data_inicio) query = query.where('vendas.created_at', '>=', data_inicio);
    if (data_fim) query = query.where('vendas.created_at', '<=', `${data_fim} 23:59:59`);

    const resultado = await query;
    res.json(resultado);
  } catch (err) {
    console.error('Erro no relatório produtos-mais-vendidos:', err);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// GET /api/relatorios/estoque-atual
router.get('/estoque-atual', verifyToken, requirePermission('relatorios'), async (req, res) => {
  try {
    let query = db('estoque')
      .join('produtos', 'estoque.produto_id', 'produtos.id')
      .join('lojas', 'estoque.loja_id', 'lojas.id')
      .select(
        'produtos.nome as produto',
        'produtos.categoria',
        'produtos.unidade',
        'lojas.nome as loja',
        'estoque.quantidade',
        'produtos.estoque_minimo',
        'produtos.preco_venda',
        db.raw('estoque.quantidade * produtos.preco_venda as valor_em_estoque')
      )
      .where('produtos.ativo', true)
      .orderBy('produtos.nome');

    const loja_id = req.user.perfil === 'vendedor' ? req.user.loja_id : req.query.loja_id;
    if (loja_id) query = query.where('estoque.loja_id', loja_id);

    const resultado = await query;
    res.json(resultado);
  } catch (err) {
    console.error('Erro no relatório estoque-atual:', err);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// GET /api/relatorios/estoque-minimo
router.get('/estoque-minimo', verifyToken, requirePermission('relatorios'), async (req, res) => {
  try {
    let query = db('estoque')
      .join('produtos', 'estoque.produto_id', 'produtos.id')
      .join('lojas', 'estoque.loja_id', 'lojas.id')
      .whereRaw('estoque.quantidade < produtos.estoque_minimo')
      .where('produtos.ativo', true)
      .select(
        'produtos.nome as produto',
        'produtos.categoria',
        'lojas.nome as loja',
        'estoque.quantidade',
        'produtos.estoque_minimo',
        db.raw('produtos.estoque_minimo - estoque.quantidade as falta')
      )
      .orderBy('falta', 'desc');

    const loja_id = req.user.perfil === 'vendedor' ? req.user.loja_id : req.query.loja_id;
    if (loja_id) query = query.where('estoque.loja_id', loja_id);

    const resultado = await query;
    res.json(resultado);
  } catch (err) {
    console.error('Erro no relatório estoque-minimo:', err);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// GET /api/relatorios/compras-fornecedor
router.get('/compras-fornecedor', verifyToken, requirePermission('relatorios'), async (req, res) => {
  try {
    let query = db('compras')
      .join('fornecedores', 'compras.fornecedor_id', 'fornecedores.id')
      .join('lojas', 'compras.loja_id', 'lojas.id')
      .select(
        'fornecedores.nome as fornecedor',
        'lojas.nome as loja',
        db.raw('COUNT(compras.id) as quantidade_compras'),
        db.raw('SUM(compras.total) as total')
      )
      .groupBy('fornecedores.nome', 'fornecedores.id', 'lojas.nome', 'lojas.id')
      .orderBy('total', 'desc');

    query = aplicarFiltros(query, req, 'compras.loja_id', 'compras.created_at');

    const resultado = await query;
    res.json(resultado);
  } catch (err) {
    console.error('Erro no relatório compras-fornecedor:', err);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// GET /api/relatorios/fluxo-caixa
router.get('/fluxo-caixa', verifyToken, requirePermission('relatorios'), async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query;
    const loja_id = req.user.perfil === 'vendedor' ? req.user.loja_id : req.query.loja_id;

    let entradasQuery = db('financeiro_lancamentos')
      .where('tipo', 'entrada')
      .select(
        db.raw("TO_CHAR(created_at, 'YYYY-MM-DD') as data"),
        db.raw('SUM(valor) as total')
      )
      .groupBy(db.raw("TO_CHAR(created_at, 'YYYY-MM-DD')"));

    let saidasQuery = db('financeiro_lancamentos')
      .where('tipo', 'saida')
      .select(
        db.raw("TO_CHAR(created_at, 'YYYY-MM-DD') as data"),
        db.raw('SUM(valor) as total')
      )
      .groupBy(db.raw("TO_CHAR(created_at, 'YYYY-MM-DD')"));

    if (loja_id) {
      entradasQuery = entradasQuery.where('loja_id', loja_id);
      saidasQuery = saidasQuery.where('loja_id', loja_id);
    }
    if (data_inicio) {
      entradasQuery = entradasQuery.where('created_at', '>=', data_inicio);
      saidasQuery = saidasQuery.where('created_at', '>=', data_inicio);
    }
    if (data_fim) {
      entradasQuery = entradasQuery.where('created_at', '<=', `${data_fim} 23:59:59`);
      saidasQuery = saidasQuery.where('created_at', '<=', `${data_fim} 23:59:59`);
    }

    const [entradas, saidas] = await Promise.all([entradasQuery, saidasQuery]);

    // Combinar entradas e saídas por data
    const datasMap = {};
    for (const e of entradas) {
      datasMap[e.data] = { data: e.data, entradas: parseFloat(e.total), saidas: 0 };
    }
    for (const s of saidas) {
      if (datasMap[s.data]) {
        datasMap[s.data].saidas = parseFloat(s.total);
      } else {
        datasMap[s.data] = { data: s.data, entradas: 0, saidas: parseFloat(s.total) };
      }
    }

    const fluxo = Object.values(datasMap)
      .map((d) => ({ ...d, saldo: d.entradas - d.saidas }))
      .sort((a, b) => a.data.localeCompare(b.data));

    res.json(fluxo);
  } catch (err) {
    console.error('Erro no relatório fluxo-caixa:', err);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// GET /api/relatorios/sangrias
router.get('/sangrias', verifyToken, requirePermission('relatorios'), async (req, res) => {
  try {
    let query = db('financeiro_lancamentos')
      .join('lojas', 'financeiro_lancamentos.loja_id', 'lojas.id')
      .leftJoin('usuarios', 'financeiro_lancamentos.usuario_id', 'usuarios.id')
      .where('financeiro_lancamentos.categoria', 'sangria')
      .select(
        'financeiro_lancamentos.*',
        'lojas.nome as loja_nome',
        'usuarios.nome as usuario_nome'
      )
      .orderBy('financeiro_lancamentos.created_at', 'desc');

    const { data_inicio, data_fim } = req.query;
    const loja_id = req.user.perfil === 'vendedor' ? req.user.loja_id : req.query.loja_id;
    if (loja_id) query = query.where('financeiro_lancamentos.loja_id', loja_id);
    if (data_inicio) query = query.where('financeiro_lancamentos.created_at', '>=', data_inicio);
    if (data_fim) query = query.where('financeiro_lancamentos.created_at', '<=', `${data_fim} 23:59:59`);

    const resultado = await query;
    res.json(resultado);
  } catch (err) {
    console.error('Erro no relatório sangrias:', err);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// GET /api/relatorios/comissao
router.get('/comissao', verifyToken, requirePermission('relatorios'), async (req, res) => {
  try {
    let query = db('vendas')
      .join('lojas', 'vendas.loja_id', 'lojas.id')
      .leftJoin('usuarios', 'vendas.usuario_id', 'usuarios.id')
      .where('vendas.comissao_valor', '>', 0)
      .select(
        'lojas.nome as loja',
        'usuarios.nome as vendedor',
        db.raw('COUNT(vendas.id) as quantidade_vendas'),
        db.raw('SUM(vendas.total) as total_vendas'),
        db.raw('SUM(vendas.comissao_valor) as total_comissao')
      )
      .groupBy('lojas.nome', 'lojas.id', 'usuarios.nome', 'usuarios.id');

    const { data_inicio, data_fim } = req.query;
    const loja_id = req.user.perfil === 'vendedor' ? req.user.loja_id : req.query.loja_id;
    if (loja_id) query = query.where('vendas.loja_id', loja_id);
    if (data_inicio) query = query.where('vendas.created_at', '>=', data_inicio);
    if (data_fim) query = query.where('vendas.created_at', '<=', `${data_fim} 23:59:59`);

    const resultado = await query;
    res.json(resultado);
  } catch (err) {
    console.error('Erro no relatório comissão:', err);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

export default router;
