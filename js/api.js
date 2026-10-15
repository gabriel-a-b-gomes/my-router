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

// --- Rotas com cache -------------------------------------------------------------
// Cada trecho (perfil + paradas) é consultado UMA vez e guardado neste aparelho;
// só volta ao servidor quando as paradas mudam. Estimativas (quando os serviços
// falham) ficam só na memória, para tentar de novo na próxima abertura.
const RC_KEY = 'roteiro:routeCache';
const RC_MAX = 150;          // trechos guardados
const LINE_MAX = 350;        // pontos por linha (reduz o tamanho salvo)
const GAP_MS = 1100;         // intervalo mínimo entre consultas (OSRM público: 1/s)
const mem = new Map();
let disk = null;

const loadDisk = () => {
  if (disk) return disk;
  try { disk = JSON.parse(localStorage.getItem(RC_KEY) || '{}') || {}; } catch { disk = {}; }
  return disk;
};
const saveDisk = () => {
  const d = loadDisk();
  const keys = Object.keys(d).sort((a, b) => (d[b].t || 0) - (d[a].t || 0));
  for (const k of keys.slice(RC_MAX)) delete d[k];
  for (let n = 0; n < 3; n++) {
    try { localStorage.setItem(RC_KEY, JSON.stringify(d)); return; } catch {
      // armazenamento cheio: descarta a metade mais antiga e tenta de novo
      Object.keys(d).sort((a, b) => (d[a].t || 0) - (d[b].t || 0)).slice(0, Math.ceil(Object.keys(d).length / 2)).forEach((k) => delete d[k]);
    }
  }
};
export const routeKey = (points, mode) => `${mode}|${points.map(([a, b]) => `${(+a).toFixed(5)},${(+b).toFixed(5)}`).join(';')}`;

function slim(line) {
  if (!Array.isArray(line) || line.length <= LINE_MAX) return line;
  const step = (line.length - 1) / (LINE_MAX - 1);
  return Array.from({ length: LINE_MAX }, (_, k) => line[Math.round(k * step)]);
}

export function cachedRoute(points, mode) {
  const k = routeKey(points, mode);
  if (mem.has(k)) return mem.get(k);
  const hit = loadDisk()[k];
  return hit ? hit.r : null;
}

let last = 0, chain = Promise.resolve();
const throttle = () => {
  const p = chain.then(async () => {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
  });
  chain = p.catch(() => {});
  return p;
};

export const routeStats = { network: 0, cache: 0 };

/** opts.cacheOnly: devolve null em vez de consultar o servidor. */
export async function getRoute(points, mode, { cacheOnly = false } = {}) {
  const hit = cachedRoute(points, mode);
  if (hit) { routeStats.cache++; return hit; }
  if (cacheOnly) return null;
  await throttle();
  routeStats.network++;
  const r = await api('route', { method: 'POST', body: { points, mode } });
  const k = routeKey(points, mode);
  if (r.source === 'estimate') { mem.set(k, r); return r; }
  const keep = { ...r, line: slim(r.line) };
  delete keep.note; delete keep.warning;
  loadDisk()[k] = { r: keep, t: Date.now() };
  saveDisk();
  return r;
}

/** Esquece as estimativas da memória (para tentar de novo) — o cache salvo continua. */
export const forgetEstimates = () => mem.clear();
/** Apaga todo o cache de rotas deste aparelho. */
export const clearRouteCache = () => { mem.clear(); disk = {}; try { localStorage.removeItem(RC_KEY); } catch {} };
