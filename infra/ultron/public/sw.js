/* ULTRON OS · estrategias de caché
 *
 *   red-sola     pensar / voz / entrar / salud / SSE — ni se tocan
 *   red-primero  HTML del OS — deploy nuevo se ve; offline usa cascarón
 *   SWR          js / css / fuentes / img — se pinta ya y se actualiza detrás
 *   cascarón     / /os manifiesto logo — precache al instalar
 */
const CAJA = 'ultron-os-sw-2';
const CASCARON = ['/', '/os', '/manifest.webmanifest', '/img/ultron.png'];
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

function esEstatico(u) {
  const p = u.pathname;
  return p.startsWith('/js/') || p.startsWith('/vendor/') || p.startsWith('/img/')
    || /\.(css|js|woff2?|png|svg|webp)$/.test(p) || p === '/manifest.webmanifest' || p === '/markdown.js';
}
function esHtml(req, u) {
  return req.mode === 'navigate' || u.pathname === '/' || u.pathname === '/os' || u.pathname === '/os.html' || u.pathname === '/consola';
}

async function swr(req) {
  const caja = await caches.open(CAJA);
  const hit = await caja.match(req);
  const fondo = fetch(req).then((red) => {
    if (red.ok) caja.put(req, red.clone());
    return red;
  }).catch(() => hit);
  return hit || fondo;
}

async function redPrimero(req) {
  const caja = await caches.open(CAJA);
  try {
    const red = await fetch(req);
    if (red.ok) caja.put(req, red.clone());
    return red;
  } catch {
    return (await caja.match(req)) || (await caja.match('/')) || (await caja.match('/os'));
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return;
  if (RED_SOLA.test(u.pathname)) return;
  if ((req.headers.get('accept') || '').includes('text/event-stream')) return;

  if (esHtml(req, u)) {
    e.respondWith(redPrimero(req));
    return;
  }
  if (esEstatico(u)) {
    e.respondWith(swr(req));
    return;
  }
});
