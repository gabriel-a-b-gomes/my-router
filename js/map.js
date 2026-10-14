// Mapa com Leaflet (arquivos em /vendor) e mapa-base gratuito do OpenStreetMap.
/* global L */

let map = null;
let group = null;

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
  const bounds = [];
  for (const l of lines) {
    if (l.points.length < 2) continue;
    L.polyline(l.points, {
      color: l.color, weight: l.weight || 4, opacity: l.opacity ?? 0.85,
      dashArray: l.dash || (l.dashed ? '6 8' : null), lineCap: 'round',
    }).addTo(group);
  }
  for (const m of markers) {
    const mk = L.marker([m.lat, m.lng], { icon: pin(m.label, m.color, m.cls, m.size), zIndexOffset: m.z || 0, interactive: m.cls !== 'km-label', keyboard: m.cls !== 'km-label' }).addTo(group);
    if (m.popup) mk.bindPopup(m.popup, { maxWidth: 260 });
    if (!m.nofit) bounds.push([m.lat, m.lng]);
  }
  if (!fit) return;
  if (bounds.length > 1) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16, animate: false });
  else if (bounds.length === 1) map.setView(bounds[0], 15, { animate: false });
  else if (center) map.setView([center.lat, center.lng], 12, { animate: false });
}

export const mapCenter = () => {
  if (!map) return null;
  const c = map.getCenter();
  return { lat: c.lat, lng: c.lng };
};
