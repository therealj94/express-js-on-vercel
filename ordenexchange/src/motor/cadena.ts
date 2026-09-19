// La cadena 5550, por JSON-RPC.
//
// OrdenExchange no custodia llaves: los depósitos son transferencias que la
// persona hace desde su propia billetera a la tesorería de la plataforma, y
// aquí solo se COMPRUEBAN leyendo la cadena. Los retiros los firma un
// operador desde la tesorería y se anotan con su hash. Así ninguna llave
// privada vive en este servidor, igual que en el resto del ecosistema.

import { Dec } from '../lib/decimal.js'
import { activo as defActivo } from '../data/activos.js'
import type { Activo } from '../types.js'

export const RPC = (process.env.ORDENEX_RPC_URL || process.env.RPC_ORDEN_URL || 'https://ordenglobal-rpc.com').replace(/\/$/, '')
export const CADENA_ID = 5550
export const EXPLORADOR = process.env.ORDENEX_EXPLORADOR || 'https://ordenscan.com'

/** keccak256("Transfer(address,address,uint256)") */
const TOPICO_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export const esDireccion = (d: unknown): d is string => typeof d === 'string' && /^0x[0-9a-fA-F]{40}$/.test(d)
export const esHash = (h: unknown): h is string => typeof h === 'string' && /^0x[0-9a-fA-F]{64}$/.test(h)

let siguienteId = 1

export async function rpc<T = any>(metodo: string, params: unknown[] = []): Promise<T> {
  const ctrl = new AbortController()
  const alarma = setTimeout(() => ctrl.abort(), 20000)
  try {
    const r = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: siguienteId++, method: metodo, params }),
      signal: ctrl.signal,
    })
    const j: any = await r.json()
    if (j?.error) throw new Error(j.error.message || 'error del nodo')
    return j?.result as T
  } finally {
    clearTimeout(alarma)
  }
}

export const numeroBloque = async (): Promise<number> => Number(BigInt(await rpc<string>('eth_blockNumber')))

export type ResultadoDeposito =
  | { ok: true; cantidad: string; desde: string; bloque: number; confirmaciones: number }
  | { ok: false; codigo: string; error: string }

/**
 * Comprueba en la cadena que `txHash` es un depósito válido:
 *   - existe y está minada, con recibo exitoso;
 *   - va a la tesorería (valor nativo para ORIGEN; evento Transfer para los tokens);
 *   - sale de la dirección registrada por el usuario;
 *   - tiene las confirmaciones exigidas.
 */
export async function verificarDeposito(entrada: {
  txHash: string; activo: Activo; tesoreria: string; desde: string; confirmaciones: number
}): Promise<ResultadoDeposito> {
  const def = defActivo(entrada.activo)
  if (!def) return { ok: false, codigo: 'activo', error: 'Activo desconocido' }
  const tesoreria = entrada.tesoreria.toLowerCase()
  const desde = entrada.desde.toLowerCase()

  let tx: any, recibo: any, altura: number
  try {
    ;[tx, recibo, altura] = await Promise.all([
      rpc('eth_getTransactionByHash', [entrada.txHash]),
      rpc('eth_getTransactionReceipt', [entrada.txHash]),
      numeroBloque(),
    ])
  } catch (e: any) {
    return { ok: false, codigo: 'cadena', error: `No se pudo consultar la cadena: ${e?.message || 'sin respuesta'}` }
  }
  if (!tx) return { ok: false, codigo: 'tx-no-encontrada', error: 'La transacción no existe en la cadena 5550' }
  if (!recibo || !tx.blockNumber) return { ok: false, codigo: 'tx-pendiente', error: 'La transacción todavía no está en un bloque' }
  if (recibo.status !== '0x1') return { ok: false, codigo: 'tx-fallida', error: 'La transacción falló en la cadena' }

  const bloque = Number(BigInt(tx.blockNumber))
  const confirmaciones = Math.max(0, altura - bloque + 1)
  if (confirmaciones < entrada.confirmaciones) {
    return { ok: false, codigo: 'tx-pendiente', error: `Faltan confirmaciones: ${confirmaciones} de ${entrada.confirmaciones}` }
  }

  if (String(tx.from || '').toLowerCase() !== desde) {
    return { ok: false, codigo: 'origen-incorrecto', error: 'La transacción no sale de la dirección registrada en su perfil' }
  }

  if (!def.contrato) {
    if (String(tx.to || '').toLowerCase() !== tesoreria) {
      return { ok: false, codigo: 'destino-incorrecto', error: 'La transacción no va a la tesorería de OrdenExchange' }
    }
    const cantidad = Dec.deWei(BigInt(tx.value || '0x0'), def.decimalesCadena)
    if (!Dec.esPositivo(cantidad)) return { ok: false, codigo: 'monto', error: 'La transacción no mueve ORIGEN' }
    return { ok: true, cantidad, desde: tx.from, bloque, confirmaciones }
  }

  const contrato = def.contrato.toLowerCase()
  const relleno = (d: string) => '0x' + d.replace(/^0x/, '').toLowerCase().padStart(64, '0')
  const evento = (recibo.logs || []).find((l: any) =>
    String(l.address || '').toLowerCase() === contrato &&
    Array.isArray(l.topics) && l.topics[0] === TOPICO_TRANSFER &&
    String(l.topics[1] || '').toLowerCase() === relleno(desde) &&
    String(l.topics[2] || '').toLowerCase() === relleno(tesoreria))
  if (!evento) {
    return { ok: false, codigo: 'destino-incorrecto', error: `La transacción no transfiere ${def.simbolo} a la tesorería` }
  }
  const cantidad = Dec.deWei(BigInt(evento.data || '0x0'), def.decimalesCadena)
  if (!Dec.esPositivo(cantidad)) return { ok: false, codigo: 'monto', error: 'La transferencia es de cero' }
  return { ok: true, cantidad, desde: tx.from, bloque, confirmaciones }
}
