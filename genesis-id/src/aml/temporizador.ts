/**
 * El temporizador que baja la OFAC y vuelve a tamizar, solo.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 *
 * El retamizado de las personas ya aprobadas funcionaba desde hacía tiempo,
 * pero solo corría cuando un operador entraba al panel y apretaba «recargar
 * listas». Eso quiere decir que si la OFAC agregaba un nombre un martes y nadie
 * entraba al panel en un mes, durante ese mes había clientes aprobados que ya
 * deberían estar bloqueados, y el sistema los dejaba operar.
 *
 * La debida diligencia continua no se cumple con un botón. Tiene que correr
 * sola, tiene que quedar escrita, y tiene que verse desde afuera si dejó de
 * correr. Las tres cosas están acá.
 *
 * TRES DECISIONES QUE NO SON OBVIAS
 *
 * 1. Si la descarga falla, NO se tocan las listas que ya están cargadas. Unas
 *    listas de ayer sirven; ninguna lista no sirve, porque el motor pasa a
 *    «sin tamizar» y bloquea a todo el mundo. `importarDeOfac` ya se niega a
 *    seguir si la descarga vuelve vacía, y acá se deja que ese error suba sin
 *    que nadie lo trague.
 *
 * 2. Un fallo aislado no es una alarma; tres seguidos sí. La OFAC se cae, la
 *    red se corta, un despliegue pilla la descarga a medias. Lo que importa no
 *    es el fallo suelto sino la racha, y por eso se cuenta y se publica.
 *
 * 3. El turno se pide en Mongo. Si mañana el servicio corre en dos instancias,
 *    sin esto las dos bajarían diecisiete mil fichas a la misma hora y las dos
 *    escribirían en la bitácora. Con Mongo delante solo una se lleva el turno.
 *    Sin Mongo no hay turno que pedir, y tampoco hace falta: sin Mongo solo hay
 *    una instancia.
 */

import { coleccionAparte } from '../store.js'
import { registrar } from '../audit/bitacora.js'
import { importarDeOfac, estadoListas } from './listas.js'
import * as ids from '../motor/identidades.js'

/** Quien firma en la bitácora lo que hace el temporizador. No es una persona. */
export const ACTOR = 'sistema:temporizador'

const COLECCION_TURNO = 'turnos'
const HORA = 3600_000

/** Cada cuánto se baja la lista. Se puede bajar en pruebas o subir si molesta. */
const cadaHoras = () => {
  const n = Number(process.env.GENESIS_LISTAS_CADA_HORAS)
  return Number.isFinite(n) && n > 0 ? n : 24
}

/**
 * Cuánto se espera desde el arranque antes de la primera vuelta.
 *
 * No es cero a propósito. Un despliegue no puede quedarse colgado un minuto
 * bajando megabytes antes de contestar la primera petición, y un reinicio en
 * bucle no puede convertirse en un martilleo contra el servidor de la OFAC.
 */
const esperaInicialMs = () => {
  const n = Number(process.env.GENESIS_LISTAS_ESPERA_MIN)
  return (Number.isFinite(n) && n >= 0 ? n : 5) * 60_000
}

const apagado = () =>
  /^(no|0|false)$/i.test(String(process.env.GENESIS_LISTAS_AUTO || ''))

// ─────────────────────────────────────────────────────────────────────────────
// Lo que se puede mirar desde fuera
// ─────────────────────────────────────────────────────────────────────────────

let encendido = false
let corriendo = false
let ultimaCorrida: string | null = null
let ultimoIntento: string | null = null
let ultimoResultado: Record<string, unknown> | null = null
let ultimoError: string | null = null
let fallosSeguidos = 0

/** Solo para las pruebas: deja el contador de fallos y las marcas en cero. */
export function _reiniciarParaPruebas() {
  encendido = false; corriendo = false
  ultimaCorrida = null; ultimoIntento = null
  ultimoResultado = null; ultimoError = null; fallosSeguidos = 0
}

export function estadoTemporizador() {
  const cada = cadaHoras()
  const desde = ultimaCorrida ? Date.now() - Date.parse(ultimaCorrida) : null
  return {
    encendido,
    corriendo,
    cadaHoras: cada,
    ultimaCorrida,
    ultimoIntento,
    ultimoResultado,
    ultimoError,
    fallosSeguidos,
    /* La señal que de verdad importa, y la razón de que este bloque exista:
       ¿el tamizado continuo está corriendo o se paró sin que nadie lo note?
       Se da margen de una vuelta y media antes de gritar, porque un servicio
       recién arrancado todavía no corrió ninguna y eso no es una avería. */
    atrasado: encendido && desde != null && desde > cada * 1.5 * HORA,
    nuncaCorrio: encendido && ultimaCorrida == null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// El turno
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pide el turno para esta vuelta. Devuelve `true` si le toca a esta instancia.
 *
 * Es un arriendo con vencimiento, no un candado: si la instancia que se lo
 * llevó se muere a mitad de la descarga, el turno se libera solo al vencer y
 * la siguiente lo toma. Un candado sin vencimiento se habría quedado cerrado
 * para siempre en ese caso.
 */
async function tomarTurno(cada: number): Promise<boolean> {
  const col = coleccionAparte(COLECCION_TURNO)
  if (!col) return true // sin Mongo no hay con quién competir

  const ahora = Date.now()
  // Nadie más puede empezar hasta que esta vuelta venza. Media hora es de
  // sobra: la descarga entera tarda alrededor de un minuto.
  const vence = new Date(ahora + 30 * 60_000).toISOString()
  // Y no se vuelve a bajar hasta que pase el intervalo, aunque el temporizador
  // dispare antes por un reinicio.
  const noAntesDe = new Date(ahora - cada * HORA + 5 * 60_000).toISOString()

  try {
    const r = await col.findOneAndUpdate(
      {
        _id: 'listas.ofac',
        $or: [
          { vence: { $lt: new Date(ahora).toISOString() } },
          { vence: { $exists: false } },
        ],
        $and: [{ $or: [{ ultima: { $lt: noAntesDe } }, { ultima: { $exists: false } }] }],
      },
      { $set: { vence, tomadoPor: process.env.RENDER_INSTANCE_ID || 'unica' } },
      { upsert: true, returnDocument: 'after' },
    )
    return Boolean(r?.value ?? r)
  } catch (e: any) {
    /* El upsert choca con la clave única cuando dos instancias piden el turno
       en el mismo instante: la que pierde recibe un E11000. No es un fallo,
       es exactamente lo que el turno tiene que hacer. */
    if (e?.code === 11000) return false
    // Cualquier otro fallo de Mongo no puede dejar el tamizado sin correr. Se
    // sigue sin turno: peor es no tamizar.
    console.warn('[genesis-id] no se pudo pedir el turno de listas:', e?.message)
    return true
  }
}

async function soltarTurno(ok: boolean) {
  const col = coleccionAparte(COLECCION_TURNO)
  if (!col) return
  try {
    await col.updateOne(
      { _id: 'listas.ofac' },
      {
        $set: {
          vence: new Date(0).toISOString(),
          // Solo una vuelta que salió bien corre el reloj del intervalo. Si
          // falló, la siguiente instancia puede reintentar en seguida en vez
          // de esperar veinticuatro horas a que se arregle solo.
          ...(ok ? { ultima: new Date().toISOString() } : {}),
        },
      },
      { upsert: true },
    )
  } catch { /* soltar el turno no puede romper nada */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// La vuelta
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una vuelta completa: bajar la OFAC, guardarla y volver a tamizar a todos.
 *
 * Es la misma secuencia que hace el botón del panel. La diferencia es quién
 * firma: acá firma el sistema, y queda escrito en la bitácora igual que si
 * hubiera sido una persona, porque para un auditor tiene el mismo peso.
 */
export interface Piezas {
  /** Baja y guarda la lista. Se sustituye en las pruebas: llama a la OFAC. */
  bajar: typeof importarDeOfac
  /** Vuelve a tamizar a todo el padrón. */
  retamizar: (actor: string) => { revisadas: number; conCoincidencias: number }
}

const REALES: Piezas = { bajar: importarDeOfac, retamizar: ids.retamizarTodas }

export async function unaVuelta(actor = ACTOR, piezas: Piezas = REALES): Promise<{
  ok: boolean
  saltada?: boolean
  registros?: number
  revisadas?: number
  conCoincidencias?: number
  error?: string
}> {
  if (corriendo) return { ok: false, saltada: true, error: 'ya hay una vuelta en marcha' }
  corriendo = true
  ultimoIntento = new Date().toISOString()

  let turno = false
  try {
    turno = await tomarTurno(cadaHoras())
    if (!turno) return { ok: true, saltada: true }

    const r = await piezas.bajar()
    const t = piezas.retamizar(actor)

    ultimaCorrida = new Date().toISOString()
    ultimoResultado = { ...r, ...t }
    ultimoError = null
    fallosSeguidos = 0

    registrar(actor, 'listas.ofac.automatica', 'listas', { ...r, ...t })
    console.log(
      `[genesis-id] listas al día solas: ${r.registros} fichas, ` +
      `${t.revisadas} identidades retamizadas, ${t.conCoincidencias} con coincidencias`,
    )
    return { ok: true, ...r, ...t }
  } catch (e: any) {
    fallosSeguidos++
    ultimoError = String(e?.message || e)
    /* Que quede en la bitácora también cuando falla. Un registro de auditoría
       que solo guarda los éxitos no es un registro de auditoría: lo que un
       inspector va a preguntar es justamente por los días que no corrió. */
    try {
      registrar(actor, 'listas.ofac.fallo', 'listas', {
        error: ultimoError, fallosSeguidos,
      })
    } catch { /* si ni la bitácora responde, el console.error de abajo queda */ }
    console.error(
      `[genesis-id] AVISO: no se pudieron actualizar las listas ` +
      `(${fallosSeguidos} seguido${fallosSeguidos === 1 ? '' : 's'}): ${ultimoError}`,
    )
    return { ok: false, error: ultimoError }
  } finally {
    if (turno) await soltarTurno(ultimoError == null)
    corriendo = false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// El arranque
// ─────────────────────────────────────────────────────────────────────────────

/** Pone el temporizador en marcha. Se llama una vez, al arrancar el servicio. */
export function iniciarTemporizadorListas() {
  if (apagado()) {
    console.log('[genesis-id] temporizador de listas APAGADO por GENESIS_LISTAS_AUTO')
    encendido = false
    return
  }
  if (encendido) return
  encendido = true

  const cada = cadaHoras()
  const espera = esperaInicialMs()

  setTimeout(() => { void unaVuelta() }, espera).unref?.()
  setInterval(() => { void unaVuelta() }, cada * HORA).unref?.()

  console.log(
    `[genesis-id] listas al día solas cada ${cada} h ` +
    `(primera vuelta en ${Math.round(espera / 60000)} min). ` +
    `Ahora: ${estadoListas().registros} fichas cargadas`,
  )
}
