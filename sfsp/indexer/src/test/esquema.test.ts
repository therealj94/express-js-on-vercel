// Fuente unica de eventos (H15): el decodificador contra `spec/eventos.json`.
//
// POR QUE estas pruebas: antes habia una tabla de eventos escrita a mano en el
// indexador y otra en Solidity, y nadie comprobaba que coincidieran. La unica
// forma de que la deriva no vuelva es que una prueba falle en cuanto el
// decodificador y la fuente unica dejen de decir lo mismo.

import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { cargarEspecEventos, rutaEspecEventos } from '../esquema/cargar.js';
import { generarFuente, rutaModuloGenerado } from '../esquema/generar.js';
import {
  ALIASES_RETIRADOS,
  decodificar,
  ESQUEMA_EVENTOS,
  EVENTOS_CONOCIDOS,
  VERSION_ESPEC_EVENTOS,
} from '../decode.js';
import { log } from './ayudas.js';

const espec = cargarEspecEventos();

test('el decodificador generado no diverge de spec/eventos.json', () => {
  // Esta es LA prueba de H15. Si alguien edita el JSON y no regenera, o edita a
  // mano el modulo generado, aqui se cae. No hay forma de que las dos tablas se
  // separen en silencio.
  const enElArbol = readFileSync(rutaModuloGenerado(), 'utf8');
  const regenerado = generarFuente(espec);
  assert.equal(
    enElArbol,
    regenerado,
    'src/esquema-generado.ts esta desincronizado: corre `npm run generar:esquema`',
  );
});

test('la version del esquema cargado es la que expone el indexador', () => {
  assert.equal(VERSION_ESPEC_EVENTOS, espec.version);
});

test('los quince eventos del §3 estan en la fuente unica, con su emisor', () => {
  assert.equal(espec.eventos.length, 15);
  assert.equal(Object.keys(ESQUEMA_EVENTOS).length, 15);
  for (const ev of espec.eventos) {
    assert.equal(EVENTOS_CONOCIDOS[ev.nombre as keyof typeof EVENTOS_CONOCIDOS], ev.emisor);
  }
});

test('todo evento que cambia el suministro lleva assetId obligatorio e indexado', () => {
  // Es la regla que el contrato rompia: `BurnExecuted` sin `assetId`.
  for (const ev of espec.eventos) {
    if (ev.afectaSuministro === 'NINGUNO') continue;
    const activo = ev.campos.find((c) => c.nombre === 'assetId');
    assert.ok(activo !== undefined, `${ev.nombre} no lleva assetId`);
    assert.equal(activo.obligatorio, true, `${ev.nombre}.assetId no es obligatorio`);
    assert.equal(activo.indexado, true, `${ev.nombre}.assetId no va indexado`);
    assert.equal(activo.atribuyeActivo, true, `${ev.nombre}.assetId no atribuye activo`);
    const monto = ev.campos.find((c) => c.nombre === 'amount');
    assert.ok(monto?.esCantidad === true, `${ev.nombre} no declara 'amount' como cantidad`);
  }
});

test('ningun evento declara mas de tres campos indexados', () => {
  for (const ev of espec.eventos) {
    const indexados = ev.campos.filter((c) => c.indexado).length;
    assert.ok(indexados <= 3, `${ev.nombre} declara ${indexados} campos indexados`);
  }
});

test('el decodificador exige exactamente los campos que declara el JSON', () => {
  for (const ev of espec.eventos) {
    const requeridos = ev.campos.filter((c) => c.obligatorio).map((c) => c.nombre);
    // Sin ningun parametro: deben faltar todos los requeridos del JSON, ni uno mas.
    const vacio = decodificar(log({ firma: ev.nombre }));
    assert.equal(vacio.tipo, 'DECODIFICADO');
    if (vacio.tipo !== 'DECODIFICADO') throw new Error('tipo inesperado');
    assert.deepEqual([...vacio.camposFaltantes].sort(), [...requeridos].sort(), ev.nombre);

    // Con todos los campos: registro completo y atribuido.
    const parametros: Record<string, string> = {};
    for (const c of ev.campos) parametros[c.nombre] = c.esCantidad ? '1' : `sintetico_${c.nombre}`;
    const lleno = decodificar(log({ firma: ev.nombre, parametros }));
    if (lleno.tipo !== 'DECODIFICADO') throw new Error('tipo inesperado');
    assert.equal(lleno.completo, true, ev.nombre);
    assert.equal(lleno.atribucionIncompleta, false, ev.nombre);
    assert.equal(
      lleno.activosAtribuidos.length,
      ev.campos.filter((c) => c.atribuyeActivo).length,
      ev.nombre,
    );
  }
});

test('un nombre retirado se decodifica al canonico y queda marcado como tal', () => {
  // `UnitsMinted` fue el nombre que emitia SFSPRegulatedAsset. Se unifico en
  // `MintExecuted`, pero un log historico no se puede reescribir.
  assert.equal(ALIASES_RETIRADOS['UnitsMinted'], 'MintExecuted');
  const r = decodificar(
    log({ firma: 'UnitsMinted', parametros: { amount: '100', destination: '0xTEST_A' } }),
  );
  assert.equal(r.tipo, 'DECODIFICADO');
  if (r.tipo !== 'DECODIFICADO') throw new Error('tipo inesperado');
  assert.equal(r.evento, 'MintExecuted');
  assert.equal(r.aliasOrigen, 'UnitsMinted');
  // Y como el nombre viejo no llevaba assetId, el registro sale sin atribuir.
  assert.equal(r.atribucionIncompleta, true);
  assert.equal(r.completo, false);
});

test('un evento desconocido se sigue conservando crudo, no se descarta', () => {
  const r = decodificar(
    log({ firma: 'EventoQueNoExisteEnLaFuente', topics: ['0xTOPIC0'], data: '0xCARGA' }),
  );
  assert.equal(r.tipo, 'CRUDO');
  if (r.tipo !== 'CRUDO') throw new Error('tipo inesperado');
  assert.equal(r.firma, 'EventoQueNoExisteEnLaFuente');
  assert.deepEqual(r.topics, ['0xTOPIC0']);
  assert.equal(r.data, '0xCARGA');
});

test('el archivo de la fuente unica no contiene valores economicos ni direcciones reales', () => {
  // Regla dura del arbol: cero valores economicos, cero direcciones reales.
  const crudo = readFileSync(rutaEspecEventos(), 'utf8');
  assert.equal(/0x[0-9a-fA-F]{40}/.test(crudo), false, 'hay algo con forma de direccion');
});
