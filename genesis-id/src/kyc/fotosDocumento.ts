// Las fotos del documento que están esperando que las mire un operador.
//
// POR QUE NO VIVEN DENTRO DEL EXPEDIENTE
//
// Todo el estado del motor —identidades, negocios, casos, bitácora— vive en UN
// solo documento de MongoDB (`estado/genesis`), y eso funciona porque son miles
// de registros pequeños. Dos fotografías de un documento de identidad no son un
// registro pequeño: en base64 pesan megabytes.
//
// Guardadas ahí dentro, la cuenta sale mal enseguida. Un documento de MongoDB
// no puede pasar de 16 MB, y ese límite es del documento ENTERO: no hace falta
// un expediente monstruoso para reventarlo, basta con que se junten unas pocas
// verificaciones pendientes a la vez. Y el día que se pasa, no falla la subida
// de la foto — falla `volcar()`, o sea el guardado de TODO: identidades,
// operadores y aprobaciones dejan de escribirse mientras el servicio sigue
// respondiendo 200 con los datos vivos solo en memoria. El siguiente reinicio de
// Render se lo lleva todo. Es la misma razón por la que las listas de sanciones
// están en su propia colección, pero peor, porque aquí el que llena el
// documento es cualquiera que suba una foto desde el navegador.
//
// Así que cada expediente pendiente es un documento aparte, con el id de la
// identidad como `_id`: guardarlo o borrarlo no toca el estado, y su tamaño solo
// tiene que caber en su propio documento, no en el de todo el sistema.
//
// SIN MONGO TAMPOCO VUELVEN AL ESTADO
//
// `coleccionAparte` devuelve `null` con el motor de archivo. En ese caso las
// fotos van a un archivo hermano del de estado; lo que no se hace nunca, en
// ningún motor, es devolverlas al documento de estado.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs'
import { dirname } from 'path'
import { coleccionAparte, archivoAparte, store } from '../store.js'
import { cifrar, descifrar, archivoConfigurado } from '../lib/cripto.js'

export interface FotosDocumento {
  anverso: string
  reverso: string
  /**
   * EL FOTOGRAMA QUE SE COMPARÓ. La evidencia del cotejo, no el retrato.
   *
   * Hasta el 20-ago el selfie se mandaba al proveedor, se obtenía un número de
   * parecido, y se tiraba —el comentario de la ruta lo decía sin rodeos: «se
   * compara y se descarta»—. El resultado era que el panel enseñaba un hueco
   * donde debía ir la cara, y nadie podía revisar un cotejo a mano ni
   * reconstruir después por qué se aprobó a alguien. Quedaba un número.
   *
   * Un panel donde una persona decide sobre otra no puede funcionar así, y una
   * casa que promete conservar la evidencia de sus verificaciones tampoco.
   *
   * NO se confunde con `fotoCredencial`. Aquella es el retrato público: viaja
   * a las apps del ecosistema y se ve en la credencial. Ésta es prueba: vive
   * cifrada aquí, con el mismo plazo de cinco años que el documento, y solo la
   * ve un operador con permiso, dejando rastro en la bitácora.
   *
   * Opcional a propósito: los expedientes anteriores a esta fecha no la tienen
   * y no se puede inventar.
   */
  rostro?: string
}

const NOMBRE = 'documentosPendientes'

const coleccion = () => coleccionAparte(NOMBRE)

/* ══ CONSERVACIÓN ══════════════════════════════════════════════════════════
 *
 * Hasta hoy estas fotos se BORRABAN en cuanto había decisión. La intención era
 * buena —no acumular documentos de identidad ajenos— pero contradecía la
 * política de privacidad publicada, que promete a cada usuario, por escrito:
 *
 *     «Datos de verificación de identidad — 5 años desde el cierre,
 *      por obligación legal»
 *
 * Las dos cosas no podían ser verdad. Se resolvió por el lado de conservar,
 * que es lo que exige la normativa de prevención de blanqueo y lo que la casa
 * ya había prometido.
 *
 * Conservar NO es dejarlas donde estaban. Se guardan cifradas, cada lectura
 * queda registrada con el nombre de quien la hizo, y se borran solas al
 * cumplirse el plazo. Ese «solas» es literal: lo hace MongoDB con un índice
 * TTL, no una tarea nuestra. Un borrado que depende de que alguien se acuerde
 * de correr algo no es un borrado, es una intención.
 *
 * Y si no hay llave de cifrado, NO se conserva: se borra como antes. Antes que
 * un depósito de cédulas en claro, ninguno. `/healthz` lo dice para que la
 * ausencia de llave se vea desde fuera y no pase por «ya está guardado». */

/** Cinco años, que es lo que promete la política publicada. */
const ANOS_CONSERVACION = 5

export const conservacionConfigurada = archivoConfigurado

function vencimiento(desde = new Date()): Date {
  const d = new Date(desde)
  d.setFullYear(d.getFullYear() + ANOS_CONSERVACION)
  return d
}

// ─────────────────────────────────────────────────────────────────────────────
// Motor de archivo: un JSON hermano del de estado, `{ idIdentidad: {…} }`
// ─────────────────────────────────────────────────────────────────────────────

type Mapa = Record<string, FotosDocumento>

function leerMapa(): Mapa {
  const ruta = archivoAparte(NOMBRE)
  if (!existsSync(ruta)) return {}
  try {
    const leido = JSON.parse(readFileSync(ruta, 'utf8'))
    return leido && typeof leido === 'object' ? leido as Mapa : {}
  } catch {
    // Un archivo de fotos ilegible no puede tumbar el arranque: son imágenes
    // que se pueden volver a pedir, no el expediente.
    return {}
  }
}

function escribirMapa(m: Mapa): void {
  const ruta = archivoAparte(NOMBRE)
  mkdirSync(dirname(ruta), { recursive: true })
  // Temporal y renombrado, igual que el archivo de estado: el renombrado es
  // atómico y un corte a mitad no deja el archivo truncado.
  const temporal = `${ruta}.tmp`
  writeFileSync(temporal, JSON.stringify(m))
  renameSync(temporal, ruta)
}

// ─────────────────────────────────────────────────────────────────────────────
// Guardar, leer, borrar
// ─────────────────────────────────────────────────────────────────────────────

/** Guarda las dos caras de una identidad. Reemplaza las que hubiera.
 *
 *  Se cifran si hay llave. Mientras el expediente está pendiente NO llevan
 *  vencimiento: el plazo de cinco años se cuenta desde la decisión, no desde
 *  que se subió la foto, y ponerlo antes borraría el documento de alguien que
 *  todavía está esperando respuesta. */
export async function guardarFotos(idn: string, fotos: FotosDocumento): Promise<void> {
  const guardable: Record<string, unknown> = {
    anverso: cifrar(fotos.anverso) ?? fotos.anverso,
    reverso: cifrar(fotos.reverso) ?? fotos.reverso,
  }
  // Solo se escribe si viene. Guardar una cadena vacía dejaría un hueco que
  // parece un rostro perdido cuando en realidad nunca lo hubo.
  if (fotos.rostro) guardable.rostro = cifrar(fotos.rostro) ?? fotos.rostro
  const c = coleccion()
  if (c) {
    /* `$set`, no `replaceOne`. Con replaceOne el documento BORRABA el rostro
       que ya estuviera guardado, y desde el teléfono el rostro llega antes: la
       cara desaparecía justo en los expedientes que sí la tenían. Lo cazó la
       prueba «el documento no pisa un rostro ya guardado». Aquí solo se
       escriben las claves que trae esta llamada. */
    await c.updateOne(
      { _id: idn },
      { $set: { ...guardable, guardadasEn: new Date(), cifradas: archivoConfigurado() } },
      { upsert: true },
    )
    return
  }
  const m = leerMapa()
  m[idn] = { ...(m[idn] || {}), ...guardable } as unknown as FotosDocumento
  escribirMapa(m)
}

/** Las fotos de una identidad, o `null` si nunca las hubo o ya vencieron. */
export async function leerFotos(idn: string): Promise<FotosDocumento | null> {
  const c = coleccion()
  const crudas = c
    ? await c.findOne({ _id: idn }).then((d: any) => (d?.anverso && d?.reverso
        ? { anverso: d.anverso as string, reverso: d.reverso as string,
            rostro: (d.rostro as string) || undefined } : null))
    : leerMapa()[idn] ?? null
  if (!crudas) return null

  /* Si están cifradas y falta la llave, `descifrar` devuelve null y aquí se
     devuelve null: mejor que el operador vea «no aportado» —y pregunte— a que
     la pantalla le pinte un texto cifrado como si fuera una imagen rota. */
  const anverso = descifrar(crudas.anverso)
  const reverso = descifrar(crudas.reverso)
  // El rostro NO condiciona el resultado: los expedientes de antes del 20-ago
  // no lo tienen, y devolver null por eso escondería también el documento.
  const rostro = crudas.rostro ? descifrar(crudas.rostro) ?? undefined : undefined
  return anverso && reverso ? { anverso, reverso, rostro } : null
}

/**
 * Guarda SOLO el fotograma del cotejo, sin tocar el documento.
 *
 * Existe porque el rostro y el documento llegan en peticiones distintas y en
 * cualquier orden: quien se verifica desde el navegador manda primero las dos
 * caras y luego el rostro, y desde el teléfono puede ser al revés. Reescribir
 * el registro entero desde cualquiera de las dos borraría lo que trajo la otra.
 */
export async function guardarRostroCotejo(idn: string, rostro: string): Promise<void> {
  if (!rostro) return
  const guardable = cifrar(rostro) ?? rostro
  const c = coleccion()
  if (c) {
    await c.updateOne(
      { _id: idn },
      { $set: { rostro: guardable, cifradas: archivoConfigurado() },
        $setOnInsert: { guardadasEn: new Date() } },
      { upsert: true },
    )
    return
  }
  const m = leerMapa()
  m[idn] = { ...(m[idn] || { anverso: '', reverso: '' }), rostro: guardable }
  escribirMapa(m)
}

/**
 * Pasa las fotos al archivo de conservación: les pone fecha de vencimiento.
 *
 * Se llama al decidir —aprobar, rechazar o mandar rehacer— en lugar del borrado
 * de antes. A partir de aquí MongoDB las borra solo cuando llegue la fecha.
 *
 * Sin llave de cifrado NO se archiva: se borra, como se venía haciendo. Guardar
 * cédulas en claro durante cinco años sería peor que no guardarlas.
 *
 * Con el motor de archivo tampoco se archiva. Ese motor es para desarrollo y no
 * tiene forma de caducar nada solo; conservar ahí sería acumular sin plazo, que
 * es justo lo que no se quiere.
 */
export async function archivarFotos(idn: string): Promise<'archivadas' | 'borradas'> {
  const c = coleccion()
  if (!c || !archivoConfigurado()) {
    await borrarFotos(idn)
    return 'borradas'
  }
  const r = await c.updateOne({ _id: idn }, { $set: { venceEn: vencimiento(), archivadasEn: new Date() } })
  // Si no había fotos que archivar no pasa nada: no todas las identidades
  // entran por foto de documento.
  return r.matchedCount ? 'archivadas' : 'borradas'
}

/**
 * Deja puesto el índice que caduca el archivo.
 *
 * `expireAfterSeconds: 0` le dice a MongoDB que borre el documento cuando el
 * reloj pase de la fecha que hay en `venceEn`. Los documentos sin ese campo
 * —los expedientes todavía pendientes— no los toca.
 *
 * Se llama al arrancar. Crear un índice que ya existe no hace nada, así que
 * repetirlo en cada arranque es gratis y evita que el día que se cambie de base
 * el archivo se quede sin caducidad y nadie lo note.
 */
export async function prepararCaducidad(): Promise<boolean> {
  const c = coleccion()
  if (!c) return false
  try {
    await c.createIndex({ venceEn: 1 }, { expireAfterSeconds: 0, name: 'caducidadArchivo' })
    return true
  } catch (e: any) {
    console.error('[fotosDocumento] no se pudo crear el índice de caducidad:', e?.message)
    return false
  }
}

/** Borra las fotos de una identidad. No falla si no había ninguna. */
export async function borrarFotos(idn: string): Promise<void> {
  const c = coleccion()
  if (c) {
    await c.deleteOne({ _id: idn })
    return
  }
  const m = leerMapa()
  if (!(idn in m)) return
  delete m[idn]
  escribirMapa(m)
}

// ─────────────────────────────────────────────────────────────────────────────
// Mudanza de lo que ya estaba guardado mal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Saca del documento de estado las fotos que se guardaron ahí antes.
 *
 * Sin esto el arreglo no sirve de nada en el servidor que ya está corriendo:
 * las imágenes viejas siguen dentro del estado, siguen reescribiéndose en cada
 * guardado y el documento sigue creciendo hacia los 16 MB. Se ejecuta al
 * arrancar, una vez, y no hace nada si no hay nada que mover.
 *
 * Primero se guardan en su sitio nuevo y solo DESPUES se quitan del estado: si
 * el guardado falla, se quedan donde estaban —incómodas, pero no perdidas— y se
 * vuelve a intentar en el siguiente arranque.
 */
export async function migrarFotosDelEstado(): Promise<{
  movidas: number; sueltas: number; fallidas: number
}> {
  let movidas = 0, sueltas = 0, fallidas = 0

  for (const identidad of store.todo().identidades) {
    const imagenes = identidad.documento?.imagenes
    if (!imagenes?.anverso || !imagenes?.reverso) continue

    // De un expediente ya decidido las fotos no se mudan: se tiran. Tendrían que
    // haberse soltado al aprobar o rechazar, y copiarlas a la colección nueva
    // sería resucitar documentos de identidad ajenos que ya no hace falta que
    // nadie vea.
    const decidida = identidad.estado === 'verificada' || identidad.estado === 'rechazada' ||
      identidad.estado === 'suspendida'
    if (decidida) {
      identidad.documento!.imagenes = null
      sueltas++
      continue
    }

    try {
      await guardarFotos(identidad.id, imagenes)
      identidad.documento!.imagenes = null
      movidas++
    } catch (e: any) {
      fallidas++
      console.error(
        `[fotosDocumento] no se pudieron mudar las fotos de ${identidad.id}:`, e?.message)
    }
  }

  // Un solo volcado al final, y esperado: hasta que el estado se escriba sin las
  // imágenes, la mudanza no ha servido para nada.
  if (movidas || sueltas) await store.guardarYa()
  return { movidas, sueltas, fallidas }
}
