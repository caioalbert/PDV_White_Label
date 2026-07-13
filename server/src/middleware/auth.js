import jwt from 'jsonwebtoken';
import db from '../database.js';
import { userHasPermission } from '../permissions.js';

/**
 * Middleware que verifica o token JWT no header Authorization.
 * Decodifica e anexa os dados do usuário em req.user.
 */
export async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Formato de token inválido' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const usuario = await db('usuarios')
      .select(
        'id',
        'nome',
        'login',
        'perfil',
        'loja_id',
        'ativo',
        'permissoes',
        'deve_trocar_senha',
        'token_version'
      )
      .where({ id: decoded.id })
      .first();

    if (!usuario?.ativo) {
      return res.status(401).json({ error: 'Usuário inativo ou não encontrado' });
    }
    if (Number(decoded.token_version) !== Number(usuario.token_version)) {
      return res.status(401).json({ error: 'Sessão revogada. Faça login novamente' });
    }

    req.user = usuario;

    const passwordChangeRoute = req.baseUrl === '/api/auth'
      && ['/me', '/alterar-senha'].includes(req.path);
    if (usuario.deve_trocar_senha && !passwordChangeRoute) {
      return res.status(403).json({
        error: 'Troca de senha obrigatória',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
}

/**
 * Middleware que verifica se o usuário autenticado é administrador.
 * Deve ser usado após verifyToken.
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.perfil !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }
  next();
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user || !userHasPermission(req.user, permission)) {
      return res.status(403).json({ error: 'Usuário sem permissão para este módulo' });
    }
    next();
  };
}

export function requireAnyPermission(...permissions) {
  return (req, res, next) => {
    const allowed = req.user
      && permissions.some((permission) => userHasPermission(req.user, permission));

    if (!allowed) {
      return res.status(403).json({ error: 'Usuário sem permissão para este módulo' });
    }
    next();
  };
}
