import test from 'node:test';
import assert from 'node:assert/strict';

import { Checkpoint } from '../checkpoint.js';
import { LectorEnMemoria, reconciliar, type VistaIndice } from '../reconcile.js';
import { CHAIN_ID_PRUEBA, construirCadena, hashSintetico } from './ayudas.js';

function vistaDe(cp: Checkpoint): VistaIndice {
  const historial = cp.historialRetenido;
  return {
    punta: cp.posicion,
    hashEnAltura: (altura) =>
      historial.find((h) => h.blockNumber === altura)?.blockHash ?? null,
  };
}

test('indice al dia y en la misma rama devuelve OK', async () => {
  const cadena = construirCadena('a', 1, 10);
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA });
  for (const h of cadena) cp.aplicar(h);
  const lector = new LectorEnMemoria(CHAIN_ID_PRUEBA, cadena);

  const r = await reconciliar(vistaDe(cp), lector);
  assert.equal(r.estado, 'OK');
  if (r.estado !== 'OK') throw new Error('estado inesperado');
  assert.equal(r.alturaIndice, 10);
  assert.equal(r.alturaCadena, 10);
});

test('indice atrasado devuelve RETRASADO con cuantos bloques', async () => {
  const cadena = construirCadena('a', 1, 20);
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA });
  for (const h of cadena.slice(0, 13)) cp.aplicar(h);
  const lector = new LectorEnMemoria(CHAIN_ID_PRUEBA, cadena);

  const r = await reconciliar(vistaDe(cp), lector);
  assert.equal(r.estado, 'RETRASADO');
  if (r.estado !== 'RETRASADO') throw new Error('estado inesperado');
  assert.equal(r.alturaIndice, 13);
  assert.equal(r.alturaCadena, 20);
  assert.equal(r.bloquesDeRetraso, 7);
});

test('indice en otra rama devuelve DIVERGENTE con el primer bloque que no cuadra', async () => {
  const ramaA = construirCadena('a', 1, 10);
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA });
  for (const h of ramaA) cp.aplicar(h);

  // La cadena real comparte hasta el 6 y diverge desde el 7.
  const real = [
    ...ramaA.slice(0, 6),
    ...construirCadena('b', 7, 10, hashSintetico('a', 6)),
  ];
  const lector = new LectorEnMemoria(CHAIN_ID_PRUEBA, real);

  const r = await reconciliar(vistaDe(cp), lector);
  assert.equal(r.estado, 'DIVERGENTE');
  if (r.estado !== 'DIVERGENTE') throw new Error('estado inesperado');
  assert.equal(r.primerBloqueDivergente, 7);
  assert.equal(r.hashIndexado, hashSintetico('a', 7));
  assert.equal(r.hashCadena, hashSintetico('b', 7));
});

test('la divergencia se reporta aunque el indice tambien este atrasado', async () => {
  const ramaA = construirCadena('a', 1, 8);
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA });
  for (const h of ramaA) cp.aplicar(h);
  const real = [
    ...ramaA.slice(0, 5),
    ...construirCadena('b', 6, 30, hashSintetico('a', 5)),
  ];
  const r = await reconciliar(vistaDe(cp), new LectorEnMemoria(CHAIN_ID_PRUEBA, real));
  assert.equal(r.estado, 'DIVERGENTE');
});

test('fuente caida devuelve UNKNOWN_SOURCE, nunca cero ni OK', async () => {
  const cadena = construirCadena('a', 1, 10);
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA });
  for (const h of cadena) cp.aplicar(h);

  for (const modo of ['NULL', 'LANZA'] as const) {
    const lector = new LectorEnMemoria(CHAIN_ID_PRUEBA, cadena);
    lector.caer(modo);
    const r = await reconciliar(vistaDe(cp), lector);
    assert.equal(r.estado, 'UNKNOWN_SOURCE');
    if (r.estado !== 'UNKNOWN_SOURCE') throw new Error('estado inesperado');
    assert.equal(r.alturaIndice, 10);
    assert.ok(r.motivo.length > 0);
    // No hay ningun campo que pueda confundirse con "cero bloques de retraso".
    assert.ok(!('bloquesDeRetraso' in r));
  }
});

test('indice vacio no es OK: es UNKNOWN_SOURCE', async () => {
  const lector = new LectorEnMemoria(CHAIN_ID_PRUEBA, construirCadena('a', 1, 3));
  const r = await reconciliar(
    { punta: null, hashEnAltura: () => null },
    lector,
  );
  assert.equal(r.estado, 'UNKNOWN_SOURCE');
});

test('lector de otra cadena da UNKNOWN_SOURCE', async () => {
  const cadena = construirCadena('a', 1, 3);
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA });
  for (const h of cadena) cp.aplicar(h);
  const r = await reconciliar(vistaDe(cp), new LectorEnMemoria(999, []));
  assert.equal(r.estado, 'UNKNOWN_SOURCE');
});
