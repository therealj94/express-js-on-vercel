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
  'pt.sello': 'ORDEN GLOBAL · LA CASA DE CAMBIO DEL ECOSISTEMA',
  'pt.t1': 'EL MERCADO', 'pt.t2': 'DE LA CASA.',
  'pt.p': 'Los quince activos de la cadena 5550, cada uno contra ORIGEN. Libro de órdenes de verdad, velas que solo pintan tratos reales, y entrada y salida en lempiras o dólares con agentes verificados.',
  'pt.entrar': 'Entrar con mi cuenta Veta Wallet',
  'pt.ver': 'Ver los mercados',
  // La nota del botón: acá no se inventa una contraseña nueva. La cuenta es
  // la misma de todo el ecosistema, y decirlo quita el miedo a «otra cuenta».
  'pt.nota': 'Tu cuenta es la misma de todo el ecosistema: te mandamos a tu Veta Wallet, confirmás ahí, y volvés adentro. Ordenex no guarda contraseñas.',
  'pt.vivos': 'El mercado, ahora',
  'pt.mvPar': 'Mercado', 'pt.mvUltimo': 'Último', 'pt.mvCambio': '24 h',
  'pt.mvRef': 'ref.',
  'pt.mvCargando': 'Trayendo los mercados…',
  // «Sin feed, guion»: un mercado que no se pudo traer no es un mercado en
  // cero, y acá se dice la verdad aunque quede menos linda.
  'pt.mvSinFeed': 'No pudimos traer los mercados. Los precios van a aparecer en cuanto vuelva la conexión.',

  'nav.mercados': 'Mercados', 'nav.portafolio': 'Portafolio',
  'nav.fiat': 'Fiat', 'nav.actividad': 'Actividad',
  'nav.salir': 'Salir',
  'pie.og': 'Orden Global',

  // El acceso es un solo gesto (el canje del token SSO), pero tiene tres
  // finales posibles y cada uno se dice distinto.
  'acc.entrando': 'Entrando con tu cuenta…',
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
  'pt.sello': 'ORDEN GLOBAL · THE ECOSYSTEM’S EXCHANGE HOUSE',
  'pt.t1': 'THE HOUSE', 'pt.t2': 'MARKET.',
  'pt.p': 'The fifteen assets of chain 5550, each against ORIGEN. A real order book, candles drawn only from real trades, and cash in and out in lempiras or dollars through verified agents.',
  'pt.entrar': 'Sign in with my Veta Wallet account',
  'pt.ver': 'See the markets',
  'pt.nota': 'Your account is the same one across the ecosystem: we send you to your Veta Wallet, you confirm there, and you come back inside. Ordenex stores no passwords.',
  'pt.vivos': 'The market, right now',
  'pt.mvPar': 'Market', 'pt.mvUltimo': 'Last', 'pt.mvCambio': '24 h',
  'pt.mvRef': 'ref.',
  'pt.mvCargando': 'Fetching the markets…',
  'pt.mvSinFeed': 'We couldn’t fetch the markets. Prices will appear as soon as the connection is back.',

  'nav.mercados': 'Markets', 'nav.portafolio': 'Portfolio',
  'nav.fiat': 'Fiat', 'nav.actividad': 'Activity',
  'nav.salir': 'Sign out',
  'pie.og': 'Orden Global',

  'acc.entrando': 'Signing in with your account…',
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

function t(clave) {
  return I18N[idiomaActual][clave] ?? I18N.es[clave] ?? clave;
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
