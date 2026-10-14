import { send, checkAuth, readBody, allow } from './_lib.js';

// Rotas e distâncias via OpenRouteService (plano gratuito: 2.000 rotas/dia).
// Sem chave (ou se o ORS falhar) usa uma estimativa em linha reta corrigida.

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

export default async function handler(req, res) {
  if (!allow(req, res, ['POST'])) return;
  if (!checkAuth(req, res)) return;
  const { points, mode } = await readBody(req);
  const profile = PROFILES.includes(mode) ? mode : 'foot-walking';
  const pts = (Array.isArray(points) ? points : [])
    .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .slice(0, 50);
  if (pts.length < 2) return send(res, 400, { error: 'São necessários pelo menos 2 pontos.' });

  const key = process.env.ORS_API_KEY;
  if (!key) return send(res, 200, estimate(pts, profile));

  try {
    const r = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/geo+json' },
      // instructions: true garante "segments" (distância de cada trecho entre paradas);
      // radiuses -1 aceita pontos longe da via (aeroportos, locadoras dentro de terrenos grandes)
      body: JSON.stringify({ coordinates: pts.map(([lat, lng]) => [lng, lat]), instructions: true, radiuses: pts.map(() => -1) }),
    });
    const data = await r.json().catch(() => ({}));
    const f = data.features?.[0];
    if (!r.ok || !f) {
      const out = estimate(pts, profile);
      out.warning = `OpenRouteService: ${data.error?.message || r.status}. Mostrando estimativa.`;
      return send(res, 200, out);
    }
    const sum = f.properties?.summary || {};
    const line = f.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    send(res, 200, {
      source: 'ors',
      distance: sum.distance || 0,
      duration: sum.duration || 0,
      legs: legsFrom(f.properties || {}, line, pts.length - 1),
      line,
    });
  } catch (e) {
    const out = estimate(pts, profile);
    out.warning = `Falha no OpenRouteService (${e.message}). Mostrando estimativa.`;
    send(res, 200, out);
  }
}
