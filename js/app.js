import {
  uid, h, num, money, km, dur, fmtDate, fmtTime, localToday, daysBetween, tripDays, carOn, modeFor,
  dayPlaces, flightsOn, hasPos, dayPlan, dayColor, CATEGORIES, catIcon, EXP_CATS, plannedDay, spentOn,
  sumAmount, tripSummary, newTrip, flightLeg, carRental, carKm, computedDailies, LEG_CATS, flightKm, flightEnds,
  greatCircle, dayKm, pickupAfterFlight, returnBeforeFlight, haversineKm, MEALS, PRICE_TAGS, FOOD_STYLES,
  mealPlan, placeCost, DURATIONS, fmtDuration,
} from './util.js';
import { api, getPassword, setPassword, geocode, getRoute } from './api.js';
import { store, loadData, loadOffline, save, getTrip, onSync, replaceAll } from './store.js';
import { mountMap, drawMap, refreshSize, setPicking } from './map.js';

const app = document.getElementById('app');

const freshNewPlace = (day = null) => ({
  open: false, query: '', results: [], searching: false, error: '',
  name: '', category: 'passeio', day, time: '', cost: '', lat: null, lng: null, address: '',
  meal: '', price: '', style: '', costPP: '', duration: '',
});

const ui = {
  features: {},
  tripId: null,
  tab: 'roteiro',
  day: 'all',
  expDay: null,
  expCat: 'comida',
  np: freshNewPlace(),
  pick: null, // { kind, id, prefix, label }
  open: new Set(), // blocos "Editar" abertos na aba Reservas
  busy: {},
  routes: new Map(), // cache: chave → resultado da rota
  fitKey: '',
  layers: loadLayers(), // camadas visíveis no mapa
  kmMode: loadPref('roteiro:kmMode') === '1', // mostra os km entre cada etapa do dia
  editOpt: null, // opção de restaurante sendo editada no bloco Refeições
  mapBusy: new Map(), // tarefas em andamento mostradas sobre o mapa
};

function loadPref(key) { try { return localStorage.getItem(key); } catch { return null; } }
function savePref(key, v) { try { localStorage.setItem(key, v); } catch {} }
function loadLayers() {
  const def = { air: true, car: true, foot: true };
  try { return { ...def, ...JSON.parse(localStorage.getItem('roteiro:layers') || '{}') }; } catch { return def; }
}
function saveLayers() {
  try { localStorage.setItem('roteiro:layers', JSON.stringify(ui.layers)); } catch {}
}

const TABS = [
  ['roteiro', '🗺️', 'Roteiro'],
  ['gastos', '💸', 'Gastos'],
  ['reservas', '🎫', 'Reservas'],
  ['resumo', '📊', 'Resumo'],
];
const MODES = { 'foot-walking': '🚶 A pé', 'cycling-regular': '🚲 Bicicleta', 'driving-car': '🚗 Carro' };
const MODE_ICON = { 'foot-walking': '🚶', 'driving-car': '🚗', 'cycling-regular': '🚲' };
const CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP', 'ARS', 'CLP', 'UYU', 'MXN', 'COP', 'PEN', 'JPY', 'CAD', 'AUD', 'CHF'];
const LEGS = { '': 'Automático', ida: 'Ida (chega ao destino)', volta: 'Volta (sai do destino)', interno: 'Entre cidades da viagem' };

// ---------------------------------------------------------------- utilidades de UI
function toast(msg, kind = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.className = `toast show ${kind}`;
  el.textContent = msg;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.className = 'toast'), 3500);
}

// Diálogo de confirmação (substitui o confirm() do navegador).
function confirmDialog({ title, message = '', confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    document.getElementById('confirm-dialog')?.remove();
    const dlg = document.createElement('dialog');
    dlg.id = 'confirm-dialog';
    dlg.className = 'dialog';
    dlg.innerHTML = `
      <form method="dialog" class="dialog-body">
        <h2>${h(title)}</h2>
        ${message ? `<p>${h(message)}</p>` : ''}
        <div class="dialog-actions">
          <button class="btn ghost" value="cancel">Cancelar</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" value="ok">${h(confirmLabel)}</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => {
      resolve(dlg.returnValue === 'ok');
      setTimeout(() => dlg.remove(), 200);
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close('cancel'); });
    dlg.showModal();
    dlg.querySelector('button[value="ok"]').focus();
  });
}

// Aviso de carregamento sobre o mapa ("Procurando no mapa…", "Calculando rotas…").
function renderMapStatus() {
  const el = document.getElementById('map-status');
  if (!el) return;
  const labels = [...ui.mapBusy.values()];
  el.hidden = !labels.length;
  el.innerHTML = labels.length ? `<span class="spin-sm" aria-hidden="true"></span>${h(labels[labels.length - 1])}` : '';
}
async function withMapBusy(label, fn) {
  const key = Symbol(label);
  ui.mapBusy.set(key, label);
  renderMapStatus();
  try {
    return await fn();
  } finally {
    ui.mapBusy.delete(key);
    renderMapStatus();
  }
}

const trip = () => getTrip(ui.tripId);
const cur = () => trip()?.currency || 'BRL';
const dec = (v) => (num(v) ? String(num(v)).replace('.', ',') : '');

async function withBusy(key, fn) {
  if (ui.busy[key]) return;
  ui.busy[key] = true;
  renderPanel();
  try {
    await fn();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    ui.busy[key] = false;
    renderPanel();
  }
}

// Contagem regressiva da viagem.
function countdown(t) {
  if (!t.startDate || !t.endDate) return '';
  const today = localToday();
  if (today > t.endDate) return 'Viagem concluída';
  if (today >= t.startDate) return `Dia ${daysBetween(t.startDate, today) + 1} de ${tripDays(t).length}`;
  const n = daysBetween(today, t.startDate);
  return n === 1 ? 'É amanhã!' : `Faltam ${n} dias`;
}

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function dateRange(t) {
  if (!t.startDate) return 'Sem datas';
  const [, m1, d1] = t.startDate.split('-').map(Number);
  const [, m2, d2] = t.endDate.split('-').map(Number);
  return m1 === m2 ? `${d1} a ${d2} de ${MONTHS[m2 - 1]}` : `${d1} de ${MONTHS[m1 - 1]} a ${d2} de ${MONTHS[m2 - 1]}`;
}

// ---------------------------------------------------------------- inicialização
async function boot() {
  if (!getPassword()) return renderLogin();
  app.innerHTML = '<div class="center-screen"><div class="spinner" aria-label="Carregando"></div></div>';
  try {
    const s = await api('status');
    ui.features = s.features;
    await loadData();
    route();
  } catch (e) {
    if (e.status === 401 || e.status === 500) return renderLogin(e.message);
    if (e.status === 0 && loadOffline()) {
      route();
      return toast('Sem internet: mostrando o roteiro salvo neste aparelho.', 'warn');
    }
    renderLogin(`Não foi possível conectar: ${e.message}`);
  }
}

window.addEventListener('auth-required', () => {
  setPassword('');
  renderLogin('Senha inválida ou alterada. Entre novamente.');
});
window.addEventListener('hashchange', route);
onSync(renderSync);

function renderLogin(error = '') {
  app.dataset.view = 'login';
  app.innerHTML = `
    <div class="center-screen login-screen">
      <form class="login" data-form="login">
        <div class="login-mark" aria-hidden="true">✈</div>
        <h1>Meu Roteiro</h1>
        <p>Seu planejador de viagens.</p>
        <input type="password" name="pw" placeholder="Senha do app" autocomplete="current-password" required autofocus>
        ${error ? `<p class="error">${h(error)}</p>` : ''}
        <button class="btn primary" type="submit">Entrar</button>
      </form>
    </div>`;
}

function cancelPick() {
  ui.pick = null;
  setPicking(null);
}

function route() {
  if (app.dataset.view === 'login' && !getPassword()) return;
  const m = location.hash.match(/^#\/t\/([^/]+)(?:\/(\w+))?/);
  if (m && getTrip(m[1])) {
    const t = getTrip(m[1]);
    if (ui.tripId !== m[1]) {
      ui.tripId = m[1];
      ui.day = 'all';
      ui.np = freshNewPlace();
      ui.open.clear();
      const days = tripDays(t);
      ui.expDay = days.includes(localToday()) ? localToday() : days[0] || null;
    }
    const tab = TABS.some((x) => x[0] === m[2]) ? m[2] : 'roteiro';
    if (tab !== ui.tab) cancelPick();
    ui.tab = tab;
    renderTrip();
  } else {
    ui.tripId = null;
    cancelPick();
    renderHome();
  }
}

// ---------------------------------------------------------------- cartão de embarque
function firstFlight(t, leg) {
  return [...t.flights].filter((f) => flightLeg(t, f) === leg).sort((a, b) => (a.depart || '').localeCompare(b.depart || ''))[0];
}

function passHtml({ from, to, fromSub, toSub, metaLeft, metaRight, stubLabel, stubValue, stubSub, big = false }) {
  return `
    <div class="pass ${big ? 'pass-big' : ''}">
      <div class="pass-main">
        <div class="pass-route">
          <div class="pass-city"><span class="iata">${h(from || '—')}</span><span class="pass-sub">${h(fromSub || '')}</span></div>
          <div class="pass-path" aria-hidden="true"><span class="plane">✈</span></div>
          <div class="pass-city to"><span class="iata">${h(to || '—')}</span><span class="pass-sub">${h(toSub || '')}</span></div>
        </div>
        <div class="pass-meta"><span>${metaLeft || ''}</span><span>${metaRight || ''}</span></div>
      </div>
      <div class="pass-stub">
        <span class="stub-label">${h(stubLabel || '')}</span>
        <b class="stub-value">${h(stubValue || '—')}</b>
        <span class="stub-sub">${stubSub || ''}</span>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- tela inicial
function renderHome() {
  app.dataset.view = 'home';
  const today = localToday();
  const trips = [...store.data.trips].sort((a, b) => (a.startDate || '9').localeCompare(b.startDate || '9'));
  const next = trips.find((t) => t.endDate && t.endDate >= today) || null;
  const f = ui.features;

  let hero;
  if (next) {
    const ida = firstFlight(next, 'ida');
    const dest = next.destination.split(',')[0];
    hero = `
      <a class="hero-pass" href="#/t/${next.id}/roteiro" aria-label="Abrir ${h(next.name || dest)}">
        <p class="hero-kicker">${h(countdown(next))}</p>
        ${passHtml({
          big: true,
          from: ida?.from || 'Casa', to: ida?.to || dest.slice(0, 3).toUpperCase(),
          fromSub: ida ? `${fmtDate(ida.depart)} ${fmtTime(ida.depart)}` : '',
          toSub: dest,
          metaLeft: h(next.name || 'Viagem'),
          metaRight: dateRange(next),
          stubLabel: 'Passageiros', stubValue: String(num(next.travelers) || 1),
          stubSub: `${tripDays(next).length} dias`,
        })}
      </a>`;
  } else {
    hero = `<div class="hero-empty"><h1>Para onde vamos?</h1><p>Crie sua viagem e monte o roteiro dia a dia, com mapa e controle de gastos.</p></div>`;
  }

  app.innerHTML = `
    <header class="home-hero">
      <div class="home-top">
        <span class="brand"><span class="brand-mark" aria-hidden="true">✈</span> Meu Roteiro</span>
        <span id="sync" class="sync"></span>
      </div>
      ${hero}
    </header>
    <main class="home">
      ${trips.length ? `
      <section>
        <h2 class="section-h">Minhas viagens</h2>
        <div class="trip-grid">
          ${trips.map((t) => {
            const s = tripSummary(t);
            const past = t.endDate && t.endDate < today;
            return `
            <a class="ticket ${past ? 'past' : ''}" href="#/t/${t.id}/roteiro">
              <div class="ticket-main">
                <b>${h(t.name || t.destination || 'Viagem')}</b>
                <span>${h(t.destination)}</span>
                <span class="muted small">${dateRange(t)}</span>
              </div>
              <div class="ticket-stub">
                <span class="small">${past ? 'Gasto' : 'Previsto'}</span>
                <b>${money(past ? s.spent : s.planned, t.currency)}</b>
                <span class="small">${h(countdown(t))}</span>
              </div>
            </a>`;
          }).join('')}
        </div>
      </section>` : ''}

      <section class="card">
        <h2>Nova viagem</h2>
        <form data-form="new-trip" class="form-grid">
          <label>Nome<input name="name" placeholder="Férias em Maragogi" required></label>
          <label>Destino<input name="destination" placeholder="Maragogi, Brasil" required></label>
          <label>Início<input name="startDate" type="date" required></label>
          <label>Fim<input name="endDate" type="date" required></label>
          <label>Pessoas<input name="travelers" type="number" min="1" value="1"></label>
          <label>Moeda<select name="currency">${CURRENCIES.map((c) => `<option>${c}</option>`).join('')}</select></label>
          <button class="btn primary span2" type="submit">Criar viagem</button>
        </form>
      </section>

      <section class="card">
        <h2>Configuração</h2>
        <div class="chips">
          <span class="chip ${f.routes ? 'on' : 'off'}">${f.routes ? '✓' : '○'} Rotas reais${f.routes ? '' : ' (usando estimativa)'}</span>
          <span class="chip ${f.cloud ? 'on' : 'off'}">${f.cloud ? '✓' : '○'} Sincronização na nuvem</span>
        </div>
        <p class="muted small">${f.cloud
          ? 'Seus dados ficam salvos na nuvem e aparecem em todos os seus aparelhos.'
          : 'Sem Supabase configurado, os dados ficam só neste navegador. Faça backups ou configure a nuvem (veja o README).'}</p>
        <div class="row wrap">
          <button class="btn" data-action="export">Exportar backup</button>
          <label class="btn">Importar backup<input type="file" accept="application/json" data-action="import" hidden></label>
          <button class="btn ghost" data-action="logout">Sair</button>
        </div>
      </section>
    </main>`;
  renderSync();
}

function renderSync() {
  const el = document.getElementById('sync');
  if (!el) return;
  if (store.mode === 'offline') el.innerHTML = '<span title="Será sincronizado quando voltar a internet">📴 Offline</span>';
  else if (store.mode !== 'cloud') el.innerHTML = '<span title="Dados salvos só neste navegador">📱 Neste aparelho</span>';
  else if (store.sync === 'saving') el.innerHTML = '<span>Salvando…</span>';
  else if (store.sync === 'error') el.innerHTML = `<span class="sync-error" title="${h(store.syncError)}">⚠️ Erro ao salvar</span>`;
  else el.innerHTML = '<span title="Sincronizado">☁️ Salvo</span>';
}

// ---------------------------------------------------------------- tela da viagem
function renderTrip() {
  const t = trip();
  if (app.dataset.view !== `trip:${t.id}`) {
    app.dataset.view = `trip:${t.id}`;
    app.innerHTML = `
      <header class="topbar">
        <a class="back" href="#/" aria-label="Voltar para minhas viagens">←</a>
        <div class="title" id="trip-title"></div>
        <span id="countdown" class="countdown"></span>
        <span id="sync" class="sync"></span>
      </header>
      <nav class="tabs" id="tabs" aria-label="Seções da viagem"></nav>
      <main class="trip-layout" id="layout">
        <section class="panel" id="panel"></section>
        <div class="mapwrap">
          <div id="map"></div>
          <div class="map-layers" id="map-layers" role="group" aria-label="Rotas visíveis no mapa"></div>
          <div class="map-status" id="map-status" role="status" hidden></div>
        </div>
      </main>`;
    mountMap(document.getElementById('map'));
    ui.fitKey = '';
  }
  renderHeader();
  document.getElementById('tabs').innerHTML = TABS.map(([id, icon, label]) =>
    `<a href="#/t/${t.id}/${id}" class="${ui.tab === id ? 'active' : ''}" ${ui.tab === id ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon}</span>${label}</a>`).join('');
  renderPanel();
  renderSync();
}

function renderHeader() {
  const t = trip();
  const el = document.getElementById('trip-title');
  if (!el || !t) return;
  el.innerHTML = `<b>${h(t.destination.split(',')[0] || t.name || 'Viagem')}</b><small>${h(t.name)}${t.name ? ' — ' : ''}${dateRange(t)}</small>`;
  document.getElementById('countdown').textContent = countdown(t);
}

function renderPanel() {
  const panel = document.getElementById('panel');
  const t = trip();
  if (!panel || !t) return;
  const layout = document.getElementById('layout');
  const cls = `trip-layout tab-${ui.tab}${ui.pick ? ' picking' : ''}`;
  if (layout.className !== cls) {
    layout.className = cls;
    refreshSize();
  }
  const activeBind = document.activeElement?.dataset?.bind;
  const html = { roteiro: panelRoteiro, gastos: panelGastos, reservas: panelReservas, resumo: panelResumo }[ui.tab](t);
  panel.innerHTML = (ui.pick ? pickBanner() : '') + html;
  if (activeBind) panel.querySelector(`[data-bind="${CSS.escape(activeBind)}"]`)?.focus();
  updateMap();
  // calcula (com cache) as rotas que estão faltando para o que está na tela
  if (ui.tab === 'roteiro' && ui.day !== 'all') ensureRoute(t, ui.day);
  else if (ui.tab !== 'gastos') tripDays(t).forEach((_, i) => ensureRoute(t, i));
}

// ---------------------------------------------------------------- posições (endereços e "marcar no mapa")
// kind: stay | place | flight | car | new ; prefix: '' (lat/lng) ou from/to/pickup/return
const coordKeys = (prefix) => (prefix ? [`${prefix}Lat`, `${prefix}Lng`] : ['lat', 'lng']);
const posOf = (obj, prefix) => {
  const [a, b] = coordKeys(prefix);
  return obj && Number.isFinite(obj[a]) && Number.isFinite(obj[b]) ? { lat: obj[a], lng: obj[b] } : null;
};
function objOf(t, kind, id) {
  if (kind === 'new') return ui.np;
  return ({ stay: t.stays, place: t.places, flight: t.flights, car: t.cars }[kind] || []).find((x) => x.id === id);
}
function setPos(obj, prefix, pos) {
  const [a, b] = coordKeys(prefix);
  obj[a] = pos ? pos.lat : null;
  obj[b] = pos ? pos.lng : null;
}

function pickBanner() {
  return `<div class="pick-banner" role="status">📍 Toque no mapa para marcar <b>${h(ui.pick.label)}</b>
    <button class="btn small" data-action="pick-cancel">Cancelar</button></div>`;
}

function startPick(kind, id, prefix, label) {
  const t = trip();
  ui.pick = { kind, id, prefix, label };
  setPicking((pos) => {
    const obj = objOf(t, kind, id);
    if (obj) {
      setPos(obj, prefix, pos);
      if (kind === 'new') obj.address = '';
      else save();
    }
    cancelPick();
    toast('Posição marcada.', 'ok');
    renderPanel();
  });
  renderPanel();
  if (window.innerWidth < 900) window.scrollTo(0, 0);
}

// Texto usado para buscar a posição de um endereço.
function locateQuery(t, kind, obj, prefix) {
  if (kind === 'stay') return obj.address || obj.name;
  if (kind === 'flight') return obj[`${prefix}Address`] || (obj[prefix] ? `Aeroporto ${obj[prefix]}` : '');
  if (kind === 'car') return obj[`${prefix}Address`] || '';
  return '';
}

async function locate(t, kind, id, prefix) {
  const obj = objOf(t, kind, id);
  const q = locateQuery(t, kind, obj, prefix);
  if (!q) throw new Error('Preencha o endereço primeiro.');
  let r = await geocode(q, t.center);
  if (!r.results.length && kind === 'stay' && obj.name && obj.address) r = await geocode(`${obj.name}, ${obj.address}`, t.center);
  const p = r.results[0];
  if (!p) throw new Error('Endereço não encontrado. Use "Marcar no mapa".');
  setPos(obj, prefix, p);
  save();
  return p;
}

// Campo de endereço com botões "buscar" e "marcar no mapa".
function addressField(t, kind, obj, prefix, label, placeholder = '') {
  const field = prefix ? `${prefix}Address` : 'address';
  const busyKey = `loc-${kind}-${obj.id}-${prefix}`;
  const located = posOf(obj, prefix);
  return `
    <label class="span2">${label}
      <span class="input-with-btn">
        <input data-bind="${kind}:${obj.id}.${field}" data-coords="${prefix}" value="${h(obj[field] || '')}" placeholder="${h(placeholder)}">
        <button class="icon" data-action="locate" data-kind="${kind}" data-id="${obj.id}" data-prefix="${prefix}" title="Buscar endereço no mapa" aria-label="Buscar endereço no mapa" ${ui.busy[busyKey] ? 'disabled aria-busy="true"' : ''}>${ui.busy[busyKey] ? '<span class="spin-sm"></span>' : '🔎'}</button>
        <button class="icon" data-action="pick" data-kind="${kind}" data-id="${obj.id}" data-prefix="${prefix}" data-label="${h(label.toLowerCase())}" title="Marcar no mapa" aria-label="Marcar no mapa">📍</button>
      </span>
      <span class="loc-status ${located ? 'ok' : 'muted'}">${ui.busy[busyKey] ? 'Procurando…' : located ? '✓ No mapa' : 'Ainda não está no mapa'}</span>
    </label>`;
}

// ---------------------------------------------------------------- aba Roteiro
function placeMeta(p) {
  const t = trip();
  return [
    `${catIcon(p.category)} ${h((CATEGORIES[p.category] || CATEGORIES.outro).split(' ')[1])}`,
    p.category !== 'comida' && num(p.duration) ? `⏱️ ${fmtDuration(p.duration)}` : '',
    t && placeCost(t, p) ? money(placeCost(t, p), cur()) : '',
    hasPos(p) ? '' : '<span class="warn">sem posição no mapa</span>',
  ].filter(Boolean).join(' · ');
}

function daySelect(t, value, attrs) {
  const days = tripDays(t);
  return `<select ${attrs} aria-label="Dia">
    <option value="">Sem dia</option>
    ${days.map((d, i) => `<option value="${i}" ${value === i ? 'selected' : ''}>Dia ${i + 1} · ${fmtDate(d)}</option>`).join('')}
  </select>`;
}

function routeFor(t, i) {
  const plan = dayPlan(t, i);
  const key = JSON.stringify([plan.points, plan.legs.map((l) => l.cat)]);
  return { ...plan, key, route: ui.routes.get(key) };
}

// trecho que chega ao ponto deste dono (só para o primeiro dono de pontos repetidos)
function legInto(rf, owner) {
  if (!rf.route) return null;
  const k = rf.owners.findIndex((o) => o[0] === owner);
  return k > 0 ? rf.route.legs[k - 1] : null;
}
const legRow = (rf, owner) => {
  const leg = legInto(rf, owner);
  if (!leg) return '';
  const c = LEG_CATS[leg.cat] || LEG_CATS.foot;
  if (ui.kmMode) {
    return `<li class="leg leg-${c.group} leg-km" title="${h(c.label)}"><span class="km-pill">${km(leg.distance)}</span> ${c.icon} ${h(c.label)} · ${dur(leg.duration)}</li>`;
  }
  return `<li class="leg leg-${c.group}" title="${h(c.label)}">${c.icon} ${dur(leg.duration)} · ${km(leg.distance)}${leg.cat === 'transfer' ? ' <span class="muted">táxi/traslado</span>' : ''}</li>`;
};
// odômetro: km acumulados do dia até o ponto deste dono
function odometer(rf, owner) {
  if (!ui.kmMode || !rf.route) return '';
  const k = rf.owners.findIndex((o) => o.includes(owner));
  if (k < 0) return '';
  const total = rf.route.legs.slice(0, k).reduce((s, l) => s + (l?.distance || 0), 0);
  return `<span class="odo" title="Distância acumulada no dia">km ${(total / 1000).toFixed(1).replace('.', ',')}</span>`;
}
const anchorRow = (a, extra = '', odo = '') => (a ? `<li class="anchor"><span class="anchor-icon" aria-hidden="true">${a.icon}</span><span class="grow"><b>${h(a.name)}</b>${extra}</span>${odo}</li>` : '');
const kmFmt = (k) => `${Math.round(k).toLocaleString('pt-BR')} km`;

// voos do dia, com a distância de avião
// modo km na visão geral: "Pousada · 12 km · Galés · 12 km · Pousada"
function kmStages(t, i) {
  const rf = routeFor(t, i);
  if (rf.points.length < 2) return '<span class="muted small">Dia livre</span>';
  const names = rf.owners.map((o) => {
    const it = rf.items.find((x) => x.owner === o[0]);
    return it ? (it.kind === 'place' ? it.name : it.name.replace('Retirada do carro', 'Retirada').replace('Devolução do carro', 'Devolução')) : '';
  });
  const parts = [`<span>${h(names[0])}</span>`];
  for (let k = 1; k < names.length; k++) {
    const leg = rf.route?.legs[k - 1];
    parts.push(`<span class="km-pill">${leg ? km(leg.distance) : '…'}</span>`, `<span>${h(names[k])}</span>`);
  }
  return `<span class="small stages">${parts.join('')}</span>`;
}

function flightRow(t, f, which) {
  const k = flightKm(f);
  return `<li class="anchor anchor-air"><span class="anchor-icon" aria-hidden="true">✈️</span>
    <span><b>Voo ${h(f.from || '?')} → ${h(f.to || '?')}</b> <span class="muted">${which === 'arrive' ? `chega ${fmtTime(f.arrive)}` : `sai ${fmtTime(f.depart)}`}${f.number ? ` · ${h(f.number)}` : ''}${k ? ` · ${kmFmt(k)} de avião` : ''}</span></span></li>`;
}

const opts = (map, value, empty) => `${empty != null ? `<option value="">${empty}</option>` : ''}${Object.entries(map).map(([k, v]) => `<option value="${k}" ${value === k ? 'selected' : ''}>${v}</option>`).join('')}`;
const durationSelect = (attrs, value) => `<select ${attrs}><option value="">—</option>${DURATIONS.map(([m, l]) => `<option value="${m}" ${num(value) === m ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
const MEAL_LABELS = Object.fromEntries(Object.entries(MEALS).map(([k, m]) => [k, `${m.icon} ${m.label}`]));
// flags do restaurante: faixa de preço e estilo
function foodTags(p) {
  return [p.price ? `<span class="flag flag-${p.price}">${PRICE_TAGS[p.price]}</span>` : '', p.style ? `<span class="flag">${FOOD_STYLES[p.style]}</span>` : '']
    .filter(Boolean).join('');
}

function newPlaceForm(t) {
  const np = ui.np;
  const isFood = np.category === 'comida';
  const title = isFood && np.meal ? `Opção de ${MEALS[np.meal].label.toLowerCase()}${np.day != null ? ` · dia ${np.day + 1}` : ''}` : 'Novo lugar';
  return `
    <div class="card add-place">
      <div class="section-head"><h2>${title}</h2><button class="icon" data-action="np-cancel" aria-label="Fechar">✕</button></div>
      <form class="search" data-form="geo">
        <input name="q" data-np="query" value="${h(np.query)}" placeholder="${isFood ? 'Buscar restaurante por nome ou endereço' : 'Buscar por nome ou endereço'}" autocomplete="off">
        <button class="btn" type="submit" ${np.searching ? 'disabled' : ''}>${np.searching ? '<span class="spin-sm"></span> Buscando' : 'Buscar'}</button>
      </form>
      ${np.error ? `<p class="error small">${h(np.error)}</p>` : ''}
      ${np.results.length ? `<div class="geo-results">${np.results.map((r, k) => `
        <button class="geo-result" data-action="np-use" data-k="${k}">
          <span class="num result-num">${k + 1}</span>
          <span class="grow"><b>${h(r.name)}</b><span class="muted small ellipsis">${h(r.address)}</span></span>
        </button>`).join('')}</div>` : ''}
      <div class="row wrap">
        <button class="btn small" data-action="pick" data-kind="new" data-prefix="" data-label="o novo lugar">📍 Marcar no mapa</button>
        <span class="small ${hasPos(np) ? 'ok' : 'muted'}">${hasPos(np) ? `✓ Posição definida${np.address ? ` · ${h(np.address)}` : ''}` : 'Sem posição ainda (opcional)'}</span>
      </div>
      <div class="form-grid">
        <label class="span2">Nome<input data-np="name" value="${h(np.name)}" placeholder="${isFood ? 'Ex.: Restaurante Frutos do Mar' : 'Ex.: Galés de Maragogi'}"></label>
        <label>Tipo<select data-np="category">${opts(CATEGORIES, np.category)}</select></label>
        <label>Dia${daySelect(t, np.day, 'data-np="day"')}</label>
        ${isFood ? `
          <label>Refeição<select data-np="meal">${opts(MEAL_LABELS, np.meal, 'Outra (lanche, café…)')}</select></label>
          <label>Custo por pessoa (${h(t.currency)})<input inputmode="decimal" data-np="costPP" value="${h(np.costPP)}" placeholder="0"></label>
          <label>Faixa de preço<select data-np="price">${opts(PRICE_TAGS, np.price, '—')}</select></label>
          <label>Estilo<select data-np="style">${opts(FOOD_STYLES, np.style, '—')}</select></label>
          ${np.meal ? '' : `<label>Horário<input type="time" data-np="time" value="${h(np.time)}"></label>`}`
        : `
          <label>Horário<input type="time" data-np="time" value="${h(np.time)}"></label>
          <label>Duração esperada${durationSelect('data-np="duration"', np.duration)}</label>
          <label>Custo previsto (${h(t.currency)})<input inputmode="decimal" data-np="cost" value="${h(np.cost)}" placeholder="0"></label>`}
      </div>
      ${isFood && np.meal ? '<p class="muted small">Fica como opção do dia. Escolha qual vai ser no bloco "Refeições"; só a escolhida entra no roteiro e na rota.</p>' : ''}
      <button class="btn primary" data-action="np-save">${isFood && np.meal ? 'Salvar opção' : 'Salvar lugar'}</button>
    </div>`;
}

// Bloco "Refeições" do dia: café no hotel, opções de almoço e jantar.
function mealsBlock(t, i, rf) {
  const date = tripDays(t)[i];
  const hotel = rf.start?.icon === '🏨' ? rf.start : null;
  const n = Math.max(1, num(t.travelers));
  return `
    <section class="meals">
      <h3 class="section-h">Refeições</h3>
      <div class="meal meal-cafe"><span class="meal-icon" aria-hidden="true">☕</span><div class="grow"><b>Café da manhã</b><div class="muted small">${hotel ? `No hotel · ${h(hotel.name)}` : 'No hotel'}</div></div></div>
      ${Object.entries(MEALS).map(([m, info]) => {
        const plan = mealPlan(t, i, m);
        return `
        <div class="meal">
          <div class="meal-head">
            <span class="meal-icon" aria-hidden="true">${info.icon}</span>
            <div class="grow"><b>${info.label}</b>
              <div class="muted small">${plan.chosen ? `Escolhido: ${h(plan.chosen.name)}` : plan.opts.length ? `${plan.opts.length} opç${plan.opts.length === 1 ? 'ão' : 'ões'} · escolha uma` : 'Nenhuma opção ainda'}${plan.value ? ` · ${money(plan.value, t.currency)}${plan.basis === 'escolhido' ? '' : ` <span class="muted">(${plan.basis})</span>`}` : ''}</div>
            </div>
            <button class="btn small" data-action="meal-add" data-day="${i}" data-meal="${m}">＋ Opção</button>
          </div>
          ${plan.opts.length ? `<ul class="meal-opts">${plan.opts.map((p) => `
            <li class="meal-opt ${p.chosen ? 'chosen' : ''}">
              <button class="choose" data-action="meal-choose" data-id="${p.id}" role="radio" aria-checked="${!!p.chosen}" title="${p.chosen ? 'Desmarcar' : 'Escolher este'}" aria-label="${p.chosen ? 'Desmarcar' : 'Escolher'} ${h(p.name)}"></button>
              <div class="grow">
                <b>${h(p.name)}</b>
                <div class="flags">${foodTags(p)}${num(p.costPP) ? `<span class="muted small">${money(p.costPP, t.currency)}/pessoa${n > 1 ? ` · ${money(placeCost(t, p), t.currency)}` : ''}</span>` : ''}${hasPos(p) ? '' : '<span class="warn small">sem posição</span>'}</div>
              </div>
              <button class="icon small-icon" data-action="opt-edit" data-id="${p.id}" aria-label="Editar ${h(p.name)}" title="Editar">✎</button>
              <button class="icon small-icon danger" data-action="remove-place" data-id="${p.id}" aria-label="Remover ${h(p.name)}" title="Remover">✕</button>
            </li>
            ${ui.editOpt === p.id ? `<li class="opt-edit">${foodFields(t, p)}</li>` : ''}`).join('')}</ul>` : ''}
        </div>`;
      }).join('')}
      <p class="muted small">Sem restaurante escolhido, o previsto usa a média das opções ou o orçamento por pessoa (Reservas → Orçamento diário).</p>
    </section>`;
}

// campos de um restaurante (no cartão do roteiro e na edição da opção)
function foodFields(t, p) {
  return `
    <div class="stop-fields">
      <label>Refeição<select data-bind="place:${p.id}.meal" data-rerender>${opts(MEAL_LABELS, p.meal || '', 'Outra')}</select></label>
      <label>Por pessoa (${h(t.currency)})<input inputmode="decimal" data-bind="place:${p.id}.costPP" data-type="number" data-rerender value="${dec(p.costPP)}" placeholder="0"></label>
      <label>Preço<select data-bind="place:${p.id}.price" data-rerender>${opts(PRICE_TAGS, p.price || '', '—')}</select></label>
      <label>Estilo<select data-bind="place:${p.id}.style" data-rerender>${opts(FOOD_STYLES, p.style || '', '—')}</select></label>
    </div>`;
}

function panelRoteiro(t) {
  const days = tripDays(t);
  if (!days.length) {
    return `<div class="empty card">Defina as datas da viagem na aba <a href="#/t/${t.id}/reservas">Reservas</a> para montar o roteiro.</div>`;
  }
  if (ui.day !== 'all' && ui.day >= days.length) ui.day = 'all';
  const unplanned = t.places.filter((p) => p.day == null || p.day >= days.length);
  const hasCar = t.cars.length > 0;

  const dayChips = `
    <div class="day-chips" role="tablist" aria-label="Dias">
      <button class="chip-btn ${ui.day === 'all' ? 'active' : ''}" data-action="day" data-day="all" role="tab" aria-selected="${ui.day === 'all'}">Todos os dias</button>
      ${days.map((d, i) => `<button class="chip-btn ${ui.day === i ? 'active' : ''}" style="--c:${dayColor(i)}" data-action="day" data-day="${i}" role="tab" aria-selected="${ui.day === i}">
        <span class="dot"></span>Dia ${i + 1}<small>${fmtDate(d)}${carOn(t, d) ? ' 🚗' : ''}</small></button>`).join('')}
    </div>`;

  const toolbar = `
    <div class="toolbar">
      <button class="btn primary" data-action="np-open">＋ Lugar</button>
      <label class="inline-label">${hasCar ? 'Dias sem carro' : 'Deslocamento'}
        <select data-bind="trip.mode" data-rerender>
          ${Object.entries(MODES).map(([k, v]) => `<option value="${k}" ${t.mode === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
      <button class="btn ${ui.kmMode ? 'toggle-on' : 'ghost'}" data-action="km-mode" aria-pressed="${ui.kmMode}" title="Mostrar a distância entre cada etapa do dia">📏 Modo km</button>
      <button class="btn ghost" data-action="calc-routes" ${ui.busy.routes ? 'disabled' : ''}>${ui.busy.routes ? 'Calculando…' : 'Recalcular rotas'}</button>
    </div>
    ${ui.np.open ? newPlaceForm(t) : ''}`;

  // km do dia por tipo de trecho, ex.: "🚗 104 km · 🚶 2,1 km"
  const dayKmText = (i) => Object.entries(dayKm(t.dayStats?.[i]))
    .filter(([, v]) => v > 0.05).map(([c, v]) => `${LEG_CATS[c]?.icon || ''} ${km(v * 1000)}`).join(' · ');

  let body;
  if (ui.day === 'all') {
    body = `<div class="day-list">${days.map((d, i) => {
      const ps = dayPlaces(t, i);
      const car = carOn(t, d);
      const kmText = dayKmText(i);
      const flights = flightsOn(t, d);
      return `
        <button class="day-card" style="--c:${dayColor(i)}" data-action="day" data-day="${i}">
          <span class="day-num"><b>${i + 1}</b><small>${fmtDate(d, false)}</small></span>
          <span class="day-body">
            <span class="day-card-head">
              <span>${WEEKDAYS[new Date(`${d}T12:00`).getDay()]}${car ? ' <span class="tag">🚗 com carro</span>' : ''}</span>
              <span class="muted small">${ps.length} parada${ps.length === 1 ? '' : 's'}</span>
            </span>
            ${flights.map((f) => `<span class="small">✈️ ${h(f.from)} → ${h(f.to)} ${f.depart?.startsWith(d) ? `sai ${fmtTime(f.depart)}` : `chega ${fmtTime(f.arrive)}`}${flightKm(f) ? ` <span class="muted">· ${kmFmt(flightKm(f))}</span>` : ''}</span>`).join('')}
            ${car?.pickupAt?.startsWith(d) ? `<span class="small">🔑 Retirada do carro ${fmtTime(car.pickupAt)}</span>` : ''}
            ${car?.returnAt?.startsWith(d) ? `<span class="small">🔑 Devolução do carro ${fmtTime(car.returnAt)}</span>` : ''}
            ${ui.kmMode ? kmStages(t, i) : `<span class="muted small ellipsis">${ps.map((p) => h(p.name)).join(' → ') || 'Dia livre'}</span>`}
            <span class="small meals-line">${Object.entries(MEALS).map(([m, info]) => {
              const plan = mealPlan(t, i, m);
              return `${info.icon} ${plan.chosen ? h(plan.chosen.name) : plan.opts.length ? `<span class="muted">${plan.opts.length} opç${plan.opts.length === 1 ? 'ão' : 'ões'}</span>` : '<span class="muted">—</span>'}`;
            }).join(' · ')}</span>
            ${kmText ? `<span class="small day-km">${kmText}</span>` : ''}
          </span>
        </button>`;
    }).join('')}</div>`;
  } else {
    const i = ui.day;
    const date = days[i];
    const ps = dayPlaces(t, i);
    const rf = routeFor(t, i);
    const car = rf.car;
    const pd = plannedDay(t, i);
    const breakdown = [
      pd.food ? `🍽️ ${money(pd.food, t.currency)}` : '',
      pd.tours ? `🎟️ ${money(pd.tours, t.currency)}` : '',
      pd.transport ? `🚇 ${money(pd.transport, t.currency)}` : '',
      pd.fuel ? `⛽ ${money(pd.fuel, t.currency)}` : '',
      pd.parking ? `🅿️ ${money(pd.parking, t.currency)}` : '',
    ].filter(Boolean).join(' + ');
    const unlocated = flightsOn(t, date).filter((f) => {
      const leg = flightLeg(t, f);
      return (leg !== 'volta' && f.arrive?.startsWith(date) && !posOf(f, 'to')) || (leg !== 'ida' && f.depart?.startsWith(date) && !posOf(f, 'from'));
    });
    const arrivals = t.flights.filter((f) => flightLeg(t, f) !== 'volta' && (f.arrive || '').startsWith(date));
    const departures = t.flights.filter((f) => flightLeg(t, f) !== 'ida' && (f.depart || '').startsWith(date));
    const kmText = dayKmText(i);
    const tourMin = ps.filter((p) => p.category !== 'comida').reduce((a, p) => a + num(p.duration), 0);
    const timeText = [tourMin ? `⏱️ ${fmtDuration(tourMin)} em passeios` : '', rf.route ? `${dur(rf.route.duration)} de deslocamento` : ''].filter(Boolean).join(' + ');
    let n = 0;
    const timeNote = (owner) => {
      if (owner === 'pickup' && car?.pickupAt) return ` <span class="muted">${fmtTime(car.pickupAt)}${rf.afterFlight ? ' · logo após o desembarque' : ''}</span>`;
      if (owner === 'return' && car?.returnAt) return ` <span class="muted">${fmtTime(car.returnAt)}${rf.beforeFlight ? ' · depois segue para o aeroporto' : ''}</span>`;
      return '';
    };
    const itemHtml = (it) => {
      if (it.kind === 'anchor') {
        // ponto repetido (ex.: retirada no próprio aeroporto): sem trecho antes dele
        const merged = rf.owners.find((o) => o.includes(it.owner) && o[0] !== it.owner);
        return legRow(rf, it.owner) + anchorRow(it, timeNote(it.owner) + (merged ? ' <span class="muted">· no mesmo local</span>' : ''), merged ? '' : odometer(rf, it.owner));
      }
      const p = t.places.find((x) => x.id === it.id);
      const k = n++;
      return `
          ${legRow(rf, p.id)}
          <li class="card stop">
            <div class="stop-head">
              <span class="num" style="--c:${dayColor(i)}">${k + 1}</span>
              <div class="grow">
                <b>${h(p.name)}</b>
                <div class="muted small">${placeMeta(p)}</div>
                ${p.category === 'comida' ? `<div class="flags">${p.meal ? `<span class="flag flag-meal">${MEAL_LABELS[p.meal]}</span>` : ''}${foodTags(p)}</div>` : ''}
              </div>
              ${odometer(rf, p.id)}
              <div class="stop-actions">
                <button class="icon" data-action="move" data-id="${p.id}" data-dir="-1" ${k === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
                <button class="icon" data-action="move" data-id="${p.id}" data-dir="1" ${k === ps.length - 1 ? 'disabled' : ''} aria-label="Descer">↓</button>
              </div>
            </div>
            <div class="stop-fields">
              <label>Horário<input type="time" data-bind="place:${p.id}.time" data-rerender value="${h(p.time)}"></label>
              ${p.category === 'comida' ? '' : `
              <label>Duração${durationSelect(`data-bind="place:${p.id}.duration" data-type="number" data-rerender`, p.duration)}</label>
              <label>Custo (${h(t.currency)})<input inputmode="decimal" data-bind="place:${p.id}.cost" data-type="number" data-rerender value="${dec(p.cost)}" placeholder="0"></label>`}
              <label>Tipo<select data-bind="place:${p.id}.category" data-rerender>${opts(CATEGORIES, p.category)}</select></label>
              ${p.category === 'comida' ? '' : `<label>Dia${daySelect(t, p.day, `data-bind="place:${p.id}.day" data-rerender`)}</label>`}
            </div>
            ${p.category === 'comida' ? foodFields(t, p) : ''}
            <input class="note" placeholder="Anotação" data-bind="place:${p.id}.note" value="${h(p.note)}">
            <div class="row wrap small">
              <button class="link" data-action="pick" data-kind="place" data-id="${p.id}" data-prefix="" data-label="${h(p.name)}">📍 ${hasPos(p) ? 'Ajustar no mapa' : 'Marcar no mapa'}</button>
              ${hasPos(p) ? `<a href="https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}" target="_blank" rel="noopener">Abrir no mapa</a>` : ''}
              <button class="link danger push-right" data-action="remove-place" data-id="${p.id}">Remover</button>
            </div>
          </li>`;
    };
    body = `
      <div class="day-head" style="--c:${dayColor(i)}">
        <div>
          <h2>Dia ${i + 1}</h2>
          <span class="muted">${fmtDate(date)}${car ? ` · 🚗 ${h(car.company || 'carro alugado')}` : ''}</span>
        </div>
        <div class="stats">
          ${rf.route ? `<b>${km(rf.route.distance)}</b> · ${dur(rf.route.duration)}${rf.route.source === 'estimate' ? ' <span class="muted" title="Estimativa em linha reta">(estimado)</span>' : ''}` : rf.points.length > 1 ? '<span class="muted"><span class="spin-sm"></span> calculando rota</span>' : ''}
          <div>Previsto <b>${money(pd.total, t.currency)}</b></div>
        </div>
      </div>
      ${kmText || breakdown || timeText ? `<p class="muted small breakdown">${[kmText, timeText, breakdown].filter(Boolean).join('<br>')}</p>` : ''}
      ${unlocated.map((f) => `<div class="hint">✈️ ${h(f.from)} → ${h(f.to)}: adicione o endereço do aeroporto em Reservas para ele entrar na rota.</div>`).join('')}
      <ol class="stops">
        ${arrivals.map((f) => flightRow(t, f, 'arrive')).join('')}
        ${rf.items.map(itemHtml).join('')}
        ${departures.map((f) => flightRow(t, f, 'depart')).join('')}
      </ol>
      ${!ps.length ? '<div class="empty">Nenhum lugar neste dia. Toque em "＋ Lugar" ou escolha um em "Para encaixar".</div>' : ''}
      ${ps.length > 1 ? '<button class="btn ghost small" data-action="sort-time">Ordenar por horário</button>' : ''}
      ${mealsBlock(t, i, rf)}`;
  }

  const unplannedHtml = unplanned.length ? `
    <h3 class="section-h">Para encaixar <span class="muted">${unplanned.length}</span></h3>
    <div class="list">
      ${unplanned.map((p) => `
        <div class="card mini">
          <div class="grow"><b>${h(p.name)}</b><div class="muted small">${placeMeta(p)}</div></div>
          ${daySelect(t, p.day, `data-bind="place:${p.id}.day" data-rerender`)}
          <button class="icon danger" data-action="remove-place" data-id="${p.id}" aria-label="Remover">✕</button>
        </div>`).join('')}
    </div>` : (t.places.length || ui.np.open ? '' : '<div class="empty card">Ainda não há lugares. Toque em "＋ Lugar" para adicionar praias, passeios e restaurantes.</div>');

  return dayChips + toolbar + body + unplannedHtml;
}

// Busca as rotas do dia (com cache): trechos seguidos do mesmo tipo viram uma consulta.
const pending = new Set();
async function ensureRoute(t, i) {
  const rf = routeFor(t, i);
  if (rf.points.length < 2) {
    if (t.dayStats?.[i]) { delete t.dayStats[i]; save(); }
    return;
  }
  if (rf.route || pending.has(rf.key)) return;
  pending.add(rf.key);
  try {
    const groups = [];
    rf.legs.forEach((l, k) => {
      const g = groups[groups.length - 1];
      if (g && g.cat === l.cat) g.end = k + 1;
      else groups.push({ cat: l.cat, start: k, end: k + 1 });
    });
    const result = await withMapBusy('Calculando rotas…', async () => {
      const out = { legs: [], lines: [], distance: 0, duration: 0, byCat: {}, source: 'ors', warning: '' };
      for (const g of groups) {
        const pts = rf.points.slice(g.start, g.end + 1);
        const r = await getRoute(pts, LEG_CATS[g.cat].profile);
        // proteção: sem a distância de cada trecho, reparte o total pela linha reta entre as paradas
        let legs = r.legs || [];
        if (legs.length !== pts.length - 1) {
          const straight = pts.slice(1).map((p, k) => haversineKm({ lat: pts[k][0], lng: pts[k][1] }, { lat: p[0], lng: p[1] }));
          const sum = straight.reduce((a, b) => a + b, 0) || 1;
          legs = straight.map((d) => ({ distance: (r.distance * d) / sum, duration: (r.duration * d) / sum }));
        }
        legs.forEach((leg) => out.legs.push({ ...leg, cat: g.cat }));
        out.lines.push({ points: r.line, cat: g.cat, estimate: r.source === 'estimate' });
        out.distance += r.distance;
        out.duration += r.duration;
        out.byCat[g.cat] = (out.byCat[g.cat] || 0) + r.distance;
        if (r.source === 'estimate') out.source = 'estimate';
        if (r.warning) out.warning = r.warning;
      }
      return out;
    });
    ui.routes.set(rf.key, result);
    if (result.warning) toast(result.warning, 'warn');
    const prev = t.dayStats[i];
    const stats = { v: 2, distance: result.distance, duration: result.duration, byCat: result.byCat, source: result.source };
    if (!prev || JSON.stringify(prev) !== JSON.stringify(stats)) {
      t.dayStats[i] = stats;
      save();
    }
    if (ui.tripId === t.id && ui.tab !== 'gastos') {
      // na aba Reservas só atualiza o mapa, para não atrapalhar quem está digitando
      if (ui.tab === 'reservas' || (ui.tab === 'roteiro' && ui.day !== 'all' && ui.day !== i)) updateMap();
      else renderPanel();
    }
  } catch (e) {
    if (e.status !== 0) toast(`Rota do dia ${i + 1}: ${e.message}`, 'error');
  } finally {
    pending.delete(rf.key);
  }
}

// ---------------------------------------------------------------- aba Gastos
function panelGastos(t) {
  const days = tripDays(t);
  if (!days.length) return `<div class="empty card">Defina as datas da viagem na aba <a href="#/t/${t.id}/reservas">Reservas</a>.</div>`;
  if (!days.includes(ui.expDay)) ui.expDay = days.includes(localToday()) ? localToday() : days[0];
  const i = days.indexOf(ui.expDay);
  const list = spentOn(t, ui.expDay).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const spent = sumAmount(list);
  const planned = plannedDay(t, i).total;
  const pct = planned > 0 ? Math.min(100, (spent / planned) * 100) : spent > 0 ? 100 : 0;
  const totalSpent = sumAmount(t.expenses);
  const byCat = Object.entries(EXP_CATS)
    .map(([k, [icon, label]]) => [icon, label, sumAmount(t.expenses.filter((e) => e.cat === k))])
    .filter((x) => x[2] > 0);

  return `
    <div class="day-chips" role="tablist" aria-label="Dias">
      ${days.map((d, k) => {
        const v = sumAmount(spentOn(t, d));
        return `<button class="chip-btn ${d === ui.expDay ? 'active' : ''}" style="--c:${dayColor(k)}" data-action="exp-day" data-date="${d}" role="tab" aria-selected="${d === ui.expDay}">
          ${d === localToday() ? 'Hoje' : `Dia ${k + 1}`}<small>${v ? money(v, t.currency) : fmtDate(d)}</small></button>`;
      }).join('')}
    </div>

    <section class="card exp-card">
      <div class="exp-head">
        <div><div class="muted small">Gasto em ${fmtDate(ui.expDay)}</div><div class="big">${money(spent, t.currency, true)}</div></div>
        <div class="right"><div class="muted small">Previsto</div><div class="mid">${money(planned, t.currency)}</div></div>
      </div>
      <div class="bar ${spent > planned && planned > 0 ? 'over' : ''}" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>

      <form class="exp-form" data-form="expense" autocomplete="off">
        <div class="amount-wrap">
          <span class="cur">${h(t.currency)}</span>
          <input name="amount" class="amount" inputmode="decimal" enterkeyhint="done" placeholder="0,00" aria-label="Valor do gasto">
        </div>
        <div class="cat-grid" role="radiogroup" aria-label="Categoria">
          ${Object.entries(EXP_CATS).map(([k, [icon, label]]) => `
            <button type="button" class="cat ${ui.expCat === k ? 'active' : ''}" data-action="exp-cat" data-cat="${k}" role="radio" aria-checked="${ui.expCat === k}">
              <span aria-hidden="true">${icon}</span>${label}</button>`).join('')}
        </div>
        <input name="desc" placeholder="Descrição (opcional)" enterkeyhint="done">
        <button class="btn primary" type="submit">Adicionar gasto</button>
      </form>
    </section>

    ${list.length ? `
    <section class="card">
      <h2>Lançamentos de ${fmtDate(ui.expDay)}</h2>
      <div class="exp-list">
        ${list.map((e) => {
          const [icon, label] = EXP_CATS[e.cat] || EXP_CATS.outros;
          return `
          <div class="exp-row">
            <span class="exp-icon" aria-hidden="true">${icon}</span>
            <div class="grow"><div>${h(e.desc || label)}</div><div class="muted small">${h(label)}${e.at ? ` · ${new Date(e.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</div></div>
            <b>${money(e.amount, t.currency, true)}</b>
            <button class="icon danger" data-action="exp-del" data-id="${e.id}" aria-label="Apagar gasto">✕</button>
          </div>`;
        }).join('')}
      </div>
    </section>` : '<p class="muted center small">Nenhum gasto lançado neste dia ainda.</p>'}

    <section class="card">
      <div class="section-head"><h2>Total na viagem</h2><b class="mid">${money(totalSpent, t.currency, true)}</b></div>
      ${byCat.length ? `<div class="chips">${byCat.map(([icon, label, v]) => `<span class="chip">${icon} ${h(label)} ${money(v, t.currency)}</span>`).join('')}</div>` : '<p class="muted small">Os gastos lançados aparecem aqui e no Resumo, comparados ao previsto. Voos, hospedagem e aluguel do carro já contam como pagos.</p>'}
    </section>`;
}

// ---------------------------------------------------------------- aba Reservas
const inp = (bind, label, value, type = 'text', extra = '') => {
  const isNum = type === 'number';
  return `<label>${label}<input type="${isNum ? 'text' : type}" ${isNum ? 'inputmode="decimal" data-type="number"' : ''} data-bind="${bind}" value="${h(isNum ? dec(value) : value ?? '')}" ${isNum ? 'placeholder="0"' : ''} ${extra}></label>`;
};

function editBlock(key, summaryText, inner, forceOpen) {
  const open = ui.open.has(key) || forceOpen;
  return `<details class="edit" data-open-key="${key}" ${open ? 'open' : ''}><summary>${summaryText}</summary><div class="edit-body">${inner}</div></details>`;
}

function flightCard(t, f) {
  const leg = flightLeg(t, f);
  const nights = '';
  const pass = passHtml({
    from: f.from, to: f.to,
    fromSub: f.depart ? `${fmtDate(f.depart)} ${fmtTime(f.depart)}` : '',
    toSub: f.arrive ? `${fmtDate(f.arrive)} ${fmtTime(f.arrive)}` : '',
    metaLeft: h([f.airline, f.number].filter(Boolean).join(' ') || 'Voo'),
    metaRight: { ida: 'Ida', volta: 'Volta', interno: 'Trecho interno' }[leg] + (flightKm(f) ? ` · ${kmFmt(flightKm(f))}` : ''),
    stubLabel: 'Localizador', stubValue: f.code || '—', stubSub: num(f.price) ? money(f.price, t.currency) : nights,
  });
  const fk = flightKm(f);
  const incomplete = !f.from || !f.to || !f.depart;
  return `
    <article class="res-item res-flight">
      ${pass}
      ${editBlock(`flight-${f.id}`, 'Editar voo', `
        <div class="form-grid">
          ${inp(`flight:${f.id}.airline`, 'Companhia', f.airline)}
          ${inp(`flight:${f.id}.number`, 'Número do voo', f.number)}
          ${inp(`flight:${f.id}.from`, 'Sigla de origem', f.from, 'text', 'placeholder="GRU" data-rerender maxlength="4"')}
          ${inp(`flight:${f.id}.to`, 'Sigla de destino', f.to, 'text', 'placeholder="MCZ" data-rerender maxlength="4"')}
          ${inp(`flight:${f.id}.depart`, 'Partida', f.depart, 'datetime-local', 'data-rerender')}
          ${inp(`flight:${f.id}.arrive`, 'Chegada', f.arrive, 'datetime-local', 'data-rerender')}
          <label>Trecho<select data-bind="flight:${f.id}.leg" data-rerender>${Object.entries(LEGS).map(([k, v]) => `<option value="${k}" ${f.leg === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          ${inp(`flight:${f.id}.price`, `Preço (${t.currency})`, f.price, 'number', 'data-rerender')}
          ${inp(`flight:${f.id}.code`, 'Localizador', f.code, 'text', 'data-rerender')}
          ${addressField(t, 'flight', f, 'from', 'Endereço do aeroporto de partida', 'Ex.: Aeroporto de Guarulhos')}
          ${addressField(t, 'flight', f, 'to', 'Endereço do aeroporto de chegada', 'Ex.: Aeroporto Zumbi dos Palmares, Maceió')}
        </div>
        <p class="muted small">${fk ? `Distância de avião: <b>${kmFmt(fk)}</b> (linha reta entre os aeroportos). ` : 'Com os dois aeroportos no mapa, o app calcula a distância de avião. '}No dia da chegada, a rota começa no aeroporto de chegada. No dia da volta, termina no aeroporto de partida. Os km de avião nunca entram no carro.</p>
        <button class="link danger" data-action="del-flight" data-id="${f.id}">Remover voo</button>`, incomplete)}
    </article>`;
}

function stayCard(t, s) {
  const nights = s.checkin && s.checkout ? Math.max(0, daysBetween(s.checkin, s.checkout)) : 0;
  return `
    <article class="res-item res-card">
      <div class="res-head">
        <span class="res-icon" aria-hidden="true">🏨</span>
        <div class="grow">
          <b>${h(s.name || 'Hospedagem sem nome')}</b>
          <div class="muted small">${s.checkin ? `${fmtDate(s.checkin)} → ${fmtDate(s.checkout)}` : 'sem datas'}${nights ? ` · ${nights} noite${nights > 1 ? 's' : ''}` : ''}${hasPos(s) ? '' : ' · <span class="warn">fora do mapa</span>'}</div>
        </div>
        <b>${num(s.price) ? money(s.price, t.currency) : ''}</b>
      </div>
      ${editBlock(`stay-${s.id}`, 'Editar hospedagem', `
        <div class="form-grid">
          ${inp(`stay:${s.id}.name`, 'Nome', s.name, 'text', 'data-rerender')}
          ${inp(`stay:${s.id}.code`, 'Nº da reserva', s.code)}
          ${inp(`stay:${s.id}.checkin`, 'Check-in', s.checkin, 'date', 'data-rerender')}
          ${inp(`stay:${s.id}.checkout`, 'Check-out', s.checkout, 'date', 'data-rerender')}
          ${inp(`stay:${s.id}.price`, `Preço total (${t.currency})`, s.price, 'number', 'data-rerender')}
          <span></span>
          ${addressField(t, 'stay', s, '', 'Endereço', 'Rua, número, cidade')}
        </div>
        <button class="link danger" data-action="del-stay" data-id="${s.id}">Remover hospedagem</button>`, !s.name || !hasPos(s))}
    </article>`;
}

function carCard(t, c) {
  const r = carRental(c);
  const k = carKm(t, c);
  const cc = t.currency;
  const m = (v) => money(v, cc, true);
  const voucherRows = [
    [`Diárias: ${r.days} × ${m(c.dailyRate)}`, r.daily],
    num(c.protectionPerDay) ? [`${h(c.protectionName || 'Proteção')}: ${r.days} × ${m(c.protectionPerDay)}`, r.protection] : null,
    ...(c.addons || []).map((a) => [`${h(a.name || 'Adicional')}${a.perDay ? `: ${r.days} × ${m(a.value)}` : ' (valor único)'}`, a.perDay ? num(a.value) * r.days : num(a.value)]),
    num(c.feePct) ? [`Taxa de aluguel: ${dec(c.feePct)}% do valor`, r.fee] : null,
  ].filter(Boolean);
  const incomplete = !c.pickupAt || !num(c.dailyRate);

  return `
    <article class="res-item voucher">
      <div class="res-head">
        <span class="res-icon" aria-hidden="true">🚗</span>
        <div class="grow">
          <b>${h(c.company || 'Carro alugado')}${c.model ? ` <span class="muted">${h(c.model)}</span>` : ''}</b>
          <div class="muted small">${c.pickupAt ? `${fmtDate(c.pickupAt)} ${fmtTime(c.pickupAt)} → ${fmtDate(c.returnAt)} ${fmtTime(c.returnAt)}` : 'sem datas'}</div>
        </div>
      </div>
      <table class="voucher-table">
        <tbody>
          ${voucherRows.map(([label, v]) => `<tr><td>${label}</td><td>${m(v)}</td></tr>`).join('')}
          <tr class="voucher-total"><td>Total do aluguel</td><td>${m(r.total)}</td></tr>
        </tbody>
      </table>
      <div class="car-sum small">
        <div>📏 <b>${Math.round(k.total)} km</b> com o carro = ${Math.round(k.routes)} km nas rotas (só trechos com o carro em mãos) + ${Math.round(k.extra)} km fora do roteiro${r.kmAllowance ? ` · franquia ${r.kmAllowance} km${k.excessKm ? ` <span class="error">(${Math.round(k.excessKm)} km acima)</span>` : ''}` : ' · km livre'}</div>
        ${k.liters ? `<div>⛽ ${Math.round(k.liters)} L ≈ <b>${money(k.fuel, cc)}</b> de combustível</div>` : '<div class="muted">Preencha consumo e preço do litro para estimar o combustível.</div>'}
      </div>
      ${editBlock(`car-${c.id}`, 'Editar aluguel', `
        <h3 class="sub-h">Retirada e devolução</h3>
        <div class="form-grid">
          ${inp(`car:${c.id}.company`, 'Locadora', c.company, 'text', 'data-rerender')}
          ${inp(`car:${c.id}.model`, 'Modelo / grupo', c.model, 'text', 'data-rerender')}
          ${inp(`car:${c.id}.pickupAt`, 'Retirada', c.pickupAt, 'datetime-local', 'data-rerender')}
          ${inp(`car:${c.id}.returnAt`, 'Devolução', c.returnAt, 'datetime-local', 'data-rerender')}
          ${addressField(t, 'car', c, 'pickup', 'Endereço de retirada', 'Ex.: Aeroporto de Maceió')}
          ${addressField(t, 'car', c, 'return', 'Endereço de devolução')}
        </div>
        ${c.pickupAddress && !c.returnAddress ? `<button class="btn small" data-action="same-return" data-id="${c.id}">Devolver no mesmo local da retirada</button>` : ''}
        <div class="checks">
          <label class="check">
            <input type="checkbox" data-bind="car:${c.id}.pickupAfterFlight" data-type="check" data-rerender ${pickupAfterFlight(t, c) ? 'checked' : ''}>
            <span><b>Retiro o carro logo após desembarcar</b><small>A rota do dia da chegada vai do aeroporto até a locadora (táxi/traslado) e de lá segue de carro. Sem endereço de retirada, considera a locadora no próprio aeroporto.</small></span>
          </label>
          <label class="check">
            <input type="checkbox" data-bind="car:${c.id}.returnBeforeFlight" data-type="check" data-rerender ${returnBeforeFlight(t, c) ? 'checked' : ''}>
            <span><b>Devolvo o carro e sigo direto para o aeroporto</b><small>No dia da volta, a devolução é a última parada antes do embarque, e a rota locadora → aeroporto é de táxi/traslado. Desmarcado, a devolução acontece no horário informado e o resto do dia é sem carro.</small></span>
          </label>
        </div>

        <h3 class="sub-h">Valores da reserva</h3>
        <div class="form-grid">
          ${inp(`car:${c.id}.dailies`, `Nº de diárias${computedDailies(c) ? ` (pelas datas: ${computedDailies(c)})` : ''}`, c.dailies, 'number', `data-rerender placeholder="${computedDailies(c) || 0}"`)}
          ${inp(`car:${c.id}.dailyRate`, `Valor da diária (${cc})`, c.dailyRate, 'number', 'data-rerender')}
          ${inp(`car:${c.id}.protectionName`, 'Pacote de proteção', c.protectionName, 'text', 'data-rerender placeholder="Ex.: Pacote Completo"')}
          ${inp(`car:${c.id}.protectionPerDay`, `Proteção por dia (${cc})`, c.protectionPerDay, 'number', 'data-rerender')}
          ${inp(`car:${c.id}.feePct`, 'Taxa de aluguel (%)', c.feePct, 'number', 'data-rerender placeholder="Ex.: 15"')}
          ${inp(`car:${c.id}.kmPerDay`, 'Franquia de km por dia (0 = livre)', c.kmPerDay, 'number', 'data-rerender')}
          ${inp(`car:${c.id}.excessKmPrice`, `Valor do km excedente (${cc})`, c.excessKmPrice, 'number', 'data-rerender')}
          ${inp(`car:${c.id}.code`, 'Nº da reserva', c.code)}
        </div>
        <div class="addons">
          <div class="section-head"><span class="sub-h">Adicionais e taxas</span><button class="btn small" data-action="add-addon" data-id="${c.id}">＋ Adicional</button></div>
          ${(c.addons || []).length ? '' : '<p class="muted small">Ex.: limpeza, cadeirinha, condutor adicional.</p>'}
          ${(c.addons || []).map((a) => `
            <div class="addon-row">
              <input data-bind="addon:${c.id}-${a.id}.name" value="${h(a.name)}" placeholder="Ex.: Limpeza garantida" aria-label="Nome do adicional" data-rerender>
              <input inputmode="decimal" data-type="number" data-bind="addon:${c.id}-${a.id}.value" value="${dec(a.value)}" placeholder="0" aria-label="Valor" data-rerender>
              <select data-bind="addon:${c.id}-${a.id}.perDay" data-type="bool" data-rerender aria-label="Cobrança">
                <option value="" ${a.perDay ? '' : 'selected'}>valor único</option>
                <option value="1" ${a.perDay ? 'selected' : ''}>por diária</option>
              </select>
              <button class="icon danger" data-action="del-addon" data-id="${c.id}" data-addon="${a.id}" aria-label="Remover adicional">✕</button>
            </div>`).join('')}
        </div>

        <h3 class="sub-h">Gastos com o carro durante a viagem</h3>
        <div class="form-grid">
          ${inp(`car:${c.id}.kml`, 'Consumo (km por litro)', c.kml, 'number', 'data-rerender')}
          ${inp(`car:${c.id}.fuelPrice`, `Combustível (${cc} por litro)`, c.fuelPrice, 'number', 'data-rerender')}
          ${inp(`car:${c.id}.parkingPerDay`, `Estacionamento por dia (${cc})`, c.parkingPerDay, 'number', 'data-rerender')}
          ${inp(`car:${c.id}.tolls`, `Pedágios no total (${cc})`, c.tolls, 'number', 'data-rerender')}
          ${inp(`car:${c.id}.extraKm`, 'Km fora do roteiro', c.extraKm, 'number', 'data-rerender')}
        </div>
        <p class="muted small">"Km fora do roteiro" é só o que não aparece nas rotas dos dias (ex.: uma ida à praia que você não cadastrou como lugar). Trajetos para lugares do roteiro e para aeroporto/locadora já são calculados automaticamente. Não repita esses km aqui.</p>
        <button class="link danger" data-action="del-car" data-id="${c.id}">Remover carro</button>`, incomplete)}
    </article>`;
}

function panelReservas(t) {
  return `
    <section class="card">
      <h2>Viagem</h2>
      <div class="form-grid">
        ${inp('trip.name', 'Nome', t.name, 'text', 'data-header')}
        <label>Destino
          <span class="input-with-btn">
            <input data-bind="trip.destination" data-header data-rerender value="${h(t.destination)}">
            <button class="icon" data-action="locate-dest" title="Localizar no mapa" aria-label="Localizar destino no mapa" ${ui.busy.dest ? 'disabled' : ''}>${ui.busy.dest ? '<span class="spin-sm"></span>' : hasPos(t.center) ? '✅' : '📍'}</button>
          </span>
        </label>
        ${inp('trip.startDate', 'Início', t.startDate, 'date', 'data-header data-rerender')}
        ${inp('trip.endDate', 'Fim', t.endDate, 'date', 'data-header data-rerender')}
        ${inp('trip.travelers', 'Pessoas', t.travelers, 'number')}
        <label>Moeda<select data-bind="trip.currency" data-rerender>${CURRENCIES.map((c) => `<option ${t.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      </div>
      <h3 class="sub-h">Orçamento diário previsto</h3>
      <p class="muted small">Almoço e jantar valem quando o dia ainda não tem restaurante escolhido (o café é no hotel). "Lanches e extras" é somado todo dia.</p>
      <div class="form-grid">
        ${inp('trip.almocoBudget', 'Almoço por pessoa', t.almocoBudget, 'number')}
        ${inp('trip.jantarBudget', 'Jantar por pessoa', t.jantarBudget, 'number')}
        ${inp('trip.dailyFood', 'Lanches e extras por dia', t.dailyFood, 'number')}
        ${inp('trip.dailyTransport', t.cars.length ? 'Transporte local (dias sem carro)' : 'Transporte local por dia', t.dailyTransport, 'number')}
        ${inp('trip.shoppingBudget', 'Compras (total da viagem)', t.shoppingBudget, 'number')}
      </div>
    </section>

    <section>
      <div class="section-head"><h2 class="section-h">Voos</h2><button class="btn small" data-action="add-flight">＋ Voo</button></div>
      ${t.flights.length ? '' : '<p class="muted small">Nenhum voo cadastrado.</p>'}
      ${[...t.flights].sort((a, b) => (a.depart || '9').localeCompare(b.depart || '9')).map((f) => flightCard(t, f)).join('')}
    </section>

    <section>
      <div class="section-head"><h2 class="section-h">Hospedagens</h2><button class="btn small" data-action="add-stay">＋ Hospedagem</button></div>
      ${t.stays.length ? '' : '<p class="muted small">Nenhuma hospedagem cadastrada.</p>'}
      ${t.stays.map((s) => stayCard(t, s)).join('')}
    </section>

    <section>
      <div class="section-head"><h2 class="section-h">Aluguel de carro</h2><button class="btn small" data-action="add-car">＋ Carro</button></div>
      ${t.cars.length ? '' : '<p class="muted small">Nenhum carro cadastrado. Nos dias com carro, as rotas são calculadas de carro e o combustível é estimado pela distância.</p>'}
      ${t.cars.map((c) => carCard(t, c)).join('')}
    </section>`;
}

async function locateDest(t) {
  if (!t.destination) return;
  const r = await geocode(t.destination);
  const p = r.results[0];
  if (p) {
    t.center = { lat: p.lat, lng: p.lng };
    save();
  }
}

// ---------------------------------------------------------------- aba Resumo
function panelResumo(t) {
  const s = tripSummary(t);
  const n = Math.max(1, num(t.travelers));
  const c = t.currency;
  const remaining = s.planned - s.spent;
  const pct = s.planned > 0 ? Math.min(100, (s.spent / s.planned) * 100) : 0;
  const today = localToday();
  const groups = [
    ['reservas', 'Reservas', 'Valores das reservas, considerados já pagos.'],
    ['carro', 'Carro durante a viagem', t.cars.length ? `Combustível pelos km previstos: ${Math.round(s.kmCar)} km (rotas dos dias com carro + km fora do roteiro). Cada km entra uma vez só.` : ''],
    ['dia', 'Dia a dia', 'Previsto pelo orçamento diário e pelos custos dos lugares do roteiro.'],
  ];
  const rowHtml = ([, label, p, g, group]) => {
    const prepaid = group === 'reservas';
    return `
      <tr>
        <td>${label}${!prepaid && p > 0 ? `<div class="bar thin ${g > p ? 'over' : ''}"><div style="width:${Math.min(100, (g / p) * 100)}%"></div></div>` : ''}</td>
        <td>${money(p, c)}</td>
        <td class="${!prepaid && g > p ? 'error' : ''}">${prepaid ? '<span class="muted small">pago</span>' : money(g, c)}</td>
      </tr>`;
  };
  return `
    <section class="card total">
      <div class="totals">
        <div><div class="muted small">Previsto</div><div class="big">${money(s.planned, c)}</div>${n > 1 ? `<div class="muted small">${money(s.planned / n, c)} por pessoa</div>` : ''}</div>
        <div><div class="muted small">Gasto até agora</div><div class="big">${money(s.spent, c)}</div><div class="muted small">${remaining >= 0 ? `faltam ${money(remaining, c)}` : `<span class="error">${money(-remaining, c)} acima</span>`}</div></div>
      </div>
      <div class="bar ${remaining < 0 ? 'over' : ''}"><div style="width:${pct}%"></div></div>
      <div class="muted small">${tripDays(t).length} dias de viagem</div>
    </section>

    <section class="card">
      <div class="section-head"><h2>Quilometragem</h2><b class="mid">${kmFmt(s.km.total)}</b></div>
      <div class="km-grid">
        <div class="km-box"><span class="km-icon" aria-hidden="true">✈️</span><b>${kmFmt(s.km.air)}</b><span class="muted small">de avião</span></div>
        <div class="km-box"><span class="km-icon" aria-hidden="true">🛣️</span><b>${kmFmt(s.km.ground)}</b><span class="muted small">por terra</span></div>
      </div>
      <div class="chips">
        ${['rental', 'transfer', 'drive', 'foot', 'bike'].filter((c) => s.km.byCat[c] > 0.05).map((c) => `<span class="chip">${LEG_CATS[c].icon} ${LEG_CATS[c].label} ${km(s.km.byCat[c] * 1000)}</span>`).join('')}
        ${t.cars.reduce((a, c) => a + num(c.extraKm), 0) ? `<span class="chip">🚗 Fora do roteiro ${kmFmt(t.cars.reduce((a, c) => a + num(c.extraKm), 0))}</span>` : ''}
      </div>
      ${s.km.flightsMissing ? `<p class="muted small">${s.km.flightsMissing} voo(s) sem os dois aeroportos no mapa ficaram fora da conta de avião. Complete em Reservas.</p>` : ''}
      <p class="muted small">Só os km do carro alugado (trechos depois da retirada e antes da devolução, mais os km fora do roteiro) entram no combustível.</p>
    </section>

    <section class="card">
      <h2>Por categoria</h2>
      <table class="cmp-table">
        <thead><tr><th></th><th>Previsto</th><th>Gasto</th></tr></thead>
        ${groups.map(([g, title, note]) => {
          const rows = s.rows.filter((r) => r[4] === g);
          if (!rows.length) return '';
          const tp = rows.reduce((a, r) => a + r[2], 0);
          return `
          <tbody>
            <tr class="group-row"><th>${title}</th><th>${money(tp, c)}</th><th></th></tr>
            ${rows.map(rowHtml).join('')}
            ${note ? `<tr class="note-row"><td colspan="3">${note}</td></tr>` : ''}
          </tbody>`;
        }).join('')}
      </table>
    </section>

    <section class="card">
      <h2>Por dia</h2>
      <div class="table-wrap">
        <table class="days-table">
          <thead><tr><th>Dia</th><th>Previsto</th><th>Gasto</th><th>Diferença</th><th>Km por terra</th></tr></thead>
          <tbody>
            ${s.days.map((d, i) => {
              const g = sumAmount(spentOn(t, d.date));
              const diff = d.total - g;
              const started = d.date <= today || g > 0;
              const st = t.dayStats?.[i];
              const parts = [
                d.food ? `🍽️ ${money(d.food, c)}` : '', d.tours ? `🎟️ ${money(d.tours, c)}` : '',
                d.transport ? `🚇 ${money(d.transport, c)}` : '', d.fuel ? `⛽ ${money(d.fuel, c)}` : '', d.parking ? `🅿️ ${money(d.parking, c)}` : '',
              ].filter(Boolean).join(' ');
              return `
              <tr>
                <td><span class="dot" style="--c:${dayColor(i)}"></span>${i + 1} · ${fmtDate(d.date)}${d.car ? ' 🚗' : ''}${parts ? `<div class="muted tiny">${parts}</div>` : ''}</td>
                <td>${money(d.total, c)}</td>
                <td>${g ? money(g, c) : '—'}</td>
                <td class="${started && diff < 0 ? 'error' : started && g ? 'ok' : 'muted'}">${started && g ? `${diff < 0 ? '−' : '+'}${money(Math.abs(diff), c)}` : '—'}</td>
                <td>${st ? `${km(st.distance)}${st.source === 'estimate' ? '*' : ''}${Object.entries(dayKm(st)).filter(([, v]) => v > 0.05).length > 1 ? `<div class="muted tiny">${Object.entries(dayKm(st)).filter(([, v]) => v > 0.05).map(([c, v]) => `${LEG_CATS[c]?.icon} ${km(v * 1000)}`).join(' ')}</div>` : ''}` : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <p class="muted small">O previsto do dia soma alimentação, passeios e transporte (ou combustível e estacionamento nos dias com carro). Os km fora do roteiro e os pedágios entram só no total do carro, acima.${ui.features.routes ? '' : ' * = distância estimada em linha reta.'}</p>
    </section>`;
}

// ---------------------------------------------------------------- mapa
// Estilo de cada tipo de trecho: avião tracejado escuro, carro contínuo, traslado tracejado, a pé pontilhado.
function lineStyle(cat, color, estimate) {
  const base = { color, opacity: estimate ? 0.55 : 0.9 };
  switch (cat) {
    case 'air': return { ...base, color: '#0d3b4f', weight: 2.5, dash: '2 9', opacity: 0.9 };
    case 'rental': case 'drive': return { ...base, weight: 5, dash: estimate ? '10 8' : null };
    case 'transfer': return { ...base, weight: 4, dash: '10 8' };
    case 'bike': return { ...base, weight: 4, dash: '6 7' };
    default: return { ...base, weight: 4, dash: '1 8' };
  }
}
const LAYERS = [
  ['air', '✈️', 'Avião'],
  ['car', '🚗', 'Carro'],
  ['foot', '🚶', 'A pé/bike'],
];
function renderLayerToggles() {
  const el = document.getElementById('map-layers');
  if (!el) return;
  el.innerHTML = LAYERS.map(([k, icon, label]) => `
    <button class="layer ${ui.layers[k] ? 'on' : ''}" data-action="layer" data-layer="${k}" aria-pressed="${!!ui.layers[k]}" title="${ui.layers[k] ? 'Ocultar' : 'Mostrar'} rotas: ${label}">
      <span aria-hidden="true">${icon}</span>${label}</button>`).join('');
}

function updateMap() {
  const t = trip();
  if (!t) return;
  renderLayerToggles();
  const markers = [];
  const lines = [];
  const days = tripDays(t);
  let fitKey = `${t.id}|${ui.tab}|${ui.day}`;
  const show = (cat) => ui.layers[(LEG_CATS[cat] || LEG_CATS.foot).group] !== false;

  const placePopup = (p, extra = '') => `<b>${h(p.name)}</b><br><span class="muted">${placeMeta(p)}</span>${extra}`;
  const addAnchor = (a, popup, nofit = false) => {
    if (a && hasPos(a) && !markers.some((m) => Math.abs(m.lat - a.lat) < 1e-5 && Math.abs(m.lng - a.lng) < 1e-5)) {
      markers.push({ lat: a.lat, lng: a.lng, label: a.icon || '🏨', color: '#0d3b4f', cls: 'stay', z: 500, nofit, popup: popup || `<b>${h(a.name)}</b>` });
    }
  };
  // linhas de um dia: rota calculada por trecho, ou linha reta enquanto calcula
  const kmLabels = (rf) => {
    // só na visão de um dia: na visão geral os rótulos se amontoam
    if (!ui.kmMode || !rf.route || ui.day === 'all' || ui.tab !== 'roteiro') return;
    rf.route.legs.forEach((leg, k) => {
      if (!leg || leg.distance < 50 || !show(leg.cat)) return;
      const [a, b] = [rf.points[k], rf.points[k + 1]];
      markers.push({ lat: (a[0] + b[0]) / 2, lng: (a[1] + b[1]) / 2, label: km(leg.distance), cls: 'km-label', color: '#0d3b4f', nofit: true, z: 1200, size: [72, 24] });
    });
  };
  const dayLines = (i) => {
    const rf = routeFor(t, i);
    kmLabels(rf);
    if (rf.route) {
      for (const l of rf.route.lines) if (show(l.cat)) lines.push({ points: l.points, ...lineStyle(l.cat, dayColor(i), l.estimate) });
    } else {
      rf.legs.forEach((l, k) => show(l.cat) && lines.push({ points: [rf.points[k], rf.points[k + 1]], ...lineStyle(l.cat, dayColor(i), true) }));
    }
    return rf;
  };
  // voos: arco entre os aeroportos (os aeroportos distantes não entram no enquadramento)
  const flightLines = (list) => {
    if (!ui.layers.air) return;
    for (const f of list) {
      const { from, to } = flightEnds(f);
      if (!from || !to) continue;
      lines.push({ points: greatCircle(from, to), ...lineStyle('air') });
      addAnchor({ ...from, icon: '✈️', name: `Aeroporto ${f.from}` }, `<b>Aeroporto ${h(f.from)}</b><br>Voo para ${h(f.to)} · ${kmFmt(flightKm(f))}`, true);
      addAnchor({ ...to, icon: '✈️', name: `Aeroporto ${f.to}` }, `<b>Aeroporto ${h(f.to)}</b><br>Voo de ${h(f.from)} · ${kmFmt(flightKm(f))}`, true);
    }
  };

  if (ui.tab === 'roteiro' && ui.day !== 'all') {
    const i = ui.day;
    const date = days[i];
    let n = 0;
    const rf = dayLines(i);
    rf.items.forEach((it) => {
      if (it.kind === 'place') {
        const k = n++;
        if (hasPos(it)) markers.push({ lat: it.lat, lng: it.lng, label: k + 1, color: dayColor(i), z: 1000, popup: placePopup(it, it.time ? `<br>🕒 ${h(it.time)}` : '') });
      } else addAnchor(it);
    });
    flightLines(flightsOn(t, date));
  } else {
    days.forEach((_, i) => {
      dayPlaces(t, i).forEach((p, k) => hasPos(p) && markers.push({ lat: p.lat, lng: p.lng, label: k + 1, color: dayColor(i), popup: placePopup(p, `<br>Dia ${i + 1}${p.time ? ` · ${h(p.time)}` : ''}`) }));
      const rf = dayLines(i);
      [rf.start, rf.pickup, rf.ret, rf.end].forEach((a) => addAnchor(a));
    });
    t.places.filter((p) => p.day == null || p.day >= days.length).forEach((p) => hasPos(p) && markers.push({ lat: p.lat, lng: p.lng, label: '•', color: dayColor(null), cls: 'small', popup: placePopup(p, '<br>Ainda sem dia') }));
    for (const s of t.stays) addAnchor({ ...s, icon: '🏨' }, `<b>${h(s.name)}</b>${s.checkin ? `<br>${fmtDate(s.checkin)} → ${fmtDate(s.checkout)}` : ''}`);
    flightLines(t.flights);
  }

  // formulário de novo lugar: resultados da busca e posição escolhida
  if (ui.tab === 'roteiro' && ui.np.open) {
    ui.np.results.forEach((r, k) => markers.push({
      lat: r.lat, lng: r.lng, label: k + 1, color: '#128C8C', cls: 'result', z: 1500,
      popup: `<b>${h(r.name)}</b><br><span class="muted">${h(r.address)}</span><br><button class="btn small" data-action="np-use" data-k="${k}">Usar este</button>`,
    }));
    if (hasPos(ui.np)) markers.push({ lat: ui.np.lat, lng: ui.np.lng, label: '＋', color: '#F2B33D', z: 2000, popup: 'Novo lugar' });
    fitKey += `|np${ui.np.results.length}|${ui.np.lat}`;
  } else {
    fitKey += `|${markers.filter((m) => !m.nofit).length}`; // reenquadra quando um ponto novo aparece
  }
  const fit = fitKey !== ui.fitKey && !ui.pick;
  ui.fitKey = fitKey;
  drawMap({ markers, lines, center: t.center, fit });
}

// Encaixa um lugar no dia pela hora: antes do primeiro lugar com horário maior.
function placeByTime(t, p) {
  const list = dayPlaces(t, p.day).filter((x) => x !== p);
  let k = list.findIndex((x) => x.time && p.time && x.time > p.time);
  if (k < 0) k = list.length;
  list.splice(k, 0, p);
  list.forEach((x, n) => (x.order = n));
}

// ---------------------------------------------------------------- binding de campos
function setBound(t, path, el) {
  const type = el.dataset.type;
  const raw = el.value;
  const value = type === 'number' ? num(raw) : type === 'bool' ? !!raw : type === 'check' ? el.checked : raw;
  const [target, field] = path.split('.');
  const [kind, id] = target.split(':');
  if (kind === 'trip') {
    t[field] = value;
    if (field === 'destination') t.center = null;
    return;
  }
  if (kind === 'addon') {
    const [carId, addonId] = id.split('-');
    const a = t.cars.find((c) => c.id === carId)?.addons.find((x) => x.id === addonId);
    if (a) a[field] = value;
    return;
  }
  const obj = objOf(t, kind, id);
  if (!obj) return;
  if (kind === 'place' && field === 'day') {
    const d = raw === '' ? null : Number(raw);
    obj.day = d;
    obj.order = d == null ? 0 : Math.max(-1, ...dayPlaces(t, d).filter((p) => p.id !== obj.id).map((p) => p.order)) + 1;
    return;
  }
  obj[field] = typeof value === 'string' && (field === 'from' || field === 'to') ? value.toUpperCase() : value;
  if (kind === 'place' && field === 'meal') obj.chosen = false;
  if (kind === 'place' && field === 'category' && value === 'comida' && obj.costPP == null) obj.costPP = 0;
  // endereço alterado: a posição antiga deixa de valer
  if (el.dataset.coords != null) setPos(obj, el.dataset.coords, null);
}

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset?.np && el.tagName !== 'SELECT') ui.np[el.dataset.np] = el.value;
});

document.addEventListener('toggle', (e) => {
  const key = e.target.dataset?.openKey;
  if (key) e.target.open ? ui.open.add(key) : ui.open.delete(key);
}, true);

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches('[data-action="import"]')) return importBackup(el);
  if (el.dataset?.np) {
    ui.np[el.dataset.np] = el.dataset.np === 'day' ? (el.value === '' ? null : Number(el.value)) : el.value;
    if (['category', 'meal', 'day'].includes(el.dataset.np)) renderPanel();
    return;
  }
  const bind = el.dataset?.bind;
  const t = trip();
  if (!bind || !t) return;
  setBound(t, bind, el);
  save();
  if (el.hasAttribute('data-header')) renderHeader();
  if (el.hasAttribute('data-rerender') || el.dataset.coords != null) setTimeout(renderPanel, 0);
  else updateMap();
});

// ---------------------------------------------------------------- formulários
document.addEventListener('submit', async (e) => {
  const form = e.target;
  const kind = form.dataset.form;
  if (!kind) return;
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(form));
  const t = trip();

  if (kind === 'login') {
    setPassword(fd.pw);
    app.dataset.view = '';
    return boot();
  }
  if (kind === 'new-trip') {
    if (fd.endDate < fd.startDate) return toast('A data final é anterior à inicial.', 'error');
    const nt = newTrip({ ...fd, travelers: Math.max(1, num(fd.travelers)) });
    store.data.trips.push(nt);
    save();
    location.hash = `#/t/${nt.id}/reservas`;
    locateDest(nt).then(() => ui.tripId === nt.id && updateMap()).catch(() => {});
    return;
  }
  if (kind === 'expense') {
    const amount = num(fd.amount);
    if (amount <= 0) {
      toast('Digite o valor do gasto.', 'warn');
      form.amount.focus();
      return;
    }
    t.expenses.push({ id: uid(), date: ui.expDay, amount: Math.round(amount * 100) / 100, cat: ui.expCat, desc: (fd.desc || '').trim(), at: new Date().toISOString() });
    save();
    renderPanel();
    toast(`${EXP_CATS[ui.expCat][0]} ${money(amount, t.currency, true)} lançado.`, 'ok');
    document.querySelector('.exp-form .amount')?.focus();
    return;
  }
  if (kind === 'geo') {
    const q = (fd.q || '').trim();
    if (!q) return;
    ui.np.query = q;
    ui.np.searching = true;
    ui.np.error = '';
    renderPanel();
    try {
      const r = await withMapBusy('Procurando no mapa…', () => geocode(q, t.center));
      ui.np.results = r.results;
      if (!r.results.length) ui.np.error = 'Nada encontrado. Tente outro nome ou marque no mapa.';
    } catch (err) {
      ui.np.results = [];
      ui.np.error = err.message;
    }
    ui.np.searching = false;
    renderPanel();
  }
});

// ---------------------------------------------------------------- cliques
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'INPUT') return;
  const action = el.dataset.action;
  const t = trip();

  switch (action) {
    case 'logout':
      if (!await confirmDialog({ title: 'Sair do app?', message: 'Você vai precisar da senha para entrar de novo neste aparelho.', confirmLabel: 'Sair' })) return;
      setPassword('');
      return renderLogin();
    case 'layer':
      ui.layers[el.dataset.layer] = !ui.layers[el.dataset.layer];
      saveLayers();
      return updateMap();
    case 'export':
      return exportBackup();
    case 'day':
      ui.day = el.dataset.day === 'all' ? 'all' : Number(el.dataset.day);
      if (ui.np.open && ui.np.day == null && ui.day !== 'all') ui.np.day = ui.day;
      renderPanel();
      document.getElementById('panel')?.scrollTo?.({ top: 0 });
      return;
    case 'move': {
      const ps = dayPlaces(t, ui.day);
      const k = ps.findIndex((p) => p.id === el.dataset.id);
      const j = k + Number(el.dataset.dir);
      if (k < 0 || j < 0 || j >= ps.length) return;
      [ps[k], ps[j]] = [ps[j], ps[k]];
      ps.forEach((p, n) => (p.order = n));
      save();
      return renderPanel();
    }
    case 'sort-time': {
      const ps = dayPlaces(t, ui.day);
      ps.sort((a, b) => (a.time || '99').localeCompare(b.time || '99')).forEach((p, n) => (p.order = n));
      save();
      return renderPanel();
    }
    case 'remove-place': {
      const p = t.places.find((x) => x.id === el.dataset.id);
      if (p && await confirmDialog({ title: `Remover "${p.name}"?`, message: 'O lugar sai do roteiro e do mapa.', confirmLabel: 'Remover', danger: true })) {
        t.places = t.places.filter((x) => x !== p);
        save();
        renderPanel();
      }
      return;
    }
    case 'calc-routes':
      return withBusy('routes', async () => {
        ui.routes.clear();
        for (let i = 0; i < tripDays(t).length; i++) await ensureRoute(t, i);
      });

    case 'km-mode':
      ui.kmMode = !ui.kmMode;
      savePref('roteiro:kmMode', ui.kmMode ? '1' : '0');
      return renderPanel();
    case 'meal-add': {
      ui.np = { ...freshNewPlace(Number(el.dataset.day)), open: true, category: 'comida', meal: el.dataset.meal };
      renderPanel();
      document.getElementById('panel')?.scrollTo?.({ top: 0, behavior: 'smooth' });
      if (window.innerWidth < 900) document.querySelector('.add-place')?.scrollIntoView({ block: 'start' });
      document.querySelector('[data-np="query"]')?.focus({ preventScroll: true });
      return;
    }
    case 'meal-choose': {
      const p = t.places.find((x) => x.id === el.dataset.id);
      if (!p) return;
      if (p.chosen) p.chosen = false;
      else {
        t.places.forEach((x) => { if (x.day === p.day && x.category === 'comida' && x.meal === p.meal) x.chosen = false; });
        p.chosen = true;
        p.time ||= MEALS[p.meal]?.time || '';
        placeByTime(t, p);
        if (!hasPos(p)) toast(`"${p.name}" está sem posição no mapa e não entra na rota. Use "Marcar no mapa".`, 'warn');
      }
      save();
      return renderPanel();
    }
    case 'opt-edit':
      ui.editOpt = ui.editOpt === el.dataset.id ? null : el.dataset.id;
      return renderPanel();

    // novo lugar
    case 'np-open':
      ui.np = { ...freshNewPlace(ui.day === 'all' ? null : ui.day), open: true };
      renderPanel();
      document.querySelector('[data-np="query"]')?.focus();
      return;
    case 'np-cancel':
      ui.np = freshNewPlace();
      if (ui.pick?.kind === 'new') cancelPick();
      return renderPanel();
    case 'np-use': {
      const r = ui.np.results[Number(el.dataset.k)];
      if (!r) return;
      Object.assign(ui.np, { lat: r.lat, lng: r.lng, address: r.address });
      if (!ui.np.name.trim()) ui.np.name = r.name;
      return renderPanel();
    }
    case 'np-save': {
      const np = ui.np;
      if (!np.name.trim()) return toast('Dê um nome ao lugar.', 'warn');
      const isFood = np.category === 'comida';
      const isOpt = isFood && !!np.meal;
      const order = np.day == null || isOpt ? 0 : Math.max(-1, ...dayPlaces(t, np.day).map((p) => p.order)) + 1;
      const place = {
        id: uid(), name: np.name.trim(), address: np.address, lat: hasPos(np) ? np.lat : null, lng: hasPos(np) ? np.lng : null,
        category: np.category, day: np.day, order, time: isOpt ? '' : np.time, note: '',
        ...(isFood
          ? { meal: np.meal || '', price: np.price, style: np.style, costPP: num(np.costPP), chosen: false, cost: 0 }
          : { duration: num(np.duration), cost: num(np.cost) }),
      };
      t.places.push(place);
      save();
      toast(isOpt
        ? `"${place.name}" adicionado como opção de ${MEALS[np.meal].label.toLowerCase()}${np.day == null ? '' : ` do dia ${np.day + 1}`}.`
        : `"${place.name}" adicionado${np.day == null ? ' em "Para encaixar"' : ` ao dia ${np.day + 1}`}.`, 'ok');
      if (ui.pick?.kind === 'new') cancelPick();
      ui.np = freshNewPlace();
      return renderPanel();
    }

    // posições
    case 'pick':
      return startPick(el.dataset.kind, el.dataset.id, el.dataset.prefix || '', el.dataset.label || 'o local');
    case 'pick-cancel':
      cancelPick();
      return renderPanel();
    case 'locate': {
      const { kind, id, prefix = '' } = el.dataset;
      return withBusy(`loc-${kind}-${id}-${prefix}`, async () => {
        const p = await withMapBusy('Procurando endereço…', () => locate(t, kind, id, prefix));
        toast(`Encontrado: ${p.name}${p.address ? ` — ${p.address}` : ''}. Se não for o lugar certo, use 📍 para marcar no mapa.`, 'ok');
      });
    }
    case 'locate-dest':
      return withBusy('dest', async () => {
        await withMapBusy('Procurando destino…', () => locateDest(t));
        toast(hasPos(t.center) ? 'Destino localizado no mapa.' : 'Destino não encontrado.', hasPos(t.center) ? 'ok' : 'warn');
      });

    // gastos
    case 'exp-day':
      ui.expDay = el.dataset.date;
      return renderPanel();
    case 'exp-cat':
      // troca a categoria sem redesenhar, para não perder o valor digitado
      ui.expCat = el.dataset.cat;
      document.querySelectorAll('.cat-grid .cat').forEach((b) => {
        const on = b.dataset.cat === ui.expCat;
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', on);
      });
      return;
    case 'exp-del': {
      const ex = t.expenses.find((x) => x.id === el.dataset.id);
      if (ex && await confirmDialog({ title: `Apagar gasto de ${money(ex.amount, t.currency, true)}?`, message: ex.desc || EXP_CATS[ex.cat]?.[1] || '', confirmLabel: 'Apagar', danger: true })) {
        t.expenses = t.expenses.filter((x) => x !== ex);
        save();
        renderPanel();
      }
      return;
    }

    // reservas
    case 'add-flight': {
      const f = { id: uid(), airline: '', number: '', from: '', to: '', depart: '', arrive: '', price: 0, code: '', leg: '', fromAddress: '', toAddress: '' };
      t.flights.push(f);
      ui.open.add(`flight-${f.id}`);
      save();
      return renderPanel();
    }
    case 'del-flight':
      if (!await confirmDialog({ title: 'Remover este voo?', confirmLabel: 'Remover', danger: true })) return;
      t.flights = t.flights.filter((f) => f.id !== el.dataset.id);
      save();
      return renderPanel();
    case 'add-stay': {
      const s = { id: uid(), name: '', address: '', checkin: t.startDate || '', checkout: t.endDate || '', price: 0, code: '', lat: null, lng: null };
      t.stays.push(s);
      ui.open.add(`stay-${s.id}`);
      save();
      return renderPanel();
    }
    case 'del-stay':
      if (!await confirmDialog({ title: 'Remover esta hospedagem?', confirmLabel: 'Remover', danger: true })) return;
      t.stays = t.stays.filter((s) => s.id !== el.dataset.id);
      save();
      return renderPanel();
    case 'add-car': {
      const c = {
        id: uid(), company: '', model: '', pickupAt: t.startDate ? `${t.startDate}T12:00` : '', returnAt: t.endDate ? `${t.endDate}T12:00` : '',
        pickupAddress: '', returnAddress: '', dailies: 0, dailyRate: 0, protectionName: '', protectionPerDay: 0, addons: [], feePct: 0,
        kmPerDay: 0, excessKmPrice: 0, kml: 10, fuelPrice: 0, parkingPerDay: 0, tolls: 0, extraKm: 0, code: '',
      };
      t.cars.push(c);
      ui.open.add(`car-${c.id}`);
      save();
      return renderPanel();
    }
    case 'del-car':
      if (!await confirmDialog({ title: 'Remover este carro?', message: 'Os valores do aluguel e os km do carro saem do previsto.', confirmLabel: 'Remover', danger: true })) return;
      t.cars = t.cars.filter((c) => c.id !== el.dataset.id);
      save();
      return renderPanel();
    case 'same-return': {
      const c = t.cars.find((x) => x.id === el.dataset.id);
      if (!c) return;
      c.returnAddress = c.pickupAddress;
      setPos(c, 'return', posOf(c, 'pickup'));
      save();
      return renderPanel();
    }
    case 'add-addon': {
      const c = t.cars.find((x) => x.id === el.dataset.id);
      c?.addons.push({ id: uid(), name: '', value: 0, perDay: false });
      save();
      return renderPanel();
    }
    case 'del-addon': {
      const c = t.cars.find((x) => x.id === el.dataset.id);
      if (!await confirmDialog({ title: 'Remover este adicional?', confirmLabel: 'Remover', danger: true })) return;
      if (c) c.addons = c.addons.filter((a) => a.id !== el.dataset.addon);
      save();
      return renderPanel();
    }
  }
});

// ---------------------------------------------------------------- backup
function exportBackup() {
  const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `meu-roteiro-backup-${localToday()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importBackup(input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.trips)) throw new Error('Arquivo não é um backup do Meu Roteiro.');
    if (!await confirmDialog({ title: 'Importar backup?', message: `Os dados atuais serão substituídos por ${data.trips.length} viagem(ns) do arquivo.`, confirmLabel: 'Substituir dados', danger: true })) return;
    replaceAll(data);
    renderHome();
    toast('Backup importado.', 'ok');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    input.value = '';
  }
}

// ---------------------------------------------------------------- PWA
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

boot();
