import { Router } from 'express';
import db from '../database.js';
import {
  requireAnyPermission,
  requirePermission,
  verifyToken,
} from '../middleware/auth.js';

const router = Router();
const CAIXA_TIME_ZONE = 'America/Sao_Paulo';

function parsePositiveMoney(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeMoney(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function businessDateKey(value, timeZone = CAIXA_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function caixaAbertoNoDia(caixa, referenceDate = new Date(), timeZone = CAIXA_TIME_ZONE) {
  if (!caixa?.aberto_em) return false;
  return businessDateKey(caixa.aberto_em, timeZone) === businessDateKey(referenceDate, timeZone);
}

async function validarLojaComCaixa(lojaId, executor = db) {
  return executor('lojas')
    .where({ id: lojaId, situacao: 'ativa', tipo: 'loja' })
    .first();
}

async function calcularResumoCaixa(caixa, executor = db) {
  const entradasQuery = executor('financeiro_lancamentos')
    .where('loja_id', caixa.loja_id)
    .where('tipo', 'entrada')
    .where('created_at', '>=', caixa.aberto_em);
  const saidasQuery = executor('financeiro_lancamentos')
    .where('loja_id', caixa.loja_id)
    .where('tipo', 'saida')
    .where('created_at', '>=', caixa.aberto_em);

  if (caixa.fechado_em) {
    entradasQuery.where('created_at', '<=', caixa.fechado_em);
    saidasQuery.where('created_at', '<=', caixa.fechado_em);
  }

  const [[entradas], [saidas]] = await Promise.all([
    entradasQuery.sum('valor as total'),
    saidasQuery.sum('valor as total'),
  ]);

  const saldoAbertura = parseFloat(caixa.saldo_abertura) || 0;
  const totalEntradas = parseFloat(entradas.total) || 0;
  const totalSaidas = parseFloat(saidas.total) || 0;

  return {
    saldo_abertura: saldoAbertura,
    total_entradas: totalEntradas,
    total_saidas: totalSaidas,
    saldo_atual: saldoAbertura + totalEntradas - totalSaidas,
  };
}

// GET /api/financeiro/lancamentos
router.get('/lancamentos', verifyToken, requirePermission('financeiro'), async (req, res) => {
  try {
    let query = db('financeiro_lancamentos')
      .join('lojas', 'financeiro_lancamentos.loja_id', 'lojas.id')
      .leftJoin('usuarios', 'financeiro_lancamentos.usuario_id', 'usuarios.id')
      .select(
        'financeiro_lancamentos.*',
        'lojas.nome as loja_nome',
        'usuarios.nome as usuario_nome'
      )
      .orderBy('financeiro_lancamentos.created_at', 'desc');

    const { loja_id, tipo, categoria, data_inicio, data_fim } = req.query;
    if (loja_id) query = query.where('financeiro_lancamentos.loja_id', loja_id);
    if (tipo) query = query.where('financeiro_lancamentos.tipo', tipo);
    if (categoria) query = query.where('financeiro_lancamentos.categoria', categoria);
    if (data_inicio) query = query.where('financeiro_lancamentos.created_at', '>=', data_inicio);
    if (data_fim) query = query.where('financeiro_lancamentos.created_at', '<=', `${data_fim} 23:59:59`);

    if (req.user.perfil === 'vendedor') {
      query = query.where('financeiro_lancamentos.loja_id', req.user.loja_id);
    }

    const lancamentos = await query;
    res.json(lancamentos);
  } catch (err) {
    console.error('Erro ao listar lançamentos:', err);
    res.status(500).json({ error: 'Erro ao listar lançamentos' });
  }
});

// POST /api/financeiro/lancamentos - Lançamento manual
router.post('/lancamentos', verifyToken, requirePermission('financeiro'), async (req, res) => {
  try {
    const { loja_id, tipo, categoria, descricao, valor } = req.body;
    const lojaFiltro = req.user.perfil === 'vendedor' ? req.user.loja_id : loja_id;
    const valorValido = parsePositiveMoney(valor);

    if (!lojaFiltro || !['entrada', 'saida'].includes(tipo) || !categoria || valorValido === null) {
      return res.status(400).json({
        error: 'Loja, tipo válido, categoria e valor positivo são obrigatórios',
      });
    }

    // Categorias permitidas para saída manual
    const categoriasPermitidas = ['frete', 'imposto', 'descarregamento', 'producao', 'despesa'];
    if (tipo === 'saida' && !categoriasPermitidas.includes(categoria)) {
      return res.status(400).json({
        error: `Categoria inválida. Permitidas para saída: ${categoriasPermitidas.join(', ')}`,
      });
    }

    const [lancamento] = await db('financeiro_lancamentos')
      .insert({
        loja_id: lojaFiltro,
        tipo,
        categoria,
        descricao,
        valor: valorValido,
        referencia_tipo: 'manual',
        usuario_id: req.user.id,
      })
      .returning('*');

    res.status(201).json(lancamento);
  } catch (err) {
    console.error('Erro ao criar lançamento:', err);
    res.status(500).json({ error: 'Erro ao criar lançamento' });
  }
});

// POST /api/financeiro/sangria
router.post('/sangria', verifyToken, requirePermission('financeiro'), async (req, res) => {
  try {
    const { loja_id, valor, descricao } = req.body;
    const lojaFiltro = req.user.perfil === 'vendedor' ? req.user.loja_id : loja_id;
    const valorValido = parsePositiveMoney(valor);

    if (!lojaFiltro || valorValido === null) {
      return res.status(400).json({ error: 'Loja e valor positivo são obrigatórios' });
    }

    const [lancamento] = await db('financeiro_lancamentos')
      .insert({
        loja_id: lojaFiltro,
        tipo: 'saida',
        categoria: 'sangria',
        descricao: descricao || 'Sangria de caixa',
        valor: valorValido,
        referencia_tipo: 'manual',
        usuario_id: req.user.id,
      })
      .returning('*');

    res.status(201).json(lancamento);
  } catch (err) {
    console.error('Erro ao registrar sangria:', err);
    res.status(500).json({ error: 'Erro ao registrar sangria' });
  }
});

// =================== CAIXA ===================

// GET /api/financeiro/caixa - Status do caixa atual
router.get(
  '/caixa',
  verifyToken,
  requireAnyPermission('caixa', 'financeiro'),
  async (req, res) => {
  try {
    const { loja_id } = req.query;
    const lojaFiltro = req.user.perfil === 'vendedor' ? req.user.loja_id : (loja_id || req.user.loja_id);

    if (!lojaFiltro) {
      return res.status(400).json({ error: 'Loja é obrigatória' });
    }
    if (!await validarLojaComCaixa(lojaFiltro)) {
      return res.status(400).json({ error: 'Caixa disponível apenas para lojas ativas' });
    }

    const caixa = await db('caixa')
      .join('lojas', 'caixa.loja_id', 'lojas.id')
      .leftJoin('usuarios', 'caixa.usuario_id', 'usuarios.id')
      .select('caixa.*', 'lojas.nome as loja_nome', 'usuarios.nome as usuario_nome')
      .where('caixa.loja_id', lojaFiltro)
      .where('caixa.status', 'aberto')
      .first();

    if (!caixa) {
      res.json(null);
      return;
    }

    const resumo = await calcularResumoCaixa(caixa);
    const abertoHoje = caixaAbertoNoDia(caixa);
    res.json({
      ...caixa,
      aberto_hoje: abertoHoje,
      fechamento_bloqueado: !abertoHoje,
      resumo,
    });
  } catch (err) {
    console.error('Erro ao buscar caixa:', err);
    res.status(500).json({ error: 'Erro ao buscar caixa' });
  }
  }
);

// POST /api/financeiro/caixa/abrir
router.post(
  '/caixa/abrir',
  verifyToken,
  requireAnyPermission('caixa', 'financeiro'),
  async (req, res) => {
  try {
    const { loja_id, saldo_abertura } = req.body;
    const lojaFiltro = req.user.perfil === 'vendedor' ? req.user.loja_id : (loja_id || req.user.loja_id);
    const saldoAberturaValido = parseNonNegativeMoney(saldo_abertura ?? 0);

    if (!lojaFiltro || saldoAberturaValido === null) {
      return res.status(400).json({ error: 'Loja e saldo de abertura não negativo são obrigatórios' });
    }
    if (!await validarLojaComCaixa(lojaFiltro)) {
      return res.status(400).json({ error: 'Caixa disponível apenas para lojas ativas' });
    }

    // Verificar se já tem caixa aberto
    const caixaAberto = await db('caixa')
      .where({ loja_id: lojaFiltro, status: 'aberto' })
      .first();

    if (caixaAberto) {
      if (!caixaAbertoNoDia(caixaAberto)) {
        return res.status(400).json({
          error: 'Existe um caixa aberto de outro dia para esta loja. Corrija o caixa pendente antes de abrir o caixa de hoje',
        });
      }
      return res.status(400).json({ error: 'Já existe um caixa aberto para esta loja' });
    }

    const [caixa] = await db('caixa')
      .insert({
        loja_id: lojaFiltro,
        usuario_id: req.user.id,
        saldo_abertura: saldoAberturaValido,
        status: 'aberto',
      })
      .returning('*');

    res.status(201).json(caixa);
  } catch (err) {
    console.error('Erro ao abrir caixa:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Já existe um caixa aberto para esta loja' });
    }
    res.status(500).json({ error: 'Erro ao abrir caixa' });
  }
  }
);

// POST /api/financeiro/caixa/fechar
router.post(
  '/caixa/fechar',
  verifyToken,
  requireAnyPermission('caixa', 'financeiro'),
  async (req, res) => {
  try {
    const { loja_id } = req.body;
    const lojaFiltro = req.user.perfil === 'vendedor' ? req.user.loja_id : (loja_id || req.user.loja_id);

    if (!lojaFiltro) {
      return res.status(400).json({ error: 'Loja é obrigatória' });
    }
    if (!await validarLojaComCaixa(lojaFiltro)) {
      return res.status(400).json({ error: 'Caixa disponível apenas para lojas ativas' });
    }

    const caixa = await db('caixa')
      .where({ loja_id: lojaFiltro, status: 'aberto' })
      .first();

    if (!caixa) {
      return res.status(400).json({ error: 'Nenhum caixa aberto para esta loja' });
    }
    if (!caixaAbertoNoDia(caixa)) {
      return res.status(400).json({
        error: 'O caixa aberto foi iniciado em outro dia. Fechamento permitido apenas para caixa aberto hoje',
      });
    }

    const resumo = await calcularResumoCaixa(caixa);
    const saldoFechamento = resumo.saldo_atual;

    const [caixaFechado] = await db('caixa')
      .where({ id: caixa.id })
      .update({
        saldo_fechamento: saldoFechamento,
        status: 'fechado',
        fechado_em: db.fn.now(),
      })
      .returning('*');

    res.json({
      ...caixaFechado,
      resumo: {
        ...resumo,
        saldo_fechamento: saldoFechamento,
      },
    });
  } catch (err) {
    console.error('Erro ao fechar caixa:', err);
    res.status(500).json({ error: 'Erro ao fechar caixa' });
  }
  }
);

// GET /api/financeiro/caixa/historico
router.get(
  '/caixa/historico',
  verifyToken,
  requireAnyPermission('caixa', 'financeiro'),
  async (req, res) => {
  try {
    let query = db('caixa')
      .join('lojas', 'caixa.loja_id', 'lojas.id')
      .leftJoin('usuarios', 'caixa.usuario_id', 'usuarios.id')
      .select('caixa.*', 'lojas.nome as loja_nome', 'usuarios.nome as usuario_nome')
      .orderBy('caixa.aberto_em', 'desc');

    const { loja_id } = req.query;
    if (loja_id) query = query.where('caixa.loja_id', loja_id);

    if (req.user.perfil === 'vendedor') {
      query = query.where('caixa.loja_id', req.user.loja_id);
    }

    const caixas = await query;
    const historico = await Promise.all(caixas.map(async (caixa) => {
      const resumo = await calcularResumoCaixa(caixa);
      return {
        ...caixa,
        total_entradas: resumo.total_entradas,
        total_saidas: resumo.total_saidas,
        saldo_atual: caixa.saldo_fechamento == null
          ? resumo.saldo_atual
          : parseFloat(caixa.saldo_fechamento),
      };
    }));

    res.json(historico);
  } catch (err) {
    console.error('Erro ao buscar histórico:', err);
    res.status(500).json({ error: 'Erro ao buscar histórico de caixa' });
  }
  }
);

export default router;
