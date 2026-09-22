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
 *      netos realizables: descontados costes, permisos, deuda y tiempo.
 *   2. Los tres factores son distintos y no se duplican entre sí.
 *   3. Una reserva vencida, o ya asignada a otra obligación, aporta CERO.
 *
 * DOS DEFECTOS QUE LA AUDITORÍA ENCONTRÓ AQUÍ (H09), y cómo se cierran:
 *
 *   · La suma de una cartera no deduplicaba. Pasar dos veces la misma reserva
 *     la contaba dos veces, y una reserva marcada como asignada a dos
 *     obligaciones aportaba su valor completo a las dos. Eso es exactamente
 *     «contar el mismo oro dos veces», que es el fraude contable clásico de
 *     este negocio. Ahora se deduplica por identificador y la asignación es a
 *     UNA obligación, no a una lista.
 *   · No se validaba el rango de los factores. Un factor de 20000 puntos
 *     básicos, que es el 200 %, se aceptaba y multiplicaba la capacidad. Ahora
 *     un factor fuera de 0 a 10000 es un rechazo, no una capacidad extra.
 *
 * Todos los porcentajes concretos son decisión D04 y aquí valen null hasta que
 * se aprueben. */

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
  expiresAtISO: string;
  /**
   * La obligación a la que esta reserva está asignada en exclusiva, o null si
   * está libre. Es UNA, no una lista: una lista admitía la lectura «respalda a
   * las dos», que es la que permite contar el mismo activo dos veces.
   */
  asignadaA: string | null;
  /** Integridad del expediente. NO prueba que el activo exista. */
  evidenceHash: string;
  estado: 'PENDING' | 'VERIFIED' | 'ELIGIBLE' | 'DEGRADED' | 'EXPIRED' | 'RELEASED';
}

const BPS = 10000n;
const BPS_MAX = 10000;

const enRango = (v: number): boolean => Number.isInteger(v) && v >= 0 && v <= BPS_MAX;

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

  /* Un factor fuera de rango no es un valor generoso: es un dato corrupto, y
     con él la capacidad calculada no significa nada. */
  for (const [nombre, valor] of [
    ['factor de elegibilidad', r.eligibilityFactorBps],
    ['haircut', r.haircutBps],
    ['factor de concentración', r.concentrationFactorBps],
  ] as const) {
    if (!enRango(valor)) {
      return negar<bigint>(
        'DENY_POLICY',
        `el ${nombre} de ${r.reserveAssetId} vale ${valor} puntos básicos, fuera del rango 0 a 10000`,
      );
    }
  }

  if (r.netRealizableValueCents < 0n) {
    return negar<bigint>('DENY_POLICY', `el valor de ${r.reserveAssetId} es negativo`);
  }

  if (r.estado !== 'ELIGIBLE' && r.estado !== 'VERIFIED') {
    return negar<bigint>('DENY_ASSET_STATE', `la reserva está en estado ${r.estado}`);
  }

  const vence = Date.parse(r.expiresAtISO);
  const ahora = Date.parse(ahoraISO);
  if (Number.isNaN(vence) || Number.isNaN(ahora)) {
    return negar<bigint>('UNKNOWN_SOURCE', 'fecha de vencimiento o de referencia ilegible');
  }
  if (vence <= ahora) {
    return negar<bigint>('DENY_ASSET_STATE', 'la acreditación de la reserva está vencida');
  }

  if (r.asignadaA !== null && r.asignadaA !== obligacion) {
    return negar<bigint>(
      'DENY_LIMIT',
      `la reserva ya está asignada en exclusiva a ${r.asignadaA}`,
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

export interface TotalDeCartera {
  valorCents: bigint;
  contadas: number;
  /** Identificadores que aparecían más de una vez. Se contaron una sola. */
  duplicadas: string[];
  /** Las que no aportan, con su motivo. */
  descartadas: Array<{ reserveAssetId: string; codigo: string; detalle: string }>;
}

/**
 * Suma el valor elegible de una cartera.
 *
 * Deduplica por identificador: la misma reserva presentada dos veces se cuenta
 * una. Y si una parte está bloqueada por falta de decisión, el total también
 * lo está, porque un total parcial que parece completo es peor que ninguno.
 */
export function valorElegibleTotal(
  reservas: ReserveAsset[],
  ahoraISO: string,
  obligacion: string,
): Resultado<TotalDeCartera> {
  const vistas = new Set<string>();
  const duplicadas: string[] = [];
  const descartadas: TotalDeCartera['descartadas'] = [];
  let total = 0n;
  let contadas = 0;

  for (const r of reservas) {
    if (vistas.has(r.reserveAssetId)) {
      duplicadas.push(r.reserveAssetId);
      continue;
    }
    vistas.add(r.reserveAssetId);

    const v = valorElegible(r, ahoraISO, obligacion);
    if (v.codigo === 'BLOCKED_DECISION') {
      return { codigo: 'BLOCKED_DECISION', valor: null, detalle: v.detalle, ...(v.decision ? { decision: v.decision } : {}) };
    }
    if (v.codigo === 'UNKNOWN_SOURCE') {
      return { codigo: 'UNKNOWN_SOURCE', valor: null, detalle: v.detalle };
    }
    if (v.codigo === 'ALLOW') {
      total += v.valor as bigint;
      contadas++;
    } else {
      descartadas.push({ reserveAssetId: r.reserveAssetId, codigo: v.codigo, detalle: v.detalle });
    }
  }

  return permitir({ valorCents: total, contadas, duplicadas, descartadas });
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
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    return negar<bigint>('DENY_POLICY', `decimales fuera de rango: ${decimals}`);
  }
  if (valorElegibleCents < 0n) {
    return negar<bigint>('DENY_POLICY', 'el valor elegible no puede ser negativo');
  }
  const escala = 10n ** BigInt(decimals);
  return permitir((valorElegibleCents * escala) / referenciaCentavosPorUnidad);
}
