/* El catálogo de servicios de AU-RA FP y quién puede usar cada uno.
 *
 * Un producto sólo usa lo que contrató, y sólo hasta el alcance contratado.
 * Pero el contrato no puede saltarse una regla del protocolo: aunque alguien
 * escriba en un contrato que Ordenex puede escribir pasaportes, la respuesta
 * sigue siendo que no. El contrato decide qué se compra; la regla decide qué
 * existe para comprar. */

import type { Resultado } from '../codigos.js';
import { permitir, negar, bloqueadoPorDecision } from '../codigos.js';
import type { Alcance, Ecosistema, EmpresaId, ProductoId, ServicioId } from './ecosistema.js';
import { ALCANCES, POR_CONFIRMAR } from './ecosistema.js';

export interface Servicio {
  id: ServicioId;
  nombre: string;
  /** La serie de SFSP que lo gobierna. */
  gobierna: string;
  /**
   * Si está, sólo esa empresa puede usarlo con alcance ESCRITURA, diga lo que
   * diga el contrato. `'AUDITOR'` y `'OPERADOR'` se resuelven contra el registro.
   */
  escribe?: 'AUDITOR' | 'OPERADOR';
  /**
   * Servicios de análisis: preparan, explican, señalan. No producen ninguna
   * aprobación, así que nunca tienen alcance de ESCRITURA (SFSP-800).
   */
  soloAnalisis?: boolean;
}

export const SERVICIOS: Readonly<Record<ServicioId, Readonly<Servicio>>> = Object.freeze({
  S01: { id: 'S01', nombre: 'Directorio de cuentas', gobierna: 'SFSP-130' },
  S02: { id: 'S02', nombre: 'Portero', gobierna: 'SFSP-120' },
  S03: { id: 'S03', nombre: 'Registro de pasaportes', gobierna: 'SFSP-100', escribe: 'AUDITOR' },
  S04: { id: 'S04', nombre: 'Liquidación entrega contra pago', gobierna: 'SFSP-500' },
  S05: { id: 'S05', nombre: 'Comisiones', gobierna: 'SFSP-500' },
  S06: { id: 'S06', nombre: 'Suministro y tesorería', gobierna: 'SFSP-400' },
  S07: { id: 'S07', nombre: 'Reservas y cobertura', gobierna: 'SFSP-300/400', escribe: 'AUDITOR' },
  S08: { id: 'S08', nombre: 'Lector de la cadena', gobierna: 'indexer' },
  S09: { id: 'S09', nombre: 'Migración y conciliación', gobierna: 'SFSP-700' },
  S10: { id: 'S10', nombre: 'Registro de autorizaciones', gobierna: 'SFSP-800' },
  S11: { id: 'S11', nombre: 'Conciliación de pagos externos', gobierna: 'SFSP-500 §9 · SFSP-900' },
  S12: { id: 'S12', nombre: 'Monitor de cumplimiento', gobierna: 'operador/AU-RA-FP.md', escribe: 'OPERADOR' },
  S13: { id: 'S13', nombre: 'Asistente AU-RA', gobierna: 'SFSP-800', soloAnalisis: true },
  S14: { id: 'S14', nombre: 'Copiloto de admisión', gobierna: 'SFSP-800', soloAnalisis: true },
} satisfies Record<ServicioId, Servicio>);

const nivel = (a: Alcance): number => ALCANCES.indexOf(a);

/**
 * ¿Puede este producto usar este servicio con este alcance?
 *
 * El orden importa: primero lo que ninguna firma puede cambiar (reglas del
 * protocolo), después lo que falta decidir (D21), y por último el contrato.
 * Así un rechazo por regla nunca se disfraza de «falta un papel».
 */
export function autorizarServicio(
  eco: Ecosistema,
  productoId: ProductoId,
  servicioId: ServicioId,
  alcance: Alcance,
): Resultado<true> {
  const producto = eco.productos[productoId];
  if (!producto) return negar('DENY_AUTHORIZATION', `${productoId} no es un producto registrado`);
  const servicio = SERVICIOS[servicioId];
  if (!servicio) return negar('DENY_AUTHORIZATION', `${servicioId} no es un servicio de AU-RA FP`);
  if (!ALCANCES.includes(alcance)) return negar('DENY_AUTHORIZATION', `alcance desconocido: ${String(alcance)}`);

  /* Reglas del protocolo. */
  if (servicio.soloAnalisis && alcance === 'ESCRITURA') {
    return negar(
      'DENY_POLICY',
      `${servicio.nombre} sólo prepara análisis: no produce aprobaciones (SFSP-800)`,
    );
  }
  if (alcance === 'ESCRITURA' && servicio.escribe) {
    const quien: EmpresaId = servicio.escribe === 'AUDITOR' ? eco.auditor : eco.operador;
    if (producto.duena !== quien) {
      return negar(
        'DENY_POLICY',
        `en ${servicio.nombre} sólo escribe ${eco.empresas[quien].nombre}; ningún contrato lo cambia`,
      );
    }
  }

  /* Lo que falta decidir. */
  if (producto.duena === POR_CONFIRMAR) {
    return bloqueadoPorDecision('D21', `no se sabe de quién es ${producto.nombre}: no se le dan credenciales`);
  }
  if (!eco.contratosVigentes) {
    return bloqueadoPorDecision('D21', 'no hay contratos de servicio firmados todavía');
  }

  /* El contrato. */
  const contratado = producto.contrata[servicioId];
  if (!contratado) {
    return negar('DENY_AUTHORIZATION', `${producto.nombre} no tiene contratado ${servicio.nombre}`);
  }
  if (nivel(alcance) > nivel(contratado)) {
    return negar(
      'DENY_AUTHORIZATION',
      `${producto.nombre} tiene ${servicio.nombre} hasta ${contratado}, no ${alcance}`,
    );
  }
  return permitir(true);
}

/** Qué servicios usa cada empresa, sumando todos sus productos. Para el mapa del ecosistema. */
export function serviciosPorEmpresa(eco: Ecosistema): Record<string, ServicioId[]> {
  const fuera: Record<string, Set<ServicioId>> = {};
  for (const p of Object.values(eco.productos)) {
    const clave = p.duena === POR_CONFIRMAR ? `${POR_CONFIRMAR}: ${p.nombre}` : p.duena;
    fuera[clave] ??= new Set();
    for (const s of Object.keys(p.contrata) as ServicioId[]) fuera[clave].add(s);
  }
  return Object.fromEntries(Object.entries(fuera).map(([k, v]) => [k, [...v].sort()]));
}
