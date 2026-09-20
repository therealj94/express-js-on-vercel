// Anclaje del libro en la cadena 5550.
//
// El libro está encadenado por hash, pero quien controle el almacén podría
// recalcular la cadena entera con cuidado. Lo que lo vuelve irreversible es
// publicar el sello FUERA del sistema. Como el ecosistema tiene su propia
// cadena, se manda una transacción a la propia cuenta de la Tesorería con el
// sello y el número de asientos en el campo de datos. Desde ese momento,
// cualquiera puede pedir el libro y comprobar que llega exactamente a ese hash.
//
// La cuenta que firma vive en TESORERIA_ANCLA_CLAVE (una llave privada hex).
// Sin ella el anclaje está apagado y la ruta responde 503. La cuenta solo
// necesita ORIGEN para el gas, y hoy la cadena tiene baseFee 0.

import { JsonRpcProvider, Wallet, Transaction, toUtf8Bytes, hexlify } from 'ethers'

const RPC = () => process.env.RPC_ORDEN_URL || process.env.RPC_5550_URL || 'https://rpc.ordenglobal-rpc.com/'
const CLAVE = () => (process.env.TESORERIA_ANCLA_CLAVE || '').trim()
export const CADENA_ID = Number(process.env.TESORERIA_CADENA_ID || 5550)

export const anclajeConfigurado = () => /^(0x)?[0-9a-fA-F]{64}$/.test(CLAVE())

export interface CargaAncla { t: 'tesoreria-og'; v: 1; sello: string; asientos: number; en: string }

/** Lo que va dentro de la transacción. Es JSON legible a propósito: un explorador lo enseña tal cual. */
export function cargaAncla(sello: string, asientos: number, en = new Date().toISOString()): CargaAncla {
  return { t: 'tesoreria-og', v: 1, sello, asientos, en }
}

/**
 * Construye y firma la transacción SIN enviarla. Separado para poder probarlo
 * sin red y sin fondos: la firma se verifica descodificando el resultado.
 */
export async function construirAncla(clave: string, carga: CargaAncla, nonce: number, gasPrice: bigint = 0n): Promise<{ raw: string; hash: string; de: string }> {
  const cartera = new Wallet(clave)
  const tx = Transaction.from({
    type: 0, chainId: CADENA_ID, nonce, to: cartera.address, value: 0n,
    data: hexlify(toUtf8Bytes(JSON.stringify(carga))), gasLimit: 90_000n, gasPrice,
  })
  const raw = await cartera.signTransaction(tx)
  return { raw, hash: Transaction.from(raw).hash!, de: cartera.address }
}

/** Descodifica una transacción firmada y devuelve la carga, si es un ancla de la Tesorería. */
export function leerAncla(raw: string): { de: string | null; carga: CargaAncla | null; chainId: number } {
  const tx = Transaction.from(raw)
  let carga: CargaAncla | null = null
  try {
    const j = JSON.parse(Buffer.from(tx.data.slice(2), 'hex').toString('utf8'))
    if (j?.t === 'tesoreria-og' && typeof j.sello === 'string') carga = j
  } catch { /* no es un ancla */ }
  return { de: tx.from ?? null, carga, chainId: Number(tx.chainId) }
}

/** Publica el ancla en la cadena. Devuelve el hash de la transacción y el bloque si ya se minó. */
export async function anclar(sello: string, asientos: number): Promise<{ tx: string; bloque: number | null; de: string; carga: CargaAncla }> {
  if (!anclajeConfigurado()) throw Object.assign(new Error('El anclaje no está configurado (falta TESORERIA_ANCLA_CLAVE)'), { codigo: 503 })
  const proveedor = new JsonRpcProvider(RPC(), CADENA_ID, { staticNetwork: true })
  const cartera = new Wallet(CLAVE(), proveedor)
  const carga = cargaAncla(sello, asientos)
  const nonce = await proveedor.getTransactionCount(cartera.address, 'pending')
  const tarifa = await proveedor.getFeeData().catch(() => null)
  const { raw, hash } = await construirAncla(CLAVE(), carga, nonce, tarifa?.gasPrice ?? 0n)
  await proveedor.broadcastTransaction(raw)
  // Un bloque cada 10 s: se espera hasta 25 s y, si no, se devuelve sin bloque.
  const recibo = await proveedor.waitForTransaction(hash, 1, 25_000).catch(() => null)
  return { tx: hash, bloque: recibo?.blockNumber ?? null, de: cartera.address, carga }
}
