import { Router } from 'express';
import db from '../database.js';
import { requirePermission, verifyToken } from '../middleware/auth.js';

const router = Router();

// GET /api/dashboard/resumo
router.get('/resumo', verifyToken, requirePermission('dashboard'), async (req, res) => {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeISO = hoje.toISOString();

    const filtroLoja = req.user.perfil === 'vendedor' ? req.user.loja_id : req.query.loja_id;

    // Produtos com estoque abaixo do mínimo
    let baixoEstoqueQuery = db('estoque')
      .join('produtos', 'estoque.produto_id', 'produtos.id')
      .join('lojas', 'estoque.loja_id', 'lojas.id')
      .whereRaw('estoque.quantidade < produtos.estoque_minimo')
      .where('produtos.ativo', true)
      .select(
        'produtos.nome as produto',
        'lojas.nome as loja',
        'estoque.quantidade',
        'produtos.estoque_minimo'
      );
    if (filtroLoja) baixoEstoqueQuery = baixoEstoqueQuery.where('estoque.loja_id', filtroLoja);
    const produtosBaixoEstoque = await baixoEstoqueQuery;

    if (req.user.perfil !== 'admin') {
      return res.json({
        acesso_restrito: true,
        baixo_estoque: produtosBaixoEstoque.length,
        produtos_baixo_estoque: produtosBaixoEstoque,
      });
    }

    // Vendas hoje
    let vendasHojeQuery = db('vendas').where('created_at', '>=', hojeISO).sum('total as total');
    if (filtroLoja) vendasHojeQuery = vendasHojeQuery.where('loja_id', filtroLoja);
    const [vendasHoje] = await vendasHojeQuery;

    // Entradas financeiras hoje
    let entradasQuery = db('financeiro_lancamentos')
      .where('created_at', '>=', hojeISO)
      .where('tipo', 'entrada')
      .sum('valor as total');
    if (filtroLoja) entradasQuery = entradasQuery.where('loja_id', filtroLoja);
    const [entradasHoje] = await entradasQuery;

    // Saídas financeiras hoje
    let saidasQuery = db('financeiro_lancamentos')
      .where('created_at', '>=', hojeISO)
      .where('tipo', 'saida')
      .sum('valor as total');
    if (filtroLoja) saidasQuery = saidasQuery.where('loja_id', filtroLoja);
    const [saidasHoje] = await saidasQuery;

    // Últimas 5 compras
    let comprasRecentesQuery = db('compras')
      .join('fornecedores', 'compras.fornecedor_id', 'fornecedores.id')
      .join('lojas', 'compras.loja_id', 'lojas.id')
      .select(
        'compras.id',
        'fornecedores.nome as fornecedor',
        'lojas.nome as loja',
        'compras.total',
        'compras.status',
        'compras.created_at'
      )
      .orderBy('compras.created_at', 'desc')
      .limit(5);
    if (filtroLoja) comprasRecentesQuery = comprasRecentesQuery.where('compras.loja_id', filtroLoja);
    const comprasRecentes = await comprasRecentesQuery;

    // Vendas por loja (últimos 7 dias)
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
    let vendasPorLojaQuery = db('vendas')
      .join('lojas', 'vendas.loja_id', 'lojas.id')
      .where('vendas.created_at', '>=', seteDiasAtras.toISOString())
      .groupBy('lojas.nome', 'lojas.id')
      .select('lojas.nome as loja')
      .sum('vendas.total as total')
      .count('vendas.id as quantidade');
    if (filtroLoja) vendasPorLojaQuery = vendasPorLojaQuery.where('vendas.loja_id', filtroLoja);
    const vendasPorLoja = await vendasPorLojaQuery;

    // Faturamento mensal (últimos 6 meses)
    const faturamentoMensal = await db.raw(`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') as mes,
        SUM(total) as total
      FROM vendas
      WHERE created_at >= NOW() - INTERVAL '6 months'
      ${filtroLoja ? `AND loja_id = ${parseInt(filtroLoja)}` : ''}
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY mes ASC
    `);

    res.json({
      vendas_hoje: parseFloat(vendasHoje.total) || 0,
      entradas_hoje: parseFloat(entradasHoje.total) || 0,
      saidas_hoje: parseFloat(saidasHoje.total) || 0,
      baixo_estoque: produtosBaixoEstoque.length,
      produtos_baixo_estoque: produtosBaixoEstoque,
      compras_recentes: comprasRecentes,
      vendas_por_loja: vendasPorLoja,
      faturamento_mensal: faturamentoMensal.rows,
    });
  } catch (err) {
    console.error('Erro ao buscar resumo:', err);
    res.status(500).json({ error: 'Erro ao buscar dados do dashboard' });
  }
});

export default router;
