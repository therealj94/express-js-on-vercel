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
        explicacion:
          'Evento material ocurrido y aun no notificado, dentro de plazo.',
      });
    }
  }

  const entregada = entrada.entregas.some(
    (e) =>
      e.templateId === p.templateId &&
      esMarcaTiempoValida(e.entregadoEnUTC) &&
      Date.parse(e.entregadoEnUTC) <= deadline,
  );
  if (entregada) {
    return ok({
      templateId: p.templateId,
      divulgacion: 'CURRENT',
      restriccionMercado,
      responsableActorId: p.responsableActorId,
      deadlineUTC: p.deadlineUTC,
      finSubsanacionUTC,
      explicacion: 'Informe entregado dentro del plazo.',
    });
  }

  const entregadaEnSubsanacion = entrada.entregas.some(
    (e) =>
      e.templateId === p.templateId &&
      esMarcaTiempoValida(e.entregadoEnUTC) &&
      Date.parse(e.entregadoEnUTC) <= finSubsanacion,
  );

  if (ahora < deadline) {
    const faltan = deadline - ahora;
    return ok({
      templateId: p.templateId,
      divulgacion: faltan <= p.diasPreaviso * MS_DIA ? 'DUE' : 'CURRENT',
      restriccionMercado,
      responsableActorId: p.responsableActorId,
      deadlineUTC: p.deadlineUTC,
      finSubsanacionUTC,
      explicacion:
        faltan <= p.diasPreaviso * MS_DIA
          ? 'Entrega pendiente dentro del periodo de preaviso.'
          : 'Sin entrega pendiente en el horizonte de preaviso.',
    });
  }

  if (ahora <= finSubsanacion) {
    return ok({
      templateId: p.templateId,
      divulgacion: entregadaEnSubsanacion ? 'WARNING' : 'WARNING',
      restriccionMercado,
      responsableActorId: p.responsableActorId,
      deadlineUTC: p.deadlineUTC,
      finSubsanacionUTC,
      explicacion:
        'Plazo vencido y dentro del periodo de subsanacion. ' +
        'Es un estado de divulgacion; la decision de mercado es separada.',
    });
  }

  return ok({
    templateId: p.templateId,
    divulgacion: 'LATE',
    restriccionMercado,
    responsableActorId: p.responsableActorId,
    deadlineUTC: p.deadlineUTC,
    finSubsanacionUTC,
    explicacion:
      'Plazo y subsanacion vencidos sin entrega. Describe la divulgacion; ' +
      'cualquier restriccion de mercado es una decision aparte y proporcionada.',
  });
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
