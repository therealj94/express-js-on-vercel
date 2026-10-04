// Almacenamiento de la plataforma.
//
// Dos motores, como en Genesis ID:
//   - MongoDB (MIGRACION_MONGO_URL): el de producción. En Render el disco se
//     borra en cada despliegue, y una foto de saldos o una aprobación perdidas
//     no se pueden reconstruir con certeza.
//   - archivo JSON (por defecto): para desarrollo y pruebas.
//
// Todo vive en un solo documento que se vuelca entero tras cada cambio. A esta
// escala (cientos de tenedores, decenas de aprobaciones) es lo más simple y no
// deja el conjunto a medio escribir.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs'
import { dirname } from 'path'

export type Clase = 'usuario' | 'tesoreria' | 'sistema' | 'externa'
export type TipoLista = 'usuarios' | 'tesoreria' | 'sistema' | 'inventario'

export interface Tenedor { direccion: string; saldo: string; clase: Clase }

export interface Foto {
  id: string
  activo: string
  bloque: number
  creada: string
  autor: string
  estado: 'en-curso' | 'lista' | 'publicada' | 'fallida'
  error?: string
  supply?: string
  raiz?: string
  tenedores?: Tenedor[]
  sumas?: Record<Clase, string>
  sinUbicar?: string
  publicada?: string
}

export interface Conciliacion {
  activo: string
  fotoId: string
  contratoV2: string
  fecha: string
  bloque: number
  supplyV2: string
  esperado: string
  diferencias: { direccion: string; foto: string; v2: string }[]
  cuadra: boolean
}

export interface Aprobacion { firmante: string; fecha: string }

export interface Liberacion {
  id: string
  tipo: 'liberacion' | 'regalo-gas'
  /** En la unidad mínima (wei), como texto. */
  monto: string
  destino: string
  motivo: string
  /** Referencia documental de lo que asegura la liberación. */
  respaldo: string
  autor: string
  creada: string
  estado: 'propuesta' | 'aprobada' | 'ejecutada' | 'rechazada'
  aprobaciones: Aprobacion[]
  rechazo?: { firmante: string; fecha: string; motivo: string }
  tx?: string
  ejecutada?: string
}

export interface Regalo {
  direccion: string
  estado: 'pendiente' | 'enviado'
  liberacion: string
  tx?: string
  fecha?: string
}

export interface Evento { fecha: string; actor: string; accion: string; detalle: Record<string, unknown> }

export interface Datos {
  listas: Record<TipoLista, { direcciones: string[]; actualizada: string | null; autor: string | null }>
  fotos: Foto[]
  conciliaciones: Conciliacion[]
  liberaciones: Liberacion[]
  regalos: Regalo[]
  bitacora: Evento[]
}

export function vacio(): Datos {
  const lista = () => ({ direcciones: [] as string[], actualizada: null, autor: null })
  return {
    listas: { usuarios: lista(), tesoreria: lista(), sistema: lista(), inventario: lista() },
    fotos: [], conciliaciones: [], liberaciones: [], regalos: [], bitacora: [],
  }
}

export interface Almacen {
  datos: Datos
  guardar(): Promise<void>
  motor: 'mongodb' | 'archivo' | 'memoria'
}

export function enMemoria(): Almacen {
  return { datos: vacio(), guardar: async () => {}, motor: 'memoria' }
}

export function enArchivo(ruta: string): Almacen {
  let datos = vacio()
  if (existsSync(ruta)) datos = { ...vacio(), ...JSON.parse(readFileSync(ruta, 'utf8')) }
  return {
    get datos() { return datos },
    motor: 'archivo',
    async guardar() {
      mkdirSync(dirname(ruta), { recursive: true })
      writeFileSync(ruta + '.tmp', JSON.stringify(datos))
      renameSync(ruta + '.tmp', ruta)
    },
  }
}

export async function enMongo(url: string, base: string): Promise<Almacen> {
  const { MongoClient } = await import('mongodb')
  const cliente = await new MongoClient(url).connect()
  const col = cliente.db(base).collection<{ _id: string; datos: Datos }>('plataforma')
  const doc = await col.findOne({ _id: 'datos' })
  const datos: Datos = { ...vacio(), ...(doc?.datos || {}) }
  // Escrituras en fila: dos cambios seguidos no pueden llegar en desorden.
  let cola: Promise<unknown> = Promise.resolve()
  return {
    datos,
    motor: 'mongodb',
    guardar() {
      cola = cola.then(() => col.replaceOne({ _id: 'datos' }, { datos }, { upsert: true }))
      return cola as Promise<void>
    },
  }
}

export function registrar(a: Almacen, actor: string, accion: string, detalle: Record<string, unknown> = {}) {
  a.datos.bitacora.push({ fecha: new Date().toISOString(), actor, accion, detalle })
}

export const nuevoId = (prefijo: string) =>
  `${prefijo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
