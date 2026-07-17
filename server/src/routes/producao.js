import { Router } from 'express';
import db from '../database.js';
import { requirePermission, verifyToken } from '../middleware/auth.js';
import { categoryAllowsComposition } from '../productCategories.js';

const router = Router();

async function listarProdutosProducao() {
  const produtos = await db('produtos')
    .leftJoin('produto_categorias', 'produtos.categoria_id', 'produto_categorias.id')
    .select(
      'produtos.id',
      'produtos.codigo_interno',
      'produtos.nome',
      'produtos.categoria_id',
      'produto_categorias.slug as categoria',
      'produtos.unidade',
      'produtos.preco_venda',
      'produtos.estoque_minimo',
      'produtos.ativo',
      'produto_categorias.nome as categoria_nome',
      'produto_categorias.permite_composicao as categoria_permite_composicao'
    )
    .where('produtos.ativo', true)
    .andWhere((query) => {
      query
        .where('produto_categorias.permite_composicao', true)
        .orWhere('produtos.categoria', 'producao_propria');
    })
    .orderByRaw('produtos.codigo_interno ASC NULLS LAST')
    .orderBy('produtos.nome');

  if (produtos.length === 0) return [];

  const produtoIds = produtos.map((produto) => produto.id);
  const receitas = await db('receitas')
    .whereIn('produto_id', produtoIds)
    .where({ ativo: true })
    .orderBy('id');

  const receitasPorProduto = new Map();
  receitas.forEach((receita) => {
    if (!receitasPorProduto.has(receita.produto_id)) {
      receitasPorProduto.set(receita.produto_id, receita);
    }
  });

  const receitaIds = [...receitasPorProduto.values()].map((receita) => receita.id);
  let insumosPorReceita = new Map();

  if (receitaIds.length > 0) {
    const insumos = await db('receita_insumos')
      .join('produtos', 'receita_insumos.produto_id', 'produtos.id')
      .whereIn('receita_insumos.receita_id', receitaIds)
      .select(
        'receita_insumos.receita_id',
        'receita_insumos.produto_id',
        'receita_insumos.quantidade',
        'produtos.nome as produto_nome',
        'produtos.unidade'
      )
      .orderBy('produtos.nome');

    insumosPorReceita = insumos.reduce((acc, insumo) => {
      const lista = acc.get(insumo.receita_id) || [];
      lista.push(insumo);
      acc.set(insumo.receita_id, lista);
      return acc;
    }, new Map());
  }

  return produtos.map((produto) => {
    const receita = receitasPorProduto.get(produto.id);
    const insumos = receita ? (insumosPorReceita.get(receita.id) || []) : [];

    return {
      ...produto,
      produto_id: produto.id,
      categoria_permite_composicao: categoryAllowsComposition(produto),
      receita_id: receita?.id || null,
      receita_nome: receita?.nome || null,
      tem_composicao: insumos.length > 0,
      insumos,
    };
  });
}

// =================== RECEITAS ===================

// GET /api/producao/produtos
router.get('/produtos', verifyToken, requirePermission('producao'), async (req, res) => {
  try {
    const produtos = await listarProdutosProducao();
    res.json(produtos);
  } catch (err) {
    console.error('Erro ao listar produtos de produção:', err);
    res.status(500).json({ error: 'Erro ao listar produtos de produção' });
  }
});

// GET /api/producao/receitas
router.get('/receitas', verifyToken, requirePermission('producao'), async (req, res) => {
  try {
    const receitas = await db('receitas')
      .join('produtos', 'receitas.produto_id', 'produtos.id')
      .select('receitas.*', 'produtos.nome as produto_nome')
      .orderBy('receitas.nome');

    // Buscar insumos de cada receita
    const receitasComInsumos = await Promise.all(
      receitas.map(async (receita) => {
        const insumos = await db('receita_insumos')
          .join('produtos', 'receita_insumos.produto_id', 'produtos.id')
          .select('receita_insumos.*', 'produtos.nome as produto_nome', 'produtos.unidade')
          .where('receita_insumos.receita_id', receita.id);
        return { ...receita, insumos };
      })
    );

    res.json(receitasComInsumos);
  } catch (err) {
    console.error('Erro ao listar receitas:', err);
    res.status(500).json({ error: 'Erro ao listar receitas' });
  }
});

// GET /api/producao/receitas/:id
router.get('/receitas/:id', verifyToken, requirePermission('producao'), async (req, res) => {
  try {
    const receita = await db('receitas')
      .join('produtos', 'receitas.produto_id', 'produtos.id')
      .select('receitas.*', 'produtos.nome as produto_nome')
      .where('receitas.id', req.params.id)
      .first();

    if (!receita) return res.status(404).json({ error: 'Receita não encontrada' });

    const insumos = await db('receita_insumos')
      .join('produtos', 'receita_insumos.produto_id', 'produtos.id')
      .select('receita_insumos.*', 'produtos.nome as produto_nome', 'produtos.unidade')
      .where('receita_insumos.receita_id', receita.id);

    res.json({ ...receita, insumos });
  } catch (err) {
    console.error('Erro ao buscar receita:', err);
    res.status(500).json({ error: 'Erro ao buscar receita' });
  }
});

// POST /api/producao/receitas
router.post('/receitas', verifyToken, requirePermission('producao'), async (req, res) => {
  try {
    const { produto_id, nome, insumos } = req.body;

    if (!produto_id || !nome || !insumos || insumos.length === 0) {
      return res.status(400).json({ error: 'Produto, nome e insumos são obrigatórios' });
    }

    const receitaExistente = await db('receitas').where({ produto_id }).first();
    if (receitaExistente) {
      return res.status(409).json({ error: 'Este produto já possui uma composição cadastrada' });
    }

    const result = await db.transaction(async (trx) => {
      const [receita] = await trx('receitas')
        .insert({ produto_id, nome })
        .returning('*');

      const insumosData = insumos.map((insumo) => ({
        receita_id: receita.id,
        produto_id: insumo.produto_id,
        quantidade: insumo.quantidade,
      }));

      await trx('receita_insumos').insert(insumosData);

      return receita;
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('Erro ao criar receita:', err);
    res.status(500).json({ error: 'Erro ao criar receita' });
  }
});

// PUT /api/producao/receitas/:id
router.put('/receitas/:id', verifyToken, requirePermission('producao'), async (req, res) => {
  try {
    const { produto_id, nome, ativo, insumos } = req.body;

    if (produto_id) {
      const receitaExistente = await db('receitas')
        .where({ produto_id })
        .whereNot({ id: req.params.id })
        .first();
      if (receitaExistente) {
        return res.status(409).json({ error: 'Este produto já possui outra composição cadastrada' });
      }
    }

    const result = await db.transaction(async (trx) => {
      const [receita] = await trx('receitas')
        .where({ id: req.params.id })
        .update({ produto_id, nome, ativo })
        .returning('*');

      if (!receita) throw new Error('Receita não encontrada');

      if (insumos) {
        await trx('receita_insumos').where({ receita_id: receita.id }).del();
        const insumosData = insumos.map((insumo) => ({
          receita_id: receita.id,
          produto_id: insumo.produto_id,
          quantidade: insumo.quantidade,
        }));
        await trx('receita_insumos').insert(insumosData);
      }

      return receita;
    });

    res.json(result);
  } catch (err) {
    console.error('Erro ao atualizar receita:', err);
    if (err.message === 'Receita não encontrada') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Erro ao atualizar receita' });
  }
});

// DELETE /api/producao/receitas/:id
router.delete('/receitas/:id', verifyToken, requirePermission('producao'), async (req, res) => {
  try {
    const deleted = await db('receitas').where({ id: req.params.id }).del();
    if (!deleted) return res.status(404).json({ error: 'Receita não encontrada' });
    res.json({ message: 'Receita removida com sucesso' });
  } catch (err) {
    console.error('Erro ao remover receita:', err);
    res.status(500).json({ error: 'Erro ao remover receita' });
  }
});

// =================== ORDENS DE PRODUÇÃO ===================

// GET /api/producao/ordens
router.get('/ordens', verifyToken, requirePermission('producao'), async (req, res) => {
  try {
    let query = db('ordens_producao')
      .join('receitas', 'ordens_producao.receita_id', 'receitas.id')
      .join('produtos', 'receitas.produto_id', 'produtos.id')
      .join('lojas', 'ordens_producao.loja_id', 'lojas.id')
      .leftJoin('usuarios', 'ordens_producao.usuario_id', 'usuarios.id')
      .select(
        'ordens_producao.*',
        'receitas.nome as receita_nome',
        'produtos.nome as produto_nome',
        'lojas.nome as loja_nome',
        'usuarios.nome as usuario_nome'
      )
      .orderBy('ordens_producao.created_at', 'desc');

    const lojaFiltro = req.user.perfil === 'vendedor' ? req.user.loja_id : req.query.loja_id;
    if (lojaFiltro) query = query.where('ordens_producao.loja_id', lojaFiltro);

    const ordens = await query;
    res.json(ordens);
  } catch (err) {
    console.error('Erro ao listar ordens:', err);
    res.status(500).json({ error: 'Erro ao listar ordens de produção' });
  }
});

// POST /api/producao/produzir - Executar produção
router.post('/produzir', verifyToken, requirePermission('producao'), async (req, res) => {
  try {
    const { receita_id, produto_id, loja_id, quantidade } = req.body;
    const lojaFiltro = req.user.perfil === 'vendedor' ? req.user.loja_id : loja_id;
    const quantidadeProducao = parseFloat(quantidade);

    if (
      (!receita_id && !produto_id)
      || !lojaFiltro
      || !Number.isFinite(quantidadeProducao)
      || quantidadeProducao <= 0
    ) {
      return res.status(400).json({ error: 'Produto, loja e quantidade são obrigatórios' });
    }

    let receitaQuery = db('receitas').where({ ativo: true });
    if (receita_id) {
      receitaQuery = receitaQuery.where({ id: receita_id });
    } else {
      receitaQuery = receitaQuery.where({ produto_id });
    }

    const receita = await receitaQuery.orderBy('id').first();

    if (!receita) {
      return res.status(produto_id ? 400 : 404).json({
        error: produto_id
          ? 'Produto sem composição cadastrada'
          : 'Receita não encontrada ou inativa',
      });
    }

    const insumos = await db('receita_insumos')
      .join('produtos', 'receita_insumos.produto_id', 'produtos.id')
      .where({ receita_id: receita.id })
      .select('receita_insumos.*', 'produtos.nome as produto_nome');

    if (insumos.length === 0) {
      return res.status(400).json({
        error: 'Este produto não possui insumos configurados na composição',
      });
    }

    const result = await db.transaction(async (trx) => {
      const unidade = await trx('lojas')
        .where({ id: lojaFiltro, situacao: 'ativa' })
        .first();
      if (!unidade) throw new Error('Unidade de produção não encontrada ou inativa');

      // Validar e subtrair matéria-prima
      for (const insumo of insumos) {
        const qtdNecessaria = parseFloat(insumo.quantidade) * quantidadeProducao;

        const estoque = await trx('estoque')
          .where({ produto_id: insumo.produto_id, loja_id: lojaFiltro })
          .forUpdate()
          .first();

        if (!estoque || parseFloat(estoque.quantidade) < qtdNecessaria) {
          throw new Error(
            `Estoque insuficiente de "${insumo.produto_nome}". Necessário: ${qtdNecessaria}, Disponível: ${estoque?.quantidade || 0}`
          );
        }

        // Subtrair insumo do estoque
        await trx('estoque')
          .where({ produto_id: insumo.produto_id, loja_id: lojaFiltro })
          .update({
            quantidade: parseFloat(estoque.quantidade) - qtdNecessaria,
            updated_at: trx.fn.now(),
          });

        // Registrar movimentação de saída do insumo
        await trx('estoque_movimentacoes').insert({
          produto_id: insumo.produto_id,
          loja_id: lojaFiltro,
          tipo: 'saida',
          quantidade: qtdNecessaria,
          motivo: `Consumo produção receita "${receita.nome}" (${quantidadeProducao} un)`,
          referencia_tipo: 'producao',
          usuario_id: req.user.id,
        });
      }

      // Adicionar produto finalizado ao estoque
      const estoqueProduto = await trx('estoque')
        .where({ produto_id: receita.produto_id, loja_id: lojaFiltro })
        .forUpdate()
        .first();

      if (estoqueProduto) {
        await trx('estoque')
          .where({ produto_id: receita.produto_id, loja_id: lojaFiltro })
          .update({
            quantidade: parseFloat(estoqueProduto.quantidade) + quantidadeProducao,
            updated_at: trx.fn.now(),
          });
      } else {
        await trx('estoque').insert({
          produto_id: receita.produto_id,
          loja_id: lojaFiltro,
          quantidade: quantidadeProducao,
        });
      }

      // Registrar movimentação de entrada do produto produzido
      await trx('estoque_movimentacoes').insert({
        produto_id: receita.produto_id,
        loja_id: lojaFiltro,
        tipo: 'entrada',
        quantidade: quantidadeProducao,
        motivo: `Produção receita "${receita.nome}"`,
        referencia_tipo: 'producao',
        usuario_id: req.user.id,
      });

      // Criar ordem de produção
      const [ordem] = await trx('ordens_producao')
        .insert({
          receita_id: receita.id,
          loja_id: lojaFiltro,
          quantidade_produzida: quantidadeProducao,
          usuario_id: req.user.id,
          status: 'concluida',
        })
        .returning('*');

      return ordem;
    });

    res.status(201).json({ message: 'Produção realizada com sucesso', ordem: result });
  } catch (err) {
    console.error('Erro ao produzir:', err);
    res.status(400).json({ error: err.message || 'Erro ao executar produção' });
  }
});

export default router;
