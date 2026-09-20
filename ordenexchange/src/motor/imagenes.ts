// Las imágenes del chat, fuera del documento principal.
//
// Todo el estado de OrdenExchange vive en un documento (archivo JSON o un
// documento de Mongo). Un comprobante de pago pesa hasta 1,5 MB en base64:
// con ocho de ellos dentro, el documento de Mongo pasa de 16 MB y deja de
// poder guardarse — y con él, los saldos. Así que las imágenes van aparte:
// una por archivo en disco, o un documento por imagen en su propia colección,
// y en el mensaje queda solo su identificador.

import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { coleccionAparte } from '../store.js'
import { id as nuevoId } from '../lib/uid.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CARPETA = process.env.ORDENEX_IMAGENES_DIR
  || (process.env.VERCEL ? '/tmp/ordenexchange-imagenes' : join(__dirname, '..', '..', 'data', 'imagenes'))

const ruta = (idImagen: string) => join(CARPETA, `${idImagen.replace(/[^a-z0-9_]/gi, '')}.txt`)

export async function guardar(dataUrl: string): Promise<string> {
  const idImagen = nuevoId('img')
  const col = coleccionAparte('imagenes')
  if (col) {
    await col.insertOne({ _id: idImagen, datos: dataUrl, en: new Date() })
  } else {
    mkdirSync(CARPETA, { recursive: true })
    writeFileSync(ruta(idImagen), dataUrl)
  }
  return idImagen
}

export async function leer(idImagen: string): Promise<string | null> {
  const col = coleccionAparte('imagenes')
  if (col) {
    const d = await col.findOne({ _id: idImagen })
    return d?.datos ?? null
  }
  const r = ruta(idImagen)
  return existsSync(r) ? readFileSync(r, 'utf8') : null
}

export async function borrar(idImagen: string): Promise<void> {
  const col = coleccionAparte('imagenes')
  if (col) { await col.deleteOne({ _id: idImagen }); return }
  const r = ruta(idImagen)
  if (existsSync(r)) unlinkSync(r)
}
