/* Codificaciones que usa la capa Web5 de SFSP, escritas aquí por la misma razón
 * que keccak.ts: el SDK no tiene dependencias de ejecución.
 *
 *   · base64url sin relleno (JOSE, RFC 7515 §2).
 *   · base58btc (multibase 'z', que es lo que usa did:key).
 *   · JSON canónico (RFC 8785 en lo que usamos: claves ordenadas, sin espacios,
 *     números enteros). Sin canónico, dos personas que serializan el mismo
 *     objeto obtienen hashes distintos y una prueba válida parece falsa.
 *   · bytes32 a partir de un texto corto, igual que `encodeBytes32String` de
 *     ethers, que es como los contratos reciben los propósitos y las políticas. */

import { ErrorSFSP } from '../codigos.js';

export function aBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export function deBase64url(texto: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(texto)) throw new ErrorSFSP('DENY_POLICY', 'base64url inválido');
  return new Uint8Array(Buffer.from(texto, 'base64url'));
}

export function textoABase64url(texto: string): string {
  return Buffer.from(texto, 'utf8').toString('base64url');
}

export function base64urlATexto(texto: string): string {
  return Buffer.from(deBase64url(texto)).toString('utf8');
}

const ALFABETO58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function aBase58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = '';
  while (n > 0n) {
    s = ALFABETO58[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    s = '1' + s;
  }
  return s;
}

export function deBase58(texto: string): Uint8Array {
  let n = 0n;
  for (const c of texto) {
    const i = ALFABETO58.indexOf(c);
    if (i < 0) throw new ErrorSFSP('DENY_POLICY', 'base58 inválido');
    n = n * 58n + BigInt(i);
  }
  const out: number[] = [];
  while (n > 0n) {
    out.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of texto) {
    if (c !== '1') break;
    out.unshift(0);
  }
  return new Uint8Array(out);
}

export function aHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

export function deHex(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) throw new ErrorSFSP('DENY_POLICY', 'hex inválido');
  return new Uint8Array(Buffer.from(h, 'hex'));
}

export function concatenar(...partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Texto corto a bytes32, alineado a la izquierda y relleno con ceros. */
export function b32Texto(texto: string): string {
  const b = Buffer.from(texto, 'utf8');
  if (b.length > 31) throw new ErrorSFSP('DENY_POLICY', `«${texto}» no cabe en bytes32`);
  const out = Buffer.alloc(32);
  b.copy(out);
  return '0x' + out.toString('hex');
}

/** JSON canónico. Rechaza lo que no tiene una sola forma: no enteros, NaN, undefined. */
export function jsonCanonico(valor: unknown): string {
  if (valor === null) return 'null';
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  if (typeof valor === 'number') {
    if (!Number.isSafeInteger(valor)) {
      throw new ErrorSFSP('DENY_POLICY', 'solo enteros seguros en datos firmados; usar texto para decimales');
    }
    return String(valor);
  }
  if (typeof valor === 'string') return JSON.stringify(valor);
  if (Array.isArray(valor)) return '[' + valor.map(jsonCanonico).join(',') + ']';
  if (typeof valor === 'object') {
    const o = valor as Record<string, unknown>;
    const claves = Object.keys(o).filter((k) => o[k] !== undefined).sort();
    return '{' + claves.map((k) => JSON.stringify(k) + ':' + jsonCanonico(o[k])).join(',') + '}';
  }
  throw new ErrorSFSP('DENY_POLICY', `tipo no firmable: ${typeof valor}`);
}
