// Pruebas del motor de telemetría.
//
// Se prueban las tres cosas que pueden fallar en silencio y arruinar el panel
// sin que nadie se entere: que los errores se agrupen bien, que no se guarde
// nada personal, y que las cuentas diarias cuadren.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ingerir, patron, huella, huellaError, paisDeCabeceras, almacen } from '../analitica/eventos.js'
import { resumen, errores, errorDetalle, marcarError, paises } from '../analitica/consultas.js'

const hoy = new Date().toISOString()

test('el patrón junta los mensajes que son el mismo fallo', () => {
  // Identificadores cortos con guiones — el caso que aparecía tres veces en el
  // panel antes de arreglarlo.
  assert.equal(patron('No se encontró el cobro 8f2a-41bc-9d10'),
               patron('No se encontró el cobro 3c91-77de-2a04'))
  // UUID completo
  assert.equal(patron('falta 550e8400-e29b-41d4-a716-446655440000'),
               patron('falta 6ba7b810-9dad-11d1-80b4-00c04fd430c8'))
  // Números y direcciones de la cadena
  assert.equal(patron('timeout after 15000ms'), patron('timeout after 30000ms'))
  assert.equal(patron('saldo de 0xabc123 insuficiente'), patron('saldo de 0xdef456 insuficiente'))
})

test('el patrón NO junta fallos distintos', () => {
  assert.notEqual(patron('no se encontró el cobro X'), patron('no se encontró el usuario X'))
  assert.notEqual(patron('timeout'), patron('conexión rechazada'))
})

test('la huella del error separa por aplicación', () => {
  // El mismo mensaje en dos apps son dos problemas distintos: los arregla
  // gente distinta en repositorios distintos.
  assert.notEqual(huellaError('veta-wallet', 'algo falló'), huellaError('mytokenpay', 'algo falló'))
})

test('la huella del usuario no se puede cruzar entre apps', () => {
  const a = huella('veta-wallet', 'usuario@ejemplo.com')
  const b = huella('mytokenpay', 'usuario@ejemplo.com')
  assert.notEqual(a, b, 'la misma persona no puede dar la misma huella en dos apps')
  assert.equal(a, huella('veta-wallet', 'usuario@ejemplo.com'), 'debe ser estable')
  assert.ok(!a.includes('usuario'), 'la huella no puede contener el identificador')
})

test('el país sale de la cabecera y solo si es válido', () => {
  assert.equal(paisDeCabeceras({ 'cf-ipcountry': 'hn' }), 'HN')
  assert.equal(paisDeCabeceras({ 'x-vercel-ip-country': 'US' }), 'US')
  assert.equal(paisDeCabeceras({ 'cf-ipcountry': 'Honduras' }), '??')
  assert.equal(paisDeCabeceras({}), '??')
})

test('se ingiere un lote y las cuentas cuadran', async () => {
  const r = await ingerir('app-prueba', [
    { tipo: 'registro', nombre: 'alta', usuario: 'u1', pais: 'HN', en: hoy },
    { tipo: 'sesion', nombre: 'abrir', usuario: 'u1', pais: 'HN', en: hoy },
    { tipo: 'sesion', nombre: 'abrir', usuario: 'u2', pais: 'US', en: hoy },
    { tipo: 'accion', nombre: 'cobrar', usuario: 'u2', pais: 'US', en: hoy },
    { tipo: 'transaccion', nombre: 'pago', usuario: 'u1', valor: 250, moneda: 'HNL', en: hoy },
  ], 'HN')

  assert.equal(r.aceptados, 5)
  assert.equal(r.descartados, 0)

  const res = await resumen(7, 'app-prueba')
  assert.equal(res.usuarios.total, 2, 'dos personas distintas')
  assert.equal(res.usuarios.activosHoy, 2)
  assert.equal(res.usuarios.nuevosHoy, 2, 'las dos son altas de hoy')
  assert.equal(res.actividad.eventosHoy, 5)
  assert.equal(res.actividad.volumen.HNL, 250)

  const p = await paises(7, 'app-prueba')
  assert.deepEqual(p.map((x) => x.codigo).sort(), ['HN', 'US'])
})

test('un evento sin tipo válido se descarta y no rompe el lote', async () => {
  const r = await ingerir('app-prueba', [
    { tipo: 'inventado', nombre: 'x' },
    { tipo: 'accion' },                       // sin nombre
    { tipo: 'accion', nombre: 'buena', usuario: 'u1', en: hoy },
  ], 'HN')
  assert.equal(r.aceptados, 1)
  assert.equal(r.descartados, 2)
})

test('el meta se recorta y se le quitan los campos que huelen a secreto', async () => {
  await ingerir('app-secretos', [{
    tipo: 'accion', nombre: 'x', usuario: 'u9', en: hoy,
    meta: { contrasena: 'hola1234', apiKey: 'gid_live_x', semilla: 'palabra ' .repeat(12), pantalla: 'inicio' },
  }], 'HN')
  const ev = almacen.memoria.eventos.filter((e) => e.app === 'app-secretos')
  assert.equal(ev.length, 1)
  assert.deepEqual(Object.keys(ev[0].meta ?? {}), ['pantalla'],
    'solo debe sobrevivir lo que no es secreto')
})

test('los errores se agrupan, se cuentan y se pueden resolver', async () => {
  const base = { tipo: 'error' as const, nombre: 'excepcion', usuario: 'u1', en: hoy, version: '1.0.0' }
  const r = await ingerir('app-fallos', [
    { ...base, mensaje: 'No se encontró el cobro 8f2a-41bc-9d10', pila: 'at cargar (src/pos.ts:10:1)' },
    { ...base, mensaje: 'No se encontró el cobro 3c91-77de-2a04', pila: 'at cargar (src/pos.ts:10:1)', usuario: 'u2' },
    { ...base, mensaje: 'No se encontró el cobro b104-9fe2-71aa', pila: 'at cargar (src/pos.ts:10:1)', usuario: 'u3' },
    { ...base, mensaje: 'Otro fallo distinto', pila: 'at otra (src/otra.ts:5:1)', gravedad: 'critico' as const },
  ], 'HN')

  assert.equal(r.gruposNuevos.length, 2, 'tres mensajes son un solo fallo, más otro distinto')

  const lista = await errores({ app: 'app-fallos' })
  assert.equal(lista.length, 2)
  const cobro = lista.find((e) => e.titulo.includes('cobro'))!
  assert.equal(cobro.total, 3, 'las tres repeticiones cuentan como una sola fila')
  assert.equal(cobro.usuarios, 3, 'tres personas afectadas')
  assert.equal(cobro.estado, 'nuevo')

  const detalle = await errorDetalle(cobro.huella)
  assert.ok(detalle)
  assert.equal(detalle!.muestras.length, 3)
  assert.equal(detalle!.serie.length, 14)

  assert.ok(await marcarError(cobro.huella, 'resuelto', 'quien@sea', 'arreglado', '1.1.0'))
  const tras = (await errores({ app: 'app-fallos' })).find((e) => e.huella === cobro.huella)!
  assert.equal(tras.estado, 'resuelto')
})

test('un error resuelto que vuelve en una versión posterior se reabre solo', async () => {
  const g = await ingerir('app-regresion', [
    { tipo: 'error', nombre: 'e', mensaje: 'se rompió algo', version: '1.0.0', en: hoy },
  ], 'HN')
  const h = g.gruposNuevos[0]
  await marcarError(h, 'resuelto', 'yo', 'arreglado', '1.2.0')

  // Vuelve en una versión ANTERIOR: es alguien con la app vieja, no una
  // regresión. No debe reabrirse ni generar ruido.
  await ingerir('app-regresion', [
    { tipo: 'error', nombre: 'e', mensaje: 'se rompió algo', version: '1.1.0', en: hoy },
  ], 'HN')
  assert.equal((await errorDetalle(h))!.estado, 'resuelto')

  // Vuelve en una POSTERIOR: eso sí es una regresión.
  await ingerir('app-regresion', [
    { tipo: 'error', nombre: 'e', mensaje: 'se rompió algo', version: '1.3.0', en: hoy },
  ], 'HN')
  assert.equal((await errorDetalle(h))!.estado, 'reabierto')
})

test('una fecha absurda no puede ensuciar el eje del tiempo', async () => {
  await ingerir('app-reloj', [
    { tipo: 'accion', nombre: 'futuro', usuario: 'u1', en: '2099-01-01T00:00:00Z' },
    { tipo: 'accion', nombre: 'pasado', usuario: 'u1', en: '1970-01-01T00:00:00Z' },
  ], 'HN')
  const ev = almacen.memoria.eventos.filter((e) => e.app === 'app-reloj')
  const margen = Date.now() + 120000
  for (const e of ev) {
    assert.ok(e.ts.getTime() <= margen, 'nada puede quedar en el futuro')
    assert.ok(e.ts.getTime() > Date.now() - 900 * 3600 * 1000, 'nada puede irse a 1970')
  }
})

test('la clave pública identifica a la app y solo sirve para ingerir', async () => {
  const { crearAplicacion, clavePublicaDe, aplicacionDeClavePublica, rotarPublica } =
    await import('../auth/aplicaciones.js')

  const { aplicacion } = crearAplicacion('app-publica', 'Prueba', ['telemetria.enviar'])
  const publica = clavePublicaDe(aplicacion)

  assert.ok(publica.startsWith('gidp_app-publica_'), 'debe decir a qué app pertenece')
  assert.equal(aplicacionDeClavePublica(publica)?.clave, 'app-publica')
  assert.equal(aplicacionDeClavePublica('gidp_inventada_xxx'), null)
  assert.equal(aplicacionDeClavePublica(''), null)

  // Rotarla invalida la anterior en el acto: es la única defensa si alguien la
  // saca de un APK y empieza a mandar basura.
  const nueva = rotarPublica(aplicacion.id, 'operador@prueba')
  assert.ok(nueva && nueva !== publica)
  assert.equal(aplicacionDeClavePublica(publica), null, 'la vieja deja de servir')
  assert.equal(aplicacionDeClavePublica(nueva!)?.clave, 'app-publica')
})
