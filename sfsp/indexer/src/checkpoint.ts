// Checkpoint de avance por bloque con deteccion de reorganizacion.
//
// POR QUE existe este modulo: el plan maestro P7a exige "checkpoint de
// bloque/hash, deteccion de retraso y reconstruccion". Un indexador que solo
// guarda `blockNumber` no puede notar una reorganizacion: el numero vuelve a
// subir igual y los datos viejos quedan mezclados con los nuevos. Guardar
// `(blockNumber, blockHash)` y comparar `parentHash` es lo minimo para detectar
// que la cadena cambio de rama debajo del indice.
//
// CORRECCION H14. La version anterior tenia tres defectos:
//   1. Aceptaba una reorganizacion sin las cabeceras de la rama nueva. La
//      historia A1..A5 seguida de B6, cuyo padre B5 nunca se suministro, se
//      aceptaba y dejaba alturas [1,2,3,4,6] rellenando la ascendencia nueva con
//      datos de la rama vieja. Eso es inventar continuidad.
//   2. Mutaba el historial MIENTRAS decidia: una reorganizacion profunda podia
//      lanzar la excepcion despues de haber borrado el historial, y el indice
//      quedaba peor que antes del error.
//   3. Bajaba por altura asumiendo la ascendencia de la rama nueva, que no
//      conocia.
// Ahora la unidad de trabajo es la RAMA COMPLETA: se valida entera contra el
// historial retenido, se construye el historial resultante en una copia, y solo
// si todo cuadra se sustituye de una vez. Si algo falla, nada cambia.
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
      /** Posicion tras aplicar la rama nueva sobre el ancestro. */
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
 * Cursor de indexacion. Aplica ramas de encabezados y mantiene el historial
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
    return this.posicionDe(punta);
  }

  /** Copia del historial retenido, del mas viejo al mas nuevo. */
  public get historialRetenido(): readonly EncabezadoBloque[] {
    return [...this.historial];
  }

  /** Hash indexado en una altura, o `null` si esa altura no esta retenida. */
  public hashEnAltura(altura: number): string | null {
    return (
      this.historial.find((h) => h.blockNumber === altura)?.blockHash ?? null
    );
  }

  /**
   * Aplica un solo encabezado. Es el caso de una cadena que avanza bloque a
   * bloque. Para una reorganizacion de mas de un bloque hay que llamar a
   * `aplicarRama` con TODAS las cabeceras de la rama nueva: sin ellas el
   * checkpoint no puede comprobar la ascendencia y no la adivina.
   */
  public aplicar(encabezado: EncabezadoBloque): ResultadoAvance {
    return this.aplicarRama([encabezado]);
  }

  /**
   * Aplica una rama completa, de la mas vieja a la mas nueva.
   *
   * Reglas, todas explicitas y ninguna silenciosa:
   * - La rama tiene que ser una cadena contigua consigo misma (`RAMA_INVALIDA`).
   * - Su primer encabezado tiene que enlazar con un bloque retenido por
   *   identidad, numero y hash. Si el bloque de esa altura existe con otro hash,
   *   faltan cabeceras de la rama nueva: es un hueco (`GAP_DETECTADO`), no una
   *   reorganizacion.
   * - Si el enlace cae por debajo de la ventana retenida, la reorganizacion
   *   excede lo que el indice puede deshacer (`REORG_SIN_ANCESTRO`).
   * - Un salto hacia adelante es `GAP_DETECTADO`.
   * - La rama ya aplicada tal cual es `DUPLICADO` e idempotente.
   *
   * Nada de esto toca `this.historial` hasta que la transicion entera es valida.
   */
  public aplicarRama(rama: readonly EncabezadoBloque[]): ResultadoAvance {
    const transicion = this.construirTransicion(rama);
    // Punto unico de mutacion. Todo lo anterior trabajo sobre copias, asi que
    // una excepcion deja el checkpoint exactamente como estaba.
    this.historial = transicion.nuevoHistorial;
    return transicion.resultado;
  }

  /**
   * Construye la transicion completa sin aplicarla. Util para decidir antes de
   * escribir, y es lo que hace atomica a `aplicarRama`.
   */
  private construirTransicion(rama: readonly EncabezadoBloque[]): {
    readonly nuevoHistorial: EncabezadoBloque[];
    readonly resultado: ResultadoAvance;
  } {
    if (rama.length === 0) {
      throw new ErrorIndexador(
        'RAMA_INVALIDA',
        'no se suministro ninguna cabecera',
        { chainId: this.chainId },
      );
    }
    for (const h of rama) this.validarEncabezado(h);
    this.validarContinuidadInterna(rama);

    const primero = rama[0]!;
    const ultimo = rama[rama.length - 1]!;
    const punta = this.historial[this.historial.length - 1];

    // Indice vacio: no hay con que comparar la ascendencia. Se acepta la rama
    // como origen del indice, que es lo unico que se puede hacer honestamente.
    if (punta === undefined) {
      return {
        nuevoHistorial: this.podar([...rama]),
        resultado: { tipo: 'AVANZADO', posicion: this.posicionDe(ultimo) },
      };
    }

    // Reingesta exacta de cabeceras ya aplicadas: idempotente.
    const todasConocidas = rama.every((h) => this.hashEnAltura(h.blockNumber) === h.blockHash);
    if (todasConocidas) {
      return {
        nuevoHistorial: [...this.historial],
        resultado: { tipo: 'DUPLICADO', posicion: this.posicionDe(punta) },
      };
    }

    // Salto hacia adelante. POR QUE es error y no un "ponerse al dia": el
    // indexador no puede distinguir un hueco benigno de eventos perdidos, y
    // rellenar por asuncion contradice la regla 4 del README (una lectura que
    // falta es UNKNOWN, nunca un valor inventado).
    if (primero.blockNumber > punta.blockNumber + 1) {
      throw new ErrorIndexador(
        'GAP_DETECTADO',
        'la secuencia de bloques salta: falta al menos un bloque intermedio',
        {
          chainId: this.chainId,
          esperado: punta.blockNumber + 1,
          recibido: primero.blockNumber,
          faltantes: primero.blockNumber - punta.blockNumber - 1,
        },
      );
    }

    const alturaAncestro = primero.blockNumber - 1;
    const masViejo = this.historial[0]!;

    // La rama arranca en el genesis: sustituye el historial entero, no hay
    // ancestro que comprobar.
    if (alturaAncestro < 0) {
      const revertidos = [...this.historial].reverse().map((h) => this.posicionDe(h));
      return {
        nuevoHistorial: this.podar([...rama]),
        resultado: {
          tipo: 'REORG',
          ancestroComun: { chainId: this.chainId, blockNumber: -1, blockHash: '' },
          revertidos,
          posicion: this.posicionDe(ultimo),
        },
      };
    }

    if (alturaAncestro < masViejo.blockNumber) {
      // POR QUE se escala en vez de reiniciar: reindexar desde cero en silencio
      // esconde un evento operativo grave (reorganizacion mas profunda que la
      // ventana) que debe quedar registrado y decidido por una persona.
      throw new ErrorIndexador(
        'REORG_SIN_ANCESTRO',
        'la reorganizacion excede el historial retenido: no hay ancestro comun',
        {
          chainId: this.chainId,
          profundidadRetenida: this.profundidadRetenida,
          bloqueRecibido: primero.blockNumber,
          alturaMasViejaRetenida: masViejo.blockNumber,
        },
      );
    }

    const indiceAncestro = this.historial.findIndex(
      (h) => h.blockNumber === alturaAncestro,
    );
    const ancestro = this.historial[indiceAncestro];
    if (ancestro === undefined) {
      throw new ErrorIndexador(
        'GAP_DETECTADO',
        'el indice no retiene la altura donde la rama nueva deberia enlazar',
        {
          chainId: this.chainId,
          alturaBuscada: alturaAncestro,
          recibido: primero.blockNumber,
        },
      );
    }

    if (ancestro.blockHash !== primero.parentHash) {
      // Este es exactamente el caso A1..A5 + B6 con B5 ausente: el bloque de la
      // altura anterior existe, pero pertenece a la rama vieja. Aceptarlo seria
      // coser la ascendencia nueva con cabeceras viejas, que es inventar
      // continuidad. Se exige que quien ingiere suministre tambien B5.
      throw new ErrorIndexador(
        'GAP_DETECTADO',
        'faltan cabeceras de la rama nueva: su primer bloque no enlaza con ningun bloque retenido',
        {
          chainId: this.chainId,
          alturaEnlace: alturaAncestro,
          hashRetenido: ancestro.blockHash,
          padreDeclarado: primero.parentHash,
          recibido: primero.blockNumber,
        },
      );
    }

    // Prefijo comun: cabeceras viejas identicas a las nuevas no se revierten.
    const viejasDespuesDelAncestro = this.historial.slice(indiceAncestro + 1);
    let comunes = 0;
    while (
      comunes < viejasDespuesDelAncestro.length &&
      comunes < rama.length &&
      viejasDespuesDelAncestro[comunes]!.blockNumber === rama[comunes]!.blockNumber &&
      viejasDespuesDelAncestro[comunes]!.blockHash === rama[comunes]!.blockHash
    ) {
      comunes += 1;
    }
    const revertidos = viejasDespuesDelAncestro
      .slice(comunes)
      .reverse()
      .map((h) => this.posicionDe(h));

    const nuevoHistorial = this.podar([
      ...this.historial.slice(0, indiceAncestro + 1),
      ...rama,
    ]);

    if (revertidos.length === 0) {
      return {
        nuevoHistorial,
        resultado: { tipo: 'AVANZADO', posicion: this.posicionDe(ultimo) },
      };
    }
    return {
      nuevoHistorial,
      resultado: {
        tipo: 'REORG',
        ancestroComun: this.posicionDe(ancestro),
        revertidos,
        posicion: this.posicionDe(ultimo),
      },
    };
  }

  /** Una rama tiene que ser una cadena consigo misma antes de compararla. */
  private validarContinuidadInterna(rama: readonly EncabezadoBloque[]): void {
    for (let i = 1; i < rama.length; i += 1) {
      const previo = rama[i - 1]!;
      const actual = rama[i]!;
      if (actual.blockNumber !== previo.blockNumber + 1) {
        throw new ErrorIndexador(
          'RAMA_INVALIDA',
          'las cabeceras de la rama no son consecutivas',
          { anterior: previo.blockNumber, siguiente: actual.blockNumber },
        );
      }
      if (actual.parentHash !== previo.blockHash) {
        throw new ErrorIndexador(
          'RAMA_INVALIDA',
          'una cabecera de la rama no declara como padre a la anterior',
          { altura: actual.blockNumber },
        );
      }
    }
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

  /** Mantiene la ventana acotada sin perder la punta. Devuelve una copia. */
  private podar(historial: EncabezadoBloque[]): EncabezadoBloque[] {
    const exceso = historial.length - this.profundidadRetenida;
    return exceso > 0 ? historial.slice(exceso) : historial;
  }
}
