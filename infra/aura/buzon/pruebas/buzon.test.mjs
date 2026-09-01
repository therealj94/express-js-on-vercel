// El buzón es lo ÚNICO de la cadena expuesto a internet. Lo que se prueba aquí
// no es que funcione: es que quien llegue sin llave no se lleve nada.

import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'prueba'
process.env.AURA_BUZON_LLAVE = 'llave-de-prueba-larga-0123456789'

const { app, cola, listos, limpiar, TOPE_TEXTO, POR_IP } =
  await import('../servidor.js')

// Un servidor de verdad en un puerto libre: probar rutas de Express llamando a
// las funciones por dentro deja fuera justo lo que importa —las cabeceras, el
// cuerpo, los códigos— que es donde viven los fallos de una puerta pública.
const servidor = app.listen(0)
await new Promise(r => servidor.once('listening', r))
const BASE = `http://127.0.0.1:${servidor.address().port}`
const LLAVE = process.env.AURA_BUZON_LLAVE

function limpio () {
  cola.length = 0
  listos.clear()
}

const pedir = (ruta, opciones = {}) => fetch(BASE + ruta, {
  ...opciones,
  headers: {
    'content-type': 'application/json',
    // Cada prueba con su propia IP: el freno es global y si todas dijeran ser
    // la misma, la trigésima llamada del archivo tumbaría una prueba que no
    // tiene nada que ver. Es el mismo tropiezo que hubo en `probar-memoria.py`.
    'x-forwarded-for': opciones.ip || `10.0.0.${Math.floor(Math.random() * 250) + 1}`,
    ...(opciones.headers || {})
  }
})

test('SIN LLAVE NO SE RECOGE NADA — la cola lleva conversaciones de gente', async () => {
  limpio()
  cola.push({ ticket: 't', sesion: null, texto: 'secreto', cuando: Date.now() })

  for (const cabeceras of [
    {},
    { authorization: 'Bearer ' },
    { authorization: 'Bearer equivocada' },
    { authorization: LLAVE },                       // sin el «Bearer »
    { authorization: 'Bearer ' + LLAVE + 'x' },     // una letra de más
    { authorization: 'Bearer ' + LLAVE.slice(0, -1) }
  ]) {
    const r = await pedir('/cola', { headers: cabeceras })
    assert.equal(r.status, 401, JSON.stringify(cabeceras))
  }
  assert.equal(cola.length, 1, 'alguien sin llave vació la cola')
})

test('con la llave sí, y lo recogido se saca de la cola', async () => {
  limpio()
  cola.push({ ticket: 't1', sesion: null, texto: 'hola', cuando: Date.now() })
  const r = await pedir('/cola', { headers: { authorization: 'Bearer ' + LLAVE } })
  assert.equal(r.status, 200)
  const j = await r.json()
  assert.equal(j.recados.length, 1)
  assert.equal(j.recados[0].texto, 'hola')
  assert.equal(cola.length, 0, 'se recogió dos veces el mismo recado')
})

test('tampoco se puede CONTESTAR sin llave', async () => {
  limpio()
  const r = await pedir('/contesta', {
    method: 'POST',
    body: JSON.stringify({ ticket: 'x', texto: 'lo que quiera' })
  })
  assert.equal(r.status, 401)
  assert.equal(listos.size, 0,
    'un desconocido pudo poner palabras en boca de AU-RA')
})

test('el camino entero: la web deja, el nodo recoge, la web oye', async () => {
  limpio()
  const uno = await (await pedir('/decir', {
    method: 'POST',
    body: JSON.stringify({ texto: 'hola', sesion: 'web:aaaaaaaaaaaaaaaaaaaaaa' })
  })).json()
  assert.ok(uno.ticket)

  const c = await (await pedir('/cola', {
    headers: { authorization: 'Bearer ' + LLAVE }
  })).json()
  assert.equal(c.recados[0].ticket, uno.ticket)
  assert.equal(c.recados[0].sesion, 'web:aaaaaaaaaaaaaaaaaaaaaa')

  await pedir('/contesta', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + LLAVE },
    body: JSON.stringify({
      ticket: uno.ticket, texto: 'buenas', botones: [{ texto: 'Sí', id: 'si' }]
    })
  })

  const oido = await (await pedir('/oir/' + uno.ticket)).json()
  assert.equal(oido.listo, true)
  assert.equal(oido.texto, 'buenas')
  assert.equal(oido.botones[0].id, 'si')
})

test('una respuesta se entrega UNA vez y se olvida', async () => {
  limpio()
  listos.set('t2', { texto: 'x', botones: [], cuando: Date.now() })
  assert.equal((await (await pedir('/oir/t2')).json()).listo, true)
  assert.equal((await (await pedir('/oir/t2')).json()).listo, false,
    'la respuesta se quedó guardada: cualquiera con el ticket la vuelve a leer')
})

test('un ticket que no existe no revienta ni cuenta nada', async () => {
  limpio()
  const j = await (await pedir('/oir/no-existe')).json()
  assert.equal(j.listo, false)
})

test('el texto se recorta: es un chat, no un sitio para subir cosas', async () => {
  limpio()
  await pedir('/decir', {
    method: 'POST',
    body: JSON.stringify({ texto: 'a'.repeat(TOPE_TEXTO * 5) })
  })
  assert.equal(cola[0].texto.length, TOPE_TEXTO)
})

test('un mensaje vacío no ocupa sitio en la cola', async () => {
  limpio()
  const r = await pedir('/decir', {
    method: 'POST', body: JSON.stringify({ texto: '   ' })
  })
  assert.equal(r.status, 400)
  assert.equal(cola.length, 0)
})

test('el freno cuenta por IP, y la de verdad es la PRIMERA', async () => {
  limpio()
  // Si se tomara la última, cualquiera se salta el freno mandando la cabecera
  // con una IP inventada al final.
  for (let i = 0; i < POR_IP; i++) {
    const r = await pedir('/decir', {
      method: 'POST',
      ip: '9.9.9.9, 1.2.3.4',
      body: JSON.stringify({ texto: 'hola' })
    })
    assert.equal(r.status, 200, 'frenó antes de tiempo en la vuelta ' + i)
  }
  const r = await pedir('/decir', {
    method: 'POST',
    ip: '9.9.9.9, 5.6.7.8',              // cambia la de atrás: no le sirve
    body: JSON.stringify({ texto: 'hola' })
  })
  assert.equal(r.status, 429, 'se saltó el freno cambiando la IP del final')
})

test('el freno de uno no frena a otro', async () => {
  limpio()
  for (let i = 0; i < POR_IP; i++) {
    await pedir('/decir', { method: 'POST', ip: '7.7.7.7', body: JSON.stringify({ texto: 'x' }) })
  }
  assert.equal((await pedir('/decir', {
    method: 'POST', ip: '7.7.7.7', body: JSON.stringify({ texto: 'x' })
  })).status, 429)
  assert.equal((await pedir('/decir', {
    method: 'POST', ip: '8.8.8.8', body: JSON.stringify({ texto: 'x' })
  })).status, 200)
})

test('los recados viejos se caen solos', async () => {
  limpio()
  cola.push({ ticket: 'viejo', texto: 'x', cuando: Date.now() - 10 * 60 * 1000 })
  listos.set('viejo2', { texto: 'x', botones: [], cuando: Date.now() - 10 * 60 * 1000 })
  limpiar()
  assert.equal(cola.length, 0)
  assert.equal(listos.size, 0)
})

test('/healthz dice si falta la llave, para verlo desde fuera', async () => {
  const j = await (await pedir('/healthz')).json()
  assert.equal(j.ok, true)
  assert.equal(j.llaveConfigurada, true)
  assert.equal(typeof j.esperando, 'number')
})

test('el buzón NO decide permisos: la sesión viaja tal cual al nodo', async () => {
  // Quien decide es el nodo, que tiene el escalafón. Si este proceso empezara
  // a opinar de identidades habría DOS sitios decidiendo lo mismo, y en cuanto
  // discrepen gana el más permisivo.
  limpio()
  await pedir('/decir', {
    method: 'POST',
    body: JSON.stringify({ texto: 'hola', sesion: '50432136457' })
  })
  assert.equal(cola[0].sesion, '50432136457',
    'el buzón manipuló la sesión: eso lo decide el nodo')
})

test.after(() => servidor.close())
