/* Permisos que da la persona sobre SUS datos (el «nodo personal» de Web5).
 *
 * Las apps de Orden Global (Veta, DBNX, AU-RA, Dr Electrum) no leen los datos
 * de una persona porque estén en nuestros servidores: los leen porque ella les
 * dio permiso, para un protocolo, unas acciones y un propósito, hasta una
 * fecha. El permiso es un JWS firmado con SU did:key. El nodo que guarda los
 * datos lo exige en cada lectura y la persona lo revoca cuando quiere.
 *
 * Es el mismo principio de SFSP-110 §3.2 —datos por propósito y audiencia—
 * pero con la llave en manos de la persona, no del operador. */

import { randomUUID } from 'node:crypto';
import { ErrorSFSP, negar, permitir, type Resultado } from '../codigos.js';
import type { ParDeLlaves } from './did.js';
import { didPersona, esDidPersona, fragmentoDePersona, publicaDePersona, type RedSFSP } from './did-sfsp.js';
import { firmaValida, firmarJws, leerJws } from './jws.js';

export const ACCIONES = ['leer', 'escribir', 'consultar'] as const;
export type Accion = (typeof ACCIONES)[number];

export interface Permiso {
  jti: string;
  /** Quien da el permiso: el did:key de la persona. */
  iss: string;
  /** Quien lo recibe: el DID de la app o del servicio. */
  aud: string;
  /** El protocolo de datos, p. ej. `https://ordenglobal.link/protocolos/expediente-minero/v1`. */
  protocolo: string;
  acciones: Accion[];
  proposito: string;
  iat: number;
  exp: number;
}

export function concederPermiso(o: {
  titular: ParDeLlaves;
  app: string;
  protocolo: string;
  acciones: Accion[];
  proposito: string;
  vence: Date;
  ahora?: Date;
  red?: RedSFSP;
}): string {
  if (!o.acciones.length || o.acciones.some((a) => !ACCIONES.includes(a))) throw new ErrorSFSP('DENY_POLICY', 'acciones inválidas');
  const iss = didPersona(o.titular.publica, o.red ?? '5550');
  const iat = Math.floor((o.ahora ?? new Date()).getTime() / 1000);
  const exp = Math.floor(o.vence.getTime() / 1000);
  if (exp <= iat) throw new ErrorSFSP('DENY_POLICY', 'un permiso tiene que vencer después de darse');
  const p: Permiso = { jti: `urn:uuid:${randomUUID()}`, iss, aud: o.app, protocolo: o.protocolo, acciones: [...new Set(o.acciones)], proposito: o.proposito, iat, exp };
  return firmarJws(p, { typ: 'sfsp-permiso+jwt', kid: `${iss}#${fragmentoDePersona(iss)}` }, o.titular);
}

export function verificarPermiso(
  jws: string,
  o: { app: string; protocolo: string; accion: Accion; proposito: string; revocados: ReadonlySet<string>; ahora?: Date; titular?: string },
): Resultado<Permiso> {
  let l;
  try {
    l = leerJws<Permiso>(jws);
  } catch (e) {
    return negar('DENY_POLICY', (e as Error).message);
  }
  const p = l.payload;
  if (l.cabecera.typ !== 'sfsp-permiso+jwt' || !p?.iss || !esDidPersona(p.iss)) return negar('DENY_POLICY', 'no es un permiso');
  let pub: Uint8Array;
  try {
    pub = publicaDePersona(p.iss);
  } catch (e) {
    return negar('DENY_POLICY', (e as Error).message);
  }
  if (!firmaValida(l, pub)) return negar('DENY_AUTHORIZATION', 'firma del permiso inválida');
  if (o.titular && p.iss !== o.titular) return negar('DENY_AUTHORIZATION', 'el permiso lo dio otra persona');
  if (p.aud !== o.app) return negar('DENY_AUTHORIZATION', 'el permiso es para otra app');
  if (p.protocolo !== o.protocolo) return negar('DENY_AUTHORIZATION', 'el permiso es para otro protocolo');
  if (p.proposito !== o.proposito) return negar('DENY_POLICY', 'el permiso es para otro propósito');
  if (!p.acciones.includes(o.accion)) return negar('DENY_AUTHORIZATION', `el permiso no incluye ${o.accion}`);
  const t = Math.floor((o.ahora ?? new Date()).getTime() / 1000);
  if (!(p.iat <= t + 60 && t < p.exp)) return negar('DENY_POLICY', 'permiso vencido');
  if (o.revocados.has(p.jti)) return negar('DENY_AUTHORIZATION', 'permiso revocado por su titular');
  return permitir(p);
}

/** La revocación también la firma la persona: nadie más puede quitarle un permiso que dio ella… ni dárselo. */
export function revocarPermiso(titular: ParDeLlaves, jti: string, ahora?: Date, red: RedSFSP = '5550'): string {
  const iss = didPersona(titular.publica, red);
  return firmarJws({ iss, revoca: jti, iat: Math.floor((ahora ?? new Date()).getTime() / 1000) }, { typ: 'sfsp-revocacion+jwt', kid: `${iss}#${fragmentoDePersona(iss)}` }, titular);
}

/** Aplica una revocación solo si la firmó quien dio el permiso. Devuelve el jti revocado. */
export function aplicarRevocacion(revocacionJws: string, permisoJws: string): string {
  const r = leerJws<{ iss: string; revoca: string }>(revocacionJws);
  const p = leerJws<Permiso>(permisoJws).payload;
  if (r.cabecera.typ !== 'sfsp-revocacion+jwt' || r.payload.revoca !== p.jti) throw new ErrorSFSP('DENY_POLICY', 'la revocación no es de ese permiso');
  if (r.payload.iss !== p.iss || !firmaValida(r, publicaDePersona(p.iss))) throw new ErrorSFSP('DENY_AUTHORIZATION', 'solo el titular revoca su permiso');
  return p.jti;
}
