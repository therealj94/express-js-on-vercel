import test from 'node:test';
import assert from 'node:assert/strict';

import {
  crearCaso,
  transicionar,
  transicionesDesde,
  type Caso,
  type EstadoCaso,
} from '../casos.js';
import { relojFijo } from '../tipos.js';
import {
  analista,
  CASE_ID,
  comite,
  cumplimiento,
  ISSUER_ID,
  reloj,
  revisor,
  solicitante,
  T1,
} from './ayudas.js';

function nuevo(): Caso {
  const r = crearCaso(CASE_ID, ISSUER_ID, reloj);
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('no deberia fallar');
  return r.valor;
}

function avanzar(caso: Caso, hacia: EstadoCaso, actor = analista): Caso {
  const r = transicionar(caso, hacia, actor, 'motivo sintetico de prueba', reloj);
  assert.equal(r.ok, true, `transicion ${caso.estado}->${hacia} deberia pasar`);
  if (!r.ok) throw new Error('no deberia fallar');
  return r.valor;
}

test('un caso nuevo nace en DRAFT y no autoriza emision', () => {
  const c = nuevo();
  assert.equal(c.estado, 'DRAFT');
  assert.equal(c.autorizaEmision, false);
  assert.equal(c.historial.length, 0);
});

test('cada transicion valida se acepta y registra actor, rol, motivo y marca', () => {
  const validas: ReadonlyArray<[EstadoCaso, EstadoCaso, typeof analista]> = [
    ['DRAFT', 'REVIEW', solicitante],
    ['REVIEW', 'NEEDS_INFO', revisor],
    ['NEEDS_INFO', 'REVIEW', analista],
    ['REVIEW', 'APPROVED', comite],
  ];
  let c = nuevo();
  for (const [desde, hacia, actor] of validas) {
    assert.equal(c.estado, desde);
    c = avanzar(c, hacia, actor);
    const ultima = c.historial[c.historial.length - 1]!;
    assert.equal(ultima.desde, desde);
    assert.equal(ultima.hacia, hacia);
    assert.equal(ultima.actorId, actor.actorId);
    assert.equal(ultima.rol, actor.rol);
    assert.equal(ultima.motivo, 'motivo sintetico de prueba');
    assert.equal(ultima.enUTC, T1);
  }
  assert.equal(c.estado, 'APPROVED');
  assert.equal(c.historial.length, 4);
  // Aprobar el caso NO autoriza emitir.
  assert.equal(c.autorizaEmision, false);
});

test('REVIEW -> REJECTED y NEEDS_INFO -> REJECTED son validas', () => {
  const enReview = avanzar(nuevo(), 'REVIEW', solicitante);
  assert.equal(avanzar(enReview, 'REJECTED', comite).estado, 'REJECTED');
  const enInfo = avanzar(enReview, 'NEEDS_INFO', revisor);
  assert.equal(avanzar(enInfo, 'REJECTED', cumplimiento).estado, 'REJECTED');
});

test('cada transicion invalida se rechaza por codigo', () => {
  const invalidas: ReadonlyArray<[EstadoCaso, EstadoCaso]> = [
    ['DRAFT', 'APPROVED'],
    ['DRAFT', 'REJECTED'],
    ['DRAFT', 'NEEDS_INFO'],
    ['DRAFT', 'DRAFT'],
    ['REVIEW', 'DRAFT'],
    ['NEEDS_INFO', 'APPROVED'],
    ['NEEDS_INFO', 'NEEDS_INFO'],
  ];
  for (const [desde, hacia] of invalidas) {
    const caso: Caso = { ...nuevo(), estado: desde };
    const r = transicionar(caso, hacia, comite, 'intento sintetico', reloj);
    assert.equal(r.ok, false, `${desde}->${hacia} no deberia pasar`);
    if (r.ok) throw new Error('inesperado');
    assert.equal(r.codigo, 'DENY_ASSET_STATE');
  }
});

test('desde un estado terminal no sale ninguna transicion', () => {
  for (const terminal of ['APPROVED', 'REJECTED'] as const) {
    assert.deepEqual(transicionesDesde(terminal), []);
    const caso: Caso = { ...nuevo(), estado: terminal };
    for (const hacia of ['DRAFT', 'REVIEW', 'NEEDS_INFO'] as const) {
      const r = transicionar(caso, hacia, comite, 'reabrir', reloj);
      assert.equal(r.ok, false);
      if (r.ok) throw new Error('inesperado');
      assert.equal(r.codigo, 'DENY_ASSET_STATE');
    }
  }
});

test('un rol sin competencia no puede aprobar aunque la transicion exista', () => {
  const enReview = avanzar(nuevo(), 'REVIEW', solicitante);
  const r = transicionar(enReview, 'APPROVED', analista, 'intento', reloj);
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'DENY_ELIGIBILITY');
});

test('una transicion sin motivo se rechaza', () => {
  const c = nuevo();
  const r = transicionar(c, 'REVIEW', solicitante, '  ', reloj);
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'REVIEW_REQUIRED');
});

test('transicionar no muta el caso anterior: el historial no se reescribe', () => {
  const c = nuevo();
  const avanzado = avanzar(c, 'REVIEW', solicitante);
  assert.equal(c.estado, 'DRAFT');
  assert.equal(c.historial.length, 0);
  assert.equal(avanzado.historial.length, 1);
});

test('un caseId con forma invalida se rechaza', () => {
  const r = crearCaso('case_mal', ISSUER_ID, reloj);
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'DENY_POLICY');
});

test('un reloj que no devuelve ISO UTC da UNKNOWN_SOURCE', () => {
  const r = crearCaso(CASE_ID, ISSUER_ID, relojFijo('ayer'));
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'UNKNOWN_SOURCE');
});
