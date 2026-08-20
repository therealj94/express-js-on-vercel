import crypto from "crypto";
import axios from "axios";
// Las sesiones se firman y se verifican a traves de lib/sesion.js, que
// entiende el secreto nuevo y el anterior mientras dura la rotacion de
// PASS_TOKEN. Las llamadas jwt.verify(...) y jwt.sign(...) no cambian.
import jwt from "../lib/sesion";
import Users from "../models/Users";

const VERIFF_BASE_URL = "https://stationapi.veriff.com";

// Genera la firma HMAC-SHA256 requerida por Veriff
// Veriff espera: HMAC-SHA256(apiSecret, body) — directo, sin hash intermedio
function veriffSignature(payload) {
  return crypto
    .createHmac("sha256", process.env.VERIFF_API_SECRET)
    .update(Buffer.from(payload))
    .digest("hex");
}

// Verifica la firma del webhook enviado por Veriff
function verifyWebhookSignature(rawBody, signature) {
  // Veriff firma webhooks con el Shared Secret del dashboard (puede diferir del API Secret)
  // Setea VERIFF_WEBHOOK_SECRET en Heroku si es distinto al API Secret
  const webhookSecret = process.env.VERIFF_WEBHOOK_SECRET || process.env.VERIFF_API_SECRET;
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(Buffer.from(rawBody))
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

// POST /kyc/start
// Crea una sesión KYC en Veriff y retorna la URL para que el usuario complete el flujo
export const startKyc = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(token.split(" ")[1], process.env.PASS_TOKEN, {
      algorithm: "HS256",
    });

    const user = await Users.findOne({ _id: decodedToken.userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Si ya está aprobado no se vuelve a iniciar sesión
    if (user.kycStatus === "approved") {
      return res.status(400).json({ message: "KYC already approved" });
    }

    // Pre-popular Veriff con los datos que ya tenemos del usuario.
    // Solo enviamos campos con valor real — nunca strings vacíos.
    const nameParts = (user.name || "").trim().split(/\s+/).filter(Boolean);
    const personFields = {
      ...(nameParts.length > 0  && { firstName: nameParts[0] }),
      ...(nameParts.length > 1  && { lastName: nameParts.slice(1).join(" ") }),
      ...(user.birth_date        && { dateOfBirth: user.birth_date }),  // "YYYY-MM-DD"
    };

    const sessionPayload = JSON.stringify({
      verification: {
        callback: process.env.VERIFF_CALLBACK_URL || "https://www.vetawallet.com/card",
        ...(Object.keys(personFields).length > 0 && { person: personFields }),
        vendorData: user._id.toString(),
        timestamp: new Date().toISOString(),
      },
    });

    const signature = veriffSignature(sessionPayload);

    const { data } = await axios.post(
      `${VERIFF_BASE_URL}/v1/sessions`,
      sessionPayload,
      {
        headers: {
          "Content-Type": "application/json",
          "X-AUTH-CLIENT": process.env.VERIFF_API_KEY,
          "X-HMAC-SIGNATURE": signature,
        },
      }
    );

    // Guarda el session ID, URL y marca como pendiente
    user.kycSessionId = data.verification.id;
    user.kycSessionUrl = data.verification.url;
    user.kycStatus = "pending";
    await user.save();

    res.json({
      sessionId: data.verification.id,
      url: data.verification.url,
      sessionToken: data.verification.sessionToken,
      status: data.verification.status,
    });
  } catch (error) {
    console.error("KYC start error:", error?.response?.data || error.message);
    res.status(500).json({ message: "Error starting KYC session" });
  }
};

// GET /kyc/status
// Retorna el estado KYC actual del usuario autenticado
export const getKycStatus = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(token.split(" ")[1], process.env.PASS_TOKEN, {
      algorithm: "HS256",
    });

    const user = await Users.findOne({ _id: decodedToken.userId }).select(
      "kycStatus kycSessionId kycSessionUrl kycApprovedAt"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      kycStatus: user.kycStatus,
      kycSessionId: user.kycSessionId || null,
      kycSessionUrl: user.kycStatus === "pending" ? (user.kycSessionUrl || null) : null,
      kycApprovedAt: user.kycApprovedAt || null,
    });
  } catch (error) {
    console.error("KYC status error:", error.message);
    res.status(500).json({ message: "Error fetching KYC status" });
  }
};

// POST /kyc/save-profile
// Guarda datos personales del usuario ANTES de iniciar KYC.
// Estos datos se usan para pre-popular la sesión de Veriff y luego para emitir la tarjeta.
export const saveProfile = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decoded = jwt.verify(token.split(" ")[1], process.env.PASS_TOKEN, { algorithm: "HS256" });
    const user = await Users.findById(decoded.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const {
      name, second_name, gender,
      phone_country_code, phone_number, birth_date,
      individual_identification_type, individual_identification, expiration_date,
      occupation, annual_salary, account_purpose, expected_monthly_volume, address,
    } = req.body;

    if (name)                            user.name                            = name;
    if (second_name !== undefined)       user.second_name                     = second_name;
    if (gender)                          user.gender                          = gender;
    if (phone_country_code)              user.phone_country_code              = phone_country_code;
    if (phone_number)                    user.phone_number                    = String(phone_number);
    if (birth_date)                      user.birth_date                      = birth_date;
    if (individual_identification_type)  user.individual_identification_type  = individual_identification_type;
    if (individual_identification)       user.individual_identification       = individual_identification;
    if (expiration_date)                 user.expiration_date                 = expiration_date;
    if (occupation)                      user.occupation                      = occupation;
    if (annual_salary)                   user.annual_salary                   = annual_salary;
    if (account_purpose)                 user.account_purpose                 = account_purpose;
    if (expected_monthly_volume)         user.expected_monthly_volume         = expected_monthly_volume;
    if (address) {
      user.home_address = address;
      user.markModified("home_address");
    }

    await user.save();
    res.json({ message: "Profile saved" });
  } catch (err) {
    console.error("Save profile error:", err.message);
    res.status(500).json({ message: "Error saving profile" });
  }
};

// GET /kyc/profile
// Retorna los datos personales ya guardados del usuario (para pre-rellenar formularios).
export const getProfile = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decoded = jwt.verify(token.split(" ")[1], process.env.PASS_TOKEN, { algorithm: "HS256" });
    const user = await Users.findById(decoded.userId).select(
      "name second_name gender phone_country_code phone_number birth_date individual_identification_type individual_identification expiration_date occupation annual_salary account_purpose expected_monthly_volume home_address"
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    // Exponer home_address como "address" para que el frontend no cambie
    const profile = user.toObject();
    profile.address = profile.home_address;
    delete profile.home_address;
    res.json(profile);
  } catch (err) {
    res.status(500).json({ message: "Error fetching profile" });
  }
};

// forceApprove se elimino: aprobaba el KYC de cualquier usuario autenticado
// y solo lo frenaba un chequeo de NODE_ENV, variable que no estaba definida.
// Con el KYC aprobado se puede pedir una tarjeta Visa real, asi que era una
// evasion completa de la verificacion de identidad.


// POST /kyc/webhook  — SIN autenticación JWT, validado por firma HMAC
// Veriff envía el resultado del KYC a este endpoint
// Configurar esta URL en Veriff Customer Portal > Integrations > Webhook decisions URL
export const kycWebhook = async (req, res) => {
  try {
    // HMAC signature verification — requerido en producción
    const signature = req.headers["x-hmac-signature"];
    if (!signature) return res.status(401).json({ message: "Missing signature" });
    const rawBody = req.rawBody;
    if (!verifyWebhookSignature(rawBody, signature)) return res.status(401).json({ message: "Invalid signature" });
    console.log("KYC webhook received:", JSON.stringify(req.body).slice(0, 300));

    // Veriff envía dos tipos de webhook:
    // 1. Decision webhook: { verification: { status, vendorData } }  ← el que nos importa
    // 2. Event webhook:    { action: "submitted", vendorData, ... }   ← informativo, ignorar
    const { verification } = req.body;
    if (!verification) {
      // Evento informativo (submitted, started, etc.) — siempre 200 para que Veriff no reintente
      console.log("KYC webhook: event (no decision yet), action=", req.body?.action);
      return res.status(200).json({ message: "ok" });
    }

    const { status, vendorData } = verification;

    // vendorData contiene el userId que enviamos al crear la sesión
    const user = await Users.findById(vendorData);
    if (!user) {
      console.warn(`KYC webhook: user not found for vendorData=${vendorData}`);
      return res.status(200).json({ message: "ok" }); // siempre 200 para Veriff
    }

    // "abandoned" = el usuario abrió Veriff pero cerró la ventana sin completar.
    // No actualizamos el estado — se queda en "pending" para que pueda retomar o reintentar.
    if (status === "abandoned") {
      console.log(`KYC webhook: user ${user._id} abandoned session — keeping status=${user.kycStatus}`);
      return res.status(200).json({ message: "ok" });
    }

    // Veriff statuses válidos: approved | declined | resubmission_requested | expired
    user.kycStatus = status;
    if (status === "approved") {
      user.kycApprovedAt = new Date();
    }
    await user.save();

    console.log(`KYC webhook: user ${user._id} -> ${status}`);
    res.status(200).json({ message: "ok" });
  } catch (error) {
    console.error("KYC webhook error:", error.message);
    // Siempre responder 200 para que Veriff no reintente
    res.status(200).json({ message: "ok" });
  }
};
