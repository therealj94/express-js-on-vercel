/* Suministro nativo y liberación de tesorería (§6.1 del contrato interno).
 *
 *   S_native(b) = S_genesis + I_consensus(0..b) - B_protocol(0..b)
 *   R_released  = S_native - U_unactivated
 *   release(x) exige  R_released + x <= min(ReleaseCap, RAC_units)
 *                     y además  x <= U_unactivated
 *
 * Lo que este módulo impide creer:
 *
 *   · que mandar unidades a una dirección «inaccesible» reduzca el suministro;
 *   · que mover unidades entre cuentas cambie el suministro;
 *   · que ampliar el techo administrativo aumente el saldo técnico disponible.
 *
 * DOS DEFECTOS QUE LA AUDITORÍA ENCONTRÓ AQUÍ:
 *
 *   H13 · faltaba la segunda condición de arriba. Se podía autorizar la
 *     liberación de veinte unidades teniendo diez de inventario inmovilizado,
 *     porque sólo se comprobaba la capacidad económica. Capacidad económica e
 *     inventario técnico son dos preguntas distintas y hay que hacer las dos.
 *
 *   H12 · la cobertura truncaba el divisor antes de dividir y devolvía un
 *     `number`. Con un caso pequeño daba 10000 puntos básicos, o sea cobertura
 *     total, cuando la correcta era 5025. Y por encima del entero seguro de
 *     JavaScript perdía precisión. Ahora es una sola división exacta con
 *     enteros grandes y devuelve `bigint`.
 *
 * MODELO DE ERROR (C03): la frontera pública de este módulo devuelve
 * `Resultado`, nunca lanza. Un `throw` en un camino de dinero deja la
 * operación a medias si alguien olvida capturarlo. */

import { bloqueadoPorDecision, permitir, negar } from './codigos.js';
import type { Resultado } from './codigos.js';

export interface ComponentesDeSuministro {
  /** Suministro en el bloque cero, en unidades base. */
  genesis: bigint;
  /** Todo lo emitido por reglas de consenso hasta el bloque, incluidas recompensas. */
  emisionDeConsenso: bigint;
  /** Sólo quemas reconocidas por las reglas de la cadena. */
  quemaDeProtocolo: bigint;
}

export function suministroNativo(c: ComponentesDeSuministro): Resultado<bigint> {
  if (c.genesis < 0n || c.emisionDeConsenso < 0n || c.quemaDeProtocolo < 0n) {
    return negar<bigint>('DENY_POLICY', 'los componentes de suministro no pueden ser negativos');
  }
  const s = c.genesis + c.emisionDeConsenso - c.quemaDeProtocolo;
  if (s < 0n) return negar<bigint>('DENY_POLICY', 'la quema no puede superar lo emitido');
  return permitir(s);
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

export function liberado(p: PerimetroDeLiberacion): Resultado<bigint> {
  if (p.suministroNativo < 0n || p.noActivado < 0n) {
    return negar<bigint>('DENY_POLICY', 'el perímetro no admite valores negativos');
  }
  if (p.noActivado > p.suministroNativo) {
    return negar<bigint>('DENY_POLICY', 'el inventario no activado está fuera del suministro');
  }
  return permitir(p.suministroNativo - p.noActivado);
}

export interface SolicitudDeLiberacion {
  cantidad: bigint;
  perimetro: PerimetroDeLiberacion;
  /** Techo de distribución aprobado. null = pendiente D03. */
  releaseCap: bigint | null;
  /** Capacidad por reservas. null = pendiente D04. */
  racUnits: bigint | null;
}

/**
 * Decide si una salida de tesorería está permitida.
 *
 * Tres condiciones, y las tres tienen que cumplirse: hay inventario técnico
 * inmovilizado suficiente, no se supera el techo aprobado, y no se supera la
 * capacidad que dan las reservas.
 */
export function puedeLiberar(s: SolicitudDeLiberacion): Resultado<bigint> {
  if (s.cantidad <= 0n) return negar<bigint>('DENY_POLICY', 'la cantidad debe ser positiva');
  if (s.releaseCap === null) {
    return bloqueadoPorDecision<bigint>('D03', 'no hay techo de distribución aprobado');
  }
  if (s.racUnits === null) {
    return bloqueadoPorDecision<bigint>('D04', 'no hay capacidad de reservas calculada');
  }
  if (s.releaseCap < 0n || s.racUnits < 0n) {
    return negar<bigint>('DENY_POLICY', 'ni el techo ni la capacidad pueden ser negativos');
  }

  const yaLiberado = liberado(s.perimetro);
  if (yaLiberado.codigo !== 'ALLOW') return yaLiberado;
  const ya = yaLiberado.valor as bigint;

  /* H13: inventario técnico. Sin esto se autoriza distribuir unidades que no
     están inmovilizadas, y el número que sale no corresponde a nada. */
  if (s.cantidad > s.perimetro.noActivado) {
    return negar<bigint>(
      'DENY_LIMIT',
      `no hay inventario inmovilizado suficiente: se piden ${s.cantidad} y hay ${s.perimetro.noActivado}`,
    );
  }

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
 * Cobertura de reservas sobre lo liberado, en puntos básicos exactos.
 *
 *   cobertura = valorElegible × 10^decimals × 10000
 *               ─────────────────────────────────────
 *               unidadesLiberadas × referenciaPorUnidad
 *
 * Una sola división, al final, con enteros grandes. La versión anterior
 * calculaba primero el valor exigido y lo truncaba, lo que con cifras pequeñas
 * convertía una cobertura del 50 % en una del 100 %.
 *
 * Devuelve `bigint` porque el resultado puede superar el entero seguro de
 * JavaScript, y redondear hacia abajo una cobertura es lo prudente: nunca
 * informa de más respaldo del que hay.
 */
export function coberturaBps(
  valorElegibleCents: bigint,
  unidadesLiberadas: bigint,
  referenciaCentavosPorUnidad: bigint | null,
  decimals: number | null,
): Resultado<bigint> {
  if (referenciaCentavosPorUnidad === null) {
    return bloqueadoPorDecision<bigint>('D01', 'no hay política de precio aprobada');
  }
  if (decimals === null) {
    return negar<bigint>('UNKNOWN_SOURCE', 'decimales desconocidos: no se sustituyen por 18');
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    return negar<bigint>('DENY_POLICY', `decimales fuera de rango: ${decimals}`);
  }
  if (referenciaCentavosPorUnidad <= 0n) {
    return negar<bigint>('DENY_POLICY', 'la referencia de precio debe ser positiva');
  }
  if (valorElegibleCents < 0n || unidadesLiberadas < 0n) {
    return negar<bigint>('DENY_POLICY', 'no se admiten valores negativos');
  }
  if (unidadesLiberadas === 0n) return permitir(0n);

  const escala = 10n ** BigInt(decimals);
  const numerador = valorElegibleCents * escala * 10000n;
  const denominador = unidadesLiberadas * referenciaCentavosPorUnidad;
  return permitir(numerador / denominador);
}
