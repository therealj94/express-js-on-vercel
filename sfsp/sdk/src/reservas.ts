/* Reservas y capacidad autorizada (§6.2 del contrato interno).
 *
 *   EligibleValue_i = NetRealizableValue_i
 *                     × EligibilityFactor_i
 *                     × (1 - Haircut_i)
 *                     × ConcentrationFactor_i
 *
 * Tres advertencias que este módulo impone en código, no en prosa:
 *
 *   1. NetRealizableValue NO es «onzas por spot». Es el valor de los derechos
 *      netos realizables: descontados costes, permisos, deuda y tiempo. El
 *      módulo lo recibe ya calculado por la metodología firmada; lo que sí
 *      impide es que alguien meta un valor de mercado bruto sin declararlo.
 *   2. Los tres factores son distintos y no se duplican entre sí. Aplicar un
 *      haircut y además un factor de elegibilidad que ya lo incluía descuenta
 *      dos veces, y eso también es un error, no una prudencia.
 *   3. Una reserva vencida, o ya asignada a otra obligación, aporta CERO. No se
 *      cuenta el mismo oro para respaldar dos cosas.
 *
 * Todos los porcentajes concretos son decisión D04 y aquí valen null hasta que
 * se aprueben. Con un factor en null el resultado es BLOCKED_DECISION, nunca un
 * número «recomendado». */

import { bloqueadoPorDecision, permitir, negar } from './codigos.js';
import type { Resultado } from './codigos.js';

export type Tier = 'A' | 'B' | 'C' | 'D' | 'E';

export interface ReserveAsset {
  reserveAssetId: string;
  tier: Tier;
  /** Valor neto realizable en centavos de USD, entero. */
  netRealizableValueCents: bigint;
  /** 0 a 10000 en puntos básicos. null = pendiente D04. */
  eligibilityFactorBps: number | null;
  haircutBps: number | null;
  concentrationFactorBps: number | null;
  /** Fecha de vencimiento de la acreditación. */
  expiresAtISO: string;
  /** Obligaciones a las que ya está asignada en exclusiva. */
  asignadaA: string[];
  /** Integridad del expediente. NO prueba que el activo exista. */
  evidenceHash: string;
  estado: 'PENDING' | 'VERIFIED' | 'ELIGIBLE' | 'DEGRADED' | 'EXPIRED' | 'RELEASED';
}

const BPS = 10000n;

/** Valor elegible de una reserva, en centavos. */
export function valorElegible(
  r: ReserveAsset,
  ahoraISO: string,
  obligacion: string,
): Resultado<bigint> {
  if (r.eligibilityFactorBps === null || r.haircutBps === null || r.concentrationFactorBps === null) {
    return bloqueadoPorDecision<bigint>(
      'D04',
      `la reserva ${r.reserveAssetId} no tiene metodología aprobada de elegibilidad, haircut o concentración`,
    );
  }
  if (r.estado !== 'ELIGIBLE' && r.estado !== 'VERIFIED') {
    return negar<bigint>('DENY_ASSET_STATE', `la reserva está en estado ${r.estado}`);
  }
  if (Date.parse(r.expiresAtISO) <= Date.parse(ahoraISO)) {
    return negar<bigint>('DENY_ASSET_STATE', 'la acreditación de la reserva está vencida');
  }
  if (r.asignadaA.length > 0 && !r.asignadaA.includes(obligacion)) {
    return negar<bigint>(
      'DENY_LIMIT',
      `la reserva ya está asignada en exclusiva a ${r.asignadaA.join(', ')}`,
    );
  }

  const v =
    (r.netRealizableValueCents *
      BigInt(r.eligibilityFactorBps) *
      (BPS - BigInt(r.haircutBps)) *
      BigInt(r.concentrationFactorBps)) /
    (BPS * BPS * BPS);

  return permitir(v);
}

/** Suma el valor elegible de una cartera. Si una parte está bloqueada, el total también. */
export function valorElegibleTotal(
  reservas: ReserveAsset[],
  ahoraISO: string,
  obligacion: string,
): Resultado<bigint> {
  let total = 0n;
  for (const r of reservas) {
    const v = valorElegible(r, ahoraISO, obligacion);
    if (v.codigo === 'BLOCKED_DECISION') return v;
    if (v.codigo === 'ALLOW') total += v.valor as bigint;
    /* Un DENY (vencida, asignada, estado) aporta cero y no rompe el total: es
       una reserva que no cuenta, no un fallo de lectura. */
  }
  return permitir(total);
}

/**
 * Capacidad autorizada en unidades del activo:
 *
 *   RAC_units = floor(EligibleReserveUSD / ReferenceUSDperUnit * 10^decimals)
 *
 * `referenciaCentavosPorUnidad` viene de la política de precio, que es D01.
 */
export function capacidadAutorizada(
  valorElegibleCents: bigint,
  referenciaCentavosPorUnidad: bigint | null,
  decimals: number | null,
): Resultado<bigint> {
  if (referenciaCentavosPorUnidad === null) {
    return bloqueadoPorDecision<bigint>('D01', 'no hay política de precio aprobada para la referencia');
  }
  if (referenciaCentavosPorUnidad <= 0n) {
    return negar<bigint>('DENY_POLICY', 'la referencia de precio debe ser positiva');
  }
  if (decimals === null) {
    return negar<bigint>('UNKNOWN_SOURCE', 'decimales del activo desconocidos: no se sustituyen por 18');
  }
  const escala = 10n ** BigInt(decimals);
  return permitir((valorElegibleCents * escala) / referenciaCentavosPorUnidad);
}
