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

  /* LAS CASAS MADRE QUE VALEN.
   *
   * La wallet no vive en una sola dirección: está su nombre de siempre y están
   * los dos tableros de Amplify —el de ensayo y el de producción—, y por
   * cualquiera de los tres puede alguien abrir Ordenex enmarcado. Cuando la
   * llave vuelve, vuelve con el origen POR EL QUE ENTRÓ; reconociendo uno solo,
   * las otras dos respuestas se caían al piso sin decir nada y quedaba
   * «Entrando…» hasta que saltaba el aviso de los diez segundos.
   *
   * Sigue siendo una puerta cerrada, no una abierta: es una lista corta y
   * escrita a mano. Y la PREGUNTA no lleva ningún secreto —solo dice «soy
   * Ordenex, dame la llave»—, así que se le puede preguntar a las tres: el
   * navegador solo entrega el mensaje a la que de verdad está ahí. El secreto
   * viaja en la RESPUESTA, y esa sí se comprueba contra la lista. */
  const CASAS_MADRE = [...new Set([WALLET,
    'https://app.vetawallet.com',
    'https://main.d289v5ffkexk23.amplifyapp.com',
    'https://main.d264zjawew1yea.amplifyapp.com'])];

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

  /* El puente con la telemetría, igual que en la billetera. Va envuelto porque
     el reportero es OPCIONAL: si telemetria.js no se cargó, o su clave pública
     sigue en el marcador PENDIENTE, aquí no se nota nada. Una casa de cambio no
     puede romperse por culpa de su propia instrumentación, y menos en el gesto
     de colocar una orden. */
  const tele = (que, ...args) => {
    try { window.TELEMETRIA?.[que]?.(...args); } catch {}
  };

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
    VCOMPRA: () => typeof VCOMPRA === 'undefined' ? null : VCOMPRA,
    VVENTA: () => typeof VVENTA === 'undefined' ? null : VVENTA,
    VCONVERTIR: () => typeof VCONVERTIR === 'undefined' ? null : VCONVERTIR,
  };
  // Quién es dueño de cada vista: a su módulo van alPintar() y apagar().
  const DUENO = { mercados: 'VMERCADO', mercado: 'VMERCADO', portafolio: 'VPORTA', fiat: 'VFIAT',
                  comprar: 'VCOMPRA', vender: 'VVENTA', convertir: 'VCONVERTIR', actividad: 'VPORTA' };

  const stub = cual => `
    <div class="cab"><div><h2>${esc(t('nav.' + (cual === 'mercado' ? 'mercados' : cual)))}</h2></div></div>
    <div class="vidrio bloque"><div class="vacio"><b>${esc(t('stub.t'))}</b>${esc(t('stub.p'))}</div></div>`;

  const VISTAS = {
    mercados: () => modulos.VMERCADO()?.vistaMercados?.() ?? stub('mercados'),
    mercado: () => modulos.VMERCADO()?.vistaMercado?.(parAbierto) ?? stub('mercado'),
    portafolio: () => modulos.VPORTA()?.vista?.() ?? stub('portafolio'),
    fiat: () => modulos.VFIAT()?.vista?.() ?? stub('fiat'),
    comprar: () => modulos.VCOMPRA()?.vista?.() ?? stub('comprar'),
    vender: () => modulos.VVENTA()?.vista?.() ?? stub('vender'),
    convertir: () => modulos.VCONVERTIR()?.vista?.() ?? stub('convertir'),
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
    /* La navegación se cuenta AQUI y no en cada módulo: este es el único sitio
       por el que pasan todas las vistas, así que instrumentar aquí garantiza
       que ninguna sala quede sin contar cuando alguien añada la siguiente.

       El par va DENTRO del nombre —«mercado.AUKA-ORIGEN»— y no en meta, porque
       el explorador de analítica busca por texto en `nombre`, `mensaje` y
       `ruta`, y no mira meta: metido en meta, «qué mercados se miran» sería una
       pregunta que los datos tienen pero el panel no puede hacer. */
    tele('pantalla',
      cual === 'mercado' ? 'mercado.' + String(parAbierto || '?') : cual,
      rutaDe(cual, dato));
    // La pestaña encendida: mirar UN mercado sigue siendo estar en Mercados.
    const encendida = cual === 'mercado' ? 'mercados'
      : (cual === 'comprar' || cual === 'vender') ? 'convertir' : cual;
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
      // La portada se cuenta desde aquí porque no pasa por vista(): sin esto,
      // la pantalla que más gente ve —la puerta— sería la única invisible.
      tele('pantalla', 'portada', '#');
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
  // El cerrojo del aviso de feed caído: ver pintarVivos().
  let feedCaido = false;

  function arrancarVivos() {
    if (pararMercadosVivos) return;
    pararMercadosVivos = DATOS.sondeo(pintarVivos, 10000);
  }
  function pararVivos() {
    if (pararMercadosVivos) { pararMercadosVivos(); pararMercadosVivos = null; }
  }

  /* El mismo criterio que en la sala: sin trato, la REFERENCIA convertida a
     ORIGEN, marcada como tal. Es la division de dos precios medidos, no un
     numero inventado — y va con la palabra «ref» delante para que nunca se
     lea como una operacion. */
  function precioFila(m) {
    const u = deWei(m?.ultimo);
    if (u != null) return { txt: u, ref: false };
    const usd = Number(m?.referencia?.usd), gramin = Number(m?.referencia?.origenUsd);
    if (!Number.isFinite(usd) || !Number.isFinite(gramin) || usd <= 0 || gramin <= 0) {
      return { txt: null, ref: false };
    }
    const v = usd / gramin;
    return { txt: v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }), ref: true };
  }

  async function pintarVivos() {
    const cuerpo = $('#mv-cuerpo'), nota = $('#mv-nota');
    if (!cuerpo) return;
    let lista;
    try { lista = await DATOS.mercados(); } catch (e) {
      /* La portada sin precios es la peor cara que puede poner esta casa, y es
         invisible desde el servidor cuando el que falla es el servidor. Va como
         «aviso» y no como «error» porque no rompe nada —la tabla vieja se queda.

         Se cuenta UNA vez por caída, no una por sondeo: este reloj tira cada
         diez segundos y la telemetría manda los errores sin esperar al lote, así
         que sin el cerrojo una caída de una hora serían trescientas sesenta
         peticiones por pestaña abierta — la app tumbando al servidor que ya
         estaba caído. El cerrojo se abre solo cuando el feed vuelve. */
      if (!feedCaido) { feedCaido = true; tele('fallo', 'mercados.feed', e, { gravedad: 'aviso', ruta: '#' }); }
      /* Sin feed, guion — y la verdad en la nota. Si ya había precios
         pintados se dejan quietos: un dato viejo y honesto vale más que una
         tabla parpadeando a vacío por un tropiezo de red. */
      if (!vivosPintados) cuerpo.innerHTML = '';
      nota.textContent = t('pt.mvSinFeed');
      return;
    }
    feedCaido = false;
    nota.textContent = '';
    /* SOLO LOS PARES PUBLICADOS. El API devuelve los catorce mercados y esto
       los pintaba todos, con nueve filas de guiones y nombres rotos —«MNKA-
       ORIGEN / ORIGEN»— debajo de un titulo que dice «los cinco mercados». La
       vista de mercados si filtraba; la portada no. Un exchange que muestra
       nueve mesas vacias que no existen parece muerto, que es peor que
       parecer chico. */
    const publicados = (lista || []).filter(m => CADENA.PARES.includes(m.mercado));
    cuerpo.innerHTML = publicados.map(m => {
      const base = CADENA.baseDe(m.mercado) || m.mercado;
      const pf = precioFila(m);
      /* La referencia del API no es un wei: es un objeto { usd, rotulo, … }
         con el precio informativo en dolares. Pasarlo por deWei pintaba
         vacio — se enseña el usd rotulado, y si no vino, nada. */
      const ref = (m.referencia && m.referencia.usd != null)
        ? ('$' + Number(m.referencia.usd).toFixed(2)) : null;
      /* La fuente y la hora de la referencia viajan en el título de la celda:
         un precio marcado «ref» tiene que poder decir de dónde y de cuándo. */
      const fuenteRef = pf.ref && m.referencia
        ? `${m.referencia.rotulo || ''} · ${m.referencia.fuente || ''} · ${m.referencia.en ? new Date(m.referencia.en).toTimeString().slice(0, 5) : ''}`.trim()
        : '';
      const chg = m.cambio24h == null ? null : Number(m.cambio24h);
      const pill = chg == null ? '<span class="mv-sin">—</span>'
        : `<span class="pastilla ${chg < 0 ? 'baja-p' : 'sube-p'}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span>`;
      return `
        <tr onclick="ONX.abrirPar(${jsTxt(m.mercado)})">
          <td class="mv-par"><b>${esc(base)}</b><small>/ ORIGEN</small></td>
          <td class="mono mv-num${pf.ref ? ' esRef' : ''}" title="${esc(fuenteRef)}">${pf.txt == null ? '—' : esc(pf.txt)}
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
     Los mercados publicados pasando arriba del todo, siempre. La pista se pinta
     DOS veces y la animacion corre el 50%: asi el bucle vuelve a empezar sin
     costura, sin un temporizador y sin JS por cuadro.

     Los mercados sin precio pasan con GUION y no se esconden. Una cinta que
     solo enseña los que se movieron parece mas liquida de lo que es, y esa es
     justo la mentira que esta casa no dice. */
  function pintarCinta(lista) {
    const pista = $('#cinta-pista');
    if (!pista || !Array.isArray(lista) || !lista.length) return;
    // Los mismos cinco que la portada: la cinta desfilaba catorce, nueve de
    // ellos «— —» con nombre roto. Ver la nota en la tabla de mercados.
    const items = lista.filter((m) => CADENA.PARES.includes(m.mercado)).map((m) => {
      const base = CADENA.baseDe(m.mercado) || m.mercado;
      const pf = precioFila(m);
      const chg = m.cambio24h == null ? null : Number(m.cambio24h);
      const clase = chg == null ? 'nada' : chg < 0 ? 'baja' : 'sube';
      const txt = chg == null ? '—' : `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
      return `<button class="cinta-it" onclick="ONX.abrirPar(${jsTxt(m.mercado)})">
        <b>${esc(base)}</b><span class="p${pf.ref ? ' esRef' : ''}">${pf.txt == null ? '—' : esc(pf.txt)}</span>
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
    /* La IDA se cuenta aparte de la vuelta a propósito. Son dos eventos y no
       uno porque entre los dos hay una app distinta —la billetera— y todo lo
       que se pierda ahí solo se ve restando: cuántos pidieron la llave menos
       cuántos volvieron con ella. Con un solo evento al final, un SSO roto se
       lee como «nadie quiso entrar». Se vacía la cola antes de saltar: esta
       página se va a descargar en la línea siguiente. */
    tele('accion', 'sso.pedido');
    /* DENTRO DEL MARCO DE LA CASA MADRE NO SE VIAJA: SE PIDE.
     *
     * Mandar el marco a app.vetawallet.com es meter la wallet dentro de la
     * wallet — su CSP lo bloquea (con razón) y lo que queda es una página en
     * blanco. Estando adentro, la sesión ya existe del otro lado del cristal:
     * basta pedirla. La wallet acuña el token y lo devuelve por el mismo
     * canal, sin una sola recarga.
     *
     * Fuera del marco —alguien que llega a ordenexchange.link por su cuenta—
     * el viaje de siempre sigue siendo el correcto. */
    if (window.top !== window.self) {
      esperandoLlave = true;
      avisar(t('acc.entrando'));
      for (const casa of CASAS_MADRE) {
        try { parent.postMessage({ og: 'sso-pedido', app: 'ordenex' }, casa); }
        catch { /* la que no sea, sencillamente no recibe */ }
      }
      /* Si la casa madre no contesta en diez segundos, algo pasó del otro
         lado: se dice, en vez de dejar a alguien mirando «Entrando…». */
      setTimeout(() => {
        if (!esperandoLlave) return;
        esperandoLlave = false;
        avisar(t('acc.err'));
      }, 10000);
      return;
    }
    tele('vaciar');
    location.href = WALLET + '/#sso-ordenex';
  }

  /* LA LLAVE QUE LLEGA DE LA CASA MADRE. Puerta cerrada: solo se atiende a las
     direcciones de la wallet escritas arriba, y a ninguna otra. */
  let esperandoLlave = false;
  addEventListener('message', (ev) => {
    if (!CASAS_MADRE.includes(ev.origin) || !ev.data) return;
    if (ev.data.og === 'sso-token' && ev.data.token) {
      esperandoLlave = false;
      canjear(ev.data.token);
    } else if (ev.data.og === 'sso-no') {
      esperandoLlave = false;
      avisar(ev.data.motivo === 'sin-gid' ? t('acc.sinGid') : t('acc.err'));
    }
  });

  async function canjear(token) {
    avisar(t('acc.entrando'));
    try {
      await DATOS.sso(token);
      // El único modo de entrar que tiene Ordenex: no hay contraseñas propias,
      // así que «sesión» aquí es siempre esto.
      tele('sesion', 'sso.entrada');
      ir('app');
      avisar(t('acc.hola'));
    } catch (e) {
      /* Un canje fallido es la puerta cerrada en la cara con la llave en la
         mano, y es invisible desde el backend de Ordenex cuando el fallo fue de
         red. Se cuenta como error y con su código, que es lo que distingue «el
         token venció» de «el servidor no contesta». */
      tele('fallo', 'sso.canje', e, { meta: { codigo: e?.codigo || 'DESCONOCIDO' } });
      // Fail-closed: sin canje no hay sesión a medias — DATOS no guardó nada.
      avisar(e?.codigo === 'SESION_VENCIDA' ? t('acc.vencida') : t('acc.mal'));
    }
  }

  function salir() {
    // Se anota y se manda en el acto: quien cierra sesión suele cerrar también
    // la pestaña, y el lote de dentro de diez segundos no llegaría a salir.
    tele('accion', 'sesion.salir');
    tele('vaciar');
    DATOS.salir();
    vistaActual = 'mercados';
    parAbierto = null;
    history.replaceState(null, '', location.pathname + location.search);
    ir('portada');
    avisar(t('tost.chau'));
  }

  /* ── los términos y el aviso de riesgo, antes de la primera operación ─────
     La sala de mercado los pide dentro de su confirmación (mercado.js); el
     circuito fiat, y cualquier otra sala que un día abra una operación, los
     pide por acá. Se acepta UNA vez por versión del texto: la versión vigente
     la dice GET /limites y la aceptación la guarda POST /auth/terminos.
     Fail-closed: sin versión leída no se acepta nada, y quien llamó no sigue.

     `alAceptar` se llama SOLO después de que el servidor confirmó la
     aceptación: es lo que deja reintentar la operación que el API frenó con
     TERMINOS_NO_ACEPTADOS. */
  async function pedirTerminos(alAceptar) {
    let lim = null;
    try { lim = await DATOS.limites(); } catch { lim = null; }
    const version = lim?.terminos?.version;
    if (!version) { avisar(t('term.no')); return; }
    const rutas = lim.terminos || {};
    const a = (ruta, txt) => `<a href="${esc(ruta || 'legal.html')}" target="_blank" rel="noopener">${esc(txt)}</a>`;
    const casilla = esc(t('term.check'))
      .replace('{terminos}', a(rutas.terminos, t('term.terminos')))
      .replace('{riesgo}', a(rutas.riesgo, t('term.riesgo')));
    document.getElementById('onx-terminos')?.remove();
    document.body.insertAdjacentHTML('beforeend', `
      <div class="cf-velo" id="onx-terminos" role="dialog" aria-modal="true" aria-labelledby="onx-term-t">
        <div class="cf-caja vidrio">
          <h3 id="onx-term-t">${esc(t('term.t'))}</h3>
          <p>${esc(t('term.p'))}</p>
          <label class="cf-check"><input type="checkbox" id="onx-term-check"><span>${casilla}</span></label>
          <p class="cf-aviso" id="onx-term-aviso" aria-live="polite"></p>
          <div class="cf-botones">
            <button class="btn btn-linea btn-sm" id="onx-term-no">${esc(t('term.volver'))}</button>
            <button class="btn btn-oro btn-sm" id="onx-term-ok" disabled>${esc(t('term.ok'))}</button>
          </div>
        </div>
      </div>`);
    const caja = document.getElementById('onx-terminos');
    const check = document.getElementById('onx-term-check');
    const ok = document.getElementById('onx-term-ok');
    check.addEventListener('change', () => { ok.disabled = !check.checked; });
    document.getElementById('onx-term-no').addEventListener('click', () => caja.remove());
    ok.addEventListener('click', async () => {
      if (!check.checked) return;      // la puerta no se abre desde la consola
      ok.disabled = true;
      try {
        await DATOS.aceptarTerminos(version);
        tele('accion', 'terminos.aceptados', { meta: { version } });
        caja.remove();
        if (typeof alAceptar === 'function') alAceptar();
      } catch (e) {
        document.getElementById('onx-term-aviso').textContent = e?.message || t('term.err');
        ok.disabled = false;
      }
    });
    tele('pantalla', 'terminos', location.hash || '#');
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

  /* ── EL SELLO DE ESTA COPIA ───────────────────────────────────────────────
   *
   * Lo escribe subir.py en el momento de publicar, a partir del contenido de
   * todos los archivos: mismo contenido, mismo sello. Así que si dos personas
   * leen el mismo sello, están viendo exactamente lo mismo, y si uno lee el
   * de ayer, el navegador le está sirviendo una copia guardada.
   *
   * Existe por una discusión que se repetía: un arreglo publicado y alguien
   * que sigue viendo el fallo. Sin este dato no había manera de distinguir
   * «no se arregló» de «no te llegó», y se buscaba dos horas en el lugar
   * equivocado. */
  const ONX_V = 'ae8ebe28de';
  const ONX_FECHA = '2026-09-05';

  function sellar() {
    const el = document.getElementById('onx-sello');
    if (!el) return;
    el.textContent = `v ${ONX_V}`;
    el.title = `Publicado ${ONX_FECHA}`;
  }

  // ── el arranque ───────────────────────────────────────────────────────────

  function arrancar() {
    /* Se enciende la telemetría ANTES que nada, para que un fallo del propio
       arranque también se vea: es justo el que deja la pantalla en blanco y el
       que nadie reporta. Sin clave puesta esto no hace absolutamente nada — ni
       cola, ni peticiones. */
    tele('iniciar', {});
    /* La apertura se cuenta aquí y no en el primer ir(): es la única señal que
       no depende de a dónde vaya después la persona —portada, ruta directa o
       vuelta del SSO—, y sin ella «cuánta gente abrió Ordenex hoy» habría que
       deducirlo sumando pantallas, que cuenta de más. */
    tele('sesion', 'app.abierta');
    pintarIdioma();
    sellar();

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
  return { entrar, salir, idioma, ir, vista, abrirPar, avisar, pedirTerminos, esc, jsTxt, deWei, aWei };
})();
