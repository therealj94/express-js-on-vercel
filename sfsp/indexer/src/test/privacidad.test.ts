import test from 'node:test';
import assert from 'node:assert/strict';

import {
  contieneCampoProhibido,
  filtrarParaPublicacion,
} from '../privacidad.js';

const registro = {
  assetId: 'SFSP:SEC:iss_sintetico:S1',
  accountId: 'acc_00000000000000000000000000001111',
  genesisSubjectRef: 'ref-privada-sintetica',
  bindingId: 'bnd_00000000000000000000000000002222',
  holderAddress: '0xTEST_TITULAR',
  saldo: '12345',
  privado: 'esto nunca sale',
  nota: { private: 'tampoco esto', publico: 'esto si' },
  titulares: [{ accountId: 'acc_otro', saldo: '7' }],
};

test('la vista publica no deja pasar ningun campo privado del §7', () => {
  const r = filtrarParaPublicacion(registro, { audiencia: 'PUBLICO' });
  assert.equal(contieneCampoProhibido(r.vista), null);

  const vista = r.vista as Record<string, unknown>;
  assert.equal('genesisSubjectRef' in vista, false);
  assert.equal('bindingId' in vista, false);
  assert.equal('accountId' in vista, false);
  assert.equal('holderAddress' in vista, false);
  assert.equal('saldo' in vista, false);
  assert.equal('privado' in vista, false);
  assert.equal('titulares' in vista, false);
  // Lo que no identifica a nadie sigue publicandose.
  assert.equal(vista['assetId'], 'SFSP:SEC:iss_sintetico:S1');
  assert.deepEqual(vista['nota'], { publico: 'esto si' });
});

test('el filtro informa que campos retiro, para que la UI pueda decirlo', () => {
  const r = filtrarParaPublicacion(registro, { audiencia: 'PUBLICO' });
  assert.ok(r.camposRetirados.includes('genesisSubjectRef'));
  assert.ok(r.camposRetirados.includes('nota.private'));
  assert.ok(r.camposRetirados.length >= 6);
});

test('el resultado declara explicitamente que NO es privacidad on-chain', () => {
  const r = filtrarParaPublicacion(registro, { audiencia: 'PUBLICO' });
  assert.equal(r.esPrivacidadOnChain, false);
});

test('el titular ve su propio saldo; un tercero no', () => {
  const propio = filtrarParaPublicacion(registro, {
    audiencia: 'TITULAR',
    accountIdSolicitante: 'acc_00000000000000000000000000001111',
  });
  assert.equal((propio.vista as Record<string, unknown>)['saldo'], '12345');
  // Aun siendo el titular, la semilla del §7 nunca aparece.
  assert.equal(
    'genesisSubjectRef' in (propio.vista as Record<string, unknown>),
    false,
  );

  const ajeno = filtrarParaPublicacion(registro, {
    audiencia: 'TITULAR',
    accountIdSolicitante: 'acc_otro_distinto',
  });
  assert.equal('saldo' in (ajeno.vista as Record<string, unknown>), false);
});

test('auditoria sin proposito ni bitacora se degrada a publico', () => {
  const sinPermiso = filtrarParaPublicacion(registro, { audiencia: 'AUDITORIA' });
  assert.equal('saldo' in (sinPermiso.vista as Record<string, unknown>), false);

  const conPermiso = filtrarParaPublicacion(registro, {
    audiencia: 'AUDITORIA',
    proposito: 'revision T52 sintetica',
    bitacoraId: 'log_sintetico_1',
  });
  assert.equal((conPermiso.vista as Record<string, unknown>)['saldo'], '12345');
  // Ni con permiso se publica una llave o una semilla.
  const conSemilla = filtrarParaPublicacion(
    { ...registro, privateKey: 'material-sintetico' },
    { audiencia: 'AUDITORIA', proposito: 'x', bitacoraId: 'y' },
  );
  assert.equal(
    'privateKey' in (conSemilla.vista as Record<string, unknown>),
    false,
  );
});

test('un agregado con pocos titulares se suprime porque identifica personas', () => {
  const r = filtrarParaPublicacion(
    { assetId: 'SFSP:SEC:iss_sintetico:S1', holderCount: 3, distribucion: [1, 1, 1] },
    { audiencia: 'PUBLICO', umbralAgregado: 5 },
  );
  assert.equal('distribucion' in (r.vista as Record<string, unknown>), false);
  assert.deepEqual(r.agregadosSuprimidos, ['distribucion']);

  const grande = filtrarParaPublicacion(
    { assetId: 'SFSP:SEC:iss_sintetico:S1', holderCount: 900, distribucion: [1, 2] },
    { audiencia: 'PUBLICO', umbralAgregado: 5 },
  );
  assert.ok('distribucion' in (grande.vista as Record<string, unknown>));
});
