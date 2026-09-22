import test from 'node:test';
import assert from 'node:assert/strict';

import { decodificar, decodificarLote, EVENTOS_CONOCIDOS } from '../decode.js';
import { log } from './ayudas.js';

test('los quince eventos del §3 estan registrados', () => {
  assert.equal(Object.keys(EVENTOS_CONOCIDOS).length, 15);
  assert.equal(EVENTOS_CONOCIDOS.MintExecuted, 'IssuanceController');
  assert.equal(EVENTOS_CONOCIDOS.RiskChanged, 'AssetRegistry');
});

test('un evento conocido se decodifica a registro tipado y completo', () => {
  const r = decodificar(
    log({
      firma: 'MintExecuted',
      parametros: {
        authorizationId: 'auth_0000000000000000000000000000abcd',
        assetId: 'SFSP:SEC:iss_demo:S1',
        amount: '1000',
        destination: 'SF-1111-2222-3333-9',
      },
    }),
  );
  assert.equal(r.tipo, 'DECODIFICADO');
  if (r.tipo !== 'DECODIFICADO') throw new Error('tipo inesperado');
  assert.equal(r.evento, 'MintExecuted');
  assert.equal(r.emisorEsperado, 'IssuanceController');
  assert.equal(r.completo, true);
  assert.equal(r.campos['amount'], '1000');
});

test('un evento desconocido se conserva como crudo con su firma, no se descarta', () => {
  const r = decodificar(
    log({
      firma: 'EventoQueTodaviaNoExiste',
      topics: ['0xdeadbeefsintetico', '0xparam'],
      data: '0xcarga',
    }),
  );
  assert.equal(r.tipo, 'CRUDO');
  if (r.tipo !== 'CRUDO') throw new Error('tipo inesperado');
  assert.equal(r.firma, 'EventoQueTodaviaNoExiste');
  assert.equal(r.motivo, 'EVENTO_DESCONOCIDO');
  // La carga original queda intacta para poder redecodificar mas adelante.
  assert.deepEqual(r.topics, ['0xdeadbeefsintetico', '0xparam']);
  assert.equal(r.data, '0xcarga');
});

test('un campo requerido ausente marca el registro incompleto, no lo descarta', () => {
  const r = decodificar(log({ firma: 'BurnExecuted', parametros: { assetId: 'SFSP:MON:iss_demo:S1' } }));
  assert.equal(r.tipo, 'DECODIFICADO');
  if (r.tipo !== 'DECODIFICADO') throw new Error('tipo inesperado');
  assert.equal(r.completo, false);
  assert.deepEqual([...r.camposFaltantes].sort(), ['amount', 'motivo']);
});

test('una cantidad con coma flotante no se corrige a cero: se marca invalida', () => {
  const r = decodificar(
    log({
      firma: 'TreasuryReleased',
      parametros: { assetId: 'SFSP:MON:iss_demo:S1', amount: '10.5', destination: 'SF-0000-0000-0000-0' },
    }),
  );
  assert.equal(r.tipo, 'DECODIFICADO');
  if (r.tipo !== 'DECODIFICADO') throw new Error('tipo inesperado');
  assert.deepEqual(r.cantidadesInvalidas, ['amount']);
  assert.equal(r.completo, false);
  assert.equal(r.campos['amount'], '10.5');
});

test('el lote conserva el orden y mezcla decodificados con crudos', () => {
  const rs = decodificarLote([
    log({ firma: 'ReserveExpired', logIndex: 0, parametros: { reserveAssetId: 'res_1' } }),
    log({ firma: 'OtroEvento', logIndex: 1 }),
  ]);
  assert.equal(rs.length, 2);
  assert.equal(rs[0]!.tipo, 'DECODIFICADO');
  assert.equal(rs[1]!.tipo, 'CRUDO');
});
