// ─────────────────────────────────────────────────────────────────────────────
// Puente entre la app de MyTokenPay y Genesis ID — adaptador delgado.
//
// Este archivo ya NO tiene lógica de puente. Hasta el plan SFSP v0.3 (tarea
// 0.6) aquí había una reescritura en TypeScript del router de Veta Wallet que
// se había quedado atrás: le faltaban la foto, la vivacidad, la lectura del
// documento y las dos caras; no mandaba el correo que Genesis ID exige para
// atar la cuenta —así que `/vincular` fallaba siempre— y dejaba la dirección
// de billetera opcional. Tres puentes, tres comportamientos.
//
// Ahora el puente es UNO: `../lib/genesisPuente.js`, copia byte a byte del de
// Veta (infra/veta-wallet-backend/lib/genesisPuente.js). Lo único propio de
// MyTokenPay es cómo se sabe quién es el usuario, y eso es lo que hay aquí.
//
// Cada ruta exige la sesión propia de MyTokenPay y actúa SOLO sobre la
// identidad del usuario autenticado: el correo sale de la sesión, jamás del
// cuerpo de la petición. Ninguna ruta aprueba nada.
// ─────────────────────────────────────────────────────────────────────────────

import type { NextFunction, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { db } from '../lib/db.js'
import { routerGenesis } from '../lib/genesisPuente.js'
import type { User } from '../types.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: User
    }
  }
}

/** Carga el usuario completo de la sesión; el puente necesita su id y su correo. */
async function cargarUsuario(req: Request, res: Response, next: NextFunction) {
  try {
    const usuario = await db.findUserById(req.userId!)
    if (!usuario) {
      res.status(401).json({ error: 'No autorizado' })
      return
    }
    req.usuario = usuario
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * La sesión de MyTokenPay, en la forma que pide el puente: un solo middleware.
 *
 * MyTokenPay no guarda dirección de billetera en la sesión, así que el puente
 * la toma del cuerpo de `/vincular` —y sin ella no vincula (SFSP v0.3 §11)—.
 */
function exigirSesion(req: Request, res: Response, next: NextFunction) {
  void requireAuth(req, res, (err?: unknown) => {
    if (err) {
      next(err)
      return
    }
    void cargarUsuario(req, res, next)
  })
}

export const genesisRouter = routerGenesis({ exigirSesion })
