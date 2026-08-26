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
 * Se comprobó en el código antes de escribir una línea, puerta por puerta:
 *
 *   · LA TARJETA VISA — sí la abre. cardController.js:51 exige
 *     kycStatus === "approved" para emitirla. Y se dice como es: la
 *     identidad te deja PEDIRLA, no te la pone en la mano.
 *
 *   · PULSE2CHAT — el chat NO la exige. En el relevo (infra/mensajes) el
 *     `gid` es un identificador PUBLICO que la persona declara, como el
 *     nombre; no hay ninguna comprobación de identidad verificada para
 *     escribir. Así que la carta NO dice que el Genesis ID abra el chat.
 *     Dice lo que sí es verdad: que ahí tu Genesis ID es cómo te encuentran,
 *     sin dictar una dirección de cuarenta caracteres.
 *
 *   · ORDENEX — todavía no está. Comprar y vender llegan, y se dice en
 *     futuro y sin fecha porque no la hay.
 *
 * Esa distinción —lo que abre, lo que identifica, lo que viene— es la carta
 * entera. Prometer una puerta cerrada consigue que la persona entre, no la
 * encuentre, y no vuelva.
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

/* El asunto lleva las DOS noticias: la de la casa y la de la persona. La
   primera da la razón para abrir —pasó algo—, la segunda dice qué hacer. Sin
   emoji: el asunto de un correo que habla de dinero no compite con la
   publicidad, compite con la desconfianza. */
export const ASUNTO = "Nuestra cadena ya está en el mundo. Falta tu Genesis ID.";

/* La cadena, en el registro público que usa toda la industria. Comprobado el
   26/08/2026 contra chainid.network, que es de donde lee chainlist.org: la
   5550 sale con estado "active", con ORIGEN como moneda, con ordenscan
   registrado como explorador (EIP-3091) y con nuestro ícono. Los dos RPC que
   publica contestan 0x15ae, que es 5550 en hexadecimal.

   Esto NO se escribe de memoria en un correo que va a cientos de personas: si
   algún día nos sacaran de la lista, la carta estaría mintiendo. Por eso el
   enlace va a la ficha, para que cualquiera lo compruebe por su cuenta. */
const CHAINLIST = "https://chainlist.org/chain/5550";
const CADENA = "https://ordenscan.com";

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

/* Todas las manchas viven ARRIBA —de 0% a 30% de la altura— porque ahí solo
   hay título. Más abajo empieza el texto que hay que leer, y ahí manda el
   color sólido. Los radios son chicos en vertical (18%–26%) por lo mismo: en
   una tarjeta que mide más de mil píxeles de alto, un radio del 80% teñiría
   la carta entera. */
const NEBULOSAS = [
  // la vía láctea: una elipse ancha y aplastada. Va primero de las manchas
  // para que quede por encima de las otras.
  "radial-gradient(150% 20% at 36% 18%, rgba(196,214,230,.11), rgba(3,12,18,0))",
  // el resplandor dorado de la casa, arriba a la derecha
  "radial-gradient(95% 22% at 86% 2%, rgba(201,169,97,.34), rgba(3,12,18,0))",
  // un jade tenue entrando por la izquierda
  "radial-gradient(80% 18% at 4% 26%, rgba(62,217,160,.20), rgba(3,12,18,0))",
  // el morado hondo, que es lo que la vuelve galaxia y no fondo
  "radial-gradient(110% 26% at 48% 12%, rgba(98,72,176,.42), rgba(3,12,18,0))",
].join(",");

/* La galaxia es el fondo de la TARJETA ENTERA, no de una banda de arriba.
   Las nebulosas se concentran en la mitad de arriba —donde solo hay título,
   que va en blanco y grande— y de la mitad para abajo manda el color sólido,
   que es donde vive el texto que hay que leer. Un fondo bonito que deja el
   texto a medio leer no es un fondo bonito.

   Si los degradados no se pintan —Outlook de escritorio, que dibuja con el
   motor de Word— queda ese azul casi negro con el texto claro encima: se ve
   distinto, nunca ilegible. Eso es lo único que no se puede perder. */
const CIELO = `background-color:#030C12;background-image:${ESTRELLAS},${NEBULOSAS};`;

/* Los colores que se le pasan al marco de la casa. La forma, el oro del
   cintillo, el pie y el aviso de suplantación no se tocan: siguen siendo los
   de todas las cartas. */
const PIEL = {
  fuera: "#01060A",
  tarjeta: CIELO,
  texto: "#CFE0DC",
  tenue: "#7C9490",
};

const H = (t) =>
  `<div style="margin:26px 0 10px;font:700 17px/1.35 Georgia,serif;color:#F3ECD9;">${esc(t)}</div>`;

/* El botón de la cadena va HUECO —borde de oro, sin relleno— y el de hacerse
   el Genesis ID va macizo. Dos botones dorados iguales compiten entre ellos y
   la persona no sabe cuál es el que importa; con esta diferencia, el ojo va
   solo al que pedimos. Mirar la cadena es una invitación; hacerse el Genesis
   ID es lo que la carta viene a conseguir. */
const botonHueco = (texto, url) =>
  `<div style="margin:18px 0 10px;"><a href="${url}" style="display:inline-block;padding:12px 24px;border-radius:999px;border:1px solid #C9A961;color:#C9A961;font-weight:600;font-size:14px;text-decoration:none;">${esc(texto)}</a></div>`;

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
  <!-- El título va DIRECTO sobre la galaxia de la tarjeta: no hay recuadro
       aparte. Centrado y con aire, que es lo que hace que el cielo se lea como
       cielo y no como un fondo cualquiera detrás de un párrafo. -->
  <div align="center" style="padding:26px 0 40px;">
    <div style="font:600 11px/1 Georgia,serif;letter-spacing:.34em;text-transform:uppercase;color:#C9A961;">
      Genesis ID
    </div>
    <div style="margin-top:18px;font:400 32px/1.22 Georgia,serif;color:#FFFFFF;">
      Tu nombre<br>en la cadena
    </div>
    <div style="margin-top:16px;font:400 14px/1.6 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#BFD4D0;">
      Una vez. Unos minutos. Y se te abre la casa entera.
    </div>
  </div>

  <p style="margin:0 0 14px;font-size:16px;color:#F3ECD9;">${esc(saludo(nombre))}</p>

  <p style="margin:0 0 12px;">
    Tenemos dos cosas para contarte. La primera es de la casa. La segunda es
    tuya, y sin ella la primera no te sirve de mucho.
  </p>

  ${H("Uno · Nuestra cadena ya está registrada en el mundo")}
  <p style="margin:0 0 12px;">
    El registro público que usan todas las billeteras del planeta —el mismo donde
    figuran Ethereum, Polygon y las demás— ya tiene la nuestra:
    <strong style="color:#F3ECD9;">cadena 5550, Orden Global, moneda ORIGEN</strong>,
    con estado activo y con su explorador propio. Cualquier billetera del mundo
    puede conectarse escribiendo ese número.
  </p>
  <p style="margin:0 0 12px;">
    Puede sonar a trámite. No lo es. Casi todo el oro digital del mundo vive
    alquilado: emitido sobre la red de otro, sujeto a sus reglas, a sus subidas
    de precio y a su permiso. Orden Global construyó la suya. La 5550 es nuestra
    <strong style="color:#F3ECD9;">HyperLayer QBFT</strong>: siete validadores
    nuestros, nuestras reglas, nuestra infraestructura — y lo que se mueve encima
    responde solo ante la casa que lo construyó.
  </p>
  <p style="margin:0 0 4px;">
    Eso ya no es una promesa nuestra. Es un registro público que podés ir a mirar
    vos mismo, ahora, sin pedirnos permiso.
  </p>
  ${botonHueco("Ver nuestra cadena", CADENA)}
  <p style="margin:0 0 12px;font-size:13px;color:#7E938D;">
    Y la ficha en el registro, para comprobarlo por afuera:
    <a href="${CHAINLIST}" style="color:#C9A961;">chainlist.org/chain/5550</a>
  </p>

  ${H("Dos · Falta tu Genesis ID")}
  <p style="margin:0 0 12px;">
    Tu billetera ya existe. Está ahí, con tu nombre, con tu dirección propia en
    esa cadena. No hay que abrir nada de nuevo. Falta una sola cosa, y solo la
    podés hacer vos.
  </p>
  <p style="margin:0 0 12px;">
    El Genesis ID es tu identidad dentro del sistema, y es
    <strong style="color:#F3ECD9;">una sola llave para toda la casa</strong>: te
    verificás una vez y quedás verificado en todo el ecosistema. No es un
    trámite. Es lo que hace que la cadena sepa que detrás de esa dirección hay
    una persona, y que esa persona sos vos.
  </p>

  ${H("Todo lo que se te abre con ella")}
  ${punto("Pedir tu tarjeta Visa.",
    "Con la identidad aprobada ya podés solicitarla. Gasta directo de tu saldo, en cualquier tienda en línea del mundo que acepte Visa, sin cuenta bancaria y sin ir a ninguna sucursal.")}
  ${punto("PULSE2CHAT.",
    "El chat del ecosistema, cifrado de punta a punta. Tu Genesis ID es tu nombre ahí: es como te encuentran los tuyos, sin que nadie tenga que dictar una dirección de cuarenta caracteres.")}
  ${punto("Ordenex.",
    "La casa de cambio de AuCorp ya está en pie, y el lanzamiento global viene pronto. Ahí se van a comprar y vender los tokens de la casa: <strong style=\"color:#F3ECD9;\">AUKA</strong>, que sigue el precio de una onza de oro; <strong style=\"color:#F3ECD9;\">AGKA</strong>, que sigue el precio de un gramo de plata; <strong style=\"color:#F3ECD9;\">ONDK</strong>; y los que vengan. Va a pedir identidad verificada — el que ya la tenga entra caminando.")}
  ${punto("Y lo que siga.",
    "Cada cosa nueva de la casa va a reconocer tu Genesis ID desde el primer día. No hay que volver a verificarse nunca.")}

  ${botonCorreo("Entrar y hacer mi Genesis ID", IR)}

  <p style="margin:0 0 12px;font-size:14px;color:#AEC7C3;">
    Vas a necesitar tu documento de identidad y unos minutos de buena luz. Nada
    más. El botón te lleva directo a la pantalla; si tenés que entrar primero,
    te lleva ahí y después sigue solo.
  </p>

  <p style="margin:26px 0 0;padding-top:16px;border-top:1px solid rgba(243,236,217,.10);font-size:13px;line-height:1.6;color:#7E938D;">
    Con todas las letras, para que nada te agarre de sorpresa: el lanzamiento
    global de Ordenex y el cambio de activos dentro de la billetera todavía no
    están abiertos, y la tarjeta es virtual —para compras en línea—, así que
    todavía no entra a Google Pay ni a Apple Pay. Preferimos decírtelo ahora a
    que lo descubras después.
  </p>
  <p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#7E938D;">
    ONDK es un valor negociable (<em>security token</em>) emitido bajo Próspera.
    Esta carta es informativa: no es una oferta, ni una invitación a invertir, ni
    una promesa de rentabilidad. AUKA y AGKA siguen el precio del metal; no
    entregan metal.
  </p>
  ${sorteoHtml}`,
  `Te escribimos porque tenés una billetera en Veta Wallet.
   <a href="${baja}" style="color:#7E938D;">Si no querés recibir más correos como este, dale de baja acá</a>.`,
  PIEL);

  const texto = `${saludo(nombre)}

Tenemos dos cosas para contarte. La primera es de la casa. La segunda es tuya,
y sin ella la primera no te sirve de mucho.

UNO · NUESTRA CADENA YA ESTA REGISTRADA EN EL MUNDO

El registro público que usan todas las billeteras del planeta —el mismo donde
figuran Ethereum, Polygon y las demás— ya tiene la nuestra: cadena 5550, Orden
Global, moneda ORIGEN, con estado activo y con su explorador propio. Cualquier
billetera del mundo puede conectarse escribiendo ese número.

Puede sonar a trámite. No lo es. Casi todo el oro digital del mundo vive
alquilado: emitido sobre la red de otro, sujeto a sus reglas, a sus subidas de
precio y a su permiso. Orden Global construyó la suya. La 5550 es nuestra
HyperLayer QBFT: siete validadores nuestros, nuestras reglas, nuestra
infraestructura — y lo que se mueve encima responde solo ante la casa que lo
construyó.

Eso ya no es una promesa nuestra. Es un registro público que podés ir a mirar
vos mismo, ahora, sin pedirnos permiso.

Ver nuestra cadena: ${CADENA}
La ficha en el registro: ${CHAINLIST}

DOS · FALTA TU GENESIS ID

Tu billetera ya existe. Está ahí, con tu nombre, con tu dirección propia en esa
cadena. No hay que abrir nada de nuevo. Falta una sola cosa, y solo la podés
hacer vos.

El Genesis ID es tu identidad dentro del sistema, y es una sola llave para toda
la casa: te verificás una vez y quedás verificado en todo el ecosistema. No es
un trámite. Es lo que hace que la cadena sepa que detrás de esa dirección hay
una persona, y que esa persona sos vos.

TODO LO QUE SE TE ABRE CON ELLA

- Pedir tu tarjeta Visa. Con la identidad aprobada ya podés solicitarla. Gasta
  directo de tu saldo, en cualquier tienda en línea del mundo que acepte Visa,
  sin cuenta bancaria y sin ir a ninguna sucursal.
- PULSE2CHAT. El chat del ecosistema, cifrado de punta a punta. Tu Genesis ID
  es tu nombre ahí: es como te encuentran los tuyos, sin que nadie tenga que
  dictar una dirección de cuarenta caracteres.
- Ordenex. La casa de cambio de AuCorp ya está en pie, y el lanzamiento global
  viene pronto. Ahí se van a comprar y vender los tokens de la casa: AUKA, que
  sigue el precio de una onza de oro; AGKA, que sigue el precio de un gramo de
  plata; ONDK; y los que vengan. Va a pedir identidad verificada — el que ya la
  tenga entra caminando.
- Y lo que siga. Cada cosa nueva de la casa va a reconocer tu Genesis ID desde
  el primer día. No hay que volver a verificarse nunca.

Entrar y hacer mi Genesis ID: ${IR}

Vas a necesitar tu documento de identidad y unos minutos de buena luz. Nada
más. El enlace te lleva directo a la pantalla; si tenés que entrar primero, te
lleva ahí y después sigue solo.

Con todas las letras, para que nada te agarre de sorpresa: el lanzamiento
global de Ordenex y el cambio de activos dentro de la billetera todavía no
están abiertos, y la tarjeta es virtual —para compras en línea—, así que
todavía no entra a Google Pay ni a Apple Pay. Preferimos decírtelo ahora a que
lo descubras después.

ONDK es un valor negociable (security token) emitido bajo Próspera. Esta carta
es informativa: no es una oferta, ni una invitación a invertir, ni una promesa
de rentabilidad. AUKA y AGKA siguen el precio del metal; no entregan metal.
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
