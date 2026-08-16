// La foto de la credencial: el retrato que lleva el Genesis ID de una persona.
//
// POR QUE NO VIVE DENTRO DEL EXPEDIENTE
//
// Es la MISMA razón que las fotos del documento —el estado entero del motor vive
// en un único documento de MongoDB, y un documento de MongoDB no puede pasar de
// 16 MB— pero esta bomba es más lenta y por eso pasó desapercibida cuando se
// desactivó la otra.
//
// Las fotos del documento se sueltan al decidir el expediente, así que solo
// pesan mientras hay verificaciones en cola. El retrato de la credencial NO se
// suelta nunca: es la credencial. Cada persona verificada suma hasta 546 kB de
// base64 (el tope son 400 kB de imagen) y no los devuelve jamás. Con unas
// treinta credenciales se vuelve a pasar de 16 MB.
//
// Y cuando se pasa no falla la subida de la foto: falla `volcar()`, o sea el
// guardado de TODO. Eso ya ocurrió una vez, y se llevó por delante algo peor que
// unos datos: rompió la cadena de hashes de la bitácora de auditoría, porque la
// bitácora vive dentro de ese mismo documento y las entradas nuevas se perdían
// en silencio mientras el servicio seguía respondiendo 200.
//
// Así que el retrato se guarda aparte, un documento por identidad, con el id de
// la identidad como `_id`. Sin Mongo va a un archivo hermano del de estado; lo
// que no se hace nunca, en ningún motor, es devolverlo al documento de estado.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs'
import { dirname } from 'path'
import { coleccionAparte, archivoAparte, store } from '../store.js'

const NOMBRE = 'fotosCredencial'

const coleccion = () => coleccionAparte(NOMBRE)

// ─────────────────────────────────────────────────────────────────────────────
// Motor de archivo: un JSON hermano del de estado, `{ idIdentidad: base64 }`
// ─────────────────────────────────────────────────────────────────────────────

type Mapa = Record<string, string>

function leerMapa(): Mapa {
  const ruta = archivoAparte(NOMBRE)
  if (!existsSync(ruta)) return {}
  try {
    const leido = JSON.parse(readFileSync(ruta, 'utf8'))
    return leido && typeof leido === 'object' ? leido as Mapa : {}
  } catch {
    // Un archivo de retratos ilegible no puede tumbar el arranque: son fotos
    // que se pueden volver a pedir, no el expediente.
    return {}
  }
}

function escribirMapa(m: Mapa): void {
  const ruta = archivoAparte(NOMBRE)
  mkdirSync(dirname(ruta), { recursive: true })
  const temporal = `${ruta}.tmp`
  writeFileSync(temporal, JSON.stringify(m))
  renameSync(temporal, ruta)
}

// ─────────────────────────────────────────────────────────────────────────────
// Guardar, leer, borrar
// ─────────────────────────────────────────────────────────────────────────────

/** Guarda el retrato de una identidad. Reemplaza el que hubiera. */
export async function guardarFoto(idn: string, base64: string): Promise<void> {
  const c = coleccion()
  if (c) {
    await c.replaceOne(
      { _id: idn },
      { _id: idn, foto: base64, guardadaEn: new Date() },
      { upsert: true },
    )
    return
  }
  const m = leerMapa()
  m[idn] = base64
  escribirMapa(m)
}

/** El retrato de una identidad, o `null` si no tiene. */
export async function leerFoto(idn: string): Promise<string | null> {
  const c = coleccion()
  if (c) {
    const d = await c.findOne({ _id: idn })
    return typeof d?.foto === 'string' && d.foto ? d.foto : null
  }
  return leerMapa()[idn] ?? null
}

/** Borra el retrato. No falla si no había ninguno. */
export async function borrarFoto(idn: string): Promise<void> {
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
 * Saca del documento de estado los retratos que se guardaron ahí antes.
 *
 * Sin esto el arreglo no sirve de nada en el servidor que ya está corriendo:
 * los retratos viejos siguen dentro del estado, siguen reescribiéndose en cada
 * guardado y el documento sigue creciendo. Se ejecuta al arrancar, una vez, y
 * no hace nada si no hay nada que mover.
 *
 * Primero se guarda en su sitio nuevo y solo DESPUES se quita del estado: si el
 * guardado falla, el retrato se queda donde estaba —incómodo, pero no perdido—
 * y se vuelve a intentar en el siguiente arranque.
 *
 * A diferencia de las fotos del documento, aquí NO se tira nada por estar el
 * expediente decidido: el retrato de una identidad verificada es precisamente
 * el que hay que conservar.
 */
export async function migrarFotosCredencialDelEstado(): Promise<{
  movidas: number; fallidas: number
}> {
  let movidas = 0, fallidas = 0

  for (const identidad of store.todo().identidades) {
    const foto = identidad.fotoCredencial
    if (!foto) continue
    try {
      await guardarFoto(identidad.id, foto)
      identidad.fotoCredencial = null
      movidas++
    } catch (e: any) {
      fallidas++
      console.error(
        `[fotoCredencial] no se pudo mudar el retrato de ${identidad.id}:`, e?.message)
    }
  }

  // Un solo volcado al final, y esperado: hasta que el estado se escriba sin los
  // retratos, la mudanza no ha servido para nada.
  if (movidas) await store.guardarYa()
  return { movidas, fallidas }
}
