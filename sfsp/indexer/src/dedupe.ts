// Deduplicacion de logs por (chainId, blockHash, txHash, logIndex).
//
// POR QUE esa clave y no (txHash, logIndex): el mismo `txHash` puede aparecer en
// dos bloques distintos durante una reorganizacion, y el mismo `logIndex` se
// repite entre cadenas. El §3 del contrato interno fija exactamente esta tupla.
// Incluir `blockHash` (y no `blockNumber`) hace que una rama descartada y la
// canonica NO se confundan: son claves distintas, y al revertir se borra por
// bloque.
//
// Logica pura: el indice vive en memoria. Un adaptador de base de datos real
// replicaria esta misma clave como UNIQUE; aqui no se escribe ningun cliente.

import { esHashUtilizable, ErrorIndexador, type ClaveLog } from './tipos.js';

/** Serializa la clave. El separador `|` no aparece en hashes hexadecimales. */
export function claveDe(log: ClaveLog): string {
  if (!esHashUtilizable(log.blockHash) || !esHashUtilizable(log.txHash)) {
    // POR QUE se rechaza: una clave con un componente vacio agrupa logs no
    // relacionados y el indice perderia filas en silencio.
    throw new ErrorIndexador(
      'HASH_INVALIDO',
      'blockHash o txHash vacios: la clave de deduplicacion seria ambigua',
      { chainId: log.chainId, logIndex: log.logIndex },
    );
  }
  if (!Number.isInteger(log.logIndex) || log.logIndex < 0) {
    throw new ErrorIndexador(
      'HASH_INVALIDO',
      'logIndex no es un entero no negativo',
      { chainId: log.chainId, txHash: log.txHash },
    );
  }
  return `${log.chainId}|${log.blockHash}|${log.txHash}|${log.logIndex}`;
}

export interface ResultadoIngesta<T> {
  /** Elementos que el indice no tenia y quedaron aceptados. */
  readonly nuevos: readonly T[];
  /** Elementos ya presentes: se descartan sin error. */
  readonly duplicados: readonly T[];
}

/**
 * Indice de logs vistos. Reprocesar el mismo lote dos veces no produce filas
 * nuevas: la segunda pasada devuelve todo en `duplicados`.
 */
export class IndiceDedupe<T extends ClaveLog> {
  private readonly vistos = new Map<string, T>();
  /** Indice inverso por bloque, para poder revertir una reorganizacion. */
  private readonly porBloque = new Map<string, Set<string>>();

  public get tamano(): number {
    return this.vistos.size;
  }

  public tiene(log: ClaveLog): boolean {
    return this.vistos.has(claveDe(log));
  }

  /**
   * Ingiere un lote. Deduplica tambien DENTRO del lote: una fuente que repite un
   * log en la misma respuesta no debe insertarlo dos veces.
   */
  public ingerir(lote: readonly T[]): ResultadoIngesta<T> {
    const nuevos: T[] = [];
    const duplicados: T[] = [];
    for (const log of lote) {
      const clave = claveDe(log);
      if (this.vistos.has(clave)) {
        duplicados.push(log);
        continue;
      }
      this.vistos.set(clave, log);
      const claveBloque = `${log.chainId}|${log.blockHash}`;
      let conjunto = this.porBloque.get(claveBloque);
      if (conjunto === undefined) {
        conjunto = new Set<string>();
        this.porBloque.set(claveBloque, conjunto);
      }
      conjunto.add(clave);
      nuevos.push(log);
    }
    return { nuevos, duplicados };
  }

  /**
   * Olvida todos los logs de un bloque. POR QUE hace falta: tras una
   * reorganizacion los logs de la rama descartada deben salir del indice, si no
   * quedan contando como indexados y la conciliacion daria un falso OK.
   */
  public revertirBloque(chainId: number, blockHash: string): number {
    const claveBloque = `${chainId}|${blockHash}`;
    const conjunto = this.porBloque.get(claveBloque);
    if (conjunto === undefined) return 0;
    for (const clave of conjunto) this.vistos.delete(clave);
    this.porBloque.delete(claveBloque);
    return conjunto.size;
  }

  /** Vista de solo lectura de lo aceptado, en orden de ingesta. */
  public listar(): readonly T[] {
    return [...this.vistos.values()];
  }
}
