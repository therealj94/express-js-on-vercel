/* El método `did:sfsp`: los identificadores de SFSP sobre la 5550.
 *
 *   did:sfsp:<red>:p:<llave>        una PERSONA, en una relación
 *   did:sfsp:<red>:org:<orgId>      una ORGANIZACIÓN admitida por la Junta
 *
 * <red> es el chainId: 5550 (producción) o 5534 (ensayo). Un identificador de
 * ensayo nunca se acepta donde se espera producción, y al revés.
 *
 * PERSONAS · `p` se autocertifica: la parte final es su llave Ed25519
 * (multicodec 0xed01, base58btc). No hay registro ni en la cadena ni en
 * nuestros servidores, y nadie puede darlo de baja. La billetera DERIVA una
 * llave distinta por relación desde su semilla (`llavesDeRelacion`): con la
 * semilla recupera todas, y dos verificadores no pueden cruzar a la persona.
 *
 *   El GID NO aparece aquí, y es a propósito. El GID es la ficha única de la
 *   persona dentro de Genesis ID (una persona, un GID: así se evitan
 *   duplicados). Si fuera el identificador público, seguiría a la persona por
 *   todas partes (SFSP-110 §4). El vínculo GID → identificadores vive solo en
 *   el directorio privado de Genesis ID.
 *
 * ORGANIZACIONES · `org` se resuelve desde `SFSPDidRegistry` en la 5550: la
 * fuente de verdad de quién es un emisor es nuestra cadena, no un dominio de
 * internet. Una organización dada de baja no resuelve; una llave revocada
 * deja de figurar.
 *
 * `did:key` y `did:web` se siguen aceptando solo para interoperar con
 * billeteras y emisores de fuera (SFSP-160 §3.4). Lo nuestro es `did:sfsp`. */

import { createHash, createPrivateKey, hkdfSync } from 'node:crypto';
import { ErrorSFSP } from '../codigos.js';
import { keccak256 } from '../keccak.js';
import { aBase58, b32Texto, concatenar, deBase58, deBase64url, deHex, jsonCanonico } from './codificacion.js';
import {
  type DocumentoDid,
  type MetodoDeVerificacion,
  type ParDeLlaves,
  publicaDeDidKey,
  x25519PublicaDesdeEd25519,
} from './did.js';

export const REDES_SFSP = { '5550': 'producción', '5534': 'ensayo' } as const;
export type RedSFSP = keyof typeof REDES_SFSP;

const ED25519 = new Uint8Array([0xed, 0x01]);
const X25519 = new Uint8Array([0xec, 0x01]);
const CONTEXTO = ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/multikey/v1', 'https://ordenglobal.link/sfsp/did/v1'];

function revisarRed(red: string): RedSFSP {
  if (!(red in REDES_SFSP)) throw new ErrorSFSP('DENY_POLICY', `red desconocida para did:sfsp: ${red}`);
  return red as RedSFSP;
}

// ------------------------------------------------------------------ llaves

/** PKCS#8 de una semilla Ed25519 (RFC 8410), para que OpenSSL calcule la pública. */
const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');

export function llavesDesdeSemilla(semilla: Uint8Array): ParDeLlaves {
  if (semilla.length !== 32) throw new ErrorSFSP('DENY_POLICY', 'la semilla Ed25519 tiene 32 bytes');
  const k = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, Buffer.from(semilla)]), format: 'der', type: 'pkcs8' });
  const jwk = k.export({ format: 'jwk' }) as { x: string };
  return { publica: deBase64url(jwk.x), privada: new Uint8Array(semilla) };
}

/**
 * La llave de la persona para UNA relación (un verificador, una app, una
 * empresa), derivada de la semilla de su billetera con HKDF-SHA256.
 * Determinista: con la misma semilla y la misma relación sale la misma llave,
 * así que un respaldo de la semilla recupera todas. Sin la semilla, dos llaves
 * de dos relaciones no tienen relación observable entre sí.
 */
export function llavesDeRelacion(semillaBilletera: Uint8Array, relacion: string): ParDeLlaves {
  if (semillaBilletera.length < 32) throw new ErrorSFSP('DENY_POLICY', 'semilla de billetera demasiado corta');
  if (!relacion) throw new ErrorSFSP('DENY_POLICY', 'la relación es obligatoria');
  const s = new Uint8Array(hkdfSync('sha256', semillaBilletera, Buffer.from('SFSP.ID.RELACION.v1'), Buffer.from(relacion, 'utf8'), 32));
  return llavesDesdeSemilla(s);
}

// ---------------------------------------------------------------- personas

export function didPersona(publica: Uint8Array, red: RedSFSP = '5550'): string {
  if (publica.length !== 32) throw new ErrorSFSP('DENY_POLICY', 'llave Ed25519 de largo inválido');
  return `did:sfsp:${revisarRed(red)}:p:z${aBase58(concatenar(ED25519, publica))}`;
}

export function esDidPersona(did: string): boolean {
  return /^did:sfsp:\d+:p:z[1-9A-HJ-NP-Za-km-z]+$/.test(did) || /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/.test(did);
}

export function redDe(did: string): RedSFSP | null {
  const m = /^did:sfsp:(\d+):/.exec(did);
  return m ? revisarRed(m[1]!) : null;
}

/** La llave Ed25519 de una persona: `did:sfsp:…:p:` o, por interoperabilidad, `did:key`. */
export function publicaDePersona(did: string): Uint8Array {
  if (did.startsWith('did:key:')) return publicaDeDidKey(did);
  const m = /^did:sfsp:(\d+):p:z([1-9A-HJ-NP-Za-km-z]+)$/.exec(did);
  if (!m) throw new ErrorSFSP('DENY_POLICY', 'no es un identificador de persona');
  revisarRed(m[1]!);
  const b = deBase58(m[2]!);
  if (b.length !== 34 || b[0] !== 0xed || b[1] !== 0x01) throw new ErrorSFSP('DENY_POLICY', 'identificador sin llave Ed25519');
  return b.slice(2);
}

export function fragmentoDePersona(did: string): string {
  return did.startsWith('did:key:') ? did.slice('did:key:'.length) : did.split(':p:')[1]!;
}

export function documentoPersona(did: string): DocumentoDid {
  const pub = publicaDePersona(did);
  const idFirma = `${did}#${fragmentoDePersona(did)}`;
  const xMulti = 'z' + aBase58(concatenar(X25519, x25519PublicaDesdeEd25519(pub)));
  const idAcuerdo = `${did}#${xMulti}`;
  return {
    '@context': CONTEXTO,
    id: did,
    verificationMethod: [
      { id: idFirma, type: 'Multikey', controller: did, publicKeyMultibase: fragmentoDePersona(did) },
      { id: idAcuerdo, type: 'Multikey', controller: did, publicKeyMultibase: xMulti },
    ],
    authentication: [idFirma],
    assertionMethod: [idFirma],
    keyAgreement: [idAcuerdo],
  };
}

// ----------------------------------------------------------- organizaciones

export function didOrganizacion(orgId: string, red: RedSFSP = '5550'): string {
  if (!/^[a-z0-9_]{3,31}$/.test(orgId)) throw new ErrorSFSP('DENY_POLICY', 'orgId: 3 a 31 caracteres en minúscula, dígitos o _');
  return `did:sfsp:${revisarRed(red)}:org:${orgId}`;
}

export function orgIdDe(did: string): { red: RedSFSP; orgId: string; orgIdB32: string } {
  const m = /^did:sfsp:(\d+):org:([a-z0-9_]{3,31})$/.exec(did);
  if (!m) throw new ErrorSFSP('DENY_POLICY', 'no es un identificador de organización');
  return { red: revisarRed(m[1]!), orgId: m[2]!, orgIdB32: b32Texto(m[2]!) };
}

/** Lo que el resolutor necesita del registro en cadena. `lectorRpc` lo implementa con eth_call. */
export interface LectorRegistro {
  red: RedSFSP;
  orgInfo(orgId: string): Promise<{ exists: boolean; active: boolean; controller: string; updated: number; docHash: string; keyCount: number }>;
  keyIdAt(orgId: string, i: number): Promise<string>;
  keyInfo(orgId: string, keyId: string): Promise<{ keyType: number; publicKey: string; relations: number; revoked: boolean }>;
  isAttestor(orgId: string, cuenta: string): Promise<boolean>;
}

function textoDeB32(hex: string): string {
  const b = Buffer.from(deHex(hex));
  const fin = b.indexOf(0);
  return b.subarray(0, fin < 0 ? 32 : fin).toString('utf8');
}

export const MAX_LLAVES_ORG = 64;

export async function documentoOrganizacion(did: string, lector: LectorRegistro): Promise<DocumentoDid> {
  const { red, orgIdB32 } = orgIdDe(did);
  if (red !== lector.red) throw new ErrorSFSP('DENY_POLICY', `el identificador es de la red ${red} y el registro de la ${lector.red}`);
  let o;
  try {
    o = await lector.orgInfo(orgIdB32);
  } catch {
    throw new ErrorSFSP('UNKNOWN_SOURCE', 'no se pudo leer el registro did:sfsp');
  }
  if (!o.exists) throw new ErrorSFSP('DENY_AUTHORIZATION', 'organización no registrada');
  if (!o.active) throw new ErrorSFSP('DENY_AUTHORIZATION', 'organización dada de baja');
  const doc: DocumentoDid = { '@context': CONTEXTO, id: did, verificationMethod: [], authentication: [], assertionMethod: [], keyAgreement: [] };
  // Tope de lectura: un registro con miles de llaves (revocadas incluidas) no puede
  // convertir una verificación en miles de llamadas al nodo.
  if (o.keyCount > MAX_LLAVES_ORG) throw new ErrorSFSP('REVIEW_REQUIRED', `la organización tiene ${o.keyCount} llaves; el máximo que se resuelve es ${MAX_LLAVES_ORG}`);
  for (let i = 0; i < o.keyCount; i++) {
    const keyId = await lector.keyIdAt(orgIdB32, i);
    const k = await lector.keyInfo(orgIdB32, keyId);
    if (k.revoked) continue; // una llave revocada no firma nada, tampoco lo que firmó antes
    const pub = deHex(k.publicKey);
    const id = `${did}#${textoDeB32(keyId)}`;
    const vm: MetodoDeVerificacion = { id, type: 'Multikey', controller: did, publicKeyMultibase: 'z' + aBase58(concatenar(k.keyType === 1 ? ED25519 : X25519, pub)) };
    doc.verificationMethod.push(vm);
    if (k.keyType === 1 && k.relations & 1) doc.assertionMethod.push(id);
    if (k.keyType === 1 && k.relations & 2) doc.authentication.push(id);
    if (k.keyType === 2 && k.relations & 4) doc.keyAgreement!.push(id);
  }
  return doc;
}

/** ¿Firma esta dirección las atestaciones EIP-712 de esta organización? Lo dice la cadena. */
export async function esFirmanteDeCadena(did: string, cuenta: string, lector: LectorRegistro): Promise<boolean> {
  const { orgIdB32 } = orgIdDe(did);
  try {
    return await lector.isAttestor(orgIdB32, cuenta);
  } catch {
    throw new ErrorSFSP('UNKNOWN_SOURCE', 'no se pudo leer el registro did:sfsp');
  }
}

// ------------------------------------------------------- lector por eth_call

const selector = (firma: string) => Buffer.from(keccak256(new TextEncoder().encode(firma)).subarray(0, 4)).toString('hex');
const SEL = {
  orgInfo: selector('orgInfo(bytes32)'),
  keyIdAt: selector('keyIdAt(bytes32,uint256)'),
  keyInfo: selector('keyInfo(bytes32,bytes32)'),
  isAttestor: selector('isAttestor(bytes32,address)'),
};

function arg32(hex: string): string {
  const h = hex.replace(/^0x/, '').toLowerCase();
  if (h.length > 64 || !/^[0-9a-f]*$/.test(h)) throw new ErrorSFSP('DENY_POLICY', 'argumento inválido');
  return h.padStart(64, '0');
}

function palabras(ret: string, n: number): string[] {
  const h = ret.replace(/^0x/, '');
  if (h.length < n * 64) throw new ErrorSFSP('UNKNOWN_SOURCE', 'respuesta del registro incompleta');
  return Array.from({ length: n }, (_, i) => h.slice(i * 64, (i + 1) * 64));
}
const num = (w: string) => Number(BigInt('0x' + w));

/**
 * Un lector del registro con `eth_call`, sin dependencias. `llamar` recibe la
 * dirección y los datos y devuelve el resultado en hex: en producción, un
 * POST JSON-RPC al RPC de la red; en pruebas, el proveedor de Hardhat.
 */
export function lectorRpc(red: RedSFSP, contrato: string, llamar: (a: string, datos: string) => Promise<string>): LectorRegistro {
  const c = (datos: string) => llamar(contrato, '0x' + datos);
  return {
    red,
    async orgInfo(orgId) {
      const w = palabras(await c(SEL.orgInfo + arg32(orgId)), 6);
      return { exists: num(w[0]!) === 1, active: num(w[1]!) === 1, controller: '0x' + w[2]!.slice(24), updated: num(w[3]!), docHash: '0x' + w[4]!, keyCount: num(w[5]!) };
    },
    async keyIdAt(orgId, i) {
      return '0x' + palabras(await c(SEL.keyIdAt + arg32(orgId) + arg32(i.toString(16))), 1)[0]!;
    },
    async keyInfo(orgId, keyId) {
      const w = palabras(await c(SEL.keyInfo + arg32(orgId) + arg32(keyId)), 4);
      return { keyType: num(w[0]!), publicKey: '0x' + w[1]!, relations: num(w[2]!), revoked: num(w[3]!) === 1 };
    },
    async isAttestor(orgId, cuenta) {
      return num(palabras(await c(SEL.isAttestor + arg32(orgId) + arg32(cuenta)), 1)[0]!) === 1;
    },
  };
}

/** `llamar` para un RPC JSON-RPC por HTTP (el de la red, p. ej. rpc.ordenglobal-rpc.com). */
export function llamarPorHttp(url: string, tiempoMs = 10_000): (a: string, datos: string) => Promise<string> {
  return async (a, datos) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: a, data: datos }, 'latest'] }),
      signal: AbortSignal.timeout(tiempoMs),
    });
    const j = (await r.json()) as { result?: string; error?: unknown };
    if (!j.result) throw new ErrorSFSP('UNKNOWN_SOURCE', 'el RPC no devolvió resultado');
    return j.result;
  };
}

/** Huella del documento DID completo, la que se ancla con `setDocument`. */
export function huellaDeDocumento(doc: DocumentoDid): string {
  return '0x' + createHash('sha256').update(jsonCanonico(doc)).digest('hex');
}

