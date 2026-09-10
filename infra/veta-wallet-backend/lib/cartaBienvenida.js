/* La carta de bienvenida a Orden Global.
 *
 * A QUIEN SE LE ESCRIBE
 *
 * A todo el que tiene cuenta en Veta Wallet. A los 441 que ya la tenían, una
 * vez; y de aquí en adelante, a cada persona nueva en cuanto confirma su
 * correo. Es la misma carta con una sola frase distinta, y eso es a propósito:
 * dos cartas separadas se desincronizan al segundo cambio, y entonces la mitad
 * de la gente lee una versión vieja del ecosistema.
 *
 * NO es para las identidades de Genesis ID. Esas viven en otra base, con otra
 * conexión, y muchas pertenecen a personas que se verificaron para un tercero
 * y nunca abrieron una billetera con nosotros.
 *
 * POR QUE SE MANDA AL CONFIRMAR Y NO AL REGISTRARSE
 *
 * Porque una dirección sin confirmar puede ser una errata o un buzón que no
 * existe, y cada una de esas es un rebote. Amazon suspende la cuenta por
 * encima del diez por ciento de rebotes, y lo que se cae con la cuenta no es
 * esta carta: es el correo de recuperar la contraseña. Esperar a la
 * confirmación cuesta un rato y ahorra ese riesgo entero.
 *
 * LAS REGLAS DE LA CASA, QUE AQUI TAMBIEN MANDAN
 *
 *   1. Texto plano Y HTML. Un cliente que no pinta HTML tiene que poder leerla.
 *   2. Ni una imagen remota. La mayoría de los clientes las bloquea, y una
 *      carta cuyo sentido dependa de una imagen llega rota.
 *   3. Nunca se pide una contraseña ni una frase de respaldo. El pie lo dice.
 *   4. Solo se cuenta lo que está abierto de verdad. Ordenex y la tarjeta en
 *      Google Pay siguen en obra, así que no aparecen: una carta que ofrece lo
 *      que no está consigue que la persona entre, no lo encuentre, y no vuelva.
 *
 * Y una regla de escritura que pidió José y que conviene explicar, porque es
 * fácil romperla sin querer: NI UN GUION en el texto. Ni el corto ni el largo.
 * El guion largo para meter incisos es el tic que delata un texto escrito por
 * una máquina, y una carta que huele a máquina se borra sin leer. Se escribe
 * con puntos y con comas. Hay una prueba que lo comprueba en cada corrida.
 */

import { marco, botonCorreo, escaparCorreo as esc } from "./correo.js";
import { enlaceBaja } from "./cartaNovedades.js";

const SITIO = "https://app.vetawallet.com";
const SCAN = "https://ordenscan.com";

export const ASUNTO = "Tu cuenta ahora abre todo Orden Global";

const saludo = (nombre) => {
  const n = String(nombre || "").trim().split(/\s+/)[0];
  return n ? `Hola, ${n}.` : "Hola.";
};

/* La apertura es lo único que cambia entre quien ya estaba y quien acaba de
   llegar. A quien ya tenía cuenta hay que decirle qué cambió; a quien acaba de
   abrirla, dónde acaba de entrar. Decirle «bienvenido» a alguien que lleva
   meses registrado es la forma más rápida de que deje de leer. */
const APERTURA = {
  viejo:
    "Abriste tu cuenta para guardar dinero. Hoy esa misma cuenta te abre todo lo que construimos alrededor, sin registrarte otra vez y sin otra contraseña.",
  nuevo:
    "Tu cuenta ya está confirmada. Con ella entrás a todo lo que construimos, sin registrarte otra vez y sin otra contraseña.",
};

/* Las cuatro piezas. Van como filas de un registro y no como una lista con
   viñetas: sin guiones que abrir, y porque es la misma forma que tiene la
   constancia de la cadena en el sitio. Que el correo y la web se parezcan no
   es coquetería; es lo que hace que una suplantación se note. */
const PIEZAS = [
  {
    rotulo: "Tu dinero",
    nombre: "Veta Wallet",
    texto:
      "Guardás ORIGEN, pagás con una tarjeta Visa virtual en cualquier tienda en línea del mundo, y le enviás a quien quieras en segundos.",
  },
  {
    rotulo: "Tu gente",
    nombre: "PULSE2CHAT",
    texto:
      "Mensajes, llamadas y grupos. Se cifran en tu teléfono y se abren en el de la otra persona. Ni nosotros podemos leerlos.",
  },
  {
    rotulo: "Tu identidad",
    nombre: "Genesis ID",
    texto:
      "Verificás quién sos una sola vez, y esa verificación vale en todo el ecosistema.",
  },
  {
    rotulo: "Debajo de todo",
    nombre: "Nuestra propia cadena",
    texto:
      "No alquilamos la red de nadie. La 5550 es nuestra, la sostienen siete validadores y figura en el registro público que consultan las billeteras del mundo. Cada movimiento se puede mirar por fuera.",
  },
];

const filaHtml = (p) => `
  <div style="padding:17px 0;border-top:1px solid rgba(201,169,97,.20);">
    <div style="font:600 11px/1 Georgia,serif;letter-spacing:.22em;text-transform:uppercase;color:#C9A961;">${esc(p.rotulo)}</div>
    <div style="margin:7px 0 5px;font:700 18px/1.25 Georgia,serif;color:#F3ECD9;">${esc(p.nombre)}</div>
    <div style="font-size:14.5px;line-height:1.6;color:#D8CFBE;">${esc(p.texto)}</div>
  </div>`;

const filaTexto = (p) =>
  `${p.rotulo.toUpperCase()}\n${p.nombre}\n${p.texto}\n`;

/**
 * La carta, en HTML y en texto.
 *
 * @param {{nombre?:string, correo:string, nuevo?:boolean}} quien
 */
export function cartaBienvenida({ nombre, correo, nuevo = false }) {
  const baja = enlaceBaja(correo);
  const abre = nuevo ? APERTURA.nuevo : APERTURA.viejo;

  const html = marco(
    "Orden Global",
    `
  <h1 style="margin:14px 0 4px;font:700 27px/1.18 Georgia,serif;color:#F3ECD9;">Una cuenta.<br>Todo el ecosistema.</h1>
  <p style="margin:16px 0 6px;font-size:16px;color:#F3ECD9;">${esc(saludo(nombre))}</p>
  <p style="margin:0 0 22px;">${esc(abre)}</p>

  ${PIEZAS.map(filaHtml).join("")}

  <div style="margin:20px 0 4px;padding:13px 15px;border:1px solid rgba(201,169,97,.22);border-radius:8px;background:rgba(201,169,97,.05);">
    <div style="font:400 12.5px/1.5 ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace;letter-spacing:.03em;color:#EFDDB0;">chainId 5550 &middot; ogb &middot; ORIGEN</div>
    <div style="margin-top:6px;font-size:12.5px;line-height:1.5;color:#9A8C76;">La ficha de nuestra red en el registro público. Cualquiera puede encontrarla y conectarse sin pedirnos permiso.</div>
  </div>

  ${botonCorreo("Entrar a mi cuenta", SITIO)}

  <p style="margin:0;font-size:15px;color:#F3ECD9;">Es la misma llave que ya tenés.</p>
`,
    `<a href="${baja}" style="color:#9A8C76;">Si no querés recibir más correos como este, dale de baja acá</a>.`
  );

  const texto = `${saludo(nombre)}

${abre}

${PIEZAS.map(filaTexto).join("\n")}
chainId 5550 · ogb · ORIGEN
La ficha de nuestra red en el registro público. Cualquiera puede encontrarla y conectarse sin pedirnos permiso.

Entrar a mi cuenta: ${SITIO}
Mirar la cadena por fuera: ${SCAN}

Es la misma llave que ya tenés.

Orden Global Corp, Próspera, Roatán, Honduras.
Nunca te vamos a pedir por correo tu contraseña ni tu frase de respaldo.
Si no querés recibir más correos como este: ${baja}
`;

  return { asunto: ASUNTO, html, texto };
}
