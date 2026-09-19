// Aritmética decimal exacta sobre cadenas.
//
// Los montos de la plataforma nunca se tocan con números de coma flotante:
// 0.1 + 0.2 no da 0.3, y en una custodia que suma y resta miles de veces al
// día esa diferencia se convierte en un saldo que no cuadra y que nadie sabe
// de dónde salió. Todo pasa por BigInt con una escala fija de 18 decimales —
// la de la cadena— y se redondea solo al final, hacia abajo, que es la única
// dirección segura cuando se mueve dinero ajeno.

const ESCALA = 18n
const UNO = 10n ** ESCALA

const FORMA = /^-?\d+(\.\d+)?$/

/** Convierte «12.5» a su entero escalado. Rechaza cualquier cosa que no sea un decimal. */
function aEntero(x: string | number): bigint {
  const s = String(x ?? '').trim()
  if (!FORMA.test(s)) throw new Error(`Monto inválido: «${s}»`)
  const negativo = s.startsWith('-')
  const [ent, dec = ''] = (negativo ? s.slice(1) : s).split('.')
  if (dec.length > Number(ESCALA)) throw new Error(`Demasiados decimales: «${s}»`)
  const v = BigInt(ent) * UNO + BigInt(dec.padEnd(Number(ESCALA), '0'))
  return negativo ? -v : v
}

/** De entero escalado a cadena decimal sin ceros sobrantes. */
function aCadena(v: bigint): string {
  const negativo = v < 0n
  const abs = negativo ? -v : v
  const ent = abs / UNO
  const dec = (abs % UNO).toString().padStart(Number(ESCALA), '0').replace(/0+$/, '')
  return `${negativo ? '-' : ''}${ent}${dec ? '.' + dec : ''}`
}

export const Dec = {
  esValido: (x: unknown): boolean => typeof x === 'string' || typeof x === 'number' ? FORMA.test(String(x).trim()) : false,

  /** Normaliza: «012.500» → «12.5». Lanza si no es un decimal. */
  n: (x: string | number): string => aCadena(aEntero(x)),

  sumar: (a: string | number, b: string | number): string => aCadena(aEntero(a) + aEntero(b)),
  restar: (a: string | number, b: string | number): string => aCadena(aEntero(a) - aEntero(b)),

  /** a × b, exacto hasta 18 decimales, redondeado hacia abajo. */
  multiplicar: (a: string | number, b: string | number): string => aCadena((aEntero(a) * aEntero(b)) / UNO),

  /** a ÷ b, redondeado hacia abajo a 18 decimales. Lanza si b es cero. */
  dividir: (a: string | number, b: string | number): string => {
    const d = aEntero(b)
    if (d === 0n) throw new Error('División por cero')
    return aCadena((aEntero(a) * UNO) / d)
  },

  /** -1, 0 o 1. */
  comparar: (a: string | number, b: string | number): number => {
    const x = aEntero(a), y = aEntero(b)
    return x < y ? -1 : x > y ? 1 : 0
  },
  mayor: (a: string | number, b: string | number): boolean => aEntero(a) > aEntero(b),
  mayorIgual: (a: string | number, b: string | number): boolean => aEntero(a) >= aEntero(b),
  menor: (a: string | number, b: string | number): boolean => aEntero(a) < aEntero(b),
  menorIgual: (a: string | number, b: string | number): boolean => aEntero(a) <= aEntero(b),
  igual: (a: string | number, b: string | number): boolean => aEntero(a) === aEntero(b),
  esCero: (a: string | number): boolean => aEntero(a) === 0n,
  esPositivo: (a: string | number): boolean => aEntero(a) > 0n,
  esNegativo: (a: string | number): boolean => aEntero(a) < 0n,
  negar: (a: string | number): string => aCadena(-aEntero(a)),
  abs: (a: string | number): string => { const v = aEntero(a); return aCadena(v < 0n ? -v : v) },
  min: (a: string | number, b: string | number): string => aCadena(aEntero(a) < aEntero(b) ? aEntero(a) : aEntero(b)),
  max: (a: string | number, b: string | number): string => aCadena(aEntero(a) > aEntero(b) ? aEntero(a) : aEntero(b)),

  /**
   * Redondea a `decimales` HACIA ABAJO (trunca).
   *
   * Es la única forma correcta de recortar un monto que se va a acreditar:
   * redondear hacia arriba crea dinero de la nada, y a la larga la suma de los
   * saldos deja de coincidir con lo que hay en custodia.
   */
  truncar: (a: string | number, decimales: number): string => {
    const v = aEntero(a)
    const factor = 10n ** BigInt(Number(ESCALA) - decimales)
    const t = v / factor * factor
    return aCadena(t)
  },

  /** Redondeo comercial (mitad hacia arriba), solo para PRECIOS y cifras de pantalla. */
  redondear: (a: string | number, decimales: number): string => {
    const v = aEntero(a)
    const factor = 10n ** BigInt(Number(ESCALA) - decimales)
    const resto = v % factor
    let base = v - resto
    if (resto * 2n >= factor) base += factor
    if (resto < 0n && -resto * 2n >= factor) base -= factor
    return aCadena(base)
  },

  /** Con exactamente `decimales` decimales (rellena con ceros), para mostrar. */
  fijar: (a: string | number, decimales: number): string => {
    const t = Dec.redondear(a, decimales)
    if (decimales === 0) return t.split('.')[0]
    const [ent, dec = ''] = t.split('.')
    return `${ent}.${dec.padEnd(decimales, '0')}`
  },

  /** A número de coma flotante, solo para estadísticas y comparaciones laxas. */
  aNumero: (a: string | number): number => Number(aCadena(aEntero(a))),

  /** De un número (p. ej. un precio de referencia calculado) a cadena, con `decimales`. */
  deNumero: (n: number, decimales = 8): string => {
    if (!Number.isFinite(n)) throw new Error('Número no finito')
    return Dec.redondear(n.toFixed(Math.min(decimales, 18)), decimales)
  },

  /** Cuántos decimales trae la cadena. */
  decimalesDe: (a: string | number): number => {
    const s = Dec.n(a)
    return s.includes('.') ? s.split('.')[1].length : 0
  },

  /**
   * Convierte un valor entero de la cadena (wei, 18 decimales) a cadena decimal.
   * Acepta hex («0x…») o decimal.
   */
  deWei: (crudo: string | bigint, decimalesCadena = 18): string => {
    const v = typeof crudo === 'bigint' ? crudo : BigInt(crudo)
    if (decimalesCadena === Number(ESCALA)) return aCadena(v)
    const dif = BigInt(Number(ESCALA) - decimalesCadena)
    return aCadena(dif >= 0n ? v * 10n ** dif : v / 10n ** -dif)
  },
}

export const CERO = '0'
