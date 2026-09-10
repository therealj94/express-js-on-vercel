// El cliente de Genesis ID de ULTRON.
//
// ULTRON es una app del ecosistema como Ordenex o AuCorp: habla con Genesis
// con SU propia clave (X-API-Key, GENESIS_API_KEY — el alta de la app `ultron`
// en APPS_ECOSISTEMA), y esa clave vive SOLO en este servidor. Nunca baja al
// navegador.
//
// Y solo hace UNA pregunta, que es todo lo que la puerta necesita: «este pase
// que me traen, ¿es de verdad, y de quién?». Ni tamiz, ni movimientos, ni
// vínculos: ULTRON no mueve dinero ni tiene cuentas que atar.
//
// FAIL-CLOSED. Genesis es quien dice si un pase vale; cuando no contesta, la
// respuesta NO se adivina — verificarSso truena y la puerta no se abre. Un
// «entra, va, seguro que sí» en la consola de la junta directiva es
// exactamente el fallo que no se puede permitir.
//
// LA CLAVE NO ES OBLIGATORIA. Sin GENESIS_API_KEY este archivo dice
// `configurado() === false` y la puerta ni siquiera enseña el botón: se entra
// con correo y clave, como siempre. El SSO SUMA una forma de entrar, no
// reemplaza la que hay — si Genesis se cae un martes, la junta sigue entrando.

// La base y la clave se leen EN CADA llamada, no al cargar el módulo: las
// pruebas levantan un Genesis fingido y fijan GENESIS_URL después de que los
// require ya corrieron; leerla al importar clavaría la de producción y el
// fingido no recibiría ni una llamada.
const base = () => (process.env.GENESIS_URL || process.env.GENESIS_API || 'https://genesis-id.onrender.com').replace(/\/$/, '');
const clave = () => (process.env.GENESIS_API_KEY || '').trim();

/** ¿Se puede preguntar? Sin clave no hay SSO, y se dice en vez de fingirlo. */
const configurado = () => Boolean(clave());

/* ── DÓNDE SE SACA EL PASE ───────────────────────────────────────────────────
 * Verificar un pase y REPARTIRLO son dos cosas distintas y las hace gente
 * distinta: la clave de API (`GENESIS_API_KEY`) sirve para preguntarle a
 * Genesis «¿este pase es de verdad?», pero para que la persona TENGA un pase
 * hay que mandarla a la wallet, que es quien se lo pide a Genesis y la
 * devuelve acá con él en el hash.
 *
 * Esa dirección no se adivina: se pone en `GENESIS_SSO_URL`. Sin ella el botón
 * de la wallet no se enseña, y no porque falte una clave —que es lo que decía
 * antes, y era mentira— sino porque no hay a dónde mandar a nadie. Enseñar un
 * botón que manda un pase VACÍO y contesta «falta el pase» es peor que no
 * tener botón: la persona cree que se rompió algo suyo.
 */
const dondeSacarElPase = () => (process.env.GENESIS_SSO_URL || '').trim();

// Genesis vive en Render y un arranque frío tarda: cortar a los pocos segundos
// convertiría el primer ingreso de la mañana en un fallo. Es el mismo plazo
// que usan Ordenex y AuCorp contra el mismo servidor.
const PLAZO_MS = 25000;

async function llamar(ruta, { metodo = 'GET', cuerpo } = {}) {
  if (!configurado()) throw new Error('GENESIS_API_KEY no está configurada en este servidor');
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
      ? `Genesis no respondió en ${PLAZO_MS}ms`
      : `no se pudo contactar con Genesis: ${e.message}`);
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * POST /api/v1/sso/verificar — ¿este pase es de verdad?
 *
 * Devuelve { valido, gid, perfil }. Los dos «no» de Genesis se distinguen de
 * sus tropiezos: un 401 (pase inválido o vencido) o un 403 (la identidad dejó
 * de estar verificada, o la bloquearon después de emitirlo) son un NO legítimo
 * y salen como { valido: false } — la puerta contesta 401 y la persona saca
 * otro pase. Cualquier otra cosa TRUENA: eso es «no se pudo comprobar», la
 * puerta contesta 503, y mandar a alguien a re-loguearse contra algo roto no
 * arregla nada.
 */
async function verificarSso(token) {
  const r = await llamar('/api/v1/sso/verificar', { metodo: 'POST', cuerpo: { token } });
  if (r.estado === 401 || r.estado === 403) return { valido: false };
  if (!r.ok) throw new Error(`Genesis respondió ${r.estado} al verificar el pase`);
  if (r.cuerpo?.valido !== true || typeof r.cuerpo.gid !== 'string' || !r.cuerpo.gid) {
    // Un 200 sin `valido: true` o sin gid no es un sí a medias: es un no.
    return { valido: false };
  }
  return { valido: true, gid: r.cuerpo.gid, perfil: r.cuerpo.perfil || null };
}

module.exports = { configurado, dondeSacarElPase, verificarSso, _adentro: { base, clave, PLAZO_MS } };
