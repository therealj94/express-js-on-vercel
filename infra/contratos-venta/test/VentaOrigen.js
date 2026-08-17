/* VentaOrigen — las pruebas.
 *
 *   npx hardhat test
 *
 * Este contrato cobra dinero de otras personas, así que lo que se persigue
 * aquí no es que la compra feliz funcione —eso lo ve cualquiera la primera
 * vez— sino las cinco formas en que un contrato así hace daño de verdad:
 *
 *   1. Cobrar y no deber nada, o deber de más.
 *   2. Vender ORIGEN que la tesorería no tiene.
 *   3. Vender a un precio que ya no es.
 *   4. Entregarle al comprador menos de lo que aceptó, después de que ya no
 *      puede echarse atrás.
 *   5. Que alguien que no es el dueño toque algo.
 *
 * Y una sexta que no se ve venir: el USDT de Polygon tiene 6 decimales y el de
 * BSC tiene 18. Todo lo aritmético se prueba en las dos.
 */
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

const U = (n) => ethers.parseUnits(String(n), 18);              // ORIGEN y precio
const PRECIO = U('2.558');                                      // el gramín de hoy

async function montar(decimales = 6) {
  const [dueno, operador, tesoreria, ana, beto] = await ethers.getSigners();
  const Usdt = await ethers.getContractFactory('UsdtFalso');
  const usdt = await Usdt.deploy(decimales);
  const Venta = await ethers.getContractFactory('VentaOrigen');
  const venta = await Venta.deploy(usdt.target, tesoreria.address, operador.address);

  const usd = (n) => ethers.parseUnits(String(n), decimales);

  await venta.ponerLimites(usd(10), usd(50000));
  await venta.connect(operador).ponerPrecioYCupo(PRECIO, U(10000));
  await usdt.acunar(ana.address, usd(100000));
  await usdt.connect(ana).approve(venta.target, ethers.MaxUint256);

  return { venta, usdt, usd, dueno, operador, tesoreria, ana, beto, decimales };
}

describe('VentaOrigen', function () {
  describe('la compra, en las dos redes', function () {
    for (const d of [6, 18]) {
      it(`con USDT de ${d} decimales, la cuenta sale y el dinero llega a la tesorería`, async function () {
        const { venta, usdt, usd, tesoreria, ana } = await montar(d);

        // 100 USDT a 2.558 el ORIGEN = 39.093041438... ORIGEN
        const esperado = (100n * 10n ** 18n * 10n ** 18n) / PRECIO;
        expect(await venta.origenPor(usd(100))).to.equal(esperado);

        await expect(venta.connect(ana).comprar(usd(100), ana.address, 0))
          .to.emit(venta, 'Compra')
          .withArgs(1, ana.address, ana.address, usd(100), PRECIO, esperado);

        // El USDT NO se queda en el contrato: pasa de largo.
        expect(await usdt.balanceOf(tesoreria.address)).to.equal(usd(100));
        expect(await usdt.balanceOf(venta.target)).to.equal(0);
      });
    }

    it('la misma plata compra el mismo ORIGEN en las dos redes', async function () {
      // Es la comprobación que caza un decimal escrito a mano: si alguien
      // fijara 6 en el código, en BSC saldría un billón de veces de más.
      const a = await montar(6);
      const b = await montar(18);
      expect(await a.venta.origenPor(a.usd(250))).to.equal(await b.venta.origenPor(b.usd(250)));
    });

    it('el destino puede ser OTRA dirección: quien paga no siempre cobra', async function () {
      const { venta, usd, ana, beto } = await montar();
      await expect(venta.connect(ana).comprar(usd(100), beto.address, 0))
        .to.emit(venta, 'Compra')
        .withArgs(1, ana.address, beto.address, usd(100), PRECIO, await venta.origenPor(usd(100)));
    });

    it('y nunca puede ser la dirección cero: ese ORIGEN no lo cobraría nadie', async function () {
      const { venta, usd, ana } = await montar();
      await expect(venta.connect(ana).comprar(usd(100), ethers.ZeroAddress, 0))
        .to.be.revertedWithCustomError(venta, 'DestinoVacio');
    });
  });

  describe('el cupo: no se vende ORIGEN que no existe', function () {
    it('una compra que pasa del cupo revierte entera', async function () {
      const { venta, usdt, usd, tesoreria, operador, ana } = await montar();
      await venta.connect(operador).ponerCupo(U(10));            // ~25 USD de ORIGEN

      await expect(venta.connect(ana).comprar(usd(100), ana.address, 0))
        .to.be.revertedWithCustomError(venta, 'SinCupo');

      // Y no cobró: el USDT sigue donde estaba. Un revert a medias que se
      // quedara con el dinero es la peor versión de este fallo.
      expect(await usdt.balanceOf(tesoreria.address)).to.equal(0);
      expect(await venta.cupoOrigen()).to.equal(U(10));
    });

    it('el cupo baja exactamente lo vendido, compra a compra', async function () {
      const { venta, usd, ana } = await montar();
      const antes = await venta.cupoOrigen();
      const u1 = await venta.origenPor(usd(100));
      await venta.connect(ana).comprar(usd(100), ana.address, 0);
      expect(await venta.cupoOrigen()).to.equal(antes - u1);
      const u2 = await venta.origenPor(usd(250));
      await venta.connect(ana).comprar(usd(250), ana.address, 0);
      expect(await venta.cupoOrigen()).to.equal(antes - u1 - u2);
    });

    it('con el cupo agotado la venta se cierra sola', async function () {
      const { venta, operador } = await montar();
      await venta.connect(operador).ponerCupo(0);
      expect(await venta.abierta()).to.equal(false);
    });
  });

  describe('el precio caduca', function () {
    it('pasada la antigüedad máxima, deja de vender', async function () {
      const { venta, usd, ana } = await montar();
      await time.increase(31 * 60);
      await expect(venta.connect(ana).comprar(usd(100), ana.address, 0))
        .to.be.revertedWithCustomError(venta, 'PrecioViejo');
      expect(await venta.abierta()).to.equal(false);
    });

    it('y vuelve a abrir en cuanto el operador refresca', async function () {
      const { venta, usd, operador, ana } = await montar();
      await time.increase(31 * 60);
      await venta.connect(operador).ponerPrecio(PRECIO);
      expect(await venta.abierta()).to.equal(true);
      await expect(venta.connect(ana).comprar(usd(100), ana.address, 0)).to.emit(venta, 'Compra');
    });

    it('sin precio puesto no se vende nada', async function () {
      const [dueno, operador, tesoreria, ana] = await ethers.getSigners();
      const usdt = await (await ethers.getContractFactory('UsdtFalso')).deploy(6);
      const venta = await (await ethers.getContractFactory('VentaOrigen'))
        .deploy(usdt.target, tesoreria.address, operador.address);
      await venta.ponerLimites(0, ethers.MaxUint256);
      await venta.connect(operador).ponerCupo(U(1000));
      await usdt.acunar(ana.address, ethers.parseUnits('1000', 6));
      await usdt.connect(ana).approve(venta.target, ethers.MaxUint256);
      await expect(venta.connect(ana).comprar(ethers.parseUnits('100', 6), ana.address, 0))
        .to.be.revertedWithCustomError(venta, 'SinPrecio');
      expect(await venta.origenPor(ethers.parseUnits('100', 6))).to.equal(0);
    });
  });

  describe('el mínimo del comprador', function () {
    it('si el precio se mueve en contra entre firmar y minar, la compra revierte', async function () {
      const { venta, usd, operador, ana } = await montar();
      const prometido = await venta.origenPor(usd(100));

      // El operador sube el precio: por los mismos 100 USDT ahora sale menos.
      await venta.connect(operador).ponerPrecio(U('3.20'));

      await expect(venta.connect(ana).comprar(usd(100), ana.address, prometido))
        .to.be.revertedWithCustomError(venta, 'MenosDeLoAceptado');
    });

    it('si se mueve a favor, la compra pasa y recibe MÁS de lo pedido', async function () {
      const { venta, usd, operador, ana } = await montar();
      const prometido = await venta.origenPor(usd(100));
      await venta.connect(operador).ponerPrecio(U('2.00'));
      await expect(venta.connect(ana).comprar(usd(100), ana.address, prometido)).to.emit(venta, 'Compra');
      expect(await venta.origenPor(usd(100))).to.be.greaterThan(prometido);
    });
  });

  describe('los límites', function () {
    it('por debajo del mínimo y por encima del máximo, no', async function () {
      const { venta, usd, ana } = await montar();
      await expect(venta.connect(ana).comprar(usd(5), ana.address, 0))
        .to.be.revertedWithCustomError(venta, 'FueraDeLimites');
      await expect(venta.connect(ana).comprar(usd(60000), ana.address, 0))
        .to.be.revertedWithCustomError(venta, 'FueraDeLimites');
    });

    it('una compra tan chica que daría cero ORIGEN se rechaza en vez de cobrarla', async function () {
      /* Este borde SOLO existe en BNB Smart Chain, y por eso se prueba con el
         token de 18 decimales. Ahí 1 wei de USDT vale 1e-18 dólares y a 2.558
         el ORIGEN sale 0 por división entera: el contrato cobraría un wei y no
         debería nada. Con los 6 decimales de Polygon la unidad mínima es un
         millonésimo de dólar, que todavía compra 390 millones de wei de
         ORIGEN — el caso no se puede montar y la primera versión de esta
         prueba lo pedía igual. */
      const { venta, usdt, tesoreria, dueno, ana } = await montar(18);
      await venta.connect(dueno).ponerLimites(0, ethers.MaxUint256);
      expect(await venta.origenPor(1n)).to.equal(0);
      await expect(venta.connect(ana).comprar(1n, ana.address, 0))
        .to.be.revertedWithCustomError(venta, 'FueraDeLimites');
      expect(await usdt.balanceOf(tesoreria.address)).to.equal(0);

      // Y en Polygon, la misma unidad mínima SÍ compra algo y se cobra bien.
      const pol = await montar(6);
      await pol.venta.connect(pol.dueno).ponerLimites(0, ethers.MaxUint256);
      expect(await pol.venta.origenPor(1n)).to.be.greaterThan(0);
    });
  });

  describe('la pausa', function () {
    it('pausada no vende, y al despausar vuelve', async function () {
      const { venta, usd, operador, ana } = await montar();
      await venta.connect(operador).pausar(true);
      expect(await venta.abierta()).to.equal(false);
      await expect(venta.connect(ana).comprar(usd(100), ana.address, 0))
        .to.be.revertedWithCustomError(venta, 'Pausada');
      await venta.connect(operador).pausar(false);
      await expect(venta.connect(ana).comprar(usd(100), ana.address, 0)).to.emit(venta, 'Compra');
    });
  });

  describe('quién puede tocar qué', function () {
    it('un cualquiera no toca nada', async function () {
      const { venta, beto } = await montar();
      for (const [f, args] of [
        ['ponerPrecio', [PRECIO]], ['ponerCupo', [U(1)]], ['pausar', [true]],
        ['ponerLimites', [1, 2]], ['ponerOperador', [beto.address]],
        ['proponerDueno', [beto.address]], ['ponerAntiguedadPrecio', [60]],
      ]) {
        await expect(venta.connect(beto)[f](...args)).to.be.revertedWithCustomError(venta, 'NoAutorizado');
      }
    });

    it('el operador NO puede cambiar límites, operador ni dueño', async function () {
      // Es la llave que vive en un servidor. Que solo pueda tocar precio y
      // cupo es lo que hace que filtrarla no sea una catástrofe.
      const { venta, operador, beto } = await montar();
      await expect(venta.connect(operador).ponerLimites(1, 2))
        .to.be.revertedWithCustomError(venta, 'NoAutorizado');
      await expect(venta.connect(operador).ponerOperador(beto.address))
        .to.be.revertedWithCustomError(venta, 'NoAutorizado');
      await expect(venta.connect(operador).proponerDueno(beto.address))
        .to.be.revertedWithCustomError(venta, 'NoAutorizado');
    });

    it('el dueño puede hacer lo del operador: si se pierde la llave caliente un domingo', async function () {
      const { venta, dueno } = await montar();
      await expect(venta.connect(dueno).pausar(true)).to.emit(venta, 'Pausa');
      await expect(venta.connect(dueno).ponerCupo(0)).to.emit(venta, 'CupoPuesto');
    });

    it('el dueño se traspasa en DOS pasos', async function () {
      const { venta, dueno, beto } = await montar();
      await venta.connect(dueno).proponerDueno(beto.address);
      expect(await venta.dueno()).to.equal(dueno.address);      // todavía no
      await expect(venta.connect(dueno).aceptarDueno()).to.be.revertedWithCustomError(venta, 'NoAutorizado');
      await venta.connect(beto).aceptarDueno();
      expect(await venta.dueno()).to.equal(beto.address);
      expect(await venta.duenoPropuesto()).to.equal(ethers.ZeroAddress);
    });

    it('la antigüedad del precio tiene techo y no puede ser cero', async function () {
      const { venta, dueno } = await montar();
      await expect(venta.connect(dueno).ponerAntiguedadPrecio(0))
        .to.be.revertedWithCustomError(venta, 'ValorInvalido');
      await expect(venta.connect(dueno).ponerAntiguedadPrecio(2 * 24 * 3600))
        .to.be.revertedWithCustomError(venta, 'ValorInvalido');
      await expect(venta.connect(dueno).ponerAntiguedadPrecio(3600)).to.emit(venta, 'AntiguedadPuesta');
    });
  });

  describe('LA TESORERÍA NO SE PUEDE CAMBIAR', function () {
    it('no existe ninguna función que la mueva', async function () {
      // Si un día alguien añade un `ponerTesoreria`, esto se cae — y esa es
      // toda la intención. Un setter de tesorería es una llave que redirige
      // TODAS las compras futuras a donde quiera quien se haga con ella.
      const { venta, tesoreria } = await montar();
      const fns = venta.interface.fragments.filter(f => f.type === 'function').map(f => f.name);
      expect(fns.filter(n => /tesorer/i.test(n) && n !== 'tesoreria')).to.deep.equal([]);
      expect(await venta.tesoreria()).to.equal(tesoreria.address);
    });

    it('y el contrato no tiene función de rescate: no custodia nada que rescatar', async function () {
      const { venta } = await montar();
      const fns = venta.interface.fragments.filter(f => f.type === 'function').map(f => f.name);
      expect(fns.filter(n => /rescat|retirar|sacar|withdraw|sweep|barrer/i.test(n))).to.deep.equal([]);
    });
  });

  describe('los USDT que no se portan bien', function () {
    it('el que NO devuelve nada (como el Tether original) funciona igual', async function () {
      const [dueno, operador, tesoreria, ana] = await ethers.getSigners();
      const usdt = await (await ethers.getContractFactory('UsdtMudo')).deploy();
      const venta = await (await ethers.getContractFactory('VentaOrigen'))
        .deploy(usdt.target, tesoreria.address, operador.address);
      await venta.ponerLimites(0, ethers.MaxUint256);
      await venta.connect(operador).ponerPrecioYCupo(PRECIO, U(10000));
      await usdt.acunar(ana.address, ethers.parseUnits('1000', 6));
      await usdt.connect(ana).approve(venta.target, ethers.MaxUint256);

      await expect(venta.connect(ana).comprar(ethers.parseUnits('100', 6), ana.address, 0))
        .to.emit(venta, 'Compra');
      expect(await usdt.balanceOf(tesoreria.address)).to.equal(ethers.parseUnits('100', 6));
    });

    it('el que contesta false NO pasa por bueno', async function () {
      // Tragarse ese false es regalar mercancía sin cobrar.
      const [dueno, operador, tesoreria, ana] = await ethers.getSigners();
      const usdt = await (await ethers.getContractFactory('UsdtMentiroso')).deploy();
      const venta = await (await ethers.getContractFactory('VentaOrigen'))
        .deploy(usdt.target, tesoreria.address, operador.address);
      await venta.ponerLimites(0, ethers.MaxUint256);
      await venta.connect(operador).ponerPrecioYCupo(PRECIO, U(10000));

      await expect(venta.connect(ana).comprar(ethers.parseUnits('100', 6), ana.address, 0))
        .to.be.revertedWithCustomError(venta, 'TransferenciaFallida');
      expect(await venta.cupoOrigen()).to.equal(U(10000));   // el cupo se devolvió con el revert
    });

    it('sin approve suficiente, revierte y no baja el cupo', async function () {
      const { venta, usdt, usd, ana, beto } = await montar();
      await usdt.acunar(beto.address, usd(1000));
      await expect(venta.connect(beto).comprar(usd(100), beto.address, 0)).to.be.reverted;
      expect(await venta.cupoOrigen()).to.equal(U(10000));
    });

    it('un token sin decimals() no se puede desplegar', async function () {
      const [, operador, tesoreria] = await ethers.getSigners();
      const raro = await (await ethers.getContractFactory('SinDecimales')).deploy();
      const Venta = await ethers.getContractFactory('VentaOrigen');
      await expect(Venta.deploy(raro.target, tesoreria.address, operador.address))
        .to.be.revertedWithCustomError(Venta, 'ValorInvalido');
    });

    it('ni con la tesorería o el token en cero', async function () {
      const [, operador, tesoreria] = await ethers.getSigners();
      const usdt = await (await ethers.getContractFactory('UsdtFalso')).deploy(6);
      const Venta = await ethers.getContractFactory('VentaOrigen');
      await expect(Venta.deploy(ethers.ZeroAddress, tesoreria.address, operador.address))
        .to.be.revertedWithCustomError(Venta, 'ValorInvalido');
      await expect(Venta.deploy(usdt.target, ethers.ZeroAddress, operador.address))
        .to.be.revertedWithCustomError(Venta, 'ValorInvalido');
    });
  });

  describe('la aritmética no pierde plata', function () {
    it('lo que suman las compras es lo que bajó el cupo, sin un wei de diferencia', async function () {
      const { venta, usd, ana } = await montar(6);
      const inicio = await venta.cupoOrigen();
      let debido = 0n;
      for (const m of [10, 37, 199, 1234, 50, 777]) {
        debido += await venta.origenPor(usd(m));
        await venta.connect(ana).comprar(usd(m), ana.address, 0);
      }
      expect(inicio - (await venta.cupoOrigen())).to.equal(debido);
    });

    it('el redondeo va SIEMPRE a favor de la casa, nunca en contra', async function () {
      // La división entera trunca. Que trunque hacia abajo significa que el
      // comprador recibe como mucho lo que pagó, jamás un wei de más — y la
      // tesorería nunca queda debiendo un ORIGEN que no vendió.
      const { venta, usd } = await montar(6);
      const m = usd('123.456789');
      const salida = await venta.origenPor(m);
      const enUsd18 = BigInt(m) * 10n ** 12n;
      expect(salida * PRECIO).to.be.lessThanOrEqual(enUsd18 * 10n ** 18n);
    });
  });
});
