// La firma múltiple en la plataforma, contra una Safe simulada (custodios, umbral, nonce y recibos).
// Que el formato es el de una Safe de verdad lo prueba contratos-v2/test/multifirma.test.ts.
import test from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'net'
import { Wallet, getAddress, toBeHex, zeroPadValue } from 'ethers'
import { Cadena, type Transporte } from '../cadena.js'
import { enMemoria } from '../almacen.js'
import { prepararRegalo, proponer } from '../origen.js'
import * as OP from '../operaciones.js'
import { SAFE, datosEjecucion } from '../multifirma.js'
import { crearApp, crearContexto } from '../app.js'
import { hashClave } from '../sesion.js'

const E = 10n ** 18n
const dir = (n: number) => '0x' + n.toString(16).padStart(40, '0')
const SAFE_DIR = '0x' + '5a'.repeat(20)
const MULTISEND = '0x' + '3c'.repeat(20)
const SAFE_TRES = '0x' + '7b'.repeat(20)
const CUSTODIOS = [Wallet.createRandom(), Wallet.createRandom(), Wallet.createRandom()]
const cfg: OP.ConfigSafe = { safe: SAFE_DIR, multisend: MULTISEND }

interface SafeSim { nonce: number; nonceTres?: number; umbral: number; saldos: Record<string, bigint>; recibos: Record<string, { ok: boolean; eventos: { tipo: 'exito' | 'fracaso'; hash: string }[] }> }

function simulada(s: SafeSim): Transporte {
  const responder = ({ id, method, params }: any) => {
    const r = (result: unknown) => ({ jsonrpc: '2.0', id, result })
    switch (method) {
      case 'eth_chainId': return r('0x15ae')
      case 'eth_blockNumber': return r('0x10')
      case 'eth_getBalance': return r('0x' + (s.saldos[params[0].toLowerCase()] ?? 0n).toString(16))
      case 'eth_call': {
        const a = params[0].to.toLowerCase()
        if (a !== SAFE_DIR && a !== SAFE_TRES) return { jsonrpc: '2.0', id, error: { message: 'execution reverted' } }
        const f = SAFE.parseTransaction({ data: params[0].data })!.name
        const [umbral, nonce] = a === SAFE_DIR ? [s.umbral, s.nonce] : [3, s.nonceTres ?? 0]
        const v = f === 'getOwners' ? [CUSTODIOS.map((c) => c.address)] : f === 'getThreshold' ? [umbral] : [nonce]
        return r(SAFE.encodeFunctionResult(f, v))
      }
      case 'eth_getTransactionReceipt': {
        const x = s.recibos[params[0]]
        if (!x) return r(null)
        const tema = (t: 'exito' | 'fracaso') => SAFE.getEvent(t === 'exito' ? 'ExecutionSuccess' : 'ExecutionFailure')!.topicHash
        return r({ status: x.ok ? '0x1' : '0x0', logs: x.eventos.map((e) => ({ address: SAFE_DIR, topics: [tema(e.tipo), zeroPadValue(toBeHex(BigInt(e.hash)), 32)], data: '0x' })) })
      }
      default: return { jsonrpc: '2.0', id, error: { message: 'no simulado' } }
    }
  }
  return async (cuerpo: any) => (Array.isArray(cuerpo) ? cuerpo.map(responder) : responder(cuerpo))
}

const safeSim = (): SafeSim => ({ nonce: 3, umbral: 2, saldos: { [SAFE_DIR]: 1000n * E }, recibos: {} })

async function firma(c: { signTypedData: Wallet["signTypedData"] }, o: ReturnType<typeof OP.detalle>) {
  return c.signTypedData(o.tipado.domain, o.tipado.types as any, o.tipado.message)
}

const txHash = (n: number) => '0x' + n.toString(16).padStart(64, '0')

test('Liberación con la Safe: dos custodios firman, se ejecuta y se comprueba que salió lo firmado', async () => {
  const s = safeSim()
  const cadena = new Cadena(simulada(s))
  const a = enMemoria()
  const l = proponer(a, 'ana@og', { monto: (5n * E).toString(), destino: dir(7), motivo: 'Respaldo lote 4', respaldo: 'Acta 12' })
  const o = await OP.crearDeLiberacion(a, cadena, cfg, l)
  assert.equal(o.safeTx.nonce, 3, 'toma el nonce de la Safe')
  assert.equal(o.safeTx.to, getAddress(dir(7)))
  assert.equal(o.safeTx.value, (5n * E).toString())
  const d = OP.detalle(o)
  assert.equal(d.ejecutar, null, 'sin firmas no hay nada que ejecutar')

  await assert.rejects(OP.firmar(a, cadena, cfg, o.id, 'ana@og', await firma(CUSTODIOS[0], d)), /quien propone/)
  await assert.rejects(OP.firmar(a, cadena, cfg, o.id, 'beto@og', await firma(Wallet.createRandom(), d)), /no es custodio/)
  await OP.firmar(a, cadena, cfg, o.id, 'beto@og', await firma(CUSTODIOS[0], d))
  await assert.rejects(OP.firmar(a, cadena, cfg, o.id, 'beto@og', await firma(CUSTODIOS[1], d)), /ya firmaste/)
  await assert.rejects(OP.firmar(a, cadena, cfg, o.id, 'caro@og', await firma(CUSTODIOS[0], d)), /esa billetera ya firmó/)
  assert.equal(l.estado, 'propuesta')
  await OP.firmar(a, cadena, cfg, o.id, 'caro@og', await firma(CUSTODIOS[2], d))
  assert.equal(o.estado, 'lista')
  assert.equal(l.estado, 'aprobada')

  // La llamada lista para ejecutar: execTransaction con las dos firmas ordenadas por dirección.
  const ej = OP.detalle(o).ejecutar!
  assert.equal(ej.to, SAFE_DIR)
  const args = SAFE.decodeFunctionData('execTransaction', ej.data)
  assert.equal(args[9].length, 2 + 130 * 2)
  const enOrden = [CUSTODIOS[0], CUSTODIOS[2]].sort((x, y) => (BigInt(x.address) < BigInt(y.address) ? -1 : 1))
  assert.equal(args[9].slice(2, 132), o.firmas.find((f) => f.firmante === enOrden[0].address.toLowerCase())!.firma.slice(2))
  assert.equal(ej.data, datosEjecucion(o.safeTx, o.firmas))

  // Un recibo que ejecutó otra cosa, uno fallido y uno con la llamada interna fallida no valen.
  s.recibos[txHash(1)] = { ok: true, eventos: [{ tipo: 'exito', hash: txHash(999) }] }
  s.recibos[txHash(2)] = { ok: false, eventos: [] }
  s.recibos[txHash(3)] = { ok: true, eventos: [{ tipo: 'fracaso', hash: o.hash }] }
  await assert.rejects(OP.ejecutada(a, cadena, cfg, o.id, txHash(1), 'ana@og'), /no ejecutó lo firmado/)
  await assert.rejects(OP.ejecutada(a, cadena, cfg, o.id, txHash(2), 'ana@og'), /falló/)
  await assert.rejects(OP.ejecutada(a, cadena, cfg, o.id, txHash(3), 'ana@og'), /llamada interna falló/)
  s.recibos[txHash(4)] = { ok: true, eventos: [{ tipo: 'exito', hash: o.hash }] }
  await OP.ejecutada(a, cadena, cfg, o.id, txHash(4), 'ana@og')
  assert.equal(o.estado, 'ejecutada')
  assert.equal(l.estado, 'ejecutada')
  assert.equal(l.tx, txHash(4))
})

test('Regalo con la Safe: tandas parejas de hasta 120 envíos, cada una un lote con un solo par de firmas', async () => {
  const s = safeSim()
  const cadena = new Cadena(simulada(s))
  const a = enMemoria()
  a.datos.listas.usuarios.direcciones = Array.from({ length: 250 }, (_, i) => dir(1000 + i))
  a.datos.listas.usuarios.direcciones.push(SAFE_DIR) // la Safe no se regala a sí misma
  s.saldos[dir(1000)] = E // ya tiene 1 ORIGEN: no recibe
  s.saldos[dir(1001)] = E / 4n // recibe lo que le falta
  const p = await prepararRegalo(a, cadena, 'ana@og', { excluir: [SAFE_DIR], porTanda: OP.POR_TANDA })
  assert.equal(p.nuevos, 249)
  assert.deepEqual(p.liberaciones.map((l) => a.datos.regalos.filter((r) => r.liberacion === l.id).length), [83, 83, 83])
  assert.ok(!a.datos.regalos.some((r) => r.direccion === SAFE_DIR))
  assert.equal(a.datos.regalos.find((r) => r.direccion === dir(1001))!.monto, (E - E / 4n).toString())
  const ops = []
  for (const l of p.liberaciones) ops.push(await OP.crearDeRegalo(a, cadena, cfg, l))
  assert.deepEqual(ops.map((o) => o.safeTx.nonce), [3, 4, 5], 'nonces seguidos')
  assert.ok(ops.every((o) => o.safeTx.operation === 1 && o.safeTx.to === getAddress(MULTISEND)), 'lote de MultiSendCallOnly')
  // La primera tanda: firmas, ejecución, y sus 83 envíos quedan enviados con esa transacción.
  const d = OP.detalle(ops[0])
  await OP.firmar(a, cadena, cfg, ops[0].id, 'beto@og', await firma(CUSTODIOS[1], d))
  await OP.firmar(a, cadena, cfg, ops[0].id, 'caro@og', await firma(CUSTODIOS[2], d))
  s.recibos[txHash(9)] = { ok: true, eventos: [{ tipo: 'exito', hash: ops[0].hash }] }
  s.nonce = 4
  await OP.ejecutada(a, cadena, cfg, ops[0].id, txHash(9), 'beto@og')
  const enviados = a.datos.regalos.filter((r) => r.estado === 'enviado')
  assert.equal(enviados.length, 83)
  assert.ok(enviados.every((r) => r.tx === txHash(9)))

  // La segunda tanda se ejecuta antes de registrarla: al refrescar queda caducada, y registrarla la deja ejecutada.
  const d2 = OP.detalle(ops[1])
  await OP.firmar(a, cadena, cfg, ops[1].id, 'beto@og', await firma(CUSTODIOS[0], d2))
  await OP.firmar(a, cadena, cfg, ops[1].id, 'caro@og', await firma(CUSTODIOS[1], d2))
  s.nonce = 5
  await OP.refrescar(a, cadena, cfg)
  assert.equal(ops[1].estado, 'caducada')
  s.recibos[txHash(10)] = { ok: true, eventos: [{ tipo: 'exito', hash: ops[1].hash }] }
  await OP.ejecutada(a, cadena, cfg, ops[1].id, txHash(10), 'beto@og')
  assert.equal(ops[1].estado, 'ejecutada')

  // La tercera se anula: sus 83 usuarios vuelven a entrar en el siguiente «Preparar».
  await OP.anular(a, cadena, cfg, ops[2].id, 'beto@og', 'se rehace')
  const otra = await prepararRegalo(a, cadena, 'ana@og', { excluir: [SAFE_DIR], porTanda: OP.POR_TANDA })
  assert.equal(otra.nuevos, 83)
  assert.equal(a.datos.regalos.filter((r) => r.estado === 'pendiente').length, 83)
})

test('Anular: con firmas se reemplaza por una vacía con el mismo nonce; un nonce consumido caduca la operación', async () => {
  const s = safeSim()
  const cadena = new Cadena(simulada(s))
  const a = enMemoria()
  const uno = await OP.crear(a, cadena, cfg, 'ana@og', { tipo: 'contratos', titulo: 'Abrir migración ONDK', llamadas: [{ to: dir(50), value: '0', data: '0x1234' }] })
  const dos = await OP.crear(a, cadena, cfg, 'ana@og', { tipo: 'contratos', titulo: 'Fijar registro', llamadas: [{ to: dir(51), value: '0', data: '0xabcd' }] })
  assert.deepEqual([uno.safeTx.nonce, dos.safeTx.nonce], [3, 4])
  await OP.firmar(a, cadena, cfg, uno.id, 'beto@og', await firma(CUSTODIOS[0], OP.detalle(uno)))
  await assert.rejects(OP.anular(a, cadena, cfg, uno.id, 'beto@og', ''), /motivo/)
  const { reemplazo } = await OP.anular(a, cadena, cfg, uno.id, 'beto@og', 'monto equivocado')
  assert.equal(uno.estado, 'anulada')
  assert.ok(reemplazo)
  assert.equal(reemplazo!.safeTx.nonce, 3, 'mismo nonce: ejecutarla deja sin efecto la anulada')
  assert.equal(reemplazo!.safeTx.to, getAddress(SAFE_DIR))
  assert.equal(reemplazo!.safeTx.value, '0')
  assert.equal(reemplazo!.anula, uno.id)
  // La Safe ejecutó algo con el nonce 4 fuera de la plataforma: «dos» ya no se puede ejecutar.
  s.nonce = 5
  assert.equal(await OP.refrescar(a, cadena, cfg), 2)
  assert.equal(dos.estado, 'caducada')
  assert.equal(reemplazo!.estado, 'caducada')
  await assert.rejects(OP.firmar(a, cadena, cfg, dos.id, 'beto@og', await firma(CUSTODIOS[0], OP.detalle(dos))), /caducada/)

  // Sin firmas registradas también se reemplaza: alguien pudo firmarla fuera con el archivo descargado.
  const tres = await OP.crear(a, cadena, cfg, 'ana@og', { tipo: 'contratos', titulo: 'Sin firmas', llamadas: [{ to: dir(52), value: '0', data: '0x' }] })
  const r3 = await OP.anular(a, cadena, cfg, tres.id, 'beto@og', 'no va')
  assert.equal(r3.reemplazo.safeTx.nonce, tres.safeTx.nonce)
  await assert.rejects(OP.anular(a, cadena, cfg, r3.reemplazo.id, 'caro@og', 'otra vez'), /no se anula/)
})

test('Si la cadena no responde al crear la operación, no queda una liberación trabada ni una tanda sin operación', async () => {
  const s = safeSim()
  let caida = false
  const base = simulada(s)
  const cadena = new Cadena(async (c: any) => (caida ? { jsonrpc: '2.0', id: 1, error: { message: 'nodo caído' } } : base(c)))
  const a = enMemoria()
  const l = proponer(a, 'ana@og', { monto: E.toString(), destino: dir(7), motivo: 'x', respaldo: 'y' })
  caida = true
  await assert.rejects(OP.crearDeLiberacion(a, cadena, cfg, l), /nodo caído/)
  // anular primero crea el reemplazo: si la cadena no responde, la operación sigue como estaba.
  caida = false
  const o = await OP.crearDeLiberacion(a, cadena, cfg, l)
  caida = true
  await assert.rejects(OP.anular(a, cadena, cfg, o.id, 'beto@og', 'x'), /nodo caído/)
  assert.equal(o.estado, 'en-firma')
  assert.equal(l.estado, 'propuesta')
})

test('HTTP con la Safe: aprobar a la antigua se niega, se firma la operación, y se importa un archivo de lotes', async () => {
  const s = safeSim()
  const almacen = enMemoria()
  const entorno = {
    MIGRACION_SECRETO: 'x'.repeat(40), SAFE_DIRECCION: SAFE_DIR, SAFE_MULTISEND: MULTISEND,
    MIGRACION_OPERADORES: ['ana@og|operador|' + hashClave('clave-ana'), 'beto@og|firmante|' + hashClave('clave-beto')].join(';'),
  }
  const viejo = { ...process.env }
  Object.assign(process.env, entorno)
  const ctx = crearContexto(almacen, new Cadena(simulada(s)), { ...process.env })
  const srv = crearApp(ctx).listen(0)
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/panel`
  try {
    const entrar = async (correo: string, clave: string) => (await (await fetch(`${base}/entrar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo, clave }) })).json()).token
    const [ana, beto] = [await entrar('ana@og', 'clave-ana'), await entrar('beto@og', 'clave-beto')]
    const pedir = (token: string, ruta: string, cuerpo?: unknown) => fetch(base + ruta, { method: cuerpo ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })

    const m = await (await pedir(ana, '/multifirma')).json()
    assert.equal(m.configurada, true)
    assert.equal(m.umbral, 2)
    assert.equal(m.duenos.length, 3)

    const l = await (await pedir(ana, '/liberaciones', { monto: E.toString(), destino: dir(8), motivo: 'Prueba', respaldo: 'Acta 1' })).json()
    assert.ok(l.operacion)
    assert.equal((await pedir(beto, `/liberaciones/${l.id}/aprobar`, {})).status, 409)
    const d = await (await pedir(beto, `/operaciones/${l.operacion}`)).json()
    const f = await pedir(beto, `/operaciones/${l.operacion}/firmar`, { firma: await firma(CUSTODIOS[1], d) })
    assert.equal(f.status, 200)
    assert.equal((await f.json()).firmas.length, 1)
    assert.equal((await pedir(ana, `/operaciones/${l.operacion}/firmar`, { firma: 'x' })).status, 403, 'firmar es de los firmantes')

    // El archivo de contratos-v2/scripts/lotes-safe.ts entra como una operación de lote.
    const archivo = { meta: { name: 'Migración v2 ONDK' }, transactions: [{ to: dir(60), value: '0', data: '0x01' }, { to: dir(60), value: '0', data: '0x02' }] }
    const op = await (await pedir(ana, '/operaciones', { archivo })).json()
    assert.equal(op.titulo, 'Migración v2 ONDK')
    assert.equal(op.safeTx.operation, 1)
    assert.equal(op.safeTx.nonce, 4)

    // La cadena no responde al proponer: la liberación no queda.
    const antes = almacen.datos.liberaciones.length
    const nonceReal = s.nonce
    ;(s as any).nonce = undefined
    const caida = await pedir(ana, '/liberaciones', { monto: E.toString(), destino: dir(9), motivo: 'Caída', respaldo: 'Acta 2' })
    assert.notEqual(caida.status, 201)
    assert.equal(almacen.datos.liberaciones.length, antes, 'sin operación no queda la liberación')
    s.nonce = nonceReal

    const estado = await (await fetch(base.replace('/panel', '') + '/estado')).json()
    assert.equal(estado.multifirma.safe, SAFE_DIR)
    assert.deepEqual(estado.multifirma.quorum, { operativa: { umbral: 2, custodios: 3 }, administracion: null }, 'el quórum que muestra la página es el de la cadena')
    // Sin la lista de usuarios no hay supply que mostrar.
    assert.equal(estado.origen.completa, false)
    // El supply de ORIGEN es solo lo que tienen los usuarios: la Safe no cuenta aunque esté en la lista.
    almacen.datos.listas.usuarios.direcciones = [dir(1), dir(2), SAFE_DIR]
    s.saldos[dir(1)] = E
    s.saldos[dir(2)] = E / 2n
    const o = await (await pedir(ana, '/origen')).json()
    assert.equal(o.circulante, (E + E / 2n).toString())
    assert.equal(o.usuarios, 2)
    assert.equal(o.multifirma, true)
  } finally {
    srv.close()
    for (const k of Object.keys(entorno)) if (!(k in viejo)) delete process.env[k]
    Object.assign(process.env, viejo)
  }
})

test('La firma múltiple de los tres custodios: sus propios nonces y las tres firmas', async () => {
  const s = safeSim()
  const cadena = new Cadena(simulada(s))
  const a = enMemoria()
  const cfg3: OP.ConfigSafe = { ...cfg, constitucional: SAFE_TRES }
  assert.throws(() => OP.direccionSafe(cfg, 'constitucional'), /SAFE_CONSTITUCIONAL/)
  const op = await OP.crear(a, cadena, cfg3, 'ana@og', { tipo: 'contratos', titulo: 'Fijar registro', llamadas: [{ to: dir(70), value: '0', data: '0x01' }] })
  const ad = await OP.crear(a, cadena, cfg3, 'ana@og', { tipo: 'contratos', titulo: 'Fijar registro (admin)', llamadas: [{ to: dir(70), value: '0', data: '0x02' }], enSafe: OP.direccionSafe(cfg3, 'constitucional') })
  assert.equal(op.safeTx.nonce, 3, 'la operativa sigue su nonce')
  assert.equal(ad.safeTx.nonce, 0, 'la de tres tiene el suyo')
  assert.equal(ad.safe, SAFE_TRES)
  const d = OP.detalle(ad)
  assert.equal(d.tipado.domain.verifyingContract, getAddress(SAFE_TRES))
  await OP.firmar(a, cadena, cfg3, ad.id, 'beto@og', await firma(CUSTODIOS[0], d))
  await OP.firmar(a, cadena, cfg3, ad.id, 'caro@og', await firma(CUSTODIOS[1], d))
  assert.equal(ad.estado, 'en-firma', 'con dos de tres no está lista')
  await OP.firmar(a, cadena, cfg3, ad.id, 'dani@og', await firma(CUSTODIOS[2], d))
  assert.equal(ad.estado, 'lista')
  // Su anulación va en la misma Safe y con el mismo nonce.
  const { reemplazo } = await OP.anular(a, cadena, cfg3, op.id, 'beto@og', 'no va')
  assert.equal(reemplazo.safe, SAFE_DIR)
  s.nonceTres = 1
  await OP.refrescar(a, cadena, cfg3)
  assert.equal(ad.estado, 'caducada', 'se usó su nonce en la de tres')
  assert.equal(reemplazo.estado, 'en-firma', 'la operativa no se toca')
})

test('Sin SAFE_DIRECCION la plataforma sigue como antes', async () => {
  assert.equal(OP.configSafe({}), null)
  assert.equal(OP.configSafe({ SAFE_DIRECCION: 'no' }), null)
  assert.deepEqual(OP.configSafe({ SAFE_DIRECCION: SAFE_DIR.toUpperCase().replace('0X', '0x') }), { safe: SAFE_DIR, constitucional: undefined, multisend: undefined })
})

test('Recuperación desde la Safe anterior: todo su saldo, solo hacia la operativa, con las firmas de sus custodios', async () => {
  const s = safeSim()
  const cadena = new Cadena(simulada(s))
  const a = enMemoria()
  await assert.rejects(OP.crearRecuperacion(a, cadena, cfg, 'ana@og'), /SAFE_ANTERIOR/)
  // La Safe anterior es configurable por variable, y nunca puede ser la vigente.
  assert.equal(OP.configSafe({ SAFE_DIRECCION: SAFE_DIR, SAFE_ANTERIOR: SAFE_TRES })!.anterior, SAFE_TRES)
  assert.equal(OP.configSafe({ SAFE_DIRECCION: SAFE_DIR, SAFE_ANTERIOR: SAFE_DIR })!.anterior, undefined)
  const cfgA: OP.ConfigSafe = { ...cfg, anterior: SAFE_TRES }
  await assert.rejects(OP.crearRecuperacion(a, cadena, cfgA, 'ana@og'), /no tiene ORIGEN/)
  s.saldos[SAFE_TRES] = 999_999_988_919n * E
  const o = await OP.crearRecuperacion(a, cadena, cfgA, 'ana@og')
  assert.equal(o.safe, SAFE_TRES, 'la firma la Safe anterior')
  assert.equal(o.tipo, 'recuperacion')
  assert.deepEqual(o.llamadas, [{ to: getAddress(SAFE_DIR), value: (999_999_988_919n * E).toString(), data: '0x' }], 'todo el saldo, a la operativa vigente')
  assert.equal(o.safeTx.operation, 0)
  await assert.rejects(OP.crearRecuperacion(a, cadena, cfgA, 'ana@og'), /ya hay una recuperación pendiente/)
  const d = OP.detalle(o)
  assert.equal(d.tipado.domain.verifyingContract, getAddress(SAFE_TRES))
  for (const [i, quien] of ['beto@og', 'caro@og', 'dani@og'].entries()) await OP.firmar(a, cadena, cfgA, o.id, quien, await firma(CUSTODIOS[i], d))
  assert.equal(o.estado, 'lista')
  assert.equal(OP.detalle(o).ejecutar!.to, SAFE_TRES)
})

test('Firma directa por enlace: la firma EIP-712 de un custodio es la credencial; nadie más firma', async () => {
  const s = safeSim()
  const almacen = enMemoria()
  const app = crearApp(crearContexto(almacen, new Cadena(simulada(s)), { MIGRACION_SECRETO: 'x'.repeat(40), SAFE_DIRECCION: SAFE_DIR, SAFE_MULTISEND: MULTISEND } as any))
  const srv = app.listen(0)
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
  try {
    const o = await OP.crear(almacen, new Cadena(simulada(s)), cfg, 'ana@og', { tipo: 'contratos', titulo: 'Abrir migración AGKA', llamadas: [{ to: dir(70), value: '0', data: '0xa718bad0' + '00'.repeat(96) }] })
    const d = await (await fetch(`${base}/api/firmar/${o.id}`)).json()
    assert.equal(d.umbral, 2); assert.equal(d.custodios.length, 3); assert.ok(d.custodios[0].direccion); assert.equal(d.llamadas[0].accion, 'abrirMigracion')
    assert.equal((await fetch(`${base}/firmar/${o.id}`)).status, 200, 'la página se sirve')
    const firmar = async (w: any) => fetch(`${base}/api/firmar/${o.id}/firma`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firma: await w.signTypedData(d.tipado.domain, d.tipado.types, d.tipado.message) }) })
    const ajeno = await firmar(Wallet.createRandom())
    assert.equal(ajeno.status, 400); assert.match((await ajeno.json()).error, /no es custodio/)
    assert.equal((await firmar(CUSTODIOS[0])).status, 200)
    const otraVez = await firmar(CUSTODIOS[0])
    assert.equal(otraVez.status, 400, 'la misma billetera no firma dos veces')
    const r = await (await firmar(CUSTODIOS[2])).json()
    assert.equal(r.estado, 'lista'); assert.equal(r.firmas, 2)
    const ej = await fetch(`${base}/api/firmar/${o.id}/ejecutada`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tx: txHash(77) }) })
    assert.equal(ej.status, 400, 'una ejecución que no está en la cadena no se registra')
    assert.equal((await fetch(`${base}/api/firmar/no-existe`)).status, 404)
  } finally { srv.close() }
})
