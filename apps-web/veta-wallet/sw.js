/* El obrero de fondo de PULSE2CHAT.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PARA QUE EXISTE
 *
 * Para que el teléfono suene con la app cerrada. Hasta hoy, PULSE2CHAT era
 * una página: si la pestaña no estaba abierta, una llamada no llegaba a
 * ninguna parte y quien llamaba escuchaba un tono que no sonaba en el otro
 * lado. Esto es lo único que arregla eso.
 *
 * Un service worker vive fuera de la página: el navegador lo despierta cuando
 * llega un aviso, aunque la app esté cerrada y el teléfono bloqueado.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LO QUE ESTE ARCHIVO NO HACE, Y POR QUE
 *
 * NO cachea nada. Un service worker que guarda copias de la app es la forma
 * más fácil de dejar a la gente con una versión vieja para siempre: se
 * despliega un arreglo, y quien ya entró una vez sigue viendo lo de antes sin
 * entender por qué. Aquí solo se atienden avisos.
 *
 * Si algún día hace falta que funcione sin internet, se agrega con cuidado y
 * con una forma de forzar la actualización. Hoy no hace falta.
 */

/* Se toma el control en cuanto se instala, sin esperar a que se cierren las
   pestañas viejas. Sin esto, el primer aviso después de instalar no llega:
   el obrero está instalado pero todavía no manda. */
self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

/* El aviso que llega del servidor.
 *
 * El cuerpo trae de quién es y qué es: un mensaje o una llamada. Una llamada
 * se anuncia distinto —con más urgencia y sin agruparse con las demás— porque
 * caduca: un mensaje espera, una llamada no.
 */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { cuerpo: e.data?.text() || '' }; }

  const esLlamada = d.tipo === 'llamada';
  const quien = d.de || 'PULSE2CHAT';

  const opciones = {
    body: d.cuerpo || (esLlamada ? 'Te está llamando' : 'Te escribió'),
    icon: '/assets/p2c-simbolo.png',
    badge: '/assets/p2c-simbolo.png',
    // Los mensajes de una misma persona se apilan; las llamadas no, porque
    // cada una es su propio momento y perder una es perderla.
    tag: esLlamada ? `llamada-${Date.now()}` : `msg-${d.de || 'x'}`,
    renotify: esLlamada,
    requireInteraction: esLlamada,
    vibrate: esLlamada ? [400, 200, 400, 200, 400] : [180],
    data: { url: d.url || '/', tipo: d.tipo, de: d.de },
    actions: esLlamada
      ? [{ action: 'entrar', title: 'Contestar' }, { action: 'no', title: 'Rechazar' }]
      : [{ action: 'entrar', title: 'Abrir' }],
  };
  e.waitUntil(self.registration.showNotification(quien, opciones));
});

/* Tocar el aviso.
 *
 * Si la app YA está abierta en alguna pestaña, se le da el foco a esa en vez
 * de abrir otra: dos pestañas de la misma cuenta pelean por la misma llave
 * del chat y la segunda se queda sin sesión.
 */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  if (e.action === 'no') return;

  const destino = e.notification.data?.url || '/';
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of abiertas) {
      if (c.url.includes(self.location.origin)) {
        await c.focus();
        // Se le avisa a la página qué se tocó, para que abra el hilo o la
        // llamada correcta en vez de dejar a la persona en la portada.
        c.postMessage({ de: 'sw', accion: e.action || 'entrar', datos: e.notification.data });
        return;
      }
    }
    await self.clients.openWindow(destino);
  })());
});
