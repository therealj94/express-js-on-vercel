/* Listas de estado (W3C Bitstring Status List v1.0).
 *
 * Revocar una credencial no puede exigir preguntarle al emisor por ELLA: esa
 * pregunta le diría al emisor quién está usando qué credencial y dónde. La
 * lista es un mapa de bits de al menos 131 072 posiciones, comprimido y
 * firmado; el verificador descarga la lista entera y mira su bit. El emisor no
 * sabe cuál miró (SFSP-110 §3.3 y §4).
 *
 * La revocación en la cadena (`AttestationRevoked` del adaptador de identidad)
 * sigue existiendo y es la que manda para operar en la 5550. Esta lista es la
 * que manda fuera de la cadena. El emisor actualiza las dos en el mismo acto:
 * `revocarEnAmbas` del servicio emisor (SFSP-160 §6). */

import { gunzipSync, gzipSync } from 'node:zlib';
import { ErrorSFSP } from '../codigos.js';
import { aBase64url, deBase64url } from './codificacion.js';
import type { Emisor } from './credencial.js';
import { firmarJws, leerJws } from './jws.js';

export const TAMANO_MINIMO = 131_072;

export class ListaDeEstado {
  readonly bits: Uint8Array;
  constructor(tamano = TAMANO_MINIMO, bits?: Uint8Array) {
    if (tamano < TAMANO_MINIMO || tamano % 8 !== 0) throw new ErrorSFSP('DENY_POLICY', 'lista de estado demasiado chica');
    this.bits = bits ?? new Uint8Array(tamano / 8);
  }
  get tamano(): number {
    return this.bits.length * 8;
  }
  private revisar(i: number) {
    if (!Number.isInteger(i) || i < 0 || i >= this.tamano) throw new ErrorSFSP('DENY_POLICY', 'índice fuera de la lista');
  }
  /** El bit 0 es el de más a la izquierda del primer byte, como dice la especificación. */
  leer(i: number): boolean {
    this.revisar(i);
    return ((this.bits[i >> 3]! >> (7 - (i & 7))) & 1) === 1;
  }
  marcar(i: number, valor: boolean): void {
    this.revisar(i);
    const m = 1 << (7 - (i & 7));
    this.bits[i >> 3] = valor ? this.bits[i >> 3]! | m : this.bits[i >> 3]! & ~m;
  }
  codificar(): string {
    return 'u' + aBase64url(gzipSync(this.bits));
  }
  static decodificar(texto: string): ListaDeEstado {
    if (!texto.startsWith('u')) throw new ErrorSFSP('DENY_POLICY', 'lista sin prefijo multibase');
    let bits: Uint8Array;
    try {
      bits = new Uint8Array(gunzipSync(deBase64url(texto.slice(1))));
    } catch {
      throw new ErrorSFSP('DENY_POLICY', 'lista de estado ilegible');
    }
    return new ListaDeEstado(bits.length * 8, bits);
  }
}

export interface CredencialDeLista {
  '@context': string[];
  id: string;
  type: string[];
  issuer: string;
  validFrom: string;
  credentialSubject: { id: string; type: 'BitstringStatusList'; statusPurpose: string; encodedList: string };
}

export function firmarLista(o: { emisor: Emisor; url: string; lista: ListaDeEstado; proposito?: 'revocation' | 'suspension'; ahora?: Date }): string {
  const c: CredencialDeLista = {
    '@context': ['https://www.w3.org/ns/credentials/v2'],
    id: o.url,
    type: ['VerifiableCredential', 'BitstringStatusListCredential'],
    issuer: o.emisor.did,
    validFrom: (o.ahora ?? new Date()).toISOString(),
    credentialSubject: { id: `${o.url}#lista`, type: 'BitstringStatusList', statusPurpose: o.proposito ?? 'revocation', encodedList: o.lista.codificar() },
  };
  return firmarJws(c, { typ: 'vc+jwt', cty: 'vc', kid: `${o.emisor.did}${o.emisor.kid}` }, o.emisor.llaves);
}

export function leerLista(jwt: string) {
  const l = leerJws<CredencialDeLista>(jwt);
  if (!l.payload?.type?.includes('BitstringStatusListCredential')) throw new ErrorSFSP('DENY_POLICY', 'no es una lista de estado');
  return l;
}
