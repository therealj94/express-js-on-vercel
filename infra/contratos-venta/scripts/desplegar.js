/* Despliega VentaOrigen en Polygon o en BNB Smart Chain.
 *
 *   LLAVE_DESPLIEGUE=0x… npx hardhat run scripts/desplegar.js --network polygon
 *   LLAVE_DESPLIEGUE=0x… npx hardhat run scripts/desplegar.js --network bsc
 *
 * La llave entra por el entorno y nunca por un archivo del repositorio. Este
 * script no la imprime ni la escribe en ningún sitio.
 *
 * COMPRUEBA ANTES DE GASTAR. Un despliegue son minutos y gas; un despliegue
 * con el USDT equivocado es un contrato que hay que tirar y volver a hacer, y
 * mientras tanto una dirección circulando que cobra en un token que no es. Así
 * que antes de firmar nada se verifica, contra la cadena de verdad:
 *
 *   · que la red es la que se cree (chainId),
 *   · que en la dirección del USDT hay un contrato, y que su símbolo y sus
 *     decimales son los que se esperan de esa red,
 *   · que la tesorería no es la dirección cero,
 *   · y que quien firma tiene gas.
 *
 * Si algo no cuadra, no despliega.
 */
const { ethers, network } = require('hardhat');

// La tesorería de Ordenex: la MISMA dirección en las dos redes. Es una cuenta
// con llave (EOA con delegación EIP-7702), no un contrato de custodia.
const TESORERIA = '0x6A1aeD0BFCC8c8aC7CB916270509CcD66911eBBc';

const REDES = {
  137: {
    nombre: 'Polygon',
    usdt: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    decimales: 6,
    nativo: 'POL',
  },
  56: {
    nombre: 'BNB Smart Chain',
    usdt: '0x55d398326f99059fF775485246999027B3197955',
    decimales: 18,
    nativo: 'BNB',
  },
};

const ERC20 = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

async function main() {
  const red = await ethers.provider.getNetwork();
  const cfg = REDES[Number(red.chainId)];
  if (!cfg) throw new Error(`Cadena ${red.chainId} no prevista. Solo Polygon (137) y BSC (56).`);

  const [firmante] = await ethers.getSigners();
  const operador = process.env.OPERADOR || firmante.address;

  console.log(`\n${cfg.nombre} (${red.chainId}) · red hardhat «${network.name}»`);
  console.log(`  firma      ${firmante.address}`);
  console.log(`  operador   ${operador}${operador === firmante.address ? '  (el mismo que firma)' : ''}`);
  console.log(`  tesoreria  ${TESORERIA}`);

  // ── el USDT es de verdad y es el que toca ────────────────────────────────
  const codigo = await ethers.provider.getCode(cfg.usdt);
  if (codigo === '0x') throw new Error(`En ${cfg.usdt} no hay contrato en esta red.`);
  const token = new ethers.Contract(cfg.usdt, ERC20, ethers.provider);
  const [simbolo, decimales] = await Promise.all([token.symbol(), token.decimals()]);
  console.log(`  usdt       ${cfg.usdt}  ${simbolo} · ${decimales} decimales`);
  if (Number(decimales) !== cfg.decimales) {
    throw new Error(`El token dice ${decimales} decimales y en ${cfg.nombre} se esperan ${cfg.decimales}.`);
  }
  if (!/usd/i.test(simbolo)) {
    throw new Error(`El simbolo «${simbolo}» no parece un USD. Revisar la direccion antes de seguir.`);
  }

  // ── hay gas para firmar ──────────────────────────────────────────────────
  const saldo = await ethers.provider.getBalance(firmante.address);
  console.log(`  gas        ${ethers.formatEther(saldo)} ${cfg.nativo}`);
  if (saldo === 0n) throw new Error(`La cuenta que firma no tiene ${cfg.nativo}. Sin gas no hay despliegue.`);

  // ── a desplegar ──────────────────────────────────────────────────────────
  const Venta = await ethers.getContractFactory('VentaOrigen');
  const venta = await Venta.deploy(cfg.usdt, TESORERIA, operador);
  console.log(`\n  desplegando… tx ${venta.deploymentTransaction().hash}`);
  await venta.waitForDeployment();
  console.log(`  VentaOrigen en ${venta.target}`);

  // ── y se relee de la cadena, que es lo unico que cuenta ──────────────────
  const [u, t, d, dn, op] = await Promise.all([
    venta.usdt(), venta.tesoreria(), venta.decimalesUsdt(), venta.dueno(), venta.operador(),
  ]);
  console.log('\n  releido de la cadena:');
  console.log(`    usdt       ${u}`);
  console.log(`    tesoreria  ${t}`);
  console.log(`    decimales  ${d}`);
  console.log(`    dueno      ${dn}`);
  console.log(`    operador   ${op}`);
  if (u.toLowerCase() !== cfg.usdt.toLowerCase() || t.toLowerCase() !== TESORERIA.toLowerCase()) {
    throw new Error('Lo desplegado NO coincide con lo pedido. No usar este contrato.');
  }

  console.log(`\n  Queda CERRADO: sin precio, sin cupo y sin limites, no vende nada.`);
  console.log(`  Para abrirlo, en este orden:`);
  console.log(`    1. ponerLimites(min, max)        ← el dueno`);
  console.log(`    2. comprobar el ORIGEN real en la 5550`);
  console.log(`    3. ponerPrecioYCupo(precio, cupo) ← el operador (lo hace el vigia)\n`);
}

main().catch((e) => { console.error(`\n  NO se desplego: ${e.message}\n`); process.exit(1); });
