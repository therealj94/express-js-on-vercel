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
 *    encaja un bucket con bloqueo de objetos.
 * 3. EN LA CADENA 5550, si hay llave (`GENESIS_ANCLA_LLAVE`). Este es el bueno,
 *    y es el que cambia la conversación: los dos primeros destinos siguen
 *    siendo sitios donde mandamos nosotros —un registro que pagamos, un bucket
 *    que administramos—, así que ante un regulador siguen valiendo lo que vale
 *    nuestra palabra. Una transacción en una cadena con validadores no se
 *    puede retirar ni reescribir, ni por nosotros. Deja de ser «confíen en
 *    nosotros» y pasa a ser «compruébenlo ustedes».
 *
 * Los tres son INDEPENDIENTES: que falle uno no impide los otros. Es a
 * propósito —si el ancla dependiera de que los tres salgan bien, el destino
 * más frágil decidiría por los demás y algunos días no habría constancia de
 * ninguna clase.
 *
 * Lo que NO es: una prueba criptográfica de tiempo emitida por un tercero de
 * confianza. Es un testigo, y en el caso de la cadena, un testigo que no
 * podemos callar después.
 */

import { store } from '../store.js'
import { anclaje, verificarCadena } from './bitacora.js'
import { escribirEnLaCadena, direccionDe } from './cadena.js'
import {
  direccionDelEmisor, renglonEmisor, renglonRevocadas, huellaDeRevocadas,
} from '../credencial/credencial.js'

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
  /** Lo escrito en la cadena, cuando hay llave y salió bien. */
  cadena?: { tx: string; desde: string; cadenaId: number }
  errorCadena?: string
}

/**
 * El texto exacto que se escribe en la cadena.
 *
 * TEXTO PLANO Y NO 32 BYTES PELADOS, A PROPOSITO. El hash suelto es más corto y
 * más barato, pero para leerlo hace falta saber de antemano qué es y de dónde
 * salió. Así, cualquiera que abra la transacción en un explorador y pase el
 * `data` de hexadecimal a texto ve una frase que se explica sola: de quién es,
 * qué versión, de qué día, cuántos asientos y qué hash. La diferencia son unos
 * ochenta bytes de gas en una cadena propia — es decir, nada.
 *
 * El formato NO cambia sin subir el `1` del principio: hay transacciones ya
 * escritas que se leen con él.
 */
export function renglonAncla(a: Pick<Ancla, 'fecha' | 'entradas' | 'hash' | 'integra'>): string {
  return `GENESIS-ID/ANCLA/1 ${a.fecha} n=${a.entradas} h=${a.hash} integra=${a.integra ? 1 : 0}`
}

/** La dirección desde la que se anclan, para publicarla. Nunca la llave. */
export function direccionDelAncla(): string | null {
  const llave = process.env.GENESIS_ANCLA_LLAVE?.trim()
  if (!llave) return null
  try { return direccionDe(llave) } catch { return null }
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

  /* ── El destino de la cadena ───────────────────────────────────────────────
     Va aparte del anterior y con su propio `try`: son dos garantías distintas
     y ninguna es requisito de la otra. */
  const llave = process.env.GENESIS_ANCLA_LLAVE?.trim()
  if (llave) {
    const rpc = process.env.GENESIS_ANCLA_RPC?.trim()
      || process.env.GENESIS_RPC_URL?.trim()
      || 'https://rpc.ordenglobal-rpc.com/'
    const cadenaId = Number(process.env.GENESIS_CADENA_ID || 5550)
    try {
      const escrito = await escribirEnLaCadena(
        rpc, llave, new TextEncoder().encode(renglonAncla(ancla)), cadenaId)
      ancla.cadena = { tx: escrito.hash, desde: escrito.desde, cadenaId }
      ancla.publicada = true
      console.log(
        `[genesis-id] ANCLA-BITACORA en la cadena ${cadenaId}: ${escrito.hash} ` +
        `desde ${escrito.desde}`,
      )
    } catch (e: any) {
      /* El mensaje del error se guarda; la llave NO aparece en él porque
         `escribirEnLaCadena` nunca la mete en lo que lanza. */
      ancla.errorCadena = String(e?.message || e)
      console.error(
        `[genesis-id] AVISO: el ancla no llegó a la cadena: ${ancla.errorCadena}`,
      )
    }
  }

  /* Y con el ancla salen las dos cosas de las que dependen las credenciales:
     quién las firma y cuáles ya no valen. Van pegadas al ancla porque comparten
     el mismo requisito —una llave con gas— y porque el día que el ancla no
     salga, tampoco habrá salido esto, y conviene que se vea junto. */
  if (llave) await publicarLoDeLasCredenciales(llave)

  /* Se apunta el ancla. Es un PUNTERO, no la prueba: la prueba vive en la
     cadena y esta lista solo dice dónde mirar. Por eso da igual que esté en la
     misma base que la bitácora —quien la manipule no gana nada, porque lo que
     se comprueba es la transacción, no este renglón.

     Se guardan las últimas 400: algo más de un año de anclas diarias. Pasado
     eso, la que se cae ya está en la cadena para siempre y en el registro del
     servicio; lo que se pierde es la comodidad de tenerla a mano. */
  const anclas = store.todo().anclas
  anclas.push({
    fecha: ancla.fecha, entradas: ancla.entradas, hash: ancla.hash,
    integra: ancla.integra,
    ...(ancla.cadena
      ? { tx: ancla.cadena.tx, desde: ancla.cadena.desde, cadenaId: ancla.cadena.cadenaId }
      : {}),
  })
  if (anclas.length > 400) anclas.splice(0, anclas.length - 400)
  store.guardar()

  ultima = ancla
  return ancla
}

/**
 * Publica en la cadena la dirección del emisor y la lista de revocadas.
 *
 * SOLO CUANDO CAMBIAN. Escribir lo mismo todos los días cuesta gas y, peor,
 * llena la dirección del ancla de renglones repetidos entre los que hay que
 * buscar el que importa. Una credencial se comprueba contra la ULTIMA
 * publicación de cada clase, y así hay pocas y cada una significa algo.
 */
async function publicarLoDeLasCredenciales(llave: string): Promise<void> {
  const rpc = process.env.GENESIS_ANCLA_RPC?.trim()
    || process.env.GENESIS_RPC_URL?.trim()
    || 'https://rpc.ordenglobal-rpc.com/'
  const cadenaId = Number(process.env.GENESIS_CADENA_ID || 5550)
  const datos = store.todo()
  datos.publicado = datos.publicado || {}

  const escribir = async (texto: string) =>
    (await escribirEnLaCadena(rpc, llave, new TextEncoder().encode(texto), cadenaId)).hash

  // ── Quién firma ───────────────────────────────────────────────────────────
  const emisor = direccionDelEmisor()
  if (emisor && datos.publicado.emisor?.direccion !== emisor) {
    try {
      const fecha = new Date().toISOString()
      const tx = await escribir(renglonEmisor(emisor, fecha))
      datos.publicado.emisor = { direccion: emisor, tx, fecha }
      console.log(`[genesis-id] emisor de credenciales publicado en la cadena: ${tx}`)
    } catch (e: any) {
      /* Sin esto, las credenciales que se emitan no se pueden comprobar sin
         preguntarnos — que es justo lo que vinieron a evitar. Se avisa fuerte. */
      console.error(
        `[genesis-id] AVISO: el emisor de credenciales NO está publicado en la cadena. `
        + `Hasta que lo esté, comprobar una credencial exige confiar en este servicio. `
        + `(${e?.message || e})`)
    }
  }

  // ── Cuáles ya no valen ────────────────────────────────────────────────────
  /* Revocada es toda identidad que TUVO GID y ya no está verificada. El GID no
     se borra al suspender —hace falta para la trazabilidad— así que es
     exactamente esta condición y no «estado === suspendida»: una identidad que
     se suspendió y luego se rechazó también tiene que salir aquí. */
  const revocadas = datos.identidades
    .filter((i) => i.gid && i.estado !== 'verificada')
    .map((i) => i.gid!)
  const huella = huellaDeRevocadas(revocadas)

  if (datos.publicado.revocadas?.huella !== huella) {
    try {
      const fecha = new Date().toISOString()
      const tx = await escribir(renglonRevocadas(revocadas, fecha))
      datos.publicado.revocadas = { huella, n: revocadas.length, tx, fecha }
      console.log(`[genesis-id] lista de revocadas publicada (${revocadas.length}): ${tx}`)
    } catch (e: any) {
      console.error(`[genesis-id] AVISO: la lista de revocadas no llegó a la cadena: ${e?.message || e}`)
    }
  }
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
