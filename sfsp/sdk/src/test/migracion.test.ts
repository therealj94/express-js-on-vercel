/* T67, T68 — el censo de migración de cuentas y la reversión del directorio. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectorioDeCuentas } from '../directorio.js';
import { migrarCuentas, reporteSanitizado } from '../migracionCuentas.js';
import type { CuentaDeOrigen } from '../migracionCuentas.js';
import { nuevaReferenciaDeSujeto } from '../ids.js';
import { claveDeIndice } from '../numeroCuenta.js';

/* Direcciones sintéticas deterministas. No corresponden a nadie. */
function direccionSintetica(i: number): string {
  return '0x' + (BigInt(i) + 0x1000n).toString(16).padStart(40, '0');
}

function censoSintetico(n: number): CuentaDeOrigen[] {
  return Array.from({ length: n }, (_, i) => ({
    refCuentaOrigen: `origen_${i}`,
    genesisSubjectRef: nuevaReferenciaDeSujeto(),
    chainId: 5550,
    address: direccionSintetica(i),
    custodyProfile: 'MANAGED' as const,
    saldos: { 'SFSP:MON:OG:ORIGEN': String(1000n + BigInt(i)), 'SFSP:LEGACY:OG:ONDK': String(i * 7) },
  }));
}

test('T67 · el censo cuadra N/N y los saldos no cambian', () => {
  const censo = censoSintetico(500);
  const d = new DirectorioDeCuentas();

  const simulacro = migrarCuentas(censo, d, { modo: 'SIMULACRO', fechaISO: '2026-09-22T00:00:00.000Z' });

  assert.equal(simulacro.cuentasOrigen, 500);
  assert.equal(simulacro.cuentasSFSP, 500);
  assert.equal(simulacro.duplicados, 0);
  assert.equal(simulacro.numerosReutilizados, 0);
  assert.equal(simulacro.direccionesConSaldoSinDueno, 0);
  assert.equal(simulacro.saldosIguales, true);
  assert.equal(simulacro.excepciones.length, 0);
  assert.ok(simulacro.cuadra);

  /* El simulacro no deja nada escrito. */
  assert.equal(d.totalCuentas, 0);

  /* Pero los números que se sortearon quedan consumidos para siempre: nadie los
     vuelve a recibir aunque la corrida se haya deshecho. */
  assert.ok(d.totalNumerosConsumidos >= 500);

  const aplicada = migrarCuentas(censo, d, { modo: 'APLICAR', fechaISO: '2026-09-22T00:00:00.000Z' });
  assert.ok(aplicada.cuadra);
  assert.equal(d.totalCuentas, 500);

  /* Cada cuenta tiene exactamente una ruta primaria hacia su dirección de siempre. */
  for (const par of aplicada.pares) {
    const cuenta = d.cuentaPorId(par.accountId)!;
    assert.equal(d.rutasPrimarias(cuenta.accountId), 1);
    const destino = d.resolver(cuenta.accountNumber, 5550, '2026-09-22T00:00:01.000Z');
    const origen = censo.find((c) => c.refCuentaOrigen === par.refCuentaOrigen)!;
    assert.equal(destino.address.toLowerCase(), origen.address.toLowerCase());
  }

  /* Números únicos entre sí. */
  const numeros = new Set(aplicada.pares.map((p) => claveDeIndice(p.accountNumber)));
  assert.equal(numeros.size, 500);
});

test('T67, H10 · la idempotencia es del directorio, no de un mapa que el llamador puede olvidar', () => {
  const censo = censoSintetico(50);
  const d = new DirectorioDeCuentas();

  const primera = migrarCuentas(censo, d, { modo: 'APLICAR' });

  /* Sin pasar NADA: la segunda corrida encuentra la correspondencia en el
     directorio. Antes, olvidar el mapa creaba cincuenta cuentas de más. */
  const segunda = migrarCuentas(censo, d, { modo: 'APLICAR' });

  assert.equal(d.totalCuentas, 50, 'la segunda corrida no debe crear cuentas');
  assert.equal(segunda.cuentasSFSP, 50);
  assert.equal(segunda.yaExistentes, 50);
  assert.ok(segunda.cuadra);
  assert.deepEqual(
    segunda.pares.map((p) => p.accountNumber).sort(),
    primera.pares.map((p) => p.accountNumber).sort(),
  );
});

test('T67 · una cuenta con dirección inutilizable queda como excepción, no se borra', () => {
  const censo = censoSintetico(10);
  censo[3] = { ...(censo[3] as CuentaDeOrigen), address: '0xNO_ES_UNA_DIRECCION' };
  const d = new DirectorioDeCuentas();

  const r = migrarCuentas(censo, d, { modo: 'SIMULACRO' });

  assert.equal(r.cuadra, false, 'con una excepción abierta el lote no cuadra');
  assert.equal(r.excepciones.length, 1);
  assert.equal(r.excepciones[0]?.refCuentaOrigen, 'origen_3');
  assert.ok(r.excepciones[0]?.expediente.startsWith('exp_'));
  assert.equal(r.direccionesConSaldoSinDueno, 1, 'tenía saldo y se contabiliza');
  /* Las otras nueve sí se proponen: una excepción no detiene el resto. */
  assert.equal(r.cuentasSFSP, 9);
  assert.equal(r.cuentasOrigen, 10);
});

test('T67 · un duplicado en el censo se detecta', () => {
  const censo = censoSintetico(5);
  censo.push({ ...(censo[2] as CuentaDeOrigen) });
  const d = new DirectorioDeCuentas();

  const r = migrarCuentas(censo, d, { modo: 'SIMULACRO' });
  assert.equal(r.duplicados, 1);
  assert.equal(r.cuadra, false);
});

test('T68 · revertir el directorio no crea doble ruta ni recicla números', () => {
  const d = new DirectorioDeCuentas();
  const antes = migrarCuentas(censoSintetico(20), d, { modo: 'APLICAR' });
  assert.equal(d.totalCuentas, 20);

  const punto = d.instantanea();
  const numerosConsumidosEnElPunto = d.totalNumerosConsumidos;
  const numerosAntes = new Set(antes.pares.map((p) => claveDeIndice(p.accountNumber)));

  /* Un lote que después se deshace. */
  const segundoLote = censoSintetico(20).map((c) => ({
    ...c,
    refCuentaOrigen: `segundo_${c.refCuentaOrigen}`,
  }));
  const deshecho = migrarCuentas(segundoLote, d, { modo: 'APLICAR' });
  assert.equal(d.totalCuentas, 40);

  d.restaurar(punto);

  assert.equal(d.totalCuentas, 20, 'la reversión devuelve el directorio a su punto');
  /* Los números del lote deshecho NO vuelven al sorteo. */
  assert.ok(d.totalNumerosConsumidos >= numerosConsumidosEnElPunto + 20);

  /* Y ninguna cuenta nueva recibe un número que ya se había mostrado. */
  const tercerLote = censoSintetico(20).map((c) => ({
    ...c,
    refCuentaOrigen: `tercero_${c.refCuentaOrigen}`,
  }));
  const nuevo = migrarCuentas(tercerLote, d, { modo: 'APLICAR' });
  const numerosDeshechos = new Set(deshecho.pares.map((p) => claveDeIndice(p.accountNumber)));
  for (const p of nuevo.pares) {
    const clave = claveDeIndice(p.accountNumber);
    assert.ok(!numerosDeshechos.has(clave), 'un número del lote deshecho se reutilizó');
    assert.ok(!numerosAntes.has(clave), 'un número ya entregado se reutilizó');
  }

  /* Cada cuenta sigue con una sola ruta primaria. */
  for (const p of nuevo.pares) {
    assert.equal(d.rutasPrimarias(p.accountId), 1);
  }
});

test('el reporte publicable no lleva direcciones ni referencias de identidad', () => {
  const censo = censoSintetico(30);
  const d = new DirectorioDeCuentas();
  const r = migrarCuentas(censo, d, { modo: 'SIMULACRO' });

  const publicable = JSON.stringify(reporteSanitizado(r));

  assert.ok(!/0x[0-9a-fA-F]{40}/.test(publicable), 'no puede contener una dirección');
  assert.ok(!/gsr_/.test(publicable), 'no puede contener una referencia de sujeto');
  assert.ok(!/SF-\d{4}/.test(publicable), 'no puede contener un número de cuenta');
  assert.match(publicable, /"cuentasOrigen":30/);
});
