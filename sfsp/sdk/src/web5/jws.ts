/* Firmas JWS compactas con EdDSA (RFC 7515 + RFC 8037).
 *
 * Es el sobre de todo lo que se firma en la capa Web5: credenciales
 * (`vc+jwt`), presentaciones (`vp+jwt`), listas de estado y permisos. Se
 * verifica siempre contra la llave que declara el documento DID del firmante,
 * nunca contra una llave que venga dentro del propio mensaje. */

import { sign, verify } from 'node:crypto';
import { ErrorSFSP } from '../codigos.js';
import { base64urlATexto, deBase64url, textoABase64url } from './codificacion.js';
import { llavePrivadaNode, llavePublicaNode, type ParDeLlaves } from './did.js';

export interface Cabecera {
  alg: 'EdDSA';
  typ: string;
  kid: string;
  cty?: string;
}

export function firmarJws(payload: unknown, cabecera: Omit<Cabecera, 'alg'>, llaves: ParDeLlaves): string {
  const h = textoABase64url(JSON.stringify({ alg: 'EdDSA', ...cabecera }));
  const p = textoABase64url(JSON.stringify(payload));
  const firma = sign(null, Buffer.from(`${h}.${p}`), llavePrivadaNode(llaves));
  return `${h}.${p}.${firma.toString('base64url')}`;
}

export interface JwsLeido<T> {
  cabecera: Cabecera;
  payload: T;
  /** Lo firmado y la firma, para verificar después de resolver la llave. */
  firmado: string;
  firma: Uint8Array;
}

/** Lee sin verificar. Quien llama DEBE verificar antes de creer nada de esto. */
export function leerJws<T>(jws: string): JwsLeido<T> {
  const partes = jws.split('.');
  if (partes.length !== 3) throw new ErrorSFSP('DENY_POLICY', 'JWS mal formado');
  let cabecera: Cabecera;
  let payload: T;
  try {
    cabecera = JSON.parse(base64urlATexto(partes[0]!));
    payload = JSON.parse(base64urlATexto(partes[1]!));
  } catch {
    throw new ErrorSFSP('DENY_POLICY', 'JWS ilegible');
  }
  if (cabecera.alg !== 'EdDSA') throw new ErrorSFSP('DENY_POLICY', `algoritmo no admitido: ${String(cabecera.alg)}`);
  return { cabecera, payload, firmado: `${partes[0]}.${partes[1]}`, firma: deBase64url(partes[2]!) };
}

export function firmaValida(leido: JwsLeido<unknown>, publica: Uint8Array): boolean {
  try {
    return verify(null, Buffer.from(leido.firmado), llavePublicaNode(publica), Buffer.from(leido.firma));
  } catch {
    return false;
  }
}
