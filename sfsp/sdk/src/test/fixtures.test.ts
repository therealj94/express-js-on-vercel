/* Los fixtures sintéticos se usan de verdad (C04).
 *
  * Los archivos de `fixtures/` existían sin que ninguna prueba los
 * abriera. Eso es peor que no tenerlos: un lector razonable supone que si están
 * ahí es porque algo los ejercita, y la cobertura parecía mayor de lo que era.
 *
 * Ahora cada uno se carga, se valida contra los tipos del SDK y se usa en un
 * recorrido real. Si alguien edita un fixture y lo deja incoherente, esta suite
 * lo dice. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { raizSFSP } from '../rutas.js';
import { DirectorioDeCuentas } from '../directorio.js';
import { migrarCuentas } from '../migracionCuentas.js';
import type { CuentaDeOrigen } from '../migracionCuentas.js';
import { valorElegibleTotal } from '../reservas.js';
import type { ReserveAsset } from '../reservas.js';
import { esNumeroValido } from '../numeroCuenta.js';
import type { AssetPassport } from '../tipos.js';

const RAIZ = raizSFSP();
if (!RAIZ) throw new Error('no se encontró la raíz del árbol SFSP');

const leer = <T>(nombre: string): T =>
  JSON.parse(readFileSync(join(RAIZ, 'fixtures', nombre), 'utf8')) as T;

test('todo fixture se declara sintético', () => {
  for (const nombre of [
    'censo-sintetico.json',
    'pasaportes-sinteticos.json',
    'reservas-sinteticas.json',
    'autorizacion-sintetica.json',
    'vectores-autorizacion.json',
  ]) {
    const f = leer<{ sintetico: boolean; advertencia?: string }>(nombre);
    assert.equal(f.sintetico, true, `${nombre} debe declararse sintético`);
    assert.ok(typeof f.advertencia === 'string' && f.advertencia.length > 20, `${nombre} sin advertencia`);
  }
});

test('el censo sintético migra y cuadra', () => {
  const f = leer<{ cuentas: CuentaDeOrigen[] }>('censo-sintetico.json');
  assert.ok(f.cuentas.length >= 4, 'el censo tiene que cubrir varios perfiles');

  const d = new DirectorioDeCuentas();
  const r = migrarCuentas(f.cuentas, d, { modo: 'APLICAR', fechaISO: '2026-09-22T00:00:00.000Z' });

  assert.ok(r.cuadra, `el censo de ejemplo debería cuadrar: ${JSON.stringify(r.excepciones)}`);
  assert.equal(r.cuentasSFSP, f.cuentas.length);
  for (const par of r.pares) assert.ok(esNumeroValido(par.accountNumber));

  /* Incluye a propósito una cuenta sin saldo: tiene que recibir número igual. */
  const sinSaldo = f.cuentas.find((c) => Object.values(c.saldos).every((v) => BigInt(v) === 0n));
  assert.ok(sinSaldo, 'el censo debe incluir una cuenta vacía');
  assert.ok(r.pares.some((p) => p.refCuentaOrigen === sinSaldo.refCuentaOrigen));
});

test('los pasaportes sintéticos respetan las reglas del perfil', () => {
  const f = leer<{ pasaportes: AssetPassport[] }>('pasaportes-sinteticos.json');
  assert.ok(f.pasaportes.length >= 3);

  for (const p of f.pasaportes) {
    /* Un activo legacy NO puede declarar que impone restricciones: si su
       transfer() no pasa por SFSP, no hay nada que imponer. */
    if (p.implementationProfile === 'LEGACY_REGISTERED') {
      assert.equal(p.enforcementScope.directTransferBypass, true, `${p.assetId}: legacy sin bypass`);
      assert.equal(
        p.enforcementScope.transferRestrictions,
        false,
        `${p.assetId}: un legacy no puede prometer restricciones`,
      );
    }
    if (p.implementationProfile === 'SFSP_ENFORCED') {
      assert.equal(p.enforcementScope.directTransferBypass, false, `${p.assetId}: no puede tener atajo`);
    }
    /* La unidad nativa no se simula como un contrato. */
    if (p.assetKind === 'NATIVE') {
      assert.equal(p.settlementLocation.address, null, `${p.assetId}: address(0) no es un ERC-20`);
    }
    /* Ningún pasaporte de ejemplo llega con clasificación jurídica: la fija D08. */
    assert.equal(p.legalClass, null, `${p.assetId}: la clase jurídica la fija D08`);
  }
});

test('las reservas sintéticas cubren los cinco tiers y la asignación exclusiva', () => {
  const f = leer<{ reservas: ReserveAsset[] }>('reservas-sinteticas.json');
  const tiers = new Set(f.reservas.map((r) => r.tier));
  assert.equal(tiers.size, 5, 'hacen falta los cinco tiers');

  const reservas = f.reservas.map((r) => ({
    ...r,
    netRealizableValueCents: BigInt(r.netRealizableValueCents as unknown as string | number),
  }));

  const paraOrigen = valorElegibleTotal(reservas, '2026-09-22T00:00:00.000Z', 'ORIGEN');
  assert.equal(paraOrigen.codigo, 'ALLOW');

  /* La reserva asignada a AUKA no puede contar para ORIGEN. */
  const asignada = reservas.find((r) => r.asignadaA === 'AUKA');
  assert.ok(asignada, 'el fixture debe incluir una reserva asignada en exclusiva');
  assert.ok(
    paraOrigen.valor?.descartadas.some((d) => d.reserveAssetId === asignada.reserveAssetId),
    'la reserva asignada a AUKA tiene que quedar descartada para ORIGEN',
  );

  /* El tier E entra con cero: estar en el expediente no es ser elegible. */
  const e = reservas.find((r) => r.tier === 'E');
  assert.ok(e && e.eligibilityFactorBps === 0, 'el tier E del ejemplo debe aportar cero');
});

test('el objeto con approved true del fixture no tiene forma de autorización', () => {
  const f = leer<{
    autorizacion: Record<string, unknown>;
    casosNegativos: { aprobadoPorJson: Record<string, unknown> };
  }>('autorizacion-sintetica.json');

  /* La autorización de ejemplo trae todos los campos del §2.4. */
  for (const campo of [
    'schemaVersion', 'authorizationId', 'actionId', 'chainId', 'verifyingContract',
    'assetId', 'amount', 'destination', 'policyVersion', 'evidenceRoot',
    'nonce', 'notBefore', 'expiry', 'approvals',
  ]) {
    assert.ok(campo in f.autorizacion, `a la autorización de ejemplo le falta ${campo}`);
  }
  assert.equal(typeof f.autorizacion['amount'], 'string', 'el monto va como cadena, nunca como número');

  /* Y el caso negativo sigue siendo lo que dice ser: un objeto que NO es una
     autorización por mucho que diga approved. */
  const falso = f.casosNegativos.aprobadoPorJson;
  assert.equal(falso['approved'], true);
  assert.equal('nonce' in falso, false);
  assert.equal('approvals' in falso, false);
});
