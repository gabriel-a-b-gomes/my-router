// Utilitários compartilhados pelas funções da pasta /api.
// Arquivos que começam com "_" não viram rotas na Vercel.
import { createHash, timingSafeEqual } from 'node:crypto';

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function sameSecret(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

// Todas as rotas (exceto keepalive) exigem a senha definida em APP_PASSWORD.
// Isso impede que alguém que descubra a URL gaste suas cotas das APIs.
export function checkAuth(req, res) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) {
    send(res, 500, { error: 'A variável APP_PASSWORD não está configurada no servidor.' });
    return false;
  }
  const given = req.headers['x-app-password'] || '';
  if (!sameSecret(given, pw)) {
    send(res, 401, { error: 'Senha inválida.' });
    return false;
  }
  return true;
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

export function allow(req, res, methods) {
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    send(res, 405, { error: 'Método não permitido.' });
    return false;
  }
  return true;
}

export const features = () => ({
  routes: (process.env.ROUTE_PROVIDER || '').toLowerCase() !== 'estimate',
  cloud: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
});

// ---------- Supabase (REST, sem biblioteca) ----------
export function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const h = { apikey: key, 'Content-Type': 'application/json' };
  // Chaves antigas (JWT "eyJ...") também precisam do cabeçalho Authorization.
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}
export const supabaseUrl = (path) => `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`;
