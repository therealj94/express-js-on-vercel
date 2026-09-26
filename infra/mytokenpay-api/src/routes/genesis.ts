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
//
// PERO EL CORREO DE UNA CUENTA DE MYTOKENPAY NO PRUEBA NADA. El alta no lo
// verifica y «olvidé mi contraseña» devuelve el enlace en la respuesta, así
// que cualquiera tiene una cuenta con el correo de otra persona. Por eso el
// puente se monta con `exigirGidDeSesion`: una identidad que ya tiene GID solo
// la toca una sesión que lo PROBÓ, es decir, que nació de un pase de Genesis
// ID en `/api/auth/sso` y lleva ese GID firmado en el token (lib/auth.ts). Y
// el vínculo (`/vincular`) va APAGADO salvo MTP_VINCULO_GENESIS=1
// (lib/genesis.ts).
// ─────────────────────────────────────────────────────────────────────────────

import type { NextFunction, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { db } from '../lib/db.js'
import { leerToken } from '../lib/auth.js'
import { vinculoGenesisActivo } from '../lib/genesis.js'
import { mismoGid, routerGenesis } from '../lib/genesisPuente.js'
import type { User } from '../types.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: User
    }
  }
}

/**
 * El GID que ESTA sesión probó: el que lleva firmado su token, y solo si sigue
 * siendo el de la cuenta. Un token de contraseña no lleva ninguno.
 */
function gidProbado(req: Request, usuario: User): string | null {
  const cabecera = req.headers.authorization
  const token = cabecera?.startsWith('Bearer ') ? cabecera.slice(7) : ''
  const gid = token ? leerToken(token)?.gid ?? null : null
  return gid && mismoGid(gid, usuario.gid) ? gid : null
}

/** Carga el usuario completo de la sesión; el puente necesita su id y su correo. */
async function cargarUsuario(req: Request, res: Response, next: NextFunction) {
  try {
    const usuario = await db.findUserById(req.userId!)
    if (!usuario) {
      res.status(401).json({ error: 'No autorizado' })
      return
    }
    // `gid` NO es el de la cuenta guardada sino el que la sesión probó: una
    // cuenta de contraseña con el GID de alguien (adoptada por correo en
    // `/auth/sso`) no prueba que quien entró con esa contraseña sea esa persona.
    req.usuario = { ...usuario, gid: gidProbado(req, usuario) }
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * La sesión de MyTokenPay, en la forma que pide el puente: un solo middleware.
 *
 * MyTokenPay no guarda dirección de billetera en la sesión, así que el puente
 * la toma del cuerpo de `/vincular` —y sin ella no vincula (SFSP v0.3 §11)—,
 * pero solo si Genesis ID ya la conoce del vínculo de Veta Wallet de la misma
 * identidad: una dirección tecleada no prueba de quién es.
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

export const genesisRouter = routerGenesis({
  exigirSesion,
  exigirGidDeSesion: true,
  vinculoActivo: vinculoGenesisActivo,
})
