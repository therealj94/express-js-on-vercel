// ─────────────────────────────────────────────────────────────────────────────
// Cliente del cobro: cobros, pagos, saldo y retiros.
//
// A diferencia del resto de la app, esto NUNCA habla con datos simulados.
// Aquí se mueve dinero de verdad, y una pantalla que finge cobrar es peor que
// una que avisa de que no hay servidor: la primera hace creer al comercio que
// vendió.
//
// Si el servidor no responde, se dice con todas las letras y no se inventa nada.
// ─────────────────────────────────────────────────────────────────────────────

import Constants from 'expo-constants'
import { getToken } from './token'
import { ApiError } from './apiError'

/**
 * La URL del servidor.
 *
 * PRODUCCIÓN es el valor por defecto, no localhost. Parece un detalle y no lo
 * es: la variable de entorno se hornea al compilar el APK, pero una
 * actualización por aire se publica sin ella, y con el orden anterior la app
 * ya instalada caía a `http://localhost:3001` — un servidor que en un teléfono
 * no existe. La app quedaba muerta hasta reinstalarla, que es exactamente lo
 * que las actualizaciones por aire venían a evitar.
 *
 * El descubrimiento LAN queda solo para desarrollo (`__DEV__`), que es el único
 * sitio donde tiene sentido buscar la API en la máquina que sirve el bundle.
 */
const API_PRODUCCION = 'https://mytokenpay-api-5ab43b64205a.herokuapp.com'

function resolverUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_URL
  if (env) return env.replace(/\/$/, '')

  // Solo en desarrollo: la API vive en la misma máquina que sirve el bundle.
  if (__DEV__) {
    const host =
      Constants.expoConfig?.hostUri ??
      (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost
    if (host) return `http://${host.split(':')[0]}:3001`
  }
  return API_PRODUCCION
}

export const API_URL = resolverUrl()

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const token = await getToken()
  let r: Response
  try {
    r = await fetch(`${API_URL}/api${ruta}`, {
      ...opciones,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opciones.headers as Record<string, string> | undefined),
      },
    })
  } catch {
    throw new ApiError(
      `No se pudo conectar con el servidor de cobros (${API_URL}). Revisá tu conexión.`,
      0,
    )
  }

  const cuerpo = r.headers.get('content-type')?.includes('application/json') ? await r.json() : null
  if (!r.ok) {
    const detalle = cuerpo?.detalle ? `\n${cuerpo.detalle}` : ''
    throw new ApiError((cuerpo?.error ?? 'Algo salió mal') + detalle, r.status)
  }
  return cuerpo as T
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export type EstadoCobro = 'abierto' | 'pagado' | 'anulado' | 'vencido'
export type EstadoParte = 'libre' | 'reservada' | 'pagada'

export interface Parte {
  id: string
  indice: number
  montoOrigen: number
  montoHnl?: number
  estado: EstadoParte
  pagadorNombre: string | null
  pagadaEn?: string | null
  txHash?: string | null
  verificacionCadena?: string | null
}

export interface Cobro {
  id: string
  codigo: string
  concepto: string
  montoHnl: number
  montoOrigen: number
  tasaHnlPorOrigen: number
  estado: EstadoCobro
  partes: Parte[]
  creadoEn: string
  venceEn: string
  pagadoEn: string | null
}

export interface CobroPublico {
  codigo: string
  concepto: string
  montoHnl: number
  montoOrigen: number
  tasaHnlPorOrigen: number
  estado: EstadoCobro
  venceEn: string
  negocio: { nombre: string; logo: string | null; verificado: boolean; direccion: string | null } | null
  partes: Parte[]
}

export interface ArticuloVendido {
  nombre: string
  cantidad: number
  precioUnitarioHnl: number
}

export interface PagoMio {
  codigo: string
  concepto: string
  articulos: ArticuloVendido[]
  negocio: {
    id: string
    nombre: string
    logo: string | null
    categoria: string
    ciudad: string
    direccion: string
  } | null
  montoHnl: number
  montoOrigen: number
  tasaHnlPorOrigen: number
  dividida: boolean
  partesTotales: number
  totalCuentaHnl: number
  pagadaEn: string | null
  txHash: string | null
  verificacionCadena: string | null
  estadoCobro: string
}

export interface MisPagos {
  pagos: PagoMio[]
  resumen: {
    pagos: number
    totalHnl: number
    totalOrigen: number
    comercios: number
    ticketPromedioHnl: number
  }
}

export interface Estadisticas {
  hoy: { ventas: number; hnl: number; origen: number }
  mes: { ventas: number; hnl: number; origen: number }
  total: { ventas: number; hnl: number; origen: number }
  ticketPromedioHnl: number
  porConfirmar: { ventas: number; hnl: number }
  diario: { dia: string; hnl: number; ventas: number }[]
  mensual: { mes: string; hnl: number; ventas: number }[]
  productos: { nombre: string; cantidad: number; hnl: number; ordenes: number }[]
  horas: { hora: number; ventas: number; hnl: number }[]
  mejorDia: { dia: string; hnl: number; ventas: number }
}

export interface Saldo {
  saldo: {
    total: number
    /** Lo que la cadena 8532 respalda: dinero de verdad en la billetera. */
    confirmado: number
    /** Pagos que la app dio por hechos y la cadena aún no avala. No se retira. */
    porConfirmar: number
    retenido: number
    disponible: number
  }
  enLempiras: {
    total: number
    confirmado: number
    porConfirmar: number
    disponible: number
    tasaHnlPorOrigen: number
    fuente: string
  } | null
  movimientos: Movimiento[]
}

export interface Movimiento {
  id: string
  tipo: 'cobro' | 'retiro' | 'reverso' | 'ajuste'
  montoOrigen: number
  concepto: string
  confirmado?: boolean
  creadoEn: string
}

export interface Retiro {
  id: string
  montoOrigen: number
  montoHnl: number
  tasaHnlPorOrigen: number
  estado: 'solicitado' | 'en_proceso' | 'pagado' | 'rechazado'
  banco: { banco: string; tipoCuenta: string; numeroCuenta: string; titular: string }
  nota: string | null
  solicitadoEn: string
  resueltoEn: string | null
}

// ── El comercio cobra ────────────────────────────────────────────────────────

export const pos = {
  crearCobro: (data: {
    montoHnl: number
    concepto?: string
    partes?: number
    articulos?: { nombre: string; cantidad: number; precioUnitarioHnl: number }[]
  }) =>
    pedir<{ cobro: Cobro }>('/cobros', { method: 'POST', body: JSON.stringify(data) }),

  misCobros: (desde?: string) =>
    pedir<{ cobros: Cobro[] }>(`/cobros/mios${desde ? `?desde=${encodeURIComponent(desde)}` : ''}`),

  miCobro: (id: string) => pedir<{ cobro: Cobro }>(`/cobros/mios/${id}`),

  anularCobro: (id: string) =>
    pedir<{ cobro: Cobro }>(`/cobros/mios/${id}/anular`, { method: 'POST' }),

  /** Lo que YO he pagado, con el detalle de cada compra. */
  misPagos: () => pedir<MisPagos>('/actividad/mis-pagos'),

  /** Lo que MI COMERCIO ha vendido, agregado. */
  estadisticas: () => pedir<Estadisticas>('/actividad/estadisticas'),

  /** Pregunta a la cadena 8532 si cada comprobante es un depósito real. */
  verificarCobro: (id: string) =>
    pedir<{ cobro: Cobro; resumen: { pagadas: number; depositadasEnCadena: number; todoDepositado: boolean } }>(
      `/cobros/mios/${id}/verificar`,
      { method: 'POST' },
    ),

  // ── El cliente paga ────────────────────────────────────────────────────────

  verCobro: (codigo: string) =>
    pedir<{ cobro: CobroPublico }>(`/cobros/codigo/${encodeURIComponent(codigo)}`),

  reservar: (codigo: string, parteIds: string[]) =>
    pedir<{ cobro: CobroPublico }>(`/cobros/codigo/${encodeURIComponent(codigo)}/reservar`, {
      method: 'POST',
      body: JSON.stringify({ parteIds }),
    }),

  liberar: (codigo: string, parteIds: string[]) =>
    pedir<{ cobro: CobroPublico }>(`/cobros/codigo/${encodeURIComponent(codigo)}/liberar`, {
      method: 'POST',
      body: JSON.stringify({ parteIds }),
    }),

  pagar: (codigo: string, data: { parteIds: string[]; txHash: string; sello: string }) =>
    pedir<{ cobro: CobroPublico; cerrado: boolean; repetido: boolean }>(
      `/cobros/codigo/${encodeURIComponent(codigo)}/pagar`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  // ── Saldo y retiros ────────────────────────────────────────────────────────

  saldo: () => pedir<Saldo>('/retiros/saldo'),

  bancos: () => pedir<{ bancos: string[] }>('/retiros/bancos'),

  pedirRetiro: (data: {
    montoOrigen: number
    banco: {
      banco: string
      tipoCuenta: 'ahorro' | 'cheques'
      numeroCuenta: string
      titular: string
      identidad: string
    }
  }) => pedir<{ retiro: Retiro }>('/retiros', { method: 'POST', body: JSON.stringify(data) }),

  misRetiros: () => pedir<{ retiros: Retiro[] }>('/retiros/mios'),
}

// ── Ayudas de presentación ───────────────────────────────────────────────────

export const lempiras = (n: number) =>
  `L ${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const origen = (n: number) => {
  const d = n < 1 ? 4 : 2
  return `${n.toLocaleString('es-HN', { minimumFractionDigits: d, maximumFractionDigits: d })} ORIGEN`
}

/**
 * Sello único para que un reintento no cobre dos veces.
 *
 * Se genera UNA vez por intento de pago y se guarda mientras dura: si el
 * usuario toca dos veces o la red se corta y la app reintenta, tiene que viajar
 * el mismo sello. Generarlo en cada envío lo volvería inútil.
 */
export function nuevoSello(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Lo que se codifica en el QR del cobro. */
export const enlaceCobro = (codigo: string) => `mytokenpay://pagar/${codigo}`
