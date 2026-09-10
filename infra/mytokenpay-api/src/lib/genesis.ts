// ─────────────────────────────────────────────────────────────────────────────
// Cliente de Genesis ID, el registro de identidad del ecosistema.
//
// POR QUÉ EXISTE ESTE INTERMEDIARIO
//
// Genesis ID exige una clave de API (`X-API-Key: gid_live_…`) en todas sus
// rutas. Esa clave NO puede viajar dentro de la aplicación móvil: un APK se
// descomprime con una orden y cualquiera la extraería. Con ella podría crear
// identidades a nombre de otros y consultar perfiles.
//
// Así que la clave vive solo aquí, en el servidor, y el teléfono habla con su
// propio backend:
//
//   teléfono ──JWT──▶ este backend (/genesis/*) ──X-API-Key──▶ Genesis ID
//
// Es el mismo puente que monta el backend de Veta Wallet; lo único que cambia
// es la clave configurada (cada app del ecosistema tiene la suya, con sus
// propios alcances).
// ─────────────────────────────────────────────────────────────────────────────

const BASE = (process.env.GENESIS_URL || 'https://genesis-id.onrender.com').replace(/\/$/, '')
const CLAVE = (process.env.GENESIS_API_KEY || '').trim()

export const genesisConfigurado = (): boolean => Boolean(CLAVE)

export interface RespuestaGenesis {
  ok: boolean
  estado: number
  cuerpo: any
}

export async function llamarGenesis(ruta: string, opciones: RequestInit = {}): Promise<RespuestaGenesis> {
  if (!CLAVE) {
    return { ok: false, estado: 503, cuerpo: { error: 'GENESIS_API_KEY no está configurada en este servidor' } }
  }
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), 25_000)
  try {
    const r = await fetch(BASE + ruta, {
      ...opciones,
      signal: control.signal,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': CLAVE, ...(opciones.headers as Record<string, string> | undefined) },
    })
    const cuerpo = await r.json().catch(() => ({}))
    return { ok: r.ok, estado: r.status, cuerpo }
  } catch (e: any) {
    return {
      ok: false,
      estado: 504,
      cuerpo: { error: e?.name === 'AbortError' ? 'Genesis ID no respondió a tiempo' : 'No se pudo contactar con Genesis ID' },
    }
  } finally {
    clearTimeout(temporizador)
  }
}

/** La identidad de un correo, o null si no existe. */
export async function identidadPorEmail(email: string): Promise<any | null> {
  const r = await llamarGenesis(`/api/v1/identidades/por-email/${encodeURIComponent(email)}`)
  return r.ok ? r.cuerpo?.identidad ?? null : null
}
