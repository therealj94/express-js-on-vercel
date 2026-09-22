/* Keccak-256 contra vectores conocidos, y el checksum EIP-55.
 *
 * Esta suite existe porque el hash está escrito a mano. Si alguna vez alguien
 * lo cambia y se equivoca, estas cinco líneas lo detienen antes de que una
 * dirección mal validada llegue a producción. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256Hex } from '../keccak.js';
import { aChecksum, normalizarDireccion, esFormaDeDireccion, mismaDireccion } from '../direccion.js';
import { ErrorSFSP } from '../codigos.js';

test('vectores conocidos de Keccak-256', () => {
  assert.equal(
    keccak256Hex(''),
    'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
  );
  assert.equal(
    keccak256Hex('abc'),
    '4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45',
  );
  assert.equal(
    keccak256Hex('The quick brown fox jumps over the lazy dog'),
    '4d741b6f1eb29cb2a9b9911c82f56fa8d73b04959d3d9d222895df6c0b28aa15',
  );
  /* Un mensaje más largo que la tasa de absorción, para ejercitar varios bloques. */
  assert.equal(
    keccak256Hex('a'.repeat(200)).length,
    64,
  );
  assert.notEqual(keccak256Hex('a'.repeat(135)), keccak256Hex('a'.repeat(136)));
});

test('EIP-55: los vectores de la propia norma', () => {
  const vectores = [
    '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
    '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
    '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
  ];
  for (const v of vectores) {
    assert.equal(aChecksum(v.toLowerCase()), v);
    assert.equal(normalizarDireccion(v), v);
    assert.equal(normalizarDireccion(v.toLowerCase()), v);
    assert.equal(normalizarDireccion('0x' + v.slice(2).toUpperCase()), v);
  }
});

test('una dirección con checksum mezclado que no cuadra se rechaza', () => {
  const buena = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
  /* Se cambia una sola mayúscula: la forma sigue siendo válida como hex, pero
     el checksum ya no cuadra. Es exactamente el caso de la dirección que
     circuló en los documentos con las mayúsculas equivocadas. */
  const mala = '0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
  assert.notEqual(mala, buena);
  assert.ok(esFormaDeDireccion(mala));
  assert.throws(() => normalizarDireccion(mala), ErrorSFSP);

  /* Y sigue siendo la misma dirección a efectos de comparación. */
  assert.ok(mismaDireccion(mala, buena));
});

test('lo que no tiene forma de dirección se rechaza', () => {
  assert.equal(esFormaDeDireccion('0x123'), false);
  assert.equal(esFormaDeDireccion('5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'), false);
  assert.throws(() => normalizarDireccion('0xZZZZb6053F3E94C9b9A09f33669435E7Ef1BeAed'), ErrorSFSP);
});
