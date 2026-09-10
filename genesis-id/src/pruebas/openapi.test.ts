// El documento de la API contra la API de verdad.
//
// POR QUE ESTA PRUEBA EXISTE
//
// Una documentación de API no se rompe: se va quedando vieja. Nadie la borra;
// simplemente alguien añade una ruta y no la escribe, o aprieta un permiso y no
// lo copia, y el documento sigue ahí, con buen aspecto, contando el sistema de
// hace seis meses.
//
// Y eso es PEOR que no tener documentación. Sin ella, quien integra lee el
// código o pregunta. Con una que miente, construye encima y lo descubre en
// producción, que es donde sale caro.
//
// El único remedio que funciona es que no se pueda desfasar sin que algo se
// ponga rojo. Eso es esta prueba: compara el documento con el enrutador de
// Express en las DOS direcciones —ninguna ruta sin texto, ningún texto sin
// ruta— y compara los alcances con los que pide `exigeApp` de verdad.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const { construirOpenApi, rutasDe, CAMINOS_DOCUMENTADOS } = await import('../api/openapi.js')
const { appsRouter } = await import('../routes/apps.js')
const { directorioAppsRouter } = await import('../routes/directorio.js')
const { EVENTOS } = await import('../enganches/enganches.js')

const RUTAS = [
  ...rutasDe(appsRouter, '/api/v1'),
  ...rutasDe(directorioAppsRouter, '/api/v1/directorio'),
]
const DOC: any = construirOpenApi(RUTAS, 'https://ejemplo.invalid')
const operaciones = () => Object.entries(DOC.paths).flatMap(([camino, metodos]: any) =>
  Object.entries(metodos).map(([m, op]: any) => ({ camino, metodo: m, op })))

describe('el documento de la API', () => {
  test('hay rutas de verdad que leer', () => {
    /* Si esto falla, todo lo demás pasa por vacío: un documento de cero rutas
       cumple «ninguna sin documentar» perfectamente. */
    assert.ok(RUTAS.length >= 20, `solo se leyeron ${RUTAS.length} rutas del enrutador`)
  })

  test('NINGUNA RUTA SIN DOCUMENTAR', () => {
    /* La dirección que importa: alguien añadió una ruta y no la explicó. El
       integrador la ve en el documento sin descripción, o no la ve. */
    const huerfanas = RUTAS
      .filter((r) => !CAMINOS_DOCUMENTADOS.includes(`${r.metodo} ${r.camino}`))
      .map((r) => `${r.metodo} ${r.camino}`)
    assert.deepEqual(huerfanas, [],
      'estas rutas existen y no están escritas en TEXTOS (src/api/openapi.ts)')
  })

  test('NINGUN TEXTO SIN RUTA', () => {
    /* La otra dirección, menos visible y también dañina: una ruta que se quitó
       y sigue documentada. El integrador la llama y le contesta un 404 que su
       manual dice que no existe. */
    const vivas = new Set(RUTAS.map((r) => `${r.metodo} ${r.camino}`))
    const fantasmas = CAMINOS_DOCUMENTADOS.filter((c) => !vivas.has(c))
    assert.deepEqual(fantasmas, [],
      'esto está documentado y ya no existe en el enrutador')
  })

  test('los alcances del documento son los que pide el código', () => {
    /* No se copian: se leen de `exigeApp`. Esta prueba comprueba que la lectura
       de verdad funciona —que no está devolviendo listas vacías por un cambio
       en cómo Express guarda sus capas, que es como esto se rompería en
       silencio. */
    const conAlcance = RUTAS.filter((r) => r.alcances.length)
    assert.ok(conAlcance.length >= 20,
      `solo ${conAlcance.length} rutas traen alcance: se rompió la lectura del middleware`)

    for (const { camino, metodo, op } of operaciones()) {
      const real = RUTAS.find((r) =>
        r.metodo.toLowerCase() === metodo && r.camino.replace(/:(\w+)/g, '{$1}') === camino)!
      assert.deepEqual(op.security[0].claveDeApi, real.alcances,
        `${metodo.toUpperCase()} ${camino} promete otros permisos que los que pide`)
    }
  })

  test('cada operación dice qué hace y qué devuelve', () => {
    for (const { camino, metodo, op } of operaciones()) {
      assert.ok(op.summary && !op.summary.includes('SIN DOCUMENTAR'),
        `${metodo.toUpperCase()} ${camino} sin resumen`)
      assert.ok(op.responses['200'].description.length > 8,
        `${metodo.toUpperCase()} ${camino} no dice qué devuelve`)
      assert.ok(op.responses['401'], 'toda ruta puede contestar 401 y hay que decirlo')
    }
  })

  test('los parámetros de la ruta están declarados', () => {
    /* Un `:id` sin declarar hace que cualquier generador de clientes produzca
       una llamada que no compila. */
    for (const { camino, metodo, op } of operaciones()) {
      const enElCamino = [...camino.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
      const declarados = (op.parameters || []).map((p: any) => p.name).sort()
      assert.deepEqual(declarados, enElCamino, `${metodo.toUpperCase()} ${camino}`)
    }
  })

  test('los identificadores de operación no se repiten', () => {
    /* Dos operaciones con el mismo `operationId` hacen que un generador de
       clientes tire una de las dos, casi siempre sin avisar. */
    const ids = operaciones().map((o) => o.op.operationId)
    assert.equal(new Set(ids).size, ids.length, 'hay operationId repetidos')
  })

  describe('los avisos', () => {
    test('están todos, y son los que el código manda', () => {
      assert.deepEqual(Object.keys(DOC.webhooks).sort(), [...EVENTOS].sort())
    })

    test('CADA UNO EXPLICA COMO COMPROBAR LA FIRMA', () => {
      /* Es la parte que un integrador se salta si no está delante. Un aviso que
         se cree sin comprobar la firma es una vía directa para que cualquiera
         que adivine su dirección le cuele identidades aprobadas. */
      for (const [evento, w] of Object.entries<any>(DOC.webhooks)) {
        const d = w.post.description
        assert.match(d, /X-Genesis-Firma/, `${evento}: no dice dónde viene la firma`)
        assert.match(d, /HMAC-SHA256/, `${evento}: no dice cómo se calcula`)
        assert.match(d, /cinco minutos/, `${evento}: no dice que hay que rechazar los viejos`)
        assert.match(d, /entregaId/, `${evento}: no avisa de que puede llegar repetido`)
      }
    })
  })

  test('es OpenAPI 3.1, que es lo que hace falta para los webhooks', () => {
    assert.equal(DOC.openapi, '3.1.0')
    assert.equal(DOC.components.securitySchemes.claveDeApi.name, 'X-API-Key')
  })

  test('el documento entero es JSON serializable', () => {
    /* Se sirve como JSON. Un `undefined` o una referencia circular metida por
       descuido lo convierte en un 500 en la ruta pública. */
    const texto = JSON.stringify(DOC)
    assert.ok(texto.length > 5000)
    assert.deepEqual(Object.keys(JSON.parse(texto).paths).length, Object.keys(DOC.paths).length)
  })
})
