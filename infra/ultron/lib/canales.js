// LOS CANALES: por dónde ULTRON le habla a la junta cuando no está en el panel.
//
// ── WHATSAPP, POR EL MISMO PROVEEDOR QUE AU-RA ──────────────────────────────
//
// AU-RA ya manda WhatsApp por Zernio (infra/aura/whatsapp.py). ULTRON usa las
// MISMAS variables —ZERNIO_BASE, ZERNIO_CLAVE, ZERNIO_CUENTA— para que sea la
// misma línea la que habla, y no una segunda cuenta que la junta tenga que
// guardar aparte.
//
// Solo SALIDA desde acá. La entrada la trae AU-RA: es la única que sondea la
// bandeja del proveedor, y dos sondeadores marcando «leído» sobre la misma
// bandeja se pisan. Cuando AU-RA ve un mensaje de un número de la junta, lo
// reenvía a POST /whatsapp/entrada de este servicio (ver app.js) y devuelve la
// respuesta por su boca. Un solo sondeador, dos cerebros.
//
// ── CORREO, POR SES ─────────────────────────────────────────────────────────
//
// El mismo remitente verificado con el que ya se escribió a 409 personas
// (infra/correo-ordenglobal/instalar-android/enviar.py): info@ordenglobal.org
// por Amazon SES en us-east-1. Nada nuevo que verificar.
//
// ── LO QUE NO HACE, A PROPÓSITO ─────────────────────────────────────────────
//
// No manda a nadie que no esté en la junta. La lista de destinatarios posibles
// es la de miembros (ULTRON_JUNTA), y un destino que no esté ahí se rechaza
// antes de tocar ningún proveedor. ULTRON escribe bien, y un asistente que
// escribe bien y puede mandar a cualquiera es una máquina de mandar cosas a
// quien no debe.

const ZERNIO_BASE = (process.env.ZERNIO_BASE || 'https://zernio.com/api/v1').replace(/\/$/, '');
const ZERNIO_CLAVE = (process.env.ZERNIO_CLAVE || '').trim();
const ZERNIO_CUENTA = (process.env.ZERNIO_CUENTA || '').trim();
const SES_REGION = process.env.SES_REGION || 'us-east-1';
const REMITENTE = process.env.ULTRON_REMITENTE || 'ULTRON · Orden Global <info@ordenglobal.org>';

function estado() {
  return {
    whatsapp: !!(ZERNIO_CLAVE && ZERNIO_CUENTA),
    correo: !!((process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) || process.env.AWS_PROFILE),
  };
}

/** Solo dígitos con el país delante, como lo quiere el proveedor. */
function numeroLimpio(n) {
  const d = String(n || '').replace(/[^\d]/g, '');
  return d.length >= 8 ? d : null;
}

async function whatsapp(numero, texto) {
  if (!ZERNIO_CLAVE || !ZERNIO_CUENTA) {
    const e = new Error('WhatsApp no está configurado (faltan ZERNIO_CLAVE / ZERNIO_CUENTA).');
    e.codigo = 'CANAL_APAGADO'; throw e;
  }
  const num = numeroLimpio(numero);
  if (!num) { const e = new Error('Número inválido.'); e.codigo = 'DESTINO_INVALIDO'; throw e; }
  const r = await fetch(`${ZERNIO_BASE}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ZERNIO_CLAVE}` },
    body: JSON.stringify({ account: ZERNIO_CUENTA, to: num, type: 'text', text: String(texto).slice(0, 4000) }),
    signal: AbortSignal.timeout(20_000),
  });
  const cuerpo = await r.text();
  if (!r.ok) {
    const e = new Error(`El proveedor contestó ${r.status}.`);
    e.codigo = 'PROVEEDOR'; e.detalle = cuerpo.slice(0, 200); throw e;
  }
  let d = null; try { d = JSON.parse(cuerpo); } catch { /* nada */ }
  return { ok: true, id: d?.id || d?.messageId || null };
}

async function correo(destino, asunto, texto, html) {
  const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(destino || ''));
  if (!correoValido) { const e = new Error('Correo inválido.'); e.codigo = 'DESTINO_INVALIDO'; throw e; }
  let SESv2;
  try { ({ SESv2Client: SESv2 } = require('@aws-sdk/client-sesv2')); }
  catch { const e = new Error('Falta @aws-sdk/client-sesv2.'); e.codigo = 'CANAL_APAGADO'; throw e; }
  const { SendEmailCommand } = require('@aws-sdk/client-sesv2');
  const cl = new SESv2({ region: SES_REGION });
  const r = await cl.send(new SendEmailCommand({
    FromEmailAddress: REMITENTE,
    Destination: { ToAddresses: [destino] },
    Content: { Simple: {
      Subject: { Data: String(asunto).slice(0, 200), Charset: 'UTF-8' },
      Body: {
        Text: { Data: String(texto), Charset: 'UTF-8' },
        ...(html ? { Html: { Data: String(html), Charset: 'UTF-8' } } : {}),
      },
    } },
  }));
  return { ok: true, id: r?.MessageId || null };
}

module.exports = { whatsapp, correo, estado, _adentro: { numeroLimpio } };
