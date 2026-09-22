import test from 'node:test';
import assert from 'node:assert/strict';

import { decodificarLote } from '../decode.js';
import { agregarSuministro, TesoreriaEnMemoria } from '../supply.js';
import { log } from './ayudas.js';

const ACTIVO = 'SFSP:MON:iss_sintetico:S1';

const eventos = decodificarLote([
  log({
    firma: 'SupplyAuthorized',
    logIndex: 0,
    parametros: {
      authorizationId: 'auth_0000000000000000000000000000aaaa',
      assetId: ACTIVO,
      amount: '1000000',
      expiry: '2030-01-01T00:00:00Z',
    },
  }),
  log({
    firma: 'MintExecuted',
    logIndex: 1,
    parametros: {
      authorizationId: 'auth_0000000000000000000000000000aaaa',
      assetId: ACTIVO,
      amount: '400000',
      destination: 'SF-0000-0000-0001-7',
    },
  }),
  log({
    firma: 'BurnExecuted',
    logIndex: 2,
    parametros: { assetId: ACTIVO, amount: '50000', motivo: 'prueba sintetica' },
  }),
]);

test('las cuatro cifras se distinguen y cada una declara su origen', () => {
  const s = agregarSuministro(ACTIVO, eventos, {
    tesoreria: new TesoreriaEnMemoria({ [ACTIVO]: 100000n }),
    decimalsPorActivo: { [ACTIVO]: 6 },
  });

  assert.equal(s.autorizado.valor, '1000000');
  assert.equal(s.autorizado.origen, 'REGISTRY');
  assert.equal(s.emitido.valor, '350000'); // 400000 emitido - 50000 quemado
  assert.equal(s.emitido.origen, 'CHAIN_TOTALSUPPLY');
  assert.equal(s.tesoreria.valor, '100000');
  assert.equal(s.tesoreria.origen, 'CUSTODIAL_LEDGER');
  assert.equal(s.circulante.valor, '250000');
  assert.equal(s.decimals, 6);
  assert.equal(s.parcial, false);
});

test('si la tesoreria es desconocida, el circulante sale desconocido y no cero', () => {
  const fuente = new TesoreriaEnMemoria({ [ACTIVO]: 100000n });
  fuente.caer();
  const s = agregarSuministro(ACTIVO, eventos, { tesoreria: fuente });

  assert.equal(s.tesoreria.valor, null);
  assert.equal(s.tesoreria.origen, 'UNKNOWN');
  assert.equal(s.circulante.valor, null);
  assert.equal(s.circulante.origen, 'UNKNOWN');
  assert.notEqual(s.circulante.valor, '0');
  assert.equal(s.parcial, true);
  // Lo que si se sabe sigue disponible: la fuente caida bloquea solo su parte.
  assert.equal(s.emitido.valor, '350000');
});

test('sin fuente de tesoreria inyectada tampoco se asume cero', () => {
  const s = agregarSuministro(ACTIVO, eventos);
  assert.equal(s.tesoreria.valor, null);
  assert.equal(s.circulante.valor, null);
  assert.equal(s.parcial, true);
});

test('un evento sin decodificar vuelve desconocidas las cifras de cadena', () => {
  const conCrudo = decodificarLote([
    log({ firma: 'EventoNuevoNoSoportado', logIndex: 9 }),
  ]);
  const s = agregarSuministro(ACTIVO, [...eventos, ...conCrudo], {
    tesoreria: new TesoreriaEnMemoria({ [ACTIVO]: 100000n }),
  });
  assert.equal(s.emitido.valor, null);
  assert.equal(s.autorizado.valor, null);
  assert.equal(s.circulante.valor, null);
  assert.equal(s.parcial, true);
});

test('TreasuryReleased no cambia lo emitido: solo mueve de tesoreria a circulante', () => {
  const conRelease = decodificarLote([
    log({
      firma: 'TreasuryReleased',
      logIndex: 3,
      parametros: { assetId: ACTIVO, amount: '10000', destination: 'SF-0000-0000-0002-5' },
    }),
  ]);
  const s = agregarSuministro(ACTIVO, [...eventos, ...conRelease], {
    tesoreria: new TesoreriaEnMemoria({ [ACTIVO]: 90000n }),
  });
  assert.equal(s.emitido.valor, '350000');
  assert.equal(s.circulante.valor, '260000');
});

test('decimals desconocido queda null y no se sustituye por 18', () => {
  const s = agregarSuministro(ACTIVO, eventos, {
    tesoreria: new TesoreriaEnMemoria({ [ACTIVO]: 0n }),
  });
  assert.equal(s.decimals, null);
});

test('tesoreria mayor que lo emitido es inconsistencia, no un circulante negativo', () => {
  const s = agregarSuministro(ACTIVO, eventos, {
    tesoreria: new TesoreriaEnMemoria({ [ACTIVO]: 999999999n }),
  });
  assert.equal(s.circulante.valor, null);
  assert.equal(s.circulante.origen, 'UNKNOWN');
});
