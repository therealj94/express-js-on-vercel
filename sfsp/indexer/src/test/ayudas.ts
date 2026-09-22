// Ayudas de prueba: cadena sintetica en memoria.
// NUNCA hashes ni direcciones reales del ecosistema: todo es generado aqui.

import type { EncabezadoBloque, LogCrudo } from '../tipos.js';

export const CHAIN_ID_PRUEBA = 31337;

/** Hash sintetico determinista y legible: `0x<rama><numero>`. */
export function hashSintetico(rama: string, numero: number): string {
  return `0x${rama}${String(numero).padStart(6, '0')}`;
}

/** Direccion sintetica. No corresponde a ningun contrato desplegado. */
export function direccionSintetica(etiqueta: string): string {
  return `0xTEST_${etiqueta}`;
}

/** Construye una cadena lineal de `n` bloques en la rama indicada. */
export function construirCadena(
  rama: string,
  desde: number,
  hasta: number,
  padreInicial?: string,
): EncabezadoBloque[] {
  const salida: EncabezadoBloque[] = [];
  let padre = padreInicial ?? hashSintetico(rama, desde - 1);
  for (let n = desde; n <= hasta; n += 1) {
    const h: EncabezadoBloque = {
      chainId: CHAIN_ID_PRUEBA,
      blockNumber: n,
      blockHash: hashSintetico(rama, n),
      parentHash: padre,
    };
    salida.push(h);
    padre = h.blockHash;
  }
  return salida;
}

export function log(
  parcial: Partial<LogCrudo> & Pick<LogCrudo, 'firma'>,
): LogCrudo {
  return {
    chainId: CHAIN_ID_PRUEBA,
    blockNumber: parcial.blockNumber ?? 1,
    blockHash: parcial.blockHash ?? hashSintetico('a', parcial.blockNumber ?? 1),
    txHash: parcial.txHash ?? '0xTX_0001',
    logIndex: parcial.logIndex ?? 0,
    firma: parcial.firma,
    address: parcial.address ?? direccionSintetica('REGISTRY'),
    topics: parcial.topics ?? [parcial.firma],
    data: parcial.data ?? '0x',
    ...(parcial.parametros !== undefined
      ? { parametros: parcial.parametros }
      : {}),
  };
}
