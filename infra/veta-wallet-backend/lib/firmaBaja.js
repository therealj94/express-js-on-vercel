/* La firma del enlace de baja.
 *
 * POR QUE VIVE SOLA EN SU PROPIO ARCHIVO
 *
 * La necesitan dos sitios: la carta, para escribir el enlace, y la ruta, para
 * comprobarlo. Si vive en la ruta, la carta acaba importando el modelo de
 * usuarios y con él mongoose entero — una plantilla de correo que no se puede
 * dibujar sin abrir la base de datos no se puede probar, y lo que no se puede
 * probar se manda a cuatrocientas personas sin haberlo visto nadie.
 *
 * POR QUE EL ENLACE VA FIRMADO
 *
 * Un enlace del tipo `/baja?c=alguien@correo.com` deja que cualquiera dé de
 * baja a cualquiera con solo escribir su dirección. La firma lo ata a esa
 * dirección: sin ella el enlace no sirve, y no se puede fabricar sin la llave
 * del servidor.
 *
 * Es la MISMA llave que firma las sesiones (PASS_TOKEN), con un prefijo
 * distinto —`baja:`— para que una firma de baja jamás pueda pasar por una de
 * sesión ni al revés.
 */

import crypto from "crypto";

/** La firma de un enlace de baja. Sin llave devuelve "", y la ruta lo rechaza. */
export function firmaBaja(correo) {
  const llave = process.env.PASS_TOKEN || "";
  if (!llave) return "";
  return crypto
    .createHmac("sha256", llave)
    .update(`baja:${String(correo || "").trim().toLowerCase()}`)
    .digest("base64url")
    .slice(0, 24);
}

/** Comparación en tiempo constante: una firma no se adivina a fuerza de intentos. */
export function firmaValida(correo, dada) {
  const buena = Buffer.from(firmaBaja(correo));
  const trae = Buffer.from(String(dada || ""));
  if (!buena.length || buena.length !== trae.length) return false;
  return crypto.timingSafeEqual(buena, trae);
}
