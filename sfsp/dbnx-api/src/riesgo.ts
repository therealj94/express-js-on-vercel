// Clasificacion de riesgo R1–R5 y SIN_EVALUAR.
//
// POR QUE SIN_EVALUAR existe y no se sustituye por R5: R5 es una afirmacion
// ("es lo mas arriesgado de la escala"), SIN_EVALUAR es la ausencia de
// afirmacion. Poner R5 cuando falta informacion parece prudente pero es falso:
// convierte "no sabemos" en un dato, permite comparar activos que no se han
// medido y deja de pedir la informacion que falta. El plan P7c lo pide asi.
//
// Segunda regla: los textos de presentacion explican PERDIDA, LIQUIDEZ y
// COMPLEJIDAD. No prometen ganancia, ni rendimiento, ni "oportunidad". Hay una
// prueba que rechaza vocabulario de promesa.

import {
  esMarcaTiempoValida,
  fallo,
  ok,
  type Actor,
  type MarcaTiempo,
  type Resultado,
} from './tipos.js';

export type NivelRiesgo = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'SIN_EVALUAR';

/** Factor evaluado. `valor` null = no se pudo medir (no es cero). */
export interface FactorRiesgo {
  readonly id: string;
  readonly descripcion: string;
  /** Puntuacion entera 1..5, o `null` si no hay informacion suficiente. */
  readonly valor: number | null;
  /** Evidencia que respalda el factor (`ev_` + 32 hex). */
  readonly evidenceId: string | null;
}

export interface CambioRiesgo {
  readonly desde: NivelRiesgo;
  readonly hacia: NivelRiesgo;
  readonly actorId: string;
  readonly rol: string;
  readonly motivo: string;
  readonly enUTC: MarcaTiempo;
  readonly methodologyVersion: string;
}

export interface EvaluacionRiesgo {
  readonly assetId: string;
  readonly nivel: NivelRiesgo;
  /** `null` solo cuando el nivel es SIN_EVALUAR por falta de metodologia. */
  readonly methodologyVersion: string | null;
  readonly factores: readonly FactorRiesgo[];
  readonly evaluadoEnUTC: MarcaTiempo | null;
  readonly responsableActorId: string | null;
  readonly historial: readonly CambioRiesgo[];
  /** Factores que no se pudieron medir. Se muestran, no se esconden. */
  readonly factoresSinDatos: readonly string[];
  /** La apelacion es un derecho del plan P7c: aqui queda la via registrada. */
  readonly viaApelacion: string;
}

/**
 * Factores minimos exigidos. POR QUE una lista fija: si cada evaluacion elige
 * sus factores, la escala deja de ser comparable y R3 no significa nada.
 */
export const FACTORES_REQUERIDOS: readonly string[] = [
  'PERDIDA_POTENCIAL',
  'LIQUIDEZ',
  'COMPLEJIDAD',
  'CONCENTRACION',
  'CALIDAD_INFORMACION',
];

export interface EntradaEvaluacion {
  readonly assetId: string;
  readonly methodologyVersion: string | null;
  readonly factores: readonly FactorRiesgo[];
  readonly responsable: Actor | null;
  readonly enUTC: MarcaTiempo | null;
  readonly anterior?: EvaluacionRiesgo;
  readonly motivo?: string;
}

const VIA_APELACION =
  'La clasificacion es relativa y apelable ante el comite que la emitio, ' +
  'presentando evidencia adicional sobre los factores medidos.';

function sinEvaluar(
  entrada: EntradaEvaluacion,
  faltantes: readonly string[],
): EvaluacionRiesgo {
  return {
    assetId: entrada.assetId,
    nivel: 'SIN_EVALUAR',
    methodologyVersion: entrada.methodologyVersion,
    factores: [...entrada.factores],
    evaluadoEnUTC: entrada.enUTC,
    responsableActorId: entrada.responsable?.actorId ?? null,
    historial: entrada.anterior?.historial ?? [],
    factoresSinDatos: faltantes,
    viaApelacion: VIA_APELACION,
  };
}

/**
 * Evalua. Falta de informacion -> SIN_EVALUAR, SIEMPRE. No hay ninguna rama que
 * produzca R5 por ausencia de datos.
 */
export function evaluarRiesgo(
  entrada: EntradaEvaluacion,
): Resultado<EvaluacionRiesgo> {
  const porId = new Map(entrada.factores.map((f) => [f.id, f]));

  const faltantes = FACTORES_REQUERIDOS.filter((id) => {
    const f = porId.get(id);
    return (
      f === undefined ||
      f.valor === null ||
      !Number.isInteger(f.valor) ||
      f.valor < 1 ||
      f.valor > 5
    );
  });

  // Sin metodologia versionada no hay escala: no se puede clasificar.
  if (
    typeof entrada.methodologyVersion !== 'string' ||
    entrada.methodologyVersion.trim() === ''
  ) {
    return ok(sinEvaluar(entrada, [...faltantes, 'METODOLOGIA_AUSENTE']));
  }
  if (entrada.responsable === null) {
    // Una clasificacion sin responsable no es apelable ante nadie.
    return ok(sinEvaluar(entrada, [...faltantes, 'RESPONSABLE_AUSENTE']));
  }
  if (!esMarcaTiempoValida(entrada.enUTC)) {
    return ok(sinEvaluar(entrada, [...faltantes, 'FECHA_AUSENTE']));
  }
  if (faltantes.length > 0) {
    return ok(sinEvaluar(entrada, faltantes));
  }

  // Todos los factores presentes: la escala es el maximo de los factores.
  // POR QUE el maximo y no el promedio: un promedio diluye un factor extremo y
  // un activo ilíquido al maximo dejaria de verse como tal.
  let maximo = 1;
  for (const id of FACTORES_REQUERIDOS) {
    const v = porId.get(id)!.valor!;
    if (v > maximo) maximo = v;
  }
  const nivel = `R${maximo}` as NivelRiesgo;

  const anterior = entrada.anterior;
  const historial: CambioRiesgo[] = [...(anterior?.historial ?? [])];
  if (anterior !== undefined && anterior.nivel !== nivel) {
    if (typeof entrada.motivo !== 'string' || entrada.motivo.trim().length < 3) {
      return fallo(
        'REVIEW_REQUIRED',
        'cambiar el nivel de riesgo exige un motivo registrado',
        { desde: anterior.nivel, hacia: nivel },
      );
    }
    historial.push({
      desde: anterior.nivel,
      hacia: nivel,
      actorId: entrada.responsable.actorId,
      rol: entrada.responsable.rol,
      motivo: entrada.motivo.trim(),
      enUTC: entrada.enUTC,
      methodologyVersion: entrada.methodologyVersion,
    });
  }

  return ok({
    assetId: entrada.assetId,
    nivel,
    methodologyVersion: entrada.methodologyVersion,
    factores: [...entrada.factores],
    evaluadoEnUTC: entrada.enUTC,
    responsableActorId: entrada.responsable.actorId,
    historial,
    factoresSinDatos: [],
    viaApelacion: VIA_APELACION,
  });
}

/**
 * Texto de presentacion. Habla de perdida, liquidez y complejidad.
 * NO promete ganancia: no existe en este modulo ninguna cadena que lo haga, y
 * `contienePromesaDeGanancia` lo verifica sobre la salida.
 */
export function textoPresentacion(evaluacion: EvaluacionRiesgo): string {
  if (evaluacion.nivel === 'SIN_EVALUAR') {
    return (
      'Sin evaluar. No hay informacion suficiente para clasificar este activo. ' +
      'Ausencia de clasificacion no significa riesgo bajo ni riesgo alto: ' +
      'significa que no se ha medido. Puede perder la totalidad de lo aportado. ' +
      `Falta: ${evaluacion.factoresSinDatos.join(', ') || 'informacion no detallada'}.`
    );
  }
  const porNivel: Readonly<Record<string, string>> = {
    R1: 'Perdida posible y acotada segun la metodologia; liquidez habitualmente disponible; complejidad baja.',
    R2: 'Perdida posible; liquidez puede reducirse en ciertos periodos; complejidad moderada, con condiciones que conviene leer.',
    R3: 'Perdida significativa posible; liquidez limitada: puede no poder vender cuando quiera; complejidad alta.',
    R4: 'Perdida severa posible; liquidez escasa o intermitente; complejidad alta, con varios riesgos superpuestos.',
    R5: 'Perdida total posible; liquidez posiblemente nula: puede no existir mercado para salir; complejidad muy alta o informacion limitada.',
  };
  return (
    `${evaluacion.nivel}. ${porNivel[evaluacion.nivel] ?? ''} ` +
    `Metodologia ${evaluacion.methodologyVersion ?? 'no declarada'}, ` +
    `evaluado ${evaluacion.evaluadoEnUTC ?? 'sin fecha'}. ` +
    'La clasificacion es relativa dentro de esta escala y no compara con otros mercados. ' +
    evaluacion.viaApelacion
  );
}

/**
 * Detector de promesa de ganancia. POR QUE es codigo y no una revision manual:
 * los textos se editan con el tiempo y una promesa se cuela en una frase suelta.
 * Esta funcion corre sobre la salida en las pruebas.
 */
export function contienePromesaDeGanancia(texto: string): string | null {
  const prohibidos = [
    'ganancia',
    'ganancias',
    'rentabilidad garantizada',
    'garantizado',
    'garantizada',
    'sin riesgo',
    'seguro',
    'rendimiento asegurado',
    'revalorizacion',
    'oportunidad unica',
    'duplicar',
  ];
  const normal = texto.toLowerCase();
  for (const p of prohibidos) {
    if (normal.includes(p)) return p;
  }
  return null;
}
