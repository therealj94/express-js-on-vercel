// La firma múltiple de verdad: Safe 1.4.1 desplegada desde los artefactos, con 3 custodios y umbral 2,
// manejada con el mismo código de la plataforma (plataforma-migracion/src/multifirma.ts).
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { comprobarCodigo, crearSafe, desplegarInfraestructura } from '../scripts/safe'
import type * as Multifirma from '../../plataforma-migracion/src/multifirma'

// El mismo módulo que usa la plataforma (un paquete ESM): se carga con tsx, que lo transpila a CJS.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { require: requerir } = require('../../plataforma-migracion/node_modules/tsx/dist/cjs/api/index.cjs')
const M: typeof Multifirma = requerir('../../plataforma-migracion/src/multifirma.ts', __filename)

const E = 10n ** 18n

async function preparar() {
  const [quien, c1, c2, c3, ana, beto, extrano] = await ethers.getSigners()
  const infra = await desplegarInfraestructura(quien)
  const safe = await crearSafe(quien, infra, [c1.address, c2.address, c3.address], 2)
  const chainId = Number((await ethers.provider.getNetwork()).chainId)
  const llamar = (m: string, p: unknown[]) => ethers.provider.send(m, p)
  return { quien, c1, c2, c3, ana, beto, extrano, infra, safe, chainId, llamar }
}

/** Firma EIP-712 de un custodio, como la pide el panel con eth_signTypedData_v4. */
async function firmar(firmante: any, safe: string, chainId: number, t: Multifirma.SafeTx) {
  const ty = M.tipado(safe, chainId, t)
  return { firmante: firmante.address, firma: await firmante.signTypedData(ty.domain, ty.types, ty.message) }
}

async function ejecutar(quien: any, safe: string, t: Multifirma.SafeTx, firmas: { firmante: string; firma: string }[]) {
  return (await quien.sendTransaction({ to: safe, data: M.datosEjecucion(t, firmas) })).wait()
}

describe('firma múltiple (Safe 1.4.1, 2 de 3)', () => {
  it('el código desplegado es el canónico de Safe 1.4.1', async () => {
    const { infra } = await preparar()
    expect(await comprobarCodigo(ethers.provider, infra)).to.deep.equal([])
  })

  it('la Safe nace con los tres custodios y umbral dos', async () => {
    const { safe, llamar, c1, c2, c3, chainId } = await preparar()
    const e = await M.estadoSafe(llamar, safe)
    expect(e.duenos).to.have.members([c1.address, c2.address, c3.address])
    expect(e.umbral).to.equal(2)
    expect(e.nonce).to.equal(0)
    expect(e.chainId).to.equal(chainId)
  })

  it('una liberación de ORIGEN: con dos firmas sale, y la plataforma comprueba que salió lo firmado', async () => {
    const { quien, c1, c3, ana, safe, chainId, llamar } = await preparar()
    await quien.sendTransaction({ to: safe, value: 100n * E }) // la tesorería de ORIGEN vive en la Safe
    const t = M.armarSafeTx([M.llamada({ to: ana.address, value: 5n * E })], 0)
    const hash = M.hashSafeTx(safe, chainId, t)
    const firmas = [await firmar(c3, safe, chainId, t), await firmar(c1, safe, chainId, t)]
    for (const f of firmas) expect(M.firmanteDe(hash, f.firma)).to.equal(f.firmante)
    const antes = await ethers.provider.getBalance(ana.address)
    const recibo = await ejecutar(quien, safe, t, firmas) // cualquiera con gas la manda
    expect(await ethers.provider.getBalance(ana.address)).to.equal(antes + 5n * E)
    expect(await M.comprobarEjecucion(llamar, recibo!.hash, safe, hash)).to.equal(null)
    // Otro hash (otra transacción firmada) no se da por ejecutado con ese recibo.
    const otro = M.hashSafeTx(safe, chainId, { ...t, value: (6n * E).toString() })
    expect(await M.comprobarEjecucion(llamar, recibo!.hash, safe, otro)).to.match(/no ejecutó lo firmado/)
  })

  it('con una sola firma, o con la de alguien que no es custodio, no sale nada', async () => {
    const { quien, c1, extrano, ana, safe, chainId } = await preparar()
    await quien.sendTransaction({ to: safe, value: 10n * E })
    const t = M.armarSafeTx([M.llamada({ to: ana.address, value: E })], 0)
    await expect(ejecutar(quien, safe, t, [await firmar(c1, safe, chainId, t)])).to.be.reverted
    await expect(ejecutar(quien, safe, t, [await firmar(c1, safe, chainId, t), await firmar(extrano, safe, chainId, t)])).to.be.reverted
    expect(await ethers.provider.getBalance(safe)).to.equal(10n * E)
  })

  it('el regalo de 1 ORIGEN: un lote de envíos en una sola transacción, con un solo par de firmas', async () => {
    const { quien, c1, c2, safe, chainId, llamar, infra } = await preparar()
    await quien.sendTransaction({ to: safe, value: 50n * E })
    const usuarios = Array.from({ length: 40 }, () => ethers.Wallet.createRandom().address)
    const faltan = usuarios.map((d, i) => ({ to: d, value: (E - BigInt(i) * 10n ** 15n).toString() }))
    const t = M.armarSafeTx(faltan.map((x) => M.llamada(x)), 0, infra.MultiSendCallOnly)
    expect(t.operation).to.equal(1)
    const firmas = [await firmar(c1, safe, chainId, t), await firmar(c2, safe, chainId, t)]
    const recibo = await ejecutar(quien, safe, t, firmas)
    for (const x of faltan) expect(await ethers.provider.getBalance(x.to)).to.equal(BigInt(x.value))
    expect(await M.comprobarEjecucion(llamar, recibo!.hash, safe, M.hashSafeTx(safe, chainId, t))).to.equal(null)
  })

  it('los roles del token v2 son de la Safe: abrir la migración pasa por las dos firmas', async () => {
    const { quien, c2, c3, ana, safe, chainId } = await preparar()
    const token = await ethers.deployContract('TokenSFSP', ['ONDK', 'ONDK', 'P', 'SFSP-200', safe])
    await expect(token.connect(ana).abrirMigracion(ethers.id('x'), E, ethers.ZeroHash)).to.be.reverted
    const raiz = ethers.keccak256(ethers.toUtf8Bytes('raiz'))
    const t = M.armarSafeTx([M.llamada({ to: await token.getAddress(), data: token.interface.encodeFunctionData('abrirMigracion', [raiz, 7n * E, ethers.ZeroHash]) })], 0)
    await ejecutar(quien, safe, t, [await firmar(c2, safe, chainId, t), await firmar(c3, safe, chainId, t)])
    expect(await token.restante(raiz)).to.equal(7n * E)
  })

  it('el nonce protege: la misma transacción firmada no se ejecuta dos veces', async () => {
    const { quien, c1, c2, ana, safe, chainId } = await preparar()
    await quien.sendTransaction({ to: safe, value: 10n * E })
    const t = M.armarSafeTx([M.llamada({ to: ana.address, value: E })], 0)
    const firmas = [await firmar(c1, safe, chainId, t), await firmar(c2, safe, chainId, t)]
    await ejecutar(quien, safe, t, firmas)
    await expect(ejecutar(quien, safe, t, firmas)).to.be.reverted
  })

  it('rechaza firmas que no son EIP-712 y datos mal formados', async () => {
    const { c1, safe, chainId } = await preparar()
    const t = M.armarSafeTx([M.llamada({ to: c1.address, value: 1 })], 0)
    const firmaPersonal = await c1.signMessage(ethers.getBytes(M.hashSafeTx(safe, chainId, t)))
    expect(() => M.firmanteDe(M.hashSafeTx(safe, chainId, t), firmaPersonal.slice(0, 130) + (parseInt(firmaPersonal.slice(130), 16) + 4).toString(16))).to.throw(/EIP-712/)
    expect(() => M.llamada({ to: 'no', value: 1 })).to.throw(/dirección/)
    expect(() => M.llamada({ to: c1.address, value: -1 })).to.throw(/negativo/)
    expect(() => M.armarSafeTx([M.llamada({ to: c1.address }), M.llamada({ to: c1.address })], 0)).to.throw(/SAFE_MULTISEND/)
  })
})

