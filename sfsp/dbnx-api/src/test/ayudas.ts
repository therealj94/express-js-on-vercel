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
