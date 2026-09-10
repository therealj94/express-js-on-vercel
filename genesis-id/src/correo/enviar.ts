/* El envío de correo, por Amazon SES.
 *
 * POR QUE SES Y NO EL WEBMAIL DE LA EMPRESA
 *
 * El buzón de info@ordenglobal.org vive en hosting compartido. Mandar desde
 * ahí el correo de decenas de miles de personas tiene dos finales y ninguno es
 * bueno: se choca con el límite de envío por hora, o la IP entra en lista
 * negra y entonces se pierde TODO el correo del dominio —incluido el que la
 * empresa le escribe a su Junta y a sus socios—. Hoy esa IP está limpia en las
 * once listas que se midieron; es un activo, y no se quema por una campaña.
 *
 * SES manda desde IPs con reputación propia, cuesta diez centavos por cada mil
 * correos, y no necesita la contraseña del buzón: usa credenciales propias que
 * se revocan solas sin tocar el correo de nadie. El remitente que ve la
 * persona sigue siendo el de siempre.
 *
 * LA REGLA QUE MANDA SOBRE TODO LO DEMAS
 *
 * Un correo que no sale NUNCA puede tumbar la operación que lo disparó. Que
 * SES esté caído, mal configurado o sin credenciales no puede impedir que un
 * operador apruebe una identidad: la persona quedaría sin verificar por un
 * problema de correo. Por eso todo aquí devuelve en vez de lanzar, y quien
 * llama no tiene ni que mirar el resultado.
 *
 * CONFIGURACION
 *
 *   GENESIS_SES_REGION     por defecto us-east-1
 *   GENESIS_SES_DE         remitente, p.ej. "Orden Global <info@ordenglobal.org>"
 *   GENESIS_SES_LLAVE      credenciales de un usuario IAM que SOLO pueda
 *   GENESIS_SES_SECRETO    enviar correo (ses:SendEmail), nada más
 *
 * Sin esas variables el módulo queda APAGADO y lo dice en el registro. No es
 * un fallo: es el estado normal hasta que la Junta apruebe el gasto y el
 * dominio termine de verificarse.
 */

import { firmarPost } from './firma.js'

const REGION = process.env.GENESIS_SES_REGION || 'us-east-1'
/* El remitente trae valor por defecto porque NO es un secreto: va impreso en
   cada correo que mandamos. Exigirlo como variable convertía el encendido en
   tres pasos manuales en vez de dos, y bastaba olvidar este —el que no
   parece importante— para que el correo quedara apagado con las credenciales
   bien puestas y sin ninguna pista de por qué. Se cambia solo si algún día
   cambia la dirección. */
const DE = process.env.GENESIS_SES_DE || 'Orden Global <info@ordenglobal.org>'
const LLAVE = process.env.GENESIS_SES_LLAVE || ''
const SECRETO = process.env.GENESIS_SES_SECRETO || ''
// Conjunto de configuración de SES. Recoge rebotes, quejas, rechazos y
// retrasos, y los publica donde alguien los vea. Se deja como variable para
// poder cambiarlo sin desplegar.
const CONJUNTO = process.env.GENESIS_SES_CONJUNTO || 'ordenglobal-transaccional'

/** Sin credenciales no se envía nada y no se rompe nada. */
export const correoEncendido = (): boolean => Boolean(LLAVE && SECRETO)

/** El remitente que se va a usar de verdad, con el valor por defecto ya
 *  aplicado. Lo usa /healthz: leer la variable de entorno a secas decía
 *  «no hay remitente» cuando sí lo hay, que es peor que no decir nada. */
export const correoRemitente = (): string => DE

export interface Carta {
  para: string
  asunto: string
  texto: string
  html: string
}

export interface Resultado {
  ok: boolean
  /** El identificador que devuelve SES, para poder rastrear el envío. */
  id?: string
  motivo?: string
}

/**
 * Manda una carta. No lanza NUNCA: devuelve `{ok:false, motivo}` y sigue.
 *
 * El tiempo máximo son diez segundos. Un SES lento no puede dejar colgada la
 * pantalla del operador que acaba de aprobar a alguien.
 */
export async function enviar(carta: Carta): Promise<Resultado> {
  if (!correoEncendido()) return { ok: false, motivo: 'correo apagado' }
  if (!carta.para || !carta.para.includes('@')) {
    return { ok: false, motivo: 'destinatario sin dirección' }
  }

  const cuerpo = JSON.stringify({
    FromEmailAddress: DE,
    // Sin esto, los rebotes y las quejas se pierden: nadie se entera de que un
    // correo no llegó, y AWS —que lo comprueba antes de sacar la cuenta del
    // cajón de arena— ve un remitente que no vigila lo que manda. El conjunto
    // publica cada rebote y cada queja en un tema SNS que avisa por correo, y
    // apunta las métricas en CloudWatch.
    ConfigurationSetName: CONJUNTO,
    Destination: { ToAddresses: [carta.para] },
    Content: {
      Simple: {
        Subject: { Data: carta.asunto, Charset: 'UTF-8' },
        Body: {
          Text: { Data: carta.texto, Charset: 'UTF-8' },
          Html: { Data: carta.html, Charset: 'UTF-8' },
        },
      },
    },
  })

  const p = firmarPost({
    servicio: 'ses',
    region: REGION,
    host: `email.${REGION}.amazonaws.com`,
    ruta: '/v2/email/outbound-emails',
    cuerpo,
    credenciales: { llave: LLAVE, secreto: SECRETO },
  })

  const corte = AbortSignal.timeout(10_000)
  try {
    const r = await fetch(p.url, {
      method: 'POST', headers: p.cabeceras, body: p.cuerpo, signal: corte,
    })
    const txt = await r.text()
    if (!r.ok) {
      // El motivo se registra pero NO se le enseña a nadie de fuera: puede
      // traer detalles de la cuenta de AWS.
      console.error('[correo] SES respondió', r.status, txt.slice(0, 300))
      return { ok: false, motivo: `SES ${r.status}` }
    }
    let id: string | undefined
    try { id = JSON.parse(txt)?.MessageId } catch {}
    return { ok: true, id }
  } catch (e: any) {
    console.error('[correo] no se pudo enviar:', e?.message || e)
    return { ok: false, motivo: e?.name === 'TimeoutError' ? 'tiempo agotado' : 'red' }
  }
}

/**
 * Envía sin que a quien llama le importe el resultado. Es la forma pensada
 * para colgarse de una aprobación: se dispara, se registra si falla, y la
 * operación de arriba sigue su camino pase lo que pase.
 */
export function enviarSinEsperar(carta: Carta, contexto: string): void {
  enviar(carta)
    .then((r) => {
      if (!r.ok && r.motivo !== 'correo apagado') {
        console.error(`[correo] ${contexto}: no salió (${r.motivo})`)
      }
    })
    .catch(() => { /* enviar() ya no lanza; esto es el cinturón del cinturón */ })
}
