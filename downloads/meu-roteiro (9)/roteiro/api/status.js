import { send, checkAuth, features } from './_lib.js';

// Valida a senha e informa quais integrações estão configuradas.
export default function handler(req, res) {
  if (!checkAuth(req, res)) return;
  send(res, 200, { ok: true, features: features() });
}
