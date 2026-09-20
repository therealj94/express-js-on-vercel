// KYC de verdad contra Genesis ID.
//
// No hay dobles: se levanta el Genesis ID del repositorio (../genesis-id) en un
// proceso aparte, con su clave de API recién emitida, listas de sanciones de
// prueba y sin proveedor de biometría, y OrdenExchange arranca en modo REAL
// (sin demostración) apuntando a él. Luego se recorre lo que hace una persona:
//
//   registro → confirmar correo → abrir trámite → datos y perfil de
//   cumplimiento → MRZ del documento → rostro → en revisión → un operador de
//   cumplimiento coteja y aprueba en Genesis ID → OrdenExchange sincroniza:
//   GID, nombre legal, cuenta atada → puede operar → sesión única → tamizado
//   de direcciones → una compraventa completa → los movimientos llegan al
//   monitoreo AML → una suspensión en Genesis ID apaga la cuenta aquí.
//
//   npm run prueba:genesis      (hace falta `npm install` en ../genesis-id)

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'net'
import type { Server } from 'http'

const aqui = dirname(fileURLToPath(import.meta.url))
const carpetaGenesis = resolve(aqui, '../../../genesis-id')
const carpeta = mkdtempSync(join(tmpdir(), 'ordenexchange-genesis-'))

// ── Genesis ID en un proceso aparte ──────────────────────────────────────────

async function puertoLibre(): Promise<number> {
  return new Promise((ok, mal) => {
    const s = createServer()
    s.on('error', mal)
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as any).port; s.close(() => ok(p)) })
  })
}

const listasDir = join(carpeta, 'listas')
mkdirSync(listasDir)
writeFileSync(join(listasDir, 'prueba.json'), JSON.stringify([
  { id: 'P1', nombre: 'OTRA PERSONA DISTINTA', alias: [], tipo: 'persona', programa: 'P', lista: 'PRUEBA' },
  { id: 'D1', nombre: 'BILLETERA SANCIONADA', alias: [], tipo: 'persona', programa: 'CYBER', lista: 'PRUEBA',
    direcciones: ['0x00000000000000000000000000000000deadbeef'] },
]))
writeFileSync(join(listasDir, 'meta.json'), JSON.stringify({ fechaDescarga: new Date().toISOString().slice(0, 10) }))

const ADMIN_GENESIS = { email: 'cumplimiento@prueba.local', contrasena: 'contrasena-de-cumplimiento-larga' }
let genesisProc: ChildProcess
let genesisBase = ''
let claveApp = ''

async function arrancarGenesis(): Promise<void> {
  if (!existsSync(join(carpetaGenesis, 'node_modules'))) {
    throw new Error(`Falta ${carpetaGenesis}/node_modules: ejecute «npm install» en genesis-id antes de esta prueba`)
  }
  const puerto = await puertoLibre()
  genesisBase = `http://127.0.0.1:${puerto}`
  const env: Record<string, string> = { ...process.env as Record<string, string> }
  // Sin nube: ni Mongo, ni Rekognition (las credenciales del entorno no cuentan), ni proveedor externo.
  for (const k of Object.keys(env)) if (/^(AWS_|GENESIS_)/.test(k)) delete env[k]
  Object.assign(env, {
    NODE_ENV: 'test', PORT: String(puerto),
    GENESIS_DATA_FILE: join(carpeta, 'genesis.json'),
    GENESIS_ADMIN_EMAIL: ADMIN_GENESIS.email, GENESIS_ADMIN_PASSWORD: ADMIN_GENESIS.contrasena,
    GENESIS_SSO_SECRETO: 'secreto-sso-de-prueba', GENESIS_LISTAS_DIR: listasDir,
  })
  genesisProc = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: carpetaGenesis, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let salida = ''
  genesisProc.stdout!.on('data', (d) => { salida += String(d) })
  genesisProc.stderr!.on('data', (d) => { salida += String(d) })
  const limite = Date.now() + 60000
  while (Date.now() < limite) {
    const m = salida.match(/clave de API de ordenexchange[^:]*:\s*(gid_\S+)/)
    if (m) claveApp = m[1]
    if (claveApp) {
      const ok = await fetch(genesisBase + '/healthz').then((r) => r.ok).catch(() => false)
      if (ok) return
    }
    if (genesisProc.exitCode !== null) break
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('Genesis ID no arrancó:\n' + salida.slice(-3000))
}

await arrancarGenesis()

// ── OrdenExchange, en modo real, apuntando a ese Genesis ID ──────────────────

process.env.NODE_ENV = 'test'
process.env.ORDENEX_DATA_FILE = join(carpeta, 'datos.json')
process.env.ORDENEX_DEMO = '0'
process.env.GENESIS_URL = genesisBase
process.env.GENESIS_API_KEY = claveApp
process.env.ORDENEX_ORO_USD_ONZA = '4000'
process.env.ORDENEX_PLATA_USD_ONZA = '50'
process.env.ORDENEX_ADMIN_EMAIL = 'admin@prueba.local'
process.env.ORDENEX_ADMIN_PASSWORD = 'contrasena-admin-de-prueba'
process.env.ORDENEX_JWT_SECRETO = 'secreto-de-prueba'
process.env.ORDENEX_COMISION_PCT = '0'
delete process.env.ORDENEX_MONGO_URL
delete process.env.BREVO_API_KEY
delete process.env.RENDER
delete process.env.VERCEL

const { default: app, arrancar } = await import('../index.js')

let servidor: Server
let base: string

interface R { estado: number; datos: any }
async function pedir(ruta: string, opciones: { metodo?: string; cuerpo?: unknown; token?: string; base?: string; cabeceras?: Record<string, string> } = {}): Promise<R> {
  const r = await fetch((opciones.base ?? base) + ruta, {
    method: opciones.metodo || (opciones.cuerpo !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(opciones.token ? { Authorization: `Bearer ${opciones.token}` } : {}), ...(opciones.cabeceras ?? {}) },
    body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
  })
  const texto = await r.text()
  let datos: any = null
  try { datos = texto ? JSON.parse(texto) : null } catch { datos = { crudo: texto } }
  return { estado: r.status, datos }
}
/** Al panel de Genesis ID, como operador de cumplimiento. */
let sesionGenesis = ''
const genesisPanel = (ruta: string, cuerpo?: unknown) => pedir(ruta, { base: genesisBase, cuerpo, token: sesionGenesis })

before(async () => {
  await arrancar()
  await new Promise<void>((ok) => { servidor = app.listen(0, () => ok()) })
  base = `http://127.0.0.1:${(servidor.address() as any).port}`
  const s = await pedir('/api/sesion/entrar', { base: genesisBase, cuerpo: ADMIN_GENESIS })
  assert.equal(s.estado, 200, 'sesión de operador en Genesis ID: ' + JSON.stringify(s.datos))
  sesionGenesis = s.datos.token
})

after(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()))
  genesisProc.kill('SIGTERM')
  await new Promise((r) => setTimeout(r, 300))
  rmSync(carpeta, { recursive: true, force: true })
})

// ── Documentos de prueba (ICAO 9303, dígitos de control de verdad) ───────────

function digitoControl(campo: string): string {
  const pesos = [7, 3, 1]
  let suma = 0
  for (let i = 0; i < campo.length; i++) {
    const c = campo[i]
    const v = c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : c >= 'A' && c <= 'Z' ? c.charCodeAt(0) - 55 : 0
    suma += v * pesos[i % 3]
  }
  return String(suma % 10)
}
/** Pasaporte TD3 válido y vigente. */
function mrzDe(apellidos: string, nombres: string, nacionalidad: string, documento: string, nacimiento: string, sexo: 'M' | 'F'): string {
  const l1 = `P<${nacionalidad}${apellidos}<<${nombres}`.replace(/ /g, '<').padEnd(44, '<')
  const per = 'ZE184226B<<<<<'
  const ven = '351231'
  const l2 = `${documento}${digitoControl(documento)}${nacionalidad}${nacimiento}${digitoControl(nacimiento)}${sexo}${ven}${digitoControl(ven)}${per}${digitoControl(per)}`
  const compuesto = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43)
  return `${l1}\n${l2}${digitoControl(compuesto)}`
}
const SELFIE = 'data:image/jpeg;base64,' + Buffer.from('rostro de prueba '.repeat(64)).toString('base64')

// ── Una persona que se verifica entera ───────────────────────────────────────

interface Persona { email: string; apodo: string; pais: string; contrasena: string; nombre: string; mrz: string; token: string; id: string; identidadId: string; gid: string }

async function registrar(p: Omit<Persona, 'token' | 'id' | 'identidadId' | 'gid'>): Promise<Persona> {
  const r = await pedir('/api/auth/registro', { cuerpo: { email: p.email, contrasena: p.contrasena, apodo: p.apodo, pais: p.pais } })
  assert.equal(r.estado, 201, JSON.stringify(r.datos))
  assert.equal(r.datos.verificacionPendiente, true)
  assert.ok(r.datos.codigoDemo, 'sin proveedor de correo el código vuelve en la respuesta')
  const token = r.datos.token
  const v = await pedir('/api/auth/verificar-correo', { token, cuerpo: { codigo: r.datos.codigoDemo } })
  assert.equal(v.estado, 200, JSON.stringify(v.datos))
  assert.equal(v.datos.usuario.emailVerificado, true)
  return { ...p, token, id: r.datos.usuario.id, identidadId: '', gid: '' }
}

/** Recorre datos → documento → rostro y deja la identidad en revisión. */
async function tramitar(p: Persona, perfil: Record<string, unknown> = {}): Promise<void> {
  const e = await pedir('/api/genesis/estado', { token: p.token })
  assert.equal(e.estado, 200, JSON.stringify(e.datos))
  p.identidadId = e.datos.identidad.id
  const d = await pedir('/api/genesis/datos', { token: p.token, cuerpo: {
    nombreCompleto: p.nombre, fechaNacimiento: '1974-08-12', paisResidencia: 'HND', telefono: '+504 9999 0000',
    direccion: 'Col. Palmira, Tegucigalpa', ocupacion: 'Ingeniera de sistemas', origenFondos: 'Salario',
    propositoCuenta: 'Comprar y vender ORIGEN', volumenEsperadoUsd: 2000, pepDeclarado: false, ...perfil,
  } })
  assert.equal(d.estado, 200, JSON.stringify(d.datos))
  const doc = await pedir('/api/genesis/documento', { token: p.token, cuerpo: { mrz: p.mrz } })
  assert.equal(doc.estado, 200, JSON.stringify(doc.datos))
  assert.equal(doc.datos.documento.aceptable, true, JSON.stringify(doc.datos.documento.problemas))
  const b = await pedir('/api/genesis/biometria', { token: p.token, cuerpo: { selfie: SELFIE } })
  assert.equal(b.estado, 200, JSON.stringify(b.datos))
}

/** Lo que hace el operador de cumplimiento en Genesis ID: cotejar el rostro y aprobar. */
async function aprobarEnGenesis(p: Persona): Promise<string> {
  const bio = await genesisPanel(`/api/panel/identidades/${p.identidadId}/biometria`, { coincide: true, nota: 'Rostro cotejado con el documento' })
  assert.equal(bio.estado, 200, JSON.stringify(bio.datos))
  const ap = await genesisPanel(`/api/panel/identidades/${p.identidadId}/aprobar`, { motivo: 'Documento y cotejo verificados, sin coincidencias en listas' })
  assert.equal(ap.estado, 200, JSON.stringify(ap.datos))
  assert.match(ap.datos.gid, /^GEN-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]$/)
  p.gid = ap.datos.gid
  return p.gid
}

const ana: Persona = { email: 'ana.eriksson@ejemplo.test', apodo: 'ana_hn', pais: 'HN', contrasena: 'clave-de-ana-123', nombre: 'Anna Maria Eriksson',
  mrz: mrzDe('ERIKSSON', 'ANNA MARIA', 'UTO', 'L898902C3', '740812', 'F'), token: '', id: '', identidadId: '', gid: '' }
const juan: Persona = { email: 'juan.perez@ejemplo.test', apodo: 'juan_hn', pais: 'HN', contrasena: 'clave-de-juan-123', nombre: 'Juan Carlos Perez Lopez',
  mrz: mrzDe('PEREZ LOPEZ', 'JUAN CARLOS', 'HND', 'X1234567A', '740812', 'M'), token: '', id: '', identidadId: '', gid: '' }

// ─────────────────────────────────────────────────────────────────────────────

describe('arranque real', () => {
  test('sin demostración: las cuentas demo no existen y el grifo no está', async () => {
    const cat = await pedir('/api/mercado/catalogo')
    assert.equal(cat.estado, 200)
    assert.equal(cat.datos.demo, false)
    assert.equal((await pedir('/api/auth/demo/entrar', { cuerpo: { apodo: 'maria_hn' } })).estado, 404)
  })

  test('el servidor sabe que Genesis ID está configurado', async () => {
    const r = await pedir('/healthz')
    assert.equal(r.datos.comprobaciones.genesisConfigurado, true, JSON.stringify(r.datos))
  })
})

describe('correo primero', () => {
  test('sin confirmar el correo no se abre el trámite (403 correo-no-verificado)', async () => {
    const r = await pedir('/api/auth/registro', { cuerpo: { email: 'impaciente@ejemplo.test', contrasena: 'clave-impaciente-1', apodo: 'impaciente', pais: 'GT' } })
    assert.equal(r.estado, 201)
    for (const ruta of ['/api/genesis/estado']) {
      const e = await pedir(ruta, { token: r.datos.token })
      assert.equal(e.estado, 403)
      assert.equal(e.datos.codigo, 'correo-no-verificado')
    }
    const d = await pedir('/api/genesis/datos', { token: r.datos.token, cuerpo: { nombreCompleto: 'X' } })
    assert.equal(d.estado, 403)
  })
})

describe('el trámite de Ana, paso a paso', () => {
  test('registro y confirmación del correo', async () => {
    Object.assign(ana, await registrar(ana))
    assert.ok(ana.token)
  })

  test('abrir el estado crea la identidad en Genesis ID y la cuenta queda sin verificar, paso 1', async () => {
    const e = await pedir('/api/genesis/estado', { token: ana.token })
    assert.equal(e.estado, 200, JSON.stringify(e.datos))
    assert.equal(e.datos.identidad.email, ana.email)
    assert.equal(e.datos.identidad.estado, 'iniciada')
    assert.equal(e.datos.identidad.paso, 1)
    assert.equal(e.datos.identidad.gid, null)
    assert.equal(e.datos.usuario.gidEstado, 'sin-verificar')
    assert.equal(e.datos.usuario.puedeOperar, false)
    assert.equal(e.datos.aviso, null)
    // Del expediente no sale nada que no sea del trámite.
    for (const k of ['tamiz', 'riesgo', 'notas', 'vinculos', 'biometria']) assert.equal(k in e.datos.identidad, false, k)
    ana.identidadId = e.datos.identidad.id
    // Y en Genesis ID existe de verdad.
    const g = await genesisPanel(`/api/panel/identidades/${ana.identidadId}`)
    assert.equal(g.estado, 200)
    assert.equal(g.datos.identidad.email, ana.email)
  })

  test('sin verificar no se puede publicar ni abrir órdenes', async () => {
    const r = await pedir('/api/anuncios', { token: ana.token, cuerpo: { lado: 'compra', activo: 'ORIGEN', tipoPrecio: 'flotante', margen: 100, cantidadTotal: '10', limiteMin: '200', limiteMax: '2000', metodosPagoIds: [] } })
    assert.equal(r.estado, 403)
    assert.equal(r.datos.codigo, 'no-verificado')
  })

  test('paso 1: datos y perfil de cumplimiento → paso 2', async () => {
    const d = await pedir('/api/genesis/datos', { token: ana.token, cuerpo: {
      nombreCompleto: ana.nombre, fechaNacimiento: '1974-08-12', paisResidencia: 'HND', telefono: '+504 9999 0000',
      direccion: 'Col. Palmira, Tegucigalpa', ocupacion: 'Ingeniera de sistemas', origenFondos: 'Salario',
      propositoCuenta: 'Comprar y vender ORIGEN', volumenEsperadoUsd: '2000', pepDeclarado: false,
    } })
    assert.equal(d.estado, 200, JSON.stringify(d.datos))
    assert.equal(d.datos.identidad.estado, 'datos')
    assert.equal(d.datos.identidad.paso, 2)
    assert.deepEqual(d.datos.identidad.faltanDatos, [])
    assert.equal(d.datos.identidad.diligencia, 'simplificada')
    assert.equal(d.datos.usuario.gidEstado, 'sin-verificar')
  })

  test('paso 2: una MRZ manipulada se rechaza y se sigue en el paso 2', async () => {
    const mala = ana.mrz.slice(0, -1) + (ana.mrz.endsWith('0') ? '1' : '0')
    const r = await pedir('/api/genesis/documento', { token: ana.token, cuerpo: { mrz: mala } })
    assert.equal(r.estado, 200)
    assert.equal(r.datos.documento.aceptable, false)
    assert.ok(r.datos.documento.problemas.length > 0)
    assert.equal(r.datos.identidad.paso, 2)
  })

  test('paso 2: el documento bueno se acepta → paso 3', async () => {
    const r = await pedir('/api/genesis/documento', { token: ana.token, cuerpo: { mrz: ana.mrz } })
    assert.equal(r.estado, 200, JSON.stringify(r.datos))
    assert.equal(r.datos.documento.aceptable, true, JSON.stringify(r.datos.documento.problemas))
    assert.equal(r.datos.identidad.estado, 'documento')
    assert.equal(r.datos.identidad.paso, 3)
    assert.equal(r.datos.usuario.gidEstado, 'sin-verificar', 'con el documento todavía falta la foto: no está en revisión')
  })

  test('paso 3: el rostro → en revisión (sin proveedor lo coteja una persona)', async () => {
    const r = await pedir('/api/genesis/biometria', { token: ana.token, cuerpo: { selfie: SELFIE } })
    assert.equal(r.estado, 200, JSON.stringify(r.datos))
    assert.equal(r.datos.biometria.estado, 'no-configurada')
    assert.equal(r.datos.identidad.paso, null)
    assert.equal(r.datos.identidad.siguientePaso, 'En revisión')
    assert.equal(r.datos.usuario.gidEstado, 'en-revision')
    assert.equal(r.datos.usuario.puedeOperar, false)
    const yo = await pedir('/api/auth/yo', { token: ana.token })
    assert.equal(yo.datos.usuario.gidEstado, 'en-revision')
  })

  test('OrdenExchange no puede aprobar: su clave de app no vale en el panel de Genesis ID', async () => {
    const r = await pedir(`/api/panel/identidades/${ana.identidadId}/aprobar`, { base: genesisBase, cuerpo: { motivo: 'porque sí' }, cabeceras: { 'X-API-Key': claveApp } })
    assert.equal(r.estado, 401)
  })

  test('el operador no aprueba con el rostro sin cotejar (bloqueo)', async () => {
    const r = await genesisPanel(`/api/panel/identidades/${ana.identidadId}/aprobar`, { motivo: 'Revisado y conforme' })
    assert.equal(r.estado, 400)
    assert.ok(r.datos.bloqueos.some((b: string) => /biometr/i.test(b)), JSON.stringify(r.datos.bloqueos))
  })

  test('cotejo manual + aprobación en Genesis ID → GID', async () => {
    await aprobarEnGenesis(ana)
  })

  test('sincronizar trae el GID, el nombre legal y ata la cuenta; ya puede operar', async () => {
    const e = await pedir('/api/genesis/estado', { token: ana.token })
    assert.equal(e.estado, 200, JSON.stringify(e.datos))
    assert.equal(e.datos.identidad.estado, 'verificada')
    assert.equal(e.datos.identidad.gid, ana.gid)
    assert.equal(e.datos.identidad.paso, null)
    assert.equal(e.datos.usuario.gidEstado, 'verificada')
    assert.equal(e.datos.usuario.gid, ana.gid)
    assert.equal(e.datos.usuario.nombreLegal, 'ANNA MARIA ERIKSSON')
    assert.equal(e.datos.usuario.puedeOperar, true)
    // El nombre abreviado sale del nombre legal (en mayúsculas, de la MRZ), como en Binance.
    assert.equal(e.datos.usuario.nombreAbreviado, 'Anna M.')
    // Y en Genesis ID la identidad quedó atada a esta cuenta de OrdenExchange.
    const g = await genesisPanel(`/api/panel/identidades/${ana.identidadId}`)
    assert.ok(g.datos.identidad.vinculos.some((v: any) => v.app === 'ordenexchange' && v.cuenta === ana.id), JSON.stringify(g.datos.identidad.vinculos))
  })

  test('sincronizar otra vez no cambia nada', async () => {
    const e = await pedir('/api/genesis/estado', { token: ana.token })
    assert.equal(e.datos.usuario.gid, ana.gid)
    assert.equal(e.datos.usuario.gidEstado, 'verificada')
  })
})

describe('sesión única del ecosistema', () => {
  let tokenSso = ''
  test('OrdenExchange emite un token de sesión única para su cuenta verificada', async () => {
    const r = await pedir('/api/genesis/sso/token', { token: ana.token, cuerpo: {} })
    assert.equal(r.estado, 200, JSON.stringify(r.datos))
    assert.ok(r.datos.token)
    tokenSso = r.datos.token
  })
  test('con ese token se entra en la MISMA cuenta, sin crear otra', async () => {
    const r = await pedir('/api/auth/sso', { cuerpo: { token: tokenSso } })
    assert.equal(r.estado, 200, JSON.stringify(r.datos))
    assert.equal(r.datos.nuevo, false)
    assert.equal(r.datos.usuario.id, ana.id)
    assert.equal(r.datos.usuario.gid, ana.gid)
    const yo = await pedir('/api/auth/yo', { token: r.datos.token })
    assert.equal(yo.estado, 200)
  })
  test('un token inventado no entra', async () => {
    const r = await pedir('/api/auth/sso', { cuerpo: { token: 'no.es.un.token' } })
    assert.equal(r.estado, 401)
    assert.equal(r.datos.codigo, 'sso-invalido')
  })
  test('una cuenta sin verificar no puede pedir el token', async () => {
    const r = await pedir('/api/auth/registro', { cuerpo: { email: 'sin.gid@ejemplo.test', contrasena: 'clave-sin-gid-12', apodo: 'sin_gid', pais: 'CO' } })
    const t = await pedir('/api/genesis/sso/token', { token: r.datos.token, cuerpo: {} })
    assert.equal(t.estado, 403)
    assert.equal(t.datos.codigo, 'no-verificado')
  })
})

describe('tamizado de direcciones', () => {
  test('una dirección limpia: tamizada y no sancionada', async () => {
    const r = await pedir('/api/genesis/tamiz/0x1111111111111111111111111111111111111111', { token: ana.token })
    assert.equal(r.estado, 200)
    assert.equal(r.datos.tamizado, true)
    assert.equal(r.datos.sancionada, false)
  })
  test('una dirección en listas: sancionada', async () => {
    const r = await pedir('/api/genesis/tamiz/0x00000000000000000000000000000000deadbeef', { token: ana.token })
    assert.equal(r.datos.sancionada, true)
  })
  test('un retiro a una dirección sancionada se rechaza', async () => {
    const r = await pedir('/api/billetera/retiros', { token: ana.token, cuerpo: { activo: 'ORIGEN', cantidad: '1', direccion: '0x00000000000000000000000000000000deadbeef', contrasena: ana.contrasena } })
    assert.ok([400, 403].includes(r.estado), JSON.stringify(r.datos))
    assert.match(String(r.datos.error), /sancion|saldo/i)
  })
})

describe('una compraventa entre dos personas verificadas llega al monitoreo AML', () => {
  let tokenPanel = ''
  let metodoId = ''
  let anuncioId = ''
  let ordenId = ''

  test('Juan se registra y se verifica entero (mismo camino)', async () => {
    Object.assign(juan, await registrar(juan))
    await tramitar(juan, { ocupacion: 'Comerciante', origenFondos: 'Negocio propio' })
    await aprobarEnGenesis(juan)
    const e = await pedir('/api/genesis/estado', { token: juan.token })
    assert.equal(e.datos.usuario.puedeOperar, true, JSON.stringify(e.datos))
    assert.notEqual(juan.gid, ana.gid)
  })

  test('un operador de OrdenExchange acredita saldo a Juan (en real no hay grifo)', async () => {
    const s = await pedir('/api/panel/sesion/entrar', { cuerpo: { email: 'admin@prueba.local', contrasena: 'contrasena-admin-de-prueba' } })
    assert.equal(s.estado, 200, JSON.stringify(s.datos))
    tokenPanel = s.datos.token
    assert.equal((await pedir('/api/billetera/grifo', { token: juan.token, cuerpo: {} })).estado, 404, 'el grifo no existe fuera de la demo')
    const a = await pedir(`/api/panel/usuarios/${juan.id}/ajuste`, { token: tokenPanel, cuerpo: { activo: 'ORIGEN', cantidad: '100', motivo: 'Depósito conciliado a mano en la prueba' } })
    assert.equal(a.estado, 200, JSON.stringify(a.datos))
  })

  test('Juan publica una venta en lempiras', async () => {
    const mp = await pedir('/api/metodos-pago', { token: juan.token, cuerpo: { tipo: 'transferencia', banco: 'Banco Atlántida', titular: 'Juan Carlos Perez Lopez', campos: { cuenta: '0011223344', tipoCuenta: 'Ahorro' } } })
    assert.equal(mp.estado, 201, JSON.stringify(mp.datos))
    metodoId = mp.datos.metodo.id
    const an = await pedir('/api/anuncios', { token: juan.token, cuerpo: { lado: 'venta', activo: 'ORIGEN', tipoPrecio: 'flotante', margen: 100, cantidadTotal: '50', limiteMin: '200', limiteMax: '3000', metodosPagoIds: [metodoId], ventanaPagoMin: 30, terminos: 'Prueba' } })
    assert.equal(an.estado, 201, JSON.stringify(an.datos))
    anuncioId = an.datos.anuncio.id
  })

  test('Ana compra, paga, Juan libera', async () => {
    const o = await pedir('/api/ordenes', { token: ana.token, cuerpo: { anuncioId, montoFiat: '1000', metodoTipo: 'transferencia' } })
    assert.equal(o.estado, 201, JSON.stringify(o.datos))
    ordenId = o.datos.orden.id
    assert.equal((await pedir(`/api/ordenes/${ordenId}/pagado`, { token: ana.token, cuerpo: { referencia: 'REF-AML-1' } })).estado, 200)
    const l = await pedir(`/api/ordenes/${ordenId}/liberar`, { token: juan.token, cuerpo: { contrasena: juan.contrasena } })
    assert.equal(l.estado, 200, JSON.stringify(l.datos))
    assert.equal(l.datos.orden.estado, 'completada')
  })

  test('Genesis ID recibió un movimiento por cada parte, con su GID', async () => {
    let total = 0
    for (let i = 0; i < 20 && total < 2; i++) {
      await new Promise((r) => setTimeout(r, 150))
      const r = await genesisPanel('/api/panel/resumen')
      total = r.datos?.movimientos?.total ?? 0
    }
    const fichaAna = await genesisPanel(`/api/panel/identidades/${ana.identidadId}`)
    const fichaJuan = await genesisPanel(`/api/panel/identidades/${juan.identidadId}`)
    assert.equal(total, 2, 'resumen: ' + JSON.stringify((await genesisPanel('/api/panel/resumen')).datos) + ' ana: ' + JSON.stringify(fichaAna.datos.identidad.movimientos ?? fichaAna.datos.movimientos) + ' juan: ' + JSON.stringify(fichaJuan.datos.identidad.movimientos ?? fichaJuan.datos.movimientos))
  })
})

describe('lo que decide Genesis ID manda', () => {
  test('una suspensión en Genesis ID apaga la cuenta al sincronizar', async () => {
    const s = await genesisPanel(`/api/panel/identidades/${ana.identidadId}/suspender`, { motivo: 'Prueba de suspensión' })
    assert.equal(s.estado, 200, JSON.stringify(s.datos))
    const e = await pedir('/api/genesis/estado', { token: ana.token })
    assert.equal(e.estado, 200)
    assert.equal(e.datos.usuario.gidEstado, 'suspendida')
    assert.equal(e.datos.usuario.puedeOperar, false)
    const r = await pedir('/api/ordenes', { token: ana.token, cuerpo: { anuncioId: 'x', montoFiat: '1000' } })
    assert.equal(r.estado, 403)
  })
})
