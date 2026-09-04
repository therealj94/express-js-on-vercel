// ¿Le cerraron el acceso a esta persona en Genesis ID?
//
// ══════════════════════════════════════════════════════════════════════════
// EL AGUJERO QUE ESTO TAPA
//
// Genesis ID tiene un botón para bloquear a alguien en todo el ecosistema, y
// cierra sus puertas al instante: no emite pase nuevo, invalida el que ya
// había, y deja de decir que la persona está verificada.
//
// Pero AuCorp NO vive de ese pase. El pase se usa UNA vez, en /auth/sso, y a
// partir de ahí esta casa emite su propia sesión. O sea que un bloqueo en
// Genesis no tocaba nada de aquí:
//
//   · el token de acceso seguía valiendo sus 40 minutos, y
//   · el refresh seguía canjeándose durante TREINTA DÍAS sin volver a
//     preguntarle nada a Genesis.
//
// Treinta días de acceso después de que alguien apretara «bloquear» no es un
// bloqueo. Es un aviso.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS DOS COMPROBACIONES, Y POR QUÉ SON DISTINTAS
//
// EN CADA PETICIÓN (middleware/sesion.js) se pregunta con memoria corta. Sin
// memoria, cada llamada de cada persona sería una llamada a Genesis: AuCorp
// dejaría de funcionar cada vez que Genesis tosa, y Genesis recibiría el
// tráfico de AuCorp entero. Con un minuto de memoria, el peor caso es que
// alguien recién bloqueado aguante un minuto más.
//
// AL CANJEAR EL REFRESH (controllers/authController.js) se pregunta SIEMPRE,
// sin memoria. Es lo que convierte treinta días en cuarenta minutos, pasa
// una vez cada cuarenta minutos por persona, y es el momento exacto en que
// esta casa decide alargarle la sesión a alguien: preguntar ahí es barato y
// es donde más vale.
//
// ══════════════════════════════════════════════════════════════════════════
// QUÉ SE HACE SI GENESIS NO CONTESTA
//
// Ni fail-open a secas ni fail-closed a secas: las dos están mal aquí.
//
//   Fail-closed en cada petición = Genesis se cae y AuCorp se cae con él,
//   para todo el mundo, por un problema que no es de nadie que esté operando.
//
//   Fail-open sin límite = alguien bloqueado entra indefinidamente con solo
//   esperar a que Genesis tenga un mal día.
//
// Lo que se hace es FAIL-OPEN CON CADUCIDAD: se sigue usando la última
// respuesta buena mientras no pase de VENTANA_CIEGA_MS. Pasado eso, sin
// respuesta fresca, no se opera. Quince minutos es corto para un bloqueo y
// largo para cualquier caída de Genesis que se arregle sola.
//
// Y si Genesis nunca contestó de esta persona, se deja pasar y se canta: para
// tener sesión, tuvo que entrar por /auth/sso hace poco, y ese camino SÍ pasó
// por Genesis.

const genesis = require('./genesis');

/** Cuánto se recuerda una respuesta buena antes de volver a preguntar. */
const MEMORIA_MS = Number(process.env.AUCORP_BLOQUEO_MEMORIA_MS || 60_000);
/** Cuánto se aguanta sin respuesta fresca antes de dejar de operar. */
const VENTANA_CIEGA_MS = Number(process.env.AUCORP_BLOQUEO_CIEGO_MS || 900_000);

const RESPUESTA = {
  error: 'Tu acceso está bloqueado. Escribinos si creés que es un error.',
  codigo: 'ACCESO_BLOQUEADO',
};
const SIN_SABER = {
  error: 'No se pudo comprobar tu acceso ahora mismo. Probá en un rato.',
  codigo: 'NO_SE_PUDO_COMPROBAR',
};

// gid -> { bloqueado, cuando, avisado }
const memoria = new Map();

/**
 * Le pregunta a Genesis, sin memoria.
 *
 * @returns {Promise<{ok:boolean, bloqueado?:boolean, error?:string}>}
 */
async function preguntar(gid) {
  try {
    const r = await genesis.gid(String(gid));
    // `bloqueada` es el campo nuevo. Si un Genesis viejo no lo trae, se cae a
    // `verificada`: para esta casa, alguien que dejó de estar verificado no
    // opera igual. Se prefiere de más a de menos.
    const bloqueado = r?.bloqueada === true || r?.verificada === false;
    return { ok: true, bloqueado };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * ¿Puede operar este GID ahora mismo?
 *
 * @returns {Promise<{puede:boolean, respuesta?:object, motivo?:string}>}
 *   `respuesta` es lo que se le contesta al cliente cuando no puede.
 */
async function puedeOperar(gid, { ahora = Date.now(), frescura = MEMORIA_MS } = {}) {
  if (!gid) return { puede: true }; // sin gid no hay a quién preguntar por

  const g = String(gid);
  const guardado = memoria.get(g);
  if (guardado && ahora - guardado.cuando < frescura) {
    return guardado.bloqueado ? { puede: false, respuesta: RESPUESTA } : { puede: true };
  }

  const r = await preguntar(g);
  if (r.ok) {
    memoria.set(g, { bloqueado: r.bloqueado, cuando: ahora, avisado: false });
    if (r.bloqueado) {
      console.log(`[bloqueo] ${g} está bloqueado en Genesis: no opera`);
      return { puede: false, respuesta: RESPUESTA };
    }
    return { puede: true };
  }

  // Genesis no contestó. Se tira de la última respuesta buena mientras no se
  // pase de la ventana ciega.
  if (guardado) {
    const edad = ahora - guardado.cuando;
    if (edad < VENTANA_CIEGA_MS) {
      if (!guardado.avisado) {
        console.error(`[bloqueo] Genesis no contesta (${r.error}): se usa lo último que dijo de ${g}, de hace ${Math.round(edad / 1000)}s`);
        guardado.avisado = true;
      }
      return guardado.bloqueado ? { puede: false, respuesta: RESPUESTA } : { puede: true };
    }
    console.error(`[bloqueo] Genesis lleva ${Math.round(edad / 60000)} min sin contestar por ${g}: se deja de operar`);
    return { puede: false, respuesta: SIN_SABER, motivo: r.error };
  }

  // Nunca se supo de esta persona. Tuvo que entrar por /auth/sso hace poco, y
  // ese camino sí pasó por Genesis, así que se deja pasar — pero se canta.
  console.error(`[bloqueo] Genesis no contesta (${r.error}) y no hay nada guardado de ${g}: se deja pasar esta vez`);
  return { puede: true };
}

/** Lo mismo pero SIN memoria: para el canje del refresh. */
const puedeOperarAhora = (gid) => puedeOperar(gid, { frescura: 0 });

/** Para el panel: a cuánta gente se le está diciendo que no. */
function estado() {
  let bloqueados = 0;
  for (const v of memoria.values()) if (v.bloqueado) bloqueados += 1;
  return { recordados: memoria.size, bloqueados, memoriaMs: MEMORIA_MS, ventanaCiegaMs: VENTANA_CIEGA_MS };
}

const olvidar = () => memoria.clear();

module.exports = {
  puedeOperar, puedeOperarAhora, estado, RESPUESTA, SIN_SABER,
  _adentro: { memoria, olvidar, preguntar, MEMORIA_MS, VENTANA_CIEGA_MS },
};
