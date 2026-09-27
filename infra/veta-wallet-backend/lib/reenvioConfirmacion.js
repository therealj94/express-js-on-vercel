/* Volver a pedir el correo de confirmación: cuándo se puede y cuándo no.
 *
 * El alta decía que «quien no reciba el correo lo puede volver a pedir», pero
 * no había ninguna ruta para hacerlo. El 27-sep-2026 había 477 cuentas sin
 * confirmar de 481: hasta agosto el enlace apuntaba a un dominio que no existe
 * y nunca iba dentro del correo, así que nadie pudo confirmar en tres años.
 *
 * Aquí solo se decide; no hay base ni correo. El controlador pone las piezas.
 * Así la regla se prueba sola (pruebas/probar-reenvio-confirmacion.mjs).
 *
 * El freno va guardado en la cuenta y no en memoria: sobrevive a un reinicio
 * del dyno y vale igual con dos dynos. Cada intento cuenta aunque SES falle:
 * si el correo no sale, reintentar cada segundo no lo arregla y sí gasta
 * cuota y reputación del remitente.
 */

export const ESPERA_MS = 2 * 60 * 1000; // entre un envío y el siguiente
export const MAX_POR_DIA = 5;           // por cuenta y día (UTC)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const diaUtc = (fecha) => fecha.toISOString().slice(0, 10);

/**
 * @param {object} user   la cuenta (isVerified, verificationToken y los contadores)
 * @param {Date}   ahora
 * @returns {{estado:'ya_confirmado'}
 *   | {estado:'espera', reintentarEn:number}
 *   | {estado:'tope_diario'}
 *   | {estado:'enviar', tokenNuevo:boolean, cambios:object}}
 *
 * `cambios` son los campos a guardar en la cuenta ANTES de mandar el correo.
 * Si `tokenNuevo` es true, el controlador pone un token nuevo: el que había
 * ya se gastó (`*`) o no existe. Si había uno válido se reutiliza, para que
 * los enlaces de correos anteriores sigan sirviendo.
 */
export function decidirReenvio(user, ahora = new Date()) {
  if (user?.isVerified === true) return { estado: "ya_confirmado" };

  const ultimo = user?.confirmacionEnviadaEn ? new Date(user.confirmacionEnviadaEn) : null;
  if (ultimo && !isNaN(ultimo)) {
    const falta = ESPERA_MS - (ahora.getTime() - ultimo.getTime());
    if (falta > 0) return { estado: "espera", reintentarEn: Math.ceil(falta / 1000) };
  }

  const hoy = diaUtc(ahora);
  const cuentaHoy = user?.confirmacionEnviosDia === hoy ? Number(user?.confirmacionEnviosCuenta) || 0 : 0;
  if (cuentaHoy >= MAX_POR_DIA) return { estado: "tope_diario" };

  const token = typeof user?.verificationToken === "string" ? user.verificationToken.trim() : "";
  return {
    estado: "enviar",
    tokenNuevo: !UUID.test(token),
    cambios: {
      confirmacionEnviadaEn: ahora,
      confirmacionEnviosDia: hoy,
      confirmacionEnviosCuenta: cuentaHoy + 1,
    },
  };
}

/** El correo a medias para mostrarlo en la app: «jo***@gmail.com». */
export function correoTapado(correo) {
  const c = String(correo || "");
  const at = c.indexOf("@");
  if (at < 1) return "";
  return `${c.slice(0, Math.min(2, at))}***${c.slice(at)}`;
}

/** El correo de confirmación. Lo usan el alta y el reenvío: un solo texto. */
export function correoConfirmacion(enlace, { marco, botonCorreo }) {
  return {
    asunto: "Confirmá tu cuenta de Veta Wallet",
    texto: `Bienvenido a Veta Wallet.

Para confirmar tu cuenta, entrá en este enlace:
${enlace}

Si no creaste esta cuenta, no hagas nada: sin confirmar, el enlace caduca solo.

--
Orden Global Corp
Nunca te vamos a pedir por correo tu contraseña ni tu frase de respaldo.`,
    html: marco("Confirmá tu cuenta", `
        <h1 style="margin:0 0 6px;font:700 24px/1.2 Georgia,serif;color:#F3ECD9;">Bienvenido a Veta Wallet</h1>
        <p style="margin:14px 0 0;">Falta un paso: confirmá que este correo es tuyo.</p>
        ${botonCorreo("Confirmar mi cuenta", enlace)}
        <p style="margin:12px 0 0;font-size:13px;">Si no creaste esta cuenta, no hace falta que hagas nada: sin confirmar, el enlace caduca solo.</p>`),
  };
}
