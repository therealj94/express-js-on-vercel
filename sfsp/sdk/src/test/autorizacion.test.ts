/* Autorización ligada al contenido: la mitad TypeScript.
 *
 * Corre contra `fixtures/vectores-autorizacion.json`, el MISMO archivo que lee
 * `contracts/test/09-authorization.js`. Si las dos implementaciones del digest
 * divergen en un solo vector, una de las dos suites se pone roja. Ésa es la
 * prueba que sostiene el patrón entero: sin ella, «lo mismo en los dos lados»
 * sería una afirmación sin evidencia. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  digestoDe,
  validarPayload,
  validarAtadura,
  validarVigencia,
  autorizar,
  crearRegistroConsumo,
  bytes32DeTexto,
  codificarPayload,
  ETIQUETA_DOMINIO,
  TYPEHASH_PAYLOAD,
  DOMINIO_AUTORIZACION,
  type PayloadAutorizacion,
} from '../autorizacion.js';

/* La ruta se busca subiendo desde este archivo hasta encontrar `fixtures/`.
 * Una ruta relativa fija se rompe al cambiar de `src/` a `dist/` o al correr el
 * archivo desde otro directorio, y una prueba que no corre no prueba nada (P07). */
function rutaVectores(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidata = join(dir, 'fixtures', 'vectores-autorizacion.json');
    if (existsSync(candidata)) return candidata;
    dir = join(dir, '..');
  }
  throw new Error('no se encontró fixtures/vectores-autorizacion.json');
}

interface Vector {
  id: string;
  sintetico: boolean;
  descripcion: string;
  hallazgos: string[];
  payload: PayloadAutorizacion;
  digest: string;
}
interface CasoVigencia {
  id: string;
  vector: string;
  ahoraSegundos: number;
  codigoEsperado: string;
  detalleEsperado: string;
  nota: string;
}
interface ArchivoVectores {
  sintetico: boolean;
  dominio: string;
  etiquetaDominio: string;
  typehashPayload: string;
  instanteReferencia: number;
  vectores: Vector[];
  vigencia: CasoVigencia[];
}

const VEC = JSON.parse(readFileSync(rutaVectores(), 'utf8')) as ArchivoVectores;

function porId(id: string): Vector {
  const v = VEC.vectores.find((x) => x.id === id);
  if (v === undefined) throw new Error(`vector inexistente: ${id}`);
  return v;
}

const T0 = VEC.instanteReferencia;
const b32 = (t: string): string => {
  const r = bytes32DeTexto(t);
  assert.equal(r.codigo, 'ALLOW');
  return r.valor as string;
};

// --------------------------------------------------------------- vectores

test('el archivo de vectores está marcado como sintético y no ha encogido', () => {
  assert.equal(VEC.sintetico, true, 'ningún dato real entra en fixtures');
  assert.ok(VEC.vectores.length >= 12, 'el juego de vectores no puede encogerse');
  for (const v of VEC.vectores) assert.equal(v.sintetico, true, `${v.id} sin marcar`);
});

test('las constantes de dominio y de tipo son las del archivo compartido', () => {
  assert.equal(VEC.dominio, DOMINIO_AUTORIZACION);
  assert.equal(VEC.etiquetaDominio, ETIQUETA_DOMINIO);
  assert.equal(VEC.typehashPayload, TYPEHASH_PAYLOAD);
});

test('CRUZADA: cada vector compartido produce su digest esperado', () => {
  for (const v of VEC.vectores) {
    const r = digestoDe(v.payload);
    assert.equal(r.codigo, 'ALLOW', `${v.id}: ${r.detalle}`);
    assert.equal(r.valor, v.digest, `divergencia en ${v.id}: ${v.descripcion}`);
  }
});

test('la codificación canónica ocupa siempre catorce palabras de 32 bytes', () => {
  /* Longitud fija: es lo que hace imposible la reagrupación. Si algún campo
   * pasara a ser de longitud variable, esta prueba se pondría roja antes de que
   * alguien descubriera la colisión por su cuenta. */
  for (const v of VEC.vectores) {
    const r = codificarPayload(v.payload);
    assert.equal(r.codigo, 'ALLOW');
    assert.equal((r.valor as Uint8Array).length, 14 * 32, `${v.id}`);
  }
});

test('veinte contenidos distintos dan veinte digests distintos', () => {
  const vistos = new Map<string, string>();
  for (const v of VEC.vectores) {
    const previo = vistos.get(v.digest);
    assert.equal(previo, undefined, `colisión entre ${previo} y ${v.id}`);
    vistos.set(v.digest, v.id);
  }
});

test('los vectores cubren los siete hallazgos que comparten esta raíz', () => {
  const cubiertos = new Set(VEC.vectores.flatMap((v) => v.hallazgos));
  for (const h of ['H01', 'H02', 'H04', 'H05', 'H18', 'H19']) {
    assert.ok(cubiertos.has(h), `ningún vector cubre ${h}`);
  }
});

// ------------------------------------------- negativo: un campo cambia todo

test('cambiar un solo campo cambia el digest, campo por campo', () => {
  const base = porId('V01').payload;
  const original = digestoDe(base).valor;
  const variaciones: Record<string, unknown> = {
    chainId: 1,
    verifyingContract: '0x' + '00'.repeat(19) + 'ff',
    action: b32('BURN'),
    assetId: b32('SFSP:SEC:ISS1:S2'),
    origin: '0x' + '00'.repeat(19) + '03',
    destination: '0x' + '00'.repeat(19) + '04',
    amount: '1001',
    amountSecondary: '1',
    nonce: b32('nonce_0002'),
    notBefore: base.notBefore - 1,
    expiry: base.expiry + 1,
    evidenceRoot: '0x' + '11'.repeat(32),
  };
  for (const [campo, valor] of Object.entries(variaciones)) {
    const alterado = { ...base, [campo]: valor } as PayloadAutorizacion;
    const r = digestoDe(alterado);
    assert.equal(r.codigo, 'ALLOW', campo);
    assert.notEqual(r.valor, original, `cambiar ${campo} debía cambiar el digest`);
  }
});

test('reagrupación: dos payloads que una concatenación ingenua confundiría no colisionan', () => {
  /* V16 lleva action="AB" y assetId="C"; V17 lleva action="A" y assetId="BC".
   * Concatenar sin prefijo de longitud daría "ABC" en los dos casos. */
  const a = porId('V16');
  const b = porId('V17');
  assert.notEqual(a.digest, b.digest);
  assert.equal(digestoDe(a.payload).valor, a.digest);
  assert.equal(digestoDe(b.payload).valor, b.digest);
});

test('H18 en pequeño: la misma reserva contra otro activo es otra autorización', () => {
  const a = porId('V14');
  const b = porId('V15');
  assert.equal(a.payload.amount, b.payload.amount, 'mismo monto a propósito');
  assert.notEqual(a.digest, b.digest);
});

test('H05 en pequeño: cambiar sólo el efectivo de la liquidación cambia el digest', () => {
  assert.notEqual(porId('V08').digest, porId('V09').digest);
});

test('H04 en pequeño: quitar la raíz de evidencia cambia el digest', () => {
  assert.notEqual(porId('V12').digest, porId('V13').digest);
});

// ------------------------------------------------------------- validación

test('un payload mal formado devuelve código, no excepción', () => {
  const base = porId('V01').payload;
  const casos: Array<[string, PayloadAutorizacion]> = [
    ['action en cero', { ...base, action: '0x' + '00'.repeat(32) }],
    ['assetId en cero', { ...base, assetId: '0x' + '00'.repeat(32) }],
    ['nonce en cero', { ...base, nonce: '0x' + '00'.repeat(32) }],
    ['ventana vacía', { ...base, expiry: base.notBefore }],
    ['ventana invertida', { ...base, expiry: base.notBefore - 1 }],
  ];
  for (const [nombre, p] of casos) {
    const r = validarPayload(p);
    assert.equal(r.codigo, 'DENY_AUTHORIZATION', nombre);
    assert.equal(r.valor, null, 'un rechazo nunca trae valor');
  }
});

test('un payload con campos de forma imposible se rechaza sin lanzar', () => {
  const base = porId('V01').payload;
  const malos: unknown[] = [
    { ...base, action: 'MINT' }, // texto sin hex
    { ...base, verifyingContract: '0x1234' }, // dirección corta
    { ...base, amount: -1 },
    { ...base, amount: 1.5 },
    { ...base, notBefore: 2 ** 64 },
    { ...base, nonce: null },
  ];
  for (const p of malos) {
    const r = digestoDe(p as PayloadAutorizacion);
    assert.notEqual(r.codigo, 'ALLOW', JSON.stringify(p).slice(0, 60));
    assert.equal(r.valor, null);
  }
});

test('la atadura exige la red y el contrato correctos', () => {
  const p = porId('V01').payload;
  const contrato = p.verifyingContract;
  assert.equal(validarAtadura(p, p.chainId, contrato).codigo, 'ALLOW');
  assert.equal(validarAtadura(p, 1, contrato).detalle, 'CHAIN_MISMATCH');
  assert.equal(validarAtadura(p, p.chainId, '0x' + '00'.repeat(19) + 'aa').detalle, 'CONTRACT_MISMATCH');
  /* La dirección es insensible a mayúsculas: el digest se calcula sobre los 20
   * bytes, no sobre la escritura. */
  assert.equal(validarAtadura(p, p.chainId, contrato.toUpperCase().replace('0X', '0x')).codigo, 'ALLOW');
});

// --------------------------------------------------------------- vigencia

test('los casos de vigencia del archivo compartido dan el veredicto esperado', () => {
  for (const c of VEC.vigencia) {
    const r = validarVigencia(porId(c.vector).payload, c.ahoraSegundos);
    assert.equal(r.codigo, c.codigoEsperado, `${c.id}: ${c.nota}`);
    if (c.detalleEsperado !== '') assert.equal(r.detalle, c.detalleEsperado, c.id);
  }
});

test('un reloj ilegible es UNKNOWN_SOURCE, nunca ALLOW', () => {
  /* §4: UNKNOWN_SOURCE no se degrada a ALLOW. Si no se puede leer el reloj no
   * se sabe si la autorización está vigente, y no saberlo no es un permiso. */
  const p = porId('V01').payload;
  assert.equal(validarVigencia(p, Number.NaN).codigo, 'UNKNOWN_SOURCE');
  assert.equal(validarVigencia(p, -1).codigo, 'UNKNOWN_SOURCE');
});

// ----------------------------------------------------------- consumo único

test('el registro de consumo gasta un digest una sola vez', () => {
  const reg = crearRegistroConsumo();
  const d = porId('V01').digest;
  assert.equal(reg.consumido(d), false);
  assert.equal(reg.consumir(d, T0).codigo, 'ALLOW');
  assert.equal(reg.consumido(d), true);
  assert.equal(reg.consumidoEn(d), T0);
  const segundo = reg.consumir(d, T0 + 1);
  assert.equal(segundo.codigo, 'DENY_AUTHORIZATION');
  assert.equal(reg.consumidoEn(d), T0, 'el segundo intento no pisa el instante del primero');
});

test('el registro no distingue mayúsculas: un digest es un digest', () => {
  const reg = crearRegistroConsumo();
  const d = porId('V01').digest;
  assert.equal(reg.consumir(d, T0).codigo, 'ALLOW');
  assert.equal(reg.consumir(d.toUpperCase().replace('0X', '0x'), T0).codigo, 'DENY_AUTHORIZATION');
});

// ----------------------------------------------------------- camino ejecutor

function entorno(p: PayloadAutorizacion, over?: { ahora?: number; registro?: ReturnType<typeof crearRegistroConsumo> }) {
  return {
    chainId: p.chainId,
    contrato: p.verifyingContract,
    ahoraSegundos: over?.ahora ?? T0 + 10,
    registro: over?.registro ?? crearRegistroConsumo(),
  };
}

test('positivo: una autorización válida se ejecuta y queda consumida', () => {
  const v = porId('V01');
  const reg = crearRegistroConsumo();
  const r = autorizar(v.payload, v.digest, entorno(v.payload, { registro: reg }));
  assert.equal(r.codigo, 'ALLOW');
  assert.equal(r.valor, v.digest);
  assert.equal(reg.consumido(v.digest), true);
});

test('negativo: el segundo consumo devuelve DENY_AUTHORIZATION', () => {
  const v = porId('V01');
  const reg = crearRegistroConsumo();
  const e = entorno(v.payload, { registro: reg });
  assert.equal(autorizar(v.payload, v.digest, e).codigo, 'ALLOW');
  const segundo = autorizar(v.payload, v.digest, e);
  assert.equal(segundo.codigo, 'DENY_AUTHORIZATION');
  assert.equal(segundo.valor, null);
});

test('negativo: una aprobación legítima no ejecuta un payload alterado en un solo campo', () => {
  /* H01 en pequeño. El ejecutor recalcula desde `payloadReal`, así que un
   * destino distinto al aprobado no pasa por mucho que el digest aprobado sea
   * auténtico. */
  const aprobado = porId('V01');
  const alterado = porId('V03'); // mismo MINT, otro destino
  const reg = crearRegistroConsumo();
  const r = autorizar(alterado.payload, aprobado.digest, entorno(alterado.payload, { registro: reg }));
  assert.equal(r.codigo, 'DENY_AUTHORIZATION');
  assert.equal(r.detalle, 'DIGEST_MISMATCH');
  assert.equal(reg.consumido(aprobado.digest), false, 'un intento fallido no quema la autorización');
});

test('negativo: H06 en pequeño, otro monto es otra autorización', () => {
  const aprobado = porId('V01');
  const otroMonto = porId('V02');
  const r = autorizar(otroMonto.payload, aprobado.digest, entorno(otroMonto.payload));
  assert.equal(r.detalle, 'DIGEST_MISMATCH');
});

test('negativo: H02 en pequeño, quemar a otro titular es otra autorización', () => {
  const aprobado = porId('V04');
  const otroTitular = porId('V05');
  const r = autorizar(otroTitular.payload, aprobado.digest, entorno(otroTitular.payload));
  assert.equal(r.detalle, 'DIGEST_MISMATCH');
});

test('negativo: H19 en pequeño, la aprobación de una pausa no levanta la siguiente', () => {
  const incidente1 = porId('V10');
  const incidente2 = porId('V11');
  const reg = crearRegistroConsumo();
  assert.equal(autorizar(incidente1.payload, incidente1.digest, entorno(incidente1.payload, { registro: reg })).codigo, 'ALLOW');
  const r = autorizar(incidente2.payload, incidente1.digest, entorno(incidente2.payload, { registro: reg }));
  assert.equal(r.detalle, 'DIGEST_MISMATCH');
  assert.equal(reg.consumido(incidente2.digest), false);
});

test('negativo: un payload vencido o aún no vigente no se autoriza y no se consume', () => {
  const v = porId('V01');
  const reg = crearRegistroConsumo();
  const vencido = autorizar(v.payload, v.digest, entorno(v.payload, { ahora: v.payload.expiry, registro: reg }));
  assert.equal(vencido.codigo, 'DENY_AUTHORIZATION');
  assert.equal(vencido.detalle, 'EXPIRED');
  const pronto = autorizar(v.payload, v.digest, entorno(v.payload, { ahora: v.payload.notBefore - 1, registro: reg }));
  assert.equal(pronto.detalle, 'NOT_YET_VALID');
  assert.equal(reg.consumido(v.digest), false, 'una ventana cerrada no gasta la autorización');
});

test('negativo: una aprobación de otra red o de otro contrato no se presenta aquí', () => {
  const v = porId('V01');
  const otraRed = porId('V18');
  const otroContrato = porId('V19');
  assert.equal(
    autorizar(otraRed.payload, otraRed.digest, { ...entorno(v.payload), chainId: v.payload.chainId }).detalle,
    'CHAIN_MISMATCH',
  );
  assert.equal(
    autorizar(otroContrato.payload, otroContrato.digest, { ...entorno(v.payload), contrato: v.payload.verifyingContract }).detalle,
    'CONTRACT_MISMATCH',
  );
});

test('negativo: un digest aprobado mal formado no autoriza nada', () => {
  const v = porId('V01');
  for (const malo of ['', '0x00', 'no-es-el-hash', '0xzz' + '00'.repeat(31)]) {
    const r = autorizar(v.payload, malo, entorno(v.payload));
    assert.equal(r.codigo, 'DENY_AUTHORIZATION', malo);
  }
});

test('ninguna frontera pública lanza: todo rechazo viaja como código', () => {
  /* C03: un `throw` no capturado en un camino de dinero es una operación a
   * medias. Aquí se comprueba con entradas deliberadamente basura. */
  const basura: unknown[] = [{}, { action: 1 }, { ...porId('V01').payload, amount: {} }];
  for (const p of basura) {
    assert.doesNotThrow(() => digestoDe(p as PayloadAutorizacion));
    assert.doesNotThrow(() => validarPayload(p as PayloadAutorizacion));
    assert.doesNotThrow(() => validarVigencia(p as PayloadAutorizacion, T0));
    assert.doesNotThrow(() => autorizar(p as PayloadAutorizacion, porId('V01').digest, entorno(porId('V01').payload)));
  }
});

test('bytes32DeTexto rechaza lo que no cabe en vez de truncarlo', () => {
  assert.equal(bytes32DeTexto('MINT').codigo, 'ALLOW');
  assert.notEqual(bytes32DeTexto('x'.repeat(33)).codigo, 'ALLOW');
});
