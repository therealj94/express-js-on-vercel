// Una sola respuesta a «¿esto es producción?».
//
// Antes cada módulo lo decidía por su cuenta y no coincidían: la firma de
// sesiones miraba NODE_ENV, VERCEL y RENDER; el modo demo solo NODE_ENV. Así
// que en Render sin NODE_ENV y sin clave de Genesis, el grifo y la
// verificación falsa se encendían solos sobre una tesorería real. Ahora hay
// una única definición, y es la más conservadora: si hay cualquier señal de
// que esto custodia dinero de verdad, es producción.

const env = process.env

export const EN_PRODUCCION: boolean =
  env.NODE_ENV === 'production'
  || Boolean(env.VERCEL)
  || Boolean(env.RENDER)
  || Boolean((env.ORDENEX_MONGO_URL || '').trim())
  || /^0x[0-9a-fA-F]{40}$/.test(env.ORDENEX_TESORERIA || '')

/** Solo cuando alguien lo dijo expresamente: pruebas y desarrollo local. */
export const EN_DESARROLLO: boolean = !EN_PRODUCCION && (env.NODE_ENV === 'test' || env.NODE_ENV === 'development' || !env.NODE_ENV)

export const GENESIS_CONFIGURADO: boolean = Boolean((env.GENESIS_API_KEY || '').trim())

/**
 * Modo demostración: usuarios ya «verificados», grifo, anuncios sembrados.
 *
 * Nunca en producción, ni aunque lo pidan con ORDENEX_DEMO=1: una tesorería
 * real con un grifo que fabrica ORIGEN es un agujero, no una demo.
 */
export function modoDemo(): boolean {
  if (EN_PRODUCCION) return false
  const v = (env.ORDENEX_DEMO || '').trim()
  if (v === '1' || v === 'true') return true
  if (v === '0' || v === 'false') return false
  return !GENESIS_CONFIGURADO
}

/** Detrás de un proxy inverso que pone X-Forwarded-For (Render, Vercel, o quien lo diga). */
export const TRAS_PROXY: boolean = Boolean(env.RENDER) || Boolean(env.VERCEL) || env.ORDENEX_TRAS_PROXY === '1'

/** Orígenes permitidos para CORS; vacío = mismo origen únicamente en producción, cualquiera en desarrollo. */
export const ORIGENES: string[] = (env.ORDENEX_ORIGENES || '').split(',').map((s) => s.trim()).filter(Boolean)
