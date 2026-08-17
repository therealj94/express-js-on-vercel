/* Ordenex · la sala de trading — VMERCADO.
 *
 * Las dos vistas del mercado: la lista de los catorce pares y la pantalla de
 * un mercado abierto (velas, libro, tratos, formulario y mis órdenes). Este
 * módulo pinta y sondea; el dinero le llega y le sale como STRING DE WEI y
 * las cuentas se hacen con BigInt — ni un Number toca un monto, porque un
 * double de 18 decimales pierde exactamente los dígitos que a alguien le
 * importan.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * LAS DOS CLASES DE VELA, QUE JAMÁS SE MEZCLAN
 *
 * Esta sala pinta dos series que se parecen en la forma y no se parecen en
 * nada en lo que significan. Por eso viven en dos pestañas distintas, con dos
 * juegos de marcos distintos y dos unidades distintas:
 *
 *   · TRATOS · ORIGEN — operaciones reales de esta casa, en wei de ORIGEN,
 *     marcos 1m/15m/1h/1d, por GET /mercados/:par/velas. Hoy no hay ninguna en
 *     ningún mercado: el libro está recién abierto y todavía no se calzó nada.
 *     Eso se DICE —lo escribe la propia gráfica en su lienzo vacío— y no se
 *     disimula con una línea.
 *   · REFERENCIA · USD — el mercado REAL del oro y de la plata, en dólares,
 *     marcos 30m/4h/4d, por GET /mercados/:par/referencia. Va SIEMPRE con su
 *     rótulo a la vista. Existe solo para AUKA, AGKA y ORIGEN; para el resto
 *     el API contesta 404 SIN_REFERENCIA y aquí ni se dibuja el selector.
 *
 * Una vela de referencia pintada como si fuera un trato es exactamente la
 * mentira que esta casa no comete. Y un activo que no tiene ni tratos ni
 * referencia (los doce tokens de sector) recibe su gráfica ENTERA —rejilla,
 * ejes, marco— pero vacía y con el motivo escrito, más una línea que dice
 * dónde nace su precio: en el libro de abajo. Ni una raya plana, ni un número
 * de relleno.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Tres reglas que esta sala no negocia, heredadas del contrato de la casa:
 *
 * 1. NI UN NÚMERO INVENTADO. Un dato que no llegó se pinta como guion o se
 *    dice con palabras («no pudimos traer el libro»), jamás como cero. La
 *    referencia del feed se enseña ROTULADA, aparte del último trato.
 * 2. FAIL-CLOSED CON EL DINERO. Sin saldo leído no se coloca una orden; sin
 *    libro leído no se estima el costo de una orden de mercado. El servidor
 *    valida todo de nuevo, pero este cliente no manda a ciegas.
 * 3. TODO LO PÚBLICO SE VE SIN SESIÓN. El formulario, sin cuenta, invita a
 *    entrar con la Veta Wallet — no esconde el mercado.
 *
 * Los textos viven acá y no en i18n.js a propósito (patrón AURA_TXT de la
 * billetera): la pantalla y sus palabras se mueven juntas o no se mueven.
 */

const VMERCADO = (() => {
  'use strict';

  const WEI = 10n ** 18n;

  /* Un juego de marcos por fuente, y tampoco se mezclan ellos. Los de tratos
     son los que agrega el motor de la casa (lib/velas.js). Los de referencia
     son los que DEVUELVE el proveedor del metal: 1 día son 48 velas de 30 min,
     30 días 180 de 4 h, 365 días 92 de 4 días. Esos marcos no se piden: se
     sabe lo que contesta y se rotula en consecuencia. */
  const MARCOS = {
    tratos: ['1m', '15m', '1h', '1d'],
    referencia: ['30m', '4h', '4d'],
  };

  // El marco con el que abre cada fuente: 1 h para los tratos (la jornada) y
  // 4 h para la referencia (el mes de metal, que es como se mira una onza).
  const MARCO_INICIAL = { tratos: '1h', referencia: '4h' };

  /* Los TRES activos con mercado real detrás, espejo de la lista blanca
     REFERENCIAS de infra/ordenex-api/lib/referenciaVelas.js. Lista blanca y no
     lista negra a propósito: un token nuevo no hereda referencia por descuido,
     hereda el silencio honesto. Esta copia solo decide si se dibuja el
     selector; el que manda es el API, y si contesta SIN_REFERENCIA la pestaña
     se retira sola (ver sinReferencia). */
  const CON_REFERENCIA = ['AUKA', 'AGKA', 'ORIGEN'];

  /* Y los que llevan PRECIO DECLARADO por la Junta: la tercera fuente. Misma
     forma de lista blanca y por el mismo motivo, pero la razón de fondo es
     otra: AUKA, AGKA y ORIGEN siguen un metal y su precio se MIDE; ONDK no
     cotiza en ningún lado y su precio se DECLARA, en un acta. Que la Junta
     pudiera «declarar» el precio del oro sería absurdo, así que esta lista y
     la de arriba no se solapan ni deben. */
  const CON_DECLARADO = ['ONDK'];

  // Los helpers de la casa se piden a ONX EN EL MOMENTO de usarlos: este
  // archivo carga antes que app.js (el orden del HTML es el grafo de
  // dependencias) y una referencia top-level a ONX reventaría en la carga.
  const esc = s => ONX.esc(s);
  const jsTxt = s => ONX.jsTxt(s);
  const deWei = (s, d) => ONX.deWei(s, d);
  const $ = id => document.getElementById(id);

  // ── los textos, es/en uno junto al otro ───────────────────────────────────

  const TXT = {
    es: {
      /* La lista. El subtítulo dice la regla de la casa en una línea: acá
         todo se cotiza en ORIGEN, y decirlo evita la pregunta. */
      't': 'Mercados',
      'sub': 'Los catorce activos de la cadena, cada uno contra ORIGEN.',
      'cMercado': 'Mercado', 'cUltimo': 'Último (ORIGEN)', 'cCambio': '24 h', 'cVol': 'Volumen 24 h',
      'ref': 'ref.',
      'cargando': 'Trayendo los mercados…',
      'sinFeed': 'No pudimos traer los mercados. Se reintenta solo; los datos aparecen en cuanto vuelva la conexión.',

      // Un mercado abierto.
      'volver': 'Mercados',
      'ultimo': 'Último',
      'refRot': 'Referencia',
      'parRaro': 'Ese mercado no existe en esta casa.',
      'parRaroP': 'El par pedido no está en la tabla de activos de la cadena. Volvé a la lista y elegí uno de los catorce.',

      // La gráfica. «Sin velas» y «no llegaron» son cosas distintas y se
      // dicen distinto — la honestidad es de la casa.
      'velasNo': 'No pudimos traer las velas. Se reintenta solo.',
      'velasSin': 'La gráfica no está instalada en esta versión. Los datos del mercado siguen abajo.',

      /* El selector de fuente. Los dos rótulos llevan la unidad puesta porque
         la unidad ES la diferencia: en ORIGEN se opera, en dólares se mira. */
      'fuente': 'Fuente de la gráfica',
      'fTratos': 'Tratos · ORIGEN',
      'fRef': 'Referencia · USD',
      'refBadge': 'REFERENCIA',
      'refCuando': 'leído {hora}',
      'refNo': 'No pudimos traer la referencia del metal. Se reintenta solo.',
      'refVacia': 'La referencia del metal todavía no llegó. Se reintenta sola: preferimos un lienzo vacío a una línea inventada.',
      'ls.buscar': 'Buscar mercado', 'ls.par': 'Par', 'ls.precio': 'Precio',
      'ls.nada': 'Ningún mercado con ese nombre.',
      'ls.ponerFav': 'Marcar como favorito', 'ls.quitarFav': 'Quitar de favoritos',
      'ps.mias': 'Mis órdenes', 'ps.ninguna': 'No tenés órdenes abiertas en este mercado.',
      'ps.sinSesion': 'Entrá con tu cuenta para ver tus órdenes.',
      'ps.cargando': 'Trayendo tus órdenes…',
      'st.alto': 'Máx. 24 h', 'st.bajo': 'Mín. 24 h',
      'st.vol': 'Vol. 24 h', 'st.par': 'Se paga en',
      'zoomGrupo': 'Acercar la gráfica',
      'zoomMas': 'Acercar (rueda, o la tecla +)',
      'zoomMenos': 'Alejar (rueda, o la tecla −)',
      'zoomTodo': 'Ver todo (doble clic, o Inicio)',
      'zoomPista': 'Rueda para acercar · arrastrá para mover · doble clic vuelve a verlo todo',
      'refAUKA': 'Onza de oro en el mercado real, en dólares. No son tratos de Ordenex.',
      'refAGKA': 'Onza de plata en el mercado real, en dólares. No son tratos de Ordenex.',
      'refORIGEN': 'Gramo de oro entre 55, derivado del oro del mercado real, en dólares. No son tratos de Ordenex.',

      /* El precio declarado. El rótulo dice DOS cosas y las dos hacen falta:
         de dónde sale (una resolución de la Junta) y qué NO es (un precio de
         mercado). Con solo la primera, alguien podría leerlo como cotización. */
      'fDecl': 'Declarado · Junta',
      'declBadge': 'PRECIO DECLARADO',
      'declRot': 'Precio fijado por resolución de la Junta Directiva. ONDK no cotiza todavía: no hay libro ni contraparte, así que este número no es un precio de mercado. Cada vela de la gráfica es un acta: abre en el precio de la resolución anterior y cierra en el de esa, sin mecha, porque entre dos actas no hubo ni una operación.',
      'declNo': 'No pudimos traer el precio declarado. Se reintenta solo.',
      'declVacio': 'La Junta todavía no ha declarado un precio para este instrumento.',
      'declVig': 'vigente desde {fecha} · acta {acta}',

      // La nota de AUKA: es de producto, no una advertencia. Explica el activo.
      'aukaT': 'AUKA y ORIGEN son el mismo metal',
      'aukaP': 'AUKA es una onza de oro y ORIGEN es el gramo de oro entre 55. Como los dos son oro, su relación no se mueve nunca: 1 AUKA = 1710,69 ORIGEN, hoy y siempre. El precio que sí se mueve es el del oro, y está en la pestaña Referencia, en dólares.',

      // El token que todavía no tiene mercado: dónde nace su precio, sin rodeos.
      'sectorP': 'Este par abre cuando alguien ponga la primera orden. El precio nace en el libro de aquí abajo, no en un feed.',

      // El libro y los tratos.
      'libro': 'Libro de órdenes',
      'precio': 'Precio', 'cantidad': 'Cantidad', 'hora': 'Hora',
      'sinLibro': 'Todavía no hay órdenes descansando en este libro.',
      'libroNo': 'No pudimos traer el libro. Se reintenta solo.',
      'tratos': 'Últimos tratos',
      'sinTratos': 'Todavía no hubo tratos en este mercado.',
      'tratosNo': 'No pudimos traer los tratos. Se reintenta solo.',

      // El formulario.
      'operar': 'Operar',
      'comprar': 'Comprar', 'vender': 'Vender',
      'limite': 'Límite', 'mercado': 'Mercado',
      'precioLbl': 'Precio (ORIGEN por {sim})',
      'cantLbl': 'Cantidad ({sim})',
      'total': 'Total', 'totalAprox': 'Total estimado',
      'disp': 'Disponible: {monto} {sim}',
      'dispNo': 'No pudimos leer tu saldo. Sin saldo leído no se coloca nada — probá de nuevo en un momento.',
      'max': 'Usar todo',
      'colocada': 'Orden colocada.',
      'cancelada': 'Orden cancelada.',
      'noCubre': 'El libro no cubre toda la cantidad: lo que no calce se cancela solo, jamás queda descansando.',

      // Los errores del formulario, uno por causa: un mensaje genérico obliga
      // a adivinar, y adivinar con dinero es lo que esta casa no hace.
      'eCant': 'La cantidad no es válida: números, punto decimal y hasta 18 decimales.',
      'ePrecio': 'El precio no es válido: números, punto decimal y hasta 18 decimales.',
      'eChico': 'La orden es demasiado chica: el total redondea a cero wei.',
      'eSaldo': 'No te alcanza el saldo: tenés {monto} {sim} disponibles.',
      'eLibro': 'No pudimos leer el libro para estimar el costo. Probá de nuevo en un momento.',
      'eColocar': 'No se pudo colocar la orden.',
      'eCancelar': 'No se pudo cancelar la orden.',
      'eSesion': 'Tu sesión venció. Entrá de nuevo con tu cuenta Veta Wallet.',

      // Sin sesión el formulario invita, no esconde: todo lo público se ve.
      'invitarT': 'Para operar, entrá con tu cuenta',
      'invitarP': 'Todo lo que estás viendo es público — el libro, las velas, los tratos. Para colocar una orden entrá con tu cuenta Veta Wallet: Ordenex no guarda contraseñas.',
      'invitarBtn': 'Entrar con mi cuenta Veta Wallet',

      // Mis órdenes.
      'misOrdenes': 'Mis órdenes abiertas',
      'sinOrdenes': 'No tenés órdenes abiertas en este mercado.',
      'ordenesNo': 'No pudimos traer tus órdenes. Se reintenta solo.',
      'lado': 'Lado', 'tipo': 'Tipo', 'resta': 'Resta', 'cancelar': 'Cancelar',
    },
    en: {
      't': 'Markets',
      'sub': 'The fourteen assets of the chain, each against ORIGEN.',
      'cMercado': 'Market', 'cUltimo': 'Last (ORIGEN)', 'cCambio': '24 h', 'cVol': '24 h volume',
      'ref': 'ref.',
      'cargando': 'Fetching the markets…',
      'sinFeed': 'We couldn’t fetch the markets. It retries on its own; data appears as soon as the connection is back.',

      'volver': 'Markets',
      'ultimo': 'Last',
      'refRot': 'Reference',
      'parRaro': 'That market does not exist in this house.',
      'parRaroP': 'The requested pair is not in the chain’s asset table. Go back to the list and pick one of the fourteen.',

      'velasNo': 'We couldn’t fetch the candles. It retries on its own.',
      'velasSin': 'The chart is not installed in this build. The market data continues below.',

      'fuente': 'Chart source',
      'fTratos': 'Trades · ORIGEN',
      'fRef': 'Reference · USD',
      'refBadge': 'REFERENCE',
      'refCuando': 'read at {hora}',
      'refNo': 'We couldn’t fetch the metal reference. It retries on its own.',
      'refVacia': 'The metal reference hasn’t arrived yet. It retries on its own: we’d rather show an empty canvas than an invented line.',
      'ls.buscar': 'Search market', 'ls.par': 'Pair', 'ls.precio': 'Price',
      'ls.nada': 'No market by that name.',
      'ls.ponerFav': 'Add to favourites', 'ls.quitarFav': 'Remove from favourites',
      'ps.mias': 'My orders', 'ps.ninguna': 'You have no open orders in this market.',
      'ps.sinSesion': 'Sign in to see your orders.',
      'ps.cargando': 'Fetching your orders…',
      'st.alto': '24 h high', 'st.bajo': '24 h low',
      'st.vol': '24 h volume', 'st.par': 'Paid in',
      'zoomGrupo': 'Zoom the chart',
      'zoomMas': 'Zoom in (wheel, or the + key)',
      'zoomMenos': 'Zoom out (wheel, or the − key)',
      'zoomTodo': 'Fit all (double-click, or Home)',
      'zoomPista': 'Wheel to zoom · drag to move · double-click fits it all back',
      'refAUKA': 'One ounce of gold in the real market, in dollars. These are not Ordenex trades.',
      'refAGKA': 'One ounce of silver in the real market, in dollars. These are not Ordenex trades.',
      'refORIGEN': 'A gram of gold divided by 55, derived from real-market gold, in dollars. These are not Ordenex trades.',

      'fDecl': 'Declared · Board',
      'declBadge': 'DECLARED PRICE',
      'declRot': 'Price set by resolution of the Board of Directors. ONDK does not trade yet: there is no book and no counterparty, so this number is not a market price. Every candle in the chart is one minute: it opens at the previous resolution’s price and closes at that one’s, with no wick, because between two minutes there was not a single trade.',
      'declNo': 'We couldn’t fetch the declared price. It retries on its own.',
      'declVacio': 'The Board has not declared a price for this instrument yet.',
      'declVig': 'in force since {fecha} · minute {acta}',

      'aukaT': 'AUKA and ORIGEN are the same metal',
      'aukaP': 'AUKA is one ounce of gold and ORIGEN is a gram of gold divided by 55. Since both are gold, their ratio never moves: 1 AUKA = 1,710.69 ORIGEN, today and always. The price that does move is the price of gold, and it lives in the Reference tab, in dollars.',

      'sectorP': 'This pair opens when someone places the first order. The price is born in the book below, not in a feed.',

      'libro': 'Order book',
      'precio': 'Price', 'cantidad': 'Amount', 'hora': 'Time',
      'sinLibro': 'No orders resting in this book yet.',
      'libroNo': 'We couldn’t fetch the book. It retries on its own.',
      'tratos': 'Latest trades',
      'sinTratos': 'No trades in this market yet.',
      'tratosNo': 'We couldn’t fetch the trades. It retries on its own.',

      'operar': 'Trade',
      'comprar': 'Buy', 'vender': 'Sell',
      'limite': 'Limit', 'mercado': 'Market',
      'precioLbl': 'Price (ORIGEN per {sim})',
      'cantLbl': 'Amount ({sim})',
      'total': 'Total', 'totalAprox': 'Estimated total',
      'disp': 'Available: {monto} {sim}',
      'dispNo': 'We couldn’t read your balance. Nothing gets placed on an unread balance — try again in a moment.',
      'max': 'Use all',
      'colocada': 'Order placed.',
      'cancelada': 'Order cancelled.',
      'noCubre': 'The book doesn’t cover the whole amount: whatever doesn’t match is cancelled — it never rests.',

      'eCant': 'The amount is not valid: digits, a decimal point, and up to 18 decimals.',
      'ePrecio': 'The price is not valid: digits, a decimal point, and up to 18 decimals.',
      'eChico': 'The order is too small: the total rounds down to zero wei.',
      'eSaldo': 'Not enough balance: you have {monto} {sim} available.',
      'eLibro': 'We couldn’t read the book to estimate the cost. Try again in a moment.',
      'eColocar': 'The order could not be placed.',
      'eCancelar': 'The order could not be cancelled.',
      'eSesion': 'Your session expired. Sign in again with your Veta Wallet account.',

      'invitarT': 'To trade, sign in with your account',
      'invitarP': 'Everything you are looking at is public — the book, the candles, the trades. To place an order sign in with your Veta Wallet account: Ordenex stores no passwords.',
      'invitarBtn': 'Sign in with my Veta Wallet account',

      'misOrdenes': 'My open orders',
      'sinOrdenes': 'You have no open orders in this market.',
      'ordenesNo': 'We couldn’t fetch your orders. It retries on its own.',
      'lado': 'Side', 'tipo': 'Type', 'resta': 'Left', 'cancelar': 'Cancel',
    },
  };

  /* El idioma: el que dice i18n.js si ya cargó (idiomaActivo — carga después
     de este archivo pero antes de que nadie pinte), y si no, el guardado en
     ordenex.idioma. El mismo dato por los dos caminos: los módulos no pueden
     hablar un idioma distinto que el cascarón. */
  function idi() {
    try { if (typeof idiomaActivo === 'function') return idiomaActivo(); } catch {}
    try { const g = localStorage.getItem('ordenex.idioma'); if (g === 'es' || g === 'en') return g; } catch {}
    return (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
  }
  const tx = k => (TXT[idi()] || TXT.es)[k] ?? TXT.es[k] ?? k;
  const rell = (s, m) => s.replace(/\{(\w+)\}/g, (_, k) => m[k] ?? '');

  // ── el dinero, a mano y con BigInt ────────────────────────────────────────

  function entero(s) {
    if (s == null || s === '') return null;
    try { return BigInt(s); } catch { return null; }
  }

  /* De wei a texto PLANO, sin separadores de miles. Existe porque ONX.deWei
     pone comas para leer («1,234.5») y una coma dentro de un <input> es
     veneno: ONX.aWei la toma por punto decimal y 1,234 se vuelve 1.234. Lo
     que va a un campo de formulario pasa por acá; lo que se pinta, por deWei. */
  function texto(wei, dec = 18) {
    let n = typeof wei === 'bigint' ? wei : entero(wei);
    if (n == null) return '';
    const signo = n < 0n ? '-' : '';
    if (n < 0n) n = -n;
    const ent = (n / WEI).toString();
    const cola = (n % WEI).toString().padStart(18, '0').slice(0, Math.max(0, dec)).replace(/0+$/, '');
    return signo + ent + (cola ? '.' + cola : '');
  }

  // notional = cantidad × precio / 1e18, truncando — la misma cuenta que hace
  // el motor del backend, para que el total que se enseña sea el que se cobra.
  const notionalDe = (cant, precio) => (cant * precio) / WEI;

  // La pastilla del cambio 24h. El único Number del módulo: un porcentaje es
  // un adorno, no un monto — jamás se opera con él.
  function pastillaCambio(chg) {
    if (chg == null || !isFinite(Number(chg))) return '<span class="vm-sin">—</span>';
    const n = Number(chg);
    return `<span class="pastilla ${n < 0 ? 'baja-p' : 'sube-p'}">${n >= 0 ? '+' : ''}${esc(n.toFixed(2))}%</span>`;
  }

  // El icono del activo: logo si lo trae, glifo sobre degradado si no —
  // la misma gramática visual que la billetera y el teléfono.
  function icono(sim) {
    const m = CADENA.meta(sim);
    if (m.img) return `<span class="vm-ic"><img src="${esc(m.img)}" alt=""></span>`;
    const [a, b] = m.grad || ['#EAD79C', '#96793F'];
    return `<span class="vm-ic" style="background:linear-gradient(135deg,${esc(a)},${esc(b)});color:${esc(m.fg || '#3A2C08')}">${esc(m.glifo || String(sim || '?')[0])}</span>`;
  }

  const hora = en => {
    const d = new Date(en);
    return isNaN(d.getTime()) ? '—' : d.toTimeString().slice(0, 8);
  };

  /* La fecha de un acta, con el año entero: una resolución de la Junta se cita
     por su fecha completa, y «15/01» a secas no sirve para buscarla en un
     libro que abarca años. El guion cuando no se puede leer, como siempre. */
  const fechaLarga = en => {
    const d = new Date(en);
    if (isNaN(d.getTime())) return '—';
    const dd = x => String(x).padStart(2, '0');
    return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}`;
  };

  // ── el estado de la sala ──────────────────────────────────────────────────

  let paradores = [];        // cada sondeo devuelve su parador; apagar() los corre todos
  let pararGrafica = null;   // el reloj de la gráfica va aparte: cambia de ritmo con la fuente
  /* Los gestos del lienzo: viven aparte del reloj porque sobreviven a los
     repintados. Se rearman al montar la vista y se apagan con ella. */
  let gestosGrafica = null;
  let alResize = null;
  let parActual = null;      // 'AUKA-ORIGEN'
  let ladoActual = 'compra';
  let tipoActual = 'limite';

  /* La fuente de la gráfica y su marco. Un marco POR FUENTE y no uno solo:
     '4h' no existe entre los tratos y '1m' no existe en el feed del metal, así
     que un marco compartido obligaría a inventar una traducción entre dos
     rejillas de tiempo que no se corresponden. Yendo y viniendo entre
     pestañas, cada una recuerda dónde estaba. */
  let fuenteActual = 'tratos';
  let marcos = { tratos: MARCO_INICIAL.tratos, referencia: MARCO_INICIAL.referencia };
  /* ¿La fuente se decidió ya con la lista de mercados en la mano (o con un
     dedo humano)? Mientras sea false, la primera respuesta buena puede
     corregirla UNA vez: abrir en la pestaña del metal un mercado que sí tiene
     tratos sería esconder justo lo que esta casa hace. */
  let fuenteFirme = false;

  let mercadosCache = null;  // la última lista buena — un dato viejo y honesto vale más que un parpadeo a vacío
  let libroCache = null;     // el último libro bueno DEL PAR ABIERTO; se tira al cambiar de par
  let velasCache = null;     // velas de TRATOS, en wei de ORIGEN
  let refCache = null;       // el paquete de REFERENCIA del API: { activo, rotulo, fuente, actualizadoEn, velas } en USD
  let declCache = null;      // el paquete DECLARADO: { token, clase, moneda, vigente, serie } — actas, no velas
  let cuentas = null;        // los saldos del portafolio si hay sesión; null = no leídos (fail-closed)
  /* La llave de idempotencia de la orden EN CURSO. Se estrena al enviar, se
     conserva si el fallo fue de red (el reintento tiene que ser LA MISMA
     orden para el servidor) y se tira si el servidor la rechazó a propósito o
     si la persona tocó el formulario: eso ya es otra orden. */
  let ordenKeyViva = null;

  function llaveNueva() {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }

  // ── qué fuente le toca a cada mercado ─────────────────────────────────────

  /* El par cuya fuente ya se decidió, y el «no» que haya traído el API. La
     vista se arma ANTES de que alPintar toque el estado, así que la decisión
     se toma al armarla (prepararFuente): el selector tiene que salir pintado
     ya en la pestaña correcta, no saltar a otra un segundo después. */
  let parPreparado = null;
  let referenciaNegada = false;
  let declaradoNegado = false;

  const marcosDe = f => MARCOS[f === 'referencia' ? 'referencia' : 'tratos'];
  const marcoDe = () => marcos[fuenteActual];

  /* ¿Este mercado lleva precio declarado por la Junta? Misma mecánica que
     hayRef, mismo fail-closed: si el API dice NO_DECLARABLE, se retira la
     pestaña por más que la lista de aquí diga que sí. */
  const hayDecl = par => !declaradoNegado
    && CON_DECLARADO.includes(String(par || '').split('-')[0]);

  /* ¿Este mercado tiene cartel del metal detrás? La lista blanca decide y el
     404 SIN_REFERENCIA del API la corrige: si él dice que no, no hay pestaña
     por más que la tabla de aquí diga que sí. La verdad de la referencia vive
     en el servidor; esta copia solo evita pedir lo que se sabe que no está. */
  const hayRef = par => !referenciaNegada
    && CON_REFERENCIA.includes(String(par || '').split('-')[0]);

  /* Con qué pestaña abre un mercado.
     · Sin referencia no hay nada que elegir: tratos, y su lienzo dirá la
       verdad — que todavía no hay ninguno.
     · Con referencia manda lo que la persona vino a ver: si el par no tiene un
       solo trato (`ultimo` en null; hoy, todos), la única gráfica con algo
       dentro es la del metal y ahí se abre. Si ya hay tratos, mandan los
       tratos: ese es el precio de esta casa y el otro es el cartel de la pared.
     · Y si la lista de mercados aún no llegó no se adivina EN FIRME: se abre
       en referencia y se deja la puerta abierta a que la primera respuesta
       buena lo corrija una única vez (cargarCab). */
  function fuenteInicial(par) {
    /* ONDK primero: es el único con precio declarado, y mientras no cotice esa
       es la única pestaña con algo dentro. En cuanto haya un solo trato manda
       el trato — el precio del libro es el de verdad y el declarado pasa a ser
       lo que siempre fue, la referencia de la Junta. */
    if (hayDecl(par)) {
      const m = (mercadosCache || []).find(x => x.mercado === par);
      if (!m) return { fuente: 'declarado', firme: false };
      return { fuente: m.ultimo == null ? 'declarado' : 'tratos', firme: true };
    }
    if (!hayRef(par)) return { fuente: 'tratos', firme: true };
    const m = (mercadosCache || []).find(x => x.mercado === par);
    if (!m) return { fuente: 'referencia', firme: false };
    return { fuente: m.ultimo == null ? 'referencia' : 'tratos', firme: true };
  }

  /* Idempotente por par: abrir OTRO mercado decide todo de nuevo; repintar el
     MISMO —al cambiar de idioma, por ejemplo— respeta la pestaña y el marco
     que la persona tenga elegidos. */
  function prepararFuente(par) {
    if (par === parPreparado) return;
    parPreparado = par;
    referenciaNegada = false;
    declaradoNegado = false;
    marcos = { tratos: MARCO_INICIAL.tratos, referencia: MARCO_INICIAL.referencia };
    /* Las velas del mercado anterior se tiran AQUÍ y no solo en alPintar,
       porque la vista se arma antes que él: sin esto, el primer pintado de
       AGKA llevaría un instante el rótulo del oro debajo. Un rótulo prestado
       de otro activo es, por un segundo, exactamente la mentira que esta sala
       no dice. */
    velasCache = null;
    refCache = null;
    declCache = null;
    const d = fuenteInicial(par);
    fuenteActual = d.fuente;
    fuenteFirme = d.firme;
  }

  // ── la hoja de la sala. Viaja dentro de la vista porque el cascarón solo
  //    trae la geometría común (.tabla, .vidrio, .pastilla); lo que es solo
  //    de esta sala vive con esta sala. Un <style> por innerHTML aplica igual
  //    que uno del head, y así el módulo entra y sale en un solo archivo. ────

  const ESTILO = `<style>
    .vm-ic{width:34px;height:34px;flex:0 0 auto;border-radius:11px;display:inline-grid;place-items:center;
      background:rgba(201,169,97,.11);border:1px solid var(--linea2);overflow:hidden;
      font-size:15px;font-weight:700;vertical-align:middle}
    .vm-ic img{width:100%;height:100%;object-fit:cover}
    .ms-fila{cursor:pointer;transition:background .15s}
    .ms-fila:hover{background:rgba(116,230,200,.05)}
    .ms-par{display:flex;align-items:center;gap:11px}
    .ms-par b{font-size:14.5px;color:var(--crema)}
    .ms-par small{color:var(--humo);font-size:11.5px}
    .ms-nom{display:block;font-size:11.5px;color:var(--humo);margin-top:1px}
    .ms-ref,.vm-refchica{display:block;font-size:10.5px;color:var(--humo);font-family:var(--sans)}
    .vm-sin{color:var(--humo)}

    .vm-volver{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;
      color:var(--bruma);padding:0 0 10px}
    .vm-volver:hover{color:var(--oroLt)}
    .vm-tit{display:flex;align-items:center;gap:11px}
    .vm-tit small{color:var(--humo);font-size:13px;font-weight:600}
    /* ═══ LA BARRA DE ESTADÍSTICAS ═══════════════════════════════════════
       Lo que separa una ficha de producto de una mesa de operaciones. Último,
       24 h, máximo, mínimo y volumen en una sola fila, en cifras tabulares
       para que las columnas no bailen al refrescar. Cada dato con su etiqueta
       chica encima: sin etiqueta, cinco números seguidos son un jeroglífico. */
    .vm-stats{display:flex;flex-wrap:wrap;align-items:center;gap:0 26px;
      padding:12px 0 0;margin-top:12px;border-top:1px solid var(--linea2)}
    /* El bloque de las cuatro cifras es una fila dentro de la fila: asi
       pintarStats sigue escribiendo en UN solo nodo y no en cuatro sueltos.
       (Y sin comillas invertidas en este comentario: la hoja entera vive
       dentro de una plantilla de JS y una comilla invertida la parte.) */
    #vm-stats{display:flex;flex-wrap:wrap;align-items:center;gap:0 26px}
    .vm-stat-precio .vm-ultimo{font-size:19px;font-weight:700;color:var(--crema);
      font-variant-numeric:tabular-nums}
    .vm-stats .vm-refchica{margin-left:auto;font-size:11.5px;color:var(--humo);
      font-family:var(--mono)}
    .vm-stat{display:flex;flex-direction:column;gap:2px;min-width:74px}
    .vm-stat .et{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--humo);
      font-family:var(--mono)}
    .vm-stat .v{font-size:13px;font-family:var(--mono);font-variant-numeric:tabular-nums;
      color:var(--crema)}
    .vm-stat .v.alto{color:var(--jade)} .vm-stat .v.bajo{color:var(--coral)}
    @media (max-width:640px){.vm-stats{gap:0 16px}.vm-stat{min-width:64px}}

    .vm-cifras{text-align:right}
    .vm-ultimo{font-size:clamp(20px,2.4vw,26px);font-weight:700;
      font-variant-numeric:lining-nums tabular-nums}

    /* Tres columnas, como cualquier casa de cambio: la lista de mercados a la
       izquierda, la gráfica y el formulario en el medio, el libro y los tratos
       a la derecha. Antes eran dos y para cambiar de par había que salir de la
       sala — el gesto más repetido de un operador era el más caro. */
    .vm-rejilla{display:grid;grid-template-columns:236px minmax(0,1fr) 318px;gap:16px;
      align-items:start;margin-top:16px}
    @media (max-width:1380px){.vm-rejilla{grid-template-columns:minmax(0,1fr) 318px}
      .vm-lista{display:none}}
    @media (max-width:1100px){.vm-rejilla{grid-template-columns:1fr}}

    /* ═══ LA LISTA DE MERCADOS DE LA SALA ═══════════════════════════════════
       Con buscador y favoritos. Los favoritos van arriba y viven en el
       navegador de cada quien: es una preferencia de pantalla, no un dato de
       la casa, y mandarla al servidor seria pedirle sesion a quien solo mira. */
    .vm-lista{padding:0;overflow:hidden}
    .vm-buscar{display:flex;align-items:center;gap:8px;padding:10px 12px;
      border-bottom:1px solid var(--linea2)}
    .vm-buscar svg{width:14px;height:14px;flex:none;stroke:var(--humo);fill:none;stroke-width:1.8}
    .vm-buscar input{flex:1;min-width:0;background:none;border:0;outline:none;
      font-size:12.5px;color:var(--crema)}
    .vm-buscar input::placeholder{color:var(--humo)}
    .vm-lista-cab{display:grid;grid-template-columns:1fr auto auto;gap:8px;
      padding:7px 12px;font-family:var(--mono);font-size:10px;letter-spacing:.08em;
      text-transform:uppercase;color:var(--humo);border-bottom:1px solid var(--linea2)}
    .vm-lista-cuerpo{max-height:min(62vh,560px);overflow-y:auto}
    .vm-it{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;
      width:100%;padding:7px 12px;text-align:left;font-size:12.5px;
      font-variant-numeric:tabular-nums;border-left:2px solid transparent;transition:background .12s}
    .vm-it:hover{background:rgba(238,241,245,.045)}
    .vm-it[aria-current=true]{background:rgba(201,169,97,.10);border-left-color:var(--oro)}
    .vm-it .nom{display:flex;align-items:center;gap:6px;min-width:0;color:var(--crema);font-weight:600}
    .vm-it .nom small{color:var(--humo);font-weight:400}
    .vm-it .pr{font-family:var(--mono);color:var(--bruma)}
    .vm-it .ch{font-family:var(--mono);font-size:11.5px;min-width:56px;text-align:right}
    .vm-it .ch.sube{color:var(--jade)} .vm-it .ch.baja{color:var(--coral)} .vm-it .ch.nada{color:var(--humo)}
    .vm-fav{flex:none;width:14px;height:14px;padding:0;line-height:1;color:var(--humo);
      font-size:12px;opacity:.55;transition:.15s}
    .vm-fav:hover{opacity:1;color:var(--oroLt)}
    .vm-fav[aria-pressed=true]{opacity:1;color:var(--oro)}
    .vm-lista-vacio{padding:18px 12px;font-size:12.5px;color:var(--humo);text-align:center}

    /* ═══ LAS PESTAÑAS DE ABAJO ═════════════════════════════════════════════
       Mis ordenes abiertas y el historial, debajo del libro y sin cambiar de
       vista. Un operador mira sus ordenes cada pocos segundos; mandarlo a otra
       pantalla para eso es el error de diseño mas caro que tenia esta sala. */
    .vm-peskab{display:flex;gap:2px;border-bottom:1px solid var(--linea2);margin-bottom:10px}
    .vm-peskab button{padding:8px 14px;font-size:12.5px;font-weight:600;color:var(--humo);
      border-bottom:2px solid transparent;transition:.15s}
    .vm-peskab button:hover{color:var(--bruma)}
    .vm-peskab button[aria-selected=true]{color:var(--crema);border-bottom-color:var(--oro)}
    .vm-peskab .cuenta{margin-left:5px;font-family:var(--mono);font-size:10.5px;color:var(--oro)}
    .vm-mia{display:grid;grid-template-columns:auto 1fr auto auto;gap:10px;align-items:center;
      padding:7px 2px;border-bottom:1px solid rgba(238,241,245,.05);font-size:12.5px;
      font-variant-numeric:tabular-nums}
    .vm-mia:last-child{border-bottom:0}
    .vm-mia .lado{font-weight:700;font-size:11px;letter-spacing:.04em;text-transform:uppercase}
    .vm-mia .lado.compra{color:var(--jade)} .vm-mia .lado.venta{color:var(--coral)}
    .vm-mia .pr{color:var(--crema)} .vm-mia .ct{color:var(--bruma);font-size:11.5px}
    .vm-mia .x{color:var(--humo);font-size:12px;padding:2px 5px;line-height:1}
    .vm-mia .x:hover{color:var(--coral)}

    /* La cabecera de la gráfica: la fuente manda y el marco la sigue, en esa
       lectura y en ese orden — primero QUÉ se está viendo, después con qué
       lupa. En pantalla angosta el marco baja de renglón; la fuente nunca. */
    .vm-cabgraf{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px}
    .vm-marcos{display:flex;border:1px solid var(--linea2);border-radius:100px;overflow:hidden;
      width:max-content;background:rgba(2,22,23,.55)}
    .vm-marcos button{padding:7px 15px;font-size:12px;font-weight:700;font-family:var(--mono);
      color:var(--humo);transition:.2s}
    .vm-marcos button[aria-pressed=true]{background:rgba(201,169,97,.16);color:var(--oroHi)}

    /* El selector de fuente. Cada pestaña lleva su unidad escrita porque la
       unidad ES la diferencia: en ORIGEN se opera, en dólares se mira. Y la de
       referencia se enciende en oro —el mismo oro del rótulo al pie y de la
       línea punteada de la gráfica— para que el ojo aprenda de una vez que el
       oro, en esta sala, significa «esto no es un trato». */
    .vm-fuentes{display:flex;border:1px solid var(--linea2);border-radius:100px;overflow:hidden;
      width:max-content;background:rgba(2,22,23,.55)}
    .vm-fuentes button{padding:7px 16px;font-size:12px;font-weight:700;color:var(--humo);transition:.2s}
    .vm-fuentes button[aria-pressed=true]{background:rgba(116,230,200,.14);color:var(--acento)}
    /* Las dos pestañas que NO son tratos van en oro y no en jade: el jade es
       el color de lo que pasó en esta casa. Un cartel de fuera y una
       resolución de la Junta no son operaciones, y el color lo dice antes de
       que nadie lea el rótulo. */
    .vm-fuentes button[data-fuente=referencia][aria-pressed=true],
    .vm-fuentes button[data-fuente=declarado][aria-pressed=true]{
      background:rgba(201,169,97,.18);color:var(--oroHi)}

    /* El rótulo de la referencia: vive DEBAJO de su gráfica y mientras esa
       gráfica se vea, sin manera de cerrarlo. No es letra chica metida con
       calzador, es la mitad del dato — un precio del metal sin decir que es
       del metal no es un dato, es una insinuación. */
    .vm-rotulo{display:flex;flex-wrap:wrap;align-items:baseline;gap:7px 10px;margin-top:13px;
      padding-top:11px;border-top:1px solid var(--linea2);
      font-size:12.5px;line-height:1.6;color:var(--bruma)}
    .vm-rotulo b{font-family:var(--mono);font-size:9.5px;font-weight:700;letter-spacing:.11em;
      color:var(--oroHi);background:rgba(201,169,97,.13);border:1px solid var(--linea2);
      border-radius:100px;padding:2.5px 9px}
    .vm-rotulo small{color:var(--humo);font-size:11px;font-family:var(--mono)}

    /* La nota de producto: explica el activo, no advierte de nada. Un filete
       de oro a la izquierda y nada más — un recuadro ámbar con signo de
       admiración diría «cuidado» justo donde hay que decir «así funciona». */
    .vm-prod{margin-top:14px;padding:12px 15px;border-left:2px solid var(--oro);
      border-radius:0 10px 10px 0;background:rgba(201,169,97,.06);
      font-size:12.5px;line-height:1.65;color:var(--bruma)}
    .vm-prod b{display:block;color:var(--crema);font-size:13px;margin-bottom:5px}

    .vm-lienzo{position:relative;margin-top:16px}
    /* Los mandos flotan sobre el lienzo, arriba a la derecha, discretos hasta
       que la mano se acerca: son ayuda, no decoración. */
    .vm-zoom{position:absolute;top:10px;right:12px;display:flex;gap:5px;
      opacity:.30;transition:opacity .2s}
    .vm-lienzo:hover .vm-zoom,.vm-zoom:focus-within{opacity:1}
    .vm-zoom button{width:26px;height:26px;padding:0;cursor:pointer;
      border:1px solid var(--linea2);border-radius:7px;background:rgba(2,27,28,.78);
      color:var(--bruma);font:700 13px/1 var(--sans);backdrop-filter:blur(6px)}
    .vm-zoom button:hover{color:var(--oroHi);border-color:var(--linea)}
    .vm-lienzo canvas{display:block;width:100%;height:clamp(340px,52vh,620px);border-radius:12px}
    /* En la sala ancha el libro se estira a la par de la gráfica: una columna
       de 318 px contra un lienzo de 1.200 se veía como una nota al margen. */
    /* En la sala a pantalla ancha el libro gana ancho, PERO siguen siendo tres
       columnas. Esta regla se quedo en dos cuando la rejilla paso a tres y
       dejaba la lista ocupando el centro y el libro cayendo a otro renglon:
       una regla vieja que pisa a la nueva y rompe la pantalla entera. */
    body.en-mercado .vm-rejilla{grid-template-columns:248px minmax(0,1fr) 356px}
    @media (max-width:1380px){body.en-mercado .vm-rejilla{grid-template-columns:minmax(0,1fr) 340px}}
    @media (max-width:1100px){body.en-mercado .vm-rejilla{grid-template-columns:1fr}}
    .vm-nota{position:absolute;inset:0;display:grid;place-items:center;text-align:center;
      color:var(--humo);font-size:13px;line-height:1.6;padding:0 20px;pointer-events:none}

    /* El libro: ventas coral arriba, compras jade abajo, y la barra de
       profundidad acumulada creciendo desde la derecha — la forma clásica de
       ver de un vistazo cuánto hay detrás de cada precio. */
    .vm-cab3{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 8px 8px;
      font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--humo);
      border-bottom:1px solid var(--linea2)}
    .vm-cab3 span:last-child{text-align:right}
    .vm-lado{display:flex;flex-direction:column}
    /* Cifras tabulares en TODO el libro: sin ellas, cada refresco mueve las
       columnas un pelo y el ojo tiene que volver a buscar la coma. */
    .vm-lado,.vm-medio,#vm-tratos{font-variant-numeric:tabular-nums}
    .vm-fila{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:8px;
      padding:5.5px 8px;font-size:12.5px;text-align:left;border-radius:6px;overflow:hidden;
      font-variant-numeric:lining-nums tabular-nums;transition:background .12s}
    .vm-fila::before{content:"";position:absolute;right:0;top:0;bottom:0;width:var(--prof,0%);
      border-radius:6px 0 0 6px;pointer-events:none}
    .vm-fila span{position:relative;z-index:1}
    .vm-fila span:last-child{text-align:right;color:var(--bruma)}
    .vm-fila.compra .vm-p{color:var(--jade)}
    .vm-fila.compra::before{background:rgba(62,217,160,.10)}
    .vm-fila.venta .vm-p{color:var(--coral)}
    .vm-fila.venta::before{background:rgba(240,119,107,.10)}
    .vm-fila:hover{background:rgba(255,255,255,.05)}
    .vm-medio{display:flex;align-items:center;justify-content:center;gap:8px;
      padding:9px 8px;margin:4px 0;border-top:1px solid rgba(255,255,255,.06);
      border-bottom:1px solid rgba(255,255,255,.06);
      font-size:15px;font-weight:700;font-variant-numeric:lining-nums tabular-nums}
    .vm-medio small{font-size:10.5px;font-weight:600;color:var(--humo);font-family:var(--sans)}
    .vm-vacio{padding:16px 8px;text-align:center;color:var(--humo);font-size:12.5px;line-height:1.6}

    .vm-trato{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;padding:5.5px 8px;
      font-size:12.5px;font-variant-numeric:lining-nums tabular-nums}
    .vm-trato span:nth-child(2){text-align:right;color:var(--bruma)}
    .vm-trato span:last-child{color:var(--humo);font-size:11.5px}
    .vm-trato.compra span:first-child{color:var(--jade)}
    .vm-trato.venta span:first-child{color:var(--coral)}

    .vm-seg{display:flex;border:1px solid var(--linea2);border-radius:100px;overflow:hidden;
      background:rgba(2,22,23,.55);margin-bottom:14px}
    .vm-seg button{flex:1;padding:10px 8px;font-size:13px;font-weight:700;color:var(--humo);transition:.2s}
    .vm-seg button[aria-pressed=true]{color:var(--crema);background:rgba(201,169,97,.14)}
    .vm-seg.lados button[aria-pressed=true].es-compra{background:rgba(62,217,160,.16);color:var(--jade)}
    .vm-seg.lados button[aria-pressed=true].es-venta{background:rgba(240,119,107,.16);color:var(--coral)}
    .vm-linea-total{display:flex;justify-content:space-between;align-items:baseline;
      padding:12px 2px 2px;font-size:13px;color:var(--bruma)}
    .vm-linea-total b{font-size:15px;color:var(--crema);font-variant-numeric:lining-nums tabular-nums}
    .vm-aviso{min-height:18px;margin:8px 2px 10px;font-size:12.5px;line-height:1.55;color:var(--coral)}
    .vm-aviso.suave{color:var(--humo)}
    .vm-max{font-weight:700;color:var(--oroLt);padding:0;font-size:11.5px}
    .vm-max:hover{color:var(--oroHi)}
    /* El botón de operar habla el idioma de la casa: jade compra, coral
       vende. El texto va oscuro como en el btn-oro — sobre color claro. */
    .vm-btn.compra{background:linear-gradient(120deg,#5CE8B4,var(--jade) 60%,#5CE8B4);color:#04291B;
      box-shadow:0 14px 40px -16px rgba(62,217,160,.55)}
    .vm-btn.venta{background:linear-gradient(120deg,#F59A90,var(--coral) 60%,#F59A90);color:#3A0F0A;
      box-shadow:0 14px 40px -16px rgba(240,119,107,.55)}
    .vm-btn:hover{transform:translateY(-2px)}
  </style>`;

  // ── la referencia puntual, traída a la unidad del eje ─────────────────────

  /* GET /mercados manda la referencia como OBJETO y en dólares:
     `{ usd, rotulo, origenUsd, fuente, en }` — dólares porque es donde el metal
     se mueve de verdad. Pero la columna «Último» y el eje de la gráfica de
     tratos están en ORIGEN, así que aquí se sitúa la referencia en ESA unidad:
     cuántos ORIGEN vale la onza, o sea el precio de la onza entre el precio del
     gramín. Para AUKA sale 1710,69 clavado y para siempre —las dos cosas son
     oro—; para AGKA sale el ratio oro:plata, que sí se mueve.

     `usd` solo viene para el oro y la plata: en los doce tokens de sector es
     null y entonces no se enseña NADA. El `origenUsd` que viaja en el mismo
     paquete es el precio de ORIGEN, y ponerlo en la fila de MNKA sería pintar
     el precio de un activo en el renglón de otro.

     La división se hace con Number porque los dos números NACIERON flotantes en
     el feed y fingir exactitud sería teatro; el resultado se pasa a wei por
     TEXTO (toFixed, no ×1e18) para no arrastrar la basura binaria del flotante,
     y sale como STRING — jamás como el objeto crudo, que para VELAS significa
     otra cosa muy distinta: que la gráfica ENTERA es referencia. Ante cualquier
     rareza, null: sin línea es mejor que con línea inventada. */
  function refEnOrigen(m) {
    const r = m?.referencia;
    const usd = Number(r?.usd), gramin = Number(r?.origenUsd);
    if (!Number.isFinite(usd) || !Number.isFinite(gramin) || usd <= 0 || gramin <= 0) return null;
    const [ent, dec = ''] = (usd / gramin).toFixed(12).split('.');
    try { return (BigInt(ent) * WEI + BigInt(dec.padEnd(18, '0').slice(0, 18))).toString(); }
    catch { return null; }
  }

  /* Y la misma referencia ESCRITA, en dólares y con su signo — igual que en la
     tabla viva de la portada (app.js), que es la otra pantalla donde este dato
     aparece: el metal se mueve contra el dólar y ahí se enseña en su unidad.
     El eje de la gráfica es otra cosa y por eso tiene otra función: allí la
     línea tiene que caer sobre precios en ORIGEN o no significa nada. */
  function refUsd(m) {
    const n = Number(m?.referencia?.usd);
    if (!Number.isFinite(n) || n <= 0) return null;
    const [ent, dec] = n.toFixed(2).split('.');
    return '$' + ent.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
  }

  // ══ LA LISTA DE MERCADOS ══════════════════════════════════════════════════

  function vistaMercados() {
    return `${ESTILO}
    <div class="cab"><div>
      <h2>${esc(tx('t'))}</h2>
      <div class="sub">${esc(tx('sub'))}</div>
    </div></div>
    <div class="vidrio bloque">
      <table class="tabla">
        <thead><tr>
          <th>${esc(tx('cMercado'))}</th>
          <th>${esc(tx('cUltimo'))}</th>
          <th>${esc(tx('cCambio'))}</th>
          <th>${esc(tx('cVol'))}</th>
        </tr></thead>
        <tbody id="ms-cuerpo"></tbody>
      </table>
      <p class="pie" id="ms-nota">${esc(tx('cargando'))}</p>
    </div>`;
  }

  /* Se itera CADENA.PARES y no la respuesta del API: la tabla de activos es
     el contrato, y así los catorce mercados están SIEMPRE en pantalla, en el
     orden de la cadena, con guiones donde el dato no llegó — un mercado sin
     feed no es un mercado que desaparece. */
  async function pintarMercados() {
    const cuerpo = $('ms-cuerpo'), nota = $('ms-nota');
    if (!cuerpo) return;
    try {
      mercadosCache = await DATOS.mercados();
    } catch {
      // Si ya había datos pintados se dejan quietos: viejos y honestos.
      if (nota && !mercadosCache) nota.textContent = tx('sinFeed');
      if (mercadosCache) pintarFilasMercados(cuerpo, nota);
      return;
    }
    pintarFilasMercados(cuerpo, nota);
  }

  function pintarFilasMercados(cuerpo, nota) {
    const porPar = new Map((mercadosCache || []).map(m => [m.mercado, m]));
    cuerpo.innerHTML = CADENA.PARES.map(par => {
      const sim = CADENA.baseDe(par);
      const m = porPar.get(par) || {};
      const ultimo = deWei(m.ultimo, 4);
      const ref = refUsd(m);
      const vol = deWei(m.vol24h, 2);
      return `
      <tr class="ms-fila" onclick="ONX.vista('mercado', ${jsTxt(par)})">
        <td><span class="ms-par">${icono(sim)}<span><b>${esc(sim)}</b> <small>/ ORIGEN</small>
          <span class="ms-nom">${esc(CADENA.meta(sim).n || '')}</span></span></span></td>
        <td class="mono">${ultimo == null ? '<span class="vm-sin">—</span>' : esc(ultimo)}
          ${ref == null ? '' : `<small class="ms-ref">${esc(tx('ref'))} ${esc(ref)}</small>`}</td>
        <td>${pastillaCambio(m.cambio24h)}</td>
        <td class="mono">${vol == null ? '<span class="vm-sin">—</span>' : esc(vol) + ' ' + esc(sim)}</td>
      </tr>`;
    }).join('');
    if (nota) nota.textContent = '';
  }

  // ══ UN MERCADO ABIERTO ════════════════════════════════════════════════════

  function vistaMercado(par) {
    const sim = CADENA.baseDe(par);
    if (!sim) {
      // Un par que no está en la tabla no se pinta a medias: se dice.
      return `${ESTILO}
      <div class="cab"><div><h2>${esc(tx('t'))}</h2></div></div>
      <div class="vidrio bloque"><div class="vacio"><b>${esc(tx('parRaro'))}</b>${esc(tx('parRaroP'))}</div></div>`;
    }
    // La pestaña con la que abre este mercado se decide aquí, antes de escribir
    // una sola etiqueta: el selector sale pintado ya en su sitio.
    prepararFuente(par);
    const ficha = CADENA.ficha(sim, idi());
    return `${ESTILO}
    <div class="cab">
      <div>
        <button class="vm-volver" onclick="ONX.vista('mercados')">←&nbsp;${esc(tx('volver'))}</button>
        <h2 class="vm-tit">${icono(sim)} ${esc(sim)} <small>/ ORIGEN</small></h2>
        ${ficha ? `<div class="sub">${esc(ficha.t)} · ${esc(ficha.r)}</div>` : ''}
      </div>
    </div>
    <!-- La barra de la mesa: par, precio y las cinco cifras del dia en UNA
         linea. Antes el precio vivia arriba a la derecha, a media pantalla de
         distancia de su maximo y su minimo — dos datos de la misma cosa
         separados por todo el ancho de la pagina. -->
    <div class="vm-stats">
      <div class="vm-stat vm-stat-precio">
        <span class="et">${esc(tx('ultimo'))}</span>
        <span class="vm-ultimo mono" id="vm-ultimo">—</span>
      </div>
      <div class="vm-stat"><span class="et">24 h</span><span id="vm-cambio">—</span></div>
      <div id="vm-stats"></div>
      <div class="vm-refchica" id="vm-ref"></div>
    </div>
    <div class="vm-rejilla">
      <aside class="vidrio bloque vm-lista">
        <div class="vm-buscar">
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6"/><path d="M13.5 13.5 18 18"/></svg>
          <input id="vm-q" type="search" autocomplete="off" spellcheck="false"
                 placeholder="${esc(tx('ls.buscar'))}" aria-label="${esc(tx('ls.buscar'))}"
                 oninput="VMERCADO.filtrar(this.value)">
        </div>
        <div class="vm-lista-cab">
          <span>${esc(tx('ls.par'))}</span><span>${esc(tx('ls.precio'))}</span><span>24 h</span>
        </div>
        <div class="vm-lista-cuerpo" id="vm-lista"></div>
      </aside>
      <div>
        <div class="vidrio bloque">
          <div class="vm-cabgraf" id="vm-cabgraf">${cabGrafica(par)}</div>
          <div class="vm-lienzo">
            <canvas id="vm-velas"></canvas>
            <div class="vm-nota" id="vm-velas-nota"></div>
            <!-- Los mandos del zoom. Se enseñan aunque la rueda ya funcione:
                 nadie adivina que una gráfica se puede acercar, y en una
                 pantalla táctil no hay rueda que descubrir. -->
            <div class="vm-zoom" id="vm-zoom" role="group" aria-label="${esc(tx('zoomGrupo'))}">
              <button type="button" onclick="VMERCADO.zoom('mas')" title="${esc(tx('zoomMas'))}" aria-label="${esc(tx('zoomMas'))}">+</button>
              <button type="button" onclick="VMERCADO.zoom('menos')" title="${esc(tx('zoomMenos'))}" aria-label="${esc(tx('zoomMenos'))}">−</button>
              <button type="button" onclick="VMERCADO.zoom('todo')" title="${esc(tx('zoomTodo'))}" aria-label="${esc(tx('zoomTodo'))}">⤢</button>
            </div>
          </div>
          <div id="vm-bajo">${bajoGrafica(par)}</div>
        </div>
        <div class="vidrio bloque" id="vm-form-caja">${cajaOperar(sim)}</div>
      </div>
      <div>
        <div class="vidrio bloque">
          <h3>${esc(tx('libro'))}</h3>
          <div class="vm-cab3"><span>${esc(tx('precio'))}</span><span>${esc(tx('cantidad'))}</span></div>
          <div class="vm-lado" id="vm-ventas"></div>
          <div class="vm-medio mono" id="vm-medio">—</div>
          <div class="vm-lado" id="vm-compras"></div>
          <div class="vm-vacio oculto" id="vm-libro-nota"></div>
        </div>
        <div class="vidrio bloque">
          <div class="vm-peskab" role="tablist">
            <button role="tab" aria-selected="true" data-pes="tratos"
                    onclick="VMERCADO.pestana('tratos')">${esc(tx('tratos'))}</button>
            <button role="tab" aria-selected="false" data-pes="mias"
                    onclick="VMERCADO.pestana('mias')">${esc(tx('ps.mias'))}<span class="cuenta" id="vm-nmias"></span></button>
          </div>
          <div id="vm-tratos"><div class="vm-vacio">—</div></div>
          <div id="vm-mias" class="oculto"></div>
        </div>
      </div>
    </div>
    ${DATOS.haySesion() ? `
    <div class="vidrio bloque">
      <h3>${esc(tx('misOrdenes'))}</h3>
      <table class="tabla">
        <thead><tr><th>${esc(tx('lado'))}</th><th>${esc(tx('tipo'))}</th><th>${esc(tx('precio'))}</th>
          <th>${esc(tx('resta'))}</th><th></th></tr></thead>
        <tbody id="vm-ordenes"></tbody>
      </table>
      <p class="pie" id="vm-ordenes-nota"></p>
    </div>` : ''}`;
  }

  // ── la cabecera del mercado: último, cambio y la referencia rotulada ──────

  async function cargarCab() {
    try { mercadosCache = await DATOS.mercados(); } catch { /* lo pintado, quieto */ }
    const m = (mercadosCache || []).find(x => x.mercado === parActual);
    const ultimo = $('vm-ultimo'), cambio = $('vm-cambio'), ref = $('vm-ref'), medio = $('vm-medio');
    if (!ultimo || !m) return;
    const u = deWei(m.ultimo, 4);
    ultimo.textContent = u == null ? '—' : u;
    if (cambio) cambio.innerHTML = pastillaCambio(m.cambio24h);
    const r = refUsd(m);
    /* La referencia SIEMPRE con su rótulo y con su unidad: es el cartel del
       metal en dólares, no la última operación. Debajo va el precio de la casa
       en ORIGEN; que cada número diga en qué está medido es lo que impide
       leerlos como si fueran el mismo. */
    if (ref) ref.textContent = r == null ? '' : `${tx('refRot')}: ${r}`;
    if (medio) medio.innerHTML = `${u == null ? '—' : esc(u)} <small>ORIGEN</small>`;
    pintarStats(m);
    pintarLista();   // la lista de la izquierda vive del mismo dato

    /* La corrección de una sola vez: si la pestaña se eligió a ciegas —sin la
       lista leída— y resulta que este mercado SÍ tiene tratos, mandan los
       tratos. Ocurre una vez o ninguna, y jamás contra un dedo humano: en
       cuanto alguien toca el selector, fuenteFirme queda en true para siempre. */
    if (!fuenteFirme) {
      fuenteFirme = true;
      if (m.ultimo != null && fuenteActual !== 'tratos') {
        fuenteActual = 'tratos';
        pintarCabGrafica();
        relojGrafica();
        return;
      }
    }
    pintarVelas(); // la línea de referencia de la gráfica sale de este dato
  }

  /* ── la barra de estadísticas ──────────────────────────────────────────────
     Máximo, mínimo y volumen de las últimas 24 h, al lado del último precio.
     Es lo que uno espera de una casa de cambio y lo que aquí faltaba.

     Los tres van en GUION cuando el API los manda en null, y eso pasa cuando
     no hubo ni un trato en el día. Es la tentación fácil de esta barra:
     rellenar el máximo con el último precio para que no se vea vacía. Sería
     dibujar un rango que nadie operó — el máximo de veinticuatro horas sin
     operaciones no es el último precio, es que no hay. */
  function pintarStats(m) {
    const caja = $('vm-stats');
    if (!caja) return;
    const cel = (et, valor, clase = '') =>
      `<div class="vm-stat"><span class="et">${esc(et)}</span>
       <span class="v ${clase}">${esc(valor ?? '—')}</span></div>`;
    caja.innerHTML = [
      cel(tx('st.alto'), deWei(m?.alto24h, 4), 'alto'),
      cel(tx('st.bajo'), deWei(m?.bajo24h, 4), 'bajo'),
      cel(tx('st.vol'), deWei(m?.vol24h, 2)),
      cel(tx('st.par'), 'ORIGEN'),
    ].join('');
  }

  /* ═══ LA LISTA DE MERCADOS DE LA SALA ═══════════════════════════════════════
     Con buscador y favoritos, para cambiar de par sin salir. Los favoritos
     viven en el navegador de cada quien: es una preferencia de PANTALLA, no un
     dato de la casa, y mandarla al servidor obligaría a pedir sesión a alguien
     que solo vino a mirar precios.

     Se itera CADENA.PARES y no la respuesta del API, igual que la tabla
     grande: los quince mercados están SIEMPRE, en el orden de la cadena, con
     guion donde el dato no llegó. Un mercado sin feed no es un mercado que
     desaparece de la lista. */
  const LLAVE_FAV = 'onx.favoritos';

  function favoritos() {
    try { return new Set(JSON.parse(localStorage.getItem(LLAVE_FAV) || '[]')); }
    catch { return new Set(); }
  }
  function guardarFav(set) {
    try { localStorage.setItem(LLAVE_FAV, JSON.stringify([...set])); } catch {}
  }

  let filtro = '';

  function favorito(par) {
    const f = favoritos();
    if (f.has(par)) f.delete(par); else f.add(par);
    guardarFav(f);
    pintarLista();
  }

  function filtrar(q) {
    filtro = String(q || '').trim().toUpperCase();
    pintarLista();
  }

  function pintarLista() {
    const caja = $('vm-lista');
    if (!caja) return;
    const fav = favoritos();
    const porPar = new Map((mercadosCache || []).map(m => [m.mercado, m]));

    const pares = CADENA.PARES
      .filter(p => !filtro || String(CADENA.baseDe(p) || p).toUpperCase().includes(filtro))
      // Favoritos arriba, y dentro de cada grupo el orden de la cadena. Un
      // orden por precio o por cambio bailaría en cada refresco.
      .sort((a, b) => (fav.has(b) ? 1 : 0) - (fav.has(a) ? 1 : 0));

    if (!pares.length) {
      caja.innerHTML = `<div class="vm-lista-vacio">${esc(tx('ls.nada'))}</div>`;
      return;
    }

    caja.innerHTML = pares.map(p => {
      const m = porPar.get(p);
      const base = CADENA.baseDe(p) || p;
      const u = deWei(m?.ultimo, 4);
      const chg = m?.cambio24h == null ? null : Number(m.cambio24h);
      const clase = chg == null ? 'nada' : chg < 0 ? 'baja' : 'sube';
      const txt = chg == null ? '—' : `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
      const es = fav.has(p);
      return `<div class="vm-it" aria-current="${String(p === parActual)}">
        <span class="nom">
          <button class="vm-fav" aria-pressed="${String(es)}"
                  aria-label="${esc(tx(es ? 'ls.quitarFav' : 'ls.ponerFav'))}"
                  onclick="event.stopPropagation();VMERCADO.favorito(${jsTxt(p)})">${es ? '★' : '☆'}</button>
          <button style="padding:0;min-width:0;text-align:left;color:inherit;font:inherit"
                  onclick="ONX.vista('mercado',${jsTxt(p)})">${esc(base)}<small>/OG</small></button>
        </span>
        <span class="pr">${u == null ? '—' : esc(u)}</span>
        <span class="ch ${clase}">${esc(txt)}</span>
      </div>`;
    }).join('');
  }

  /* ── las pestañas de abajo ─────────────────────────────────────────────────
     Los tratos de la casa y MIS órdenes abiertas, en el mismo sitio. Un
     operador mira sus órdenes cada pocos segundos; mandarlo a otra vista para
     eso era el error de diseño más caro que tenía esta sala. */
  let pestanaAbierta = 'tratos';

  function pestana(cual) {
    if (cual !== 'tratos' && cual !== 'mias') return;
    pestanaAbierta = cual;
    document.querySelectorAll('.vm-peskab button').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.pes === cual)));
    const t = $('vm-tratos'), m = $('vm-mias');
    if (t) t.classList.toggle('oculto', cual !== 'tratos');
    if (m) m.classList.toggle('oculto', cual !== 'mias');
    if (cual === 'mias') pintarMias();
  }

  /* Mis órdenes, filtradas a ESTE mercado. Ver las de otro par mezcladas aquí
     invita a cancelar la que no era: la pestaña vive dentro de una sala y
     enseña lo de esa sala. */
  function pintarMias() {
    const caja = $('vm-mias');
    if (!caja) return;
    if (!DATOS.haySesion()) {
      caja.innerHTML = `<div class="vm-vacio">${esc(tx('ps.sinSesion'))}</div>`;
      return;
    }
    if (!ordenesCache) {
      caja.innerHTML = `<div class="vm-vacio">${esc(tx('ps.cargando'))}</div>`;
      return;
    }
    const mias = ordenesCache.filter(o => o.mercado === parActual);
    const n = $('vm-nmias');
    if (n) n.textContent = mias.length ? String(mias.length) : '';
    if (!mias.length) {
      caja.innerHTML = `<div class="vm-vacio">${esc(tx('ps.ninguna'))}</div>`;
      return;
    }
    /* `resta / cantidad` y no solo la cantidad: lo que importa de una orden
       abierta es cuánto le FALTA, no con cuánto nació. */
    caja.innerHTML = mias.map(o => `
      <div class="vm-mia">
        <span class="lado ${o.lado === 'venta' ? 'venta' : 'compra'}">
          ${esc(tx(o.lado === 'venta' ? 'vender' : 'comprar'))}</span>
        <span class="mono pr">${o.precio == null ? esc(tx('mercado')) : esc(deWei(o.precio, 4) ?? '—')}</span>
        <span class="mono ct">${esc(deWei(o.resta, 4) ?? '—')} / ${esc(deWei(o.cantidad, 4) ?? '—')}</span>
        <button class="x" onclick="VMERCADO.quitar(${jsTxt(o.id)}, this)"
                aria-label="${esc(tx('cancelar'))}">✕</button>
      </div>`).join('');
  }

  // ══ LA GRÁFICA: DOS FUENTES QUE NO SE MEZCLAN ═════════════════════════════

  // ── la cabecera: el selector de fuente y los marcos de la fuente activa ────

  /* El selector solo existe donde hay algo que elegir: en los doce tokens de
     sector no se dibuja, y punto. Una pestaña que al pulsarla contesta «este
     activo no tiene referencia» es una promesa rota dibujada a propósito. */
  function selectorFuente(par) {
    if (!hayRef(par) && !hayDecl(par)) return '';
    const b = (f, k) => `<button data-fuente="${f}" aria-pressed="${String(f === fuenteActual)}"
      onclick="VMERCADO.fuente(${jsTxt(f)})">${esc(tx(k))}</button>`;
    return `<div class="vm-fuentes" role="group" aria-label="${esc(tx('fuente'))}">
      ${b('tratos', 'fTratos')}${hayRef(par) ? b('referencia', 'fRef') : ''}${
        hayDecl(par) ? b('declarado', 'fDecl') : ''}</div>`;
  }

  /* Los marcos son los de la fuente activa: al cambiar de fuente se cambia el
     juego entero, porque un '1m' de metal o un '4d' de tratos no existen.
     Y en «declarado» no se dibuja ninguno: un precio declarado no tiene marco
     de tiempo. La serie es la lista de actas y se enseña entera — ofrecer un
     «1h» sobre cuatro resoluciones en dos años sería un mando que promete un
     detalle que no existe. */
  function botonesMarco() {
    if (fuenteActual === 'declarado') return '';
    const activo = marcoDe();
    return `<div class="vm-marcos" id="vm-marcos" role="group" aria-label="Marco">
      ${marcosDe(fuenteActual).map(m => `<button data-marco="${m}" aria-pressed="${String(m === activo)}"
        onclick="VMERCADO.marco(${jsTxt(m)})">${m}</button>`).join('')}</div>`;
  }

  const cabGrafica = par => selectorFuente(par) + botonesMarco();

  /* Lo que va DEBAJO de la gráfica, que cambia con la fuente:
     · en referencia, el rótulo — la promesa del contrato escrita al pie, y
       con la hora del dato: una referencia sin hora es media referencia;
     · en los tratos de AUKA, la nota que explica por qué esa gráfica es plana;
     · en los tratos de un token que aún no tiene mercado, dónde nace su
       precio. Esa línea se va sola en cuanto haya velas: entonces el precio ya
       nació y decir dónde nace sobra. */
  function bajoGrafica(par) {
    if (fuenteActual === 'declarado') {
      if (!declCache) return '';
      const v = declCache.vigente;
      const pie = v ? rell(tx('declVig'), { fecha: fechaLarga(v.fecha), acta: v.acta }) : '';
      return `<div class="vm-rotulo">
        <b>${esc(tx('declBadge'))}</b><span>${esc(tx('declRot'))}</span>
        ${pie ? `<small>${esc(pie)}</small>` : ''}</div>`;
    }
    if (fuenteActual === 'referencia') {
      if (!refCache) return '';
      const cuando = Number(refCache.actualizadoEn);
      const pie = [
        refCache.fuente || '',
        Number.isFinite(cuando) && cuando > 0 ? rell(tx('refCuando'), { hora: hora(cuando) }) : '',
      ].filter(Boolean).join(' · ');
      return `<div class="vm-rotulo">
        <b>${esc(tx('refBadge'))}</b><span>${esc(rotuloRef())}</span>
        ${pie ? `<small>${esc(pie)}</small>` : ''}</div>`;
    }
    if (CADENA.baseDe(par) === 'AUKA') {
      return `<div class="vm-prod"><b>${esc(tx('aukaT'))}</b>${esc(tx('aukaP'))}</div>`;
    }
    if (!hayRef(par) && Array.isArray(velasCache) && velasCache.length === 0) {
      return `<div class="vm-prod">${esc(tx('sectorP'))}</div>`;
    }
    return '';
  }

  function pintarBajo() {
    const el = $('vm-bajo');
    if (el) el.innerHTML = bajoGrafica(parActual);
  }

  // Repinta la cabecera entera y lo de abajo: es lo que hace un cambio de
  // fuente, que se lleva por delante el juego de marcos y el rótulo.
  function pintarCabGrafica() {
    const caja = $('vm-cabgraf');
    if (caja) caja.innerHTML = cabGrafica(parActual);
    pintarBajo();
    pintarVelas();
  }

  // ── los mandos ────────────────────────────────────────────────────────────

  function fuente(f) {
    if (f !== 'tratos' && f !== 'referencia' && f !== 'declarado') return;
    if (f === 'referencia' && !hayRef(parActual)) return;
    if (f === 'declarado' && !hayDecl(parActual)) return;
    fuenteFirme = true;         // decisión humana: ya nadie la corrige por detrás
    if (f === fuenteActual) return;
    fuenteActual = f;
    notaVelas('');
    pintarCabGrafica();
    relojGrafica();             // otra fuente, otro ritmo — y un tirón inmediato
  }

  function marco(m) {
    if (!marcosDe(fuenteActual).includes(m) || m === marcoDe()) return;
    marcos[fuenteActual] = m;
    document.querySelectorAll('#vm-marcos button').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.marco === m)));
    // Las velas de un marco no dibujan otro — cada fuente tira las suyas.
    if (fuenteActual === 'referencia') refCache = null; else velasCache = null;
    notaVelas('');
    cargarGrafica();
  }

  function notaVelas(txt) {
    const n = $('vm-velas-nota');
    if (n) n.textContent = txt || '';
  }

  // ── traer los datos ───────────────────────────────────────────────────────

  const cargarGrafica = () => (
    fuenteActual === 'declarado' ? cargarDeclarado()
      : fuenteActual === 'referencia' ? cargarReferencia()
        : cargarVelas());

  async function cargarVelas() {
    const par = parActual, marco = marcos.tratos;
    let v;
    try { v = await DATOS.velas(par, marco); } catch {
      if (!velasCache) notaVelas(tx('velasNo'));
      return;
    }
    // Una respuesta que llega tarde es de OTRA pantalla: pintarla rotulada con
    // el marco de ahora sería etiquetar unas velas con un marco que no es suyo.
    if (par !== parActual || marco !== marcos.tratos) return;
    velasCache = Array.isArray(v) ? v : [];
    if (fuenteActual === 'tratos') { pintarVelas(); pintarBajo(); }
  }

  async function cargarReferencia() {
    const par = parActual, marco = marcos.referencia;
    let d;
    try { d = await DATOS.referencia(par, marco); } catch (e) {
      if (e?.codigo === 'SIN_REFERENCIA') { sinReferencia(par); return; }
      if (!refCache) notaVelas(tx('refNo'));
      return;
    }
    if (par !== parActual || marco !== marcos.referencia) return;
    refCache = d && Array.isArray(d.velas) ? d : { velas: [] };
    if (fuenteActual === 'referencia') { pintarVelas(); pintarBajo(); }
  }

  /* El precio declarado no tiene marco ni paginación: se pide entero, porque
     entero es corto —una fila por acta— y porque el sentido de la gráfica es
     ver la secuencia completa de decisiones, no una ventana de ella. */
  async function cargarDeclarado() {
    const par = parActual;
    const token = String(par || '').split('-')[0];
    let d;
    try { d = await DATOS.declarado(token); } catch (e) {
      if (e?.codigo === 'NO_DECLARABLE') { sinDeclarado(par); return; }
      if (!declCache) notaVelas(tx('declNo'));
      return;
    }
    if (par !== parActual) return;
    declCache = d && Array.isArray(d.serie) ? d : { serie: [], vigente: null };
    if (fuenteActual === 'declarado') { pintarVelas(); pintarBajo(); }
  }

  /* Igual que sinReferencia y por el mismo motivo: manda el API. Si dice que
     este instrumento no lleva precio declarado, la pestaña se retira sola. */
  function sinDeclarado(par) {
    if (par !== parActual) return;
    declCache = null;
    declaradoNegado = true;
    if (fuenteActual === 'declarado') { fuenteActual = 'tratos'; fuenteFirme = true; }
    notaVelas('');
    pintarCabGrafica();
    relojGrafica();
  }

  /* El API retiró la referencia de este activo —o nunca la tuvo y la lista
     blanca de aquí se quedó vieja—: manda él. Se olvida la pestaña, la sala
     vuelve a tratos y la gráfica de tratos sigue en pie, que es lo que este
     mercado sí es. Fail-closed: ante la duda se enseña de menos, no de más. */
  function sinReferencia(par) {
    if (par !== parActual) return;
    refCache = null;
    referenciaNegada = true;
    if (fuenteActual !== 'tratos') { fuenteActual = 'tratos'; fuenteFirme = true; }
    notaVelas('');
    pintarCabGrafica();
    relojGrafica();
  }

  // ── pintarla ──────────────────────────────────────────────────────────────

  /* El canvas se dimensiona acá, a píxeles físicos, antes de cada dibujo: un
     canvas sin medidas dibuja borroso en pantallas densas, y VELAS recibe el
     lienzo listo para no repetir esa cuenta en cada módulo que la use.
     Asignar width además BORRA el lienzo, que es justo lo que hace falta
     cuando no hay nada honesto que pintar encima. */
  function medirLienzo(c, dpr) {
    const ancho = c.parentElement ? c.parentElement.clientWidth : 600;
    c.width = Math.max(1, Math.round(ancho * dpr));
    c.height = Math.round(340 * dpr);
  }

  /* Cuántos decimales pide un precio en dólares. Es una decisión de PANTALLA
     sobre números que ya nacieron flotantes en el feed —el dólar del metal no
     es dinero de esta casa y con él no se opera—, así que mirar su magnitud
     con Number no rompe ninguna regla: nadie compra a este número. La onza de
     oro ronda los cuatro mil y con dos decimales sobra; el gramín de ORIGEN
     ronda los dos dólares, y con dos decimales se perdería justo el movimiento
     que la persona vino a ver. */
  function decimalesUSD(velas) {
    const u = velas[velas.length - 1];
    const cierre = Math.abs(Number(Array.isArray(u) ? u[4] : u?.c));
    if (!isFinite(cierre) || cierre === 0) return 4;
    return cierre >= 100 ? 2 : (cierre >= 1 ? 4 : 6);
  }

  /* De QUÉ activo es el cartel del metal: 'AUKA', no 'AUKA-ORIGEN'.
     La distinción no es cosmética. 'AUKA-ORIGEN' es un PAR de esta casa y se
     cotiza en ORIGEN —1710,69, hoy y siempre—; 'AUKA' es la onza y se cotiza
     contra el dólar. La serie de referencia es lo segundo, así que se rotula
     con lo segundo. Manda el `activo` que declara el API; la base del par es
     el respaldo si no viniera. */
  function activoRef() {
    const a = refCache?.activo;
    if (typeof a === 'string' && a) return a;
    return String(parActual || '').split('-')[0];
  }

  // El rótulo de la referencia en el idioma de la sala. El del API (que viene
  // en español) es el respaldo: un activo con referencia nueva no se queda
  // mudo por no tener todavía su texto acá.
  function rotuloRef() {
    const a = refCache?.activo;
    const k = a ? 'ref' + a : '';
    if (k && TXT.es[k]) return tx(k);
    return refCache?.rotulo || tx('refRot');
  }

  function pintarVelas() {
    const c = $('vm-velas');
    if (!c) return;
    if (typeof VELAS === 'undefined') { notaVelas(tx('velasSin')); return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    /* Los mandos del zoom se retiran en «declarado» por lo mismo que los
       marcos: ahí no hay nada que acercar, y un botón que no hace nada miente.
       Va aquí y no en pintarCabGrafica para que también valga en el primer
       pintado, cuando la sala abre directamente en esa pestaña. */
    const cajaZoom = $('vm-zoom');
    if (cajaZoom) cajaZoom.hidden = fuenteActual === 'declarado';

    /* El precio declarado se dibuja con OTRA función, no con `dibujar`. No es
       una decisión de estilo: una vela tiene apertura, máximo, mínimo y cierre,
       y una resolución de la Junta tiene un solo número. Pintarla de vela
       sería inventarle tres precios que nunca existieron. */
    if (fuenteActual === 'declarado') {
      if (!declCache) return;             // aún sin respuesta: ni nota ni dibujo en falso
      notaVelas('');
      medirLienzo(c, dpr);
      try {
        VELAS.escalones(c, declCache.serie, {
          par: String(parActual || '').split('-')[0],   // 'ONDK', no 'ONDK-ORIGEN'
          moneda: declCache.moneda || 'USD',
          dpr,
          idioma: idi(),
        });
      } catch { notaVelas(tx('declNo')); }
      return;
    }

    if (fuenteActual === 'referencia') {
      if (!refCache) return;              // aún sin respuesta: ni nota ni dibujo en falso
      const velas = Array.isArray(refCache.velas) ? refCache.velas : [];
      if (!velas.length) {
        /* Cero velas de referencia NO es «sin tratos»: es el cartel del metal
           que todavía no llegó. La gráfica no sabe decir eso —su vacío habla
           de tratos— así que aquí no se la llama, se limpia el lienzo y lo
           dice esta sala con sus palabras. */
        medirLienzo(c, dpr);
        /* Y se le retira el rótulo accesible, que asignar `width` NO borra:
           el lienzo queda en blanco pero el aria-label del dibujo anterior
           seguiría prometiendo «180 velas · último 4.424 USD» a quien no
           puede ver que ahí ya no hay nada. Un lienzo vacío que se anuncia
           lleno es la misma mentira de siempre, escrita para quien no puede
           verla — y esa es justo la que hay que perseguir más. */
        c.setAttribute('aria-label', `${activoRef()} · ${tx('refVacia')}`);
        notaVelas(tx('refVacia'));
        return;
      }
      notaVelas('');
      medirLienzo(c, dpr);
      try {
        VELAS.dibujar(c, velas, {
          unidad: 'USD',                  // el dólar ya implica referencia; el badge va igual
          decimales: decimalesUSD(velas),
          /* El ACTIVO, no el par. Esta gráfica es la onza de oro en DÓLARES;
             el par 'AUKA-ORIGEN' se cotiza en ORIGEN y vale 1710,69 clavado.
             Rotular esta serie «AUKA-ORIGEN · 4.424 USD» diría dos cosas
             falsas de un tirón: que ese par vale eso, y que vale en dólares.
             El API ya manda el activo suelto justamente para esto. */
          par: activoRef(),
          marco: marcoDe(),
          rotulo: rotuloRef(),
          referencia: true,               // TODA la gráfica es referencia, no una línea suelta
          emas: [9, 21, 55],
          ventana: gestosGrafica && gestosGrafica.ventana(),
          dpr,
          idioma: idi(),
        });
      } catch { notaVelas(tx('refNo')); }
      return;
    }

    if (!velasCache) return;
    /* El lienzo vacío de tratos lo escribe la propia gráfica —«sin tratos
       todavía», con su rejilla, sus ejes y su marco— y por eso aquí no se
       repite: dos veces el mismo mensaje, uno encima del otro, no es el doble
       de honesto. Esta nota queda para lo que la gráfica no puede saber: que
       la respuesta no llegó. */
    notaVelas('');
    medirLienzo(c, dpr);
    const m = (mercadosCache || []).find(x => x.mercado === parActual);
    try {
      VELAS.dibujar(c, velasCache, {
        unidad: 'ORIGEN',
        decimales: 4,                     // los mismos 4 del libro, la tira y la cabecera
        par: parActual,
        marco: marcoDe(),
        emas: [9, 21, 55],
        ventana: gestosGrafica && gestosGrafica.ventana(),
        /* Esto es una LÍNEA de referencia sobre los tratos, no la gráfica
           entera: por eso va un valor —string de wei de ORIGEN— y no `true`.
           Pasar aquí el objeto crudo del API haría que VELAS marcase de
           REFERENCIA una gráfica de tratos reales: la misma mentira del
           revés, y tan mentira como la otra. */
        referencia: refEnOrigen(m),
        rotulo: tx('refRot'),
        dpr,
        idioma: idi(),
      });
    } catch { notaVelas(tx('velasNo')); }
  }

  // ── el libro ──────────────────────────────────────────────────────────────

  async function cargarLibro() {
    try {
      libroCache = await DATOS.libro(parActual);
    } catch {
      if (!libroCache) {
        const n = $('vm-libro-nota');
        if (n) { n.textContent = tx('libroNo'); n.classList.remove('oculto'); }
      }
      return;
    }
    pintarLibro();
  }

  function pintarLibro() {
    const cajaV = $('vm-ventas'), cajaC = $('vm-compras'), n = $('vm-libro-nota');
    if (!cajaV || !cajaC) return;
    const compras = Array.isArray(libroCache?.compras) ? libroCache.compras : [];
    const ventas = Array.isArray(libroCache?.ventas) ? libroCache.ventas : [];

    /* La barra de cada precio es la profundidad ACUMULADA desde el mejor
       precio hacia afuera, relativa al total de su lado: lo que la vista
       responde es «¿cuánto hay que tragar para llegar hasta acá?». Todo en
       BigInt; el porcentaje final sí es un Number porque es un ancho, no un
       monto. */
    function filas(lado, filasLibro) {
      const acum = [];
      let suma = 0n;
      for (const f of filasLibro) {
        const c = entero(f?.[1]);
        suma += c == null || c < 0n ? 0n : c;
        acum.push(suma);
      }
      const total = suma > 0n ? suma : 1n;
      return filasLibro.map((f, i) => {
        const prof = (Number((acum[i] * 1000n) / total) / 10).toFixed(1);
        return `<button class="vm-fila ${lado}" style="--prof:${prof}%"
          onclick="VMERCADO.usarPrecio(${jsTxt(f?.[0])})">
          <span class="vm-p mono">${esc(deWei(f?.[0], 4) ?? '—')}</span>
          <span class="mono">${esc(deWei(f?.[1], 4) ?? '—')}</span></button>`;
      });
    }

    // Ventas coral ARRIBA con la mejor pegada al centro: el API las manda
    // mejor-primero, así que se invierte el orden de pintado, no el de cálculo.
    cajaV.innerHTML = filas('venta', ventas).reverse().join('');
    cajaC.innerHTML = filas('compra', compras).join('');
    if (n) {
      const vacio = !compras.length && !ventas.length;
      n.textContent = vacio ? tx('sinLibro') : '';
      n.classList.toggle('oculto', !vacio);
    }
  }

  // Tocar un precio del libro lo lleva al formulario. Poner un precio ES
  // pedir una orden límite: si estaba en «mercado», se cambia — una orden de
  // mercado con precio no existe en esta casa.
  function usarPrecio(precioWei) {
    if (entero(precioWei) == null) return;
    if (tipoActual !== 'limite') { tipoActual = 'limite'; aplicarLadoTipo(); }
    const inp = $('vm-precio');
    if (inp) { inp.value = texto(precioWei); recalcular(); }
  }

  // ── los tratos ────────────────────────────────────────────────────────────

  let tratosCache = null;
  async function cargarTratos() {
    const caja = $('vm-tratos');
    if (!caja) return;
    try { tratosCache = await DATOS.tratos(parActual); } catch {
      if (!tratosCache) caja.innerHTML = `<div class="vm-vacio">${esc(tx('tratosNo'))}</div>`;
      return;
    }
    if (!Array.isArray(tratosCache) || !tratosCache.length) {
      caja.innerHTML = `<div class="vm-vacio">${esc(tx('sinTratos'))}</div>`;
      return;
    }
    caja.innerHTML = tratosCache.map(tr => `
      <div class="vm-trato ${tr.lado === 'venta' ? 'venta' : 'compra'}">
        <span class="mono">${esc(deWei(tr.precio, 4) ?? '—')}</span>
        <span class="mono">${esc(deWei(tr.cantidad, 4) ?? '—')}</span>
        <span class="mono">${esc(hora(tr.en))}</span>
      </div>`).join('');
  }

  // ── el formulario ─────────────────────────────────────────────────────────

  function cajaOperar(sim) {
    if (!DATOS.haySesion()) {
      // Sin sesión no se esconde el formulario: se explica y se invita. El
      // viaje del SSO lo maneja ONX.entrar(), el mismo botón de la portada.
      return `<div class="vacio"><b>${esc(tx('invitarT'))}</b>${esc(tx('invitarP'))}</div>
        <button class="btn btn-oro btn-full" onclick="ONX.entrar()">${esc(tx('invitarBtn'))}</button>`;
    }
    return `
    <h3>${esc(tx('operar'))}</h3>
    <div class="vm-seg lados" role="group">
      <button class="es-compra" data-lado="compra" aria-pressed="${String(ladoActual === 'compra')}"
        onclick="VMERCADO.lado('compra')">${esc(tx('comprar'))}</button>
      <button class="es-venta" data-lado="venta" aria-pressed="${String(ladoActual === 'venta')}"
        onclick="VMERCADO.lado('venta')">${esc(tx('vender'))}</button>
    </div>
    <div class="vm-seg" role="group">
      <button data-tipo="limite" aria-pressed="${String(tipoActual === 'limite')}"
        onclick="VMERCADO.tipo('limite')">${esc(tx('limite'))}</button>
      <button data-tipo="mercado" aria-pressed="${String(tipoActual === 'mercado')}"
        onclick="VMERCADO.tipo('mercado')">${esc(tx('mercado'))}</button>
    </div>
    <div class="campo" id="vm-campo-precio">
      <label for="vm-precio">${esc(rell(tx('precioLbl'), { sim }))}</label>
      <input id="vm-precio" inputmode="decimal" autocomplete="off" spellcheck="false"
        oninput="VMERCADO.recalcular()">
    </div>
    <div class="campo">
      <label for="vm-cant">${esc(rell(tx('cantLbl'), { sim }))}
        <button class="vm-max" onclick="VMERCADO.maximo()">· ${esc(tx('max'))}</button></label>
      <input id="vm-cant" inputmode="decimal" autocomplete="off" spellcheck="false"
        oninput="VMERCADO.recalcular()">
      <span class="ayuda" id="vm-saldo"></span>
    </div>
    <div class="vm-linea-total"><span id="vm-total-lbl">${esc(tx('total'))}</span>
      <b class="mono" id="vm-total">—</b></div>
    <p class="vm-aviso" id="vm-aviso" aria-live="polite"></p>
    <button class="btn btn-full vm-btn ${ladoActual}" id="vm-enviar"
      onclick="VMERCADO.colocar()">${esc(tx(ladoActual === 'compra' ? 'comprar' : 'vender'))} ${esc(sim)}</button>`;
  }

  function lado(l) {
    if (l !== 'compra' && l !== 'venta') return;
    ladoActual = l;
    aplicarLadoTipo();
  }

  function tipo(t) {
    if (t !== 'limite' && t !== 'mercado') return;
    tipoActual = t;
    aplicarLadoTipo();
  }

  function aplicarLadoTipo() {
    const sim = CADENA.baseDe(parActual) || '';
    document.querySelectorAll('.vm-seg [data-lado]').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.lado === ladoActual)));
    document.querySelectorAll('.vm-seg [data-tipo]').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.tipo === tipoActual)));
    // Una orden de mercado no tiene precio: el campo se va, no se deshabilita
    // — un campo gris que igual hay que mirar es ruido.
    $('vm-campo-precio')?.classList.toggle('oculto', tipoActual === 'mercado');
    const btn = $('vm-enviar');
    if (btn) {
      btn.classList.remove('compra', 'venta');
      btn.classList.add(ladoActual);
      btn.textContent = `${tx(ladoActual === 'compra' ? 'comprar' : 'vender')} ${sim}`;
    }
    pintarSaldo();
    recalcular();
  }

  // El saldo que importa según el lado: comprando se gasta ORIGEN, vendiendo
  // se entrega el activo. Si no se pudo leer, se dice — no se muestra un cero.
  function saldoDe(activo) {
    if (!Array.isArray(cuentas)) return null;
    const c = cuentas.find(x => x.activo === activo);
    return c ? entero(c.disponible) : 0n; // sin cuenta abierta = 0 de verdad, no 0 de consuelo
  }

  function pintarSaldo() {
    const el = $('vm-saldo');
    if (!el || !DATOS.haySesion()) return;
    const sim = CADENA.baseDe(parActual) || '';
    const activo = ladoActual === 'compra' ? 'ORIGEN' : sim;
    const s = saldoDe(activo);
    el.textContent = s == null
      ? tx('dispNo')
      : rell(tx('disp'), { monto: deWei(s.toString(), 4) ?? '0', sim: activo });
  }

  async function cargarCartera() {
    try {
      const d = await DATOS.portafolio();
      cuentas = Array.isArray(d?.cuentas) ? d.cuentas : null;
    } catch (e) {
      cuentas = null;
      if (e?.codigo === 'SESION_VENCIDA') {
        // La sesión murió debajo de la vista: el formulario vuelve a invitar.
        const caja = $('vm-form-caja');
        if (caja) caja.innerHTML = cajaOperar(CADENA.baseDe(parActual) || '');
        ONX.avisar(tx('eSesion'));
        return;
      }
    }
    pintarSaldo();
    recalcular();
  }

  /* El costo de barrer el libro con una orden de mercado, caminando las
     ventas mejor-primero: la misma caminata que hará el motor. Devuelve null
     si el libro no está leído — fail-closed: sin libro no se estima nada. */
  function costoDeMercado(cantidad) {
    const ventas = libroCache?.ventas;
    if (!Array.isArray(ventas)) return null;
    let falta = cantidad, costo = 0n;
    for (const [p, c] of ventas) {
      const pp = entero(p), cc = entero(c);
      if (pp == null || cc == null) return null;
      const toma = cc < falta ? cc : falta;
      costo += notionalDe(toma, pp);
      falta -= toma;
      if (falta === 0n) break;
    }
    return { costo, cubre: falta === 0n };
  }

  // Lo que devolvería vender a mercado contra las compras. Solo informativo:
  // vender no exige estimar — el saldo que se entrega es la propia cantidad.
  function ingresoDeMercado(cantidad) {
    const compras = libroCache?.compras;
    if (!Array.isArray(compras)) return null;
    let falta = cantidad, ingreso = 0n;
    for (const [p, c] of compras) {
      const pp = entero(p), cc = entero(c);
      if (pp == null || cc == null) return null;
      const toma = cc < falta ? cc : falta;
      ingreso += notionalDe(toma, pp);
      falta -= toma;
      if (falta === 0n) break;
    }
    return { ingreso, cubre: falta === 0n };
  }

  /* Lee el formulario y decide. Devuelve { ok:true, orden } o
     { ok:false, msg } — la validación y el armado de la orden son LA MISMA
     función a propósito: no puede salir al servidor nada distinto de lo que
     se validó. */
  function validar() {
    const sim = CADENA.baseDe(parActual);
    const cant = ONX.aWei($('vm-cant')?.value);
    if (cant == null || entero(cant) === 0n) return { ok: false, msg: tx('eCant') };
    const nCant = entero(cant);

    let precio = null, nPrecio = null;
    if (tipoActual === 'limite') {
      precio = ONX.aWei($('vm-precio')?.value);
      if (precio == null || entero(precio) === 0n) return { ok: false, msg: tx('ePrecio') };
      nPrecio = entero(precio);
      // El mínimo de la casa: una orden cuyo total trunca a cero wei no
      // mueve nada y solo ensucia el libro. El servidor tiene la última
      // palabra sobre mínimos mayores.
      if (notionalDe(nCant, nPrecio) === 0n) return { ok: false, msg: tx('eChico') };
    }

    // El saldo, fail-closed: cuentas === null es «no leído», y no leído no
    // coloca. El texto de vm-saldo ya está diciendo por qué.
    if (ladoActual === 'venta') {
      const s = saldoDe(sim);
      if (s == null) return { ok: false, msg: tx('dispNo') };
      if (nCant > s) return { ok: false, msg: rell(tx('eSaldo'), { monto: deWei(s.toString(), 4) ?? '0', sim }) };
    } else {
      const s = saldoDe('ORIGEN');
      if (s == null) return { ok: false, msg: tx('dispNo') };
      if (tipoActual === 'limite') {
        if (notionalDe(nCant, nPrecio) > s) {
          return { ok: false, msg: rell(tx('eSaldo'), { monto: deWei(s.toString(), 4) ?? '0', sim: 'ORIGEN' }) };
        }
      } else {
        // Comprar a mercado cuesta lo que diga el libro al calzar; acá se
        // camina el libro leído como mejor estimación. Sin libro, no sale.
        const est = costoDeMercado(nCant);
        if (est == null) return { ok: false, msg: tx('eLibro') };
        if (est.costo > s) {
          return { ok: false, msg: rell(tx('eSaldo'), { monto: deWei(s.toString(), 4) ?? '0', sim: 'ORIGEN' }) };
        }
      }
    }

    const orden = { mercado: parActual, lado: ladoActual, tipo: tipoActual, cantidad: cant };
    if (tipoActual === 'limite') orden.precio = precio;
    return { ok: true, orden };
  }

  /* El total, en vivo mientras se teclea. Para límite es la cuenta exacta del
     motor; para mercado es una caminata del libro y se rotula «estimado» —
     un estimado sin rótulo es un número inventado. */
  function recalcular() {
    ordenKeyViva = null; // tocar el formulario = otra orden, otra llave
    const totalEl = $('vm-total'), lblEl = $('vm-total-lbl'), aviso = $('vm-aviso');
    if (!totalEl) return;
    if (aviso) { aviso.textContent = ''; aviso.classList.remove('suave'); }

    const cant = entero(ONX.aWei($('vm-cant')?.value));
    let total = null, aprox = false, notaSuave = null;

    if (cant != null && cant > 0n) {
      if (tipoActual === 'limite') {
        const precio = entero(ONX.aWei($('vm-precio')?.value));
        if (precio != null && precio > 0n) total = notionalDe(cant, precio);
      } else {
        aprox = true;
        const est = ladoActual === 'compra' ? costoDeMercado(cant) : ingresoDeMercado(cant);
        if (est) {
          total = ladoActual === 'compra' ? est.costo : est.ingreso;
          if (!est.cubre) notaSuave = tx('noCubre');
        }
      }
    }

    if (lblEl) lblEl.textContent = tx(aprox ? 'totalAprox' : 'total');
    totalEl.textContent = total == null ? '—' : `${aprox ? '≈ ' : ''}${deWei(total.toString(), 6)} ORIGEN`;
    if (notaSuave && aviso) { aviso.textContent = notaSuave; aviso.classList.add('suave'); }
  }

  // «Usar todo»: vendiendo es el disponible del activo; comprando a límite,
  // el disponible de ORIGEN dividido por el precio (truncando — el resto no
  // alcanza para otra unidad de precio). Comprando a mercado no hay máximo
  // honesto sin caminar el libro entero, así que el botón no hace nada raro:
  // simplemente no rellena.
  function maximo() {
    const sim = CADENA.baseDe(parActual);
    const inp = $('vm-cant');
    if (!inp) return;
    if (ladoActual === 'venta') {
      const s = saldoDe(sim);
      if (s == null) return;
      inp.value = texto(s);
    } else if (tipoActual === 'limite') {
      const s = saldoDe('ORIGEN');
      const precio = entero(ONX.aWei($('vm-precio')?.value));
      if (s == null || precio == null || precio === 0n) return;
      inp.value = texto((s * WEI) / precio);
    } else return;
    recalcular();
  }

  async function colocar() {
    if (!DATOS.haySesion()) { ONX.entrar(); return; }
    const aviso = $('vm-aviso'), btn = $('vm-enviar');
    const v = validar();
    if (!v.ok) {
      if (aviso) { aviso.classList.remove('suave'); aviso.textContent = v.msg; }
      return;
    }
    // La llave sobrevive a recalcular() solo dentro de este envío: se toma
    // DESPUÉS de validar para que un reintento de red repita la misma orden.
    if (!ordenKeyViva) ordenKeyViva = llaveNueva();
    v.orden.ordenKey = ordenKeyViva;
    if (btn) btn.disabled = true;
    try {
      await DATOS.colocar(v.orden);
      ordenKeyViva = null;
      const c = $('vm-cant');
      if (c) c.value = '';
      recalcular();
      ONX.avisar(tx('colocada'));
      // Lo que la orden acaba de mover se trae ya, sin esperar al reloj.
      cargarCartera(); cargarLibro(); cargarTratos(); cargarOrdenes();
    } catch (e) {
      /* Un rechazo deliberado del servidor (4xx) es un NO a esta orden: la
         llave se tira, porque reintentar con ella sería insistirle al mismo
         no. Un tropiezo de red o un 5xx puede haber dejado la orden a medio
         llegar: la llave SE QUEDA para que el reintento sea idempotente. */
      if (e?.http && e.http < 500) ordenKeyViva = null;
      if (e?.codigo === 'SESION_VENCIDA') {
        const caja = $('vm-form-caja');
        if (caja) caja.innerHTML = cajaOperar(CADENA.baseDe(parActual) || '');
        ONX.avisar(tx('eSesion'));
      } else if (aviso) {
        aviso.classList.remove('suave');
        aviso.textContent = e?.message || tx('eColocar');
      }
    } finally {
      const b = $('vm-enviar');
      if (b) b.disabled = false;
    }
  }

  // ── mis órdenes ───────────────────────────────────────────────────────────

  let ordenesCache = null;
  async function cargarOrdenes() {
    const cuerpo = $('vm-ordenes'), nota = $('vm-ordenes-nota');
    if (!cuerpo || !DATOS.haySesion()) return;
    try { ordenesCache = await DATOS.misOrdenes(); } catch (e) {
      if (e?.codigo === 'SESION_VENCIDA') return; // cargarCartera ya avisó, o avisará
      if (!ordenesCache && nota) nota.textContent = tx('ordenesNo');
      return;
    }
    // La pestaña de abajo vive del mismo dato: si está abierta, se refresca
    // con este mismo tirón en vez de pedir las órdenes dos veces.
    if (pestanaAbierta === 'mias') pintarMias();
    // Esta pantalla es UN mercado: se enseñan las órdenes de este par. Las
    // demás viven en la actividad del portafolio, cada una en su casa.
    const mias = (Array.isArray(ordenesCache) ? ordenesCache : []).filter(o => o.mercado === parActual);
    const nMias = $('vm-nmias');
    if (nMias) nMias.textContent = mias.length ? String(mias.length) : '';
    if (!mias.length) {
      cuerpo.innerHTML = '';
      if (nota) nota.textContent = tx('sinOrdenes');
      return;
    }
    if (nota) nota.textContent = '';
    cuerpo.innerHTML = mias.map(o => `
      <tr>
        <td style="color:var(--${o.lado === 'venta' ? 'coral' : 'jade'});font-weight:700">
          ${esc(tx(o.lado === 'venta' ? 'vender' : 'comprar'))}</td>
        <td>${esc(tx(o.tipo === 'mercado' ? 'mercado' : 'limite'))}</td>
        <td class="mono">${o.precio == null ? '—' : esc(deWei(o.precio, 4) ?? '—')}</td>
        <td class="mono">${esc(deWei(o.resta, 4) ?? '—')} / ${esc(deWei(o.cantidad, 4) ?? '—')}</td>
        <td><button class="btn btn-linea btn-sm"
          onclick="VMERCADO.quitar(${jsTxt(o.id)}, this)">${esc(tx('cancelar'))}</button></td>
      </tr>`).join('');
  }

  async function quitar(id, btn) {
    if (btn) btn.disabled = true;
    try {
      await DATOS.cancelar(id);
      ONX.avisar(tx('cancelada'));
      // Cancelar libera la reserva: saldo, libro y lista cambian juntos.
      cargarCartera(); cargarLibro(); cargarOrdenes();
    } catch (e) {
      ONX.avisar(e?.codigo === 'SESION_VENCIDA' ? tx('eSesion') : (e?.message || tx('eCancelar')));
      if (btn) btn.disabled = false;
    }
  }

  // ── el ciclo de vida: alPintar arranca los relojes, apagar los para ───────

  /* El reloj de la gráfica, que se cambia entero cada vez que cambia la
     fuente: 30 s para los tratos (el ritmo del contrato) y 60 s para la
     referencia, porque el backend refresca el metal cada quince minutos y
     pedirlo más seguido es tráfico que no trae dato nuevo. DATOS.sondeo
     dispara al montarse, así que esto además es el tirón inmediato al cambiar
     de pestaña. El parador viejo se para Y se saca de la lista: dejarlo ahí
     haría que apagar() corriera paradores muertos por cada cambio de fuente. */
  function relojGrafica() {
    if (pararGrafica) {
      try { pararGrafica(); } catch {}
      paradores = paradores.filter(p => p !== pararGrafica);
    }
    /* Cada fuente, su ritmo. Los tratos cada 30 s porque el libro se mueve; el
       metal cada 60 porque el proveedor se refresca cada 15 minutos; y el
       precio declarado cada 5 porque cambia cuando hay una Junta —o sea, unas
       cuantas veces al año—. Sondearlo como si fuera un mercado sería fingir
       que puede cambiar mientras alguien lo mira. */
    pararGrafica = DATOS.sondeo(cargarGrafica,
      fuenteActual === 'declarado' ? 300000 : fuenteActual === 'referencia' ? 60000 : 30000);
    paradores.push(pararGrafica);
  }

  function alPintar(cual, par) {
    apagar(); // idempotencia barata: nunca dos juegos de relojes a la vez

    if (cual === 'mercados') {
      paradores.push(DATOS.sondeo(pintarMercados, 10000));
      return;
    }
    if (cual !== 'mercado') return;

    const parNuevo = String(par || '');
    if (parNuevo !== parActual) {
      // Otro par = otra sala: nada de lo cacheado del anterior sirve, y un
      // libro ajeno estimando costos sería un número inventado con esmero.
      libroCache = null; tratosCache = null; velasCache = null; refCache = null;
      declCache = null; ordenesCache = null;
    }
    parActual = parNuevo;
    ordenKeyViva = null;
    if (!CADENA.baseDe(parActual)) return; // la vista ya dijo que el par no existe
    // Normalmente ya lo hizo vistaMercado; esto cubre el caso de pintar la sala
    // sin pasar por ella (una prueba, un recorte de la vista) sin decidir dos
    // veces: prepararFuente es idempotente por par.
    prepararFuente(parActual);

    // Los relojes del contrato: libro y tratos cada 5 s, la cabecera con el
    // reloj de mercados (10 s) y la gráfica con el suyo, que va aparte porque
    // cambia de ritmo con la fuente. Todos visible-only vía DATOS.sondeo, y
    // todos disparan una primera vez al arrancar.
    paradores.push(DATOS.sondeo(cargarLibro, 5000));
    paradores.push(DATOS.sondeo(cargarTratos, 5000));
    paradores.push(DATOS.sondeo(cargarCab, 10000));

    /* Los gestos del lienzo: rueda, arrastre, doble clic y teclado. La
       ventana la guarda VELAS.gestos y la leen las dos llamadas a dibujar —
       así el zoom sobrevive a los repintados del reloj, que es justo lo que
       falla en las gráficas que se «resetean solas» cada pocos segundos. */
    const lienzo = document.getElementById('vm-velas');
    if (lienzo && VELAS.gestos) {
      gestosGrafica = VELAS.gestos(lienzo, {
        /* Cero en «declarado» y con eso los gestos quedan mudos solos: la
           gráfica de escalones se enseña entera siempre —son cuatro actas en
           dos años, no hay tramo que buscar— y una rueda que gira sin que
           pase nada es un mando roto. Con total 0, gestos no arma ventana. */
        total: () => (fuenteActual === 'declarado' ? 0
          : fuenteActual === 'referencia'
            ? (refCache && refCache.velas ? refCache.velas.length : 0)
            : (velasCache ? velasCache.length : 0)),
        alCambiar: pintarVelas,
      });
    }
    relojGrafica();
    pintarLista();
    pestana('tratos');

    if (DATOS.haySesion()) {
      cuentas = null;          // fail-closed hasta que el portafolio conteste
      cargarCartera();
      paradores.push(DATOS.sondeo(cargarOrdenes, 10000));
    }

    // La gráfica se redibuja al cambiar el ancho; el listener es de esta
    // vista y muere con ella en apagar().
    alResize = () => pintarVelas();
    addEventListener('resize', alResize);
    aplicarLadoTipo();
  }

  function apagar() {
    paradores.forEach(p => { try { p(); } catch {} });
    paradores = [];
    pararGrafica = null;
    if (gestosGrafica) { try { gestosGrafica.apagar(); } catch {} gestosGrafica = null; }
    if (alResize) { removeEventListener('resize', alResize); alResize = null; }
  }

  /* Los botones del lienzo. Van por aquí y no directo a VELAS para que la
     sala pueda repintar después: los gestos guardan la ventana, el dibujo la
     lee. */
  function zoom(que) {
    if (!gestosGrafica) return;
    if (que === 'mas') gestosGrafica.acercar();
    else if (que === 'menos') gestosGrafica.alejar();
    else gestosGrafica.verTodo();
  }

  return {
    vistaMercados, vistaMercado, alPintar, apagar, zoom, favorito, filtrar, pestana,
    marco, fuente, lado, tipo, usarPrecio, recalcular, maximo, colocar, quitar,
    // Para las pruebas, como _piezas en qr.js: los textos y las cuentas puras.
    _txt: () => TXT,
    _puros: {
      texto, notionalDe, costoDeMercado: c => costoDeMercado(c), validar: () => validar(),
      // Las decisiones de fuente son puras y se prueban sin navegador: qué
      // mercado tiene cartel del metal, con qué pestaña abre y qué marcos le
      // tocan a cada una.
      MARCOS, CON_REFERENCIA, CON_DECLARADO, hayRef, hayDecl, marcosDe, decimalesUSD, refEnOrigen,
      fuenteInicial: p => fuenteInicial(p),
      estado: () => ({ fuente: fuenteActual, firme: fuenteFirme, marcos: { ...marcos } }),
    },
  };
})();
