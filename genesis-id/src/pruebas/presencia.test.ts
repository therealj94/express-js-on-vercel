// Pruebas de «cuándo se le vio de verdad a cada persona».
//
// EL FALLO QUE ESTAS PRUEBAS FIJAN
//
// El directorio decidía si alguien estaba activo mirando SOLO el `ultimoAcceso`
// que manda la app en su sincronización, cada seis horas y únicamente si el
// backend de esa app se molesta en escribir ese campo al iniciar sesión. Veta
// Wallet no lo escribía: gente que entraba todos los días salía en el panel
// como «nunca entró», y los filtros de inactividad los escondían.
//
// La telemetría sí sabía la verdad y la sabía al minuto. Nadie las cruzaba.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ingerir, almacen } from '../analitica/eventos.js'
import { sincronizar, consultar, fichaPorEmail } from '../directorio/padron.js'
import { ultimaSenal, tramoDe } from '../directorio/presencia.js'

const ahora = () => new Date().toISOString()

// CADA PRUEBA USA SU PROPIA APP.
//
// El padrón guarda por `app|idExterno` y no expone forma de vaciarlo — es un
// almacén de producción, no un banco de pruebas. Vaciar solo la telemetría
// dejaba las personas de la prueba anterior dentro y las cuentas salían
// infladas. Una app distinta por prueba las aísla de verdad, sin necesidad de
// abrirle al código de producción una puerta que solo sirve para los tests.
let n = 0
const nuevaApp = () => `prueba-${++n}`

/** Deja la telemetría vacía. El padrón se aísla con `nuevaApp()`. */
function limpiar() {
  almacen.memoria.eventos.length = 0
  almacen.memoria.usuarios.clear()
  almacen.memoria.dias.clear()
  almacen.memoria.activos.clear()
}

test('quien entra pero su app no reporta ultimoAcceso ya NO sale como «nunca entró»', async () => {
  limpiar()
  const APP = nuevaApp()

  // El padrón la trae SIN ultimoAcceso — el caso real de Veta Wallet.
  await sincronizar(APP, [{ idExterno: 'u1', email: 'ana@ejemplo.com', nombre: 'Ana' }])

  const antes = await consultar({ app: APP })
  assert.equal(antes.usuarios[0].vistoEn, null, 'sin telemetría no hay señal, y eso está bien')
  assert.equal(antes.usuarios[0].tramo, 'nunca')

  // Ahora abre la app: llega un evento de telemetría.
  await ingerir(APP, [{
    tipo: 'pantalla', nombre: 'inicio', usuario: 'u1',
    plataforma: 'android', en: ahora(),
  }], 'PA')

  const despues = await consultar({ app: APP })
  const ana = despues.usuarios[0]
  assert.ok(ana.vistoEn, 'la telemetría tiene que rellenar el hueco que deja el padrón')
  assert.equal(ana.fuenteVisto, 'telemetria')
  assert.equal(ana.tramo, 'ahora')
  assert.equal(ana.plataformas.android !== undefined, true)
})

test('el filtro «nunca entró» deja de mentir', async () => {
  limpiar()
  const APP = nuevaApp()
  await sincronizar(APP, [
    { idExterno: 'u1', email: 'ana@ejemplo.com' },
    { idExterno: 'u2', email: 'beto@ejemplo.com' },
  ])
  // Solo Ana abre la app.
  await ingerir(APP, [{ tipo: 'pantalla', nombre: 'inicio', usuario: 'u1', en: ahora() }], 'PA')

  const nunca = await consultar({ app: APP, nuncaEntro: true })
  const correos = nunca.usuarios.map((u: any) => u.email)
  assert.deepEqual(correos, ['beto@ejemplo.com'],
    'Ana entró: sacarla de «nunca entró» es justo el arreglo')

  const si = await consultar({ app: APP, nuncaEntro: false })
  assert.deepEqual(si.usuarios.map((u: any) => u.email), ['ana@ejemplo.com'])
})

test('el filtro de inactividad no esconde a quien acaba de entrar', async () => {
  limpiar()
  const APP = nuevaApp()
  await sincronizar(APP, [{ idExterno: 'u1', email: 'ana@ejemplo.com' }])
  await ingerir(APP, [{ tipo: 'pantalla', nombre: 'inicio', usuario: 'u1', en: ahora() }], 'PA')

  const dormidos = await consultar({ app: APP, inactivosDias: 30 })
  assert.equal(dormidos.usuarios.length, 0,
    'entró hace un segundo: no puede aparecer entre los dormidos de 30 días')
})

test('gana la fuente más reciente, venga de donde venga', () => {
  const viejo = new Date(Date.now() - 5 * 86400000).toISOString()
  const nuevo = new Date(Date.now() - 60000).toISOString()

  // Telemetría más nueva que el padrón.
  assert.deepEqual(
    ultimaSenal(viejo, { ultima: nuevo, plataformas: {}, eventos: 1 }),
    { en: nuevo, fuente: 'telemetria' })

  // Padrón más nuevo que la telemetría — pasa cuando la app reporta el login
  // al momento y la telemetría se quedó atrás.
  assert.deepEqual(
    ultimaSenal(nuevo, { ultima: viejo, plataformas: {}, eventos: 1 }),
    { en: nuevo, fuente: 'padron' })

  // Solo una de las dos.
  assert.equal(ultimaSenal(viejo, undefined).fuente, 'padron')
  assert.equal(ultimaSenal(undefined, { ultima: nuevo, plataformas: {}, eventos: 1 }).fuente, 'telemetria')

  // Ninguna.
  assert.deepEqual(ultimaSenal(undefined, undefined), { en: null, fuente: null })
})

test('los tramos parten el tiempo sin huecos ni solapes', () => {
  const hace = (ms: number) => new Date(Date.now() - ms).toISOString()
  assert.equal(tramoDe(hace(60000)), 'ahora')          // 1 minuto
  assert.equal(tramoDe(hace(3 * 3600000)), 'hoy')      // 3 horas
  assert.equal(tramoDe(hace(3 * 86400000)), 'semana')  // 3 días
  assert.equal(tramoDe(hace(20 * 86400000)), 'mes')    // 20 días
  assert.equal(tramoDe(hace(200 * 86400000)), 'dormido')
  assert.equal(tramoDe(null), 'nunca')
})

test('los tramos del resumen suman el total: nadie se cuenta dos veces', async () => {
  limpiar()
  const APP = nuevaApp()
  await sincronizar(APP, [
    { idExterno: 'u1', email: 'ana@ejemplo.com' },
    { idExterno: 'u2', email: 'beto@ejemplo.com' },
    { idExterno: 'u3', email: 'caro@ejemplo.com' },
  ])
  await ingerir(APP, [{ tipo: 'pantalla', nombre: 'inicio', usuario: 'u1', en: ahora() }], 'PA')

  const r = await consultar({ app: APP });
  const suma = Object.values(r.tramos).reduce((s: number, n: any) => s + n, 0)
  assert.equal(suma, 3, 'cada persona cae en exactamente un tramo')
  assert.equal(r.tramos.ahora, 1)
  assert.equal(r.tramos.nunca, 2)
})

test('la web y el teléfono se guardan por separado', async () => {
  limpiar()
  const APP = nuevaApp()
  await sincronizar(APP, [{ idExterno: 'u1', email: 'ana@ejemplo.com' }])

  const antier = new Date(Date.now() - 2 * 86400000).toISOString()
  await ingerir(APP, [
    { tipo: 'pantalla', nombre: 'inicio', usuario: 'u1', plataforma: 'web', en: antier },
    { tipo: 'pantalla', nombre: 'inicio', usuario: 'u1', plataforma: 'android', en: ahora() },
  ], 'PA')

  const ficha = await fichaPorEmail('ana@ejemplo.com')
  // Por correo salen todas sus cuentas del ecosistema; aquí interesa la de
  // esta prueba, no la que dejó otra.
  const cuenta: any = ficha!.cuentas.find((c: any) => c.app === APP)
  assert.ok(cuenta, 'la cuenta de esta app tiene que estar en la ficha')
  assert.ok(cuenta.plataformas.web, 'la web no puede quedar tapada por el teléfono')
  assert.ok(cuenta.plataformas.android)
  assert.ok(cuenta.plataformas.android > cuenta.plataformas.web)
  // La señal general es la más reciente de las dos.
  assert.equal(cuenta.tramo, 'ahora')
})

test('quien usa la app pero no está en el padrón no se identifica por error', async () => {
  limpiar()
  const APP = nuevaApp()
  await sincronizar(APP, [{ idExterno: 'u1', email: 'ana@ejemplo.com' }])
  // Evento de alguien que la app nunca sincronizó.
  await ingerir(APP, [{ tipo: 'pantalla', nombre: 'inicio', usuario: 'desconocido', en: ahora() }], 'PA')

  const r = await consultar({ app: APP })
  assert.equal(r.usuarios.length, 1, 'la telemetría no puede inventar filas en el directorio')
  assert.equal(r.usuarios[0].email, 'ana@ejemplo.com')
  assert.equal(r.usuarios[0].vistoEn, null, 'y el evento ajeno no se le cuelga a Ana')
})
