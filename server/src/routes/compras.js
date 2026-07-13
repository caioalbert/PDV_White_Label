import { Router } from 'express';
import db from '../database.js';
import { requirePermission, verifyToken } from '../middleware/auth.js';

const router = Router();

// GET /api/compras
router.get('/', verifyToken, requirePermission('compras'), async (req, res) => {
  try {
    let query = db('compras')
      .leftJoin('fornecedores', 'compras.fornecedor_id', 'fornecedores.id')
      .join('lojas', 'compras.loja_id', 'lojas.id')
      .leftJoin('usuarios', 'compras.usuario_id', 'usuarios.id')
      .select(
        'compras.*',
        'fornecedores.nome as fornecedor_nome',
        'lojas.nome as loja_nome',
        'usuarios.nome as usuario_nome'
      )
      .orderBy('compras.created_at', 'desc');

    const { status, fornecedor_id } = req.query;
    const lojaFiltro = req.user.perfil === 'vendedor' ? req.user.loja_id : req.query.loja_id;
    if (lojaFiltro) query = query.where('compras.loja_id', lojaFiltro);
    if (status) query = query.where('compras.status', status);
    if (fornecedor_id) query = query.where('compras.fornecedor_id', fornecedor_id);

    const compras = await query;
    res.json(compras);
  } catch (err) {
    console.error('Erro ao listar compras:', err);
    res.status(500).json({ error: 'Erro ao listar compras' });
  }
});

// GET /api/compras/:id
router.get('/:id', verifyToken, requirePermission('compras'), async (req, res) => {
  try {
    const compra = await db('compras')
      .leftJoin('fornecedores', 'compras.fornecedor_id', 'fornecedores.id')
      .join('lojas', 'compras.loja_id', 'lojas.id')
      .select('compras.*', 'fornecedores.nome as fornecedor_nome', 'lojas.nome as loja_nome')
      .where('compras.id', req.params.id)
      .modify((query) => {
        if (req.user.perfil === 'vendedor') {
          query.where('compras.loja_id', req.user.loja_id);
        }
      })
      .first();

    if (!compra) return res.status(404).json({ error: 'Compra não encontrada' });

    const itens = await db('compra_itens')
      .join('produtos', 'compra_itens.produto_id', 'produtos.id')
      .select('compra_itens.*', 'produtos.nome as produto_nome', 'produtos.unidade')
      .where('compra_itens.compra_id', compra.id);

    res.json({ ...compra, itens });
  } catch (err) {
    console.error('Erro ao buscar compra:', err);
    res.status(500).json({ error: 'Erro ao buscar compra' });
  }
});

// POST /api/compras
router.post('/', verifyToken, requirePermission('compras'), async (req, res) => {
  try {
    const { fornecedor_id, loja_id, observacoes, itens } = req.body;
    const lojaFiltro = req.user.perfil === 'vendedor' ? req.user.loja_id : loja_id;

    if (!lojaFiltro || !itens || itens.length === 0) {
      return res.status(400).json({ error: 'Loja e itens são obrigatórios' });
    }

    const itensNormalizados = itens.map((item) => ({
      produto_id: item.produto_id,
      quantidade_comprada: parseFloat(item.quantidade_comprada ?? item.quantidade),
      preco_unitario: parseFloat(item.preco_unitario),
      unidade_compra: 'tonelada',
      fator_conversao_estoque: parseFloat(item.fator_conversao_estoque),
    }));

    if (itensNormalizados.some((item) =>
      !item.produto_id ||
      !Number.isFinite(item.quantidade_comprada) ||
      item.quantidade_comprada <= 0 ||
      !Number.isFinite(item.preco_unitario) ||
      item.preco_unitario < 0 ||
      !Number.isFinite(item.fator_conversao_estoque) ||
      item.fator_conversao_estoque <= 0
    )) {
      return res.status(400).json({
        error: 'Informe toneladas, preço por tonelada e conversão para estoque válidos',
      });
    }

    const total = itensNormalizados.reduce(
      (sum, item) => sum + (item.quantidade_comprada * item.preco_unitario),
      0
    );

    const result = await db.transaction(async (trx) => {
      const unidade = await trx('lojas')
        .where({ id: lojaFiltro, situacao: 'ativa' })
        .first();
      if (!unidade) throw new Error('Unidade de destino não encontrada ou inativa');

      const [compra] = await trx('compras')
        .insert({
          fornecedor_id,
          loja_id: lojaFiltro,
          observacoes,
          total,
          usuario_id: req.user.id,
          status: 'pendente',
        })
        .returning('*');

      const itensData = itensNormalizados.map((item) => ({
        compra_id: compra.id,
        produto_id: item.produto_id,
        quantidade_comprada: item.quantidade_comprada,
        preco_unitario: item.preco_unitario,
        unidade_compra: item.unidade_compra,
        fator_conversao_estoque: item.fator_conversao_estoque,
      }));

      await trx('compra_itens').insert(itensData);

      return compra;
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('Erro ao criar compra:', err);
    res.status(400).json({ error: err.message || 'Erro ao criar compra' });
  }
});

// PUT /api/compras/:id
router.put('/:id', verifyToken, requirePermission('compras'), async (req, res) => {
  try {
    const compra = await db('compras').where({ id: req.params.id }).first();
    if (!compra) return res.status(404).json({ error: 'Compra não encontrada' });
    if (req.user.perfil === 'vendedor' && compra.loja_id !== req.user.loja_id) {
      return res.status(403).json({ error: 'Compra pertence a outra loja' });
    }
    if (compra.status !== 'pendente') {
      return res.status(400).json({ error: 'Só é possível editar compras pendentes' });
    }

    const { fornecedor_id, loja_id, observacoes, itens } = req.body;
    const lojaFiltro = req.user.perfil === 'vendedor' ? req.user.loja_id : loja_id;
    if (itens && (!Array.isArray(itens) || itens.length === 0)) {
      return res.status(400).json({ error: 'A compra deve ter pelo menos um item' });
    }
    const itensNormalizados = itens?.map((item) => ({
      produto_id: item.produto_id,
      quantidade_comprada: parseFloat(item.quantidade_comprada),
      preco_unitario: parseFloat(item.preco_unitario),
      unidade_compra: 'tonelada',
      fator_conversao_estoque: parseFloat(item.fator_conversao_estoque),
    }));

    if (itensNormalizados?.some((item) =>
      !item.produto_id ||
      !Number.isFinite(item.quantidade_comprada) ||
      item.quantidade_comprada <= 0 ||
      !Number.isFinite(item.preco_unitario) ||
      item.preco_unitario < 0 ||
      !Number.isFinite(item.fator_conversao_estoque) ||
      item.fator_conversao_estoque <= 0
    )) {
      return res.status(400).json({
        error: 'Informe toneladas, preço por tonelada e conversão para estoque válidos',
      });
    }

    const result = await db.transaction(async (trx) => {
      const unidade = await trx('lojas')
        .where({ id: lojaFiltro, situacao: 'ativa' })
        .first();
      if (!unidade) throw new Error('Unidade de destino não encontrada ou inativa');

      const total = itensNormalizados
        ? itensNormalizados.reduce(
          (sum, item) => sum + (item.quantidade_comprada * item.preco_unitario),
          0
        )
        : compra.total;

      const [updated] = await trx('compras')
        .where({ id: req.params.id })
        .update({
          fornecedor_id,
          loja_id: lojaFiltro,
          observacoes,
          total,
          updated_at: db.fn.now(),
        })
        .returning('*');

      if (itensNormalizados) {
        await trx('compra_itens').where({ compra_id: req.params.id }).del();
        const itensData = itensNormalizados.map((item) => ({
          compra_id: updated.id,
          ...item,
        }));
        await trx('compra_itens').insert(itensData);
      }

      return updated;
    });

    res.json(result);
  } catch (err) {
    console.error('Erro ao atualizar compra:', err);
    res.status(400).json({ error: err.message || 'Erro ao atualizar compra' });
  }
});

// DELETE /api/compras/:id
router.delete('/:id', verifyToken, requirePermission('compras'), async (req, res) => {
  try {
    const compra = await db('compras').where({ id: req.params.id }).first();
    if (!compra) return res.status(404).json({ error: 'Compra não encontrada' });
    if (req.user.perfil === 'vendedor' && compra.loja_id !== req.user.loja_id) {
      return res.status(403).json({ error: 'Compra pertence a outra loja' });
    }
    if (compra.status !== 'pendente') {
      return res.status(400).json({ error: 'Só é possível excluir compras pendentes' });
    }

    await db('compras').where({ id: req.params.id }).del();
    res.json({ message: 'Compra removida com sucesso' });
  } catch (err) {
    console.error('Erro ao remover compra:', err);
    res.status(500).json({ error: 'Erro ao remover compra' });
  }
});

// POST /api/compras/:id/receber - Recebimento de compra com divergência
router.post('/:id/receber', verifyToken, requirePermission('compras'), async (req, res) => {
  try {
    const { itens } = req.body;
    // itens: [{ compra_item_id, quantidade_recebida, motivo_divergencia? }]

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: 'Itens de recebimento são obrigatórios' });
    }

    const chavesItens = itens.map((item) =>
      item.compra_item_id ? `id:${item.compra_item_id}` : `produto:${item.produto_id}`
    );
    if (new Set(chavesItens).size !== chavesItens.length) {
      return res.status(400).json({ error: 'Não é permitido repetir o mesmo item no recebimento' });
    }

    const result = await db.transaction(async (trx) => {
      const compra = await trx('compras')
        .where({ id: req.params.id })
        .forUpdate()
        .first();
      if (!compra) {
        const error = new Error('Compra não encontrada');
        error.status = 404;
        throw error;
      }
      if (req.user.perfil === 'vendedor' && compra.loja_id !== req.user.loja_id) {
        const error = new Error('Compra pertence a outra loja');
        error.status = 403;
        throw error;
      }
      if (compra.status === 'recebido') {
        throw new Error('Compra já totalmente recebida');
      }

      let totalRecebido = 0;

      for (const item of itens) {
        let compraItemQuery = trx('compra_itens').where({ compra_id: compra.id });
        if (item.compra_item_id) {
          compraItemQuery = compraItemQuery.where({ id: item.compra_item_id });
        } else {
          compraItemQuery = compraItemQuery.where({ produto_id: item.produto_id });
        }

        const compraItem = await compraItemQuery.forUpdate().first();

        if (!compraItem) {
          throw new Error('Um dos itens não pertence a esta compra');
        }
        if (compraItem.recebido_em) {
          throw new Error(`O item #${compraItem.id} já foi recebido`);
        }

        const qtdRecebida = parseFloat(item.quantidade_recebida);
        if (
          !Number.isFinite(qtdRecebida)
          || qtdRecebida < 0
          || qtdRecebida > parseFloat(compraItem.quantidade_comprada)
        ) {
          throw new Error('Quantidade recebida inválida');
        }

        const fatorConversao = parseFloat(compraItem.fator_conversao_estoque) || 1;
        const quantidadeEstoque = qtdRecebida * fatorConversao;
        const divergencia = parseFloat(compraItem.quantidade_comprada) - qtdRecebida;
        if (divergencia > 0 && !String(item.motivo_divergencia || '').trim()) {
          throw new Error('Informe o motivo da divergência para todos os itens');
        }
        totalRecebido += qtdRecebida * parseFloat(compraItem.preco_unitario);

        // Atualizar item da compra
        await trx('compra_itens')
          .where({ id: compraItem.id })
          .update({
            quantidade_recebida: qtdRecebida,
            quantidade_estoque_recebida: quantidadeEstoque,
            divergencia,
            motivo_divergencia: item.motivo_divergencia || null,
            recebido_em: trx.fn.now(),
          });

        // Só entra no estoque a quantidade efetivamente recebida
        if (quantidadeEstoque > 0) {
          // Atualizar ou criar registro de estoque
          const estoqueExistente = await trx('estoque')
            .where({ produto_id: compraItem.produto_id, loja_id: compra.loja_id })
            .forUpdate()
            .first();

          if (estoqueExistente) {
            await trx('estoque')
              .where({ produto_id: compraItem.produto_id, loja_id: compra.loja_id })
              .update({
                quantidade: parseFloat(estoqueExistente.quantidade) + quantidadeEstoque,
                updated_at: trx.fn.now(),
              });
          } else {
            await trx('estoque').insert({
              produto_id: compraItem.produto_id,
              loja_id: compra.loja_id,
              quantidade: quantidadeEstoque,
            });
          }

          // Registrar movimentação de estoque
          await trx('estoque_movimentacoes').insert({
            produto_id: compraItem.produto_id,
            loja_id: compra.loja_id,
            tipo: 'entrada',
            quantidade: quantidadeEstoque,
            motivo: `Recebimento compra #${compra.id}: ${qtdRecebida} t`,
            referencia_tipo: 'compra',
            referencia_id: compra.id,
            usuario_id: req.user.id,
          });
        }
      }

      // Verificar status geral da compra
      const todosItens = await trx('compra_itens').where({ compra_id: compra.id });
      const todosRecebidos = todosItens.every((i) => Boolean(i.recebido_em));
      const algumRecebido = todosItens.some((i) => Boolean(i.recebido_em));

      const novoStatus = todosRecebidos ? 'recebido' : algumRecebido ? 'recebido_parcial' : 'pendente';

      await trx('compras')
        .where({ id: compra.id })
        .update({ status: novoStatus, updated_at: trx.fn.now() });

      if (totalRecebido > 0) {
        await trx('financeiro_lancamentos').insert({
          loja_id: compra.loja_id,
          tipo: 'saida',
          categoria: 'compra',
          descricao: `Recebimento compra #${compra.id}`,
          valor: totalRecebido,
          referencia_tipo: 'compra',
          referencia_id: compra.id,
          usuario_id: req.user.id,
        });
      }

      return { status: novoStatus, total_recebido: totalRecebido };
    });

    res.json({ message: 'Recebimento registrado com sucesso', ...result });
  } catch (err) {
    console.error('Erro ao receber compra:', err);
    res.status(err.status || 400).json({ error: err.message || 'Erro ao processar recebimento' });
  }
});

export default router;
