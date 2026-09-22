// Decodificacion de los eventos del §3 del contrato interno a registros tipados.
//
// FUENTE UNICA: este modulo NO tiene tabla propia. Todo lo que sabe de eventos
// viene de `esquema-generado.ts`, que se genera desde `spec/eventos.json`.
// POR QUE: hasta draft-0.3 habia una tabla aqui y otra en Solidity, y no
// coincidian (H15: el contrato emitia `UnitsMinted` y un `BurnExecuted` sin
// `assetId`, el indexador esperaba `MintExecuted` y un burn con activo). Con una
// sola fuente la divergencia deja de ser posible en vez de sólo detectable.
//
// REGLA CENTRAL: un evento desconocido NO se descarta. Se conserva como crudo
// con su firma. POR QUE: descartar lo que no se reconoce hace que el indice
// mienta por omision (el portal mostraria "no paso nada") y ademas impide
// reconstruir el pasado cuando mas adelante se agregue el decodificador que
// faltaba. Conservar el crudo mantiene el indice completo y auditable.
//
// Segunda regla: toda cantidad se valida como entero decimal en cadena (§5).
// Un campo de monto que no lo sea NO se corrige ni se pone en cero: el registro
// sale marcado como invalido, que es informacion distinta de "cero".

import {
  ALIASES_RETIRADOS,
  ESQUEMA_EVENTOS,
  EVENTOS_CONOCIDOS,
  VERSION_ESPEC_EVENTOS,
  type EventoGenerado,
  type NombreEvento,
} from './esquema-generado.js';
import type { LogCrudo } from './tipos.js';

export {
  ALIASES_RETIRADOS,
  ESQUEMA_EVENTOS,
  EVENTOS_CONOCIDOS,
  VERSION_ESPEC_EVENTOS,
};
export type { EventoGenerado, NombreEvento };

/** Registro decodificado de un evento reconocido. */
export interface RegistroDecodificado {
  readonly tipo: 'DECODIFICADO';
  readonly evento: NombreEvento;
  readonly emisorEsperado: string;
  /** Nombre retirado con el que llego el log, si llego con uno. */
  readonly aliasOrigen: string | null;
  readonly chainId: number;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly txHash: string;
  readonly logIndex: number;
  readonly address: string;
  readonly campos: Readonly<Record<string, string>>;
  /** Campos requeridos ausentes. Vacio = registro completo. */
  readonly camposFaltantes: readonly string[];
  /** Campos de cantidad que no eran enteros en cadena (§5). */
  readonly cantidadesInvalidas: readonly string[];
  /**
   * Activos a los que el evento se atribuye sin ambiguedad. Vacio cuando el
   * evento es global (no pertenece a un activo) o cuando falta un campo de
   * atribucion: los dos casos se distinguen con `atribucionIncompleta`.
   */
  readonly activosAtribuidos: readonly string[];
  /** true si el evento era POR_ACTIVO y no se pudo saber de que activo es. */
  readonly atribucionIncompleta: boolean;
  /** `false` si falta algo: el consumidor NO debe tratarlo como dato firme. */
  readonly completo: boolean;
}

/** Registro no reconocido, conservado tal cual con su firma. */
export interface RegistroCrudoConservado {
  readonly tipo: 'CRUDO';
  /** Firma / topic0 exactamente como llego. Es la pista para decodificar luego. */
  readonly firma: string;
  readonly chainId: number;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly txHash: string;
  readonly logIndex: number;
  readonly address: string;
  readonly topics: readonly string[];
  readonly data: string;
  readonly motivo: 'EVENTO_DESCONOCIDO';
}

export type RegistroIndexado = RegistroDecodificado | RegistroCrudoConservado;

/** Entero decimal no negativo, sin signo ni coma flotante (§5). */
const ENTERO_EN_CADENA = /^[0-9]+$/;

function esEnteroEnCadena(v: string | undefined): boolean {
  return typeof v === 'string' && ENTERO_EN_CADENA.test(v);
}

/**
 * Resuelve la firma recibida a un nombre canonico.
 * Devuelve tambien el alias con el que llego, para no perder ese dato.
 */
export function resolverNombre(
  firma: string,
): { canonico: NombreEvento; alias: string | null } | null {
  if (Object.prototype.hasOwnProperty.call(ESQUEMA_EVENTOS, firma)) {
    return { canonico: firma as NombreEvento, alias: null };
  }
  const retirado = ALIASES_RETIRADOS[firma];
  if (retirado !== undefined) return { canonico: retirado, alias: firma };
  return null;
}

/**
 * Decodifica un log. Nunca lanza por evento desconocido ni por campo faltante:
 * esos casos son datos, no excepciones, y deben quedar en el indice.
 */
export function decodificar(log: LogCrudo): RegistroIndexado {
  const resuelto = resolverNombre(log.firma);
  if (resuelto === null) {
    return {
      tipo: 'CRUDO',
      firma: log.firma,
      chainId: log.chainId,
      blockNumber: log.blockNumber,
      blockHash: log.blockHash,
      txHash: log.txHash,
      logIndex: log.logIndex,
      address: log.address,
      topics: [...log.topics],
      data: log.data,
      motivo: 'EVENTO_DESCONOCIDO',
    };
  }

  const esquema = ESQUEMA_EVENTOS[resuelto.canonico];
  const campos: Record<string, string> = { ...(log.parametros ?? {}) };

  const presente = (c: string): boolean =>
    typeof campos[c] === 'string' && campos[c] !== '';

  const camposFaltantes = esquema.requeridos.filter((c) => !presente(c));
  const cantidadesInvalidas = esquema.cantidades.filter(
    (c) => campos[c] !== undefined && !esEnteroEnCadena(campos[c]),
  );

  // Atribucion a activo. POR QUE se calcula aqui y no en el agregador: el
  // esquema es quien sabe cuales campos identifican el activo, y el agregador
  // no debe volver a adivinarlo leyendo `campos['assetId']` a mano.
  const atribucion = esquema.camposDeAtribucion;
  const valores = atribucion.filter(presente).map((c) => campos[c] as string);
  const atribucionIncompleta = valores.length !== atribucion.length;

  return {
    tipo: 'DECODIFICADO',
    evento: resuelto.canonico,
    emisorEsperado: EVENTOS_CONOCIDOS[resuelto.canonico],
    aliasOrigen: resuelto.alias,
    chainId: log.chainId,
    blockNumber: log.blockNumber,
    blockHash: log.blockHash,
    txHash: log.txHash,
    logIndex: log.logIndex,
    address: log.address,
    campos: Object.freeze(campos),
    camposFaltantes,
    cantidadesInvalidas,
    activosAtribuidos: atribucionIncompleta ? [] : valores,
    atribucionIncompleta,
    completo: camposFaltantes.length === 0 && cantidadesInvalidas.length === 0,
  };
}

/** Decodifica un lote conservando el orden de llegada. */
export function decodificarLote(
  logs: readonly LogCrudo[],
): readonly RegistroIndexado[] {
  return logs.map(decodificar);
}
