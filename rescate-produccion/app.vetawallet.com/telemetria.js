/* Telemetría de Veta Wallet · web
 *
 * POR QUE REPORTA EL CLIENTE Y NO EL BACKEND
 *
 * Lo correcto sería el backend: sabe más y no depende de que nadie abra una
 * pantalla. Pero el backend de Veta Wallet vive fuera de este repositorio y no
 * se puede tocar desde aquí, y mientras eso no pase el panel enseña un
 * directorio sin una sola conexión — que se lee como «no entra nadie» cuando
 * la verdad es «nadie lo está contando».
 *
 * Esto lo cierra desde donde de verdad ocurre el gesto. El día que el backend
 * reporte, los dos conviven sin estorbarse: Genesis ID cuenta personas
 * distintas por su huella, no peticiones, así que la misma persona vista por
 * los dos lados sigue siendo una.
 *
 * LA CLAVE ES PUBLICA, Y ESO ES A PROPOSITO
 *
 * Un navegador no puede guardar un secreto. Genesis ID tiene por eso una clave
 * de ingesta que SOLO sirve para la ruta de telemetría, solo escribe y no lee
 * nada — el mismo trato que el DSN de Sentry o la clave de proyecto de PostHog.
 * Lo peor que puede hacer quien la saque de aquí es mandar métricas falsas;
 * para eso está el límite de peticiones, y si alguien abusa se rota desde el
 * panel y la versión vieja deja de reportar.
 *
 * De aquí NO sale nunca el padrón. Esa puerta exige la clave secreta porque
 * son datos personales, y esa clave no puede vivir en una página. El nombre y
 * la billetera los pone Genesis ID cruzando por su cuenta.
 *
 * LO QUE NO SE MANDA
 *
 * Ni contraseñas, ni semillas, ni llaves, ni PIN, ni saldos, ni montos, ni el
 * contenido de un movimiento. Solo qué pantalla se abrió, qué acción se pulsó
 * y qué falló. El identificador de la persona viaja para que Genesis ID pueda
 * calcular su huella, y allí se guarda la huella — nunca el identificador.
 *
 * EL IDENTIFICADOR TIENE QUE COINCIDIR CON EL DEL BACKEND
 *
 * Genesis ID pone nombre a una huella recalculándola sobre el padrón. Si aquí
 * se manda el correo y el backend manda el `_id` de Mongo, las dos huellas no
 * coinciden y TODO sale como «fuera del padrón», sin un solo error visible.
 * `idDeUsuario` sigue el mismo orden que `infra/veta-wallet-telemetria/`.
 *
 * Como la huella es determinista, el día que el padrón se sincronice todo lo
 * ya recogido se identifica solo, hacia atrás: no hay que esperar a que la
 * gente vuelva a entrar.
 */

var TELEMETRIA = (function () {
  'use strict';

  /* ── Ajustes ──────────────────────────────────────────────────────────────
     Esta es la clave PUBLICA de ingesta de veta-wallet, la misma que ya viaja
     dentro del APK (`veta-wallet-app/app.json`). Se repite aquí a propósito:
     las dos son el mismo cliente de la misma app, y si un día se rota hay que
     cambiarla en los dos sitios o uno de los dos deja de reportar en silencio.

     Si se vacía, el módulo queda DORMIDO: ni cola, ni peticiones, ni errores.
     Se saca del panel en Aplicaciones → veta-wallet → clave de telemetría. */
  var CLAVE = 'gidp_veta-wallet_98cwxS8AnbUIRAEr';

  var URL_GENESIS = 'https://genesis-id.onrender.com';
  var APP = 'veta-wallet';
  var PLATAFORMA = 'web';
  var VERSION = 'web';

  var CADA_MS = 10000;   // cada cuánto sale un lote
  var POR_LOTE = 50;     // cuántos eventos como mucho por petición
  var TOPE_COLA = 300;   // al pasarse se tiran los más viejos
  var TIEMPO_MS = 8000;

  var cola = [];
  var reloj = null;
  var enVuelo = false;
  var usuario = null;

  function activa() { return Boolean(CLAVE); }

  /** El identificador de la persona, con el mismo orden que el backend. */
  function idDeUsuario(u) {
    if (!u) return null;
    var bruto = u.idExterno || u._id || u.id || u.sub || u.userId || u.email || u.correo;
    return bruto ? String(bruto) : null;
  }

  function iniciar(opciones) {
    opciones = opciones || {};
    if (opciones.clave) CLAVE = opciones.clave;
    if (opciones.url) URL_GENESIS = opciones.url;
    if (opciones.version) VERSION = String(opciones.version);
    if (!CLAVE) return false;

    if (reloj) clearInterval(reloj);
    reloj = setInterval(vaciar, CADA_MS);

    // Al cerrar o esconder la pestaña se manda lo que quede. Sin esto se
    // pierde justo el último evento, que es el que dice hasta cuándo estuvo
    // la persona.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') vaciar();
      });
      window.addEventListener('pagehide', vaciar);

      /* Los fallos que nadie atrapó.
         Es lo que convierte «a alguien no le funciona» en «a esta persona le
         reventó esta línea a esta hora», que es la diferencia entre poder
         arreglarlo y no poder. Se enganchan aquí y no en la app para que
         instrumentar no obligue a tocar el código de la billetera. */
      window.addEventListener('error', function (ev) {
        fallo(ev && ev.filename ? 'js:' + String(ev.filename).split('/').pop() : 'js',
              (ev && ev.error) || { message: ev && ev.message });
      });
      window.addEventListener('unhandledrejection', function (ev) {
        fallo('promesa', (ev && ev.reason) || {});
      });
    }
    return true;
  }

  /** Quién está usando la app ahora. Se llama al entrar, y con null al salir. */
  function identificar(u) { usuario = idDeUsuario(u); }

  /**
   * Da de alta a esta persona en el padrón de Genesis ID, probándolo con su
   * propia sesión.
   *
   * Aquí NO se manda el padrón de nadie: se manda el token que el backend de
   * Veta Wallet firmó al iniciar sesión, y Genesis ID le pregunta a ese mismo
   * backend si lo reconoce. Si dice que no, no se escribe nada. Por eso puede
   * ir con la clave pública sin abrir ninguna puerta: lo que autoriza no es la
   * clave, es tener una sesión de verdad.
   *
   * Sin esto el panel ve la conexión pero no sabe de quién es — sale «fuera
   * del padrón», sin nombre y sin billetera.
   */
  function confirmar(token, datos) {
    try {
      if (!CLAVE || !token) return;
      datos = datos || {};
      fetch(URL_GENESIS + '/api/v1/directorio/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telemetria-Key': CLAVE },
        body: JSON.stringify({
          token: token,
          // Solo se usan si el token no los trae, y quedan marcados como no
          // confirmados. El token siempre manda.
          email: datos.email, nombre: datos.nombre,
          direccionWallet: datos.direccionWallet
        })
      }).catch(function () { /* se reintenta en el próximo ingreso */ });
    } catch (x) { /* jamás hacia arriba */ }
  }

  /**
   * Apunta un evento. NUNCA lanza.
   *
   * Un fallo del reportero no puede romper la pantalla que está reportando:
   * eso convierte una métrica perdida en una billetera rota, que es
   * infinitamente peor.
   */
  function anotar(e) {
    try {
      if (!CLAVE) return;
      if (cola.length >= TOPE_COLA) cola.shift();
      cola.push({
        tipo: e.tipo || 'evento',
        nombre: String(e.nombre || '').slice(0, 120),
        usuario: usuario || undefined,
        plataforma: PLATAFORMA,
        version: VERSION,
        gravedad: e.gravedad,
        mensaje: e.mensaje ? String(e.mensaje).slice(0, 400) : undefined,
        pila: e.pila ? String(e.pila).slice(0, 1500) : undefined,
        ruta: e.ruta,
        duracionMs: e.duracionMs,
        en: new Date().toISOString()
      });
      // Un error no espera al siguiente lote: es justo lo que se quiere ver ya.
      if (e.tipo === 'error') vaciar();
    } catch (x) { /* jamás hacia arriba */ }
  }

  function pantalla(nombre) { anotar({ tipo: 'pantalla', nombre: nombre }); }
  function accion(nombre) { anotar({ tipo: 'accion', nombre: nombre }); }
  function fallo(nombre, e) {
    anotar({
      tipo: 'error', nombre: nombre, gravedad: 'error',
      mensaje: (e && e.message) || String(e || ''),
      pila: e && e.stack
    });
  }

  function vaciar() {
    if (enVuelo || !cola.length || !CLAVE) return;
    enVuelo = true;
    var lote = cola.slice(0, POR_LOTE);
    var corte = typeof AbortController === 'function' ? new AbortController() : null;
    var rej = corte ? setTimeout(function () { corte.abort(); }, TIEMPO_MS) : null;

    fetch(URL_GENESIS + '/api/v1/telemetria/eventos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telemetria-Key': CLAVE },
      body: JSON.stringify({ eventos: lote }),
      signal: corte ? corte.signal : undefined,
      // Lo que hace que la petición sobreviva a cerrar la pestaña. Se prefiere
      // a sendBeacon porque este sí admite cabeceras: con beacon la clave
      // tendría que ir en la URL y acabaría en cada registro intermedio.
      keepalive: true
    }).then(function (r) {
      if (rej) clearTimeout(rej);
      // 4xx es culpa nuestra —clave mal, revocada, formato— y reintentar no lo
      // arregla: solo deja la cola creciendo. Se tira el lote igual que si
      // hubiera ido bien. Con 5xx o red caída se deja y se prueba luego.
      if (r.ok || (r.status >= 400 && r.status < 500)) cola = cola.slice(lote.length);
    }).catch(function () {
      if (rej) clearTimeout(rej);
    }).then(function () {
      enVuelo = false;
    });
  }

  return {
    iniciar: iniciar, identificar: identificar, confirmar: confirmar, anotar: anotar,
    pantalla: pantalla, accion: accion, fallo: fallo,
    vaciar: vaciar, activa: activa, idDeUsuario: idDeUsuario,
    _cola: function () { return cola.slice(); }
  };
})();

if (typeof window !== 'undefined') window.TELEMETRIA = TELEMETRIA;
