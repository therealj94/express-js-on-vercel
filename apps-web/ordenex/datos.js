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

  // ── órdenes 🔒 ────────────────────────────────────────────────────────────
  // o = { mercado, lado, tipo, precio?, cantidad, ordenKey } — precio y
  // cantidad en strings de wei; la ordenKey la pone quien coloca, para que un
  // reintento de red no meta la misma orden dos veces.
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

  return {
    API, sondeo,
    mercados, libro, velas, tratos,
    colocar, cancelar, misOrdenes,
    portafolio, retirar, movimientos,
    agentes, solicitudes, crearSolicitud, accionSolicitud,
    sso, salir, haySesion, usuario,
  };
})();
