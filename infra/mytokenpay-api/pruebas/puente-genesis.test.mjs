// El puente de MyTokenPay con Genesis ID es EL MISMO que el de Veta Wallet.
//
//   node --test pruebas/puente-genesis.test.mjs
//
// La copia byte a byte la vigila la prueba de Veta
// (infra/veta-wallet-backend/pruebas/probar-puente-genesis.mjs). Esta comprueba
// lo propio de MyTokenPay: que el adaptador de `src/routes/genesis.ts` monta
// ese puente detrás de la sesión de la casa, y que como esa sesión NO prueba el
// correo (el alta no lo verifica), una cuenta con el correo de una identidad
// ajena no puede atarse a ella, ni sacar pases de SSO a su nombre, ni tocarle
// la foto, ni leerle la billetera. Solo la sesión que nació de un pase de
// Genesis ID (`/api/auth/sso`) lleva el GID y usa el puente sobre él.
//
// Y que el vínculo MyTokenPay→Genesis va APAGADO salvo MTP_VINCULO_GENESIS=1.
//
// Levanta el API de verdad DOS veces (almacén en memoria): con el vínculo
// apagado, que es como se despliega, y encendido. Las dos apuntan a un
// Genesis ID DE MENTIRA en 127.0.0.1. Ninguna red ni clave de verdad.

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createServer as crearNet } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const CASA = join(AQUI, '..')
const CLAVE = 'gid_test_solo_para_esta_prueba'

// La billetera que Veta custodia para la víctima, y una cualquiera.
const VETA_VICTIMA = '0x52908400098527886e0f7030069857d2e4169ee7'
const AJENA = '0x2222222222222222222222222222222222222222'

async function puertoLibre() {
  return new Promise((ok) => {
    const s = crearNet()
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port
      s.close(() => ok(p))
    })
  })
}

// ── El Genesis de mentira ───────────────────────────────────────────────────
//
// victima@  verificada, con GID y el vínculo de Veta con su billetera.
// tramite@  a medio trámite: identidad sin GID todavía.
// el resto  no tiene identidad (404) hasta que `/estado` la crea.
const IDENTIDADES = {
  'victima@prueba.test': {
    id: 'idn-victima', email: 'victima@prueba.test', gid: 'GID-VICTIMA', estado: 'verificada',
    estadoPublicado: 'verificada', nombreLegal: 'Victima Sintetica', fotoCredencial: 'data:image/jpeg;base64,FOTO',
  },
  'tramite@prueba.test': { id: 'idn-tramite', email: 'tramite@prueba.test', gid: null, estado: 'datos' },
}
const recibido = []
const genesis = createServer((req, res) => {
  let cuerpo = ''
  req.on('data', (d) => { cuerpo += d })
  req.on('end', () => {
    const ruta = req.url.split('?')[0]
    let json = null
    try { json = cuerpo ? JSON.parse(cuerpo) : null } catch { /* no era JSON */ }
    recibido.push({ metodo: req.method, ruta, clave: req.headers['x-api-key'], cuerpo: json })
    const contestar = (estado, datos) => {
      res.writeHead(estado, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(datos))
    }
    if (ruta.startsWith('/api/v1/identidades/por-email/')) {
      const email = decodeURIComponent(ruta.split('/').pop()).trim().toLowerCase()
      const idn = IDENTIDADES[email]
      return idn ? contestar(200, { identidad: idn }) : contestar(404, { error: 'Identidad no encontrada' })
    }
    if (req.method === 'POST' && ruta === '/api/v1/identidades') {
      return contestar(201, { identidad: { id: 'idn-nueva', email: json?.email, gid: null, estado: 'iniciada' } })
    }
    if (ruta === '/api/v1/gid/GID-VICTIMA') {
      return contestar(200, {
        tipo: 'personal', gid: 'GID-VICTIMA', verificada: true, bloqueada: false,
        apps: [{ app: 'mytokenpay', direccion: AJENA }, { app: 'veta-wallet', direccion: VETA_VICTIMA }],
      })
    }
    if (ruta === '/api/v1/sso/verificar') {
      if (json?.token !== 'pase-victima') return contestar(401, { valido: false, error: 'Token inválido o vencido' })
      return contestar(200, {
        valido: true, gid: 'GID-VICTIMA',
        perfil: { nombre: 'Victima Sintetica', apps: [{ app: 'veta-wallet', direccion: VETA_VICTIMA }] },
      })
    }
    if (ruta === '/api/v1/sso/token') return contestar(200, { token: 'pase-emitido', expiraEnSegundos: 300 })
    if (ruta === '/api/v1/vinculos') return contestar(200, { ok: true })
    // Todo lo demás (foto, datos, movimientos, telemetría, directorio).
    return contestar(200, { ok: true })
  })
})
await new Promise((r) => genesis.listen(0, '127.0.0.1', r))
const GENESIS = `http://127.0.0.1:${genesis.address().port}`

// ── El API de verdad, dos veces ─────────────────────────────────────────────
const vivos = []
after(() => { for (const p of vivos) p.kill(); genesis.close() })
process.on('exit', () => { for (const p of vivos) p.kill() })

async function levantar(envExtra = {}) {
  const puerto = await puertoLibre()
  const BASE = `http://127.0.0.1:${puerto}`
  const env = { ...process.env, PORT: String(puerto), MONGODB_URI: '', NODE_ENV: 'test', GENESIS_URL: GENESIS, GENESIS_API_KEY: CLAVE, ...envExtra }
  if (!('MTP_VINCULO_GENESIS' in envExtra)) delete env.MTP_VINCULO_GENESIS
  const api = spawn(process.execPath, [join(CASA, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(CASA, 'src', 'index.ts')], {
    cwd: CASA, env, stdio: 'ignore',
  })
  api.unref()
  vivos.push(api)
  let vivo = false
  for (let i = 0; i < 80 && !vivo; i++) {
    await new Promise((r) => setTimeout(r, 250))
    try { vivo = (await fetch(BASE + '/healthz')).ok } catch { /* todavía no */ }
  }
  if (!vivo) throw new Error(`El API no levantó en ${BASE}. ¿npm install en infra/mytokenpay-api?`)

  return async function pedir(ruta, { metodo = 'GET', cuerpo, token } = {}) {
    const r = await fetch(BASE + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    })
    const texto = await r.text()
    let datos = null
    try { datos = texto ? JSON.parse(texto) : null } catch { /* HTML */ }
    return { estado: r.status, datos, texto }
  }
}

const apagado = await levantar()
const encendido = await levantar({ MTP_VINCULO_GENESIS: '1' })

const a = (ruta) => recibido.filter((x) => x.ruta === ruta).length
const ultimo = (ruta) => recibido.filter((x) => x.ruta === ruta).at(-1)
const reclamos = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'))
const alta = async (pedir, email) => {
  const r = await pedir('/api/auth/signup', { metodo: 'POST', cuerpo: { email, password: 'Clave12345', fullName: 'Prueba Puente' } })
  assert.equal(r.estado, 201, JSON.stringify(r.datos))
  return r.datos
}
const CUENTA_NO_ATADA = 'CUENTA_NO_ATADA'

// ── Con el vínculo APAGADO (como se despliega) ──────────────────────────────

test('sin la sesión de MyTokenPay el puente no deja pasar', async () => {
  assert.equal((await apagado('/genesis/estado')).estado, 401)
  assert.equal((await apagado('/genesis/vincular', { metodo: 'POST', cuerpo: {} })).estado, 401)
})

test('apagado: /vincular contesta 503 VINCULO_APAGADO y Genesis ni se entera', async () => {
  const { token } = await alta(apagado, `nuevo-${Date.now()}@prueba.test`)
  const antes = a('/api/v1/vinculos')
  const r = await apagado('/genesis/vincular', { metodo: 'POST', token, cuerpo: { direccion: VETA_VICTIMA } })
  assert.equal(r.estado, 503, r.texto)
  assert.equal(r.datos.codigo, 'VINCULO_APAGADO')
  assert.equal(a('/api/v1/vinculos'), antes)
})

test('apagado: cuenta con el correo de una identidad ajena: ni vincula, ni saca pase, ni toca la foto', async () => {
  // Se da de alta con el correo de la víctima (en mayúsculas, que el control
  // de duplicados no ve distinto y Genesis toma igual). Nadie comprueba el correo.
  const { token } = await alta(apagado, 'VICTIMA@prueba.test')
  const antes = { v: a('/api/v1/vinculos'), s: a('/api/v1/sso/token'), f: a('/api/v1/identidades/idn-victima/foto') }

  const v = await apagado('/genesis/vincular', { metodo: 'POST', token, cuerpo: { direccion: AJENA } })
  assert.notEqual(v.estado, 200, v.texto)
  const s = await apagado('/genesis/sso/token', { metodo: 'POST', token, cuerpo: {} })
  assert.equal(s.estado, 403, s.texto)
  assert.equal(s.datos.codigo, CUENTA_NO_ATADA)
  assert.equal(s.datos.token, undefined)
  const f = await apagado('/genesis/foto', { metodo: 'POST', token, cuerpo: { foto: null } })
  assert.equal(f.estado, 403, f.texto)
  assert.equal(f.datos.codigo, CUENTA_NO_ATADA)

  assert.equal(a('/api/v1/vinculos'), antes.v)
  assert.equal(a('/api/v1/sso/token'), antes.s)
  assert.equal(a('/api/v1/identidades/idn-victima/foto'), antes.f)
})

test('apagado: /auth/sso no ata nada en Genesis, y SU sesión lleva el GID firmado', async () => {
  const antes = a('/api/v1/vinculos')
  const r = await apagado('/api/auth/sso', { metodo: 'POST', cuerpo: { token: 'pase-victima', email: 'victima@prueba.test' } })
  assert.equal(r.estado, 200, r.texto)
  assert.equal(a('/api/v1/vinculos'), antes)
  assert.equal(reclamos(r.datos.token).gid, 'GID-VICTIMA')
  // La billetera la sigue conociendo la app, para conectarla sola.
  assert.equal(r.datos.genesis.direccion, VETA_VICTIMA)
  // Con esa sesión sí se usa el puente sobre la identidad.
  const b = await apagado('/genesis/billetera', { token: r.datos.token })
  assert.deepEqual(b.datos, { direccion: VETA_VICTIMA, gid: 'GID-VICTIMA' })
})

test('login y alta con contraseña NO llevan GID en el token', async () => {
  const email = `sin-gid-${Date.now()}@prueba.test`
  const { token } = await alta(apagado, email)
  assert.equal(reclamos(token).gid, undefined)
  const l = await apagado('/api/auth/login', { metodo: 'POST', cuerpo: { email, password: 'Clave12345' } })
  assert.equal(l.estado, 200)
  assert.equal(reclamos(l.datos.token).gid, undefined)
})

test('un trámite a medias (identidad sin GID) se sigue llevando desde MyTokenPay, como antes', async () => {
  const { token } = await alta(apagado, 'tramite@prueba.test')
  const e = await apagado('/genesis/estado', { token })
  assert.equal(e.estado, 200)
  assert.equal(e.datos.identidad.id, 'idn-tramite')
  const d = await apagado('/genesis/datos', { metodo: 'POST', token, cuerpo: { nombreCompleto: 'Tramite Prueba' } })
  assert.equal(d.estado, 200, d.texto)
  assert.equal(ultimo('/api/v1/identidades/idn-tramite/datos').cuerpo.nombreCompleto, 'Tramite Prueba')
  // Las rutas que a la copia vieja le faltaban existen (es el mismo puente).
  assert.equal((await apagado('/genesis/foto', { metodo: 'POST', token, cuerpo: { foto: 'x' } })).estado, 200)
  assert.equal((await apagado('/genesis/status', { token })).estado, 200)
})

test('quien no tiene identidad la empieza desde /estado, como antes', async () => {
  const { token } = await alta(apagado, `empieza-${Date.now()}@prueba.test`)
  const antes = recibido.filter((x) => x.metodo === 'POST' && x.ruta === '/api/v1/identidades').length
  const e = await apagado('/genesis/estado', { token })
  assert.equal(e.estado, 201, e.texto)
  assert.equal(recibido.filter((x) => x.metodo === 'POST' && x.ruta === '/api/v1/identidades').length, antes + 1)
})

// ── Con el vínculo ENCENDIDO: la guarda del GID tiene que aguantar sola ─────

let tokenAtacante = null
let idCuenta = null

test('encendido: cuenta con el correo de una identidad ajena: ni vincula, ni saca pase, ni toca la foto', async () => {
  const d = await alta(encendido, 'VICTIMA@prueba.test')
  tokenAtacante = d.token
  idCuenta = d.user.id
  const t = tokenAtacante
  const antes = {
    v: a('/api/v1/vinculos'), s: a('/api/v1/sso/token'), f: a('/api/v1/identidades/idn-victima/foto'),
    d: a('/api/v1/identidades/idn-victima/datos'), m: a('/api/v1/movimientos'),
  }

  // Ni con la dirección que Genesis sí conoce de la víctima.
  for (const direccion of [AJENA, VETA_VICTIMA]) {
    const v = await encendido('/genesis/vincular', { metodo: 'POST', token: t, cuerpo: { direccion } })
    assert.equal(v.estado, 403, v.texto)
    assert.equal(v.datos.codigo, CUENTA_NO_ATADA)
  }
  const s = await encendido('/genesis/sso/token', { metodo: 'POST', token: t, cuerpo: {} })
  assert.equal(s.estado, 403)
  assert.equal(s.datos.codigo, CUENTA_NO_ATADA)
  for (const [ruta, cuerpo] of [['/genesis/foto', { foto: null }], ['/genesis/datos', { nombreCompleto: 'Otro' }]]) {
    const r = await encendido(ruta, { metodo: 'POST', token: t, cuerpo })
    assert.equal(r.estado, 403, `${ruta}: ${r.texto}`)
    assert.equal(r.datos.codigo, CUENTA_NO_ATADA)
  }
  const g = await encendido('/genesis/gid', { token: t })
  assert.equal(g.estado, 403)

  // Lo que ya existía antes y se filtraba: la billetera y el expediente.
  const b = await encendido('/genesis/billetera', { token: t })
  assert.equal(b.estado, 200)
  assert.equal(b.datos.direccion, null)
  assert.equal(b.datos.gid, null)
  assert.ok(!b.texto.includes(VETA_VICTIMA.slice(2)))
  const e = await encendido('/genesis/estado', { token: t })
  assert.equal(e.estado, 200)
  assert.equal(e.datos.identidad.estado, 'verificada')
  assert.equal(e.datos.identidad.gid, null)
  assert.ok(!e.texto.includes('GID-VICTIMA'), 'filtró el GID')
  assert.ok(!e.texto.includes('Victima Sintetica'), 'filtró el nombre')
  assert.ok(!e.texto.includes('FOTO'), 'filtró la foto de la credencial')
  const m = await encendido('/genesis/movimientos', { metodo: 'POST', token: t, cuerpo: { movimientos: [{ monto: 1 }] } })
  assert.equal(m.estado, 200)

  assert.equal(a('/api/v1/vinculos'), antes.v)
  assert.equal(a('/api/v1/sso/token'), antes.s)
  assert.equal(a('/api/v1/identidades/idn-victima/foto'), antes.f)
  assert.equal(a('/api/v1/identidades/idn-victima/datos'), antes.d)
  assert.equal(a('/api/v1/movimientos'), antes.m)
})

test('encendido: la víctima entra por SSO y adopta esa cuenta; la contraseña del otro sigue sin servir para el puente', async () => {
  const antes = a('/api/v1/vinculos')
  const r = await encendido('/api/auth/sso', { metodo: 'POST', cuerpo: { token: 'pase-victima', email: 'victima@prueba.test' } })
  assert.equal(r.estado, 200, r.texto)
  assert.equal(r.datos.user.id, idCuenta, 'adoptó la cuenta del mismo correo (compatibilidad)')
  // Encendido, /auth/sso ata con la dirección que custodia Veta, no con otra.
  assert.equal(a('/api/v1/vinculos'), antes + 1)
  const v = ultimo('/api/v1/vinculos').cuerpo
  assert.equal(v.cuenta, idCuenta)
  assert.equal(v.email, 'victima@prueba.test')
  assert.equal(v.direccion, VETA_VICTIMA)

  // El token viejo del que se registró con su correo, uno nuevo con la misma
  // contraseña, y uno sacado con «olvidé mi contraseña»: ninguno lleva el GID.
  const login = await encendido('/api/auth/login', { metodo: 'POST', cuerpo: { email: 'victima@prueba.test', password: 'Clave12345' } })
  assert.equal(login.estado, 200)
  const olvido = await encendido('/api/auth/forgot-password', { metodo: 'POST', cuerpo: { email: 'victima@prueba.test' } })
  const tokens = [tokenAtacante, login.datos.token]
  if (olvido.datos?.demoResetToken) {
    const cambio = await encendido('/api/auth/reset-password', { metodo: 'POST', cuerpo: { token: olvido.datos.demoResetToken, newPassword: 'OtraClave123' } })
    assert.equal(cambio.estado, 200)
    const l2 = await encendido('/api/auth/login', { metodo: 'POST', cuerpo: { email: 'victima@prueba.test', password: 'OtraClave123' } })
    tokens.push(l2.datos.token)
  }
  const pases = a('/api/v1/sso/token')
  for (const t of tokens) {
    const s = await encendido('/genesis/sso/token', { metodo: 'POST', token: t, cuerpo: {} })
    assert.equal(s.estado, 403, s.texto)
    assert.equal(s.datos.codigo, CUENTA_NO_ATADA)
    assert.equal((await encendido('/genesis/vincular', { metodo: 'POST', token: t, cuerpo: { direccion: VETA_VICTIMA } })).estado, 403)
  }
  assert.equal(a('/api/v1/sso/token'), pases)

  // La sesión que nació del pase, en cambio, sí.
  const s = await encendido('/genesis/sso/token', { metodo: 'POST', token: r.datos.token, cuerpo: {} })
  assert.equal(s.estado, 200, s.texto)
  assert.equal(s.datos.token, 'pase-emitido')
  assert.deepEqual(ultimo('/api/v1/sso/token').cuerpo, { gid: 'GID-VICTIMA', cuenta: idCuenta })
})

test('encendido: /vincular con la sesión del pase: sin dirección 422, inválida 422', async () => {
  const r = await encendido('/api/auth/sso', { metodo: 'POST', cuerpo: { token: 'pase-victima', email: 'victima@prueba.test' } })
  const token = r.datos.token
  const antes = a('/api/v1/vinculos')
  const sin = await encendido('/genesis/vincular', { metodo: 'POST', token, cuerpo: {} })
  assert.equal(sin.estado, 422)
  assert.equal(sin.datos.codigo, 'VINCULO_SIN_DIRECCION')
  const mala = await encendido('/genesis/vincular', { metodo: 'POST', token, cuerpo: { direccion: '0x1234' } })
  assert.equal(mala.estado, 422)
  assert.equal(mala.datos.codigo, 'VINCULO_DIRECCION_INVALIDA')
  assert.equal(a('/api/v1/vinculos'), antes)
})

test('encendido: /vincular solo ata una dirección que Genesis ya conoce de Veta para esa identidad', async () => {
  const r = await encendido('/api/auth/sso', { metodo: 'POST', cuerpo: { token: 'pase-victima', email: 'victima@prueba.test' } })
  const token = r.datos.token
  const antes = a('/api/v1/vinculos')

  // Una dirección cualquiera —aunque esté en OTRO vínculo de la identidad, que
  // no es custodio—: 422 y Genesis no recibe nada.
  const ajena = await encendido('/genesis/vincular', { metodo: 'POST', token, cuerpo: { direccion: AJENA } })
  assert.equal(ajena.estado, 422, ajena.texto)
  assert.equal(ajena.datos.codigo, 'VINCULO_DIRECCION_NO_PROBADA')
  assert.equal(a('/api/v1/vinculos'), antes)

  // La de su Veta, escrita como sea: se ata, normalizada, con la cuenta y el
  // correo de la sesión (no los del cuerpo).
  const ok = await encendido('/genesis/vincular', {
    metodo: 'POST', token,
    cuerpo: { direccion: '0x52908400098527886E0F7030069857D2E4169EE7', cuenta: 'la-de-otro', email: 'otro@x.test' },
  })
  assert.equal(ok.estado, 200, ok.texto)
  const v = ultimo('/api/v1/vinculos')
  assert.equal(v.cuerpo.cuenta, idCuenta)
  assert.equal(v.cuerpo.email, 'victima@prueba.test')
  assert.equal(v.cuerpo.direccion, VETA_VICTIMA)
  assert.equal(v.clave, CLAVE)
  assert.ok(!ok.texto.includes(CLAVE))
})
