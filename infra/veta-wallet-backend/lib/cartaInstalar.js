/* La carta que da la app para Android.
 *
 * A QUIEN SE LE ESCRIBE
 *
 * A quien ya tiene cuenta. No hay nada que registrar ni que explicar de cero:
 * entra con el mismo correo y encuentra lo suyo. Por eso la carta no vende la
 * cuenta — la da por hecha, que es la verdad.
 *
 * EL PROBLEMA QUE ESTA CARTA TIENE QUE RESOLVER
 *
 * La app todavía no está en la Play Store, así que se instala con un archivo
 * que damos nosotros. Android muestra TRES avisos por ese camino, y ninguno se
 * puede quitar: el del navegador al bajar, el del permiso por aplicación, y el
 * de Play Protect. Existen precisamente porque el archivo no viene de la
 * tienda.
 *
 * La carta los nombra los tres, con lo que hay que tocar en cada uno. Pero
 * NO ABRE POR AHÍ: quien lee empieza por lo que gana, no por la fricción. Los
 * avisos aparecen dentro de los pasos, donde de verdad ocurren.
 *
 * Y no se nombra la estafa. Una versión anterior decía «quien te quiere
 * estafar nunca te avisa de lo que vas a ver» — un argumento correcto que le
 * mete la palabra en la cabeza a quien no la tenía. Explicar por qué uno es de
 * fiar es de las cosas que menos hacen que uno lo parezca.
 *
 * LAS REGLAS DEL CORREO DE LA CASA (las mismas de `cartaNovedades.js`)
 *
 *   1. Texto plano Y HTML. Hay clientes que no pintan HTML, y una carta que
 *      llega en blanco es peor que no mandarla.
 *   2. Ni una imagen remota — el marco de `correo.js` ya se encarga.
 *   3. Nunca se pide contraseña ni frase de respaldo. El pie del marco lo dice
 *      en cada carta, y acá se dice además con sus palabras.
 *   4. No se vende lo que no está abierto. Aquí eso es: iPhone todavía no, y
 *      se dice de frente en vez de dejar que lo descubran instalando.
 */

import { marco, botonCorreo, escaparCorreo as esc } from "./correo.js";
import { firmaBaja } from "./firmaBaja.js";

/* El APK. Vive aquí y en `apps-web/veta-wallet/instalar.html`, que es la
   página con los mismos pasos: quien prefiera leerlos en el navegador
   encuentra exactamente lo mismo. Al compilar una versión nueva se cambian
   los dos. */
export const APK =
  "https://expo.dev/artifacts/eas/lxUN7f_SoutSa68XE896XE33aQtHhVFeSFtNutQwiDs.apk";
export const PAGINA = "https://app.vetawallet.com/instalar";
export const VERSION = "1.33.2";

const BAJA =
  (process.env.API_PUBLICA || "https://vetawallet-1a2e38ac52b1.herokuapp.com") +
  "/baja";

export const enlaceBaja = (correo) =>
  `${BAJA}?c=${encodeURIComponent(correo)}&f=${encodeURIComponent(firmaBaja(correo))}`;

export const ASUNTO = "Ya podés llevarte Orden Global en el teléfono";

/* El nombre de pila, o nada.
 *
 * En la base, el campo del nombre trae MUCHAS VECES el correo: de 418
 * personas, solo 69 tienen un nombre de verdad. Sin esta comprobación la carta
 * abría con «Hola, 0aldair0@gmail.com» — peor que no saludar, porque dice a la
 * cara que esto lo mandó una máquina que no sabe quién sos.
 *
 * Y del nombre completo se usa SOLO EL PRIMERO: «Hola, Alberto» se lee como
 * una persona escribiendo; «Hola, Alberto Jesús Morales Martínez» se lee como
 * una base de datos.
 */
const saludo = (nombre, correo) => {
  const n = String(nombre || "").trim();
  if (!n || n.includes("@")) return "Hola.";
  if (n.toLowerCase() === String(correo || "").split("@")[0].toLowerCase())
    return "Hola.";
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]{2}/.test(n)) return "Hola.";
  const primero = n.split(/\s+/)[0];
  return `Hola, ${primero === primero.toUpperCase()
    ? primero.charAt(0) + primero.slice(1).toLowerCase()
    : primero}.`;
};

const H = (t) =>
  `<div style="margin:26px 0 10px;font:700 17px/1.35 Georgia,serif;color:#F3ECD9;">${esc(t)}</div>`;

/* Un paso, con su número. El número va en un círculo a la izquierda porque la
   vista lo sigue sin leer, y quien instala con el teléfono en una mano
   necesita saber por dónde iba sin releer. */
const paso = (n, titulo, dentro) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;">
    <tr>
      <td width="34" valign="top" style="padding-top:2px;">
        <div style="width:26px;height:26px;border-radius:50%;background:#C9A961;color:#1A1206;font:700 14px/26px -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;text-align:center;">${n}</div>
      </td>
      <td valign="top">
        <strong style="color:#F3ECD9;">${esc(titulo)}</strong>
        <div style="margin-top:4px;">${dentro}</div>
      </td>
    </tr>
  </table>`;

/* Lo que va a decir la pantalla del teléfono, TAL CUAL. Se cita con su marca
   para que se vea que es el aparato hablando y no nosotros: el aviso lo va a
   ver igual, y suavizarlo sería prepararle una sorpresa. */
const pantalla = (quien, dice) =>
  `<div style="margin:8px 0 10px;padding:11px 13px;border-left:3px solid #E8B84B;background:rgba(232,184,75,.07);border-radius:0 8px 8px 0;">
    <div style="font:700 11px/1 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:.7px;text-transform:uppercase;color:#E8B84B;margin-bottom:5px;">${esc(quien)}</div>
    <div style="color:#EFE3C6;font-size:14px;">${esc(dice)}</div>
  </div>`;

const toca = (t) => `<strong style="color:#C9A961;">${esc(t)}</strong>`;

export function cartaInstalar({ nombre, correo }) {
  const baja = enlaceBaja(correo);

  const html = marco(
    "Orden Global en tu teléfono",
    `
  <p style="margin:14px 0 16px;font-size:16px;color:#F3ECD9;">${esc(saludo(nombre, correo))}</p>

  <p style="margin:0 0 12px;">
    Ya podés llevarte Orden Global en el teléfono: tu plata, tus mensajes y tu
    identidad en una sola app, con
    <strong style="color:#F3ECD9;">la misma cuenta que ya usás en la web</strong>.
  </p>
  <p style="margin:0 0 4px;">
    Cada movimiento tuyo queda escrito en nuestra propia cadena y lo podés
    comprobar en <a href="https://ordenscan.com" style="color:#C9A961;">ordenscan.com</a>
    cuando quieras, sin pedirle permiso a nadie.
  </p>

  ${botonCorreo("Descargar la app", APK)}

  <p style="margin:0 0 4px;font-size:13px;color:#9A8C76;">
    138 MB · solo Android · versión ${esc(VERSION)}<br>
    Abrí este correo <strong style="color:#D8CFBE;">desde el teléfono</strong>: el archivo
    tiene que quedar en el aparato donde vas a usar la app.
  </p>

  ${H("Los pasos")}

  <p style="margin:0 0 16px;font-size:14px;color:#9A8C76;">
    Como todavía no está en la Play Store, el teléfono te va a pedir un par de
    permisos por el camino. Acá está cada uno con lo que hay que tocar.
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

  ${H("Pronto, directo desde Play Store")}
  <p style="margin:0 0 12px;">
    Ya la estamos subiendo. Cuando salga se baja como cualquier otra app, de un
    toque, y las actualizaciones te llegan solas. Y si la instalás hoy no
    perdés nada: te avisamos y se pasa sola, con tus datos y tu cuenta
    intactos.
  </p>
  <p style="margin:0 0 12px;font-size:14px;color:#9A8C76;">
    Por ahora solo Android. Si tenés iPhone, te avisamos cuando esté.
  </p>

  ${H("Tus llaves son tuyas")}
  <p style="margin:0 0 12px;">
    Tu contraseña y tus doce palabras <strong style="color:#F3ECD9;">no salen de tu
    teléfono</strong> y nosotros no las tenemos. Por eso no te las vamos a pedir
    nunca: ni por correo, ni por WhatsApp, ni por teléfono.
  </p>
  <p style="margin:0;">
    Si se te traba algo, escribinos y lo vemos con vos:
    <a href="https://wa.me/50432136457" style="color:#C9A961;">wa.me/50432136457</a>
  </p>`,
    `Te escribimos porque tenés una cuenta en Orden Global.
     Para no recibir más correos como este:
     <a href="${baja}" style="color:#9A8C76;">darse de baja</a>.
     Vas a seguir recibiendo los de tu cuenta —entrar, recuperar la contraseña—,
     que son otra cosa.`
  );

  const texto = `${saludo(nombre, correo)}

Ya podés llevarte Orden Global en el teléfono: tu plata, tus mensajes y tu
identidad en una sola app, con la misma cuenta que ya usás en la web.

Cada movimiento tuyo queda escrito en nuestra propia cadena y lo podés
comprobar en ordenscan.com cuando quieras, sin pedirle permiso a nadie.

DESCARGAR LA APP
${APK}

138 MB · solo Android · versión ${VERSION}
Abrí este enlace DESDE EL TELÉFONO: el archivo tiene que quedar en el aparato
donde vas a usar la app.


LOS PASOS

Como todavía no está en la Play Store, el teléfono te va a pedir un par de
permisos por el camino. Acá está cada uno con lo que hay que tocar.

1 · Tocá el enlace de arriba
    Tu navegador va a decir: «Este tipo de archivo puede dañar tu
    dispositivo». Tocá «Descargar de todos modos». Es lo que Android le dice
    a cualquier app que todavía no está en la tienda.

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


PRONTO, DIRECTO DESDE PLAY STORE

Ya la estamos subiendo. Cuando salga se baja como cualquier otra app, de un
toque, y las actualizaciones te llegan solas. Y si la instalás hoy no perdés
nada: te avisamos y se pasa sola, con tus datos y tu cuenta intactos.

Por ahora solo Android. Si tenés iPhone, te avisamos cuando esté.


TUS LLAVES SON TUYAS

Tu contraseña y tus doce palabras no salen de tu teléfono y nosotros no las
tenemos. Por eso no te las vamos a pedir nunca: ni por correo, ni por
WhatsApp, ni por teléfono.

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
