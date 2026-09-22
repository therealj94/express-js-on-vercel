import test from 'node:test';
import assert from 'node:assert/strict';

import { IndiceDedupe, claveDe } from '../dedupe.js';
import { ErrorIndexador } from '../tipos.js';
import { CHAIN_ID_PRUEBA, hashSintetico, log } from './ayudas.js';

const lote = [
  log({ firma: 'MintExecuted', blockNumber: 4, txHash: '0xTX_A', logIndex: 0 }),
  log({ firma: 'MintExecuted', blockNumber: 4, txHash: '0xTX_A', logIndex: 1 }),
  log({ firma: 'BurnExecuted', blockNumber: 4, txHash: '0xTX_B', logIndex: 0 }),
];

test('la clave usa exactamente (chainId, blockHash, txHash, logIndex)', () => {
  assert.equal(
    claveDe(lote[0]!),
    `${CHAIN_ID_PRUEBA}|${hashSintetico('a', 4)}|0xTX_A|0`,
  );
});

test('reprocesar el mismo lote dos veces no duplica filas', () => {
  const indice = new IndiceDedupe();
  const primera = indice.ingerir(lote);
  assert.equal(primera.nuevos.length, 3);
  assert.equal(primera.duplicados.length, 0);
  assert.equal(indice.tamano, 3);

  const segunda = indice.ingerir(lote);
  assert.equal(segunda.nuevos.length, 0);
  assert.equal(segunda.duplicados.length, 3);
  assert.equal(indice.tamano, 3);
});

test('un lote que repite un log internamente tampoco lo duplica', () => {
  const indice = new IndiceDedupe();
  const r = indice.ingerir([lote[0]!, lote[0]!, lote[1]!]);
  assert.equal(r.nuevos.length, 2);
  assert.equal(r.duplicados.length, 1);
});

test('el mismo txHash en otro blockHash es otra fila (rama distinta)', () => {
  const indice = new IndiceDedupe();
  indice.ingerir([lote[0]!]);
  const enOtraRama = log({
    firma: 'MintExecuted',
    blockNumber: 4,
    blockHash: hashSintetico('b', 4),
    txHash: '0xTX_A',
    logIndex: 0,
  });
  const r = indice.ingerir([enOtraRama]);
  assert.equal(r.nuevos.length, 1);
  assert.equal(indice.tamano, 2);
});

test('revertir un bloque saca sus logs del indice', () => {
  const indice = new IndiceDedupe();
  indice.ingerir(lote);
  const quitados = indice.revertirBloque(CHAIN_ID_PRUEBA, hashSintetico('a', 4));
  assert.equal(quitados, 3);
  assert.equal(indice.tamano, 0);
  // Tras revertir, el mismo log vuelve a ser nuevo: se puede reindexar.
  assert.equal(indice.ingerir(lote).nuevos.length, 3);
});

test('una clave con componente vacio se rechaza con codigo', () => {
  assert.throws(
    () => claveDe({ chainId: 1, blockHash: '', txHash: '0xTX', logIndex: 0 }),
    (e: unknown) => e instanceof ErrorIndexador && e.codigo === 'HASH_INVALIDO',
  );
});
