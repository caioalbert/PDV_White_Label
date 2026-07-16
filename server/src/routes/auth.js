import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../database.js';
import { verifyToken } from '../middleware/auth.js';
import {
  clearLoginFailures,
  loginRateLimit,
  recordLoginFailure,
} from '../middleware/rateLimit.js';
import { normalizePermissions } from '../permissions.js';
import { validatePassword } from '../security/password.js';

const router = Router();

function publicUser(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    login: usuario.login,
    perfil: usuario.perfil,
    loja_id: usuario.loja_id,
    permissoes: normalizePermissions(usuario.permissoes),
    deve_trocar_senha: Boolean(usuario.deve_trocar_senha),
  };
}

function issueToken(usuario) {
  return jwt.sign(
    {
      ...publicUser(usuario),
      token_version: Number(usuario.token_version),
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

// POST /api/auth/login
router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const { login, senha } = req.body;

    if (typeof login !== 'string' || typeof senha !== 'string' || !login.trim() || !senha) {
      return res.status(400).json({ error: 'Login e senha são obrigatórios' });
    }

    const usuario = await db('usuarios').where({ login: login.trim(), ativo: true }).first();

    if (!usuario) {
      await recordLoginFailure(req);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaValida) {
      await recordLoginFailure(req);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    await clearLoginFailures(req);
    const user = publicUser(usuario);
    const token = issueToken(usuario);

    res.json({
      token,
      user,
    });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res) => {
  try {
    const usuario = await db('usuarios')
      .select(
        'id',
        'nome',
        'login',
        'perfil',
        'loja_id',
        'ativo',
        'permissoes',
        'deve_trocar_senha'
      )
      .where({ id: req.user.id })
      .first();

    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json(publicUser(usuario));
  } catch (err) {
    console.error('Erro ao buscar usuário:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/auth/alterar-senha
router.post('/alterar-senha', verifyToken, async (req, res) => {
  try {
    const { senha_atual, nova_senha } = req.body;
    const passwordError = validatePassword(nova_senha);

    if (typeof senha_atual !== 'string' || !senha_atual) {
      return res.status(400).json({ error: 'Senha atual é obrigatória' });
    }
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const usuarioAtualizado = await db.transaction(async (trx) => {
      const usuario = await trx('usuarios')
        .where({ id: req.user.id, ativo: true })
        .forUpdate()
        .first();

      if (!usuario) {
        const error = new Error('Usuário não encontrado');
        error.status = 404;
        throw error;
      }

      const senhaAtualValida = await bcrypt.compare(senha_atual, usuario.senha_hash);
      if (!senhaAtualValida) {
        const error = new Error('Senha atual inválida');
        error.status = 400;
        throw error;
      }

      const senhaRepetida = await bcrypt.compare(nova_senha, usuario.senha_hash);
      if (senhaRepetida) {
        const error = new Error('A nova senha deve ser diferente da senha atual');
        error.status = 400;
        throw error;
      }

      const senhaHash = await bcrypt.hash(nova_senha, 12);
      const [updated] = await trx('usuarios')
        .where({ id: usuario.id })
        .update({
          senha_hash: senhaHash,
          deve_trocar_senha: false,
          token_version: trx.raw('token_version + 1'),
          updated_at: trx.fn.now(),
        })
        .returning('*');

      return updated;
    });

    res.json({
      token: issueToken(usuarioAtualizado),
      user: publicUser(usuarioAtualizado),
      message: 'Senha alterada com sucesso',
    });
  } catch (err) {
    console.error('Erro ao alterar senha:', err);
    res.status(err.status || 500).json({
      error: err.status ? err.message : 'Erro interno do servidor',
    });
  }
});

export default router;
