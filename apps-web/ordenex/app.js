/* Ordenex · web — el orquestador.
 *
 * Este archivo NO pinta mercados, ni portafolio, ni fiat: registra las vistas,
 * decide portada o aplicación, y le presta a los módulos los helpers de la
 * casa. Habla con el backend solo a través de DATOS y con los textos del
 * cascarón solo a través de t() — que es interno a propósito: cada módulo
 * trae su propio TXT (patrón AURA_TXT de la billetera) y usa idiomaActivo().
 *
 * ═══ LO QUE ESTE ARCHIVO ESPERA DE LOS MÓDULOS QUE NO ESCRIBE ══════════════
 *
 * Cada módulo es un script clásico que expone UNA const global léxica (IIFE,
 * como toda la casa) y se carga ANTES que este archivo:
 *
 *   velas.js      const VELAS  — la gráfica de velas en canvas propio, sin
 *                 librerías: VELAS.dibujar(canvas, velas, opciones). La
 *                 consume mercado.js, no este archivo.
 *
 *   mercado.js    const VMERCADO — { vistaMercados(): string,
 *                 vistaMercado(par): string, alPintar?(cual, par),
 *                 apagar?() } y sus manejadores onclick (VMERCADO.x(...)).
 *
 *   portafolio.js const VPORTA — { vista(): string, vistaActividad(): string,
 *                 alPintar?(cual), apagar?() }. El QR de depósito sale de
 *                 QR.svg, como en la billetera.
 *
 *   fiat.js       const VFIAT — { vista(): string, alPintar?(cual),
 *                 apagar?() }. Los logos de bancos viven en assets/bancos/.
 *
 * El contrato de vida es el de la billetera: la vista es una FUNCIÓN que
 * devuelve un string de HTML y se pinta por innerHTML en #lienzo. Después de
 * pintar se llama alPintar(cual, dato) — ahí van los canvas, los focus y los
 * sondeos (DATOS.sondeo: libro y tratos cada 5 s, velas cada 30 s, solo con
 * la pestaña visible). Al navegar a otra vista se llama apagar() del módulo
 * que se va: TODO sondeo que un módulo abre lo para su apagar(), idempotente,
 * porque también se llama al volver a la portada. Datos en HTML pasan por
 * ONX.esc; datos dentro de un onclick, por ONX.jsTxt; montos en wei, por
 * ONX.deWei/ONX.aWei — el dinero es SIEMPRE string de wei y la conversión a
 * texto se hace al pintar, nunca antes.
 *
 * Si un módulo falta (archivo aún no instalado), su vista cae en un stub
 * amable: la casa no se rompe por una sala en obras.
 */

const ONX = (() => {
  'use strict';

  // Adónde se va a buscar la sesión: la wallet atiende #sso-ordenex, pide su
  // token SSO a Genesis y vuelve acá con #sso=<token>. Se puede apuntar a
  // otra wallet definiendo ONX_WALLET antes de este archivo, para probar el
  // circuito entero contra un ensayo.
  const WALLET = String(window.ONX_WALLET || 'https://app.vetawallet.com').replace(/\/$/, '');

  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Un dato que viaja DENTRO de una cadena de JavaScript que a su vez vive en
     un atributo (onclick="ONX.algo(AQUI)") pasa por DOS lectores: primero el
     de HTML, que des-escapa las entidades, y después el de JS. esc() sirve
     para el primero y NO para el segundo. Así que se escapa al revés: primero
     para JS —JSON.stringify, que además pone las comillas— y después para
     HTML. Se usa SIN comillas alrededor: onclick="ONX.algo(${jsTxt(x)})". */
  const jsTxt = s => esc(JSON.stringify(String(s == null ? '' : s))
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'));

  // ── el dinero: strings de wei, BigInt, y ni un double en el camino ────────

  /* De wei a texto. Se CORTA, no se redondea: redondear hacia arriba enseña
     dinero que no existe, y en la fila de un libro de órdenes ese pelo de más
     es exactamente el que alguien intenta gastar. Devuelve null si el dato no
     es un entero — un monto ilegible se pinta como guion, jamás como cero. */
  function deWei(s, dec = 4) {
    if (s == null || s === '') return null;
    let n;
    try { n = BigInt(s); } catch { return null; }
    const signo = n < 0n ? '-' : '';
    if (n < 0n) n = -n;
    const entero = (n / 10n ** 18n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const cola = (n % 10n ** 18n).toString().padStart(18, '0')
      .slice(0, Math.max(0, dec)).replace(/0+$/, '');
    return signo + entero + (cola ? '.' + cola : '');
  }

  /* De lo que teclea la gente a wei. Devuelve null ante CUALQUIER cosa rara
     —más de 18 decimales, letras, negativos, vacío— y quien pinta decide qué
     decir: adivinar un monto es peor que rechazarlo. */
  function aWei(txt) {
    const s = String(txt == null ? '' : txt).trim().replace(',', '.');
    if (!/^\d+(\.\d{1,18})?$/.test(s)) return null;
    const [ent, dec = ''] = s.split('.');
    try {
      return (BigInt(ent) * 10n ** 18n + BigInt((dec + '000000000000000000').slice(0, 18))).toString();
    } catch { return null; }
  }

  // ── la tostada ────────────────────────────────────────────────────────────

  let relojTostada;
  function avisar(texto) {
    const el = $('#tostada');
    el.textContent = texto;
    el.classList.add('ver');
    clearTimeout(relojTostada);
    relojTostada = setTimeout(() => el.classList.remove('ver'), 3200);
  }

  // ── las vistas: delegación en los módulos, con stub amable ────────────────

  /* typeof sobre un nombre no declarado no lanza: si el archivo del módulo no
     se cargó, su const no existe y esto devuelve null en vez de reventar. Es
     lo que deja estrenar el cascarón antes de que existan todas las salas. */
  const modulos = {
    VMERCADO: () => typeof VMERCADO === 'undefined' ? null : VMERCADO,
    VPORTA: () => typeof VPORTA === 'undefined' ? null : VPORTA,
    VFIAT: () => typeof VFIAT === 'undefined' ? null : VFIAT,
  };
  // Quién es dueño de cada vista: a su módulo van alPintar() y apagar().
  const DUENO = { mercados: 'VMERCADO', mercado: 'VMERCADO', portafolio: 'VPORTA', fiat: 'VFIAT', actividad: 'VPORTA' };

  const stub = cual => `
    <div class="cab"><div><h2>${esc(t('nav.' + (cual === 'mercado' ? 'mercados' : cual)))}</h2></div></div>
    <div class="vidrio bloque"><div class="vacio"><b>${esc(t('stub.t'))}</b>${esc(t('stub.p'))}</div></div>`;

  const VISTAS = {
    mercados: () => modulos.VMERCADO()?.vistaMercados?.() ?? stub('mercados'),
    mercado: () => modulos.VMERCADO()?.vistaMercado?.(parAbierto) ?? stub('mercado'),
    portafolio: () => modulos.VPORTA()?.vista?.() ?? stub('portafolio'),
    fiat: () => modulos.VFIAT()?.vista?.() ?? stub('fiat'),
    actividad: () => modulos.VPORTA()?.vistaActividad?.() ?? stub('actividad'),
  };

  let vistaActual = 'mercados';
  let parAbierto = null;        // el mercado abierto, p. ej. 'AUKA-ORIGEN'

  // ── hash-routing, como la billetera: la barra de direcciones es producto ──

  let porPop = false;

  const rutaDe = (cual, dato) =>
    cual === 'mercado' && (dato || parAbierto)
      ? '#mercado/' + encodeURIComponent(dato || parAbierto)
      : '#' + cual;

  function leerRuta(h) {
    const txt = String(h || '').replace(/^#/, '');
    if (txt.startsWith('sso=')) return null;   // una intención no es una ruta
    const [a, b] = txt.split('/');
    if (a === 'mercado' && b) return { v: 'mercado', d: decodeURIComponent(b) };
    return VISTAS[a] ? { v: a } : null;
  }

  addEventListener('popstate', e => {
    if ($('#app').classList.contains('oculto')) return;
    const r = (e.state?.v && VISTAS[e.state.v]) ? e.state : leerRuta(location.hash);
    if (!r) return;
    porPop = true;
    vista(r.v, r.d);
    porPop = false;
  });

  /* Apaga los sondeos del módulo que se va. Se llama en cada navegación y al
     volver a la portada; los apagar() de los módulos son idempotentes. */
  function apagarVista() {
    try { modulos[DUENO[vistaActual]]?.()?.apagar?.(); } catch {}
  }

  function vista(cual, dato) {
    if (!VISTAS[cual]) cual = 'mercados';
    apagarVista();
    vistaActual = cual;
    if (cual === 'mercado' && dato) parAbierto = dato;
    // La pestaña encendida: mirar UN mercado sigue siendo estar en Mercados.
    const encendida = cual === 'mercado' ? 'mercados' : cual;
    document.querySelectorAll('.nav[data-vista]').forEach(b =>
      b.dataset.vista === encendida ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
    const l = $('#lienzo');
    /* LA SALA DE MERCADO TIENE OTRAS LEYES. En las demás vistas el ancho de
       lectura manda —980 px, que es lo que el ojo recorre sin cansarse— y la
       fotografía de fondo es parte de la casa. Aquí no: una gráfica es un
       instrumento, y un instrumento se mira ancho y contra un fondo quieto.
       Con el cepo de lectura puesto, la gráfica ocupaba un tercio de un
       monitor y el otro tercio era una foto de alguien con un teléfono
       compitiendo con las velas. Esta clase suelta el ancho y apaga la foto,
       y solo mientras se está en la sala. */
    document.body.classList.toggle('en-mercado', cual === 'mercado');
    /* La dirección del viaje, como en la billetera: entrar a un mercado llega
       desde más lejos, volver a la lista se asienta. El reflow forzado
       reinicia la animación cuando se navega dos veces seguidas. */
    l.classList.remove('lz-dentro', 'lz-fuera');
    void l.offsetWidth;
    l.classList.add(cual === 'mercados' ? 'lz-fuera' : 'lz-dentro');
    l.innerHTML = VISTAS[cual]();
    // El post-pintado es del dueño: canvas, focus y sondeos van ahí.
    try { modulos[DUENO[cual]]?.()?.alPintar?.(cual, parAbierto); } catch {}
    /* La dirección se actualiza DESPUÉS de pintar, y nunca cuando el cambio
       viene del propio botón atrás — si no, volver empujaría una entrada
       nueva y el historial no dejaría salir jamás. */
    if (!porPop) {
      const r = rutaDe(cual, dato);
      if (location.hash !== r) history.pushState({ v: cual, d: dato || parAbierto }, '', r);
    }
    window.scrollTo(0, 0);
  }

  // ── portada y aplicación ──────────────────────────────────────────────────

  function ir(destino) {
    $('#portada').classList.toggle('oculto', destino !== 'portada');
    $('#app').classList.toggle('oculto', destino !== 'app');
    // El techo es de la portada; dentro, la marca vive en el riel.
    $('#techo').classList.toggle('oculto', destino === 'app');
    /* El sondeo de mercados YA NO se para al entrar: alimenta la cinta de
       precios, y la cinta esta arriba en todas las pantallas. Antes se apagaba
       porque solo servia a la tabla de la portada; una cinta que se congela al
       entrar a la casa es peor que no tenerla. */
    document.body.classList.toggle('en-app', destino === 'app');
    if (destino === 'app') { vista(vistaActual); }
    else {
      apagarVista();
      /* La luz de la sala se apaga al salir de ella. Sin esto, volver a la
         portada desde un mercado dejaba la fotografía apagada y el ancho
         suelto en una pantalla que sí los quiere: la penumbra es del
         instrumento, no de la casa. */
      document.body.classList.remove('en-mercado');
    }
    window.scrollTo(0, 0);
  }

  // Abrir un mercado desde la portada. Sin sesión también: lo público se ve
  // entero — mercados, velas, libro — y la sesión se pide al operar.
  function abrirPar(par) {
    vistaActual = 'mercado';
    parAbierto = par;
    ir('app');
  }

  // ── los mercados vivos de la portada ──────────────────────────────────────

  /* La tabla de la portada respira sola: sondeo de 10 s mientras la portada
     está a la vista, parado en seco al entrar a la aplicación — ahí el que
     sondea es el módulo de mercados, y dos relojes sobre el mismo dato es
     tráfico doble para pintar lo mismo. */
  let pararMercadosVivos = null;
  let vivosPintados = false;

  function arrancarVivos() {
    if (pararMercadosVivos) return;
    pararMercadosVivos = DATOS.sondeo(pintarVivos, 10000);
  }
  function pararVivos() {
    if (pararMercadosVivos) { pararMercadosVivos(); pararMercadosVivos = null; }
  }

  async function pintarVivos() {
    const cuerpo = $('#mv-cuerpo'), nota = $('#mv-nota');
    if (!cuerpo) return;
    let lista;
    try { lista = await DATOS.mercados(); } catch {
      /* Sin feed, guion — y la verdad en la nota. Si ya había precios
         pintados se dejan quietos: un dato viejo y honesto vale más que una
         tabla parpadeando a vacío por un tropiezo de red. */
      if (!vivosPintados) cuerpo.innerHTML = '';
      nota.textContent = t('pt.mvSinFeed');
      return;
    }
    nota.textContent = '';
    cuerpo.innerHTML = (lista || []).map(m => {
      const base = CADENA.baseDe(m.mercado) || m.mercado;
      const ultimo = deWei(m.ultimo);
      /* La referencia del API no es un wei: es un objeto { usd, rotulo, … }
         con el precio informativo en dolares. Pasarlo por deWei pintaba
         vacio — se enseña el usd rotulado, y si no vino, nada. */
      const ref = (m.referencia && m.referencia.usd != null)
        ? ('$' + Number(m.referencia.usd).toFixed(2)) : null;
      const chg = m.cambio24h == null ? null : Number(m.cambio24h);
      const pill = chg == null ? '<span class="mv-sin">—</span>'
        : `<span class="pastilla ${chg < 0 ? 'baja-p' : 'sube-p'}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span>`;
      return `
        <tr onclick="ONX.abrirPar(${jsTxt(m.mercado)})">
          <td class="mv-par"><b>${esc(base)}</b><small>/ ORIGEN</small></td>
          <td class="mono mv-num">${ultimo == null ? '—' : esc(ultimo)}
            ${ref == null ? '' : `<small class="mv-ref">${esc(t('pt.mvRef'))} ${esc(ref)}</small>`}</td>
          <td class="mv-chg">${pill}</td>
          <td class="mono mv-num soloAncho">${esc(deWei(m.alto24h) ?? '—')}</td>
          <td class="mono mv-num soloAncho">${esc(deWei(m.bajo24h) ?? '—')}</td>
          <td class="mono mv-num soloAncho">${esc(deWei(m.vol24h) ?? '—')}</td>
        </tr>`;
    }).join('');
    vivosPintados = true;
    pintarCinta(lista);
  }

  /* ── la cinta de precios ───────────────────────────────────────────────────
     Los quince mercados pasando arriba del todo, siempre. La pista se pinta
     DOS veces y la animacion corre el 50%: asi el bucle vuelve a empezar sin
     costura, sin un temporizador y sin JS por cuadro.

     Los mercados sin precio pasan con GUION y no se esconden. Una cinta que
     solo enseña los que se movieron parece mas liquida de lo que es, y esa es
     justo la mentira que esta casa no dice. */
  function pintarCinta(lista) {
    const pista = $('#cinta-pista');
    if (!pista || !Array.isArray(lista) || !lista.length) return;
    const items = lista.map((m) => {
      const base = CADENA.baseDe(m.mercado) || m.mercado;
      const u = deWei(m.ultimo);
      const chg = m.cambio24h == null ? null : Number(m.cambio24h);
      const clase = chg == null ? 'nada' : chg < 0 ? 'baja' : 'sube';
      const txt = chg == null ? '—' : `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
      return `<button class="cinta-it" onclick="ONX.abrirPar(${jsTxt(m.mercado)})">
        <b>${esc(base)}</b><span class="p">${u == null ? '—' : esc(u)}</span>
        <span class="c ${clase}">${esc(txt)}</span></button>`;
    }).join('');
    // Dos mitades iguales: la animacion desplaza exactamente una.
    pista.innerHTML = `<div class="cinta-mitad">${items}</div><div class="cinta-mitad" aria-hidden="true">${items}</div>`;
  }

  // ── la sesión: SSO con la wallet, sin contraseñas propias ─────────────────

  // El viaje de ida: la wallet atiende #sso-ordenex (con sesión pide su token
  // a Genesis; sin sesión, primero login) y vuelve a esta página con
  // #sso=<token>. La vuelta la recoge arrancar().
  function entrar() {
    location.href = WALLET + '/#sso-ordenex';
  }

  async function canjear(token) {
    avisar(t('acc.entrando'));
    try {
      await DATOS.sso(token);
      ir('app');
      avisar(t('acc.hola'));
    } catch (e) {
      // Fail-closed: sin canje no hay sesión a medias — DATOS no guardó nada.
      avisar(e?.codigo === 'SESION_VENCIDA' ? t('acc.vencida') : t('acc.mal'));
    }
  }

  function salir() {
    DATOS.salir();
    vistaActual = 'mercados';
    parAbierto = null;
    history.replaceState(null, '', location.pathname + location.search);
    ir('portada');
    avisar(t('tost.chau'));
  }

  // ── idioma ────────────────────────────────────────────────────────────────

  /* Las vistas se generan enteras al navegar, así que basta con repintar los
     textos fijos y volver a dibujar lo que está en pantalla: no queda nada a
     medio traducir. */
  function idioma(cual) {
    if (cual !== 'es' && cual !== 'en') return;
    idiomaActual = cual;
    try { localStorage.setItem('ordenex.idioma', cual); } catch {}
    pintarIdioma();
    if (!$('#app').classList.contains('oculto')) vista(vistaActual);
    else pintarVivos();
  }

  // ── el arranque ───────────────────────────────────────────────────────────

  function arrancar() {
    pintarIdioma();

    /* ¿Viene un token de la wallet? El hash se limpia ANTES de canjearlo: un
       token de sesión no se queda en la barra, ni en el historial, ni en la
       captura de pantalla que alguien comparte. */
    /* La cinta arranca ANTES de decidir a donde va la persona, y no se para
       nunca: esta arriba en todas las pantallas. */
    arrancarVivos();

    const hash = String(location.hash || '');
    if (hash.startsWith('#sso=')) {
      const token = decodeURIComponent(hash.slice(5));
      history.replaceState(null, '', location.pathname + location.search);
      ir('portada');
      canjear(token);
      return;
    }

    /* Una ruta directa (#mercados, #mercado/AUKA-ORIGEN…) entra a la
       aplicación aunque no haya sesión: todo lo público se ve sin cuenta, y
       la sesión se pide recién al operar. */
    const r = leerRuta(hash);
    if (r) {
      vistaActual = r.v;
      if (r.d) parAbierto = r.d;
      ir('app');
      return;
    }

    ir(DATOS.haySesion() ? 'app' : 'portada');
  }
  document.addEventListener('DOMContentLoaded', arrancar);

  /* La API pública. esc/jsTxt/deWei/aWei se exportan porque los módulos
     pintan con ellos; t() NO se exporta — los textos de cada vista viven en
     su módulo, y prestar t() sería invitar a mezclar los dos diccionarios. */
  return { entrar, salir, idioma, ir, vista, abrirPar, avisar, esc, jsTxt, deWei, aWei };
})();
