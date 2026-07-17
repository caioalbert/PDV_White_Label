import { Router } from 'express';
import db from '../database.js';
import {
  requireAdmin,
  requireAnyPermission,
  requirePermission,
  verifyToken,
} from '../middleware/auth.js';

const router = Router();

function parsePositiveNumber(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeNumber(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

// GET /api/estoque/outras-lojas - Disponibilidade para apoio ao PDV
router.get(
  '/outras-lojas',
  verifyToken,
  requireAnyPermission('estoque', 'vendas'),
  async (req, res) => {
    try {
      const lojaOrigemId = req.user.perfil === 'vendedor'
        ? req.user.loja_id
        : parseInt(req.query.loja_id, 10);

      if (!lojaOrigemId) {
        return res.status(400).json({ error: 'Loja de origem é obrigatória' });
      }

      const disponibilidade = await db('estoque')
        .join('lojas', 'estoque.loja_id', 'lojas.id')
        .join('produtos', 'estoque.produto_id', 'produtos.id')
        .whereNot('estoque.loja_id', lojaOrigemId)
        .where('estoque.quantidade', '>', 0)
        .where('lojas.situacao', 'ativa')
        .where('produtos.ativo', true)
        .select(
          'estoque.produto_id',
          'estoque.quantidade',
          'lojas.id as loja_id',
          'lojas.nome as loja_nome'
        )
        .orderBy('lojas.nome');

      res.json(disponibilidade);
    } catch (err) {
      console.error('Erro ao consultar estoque em outras lojas:', err);
      res.status(500).json({ error: 'Erro ao consultar estoque em outras lojas' });
    }
  }
);

// GET /api/estoque - Estoque por loja
router.get(
  '/',
  verifyToken,
  requireAnyPermission('estoque', 'vendas', 'producao'),
  async (req, res) => {
  try {
    let query = db('estoque')
      .join('produtos', 'estoque.produto_id', 'produtos.id')
      .leftJoin('produto_categorias', 'produtos.categoria_id', 'produto_categorias.id')
      .join('lojas', 'estoque.loja_id', 'lojas.id')
      .select(
        'estoque.id',
        'estoque.quantidade',
        'estoque.updated_at',
        'produtos.id as produto_id',
        'produtos.nome as produto_nome',
        'produtos.categoria_id',
        'produto_categorias.slug as categoria',
        'produto_categorias.nome as categoria_nome',
        'produtos.unidade',
        'produtos.preco_venda',
        'produtos.estoque_minimo',
        'lojas.id as loja_id',
        'lojas.nome as loja_nome'
      )
      .where('produtos.ativo', true)
      .orderBy('produtos.nome');

    const { loja_id, categoria, search } = req.query;
    if (loja_id) query = query.where('estoque.loja_id', loja_id);
    if (categoria) query = query.where('produto_categorias.slug', categoria);
    if (search) query = query.where('produtos.nome', 'ilike', `%${search}%`);

    // Vendedor só vê estoque da própria loja
    if (req.user.perfil === 'vendedor') {
      query = query.where('estoque.loja_id', req.user.loja_id);
    }

    const estoque = await query;
    res.json(estoque);
  } catch (err) {
    console.error('Erro ao listar estoque:', err);
    res.status(500).json({ error: 'Erro ao listar estoque' });
  }
  }
);

// GET /api/estoque/movimentacoes - Histórico de movimentações
router.get('/movimentacoes', verifyToken, requirePermission('estoque'), async (req, res) => {
  try {
    let query = db('estoque_movimentacoes')
      .join('produtos', 'estoque_movimentacoes.produto_id', 'produtos.id')
      .join('lojas', 'estoque_movimentacoes.loja_id', 'lojas.id')
      .leftJoin('lojas as loja_destino', 'estoque_movimentacoes.loja_destino_id', 'loja_destino.id')
      .leftJoin('usuarios', 'estoque_movimentacoes.usuario_id', 'usuarios.id')
      .select(
        'estoque_movimentacoes.*',
        'produtos.nome as produto_nome',
        'lojas.nome as loja_nome',
        'loja_destino.nome as loja_destino_nome',
        'usuarios.nome as usuario_nome'
      )
      .orderBy('estoque_movimentacoes.created_at', 'desc');

    const { loja_id, tipo, produto_id, data_inicio, data_fim } = req.query;
    if (loja_id) query = query.where('estoque_movimentacoes.loja_id', loja_id);
    if (tipo) query = query.where('estoque_movimentacoes.tipo', tipo);
    if (produto_id) query = query.where('estoque_movimentacoes.produto_id', produto_id);
    if (data_inicio) query = query.where('estoque_movimentacoes.created_at', '>=', data_inicio);
    if (data_fim) query = query.where('estoque_movimentacoes.created_at', '<=', `${data_fim} 23:59:59`);

    if (req.user.perfil === 'vendedor') {
      query = query.where('estoque_movimentacoes.loja_id', req.user.loja_id);
    }

    const movimentacoes = await query;
    res.json(movimentacoes);
  } catch (err) {
    console.error('Erro ao listar movimentações:', err);
    res.status(500).json({ error: 'Erro ao listar movimentações' });
  }
});

// Função auxiliar para atualizar estoque
async function atualizarEstoque(trx, produtoId, lojaId, quantidade, operacao) {
  const estoque = await trx('estoque')
    .where({ produto_id: produtoId, loja_id: lojaId })
    .forUpdate()
    .first();

  if (!estoque) {
    if (operacao === 'somar') {
      await trx('estoque').insert({ produto_id: produtoId, loja_id: lojaId, quantidade });
    } else {
      throw new Error('Estoque não encontrado para este produto/loja');
    }
  } else {
    const novaQuantidade = operacao === 'somar'
      ? parseFloat(estoque.quantidade) + parseFloat(quantidade)
      : parseFloat(estoque.quantidade) - parseFloat(quantidade);

    if (novaQuantidade < 0) {
      const produto = await trx('produtos').where({ id: produtoId }).first();
      throw new Error(`Estoque insuficiente para ${produto?.nome || 'produto'}. Disponível: ${estoque.quantidade}`);
    }

    await trx('estoque')
      .where({ produto_id: produtoId, loja_id: lojaId })
      .update({ quantidade: novaQuantidade, updated_at: trx.fn.now() });
  }
}

// POST /api/estoque/entrada - Entrada manual
router.post('/entrada', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { produto_id, loja_id, quantidade, motivo } = req.body;
    const quantidadeValida = parsePositiveNumber(quantidade);
    if (!produto_id || !loja_id || quantidadeValida === null) {
      return res.status(400).json({ error: 'Produto, loja e quantidade positiva são obrigatórios' });
    }

    await db.transaction(async (trx) => {
      await atualizarEstoque(trx, produto_id, loja_id, quantidadeValida, 'somar');

      await trx('estoque_movimentacoes').insert({
        produto_id,
        loja_id,
        tipo: 'entrada',
        quantidade: quantidadeValida,
        motivo: motivo || 'Entrada manual',
        referencia_tipo: 'manual',
        usuario_id: req.user.id,
      });
    });

    res.json({ message: 'Entrada registrada com sucesso' });
  } catch (err) {
    console.error('Erro na entrada de estoque:', err);
    res.status(500).json({ error: err.message || 'Erro ao registrar entrada' });
  }
});

// POST /api/estoque/saida - Saída manual
router.post('/saida', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { produto_id, loja_id, quantidade, motivo } = req.body;
    const quantidadeValida = parsePositiveNumber(quantidade);
    if (!produto_id || !loja_id || quantidadeValida === null) {
      return res.status(400).json({ error: 'Produto, loja e quantidade positiva são obrigatórios' });
    }

    await db.transaction(async (trx) => {
      await atualizarEstoque(trx, produto_id, loja_id, quantidadeValida, 'subtrair');

      await trx('estoque_movimentacoes').insert({
        produto_id,
        loja_id,
        tipo: 'saida',
        quantidade: quantidadeValida,
        motivo: motivo || 'Saída manual',
        referencia_tipo: 'manual',
        usuario_id: req.user.id,
      });
    });

    res.json({ message: 'Saída registrada com sucesso' });
  } catch (err) {
    console.error('Erro na saída de estoque:', err);
    res.status(400).json({ error: err.message || 'Erro ao registrar saída' });
  }
});

// POST /api/estoque/transferir - Transferência entre lojas
router.post('/transferir', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { produto_id, loja_origem_id, loja_destino_id, quantidade, motivo } = req.body;
    const quantidadeValida = parsePositiveNumber(quantidade);

    if (!produto_id || !loja_origem_id || !loja_destino_id || quantidadeValida === null) {
      return res.status(400).json({
        error: 'Produto, loja de origem, loja de destino e quantidade positiva são obrigatórios',
      });
    }

    if (Number(loja_origem_id) === Number(loja_destino_id)) {
      return res.status(400).json({ error: 'Loja de origem e destino devem ser diferentes' });
    }

    await db.transaction(async (trx) => {
      // Subtrair da origem
      await atualizarEstoque(trx, produto_id, loja_origem_id, quantidadeValida, 'subtrair');
      // Adicionar no destino
      await atualizarEstoque(trx, produto_id, loja_destino_id, quantidadeValida, 'somar');

      // Registrar movimentação
      await trx('estoque_movimentacoes').insert({
        produto_id,
        loja_id: loja_origem_id,
        loja_destino_id,
        tipo: 'transferencia',
        quantidade: quantidadeValida,
        motivo: motivo || 'Transferência entre lojas',
        referencia_tipo: 'manual',
        usuario_id: req.user.id,
      });
    });

    res.json({ message: 'Transferência realizada com sucesso' });
  } catch (err) {
    console.error('Erro na transferência:', err);
    res.status(400).json({ error: err.message || 'Erro ao realizar transferência' });
  }
});

// POST /api/estoque/ajuste - Ajuste de estoque
router.post('/ajuste', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { produto_id, loja_id, quantidade_nova, motivo } = req.body;
    const quantidadeNovaValida = parseNonNegativeNumber(quantidade_nova);
    if (!produto_id || !loja_id || quantidadeNovaValida === null) {
      return res.status(400).json({
        error: 'Produto, loja e nova quantidade não negativa são obrigatórios',
      });
    }

    await db.transaction(async (trx) => {
      const estoque = await trx('estoque')
        .where({ produto_id, loja_id })
        .forUpdate()
        .first();

      const quantidadeAtual = estoque ? parseFloat(estoque.quantidade) : 0;
      const diferenca = quantidadeNovaValida - quantidadeAtual;

      if (estoque) {
        await trx('estoque')
          .where({ produto_id, loja_id })
          .update({ quantidade: quantidadeNovaValida, updated_at: trx.fn.now() });
      } else {
        await trx('estoque').insert({ produto_id, loja_id, quantidade: quantidadeNovaValida });
      }

      await trx('estoque_movimentacoes').insert({
        produto_id,
        loja_id,
        tipo: 'ajuste',
        quantidade: Math.abs(diferenca),
        motivo: motivo || `Ajuste de estoque: ${quantidadeAtual} → ${quantidadeNovaValida}`,
        referencia_tipo: 'manual',
        usuario_id: req.user.id,
      });
    });

    res.json({ message: 'Ajuste realizado com sucesso' });
  } catch (err) {
    console.error('Erro no ajuste de estoque:', err);
    res.status(500).json({ error: err.message || 'Erro ao realizar ajuste' });
  }
});

// POST /api/estoque/perda - Registro de perda
router.post('/perda', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { produto_id, loja_id, quantidade, motivo } = req.body;
    const quantidadeValida = parsePositiveNumber(quantidade);
    if (!produto_id || !loja_id || quantidadeValida === null) {
      return res.status(400).json({ error: 'Produto, loja e quantidade positiva são obrigatórios' });
    }

    if (!motivo) {
      return res.status(400).json({ error: 'Motivo é obrigatório para registro de perda' });
    }

    await db.transaction(async (trx) => {
      await atualizarEstoque(trx, produto_id, loja_id, quantidadeValida, 'subtrair');

      await trx('estoque_movimentacoes').insert({
        produto_id,
        loja_id,
        tipo: 'perda',
        quantidade: quantidadeValida,
        motivo,
        referencia_tipo: 'manual',
        usuario_id: req.user.id,
      });
    });

    res.json({ message: 'Perda registrada com sucesso' });
  } catch (err) {
    console.error('Erro ao registrar perda:', err);
    res.status(400).json({ error: err.message || 'Erro ao registrar perda' });
  }
});

export default router;
