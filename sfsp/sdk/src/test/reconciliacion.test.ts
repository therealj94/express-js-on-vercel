/* Conciliación de migración de activos: la ecuación correcta y la equivocada. */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  conciliar,
  conciliarCongelada,
  convertirConRatio,
  conversionSinPerdida,
  RegistroDeClaims,
} from '../reconciliacion.js';
import { ErrorSFSP } from '../codigos.js';

test('el ejemplo del plan cuadra con S0 = A + N + P', () => {
  const m = { migrationId: 'mig_ejemplo', S0: 1000n, A: 600n, E: 400n, N: 350n, P: 50n };
  const r = conciliar(m);

  assert.ok(r.cuadra);
  assert.equal(r.diferenciaSuministro, 0n);
  assert.equal(r.diferenciaExclusion, 0n);

  /* Y la ecuación equivocada daría 800, no 1000. Se deja escrito en la prueba
     porque es el error que el documento corrige. */
  assert.equal(m.E + m.N + m.P, 800n);
  assert.notEqual(m.E + m.N + m.P, m.S0);
});

test('una migración que no cuadra dice exactamente cuánto falta', () => {
  const r = conciliar({ migrationId: 'mig_x', S0: 1000n, A: 600n, E: 400n, N: 300n, P: 50n });
  assert.equal(r.cuadra, false);
  assert.equal(r.diferenciaSuministro, 50n);
  assert.equal(r.diferenciaExclusion, 50n);
});

test('en modo congelado no pueden quedar derechos originales en circulación', () => {
  assert.throws(
    () => conciliarCongelada({ migrationId: 'mig_f', S0: 1000n, A: 600n, E: 400n, N: 350n, P: 50n }),
    ErrorSFSP,
  );
  const r = conciliarCongelada({ migrationId: 'mig_f', S0: 400n, A: 0n, E: 400n, N: 350n, P: 50n });
  assert.ok(r.cuadra);
});

test('una cantidad negativa no se concilia, se rechaza', () => {
  assert.throws(
    () => conciliar({ migrationId: 'mig_n', S0: 10n, A: -1n, E: 0n, N: 0n, P: 0n }),
    ErrorSFSP,
  );
});

test('el ratio no trunca derechos en silencio', () => {
  /* Tres unidades viejas por cada siete nuevas, sobre una cantidad que no divide. */
  const c = convertirConRatio(10n, 7n, 3n);
  assert.equal(c.unidadesNuevas, 23n);
  assert.equal(c.resto, 1n);
  assert.equal(c.denominador, 3n);
  assert.ok(conversionSinPerdida(10n, 7n, 3n, c));

  /* Un padrón entero: el resto de cada tenedor se conserva, no se descarta. */
  let restoTotal = 0n;
  for (let i = 1n; i <= 1000n; i++) {
    const x = convertirConRatio(i, 1n, 3n);
    assert.ok(conversionSinPerdida(i, 1n, 3n, x));
    restoTotal += x.resto;
  }
  assert.ok(restoTotal > 0n, 'con este ratio hay restos y tienen que estar contados');

  assert.throws(() => convertirConRatio(10n, 0n, 3n), ErrorSFSP);
  assert.throws(() => convertirConRatio(-1n, 1n, 1n), ErrorSFSP);
});

test('un derecho no se reclama dos veces', () => {
  const registro = new RegistroDeClaims();
  const claim = {
    migrationId: 'mig_a',
    nullifier: 'null_0001',
    beneficiario: 'acc_demo',
    cantidadVieja: 100n,
  };

  assert.equal(registro.yaConsumido(claim), false);
  registro.consumir(claim);
  assert.ok(registro.yaConsumido(claim));
  assert.throws(() => registro.consumir(claim), ErrorSFSP);

  /* El mismo nullifier en OTRA migración es otro derecho: no colisiona. */
  registro.consumir({ ...claim, migrationId: 'mig_b' });
  assert.equal(registro.total, 2);
});
