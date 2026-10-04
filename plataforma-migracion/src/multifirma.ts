// La firma múltiple de la red: una Safe 1.4.1 con tres custodios y umbral de dos.
//
// La Safe es la tesorería de ORIGEN y la dueña de todos los roles de los contratos v2. Nada sale
// de ella sin dos firmas. Esta plataforma no tiene llaves: arma la transacción exacta, recoge las
// firmas de los custodios (EIP-712, cada uno con su billetera), comprueba que cada firma es de un
// custodio de la Safe, entrega la llamada lista para ejecutar y, cuando alguien la manda, comprueba
// en la cadena que lo ejecutado es exactamente lo firmado (el evento ExecutionSuccess de la Safe
// lleva el hash de la transacción firmada: si coincide, coinciden destino, monto, datos y nonce).
//
// Varias llamadas van en una sola transacción de la Safe con MultiSendCallOnly (por ejemplo, el
// regalo de 1 ORIGEN a cada usuario): un solo par de firmas para todo el lote.

import { Interface, TypedDataEncoder, concat, getAddress, recoverAddress, solidityPacked, toBeHex, zeroPadValue } from 'ethers'

export const CERO = '0x0000000000000000000000000000000000000000'

export interface Llamada { to: string; value: string; data: string }

/** La transacción de la Safe tal cual se firma (sin pagos de gas desde la Safe: todo en cero). */
export interface SafeTx { to: string; value: string; data: string; operation: 0 | 1; nonce: number }

export const TIPOS_SAFE_TX = {
  SafeTx: [
    { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'data', type: 'bytes' },
    { name: 'operation', type: 'uint8' }, { name: 'safeTxGas', type: 'uint256' }, { name: 'baseGas', type: 'uint256' },
    { name: 'gasPrice', type: 'uint256' }, { name: 'gasToken', type: 'address' }, { name: 'refundReceiver', type: 'address' },
    { name: 'nonce', type: 'uint256' },
  ],
}

export const SAFE = new Interface([
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)',
  'function nonce() view returns (uint256)',
  'function getThreshold() view returns (uint256)',
  'function getOwners() view returns (address[])',
  'function VERSION() view returns (string)',
  'event ExecutionSuccess(bytes32 indexed txHash, uint256 payment)',
  'event ExecutionFailure(bytes32 indexed txHash, uint256 payment)',
])
const MULTISEND = new Interface(['function multiSend(bytes transactions) payable'])

export class ErrorFirma extends Error {}

function direccion(d: string, que: string): string {
  try { return getAddress(d) } catch { throw new ErrorFirma(`${que}: dirección inválida`) }
}

/** Valida una llamada (destino, monto en wei, datos en hex) y la deja normalizada. */
export function llamada(l: { to: string; value?: string | bigint | number; data?: string }): Llamada {
  const to = direccion(String(l.to || ''), 'destino')
  let value: bigint
  try { value = BigInt(l.value ?? 0) } catch { throw new ErrorFirma('monto inválido (en wei, entero)') }
  if (value < 0n) throw new ErrorFirma('monto negativo')
  const data = String(l.data || '0x')
  if (!/^0x([0-9a-fA-F]{2})*$/.test(data)) throw new ErrorFirma('datos inválidos (hex)')
  return { to, value: value.toString(), data: data.toLowerCase() }
}

/** Una llamada va directa; varias, en un lote de MultiSendCallOnly (DELEGATECALL desde la Safe). */
export function armarSafeTx(llamadas: Llamada[], nonce: number, multisend?: string): SafeTx {
  if (!llamadas.length) throw new ErrorFirma('no hay nada que ejecutar')
  if (llamadas.length === 1) return { ...llamadas[0], operation: 0, nonce }
  if (!multisend) throw new ErrorFirma('falta SAFE_MULTISEND para un lote de varias llamadas')
  const empaquetadas = concat(llamadas.map((l) => {
    const datos = l.data === '0x' ? '0x' : l.data
    return solidityPacked(['uint8', 'address', 'uint256', 'uint256', 'bytes'], [0, l.to, l.value, (datos.length - 2) / 2, datos])
  }))
  return { to: direccion(multisend, 'MultiSendCallOnly'), value: '0', data: MULTISEND.encodeFunctionData('multiSend', [empaquetadas]), operation: 1, nonce }
}

/** Lo que firma cada custodio (eth_signTypedData_v4): dominio de la Safe y la transacción. */
export function tipado(safe: string, chainId: number, t: SafeTx) {
  return {
    domain: { chainId, verifyingContract: direccion(safe, 'Safe') },
    types: TIPOS_SAFE_TX,
    primaryType: 'SafeTx' as const,
    message: { to: t.to, value: t.value, data: t.data, operation: t.operation, safeTxGas: '0', baseGas: '0', gasPrice: '0', gasToken: CERO, refundReceiver: CERO, nonce: String(t.nonce) },
  }
}

export function hashSafeTx(safe: string, chainId: number, t: SafeTx): string {
  const ty = tipado(safe, chainId, t)
  return TypedDataEncoder.hash(ty.domain, ty.types, ty.message)
}

/**
 * Quién firmó: solo firmas EIP-712 (v = 27 o 28), las que la Safe comprueba con ecrecover directo.
 * Otra forma (eth_sign, v + 4) se rechaza: para la plataforma no hay ambigüedad sobre qué se firmó.
 */
export function firmanteDe(hash: string, firma: string): string {
  const f = normalizarFirma(firma)
  try { return getAddress(recoverAddress(hash, f)) } catch { throw new ErrorFirma('la firma no es válida') }
}

/** Algunas billeteras (Ledger, entre otras) devuelven v = 0 o 1: la Safe lo quiere en 27 o 28. */
export function normalizarFirma(firma: string): string {
  const f = String(firma || '').trim().toLowerCase()
  if (!/^0x[0-9a-f]{130}$/.test(f)) throw new ErrorFirma('la firma tiene que ser de 65 bytes en hex')
  const v = parseInt(f.slice(130), 16)
  if (v === 0 || v === 1) return f.slice(0, 130) + (v + 27).toString(16)
  if (v !== 27 && v !== 28) throw new ErrorFirma('firma de otro tipo: tiene que ser EIP-712 (eth_signTypedData_v4)')
  return f
}

/** Las firmas juntas como las pide la Safe: ordenadas por dirección del firmante, de menor a mayor. */
export function juntarFirmas(firmas: { firmante: string; firma: string }[]): string {
  const orden = [...firmas].sort((a, b) => (BigInt(a.firmante) < BigInt(b.firmante) ? -1 : 1))
  return concat(orden.map((f) => f.firma))
}

/** La llamada a execTransaction lista para mandar desde cualquier cuenta con gas. */
export function datosEjecucion(t: SafeTx, firmas: { firmante: string; firma: string }[]): string {
  return SAFE.encodeFunctionData('execTransaction', [t.to, t.value, t.data, t.operation, 0, 0, 0, CERO, CERO, juntarFirmas(firmas)])
}

/** Lo que la Safe es hoy: custodios, umbral y el próximo nonce. */
export async function estadoSafe(llamar: (metodo: string, params: unknown[]) => Promise<any>, safe: string) {
  const leer = async (f: string) => SAFE.decodeFunctionResult(f, await llamar('eth_call', [{ to: safe, data: SAFE.encodeFunctionData(f) }, 'latest']))
  const [[duenos], [umbral], [nonce], chain] = await Promise.all([leer('getOwners'), leer('getThreshold'), leer('nonce'), llamar('eth_chainId', [])])
  return { duenos: (duenos as string[]).map((d) => getAddress(d)), umbral: Number(umbral), nonce: Number(nonce), chainId: Number(BigInt(chain)) }
}

/**
 * Comprueba en la cadena que `tx` ejecutó en la Safe exactamente la transacción firmada (`hash`).
 * Devuelve null si está bien, o el motivo.
 */
export async function comprobarEjecucion(llamar: (metodo: string, params: unknown[]) => Promise<any>, tx: string, safe: string, hash: string): Promise<string | null> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return 'hash de transacción inválido'
  const recibo = await llamar('eth_getTransactionReceipt', [tx])
  if (!recibo) return 'la transacción no está en la cadena'
  if (recibo.status !== '0x1') return 'la transacción falló en la cadena'
  const deLaSafe = (recibo.logs || []).filter((l: any) => String(l.address).toLowerCase() === safe.toLowerCase())
  const exito = SAFE.getEvent('ExecutionSuccess')!.topicHash
  const fracaso = SAFE.getEvent('ExecutionFailure')!.topicHash
  const tema = zeroPadValue(toBeHex(BigInt(hash)), 32).toLowerCase()
  if (deLaSafe.some((l: any) => l.topics?.[0] === fracaso && String(l.topics?.[1]).toLowerCase() === tema)) return 'la Safe ejecutó la transacción pero la llamada interna falló'
  if (!deLaSafe.some((l: any) => l.topics?.[0] === exito && String(l.topics?.[1]).toLowerCase() === tema)) return 'esa transacción no ejecutó lo firmado en la Safe'
  return null
}

/** Las llamadas de un archivo del Transaction Builder de Safe (lo que genera contratos-v2/scripts/lotes-safe.ts). */
export function llamadasDeArchivo(j: any): Llamada[] {
  const t = Array.isArray(j?.transactions) ? j.transactions : null
  if (!t?.length) throw new ErrorFirma('el archivo no trae transacciones')
  return t.map((x: any) => llamada({ to: x.to, value: x.value || '0', data: x.data || '0x' }))
}
