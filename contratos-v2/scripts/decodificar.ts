// Lo que de verdad hace una transacción de la Safe, sacado de los datos que se firman (no del título
// ni de lo que diga la plataforma): cada llamada con su destino, su monto y sus datos.
import { Interface, getAddress, getBytes, hexlify, toBigInt, TypedDataEncoder } from 'ethers'

export interface LlamadaLeida { to: string; value: bigint; data: string }

const MULTISEND = new Interface(['function multiSend(bytes transactions)'])

/**
 * `operation` 0: una llamada directa. `operation` 1 (DELEGATECALL): solo se acepta hacia el
 * MultiSendCallOnly que conoce el custodio; un DELEGATECALL a otro contrato le daría control de la Safe.
 */
export function llamadasDe(m: { to: string; value: string | bigint; data: string; operation: string | number }, multisend?: string): LlamadaLeida[] {
  const op = Number(m.operation)
  if (op === 0) return [{ to: getAddress(m.to), value: BigInt(m.value), data: String(m.data).toLowerCase() }]
  if (op !== 1) throw new Error(`operation ${m.operation} desconocida`)
  if (!multisend) throw new Error('Es un lote (DELEGATECALL): falta MULTISEND, la dirección del MultiSendCallOnly desplegado con la Safe')
  if (getAddress(m.to) !== getAddress(multisend)) throw new Error(`DELEGATECALL a ${m.to}, que no es el MultiSendCallOnly ${multisend}: NO FIRMAR`)
  if (BigInt(m.value) !== 0n) throw new Error('un lote no lleva monto propio')
  const [paquete] = MULTISEND.decodeFunctionData('multiSend', m.data)
  const b = getBytes(paquete)
  const salida: LlamadaLeida[] = []
  let i = 0
  while (i < b.length) {
    if (i + 85 > b.length) throw new Error('lote mal formado')
    const operacion = b[i]
    if (operacion !== 0) throw new Error('una llamada del lote no es CALL')
    const to = getAddress(hexlify(b.slice(i + 1, i + 21)))
    const value = toBigInt(b.slice(i + 21, i + 53))
    const largo = Number(toBigInt(b.slice(i + 53, i + 85)))
    if (i + 85 + largo > b.length) throw new Error('lote mal formado')
    salida.push({ to, value, data: hexlify(b.slice(i + 85, i + 85 + largo)).toLowerCase() })
    i += 85 + largo
  }
  return salida
}

/** El hash EIP-712 de lo que se firma, para compararlo con el que muestra el panel. */
export function hashDe(t: { domain: any; types: any; message: any }): string {
  return TypedDataEncoder.hash(t.domain, t.types, t.message)
}
