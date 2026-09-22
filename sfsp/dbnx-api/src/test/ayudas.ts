// Ayudas de prueba. Todo sintetico: sin datos personales, sin credenciales y
// sin direcciones reales del ecosistema.

import { relojFijo, type Actor, type Reloj } from '../tipos.js';

export const CASE_ID = 'case_00000000000000000000000000000001';
export const ISSUER_ID = 'iss_00000000000000000000000000000001';
export const AUTH_ID = 'auth_00000000000000000000000000000001';
export const ASSET_ID = 'SFSP:SEC:iss_sintetico:S1';
export const CHAIN_ID = 31337;
export const CONTRATO = '0xTEST_ISSUANCE_CONTROLLER';
export const DESTINO = 'SF-0000-0000-0001-7';

export const T0 = '2030-01-01T00:00:00Z';
export const T1 = '2030-01-02T00:00:00Z';
export const T_TARDE = '2030-02-01T00:00:00Z';

export const reloj: Reloj = relojFijo(T1);

export const solicitante: Actor = { actorId: 'act_solicitante', rol: 'SOLICITANTE' };
export const analista: Actor = { actorId: 'act_analista', rol: 'ANALISTA' };
export const revisor: Actor = { actorId: 'act_revisor', rol: 'REVISOR' };
export const comite: Actor = { actorId: 'act_comite', rol: 'COMITE' };
export const cumplimiento: Actor = { actorId: 'act_cumplimiento', rol: 'CUMPLIMIENTO' };

// ---------------------------------------------------------------------------
// Claves de prueba.
//
// SE GENERAN EN EL ACTO, en memoria, y NUNCA se escriben en un archivo. El §7
// del contrato interno prohibe que una llave privada este en codigo, pruebas,
// registros o evidencia; una clave fija «de prueba» es exactamente eso, y ha
// acabado en produccion en proyectos mejor cuidados que este. Como consecuencia
// deseada, cada ejecucion de la suite firma con claves distintas: si algo
// dependiera de una clave concreta, la suite lo delataria.
// ---------------------------------------------------------------------------

import { generateKeyPairSync, sign as firmarEd25519 } from 'node:crypto';

import {
  FirmantesEnMemoria,
  mensajeAprobacion,
  type AprobacionFirmada,
  type FirmanteRegistrado,
} from '../firmas.js';
import type { MarcaTiempo, Rol } from '../tipos.js';

export interface ParClaves {
  readonly publicaSPKI: string;
  readonly firmar: (mensaje: Buffer) => string;
}

/** Un par Ed25519 recien generado. La privada no sale de este objeto. */
export function generarPar(): ParClaves {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicaSPKI: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    firmar: (mensaje: Buffer) => firmarEd25519(null, mensaje, privateKey).toString('base64'),
  };
}

/** Vigencia amplia por defecto: las pruebas que examinan la vigencia la fijan. */
export const VIGENCIA_DESDE: MarcaTiempo = '2029-01-01T00:00:00Z';
export const VIGENCIA_HASTA: MarcaTiempo = '2031-01-01T00:00:00Z';

export interface FirmanteDePrueba {
  readonly actorId: string;
  readonly rol: Rol;
  readonly par: ParClaves;
  readonly fila: FirmanteRegistrado;
}

export function firmanteDePrueba(
  actorId: string,
  rol: Rol,
  vigencia: { desde?: MarcaTiempo; hasta?: MarcaTiempo; revocadoEnUTC?: MarcaTiempo | null } = {},
): FirmanteDePrueba {
  const par = generarPar();
  return {
    actorId,
    rol,
    par,
    fila: {
      actorId,
      rol,
      clavePublicaSPKI: par.publicaSPKI,
      notBefore: vigencia.desde ?? VIGENCIA_DESDE,
      expiry: vigencia.hasta ?? VIGENCIA_HASTA,
      revocadoEnUTC: vigencia.revocadoEnUTC ?? null,
    },
  };
}

/** Firma una aprobacion sobre un digest ya calculado POR EL VERIFICADOR. */
export function aprobar(
  f: FirmanteDePrueba,
  digesto: string,
  firmadoEnUTC: MarcaTiempo,
  extra: { readonly payloadDigest?: string } = {},
): AprobacionFirmada {
  const firma = f.par.firmar(mensajeAprobacion(digesto, f.actorId, f.rol, firmadoEnUTC));
  return extra.payloadDigest === undefined
    ? { actorId: f.actorId, rol: f.rol, firmadoEnUTC, firma }
    : { actorId: f.actorId, rol: f.rol, firmadoEnUTC, firma, payloadDigest: extra.payloadDigest };
}

export function registroCon(...firmantes: readonly FirmanteDePrueba[]): FirmantesEnMemoria {
  return new FirmantesEnMemoria(firmantes.map((f) => f.fila));
}
