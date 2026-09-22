/* Separación de funciones entre las empresas del ecosistema (R1–R5 de
 * `operador/AU-RA-FP.md`).
 *
 * Cada función responde una pregunta concreta —¿puede esta parte hacer esto?—
 * y devuelve el código de SFSP. Cuando la respuesta depende de un dueño que
 * nadie ha confirmado, NO supone que son independientes: bloquea con D21. Dar
 * por independientes a dos empresas sin saberlo es exactamente el conflicto de
 * interés que estas reglas existen para impedir. */

import type { Resultado } from '../codigos.js';
import { permitir, negar } from '../codigos.js';
import type { Ecosistema, EmpresaId, Parte } from './ecosistema.js';
import { AUDITOR_EXTERNO, sonIndependientes } from './ecosistema.js';

export type TipoDeActor = 'PERSONA' | 'ASISTENTE';
export type Rol = 'JUNTA' | 'OPERACIONES' | 'AUDITORIA' | 'SEGURIDAD';

export interface Actor {
  empresa: EmpresaId;
  tipo: TipoDeActor;
  rol: Rol;
}

/** Exige independencia; si no se puede saber, devuelve el bloqueo tal cual. */
function exigirIndependencia(
  eco: Ecosistema,
  a: Parte,
  b: Parte,
  motivo: string,
): Resultado<true> | null {
  const r = sonIndependientes(eco, a, b);
  if (r.codigo !== 'ALLOW') return { ...r, valor: null };
  if (r.valor !== true) return negar('DENY_POLICY', `${motivo}: ${r.detalle || `${a} y ${b} son la misma parte`}`);
  return null;
}

/**
 * R1 · ¿Puede este actor aprobar una acción monetaria sobre un recurso de esta
 * dueña? Aprueba una persona, de la Junta, de la empresa dueña. Nunca un
 * asistente, y nunca el operador.
 */
export function puedeAprobarMonetario(eco: Ecosistema, actor: Actor, duenaDelRecurso: EmpresaId): Resultado<true> {
  if (actor.tipo === 'ASISTENTE') {
    return negar('DENY_AUTHORIZATION', 'un asistente no aprueba nada monetario (SFSP-800)');
  }
  if (actor.empresa === eco.operador) {
    return negar('DENY_POLICY', `${eco.empresas[eco.operador].nombre} opera y comprueba; no aprueba (ADR-014)`);
  }
  if (actor.empresa !== duenaDelRecurso) {
    return negar('DENY_AUTHORIZATION', `sólo ${eco.empresas[duenaDelRecurso].nombre} aprueba lo que es suyo`);
  }
  if (actor.rol !== 'JUNTA') {
    return negar('DENY_AUTHORIZATION', 'la aprobación monetaria es de la Junta de la dueña');
  }
  return permitir(true);
}

/** R2 · Sólo el auditor escribe pasaportes. */
export function puedeEscribirPasaporte(eco: Ecosistema, empresa: EmpresaId): Resultado<true> {
  if (empresa !== eco.auditor) {
    return negar(
      'DENY_POLICY',
      `sólo ${eco.empresas[eco.auditor].nombre} escribe pasaportes; quien emite o lista no decide si su activo es apto`,
    );
  }
  return permitir(true);
}

/** R3 · Quien emite un activo no lo admite ni lo audita. */
export function puedeAdmitir(eco: Ecosistema, admite: EmpresaId, emisor: EmpresaId): Resultado<true> {
  const r2 = puedeEscribirPasaporte(eco, admite);
  if (r2.codigo !== 'ALLOW') return r2;
  const conflicto = exigirIndependencia(eco, admite, emisor, 'quien emite un activo no lo admite');
  return conflicto ?? permitir(true);
}

/**
 * R3 aplicado al mercado · ¿Se puede listar este activo en este mercado?
 * El pasaporte lo escribió el auditor, el activo está admitido y listado, no
 * está congelado, y ni el mercado ni el emisor son la misma parte que el
 * auditor. Que AuCorp sea dueña de Ordenex no le da ninguna voz sobre qué se
 * lista en Ordenex.
 */
export interface PasaporteParaListar {
  escritoPor: EmpresaId;
  emisor: EmpresaId;
  admission: string;
  trading: string;
  transferability: string;
}

export function puedeListar(eco: Ecosistema, duenaDelMercado: EmpresaId, p: PasaporteParaListar): Resultado<true> {
  if (p.escritoPor !== eco.auditor) {
    return negar('DENY_POLICY', 'el pasaporte no lo escribió el auditor');
  }
  if (p.admission !== 'APPROVED') return negar('DENY_ASSET_STATE', `admisión ${p.admission}, no APPROVED`);
  if (p.trading !== 'LISTED') return negar('DENY_ASSET_STATE', `mercado ${p.trading}, no LISTED`);
  if (p.transferability === 'FROZEN') return negar('DENY_ASSET_STATE', 'el activo está congelado');
  const conflictoEmisor = exigirIndependencia(eco, eco.auditor, p.emisor, 'el auditor no admite activos propios');
  if (conflictoEmisor) return conflictoEmisor;
  const conflictoMercado = exigirIndependencia(eco, eco.auditor, duenaDelMercado, 'el auditor no puede ser dueño del mercado');
  return conflictoMercado ?? permitir(true);
}

/**
 * R4 · ¿Puede esta parte revisar el informe de cumplimiento de esta empresa?
 * Nadie revisa su propio informe, y el operador no revisa ninguno: es quien
 * los produce. El informe del auditor lo revisa un auditor externo.
 */
export function puedeRevisarInforme(eco: Ecosistema, revisor: Parte, evaluada: EmpresaId): Resultado<true> {
  if (revisor === eco.operador) {
    return negar('DENY_POLICY', 'el operador produce los informes; no los revisa (quien opera no se audita)');
  }
  if (revisor !== AUDITOR_EXTERNO && revisor !== eco.auditor) {
    return negar('DENY_AUTHORIZATION', `revisa ${eco.empresas[eco.auditor].nombre} o un auditor externo`);
  }
  const conOperador = exigirIndependencia(eco, revisor, eco.operador, 'el revisor no puede ser parte del operador');
  if (conOperador) return conOperador;
  const conEvaluada = exigirIndependencia(eco, revisor, evaluada, 'nadie revisa su propio informe');
  return conEvaluada ?? permitir(true);
}

/**
 * R5 · Una liberación de tesorería necesita tres partes distintas: aprueba la
 * dueña (su Junta, una persona), calcula y ejecuta el operador, y da fe de las
 * reservas alguien que no es ninguna de las dos.
 */
export interface LiberacionDeTesoreria {
  duena: EmpresaId;
  aprueba: Actor;
  ejecuta: EmpresaId;
  atestiguaReservas: Parte;
}

export function validarLiberacion(eco: Ecosistema, l: LiberacionDeTesoreria): Resultado<true> {
  const aprobacion = puedeAprobarMonetario(eco, l.aprueba, l.duena);
  if (aprobacion.codigo !== 'ALLOW') return aprobacion;
  if (l.ejecuta !== eco.operador) {
    return negar('DENY_POLICY', `ejecuta ${eco.empresas[eco.operador].nombre}, no la dueña ni un tercero`);
  }
  if (l.atestiguaReservas === l.duena) {
    return negar('DENY_POLICY', 'la dueña no certifica sus propias reservas');
  }
  if (l.atestiguaReservas === eco.operador) {
    return negar('DENY_POLICY', 'quien calcula la liberación no certifica las reservas que la permiten');
  }
  const conDuena = exigirIndependencia(eco, l.atestiguaReservas, l.duena, 'quien da fe de las reservas no puede ser parte de la dueña');
  if (conDuena) return conDuena;
  const conOperador = exigirIndependencia(eco, l.atestiguaReservas, eco.operador, 'quien da fe de las reservas no puede ser parte del operador');
  if (conOperador) return conOperador;
  const duenaYOperador = exigirIndependencia(eco, l.duena, eco.operador, 'la dueña no puede ejecutar su propia liberación');
  return duenaYOperador ?? permitir(true);
}
