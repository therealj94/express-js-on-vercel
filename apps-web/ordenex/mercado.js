/* Ordenex · la sala de trading — VMERCADO.
 *
 * Las dos vistas del mercado: la lista de los catorce pares y la pantalla de
 * un mercado abierto (velas, libro, tratos, formulario y mis órdenes). Este
 * módulo pinta y sondea; el dinero le llega y le sale como STRING DE WEI y
 * las cuentas se hacen con BigInt — ni un Number toca un monto, porque un
 * double de 18 decimales pierde exactamente los dígitos que a alguien le
 * importan.
 *
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
  const MARCOS = ['1m', '15m', '1h', '1d'];

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
      'sinVelas': 'Todavía no hay velas en este marco: las velas solo pintan tratos reales.',
      'velasNo': 'No pudimos traer las velas. Se reintenta solo.',
      'velasSin': 'La gráfica no está instalada en esta versión. Los datos del mercado siguen abajo.',

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

      'sinVelas': 'No candles in this timeframe yet: candles are drawn only from real trades.',
      'velasNo': 'We couldn’t fetch the candles. It retries on its own.',
      'velasSin': 'The chart is not installed in this build. The market data continues below.',

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

  // ── el estado de la sala ──────────────────────────────────────────────────

  let paradores = [];        // cada sondeo devuelve su parador; apagar() los corre todos
  let alResize = null;
  let parActual = null;      // 'AUKA-ORIGEN'
  let marcoActual = '1h';
  let ladoActual = 'compra';
  let tipoActual = 'limite';
  let mercadosCache = null;  // la última lista buena — un dato viejo y honesto vale más que un parpadeo a vacío
  let libroCache = null;     // el último libro bueno DEL PAR ABIERTO; se tira al cambiar de par
  let velasCache = null;
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
    .vm-cifras{text-align:right}
    .vm-ultimo{font-size:clamp(20px,2.4vw,26px);font-weight:700;
      font-variant-numeric:lining-nums tabular-nums}

    .vm-rejilla{display:grid;grid-template-columns:minmax(0,1fr) 318px;gap:22px;align-items:start;margin-top:22px}
    @media (max-width:1100px){.vm-rejilla{grid-template-columns:1fr}}

    .vm-marcos{display:flex;border:1px solid var(--linea2);border-radius:100px;overflow:hidden;
      width:max-content;background:rgba(2,22,23,.55)}
    .vm-marcos button{padding:7px 15px;font-size:12px;font-weight:700;font-family:var(--mono);
      color:var(--humo);transition:.2s}
    .vm-marcos button[aria-pressed=true]{background:rgba(201,169,97,.16);color:var(--oroHi)}
    .vm-lienzo{position:relative;margin-top:16px}
    .vm-lienzo canvas{display:block;width:100%;height:340px;border-radius:12px}
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
      const ref = deWei(m.referencia, 4);
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
    const ficha = CADENA.ficha(sim, idi());
    return `${ESTILO}
    <div class="cab">
      <div>
        <button class="vm-volver" onclick="ONX.vista('mercados')">←&nbsp;${esc(tx('volver'))}</button>
        <h2 class="vm-tit">${icono(sim)} ${esc(sim)} <small>/ ORIGEN</small></h2>
        ${ficha ? `<div class="sub">${esc(ficha.t)} · ${esc(ficha.r)}</div>` : ''}
      </div>
      <div class="vm-cifras">
        <div class="vm-ultimo mono" id="vm-ultimo">—</div>
        <div id="vm-cambio"></div>
        <div class="vm-refchica" id="vm-ref"></div>
      </div>
    </div>
    <div class="vm-rejilla">
      <div>
        <div class="vidrio bloque">
          <div class="vm-marcos" role="group" aria-label="Marco">
            ${MARCOS.map(m => `<button data-marco="${m}" aria-pressed="${String(m === marcoActual)}"
              onclick="VMERCADO.marco(${jsTxt(m)})">${m}</button>`).join('')}
          </div>
          <div class="vm-lienzo">
            <canvas id="vm-velas"></canvas>
            <div class="vm-nota" id="vm-velas-nota"></div>
          </div>
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
          <h3>${esc(tx('tratos'))}</h3>
          <div id="vm-tratos"><div class="vm-vacio">—</div></div>
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
    const r = deWei(m.referencia, 4);
    // La referencia SIEMPRE con su rótulo: es un dato del feed, no un trato.
    if (ref) ref.textContent = r == null ? '' : `${tx('refRot')}: ${r} ORIGEN`;
    if (medio) medio.innerHTML = `${u == null ? '—' : esc(u)} <small>ORIGEN</small>`;
    pintarVelas(); // la línea de referencia de la gráfica sale de este dato
  }

  // ── las velas ─────────────────────────────────────────────────────────────

  function marco(m) {
    if (!MARCOS.includes(m) || m === marcoActual) return;
    marcoActual = m;
    document.querySelectorAll('.vm-marcos button').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.marco === m)));
    velasCache = null;   // las velas de un marco no dibujan otro
    cargarVelas();
  }

  async function cargarVelas() {
    let v;
    try { v = await DATOS.velas(parActual, marcoActual); } catch {
      if (!velasCache) notaVelas(tx('velasNo'));
      return;
    }
    velasCache = Array.isArray(v) ? v : [];
    pintarVelas();
  }

  function notaVelas(txt) {
    const n = $('vm-velas-nota');
    if (n) n.textContent = txt || '';
  }

  /* El canvas se dimensiona acá, a píxeles físicos, antes de cada dibujo: un
     canvas sin medidas dibuja borroso en pantallas densas, y VELAS recibe el
     lienzo listo para no repetir esa cuenta en cada módulo que la use. */
  function pintarVelas() {
    const c = $('vm-velas');
    if (!c) return;
    if (typeof VELAS === 'undefined') { notaVelas(tx('velasSin')); return; }
    if (!velasCache) return;               // aún sin respuesta: ni nota ni dibujo en falso
    if (!velasCache.length) { notaVelas(tx('sinVelas')); }
    else notaVelas('');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ancho = c.parentElement ? c.parentElement.clientWidth : 600;
    c.width = Math.max(1, Math.round(ancho * dpr));
    c.height = Math.round(340 * dpr);
    const m = (mercadosCache || []).find(x => x.mercado === parActual);
    try {
      VELAS.dibujar(c, velasCache, {
        marco: marcoActual,
        dpr,
        idioma: idi(),
        referencia: m?.referencia ?? null,
        rotulo: tx('refRot'),
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
    // Esta pantalla es UN mercado: se enseñan las órdenes de este par. Las
    // demás viven en la actividad del portafolio, cada una en su casa.
    const mias = (Array.isArray(ordenesCache) ? ordenesCache : []).filter(o => o.mercado === parActual);
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
      libroCache = null; tratosCache = null; velasCache = null; ordenesCache = null;
    }
    parActual = parNuevo;
    ordenKeyViva = null;
    if (!CADENA.baseDe(parActual)) return; // la vista ya dijo que el par no existe

    // Los relojes del contrato: libro y tratos cada 5 s, velas cada 30 s, la
    // cabecera con el reloj de mercados (10 s). Todos visible-only vía
    // DATOS.sondeo, y todos disparan una primera vez al arrancar.
    paradores.push(DATOS.sondeo(cargarLibro, 5000));
    paradores.push(DATOS.sondeo(cargarTratos, 5000));
    paradores.push(DATOS.sondeo(cargarVelas, 30000));
    paradores.push(DATOS.sondeo(cargarCab, 10000));

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
    if (alResize) { removeEventListener('resize', alResize); alResize = null; }
  }

  return {
    vistaMercados, vistaMercado, alPintar, apagar,
    marco, lado, tipo, usarPrecio, recalcular, maximo, colocar, quitar,
    // Para las pruebas, como _piezas en qr.js: los textos y las cuentas puras.
    _txt: () => TXT,
    _puros: { texto, notionalDe, costoDeMercado: c => costoDeMercado(c), validar: () => validar() },
  };
})();
