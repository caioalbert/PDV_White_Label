import { Router } from 'express';
import db from '../database.js';
import { requirePermission, verifyToken } from '../middleware/auth.js';

const router = Router();
const tiposValidos = new Set(['loja', 'galpao_fabrica']);

// GET /api/lojas
router.get('/', verifyToken, async (req, res) => {
  try {
    let query = db('lojas').orderBy('nome');
    if (req.query.tipo) {
      query = query.where({ tipo: req.query.tipo });
    }
    if (req.query.situacao) {
      query = query.where({ situacao: req.query.situacao });
    }
    const lojas = await query;
    res.json(lojas);
  } catch (err) {
    console.error('Erro ao listar lojas:', err);
    res.status(500).json({ error: 'Erro ao listar lojas' });
  }
});

// GET /api/lojas/:id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const loja = await db('lojas').where({ id: req.params.id }).first();
    if (!loja) return res.status(404).json({ error: 'Loja não encontrada' });
    res.json(loja);
  } catch (err) {
    console.error('Erro ao buscar loja:', err);
    res.status(500).json({ error: 'Erro ao buscar loja' });
  }
});

// POST /api/lojas
router.post('/', verifyToken, requirePermission('lojas'), async (req, res) => {
  try {
    const { nome, cidade, situacao, comissao_percentual, tipo = 'loja' } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    if (!tiposValidos.has(tipo)) {
      return res.status(400).json({ error: 'Tipo de unidade inválido' });
    }
    const comissao = parseFloat(comissao_percentual ?? 0);
    if (!['ativa', 'inativa'].includes(situacao || 'ativa')) {
      return res.status(400).json({ error: 'Situação da loja inválida' });
    }
    if (!Number.isFinite(comissao) || comissao < 0 || comissao > 100) {
      return res.status(400).json({ error: 'Comissão deve estar entre 0% e 100%' });
    }

    const loja = await db.transaction(async (trx) => {
      const [unidade] = await trx('lojas')
        .insert({
          nome,
          cidade,
          situacao: situacao || 'ativa',
          comissao_percentual: tipo === 'loja' ? comissao : 0,
          tipo,
        })
        .returning('*');

      const produtos = await trx('produtos').select('id');
      if (produtos.length > 0) {
        await trx('estoque').insert(produtos.map((produto) => ({
          produto_id: produto.id,
          loja_id: unidade.id,
          quantidade: 0,
        })));
      }
      return unidade;
    });

    res.status(201).json(loja);
  } catch (err) {
    console.error('Erro ao criar loja:', err);
    res.status(500).json({ error: 'Erro ao criar loja' });
  }
});

// PUT /api/lojas/:id
router.put('/:id', verifyToken, requirePermission('lojas'), async (req, res) => {
  try {
    const { nome, cidade, situacao, comissao_percentual, tipo = 'loja' } = req.body;
    const comissao = parseFloat(comissao_percentual ?? 0);
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    if (!tiposValidos.has(tipo)) {
      return res.status(400).json({ error: 'Tipo de unidade inválido' });
    }
    if (!['ativa', 'inativa'].includes(situacao)) {
      return res.status(400).json({ error: 'Situação da loja inválida' });
    }
    if (!Number.isFinite(comissao) || comissao < 0 || comissao > 100) {
      return res.status(400).json({ error: 'Comissão deve estar entre 0% e 100%' });
    }

    const [loja] = await db('lojas')
      .where({ id: req.params.id })
      .update({
        nome,
        cidade,
        situacao,
        comissao_percentual: tipo === 'loja' ? comissao : 0,
        tipo,
        updated_at: db.fn.now(),
      })
      .returning('*');

    if (!loja) return res.status(404).json({ error: 'Loja não encontrada' });
    res.json(loja);
  } catch (err) {
    console.error('Erro ao atualizar loja:', err);
    res.status(500).json({ error: 'Erro ao atualizar loja' });
  }
});

// DELETE /api/lojas/:id
router.delete('/:id', verifyToken, requirePermission('lojas'), async (req, res) => {
  try {
    const deleted = await db('lojas').where({ id: req.params.id }).del();
    if (!deleted) return res.status(404).json({ error: 'Loja não encontrada' });
    res.json({ message: 'Loja removida com sucesso' });
  } catch (err) {
    console.error('Erro ao remover loja:', err);
    res.status(500).json({ error: 'Erro ao remover loja. Verifique se não há dados vinculados.' });
  }
});

export default router;
