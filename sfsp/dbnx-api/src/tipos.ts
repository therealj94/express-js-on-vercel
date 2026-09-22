// Tipos compartidos de la API de DBNX.
//
// POR QUE viven aqui: el §4 del contrato interno fija los codigos de resultado y
// exige que todo rechazo lleve uno. Si cada modulo inventara su propio literal,
// la interfaz no podria traducirlos de forma estable.

/** Codigos de resultado del §4 del contrato interno. */
export type CodigoResultado =
  | 'ALLOW'
  | 'DENY_POLICY'
  | 'DENY_ELIGIBILITY'
  | 'DENY_JURISDICTION'
  | 'DENY_ASSET_STATE'
  | 'DENY_AUTHORIZATION'
  | 'DENY_LIMIT'
  | 'REVIEW_REQUIRED'
  | 'UNKNOWN_SOURCE'
  | 'BLOCKED_DECISION';

/**
 * Resultado uniforme. POR QUE un tipo envolvente y no excepciones: un rechazo de
 * politica es un dato de negocio que debe registrarse, no un fallo del programa.
 * Las excepciones quedan para errores de programacion.
 */
export type Resultado<T> =
  | { readonly ok: true; readonly valor: T }
  | {
      readonly ok: false;
      readonly codigo: Exclude<CodigoResultado, 'ALLOW'>;
      readonly motivo: string;
      readonly detalle?: Readonly<Record<string, string | number | null>>;
    };

export function ok<T>(valor: T): Resultado<T> {
  return { ok: true, valor };
}

export function fallo<T>(
  codigo: Exclude<CodigoResultado, 'ALLOW'>,
  motivo: string,
  detalle?: Record<string, string | number | null>,
): Resultado<T> {
  return detalle === undefined
    ? { ok: false, codigo, motivo }
    : { ok: false, codigo, motivo, detalle };
}

/** Roles que pueden actuar sobre un expediente. Sin datos personales. */
export type Rol =
  | 'SOLICITANTE'
  | 'ANALISTA'
  | 'REVISOR'
  | 'COMITE'
  | 'CUMPLIMIENTO'
  | 'SISTEMA';

/**
 * Actor de una accion. `actorId` es un identificador opaco de sistema.
 * NUNCA un nombre, correo ni documento: el §7 lo prohibe fuera de Genesis ID.
 */
export interface Actor {
  readonly actorId: string;
  readonly rol: Rol;
}

/** Marca de tiempo ISO 8601 UTC, como la usa el contrato interno. */
export type MarcaTiempo = string;

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function esMarcaTiempoValida(v: unknown): v is MarcaTiempo {
  return typeof v === 'string' && ISO_UTC.test(v) && !Number.isNaN(Date.parse(v));
}

/** Entero decimal en unidades base, como cadena (§5). Nunca `number`. */
const ENTERO_EN_CADENA = /^[0-9]+$/;

export function esCantidadValida(v: unknown): v is string {
  return typeof v === 'string' && ENTERO_EN_CADENA.test(v);
}

/**
 * Reloj inyectable. POR QUE: la vigencia de una autorizacion depende del tiempo,
 * y una prueba que dependa del reloj del sistema no es determinista. Tambien
 * evita que la logica pura tenga un efecto oculto.
 */
export interface Reloj {
  ahora(): MarcaTiempo;
}

export function relojFijo(instante: MarcaTiempo): Reloj {
  return { ahora: () => instante };
}
