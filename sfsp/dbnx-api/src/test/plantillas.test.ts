import test from 'node:test';
import assert from 'node:assert/strict';

import {
  crearPlantilla,
  emitirPlantilla,
  intentarCambiarTipo,
  mismoDerecho,
  PARAMETROS_REQUERIDOS,
  reparametrizar,
  type Parametro,
  type PlantillaDerechos,
  type TipoDerecho,
} from '../plantillas.js';

function parametrosCompletos(tipo: TipoDerecho): Parametro[] {
  return PARAMETROS_REQUERIDOS[tipo].map((clave) => ({
    clave,
    valor: `valor-sintetico-${clave}`,
    forma: 'TEXTO' as const,
  }));
}

function crear(tipo: TipoDerecho): PlantillaDerechos {
  const r = crearPlantilla({
    templateId: `tpl-${tipo.toLowerCase()}`,
    version: '1.0.0',
    tipo,
    parametros: parametrosCompletos(tipo),
  });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('no deberia fallar');
  return r.valor;
}

const TIPOS: readonly TipoDerecho[] = [
  'EQUITY',
  'DEBT',
  'REVENUE_SHARE',
  'ROYALTY',
  'VEHICLE_ECONOMIC_INTEREST',
];

test('los cinco tipos de plantilla existen y tienen parametros propios', () => {
  assert.equal(Object.keys(PARAMETROS_REQUERIDOS).length, 5);
  for (const tipo of TIPOS) {
    assert.ok(PARAMETROS_REQUERIDOS[tipo].length >= 4, tipo);
  }
  // Los requeridos de equity y royalty no coinciden: no son el mismo objeto.
  assert.notDeepEqual(PARAMETROS_REQUERIDOS.EQUITY, PARAMETROS_REQUERIDOS.ROYALTY);
});

test('cada tipo se emite cuando estan sus parametros', () => {
  for (const tipo of TIPOS) {
    const r = emitirPlantilla(crear(tipo));
    assert.equal(r.ok, true, tipo);
    if (!r.ok) throw new Error('inesperado');
    assert.equal(r.valor.emitida, true);
    assert.equal(r.valor.tipo, tipo);
  }
});

test('un parametro requerido sin definir bloquea la emision, no se rellena', () => {
  const r0 = crearPlantilla({
    templateId: 'tpl-incompleta',
    version: '1.0.0',
    tipo: 'DEBT',
    parametros: [{ clave: 'principal', valor: '1000', forma: 'ENTERO_BASE' }],
  });
  if (!r0.ok) throw new Error('inesperado');
  assert.ok(r0.valor.parametrosPendientes.length > 0);

  const r = emitirPlantilla(r0.valor);
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'BLOCKED_DECISION');
});

test('cambiar un campo NO convierte una plantilla en otra: el tipo no muta', () => {
  const equity = crear('EQUITY');
  const emitida = emitirPlantilla(equity);
  if (!emitida.ok) throw new Error('inesperado');

  // Reparametrizar mantiene el tipo. Sobre una plantilla ya emitida lo que sale
  // es una REVISION pendiente (H23), no la misma emision con otros valores.
  const cambiada = reparametrizar(
    emitida.valor,
    [{ clave: 'derechoDividendo', valor: 'otro-valor-sintetico', forma: 'TEXTO' }],
    '1.1.0',
  );
  assert.equal(cambiada.ok, true);
  if (!cambiada.ok) throw new Error('inesperado');
  assert.equal(cambiada.valor.tipo, 'EQUITY');
  assert.equal(cambiada.valor.version, '1.1.0');
  assert.equal(cambiada.valor.emitida, false);
  assert.equal(cambiada.valor.revisionDe, '1.0.0');
  assert.ok(mismoDerecho(emitida.valor, cambiada.valor));

  // Intentar cambiar el tipo se rechaza con codigo.
  const intento = intentarCambiarTipo(emitida.valor, 'ROYALTY');
  assert.equal(intento.ok, false);
  if (intento.ok) throw new Error('inesperado');
  assert.equal(intento.codigo, 'DENY_ASSET_STATE');
  assert.match(intento.motivo, /inmutable/);
});

test('un parametro ajeno a la plantilla se rechaza', () => {
  const royalty = crear('ROYALTY');
  const r = reparametrizar(
    royalty,
    [{ clave: 'derechoVoto', valor: 'si', forma: 'TEXTO' }],
    '1.1.0',
  );
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'DENY_POLICY');
});

test('reparametrizar sin subir la version se rechaza', () => {
  const p = crear('REVENUE_SHARE');
  const r = reparametrizar(p, [], '1.0.0');
  assert.equal(r.ok, false);
  if (r.ok) throw new Error('inesperado');
  assert.equal(r.codigo, 'DENY_POLICY');
});

test('emitir dos veces la misma plantilla se rechaza', () => {
  const emitida = emitirPlantilla(crear('DEBT'));
  if (!emitida.ok) throw new Error('inesperado');
  const otra = emitirPlantilla(emitida.valor);
  assert.equal(otra.ok, false);
  if (otra.ok) throw new Error('inesperado');
  assert.equal(otra.codigo, 'DENY_ASSET_STATE');
});

test('plantillas de distinto tipo no son el mismo derecho aunque compartan id', () => {
  const a = crear('EQUITY');
  const b: PlantillaDerechos = { ...a, tipo: 'ROYALTY' };
  assert.equal(mismoDerecho(a, b), false);
});
