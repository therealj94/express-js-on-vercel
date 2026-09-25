/* Datos cifrados PARA una persona, con la llave de su DID.
 *
 * El nodo personal puede estar alojado por Orden Global y aun así no ser
 * nuestro: lo que guardamos está cifrado con la llave de acuerdo X25519 que
 * declara el did:key de la persona (derivada de su Ed25519). Sin su llave
 * privada, que vive en su billetera, no se lee. Si mañana se lleva sus datos a
 * otro proveedor, se los lleva enteros y legibles para ella.
 *
 * Esquema: ECDH-ES con llave efímera X25519, HKDF-SHA256 y AES-256-GCM. Es el
 * formato «sobre SFSP v1», con la misma construcción que JWE ECDH-ES+A256GCM
 * pero sin afirmar compatibilidad con JWE: el nombre del formato lo dice. */

import { createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from 'node:crypto';
import { ErrorSFSP } from '../codigos.js';
import { aBase64url, deBase64url } from './codificacion.js';
import { type ParDeLlaves, x25519PrivadaDesdeEd25519, x25519PublicaDesdeEd25519 } from './did.js';
import { publicaDePersona } from './did-sfsp.js';

export interface SobreSFSP {
  v: 'sfsp-sobre-1';
  para: string;
  epk: string;
  iv: string;
  ct: string;
  tag: string;
  /** Datos asociados en claro (tipo de registro, protocolo): autenticados, no cifrados. */
  aad?: string;
}

const INFO = Buffer.from('SFSP.SOBRE.v1');

function pubX(raw: Uint8Array) {
  return createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: aBase64url(raw) }, format: 'jwk' });
}

function clave(compartido: Buffer, epk: Uint8Array, destino: Uint8Array): Buffer {
  return Buffer.from(hkdfSync('sha256', compartido, Buffer.concat([Buffer.from(epk), Buffer.from(destino)]), INFO, 32));
}

export function cifrarPara(did: string, datos: Uint8Array | string, aad?: string): SobreSFSP {
  const destino = x25519PublicaDesdeEd25519(publicaDePersona(did));
  const { privateKey, publicKey } = generateKeyPairSync('x25519');
  const epk = deBase64url((publicKey.export({ format: 'jwk' }) as { x: string }).x);
  const k = clave(diffieHellman({ privateKey, publicKey: pubX(destino) }), epk, destino);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  if (aad) c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(typeof datos === 'string' ? Buffer.from(datos, 'utf8') : Buffer.from(datos)), c.final()]);
  const sobre: SobreSFSP = { v: 'sfsp-sobre-1', para: did, epk: aBase64url(epk), iv: aBase64url(iv), ct: aBase64url(ct), tag: aBase64url(c.getAuthTag()) };
  if (aad) sobre.aad = aad;
  return sobre;
}

export function descifrar(sobre: SobreSFSP, llaves: ParDeLlaves): Uint8Array {
  if (sobre.v !== 'sfsp-sobre-1') throw new ErrorSFSP('DENY_POLICY', 'formato de sobre desconocido');
  const xPriv = x25519PrivadaDesdeEd25519(llaves.privada);
  const xPub = x25519PublicaDesdeEd25519(llaves.publica);
  const priv = createPrivateKey({ key: { kty: 'OKP', crv: 'X25519', x: aBase64url(xPub), d: aBase64url(xPriv) }, format: 'jwk' });
  const epk = deBase64url(sobre.epk);
  const k = clave(diffieHellman({ privateKey: priv, publicKey: pubX(epk) }), epk, xPub);
  try {
    const d = createDecipheriv('aes-256-gcm', k, Buffer.from(deBase64url(sobre.iv)));
    if (sobre.aad) d.setAAD(Buffer.from(sobre.aad));
    d.setAuthTag(Buffer.from(deBase64url(sobre.tag)));
    return new Uint8Array(Buffer.concat([d.update(Buffer.from(deBase64url(sobre.ct))), d.final()]));
  } catch {
    throw new ErrorSFSP('DENY_AUTHORIZATION', 'no se pudo abrir el sobre: llave equivocada o datos alterados');
  }
}
