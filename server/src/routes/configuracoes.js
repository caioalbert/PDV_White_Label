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
    const { valor } = req.body;
    if (['taxa_debito', 'taxa_credito', 'desconto_maximo'].includes(req.params.chave)) {
      const percentual = parseFloat(valor);
      if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
        return res.status(400).json({ error: 'O percentual deve estar entre 0% e 100%' });
      }
    }

    const [config] = await db('configuracoes')
      .where({ chave: req.params.chave })
      .update({ valor })
      .returning('*');

    if (!config) return res.status(404).json({ error: 'Configuração não encontrada' });
    res.json(config);
  } catch (err) {
    console.error('Erro ao atualizar configuração:', err);
    res.status(500).json({ error: 'Erro ao atualizar configuração' });
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
