import { send, features, supabaseHeaders, supabaseUrl } from './_lib.js';

// Chamado diariamente pelo cron da Vercel (vercel.json) para evitar que o
// projeto gratuito do Supabase seja pausado por inatividade.
// Não devolve nenhum dado, por isso não exige senha.
export default async function handler(req, res) {
  if (!features().cloud) return send(res, 200, { ok: true, cloud: false });
  try {
    const r = await fetch(supabaseUrl('app_state?select=id&limit=1'), { headers: supabaseHeaders() });
    send(res, 200, { ok: r.ok });
  } catch {
    send(res, 200, { ok: false });
  }
}
