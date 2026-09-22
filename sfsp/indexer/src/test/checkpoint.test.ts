import test from 'node:test';
import assert from 'node:assert/strict';

import { Checkpoint } from '../checkpoint.js';
import { ErrorIndexador } from '../tipos.js';
import { CHAIN_ID_PRUEBA, construirCadena, hashSintetico } from './ayudas.js';

test('avance lineal mueve el cursor bloque a bloque', () => {
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA });
  for (const h of construirCadena('a', 1, 5)) {
    const r = cp.aplicar(h);
    assert.equal(r.tipo, 'AVANZADO');
  }
  assert.equal(cp.posicion?.blockNumber, 5);
  assert.equal(cp.posicion?.blockHash, hashSintetico('a', 5));
});

test('reorganizacion de 3 bloques retrocede al ancestro comun y reanuda', () => {
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA });
  for (const h of construirCadena('a', 1, 10)) cp.aplicar(h);
  assert.equal(cp.posicion?.blockNumber, 10);

  // Rama b que se separa en el bloque 8: el ancestro comun es el 7.
  const ramaB = construirCadena('b', 8, 10, hashSintetico('a', 7));
  const primero = cp.aplicar(ramaB[0]!);

  assert.equal(primero.tipo, 'REORG');
  if (primero.tipo !== 'REORG') throw new Error('tipo inesperado');
  assert.equal(primero.ancestroComun.blockNumber, 7);
  assert.equal(primero.ancestroComun.blockHash, hashSintetico('a', 7));
  // Tres bloques revertidos: 10, 9 y 8 de la rama a.
  assert.equal(primero.revertidos.length, 3);
  assert.deepEqual(
    primero.revertidos.map((r) => r.blockNumber),
    [10, 9, 8],
  );
  assert.deepEqual(
    primero.revertidos.map((r) => r.blockHash),
    [hashSintetico('a', 10), hashSintetico('a', 9), hashSintetico('a', 8)],
  );
  assert.equal(primero.posicion.blockHash, hashSintetico('b', 8));

  // Reanudacion normal sobre la rama nueva.
  assert.equal(cp.aplicar(ramaB[1]!).tipo, 'AVANZADO');
  assert.equal(cp.aplicar(ramaB[2]!).tipo, 'AVANZADO');
  assert.equal(cp.posicion?.blockHash, hashSintetico('b', 10));
});

test('un hueco de bloques es un error explicito, no un salto silencioso', () => {
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA });
  for (const h of construirCadena('a', 1, 5)) cp.aplicar(h);

  const conHueco = {
    chainId: CHAIN_ID_PRUEBA,
    blockNumber: 9,
    blockHash: hashSintetico('a', 9),
    parentHash: hashSintetico('a', 8),
  };

  assert.throws(
    () => cp.aplicar(conHueco),
    (e: unknown) => {
      assert.ok(e instanceof ErrorIndexador);
      assert.equal(e.codigo, 'GAP_DETECTADO');
      assert.equal(e.detalle['esperado'], 6);
      assert.equal(e.detalle['recibido'], 9);
      assert.equal(e.detalle['faltantes'], 3);
      return true;
    },
  );
  // El cursor NO se movio: el indice no adopta una posicion no verificada.
  assert.equal(cp.posicion?.blockNumber, 5);
});

test('reaplicar el mismo bloque es idempotente', () => {
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA });
  const cadena = construirCadena('a', 1, 3);
  for (const h of cadena) cp.aplicar(h);
  const r = cp.aplicar(cadena[2]!);
  assert.equal(r.tipo, 'DUPLICADO');
  assert.equal(cp.posicion?.blockNumber, 3);
});

test('encabezado de otra cadena se rechaza con codigo', () => {
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA });
  assert.throws(
    () =>
      cp.aplicar({
        chainId: 1,
        blockNumber: 1,
        blockHash: '0xotro',
        parentHash: '0xpadre',
      }),
    (e: unknown) => e instanceof ErrorIndexador && e.codigo === 'CADENA_DISTINTA',
  );
});

test('reorganizacion mas profunda que la ventana retenida escala como incidente', () => {
  const cp = new Checkpoint({ chainId: CHAIN_ID_PRUEBA, profundidadRetenida: 3 });
  for (const h of construirCadena('a', 1, 10)) cp.aplicar(h);
  // Solo quedan los bloques 8, 9 y 10. Una rama que sale del 4 no tiene ancestro.
  const ramaB = construirCadena('b', 5, 5, hashSintetico('a', 4));
  assert.throws(
    () => cp.aplicar(ramaB[0]!),
    (e: unknown) =>
      e instanceof ErrorIndexador && e.codigo === 'REORG_SIN_ANCESTRO',
  );
});
