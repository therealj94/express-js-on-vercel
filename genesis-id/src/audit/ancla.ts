/**
 * El ancla diaria de la bitácora.
 *
 * QUE PROBLEMA RESUELVE, EXACTAMENTE
 *
 * La firma HMAC impide que alguien con la base INVENTE entradas: sin la llave
 * no puede fabricar una firma que cuadre. Pero todavía puede BORRAR las últimas
 * y dejar la cadena terminando antes de tiempo, perfectamente firmada y
 * perfectamente íntegra. Un despido que se quiere tapar, una aprobación que no
 * debió darse: se cortan las horas finales y no queda rastro dentro del sistema.
 *
 * Contra eso solo sirve dejar constancia FUERA. Un solo hash al día, guardado
 * donde la base no manda, acota cualquier borrado a las últimas 24 horas: si el
 * ancla de ayer dice que había 1.288 entradas y hoy hay 1.200, la resta es la
 * prueba.
 *
 * DONDE SE DEJA, Y POR QUE AHI
 *
 * 1. En el registro del servicio. Los registros de Render los guarda Render,
 *    no nosotros, y quien tenga la cadena de conexión de Mongo no los toca. Es
 *    lo más barato que de verdad está fuera, y va siempre.
 * 2. En una dirección que se configure (`GENESIS_ANCLA_URL`), si se pone. Ahí
 *    encaja un bucket con bloqueo de objetos, o un contrato en la 5550.
 *
 * Lo que NO es: una prueba criptográfica de tiempo. Es un testigo. Sirve porque
 * está en otro sitio y porque es diario, no porque sea inviolable.
 */

import { anclaje, verificarCadena } from './bitacora.js'

const HORA = 3600_000

const cadaHoras = () => {
  const n = Number(process.env.GENESIS_ANCLA_CADA_HORAS)
  return Number.isFinite(n) && n > 0 ? n : 24
}

const apagada = () => /^(no|0|false)$/i.test(String(process.env.GENESIS_ANCLA_AUTO || ''))

export interface Ancla {
  hash: string
  entradas: number
  fecha: string
  integra: boolean
  firmadas: number
  /** `true` si además de escribirse en el registro se pudo mandar fuera. */
  publicada: boolean
  destino?: string
  error?: string
}

let encendida = false
let ultima: Ancla | null = null
let fallosSeguidos = 0

export function estadoAncla() {
  const desde = ultima ? Date.now() - Date.parse(ultima.fecha) : null
  return {
    encendida,
    ultima,
    fallosSeguidos,
    atrasada: encendida && desde != null && desde > cadaHoras() * 1.5 * HORA,
    nuncaSeEchó: encendida && ultima == null,
  }
}

/**
 * Echa el ancla una vez.
 *
 * Nunca lanza. Un fallo al publicar no puede tumbar el servicio ni impedir que
 * el hash quede al menos en el registro, que es el destino que siempre existe.
 */
export async function echarAncla(): Promise<Ancla> {
  const a = anclaje()
  const cadena = verificarCadena()

  const ancla: Ancla = {
    hash: a.hash,
    entradas: a.entradas,
    fecha: a.fecha,
    integra: cadena.integra,
    firmadas: cadena.firmas.firmadas,
    publicada: false,
  }

  /* Este renglón es el ancla. Va con un prefijo fijo y fácil de buscar para que
     se pueda recuperar de los registros con una sola búsqueda el día que haga
     falta demostrar algo. */
  console.log(
    `[genesis-id] ANCLA-BITACORA ${ancla.fecha} entradas=${ancla.entradas} ` +
    `hash=${ancla.hash} integra=${ancla.integra} firmadas=${ancla.firmadas}`,
  )

  const url = process.env.GENESIS_ANCLA_URL?.trim()
  if (url) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.GENESIS_ANCLA_CLAVE
            ? { authorization: `Bearer ${process.env.GENESIS_ANCLA_CLAVE}` }
            : {}),
        },
        body: JSON.stringify(ancla),
        signal: AbortSignal.timeout(15_000),
      })
      if (!r.ok) throw new Error(`contestó ${r.status}`)
      ancla.publicada = true
      ancla.destino = new URL(url).host
      fallosSeguidos = 0
    } catch (e: any) {
      fallosSeguidos++
      ancla.error = String(e?.message || e)
      console.error(
        `[genesis-id] AVISO: el ancla quedó solo en el registro, no se pudo ` +
        `publicar (${fallosSeguidos} seguido${fallosSeguidos === 1 ? '' : 's'}): ${ancla.error}`,
      )
    }
  }

  ultima = ancla
  return ancla
}

/** Pone el ancla diaria en marcha. Se llama una vez, al arrancar. */
export function iniciarAncla() {
  if (apagada()) {
    console.log('[genesis-id] ancla de bitácora APAGADA por GENESIS_ANCLA_AUTO')
    encendida = false
    return
  }
  if (encendida) return
  encendida = true

  const cada = cadaHoras()
  /* La primera va enseguida, al minuto de arrancar, y a propósito: un servicio
     que se despliega varias veces al día tiene que dejar constancia en cada
     arranque. El ancla es barata —un renglón— y perderse la primera por esperar
     veinticuatro horas sería perder justo la del día del despliegue. */
  setTimeout(() => { void echarAncla() }, 60_000).unref?.()
  setInterval(() => { void echarAncla() }, cada * HORA).unref?.()

  console.log(`[genesis-id] ancla de bitácora cada ${cada} h`)
}
