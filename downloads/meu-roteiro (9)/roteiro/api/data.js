import { send, checkAuth, readBody, allow, features, supabaseHeaders, supabaseUrl } from './_lib.js';

// Armazena todas as viagens como um único documento JSON no Supabase
// (tabela app_state, linha id = 'main'). Sem Supabase, o app guarda os
// dados só no navegador (modo "local").

export default async function handler(req, res) {
  if (!allow(req, res, ['GET', 'PUT'])) return;
  if (!checkAuth(req, res)) return;
  if (!features().cloud) return send(res, 200, { mode: 'local' });

  try {
    if (req.method === 'GET') {
      const r = await fetch(supabaseUrl('app_state?id=eq.main&select=data,updated_at'), { headers: supabaseHeaders() });
      if (!r.ok) return send(res, 502, { error: `Supabase: ${await r.text()}` });
      const rows = await r.json();
      return send(res, 200, { mode: 'cloud', data: rows[0]?.data ?? null, updatedAt: rows[0]?.updated_at ?? null });
    }

    const { data } = await readBody(req);
    if (!data || typeof data !== 'object' || !Array.isArray(data.trips)) return send(res, 400, { error: 'Dados inválidos.' });
    const updatedAt = new Date().toISOString();
    const r = await fetch(supabaseUrl('app_state'), {
      method: 'POST',
      headers: { ...supabaseHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: 'main', data, updated_at: updatedAt }),
    });
    if (!r.ok) return send(res, 502, { error: `Supabase: ${await r.text()}` });
    send(res, 200, { ok: true, updatedAt });
  } catch (e) {
    send(res, 502, { error: `Falha ao acessar o Supabase: ${e.message}` });
  }
}
