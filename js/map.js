// Mapa com Leaflet (arquivos em /vendor) e mapa-base gratuito do OpenStreetMap.
/* global L */

let map = null;
let group = null;        // linhas
let markerGroup = null;  // pinos (redesenhados a cada zoom)

// Mapa-base do OpenStreetMap: gratuito e sem chave (exige só a atribuição).
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function mountMap(el) {
  if (!window.L) return null;
  if (map && map.getContainer() === el) return map;
  if (map) map.remove();
  map = L.map(el, { zoomControl: true, attributionControl: true }).setView([-14, -50], 3);
  L.tileLayer(TILE_URL, { attribution: ATTR, maxZoom: 19 }).addTo(map);
  group = L.layerGroup().addTo(map);
  markerGroup = L.layerGroup().addTo(map);
  map.on('zoomend', renderMarkers);
  map.on('click', (e) => clickHandler?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
  return map;
}

// Modo "marcar no mapa": o próximo toque no mapa chama fn({lat, lng}).
let clickHandler = null;
export function setPicking(fn) {
  clickHandler = fn;
  map?.getContainer().classList.toggle('picking', !!fn);
}

export function refreshSize() {
  if (!map) return;
  map.invalidateSize();
  setTimeout(() => map.invalidateSize(), 60);
}

function pin(label, color, extraClass = '', size = [30, 30]) {
  return L.divIcon({
    className: '',
    html: `<div class="pin ${extraClass}" style="--c:${color}">${label}</div>`,
    iconSize: size,
    iconAnchor: [size[0] / 2, size[1] / 2],
    popupAnchor: [0, -14],
  });
}

// ---------- menos poluição com o zoom afastado ----------
// Pinos que se sobrepõem na tela viram um grupo com a contagem (tocar aproxima).
// Rótulos de km somem e as linhas afinam quando o mapa está longe.
const CLUSTER_PX = 30;      // distância (px) para juntar pinos
const CLUSTER_UNTIL = 17;   // a partir deste zoom nada é agrupado
const FAR_ZOOM = 11;        // "longe": linhas finas, sem rótulos de km
const KM_LABEL_MIN = 13;    // rótulos de km só a partir deste zoom
let current = { markers: [], lines: [] };
let polylines = [];

function zoomClass() {
  const z = map.getZoom();
  const el = map.getContainer();
  el.classList.toggle('zoom-far', z <= FAR_ZOOM);
  el.classList.toggle('zoom-mid', z > FAR_ZOOM && z < 14);
}

function styleLines() {
  const far = map.getZoom() <= FAR_ZOOM;
  for (const { poly, l } of polylines) {
    poly.setStyle({ weight: far ? Math.max(2, (l.weight || 4) * 0.55) : l.weight || 4, opacity: far ? Math.min(0.7, l.opacity ?? 0.85) : l.opacity ?? 0.85 });
  }
}

function clusterIcon(list) {
  const nums = list.map((m) => m.label).filter((x) => typeof x === 'number' || /^\d+$/.test(String(x)));
  const colors = new Set(list.map((m) => m.color));
  const color = colors.size === 1 ? [...colors][0] : '#0d3b4f';
  // até 3 paradas numeradas: mostra "1·2·3"; senão, a contagem
  const text = nums.length === list.length && list.length <= 3 ? nums.sort((a, b) => a - b).join('·') : `${list.length}`;
  const w = Math.max(30, 14 + text.length * 8);
  return L.divIcon({
    className: '',
    html: `<div class="pin cluster ${nums.length === list.length && list.length <= 3 ? 'cluster-nums' : ''}" style="--c:${color};width:${w - 2}px">${text}</div>`,
    iconSize: [w, 30], iconAnchor: [w / 2, 15],
  });
}

function renderMarkers() {
  if (!map) return;
  markerGroup.clearLayers();
  zoomClass();
  styleLines();
  const z = map.getZoom();
  const visible = current.markers.filter((m) => m.cls !== 'km-label' || z >= KM_LABEL_MIN);
  const add = (m) => {
    const mk = L.marker([m.lat, m.lng], { icon: pin(m.label, m.color, m.cls, m.size), zIndexOffset: m.z || 0, interactive: m.cls !== 'km-label', keyboard: m.cls !== 'km-label' }).addTo(markerGroup);
    if (m.popup) mk.bindPopup(m.popup, { maxWidth: 260 });
  };
  if (z >= CLUSTER_UNTIL) { visible.forEach(add); return; }
  // agrupamento simples por distância na tela (os de maior prioridade primeiro)
  const groups = [];
  const sorted = [...visible].sort((a, b) => (b.z || 0) - (a.z || 0));
  for (const m of sorted) {
    if (m.cls === 'km-label' || m.cls === 'result') { add(m); continue; }
    const pt = map.project([m.lat, m.lng], z);
    const g = groups.find((x) => x.pt.distanceTo(pt) < CLUSTER_PX);
    if (g) g.list.push(m); else groups.push({ pt, list: [m] });
  }
  for (const g of groups) {
    if (g.list.length === 1) { add(g.list[0]); continue; }
    const lat = g.list.reduce((a, m) => a + m.lat, 0) / g.list.length;
    const lng = g.list.reduce((a, m) => a + m.lng, 0) / g.list.length;
    const mk = L.marker([lat, lng], { icon: clusterIcon(g.list), zIndexOffset: 2000, title: `${g.list.length} lugares — toque para aproximar` }).addTo(markerGroup);
    mk.on('click', () => {
      const b = L.latLngBounds(g.list.map((m) => [m.lat, m.lng]));
      const target = Math.min(map.getBoundsZoom(b, false, L.point(60, 60)), 18);
      map.setView(b.getCenter(), Math.max(target, z + 2));
    });
  }
}

/**
 * Desenha o estado atual.
 * markers: [{lat, lng, label, color, popup, cls}]
 * lines:   [{points: [[lat,lng]], color, weight, dash, opacity}]
 * (marcadores com nofit: true não entram no enquadramento automático)
 * center:  {lat,lng} usado quando não há marcadores
 */
export function drawMap({ markers = [], lines = [], center = null, fit = true }) {
  if (!map) return;
  group.clearLayers();
  polylines = [];
  current = { markers, lines };
  const bounds = [];
  for (const l of lines) {
    if (l.points.length < 2) continue;
    const poly = L.polyline(l.points, {
      color: l.color, weight: l.weight || 4, opacity: l.opacity ?? 0.85,
      dashArray: l.dash || (l.dashed ? '6 8' : null), lineCap: 'round',
    }).addTo(group);
    polylines.push({ poly, l });
  }
  for (const m of markers) if (!m.nofit) bounds.push([m.lat, m.lng]);
  if (fit) {
    // margem maior em cima (botões de camadas) e embaixo (botões do celular), para nenhum pino ficar escondido
    if (bounds.length > 1) map.fitBounds(bounds, { paddingTopLeft: [36, 64], paddingBottomRight: [36, 72], maxZoom: 16, animate: false });
    else if (bounds.length === 1) map.setView(bounds[0], 15, { animate: false });
    else if (center) map.setView([center.lat, center.lng], 12, { animate: false });
  }
  renderMarkers();
}

export const mapCenter = () => {
  if (!map) return null;
  const c = map.getCenter();
  return { lat: c.lat, lng: c.lng };
};
