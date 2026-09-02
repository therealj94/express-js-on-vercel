/* La segunda carta: la app pesa un tercio, y ahora se puede instalar sin bajar nada.
 *
 * POR QUE SE ESCRIBE OTRA VEZ
 *
 * La primera carta salió a 407 personas con un archivo de 138 MB. Ese peso no
 * era la app: eran librerías para arquitecturas de emulador que ningún
 * teléfono usa, y librerías sin comprimir. Corregido eso, el mismo archivo
 * pesa 45 MB, un tercio. Y mientras tanto la web quedó instalable, así que hay una
 * puerta que no pasa por ningún archivo ni por ningún permiso.
 *
 * Escribir de nuevo a quien ya recibió algo tiene que ganarse el derecho. Se
 * gana con esas dos cosas: pesa un tercio, y hay una forma más fácil. Sin eso
 * esto sería un recordatorio, y un recordatorio a 407 personas es correo
 * basura escrito por nosotros mismos.
 *
 * COMO SE NOMBRA LO QUE PASO
 *
 * Con el número y sin drama. «Pesaba 138 MB y para muchos teléfonos era
 * demasiado» es verificable y no culpa a nadie. Lo que NO se hace es pedir
 * perdón tres veces ni hablar de «inconvenientes»: quien no pudo instalar ya
 * lo sabe, y lo que quiere es la solución en la primera pantalla.
 *
 * Y SE EMPIEZA POR LA PUERTA FACIL
 *
 * La primera carta abría con el archivo porque era lo único que había. Esta
 * abre con la instalación desde la web, que no tiene descarga, ni permiso de
 * «orígenes desconocidos», ni aviso de Play Protect. El archivo queda de
 * segunda opción, con el mismo tutorial de siempre para quien lo prefiera.
 *
 * A QUIEN YA LA TIENE
 *
 * Se le dice en una línea que no tiene que hacer nada. Sin eso, la carta le
 * pide trabajo a quien ya hizo el trabajo, que es la forma más rápida de que
 * la próxima no la abra.
 */

import { marco, botonCorreo, escaparCorreo as esc } from "./correo.js";
import { saludo, H, paso, pantalla, toca, enlaceBaja, PAGINA } from "./cartaInstalar.js";

/* El APK NUEVO. Se cambia aquí y en `apps-web/veta-wallet/instalar.html` cada
   vez que se compila, igual que el de la primera carta. */
export const APK =
  "https://expo.dev/artifacts/eas/Ic0h-h9Q73j63q_21gka5i8HCKN-OlI-3RfRc5aDelI.apk";
export const VERSION = "1.33.3";
export const PESO = "45 MB";
export const PESO_ANTES = "138 MB";

export const ASUNTO = "Ahora pesa un tercio, y podés instalarla sin descargar nada";

export function cartaSegundaVuelta({ nombre, correo }) {
  const baja = enlaceBaja(correo);

  const html = marco(
    "Dos formas de tenerla, las dos más fáciles",
    `
  <p style="margin:14px 0 16px;font-size:16px;color:#F3ECD9;">${esc(saludo(nombre, correo))}</p>

  <p style="margin:0 0 12px;">
    Hace unos días te mandamos la app para el teléfono. A varios no les bajó, o
    el teléfono no los dejó instalarla. El archivo pesaba
    <strong style="color:#F3ECD9;">${esc(PESO_ANTES)}</strong>, y para muchos
    teléfonos y muchas conexiones eso era demasiado.
  </p>
  <p style="margin:0 0 16px;">
    Ya lo arreglamos. Ahora pesa
    <strong style="color:#F3ECD9;">${esc(PESO)}</strong>, un tercio de lo que pesaba.
    Y hay una
    segunda forma de tenerla que no pasa por ningún archivo.
  </p>

  <p style="margin:0 0 20px;padding:11px 13px;border-left:3px solid #C9A961;background:rgba(201,169,97,.07);border-radius:0 8px 8px 0;font-size:14px;color:#EFE3C6;">
    Si ya la instalaste, no tenés que hacer nada: la app se pone al día sola.
  </p>

  ${H("La forma fácil: instalarla desde la web")}

  <p style="margin:0 0 14px;">
    Sin descargar nada, sin permisos y sin avisos. Te queda con su icono en la
    pantalla de inicio, igual que cualquier otra app.
  </p>

  ${botonCorreo("Abrir Orden Global", "https://app.vetawallet.com")}

  ${paso(1, "Abrí ese botón desde el teléfono", `
    Se abre en tu navegador, con tu cuenta de siempre.`)}

  ${paso(2, "Tocá el menú del navegador", `
    Los tres puntos de arriba a la derecha, en Chrome.`)}

  ${paso(3, "Tocá «Instalar aplicación»", `
    En algunos teléfonos dice ${toca("Agregar a la pantalla principal")}. En
    iPhone, con Safari, es el botón de compartir y después
    ${toca("Agregar a inicio")}.`)}

  <p style="margin:0 0 4px;font-size:14px;color:#9A8C76;">
    Es tu misma cuenta: tu plata, tus mensajes y tu identidad, lo mismo de
    siempre. Para recibir los avisos, el navegador te los va a pedir una vez.
  </p>

  ${H("La otra: el archivo, ahora de " + PESO)}

  <p style="margin:0 0 14px;font-size:14px;color:#9A8C76;">
    Si preferís la app instalada de un archivo, es este. Los pasos son los
    mismos de la otra vez, y el teléfono te va a pedir los mismos permisos
    porque todavía no estamos en la Play Store.
  </p>

  ${botonCorreo("Descargar la app", APK)}

  <p style="margin:0 0 16px;font-size:13px;color:#9A8C76;">
    ${esc(PESO)} · solo Android · versión ${esc(VERSION)}<br>
    Abrí este correo <strong style="color:#D8CFBE;">desde el teléfono</strong>: el archivo
    tiene que quedar en el aparato donde vas a usar la app.
  </p>

  ${paso(1, "Tocá «Descargar la app»", `
    ${pantalla("lo dice tu navegador", "«Este tipo de archivo puede dañar tu dispositivo. ¿Quieres conservarlo de todos modos?»")}
    Tocá ${toca("Descargar de todos modos")}. Es lo que Android le dice a
    cualquier app que todavía no está en la tienda.`)}

  ${paso(2, "Abrí el archivo", `
    Bajá la barra de notificaciones y tocá la descarga terminada. O entrá a
    <strong style="color:#F3ECD9;">Archivos → Descargas</strong>.`)}

  ${paso(3, "Dale permiso a tu navegador, una sola vez", `
    ${pantalla("lo dice Android", "«Por seguridad, tu teléfono no puede instalar aplicaciones desconocidas de esta fuente.»")}
    Tocá ${toca("Configuración")} y activá ${toca("Permitir de esta fuente")}.
    Ese permiso se lo estás dando a <strong style="color:#F3ECD9;">tu navegador</strong>,
    y lo podés apagar de nuevo apenas termines.`)}

  ${paso(4, "Instalar", `
    ${pantalla("puede decir Play Protect", "«Play Protect no reconoce al desarrollador de esta app.»")}
    Tocá ${toca("Instalar de todas formas")} — a veces está detrás de
    ${toca("Más detalles")}. No está diciendo que encontró algo: está diciendo
    que todavía no la revisó, porque no pasó por la tienda.`)}

  ${paso(5, "Entrá con tu correo de siempre", `
    Es la misma cuenta: lo que tenés ya está ahí.`)}

  <p style="margin:18px 0 0;font-size:14px;">
    Los mismos pasos, en una página que podés abrir cuando quieras:
    <a href="${PAGINA}" style="color:#C9A961;">${esc(PAGINA)}</a>
  </p>

  ${H("Lo que hay que saber, dicho claro")}
  <p style="margin:0 0 12px;">
    Veta Wallet es una <strong style="color:#F3ECD9;">billetera custodia</strong>:
    guardamos tu llave cifrada por vos, igual que un banco guarda tu dinero. No
    somos un banco y tus saldos no están cubiertos por ningún seguro de
    depósitos. Está todo escrito, sin letra chica, en los
    <a href="https://app.vetawallet.com/terminos" style="color:#C9A961;">términos</a>.
  </p>
  <p style="margin:0 0 12px;">
    Lo único que tenés que cuidar es tu contraseña, y
    <strong style="color:#F3ECD9;">no te la vamos a pedir nunca</strong>: ni por
    correo, ni por WhatsApp, ni por teléfono. Si alguien te la pide a nombre
    nuestro, es un engaño.
  </p>
  <p style="margin:0 0 12px;">
    Si se te traba algo, escribinos y lo vemos con vos:
    <a href="https://wa.me/50432136457" style="color:#C9A961;">wa.me/50432136457</a>
  </p>
  `,
    `Te escribimos porque tenés una cuenta en Orden Global.
     Para no recibir más correos como este:
     <a href="${baja}" style="color:#9A8C76;">darse de baja</a>.
     Vas a seguir recibiendo los de tu cuenta —entrar, recuperar la contraseña—,
     que son otra cosa.`
  );

  const texto = `${saludo(nombre, correo)}

Hace unos días te mandamos la app para el teléfono. A varios no les bajó, o el
teléfono no los dejó instalarla. El archivo pesaba ${PESO_ANTES}, y para muchos
teléfonos y muchas conexiones eso era demasiado.

Ya lo arreglamos. Ahora pesa ${PESO}, un tercio de lo que pesaba. Y hay una segunda forma de
tenerla que no pasa por ningún archivo.

Si ya la instalaste, no tenés que hacer nada: la app se pone al día sola.


LA FORMA FÁCIL: INSTALARLA DESDE LA WEB

Sin descargar nada, sin permisos y sin avisos. Te queda con su icono en la
pantalla de inicio, igual que cualquier otra app.

https://app.vetawallet.com

1 · Abrí ese enlace desde el teléfono.
2 · Tocá el menú del navegador (los tres puntos, en Chrome).
3 · Tocá «Instalar aplicación». En algunos teléfonos dice «Agregar a la
    pantalla principal». En iPhone, con Safari, es el botón de compartir y
    después «Agregar a inicio».

Es tu misma cuenta: tu plata, tus mensajes y tu identidad, lo mismo de siempre.
Para recibir los avisos, el navegador te los va a pedir una vez.


LA OTRA: EL ARCHIVO, AHORA DE ${PESO}

${APK}

${PESO} · solo Android · versión ${VERSION}
Abrí este enlace DESDE EL TELÉFONO: el archivo tiene que quedar en el aparato
donde vas a usar la app.

1 · Tocá el enlace de arriba
    Tu navegador va a decir: «Este tipo de archivo puede dañar tu
    dispositivo». Tocá «Descargar de todos modos».

2 · Abrí el archivo
    Bajá la barra de notificaciones y tocá la descarga. O entrá a
    Archivos → Descargas.

3 · Dale permiso a tu navegador, una sola vez
    Android va a decir: «Por seguridad, tu teléfono no puede instalar
    aplicaciones desconocidas de esta fuente». Tocá «Configuración» y activá
    «Permitir de esta fuente». Ese permiso se lo estás dando a tu navegador,
    y lo podés apagar de nuevo apenas termines.

4 · Instalar
    Puede decir «Play Protect no reconoce al desarrollador». Tocá «Instalar
    de todas formas». No está diciendo que encontró algo: está diciendo que
    todavía no la revisó, porque no pasó por la tienda.

5 · Entrá con tu correo de siempre
    Es la misma cuenta: lo que tenés ya está ahí.

Los mismos pasos, en una página: ${PAGINA}


LO QUE HAY QUE SABER, DICHO CLARO

Veta Wallet es una billetera custodia: guardamos tu llave cifrada por vos,
igual que un banco guarda tu dinero. No somos un banco y tus saldos no están
cubiertos por ningún seguro de depósitos. Está todo escrito, sin letra chica:
https://app.vetawallet.com/terminos

Lo único que tenés que cuidar es tu contraseña, y no te la vamos a pedir
nunca: ni por correo, ni por WhatsApp, ni por teléfono. Si alguien te la pide
a nombre nuestro, es un engaño.

Si se te traba algo, escribinos y lo vemos con vos: wa.me/50432136457

—
Orden Global Corp · Próspera, Roatán, Honduras
Nunca te vamos a pedir por correo tu contraseña ni tu frase de respaldo. Si un
mensaje a nombre nuestro te las pide, no es nuestro.

Te escribimos porque tenés una cuenta en Orden Global. Para no recibir más
correos como este: ${baja}
Vas a seguir recibiendo los de tu cuenta (entrar, recuperar la contraseña),
que son otra cosa.
`;

  return { asunto: ASUNTO, html, texto };
}
