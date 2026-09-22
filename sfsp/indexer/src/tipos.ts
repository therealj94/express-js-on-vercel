// Tipos compartidos del indexador.
//
// POR QUE: el §4 del contrato interno exige que todo rechazo lleve un codigo
// estable. Repetir literales de cadena por el arbol termina en divergencias
// ("UNKNOWN" vs "UNKNOWN_SOURCE"), asi que los codigos viven en un solo lugar.

/** Codigos de resultado del §4 del contrato interno que usa el indexador. */
export type CodigoResultado =
  | 'ALLOW'
  | 'DENY_POLICY'
  | 'DENY_ASSET_STATE'
  | 'UNKNOWN_SOURCE'
  | 'BLOCKED_DECISION';

/**
 * Error de dominio del indexador. POR QUE una clase propia: el §8 prohibe
 * `console.log` en biblioteca y obliga a que el mensaje lleve codigo. Quien
 * consume puede ramificar por `codigo` sin analizar texto libre.
 */
export class ErrorIndexador extends Error {
  public readonly codigo: CodigoErrorIndexador;
  public readonly detalle: Readonly<Record<string, string | number | null>>;

  constructor(
    codigo: CodigoErrorIndexador,
    mensaje: string,
    detalle: Record<string, string | number | null> = {},
  ) {
    super(`${codigo}: ${mensaje}`);
    this.name = 'ErrorIndexador';
    this.codigo = codigo;
    this.detalle = Object.freeze({ ...detalle });
  }
}

/**
 * Errores propios del avance de cadena. Son distintos de los codigos del §4
 * porque describen un fallo de ingesta, no una decision de politica.
 */
export type CodigoErrorIndexador =
  | 'GAP_DETECTADO'        // falta al menos un bloque en la secuencia
  | 'BLOQUE_RETROCEDE'     // llego un bloque con numero menor o igual al cursor
  | 'REORG_SIN_ANCESTRO'   // la reorganizacion excede el historial retenido
  | 'CADENA_DISTINTA'      // chainId distinto al del checkpoint
  | 'HASH_INVALIDO';       // forma del hash no utilizable como clave

/** Un encabezado de bloque minimo: lo unico que el checkpoint necesita. */
export interface EncabezadoBloque {
  readonly chainId: number;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly parentHash: string;
}

/** Identidad de un log segun el §3: la clave de deduplicacion del indexador. */
export interface ClaveLog {
  readonly chainId: number;
  readonly blockHash: string;
  readonly txHash: string;
  readonly logIndex: number;
}

/** Log crudo tal como lo entrega un lector de cadena. */
export interface LogCrudo extends ClaveLog {
  readonly blockNumber: number;
  /** Firma del evento (`topic0`) o el nombre si la fuente ya lo resolvio. */
  readonly firma: string;
  /** Emisor del log. Direccion sintetica en pruebas; nunca una real del ecosistema. */
  readonly address: string;
  readonly topics: readonly string[];
  readonly data: string;
  /**
   * Parametros ya normalizados a texto por el adaptador de lectura.
   *
   * POR QUE aqui y no un decodificador ABI propio: decodificar bytes exige
   * conocer el ABI desplegado, que este arbol no tiene verificado (no hay
   * acceso a red). La frontera queda explicita: el adaptador convierte
   * `data`/`topics` en pares nombre->texto, y `decode.ts` valida y tipa. Toda
   * cantidad viaja como entero en cadena, nunca como `number` (§5).
   */
  readonly parametros?: Readonly<Record<string, string>>;
}

/**
 * Valida la forma minima de un hash. POR QUE: una clave de deduplicacion
 * construida con `undefined` o cadena vacia colisiona en silencio y dos logs
 * distintos pasarian por el mismo. Se rechaza antes de tocar el indice.
 */
export function esHashUtilizable(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0;
}
