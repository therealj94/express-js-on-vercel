// Plantillas de derechos: equity, deuda, participacion de ingresos, royalty e
// interes economico en vehiculo.
//
// ================= REGLA CENTRAL =================
// CAMBIAR UN CAMPO NO CONVIERTE UNA PLANTILLA EN OTRA.
//
// El plan P7c lo dice literal: «no se transforma una accion en royalty cambiando
// un campo». POR QUE importa: los derechos, la prelacion en un concurso y el
// regimen aplicable dependen del TIPO, no de los parametros. Si el tipo fuese
// editable, un cambio de configuracion reescribiria en silencio que es lo que
// alguien compro.
//
// Implementacion: `tipo` es inmutable una vez emitida la plantilla. Reparametrizar
// devuelve una plantilla del MISMO tipo; cambiar de tipo exige emitir una nueva
// y, si hay tenedores, un expediente de migracion (fuera de alcance aqui).
// =================================================

import { fallo, ok, type Resultado } from './tipos.js';

export type TipoDerecho =
  | 'EQUITY'
  | 'DEBT'
  | 'REVENUE_SHARE'
  | 'ROYALTY'
  | 'VEHICLE_ECONOMIC_INTEREST';

/** Parametro de plantilla. `valor: null` = no definido, NO cero. */
export interface Parametro {
  readonly clave: string;
  readonly valor: string | null;
  /** Unidad o forma del valor: 'ENTERO_BASE', 'BPS', 'ISO8601', 'TEXTO'. */
  readonly forma: 'ENTERO_BASE' | 'BPS' | 'ISO8601' | 'TEXTO';
}

export interface PlantillaDerechos {
  readonly templateId: string;
  readonly version: string;
  /** INMUTABLE tras la emision. Ver la regla central de este archivo. */
  readonly tipo: TipoDerecho;
  readonly parametros: Readonly<Record<string, Parametro>>;
  /** Marca de emision: a partir de aqui el tipo esta congelado. */
  readonly emitida: boolean;
  /** Parametros requeridos que siguen sin definir. */
  readonly parametrosPendientes: readonly string[];
}

/**
 * Parametros requeridos por tipo. POR QUE distintos: un royalty no tiene
 * prelacion ni vencimiento, y una deuda no tiene base de ingresos. Que los
 * requeridos difieran es justamente la prueba de que no son el mismo objeto.
 */
export const PARAMETROS_REQUERIDOS: Readonly<Record<TipoDerecho, readonly string[]>> = {
  EQUITY: ['claseAccion', 'derechoVoto', 'derechoDividendo', 'prelacion'],
  DEBT: ['principal', 'cupónBps', 'vencimiento', 'prelacion', 'garantias'],
  REVENUE_SHARE: ['baseIngresos', 'porcentajeBps', 'tope', 'periodoLiquidacion'],
  ROYALTY: ['obraOActivoSubyacente', 'tarifaBps', 'territorio', 'duracion'],
  VEHICLE_ECONOMIC_INTEREST: [
    'vehiculoRef',
    'porcentajeEconomicoBps',
    'derechoGestion',
    'distribucionCascada',
  ],
};

export interface EntradaPlantilla {
  readonly templateId: string;
  readonly version: string;
  readonly tipo: TipoDerecho;
  readonly parametros: readonly Parametro[];
}

export function crearPlantilla(
  entrada: EntradaPlantilla,
): Resultado<PlantillaDerechos> {
  if (!(entrada.tipo in PARAMETROS_REQUERIDOS)) {
    return fallo('DENY_POLICY', 'tipo de derecho desconocido', {
      tipo: String(entrada.tipo),
    });
  }
  const mapa: Record<string, Parametro> = {};
  for (const p of entrada.parametros) mapa[p.clave] = p;

  const pendientes = PARAMETROS_REQUERIDOS[entrada.tipo].filter(
    (k) => mapa[k] === undefined || mapa[k]!.valor === null || mapa[k]!.valor === '',
  );

  return ok({
    templateId: entrada.templateId,
    version: entrada.version,
    tipo: entrada.tipo,
    parametros: Object.freeze(mapa),
    emitida: false,
    parametrosPendientes: pendientes,
  });
}

/**
 * Congela la plantilla. Un parametro requerido sin definir NO se completa con un
 * valor por defecto: se devuelve BLOCKED_DECISION, porque elegirlo seria
 * inventar una condicion economica no aprobada.
 */
export function emitirPlantilla(
  plantilla: PlantillaDerechos,
): Resultado<PlantillaDerechos> {
  if (plantilla.emitida) {
    return fallo('DENY_ASSET_STATE', 'la plantilla ya estaba emitida');
  }
  if (plantilla.parametrosPendientes.length > 0) {
    return fallo(
      'BLOCKED_DECISION',
      'faltan parametros requeridos: no se eligen valores por defecto',
      { pendientes: plantilla.parametrosPendientes.join(', ') },
    );
  }
  return ok({ ...plantilla, emitida: true });
}

/**
 * Reparametriza. Cambia valores, NUNCA el tipo. El tipo ni siquiera se acepta
 * como argumento: no hay una ruta por la que un descuido lo cambie.
 */
export function reparametrizar(
  plantilla: PlantillaDerechos,
  cambios: readonly Parametro[],
  nuevaVersion: string,
): Resultado<PlantillaDerechos> {
  if (typeof nuevaVersion !== 'string' || nuevaVersion.trim() === '') {
    return fallo('DENY_POLICY', 'reparametrizar exige una version nueva');
  }
  if (nuevaVersion === plantilla.version) {
    // Cambiar condiciones sin subir la version hace que dos cosas distintas
    // compartan identificador: quien tenga la vieja no sabria que cambio.
    return fallo('DENY_POLICY', 'la version debe cambiar al reparametrizar');
  }
  const mapa: Record<string, Parametro> = { ...plantilla.parametros };
  for (const c of cambios) {
    if (!PARAMETROS_REQUERIDOS[plantilla.tipo].includes(c.clave) && !(c.clave in mapa)) {
      return fallo('DENY_POLICY', 'parametro ajeno a la plantilla', { clave: c.clave });
    }
    mapa[c.clave] = c;
  }
  const pendientes = PARAMETROS_REQUERIDOS[plantilla.tipo].filter(
    (k) => mapa[k] === undefined || mapa[k]!.valor === null || mapa[k]!.valor === '',
  );
  return ok({
    ...plantilla,
    version: nuevaVersion,
    parametros: Object.freeze(mapa),
    parametrosPendientes: pendientes,
  });
}

/**
 * Intento explicito de cambiar el tipo. Existe para que el rechazo sea visible y
 * probado, en vez de depender de que nadie lo intente.
 */
export function intentarCambiarTipo(
  plantilla: PlantillaDerechos,
  nuevoTipo: TipoDerecho,
): Resultado<never> {
  if (plantilla.emitida) {
    return fallo(
      'DENY_ASSET_STATE',
      'el tipo de una plantilla emitida es inmutable: una accion no se convierte ' +
        'en royalty cambiando un campo. Emita una plantilla nueva.',
      { tipoActual: plantilla.tipo, tipoIntentado: nuevoTipo },
    );
  }
  return fallo(
    'DENY_POLICY',
    'el tipo no se cambia sobre una plantilla existente: cree otra',
    { tipoActual: plantilla.tipo, tipoIntentado: nuevoTipo },
  );
}

/**
 * Comprueba que dos plantillas describen el mismo derecho. Un cambio de tipo no
 * puede pasar por "misma plantilla, otra version".
 */
export function mismoDerecho(
  a: PlantillaDerechos,
  b: PlantillaDerechos,
): boolean {
  return a.templateId === b.templateId && a.tipo === b.tipo;
}
