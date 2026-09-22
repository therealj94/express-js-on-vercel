/* Conciliación de migración de activos (§6.3 del contrato interno).
 *
 *     S0 = A + E        E = N + P        =>   S0 = A + N + P
 *
 *   S0  suministro o derecho dentro del alcance aprobado
 *   A   derechos originales todavía NO extinguidos ni excluidos
 *   E   derechos viejos excluidos de circulación por la migración
 *   N   unidades nuevas válidas ya emitidas
 *   P   entitlements pendientes que corresponden a derechos ya excluidos
 *
 * El error que hay que evitar es sumar E + N + P y compararlo con S0. E no es
 * un tercer sumando: es la CONTRAPARTE de N + P. Con S0=1000, A=600, E=400,
 * N=350 y P=50, la cuenta correcta da 1000 = 600 + 350 + 50, y la equivocada
 * daría 800 y haría pensar que faltan 200 unidades que nunca faltaron.
 *
 * Todas las cantidades son enteros en unidades base del instrumento ORIGINAL.
 * Si el reemplazo cambia de decimales o lleva un ratio, se convierte antes y el
 * resto se trata explícitamente: nunca se trunca un derecho en silencio. */

import { ErrorSFSP } from './codigos.js';

export interface EstadoDeMigracion {
  migrationId: string;
  /** Suministro o derecho en alcance, en unidades base del instrumento original. */
  S0: bigint;
  A: bigint;
  E: bigint;
  N: bigint;
  P: bigint;
}

export interface ResultadoDeConciliacion {
  cuadra: boolean;
  /** S0 - (A + N + P). Cero cuando cuadra. */
  diferenciaSuministro: bigint;
  /** E - (N + P). Cero cuando cuadra. */
  diferenciaExclusion: bigint;
  detalle: string;
}

export function conciliar(m: EstadoDeMigracion): ResultadoDeConciliacion {
  for (const [nombre, v] of Object.entries({ S0: m.S0, A: m.A, E: m.E, N: m.N, P: m.P })) {
    if (v < 0n) throw new ErrorSFSP('DENY_POLICY', `${nombre} no puede ser negativo`);
  }
  const diferenciaSuministro = m.S0 - (m.A + m.N + m.P);
  const diferenciaExclusion = m.E - (m.N + m.P);
  const cuadra = diferenciaSuministro === 0n && diferenciaExclusion === 0n;
  return {
    cuadra,
    diferenciaSuministro,
    diferenciaExclusion,
    detalle: cuadra
      ? 'S0 = A + N + P y E = N + P'
      : `S0-(A+N+P)=${diferenciaSuministro}, E-(N+P)=${diferenciaExclusion}`,
  };
}

/** Migración totalmente congelada: A vale cero y S0 = N + P. */
export function conciliarCongelada(m: EstadoDeMigracion): ResultadoDeConciliacion {
  if (m.A !== 0n) {
    throw new ErrorSFSP(
      'DENY_ASSET_STATE',
      'en modo FROZEN_SNAPSHOT no pueden quedar derechos originales en circulación',
    );
  }
  return conciliar(m);
}

/* ------------------------------------------------------- ratios y restos */

export interface ConversionConResto {
  unidadesNuevas: bigint;
  /** Lo que no entra en una unidad nueva. NUNCA se descarta. */
  resto: bigint;
  /** Denominador del resto, para poder representarlo como fracción exacta. */
  denominador: bigint;
}

/**
 * Convierte una cantidad vieja a unidades nuevas con un ratio racional
 * `numerador/denominador`, devolviendo el resto aparte.
 *
 * El resto va a un registro de fracciones o eleva la precisión del entitlement,
 * según decida D09. Lo que no puede pasar es que desaparezca: en un padrón de
 * miles de tenedores, truncar un resto por cabeza es quitarle a cada uno una
 * migaja y quedársela el sistema.
 */
export function convertirConRatio(
  cantidadVieja: bigint,
  numerador: bigint,
  denominador: bigint,
): ConversionConResto {
  if (denominador <= 0n || numerador <= 0n) {
    throw new ErrorSFSP('DENY_POLICY', 'el ratio debe tener numerador y denominador positivos');
  }
  if (cantidadVieja < 0n) throw new ErrorSFSP('DENY_POLICY', 'la cantidad no puede ser negativa');
  const total = cantidadVieja * numerador;
  return {
    unidadesNuevas: total / denominador,
    resto: total % denominador,
    denominador,
  };
}

/** Comprueba que una conversión no perdió nada: nuevas*den + resto == vieja*num. */
export function conversionSinPerdida(
  cantidadVieja: bigint,
  numerador: bigint,
  denominador: bigint,
  c: ConversionConResto,
): boolean {
  return c.unidadesNuevas * denominador + c.resto === cantidadVieja * numerador;
}

/* ---------------------------------------------------------- anti doble derecho */

export interface Claim {
  migrationId: string;
  /** Anti-replay propio. Una firma EIP-712 por sí sola no lo aporta. */
  nullifier: string;
  beneficiario: string;
  cantidadVieja: bigint;
}

export class RegistroDeClaims {
  private readonly consumidos = new Set<string>();

  private clave(c: Claim): string {
    return `${c.migrationId}|${c.nullifier}`;
  }

  yaConsumido(c: Claim): boolean {
    return this.consumidos.has(this.clave(c));
  }

  /** Consume un claim. El segundo intento con el mismo nullifier falla. */
  consumir(c: Claim): void {
    const k = this.clave(c);
    if (this.consumidos.has(k)) {
      throw new ErrorSFSP('DENY_AUTHORIZATION', 'ese derecho ya fue reclamado');
    }
    this.consumidos.add(k);
  }

  get total(): number {
    return this.consumidos.size;
  }
}
