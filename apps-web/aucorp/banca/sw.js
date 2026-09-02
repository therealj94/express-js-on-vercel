/* El trabajador de servicio de la banca: lo justo para que la app se instale
 * en el teléfono y abra aunque la red tarde.
 *
 * ══ RED PRIMERO, SIEMPRE ══════════════════════════════════════════════════
 *
 * Una pantalla de dinero no puede enseñar una copia vieja de sí misma sin
 * avisar. Así que TODO se pide a la red primero; la caché sólo sirve el
 * cascarón (HTML, JS, fuentes, íconos) cuando la red no contesta, para que la
 * app abra y diga «sin conexión» con su propia cara en vez de la página de
 * error del navegador. Las llamadas al API jamás se guardan: un saldo de ayer
 * servido hoy es una mentira con formato.
 *
 * El nombre de la caché lleva una versión: cambiarla tira la caché vieja en
 * el próximo arranque. subir.py ya sella los archivos con su huella, así que
 * el navegador no se queda con una copia rancia por su cuenta.
 */
const CACHE = 'aucorp-banca-v1';
const CASCARON = ['./', './index.html', './app.js', './manifest.webmanifest',
  '../assets/fonts/Fraunces-600.woff2', '../assets/fonts/IBMPlexSans.woff2',
  '../assets/fonts/IBMPlexMono-400.woff2', '../assets/fonts/IBMPlexMono-500.woff2',
  '../assets/aucorp-marca-oscura.png', '../assets/aucorp.png',
  './iconos/icono-192.png', './iconos/icono-512.png'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCARON)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys().then((llaves) =>
    Promise.all(llaves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  // Sólo lo propio y sólo GET. El API es otro origen y no se toca.
  if (ev.request.method !== 'GET' || url.origin !== self.location.origin) return;
  ev.respondWith(
    fetch(ev.request).then((r) => {
      if (r.ok) {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(ev.request, copia)).catch(() => {});
      }
      return r;
    }).catch(() => caches.match(ev.request).then((c) => c || caches.match('./index.html')))
  );
});
