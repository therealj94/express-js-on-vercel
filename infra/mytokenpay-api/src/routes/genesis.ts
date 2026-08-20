// ─────────────────────────────────────────────────────────────────────────────
// Puente entre la app de MyTokenPay y Genesis ID.
//
// El teléfono nunca habla con Genesis ID directamente (ver lib/genesis.ts).
// Cada ruta de aquí exige la sesión propia de MyTokenPay y actúa SOLO sobre la
// identidad del usuario autenticado: el correo sale de la sesión, jamás del
// cuerpo de la petición. Si viniera del cliente, cualquiera podría crear o
// consultar identidades a nombre de otros.
//
// Ninguna de estas rutas aprueba nada. Lo máximo que hacen es dejar el trámite
// listo para que un operador de cumplimiento decida en el panel de Genesis ID.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { h } from '../lib/ruta.js'
import { db } from '../lib/db.js'
import { llamarGenesis, identidadPorEmail } from '../lib/genesis.js'
import type { User } from '../types.js'

export const genesisRouter = Router()

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: User
    }
  }
}

/** Carga el usuario completo de la sesión; el puente necesita su correo. */
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

genesisRouter.use(requireAuth, cargarUsuario)

const responder = (res: Response) => (r: { estado: number; cuerpo: any }) => res.status(r.estado).json(r.cuerpo)

async function idDe(email: string): Promise<string | null> {
  const identidad = await identidadPorEmail(email)
  return identidad?.id ?? null
}

/**
 * Estado del trámite del usuario autenticado.
 * Crea la identidad si aún no existe, para que la app siempre tenga algo que
 * mostrar sin necesitar una llamada aparte.
 */
genesisRouter.get('/estado', h(async (req, res) => {
  const email = req.usuario!.email
  const existente = await llamarGenesis(`/api/v1/identidades/por-email/${encodeURIComponent(email)}`)
  if (existente.ok) {
    res.json(existente.cuerpo)
    return
  }
  const creada = await llamarGenesis('/api/v1/identidades', { method: 'POST', body: JSON.stringify({ email }) })
  responder(res)(creada)
}))

/** Datos que declara la persona sobre sí misma. */
genesisRouter.post('/datos', h(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  if (!idn) {
    res.status(404).json({ error: 'Identidad no encontrada' })
    return
  }
  const { nombreCompleto, fechaNacimiento, paisResidencia, telefono } = req.body ?? {}
  responder(res)(await llamarGenesis(`/api/v1/identidades/${idn}/datos`, {
    method: 'POST',
    body: JSON.stringify({ nombreCompleto, fechaNacimiento, paisResidencia, telefono }),
  }))
}))

/**
 * MRZ del documento, ya leída en el teléfono.
 *
 * Se manda el texto y no la fotografía a propósito: así la imagen del
 * documento no viaja por la red ni queda almacenada en ningún servidor, que
 * es un dato personal menos en riesgo por cada usuario.
 */
genesisRouter.post('/documento', h(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  if (!idn) {
    res.status(404).json({ error: 'Identidad no encontrada' })
    return
  }
  responder(res)(await llamarGenesis(`/api/v1/identidades/${idn}/documento`, {
    method: 'POST',
    body: JSON.stringify({ mrz: req.body?.mrz }),
  }))
}))

genesisRouter.post('/biometria', h(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  if (!idn) {
    res.status(404).json({ error: 'Identidad no encontrada' })
    return
  }
  responder(res)(await llamarGenesis(`/api/v1/identidades/${idn}/biometria`, {
    method: 'POST',
    body: JSON.stringify({ selfie: req.body?.selfie, fotoDocumento: req.body?.fotoDocumento }),
  }))
}))

/** Ata la cuenta de MyTokenPay al GID del usuario. */
genesisRouter.post('/vincular', h(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  if (!idn) {
    res.status(404).json({ error: 'Identidad no encontrada' })
    return
  }
  responder(res)(await llamarGenesis('/api/v1/vinculos', {
    method: 'POST',
    body: JSON.stringify({
      identidadId: idn,
      // La cuenta la fija el servidor a partir de la sesión, nunca el cuerpo
      // de la petición: si viniera del cliente, alguien podría atar su GID a
      // la cuenta de otro.
      cuenta: req.usuario!.id,
      direccion: req.body?.direccion || null,
    }),
  }))
}))

/**
 * Token de sesión única para entrar en otra app del ecosistema sin repetir el
 * KYC.
 */
genesisRouter.post('/sso/token', h(async (req, res) => {
  const identidad = await identidadPorEmail(req.usuario!.email)
  const gid = identidad?.gid
  if (!gid) {
    res.status(403).json({ error: 'Todavía no hay una identidad verificada' })
    return
  }
  responder(res)(await llamarGenesis('/api/v1/sso/token', {
    method: 'POST',
    body: JSON.stringify({ gid, cuenta: req.usuario!.id }),
  }))
}))

/**
 * La dirección de billetera que Genesis ID conoce de la identidad del usuario.
 *
 * Sale de los vínculos del GID (la registra Veta Wallet al vincular). Sirve
 * para que «Conectar billetera» no le pida a la persona teclear una dirección
 * que el ecosistema ya tiene.
 */
genesisRouter.get('/billetera', h(async (req, res) => {
  const identidad = await identidadPorEmail(req.usuario!.email)
  const gid = identidad?.gid
  if (!gid) {
    res.json({ direccion: null, gid: null })
    return
  }
  const r = await llamarGenesis(`/api/v1/gid/${encodeURIComponent(gid)}`)
  const apps: { app: string; direccion: string | null }[] = r.ok ? r.cuerpo?.apps ?? [] : []
  const direccion =
    apps.find((a) => a.app === 'veta-wallet' && a.direccion)?.direccion ??
    apps.find((a) => a.direccion)?.direccion ??
    null
  res.json({ direccion, gid })
}))

/** Comprueba si una dirección está sancionada. Conviene llamarlo antes de cobrar hacia ella. */
genesisRouter.get('/tamiz/:direccion', h(async (req, res) => {
  responder(res)(await llamarGenesis(`/api/v1/tamiz/direccion/${encodeURIComponent(req.params.direccion)}`))
}))

/** Movimientos para el monitoreo AML. Nunca se le dice al usuario si saltó algo. */
genesisRouter.post('/movimientos', h(async (req, res) => {
  const identidad = await identidadPorEmail(req.usuario!.email)
  const gid = identidad?.gid
  if (!gid) {
    res.json({ ok: true, omitido: 'sin GID verificado' })
    return
  }
  await llamarGenesis('/api/v1/movimientos', {
    method: 'POST',
    body: JSON.stringify({ gid, movimientos: req.body?.movimientos ?? [] }),
  })
  res.json({ ok: true })
}))
