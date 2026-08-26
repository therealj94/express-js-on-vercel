/* La carta de la cadena y el Genesis ID.
 *
 * A QUIEN SE LE ESCRIBE
 *
 * A toda la gente que tiene billetera. Al 20 de agosto eran 440 cuentas con
 * correo y solo 26 con la identidad verificada: 414 personas abrieron su
 * cuenta y ahí se quedaron. El número exacto del día lo imprime el guion de
 * envío antes de mandar nada.
 *
 * POR QUE ES UNA SOLA CARTA Y NO DOS NOTICIAS PEGADAS
 *
 * Tiene dos asuntos —que la cadena quedó inscrita en el registro público, y
 * que a cada quien le falta su Genesis ID— y la primera versión los puso como
 * «Uno ·» y «Dos ·». Se leía como dos comunicados grapados, que es justo lo
 * que hace que un correo parezca hecho por una máquina.
 *
 * No son dos noticias: son una frase. La cadena ya existe, falta tu nombre en
 * ella. Lo primero es lo que hace que lo segundo valga la pena; lo segundo es
 * lo que convierte «nuestra cadena» en «tu lugar». Por eso el titular lleva
 * las dos mitades, y en el medio hay una sola bisagra —«Ahora la otra mitad,
 * que es la tuya»— en vez de un número.
 *
 * LO QUE SE PUEDE PROMETER, Y LO QUE NO
 *
 * Se comprobó, puerta por puerta, antes de escribir una línea:
 *
 *   · LA CADENA — sí está inscrita. Comprobado el 26/08/2026 contra
 *     chainid.network, que es de donde lee chainlist.org: la 5550 sale con
 *     estado "active", con ORIGEN de moneda, con ordenscan registrado como
 *     explorador (EIP-3091) y con nuestro ícono; y los dos RPC que publica
 *     contestan 0x15ae, que es 5550. La carta no pide que la crean: lleva el
 *     enlace a la ficha para que cualquiera lo compruebe sin nosotros.
 *
 *   · LA TARJETA VISA — sí la abre la identidad. cardController.js:51 exige
 *     kycStatus === "approved" para emitirla. Y se dice como es: te deja
 *     PEDIRLA, no te la pone en la mano.
 *
 *   · PULSE2CHAT — el chat NO la exige. En el relevo (infra/mensajes) el
 *     `gid` es un identificador PUBLICO que la persona declara, como el
 *     nombre; no hay ninguna comprobación de identidad verificada para
 *     escribir. Así que la carta NO dice que el Genesis ID abra el chat.
 *     Dice lo que sí es verdad: que ahí tu Genesis ID es cómo te encuentran.
 *
 *   · ORDENEX — la casa de cambio está en pie (ordenexchange.link responde y
 *     se presenta como la casa de cambio de AuCorp). Lo que viene es el
 *     lanzamiento global, y se dice en futuro.
 *
 *   · ONDK — es un valor negociable, un security token, y la preventa dice
 *     que no se mercadea en Estados Unidos. Se nombra entre los tokens que
 *     van a cotizar, sin precio, sin insinuar ganancia, y con el aviso de que
 *     la carta es informativa y no una oferta.
 *
 * EL DISEÑO, Y POR QUE ESTAS DECISIONES Y NO OTRAS
 *
 * El elemento con el que se recuerda la carta es la PLACA DEL REGISTRO: la
 * línea que Orden Global ocupa en el padrón mundial de cadenas, compuesta
 * como un objeto —tipografía de máquina, filetes de oro, los cuatro datos y
 * nada más—. No es un adorno con forma de dato: es el dato, que resulta ser
 * la noticia. Todo lo demás de la carta está compuesto en voz baja para que
 * esa placa sea lo único que levanta la voz.
 *
 * Lo que se quitó a propósito, porque es lo que delata una plantilla: los
 * títulos numerados, los bloques con barrita a la izquierda, y el sándwich de
 * antetítulo + titular + subtítulo. En su lugar hay filetes finos, versalitas
 * espaciadas y una lista separada por líneas de un pixel. Un correo de una
 * casa que habla de oro y de registros públicos tiene que parecer un
 * documento, no un folleto.
 *
 * LAS REGLAS DEL CORREO DE LA CASA, QUE AQUI TAMBIEN MANDAN
 *
 *   1. Texto plano Y HTML. Un cliente que no pinta HTML recibe una carta
 *      entera, no una en blanco.
 *   2. Ni una imagen remota: la galaxia se dibuja con degradados. Donde no se
 *      pintan —Outlook de escritorio, que dibuja con el motor de Word— queda
 *      el color sólido con el texto claro encima. Se ve distinto, nunca
 *      ilegible.
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
const CADENA = "https://ordenscan.com";
const CHAINLIST = "https://chainlist.org/chain/5550";
const BASES = "https://vetawallet.com/sorteo-orden-global";

/* El asunto es el titular, y el titular es la carta entera en una frase. Sin
   emoji: el asunto de un correo que habla de dinero no compite con la
   publicidad, compite con la desconfianza. */
export const ASUNTO = "La cadena ya existe. Falta tu nombre en ella.";

const saludo = (nombre) => {
  const n = String(nombre || "").trim().split(/\s+/)[0];
  return n ? `Hola, ${n}.` : "Hola.";
};

/* ── El cielo ─────────────────────────────────────────────────────────────
   Las estrellas se APIÑAN ARRIBA y se van despoblando hacia abajo, como un
   cielo de verdad visto desde el suelo. Una lluvia pareja de puntos sobre
   toda la carta se lee como una trama de papel de regalo; esto se lee como
   una noche. Abajo quedan cuatro, muy tenues, para que el cielo no se corte
   con una raya.

   El primer degradado de la lista queda ARRIBA de todo, así que las estrellas
   van antes que las nebulosas. */
const ESTRELLAS = [
  // el racimo de arriba, donde vive el titular
  ["7%", "4%", 1.5, 0.95], ["23%", "2%", 1, 0.7], ["52%", "5%", 2, 1],
  ["74%", "3%", 1.5, 0.8], ["92%", "6%", 1, 0.6], ["38%", "8%", 1, 0.55],
  ["62%", "9%", 1, 0.65], ["15%", "11%", 1.5, 0.85], ["84%", "12%", 2, 0.9],
  ["46%", "14%", 1, 0.5], ["30%", "16%", 1.5, 0.75], ["97%", "17%", 1, 0.6],
  ["4%", "19%", 1, 0.55], ["68%", "20%", 1.5, 0.8], ["55%", "22%", 1, 0.5],
  ["88%", "24%", 1, 0.6], ["19%", "26%", 1.5, 0.7], ["41%", "28%", 1, 0.45],
  ["78%", "30%", 1, 0.55], ["11%", "33%", 1, 0.5], ["59%", "35%", 1.5, 0.65],
  ["94%", "38%", 1, 0.45], ["34%", "41%", 1, 0.4], ["71%", "44%", 1, 0.45],
  // y lo poco que se ve cuando ya bajaste la vista
  ["8%", "56%", 1, 0.3], ["81%", "63%", 1, 0.28], ["47%", "74%", 1, 0.24],
  ["24%", "88%", 1, 0.22],
]
  .map(([x, y, r, a]) =>
    `radial-gradient(${r}px ${r}px at ${x} ${y}, rgba(255,255,255,${a}), rgba(255,255,255,0))`)
  .join(",");

/* Las nebulosas viven en el tercio de arriba y nada más. Ahí solo hay titular
   —blanco y grande— así que pueden ser intensas sin estorbar. Donde empieza
   el texto que hay que leer, manda el color sólido. Los radios verticales son
   chicos por lo mismo: en una tarjeta de más de mil píxeles de alto, un radio
   del 80% teñiría la carta entera. */
const NEBULOSAS = [
  // la vía láctea: una elipse ancha y aplastada
  "radial-gradient(150% 16% at 38% 14%, rgba(196,214,230,.12), rgba(3,12,18,0))",
  // el resplandor de oro de la casa, entrando por la esquina
  "radial-gradient(90% 20% at 88% 0%, rgba(201,169,97,.36), rgba(3,12,18,0))",
  // un jade tenue por la izquierda
  "radial-gradient(75% 15% at 2% 22%, rgba(62,217,160,.20), rgba(3,12,18,0))",
  // el morado hondo, que es lo que lo vuelve galaxia y no fondo
  "radial-gradient(115% 24% at 50% 9%, rgba(98,72,176,.44), rgba(3,12,18,0))",
].join(",");

/* ── Los planetas ─────────────────────────────────────────────────────────
   No son un adorno de ciencia ficción pegado encima: la pantalla de inicio de
   la app ES una constelación de mundos que se tocan para entrar —el Núcleo—.
   Que el correo se abra con planetas y la app se abra con mundos es la misma
   casa hablando dos veces, no dos ideas distintas.

   Cada planeta son DOS degradados: el disco, con borde definido, y encima un
   brillo más chico y descentrado que hace de luz. La luz de todos viene de
   arriba a la derecha, que es de donde viene el resplandor de oro — un cielo
   con dos soles se ve mal aunque nadie sepa explicar por qué.

   El brillo va ANTES que el disco en la lista para quedar por encima, y es más
   chico que el disco para no desbordarlo: un degradado no se recorta contra
   otro, así que si se pasara de tamaño se vería el halo flotando fuera del
   planeta. */
const planeta = (x, y, r, disco, luz) => [
  `radial-gradient(circle ${Math.round(r * 0.62)}px at ${x - 3}% ${y - 2}%, ${luz}, rgba(3,12,18,0))`,
  `radial-gradient(circle ${r}px at ${x}% ${y}%, ${disco} 0 96%, rgba(3,12,18,0) 100%)`,
].join(",");

/* Los tres viven ARRIBA DEL TODO, en la franja de cielo que hay por encima del
   titular. La primera versión los repartió más abajo y quedaron discos duros
   encima de «Hola, José» y del primer párrafo: un planeta detrás de lo que hay
   que leer no es atmósfera, es un error de composición.

   Y van OSCUROS, no saturados. Un disco violeta brillante se lee como una
   calcomanía pegada encima; un cuerpo oscuro con el borde encendido por la luz
   que ya viene de la esquina se lee como un planeta. La diferencia entera está
   en el alfa. */
const PLANETAS = [
  // el grande, casi todo fuera del cuadro: se ve un gajo, como una luna que no
  // cabe en la ventana
  planeta(101, 1.4, 76, "rgba(64,50,112,.62)", "rgba(206,186,246,.20)"),
  // uno chico y lejano, en jade
  planeta(7, 2.4, 15, "rgba(30,86,80,.62)", "rgba(150,230,214,.26)"),
  // y una mota de oro, para que no parezcan dos y basta
  planeta(63, 3.4, 7, "rgba(140,112,66,.60)", "rgba(255,232,190,.30)"),
].join(",");

/* El orden manda: primero las estrellas, después los planetas —que las tapan
   donde pasan por delante—, y al fondo las nebulosas. */
const CIELO = `background-color:#030C12;background-image:${ESTRELLAS},${PLANETAS},${NEBULOSAS};`;

/* Los colores que se le pasan al marco de la casa. La forma, el oro del
   cintillo, el pie y el aviso de suplantación no se tocan: siguen siendo los
   de todas las cartas. */
const PIEL = {
  fuera: "#01060A",
  tarjeta: CIELO,
  texto: "#CFE0DC",
  tenue: "#7C9490",
};

const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,'Courier New',monospace";
const SANS = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

/* Una versalita espaciada sobre un filete de oro. Es el único recurso que
   marca las secciones: ni números, ni barritas, ni fondos de color. */
const rotulo = (t) => `
  <div style="margin:34px 0 16px;border-top:1px solid rgba(201,169,97,.30);padding-top:12px;
              font:600 10px/1 ${MONO};letter-spacing:.30em;text-transform:uppercase;color:#C9A961;">
    ${esc(t)}
  </div>`;

/* Un renglón de la lista. Separados por una línea de un pixel y nada más:
   el título en la sans, apretado, y el texto debajo. Sin viñetas — una lista
   de cuatro cosas no necesita que le señalen dónde empieza cada una. */
const renglon = (titulo, texto) => `
  <div style="padding:15px 0;border-bottom:1px solid rgba(207,224,220,.10);">
    <div style="font:600 15px/1.4 ${SANS};color:#FFFFFF;margin-bottom:4px;">${esc(titulo)}</div>
    <div style="font:400 14px/1.65 ${SANS};color:#A8BFBA;">${texto}</div>
  </div>`;

/* El botón de mirar la cadena va HUECO y el de hacerse el Genesis ID va
   macizo. Dos botones dorados iguales compiten entre ellos y la persona no
   sabe cuál es el que importa. Mirar es una invitación; verificarse es lo que
   la carta viene a conseguir. */
const botonHueco = (texto, url) =>
  `<div style="margin:20px 0 8px;"><a href="${url}" style="display:inline-block;padding:11px 22px;border-radius:999px;border:1px solid rgba(201,169,97,.55);color:#C9A961;font:600 13px/1 ${SANS};text-decoration:none;">${esc(texto)}</a></div>`;

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
  <p style="margin:14px 0 0;font:400 12px/1.65 ${SANS};color:#7C9490;">
    Y de paso: al verificarte quedás dentro del sorteo de 1 AUKA, que cierra el
    9 de septiembre. No hay que comprar nada. AUKA
    <strong style="color:#A8BFBA;">sigue el precio de una onza de oro</strong> — no te
    entrega metal, y te lo decimos antes de que lo preguntes. Solo mayores de
    18 años · <a href="${BASES}" style="color:#C9A961;">bases del sorteo</a>
  </p>`;

  const sorteoTexto = !vivo ? "" : `
Y de paso: al verificarte quedás dentro del sorteo de 1 AUKA, que cierra el 9
de septiembre. No hay que comprar nada. AUKA sigue el precio de una onza de
oro — no te entrega metal, y te lo decimos antes de que lo preguntes. Solo
mayores de 18 años. Bases: ${BASES}
`;

  const html = marco("La cadena ya existe", `
  <!-- ── el titular ────────────────────────────────────────────────────────
       Las dos mitades de la carta en una sola frase: la de la casa en blanco,
       la de la persona en oro. La razón va primero y el pedido después dentro
       de la MISMA frase, así que el correo puede abrir pidiendo sin que suene
       a que pide de la nada. -->
  <div style="padding:34px 0 30px;">
    <div style="font:400 33px/1.24 Georgia,'Times New Roman',serif;color:#FFFFFF;">
      La cadena ya existe.<br>
      <span style="color:#C9A961;">Falta tu nombre en&nbsp;ella.</span>
    </div>
  </div>

  <p style="margin:0 0 14px;font-size:16px;color:#F3ECD9;">${esc(saludo(nombre))}</p>

  <p style="margin:0 0 13px;">
    Tu billetera en Orden Global ya está ahí: con tu nombre, con tu dirección
    propia en la cadena. Le falta lo único que no podemos poner nosotros.
  </p>
  <p style="margin:0 0 13px;">
    Tu <strong style="color:#F3ECD9;">Genesis ID</strong> es una sola llave para
    toda la casa. Te verificás una vez y quedás verificado en todo lo que venga.
    No es un trámite: es lo que hace que la cadena sepa que detrás de esa
    dirección hay una persona, y que esa persona sos vos.
  </p>
  <p style="margin:0 0 4px;">
    Tu documento de identidad y unos minutos de buena luz. Nada más.
  </p>

  ${botonCorreo("Hacer mi Genesis ID", IR)}

  ${rotulo("Lo que tu nombre abre")}
  ${renglon("Tu tarjeta Visa",
    "Con la identidad aprobada ya podés pedirla. Gasta directo de tu saldo, en cualquier tienda en línea del mundo que acepte Visa, sin cuenta bancaria y sin ir a ninguna sucursal.")}
  ${renglon("PULSE2CHAT",
    "El chat del ecosistema, cifrado de punta a punta. Tu Genesis ID es tu nombre ahí: es como te encuentran los tuyos, sin que nadie dicte una dirección de cuarenta caracteres.")}
  ${renglon("Ordenex",
    "La casa de cambio de AuCorp ya está en pie, y el lanzamiento global viene pronto. Ahí se comprarán y venderán los tokens de la casa: <strong style=\"color:#CFE0DC;\">AUKA</strong>, que sigue el precio de una onza de oro; <strong style=\"color:#CFE0DC;\">AGKA</strong>, que sigue el precio de un gramo de plata; <strong style=\"color:#CFE0DC;\">ONDK</strong>; y los que vengan. Va a pedir identidad verificada.")}
  ${renglon("Y lo que siga",
    "Cada cosa nueva de la casa va a reconocer tu Genesis ID desde el primer día. No hay que volver a verificarse nunca.")}

  ${rotulo("Y la cadena donde vive tu nombre")}

  <!-- ── la placa del registro ─────────────────────────────────────────────
       El renglón que ocupamos en el padrón mundial de cadenas, compuesto como
       un objeto. El NOMBRE es lo grande —es lo que la gente reconoce— y el
       número va en la línea de datos, donde va un número. -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="margin:4px 0 20px;border:1px solid rgba(201,169,97,.34);border-radius:6px;">
    <tr><td style="padding:16px 18px 15px;">
      <div style="font:600 9px/1 ${MONO};letter-spacing:.26em;text-transform:uppercase;color:#A8BFBA;">
        Registro público de cadenas
      </div>
      <div style="margin-top:11px;font:600 21px/1.2 ${MONO};color:#C9A961;letter-spacing:.02em;">
        Orden&nbsp;Global
      </div>
      <div style="margin-top:8px;font:400 13px/1.5 ${MONO};color:#CFE0DC;">
        chainId&nbsp;5550 &nbsp;·&nbsp; ORIGEN &nbsp;·&nbsp;
        <span style="color:#3ED9A0;">activo</span>
      </div>
    </td></tr>
  </table>

  <p style="margin:0 0 13px;">
    Esa ficha es nueva. Chainlist es el padrón que consultan las billeteras, los
    exploradores y las plataformas del mundo entero antes de reconocer una
    cadena — el mismo donde figuran Ethereum y Polygon. Desde ahora
    <strong style="color:#F3ECD9;">Orden Global figura ahí</strong>.
  </p>
  <p style="margin:0 0 13px;">
    Lo que abre: cualquier billetera del planeta puede conectarse escribiendo
    5550, sin que nosotros le pidamos nada a nadie; ORIGEN se ve desde afuera; y
    cuando toque tocar la puerta de otra plataforma, ya no hay que explicar qué
    es esto — está en la lista.
  </p>
  <p style="margin:0 0 13px;">
    Casi todo el oro digital del mundo vive alquilado: es una
    <strong style="color:#F3ECD9;">capa 2</strong> — un token viviendo encima de
    la cadena de otro, sujeto a sus reglas, a sus precios y a su permiso. Ahí
    empezamos nosotros también.
  </p>
  <p style="margin:0 0 13px;">
    Ya no. La 5550 es una <strong style="color:#F3ECD9;">capa 1</strong>: cadena
    propia, de base, sin nadie debajo. Es la
    <strong style="color:#F3ECD9;">HyperLayer QBFT</strong> de Orden Global —
    siete validadores nuestros, nuestras reglas. Pasar de capa 2 a capa 1 es
    dejar de alquilar y escriturar.
  </p>
  ${botonHueco("Ver la cadena por dentro", CADENA)}
  <p style="margin:0 0 4px;font:400 12px/1.6 ${SANS};color:#A8BFBA;">
    Y la ficha, por si querés comprobarlo sin creernos a nosotros:
    <a href="${CHAINLIST}" style="color:#C9A961;">chainlist.org/chain/5550</a>
  </p>

  <p style="margin:32px 0 0;font:400 18px/1.5 Georgia,'Times New Roman',serif;color:#FFFFFF;">
    La cadena ya lleva nuestro nombre.<br>
    <span style="color:#C9A961;">Falta que lleve el&nbsp;tuyo.</span>
  </p>

  ${botonCorreo("Hacer mi Genesis ID", IR)}

  <p style="margin:26px 0 0;padding-top:16px;border-top:1px solid rgba(207,224,220,.10);font:400 12px/1.65 ${SANS};color:#7C9490;">
    Con todas las letras, para que nada te agarre de sorpresa: el lanzamiento
    global de Ordenex y el cambio de activos dentro de la billetera todavía no
    están abiertos, y la tarjeta es virtual —para compras en línea—, así que
    todavía no entra a Google Pay ni a Apple Pay. Preferimos decírtelo ahora a
    que lo descubras después.
  </p>
  <p style="margin:10px 0 0;font:400 11px/1.6 ${SANS};color:#6B8480;">
    ONDK es un valor negociable (<em>security token</em>) emitido bajo Próspera.
    Esta carta es informativa: no es una oferta, ni una invitación a invertir, ni
    una promesa de rentabilidad. AUKA y AGKA siguen el precio del metal; no
    entregan metal.
  </p>
  ${sorteoHtml}`,
  `Te escribimos porque tenés una billetera en Veta Wallet.
   <a href="${baja}" style="color:#7C9490;">Si no querés recibir más correos como este, dale de baja acá</a>.`,
  PIEL);

  const texto = `LA CADENA YA EXISTE. FALTA TU NOMBRE EN ELLA.

${saludo(nombre)}

Tu billetera en Orden Global ya está ahí: con tu nombre, con tu dirección
propia en la cadena. Le falta lo único que no podemos poner nosotros.

Tu Genesis ID es una sola llave para toda la casa. Te verificás una vez y
quedás verificado en todo lo que venga. No es un trámite: es lo que hace que la
cadena sepa que detrás de esa dirección hay una persona, y que esa persona sos
vos.

Tu documento de identidad y unos minutos de buena luz. Nada más.

Hacer mi Genesis ID: ${IR}

LO QUE TU NOMBRE ABRE

Tu tarjeta Visa
  Con la identidad aprobada ya podés pedirla. Gasta directo de tu saldo, en
  cualquier tienda en línea del mundo que acepte Visa, sin cuenta bancaria y
  sin ir a ninguna sucursal.

PULSE2CHAT
  El chat del ecosistema, cifrado de punta a punta. Tu Genesis ID es tu nombre
  ahí: es como te encuentran los tuyos, sin que nadie dicte una dirección de
  cuarenta caracteres.

Ordenex
  La casa de cambio de AuCorp ya está en pie, y el lanzamiento global viene
  pronto. Ahí se comprarán y venderán los tokens de la casa: AUKA, que sigue el
  precio de una onza de oro; AGKA, que sigue el precio de un gramo de plata;
  ONDK; y los que vengan. Va a pedir identidad verificada.

Y lo que siga
  Cada cosa nueva de la casa va a reconocer tu Genesis ID desde el primer día.
  No hay que volver a verificarse nunca.

Y LA CADENA DONDE VIVE TU NOMBRE

  REGISTRO PÚBLICO DE CADENAS
  Orden Global
  chainId 5550 · ORIGEN · activo

Esa ficha es nueva. Chainlist es el padrón que consultan las billeteras, los
exploradores y las plataformas del mundo entero antes de reconocer una cadena
— el mismo donde figuran Ethereum y Polygon. Desde ahora Orden Global figura
ahí.

Lo que abre: cualquier billetera del planeta puede conectarse escribiendo 5550,
sin que nosotros le pidamos nada a nadie; ORIGEN se ve desde afuera; y cuando
toque tocar la puerta de otra plataforma, ya no hay que explicar qué es esto —
está en la lista.

Casi todo el oro digital del mundo vive alquilado: es una capa 2 — un token
viviendo encima de la cadena de otro, sujeto a sus reglas, a sus precios y a su
permiso. Ahí empezamos nosotros también.

Ya no. La 5550 es una capa 1: cadena propia, de base, sin nadie debajo. Es la
HyperLayer QBFT de Orden Global — siete validadores nuestros, nuestras reglas.
Pasar de capa 2 a capa 1 es dejar de alquilar y escriturar.

Ver la cadena por dentro: ${CADENA}
Y la ficha, por si querés comprobarlo sin creernos a nosotros:
${CHAINLIST}

La cadena ya lleva nuestro nombre. Falta que lleve el tuyo.

Hacer mi Genesis ID: ${IR}

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
