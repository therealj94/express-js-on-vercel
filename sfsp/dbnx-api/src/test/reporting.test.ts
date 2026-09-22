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
      { templateId: plantilla.templateId, entregadoEnUTC: '2030-01-20T00:00:00Z', reportHash: '0xTEST_H' },
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
      { templateId: plantilla.templateId, entregadoEnUTC: '2030-01-20T00:00:00Z', reportHash: '0xTEST_H' },
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
