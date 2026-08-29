/**
 * depositController.js
 *
 * Pasarela de entrada: el usuario deposita USDT en Polygon y recibe ORIGEN.
 *
 * Es el sentido inverso de swapController (ORIGEN -> USDT para la tarjeta),
 * pero NO es su espejo exacto, y la diferencia importa:
 *
 *   - Al fondear la tarjeta se mueve ORIGEN on-chain de verdad, porque el
 *     usuario lo tiene y lo puede firmar.
 *   - Aqui el ORIGEN acreditado es un saldo interno nuestro. El treasury de
 *     Orden Global hoy solo tiene direccion (TREASURY_OG_ADDRESS), no clave
 *     privada, asi que el backend no puede emitir ORIGEN on-chain aunque
 *     quisiera. Cuando eso exista, este saldo se emite y se apaga esta ruta.
 *
 * El USDT depositado se queda en la propia direccion del usuario en Polygon.
 * No se barre al treasury: barrer cuesta gas en POL que el usuario no tiene,
 * y quieto queda atribuido a quien lo mando.
 *
 * Deteccion sin watcher: se compara el saldo USDT on-chain contra la marca de
 * agua de lo ya acreditado. La diferencia es lo nuevo. Releer da el mismo
 * resultado, asi que llamarlo de mas no acredita de mas.
 */

// Las sesiones se firman y se verifican a traves de lib/sesion.js, que
// entiende el secreto nuevo y el anterior mientras dura la rotacion de
// PASS_TOKEN. Las llamadas jwt.verify(...) y jwt.sign(...) no cambian.
import jwt from "../lib/sesion";
import { ethers } from "ethers";
import { proveedorPolygon } from "../lib/polygon";
import Users from "../models/Users";
import OrigenBalance from "../models/OrigenBalance";
import Deposit from "../models/Deposit";
import { getOrigenPriceUsd } from "../lib/origenPrice";

// ─── USDT en Polygon (PoS) ────────────────────────────────────────────────────
const USDT_POLYGON = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const USDT_DECIMALS = 6;

const ERC20_ABI = ["function balanceOf(address owner) view returns (uint256)"];

// Debajo de esto no se acredita: es polvo, y cada acreditacion escribe una
// fila de historial. En unidades minimas = $0.50.
const MIN_DEPOSITO_WEI = 500000n;

const RED = "POLYGON";
const TOKEN = "USDT";

// Varios proveedores por orden, y el que responda se recuerda un rato. Antes
// habia uno con un respaldo escrito a mano que llevaba muerto: cuando los dos
// se cayeron a la vez, esto reintentaba en bucle sin decirselo a nadie.
// Ver lib/polygon.js.
async function polygonProvider() {
  return proveedorPolygon();
}

// ─── usuario del token ────────────────────────────────────────────────────────
async function usuarioDeLaPeticion(req) {
  const header = req.headers.authorization;
  if (!header) return null;
  const decoded = jwt.verify(header.split(" ")[1], process.env.PASS_TOKEN, {
    algorithms: ["HS256"],
  });
  return Users.findOne({ _id: decoded.userId });
}

// Devuelve el documento de saldo, creandolo vacio la primera vez.
async function saldoDe(userId) {
  let saldo = await OrigenBalance.findOne({ userId });
  if (!saldo) {
    // upsert y no create: dos peticiones simultaneas de un usuario nuevo
    // chocarian contra el indice unico si ambas intentaran crear.
    saldo = await OrigenBalance.findOneAndUpdate(
      { userId },
      { $setOnInsert: { origen: 0, creditedUsdtWei: "0" } },
      { upsert: true, new: true }
    );
  }
  return saldo;
}

function respuestaSaldo(saldo, precio) {
  const origen = saldo?.origen || 0;
  return {
    origen,
    usdValue: precio ? origen * precio : null,
    origenPriceUsd: precio || null,
    creditedUsdt: Number(ethers.formatUnits(saldo?.creditedUsdtWei || "0", USDT_DECIMALS)),
  };
}

// ============================================================
// Revisa la cadena y acredita lo que haya entrado.
//
// Devuelve { saldo, acreditado } donde `acreditado` es el deposito nuevo o
// null si no habia nada. Se usa desde el endpoint y desde depositInfo, para
// que abrir la pantalla ya detecte sin pedir otra llamada.
// ============================================================
async function revisarYAcreditar(user) {
  const saldo = await saldoDe(user._id);

  let enCadenaWei;
  try {
    const contrato = new ethers.Contract(USDT_POLYGON, ERC20_ABI, await polygonProvider());
    enCadenaWei = await Promise.race([
      contrato.balanceOf(user.address),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("Polygon balanceOf timeout")), 12000)
      ),
    ]);
  } catch (e) {
    // Sin lectura de la cadena no se inventa nada: se devuelve el saldo tal
    // como esta y el usuario reintenta. Nunca se acredita a ciegas.
    console.warn("[deposit] no se pudo leer el saldo USDT:", e.message);
    return { saldo, acreditado: null, sinRed: true };
  }

  const yaAcreditadoWei = BigInt(saldo.creditedUsdtWei || "0");
  const nuevoWei = BigInt(enCadenaWei) - yaAcreditadoWei;

  // Negativo significa que el USDT salio de la direccion despues de haberse
  // acreditado. El saldo ORIGEN ya emitido no se toca —el usuario lo compro—
  // pero se baja la marca de agua para no re-acreditar si vuelve a entrar.
  if (nuevoWei < 0n) {
    await OrigenBalance.updateOne(
      { _id: saldo._id },
      { $set: { creditedUsdtWei: BigInt(enCadenaWei).toString(), lastCheckedAt: new Date() } }
    );
    console.warn(
      `[deposit] saldo USDT bajo para ${user._id}: marca de agua ajustada a ${enCadenaWei}`
    );
    return { saldo: await OrigenBalance.findById(saldo._id), acreditado: null };
  }

  if (nuevoWei < MIN_DEPOSITO_WEI) {
    await OrigenBalance.updateOne({ _id: saldo._id }, { $set: { lastCheckedAt: new Date() } });
    return { saldo, acreditado: null };
  }

  const precio = await getOrigenPriceUsd();
  if (!precio || precio <= 0) throw new Error("No se pudo obtener el precio de ORIGEN");

  const usdtAmount = Number(ethers.formatUnits(nuevoWei, USDT_DECIMALS));
  const origenAmount = usdtAmount / precio;

  // ---- el candado ----
  // Se avanza la marca de agua condicionando a que siga siendo la que leimos.
  // Si otra peticion acredito en el medio, el filtro no encuentra nada y esta
  // se retira sin escribir. Es la unica forma de que dos llamadas simultaneas
  // no acrediten el mismo deposito dos veces.
  const desde = saldo.creditedUsdtWei || "0";
  const hasta = BigInt(enCadenaWei).toString();

  const actualizado = await OrigenBalance.findOneAndUpdate(
    { _id: saldo._id, creditedUsdtWei: desde },
    {
      $set: { creditedUsdtWei: hasta, lastCheckedAt: new Date() },
      $inc: { origen: origenAmount },
    },
    { new: true }
  );

  if (!actualizado) {
    // Otra peticion gano la carrera. Su acreditacion es la buena.
    return { saldo: await OrigenBalance.findById(saldo._id), acreditado: null };
  }

  const registro = await Deposit.create({
    userId: user._id,
    address: user.address,
    network: RED,
    token: TOKEN,
    usdtWei: nuevoWei.toString(),
    usdtAmount,
    origenAmount,
    origenPriceUsd: precio,
    fromWei: desde,
    toWei: hasta,
  });

  console.log(
    `[deposit] ${user._id}: +${usdtAmount} USDT -> ${origenAmount} ORIGEN @ ${precio}`
  );

  return { saldo: actualizado, acreditado: registro, precio };
}

// ============================================================
// GET /wallet/deposit-info
// Todo lo que la pantalla de deposito necesita, y de paso revisa la cadena.
// ============================================================
export const depositInfo = async (req, res) => {
  try {
    const user = await usuarioDeLaPeticion(req);
    if (!user) return res.status(401).json({ message: "Usuario no encontrado" });

    const [{ saldo, acreditado, sinRed }, precio] = await Promise.all([
      revisarYAcreditar(user).catch((e) => {
        console.error("[deposit-info] fallo la revision:", e.message);
        return { saldo: null, acreditado: null, sinRed: true };
      }),
      getOrigenPriceUsd().catch(() => null),
    ]);

    const saldoFinal = saldo || (await saldoDe(user._id));

    res.json({
      address: user.address,
      network: RED,
      networkName: "Polygon (PoS)",
      tokens: [TOKEN],
      contract: USDT_POLYGON,
      minUsd: Number(ethers.formatUnits(MIN_DEPOSITO_WEI, USDT_DECIMALS)),
      sinRed: !!sinRed,
      ...respuestaSaldo(saldoFinal, precio),
      acreditado: acreditado
        ? {
            usdtAmount: acreditado.usdtAmount,
            origenAmount: acreditado.origenAmount,
            origenPriceUsd: acreditado.origenPriceUsd,
            at: acreditado.createdAt,
          }
        : null,
    });
  } catch (error) {
    console.error("[deposit-info]", error);
    res.status(500).json({ message: "Error obteniendo la información de depósito" });
  }
};

// ============================================================
// POST /wallet/deposit/check
// Fuerza una revision. Es lo que sondea la pantalla mientras espera.
// ============================================================
export const checkDeposit = async (req, res) => {
  try {
    const user = await usuarioDeLaPeticion(req);
    if (!user) return res.status(401).json({ message: "Usuario no encontrado" });

    const { saldo, acreditado, precio, sinRed } = await revisarYAcreditar(user);
    const precioFinal = precio || (await getOrigenPriceUsd().catch(() => null));

    res.json({
      sinRed: !!sinRed,
      ...respuestaSaldo(saldo, precioFinal),
      acreditado: acreditado
        ? {
            usdtAmount: acreditado.usdtAmount,
            origenAmount: acreditado.origenAmount,
            origenPriceUsd: acreditado.origenPriceUsd,
            at: acreditado.createdAt,
          }
        : null,
    });
  } catch (error) {
    console.error("[deposit-check]", error);
    res.status(500).json({ message: "Error revisando el depósito" });
  }
};

// ============================================================
// GET /wallet/origen-balance
// El saldo interno solo. Barato: no toca la cadena.
// ============================================================
export const origenBalance = async (req, res) => {
  try {
    const user = await usuarioDeLaPeticion(req);
    if (!user) return res.status(401).json({ message: "Usuario no encontrado" });

    const [saldo, precio] = await Promise.all([
      saldoDe(user._id),
      getOrigenPriceUsd().catch(() => null),
    ]);

    res.json(respuestaSaldo(saldo, precio));
  } catch (error) {
    console.error("[origen-balance]", error);
    res.status(500).json({ message: "Error obteniendo el saldo" });
  }
};

// ============================================================
// GET /wallet/deposits
// Historial de acreditaciones, lo mas reciente primero.
// ============================================================
export const listDeposits = async (req, res) => {
  try {
    const user = await usuarioDeLaPeticion(req);
    if (!user) return res.status(401).json({ message: "Usuario no encontrado" });

    const limite = Math.min(parseInt(req.query.limit, 10) || 25, 100);
    const filas = await Deposit.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(limite)
      .lean();

    res.json(
      filas.map((d) => ({
        id: String(d._id),
        usdtAmount: d.usdtAmount,
        origenAmount: d.origenAmount,
        origenPriceUsd: d.origenPriceUsd,
        network: d.network,
        token: d.token,
        at: d.createdAt,
      }))
    );
  } catch (error) {
    console.error("[deposits]", error);
    res.status(500).json({ message: "Error obteniendo el historial" });
  }
};
