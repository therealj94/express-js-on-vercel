/* Suministro nativo y liberación de tesorería (§6.1 del contrato interno).
 *
 *   S_native(b) = S_genesis + I_consensus(0..b) - B_protocol(0..b)
 *   R_released  = S_native - U_unactivated
 *   release(x) exige  R_released + x <= min(ReleaseCap, RAC_units)
 *
 * Lo que este módulo impide creer:
 *
 *   · que mandar unidades a una dirección «inaccesible» reduzca el suministro.
 *     No lo reduce. Sólo una quema reconocida por las reglas de la cadena entra
 *     en B_protocol;
 *   · que mover unidades entre cuentas, o depositarlas en tesorería, cambie el
 *     suministro. No lo cambia: las unidades de usuarios depositadas en
 *     tesorería siguen emitidas;
 *   · que ampliar el techo administrativo aumente el saldo técnico disponible.
 *     ReleaseCap limita la distribución; no crea moneda nativa.
 *
 * SFSP no acuña moneda nativa con un contrato ordinario: en una EVM el balance
 * nativo no se crea desde un contrato. Por eso lo que se controla aquí es la
 * DISTRIBUCIÓN desde un vault, y así debe comunicarse mientras D03 no decida
 * otra cosa. */

import { bloqueadoPorDecision, permitir, negar } from './codigos.js';
import type { Resultado } from './codigos.js';
import { ErrorSFSP } from './codigos.js';

export interface ComponentesDeSuministro {
  /** Suministro en el bloque cero, en unidades base. */
  genesis: bigint;
  /** Todo lo emitido por reglas de consenso hasta el bloque, incluidas recompensas. */
  emisionDeConsenso: bigint;
  /** Sólo quemas reconocidas por las reglas de la cadena. */
  quemaDeProtocolo: bigint;
}

export function suministroNativo(c: ComponentesDeSuministro): bigint {
  if (c.genesis < 0n || c.emisionDeConsenso < 0n || c.quemaDeProtocolo < 0n) {
    throw new ErrorSFSP('DENY_POLICY', 'los componentes de suministro no pueden ser negativos');
  }
  const s = c.genesis + c.emisionDeConsenso - c.quemaDeProtocolo;
  if (s < 0n) throw new ErrorSFSP('DENY_POLICY', 'la quema no puede superar lo emitido');
  return s;
}

/**
 * Enviar a una dirección sin llave conocida NO es una quema. Esta función
 * existe para que nadie escriba la resta por descuido.
 */
export function esQuemaReconocida(_direccionDestino: string): false {
  return false;
}

export interface PerimetroDeLiberacion {
  suministroNativo: bigint;
  /** Inventario efectivamente inmovilizado que todavía no está activado. */
  noActivado: bigint;
}

export function liberado(p: PerimetroDeLiberacion): bigint {
  if (p.noActivado < 0n || p.noActivado > p.suministroNativo) {
    throw new ErrorSFSP('DENY_POLICY', 'el inventario no activado está fuera del suministro');
  }
  return p.suministroNativo - p.noActivado;
}

export interface SolicitudDeLiberacion {
  cantidad: bigint;
  perimetro: PerimetroDeLiberacion;
  /** Techo de distribución aprobado. null = pendiente D03. */
  releaseCap: bigint | null;
  /** Capacidad por reservas. null = pendiente D04, que ya lo bloquea antes. */
  racUnits: bigint | null;
}

/** Decide si una salida de tesorería está permitida. */
export function puedeLiberar(s: SolicitudDeLiberacion): Resultado<bigint> {
  if (s.cantidad <= 0n) return negar<bigint>('DENY_POLICY', 'la cantidad debe ser positiva');
  if (s.releaseCap === null) {
    return bloqueadoPorDecision<bigint>('D03', 'no hay techo de distribución aprobado');
  }
  if (s.racUnits === null) {
    return bloqueadoPorDecision<bigint>('D04', 'no hay capacidad de reservas calculada');
  }
  const ya = liberado(s.perimetro);
  const techo = s.releaseCap < s.racUnits ? s.releaseCap : s.racUnits;
  if (ya + s.cantidad > techo) {
    return negar<bigint>(
      'DENY_LIMIT',
      `la liberación supera el mínimo entre techo y capacidad: ${ya} + ${s.cantidad} > ${techo}`,
    );
  }
  return permitir(ya + s.cantidad);
}

/**
 * Cobertura de reservas sobre lo liberado, en puntos básicos.
 *
 * `unidadesLiberadas` va en unidades base, así que hay que dividir por la
 * escala de decimales antes de multiplicar por el precio por unidad entera.
 * Olvidarlo daría una cobertura inflada en 10^decimals, que es exactamente el
 * tipo de cifra que tranquiliza a todo el mundo por el motivo equivocado.
 */
export function coberturaBps(
  valorElegibleCents: bigint,
  unidadesLiberadas: bigint,
  referenciaCentavosPorUnidad: bigint | null,
  decimals: number | null,
): Resultado<number> {
  if (referenciaCentavosPorUnidad === null) {
    return bloqueadoPorDecision<number>('D01', 'no hay política de precio aprobada');
  }
  if (decimals === null) {
    return negar<number>('UNKNOWN_SOURCE', 'decimales desconocidos: no se sustituyen por 18');
  }
  if (unidadesLiberadas === 0n) return permitir(0);
  const escala = 10n ** BigInt(decimals);
  const exigido = (unidadesLiberadas * referenciaCentavosPorUnidad) / escala;
  if (exigido === 0n) return permitir(0);
  return permitir(Number((valorElegibleCents * 10000n) / exigido));
}
