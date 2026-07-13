/**
 * Authentication helpers.
 */
import api from './api.js';
import { DEFAULT_ROUTE_ORDER, ROUTE_PERMISSIONS } from './permissions.js';

export async function login(usuario, senha) {
  const data = await api.post('/auth/login', { login: usuario, senha });
  if (data.token) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user || data.usuario));
  }
  return data.user || data.usuario;
}

export async function changePassword(currentPassword, newPassword) {
  const data = await api.post('/auth/alterar-senha', {
    senha_atual: currentPassword,
    nova_senha: newPassword,
  });

  if (data.token) {
    localStorage.setItem('token', data.token);
  }
  if (data.user) {
    localStorage.setItem('user', JSON.stringify(data.user));
  }

  return data.user;
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('currentLoja');
  window.location.hash = '#/login';
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

export function getToken() {
  return localStorage.getItem('token');
}

export function isLoggedIn() {
  return !!getToken();
}

export function mustChangePassword() {
  return Boolean(getUser()?.deve_trocar_senha);
}

export function isAdmin() {
  const user = getUser();
  return user && user.perfil === 'admin';
}

export function hasPermission(permission) {
  const user = getUser();
  if (!user) return false;
  if (user.perfil === 'admin') return true;
  return Array.isArray(user.permissoes) && user.permissoes.includes(permission);
}

export function getDefaultRoute() {
  if (isAdmin()) return '/dashboard';
  return DEFAULT_ROUTE_ORDER.find((route) => hasPermission(ROUTE_PERMISSIONS[route]))
    || '/sem-acesso';
}

export async function refreshCurrentUser() {
  if (!getToken()) return null;
  const user = await api.get('/auth/me');
  localStorage.setItem('user', JSON.stringify(user));
  return user;
}

export function getCurrentLojaId() {
  const stored = localStorage.getItem('currentLoja');
  if (stored !== null && stored !== '') return parseInt(stored, 10);
  if (isAdmin()) return null;
  const user = getUser();
  return user?.loja_id || null;
}

export function setCurrentLoja(id) {
  if (id === '' || id === null || id === undefined) {
    localStorage.removeItem('currentLoja');
  } else {
    localStorage.setItem('currentLoja', String(id));
  }
  // Dispatch custom event so header/components can react
  window.dispatchEvent(new CustomEvent('lojaChanged', { detail: { lojaId: id } }));
}
