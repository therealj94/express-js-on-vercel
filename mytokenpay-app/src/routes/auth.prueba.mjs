// Prueba de la recuperación de contraseña de MyTokenPay.
//
// Cubre lo que se rompió y lo que no debe volver a romperse:
//   1. el código de recuperación ya no viaja en la respuesta;
//   2. la respuesta es idéntica exista o no la cuenta;
//   3. un código solo sirve una vez;
//   4. un código firmado con otro secreto no vale.
//
// Corre contra el servidor real levantado en memoria, sin tocar nada externo:
//   node src/routes/auth.prueba.mjs

import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'secreto-solo-para-esta-prueba'
delete process.env.EXPOSE_RESET_TOKEN
delete process.env.VERCEL

const { authRouter } = await import('./auth.js')
const express = (await import('express')).default
const jwt = (await import('jsonwebtoken')).default

const app = express()
app.use(express.json())
app.use('/auth', authRouter)
const server = app.listen(0)
const puerto = server.address().port
const base = `http://127.0.0.1:${puerto}/auth`

const pedir = async (ruta, cuerpo) => {
  const r = await fetch(base + ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })
  return { estado: r.status, datos: await r.json().catch(() => ({})) }
}

let fallos = 0
const comprobar = (nombre, fn) => {
  try {
    fn()
    console.log('  ok   ', nombre)
  } catch (e) {
    fallos++
    console.log('  FALLA', nombre, '\n         ', e.message)
  }
}

// ── preparación: una cuenta real ──────────────────────────────────────────────
const correo = `prueba${Date.now()}@ordenglobal.org`
const alta = await pedir('/signup', { email: correo, password: 'contrasena-original', fullName: 'Cuenta de prueba' })
assert.equal(alta.estado, 201, 'no se pudo crear la cuenta de prueba')

// ── 1. el código ya no viaja en la respuesta ─────────────────────────────────
const olvido = await pedir('/forgot-password', { email: correo })
comprobar('la respuesta no trae el código de recuperación', () => {
  assert.equal(olvido.estado, 200)
  assert.equal(olvido.datos.demoResetToken, undefined,
    'el código sigue viajando en la respuesta: cualquiera con el correo toma la cuenta')
  assert.equal(Object.keys(olvido.datos).length, 1, 'la respuesta trae campos de más')
})

// ── 2. no se puede averiguar quién tiene cuenta ──────────────────────────────
const inexistente = await pedir('/forgot-password', { email: 'nadie-tiene-este-correo@ejemplo.com' })
comprobar('la respuesta es idéntica exista o no la cuenta', () => {
  assert.deepEqual(inexistente.datos, olvido.datos,
    'la respuesta delata si un correo está registrado')
})

// ── 3. sin el código, no hay forma de entrar ─────────────────────────────────
const inventado = await pedir('/reset-password', { token: 'esto-no-es-un-codigo', newPassword: 'otra-contrasena' })
comprobar('un código inventado es rechazado', () => {
  assert.equal(inventado.estado, 400)
})

// ── 4. un código firmado con otro secreto no vale ────────────────────────────
const falsificado = jwt.sign({ sub: 'cualquiera', purpose: 'reset', pwd: 'abc' }, 'otro-secreto-distinto')
const conFalso = await pedir('/reset-password', { token: falsificado, newPassword: 'otra-contrasena' })
comprobar('un código firmado con otro secreto es rechazado', () => {
  assert.equal(conFalso.estado, 400)
})

// ── 5. un código legítimo solo sirve una vez ─────────────────────────────────
// Se emite con la bandera de desarrollo, que es la única vía admitida.
process.env.EXPOSE_RESET_TOKEN = '1'
const moduloAparte = await import('./auth.js?recarga=' + Date.now())
const app2 = express()
app2.use(express.json())
app2.use('/auth', moduloAparte.authRouter)
const server2 = app2.listen(0)
const base2 = `http://127.0.0.1:${server2.address().port}/auth`
const pedir2 = async (ruta, cuerpo) => {
  const r = await fetch(base2 + ruta, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
  })
  return { estado: r.status, datos: await r.json().catch(() => ({})) }
}
const correo2 = `prueba2${Date.now()}@ordenglobal.org`
await pedir2('/signup', { email: correo2, password: 'contrasena-original', fullName: 'Segunda cuenta' })
const conBandera = await pedir2('/forgot-password', { email: correo2 })

comprobar('con la bandera de desarrollo sí se emite el código', () => {
  assert.ok(conBandera.datos.demoResetToken, 'la bandera no entregó el código')
})

const codigo = conBandera.datos.demoResetToken
const primerUso = await pedir2('/reset-password', { token: codigo, newPassword: 'contrasena-nueva-1' })
comprobar('el primer uso del código funciona', () => {
  assert.equal(primerUso.estado, 200)
})

const segundoUso = await pedir2('/reset-password', { token: codigo, newPassword: 'contrasena-nueva-2' })
comprobar('el mismo código NO sirve una segunda vez', () => {
  assert.equal(segundoUso.estado, 400,
    'el código se puede gastar dos veces: quien lo intercepte cambia la contraseña después del dueño')
})

// ── 6. la contraseña quedó en la del primer uso ──────────────────────────────
const entra = await pedir2('/login', { email: correo2, password: 'contrasena-nueva-1' })
comprobar('la contraseña es la del primer uso, no la del segundo intento', () => {
  assert.equal(entra.estado, 200)
})

server.close(); server2.close()
console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
