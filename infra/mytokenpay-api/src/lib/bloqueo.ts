// ¿Le cerraron el acceso a esta persona en Genesis ID?
//
// ─────────────────────────────────────────────────────────────────────────────
// AQUÍ EL AGUJERO ERA EL MÁS GRANDE DE LAS TRES CASAS
//
// MyTokenPay firma un token de TREINTA DÍAS, sin refresco y sin `tokenVersion`.
// O sea que no tenía ningún interruptor de revocación: una vez emitido, ese
// token valía un mes hiciera lo que hiciera cualquiera. Un bloqueo en Genesis
// no lo tocaba.
//
// Como no hay refresco donde volver a preguntar, la ÚNICA comprobación posible
// es la de cada petición. Por eso aquí la memoria corta no es una optimización:
// es lo único que hay entre el botón de bloquear y la puerta.
//
// ─────────────────────────────────────────────────────────────────────────────
// DOS FORMAS DE PREGUNTAR, PORQUE HAY DOS CLASES DE CUENTA
//
// MyTokenPay tiene su propio registro con correo y contraseña, así que no toda
// cuenta viene de Genesis:
//
//   · Con GID — entró por el SSO. Se pregunta por su GID, que es la identidad.
//   · Sin GID — se registró con su correo aquí. Se pregunta POR EL CORREO, que
//     es lo mismo que usa el SSO para juntar las dos cuentas de una persona.
//
// Sin la segunda, bastaría con no haber usado nunca el SSO para que el bloqueo
// no llegara — y son justamente las cuentas de las que menos se sabe. Un
// bloqueo que solo alcanza a quien pasó por la puerta principal no es un
// bloqueo.
//
// Si el correo tampoco existe en Genesis, no hay nada que preguntar y se deja
// pasar: esa persona no está en el padrón del ecosistema y bloquearla no es
// algo que Genesis pueda decidir.
//
// ─────────────────────────────────────────────────────────────────────────────
// QUÉ SE HACE SI GENESIS NO CONTESTA
//
// Lo mismo que en Ordenex y AuCorp, y por lo mismo: ni fail-open a secas —que
// deja entrar a un bloqueado con solo esperar a que Genesis tenga un mal día—
// ni fail-closed a secas —que tumba MyTokenPay cada vez que Genesis tosa—. Se
// usa la última respuesta buena mientras no pase de la ventana ciega, en los
// DOS sentidos: un bloqueado tampoco se desbloquea porque Genesis se caiga.

import { llamarGenesis, identidadPorEmail } from './genesis.js'

/** Cuánto se recuerda una respuesta buena antes de volver a preguntar. */
const MEMORIA_MS = Number(process.env.MTP_BLOQUEO_MEMORIA_MS || 60_000)
/** Cuánto se aguanta sin respuesta fresca antes de dejar de operar. */
const VENTANA_CIEGA_MS = Number(process.env.MTP_BLOQUEO_CIEGO_MS || 900_000)

export const RESPUESTA = {
  error: 'Tu acceso está bloqueado. Escribinos si creés que es un error.',
  codigo: 'ACCESO_BLOQUEADO',
}
export const SIN_SABER = {
  error: 'No se pudo comprobar tu acceso ahora mismo. Probá en un rato.',
  codigo: 'NO_SE_PUDO_COMPROBAR',
}

interface Recordado { bloqueado: boolean; cuando: number; avisado: boolean }
const memoria = new Map<string, Recordado>()

/** Le pregunta a Genesis por el GID. Trueca «no contestó» en `ok: false`. */
async function porGid(gid: string): Promise<{ ok: boolean; bloqueado?: boolean; error?: string }> {
  const r = await llamarGenesis(`/api/v1/gid/${encodeURIComponent(gid)}`)
  if (!r.ok) return { ok: false, error: r.cuerpo?.error || `Genesis respondió ${r.estado}` }
  // `bloqueada` es el campo nuevo. Si un Genesis viejo no lo trae, se cae a
  // `verificada`: para esta casa, quien dejó de estar verificado no opera
  // igual. De más y no de menos.
  return { ok: true, bloqueado: r.cuerpo?.bloqueada === true || r.cuerpo?.verificada === false }
}

/** Le pregunta por el correo, para las cuentas que nunca pasaron por el SSO. */
async function porEmail(email: string): Promise<{ ok: boolean; bloqueado?: boolean; error?: string }> {
  try {
    const i = await identidadPorEmail(email)
    // Sin identidad en Genesis no hay a quién bloquear: esa persona no está en
    // el padrón del ecosistema, y eso no es un fallo que haya que cantar.
    if (!i) return { ok: true, bloqueado: false }
    return { ok: true, bloqueado: i.bloqueada === true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'no se pudo preguntar' }
  }
}

export interface Permiso {
  puede: boolean
  respuesta?: typeof RESPUESTA | typeof SIN_SABER
}

/**
 * ¿Puede operar esta persona ahora mismo?
 *
 * `gid` manda sobre `email`: es la identidad de verdad. El correo es el camino
 * de respaldo para las cuentas que nunca entraron por el SSO.
 */
export async function puedeOperar(
  usuario: { gid?: string | null; email?: string | null },
  { ahora = Date.now(), frescura = MEMORIA_MS }: { ahora?: number; frescura?: number } = {},
): Promise<Permiso> {
  const clave = usuario?.gid ? `gid:${usuario.gid}` : usuario?.email ? `mail:${String(usuario.email).toLowerCase()}` : null
  if (!clave) return { puede: true } // ni gid ni correo: no hay a quién preguntar por

  const guardado = memoria.get(clave)
  if (guardado && ahora - guardado.cuando < frescura) {
    return guardado.bloqueado ? { puede: false, respuesta: RESPUESTA } : { puede: true }
  }

  const r = usuario.gid ? await porGid(usuario.gid) : await porEmail(String(usuario.email))
  if (r.ok) {
    memoria.set(clave, { bloqueado: Boolean(r.bloqueado), cuando: ahora, avisado: false })
    if (r.bloqueado) {
      console.log(`[bloqueo] ${clave} está bloqueado en Genesis: no opera`)
      return { puede: false, respuesta: RESPUESTA }
    }
    return { puede: true }
  }

  if (guardado) {
    const edad = ahora - guardado.cuando
    if (edad < VENTANA_CIEGA_MS) {
      if (!guardado.avisado) {
        console.error(`[bloqueo] Genesis no contesta (${r.error}): se usa lo último que dijo de ${clave}, de hace ${Math.round(edad / 1000)}s`)
        guardado.avisado = true
      }
      return guardado.bloqueado ? { puede: false, respuesta: RESPUESTA } : { puede: true }
    }
    console.error(`[bloqueo] Genesis lleva ${Math.round(edad / 60000)} min sin contestar por ${clave}: se deja de operar`)
    return { puede: false, respuesta: SIN_SABER }
  }

  // Nunca se supo de esta persona y Genesis está caído. Se deja pasar y se
  // canta: cerrar aquí sería negarle la app a todo el mundo por una caída de
  // otro servicio.
  console.error(`[bloqueo] Genesis no contesta (${r.error}) y no hay nada guardado de ${clave}: se deja pasar esta vez`)
  return { puede: true }
}

/** Para el panel: a cuánta gente se le está diciendo que no. */
export function estado() {
  let bloqueados = 0
  for (const v of memoria.values()) if (v.bloqueado) bloqueados += 1
  return { recordados: memoria.size, bloqueados, memoriaMs: MEMORIA_MS, ventanaCiegaMs: VENTANA_CIEGA_MS }
}

export const _adentro = { memoria, olvidar: () => memoria.clear(), porGid, porEmail, MEMORIA_MS, VENTANA_CIEGA_MS }
