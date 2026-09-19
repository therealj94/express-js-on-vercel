// Guardias de las rutas.
//
// Dos formas de identificarse, que no se mezclan:
//   - un USUARIO, con el JWT de la app (`exigirSesion`, `sesionOpcional`);
//   - un OPERADOR del panel, con su sesión de operador (`exigirPanel`).
// El usuario se toma SIEMPRE de la sesión, nunca del cuerpo de la petición.

import type { Request, Response, NextFunction } from 'express'
import { leerSesion } from './cripto.js'
import * as usuarios from '../motor/usuarios.js'
import { operadorDeSesion, puede } from '../motor/operadores.js'
import type { Usuario, Operador } from '../types.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: Usuario
      operador?: Operador
      tokenPanel?: string
    }
  }
}

function tokenDe(req: Request): string {
  const cabecera = String(req.headers.authorization || '')
  return cabecera.startsWith('Bearer ') ? cabecera.slice(7).trim() : ''
}

function usuarioDe(req: Request): Usuario | null {
  const token = tokenDe(req)
  if (!token) return null
  const idUsuario = leerSesion(token)
  if (!idUsuario) return null
  const u = usuarios.porId(idUsuario)
  if (!u) return null
  usuarios.tocar(u)
  return u
}

export function exigirSesion(req: Request, res: Response, siguiente: NextFunction): void {
  const u = usuarioDe(req)
  if (!u) {
    res.status(401).json({ error: 'Hace falta iniciar sesión', codigo: 'sin-sesion' })
    return
  }
  req.usuario = u
  siguiente()
}

export function sesionOpcional(req: Request, _res: Response, siguiente: NextFunction): void {
  const u = usuarioDe(req)
  if (u) req.usuario = u
  siguiente()
}

export function exigirPanel(permiso = 'leer') {
  return (req: Request, res: Response, siguiente: NextFunction): void => {
    const token = tokenDe(req)
    const o = operadorDeSesion(token)
    if (!o) {
      res.status(401).json({ error: 'Hace falta una sesión de operador', codigo: 'sin-sesion' })
      return
    }
    if (!puede(o.rol, permiso)) {
      res.status(403).json({ error: `El rol «${o.rol}» no tiene el permiso «${permiso}»`, codigo: 'sin-permiso' })
      return
    }
    req.operador = o
    req.tokenPanel = token
    siguiente()
  }
}
