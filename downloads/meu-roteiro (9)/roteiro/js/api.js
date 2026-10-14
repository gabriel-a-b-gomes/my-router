// Chamadas às funções do servidor (/api/*), sempre com a senha do app.

const PW_KEY = 'roteiro:pw';

export const getPassword = () => { try { return localStorage.getItem(PW_KEY) || ''; } catch { return ''; } };
export const setPassword = (pw) => { try { pw ? localStorage.setItem(PW_KEY, pw) : localStorage.removeItem(PW_KEY); } catch {} };

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch(`/api/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-app-password': getPassword() },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Sem conexão com o servidor.', 0);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) window.dispatchEvent(new CustomEvent('auth-required'));
    throw new ApiError(data.error || `Erro ${r.status}`, r.status);
  }
  return data;
}

export const geocode = (query, near) => api('geocode', { method: 'POST', body: { query, near } });
export const getRoute = (points, mode) => api('route', { method: 'POST', body: { points, mode } });
