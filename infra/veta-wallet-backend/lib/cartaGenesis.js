/* La carta que invita a hacerse el Genesis ID.
 *
 * A QUIEN SE LE ESCRIBE
 *
 * A toda la gente que tiene billetera. Al 20 de agosto eran 440 cuentas con
 * correo y solo 26 con la identidad verificada: 414 personas abrieron su
 * cuenta y ahí se quedaron. El número exacto del día lo imprime el guion de
 * envío antes de mandar nada.
 *
 * POR QUE ESTA CARTA EXISTE SI YA HAY UNA DE NOVEDADES
 *
 * Porque no dicen lo mismo. La de novedades enumera lo que hay en la
 * billetera y menciona la verificación como uno de varios asuntos. Esta tiene
 * UN solo tema y una sola cosa que pedir. Una carta que pide una cosa
 * consigue esa cosa; una que pide cinco no consigue ninguna.
 *
 * LO QUE SE PUEDE PROMETER, Y LO QUE NO
 *
 * Se comprobó en el código antes de escribir una línea. Hoy la identidad
 * aprobada abre exactamente dos puertas:
 *
 *   · la tarjeta Visa  (controller/cardController.js, línea 51)
 *   · el intercambio   (controller/swapController.js, línea 129)
 *
 * De esas dos, la tarjeta está viva y el intercambio sigue en obra. Así que
 * la carta ofrece la tarjeta y NO ofrece el intercambio. Prometer una puerta
 * que está cerrada consigue que la persona entre, no la encuentre, y no
 * vuelva.
 *
 * Lo que viene después —que todos tengamos identidad para movernos dentro del
 * sistema— se cuenta como lo que es: lo que viene. En futuro y sin fecha,
 * porque no la hay.
 *
 * EL FONDO DE GALAXIA, SIN UNA SOLA IMAGEN
 *
 * La regla de la casa es que no entra ninguna imagen remota: casi todos los
 * clientes las bloquean y una carta que depende de ellas llega rota. Así que
 * la galaxia se dibuja con degradados —las estrellas son puntos de un
 * radial-gradient, las nebulosas son manchas anchas— y NO es una imagen.
 *
 * Donde los degradados no se pintan (Outlook de escritorio, que dibuja con el
 * motor de Word) queda el `background-color` sólido de siempre, que es el
 * mismo fondo del resto de los correos. O sea: se ve la galaxia donde se
 * puede, y donde no, se ve exactamente igual que las otras cartas de la casa.
 * Nunca queda texto claro sobre fondo claro.
 *
 * LAS REGLAS DEL CORREO DE LA CASA, QUE AQUI TAMBIEN MANDAN
 *
 *   1. Texto plano Y HTML.
 *   2. Ni una imagen remota.
 *   3. Donde se invita al sorteo van el +18 y el enlace a las bases.
 *   4. Acá no se pide NUNCA una contraseña ni una frase de respaldo.
 *   5. La baja va en el pie de la propia carta.
 */

import { marco, botonCorreo, escaparCorreo as esc } from "./correo.js";
import { enlaceBaja, sorteoVivo } from "./cartaNovedades.js";

/* El botón NO lleva a la portada: lleva a `#verificar`, que abre la pantalla
   de identidad. Si la persona no tiene la sesión abierta, la app la manda a la
   puerta y la intención espera ahí hasta que entre —o sea que entrar y llegar
   son un solo paso, no dos—. Comprobado con el navegador contra la app real,
   con sesión y sin ella. */
const IR = "https://app.vetawallet.com/#verificar";
const BASES = "https://vetawallet.com/sorteo-orden-global";

/* El asunto dice la única cosa que la persona no sabe. Sin emoji: el asunto de
   un correo que habla de dinero no compite con la publicidad, compite con la
   desconfianza. */
export const ASUNTO = "Falta tu Genesis ID para lo que viene";

const saludo = (nombre) => {
  const n = String(nombre || "").trim().split(/\s+/)[0];
  return n ? `Hola, ${n}.` : "Hola.";
};

/* ── La galaxia ───────────────────────────────────────────────────────────
   Las estrellas van PRIMERO en la lista porque el primer degradado queda
   arriba; las nebulosas, anchas y suaves, van debajo. Cada estrella es un
   punto de uno o dos píxeles: pocas y desparejas, que un tablero regular de
   puntos se lee como una trama y no como un cielo. */
const ESTRELLAS = [
  ["7%", "22%", 1.5, 0.95], ["15%", "68%", 1, 0.6], ["23%", "12%", 1.5, 0.8],
  ["31%", "83%", 1.5, 0.85], ["38%", "38%", 1, 0.5], ["46%", "72%", 1, 0.65],
  ["52%", "16%", 2, 1], ["59%", "55%", 1, 0.55], ["66%", "28%", 1.5, 0.8],
  ["71%", "88%", 1, 0.6], ["78%", "44%", 1.5, 0.7], ["84%", "20%", 2, 0.9],
  ["89%", "74%", 1, 0.55], ["94%", "34%", 1.5, 0.75], ["11%", "48%", 1, 0.45],
  ["43%", "92%", 1, 0.55], ["62%", "9%", 1, 0.6], ["97%", "60%", 1.5, 0.75],
  ["4%", "62%", 1, 0.5], ["19%", "34%", 1, 0.55], ["27%", "58%", 1.5, 0.7],
  ["34%", "18%", 1, 0.5], ["41%", "62%", 1, 0.45], ["49%", "40%", 1.5, 0.7],
  ["56%", "82%", 1, 0.5], ["64%", "66%", 1, 0.6], ["69%", "38%", 1, 0.5],
  ["74%", "14%", 1.5, 0.75], ["81%", "60%", 1, 0.5], ["87%", "44%", 1, 0.6],
  ["92%", "12%", 1, 0.55], ["96%", "84%", 1.5, 0.7], ["8%", "88%", 1, 0.5],
  ["36%", "76%", 1, 0.45],
]
  .map(([x, y, r, a]) =>
    `radial-gradient(${r}px ${r}px at ${x} ${y}, rgba(255,255,255,${a}), rgba(255,255,255,0))`)
  .join(",");

const NEBULOSAS = [
  // la vía láctea: una elipse ancha y aplastada cruzando en diagonal. Va
  // primero de las manchas para que quede por encima de las otras.
  "radial-gradient(140% 34% at 34% 40%, rgba(196,214,230,.10), rgba(3,12,18,0))",
  // el resplandor dorado de la casa, arriba a la derecha
  "radial-gradient(120% 90% at 84% 4%, rgba(201,169,97,.30), rgba(3,12,18,0))",
  // un jade tenue abajo a la izquierda
  "radial-gradient(110% 80% at 8% 98%, rgba(62,217,160,.20), rgba(3,12,18,0))",
  // el morado hondo del centro, que es lo que la vuelve galaxia y no fondo
  "radial-gradient(100% 78% at 46% 54%, rgba(98,72,176,.40), rgba(3,12,18,0))",
].join(",");

/* El cielo va MAS OSCURO que el resto de la carta (#030C12 contra #062A2A):
   así el bloque se lee como una ventana al espacio y no como otro panel del
   mismo color. Y si los degradados no se pintan —Outlook de escritorio—, lo
   que queda es ese azul casi negro con el texto claro encima: sigue siendo
   legible, que es lo único que no se puede perder. */
const CIELO = `background-color:#030C12;background-image:${ESTRELLAS},${NEBULOSAS};`;

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
export function cartaGenesis({ nombre, correo }) {
  const vivo = sorteoVivo();
  const baja = enlaceBaja(correo);

  const sorteoHtml = !vivo ? "" : `
  <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid rgba(243,236,217,.10);font-size:13px;line-height:1.6;color:#7E938D;">
    Y de paso: al verificarte quedás dentro del sorteo de 1 AUKA, que cierra el
    9 de septiembre. No hay que comprar nada. AUKA
    <strong style="color:#B4C6C0;">sigue el precio de una onza de oro</strong> — no te
    entrega metal, y te lo decimos antes de que lo preguntes.
    Solo mayores de 18 años · <a href="${BASES}" style="color:#C9A961;">bases del sorteo</a>
  </p>`;

  const sorteoTexto = !vivo ? "" : `
Y de paso: al verificarte quedás dentro del sorteo de 1 AUKA, que cierra el 9
de septiembre. No hay que comprar nada. AUKA sigue el precio de una onza de
oro — no te entrega metal, y te lo decimos antes de que lo preguntes. Solo
mayores de 18 años. Bases: ${BASES}
`;

  const html = marco("Tu Genesis ID", `
  <!-- ── el cielo ─────────────────────────────────────────────────────────
       role="presentation" para que un lector de pantalla no lo anuncie como
       una tabla de datos: es un fondo, no información. -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="margin:16px 0 6px;border-radius:12px;border:1px solid rgba(201,169,97,.22);">
    <tr><td align="center" style="${CIELO}padding:58px 24px 52px;border-radius:12px;">
      <div style="font:600 11px/1 Georgia,serif;letter-spacing:.34em;text-transform:uppercase;color:#C9A961;">
        Genesis ID
      </div>
      <div style="margin-top:18px;font:400 32px/1.22 Georgia,serif;color:#FFFFFF;">
        Tu nombre<br>en la cadena
      </div>
      <div style="margin-top:16px;font:400 14px/1.6 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#BFD4D0;">
        Una vez. Unos minutos. Y ya estás adentro.
      </div>
    </td></tr>
  </table>

  <p style="margin:22px 0 14px;font-size:16px;color:#F3ECD9;">${esc(saludo(nombre))}</p>

  <p style="margin:0 0 12px;">
    Tu billetera en Orden Global ya existe. Está ahí, con tu nombre, con tu
    dirección propia en la cadena. No hay que abrir nada de nuevo.
  </p>
  <p style="margin:0 0 12px;">
    Falta una sola cosa, y solo la podés hacer vos: <strong style="color:#F3ECD9;">tu
    Genesis ID</strong>.
  </p>

  ${H("Qué es")}
  <p style="margin:0 0 12px;">
    Es tu identidad dentro del sistema. No es un trámite: es lo que hace que la
    cadena sepa que detrás de esa dirección hay una persona, y que esa persona
    sos vos. Se hace una sola vez y queda tuya.
  </p>

  ${H("Por qué ahora")}
  <p style="margin:0 0 12px;">
    Porque lo que viene después necesita que la tengamos todos. Un sistema donde
    cada quien responde por lo suyo no se construye con direcciones anónimas: se
    construye con personas que dieron la cara. Cuando eso se abra, los que ya
    tengan su Genesis ID van a entrar caminando.
  </p>

  ${H("Qué se te abre hoy mismo")}
  ${punto("La tarjeta Visa.",
    "Con la identidad aprobada se te puede emitir. Gasta directo de tu saldo, en cualquier tienda en línea del mundo que acepte Visa, sin cuenta bancaria.")}
  ${punto("Tu lugar guardado.",
    "Lo que se abra después no te va a agarrar haciendo cola.")}

  ${botonCorreo("Entrar y hacer mi Genesis ID", IR)}

  <p style="margin:0 0 12px;font-size:14px;color:#AEC7C3;">
    Vas a necesitar tu documento de identidad y unos minutos de buena luz. Nada
    más. El botón te lleva directo a la pantalla; si tenés que entrar primero,
    te lleva ahí y después sigue solo.
  </p>

  <p style="margin:26px 0 0;padding-top:16px;border-top:1px solid rgba(243,236,217,.10);font-size:13px;line-height:1.6;color:#7E938D;">
    Con todas las letras: comprar y cambiar activos dentro de la billetera
    todavía están en obra, y la tarjeta es virtual —para compras en línea—, así
    que todavía no entra a Google Pay ni a Apple Pay. Preferimos decírtelo ahora
    a que lo descubras después.
  </p>
  ${sorteoHtml}`,
  `Te escribimos porque tenés una billetera en Veta Wallet.
   <a href="${baja}" style="color:#7E938D;">Si no querés recibir más correos como este, dale de baja acá</a>.`);

  const texto = `${saludo(nombre)}

Tu billetera en Orden Global ya existe. Está ahí, con tu nombre, con tu
dirección propia en la cadena. No hay que abrir nada de nuevo.

Falta una sola cosa, y solo la podés hacer vos: tu Genesis ID.

QUE ES

Es tu identidad dentro del sistema. No es un trámite: es lo que hace que la
cadena sepa que detrás de esa dirección hay una persona, y que esa persona sos
vos. Se hace una sola vez y queda tuya.

POR QUE AHORA

Porque lo que viene después necesita que la tengamos todos. Un sistema donde
cada quien responde por lo suyo no se construye con direcciones anónimas: se
construye con personas que dieron la cara. Cuando eso se abra, los que ya
tengan su Genesis ID van a entrar caminando.

QUE SE TE ABRE HOY MISMO

- La tarjeta Visa. Con la identidad aprobada se te puede emitir. Gasta directo
  de tu saldo, en cualquier tienda en línea del mundo que acepte Visa, sin
  cuenta bancaria.
- Tu lugar guardado. Lo que se abra después no te va a agarrar haciendo cola.

Entrar y hacer mi Genesis ID: ${IR}

Vas a necesitar tu documento de identidad y unos minutos de buena luz. Nada
más. El enlace te lleva directo a la pantalla; si tenés que entrar primero, te
lleva ahí y después sigue solo.

Con todas las letras: comprar y cambiar activos dentro de la billetera todavía
están en obra, y la tarjeta es virtual —para compras en línea—, así que
todavía no entra a Google Pay ni a Apple Pay. Preferimos decírtelo ahora a que
lo descubras después.
${sorteoTexto}
—
Orden Global Corp · Próspera, Roatán, Honduras
Nunca te vamos a pedir por correo tu contraseña ni tu frase de respaldo. Si un
mensaje a nombre nuestro te las pide, no es nuestro.

Te escribimos porque tenés una billetera en Veta Wallet. Para no recibir más
correos como este: ${baja}
`;

  return { asunto: ASUNTO, html, texto };
}
