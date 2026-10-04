// Pruebas del token conforme y del registro de elegibilidad, con un archivo de acuñación
// generado por la plataforma de migración (test/acunacion-ejemplo.json).
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { loadFixture, time } from '@nomicfoundation/hardhat-toolbox/network-helpers'
import acunacion from './acunacion-ejemplo.json'

const E = 10n ** 18n
const motivo = ethers.encodeBytes32String('prueba')
const HABILITADA = 1
const BLOQUEADA = 2

// En la mayoría de las pruebas la misma cuenta hace de firma múltiple de tres (admin) y de dos de tres
// (operativa); el reparto de roles entre las dos se prueba aparte.
async function desplegar() {
  const [multifirma, a1, a2, a3, tesoreria, a5, ajeno, custodio, admin3] = await ethers.getSigners()
  const token = await ethers.deployContract('TokenSFSP', ['Gold Kapital', 'AUKA', 'COM-OG-0001', 'SFSP-300', multifirma.address, multifirma.address, [custodio.address], 0])
  const registro = await ethers.deployContract('RegistroElegibilidad', [multifirma.address])
  return { token, registro, multifirma, a1, a2, a3, tesoreria, a5, ajeno, custodio, admin3 }
}

async function conMigracionAbierta() {
  const d = await desplegar()
  await d.token.abrirMigracion(acunacion.raiz, acunacion.totalAcunar, motivo)
  return d
}

async function acreditadosFix() {
  const d = await conMigracionAbierta()
  const ts = acunacion.tenedores
  await d.token.acreditarLote(acunacion.raiz, ts.map((t) => t.direccion), ts.map((t) => t.acunar), ts.map((t) => t.prueba))
  return d
}

describe('TokenSFSP', () => {
  it('nace con los roles en las firmas múltiples y sin supply', async () => {
    const { token, multifirma, ajeno } = await loadFixture(desplegar)
    expect(await token.totalSupply()).to.equal(0n)
    expect(await token.pasaporte()).to.equal('COM-OG-0001')
    for (const rol of [await token.DEFAULT_ADMIN_ROLE(), await token.EMISOR_ROLE(), await token.SUSPENSION_ROLE(), await token.QUEMA_ROLE()]) {
      expect(await token.hasRole(rol, multifirma.address)).to.equal(true)
      expect(await token.hasRole(rol, ajeno.address)).to.equal(false)
    }
    await expect(ethers.deployContract('TokenSFSP', ['x', 'x', 'x', 'x', ethers.ZeroAddress, multifirma.address, [], 0])).to.be.revertedWithCustomError(token, 'DireccionCero')
    await expect(ethers.deployContract('TokenSFSP', ['x', 'x', 'x', 'x', multifirma.address, ethers.ZeroAddress, [], 0])).to.be.revertedWithCustomError(token, 'DireccionCero')
  })

  it('reparte los roles como §5.3: administración en la de tres, operación en la de dos de tres, pausa en cada custodio', async () => {
    const [operativa, admin3, custodio, otro] = await ethers.getSigners()
    const token = await ethers.deployContract('TokenSFSP', ['x', 'x', 'x', 'SFSP-300', admin3.address, operativa.address, [custodio.address, otro.address], 0])
    expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), admin3.address)).to.equal(true)
    expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), operativa.address)).to.equal(false)
    for (const rol of [await token.EMISOR_ROLE(), await token.SUSPENSION_ROLE(), await token.QUEMA_ROLE()]) {
      expect(await token.hasRole(rol, operativa.address)).to.equal(true)
      expect(await token.hasRole(rol, admin3.address)).to.equal(false)
    }
    expect(await token.hasRole(await token.PAUSA_ROLE(), custodio.address)).to.equal(true)
    expect(await token.hasRole(await token.PAUSA_ROLE(), otro.address)).to.equal(true)
    // La operativa no toca el registro ni los roles: eso es de los tres custodios.
    await expect(token.connect(operativa).fijarRegistro(otro.address)).to.be.revertedWithCustomError(token, 'AccessControlUnauthorizedAccount')
    await token.connect(admin3).fijarRegistro(otro.address)
  })

  describe('pausa de emergencia (§5.3)', () => {
    it('un custodio solo pausa al instante, y vence a las 72 horas si dos custodios no la ratifican', async () => {
      const { token, custodio, a1, a2 } = await loadFixture(acreditadosFix)
      await token.connect(custodio).pausar()
      expect(await token.paused()).to.equal(true)
      await expect(token.connect(a1).transfer(a2.address, E)).to.be.revertedWithCustomError(token, 'EnforcedPause')
      await time.increase(72 * 3600 - 10)
      expect(await token.paused()).to.equal(true)
      await time.increase(20)
      expect(await token.paused()).to.equal(false, 'venció sin ratificar')
      await token.connect(a1).transfer(a2.address, E)
    })

    it('ratificada por la de dos de tres, sigue hasta que la levante', async () => {
      const { token, multifirma, custodio, ajeno } = await loadFixture(acreditadosFix)
      await token.connect(custodio).pausar()
      await expect(token.connect(custodio).ratificarPausa()).to.be.revertedWithCustomError(token, 'AccessControlUnauthorizedAccount')
      await expect(token.connect(multifirma).ratificarPausa()).to.emit(token, 'PausaRatificada')
      await time.increase(30 * 86400)
      expect(await token.paused()).to.equal(true)
      await expect(token.connect(custodio).reanudar()).to.be.revertedWithCustomError(token, 'AccessControlUnauthorizedAccount')
      await token.connect(multifirma).reanudar()
      expect(await token.paused()).to.equal(false)
      await expect(token.connect(ajeno).pausar()).to.be.revertedWithCustomError(token, 'AccessControlUnauthorizedAccount')
    })

    it('desde la firma múltiple de dos de tres nace ratificada', async () => {
      const { token, multifirma } = await loadFixture(acreditadosFix)
      await token.connect(multifirma).pausar()
      expect(await token.pausaRatificada()).to.equal(true)
      await time.increase(5 * 86400)
      expect(await token.paused()).to.equal(true)
    })
  })

  describe('ampliación de supply con demora (security, §5.3)', () => {
    async function security() {
      const [operativa, admin3, beneficiario] = await ethers.getSigners()
      const token = await ethers.deployContract('TokenSFSP', ['Orden Kapital', 'ONDK', 'SEC-OG-0001', 'SFSP-200', admin3.address, operativa.address, [], 7 * 86400])
      return { token, operativa, beneficiario }
    }

    it('sin anunciar no se emite; anunciada, solo pasados siete días y una sola vez', async () => {
      const { token, beneficiario } = await loadFixture(security)
      await expect(token.emitir(beneficiario.address, E, motivo)).to.be.revertedWithCustomError(token, 'EmisionNoAnunciada')
      await expect(token.anunciarEmision(beneficiario.address, E, motivo)).to.emit(token, 'EmisionAnunciada')
      await expect(token.anunciarEmision(beneficiario.address, E, motivo)).to.be.revertedWithCustomError(token, 'EmisionYaAnunciada')
      await time.increase(7 * 86400 - 10)
      await expect(token.emitir(beneficiario.address, E, motivo)).to.be.revertedWithCustomError(token, 'EmisionEnDemora')
      await time.increase(20)
      await expect(token.emitir(beneficiario.address, 2n * E, motivo)).to.be.revertedWithCustomError(token, 'EmisionNoAnunciada')
      await token.emitir(beneficiario.address, E, motivo)
      expect(await token.balanceOf(beneficiario.address)).to.equal(E)
      await expect(token.emitir(beneficiario.address, E, motivo)).to.be.revertedWithCustomError(token, 'EmisionNoAnunciada')
    })

    it('una emisión anunciada se puede cancelar antes de ejecutarla', async () => {
      const { token, beneficiario } = await loadFixture(security)
      await token.anunciarEmision(beneficiario.address, E, motivo)
      await expect(token.cancelarEmision(beneficiario.address, E, motivo)).to.emit(token, 'EmisionCancelada')
      await time.increase(8 * 86400)
      await expect(token.emitir(beneficiario.address, E, motivo)).to.be.revertedWithCustomError(token, 'EmisionNoAnunciada')
    })

    it('una ronda de migración también se anuncia: no hay atajo para acuñar sin la demora', async () => {
      const { token, beneficiario } = await loadFixture(security)
      // El atajo: una «migración» de una sola hoja a cualquier cuenta. Sin anuncio no se abre.
      const hoja = ethers.keccak256(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [beneficiario.address, 1000n * E])))
      await expect(token.abrirMigracion(hoja, 1000n * E, motivo)).to.be.revertedWithCustomError(token, 'EmisionNoAnunciada')
      // La de verdad: se anuncia, y pasados siete días se abre con la misma raíz, total y referencia.
      await expect(token.anunciarMigracion(acunacion.raiz, acunacion.totalAcunar, motivo)).to.emit(token, 'MigracionAnunciada')
      await expect(token.abrirMigracion(acunacion.raiz, acunacion.totalAcunar, motivo)).to.be.revertedWithCustomError(token, 'EmisionEnDemora')
      await time.increase(7 * 86400)
      await expect(token.abrirMigracion(acunacion.raiz, BigInt(acunacion.totalAcunar) + 1n, motivo)).to.be.revertedWithCustomError(token, 'EmisionNoAnunciada')
      await token.abrirMigracion(acunacion.raiz, acunacion.totalAcunar, motivo)
      const t = acunacion.tenedores[0]
      await token.acreditar(acunacion.raiz, t.direccion, t.acunar, t.prueba)
      expect(await token.balanceOf(t.direccion)).to.equal(BigInt(t.acunar))
    })

    it('en una commodity (sin demora) la migración se abre directo', async () => {
      const { token } = await loadFixture(desplegar)
      await token.abrirMigracion(acunacion.raiz, acunacion.totalAcunar, motivo)
      expect(await token.restante(acunacion.raiz)).to.equal(BigInt(acunacion.totalAcunar))
    })
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
