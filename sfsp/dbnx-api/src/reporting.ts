// Estado de divulgacion por plantilla: CURRENT / DUE / LATE / WARNING.
//
// ================= SEPARACION QUE NO SE MEZCLA =================
// EL ESTADO DE DIVULGACION NO ES UNA RESTRICCION DE MERCADO.
//
// Que un informe llegue tarde describe la divulgacion. Suspender, deslistar o
// restringir transferencias son decisiones SEPARADAS y proporcionadas, que
// toma alguien con competencia para tomarlas. Por eso `evaluarReporting`
// devuelve dos cosas distintas y NUNCA una sola: `divulgacion` y
// `restriccionMercado`, y la segunda por defecto es 'NINGUNA'.
//
// Ademas (regla 6 del plan y §2.3): deslistar no elimina propiedad ni oculta el
// activo a su titular.
// ===============================================================

import {
  esMarcaTiempoValida,
  fallo,
  ok,
  type MarcaTiempo,
  type Resultado,
} from './tipos.js';

export type EstadoDivulgacion = 'CURRENT' | 'DUE' | 'LATE' | 'WARNING' | 'NONE';

/** Decision de mercado. Es de otro dominio: aqui solo se transporta. */
export type RestriccionMercado =
  | 'NINGUNA'
  | 'SUSPENSION'
  | 'DELISTING'
  | 'RESTRICCION_TRANSFERENCIA';

export type Frecuencia = 'MENSUAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' | 'EVENTUAL';

export interface PlantillaReporte {
  readonly templateId: string;
  /**
   * Obligacion concreta que esta plantilla esta evaluando (H20). POR QUE existe:
   * sin ella, «hay una entrega de esta plantilla» contaba para CUALQUIER
   * vencimiento posterior, y un informe de enero de 2025 aparecia como CURRENT
   * frente a un vencimiento de septiembre de 2026.
   */
  readonly obligationId: string;
  /**
   * Periodo cubierto, en forma estable y comparable ('2030-Q1', '2030-01', ...).
   * Una entrega cubre UN periodo: la obligacion dice cual se exige y la entrega
   * dice cual trae. Si no coinciden, la entrega no satisface esta obligacion.
   */
  readonly periodo: string;
  readonly frecuencia: Frecuencia;
  /** Fecha limite de la entrega en curso. */
  readonly deadlineUTC: MarcaTiempo;
  /** Identificador opaco del responsable. Nunca un nombre ni un correo. */
  readonly responsableActorId: string;
  /**
   * Dias de subsanacion tras el deadline. `null` = no definido: se bloquea la
   * decision en vez de suponer un plazo comodo.
   */
  readonly diasSubsanacion: number | null;
  /** Dias antes del deadline en los que el estado pasa a DUE. */
  readonly diasPreaviso: number;
}

/** Evento material: obliga a divulgar fuera del calendario. */
export interface EventoMaterial {
  readonly eventoId: string;
  readonly ocurridoEnUTC: MarcaTiempo;
  readonly notificadoEnUTC: MarcaTiempo | null;
  /** Horas maximas para notificar. `null` = no definido -> BLOCKED_DECISION. */
  readonly horasNotificacion: number | null;
}

export interface EntregaReporte {
  readonly templateId: string;
  /** Obligacion que esta entrega dice satisfacer. No es opcional: una entrega
   *  que no dice a que obligacion responde no satisface ninguna. */
  readonly obligationId: string;
  /** Periodo cubierto por el informe entregado. */
  readonly periodo: string;
  readonly entregadoEnUTC: MarcaTiempo;
  readonly reportHash: string;
}

export interface ResultadoReporting {
  readonly templateId: string;
  /** Lo unico que este modulo decide. */
  readonly divulgacion: EstadoDivulgacion;
  /**
   * Decision de mercado vigente, que viene de fuera. Este modulo NUNCA la
   * calcula a partir de la divulgacion.
   */
  readonly restriccionMercado: RestriccionMercado;
  readonly responsableActorId: string;
  readonly deadlineUTC: MarcaTiempo;
  readonly finSubsanacionUTC: MarcaTiempo | null;
  /** Obligacion y periodo evaluados: el veredicto no es sobre «la plantilla». */
  readonly obligationId: string;
  readonly periodo: string;
  /**
   * Instante de la entrega que se considero para decidir, o `null` si no hubo
   * ninguna. POR QUE se publica: el estado y su explicacion tienen que poder
   * contrastarse. Una prueba exige que un texto que diga «sin entrega» venga
   * siempre con este campo en `null`, y al reves.
   */
  readonly entregaConsideradaEnUTC: MarcaTiempo | null;
  /** Explicacion para la interfaz. Describe, no sanciona. */
  readonly explicacion: string;
}

const MS_DIA = 86_400_000;

export interface EntradaReporting {
  readonly plantilla: PlantillaReporte;
  readonly entregas: readonly EntregaReporte[];
  readonly eventosMateriales?: readonly EventoMaterial[];
  /**
   * Restriccion de mercado vigente, decidida en otro sitio. Si no se pasa, es
   * 'NINGUNA': el retraso por si solo no suspende nada.
   */
  readonly restriccionMercadoVigente?: RestriccionMercado;
  readonly ahoraUTC: MarcaTiempo;
}

export function evaluarReporting(
  entrada: EntradaReporting,
): Resultado<ResultadoReporting> {
  const p = entrada.plantilla;
  if (!esMarcaTiempoValida(p.deadlineUTC) || !esMarcaTiempoValida(entrada.ahoraUTC)) {
    return fallo('UNKNOWN_SOURCE', 'fechas no utilizables para evaluar divulgacion');
  }
  if (p.diasSubsanacion === null) {
    // POR QUE bloquea: un periodo de subsanacion es un parametro con efecto
    // juridico; elegirlo por nuestra cuenta seria inventar una regla.
    return fallo(
      'BLOCKED_DECISION',
      'la plantilla no define periodo de subsanacion: no se elige un valor por defecto',
      { templateId: p.templateId },
    );
  }

  const ahora = Date.parse(entrada.ahoraUTC);
  const deadline = Date.parse(p.deadlineUTC);
  const finSubsanacion = deadline + p.diasSubsanacion * MS_DIA;
  const finSubsanacionUTC = new Date(finSubsanacion).toISOString().replace(/\.\d{3}Z$/, '.000Z');

  const restriccionMercado = entrada.restriccionMercadoVigente ?? 'NINGUNA';

  /**
   * La entrega aplicable es la de ESTA obligacion y ESTE periodo (H20). No
   * «alguna entrega de la misma plantilla»: la plantilla se repite todos los
   * trimestres y el informe de uno no informa de otro. Si hubiera varias, se
   * toma la mas temprana, porque la que fija si se llego a tiempo es la primera.
   */
  const aplicables = entrada.entregas
    .filter(
      (e) =>
        e.templateId === p.templateId &&
        e.obligationId === p.obligationId &&
        e.periodo === p.periodo &&
        esMarcaTiempoValida(e.entregadoEnUTC),
    )
    .sort((x, y) => Date.parse(x.entregadoEnUTC) - Date.parse(y.entregadoEnUTC));
  const entregaAplicable: EntregaReporte | null = aplicables[0] ?? null;

  /** Constructor unico del resultado: el estado, la entrega considerada y la
   *  explicacion salen siempre del mismo sitio, para que no puedan discrepar. */
  const base = (
    divulgacion: EstadoDivulgacion,
    entregaConsideradaEnUTC: MarcaTiempo | null,
    explicacion: string,
  ): Resultado<ResultadoReporting> =>
    ok({
      templateId: p.templateId,
      divulgacion,
      restriccionMercado,
      responsableActorId: p.responsableActorId,
      deadlineUTC: p.deadlineUTC,
      finSubsanacionUTC,
      obligationId: p.obligationId,
      periodo: p.periodo,
      entregaConsideradaEnUTC,
      explicacion,
    });

  // Evento material pendiente de notificar dentro de plazo -> WARNING.
  for (const ev of entrada.eventosMateriales ?? []) {
    if (ev.horasNotificacion === null) {
      return fallo(
        'BLOCKED_DECISION',
        'el evento material no define plazo de notificacion',
        { eventoId: ev.eventoId },
      );
    }
    if (ev.notificadoEnUTC === null) {
      const limite = Date.parse(ev.ocurridoEnUTC) + ev.horasNotificacion * 3_600_000;
      if (ahora > limite) {
        return ok({
          templateId: p.templateId,
          divulgacion: 'LATE',
          restriccionMercado,
          responsableActorId: p.responsableActorId,
          deadlineUTC: p.deadlineUTC,
          finSubsanacionUTC,
          obligationId: p.obligationId,
          periodo: p.periodo,
          entregaConsideradaEnUTC: entregaAplicable?.entregadoEnUTC ?? null,
          explicacion:
            'Evento material no notificado dentro del plazo. Describe la divulgacion; ' +
            'no implica por si solo restriccion de mercado.',
        });
      }
      return ok({
        templateId: p.templateId,
        divulgacion: 'WARNING',
        restriccionMercado,
        responsableActorId: p.responsableActorId,
        deadlineUTC: p.deadlineUTC,
        finSubsanacionUTC,
        obligationId: p.obligationId,
        periodo: p.periodo,
        entregaConsideradaEnUTC: entregaAplicable?.entregadoEnUTC ?? null,
        explicacion:
          'Evento material ocurrido y aun no notificado, dentro de plazo.',
      });
    }
  }

  if (ahora < deadline) {
    const faltan = deadline - ahora;
    const enPreaviso = faltan <= p.diasPreaviso * MS_DIA;
    if (entregaAplicable === null) {
      return base(
        enPreaviso ? 'DUE' : 'CURRENT',
        null,
        enPreaviso
          ? 'Entrega pendiente de esta obligacion, dentro del periodo de preaviso.'
          : 'Entrega de esta obligacion aun no exigible ni dentro del preaviso.',
      );
    }
    // Entregada antes del vencimiento: la obligacion esta satisfecha y el texto
    // lo dice; no queda un CURRENT cuya explicacion hable de «pendiente».
    return base('CURRENT', entregaAplicable.entregadoEnUTC, 'Informe de esta obligacion entregado dentro del plazo.');
  }

  if (entregaAplicable !== null) {
    const t = Date.parse(entregaAplicable.entregadoEnUTC);
    if (t <= deadline) {
      return base('CURRENT', entregaAplicable.entregadoEnUTC, 'Informe de esta obligacion entregado dentro del plazo.');
    }
    if (t <= finSubsanacion) {
      // POR QUE no vuelve a LATE cuando pasa la subsanacion: la entrega ocurrio
      // y el hecho no se deshace con el reloj. Antes, esta rama y la de «sin
      // entrega» producian la MISMA advertencia y el texto posterior afirmaba
      // que no habia habido entrega.
      return base(
        'WARNING',
        entregaAplicable.entregadoEnUTC,
        'Informe entregado fuera de plazo, dentro del periodo de subsanacion. ' +
          'Es un estado de divulgacion; la decision de mercado es separada.',
      );
    }
    return base(
      'LATE',
      entregaAplicable.entregadoEnUTC,
      'Informe entregado despues del periodo de subsanacion. Describe la divulgacion; ' +
        'cualquier restriccion de mercado es una decision aparte y proporcionada.',
    );
  }

  if (ahora <= finSubsanacion) {
    return base(
      'WARNING',
      null,
      'Sin entrega de esta obligacion: plazo vencido y dentro del periodo de subsanacion. ' +
        'Es un estado de divulgacion; la decision de mercado es separada.',
    );
  }

  return base(
    'LATE',
    null,
    'Sin entrega de esta obligacion: plazo y subsanacion vencidos. Describe la divulgacion; ' +
      'cualquier restriccion de mercado es una decision aparte y proporcionada.',
  );
}

/**
 * Deslistar no elimina propiedad. POR QUE esta funcion existe: hace explicito,
 * en codigo y con prueba, lo que la regla 6 del plan exige, para que nadie
 * derive "delisted => saldo oculto" en la interfaz.
 */
export function efectoSobreTitular(restriccion: RestriccionMercado): {
  readonly conservaPropiedad: true;
  readonly visibleParaTitular: true;
  readonly puedeNegociar: boolean;
} {
  return {
    conservaPropiedad: true,
    visibleParaTitular: true,
    puedeNegociar: restriccion === 'NINGUNA' || restriccion === 'RESTRICCION_TRANSFERENCIA'
      ? restriccion === 'NINGUNA'
      : false,
  };
}
