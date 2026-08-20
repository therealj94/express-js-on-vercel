import type { NextFunction, Request, Response } from 'express'
import { verifyToken } from '../lib/auth.js'
import { db } from '../lib/db.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

// Los dos son ASINCRONOS desde que el almacen es una base de datos: comprobar
// que el usuario del token siga existiendo es una consulta, no una lectura de
// un Map. Sin el `await` la comprobacion devolvia una promesa —siempre
// verdadera— y CUALQUIER token bien firmado pasaba, incluso el de una cuenta ya
// borrada.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  const userId = token ? verifyToken(token) : null
  if (!userId || !(await db.findUserById(userId))) {
    res.status(401).json({ error: 'No autorizado' })
    return
  }
  req.userId = userId
  next()
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  const userId = token ? verifyToken(token) : null
  if (userId && (await db.findUserById(userId))) {
    req.userId = userId
  }
  next()
}
