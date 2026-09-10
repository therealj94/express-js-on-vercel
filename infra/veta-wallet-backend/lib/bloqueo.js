// ¿Le cerraron el acceso a esta persona en Genesis ID?
//
// ══════════════════════════════════════════════════════════════════════════
// LA BILLETERA ES LA QUE MÁS IMPORTA, Y LA QUE MÁS CUESTA
//
// Aquí está el dinero de la gente y aquí está casi todo el padrón. Si el
// bloqueo del ecosistema no llega hasta esta casa, no llega a ninguna parte:
// «bloqueado» querría decir «no puede entrar a la casa de cambio», que no es
// lo que nadie entiende al apretar ese botón.
//
// SE PREGUNTA POR EL CORREO, no por el GID, y no es una elección: esta casa no
// guarda el GID en el usuario. Se lo pide a Genesis por correo cada vez que lo
// necesita (lib/genesisPuente.js), así que el correo ES el identificador que
// une las dos bases. Es el mismo camino que usa el SSO para juntar la cuenta
// de aquí con la identidad de allá.
//
// Si el correo no está en Genesis, se deja pasar: esa persona no está en el
// padrón del ecosistema y bloquearla no es algo que Genesis pueda decidir.
// Mucha gente usa la billetera sin haber terminado nunca su verificación.
//
// ══════════════════════════════════════════════════════════════════════════
// LO QUE SE BLOQUEA Y LO QUE NO
//
// Se bloquea OPERAR: entrar, mandar, cobrar, cambiar. Todo lo que pasa por
// verifyToken.
//
// NO se toca la semilla. La billetera es custodia de la persona y su material
// cifrado sigue donde estaba; un bloqueo es de la empresa y de sus servicios,
// no una confiscación. Quien esté bloqueado y quiera su dinero se resuelve
// hablando, no borrándole la llave — y esa distinción es la diferencia entre
// una medida disciplinaria y quedarse con lo ajeno.
//
// ══════════════════════════════════════════════════════════════════════════
// QUÉ SE HACE SI GENESIS NO CONTESTA
//
// Lo mismo que en las otras tres casas, y aquí con más motivo: cerrar la
// billetera entera porque Genesis tenga un mal día sería dejar a todo el mundo
// sin su dinero por un problema que no es de nadie. Se usa la última respuesta
// buena mientras no pase de la ventana ciega, en los DOS sentidos — un
// bloqueado tampoco se desbloquea porque Genesis se caiga— y pasado eso no se
// opera.

const BASE = (process.env.GENESIS_URL || 'https://genesis-id.onrender.com').replace(/\/$/, '');

/** Cuánto se recuerda una respuesta buena antes de volver a preguntar. */
const MEMORIA_MS = Number(process.env.VW_BLOQUEO_MEMORIA_MS || 60000);
/** Cuánto se aguanta sin respuesta fresca antes de dejar de operar. */
const VENTANA_CIEGA_MS = Number(process.env.VW_BLOQUEO_CIEGO_MS || 900000);

export const RESPUESTA = {
  message: 'Tu acceso está bloqueado. Escribinos y lo vemos: wa.me/50432136457',
  code: 'acceso-bloqueado',
};
export const SIN_SABER = {
  message: 'No pudimos comprobar tu acceso ahora mismo. Probá en un rato.',
  code: 'acceso-sin-comprobar',
};

// correo -> { bloqueado, cuando, avisado }
const memoria = new Map();

/** Le pregunta a Genesis por el correo. Distingue «dijo que no» de «no dijo». */
async function preguntar(email) {
  const clave = (process.env.GENESIS_API_KEY || '').trim();
  // Sin clave no se puede preguntar. NO se cierra la billetera por eso: es un
  // fallo NUESTRO de configuración, y dejar a todo el mundo fuera por una
  // variable que falta sería peor que el problema. Se canta y se sigue.
  if (!clave) return { ok: false, error: 'GENESIS_API_KEY no está configurada' };

  const control = new AbortController();
  // Ocho segundos y no veinticinco: esto va en el camino de CADA petición de
  // la billetera. Un Genesis lento no puede volver lenta la app entera; si no
  // contesta en ocho segundos, se tira de lo último que dijo.
  const temporizador = setTimeout(() => control.abort(), 8000);
  try {
    const r = await fetch(`${BASE}/api/v1/identidades/por-email/${encodeURIComponent(email)}`, {
      signal: control.signal,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': clave },
    });
    // 404 = no hay identidad en Genesis. No es un fallo: es una respuesta, y
    // quiere decir que no hay a quién bloquear.
    if (r.status === 404) return { ok: true, bloqueado: false };
    if (!r.ok) return { ok: false, error: `Genesis respondió ${r.status}` };
    const cuerpo = await r.json().catch(() => ({}));
    const i = cuerpo?.identidad;
    if (!i) return { ok: true, bloqueado: false };
    return { ok: true, bloqueado: i.bloqueada === true };
  } catch (e) {
    return { ok: false, error: e?.name === 'AbortError' ? 'Genesis no respondió a tiempo' : 'no se pudo contactar con Genesis' };
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * ¿Puede operar esta persona ahora mismo?
 *
 * @returns {Promise<{puede:boolean, respuesta?:object}>}
 */
export async function puedeOperar(email, { ahora = Date.now(), frescura = MEMORIA_MS } = {}) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return { puede: true }; // sin correo no hay a quién preguntar por

  const guardado = memoria.get(e);
  if (guardado && ahora - guardado.cuando < frescura) {
    return guardado.bloqueado ? { puede: false, respuesta: RESPUESTA } : { puede: true };
  }

  const r = await preguntar(e);
  if (r.ok) {
    memoria.set(e, { bloqueado: r.bloqueado, cuando: ahora, avisado: false });
    if (r.bloqueado) {
      console.log(`[bloqueo] ${e} está bloqueado en Genesis: no opera`);
      return { puede: false, respuesta: RESPUESTA };
    }
    return { puede: true };
  }

  if (guardado) {
    const edad = ahora - guardado.cuando;
    if (edad < VENTANA_CIEGA_MS) {
      if (!guardado.avisado) {
        console.error(`[bloqueo] Genesis no contesta (${r.error}): se usa lo último que dijo de ${e}, de hace ${Math.round(edad / 1000)}s`);
        guardado.avisado = true;
      }
      return guardado.bloqueado ? { puede: false, respuesta: RESPUESTA } : { puede: true };
    }
    console.error(`[bloqueo] Genesis lleva ${Math.round(edad / 60000)} min sin contestar por ${e}: se deja de operar`);
    return { puede: false, respuesta: SIN_SABER };
  }

  console.error(`[bloqueo] Genesis no contesta (${r.error}) y no hay nada guardado de ${e}: se deja pasar esta vez`);
  return { puede: true };
}

/** Para el panel: a cuánta gente se le está diciendo que no. */
export function estado() {
  let bloqueados = 0;
  for (const v of memoria.values()) if (v.bloqueado) bloqueados += 1;
  return { recordados: memoria.size, bloqueados, memoriaMs: MEMORIA_MS, ventanaCiegaMs: VENTANA_CIEGA_MS };
}

export const _adentro = { memoria, olvidar: () => memoria.clear(), preguntar, MEMORIA_MS, VENTANA_CIEGA_MS };
