import { send, checkAuth, readBody, allow } from './_lib.js';

// Rotas e distâncias: OpenRouteService (grátis, 2.000 rotas/dia) com reserva no OSRM público
// da FOSSGIS (grátis, sem chave). Se ambos falharem, estimativa em linha reta corrigida.

const PROFILES = ['foot-walking', 'driving-car', 'cycling-regular'];
// fator de desvio em relação à linha reta e velocidade média urbana (km/h)
const EST = { 'foot-walking': [1.3, 4.8], 'cycling-regular': [1.3, 14], 'driving-car': [1.4, 22] };

export function haversine(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function estimate(points, profile) {
  const [factor, kmh] = EST[profile];
  const legs = [];
  for (let i = 1; i < points.length; i++) {
    const distance = haversine(points[i - 1], points[i]) * factor;
    legs.push({ distance, duration: (distance / 1000 / kmh) * 3600 });
  }
  return {
    source: 'estimate',
    distance: legs.reduce((s, l) => s + l.distance, 0),
    duration: legs.reduce((s, l) => s + l.duration, 0),
    legs,
    line: points,
  };
}

// Um trecho por par de paradas. Usa os "segments" do ORS; se não vierem, reparte o total
// pela geometria entre os pontos de passagem (way_points).
export function legsFrom(props, line, count) {
  const segs = props.segments || [];
  if (segs.length === count) return segs.map((s) => ({ distance: s.distance || 0, duration: s.duration || 0 }));
  const total = props.summary?.distance || 0, totalDur = props.summary?.duration || 0;
  const wp = props.way_points || [];
  if (count === 1) return [{ distance: total, duration: totalDur }];
  if (wp.length !== count + 1) return [];
  const lens = [];
  for (let k = 0; k < count; k++) {
    let d = 0;
    for (let j = wp[k]; j < wp[k + 1]; j++) d += haversine(line[j], line[j + 1]);
    lens.push(d);
  }
  const sumLen = lens.reduce((a, b) => a + b, 0) || 1;
  return lens.map((d) => ({ distance: (total * d) / sumLen, duration: (totalDur * d) / sumLen }));
}

// --- Provedores -----------------------------------------------------------------

class LimitError extends Error {}

async function orsRoute(pts, profile, key) {
  const r = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/geo+json' },
    // instructions: true garante "segments" (distância de cada trecho entre paradas);
    // radiuses -1 aceita pontos longe da via (aeroportos, locadoras dentro de terrenos grandes)
    body: JSON.stringify({ coordinates: pts.map(([lat, lng]) => [lng, lat]), instructions: true, radiuses: pts.map(() => -1) }),
  });
  const data = await r.json().catch(() => ({}));
  const f = data.features?.[0];
  if (r.status === 429 || r.status === 403) throw new LimitError(`Cota do OpenRouteService esgotada (${r.status})`);
  if (!r.ok || !f) throw new Error(data.error?.message || `OpenRouteService ${r.status}`);
  const sum = f.properties?.summary || {};
  const line = f.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  return { source: 'ors', distance: sum.distance || 0, duration: sum.duration || 0, legs: legsFrom(f.properties || {}, line, pts.length - 1), line };
}

// OSRM público mantido pela FOSSGIS (routing.openstreetmap.de): grátis, sem chave,
// uso leve (máx. 1 consulta/s). Tem perfis de carro, bicicleta e a pé.
const OSRM = { 'driving-car': 'routed-car', 'cycling-regular': 'routed-bike', 'foot-walking': 'routed-foot' };
export async function osrmRoute(pts, profile) {
  const coords = pts.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
  const url = `https://routing.openstreetmap.de/${OSRM[profile]}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
  const r = await fetch(url, { headers: { 'User-Agent': 'MeuRoteiro/1.0 (uso pessoal)', Referer: 'https://meu-roteiro.vercel.app/' } });
  const data = await r.json().catch(() => ({}));
  const rt = data.routes?.[0];
  if (r.status === 429) throw new LimitError('Limite do OSRM atingido');
  if (!r.ok || data.code !== 'Ok' || !rt) throw new Error(data.message || `OSRM ${r.status}`);
  return {
    source: 'osrm',
    distance: rt.distance || 0,
    duration: rt.duration || 0,
    legs: (rt.legs || []).map((l) => ({ distance: l.distance || 0, duration: l.duration || 0 })),
    line: rt.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
  };
}

// Ordem: OpenRouteService (se houver chave) → OSRM/FOSSGIS → estimativa.
// ROUTE_PROVIDER=osrm pula o ORS (útil quando a cota diária acabou).
export async function route(pts, profile, env = process.env) {
  const tries = [];
  if ((env.ROUTE_PROVIDER || '').toLowerCase() === 'estimate') return estimate(pts, profile);
  const key = env.ORS_API_KEY;
  const pref = (env.ROUTE_PROVIDER || '').toLowerCase();
  if (key && pref !== 'osrm') tries.push(['OpenRouteService', () => orsRoute(pts, profile, key)]);
  if (pref !== 'ors') tries.push(['OSRM', () => osrmRoute(pts, profile)]);
  const problems = [];
  for (const [name, fn] of tries) {
    try {
      const out = await fn();
      if (problems.length) out.note = `${problems.join('; ')}. Rota calculada pelo ${name}.`;
      return out;
    } catch (e) {
      problems.push(e instanceof LimitError ? e.message : `${name}: ${e.message}`);
    }
  }
  const out = estimate(pts, profile);
  if (problems.length) out.warning = `${problems.join('; ')}. Mostrando estimativa.`;
  return out;
}

export default async function handler(req, res) {
  if (!allow(req, res, ['POST'])) return;
  if (!checkAuth(req, res)) return;
  const { points, mode } = await readBody(req);
  const profile = PROFILES.includes(mode) ? mode : 'foot-walking';
  const pts = (Array.isArray(points) ? points : [])
    .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .slice(0, 50);
  if (pts.length < 2) return send(res, 400, { error: 'São necessários pelo menos 2 pontos.' });
  send(res, 200, await route(pts, profile));
}
