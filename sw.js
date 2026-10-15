// Service worker: permite instalar o app e abrir o roteiro mesmo sem internet
// (mostra a última versão salva). As chamadas /api nunca são guardadas em cache.
const CACHE = 'roteiro-v16';
const SHELL = [
  '/', '/index.html', '/css/app.css', '/js/app.js', '/js/util.js', '/js/api.js', '/js/store.js', '/js/map.js', '/js/weather.js',
  '/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css', '/manifest.webmanifest', '/icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  // Mapas (tiles): cache primeiro, para ver áreas já visitadas sem internet.
  if (url.hostname === 'tile.openstreetmap.org') {
    e.respondWith(
      caches.open(`${CACHE}-tiles`).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) c.put(e.request, res.clone());
        return res;
      }),
    );
    return;
  }
  if (url.origin !== location.origin) return;
  // App: rede primeiro (sempre a versão mais nova), cache como reserva offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html'))),
  );
});
