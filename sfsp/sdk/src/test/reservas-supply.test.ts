/* Reservas, capacidad y suministro nativo: las reglas que el código impone.
 *
 * Incluye los casos que la auditoría reprodujo para H09, H12 y H13. */

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
    asignadaA: null,
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

test('H09 · un factor fuera del rango 0 a 10000 se rechaza, no multiplica', () => {
  for (const campo of ['eligibilityFactorBps', 'concentrationFactorBps'] as const) {
    const r = valorElegible(reserva({ [campo]: 20000 }), AHORA, 'ORIGEN');
    assert.equal(r.codigo, 'DENY_POLICY', `${campo} a 20000 debe rechazarse`);
    assert.match(r.detalle, /fuera del rango/);
  }
  assert.equal(valorElegible(reserva({ haircutBps: -1 }), AHORA, 'ORIGEN').codigo, 'DENY_POLICY');
  assert.equal(valorElegible(reserva({ haircutBps: 10001 }), AHORA, 'ORIGEN').codigo, 'DENY_POLICY');
});

test('H09 · la misma reserva presentada dos veces se cuenta una sola', () => {
  const r = reserva();
  const total = valorElegibleTotal([r, { ...r }, { ...r }], AHORA, 'ORIGEN');
  assert.equal(total.codigo, 'ALLOW');
  assert.equal(total.valor?.valorCents, 1_000_000n, 'no puede sumar tres veces lo mismo');
  assert.equal(total.valor?.contadas, 1);
  assert.equal(total.valor?.duplicadas.length, 2);
});

test('H09 · una reserva asignada pertenece a una obligación, no a varias', () => {
  const asignada = reserva({ reserveAssetId: 'res_auka', asignadaA: 'AUKA' });

  /* Para AUKA cuenta. */
  const paraAuka = valorElegible(asignada, AHORA, 'AUKA');
  assert.equal(paraAuka.codigo, 'ALLOW');

  /* Para ORIGEN no: el mismo oro no respalda dos cosas. */
  const paraOrigen = valorElegible(asignada, AHORA, 'ORIGEN');
  assert.equal(paraOrigen.codigo, 'DENY_LIMIT');

  const total = valorElegibleTotal([reserva(), asignada], AHORA, 'ORIGEN');
  assert.equal(total.valor?.valorCents, 1_000_000n);
  assert.equal(total.valor?.descartadas.length, 1);
});

test('una reserva vencida aporta cero, y una fecha ilegible no aporta nada', () => {
  const vencida = valorElegible(reserva({ expiresAtISO: '2026-01-01T00:00:00.000Z' }), AHORA, 'ORIGEN');
  assert.equal(vencida.codigo, 'DENY_ASSET_STATE');

  const ilegible = valorElegible(reserva({ expiresAtISO: 'ayer' }), AHORA, 'ORIGEN');
  assert.equal(ilegible.codigo, 'UNKNOWN_SOURCE');
});

test('una reserva bloqueada bloquea el total entero', () => {
  const total = valorElegibleTotal(
    [reserva(), reserva({ reserveAssetId: 'res_b', eligibilityFactorBps: null })],
    AHORA,
    'ORIGEN',
  );
  assert.equal(total.codigo, 'BLOCKED_DECISION');
  assert.equal(total.valor, null);
});

test('la capacidad exige precio aprobado y decimales conocidos', () => {
  const sinPrecio = capacidadAutorizada(1_000_000n, null, 18);
  assert.equal(sinPrecio.codigo, 'BLOCKED_DECISION');
  assert.equal(sinPrecio.decision, 'D01');

  const sinDecimales = capacidadAutorizada(1_000_000n, 215n, null);
  assert.equal(sinDecimales.codigo, 'UNKNOWN_SOURCE');

  const ok = capacidadAutorizada(1_000_000n, 215n, 18);
  assert.equal(ok.codigo, 'ALLOW');
  assert.equal(ok.valor, (1_000_000n * 10n ** 18n) / 215n);
});

test('el suministro nativo no baja por mandar monedas a una dirección sin llave', () => {
  const s = suministroNativo({ genesis: 1000n, emisionDeConsenso: 50n, quemaDeProtocolo: 0n });
  assert.equal(s.codigo, 'ALLOW');
  assert.equal(s.valor, 1050n);

  assert.equal(esQuemaReconocida('0x000000000000000000000000000000000000dEaD'), false);

  const conQuema = suministroNativo({ genesis: 1000n, emisionDeConsenso: 50n, quemaDeProtocolo: 30n });
  assert.equal(conQuema.valor, 1020n);

  const imposible = suministroNativo({ genesis: 100n, emisionDeConsenso: 0n, quemaDeProtocolo: 200n });
  assert.equal(imposible.codigo, 'DENY_POLICY');
});

test('depositar en tesorería no vuelve las unidades no emitidas', () => {
  assert.equal(liberado({ suministroNativo: 1000n, noActivado: 400n }).valor, 600n);
  assert.equal(liberado({ suministroNativo: 1000n, noActivado: 1200n }).codigo, 'DENY_POLICY');
});

test('H13 · liberar exige inventario técnico inmovilizado, no sólo capacidad económica', () => {
  /* El caso exacto de la auditoría: supply 100, no activado 10, se piden 20,
     techo 200 y capacidad 200. Antes devolvía ALLOW con 110 liberados. */
  const r = puedeLiberar({
    cantidad: 20n,
    perimetro: { suministroNativo: 100n, noActivado: 10n },
    releaseCap: 200n,
    racUnits: 200n,
  });
  assert.equal(r.codigo, 'DENY_LIMIT');
  assert.match(r.detalle, /inventario inmovilizado/);

  /* Dentro del inventario sí pasa. */
  const ok = puedeLiberar({
    cantidad: 10n,
    perimetro: { suministroNativo: 100n, noActivado: 10n },
    releaseCap: 200n,
    racUnits: 200n,
  });
  assert.equal(ok.codigo, 'ALLOW');
  assert.equal(ok.valor, 100n);
});

test('liberar exige techo y capacidad, y respeta el mínimo de los dos', () => {
  const perimetro = { suministroNativo: 1000n, noActivado: 400n }; // liberado = 600

  const sinTecho = puedeLiberar({ cantidad: 10n, perimetro, releaseCap: null, racUnits: 900n });
  assert.equal(sinTecho.codigo, 'BLOCKED_DECISION');
  assert.equal(sinTecho.decision, 'D03');

  const sinCapacidad = puedeLiberar({ cantidad: 10n, perimetro, releaseCap: 900n, racUnits: null });
  assert.equal(sinCapacidad.codigo, 'BLOCKED_DECISION');
  assert.equal(sinCapacidad.decision, 'D04');

  const pasado = puedeLiberar({ cantidad: 60n, perimetro, releaseCap: 900n, racUnits: 650n });
  assert.equal(pasado.codigo, 'DENY_LIMIT');

  const ok = puedeLiberar({ cantidad: 50n, perimetro, releaseCap: 900n, racUnits: 650n });
  assert.equal(ok.codigo, 'ALLOW');
  assert.equal(ok.valor, 650n);

  /* Ampliar el techo no sirve de nada si la capacidad de reservas no sube. */
  const techoMasAlto = puedeLiberar({ cantidad: 60n, perimetro, releaseCap: 100000n, racUnits: 650n });
  assert.equal(techoMasAlto.codigo, 'DENY_LIMIT');
});

test('H12 · la cobertura es exacta y no se redondea a favor', () => {
  /* El caso de la auditoría: valor 1, unidades 199, referencia 1, 2 decimales.
     Exigido = 199/100 = 1,99 centavos; disponible = 1 → 5025 puntos básicos.
     La versión anterior truncaba el divisor a 1 y devolvía 10000, o sea
     cobertura total donde había la mitad. */
  const r = coberturaBps(1n, 199n, 1n, 2);
  assert.equal(r.codigo, 'ALLOW');
  assert.equal(r.valor, 5025n);

  /* Y no pierde precisión por encima del entero seguro de JavaScript. */
  const grande = coberturaBps(9007199254740993n, 10000n, 1n, 4);
  assert.equal(grande.codigo, 'ALLOW');
  assert.equal(grande.valor, (9007199254740993n * 10n ** 4n * 10000n) / (10000n * 1n));
  assert.ok((grande.valor as bigint) > BigInt(Number.MAX_SAFE_INTEGER));
});

test('la cobertura descuenta la escala de decimales', () => {
  const unidades = 1000n * 10n ** 18n; // mil unidades enteras
  assert.equal(coberturaBps(1_000_000n, unidades, null, 18).codigo, 'BLOCKED_DECISION');
  assert.equal(coberturaBps(1_000_000n, unidades, 215n, null).codigo, 'UNKNOWN_SOURCE');

  /* Exigido: 1000 × 215 centavos = 215.000. Elegible 1.000.000 → 465 %. */
  const r = coberturaBps(1_000_000n, unidades, 215n, 18);
  assert.equal(r.codigo, 'ALLOW');
  assert.equal(r.valor, 46511n);
});
