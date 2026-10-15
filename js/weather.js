// Previsão do tempo por dia com o Open-Meteo (grátis, sem chave, chamado direto do navegador).
// A previsão cobre ~16 dias à frente; dias mais distantes simplesmente não mostram nada.
// Cache neste aparelho por 3 horas, por local (arredondado a ~1 km).

const KEY = 'roteiro:weather';
const TTL = 3 * 60 * 60 * 1000;
const RANGE_DAYS = 16;

// Códigos WMO → ícone e descrição
const CODES = [
  [[0], '☀️', 'Céu limpo'],
  [[1], '🌤️', 'Poucas nuvens'],
  [[2], '⛅', 'Parcialmente nublado'],
  [[3], '☁️', 'Nublado'],
  [[45, 48], '🌫️', 'Neblina'],
  [[51, 53, 55, 56, 57], '🌦️', 'Garoa'],
  [[61, 63, 65, 66, 67], '🌧️', 'Chuva'],
  [[71, 73, 75, 77, 85, 86], '🌨️', 'Neve'],
  [[80, 81, 82], '🌦️', 'Pancadas de chuva'],
  [[95, 96, 99], '⛈️', 'Tempestade'],
];
export function describe(code) {
  const hit = CODES.find(([list]) => list.includes(code));
  return hit ? { icon: hit[1], label: hit[2] } : { icon: '🌡️', label: 'Tempo' };
}

let cache = null;
const load = () => {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { cache = {}; }
  return cache;
};
const persist = () => {
  // guarda só entradas recentes
  const c = load();
  for (const k of Object.keys(c)) if (Date.now() - (c[k].t || 0) > 24 * TTL) delete c[k];
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {}
};

export const locKey = (p) => `${(+p.lat).toFixed(2)},${(+p.lng).toFixed(2)}`;

/** Previsão salva para um local/data: {code, max, min, rain, icon, label} ou null. */
export function forecastAt(pos, date) {
  if (!pos) return null;
  const d = load()[locKey(pos)]?.days?.[date];
  return d ? { ...d, ...describe(d.code) } : null;
}

/** A data está dentro da janela de previsão (hoje até +15 dias)? */
export function inRange(date, today) {
  const diff = (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000;
  return diff >= 0 && diff < RANGE_DAYS;
}

const inflight = new Map();
/** Busca (se o cache estiver velho) a previsão de um local. Resolve true se trouxe dados novos. */
export async function fetchForecast(pos) {
  const k = locKey(pos);
  const hit = load()[k];
  if (hit && Date.now() - hit.t < TTL) return false;
  if (inflight.has(k)) return inflight.get(k);
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${(+pos.lat).toFixed(3)}&longitude=${(+pos.lng).toFixed(3)}`
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + `&timezone=auto&forecast_days=${RANGE_DAYS}`;
  const p = (async () => {
    try {
      const r = await fetch(url);
      if (!r.ok) return false;
      const data = await r.json();
      const d = data.daily || {};
      const days = {};
      (d.time || []).forEach((date, i) => {
        days[date] = {
          code: d.weather_code?.[i],
          max: d.temperature_2m_max?.[i],
          min: d.temperature_2m_min?.[i],
          rain: d.precipitation_probability_max?.[i],
        };
      });
      load()[k] = { t: Date.now(), days };
      persist();
      return true;
    } catch {
      return false; // sem internet: segue sem previsão
    } finally {
      inflight.delete(k);
    }
  })();
  inflight.set(k, p);
  return p;
}
