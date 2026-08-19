/* Lo que le llega a la persona.
 *
 * TRES REGLAS QUE NO SE NEGOCIAN
 *
 * 1. Cada correo va en texto plano Y en HTML. No por gusto: hay clientes que
 *    no pintan HTML, y un correo que llega en blanco a alguien esperando su
 *    verificación es peor que no mandarlo.
 * 2. Nada de imágenes remotas. Casi todos los clientes las bloquean por
 *    defecto, y un diseño que depende de ellas llega roto. El oro se hace con
 *    color de fondo y borde, que sí pintan siempre.
 * 3. La regla de cobre: AUKA SIGUE el precio de la onza. Nunca «es una onza»
 *    ni «respaldado por oro» (Decisión 4 de la Junta, expediente del 14/08).
 *    Y donde se invita al sorteo van el +18 y el enlace a las bases.
 *
 * Y una más, de fondo: acá no se pide NUNCA una contraseña, ni una frase de
 * respaldo, ni que nadie responda con datos. Un correo del ecosistema que
 * pida eso es una suplantación, y el pie de cada carta lo dice para que la
 * gente aprenda a reconocerla.
 */

import type { Carta } from './enviar.js'

const SITIO = 'https://app.vetawallet.com'
const BASES = 'https://vetawallet.com/sorteo-orden-global'
/** 9-sep-2026 23:59:59 en Honduras (UTC−6) — el MISMO instante que app.js. */
const SORTEO_FIN = Date.UTC(2026, 8, 10, 5, 59, 59)
const sorteoVivo = () => Date.now() < SORTEO_FIN

const esc = (s: string) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

/** El primer nombre, para saludar sin solemnidad. Sin nombre, se saluda igual. */
const saludo = (nombreLegal: string | null): string => {
  const n = (nombreLegal || '').trim().split(/\s+/)[0]
  return n ? `Hola, ${n}.` : 'Hola.'
}

/** El marco común: mismo negro y oro que la web, sin una sola imagen. */
function envolver(titulo: string, dentro: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:#0D0B09;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0D0B09;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#141110;border:1px solid rgba(212,175,55,.25);border-radius:14px;">
<tr><td style="padding:30px 30px 8px;">
  <div style="font:600 12px/1 Georgia,serif;letter-spacing:.26em;text-transform:uppercase;color:#D4AF37;">Orden Global</div>
</td></tr>
<tr><td style="padding:0 30px 30px;font:400 15px/1.62 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#B9AE97;">
${dentro}
  <div style="margin-top:30px;padding-top:18px;border-top:1px solid rgba(245,239,224,.10);font-size:12px;line-height:1.6;color:#8C8697;">
    Orden Global Corp · Próspera, Roatán, Honduras<br>
    <strong style="color:#B9AE97;">Nunca te vamos a pedir por correo tu contraseña ni tu frase de respaldo.</strong>
    Si un mensaje a nombre nuestro te las pide, no es nuestro.
  </div>
</td></tr>
</table>
</td></tr></table>
</body></html>`
}

const boton = (texto: string, url: string) =>
  `<div style="margin:24px 0;"><a href="${url}" style="display:inline-block;padding:14px 28px;border-radius:999px;background:#D4AF37;color:#241A05;font-weight:700;font-size:15px;text-decoration:none;">${esc(texto)}</a></div>`

// ── La identidad aprobada ────────────────────────────────────────────────────

export function identidadAprobada(
  datos: { email: string; nombreLegal: string | null; gid: string },
): Carta {
  const hola = saludo(datos.nombreLegal)
  const gid = datos.gid

  const sorteo = sorteoVivo()
  const lineaSorteoTxt = sorteo
    ? `\n\nY hay algo más: con tu identidad verificada estás participando en el sorteo de 1 AUKA, nuestro token que sigue el precio de la onza de oro. Tu código de arriba es tu boleto. Cierra el 9 de septiembre de 2026.\nMayores de 18 años. Bases: ${BASES}`
    : ''
  const lineaSorteoHtml = sorteo
    ? `<div style="margin-top:24px;padding:16px 18px;border-left:2px solid #D4AF37;background:rgba(212,175,55,.08);border-radius:0 10px 10px 0;">
        <div style="color:#F5EFE0;font-weight:600;">Y estás participando por 1 AUKA</div>
        <div style="margin-top:6px;">Con tu identidad verificada entrás al sorteo de 1 AUKA, nuestro token que sigue el precio de la onza de oro. El código de arriba es tu boleto. Cierra el 9 de septiembre de 2026.</div>
        <div style="margin-top:8px;font-size:12px;color:#8C8697;">Mayores de 18 años · <a href="${BASES}" style="color:#D4AF37;">bases del sorteo</a></div>
      </div>`
    : ''

  const texto = `${hola}

Tu Genesis ID quedó verificado.

Tu código de identidad es:  ${gid}

Con él ya entrás a todo el ecosistema con una sola cuenta: tu billetera Veta
Wallet, el chat, los comercios y lo que vayamos abriendo. No hay que repetir
el trámite en ningún lado.

Entrá acá: ${SITIO}${lineaSorteoTxt}

—
Orden Global Corp · Próspera, Roatán, Honduras
Nunca te vamos a pedir por correo tu contraseña ni tu frase de respaldo.`

  const html = envolver('Tu Genesis ID está verificado', `
  <h1 style="margin:0 0 6px;font:700 24px/1.2 Georgia,serif;color:#F5EFE0;">Tu Genesis ID está verificado</h1>
  <p style="margin:14px 0 0;">${esc(hola)}</p>
  <p style="margin:12px 0 0;">Ya está: tu identidad quedó verificada y tenés tu código.</p>
  <div style="margin:22px 0;padding:18px;border:1px solid rgba(212,175,55,.3);border-radius:12px;background:rgba(212,175,55,.06);text-align:center;">
    <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#8C8697;">Tu código de identidad</div>
    <div style="margin-top:8px;font:700 22px/1 ui-monospace,'SF Mono',Menlo,monospace;color:#F7E9BE;letter-spacing:.04em;">${esc(gid)}</div>
  </div>
  <p style="margin:12px 0 0;">Con él entrás a todo el ecosistema con una sola cuenta: tu billetera, el chat,
  los comercios y lo que vayamos abriendo. No hay que repetir el trámite en ningún lado.</p>
  ${boton('Entrar a mi billetera', SITIO)}
  ${lineaSorteoHtml}`)

  return { para: datos.email, asunto: `Tu Genesis ID está verificado — ${gid}`, texto, html }
}

// ── La identidad rechazada ───────────────────────────────────────────────────

/* Un rechazo se escribe para que la persona pueda ARREGLARLO, no para
   informarle de una derrota. Por eso el motivo va completo y con el botón de
   volver a intentar al lado: casi siempre es una foto donde el documento no se
   lee entero, y eso se resuelve en dos minutos. */
export function identidadRechazada(
  datos: { email: string; nombreLegal: string | null; motivo: string },
): Carta {
  const hola = saludo(datos.nombreLegal)
  const motivo = (datos.motivo || '').trim() || 'No se pudo completar la verificación con los datos recibidos.'

  const texto = `${hola}

Revisamos tu solicitud de Genesis ID y todavía no la pudimos aprobar.

Lo que hay que corregir:
${motivo}

Se puede volver a intentar, y en la mayoría de los casos es cuestión de repetir
la foto del documento con mejor luz y que se vean las cuatro esquinas.

Volvé a intentarlo acá: ${SITIO}

Si creés que hay un error, respondé a este correo y lo mira una persona.

—
Orden Global Corp · Próspera, Roatán, Honduras
Nunca te vamos a pedir por correo tu contraseña ni tu frase de respaldo.`

  const html = envolver('Tu Genesis ID necesita una corrección', `
  <h1 style="margin:0 0 6px;font:700 24px/1.2 Georgia,serif;color:#F5EFE0;">Falta un paso para tu Genesis ID</h1>
  <p style="margin:14px 0 0;">${esc(hola)}</p>
  <p style="margin:12px 0 0;">Revisamos tu solicitud y todavía no la pudimos aprobar. Esto es lo que hay que corregir:</p>
  <div style="margin:18px 0;padding:16px 18px;border-left:2px solid #A8291E;background:rgba(168,41,30,.10);border-radius:0 10px 10px 0;color:#F5EFE0;">
    ${esc(motivo)}
  </div>
  <p style="margin:12px 0 0;">Se puede volver a intentar. En la mayoría de los casos alcanza con repetir la foto
  del documento con mejor luz y que se vean las cuatro esquinas.</p>
  ${boton('Volver a intentarlo', SITIO)}
  <p style="margin:12px 0 0;font-size:13px;color:#8C8697;">Si creés que hay un error, respondé a este correo y lo mira una persona.</p>`)

  return { para: datos.email, asunto: 'Tu Genesis ID necesita una corrección', texto, html }
}
