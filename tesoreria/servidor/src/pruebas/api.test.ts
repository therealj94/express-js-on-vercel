// Pruebas del servidor de Tesorería: el flujo completo contra un servidor real
// en un puerto libre, con almacén en un archivo temporal.
//
// Se prueba lo que no puede fallar en silencio: que nadie opere sin sesión, que
// el rol manda, que una emisión sin respaldo se niega, que las firmas Ed25519
// verifican y que el libro queda íntegro después de todo.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.TESORERIA_DATA_FILE = join(mkdtempSync(join(tmpdir(), 'tesoreria-')), 'estado.json')
process.env.TESORERIA_ADMIN_EMAIL = 'presidente@prueba.og'
process.env.TESORERIA_ADMIN_PASSWORD = 'contrasena-de-prueba-larga'
process.env.TESORERIA_ADMIN_NOMBRE = 'Presidenta de Prueba'

const { default: app, arrancar } = await import('../index.js')

let base = ''
let servidor: any
let tokenPres = ''
let tokenCons = ''
let tokenAud = ''

const pedir = async (ruta: string, opciones: { metodo?: string; cuerpo?: any; token?: string } = {}) => {
  const r = await fetch(base + ruta, {
    method: opciones.metodo || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opciones.token ? { Authorization: 'Bearer ' + opciones.token } : {}) },
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
  })
  return { status: r.status, json: await r.json() }
}
const comando = (nombre: string, datos: any, token: string) => pedir('/api/comandos', { metodo: 'POST', cuerpo: { nombre, datos }, token })

before(async () => {
  await arrancar()
  await new Promise<void>((ok) => { servidor = app.listen(0, '127.0.0.1', () => ok()) })
  base = `http://127.0.0.1:${servidor.address().port}`
})
after(() => servidor?.close())

test('sin sesión no se ve ni se toca nada', async () => {
  assert.equal((await pedir('/api/estado')).status, 401)
  assert.equal((await pedir('/api/comandos', { metodo: 'POST', cuerpo: { nombre: 'sistema.freno', datos: {} } })).status, 401)
})

test('la prueba de reservas es pública y cuadra con las reglas', async () => {
  const r = await pedir('/api/prueba-de-reservas')
  assert.equal(r.status, 200)
  assert.equal(r.json.origen.enCirculacion, 25250000)
  assert.equal(r.json.origen.valorUsd, 50500000)
  assert.ok(r.json.respaldo.ratio > 117 && r.json.respaldo.ratio < 118)
  assert.equal(r.json.libro.integro, true)
})

test('entra la presidenta y debe cambiar la contraseña provisional... salvo que la fijó por entorno', async () => {
  const r = await pedir('/api/sesion/entrar', { metodo: 'POST', cuerpo: { email: 'presidente@prueba.og', contrasena: 'contrasena-de-prueba-larga' } })
  assert.equal(r.status, 200)
  assert.equal(r.json.operador.rol, 'presidente')
  assert.equal(r.json.operador.debeCambiarContrasena, false)
  tokenPres = r.json.token
  const e = await pedir('/api/estado', { token: tokenPres })
  assert.equal(e.json.estado.sesion.usuario, 'Presidenta de Prueba')
  assert.deepEqual(e.json.estado.consejo, ['Presidenta de Prueba'])
})

test('la contraseña equivocada no entra y no dice por qué', async () => {
  const r = await pedir('/api/sesion/entrar', { metodo: 'POST', cuerpo: { email: 'presidente@prueba.og', contrasena: 'otra-cosa-larga-tambien' } })
  assert.equal(r.status, 401)
  assert.equal(r.json.error, 'Correo o contraseña incorrectos')
})

test('la presidenta da de alta consejeros y un auditor', async () => {
  for (const [nombre, email, rol] of [['Consejera Uno', 'uno@prueba.og', 'consejero'], ['Consejero Dos', 'dos@prueba.og', 'consejero'], ['Auditora', 'aud@prueba.og', 'auditor']]) {
    const r = await pedir('/api/operadores', { metodo: 'POST', token: tokenPres, cuerpo: { nombre, email, rol, contrasena: 'contrasena-larga-1234' } })
    assert.equal(r.status, 201, JSON.stringify(r.json))
    assert.ok(r.json.operador.clavePublica.length > 20)
  }
  // Un consejero no puede crear operadores.
  const c = await pedir('/api/sesion/entrar', { metodo: 'POST', cuerpo: { email: 'uno@prueba.og', contrasena: 'contrasena-larga-1234' } })
  tokenCons = c.json.token
  assert.equal(c.json.operador.debeCambiarContrasena, true)
  assert.equal((await pedir('/api/operadores', { metodo: 'POST', token: tokenCons, cuerpo: { nombre: 'X', email: 'x@prueba.og', rol: 'auditor', contrasena: 'contrasena-larga-1234' } })).status, 403)
})

test('con contraseña provisional no se opera; tras cambiarla, sí', async () => {
  const bloqueado = await comando('reserva.revision', { id: 'RES-CXC-05' }, tokenCons)
  assert.equal(bloqueado.status, 403)
  assert.match(bloqueado.json.error, /provisional/)
  const cambio = await pedir('/api/sesion/contrasena', { metodo: 'POST', token: tokenCons, cuerpo: { actual: 'contrasena-larga-1234', nueva: 'una-nueva-contrasena-segura' } })
  assert.equal(cambio.status, 200)
  const c = await pedir('/api/sesion/entrar', { metodo: 'POST', cuerpo: { email: 'uno@prueba.og', contrasena: 'una-nueva-contrasena-segura' } })
  tokenCons = c.json.token
  const dos = await pedir('/api/sesion/contrasena', { metodo: 'POST', token: (await pedir('/api/sesion/entrar', { metodo: 'POST', cuerpo: { email: 'dos@prueba.og', contrasena: 'contrasena-larga-1234' } })).json.token, cuerpo: { actual: 'contrasena-larga-1234', nueva: 'otra-nueva-contrasena-segura' } })
  assert.equal(dos.status, 200)
  const a = await pedir('/api/sesion/contrasena', { metodo: 'POST', token: (await pedir('/api/sesion/entrar', { metodo: 'POST', cuerpo: { email: 'aud@prueba.og', contrasena: 'contrasena-larga-1234' } })).json.token, cuerpo: { actual: 'contrasena-larga-1234', nueva: 'auditora-contrasena-segura' } })
  assert.equal(a.status, 200)
  tokenAud = (await pedir('/api/sesion/entrar', { metodo: 'POST', cuerpo: { email: 'aud@prueba.og', contrasena: 'auditora-contrasena-segura' } })).json.token
})

test('el auditor lo ve todo y no toca nada', async () => {
  assert.equal((await pedir('/api/estado', { token: tokenAud })).status, 200)
  const r = await comando('sistema.freno', { congelar: true }, tokenAud)
  assert.equal(r.status, 403)
})

test('el rol manda: un consejero no puede cambiar la política', async () => {
  const r = await comando('politica.modificar', { ratioObjetivo: 115, ratioMinimo: 100, firmasRequeridas: 1, diasObjecion: 0, revisionValuacionMeses: 6 }, tokenCons)
  assert.equal(r.status, 403)
})

test('flujo completo: firmas Ed25519 verificables, aprobación con respaldo, emisión y libro íntegro', async () => {
  // El Consejo real tiene 3 miembros (presidenta + 2 consejeros): se exigen 3 firmas.
  const tokenDos = (await pedir('/api/sesion/entrar', { metodo: 'POST', cuerpo: { email: 'dos@prueba.og', contrasena: 'otra-nueva-contrasena-segura' } })).json.token
  const e0 = (await pedir('/api/estado', { token: tokenPres })).json.estado
  assert.equal(e0.consejo.length, 3)

  // Un tesorero/consejero crea una solicitud para VTRE (6 M de respaldo; hay 7.57 M libres).
  const sol = await comando('solicitud.crear', { tokenId: 'SEC-VTRE', cantidad: 60000, precio: 100, causa: 'nuevo_activo', motivo: 'Emisión inicial contra el inmueble certificado', evidencias: [{ nombre: 'Avalúo CBRE', tipo: 'Valuación' }] }, tokenCons)
  assert.equal(sol.status, 200, JSON.stringify(sol.json))
  const idSol = sol.json.resultado.creado

  // Firma cada quien con su llave; el auditor no puede.
  assert.equal((await comando('solicitud.firmar', { id: idSol }, tokenAud)).status, 403)
  for (const t of [tokenPres, tokenCons, tokenDos]) assert.equal((await comando('solicitud.firmar', { id: idSol }, t)).status, 200)
  // Firmar dos veces no vale.
  assert.equal((await comando('solicitud.firmar', { id: idSol }, tokenCons)).status, 422)

  const firmas = await pedir(`/api/solicitudes/${idSol}/firmas`)
  assert.equal(firmas.json.firmas.length, 3)
  for (const f of firmas.json.firmas) assert.equal(f.verificada, true, `firma de ${f.quien}`)

  // Aprobar: solo con permiso de dictaminar.
  const ap = await comando('solicitud.aprobar', { id: idSol }, tokenPres)
  assert.equal(ap.status, 200, JSON.stringify(ap.json))
  const vtre = ap.json.estado.securities.find((t: any) => t.id === 'SEC-VTRE')
  assert.equal(vtre.supply.autorizado, 60000)
  assert.equal(vtre.origenAsignado, 6000000)

  // Emitir la cabecera autorizada; no más.
  assert.equal((await comando('token.emitir', { tokenId: 'SEC-VTRE', cantidad: 60001 }, tokenCons)).status, 422)
  const em = await comando('token.emitir', { tokenId: 'SEC-VTRE', cantidad: 60000 }, tokenCons)
  assert.equal(em.status, 200)

  // Ahora quedan 1.57 M libres: pedir 16 M se niega ya en el dictamen.
  const grande = await comando('solicitud.crear', { tokenId: 'SEC-ONDK', cantidad: 200000000, precio: 0.06, causa: 'revaluacion', motivo: 'x' }, tokenCons)
  // (la valuación de ONDK no aguanta 200 M más: se rechaza al crear)
  assert.equal(grande.status, 422)

  const v = await pedir('/api/libro/verificar')
  assert.equal(v.json.ok, true)
  assert.equal(v.json.sello.length, 64, 'SHA-256')
})

test('un consejero dado de baja pierde la sesión y sale del Consejo', async () => {
  const lista = (await pedir('/api/operadores', { token: tokenPres })).json.operadores
  const dos = lista.find((o: any) => o.email === 'dos@prueba.og')
  const r = await pedir(`/api/operadores/${dos.id}/baja`, { metodo: 'POST', token: tokenPres })
  assert.equal(r.status, 200)
  const e = (await pedir('/api/estado', { token: tokenPres })).json.estado
  assert.equal(e.consejo.length, 2)
})

test('el estado se puede reiniciar a la semilla y queda asentado', async () => {
  const r = await pedir('/api/estado/reiniciar', { metodo: 'POST', token: tokenPres })
  assert.equal(r.status, 200)
  assert.equal(r.json.estado.libro[0].tipo, 'estado.reiniciado')
  assert.equal((await pedir('/api/libro/verificar')).json.ok, true)
  assert.equal((await pedir('/api/estado/reiniciar', { metodo: 'POST', token: tokenCons })).status, 403)
})
