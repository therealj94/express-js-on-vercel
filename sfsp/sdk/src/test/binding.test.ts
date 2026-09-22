/* T62, T63, T64 — rutas técnicas: cambio, caducidad y el límite del rebind. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectorioDeCuentas } from '../directorio.js';
import { nuevaReferenciaDeSujeto } from '../ids.js';
import { transicionPermitida, revalidarDestino, estaVigente } from '../binding.js';
import { rebindMueveActivos } from '../custodia.js';
import { ErrorSFSP } from '../codigos.js';

const DIR_A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const DIR_B = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

const alta = () => ({
  genesisSubjectRef: nuevaReferenciaDeSujeto(),
  custodyProfile: 'MANAGED' as const,
  policyVersion: 'prueba',
});

test('T62 · cambiar de ruta no cambia el número de cuenta', () => {
  const d = new DirectorioDeCuentas();
  const cuenta = d.crearCuenta(alta());
  const numero = cuenta.accountNumber;

  const b1 = d.crearBinding(cuenta.accountId, 5550, DIR_A, 'PAYMENTS', 'MANAGED');
  d.cambiarEstadoBinding(b1.bindingId, 'ACTIVE', 'prueba', 'alta');
  d.cambiarEstadoBinding(b1.bindingId, 'PRIMARY', 'prueba', 'principal');

  const b2 = d.crearBinding(cuenta.accountId, 5550, DIR_B, 'PAYMENTS', 'MANAGED');
  d.cambiarEstadoBinding(b2.bindingId, 'ACTIVE', 'prueba', 'alta');
  d.cambiarEstadoBinding(b2.bindingId, 'PRIMARY', 'prueba', 'cambio de ruta');

  assert.equal(d.cuentaPorId(cuenta.accountId)?.accountNumber, numero);
  /* Y nunca hay dos rutas primarias: la anterior bajó en la misma operación. */
  assert.equal(d.rutasPrimarias(cuenta.accountId), 1);
  assert.equal(d.binding(b1.bindingId)?.status, 'ACTIVE');
  assert.equal(d.binding(b2.bindingId)?.status, 'PRIMARY');

  const resolucion = d.resolver(numero, 5550);
  assert.equal(resolucion.address, DIR_B);
});

test('T63 · una ruta caducada o revocada no resuelve', () => {
  const d = new DirectorioDeCuentas();
  const cuenta = d.crearCuenta(alta());

  const b = d.crearBinding(
    cuenta.accountId,
    5550,
    DIR_A,
    'PAYMENTS',
    'MANAGED',
    '2026-01-01T00:00:00.000Z',
    '2026-06-01T00:00:00.000Z',
  );
  d.cambiarEstadoBinding(b.bindingId, 'ACTIVE', 'prueba', 'alta');

  assert.ok(estaVigente(d.binding(b.bindingId)!, '2026-03-01T00:00:00.000Z'));
  assert.equal(estaVigente(d.binding(b.bindingId)!, '2026-09-01T00:00:00.000Z'), false);

  assert.throws(() => d.resolver(cuenta.accountNumber, 5550, '2026-09-01T00:00:00.000Z'), ErrorSFSP);
  /* Antes de su inicio tampoco. */
  assert.throws(() => d.resolver(cuenta.accountNumber, 5550, '2025-12-01T00:00:00.000Z'), ErrorSFSP);

  d.cambiarEstadoBinding(b.bindingId, 'REVOKED', 'prueba', 'baja');
  assert.throws(() => d.resolver(cuenta.accountNumber, 5550, '2026-03-01T00:00:00.000Z'), ErrorSFSP);
  /* Revocada es terminal: no vuelve. */
  assert.equal(transicionPermitida('REVOKED', 'ACTIVE'), false);
});

test('T63 · la resolución caduca y se revalida contra la versión de la ruta', () => {
  const d = new DirectorioDeCuentas();
  const cuenta = d.crearCuenta(alta());
  const b = d.crearBinding(cuenta.accountId, 5550, DIR_A, 'PAYMENTS', 'MANAGED', '2026-01-01T00:00:00.000Z');
  d.cambiarEstadoBinding(b.bindingId, 'ACTIVE', 'prueba', 'alta');

  const r = d.resolver(cuenta.accountNumber, 5550, '2026-03-01T00:00:00.000Z');

  /* Dentro de la ventana y sin cambios: pasa. */
  revalidarDestino(r, d.binding(b.bindingId)!, '2026-03-01T00:00:30.000Z');

  /* Pasada la ventana: no. */
  assert.throws(
    () => revalidarDestino(r, d.binding(b.bindingId)!, '2026-03-01T00:05:00.000Z'),
    ErrorSFSP,
  );

  /* La carrera que esto cierra: la ruta cambia entre resolver y ejecutar. */
  d.cambiarEstadoBinding(b.bindingId, 'SUSPENDED', 'prueba', 'sospecha');
  assert.throws(
    () => revalidarDestino(r, d.binding(b.bindingId)!, '2026-03-01T00:00:30.000Z'),
    ErrorSFSP,
  );
});

test('T64 · volver a vincular no mueve activos legacy', () => {
  const d = new DirectorioDeCuentas();
  const cuenta = d.crearCuenta(alta());

  const vieja = d.crearBinding(cuenta.accountId, 5550, DIR_A, 'PAYMENTS', 'PERSONAL');
  d.cambiarEstadoBinding(vieja.bindingId, 'ACTIVE', 'prueba', 'alta');
  d.cambiarEstadoBinding(vieja.bindingId, 'PRIMARY', 'prueba', 'principal');

  /* El usuario pierde la llave de DIR_A y se le vincula una dirección nueva. */
  const nueva = d.crearBinding(cuenta.accountId, 5550, DIR_B, 'PAYMENTS', 'MANAGED');
  d.cambiarEstadoBinding(nueva.bindingId, 'ACTIVE', 'prueba', 'alta');
  d.cambiarEstadoBinding(nueva.bindingId, 'PRIMARY', 'prueba', 'rebind por pérdida');
  d.cambiarEstadoBinding(vieja.bindingId, 'REVOKED', 'prueba', 'llave perdida');

  /* El directorio ahora apunta a la dirección nueva... */
  assert.equal(d.resolver(cuenta.accountNumber, 5550).address, DIR_B);
  /* ...y eso NO significa que lo que hay en DIR_A se haya movido. */
  assert.equal(rebindMueveActivos(), false);
  /* La ruta vieja queda en el historial, no desaparece. */
  assert.ok(d.historial.some((e) => e.bindingId === vieja.bindingId && e.hacia === 'REVOKED'));
});

test('las transiciones inválidas se rechazan con código', () => {
  const d = new DirectorioDeCuentas();
  const cuenta = d.crearCuenta(alta());
  const b = d.crearBinding(cuenta.accountId, 5550, DIR_A, 'PAYMENTS', 'MANAGED');

  assert.throws(() => d.cambiarEstadoBinding(b.bindingId, 'PRIMARY', 'x', 'salto'), ErrorSFSP);
  d.cambiarEstadoBinding(b.bindingId, 'ACTIVE', 'x', 'alta');
  d.cambiarEstadoBinding(b.bindingId, 'REVOKED', 'x', 'baja');
  assert.throws(() => d.cambiarEstadoBinding(b.bindingId, 'ACTIVE', 'x', 'resucitar'), ErrorSFSP);
});
