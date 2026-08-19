/* El correo saliente de Veta Wallet, por Amazon SES.
 *
 * QUE HABIA ANTES, Y POR QUE SE CAMBIA
 *
 * Este backend mandaba desde DOS buzones de consumidor distintos: una cuenta
 * de Gmail para el correo de confirmación de cuenta y una de Outlook para el
 * de recuperación de contraseña. Eso trae tres problemas, y ninguno es de
 * estilo:
 *
 *   1. El remitente que veía la persona era una dirección de Gmail o de
 *      Outlook, no la de la empresa. Un correo que te manda las llaves de tu
 *      dinero desde un buzón personal es exactamente lo que enseña a la gente
 *      a caer en suplantaciones.
 *   2. Gmail corta alrededor de los quinientos envíos diarios. Con cincuenta
 *      mil cuentas, el correo de recuperación deja de salir justo cuando más
 *      falta hace, y nadie se entera hasta que la gente se queja.
 *   3. El SPF, el DKIM y el DMARC de ordenglobal.org —que costaron trabajo y
 *      están puestos— no protegían nada, porque el correo no salía del
 *      dominio.
 *
 * Ahora sale de info@ordenglobal.org por SES: firmado por el dominio, con IPs
 * de buena reputación, y con credenciales propias que se revocan sin tocar el
 * buzón de nadie. Cuesta diez centavos por cada mil correos.
 *
 * POR QUE NO SE USA EL WEBMAIL DE LA EMPRESA
 *
 * Porque vive en hosting compartido. Mandar desde ahí el correo de decenas de
 * miles de personas termina con esa IP en lista negra, y entonces se pierde
 * TODO el correo del dominio: el de los clientes y también el que la empresa
 * le escribe a su Junta. Hoy esa IP está limpia en las once listas que se
 * midieron. Es un activo, y no se quema por ahorrarse esto.
 *
 * LA REGLA QUE MANDA
 *
 * Un correo que no sale no puede tumbar la operación que lo disparó. Aquí
 * nada lanza: se devuelve el resultado y quien llama decide. Un alta de
 * cuenta no puede fallar porque el servidor de correo esté lento.
 *
 * CONFIGURACION (variables de entorno, ninguna escrita aquí)
 *   SES_REGION    por defecto us-east-1
 *   SES_DE        remitente, p.ej. "Veta Wallet <info@ordenglobal.org>"
 *   SES_LLAVE     credenciales de un usuario IAM que SOLO pueda ses:SendEmail
 *   SES_SECRETO
 *
 * Sin ellas el módulo queda apagado y lo dice en el registro: el servicio
 * sigue en pie, simplemente no manda correos.
 */

import crypto from "crypto";

const REGION = process.env.SES_REGION || "us-east-1";
/* El remitente trae valor por defecto porque NO es un secreto: va impreso en
   cada correo. Exigirlo como variable hacía que olvidarlo dejara el correo
   apagado con las credenciales bien puestas, y sin ninguna pista de por qué. */
const DE = process.env.SES_DE || "Veta Wallet <info@ordenglobal.org>";
const LLAVE = process.env.SES_LLAVE || "";
const SECRETO = process.env.SES_SECRETO || "";

export const correoEncendido = () => Boolean(LLAVE && SECRETO);

const sha256 = (d) => crypto.createHash("sha256").update(d).digest("hex");
const hmac = (k, d) => crypto.createHmac("sha256", k).update(d).digest();

/* La firma de AWS (SigV4). Se hace a mano para no meter el SDK entero de AWS
   —decenas de megabytes— en un dyno donde lo único que hace falta es firmar un
   POST. El algoritmo es el documentado y no admite interpretación. */
function firmar(cuerpo, fecha = new Date()) {
  const host = `email.${REGION}.amazonaws.com`;
  const ruta = "/v2/email/outbound-emails";
  const marca = fecha.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dia = marca.slice(0, 8);
  const ambito = `${dia}/${REGION}/ses/aws4_request`;

  const cabeceras = {
    "content-type": "application/json",
    host,
    "x-amz-date": marca,
  };
  const nombres = Object.keys(cabeceras).sort();
  const firmadas = nombres.join(";");
  const canonicas = nombres.map((n) => `${n}:${cabeceras[n]}\n`).join("");

  const peticion = ["POST", ruta, "", canonicas, firmadas, sha256(cuerpo)].join("\n");
  const aFirmar = ["AWS4-HMAC-SHA256", marca, ambito, sha256(peticion)].join("\n");

  const kFecha = hmac(`AWS4${SECRETO}`, dia);
  const kRegion = hmac(kFecha, REGION);
  const kServicio = hmac(kRegion, "ses");
  const kFirma = hmac(kServicio, "aws4_request");
  const firma = crypto.createHmac("sha256", kFirma).update(aFirmar).digest("hex");

  return {
    url: `https://${host}${ruta}`,
    cabeceras: {
      ...cabeceras,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${LLAVE}/${ambito}, ` +
        `SignedHeaders=${firmadas}, Signature=${firma}`,
    },
  };
}

/**
 * Manda un correo. NO lanza nunca: devuelve { ok, id?, motivo? }.
 *
 * @param {{para:string, asunto:string, texto:string, html?:string}} carta
 */
export async function enviarCorreo(carta) {
  if (!correoEncendido()) {
    console.warn("[correo] apagado: faltan SES_DE / SES_LLAVE / SES_SECRETO");
    return { ok: false, motivo: "correo apagado" };
  }
  if (!carta || !carta.para || !String(carta.para).includes("@")) {
    return { ok: false, motivo: "destinatario sin dirección" };
  }

  const cuerpoTexto = { Data: carta.texto, Charset: "UTF-8" };
  const cuerpo = JSON.stringify({
    FromEmailAddress: DE,
    Destination: { ToAddresses: [carta.para] },
    Content: {
      Simple: {
        Subject: { Data: carta.asunto, Charset: "UTF-8" },
        Body: carta.html
          ? { Text: cuerpoTexto, Html: { Data: carta.html, Charset: "UTF-8" } }
          : { Text: cuerpoTexto },
      },
    },
  });

  const p = firmar(cuerpo);
  try {
    const r = await fetch(p.url, {
      method: "POST",
      headers: p.cabeceras,
      body: cuerpo,
      signal: AbortSignal.timeout(10000),
    });
    const txt = await r.text();
    if (!r.ok) {
      // Se registra el motivo pero NO se devuelve hacia fuera: puede traer
      // detalles de la cuenta de AWS.
      console.error("[correo] SES respondió", r.status, txt.slice(0, 300));
      return { ok: false, motivo: `SES ${r.status}` };
    }
    let id;
    try { id = JSON.parse(txt).MessageId; } catch (e) { /* da igual */ }
    return { ok: true, id };
  } catch (e) {
    console.error("[correo] no se pudo enviar:", e && e.message);
    return { ok: false, motivo: "red" };
  }
}

/* ── El marco de los correos ──────────────────────────────────────────────
   Sin una sola imagen remota: casi todos los clientes las bloquean, y un
   correo que depende de ellas llega roto. El oro se hace con color y borde. */

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function marco(titulo, dentro) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:#04191A;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#04191A;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#062A2A;border:1px solid rgba(201,169,97,.25);border-radius:14px;">
<tr><td style="padding:30px 30px 8px;">
  <div style="font:600 12px/1 Georgia,serif;letter-spacing:.26em;text-transform:uppercase;color:#C9A961;">Veta Wallet · Orden Global</div>
</td></tr>
<tr><td style="padding:0 30px 30px;font:400 15px/1.62 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#B4C6C0;">
${dentro}
  <div style="margin-top:30px;padding-top:18px;border-top:1px solid rgba(243,236,217,.10);font-size:12px;line-height:1.6;color:#7E938D;">
    Orden Global Corp · Próspera, Roatán, Honduras<br>
    <strong style="color:#B4C6C0;">Nunca te vamos a pedir por correo tu contraseña ni tu frase de respaldo.</strong>
    Si un mensaje a nombre nuestro te las pide, no es nuestro.
  </div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function botonCorreo(texto, url) {
  return `<div style="margin:24px 0;"><a href="${url}" style="display:inline-block;padding:14px 28px;border-radius:999px;background:#C9A961;color:#0A1F1E;font-weight:700;font-size:15px;text-decoration:none;">${esc(texto)}</a></div>`;
}

export { esc as escaparCorreo };
