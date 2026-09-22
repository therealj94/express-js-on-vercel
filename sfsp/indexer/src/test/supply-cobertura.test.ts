// H15, segunda parte: suministro honesto.
//
// Estas pruebas reproducen literalmente los dos casos que el informe de
// auditoria consiguio provocar, y exigen el comportamiento corregido. Si
// alguien vuelve a ignorar la marca `completo` o a etiquetar de
// `CHAIN_TOTALSUPPLY` una cifra reconstruida de eventos, esto se cae.

import test from 'node:test';
import assert from 'node:assert/strict';

import { decodificarLote } from '../decode.js';
import { agregarSuministro, TesoreriaEnMemoria } from '../supply.js';
import { log } from './ayudas.js';

const ACTIVO = 'SFSP:MON:iss_sintetico:S1';

function tesoreria(saldo: bigint): TesoreriaEnMemoria {
  return new TesoreriaEnMemoria({ [ACTIVO]: saldo });
}

test('caso del informe: mint 100 y burn 40 sin assetId NO deja emitido 100 conocido', () => {
  // El contrato emitia `BurnExecuted(from, amount, reasonCode, operationId)`:
  // sin `assetId` el burn no se podia atribuir y se descartaba en silencio, de
  // modo que el emitido quedaba en 100 y marcado como conocido. Eso es mentir
  // con un numero: faltaba cobertura.
  const registros = decodificarLote([
    log({
      firma: 'MintExecuted',
      logIndex: 0,
      parametros: {
        assetId: ACTIVO,
        authorizationId: 'auth_sintetica',
        destination: '0xTEST_DESTINO',
        amount: '100',
        operationId: 'op_sintetica_1',
        evidenceRoot: '0xTEST_EVIDENCIA',
      },
    }),
    log({
      firma: 'BurnExecuted',
      logIndex: 1,
      parametros: {
        // Sin assetId, tal como emitia el contrato.
        from: '0xTEST_TITULAR',
        amount: '40',
        reasonCode: 'MOTIVO_SINTETICO',
        operationId: 'op_sintetica_2',
      },
    }),
  ]);

  const s = agregarSuministro(ACTIVO, registros, { tesoreria: tesoreria(0n) });

  assert.notEqual(s.emitido.valor, '100');
  assert.equal(s.emitido.valor, null);
  assert.equal(s.emitido.origen, 'UNKNOWN');
  assert.equal(s.parcial, true);
  assert.ok(s.huecosDeCobertura.length > 0);
  assert.match(s.huecosDeCobertura.join(' '), /BurnExecuted/);
});

test('caso del informe: un mint incompleto por 999 no se agrega como conocido', () => {
  const registros = decodificarLote([
    log({
      firma: 'MintExecuted',
      logIndex: 0,
      parametros: {
        assetId: ACTIVO,
        amount: '999',
        // Faltan authorizationId, destination, operationId y evidenceRoot.
      },
    }),
  ]);

  const s = agregarSuministro(ACTIVO, registros, { tesoreria: tesoreria(0n) });

  assert.notEqual(s.emitido.valor, '999');
  assert.equal(s.emitido.valor, null);
  assert.equal(s.emitido.origen, 'UNKNOWN');
  assert.equal(s.parcial, true);
  assert.match(s.huecosDeCobertura.join(' '), /incompleto/);
});

test('con el burn ya atribuido al activo, la resta se hace y la cifra es REGISTRY', () => {
  const registros = decodificarLote([
    log({
      firma: 'MintExecuted',
      logIndex: 0,
      parametros: {
        assetId: ACTIVO,
        authorizationId: 'auth_sintetica',
        destination: '0xTEST_DESTINO',
        amount: '100',
        operationId: 'op_sintetica_1',
        evidenceRoot: '0xTEST_EVIDENCIA',
      },
    }),
    log({
      firma: 'BurnExecuted',
      logIndex: 1,
      parametros: {
        assetId: ACTIVO,
        from: '0xTEST_TITULAR',
        amount: '40',
        reasonCode: 'MOTIVO_SINTETICO',
        operationId: 'op_sintetica_2',
      },
    }),
  ]);

  const s = agregarSuministro(ACTIVO, registros, { tesoreria: tesoreria(10n) });
  assert.equal(s.emitido.valor, '60');
  assert.equal(s.emitido.origen, 'REGISTRY');
  assert.equal(s.circulante.valor, '50');
  assert.deepEqual(s.huecosDeCobertura, []);
});

test('ninguna cifra derivada de eventos se etiqueta CHAIN_TOTALSUPPLY', () => {
  const registros = decodificarLote([
    log({
      firma: 'SupplyAuthorized',
      logIndex: 0,
      parametros: {
        assetId: ACTIVO,
        authorizationId: 'auth_sintetica',
        amount: '1000',
        expiry: '2030-01-01T00:00:00Z',
      },
    }),
    log({
      firma: 'MintExecuted',
      logIndex: 1,
      parametros: {
        assetId: ACTIVO,
        authorizationId: 'auth_sintetica',
        destination: '0xTEST_DESTINO',
        amount: '500',
        operationId: 'op_sintetica_1',
        evidenceRoot: '0xTEST_EVIDENCIA',
      },
    }),
  ]);

  const s = agregarSuministro(ACTIVO, registros, { tesoreria: tesoreria(100n) });
  for (const cifra of [s.autorizado, s.emitido, s.tesoreria, s.circulante]) {
    assert.notEqual(
      cifra.origen,
      'CHAIN_TOTALSUPPLY',
      'CHAIN_TOTALSUPPLY significa una lectura directa de totalSupply(), y aqui no se lee la cadena',
    );
  }
  assert.equal(s.autorizado.origen, 'REGISTRY');
  assert.equal(s.emitido.origen, 'REGISTRY');
});

test('un evento de otro activo no contamina ni aporta', () => {
  const registros = decodificarLote([
    log({
      firma: 'MintExecuted',
      logIndex: 0,
      parametros: {
        assetId: 'SFSP:SEC:iss_otro:S9',
        authorizationId: 'auth_sintetica',
        destination: '0xTEST_DESTINO',
        amount: '7',
        operationId: 'op_sintetica_9',
        evidenceRoot: '0xTEST_EVIDENCIA',
      },
    }),
  ]);
  const s = agregarSuministro(ACTIVO, registros, { tesoreria: tesoreria(0n) });
  assert.deepEqual(s.huecosDeCobertura, []);
  assert.equal(s.emitido.valor, null);
  assert.match(s.emitido.motivo ?? '', /no se observo emision/);
});

test('un evento global no atribuible a activo no vuelve desconocido el suministro', () => {
  const registros = decodificarLote([
    log({
      firma: 'MintExecuted',
      logIndex: 0,
      parametros: {
        assetId: ACTIVO,
        authorizationId: 'auth_sintetica',
        destination: '0xTEST_DESTINO',
        amount: '10',
        operationId: 'op_sintetica_1',
        evidenceRoot: '0xTEST_EVIDENCIA',
      },
    }),
    log({
      firma: 'GovernanceAction',
      logIndex: 1,
      parametros: {
        operationId: 'op_sintetica_gov',
        actionKind: 'PAUSE',
        actor: '0xTEST_ACTOR',
        detail: '0xTEST_DETALLE',
        effectiveAt: '1',
      },
    }),
  ]);
  const s = agregarSuministro(ACTIVO, registros, { tesoreria: tesoreria(0n) });
  assert.equal(s.emitido.valor, '10');
  assert.deepEqual(s.huecosDeCobertura, []);
});

test('quemar mas de lo emitido en la ventana no da un emitido negativo: da desconocido', () => {
  const registros = decodificarLote([
    log({
      firma: 'BurnExecuted',
      logIndex: 0,
      parametros: {
        assetId: ACTIVO,
        from: '0xTEST_TITULAR',
        amount: '5',
        reasonCode: 'MOTIVO_SINTETICO',
        operationId: 'op_sintetica_2',
      },
    }),
  ]);
  const s = agregarSuministro(ACTIVO, registros, { tesoreria: tesoreria(0n) });
  assert.equal(s.emitido.valor, null);
  assert.match(s.emitido.motivo ?? '', /ventana/);
});
