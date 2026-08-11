/**
 * socialAuth.js
 *
 * Verifica los tokens de identidad que devuelven Google y Apple.
 *
 * Esto es lo unico que separa "entrar con Google" de "entrar como quien yo
 * diga". El telefono manda un token firmado por el proveedor; si el servidor
 * lo aceptara sin comprobar la firma, cualquiera podria fabricar uno con el
 * correo ajeno que quisiera y entrar a esa billetera.
 *
 * Se comprueban cuatro cosas, y las cuatro tienen que pasar:
 *
 *   1. La FIRMA, contra la llave publica que el propio proveedor publica.
 *   2. El EMISOR (`iss`): que lo haya firmado Google o Apple y no un tercero.
 *   3. El DESTINATARIO (`aud`): que el token sea para NUESTRA aplicacion. Sin
 *      esto, un token legitimo emitido para otra app cualquiera serviria para
 *      entrar aca.
 *   4. El VENCIMIENTO (`exp`), que lo hace jsonwebtoken.
 *
 * No hace falta ninguna dependencia nueva: las llaves publicas llegan en
 * formato JWK y Node las importa de forma nativa.
 */

import crypto from "crypto";
import jwt from "jsonwebtoken";
import axios from "axios";

const FUENTES = {
  google: {
    jwks: "https://www.googleapis.com/oauth2/v3/certs",
    emisores: ["https://accounts.google.com", "accounts.google.com"],
  },
  apple: {
    jwks: "https://appleid.apple.com/auth/keys",
    emisores: ["https://appleid.apple.com"],
  },
};

// Las llaves publicas cambian cada tanto. Se guardan un rato para no pedirlas
// en cada inicio de sesion, pero se vuelven a pedir si aparece un `kid` que no
// esta en la copia: asi una rotacion del proveedor no deja a nadie afuera.
const CACHE_MS = 60 * 60 * 1000;
const cache = new Map();

async function llavesDe(proveedor, forzar = false) {
  const guardado = cache.get(proveedor);
  if (!forzar && guardado && Date.now() - guardado.cuando < CACHE_MS) {
    return guardado.llaves;
  }
  const { data } = await axios.get(FUENTES[proveedor].jwks, { timeout: 8000 });
  const llaves = data && Array.isArray(data.keys) ? data.keys : [];
  if (!llaves.length) throw new Error(`${proveedor}: no devolvio llaves publicas`);
  cache.set(proveedor, { cuando: Date.now(), llaves });
  return llaves;
}

async function llavePem(proveedor, kid) {
  let llaves = await llavesDe(proveedor);
  let jwk = llaves.find((k) => k.kid === kid);
  if (!jwk) {
    // Puede que el proveedor haya rotado sus llaves: se piden de nuevo antes
    // de rendirse.
    llaves = await llavesDe(proveedor, true);
    jwk = llaves.find((k) => k.kid === kid);
  }
  if (!jwk) throw new Error(`${proveedor}: no se encontro la llave ${kid}`);
  return crypto.createPublicKey({ key: jwk, format: "jwk" })
    .export({ type: "spki", format: "pem" });
}

/** Las audiencias validas, leidas del entorno. Se aceptan varias separadas por coma. */
function audienciasDe(proveedor) {
  const bruto =
    proveedor === "google"
      ? process.env.GOOGLE_CLIENT_IDS
      : process.env.APPLE_CLIENT_IDS;
  const lista = String(bruto || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lista.length) {
    // Sin audiencias configuradas NO se acepta nada. Es preferible que el
    // boton no funcione a que acepte tokens de cualquier aplicacion.
    throw new Error(
      `Falta configurar ${proveedor === "google" ? "GOOGLE_CLIENT_IDS" : "APPLE_CLIENT_IDS"}`
    );
  }
  return lista;
}

/**
 * Comprueba un token de identidad y devuelve los datos de la persona.
 * Lanza si algo no cuadra. Nunca devuelve un correo sin verificar.
 */
export async function verificarTokenSocial(proveedor, idToken) {
  if (!FUENTES[proveedor]) throw new Error("proveedor no soportado");
  if (!idToken || typeof idToken !== "string") throw new Error("falta el token");

  const cabecera = jwt.decode(idToken, { complete: true })?.header;
  if (!cabecera?.kid) throw new Error("token sin identificador de llave");
  if (cabecera.alg !== "RS256") throw new Error("algoritmo de firma inesperado");

  const pem = await llavePem(proveedor, cabecera.kid);
  const datos = jwt.verify(idToken, pem, {
    algorithms: ["RS256"],           // fijado a proposito: sin esto se acepta cualquiera
    issuer: FUENTES[proveedor].emisores,
    audience: audienciasDe(proveedor),
  });

  const correo = String(datos.email || "").trim().toLowerCase();
  if (!correo) throw new Error("el token no trae correo");

  // Google marca si el correo esta verificado; Apple solo emite correos que ya
  // controla. En los dos casos, un correo sin verificar no sirve para entrar:
  // permitiria reclamar la cuenta de otra persona.
  const verificado =
    proveedor === "apple"
      ? datos.email_verified === undefined || datos.email_verified === true || datos.email_verified === "true"
      : datos.email_verified === true;
  if (!verificado) throw new Error("el correo del token no esta verificado");

  return {
    proveedor,
    correo,
    sujeto: datos.sub,                       // identificador estable del proveedor
    nombre: datos.name || datos.given_name || null,
    correoPrivado: /@privaterelay\.appleid\.com$/i.test(correo),
  };
}

export default { verificarTokenSocial };
