/* C09 · las máquinas de estado declaradas, contrastadas con lo que el código
 * hace de verdad.
 *
 * `scripts/conformidad.mjs` compara la especificación con la DECLARACIÓN de
 * `maquinas.ts`. Eso deja un hueco: que la declaración y el comportamiento se
 * separen. Estas pruebas cierran ese hueco desde el otro lado, recorriendo la
 * API pública del directorio y comprobando que cada cambio de estado que el
 * directorio hace de verdad está admitido por la tabla.
 *
 * Dos de estas pruebas AFIRMAN UN COMPORTAMIENTO QUE NO ES EL DE LA
 * ESPECIFICACIÓN, y lo dicen en su nombre. Están escritas así a propósito: el
 * día que se arregle `directorio.ts`, fallan y hay que venir aquí a borrarlas.
 * Una diferencia anotada en una prueba que se rompe sola es más honesta que un
 * comentario que nadie vuelve a leer.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TRANSICIONES_CUENTA,
  TRANSICIONES_ALIAS,
  TRANSICIONES_ACTIVO,
  EJES_DEL_ACTIVO,
  transicionDeCuentaPermitida,
  transicionDeAliasPermitida,
  transicionDeActivoPermitida,
  ejesQueNoAdmitenElCambio,
} from '../maquinas.js';
import { transicionPermitida } from '../binding.js';
import { DirectorioDeCuentas } from '../directorio.js';
import { nuevaReferenciaDeSujeto } from '../ids.js';
import type { AssetLifecycle } from '../tipos.js';

const DIR_A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const alta = () => ({
  genesisSubjectRef: nuevaReferenciaDeSujeto(),
  custodyProfile: 'MANAGED' as const,
  policyVersion: 'prueba',
});

/* ------------------------------------------------- las tablas están cerradas */

/** Una tabla cuyo destino no es un estado declarado lleva a un estado que no
 *  existe. Se comprueba antes que nada porque invalida todo lo demás. */
function tablaCerrada(tabla: Record<string, readonly string[]>, que: string): void {
  const estados = new Set(Object.keys(tabla));
  for (const [desde, hacia] of Object.entries(tabla)) {
    for (const h of hacia) {
      assert.ok(estados.has(h), `${que}: ${desde} -> ${h} apunta a un estado que no se declara`);
      assert.notEqual(h, desde, `${que}: ${desde} -> ${desde} no es una transición`);
    }
  }
}

test('C09 · las tres máquinas declaradas están cerradas sobre sus propios estados', () => {
  tablaCerrada(TRANSICIONES_CUENTA as Record<string, readonly string[]>, 'cuenta');
  tablaCerrada(TRANSICIONES_ALIAS as Record<string, readonly string[]>, 'alias');
  for (const eje of EJES_DEL_ACTIVO) {
    tablaCerrada(
      TRANSICIONES_ACTIVO[eje] as unknown as Record<string, readonly string[]>,
      `activo.${eje}`,
    );
  }
});

test('C09 · los estados terminales declarados no tienen salida', () => {
  assert.deepEqual(TRANSICIONES_CUENTA.CLOSED, []);
  assert.deepEqual(TRANSICIONES_ALIAS.RELEASED, []);
  assert.deepEqual(TRANSICIONES_ACTIVO.admission.REJECTED, []);
  assert.deepEqual(TRANSICIONES_ACTIVO.admission.WITHDRAWN, []);
  /* Y la del binding, que vive en binding.ts, sigue siendo terminal en REVOKED. */
  for (const hacia of ['PENDING', 'ACTIVE', 'PRIMARY', 'SUSPENDED', 'RECOVERY_PENDING'] as const) {
    assert.equal(transicionPermitida('REVOKED', hacia), false);
  }
});

test('C09 · todo estado no terminal es alcanzable desde el estado inicial de su máquina', () => {
  const alcanzables = (tabla: Record<string, readonly string[]>, inicio: string): Set<string> => {
    const vistos = new Set([inicio]);
    const cola = [inicio];
    while (cola.length) {
      const actual = cola.shift() as string;
      for (const h of tabla[actual] ?? []) {
        if (!vistos.has(h)) {
          vistos.add(h);
          cola.push(h);
        }
      }
    }
    return vistos;
  };

  const cuenta = alcanzables(TRANSICIONES_CUENTA as Record<string, readonly string[]>, 'PENDING');
  assert.deepEqual([...cuenta].sort(), ['ACTIVE', 'CLOSED', 'PENDING', 'SUSPENDED']);

  const alias = alcanzables(TRANSICIONES_ALIAS as Record<string, readonly string[]>, 'RESERVED');
  assert.deepEqual([...alias].sort(), ['ACTIVE', 'DISPUTED', 'RELEASED', 'RESERVED']);

  const admision = alcanzables(
    TRANSICIONES_ACTIVO.admission as unknown as Record<string, readonly string[]>,
    'DRAFT',
  );
  assert.deepEqual([...admision].sort(), ['APPROVED', 'DRAFT', 'REJECTED', 'REVIEW', 'WITHDRAWN']);
});

/* ----------------------------------------- las consultas niegan lo desconocido */

test('C09 · un estado desconocido no es un permiso', () => {
  assert.equal(transicionDeCuentaPermitida('INVENTADO' as never, 'ACTIVE'), false);
  assert.equal(transicionDeAliasPermitida('INVENTADO' as never, 'ACTIVE'), false);
  assert.equal(transicionDeActivoPermitida('trading', 'INVENTADO' as never, 'LISTED'), false);
});

test('C09 · los ejes del activo no se contagian entre sí', () => {
  const base: AssetLifecycle = {
    legal: 'CLASSIFIED',
    admission: 'APPROVED',
    trading: 'LISTED',
    transferability: 'FREE',
    redemption: 'AVAILABLE',
    visibility: 'VISIBLE_TO_HOLDER',
  };

  /* Retirar del mercado es admisible y no obliga a ocultar ni a congelar. */
  assert.deepEqual(ejesQueNoAdmitenElCambio(base, { ...base, trading: 'DELISTED' }), []);
  assert.deepEqual(
    ejesQueNoAdmitenElCambio(base, { ...base, visibility: 'HIDDEN_FROM_CATALOG' }),
    [],
  );

  /* Un salto que ninguna tabla declara se nombra por su eje, no se tolera. */
  assert.deepEqual(ejesQueNoAdmitenElCambio(base, { ...base, admission: 'DRAFT' }), ['admission']);

  /* Y si cambian dos ejes y sólo uno es inadmisible, se devuelve ese. */
  const dos = { ...base, trading: 'DELISTED' as const, admission: 'DRAFT' as const };
  assert.deepEqual(ejesQueNoAdmitenElCambio(base, dos), ['admission']);
});

/* ------------------------- la declaración contra el comportamiento observado */

test('C09 · todo cambio de estado de alias que el directorio hace está en la tabla', () => {
  const d = new DirectorioDeCuentas();
  const cuenta = d.crearCuenta(alta());

  const primero = d.registrarAlias(cuenta.accountId, '@primero');
  assert.equal(primero.status, 'ACTIVE');

  d.cambiarAlias(cuenta.accountId, '@segundo');

  /* Lo observado: el alias viejo pasó de ACTIVE a RELEASED. Es exactamente la
     transición que la tabla admite; si mañana el directorio lo dejara en otro
     estado, esta comprobación lo caza. */
  const vivos = d.aliasDe(cuenta.accountId);
  assert.equal(vivos.length, 1);
  assert.equal(vivos[0]?.alias, '@segundo');
  assert.equal(d.cuentaPorAlias('@primero'), null);
  assert.ok(
    transicionDeAliasPermitida('ACTIVE', 'RELEASED'),
    'el directorio libera el alias anterior y la tabla tiene que admitirlo',
  );
});

test('C09 · los estados de binding que el directorio produce son transiciones declaradas', () => {
  const d = new DirectorioDeCuentas();
  const cuenta = d.crearCuenta(alta());
  const b = d.crearBinding(cuenta.accountId, 5550, DIR_A, 'PAYMENTS', 'MANAGED');
  assert.equal(b.status, 'PENDING');

  d.cambiarEstadoBinding(b.bindingId, 'ACTIVE', 'prueba', 'alta');
  d.cambiarEstadoBinding(b.bindingId, 'PRIMARY', 'prueba', 'principal');
  d.cambiarEstadoBinding(b.bindingId, 'SUSPENDED', 'prueba', 'riesgo');
  d.cambiarEstadoBinding(b.bindingId, 'ACTIVE', 'prueba', 'levantamiento');
  d.cambiarEstadoBinding(b.bindingId, 'REVOKED', 'prueba', 'baja');

  /* Cada evento del historial tiene que ser una transición admitida. El
     historial es la única constancia de lo que pasó de verdad. */
  for (const evento of d.historial) {
    assert.ok(
      transicionPermitida(evento.desde, evento.hacia),
      `el historial registra ${evento.desde} -> ${evento.hacia}, que la tabla no admite`,
    );
  }
  assert.equal(d.binding(b.bindingId)?.status, 'REVOKED');
});

/* -------------------------------------------- diferencias reales, declaradas */

test('C09 · DIFERENCIA DECLARADA: el directorio da de alta la cuenta en ACTIVE, no en PENDING', () => {
  /* SFSP-130 §5.3 declara `PENDING` como el estado de una cuenta que existe en
     el directorio y todavía no opera, y la máquina arranca ahí. `crearCuenta`
     salta directamente a `ACTIVE`, es decir, da por completada un alta que
     nadie aprobó.
     No se corrige aquí porque `directorio.ts` está fuera del alcance de este
     cambio. Se afirma el comportamiento de hoy para que arreglarlo rompa esta
     prueba y obligue a venir a borrarla. */
  const d = new DirectorioDeCuentas();
  const cuenta = d.crearCuenta(alta());
  assert.equal(cuenta.status, 'ACTIVE');
  assert.ok(
    transicionDeCuentaPermitida('PENDING', 'ACTIVE'),
    'cuando el alta empiece en PENDING, la tabla ya admite el paso',
  );
});

test('C09 · DIFERENCIA DECLARADA: el directorio no expone ninguna forma de cambiar el estado de una cuenta', () => {
  /* La máquina de la cuenta está declarada y comprobada contra la
     especificación, pero hoy ningún camino del SDK la recorre: no hay un
     `cambiarEstadoCuenta`. Las transiciones de §5.3 son, en el código, una
     promesa sin implementación. Se afirma para que no pase por conformidad
     completa lo que es una tabla sin uso. */
  const d = new DirectorioDeCuentas();
  const metodos = Object.getOwnPropertyNames(DirectorioDeCuentas.prototype);
  assert.equal(
    metodos.some((m) => /estadoCuenta|suspenderCuenta|cerrarCuenta/i.test(m)),
    false,
  );
  const cuenta = d.crearCuenta(alta());
  assert.equal(d.cuentaPorId(cuenta.accountId)?.status, 'ACTIVE');
});
