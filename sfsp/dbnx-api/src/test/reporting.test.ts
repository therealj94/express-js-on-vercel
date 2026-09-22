import test from 'node:test';
import assert from 'node:assert/strict';

import {
  efectoSobreTitular,
  evaluarReporting,
  type PlantillaReporte,
  type ResultadoReporting,
} from '../reporting.js';

const plantilla: PlantillaReporte = {
  templateId: 'tpl-trimestral-sintetica',
  obligationId: 'obl_00000000000000000000000000000001',
  periodo: '2029-Q4',
  frecuencia: 'TRIMESTRAL',
  deadlineUTC: '2030-01-31T00:00:00Z',
  responsableActorId: 'act_finanzas',
  diasSubsanacion: 10,
  diasPreaviso: 7,
};

function evaluar(
  entrada: Parameters<typeof evaluarReporting>[0],
): ResultadoReporting {
  const r = evaluarReporting(entrada);
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('no deberia fallar');
  return r.valor;
}

test('entrega dentro de plazo da CURRENT', () => {
  const r = evaluar({
    plantilla,
    entregas: [
      {
        templateId: plantilla.templateId,
        obligationId: plantilla.obligationId,
        periodo: plantilla.periodo,
        entregadoEnUTC: '2030-01-20T00:00:00Z',
        reportHash: '0xTEST_H',
      },
    ],
    ahoraUTC: '2030-01-25T00:00:00Z',
  });
  assert.equal(r.divulgacion, 'CURRENT');
});

test('dentro del preaviso y sin entrega da DUE', () => {
  const r = evaluar({ plantilla, entregas: [], ahoraUTC: '2030-01-28T00:00:00Z' });
  assert.equal(r.divulgacion, 'DUE');
});

test('vencido pero dentro de subsanacion da WARNING', () => {
  const r = evaluar({ plantilla, entregas: [], ahoraUTC: '2030-02-05T00:00:00Z' });
  assert.equal(r.divulgacion, 'WARNING');
  assert.equal(r.finSubsanacionUTC, '2030-02-10T00:00:00.000Z');
});

test('vencido el plazo y la subsanacion da LATE', () => {
  const r = evaluar({ plantilla, entregas: [], ahoraUTC: '2030-02-20T00:00:00Z' });
  assert.equal(r.divulgacion, 'LATE');
});

test('LATE por si solo NO suspende el mercado', () => {
  const r = evaluar({ plantilla, entregas: [], ahoraUTC: '2030-02-20T00:00:00Z' });
  assert.equal(r.divulgacion, 'LATE');
  // Las dos cosas vienen por separado y la restriccion sigue en NINGUNA.
  assert.equal(r.restriccionMercado, 'NINGUNA');
  assert.equal(efectoSobreTitular(r.restriccionMercado).puedeNegociar, true);
});

test('la restriccion de mercado viene de fuera y no la calcula este modulo', () => {
  const conSuspension = evaluar({
    plantilla,
    entregas: [],
    ahoraUTC: '2030-02-20T00:00:00Z',
    restriccionMercadoVigente: 'SUSPENSION',
  });
  assert.equal(conSuspension.divulgacion, 'LATE');
  assert.equal(conSuspension.restriccionMercado, 'SUSPENSION');

  // Y al reves: una suspension no cambia el estado de divulgacion.
  const alDiaSuspendido = evaluar({
    plantilla,
    entregas: [
      {
        templateId: plantilla.templateId,
        obligationId: plantilla.obligationId,
        periodo: plantilla.periodo,
        entregadoEnUTC: '2030-01-20T00:00:00Z',
        reportHash: '0xTEST_H',
      },
    ],
    ahoraUTC: '2030-01-25T00:00:00Z',
    restriccionMercadoVigente: 'SUSPENSION',
  });
  assert.equal(alDiaSuspendido.divulgacion, 'CURRENT');
  assert.equal(alDiaSuspendido.restriccionMercado, 'SUSPENSION');
});

test('deslistar no elimina propiedad ni oculta el activo al titular', () => {
  const efecto = efectoSobreTitular('DELISTING');
  assert.equal(efecto.conservaPropiedad, true);
  assert.equal(efecto.visibleParaTitular, true);
  assert.equal(efecto.puedeNegociar, false);
});

test('evento material sin notificar dentro de plazo da WARNING; fuera de plazo LATE', () => {
  const dentro = evaluar({
    plantilla,
    entregas: [],
    ahoraUTC: '2030-01-10T06:00:00Z',
    eventosMateriales: [
      {
        eventoId: 'ev-sintetico-1',
        ocurridoEnUTC: '2030-01-10T00:00:00Z',
        notificadoEnUTC: null,
        horasNotificacion: 24,
      },
    ],
  });
  assert.equal(dentro.divulgacion, 'WARNING');

  const fuera = evaluar({
    plantilla,
    entregas: [],
    ahoraUTC: '2030-01-12T00:00:00Z',
    eventosMateriales: [
      {
        eventoId: 'ev-sintetico-1',
        ocurridoEnUTC: '2030-01-10T00:00:00Z',
        notificadoEnUTC: null,
        horasNotificacion: 24,
      },
    ],
  });
  assert.equal(fuera.divulgacion, 'LATE');
  assert.equal(fuera.restriccionMercado, 'NINGUNA');
});

test('sin periodo de subsanacion definido se devuelve BLOCKED_DECISION', () => {
  const r = evaluarReporting({
    plantilla: { ...plantilla, diasSubsanacion: null },
    entregas: [],
    ahoraUTC: '2030-02-20T00:00:00Z',
  });
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'BLOCKED_DECISION');
});

test('sin plazo de notificacion del evento material se bloquea la decision', () => {
  const r = evaluarReporting({
    plantilla,
    entregas: [],
    ahoraUTC: '2030-01-12T00:00:00Z',
    eventosMateriales: [
      {
        eventoId: 'ev-sintetico-2',
        ocurridoEnUTC: '2030-01-10T00:00:00Z',
        notificadoEnUTC: null,
        horasNotificacion: null,
      },
    ],
  });
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'BLOCKED_DECISION');
});

/* ------------------------------------------------------------------- H20 */

test('H20 · negativo: un informe antiguo de otra obligacion NO satisface un vencimiento posterior', () => {
  // El caso literal del auditor: un informe de enero de 2025 frente a un
  // vencimiento de septiembre de 2026. Antes daba CURRENT porque bastaba con
  // que existiera «alguna entrega de esta plantilla» anterior al vencimiento.
  const obligacionNueva: PlantillaReporte = {
    ...plantilla,
    obligationId: 'obl_00000000000000000000000000000099',
    periodo: '2026-Q2',
    deadlineUTC: '2026-09-30T00:00:00Z',
  };
  const r = evaluar({
    plantilla: obligacionNueva,
    entregas: [
      {
        templateId: plantilla.templateId,
        obligationId: 'obl_00000000000000000000000000000001',
        periodo: '2024-Q4',
        entregadoEnUTC: '2025-01-15T00:00:00Z',
        reportHash: '0xTEST_VIEJO',
      },
    ],
    ahoraUTC: '2026-10-31T00:00:00Z',
  });
  assert.notEqual(r.divulgacion, 'CURRENT');
  assert.equal(r.divulgacion, 'LATE');
  assert.equal(r.entregaConsideradaEnUTC, null);
  assert.equal(r.obligationId, obligacionNueva.obligationId);
  assert.equal(r.periodo, '2026-Q2');
});

test('H20 · positivo: la entrega de ESTA obligacion y ESTE periodo si da CURRENT', () => {
  const r = evaluar({
    plantilla,
    entregas: [
      {
        templateId: plantilla.templateId,
        obligationId: plantilla.obligationId,
        periodo: plantilla.periodo,
        entregadoEnUTC: '2030-01-20T00:00:00Z',
        reportHash: '0xTEST_H',
      },
    ],
    ahoraUTC: '2030-02-20T00:00:00Z',
  });
  assert.equal(r.divulgacion, 'CURRENT');
  assert.equal(r.entregaConsideradaEnUTC, '2030-01-20T00:00:00Z');
});

test('H20 · el mismo periodo bajo otra obligacion tampoco cuenta', () => {
  const r = evaluar({
    plantilla,
    entregas: [
      {
        templateId: plantilla.templateId,
        obligationId: 'obl_00000000000000000000000000000002',
        periodo: plantilla.periodo,
        entregadoEnUTC: '2030-01-20T00:00:00Z',
        reportHash: '0xTEST_H',
      },
    ],
    ahoraUTC: '2030-02-20T00:00:00Z',
  });
  assert.equal(r.divulgacion, 'LATE');
  assert.equal(r.entregaConsideradaEnUTC, null);
});

test('H20 · las dos ramas de subsanacion dan advertencias distintas y coherentes', () => {
  // Rama A: entregado tarde, dentro de la subsanacion. Hubo entrega.
  const conEntrega = evaluar({
    plantilla,
    entregas: [
      {
        templateId: plantilla.templateId,
        obligationId: plantilla.obligationId,
        periodo: plantilla.periodo,
        entregadoEnUTC: '2030-02-05T00:00:00Z',
        reportHash: '0xTEST_H',
      },
    ],
    ahoraUTC: '2030-02-06T00:00:00Z',
  });
  assert.equal(conEntrega.divulgacion, 'WARNING');
  assert.equal(conEntrega.entregaConsideradaEnUTC, '2030-02-05T00:00:00Z');
  assert.match(conEntrega.explicacion, /entregado fuera de plazo/i);

  // Rama B: sin entrega, dentro de la subsanacion.
  const sinEntrega = evaluar({ plantilla, entregas: [], ahoraUTC: '2030-02-06T00:00:00Z' });
  assert.equal(sinEntrega.divulgacion, 'WARNING');
  assert.equal(sinEntrega.entregaConsideradaEnUTC, null);
  assert.match(sinEntrega.explicacion, /Sin entrega/);

  // Antes las dos ramas producian el MISMO texto: eso es lo que se corrige.
  assert.notEqual(conEntrega.explicacion, sinEntrega.explicacion);
});

test('H20 · el estado y su explicacion nunca se contradicen', () => {
  // Barrido por todas las ramas del calendario, con y sin entrega. La regla que
  // se exige: si el texto dice «sin entrega», no hubo entrega considerada; y si
  // hubo entrega considerada, el texto no lo niega.
  const entregaDe = (cuando: string) => [
    {
      templateId: plantilla.templateId,
      obligationId: plantilla.obligationId,
      periodo: plantilla.periodo,
      entregadoEnUTC: cuando,
      reportHash: '0xTEST_H',
    },
  ];
  const momentos = [
    '2030-01-10T00:00:00Z',
    '2030-01-28T00:00:00Z',
    '2030-02-05T00:00:00Z',
    '2030-02-20T00:00:00Z',
  ];
  const entregas = [[], entregaDe('2030-01-20T00:00:00Z'), entregaDe('2030-02-05T00:00:00Z'), entregaDe('2030-02-15T00:00:00Z')];
  for (const ahoraUTC of momentos) {
    for (const es of entregas) {
      const r = evaluar({ plantilla, entregas: es, ahoraUTC });
      const diceSinEntrega = /Sin entrega/.test(r.explicacion);
      assert.equal(
        diceSinEntrega,
        r.entregaConsideradaEnUTC === null,
        `${ahoraUTC} / ${JSON.stringify(es)} -> ${r.divulgacion}: ${r.explicacion}`,
      );
      if (r.entregaConsideradaEnUTC !== null) {
        assert.match(r.explicacion, /entregado|Informe entregado/i);
      }
    }
  }
});
