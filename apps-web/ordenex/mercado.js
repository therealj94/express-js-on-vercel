/* Ordenex · la sala de trading — VMERCADO.
 *
 * Las dos vistas del mercado: la lista de los pares publicados y la pantalla de
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

  /* El puente con la telemetría, con su propio envoltorio en vez de pedírselo
     a ONX: el reportero es opcional y este módulo se carga ANTES que app.js, así
     que depender de ONX para instrumentar ataría el reloj de las métricas al
     orden del HTML. Si telemetria.js no está, o su clave sigue en PENDIENTE,
     aquí no pasa nada. */
  const tele = (que, ...args) => {
    try { window.TELEMETRIA?.[que]?.(...args); } catch {}
  };

  // ── los textos, es/en uno junto al otro ───────────────────────────────────

  const TXT = {
    es: {
      /* La lista. El subtítulo dice la regla de la casa en una línea: acá
         todo se cotiza en ORIGEN, y decirlo evita la pregunta. */
      't': 'Mercados',
      /* {n} lo pone la propia lista al pintarse: son los pares de
         CADENA.PARES, que es la misma tabla que llena las filas de abajo. Acá
         decía «los catorce» y se pintaban cinco — un subtítulo que se puede
         desmentir contando lo que tiene debajo. */
      'sub': 'Los {mercados} mercados de la cadena, cada uno contra ORIGEN.',
      'cMercado': 'Mercado', 'cUltimo': 'Último (ORIGEN)', 'cCambio': '24 h', 'cVol': 'Volumen 24 h',
      'cLibro': 'En el libro', 'pCompra': 'compra', 'pVenta': 'venta', 'libroVacio': 'vacío',
      'cDia': 'El día', 'ordenar': 'Ordenar por', 'oCadena': 'Cadena', 'oNombre': 'Nombre', 'oPrecio': 'Precio', 'oCambio': '24 h', 'oVol': 'Volumen',
      'sinDia': 'sin tratos hoy',
      'libroTit': 'Lo mejor que hay descansando ahora en este libro. Es lo que dice si hay con quién operar: el último es lo que ya se pagó, esto es lo que se ofrece.',
      'ref': 'ref.',
      'cargando': 'Trayendo los mercados…',
      'sinFeed': 'No pudimos traer los mercados. Se reintenta solo; los datos aparecen en cuanto vuelva la conexión.',

      // Un mercado abierto.
      'volver': 'Mercados',
      'ultimo': 'Último',
      'refRot': 'Referencia',
      'parRaro': 'Ese mercado no existe en esta casa.',
      'parRaroP': 'El par pedido no está en la tabla de activos de la cadena. Volvé a la lista y elegí uno de los {mercados}.',

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
      'ls.esRef': 'Precio de referencia, no una operación de esta casa: todavía no hay tratos en este mercado.',
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
      'totalIn': 'Total (ORIGEN)',
      'promedio': 'Precio promedio', 'sobrePunta': '{pct} % sobre la punta', 'bajoPunta': '{pct} % bajo la punta',
      'ps.historial': 'Historial', 'ps.mistratos': 'Mis tratos',
      'ps.sinHist': 'Todavía no hay órdenes cerradas en este mercado.', 'ps.sinMisTratos': 'Todavía no se te calzó nada en este mercado.',
      'est.ejecutada': 'Ejecutada', 'est.cancelada': 'Cancelada', 'est.rechazada': 'Rechazada', 'est.abierta': 'Abierta',
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

      /* ═══ LA PUERTA DEL INSTRUMENTO DECLARADO (hoy, ONDK) ══════════════
         Esta sala decía una cosa y hacía la contraria: debajo de la gráfica,
         «ONDK no cotiza todavía: no hay libro ni contraparte»; cuatrocientos
         píxeles más allá, un botón «Comprar ONDK». Las dos no pueden ser
         verdad, y la que se podía comprobar contra producción era la primera
         — el libro está vacío por los dos lados y no hay un solo trato.

         De las dos salidas honestas se toma la primera: mientras no haya
         contraparte, NO SE OFRECE COMPRAR. Reescribir el descargo para que el
         botón tuviera razón habría sido cambiar la verdad para que encaje con
         la interfaz, y acá se hace al revés.

         El libro sigue a la vista, y eso no es una contradicción: enseñar un
         libro vacío CONFIRMA el descargo. Lo que se retira es el formulario.

         Y sí, esto deja a ONDK sin manera de recibir su primera orden desde
         esta pantalla. Es deliberado: la primera orden de un valor negociable
         no la pone alguien que pasaba por la sala — la abre la casa cuando la
         Junta lo decida. */
      'onT': 'ONDK todavía no tiene mercado',
      'onSinLibro': 'No hay ni una orden descansando en este libro, de ningún lado, así que no hay con quién operar. Ordenex no ofrece comprar ni vender ONDK mientras no haya mercado: el precio que ves arriba lo fijó la Junta por resolución, no una operación entre dos personas.',
      // La puerta de idoneidad, igual que la del circuito fiat: identidad
      // verificada en Genesis. Un valor negociable no se le vende a un
      // desconocido, y hasta hoy acá no se pedía absolutamente nada.
      'onVerifT': 'Para operar ONDK hace falta identidad verificada',
      'onVerifP': 'ONDK es un valor negociable bajo Próspera, no una cripto más de la lista. Igual que el circuito de efectivo, operarlo exige la identidad verificada en Genesis ID. Verificate desde tu Veta Wallet y volvé.',
      // El descargo que hay que aceptar A PROPÓSITO. Dice lo mismo que la
      // ficha del activo, que es la fuente; si un día cambia allá, cambia acá.
      'onDescT': 'Antes de operar ONDK',
      'onDescP': 'ONDK es el security token de Orden Global: un valor negociable bajo Próspera, respaldado por los activos del grupo. Da derechos económicos por contrato; no es una acción y no da voto. Su precio lo declara la Junta Directiva por resolución y puede no haber nadie del otro lado cuando quieras salir: un instrumento sin libro no se vende cuando uno quiere, sino cuando aparece quien compre.',
      'onDescCheck': 'Leí lo de arriba, entiendo que ONDK es un valor negociable y que puedo no poder venderlo cuando quiera.',
      'onDescBtn': 'Entiendo y quiero operar ONDK',

      // Sin sesión el formulario invita, no esconde: todo lo público se ve.
      'invitarT': 'Para operar, entrá con tu cuenta',
      'invitarP': 'Todo lo que estás viendo es público — el libro, las velas, los tratos. Para colocar una orden entrá con tu cuenta Veta Wallet: Ordenex no guarda contraseñas.',
      'invitarBtn': 'Entrar con mi cuenta Veta Wallet',

      /* LA COMISIÓN, DICHA ANTES DE COBRARLA.
         El motor cobra partes por millón sobre lo que cada parte recibe, y
         hasta hoy esa cifra no aparecía en NINGUNA pantalla de la casa: se
         descubría en el saldo. Es la única línea de toda la web donde la casa
         cobraba algo que el cliente no había visto, y por eso va acá arriba
         del botón y no en un «acerca de».
         «Recibís» es el número que de verdad importa: el total es lo que se
         mueve y esto es lo que queda. */
      'comision': 'Comisión',
      'recibis': 'Recibís',
      // Sin tarifa no se inventa un cero: un cero de consuelo diría «no te
      // cobran» justo donde sí cobran.
      'comisionNo': 'No pudimos traer la comisión de la casa. El total de arriba no la incluye.',

      // Mis órdenes.
      'misOrdenes': 'Mis órdenes abiertas',
      'sinOrdenes': 'No tenés órdenes abiertas en este mercado.',
      'ordenesNo': 'No pudimos traer tus órdenes. Se reintenta solo.',
      'lado': 'Lado', 'tipo': 'Tipo', 'resta': 'Resta', 'cancelar': 'Cancelar',

      /* ═══ UN SOLO PRECIO POR PAR, CON SU FUENTE Y SU HORA ══════════════
         La cabecera enseñaba «Último —» y al lado «Referencia: $4.374», dos
         números de dos unidades distintas para la misma pregunta. Ahora hay
         UN precio en ORIGEN —el último trato si lo hubo, y si no la
         referencia del oro convertida— y debajo, en una línea, de dónde sale
         y de cuándo es. Un precio sin fuente ni hora es un número suelto. */
      'fuenteTrato': 'Último trato de esta casa · {hora}',
      'fuenteRef': 'Referencia: {rotulo} ÷ gramín · fuente {fuente} · leída {hora}',
      'fuenteNada': 'Sin precio: todavía no hubo tratos y no hay referencia.',
      'refDetalle': '{rotulo} = ${usd} · 1 ORIGEN = ${gramin}',
      'leida': 'leída {hora}',

      /* ═══ LA CONFIRMACIÓN ══════════════════════════════════════════════
         Lo que habría parado la orden de 4365,3 AUKA tecleada en dólares: antes
         de mandar nada, la casa te enseña qué das, qué recibís, a qué precio,
         cuál es la referencia del oro y cuánto te alejás de ella. Si te alejás
         más del aviso, lo dice en rojo y te hace marcar una casilla; más del
         bloqueo, no deja seguir. El servidor repite la cuenta: esto es el
         cartel, la puerta es el API. */
      'cf.t': 'Confirmá tu orden',
      'cf.das': 'Das',
      'cf.recibis': 'Recibís',
      'cf.precio': 'Precio',
      'cf.precioMercado': 'a mercado · estimado con el libro de ahora',
      'cf.refOro': 'Referencia del oro',
      'cf.refPar': 'Referencia de {sim} en ORIGEN',
      'cf.desvio': 'Diferencia contra la referencia',
      'cf.desvioOk': 'dentro del margen normal (hasta {x} %)',
      'cf.desvioAviso': 'Tu precio se aleja más del {x} % de la referencia del oro. Revisá la unidad: el precio va en ORIGEN por {sim}, no en dólares. Si es lo que querés, marcá la casilla.',
      'cf.desvioBloqueo': 'Tu precio se aleja más del {y} % de la referencia del oro y la casa no acepta esta orden. Revisá el precio: va en ORIGEN por {sim}, no en dólares.',
      'cf.desvioCheck': 'Vi la diferencia contra la referencia y quiero colocar la orden igual.',
      'cf.sinRef': 'Ahora mismo no tenemos la referencia del oro. Sin referencia la casa no acepta órdenes límite en este mercado: probá en unos minutos.',
      'cf.sinRefLibre': 'Este mercado no tiene referencia: el precio nace en el libro.',
      'cf.comision': 'Comisión de la casa',
      'cf.terminosCheck': 'Leí y acepto los {terminos} y el {riesgo}.',
      'cf.terminosLink': 'términos y condiciones',
      'cf.riesgoLink': 'aviso de riesgo',
      'cf.limitesNo': 'No pudimos traer los umbrales de la casa; el servidor igual los aplica.',
      'cf.confirmar': 'Confirmar y colocar',
      'cf.volver': 'Volver',
      'cf.enviando': 'Colocando…',
      'cf.aprox': 'estimado',

      // Lo que contesta el API cuando la guarda o los términos frenan.
      'ePrecioDesviado': 'La casa no aceptó el precio: se aleja demasiado de la referencia del oro. Revisá la unidad (ORIGEN por unidad, no dólares).',
      'eDesvioSinAceptar': 'El precio se aleja de la referencia y hay que confirmarlo: volvé a colocar la orden y marcá la casilla.',
      'eTerminos': 'Antes de operar hay que aceptar los términos y condiciones y el aviso de riesgo.',
      'eSinRefAhora': 'Ahora mismo no tenemos la referencia del oro y sin ella no se coloca una orden límite. Probá en unos minutos.',
    },
    en: {
      't': 'Markets',
      'sub': 'The {mercados} markets of the chain, each against ORIGEN.',
      'cMercado': 'Market', 'cUltimo': 'Last (ORIGEN)', 'cCambio': '24 h', 'cVol': '24 h volume',
      'cLibro': 'On the book', 'pCompra': 'bid', 'pVenta': 'ask', 'libroVacio': 'empty',
      'cDia': 'Today', 'ordenar': 'Sort by', 'oCadena': 'Chain', 'oNombre': 'Name', 'oPrecio': 'Price', 'oCambio': '24 h', 'oVol': 'Volume',
      'sinDia': 'no trades today',
      'libroTit': 'The best resting orders on this book right now. This is what tells you whether there is anyone to trade with: last is what was already paid, this is what is on offer.',
      'ref': 'ref.',
      'cargando': 'Fetching the markets…',
      'sinFeed': 'We couldn’t fetch the markets. It retries on its own; data appears as soon as the connection is back.',

      'volver': 'Markets',
      'ultimo': 'Last',
      'refRot': 'Reference',
      'parRaro': 'That market does not exist in this house.',
      'parRaroP': 'The requested pair is not in the chain’s asset table. Go back to the list and pick one of the {mercados}.',

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
      'ls.esRef': 'Reference price, not a trade of this house: there are no trades in this market yet.',
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
      /* «Acta» es la resolución escrita de una Junta Directiva, no un minuto
         de reloj: `minute` deja la ficha de un valor negociable diciendo que
         cada vela dura sesenta segundos y que «entre dos minutos no hubo
         operaciones». Lo que lee un inversor de habla inglesa tiene que decir
         lo mismo que lee uno de habla hispana. */
      'declRot': 'Price set by resolution of the Board of Directors. ONDK does not trade yet: there is no book and no counterparty, so this number is not a market price. Every candle in the chart is one board resolution: it opens at the previous resolution’s price and closes at that one’s, with no wick, because between two resolutions there was not a single trade.',
      'declNo': 'We couldn’t fetch the declared price. It retries on its own.',
      'declVacio': 'The Board has not declared a price for this instrument yet.',
      'declVig': 'in force since {fecha} · board resolution {acta}',

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
      'totalIn': 'Total (ORIGEN)',
      'promedio': 'Average price', 'sobrePunta': '{pct} % above the top', 'bajoPunta': '{pct} % below the top',
      'ps.historial': 'History', 'ps.mistratos': 'My trades',
      'ps.sinHist': 'No closed orders in this market yet.', 'ps.sinMisTratos': 'Nothing has filled for you in this market yet.',
      'est.ejecutada': 'Filled', 'est.cancelada': 'Cancelled', 'est.rechazada': 'Rejected', 'est.abierta': 'Open',
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

      'onT': 'ONDK has no market yet',
      'onSinLibro': 'There is not a single order resting in this book, on either side, so there is no one to trade with. Ordenex does not offer to buy or sell ONDK while there is no market: the price above was set by the Board by resolution, not by a trade between two people.',
      'onVerifT': 'Trading ONDK requires a verified identity',
      'onVerifP': 'ONDK is a security under Próspera, not one more coin on the list. Like the cash circuit, trading it requires a verified identity in Genesis ID. Get verified from your Veta Wallet and come back.',
      'onDescT': 'Before you trade ONDK',
      'onDescP': 'ONDK is the Orden Global security token: a security under Próspera, backed by the group’s assets. It grants contractual economic rights; it is not a share and carries no vote. Its price is declared by the Board of Directors by resolution, and there may be no one on the other side when you want out: an instrument with no book is not sold when you want, but when a buyer shows up.',
      'onDescCheck': 'I have read the above and understand that ONDK is a security and that I may not be able to sell it when I want to.',
      'onDescBtn': 'I understand and want to trade ONDK',

      'invitarT': 'To trade, sign in with your account',
      'invitarP': 'Everything you are looking at is public — the book, the candles, the trades. To place an order sign in with your Veta Wallet account: Ordenex stores no passwords.',
      'invitarBtn': 'Sign in with my Veta Wallet account',

      'comision': 'Fee',
      'recibis': 'You receive',
      'comisionNo': 'We couldn’t fetch the house fee. The total above does not include it.',

      'misOrdenes': 'My open orders',
      'sinOrdenes': 'You have no open orders in this market.',
      'ordenesNo': 'We couldn’t fetch your orders. It retries on its own.',
      'lado': 'Side', 'tipo': 'Type', 'resta': 'Left', 'cancelar': 'Cancel',

      'fuenteTrato': 'Last trade of this house · {hora}',
      'fuenteRef': 'Reference: {rotulo} ÷ gramin · source {fuente} · read at {hora}',
      'fuenteNada': 'No price: no trades yet and no reference.',
      'refDetalle': '{rotulo} = ${usd} · 1 ORIGEN = ${gramin}',
      'leida': 'read at {hora}',

      'cf.t': 'Confirm your order',
      'cf.das': 'You give',
      'cf.recibis': 'You receive',
      'cf.precio': 'Price',
      'cf.precioMercado': 'at market · estimated with the current book',
      'cf.refOro': 'Gold reference',
      'cf.refPar': '{sim} reference in ORIGEN',
      'cf.desvio': 'Difference against the reference',
      'cf.desvioOk': 'within the normal margin (up to {x} %)',
      'cf.desvioAviso': 'Your price is more than {x} % away from the gold reference. Check the unit: the price is in ORIGEN per {sim}, not in dollars. If that is what you want, tick the box.',
      'cf.desvioBloqueo': 'Your price is more than {y} % away from the gold reference and the house does not accept this order. Check the price: it is in ORIGEN per {sim}, not in dollars.',
      'cf.desvioCheck': 'I saw the difference against the reference and I want to place the order anyway.',
      'cf.sinRef': 'We have no gold reference right now. Without a reference the house does not accept limit orders in this market: try again in a few minutes.',
      'cf.sinRefLibre': 'This market has no reference: the price is born in the book.',
      'cf.comision': 'House fee',
      'cf.terminosCheck': 'I have read and accept the {terminos} and the {riesgo}.',
      'cf.terminosLink': 'terms and conditions',
      'cf.riesgoLink': 'risk notice',
      'cf.limitesNo': 'We couldn’t fetch the house thresholds; the server applies them anyway.',
      'cf.confirmar': 'Confirm and place',
      'cf.volver': 'Back',
      'cf.enviando': 'Placing…',
      'cf.aprox': 'estimated',

      'ePrecioDesviado': 'The house rejected the price: it is too far from the gold reference. Check the unit (ORIGEN per unit, not dollars).',
      'eDesvioSinAceptar': 'The price is away from the reference and must be confirmed: place the order again and tick the box.',
      'eTerminos': 'Before trading you must accept the terms and conditions and the risk notice.',
      'eSinRefAhora': 'We have no gold reference right now and without it a limit order is not placed. Try again in a few minutes.',
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
  /* Igual que el t() del cascarón, y con el mismo relleno de {mercados}: la
     cifra de cuántos mercados abre la casa se dice en UN solo sitio (i18n.js,
     contando CADENA.PARES) y ningún módulo la escribe a mano. Si i18n.js no
     estuviera, el texto sale con el hueco puesto en vez de romperse. */
  const tx = k => {
    const s = (TXT[idi()] || TXT.es)[k] ?? TXT.es[k] ?? k;
    try { return typeof conMercados === 'function' ? conMercados(s) : s; } catch { return s; }
  };
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
  /* La tarifa de la casa, { comisionPpm, sobre }. null = todavía no se leyó, y
     mientras sea null el formulario dice «—» y no un cero: fail-closed también
     para lo que se cobra. Es de la CASA, no del par, así que sobrevive a
     cambiar de mercado — se pide una vez por sesión de pantalla. */
  let tarifaCache = null;
  /* Los pares cuyo descargo se aceptó EN ESTA CARGA de la página. En memoria y
     no en localStorage: ver puertaDeclarado(). */
  const idoneidadAceptada = new Set();
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
    /* Las dos puntas, una debajo de la otra y con el color de su lado: la
       venta arriba y la compra abajo, igual que en el libro del mercado. */
    .ms-puntas{display:flex;flex-direction:column;gap:2px;font-size:11.5px;line-height:1.35}
    .ms-puntas .lado{color:var(--humo);white-space:nowrap}
    .ms-puntas .lado b{font-weight:600}
    .ms-puntas .venta b{color:var(--coral)} .ms-puntas .compra b{color:var(--jade)}
    .ms-caja{padding:0;overflow:hidden}
    .ms-herr{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;
      padding:10px 14px;border-bottom:1px solid var(--linea2)}
    .ms-herr .vm-buscar{flex:1 1 200px;border-bottom:0;padding:6px 8px;border:1px solid var(--linea2);border-radius:100px}
    .ms-ord{display:flex;gap:4px;align-items:center}
    .ms-ord button{padding:6px 11px;border-radius:100px;font-size:11.5px;font-weight:600;color:var(--humo);
      border:1px solid transparent;transition:.15s}
    .ms-ord button:hover{color:var(--bruma)}
    .ms-ord button[aria-pressed=true]{color:var(--oroHi);background:rgba(201,169,97,.14);border-color:var(--linea2)}
    .ms-cab,.ms-fila{display:grid;grid-template-columns:30px minmax(0,1.6fr) 120px minmax(0,1.1fr) 84px minmax(0,1.1fr) minmax(0,1fr);
      gap:10px;align-items:center;padding:0 16px}
    .ms-cab{padding-top:10px;padding-bottom:8px;font-size:10.5px;font-weight:700;letter-spacing:.08em;
      text-transform:uppercase;color:var(--humo);border-bottom:1px solid var(--linea2)}
    .ms-cab span:nth-child(n+4),.ms-fila>.ms-ult,.ms-fila>.ms-cambio,.ms-fila>.ms-libro,.ms-fila>.ms-vol{text-align:right}
    .ms-fila{cursor:pointer;transition:background .15s;padding-top:11px;padding-bottom:11px;
      border-bottom:1px solid rgba(255,255,255,.05)}
    .ms-fila:last-child{border-bottom:0}
    .ms-fila:hover{background:rgba(116,230,200,.05)}
    .ms-fila:focus-visible{outline:2px solid var(--oro);outline-offset:-2px}
    .ms-fila .vm-fav{padding:0;font-size:15px;color:var(--humo)}
    .ms-fila .vm-fav[aria-pressed=true]{color:var(--oro)}
    .ms-ult{font-size:14.5px;color:var(--crema);font-variant-numeric:tabular-nums}
    .ms-cambio{display:flex;justify-content:flex-end}
    .ms-libro{display:flex;justify-content:flex-end}
    .ms-vol{font-size:13px;color:var(--bruma)}
    .ms-chispa{width:100%;height:28px;display:block;fill:none;stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round}
    .ms-chispa.sube{stroke:var(--jade)} .ms-chispa.baja{stroke:var(--coral)}
    .ms-sin{font-size:10.5px;color:var(--humo)}
    @media (max-width:900px){
      .ms-cab,.ms-fila{grid-template-columns:26px minmax(0,1.5fr) 72px minmax(0,1fr) 72px;gap:8px;padding:0 12px}
      .ms-cab span:nth-child(n+6),.ms-fila>.ms-libro,.ms-fila>.ms-vol{display:none}
      .ms-fila{padding-top:10px;padding-bottom:10px}
      .ms-par b{font-size:13.5px} .ms-ult{font-size:13px}
      .ms-par{gap:8px} .ms-par .vm-ic{width:28px;height:28px;border-radius:9px}
      .ms-par small,.ms-nom{display:none}
      .ms-ref{white-space:nowrap}
    }
    @media (max-width:420px){
      .ms-cab,.ms-fila{grid-template-columns:22px minmax(0,1.2fr) 64px minmax(0,1fr) 64px;gap:6px;padding:0 10px}
      .ms-cab{font-size:9.5px}
    }
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
    /* El hueco entre renglones NO es cero, y no es cosmética: en un escritorio
       la barra entra en una sola fila y el hueco vertical no se usa nunca, pero
       en un teléfono se parte en tres. Con un hueco de cero, la etiqueta
       de un renglón nacía pegada a los números del de arriba: «SE PAGA EN»
       salía colgando de «987,654,321.5» como si fuera su decimal. Con cifras
       cortas casi no se veía; con un volumen de nueve dígitos los tres
       renglones se leen como un solo bloque de números. */
    .vm-stats{display:flex;flex-wrap:wrap;align-items:center;gap:12px 26px;
      padding:12px 0 0;margin-top:12px;border-top:1px solid var(--linea2)}
    /* El bloque de las cuatro cifras es una fila dentro de la fila: asi
       pintarStats sigue escribiendo en UN solo nodo y no en cuatro sueltos.
       (Y sin comillas invertidas en este comentario: la hoja entera vive
       dentro de una plantilla de JS y una comilla invertida la parte.) */
    #vm-stats{display:flex;flex-wrap:wrap;align-items:center;gap:12px 26px}
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
    @media (max-width:640px){.vm-stats,#vm-stats{gap:10px 16px}.vm-stat{min-width:64px}}

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
    /* minmax(0,1fr) y no 1fr, que es lo mismo que ya usan las dos reglas de
       arriba. Un 1fr a secas significa minmax(auto,1fr), y ese auto es el
       MÍNIMO DEL CONTENIDO: cualquier cosa ancha de dentro empuja la columna y
       con ella la sala entera. Es exactamente lo que pasaba a 320 px — la tira
       de «Tratos · ORIGEN / Referencia · USD» mide 287, no encoge porque es una
       pastilla, y arrastraba el panel a 329 dentro de una pantalla de 320. Con
       el mínimo en cero la columna manda sobre su contenido y lo ancho se
       arregla dentro, en su propio riel. */
    @media (max-width:1100px){.vm-rejilla{grid-template-columns:minmax(0,1fr)}}

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
    /* El precio de referencia va en oro y con la marca delante: pintado igual
       que un precio de trato diria «esto se pago» donde solo hay «esto valdria». */
    .vm-it .pr.esRef{color:var(--oro)}
    .ms-esref{color:var(--oro)}
    .ms-esref::before{content:'ref ';font-size:10px;letter-spacing:.06em;color:var(--humo);
      text-transform:uppercase}
    .vm-it .pr.esRef::before{content:'ref ';font-size:9.5px;letter-spacing:.06em;
      color:var(--humo);text-transform:uppercase}
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
    .vm-peskab{display:flex;gap:2px;border-bottom:1px solid var(--linea2);margin-bottom:10px;
      overflow-x:auto;white-space:nowrap;scrollbar-width:none}
    .vm-peskab::-webkit-scrollbar{display:none}
    .vm-peskab button{flex:none}
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
    .vm-hist .est{font-size:11px;color:var(--bruma);text-align:right;display:grid;line-height:1.3}
    .vm-hist .est small{color:var(--humo);font-family:var(--mono);font-size:10.5px}
    .vm-hist .est.ejecutada{color:var(--jade)} .vm-hist .est.cancelada{color:var(--humo)} .vm-hist .est.rechazada{color:var(--coral)}
    .vm-pct{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:-6px 0 14px}
    .vm-pct button{padding:6px 0;border-radius:8px;border:1px solid var(--linea2);background:rgba(2,22,23,.45);
      color:var(--bruma);font-family:var(--mono);font-size:11.5px;font-weight:600;cursor:pointer;transition:.15s}
    .vm-pct button:hover{color:var(--crema);border-color:var(--linea)}
    .vm-pct button.es{background:rgba(201,169,97,.16);color:var(--oroLt);border-color:var(--linea)}
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
    /* La tira de apertura/máximo/mínimo/medias que baja del lienzo cuando la
       leyenda de dentro no cabía — la pinta tiraLeyenda(). Envuelve, va en
       cifras tabulares y con la etiqueta chica delante de cada número: son los
       mismos trozos de la leyenda, escritos donde se leen.
       (Sin comillas invertidas acá: esta hoja vive dentro de una plantilla de
       JS y una comilla invertida la parte en dos.) */
    .vm-ohlc{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:10px;
      font-family:var(--mono);font-size:12.5px;font-variant-numeric:lining-nums tabular-nums}
    .vm-ohlc-d{display:inline-flex;align-items:baseline;gap:5px}
    .vm-ohlc-d i{font-style:normal;font-size:10.5px;color:var(--humo)}
    .vm-ohlc-d b{font-weight:500;color:var(--crema)}

    /* En la sala ancha el libro se estira a la par de la gráfica: una columna
       de 318 px contra un lienzo de 1.200 se veía como una nota al margen. */
    /* En la sala a pantalla ancha el libro gana ancho, PERO siguen siendo tres
       columnas. Esta regla se quedo en dos cuando la rejilla paso a tres y
       dejaba la lista ocupando el centro y el libro cayendo a otro renglon:
       una regla vieja que pisa a la nueva y rompe la pantalla entera. */
    body.en-mercado .vm-rejilla{grid-template-columns:248px minmax(0,1fr) 356px}
    @media (max-width:1380px){body.en-mercado .vm-rejilla{grid-template-columns:minmax(0,1fr) 340px}}
    /* Ésta es la regla que de verdad manda en la sala: lleva body.en-mercado
       delante, y una media query no suma especificidad — así que gana sobre la
       de .vm-rejilla a secas por mucho que aquélla esté más abajo. Ojo con eso
       al tocar cualquiera de las dos.
       Y va en minmax(0,1fr) como sus dos hermanas de arriba, y no en 1fr. Un
       1fr a secas es minmax(auto,1fr), y ese auto es el mínimo del
       contenido: la tira de «Tratos · ORIGEN / Referencia · USD» mide 287 px,
       no encoge porque es una pastilla, y empujaba la columna a 329 dentro de
       una pantalla de 320 — la sala entera se salía por 25 px. En 360 entraba
       por poco: por eso nadie lo vio. */
    @media (max-width:1100px){body.en-mercado .vm-rejilla{grid-template-columns:minmax(0,1fr)}}
    /* ═══ LA SALA EN UN TELÉFONO ════════════════════════════════════════════
       Una columna con la gráfica, después el formulario, después las
       veintiocho filas del libro y después los tratos era una página de
       cuatro mil píxeles en la que operar quedaba a mitad de camino. La app
       de cualquier exchange pone el formulario y el libro LADO A LADO —se
       teclea el precio mirando las puntas— y la gráfica arriba. Los dos
       envoltorios de columna se disuelven (display:contents) y las cuatro
       cajas se colocan en una rejilla de dos: gráfica a lo ancho, formulario
       y libro juntos, tratos a lo ancho. El libro enseña ocho niveles por
       lado, que es lo que cabe al lado de un formulario. */
    @media (min-width:401px) and (max-width:820px){
      .vm-rejilla,body.en-mercado .vm-rejilla{grid-template-columns:minmax(0,1fr) minmax(0,.9fr);gap:10px}
      .vm-rejilla>div{display:contents}
      .vm-grafica-caja{grid-column:1/-1;order:1}
      #vm-form-caja{order:2;padding:14px}
      .vm-libro-caja{order:2;padding:12px 8px}
      .vm-tape-caja{grid-column:1/-1;order:3}
      .vm-libro-caja h3{font-size:13px;padding:0 6px}
      .vm-lado .vm-fila:nth-child(n+9){display:none}
      .vm-fila{padding:4px 6px;font-size:11.5px}
      .vm-medio{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .vm-medio small{display:none}
      .vm-pct{grid-template-columns:repeat(2,1fr)}
    }
    @media (max-width:820px){.vm-pct{grid-template-columns:repeat(4,1fr)}}
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
    /* La comisión y lo que queda. En letra más chica que el total porque son
       su desglose, y «Recibís» en crema porque es el número con el que la
       persona se va: el total es lo que se mueve, esto es lo que le queda. */
    .vm-linea-fee{display:flex;justify-content:space-between;align-items:baseline;
      padding:5px 2px 0;font-size:12px;color:var(--humo)}
    .vm-linea-fee .mono{font-variant-numeric:lining-nums tabular-nums}
    .vm-recibis{color:var(--bruma);padding-top:3px}
    .vm-recibis b{font-size:13.5px;color:var(--crema)}

    /* El descargo del instrumento declarado. Con la barra de oro al costado
       —la misma de .vm-prod— porque es una nota de la casa, no una alarma:
       lo que dice es lo que ONDK ES, y decirlo en rojo lo convertiría en un
       error de la pantalla en vez de en una característica del activo. */
    .vm-descargo{margin-top:12px;padding:14px 16px;border-left:2px solid var(--oro);
      background:rgba(201,169,97,.06);border-radius:0 var(--r) var(--r) 0;
      font-size:12.5px;color:var(--bruma);line-height:1.6}
    .vm-descargo b{display:block;color:var(--crema);font-size:13.5px;margin-bottom:6px}
    .vm-descargo p{margin-bottom:12px}
    .vm-descargo-check{display:flex;gap:9px;align-items:flex-start;margin-bottom:12px;
      cursor:pointer;color:var(--crema);font-size:12.5px;line-height:1.5}
    .vm-descargo-check input{flex:none;width:17px;height:17px;margin-top:1px;accent-color:var(--oro)}
    .vm-aviso{min-height:18px;margin:8px 2px 10px;font-size:12.5px;line-height:1.55;color:var(--coral)}
    .vm-aviso.suave{color:var(--humo)}

    /* La línea de fuente del precio único: de dónde sale y de cuándo es. En
       mono y gris porque es un dato de diagnóstico del número de arriba, no
       un segundo número. */
    .vm-fuente{margin-top:6px;font-family:var(--mono);font-size:11px;color:var(--humo);
      letter-spacing:.02em;line-height:1.5}
    .vm-ultimo.ms-esref::before{font-size:11px}

    /* La hoja de la CONFIRMACIÓN (.cf-*) vive en index.html y no acá: el
       velo se cuelga del body, fuera del lienzo, y la casilla de los términos
       la usa también el circuito fiat (ONX.pedirTerminos). Una hoja que solo
       existe mientras la sala está pintada no le sirve a una caja que se abre
       desde otra vista. */
    .vm-max{font-weight:700;color:var(--oroLt);padding:0;font-size:11.5px}
    .vm-max:hover{color:var(--oroHi)}
    /* El botón de operar habla el idioma de la casa: jade compra, coral
       vende. El texto va oscuro como en el btn-oro — sobre color claro. */
    .vm-btn.compra{background:linear-gradient(120deg,#5CE8B4,var(--jade) 60%,#5CE8B4);color:#04291B;
      box-shadow:0 14px 40px -16px rgba(62,217,160,.55)}
    .vm-btn.venta{background:linear-gradient(120deg,#F59A90,var(--coral) 60%,#F59A90);color:#3A0F0A;
      box-shadow:0 14px 40px -16px rgba(240,119,107,.55)}
    .vm-btn:hover{transform:translateY(-2px)}

    /* ═══ LA SALA EN UN TELÉFONO ═══════════════════════════════════════════
       Todo lo de aquí abajo es la misma sala medida con un dedo en vez de con
       un ratón. Va en un solo bloque y al final para que se lea de un tirón
       qué cambia en angosto, en vez de repartir excepciones por todo el
       archivo. El corte son los mismos 900 px que usa el cascarón. */
    @media (max-width:900px){
      /* ── los mandos del zoom, fuera del lienzo ────────────────────────────
         Dos cosas les pasaban a la vez en un teléfono.

         Una: se quedaban al 30 % de opacidad para siempre. Su regla de
         encenderse es el hover, y en una pantalla táctil no hay hover que
         valga — el zoom estaba ahí, funcionando, invisible.

         Dos: flotaban arriba a la derecha del lienzo, y ahí es donde vive la
         leyenda. En 287 px de ancho eso no es un roce: la palabra ORIGEN
         quedaba debajo de un botón. Y subirlos a 40 px de blanco de toque, que
         es lo que hace falta para el dedo, empeoraba el choque en vez de
         arreglarlo.

         Así que en angosto dejan de flotar. El lienzo pasa a columna y los tres
         botones caen debajo, alineados a la derecha, como la barra de
         herramientas que siempre fueron. No tapan ninguna vela, no pisan la
         leyenda y se ven. Costo: 48 px de alto de página, que es exactamente lo
         que vale un mando que se pueda usar. */
      .vm-lienzo{display:flex;flex-direction:column}
      .vm-zoom{position:static;opacity:1;align-self:flex-end;margin-top:8px;gap:8px}
      .vm-zoom button{width:40px;height:40px;font-size:16px}
      /* La nota de «no llegaron las velas» se centra sobre el LIENZO, que es
         de lo que habla, y no sobre el lienzo más la barra de botones. */
      .vm-nota{bottom:48px}

      /* La gráfica deja de ser un retrato. Un alto de clamp(340px,52vh,620px)
         contra 287 px de ancho daba un lienzo MÁS ALTO QUE ANCHO (287×385, o
         sea 0,75), y una vela es una figura ancha: en vertical se estiran los
         cuerpos, se aplasta el eje de tiempo y caben menos velas de las que
         entrarían. Con la proporción fija el lienzo sigue al ancho de la
         pantalla y siempre sale apaisado. El alto mínimo es para que en un
         teléfono muy angosto no se aplaste por debajo de lo legible. */
      .vm-lienzo canvas{height:auto;aspect-ratio:4/3;min-height:240px}

      /* ── el blanco de toque, control por control ──────────────────────────
         Todos estos son mandos de verdad: eligen qué se mira, con qué lupa, de
         qué lado se opera y con cuánto. 40 px de alto es la recomendación y es
         la yema del dedo. Lo que crece es el blanco, no la letra. */
      .vm-volver{min-height:40px;padding:0 0 10px}
      .vm-fuentes button,.vm-marcos button{min-height:40px}
      .vm-seg button{min-height:44px}
      .vm-peskab button{min-height:40px}
      /* «Usar todo» medía 72×14. Es el atajo que pone el saldo entero en la
         orden: fallarlo teclea una cantidad a mano, y las cantidades tecleadas
         a mano en un teléfono es donde se pierde un cero. */
      .vm-max{min-height:40px;padding:0 8px}
      /* Y la equis que cancela una orden abierta: 12 px de aspa. */
      .vm-mia .x{min-width:40px;min-height:40px;font-size:15px}


      /* Las filas del libro. Una fila del libro es un botón —se toca para que
         su precio caiga en el formulario— y medía 26 px de alto. Se sube a 40
         aunque cueste densidad: el libro vive dentro de un panel que se
         desplaza, así que lo que se pierde son niveles a la vista, no niveles;
         y un toque errado en un libro de órdenes no falla, ACIERTA en el
         precio de al lado, que es peor que no hacer nada. */
      .vm-fila{min-height:40px;align-items:center}
    }
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

  /* ── EL PRECIO QUE SE ENSEÑA EN UNA FILA ───────────────────────────────────
     Hasta hoy la lista enseñaba un guion en todos los mercados, porque
     `ultimo` es lo que se pagó en el libro y todavía no se pagó nada. Es
     honesto pero inútil: una columna de guiones no dice a cuánto está el oro.

     Ahora, cuando no hay trato, se enseña la REFERENCIA convertida a ORIGEN —
     que no es un número inventado, es la división de dos precios medidos:

       AUKA/ORIGEN = onza de oro / gramin = 1710,69 SIEMPRE (los dos son oro)
       AGKA/ORIGEN = onza de plata / gramin — este SÍ se mueve, con la razón
                     oro:plata, que es un dato real del mercado
       ONDK/ORIGEN = precio declarado por la Junta / gramin

     Y va MARCADO como referencia: otro color y la palabra delante. Un precio
     de referencia pintado igual que un precio de trato es exactamente la
     mentira que esta casa no dice — la diferencia entre «esto valdría» y
     «esto se pagó». */
  /* LO QUE HAY DESCANSANDO, EN LA LISTA.
     «Último» es lo que se PAGÓ, y en un mercado recién abierto no se pagó
     nada: cinco guiones seguidos parecen cinco mercados muertos aunque en uno
     de ellos haya una orden esperando contraparte. Esa era la pantalla el
     4-sep, con la única orden viva de la casa invisible hasta entrar al par.
     Acá se distinguen los TRES estados, que es todo el asunto:
       · el API no manda las puntas (servidor viejo o motor frío) → «—»
       · las manda en null → «vacío», que es un hecho, no una falla
       · hay algo → el precio, del color de su lado */
  function puntasFila(m) {
    if (!m || (m.mejorCompra === undefined && m.mejorVenta === undefined)) {
      return '<span class="vm-sin">—</span>';
    }
    const c = deWei(m.mejorCompra, 4), v = deWei(m.mejorVenta, 4);
    if (c == null && v == null) return `<span class="vm-sin">${esc(tx('libroVacio'))}</span>`;
    return `<span class="ms-puntas">${
      v == null ? '' : `<span class="lado venta">${esc(tx('pVenta'))} <b class="mono">${esc(v)}</b></span>`}${
      c == null ? '' : `<span class="lado compra">${esc(tx('pCompra'))} <b class="mono">${esc(c)}</b></span>`}</span>`;
  }

  function precioFila(m) {
    const u = deWei(m?.ultimo, 4);
    if (u != null) return { txt: u, ref: false };
    const enOrigen = refEnOrigen(m);
    const r = enOrigen == null ? null : deWei(enOrigen, 4);
    return r == null ? { txt: null, ref: false } : { txt: r, ref: true };
  }

  // ══ LA LISTA DE MERCADOS ══════════════════════════════════════════════════

  function vistaMercados() {
    return `${ESTILO}
    <div class="cab"><div>
      <h2>${esc(tx('t'))}</h2>
      <div class="sub">${esc(tx('sub'))}</div>
    </div></div>
    <div class="vidrio bloque ms-caja">
      <div class="ms-herr">
        <div class="vm-buscar">
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6"/><path d="M13.5 13.5 18 18"/></svg>
          <input id="ms-q" type="search" autocomplete="off" spellcheck="false"
                 placeholder="${esc(tx('ls.buscar'))}" aria-label="${esc(tx('ls.buscar'))}"
                 oninput="VMERCADO.buscarLista(this.value)">
        </div>
        <div class="ms-ord" role="group" aria-label="${esc(tx('ordenar'))}">
          ${[['cadena', 'oCadena'], ['precio', 'oPrecio'], ['cambio', 'oCambio'], ['vol', 'oVol']].map(([k, t]) => `
            <button type="button" data-ord="${k}" aria-pressed="${String(ordenLista.por === k)}"
                    onclick="VMERCADO.ordenarLista('${k}')">${esc(tx(t))}</button>`).join('')}
        </div>
      </div>
      <div class="ms-cab">
        <span></span><span>${esc(tx('cMercado'))}</span><span>${esc(tx('cDia'))}</span>
        <span>${esc(tx('cUltimo'))}</span><span>${esc(tx('cCambio'))}</span>
        <span title="${esc(tx('libroTit'))}">${esc(tx('cLibro'))}</span><span>${esc(tx('cVol'))}</span>
      </div>
      <div id="ms-cuerpo"></div>
      <p class="pie" id="ms-nota">${esc(tx('cargando'))}</p>
    </div>`;
  }

  /* ═══ LA LISTA, COMO LA DE UN EXCHANGE ═══════════════════════════════════
     Cada fila lleva la mini gráfica del día —los cierres de 1 h que manda
     el API en serie24h—, la estrella de favorito, y la lista se busca y se
     ordena. Los favoritos van arriba siempre y viven en el navegador, como
     en la sala. El orden por omisión es el de la cadena: es el único que no
     baila con cada refresco. */
  let filtroLista = '';
  let ordenLista = { por: 'cadena', dir: 1 };

  function buscarLista(q) { filtroLista = String(q || '').trim().toUpperCase(); pintarFilasMercados($('ms-cuerpo'), $('ms-nota')); }
  function ordenarLista(por) {
    if (ordenLista.por === por) ordenLista.dir = -ordenLista.dir; else ordenLista = { por, dir: por === 'cadena' ? 1 : -1 };
    document.querySelectorAll('.ms-ord button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ord === por)));
    pintarFilasMercados($('ms-cuerpo'), $('ms-nota'));
  }

  /* La mini gráfica: una línea de 100 × 28 con los cierres del día,
     normalizada a su propio rango. Jade si cerró por encima de donde abrió,
     coral si por debajo. Sin serie no hay línea: un guion, no una raya plana. */
  function chispa(serie) {
    const v = (Array.isArray(serie) ? serie : []).map(x => entero(x)).filter(x => x != null && x > 0n);
    if (v.length < 2) return `<span class="ms-sin">${esc(tx('sinDia'))}</span>`;
    const min = v.reduce((a, b) => (b < a ? b : a)), max = v.reduce((a, b) => (b > a ? b : a));
    const rango = max - min > 0n ? max - min : 1n;
    const pts = v.map((y, i) => `${(i * 100 / (v.length - 1)).toFixed(1)},${(26 - Number((y - min) * 24n / rango)).toFixed(1)}`).join(' ');
    const sube = v[v.length - 1] >= v[0];
    return `<svg class="ms-chispa ${sube ? 'sube' : 'baja'}" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${pts}"/></svg>`;
  }

  const claveOrden = (m, par) => {
    const num = x => { const n = entero(x); return n == null ? null : n; };
    if (ordenLista.por === 'precio') return num(m?.ultimo) ?? num(refEnOrigen(m)) ?? -1n;
    if (ordenLista.por === 'cambio') return m?.cambio24h == null ? null : Number(m.cambio24h);
    if (ordenLista.por === 'vol') return num(m?.vol24h) ?? -1n;
    return CADENA.PARES.indexOf(par);
  };
  const compara = (a, b) => (a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0);

  /* Se itera CADENA.PARES y no la respuesta del API: la tabla de activos es
     el contrato, y así los mercados están SIEMPRE en pantalla, con guiones
     donde el dato no llegó. Con el backend caído, lo pintado se queda: viejo
     y honesto; sin nada previo, se dice que no llegó. */
  async function pintarMercados() {
    const cuerpo = $('ms-cuerpo'), nota = $('ms-nota');
    if (!cuerpo) return;
    try {
      mercadosCache = await DATOS.mercados();
    } catch {
      pintarFilasMercados(cuerpo, nota, !mercadosCache);
      return;
    }
    pintarFilasMercados(cuerpo, nota);
  }

  function pintarFilasMercados(cuerpo, nota, sinFeed) {
    if (!cuerpo) return;
    const porPar = new Map((mercadosCache || []).map(m => [m.mercado, m]));
    const fav = favoritos();
    const pares = CADENA.PARES
      .filter(p => !filtroLista || String(CADENA.baseDe(p) || p).toUpperCase().includes(filtroLista)
                || String(CADENA.meta(CADENA.baseDe(p)).n || '').toUpperCase().includes(filtroLista))
      .sort((a, b) => ((fav.has(b) ? 1 : 0) - (fav.has(a) ? 1 : 0))
        || ordenLista.dir * compara(claveOrden(porPar.get(a), a), claveOrden(porPar.get(b), b)));
    if (!pares.length) {
      cuerpo.innerHTML = `<div class="vm-vacio">${esc(tx('ls.nada'))}</div>`;
      if (nota) nota.textContent = '';
      return;
    }
    cuerpo.innerHTML = pares.map(par => {
      const sim = CADENA.baseDe(par);
      const m = porPar.get(par) || {};
      const pf = precioFila(m);
      const ref = refUsd(m);
      const vol = deWei(m.vol24h, 2);
      const es = fav.has(par);
      return `
      <div class="ms-fila" onclick="ONX.vista('mercado', ${jsTxt(par)})" role="link" tabindex="0"
           onkeydown="if(event.key==='Enter')ONX.vista('mercado', ${jsTxt(par)})">
        <button class="vm-fav" aria-pressed="${String(es)}" aria-label="${esc(tx(es ? 'ls.quitarFav' : 'ls.ponerFav'))}"
                onclick="event.stopPropagation();VMERCADO.favorito(${jsTxt(par)});VMERCADO.buscarLista(document.getElementById('ms-q')?.value||'')">${es ? '★' : '☆'}</button>
        <span class="ms-par">${icono(sim)}<span><b>${esc(sim)}</b> <small>/ ORIGEN</small>
          <span class="ms-nom">${esc(CADENA.meta(sim).n || '')}</span></span></span>
        <span class="ms-dia">${chispa(m.serie24h)}</span>
        <span class="mono ms-ult">${pf.txt == null ? '<span class="vm-sin">—</span>'
          : `<span class="${pf.ref ? 'ms-esref' : ''}" title="${pf.ref ? esc(tx('ls.esRef') + (m.referencia?.en ? ' · ' + rell(tx('leida'), { hora: hora(m.referencia.en) }) + ' · ' + String(m.referencia.fuente || '') : '')) : ''}">${esc(pf.txt)}</span>`}
          ${ref == null ? '' : `<small class="ms-ref">${esc(tx('ref'))} ${esc(ref)}</small>`}</span>
        <span class="ms-cambio">${pastillaCambio(m.cambio24h)}</span>
        <span class="ms-libro">${puntasFila(m)}</span>
        <span class="mono ms-vol">${vol == null ? '<span class="vm-sin">—</span>' : esc(vol) + ' ' + esc(sim)}</span>
      </div>`;
    }).join('');
    if (nota) nota.textContent = sinFeed ? tx('sinFeed') : '';
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
    <!-- UN SOLO PRECIO POR PAR. El número grande es el último trato si lo
         hubo y, si no, la referencia del oro en ORIGEN (marcada «ref»); la
         línea de abajo dice de dónde sale y de cuándo es. Antes había dos
         números en dos unidades para la misma pregunta. -->
    <div class="vm-stats">
      <div class="vm-stat vm-stat-precio">
        <span class="et" id="vm-ultimo-et">${esc(tx('ultimo'))}</span>
        <span class="vm-ultimo mono" id="vm-ultimo">—</span>
      </div>
      <div class="vm-stat"><span class="et">24 h</span><span id="vm-cambio">—</span></div>
      <div id="vm-stats"></div>
      <div class="vm-refchica" id="vm-ref"></div>
    </div>
    <div class="vm-fuente" id="vm-fuente" aria-live="polite">${esc(tx('fuenteNada'))}</div>
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
        <div class="vidrio bloque vm-grafica-caja">
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
          <!-- Lo que la leyenda del lienzo no pudo sostener. En pantalla ancha
               queda vacío y no ocupa nada; en un teléfono es donde aterrizan
               apertura, máximo, mínimo, las medias y el volumen cuando la
               leyenda de dentro se encogió para no taparle la gráfica a nadie.
               Ver «recortada» en velas.js. -->
          <div class="vm-ohlc" id="vm-ohlc" hidden></div>
          <div id="vm-bajo">${bajoGrafica(par)}</div>
        </div>
        <div class="vidrio bloque" id="vm-form-caja">${cajaOperar(sim, par)}</div>
      </div>
      <div>
        <div class="vidrio bloque vm-libro-caja">
          <h3>${esc(tx('libro'))}</h3>
          <div class="vm-cab3"><span>${esc(tx('precio'))}</span><span>${esc(tx('cantidad'))}</span></div>
          <div class="vm-lado" id="vm-ventas"></div>
          <div class="vm-medio mono" id="vm-medio">—</div>
          <div class="vm-lado" id="vm-compras"></div>
          <div class="vm-vacio oculto" id="vm-libro-nota"></div>
        </div>
        <div class="vidrio bloque vm-tape-caja">
          <div class="vm-peskab" role="tablist">
            <button role="tab" aria-selected="true" data-pes="tratos"
                    onclick="VMERCADO.pestana('tratos')">${esc(tx('tratos'))}</button>
            <button role="tab" aria-selected="false" data-pes="mias"
                    onclick="VMERCADO.pestana('mias')">${esc(tx('ps.mias'))}<span class="cuenta" id="vm-nmias"></span></button>
            <button role="tab" aria-selected="false" data-pes="historial"
                    onclick="VMERCADO.pestana('historial')">${esc(tx('ps.historial'))}</button>
            <button role="tab" aria-selected="false" data-pes="mistratos"
                    onclick="VMERCADO.pestana('mistratos')">${esc(tx('ps.mistratos'))}</button>
          </div>
          <div id="vm-tratos"><div class="vm-vacio">—</div></div>
          <div id="vm-mias" class="oculto"></div>
          <div id="vm-historial" class="oculto"></div>
          <div id="vm-mistratos" class="oculto"></div>
        </div>
      </div>
    </div>
    ${DATOS.haySesion() ? `
    <div class="vidrio bloque">
      <h3>${esc(tx('misOrdenes'))}</h3>
      <!-- LA TABLA QUE MÁS IMPORTA QUE DESLICE. Son cinco columnas y la
           quinta lleva el botón de cancelar: medida en un teléfono de 360 px,
           ese botón caía en la posición 443 y el recorte del body se lo
           comía. Cancelar es la única salida de una orden que ya reservó
           saldo, así que la columna que no se alcanzaba era justo la que
           libera el dinero. -->
      <div class="desliza">
        <table class="tabla">
          <thead><tr><th>${esc(tx('lado'))}</th><th>${esc(tx('tipo'))}</th><th>${esc(tx('precio'))}</th>
            <th>${esc(tx('resta'))}</th><th></th></tr></thead>
          <tbody id="vm-ordenes"></tbody>
        </table>
      </div>
      <p class="pie" id="vm-ordenes-nota"></p>
    </div>` : ''}`;
  }

  // ── la cabecera del mercado: último, cambio y la referencia rotulada ──────

  async function cargarCab() {
    try { mercadosCache = await DATOS.mercados(); } catch { /* lo pintado, quieto */ }
    const m = (mercadosCache || []).find(x => x.mercado === parActual);
    const ultimo = $('vm-ultimo'), cambio = $('vm-cambio'), ref = $('vm-ref'), medio = $('vm-medio');
    if (!ultimo || !m) return;
    pintarPrecioUnico(m);
    if (cambio) cambio.innerHTML = pastillaCambio(m.cambio24h);
    /* Debajo del precio, el detalle de la referencia EN DÓLARES con su rótulo:
       la onza (o la plata, o el acta) y el gramín. Es el cartel del metal, no
       la última operación; que cada número diga en qué está medido es lo que
       impide leerlos como si fueran el mismo. */
    if (ref) ref.textContent = detalleRef(m) || '';
    const pf = precioFila(m);
    if (medio) medio.innerHTML = `${pf.txt == null ? '—' : `<span class="${pf.ref ? 'ms-esref' : ''}">${esc(pf.txt)}</span>`} <small>ORIGEN</small>`;
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

  /* ── EL PRECIO ÚNICO Y SU FUENTE ──────────────────────────────────────────
     Devuelve { txt, ref, fuente, detalle } para un mercado: el número que se
     enseña, si es referencia, la línea «de dónde y de cuándo» y el detalle en
     dólares. Es pura (recibe el mercado y los tratos) para poder probarla sin
     navegador: la promesa de esta casa es que un precio nunca viaja sin su
     fuente ni su hora. */
  function precioUnico(m, tratos) {
    const pf = precioFila(m);
    if (pf.txt == null) return { txt: null, ref: false, fuente: tx('fuenteNada'), detalle: null };
    if (!pf.ref) {
      const ultimoTrato = Array.isArray(tratos) && tratos.length ? tratos[0].en : null;
      return { txt: pf.txt, ref: false, fuente: rell(tx('fuenteTrato'), { hora: ultimoTrato ? hora(ultimoTrato) : '—' }), detalle: detalleRef(m) };
    }
    const r = m.referencia || {};
    return {
      txt: pf.txt, ref: true,
      fuente: rell(tx('fuenteRef'), { rotulo: r.rotulo || '', fuente: r.fuente || '—', hora: r.en ? hora(r.en) : '—' }),
      detalle: detalleRef(m),
    };
  }

  function detalleRef(m) {
    const r = m?.referencia;
    const usd = Number(r?.usd), gramin = Number(r?.origenUsd);
    if (!r || !Number.isFinite(usd) || usd <= 0 || !Number.isFinite(gramin) || gramin <= 0) return null;
    return rell(tx('refDetalle'), { rotulo: r.rotulo || '', usd: usd.toFixed(2), gramin: gramin.toFixed(4) });
  }

  function pintarPrecioUnico(m) {
    const el = $('vm-ultimo'), et = $('vm-ultimo-et'), fuente = $('vm-fuente');
    if (!el) return;
    const p = precioUnico(m, tratosCache);
    el.textContent = p.txt == null ? '—' : p.txt;
    el.classList.toggle('ms-esref', p.ref);
    if (et) et.textContent = p.ref ? tx('refRot') : tx('ultimo');
    if (fuente) fuente.textContent = p.fuente;
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
     grande: los mercados publicados están SIEMPRE, en el orden de la cadena, con
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
      const pf = precioFila(m);
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
        <span class="pr${pf.ref ? ' esRef' : ''}"
              title="${pf.ref ? esc(tx('ls.esRef')) : ''}">${pf.txt == null ? '—' : esc(pf.txt)}</span>
        <span class="ch ${clase}">${esc(txt)}</span>
      </div>`;
    }).join('');
  }

  /* ── las pestañas de abajo ─────────────────────────────────────────────────
     Los tratos de la casa y MIS órdenes abiertas, en el mismo sitio. Un
     operador mira sus órdenes cada pocos segundos; mandarlo a otra vista para
     eso era el error de diseño más caro que tenía esta sala. */
  let pestanaAbierta = 'tratos';

  const PESTANAS = ['tratos', 'mias', 'historial', 'mistratos'];
  function pestana(cual) {
    if (!PESTANAS.includes(cual)) return;
    pestanaAbierta = cual;
    document.querySelectorAll('.vm-peskab button').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.pes === cual)));
    for (const k of PESTANAS) $('vm-' + k)?.classList.toggle('oculto', cual !== k);
    if (cual === 'mias') pintarMias();
    if (cual === 'historial') cargarHistorial();
    if (cual === 'mistratos') cargarMisTratos();
  }

  /* ── el historial y mis tratos: las dos pestañas que un exchange llama
        «historial de órdenes» y «historial de operaciones». Se piden al abrir
        la pestaña y no con reloj: son papeles cerrados, no cambian solos. ── */
  const rotuloEstado = e => tx('est.' + e) === 'est.' + e ? e : tx('est.' + e);
  async function cargarHistorial() {
    const caja = $('vm-historial');
    if (!caja) return;
    if (!DATOS.haySesion()) { caja.innerHTML = `<div class="vm-vacio">${esc(tx('ps.sinSesion'))}</div>`; return; }
    caja.innerHTML = `<div class="vm-vacio">${esc(tx('ps.cargando'))}</div>`;
    let lista;
    try { lista = await DATOS.historialOrdenes(); } catch { caja.innerHTML = `<div class="vm-vacio">${esc(tx('ordenesNo'))}</div>`; return; }
    const mias = lista.filter(o => o.mercado === parActual && o.estado !== 'abierta');
    if (!mias.length) { caja.innerHTML = `<div class="vm-vacio">${esc(tx('ps.sinHist'))}</div>`; return; }
    caja.innerHTML = mias.map(o => {
      const hecha = entero(o.cantidad) != null && entero(o.resta) != null ? entero(o.cantidad) - entero(o.resta) : null;
      return `
      <div class="vm-mia vm-hist">
        <span class="lado ${o.lado === 'venta' ? 'venta' : 'compra'}">${esc(tx(o.lado === 'venta' ? 'vender' : 'comprar'))}</span>
        <span class="mono pr">${o.precio == null ? esc(tx('mercado')) : esc(deWei(o.precio, 4) ?? '—')}</span>
        <span class="mono ct">${esc(deWei(hecha == null ? o.cantidad : hecha.toString(), 4) ?? '—')} / ${esc(deWei(o.cantidad, 4) ?? '—')}</span>
        <span class="est ${esc(o.estado)}">${esc(rotuloEstado(o.estado))}<small>${esc(hora(o.en))}</small></span>
      </div>`;
    }).join('');
  }
  async function cargarMisTratos() {
    const caja = $('vm-mistratos');
    if (!caja) return;
    if (!DATOS.haySesion()) { caja.innerHTML = `<div class="vm-vacio">${esc(tx('ps.sinSesion'))}</div>`; return; }
    caja.innerHTML = `<div class="vm-vacio">${esc(tx('ps.cargando'))}</div>`;
    let lista;
    try { lista = await DATOS.misTratos(parActual); } catch { caja.innerHTML = `<div class="vm-vacio">${esc(tx('tratosNo'))}</div>`; return; }
    if (!lista.length) { caja.innerHTML = `<div class="vm-vacio">${esc(tx('ps.sinMisTratos'))}</div>`; return; }
    caja.innerHTML = lista.map(t => `
      <div class="vm-mia vm-hist">
        <span class="lado ${t.lado === 'venta' ? 'venta' : 'compra'}">${esc(tx(t.lado === 'venta' ? 'vender' : 'comprar'))}</span>
        <span class="mono pr">${esc(deWei(t.precio, 4) ?? '—')}</span>
        <span class="mono ct">${esc(deWei(t.cantidad, 4) ?? '—')} · ${esc(deWei(t.total, 4) ?? '—')} ORIGEN</span>
        <span class="est"><small>${esc(hora(t.en))}</small></span>
      </div>`).join('');
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
      /* EL DESCARGO NO DEPENDE DE QUE EL FETCH SALGA BIEN.
         Esto era `if (!declCache) return ''`, y ahí estaba el agujero: si
         /precio-declarado/ONDK tropezaba —red, 500, plazo vencido— se caía el
         bloque entero, y con él la frase «no hay libro ni contraparte, así que
         este número no es un precio de mercado». Lo que NO se caía era el
         resto de la pantalla: el libro, la pestaña de tratos y el formulario
         seguían ahí, ofreciendo operar un security token sin una sola
         advertencia a la vista.
         Lo que puede faltar es el NÚMERO; la advertencia, jamás. Así que el
         rótulo se pinta siempre y lo único que desaparece cuando no hay dato
         es el pie con la fecha y el acta. */
      const v = declCache && declCache.vigente;
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

  /* La tira de debajo del lienzo: apertura, máximo, mínimo, medias y volumen
     de la vela que la leyenda de dentro está enseñando.

     POR QUE existe. En un teléfono el lienzo mide 287 px de ancho, y con
     precios de nueve cifras cada renglón de la leyenda se lleva uno entero:
     la leyenda pasaba de tres renglones a nueve y se volvía una cortina sobre
     las velas. VELAS lo detecta y se queda con lo esencial —qué par, qué
     marco, a cuánto cerró—, marca el informe con `recortada` y devuelve lo
     demás para que caiga acá abajo. Es una mudanza, no un recorte: los mismos
     números, en un renglón que envuelve y a 12,5 px en vez de a 10,5 sobre una
     vela verde. Con la gráfica ancha esto no se enciende nunca.

     `null` la apaga: se llama así al empezar cada pintado. */
  function tiraLeyenda(inf) {
    const t = $('vm-ohlc');
    if (!t) return;
    const l = inf && inf.leyenda;
    if (!l || !l.recortada) { t.hidden = true; t.innerHTML = ''; return; }
    const dato = (et, val, clase) =>
      `<span class="vm-ohlc-d"><i>${esc(et)}</i><b class="${clase || ''}">${esc(String(val))}</b></span>`;
    const emas = (l.emas || []).map(e => dato('EMA' + e.periodo, e.valor == null ? '—' : e.valor));
    t.innerHTML = [
      dato('O', l.o), dato('H', l.h), dato('L', l.l),
      ...emas,
      l.volumen == null ? '' : dato('V', l.volumen),
    ].filter(Boolean).join('');
    t.hidden = false;
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
    // Cada pintado empieza sin tira: si el dibujo nuevo no recorta la leyenda,
    // la del dibujo anterior no se puede quedar contando otra vela.
    tiraLeyenda(null);

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
        tiraLeyenda(VELAS.dibujar(c, velas, {
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
        }));
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
      tiraLeyenda(VELAS.dibujar(c, velasCache, {
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
      }));
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
    // El libro es lo que decide si un instrumento declarado se puede operar:
    // cuando llega, la puerta puede haber cambiado de estado.
    sincronizarPuerta();
  }

  /* Repinta el formulario SOLO si la puerta cambió de estado. La comparación
     no es cosmética: el libro se sondea cada cinco segundos y repintar la caja
     en cada tirón le borraría a la persona el precio y la cantidad que está
     tecleando, que es peor que el fallo que se está arreglando. */
  let puertaPintada = null;
  function sincronizarPuerta() {
    const ahora = clavePuerta(parActual);
    if (ahora === puertaPintada) return;
    puertaPintada = ahora;
    const caja = $('vm-form-caja');
    if (!caja) return;
    caja.innerHTML = cajaOperar(CADENA.baseDe(parActual) || '', parActual);
    aplicarLadoTipo();
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
    // La hora del último trato vive en la línea de fuente del precio.
    const mm = (mercadosCache || []).find(x => x.mercado === parActual);
    if (mm) pintarPrecioUnico(mm);
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

  /* ── la puerta del instrumento declarado ──────────────────────────────────
     Devuelve el HTML que va EN LUGAR del formulario, o null si no hay nada
     que interponer. Se pregunta antes que ninguna otra cosa: quien no pasa
     por acá no ve un campo de precio.

     El orden de las condiciones es el orden del riesgo: primero si hay
     mercado (sin contraparte no se ofrece nada, ni con sesión ni sin ella),
     después quién sos, y al final si leíste lo que estás por comprar. */
  function clavePuerta(par) {
    if (!hayDecl(par)) return 'libre';

    /* ¿Hay libro? `libroCache` en null es «todavía no se leyó», y acá eso
       cuenta como NO: fail-closed. Enseñar el formulario mientras se averigua
       si hay contraparte es ofrecer primero y comprobar después. */
    const compras = Array.isArray(libroCache?.compras) ? libroCache.compras : [];
    const ventas = Array.isArray(libroCache?.ventas) ? libroCache.ventas : [];
    if (!compras.length && !ventas.length) return 'sinLibro';

    // Con mercado abierto, la sesión se pide como en cualquier otro par.
    if (!DATOS.haySesion()) return 'libre';

    /* La idoneidad. `verificada` viene del propio API en el canje SSO, así
       que es el dato de Genesis y no una opinión del navegador. Fail-closed:
       lo que no dice `true` no pasa. */
    const yo = DATOS.usuario();
    if (!yo || yo.verificada !== true) return 'sinVerificar';

    /* Y el descargo, aceptado a mano. Vive en memoria y NO en el navegador a
       propósito: recargar la página vuelve a pedirlo. Un consentimiento
       guardado se convierte en una casilla que alguien marcó una vez hace
       meses, y esto no es una preferencia de pantalla — es lo que separa
       «compré sin saber» de «compré sabiendo». */
    return idoneidadAceptada.has(par) ? 'libre' : 'descargo';
  }

  function puertaDeclarado(par) {
    switch (clavePuerta(par)) {
      case 'sinLibro':
        return `<div class="vacio"><b>${esc(tx('onT'))}</b>${esc(tx('onSinLibro'))}</div>`;
      case 'sinVerificar':
        return `<div class="vacio"><b>${esc(tx('onVerifT'))}</b>${esc(tx('onVerifP'))}</div>`;
      case 'descargo':
        return `<div class="vm-descargo">
          <b>${esc(tx('onDescT'))}</b>
          <p>${esc(tx('onDescP'))}</p>
          <label class="vm-descargo-check">
            <input type="checkbox" id="vm-desc-check" onchange="VMERCADO.marcarDescargo()">
            <span>${esc(tx('onDescCheck'))}</span></label>
          <button class="btn btn-linea btn-full btn-sm" id="vm-desc-btn" disabled
            onclick="VMERCADO.aceptarDescargo()">${esc(tx('onDescBtn'))}</button>
        </div>`;
      default:
        return null;
    }
  }

  /* `par` explícito y no `parActual`: la vista se ARMA antes de que alPintar
     fije el par, así que en el primer pintado de un mercado nuevo `parActual`
     todavía es el anterior. Con el par de fuera, la puerta de ONDK no se
     decide nunca con los datos del mercado que se acaba de dejar. */
  function cajaOperar(sim, par) {
    const elPar = par || parActual;
    // La puerta del instrumento declarado manda por encima de todo lo demás.
    const puerta = puertaDeclarado(elPar);
    if (puerta != null) return `<h3>${esc(tx('operar'))}</h3>${puerta}`;

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
    <!-- Las cuatro partes del saldo. Es lo que un exchange pone debajo de la
         cantidad y lo que evita la calculadora aparte: «¿cuánto es la mitad
         de lo que tengo a este precio?» se contesta con un toque. -->
    <div class="vm-pct" role="group">
      ${[25, 50, 75, 100].map(n => `<button type="button" onclick="VMERCADO.parte(${n})">${n}%</button>`).join('')}
    </div>
    <!-- El total se ESCRIBE, no solo se lee: «quiero gastar 500 ORIGEN» es
         tan válido como «quiero 0,3 AUKA», y la cantidad sale de dividir. Solo
         a límite: a mercado no hay precio con el que dividir. -->
    <div class="campo" id="vm-campo-total">
      <label for="vm-total-in">${esc(tx('totalIn'))}</label>
      <input id="vm-total-in" inputmode="decimal" autocomplete="off" spellcheck="false"
        oninput="VMERCADO.desdeTotal()">
    </div>
    <div class="vm-linea-total"><span id="vm-total-lbl">${esc(tx('total'))}</span>
      <b class="mono" id="vm-total">—</b></div>
    <!-- A mercado, el precio al que de verdad se llena y cuánto se aleja de
         la punta: es lo que decide si conviene una orden límite en su lugar. -->
    <div class="vm-linea-fee oculto" id="vm-prom-linea"><span>${esc(tx('promedio'))}</span>
      <span class="mono" id="vm-prom">—</span></div>
    <!-- Lo que cobra la casa y lo que queda, ANTES del botón. El orden de
         lectura es el de la cuenta: total, menos comisión, recibís. -->
    <div class="vm-linea-fee"><span id="vm-comision-lbl">${esc(tx('comision'))}</span>
      <span class="mono" id="vm-comision">—</span></div>
    <div class="vm-linea-fee vm-recibis"><span>${esc(tx('recibis'))}</span>
      <b class="mono" id="vm-recibis">—</b></div>
    <p class="ayuda" id="vm-comision-nota"></p>
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
    $('vm-campo-total')?.classList.toggle('oculto', tipoActual === 'mercado');
    $('vm-prom-linea')?.classList.toggle('oculto', tipoActual !== 'mercado');
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
    if (document.activeElement?.id === 'vm-cant' || document.activeElement?.id === 'vm-total-in') {
      document.querySelectorAll('.vm-pct button.es').forEach(b => b.classList.remove('es'));
    }
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
    // El total escribible sigue a la cantidad, salvo que sea justo lo que
    // se está tecleando: pisarle el campo a quien escribe es perderle letras.
    const totalIn = $('vm-total-in');
    if (totalIn && document.activeElement !== totalIn && !aprox) totalIn.value = total == null ? '' : texto(total, 6);
    pintarPromedio(cant, total, aprox);
    pintarComision(cant, total, aprox);
    if (notaSuave && aviso) { aviso.textContent = notaSuave; aviso.classList.add('suave'); }
  }

  /* El total escrito manda sobre la cantidad: cant = total / precio, con
     floor, que es lo único que no gasta de más. Solo a límite. */
  function desdeTotal() {
    if (tipoActual !== 'limite') return;
    const total = entero(ONX.aWei($('vm-total-in')?.value));
    const precio = entero(ONX.aWei($('vm-precio')?.value));
    const inp = $('vm-cant');
    if (!inp) return;
    if (total == null || precio == null || precio === 0n) { recalcular(); return; }
    inp.value = texto((total * WEI) / precio);
    recalcular();
  }

  /* Una parte del saldo, en cantidad del activo. Vendiendo es una fracción de
     lo que se tiene; comprando a límite, la fracción del ORIGEN entre el
     precio; comprando a mercado, lo que ese presupuesto compra caminando el
     libro —la misma caminata que hará el motor, con floor en cada escalón. */
  function parte(pct) {
    const sim = CADENA.baseDe(parActual);
    const inp = $('vm-cant');
    if (!inp || !DATOS.haySesion()) return;
    const n = BigInt(Math.max(1, Math.min(100, Number(pct) || 0)));
    let cant = null;
    if (ladoActual === 'venta') {
      const s = saldoDe(sim); if (s == null) return;
      cant = (s * n) / 100n;
    } else {
      const s = saldoDe('ORIGEN'); if (s == null) return;
      let presupuesto = (s * n) / 100n;
      if (tipoActual === 'limite') {
        const precio = entero(ONX.aWei($('vm-precio')?.value));
        if (precio == null || precio === 0n) { ONX.avisar(tx('ePrecio')); return; }
        cant = (presupuesto * WEI) / precio;
      } else {
        const ventas = libroCache?.ventas;
        if (!Array.isArray(ventas)) { ONX.avisar(tx('eLibro')); return; }
        cant = 0n;
        for (const [p, c] of ventas) {
          const pp = entero(p), cc = entero(c);
          if (pp == null || cc == null || pp === 0n) break;
          const costo = notionalDe(cc, pp);
          if (costo <= presupuesto) { cant += cc; presupuesto -= costo; }
          else { cant += (presupuesto * WEI) / pp; break; }
        }
      }
    }
    if (cant == null) return;
    inp.value = texto(cant);
    document.querySelectorAll('.vm-pct button').forEach(b => b.classList.toggle('es', Number(b.textContent) === Number(pct)));
    recalcular();
  }

  /* A mercado: el precio promedio de la caminata y cuánto se aleja de la
     punta, en por ciento con signo. Es la cifra que un exchange llama
     «deslizamiento» y la que dice si conviene una orden límite. */
  function pintarPromedio(cant, total, aprox) {
    const el = $('vm-prom');
    if (!el) return;
    if (!aprox || cant == null || cant <= 0n || total == null) { el.textContent = '—'; return; }
    const prom = (total * WEI) / cant;
    const lado = ladoActual === 'compra' ? libroCache?.ventas : libroCache?.compras;
    const punta = Array.isArray(lado) && lado.length ? entero(lado[0][0]) : null;
    let nota = '';
    if (punta && punta > 0n) {
      const d = Number(((prom - punta) * 10000n) / punta) / 100;   // dos decimales, truncado
      if (d !== 0) nota = ` · ${rell(tx(d > 0 ? 'sobrePunta' : 'bajoPunta'), { pct: Math.abs(d).toFixed(2) })}`;
    }
    el.textContent = `≈ ${deWei(prom.toString(), 4)} ORIGEN${nota}`;
  }

  /* LA COMISIÓN Y LO QUE QUEDA.
   *
   * La casa cobra partes por millón SOBRE LO RECIBIDO, y cada lado recibe una
   * cosa distinta: quien compra recibe el activo, quien vende recibe ORIGEN.
   * Por eso la comisión se resta de monedas distintas según el lado, y no del
   * total en los dos casos — restarla siempre del ORIGEN habría enseñado un
   * número que el motor no cobra.
   *
   * La cuenta es la MISMA que hace lib/motor.js (floor, en BigInt, sobre wei):
   * nada de porcentajes en punto flotante para enseñar un número que después
   * se cobra con enteros. Lo único que es Number acá es el rótulo del
   * porcentaje, que es texto y no dinero.
   *
   * En órdenes de mercado es una estimación, como el total: lleva el mismo ≈.
   */
  function pintarComision(cant, total, aprox) {
    const elCom = $('vm-comision'), elRec = $('vm-recibis'),
          lbl = $('vm-comision-lbl'), nota = $('vm-comision-nota');
    if (!elCom || !elRec) return;

    const sim = CADENA.baseDe(parActual) || '';
    const compra = ladoActual === 'compra';
    // Lo que se recibe y en qué moneda: el activo si se compra, el ORIGEN del
    // total si se vende.
    const recibido = compra ? cant : total;
    const moneda = compra ? sim : 'ORIGEN';

    if (lbl) lbl.textContent = tx('comision');
    if (nota) nota.textContent = '';

    // Sin tarifa leída no se inventa nada: guiones y el porqué escrito.
    const ppm = tarifaCache && Number.isInteger(tarifaCache.comisionPpm) && tarifaCache.comisionPpm >= 0
      ? BigInt(tarifaCache.comisionPpm) : null;
    if (ppm == null) {
      elCom.textContent = '—';
      elRec.textContent = '—';
      if (nota) nota.textContent = tx('comisionNo');
      return;
    }

    // El rótulo lleva el porcentaje SIEMPRE, aunque no haya cantidad escrita:
    // es lo que contesta «¿cuánto cobran acá?» antes de teclear nada.
    const pct = Number(ppm) / 10000;   // ppm → por ciento
    if (lbl) lbl.textContent = `${tx('comision')} (${pct.toFixed(2).replace(/\.?0+$/, '') || '0'}%)`;

    if (recibido == null || recibido <= 0n) {
      elCom.textContent = '—';
      elRec.textContent = '—';
      return;
    }
    const comision = (recibido * ppm) / 1000000n;   // floor, igual que el motor
    const queda = recibido - comision;
    const marca = aprox ? '≈ ' : '';
    elCom.textContent = `${marca}${deWei(comision.toString(), 6)} ${moneda}`;
    elRec.textContent = `${marca}${deWei(queda.toString(), 6)} ${moneda}`;
  }

  /* La tarifa se pide UNA vez y se guarda: es de la casa, no del par, y no
     cambia mientras la pantalla está abierta. Si el API no contesta, se queda
     en null y el formulario dice que no la pudo traer — nunca un cero. */
  /* La casilla y el botón del descargo. Van juntos a propósito: la casilla
     sola es fácil de marcar sin leer, y el botón deshabilitado hasta marcarla
     obliga a dos gestos distintos para lo mismo. */
  function marcarDescargo() {
    const c = $('vm-desc-check'), b = $('vm-desc-btn');
    if (b) b.disabled = !(c && c.checked);
  }

  function aceptarDescargo() {
    const c = $('vm-desc-check');
    if (!c || !c.checked) return;   // la puerta no se abre desde la consola
    idoneidadAceptada.add(parActual);
    /* Se cuenta, y sin nada que identifique a nadie: cuánta gente llega al
       descargo y cuánta lo acepta es lo único que dice si esta puerta protege
       o solo estorba. */
    tele('accion', 'declarado.descargo.aceptado', { ruta: '#mercado/' + String(parActual || '') });
    sincronizarPuerta();
  }

  async function cargarTarifas() {
    if (tarifaCache) return;
    try {
      tarifaCache = await DATOS.tarifas();
    } catch {
      tarifaCache = null;
    }
    // Puede llegar con el formulario ya pintado: se repinta la cuenta.
    if ($('vm-comision')) recalcular();
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

  /* Cuánto mueve una orden, en ORIGEN y en unidades humanas, para la
     telemetría. Es la misma cuenta que enseña recalcular(), y a propósito no se
     recalcula distinto: si el panel dijera un notional y la pantalla otro, el
     que se equivocó sería siempre el que nadie está mirando.

     Para límite es exacto; para mercado es la caminata del libro leído, o sea
     una ESTIMACION — por eso el evento de mercado lleva su marca en meta. Sin
     libro devuelve null y el evento sale sin monto: un cero de consuelo en una
     suma de volumen es peor que un hueco. */
  function notionalDeOrden(orden) {
    const cant = entero(orden.cantidad);
    if (cant == null || cant <= 0n) return null;
    let wei = null;
    if (orden.tipo === 'limite') {
      const p = entero(orden.precio);
      if (p == null || p <= 0n) return null;
      wei = notionalDe(cant, p);
    } else {
      const est = orden.lado === 'compra' ? costoDeMercado(cant) : ingresoDeMercado(cant);
      if (!est) return null;
      wei = orden.lado === 'compra' ? est.costo : est.ingreso;
    }
    // texto() da decimal plano sin separadores; Number sobre eso es seguro.
    // El wei NO se manda: 1e18 en un panel que suma volumen no dice nada.
    const n = Number(texto(wei, 6));
    return Number.isFinite(n) ? n : null;
  }

  /* El nombre del evento de una orden lleva el lado y el mercado DENTRO:
     «orden.compra.AUKA-ORIGEN». El explorador de analítica busca texto en
     `nombre`, `mensaje` y `ruta`, y no mira `meta`; si el par viviera solo en
     meta, «qué se opera en Ordenex» sería una pregunta imposible de hacer desde
     el panel aunque el dato estuviera guardado. */
  const nombreOrden = (orden, sufijo) =>
    'orden.' + orden.lado + '.' + orden.mercado + (sufijo || '');

  /* ═══ LA CONFIRMACIÓN ANTES DE COLOCAR ═══════════════════════════════════
   *
   * Hubo una orden de 4365,3 AUKA con el precio de la onza EN DÓLARES tecleado
   * en un campo que pide ORIGEN por AUKA. Nadie la vio antes de mandarla
   * porque no había nada que ver: el botón mandaba. Ahora el botón abre esta
   * pantalla, que dice en una sola caja qué das, qué recibís, a qué precio,
   * cuál es la referencia del oro (onza, gramín, fuente y hora) y cuánto te
   * alejás de ella en por ciento. Pasado el aviso (X) lo dice en rojo y hace
   * marcar una casilla; pasado el bloqueo (Y) no deja seguir. X e Y vienen de
   * GET /limites, del mismo sitio que los aplica.
   *
   * La cuenta se hace igual que en el servidor (lib/guardaPrecio.js): en
   * BigInt sobre wei, en partes por millón, con la referencia pasada a wei por
   * texto. Y el servidor la repite: esto es el cartel; la puerta es el API.
   */
  let limitesCache = null;    // { desvio: { avisoPct, bloqueoPct }, terminos: { version, … } } — null = no leído
  let confirmando = null;     // la orden en la pantalla de confirmación, o null

  async function cargarLimites() {
    if (limitesCache) return;
    try { limitesCache = await DATOS.limites(); } catch { limitesCache = null; }
  }

  // La referencia del par en wei: la misma división que pinta la lista.
  const refWeiDe = m => { const r = refEnOrigen(m); return r == null ? null : entero(r); };

  /* El desvío de un precio contra su referencia, en % con signo. En BigInt y
     truncando, como el servidor: un desvío redondeado hacia arriba avisaría
     donde el servidor no avisa, y al revés sería peor. */
  function desvioPct(precioWei, refWei) {
    if (precioWei == null || refWei == null || refWei <= 0n || precioWei <= 0n) return null;
    return Number(((precioWei - refWei) * 1000000n) / refWei) / 10000;
  }

  /* El nivel que le toca a un desvío con los umbrales dados:
       'libre'  el mercado no tiene referencia (IBS, HARV): nada que comparar
       'sinRef' debería tenerla y no llegó: no se coloca (fail-closed)
       'sinLimites' hay desvío pero /limites no contestó: se enseña el número,
                se pide la casilla y decide el servidor
       'ok' | 'aviso' | 'bloqueo' */
  function nivelDesvio(desvio, conRef, limites) {
    if (!conRef) return 'libre';
    if (desvio == null) return 'sinRef';
    const x = Number(limites?.desvio?.avisoPct), y = Number(limites?.desvio?.bloqueoPct);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 'sinLimites';
    const abs = Math.abs(desvio);
    if (abs > y) return 'bloqueo';
    if (abs > x) return 'aviso';
    return 'ok';
  }

  /* El resumen de una orden validada, con todo lo que la pantalla enseña. Es
     pura: recibe la orden, el mercado, el libro, la tarifa y los umbrales, y
     devuelve números y niveles — nada de DOM. Así se prueba sin navegador que
     4365,3 sale 'bloqueo' y que 1700 sale 'ok'. */
  function resumenDe(orden, m, libro, tarifa, limites) {
    const sim = String(orden.mercado || '').split('-')[0];
    const cant = entero(orden.cantidad);
    const compra = orden.lado === 'compra';
    const aprox = orden.tipo === 'mercado';

    // El total: exacto a límite, caminata del libro a mercado.
    let total = null, cubre = true;
    if (!aprox) {
      const p = entero(orden.precio);
      total = p == null || cant == null ? null : notionalDe(cant, p);
    } else {
      const ventas = libro?.ventas, compras = libro?.compras;
      const lado = compra ? ventas : compras;
      if (Array.isArray(lado)) {
        let falta = cant, suma = 0n;
        for (const [p, c] of lado) {
          const pp = entero(p), cc = entero(c);
          if (pp == null || cc == null) { suma = null; break; }
          const toma = cc < falta ? cc : falta;
          suma += notionalDe(toma, pp);
          falta -= toma;
          if (falta === 0n) break;
        }
        total = suma;
        cubre = falta === 0n;
      }
    }

    // El precio que se compara: el tecleado a límite, el promedio del libro a mercado.
    const precioWei = !aprox ? entero(orden.precio)
      : (total != null && cant > 0n ? (total * WEI) / cant : null);

    const refWei = refWeiDe(m);
    const conRef = CON_REFERENCIA.includes(sim) || CON_DECLARADO.includes(sim);
    const desvio = desvioPct(precioWei, refWei);
    const nivel = nivelDesvio(desvio, conRef, limites);

    // Lo que se da y lo que se recibe, con la comisión sobre lo recibido.
    const ppm = tarifa && Number.isInteger(tarifa.comisionPpm) && tarifa.comisionPpm >= 0 ? BigInt(tarifa.comisionPpm) : null;
    const recibidoBruto = compra ? cant : total;
    const comision = ppm != null && recibidoBruto != null ? (recibidoBruto * ppm) / 1000000n : null;
    const recibido = recibidoBruto != null && comision != null ? recibidoBruto - comision : recibidoBruto;

    return {
      sim, aprox, cubre,
      das: { wei: compra ? total : cant, sim: compra ? 'ORIGEN' : sim },
      recibis: { wei: recibido, sim: compra ? sim : 'ORIGEN', comisionWei: comision, ppm: ppm == null ? null : Number(ppm) },
      precioWei, refWei, desvio, nivel, conRef,
      referencia: m?.referencia || null,
      limites: limites?.desvio || null,
      terminosVersion: limites?.terminos?.version || null,
    };
  }

  const pct = n => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)} %`);

  function abrirConfirmacion(orden) {
    const m = (mercadosCache || []).find(x => x.mercado === orden.mercado) || null;
    const r = resumenDe(orden, m, libroCache, tarifaCache, limitesCache);
    confirmando = { orden, resumen: r };
    const x = r.limites?.avisoPct, y = r.limites?.bloqueoPct;
    const w = (wei, sim, dec = 6) => wei == null ? '—' : `${r.aprox ? '≈ ' : ''}${deWei(wei.toString(), dec)} ${sim}`;
    const necesitaTerminos = !(r.terminosVersion && DATOS.terminosAceptados(r.terminosVersion));
    const puede = r.nivel !== 'bloqueo' && r.nivel !== 'sinRef' && (r.das.wei != null);

    const ref = r.referencia;
    const filaRefOro = ref && ref.usd != null && ref.origenUsd != null
      ? `<div class="cf-fila"><span>${esc(tx('cf.refOro'))}</span><b class="mono">${esc(detalleRef(m) || '—')}</b>
           <small>${esc(rell(tx('fuenteRef'), { rotulo: ref.rotulo || '', fuente: ref.fuente || '—', hora: ref.en ? hora(ref.en) : '—' }))}</small></div>
         <div class="cf-fila"><span>${esc(rell(tx('cf.refPar'), { sim: r.sim }))}</span><b class="mono">${esc(deWei(r.refWei.toString(), 4))} ORIGEN</b></div>`
      : '';

    let desvioHtml;
    if (r.nivel === 'libre') desvioHtml = `<div class="cf-desvio ok">${esc(tx('cf.sinRefLibre'))}</div>`;
    else if (r.nivel === 'sinRef') desvioHtml = `<div class="cf-desvio bloqueo">${esc(tx('cf.sinRef'))}</div>`;
    else if (r.nivel === 'bloqueo') desvioHtml = `<div class="cf-desvio bloqueo"><b>${esc(pct(r.desvio))}</b> ${esc(rell(tx('cf.desvioBloqueo'), { y: String(y), sim: r.sim }))}</div>`;
    else if (r.nivel === 'aviso' || r.nivel === 'sinLimites') desvioHtml = `<div class="cf-desvio aviso"><b>${esc(pct(r.desvio))}</b> ${esc(r.nivel === 'aviso' ? rell(tx('cf.desvioAviso'), { x: String(x), sim: r.sim }) : tx('cf.limitesNo'))}
        <label class="vm-descargo-check"><input type="checkbox" id="cf-desvio-check" onchange="VMERCADO.marcarConfirmacion()"><span>${esc(tx('cf.desvioCheck'))}</span></label></div>`;
    else desvioHtml = `<div class="cf-desvio ok"><b>${esc(pct(r.desvio))}</b> ${esc(rell(tx('cf.desvioOk'), { x: String(x) }))}</div>`;

    const enlaces = () => {
      const base = limitesCache?.terminos || {};
      const a = (ruta, txt) => `<a href="${esc(ruta || 'legal.html')}" target="_blank" rel="noopener">${esc(txt)}</a>`;
      return rell(esc(tx('cf.terminosCheck')), { terminos: a(base.terminos, tx('cf.terminosLink')), riesgo: a(base.riesgo, tx('cf.riesgoLink')) });
    };

    const html = `
    <div class="cf-velo" id="vm-confirmar" role="dialog" aria-modal="true" aria-labelledby="cf-titulo">
      <div class="cf-caja vidrio">
        <h3 id="cf-titulo">${esc(tx('cf.t'))}</h3>
        <div class="cf-fila"><span>${esc(tx('cf.das'))}</span><b class="mono cf-grande">${esc(w(r.das.wei, r.das.sim))}</b></div>
        <div class="cf-fila"><span>${esc(tx('cf.recibis'))}</span><b class="mono cf-grande">${esc(w(r.recibis.wei, r.recibis.sim))}</b>
          ${r.recibis.comisionWei != null ? `<small>${esc(tx('cf.comision'))} (${esc(String(r.recibis.ppm / 10000))} %): ${esc(w(r.recibis.comisionWei, r.recibis.sim))}</small>` : `<small>${esc(tx('comisionNo'))}</small>`}</div>
        <div class="cf-fila"><span>${esc(tx('cf.precio'))}</span><b class="mono">${r.precioWei == null ? '—' : esc(`${r.aprox ? '≈ ' : ''}${deWei(r.precioWei.toString(), 4)} ORIGEN / ${r.sim}`)}</b>
          ${r.aprox ? `<small>${esc(tx('cf.precioMercado'))}${r.cubre ? '' : ' · ' + esc(tx('noCubre'))}</small>` : ''}</div>
        ${filaRefOro}
        <div class="cf-fila"><span>${esc(tx('cf.desvio'))}</span>${desvioHtml}</div>
        ${!limitesCache && r.nivel === 'libre' ? `<p class="ayuda">${esc(tx('cf.limitesNo'))}</p>` : ''}
        ${necesitaTerminos ? `<label class="vm-descargo-check cf-terminos"><input type="checkbox" id="cf-terminos-check" onchange="VMERCADO.marcarConfirmacion()"><span>${enlaces()}</span></label>` : ''}
        <p class="vm-aviso" id="cf-aviso" aria-live="polite"></p>
        <div class="cf-botones">
          <button class="btn btn-linea btn-sm" onclick="VMERCADO.cerrarConfirmacion()">${esc(tx('cf.volver'))}</button>
          <button class="btn btn-sm vm-btn ${orden.lado}" id="cf-ok" ${puede ? '' : 'disabled'} onclick="VMERCADO.confirmar()">${esc(tx('cf.confirmar'))}</button>
        </div>
      </div>
    </div>`;
    document.getElementById('vm-confirmar')?.remove();
    document.body.insertAdjacentHTML('beforeend', html);
    marcarConfirmacion();
    tele('pantalla', 'orden.confirmacion.' + String(orden.mercado), '#mercado/' + String(orden.mercado));
    setTimeout(() => document.getElementById('cf-ok')?.focus(), 30);
  }

  function cerrarConfirmacion() {
    confirmando = null;
    document.getElementById('vm-confirmar')?.remove();
  }

  /* El botón de confirmar se enciende solo cuando están marcadas TODAS las
     casillas que la pantalla pidió: la del desvío si lo hubo y la de los
     términos si es la primera orden. Bloqueo y sin referencia no se encienden
     nunca — no hay casilla que abra esa puerta. */
  function marcarConfirmacion() {
    const ok = document.getElementById('cf-ok');
    if (!ok || !confirmando) return;
    const r = confirmando.resumen;
    if (r.nivel === 'bloqueo' || r.nivel === 'sinRef' || r.das.wei == null) { ok.disabled = true; return; }
    const d = document.getElementById('cf-desvio-check');
    const t = document.getElementById('cf-terminos-check');
    ok.disabled = (d && !d.checked) || (t && !t.checked);
  }

  async function confirmar() {
    if (!confirmando) return;
    const { orden, resumen: r } = confirmando;
    const ok = document.getElementById('cf-ok'), aviso = document.getElementById('cf-aviso');
    if (r.nivel === 'bloqueo' || r.nivel === 'sinRef') return; // la puerta no se abre desde la consola
    const d = document.getElementById('cf-desvio-check');
    if (d && !d.checked) return;
    const t = document.getElementById('cf-terminos-check');
    if (t && !t.checked) return;
    if (ok) { ok.disabled = true; ok.textContent = tx('cf.enviando'); }
    try {
      // Los términos primero, una vez por versión: sin esto el API contesta
      // TERMINOS_NO_ACEPTADOS y la orden no entra.
      if (t && r.terminosVersion) {
        await DATOS.aceptarTerminos(r.terminosVersion);
        tele('accion', 'terminos.aceptados', { meta: { version: r.terminosVersion } });
      }
    } catch (e) {
      if (aviso) aviso.textContent = e?.message || tx('eTerminos');
      if (ok) { ok.disabled = false; ok.textContent = tx('cf.confirmar'); }
      return;
    }
    const final = { ...orden };
    if (r.nivel === 'aviso' || r.nivel === 'sinLimites') final.aceptoDesvio = true;
    tele('accion', 'orden.confirmada.' + String(orden.mercado), { meta: { desvioPct: r.desvio, nivel: r.nivel } });
    cerrarConfirmacion();
    await enviar(final);
  }

  async function colocar() {
    if (!DATOS.haySesion()) {
      /* Intentar operar sin sesión es el momento exacto en que Ordenex manda a
         alguien a la billetera, y es la mitad de arriba del embudo del SSO: sin
         esto, los que se pierden en el camino no se distinguen de los que nunca
         quisieron entrar. */
      tele('accion', 'orden.sinSesion', { ruta: '#mercado/' + String(parActual || '') });
      ONX.entrar();
      return;
    }
    /* La puerta del instrumento declarado, otra vez y acá abajo. El
       formulario ya no se pinta cuando está cerrada, pero VMERCADO.colocar()
       se puede llamar desde la consola: una puerta que solo existe en el HTML
       no es una puerta, es un cartel.
       Ojo: esto sigue siendo el NAVEGADOR. La comprobación que de verdad
       protege va en el backend, en POST /ordenes, y hoy no está — queda
       anotada para quien tiene controllers/ en las manos. */
    if (clavePuerta(parActual) !== 'libre') {
      sincronizarPuerta();
      return;
    }
    const aviso = $('vm-aviso');
    const v = validar();
    if (!v.ok) {
      if (aviso) { aviso.classList.remove('suave'); aviso.textContent = v.msg; }
      return;
    }
    // Los umbrales y la versión de los términos, si todavía no llegaron: la
    // confirmación los enseña. Si el API no contesta, la pantalla lo dice y
    // el servidor los aplica igual.
    await cargarLimites();
    abrirConfirmacion(v.orden);
  }

  /* El envío de verdad, DESPUÉS de la confirmación. Es lo que antes hacía
     colocar() de un tirón. */
  async function enviar(orden) {
    const aviso = $('vm-aviso'), btn = $('vm-enviar');
    const v = { orden };
    // La llave sobrevive a recalcular() solo dentro de este envío: se toma
    // DESPUÉS de validar para que un reintento de red repita la misma orden.
    if (!ordenKeyViva) ordenKeyViva = llaveNueva();
    v.orden.ordenKey = ordenKeyViva;
    if (btn) btn.disabled = true;
    /* El notional se calcula ANTES de mandar la orden: al volver, el formulario
       ya está limpio y el libro puede haberse movido, así que después del await
       la cuenta daría otro número o ninguno. */
    const monto = notionalDeOrden(v.orden);
    const ruta = '#mercado/' + String(v.orden.mercado);
    const marcas = { tipo: v.orden.tipo, estimado: v.orden.tipo === 'mercado' };
    try {
      await DATOS.colocar(v.orden);
      /* La orden aceptada es EL gesto de esta casa: el que hay que poder contar
         por mercado, por lado y por volumen. Va como `transaccion` —no como
         `accion`— porque es el único tipo que el servidor suma en el volumen
         diario; con `accion` el evento se guardaría igual y no entraría en
         ninguna cuenta de dinero. */
      tele('transaccion', nombreOrden(v.orden), monto, 'ORIGEN', { ruta: ruta, meta: marcas });
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
      /* Una orden que no entra es lo más caro que puede pasar aquí, y desde el
         backend no se ve: el rechazo por saldo se ve, pero el timeout de red no
         llega a existir. Se manda con el código y el HTTP para poder separar
         «el motor dijo que no» de «no llegamos al motor», que se arreglan en
         sitios distintos. La sesión vencida va como aviso y no como error: es
         el funcionamiento normal de un token de quince minutos, y contarla como
         fallo enseñaría a ignorar la lista de errores. */
      tele('fallo', nombreOrden(v.orden, '.rechazada'), e, {
        gravedad: e?.codigo === 'SESION_VENCIDA' ? 'aviso' : 'error',
        ruta: ruta,
        meta: { tipo: v.orden.tipo, codigo: e?.codigo || 'DESCONOCIDO', http: e?.http || 0 },
      });
      if (e?.codigo === 'SESION_VENCIDA') {
        const caja = $('vm-form-caja');
        if (caja) caja.innerHTML = cajaOperar(CADENA.baseDe(parActual) || '');
        ONX.avisar(tx('eSesion'));
      } else if (aviso) {
        aviso.classList.remove('suave');
        /* Los frenos de la casa tienen su frase propia: decir «no se pudo
           colocar» cuando el API acaba de explicar que el precio se aleja un
           155 % de la referencia sería tirar la explicación. */
        const propio = {
          PRECIO_DESVIADO: 'ePrecioDesviado', DESVIO_SIN_ACEPTAR: 'eDesvioSinAceptar',
          TERMINOS_NO_ACEPTADOS: 'eTerminos', SIN_REFERENCIA_AHORA: 'eSinRefAhora',
        }[e?.codigo];
        aviso.textContent = propio ? tx(propio) : (e?.message || tx('eColocar'));
        if (e?.codigo === 'TERMINOS_NO_ACEPTADOS') {
          // La sesión guardada creía que estaban aceptados y el API dice que
          // no (otra versión, otra cuenta): se limpia para que la próxima
          // confirmación vuelva a pedir la casilla.
          limitesCache = null;
        }
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
    const ruta = '#mercado/' + String(parActual || '');
    try {
      await DATOS.cancelar(id);
      /* Cancelar va sin monto y sin id: el monto ya se contó al colocar y
         sumarlo otra vez inflaría el volumen del día con dinero que no se
         movió, y el id de una orden apunta a una persona concreta. Lo que
         importa contar es cuántas se retiran y de qué mercado. */
      tele('accion', 'orden.cancelada.' + String(parActual || ''), { ruta: ruta });
      ONX.avisar(tx('cancelada'));
      // Cancelar libera la reserva: saldo, libro y lista cambian juntos.
      cargarCartera(); cargarLibro(); cargarOrdenes();
    } catch (e) {
      // Una cancelación que falla deja dinero reservado contra la voluntad de
      // su dueño. Merece verse aunque la pantalla ya lo esté diciendo.
      tele('fallo', 'orden.cancelada.fallo', e, {
        gravedad: e?.codigo === 'SESION_VENCIDA' ? 'aviso' : 'error',
        ruta: ruta,
        meta: { codigo: e?.codigo || 'DESCONOCIDO', http: e?.http || 0 },
      });
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
    // La vista ya se armó con este estado de puerta; se anota para que
    // sincronizarPuerta() solo repinte cuando de verdad cambie.
    puertaPintada = clavePuerta(parActual);
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

    // La tarifa de la casa, para el desglose del formulario. Se pide sin
    // sesión —es pública— y sin reloj: no cambia mientras se mira la pantalla.
    cargarTarifas();

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
    // Una confirmación abierta muere con la sala: confirmar una orden de un
    // mercado que ya no está en pantalla es colocar a ciegas.
    cerrarConfirmacion();
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
    vistaMercados, vistaMercado, alPintar, apagar, zoom, favorito, filtrar, pestana, buscarLista, ordenarLista,
    marco, fuente, lado, tipo, usarPrecio, recalcular, maximo, parte, desdeTotal, colocar, quitar,
    marcarDescargo, aceptarDescargo,
    cerrarConfirmacion, marcarConfirmacion, confirmar,
    // Para las pruebas, como _piezas en qr.js: los textos y las cuentas puras.
    _txt: () => TXT,
    _puros: {
      texto, notionalDe, costoDeMercado: c => costoDeMercado(c), validar: () => validar(),
      // La confirmación y el precio único, sin DOM: lo que habría parado la
      // orden de 4365,3 AUKA se prueba con números, no con capturas.
      desvioPct, nivelDesvio, resumenDe, precioUnico, detalleRef,
      // Las decisiones de fuente son puras y se prueban sin navegador: qué
      // mercado tiene cartel del metal, con qué pestaña abre y qué marcos le
      // tocan a cada una.
      MARCOS, CON_REFERENCIA, CON_DECLARADO, hayRef, hayDecl, marcosDe, decimalesUSD, refEnOrigen,
      fuenteInicial: p => fuenteInicial(p),
      estado: () => ({ fuente: fuenteActual, firme: fuenteFirme, marcos: { ...marcos } }),
    },
  };
})();
