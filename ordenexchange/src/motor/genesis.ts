// Cliente de Genesis ID.
//
// Es el mismo puente que usan Veta Wallet y MyTokenPay
// (infra/genesis-proxy/genesis.router.js), escrito en TypeScript y con las
// llamadas que OrdenExchange necesita: la clave de API vive SOLO aquí, en el
// servidor. El navegador habla con /api/genesis/* y este módulo reenvía con
// la cabecera X-API-Key.
//
// OrdenExchange entra en Genesis ID por la misma puerta que las demás apps:
// clave propia (`ordenexchange`) y alcances propios.

const BASE = (process.env.GENESIS_URL || 'https://genesis-id.onrender.com').replace(/\/$/, '')
const CLAVE = (process.env.GENESIS_API_KEY || '').trim()

export const genesisConfigurado = () => Boolean(CLAVE)

export interface Respuesta<T = any> { ok: boolean; estado: number; cuerpo: T }

export async function llamar<T = any>(ruta: string, opciones: { method?: string; body?: unknown } = {}): Promise<Respuesta<T>> {
  if (!CLAVE) {
    return { ok: false, estado: 503, cuerpo: { error: 'GENESIS_API_KEY no está configurada en este servidor', codigo: 'genesis-no-configurado' } as any }
  }
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), 25000)
  try {
    const r = await fetch(BASE + ruta, {
      method: opciones.method || 'GET',
      body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
      signal: control.signal,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': CLAVE },
    })
    const cuerpo = (await r.json().catch(() => ({}))) as T
    return { ok: r.ok, estado: r.status, cuerpo }
  } catch (e: any) {
    return {
      ok: false,
      estado: 504,
      cuerpo: { error: e?.name === 'AbortError' ? 'Genesis ID no respondió a tiempo' : 'No se pudo contactar con Genesis ID' } as any,
    }
  } finally {
    clearTimeout(temporizador)
  }
}

// ── Identidad del usuario (por su correo) ────────────────────────────────────

export const identidadPorEmail = (email: string) =>
  llamar(`/api/v1/identidades/por-email/${encodeURIComponent(email)}`)

export const crearIdentidad = (email: string) =>
  llamar('/api/v1/identidades', { method: 'POST', body: { email } })

export async function idIdentidad(email: string): Promise<string | null> {
  const r = await identidadPorEmail(email)
  return r.ok ? r.cuerpo?.identidad?.id ?? null : null
}

export const declararDatos = (idn: string, datos: Record<string, unknown>) =>
  llamar(`/api/v1/identidades/${idn}/datos`, { method: 'POST', body: datos })

export const enviarDocumento = (idn: string, mrz: string, textoAnverso?: string) =>
  llamar(`/api/v1/identidades/${idn}/documento`, { method: 'POST', body: { mrz, textoAnverso } })

export const pedirVivacidad = (idn: string) =>
  llamar(`/api/v1/identidades/${idn}/vivacidad`, { method: 'POST' })

export const enviarBiometria = (idn: string, cuerpo: Record<string, unknown>) =>
  llamar(`/api/v1/identidades/${idn}/biometria`, { method: 'POST', body: cuerpo })

export const enviarFoto = (idn: string, foto: string) =>
  llamar(`/api/v1/identidades/${idn}/foto`, { method: 'POST', body: { foto } })

export const vincular = (identidadId: string, cuenta: string, direccion: string | null) =>
  llamar('/api/v1/vinculos', { method: 'POST', body: { identidadId, cuenta, direccion } })

// ── GID y sesión única ───────────────────────────────────────────────────────

export const consultarGid = (gid: string) => llamar(`/api/v1/gid/${encodeURIComponent(gid)}`)

export const tokenSso = (gid: string, cuenta: string) =>
  llamar('/api/v1/sso/token', { method: 'POST', body: { gid, cuenta } })

export const verificarSso = (token: string) =>
  llamar<{ valido: boolean; gid?: string; emitidoPor?: string; expira?: string; perfil?: any; error?: string }>(
    '/api/v1/sso/verificar', { method: 'POST', body: { token } })

// ── Cumplimiento ─────────────────────────────────────────────────────────────

export const tamizDireccion = (direccion: string) =>
  llamar<{ tamizado: boolean; sancionada: boolean; aviso?: string }>(`/api/v1/tamiz/direccion/${encodeURIComponent(direccion)}`)

// Los movimientos para el monitoreo AML van por la cola de motor/aml.ts.

/** De lo que dice Genesis ID sobre una identidad, al estado que guarda OrdenExchange. */
export function estadoGidDe(estadoGenesis: string | null | undefined): 'sin-verificar' | 'en-revision' | 'verificada' | 'rechazada' | 'suspendida' {
  switch (estadoGenesis) {
    case 'verificada': return 'verificada'
    case 'rechazada': return 'rechazada'
    case 'suspendida': return 'suspendida'
    // En revisión = ya no depende de la persona: mandó el rostro y espera al
    // operador. Con el documento aceptado todavía le falta la foto, así que
    // sigue «sin verificar» y el asistente se le muestra en ese paso.
    case 'en-revision':
    case 'biometria': return 'en-revision'
    default: return 'sin-verificar'
  }
}

/**
 * En qué paso del asistente tiene que estar la persona, según lo que Genesis
 * ID dice de su trámite. Lo calcula el servidor para que la app no tenga que
 * conocer los estados internos de Genesis.
 *   1 datos · 2 documento · 3 rostro · null = no hay nada que hacer aquí
 */
export function pasoSugerido(identidad: { estado?: string; documentoAceptable?: boolean | null; rostroPendiente?: boolean } | null | undefined): 1 | 2 | 3 | null {
  if (!identidad) return 1
  switch (identidad.estado) {
    case 'iniciada': return 1
    case 'datos': return 2
    case 'documento': return identidad.documentoAceptable === false ? 2 : 3
    case 'biometria':
    case 'en-revision': return identidad.rostroPendiente ? 3 : null
    case 'rechazada': return 1
    default: return null
  }
}

