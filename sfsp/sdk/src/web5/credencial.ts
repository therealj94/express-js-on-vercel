/* Credenciales verificables (W3C VC Data Model 2.0, sobre VC-JOSE) con
 * divulgación selectiva por árbol de Merkle.
 *
 * La idea que funde Web5 con SFSP está aquí:
 *
 *   La credencial NO lleva los datos. Lleva `claimsRoot`, la raíz de un árbol
 *   cuyas hojas son los claims con sal. Los claims con su sal (las
 *   «divulgaciones») se le entregan a la persona aparte, y viven solo en su
 *   billetera. Cuando tiene que probar algo, revela SOLO las hojas necesarias,
 *   con su camino hasta la raíz.
 *
 *   Y `claimsRoot` es exactamente el campo `claimsRoot` de la atestación
 *   EIP-712 que ya acepta SFSPIdentityAdapter. La misma raíz sirve para
 *   verificar fuera de la cadena (la presentación) y dentro (la atestación),
 *   sin que ningún dato personal toque la cadena.
 *
 * La sal existe porque un claim predecible se adivina: sin sal, el hash de
 * «pais = HN» es el mismo para todo hondureño y se puede probar por fuerza
 * bruta (SFSP-110 §4.6). */

import { randomBytes, randomUUID } from 'node:crypto';
import { ErrorSFSP } from '../codigos.js';
import { keccak256 } from '../keccak.js';
import { aHex, concatenar, deHex, jsonCanonico } from './codificacion.js';
import { firmarJws, type JwsLeido, leerJws } from './jws.js';
import type { ParDeLlaves } from './did.js';

export const CONTEXTO_VC = ['https://www.w3.org/ns/credentials/v2', 'https://ordenglobal.link/sfsp/credenciales/v1'];
const ETIQUETA_HOJA = new TextEncoder().encode('SFSP.CLAIM.v1');

export interface Divulgacion {
  /** 32 bytes en hex, secreta: sin ella nadie puede reconstruir la hoja. */
  sal: string;
  nombre: string;
  valor: unknown;
}

export function hojaDeClaim(d: Divulgacion): Uint8Array {
  const sal = deHex(d.sal);
  if (sal.length !== 32) throw new ErrorSFSP('DENY_POLICY', 'la sal de un claim tiene 32 bytes');
  const enc = new TextEncoder();
  return keccak256(
    concatenar(ETIQUETA_HOJA, sal, keccak256(enc.encode(d.nombre)), keccak256(enc.encode(jsonCanonico(d.valor)))),
  );
}

// ------------------------------------------------------------------ Merkle
// Pares ordenados (como OpenZeppelin MerkleProof): la prueba no necesita decir
// de qué lado va cada hermano. Un nivel impar sube su último nodo sin pareja.

function par(a: Uint8Array, b: Uint8Array): Uint8Array {
  return Buffer.compare(Buffer.from(a), Buffer.from(b)) <= 0 ? keccak256(concatenar(a, b)) : keccak256(concatenar(b, a));
}

function niveles(hojas: Uint8Array[]): Uint8Array[][] {
  if (!hojas.length) throw new ErrorSFSP('DENY_POLICY', 'una credencial necesita al menos un claim');
  const n: Uint8Array[][] = [hojas];
  while (n[n.length - 1]!.length > 1) {
    const actual = n[n.length - 1]!;
    const sig: Uint8Array[] = [];
    for (let i = 0; i < actual.length; i += 2) sig.push(i + 1 < actual.length ? par(actual[i]!, actual[i + 1]!) : actual[i]!);
    n.push(sig);
  }
  return n;
}

export function raizDeClaims(divulgaciones: Divulgacion[]): string {
  const n = niveles(ordenar(divulgaciones).map(hojaDeClaim));
  return '0x' + aHex(n[n.length - 1]![0]!);
}

/** Orden fijo por nombre: el emisor y la billetera tienen que armar el mismo árbol. */
function ordenar(d: Divulgacion[]): Divulgacion[] {
  const nombres = new Set<string>();
  for (const x of d) {
    if (nombres.has(x.nombre)) throw new ErrorSFSP('DENY_POLICY', `claim repetido: ${x.nombre}`);
    nombres.add(x.nombre);
  }
  return [...d].sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0));
}

export function pruebaDeClaim(divulgaciones: Divulgacion[], nombre: string): string[] {
  const orden = ordenar(divulgaciones);
  let i = orden.findIndex((d) => d.nombre === nombre);
  if (i < 0) throw new ErrorSFSP('DENY_POLICY', `la credencial no tiene el claim ${nombre}`);
  const n = niveles(orden.map(hojaDeClaim));
  const prueba: string[] = [];
  for (let k = 0; k < n.length - 1; k++) {
    const nivel = n[k]!;
    const hermano = i % 2 === 0 ? i + 1 : i - 1;
    if (hermano < nivel.length) prueba.push('0x' + aHex(nivel[hermano]!));
    i = Math.floor(i / 2);
  }
  return prueba;
}

export function verificarPrueba(d: Divulgacion, prueba: string[], raiz: string): boolean {
  let h = hojaDeClaim(d);
  for (const p of prueba) h = par(h, deHex(p));
  return '0x' + aHex(h) === raiz.toLowerCase();
}

// -------------------------------------------------------------- credencial

export interface EntradaDeEstado {
  id: string;
  type: 'BitstringStatusListEntry';
  statusPurpose: 'revocation' | 'suspension';
  statusListIndex: string;
  statusListCredential: string;
}

export interface CredencialSFSP {
  '@context': string[];
  id: string;
  type: string[];
  issuer: string;
  validFrom: string;
  validUntil: string;
  credentialSubject: {
    /** El did:key de la persona para ESTA relación. */
    id: string;
    /** KYC, KYB, ACCREDITED, SANCTIONS_CLEAR, LICENSE_G… (SFSP-110 §3). */
    proposito: string;
    claimsRoot: string;
    politica: string;
  };
  credentialStatus?: EntradaDeEstado;
}

export interface Emisor {
  did: string;
  /** El fragmento de la llave de firma en su documento, p. ej. `#firma-1`. */
  kid: string;
  llaves: ParDeLlaves;
}

export interface Emision {
  jwt: string;
  credencial: CredencialSFSP;
  /** Se le entregan a la persona por canal cifrado y NO se guardan en el emisor. */
  divulgaciones: Divulgacion[];
}

export function nuevaSal(): string {
  return '0x' + randomBytes(32).toString('hex');
}

export function emitirCredencial(o: {
  emisor: Emisor;
  sujeto: string;
  proposito: string;
  claims: Record<string, unknown>;
  politica: string;
  validoDesde: Date;
  validoHasta: Date;
  estado?: { lista: string; indice: number; proposito?: 'revocation' | 'suspension' };
  tipos?: string[];
}): Emision {
  if (!o.sujeto.startsWith('did:')) throw new ErrorSFSP('DENY_POLICY', 'el sujeto tiene que ser un DID');
  if (o.validoHasta.getTime() <= o.validoDesde.getTime()) throw new ErrorSFSP('DENY_POLICY', 'vigencia inválida');
  const divulgaciones = Object.entries(o.claims).map(([nombre, valor]) => ({ sal: nuevaSal(), nombre, valor }));
  const credencial: CredencialSFSP = {
    '@context': CONTEXTO_VC,
    id: `urn:uuid:${randomUUID()}`,
    type: ['VerifiableCredential', 'SFSPAtestacion', ...(o.tipos ?? [])],
    issuer: o.emisor.did,
    validFrom: o.validoDesde.toISOString(),
    validUntil: o.validoHasta.toISOString(),
    credentialSubject: { id: o.sujeto, proposito: o.proposito, claimsRoot: raizDeClaims(divulgaciones), politica: o.politica },
  };
  if (o.estado) {
    credencial.credentialStatus = {
      id: `${o.estado.lista}#${o.estado.indice}`,
      type: 'BitstringStatusListEntry',
      statusPurpose: o.estado.proposito ?? 'revocation',
      statusListIndex: String(o.estado.indice),
      statusListCredential: o.estado.lista,
    };
  }
  const jwt = firmarJws(credencial, { typ: 'vc+jwt', cty: 'vc', kid: `${o.emisor.did}${o.emisor.kid}` }, o.emisor.llaves);
  return { jwt, credencial, divulgaciones };
}

export function leerCredencial(jwt: string): JwsLeido<CredencialSFSP> {
  const l = leerJws<CredencialSFSP>(jwt);
  if (l.cabecera.typ !== 'vc+jwt') throw new ErrorSFSP('DENY_POLICY', 'no es una credencial vc+jwt');
  const c = l.payload;
  if (!c?.credentialSubject?.claimsRoot || !Array.isArray(c.type) || !c.type.includes('VerifiableCredential')) {
    throw new ErrorSFSP('DENY_POLICY', 'credencial incompleta');
  }
  return l;
}
