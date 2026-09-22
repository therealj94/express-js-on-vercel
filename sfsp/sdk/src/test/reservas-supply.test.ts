/* Reservas, capacidad y suministro nativo: las reglas que el código impone. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { valorElegible, valorElegibleTotal, capacidadAutorizada } from '../reservas.js';
import type { ReserveAsset } from '../reservas.js';
import {
  suministroNativo,
  esQuemaReconocida,
  liberado,
  puedeLiberar,
  coberturaBps,
} from '../supply.js';
import { ErrorSFSP } from '../codigos.js';

const AHORA = '2026-09-22T00:00:00.000Z';

function reserva(over: Partial<ReserveAsset> = {}): ReserveAsset {
  return {
    reserveAssetId: 'res_sintetica',
    tier: 'A',
    netRealizableValueCents: 1_000_000n, // USD 10.000
    eligibilityFactorBps: 10000,
    haircutBps: 0,
    concentrationFactorBps: 10000,
    expiresAtISO: '2027-01-01T00:00:00.000Z',
    asignadaA: [],
    evidenceHash: 'sha256:sintetico',
    estado: 'ELIGIBLE',
    ...over,
  };
}

test('sin metodología aprobada la reserva no vale un número, vale BLOCKED_DECISION', () => {
  const r = valorElegible(reserva({ haircutBps: null }), AHORA, 'ORIGEN');
  assert.equal(r.codigo, 'BLOCKED_DECISION');
  assert.equal(r.decision, 'D04');
  assert.equal(r.valor, null);
});

test('los tres factores se aplican una sola vez cada uno', () => {
  const r = valorElegible(
    reserva({ eligibilityFactorBps: 8000, haircutBps: 2500, concentrationFactorBps: 9000 }),
    AHORA,
    'ORIGEN',
  );
  assert.equal(r.codigo, 'ALLOW');
  /* 1.000.000 × 0,80 × 0,75 × 0,90 = 540.000 */
  assert.equal(r.valor, 540_000n);
});

test('una reserva vencida o ya asignada a otra obligación aporta cero', () => {
  const vencida = valorElegible(reserva({ expiresAtISO: '2026-01-01T00:00:00.000Z' }), AHORA, 'ORIGEN');
  assert.equal(vencida.codigo, 'DENY_ASSET_STATE');

  const asignada = valorElegible(reserva({ asignadaA: ['AUKA'] }), AHORA, 'ORIGEN');
  assert.equal(asignada.codigo, 'DENY_LIMIT');

  /* El mismo oro no respalda dos cosas: en el total, esa reserva suma cero. */
  const total = valorElegibleTotal(
    [reserva(), reserva({ reserveAssetId: 'res_b', asignadaA: ['AUKA'] })],
    AHORA,
    'ORIGEN',
  );
  assert.equal(total.codigo, 'ALLOW');
  assert.equal(total.valor, 1_000_000n);
});

test('una reserva bloqueada bloquea el total entero', () => {
  const total = valorElegibleTotal(
    [reserva(), reserva({ reserveAssetId: 'res_b', eligibilityFactorBps: null })],
    AHORA,
    'ORIGEN',
  );
  assert.equal(total.codigo, 'BLOCKED_DECISION');
});

test('la capacidad exige precio aprobado y decimales conocidos', () => {
  const sinPrecio = capacidadAutorizada(1_000_000n, null, 18);
  assert.equal(sinPrecio.codigo, 'BLOCKED_DECISION');
  assert.equal(sinPrecio.decision, 'D01');

  const sinDecimales = capacidadAutorizada(1_000_000n, 215n, null);
  assert.equal(sinDecimales.codigo, 'UNKNOWN_SOURCE');

  /* USD 10.000 a 2,15 por unidad, con 18 decimales. */
  const ok = capacidadAutorizada(1_000_000n, 215n, 18);
  assert.equal(ok.codigo, 'ALLOW');
  assert.equal(ok.valor, (1_000_000n * 10n ** 18n) / 215n);
});

test('el suministro nativo no baja por mandar monedas a una dirección sin llave', () => {
  const s = suministroNativo({ genesis: 1000n, emisionDeConsenso: 50n, quemaDeProtocolo: 0n });
  assert.equal(s, 1050n);

  /* Mandar a 0x000...dead no es una quema reconocida. */
  assert.equal(esQuemaReconocida('0x000000000000000000000000000000000000dEaD'), false);

  /* Sólo una quema de protocolo la reduce. */
  assert.equal(suministroNativo({ genesis: 1000n, emisionDeConsenso: 50n, quemaDeProtocolo: 30n }), 1020n);
  assert.throws(
    () => suministroNativo({ genesis: 100n, emisionDeConsenso: 0n, quemaDeProtocolo: 200n }),
    ErrorSFSP,
  );
});

test('depositar en tesorería no vuelve las unidades no emitidas', () => {
  /* El perímetro de no activado es inventario inmovilizado, no cualquier cosa
     que esté en una cuenta de la empresa. */
  assert.equal(liberado({ suministroNativo: 1000n, noActivado: 400n }), 600n);
  assert.throws(() => liberado({ suministroNativo: 1000n, noActivado: 1200n }), ErrorSFSP);
});

test('liberar exige techo y capacidad, y respeta el mínimo de los dos', () => {
  const perimetro = { suministroNativo: 1000n, noActivado: 400n }; // liberado = 600

  const sinTecho = puedeLiberar({ cantidad: 10n, perimetro, releaseCap: null, racUnits: 900n });
  assert.equal(sinTecho.codigo, 'BLOCKED_DECISION');
  assert.equal(sinTecho.decision, 'D03');

  const sinCapacidad = puedeLiberar({ cantidad: 10n, perimetro, releaseCap: 900n, racUnits: null });
  assert.equal(sinCapacidad.codigo, 'BLOCKED_DECISION');
  assert.equal(sinCapacidad.decision, 'D04');

  /* Con techo 900 y capacidad 650, manda 650: 600 + 60 se pasa. */
  const pasado = puedeLiberar({ cantidad: 60n, perimetro, releaseCap: 900n, racUnits: 650n });
  assert.equal(pasado.codigo, 'DENY_LIMIT');

  const ok = puedeLiberar({ cantidad: 50n, perimetro, releaseCap: 900n, racUnits: 650n });
  assert.equal(ok.codigo, 'ALLOW');
  assert.equal(ok.valor, 650n);

  /* Ampliar el techo no sirve de nada si la capacidad de reservas no sube. */
  const techoMasAlto = puedeLiberar({ cantidad: 60n, perimetro, releaseCap: 100000n, racUnits: 650n });
  assert.equal(techoMasAlto.codigo, 'DENY_LIMIT');
});

test('la cobertura descuenta la escala de decimales', () => {
  const unidades = 1000n * 10n ** 18n; // mil unidades enteras
  const bloqueada = coberturaBps(1_000_000n, unidades, null, 18);
  assert.equal(bloqueada.codigo, 'BLOCKED_DECISION');

  const sinDecimales = coberturaBps(1_000_000n, unidades, 215n, null);
  assert.equal(sinDecimales.codigo, 'UNKNOWN_SOURCE');

  /* Exigido: 1000 × 215 centavos = 215.000. Elegible 1.000.000 → 465 %. */
  const r = coberturaBps(1_000_000n, unidades, 215n, 18);
  assert.equal(r.codigo, 'ALLOW');
  assert.equal(r.valor, 46511);
});
