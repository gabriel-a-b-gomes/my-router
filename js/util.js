// Funções utilitárias e regras de negócio (sem DOM).

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const h = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Aceita "12,50", "1.234,50", "12.5" e números.
export const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v ?? '').trim().replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

export function money(v, currency = 'BRL', cents = false) {
  const opts = { style: 'currency', currency, maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 };
  try {
    return new Intl.NumberFormat('pt-BR', opts).format(num(v));
  } catch {
    return `${currency} ${num(v).toFixed(cents ? 2 : 0)}`;
  }
}

export const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`);
export function dur(s) {
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

// ---------- datas (sempre "YYYY-MM-DD", sem fuso) ----------
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function daysBetween(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export function fmtDate(iso, withWeekday = true) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const wd = WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}${withWeekday ? ` ${wd}` : ''}`;
}
export const fmtTime = (dt) => (dt && dt.length >= 16 ? dt.slice(11, 16) : '');
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- regras da viagem ----------
// Alternativas: itens com o mesmo "group" são opções do mesmo voo/hotel/carro/passeio.
// Só a opção vigente (active) entra nas regras; itens sem grupo valem sempre.
export const isActive = (x) => !x.group || !!x.active;
export const act = (arr) => (arr || []).filter(isActive);
export const groupOf = (arr, item) => (item.group ? arr.filter((x) => x.group === item.group) : [item]);
export function tripDays(trip) {
  if (!trip.startDate || !trip.endDate) return [];
  const n = Math.max(0, daysBetween(trip.startDate, trip.endDate)) + 1;
  return Array.from({ length: Math.min(n, 60) }, (_, i) => addDays(trip.startDate, i));
}

// Hospedagem onde a pessoa dormiu na noite anterior / dormirá nesta noite.
export const morningStay = (trip, date) => act(trip.stays).find((s) => s.checkin && s.checkout && s.checkin < date && s.checkout >= date);
export const nightStay = (trip, date) => act(trip.stays).find((s) => s.checkin && s.checkout && s.checkin <= date && s.checkout > date);

// Carro alugado disponível neste dia (da retirada até a devolução, inclusive).
export const carOn = (trip, date) =>
  act(trip.cars).find((c) => c.pickupAt && c.returnAt && c.pickupAt.slice(0, 10) <= date && c.returnAt.slice(0, 10) >= date);

// Dias com carro usam rota de carro; os demais usam o modo escolhido na viagem.
export const modeFor = (trip, i) => (carOn(trip, tripDays(trip)[i]) ? 'driving-car' : trip.mode || 'foot-walking');

// ---------- refeições ----------
// Café da manhã é sempre no hotel. Almoço e jantar têm opções de restaurante; a escolhida entra no roteiro.
export const MEALS = {
  almoco: { icon: '🍽️', label: 'Almoço', time: '12:30' },
  jantar: { icon: '🌙', label: 'Jantar', time: '20:00' },
};
export const PRICE_TAGS = { barato: '$ Barato', medio: '$$ Médio', caro: '$$$ Caro' };
export const FOOD_STYLES = {
  alacarte: 'À la carte', rodizio: 'Rodízio', quilo: 'Por quilo', buffet: 'Buffet',
  lanche: 'Lanche', petiscos: 'Petiscos/bar', praia: 'Barraca de praia', doceria: 'Café/doceria',
};
// opção de restaurante ainda não escolhida: fica fora do roteiro e da rota
export const isOption = (p) => p.category === 'comida' && !!p.meal && !p.chosen;
export const mealOptions = (trip, i, meal) => act(trip.places).filter((p) => p.day === i && p.category === 'comida' && p.meal === meal);
// restaurantes: custo por pessoa × pessoas; demais lugares: custo total
export const placeCost = (trip, p) => (p.category === 'comida' ? num(p.costPP) * Math.max(1, num(trip.travelers)) : num(p.cost));

// Previsto de cada refeição: escolhida → seu custo; só opções → média delas; nada → orçamento por pessoa.
export function mealPlan(trip, i, meal) {
  const opts = mealOptions(trip, i, meal);
  const chosen = opts.find((p) => p.chosen) || null;
  const priced = opts.filter((p) => num(p.costPP) > 0);
  let value, basis;
  if (chosen) { value = placeCost(trip, chosen); basis = 'escolhido'; }
  else if (priced.length) { value = priced.reduce((s, p) => s + placeCost(trip, p), 0) / priced.length; basis = 'média das opções'; }
  else { value = num(trip[`${meal}Budget`]) * Math.max(1, num(trip.travelers)); basis = 'orçamento'; }
  return { meal, opts, chosen, value, basis };
}

// Atrações de um passeio: [{id, name, price (por pessoa; vazio = sem preço), interest, done}]
export function attractionTotals(p) {
  const list = Array.isArray(p?.attractions) ? p.attractions : [];
  const fav = list.filter((a) => a.interest);
  const sum = (l) => l.reduce((acc, a) => acc + num(a.price), 0);
  return { count: list.length, fav: fav.length, done: fav.filter((a) => a.done).length, favPP: sum(fav), allPP: sum(list) };
}

export const dayPlaces = (trip, i) => act(trip.places).filter((p) => p.day === i && !isOption(p)).sort((a, b) => a.order - b.order);

// Durações sugeridas para passeios (minutos)
export const DURATIONS = [[30, '30 min'], [60, '1 h'], [90, '1h30'], [120, '2 h'], [180, '3 h'], [240, '4 h'], [300, '5 h'], [360, 'Meio dia (6 h)'], [480, 'Dia inteiro (8 h)']];
export const fmtDuration = (min) => {
  const m = Math.round(num(min));
  if (!m) return '';
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`;
};

export const flightsOn = (trip, date) =>
  act(trip.flights).filter((f) => (f.depart || '').startsWith(date) || (f.arrive || '').startsWith(date));

export const hasPos = (o) => o && Number.isFinite(o.lat) && Number.isFinite(o.lng);

// Trecho do voo: 'ida' (chega ao destino), 'volta' (sai do destino) ou 'interno' (os dois).
// Se não foi escolhido, adivinha pela data: chegada na 1ª metade da viagem = ida.
export function flightLeg(trip, f) {
  if (f.leg) return f.leg;
  const days = tripDays(trip);
  const mid = days[Math.floor((days.length - 1) / 2)] || '';
  return (f.arrive || f.depart || '').slice(0, 10) <= mid ? 'ida' : 'volta';
}

const pt = (o, prefix) => (o && Number.isFinite(o[`${prefix}Lat`]) && Number.isFinite(o[`${prefix}Lng`])
  ? { lat: o[`${prefix}Lat`], lng: o[`${prefix}Lng`] } : null);

// Pontos fixos do dia: de onde sai, onde termina, retirada/devolução do carro.
export function dayAnchors(trip, date) {
  let start = null, end = null, pickup = null, ret = null;
  for (const f of act(trip.flights)) {
    const leg = flightLeg(trip, f);
    if (leg !== 'volta' && (f.arrive || '').startsWith(date) && pt(f, 'to')) start = { ...pt(f, 'to'), name: `Aeroporto ${f.to || ''}`.trim(), icon: '✈️' };
    if (leg !== 'ida' && (f.depart || '').startsWith(date) && pt(f, 'from')) end = { ...pt(f, 'from'), name: `Aeroporto ${f.from || ''}`.trim(), icon: '✈️' };
  }
  for (const c of act(trip.cars)) {
    if ((c.pickupAt || '').startsWith(date) && pt(c, 'pickup')) pickup = { ...pt(c, 'pickup'), name: `Retirada do carro${c.company ? ` (${c.company})` : ''}`, icon: '🔑' };
    if ((c.returnAt || '').startsWith(date) && pt(c, 'return')) ret = { ...pt(c, 'return'), name: `Devolução do carro${c.company ? ` (${c.company})` : ''}`, icon: '🔑' };
  }
  const ms = morningStay(trip, date), ns = nightStay(trip, date);
  const stayStart = hasPos(ms) ? ms : hasPos(ns) ? ns : null;
  const stayEnd = hasPos(ns) ? ns : hasPos(ms) ? ms : null;
  start ??= stayStart && { lat: stayStart.lat, lng: stayStart.lng, name: stayStart.name, icon: '🏨' };
  end ??= stayEnd && { lat: stayEnd.lat, lng: stayEnd.lng, name: stayEnd.name, icon: '🏨' };
  return { start, end, pickup, ret };
}

// ---------- trechos e quilometragem ----------
// Categorias de trecho: cada uma vira uma linha no mapa e um total de km.
export const LEG_CATS = {
  air: { icon: '✈️', label: 'Avião', group: 'air' },
  rental: { icon: '🚗', label: 'Carro alugado', group: 'car', profile: 'driving-car' },
  transfer: { icon: '🚐', label: 'Táxi/traslado', group: 'car', profile: 'driving-car' },
  drive: { icon: '🚗', label: 'Carro', group: 'car', profile: 'driving-car' },
  foot: { icon: '🚶', label: 'A pé', group: 'foot', profile: 'foot-walking' },
  bike: { icon: '🚲', label: 'Bicicleta', group: 'foot', profile: 'cycling-regular' },
};
const MODE_CAT = { 'foot-walking': 'foot', 'cycling-regular': 'bike', 'driving-car': 'drive' };

// Retirada logo após o desembarque / devolução seguida do embarque.
// Se a pessoa não escolheu, deduz: retirada no mesmo dia da chegada de um voo de ida = sim.
export function pickupAfterFlight(trip, c) {
  if (typeof c.pickupAfterFlight === 'boolean') return c.pickupAfterFlight;
  const d = (c.pickupAt || '').slice(0, 10);
  return !!d && act(trip.flights).some((f) => flightLeg(trip, f) !== 'volta' && (f.arrive || '').startsWith(d));
}
export function returnBeforeFlight(trip, c) {
  if (typeof c.returnBeforeFlight === 'boolean') return c.returnBeforeFlight;
  const d = (c.returnAt || '').slice(0, 10);
  return !!d && act(trip.flights).some((f) => flightLeg(trip, f) !== 'ida' && (f.depart || '').startsWith(d));
}

const samePos = (a, b) => Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lng - b.lng) < 1e-5;
const toMin = (hhmm) => (/^\d{2}:\d{2}/.test(hhmm || '') ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null);
// posição de um evento com horário no meio dos lugares (antes do 1º lugar com horário igual ou maior)
function slotByTime(places, time, fallback) {
  const t = toMin(time);
  if (t == null) return fallback;
  const k = places.findIndex((p) => toMin(p.time) != null && toMin(p.time) >= t);
  if (k >= 0) return k;
  return places.some((p) => toMin(p.time) != null) ? places.length : fallback;
}

// Plano do dia: a sequência de paradas e o tipo de cada trecho.
//  items  → tudo na ordem (inclui lugares sem posição), para a lista do dia
//  points → só o que tem posição, sem repetir pontos iguais em sequência
//  owners → quem está em cada ponto (vários quando coincidem, ex.: aeroporto = retirada)
//  legs   → um por trecho entre pontos: { cat } (rental, transfer, foot, bike, drive)
export function dayPlan(trip, i) {
  const date = tripDays(trip)[i];
  const a = dayAnchors(trip, date);
  const car = carOn(trip, date);
  const pickupDay = !!car && (car.pickupAt || '').startsWith(date);
  const returnDay = !!car && (car.returnAt || '').startsWith(date);
  const afterFlight = pickupDay && pickupAfterFlight(trip, car);
  const beforeFlight = returnDay && returnBeforeFlight(trip, car);
  let pickup = pickupDay ? a.pickup : null;
  let ret = returnDay ? a.ret : null;
  // retirada/devolução "no aeroporto" quando não há endereço da locadora
  if (afterFlight && !pickup && a.start?.icon === '✈️') pickup = { ...a.start, name: 'Retirada do carro no aeroporto', icon: '🔑' };
  if (beforeFlight && !ret && a.end?.icon === '✈️') ret = { ...a.end, name: 'Devolução do carro no aeroporto', icon: '🔑' };

  const places = dayPlaces(trip, i).map((p) => ({ ...p, owner: p.id, kind: 'place' }));
  const mid = [...places];
  if (pickup) {
    const k = afterFlight ? 0 : slotByTime(places, fmtTime(car.pickupAt), 0);
    mid.splice(k, 0, { ...pickup, owner: 'pickup', kind: 'anchor' });
  }
  if (ret) {
    const placesOnly = mid.filter((x) => x.kind === 'place');
    let k = beforeFlight ? mid.length : slotByTime(placesOnly, fmtTime(car.returnAt), placesOnly.length);
    if (!beforeFlight && k < placesOnly.length) k = mid.indexOf(placesOnly[k]);
    else k = mid.length;
    mid.splice(k, 0, { ...ret, owner: 'return', kind: 'anchor' });
  }
  const items = [
    ...(a.start ? [{ ...a.start, owner: 'start', kind: 'anchor' }] : []),
    ...mid,
    ...(a.end ? [{ ...a.end, owner: 'end', kind: 'anchor' }] : []),
  ];

  const points = [], owners = [], airport = [];
  for (const it of items) {
    if (!hasPos(it)) continue;
    const last = points.length - 1;
    if (last >= 0 && samePos({ lat: points[last][0], lng: points[last][1] }, it)) {
      owners[last].push(it.owner);
      airport[last] ||= it.icon === '✈️';
      continue;
    }
    points.push([it.lat, it.lng]);
    owners.push([it.owner]);
    airport.push(it.icon === '✈️');
  }

  // Trechos com o carro alugado: da retirada (ou início do dia) até a devolução (ou fim do dia).
  const idx = (owner) => owners.findIndex((o) => o.includes(owner));
  let carFrom = Infinity, carUntil = -1;
  if (car) {
    carFrom = pickupDay ? idx('pickup') : 0;
    if (pickupDay && carFrom < 0) carFrom = 0; // retirada sem endereço: considera o dia todo
    carUntil = returnDay ? idx('return') : points.length - 1;
    if (returnDay && carUntil < 0) carUntil = points.length - 1;
  }
  const legs = [];
  for (let k = 0; k < points.length - 1; k++) {
    let cat;
    if (k >= carFrom && k + 1 <= carUntil) cat = 'rental';
    else if (airport[k] || airport[k + 1]) cat = 'transfer';
    else cat = MODE_CAT[trip.mode] || 'foot';
    legs.push({ cat });
  }
  return { date, car, items, points, owners, legs, start: a.start, end: a.end, pickup, ret, afterFlight, beforeFlight };
}

// Distância do voo em linha reta entre os aeroportos (km), quando os dois estão no mapa.
export function haversineKm(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s2 = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s2));
}
export const flightEnds = (f) => {
  const from = Number.isFinite(f.fromLat) && Number.isFinite(f.fromLng) ? { lat: f.fromLat, lng: f.fromLng } : null;
  const to = Number.isFinite(f.toLat) && Number.isFinite(f.toLng) ? { lat: f.toLat, lng: f.toLng } : null;
  return { from, to };
};
export function flightKm(f) {
  const { from, to } = flightEnds(f);
  return from && to ? haversineKm(from, to) : null;
}
// Arco do voo (rota de círculo máximo), para desenhar no mapa.
export function greatCircle(a, b, n = 48) {
  const rad = (x) => (x * Math.PI) / 180, deg = (x) => (x * 180) / Math.PI;
  const [la1, lo1, la2, lo2] = [rad(a.lat), rad(a.lng), rad(b.lat), rad(b.lng)];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  if (d === 0) return [[a.lat, a.lng]];
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    pts.push([deg(Math.atan2(z, Math.sqrt(x * x + y * y))), deg(Math.atan2(y, x))]);
  }
  return pts;
}

// km de cada categoria num dia (registro salvo em trip.dayStats)
export function dayKm(st) {
  if (!st) return {};
  if (st.byCat) return Object.fromEntries(Object.entries(st.byCat).map(([k, m]) => [k, m / 1000]));
  // formato antigo: um modo para o dia inteiro
  return { [st.mode === 'driving-car' ? 'rental' : MODE_CAT[st.mode] || 'foot']: (st.distance || 0) / 1000 };
}

// Quilometragem da viagem por categoria (km). Voos entram pela distância entre os aeroportos.
export function kmSummary(trip) {
  const byCat = { air: 0, rental: 0, transfer: 0, drive: 0, foot: 0, bike: 0 };
  let flightsMissing = 0;
  for (const f of act(trip.flights)) {
    const k = flightKm(f);
    if (k == null) flightsMissing++;
    else byCat.air += k;
  }
  tripDays(trip).forEach((_, i) => {
    for (const [k, v] of Object.entries(dayKm(trip.dayStats?.[i]))) byCat[k] = (byCat[k] || 0) + v;
  });
  const ground = byCat.rental + byCat.transfer + byCat.drive + byCat.foot + byCat.bike;
  return { byCat, air: byCat.air, ground, total: byCat.air + ground, flightsMissing };
}

export const DAY_COLORS = ['#e4572e', '#2e86ab', '#3bb273', '#f2a541', '#8e5bd0', '#d1495b', '#00a6a6', '#a0522d', '#5b6ee1', '#c2185b'];
export const dayColor = (i) => (i == null ? '#6b7280' : DAY_COLORS[i % DAY_COLORS.length]);

// Categorias dos lugares do roteiro
export const CATEGORIES = { passeio: '📍 Passeio', comida: '🍽️ Comida', outro: '⭐ Outro' };
export const catIcon = (c) => (CATEGORIES[c] || CATEGORIES.outro).split(' ')[0];

// Categorias dos gastos lançados durante a viagem
export const EXP_CATS = {
  comida: ['🍽️', 'Comida'],
  combustivel: ['⛽', 'Combustível'],
  pedagio: ['🅿️', 'Pedágio/Estac.'],
  passeios: ['🎟️', 'Passeios'],
  transporte: ['🚇', 'Transporte'],
  compras: ['🛍️', 'Compras'],
  outros: ['⭐', 'Outros'],
};

// ---------- custos ----------
export function carDays(trip) {
  return tripDays(trip).filter((d) => carOn(trip, d)).length;
}

// Nº de diárias pelo horário de retirada/devolução (com 1h de tolerância, como nas locadoras).
export function computedDailies(c) {
  if (!c.pickupAt || !c.returnAt) return 0;
  const hours = (new Date(c.returnAt) - new Date(c.pickupAt)) / 3600000;
  return hours > 0 ? Math.max(1, Math.ceil((hours - 1) / 24)) : 0;
}

// Custo do aluguel, no formato das reservas:
// diárias + proteção por dia + adicionais (únicos ou por dia) + taxa de aluguel (% sobre a soma).
export function carRental(c) {
  const days = num(c.dailies) || computedDailies(c);
  const daily = days * num(c.dailyRate);
  const protection = days * num(c.protectionPerDay);
  const addons = (c.addons || []).reduce((s, a) => s + (a.perDay ? num(a.value) * days : num(a.value)), 0);
  const base = daily + protection + addons;
  const fee = (base * num(c.feePct)) / 100;
  return { days, daily, protection, addons, base, fee, total: base + fee, kmAllowance: num(c.kmPerDay) ? num(c.kmPerDay) * days : 0 };
}

// Previsto para cada dia (o que depende do dia).
export function plannedDay(trip, i) {
  const date = tripDays(trip)[i];
  const car = carOn(trip, date);
  const ps = dayPlaces(trip, i);
  const meals = Object.keys(MEALS).map((m) => mealPlan(trip, i, m));
  const mealsTotal = meals.reduce((s, m) => s + m.value, 0);
  // restaurantes do dia que não são almoço/jantar (ex.: um lanche à tarde)
  const otherFood = ps.filter((p) => p.category === 'comida' && !p.meal).reduce((s, p) => s + placeCost(trip, p), 0);
  const food = num(trip.dailyFood) + mealsTotal + otherFood;
  const tours = ps.filter((p) => p.category !== 'comida').reduce((s, p) => s + placeCost(trip, p), 0);
  const transport = car ? 0 : num(trip.dailyTransport);
  const st = trip.dayStats?.[i];
  const kmDriven = car ? dayKm(st).rental || 0 : 0;
  const fuel = car && num(car.kml) > 0 ? (kmDriven / num(car.kml)) * num(car.fuelPrice) : 0;
  const parking = car ? num(car.parkingPerDay) : 0;
  return { date, car, food, meals, mealsTotal, tours, transport, fuel, parking, kmDriven, total: food + tours + transport + fuel + parking };
}

export const spentOn = (trip, date) => (trip.expenses || []).filter((e) => e.date === date);
export const sumAmount = (list) => list.reduce((s, e) => s + num(e.amount), 0);

// Km rodados com cada carro: rotas dos dias com carro (calculadas de carro) + km fora do roteiro.
export function carKm(trip, c) {
  const routes = tripDays(trip).reduce((sum, d, i) => {
    const st = trip.dayStats?.[i];
    return sum + (carOn(trip, d) === c ? dayKm(st).rental || 0 : 0);
  }, 0);
  const extra = num(c.extraKm);
  const total = routes + extra;
  const liters = num(c.kml) > 0 ? total / num(c.kml) : 0;
  const allowance = carRental(c).kmAllowance;
  const excessKm = allowance && total > allowance ? total - allowance : 0;
  return { routes, extra, total, liters, fuel: liters * num(c.fuelPrice), allowance, excessKm, excessCost: excessKm * num(c.excessKmPrice) };
}

export function tripSummary(trip) {
  const days = tripDays(trip).map((_, i) => plannedDay(trip, i));
  const exp = trip.expenses || [];
  const spentCat = (cat) => sumAmount(exp.filter((e) => e.cat === cat));
  const sumDays = (k) => days.reduce((s, d) => s + d[k], 0);

  const cars = act(trip.cars);
  const rental = cars.reduce((s, c) => s + carRental(c).total, 0);
  const kms = cars.map((c) => carKm(trip, c));
  // Combustível previsto: cada km entra uma vez só — rotas dos dias com carro + km fora do roteiro.
  const fuel = kms.reduce((s, k) => s + k.fuel, 0);
  const excess = kms.reduce((s, k) => s + k.excessCost, 0);
  const tolls = cars.reduce((s, c) => s + num(c.tolls), 0);
  const flights = act(trip.flights).reduce((s, f) => s + num(f.price), 0);
  const stays = act(trip.stays).reduce((s, x) => s + num(x.price), 0);

  // [chave, rótulo, previsto, gasto, grupo]
  const rows = [
    ['voos', '✈️ Voos', flights, flights, 'reservas'],
    ['hospedagem', '🏨 Hospedagem', stays, stays, 'reservas'],
    ['carro', '🚗 Aluguel do carro', rental, rental, 'reservas'],
    ['combustivel', '⛽ Combustível', fuel, spentCat('combustivel'), 'carro'],
    ['pedagio', '🅿️ Pedágio e estacionamento', sumDays('parking') + tolls, spentCat('pedagio'), 'carro'],
    ['excedente', '📏 Km acima da franquia', excess, 0, 'carro'],
    ['comida', '🍽️ Comida', sumDays('food'), spentCat('comida'), 'dia'],
    ['passeios', '🎟️ Passeios e ingressos', sumDays('tours'), spentCat('passeios'), 'dia'],
    ['transporte', '🚇 Transporte local', sumDays('transport'), spentCat('transporte'), 'dia'],
    ['compras', '🛍️ Compras', num(trip.shoppingBudget), spentCat('compras'), 'dia'],
    ['outros', '⭐ Outros', 0, spentCat('outros'), 'dia'],
  ].filter((r) => r[2] || r[3] || ['voos', 'hospedagem', 'comida'].includes(r[0]) || (r[0] === 'carro' && cars.length));

  const planned = rows.reduce((s, r) => s + r[2], 0);
  const spent = rows.reduce((s, r) => s + r[3], 0);
  const kmCar = kms.reduce((s, k) => s + k.total, 0);
  return { rows, planned, spent, days, km: kmSummary(trip), kmCar, kms, prepaid: flights + stays + rental };
}

export function newTrip(fields) {
  return {
    id: uid(), name: '', destination: '', startDate: '', endDate: '', travelers: 1, currency: 'BRL',
    mode: 'foot-walking', center: null, flights: [], stays: [], cars: [], places: [], expenses: [], scenarios: [],
    dayStats: {}, dailyFood: 0, dailyTransport: 0, shoppingBudget: 0, createdAt: new Date().toISOString(),
    ...fields,
  };
}

// Garante que viagens antigas tenham todos os campos novos.
export function normalizeTrip(t) {
  t.cars ??= [];
  t.expenses ??= [];
  t.places ??= [];
  t.flights ??= [];
  t.stays ??= [];
  t.dayStats ??= {};
  t.cancelled ??= false;
  t.scenarios ??= [];
  ensurePackages(t);
  const hadAlt = PKG_KEYS.some((k) => t[k].some((x) => x.group && !x.active));
  if (hadAlt && t.packages.length === 1) {
    const b = { id: uid(), name: 'Pacote B' };
    for (const k of PKG_KEYS) {
      const seen = new Set();
      b[k] = [];
      for (const x of t[k]) {
        if (!x.group) { b[k].push(JSON.parse(JSON.stringify({ ...x, id: uid() }))); continue; }
        if (!x.active && !seen.has(x.group)) { seen.add(x.group); b[k].push({ ...x, id: uid() }); }
      }
      t[k] = t[k].filter((x) => !x.group || x.active);
    }
    t.packages.push(b);
  }
  for (const k of PKG_KEYS) for (const x of t[k]) { delete x.group; delete x.active; }
  for (const f of t.flights) f.leg ??= '';
  t.almocoBudget ??= 0; // orçamento por pessoa quando não há restaurante escolhido
  t.jantarBudget ??= 0;
  for (const p of t.places) {
    // restaurantes passaram a ter custo por pessoa
    if (p.category === 'comida' && p.costPP == null) {
      p.costPP = num(p.cost) ? Math.round((num(p.cost) / Math.max(1, num(t.travelers))) * 100) / 100 : 0;
    }
  }
  for (const c of t.cars) {
    if (c.dailyRate == null) {
      // versão anterior: "price" (total das diárias) e "extras"
      const d = computedDailies(c) || 1;
      c.dailyRate = Math.round((num(c.price) / d) * 100) / 100;
      c.protectionPerDay = 0;
      c.addons = num(c.extras) ? [{ id: uid(), name: 'Seguro e extras', value: num(c.extras), perDay: false }] : [];
      c.feePct = 0;
      c.kmPerDay = 0;
      c.pickupAddress ??= c.pickupPlace || '';
      c.returnAddress ??= c.returnPlace || '';
      delete c.price; delete c.extras; delete c.pickupPlace; delete c.returnPlace;
    }
    c.addons ??= [];
    c.excessKmPrice ??= 0;
    c.protectionName ??= '';
  }
  return t;
}

// ---------- pacotes de reservas ----------
// Cada pacote tem seus voos, hospedagens e carros. O vigente fica em trip.flights/stays/cars
// (é o que as regras usam); os demais ficam guardados em trip.packages[i].
export const PKG_KEYS = ['flights', 'stays', 'cars'];
export function ensurePackages(t) {
  if (!Array.isArray(t.packages) || !t.packages.length) {
    t.packages = [{ id: uid(), name: 'Pacote A' }];
    t.packageId = t.packages[0].id;
  }
  if (!t.packages.some((p) => p.id === t.packageId)) t.packageId = t.packages[0].id;
  return t;
}
export const activePackage = (t) => ensurePackages(t).packages.find((p) => p.id === t.packageId);
// Dados de um pacote (o vigente vem da viagem; os outros, do próprio pacote)
export const packageData = (t, pkg) => Object.fromEntries(PKG_KEYS.map((k) => [k, pkg.id === t.packageId ? t[k] : pkg[k] || []]));
export function switchPackage(t, id) {
  ensurePackages(t);
  if (id === t.packageId) return;
  const cur = activePackage(t);
  const target = t.packages.find((p) => p.id === id);
  if (!target) return;
  for (const k of PKG_KEYS) { cur[k] = t[k]; t[k] = target[k] || []; delete target[k]; }
  t.packageId = id;
}
// Cópia profunda com ids novos (para "duplicar pacote")
export function clonePackageData(data) {
  const copy = JSON.parse(JSON.stringify(data));
  for (const k of PKG_KEYS) for (const x of copy[k]) {
    x.id = uid();
    delete x.group; delete x.active;
    if (x.addons) x.addons = x.addons.map((a) => ({ ...a, id: uid() }));
  }
  return copy;
}
// Total das reservas de um pacote (voos + hospedagem + aluguel)
export function packageCost(t, pkg) {
  const d = packageData(t, pkg);
  return d.flights.reduce((s, f) => s + num(f.price), 0) + d.stays.reduce((s, x) => s + num(x.price), 0)
    + d.cars.reduce((s, c) => s + carRental(c).total, 0);
}

// ---------- cenários ----------
// Um cenário guarda qual opção é a vigente em cada grupo e quais restaurantes estão escolhidos.
export function currentChoices(trip) {
  const groups = {};
  for (const x of trip.places || []) if (x.group && x.active) groups[x.group] = x.id;
  const meals = (trip.places || []).filter((p) => p.category === 'comida' && p.meal && p.chosen).map((p) => p.id).sort();
  return { packageId: ensurePackages(trip).packageId, groups, meals };
}
export function applyChoices(trip, choices) {
  if (choices.packageId && trip.packages?.some((p) => p.id === choices.packageId)) switchPackage(trip, choices.packageId);
  for (const x of trip.places || []) {
    if (x.group && choices.groups?.[x.group]) x.active = x.id === choices.groups[x.group];
  }
  if (Array.isArray(choices.meals)) {
    const chosen = new Set(choices.meals);
    for (const p of trip.places || []) if (p.category === 'comida' && p.meal) p.chosen = chosen.has(p.id);
  }
  return trip;
}
const choiceKey = (c) => JSON.stringify([c.packageId || '', Object.entries(c.groups || {}).sort(), [...(c.meals || [])].sort()]);
export const sameChoices = (a, b) => choiceKey(a) === choiceKey(b);
// Resumo de um cenário sem mexer na viagem (os km usam as rotas já calculadas).
export function simulate(trip, choices) {
  const copy = applyChoices(JSON.parse(JSON.stringify(trip)), choices);
  return tripSummary(copy);
}
