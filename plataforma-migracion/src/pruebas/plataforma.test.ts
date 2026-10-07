// Pruebas de la plataforma contra una cadena simulada: sin red, sin base y sin llaves.
import test from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'net'
import { Cadena, TRANSFER, type Transporte } from '../cadena.js'
import { construir, prueba, verificar } from '../merkle.js'
import { enMemoria, vacio } from '../almacen.js'
import { Wallet } from 'ethers'
import { aAcunar, barrido, candidatas, conciliar, mensajeReclamo, prepararReclamo, puedePublicar, tomarFoto } from '../foto.js'
import { activo } from '../catalogo.js'
import { aprobar, ejecutar, prepararRegalo, proponer, registrarEnvioRegalo, UN_ORIGEN } from '../origen.js'
import { crearApp, crearContexto } from '../app.js'
import { hashClave } from '../sesion.js'

const E = 10n ** 18n
const dir = (n: number) => '0x' + n.toString(16).padStart(40, '0')
const AUKA = activo('AUKA')!.heredado!
const V2 = '0x' + 'a2'.repeat(20)
const TESORERIA = dir(0xbeef)
// Dirección con tope en la política de AUKA: queda con 50.
const CON_TOPE = '0x746268404cc9ca2ef0ac344f02b236db232c3ad8'
// Usuario de Veta Wallet con más de 100.000 AUKA: desaparece entero.
const BALLENA = dir(8)
// Tenedor que ninguna lista conoce y que nunca se movió: tiene que reclamar.
const OCULTO = Wallet.createRandom()

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
  // AUKA: tres usuarios chicos, uno externo (no es de Veta), la tesorería (980), un usuario con
  // 150.000 (por encima del umbral de 100.000), la dirección con tope (90) y un tenedor oculto (7)
  // que no aparece en ningún lado.
  const saldos = {
    [dir(1)]: 10n * E, [dir(2)]: 5n * E, [dir(3)]: 1n * E, [TESORERIA]: 980n * E, [dir(9)]: 4n * E,
    [CON_TOPE]: 90n * E, [BALLENA]: 150_000n * E, [OCULTO.address.toLowerCase()]: 7n * E,
  }
  return {
    bloque: 1000,
    tokens: { [AUKA]: { supply: 151_097n * E, saldos } },
    nativo: { [TESORERIA]: 900n * E, [dir(1)]: 2n * E, [dir(3)]: E / 4n },
    logs: [{ address: AUKA, from: dir(1), to: dir(2) }, { address: AUKA, from: TESORERIA, to: dir(9) }, { address: AUKA, from: TESORERIA, to: CON_TOPE }],
    txs: {},
  }
}

const USUARIOS = [dir(1), dir(2), dir(3), CON_TOPE, BALLENA]

function listasCon(usuarios: string[]) {
  const listas = vacio().listas
  listas.tesoreria.direcciones = [TESORERIA]
  listas.usuarios.direcciones = usuarios
  return listas
}

async function fotoAuka(m: Mundo, usuarios: string[] = USUARIOS) {
  const cadena = new Cadena(simulada(m))
  const listas = listasCon(usuarios)
  const dirs = candidatas(await barrido(cadena, m.bloque), listas)
  return { cadena, foto: { id: 'f', activo: 'AUKA', bloque: m.bloque, creada: '', autor: '', estado: 'lista' as const, ...(await tomarFoto(cadena, activo('AUKA')!, m.bloque, dirs, listas)) } }
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

test('Política: solo pasan los usuarios de Veta con 100.000 o menos; el tope deja 50; lo demás desaparece', async () => {
  const { foto } = await fotoAuka(mundo())
  const por = Object.fromEntries(foto.tenedores!.map((t) => [t.direccion, t]))
  assert.equal(por[TESORERIA].acunar, '0'); assert.equal(por[TESORERIA].motivo, 'no-usuario')
  assert.equal(por[dir(9)].acunar, '0'); assert.equal(por[dir(9)].motivo, 'no-usuario', 'fuera de Veta Wallet no pasa')
  assert.equal(por[BALLENA].acunar, '0'); assert.equal(por[BALLENA].motivo, 'umbral')
  assert.equal(por[CON_TOPE].acunar, (50n * E).toString()); assert.equal(por[CON_TOPE].motivo, 'tope')
  for (const d of [dir(1), dir(2), dir(3)]) assert.equal(por[d].acunar, por[d].saldo, `${d} pasa completo`)
  assert.equal(foto.acunar, (66n * E).toString(), '10 + 5 + 1 + 50')
  assert.equal(foto.excluido, (151_024n * E).toString(), '980 de tesorería + 4 externa + 150.000 por umbral + 40 por el tope')
  assert.equal(foto.sinUbicar, (7n * E).toString(), 'el oculto no se encontró')
  assert.equal(por[dir(3)].clase, 'usuario', 'las listas siguen clasificando')
})

test('Lo no ubicado exige plazo de reclamos para publicar, y se reclama firmando con la billetera', async () => {
  const m = mundo()
  const { cadena, foto } = await fotoAuka(m)
  assert.match(puedePublicar(foto)!, /plazo de reclamos/)
  const plazo = new Date(Date.now() + 86_400_000).toISOString()
  assert.equal(puedePublicar(foto, plazo), null)
  const f = { ...foto, estado: 'publicada' as const, plazoReclamos: plazo }
  const dirOculto = OCULTO.address.toLowerCase()

  const ajeno = Wallet.createRandom()
  // Solo reclama un usuario de Veta Wallet: el oculto entra a la lista después de la foto.
  const listas = listasCon([...USUARIOS, dirOculto])
  const firma = await OCULTO.signMessage(mensajeReclamo('AUKA', dirOculto, m.bloque))
  await assert.rejects(prepararReclamo(cadena, activo('AUKA')!, f, [], dirOculto, firma, listasCon(USUARIOS)), /no es de un usuario/)
  await assert.rejects(prepararReclamo(cadena, activo('AUKA')!, f, [], dirOculto, await ajeno.signMessage(mensajeReclamo('AUKA', dirOculto, m.bloque)), listas), /no es de esa dirección/)
  await assert.rejects(prepararReclamo(cadena, activo('AUKA')!, f, [], dir(1), await ajeno.signMessage(mensajeReclamo('AUKA', dir(1), m.bloque)), listas), /no es de esa dirección/)

  const r = await prepararReclamo(cadena, activo('AUKA')!, f, [], dirOculto, firma, listas)
  assert.equal(r.saldo, (7n * E).toString()); assert.equal(r.acunar, (7n * E).toString())
  const reclamos = [{ ...r, id: 'r1', creado: '', estado: 'pendiente' as const }]
  await assert.rejects(prepararReclamo(cadena, activo('AUKA')!, f, reclamos, dirOculto, firma, listas), /ya tiene un reclamo/)
  assert.equal(aAcunar(f, reclamos).length, 4, 'un reclamo pendiente no se acuña')
  reclamos[0].estado = 'aprobado' as any
  assert.equal(aAcunar(f, reclamos).length, 5, 'el aprobado sí')

  await assert.rejects(prepararReclamo(cadena, activo('AUKA')!, { ...f, plazoReclamos: new Date(Date.now() - 1000).toISOString() }, [], dirOculto, firma, listas), /cerrado/)
})

test('La conciliación exige cada monto a acuñar exacto y el mismo total en la v2', async () => {
  const m = mundo()
  const { cadena, foto } = await fotoAuka(m)
  const f = { ...foto, estado: 'publicada' as const }
  const esperado = Object.fromEntries(aAcunar(f, []).map((t) => [t.direccion, BigInt(t.acunar)]))
  m.tokens[V2] = { supply: 66n * E, saldos: { ...esperado } }
  assert.equal((await conciliar(cadena, f, [], V2)).cuadra, true)

  m.tokens[V2].saldos[TESORERIA] = 980n * E
  m.tokens[V2].supply = 1046n * E
  const c = await conciliar(cadena, f, [], V2)
  assert.equal(c.cuadra, false, 'acuñar tesorería que debía desaparecer se detecta por el total')
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

test('Regalo de gas: completa hasta 1 ORIGEN a cada usuario de Veta Wallet, solo con aprobación', async () => {
  const m = mundo()
  const cadena = new Cadena(simulada(m))
  const a = enMemoria()
  a.datos.listas.tesoreria.direcciones = [TESORERIA]
  // dir(1) tiene 2 ORIGEN (no recibe), dir(3) tiene 0,25 (recibe 0,75), dir(4) nada (recibe 1), y la tesorería no cuenta.
  a.datos.listas.usuarios.direcciones = [dir(1), dir(3), dir(4), TESORERIA]

  const { liberacion, nuevos } = await prepararRegalo(a, cadena, 'op@og')
  assert.equal(nuevos, 2)
  const monto = Object.fromEntries(a.datos.regalos.map((r) => [r.direccion, r.monto]))
  assert.deepEqual(monto, { [dir(3)]: (UN_ORIGEN - E / 4n).toString(), [dir(4)]: UN_ORIGEN.toString() })
  assert.equal(liberacion!.monto, (2n * UN_ORIGEN - E / 4n).toString())
  assert.equal((await prepararRegalo(a, cadena, 'op@og')).nuevos, 0, 'nadie lo recibe dos veces')

  const h = '0x' + '5'.repeat(64)
  m.txs[h] = { from: TESORERIA, to: dir(3), value: UN_ORIGEN, ok: true }
  await assert.rejects(registrarEnvioRegalo(a, cadena, dir(3), h, 'op@og'), /no está aprobado/)
  aprobar(a, liberacion!.id, 'c1@og', 2); aprobar(a, liberacion!.id, 'c2@og', 2)
  await assert.rejects(registrarEnvioRegalo(a, cadena, dir(3), h, 'op@og'), /monto no coincide/, 'se envía lo que falta, no 1 entero')
  const h2 = '0x' + '6'.repeat(64)
  m.txs[h2] = { from: TESORERIA, to: dir(3), value: UN_ORIGEN - E / 4n, ok: true }
  await registrarEnvioRegalo(a, cadena, dir(3), h2, 'op@og')
  await assert.rejects(registrarEnvioRegalo(a, cadena, dir(4), h2, 'op@og'), /ya se usó/)
})

test('HTTP: la consulta pública da una prueba que verifica, y el panel exige sesión y rol', async () => {
  const m = mundo()
  process.env.MIGRACION_SECRETO = 'x'.repeat(40)
  process.env.MIGRACION_OPERADORES = `op@og.link|operador|${hashClave('clave-del-operador')};ver@og.link|lectura|${hashClave('clave-de-lectura')}`
  const a = enMemoria()
  const tenedores = [
    { direccion: dir(1), saldo: (10n * E).toString(), clase: 'usuario' as const, acunar: (10n * E).toString() },
    { direccion: TESORERIA, saldo: (900n * E).toString(), clase: 'tesoreria' as const, acunar: '0', motivo: 'no-usuario' as const },
  ]
  const raiz = construir([{ direccion: dir(1), saldo: 10n * E }]).raiz
  a.datos.fotos.push({ id: 'f', activo: 'AUKA', bloque: 900, creada: '', autor: '', estado: 'publicada', raiz, supply: (910n * E).toString(), tenedores, sinUbicar: '0' })

  const srv = crearApp(crearContexto(a, new Cadena(simulada(m)), { ...process.env })).listen(0)
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
  try {
    const t = await (await fetch(`${base}/api/tenedor/${dir(1)}`)).json()
    const auka = t.activos.find((x: any) => x.clave === 'AUKA')
    assert.equal(auka.aAcunar, (10n * E).toString())
    assert.ok(verificar(auka.foto.raiz, dir(1), 10n * E, auka.prueba))
    const tes = (await (await fetch(`${base}/api/tenedor/${TESORERIA}`)).json()).activos.find((x: any) => x.clave === 'AUKA')
    assert.equal(tes.aAcunar, '0'); assert.equal(tes.motivo, 'no-usuario'); assert.equal(tes.prueba, null)
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
    const acun = await (await conToken(op, '/fotos/f/acunacion.json')).json()
    assert.deepEqual(acun.tenedores.map((x: any) => x.direccion), [dir(1)], 'la tesorería no entra a la acuñación')
  } finally {
    srv.close()
  }
})

test('Lista única de monedas: contrato vigente, cambio a v2 por variable y ocultas', async () => {
  const { monedas } = await import('../monedas.js')
  const base = monedas({})
  const auka = base.find((m) => m.simbolo === 'AUKA')!
  assert.equal(auka.contrato, AUKA); assert.equal(auka.estado, 'heredada'); assert.equal(auka.visible, true)
  assert.equal(base.find((m) => m.simbolo === 'ORIGEN')!.contrato, null)
  assert.equal(base.find((m) => m.simbolo === 'MNKA')!.clave, 'MONARKA', 'se busca por el símbolo en cadena')
  assert.equal(base.find((m) => m.simbolo === 'AUBEX')!.precioFijo, null, 'el precio fijo de AUBEX se retira')
  assert.equal(base.length, 15)
  const tras = monedas({ V2_AUKA: V2, MONEDAS_OCULTAS: 'aubex, REST' })
  const aukaV2 = tras.find((m) => m.simbolo === 'AUKA')!
  assert.equal(aukaV2.contrato, V2); assert.equal(aukaV2.heredado, AUKA); assert.equal(aukaV2.estado, 'migrada')
  assert.deepEqual(tras.filter((m) => !m.visible).map((m) => m.simbolo), ['AUBEX', 'REST'])
})
