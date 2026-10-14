import { send, checkAuth, readBody, allow } from './_lib.js';

// Busca de endereços e lugares pelo nome, usando o OpenStreetMap:
// Nominatim (principal) e Photon (reserva). Ambos gratuitos e sem chave.
// Política de uso do Nominatim: no máximo 1 busca por segundo, com identificação.

const UA = 'MeuRoteiro/1.0 (planejador de viagens de uso pessoal)';

function bbox(near) {
  if (!near || !Number.isFinite(near.lat) || !Number.isFinite(near.lng)) return null;
  const d = 0.5; // ~50 km ao redor do destino
  return [near.lng - d, near.lat + d, near.lng + d, near.lat - d];
}

export function mapNominatim(r) {
  const parts = (r.display_name || '').split(', ');
  return {
    name: r.name || parts[0] || 'Sem nome',
    address: parts.slice(r.name ? 1 : 0).slice(0, 4).join(', '),
    lat: Number(r.lat),
    lng: Number(r.lon),
    type: r.type || '',
  };
}

export function mapPhoton(f) {
  const p = f.properties || {};
  const street = [p.street, p.housenumber].filter(Boolean).join(', ');
  return {
    name: p.name || street || p.city || 'Sem nome',
    address: [p.name ? street : '', p.district, p.city, p.state, p.country].filter(Boolean).join(', '),
    lat: f.geometry?.coordinates?.[1],
    lng: f.geometry?.coordinates?.[0],
    type: p.osm_value || '',
  };
}

async function nominatim(query, near) {
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '6', 'accept-language': 'pt-BR' });
  const box = bbox(near);
  if (box) params.set('viewbox', box.join(','));
  if (process.env.GEOCODER_EMAIL) params.set('email', process.env.GEOCODER_EMAIL);
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  return (await r.json()).map(mapNominatim);
}

async function photon(query, near) {
  const params = new URLSearchParams({ q: query, limit: '6' });
  if (near && Number.isFinite(near.lat)) { params.set('lat', near.lat); params.set('lon', near.lng); }
  const r = await fetch(`https://photon.komoot.io/api/?${params}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Photon ${r.status}`);
  return ((await r.json()).features || []).map(mapPhoton);
}

export default async function handler(req, res) {
  if (!allow(req, res, ['POST'])) return;
  if (!checkAuth(req, res)) return;
  const { query, near } = await readBody(req);
  const q = String(query || '').trim().slice(0, 200);
  if (!q) return send(res, 400, { error: 'Digite um nome ou endereço.' });

  let results = [];
  try {
    results = await nominatim(q, near);
  } catch {
    results = [];
  }
  if (!results.length) {
    try {
      results = await photon(q, near);
    } catch (e) {
      return send(res, 502, { error: `Busca de endereço indisponível agora (${e.message}). Marque no mapa.` });
    }
  }
  send(res, 200, { results: results.filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng)) });
}
