/* La carta que invita a volver a Veta Wallet.
 *
 * A QUIEN SE LE ESCRIBE, Y POR QUE ESO CAMBIA EL TEXTO ENTERO
 *
 * Se le escribe a gente que YA abrió su cuenta. Al 20 de agosto de 2026 son
 * 440 cuentas con correo, y de esas solo 26 tienen la identidad verificada.
 * Es decir: 414 personas se registraron y ahí se quedaron.
 *
 * Por eso la carta NO dice «registrate» —ya lo hicieron, y decírselo es la
 * forma más rápida de que dejen de leer—. Dice otra cosa: tu cuenta ya
 * existe, le falta un paso, y ese paso te abre la tarjeta y te mete al
 * sorteo.
 *
 * LAS REGLAS DEL CORREO DE LA CASA
 *
 *   1. Texto plano Y HTML. Hay clientes que no pintan HTML, y una carta que
 *      llega en blanco es peor que no mandarla.
 *   2. Ni una imagen remota — el marco de `correo.js` ya se encarga.
 *   3. La regla de cobre: AUKA SIGUE el precio de la onza. Nunca «es una
 *      onza» ni «respaldado por oro» (Decisión 4 de la Junta, expediente del
 *      14/08). Donde se invita al sorteo van el +18 y el enlace a las bases.
 *   4. Acá no se pide NUNCA una contraseña ni una frase de respaldo. El pie
 *      del marco lo dice en cada carta.
 *
 * Y una quinta, que es de esta carta en particular:
 *
 *   5. NO SE VENDE LO QUE NO ESTA ABIERTO. Comprar y cambiar activos siguen
 *      en obra dentro de la billetera, y la tarjeta todavía no entra a Google
 *      Pay ni a Apple Pay. Una carta que los ofrece consigue que la persona
 *      entre, no los encuentre, y no vuelva. Se dicen al final con todas las
 *      letras — y eso es justamente lo que hace creíble todo lo de arriba.
 *
 * Lo que sí está vivo, y por eso sí se cuenta: la tarjeta Visa virtual (25
 * emitidas), pagarle a un comercio, remesas, cobrar con código, y AU-RA.
 *
 * El marco visual, el botón y el escapado salen de `correo.js`: son los
 * mismos de la carta de confirmar cuenta y la de recuperar contraseña. Una
 * carta de avisos que no se parece a las demás enseña a la gente que el
 * aspecto no significa nada, que es justo lo que aprovecha una suplantación.
 */

import { marco, botonCorreo, escaparCorreo as esc } from "./correo.js";
import { firmaBaja } from "./firmaBaja.js";

const SITIO = "https://app.vetawallet.com";
const BASES = "https://vetawallet.com/sorteo-orden-global";

/* La baja la atiende el BACKEND, no el sitio estático: app.vetawallet.com es
   Amplify sirviendo archivos, y ahí no hay quien escriba en la base. Apuntarlo
   allá daría un 404 elegante y ninguna baja. */
const BAJA = (process.env.API_PUBLICA || "https://vetawallet-1a2e38ac52b1.herokuapp.com") + "/baja";

/** 9-sep-2026 23:59:59 en Honduras (UTC−6) — el MISMO instante que app.js. */
const SORTEO_FIN = Date.UTC(2026, 8, 10, 5, 59, 59);
export const sorteoVivo = () => Date.now() < SORTEO_FIN;

/** El enlace de baja de una dirección, ya firmado. */
export const enlaceBaja = (correo) =>
  `${BAJA}?c=${encodeURIComponent(correo || "")}&f=${firmaBaja(correo)}`;

/** El primer nombre, para saludar sin solemnidad. Sin nombre, se saluda igual. */
const saludo = (nombre) => {
  const n = String(nombre || "").trim().split(/\s+/)[0];
  return n ? `Hola, ${n}.` : "Hola.";
};

/* El asunto.
 *
 * Dice lo único que la persona no sabe: que su cuenta está abierta y le falta
 * algo. Nada de «novedades» ni de «te extrañamos», que es lo que se borra sin
 * abrir. Y sin emoji: el asunto de un correo que habla de dinero no compite
 * con la publicidad, compite con la desconfianza. */
export const ASUNTO = "Tu cuenta de Veta Wallet está abierta. Le falta un paso.";

const H = (t) =>
  `<div style="margin:26px 0 10px;font:700 17px/1.35 Georgia,serif;color:#F3ECD9;">${esc(t)}</div>`;

const punto = (titulo, texto) =>
  `<div style="margin:0 0 13px;padding-left:14px;border-left:2px solid rgba(201,169,97,.35);">
    <strong style="color:#F3ECD9;">${esc(titulo)}</strong> ${texto}
  </div>`;

/**
 * La carta, en sus dos formas.
 *
 * @param {{nombre?: string, correo: string}} p
 * @returns {{asunto: string, html: string, texto: string}}
 */
export function cartaNovedades({ nombre, correo }) {
  const vivo = sorteoVivo();
  const baja = enlaceBaja(correo);

  /* El bloque del sorteo desaparece solo cuando pasa la fecha. Misma regla que
     en la web: una carta que sigue invitando a un sorteo cerrado es una
     promesa que no se puede cumplir, y se manda sola si nadie la quita. */
  const sorteoHtml = !vivo ? "" : `
  ${H("Y de paso: sorteamos 1 AUKA")}
  <p style="margin:0 0 12px;">
    AUKA <strong style="color:#F3ECD9;">sigue el precio de una onza de oro</strong>: sube el oro,
    sube AUKA. No te entrega metal — sigue el precio, y te lo decimos antes de que lo preguntes.
  </p>
  <p style="margin:0 0 12px;">
    No hay que comprar nada. Te verificás y ya estás participando. Cierra el
    <strong style="color:#F3ECD9;">9 de septiembre</strong>. Si invitás a alguien y completa su
    verificación, sumás otra participación.
  </p>
  <p style="margin:0;font-size:13px;color:#9A8C76;">
    Solo mayores de 18 años · <a href="${BASES}" style="color:#C9A961;">bases del sorteo</a>
  </p>`;

  const sorteoTexto = !vivo ? "" : `
Y DE PASO: SORTEAMOS 1 AUKA

AUKA sigue el precio de una onza de oro: sube el oro, sube AUKA. No te
entrega metal — sigue el precio, y te lo decimos antes de que lo preguntes.

No hay que comprar nada. Te verificás y ya estás participando. Cierra el 9 de
septiembre. Si invitás a alguien y completa su verificación, sumás otra
participación.

Solo mayores de 18 años. Bases: ${BASES}
`;

  const html = marco("Tu cuenta de Veta Wallet", `
  <p style="margin:14px 0 14px;font-size:16px;color:#F3ECD9;">${esc(saludo(nombre))}</p>

  <p style="margin:0 0 8px;">
    Abriste tu cuenta en Veta Wallet y ahí quedó. Desde entonces le cambiamos
    casi todo, y vale la pena que la veas.
  </p>

  ${H("Lo que hay hoy")}

  ${punto("Una tarjeta Visa virtual.",
    "Gasta directo de tu saldo en ORIGEN. Comprás en cualquier tienda en línea del mundo que acepte Visa, sin cuenta bancaria y sin ir a ninguna sucursal.")}
  ${punto("Pagarle a un comercio.",
    "Escaneás su código y listo. Hay comercios en diecinueve países.")}
  ${punto("Remesas.",
    "Ponés el monto y ves cuánto llega del otro lado <em>antes</em> de mandar nada.")}
  ${punto("Cobrar con un código.",
    "Con la cantidad ya puesta, para que te paguen sin dictar tu dirección letra por letra.")}
  ${punto("AU-RA.",
    "Te contesta dentro de la app cuando algo no se entiende.")}

  ${H("Te falta un paso: verificarte")}

  <p style="margin:0 0 12px;">
    Tu documento y una selfie. Toma unos cinco minutos. Con eso se te abre la
    tarjeta —hoy no se puede emitir sin identidad verificada—${vivo ? " y quedás adentro del sorteo" : ""}.
  </p>

  ${botonCorreo("Entrar a mi cuenta", SITIO)}

  ${sorteoHtml}

  <p style="margin:26px 0 0;padding-top:16px;border-top:1px solid rgba(243,236,217,.10);font-size:13px;color:#9A8C76;">
    Con todas las letras: comprar y cambiar activos dentro de la billetera
    todavía no están abiertos, y la tarjeta es virtual —para compras en línea—,
    así que todavía no se agrega a Google Pay ni a Apple Pay. Estamos en eso.
    Preferimos decírtelo ahora a que lo descubras después.
  </p>`,
  `Te escribimos porque abriste una cuenta en Veta Wallet.
   <a href="${baja}" style="color:#9A8C76;">Si no querés recibir más correos como este, dale de baja acá</a>.`);

  const texto = `${saludo(nombre)}

Abriste tu cuenta en Veta Wallet y ahí quedó. Desde entonces le cambiamos casi
todo, y vale la pena que la veas.

LO QUE HAY HOY

- Una tarjeta Visa virtual. Gasta directo de tu saldo en ORIGEN. Comprás en
  cualquier tienda en línea del mundo que acepte Visa, sin cuenta bancaria y
  sin ir a ninguna sucursal.
- Pagarle a un comercio. Escaneás su código y listo. Hay comercios en
  diecinueve países.
- Remesas. Ponés el monto y ves cuánto llega del otro lado antes de mandar
  nada.
- Cobrar con un código, con la cantidad ya puesta, para que te paguen sin
  dictar tu dirección letra por letra.
- AU-RA, que te contesta dentro de la app cuando algo no se entiende.

TE FALTA UN PASO: VERIFICARTE

Tu documento y una selfie. Toma unos cinco minutos. Con eso se te abre la
tarjeta —hoy no se puede emitir sin identidad verificada—${vivo ? " y quedás adentro del sorteo" : ""}.

Entrar a mi cuenta: ${SITIO}
${sorteoTexto}
Con todas las letras: comprar y cambiar activos dentro de la billetera todavía
no están abiertos, y la tarjeta es virtual —para compras en línea—, así que
todavía no se agrega a Google Pay ni a Apple Pay. Estamos en eso. Preferimos
decírtelo ahora a que lo descubras después.

—
Orden Global Corp · Próspera, Roatán, Honduras
Nunca te vamos a pedir por correo tu contraseña ni tu frase de respaldo. Si un
mensaje a nombre nuestro te las pide, no es nuestro.

Te escribimos porque abriste una cuenta en Veta Wallet. Para no recibir más
correos como este: ${baja}
`;

  return { asunto: ASUNTO, html, texto };
}
