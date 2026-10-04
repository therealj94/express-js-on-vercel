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

export interface Tenedor {
  direccion: string
  /** Saldo en el contrato heredado, en el bloque de la foto. */
  saldo: string
  clase: Clase
  /** Lo que se acuña en la v2 según la política de la moneda. */
  acunar: string
  /** Por qué no se acuña todo el saldo, si es el caso. */
  motivo?: 'umbral' | 'tope'
}

export interface Foto {
  id: string
  activo: string
  bloque: number
  creada: string
  autor: string
  estado: 'en-curso' | 'lista' | 'publicada' | 'fallida'
  error?: string
  supply?: string
  /** Raíz de Merkle de lo que se acuña (dirección y monto a acuñar). */
  raiz?: string
  tenedores?: Tenedor[]
  sumas?: Record<Clase, string>
  /** Total que se acuña y total que desaparece por la política. */
  acunar?: string
  excluido?: string
  sinUbicar?: string
  publicada?: string
  /** Hasta cuándo se puede reclamar lo no ubicado. */
  plazoReclamos?: string
}

/**
 * Reclamo de una dirección que la foto no encontró. El tenedor prueba que es
 * suya firmando un mensaje con esa misma billetera; se le aplica la misma
 * política y un operador lo revisa antes de sumarlo a la acuñación.
 */
export interface Reclamo {
  id: string
  fotoId: string
  activo: string
  direccion: string
  /** Saldo en el contrato heredado en el bloque de la foto. */
  saldo: string
  acunar: string
  motivo?: 'umbral' | 'tope'
  firma: string
  creado: string
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  revisor?: string
  revisado?: string
  nota?: string
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
  /** Lo que le falta para llegar a 1 ORIGEN, en wei. */
  monto: string
  estado: 'pendiente' | 'enviado'
  liberacion: string
  tx?: string
  fecha?: string
}

export interface FirmaSafe {
  /** La billetera del custodio que firmó (recuperada de la firma). */
  firmante: string
  /** El operador de la plataforma que entregó la firma. */
  operador: string
  firma: string
  fecha: string
}

/** Una transacción de la firma múltiple (operaciones.ts). */
export interface Operacion {
  id: string
  tipo: 'liberacion' | 'regalo-gas' | 'contratos' | 'anulacion'
  titulo: string
  liberacion?: string
  llamadas: { to: string; value: string; data: string }[]
  safeTx: { to: string; value: string; data: string; operation: 0 | 1; nonce: number }
  /** Hash EIP-712 de la transacción: lo que firman los custodios. */
  hash: string
  chainId: number
  safe: string
  firmas: FirmaSafe[]
  umbral: number
  estado: 'en-firma' | 'lista' | 'ejecutada' | 'anulada' | 'caducada'
  autor: string
  creada: string
  tx?: string
  ejecutada?: string
  anulacion?: { actor: string; motivo: string; fecha: string }
  /** En una anulación: la operación que deja sin efecto. */
  anula?: string
}

export interface Evento { fecha: string; actor: string; accion: string; detalle: Record<string, unknown> }

export interface Datos {
  listas: Record<TipoLista, { direcciones: string[]; actualizada: string | null; autor: string | null }>
  fotos: Foto[]
  conciliaciones: Conciliacion[]
  reclamos: Reclamo[]
  liberaciones: Liberacion[]
  regalos: Regalo[]
  operaciones: Operacion[]
  bitacora: Evento[]
}

export function vacio(): Datos {
  const lista = () => ({ direcciones: [] as string[], actualizada: null, autor: null })
  return {
    listas: { usuarios: lista(), tesoreria: lista(), sistema: lista(), inventario: lista() },
    fotos: [], conciliaciones: [], reclamos: [], liberaciones: [], regalos: [], operaciones: [], bitacora: [],
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
