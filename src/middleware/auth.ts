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

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
    const userId = token ? verifyToken(token) : null
    if (!userId || !(await db.findUserById(userId))) {
      res.status(401).json({ error: 'No autorizado' })
      return
    }
    req.userId = userId
    next()
  } catch (err) {
    next(err)
  }
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
    const userId = token ? verifyToken(token) : null
    if (userId && (await db.findUserById(userId))) {
      req.userId = userId
    }
    next()
  } catch (err) {
    next(err)
  }
}
