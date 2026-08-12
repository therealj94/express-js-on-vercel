import axios from "axios";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import Users from "../models/Users";
import Card from "../models/Card";
import CardEvent from "../models/CardEvent";
import { getOrigenPriceUsd } from "../lib/origenPrice";

const CRYPTOMATE_BASE_URL = "https://api.cryptomate.me";

// Cliente axios preconfigurado para CryptoMate
const cryptomateClient = axios.create({
  baseURL: CRYPTOMATE_BASE_URL,
  headers: {
    "x-api-key": process.env.CRYPTOMATE_API_KEY,
    "Content-Type": "application/json",
  },
});

// CryptoMate responde NOT_FOUND tanto cuando un recurso no existe como cuando
// simplemente esta vacio: una tarjeta sin consumos, un PIN sin asignar. Para
// las lecturas eso NO es un fallo del servidor y devolverlo como 500 manda a
// buscar una averia que no existe (paso con el PIN y con el estado de cuenta).
function esNoEncontrado(error) {
  return error?.response?.data?.code === "NOT_FOUND" || error?.response?.status === 404;
}

// Extrae el usuario autenticado del JWT y lo retorna
async function getAuthUser(req) {
  const token = req.headers.authorization;
  const decoded = jwt.verify(token.split(" ")[1], process.env.PASS_TOKEN, {
    algorithm: "HS256",
  });
  return Users.findById(decoded.userId);
}

// POST /cards/request
// Emite la tarjeta Visa virtual enterprise directamente (sin crear cliente en CryptoMate).
// La cuenta usa enterprise_cards con approval_method: "NONE".
// Requiere KYC aprobado.
export const requestCard = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.kycStatus !== "approved") {
      return res.status(403).json({
        message: "KYC verification required before requesting a card",
        kycStatus: user.kycStatus,
      });
    }

    // Verificar que no tenga ya una tarjeta activa
    const existingCard = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (existingCard) {
      return res.status(400).json({
        message: "User already has an active card",
        cardId: existingCard.cryptomateCardId,
      });
    }

    // Verificar aceptación de T&C
    const { acceptedTerms, phone_country_code, phone_number } = req.body;
    if (!acceptedTerms) {
      return res.status(400).json({ message: "Must accept terms and conditions" });
    }
    user.acceptedCardTermsAt = new Date();
    await user.save();
    if (phone_country_code) user.phone_country_code = phone_country_code;
    if (phone_number) user.phone_number = String(phone_number);
    await user.save(); // guardar teléfono actualizado

    const finalPhone_cc = Number(user.phone_country_code) || 57;
    const finalPhone = String(user.phone_number || "");

    if (!user.name) throw new Error("User name is required — update your profile first");
    if (!finalPhone) throw new Error("Phone number is required — update your profile first");

    // Crear la tarjeta Visa virtual enterprise (sin paso de cliente CryptoMate)
    const cardPayload = {
      card_holder_name: user.name.slice(0, 27), // CryptoMate: máx 27 caracteres
      email: user.email,
      approval_method: "TOPUP",
      phone_country_code: finalPhone_cc, // integer, requerido
      phone: finalPhone,    // string sin código de país, requerido
      daily_limit: req.body.daily_limit || 1000,
      weekly_limit: req.body.weekly_limit || 5000,
      monthly_limit: req.body.monthly_limit || 20000,
    };

    console.log("Creating card with payload:", JSON.stringify(cardPayload));

    const { data: cardData } = await cryptomateClient.post(
      "/cards/virtual-cards/create",
      cardPayload
    );

    // Guardar la tarjeta en la base de datos
    const newCard = new Card({
      userId: user._id,
      cryptomateCardId: cardData.id,
      cardHolderName: cardData.card_holder_name,
      last4: cardData.last4,
      status: cardData.status,
      approvalMethod: cardData.approval_method,
      dailyLimit: cardData.daily_limit,
      weeklyLimit: cardData.weekly_limit,
      monthlyLimit: cardData.monthly_limit,
    });
    await newCard.save();

    // Sincronizar teléfono OTP (3DS SMS) explícitamente
    try {
      await cryptomateClient.put(
        `/cards/virtual-cards/${cardData.id}/phone`,
        { phone_country_code: finalPhone_cc, phone: finalPhone }
      );
      console.log(`[requestCard] OTP phone set: +${finalPhone_cc}${finalPhone}`);
    } catch (phoneErr) {
      // No crítico — el teléfono ya se pasó en el payload de creación
      console.warn("[requestCard] OTP phone update failed:", phoneErr?.response?.data || phoneErr.message);
    }

    // Email de confirmación al usuario
    try {
      const transporter = nodemailer.createTransport({
        service: "Outlook",
        auth: {
          user: process.env.OUTLOOK_USER,
          pass: process.env.OUTLOOK_PASS,
        },
      });
      await transporter.sendMail({
        from: process.env.OUTLOOK_USER,
        to: user.email,
        subject: "¡Tu tarjeta Visa VetaWallet está lista! 🎉",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1a1a2e">
            <h1 style="color:#4c7db3">¡Bienvenido, ${cardData.card_holder_name}!</h1>
            <p>Tu tarjeta Visa virtual ha sido emitida exitosamente.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
              <tr><td style="padding:8px;color:#666">Tarjeta</td><td style="padding:8px;font-weight:bold">Visa •••• ${cardData.last4}</td></tr>
              <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Titular</td><td style="padding:8px">${cardData.card_holder_name}</td></tr>
              <tr><td style="padding:8px;color:#666">Límite diario</td><td style="padding:8px">${cardData.daily_limit} ORIGEN</td></tr>
              <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Límite mensual</td><td style="padding:8px">${cardData.monthly_limit} ORIGEN</td></tr>
            </table>
            <p><b>Próximo paso:</b> Fondea tu tarjeta con ORIGEN desde la app para comenzar a usarla en millones de comercios Visa worldwide.</p>
            <p style="color:#999;font-size:12px">Si no solicitaste esta tarjeta, contáctanos inmediatamente a Ordenkapital@outlook.com</p>
            <p style="color:#999;font-size:12px">— Equipo VetaWallet</p>
          </div>
        `,
      });
    } catch (emailErr) {
      // No crítico — la tarjeta ya fue emitida
      console.warn("Confirmation email failed:", emailErr.message);
    }

    res.status(201).json({
      message: "Virtual card issued successfully",
      card: {
        id: cardData.id,
        cardHolderName: cardData.card_holder_name,
        last4: cardData.last4,
        status: cardData.status,
        approvalMethod: cardData.approval_method,
        dailyLimit: cardData.daily_limit,
        weeklyLimit: cardData.weekly_limit,
        monthlyLimit: cardData.monthly_limit,
      },
    });
  } catch (error) {
    // Log completo para diagnóstico — incluyendo todos los campos del error de CryptoMate
    const cmError = error?.response?.data;
    console.error("Request card error:", JSON.stringify(cmError || error.message));
    // Extraer mensaje legible de CryptoMate (evitar que el frontend reciba [object Object])
    const readableDetail = cmError
      ? (cmError.message || cmError.detail || cmError.code || JSON.stringify(cmError))
      : error.message;
    res.status(500).json({
      message: readableDetail || "Error issuing card",
      detail: cmError || error.message,
    });
  }
};

// GET /cards/my-card
// Retorna los datos de la tarjeta del usuario autenticado
export const getMyCard = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const card = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (!card) return res.status(404).json({ message: "No active card found" });

    // Obtener estado actualizado desde CryptoMate
    const { data } = await cryptomateClient.get(
      `/cards/virtual-cards/${card.cryptomateCardId}`
    );

    // Sincronizar estado local
    if (card.status !== data.status) {
      card.status = data.status;
      await card.save();
    }

    // Obtener available_credit + precio ORIGEN en paralelo
    let availableCredit = null;
    let ogTokenPrice = parseFloat(process.env.OG_TOKEN_PRICE_USD) || 1;

    const [balanceResult, priceResult] = await Promise.allSettled([
      cryptomateClient.get(`/cards/virtual-cards/${card.cryptomateCardId}/virtual-balances`),
      getOrigenPriceUsd(),
    ]);

    if (balanceResult.status === "fulfilled") {
      const rawBalance = balanceResult.value.data;
      console.log("[getMyCard] virtual-balances raw:", JSON.stringify(rawBalance));
      availableCredit = rawBalance?.available_credit ?? null;
    } else {
      console.error("[getMyCard] virtual-balances FAILED:", balanceResult.reason?.response?.data || balanceResult.reason?.message);
    }
    if (priceResult.status === "fulfilled") {
      ogTokenPrice = priceResult.value;
    }

    // Convertir saldo de USD → ORIGEN
    const availableOrigen = availableCredit != null ? availableCredit / ogTokenPrice : null;

    res.json({
      id: data.id,
      cardHolderName: data.card_holder_name,
      last4: data.last4,
      status: data.status,
      approvalMethod: data.approval_method,
      // Límites internos en USD — convertidos a ORIGEN para mostrar al usuario
      dailyLimit: data.daily_limit ? data.daily_limit / ogTokenPrice : null,
      weeklyLimit: data.weekly_limit ? data.weekly_limit / ogTokenPrice : null,
      monthlyLimit: data.monthly_limit ? data.monthly_limit / ogTokenPrice : null,
      // Saldo en ORIGEN (jamás mostrar USD/USDT al usuario)
      availableOrigen,
      ogTokenPrice,
      // Telefono de los codigos 3DS y estrategia configurada. La app no tiene
      // estos datos por su cuenta: el JWT no los lleva y el modelo local de
      // cuenta no los guarda, asi que sin devolverlos aca la pantalla de
      // ajustes mostraba "sin telefono" aunque estuviera bien guardado.
      otpPhoneCountryCode: user.phone_country_code ?? null,
      otpPhone: user.phone_number || null,
      threeDsType: card.threeDsType || null,
      threeDsSetAt: card.threeDsSetAt || null,
      // Wallet de fondeo (interno — no se muestra al usuario directamente)
      topUpAddress: card.topUpAddress || null,
      topUpBlockchain: card.topUpBlockchain || "POLYGON",
      topUpTokens: card.topUpTokens || ["USDT", "USDC"],
    });
  } catch (error) {
    console.error("Get card error:", error?.response?.data || error.message);
    res.status(500).json({ message: "Error fetching card" });
  }
};

// POST /cards/pan
// Requiere password del usuario para retornar datos de tarjeta.
// Intenta parsear el HTML de CryptoMate server-side para devolver datos crudos (pan, cvv, expiry).
// Si el parseo falla, devuelve el panUrl para que el frontend use iframe como fallback.
export const getCardPan = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Verificar contraseña antes de exponer datos sensibles
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: "Password required" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Incorrect password" });

    const card = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (!card) return res.status(404).json({ message: "No active card found" });

    const { data } = await cryptomateClient.get(
      `/cards/virtual-cards/${card.cryptomateCardId}/pan-html`
    );

    const panUrl = data.url;

    // ── Intentar parsear el HTML server-side para obtener datos crudos ────────
    // CryptoMate sirve PAN en HTML por PCI DSS, pero podemos fetchearlo desde
    // nuestro backend y extraer los valores para poblar nuestro diseño de tarjeta.
    try {
      const htmlRes = await axios.get(panUrl, {
        timeout: 8000,
        headers: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (compatible; VetaWallet/1.0)",
        },
      });

      const html = htmlRes.data;

      // Los valores están en <span id="pan-value">, <span id="expiry-value">, <span id="cvv-value">
      const panMatch = html.match(/id=["']pan-value["'][^>]*>\s*([^<]+?)\s*</);
      const expiryMatch = html.match(/id=["']expiry-value["'][^>]*>\s*([^<]+?)\s*</);
      const cvvMatch = html.match(/id=["']cvv-value["'][^>]*>\s*([^<]+?)\s*</);

      if (panMatch && expiryMatch) {
        const pan = panMatch[1].trim();
        const expiry = expiryMatch[1].trim();
        const cvv = cvvMatch?.[1]?.trim() || null;
        console.log(`PAN parsed OK for card ${card.cryptomateCardId}`);
        return res.json({ pan, cvv, expiry, panUrl });
      }

      console.warn("PAN HTML: no se encontraron los spans de valor. HTML inesperado.");
    } catch (parseErr) {
      console.warn("PAN HTML fetch/parse failed:", parseErr.message, "— returning URL fallback");
    }

    // Fallback: devolver URL para que el frontend use iframe
    res.json({ panUrl });
  } catch (error) {
    // Mismo caso que en el PIN: si el emisor dice que el recurso no existe,
    // es un estado del producto, no una caída del servidor.
    if (esNoEncontrado(error)) {
      return res.status(409).json({
        code: "PAN_UNAVAILABLE",
        message: "No se pueden mostrar los datos de esta tarjeta",
      });
    }
    console.error("Get PAN error:", error?.response?.data || error.message);
    res.status(500).json({ message: "Error fetching card PAN" });
  }
};

// GET /cards/top-up-wallets
// TOP_UP model: cada tarjeta tiene su propia wallet de depósito individual en Polygon.
// El usuario deposita USDT/USDC ahí → CryptoMate acredita available_credit de esa tarjeta.
// La dirección se cachea en el modelo Card para evitar llamadas repetidas.
export const getTopUpWallets = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const card = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (!card) return res.status(404).json({ message: "No active card found" });

    // Fetch desde CryptoMate (siempre fresco — la dirección puede rotar)
    let topUpData = [];
    try {
      const resp = await cryptomateClient.get(
        `/cards/virtual-cards/${card.cryptomateCardId}/top-up`
      );
      topUpData = resp.data;
    } catch (err) {
      // Sin wallets de fondeo asignadas todavia: lista vacia, no un 500.
      if (!esNoEncontrado(err)) throw err;
      topUpData = [];
    }

    // topUpData es un array de wallets por blockchain
    const wallets = (topUpData || []).map((w) => ({
      blockchain: w.blockchain,
      address: w.address,
      tokens: w.tokens || [],
    }));

    // Cachear la dirección Polygon (primera del array) en el modelo
    const polygonWallet = topUpData?.find((w) => w.blockchain === "POLYGON") || topUpData?.[0];
    if (polygonWallet?.address && card.topUpAddress !== polygonWallet.address) {
      card.topUpAddress = polygonWallet.address;
      card.topUpBlockchain = polygonWallet.blockchain || "POLYGON";
      card.topUpTokens = polygonWallet.tokens || ["USDT", "USDC"];
      await card.save();
    }

    // Obtener available_credit de la tarjeta
    let availableCredit = null;
    try {
      const { data: balanceData } = await cryptomateClient.get(
        `/cards/virtual-cards/${card.cryptomateCardId}/virtual-balances`
      );
      availableCredit = balanceData.available_credit ?? null;
    } catch {
      // virtual-balances puede no estar disponible en algunos estados — no es crítico
    }

    res.json({ wallets, availableCredit });
  } catch (error) {
    console.error("Top-up wallets error:", error?.response?.data || error.message);
    res.status(500).json({ message: "Error fetching top-up wallets" });
  }
};

// GET /cards/origen-price — precio actual de ORIGEN en USD (para conversiones en frontend)
export const getOrigenPrice = async (req, res) => {
  try {
    const price = await getOrigenPriceUsd();
    res.json({ price, updatedAt: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ message: "Error fetching price" });
  }
};

// POST /cards/pin
// Retorna el PIN de la tarjeta. Requiere password del usuario.
// CryptoMate expone /cards/virtual-cards/:id/pin-html igual que PAN.
export const getCardPin = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { password } = req.body;
    if (!password) return res.status(400).json({ message: "Password required" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Incorrect password" });

    const card = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (!card) return res.status(404).json({ message: "No active card found" });

    const { data } = await cryptomateClient.get(
      `/cards/virtual-cards/${card.cryptomateCardId}/pin-html`
    );

    const pinUrl = data.url;

    // Intentar parsear el PIN del HTML server-side
    try {
      const htmlRes = await axios.get(pinUrl, {
        timeout: 8000,
        headers: {
          "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (compatible; VetaWallet/1.0)",
        },
      });
      const html = htmlRes.data;
      // CryptoMate usa <span id="pin-value"> igual que el PAN
      const pinMatch = html.match(/id=["']pin-value["'][^>]*>\s*([^<]+?)\s*</);
      if (pinMatch) {
        console.log(`PIN parsed OK for card ${card.cryptomateCardId}`);
        return res.json({ pin: pinMatch[1].trim(), pinUrl });
      }
      console.warn("PIN HTML: no se encontró el span de valor.");
    } catch (parseErr) {
      console.warn("PIN HTML fetch/parse failed:", parseErr.message);
    }

    // Fallback — devolver URL
    res.json({ pinUrl });
  } catch (error) {
    // CryptoMate responde NOT_FOUND cuando la tarjeta no tiene PIN. Las
    // tarjetas virtuales normalmente no lo tienen: no se usan en cajero, así
    // que el emisor ni siquiera expone el recurso. Eso NO es un fallo del
    // servidor — devolverlo como 500 hacía que la app mostrara "el servidor
    // tuvo un problema" cuando la respuesta correcta es "esta tarjeta no
    // maneja PIN".
    if (esNoEncontrado(error)) {
      return res.status(409).json({
        code: "PIN_NOT_SET",
        message: "Esta tarjeta todavía no tiene un PIN asignado",
      });
    }
    console.error("Get PIN error:", error?.response?.data || error.message);
    res.status(500).json({ message: "Error fetching card PIN" });
  }
};

// PUT /cards/pin — crear o cambiar el PIN de la tarjeta.
//
// CryptoMate expone PUT /cards/virtual-cards/{id}/pin. Que una tarjeta virtual
// devuelva NOT_FOUND al consultar el PIN no significa que el producto no lo
// soporte: significa que nunca se le asignó uno. Esta ruta es la que permite
// asignarlo desde la app.
export const setCardPin = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { pin, password } = req.body;

    // La misma exigencia que el resto de operaciones sensibles: la contraseña
    // real del usuario, no solo una sesión válida.
    if (!password) return res.status(400).json({ message: "Password required" });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Incorrect password" });

    // CryptoMate acepta 4 a 12 caracteres; se restringe a dígitos porque es
    // un PIN de tarjeta y los teclados de cajero y datáfono son numéricos.
    if (typeof pin !== "string" || !/^\d{4,12}$/.test(pin)) {
      return res.status(400).json({
        code: "PIN_INVALID",
        message: "El PIN debe tener entre 4 y 12 dígitos",
      });
    }

    const card = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (!card) return res.status(404).json({ message: "No active card found" });

    await cryptomateClient.put(
      `/cards/virtual-cards/${card.cryptomateCardId}/pin`,
      { pin }
    );

    res.json({ ok: true, message: "PIN actualizado" });
  } catch (error) {
    const detalle = error?.response?.data;
    console.error("Set PIN error:", detalle || error.message);
    // El emisor puede rechazar PINs débiles o repetidos; se devuelve 400 para
    // que la app lo muestre como algo corregible y no como una caída.
    if (error?.response?.status === 400 || error?.response?.status === 422) {
      return res.status(400).json({ code: "PIN_REJECTED", message: "El emisor rechazó ese PIN. Prueba con otro." });
    }
    res.status(500).json({ message: "Error updating card PIN" });
  }
};

// GET /cards/transactions?page=1&limit=10
// Retorna el historial de transacciones de la tarjeta del usuario autenticado
export const getCardTransactions = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const card = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (!card) return res.status(404).json({ message: "No active card found" });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { status, from, to } = req.query;

    const params = { card_id: card.cryptomateCardId, page, page_size: limit };
    if (status) params.status = status;
    if (from) params.from = from;   // ISO date string "YYYY-MM-DD"
    if (to) params.to = to;

    let data;
    try {
      const resp = await cryptomateClient.get(
        `/cards/transactions/search-transactions`,
        { params }
      );
      data = resp.data;
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === "NOT_FOUND" || err?.response?.status === 404) {
        return res.json({ transactions: [], total: 0, page, ogTokenPrice: 1 });
      }
      throw err;
    }

    // Obtener precio ORIGEN para convertir los montos
    const ogTokenPrice = await getOrigenPriceUsd().catch(() =>
      parseFloat(process.env.OG_TOKEN_PRICE_USD) || 1
    );

    // Normalizar y convertir montos a ORIGEN
    const transactions = (data.data || data.transactions || data || []).map((tx) => {
      const usdAmount = tx.amount ?? 0;
      const origenAmount = usdAmount / ogTokenPrice;
      return {
        id: tx.id,
        date: tx.created_at || tx.date,
        amount: usdAmount,           // interno — no mostrar en UI
        origenAmount,                       // mostrar este al usuario
        currency: "ORIGEN",
        merchant: tx.merchant_name || tx.description || "—",
        status: tx.status,
        type: tx.type || "purchase",
        mcc: tx.mcc,
      };
    });

    res.json({ transactions, total: data.total || transactions.length, page, ogTokenPrice });
  } catch (error) {
    console.error("Get transactions error:", error?.response?.data || error.message);
    res.status(500).json({ message: "Error fetching transactions" });
  }
};

// PATCH /cards/limits
// Actualiza los límites de gasto de la tarjeta
// Body: { daily_limit?, weekly_limit?, monthly_limit? }
export const updateCardLimits = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const card = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (!card) return res.status(404).json({ message: "No active card found" });

    const { daily_limit, weekly_limit, monthly_limit } = req.body;
    if (!daily_limit && !weekly_limit && !monthly_limit) {
      return res.status(400).json({ message: "At least one limit must be provided" });
    }

    // Los límites llegan en ORIGEN — convertir a USD para CryptoMate
    const ogTokenPrice = await getOrigenPriceUsd();
    const toUsd = (v) => Math.round(Number(v) * ogTokenPrice * 100) / 100; // 2 decimales

    const payload = {};
    if (daily_limit) payload.daily_limit = toUsd(daily_limit);
    if (weekly_limit) payload.weekly_limit = toUsd(weekly_limit);
    if (monthly_limit) payload.monthly_limit = toUsd(monthly_limit);

    const { data } = await cryptomateClient.patch(
      `/cards/virtual-cards/${card.cryptomateCardId}`,
      payload
    );

    // Guardar en DB en USD (getMyCard los convierte a ORIGEN al leerlos)
    if (data.daily_limit != null) card.dailyLimit = data.daily_limit;
    if (data.weekly_limit != null) card.weeklyLimit = data.weekly_limit;
    if (data.monthly_limit != null) card.monthlyLimit = data.monthly_limit;
    await card.save();

    res.json({
      message: "Limits updated",
      dailyLimit: data.daily_limit || card.dailyLimit,
      weeklyLimit: data.weekly_limit || card.weeklyLimit,
      monthlyLimit: data.monthly_limit || card.monthlyLimit,
    });
  } catch (error) {
    console.error("Update limits error:", error?.response?.data || error.message);
    res.status(500).json({ message: "Error updating limits", detail: error?.response?.data });
  }
};

// POST /cards/freeze
// Congela o descongela la tarjeta
// Body: { frozen: true | false }
export const setFrozen = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const card = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (!card) return res.status(404).json({ message: "No active card found" });

    const { frozen } = req.body;
    if (typeof frozen !== "boolean") {
      return res.status(400).json({ message: "frozen must be boolean" });
    }

    const { data } = await cryptomateClient.patch(
      `/cards/virtual-cards/${card.cryptomateCardId}/frozen`,
      { frozen }
    );

    card.status = frozen ? "FROZEN" : "ACTIVE";
    await card.save();

    res.json({
      message: frozen ? "Card frozen" : "Card unfrozen",
      status: card.status,
    });
  } catch (error) {
    console.error("Freeze card error:", error?.response?.data || error.message);
    res.status(500).json({ message: "Error updating card status" });
  }
};

// POST /cards/dispute
// Crea un ticket de disputa para una transacción
// Body: { transaction_id, merchant, amount, date, reason }
export const disputeTransaction = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const card = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (!card) return res.status(404).json({ message: "No active card found" });

    const { transaction_id, merchant, amount, date, reason } = req.body;
    if (!transaction_id || !reason) {
      return res.status(400).json({ message: "transaction_id and reason are required" });
    }

    // Enviar email de disputa al equipo de soporte
    const transporter = nodemailer.createTransport({
      service: "Outlook",
      auth: {
        user: process.env.OUTLOOK_USER,
        pass: process.env.OUTLOOK_PASS,
      },
    });

    const ticketId = `DISP-${Date.now()}`;

    await transporter.sendMail({
      from: process.env.OUTLOOK_USER,
      to: process.env.OUTLOOK_USER,
      subject: `[VetaWallet] Disputa de transacción ${ticketId}`,
      html: `
        <h2>Nueva disputa de transacción</h2>
        <table border="1" cellpadding="8" style="border-collapse:collapse">
          <tr><td><b>Ticket</b></td><td>${ticketId}</td></tr>
          <tr><td><b>Usuario</b></td><td>${user.name} (${user.email})</td></tr>
          <tr><td><b>Tarjeta</b></td><td>•••• ${card.last4}</td></tr>
          <tr><td><b>ID Transacción</b></td><td>${transaction_id}</td></tr>
          <tr><td><b>Comercio</b></td><td>${merchant || "—"}</td></tr>
          <tr><td><b>Monto</b></td><td>${amount || "—"} USD</td></tr>
          <tr><td><b>Fecha</b></td><td>${date || "—"}</td></tr>
          <tr><td><b>Motivo</b></td><td>${reason}</td></tr>
        </table>
      `,
    });

    // Confirmación al usuario
    await transporter.sendMail({
      from: process.env.OUTLOOK_USER,
      to: user.email,
      subject: `Tu disputa fue recibida — ${ticketId}`,
      html: `
        <p>Hola ${user.name},</p>
        <p>Recibimos tu disputa para la transacción en <b>${merchant || "comercio desconocido"}</b> por <b>$${amount} USD</b>.</p>
        <p>Tu número de ticket es: <b>${ticketId}</b></p>
        <p>Nuestro equipo la revisará en un plazo de 5-7 días hábiles.</p>
        <p>— Equipo VetaWallet</p>
      `,
    });

    res.json({ message: "Dispute submitted", ticketId });
  } catch (error) {
    console.error("Dispute error:", error.message);
    res.status(500).json({ message: "Error submitting dispute" });
  }
};

// GET /cards/statement?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv
// Genera y descarga el estado de cuenta del período
export const getCardStatement = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const card = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (!card) return res.status(404).json({ message: "No active card found" });

    const { from, to, format = "csv" } = req.query;

    // Obtener todas las transacciones del período (hasta 500)
    const params = { card_id: card.cryptomateCardId, page: 1, page_size: 500 };
    if (from) params.from = from;
    if (to) params.to = to;

    let data = {};
    try {
      const resp = await cryptomateClient.get(
        `/cards/transactions/search-transactions`,
        { params }
      );
      data = resp.data;
    } catch (err) {
      // Tarjeta sin movimientos todavia: se entrega un CSV con la cabecera
      // sola, que es un estado de cuenta valido y vacio.
      if (!esNoEncontrado(err)) throw err;
      data = {};
    }

    const transactions = (data.data || data.transactions || (Array.isArray(data) ? data : []) || []);

    // Convertir todos los montos a ORIGEN para el CSV
    const ogTokenPrice = await getOrigenPriceUsd();

    // Generar CSV — todo en ORIGEN, sin referencias a USD
    const csvHeader = "Fecha,Comercio,Tipo,Monto (ORIGEN),Estado\n";
    const csvRows = transactions.map(tx => {
      const date = tx.created_at || tx.date || "";
      const merchant = (tx.merchant_name || tx.description || "").replace(/,/g, ";");
      const type = tx.type || "purchase";
      const usdAmount = tx.amount != null ? Number(tx.amount) : 0;
      const origenAmount = ogTokenPrice > 0 ? (usdAmount / ogTokenPrice).toFixed(6) : usdAmount;
      const status = tx.status || "";
      return `"${date}","${merchant}","${type}",${origenAmount},"${status}"`;
    }).join("\n");

    const csv = csvHeader + csvRows;

    const fromStr = from || "inicio";
    const toStr = to || new Date().toISOString().split("T")[0];
    const filename = `VetaWallet_estado_${fromStr}_${toStr}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("﻿" + csv); // BOM para compatibilidad con Excel
  } catch (error) {
    console.error("Statement error:", error?.response?.data || error.message);
    res.status(500).json({ message: "Error generating statement" });
  }
};

// POST /cards/cancel
// Cancela la tarjeta activa del usuario. Acción irreversible.
export const cancelCard = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { password } = req.body;
    if (!password) return res.status(400).json({ message: "Password required" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Incorrect password" });

    const card = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (!card) return res.status(404).json({ message: "No active card found" });

    // Cancelar en CryptoMate
    await cryptomateClient.delete(`/cards/virtual-cards/${card.cryptomateCardId}`);

    // Marcar como eliminada en DB
    card.status = "DELETED";
    await card.save();

    res.json({ message: "Card cancelled successfully" });
  } catch (error) {
    console.error("Cancel card error:", error?.response?.data || error.message);
    res.status(500).json({ message: "Error cancelling card", detail: error?.response?.data });
  }
};

// GET /cards/notifications
// Retorna eventos de tarjeta no leídos (declinaciones, bloqueos, etc.)
export const getCardNotifications = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const events = await CardEvent.find({ userId: user._id, readAt: null })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({ notifications: events });
  } catch (error) {
    console.error("Notifications error:", error.message);
    res.status(500).json({ message: "Error fetching notifications" });
  }
};

// POST /cards/notifications/read — marcar todas como leídas
export const markNotificationsRead = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    await CardEvent.updateMany(
      { userId: user._id, readAt: null },
      { readAt: new Date() }
    );

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Error" });
  }
};

// POST /cards/webhook  — SIN autenticación JWT
// CryptoMate envía eventos de tarjeta (autorización, depósito, etc.)
// Configurar esta URL en el Portal de CryptoMate
export const cardWebhook = async (req, res) => {
  try {
    const webhookKey = req.headers["x-webhook-key"];
    if (!webhookKey || webhookKey !== process.env.CRYPTOMATE_WEBHOOK_KEY) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { product, event_type, operation_id, status, data } = req.body;

    console.log(`CryptoMate webhook: product=${product} event=${event_type} op=${operation_id} status=${status}`);

    if (product === "cards") {
      // enterprise_cards: el card_id viene en data.card_id o data.id
      const cardId = data?.card_id || data?.id;
      const card = cardId ? await Card.findOne({ cryptomateCardId: cardId }) : null;

      if (card) {
        switch (event_type) {
          case "card_blocked_by_velocity":
            card.status = "BLOCKED";
            await card.save();
            break;

          case "card_unblocked":
            card.status = "ACTIVE";
            await card.save();
            break;

          case "card_frozen":
            card.status = "FROZEN";
            await card.save();
            break;

          case "card_unfrozen":
            card.status = "ACTIVE";
            await card.save();
            break;

          // authorization / cleared / deposit
          case "authorization":
            // Si la autorización fue declinada → guardar evento de notificación
            if (data?.status === "DECLINED" || status === "DECLINED") {
              await CardEvent.create({
                userId: card.userId,
                cardId: cardId,
                type: "DECLINED",
                amount: data?.amount,
                currency: data?.currency || "USD",
                merchant: data?.merchant_name || data?.description || "Comercio",
                message: "Tu tarjeta fue declinada en una transacción",
              });
            }
            console.log(`CryptoMate authorization: card=${cardId} status=${data?.status} amount=${data?.amount}`);
            break;
          case "cleared":
          case "deposit":
            console.log(`CryptoMate ${event_type}: card=${cardId} amount=${data?.amount} currency=${data?.currency}`);
            break;

          default:
            console.log(`CryptoMate unhandled event: ${event_type}`);
        }
      }

      // Si approval_method fuera WEBHOOK, habría que responder en < 1200ms.
      // Con enterprise_cards y approval_method=NONE, no se reciben authorization events.
    }

    res.status(200).json({ response_code: "OK" });
  } catch (error) {
    console.error("Card webhook error:", error.message);
    res.status(200).json({ response_code: "OK" });
  }
};

// POST /cards/admin/sync
// Sincroniza todas las tarjetas de CryptoMate con MongoDB.
// Hace match por meta.email → usuario en MongoDB.
// Solo crea registros nuevos (no sobreescribe los existentes).
// Requiere header x-admin-key = ADMIN_SECRET del .env
export const syncCards = async (req, res) => {
  if (req.headers["x-admin-key"] !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const { data: cmCards } = await cryptomateClient.get("/cards/virtual-cards/list");

    const results = { synced: [], skipped: [], notFound: [] };

    for (const cm of cmCards) {
      const email = cm.meta?.email;
      if (!email) { results.skipped.push({ id: cm.id, reason: "no email in meta" }); continue; }

      // Buscar usuario por email
      const user = await Users.findOne({ email: email.toLowerCase().trim() });
      if (!user) { results.notFound.push({ id: cm.id, email }); continue; }

      // ¿Ya tiene un Card record para esta tarjeta?
      const existing = await Card.findOne({ cryptomateCardId: cm.id });
      if (existing) { results.skipped.push({ id: cm.id, email, reason: "already exists" }); continue; }

      // ¿El usuario ya tiene otra tarjeta activa vinculada?
      const userCard = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
      if (userCard) { results.skipped.push({ id: cm.id, email, reason: "user already has card " + userCard.cryptomateCardId }); continue; }

      // Crear el registro
      await Card.create({
        userId: user._id,
        cryptomateCardId: cm.id,
        cardHolderName: cm.card_holder_name,
        last4: cm.last4,
        status: cm.status === "ACTIVE" ? "ACTIVE" :
          cm.status === "FROZEN" ? "FROZEN" :
            cm.status === "BLOCKED" ? "BLOCKED" : "ACTIVE",
        approvalMethod: cm.approval_method,
        dailyLimit: cm.daily_limit || null,
        weeklyLimit: cm.weekly_limit || null,
        monthlyLimit: cm.monthly_limit || null,
      });

      // Marcar kycStatus como approved si no lo está (estas cuentas ya pasaron KYC)
      if (user.kycStatus !== "approved") {
        user.kycStatus = "approved";
        user.kycApprovedAt = user.kycApprovedAt || new Date();
        await user.save();
      }

      results.synced.push({ id: cm.id, email, userId: user._id });
    }

    res.json({
      message: `Sync complete`,
      synced: results.synced.length,
      skipped: results.skipped.length,
      notFound: results.notFound.length,
      details: results,
    });
  } catch (err) {
    console.error("syncCards error:", err?.response?.data || err.message);
    res.status(500).json({ message: "Error syncing cards", error: err.message });
  }
};

// GET /cards/spending
// Retorna gasto acumulado del período actual (diario/semanal/mensual) convertido a ORIGEN.
// Útil para mostrar barras de progreso de límites en la UI.
export const getAccumulatedSpending = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const card = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (!card) return res.status(404).json({ message: "No active card found" });

    const ogTokenPrice = await getOrigenPriceUsd();

    let spending = { daily_spending: 0, weekly_spending: 0, monthly_spending: 0 };
    try {
      const { data } = await cryptomateClient.get(
        `/cards/transactions/${card.cryptomateCardId}/accumulated-spending`
      );
      spending = data;
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code !== "NOT_FOUND" && err?.response?.status !== 404) throw err;
      // Si no hay historial, todo en 0
    }

    res.json({
      dailySpending: spending.daily_spending / ogTokenPrice,
      weeklySpending: spending.weekly_spending / ogTokenPrice,
      monthlySpending: spending.monthly_spending / ogTokenPrice,
      dailyLimit: card.dailyLimit ? card.dailyLimit / ogTokenPrice : null,
      weeklyLimit: card.weeklyLimit ? card.weeklyLimit / ogTokenPrice : null,
      monthlyLimit: card.monthlyLimit ? card.monthlyLimit / ogTokenPrice : null,
      ogTokenPrice,
    });
  } catch (error) {
    console.error("getAccumulatedSpending error:", error?.response?.data || error.message);
    res.status(500).json({ message: "Error fetching spending", detail: error?.response?.data });
  }
};

// GET /cards/transactions/:txId
// Retorna detalle completo de una sola transacción, con montos convertidos a ORIGEN.
export const getTransactionDetail = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const card = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (!card) return res.status(404).json({ message: "No active card found" });

    const { txId } = req.params;
    if (!txId) return res.status(400).json({ message: "txId is required" });

    const ogTokenPrice = await getOrigenPriceUsd();

    const { data: tx } = await cryptomateClient.get(
      `/cards/transactions/${card.cryptomateCardId}/${txId}`
    );

    // Convertir montos USD → ORIGEN
    const toOrigen = (usd) => (usd != null ? usd / ogTokenPrice : null);

    res.json({
      id: tx.id,
      datetime: tx.datetime,
      operation: tx.operation,
      status: tx.status,
      merchantName: tx.merchant_name,
      // Monto facturado (USD) → ORIGEN
      billAmount: toOrigen(tx.bill_amount),
      billAmountUsd: tx.bill_amount,
      billCurrency: tx.bill_currency,
      // Monto original (puede ser en otra divisa)
      transactionAmount: tx.transaction_amount,
      transactionCurrency: tx.transaction_currency,
      exchangeRate: tx.exchange_rate,
      // Saldos antes/después en ORIGEN
      originalBalance: toOrigen(tx.original_balance),
      newBalance: toOrigen(tx.new_balance),
      // Tarifas en ORIGEN (normalmente 0)
      feeFxClient: toOrigen(tx.fee_fx_client),
      feeAtmClient: toOrigen(tx.fee_atm_client),
      feeDepositClient: toOrigen(tx.fee_deposit_client),
      // Detalle de rechazo si aplica
      declineReason: tx.decline_reason || null,
      ogTokenPrice,
    });
  } catch (error) {
    const code = error?.response?.data?.code;
    if (code === "APP_ERROR" || error?.response?.status === 404) {
      return res.status(404).json({ message: "Transaction not found" });
    }
    console.error("getTransactionDetail error:", error?.response?.data || error.message);
    res.status(500).json({ message: "Error fetching transaction", detail: error?.response?.data });
  }
};

// PUT /cards/otp-phone
// Actualiza el teléfono OTP (3DS SMS) de la tarjeta.
// Se llama automáticamente al emitir la tarjeta, y se expone como ruta para futuras actualizaciones.
export const updateOtpPhone = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const card = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (!card) return res.status(404).json({ message: "No active card found" });

    const phone_country_code = req.body.phone_country_code ?? user.phone_country_code ?? 57;
    const phone = String(req.body.phone ?? user.phone_number ?? "");

    if (!phone) return res.status(400).json({ message: "phone is required" });

    await cryptomateClient.put(
      `/cards/virtual-cards/${card.cryptomateCardId}/phone`,
      { phone_country_code: Number(phone_country_code), phone }
    );

    // Actualizar en DB también
    user.phone_country_code = Number(phone_country_code);
    user.phone_number = phone;
    await user.save();

    res.json({
      message: "OTP phone updated successfully",
      otpPhoneCountryCode: user.phone_country_code,
      otpPhone: user.phone_number,
    });
  } catch (error) {
    console.error("updateOtpPhone error:", error?.response?.data || error.message);
    res.status(500).json({ message: "Error updating OTP phone", detail: error?.response?.data });
  }
};

// ============================================================
// Reemitir, desbloquear y 3D Secure
// ============================================================

// PUT /cards/reissue — reemite la tarjeta con un PAN nuevo.
//
// Es la respuesta correcta a "me clonaron la tarjeta": congelar solo la para
// temporalmente, esto la reemplaza. El numero anterior deja de servir, asi que
// se exige la contraseña igual que en las demas operaciones destructivas.
export const reissueCard = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { password } = req.body;
    if (!password) return res.status(400).json({ message: "Password required" });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Incorrect password" });

    const card = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (!card) return res.status(404).json({ message: "No active card found" });

    const { data } = await cryptomateClient.put(
      `/cards/virtual-cards/${card.cryptomateCardId}/reissue`
    );

    // El id se mantiene y cambian los ultimos 4; se refresca lo que guardamos
    // para que la app no siga mostrando el numero viejo.
    if (data?.last4) card.last4 = data.last4;
    if (data?.status) card.status = data.status;
    await card.save();

    res.json({
      ok: true,
      last4: card.last4,
      status: card.status,
      message: "Tarjeta reemitida",
    });
  } catch (error) {
    console.error("Reissue error:", error?.response?.data || error.message);
    res.status(500).json({ message: "Error reissuing card" });
  }
};

// PATCH /cards/unblock — quita el bloqueo que aplica el emisor.
//
// Distinto de descongelar: congelar lo hace el usuario, bloquear lo hace el
// sistema antifraude (por ejemplo tras varias declinaciones seguidas).
export const unblockCard = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const card = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (!card) return res.status(404).json({ message: "No active card found" });

    const { data } = await cryptomateClient.patch(
      `/cards/virtual-cards/${card.cryptomateCardId}/unblock`
    );

    if (data?.blocked === false) {
      card.status = "ACTIVE";
      await card.save();
    }

    res.json({ ok: true, blocked: data?.blocked ?? false, status: card.status });
  } catch (error) {
    console.error("Unblock error:", error?.response?.data || error.message);
    res.status(500).json({ message: "Error unblocking card" });
  }
};

// POST /cards/3ds — elige como se autentican las compras online.
//
// SMS envia un codigo al telefono OTP; WEBHOOK delega la decision en nuestro
// backend. Hoy solo se ofrece SMS: WEBHOOK requiere implementar el manejador
// de retos 3DS, y aprobar una compra sin verificar al titular seria peor que
// no tener 3DS.
const TIPOS_3DS = ["SMS"];

export const set3dsConfig = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const tipo = String(req.body?.type || "SMS").toUpperCase();
    if (!TIPOS_3DS.includes(tipo)) {
      return res.status(400).json({ code: "TYPE_INVALID", message: "Tipo de 3DS no soportado" });
    }

    const card = await Card.findOne({ userId: user._id, status: { $ne: "DELETED" } });
    if (!card) return res.status(404).json({ message: "No active card found" });

    // Sin telefono OTP el SMS no llega a ningun lado: se avisa antes de
    // configurar algo que dejaria las compras online rotas.
    if (!user.phone_number) {
      return res.status(409).json({
        code: "PHONE_REQUIRED",
        message: "Necesitas registrar un teléfono para recibir los códigos",
      });
    }

    const { data } = await cryptomateClient.post(
      `/cards/virtual-cards/${card.cryptomateCardId}/3ds-configuration`,
      { type: tipo }
    );

    // Se guarda para poder mostrarle al usuario que ya la tiene activada:
    // CryptoMate no expone un GET de esta configuracion.
    card.threeDsType = data?.type || tipo;
    card.threeDsSetAt = new Date();
    await card.save();

    res.json({ ok: true, type: card.threeDsType, setAt: card.threeDsSetAt });
  } catch (error) {
    console.error("3DS config error:", error?.response?.data || error.message);
    res.status(500).json({ message: "Error configuring 3DS" });
  }
};
