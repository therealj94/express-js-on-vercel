/* Pruebas de propiedades para la aritmética del dinero (C06).
 *
 * Todas las demás pruebas del árbol son por ejemplo: se elige un caso, se
 * comprueba un resultado. Eso encuentra lo que uno ya sospecha. El defecto H12
 * de la auditoría, la cobertura que devolvía 10000 puntos básicos donde había
 * 5025, sobrevivió a cuarenta y ocho pruebas por ejemplo porque a nadie se le
 * ocurrió ese caso concreto.
 *
 * Una prueba de propiedades no elige casos: enuncia una regla que debe
 * cumplirse SIEMPRE y la ataca con cientos de entradas generadas, incluidos los
 * bordes que un humano no escribe. Cuando falla, imprime la entrada que la
 * rompió.
 *
 * El generador es determinista a propósito: la misma semilla da la misma
 * secuencia, así que un fallo se reproduce. Sin eso, una prueba que falla una
 * vez cada cien corridas es ruido en vez de información. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { convertirConRatio, conversionSinPerdida, conciliar } from '../reconciliacion.js';
import { coberturaBps, puedeLiberar, suministroNativo } from '../supply.js';
import { valorElegible } from '../reservas.js';
import type { ReserveAsset } from '../reservas.js';
import { digitoDeControl, formatear, esNumeroValido, digitosAleatorios } from '../numeroCuenta.js';

/* Generador congruencial pequeño: no es criptográfico y no pretende serlo.
   Sirve para recorrer el espacio de entradas de forma repetible. */
function azar(semilla: number) {
  let s = semilla >>> 0;
  return {
    entero(max: number): number {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s % max;
    },
    grande(bits: number): bigint {
      let v = 0n;
      for (let i = 0; i < Math.ceil(bits / 30); i++) {
        s = (s * 1664525 + 1013904223) >>> 0;
        v = (v << 30n) | BigInt(s % (1 << 30));
      }
      return v;
    },
  };
}

const CASOS = 400;

test('propiedad · una conversión con ratio nunca pierde una unidad', () => {
  const r = azar(20260922);
  for (let i = 0; i < CASOS; i++) {
    const vieja = r.grande(64);
    const num = r.grande(16) + 1n;
    const den = r.grande(16) + 1n;

    const c = convertirConRatio(vieja, num, den);

    assert.ok(
      conversionSinPerdida(vieja, num, den, c),
      `se perdió valor con vieja=${vieja} num=${num} den=${den}`,
    );
    assert.ok(c.resto >= 0n && c.resto < den, `resto fuera de rango: ${c.resto} con den=${den}`);
  }
});

test('propiedad · la conciliación cuadra si y sólo si S0 = A + N + P', () => {
  const r = azar(7);
  for (let i = 0; i < CASOS; i++) {
    const A = r.grande(40);
    const N = r.grande(40);
    const P = r.grande(40);
    const S0 = A + N + P;
    const E = N + P;

    assert.ok(conciliar({ migrationId: 'm', S0, A, E, N, P }).cuadra);

    /* Y cualquier desvío de una unidad la rompe: no hay tolerancia silenciosa. */
    assert.equal(conciliar({ migrationId: 'm', S0: S0 + 1n, A, E, N, P }).cuadra, false);
    assert.equal(conciliar({ migrationId: 'm', S0, A, E: E + 1n, N, P }).cuadra, false);
  }
});

test('propiedad · la cobertura crece con el respaldo y nunca informa de más', () => {
  const r = azar(99);
  for (let i = 0; i < CASOS; i++) {
    const valor = r.grande(50);
    const unidades = r.grande(30) + 1n;
    const referencia = r.grande(20) + 1n;
    const decimals = r.entero(19);

    const a = coberturaBps(valor, unidades, referencia, decimals);
    assert.equal(a.codigo, 'ALLOW');
    const bpsA = a.valor as bigint;

    /* Monótona: más respaldo nunca puede dar menos cobertura. */
    const b = coberturaBps(valor + 1000n, unidades, referencia, decimals);
    assert.ok((b.valor as bigint) >= bpsA, 'más respaldo dio menos cobertura');

    /* Nunca informa de más: el redondeo es siempre hacia abajo. */
    const escala = 10n ** BigInt(decimals);
    const exacto = (valor * escala * 10000n) / (unidades * referencia);
    assert.ok(bpsA <= exacto, 'la cobertura informó por encima del valor exacto');
  }
});

test('propiedad · liberar nunca autoriza por encima del inventario inmovilizado', () => {
  const r = azar(1234);
  for (let i = 0; i < CASOS; i++) {
    const suministro = r.grande(40) + 1n;
    const noActivado = r.grande(40) % (suministro + 1n);
    const cantidad = r.grande(40) + 1n;
    const cap = r.grande(41);
    const rac = r.grande(41);

    const res = puedeLiberar({
      cantidad,
      perimetro: { suministroNativo: suministro, noActivado },
      releaseCap: cap,
      racUnits: rac,
    });

    if (res.codigo === 'ALLOW') {
      assert.ok(cantidad <= noActivado, 'autorizó más de lo inmovilizado');
      assert.ok((res.valor as bigint) <= (cap < rac ? cap : rac), 'superó el mínimo de techo y capacidad');
    }
  }
});

test('propiedad · el suministro nativo nunca sale negativo ni se inventa', () => {
  const r = azar(555);
  for (let i = 0; i < CASOS; i++) {
    const genesis = r.grande(50);
    const emision = r.grande(50);
    const quema = r.grande(50);

    const res = suministroNativo({ genesis, emisionDeConsenso: emision, quemaDeProtocolo: quema });
    if (res.codigo === 'ALLOW') {
      const s = res.valor as bigint;
      assert.ok(s >= 0n);
      assert.equal(s, genesis + emision - quema);
      assert.ok(s <= genesis + emision, 'el suministro no puede superar lo emitido');
    } else {
      assert.ok(quema > genesis + emision, 'sólo puede fallar si la quema supera lo emitido');
    }
  }
});

test('propiedad · un factor fuera de rango nunca produce un valor elegible', () => {
  const r = azar(31337);
  const base: ReserveAsset = {
    reserveAssetId: 'res_p',
    tier: 'A',
    netRealizableValueCents: 1_000_000n,
    eligibilityFactorBps: 10000,
    haircutBps: 0,
    concentrationFactorBps: 10000,
    expiresAtISO: '2099-01-01T00:00:00.000Z',
    asignadaA: null,
    evidenceHash: 'x',
    estado: 'ELIGIBLE',
  };

  for (let i = 0; i < CASOS; i++) {
    const fuera = 10001 + r.entero(100000);
    const campos = ['eligibilityFactorBps', 'haircutBps', 'concentrationFactorBps'] as const;
    const campo = campos[r.entero(3)] as (typeof campos)[number];
    const res = valorElegible({ ...base, [campo]: fuera }, '2026-09-22T00:00:00.000Z', 'ORIGEN');
    assert.equal(res.codigo, 'DENY_POLICY', `${campo}=${fuera} debería rechazarse`);
    assert.equal(res.valor, null);
  }

  /* Y dentro de rango, el valor nunca supera el valor bruto de la reserva. */
  for (let i = 0; i < CASOS; i++) {
    const res = valorElegible(
      {
        ...base,
        eligibilityFactorBps: r.entero(10001),
        haircutBps: r.entero(10001),
        concentrationFactorBps: r.entero(10001),
      },
      '2026-09-22T00:00:00.000Z',
      'ORIGEN',
    );
    if (res.codigo === 'ALLOW') {
      assert.ok((res.valor as bigint) <= base.netRealizableValueCents, 'descontar no puede aumentar');
    }
  }
});

test('propiedad · todo número de cuenta generado se valida, y tocarlo lo invalida', () => {
  for (let i = 0; i < 300; i++) {
    const cuerpo = digitosAleatorios();
    const numero = formatear(cuerpo);
    assert.ok(esNumeroValido(numero));

    /* Cambiar un dígito cualquiera rompe el control. */
    const pos = i % 12;
    const otro = String((Number(cuerpo[pos]) + 1 + (i % 9)) % 10);
    if (otro === cuerpo[pos]) continue;
    const alterado = cuerpo.slice(0, pos) + otro + cuerpo.slice(pos + 1);
    assert.notEqual(
      digitoDeControl(alterado),
      digitoDeControl(cuerpo),
      `una sustitución en la posición ${pos} pasó desapercibida`,
    );
  }
});
