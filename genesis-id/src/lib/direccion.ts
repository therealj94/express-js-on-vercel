// La dirección de billetera de un vínculo.
//
// OBLIGATORIA desde el SFSP v0.3 (§8.5 y §11). El límite de exposición se
// calcula POR GENESIS ID sumando todas las direcciones de la persona, y la
// relación «esta dirección es de esta identidad» vive únicamente aquí, en los
// vínculos. Un vínculo sin dirección es una billetera que el límite no ve.
//
// Es la misma regla que aplica el puente de las apps
// (infra/veta-wallet-backend/lib/genesisPuente.js → `normalizarDireccion`), y
// devuelve los mismos códigos: una app que se salte el puente choca aquí igual.
//
// Se acepta `0x` + 40 hexadecimales en minúsculas, en mayúsculas o con la suma
// de control EIP-55 correcta; nunca la dirección cero. Se guarda en minúsculas
// para que la misma billetera no cuente dos veces por venir escrita distinto.

import { keccak_256 } from '@noble/hashes/sha3'

export const CODIGOS_VINCULO = {
  SIN_DIRECCION: 'VINCULO_SIN_DIRECCION',
  DIRECCION_INVALIDA: 'VINCULO_DIRECCION_INVALIDA',
} as const

/** La dirección en minúsculas, o `null` si no es una dirección válida. */
export function normalizarDireccion(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const d = valor.trim()
  if (!/^0x[0-9a-fA-F]{40}$/.test(d)) return null
  const cuerpo = d.slice(2)
  const minus = cuerpo.toLowerCase()
  if (/^0+$/.test(minus)) return null
  if (cuerpo !== minus && cuerpo !== cuerpo.toUpperCase()) {
    const suma = Buffer.from(keccak_256(new TextEncoder().encode(minus))).toString('hex')
    for (let i = 0; i < 40; i++) {
      const c = cuerpo[i]
      if (!/[a-fA-F]/.test(c)) continue
      const debeSerMayuscula = parseInt(suma[i], 16) >= 8
      if ((c === c.toUpperCase()) !== debeSerMayuscula) return null
    }
  }
  return '0x' + minus
}
