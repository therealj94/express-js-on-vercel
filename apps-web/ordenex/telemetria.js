/* Telemetría de Ordenex · web
 *
 * POR QUE ESTE ARCHIVO EXISTE
 *
 * El panel de analítica de Genesis ID llena su selector de apps con las apps
 * que APARECEN en los eventos recibidos. Una app que no reporta no sale en la
 * lista: no sale vacía, no sale en cero — no existe. Ordenex tiene backend y
 * tiene gente operando, y hasta hoy el panel enseñaba un ecosistema de una
 * sola app porque nadie contaba las de la otra. Esto lo cierra desde donde
 * ocurre el gesto.
 *
 * Lo correcto sería que reportara infra/ordenex-api: sabe más y no depende de
 * que nadie abra una pantalla. Cuando lo haga, los dos conviven sin
 * estorbarse — Genesis ID cuenta huellas, no peticiones.
 *
 * LA CLAVE ES PUBLICA, Y ESO ES A PROPOSITO
 *
 * Un navegador no puede guardar un secreto. La clave de ingesta (`gidp_…`)
 * solo abre la ruta de telemetría, solo escribe y no lee nada — el mismo trato
 * que el DSN de Sentry. Lo peor que puede hacer quien la saque de aquí es
 * mandar métricas falsas; para eso está el límite de peticiones, y si alguien
 * abusa se rota desde el panel y la versión vieja deja de reportar.
 *
 * La clave SECRETA (`gid_live_…`) es otra cosa: también abre identidades y no
 * puede vivir en una página. Aquí no entra nunca.
 *
 * LO QUE NO SE MANDA, Y POR QUE ORDENEX ES MAS ESTRICTO QUE LA BILLETERA
 *
 * Ni gid, ni nombre, ni dirección de wallet, ni saldos, ni el token de sesión.
 * La billetera además llama a /directorio/confirmar para ponerle nombre a su
 * huella; aquí ese camino NO se copió a propósito: quien entra a Ordenex llega
 * por SSO desde Genesis, o sea que Genesis ya lo tiene en su padrón, y mandar
 * correo y billetera otra vez sería regalar datos personales a cambio de nada.
 * Si un día alguien quiere ese cruce, la decisión se toma arriba y se escribe
 * aquí — no se hereda por copiar un archivo.
 *
 * Lo que sí viaja: qué pantalla se abrió, en qué mercado, de qué lado se operó,
 * cuánto movió la orden y qué se rompió.
 *
 * EL MONTO SI VIAJA, Y LA MONEDA CON EL
 *
 * El explorador de analítica filtra por `valor` y facetea por `moneda`: sin los
 * dos, «las órdenes de más de mil ORIGEN que fallaron anoche» no se puede
 * preguntar. Un notional de orden no identifica a nadie —no hay huella
 * reversible ni saldo detrás— así que se manda. Un SALDO sí diría demasiado de
 * una persona concreta, y por eso no se manda ninguno.
 */

var TELEMETRIA = (function () {
  'use strict';

  /* ── Ajustes ──────────────────────────────────────────────────────────────
     LA CLAVE PUBLICA DE INGESTA DE ORDENEX.

     Solo sirve para escribir eventos, y solo en esta ruta: no lee nada y no da
     acceso a ninguna otra parte de Genesis ID. Es el mismo trato que el DSN de
     Sentry o la clave de proyecto de PostHog. Lo peor que puede hacer quien la
     saque de aquí es mandar métricas falsas; para eso está el límite de
     peticiones, y si alguien abusa se rota desde el panel y esta versión
     desplegada deja de reportar.

     Se obtuvo pidiéndosela al propio servidor con la clave SECRETA de ordenex
     (`GET /api/v1/telemetria/clave`). Para rotarla: panel → Operadores y apps →
     ordenex → rotar clave pública, y el valor nuevo se pega aquí, en esta línea
     y en ninguna otra.

     Si alguna vez vuelve a quedar con el sufijo `_PENDIENTE`, el módulo queda
     DORMIDO: ni cola, ni peticiones, ni errores. Es deliberado — con una clave
     inventada cada lote se iría contra un 401 y el navegador de la gente
     reintentaría cada diez segundos para no conseguir nada. */
  var CLAVE = 'gidp_ordenex_E3FYNtHP6zHw0sDc';

  /* El marcador que mantiene el módulo dormido. Se compara por el sufijo y no
     por la cadena entera para que la comprobación siga sirviendo si alguien
     renombra la app antes de emitir la clave de verdad. */
  var PENDIENTE = /_PENDIENTE$/;

  /* El mismo mecanismo que la billetera: el destino se puede apuntar a otro
     Genesis definiendo ONX_GENESIS antes de este archivo, que es lo que deja
     probar el circuito entero contra un ensayo sin tocar producción. */
  var URL_GENESIS = String(
    (typeof window !== 'undefined' && window.ONX_GENESIS) || 'https://genesis-id.onrender.com'
  ).replace(/\/$/, '');

  var APP = 'ordenex';
  var PLATAFORMA = 'web';
  var VERSION = 'web';

  var CADA_MS = 10000;   // cada cuánto sale un lote
  var POR_LOTE = 50;     // cuántos eventos como mucho por petición
  var TOPE_COLA = 300;   // al pasarse se tiran los más viejos
  var TIEMPO_MS = 8000;

  /* CUÁNTOS TROPIEZOS SEGUIDOS AGUANTA UN LOTE ANTES DE IRSE A LA BASURA.
     Tres, y hay una historia detrás: el origen de Genesis no estaba en el
     connect-src de index.html, así que el navegador rebotaba TODOS los envíos.
     Un rebote de CSP entra por el `catch` igual que un corte de red, el lote
     no se descartaba nunca, y la cola crecía hasta el tope y se reintentaba
     cada diez segundos para siempre — en la máquina de cada persona que
     tuviera la pestaña abierta, sin que ni un solo evento llegara jamás.

     El arreglo de fondo fue poner el origen en la CSP. Este contador es lo
     que hace que la próxima vez que algo así pase, el reportero se rinda con
     ese lote en vez de convertirse en un bucle. Tres intentos son medio
     minuto: sobra para un bache de red y no alcanza para una pared. */
  var TOPE_FALLOS = 3;

  var cola = [];
  var reloj = null;
  var enVuelo = false;
  var marca = null;
  var fallosSeguidos = 0;

  /** Si esto da false, ninguna función de aquí toca la red. */
  function activa() { return Boolean(CLAVE) && !PENDIENTE.test(CLAVE); }

  /* ── Quién es «uno» aquí ──────────────────────────────────────────────────
     LA BILLETERA MANDA EL ID DE SU USUARIO; ORDENEX NO PUEDE.

     El único identificador estable que Ordenex tiene de una persona es el
     `gid`, y el gid es la identidad del ecosistema entero: mandarlo, aunque
     Genesis ID solo guarde su HMAC, sería atar el padrón de identidades a la
     analítica de una casa de cambio. La regla de esta casa es que la analítica
     cuenta huellas anónimas, y eso no se negocia por una métrica.

     Así que se cuenta el NAVEGADOR: dieciséis bytes al azar guardados en local,
     sin relación con ninguna persona ni con ningún dato de la sesión. Sirve
     para «cuántos distintos entraron hoy» y para nada más.

     Lo que esto cuesta, dicho claro: la misma persona en dos navegadores cuenta
     dos veces, y borrar los datos del sitio la vuelve nueva. Es el precio de no
     mandar el gid, y es el precio correcto. */
  var LLAVE_MARCA = 'ordenex.telemetria.marca';

  function marcaDeNavegador() {
    try {
      var g = localStorage.getItem(LLAVE_MARCA);
      if (g) return g;
      var b = new Uint8Array(16);
      crypto.getRandomValues(b);
      g = Array.prototype.map.call(b, function (x) {
        return ('0' + x.toString(16)).slice(-2);
      }).join('');
      localStorage.setItem(LLAVE_MARCA, g);
      return g;
    } catch (x) {
      // Sin almacenamiento —modo privado, permisos cerrados— se sigue
      // reportando sin marca: perder el recuento de únicos es aceptable,
      // perder los errores no.
      return null;
    }
  }

  function iniciar(opciones) {
    opciones = opciones || {};
    if (opciones.clave) CLAVE = opciones.clave;
    if (opciones.url) URL_GENESIS = String(opciones.url).replace(/\/$/, '');
    if (opciones.version) VERSION = String(opciones.version);
    if (!activa()) return false;

    marca = marcaDeNavegador();

    if (reloj) clearInterval(reloj);
    reloj = setInterval(vaciar, CADA_MS);

    // Al cerrar o esconder la pestaña se manda lo que quede. Sin esto se pierde
    // justo el último evento, que es el que dice hasta cuándo estuvo la persona.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') vaciar();
      });
      window.addEventListener('pagehide', vaciar);

      /* Los fallos que nadie atrapó.
         Es lo que convierte «a alguien no le funciona» en «a esta persona le
         reventó esta línea a esta hora». Se enganchan aquí y no en la app para
         que instrumentar no obligue a tocar el código de las vistas. */
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

  /**
   * Apunta un evento. NUNCA lanza.
   *
   * Un fallo del reportero no puede romper la pantalla que está reportando: eso
   * convierte una métrica perdida en un libro de órdenes roto, que es
   * infinitamente peor.
   */
  function anotar(e) {
    try {
      if (!activa()) return;
      if (cola.length >= TOPE_COLA) cola.shift();
      cola.push({
        tipo: e.tipo || 'accion',
        nombre: String(e.nombre || '').slice(0, 120),
        usuario: marca || undefined,
        plataforma: PLATAFORMA,
        version: VERSION,
        gravedad: e.gravedad,
        mensaje: e.mensaje ? String(e.mensaje).slice(0, 400) : undefined,
        pila: e.pila ? String(e.pila).slice(0, 1500) : undefined,
        ruta: e.ruta,
        duracionMs: e.duracionMs,
        // El monto y su moneda van juntos o no van: un número sin unidad en un
        // panel que mezcla ORIGEN, USD y HNL no es un dato, es una trampa.
        valor: (typeof e.valor === 'number' && isFinite(e.valor) && e.moneda) ? e.valor : undefined,
        moneda: (typeof e.valor === 'number' && isFinite(e.valor) && e.moneda)
          ? String(e.moneda).slice(0, 8).toUpperCase() : undefined,
        meta: e.meta,
        en: new Date().toISOString()
      });
      // Un error no espera al siguiente lote: es justo lo que se quiere ver ya.
      if (e.tipo === 'error') vaciar();
    } catch (x) { /* jamás hacia arriba */ }
  }

  /* Los cinco gestos que la app llama. Los nombres de tipo son los de
     src/analitica/eventos.ts y no admiten invención: un tipo que el servidor no
     reconoce se DESCARTA en silencio al ingerir, así que un typo aquí es una
     métrica que nunca aparece y que nadie va a ir a buscar. */
  function sesion(nombre) { anotar({ tipo: 'sesion', nombre: nombre }); }
  function pantalla(nombre, ruta) { anotar({ tipo: 'pantalla', nombre: nombre, ruta: ruta }); }
  function accion(nombre, extra) {
    anotar({ tipo: 'accion', nombre: nombre, ruta: extra && extra.ruta, meta: extra && extra.meta });
  }
  /** Lo que movió dinero. `valor` en unidades humanas, nunca en wei. */
  function transaccion(nombre, valor, moneda, extra) {
    anotar({
      tipo: 'transaccion', nombre: nombre, valor: valor, moneda: moneda,
      ruta: extra && extra.ruta, meta: extra && extra.meta
    });
  }
  function fallo(nombre, e, extra) {
    anotar({
      tipo: 'error', nombre: nombre, gravedad: (extra && extra.gravedad) || 'error',
      mensaje: (e && e.message) || String(e || ''),
      pila: e && e.stack,
      ruta: extra && extra.ruta,
      meta: extra && extra.meta
    });
  }

  function vaciar() {
    if (enVuelo || !cola.length || !activa()) return;
    enVuelo = true;
    var lote = cola.slice(0, POR_LOTE);
    var corte = typeof AbortController === 'function' ? new AbortController() : null;
    var rej = corte ? setTimeout(function () { corte.abort(); }, TIEMPO_MS) : null;

    fetch(URL_GENESIS + '/api/v1/telemetria/eventos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telemetria-Key': CLAVE },
      body: JSON.stringify({ eventos: lote }),
      signal: corte ? corte.signal : undefined,
      // Lo que hace que la petición sobreviva a cerrar la pestaña. Se prefiere a
      // sendBeacon porque este sí admite cabeceras: con beacon la clave tendría
      // que ir en la URL y acabaría en cada registro intermedio.
      keepalive: true
    }).then(function (r) {
      if (rej) clearTimeout(rej);
      // 4xx es culpa nuestra —clave mal, revocada, formato— y reintentar no lo
      // arregla: solo deja la cola creciendo. Se tira el lote igual que si
      // hubiera ido bien. Con 5xx o red caída se deja y se prueba luego.
      if (r.ok || (r.status >= 400 && r.status < 500)) {
        cola = cola.slice(lote.length);
        fallosSeguidos = 0;
      } else {
        tropiezo(lote);
      }
    }).catch(function () {
      if (rej) clearTimeout(rej);
      /* Aquí caen las dos cosas que no se distinguen desde adentro: la red
         que no está y la CSP que rebotó el envío antes de salir. La primera
         se arregla sola esperando; la segunda no se arregla nunca. Como no
         hay manera de saber cuál es, se tratan igual: se reintenta unas
         pocas veces y después se suelta el lote. */
      tropiezo(lote);
    }).then(function () {
      enVuelo = false;
    });
  }

  /* Un envío que no llegó. Se cuenta, y al tercero seguido el lote se
     DESCARTA: perder unos eventos es barato, y dejar la cola llena
     reintentando contra una pared es lo que convierte un reportero en un
     bucle que gasta batería y no reporta nada. */
  function tropiezo(lote) {
    fallosSeguidos++;
    if (fallosSeguidos < TOPE_FALLOS) return;
    fallosSeguidos = 0;
    cola = cola.slice(lote.length);
    // Una sola línea y por consola: quien esté mirando la pestaña merece
    // saber que se están tirando eventos, y no hay a quién más contárselo
    // —el sitio al que se le contaría es justo el que no contesta—.
    try { console.warn('[telemetria] ' + lote.length + ' evento(s) descartados: el destino no contesta'); } catch (x) {}
  }

  return {
    iniciar: iniciar, anotar: anotar,
    sesion: sesion, pantalla: pantalla, accion: accion,
    transaccion: transaccion, fallo: fallo,
    vaciar: vaciar, activa: activa, app: APP,
    _cola: function () { return cola.slice(); }
  };
})();

if (typeof window !== 'undefined') window.TELEMETRIA = TELEMETRIA;
