/* Presentaciones verificables: la persona prueba algo, y solo eso.
 *
 * Una presentación junta la credencial, las divulgaciones que la persona
 * ELIGIÓ revelar con su camino de Merkle, la audiencia y un reto de un solo
 * uso, todo firmado con el did:key de la persona. Sin audiencia y reto, una
 * presentación robada se reutilizaría con otro verificador (SFSP-110 §3.1:
 * una attestation sin audiencia declarada no se acepta).
 *
 * `verificarPresentacion` devuelve un Resultado de SFSP con código, nunca un
 * booleano. Una lista de estado que no se pudo leer es UNKNOWN_SOURCE, no
 * DENY y mucho menos ALLOW: fallar hacia «válida» es cómo se acepta una
 * credencial revocada el día que el emisor está caído. */

import { ErrorSFSP, negar, permitir, fuenteDesconocida, type Resultado } from '../codigos.js';
import {
  type CredencialSFSP,
  type Divulgacion,
  leerCredencial,
  pruebaDeClaim,
  verificarPrueba,
} from './credencial.js';
import { didKeyDe, type Obtener, type ParDeLlaves, publicaDeDidKey, publicaDeMetodo, resolverDid } from './did.js';
import { ListaDeEstado, leerLista } from './estado.js';
import { firmaValida, firmarJws, leerJws } from './jws.js';

export interface DivulgacionConPrueba extends Divulgacion {
  prueba: string[];
}

export interface PresentacionSFSP {
  '@context': string[];
  type: string[];
  holder: string;
  verifiableCredential: string[];
  divulgaciones: DivulgacionConPrueba[];
  aud: string;
  nonce: string;
  iat: number;
  exp: number;
}

export function presentar(o: {
  credencialJwt: string;
  /** Todas las divulgaciones que tiene la billetera: hacen falta para armar las pruebas. */
  divulgaciones: Divulgacion[];
  /** Los nombres de los claims que la persona decide revelar. Puede ser ninguno. */
  revelar: string[];
  titular: ParDeLlaves;
  audiencia: string;
  nonce: string;
  ahora?: Date;
  duracionSeg?: number;
}): string {
  const did = didKeyDe(o.titular.publica);
  const cred = leerCredencial(o.credencialJwt).payload;
  if (cred.credentialSubject.id !== did) throw new ErrorSFSP('DENY_AUTHORIZATION', 'esa credencial no es de este titular');
  const t = Math.floor((o.ahora ?? new Date()).getTime() / 1000);
  const divulgaciones = o.revelar.map((nombre) => {
    const d = o.divulgaciones.find((x) => x.nombre === nombre);
    if (!d) throw new ErrorSFSP('DENY_POLICY', `no hay claim ${nombre}`);
    return { ...d, prueba: pruebaDeClaim(o.divulgaciones, nombre) };
  });
  const vp: PresentacionSFSP = {
    '@context': ['https://www.w3.org/ns/credentials/v2'],
    type: ['VerifiablePresentation', 'SFSPPresentacion'],
    holder: did,
    verifiableCredential: [o.credencialJwt],
    divulgaciones,
    aud: o.audiencia,
    nonce: o.nonce,
    iat: t,
    exp: t + (o.duracionSeg ?? 300),
  };
  return firmarJws(vp, { typ: 'vp+jwt', kid: `${did}#${did.slice('did:key:'.length)}` }, o.titular);
}

export interface Verificado {
  emisor: string;
  titular: string;
  proposito: string;
  politica: string;
  credencialId: string;
  claimsRoot: string;
  validoDesde: Date;
  validoHasta: Date;
  claims: Record<string, unknown>;
  credencial: CredencialSFSP;
}

export interface OpcionesVerificacion {
  audiencia: string;
  /** El reto que este verificador emitió. `consumirNonce` lo marca como usado. */
  nonce: string;
  consumirNonce?: (nonce: string) => boolean;
  /** DIDs de emisores aceptados PARA ESTE PROPÓSITO. Vacía = ninguno. */
  emisoresConfiables: Record<string, string[]>;
  proposito: string;
  exigir?: string[];
  obtener?: Obtener;
  /** Devuelve el JWT de la lista de estado. Se inyecta como `obtener`. */
  obtenerLista?: (url: string) => Promise<string>;
  ahora?: Date;
}

export async function verificarPresentacion(vpJwt: string, o: OpcionesVerificacion): Promise<Resultado<Verificado>> {
  const ahora = o.ahora ?? new Date();
  const t = Math.floor(ahora.getTime() / 1000);
  let vpL;
  try {
    vpL = leerJws<PresentacionSFSP>(vpJwt);
  } catch (e) {
    return negar('DENY_POLICY', (e as Error).message);
  }
  const vp = vpL.payload;
  if (vpL.cabecera.typ !== 'vp+jwt' || !vp?.holder?.startsWith('did:key:')) return negar('DENY_POLICY', 'presentación mal formada');

  // 1 · La firma de la persona, con la llave de su propio DID.
  let pubTitular: Uint8Array;
  try {
    pubTitular = publicaDeDidKey(vp.holder);
  } catch (e) {
    return negar('DENY_POLICY', (e as Error).message);
  }
  if (!firmaValida(vpL, pubTitular)) return negar('DENY_AUTHORIZATION', 'firma de la presentación inválida');

  // 2 · Para quién, cuándo y una sola vez.
  if (vp.aud !== o.audiencia) return negar('DENY_AUTHORIZATION', 'la presentación es para otra audiencia');
  if (vp.nonce !== o.nonce) return negar('DENY_AUTHORIZATION', 'reto distinto');
  if (!(vp.iat <= t + 60 && t < vp.exp)) return negar('DENY_POLICY', 'presentación vencida');
  if (o.consumirNonce && !o.consumirNonce(vp.nonce)) return negar('DENY_AUTHORIZATION', 'reto ya usado');

  // 3 · La credencial: una, del titular, de un emisor aceptado para este propósito.
  if (!Array.isArray(vp.verifiableCredential) || vp.verifiableCredential.length !== 1) {
    return negar('DENY_POLICY', 'se espera exactamente una credencial');
  }
  let cL;
  try {
    cL = leerCredencial(vp.verifiableCredential[0]!);
  } catch (e) {
    return negar('DENY_POLICY', (e as Error).message);
  }
  const c = cL.payload;
  if (c.credentialSubject.id !== vp.holder) return negar('DENY_AUTHORIZATION', 'la credencial es de otra persona');
  if (c.credentialSubject.proposito !== o.proposito) return negar('DENY_POLICY', `propósito ${c.credentialSubject.proposito}, se pidió ${o.proposito}`);
  if (!(o.emisoresConfiables[o.proposito] ?? []).includes(c.issuer)) return negar('DENY_AUTHORIZATION', 'emisor no aceptado para este propósito');

  let docEmisor;
  try {
    docEmisor = await resolverDid(c.issuer, o.obtener);
  } catch (e) {
    const err = e as ErrorSFSP;
    return err.codigo === 'UNKNOWN_SOURCE' ? fuenteDesconocida(err.message) : negar('DENY_AUTHORIZATION', err.message);
  }
  const kid = cL.cabecera.kid;
  if (!kid?.startsWith(c.issuer + '#')) return negar('DENY_AUTHORIZATION', 'la llave no es del emisor');
  let pubEmisor: Uint8Array;
  try {
    pubEmisor = publicaDeMetodo(docEmisor, kid, 'assertionMethod');
  } catch (e) {
    return negar('DENY_AUTHORIZATION', (e as Error).message);
  }
  if (!firmaValida(cL, pubEmisor)) return negar('DENY_AUTHORIZATION', 'firma de la credencial inválida');

  // 4 · Vigencia y estado.
  const desde = new Date(c.validFrom);
  const hasta = new Date(c.validUntil);
  if (!(desde.getTime() <= ahora.getTime() && ahora.getTime() < hasta.getTime())) return negar('DENY_POLICY', 'credencial fuera de vigencia');
  if (c.credentialStatus) {
    if (!o.obtenerLista) return fuenteDesconocida('la credencial tiene estado y no hay forma de leer la lista');
    let lista: ListaDeEstado;
    try {
      const lJwt = await o.obtenerLista(c.credentialStatus.statusListCredential);
      const lL = leerLista(lJwt);
      if (lL.payload.issuer !== c.issuer) return negar('DENY_AUTHORIZATION', 'la lista de estado no es del emisor');
      const pubL = publicaDeMetodo(docEmisor, lL.cabecera.kid, 'assertionMethod');
      if (!firmaValida(lL, pubL)) return negar('DENY_AUTHORIZATION', 'firma de la lista inválida');
      if (lL.payload.credentialSubject.statusPurpose !== c.credentialStatus.statusPurpose) return negar('DENY_POLICY', 'lista de otro propósito');
      lista = ListaDeEstado.decodificar(lL.payload.credentialSubject.encodedList);
    } catch (e) {
      return fuenteDesconocida(`no se pudo leer la lista de estado: ${(e as Error).message}`);
    }
    if (lista.leer(Number(c.credentialStatus.statusListIndex))) {
      return negar('DENY_ELIGIBILITY', c.credentialStatus.statusPurpose === 'revocation' ? 'credencial revocada' : 'credencial suspendida');
    }
  }

  // 5 · Lo revelado cuadra con la raíz firmada, y está lo que se exige.
  const claims: Record<string, unknown> = {};
  for (const d of vp.divulgaciones ?? []) {
    if (!verificarPrueba(d, d.prueba ?? [], c.credentialSubject.claimsRoot)) return negar('DENY_AUTHORIZATION', `el claim ${d.nombre} no pertenece a la credencial`);
    if (d.nombre in claims) return negar('DENY_POLICY', `claim repetido: ${d.nombre}`);
    claims[d.nombre] = d.valor;
  }
  for (const n of o.exigir ?? []) if (!(n in claims)) return negar('DENY_ELIGIBILITY', `falta revelar ${n}`);

  return permitir({
    emisor: c.issuer,
    titular: vp.holder,
    proposito: c.credentialSubject.proposito,
    politica: c.credentialSubject.politica,
    credencialId: c.id,
    claimsRoot: c.credentialSubject.claimsRoot,
    validoDesde: desde,
    validoHasta: hasta,
    claims,
    credencial: c,
  });
}
