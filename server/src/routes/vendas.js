import { Router } from 'express';
import db from '../database.js';
import { requirePermission, verifyToken } from '../middleware/auth.js';

const router = Router();
const formasPagamento = ['pix', 'dinheiro', 'debito', 'credito'];

function totalBaseVenda(venda) {
  return Math.max(
    (parseFloat(venda.subtotal) || 0) - (parseFloat(venda.desconto_valor) || 0),
    0
  );
}

function saldoVenda(venda) {
  return Math.max(totalBaseVenda(venda) - (parseFloat(venda.valor_pago) || 0), 0);
}

function podeAcessarVenda(user, venda) {
  return user.perfil !== 'vendedor' || venda.loja_id === user.loja_id;
}

// GET /api/vendas
router.get('/', verifyToken, requirePermission('vendas'), async (req, res) => {
  try {
    let query = db('vendas')
      .join('lojas', 'vendas.loja_id', 'lojas.id')
      .leftJoin('clientes', 'vendas.cliente_id', 'clientes.id')
      .leftJoin('usuarios', 'vendas.usuario_id', 'usuarios.id')
      .select(
        'vendas.*',
        'lojas.nome as loja_nome',
        'clientes.nome as cliente_nome',
        'usuarios.nome as usuario_nome'
      )
      .orderBy('vendas.created_at', 'desc');

    const { loja_id, tipo, data_inicio, data_fim } = req.query;
    if (loja_id) query = query.where('vendas.loja_id', loja_id);
    if (tipo) query = query.where('vendas.tipo', tipo);
    if (data_inicio) query = query.where('vendas.created_at', '>=', data_inicio);
    if (data_fim) query = query.where('vendas.created_at', '<=', `${data_fim} 23:59:59`);

    // Vendedor só vê vendas da própria loja
    if (req.user.perfil === 'vendedor') {
      query = query.where('vendas.loja_id', req.user.loja_id);
    }

    const vendas = await query;
    res.json(vendas);
  } catch (err) {
    console.error('Erro ao listar vendas:', err);
    res.status(500).json({ error: 'Erro ao listar vendas' });
  }
});

// GET /api/vendas/:id
router.get('/:id', verifyToken, requirePermission('vendas'), async (req, res) => {
  try {
    const venda = await db('vendas')
      .join('lojas', 'vendas.loja_id', 'lojas.id')
      .leftJoin('clientes', 'vendas.cliente_id', 'clientes.id')
      .leftJoin('usuarios', 'vendas.usuario_id', 'usuarios.id')
      .select(
        'vendas.*',
        'lojas.nome as loja_nome',
        'clientes.nome as cliente_nome',
        'usuarios.nome as usuario_nome'
      )
      .where('vendas.id', req.params.id)
      .first();

    if (!venda) return res.status(404).json({ error: 'Venda não encontrada' });
    if (req.user.perfil === 'vendedor' && venda.loja_id !== req.user.loja_id) {
      return res.status(403).json({ error: 'Acesso restrito às vendas da própria loja' });
    }

    const itens = await db('venda_itens')
      .join('produtos', 'venda_itens.produto_id', 'produtos.id')
      .select('venda_itens.*', 'produtos.nome as produto_nome', 'produtos.unidade')
      .where('venda_itens.venda_id', venda.id);

    const pagamentos = await db('venda_pagamentos')
      .leftJoin('usuarios', 'venda_pagamentos.usuario_id', 'usuarios.id')
      .select('venda_pagamentos.*', 'usuarios.nome as usuario_nome')
      .where('venda_pagamentos.venda_id', venda.id)
      .orderBy('venda_pagamentos.created_at');

    res.json({ ...venda, saldo_pendente: saldoVenda(venda), itens, pagamentos });
  } catch (err) {
    console.error('Erro ao buscar venda:', err);
    res.status(500).json({ error: 'Erro ao buscar venda' });
  }
});

// POST /api/vendas - Criar e finalizar venda
router.post('/', verifyToken, requirePermission('vendas'), async (req, res) => {
  try {
    const {
      cliente_id,
      loja_id,
      tipo,
      itens,
      desconto_percentual,
    } = req.body;

    const lojaVendaId = req.user.perfil === 'vendedor' ? req.user.loja_id : loja_id;

    if (!lojaVendaId || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: 'Loja e itens são obrigatórios' });
    }
    if (tipo && !['varejo', 'atacado'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo de venda inválido' });
    }

    const itensAgrupados = new Map();
    for (const item of itens) {
      const produtoId = parseInt(item.produto_id, 10);
      const quantidade = parseFloat(item.quantidade);
      if (!produtoId || !Number.isFinite(quantidade) || quantidade <= 0) {
        return res.status(400).json({ error: 'Todos os itens devem ter produto e quantidade válida' });
      }
      itensAgrupados.set(produtoId, (itensAgrupados.get(produtoId) || 0) + quantidade);
    }
    const itensNormalizados = [...itensAgrupados.entries()]
      .map(([produto_id, quantidade]) => ({ produto_id, quantidade }))
      .sort((a, b) => a.produto_id - b.produto_id);

    // Buscar configuração de desconto
    const configDescontoMax = await db('configuracoes').where({ chave: 'desconto_maximo' }).first();

    const descontoMaximo = parseFloat(configDescontoMax?.valor || 20);

    const descontoPerc = parseFloat(desconto_percentual) || 0;
    if (descontoPerc < 0 || descontoPerc > descontoMaximo) {
      return res.status(400).json({ error: `Desconto máximo permitido é ${descontoMaximo}%` });
    }

    const result = await db.transaction(async (trx) => {
      const loja = await trx('lojas')
        .where({ id: lojaVendaId, situacao: 'ativa', tipo: 'loja' })
        .first();
      if (!loja) throw new Error('A venda deve ser registrada em uma loja ativa');

      if (cliente_id) {
        const cliente = await trx('clientes').where({ id: cliente_id }).first();
        if (!cliente) throw new Error('Cliente não encontrado');
      }

      // Calcular subtotal e validar estoque
      let subtotal = 0;
      const itensProcessados = [];

      for (const item of itensNormalizados) {
        const produto = await trx('produtos').where({ id: item.produto_id, ativo: true }).first();
        if (!produto) throw new Error(`Produto ID ${item.produto_id} não encontrado ou inativo`);

        const precoCadastrado = parseFloat(produto.preco_venda);
        if (!Number.isFinite(precoCadastrado) || precoCadastrado <= 0) {
          throw new Error(`Produto sem preço cadastrado: "${produto.nome}"`);
        }

        const preco = precoCadastrado;
        const quantidade = item.quantidade;
        const itemSubtotal = preco * quantidade;
        subtotal += itemSubtotal;

        // Validar estoque
        const estoque = await trx('estoque')
          .where({ produto_id: item.produto_id, loja_id: lojaVendaId })
          .forUpdate()
          .first();

        if (!estoque || parseFloat(estoque.quantidade) < quantidade) {
          throw new Error(
            `Estoque insuficiente de "${produto.nome}". Disponível: ${estoque?.quantidade || 0}, Solicitado: ${quantidade}`
          );
        }

        itensProcessados.push({
          produto_id: item.produto_id,
          quantidade,
          preco_unitario: preco,
          subtotal: itemSubtotal,
          estoque_atual: parseFloat(estoque.quantidade),
        });
      }

      // Calcular desconto
      const descontoValor = subtotal * (descontoPerc / 100);
      const total = subtotal - descontoValor;

      // Calcular comissão da loja
      const comissaoPerc = parseFloat(loja.comissao_percentual) || 0;
      const comissaoValor = total * (comissaoPerc / 100);

      // Criar venda
      const [venda] = await trx('vendas')
        .insert({
          cliente_id: cliente_id || null,
          loja_id: lojaVendaId,
          usuario_id: req.user.id,
          tipo: tipo || 'varejo',
          subtotal,
          desconto_percentual: descontoPerc,
          desconto_valor: descontoValor,
          taxa_cartao: 0,
          total,
          forma_pagamento: null,
          status_pagamento: 'aguardando_pagamento',
          valor_pago: 0,
          comissao_valor: comissaoValor,
        })
        .returning('*');

      // Criar itens da venda
      const itensVenda = itensProcessados.map(({ estoque_atual: _estoqueAtual, ...item }) => ({
        venda_id: venda.id,
        ...item,
      }));
      await trx('venda_itens').insert(itensVenda);

      // Subtrair do estoque e registrar movimentações
      for (const item of itensProcessados) {
        await trx('estoque')
          .where({ produto_id: item.produto_id, loja_id: lojaVendaId })
          .update({
            quantidade: item.estoque_atual - item.quantidade,
            updated_at: trx.fn.now(),
          });

        await trx('estoque_movimentacoes').insert({
          produto_id: item.produto_id,
          loja_id: lojaVendaId,
          tipo: 'saida',
          quantidade: item.quantidade,
          motivo: `Venda #${venda.id}`,
          referencia_tipo: 'venda',
          referencia_id: venda.id,
          usuario_id: req.user.id,
        });
      }

      return venda;
    });

    // Buscar venda completa para retorno
    const vendaCompleta = await db('vendas')
      .join('lojas', 'vendas.loja_id', 'lojas.id')
      .leftJoin('clientes', 'vendas.cliente_id', 'clientes.id')
      .select('vendas.*', 'lojas.nome as loja_nome', 'clientes.nome as cliente_nome')
      .where('vendas.id', result.id)
      .first();

    const itensVenda = await db('venda_itens')
      .join('produtos', 'venda_itens.produto_id', 'produtos.id')
      .select('venda_itens.*', 'produtos.nome as produto_nome', 'produtos.unidade')
      .where('venda_itens.venda_id', result.id);

    res.status(201).json({
      ...vendaCompleta,
      saldo_pendente: saldoVenda(vendaCompleta),
      itens: itensVenda,
      pagamentos: [],
    });
  } catch (err) {
    console.error('Erro ao criar venda:', err);
    res.status(400).json({ error: err.message || 'Erro ao criar venda' });
  }
});

// POST /api/vendas/:id/pagamentos - Registrar recebimento manual
router.post('/:id/pagamentos', verifyToken, requirePermission('vendas'), async (req, res) => {
  try {
    const formaPagamento = String(req.body.forma_pagamento || '').toLowerCase();
    const valor = parseFloat(req.body.valor);
    const valorInformado = parseFloat(req.body.valor_recebido);

    if (!formasPagamento.includes(formaPagamento)) {
      return res.status(400).json({ error: 'Forma de pagamento inválida' });
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      return res.status(400).json({ error: 'Informe um valor de pagamento válido' });
    }

    const result = await db.transaction(async (trx) => {
      const venda = await trx('vendas').where({ id: req.params.id }).forUpdate().first();
      if (!venda) throw new Error('Venda não encontrada');
      if (!podeAcessarVenda(req.user, venda)) {
        const error = new Error('Acesso restrito às vendas da própria loja');
        error.status = 403;
        throw error;
      }

      const saldoAtual = saldoVenda(venda);
      if (saldoAtual <= 0.009) throw new Error('Esta venda já está paga');
      if (valor > saldoAtual + 0.009) {
        throw new Error(`O valor excede o saldo pendente de R$ ${saldoAtual.toFixed(2)}`);
      }

      let taxaPercentual = 0;
      if (formaPagamento === 'debito' || formaPagamento === 'credito') {
        const chave = formaPagamento === 'debito' ? 'taxa_debito' : 'taxa_credito';
        const config = await trx('configuracoes').where({ chave }).first();
        taxaPercentual = parseFloat(config?.valor) || 0;
      }

      const taxaValor = valor * (taxaPercentual / 100);
      const valorCobrado = valor + taxaValor;
      const valorRecebido = formaPagamento === 'dinheiro'
        ? (Number.isFinite(valorInformado) ? valorInformado : valor)
        : valorCobrado;

      if (formaPagamento === 'dinheiro' && valorRecebido < valor) {
        throw new Error('O valor recebido não pode ser menor que o pagamento');
      }

      const troco = formaPagamento === 'dinheiro' ? valorRecebido - valor : 0;
      const [pagamento] = await trx('venda_pagamentos')
        .insert({
          venda_id: venda.id,
          usuario_id: req.user.id,
          forma_pagamento: formaPagamento,
          valor,
          taxa_percentual: taxaPercentual,
          taxa_valor: taxaValor,
          valor_recebido: valorRecebido,
          troco,
        })
        .returning('*');

      const [totaisPagamento] = await trx('venda_pagamentos')
        .where({ venda_id: venda.id })
        .sum('valor as valor_pago')
        .sum('taxa_valor as taxa_cartao');
      const formas = await trx('venda_pagamentos')
        .where({ venda_id: venda.id })
        .distinct('forma_pagamento');

      const valorPago = parseFloat(totaisPagamento.valor_pago) || 0;
      const taxaCartao = parseFloat(totaisPagamento.taxa_cartao) || 0;
      const saldoRestante = Math.max(totalBaseVenda(venda) - valorPago, 0);
      const statusPagamento = saldoRestante <= 0.009 ? 'pago' : 'parcial';
      const formaResumo = formas.length === 1 ? formas[0].forma_pagamento : 'misto';

      const [vendaAtualizada] = await trx('vendas')
        .where({ id: venda.id })
        .update({
          valor_pago: valorPago,
          taxa_cartao: taxaCartao,
          total: totalBaseVenda(venda) + taxaCartao,
          forma_pagamento: formaResumo,
          status_pagamento: statusPagamento,
          pago_em: statusPagamento === 'pago' ? trx.fn.now() : null,
        })
        .returning('*');

      await trx('financeiro_lancamentos').insert({
        loja_id: venda.loja_id,
        tipo: 'entrada',
        categoria: 'venda',
        descricao: `Recebimento da venda #${venda.id} - ${formaPagamento}`,
        valor: valorCobrado,
        referencia_tipo: 'venda_pagamento',
        referencia_id: pagamento.id,
        usuario_id: req.user.id,
      });

      return { venda: vendaAtualizada, pagamento };
    });

    const pagamentos = await db('venda_pagamentos')
      .leftJoin('usuarios', 'venda_pagamentos.usuario_id', 'usuarios.id')
      .select('venda_pagamentos.*', 'usuarios.nome as usuario_nome')
      .where('venda_pagamentos.venda_id', result.venda.id)
      .orderBy('venda_pagamentos.created_at');

    res.status(201).json({
      ...result.venda,
      saldo_pendente: saldoVenda(result.venda),
      pagamentos,
      pagamento_registrado: result.pagamento,
    });
  } catch (err) {
    console.error('Erro ao registrar pagamento:', err);
    res.status(err.status || 400).json({ error: err.message || 'Erro ao registrar pagamento' });
  }
});

export default router;
