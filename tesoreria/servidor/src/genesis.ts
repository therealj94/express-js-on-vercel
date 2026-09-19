// Puente con Genesis ID (identidad del ecosistema).
//
// Un consejero puede entrar a la Tesorería con la sesión única de Genesis ID:
// Genesis emite un token GID, la Tesorería lo manda a verificar con su clave
// de API y, si la identidad está verificada y corresponde a un operador dado
// de alta con ese GID, abre sesión. La Tesorería nunca ve la contraseña ni el
// documento de nadie: solo recibe «este GID está verificado».
//
// Sin TESORERIA_GENESIS_API_KEY el puente está apagado y la entrada es solo
// por contraseña. La clave nunca va al navegador.

const URL_GENESIS = () => (process.env.TESORERIA_GENESIS_URL || 'https://genesis-id.onrender.com').replace(/\/$/, '')
const CLAVE = () => (process.env.TESORERIA_GENESIS_API_KEY || '').trim()

export const genesisConfigurado = () => Boolean(CLAVE())

export async function verificarTokenGenesis(token: string): Promise<{ ok: boolean; gid?: string; motivo?: string }> {
  if (!genesisConfigurado()) return { ok: false, motivo: 'La entrada con Genesis ID no está configurada en este servidor' }
  if (!token) return { ok: false, motivo: 'Falta el token' }
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  try {
    const r = await fetch(`${URL_GENESIS()}/api/v1/sso/verificar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': CLAVE() },
      body: JSON.stringify({ token }),
      signal: ctrl.signal,
    })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok || !j?.valido || !j?.gid) return { ok: false, motivo: j?.error || 'Genesis ID no validó el token' }
    return { ok: true, gid: String(j.gid).toUpperCase() }
  } catch (e: any) {
    return { ok: false, motivo: 'No se pudo hablar con Genesis ID: ' + (e?.message || 'sin respuesta') }
  } finally {
    clearTimeout(t)
  }
}
