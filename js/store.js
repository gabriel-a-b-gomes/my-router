// Estado do app: carrega/salva na nuvem (Supabase, via /api/data) quando
// configurado, e sempre mantém uma cópia no navegador.

import { api } from './api.js';
import { normalizeTrip } from './util.js';

const normalize = (d) => { d.trips = (d.trips || []).map(normalizeTrip); return d; };

const LOCAL_KEY = 'roteiro:data';
const listeners = new Set();

export const store = {
  data: { version: 1, trips: [] },
  mode: 'local', // 'cloud' | 'local'
  sync: 'ok', // 'ok' | 'saving' | 'error'
  syncError: '',
};

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch { return null; }
}
function writeLocal() {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(store.data)); } catch {}
}

export const onSync = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());

const DIRTY_KEY = 'roteiro:dirty';
const isDirty = () => { try { return localStorage.getItem(DIRTY_KEY) === '1'; } catch { return false; } };
const setDirty = (v) => { try { v ? localStorage.setItem(DIRTY_KEY, '1') : localStorage.removeItem(DIRTY_KEY); } catch {} };

export async function loadData() {
  const local = readLocal();
  const res = await api('data');
  store.mode = res.mode;
  if (res.mode === 'cloud' && res.data && !(isDirty() && local)) {
    store.data = normalize(res.data);
    writeLocal();
  } else {
    store.data = normalize(local || { version: 1, trips: [] });
    // primeira vez na nuvem, ou alterações feitas offline: envia o que está neste aparelho
    if (res.mode === 'cloud' && store.data.trips.length) await pushNow();
  }
}

// Sem internet: abre a última cópia salva neste aparelho. As alterações
// ficam marcadas e são enviadas para a nuvem na próxima vez que o app abrir online.
export function loadOffline() {
  const local = readLocal();
  if (!local) return false;
  store.data = normalize(local);
  store.mode = 'offline';
  return true;
}

let timer = null;
export function save() {
  writeLocal();
  if (store.mode === 'offline') { setDirty(true); emit(); return; }
  if (store.mode !== 'cloud') return;
  store.sync = 'saving';
  emit();
  clearTimeout(timer);
  timer = setTimeout(pushNow, 800);
}

async function pushNow() {
  try {
    await api('data', { method: 'PUT', body: { data: store.data } });
    setDirty(false);
    store.sync = 'ok';
    store.syncError = '';
  } catch (e) {
    store.sync = 'error';
    store.syncError = e.message;
  }
  emit();
}

export const getTrip = (id) => store.data.trips.find((t) => t.id === id);

export function replaceAll(data) {
  store.data = normalize(data);
  save();
}
