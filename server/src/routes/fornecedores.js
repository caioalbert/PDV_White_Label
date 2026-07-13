import { Router } from 'express';
import db from '../database.js';
import {
  requireAnyPermission,
  requirePermission,
  verifyToken,
} from '../middleware/auth.js';

const router = Router();

// GET /api/fornecedores
router.get('/', verifyToken, requireAnyPermission('fornecedores', 'compras'), async (req, res) => {
  try {
    let query = db('fornecedores').orderBy('nome');
    const { search } = req.query;

    if (search) {
      query = query.where(function () {
        this.where('nome', 'ilike', `%${search}%`)
          .orWhere('cnpj', 'ilike', `%${search}%`)
          .orWhere('cidade', 'ilike', `%${search}%`);
      });
    }

    const fornecedores = await query;
    res.json(fornecedores);
  } catch (err) {
    console.error('Erro ao listar fornecedores:', err);
    res.status(500).json({ error: 'Erro ao listar fornecedores' });
  }
});

// GET /api/fornecedores/:id
router.get('/:id', verifyToken, requireAnyPermission('fornecedores', 'compras'), async (req, res) => {
  try {
    const fornecedor = await db('fornecedores').where({ id: req.params.id }).first();
    if (!fornecedor) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    res.json(fornecedor);
  } catch (err) {
    console.error('Erro ao buscar fornecedor:', err);
    res.status(500).json({ error: 'Erro ao buscar fornecedor' });
  }
});

// POST /api/fornecedores
router.post('/', verifyToken, requirePermission('fornecedores'), async (req, res) => {
  try {
    const { nome, cnpj, telefone, cidade, observacoes } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

    const documentoNormalizado = String(cnpj || '').replace(/\D/g, '');
    if (documentoNormalizado) {
      const existente = await db('fornecedores')
        .whereRaw(
          "REGEXP_REPLACE(COALESCE(cnpj, ''), '[^0-9]', '', 'g') = ?",
          [documentoNormalizado]
        )
        .first();
      if (existente) {
        return res.status(409).json({ error: 'Já existe um fornecedor com este CNPJ' });
      }
    }

    const [fornecedor] = await db('fornecedores')
      .insert({ nome, cnpj, telefone, cidade, observacoes })
      .returning('*');

    res.status(201).json(fornecedor);
  } catch (err) {
    console.error('Erro ao criar fornecedor:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Já existe um fornecedor com este CNPJ' });
    }
    res.status(500).json({ error: 'Erro ao criar fornecedor' });
  }
});

// PUT /api/fornecedores/:id
router.put('/:id', verifyToken, requirePermission('fornecedores'), async (req, res) => {
  try {
    const { nome, cnpj, telefone, cidade, observacoes } = req.body;
    const documentoNormalizado = String(cnpj || '').replace(/\D/g, '');
    if (documentoNormalizado) {
      const existente = await db('fornecedores')
        .whereNot({ id: req.params.id })
        .whereRaw(
          "REGEXP_REPLACE(COALESCE(cnpj, ''), '[^0-9]', '', 'g') = ?",
          [documentoNormalizado]
        )
        .first();
      if (existente) {
        return res.status(409).json({ error: 'Já existe um fornecedor com este CNPJ' });
      }
    }

    const [fornecedor] = await db('fornecedores')
      .where({ id: req.params.id })
      .update({ nome, cnpj, telefone, cidade, observacoes, updated_at: db.fn.now() })
      .returning('*');

    if (!fornecedor) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    res.json(fornecedor);
  } catch (err) {
    console.error('Erro ao atualizar fornecedor:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Já existe um fornecedor com este CNPJ' });
    }
    res.status(500).json({ error: 'Erro ao atualizar fornecedor' });
  }
});

// DELETE /api/fornecedores/:id
router.delete('/:id', verifyToken, requirePermission('fornecedores'), async (req, res) => {
  try {
    const deleted = await db('fornecedores').where({ id: req.params.id }).del();
    if (!deleted) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    res.json({ message: 'Fornecedor removido com sucesso' });
  } catch (err) {
    console.error('Erro ao remover fornecedor:', err);
    res.status(500).json({ error: 'Erro ao remover fornecedor' });
  }
});

export default router;
