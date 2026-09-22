/* Lectura de DECISIONES-SFSP.json.
 *
 * La regla número cinco del plan: un precio, un haircut, un quórum, un derecho
 * o un permiso pendiente conserva estado BLOQUEADO. El agente no inserta el
 * valor recomendado para poder seguir.
 *
 * Este módulo es lo que hace que esa regla se pueda comprobar en una prueba en
 * vez de confiar en la disciplina de quien escribe el código: si un parámetro
 * económico vale null, pedirlo devuelve BLOCKED_DECISION con el identificador
 * de la decisión que falta. */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { bloqueadoPorDecision, permitir } from './codigos.js';
import type { Resultado } from './codigos.js';

export interface Decision {
  id: string;
  tema: string;
  autoridad: string;
  estado: 'PENDIENTE' | 'APROBADA';
  valor: unknown;
  bloquea: string[];
}

export interface ArchivoDeDecisiones {
  schemaVersion: string;
  adoptadas: Record<string, unknown>;
  decisiones: Decision[];
  parametrosEconomicos: Record<string, unknown>;
}

/** Qué decisión gobierna cada parámetro económico. */
export const GOBIERNA: Record<string, string> = {
  precioOrigenModo: 'D01',
  precioOrigenReferencia: 'D01',
  feeObjetivoUSD: 'D02',
  feeAlcance: 'D02',
  gasPatrocinado: 'D02',
  releaseCap: 'D03',
  haircutsPorTier: 'D04',
  factoresDeElegibilidad: 'D04',
  limitesDeConcentracion: 'D04',
  quorumMint: 'D07',
  quorumRecovery: 'D07',
  quorumPause: 'D07',
  quorumUpgrade: 'D07',
  timelockUpgradeSegundos: 'D07',
  compraMinimaUSD: 'D05',
  minimoRedencionFisica: 'D05',
};

export function cargarDecisiones(ruta: string): ArchivoDeDecisiones {
  return JSON.parse(readFileSync(ruta, 'utf8')) as ArchivoDeDecisiones;
}

/**
 * Pide un parámetro económico.
 *
 * Comprueba TRES cosas, no una. La versión anterior sólo miraba que el valor no
 * fuese nulo (H21), así que bastaba con escribir un número en el JSON para que
 * el sistema lo usara aunque la decisión que lo gobierna siguiera pendiente. Un
 * cambio de una línea desbloqueaba un parámetro monetario sin que nadie lo
 * aprobara.
 *
 * Ahora: el valor existe, la decisión que lo gobierna está APROBADA, y la
 * versión de política del archivo coincide con la que se espera. Cualquiera de
 * las tres que falte devuelve `BLOCKED_DECISION`.
 *
 * No hay segundo argumento con un valor por defecto, y es a propósito: no
 * existe forma de llamar a esto y seguir con un número inventado.
 */
export function parametro<T>(
  archivo: ArchivoDeDecisiones,
  nombre: string,
  policyVersionEsperada?: string,
): Resultado<T> {
  const valor = archivo.parametrosEconomicos[nombre];
  const decision = GOBIERNA[nombre] ?? 'desconocida';

  if (valor === null || valor === undefined) {
    return bloqueadoPorDecision<T>(decision, `el parámetro ${nombre} no está aprobado`);
  }
  if (typeof valor === 'object' && valor !== null && !Array.isArray(valor)) {
    const hayNulos = Object.values(valor as Record<string, unknown>).some((v) => v === null);
    if (hayNulos) {
      return bloqueadoPorDecision<T>(decision, `el parámetro ${nombre} está aprobado sólo en parte`);
    }
  }

  /* H21: tener valor no es estar aprobado. */
  if (decision === 'desconocida') {
    return bloqueadoPorDecision<T>(
      'desconocida',
      `el parámetro ${nombre} no tiene una decisión que lo gobierne: no se puede usar`,
    );
  }
  if (!aprobada(archivo, decision)) {
    return bloqueadoPorDecision<T>(
      decision,
      `el parámetro ${nombre} tiene valor pero ${decision} sigue pendiente`,
    );
  }

  if (policyVersionEsperada !== undefined && archivo.schemaVersion !== policyVersionEsperada) {
    return bloqueadoPorDecision<T>(
      decision,
      `versión de política incoherente: el archivo dice ${archivo.schemaVersion} y se esperaba ${policyVersionEsperada}`,
    );
  }

  return permitir(valor as T);
}

/**
 * Huella del archivo de decisiones (C07).
 *
 * Sirve para que el verificador detecte que alguien cambió el archivo sin
 * anunciarlo. Un parámetro monetario no debería poder desbloquearse con una
 * edición silenciosa.
 */
export function huellaDeDecisiones(contenido: string | Uint8Array): string {
  return createHash('sha256').update(contenido).digest('hex');
}

/** Decisiones que siguen pendientes. Lo que bloquean no se puede ejecutar. */
export function pendientes(archivo: ArchivoDeDecisiones): Decision[] {
  return archivo.decisiones.filter((d) => d.estado !== 'APROBADA');
}

/** ¿Está aprobada esta decisión? */
export function aprobada(archivo: ArchivoDeDecisiones, id: string): boolean {
  return archivo.decisiones.some((d) => d.id === id && d.estado === 'APROBADA');
}
