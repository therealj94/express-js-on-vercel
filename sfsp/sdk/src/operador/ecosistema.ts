/* Quién es dueño de qué en el ecosistema, y qué servicios usa cada producto.
 *
 * AU-RA FP (antes ULTRON FP) opera el protocolo para todas las empresas. Para
 * saber qué puede hacer cada una hay que saber de quién es cada cosa: la dueña
 * de un mercado no decide qué es apto para listarse en él, y la dueña de una
 * tesorería no certifica sus propias reservas. Ver `operador/AU-RA-FP.md`.
 *
 * Este archivo es DATO, no código: la estructura que dio la dirección. Lo que
 * la dirección no dijo figura como `POR_CONFIRMAR`, y ninguna regla lo adivina.
 * Una regla que dependa de un dueño desconocido devuelve BLOCKED_DECISION D21.
 *
 * El registro se pasa como parámetro a todas las funciones del operador, nunca
 * se lee de una variable global: así una prueba puede usar el registro con D21
 * resuelto sin tocar el declarado, y el declarado no se puede alterar desde
 * fuera por accidente. */

import type { Resultado } from '../codigos.js';
import { permitir, bloqueadoPorDecision } from '../codigos.js';

export const POR_CONFIRMAR = 'POR_CONFIRMAR' as const;
export type PorConfirmar = typeof POR_CONFIRMAR;

export type EmpresaId = 'ORDEN_GLOBAL' | 'AUCORP' | 'DBNX' | 'AURA_FP';

/** Un revisor que no es ninguna de las empresas del ecosistema. */
export const AUDITOR_EXTERNO = 'AUDITOR_EXTERNO' as const;
export type Parte = EmpresaId | typeof AUDITOR_EXTERNO;

export type PapelDeEmpresa = 'OPERADOR' | 'AUDITOR' | 'CLIENTE';

/**
 * `INDEPENDIENTE`: la dirección la declaró como una empresa aparte.
 * Otra `EmpresaId`: pertenece a esa empresa, y cuenta como la misma parte.
 * `POR_CONFIRMAR`: nadie lo ha dicho todavía (D21).
 */
export type Duena = EmpresaId | 'INDEPENDIENTE' | PorConfirmar;

export interface Empresa {
  id: EmpresaId;
  nombre: string;
  papel: PapelDeEmpresa;
  duena: Duena;
}

export type ProductoId =
  | 'VETA_WALLET'
  | 'CADENA_5550'
  | 'TESORERIA'
  | 'ORDENEX'
  | 'AUCORP_FIAT'
  | 'DBNX_DATOS'
  | 'ASISTENTE_AURA'
  | 'GENESIS_ID'
  | 'MYTOKENPAY'
  | 'ORDENSCAN'
  | 'PULSE2CHAT'
  | 'CADENA_8532';

export type ServicioId =
  | 'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06' | 'S07'
  | 'S08' | 'S09' | 'S10' | 'S11' | 'S12' | 'S13' | 'S14';

/** De menos a más poder. Tener uno incluye los anteriores. */
export const ALCANCES = ['LECTURA', 'EJECUCION', 'ESCRITURA'] as const;
export type Alcance = (typeof ALCANCES)[number];

export interface Producto {
  id: ProductoId;
  nombre: string;
  duena: EmpresaId | PorConfirmar;
  /** Lo contratado: servicio → alcance máximo. Lo que no está, no se puede usar. */
  contrata: Partial<Record<ServicioId, Alcance>>;
}

export interface Ecosistema {
  empresas: Readonly<Record<EmpresaId, Empresa>>;
  productos: Readonly<Record<ProductoId, Producto>>;
  /** Quién opera el protocolo. */
  operador: EmpresaId;
  /** Quién escribe pasaportes y audita activos. */
  auditor: EmpresaId;
  /**
   * Si hay contratos de servicio firmados (D21). Mientras sea `false`, ningún
   * producto recibe credenciales: toda llamada es BLOCKED_DECISION D21.
   */
  contratosVigentes: boolean;
}

const congelar = <T extends object>(o: T): Readonly<T> => Object.freeze(o);

/**
 * La estructura declarada por la dirección el 22 de septiembre de 2026.
 *
 * Declarado: Orden Global es dueña de Veta Wallet, de la cadena y de la
 * tesorería. AuCorp es dueña de Ordenex. DBNX es una empresa aparte que audita
 * y publica datos al estilo de CoinMarketCap. AU-RA FP da los servicios a todo
 * el ecosistema y asegura que se cumpla SFSP.
 *
 * No declarado: de quién es AU-RA FP, Genesis ID, MyTokenPay, ordenscan,
 * PULSE2CHAT y la cadena 8532. Tampoco hay contratos firmados.
 */
export const ECOSISTEMA_DECLARADO: Ecosistema = congelar({
  empresas: congelar({
    ORDEN_GLOBAL: congelar({ id: 'ORDEN_GLOBAL', nombre: 'Orden Global', papel: 'CLIENTE', duena: 'INDEPENDIENTE' }),
    AUCORP: congelar({ id: 'AUCORP', nombre: 'AuCorp', papel: 'CLIENTE', duena: 'INDEPENDIENTE' }),
    DBNX: congelar({ id: 'DBNX', nombre: 'DBNX', papel: 'AUDITOR', duena: 'INDEPENDIENTE' }),
    AURA_FP: congelar({ id: 'AURA_FP', nombre: 'AU-RA FP', papel: 'OPERADOR', duena: POR_CONFIRMAR }),
  } satisfies Record<EmpresaId, Empresa>),
  productos: congelar({
    VETA_WALLET: congelar({
      id: 'VETA_WALLET', nombre: 'Veta Wallet', duena: 'ORDEN_GLOBAL',
      contrata: congelar({ S01: 'EJECUCION', S02: 'EJECUCION', S05: 'EJECUCION', S10: 'EJECUCION', S13: 'LECTURA' }),
    }),
    CADENA_5550: congelar({
      id: 'CADENA_5550', nombre: 'Cadena 5550', duena: 'ORDEN_GLOBAL',
      contrata: congelar({ S08: 'LECTURA', S09: 'EJECUCION' }),
    }),
    TESORERIA: congelar({
      id: 'TESORERIA', nombre: 'Tesorería de ORIGEN', duena: 'ORDEN_GLOBAL',
      contrata: congelar({ S06: 'EJECUCION', S07: 'LECTURA', S10: 'EJECUCION' }),
    }),
    ORDENEX: congelar({
      id: 'ORDENEX', nombre: 'Ordenex', duena: 'AUCORP',
      contrata: congelar({ S02: 'EJECUCION', S03: 'LECTURA', S04: 'EJECUCION', S05: 'EJECUCION', S10: 'EJECUCION' }),
    }),
    AUCORP_FIAT: congelar({
      id: 'AUCORP_FIAT', nombre: 'Plataforma fiat AuCorp', duena: 'AUCORP',
      contrata: congelar({ S09: 'EJECUCION', S11: 'EJECUCION' }),
    }),
    DBNX_DATOS: congelar({
      id: 'DBNX_DATOS', nombre: 'Admisión, auditoría y datos de DBNX', duena: 'DBNX',
      contrata: congelar({ S03: 'ESCRITURA', S07: 'ESCRITURA', S08: 'LECTURA', S10: 'EJECUCION', S12: 'LECTURA', S14: 'LECTURA' }),
    }),
    ASISTENTE_AURA: congelar({
      id: 'ASISTENTE_AURA', nombre: 'Asistente AU-RA', duena: 'AURA_FP',
      contrata: congelar({ S13: 'EJECUCION', S02: 'LECTURA', S03: 'LECTURA', S12: 'LECTURA' }),
    }),
    GENESIS_ID: congelar({ id: 'GENESIS_ID', nombre: 'Genesis ID', duena: POR_CONFIRMAR, contrata: congelar({ S02: 'LECTURA' }) }),
    MYTOKENPAY: congelar({
      id: 'MYTOKENPAY', nombre: 'MyTokenPay', duena: POR_CONFIRMAR,
      contrata: congelar({ S01: 'EJECUCION', S02: 'EJECUCION', S05: 'EJECUCION', S11: 'EJECUCION' }),
    }),
    ORDENSCAN: congelar({ id: 'ORDENSCAN', nombre: 'ordenscan.com', duena: POR_CONFIRMAR, contrata: congelar({ S03: 'LECTURA', S08: 'LECTURA' }) }),
    PULSE2CHAT: congelar({ id: 'PULSE2CHAT', nombre: 'PULSE2CHAT', duena: POR_CONFIRMAR, contrata: congelar({ S01: 'EJECUCION' }) }),
    CADENA_8532: congelar({ id: 'CADENA_8532', nombre: 'Cadena 8532 (por retirar)', duena: POR_CONFIRMAR, contrata: congelar({ S08: 'LECTURA' }) }),
  } satisfies Record<ProductoId, Producto>),
  operador: 'AURA_FP',
  auditor: 'DBNX',
  contratosVigentes: false,
});

/**
 * A qué parte pertenece una empresa: sube por la cadena de dueñas hasta una
 * que sea independiente. Dos empresas de la misma parte cuentan como una sola
 * a efectos de conflicto de interés.
 */
export function parteDe(eco: Ecosistema, id: Parte): Resultado<Parte> {
  if (id === AUDITOR_EXTERNO) return permitir<Parte>(AUDITOR_EXTERNO);
  const vistas = new Set<EmpresaId>();
  let actual: EmpresaId = id;
  for (;;) {
    if (vistas.has(actual)) {
      return bloqueadoPorDecision<Parte>('D21', `la cadena de dueñas de ${id} da la vuelta sobre sí misma`);
    }
    vistas.add(actual);
    const e = eco.empresas[actual];
    if (!e) return bloqueadoPorDecision<Parte>('D21', `${actual} no está en el registro`);
    if (e.duena === 'INDEPENDIENTE') return permitir<Parte>(actual);
    if (e.duena === POR_CONFIRMAR) {
      return bloqueadoPorDecision<Parte>('D21', `no se sabe de quién es ${e.nombre}`);
    }
    actual = e.duena;
  }
}

/**
 * ¿Son partes distintas? Si no se puede saber porque falta un dueño, NO se
 * responde «sí»: se bloquea con D21. Suponer independencia es justo el error
 * que esta función existe para impedir.
 */
export function sonIndependientes(eco: Ecosistema, a: Parte, b: Parte): Resultado<boolean> {
  if (a === b) return permitir(false, 'es la misma empresa');
  const pa = parteDe(eco, a);
  if (pa.codigo !== 'ALLOW') return { ...pa, valor: null };
  const pb = parteDe(eco, b);
  if (pb.codigo !== 'ALLOW') return { ...pb, valor: null };
  return pa.valor === pb.valor
    ? permitir(false, `${a} y ${b} pertenecen a la misma parte`)
    : permitir(true);
}

/** Las entradas que todavía nadie ha confirmado. Es la lista de trabajo de D21. */
export function pendientesDeConfirmar(eco: Ecosistema): string[] {
  const fuera: string[] = [];
  for (const e of Object.values(eco.empresas)) {
    if (e.duena === POR_CONFIRMAR) fuera.push(`dueña de ${e.nombre}`);
  }
  for (const p of Object.values(eco.productos)) {
    if (p.duena === POR_CONFIRMAR) fuera.push(`dueña de ${p.nombre}`);
  }
  if (!eco.contratosVigentes) fuera.push('contratos de servicio firmados');
  return fuera;
}
