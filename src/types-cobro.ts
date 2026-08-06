// ─────────────────────────────────────────────────────────────────────────────
// El dominio de cobro: cobros, partes de una cuenta dividida, movimientos del
// saldo del comercio y retiros a lempiras.
//
// Tres decisiones gobiernan todo lo de aquí, y conviene entenderlas antes de
// tocar nada:
//
// 1. LA TASA SE CONGELA. Un cobro guarda cuántos lempiras valía un ORIGEN en el
//    instante en que se creó, y un retiro hace lo mismo. Si el precio del oro se
//    mueve mientras el cliente saca el teléfono, ni el comercio ni el cliente
//    pierden: los dos acordaron un número y ese número es el que vale.
//
// 2. EL SALDO NO SE GUARDA, SE CALCULA. No hay un campo `saldo` que alguien
//    pueda dejar mal por un fallo a mitad de camino. El saldo es la suma de los
//    movimientos, y cada movimiento dice de dónde salió. Un descuadre se puede
//    encontrar; un número suelto, no.
//
// 3. UNA PARTE PAGADA NO SE VUELVE A COBRAR. Cada parte de una cuenta dividida
//    tiene su propio estado, y quien la reserva la bloquea por unos minutos. Sin
//    eso, dos amigos tocando "pagar" a la vez pagan la misma porción y el
//    comercio cobra de menos.
// ─────────────────────────────────────────────────────────────────────────────

/** Cuántos minutos aguanta una parte reservada antes de volver a quedar libre. */
export const MINUTOS_RESERVA = 8

/** Cuánto vive un cobro sin pagarse. Una cuenta de restaurante no dura un día. */
export const MINUTOS_VIGENCIA_COBRO = 60

export type EstadoCobro = 'abierto' | 'pagado' | 'anulado' | 'vencido'
export type EstadoParte = 'libre' | 'reservada' | 'pagada'
export type EstadoRetiro = 'solicitado' | 'en_proceso' | 'pagado' | 'rechazado'

export interface ParteCobro {
  id: string
  indice: number
  montoOrigen: number
  estado: EstadoParte
  /** Quién la tiene tomada o la pagó. */
  pagadorId: string | null
  /** Nombre para enseñar en la pantalla del comercio mientras se llena la cuenta. */
  pagadorNombre: string | null
  reservadaHasta: string | null
  pagadaEn: string | null
  /** Hash de la transferencia en la cadena 8532. */
  txHash: string | null
  /**
   * Qué dijo la cadena 8532 del comprobante: 'confirmada' es dinero en la
   * billetera del comercio; null es que aún no se ha preguntado.
   */
  verificacionCadena?: string | null
}

/**
 * Una línea de la orden: qué se vendió y cuánto.
 *
 * Se guarda aparte del concepto porque un texto no se puede sumar. Sin esto,
 * «los productos más vendidos» habría que adivinarlo troceando una frase, y a
 * la primera venta con una coma en el nombre del plato deja de cuadrar.
 */
export interface ArticuloVendido {
  nombre: string
  cantidad: number
  /** En lempiras, ya convertido si el menú lo tenía en dólares. */
  precioUnitarioHnl: number
}

export interface Cobro {
  id: string
  companyId: string
  creadoPor: string
  concepto: string
  /** El desglose de la orden, cuando vino del menú. */
  articulos?: ArticuloVendido[]
  /** El comercio piensa en lempiras; la cadena mueve ORIGEN. Se guardan los dos. */
  montoHnl: number
  montoOrigen: number
  /** Lempiras por ORIGEN en el momento de crear el cobro. Congelada a propósito. */
  tasaHnlPorOrigen: number
  partes: ParteCobro[]
  /** Código corto para teclear cuando la cámara no coopera. */
  codigo: string
  estado: EstadoCobro
  creadoEn: string
  venceEn: string
  pagadoEn: string | null
}

export type TipoMovimiento = 'cobro' | 'retiro' | 'reverso' | 'ajuste'

export interface Movimiento {
  id: string
  companyId: string
  tipo: TipoMovimiento
  /** Positivo entra al comercio, negativo sale. Nunca se edita: se compensa. */
  montoOrigen: number
  concepto: string
  referencia: string | null
  /** La parte del cobro que originó el abono, para poder confirmarla después. */
  parteId?: string | null
  /**
   * ¿La cadena 8532 respalda este dinero?
   *
   * Un abono nace en `false`: la app dijo que pagó y la mesa se cierra, pero
   * hasta que la cadena confirme el depósito ese ORIGEN no existe en la
   * billetera del comercio y NO se puede retirar. Los retiros nacen en `true`:
   * los paga una persona con lempiras de verdad.
   */
  confirmado?: boolean
  creadoEn: string
}

export interface CuentaBanco {
  banco: string
  tipoCuenta: 'ahorro' | 'cheques'
  numeroCuenta: string
  titular: string
  identidad: string
}

export interface Retiro {
  id: string
  companyId: string
  solicitadoPor: string
  montoOrigen: number
  tasaHnlPorOrigen: number
  montoHnl: number
  banco: CuentaBanco
  estado: EstadoRetiro
  nota: string | null
  solicitadoEn: string
  resueltoEn: string | null
  resueltoPor: string | null
}

/**
 * Reparte un monto en `n` partes sin perder ni un centavo por el redondeo.
 *
 * Dividir 100 entre 3 y redondear cada parte da 33,33 × 3 = 99,99: falta un
 * centavo, y ese centavo lo termina poniendo el comercio. Aquí las primeras
 * partes cargan con el sobrante, así que la suma siempre cuadra exacta.
 */
export function repartir(total: number, n: number, decimales = 6): number[] {
  const factor = 10 ** decimales
  const totalEnteros = Math.round(total * factor)
  const base = Math.floor(totalEnteros / n)
  const sobra = totalEnteros - base * n
  return Array.from({ length: n }, (_, i) => (base + (i < sobra ? 1 : 0)) / factor)
}

/**
 * Código corto y legible en voz alta.
 *
 * Sin I, O, 0 ni 1: en la pantalla de un teléfono con grasa de pollo frito, un
 * cero y una O son la misma cosa, y quien dicta el código por encima del ruido
 * de un comedor no tiene por qué deletrear.
 */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generarCodigo(): string {
  let s = ''
  for (let i = 0; i < 6; i += 1) s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)]
  return `${s.slice(0, 3)}-${s.slice(3)}`
}
