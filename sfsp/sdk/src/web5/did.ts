/* Identificadores descentralizados (W3C DID Core 1.0) para SFSP.
 *
 * Dos métodos, cada uno por una razón:
 *
 *   · did:key para las PERSONAS. No hay registro, ni en la cadena ni en
 *     nuestros servidores: el identificador ES la llave pública. La persona lo
 *     guarda en su billetera y nadie se lo puede dar de baja. Y, lo que importa
 *     para SFSP-110 §4, una persona puede tener un did:key distinto por
 *     relación: dos verificadores que reciben dos DIDs distintos no pueden
 *     cruzarlos. Un DID único y global correlacionaría a la persona en todas
 *     partes, que es justo lo que SFSP prohíbe.
 *
 *   · did:web para los EMISORES (Genesis ID, DBNX, custodios). Un emisor tiene
 *     que ser público y reconocible, y su documento vive en su dominio. Ese
 *     documento declara además la dirección en la 5550 con la que firma las
 *     atestaciones EIP-712: así la credencial y su proyección en la cadena
 *     quedan atadas al mismo emisor sin que nadie tenga que creérselo.
 *
 * did:ethr NO se usa para personas: el identificador sería una dirección, y
 * publicar un documento DID por dirección en la cadena dejaría el mapa
 * persona → direcciones a la vista de cualquiera. */

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { ErrorSFSP } from '../codigos.js';
import { aBase58, aBase64url, concatenar, deBase58, deBase64url } from './codificacion.js';

/** Prefijo multicodec de una llave pública Ed25519 (0xed, varint). */
const MULTICODEC_ED25519 = new Uint8Array([0xed, 0x01]);
const MULTICODEC_X25519 = new Uint8Array([0xec, 0x01]);

export interface ParDeLlaves {
  /** Llave pública Ed25519, 32 bytes. */
  publica: Uint8Array;
  /** Semilla privada Ed25519, 32 bytes. Nunca sale de la billetera o del KMS. */
  privada: Uint8Array;
}

export function nuevasLlaves(): ParDeLlaves {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const jwk = privateKey.export({ format: 'jwk' }) as { x: string; d: string };
  void publicKey;
  return { publica: deBase64url(jwk.x), privada: deBase64url(jwk.d) };
}

export function llavePrivadaNode(par: ParDeLlaves): KeyObject {
  return createPrivateKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: aBase64url(par.publica), d: aBase64url(par.privada) },
    format: 'jwk',
  });
}

export function llavePublicaNode(publica: Uint8Array): KeyObject {
  if (publica.length !== 32) throw new ErrorSFSP('DENY_POLICY', 'llave Ed25519 de largo inválido');
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: aBase64url(publica) }, format: 'jwk' });
}

// ------------------------------------------------------------------ did:key

export function didKeyDe(publica: Uint8Array): string {
  if (publica.length !== 32) throw new ErrorSFSP('DENY_POLICY', 'llave Ed25519 de largo inválido');
  return 'did:key:z' + aBase58(concatenar(MULTICODEC_ED25519, publica));
}

export function publicaDeDidKey(did: string): Uint8Array {
  const m = /^did:key:z([1-9A-HJ-NP-Za-km-z]+)$/.exec(did);
  if (!m) throw new ErrorSFSP('DENY_POLICY', 'no es un did:key');
  const b = deBase58(m[1]!);
  if (b.length !== 34 || b[0] !== 0xed || b[1] !== 0x01) {
    throw new ErrorSFSP('DENY_POLICY', 'did:key sin llave Ed25519');
  }
  return b.slice(2);
}

// ------------------------------------------------ Ed25519 → X25519 (cifrado)
/*
 * El documento de un did:key Ed25519 declara también una llave de acuerdo
 * X25519, derivada de la misma: así una sola llave en la billetera sirve para
 * firmar y para recibir datos cifrados. La conversión es la del mapa
 * birracional de Edwards a Montgomery: u = (1 + y) / (1 − y) mod p.
 */
const P = (1n << 255n) - 19n;

function modPow(b: bigint, e: bigint, m: bigint): bigint {
  let r = 1n;
  b %= m;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}

function leLE(bytes: Uint8Array): bigint {
  let n = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]!);
  return n;
}

function aLE(n: bigint, largo: number): Uint8Array {
  const out = new Uint8Array(largo);
  for (let i = 0; i < largo; i++) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

export function x25519PublicaDesdeEd25519(publica: Uint8Array): Uint8Array {
  const y = leLE(publica) & ((1n << 255n) - 1n);
  const num = (1n + y) % P;
  const den = (P + 1n - y) % P;
  if (den === 0n) throw new ErrorSFSP('DENY_POLICY', 'llave Ed25519 degenerada');
  const u = (num * modPow(den, P - 2n, P)) % P;
  return aLE(u, 32);
}

export function x25519PrivadaDesdeEd25519(semilla: Uint8Array): Uint8Array {
  const h = createHash('sha512').update(semilla).digest();
  const k = new Uint8Array(h.subarray(0, 32));
  k[0]! &= 248;
  k[31]! &= 127;
  k[31]! |= 64;
  return k;
}

// ----------------------------------------------------------- documentos DID

export interface MetodoDeVerificacion {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: Record<string, string>;
  blockchainAccountId?: string;
}

export interface DocumentoDid {
  '@context': string[];
  id: string;
  verificationMethod: MetodoDeVerificacion[];
  authentication: string[];
  assertionMethod: string[];
  keyAgreement?: string[];
  service?: Array<{ id: string; type: string; serviceEndpoint: string }>;
}

const CONTEXTO_DID = ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/multikey/v1'];

export function documentoDidKey(did: string): DocumentoDid {
  const pub = publicaDeDidKey(did);
  const fragmento = did.slice('did:key:'.length);
  const x = x25519PublicaDesdeEd25519(pub);
  const idFirma = `${did}#${fragmento}`;
  const idAcuerdo = `${did}#z${aBase58(concatenar(MULTICODEC_X25519, x))}`;
  return {
    '@context': CONTEXTO_DID,
    id: did,
    verificationMethod: [
      { id: idFirma, type: 'Multikey', controller: did, publicKeyMultibase: fragmento },
      { id: idAcuerdo, type: 'Multikey', controller: did, publicKeyMultibase: idAcuerdo.split('#')[1]! },
    ],
    authentication: [idFirma],
    assertionMethod: [idFirma],
    keyAgreement: [idAcuerdo],
  };
}

// ------------------------------------------------------------------ did:web

export function didWeb(dominio: string, ruta: string[] = []): string {
  if (!/^[a-z0-9.-]+(%3A\d+)?$/i.test(dominio)) throw new ErrorSFSP('DENY_POLICY', 'dominio inválido');
  return ['did:web', dominio, ...ruta.map(encodeURIComponent)].join(':');
}

/** Dónde vive el documento de un did:web (DID Web Method, §3.2). */
export function urlDeDidWeb(did: string): string {
  const partes = did.split(':');
  if (partes[0] !== 'did' || partes[1] !== 'web' || !partes[2]) throw new ErrorSFSP('DENY_POLICY', 'no es un did:web');
  const dominio = decodeURIComponent(partes[2]);
  const ruta = partes.slice(3).map(decodeURIComponent);
  return ruta.length ? `https://${dominio}/${ruta.join('/')}/did.json` : `https://${dominio}/.well-known/did.json`;
}

export interface DatosEmisor {
  did: string;
  /** Llave Ed25519 con la que firma las credenciales. */
  publica: Uint8Array;
  /** Cuenta en la cadena con la que firma las atestaciones EIP-712. */
  cuenta?: { chainId: number; direccion: string };
  /** Dónde publica sus listas de estado. */
  servicioEstado?: string;
}

/** El documento que el emisor publica en su dominio. Se genera, no se escribe a mano. */
export function documentoEmisor(e: DatosEmisor): DocumentoDid {
  const idFirma = `${e.did}#firma-1`;
  const vm: MetodoDeVerificacion[] = [
    { id: idFirma, type: 'Multikey', controller: e.did, publicKeyMultibase: 'z' + aBase58(concatenar(MULTICODEC_ED25519, e.publica)) },
  ];
  const asertos = [idFirma];
  if (e.cuenta) {
    const idCadena = `${e.did}#cadena-${e.cuenta.chainId}`;
    vm.push({
      id: idCadena,
      type: 'EcdsaSecp256k1RecoveryMethod2020',
      controller: e.did,
      blockchainAccountId: `eip155:${e.cuenta.chainId}:${e.cuenta.direccion}`,
    });
    asertos.push(idCadena);
  }
  const doc: DocumentoDid = {
    '@context': CONTEXTO_DID,
    id: e.did,
    verificationMethod: vm,
    authentication: [idFirma],
    assertionMethod: asertos,
  };
  if (e.servicioEstado) doc.service = [{ id: `${e.did}#estado`, type: 'SFSPStatusList', serviceEndpoint: e.servicioEstado }];
  return doc;
}

// ---------------------------------------------------------------- resolución

export type Obtener = (url: string) => Promise<unknown>;

/**
 * Resuelve un DID a su documento. La red se inyecta (`obtener`): en pruebas no
 * hay red, y en producción quien llama decide caché, tiempo de espera y proxy.
 * Un documento did:web cuyo `id` no coincide con el DID pedido se rechaza: si
 * no, un dominio podría servir el documento de otro emisor.
 */
export async function resolverDid(did: string, obtener?: Obtener): Promise<DocumentoDid> {
  if (did.startsWith('did:key:')) return documentoDidKey(did);
  if (did.startsWith('did:web:')) {
    if (!obtener) throw new ErrorSFSP('UNKNOWN_SOURCE', 'did:web sin forma de obtener el documento');
    let doc: DocumentoDid;
    try {
      doc = (await obtener(urlDeDidWeb(did))) as DocumentoDid;
    } catch {
      throw new ErrorSFSP('UNKNOWN_SOURCE', `no se pudo leer el documento de ${did}`);
    }
    if (!doc || doc.id !== did) throw new ErrorSFSP('DENY_AUTHORIZATION', 'el documento no es de ese DID');
    return doc;
  }
  throw new ErrorSFSP('DENY_POLICY', `método DID no admitido: ${did.split(':')[1] ?? '?'}`);
}

/** La llave Ed25519 de un método de verificación, si la declara en multibase. */
export function publicaDeMetodo(doc: DocumentoDid, kid: string, relacion: 'assertionMethod' | 'authentication'): Uint8Array {
  const id = kid.startsWith('#') ? doc.id + kid : kid;
  if (!doc[relacion].includes(id)) throw new ErrorSFSP('DENY_AUTHORIZATION', `la llave ${id} no está autorizada para ${relacion}`);
  const vm = doc.verificationMethod.find((v) => v.id === id);
  if (!vm || !vm.publicKeyMultibase?.startsWith('z')) throw new ErrorSFSP('DENY_AUTHORIZATION', `llave ${id} no encontrada`);
  const b = deBase58(vm.publicKeyMultibase.slice(1));
  if (b.length !== 34 || b[0] !== 0xed || b[1] !== 0x01) throw new ErrorSFSP('DENY_AUTHORIZATION', 'la llave no es Ed25519');
  return b.slice(2);
}

/** La dirección en la cadena que el emisor declara para sus atestaciones. */
export function cuentaEnCadena(doc: DocumentoDid, chainId: number): string | null {
  const vm = doc.verificationMethod.find(
    (v) => v.type === 'EcdsaSecp256k1RecoveryMethod2020' && v.blockchainAccountId?.startsWith(`eip155:${chainId}:`) && doc.assertionMethod.includes(v.id),
  );
  return vm ? vm.blockchainAccountId!.split(':')[2]! : null;
}
