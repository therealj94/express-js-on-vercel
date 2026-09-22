// H14: reorganizaciones que no inventan continuidad.
//
// Los tres defectos del informe, cada uno con su prueba:
//   1. A1..A5 seguida de B6 cuyo padre B5 no se suministro se aceptaba.
//   2. Una reorganizacion profunda podia lanzar DESPUES de borrar el historial.
//   3. La conciliacion podia devolver OK comparando solo alturas.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Checkpoint } from '../checkpoint.js';
import { LectorEnMemoria, reconciliar, type VistaIndice } from '../reconcile.js';
import { ErrorIndexador } from '../tipos.js';
import { CHAIN_ID_PRUEBA, construirCadena, hashSintetico } from './ayudas.js';

function vistaDe(cp: Checkpoint): VistaIndice {
  return { punta: cp.posicion, hashEnAltura: (a) => cp.hashEnAltura(a) };
}

test('A1..A5 seguida de B6 sin B5 es un hueco, no una reorganizacion', () => {
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA });
  for (const h of construirCadena('a', 1, 5)) cp.aplicar(h);

  // B6 dice descender de B5, que nunca se suministro.
  const b6 = {
    chainId: CHAIN_ID_PRUEBA,
    blockNumber: 6,
    blockHash: hashSintetico('b', 6),
    parentHash: hashSintetico('b', 5),
  };

  assert.throws(
    () => cp.aplicar(b6),
    (e: unknown) => {
      assert.ok(e instanceof ErrorIndexador);
      assert.equal(e.codigo, 'GAP_DETECTADO');
      return true;
    },
  );

  // Y el indice queda exactamente como estaba: nada de alturas [1,2,3,4,6].
  assert.equal(cp.posicion?.blockNumber, 5);
  assert.equal(cp.posicion?.blockHash, hashSintetico('a', 5));
  assert.deepEqual(
    cp.historialRetenido.map((h) => h.blockNumber),
    [1, 2, 3, 4, 5],
  );
});

test('con las cabeceras completas de la rama nueva, la reorganizacion si se acepta', () => {
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA });
  for (const h of construirCadena('a', 1, 5)) cp.aplicar(h);

  // Ahora se suministran B5 y B6: la rama enlaza con A4 por identidad.
  const ramaB = construirCadena('b', 5, 6, hashSintetico('a', 4));
  const r = cp.aplicarRama(ramaB);

  assert.equal(r.tipo, 'REORG');
  if (r.tipo !== 'REORG') throw new Error('tipo inesperado');
  assert.equal(r.ancestroComun.blockNumber, 4);
  assert.equal(r.ancestroComun.blockHash, hashSintetico('a', 4));
  assert.deepEqual(
    r.revertidos.map((x) => x.blockNumber),
    [5],
  );
  assert.deepEqual(
    cp.historialRetenido.map((h) => h.blockHash),
    [
      hashSintetico('a', 1),
      hashSintetico('a', 2),
      hashSintetico('a', 3),
      hashSintetico('a', 4),
      hashSintetico('b', 5),
      hashSintetico('b', 6),
    ],
  );
});

test('una rama que no es contigua consigo misma se rechaza antes de tocar nada', () => {
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA });
  for (const h of construirCadena('a', 1, 5)) cp.aplicar(h);

  const rota = [
    ...construirCadena('b', 5, 5, hashSintetico('a', 4)),
    // Salta el 6 y declara como padre a B5: no es contigua.
    {
      chainId: CHAIN_ID_PRUEBA,
      blockNumber: 7,
      blockHash: hashSintetico('b', 7),
      parentHash: hashSintetico('b', 5),
    },
  ];

  assert.throws(
    () => cp.aplicarRama(rota),
    (e: unknown) => e instanceof ErrorIndexador && e.codigo === 'RAMA_INVALIDA',
  );
  assert.equal(cp.posicion?.blockHash, hashSintetico('a', 5));
});

test('una reorganizacion que excede la ventana escala y NO borra el historial', () => {
  // Este es el defecto 2: antes la excepcion se lanzaba despues de haber hecho
  // `pop()` sobre el historial, y el indice quedaba peor que antes del error.
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA, profundidadRetenida: 3 });
  for (const h of construirCadena('a', 1, 10)) cp.aplicar(h);
  const antes = cp.historialRetenido.map((h) => h.blockHash);
  assert.deepEqual(antes, [
    hashSintetico('a', 8),
    hashSintetico('a', 9),
    hashSintetico('a', 10),
  ]);

  const ramaB = construirCadena('b', 5, 5, hashSintetico('a', 4));
  assert.throws(
    () => cp.aplicarRama(ramaB),
    (e: unknown) =>
      e instanceof ErrorIndexador && e.codigo === 'REORG_SIN_ANCESTRO',
  );

  // Atomicidad: ni un bloque revertido.
  assert.deepEqual(
    cp.historialRetenido.map((h) => h.blockHash),
    antes,
  );
  assert.equal(cp.posicion?.blockNumber, 10);
});

test('una rama que repite lo ya aplicado es idempotente y no revierte nada', () => {
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA });
  const cadena = construirCadena('a', 1, 5);
  for (const h of cadena) cp.aplicar(h);
  const r = cp.aplicarRama(cadena.slice(2));
  assert.equal(r.tipo, 'DUPLICADO');
  assert.equal(cp.posicion?.blockNumber, 5);
});

test('la conciliacion no dice OK si no comparo ninguna identidad de bloque', async () => {
  // Defecto 3: un indice que coincide en altura pero no expone ningun hash.
  const cadena = construirCadena('a', 1, 5);
  const lector = new LectorEnMemoria(CHAIN_ID_PRUEBA, cadena);
  const r = await reconciliar(
    {
      punta: { chainId: CHAIN_ID_PRUEBA, blockNumber: 5, blockHash: hashSintetico('a', 5) },
      hashEnAltura: () => null,
    },
    lector,
  );
  assert.equal(r.estado, 'UNKNOWN_SOURCE');
});

test('un hash nulo o vacio da UNKNOWN_SOURCE, nunca OK', async () => {
  const cadena = construirCadena('a', 1, 5);
  const lector = new LectorEnMemoria(CHAIN_ID_PRUEBA, cadena);

  // a) la punta del indice sin hash utilizable
  const puntaVacia: VistaIndice = {
    punta: { chainId: CHAIN_ID_PRUEBA, blockNumber: 5, blockHash: '' },
    hashEnAltura: (a) => hashSintetico('a', a),
  };
  assert.equal((await reconciliar(puntaVacia, lector)).estado, 'UNKNOWN_SOURCE');

  // b) el indice declara cubrir una altura pero con hash vacio
  const alturaVacia: VistaIndice = {
    punta: { chainId: CHAIN_ID_PRUEBA, blockNumber: 5, blockHash: hashSintetico('a', 5) },
    hashEnAltura: (a) => (a === 3 ? '   ' : hashSintetico('a', a)),
  };
  assert.equal((await reconciliar(alturaVacia, lector)).estado, 'UNKNOWN_SOURCE');

  // c) la cadena devuelve un encabezado sin hash utilizable
  const lectorRoto = new LectorEnMemoria(CHAIN_ID_PRUEBA, cadena);
  lectorRoto.agregar({
    chainId: CHAIN_ID_PRUEBA,
    blockNumber: 4,
    blockHash: '',
    parentHash: hashSintetico('a', 3),
  });
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA });
  for (const h of cadena) cp.aplicar(h);
  assert.equal((await reconciliar(vistaDe(cp), lectorRoto)).estado, 'UNKNOWN_SOURCE');
});

test('coincidir en altura con otra rama sigue siendo DIVERGENTE, no OK', async () => {
  const ramaA = construirCadena('a', 1, 5);
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA });
  for (const h of ramaA) cp.aplicar(h);
  // Misma altura de punta, rama distinta desde el 3.
  const real = [...ramaA.slice(0, 2), ...construirCadena('b', 3, 5, hashSintetico('a', 2))];
  const r = await reconciliar(vistaDe(cp), new LectorEnMemoria(CHAIN_ID_PRUEBA, real));
  assert.equal(r.estado, 'DIVERGENTE');
  if (r.estado !== 'DIVERGENTE') throw new Error('estado inesperado');
  assert.equal(r.primerBloqueDivergente, 3);
});
