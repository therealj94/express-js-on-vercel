/* Direcciones con checksum EIP-55.
 *
 * Una dirección en minúsculas es válida pero no detecta erratas. SFSP guarda
 * siempre la forma con checksum y rechaza una mezcla de mayúsculas que no
 * cuadre: ese es exactamente el caso de la dirección pagadora que apareció en
 * los documentos del ecosistema con el checksum equivocado. Vale igual para la
 * cadena, pero una herramienta estricta la rechaza, y conviene enterarse antes
 * de mandar dinero, no después. */

import { keccak256Hex } from './keccak.js';
import { ErrorSFSP } from './codigos.js';

const SOLO_HEX = /^[0-9a-fA-F]{40}$/;

export function esFormaDeDireccion(valor: string): boolean {
  return valor.startsWith('0x') && SOLO_HEX.test(valor.slice(2));
}

/** Devuelve la dirección con las mayúsculas del checksum EIP-55. */
export function aChecksum(direccion: string): string {
  if (!esFormaDeDireccion(direccion)) {
    throw new ErrorSFSP('DENY_POLICY', `no tiene forma de dirección: ${direccion}`);
  }
  const cuerpo = direccion.slice(2).toLowerCase();
  const hash = keccak256Hex(cuerpo);
  let salida = '0x';
  for (let i = 0; i < 40; i++) {
    const c = cuerpo[i] as string;
    const nibble = parseInt(hash[i] as string, 16);
    salida += nibble >= 8 ? c.toUpperCase() : c;
  }
  return salida;
}

/**
 * Comprueba una dirección. Si viene toda en minúsculas o toda en mayúsculas se
 * acepta (no lleva checksum que comprobar) y se devuelve normalizada. Si viene
 * mezclada, el checksum tiene que cuadrar exactamente.
 */
export function normalizarDireccion(direccion: string): string {
  if (!esFormaDeDireccion(direccion)) {
    throw new ErrorSFSP('DENY_POLICY', `no tiene forma de dirección: ${direccion}`);
  }
  const cuerpo = direccion.slice(2);
  const uniforme = cuerpo === cuerpo.toLowerCase() || cuerpo === cuerpo.toUpperCase();
  const conChecksum = aChecksum(direccion);
  if (!uniforme && conChecksum !== direccion) {
    throw new ErrorSFSP('DENY_POLICY', 'el checksum EIP-55 de la dirección no cuadra');
  }
  return conChecksum;
}

export function mismaDireccion(a: string, b: string): boolean {
  return a.slice(2).toLowerCase() === b.slice(2).toLowerCase();
}
