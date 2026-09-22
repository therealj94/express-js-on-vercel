/* El informe de cumplimiento de SFSP por empresa (servicio S12).
 *
 * Lo que no se puede impedir por construcción se vigila con evidencia. Cada
 * comprobación declara QUÉ evidencia necesita y qué tiene que decir. Tres
 * resultados, y la regla que los gobierna es la misma de todo el protocolo:
 *
 *   CUMPLE          la evidencia está, está vigente y cumple.
 *   INCUMPLE        la evidencia está y muestra el incumplimiento.
 *   NO_VERIFICABLE  falta, está vencida, trae una fecha rota o un valor de otro
 *                   tipo. NUNCA se convierte en CUMPLE.
 *
 * Un informe de hoy, sin evidencia conectada, sale entero NO_VERIFICABLE. Es
 * lo honesto: un monitor que dijera «todo en orden» sin haber mirado sería el
 * mismo fallo que el verificador tuvo con el árbol limpio. */

import type { EmpresaId, ProductoId } from './ecosistema.js';

export type EstadoDeCumplimiento = 'CUMPLE' | 'INCUMPLE' | 'NO_VERIFICABLE';

export interface Evidencia {
  valor: number | boolean | null;
  /** Cuándo se obtuvo. */
  obtenidaEn: string;
  /** Hasta cuándo vale. Una evidencia vieja no describe el estado de hoy. */
  vigenteHasta: string;
  /** De dónde salió: servicio, consulta o documento. Sin fuente no vale. */
  fuente: string;
}

export type Evidencias = Readonly<Record<string, Evidencia | undefined>>;

type Regla =
  | { tipo: 'CERO' }
  | { tipo: 'VERDADERO' }
  | { tipo: 'NO_SUPERA_MINIMO'; limites: readonly string[] };

export interface Comprobacion {
  id: string;
  empresa: EmpresaId;
  producto: ProductoId;
  descripcion: string;
  /** La primera es la medida; en NO_SUPERA_MINIMO las demás son los límites. */
  evidencia: string;
  regla: Regla;
  gobierna: string;
}

export const COMPROBACIONES: readonly Comprobacion[] = Object.freeze([
  { id: 'VW-01', empresa: 'ORDEN_GLOBAL', producto: 'VETA_WALLET', gobierna: 'SFSP-130',
    descripcion: 'Ningún envío sale sin una resolución de destino vigente',
    evidencia: 'veta.enviosSinResolucionVigente', regla: { tipo: 'CERO' } },
  { id: 'VW-02', empresa: 'ORDEN_GLOBAL', producto: 'VETA_WALLET', gobierna: 'SFSP-130 §5.3',
    descripcion: 'Ninguna cuenta nueva nace activa sin aprobación',
    evidencia: 'veta.altasQueNacieronActivas', regla: { tipo: 'CERO' } },
  { id: 'VW-03', empresa: 'ORDEN_GLOBAL', producto: 'VETA_WALLET', gobierna: 'SFSP-120',
    descripcion: 'Ningún envío sin decisión del portero',
    evidencia: 'veta.enviosSinDecisionDelPortero', regla: { tipo: 'CERO' } },
  { id: 'TS-01', empresa: 'ORDEN_GLOBAL', producto: 'TESORERIA', gobierna: 'SFSP-400 §3.4',
    descripcion: 'Lo liberado no supera el mínimo entre el techo aprobado y la capacidad por reservas',
    evidencia: 'tesoreria.liberado',
    regla: { tipo: 'NO_SUPERA_MINIMO', limites: ['tesoreria.techoAprobado', 'tesoreria.capacidadPorReservas'] } },
  { id: 'TS-02', empresa: 'ORDEN_GLOBAL', producto: 'TESORERIA', gobierna: 'SFSP-800 · ADR-013',
    descripcion: 'Cada liberación tiene una autorización ligada al contenido, gastada una sola vez',
    evidencia: 'tesoreria.liberacionesSinAutorizacion', regla: { tipo: 'CERO' } },
  { id: 'OX-01', empresa: 'AUCORP', producto: 'ORDENEX', gobierna: 'SFSP-100',
    descripcion: 'Todo mercado abierto tiene pasaporte admitido y listado, escrito por el auditor',
    evidencia: 'ordenex.mercadosSinPasaporteValido', regla: { tipo: 'CERO' } },
  { id: 'OX-02', empresa: 'AUCORP', producto: 'ORDENEX', gobierna: 'SFSP-500 §1',
    descripcion: 'Toda operación se liquida entrega contra pago',
    evidencia: 'ordenex.operacionesSinEntregaContraPago', regla: { tipo: 'CERO' } },
  { id: 'OX-03', empresa: 'AUCORP', producto: 'ORDENEX', gobierna: 'SFSP-120',
    descripcion: 'Toda orden pasó por el portero, con la jurisdicción de quien la manda',
    evidencia: 'ordenex.ordenesSinDecisionDelPortero', regla: { tipo: 'CERO' } },
  { id: 'AC-01', empresa: 'AUCORP', producto: 'AUCORP_FIAT', gobierna: 'SFSP-900',
    descripcion: 'Cada movimiento fiat está conciliado con la cadena',
    evidencia: 'aucorp.movimientosSinConciliar', regla: { tipo: 'CERO' } },
  { id: 'AC-02', empresa: 'AUCORP', producto: 'AUCORP_FIAT', gobierna: 'SFSP-500 §9',
    descripcion: 'Un aviso repetido del proveedor no produce un asiento repetido',
    evidencia: 'aucorp.asientosDuplicados', regla: { tipo: 'CERO' } },
  { id: 'AC-03', empresa: 'AUCORP', producto: 'AUCORP_FIAT', gobierna: 'SFSP-500 §9',
    descripcion: 'No se guardan datos de tarjeta en los registros',
    evidencia: 'aucorp.registrosConDatosDeTarjeta', regla: { tipo: 'CERO' } },
  { id: 'DB-01', empresa: 'DBNX', producto: 'DBNX_DATOS', gobierna: 'SFSP-100 · SFSP-800',
    descripcion: 'Ningún pasaporte sin expediente con dos firmas',
    evidencia: 'dbnx.pasaportesSinDobleFirma', regla: { tipo: 'CERO' } },
  { id: 'DB-02', empresa: 'DBNX', producto: 'DBNX_DATOS', gobierna: 'dbnx-api',
    descripcion: 'Ningún informe vencido usado en una decisión',
    evidencia: 'dbnx.informesVencidosUsados', regla: { tipo: 'CERO' } },
  { id: 'DB-03', empresa: 'DBNX', producto: 'DBNX_DATOS', gobierna: 'SFSP-300 §2',
    descripcion: 'Ninguna atestación de reserva vencida sigue contando',
    evidencia: 'dbnx.atestacionesVencidasContando', regla: { tipo: 'CERO' } },
  { id: 'DB-04', empresa: 'DBNX', producto: 'DBNX_DATOS', gobierna: 'ADR-014 R3',
    descripcion: 'Ningún activo admitido cuyo emisor sea parte de DBNX',
    evidencia: 'dbnx.activosPropiosAdmitidos', regla: { tipo: 'CERO' } },
  { id: 'FP-01', empresa: 'AURA_FP', producto: 'ASISTENTE_AURA', gobierna: 'SFSP-800 · ADR-014 R1',
    descripcion: 'Ninguna aprobación monetaria firmada por el operador ni por sus asistentes',
    evidencia: 'fp.aprobacionesMonetariasPropias', regla: { tipo: 'CERO' } },
  { id: 'FP-02', empresa: 'AURA_FP', producto: 'ASISTENTE_AURA', gobierna: 'auditoria/C02',
    descripcion: 'La última verificación completa salió de un árbol limpio',
    evidencia: 'fp.verificacionCompletaConArbolLimpio', regla: { tipo: 'VERDADERO' } },
] satisfies Comprobacion[]);

export interface ResultadoDeComprobacion {
  id: string;
  producto: ProductoId;
  descripcion: string;
  estado: EstadoDeCumplimiento;
  motivo: string;
}

export interface InformeDeCumplimiento {
  empresa: EmpresaId;
  fechaISO: string;
  estado: EstadoDeCumplimiento;
  cumplen: number;
  incumplen: number;
  noVerificables: number;
  resultados: ResultadoDeComprobacion[];
}

function instante(v: unknown): number {
  if (typeof v !== 'string' || v.length === 0) return Number.NaN;
  return Date.parse(v);
}

/** Lee una evidencia y dice si sirve hoy. Devuelve el motivo si no sirve. */
function leer(evs: Evidencias, clave: string, ahora: number): { ev: Evidencia } | { motivo: string } {
  const ev = Object.prototype.hasOwnProperty.call(evs, clave) ? evs[clave] : undefined;
  if (!ev) return { motivo: `falta la evidencia ${clave}` };
  if (typeof ev.fuente !== 'string' || ev.fuente.trim() === '') return { motivo: `${clave} no dice de dónde salió` };
  const obtenida = instante(ev.obtenidaEn);
  const vigente = instante(ev.vigenteHasta);
  if (Number.isNaN(obtenida) || Number.isNaN(vigente)) return { motivo: `${clave} trae una fecha que no se puede leer` };
  if (obtenida > ahora) return { motivo: `${clave} dice haberse obtenido en el futuro` };
  if (vigente < ahora) return { motivo: `${clave} venció el ${ev.vigenteHasta}` };
  if (ev.valor === null) return { motivo: `${clave} no trae valor` };
  return { ev };
}

function numero(ev: Evidencia): number | null {
  return typeof ev.valor === 'number' && Number.isFinite(ev.valor) && ev.valor >= 0 ? ev.valor : null;
}

function evaluar(c: Comprobacion, evs: Evidencias, ahora: number): ResultadoDeComprobacion {
  const base = { id: c.id, producto: c.producto, descripcion: c.descripcion };
  const nv = (motivo: string): ResultadoDeComprobacion => ({ ...base, estado: 'NO_VERIFICABLE', motivo });

  const medida = leer(evs, c.evidencia, ahora);
  if ('motivo' in medida) return nv(medida.motivo);

  switch (c.regla.tipo) {
    case 'CERO': {
      const n = numero(medida.ev);
      if (n === null) return nv(`${c.evidencia} no es un recuento válido`);
      return n === 0
        ? { ...base, estado: 'CUMPLE', motivo: 'cero casos' }
        : { ...base, estado: 'INCUMPLE', motivo: `${n} caso(s)` };
    }
    case 'VERDADERO': {
      if (typeof medida.ev.valor !== 'boolean') return nv(`${c.evidencia} no es sí o no`);
      return medida.ev.valor
        ? { ...base, estado: 'CUMPLE', motivo: 'sí' }
        : { ...base, estado: 'INCUMPLE', motivo: 'no' };
    }
    case 'NO_SUPERA_MINIMO': {
      const n = numero(medida.ev);
      if (n === null) return nv(`${c.evidencia} no es una cantidad válida`);
      const limites: number[] = [];
      for (const clave of c.regla.limites) {
        const l = leer(evs, clave, ahora);
        /* Un límite que falta no es «sin límite». Es un límite que no se sabe. */
        if ('motivo' in l) return nv(l.motivo);
        const v = numero(l.ev);
        if (v === null) return nv(`${clave} no es una cantidad válida`);
        limites.push(v);
      }
      const minimo = Math.min(...limites);
      return n <= minimo
        ? { ...base, estado: 'CUMPLE', motivo: `${n} ≤ ${minimo}` }
        : { ...base, estado: 'INCUMPLE', motivo: `${n} > ${minimo}` };
    }
  }
}

/**
 * El informe de una empresa. INCUMPLE si alguna incumple; si no,
 * NO_VERIFICABLE si falta alguna; y sólo si todas cumplen, CUMPLE.
 */
export function informeDeCumplimiento(
  empresa: EmpresaId,
  evidencias: Evidencias,
  ahoraISO: string,
  comprobaciones: readonly Comprobacion[] = COMPROBACIONES,
): InformeDeCumplimiento {
  const ahora = instante(ahoraISO);
  const propias = comprobaciones.filter((c) => c.empresa === empresa);
  const resultados = Number.isNaN(ahora)
    ? propias.map((c) => ({ id: c.id, producto: c.producto, descripcion: c.descripcion,
        estado: 'NO_VERIFICABLE' as const, motivo: 'la fecha del informe no se puede leer' }))
    : propias.map((c) => evaluar(c, evidencias, ahora));

  const cuenta = (e: EstadoDeCumplimiento) => resultados.filter((r) => r.estado === e).length;
  const incumplen = cuenta('INCUMPLE');
  const noVerificables = cuenta('NO_VERIFICABLE');
  /* Una empresa sin ninguna comprobación no «cumple todo»: no se miró nada. */
  const estado: EstadoDeCumplimiento =
    incumplen > 0 ? 'INCUMPLE' : noVerificables > 0 || resultados.length === 0 ? 'NO_VERIFICABLE' : 'CUMPLE';

  return { empresa, fechaISO: ahoraISO, estado, cumplen: cuenta('CUMPLE'), incumplen, noVerificables, resultados };
}
