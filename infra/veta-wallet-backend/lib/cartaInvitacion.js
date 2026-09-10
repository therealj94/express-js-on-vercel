/* La carta que se le manda a alguien a quien le vamos a entregar tokens.
 *
 * A QUIEN, Y POR QUE ES DISTINTA DE LAS OTRAS
 *
 * Esta no es una campaña: es una carta a UNA persona con nombre, a la que la
 * casa le va a transferir algo suyo. Por eso no lleva enlace de baja —no es
 * correo de avisos, es correo de una operación— y por eso el tono es el de
 * escribirle a alguien, no el de anunciarle algo a nadie en particular.
 *
 * Se hizo plantilla y no un correo suelto porque va a haber más: el segundo
 * que se mande a mano va a salir distinto del primero, y a la tercera nadie se
 * acuerda de qué decía el original.
 *
 * LO QUE ESTA CARTA PIDE, Y LO QUE JAMAS PEDIRIA
 *
 * Pide la DIRECCION de la billetera: empieza con 0x, tiene 42 caracteres, es
 * pública y no sirve para robar nada — es como el número de cuenta.
 *
 * NUNCA pide la frase de respaldo ni la contraseña. Y como el momento en que
 * a alguien le van a entregar tokens es exactamente cuando los estafadores
 * aparecen, la carta no se limita a callarse: lo dice con todas las letras,
 * en un bloque aparte, enseñando cómo se distingue una cosa de la otra. Que
 * la persona sepa reconocer al impostor vale más que cualquier aviso al pie.
 *
 * LO QUE SE COMPROBO ANTES DE ESCRIBIRLA
 *
 *   · Los rótulos de los pasos son los de la app de verdad, sacados de
 *     i18n.js: «Crear mi cuenta», «Recibir ORIGEN», «Copiar dirección»,
 *     «Verificar mi identidad». Un instructivo que nombra botones que no
 *     existen es peor que no mandar ninguno.
 *   · ONDK vive en la MISMA cadena que ORIGEN (contrato
 *     0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1 en la 5550, comprobado:
 *     11.232 bytes de código, símbolo ONDK, 18 decimales). Por eso la
 *     dirección que sale en «Recibir ORIGEN» sirve igual para recibir ONDK, y
 *     la carta lo dice para que nadie se quede con la duda.
 *   · La verificación desde la web se escribe a mano y desde la app se lee con
 *     la cámara. Se cuenta, porque cambia cuál conviene usar.
 *
 * ONDK ES UN VALOR NEGOCIABLE. La carta no habla de precio, ni de rendimiento,
 * ni invita a comprar: entrega algo que ya es de la persona. Esa distinción es
 * lo que la mantiene fuera de terreno de oferta.
 */

import { marco, botonCorreo, escaparCorreo as esc } from "./correo.js";

const SITIO = "https://app.vetawallet.com";
const IR_VERIFICAR = "https://app.vetawallet.com/#verificar";
const CADENA = "https://ordenscan.com";
const CASA = "https://ordenglobal.org";
const RESPUESTA = "info@ordenglobal.org";

const SANS = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,'Courier New',monospace";

const H = (t) =>
  `<div style="margin:30px 0 12px;font:700 17px/1.35 Georgia,serif;color:#F3ECD9;">${esc(t)}</div>`;

/* Un paso de la secuencia. Los números aquí SÍ están ganados: es un orden que
   hay que seguir, no una lista a la que le pusimos números de adorno. */
const paso = (n, titulo, cuerpo) => `
  <div style="margin:0 0 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td width="26" valign="top" style="font:700 15px/1.4 ${MONO};color:#C9A961;">${n}</td>
        <td valign="top">
          <div style="font:600 14px/1.45 ${SANS};color:#FFFFFF;margin-bottom:3px;">${esc(titulo)}</div>
          <div style="font:400 14px/1.62 ${SANS};color:#C4B7A2;">${cuerpo}</div>
        </td>
      </tr>
    </table>
  </div>`;

/**
 * @param {{nombre: string, correo: string, cantidad: string, token?: string}} p
 *   `cantidad` va ya escrita como se quiere leer: "20.000".
 * @returns {{asunto: string, html: string, texto: string}}
 */
export function cartaInvitacion({ nombre, correo, cantidad, token = "ONDK" }) {
  const primer = String(nombre || "").trim().split(/\s+/)[0] || "";
  const asunto = `Tus ${cantidad} ${token} te están esperando, ${primer}`;

  const html = marco(`Tus ${cantidad} ${token}`, `
  <div style="padding:22px 0 6px;">
    <div style="font:400 27px/1.3 Georgia,'Times New Roman',serif;color:#FFFFFF;">
      Tus <span style="color:#C9A961;">${esc(cantidad)} ${esc(token)}</span><br>te están esperando.
    </div>
  </div>

  <p style="margin:18px 0 13px;font-size:16px;color:#F3ECD9;">Hola, ${esc(primer)}.</p>

  <p style="margin:0 0 13px;">
    Te escribimos de Orden Global. Tenemos listos tus
    <strong style="color:#F3ECD9;">${esc(cantidad)} ${esc(token)}</strong> y para
    entregártelos solo falta una cosa: que abras tu billetera y nos pases tu
    dirección. Son unos minutos.
  </p>

  ${H("Cómo abrir tu billetera")}

  ${paso(1, "Entrá a app.vetawallet.com",
    `Se abre en el navegador, sin instalar nada. También existe la aplicación del
     teléfono, y podés usar la que prefieras: es la misma cuenta.`)}
  ${paso(2, "Tocá «Crear mi cuenta»",
    `Te va a pedir tu <strong style="color:#DCCFB8;">nombre completo</strong>, tu
     <strong style="color:#DCCFB8;">correo</strong> y una
     <strong style="color:#DCCFB8;">contraseña</strong>. Nada más.`)}
  ${paso(3, "Guardá tu frase de respaldo",
    `Al crear la cuenta te vamos a mostrar doce palabras. Anotalas en papel y
     guardalas donde nadie las vea. Son la llave de tu dinero: quien las tenga,
     tiene lo tuyo — y nosotros no podemos recuperarlas por vos.`)}
  ${paso(4, "Abrí «Recibir» y tocá «Copiar dirección»",
    `La pantalla dice «Recibir ORIGEN», pero esa misma dirección sirve para
     recibir ${esc(token)}: viven en la misma cadena. Vas a ver algo que empieza
     con <span style="font-family:${MONO};color:#DCCFB8;">0x</span> y tiene 42
     caracteres.`)}
  ${paso(5, "Respondé a este correo y pegala",
    `Con eso nos alcanza. Te confirmamos cuando los ${esc(token)} estén en tu
     billetera, y los vas a poder ver vos mismo en el explorador de la cadena.`)}

  <!-- ── lo que se manda y lo que no ────────────────────────────────────────
       El momento en que a alguien le van a entregar tokens es exactamente
       cuando aparecen los estafadores. Esto no es un aviso al pie: es la pieza
       que le enseña a la persona a distinguir una cosa de la otra. -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="margin:26px 0 8px;border:1px solid rgba(201,169,97,.35);border-radius:6px;">
    <tr><td style="padding:18px 20px 16px;">
      <div style="font:600 10px/1 ${MONO};letter-spacing:.24em;text-transform:uppercase;color:#C9A961;">
        Para que nadie te engañe
      </div>

      <div style="margin-top:15px;font:600 13px/1.5 ${SANS};color:#8FD9A8;">
        ESTO SÍ nos lo mandás
      </div>
      <div style="font:400 13.5px/1.6 ${SANS};color:#C4B7A2;">
        Tu <strong style="color:#DCCFB8;">dirección</strong>: empieza con
        <span style="font-family:${MONO};">0x</span> y tiene 42 caracteres. Es
        pública, como un número de cuenta. Con ella solo se puede mandarte cosas,
        nunca sacarte nada.
      </div>

      <div style="margin-top:15px;font:600 13px/1.5 ${SANS};color:#E4574B;">
        ESTO NO se lo mandás a nadie. Nunca. Ni a nosotros
      </div>
      <div style="font:400 13.5px/1.6 ${SANS};color:#C4B7A2;">
        Tus <strong style="color:#DCCFB8;">doce palabras</strong> y tu
        <strong style="color:#DCCFB8;">contraseña</strong>. Orden Global no te las
        va a pedir jamás, por ningún medio. Si alguien lo hace —aunque escriba con
        nuestro nombre y nuestros colores— es un impostor.
      </div>
    </td></tr>
  </table>

  ${H("Y después, tu Genesis ID")}

  <p style="margin:0 0 13px;">
    ${esc(token)} no es una moneda cualquiera: es un valor negociable emitido bajo
    Próspera. Por eso la casa tiene que saber quién lo tiene, y por eso te vamos a
    pedir que hagas tu <strong style="color:#F3ECD9;">Genesis ID</strong>.
  </p>
  <p style="margin:0 0 13px;">
    Es tu identidad dentro del sistema, y es una sola llave para toda la casa: te
    verificás una vez y quedás verificado en todo lo que venga — la tarjeta Visa,
    el chat, Ordenex cuando abra. No hay que repetirlo en cada lugar.
  </p>
  <p style="margin:0 0 13px;">
    Son tres pasos y decide una persona del equipo, no una máquina. Desde el
    teléfono la cámara lee tu documento sola; desde la web lo escribís a mano. El
    trámite es el mismo y llega al mismo lugar.
  </p>

  ${botonCorreo("Hacer mi Genesis ID", IR_VERIFICAR)}

  ${H("Si querés conocer la casa")}

  <p style="margin:0 0 10px;">
    La cadena de Orden Global está inscrita en el registro público que usan las
    billeteras del mundo: <strong style="color:#F3ECD9;">cadena 5550, moneda
    ORIGEN</strong>. Podés mirarla por dentro, y podés comprobar ahí mismo la
    transferencia de tus ${esc(token)} cuando la hagamos.
  </p>
  <p style="margin:0 0 6px;font-size:14px;">
    <a href="${CADENA}" style="color:#C9A961;">ordenscan.com</a>
    <span style="color:#9A8C76;"> — el explorador de la cadena</span><br>
    <a href="${CASA}" style="color:#C9A961;">ordenglobal.org</a>
    <span style="color:#9A8C76;"> — la casa y lo que estamos construyendo</span><br>
    <a href="${SITIO}" style="color:#C9A961;">app.vetawallet.com</a>
    <span style="color:#9A8C76;"> — tu billetera</span>
  </p>

  <p style="margin:26px 0 0;padding-top:16px;border-top:1px solid rgba(243,236,217,.10);font-size:13px;line-height:1.65;color:#9A8C76;">
    Cualquier duda, respondé a este mismo correo y te contesta una persona. Si
    preferís que te acompañemos por teléfono mientras abrís la cuenta, decilo y lo
    coordinamos.
  </p>
  <p style="margin:12px 0 0;font-size:11.5px;line-height:1.6;color:#8A7C68;">
    ${esc(token)} es un valor negociable (<em>security token</em>) emitido bajo
    Próspera. Esta carta acompaña una entrega de tokens: no es una oferta, ni una
    invitación a invertir, ni una promesa de rentabilidad.
  </p>`);

  const texto = `TUS ${cantidad} ${token} TE ESTÁN ESPERANDO

Hola, ${primer}.

Te escribimos de Orden Global. Tenemos listos tus ${cantidad} ${token} y para
entregártelos solo falta una cosa: que abras tu billetera y nos pases tu
dirección. Son unos minutos.

CÓMO ABRIR TU BILLETERA

 1. Entrá a ${SITIO}
    Se abre en el navegador, sin instalar nada. También existe la aplicación
    del teléfono, y podés usar la que prefieras: es la misma cuenta.

 2. Tocá «Crear mi cuenta»
    Te va a pedir tu nombre completo, tu correo y una contraseña. Nada más.

 3. Guardá tu frase de respaldo
    Al crear la cuenta te vamos a mostrar doce palabras. Anotalas en papel y
    guardalas donde nadie las vea. Son la llave de tu dinero: quien las tenga,
    tiene lo tuyo — y nosotros no podemos recuperarlas por vos.

 4. Abrí «Recibir» y tocá «Copiar dirección»
    La pantalla dice «Recibir ORIGEN», pero esa misma dirección sirve para
    recibir ${token}: viven en la misma cadena. Vas a ver algo que empieza con
    0x y tiene 42 caracteres.

 5. Respondé a este correo y pegala
    Con eso nos alcanza. Te confirmamos cuando los ${token} estén en tu
    billetera, y los vas a poder ver vos mismo en el explorador de la cadena.

PARA QUE NADIE TE ENGAÑE

  ESTO SÍ nos lo mandás:
  Tu DIRECCIÓN. Empieza con 0x y tiene 42 caracteres. Es pública, como un
  número de cuenta. Con ella solo se puede mandarte cosas, nunca sacarte nada.

  ESTO NO se lo mandás a nadie. Nunca. Ni a nosotros:
  Tus DOCE PALABRAS y tu CONTRASEÑA. Orden Global no te las va a pedir jamás,
  por ningún medio. Si alguien lo hace —aunque escriba con nuestro nombre y
  nuestros colores— es un impostor.

Y DESPUÉS, TU GENESIS ID

${token} no es una moneda cualquiera: es un valor negociable emitido bajo
Próspera. Por eso la casa tiene que saber quién lo tiene, y por eso te vamos a
pedir que hagas tu Genesis ID.

Es tu identidad dentro del sistema, y es una sola llave para toda la casa: te
verificás una vez y quedás verificado en todo lo que venga — la tarjeta Visa,
el chat, Ordenex cuando abra. No hay que repetirlo en cada lugar.

Son tres pasos y decide una persona del equipo, no una máquina. Desde el
teléfono la cámara lee tu documento sola; desde la web lo escribís a mano. El
trámite es el mismo y llega al mismo lugar.

Hacer mi Genesis ID: ${IR_VERIFICAR}

SI QUERÉS CONOCER LA CASA

La cadena de Orden Global está inscrita en el registro público que usan las
billeteras del mundo: cadena 5550, moneda ORIGEN. Podés mirarla por dentro, y
podés comprobar ahí mismo la transferencia de tus ${token} cuando la hagamos.

  ${CADENA}     — el explorador de la cadena
  ${CASA}      — la casa y lo que estamos construyendo
  ${SITIO}  — tu billetera

Cualquier duda, respondé a este mismo correo y te contesta una persona. Si
preferís que te acompañemos por teléfono mientras abrís la cuenta, decilo y lo
coordinamos.

${token} es un valor negociable (security token) emitido bajo Próspera. Esta
carta acompaña una entrega de tokens: no es una oferta, ni una invitación a
invertir, ni una promesa de rentabilidad.

—
Orden Global Corp · Próspera, Roatán, Honduras
Nunca te vamos a pedir por correo tu contraseña ni tu frase de respaldo. Si un
mensaje a nombre nuestro te las pide, no es nuestro.
Escribinos a ${RESPUESTA}
`;

  return { asunto, html, texto };
}
