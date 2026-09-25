/* De la credencial a la cadena: la proyección en SFSPIdentityAdapter.
 *
 * La credencial vive en la billetera de la persona. Lo que el protocolo
 * necesita en la 5550 es mucho menos: que existe una atestación vigente, de
 * un emisor autorizado, para este propósito, sobre un compromiso que no
 * identifica a nadie. Este módulo arma esa atestación y calcula el digest
 * EIP-712 IGUAL, byte por byte, que `hashAttestation` del contrato:
 *
 *   attestationId     = keccak256(id de la credencial)
 *   subjectCommitment = keccak256(abi.encode(COMMITMENT_TAG, subjectRef, purpose, salt))
 *   purpose           = bytes32 del propósito
 *   claimsRoot        = el MISMO claimsRoot de la credencial
 *   validFrom/Until   = la vigencia de la credencial, en segundos
 *   policyVersion     = bytes32 de la política
 *
 * El emisor firma ese digest con la llave de cadena que declara en su
 * documento DID (`EcdsaSecp256k1RecoveryMethod2020`). La firma secp256k1 la
 * hace el servicio emisor con su KMS: este SDK no maneja llaves de cadena. La
 * prueba cruzada `contracts/test/13-web5-credencial.js` comprueba que el
 * contrato acepta lo que sale de aquí. */

import { ErrorSFSP } from '../codigos.js';
import { keccak256, keccak256Hex } from '../keccak.js';
import { b32Texto, concatenar, deHex } from './codificacion.js';
import type { CredencialSFSP } from './credencial.js';

const enc = new TextEncoder();
const kh = (s: string) => keccak256(enc.encode(s));

export const COMMITMENT_TAG = '0x' + keccak256Hex('SFSP.SUBJECT.COMMITMENT.v1');
export const ATTESTATION_TYPEHASH =
  '0x' +
  keccak256Hex(
    'Attestation(bytes32 attestationId,bytes32 subjectCommitment,bytes32 purpose,bytes32 claimsRoot,uint64 validFrom,uint64 validUntil,bytes32 policyVersion,uint256 chainId,address verifyingContract)',
  );
const DOMAIN_TYPEHASH = kh('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');

/** Nombre y versión del dominio EIP-712 del adaptador desplegado. */
export const DOMINIO_ADAPTADOR = { nombre: 'SFSPIdentityAdapter', version: 'draft-0.3' };

function palabra(hex: string): Uint8Array {
  const b = deHex(hex);
  if (b.length !== 32) throw new ErrorSFSP('DENY_POLICY', 'se esperaba bytes32');
  return b;
}

function entero(n: bigint | number): Uint8Array {
  let v = BigInt(n);
  if (v < 0n) throw new ErrorSFSP('DENY_POLICY', 'entero negativo');
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function direccion(d: string): Uint8Array {
  const b = deHex(d);
  if (b.length !== 20) throw new ErrorSFSP('DENY_POLICY', 'dirección inválida');
  const out = new Uint8Array(32);
  out.set(b, 12);
  return out;
}

const hex = (b: Uint8Array) => '0x' + Buffer.from(b).toString('hex');

/** `purposeCommitment` del contrato. `subjectRef` y `salt` viven solo en el directorio privado. */
export function compromisoDeProposito(subjectRef: string, proposito: string, salt: string): string {
  return hex(keccak256(concatenar(palabra(COMMITMENT_TAG), palabra(subjectRef), palabra(proposito), palabra(salt))));
}

export interface AtestacionSFSP {
  attestationId: string;
  subjectCommitment: string;
  purpose: string;
  claimsRoot: string;
  validFrom: number;
  validUntil: number;
  policyVersion: string;
}

export function proyectarCredencial(c: CredencialSFSP, subjectRef: string, salt: string): AtestacionSFSP {
  const purpose = b32Texto(c.credentialSubject.proposito);
  return {
    attestationId: '0x' + keccak256Hex(c.id),
    subjectCommitment: compromisoDeProposito(subjectRef, purpose, salt),
    purpose,
    claimsRoot: c.credentialSubject.claimsRoot,
    validFrom: Math.floor(new Date(c.validFrom).getTime() / 1000),
    validUntil: Math.floor(new Date(c.validUntil).getTime() / 1000),
    policyVersion: b32Texto(c.credentialSubject.politica),
  };
}

export function separadorDeDominio(chainId: number | bigint, contrato: string, dominio = DOMINIO_ADAPTADOR): string {
  return hex(
    keccak256(concatenar(DOMAIN_TYPEHASH, kh(dominio.nombre), kh(dominio.version), entero(chainId), direccion(contrato))),
  );
}

/** El digest que firma el emisor y que `recoverAttestation` del contrato recupera. */
export function digestDeAtestacion(a: AtestacionSFSP, chainId: number | bigint, contrato: string, dominio = DOMINIO_ADAPTADOR): string {
  const estructura = keccak256(
    concatenar(
      palabra(ATTESTATION_TYPEHASH),
      palabra(a.attestationId),
      palabra(a.subjectCommitment),
      palabra(a.purpose),
      palabra(a.claimsRoot),
      entero(a.validFrom),
      entero(a.validUntil),
      palabra(a.policyVersion),
      entero(chainId),
      direccion(contrato),
    ),
  );
  return hex(keccak256(concatenar(new Uint8Array([0x19, 0x01]), palabra(separadorDeDominio(chainId, contrato, dominio)), estructura)));
}
