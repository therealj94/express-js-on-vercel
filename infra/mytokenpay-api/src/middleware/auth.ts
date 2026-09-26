import type { NextFunction, Request, Response } from 'express'
import { leerSesion, sesionVigente } from '../lib/auth.js'
import { db } from '../lib/db.js'
import { puedeOperar } from '../lib/bloqueo.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string
      /**
       * El GID con que se abrió la sesión, si se abrió con un pase de Genesis
       * ID (`/api/auth/sso`). `null` en una sesión de correo y contraseña.
       */
      sesionGid?: string | null
    }
  }
}

/**
 * La puerta de MyTokenPay.
 *
 * AQUÍ SE COMPRUEBA EL BLOQUEO DEL ECOSISTEMA Y NO HAY OTRO SITIO DONDE
 * HACERLO. Esta casa firma un token de treinta días, sin refresco y sin
 * `tokenVersion`: no existe ningún otro momento en que se vuelva a mirar quién
 * es esta persona. Si el bloqueo no se comprueba en cada petición, no se
 * comprueba nunca, y alguien bloqueado sigue dentro un mes.
 *
 * Va DESPUÉS de validar el token —no se le pregunta a Genesis por una sesión
 * que ya es inválida— y ANTES de dejar entrar. Ver lib/bloqueo.js para qué
 * pasa cuando Genesis no contesta.
 *
 * Validar el token es también comprobar que sigue vigente (`sesionVigente`):
 * una sesión firmada con una contraseña que ya cambió no entra, y un token de
 * reseteo no es una sesión.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
    const sesion = token ? leerSesion(token) : null
    const userId = sesion?.sub ?? null
    const usuario = userId ? await db.findUserById(userId) : undefined
    if (!sesion || !userId || !usuario || !sesionVigente(sesion, usuario)) {
      res.status(401).json({ error: 'No autorizado' })
      return
    }
    const permiso = await puedeOperar(usuario)
    if (!permiso.puede) {
      res.status(403).json(permiso.respuesta)
      return
    }
    req.userId = userId
    req.sesionGid = sesion.gid ?? null
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Reconoce a quien viene con sesión, sin exigirla.
 *
 * También mira el bloqueo, y no por simetría: lo usan las rutas donde entrar
 * con sesión cambia lo que se ve o lo que se puede hacer. Si aquí no se
 * comprobara, una persona bloqueada seguiría siendo «alguien conocido» en esas
 * rutas — que es exactamente lo que el bloqueo quita. Sin sesión válida no se
 * le pregunta nada a Genesis: no hay a quién.
 */
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
    const sesion = token ? leerSesion(token) : null
    const userId = sesion?.sub ?? null
    const usuario = userId ? await db.findUserById(userId) : undefined
    if (sesion && userId && usuario && sesionVigente(sesion, usuario) && (await puedeOperar(usuario)).puede) {
      req.userId = userId
      req.sesionGid = sesion.gid ?? null
    }
    next()
  } catch (err) {
    next(err)
  }
}
