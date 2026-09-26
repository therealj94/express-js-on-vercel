/* SFSP-410 · CONCILIACION DEL ORIGEN INTERNO. SOLO LECTURA.
 *
 *   CONCILIAR_MONGODB_URI=... node scripts/conciliar-origen-interno.js [--json] [--con-cadena] [--limite N]
 *   (o con npx babel-node, igual)
 *
 * QUE ES
 *
 * Hasta hoy, un deposito de USDT en Veta sube un saldo de ORIGEN que vive
 * SOLO en Mongo (OrigenBalance.origen): no hay ORIGEN en la cadena detras.
 * SFSP-410 dice que el circulante es lo que tienen los usuarios EN CADENA, asi
 * que antes de encender SFSP410_EMISION hay que saber cuanto ORIGEN "de base de
 * datos" se le debe a quien (paso 2 de la transicion, SFSP-410 §7). Esto lo
 * lista. No lo liquida: liquidarlo es una decision (releaseOnDemand o release
 * con orden de gobierno por usuario) y se hace aparte, con acta.
 *
 * Por usuario con saldo interno > 0 dice:
 *   userId, address          — NADA MAS de la persona (ni correo ni nombre)
 *   origenInterno            — OrigenBalance.origen: lo que no tiene contrapartida en cadena
 *   depositosLegado          — suma de Deposit.origenAmount SIN entrega SFSP-410
 *   gastadoTarjeta           — suma de CardFunding internos (source=internal, no fallidos)
 *   diferencia               — depositosLegado − gastadoTarjeta − origenInterno
 *                              (≠ 0 → el saldo no cuadra con su historial: mirarlo)
 *   origenEnCadena           — con --con-cadena: saldo nativo de address en la 5550
 *                              (INFORMATIVO: no es la contrapartida, puede venir de otro sitio)
 *
 * QUE NO HACE, NUNCA
 *
 *   · No escribe: sin modo de escritura. Solo find/aggregate de lectura, con
 *     autoIndex y autoCreate apagados (conectar no crea ni indices).
 *   · No imprime la URI de la base ni ningun secreto; no lee .env.
 *   · No firma ni envia nada a ninguna cadena (--con-cadena solo lee saldos).
 *
 * Se recomienda un usuario de Mongo con rol de SOLO LECTURA para esto.
 */

import mongoose from "mongoose";
import { JsonRpcProvider, formatEther, getAddress } from "ethers";

const args = process.argv.slice(2);
const opcion = (n) => args.includes(n);
const valor = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const AYUDA = `Uso: CONCILIAR_MONGODB_URI=... node scripts/conciliar-origen-interno.js [--json] [--con-cadena] [--limite N]
  Solo lectura. Lista los usuarios con saldo ORIGEN interno (Mongo) sin contrapartida en cadena.
  --json        salida JSON en vez de tabla
  --con-cadena  lee tambien el saldo nativo en la 5550 (SFSP410_RPC u OG_CHAIN_PROVIDER)
  --limite N    como mucho N usuarios (por omision, todos)`;

const CONOCIDAS = new Set(["--json", "--con-cadena", "--limite", "--ayuda", "-h", "--help"]);

function salir(codigo, mensaje) {
  if (mensaje) console.error(mensaje);
  process.exit(codigo);
}

async function main() {
  if (opcion("--ayuda") || opcion("-h") || opcion("--help")) salir(0, AYUDA);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--limite") { i++; continue; }
    if (!CONOCIDAS.has(a)) {
      salir(2, `Opcion desconocida: ${a}. Este script es de SOLO LECTURA y no tiene modo de escritura.\n${AYUDA}`);
    }
  }
  const limite = Number(valor("--limite", 0)) || 0;

  const uri = process.env.CONCILIAR_MONGODB_URI || process.env.MONGODB_URI;
  if (!uri) {
    salir(2, "Falta CONCILIAR_MONGODB_URI (o MONGODB_URI). Pedile al responsable un acceso de SOLO LECTURA.");
  }

  console.error("[conciliar] MODO: solo lectura. No se escribe nada en la base ni en la cadena.");
  if (process.env.SFSP410_EMISION === "1") {
    console.error("[conciliar] AVISO: SFSP410_EMISION=1 en este entorno. Estos saldos tenian que estar liquidados ANTES de encenderlo.");
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, {
    autoIndex: false,
    autoCreate: false,
    readPreference: "secondaryPreferred",
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;

  const EPS = 1e-12;
  let cursor = db.collection("origenbalances")
    .find({ origen: { $gt: EPS } }, { projection: { userId: 1, origen: 1 } })
    .sort({ origen: -1 });
  if (limite > 0) cursor = cursor.limit(limite);
  const saldos = await cursor.toArray();

  // Los depositos que YA fueron por SFSP-410 no subieron el saldo interno:
  // no cuentan en su historial.
  const conEntrega = new Set(
    (await db.collection("sfsp410Entregas").find({}, { projection: { depositId: 1 } }).toArray())
      .map((e) => String(e.depositId))
  );

  let proveedor = null;
  if (opcion("--con-cadena")) {
    const rpc = process.env.SFSP410_RPC || process.env.OG_CHAIN_PROVIDER || "https://rpc.ordenglobal-rpc.com";
    proveedor = new JsonRpcProvider(rpc);
  }

  const filas = [];
  let totalInterno = 0;
  for (const s of saldos) {
    const u = await db.collection("users").findOne({ _id: s.userId }, { projection: { address: 1 } });
    const deps = await db.collection("deposits")
      .find({ userId: s.userId }, { projection: { _id: 1, origenAmount: 1 } }).toArray();
    const depositosLegado = deps
      .filter((d) => !conEntrega.has(String(d._id)))
      .reduce((a, d) => a + (Number(d.origenAmount) || 0), 0);
    const fondeos = await db.collection("cardfundings")
      .find({ userId: s.userId, source: "internal", status: { $ne: "failed" } }, { projection: { origenAmount: 1 } })
      .toArray();
    const gastadoTarjeta = fondeos.reduce((a, f) => a + (Number(f.origenAmount) || 0), 0);
    const diferencia = depositosLegado - gastadoTarjeta - s.origen;

    let address = u?.address || null;
    try { if (address) address = getAddress(address); } catch { /* se deja como esta */ }

    const fila = {
      userId: String(s.userId),
      address,
      origenInterno: s.origen,
      depositosLegado,
      gastadoTarjeta,
      diferencia: Math.abs(diferencia) < 1e-9 ? 0 : diferencia,
    };
    if (proveedor && address) {
      try {
        fila.origenEnCadena = Number(formatEther(await proveedor.getBalance(address)));
      } catch {
        fila.origenEnCadena = null; // no se pudo leer: no se inventa un cero
      }
    }
    totalInterno += s.origen;
    filas.push(fila);
  }

  const resumen = {
    usuarios: filas.length,
    origenInternoSinContrapartida: totalInterno,
    noCuadran: filas.filter((f) => f.diferencia !== 0).length,
    sinDireccion: filas.filter((f) => !f.address).length,
  };

  if (opcion("--json")) {
    console.log(JSON.stringify({ resumen, filas }, null, 2));
  } else {
    const cols = ["userId", "address", "origenInterno", "depositosLegado", "gastadoTarjeta", "diferencia"];
    if (proveedor) cols.push("origenEnCadena");
    console.log(cols.join("\t"));
    for (const f of filas) console.log(cols.map((c) => (f[c] === undefined || f[c] === null ? "-" : f[c])).join("\t"));
    console.log("");
    console.log(`usuarios con ORIGEN interno sin contrapartida en cadena: ${resumen.usuarios}`);
    console.log(`total ORIGEN interno a liquidar antes de encender SFSP410_EMISION: ${resumen.origenInternoSinContrapartida}`);
    console.log(`saldos que no cuadran con su historial: ${resumen.noCuadran}`);
    console.log(`usuarios sin direccion (no se les puede liberar en cadena): ${resumen.sinDireccion}`);
  }

  await mongoose.disconnect();
}

main().catch(async (e) => {
  // El mensaje puede traer la URI si el driver la cita: se recorta.
  const m = String(e?.message || e).replace(/mongodb(\+srv)?:\/\/[^\s]+/g, "mongodb://<oculto>");
  console.error(`[conciliar] fallo: ${m}`);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
