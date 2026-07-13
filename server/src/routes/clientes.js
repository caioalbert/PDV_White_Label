import { Router } from 'express';
import db from '../database.js';
import {
  requireAnyPermission,
  requirePermission,
  verifyToken,
} from '../middleware/auth.js';

const router = Router();

// GET /api/clientes
router.get('/', verifyToken, requireAnyPermission('clientes', 'vendas'), async (req, res) => {
  try {
    let query = db('clientes').orderBy('nome');
    const { search, documento } = req.query;

    if (documento) {
      const documentoNormalizado = String(documento).replace(/\D/g, '');
      query = query.whereRaw(
        "REGEXP_REPLACE(COALESCE(cpf_cnpj, ''), '[^0-9]', '', 'g') = ?",
        [documentoNormalizado]
      );
    } else if (search) {
      query = query.where(function () {
        this.where('nome', 'ilike', `%${search}%`)
          .orWhere('cpf_cnpj', 'ilike', `%${search}%`);
      });
    }

    const clientes = await query;
    res.json(clientes);
  } catch (err) {
    console.error('Erro ao listar clientes:', err);
    res.status(500).json({ error: 'Erro ao listar clientes' });
  }
});

// GET /api/clientes/:id/pendencias - Compras ainda não quitadas
router.get(
  '/:id/pendencias',
  verifyToken,
  requireAnyPermission('clientes', 'vendas'),
  async (req, res) => {
    try {
      const cliente = await db('clientes').where({ id: req.params.id }).first();
      if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

      const vendas = await db('vendas')
        .join('lojas', 'vendas.loja_id', 'lojas.id')
        .select(
          'vendas.id',
          'vendas.created_at',
          'vendas.status_pagamento',
          'vendas.subtotal',
          'vendas.desconto_valor',
          'vendas.valor_pago',
          'lojas.nome as loja_nome'
        )
        .where('vendas.cliente_id', req.params.id)
        .whereIn('vendas.status_pagamento', ['aguardando_pagamento', 'parcial'])
        .orderBy('vendas.created_at', 'asc');

      const pendencias = vendas.map((venda) => {
        const totalBase = Math.max(
          (parseFloat(venda.subtotal) || 0) - (parseFloat(venda.desconto_valor) || 0),
          0
        );
        return {
          ...venda,
          total_base: totalBase,
          saldo_pendente: Math.max(totalBase - (parseFloat(venda.valor_pago) || 0), 0),
        };
      });

      res.json({
        cliente_id: cliente.id,
        quantidade: pendencias.length,
        saldo_total: pendencias.reduce((total, venda) => total + venda.saldo_pendente, 0),
        vendas: pendencias,
      });
    } catch (err) {
      console.error('Erro ao buscar pendências do cliente:', err);
      res.status(500).json({ error: 'Erro ao buscar compras em aberto do cliente' });
    }
  }
);

// GET /api/clientes/:id
router.get('/:id', verifyToken, requireAnyPermission('clientes', 'vendas'), async (req, res) => {
  try {
    const cliente = await db('clientes').where({ id: req.params.id }).first();
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json(cliente);
  } catch (err) {
    console.error('Erro ao buscar cliente:', err);
    res.status(500).json({ error: 'Erro ao buscar cliente' });
  }
});

// POST /api/clientes
router.post('/', verifyToken, requirePermission('clientes'), async (req, res) => {
  try {
    const { nome, cpf_cnpj, telefone, endereco, observacoes } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

    const documentoNormalizado = String(cpf_cnpj || '').replace(/\D/g, '');
    if (documentoNormalizado) {
      const existente = await db('clientes')
        .whereRaw(
          "REGEXP_REPLACE(COALESCE(cpf_cnpj, ''), '[^0-9]', '', 'g') = ?",
          [documentoNormalizado]
        )
        .first();

      if (existente) {
        return res.status(409).json({ error: 'Já existe um cliente com este CPF/CNPJ' });
      }
    }

    const [cliente] = await db('clientes')
      .insert({ nome, cpf_cnpj, telefone, endereco, observacoes })
      .returning('*');

    res.status(201).json(cliente);
  } catch (err) {
    console.error('Erro ao criar cliente:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Já existe um cliente com este CPF/CNPJ' });
    }
    res.status(500).json({ error: 'Erro ao criar cliente' });
  }
});

// PUT /api/clientes/:id
router.put('/:id', verifyToken, requirePermission('clientes'), async (req, res) => {
  try {
    const { nome, cpf_cnpj, telefone, endereco, observacoes } = req.body;

    const documentoNormalizado = String(cpf_cnpj || '').replace(/\D/g, '');
    if (documentoNormalizado) {
      const existente = await db('clientes')
        .whereNot({ id: req.params.id })
        .whereRaw(
          "REGEXP_REPLACE(COALESCE(cpf_cnpj, ''), '[^0-9]', '', 'g') = ?",
          [documentoNormalizado]
        )
        .first();

      if (existente) {
        return res.status(409).json({ error: 'Já existe um cliente com este CPF/CNPJ' });
      }
    }

    const [cliente] = await db('clientes')
      .where({ id: req.params.id })
      .update({ nome, cpf_cnpj, telefone, endereco, observacoes, updated_at: db.fn.now() })
      .returning('*');

    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json(cliente);
  } catch (err) {
    console.error('Erro ao atualizar cliente:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Já existe um cliente com este CPF/CNPJ' });
    }
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

// DELETE /api/clientes/:id
router.delete('/:id', verifyToken, requirePermission('clientes'), async (req, res) => {
  try {
    const deleted = await db('clientes').where({ id: req.params.id }).del();
    if (!deleted) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json({ message: 'Cliente removido com sucesso' });
  } catch (err) {
    console.error('Erro ao remover cliente:', err);
    res.status(500).json({ error: 'Erro ao remover cliente' });
  }
});

export default router;
