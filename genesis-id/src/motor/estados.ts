// Los estados de identidad que se PUBLICAN, frente a los que usa el motor.
//
// El SFSP v0.3 (§11 y Apéndice A, `sfsp/spec/ESTADOS-Y-EVENTOS.md`) fija seis
// estados de identidad: pendiente, en revisión, verificada, rechazada,
// vencida y suspendida. El motor necesita más detalle mientras la persona hace
// el trámite —sabe si va por los datos, el documento o el rostro— y ese
// detalle es suyo: hacia fuera los cuatro estados intermedios son UNO solo,
// «pendiente». Un integrador que viera «biometria» acabaría programando contra
// un paso del formulario de hoy, y el día que el formulario cambie se rompe.
//
// El mapa es un `Record` sobre `EstadoIdentidad` a propósito: si mañana se
// añade un estado al motor y nadie lo mapea, no compila.

import type { EstadoIdentidad, Identidad } from '../types.js'

/** Los seis del Apéndice A del SFSP v0.3. */
export type EstadoPublicado =
  | 'pendiente'
  | 'en-revision'
  | 'verificada'
  | 'rechazada'
  | 'vencida'
  | 'suspendida'

export const ESTADO_PUBLICADO: Readonly<Record<EstadoIdentidad, EstadoPublicado>> = Object.freeze({
  // Los cuatro pasos del trámite: para fuera, todos son «pendiente».
  iniciada: 'pendiente',
  datos: 'pendiente',
  documento: 'pendiente',
  biometria: 'pendiente',
  // El resto coincide uno a uno.
  'en-revision': 'en-revision',
  verificada: 'verificada',
  rechazada: 'rechazada',
  vencida: 'vencida',
  suspendida: 'suspendida',
})

/**
 * El estado que se publica. Un valor desconocido —un expediente escrito por
 * una versión futura— sale como «pendiente»: nunca como algo que abra puertas.
 */
export function estadoPublicado(estado: EstadoIdentidad | string): EstadoPublicado {
  return (ESTADO_PUBLICADO as Record<string, EstadoPublicado>)[estado] ?? 'pendiente'
}

/**
 * ¿El documento de esta identidad ya venció a fecha `hoy`?
 *
 * Vence al TERMINAR el día que dice el documento, en UTC —la misma vara que
 * `kyc/documento.ts` al revisarlo—: un documento que vence hoy vale hasta
 * esta noche. Sin fecha de vencimiento no se puede decir que venció.
 */
export function documentoVencido(identidad: Pick<Identidad, 'vencimientoDocumento'>, hoy: Date = new Date()): boolean {
  const v = identidad.vencimientoDocumento
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const finDelDia = Date.parse(v + 'T23:59:59Z')
  return Number.isFinite(finDelDia) && finDelDia < hoy.getTime()
}
