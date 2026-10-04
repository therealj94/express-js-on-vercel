// Pruebas del token conforme y del registro de elegibilidad, con un archivo de acuñación
// generado por la plataforma de migración (test/acunacion-ejemplo.json).
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers'
import acunacion from './acunacion-ejemplo.json'

const E = 10n ** 18n
const motivo = ethers.encodeBytes32String('prueba')
const HABILITADA = 1
const BLOQUEADA = 2

async function desplegar() {
  const [multifirma, a1, a2, a3, tesoreria, a5, ajeno] = await ethers.getSigners()
  const token = await ethers.deployContract('TokenSFSP', ['Gold Kapital', 'AUKA', 'COM-OG-0001', 'SFSP-300', multifirma.address])
  const registro = await ethers.deployContract('RegistroElegibilidad', [multifirma.address])
  return { token, registro, multifirma, a1, a2, a3, tesoreria, a5, ajeno }
}

async function conMigracionAbierta() {
  const d = await desplegar()
  await d.token.abrirMigracion(acunacion.raiz, acunacion.totalAcunar, motivo)
  return d
}

describe('TokenSFSP', () => {
  it('nace con los roles en la firma múltiple y sin supply', async () => {
    const { token, multifirma, ajeno } = await loadFixture(desplegar)
    expect(await token.totalSupply()).to.equal(0n)
    expect(await token.pasaporte()).to.equal('COM-OG-0001')
    for (const rol of [await token.DEFAULT_ADMIN_ROLE(), await token.EMISOR_ROLE(), await token.SUSPENSION_ROLE(), await token.QUEMA_ROLE()]) {
      expect(await token.hasRole(rol, multifirma.address)).to.equal(true)
      expect(await token.hasRole(rol, ajeno.address)).to.equal(false)
    }
    await expect(ethers.deployContract('TokenSFSP', ['x', 'x', 'x', 'x', ethers.ZeroAddress])).to.be.revertedWithCustomError(token, 'DireccionCero')
  })

  describe('migración por Merkle', () => {
    it('acredita a cada tenedor exactamente lo del archivo de la plataforma, y el supply queda igual al total', async () => {
      const { token, ajeno } = await loadFixture(conMigracionAbierta)
      for (const t of acunacion.tenedores) {
        // Cualquiera puede ejecutarlo: el destino lo fija la hoja.
        await expect(token.connect(ajeno).acreditar(acunacion.raiz, t.direccion, t.acunar, t.prueba))
          .to.emit(token, 'EquivalenciaAcunada').withArgs(acunacion.raiz, ethers.getAddress(t.direccion), t.acunar)
        expect(await token.balanceOf(t.direccion)).to.equal(BigInt(t.acunar))
      }
      expect(await token.totalSupply()).to.equal(BigInt(acunacion.totalAcunar))
      expect(await token.restante(acunacion.raiz)).to.equal(0n)
    })

    it('acredita por lotes', async () => {
      const { token } = await loadFixture(conMigracionAbierta)
      const ts = acunacion.tenedores
      await token.acreditarLote(acunacion.raiz, ts.map((t) => t.direccion), ts.map((t) => t.acunar), ts.map((t) => t.prueba))
      expect(await token.totalSupply()).to.equal(BigInt(acunacion.totalAcunar))
    })

    it('no acredita dos veces, ni otro monto, ni a otra dirección, ni sin ronda abierta', async () => {
      const { token, ajeno } = await loadFixture(conMigracionAbierta)
      const [t, otro] = acunacion.tenedores
      await token.acreditar(acunacion.raiz, t.direccion, t.acunar, t.prueba)
      await expect(token.acreditar(acunacion.raiz, t.direccion, t.acunar, t.prueba)).to.be.revertedWithCustomError(token, 'YaAcreditada')
      await expect(token.acreditar(acunacion.raiz, otro.direccion, BigInt(otro.acunar) + 1n, otro.prueba)).to.be.revertedWithCustomError(token, 'PruebaInvalida')
      await expect(token.acreditar(acunacion.raiz, ajeno.address, otro.acunar, otro.prueba)).to.be.revertedWithCustomError(token, 'PruebaInvalida')
      await expect(token.acreditar(ethers.ZeroHash.replace(/0$/, '1'), otro.direccion, otro.acunar, otro.prueba)).to.be.revertedWithCustomError(token, 'RaizNoAbierta')
    })

    it('solo el emisor abre rondas, y no se reabre una con saldo pendiente', async () => {
      const { token, ajeno } = await loadFixture(conMigracionAbierta)
      await expect(token.connect(ajeno).abrirMigracion(acunacion.raiz, 1n, motivo)).to.be.revertedWithCustomError(token, 'AccessControlUnauthorizedAccount')
      await expect(token.abrirMigracion(acunacion.raiz, 1n, motivo)).to.be.revertedWithCustomError(token, 'RaizYaAbierta')
    })

    it('el total abierto pone techo: una raíz abierta por menos no acuña de más', async () => {
      const { token } = await loadFixture(desplegar)
      const t = acunacion.tenedores[0]
      await token.abrirMigracion(acunacion.raiz, BigInt(t.acunar) - 1n, motivo)
      await expect(token.acreditar(acunacion.raiz, t.direccion, t.acunar, t.prueba)).to.be.revertedWithCustomError(token, 'SuperaLoAbierto')
    })

    it('la pausa de emergencia detiene la acreditación', async () => {
      const { token } = await loadFixture(conMigracionAbierta)
      const t = acunacion.tenedores[0]
      await token.pausar()
      await expect(token.acreditar(acunacion.raiz, t.direccion, t.acunar, t.prueba)).to.be.revertedWithCustomError(token, 'EnforcedPause')
      await token.reanudar()
      await token.acreditar(acunacion.raiz, t.direccion, t.acunar, t.prueba)
    })
  })

  describe('transferencias', () => {
    async function acreditados() {
      const d = await conMigracionAbierta()
      const ts = acunacion.tenedores
      await d.token.acreditarLote(acunacion.raiz, ts.map((t) => t.direccion), ts.map((t) => t.acunar), ts.map((t) => t.prueba))
      return d
    }

    it('sin registro, circulan libremente', async () => {
      const { token, a1, a2 } = await loadFixture(acreditados)
      await token.connect(a1).transfer(a2.address, E)
      expect(await token.balanceOf(a2.address)).to.equal(6n * E)
    })

    it('con registro, solo entre direcciones habilitadas por Genesis ID', async () => {
      const { token, registro, multifirma, a1, a2 } = await loadFixture(acreditados)
      await token.fijarRegistro(await registro.getAddress())
      await expect(token.connect(a1).transfer(a2.address, E)).to.be.revertedWithCustomError(token, 'NoElegible')
      await registro.grantRole(await registro.VERIFICADOR_ROLE(), multifirma.address)
      await registro.fijarLote([a1.address, a2.address], HABILITADA, motivo)
      await token.connect(a1).transfer(a2.address, E)
      await registro.fijar(a2.address, BLOQUEADA, motivo)
      await expect(token.connect(a1).transfer(a2.address, E)).to.be.revertedWithCustomError(token, 'NoElegible')
    })

    it('una cuenta suspendida no envía ni recibe, y la pausa detiene todo', async () => {
      const { token, a1, a2 } = await loadFixture(acreditados)
      await token.suspender(a1.address, true, motivo)
      await expect(token.connect(a1).transfer(a2.address, E)).to.be.revertedWithCustomError(token, 'CuentaSuspendidaError')
      await expect(token.connect(a2).transfer(a1.address, E)).to.be.revertedWithCustomError(token, 'CuentaSuspendidaError')
      await token.suspender(a1.address, false, motivo)
      await token.pausar()
      await expect(token.connect(a1).transfer(a2.address, E)).to.be.revertedWithCustomError(token, 'EnforcedPause')
    })

    it('solo los roles emiten y queman, y queda el evento con su motivo', async () => {
      const { token, tesoreria, ajeno, a1 } = await loadFixture(acreditados)
      await expect(token.connect(ajeno).emitir(ajeno.address, E, motivo)).to.be.revertedWithCustomError(token, 'AccessControlUnauthorizedAccount')
      await expect(token.emitir(tesoreria.address, 7n * E, motivo)).to.emit(token, 'EmisionEjecutada').withArgs(tesoreria.address, 7n * E, motivo)
      await expect(token.connect(ajeno).quemar(a1.address, E, motivo)).to.be.revertedWithCustomError(token, 'AccessControlUnauthorizedAccount')
      await expect(token.quemar(a1.address, E, motivo)).to.emit(token, 'QuemaEjecutada')
    })
  })
})
