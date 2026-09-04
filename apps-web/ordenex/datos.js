/* El cliente del API de Ordenex. Todo lo que la web le dice al servidor pasa
 * por aquí, y cada función se llama como su ruta en infra/ordenex-api: quien
 * lea el contrato encuentra la función, y al revés.
 *
 * Dos reglas que este archivo no negocia:
 *
 * 1. EL DINERO VIAJA COMO STRING DE WEI. Este cliente no convierte, no
 *    redondea y no toca un monto: lo que llega del servidor se entrega igual,
 *    y lo que se manda se manda igual. Convertir a Number aquí sería perder
 *    los últimos dígitos de un saldo de 18 decimales en el único sitio por el
 *    que pasan todos los montos de la casa.
 *
 * 2. FAIL-CLOSED. Una respuesta que no se pudo leer es un error que se lanza,
 *    nunca un [] ni un 0 de consuelo: quien pinta decide qué decir, pero
 *    nadie opera sobre un dato que no llegó.
 */

const DATOS = (() => {
  'use strict';

  // El backend de la casa de cambio. Se puede apuntar a otro definiendo
  // ONX_API antes de este archivo —igual que OG_API en la billetera—: es lo
  // que deja probar contra un servidor de mentira sin tocar el de producción.
  const API = String(window.ONX_API || 'https://ordenex-api-ba4b27b8b51a.herokuapp.com').replace(/\/$/, '');
  const LLAVE = 'ordenex.sesion';

  // { token, refreshToken, usuario } — la sesión PROPIA de Ordenex, emitida
  // por su backend tras canjear el token SSO de Genesis. Aquí no vive ninguna
  // contraseña porque Ordenex no tiene contraseñas.
  let sesion = null;
  try { sesion = JSON.parse(localStorage.getItem(LLAVE) || 'null'); } catch {}

  function guardar() {
    try {
      if (sesion) localStorage.setItem(LLAVE, JSON.stringify(sesion));
      else localStorage.removeItem(LLAVE);
    } catch {}
  }

  async function crudo(ruta, { metodo = 'GET', cuerpo, conSesion = true, espera = 25000 } = {}) {
    const ctl = new AbortController();
    const reloj = setTimeout(() => ctl.abort(), espera);
    try {
      const cab = { 'Content-Type': 'application/json' };
      if (conSesion && sesion?.token) cab.Authorization = 'Bearer ' + sesion.token;
      return await fetch(API + ruta, {
        method: metodo, headers: cab, signal: ctl.signal,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
    } finally { clearTimeout(reloj); }
  }

  /* El refresco comparte UNA promesa: cuando el token vence, todos los sondeos
     de la pantalla fallan a la vez, y sin esto cada uno pediría su propio
     refresh — el backend rota el refreshToken, así que el segundo en llegar
     invalidaría la sesión que el primero acababa de renovar. */
  let renovacion = null;
  function renovar() {
    if (!renovacion) {
      renovacion = (async () => {
        const rt = sesion?.refreshToken;
        if (!rt) return false;
        try {
          const r = await crudo('/auth/refresh', { metodo: 'POST', cuerpo: { refreshToken: rt }, conSesion: false });
          const d = await r.json().catch(() => null);
          if (!r.ok || !d?.token) return false;
          sesion = { token: d.token, refreshToken: d.refreshToken || rt, usuario: d.usuario ?? sesion?.usuario ?? null };
          guardar();
          return true;
        } catch { return false; }
      })().finally(() => { renovacion = null; });
    }
    return renovacion;
  }

  async function pedir(ruta, opciones = {}) {
    let r = await crudo(ruta, opciones);
    // Un 401 con refreshToken guardado no es «fuera»: se renueva y se repite
    // UNA vez. Si tampoco así, la sesión está muerta y se tira — dejarla
    // guardada sería enseñar una pantalla que falla en cada gesto.
    if (r.status === 401 && opciones.conSesion !== false && sesion?.refreshToken) {
      if (await renovar()) r = await crudo(ruta, opciones);
    }
    if (r.status === 401 && opciones.conSesion !== false) {
      salir();
      const e = new Error('La sesión venció.');
      e.codigo = 'SESION_VENCIDA'; e.http = 401;
      throw e;
    }
    const d = await r.json().catch(() => null);
    if (!r.ok) {
      // El contrato promete { error, codigo } en todo fallo; si ni eso llegó,
      // el código HTTP es lo único honesto que se puede decir.
      const e = new Error(d?.error || `El servidor contestó ${r.status}.`);
      e.codigo = d?.codigo || 'HTTP_' + r.status; e.http = r.status;
      throw e;
    }
    return d;
  }

  /* Sondeo suave: llama a fn cada ms, pero SOLO con la pestaña visible — un
     libro de órdenes refrescándose detrás de veinte pestañas es tráfico que
     nadie mira. Al volver a la pestaña dispara al instante, para no encontrar
     un mercado congelado de hace diez minutos. Devuelve la función que lo
     para; quien abre un sondeo es dueño de pararlo. */
  function sondeo(fn, ms) {
    let parado = false;
    const tic = () => { if (!parado && !document.hidden) { try { fn(); } catch {} } };
    const alVolver = () => { if (!document.hidden) tic(); };
    const reloj = setInterval(tic, ms);
    document.addEventListener('visibilitychange', alVolver);
    tic();
    return () => {
      parado = true;
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }

  const par = p => encodeURIComponent(String(p || ''));

  // ── mercados (público: sin sesión se ve todo) ─────────────────────────────
  const mercados = () => pedir('/mercados', { conSesion: false });
  const libro = p => pedir(`/mercados/${par(p)}/libro`, { conSesion: false });
  const velas = (p, marco, desde, hasta) => {
    const q = new URLSearchParams({ marco: String(marco || '1h') });
    if (desde != null) q.set('desde', String(desde));
    if (hasta != null) q.set('hasta', String(hasta));
    return pedir(`/mercados/${par(p)}/velas?${q}`, { conSesion: false });
  };
  const tratos = p => pedir(`/mercados/${par(p)}/tratos`, { conSesion: false });

  /* La OTRA clase de vela, por su propia puerta. `velas` trae TRATOS de esta
     casa en wei de ORIGEN; esto trae REFERENCIA del mercado real del metal en
     DÓLARES, y llega con su rótulo puesto:

       { activo, unidad:'USD', rotulo, fuente, actualizadoEn, velas:[[t0,o,h,l,c,null]…] }

     Dos funciones y no una con bandera, porque son dos cosas distintas: la
     única manera de que un día alguien pinte el cartel del oro como si fuera
     una operación de Ordenex es que las dos series lleguen por el mismo caño.
     Los marcos son los que da el proveedor —30m, 4h, 4d— y no los de tratos.

     Solo AUKA, AGKA y ORIGEN tienen referencia; para los demás el API contesta
     404 con codigo SIN_REFERENCIA, y ese error se propaga tal cual: un activo
     sin mercado real detrás no recibe una línea plana de consuelo. */
  const referencia = (p, marco) => {
    const q = new URLSearchParams({ marco: String(marco || '30m') });
    return pedir(`/mercados/${par(p)}/referencia?${q}`, { conSesion: false });
  };

  /* La TERCERA clase de precio, y su puerta también es propia — y a propósito
     no cuelga de /mercados: lo que sirve no es un mercado.

       { token, clase:'declarado', moneda:'USD', vigente, serie:[{fecha,precio,acta,firmante}…] }

     Es lo que la Junta Directiva le fijó por resolución a un instrumento que
     todavía no cotiza (hoy, solo ONDK). No tiene marco, no tiene volumen y no
     tiene libro: tiene actas. Que llegue por su propio caño es lo que impide
     que un día alguien lo pinte de vela y ONDK parezca que cotiza.

     Para lo que no es declarable el API contesta 404 NO_DECLARABLE, y ese
     error se propaga tal cual. */
  const declarado = token => pedir(`/precio-declarado/${par(token)}`, { conSesion: false });

  /* LO QUE COBRA LA CASA.
   *
   *   { comisionPpm, sobre: 'recibido' }
   *
   * Partes por millón sobre lo que cada parte RECIBE —el activo el comprador,
   * el ORIGEN el vendedor—, que es como la cobra el motor. Público y sin
   * sesión, como /salud: la tarifa es de quien va a pagarla y pedirle cuenta
   * para enterarse sería cobrársela antes de decírsela.
   *
   * Se pide al servidor y NO se escribe aquí porque la cifra vive en una
   * variable de entorno del motor: una copia en el navegador sería una tarifa
   * anunciada que no es la que se cobra, y ese es el peor de los dos errores
   * posibles. Si esto falla, quien pinta NO inventa un cero — dice que no
   * pudo traerla. */
  const tarifas = () => pedir('/tarifas', { conSesion: false });

  /* LOS UMBRALES DE LA GUARDA DE PRECIO Y LA VERSIÓN DE LOS TÉRMINOS.
   *
   *   { desvio: { avisoPct, bloqueoPct }, terminos: { version, terminos, riesgo } }
   *
   * Del mismo sitio que los aplica (lib/guardaPrecio.js, lib/terminos.js):
   * la pantalla de confirmación enseña «se aleja más del X %» con el X que de
   * verdad frena, y compara la versión de los términos que la persona aceptó
   * con la que hoy está publicada. Una copia escrita acá sería un umbral
   * anunciado que no es el que corta. */
  const limites = () => pedir('/limites', { conSesion: false });

  // ── los términos y el aviso de riesgo 🔒 ─────────────────────────────────
  // { version, terminos, riesgo, aceptada } — si ESTA cuenta aceptó la versión
  // vigente. Se acepta una vez por versión, no una vez por orden.
  const terminos = () => pedir('/auth/terminos');
  async function aceptarTerminos(version) {
    const d = await pedir('/auth/terminos', { metodo: 'POST', cuerpo: { version } });
    // La sesión guardada se actualiza para que la próxima orden no vuelva a
    // pedir la casilla: el servidor ya lo sabe, y el navegador también.
    if (sesion && d?.aceptada === true) {
      sesion = { ...sesion, usuario: { ...(sesion.usuario || {}), terminos: d } };
      guardar();
    }
    return d;
  }
  // ¿Esta sesión ya aceptó la versión que le pasan? Fail-closed: sin dato, no.
  const terminosAceptados = version =>
    Boolean(sesion?.usuario?.terminos?.aceptada === true && sesion.usuario.terminos.version === version);

  // ── órdenes 🔒 ────────────────────────────────────────────────────────────
  // o = { mercado, lado, tipo, precio?, cantidad, ordenKey, aceptoDesvio? } —
  // precio y cantidad en strings de wei; la ordenKey la pone quien coloca,
  // para que un reintento de red no meta la misma orden dos veces;
  // aceptoDesvio es la casilla de la confirmación cuando el precio se aleja
  // más del aviso de la referencia (el API la exige: DESVIO_SIN_ACEPTAR).
  const colocar = o => pedir('/ordenes', { metodo: 'POST', cuerpo: o });
  const cancelar = id => pedir(`/ordenes/${encodeURIComponent(id)}`, { metodo: 'DELETE' });
  const misOrdenes = () => pedir('/ordenes?estado=abierta');

  // ── portafolio y cadena 🔒 ────────────────────────────────────────────────
  const portafolio = () => pedir('/portafolio');
  // r = { activo, cantidad, direccion, retiroKey } — la retiroKey es la
  // idempotencia del retiro: reintentar no puede firmar dos veces.
  const retirar = r => pedir('/retiros', { metodo: 'POST', cuerpo: r });
  const movimientos = () => pedir('/movimientos');

  // ── el circuito fiat ──────────────────────────────────────────────────────
  const agentes = m => pedir('/fiat/agentes' + (m ? `?moneda=${encodeURIComponent(m)}` : ''), { conSesion: false });
  const solicitudes = () => pedir('/fiat/solicitudes');
  const crearSolicitud = s => pedir('/fiat/solicitudes', { metodo: 'POST', cuerpo: s });
  // Las acciones válidas son las del contrato y ni una más: mandar cualquier
  // string a una ruta compuesta es la clase de agujero que no se ve hasta que
  // alguien lo usa. El `cuerpo` es opcional porque no todas lo llevan, pero
  // `avisar` EXIGE { referencia } —la mitad de la prueba en una disputa— y
  // confirmar/cancelar/disputar aceptan { nota }: sin esta puerta, el aviso
  // del pago no podría viajar y el circuito fiat quedaría trunco justo en su
  // paso más probatorio.
  const ACCIONES = ['tomar', 'avisar', 'confirmar', 'cancelar', 'disputar'];
  function accionSolicitud(id, que, cuerpo) {
    if (!ACCIONES.includes(que)) return Promise.reject(Object.assign(new Error(`Acción desconocida: ${que}`), { codigo: 'ACCION_INVALIDA' }));
    return pedir(`/fiat/solicitudes/${encodeURIComponent(id)}/${que}`, { metodo: 'POST', ...(cuerpo === undefined ? {} : { cuerpo }) });
  }

  // ── la sesión ─────────────────────────────────────────────────────────────
  // Canjea el token SSO que trae la wallet en el hash por la sesión propia de
  // Ordenex. El token vale 15 minutos y un solo canje: si esto falla, no hay
  // sesión a medias que limpiar — no se guardó nada.
  async function sso(token) {
    const d = await pedir('/auth/sso', { metodo: 'POST', cuerpo: { token }, conSesion: false });
    if (!d?.token) {
      const e = new Error('El servidor no devolvió una sesión.');
      e.codigo = 'SSO_SIN_SESION';
      throw e;
    }
    sesion = { token: d.token, refreshToken: d.refreshToken || null, usuario: d.usuario || null };
    guardar();
    return sesion.usuario;
  }

  function salir() { sesion = null; guardar(); }

  const haySesion = () => Boolean(sesion?.token);
  const usuario = () => sesion?.usuario || null;

  /* ── LA PUERTA GENÉRICA 🔒 ─────────────────────────────────────────────────
   *
   * Todo lo de arriba es una función con nombre por ruta, que es lo correcto:
   * el nombre dice qué se pide y el contrato queda escrito en un solo sitio.
   * Estas dos son la excepción, y existen por `comprar.js`.
   *
   * El circuito de compra son CUATRO rutas —congelar el precio, mirar cómo va,
   * confirmar un recálculo, cancelar— que solo usa esa pantalla y que se
   * llaman con el id de la orden por delante. Envolverlas una por una aquí
   * dejaría cuatro funciones que nadie más llama, y `comprar.js` ya escribe la
   * ruta al lado de la petición, donde se lee.
   *
   * PERO ESTABAN SIN ESCRIBIR, y eso mató la compra entera. `comprar.js`
   * llamaba a `DATOS.post(...)` y `DATOS.get(...)` desde el 4 de septiembre y
   * este módulo no exportaba ninguno de los dos. El primer clic en «congelar»
   * lanzaba un TypeError que moría en el `catch` de la propia pantalla, así
   * que el síntoma no era un error: era un botón que no hacía nada. Ninguna
   * prueba lo vio porque ninguna llegaba a pulsarlo — `comprar.js` estaba
   * bien, `datos.js` estaba bien, y el hueco estaba ENTRE los dos.
   *
   * Ahora lo cubre `pruebas/probar-comprar.mjs`, que recorre el camino con un
   * navegador y un servidor al otro lado, y que empieza preguntando si estos
   * dos métodos existen.
   *
   * Van por `pedir` y no por `crudo` a propósito: así heredan el refresco del
   * token al primer 401 y la forma { error, codigo } de los fallos, que es de
   * lo que vive la pantalla (distingue SIN_DIRECCION_WALLET para pedir la
   * dirección en vez de enseñar un error).
   */
  const get = (ruta) => pedir(ruta);
  const post = (ruta, cuerpo = {}) => pedir(ruta, { metodo: 'POST', cuerpo });

  return {
    API, sondeo,
    mercados, libro, velas, tratos, referencia, declarado, tarifas, limites,
    terminos, aceptarTerminos, terminosAceptados,
    colocar, cancelar, misOrdenes,
    portafolio, retirar, movimientos,
    agentes, solicitudes, crearSolicitud, accionSolicitud,
    sso, salir, haySesion, usuario,
    get, post,
  };
})();
