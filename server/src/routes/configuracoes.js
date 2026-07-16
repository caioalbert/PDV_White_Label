import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../database.js';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import {
  DEFAULT_VENDOR_PERMISSIONS,
  normalizePermissions,
} from '../permissions.js';
import { validatePassword } from '../security/password.js';

const router = Router();

const DEFAULT_COMPANY_NAME = 'Sistema de Gest\u00e3o';
const CONFIG_DESCRIPTIONS = {
  nome_empresa: 'Nome da empresa exibido no sistema',
  desconto_maximo: 'Desconto m\u00e1ximo permitido (%)',
};

function sanitizeCompanyName(value) {
  const nome = String(value || '').trim();
  if (!nome) return null;
  if (nome.length > 120) return null;
  return nome;
}

function sanitizeText(value, maxLength) {
  const text = String(value ?? '').trim();
  if (!text || text.length > maxLength) return null;
  return text;
}

function parseTaxa(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const taxa = Number(value);
  if (!Number.isFinite(taxa) || taxa < 0 || taxa > 100) return null;
  return taxa;
}

function financialError(res, err, fallback) {
  if (err.code === '23505') {
    return res.status(409).json({ error: 'J\u00e1 existe um cadastro com esses dados' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'A entidade financeira informada n\u00e3o existe' });
  }
  return res.status(500).json({ error: fallback });
}

// GET /api/configuracoes/public
router.get('/public', async (_req, res) => {
  try {
    const config = await db('configuracoes').where({ chave: 'nome_empresa' }).first();
    res.json({ nome_empresa: config?.valor || DEFAULT_COMPANY_NAME });
  } catch (err) {
    console.error('Erro ao carregar configura\u00e7\u00e3o p\u00fablica:', err);
    res.json({ nome_empresa: DEFAULT_COMPANY_NAME });
  }
});

// =================== CONFIGURAÇÕES ===================

// GET /api/configuracoes
router.get('/', verifyToken, async (req, res) => {
  try {
    const configuracoes = await db('configuracoes').orderBy('chave');
    res.json(configuracoes);
  } catch (err) {
    console.error('Erro ao listar configurações:', err);
    res.status(500).json({ error: 'Erro ao listar configurações' });
  }
});

// PUT /api/configuracoes/:chave
router.put('/:chave', verifyToken, requireAdmin, async (req, res) => {
  try {
    if (!Object.hasOwn(CONFIG_DESCRIPTIONS, req.params.chave)) {
      return res.status(400).json({ error: 'Configura\u00e7\u00e3o inv\u00e1lida' });
    }

    let { valor } = req.body;
    if (req.params.chave === 'nome_empresa') {
      const nomeEmpresa = sanitizeCompanyName(valor);
      if (!nomeEmpresa) {
        return res.status(400).json({ error: 'Informe um nome de empresa com at\u00e9 120 caracteres' });
      }
      valor = nomeEmpresa;
    }

    if (req.params.chave === 'desconto_maximo') {
      const percentual = parseFloat(valor);
      if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
        return res.status(400).json({ error: 'O percentual deve estar entre 0% e 100%' });
      }
    }

    const [config] = await db('configuracoes')
      .insert({
        chave: req.params.chave,
        valor,
        descricao: CONFIG_DESCRIPTIONS[req.params.chave],
      })
      .onConflict('chave')
      .merge({ valor })
      .returning('*');

    res.json(config);
  } catch (err) {
    console.error('Erro ao atualizar configuração:', err);
    res.status(500).json({ error: 'Erro ao atualizar configuração' });
  }
});

// =================== ENTIDADES FINANCEIRAS E TAXAS ===================

// GET /api/configuracoes/entidades-financeiras
router.get('/entidades-financeiras', verifyToken, requireAdmin, async (_req, res) => {
  try {
    const entidades = await db('enteidades_financeiras as ef')
      .leftJoin('taxas as t', 't.entidade_financeira_codigo', 'ef.codigo')
      .select('ef.codigo', 'ef.descricao')
      .count('t.id as quantidade_taxas')
      .groupBy('ef.codigo', 'ef.descricao')
      .orderBy('ef.descricao');

    res.json(entidades.map((entidade) => ({
      ...entidade,
      quantidade_taxas: Number(entidade.quantidade_taxas) || 0,
    })));
  } catch (err) {
    console.error('Erro ao listar entidades financeiras:', err);
    financialError(res, err, 'Erro ao listar entidades financeiras');
  }
});

// POST /api/configuracoes/entidades-financeiras
router.post('/entidades-financeiras', verifyToken, requireAdmin, async (req, res) => {
  try {
    const codigo = sanitizeText(req.body.codigo, 50);
    const descricao = sanitizeText(req.body.descricao, 255);
    if (!codigo || !descricao) {
      return res.status(400).json({ error: 'Informe o c\u00f3digo e a descri\u00e7\u00e3o da entidade financeira' });
    }

    const [entidade] = await db('enteidades_financeiras')
      .insert({ codigo, descricao })
      .returning('*');
    res.status(201).json({ ...entidade, quantidade_taxas: 0 });
  } catch (err) {
    console.error('Erro ao criar entidade financeira:', err);
    financialError(res, err, 'Erro ao criar entidade financeira');
  }
});

// PUT /api/configuracoes/entidades-financeiras/:codigo
router.put('/entidades-financeiras/:codigo', verifyToken, requireAdmin, async (req, res) => {
  try {
    const codigoAtual = sanitizeText(req.params.codigo, 50);
    const codigo = sanitizeText(req.body.codigo, 50);
    const descricao = sanitizeText(req.body.descricao, 255);
    if (!codigoAtual || !codigo || !descricao) {
      return res.status(400).json({ error: 'Informe o c\u00f3digo e a descri\u00e7\u00e3o da entidade financeira' });
    }

    const [entidade] = await db('enteidades_financeiras')
      .where({ codigo: codigoAtual })
      .update({ codigo, descricao })
      .returning('*');
    if (!entidade) return res.status(404).json({ error: 'Entidade financeira n\u00e3o encontrada' });
    res.json(entidade);
  } catch (err) {
    console.error('Erro ao atualizar entidade financeira:', err);
    financialError(res, err, 'Erro ao atualizar entidade financeira');
  }
});

// DELETE /api/configuracoes/entidades-financeiras/:codigo
router.delete('/entidades-financeiras/:codigo', verifyToken, requireAdmin, async (req, res) => {
  try {
    const deleted = await db('enteidades_financeiras')
      .where({ codigo: req.params.codigo })
      .del();
    if (!deleted) return res.status(404).json({ error: 'Entidade financeira n\u00e3o encontrada' });
    res.json({ message: 'Entidade financeira removida com sucesso' });
  } catch (err) {
    console.error('Erro ao remover entidade financeira:', err);
    financialError(res, err, 'Erro ao remover entidade financeira');
  }
});

// GET /api/configuracoes/entidades-financeiras/:codigo/taxas
router.get('/entidades-financeiras/:codigo/taxas', verifyToken, requireAdmin, async (req, res) => {
  try {
    const entidade = await db('enteidades_financeiras').where({ codigo: req.params.codigo }).first();
    if (!entidade) return res.status(404).json({ error: 'Entidade financeira n\u00e3o encontrada' });

    const taxas = await db('taxas')
      .where({ entidade_financeira_codigo: req.params.codigo })
      .orderBy('bandeira');
    res.json(taxas);
  } catch (err) {
    console.error('Erro ao listar taxas:', err);
    financialError(res, err, 'Erro ao listar taxas');
  }
});

// POST /api/configuracoes/entidades-financeiras/:codigo/taxas
router.post('/entidades-financeiras/:codigo/taxas', verifyToken, requireAdmin, async (req, res) => {
  try {
    const bandeira = sanitizeText(req.body.bandeira, 100);
    const taxa = parseTaxa(req.body.taxa);
    if (!bandeira || taxa === null) {
      return res.status(400).json({ error: 'Informe a bandeira e uma taxa entre 0% e 100%' });
    }

    const entidade = await db('enteidades_financeiras').where({ codigo: req.params.codigo }).first();
    if (!entidade) return res.status(404).json({ error: 'Entidade financeira n\u00e3o encontrada' });

    const [registro] = await db('taxas')
      .insert({
        entidade_financeira_codigo: req.params.codigo,
        bandeira,
        taxa,
      })
      .returning('*');
    res.status(201).json(registro);
  } catch (err) {
    console.error('Erro ao criar taxa:', err);
    financialError(res, err, 'Erro ao criar taxa');
  }
});

// PUT /api/configuracoes/entidades-financeiras/:codigo/taxas/:id
router.put('/entidades-financeiras/:codigo/taxas/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const bandeira = sanitizeText(req.body.bandeira, 100);
    const taxa = parseTaxa(req.body.taxa);
    if (!bandeira || taxa === null) {
      return res.status(400).json({ error: 'Informe a bandeira e uma taxa entre 0% e 100%' });
    }

    const [registro] = await db('taxas')
      .where({
        id: req.params.id,
        entidade_financeira_codigo: req.params.codigo,
      })
      .update({ bandeira, taxa })
      .returning('*');
    if (!registro) return res.status(404).json({ error: 'Taxa n\u00e3o encontrada' });
    res.json(registro);
  } catch (err) {
    console.error('Erro ao atualizar taxa:', err);
    financialError(res, err, 'Erro ao atualizar taxa');
  }
});

// DELETE /api/configuracoes/entidades-financeiras/:codigo/taxas/:id
router.delete('/entidades-financeiras/:codigo/taxas/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const deleted = await db('taxas')
      .where({
        id: req.params.id,
        entidade_financeira_codigo: req.params.codigo,
      })
      .del();
    if (!deleted) return res.status(404).json({ error: 'Taxa n\u00e3o encontrada' });
    res.json({ message: 'Taxa removida com sucesso' });
  } catch (err) {
    console.error('Erro ao remover taxa:', err);
    financialError(res, err, 'Erro ao remover taxa');
  }
});

// =================== USUÁRIOS (ADMIN ONLY) ===================

// GET /api/configuracoes/usuarios
router.get('/usuarios', verifyToken, requireAdmin, async (req, res) => {
  try {
    const usuarios = await db('usuarios')
      .leftJoin('lojas', 'usuarios.loja_id', 'lojas.id')
      .select(
        'usuarios.id',
        'usuarios.nome',
        'usuarios.login',
        'usuarios.perfil',
        'usuarios.loja_id',
        'usuarios.permissoes',
        'usuarios.ativo',
        'usuarios.deve_trocar_senha',
        'usuarios.created_at',
        'lojas.nome as loja_nome'
      )
      .orderBy('usuarios.nome');

    res.json(usuarios.map((usuario) => ({
      ...usuario,
      permissoes: normalizePermissions(usuario.permissoes),
    })));
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

// GET /api/configuracoes/usuarios/:id
router.get('/usuarios/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const usuario = await db('usuarios')
      .leftJoin('lojas', 'usuarios.loja_id', 'lojas.id')
      .select(
        'usuarios.id',
        'usuarios.nome',
        'usuarios.login',
        'usuarios.perfil',
        'usuarios.loja_id',
        'usuarios.permissoes',
        'usuarios.ativo',
        'usuarios.deve_trocar_senha',
        'usuarios.created_at',
        'lojas.nome as loja_nome'
      )
      .where('usuarios.id', req.params.id)
      .first();

    if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({
      ...usuario,
      permissoes: normalizePermissions(usuario.permissoes),
    });
  } catch (err) {
    console.error('Erro ao buscar usuário:', err);
    res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
});

// POST /api/configuracoes/usuarios
router.post('/usuarios', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { nome, login, senha, perfil, loja_id, permissoes } = req.body;

    if (!nome || !login || !senha) {
      return res.status(400).json({ error: 'Nome, login e senha são obrigatórios' });
    }
    const passwordError = validatePassword(senha);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    // Verificar se login já existe
    const existente = await db('usuarios').where({ login }).first();
    if (existente) {
      return res.status(409).json({ error: 'Login já está em uso' });
    }

    const senha_hash = await bcrypt.hash(senha, 12);

    const perfilFinal = perfil || 'vendedor';
    const permissoesFinais = perfilFinal === 'admin'
      ? []
      : normalizePermissions(permissoes ?? DEFAULT_VENDOR_PERMISSIONS);

    const [usuario] = await db('usuarios')
      .insert({
        nome,
        login,
        senha_hash,
        perfil: perfilFinal,
        loja_id,
        permissoes: JSON.stringify(permissoesFinais),
        deve_trocar_senha: true,
        token_version: 0,
      })
      .returning([
        'id',
        'nome',
        'login',
        'perfil',
        'loja_id',
        'permissoes',
        'ativo',
        'deve_trocar_senha',
        'created_at',
      ]);

    res.status(201).json({
      ...usuario,
      permissoes: normalizePermissions(usuario.permissoes),
    });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// PUT /api/configuracoes/usuarios/:id
router.put('/usuarios/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { nome, login, senha, perfil, loja_id, ativo, permissoes } = req.body;

    const updateData = {
      nome,
      login,
      perfil,
      loja_id,
      ativo,
      permissoes: JSON.stringify(perfil === 'admin' ? [] : normalizePermissions(permissoes)),
      updated_at: db.fn.now(),
    };

    // Se senha foi fornecida, atualizar hash
    if (senha) {
      const passwordError = validatePassword(senha);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }
      updateData.senha_hash = await bcrypt.hash(senha, 12);
      updateData.deve_trocar_senha = true;
      updateData.token_version = db.raw('token_version + 1');
    }

    // Verificar se login já existe em outro usuário
    if (login) {
      const existente = await db('usuarios')
        .where({ login })
        .whereNot({ id: req.params.id })
        .first();
      if (existente) {
        return res.status(409).json({ error: 'Login já está em uso' });
      }
    }

    const [usuario] = await db('usuarios')
      .where({ id: req.params.id })
      .update(updateData)
      .returning([
        'id',
        'nome',
        'login',
        'perfil',
        'loja_id',
        'permissoes',
        'ativo',
        'deve_trocar_senha',
        'created_at',
      ]);

    if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({
      ...usuario,
      permissoes: normalizePermissions(usuario.permissoes),
    });
  } catch (err) {
    console.error('Erro ao atualizar usuário:', err);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

// DELETE /api/configuracoes/usuarios/:id
router.delete('/usuarios/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    // Não permitir deletar a si mesmo
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Não é possível excluir o próprio usuário' });
    }

    const deleted = await db('usuarios').where({ id: req.params.id }).del();
    if (!deleted) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ message: 'Usuário removido com sucesso' });
  } catch (err) {
    console.error('Erro ao remover usuário:', err);
    res.status(500).json({ error: 'Erro ao remover usuário. Verifique se não há dados vinculados.' });
  }
});

export default router;
