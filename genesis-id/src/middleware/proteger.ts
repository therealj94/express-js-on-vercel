// Guardias de las rutas.
//
// Hay dos formas de identificarse ante Genesis ID y no se mezclan:
//
//   - Un OPERADOR, con sesión abierta desde el panel. Puede decidir sobre
//     identidades. Se comprueba con `exigeOperador` y `exigePermiso`.
//   - Una APLICACION del ecosistema, con su clave de API. Puede pedir lo que
//     esté en sus alcances y nada más. Se comprueba con `exigeApp`.
//
// Una aplicación NUNCA puede aprobar una identidad, por mucho que tenga una
// clave válida. Aprobar es un acto humano y exige sesión de operador con el
// permiso correspondiente.

import type { Request, Response, NextFunction } from 'express'
import { operadorDeSesion, puede } from '../auth/operadores.js'
import { aplicacionDeClave } from '../auth/aplicaciones.js'
import type { Operador, Aplicacion } from '../types.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      operador?: Operador
      app_ecosistema?: Aplicacion
    }
  }
}

function tokenDe(req: Request): string {
  const cabecera = String(req.headers.authorization || '')
  if (cabecera.startsWith('Bearer ')) return cabecera.slice(7).trim()
  return String(req.headers['x-genesis-sesion'] || '').trim()
}

export function exigeOperador(req: Request, res: Response, siguiente: NextFunction) {
  const operador = operadorDeSesion(tokenDe(req))
  if (!operador) {
    return res.status(401).json({ error: 'Hace falta una sesión de operador' })
  }
  req.operador = operador
  siguiente()
}

export function exigePermiso(permiso: string) {
  return (req: Request, res: Response, siguiente: NextFunction) => {
    const operador = req.operador ?? operadorDeSesion(tokenDe(req))
    if (!operador) {
      return res.status(401).json({ error: 'Hace falta una sesión de operador' })
    }
    if (!puede(operador.rol, permiso)) {
      return res.status(403).json({
        error: `El rol "${operador.rol}" no tiene el permiso "${permiso}"`,
      })
    }
    req.operador = operador
    siguiente()
  }
}

export function exigeApp(...alcances: string[]) {
  return (req: Request, res: Response, siguiente: NextFunction) => {
    const clave = String(req.headers['x-api-key'] || '').trim()
    const app = aplicacionDeClave(clave)
    if (!app) {
      return res.status(401).json({ error: 'Clave de API inválida o revocada' })
    }
    const falta = alcances.find((a) => !app.alcances.includes(a))
    if (falta) {
      return res.status(403).json({
        error: `La aplicación "${app.clave}" no tiene el alcance "${falta}"`,
      })
    }
    req.app_ecosistema = app
    siguiente()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Límite de peticiones
// ─────────────────────────────────────────────────────────────────────────────

const cubos = new Map<string, { fichas: number; ultimo: number }>()

/**
 * Cubo con goteo, por IP.
 *
 * Sin esto, las rutas de entrada y de consulta de GID quedan expuestas a
 * fuerza bruta y a barridos: un GID son 8 caracteres, y sin límite alguien
 * puede recorrer el espacio buscando identidades verificadas.
 */
export function limite(porMinuto: number) {
  const relleno = porMinuto / 60000
  return (req: Request, res: Response, siguiente: NextFunction) => {
    /* EL LIMITE VA EN LA LLAVE, y no es un detalle: sin él, todas las rutas de
       un mismo router comparten cubo —la llave era solo IP + router— y el cubo
       se queda con el tope de la ÚLTIMA que lo tocó. En la práctica eso
       significaba que `/identidades`, declarada a 60 por minuto, se recortaba
       sola a 20 en cuanto alguien subía una foto, porque `/foto` está a 20.
       Un límite que dice 60 y aplica 20 no protege mejor: engaña a quien lee
       el código y echa a gente que no estaba abusando de nada. */
    const llave = `${req.ip}|${req.baseUrl}|${porMinuto}`
    const ahora = Date.now()
    const cubo = cubos.get(llave) ?? { fichas: porMinuto, ultimo: ahora }
    cubo.fichas = Math.min(porMinuto, cubo.fichas + (ahora - cubo.ultimo) * relleno)
    cubo.ultimo = ahora

    if (cubo.fichas < 1) {
      cubos.set(llave, cubo)
      res.setHeader('Retry-After', '60')
      return res.status(429).json({ error: 'Demasiadas peticiones. Espere un momento.' })
    }
    cubo.fichas -= 1
    cubos.set(llave, cubo)
    siguiente()
  }
}

// El mapa se vacía cada tanto para que no crezca sin fin.
setInterval(() => {
  const limiteTiempo = Date.now() - 600000
  for (const [k, v] of cubos) if (v.ultimo < limiteTiempo) cubos.delete(k)
}, 300000).unref?.()
