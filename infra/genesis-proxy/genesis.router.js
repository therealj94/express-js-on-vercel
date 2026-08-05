// Puente entre una app del ecosistema y Genesis ID.
//
// POR QUE HACE FALTA ESTE INTERMEDIARIO
//
// Genesis ID exige una clave de API (`X-API-Key: gid_live_…`) en todas sus
// rutas. Esa clave NO puede viajar dentro de la aplicación móvil: un APK se
// descomprime con una orden y cualquiera la extraería. Con ella podría crear
// identidades a nombre de otros y consultar perfiles.
//
// Así que la clave vive solo aquí, en el servidor de cada app, y el teléfono
// habla con su propio backend:
//
//   teléfono ──▶ backend de la app (/genesis/*) ──X-API-Key──▶ Genesis ID
//
// Este router se monta igual en el backend de Veta Wallet y en el de
// MyTokenPay; lo único que cambia es la clave que se le configura.
//
// COMO SE MONTA
//
//   import { routerGenesis } from './genesis.router.js'
//   app.use('/genesis', routerGenesis({ exigirSesion: miMiddlewareDeAuth }))
//
// Variables de entorno:
//   GENESIS_URL      https://genesis-id.onrender.com   (por defecto)
//   GENESIS_API_KEY  la clave de esta app, del panel de Genesis ID
//
// SOBRE `exigirSesion`
//
// Es el middleware de autenticación de la propia app. Es OBLIGATORIO: sin él,
// este puente convierte un endpoint público en una vía para crear identidades
// a nombre de cualquier correo. Cada ruta comprueba además que el usuario
// autenticado sea el dueño de la identidad que está tocando.

import { Router } from 'express'

const BASE = (process.env.GENESIS_URL || 'https://genesis-id.onrender.com').replace(/\/$/, '')
const CLAVE = (process.env.GENESIS_API_KEY || '').trim()

export const genesisConfigurado = () => Boolean(CLAVE)

async function llamar(ruta, opciones = {}) {
  if (!CLAVE) {
    return { ok: false, estado: 503, cuerpo: { error: 'GENESIS_API_KEY no está configurada en este servidor' } }
  }
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), 25000)
  try {
    const r = await fetch(BASE + ruta, {
      ...opciones,
      signal: control.signal,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': CLAVE, ...(opciones.headers || {}) },
    })
    const cuerpo = await r.json().catch(() => ({}))
    return { ok: r.ok, estado: r.status, cuerpo }
  } catch (e) {
    return {
      ok: false,
      estado: 504,
      cuerpo: { error: e?.name === 'AbortError' ? 'Genesis ID no respondió a tiempo' : 'No se pudo contactar con Genesis ID' },
    }
  } finally {
    clearTimeout(temporizador)
  }
}

/**
 * @param exigirSesion  middleware de la app que deja `req.usuario` con al
 *                      menos { email } del usuario autenticado
 */
export function routerGenesis({ exigirSesion } = {}) {
  if (typeof exigirSesion !== 'function') {
    throw new Error(
      'routerGenesis necesita el middleware de sesión de la app. Sin él, cualquiera podría ' +
      'crear identidades a nombre de otros correos.',
    )
  }

  const router = Router()
  router.use(exigirSesion)

  const responder = (res) => (r) => res.status(r.estado).json(r.cuerpo)

  /**
   * Estado del trámite del usuario autenticado.
   * Crea la identidad si aún no existe, para que la app siempre tenga algo que
   * mostrar sin necesitar una llamada aparte.
   */
  router.get('/estado', async (req, res) => {
    const email = req.usuario.email
    const existente = await llamar(`/api/v1/identidades/por-email/${encodeURIComponent(email)}`)
    if (existente.ok) return res.json(existente.cuerpo)
    const creada = await llamar('/api/v1/identidades', { method: 'POST', body: JSON.stringify({ email }) })
    responder(res)(creada)
  })

  /** Datos que declara la persona sobre sí misma. */
  router.post('/datos', async (req, res) => {
    const idn = await idDe(req.usuario.email)
    if (!idn) return res.status(404).json({ error: 'Identidad no encontrada' })
    const { nombreCompleto, fechaNacimiento, paisResidencia, telefono } = req.body ?? {}
    responder(res)(await llamar(`/api/v1/identidades/${idn}/datos`, {
      method: 'POST',
      body: JSON.stringify({ nombreCompleto, fechaNacimiento, paisResidencia, telefono }),
    }))
  })

  /**
   * MRZ del documento, ya leída en el teléfono.
   *
   * Se manda el texto y no la fotografía a propósito: así la imagen del
   * documento no viaja por la red ni queda almacenada en ningún servidor, que
   * es un dato personal menos en riesgo por cada usuario.
   */
  router.post('/documento', async (req, res) => {
    const idn = await idDe(req.usuario.email)
    if (!idn) return res.status(404).json({ error: 'Identidad no encontrada' })
    responder(res)(await llamar(`/api/v1/identidades/${idn}/documento`, {
      method: 'POST', body: JSON.stringify({ mrz: req.body?.mrz }),
    }))
  })

  router.post('/biometria', async (req, res) => {
    const idn = await idDe(req.usuario.email)
    if (!idn) return res.status(404).json({ error: 'Identidad no encontrada' })
    responder(res)(await llamar(`/api/v1/identidades/${idn}/biometria`, {
      method: 'POST',
      body: JSON.stringify({ selfie: req.body?.selfie, fotoDocumento: req.body?.fotoDocumento }),
    }))
  })

  /** Ata la cuenta de esta app al GID del usuario. */
  router.post('/vincular', async (req, res) => {
    const idn = await idDe(req.usuario.email)
    if (!idn) return res.status(404).json({ error: 'Identidad no encontrada' })
    responder(res)(await llamar('/api/v1/vinculos', {
      method: 'POST',
      body: JSON.stringify({
        identidadId: idn,
        // La cuenta la fija el servidor a partir de la sesión, nunca el cuerpo
        // de la petición: si viniera del cliente, alguien podría atar su GID a
        // la cuenta de otro.
        cuenta: req.usuario.id || req.usuario.email,
        direccion: req.usuario.address || req.body?.direccion || null,
      }),
    }))
  })

  /**
   * Token de sesión única para entrar en otra app del ecosistema sin repetir
   * el KYC.
   */
  router.post('/sso/token', async (req, res) => {
    const perfil = await llamar(`/api/v1/identidades/por-email/${encodeURIComponent(req.usuario.email)}`)
    const gid = perfil.cuerpo?.identidad?.gid
    if (!gid) return res.status(403).json({ error: 'Todavía no hay una identidad verificada' })
    responder(res)(await llamar('/api/v1/sso/token', {
      method: 'POST',
      body: JSON.stringify({ gid, cuenta: req.usuario.id || req.usuario.email }),
    }))
  })

  /**
   * Comprueba si una dirección está sancionada.
   *
   * Conviene llamarlo ANTES de firmar cualquier envío: es el control más
   * directo que tiene el ecosistema, y evita que la wallet mande fondos a una
   * dirección de una lista.
   */
  router.get('/tamiz/:direccion', async (req, res) => {
    responder(res)(await llamar(`/api/v1/tamiz/direccion/${encodeURIComponent(req.params.direccion)}`))
  })

  /** Movimientos para el monitoreo AML. Nunca se le dice al usuario si saltó algo. */
  router.post('/movimientos', async (req, res) => {
    const perfil = await llamar(`/api/v1/identidades/por-email/${encodeURIComponent(req.usuario.email)}`)
    const gid = perfil.cuerpo?.identidad?.gid
    if (!gid) return res.json({ ok: true, omitido: 'sin GID verificado' })
    await llamar('/api/v1/movimientos', {
      method: 'POST',
      body: JSON.stringify({ gid, movimientos: req.body?.movimientos ?? [] }),
    })
    res.json({ ok: true })
  })

  async function idDe(email) {
    const r = await llamar(`/api/v1/identidades/por-email/${encodeURIComponent(email)}`)
    return r.ok ? r.cuerpo?.identidad?.id : null
  }

  return router
}
