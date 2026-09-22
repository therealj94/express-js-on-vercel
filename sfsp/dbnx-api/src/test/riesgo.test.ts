import test from 'node:test';
import assert from 'node:assert/strict';

import {
  contienePromesaDeGanancia,
  evaluarRiesgo,
  FACTORES_REQUERIDOS,
  textoPresentacion,
  type EvaluacionRiesgo,
  type FactorRiesgo,
} from '../riesgo.js';
import { ASSET_ID, comite, T1 } from './ayudas.js';

function factores(valores: Readonly<Record<string, number | null>>): FactorRiesgo[] {
  return FACTORES_REQUERIDOS.map((id) => ({
    id,
    descripcion: `factor sintetico ${id}`,
    valor: valores[id] ?? null,
    evidenceId: 'ev_00000000000000000000000000000001',
  }));
}

const completos = factores({
  PERDIDA_POTENCIAL: 3,
  LIQUIDEZ: 2,
  COMPLEJIDAD: 2,
  CONCENTRACION: 1,
  CALIDAD_INFORMACION: 2,
});

function evaluar(entrada: Parameters<typeof evaluarRiesgo>[0]): EvaluacionRiesgo {
  const r = evaluarRiesgo(entrada);
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('no deberia fallar');
  return r.valor;
}

test('con todos los factores se clasifica en la escala', () => {
  const e = evaluar({
    assetId: ASSET_ID,
    methodologyVersion: 'met-0.1',
    factores: completos,
    responsable: comite,
    enUTC: T1,
  });
  assert.equal(e.nivel, 'R3'); // el maximo de los factores
  assert.equal(e.methodologyVersion, 'met-0.1');
  assert.equal(e.responsableActorId, comite.actorId);
  assert.equal(e.evaluadoEnUTC, T1);
  assert.deepEqual(e.factoresSinDatos, []);
});

test('falta de informacion da SIN_EVALUAR, nunca R5 como sustituto', () => {
  const e = evaluar({
    assetId: ASSET_ID,
    methodologyVersion: 'met-0.1',
    factores: factores({ PERDIDA_POTENCIAL: 5, LIQUIDEZ: 5 }),
    responsable: comite,
    enUTC: T1,
  });
  assert.equal(e.nivel, 'SIN_EVALUAR');
  assert.notEqual(e.nivel, 'R5');
  assert.deepEqual(
    [...e.factoresSinDatos].sort(),
    ['CALIDAD_INFORMACION', 'COMPLEJIDAD', 'CONCENTRACION'],
  );
});

test('sin metodologia, sin responsable o sin fecha tambien da SIN_EVALUAR', () => {
  const sinMetodologia = evaluar({
    assetId: ASSET_ID,
    methodologyVersion: null,
    factores: completos,
    responsable: comite,
    enUTC: T1,
  });
  assert.equal(sinMetodologia.nivel, 'SIN_EVALUAR');
  assert.ok(sinMetodologia.factoresSinDatos.includes('METODOLOGIA_AUSENTE'));

  const sinResponsable = evaluar({
    assetId: ASSET_ID,
    methodologyVersion: 'met-0.1',
    factores: completos,
    responsable: null,
    enUTC: T1,
  });
  assert.equal(sinResponsable.nivel, 'SIN_EVALUAR');

  const sinFecha = evaluar({
    assetId: ASSET_ID,
    methodologyVersion: 'met-0.1',
    factores: completos,
    responsable: comite,
    enUTC: null,
  });
  assert.equal(sinFecha.nivel, 'SIN_EVALUAR');
});

test('un valor de factor fuera de escala cuenta como sin datos', () => {
  const e = evaluar({
    assetId: ASSET_ID,
    methodologyVersion: 'met-0.1',
    factores: factores({
      PERDIDA_POTENCIAL: 9,
      LIQUIDEZ: 2,
      COMPLEJIDAD: 2,
      CONCENTRACION: 1,
      CALIDAD_INFORMACION: 2,
    }),
    responsable: comite,
    enUTC: T1,
  });
  assert.equal(e.nivel, 'SIN_EVALUAR');
  assert.deepEqual(e.factoresSinDatos, ['PERDIDA_POTENCIAL']);
});

test('un cambio de nivel exige motivo y queda en el historial', () => {
  const anterior = evaluar({
    assetId: ASSET_ID,
    methodologyVersion: 'met-0.1',
    factores: completos,
    responsable: comite,
    enUTC: T1,
  });
  const peores = factores({
    PERDIDA_POTENCIAL: 5,
    LIQUIDEZ: 4,
    COMPLEJIDAD: 3,
    CONCENTRACION: 2,
    CALIDAD_INFORMACION: 2,
  });

  const sinMotivo = evaluarRiesgo({
    assetId: ASSET_ID,
    methodologyVersion: 'met-0.2',
    factores: peores,
    responsable: comite,
    enUTC: T1,
    anterior,
  });
  assert.equal(sinMotivo.ok, false);
  if (sinMotivo.ok) throw new Error('inesperado');
  assert.equal(sinMotivo.codigo, 'REVIEW_REQUIRED');

  const conMotivo = evaluar({
    assetId: ASSET_ID,
    methodologyVersion: 'met-0.2',
    factores: peores,
    responsable: comite,
    enUTC: T1,
    anterior,
    motivo: 'deterioro observado en la evidencia sintetica',
  });
  assert.equal(conMotivo.nivel, 'R5');
  assert.equal(conMotivo.historial.length, 1);
  assert.equal(conMotivo.historial[0]!.desde, 'R3');
  assert.equal(conMotivo.historial[0]!.hacia, 'R5');
  assert.equal(conMotivo.historial[0]!.methodologyVersion, 'met-0.2');
});

test('los textos hablan de perdida, liquidez y complejidad y no prometen ganancia', () => {
  const niveles: ReadonlyArray<Record<string, number>> = [
    { PERDIDA_POTENCIAL: 1, LIQUIDEZ: 1, COMPLEJIDAD: 1, CONCENTRACION: 1, CALIDAD_INFORMACION: 1 },
    { PERDIDA_POTENCIAL: 3, LIQUIDEZ: 3, COMPLEJIDAD: 3, CONCENTRACION: 3, CALIDAD_INFORMACION: 3 },
    { PERDIDA_POTENCIAL: 5, LIQUIDEZ: 5, COMPLEJIDAD: 5, CONCENTRACION: 5, CALIDAD_INFORMACION: 5 },
  ];
  for (const v of niveles) {
    const e = evaluar({
      assetId: ASSET_ID,
      methodologyVersion: 'met-0.1',
      factores: factores(v),
      responsable: comite,
      enUTC: T1,
    });
    const texto = textoPresentacion(e);
    assert.equal(contienePromesaDeGanancia(texto), null, texto);
    assert.match(texto.toLowerCase(), /p[eé]rdida|perdida/);
    assert.match(texto.toLowerCase(), /liquidez/);
    assert.match(texto.toLowerCase(), /complej/);
  }
});

test('el texto de SIN_EVALUAR no insinua riesgo bajo ni promete nada', () => {
  const e = evaluar({
    assetId: ASSET_ID,
    methodologyVersion: null,
    factores: [],
    responsable: null,
    enUTC: null,
  });
  const texto = textoPresentacion(e);
  assert.equal(contienePromesaDeGanancia(texto), null);
  assert.match(texto, /no significa riesgo bajo/);
});

test('el detector de promesas reconoce vocabulario prohibido', () => {
  assert.equal(contienePromesaDeGanancia('rentabilidad garantizada del 10%'), 'rentabilidad garantizada');
  assert.equal(contienePromesaDeGanancia('inversion sin riesgo'), 'sin riesgo');
});
