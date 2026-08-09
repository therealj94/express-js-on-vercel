// Sincroniza el padrón de esta app con Genesis ID.
//
// PARA QUE SIRVE
//
// Genesis ID sabe de identidades verificadas, pero no de la gente que solo
// tiene cuenta. El padrón le manda ese listado —correo, nombre, país,
// billetera— para que el panel pueda enseñar «dónde está cada billetera» y,
// sobre todo, para poder poner NOMBRE a una huella de telemetría cuando algo
// falla.
//
// LO QUE NO SE MANDA, Y POR QUE
//
// Nada que no haga falta para eso. Ni contraseñas, ni semillas, ni llaves, ni
// documentos, ni PIN, ni el histórico de movimientos. La lista de campos de
// `deUsuario()` es cerrada a propósito: si alguien añade un campo al modelo de
// usuario mañana, no se filtra solo. Mandar de más «por si acaso» es cómo se
// acaba con datos sensibles copiados en tres sitios distintos.
//
// EL IDENTIFICADOR TIENE QUE COINCIDIR CON EL DE TELEMETRIA
//
// Se usa `idDeUsuario` del mismo módulo de telemetría. Si los dos no mandan
// exactamente el mismo identificador, el panel no puede cruzarlos y dirá
// «fuera del padrón» para todo el mundo — sin error visible en ninguna parte.

import { idDeUsuario } from './telemetria.js'

const BASE = (process.env.GENESIS_URL || 'https://genesis-id.onrender.com').replace(/\/$/, '')
const CLAVE = (process.env.GENESIS_API_KEY || '').trim()

/** Cuántos usuarios por petición. */
const POR_LOTE = Number(process.env.GENESIS_DIRECTORIO_LOTE || 200)
/** Cada cuánto se sincroniza todo, en horas. */
const CADA_H = Number(process.env.GENESIS_DIRECTORIO_HORAS || 6)
const TIEMPO_MS = Number(process.env.GENESIS_DIRECTORIO_TIMEOUT_MS || 20000)

export const activo = () => Boolean(CLAVE)

/**
 * Un usuario de la app, con solo lo que el padrón necesita.
 *
 * `direccionWallet` es lo que ata a la persona con la cadena; sin ella el
 * panel enseña un nombre que no lleva a ninguna parte.
 */
export function deUsuario(u) {
  const idExterno = idDeUsuario(u)
  if (!idExterno || !u?.email) return null

  const texto = (v, max = 120) => {
    const s = v === undefined || v === null ? '' : String(v).trim()
    return s ? s.slice(0, max) : undefined
  }

  return {
    idExterno,
    email: String(u.email).toLowerCase().trim().slice(0, 160),
    nombre: texto(u.nombre ?? u.name ?? u.fullName),
    usuario: texto(u.usuario ?? u.username),
    telefono: texto(u.telefono ?? u.phone, 32),
    pais: texto(u.pais ?? u.country, 2)?.toUpperCase(),
    ciudad: texto(u.ciudad ?? u.city, 80),
    direccionWallet: texto(u.address ?? u.direccion ?? u.walletAddress, 64),
    estado: texto(u.estado ?? u.status, 32),
    // El estado de verificación tal como lo entiende la app; Genesis ID lo
    // cruza con el suyo y enseña los dos si no coinciden.
    kyc: texto(u.kyc ?? u.kycStatus, 32),
    verificado: typeof u.verificado === 'boolean' ? u.verificado
      : typeof u.verified === 'boolean' ? u.verified : undefined,
    creadoEn: fecha(u.creadoEn ?? u.createdAt),
    ultimoAcceso: fecha(u.ultimoAcceso ?? u.lastLogin ?? u.lastSeen),
  }
}

const fecha = (v) => {
  if (!v) return undefined
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/**
 * Manda el padrón entero, en lotes.
 *
 * @param usuarios lista de documentos de usuario de la app (o un iterable).
 * @returns cuántos se mandaron y cuántos rechazó Genesis ID.
 */
export async function sincronizar(usuarios) {
  if (!CLAVE) return { ok: false, motivo: 'GENESIS_API_KEY no está configurada' }

  const limpios = []
  for (const u of usuarios) {
    const e = deUsuario(u)
    if (e) limpios.push(e)
  }
  if (!limpios.length) return { ok: true, enviados: 0, guardados: 0, descartados: 0 }

  let guardados = 0
  let descartados = 0
  for (let i = 0; i < limpios.length; i += POR_LOTE) {
    const lote = limpios.slice(i, i + POR_LOTE)
    const r = await mandar(lote)
    if (!r.ok) return { ok: false, motivo: r.motivo, enviados: i, guardados, descartados }
    guardados += r.guardados ?? 0
    descartados += r.descartados ?? 0
  }
  return { ok: true, enviados: limpios.length, guardados, descartados }
}

async function mandar(usuarios) {
  const corte = new AbortController()
  const reloj = setTimeout(() => corte.abort(), TIEMPO_MS)
  try {
    const r = await fetch(`${BASE}/api/v1/directorio/sincronizar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': CLAVE },
      body: JSON.stringify({ usuarios }),
      signal: corte.signal,
    })
    const cuerpo = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, motivo: cuerpo.error || `Genesis ID respondió ${r.status}` }
    return { ok: true, ...cuerpo }
  } catch (e) {
    return { ok: false, motivo: e?.name === 'AbortError' ? 'se agotó el tiempo' : String(e?.message || e) }
  } finally {
    clearTimeout(reloj)
  }
}

/**
 * Deja el padrón sincronizándose solo cada N horas.
 *
 * `traerUsuarios` la escribe quien monta esto, porque solo la app sabe cómo
 * consultar su propia base. Debe devolver una lista (o algo iterable) de
 * usuarios.
 *
 * La primera pasada se retrasa 30 segundos a propósito: durante el arranque el
 * servidor está abriendo la base y atendiendo el primer tráfico, y recorrer el
 * padrón entero justo ahí es competir con lo que sí importa.
 */
export function programar(traerUsuarios, { alTerminar } = {}) {
  if (!CLAVE) return () => {}

  let parado = false
  let reloj = null

  const pasada = async () => {
    if (parado) return
    try {
      const usuarios = await traerUsuarios()
      const r = await sincronizar(usuarios)
      if (alTerminar) alTerminar(r)
      else if (r.ok) console.log(`[directorio] ${r.enviados} usuarios sincronizados con Genesis ID`)
      else console.warn(`[directorio] no se pudo sincronizar: ${r.motivo}`)
    } catch (e) {
      // Que la consulta a la base falle no puede tirar el servidor.
      console.warn(`[directorio] error al sincronizar: ${e?.message || e}`)
    }
    if (!parado) {
      reloj = setTimeout(pasada, CADA_H * 3600 * 1000)
      if (typeof reloj.unref === 'function') reloj.unref()
    }
  }

  reloj = setTimeout(pasada, 30000)
  if (typeof reloj.unref === 'function') reloj.unref()

  return () => { parado = true; if (reloj) clearTimeout(reloj) }
}
