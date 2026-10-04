// Pruebas de la plataforma contra una cadena simulada: sin red, sin base y sin llaves.
import test from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'net'
import { Cadena, TRANSFER, type Transporte } from '../cadena.js'
import { construir, prueba, verificar } from '../merkle.js'
import { enMemoria, vacio } from '../almacen.js'
import { barrido, candidatas, conciliar, puedePublicar, tomarFoto } from '../foto.js'
import { activo } from '../catalogo.js'
import { aprobar, ejecutar, prepararRegalo, proponer, registrarEnvioRegalo, UN_ORIGEN } from '../origen.js'
import { crearApp, crearContexto } from '../app.js'
import { hashClave } from '../sesion.js'

const E = 10n ** 18n
const dir = (n: number) => '0x' + n.toString(16).padStart(40, '0')
const AUKA = activo('AUKA')!.heredado!
const V2 = '0x' + 'a2'.repeat(20)
const TESORERIA = dir(0xbeef)

interface Mundo {
  bloque: number
  tokens: Record<string, { supply: bigint; saldos: Record<string, bigint> }>
  nativo: Record<string, bigint>
  logs: { address: string; from: string; to: string }[]
  txs: Record<string, { from: string; to: string; value: bigint; ok: boolean }>
}

function simulada(m: Mundo): Transporte {
  const responder = ({ id, method, params }: any) => {
    const r = (result: unknown) => ({ jsonrpc: '2.0', id, result })
    switch (method) {
      case 'eth_blockNumber': return r('0x' + m.bloque.toString(16))
      case 'eth_call': {
        const t = m.tokens[params[0].to.toLowerCase()]
        if (!t) return { jsonrpc: '2.0', id, error: { message: 'execution reverted' } }
        const data: string = params[0].data
        const v = data === '0x18160ddd' ? t.supply : (t.saldos['0x' + data.slice(-40)] ?? 0n)
        return r('0x' + v.toString(16))
      }
      case 'eth_getBalance': return r('0x' + (m.nativo[params[0].toLowerCase()] ?? 0n).toString(16))
      case 'eth_getLogs': return r(m.logs.map((l) => ({ address: l.address, topics: [TRANSFER, '0x' + l.from.slice(2).padStart(64, '0'), '0x' + l.to.slice(2).padStart(64, '0')] })))
      case 'eth_getBlockByNumber': return r({ transactions: [] })
      case 'eth_getTransactionByHash': { const t = m.txs[params[0]]; return r(t ? { from: t.from, to: t.to, value: '0x' + t.value.toString(16) } : null) }
      case 'eth_getTransactionReceipt': { const t = m.txs[params[0]]; return r(t ? { status: t.ok ? '0x1' : '0x0' } : null) }
      default: return { jsonrpc: '2.0', id, error: { message: 'no simulado' } }
    }
  }
  return async (cuerpo: any) => (Array.isArray(cuerpo) ? cuerpo.map(responder) : responder(cuerpo))
}

function mundo(): Mundo {
  // Cinco tenedores de AUKA: dos visibles por eventos, uno solo en la lista de usuarios, la tesorería y uno externo.
  const saldos = { [dir(1)]: 10n * E, [dir(2)]: 5n * E, [dir(3)]: 1n * E, [TESORERIA]: 980n * E, [dir(9)]: 4n * E }
  return {
    bloque: 1000,
    tokens: { [AUKA]: { supply: 1000n * E, saldos } },
    nativo: { [TESORERIA]: 900n * E, [dir(1)]: 2n * E },
    logs: [{ address: AUKA, from: dir(1), to: dir(2) }, { address: AUKA, from: TESORERIA, to: dir(9) }],
    txs: {},
  }
}

test('Merkle: cada tenedor tiene una prueba que verifica, y una alterada no', () => {
  const entradas = Array.from({ length: 7 }, (_, i) => ({ direccion: dir(i + 1), saldo: BigInt(i + 1) * E }))
  const arbol = construir(entradas)
  for (const e of entradas) {
    const p = prueba(arbol, e.direccion, e.saldo)!
    assert.ok(verificar(arbol.raiz, e.direccion, e.saldo, p), `prueba de ${e.direccion}`)
    assert.equal(verificar(arbol.raiz, e.direccion, e.saldo + 1n, p), false, 'un saldo distinto no verifica')
  }
  assert.equal(prueba(arbol, dir(99), 1n), null)
})

test('La foto no se publica si falta un tenedor, y sí cuando aparecen todos', async () => {
  const m = mundo()
  const cadena = new Cadena(simulada(m))
  const listas = vacio().listas
  listas.tesoreria.direcciones = [TESORERIA]

  // Sin la lista de usuarios, dir(3) no se ve: falta 1 AUKA.
  const barridas = await barrido(cadena, m.bloque)
  let dirs = candidatas(barridas, listas)
  let f: any = { id: 'f1', activo: 'AUKA', bloque: m.bloque, estado: 'lista', ...(await tomarFoto(cadena, activo('AUKA')!, m.bloque, dirs, listas)) }
  assert.equal(f.sinUbicar, (1n * E).toString())
  assert.match(puedePublicar(f)!, /faltan tenedores/)

  listas.usuarios.direcciones = [dir(1), dir(3)]
  dirs = candidatas(barridas, listas)
  f = { id: 'f2', activo: 'AUKA', bloque: m.bloque, estado: 'lista', ...(await tomarFoto(cadena, activo('AUKA')!, m.bloque, dirs, listas)) }
  assert.equal(f.sinUbicar, '0')
  assert.equal(puedePublicar(f), null)
  const clases = Object.fromEntries(f.tenedores.map((t: any) => [t.direccion, t.clase]))
  assert.deepEqual(clases, { [TESORERIA]: 'tesoreria', [dir(1)]: 'usuario', [dir(3)]: 'usuario', [dir(2)]: 'externa', [dir(9)]: 'externa' })
  assert.equal(f.tenedores.length, 5, 'todos pasan, sea cual sea su clase')
})

test('La conciliación exige cada saldo exacto y el mismo total en la v2', async () => {
  const m = mundo()
  const cadena = new Cadena(simulada(m))
  const listas = vacio().listas
  listas.usuarios.direcciones = [dir(3)]
  const dirs = candidatas(await barrido(cadena, m.bloque), listas)
  const f: any = { id: 'f', activo: 'AUKA', bloque: m.bloque, estado: 'publicada', ...(await tomarFoto(cadena, activo('AUKA')!, m.bloque, dirs, listas)) }

  m.tokens[V2] = { supply: 1000n * E, saldos: { ...m.tokens[AUKA].saldos } }
  assert.equal((await conciliar(cadena, f, V2)).cuadra, true)

  m.tokens[V2].saldos[dir(2)] = 4n * E
  m.tokens[V2].supply = 999n * E
  const c = await conciliar(cadena, f, V2)
  assert.equal(c.cuadra, false)
  assert.deepEqual(c.diferencias.map((d) => d.direccion), [dir(2)])
})

test('Liberación de ORIGEN: respaldo obligatorio, quien propone no aprueba, umbral y comprobación en cadena', async () => {
  const m = mundo()
  const cadena = new Cadena(simulada(m))
  const a = enMemoria()
  a.datos.listas.tesoreria.direcciones = [TESORERIA]

  assert.throws(() => proponer(a, 'op@og', { monto: '100', destino: dir(5), motivo: 'x', respaldo: '' }), /respaldo/)
  const l = proponer(a, 'op@og', { monto: (100n * E).toString(), destino: dir(5), motivo: 'Colocación', respaldo: 'Acta 12' })
  assert.throws(() => aprobar(a, l.id, 'op@og', 2), /propia/)
  aprobar(a, l.id, 'c1@og', 2)
  assert.equal(l.estado, 'propuesta')
  await assert.rejects(ejecutar(a, cadena, l.id, '0x' + '1'.repeat(64), 'op@og'), /aprobada/)
  aprobar(a, l.id, 'c2@og', 2)
  assert.equal(l.estado, 'aprobada')

  m.txs['0x' + '2'.repeat(64)] = { from: TESORERIA, to: dir(5), value: 99n * E, ok: true }
  await assert.rejects(ejecutar(a, cadena, l.id, '0x' + '2'.repeat(64), 'op@og'), /monto no coincide/)
  m.txs['0x' + '3'.repeat(64)] = { from: dir(1), to: dir(5), value: 100n * E, ok: true }
  await assert.rejects(ejecutar(a, cadena, l.id, '0x' + '3'.repeat(64), 'op@og'), /tesorería/)
  m.txs['0x' + '4'.repeat(64)] = { from: TESORERIA, to: dir(5), value: 100n * E, ok: true }
  await ejecutar(a, cadena, l.id, '0x' + '4'.repeat(64), 'op@og')
  assert.equal(l.estado, 'ejecutada')
})

test('Regalo de gas: 1 ORIGEN por tenedor, sin tesorería ni sistema, solo con aprobación', async () => {
  const m = mundo()
  const cadena = new Cadena(simulada(m))
  const a = enMemoria()
  a.datos.listas.tesoreria.direcciones = [TESORERIA]
  a.datos.listas.sistema.direcciones = [dir(9)]
  a.datos.listas.usuarios.direcciones = [dir(1), dir(3)]
  a.datos.fotos.push({ id: 'f', activo: 'AUKA', bloque: 1, creada: '', autor: '', estado: 'publicada',
    tenedores: [TESORERIA, dir(1), dir(2), dir(9)].map((d) => ({ direccion: d, saldo: '1', clase: 'externa' as const })) })

  const { liberacion, nuevos } = prepararRegalo(a, 'op@og')
  assert.equal(nuevos, 3)
  assert.deepEqual(a.datos.regalos.map((r) => r.direccion).sort(), [dir(1), dir(2), dir(3)])
  assert.equal(liberacion!.monto, (3n * UN_ORIGEN).toString())
  assert.equal(prepararRegalo(a, 'op@og').nuevos, 0, 'nadie lo recibe dos veces')

  const h = '0x' + '5'.repeat(64)
  m.txs[h] = { from: TESORERIA, to: dir(2), value: UN_ORIGEN, ok: true }
  await assert.rejects(registrarEnvioRegalo(a, cadena, dir(2), h, 'op@og'), /no está aprobado/)
  aprobar(a, liberacion!.id, 'c1@og', 2); aprobar(a, liberacion!.id, 'c2@og', 2)
  await registrarEnvioRegalo(a, cadena, dir(2), h, 'op@og')
  await assert.rejects(registrarEnvioRegalo(a, cadena, dir(1), h, 'op@og'), /ya se usó/)
})

test('HTTP: la consulta pública da una prueba que verifica, y el panel exige sesión y rol', async () => {
  const m = mundo()
  process.env.MIGRACION_SECRETO = 'x'.repeat(40)
  process.env.MIGRACION_OPERADORES = `op@og.link|operador|${hashClave('clave-del-operador')};ver@og.link|lectura|${hashClave('clave-de-lectura')}`
  const a = enMemoria()
  const tenedores = [{ direccion: dir(1), saldo: (10n * E).toString(), clase: 'usuario' as const }, { direccion: dir(2), saldo: (5n * E).toString(), clase: 'externa' as const }]
  const raiz = construir(tenedores.map((t) => ({ direccion: t.direccion, saldo: BigInt(t.saldo) }))).raiz
  a.datos.fotos.push({ id: 'f', activo: 'AUKA', bloque: 900, creada: '', autor: '', estado: 'publicada', raiz, supply: (15n * E).toString(), tenedores, sinUbicar: '0' })

  const srv = crearApp(crearContexto(a, new Cadena(simulada(m)), { ...process.env })).listen(0)
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
  try {
    const t = await (await fetch(`${base}/api/tenedor/${dir(1)}`)).json()
    const auka = t.activos.find((x: any) => x.clave === 'AUKA')
    assert.equal(auka.saldoEnFoto, (10n * E).toString())
    assert.ok(verificar(raiz, dir(1), 10n * E, auka.prueba))
    assert.equal((await fetch(`${base}/api/tenedor/no-es-direccion`)).status, 400)

    assert.equal((await fetch(`${base}/api/panel/fotos`)).status, 401)
    const entrar = async (correo: string, clave: string) => (await fetch(`${base}/api/panel/entrar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo, clave }) })).json()
    assert.equal((await entrar('op@og.link', 'mala')).token, undefined)
    const lectura = (await entrar('ver@og.link', 'clave-de-lectura')).token
    const op = (await entrar('op@og.link', 'clave-del-operador')).token
    const conToken = (tk: string, ruta: string, metodo = 'GET', cuerpo?: unknown) => fetch(base + '/api/panel' + ruta, {
      method: metodo, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
    assert.equal((await conToken(lectura, '/fotos')).status, 200)
    assert.equal((await conToken(lectura, '/listas/usuarios', 'PUT', { direcciones: [dir(1)] })).status, 403)
    const lista = await (await conToken(op, '/listas/usuarios', 'PUT', { direcciones: [dir(1), 'basura', dir(1).toUpperCase().replace('0X', '0x')] })).json()
    assert.deepEqual(lista, { tipo: 'usuarios', total: 1, invalidas: 1 })
    assert.equal(a.datos.bitacora.at(-1)?.actor, 'op@og.link')
  } finally {
    srv.close()
  }
})
