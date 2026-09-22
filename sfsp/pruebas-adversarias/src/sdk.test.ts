/* Una prueba por hallazgo de la auditoría independiente del 22-sep-2026.
 *
 * Estas pruebas NO están aquí para demostrar que el código funciona. Están
 * aquí porque cada una reproduce un defecto real que alguien encontró, y su
 * trabajo es volverse roja el día que ese defecto regrese.
 *
 * Cada `test` lleva el identificador del hallazgo en el nombre. Si una se
 * pone en rojo, hay que buscar ese identificador en
 * `sfsp/auditoria/informes/` y leer qué era.
 *
 * Las que corresponden a contratos y a la API de admisión viven en sus propias
 * suites, junto al código que arreglan. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  DirectorioDeCuentas,
  migrarCuentas,
  revalidarDestino,
  valorElegible,
  valorElegibleTotal,
  coberturaBps,
  puedeLiberar,
  capacidadDeRecuperacion,
  parametro,
  cargarDecisiones,
  huellaDeDecisiones,
  nuevaReferenciaDeSujeto,
  ErrorSFSP,
} from '../../sdk/dist/index.js';
import type { CuentaDeOrigen, ReserveAsset, AssetPassport } from '../../sdk/dist/index.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(aqui, '..', '..');

const DIR_A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const DIR_B = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

const alta = () => ({
  genesisSubjectRef: nuevaReferenciaDeSujeto(),
  custodyProfile: 'MANAGED' as const,
  policyVersion: 'prueba',
  /* Estas pruebas atacan la revalidación del destino, y para revalidar un
     destino la cuenta tiene que poder resolver. El alta nace PENDING desde que
     se cerró la divergencia de C09; aquí se pide ACTIVE a la cara. */
  status: 'ACTIVE' as const,
});

/* La vigencia arranca antes del instante que usan las pruebas: si el binding
   naciera «ahora», una prueba fechada más temprano vería la ruta como todavía
   no vigente y fallaría por un motivo que no es el que se está probando. */
const DESDE = '2026-01-01T00:00:00.000Z';

function cuentaConRutaPrimaria(d: DirectorioDeCuentas, direccion: string) {
  const c = d.crearCuenta(alta());
  const b = d.crearBinding(c.accountId, 5550, direccion, 'PAYMENTS', 'MANAGED', DESDE, null);
  d.cambiarEstadoBinding(b.bindingId, 'ACTIVE', 'prueba', 'alta');
  d.cambiarEstadoBinding(b.bindingId, 'PRIMARY', 'prueba', 'principal');
  return { cuenta: c, binding: d.binding(b.bindingId)! };
}

/* ─────────────────────────────── H07 ─────────────────────────────── */

test('H07a · una instantánea aísla de verdad: restaurar no deja dos rutas primarias', () => {
  const d = new DirectorioDeCuentas();

  /* La reproducción exacta del auditor: A primaria, instantánea, B primaria,
     restaurar, C primaria. Con clones superficiales quedaban DOS primarias. */
  const a = cuentaConRutaPrimaria(d, DIR_A);
  const punto = d.instantanea();

  const bind2 = d.crearBinding(a.cuenta.accountId, 5550, DIR_B, 'PAYMENTS', 'MANAGED', DESDE, null);
  d.cambiarEstadoBinding(bind2.bindingId, 'ACTIVE', 'prueba', 'alta');
  d.cambiarEstadoBinding(bind2.bindingId, 'PRIMARY', 'prueba', 'segunda');

  d.restaurar(punto);

  const bind3 = d.crearBinding(a.cuenta.accountId, 5550, DIR_B, 'PAYMENTS', 'MANAGED', DESDE, null);
  d.cambiarEstadoBinding(bind3.bindingId, 'ACTIVE', 'prueba', 'alta');
  d.cambiarEstadoBinding(bind3.bindingId, 'PRIMARY', 'prueba', 'tercera');

  assert.equal(d.rutasPrimarias(a.cuenta.accountId), 1, 'nunca puede haber dos rutas primarias');
  assert.deepEqual(d.invariantes(), []);
});

test('H07b · mutar lo que devuelve un lector no cambia el estado interno', () => {
  const d = new DirectorioDeCuentas();
  const { cuenta, binding } = cuentaConRutaPrimaria(d, DIR_A);

  const numeroReal = cuenta.accountNumber;

  /* Antes, los lectores devolvían la referencia viva: esto cambiaba el número
     de cuenta de verdad, y revivía una ruta revocada sin pasar por ninguna
     validación. */
  const leida = d.cuentaPorId(cuenta.accountId) as { accountNumber: string };
  try {
    leida.accountNumber = 'SF-0000-0000-0000-0';
  } catch {
    /* congelado: también vale */
  }
  assert.equal(d.cuentaPorId(cuenta.accountId)?.accountNumber, numeroReal);

  d.cambiarEstadoBinding(binding.bindingId, 'REVOKED', 'prueba', 'baja');
  const revocada = d.binding(binding.bindingId) as { status: string };
  try {
    revocada.status = 'ACTIVE';
  } catch {
    /* congelado: también vale */
  }
  assert.equal(d.binding(binding.bindingId)?.status, 'REVOKED', 'una ruta revocada no revive');
  assert.deepEqual(d.invariantes(), []);
});

/* ─────────────────────────────── H08 ─────────────────────────────── */

test('H08 · la revalidación rechaza un destino alterado', () => {
  const d = new DirectorioDeCuentas();
  const { cuenta, binding } = cuentaConRutaPrimaria(d, DIR_A);
  const ahora = '2026-09-22T00:00:00.000Z';
  const dentro = '2026-09-22T00:00:30.000Z';

  const buena = d.resolver(cuenta.accountNumber, 5550, ahora);
  revalidarDestino(buena, d.binding(binding.bindingId)!, dentro); // no lanza

  /* Cambiar la dirección de la resolución tiene que fallar: es el caso en el
     que el dinero se va a otro sitio. */
  assert.throws(
    () => revalidarDestino({ ...buena, address: DIR_B }, d.binding(binding.bindingId)!, dentro),
    ErrorSFSP,
  );
  assert.throws(
    () => revalidarDestino({ ...buena, chainId: 1 }, d.binding(binding.bindingId)!, dentro),
    ErrorSFSP,
  );
  assert.throws(
    () => revalidarDestino({ ...buena, accountId: 'acc_otro' }, d.binding(binding.bindingId)!, dentro),
    ErrorSFSP,
  );
});

test('H08 · una fecha inválida no atraviesa el control convertida en NaN', () => {
  const d = new DirectorioDeCuentas();
  const { cuenta, binding } = cuentaConRutaPrimaria(d, DIR_A);
  const ahora = '2026-09-22T00:00:00.000Z';
  const buena = d.resolver(cuenta.accountNumber, 5550, ahora);

  for (const fecha of ['no-es-una-fecha', '', 'mañana']) {
    assert.throws(
      () =>
        revalidarDestino(
          { ...buena, expiraEnISO: fecha },
          d.binding(binding.bindingId)!,
          '2026-09-22T00:00:30.000Z',
        ),
      ErrorSFSP,
      `la caducidad "${fecha}" no puede pasar el control`,
    );
  }
});

/* ─────────────────────────────── H09 ─────────────────────────────── */

const reservaBase = (over: Partial<ReserveAsset> = {}): ReserveAsset => ({
  reserveAssetId: 'res_x',
  tier: 'A',
  netRealizableValueCents: 1_000_000n,
  eligibilityFactorBps: 10000,
  haircutBps: 0,
  concentrationFactorBps: 10000,
  expiresAtISO: '2027-01-01T00:00:00.000Z',
  asignadaA: null,
  evidenceHash: 'sha256:sintetico',
  estado: 'ELIGIBLE',
  ...over,
});

test('H09 · el mismo oro no se cuenta dos veces', () => {
  const r = reservaBase();
  const total = valorElegibleTotal([r, { ...r }], '2026-09-22T00:00:00.000Z', 'ORIGEN');
  assert.equal(total.valor?.valorCents, 1_000_000n);
  assert.equal(total.valor?.duplicadas.length, 1);
});

test('H09 · un factor del 200 % se rechaza', () => {
  const r = valorElegible(
    reservaBase({ eligibilityFactorBps: 20000 }),
    '2026-09-22T00:00:00.000Z',
    'ORIGEN',
  );
  assert.equal(r.codigo, 'DENY_POLICY');
});

/* ─────────────────────────────── H12 ─────────────────────────────── */

test('H12 · la cobertura no se redondea a favor ni pierde precisión', () => {
  const r = coberturaBps(1n, 199n, 1n, 2);
  assert.equal(r.valor, 5025n, 'antes devolvía 10000, o sea cobertura total');

  const grande = coberturaBps(9007199254740993n, 1n, 1n, 0);
  assert.equal(grande.valor, 9007199254740993n * 10000n);
});

/* ─────────────────────────────── H13 ─────────────────────────────── */

test('H13 · no se libera más de lo que hay inmovilizado', () => {
  const r = puedeLiberar({
    cantidad: 20n,
    perimetro: { suministroNativo: 100n, noActivado: 10n },
    releaseCap: 200n,
    racUnits: 200n,
  });
  assert.equal(r.codigo, 'DENY_LIMIT');
});

/* ─────────────────────── H10, H11 y C08 ─────────────────────── */

const censo = (n: number, desde = 0): CuentaDeOrigen[] =>
  Array.from({ length: n }, (_, i) => ({
    refCuentaOrigen: `adv_${desde + i}`,
    genesisSubjectRef: nuevaReferenciaDeSujeto(),
    chainId: 5550,
    address: '0x' + (BigInt(desde + i) + 0x9000n).toString(16).padStart(40, '0'),
    custodyProfile: 'MANAGED' as const,
    saldos: { 'SFSP:MON:OG:ORIGEN': String(100 + i) },
  }));

test('H10 · dos aplicaciones sin pasar ningún mapa no duplican cuentas', () => {
  const d = new DirectorioDeCuentas();
  const c = censo(20);
  migrarCuentas(c, d, { modo: 'APLICAR' });
  migrarCuentas(c, d, { modo: 'APLICAR' });
  assert.equal(d.totalCuentas, 20, 'olvidar el mapa ya no puede duplicar a nadie');
});

test('H11 · un saldo ilegible produce un expediente y no aborta el lote', () => {
  const d = new DirectorioDeCuentas();
  const c = censo(5);
  (c[2] as CuentaDeOrigen).saldos = { 'SFSP:MON:OG:ORIGEN': 'UNKNOWN_SOURCE' };

  const r = migrarCuentas(c, d, { modo: 'SIMULACRO' });

  assert.equal(r.excepciones.length, 1, 'la cuenta ilegible queda como excepción');
  assert.equal(r.cuentasSFSP, 4, 'las otras cuatro se proponen igual');
  assert.equal(r.cuadra, false);
});

test('C08 · un simulacro no toca el directorio original, ni aunque falle', () => {
  const d = new DirectorioDeCuentas();
  const c = censo(10);
  (c[4] as CuentaDeOrigen).address = 'no-es-una-direccion';

  migrarCuentas(c, d, { modo: 'SIMULACRO' });

  assert.equal(d.totalCuentas, 0, 'el original queda intacto');
  assert.equal(d.totalOrigenesLigados, 0);
});

/* ─────────────────────────────── H21 y C07 ─────────────────────────────── */

test('H21 · un parámetro con valor pero con su decisión pendiente sigue bloqueado', () => {
  const archivo = cargarDecisiones(join(RAIZ, 'DECISIONES-SFSP.json'));

  /* Se simula que alguien escribió un número en el archivo sin aprobar D03. */
  const manipulado = {
    ...archivo,
    parametrosEconomicos: { ...archivo.parametrosEconomicos, releaseCap: 10 },
  };

  const r = parametro<number>(manipulado, 'releaseCap');
  assert.equal(r.codigo, 'BLOCKED_DECISION');
  assert.equal(r.decision, 'D03');
  assert.equal(r.valor, null, 'nunca devuelve el número');
});

test('C07 · la huella del archivo de decisiones cambia si el archivo cambia', () => {
  const a = huellaDeDecisiones('{"parametrosEconomicos":{"releaseCap":null}}');
  const b = huellaDeDecisiones('{"parametrosEconomicos":{"releaseCap":10}}');
  assert.notEqual(a, b);
  assert.equal(a.length, 64);
});

/* ─────────────────────────────── H25 ─────────────────────────────── */

const pasaporteLegacy = (): AssetPassport => ({
  assetId: 'SFSP:LEGACY:OG:X',
  issuerId: 'iss_0',
  legalInstrumentId: null,
  economicType: 'UNDEFINED',
  legalClass: null,
  jurisdiction: null,
  implementationProfile: 'LEGACY_REGISTERED',
  enforcementScope: {
    transferRestrictions: false,
    freeze: false,
    forcedTransfer: false,
    pause: false,
    directTransferBypass: true,
    notes: 'sintético',
  },
  assetKind: 'CONTRACT',
  settlementLocation: { chainId: 5550, address: null, codehash: null },
  unit: 'u',
  decimals: null,
  capabilities: [],
  rightsTemplate: null,
  documentRoot: null,
  reportStatus: 'NONE',
  riskStatus: { level: 'SIN_EVALUAR', methodologyVersion: null, evaluatedAt: null },
  transferPolicyId: null,
  redemptionPolicyId: null,
  listingPolicyId: null,
  supplySource: 'UNKNOWN',
  aliases: [],
  status: {
    legal: 'UNCLASSIFIED',
    admission: 'DRAFT',
    trading: 'NOT_LISTED',
    transferability: 'FREE',
    redemption: 'NONE',
    visibility: 'VISIBLE_TO_HOLDER',
  },
});

test('H25 · recuperar el acceso y recuperar fondos son alcances distintos', () => {
  const acceso = capacidadDeRecuperacion({
    perfil: 'MANAGED',
    pasaporte: pasaporteLegacy(),
    llavePerdida: false,
    poderAdministrativoDocumentado: false,
    politicaD19Aprobada: false,
  });
  assert.equal(acceso.alcance, 'ACCESO');
  assert.equal(acceso.ejecutable, true, 'restablecer el acceso no mueve nada y no espera a D19');

  const fondos = capacidadDeRecuperacion({
    perfil: 'MANAGED',
    pasaporte: pasaporteLegacy(),
    llavePerdida: true,
    poderAdministrativoDocumentado: true,
    politicaD19Aprobada: false,
  });
  assert.equal(fondos.alcance, 'FONDOS');
  assert.equal(fondos.ejecutable, false, 'mover posiciones sí espera a D19');
  assert.equal(fondos.decision, 'D19');
});

/* ─────────────────────────────── H22 y C02 ─────────────────────────────── */

test('H22, C02 · el verificador no emite evidencia en modo rápido', { skip: process.env['SFSP_DENTRO_DEL_VERIFICADOR'] === '1' ? 'ya se corre dentro del verificador' : false }, () => {
  /* Se comprueba el comportamiento, no el texto del archivo: el modo rápido
     tiene que salir con error y decir por qué no es una verificación completa. */
  let salida = '';
  let codigo = 0;
  try {
    salida = execFileSync('node', [join(RAIZ, 'scripts', 'verificar-todo.mjs'), '--rapido'], {
      cwd: RAIZ,
      encoding: 'utf8',
      timeout: 600_000,
    });
  } catch (error) {
    const e = error as { status?: number; stdout?: string };
    codigo = e.status ?? 1;
    salida = e.stdout ?? '';
  }
  assert.notEqual(codigo, 0, 'una corrida parcial no puede salir con éxito');
  assert.match(salida, /VERIFICACION_PARCIAL/);
  assert.match(salida, /MODO_RAPIDO/);
});

test('C02 · el verificador ve un árbol sucio, y no lo da por limpio', { skip: process.env['SFSP_DENTRO_DEL_VERIFICADOR'] === '1' ? 'ya se corre dentro del verificador' : false }, () => {
  /* Esta es la mitad de C02 que faltaba. La prueba de arriba afirmaba que el
     modo rápido no emite evidencia; nadie afirmaba que el árbol sucio se
     detecta. Y no se detectaba: el verificador corría ya dentro de sfsp/ y
     preguntaba a git por la ruta `sfsp`, es decir, por sfsp/sfsp. Una ruta que
     no casa con nada devuelve vacío sin error, y el vacío se leía como
     «limpio». El verificador escrito para impedir que saliera evidencia de un
     árbol sucio llevaba desde entonces firmando que estaba limpio sin mirar.

     Se ensucia con un archivo NUEVO en vez de tocar uno existente: si la
     prueba se muere a la mitad, lo peor que deja es un archivo de sobra, no un
     archivo del proyecto a medio restaurar. */
  const testigo = join(RAIZ, `.sucio-de-prueba-${process.pid}`);
  writeFileSync(testigo, 'este archivo existe para ensuciar el árbol\n');
  try {
    let salida = '';
    try {
      salida = execFileSync('node', [join(RAIZ, 'scripts', 'verificar-todo.mjs'), '--rapido'], {
        cwd: RAIZ,
        encoding: 'utf8',
        timeout: 600_000,
      });
    } catch (error) {
      salida = (error as { stdout?: string }).stdout ?? '';
    }
    assert.match(salida, /ARBOL_SUCIO/, 'un árbol con cambios sin guardar tiene que decirlo');
    assert.doesNotMatch(salida, /VERIFICACION_COMPLETA/);
  } finally {
    rmSync(testigo, { force: true });
  }
});
