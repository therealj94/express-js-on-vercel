/* T57, T58, T59 — el número de cuenta SFSP. */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generarNumeroCuenta,
  digitoDeControl,
  esNumeroValido,
  formatear,
  claveDeIndice,
  ultimos4,
  partes,
} from '../numeroCuenta.js';

test('T57 · un millón de números con restricción de unicidad y reintento no deja colisiones', () => {
  const OBJETIVO = 1_000_000;
  const vistos = new Set<string>();
  let colisiones = 0;

  while (vistos.size < OBJETIVO) {
    const numero = generarNumeroCuenta();
    const clave = claveDeIndice(numero);
    if (vistos.has(clave)) {
      /* Esto es lo que hace el índice único de la base: rechaza y se reintenta.
         Con doce dígitos y un millón de cuentas, el cumpleaños dice que alguna
         colisión es esperable; lo que no es aceptable es entregarla. */
      colisiones++;
      continue;
    }
    vistos.add(clave);
  }

  assert.equal(vistos.size, OBJETIVO);
  /* El reintento absorbió todas las que hubo, sean cuantas sean. */
  assert.ok(colisiones < 100, `colisiones inesperadamente altas: ${colisiones}`);
});

test('T58 · el dígito de control detecta los errores de tecleo definidos', () => {
  const base = '482913756024';
  const numero = formatear(base);
  assert.ok(esNumeroValido(numero));

  /* Toda sustitución de un solo dígito se detecta. */
  let sustitucionesNoDetectadas = 0;
  for (let i = 0; i < base.length; i++) {
    for (let d = 0; d <= 9; d++) {
      const original = Number(base[i]);
      if (d === original) continue;
      const alterado = base.slice(0, i) + String(d) + base.slice(i + 1);
      if (digitoDeControl(alterado) === digitoDeControl(base)) sustitucionesNoDetectadas++;
    }
  }
  assert.equal(sustitucionesNoDetectadas, 0, 'Luhn debe detectar toda sustitución de un dígito');

  /* Transposiciones de dígitos adyacentes: Luhn las detecta todas MENOS 09<->90.
     Esa limitación es conocida y se documenta; no se esconde. */
  const noDetectadas: string[] = [];
  for (let i = 0; i < base.length - 1; i++) {
    const a = base[i] as string;
    const b = base[i + 1] as string;
    if (a === b) continue;
    const alterado = base.slice(0, i) + b + a + base.slice(i + 2);
    if (digitoDeControl(alterado) === digitoDeControl(base)) noDetectadas.push(`${a}${b}`);
  }
  for (const par of noDetectadas) {
    assert.ok(
      par === '09' || par === '90',
      `Luhn sólo puede dejar pasar la transposición 09/90, no ${par}`,
    );
  }

  /* Y la limitación existe de verdad: se comprueba con un caso que la contiene. */
  const conCero9 = '090000000000';
  const transpuesto = '900000000000';
  assert.equal(
    digitoDeControl(conCero9),
    digitoDeControl(transpuesto),
    'la transposición 09<->90 no la detecta Luhn: queda documentada, no negada',
  );
});

test('T59 · el número no es secuencial y no codifica datos de la persona', () => {
  const muestra = Array.from({ length: 2000 }, () => generarNumeroCuenta());

  /* Ningún par consecutivo difiere en uno: no hay contador detrás. */
  let consecutivos = 0;
  for (let i = 1; i < muestra.length; i++) {
    const a = BigInt(partes(muestra[i - 1] as string)!.cuerpo);
    const b = BigInt(partes(muestra[i] as string)!.cuerpo);
    if (b === a + 1n || b === a - 1n) consecutivos++;
  }
  assert.equal(consecutivos, 0, 'dos números consecutivos delatarían un contador');

  /* El primer dígito se reparte: ningún valor acapara. Con 2000 muestras y diez
     valores, lo esperado es 200 cada uno; 100 a 320 es un margen amplio que
     detecta un sesgo grosero sin volver la prueba inestable. */
  const conteo = new Array<number>(10).fill(0);
  for (const n of muestra) {
    const d = Number(partes(n)!.cuerpo[0]);
    conteo[d] = (conteo[d] as number) + 1;
  }
  for (let d = 0; d <= 9; d++) {
    assert.ok(
      (conteo[d] as number) > 100 && (conteo[d] as number) < 320,
      `el dígito ${d} aparece ${conteo[d]} veces: distribución sospechosa`,
    );
  }

  /* Dos cuentas con exactamente el mismo dato de entrada dan números distintos:
     el número no deriva de nada de la persona. */
  const distintos = new Set([generarNumeroCuenta(), generarNumeroCuenta(), generarNumeroCuenta()]);
  assert.equal(distintos.size, 3);
});

test('forma, validación y últimos cuatro', () => {
  const n = formatear('123456789012');
  assert.match(n, /^SF-\d{4}-\d{4}-\d{4}-\d$/);
  assert.ok(esNumeroValido(n));
  assert.equal(claveDeIndice(n).length, 13);
  assert.equal(ultimos4(n).length, 4);

  assert.equal(esNumeroValido('SF-1234-5678-9012-0') && esNumeroValido('SF-1234-5678-9012-1'), false);
  assert.equal(esNumeroValido('SF-1234-5678-901-2'), false);
  assert.equal(esNumeroValido('1234-5678-9012-3'), false);
  assert.equal(partes('no es un numero'), null);
});
