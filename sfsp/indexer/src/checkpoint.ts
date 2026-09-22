// Checkpoint de avance por bloque con deteccion de reorganizacion.
//
// POR QUE existe este modulo: el plan maestro P7a exige "checkpoint de
// bloque/hash, deteccion de retraso y reconstruccion". Un indexador que solo
// guarda `blockNumber` no puede notar una reorganizacion: el numero vuelve a
// subir igual y los datos viejos quedan mezclados con los nuevos. Guardar
// `(blockNumber, blockHash)` y comparar `parentHash` es lo minimo para detectar
// que la cadena cambio de rama debajo del indice.
//
// Este modulo es logica pura: no lee red ni base de datos. El historial vive en
// memoria y quien lo persista lo hace desde un adaptador externo.

import {
  ErrorIndexador,
  esHashUtilizable,
  type EncabezadoBloque,
} from './tipos.js';

/** Posicion confirmada del indice sobre la cadena. */
export interface PosicionCheckpoint {
  readonly chainId: number;
  readonly blockNumber: number;
  readonly blockHash: string;
}

/** Resultado de aplicar un encabezado al checkpoint. */
export type ResultadoAvance =
  | {
      readonly tipo: 'AVANZADO';
      readonly posicion: PosicionCheckpoint;
    }
  | {
      readonly tipo: 'REORG';
      /** Ultimo bloque comun entre la rama vieja y la nueva. */
      readonly ancestroComun: PosicionCheckpoint;
      /** Bloques que hay que deshacer, del mas nuevo al mas viejo. */
      readonly revertidos: readonly PosicionCheckpoint[];
      /** Posicion tras reaplicar el encabezado recibido sobre el ancestro. */
      readonly posicion: PosicionCheckpoint;
    }
  | {
      readonly tipo: 'DUPLICADO';
      /** El mismo bloque ya aplicado: reprocesarlo no mueve el cursor. */
      readonly posicion: PosicionCheckpoint;
    };

export interface OpcionesCheckpoint {
  readonly chainId: number;
  /**
   * Cuantos encabezados se retienen para poder retroceder. POR QUE un limite:
   * el historial no puede crecer sin techo, y una reorganizacion mas profunda
   * que la ventana es un incidente que debe escalar, no algo que el indexador
   * resuelva solo adivinando.
   */
  readonly profundidadRetenida?: number;
}

const PROFUNDIDAD_POR_DEFECTO = 128;

/**
 * Cursor de indexacion. Aplica encabezados en orden y mantiene el historial
 * necesario para retroceder hasta el ancestro comun cuando la cadena se
 * reorganiza.
 */
export class Checkpoint {
  public readonly chainId: number;
  private readonly profundidadRetenida: number;
  /** Historial del mas viejo al mas nuevo. El ultimo es la punta del indice. */
  private historial: EncabezadoBloque[] = [];

  constructor(opciones: OpcionesCheckpoint) {
    this.chainId = opciones.chainId;
    this.profundidadRetenida =
      opciones.profundidadRetenida ?? PROFUNDIDAD_POR_DEFECTO;
  }

  /** Punta actual, o `null` si el indice todavia no aplico ningun bloque. */
  public get posicion(): PosicionCheckpoint | null {
    const punta = this.historial[this.historial.length - 1];
    if (punta === undefined) return null;
    return {
      chainId: punta.chainId,
      blockNumber: punta.blockNumber,
      blockHash: punta.blockHash,
    };
  }

  /** Copia del historial retenido, del mas viejo al mas nuevo. */
  public get historialRetenido(): readonly EncabezadoBloque[] {
    return [...this.historial];
  }

  /**
   * Aplica un encabezado.
   *
   * Reglas, todas explicitas y ninguna silenciosa:
   * - Un hueco en la secuencia (`blockNumber` salta) es `GAP_DETECTADO`. POR QUE:
   *   saltar bloques pierde eventos y el indice quedaria incompleto sin que
   *   nadie se entere; el plan exige reconstruccion, no tolerancia.
   * - Un `parentHash` que no coincide con la punta es una reorganizacion: se
   *   retrocede hasta el ancestro comun y se reanuda desde ahi.
   * - El mismo `(numero, hash)` ya aplicado es `DUPLICADO` e idempotente.
   */
  public aplicar(encabezado: EncabezadoBloque): ResultadoAvance {
    this.validarEncabezado(encabezado);

    const punta = this.historial[this.historial.length - 1];

    // Primer bloque: no hay con que comparar el padre. Se acepta como origen.
    if (punta === undefined) {
      this.historial.push(encabezado);
      return { tipo: 'AVANZADO', posicion: this.posicionDe(encabezado) };
    }

    // Reingesta exacta del bloque de la punta: idempotente, no mueve el cursor.
    if (
      encabezado.blockNumber === punta.blockNumber &&
      encabezado.blockHash === punta.blockHash
    ) {
      return { tipo: 'DUPLICADO', posicion: this.posicionDe(punta) };
    }

    // Reingesta de un bloque anterior ya en el historial, con el mismo hash:
    // tambien idempotente. Distinto hash en el mismo numero es reorganizacion.
    if (encabezado.blockNumber <= punta.blockNumber) {
      const conocido = this.historial.find(
        (h) => h.blockNumber === encabezado.blockNumber,
      );
      if (conocido !== undefined && conocido.blockHash === encabezado.blockHash) {
        return { tipo: 'DUPLICADO', posicion: this.posicionDe(punta) };
      }
      // Misma altura (o menor) con hash distinto: la cadena cambio de rama.
      return this.reorganizar(encabezado);
    }

    // Continuidad: el siguiente numero y el padre correcto.
    if (encabezado.blockNumber === punta.blockNumber + 1) {
      if (encabezado.parentHash === punta.blockHash) {
        this.historial.push(encabezado);
        this.podar();
        return { tipo: 'AVANZADO', posicion: this.posicionDe(encabezado) };
      }
      // Numero correcto pero padre distinto: la punta ya no pertenece a la
      // cadena canonica. Hay que retroceder.
      return this.reorganizar(encabezado);
    }

    // Salto hacia adelante. POR QUE es error y no un "ponerse al dia": el
    // indexador no puede distinguir un hueco benigno de eventos perdidos, y
    // rellenar por asuncion contradice la regla 4 del README (una lectura que
    // falta es UNKNOWN, nunca un valor inventado).
    throw new ErrorIndexador(
      'GAP_DETECTADO',
      'la secuencia de bloques salta: falta al menos un bloque intermedio',
      {
        chainId: this.chainId,
        esperado: punta.blockNumber + 1,
        recibido: encabezado.blockNumber,
        faltantes: encabezado.blockNumber - punta.blockNumber - 1,
      },
    );
  }

  /**
   * Retrocede hasta el ancestro comun con la rama del encabezado recibido y lo
   * reaplica. Devuelve los bloques revertidos para que el consumidor deshaga sus
   * filas: el checkpoint no borra datos, solo dice que hay que deshacer.
   */
  private reorganizar(encabezado: EncabezadoBloque): ResultadoAvance {
    // Se descartan los bloques con numero mayor o igual al recibido: ninguno
    // puede seguir siendo canonico si el recibido ocupa esa altura.
    const revertidos: PosicionCheckpoint[] = [];
    while (
      this.historial.length > 0 &&
      // El `!` es seguro: `length > 0` garantiza el ultimo elemento.
      this.historial[this.historial.length - 1]!.blockNumber >=
        encabezado.blockNumber
    ) {
      const quitado = this.historial.pop()!;
      revertidos.push(this.posicionDe(quitado));
    }

    // Ahora la punta debe ser el padre del encabezado. Si no lo es, la
    // reorganizacion es mas profunda y seguimos retrocediendo mientras haya
    // historial.
    let esperadoPadre = encabezado.parentHash;
    let alturaPadre = encabezado.blockNumber - 1;
    while (this.historial.length > 0) {
      const punta = this.historial[this.historial.length - 1]!;
      if (punta.blockNumber === alturaPadre && punta.blockHash === esperadoPadre) {
        break; // ancestro comun encontrado
      }
      const quitado = this.historial.pop()!;
      revertidos.push(this.posicionDe(quitado));
      // No conocemos el padre de la rama nueva mas alla del encabezado recibido,
      // asi que solo podemos seguir bajando por altura. Al agotar el historial
      // la reorganizacion excede la ventana retenida.
      esperadoPadre = quitado.parentHash;
      alturaPadre -= 1;
    }

    if (this.historial.length === 0 && encabezado.blockNumber > 1) {
      // POR QUE se escala en vez de reiniciar: reindexar desde cero en silencio
      // esconde un evento operativo grave (reorganizacion mas profunda que la
      // ventana) que debe quedar registrado y decidido por una persona.
      throw new ErrorIndexador(
        'REORG_SIN_ANCESTRO',
        'la reorganizacion excede el historial retenido: no hay ancestro comun',
        {
          chainId: this.chainId,
          profundidadRetenida: this.profundidadRetenida,
          bloqueRecibido: encabezado.blockNumber,
          revertidos: revertidos.length,
        },
      );
    }

    const ancestro = this.posicion;
    this.historial.push(encabezado);
    this.podar();

    return {
      tipo: 'REORG',
      ancestroComun:
        ancestro ?? {
          chainId: this.chainId,
          blockNumber: 0,
          blockHash: '0x0',
        },
      revertidos,
      posicion: this.posicionDe(encabezado),
    };
  }

  private validarEncabezado(encabezado: EncabezadoBloque): void {
    if (encabezado.chainId !== this.chainId) {
      throw new ErrorIndexador(
        'CADENA_DISTINTA',
        'el encabezado pertenece a otra cadena',
        { esperado: this.chainId, recibido: encabezado.chainId },
      );
    }
    if (
      !esHashUtilizable(encabezado.blockHash) ||
      !esHashUtilizable(encabezado.parentHash)
    ) {
      throw new ErrorIndexador(
        'HASH_INVALIDO',
        'blockHash o parentHash vacios: no sirven como identidad de bloque',
        { blockNumber: encabezado.blockNumber },
      );
    }
    if (
      !Number.isInteger(encabezado.blockNumber) ||
      encabezado.blockNumber < 0
    ) {
      throw new ErrorIndexador(
        'BLOQUE_RETROCEDE',
        'blockNumber no es un entero no negativo',
        { recibido: String(encabezado.blockNumber) },
      );
    }
  }

  private posicionDe(h: EncabezadoBloque): PosicionCheckpoint {
    return {
      chainId: h.chainId,
      blockNumber: h.blockNumber,
      blockHash: h.blockHash,
    };
  }

  /** Mantiene la ventana acotada sin perder la punta. */
  private podar(): void {
    const exceso = this.historial.length - this.profundidadRetenida;
    if (exceso > 0) this.historial.splice(0, exceso);
  }
}
