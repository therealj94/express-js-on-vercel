// Dar de alta a una persona en el padrón sin que su app tenga que hacer nada.
//
// EL PROBLEMA
//
// El padrón exige la clave SECRETA de la app, y con razón: son datos
// personales y quien pueda escribir ahí puede meter gente que no existe. Pero
// esa clave no puede vivir en un navegador ni en un APK, así que el padrón
// dependía de que el backend de cada app lo mandara — y mientras ese backend
// no se toque, el panel enseña conexiones sin nombre y sin billetera.
//
// LA SALIDA, SIN REGALARLE NADA A NADIE
//
// El cliente ya tiene algo que no puede falsificar: el JWT que le firmó SU
// PROPIO backend al iniciar sesión. Genesis ID no necesita el secreto con el
// que se firmó, ni verificarlo por su cuenta: le basta con preguntarle al
// backend que lo emitió. Se llama a una ruta suya que exige sesión con ese
// token —cualquiera sirve— y se mira si contesta.
//
//   · 401 → el token no vale. Se rechaza y no se escribe nada.
//   · 200 → el token es auténtico, y lo dice quien lo firmó.
//
// Por qué esto no se puede falsificar: para cambiar a quién dice pertenecer un
// JWT hay que tocar su contenido, y al tocarlo se rompe la firma. El backend lo
// rechazaría. Así que «el backend acepta este token» más «dentro pone Fulano»
// solo pueden darse a la vez si el token es de verdad de Fulano.
//
// LO QUE SE ESCRIBE, Y LO QUE NO SE CREE
//
// La identidad sale del contenido del token, nunca de lo que el cliente diga
// aparte. Alguien con una cuenta real solo puede dar de alta SU propia fila:
// no puede inventar personas ni tocar la de otro, porque la clave de la fila
// es el identificador que va dentro del token.
//
// Si el token no trae el correo, se acepta el que mande el cliente pero se
// marca como sin confirmar. Es lo único que no viene firmado, y el panel tiene
// que poder distinguirlo — un correo equivocado en una revisión de
// cumplimiento no es un detalle.

import { sincronizar } from './padron.js'

/** A qué ruta se le pregunta por cada app, y cuánto se espera. */
const VERIFICADORES: Record<string, { url: string; ruta: string }> = {
  'veta-wallet': {
    url: process.env.GENESIS_VETA_URL || 'https://vetawallet-1a2e38ac52b1.herokuapp.com',
    // Cualquier ruta que exija sesión sirve; esta no cambia nada, solo lee.
    ruta: process.env.GENESIS_VETA_RUTA_VERIFICA || '/wallet/deposit-info',
  },
}

const TIEMPO_MS = Number(process.env.GENESIS_VERIFICA_TIMEOUT_MS || 12000)

export const sePuedeConfirmar = (app: string) => Boolean(VERIFICADORES[app])

/** El contenido de un JWT, sin comprobar la firma — de eso se encarga su emisor. */
function contenidoDe(token: string): Record<string, any> | null {
  try {
    const partes = token.split('.')
    if (partes.length !== 3) return null
    const crudo = Buffer.from(partes[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const o = JSON.parse(crudo)
    return o && typeof o === 'object' ? o : null
  } catch {
    return null
  }
}

/**
 * El identificador de la persona dentro de su app.
 *
 * TIENE que dar el mismo valor que el que manda la telemetría, o la huella no
 * cuadra y la conexión sigue saliendo «fuera del padrón». Los dos clientes
 * calculan esto sobre el mismo token, así que coinciden por construcción.
 */
export function idDelToken(c: Record<string, any>): string | null {
  const bruto = c.idExterno ?? c._id ?? c.id ?? c.sub ?? c.userId ?? c.uid ?? c.email
  return bruto ? String(bruto) : null
}

const texto = (v: unknown, max = 160): string | undefined => {
  const s = v === undefined || v === null ? '' : String(v).trim()
  return s ? s.slice(0, max) : undefined
}

export interface ResultadoConfirmacion {
  ok: boolean
  motivo?: string
  /** 401 cuando el token no vale; 502 cuando el backend de la app no responde. */
  estado?: number
  idExterno?: string
  emailConfirmado?: boolean
}

/**
 * Comprueba el token contra el backend de la app y, si vale, da de alta a esa
 * persona en el padrón.
 *
 * @param declarado lo que el cliente dice de sí mismo. Solo se usa para
 *   rellenar lo que el token no traiga, y queda marcado como no confirmado.
 */
export async function confirmarPersona(
  app: string,
  token: string,
  declarado: { email?: unknown; nombre?: unknown; direccionWallet?: unknown; pais?: unknown } = {},
): Promise<ResultadoConfirmacion> {
  const v = VERIFICADORES[app]
  if (!v) return { ok: false, motivo: `No hay forma de verificar a ${app}`, estado: 400 }
  if (!token || typeof token !== 'string' || token.length > 4000) {
    return { ok: false, motivo: 'Falta el token de sesión', estado: 400 }
  }

  const contenido = contenidoDe(token)
  if (!contenido) return { ok: false, motivo: 'El token no tiene forma de JWT', estado: 400 }

  const idExterno = idDelToken(contenido)
  if (!idExterno) {
    return { ok: false, motivo: 'El token no dice a quién pertenece', estado: 400 }
  }

  // ── La única pregunta que importa: ¿lo acepta quien lo firmó? ──────────────
  const corte = new AbortController()
  const reloj = setTimeout(() => corte.abort(), TIEMPO_MS)
  let respuesta: Response
  try {
    respuesta = await fetch(`${v.url.replace(/\/$/, '')}${v.ruta}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: corte.signal,
    })
  } catch (e: any) {
    // Que el backend de la app esté caído NO puede colar a nadie: sin un sí
    // explícito no se escribe. Se responde 502 para que el cliente reintente
    // más tarde en vez de darlo por hecho.
    return {
      ok: false,
      estado: 502,
      motivo: e?.name === 'AbortError'
        ? 'El backend de la aplicación no respondió a tiempo'
        : 'No se pudo consultar al backend de la aplicación',
    }
  } finally {
    clearTimeout(reloj)
  }

  if (respuesta.status === 401 || respuesta.status === 403) {
    return { ok: false, estado: 401, motivo: 'La sesión no es válida' }
  }
  if (!respuesta.ok) {
    return { ok: false, estado: 502, motivo: `El backend de la aplicación respondió ${respuesta.status}` }
  }

  // ── El token es auténtico. Se escribe SU fila, y solo la suya. ─────────────
  //
  // La dirección de la billetera se prefiere la del token: viene firmada. La
  // que manda el cliente solo se usa si el token no la trae.
  const delToken = {
    email: texto(contenido.email ?? contenido.correo),
    nombre: texto(contenido.name ?? contenido.nombre ?? contenido.fullName),
    direccionWallet: texto(contenido.address ?? contenido.wallet ?? contenido.direccion, 64),
  }

  const email = delToken.email || texto(declarado.email)
  if (!email) {
    return { ok: false, estado: 400, motivo: 'No hay correo ni en el token ni en la petición' }
  }

  const emailConfirmado = Boolean(delToken.email)

  const entrada: Record<string, unknown> = {
    idExterno,
    email,
    nombre: delToken.nombre || texto(declarado.nombre),
    direccionWallet: delToken.direccionWallet || texto(declarado.direccionWallet, 64),
    pais: texto(declarado.pais, 2)?.toUpperCase(),
    ultimoAcceso: new Date().toISOString(),
    extra: {
      // Queda escrito de dónde salió cada cosa. Un correo que puso el cliente
      // y uno que venía firmado no valen lo mismo en una revisión, y sin esta
      // marca el panel no podría distinguirlos.
      origen: 'confirmado por su propia sesión',
      correoConfirmado: emailConfirmado ? 'sí' : 'no — lo declaró el cliente',
    },
  }

  const r = await sincronizar(app, [entrada])
  if (!r.guardados) {
    return { ok: false, estado: 400, motivo: 'El padrón rechazó la entrada' }
  }
  return { ok: true, idExterno, emailConfirmado }
}
