/* La regla de no inventar valores, comprobada contra el archivo real. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { cargarDecisiones, parametro, pendientes, aprobada, GOBIERNA } from '../decisiones.js';
import { rutaDeDecisiones } from '../rutas.js';

/* P07: se busca el archivo subiendo, en vez de contar carpetas a mano. Así la
   prueba corre desde src, desde dist y desde una copia, que es justo lo que
   impidió al auditor ejecutar estas cuatro. */
const RUTA = rutaDeDecisiones();
if (!RUTA) throw new Error('no se encontró DECISIONES-SFSP.json subiendo desde este archivo');

test('todo parámetro económico sin aprobar devuelve BLOCKED_DECISION con su decisión', () => {
  const archivo = cargarDecisiones(RUTA);

  for (const nombre of Object.keys(GOBIERNA)) {
    const r = parametro(archivo, nombre);
    if (r.codigo === 'ALLOW') continue; // ya aprobado: legítimo
    assert.equal(r.codigo, 'BLOCKED_DECISION', `${nombre} debería estar bloqueado o aprobado`);
    assert.equal(r.decision, GOBIERNA[nombre]);
    assert.equal(r.valor, null, 'un parámetro bloqueado nunca trae valor');
  }
});

test('un objeto aprobado sólo en parte también bloquea', () => {
  const archivo = cargarDecisiones(RUTA);
  const r = parametro(archivo, 'haircutsPorTier');
  assert.equal(r.codigo, 'BLOCKED_DECISION');
  assert.equal(r.decision, 'D04');
});

test('las decisiones de arquitectura ya adoptadas están afirmadas', () => {
  const archivo = cargarDecisiones(RUTA);
  const a = archivo.adoptadas;

  assert.equal(a['numeracionUniversal'], true);
  assert.equal(a['formatoVisible'], 'SF-XXXX-XXXX-XXXX-C');
  assert.equal(a['digitosCentrales'], 12);
  assert.equal(a['generacion'], 'CSPRNG');
  assert.equal(a['secuencial'], false);
  assert.equal(a['reutilizable'], false);
  assert.equal(a['cuentaDistintaDeWallet'], true);
  assert.equal(a['aliasEsFactorDeAutenticacion'], false);
  assert.equal(a['seedEsLaCuenta'], false);
  assert.equal(a['migracionInicialRotaLlaves'], false);
  /* El algoritmo de control está elegido pero NO congelado todavía. */
  assert.equal(a['checkDigitAlgoritmo'], 'LUHN');
  assert.equal(a['checkDigitCongelado'], false);
});

test('las veintitrés decisiones siguen pendientes y cada una dice qué bloquea', () => {
  const archivo = cargarDecisiones(RUTA);
  assert.equal(archivo.decisiones.length, 23, 'D00 a D22 (D22: capa Web5, SFSP-160)');

  const sinCerrar = pendientes(archivo);
  assert.equal(sinCerrar.length, 23, 'hoy no hay ninguna aprobada');

  for (const d of archivo.decisiones) {
    assert.match(d.id, /^D\d{2}$/);
    assert.ok(d.tema.length > 10, `${d.id} necesita un tema legible`);
    assert.ok(d.autoridad.length > 3, `${d.id} necesita una autoridad`);
    assert.ok(Array.isArray(d.bloquea) && d.bloquea.length > 0, `${d.id} debe decir qué bloquea`);
    assert.equal(d.valor, null);
  }

  assert.equal(aprobada(archivo, 'D03'), false);
});
