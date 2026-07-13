/**
 * API client – thin wrapper around fetch with JWT auth.
 * Uses relative URLs (Vite proxy forwards /api → localhost:3001).
 */

const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const API_BASE = `${API_ORIGIN}/api`;

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const token = localStorage.getItem('token');

  const headers = { ...(options.headers || {}) };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.hash = '#/login';
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    let code = null;
    try {
      const data = await res.json();
      msg = data.error || data.message || msg;
      code = data.code || null;

      if (code === 'PASSWORD_CHANGE_REQUIRED') {
        try {
          const user = JSON.parse(localStorage.getItem('user'));
          if (user) {
            user.deve_trocar_senha = true;
            localStorage.setItem('user', JSON.stringify(user));
          }
        } catch {
          localStorage.removeItem('user');
        }
        window.location.hash = '#/alterar-senha';
      }
    } catch {
      // ignore parse error
    }
    const error = new Error(msg);
    error.code = code;
    throw error;
  }

  // 204 No Content
  if (res.status === 204) return null;

  return res.json();
}

/** Convenience methods */
const api = {
  get: (endpoint) => request(endpoint, { method: 'GET' }),

  post: (endpoint, data) =>
    request(endpoint, { method: 'POST', body: data }),

  put: (endpoint, data) =>
    request(endpoint, { method: 'PUT', body: data }),

  del: (endpoint) => request(endpoint, { method: 'DELETE' }),
};

export default api;
