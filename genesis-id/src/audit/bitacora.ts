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
 * Recorre la cadena y comprueba que cada eslabón cuadre.
 * Devuelve el índice de la primera entrada rota, o `null` si está íntegra.
 */
export function verificarCadena(): { integra: boolean; rotaEn: number | null; total: number } {
  const bitacora = store.todo().bitacora
  let anterior = GENESIS
  for (let i = 0; i < bitacora.length; i++) {
    const e = bitacora[i]
    const recalculado = eslabon(anterior, {
      fecha: e.fecha,
      actor: e.actor,
      accion: e.accion,
      objeto: e.objeto,
      detalle: e.detalle,
    })
    if (e.hashAnterior !== anterior || e.hash !== recalculado) {
      return { integra: false, rotaEn: i, total: bitacora.length }
    }
    anterior = e.hash
  }
  return { integra: true, rotaEn: null, total: bitacora.length }
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
