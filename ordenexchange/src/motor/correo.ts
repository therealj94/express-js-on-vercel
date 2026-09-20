// Correo saliente: el código para confirmar la dirección.
//
// Se manda por Brevo (el proveedor de correo de Orden Global) cuando hay
// BREVO_API_KEY. Sin proveedor, en desarrollo el código se imprime en el
// registro del servidor y se devuelve en la respuesta (solo ahí); en
// producción sin proveedor el registro queda a medias y el arranque lo avisa.

import { EN_PRODUCCION } from '../lib/entorno.js'

const CLAVE = (process.env.BREVO_API_KEY || '').trim()
const REMITENTE = process.env.ORDENEX_CORREO_REMITENTE || 'OrdenExchange <no-responder@ordenglobal.link>'

export const correoConfigurado = () => Boolean(CLAVE)

function partesRemitente(): { name: string; email: string } {
  const m = REMITENTE.match(/^(.*)<([^>]+)>\s*$/)
  return m ? { name: m[1].trim() || 'OrdenExchange', email: m[2].trim() } : { name: 'OrdenExchange', email: REMITENTE }
}

/** Devuelve `true` si el correo salió por el proveedor; `false` si solo quedó en el registro. */
export async function enviarCodigo(email: string, codigo: string, idioma: 'es' | 'en' = 'es'): Promise<boolean> {
  const asunto = idioma === 'en' ? `${codigo} is your OrdenExchange code` : `${codigo} es tu código de OrdenExchange`
  const texto = idioma === 'en'
    ? `Your verification code is ${codigo}. It expires in 15 minutes. If you did not create an OrdenExchange account, ignore this message.`
    : `Tu código de verificación es ${codigo}. Vence en 15 minutos. Si no creaste una cuenta en OrdenExchange, ignora este mensaje.`

  if (!CLAVE) {
    if (!EN_PRODUCCION) console.log(`[correo] (sin proveedor) código para ${email}: ${codigo}`)
    return false
  }
  try {
    const ctrl = new AbortController()
    const alarma = setTimeout(() => ctrl.abort(), 15000)
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'api-key': CLAVE, Accept: 'application/json' },
      body: JSON.stringify({
        sender: partesRemitente(),
        to: [{ email }],
        subject: asunto,
        textContent: texto,
        htmlContent: `<p style="font-family:sans-serif;font-size:16px">${texto.replace(codigo, `<b style="font-size:22px;letter-spacing:.2em">${codigo}</b>`)}</p>`,
      }),
    })
    clearTimeout(alarma)
    if (!r.ok) {
      console.error('[correo] Brevo respondió', r.status, (await r.text().catch(() => '')).slice(0, 200))
      return false
    }
    return true
  } catch (e: any) {
    console.error('[correo] no se pudo enviar:', e?.message)
    return false
  }
}
