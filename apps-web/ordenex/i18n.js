// Los dos idiomas de Ordenex, uno junto al otro — el mismo patrón de la
// billetera: claves cortas que nombran el LUGAR del texto, no su contenido,
// para que el mismo código pinte cualquiera de los dos sin enterarse de cuál.
//
// Aquí viven SOLO los textos del cascarón: techo, portada, riel, acceso y las
// tostadas comunes. Los textos de cada vista viven en su módulo (mercado.js,
// portafolio.js, fiat.js) con su propio TXT y idiomaActivo(), como AURA_TXT
// en la billetera: la pantalla y sus palabras se mueven juntas o no se mueven.

const I18N = {
es: {
  /* LA PORTADA. El sello dice de qué casa es esto; el titular es corto porque
     la tabla de al lado ya está contando la historia con números de verdad. */
  /* El sello dice de QUIEN es la casa, no en que ecosistema opera. Son dos
     cosas distintas y confundirlas es lo que hacia esta portada: Ordenex es de
     AuCorp, y lo que se cambia aqui son los activos de Orden Global. */
  'pt.sello': 'UNA CASA DE AUCORP · ECOSISTEMA ORDEN GLOBAL',
  'pt.t1': 'EL MERCADO', 'pt.t2': 'DE LA CASA.',
  /* {mercados} lo pone t(), contando CADENA.PARES. Decía «los quince» a mano y
     eran cinco: la cadena tiene quince activos, seis están publicados y la
     casa abre mercado a cinco. Tres cifras para lo mismo, ninguna coincidía, y
     la que veía el cliente era la única que no se podía comprobar mirando la
     pantalla — abajo se contaban las filas y no daban quince. */
  'pt.p': 'Los {mercados} mercados de la cadena 5550, cada uno contra ORIGEN. Libro de órdenes de verdad, velas que solo pintan tratos reales, y entrada y salida en lempiras o dólares con agentes verificados.',
  'pt.entrar': 'Entrar con mi cuenta Veta Wallet',
  'pt.ver': 'Ver los mercados',
  // La nota del botón: acá no se inventa una contraseña nueva. La cuenta es
  // la misma de todo el ecosistema, y decirlo quita el miedo a «otra cuenta».
  'pt.nota': 'Tu cuenta es la misma de todo el ecosistema: te mandamos a tu Veta Wallet, confirmás ahí, y volvés adentro. Ordenex no guarda contraseñas.',
  'pt.vivos': 'El mercado, ahora',
  'pt.mvPar': 'Mercado', 'pt.mvUltimo': 'Último', 'pt.mvCambio': '24 h',
  /* Estas tres estaban DOS VECES en este mismo diccionario, y la segunda vez
     con el texto en inglés. En un objeto literal la última gana, así que la
     portada en español encabezaba sus columnas «24 h high / 24 h low / 24 h
     vol.» — y encima el diccionario inglés no las tenía, con lo cual caía por
     el respaldo a estas mismas y el inglés salía bien por casualidad.
     Un duplicado en un diccionario no rompe nada: cambia el idioma en
     silencio. Por eso ahora hay una prueba que los busca:
     apps-web/ordenex/pruebas/probar-diccionarios.mjs */
  'pt.mvAlto': 'Máx. 24 h', 'pt.mvBajo': 'Mín. 24 h', 'pt.mvVol': 'Vol. 24 h',
  'pt.mvRef': 'ref.',
  'pt.mvCargando': 'Trayendo los mercados…',
  // «Sin feed, guion»: un mercado que no se pudo traer no es un mercado en
  // cero, y acá se dice la verdad aunque quede menos linda.
  'pt.mvSinFeed': 'No pudimos traer los mercados. Los precios van a aparecer en cuanto vuelva la conexión.',

  /* Los enlaces legales. Las palabras son las del expediente de la Secretaría
     (14/08/2026): ORIGEN está REFERENCIADO al oro —onza / 31,1035 / 55—, es
     una referencia y no una promesa; nada de «regulados», nada de
     «respaldado». Lo que la casa no puede decir con verdad no lo dice. */
  'pt.legal': 'Antes de operar, leé los <a href="legal.html#terminos" target="_blank" rel="noopener">términos y condiciones</a> y el <a href="legal.html#riesgo" target="_blank" rel="noopener">aviso de riesgo</a>. ORIGEN está referenciado al oro; una referencia no es una promesa de valor.',

  'nav.mercados': 'Mercados', 'nav.portafolio': 'Portafolio',
  'nav.fiat': 'Fiat', 'nav.actividad': 'Actividad',
  'nav.salir': 'Salir',
  'pie.duena': 'Una casa de',
  'pie.og': 'Orden Global',
  'pie.terminos': 'Términos', 'pie.riesgo': 'Aviso de riesgo',

  /* La caja de los términos que abre ONX.pedirTerminos: la primera operación
     desde el circuito fiat (la sala de mercado los pide dentro de su propia
     confirmación). Se acepta una vez por versión del texto. */
  'term.t': 'Antes de tu primera operación',
  'term.p': 'Leé los términos y condiciones y el aviso de riesgo de la casa. En corto: ORIGEN está referenciado al oro y su precio de referencia sale de un feed público; el precio de cada trato lo ponen las dos puntas del libro, y el de una operación en efectivo lo pactan las partes. Nada de esto es una promesa de valor ni de liquidez.',
  'term.check': 'Leí y acepto los {terminos} y el {riesgo}.',
  'term.terminos': 'términos y condiciones', 'term.riesgo': 'aviso de riesgo',
  'term.ok': 'Acepto y sigo', 'term.volver': 'Ahora no',
  'term.no': 'No pudimos traer la versión vigente de los términos. Probá en un momento.',
  'term.err': 'No se pudo guardar la aceptación. Probá de nuevo.',

  // El acceso es un solo gesto (el canje del token SSO), pero tiene tres
  // finales posibles y cada uno se dice distinto.
  'acc.entrando': 'Entrando con tu cuenta…',
  'acc.err': 'No se pudo entrar. Probá de nuevo en un momento.',
  'acc.sinGid': 'Para entrar a Ordenex hace falta tu Genesis ID verificado.',
  'acc.hola': 'Bienvenido a la casa de cambio',
  'acc.mal': 'No pudimos validar tu entrada. Volvé a intentarlo desde tu Veta Wallet.',
  'acc.vencida': 'Tu sesión venció. Entrá de nuevo con tu cuenta Veta Wallet.',

  'tost.red': 'No pudimos hablar con el servidor. Revisá tu conexión.',
  'tost.copiado': 'Copiado',
  'tost.chau': 'Cerraste tu sesión.',

  // El stub de una sección que todavía no está instalada. «Pronto» y «roto»
  // son cosas distintas: esto es lo primero.
  'stub.t': 'Esta sección está en camino',
  'stub.p': 'La pieza que la pinta todavía no está instalada en esta versión. El resto de la casa funciona.',
},
en: {
  'pt.sello': 'A HOUSE OF AUCORP · ORDEN GLOBAL ECOSYSTEM',
  'pt.t1': 'THE HOUSE', 'pt.t2': 'MARKET.',
  'pt.p': 'The {mercados} markets of chain 5550, each against ORIGEN. A real order book, candles drawn only from real trades, and cash in and out in lempiras or dollars through verified agents.',
  'pt.entrar': 'Sign in with my Veta Wallet account',
  'pt.ver': 'See the markets',
  'pt.nota': 'Your account is the same one across the ecosystem: we send you to your Veta Wallet, you confirm there, and you come back inside. Ordenex stores no passwords.',
  'pt.vivos': 'The market, right now',
  'pt.mvPar': 'Market', 'pt.mvUltimo': 'Last', 'pt.mvCambio': '24 h',
  // Las tres que faltaban de este lado. Que el respaldo al español las tapara
  // es lo que dejó vivir tanto tiempo al duplicado de arriba.
  'pt.mvAlto': '24 h high', 'pt.mvBajo': '24 h low', 'pt.mvVol': '24 h vol.',
  'pt.mvRef': 'ref.',
  'pt.mvCargando': 'Fetching the markets…',
  'pt.mvSinFeed': 'We couldn’t fetch the markets. Prices will appear as soon as the connection is back.',

  'pt.legal': 'Before trading, read the <a href="legal.html#terminos" target="_blank" rel="noopener">terms and conditions</a> and the <a href="legal.html#riesgo" target="_blank" rel="noopener">risk notice</a>. ORIGEN is referenced to gold; a reference is not a promise of value.',

  'nav.mercados': 'Markets', 'nav.portafolio': 'Portfolio',
  'nav.fiat': 'Fiat', 'nav.actividad': 'Activity',
  'nav.salir': 'Sign out',
  'pie.duena': 'A house of',
  'pie.og': 'Orden Global',
  'pie.terminos': 'Terms', 'pie.riesgo': 'Risk notice',

  'term.t': 'Before your first operation',
  'term.p': 'Read the house’s terms and conditions and risk notice. In short: ORIGEN is referenced to gold and its reference price comes from a public feed; the price of every trade is set by the two sides of the book, and the price of a cash operation is agreed by the parties. None of this is a promise of value or liquidity.',
  'term.check': 'I have read and accept the {terminos} and the {riesgo}.',
  'term.terminos': 'terms and conditions', 'term.riesgo': 'risk notice',
  'term.ok': 'I accept, continue', 'term.volver': 'Not now',
  'term.no': 'We couldn’t fetch the current version of the terms. Try again in a moment.',
  'term.err': 'The acceptance could not be saved. Try again.',

  'acc.entrando': 'Signing in with your account…',
  'acc.err': 'Could not sign in. Try again in a moment.',
  'acc.sinGid': 'To enter Ordenex you need your verified Genesis ID.',
  'acc.hola': 'Welcome to the exchange house',
  'acc.mal': 'We couldn’t validate your sign-in. Try again from your Veta Wallet.',
  'acc.vencida': 'Your session expired. Sign in again with your Veta Wallet account.',

  'tost.red': 'We couldn’t reach the server. Check your connection.',
  'tost.copiado': 'Copied',
  'tost.chau': 'You signed out.',

  'stub.t': 'This section is on its way',
  'stub.p': 'The piece that renders it is not installed in this build yet. The rest of the house works.',
},
};

// ── el motor ─────────────────────────────────────────────────────────────────
// Idéntico al de la billetera: el idioma se toma del navegador la primera
// vez, se puede cambiar desde cualquier pantalla, y lo elegido se recuerda.
let idiomaActual = (() => {
  try { const g = localStorage.getItem('ordenex.idioma'); if (g === 'es' || g === 'en') return g; } catch {}
  return (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
})();

/* ── LOS NÚMEROS QUE NO SE ESCRIBEN A MANO ───────────────────────────────────
   Cuántos mercados abre la casa lo sabe UNA sola pieza: la tabla de activos de
   cadena.js, que es la que también pinta las filas. Cualquier texto que diga
   una cifra la saca de ahí y de ningún otro lado.

   El motivo es que ya pasó al revés: la portada decía «los quince», la sala
   decía «los catorce» y la tabla pintaba cinco. Ninguna de las tres mentía a
   propósito — se escribieron en momentos distintos y la lista siguió su
   camino. Un número escrito a mano es una copia, y toda copia se despega.

   Va en letras y no en cifra porque es prosa: «los cinco mercados» se lee y
   «los 5 mercados» se tropieza. Hasta veinte alcanza de sobra —la cadena tiene
   quince activos— y de ahí para arriba cae a la cifra sola, que es feo pero
   nunca falso. */
/* Global a propósito y con nombre largo: este archivo es un guion clásico, sin
   módulos, así que todo lo de aquí vive en window. `NUMEROS_EN_LETRAS` no
   choca con nada de la casa; un `NUMEROS` a secas se lo lleva por delante el
   primero que declare otro. */
const NUMEROS_EN_LETRAS = {
  es: ['cero', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
       'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho',
       'diecinueve', 'veinte'],
  en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
       'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
       'nineteen', 'twenty'],
};

function enLetras(n, idi) {
  const tabla = NUMEROS_EN_LETRAS[idi] || NUMEROS_EN_LETRAS.es;
  return Number.isInteger(n) && n >= 0 && n < tabla.length ? tabla[n] : String(n);
}

/* Cuántos mercados abre la casa, contados donde se pintan. Si cadena.js no
   cargó todavía, se devuelve null y el texto sale SIN cifra en vez de con un
   cero: «los cero mercados de la cadena» sería peor que no decir cuántos. */
function cuantosMercados() {
  try {
    return Array.isArray(CADENA?.PARES) ? CADENA.PARES.length : null;
  } catch { return null; }
}

/* Rellena {mercados} en cualquier texto, venga del diccionario de acá o del
   TXT de un módulo: es UNA sola manera de decir la cifra en toda la casa. Si
   la cuenta no está, se quita el hueco y la frase se cierra sola («Los
   mercados de la cadena 5550…») — más pobre y sigue siendo verdad. */
function conMercados(texto) {
  if (typeof texto !== 'string' || !texto.includes('{mercados}')) return texto;
  const n = cuantosMercados();
  /* El uno se va por el mismo camino que el «no sé»: las frases que llevan
     este hueco siguen con el sustantivo en plural («los {mercados} mercados»),
     así que con n = 1 saldría «los un mercados». Antes que una cifra exacta
     mal escrita, la frase sin cifra. */
  return n == null || n === 1
    ? texto.replace('{mercados} ', '').replace('{mercados}', '')
    : texto.replace('{mercados}', enLetras(n, idiomaActual));
}

function t(clave) {
  return conMercados(I18N[idiomaActual][clave] ?? I18N.es[clave] ?? clave);
}

// Las fichas de los tokens viven en cadena.js y los textos de las vistas en
// sus módulos; todos necesitan saber en qué idioma pintarse.
function idiomaActivo() { return idiomaActual; }

/* Pinta todos los textos estáticos (data-t / data-tp) y el que se compone: el
   titular de la portada, palabra a palabra, cada una subiendo desde detrás de
   su renglón. Se reconstruye al cambiar de idioma para que la entrada se
   repita: cambiar de idioma ES volver a abrir la página. */
function pintarIdioma() {
  document.documentElement.lang = idiomaActual;
  document.querySelectorAll('[data-t]').forEach(el => { el.innerHTML = t(el.dataset.t); });
  document.querySelectorAll('[data-tp]').forEach(el => { el.placeholder = t(el.dataset.tp); });
  document.querySelectorAll('[data-lang]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.lang === idiomaActual));
  });
  const h = document.getElementById('pt-titulo');
  if (h) {
    const linea = (texto, italica, base) => '<span class="renglon">' +
      texto.split(' ').map((p, i) =>
        `<span class="palabra" style="animation-delay:${(base + i) * 90 + 250}ms">${italica ? '<i>' + p + '</i>' : p}&nbsp;</span>`
      ).join('') + '</span>';
    h.innerHTML = linea(t('pt.t1'), false, 0) + linea(t('pt.t2'), true, t('pt.t1').split(' ').length);
  }
}
