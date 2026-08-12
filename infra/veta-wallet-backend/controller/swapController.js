/**
 * swapController.js
 * POST /cards/fund
 *
 * Funds the user's virtual Visa card using Orden Global (OG / ORIGEN) tokens.
 *
 * Architecture — "Internal Bridge" model:
 * ─────────────────────────────────────────────────────────────────
 *  1. User's custodial wallet (OG chain 8532) sends ORIGEN (native) to
 *     VetaWallet treasury address on the Orden Global chain.
 *  2. Backend calculates USD value using live gold price:
 *       ORIGEN price = (PAXG_oz_price / 31.1035) / 55
 *  3. VetaWallet treasury wallet on Polygon sends the equivalent USDT (PoS)
 *     to the CryptoMate individual top-up wallet for the user's card.
 *  4. CryptoMate credits the card's available_credit automatically.
 *
 * Why not 1inch / DEX swap?
 *   Orden Global (chain_id 8532) is a private chain. No public DEX supports it.
 *   VetaWallet operates the liquidity bridge internally via its own treasury.
 *
 * Required env vars:
 *   TREASURY_OG_ADDRESS          ← receives ORIGEN from users (OG chain)
 *   TREASURY_POLYGON_PRIVATE_KEY ← private key of Polygon wallet holding USDT (PoS)
 *   POLYGON_CHAIN_PROVIDER       ← Polygon RPC (default: https://polygon-rpc.com)
 *   CRYPTOMATE_API_KEY           ← CryptoMate API key
 *
 * Body params:
 *   amount    (string)  Amount of ORIGEN tokens to swap, e.g. "5"
 *   password  (string)  User's wallet password (to decrypt and sign OG transfer)
 */

import axios from "axios";
import jwt from "jsonwebtoken";
import CryptoJS from "crypto-js";
import { descifrarLlavePrivada } from "../lib/cripto";
import bcrypt from "bcrypt";
import { ethers } from "ethers";
import Users from "../models/Users";
import Card from "../models/Card";
import CardFunding from "../models/CardFunding";
import OrigenBalance from "../models/OrigenBalance";
import { getOrigenPriceUsd } from "../lib/origenPrice";
import { precioDeGas } from "../lib/gas";

// ─── USDT on Polygon (PoS) ────────────────────────────────────────────────────
const USDT_POLYGON  = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const USDT_DECIMALS = 6; // Polygon USDT = 6 decimals

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

// OG chain RPC — same as ico-back (networks.ts)
const OG_RPC = process.env.OG_CHAIN_PROVIDER || "https://www.ordenglobal-rpc.com";

// ─── Helper: send ORIGEN (native) from user wallet → treasury (OG chain) ─────
// No esperamos confirmación (tx.wait) para evitar timeout de 30s de Heroku.
// Retornamos el tx inmediatamente después del broadcast.
async function sendOrigenToTreasury({ provider, decryptedKey, treasuryAddress, amountWei }) {
  const wallet   = new ethers.Wallet(decryptedKey, provider);

  // getTransactionCount con timeout de 8s
  const nonce = await Promise.race([
    provider.getTransactionCount(wallet.address, "latest"),
    new Promise((_, reject) => setTimeout(() => reject(new Error("OG chain nonce timeout")), 8000)),
  ]);

  // Eran 2000 gwei fijos, 21,5 veces el precio acordado, heredados de ico-back.
  const gasPrice = await precioDeGas(provider);

  // sendTransaction con timeout de 15s
  const tx = await Promise.race([
    wallet.sendTransaction({
      to:       treasuryAddress,
      value:    amountWei,
      gasLimit: BigInt(21000),
      gasPrice,
      nonce,
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("OG chain send timeout")), 15000)),
  ]);

  // Retornamos sin esperar minado — el hash es prueba suficiente del broadcast
  return tx;
}

// ─── Helper: treasury Polygon wallet sends USDT → CryptoMate card top-up ─────
async function sendUSDTFromTreasury({ usdtAmountWei, toAddress }) {
  const polygonProvider = new ethers.JsonRpcProvider(
    process.env.POLYGON_CHAIN_PROVIDER || "https://polygon-rpc.com"
  );

  const treasuryWallet  = new ethers.Wallet(process.env.TREASURY_POLYGON_PRIVATE_KEY, polygonProvider);
  const usdtContract    = new ethers.Contract(USDT_POLYGON, ERC20_ABI, treasuryWallet);

  // Safety check
  const balance = await usdtContract.balanceOf(treasuryWallet.address);
  if (balance < usdtAmountWei) {
    throw new Error(
      `Treasury USDT insufficient. Has ${ethers.formatUnits(balance, USDT_DECIMALS)}, needs ${ethers.formatUnits(usdtAmountWei, USDT_DECIMALS)}`
    );
  }

  const tx = await usdtContract.transfer(toAddress, usdtAmountWei);
  return tx.wait();
}

// ─── Constantes de seguridad ──────────────────────────────────────────────────
const MIN_ORIGEN_AMOUNT = 0.0001;   // mínimo técnico
const MAX_ORIGEN_AMOUNT = 10000;    // límite por transacción (anti-drain)
const MIN_USD_VALUE     = 10;       // mínimo $10 USD — requerido por CryptoMate
const MAX_USD_VALUE     = 5000;     // máximo $5000 USD por fondeo

// ─── Main controller ──────────────────────────────────────────────────────────
export const fundCard = async (req, res) => {
  try {
    // 1. Authenticate
    const tokenHeader = req.headers.authorization;
    const decoded     = jwt.verify(tokenHeader.split(" ")[1], process.env.PASS_TOKEN, { algorithm: "HS256" });
    const user        = await Users.findById(decoded.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // 2. Verificar KYC aprobado — solo usuarios verificados pueden fondear
    if (user.kycStatus !== "approved") {
      return res.status(403).json({ message: "KYC verification required to fund your card" });
    }

    // 3. Verify card exists y está activa
    const card = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (!card) return res.status(404).json({ message: "No active card. Request a card first." });
    if (card.status === "FROZEN") return res.status(403).json({ message: "Card is frozen. Unfreeze it first." });
    if (card.status === "BLOCKED") return res.status(403).json({ message: "Card is blocked. Contact support." });

    // 4. Validar y sanitizar inputs
    const { amount, password } = req.body;

    if (!amount || !password) {
      return res.status(400).json({ message: "amount and password are required" });
    }
    if (typeof amount !== "string" && typeof amount !== "number") {
      return res.status(400).json({ message: "Invalid amount format" });
    }
    if (typeof password !== "string") {
      return res.status(400).json({ message: "Invalid password format" });
    }

    // Parsear y validar amount numéricamente
    const ogAmount = parseFloat(String(amount).trim());
    if (isNaN(ogAmount) || !isFinite(ogAmount)) {
      return res.status(400).json({ message: "amount must be a valid number" });
    }
    if (ogAmount <= 0) {
      return res.status(400).json({ message: "amount must be greater than 0" });
    }
    if (ogAmount < MIN_ORIGEN_AMOUNT) {
      return res.status(400).json({ message: `Minimum amount is ${MIN_ORIGEN_AMOUNT} ORIGEN` });
    }
    if (ogAmount > MAX_ORIGEN_AMOUNT) {
      return res.status(400).json({ message: `Maximum amount per transaction is ${MAX_ORIGEN_AMOUNT} ORIGEN` });
    }

    // 5. Check required env vars
    const requiredEnv = ["TREASURY_OG_ADDRESS", "TREASURY_POLYGON_PRIVATE_KEY"];
    const missing     = requiredEnv.filter((k) => !process.env[k]);
    if (missing.length > 0) {
      return res.status(500).json({ message: `Missing env vars: ${missing.join(", ")}` });
    }

    // 6. Verify password and decrypt user private key
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return res.status(401).json({ message: "Incorrect password" });

    const decryptedKey = descifrarLlavePrivada(user.privateKey);
    if (!decryptedKey || !decryptedKey.startsWith("0x")) {
      return res.status(500).json({ message: "Could not decrypt wallet key" });
    }

    // 7. Connect to Orden Global chain
    const ogProvider = new ethers.JsonRpcProvider(OG_RPC);

    // 8. Calculate amounts using live gold price (same formula as ico-back)
    const origenPriceUsd = await getOrigenPriceUsd();
    const usdValue       = ogAmount * origenPriceUsd;

    if (usdValue < MIN_USD_VALUE) {
      return res.status(400).json({
        message: `Minimum fund amount is $${MIN_USD_VALUE} USD. ${ogAmount} ORIGEN = $${usdValue.toFixed(4)} USD`,
        origenPrice: origenPriceUsd,
      });
    }
    if (usdValue > MAX_USD_VALUE) {
      return res.status(400).json({
        message: `Maximum fund amount per transaction is $${MAX_USD_VALUE} USD. ${ogAmount} ORIGEN = $${usdValue.toFixed(2)} USD`,
        origenPrice: origenPriceUsd,
      });
    }

    const ogAmountWei   = ethers.parseEther(ogAmount.toString());
    const usdtAmountWei = ethers.parseUnits(usdValue.toFixed(6), USDT_DECIMALS);

    // 8. Resolver depositAddress ANTES de debitar al usuario
    //    TOP_UP → wallet individual de la tarjeta en Polygon (CryptoMate)
    //    Si no está cacheada, la obtenemos ahora. Si falla, abortamos con error
    //    antes de tocar los fondos del usuario.
    let depositAddress = card.topUpAddress;

    if (!depositAddress) {
      const { data: topUpData } = await axios.get(
        `https://api.cryptomate.me/cards/virtual-cards/${card.cryptomateCardId}/top-up`,
        { headers: { "x-api-key": process.env.CRYPTOMATE_API_KEY } }
      ).catch(() => ({ data: [] }));

      const polygonWallet = Array.isArray(topUpData)
        ? topUpData.find((w) => w.blockchain === "POLYGON") || topUpData[0]
        : null;

      if (!polygonWallet?.address) {
        return res.status(503).json({
          message: "No se pudo obtener la wallet de fondeo de la tarjeta. Intenta de nuevo en unos segundos.",
        });
      }

      depositAddress       = polygonWallet.address;
      card.topUpAddress    = depositAddress;
      card.topUpBlockchain = polygonWallet.blockchain || "POLYGON";
      card.topUpTokens = (Array.isArray(polygonWallet.tokens) ? polygonWallet.tokens.map(t => t.symbol || t) : ["USDT", "USDC"]);
      await card.save();
    }

    // ── Candado: un fondeo sin terminar por usuario ──────────────────────────
    // El indice unico de CardFunding lo garantiza a nivel de base, pero se
    // comprueba antes para devolver un mensaje util en vez de un error de
    // clave duplicada.
    const enCurso = await CardFunding.findOne({
      userId: user._id,
      status: { $in: ["pending", "debited"] },
    });
    if (enCurso) {
      return res.status(409).json({
        code: "FUNDING_IN_PROGRESS",
        message: "Ya tienes una recarga en proceso",
        fundingId: enCurso._id,
        status: enCurso.status,
      });
    }

    // ── STEP A: cobrar el ORIGEN ─────────────────────────────────────────────
    //
    // Primero se intenta con el saldo comprado (el que se acredita al
    // depositar USDT). Ese saldo vive en nuestra base, asi que cobrarlo es un
    // decremento atomico: no hay transaccion que firmar, ni gas, ni espera de
    // minado. Es el camino mas simple y el que menos puede salir mal.
    //
    // El $gte dentro del filtro es el candado: si dos peticiones entran a la
    // vez, solo una encuentra saldo suficiente y la otra recibe null.
    const debitoInterno = await OrigenBalance.findOneAndUpdate(
      { userId: user._id, origen: { $gte: ogAmount } },
      { $inc: { origen: -ogAmount } },
      { new: true }
    );

    if (debitoInterno) {
      // Nace en 'debited': no hay nada que confirmar, el cobro ya ocurrio.
      let fundingInterno;
      try {
        fundingInterno = await CardFunding.create({
          userId: user._id,
          cardId: card.cryptomateCardId,
          origenAmount: ogAmount,
          usdValue,
          origenPriceUsd,
          usdtAmountWei: usdtAmountWei.toString(),
          depositAddress,
          source: "internal",
          status: "debited",
          ogConfirmedAt: new Date(),
        });
      } catch (e) {
        // Choque con el indice unico. Se devuelve el ORIGEN antes de salir:
        // se cobro y no se va a usar.
        await OrigenBalance.updateOne({ userId: user._id }, { $inc: { origen: ogAmount } });
        return res.status(409).json({
          code: "FUNDING_IN_PROGRESS",
          message: "Ya tienes una recarga en proceso",
        });
      }

      const resInterno = await liquidarFondeo(fundingInterno);
      return res.json(respuestaFondeo(resInterno, { ogAmount, usdValue, origenPriceUsd }));
    }

    // Sin saldo comprado suficiente: se cobra en la cadena, firmando con la
    // clave del usuario. No se mezclan las dos fuentes en una misma recarga —
    // si una mitad falla habria que devolver la otra, y ese camino tiene mas
    // formas de salir mal que de salir bien.
    const ogTx = await sendOrigenToTreasury({
      provider:        ogProvider,
      decryptedKey,
      treasuryAddress: process.env.TREASURY_OG_ADDRESS,
      amountWei:       ogAmountWei,
    });

    // Se registra ANTES de intentar confirmar: si el dyno muere aca, el
    // fondeo queda anotado y /cards/fund/status lo retoma. Sin este registro
    // el debito quedaba emitido y nadie sabia que faltaba liberar el USDT.
    let funding;
    try {
      funding = await CardFunding.create({
        userId: user._id,
        cardId: card.cryptomateCardId,
        origenAmount: ogAmount,
        usdValue,
        origenPriceUsd,
        usdtAmountWei: usdtAmountWei.toString(),
        ogTxHash: ogTx.hash,
        depositAddress,
        status: "pending",
      });
    } catch (e) {
      // Choque con el indice unico: otra peticion entro en paralelo.
      return res.status(409).json({
        code: "FUNDING_IN_PROGRESS",
        message: "Ya tienes una recarga en proceso",
      });
    }

    // ── STEP B: confirmar el debito y recien entonces liberar el USDT ────────
    // Antes se liberaba sin esperar: si la transaccion del usuario no entraba
    // al bloque, el treasury pagaba igual. Ahora se espera con un limite, y si
    // Heroku esta por cortar se devuelve "en proceso" y la app consulta el
    // estado; el USDT sale cuando el debito este confirmado, nunca antes.
    const resultado = await liquidarFondeo(funding, ogTx);

    return res.json(respuestaFondeo(resultado, { ogAmount, usdValue, origenPriceUsd }));
  } catch (error) {
    const detail = error?.response?.data || error.message;
    console.error("Fund card error:", detail);
    res.status(500).json({ message: "Error funding card", detail });
  }
};

// ============================================================
// Liquidacion de un fondeo, en dos pasos separados y con memoria.
// ============================================================

// Cuanto se espera la confirmacion dentro de la peticion. Heroku corta a los
// 30 s, asi que se deja margen para responder algo util antes de que lo haga.
const ESPERA_CONFIRMACION_MS = 18000;

/**
 * Confirma el debito de ORIGEN y, solo si esta minado, libera el USDT.
 * Es idempotente: `usdtReleasedAt` sella el pago y ningun reintento vuelve a
 * mover fondos del treasury.
 */
async function liquidarFondeo(funding, ogTxOpcional) {
  const ogProvider = new ethers.JsonRpcProvider(OG_RPC);

  // ── Paso 1: ¿el usuario ya pago? ──────────────────────────────────────────
  if (funding.status === "pending") {
    let receipt = null;
    try {
      if (ogTxOpcional?.wait) {
        // Esperar el minado, pero sin pasarse del limite del dyno.
        receipt = await Promise.race([
          ogTxOpcional.wait(),
          new Promise((r) => setTimeout(() => r(null), ESPERA_CONFIRMACION_MS)),
        ]);
      } else {
        receipt = await ogProvider.getTransactionReceipt(funding.ogTxHash);
      }
    } catch (e) {
      receipt = null;
    }

    if (!receipt) {
      // Todavia sin minar. No se libera nada; la app consultara el estado.
      return funding;
    }
    if (receipt.status !== 1) {
      // La transaccion entro pero fallo: el usuario NO pago, no se libera nada.
      funding.status = "failed";
      funding.error = "El pago en ORIGEN no se completo";
      await funding.save();
      return funding;
    }

    funding.status = "debited";
    funding.ogConfirmedAt = new Date();
    await funding.save();
  }

  // ── Paso 2: liberar el USDT, una sola vez ─────────────────────────────────
  if (funding.status === "debited" && !funding.usdtReleasedAt) {
    // Marca de intencion antes de mover fondos: si el proceso muere entre el
    // envio y el guardado, el sello ya esta puesto y un reintento no paga dos
    // veces. Es preferible investigar un pago que quedo sin registrar a
    // pagarlo dos veces.
    funding.usdtReleasedAt = new Date();
    await funding.save();

    try {
      const recibo = await sendUSDTFromTreasury({
        usdtAmountWei: BigInt(funding.usdtAmountWei),
        toAddress: funding.depositAddress,
      });
      funding.usdtTxHash = recibo.hash;
      funding.status = "funded";
      await funding.save();
    } catch (e) {
      // El debito si se cobro, asi que esto NO se marca como failed: hay que
      // revisarlo a mano. Se libera el sello para poder reintentar.
      funding.usdtReleasedAt = null;
      funding.error = `No se pudo liberar el USDT: ${e.message}`;
      await funding.save();
      throw e;
    }
  }

  return funding;
}

/** Forma unica de respuesta, para que la app no tenga que adivinar. */
function respuestaFondeo(f, extra = {}) {
  const listo = f.status === "funded";
  return {
    fundingId: f._id,
    status: f.status,
    listo,
    // Siempre en ORIGEN: es la unidad en la que el usuario piensa.
    origenAmount: f.origenAmount,
    // El equivalente se envia aparte, para mostrarlo como referencia.
    usdValue: f.usdValue,
    origenPriceUsd: f.origenPriceUsd,
    ogTxHash: f.ogTxHash,
    usdtTxHash: f.usdtTxHash || null,
    error: f.error || null,
    ...extra,
  };
}

/**
 * GET /cards/fund/status — retoma el fondeo pendiente del usuario.
 *
 * La app lo consulta mientras la recarga esta en curso. Cada llamada intenta
 * avanzar la maquina de estados: confirmar el debito si falta, liberar el USDT
 * si el debito ya esta confirmado.
 */
export const fundStatus = async (req, res) => {
  try {
    const tokenHeader = req.headers.authorization;
    const decoded = jwt.verify(tokenHeader.split(" ")[1], process.env.PASS_TOKEN, { algorithm: "HS256" });
    const user = await Users.findById(decoded.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const funding = await CardFunding.findOne({ userId: user._id }).sort({ createdAt: -1 });
    if (!funding) return res.status(404).json({ code: "NO_FUNDING", message: "Sin recargas" });

    // Solo se intenta avanzar lo que sigue abierto.
    if (funding.status === "pending" || funding.status === "debited") {
      try {
        await liquidarFondeo(funding);
      } catch (e) {
        // El detalle ya quedo en funding.error; se devuelve el estado igual.
        console.error("fundStatus liquidacion:", e.message);
      }
    }

    res.json(respuestaFondeo(funding));
  } catch (error) {
    console.error("fundStatus error:", error.message);
    res.status(500).json({ message: "Error consultando la recarga" });
  }
};
