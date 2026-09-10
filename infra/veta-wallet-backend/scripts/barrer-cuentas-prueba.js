/* Vacía cuentas de prueba hacia una billetera, y solo eso.
 *
 *   node scripts/barrer-cuentas-prueba.js --cuentas cuentas.txt --destino 0x...
 *   node scripts/barrer-cuentas-prueba.js --cuentas cuentas.txt --destino 0x... --ejecutar
 *
 * SIN `--ejecutar` NO FIRMA NADA. Lee la cadena, calcula qué saldría de dónde
 * y lo imprime. Esa es la forma normal de usarlo; ejecutar es la excepción.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE GUION EXISTE, Y POR QUE DESCONFIA TANTO
 *
 * Mover tokens de la billetera de otra persona es la operación más peligrosa
 * que tiene este sistema: hace falta descifrar su llave privada, no se deshace,
 * y desde el panel una cuenta de prueba y una billetera de emisión se ven
 * EXACTAMENTE IGUAL — 1 ORIGEN y muchos tokens.
 *
 * Medido el 20-ago en la cadena 5550: de 331 cuentas, 60 tienen tokens. Entre
 * ellas hay cuatro que guardan casi la emisión completa de cinco monedas:
 *
 *   0xb710f64d…   IBS 499.000.000 · MNKA 99.999.983 · AUBEX 99.995.000
 *   0x7ac19672…   AGKA 499.999.998
 *   0xa1fccbde…   ONDK 16.650.000
 *   0x3409f79c…   AUKA 14.898.995
 *
 * Un criterio del tipo «tiene saldo raro, será de prueba» barrería la emisión
 * de cinco monedas de una sentada. Por eso el guion NO decide qué es una cuenta
 * de prueba: solo obedece una lista escrita a mano, y aun así se planta si lo
 * que encuentra dentro es demasiado grande.
 *
 * LO QUE NO HACE
 *   - No borra cuentas. Eso es otra puerta, y tiene su propia guardia.
 *   - No mueve ORIGEN. El nativo se queda para gasolina, y barrerlo dejaría la
 *     cuenta sin poder hacer nada nunca más.
 *   - No imprime ninguna llave privada, ni entera ni en trozos.
 * ────────────────────────────────────────────────────────────────────────── */

const mongoose = require("mongoose");
const { ethers } = require("ethers");
require("dotenv").config();

const { descifrar, esLlavePrivada } = require("../lib/cripto");

// ── Los parámetros ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const ARCHIVO  = flag("--cuentas");
const DESTINO  = flag("--destino");
const EJECUTAR = args.includes("--ejecutar");
const RPC      = process.env.RPC_URL || "https://rpc.ordenglobal-rpc.com";
const CADENA   = Number(process.env.CHAIN_ID || 5550);

/* EL TOPE, y de dónde sale el número.
 *
 * No es un redondo elegido a ojo: sale del hueco que hay en los datos reales.
 * Ordenadas las 60 cuentas con tokens de la 5550 por su mayor tenencia
 * (medido el 20-ago):
 *
 *      499.999.998   AGKA      ┐
 *      499.000.000   IBS       │
 *       16.650.000   ONDK      ├─ emisión: la moneda entera
 *       14.898.995   AUKA      │
 *        9.539.990   ONDK      ┘
 *          999.988   IBS       ┐  ambiguas: demasiado para una prueba
 *          900.000   ONDK      ┘
 *   ─────────────────────────────  ← salto de 9x
 *           99.996   ONDK      ┐
 *           66.150   ONDK      ├─ cantidades de prueba
 *              ...            ┘
 *
 * El tope va en 200.000: por encima del mayor saldo de prueba visto y por
 * debajo del menor saldo ambiguo. Un primer intento lo puso en 1.000.000 y
 * dejaba pasar la de 999.988 por doce unidades — un tope que roza un saldo real
 * no es un tope, es una casualidad.
 *
 * Y conviene decirlo claro: ESTO NO ES EL CRITERIO. Lo que decide qué se barre
 * es la lista escrita a mano. Este freno solo existe para que un error de dedo
 * en esa lista choque contra algo antes de llevarse la emisión de una moneda. */
const TOPE_POR_MONEDA = Number(process.env.TOPE_BARRIDO || 200_000);

const TOKENS = {
  ONDK:      "0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1",
  AUKA:      "0x6Facc8Df79cEDc6C5065442ce27e915Aa3a26B9B",
  AGKA:      "0x961f798f998c7Ff44D47d62C7FA1B572eF187a4B",
  MNKA:      "0x18b6680CFF71c11067bec312Fc48786bE2e54Ead",
  AUBEX:     "0xF1498640B27A66C0DC505093D70911C060e04fb0",
  IBS:       "0x7AF11D3E94A174f6fc290A5B7791A6DEE2718E62",
  HARV:      "0x0fa04D11F28B28cbC9b98dd016F02023AdDb1923",
  AGRO:      "0x2A31ba919A5339fCB0F8aEeFfCE2c807B16007fe",
  AIT:       "0xAE14Db486872AC07d74Ad69cC09590239b21BA2e",
  ASL:       "0x69846aC960D45F9946C613DFCe1b761D37Faf098",
  REST:      "0x1aC12Ebd7739003059d1E9EA2a4863C92D1505DD",
  SOL:       "0xAAc6aE2E2037fC2e94d0b060792E7eB4E5fBfa66",
  LOVE:      "0x638F2ba0e3E1083D1ba570b449BD266F3860D164",
  POLITICAL: "0x92496E1848e001428A3495409a9A9f616bB6dD3B",
};
const ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
];

const fmt = (v, d = 18) => Number(ethers.formatUnits(v, d)).toLocaleString("es", { maximumFractionDigits: 6 });

async function main() {
  if (!ARCHIVO || !DESTINO) {
    console.error("Uso: --cuentas <archivo> --destino <0x...> [--ejecutar]");
    console.error("El archivo lleva un correo o una dirección por línea. Lo que empiece por # se ignora.");
    process.exit(1);
  }
  if (!ethers.isAddress(DESTINO)) {
    console.error("El destino no es una dirección válida."); process.exit(1);
  }

  const proveedor = new ethers.JsonRpcProvider(RPC);

  /* LA PUERTA. Antes de nada se comprueba contra qué cadena se está hablando.
     Firmar una transferencia contra la cadena equivocada con las llaves buenas
     es la peor forma de perder dinero: la firma es válida y el destino existe
     en las dos. */
  const red = await proveedor.getNetwork();
  if (Number(red.chainId) !== CADENA) {
    console.error(`ABORTADO: el nodo responde la cadena ${red.chainId} y se esperaba la ${CADENA}.`);
    process.exit(1);
  }
  console.log(`Cadena ${red.chainId} · destino ${DESTINO}`);
  console.log(EJECUTAR ? "\n*** MODO EJECUTAR: esto FIRMA y NO se deshace ***\n"
                       : "\n— prueba en seco: no se firma nada —\n");

  const fs = require("fs");
  const lineas = fs.readFileSync(ARCHIVO, "utf8").split("\n")
    .map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (!lineas.length) { console.error("El archivo está vacío."); process.exit(1); }

  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  const Users = mongoose.connection.collection("users");

  let movimientos = 0, frenadas = 0;
  for (const linea of lineas) {
    const filtro = linea.includes("@")
      ? { email: linea.toLowerCase() }
      : { address: new RegExp(`^${linea}$`, "i") };
    const u = await Users.findOne(filtro);
    if (!u) { console.log(`✗ ${linea}: no hay ninguna cuenta así`); continue; }
    if (!u.address) { console.log(`✗ ${linea}: la cuenta no tiene billetera`); continue; }
    if (u.address.toLowerCase() === DESTINO.toLowerCase()) {
      console.log(`— ${linea}: ES el destino, se salta`); continue;
    }
    if (u.role === "admin") { console.log(`✗ ${linea}: es administrador, no se toca`); continue; }

    console.log(`\n${u.email}  ${u.address}`);

    // Qué tiene, leído de la cadena y no de la base.
    const tiene = [];
    for (const [sim, contrato] of Object.entries(TOKENS)) {
      const c = new ethers.Contract(contrato, ABI, proveedor);
      let saldo;
      try { saldo = await c.balanceOf(u.address); } catch { continue; }
      if (saldo > 0n) tiene.push({ sim, contrato, saldo });
    }
    const nativo = await proveedor.getBalance(u.address);
    console.log(`   ORIGEN ${fmt(nativo)} (se queda: es la gasolina)`);
    if (!tiene.length) { console.log("   sin tokens, nada que mover"); continue; }

    // EL FRENO. Antes de mover, comprobar que no es una billetera de emisión.
    const grandes = tiene.filter((t) => Number(ethers.formatUnits(t.saldo, 18)) > TOPE_POR_MONEDA);
    if (grandes.length) {
      console.log(`   ⛔ FRENADA: ${grandes.map((g) => `${g.sim} ${fmt(g.saldo)}`).join(", ")}`);
      console.log(`      Supera el tope de ${TOPE_POR_MONEDA.toLocaleString("es")} por moneda.`);
      console.log("      Una cuenta de prueba no tiene esto. Comprobá que no es una billetera de emisión.");
      frenadas++; continue;
    }

    for (const t of tiene) console.log(`   ${t.sim} ${fmt(t.saldo)}  →  ${DESTINO}`);

    if (!EJECUTAR) { movimientos += tiene.length; continue; }

    // ── Ejecutar de verdad ────────────────────────────────────────────────
    const llave = descifrar(u.privateKey, esLlavePrivada);
    if (!llave) { console.log("   ✗ no se pudo descifrar la llave; se salta"); continue; }
    const firmante = new ethers.Wallet(llave, proveedor);
    if (firmante.address.toLowerCase() !== u.address.toLowerCase()) {
      // Si la llave no corresponde a la dirección, algo está muy mal y no se
      // sigue: firmar con la llave de otra persona es exactamente el desastre
      // que este guion tiene que evitar.
      console.log("   ✗ la llave no corresponde a esta dirección; se salta");
      continue;
    }
    for (const t of tiene) {
      try {
        const c = new ethers.Contract(t.contrato, ABI, firmante);
        const tx = await c.transfer(DESTINO, t.saldo);
        const r = await tx.wait();
        console.log(`   ✓ ${t.sim}: ${r.hash}`);
        movimientos++;
      } catch (e) {
        console.log(`   ✗ ${t.sim}: ${String(e.message).slice(0, 120)}`);
      }
    }
  }

  console.log(`\n${EJECUTAR ? "movidos" : "se moverían"}: ${movimientos} traspasos · frenadas: ${frenadas}`);
  if (!EJECUTAR) console.log("Para hacerlo de verdad, repetí el comando con --ejecutar");
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
