// Las transacciones que genera scripts/lotes.ts, ejecutadas como las ejecutaría la firma múltiple.
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-toolbox/network-helpers'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { prepararLotes, type Archivo } from '../scripts/lotes'
import acunacion from './acunacion-ejemplo.json'

const E = 10n ** 18n

/** Un archivo como el de la plataforma, armado con la librería de OpenZeppelin (mismo formato de hojas). */
function archivo(entradas: [string, bigint][]): Archivo {
  const arbol = StandardMerkleTree.of(entradas.map(([d, m]) => [d, m.toString()]), ['address', 'uint256'])
  return {
    raiz: arbol.root,
    totalAcunar: entradas.reduce((s, [, m]) => s + m, 0n).toString(),
    tenedores: entradas.map(([d, m]) => ({ direccion: d, acunar: m.toString(), prueba: arbol.getProof([d, m.toString()]) })),
  }
}

async function ejecutar(multifirma: any, transacciones: { to: string; data: string }[]) {
  for (const t of transacciones) await (await multifirma.sendTransaction({ to: t.to, data: t.data })).wait()
}

describe('lotes para la firma múltiple', () => {
  it('primera ronda: abre por el total y acredita todo', async () => {
    const [multifirma] = await ethers.getSigners()
    const token = await ethers.deployContract('TokenSFSP', ['AUKA', 'AUKA', 'P', 'SFSP-300', multifirma.address, multifirma.address, [], 0])
    const dir = await token.getAddress()
    const r = await prepararLotes(ethers, acunacion as Archivo, dir, ethers.provider, token as any, { lote: 2 })
    expect(r.transacciones.length).to.equal(1 + Math.ceil(acunacion.tenedores.length / 2))
    await ejecutar(multifirma, r.transacciones)
    expect(await token.totalSupply()).to.equal(BigInt(acunacion.totalAcunar))
  })

  it('ronda de reclamos: el archivo trae lo viejo y lo nuevo, y solo se abre y acredita lo nuevo', async () => {
    const [multifirma, a1, a2, a3] = await ethers.getSigners()
    const token = await ethers.deployContract('TokenSFSP', ['ONDK', 'ONDK', 'P', 'SFSP-200', multifirma.address, multifirma.address, [], 0])
    const dir = await token.getAddress()
    const foto = archivo([[a1.address, 10n * E], [a2.address, 5n * E]])
    await ejecutar(multifirma, (await prepararLotes(ethers, foto, dir, ethers.provider, token as any)).transacciones)

    // La plataforma entrega todo lo que hay que acuñar: la foto y el reclamo aprobado de a3.
    const conReclamos = archivo([[a1.address, 10n * E], [a2.address, 5n * E], [a3.address, 7n * E]])
    const r = await prepararLotes(ethers, conReclamos, dir, ethers.provider, token as any)
    expect(r.pendientes.map((t) => t.direccion)).to.deep.equal([a3.address])
    expect(r.total).to.equal(7n * E)
    await ejecutar(multifirma, r.transacciones)
    expect(await token.balanceOf(a1.address)).to.equal(10n * E)
    expect(await token.balanceOf(a3.address)).to.equal(7n * E)
    expect(await token.totalSupply()).to.equal(22n * E)

    // Volver a generar el mismo archivo ya no tiene nada que firmar.
    expect((await prepararLotes(ethers, conReclamos, dir, ethers.provider, token as any)).transacciones).to.deep.equal([])
  })

  it('un security con demora: primero solo el anuncio, y pasados siete días la apertura y los lotes', async () => {
    const [multifirma] = await ethers.getSigners()
    const token = await ethers.deployContract('TokenSFSP', ['ONDK', 'ONDK', 'P', 'SFSP-200', multifirma.address, multifirma.address, [], 7 * 86400])
    const dir = await token.getAddress()
    const a = acunacion as Archivo
    const r1 = await prepararLotes(ethers, a, dir, ethers.provider, token as any, { referencia: 'ONDK corte' })
    expect(r1.anuncio).to.not.equal(undefined)
    expect(r1.transacciones.length).to.equal(1)
    await ejecutar(multifirma, r1.transacciones)
    await expect(prepararLotes(ethers, a, dir, ethers.provider, token as any, { referencia: 'ONDK corte' })).to.be.rejectedWith(/en demora/)
    await time.increase(7 * 86400)
    const r2 = await prepararLotes(ethers, a, dir, ethers.provider, token as any, { referencia: 'ONDK corte' })
    expect(r2.anuncio).to.equal(undefined)
    await ejecutar(multifirma, r2.transacciones)
    expect(await token.totalSupply()).to.equal(BigInt(a.totalAcunar))
  })

  it('rechaza un LOTE inválido, una prueba rota y un total que no suma', async () => {
    const [multifirma] = await ethers.getSigners()
    const token = await ethers.deployContract('TokenSFSP', ['X', 'X', 'P', 'S', multifirma.address, multifirma.address, [], 0])
    const dir = await token.getAddress()
    const a = acunacion as Archivo
    for (const lote of [0, -1, Number.NaN, 1.5, 1000]) {
      await expect(prepararLotes(ethers, a, dir, ethers.provider, token as any, { lote })).to.be.rejectedWith(/LOTE/)
    }
    const roto = { ...a, tenedores: a.tenedores.map((t, i) => (i === 0 ? { ...t, acunar: (BigInt(t.acunar) + 1n).toString() } : t)) }
    await expect(prepararLotes(ethers, roto, dir, ethers.provider, token as any)).to.be.rejectedWith(/no verifica/)
    await expect(prepararLotes(ethers, { ...a, totalAcunar: '1' }, dir, ethers.provider, token as any)).to.be.rejectedWith(/no coincide/)
  })
})
