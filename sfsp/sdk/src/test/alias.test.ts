/* T60, T61 — alias: confusables, reservados y cambio sin tocar el número. */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarAlias,
  esqueleto,
  esReservado,
  paresColapsados,
  secuenciasColapsadas,
} from '../alias.js';
import { DirectorioDeCuentas } from '../directorio.js';
import { nuevaReferenciaDeSujeto } from '../ids.js';
import { ErrorSFSP } from '../codigos.js';

const altaDePrueba = () => ({
  genesisSubjectRef: nuevaReferenciaDeSujeto(),
  custodyProfile: 'MANAGED' as const,
  policyVersion: 'prueba',
});

test('T60 · un alias que se ve igual que otro no se registra', () => {
  const d = new DirectorioDeCuentas();
  const a = d.crearCuenta(altaDePrueba());
  const b = d.crearCuenta(altaDePrueba());

  d.registrarAlias(a.accountId, '@medardo');

  /* Mismo esqueleto: la o y el cero se ven igual en la mayoría de tipografías. */
  assert.throws(() => d.registrarAlias(b.accountId, '@medard0'), ErrorSFSP);
  /* El guion bajo no distingue: se colapsa. */
  assert.throws(() => d.registrarAlias(b.accountId, '@me_dardo'), ErrorSFSP);
  /* Exactamente el mismo: tomado. */
  assert.throws(() => d.registrarAlias(b.accountId, '@medardo'), ErrorSFSP);

  /* Uno distinto de verdad sí entra. */
  const otro = d.registrarAlias(b.accountId, '@carolina');
  assert.equal(otro.status, 'ACTIVE');
});

test('T60 · alfabetos mezclados y caracteres invisibles se rechazan', () => {
  /* La «о» cirílica en medio de un nombre latino: el ataque clásico. */
  assert.throws(() => normalizarAlias('@medardоn'), ErrorSFSP);
  /* Un espacio de ancho cero no crea un alias nuevo: se limpia antes. */
  assert.equal(normalizarAlias('@mar​cos').normalized, 'marcos');
  /* Ancho completo se normaliza con NFKC. */
  assert.equal(normalizarAlias('＠ｍｅｄａｒｄｏ'.replace('＠', '@')).normalized, 'medardo');

  assert.throws(() => normalizarAlias('medardo'), ErrorSFSP); // sin arroba
  assert.throws(() => normalizarAlias('@ab'), ErrorSFSP); // corto de más
  assert.throws(() => normalizarAlias('@' + 'a'.repeat(31)), ErrorSFSP); // largo de más
  assert.throws(() => normalizarAlias('@hola mundo'), ErrorSFSP); // espacio
  assert.throws(() => normalizarAlias('@.hola'), ErrorSFSP); // punto al principio
});

test('T60 · los nombres reservados no se entregan, ni disfrazados', () => {
  assert.ok(esReservado('soporte'));
  assert.ok(esReservado('vetawallet'));
  assert.ok(esReservado('0rden'), 'el esqueleto de un reservado también está reservado');
  assert.equal(esReservado('medardo'), false);

  const d = new DirectorioDeCuentas();
  const a = d.crearCuenta(altaDePrueba());
  assert.throws(() => d.registrarAlias(a.accountId, '@soporte'), ErrorSFSP);
  assert.throws(() => d.registrarAlias(a.accountId, '@0rigen'), ErrorSFSP);
});

test('T61 · cambiar de alias no cambia el número de cuenta', () => {
  const d = new DirectorioDeCuentas();
  const cuenta = d.crearCuenta(altaDePrueba());
  const numeroAntes = cuenta.accountNumber;

  d.registrarAlias(cuenta.accountId, '@medardo');
  assert.equal(d.cuentaPorAlias('@medardo')?.accountId, cuenta.accountId);

  d.cambiarAlias(cuenta.accountId, '@medardo.og');

  assert.equal(d.cuentaPorId(cuenta.accountId)?.accountNumber, numeroAntes);
  assert.equal(d.cuentaPorAlias('@medardo.og')?.accountId, cuenta.accountId);
  /* El alias viejo deja de resolver: quien lo tuviera guardado recibe un fallo
     claro, no un pago a la persona equivocada. */
  assert.equal(d.cuentaPorAlias('@medardo'), null);
  /* El número sigue resolviendo, que es de lo que se trata. */
  assert.equal(d.cuentaPorNumero(numeroAntes)?.accountId, cuenta.accountId);
});

test('el esqueleto colapsa lo que se confunde y nada más', () => {
  assert.equal(esqueleto('medard0'), esqueleto('medardo'));
  assert.equal(esqueleto('rnedardo'), esqueleto('medardo'));
  assert.notEqual(esqueleto('medardo'), esqueleto('medarda'));
});

test('P02 · la cobertura anti-confusables está enumerada y es revisable', () => {
  /* Esta prueba no comprueba que la lista sea la «correcta»: comprueba que sea
     la ACORDADA. Si alguien añade o quita una regla, salta y hay que decidirlo
     a propósito, en vez de descubrirlo cuando dos alias parecidos convivan. */
  const grupos = paresColapsados().map((g) => g.join('')).sort();
  assert.deepEqual(
    grupos,
    [
      '._', // los separadores no distinguen lo suficiente como para dar un alias
      '0o',
      '1il',
      '5s',
      '6b',
    ],
    'la cobertura anti-confusables cambió: revisalo a propósito',
  );

  /* Y las secuencias que se leen como una sola letra. */
  const secuencias = secuenciasColapsadas();
  for (const [muchas, una] of secuencias) {
    assert.equal(esqueleto(muchas), esqueleto(una), `${muchas} debería colapsar en ${una}`);
  }

  /* Las tres reglas que se quitaron por colapsar de más: 9 no es g, 2 no es z,
     7 no es t. Negárselas a alguien sería quitarle un alias legítimo. */
  assert.notEqual(esqueleto('9'), esqueleto('g'));
  assert.notEqual(esqueleto('2'), esqueleto('z'));
  assert.notEqual(esqueleto('7'), esqueleto('t'));
});
