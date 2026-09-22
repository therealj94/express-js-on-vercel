// C01: la deriva de especificacion no vuelve.
//
// El problema: doce documentos de `spec/` terminaban con una seccion "Propuestas
// para el contrato interno" que nunca se integro. Mientras eso duro,
// `CONTRATO-INTERNO.md` decia ser la fuente unica y no lo era.
//
// La regla que fija esta prueba: una propuesta no puede quedarse ahi. O esta en
// el contrato interno, o esta marcada RECHAZADA con su motivo. Cualquier tercera
// situacion falla aqui, y falla en el momento en que alguien la escribe.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { rutaEspecEventos } from '../esquema/cargar.js';

const DIR_SPEC = dirname(rutaEspecEventos());
const RUTA_CONTRATO = join(DIR_SPEC, '..', 'CONTRATO-INTERNO.md');
const TITULO = /^## \d+ · Propuestas para el contrato interno\s*$/m;

interface Propuesta {
  readonly documento: string;
  readonly nombre: string;
  readonly rechazada: boolean;
  readonly texto: string;
}

/** Extrae la seccion de propuestas de un documento, o `null` si no la tiene. */
function seccionDePropuestas(contenido: string): string | null {
  const m = TITULO.exec(contenido);
  if (m === null) return null;
  const desde = m.index + m[0].length;
  const resto = contenido.slice(desde);
  const siguiente = resto.search(/\n## /);
  return siguiente === -1 ? resto : resto.slice(0, siguiente);
}

/**
 * Un tipo propuesto se escribe siempre como **`Nombre`**. El item al que
 * pertenece es lo que va desde su numero hasta el siguiente: ahi es donde tiene
 * que estar la marca RECHAZADA, si la hay.
 */
function propuestasDe(documento: string, seccion: string): Propuesta[] {
  const items = seccion.split(/\n(?=\d+\. )/);
  const salida: Propuesta[] = [];
  for (const item of items) {
    const rechazada = item.includes('RECHAZADA');
    for (const m of item.matchAll(/\*\*`([A-Za-z][A-Za-z0-9_]*)`\*\*/g)) {
      salida.push({ documento, nombre: m[1]!, rechazada, texto: item });
    }
  }
  return salida;
}

function leerPropuestas(): Propuesta[] {
  const salida: Propuesta[] = [];
  for (const archivo of readdirSync(DIR_SPEC).filter((f) => f.endsWith('.md'))) {
    const contenido = readFileSync(join(DIR_SPEC, archivo), 'utf8');
    const seccion = seccionDePropuestas(contenido);
    if (seccion === null) continue;
    salida.push(...propuestasDe(archivo, seccion));
  }
  return salida;
}

const contrato = readFileSync(RUTA_CONTRATO, 'utf8');
const propuestas = leerPropuestas();

test('ningun documento de spec/ propone un tipo que el contrato interno no tenga', () => {
  const huerfanas = propuestas
    .filter((p) => !p.rechazada)
    .filter((p) => !contrato.includes(p.nombre));

  assert.deepEqual(
    huerfanas.map((p) => `${p.documento}: ${p.nombre}`),
    [],
    'hay propuestas sin integrar y sin rechazar: o van a CONTRATO-INTERNO.md, o se marcan RECHAZADA con su motivo',
  );
});

test('toda propuesta rechazada explica por que en su propio item', () => {
  for (const p of propuestas.filter((x) => x.rechazada)) {
    // "RECHAZADA." a secas es una etiqueta, no una razon. Se exige texto detras.
    const trasLaMarca = p.texto.slice(p.texto.indexOf('RECHAZADA') + 'RECHAZADA'.length);
    assert.ok(
      trasLaMarca.replace(/[^A-Za-zÁÉÍÓÚáéíóúñÑ]/g, '').length > 40,
      `${p.documento}: ${p.nombre} se marca RECHAZADA sin explicar por que`,
    );
  }
});

test('un tipo rechazado no aparece a la vez definido en el contrato interno', () => {
  // Si estuviera en los dos sitios, el rechazo seria falso y volveriamos a tener
  // dos fuentes diciendo cosas distintas, que es el defecto original.
  for (const p of propuestas.filter((x) => x.rechazada)) {
    assert.equal(
      new RegExp(`(interface|type|const)\\s+${p.nombre}\\b`).test(contrato),
      false,
      `${p.documento}: ${p.nombre} figura como rechazada y sin embargo esta definida en el contrato interno`,
    );
  }
});

test('la seccion de propuestas de cada documento sigue existiendo y dice donde fue todo', () => {
  // POR QUE se exige que la seccion siga ahi: borrarla sin dejar rastro hace
  // imposible saber, leyendo el documento, si su propuesta se integro o se
  // perdio. La trazabilidad es parte de la correccion.
  const conSeccion = readdirSync(DIR_SPEC)
    .filter((f) => f.startsWith('SFSP-') && f.endsWith('.md'))
    .filter((f) => seccionDePropuestas(readFileSync(join(DIR_SPEC, f), 'utf8')) !== null);
  assert.equal(conSeccion.length, 12);
  for (const f of conSeccion) {
    const seccion = seccionDePropuestas(readFileSync(join(DIR_SPEC, f), 'utf8'))!;
    assert.match(seccion, /CONTRATO-INTERNO\.md/, f);
  }
});

test('las cuatro propuestas rechazadas son exactamente las declaradas en el §9', () => {
  const rechazadas = propuestas.filter((p) => p.rechazada).map((p) => p.nombre).sort();
  assert.deepEqual(rechazadas, [
    'AlertDefinition',
    'MetadataClass',
    'OracleQuoteKind',
    'ServiceManifestEntry',
  ]);
  for (const nombre of rechazadas) {
    assert.ok(contrato.includes(nombre), `el §9 del contrato interno no nombra ${nombre}`);
  }
});
