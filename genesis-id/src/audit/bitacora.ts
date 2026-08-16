// Bitácora encadenada.
//
// Todo lo que cambia el estado de una identidad queda aquí: quién lo hizo,
// cuándo, sobre qué y con qué datos. Es el registro que pide cualquier auditoría
// de cumplimiento, y también la única forma de reconstruir qué pasó cuando algo
// sale mal.
//
// CADA ENTRADA LLEVA EL HASH DE LA ANTERIOR
//
// Eso convierte la bitácora en una cadena. Si alguien con acceso a la base
// borra o modifica una entrada vieja, todos los hashes posteriores dejan de
// cuadrar y `verificarCadena()` señala exactamente dónde se rompió.
//
// No impide la manipulación —quien controle la base puede recalcular la cadena
// entera— pero sí la hace evidente salvo que se rehaga todo con cuidado. Para
// que sea irreversible de verdad haría falta anclar el último hash fuera del
// sistema; como el ecosistema tiene su propia cadena de bloques, `anclaje()`
// devuelve el hash listo para publicarlo ahí.

import { store } from '../store.js'
import { eslabon } from '../lib/cripto.js'
import { id } from '../lib/uid.js'
import type { EntradaBitacora } from '../types.js'

/** Semilla de la cadena. */
const GENESIS = '0'.repeat(64)

/** Campos que jamás deben acabar escritos en la bitácora. */
const PROHIBIDOS = /contrasena|password|token|secreto|apikey|clave|selfie|foto/i

/**
 * Quita del detalle lo que no debe registrarse.
 *
 * La bitácora se lee, se exporta y se enseña a auditores externos. Que una
 * contraseña o una imagen biométrica acabe ahí por descuido convierte el
 * registro de seguridad en una filtración.
 */
function limpiar(detalle: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(detalle || {})) {
    if (PROHIBIDOS.test(k)) {
      salida[k] = '[omitido]'
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      salida[k] = limpiar(v as Record<string, unknown>)
    } else if (typeof v === 'string' && v.length > 500) {
      salida[k] = v.slice(0, 500) + '…[recortado]'
    } else {
      salida[k] = v
    }
  }
  return salida
}

/** Añade una entrada. Devuelve la entrada ya encadenada. */
export function registrar(
  actor: string,
  accion: string,
  objeto: string,
  detalle: Record<string, unknown> = {},
): EntradaBitacora {
  const bitacora = store.todo().bitacora
  const hashAnterior = bitacora.length ? bitacora[bitacora.length - 1].hash : GENESIS

  const contenido = {
    fecha: new Date().toISOString(),
    actor,
    accion,
    objeto,
    detalle: limpiar(detalle),
  }

  const entrada: EntradaBitacora = {
    id: id('log'),
    ...contenido,
    hashAnterior,
    hash: eslabon(hashAnterior, contenido),
  }

  bitacora.push(entrada)
  store.guardar()
  return entrada
}

/**
 * Ancla de un tramo nuevo. Una entrada con este `hashAnterior` no continúa la
 * cadena anterior: abre una.
 */
const SELLO = 'S'.repeat(64)

/** La acción que marca un sello. Se comprueba junto con el ancla. */
const ACCION_SELLO = 'bitacora.sello'

/**
 * Recorre la cadena y comprueba que cada eslabón cuadre.
 *
 * LOS SELLOS Y POR QUE EXISTEN
 *
 * Un eslabón roto no se arregla. Recalcular los hashes dejaría la cadena en
 * verde destruyendo justo lo que aporta —que una manipulación se note—, así
 * que eso no se hace nunca y esta función no reescribe nada.
 *
 * Lo que sí se puede hacer, y es lo que haría un auditor, es CERRAR el tramo
 * roto y abrir uno nuevo: se añade una entrada de sello que deja escrito, en la
 * propia bitácora, dónde se rompió y cuántas entradas había. A partir de ahí la
 * cadena vuelve a encadenar y una manipulación NUEVA se sigue notando.
 *
 * Por eso `integra` habla del tramo VIGENTE, y `sellos` va siempre al lado: el
 * hueco no se borra, se declara. Quien lea esto tiene que poder ver las dos
 * cosas de un vistazo, y por eso `/healthz` publica el recuento.
 */
export function verificarCadena(): {
  integra: boolean
  rotaEn: number | null
  total: number
  sellos: { indice: number; fecha: string; rotaEn: number | null; entradasAntes: number }[]
} {
  const bitacora = store.todo().bitacora
  const contenidoDe = (e: EntradaBitacora) => ({
    fecha: e.fecha, actor: e.actor, accion: e.accion, objeto: e.objeto, detalle: e.detalle,
  })
  /* Un sello VÁLIDO es el que se ancla en SELLO y cuyo propio hash cuadra. El
     hash de un sello no depende de la entrada anterior —por eso puede abrir
     tramo— así que se puede comprobar por su cuenta. Uno con el hash mal no es
     un sello: es una entrada rota, y como tal la trata el recorrido de abajo. */
  const esSelloValido = (e: EntradaBitacora) =>
    e.accion === ACCION_SELLO && e.hashAnterior === SELLO && e.hash === eslabon(SELLO, contenidoDe(e))

  const sellos: { indice: number; fecha: string; rotaEn: number | null; entradasAntes: number }[] = []
  bitacora.forEach((e, i) => {
    if (!esSelloValido(e)) return
    const d = (e.detalle || {}) as Record<string, unknown>
    sellos.push({
      indice: i,
      fecha: e.fecha,
      rotaEn: typeof d.rotaEn === 'number' ? d.rotaEn : null,
      entradasAntes: typeof d.entradasAntes === 'number' ? d.entradasAntes : i,
    })
  })

  /* Se verifica EL TRAMO VIGENTE: desde el último sello hasta el final. Lo
     anterior a ese sello ya está declarado roto —con su índice escrito dentro
     de la propia entrada de sello— y volver a recorrerlo solo serviría para
     que la comprobación se parase siempre en la misma herida vieja y no
     pudiera avisar de una nueva, que es justo lo que hace falta vigilar. */
  const ultimo = sellos.length ? sellos[sellos.length - 1].indice : -1
  let anterior = ultimo >= 0 ? bitacora[ultimo].hash : GENESIS

  for (let i = ultimo + 1; i < bitacora.length; i++) {
    const e = bitacora[i]
    if (e.hashAnterior !== anterior || e.hash !== eslabon(anterior, contenidoDe(e))) {
      return { integra: false, rotaEn: i, total: bitacora.length, sellos }
    }
    anterior = e.hash
  }
  return { integra: true, rotaEn: null, total: bitacora.length, sellos }
}

/**
 * Cierra el tramo roto y abre uno nuevo.
 *
 * No toca ni una entrada anterior: las deja exactamente como están, rotas
 * incluidas. Lo único que hace es añadir al final una entrada que dice dónde
 * estaba la rotura y cuántas entradas había hasta ese momento, y que sirve de
 * ancla para lo que venga después.
 *
 * Se niega a sellar una cadena que está íntegra: un sello sin rotura solo sirve
 * para ensuciar el registro, y para dar cobertura a quien quisiera partir la
 * cadena a voluntad.
 */
export function sellar(actor: string, motivo: string):
  { ok: boolean; error?: string; entrada?: EntradaBitacora; rotaEn?: number | null } {
  const estado = verificarCadena()
  if (estado.integra) {
    return { ok: false, error: 'La cadena está íntegra: no hay nada que sellar.' }
  }

  const bitacora = store.todo().bitacora
  const contenido = {
    fecha: new Date().toISOString(),
    actor,
    accion: ACCION_SELLO,
    objeto: 'bitacora',
    detalle: limpiar({
      motivo,
      rotaEn: estado.rotaEn,
      entradasAntes: estado.total,
      selloPrevio: estado.sellos.length,
    }),
  }
  const entrada: EntradaBitacora = {
    id: id('log'),
    ...contenido,
    hashAnterior: SELLO,
    hash: eslabon(SELLO, contenido),
  }
  bitacora.push(entrada)
  store.guardar()
  return { ok: true, entrada, rotaEn: estado.rotaEn }
}

/** El último hash: lo que habría que publicar en la cadena para anclar. */
export function anclaje(): { hash: string; entradas: number; fecha: string } {
  const bitacora = store.todo().bitacora
  return {
    hash: bitacora.length ? bitacora[bitacora.length - 1].hash : GENESIS,
    entradas: bitacora.length,
    fecha: new Date().toISOString(),
  }
}

export function consultar(filtro: {
  actor?: string; accion?: string; objeto?: string; desde?: string; hasta?: string; limite?: number
} = {}): EntradaBitacora[] {
  const { limite = 200 } = filtro
  return store.todo().bitacora
    .filter((e) =>
      (!filtro.actor || e.actor.includes(filtro.actor)) &&
      (!filtro.accion || e.accion.includes(filtro.accion)) &&
      (!filtro.objeto || e.objeto.includes(filtro.objeto)) &&
      (!filtro.desde || e.fecha >= filtro.desde) &&
      (!filtro.hasta || e.fecha <= filtro.hasta))
    .slice(-limite)
    .reverse()
}
