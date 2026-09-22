/* Identificadores internos (§1 del contrato interno).
 *
 * Todos son aleatorios del generador criptográfico y ninguno deriva de datos
 * personales, de un contador ni de una marca de tiempo. Un identificador que se
 * puede predecir es un identificador que se puede enumerar. */

import { randomBytes } from 'node:crypto';

export type PrefijoId =
  | 'acc'
  | 'bnd'
  | 'iss'
  | 'case'
  | 'auth'
  | 'op'
  | 'mig'
  | 'ev'
  | 'res'
  | 'lot';

export function nuevoId(prefijo: PrefijoId): string {
  return `${prefijo}_${randomBytes(16).toString('hex')}`;
}

const PATRON = /^(acc|bnd|iss|case|auth|op|mig|ev|res|lot)_[0-9a-f]{32}$/;

export function esId(valor: string, prefijo?: PrefijoId): boolean {
  if (!PATRON.test(valor)) return false;
  return prefijo ? valor.startsWith(`${prefijo}_`) : true;
}

/** Referencia opaca hacia un sujeto de Genesis ID. Nunca se publica. */
export function nuevaReferenciaDeSujeto(): string {
  return `gsr_${randomBytes(16).toString('hex')}`;
}
