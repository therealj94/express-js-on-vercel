/* ULTRON OS · service worker
 * Cascarón en caché. Nunca intercepta pensar, voz, entrar ni salud.
 */
const CAJA = 'ultron-os-sw-1';
const CASCARON = [
  '/',
  '/os',
  '/manifest.webmanifest',
  '/img/ultron.png',
];
const RED_SOLA = /^\/(pensar|voz|entrar|saludo|salud|herramientas|whatsapp|sesion|preferencias|archivos|documentos|pendientes|bitacora|avisos|apk)\b/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CAJA).then((c) => c.addAll(CASCARON)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CAJA).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return;
  if (RED_SOLA.test(u.pathname)) return;
  if (req.headers.get('accept') && req.headers.get('accept').includes('text/event-stream')) return;

  e.respondWith((async () => {
    const caja = await caches.open(CAJA);
    try {
      const red = await fetch(req);
      if (red.ok && (u.pathname.startsWith('/js/') || u.pathname.startsWith('/vendor/') || u.pathname.startsWith('/img/') || u.pathname.endsWith('.css') || u.pathname.endsWith('.js') || u.pathname.endsWith('.woff2') || u.pathname === '/manifest.webmanifest')) {
        caja.put(req, red.clone());
      }
      return red;
    } catch {
      const hit = await caja.match(req);
      if (hit) return hit;
      if (u.pathname === '/' || u.pathname === '/os' || u.pathname === '/os.html') {
        const home = await caja.match('/') || await caja.match('/os');
        if (home) return home;
      }
      throw new Error('sin red y sin caché');
    }
  })());
});
