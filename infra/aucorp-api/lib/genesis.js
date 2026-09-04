// El cliente de Genesis ID de esta casa.
//
// AuCorp es una app del ecosistema como la wallet, Ordenex o MyTokenPay: habla
// con Genesis con SU propia clave de API (X-API-Key, GENESIS_API_KEY — el alta
// de la app `aucorp` en APPS_ECOSISTEMA), y esa clave vive SOLO en este
// servidor. A diferencia del puente de la wallet, aqui no se re-expone nada al
// navegador: son las tres llamadas que el backend necesita para si mismo —
// verificar el SSO con el que entra la gente, tamizar a la contraparte de cada
// retiro, y reportar los movimientos al monitoreo.
//
// LA REGLA DE TODO EL ARCHIVO ES FAIL-CLOSED. Genesis es quien dice si un
// token de SSO es de verdad y si una direccion esta sancionada; cuando no
// contesta, la respuesta NO se adivina: verificarSso truena (y el login no
// entra) y tamizDireccion truena (y el retiro no sale). Lo unico que no truena
// es el reporte AML —reportarMovimiento— porque llega DESPUES de una operacion
// que ya paso: deshacer o tapar un retiro emitido porque el reportero tosio
// seria peor que reportar tarde.

const { randomUUID } = require('crypto');

// La base y la clave se leen EN CADA llamada, no al cargar el modulo: las
// pruebas del API levantan un Genesis fingido y fijan GENESIS_URL despues de
// que los require ya corrieron — leerla al importar clavaria la de produccion
// para siempre y el fingido no recibiria ni una llamada.
const base = () => (process.env.GENESIS_URL || 'https://genesis-id.onrender.com').replace(/\/$/, '');
const clave = () => (process.env.GENESIS_API_KEY || '').trim();

// Genesis vive en Render y un arranque frio tarda: cortar a los pocos segundos
// convertiria el primer login de la mañana en un fallo. Es el mismo plazo que
// usa el puente de la wallet con el mismo servidor enfrente.
const PLAZO_MS = 25000;

/**
 * Una llamada a Genesis. Devuelve { ok, estado, cuerpo } para CUALQUIER
 * respuesta HTTP; truena solo cuando ni siquiera hubo respuesta (red caida,
 * plazo vencido) o cuando falta la clave — que no es "Genesis dijo que no"
 * sino "no se pudo preguntar", y cada funcion decide que hacer con eso.
 */
async function llamar(ruta, { metodo = 'GET', cuerpo } = {}) {
  if (!clave()) {
    // Sin clave no hay pregunta que hacer. Se truena en vez de fingir un no:
    // es un fallo NUESTRO de configuracion y el log lo tiene que cantar.
    throw new Error('GENESIS_API_KEY no esta configurada en este servidor');
  }
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), PLAZO_MS);
  try {
    const r = await fetch(base() + ruta, {
      method: metodo,
      signal: control.signal,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': clave() },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const datos = await r.json().catch(() => ({}));
    return { ok: r.ok, estado: r.status, cuerpo: datos };
  } catch (e) {
    throw new Error(e?.name === 'AbortError'
      ? `Genesis no respondio en ${PLAZO_MS}ms`
      : `no se pudo contactar con Genesis: ${e.message}`);
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * POST /api/v1/sso/verificar — ¿este token de paso es de verdad?
 *
 * Devuelve { valido, gid, perfil }. Los dos "no" de Genesis se distinguen de
 * sus tropiezos: un 401 (token invalido o vencido) o un 403 (la identidad
 * dejo de estar verificada despues de emitirlo) son un NO legitimo y salen
 * como { valido: false } — el controller contesta 401 y el usuario saca otro
 * token. Un 5xx (p. ej. Genesis sin GENESIS_SSO_SECRETO) truena: eso es "no
 * se pudo comprobar", el controller contesta 503, y mandar a la gente a
 * re-loguearse contra algo roto no arregla nada.
 */
async function verificarSso(token) {
  const r = await llamar('/api/v1/sso/verificar', { metodo: 'POST', cuerpo: { token } });
  if (r.estado === 401 || r.estado === 403) return { valido: false };
  if (!r.ok) throw new Error(`Genesis respondio ${r.estado} al verificar el SSO`);
  if (r.cuerpo?.valido !== true || typeof r.cuerpo.gid !== 'string' || !r.cuerpo.gid) {
    // Un 200 sin `valido: true` o sin gid no es un si a medias: es un no.
    return { valido: false };
  }
  return { valido: true, gid: r.cuerpo.gid, perfil: r.cuerpo.perfil || null };
}

/**
 * GET /api/v1/tamiz/direccion/:direccion — el tamiz de sanciones, ANTES de
 * cada retiro.
 *
 * FAIL-CLOSED sin excepciones, y este es el porque: quien nos llama comprueba
 * `sancionada`, asi que cualquier objeto con `sancionada: false` ES un pase.
 * Genesis avisa con `tamizado: false` cuando no tiene listas cargadas — lo
 * dice el mismo, para que nadie lea ese false como "esta limpia" — y devolver
 * eso tal cual convertiria "no se pudo mirar" en "aprobada": el retiro
 * saldria justo cuando nadie lo tamizo. Asi que una direccion NO tamizada
 * truena igual que una red caida, y el retiro no sale. Un 503 de vez en
 * cuando se reintenta; un envio a una direccion de una lista no se deshace
 * jamas.
 */
/**
 * GET /api/v1/gid/:gid — la ficha publica de un GID.
 *
 * Devuelve { verificada, bloqueada, ... } y TRUENA si no se pudo preguntar.
 * La diferencia importa: «Genesis dice que no esta verificada» y «Genesis no
 * contesto» son dos cosas distintas y quien llama decide que hacer con cada
 * una (ver lib/bloqueo.js, que aguanta la segunda un rato y no la primera).
 */
async function gid(g) {
  const r = await llamar(`/api/v1/gid/${encodeURIComponent(String(g))}`);
  if (!r.ok) throw new Error(`Genesis respondio ${r.estado} al consultar el GID`);
  return r.cuerpo || {};
}

async function tamizDireccion(direccion) {
  const r = await llamar(`/api/v1/tamiz/direccion/${encodeURIComponent(String(direccion))}`);
  if (!r.ok) throw new Error(`Genesis respondio ${r.estado} al tamizar la direccion`);
  if (r.cuerpo?.tamizado !== true) {
    throw new Error(r.cuerpo?.aviso || 'Genesis no tamizo la direccion');
  }
  return {
    tamizado: true,
    sancionada: r.cuerpo.sancionada === true,
    ficha: r.cuerpo.ficha || null,
  };
}

/**
 * POST /api/v1/movimientos — el reporte AML de cada retiro y cada liquidacion
 * fiat. Acepta un movimiento suelto o una lista.
 *
 * Al llamador le llega SOLO true/false, jamas el cuerpo de la respuesta. Es la
 * regla del ecosistema: el monitoreo no dice si salto una alerta —avisarle al
 * interesado es justo lo prohibido— y este cliente garantiza que ningun
 * controller pueda filtrarla al usuario ni por accidente, porque nunca la
 * tuvo en la mano.
 *
 * Y no truena nunca: el reporte va DESPUES de dinero que ya se movio, y un
 * fallo del reportero no puede deshacer ni tapar la operacion que reporta.
 * Se anota en el log y a otra cosa.
 */
async function reportarMovimiento(gid, movs) {
  try {
    if (typeof gid !== 'string' || !gid.trim()) {
      // Sin gid Genesis lo rechazaria igual; se ahorra el viaje y se canta.
      console.error('[genesis] reporte AML sin gid: no se manda');
      return false;
    }
    const lista = (Array.isArray(movs) ? movs : [movs])
      .filter((m) => m && typeof m === 'object')
      // Genesis descarta en silencio todo movimiento sin `id` (es su llave de
      // idempotencia). Si el llamador no trajo uno se fabrica aqui: primero
      // el hash de la transaccion —estable ante reintentos, el mismo reporte
      // dos veces no cuenta doble— y si no hay hash, uno al azar.
      .map((m) => ({ ...m, id: m.id ? String(m.id) : (m.hash ? String(m.hash) : randomUUID()) }));
    if (!lista.length) return false;
    const r = await llamar('/api/v1/movimientos', {
      metodo: 'POST',
      cuerpo: { gid: gid.trim(), movimientos: lista },
    });
    return r.ok === true;
  } catch (e) {
    console.error(`[genesis] el reporte AML no se pudo mandar: ${e.message}`);
    return false;
  }
}

// Dos nombres por funcion, a proposito: el diseño habla de tamiz() y
// movimientos(), y los controllers ya escritos llaman tamizDireccion() y
// reportarMovimiento(). Un alias no cuesta nada, y un require que no encuentra
// su funcion cierra los retiros enteros (fail-closed del controller) por un
// desacuerdo de nombres que nadie eligio tener.
module.exports = {
  verificarSso,
  gid,
  tamizDireccion,
  tamiz: tamizDireccion,
  reportarMovimiento,
  movimientos: reportarMovimiento,
};
