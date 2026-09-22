/* Códigos de resultado de SFSP (§4 del contrato interno).
 *
 * Un rechazo SIEMPRE lleva código. La interfaz traduce el código; nunca muestra
 * el texto crudo. Y dos códigos no se pueden confundir nunca:
 *
 *   · UNKNOWN_SOURCE no es DENY y no es cero. Significa «no pude leer». Bloquea
 *     la decisión que dependa de esa fuente y deja el resto utilizable. El día
 *     que un fallo de RPC se traduzca a saldo cero, alguien va a creer que
 *     perdió su dinero.
 *   · BLOCKED_DECISION no es DENY tampoco. Significa que falta una decisión
 *     humana (Dxx) y que NO se va a elegir un valor por defecto para seguir. */

export const CODIGOS = [
  'ALLOW',
  'DENY_POLICY',
  'DENY_ELIGIBILITY',
  'DENY_JURISDICTION',
  'DENY_ASSET_STATE',
  'DENY_AUTHORIZATION',
  'DENY_LIMIT',
  'REVIEW_REQUIRED',
  'UNKNOWN_SOURCE',
  'BLOCKED_DECISION',
] as const;

export type Codigo = (typeof CODIGOS)[number];

export interface Resultado<T> {
  codigo: Codigo;
  /** Sólo hay valor cuando el código es ALLOW. En cualquier otro caso es null. */
  valor: T | null;
  detalle: string;
  /** Qué decisión Dxx falta, si el código es BLOCKED_DECISION. */
  decision?: string;
}

export function permitir<T>(valor: T, detalle = ''): Resultado<T> {
  return { codigo: 'ALLOW', valor, detalle };
}

export function negar<T>(codigo: Exclude<Codigo, 'ALLOW'>, detalle: string): Resultado<T> {
  return { codigo, valor: null, detalle };
}

export function bloqueadoPorDecision<T>(decision: string, detalle: string): Resultado<T> {
  return { codigo: 'BLOCKED_DECISION', valor: null, detalle, decision };
}

export function fuenteDesconocida<T>(detalle: string): Resultado<T> {
  return { codigo: 'UNKNOWN_SOURCE', valor: null, detalle };
}

/** Un error de dominio de SFSP. Lleva código para que quien lo reciba decida. */
export class ErrorSFSP extends Error {
  readonly codigo: Codigo;
  constructor(codigo: Codigo, mensaje: string) {
    super(`${codigo}: ${mensaje}`);
    this.name = 'ErrorSFSP';
    this.codigo = codigo;
  }
}
