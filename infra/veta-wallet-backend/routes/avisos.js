/* Darse de baja de los correos de aviso.
 *
 * POR QUE ESTO EXISTE
 *
 * Porque un correo masivo sin forma de salirse no es una carta, es spam — y
 * además de estar mal, se paga caro: quien no encuentra el enlace de baja
 * marca el correo como basura, y con eso se quema la reputación del dominio
 * para TODO lo que manda, incluido el correo de recuperar la contraseña. La
 * salida barata protege lo caro.
 *
 * POR QUE EL ENLACE VA FIRMADO
 *
 * Un enlace del tipo `/baja?c=alguien@correo.com` deja que cualquiera dé de
 * baja a cualquiera con solo escribir su dirección. La firma ata el enlace a
 * esa dirección: sin ella el enlace no sirve, y no se puede fabricar sin la
 * llave del servidor.
 *
 * Es la MISMA llave que firma las sesiones (PASS_TOKEN), con un prefijo
 * distinto para que una firma de baja jamás pueda pasar por una de sesión.
 *
 * QUE APAGA, Y QUE NO
 *
 * Apaga las cartas que mandamos por iniciativa propia. NO apaga el correo
 * transaccional —confirmar la cuenta, recuperar la contraseña—: quien se da
 * de baja de los avisos no está renunciando a poder entrar a su cuenta, y
 * dejarlo sin ese correo lo dejaría afuera para siempre.
 *
 * La página contesta en HTML y no en JSON a propósito: esto se abre desde el
 * cliente de correo, y quien lo abre es una persona, no un programa.
 */

import express from "express";
import Users from "../models/Users.js";
import { firmaBaja, firmaValida } from "../lib/firmaBaja.js";

export const router = express.Router();

const LLAVE = process.env.PASS_TOKEN || "";

const pagina = (titulo, cuerpo) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title></head>
<body style="margin:0;background:#14100C;font:400 16px/1.6 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#D8CFBE;">
<div style="max-width:520px;margin:0 auto;padding:56px 22px;">
  <div style="font:600 12px/1 Georgia,serif;letter-spacing:.26em;text-transform:uppercase;color:#C9A961;margin-bottom:26px;">Veta Wallet · Orden Global</div>
  <div style="background:#1E1811;border:1px solid rgba(201,169,97,.25);border-radius:14px;padding:30px;">
    ${cuerpo}
  </div>
</div>
</body></html>`;

router.get("/baja", async (req, res) => {
  const correo = String(req.query.c || "").trim().toLowerCase();
  const firma = String(req.query.f || "");

  if (!LLAVE) {
    // Sin llave no se puede comprobar nada, y dar de baja a ciegas es peor que
    // no dar de baja: se diría que sí y no sería verdad.
    return res.status(503).type("html").send(pagina("No disponible",
      `<p style="margin:0;">No podemos procesar la baja en este momento. Escribinos a
       <a href="mailto:info@ordenglobal.org" style="color:#C9A961;">info@ordenglobal.org</a>
       y la hacemos a mano.</p>`));
  }

  if (!correo || !firmaValida(correo, firma)) {
    return res.status(400).type("html").send(pagina("Enlace no válido",
      `<p style="margin:0 0 12px;color:#F3ECD9;font-weight:700;">Este enlace no es válido.</p>
       <p style="margin:0;">Puede que se haya cortado al copiarlo. Escribinos a
       <a href="mailto:info@ordenglobal.org" style="color:#C9A961;">info@ordenglobal.org</a>
       y te damos de baja a mano.</p>`));
  }

  try {
    /* Sin `if` previo: se marca la fecha SOLO si no había una. Así, quien abre
       el enlace dos veces conserva la fecha de la primera vez, que es la que
       vale cuando alguien reclama. */
    await Users.updateOne(
      { email: correo, sinAvisos: { $exists: false } },
      { $set: { sinAvisos: new Date() } },
    );
  } catch {
    return res.status(500).type("html").send(pagina("No se pudo",
      `<p style="margin:0;">No pudimos guardar la baja. Probá otra vez en un momento.</p>`));
  }

  // La misma respuesta exista o no la cuenta: distinta seria una forma de
  // averiguar quien tiene cuenta con nosotros.
  res.type("html").send(pagina("Listo",
    `<p style="margin:0 0 12px;color:#F3ECD9;font-weight:700;">Listo. No te mandamos más correos de aviso.</p>
     <p style="margin:0 0 12px;">Seguís recibiendo lo imprescindible de tu cuenta —confirmar el correo o
     recuperar la contraseña—, porque sin eso no podrías entrar.</p>
     <p style="margin:0;font-size:14px;color:#9A8C76;">¿Fue sin querer? Escribinos a
     <a href="mailto:info@ordenglobal.org" style="color:#C9A961;">info@ordenglobal.org</a>.</p>`));
});

export default router;
