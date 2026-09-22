// Conciliacion entre lo indexado y un lector de cadena inyectable.
//
// POR QUE existe: el plan maestro P7a lo dice sin rodeos, "un portal que carga
// puede indexar datos atrasados". Que la interfaz responda no prueba que el
// indice este al dia ni en la rama correcta. Esta comprobacion se hace contra
// nodos autorizados y su resultado se muestra, no se esconde.
//
// El lector es una INTERFAZ con implementacion en memoria para pruebas. Aqui no
// se escribe ningun cliente RPC: eso es un adaptador fuera de la logica pura.

import type { PosicionCheckpoint } from './checkpoint.js';
import type { EncabezadoBloque } from './tipos.js';

/**
 * Lector de cadena inyectable.
 *
 * Contrato: cualquier fallo de lectura se expresa devolviendo `null` o lanzando.
 * NUNCA devolviendo cero o un encabezado vacio. Ver regla 4 del README.
 */
export interface LectorCadena {
  readonly chainId: number;
  /** Altura de la punta de la cadena, o `null` si la fuente no responde. */
  alturaPunta(): Promise<number | null>;
  /** Encabezado por altura, o `null` si no se pudo leer o no existe. */
  encabezadoPorAltura(altura: number): Promise<EncabezadoBloque | null>;
}

export type ResultadoReconciliacion =
  | { readonly estado: 'OK'; readonly alturaIndice: number; readonly alturaCadena: number }
  | {
      readonly estado: 'RETRASADO';
      readonly alturaIndice: number;
      readonly alturaCadena: number;
      /** Cuantos bloques le faltan al indice. Siempre > 0. */
      readonly bloquesDeRetraso: number;
    }
  | {
      readonly estado: 'DIVERGENTE';
      readonly alturaIndice: number;
      readonly alturaCadena: number;
      /** Primer bloque donde el hash indexado no coincide con el de la cadena. */
      readonly primerBloqueDivergente: number;
      readonly hashIndexado: string;
      readonly hashCadena: string;
    }
  | {
      readonly estado: 'UNKNOWN_SOURCE';
      /** Que no se pudo leer. Codigo del §4: no es cero y no es OK. */
      readonly motivo: string;
      readonly alturaIndice: number | null;
    };

/** Lo que el indice sabe: alturas indexadas y su hash. Fuente en memoria. */
export interface VistaIndice {
  readonly punta: PosicionCheckpoint | null;
  /** Hash indexado para una altura, o `null` si esa altura no esta indexada. */
  hashEnAltura(altura: number): string | null;
}

export interface OpcionesReconciliacion {
  /**
   * Cuantos bloques hacia atras se comparan hash a hash. POR QUE acotado: una
   * verificacion completa de la cadena en cada ciclo no es operable; la ventana
   * cubre el rango donde una reorganizacion es plausible.
   */
  readonly ventana?: number;
  /**
   * Tolerancia de retraso en bloques antes de reportar `RETRASADO`. Por defecto
   * 0: cualquier atraso se informa. NO se elige un umbral "comodo" por nosotros,
   * porque eso equivaldria a decidir un valor operativo sin aprobacion.
   */
  readonly toleranciaBloques?: number;
}

const VENTANA_POR_DEFECTO = 32;

/**
 * Compara el indice contra la cadena.
 *
 * Orden de comprobacion, deliberado:
 * 1. Divergencia primero. Un indice en la rama equivocada es un problema peor
 *    que uno atrasado, y estar atrasado no lo disculpa.
 * 2. Retraso despues.
 * 3. Cualquier lectura fallida corta con `UNKNOWN_SOURCE` en vez de asumir.
 */
export async function reconciliar(
  indice: VistaIndice,
  lector: LectorCadena,
  opciones: OpcionesReconciliacion = {},
): Promise<ResultadoReconciliacion> {
  const ventana = opciones.ventana ?? VENTANA_POR_DEFECTO;
  const tolerancia = opciones.toleranciaBloques ?? 0;
  const punta = indice.punta;

  if (punta === null) {
    // Un indice vacio no es "OK": no hay nada que confirme que esta al dia.
    return {
      estado: 'UNKNOWN_SOURCE',
      motivo: 'el indice no tiene checkpoint: no hay base de comparacion',
      alturaIndice: null,
    };
  }

  if (punta.chainId !== lector.chainId) {
    return {
      estado: 'UNKNOWN_SOURCE',
      motivo: 'el lector pertenece a otra cadena que el checkpoint',
      alturaIndice: punta.blockNumber,
    };
  }

  let alturaCadena: number | null;
  try {
    alturaCadena = await lector.alturaPunta();
  } catch {
    // POR QUE se traga la excepcion y se devuelve codigo: una fuente caida no
    // debe romper el resto de la interfaz; bloquea solo la decision que depende
    // de ella (§4).
    return {
      estado: 'UNKNOWN_SOURCE',
      motivo: 'la fuente de cadena lanzo al leer la altura de punta',
      alturaIndice: punta.blockNumber,
    };
  }

  if (alturaCadena === null || !Number.isInteger(alturaCadena)) {
    return {
      estado: 'UNKNOWN_SOURCE',
      motivo: 'la fuente de cadena no devolvio una altura de punta utilizable',
      alturaIndice: punta.blockNumber,
    };
  }

  // 1. Divergencia: se recorre de abajo hacia arriba dentro de la ventana para
  //    poder nombrar el PRIMER bloque que no cuadra, no cualquiera.
  const techo = Math.min(punta.blockNumber, alturaCadena);
  const piso = Math.max(0, techo - ventana + 1);
  for (let altura = piso; altura <= techo; altura += 1) {
    const hashIndexado = indice.hashEnAltura(altura);
    if (hashIndexado === null) continue; // el indice no cubre esa altura

    let encabezado: EncabezadoBloque | null;
    try {
      encabezado = await lector.encabezadoPorAltura(altura);
    } catch {
      return {
        estado: 'UNKNOWN_SOURCE',
        motivo: `la fuente lanzo al leer el encabezado ${altura}`,
        alturaIndice: punta.blockNumber,
      };
    }
    if (encabezado === null) {
      return {
        estado: 'UNKNOWN_SOURCE',
        motivo: `la fuente no devolvio el encabezado ${altura}`,
        alturaIndice: punta.blockNumber,
      };
    }
    if (encabezado.blockHash !== hashIndexado) {
      return {
        estado: 'DIVERGENTE',
        alturaIndice: punta.blockNumber,
        alturaCadena,
        primerBloqueDivergente: altura,
        hashIndexado,
        hashCadena: encabezado.blockHash,
      };
    }
  }

  // 2. Retraso.
  const retraso = alturaCadena - punta.blockNumber;
  if (retraso > tolerancia) {
    return {
      estado: 'RETRASADO',
      alturaIndice: punta.blockNumber,
      alturaCadena,
      bloquesDeRetraso: retraso,
    };
  }

  return { estado: 'OK', alturaIndice: punta.blockNumber, alturaCadena };
}

/**
 * Lector en memoria para pruebas. Puede simular una fuente caida.
 * NO contiene direcciones ni hashes reales del ecosistema: todo es sintetico.
 */
export class LectorEnMemoria implements LectorCadena {
  public readonly chainId: number;
  private readonly cadena: Map<number, EncabezadoBloque>;
  private caida = false;
  private modoCaida: 'NULL' | 'LANZA' = 'NULL';

  constructor(chainId: number, encabezados: readonly EncabezadoBloque[] = []) {
    this.chainId = chainId;
    this.cadena = new Map(encabezados.map((h) => [h.blockNumber, h]));
  }

  public agregar(encabezado: EncabezadoBloque): void {
    this.cadena.set(encabezado.blockNumber, encabezado);
  }

  /** Simula una fuente que no responde: devuelve null o lanza, nunca cero. */
  public caer(modo: 'NULL' | 'LANZA' = 'NULL'): void {
    this.caida = true;
    this.modoCaida = modo;
  }

  public levantar(): void {
    this.caida = false;
  }

  public async alturaPunta(): Promise<number | null> {
    if (this.caida) {
      if (this.modoCaida === 'LANZA') throw new Error('fuente no disponible');
      return null;
    }
    let max: number | null = null;
    for (const altura of this.cadena.keys()) {
      if (max === null || altura > max) max = altura;
    }
    return max;
  }

  public async encabezadoPorAltura(
    altura: number,
  ): Promise<EncabezadoBloque | null> {
    if (this.caida) {
      if (this.modoCaida === 'LANZA') throw new Error('fuente no disponible');
      return null;
    }
    return this.cadena.get(altura) ?? null;
  }
}
