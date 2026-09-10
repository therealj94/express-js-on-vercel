/* ULTRON OS · la lógica del sistema operativo.
 *
 * Une cuatro cosas que ya existían por separado y una que no:
 *
 *   · DATOS   — las lecturas del servidor (ya estaba)
 *   · VOZ     — decir y escuchar (ya estaba)
 *   · BOCA    — la envolvente del audio de verdad (nueva)
 *   · HOLO    — el busto en tres dimensiones (del diseño de José)
 *   · y esto  — el tablero, los archivos y la palabra que despierta
 *
 * LA REGLA DEL TABLERO: cada cifra sale de una lectura. Mientras no llega, el
 * hueco dice «—». En un tablero, un número inventado es peor que un hueco —el
 * hueco se nota, el número se cree.
 */
const OS = (() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ── EL ESTADO QUE VE EL BUSTO ─────────────────────────────────────────────
     El motor 3D lee este objeto sesenta veces por segundo con `get()`. No se
     le manda nada: él viene a mirar. Así el busto nunca bloquea la consola ni
     al revés. */
  const mente = { state: 'idle', mood: 'neutral', nivel: 0, cerca: 0, speech: null, mouse: { x: 0, y: 0 } };
  window.__ULTRON_MENTE = () => mente;

  const COLORES = { idle: '#05E1FF', listen: '#5CF2B0', think: '#FFB648', speak: '#05E1FF', error: '#FF5A6E' };
  /* «Que aparezca te estoy escuchando». En primera persona y con todas las
     letras: «ESCUCHANDO» a secas es una etiqueta de estado y se lee como un
     rótulo de máquina; «LE ESTOY ESCUCHANDO» es alguien diciéndoselo. */
  const ROTULOS = { idle: 'EN LÍNEA', listen: 'LE ESTOY ESCUCHANDO', think: 'ANALIZANDO', speak: 'HABLANDO', error: 'FALLO' };

  function estado(st, mood) {
    mente.state = st;
    if (mood !== undefined) mente.mood = mood;
    /* El botón de hablar dice si está escuchando, para quien lo ve y para
       quien lo oye: `aria-pressed` es lo que un lector de pantalla anuncia. */
    const bh = $('#hablar');
    if (bh) bh.setAttribute('aria-pressed', String(st === 'listen'));
    document.body.classList.toggle('escuchando', st === 'listen');
    const c = COLORES[st] || COLORES.idle;
    const luz = $('#estado .luz');
    if (luz) { luz.style.background = c; luz.style.boxShadow = `0 0 8px ${c}`; }
    $('#estado').style.color = c;
    $('#estado-txt').textContent = ROTULOS[st] || st.toUpperCase();
    $('#onda-estado').textContent = ROTULOS[st] || '';
    $('#onda-estado').style.color = c;
  }

  let avisoT = null;
  function avisar(txt, mal = false) {
    let a = $('#aviso');
    if (!a) { a = document.createElement('div'); a.id = 'aviso'; document.body.appendChild(a); }
    a.textContent = txt; a.classList.toggle('mal', !!mal);
    // El mismo aviso, para quien no lo ve: los avisos se creaban y se destruían
    // sin `role`, así que ningún lector de pantalla los anunciaba.
    const vv = $('#aviso-vivo'); if (vv) vv.textContent = txt;
    clearTimeout(avisoT); avisoT = setTimeout(() => a.remove(), mal ? 6500 : 3800);
  }

  // ══ EL TABLERO ════════════════════════════════════════════════════════════

  const nada = '—';
  const num = (n, d = 0) => (typeof n === 'number' && isFinite(n) ? n.toLocaleString('es-HN', { minimumFractionDigits: d, maximumFractionDigits: d }) : nada);

  /* Las casas del ecosistema. El orden es el del muelle y el de la lista: el
     mismo de siempre, para que se reconozcan por sitio antes que por nombre. */
  const CASAS = [
    { k: 'ordenex', ic: 'OX', nb: 'ORDENEX', url: 'https://ordenexchange.link/' },
    { k: 'aucorp', ic: 'AU', nb: 'AUCORP', url: 'https://main.d2e55u6ls6v9xt.amplifyapp.com/banca/' },
    { k: 'wallet', ic: 'VW', nb: 'VETA WALLET', url: 'https://app.vetawallet.com/' },
    { k: 'genesis', ic: 'GID', nb: 'GENESIS ID', url: 'https://genesis-id.onrender.com/' },
    { k: 'ordenscan', ic: 'SC', nb: 'ORDENSCAN', url: 'https://ordenscan.com/' },
    { k: 'ordenglobal', ic: 'OG', nb: 'ORDEN GLOBAL', url: 'https://ordenglobal.org/' },
  ];

  let ultimoVivo = null;

  function pintarMuelle() {
    $('#muelle').innerHTML = CASAS.map((c) => {
      const v = ultimoVivo?.[c.k];
      const cl = v == null ? '' : v.vivo ? 'viva' : 'caida';
      return `<button class="casa ${cl}" data-url="${esc(c.url)}" title="${esc(c.nb)}">
        <span class="ic">${esc(c.ic)}</span><span class="nb">${esc(c.nb)}</span></button>`;
    }).join('');
  }

  /* ── TRES ESTADOS, NO DOS ───────────────────────────────────────────────────
     «Está bien», «está mal» y «NO LO SÉ» son tres cosas distintas y el tablero
     tiene que distinguirlas. Antes no lo hacía: en INTEGRIDAD, con AuCorp sin
     contestar, SANCIONES salía en VERDE (porque `vencidas` era `undefined`, o
     sea falso) y TASAS FIAT en ROJO. Tres ausencias, tres colores, ninguno
     cierto. Un dato que no se leyó no se colorea nunca: va en gris y dice que
     no se leyó. */
  const SI = 'ok', NO = 'mal', NOSE = 'hueco';
  const fila = (rotulo, valor, clase = '') =>
    `<div class="fila"><span>${esc(rotulo)}</span><span class="${clase}">${esc(valor)}</span></div>`;

  /* «hace 12 s» dice más que «03:41»: la pregunta de un tablero no es qué hora
     era, es si esto es de ahora. */
  const hace = (iso) => {
    if (!iso) return null;
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    return s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.round(s / 60)} min` : `hace ${Math.round(s / 3600)} h`;
  };

  /* ══ EL NEGOCIO ═══════════════════════════════════════════════════════════
   * «Agregar Dashboard y todo el ecosistema.»
   *
   * El tablero tenía once paneles y ninguno de negocio: se veía si cada casa
   * CONTESTA, no a cuánto está el ORIGEN, si la puerta del dinero está abierta,
   * a qué precio se puede vender hoy ni si las listas de cumplimiento están al
   * día. Un tablero de junta que no enseña una cifra de negocio es un panel de
   * sistemas.
   *
   * Ni una cifra de aquí es nueva: TODAS venían ya en `/vivo` y se tiraban.
   * Y ninguna se inventa: lo que no se leyó dice «—», como en todo el tablero.
   */
  function pintarNegocio(v) {
    const caja = $('#negocio'); if (!caja) return;
    const filas = [];
    const fila = (q, val, clase = '') => filas.push(`<div class="fila"><span>${esc(q)}</span><span class="${clase}">${esc(val)}</span></div>`);
    const titulo = (t) => filas.push(`<div class="caja-tit">${esc(t)}</div>`);

    titulo('EL ORIGEN');
    /* Seis decimales: el ORIGEN vale unos dos dólares y medio, y con dos
       decimales las diferencias que importan no se ven. */
    fila('PRECIO', v?.origen?.origenUsd ? `${v.origen.origenUsd.toFixed(6)} USD` : nada, v?.origen ? SI : NOSE);
    fila('ONZA DE ORO', v?.origen?.oroOnzaUsd ? `${num(v.origen.oroOnzaUsd, 2)} USD` : nada, v?.origen?.oroOnzaUsd ? '' : NOSE);
    fila('REFERENCIA', v?.origen?.fuente || nada, v?.origen?.fuente ? '' : NOSE);

    titulo('LA PUERTA DEL DINERO');
    /* La compra con USDT cerrada es lo primero que hay que saber antes de
       decirle a nadie que mande dinero. */
    const cu = v?.ordenex?.compraUsdt;
    fila('COMPRA CON USDT', cu ? cu.toUpperCase() : nada, cu === 'abierta' ? SI : cu ? NO : NOSE);
    fila('CADENA DE ORDENEX', v?.ordenex?.cadena === true ? 'CONECTADA' : v?.ordenex?.cadena === false ? 'SIN CADENA' : nada,
      v?.ordenex?.cadena === true ? SI : v?.ordenex?.cadena === false ? NO : NOSE);

    /* A QUÉ PRECIO SE PUEDE VENDER HOY. Los pares de la casa todavía no tienen
       operaciones —`ultimo` es nulo de verdad, no es un fallo de lectura— así
       que lo que contesta esa pregunta es la mejor oferta puesta y la
       referencia en ORIGEN. */
    const mercados = v?.ordenex?.mercados || [];
    if (mercados.length) {
      titulo('LOS MERCADOS · en ORIGEN');
      for (const m of mercados.slice(0, 6)) {
        /* El nombre va SIN el «-ORIGEN»: todos los pares se cotizan en ORIGEN y
           ya lo dice el título. Con el par entero, el renglón no cabía en el
           panel y la cifra de referencia se cortaba a media palabra. */
        const base = String(m.mercado || '').split('-')[0] || m.mercado;
        fila(base, m.mejorVenta ? `piden ${num(m.mejorVenta, 2)}` : 'sin oferta', m.mejorVenta ? '' : NOSE);
        if (m.enOrigen) filas.push(`<div class="sub" style="margin-top:-2px;padding-left:10px">vale ${esc(num(m.enOrigen, 2))} de referencia</div>`);
      }
    }

    titulo('CUMPLIMIENTO');
    const sa = v?.aucorp?.sanciones;
    fila('LISTAS DE SANCIONES', sa?.registros ? `${num(sa.registros)} del ${sa.fechaDescarga || '?'}` : nada,
      !sa ? NOSE : sa.vencidas ? NO : SI);
    fila('TASAS FIAT', v?.aucorp?.tasas === true ? `al día${v.aucorp.tasasCuando ? ' · ' + String(v.aucorp.tasasCuando).slice(0, 10) : ''}` : v?.aucorp?.tasas === false ? 'SIN CARGAR' : nada,
      v?.aucorp?.tasas === true ? SI : v?.aucorp?.tasas === false ? NO : NOSE);
    /* Genesis dice en su /healthz qué le falta para estar en regla. Se leía y
       se tiraba: es la casa de la IDENTIDAD de la gente. */
    const g = v?.genesis;
    fila('GENESIS ID', g?.enRegla === true ? 'EN REGLA' : g?.enRegla === false ? `${g.leFalta?.length || 0} cosa${(g.leFalta?.length || 0) === 1 ? '' : 's'} por resolver` : nada,
      g?.enRegla === true ? SI : g?.enRegla === false ? 'amb' : NOSE);
    for (const f of (g?.leFalta || []).slice(0, 3)) {
      filas.push(`<div class="sub" style="padding-left:10px;line-height:1.35">· ${esc(f)}</div>`);
    }

    caja.innerHTML = filas.join('');
    const abierta = cu === 'abierta';
    $('#neg-sub').textContent = v?.origen
      ? `ORIGEN ${v.origen.origenUsd.toFixed(4)} USD · compra ${cu || '?'}`
      : 'sin lectura del precio';
    $('#neg-sub').className = 'sub ' + (!v ? 'mal' : abierta ? 'ok' : 'amb');
  }

  function pintarVivo(v) {
    ultimoVivo = v;
    pintarNegocio(v);
    /* ── el techo: la altura de la cadena ────────────────────────────────────
       UNA cadena, dos lectores. Ordenex y OrdenScan leen los dos la 5550; el
       tablero llegó a rotularlos «5550» y «8532» como si fueran dos cadenas, y
       José confirmó que no: la 8532 es la vieja, congelada. Si los dos lectores
       se separan, eso es un dato de salud —el explorador se quedó atrás— y sale
       abajo, en INTEGRIDAD. */
    const bOx = v?.ordenex?.bloque5550, bSc = v?.ordenscan?.bloqueScan;
    const bloque = bOx ?? bSc;
    $('#m-bloque').textContent = `CADENA 5550 · ${bloque ? '#' + num(bloque) : nada}`;
    /* La media de latencia SOLO sobre las casas que contestaron. Antes entraban
       también los ceros de las fallidas, así que con el ecosistema entero caído
       el techo publicaba «RPC 0 ms» — el mejor número posible en el peor momento
       posible, que es justo el «número plausible» que este archivo jura no
       imprimir. */
    const ms = CASAS.map((c) => v?.[c.k]).filter((d) => d?.vivo && d.ms > 0).map((d) => d.ms);
    $('#m-rpc').textContent = ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : nada;
    $('#m-oro').textContent = v?.origen?.oroOnzaUsd ? `${num(v.origen.oroOnzaUsd, 0)} USD/oz` : nada;

    /* ── el ecosistema, casa por casa ────────────────────────────────────────
       Con el DESDE CUÁNDO, que es lo que convierte «está caída» en una
       decisión: a las ocho de la mañana, «ORDENEX CAÍDA» no dice si lleva dos
       minutos o nueve horas, y esa es exactamente la diferencia entre avisar al
       equipo y avisar a los clientes. Lo recuerda el vigía del servidor, que
       mide cada minuto aunque no haya nadie mirando la pantalla. */
    const vg = v?.vigia?.casas || {};
    const filas = CASAS.map((c) => {
      const d = v?.[c.k];
      if (!d) return fila(c.nb, nada, NOSE);
      if (d.vivo) return fila(c.nb, `${d.ms} ms`, SI);
      const g = vg[c.k];
      const cuanto = g && g.viva === false && g.desde ? ` · ${hace(g.desde)}` : '';
      return fila(c.nb, (d.http ? `HTTP ${d.http}` : 'CAÍDA') + cuanto, NO);
    });
    /* El precio del ORIGEN se ENSEÑA SIEMPRE, con «—» cuando no se leyó. Antes
       la fila desaparecía si no había precio: la ausencia del dato más mirado
       de la casa era invisible, y una ausencia invisible se lee como que no
       hacía falta. */
    filas.push(v?.origen?.origenUsd
      ? fila('ORIGEN', `${num(v.origen.origenUsd, 4)} USD`, 'on')
      : fila('ORIGEN', 'sin referencia', NOSE));
    $('#eco').innerHTML = filas.join('');
    const vivas = CASAS.filter((c) => v?.[c.k]?.vivo).length;
    const faltan = CASAS.length - vivas;
    $('#eco-sub').textContent = `${vivas} de ${CASAS.length} en pie · ${hace(v?.leidoEn) || nada}`;
    $('#nervio-estado').textContent = faltan === 0 ? 'Estado: SINCRONIZADO' : `Estado: ${faltan} SIN RESPUESTA`;

    /* Una sola afirmación grande. El mismo hecho estaba escrito en cinco sitios
       a diez píxeles cada uno, y cinco susurros no son un grito: el ojo los
       trata como fondo. La franja del techo se tiñe cuando falta alguna, que se
       ve desde el otro lado de la sala. */
    document.body.classList.toggle('alerta', faltan > 0);

    // ── integridad: solo lo que no está ya escrito arriba
    const ox = v?.ordenex, auc = v?.aucorp, g = v?.vigia;
    const int = [
      ['CASAS EN PIE', `${vivas} / ${CASAS.length}`, faltan === 0 ? SI : NO],
      /* «cerrada» es una decisión de la casa; «no leído» es que no sabemos.
         Pintarlas del mismo rojo enseña a no mirar el rojo. */
      ['COMPRA USDT', ox?.compraUsdt ? String(ox.compraUsdt).toUpperCase() : 'NO LEÍDO',
        !ox?.compraUsdt ? NOSE : ox.compraUsdt === 'abierta' ? SI : 'amb'],
      ['BASE DE ORDENEX', ox?.mongo == null ? 'NO LEÍDO' : ox.mongo ? 'CONECTADA' : 'CAÍDA',
        ox?.mongo == null ? NOSE : ox.mongo ? SI : NO],
      ['SANCIONES', auc?.sanciones?.registros ? num(auc.sanciones.registros) : 'NO LEÍDO',
        !auc?.sanciones ? NOSE : auc.sanciones.vencidas ? NO : SI],
      ['TASAS FIAT', auc?.tasas == null ? 'NO LEÍDO' : auc.tasas ? 'AL DÍA' : 'SIN ACTUALIZAR',
        auc?.tasas == null ? NOSE : auc.tasas ? SI : NO],
      /* El explorador contra la cadena. Los dos leen la misma altura; si se
         separan, OrdenScan se quedó atrás indexando y la web va a enseñar
         bloques viejos. Es la clase de avería que no tumba nada y se nota
         tarde: aquí sale antes de que la note un cliente. */
      ['ORDENSCAN AL DÍA', (bOx == null || bSc == null) ? 'NO LEÍDO'
        : Math.abs(bOx - bSc) <= 5 ? 'SÍ' : `${num(Math.abs(bOx - bSc))} bloques atrás`,
      (bOx == null || bSc == null) ? NOSE : Math.abs(bOx - bSc) <= 5 ? SI : 'amb'],
      /* Si hay alguien mirando cuando la pantalla está apagada. Un tablero que
         solo mide mientras se le mira no vigila nada, y esta es la fila que
         contesta «¿me voy a enterar a las tres de la mañana?». */
      ['VIGÍA', !g ? nada : !g.encendido ? 'APAGADO'
        : g.avisa === 'apagado' ? `cada ${Math.round(g.cada / 1000)} s · sin avisos`
          : `cada ${Math.round(g.cada / 1000)} s · avisa por ${g.avisa}`,
      !g?.encendido ? NOSE : g.avisa === 'apagado' ? 'amb' : SI],
    ];
    $('#integridad').innerHTML = int.map(([a, b, cl]) => fila(a, b, cl)).join('');
    $('#integridad-tag').textContent = faltan === 0 ? 'todas las casas contestan'
      : faltan === 1 ? 'hay una casa sin contestar' : `hay ${faltan} casas sin contestar`;

    // ── el mercado: lo primero que mira quien dirige una casa de cambio
    pintarMercado(v);
    pintarMuelle();
  }

  /* EL MERCADO. `/vivo` ya traía `ordenex.mercados[]` con último precio,
     volumen de 24 h y si el par tiene referencia — y el tablero no lo tocaba.
     La casa de cambio no tenía ni una cifra de negocio en su propio tablero:
     había que preguntárselo a ULTRON en prosa. */
  function pintarMercado(v) {
    const caja = $('#mercado'); if (!caja) return;
    const ms = v?.ordenex?.mercados || [];
    const o = v?.origen;
    $('#mercado-sub').textContent = o?.leidoEn ? `referencia ${hace(o.leidoEn) || ''}`.trim()
      : ms.length ? `${ms.length} par${ms.length > 1 ? 'es' : ''}` : 'sin lectura';
    /* Sin precio NO se pinta un «—» enorme: un hueco del tamaño de una cifra
       ocupa el sitio de la cifra y no dice por qué falta. Se dice por qué. */
    const cab = o?.origenUsd
      ? `<div class="grande"><b>${num(o.origenUsd, 4)}</b><span>USD por ORIGEN · oro ${o.oroOnzaUsd ? num(o.oroOnzaUsd, 0) + ' USD/oz' : nada}</span></div>`
      : `<div class="grande"><span class="hueco">Sin referencia de precio en esta lectura.</span></div>`;
    /* Un par SIN OPERACIONES no se pinta con rayas: se dice que no ha operado y
       se enseña lo que sí existe —a cuánto se está ofreciendo, o cuánto vale su
       referencia en ORIGEN—, que es lo que de verdad contesta «¿a qué precio se
       puede vender hoy?». Rayas donde hay dato es esconderlo. */
    const linea = (m) => {
      if (m.ultimo != null) return [`${num(m.ultimo, 4)}${Number(m.vol24h) > 0 ? ' · vol ' + num(m.vol24h, 0) : ''}`, ''];
      if (m.mejorVenta) return [`en venta desde ${num(m.mejorVenta, 2)}`, 'on'];
      if (m.enOrigen) return [`ref. ${num(m.enOrigen, 2)} ORIGEN`, NOSE];
      return ['sin operar', NOSE];
    };
    caja.innerHTML = cab + ms.slice(0, 6).map((m) => fila(m.mercado, ...linea(m))).join('');
  }

  /* EL CEREBRO QUE ESTÁ EN USO, no el que no se está usando.
     `/salud` solo calcula `nodo` cuando ULTRON piensa CON el nodo propio; con
     un modelo en la nube devuelve `nodo:null`. El panel leía ese nulo y
     escribía «MOTOR · SIN RESPUESTA» de forma permanente, en una pantalla donde
     ULTRON acababa de contestar tres párrafos. Se diagnosticaba un cerebro
     caído que no lo estaba — y el día que el nodo propio se cayera de verdad,
     el panel habría dicho exactamente lo mismo que decía ayer.
     Las líneas del nodo (motor, pedidos, contexto) solo tienen sentido si se
     está pensando con el nodo. Si no, se ocultan en vez de mentir. */
  /* ── ¿HAY UNA VERSIÓN NUEVA? ──────────────────────────────────────────────
     José preguntaba lo que no se podía contestar: «¿se actualizó?». Una
     pantalla abierta desde ayer se ve idéntica a una recién cargada, y quien la
     mira no tiene manera de saber cuál está viendo.
     El servidor dice su versión en /salud; aquí se recuerda la primera que se
     vio y, si cambia, aparece una barra con un botón. NO se recarga solo: se
     recarga cuando la persona quiere, que puede estar a mitad de una respuesta
     o con algo escrito sin enviar. */
  let VERSION_VISTA = null;
  function mirarVersion(s) {
    const v = s?.version;
    if (!v || v === 'taller') return;
    if (!VERSION_VISTA) { VERSION_VISTA = v; return; }
    if (v === VERSION_VISTA || $('#hay-version')) return;
    const b = document.createElement('div');
    b.id = 'hay-version'; b.setAttribute('role', 'status');
    b.innerHTML = `<span>Hay una versión nueva de ULTRON (${esc(v)}).</span><button class="chip">RECARGAR</button>`;
    b.querySelector('button').onclick = () => location.reload();
    document.body.appendChild(b);
  }

  /* Lo último que se leyó de /gasto y lo que tardó el último turno. Viven aquí
     arriba porque los pinta el panel del cerebro y los llena otra cosa: el
     gasto lo trae su propia lectura, y el cronómetro llega en el `fin` de cada
     turno. */
  let gastoUltimo = null, ultimoTurno = null, saludUltima = null;

  function pintarSalud(s) {
    saludUltima = s || saludUltima;
    mirarVersion(s);
    const n = s?.nodo || null;
    const enNodo = s?.donde === 'nodo';
    $('#nodo-modelo').textContent = s?.modelo || nada;
    $('#cerebro-donde').textContent = !s ? nada
      : enNodo ? 'en el nodo propio' : s.donde === 'claude' ? 'en la nube' : String(s.donde || nada);
    $('#cerebro-donde').className = 'sub ' + (s?.cerebro ? 'ok' : 'mal');

    /* La rueda del contexto SOLO cuando hay nodo: sin él, el denominador estaba
       escrito a mano (32768) y con otro modelo el círculo marcaba cualquier
       cosa. Un medidor que no mide enseña a no creerle a la pantalla. */
    const rueda = $('#rueda');
    rueda.classList.toggle('oculto', !(enNodo && n?.ctx));
    if (enNodo && n?.ctx) {
      $('#rueda-n').textContent = `${Math.round(n.ctx / 1024)}k`;
      const pct = Math.min(100, Math.round((n.ctx / (n.ctxMax || 32768)) * 100));
      rueda.style.background = `conic-gradient(var(--cian) ${pct * 3.6}deg, rgba(5,225,255,.12) 0)`;
    }

    /* Sin barras inventadas. Las de antes eran binarias o de escala arbitraria
       —«un pedido = 1 %», SABER siempre al tope—: parecían ocupación y no
       codificaban nada. Y «fichas» significa tokens en el resto del sistema;
       esto son SECCIONES del saber. */
    const lineas = [
      ['ESTADO', s?.cerebro ? 'ENCENDIDO' : 'APAGADO', s?.cerebro ? SI : NO],
      ...(enNodo ? [
        ['MOTOR', n?.vivo ? 'VIVO' : 'SIN RESPUESTA', n?.vivo ? SI : NO],
        // Los rechazados van con los pedidos: solos ocupan un renglón para
        // decir «0» casi siempre, y al lado dicen algo — cuántos de cuántos.
        ['PEDIDOS', `${num(n?.pedidos)}${n?.rechazados ? ' · ' + num(n.rechazados) + ' rechazados' : ''}`,
          n?.rechazados ? NO : ''],
      ] : []),
      ['SABER', s?.saber ? `${num(s.saber)} secciones` : nada, s?.saber ? '' : NOSE],
      /* La memoria PROVISIONAL vive en el proceso y se pierde al reiniciar: los
         pendientes de la junta se evaporan sin avisar. `/salud` lo decía y la
         pantalla no lo enseñaba nunca. Una lista de tareas que puede
         desaparecer sola no es un registro de junta. */
      ['MEMORIA', s?.memoria === 'mongo' ? 'EN MONGO' : s?.memoria ? 'PROVISIONAL' : nada,
        s?.memoria === 'mongo' ? SI : s?.memoria ? 'amb' : NOSE],
      ['VOZ', s?.voz ? 'ELEVENLABS' : 'LA DEL NAVEGADOR', s?.voz ? SI : ''],
      /* ── EL RELEVO, QUE NADIE VEÍA ────────────────────────────────────────
         `/salud` lo dice desde el primer día y la pantalla no lo enseñaba
         nunca. Es exactamente el dato que hay que ver: cuando el nodo no
         contesta, ULTRON sigue contestando —con Claude— y eso CUESTA y esa
         conversación SALE de la casa. Sin este renglón la junta puede estar
         una semana pensando en la nube sin enterarse. */
      ...(s?.relevo ? [['RELEVO', 'CLAUDE ESTÁ CUBRIENDO', NO]] : []),
      /* ── LO QUE VA COSTANDO ───────────────────────────────────────────────
         /gasto existía y nadie lo llamaba. Los turnos del nodo salen a cero
         dólares —es nuestra tarjeta— y por eso lo que importa es el CONTADOR:
         si hoy hay dólares, es que algo se fue a la nube. */
      ...(gastoUltimo ? [['GASTO HOY', `${num(gastoUltimo.hoy?.turnos)} turnos${gastoUltimo.hoy?.dolares ? ` · ${gastoUltimo.hoy.dolares.toFixed(2)} USD` : ' · sin costo (nodo propio)'}`,
        gastoUltimo.hoy?.dolares ? 'amb' : '']] : []),
      /* ── LO QUE TARDÓ EL ÚLTIMO TURNO ─────────────────────────────────────
         La queja de siempre es «se traba» y «va lento», y no había ni un
         número en pantalla que lo dijera. El cronómetro del turno ya viaja en
         el evento `fin`; aquí se ve. La PRIMERA PALABRA es la cifra que
         importa: es el silencio que se siente. */
      ...(ultimoTurno ? [['ÚLTIMO TURNO', `${(ultimoTurno.primera / 1000).toFixed(1)} s la 1.ª palabra · ${(ultimoTurno.total / 1000).toFixed(1)} s en total`,
        ultimoTurno.primera > 4000 ? 'amb' : SI]] : []),
    ];   // cuántos son la junta ya lo dice la puerta; aquí sería un renglón repetido
    $('#nodo-lineas').innerHTML = lineas.map(([a, b, cl]) => fila(a, b, cl)).join('');
  }

  /* ── EL DUEÑO ──────────────────────────────────────────────────────────────
     Lo que ULTRON pidió y espera un clic. Cada pedido enseña el RESUMEN EXACTO
     de lo que se va a correr —el comando, la rama, el secreto y la app— y el
     motivo que dio ULTRON. Aprobar es un botón; negar, otro. Quien no es el
     dueño ve la lista y no ve los botones. */
  let soyDueño = false;
  function pintarAutorizaciones(d) {
    soyDueño = !!d?.soyDueño;
    const pend = d?.pendientes || [], rec = (d?.recientes || []).filter((p) => p.estado !== 'pendiente').slice(0, 6);
    $('#dueno-sub').textContent = `${pend.length ? pend.length + ' esperando' : 'nada esperando'} · dueño: ${d?.dueño ? d.dueño.split('@')[0] : nada}${soyDueño ? ' (usted)' : ''}`;
    const uno = (p) => `<div class="pedido ${p.estado !== 'pendiente' ? 'hecho' : ''}" data-id="${esc(p._id)}">
        <div class="que">${esc(p.resumen)}</div>
        <div class="por">${esc(p.pedidoPor)} · ${esc(hace(p.en) || '')}${p.motivo ? ' · ' + esc(p.motivo) : ''}${p.estado !== 'pendiente' ? ' · ' + esc(p.estado.toUpperCase()) : ''}</div>
        ${p.estado === 'pendiente' && soyDueño ? `<div class="mandos"><button class="btn si" data-decision="aprobado">APROBAR</button><button class="btn no" data-decision="negado">NEGAR</button></div>` : ''}
      </div>`;
    $('#autorizaciones').innerHTML = (pend.length || rec.length)
      ? pend.map(uno).join('') + rec.map(uno).join('')
      : '<div class="sub">ULTRON no ha pedido nada. Cuando proponga algo peligroso —un comando, un cambio de código, un despliegue— aparece aquí para que el dueño lo apruebe.</div>';
  }
  /* ── LOS CAMBIOS PROPUESTOS, EN UN SITIO FIJO ─────────────────────────────
     José, 7-sep: «cuando me envía pull request no aparecen en ningún lado». El
     enlace salía en el texto del turno y ahí moría: se bajaba la pantalla, se
     cerraba la app, y el cambio quedaba abierto en GitHub sin que nadie
     supiera. Un cambio propuesto que nadie encuentra es un cambio que nadie
     mezcla — trabajo escrito y tirado.
     Se leen de GitHub, no de una lista propia: si alguien cierra uno a mano,
     desaparece de aquí solo. */
  function pintarPropuestas(d) {
    const c = $('#propuestas');
    if (!c) return;
    const l = d?.propuestas || [];
    if (!l.length) { c.innerHTML = ''; return; }
    c.innerHTML = `<div class="sub" style="margin-top:10px">CAMBIOS QUE ULTRON PROPUSO (${l.length})</div>`
      + l.map((p) => `<a class="pedido" href="${esc(p.url)}" target="_blank" rel="noopener" style="text-decoration:none;display:block">
          <div class="que">#${esc(String(p.numero))} · ${esc(p.titulo)}</div>
          <div class="por">${esc(p.rama)} → ${esc(p.contra || '')} · ${esc(hace(p.tocado) || '')} · sin mezclar</div>
        </a>`).join('');
  }

  async function decidir(id, decision) {
    try {
      const r = await fetch(`/autorizaciones/${encodeURIComponent(id)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || r.status);
      avisar(decision === 'aprobado' ? 'Aprobado. ULTRON lo retoma solo.' : 'Negado.');
      DATOS.get('/autorizaciones').then(pintarAutorizaciones).catch(() => {});
      DATOS.get('/propuestas').then(pintarPropuestas).catch(() => {});
      /* ── EL ID ENTERO, Y LA HERRAMIENTA QUE DE VERDAD LO RETOMA ──────────
         Antes se le mandaba el id RECORTADO a seis letras y un «seguí con
         eso». Con eso ULTRON no podía hacer nada: para retomar hace falta el
         id completo, y volver a llamar a la herramienta original habría
         pedido permiso otra vez —la huella es herramienta + entrada exacta, y
         la entrada no vuelve al modelo nunca—. Por eso José veía que aprobaba
         y no pasaba nada. */
      if (decision === 'aprobado') enviar(`Ya aprobé el pedido ${id}. Corré aprobado_correr con ese id y seguí.`);
    } catch (e) { avisar(`No se pudo: ${e.message}`, true); }
  }

  /* ── EL BOTÓN DE ATRÁS ────────────────────────────────────────────────────
   * En el teléfono, «atrás» es el gesto que más se usa: es el que cierra lo que
   * esté encima. Aquí no cerraba nada — se salía de ULTRON entero, con el
   * diálogo todavía abierto detrás, y había que volver a entrar.
   *
   * La causa es que esto es UNA página: sin decírselo, el navegador no sabe que
   * abrir la bóveda o subir el cajón es «ir a algún sitio». Así que se lo
   * decimos: cada capa que se abre deja una marca en el historial, y atrás
   * quita la de arriba. Cerrar con el botón CERRAR hace lo mismo por dentro,
   * para que el historial no se quede con marcas de capas que ya no existen.
   *
   * Una capa es cualquier cosa que tape: un diálogo o el cajón de paneles.
   */
  const capas = [];
  let deshaciendo = 0;   // una vuelta atrás la pedimos nosotros: no cerrar dos veces
  let volviendo = false; // el navegador ya consumió la marca; no pedir otra

  function abrirCapa(el, cerrar) {
    capas.push({ el, cerrar });
    try { history.pushState({ ultron: capas.length }, ''); } catch { /* sin historial se vive igual */ }
  }

  /* `history.go` NO es inmediato: el navegador avisa después, con `popstate`.
     Por eso «cierro esto y abro aquello» no puede hacerse seguido — la marca
     nueva se pondría antes de que se quitara la vieja y el historial quedaría
     con una capa de más, que es media pulsación de atrás perdida. Lo que va
     después de cerrar se apunta aquí y se corre cuando la vuelta ya pasó. */
  let trasVolver = null;

  function cerrarCapa(el, luego) {
    const i = capas.findIndex((c) => c.el === el);
    if (i < 0) return false;
    /* Se cierra ésta y todo lo que se haya abierto encima: si un diálogo abrió
       otro y se cierra el de abajo, el de arriba quedaría huérfano. */
    const arriba = capas.splice(i).reverse();
    for (const c of arriba) { try { c.cerrar(); } catch { /* seguimos cerrando el resto */ } }
    if (volviendo) { if (luego) setTimeout(luego, 0); return true; }
    deshaciendo = 1; trasVolver = luego || null;
    try { history.go(-arriba.length); }
    catch { deshaciendo = 0; trasVolver = null; if (luego) setTimeout(luego, 0); }
    return true;
  }

  addEventListener('popstate', () => {
    if (deshaciendo > 0) {
      deshaciendo--;
      const f = trasVolver; trasVolver = null;
      if (f) setTimeout(f, 0);
      return;
    }
    const c = capas[capas.length - 1];
    if (!c) return;   // no hay nada abierto: que el navegador haga lo suyo
    volviendo = true;
    try { cerrarCapa(c.el); } finally { volviendo = false; }
  });

  // ── la bóveda: el valor va de esta pantalla al servidor y a ningún otro lado
  function dialogo(html) {
    const d = document.createElement('div'); d.id = 'dialogo'; d.innerHTML = `<div>${html}</div>`;
    /* `remove` se sustituye en ESTE elemento, no en el prototipo: así las
       treinta llamadas a `d.remove()` que ya había —el botón CERRAR, el velo,
       el guardado que se completa— pasan todas por el cierre de capa y ninguna
       deja una marca suelta en el historial. */
    const quitar = () => Element.prototype.remove.call(d);
    d.remove = () => { if (!cerrarCapa(d)) quitar(); };
    /* Cerrar este diálogo y abrir otra cosa: lo segundo espera a que la vuelta
       atrás haya pasado de verdad. */
    d.cerrarY = (fn) => { if (!cerrarCapa(d, fn)) { quitar(); setTimeout(fn, 0); } };
    d.addEventListener('click', (e) => { if (e.target === d) d.remove(); });
    /* Escape cierra, como en cualquier ventana. Se escucha en el diálogo y en
       el documento porque el foco puede estar en cualquiera de los dos. */
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); d.remove(); } });
    document.body.appendChild(d);
    abrirCapa(d, quitar);
    /* El foco entra al diálogo: sin esto, quien navega con teclado sigue en el
       botón que lo abrió y tabula por detrás de la ventana. */
    (d.querySelector('input,select,button') || d.firstElementChild)?.focus?.({ preventScroll: true });
    return d;
  }
  async function abrirBoveda() {
    let lista = null; try { lista = await DATOS.get('/boveda'); } catch { /* sin lectura */ }
    const filas = (lista?.secretos || []).map((x) => `<div class="fila dato bv-fila" data-nombre="${esc(x.nombre)}" data-nota="${esc(x.nota || '')}">
        <span>${esc(x.nombre)}</span>
        <span class="${x.corto ? 'mal' : x.dias > 90 ? 'amb' : 'ok'}">${x.largo} car. · ${x.dias} d
          ${soyDueño ? `<button type="button" class="chip bv-x" data-x="${esc(x.nombre)}">X</button>` : ''}
        </span>
      </div>`).join('');
    const d = dialogo(`<h3>LA BÓVEDA</h3>
      <div class="sub">${lista?.encendida ? 'Los VALORES no se copian ni se muestran: se cifran y no salen. Toque un nombre para editarlo (rotar) o copiar el NOMBRE.' : 'APAGADA: falta ULTRON_BOVEDA_LLAVE en el servidor (32 bytes en hex).'}</div>
      <div style="display:flex;flex-direction:column;gap:3px;max-height:180px;overflow-y:auto">${filas || '<div class="sub">vacía</div>'}</div>
      ${soyDueño && lista?.encendida ? `<label>NOMBRE<input id="bv-nombre" placeholder="GITHUB_TOKEN" autocomplete="off"></label>
      <label>VALOR (nuevo o rotación)<input id="bv-valor" type="password" autocomplete="new-password" placeholder="se guarda cifrado"></label>
      <label><input type="checkbox" id="bv-ver"> ver lo que escribo</label>
      <label>NOTA<input id="bv-nota" placeholder="para qué es"></label>
      <div class="fila-btn">
        <button class="btn" id="bv-cerrar">CERRAR</button>
        <button class="btn" id="bv-copiar">COPIAR NOMBRE</button>
        <button class="btn" id="bv-borrar">BORRAR</button>
        <button class="btn si" id="bv-guardar">GUARDAR</button>
      </div>`
      : `<div class="fila-btn"><button class="btn" id="bv-cerrar">CERRAR</button></div>`}`);
    d.querySelector('#bv-cerrar').onclick = () => d.remove();
    d.querySelectorAll('.bv-fila').forEach((f) => f.onclick = () => {
      const n = d.querySelector('#bv-nombre');
      const nota = d.querySelector('#bv-nota');
      if (n) n.value = f.dataset.nombre || '';
      if (nota) nota.value = f.dataset.nota || '';
    });
    const ver = d.querySelector('#bv-ver');
    if (ver) ver.onchange = () => {
      const i = d.querySelector('#bv-valor');
      if (i) i.type = ver.checked ? 'text' : 'password';
    };
    const copiar = d.querySelector('#bv-copiar');
    if (copiar) copiar.onclick = async () => {
      const nombre = (d.querySelector('#bv-nombre').value || '').trim();
      if (!nombre) { avisar('Toque un secreto o escriba el nombre.', true); return; }
      try { await navigator.clipboard.writeText(nombre); avisar('Nombre copiado: ' + nombre); }
      catch { avisar('No se pudo copiar.', true); }
    };
    async function borrarNombre(nombre, btn) {
      nombre = String(nombre || '').trim();
      if (!nombre) { avisar('Toque el secreto a borrar.', true); return; }
      if (btn) btn.disabled = true;
      try {
        const r = await fetch('/boveda/' + encodeURIComponent(nombre), { method: 'DELETE', credentials: 'same-origin' });
        const x = await r.json(); if (!r.ok) throw new Error(x.error || r.status);
        avisar(x.ok ? ('Borrado ' + nombre) : 'No estaba');
        d.remove(); abrirBoveda();
      } catch (e) { avisar('No se borró: ' + e.message, true); if (btn) btn.disabled = false; }
    }
    const bor = d.querySelector('#bv-borrar');
    if (bor) bor.onclick = () => borrarNombre(d.querySelector('#bv-nombre')?.value, bor);
    d.querySelectorAll('.bv-x').forEach((b) => b.onclick = (ev) => {
      ev.stopPropagation();
      borrarNombre(b.dataset.x, b);
    });
    const g = d.querySelector('#bv-guardar');
    if (g) g.onclick = async () => {
      const nombre = d.querySelector('#bv-nombre').value, valor = d.querySelector('#bv-valor').value, nota = d.querySelector('#bv-nota').value;
      if (!nombre || !valor) { avisar('Nombre y valor hacen falta.', true); return; }
      g.disabled = true;
      try {
        const r = await fetch('/boveda', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre, valor, nota }) });
        const x = await r.json(); if (!r.ok) throw new Error(x.error || r.status);
        avisar(`Guardado ${x.nombre} (${x.largo} caracteres). El valor no se puede volver a ver: si lo necesita en GitHub, cópielo de donde lo creó.`);
        d.remove(); abrirBoveda();
      } catch (e) { avisar(`No se guardó: ${e.message}`, true); g.disabled = false; }
    };
  }

  // ── el equipo: los bots y sus partes
  async function abrirEquipo() {
    let e = null; try { e = await DATOS.get('/equipo'); } catch { /* nada */ }
    const bots = (e?.bots || []).map((b) => `<div class="fila dato"><span>${esc(b.nombre)} · ${esc(b.cada ? 'cada ' + b.cada + ' h' : 'a mano')}</span><span><button class="chip" data-bot="${esc(b.nombre)}">CORRER</button></span></div>`).join('');
    const partes = (e?.partes || []).map((p) => `<div class="parte ${p.fallo ? 'fallo' : ''}"><b>${esc(p.bot)} · ${esc(hace(p.en) || '')}${p.dolares ? ' · ' + p.dolares.toFixed(3) + ' USD' : ''}</b>${esc(p.texto).slice(0, 900).replace(/\n/g, '<br>')}</div>`).join('');
    const d = dialogo(`<h3>EL EQUIPO</h3>
      <div class="sub">${e ? (e.encendido ? `Reloj encendido · ${e.vueltasHoy}/${e.tope} vueltas hoy` : 'Reloj apagado (ULTRON_EQUIPO=on lo enciende) · se corren a mano') : 'no se pudo leer'}</div>
      <div style="display:flex;flex-direction:column;gap:4px">${bots}</div>
      <div style="max-height:40dvh;overflow-y:auto">${partes || '<div class="sub">Sin partes todavía.</div>'}</div>
      <div class="fila-btn"><button class="btn" id="eq-cerrar">CERRAR</button></div>`);
    d.querySelector('#eq-cerrar').onclick = () => d.remove();
    d.querySelectorAll('[data-bot]').forEach((b) => b.onclick = async () => {
      b.disabled = true; b.textContent = 'CORRIENDO…';
      try {
        const r = await fetch(`/equipo/${encodeURIComponent(b.dataset.bot)}/correr`, { method: 'POST', credentials: 'same-origin' });
        const x = await r.json(); if (!r.ok) throw new Error(x.error || r.status);
        avisar(`${x.bot} escribió su parte.`); d.remove(); abrirEquipo();
      } catch (er) { avisar(`No corrió: ${er.message}`, true); b.disabled = false; b.textContent = 'CORRER'; }
    });
  }

  /* ── AJUSTES ──────────────────────────────────────────────────────────────
     Todo lo que es de LA PERSONA y no del ecosistema: quién es, cómo suena
     ULTRON, en qué idioma le contesta, qué figura ve en el centro, y desde qué
     aparatos tiene la sesión abierta. Y la puerta de salida.

     Las preferencias viven en el servidor con su correo, no en este navegador:
     si elige George en el iPad, ULTRON habla con George también en la
     computadora. Guardar esto en el navegador habría sido más fácil y habría
     durado hasta el segundo aparato. */
  let PREF = null;
  /* La voz elegida llega del servidor; hasta que llega, el locutor habla con la
     de la casa. El saludo espera a esto. Se declara AQUÍ, junto a lo que
     espera, y no al final del archivo: `arrancar()` la asigna, y una variable
     de bloque asignada antes de su propia declaración revienta. */
  let preferenciasListas = Promise.resolve();

  async function aplicarPreferencias(p) {
    PREF = p || PREF;
    if (!PREF) return;
    document.dispatchEvent(new CustomEvent('ultron:preferencias'));
    conVoz = PREF.conVoz !== false;
    $('#altavoz')?.setAttribute('aria-pressed', String(conVoz));
    if (locutor) { locutor.vozId = PREF.vozId || null; locutor.idioma = PREF.idioma === 'en' ? 'en' : 'es'; }
    /* El idioma no es solo la pantalla: también es en el que escucha el
       micrófono. Si está en inglés y el reconocedor sigue en español, lo que
       se dicta llega escrito como suena en español y no se entiende nada. */
    IDIOMA = PREF.idioma === 'en' ? 'en-US' : 'es-HN';
    document.documentElement.lang = PREF.idioma === 'en' ? 'en' : 'es';
    if (PREF.figura && window.UltronNucleo && UltronNucleo.figuraActual() !== PREF.figura) {
      UltronNucleo.cambiarFigura(PREF.figura);
    }
    aplicarTablero(PREF.tablero);
  }

  async function guardarPreferencia(cambios) {
    try {
      const p = await DATOS.post('/preferencias', cambios);
      await aplicarPreferencias(p);
      return p;
    } catch (e) { avisar(`No se pudo guardar: ${e.message}`, true); return null; }
  }

  /* ══ EL TABLERO, ARMADO POR QUIEN LO MIRA ══════════════════════════════════
   * «Que las cosas en web se puedan organizar, hacer más grande, más pequeñas,
   * como widgets que se puedan ir armando.»
   *
   * Nueve paneles. El reparto que trae de fábrica es una opinión —la mía, la
   * del diseño— sobre qué mira José más. Pero quien pasa el día delante de
   * esto es él, y lo que mira cambia según el día: una semana el tablero es
   * MERCADO y SALUD, y otra son los DOCUMENTOS y los PENDIENTES.
   *
   * Tres cosas se pueden hacer con cada panel: moverlo (arriba, abajo, a la
   * otra columna), cambiarle el alto, y quitarlo de en medio. Nada más: un
   * tablero con veinte mandos no se arma, se abandona.
   *
   * SE GUARDA CON EL CORREO, no en el navegador. Es la misma regla que la voz
   * y el idioma: lo que uno arma en la computadora tiene que aparecer armado
   * en el iPad, o no vale la pena armarlo.
   */
  const PESOS = [0.6, 1, 1.6, 2.4];   // chico · normal · grande · enorme
  let FABRICA = null;
  let armando = false;

  const panelesTodos = () => [...document.querySelectorAll('.p[data-panel]')];
  const columnaDe = (el) => (el.closest('#der') ? 'der' : 'izq');

  /* El reparto del diseño se guarda ANTES de tocar nada: es el «de fábrica» al
     que se vuelve, y también el sitio de un panel que se añada más adelante y
     que ningún tablero guardado conoce todavía. */
  function recordarFabrica() {
    if (FABRICA) return FABRICA;
    FABRICA = panelesTodos().map((el) => ({
      id: el.dataset.panel,
      col: columnaDe(el),
      peso: parseFloat(el.style.getPropertyValue('--peso')) || 1,
      oculto: false,
    }));
    return FABRICA;
  }

  const tableroActual = () => panelesTodos().map((el) => ({
    id: el.dataset.panel,
    col: columnaDe(el),
    peso: parseFloat(el.style.getPropertyValue('--peso')) || 1,
    oculto: el.classList.contains('escondido'),
  }));

  function aplicarTablero(t) {
    recordarFabrica();
    const cols = { izq: $('#izq'), der: $('#der') };
    if (!cols.izq || !cols.der) return;
    const porId = new Map(panelesTodos().map((el) => [el.dataset.panel, el]));
    const guardado = Array.isArray(t) ? t.filter((x) => porId.has(x.id)) : [];
    /* Un panel que el tablero guardado no menciona —porque se añadió después de
       que José armara el suyo— vuelve a su sitio de fábrica en vez de
       desaparecer o amontonarse arriba. */
    const dichos = new Set(guardado.map((x) => x.id));
    const lista = guardado.length ? [...guardado, ...FABRICA.filter((f) => !dichos.has(f.id))] : FABRICA;
    for (const x of lista) {
      const el = porId.get(x.id); if (!el) continue;
      (cols[x.col] || cols.izq).appendChild(el);
      el.style.setProperty('--peso', String(x.peso || 1));
      el.classList.toggle('escondido', !!x.oculto);
    }
    /* Una columna sin ningún panel a la vista no tiene que seguir ocupando su
       cuarto de pantalla: el centro se la queda. */
    for (const c of ['izq', 'der']) {
      const vacia = !cols[c].querySelector('.p:not(.escondido)');
      cols[c].classList.toggle('vacia', vacia);
      document.documentElement.style.setProperty(`--c-${c}`, vacia ? '0px' : '');
    }
    if (armando) pintarMandos();
  }

  const guardarTablero = () => guardarPreferencia({ tablero: tableroActual() });

  // ── los mandos de cada panel, solo mientras se arma
  function pintarMandos() {
    document.querySelectorAll('.p-mandos').forEach((x) => x.remove());
    const visibles = panelesTodos().filter((el) => !el.classList.contains('escondido'));
    for (const el of visibles) {
      const caja = el.firstElementChild; if (!caja) continue;
      const hermanos = [...el.parentElement.children].filter((x) => x.classList.contains('p') && !x.classList.contains('escondido'));
      const i = hermanos.indexOf(el);
      const peso = parseFloat(el.style.getPropertyValue('--peso')) || 1;
      const iPeso = PESOS.reduce((mejor, v, k) => (Math.abs(v - peso) < Math.abs(PESOS[mejor] - peso) ? k : mejor), 0);
      const m = document.createElement('div');
      m.className = 'p-mandos';
      m.innerHTML = `<b>${esc(el.dataset.nombre || el.dataset.panel)}</b>
        <button data-m="subir" title="Subirlo" aria-label="Subir ${esc(el.dataset.nombre)}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button data-m="bajar" title="Bajarlo" aria-label="Bajar ${esc(el.dataset.nombre)}" ${i === hermanos.length - 1 ? 'disabled' : ''}>↓</button>
        <button data-m="columna" title="A la otra columna" aria-label="Cambiar de columna">${columnaDe(el) === 'izq' ? '→' : '←'}</button>
        <button data-m="menos" title="Más pequeño" aria-label="Más pequeño" ${iPeso === 0 ? 'disabled' : ''}>−</button>
        <button data-m="mas" title="Más grande" aria-label="Más grande" ${iPeso === PESOS.length - 1 ? 'disabled' : ''}>+</button>
        <button data-m="quitar" class="quita" title="Quitarlo del tablero" aria-label="Quitar ${esc(el.dataset.nombre)}">×</button>`;
      m.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-m]'); if (!b) return;
        ev.preventDefault(); ev.stopPropagation();
        mandoDePanel(el, b.dataset.m);
      });
      caja.insertBefore(m, caja.firstChild);
    }
    pintarOcultos();
  }

  function mandoDePanel(el, que) {
    const col = el.parentElement;
    const hermanos = [...col.children].filter((x) => x.classList.contains('p') && !x.classList.contains('escondido'));
    const i = hermanos.indexOf(el);
    const peso = parseFloat(el.style.getPropertyValue('--peso')) || 1;
    const iPeso = PESOS.reduce((mejor, v, k) => (Math.abs(v - peso) < Math.abs(PESOS[mejor] - peso) ? k : mejor), 0);
    if (que === 'subir' && i > 0) col.insertBefore(el, hermanos[i - 1]);
    else if (que === 'bajar' && i < hermanos.length - 1) col.insertBefore(hermanos[i + 1], el);
    else if (que === 'columna') (columnaDe(el) === 'izq' ? $('#der') : $('#izq')).appendChild(el);
    else if (que === 'menos') el.style.setProperty('--peso', String(PESOS[Math.max(0, iPeso - 1)]));
    else if (que === 'mas') el.style.setProperty('--peso', String(PESOS[Math.min(PESOS.length - 1, iPeso + 1)]));
    else if (que === 'quitar') el.classList.add('escondido');
    aplicarTablero(tableroActual());
    guardarTablero();
    /* El foco se pierde al repintar los mandos: se devuelve al mismo botón del
       mismo panel, o el tablero no se puede armar con el teclado. */
    el.querySelector(`.p-mandos button[data-m="${que}"]:not(:disabled)`)?.focus({ preventScroll: true });
  }

  function pintarOcultos() {
    const caja = $('#armar-ocultos'); if (!caja) return;
    const fuera = panelesTodos().filter((el) => el.classList.contains('escondido'));
    caja.innerHTML = fuera.map((el) => `<button class="chip" data-vuelve="${esc(el.dataset.panel)}">+ ${esc(el.dataset.nombre || el.dataset.panel)}</button>`).join('');
    const sub = $('#armar-sub');
    if (sub) {
      sub.textContent = fuera.length
        ? `Mueva, agrande o quite paneles. ${fuera.length} fuera del tablero: toque para devolverlo.`
        : 'Mueva ↑ ↓, cámbielo de columna, hágalo más grande o más pequeño. Se guarda solo, con su correo.';
    }
  }

  function entrarArmar() {
    if (armando) return;
    recordarFabrica();
    armando = true;
    document.body.classList.add('armando');
    /* En el teléfono los paneles viven en el cajón: armar con el cajón cerrado
       sería armar a ciegas. */
    if (innerWidth <= 860 && !document.body.classList.contains('cajon')) $('#tirador')?.click();
    pintarMandos();
    abrirCapa($('#armar-barra'), () => {
      armando = false;
      document.body.classList.remove('armando');
      document.querySelectorAll('.p-mandos').forEach((x) => x.remove());
    });
  }
  const salirArmar = () => { if (armando) cerrarCapa($('#armar-barra')); };

  async function abrirAjustes() {
    const [yo, pref, voces, ses, salud, casa, bov] = await Promise.all([
      DATOS.get('/yo').catch(() => null),
      DATOS.get('/preferencias').catch(() => null),
      DATOS.get('/voces').catch(() => null),
      DATOS.get('/sesiones').catch(() => null),
      DATOS.get('/salud').catch(() => null),
      DATOS.get('/casa').catch(() => null),
      DATOS.get('/boveda').catch(() => null),
    ]);
    const llaves = bov?.secretos ? bov.secretos.length : null;
    /* La ubicación cuenta como puesta solo si es de hace menos de doce horas:
       es la misma regla que usa el servidor para el clima, y enseñar aquí una
       de anteayer como si valiera sería mentir en la pantalla de ajustes. */
    const ubicacionViva = !!(PREF?.coords && Date.now() - new Date(PREF.coords.cuando || 0).getTime() < 12 * 3600 * 1000);
    const dondeEstoy = ubicacionViva ? (pref?.donde || null) : null;
    const esDueno = yo?.permiso === 'dueño';
    if (pref) PREF = pref;
    const m = yo?.miembro || {};
    const esp = (PREF?.idioma || 'es') === 'es';
    const listaVoces = (voces?.voces || []);
    const vozPuesta = PREF?.vozId || voces?.actual || '';
    const nombreDe = (id) => listaVoces.find((v) => (v.id || v.voice_id) === id)?.nombre || listaVoces.find((v) => (v.id || v.voice_id) === id)?.name || id || '—';

    const filasSes = (ses?.sesiones || []).map((x) => `
      <div class="aj-ses ${x.viva ? '' : 'vieja'}">
        <div class="q">
          <b>${esc(x.aparato || 'aparato desconocido')}${x.esta ? ' <span class="esta">· esta</span>' : ''}</b>
          <div class="d">${esc(x.ip || 'sin IP')} · entró ${esc(hace(x.abierta) || '')}${x.ultimoVisto ? ` · visto ${esc(hace(x.ultimoVisto) || '')}` : ''}
            · ${x.como === 'genesis' ? 'con la wallet' : 'con la clave'}${x.viva ? '' : ' · CERRADA'}</div>
        </div>
        ${x.viva && !x.esta ? `<button class="chip" data-cerrar="${esc(x.sid)}">CERRAR</button>` : ''}
      </div>`).join('');

    const d = dialogo(`<h3>AJUSTES</h3>

      <div class="aj-sec"><h4>Su perfil</h4>
        <div class="aj-fila"><span>Nombre</span><b>${esc(m.nombre || '—')}</b></div>
        <div class="aj-fila"><span>Correo</span><b>${esc(m.correo || '—')}</b></div>
        <div class="aj-fila"><span>Papel</span><b>${esc(yo?.permiso === 'dueño' ? 'DUEÑO · aprueba lo peligroso' : (m.rol || 'junta directiva'))}</b></div>
        ${m.gid ? `<div class="aj-fila"><span>Genesis ID</span><b>${esc(m.gid)}</b></div>` : ''}
        <div class="aj-fila"><span>WhatsApp para avisos</span><b>${m.whatsapp ? 'puesto' : 'sin número'}</b></div>
      </div>

      <div class="aj-sec"><h4>La voz</h4>
        <div class="aj-fila"><span>Que ULTRON hable</span>
          <span class="aj-par"><button data-voz="1" aria-pressed="${conVoz}">Sí</button><button data-voz="0" aria-pressed="${!conVoz}">No</button></span></div>
        <div class="aj-fila"><span>Quién habla</span>
          ${listaVoces.length
            ? `<select class="aj-sel" id="aj-voz">${listaVoces.map((v) => { const id = v.id || v.voice_id; return `<option value="${esc(id)}" ${id === vozPuesta ? 'selected' : ''}>${esc(v.nombre || v.name || id)}</option>`; }).join('')}</select>`
            : `<b>${voces ? esc(nombreDe(vozPuesta)) : 'no se pudo leer la lista'}</b>`}</div>
        <div class="aj-fila"><span>Motor</span><b>${salud?.voz ? 'ElevenLabs' : 'la del navegador'}</b></div>
        ${!listaVoces.length && salud?.voz ? '<p class="aj-nota mal">La lista de voces no llegó: ElevenLabs no contestó. La voz puesta sigue funcionando.</p>' : ''}
        <div class="fila-btn" style="margin-top:8px"><button class="btn" id="aj-probar">PROBAR LA VOZ</button></div>
        <p class="aj-nota">George habla los dos idiomas con el modelo multilingüe. En español se le nota el acento inglés: si prefiere una voz nacida en español, ahí están Diego, Emiliano y Jorge.</p>
      </div>

      <div class="aj-sec"><h4>Cómo le escucha</h4>
        <div class="aj-fila"><span>El micrófono</span>
          <span class="aj-par">
            <button data-oi="conversacion" aria-pressed="${(PREF?.oido || 'conversacion') === 'conversacion'}">Conversación</button>
            <button data-oi="palabra" aria-pressed="${PREF?.oido === 'palabra'}">Hey ULTRON</button>
            <button data-oi="apagado" aria-pressed="${PREF?.oido === 'apagado'}">Solo el botón</button>
          </span></div>
        <div class="aj-fila"><span>Ignorar lo que suene lejos</span>
          <span class="aj-par"><button data-solo="1" aria-pressed="${PREF?.soloYo !== false}">Sí</button><button data-solo="0" aria-pressed="${PREF?.soloYo === false}">No</button></span></div>
        <p class="aj-nota"><b style="color:var(--letra-f)">Conversación</b>: al entrar y después de cada respuesta el micrófono se abre solo; hable y ya. Si interrumpe mientras ULTRON habla, se calla y le escucha.
        <b style="color:var(--letra-f)">Hey ULTRON</b>: solo atiende lo que empiece por su nombre — para cuando hay gente alrededor.
        <br><b style="color:var(--ambar)">Lo que no puede hacer:</b> reconocer su voz. El navegador no distingue quién habla, y decirle que sí sería mentirle. Lo que sí hace es no hacerle caso a lo que suena lejos, y en modo «Hey ULTRON» ignorar todo lo que no lleve su nombre.</p>
      </div>

      <div class="aj-sec"><h4>El clima del saludo</h4>
        <div class="aj-fila"><span>Su ubicación</span>
          <b>${ubicacionViva ? `${esc(dondeEstoy || 'medida')} · ${esc(hace(PREF.coords.cuando) || '')}` : 'no la está usando'}</b></div>
        <div class="aj-fila"><span>Sitio fijo</span>
          <input class="aj-sel" id="aj-lugar" value="${esc(PREF?.lugar || 'Tegucigalpa')}" placeholder="Tegucigalpa" style="font-family:var(--mono)"></div>
        <div class="fila-btn" style="margin-top:8px">
          <button class="btn" id="aj-ubicar">${ubicacionViva ? 'VOLVER A MEDIR' : 'USAR MI UBICACIÓN'}</button>
          ${ubicacionViva ? '<button class="btn" id="aj-sin-ubicar">NO USARLA</button>' : ''}
        </div>
        <p class="aj-nota">Si da permiso de ubicación, ULTRON saluda con el tiempo de donde esté de verdad — que es lo que hace falta cuando anda en Roatán y el sitio fijo dice Tegucigalpa. Se guardan tres decimales, unos cien metros, y a las doce horas caduca y se vuelve al sitio fijo. Sin permiso, manda siempre el sitio fijo: Roatán, Tegucigalpa, San Pedro Sula, La Ceiba, Utila y Guanaja los sabe de memoria; cualquier otro lo busca.</p>
      </div>

      <div class="aj-sec"><h4>Idioma</h4>
        <div class="aj-fila"><span>ULTRON le contesta en</span>
          <span class="aj-par"><button data-idi="es" aria-pressed="${esp}">Español</button><button data-idi="en" aria-pressed="${!esp}">English</button></span></div>
        <p class="aj-nota">Cambia en qué idioma contesta, con qué voz lo dice y en qué idioma escucha el micrófono. Los rótulos de esta pantalla siguen en español por ahora.</p>
      </div>

      <div class="aj-sec"><h4>La figura del centro</h4>
        <div class="aj-fila"><span>Qué se ve</span>
          <span class="aj-par"><button data-fig="nucleo" aria-pressed="${(PREF?.figura || 'nucleo') === 'nucleo'}">Núcleo</button><button data-fig="busto" aria-pressed="${PREF?.figura === 'busto'}">Busto 3D</button></span></div>
        <p class="aj-nota">El busto pide una tarjeta con tres dimensiones y pesa 600 kB más. En un teléfono viejo puede no dibujarse: si pasa, se vuelve al núcleo solo.</p>
      </div>

      <div class="aj-sec"><h4>El tablero</h4>
        <div class="aj-fila"><span>Los paneles</span><b>${panelesTodos().filter((x) => !x.classList.contains('escondido')).length} a la vista de ${panelesTodos().length}</b></div>
        <div class="fila-btn" style="margin-top:8px"><button class="btn" id="aj-armar">ARMAR EL TABLERO</button></div>
        <p class="aj-nota">Cada panel se puede subir, bajar, pasar a la otra columna, hacer más grande o más pequeño, y quitar de en medio. Lo armado se guarda con su correo: si lo arma aquí, lo encuentra armado en el iPad. Se vuelve al reparto original con DE FÁBRICA.</p>
      </div>

      <div class="aj-sec"><h4>La bóveda</h4>
        <div class="aj-fila"><span>Llaves guardadas</span><b>${llaves === null ? '—' : llaves + (llaves === 1 ? ' llave' : ' llaves')}</b></div>
        <div class="fila-btn" style="margin-top:8px"><button class="btn" id="aj-boveda">ABRIR LA BÓVEDA</button></div>
        <p class="aj-nota">Aquí se guardan las llaves de la casa —GitHub, Mongo, ElevenLabs— cifradas. ULTRON las usa y nunca las ve: de una llave guardada solo puede saber el nombre, el largo y la edad. Ni usted ni nadie tiene que escribirlas en una conversación.</p>
      </div>

      <div class="aj-sec"><h4>Dónde tiene la sesión abierta</h4>
        <div style="max-height:30dvh;overflow-y:auto">${filasSes || '<div class="sub">sin registro todavía</div>'}</div>
        <p class="aj-nota">Si ve un aparato que no es suyo, ciérrelo y cambie la clave. Cerrar una sesión la corta de verdad: no espera a que venza.</p>
        <div class="fila-btn" style="margin-top:8px"><button class="btn" id="aj-otras">CERRAR LAS DEMÁS</button></div>
      </div>

      <div class="aj-sec"><h4>La casa</h4>
        <div class="aj-fila"><span>Cerebro</span><b>${esc(salud?.modelo || '—')}</b></div>
        <div class="aj-fila"><span>Memoria</span><b>${esc(salud?.memoria || '—')}</b></div>
        <div class="aj-fila"><span>Avisos</span><b>${esc(salud?.avisos === 'partido' ? 'grave a WhatsApp · leve a correo' : (salud?.avisos || 'apagados'))}</b></div>
        <div class="aj-fila"><span>Herramientas</span><b>${salud?.herramientas ?? '—'}</b></div>
        <div class="aj-fila"><span>Versión</span><b>${esc(salud?.version || '—')}${salud?.versionCuando ? ` · ${esc(hace(salud.versionCuando) || '')}` : ''}</b></div>
        <!-- ── LA APP DE ANDROID ────────────────────────────────────────
             Va acá y no en un panel aparte: se busca UNA vez, el día que se
             estrena un teléfono. Un panel fijo para eso sería ocupar sitio
             todos los días por algo que se usa una vez al año. Dentro de la
             app misma el renglón no aparece: ya la tiene instalada. -->
        ${/UltronApp\//.test(navigator.userAgent) ? '' : `<div class="aj-fila"><span>App de Android</span><a class="chip" href="/apk" target="_blank" rel="noopener">DESCARGAR</a></div>`}
      </div>

      <div class="aj-sec"><h4>Con qué piensa ULTRON</h4>
        <div class="aj-fila"><span>Cerebro</span>
          <span class="aj-par">
            <button data-cer="nodo" aria-pressed="${(casa?.cerebro || 'nodo') === 'nodo'}" ${esDueno ? '' : 'disabled'}>Solo nosotros</button>
            <button data-cer="relevo" aria-pressed="${casa?.cerebro === 'relevo'}" ${esDueno ? '' : 'disabled'}>Con relevo</button>
            <button data-cer="claude" aria-pressed="${casa?.cerebro === 'claude'}" ${esDueno ? '' : 'disabled'}>Solo Claude</button>
          </span></div>
        <p class="aj-nota"><b style="color:var(--letra-f)">Solo nosotros</b>: el modelo de la casa, en nuestra tarjeta. Ni una palabra de la junta sale hacia afuera; si el nodo se apaga, ULTRON no puede pensar.
        <b style="color:var(--letra-f)">Con relevo</b>: lo mismo, pero si el nodo no contesta lo cubre Claude — y entonces esa conversación sí sale.
        <b style="color:var(--letra-f)">Solo Claude</b>: para pensar algo largo con un modelo grande.
        ${casa && !casa.claudeConfigurado ? '<br><span class="mal">Hoy Claude no está disponible: la cuenta no tiene saldo.</span>' : ''}
        ${esDueno ? '' : '<br>Esto lo cambia solo el dueño.'}</p>
      </div>

      <div class="fila-btn" style="margin-top:18px">
        <button class="btn" id="aj-cerrar">CERRAR</button>
        <button class="btn aj-peligro" id="aj-salir">SALIR DE ULTRON</button>
      </div>`);

    d.querySelector('#aj-cerrar').onclick = () => d.remove();
    d.querySelector('#aj-armar').onclick = () => d.cerrarY(entrarArmar);
    d.querySelector('#aj-boveda').onclick = () => d.cerrarY(abrirBoveda);
    d.querySelectorAll('[data-cer]').forEach((b) => b.onclick = async () => {
      try {
        await DATOS.post('/casa', { cerebro: b.dataset.cer });
        d.querySelectorAll('[data-cer]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.cer === b.dataset.cer)));
        avisar(b.dataset.cer === 'nodo' ? 'ULTRON piensa solo con el modelo de la casa.'
          : b.dataset.cer === 'relevo' ? 'ULTRON piensa con el nodo, y Claude cubre si el nodo cae.'
            : 'ULTRON piensa con Claude.');
      } catch (e) { avisar(`No se pudo cambiar: ${e.message}`, true); }
    });
    d.querySelectorAll('[data-voz]').forEach((b) => b.onclick = async () => {
      const si = b.dataset.voz === '1';
      if (si) despertarVoz();
      await guardarPreferencia({ conVoz: si });
      d.querySelectorAll('[data-voz]').forEach((x) => x.setAttribute('aria-pressed', String((x.dataset.voz === '1') === si)));
    });
    d.querySelectorAll('[data-idi]').forEach((b) => b.onclick = async () => {
      await guardarPreferencia({ idioma: b.dataset.idi });
      d.querySelectorAll('[data-idi]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.idi === b.dataset.idi)));
      avisar(b.dataset.idi === 'en' ? 'ULTRON will answer in English from now on.' : 'ULTRON vuelve a contestar en español.');
    });
    d.querySelectorAll('[data-fig]').forEach((b) => b.onclick = async () => {
      await guardarPreferencia({ figura: b.dataset.fig });
      d.querySelectorAll('[data-fig]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.fig === b.dataset.fig)));
    });
    d.querySelectorAll('[data-oi]').forEach((b) => b.onclick = async () => {
      await guardarPreferencia({ oido: b.dataset.oi });
      d.querySelectorAll('[data-oi]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.oi === b.dataset.oi)));
      if (b.dataset.oi === 'apagado' && despierta) orejaApagar();
    });
    d.querySelectorAll('[data-solo]').forEach((b) => b.onclick = async () => {
      const si = b.dataset.solo === '1';
      await guardarPreferencia({ soloYo: si });
      d.querySelectorAll('[data-solo]').forEach((x) => x.setAttribute('aria-pressed', String((x.dataset.solo === '1') === si)));
    });
    d.querySelector('#aj-ubicar').onclick = () => { avisar('Midiendo dónde está…'); ubicacion(); d.cerrarY(abrirAjustes); };
    const sinU = d.querySelector('#aj-sin-ubicar');
    if (sinU) sinU.onclick = async () => { await guardarPreferencia({ coords: null }); avisar('ULTRON vuelve a usar el sitio fijo.'); d.cerrarY(abrirAjustes); };
    const lug = d.querySelector('#aj-lugar');
    if (lug) lug.onchange = () => guardarPreferencia({ lugar: lug.value.trim() });
    const sel = d.querySelector('#aj-voz');
    if (sel) sel.onchange = () => guardarPreferencia({ vozId: sel.value });
    d.querySelector('#aj-probar').onclick = () => {
      /* Se prueba con la voz elegida AHORA, no con la guardada: si acaba de
         cambiarla y todavía no se guardó, lo que quiere oír es la nueva. */
      despertarVoz();
      locutor.vozId = (sel ? sel.value : vozPuesta) || null;
      locutor.callar();
      locutor.alimentar((PREF?.idioma || 'es') === 'en'
        ? 'Good morning. This is how I sound. Ready when you are.'
        : 'Buenos días, José. Así es como sueno. Quedo a su disposición.');
      locutor.cerrar();
    };
    d.querySelectorAll('[data-cerrar]').forEach((b) => b.onclick = async () => {
      b.disabled = true; b.textContent = '…';
      try { await DATOS.borrar(`/sesiones/${encodeURIComponent(b.dataset.cerrar)}`); avisar('Sesión cerrada.'); d.cerrarY(abrirAjustes); }
      catch (e) { avisar(`No se pudo cerrar: ${e.message}`, true); b.disabled = false; b.textContent = 'CERRAR'; }
    });
    d.querySelector('#aj-otras').onclick = async () => {
      try { const r = await DATOS.post('/sesiones/cerrar-otras', {}); avisar(r.cerradas ? `${r.cerradas} sesión(es) cerradas.` : 'No había ninguna otra abierta.'); d.cerrarY(abrirAjustes); }
      catch (e) { avisar(`No se pudo: ${e.message}`, true); }
    };
    d.querySelector('#aj-salir').onclick = async () => {
      try { await DATOS.post('/salir', {}); } catch { /* se sale igual */ }
      location.reload();
    };
  }

  /* ── LA SALUD DE ULTRON, EN LA PANTALLA ───────────────────────────────────
     Nueve signos y una nota. La regla del tablero se respeta: mientras no llega
     la lectura, la nota dice «—». Y el botón REPARAR solo aparece cuando hay
     algo que reparar de verdad: un botón que no hace nada enseña a no tocarlo. */
  let saludProfunda = null;
  function pintarSaludPropia(r) {
    saludProfunda = r;
    const n = $('#nota-n'), sub = $('#salud-sub'), caja = $('#signos'), rep = $('#b-reparar');
    if (!r) { n.textContent = nada; sub.textContent = 'no se pudo medir'; sub.className = 'sub mal'; return; }
    n.textContent = String(r.puntaje);
    n.style.color = r.estado === 'bien' ? 'var(--verde)' : r.estado === 'ojo' ? 'var(--ambar)' : 'var(--rojo)';
    const malos = r.signos.filter((x) => x.estado === 'mal').length;
    const ojos = r.signos.filter((x) => x.estado === 'ojo').length;
    sub.textContent = (!malos && !ojos ? 'todo en orden' : `${malos ? malos + ' grave' + (malos > 1 ? 's' : '') : ''}${malos && ojos ? ' · ' : ''}${ojos ? ojos + ' ojo' : ''}`) + (r.avisos && r.avisos !== 'apagado' ? ` · avisa: ${r.avisos}` : ' · sin avisos');
    sub.className = 'sub ' + (malos ? 'mal' : ojos ? 'amb' : 'ok');
    caja.innerHTML = r.signos.map((x) => `<div class="fila dato" title="${esc(x.que)}: ${esc(x.dato)}${x.detalle ? ' — ' + esc(x.detalle) : ''}">`
      + `<span>${esc(x.corto || x.que)}</span><span class="${x.estado === 'bien' ? 'ok' : x.estado === 'ojo' ? 'amb' : 'mal'}">${esc(x.dato)}</span></div>`).join('');
    rep.classList.toggle('oculto', !r.arreglos?.length);
    /* Y en el techo, para verla sin abrir el cajón. */
    const chip = $('#m-salud');
    if (chip) {
      chip.classList.remove('oculto', 'mala', 'ojo');
      if (r.estado === 'mal') chip.classList.add('mala'); else if (r.estado === 'ojo') chip.classList.add('ojo');
      $('#m-salud-n').textContent = String(r.puntaje);
      chip.title = r.resumen || 'La salud de ULTRON';
    }
    rep.title = r.arreglos?.length ? `Arregla: ${r.arreglos.join(', ')}` : '';
  }

  async function repararSalud() {
    const b = $('#b-reparar'); b.disabled = true; const antes = b.textContent; b.textContent = 'ARREGLANDO…';
    try {
      const rr = await fetch('/salud/reparar', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const x = await rr.json(); if (!rr.ok) throw new Error(x.error || rr.status);
      avisar(x.hechos?.length ? `${x.antes} → ${x.despues}/100 · ${x.hechos.length} arreglo(s).` : 'No hacía falta arreglar nada.');
      if (x.hechos?.length) pintarDicho(`**Reparado**\n\n${x.hechos.map((h) => '- ' + h).join('\n')}`);
      DATOS.get('/salud/profunda').then(pintarSaludPropia).catch(() => {});
    } catch (e) { avisar(`No se pudo arreglar: ${e.message}`, true); }
    b.disabled = false; b.textContent = antes;
  }

  /* Las máquinas de la casa. Va por la ruta de herramientas porque `nodos` es de
     lectura y ya sabe hablar con AWS: no hacía falta una ruta nueva para lo
     mismo. */
  async function abrirNodos() {
    const d = dialogo('<h3>LAS MÁQUINAS</h3><div class="sub">preguntándole a AWS…</div>');
    let txt = null;
    try {
      const r = await fetch('/herramientas/nodos', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{"entrada":{}}' });
      const x = await r.json(); txt = r.ok ? (x.salida || '') : `No se pudo leer: ${x.error || r.status}`;
    } catch (e) { txt = `No se pudo leer: ${e.message}`; }
    const filas = String(txt).split('\n').filter(Boolean).map((l) => {
      const t = l.replace(/^-\s*/, '');
      const apagada = /stopped|apagad/i.test(t);
      return `<div class="fila dato"><span>${esc(t.split(' · ').slice(0, 2).join(' · '))}</span><span class="${apagada ? 'amb' : 'ok'}">${esc(t.split(' · ').slice(2).join(' · '))}</span></div>`;
    }).join('');
    d.innerHTML = `<h3>LAS MÁQUINAS</h3><div class="sub">Los nodos de la cadena y las tarjetas, leídos de AWS ahora mismo.</div>
      <div style="display:flex;flex-direction:column;gap:3px;max-height:44dvh;overflow-y:auto">${filas || '<div class="sub">sin lectura</div>'}</div>
      <div class="fila-btn"><button class="btn" id="nd-cerrar">CERRAR</button></div>`;
    d.querySelector('#nd-cerrar').onclick = () => d.remove();
  }

  /* LO QUE SABE HACER. Doce habilidades y cincuenta y ocho herramientas vivían
     sin una sola puerta desde la pantalla: estaban ahí y nadie podía verlas.
     Una habilidad se abre y se lee; una herramienta se nombra por grupo. */
  async function abrirSaberHacer() {
    const [hab, her, bit] = await Promise.all([
      DATOS.get('/habilidades').catch(() => null),
      DATOS.get('/herramientas').catch(() => null),
      DATOS.get('/bitacora?limite=25').catch(() => null),
    ]);
    const acciones = (bit?.acciones || []).map((a) => `<div class="fila dato"><span>${esc(hace(a.cuando) || '')} · ${esc(a.herramienta)} · ${esc(String(a.quien || '').replace(/@.*/, ''))}</span><span class="${a.ok ? 'ok' : 'mal'}">${a.ok ? 'ok' : 'falló'}${a.ms ? ' · ' + a.ms + ' ms' : ''}</span></div>`).join('');
    const lista = Array.isArray(hab) ? hab : (hab?.habilidades || []);
    const habs = lista.map((h) => `<div class="fila dato"><span><button class="chip" data-hab="${esc(h.nombre)}">${esc(h.nombre)}</button></span><span class="sub" style="text-align:right;max-width:60%">${esc(String(h.cuando || '').slice(0, 90))}</span></div>`).join('');
    const porGrupo = {};
    for (const t of her?.herramientas || []) (porGrupo[t.grupo] ||= []).push(t.nombre);
    const grupos = Object.entries(porGrupo).map(([g, l]) => `<div class="parte"><b>${esc(g)}</b>${l.map(esc).join(' · ')}</div>`).join('');
    const d = dialogo(`<h3>LO QUE SABE HACER</h3>
      <div class="sub">${lista.length} habilidades (procedimientos que sigue paso por paso) y ${(her?.herramientas || []).length} herramientas (lo que puede tocar).</div>
      <div style="display:flex;flex-direction:column;gap:3px;max-height:26dvh;overflow-y:auto">${habs || '<div class="sub">sin habilidades</div>'}</div>
      <div style="max-height:22dvh;overflow-y:auto">${grupos || ''}</div>
      <div class="sub" style="margin-top:6px">LA BITÁCORA · lo último que hizo (solo lo que escribe o toca algo; nunca se edita)</div>
      <div style="display:flex;flex-direction:column;gap:3px;max-height:22dvh;overflow-y:auto">${acciones || '<div class="sub">todavía nada</div>'}</div>
      <div class="fila-btn"><button class="btn" id="sh-cerrar">CERRAR</button></div>`);
    d.querySelector('#sh-cerrar').onclick = () => d.remove();
    d.querySelectorAll('[data-hab]').forEach((b) => b.onclick = async () => {
      try {
        const h = await DATOS.get(`/habilidades/${encodeURIComponent(b.dataset.hab)}`);
        d.remove();
        const v = dialogo(`<h3>${esc(b.dataset.hab.toUpperCase())}</h3>
          <div style="max-height:56dvh;overflow-y:auto;white-space:pre-wrap;font-size:12px;line-height:1.7;color:var(--letra-f)">${esc(h.contenido || h.markdown || h.texto || '(vacía)')}</div>
          <div class="fila-btn"><button class="btn" id="hb-cerrar">CERRAR</button></div>`);
        v.querySelector('#hb-cerrar').onclick = () => v.remove();
      } catch (e) { avisar(`No se pudo leer: ${e.message}`, true); }
    });
  }

  /* «VENCIÓ hace 2 d» en rojo, «vence HOY» en ámbar, «vence en 5 d» en gris:
     la fecha es lo que ordena la lista, así que se ve antes que el nombre. */
  function vence(p) {
    if (!p.vence) return '';
    const dia = (t) => Math.floor((t - 6 * 3600000) / 86400000);   // días de calendario en Honduras
    const d = dia(+new Date(p.vence)) - dia(Date.now());
    const t = d < 0 ? `VENCIÓ hace ${-d} d` : d === 0 ? 'vence HOY' : d === 1 ? 'vence MAÑANA' : `vence en ${d} d`;
    return `<span class="${d < 0 ? 'mal' : d <= 1 ? 'amb' : ''}">${t}</span>${p.quien ? ' · ' : ''}`;
  }
  function pintarPendientes(l) {
    const abiertos = (l || []).filter((p) => p.estado !== 'hecho');
    $('#pend-sub').textContent = abiertos.length ? `${abiertos.length} sin cerrar` : 'nada abierto';
    $('#pendientes').innerHTML = abiertos.length
      /* ── Y SE PUEDEN CERRAR ────────────────────────────────────────────
         Se veían y no se tocaban: para cerrar uno había que pedírselo a ULTRON
         por escrito, con el riesgo de que cerrara el que no era. `PATCH
         /pendientes/:id` existía desde el principio y nadie lo llamaba. Marcar
         hecho lo que ya está hecho es el gesto más repetido de una lista de
         tareas: tiene que ser un toque. */
      ? abiertos.slice(0, 12).map((p) => `
        <div style="display:flex;gap:7px;align-items:flex-start">
          <button class="cerrar-pend" data-pend="${esc(String(p._id))}" title="Marcarlo como hecho" aria-label="Marcar como hecho: ${esc(p.texto)}"
            style="width:18px;height:18px;margin-top:2px;flex:none;border-radius:50%;background:transparent;cursor:pointer;
                   border:1.5px solid ${p.vence && +new Date(p.vence) < Date.now() ? 'var(--rojo)' : 'var(--ambar)'}"></button>
          <div style="min-width:0">
            <div style="font-size:12.5px;line-height:1.3;color:var(--letra-f)">${esc(p.texto)}</div>
            ${p.quien || p.vence ? `<div class="dato" style="color:var(--tenue)">${vence(p)}${p.quien ? esc(p.quien) : ''}</div>` : ''}
          </div>
        </div>`).join('')
      : '<div class="sub">La junta no tiene nada anotado. Pídale a ULTRON que anote algo y aparece aquí.</div>';
  }

  // ══ ARCHIVOS ══════════════════════════════════════════════════════════════

  const kb = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  const ETIQ = { 'application/pdf': 'PDF', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX', 'text/plain': 'TXT', 'text/csv': 'CSV', 'text/markdown': 'MD', 'application/json': 'JSON', 'text/html': 'HTML', 'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/webp': 'WEBP' };

  function pintarArchivos(l) {
    const n = (l || []).length;
    $('#arch-sub').textContent = n ? `${n} archivo${n > 1 ? 's' : ''} · ULTRON los puede leer` : 'nada todavía · suelte uno encima';
    $('#archivos').innerHTML = n ? l.map((a) => {
      const leible = !!a.texto;
      return `<div class="arch">
        ${/^image\//.test(a.tipo||'') ? `<img class="arch-th" src="/archivos/${esc(a._id)}/bajar" alt="${esc(a.nombre)}" style="width:44px;height:44px;object-fit:cover;border-radius:4px">` : `<div class="et ${leible ? '' : 'gris'}">${esc(ETIQ[a.tipo] || '?')}</div>`}
        <div class="qui">
          <div class="nm" title="${esc(a.nombre)}">${esc(a.nombre)}</div>
          <div class="mt">${kb(a.bytes)} · ${/^image\//.test(a.tipo||'') ? 'tocá para ampliar' : (leible ? `${num(a.texto.length)} letras leídas` : 'sin texto')}</div>
        </div>
        <a class="bj" href="/archivos/${esc(a._id)}/bajar" target="_blank" rel="noopener" title="Bajar" aria-label="Bajar ${esc(a.nombre)}">
          <svg viewBox="0 0 24 24"><path d="M12 3v13M7 11.5l5 5 5-5M4.5 20.5h15"/></svg></a>
        <button class="bj quita" data-borrar="${esc(a._id)}" data-nombre="${esc(a.nombre)}" title="Borrarlo" aria-label="Borrar ${esc(a.nombre)}">
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/></svg></button>
      </div>`;
    }).join('') : '<div class="sub">Suelte un PDF, un Word o un texto en la pantalla y ULTRON lo lee.</div>';
  }

  /* ── BORRAR UN DOCUMENTO QUE YA NO SE OCUPA ───────────────────────────────
     Entraban y no salían nunca: la lista crecía sin fin y encima cada uno
     seguía estando al alcance del cerebro. Se pregunta antes, porque de esto
     no se vuelve: el archivo se va de la base con su texto y su copia. */
  async function borrarArchivo(id, nombre) {
    if (!confirm(`¿Borrar «${nombre}»? Se va del todo: ULTRON deja de poder leerlo.`)) return;
    try {
      await DATOS.borrar(`/archivos/${encodeURIComponent(id)}`);
      avisar('Documento borrado.');
      DATOS.get('/archivos').then(pintarArchivos).catch(() => {});
    } catch (e) { avisar(`No se pudo borrar: ${e.message}`, true); }
  }

  /* ══ LA CAJA DE ORDENEX ═════════════════════════════════════════════════════
   * «Poder actualizar las billeteras que usamos de Ordenex: cuánto es el
   * saldo… tanto ORIGEN, USDT, comisiones para enviar y transacciones.»
   *
   * NO se lee sola cada diez segundos como el resto del tablero. Son cuatro
   * lecturas de cadena en cuatro redes distintas: pedirlas en bucle con la
   * pantalla abierta gastaría el proveedor de RPC todo el día para un número
   * que cambia cuando alguien compra o vende. Se lee al entrar, una vez, y
   * cuando se toca ACTUALIZAR o se le pide a ULTRON que lo actualice.
   *
   * Y NUNCA UN CERO DE CONSUELO: un saldo que no se pudo leer dice «no leído».
   * Un panel que pinta cero con el nodo caído es un panel que un día jura que
   * la caja está vacía.
   */
  const dosDec = (n) => (typeof n === 'number' && isFinite(n)
    ? n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : nada);

  let cajaCuando = null;
  function pintarCaja(c) {
    const caja = $('#caja-ox'), sub = $('#caja-sub');
    if (!caja) return;
    if (!c || c.error) {
      /* El motivo va UNA vez, y entero, en el cuerpo del panel. Antes iba
         también en el renglón de arriba, recortado a sesenta letras: el mismo
         texto dos veces, uno de ellos partido a media palabra. */
      sub.textContent = /llave/i.test(c?.error || '') ? 'falta la llave de Ordenex' : 'no se pudo leer';
      sub.className = 'sub mal';
      caja.innerHTML = `<div class="sub">${esc(c?.error || 'La caja no contestó. Vuelva a intentarlo con ACTUALIZAR.')}</div>`;
      return;
    }
    const filas = [];
    const fila = (q, v, clase = '') => filas.push(`<div class="fila"><span>${esc(q)}</span><span class="${clase}">${esc(v)}</span></div>`);
    const titulo = (t) => filas.push(`<div class="caja-tit">${esc(t)}</div>`);

    titulo('LA CALIENTE · entrega ORIGEN');
    if (c.caliente.ok) {
      const conAlgo = (c.caliente.saldos || []).filter((x) => x.cantidad && x.cantidad !== '0');
      if (conAlgo.length) for (const x of conAlgo) fila(x.simbolo, x.cantidad, 'ok');
      else fila('saldo', 'vacía', 'mal');
    } else fila('saldo', 'no leído', 'amb');

    for (const p of (c.pagadora || [])) {
      titulo(`LA PAGADORA · ${p.red}`);
      if (p.error) { fila('saldo', 'no leído', 'amb'); continue; }
      fila('USDT', dosDec(p.usdt), p.usdt > 0 ? 'ok' : 'mal');
      if (p.enVuelo) fila('comprometido', dosDec(p.enVuelo), 'amb');
      fila('gas', p.ventasQueQuedan === null ? 'no leído' : `${p.ventasQueQuedan} ventas`, p.alcanza === false ? 'mal' : 'ok');
    }

    if ((c.gas || []).length) {
      titulo('EL GAS DEL BARRIDO');
      for (const g of c.gas) fila(g.red, g.ok ? `${g.barridosQueQuedan ?? '?'} barridos` : 'no leído',
        !g.ok ? 'amb' : g.nivel === 'seco' || g.alcanza === false ? 'mal' : g.nivel === 'bajo' ? 'amb' : 'ok');
    }

    titulo('LA COMISIÓN GANADA');
    if (c.comision?.error) fila('saldo', 'no leído', 'amb');
    else {
      const s = (c.comision?.saldos || []).filter((x) => x.cantidad);
      if (s.length) for (const x of s) fila(x.activo, dosDec(x.cantidad), 'ok');
      else fila('saldo', 'nada todavía');
      if (c.comision?.deRetiros) fila('de retiros', String(c.comision.deRetiros));
    }

    const m = c.movimiento || {};
    titulo('EN PIE');
    fila('órdenes abiertas', m.ordenesAbiertas ?? nada);
    fila('retiros pendientes', m.retirosPendientes ?? nada);
    if (m.retirosEnRevision) fila('EN REVISIÓN', String(m.retirosEnRevision), 'mal');
    fila('compra · venta', `${m.compraEncendida ? 'abierta' : 'cerrada'} · ${m.ventaEncendida ? 'abierta' : 'cerrada'}`,
      m.compraEncendida && m.ventaEncendida ? 'ok' : 'amb');

    caja.innerHTML = filas.join('');
    /* El reloj de la caja TIENE que correr. Es la única cifra del tablero que
       se lee a mano, así que es la que más fácil se queda vieja: «leída hace 2
       min» escrito una vez y quieto mientras pasa media hora es peor que no
       poner nada, porque parece de ahora. Lo actualiza `reloj()` cada segundo. */
    cajaCuando = c.cuando || new Date().toISOString();
    sub.textContent = `leída ${hace(cajaCuando) || 'ahora'}`;
    sub.className = 'sub';
  }

  async function cargarRegistro() {
    try { registroUltimo = await DATOS.get('/conversaciones/registro'); pintarRegistro(registroUltimo); }
    catch { pintarRegistro(null); }
  }

  async function leerCaja() {
    const b = $('#b-caja'); if (b) { b.disabled = true; b.textContent = 'LEYENDO…'; }
    $('#caja-sub').textContent = 'preguntándole a Ordenex…';
    try { pintarCaja(await DATOS.get('/ordenex/caja')); }
    catch (e) { pintarCaja({ error: e.message }); }
    if (b) { b.disabled = false; b.textContent = 'ACTUALIZAR'; }
  }

  /* ══ EL REGISTRO POR DÍA ════════════════════════════════════════════════════
   * «Necesitamos ver los registros de conversaciones, que se guarden por día;
   * si me salgo se sigue guardando en el mismo día, y poder ver la
   * conversación.»
   *
   * Nadie se acuerda del título de una conversación; se acuerda del día. Así
   * que la lista es de días, no de conversaciones, y el de hoy va marcado.
   */
  function pintarRegistro(r) {
    const caja = $('#registro'), sub = $('#reg-sub');
    if (!caja) return;
    const dias = r?.dias || [];
    sub.textContent = dias.length ? `${dias.length} día${dias.length > 1 ? 's' : ''} guardados` : 'todavía sin conversaciones';
    caja.innerHTML = dias.length ? dias.map((d) => {
      const esHoy = d.dia === r.hoy;
      const id = d.conversaciones[0]?._id;
      const titulo = d.conversaciones.map((c) => c.titulo).find(Boolean) || 'sin título todavía';
      return `<button class="reg ${esHoy ? 'hoy' : ''}" data-dia="${esc(d.dia)}" data-conv="${esc(id || '')}">
        <b>${esHoy ? 'HOY' : esc(fechaCorta(d.dia))}</b>
        <span>${esc(titulo)} · ${d.turnos} turno${d.turnos === 1 ? '' : 's'}</span>
      </button>`;
    }).join('') : '<div class="sub">Lo que hable con ULTRON se guarda por día. Salir y volver sigue el mismo hilo.</div>';
  }

  /* «2026-09-06» → «6 sep». El año solo cuando no es el de ahora: dentro del
     mismo año es ruido, y en enero, al mirar diciembre, hace falta. */
  function fechaCorta(dia) {
    const [a, m, d] = String(dia).split('-').map(Number);
    if (!a || !m || !d) return dia;
    const f = new Date(Date.UTC(a, m - 1, d));
    const corto = f.toLocaleDateString('es-HN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return a === new Date().getFullYear() ? corto : `${corto} ${a}`;
  }

  async function abrirDia(dia, convId) {
    const d = dialogo(`<h3>${esc(dia === (registroUltimo?.hoy) ? 'HOY' : fechaCorta(dia))}</h3><div class="sub">trayendo la conversación…</div>`);
    let c = null;
    try { c = await DATOS.get(`/conversaciones/${encodeURIComponent(convId)}`); }
    catch (e) { d.querySelector('div').innerHTML = `<h3>${esc(fechaCorta(dia))}</h3><div class="sub mal">${esc(e.message)}</div><div class="fila-btn"><button class="btn" id="rg-cerrar">CERRAR</button></div>`; d.querySelector('#rg-cerrar').onclick = () => d.remove(); return; }
    const turnos = (c?.turnos || []).map((t) => `<div class="rg-turno ${t.rol}">
        <div class="quien">${t.rol === 'ultron' ? 'ULTRON' : 'USTED'} · ${esc(new Date(t.en).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }))}</div>
        <div>${window.MARKDOWN ? MARKDOWN.aHtml(t.texto || '') : esc(t.texto || '')}</div>
        ${(t.herramientas || []).length ? `<div class="sub">usó: ${esc(t.herramientas.map((h) => h.nombre).join(', '))}</div>` : ''}
      </div>`).join('');
    d.querySelector('div').innerHTML = `<h3>${esc(c?.titulo || fechaCorta(dia))}</h3>
      <div class="sub">${(c?.turnos || []).length} turnos · ${esc(fechaCorta(dia))}</div>
      <div style="max-height:60dvh;overflow-y:auto;display:flex;flex-direction:column;gap:10px;margin-top:10px">${turnos || '<div class="sub">sin turnos</div>'}</div>
      <div class="fila-btn" style="margin-top:14px"><button class="btn" id="rg-cerrar">CERRAR</button></div>`;
    d.querySelector('#rg-cerrar').onclick = () => d.remove();
  }
  /* La ventana de «ULTRON necesita su permiso». Sale sola cuando una respuesta
     trae un pedido pendiente, y también se puede abrir desde el botón. */
  /* ── EL PERMISO, DENTRO DE LA CONVERSACIÓN ────────────────────────────────
     José, 7-sep: «cuando necesite permiso que aparezca como cuando aparece
     aquí en Claude».
     Lo que hace que ahí funcione no es la ventana: es que el pedido queda
     ESCRITO EN EL HILO, con el comando exacto delante, y sigue estando ahí
     aunque uno mire otra cosa y vuelva. Una ventana que se cierra sin querer
     se lleva el pedido con ella y ULTRON se queda esperando algo que ya nadie
     ve.
     Así que van los dos: la tarjeta se queda en la conversación, y encima sale
     la ventana para decidir sin buscar. Aprobar en cualquiera de las dos hace
     lo mismo. */
  function tarjetaDePermiso(p) {
    const d = $('#dicho');
    if (!d || d.querySelector(`[data-permiso-tarjeta="${p.id}"]`)) return;
    const caja = document.createElement('div');
    caja.className = 'rg-turno';
    caja.dataset.permisoTarjeta = p.id;
    caja.style.cssText = 'border-left:2px solid var(--acento);margin-top:10px';
    caja.innerHTML = `<div class="quien">ULTRON NECESITA SU PERMISO</div>
      <div style="margin:6px 0 10px;font-family:var(--mono,monospace);font-size:12.5px;word-break:break-word">${esc(p.resumen || 'una acción que necesita aprobación')}</div>
      ${p.motivo ? `<div class="sub" style="margin-bottom:10px">Para qué: ${esc(p.motivo)}</div>` : ''}
      <div class="fila-btn"><button class="btn" data-aprobar="${esc(p.id)}" style="min-height:44px;padding:12px 20px">APROBAR Y SEGUIR</button></div>`;
    d.appendChild(caja);
    $('#globo')?.classList.remove('oculto');
  }

  function pedirPermiso(p) {
    tarjetaDePermiso(p);
    if (document.querySelector('#dialogo [data-permiso]')) return;   // ya está abierta
    const d = dialogo(`<h3 data-permiso="${esc(p.id)}">ULTRON NECESITA SU PERMISO</h3>
      <div class="sub">Para seguir con lo que le pidió tiene que hacer esto, y no lo hace sin que usted lo apruebe:</div>
      <div class="rg-turno" style="margin:12px 0"><div>${esc(p.resumen || 'una acción que necesita aprobación')}</div></div>
      ${p.motivo ? `<div class="sub">Para qué: ${esc(p.motivo)}</div>` : ''}
      <div class="fila-btn" style="margin-top:16px">
        <button class="btn" id="pm-si">APROBAR Y SEGUIR</button>
        <button class="btn" id="pm-no">AHORA NO</button>
      </div>`);
    d.querySelector('#pm-no').onclick = () => d.remove();
    d.querySelector('#pm-si').onclick = () => {
      const b = d.querySelector('#pm-si');
      b.disabled = true; b.textContent = 'APROBANDO…';
      DATOS.post(`/autorizaciones/${encodeURIComponent(p.id)}`, { decision: 'aprobado' })
        .then(() => {
          d.remove();
          const t = document.querySelector(`[data-permiso-tarjeta="${p.id}"]`);
          if (t) t.innerHTML = `<div class="quien">APROBADO</div><div class="sub">${esc(p.resumen || '')}</div>`;
          avisar('Aprobado. ULTRON sigue.');
          enviar(`Ya aprobé el pedido ${p.id}. Corré aprobado_correr con ese id y seguí.`);
        })
        .catch((e) => { b.disabled = false; b.textContent = 'APROBAR Y SEGUIR'; avisar(e.message || 'No se pudo aprobar.', true); });
    };
  }

  /* Lo último que se hablaron, pintado en el globo al entrar. No es una
     respuesta nueva y no se lee en voz alta: es el hilo de donde se quedó. */
  function pintarDondeQuedamos(c) {
    const ultimos = (c?.ultimos || []).filter((t) => String(t.texto || '').trim());
    if (!ultimos.length) return;
    const suyo = $('#globo-quien');
    const ultimo = ultimos[ultimos.length - 1];
    const cuando = ultimo.en ? new Date(ultimo.en).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : '';
    if (suyo) suyo.textContent = `DONDE QUEDARON${cuando ? ' · ' + cuando : ''}:`;
    const hilo = ultimos.map((t) => {
      const quien = t.rol === 'ultron' ? 'ULTRON' : 'USTED';
      const cuerpo = window.MARKDOWN ? MARKDOWN.aHtml(t.texto) : esc(t.texto);
      return `<div class="rg-turno ${esc(t.rol)}"><div class="quien">${quien}</div><div>${cuerpo}</div></div>`;
    }).join('');
    const d = $('#dicho');
    if (d) d.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">${hilo}</div>`;
    $('#globo')?.classList.remove('oculto');
    /* Un toque abre el día entero, que es la otra mitad de lo que pidió. */
    chips([{ tipo: 'hilo', nombre: 'VER TODO EL HILO', conv: c._id }]);
  }

  let registroUltimo = null;

  /* ── UNA FOTO DEL TELÉFONO NO VIAJA ENTERA ────────────────────────────────
     Una foto del iPad son cuatro o cinco megas, y para MIRARLA no hacen falta:
     el cerebro la reduce igual antes de verla. Lo que sí hace un archivo así es
     tardar —viaja entera, se guarda entera y se manda entera al modelo en
     base64, que abulta un tercio más—. Con el lado largo a 1600 píxeles el
     texto de una factura o de una pantalla sigue leyéndose y el archivo baja a
     una fracción.
     Si el navegador no puede con el lienzo, o si el resultado sale MÁS grande
     que el original —pasa con capturas de pantalla, que ya vienen muy
     comprimidas—, se sube el original: encoger no puede empeorar las cosas. */
  const LADO_MAXIMO = 1600;
  async function encoger(f) {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size < 400 * 1024) return f;
    try {
      const bm = await createImageBitmap(f);
      const escala = Math.min(1, LADO_MAXIMO / Math.max(bm.width, bm.height));
      if (escala === 1) { bm.close?.(); return f; }
      const lz = document.createElement('canvas');
      lz.width = Math.round(bm.width * escala); lz.height = Math.round(bm.height * escala);
      lz.getContext('2d').drawImage(bm, 0, 0, lz.width, lz.height);
      bm.close?.();
      const chico = await new Promise((ok) => lz.toBlob(ok, 'image/jpeg', 0.85));
      if (!chico || chico.size >= f.size) return f;
      const nombre = f.name.replace(/\.(png|webp|jpeg|jpg)$/i, '') + '.jpg';
      return new File([chico], nombre, { type: 'image/jpeg' });
    } catch { return f; }
  }

  async function subir(ficheros) {
    const l = [...ficheros].slice(0, 6);
    for (const original of l) {
      try {
        avisar(`Subiendo ${original.name}…`);
        const f = await encoger(original);
        if (f !== original) avisar(`${original.name}: ${num(Math.round(original.size / 1024))} KB → ${num(Math.round(f.size / 1024))} KB para que se pueda mirar rápido.`);
        const r = await fetch('/archivos', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Nombre': encodeURIComponent(f.name) },
          body: f,
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { avisar(d.error || `No se pudo subir ${f.name}.`, true); continue; }
        /* Se dice lo que ULTRON PUDO SACAR, no «subido». Un PDF escaneado sube
           perfecto y no se puede leer: si el aviso dice «listo» y después
           ULTRON contesta que no ve nada, la culpa parece suya. */
        avisar(d.texto ? `${f.name}: ${num(d.texto.length)} letras leídas.` : `${f.name} guardado, pero ${d.porQue || 'sin texto que leer'}`);
      } catch (e) {
        avisar(`No se pudo subir ${original.name}: ${e.message}`, true);
      }
    }
    cargarArchivos();
  }

  const cargarArchivos = () => DATOS.get('/archivos').then(pintarArchivos).catch(() => {});

  // ══ LAS ONDAS ═════════════════════════════════════════════════════════════

  /* El «flujo de consciencia» del diseño es una onda. Aquí esa onda es el
     NIVEL DE VOZ de verdad cuando ULTRON habla, y un latido tranquilo cuando
     no. Una onda que se mueve igual pase lo que pase es un salvapantallas. */
  /* ── LO QUE SE MUEVE, Y LO QUE NO ──────────────────────────────────────────
     Antes se movía TODO todo el tiempo: la constelación giraba sin parar, los
     nodos latían, la onda oscilaba en reposo con una senoidal. Dos costes. Uno
     de diseño: si el movimiento es constante, el movimiento no significa nada,
     y el día que una casa se caiga de verdad no habrá ningún cambio que lo
     delate. Uno físico: es una pantalla de sala encendida horas, manteniendo la
     tarjeta al máximo para dibujar una senoidal.
     Ahora el movimiento está RESERVADO: la onda se mueve cuando ULTRON habla o
     piensa —y en reposo es una línea recta— y la constelación está quieta.
     Además no se dibuja lo que no se ve: en el teléfono estos dos lienzos viven
     dentro de `#izq`, que es `display:none`, y se pagaban sesenta cuadros por
     segundo con dos lecturas de disposición cada uno para pintar en lienzos que
     nadie miraba nunca. */
  function ondas() {
    const c = $('#onda'), g = c?.getContext('2d');
    const cr = $('#red'), gr = cr?.getContext('2d');
    if (!g) return;
    const quieto = matchMedia('(prefers-reduced-motion: reduce)');
    const hist = new Array(120).fill(0);
    let t = 0, raf = 0, redPintada = null;
    const seVe = (cv) => cv && cv.offsetParent !== null && cv.getClientRects().length > 0;
    const medir = (cv) => {
      const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
      const w = Math.round(r.width * d), h = Math.round(r.height * d);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }   // el ALTO también: al abrir el cajón solo cambia el alto
      return { w: r.width, h: r.height, d };
    };

    function paso() {
      raf = requestAnimationFrame(paso);
      t += 0.016;
      const hablando = mente.state === 'speak' || mente.state === 'think';

      // ── la onda: la voz de ULTRON. En reposo, recta.
      if (seVe(c)) {
        const { w, h, d } = medir(c);
        if (w > 0) {
          const v = mente.state === 'speak' ? mente.nivel
            : mente.state === 'think' ? (quieto.matches ? 0.25 : 0.25 + Math.sin(t * 6) * 0.12)
              : 0;
          hist.push(v); hist.shift();
          if (hablando || hist.some((x) => x > 0.001)) {
            g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
            g.beginPath();
            hist.forEach((x, i) => { const px = (i / (hist.length - 1)) * w, py = h / 2 - (x * h * 0.42); i ? g.lineTo(px, py) : g.moveTo(px, py); });
            g.strokeStyle = COLORES[mente.state] || COLORES.idle; g.lineWidth = 1.4;
            g.shadowColor = g.strokeStyle; g.shadowBlur = 8; g.stroke(); g.shadowBlur = 0;
            g.beginPath();
            hist.forEach((x, i) => { const px = (i / (hist.length - 1)) * w, py = h / 2 + (x * h * 0.42); i ? g.lineTo(px, py) : g.moveTo(px, py); });
            g.strokeStyle = 'rgba(5,225,255,.28)'; g.lineWidth = 1; g.stroke();
          }
        }
      }

      /* ── la red de casas: un nodo por casa, CON SU NOMBRE. Seis puntos sin
         rótulo no dejan saber qué punto es qué casa: era la misma información
         del panel de al lado, con menos precisión. Y se redibuja SOLO cuando
         cambia el estado, no sesenta veces por segundo. */
      if (gr && seVe(cr)) {
        const firma = CASAS.map((x) => (ultimoVivo?.[x.k]?.vivo ? 1 : ultimoVivo?.[x.k] ? 0 : 2)).join('') + '|' + cr.width;
        if (firma !== redPintada) {
          redPintada = firma;
          const m = medir(cr);
          if (m.w > 0) {
            gr.setTransform(m.d, 0, 0, m.d, 0, 0); gr.clearRect(0, 0, m.w, m.h);
            const cx = m.w / 2, cy = m.h / 2, R = Math.min(m.w, m.h) * 0.34;
            gr.font = '600 8px ui-monospace,monospace'; gr.textAlign = 'center'; gr.textBaseline = 'middle';
            CASAS.forEach((casa, i) => {
              const a = (i / CASAS.length) * Math.PI * 2 - Math.PI / 2;    // quieta: arriba empieza
              const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R * 0.82;
              const d = ultimoVivo?.[casa.k];
              const col = !d ? 'rgba(200,208,216,.45)' : d.vivo ? '#05E1FF' : '#FF5A6E';
              gr.beginPath(); gr.moveTo(cx, cy); gr.lineTo(x, y);
              gr.strokeStyle = !d ? 'rgba(200,208,216,.18)' : d.vivo ? 'rgba(5,225,255,.30)' : 'rgba(255,90,110,.4)';
              gr.lineWidth = 1; gr.stroke();
              gr.beginPath(); gr.arc(x, y, 3, 0, 7);
              gr.fillStyle = col; gr.shadowColor = col; gr.shadowBlur = d?.vivo ? 8 : 4; gr.fill(); gr.shadowBlur = 0;
              gr.fillStyle = col;
              gr.fillText(casa.ic, x + Math.cos(a) * 11, y + Math.sin(a) * 11);
            });
            gr.beginPath(); gr.arc(cx, cy, 4, 0, 7);
            gr.fillStyle = '#E4E9EE'; gr.shadowColor = '#05E1FF'; gr.shadowBlur = 12; gr.fill(); gr.shadowBlur = 0;
          }
        }
      }
    }
    paso();
    // Con la pestaña oculta no se dibuja nada.
    document.addEventListener('visibilitychange', () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) { redPintada = null; paso(); }
    });
  }


  // ══ HABLAR Y ESCUCHAR ═════════════════════════════════════════════════════

  let locutor = null, conVoz = true, conversacionId = null, pensando = false;
  /* ── LA VOZ NO ARRANCA SOLA ───────────────────────────────────────────────
     7-sep, José: «que diga buenos días, el clima, etc., pero que no se active
     a hablar hasta que uno lo haga; solo texto hasta que toque el centro, ahí
     se activa».
     `conVoz` es la PREFERENCIA —si esta persona quiere voz o no—. Esto otro es
     el PERMISO DE ESTA SESIÓN, y empieza en no: al abrir la página ULTRON
     saluda escrito y se queda callado. Lo enciende un gesto de la persona y
     nada más: tocar el centro, abrir el micrófono, «oír todo», o probar la voz
     en los ajustes. Todos pasan por `despertarVoz`, así que basta con marcarlo
     ahí. Y de paso arregla lo de siempre en un teléfono: el navegador no deja
     sonar nada hasta que hay un toque, así que hablar antes del toque no era
     ni posible — solo parecía que ULTRON se había quedado mudo. */
  let vozDespierta = false;
  const hablaAhora = () => conVoz && vozDespierta;
  /* Qué está haciendo ULTRON ahora mismo y desde cuándo. Viven fuera de
     `enviar` porque los tocan tres sitios: el reloj de cada segundo, el evento
     de la herramienta, y la prueba. */
  let queHace = 'pensando', arranqueTurno = 0;
  /* El mando para cortar el turno en vuelo. Ver `enviar` e `interrumpir`. */
  let cancelarTurno = null;
  let envejecerTurno = () => {};   // lo rellena cada turno; solo lo usa la prueba
  let IDIOMA = 'es-HN';       // el del reconocimiento de voz; lo fija la preferencia
  let oreja = null, despierta = false;

  /* ── INTERRUMPIR ──────────────────────────────────────────────────────────
     «Si está hablando y lo interrumpo, guarde silencio y siga escuchándome.»
     Es lo que separa una conversación de un contestador: poder cortar.

     Mientras ULTRON habla se vigila el micrófono con cancelación de eco —que
     es exactamente lo que existe para que el aparato no se oiga a sí mismo—. Si
     hay voz sostenida un cuarto de segundo, se calla y abre el turno. El
     vigilante se suelta en cuanto termina de hablar: un micrófono abierto que
     nadie cierra no se hace, ni por un rato.

     Y no se enciende solo la primera vez: pedir el micrófono en cuanto alguien
     entra, sin que lo haya pedido, es exactamente lo que nadie quiere. Se
     enciende cuando la persona ya abrió la conversación o el micrófono. */
  let vigilante = null;
  async function vigilarParaInterrumpir() {
    if (vigilante || !micAutorizado) return;
    /* ── POR QUÉ ESTO NO SE HACE EN iPAD ───────────────────────────────────
       Vigilar el micrófono mientras ULTRON habla cuesta tener una captura de
       audio ABIERTA durante toda la respuesta. En iOS y iPadOS eso cambia la
       sesión de audio del sistema a «reproducir y grabar»: el sonido se va al
       auricular, baja de volumen y se entrecorta. Y encima el vigilante oye a
       ULTRON por el altavoz —la cancelación de eco del navegador no alcanza
       con el volumen alto de un iPad— y lo toma por alguien interrumpiendo,
       así que ULTRON se calla a sí mismo a media frase. Es exactamente lo que
       vio José: «se está confundiendo la voz y súper lento».

       En iPad, entonces, interrumpir es TOCAR EL CENTRO, que hace lo mismo en
       un gesto y no cuesta nada. En computadora el vigilante se queda: ahí la
       cancelación de eco funciona y la sesión de audio no cambia.

       Y NUNCA durante el saludo, en ningún aparato: mientras se contestan los
       carteles de permiso la sesión de audio se está acomodando, y un
       vigilante armado en ese momento corta la bienvenida por la mitad. */
    if (VOZ.esIOS || !saludoDicho) return;
    vigilante = await VOZ.vigilarMicrofono({
      umbral: PREF?.soloYo === false ? 0.04 : 0.07,   // «solo a mí» exige más cerca
      alHablar: () => {
        if (!locutor?.ocupado && !pensando) return;
        interrumpirTurno();
        estado('listen');
        soltarVigilante();
        /* Y se vuelve a escuchar enseguida: interrumpir para que no pase nada
           es peor que no poder interrumpir. */
        if (despierta) volverAEscuchar(); else dictar();
      },
    });
    if (vigilante?.error) { vigilante = null; }
  }
  function soltarVigilante() { try { vigilante?.soltar?.(); } catch { /* ya */ } vigilante = null; }

  /* Se sabe que hay permiso porque ya se usó el micrófono una vez: pedirlo por
     nuestra cuenta para poder interrumpir sería pedirlo sin motivo visible. */
  let micAutorizado = false;
  /* El saludo se dice una vez, al entrar, y hasta que termina no se vigila el
     micrófono para interrumpir: ver `vigilarParaInterrumpir`. */
  let saludoDicho = false;

  /* ¿El navegador YA tiene el permiso del micrófono dado? Se pregunta sin
     pedirlo. Donde no se pueda preguntar —Safari no siempre deja— se contesta
     que no: nunca se abre el micrófono por si acaso. */
  async function micYaConcedido() {
    /* ── EL FALLO QUE DEJABA A ULTRON SORDO EN EL iPAD ──────────────────────
       Esto preguntaba SIEMPRE a `navigator.permissions`, y Safari —o sea todo
       iPhone y todo iPad— NO admite consultar el permiso del micrófono por ahí:
       la llamada se rechaza y aquí se contestaba «no concedido». Con eso, la
       conversación no se abría nunca sola: ULTRON saludaba, se callaba, y para
       que escuchara había que tocar el centro cada vez. Con estas palabras lo
       dijo José: «puede hablar, y hasta que presiones ULTRON en medio me
       escucha».

       Y era falso: el permiso YA estaba dado —lo pedimos al entrar y lo dio—.
       Si ya se abrió el micrófono una vez en esta visita, no hay nada que
       preguntar. Lo que uno sabe no se va a preguntar a una oficina que no
       atiende. */
    if (micAutorizado) return true;
    try {
      const p = await navigator.permissions?.query?.({ name: 'microphone' });
      if (p?.state === 'granted') { micAutorizado = true; return true; }
      return false;
    } catch { return false; }
  }

  /* ── LAS MULETILLAS: lo que dice mientras piensa ──────────────────────────
     Entre la pregunta y la respuesta del nodo pueden pasar veinte segundos de
     silencio, y un silencio así se siente como que el aparato se colgó.

     TRES REGLAS, y las tres son por lo que se oye:
       · No al azar del todo. Si está corriendo una herramienta, se dice algo de
         ESA herramienta —«déjeme leer los números»— que es más vivo y no cuesta
         nada, porque ya se sabe cuál está corriendo. Al azar solo cuando no hay
         nada concreto que decir.
       · Nunca la misma dos veces seguidas. Siete frases sin memoria se vuelven
         un tic en dos días.
       · Solo si la espera pasa de segundo y medio. Si contesta rápido, hablar
         encima de la respuesta es peor que el silencio. */
  const GRUPO_DE = {
    estado_vivo: 'datos', cotizar: 'datos', ordenex_mercado: 'datos', cadena_altura: 'datos',
    parte_del_dia: 'datos', salud_revisar: 'datos', mongo_consultar: 'datos', clima: 'datos',
    buscar_web: 'buscar', leer_pagina: 'buscar', buscar_saber: 'buscar', buscar_conversaciones: 'buscar',
    leer_archivo: 'archivo', listar_archivos: 'archivo', leer_documento: 'archivo',
  };
  let muletillas = null, ultimaMuletilla = '', relojMuletilla = null;

  const cargarMuletillas = () => DATOS.get('/voz/muletillas')
    .then((d) => { muletillas = d.hay ? d.muletillas : []; }).catch(() => { muletillas = []; });

  /* Se toca con su propio elemento de audio, aparte del locutor: si usara el
     mismo, la muletilla y la primera frase de la respuesta se pisarían. */
  let audioMuletilla = null;
  function decirMuletilla(grupo = 'general') {
    if (!hablaAhora() || !muletillas?.length) return;
    const delGrupo = muletillas.filter((m) => m.grupo === grupo);
    const donde = delGrupo.length ? delGrupo : muletillas.filter((m) => m.grupo === 'general');
    const posibles = donde.filter((m) => m.texto !== ultimaMuletilla);
    const m = (posibles.length ? posibles : donde)[Math.floor(Math.random() * (posibles.length || donde.length))];
    if (!m) return;
    ultimaMuletilla = m.texto;
    try {
      audioMuletilla = audioMuletilla || new Audio();
      audioMuletilla.playsInline = true;
      audioMuletilla.src = `/voz/muletilla/${encodeURIComponent(m.grupo)}/${m.i}`;
      audioMuletilla.play().catch(() => { /* sin permiso todavía: se calla, no se rompe */ });
    } catch { /* nada */ }
  }
  function pararMuletillas() { clearTimeout(relojMuletilla); relojMuletilla = null; try { audioMuletilla?.pause?.(); } catch { /* ya */ } }
  function muletillaTrasEspera(grupo, ms = 1500) {
    clearTimeout(relojMuletilla);
    relojMuletilla = setTimeout(() => decirMuletilla(grupo), ms);
  }

  /* ── DESPERTAR LA VOZ ─────────────────────────────────────────────────────
     Se llama DENTRO de un gesto de la persona —el clic de Ingresar, un toque
     en la pantalla, una tecla— y es lo que le da al navegador el permiso para
     que ULTRON hable después, cuando la respuesta llega del servidor y ya no
     nace de ningún gesto. En iOS ese permiso es del ELEMENTO de audio, así que
     hay que hacerlo antes de la primera frase o no suena ninguna. */

  /* Teclado Android/iOS: la barra de escribir sube con visualViewport. */
  (function tecladoMovil(){
    const vv = window.visualViewport;
    if (!vv) return;
    const aplicar = () => {
      const pie = document.getElementById('pie');
      if (!pie) return;
      const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      pie.style.paddingBottom = 'calc(10px + env(safe-area-inset-bottom,0px) + ' + gap + 'px)';
    };
    vv.addEventListener('resize', aplicar);
    vv.addEventListener('scroll', aplicar);
    window.addEventListener('focusin', aplicar);
    window.addEventListener('focusout', () => { const pie=document.getElementById('pie'); if(pie) pie.style.paddingBottom=''; });
  })();

  function despertarVoz() {
    vozDespierta = true;
    locutor = locutor || locutorNuevo();
    locutor.despertar?.();
    /* Y con el MISMO gesto, el audio de las muletillas. Son dos elementos
       distintos a propósito —si compartieran uno, la muletilla y la primera
       frase de la respuesta se pisarían— y en iOS el permiso es de cada
       elemento: el locutor se desbloqueaba y el de las muletillas no, así que
       en el iPad no se oyó una muletilla nunca. */
    audioMuletilla = audioMuletilla || new Audio();
    VOZ.desbloquear?.(audioMuletilla);
    return true;
  }

  function locutorNuevo() {
    const l = new VOZ.Locutor({
      conElevenLabs: true,
      alNivel: (n) => { mente.nivel = n; },
      alEmpezar: () => { estado('speak'); vigilarParaInterrumpir(); },
      alTerminar: () => { mente.nivel = 0; soltarVigilante(); if (!pensando) estado('idle'); },
      alFallo: (q) => avisar(`La voz del navegador tomó el relevo (${q}).`, false),
    });
    l.vozId = PREF?.vozId || null;      // la voz que la persona eligió, no la de la casa
    return l;
  }

  /* DE DÓNDE SALIÓ. Un tablero de junta del que no se puede decir «esta cifra
     la leyó de Ordenex a las 04:12» no se puede citar en un acta. Las
     herramientas que ULTRON usó para contestar quedan escritas bajo la
     respuesta, con la hora. */
  function pintarFuentes(usadas) {
    const f = $('#fuentes'); if (!f) return;
    if (!usadas?.length) { f.classList.add('oculto'); f.textContent = ''; return; }
    const unicas = [...new Set(usadas)];
    f.classList.remove('oculto');
    f.textContent = `Leído ${new Date().toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })} ${ZONA} · ${unicas.join(' · ')}`;
  }

  /* Al lector de pantalla se le anuncia UNA vez, al final. Anunciar cada trozo
     del flujo haría que repitiera la respuesta entera decenas de veces. */
  function anunciar(md) {
    const l = $('#lector-vivo'); if (!l) return;
    l.textContent = window.VOZ?.paraDecir ? VOZ.paraDecir(md) : String(md || '');
  }

  /* En el teléfono, el dedo. El globo ya deja pasar el toque por su marco, pero
     el TEXTO seguía tapando parte del botón de hablar. Cuando la respuesta cabe
     entera no hay nada que desplazar, así que el texto tampoco tiene por qué
     atrapar el toque: se lo deja al botón. Cuando NO cabe, se queda con él,
     porque desplazar una respuesta larga con el dedo es lo que hay que poder
     hacer. Solo en aparatos de dedo: con ratón se pierde poder seleccionar el
     texto para copiar una cifra, y eso pesa más que un cuarto del botón. */
  const dedo = matchMedia('(hover:none) and (pointer:coarse)');

  function asegurarLightbox() {
    if (document.getElementById('ultron-lbox')) return;
    const s = document.createElement('style');
    s.textContent = '#ultron-lbox{position:fixed;inset:0;z-index:80;background:rgba(0,8,16,.92);display:none;flex-direction:column;align-items:center;justify-content:center;padding:12px;gap:10px}'
      + '#ultron-lbox.on{display:flex}'
      + '#ultron-lbox img{max-width:96vw;max-height:78vh;object-fit:contain;border-radius:8px}'
      + '#ultron-lbox .lb-bar{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}'
      + '#dicho img,#archivos img.arch-th{cursor:zoom-in;max-width:100%;border-radius:6px}';
    document.head.appendChild(s);
    const box = document.createElement('div');
    box.id = 'ultron-lbox';
    box.innerHTML = '<img alt="foto"><div class="lb-bar"><a class="chip" id="lb-dl" download>DESCARGAR</a><button class="chip" type="button" id="lb-x">CERRAR</button></div>';
    document.body.appendChild(box);
    box.addEventListener('click', (e) => { if (e.target === box || e.target.id === 'lb-x') box.classList.remove('on'); });
  }
  function abrirLightbox(src, nombre) {
    asegurarLightbox();
    const box = document.getElementById('ultron-lbox');
    const img = box.querySelector('img');
    const dl = document.getElementById('lb-dl');
    img.src = src;
    dl.href = src;
    dl.setAttribute('download', nombre || 'ultron.png');
    box.classList.add('on');
  }
  document.addEventListener('click', (e) => {
    const im = e.target && e.target.closest && e.target.closest('#dicho img, img.arch-th');
    if (!im) return;
    e.preventDefault();
    abrirLightbox(im.currentSrc || im.src, im.getAttribute('alt') || 'foto');
  });

  function pintarDicho(md) {
    $('#globo').classList.remove('oculto');
    const d = $('#dicho');
    d.innerHTML = window.MARKDOWN ? MARKDOWN.aHtml(md) : esc(md);
    d.scrollTop = d.scrollHeight;
    if (dedo.matches) d.style.pointerEvents = d.scrollHeight > d.clientHeight + 2 ? 'auto' : 'none';
  }

  /* El botón de «oír el resto». Sale junto a las sugerencias, con la misma
     forma, porque es lo mismo: algo que se puede tocar y que no molesta si no. */
  function chipsMas(texto) {
    const c = $('#chips');
    if (!c || !texto) return;
    c.classList.remove('oculto');
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = 'OÍR TODO';
    /* `propio`: este botón se maneja solo. Sin esto, el manejador de la barra
       de chips ADEMÁS le mandaba a ULTRON la pregunta «OÍR TODO». */
    b.dataset.propio = '1';
    b.onclick = () => {
      b.remove();
      despertarVoz();
      locutor.callar();
      locutor.tope = 0;                 // esta vez, entero
      locutor.alimentar(texto); locutor.cerrar();
      locutor.tope = 900;               // y la próxima vez, como siempre
    };
    c.prepend(b);
  }

  /* ── LOS BOTONES QUE ULTRON DEJA ─────────────────────────────────────────
     Se pintaban con `acciones.map(a => a.nombre)`, y `nombre` solo lo trae UNA
     de las diez clases de acción: las demás salían como botones EN BLANCO que
     al tocarlos le mandaban a ULTRON una pregunta vacía. Y las que sí tenían
     nombre —«abrir Ordenex», «el memo en PDF»— tampoco abrían nada: el clic
     mandaba el rótulo como si fuera una pregunta.
     Ahora una acción es un botón solo si de verdad hay algo que tocar, y lo
     que hace al tocarlo es lo que dice. Lo que no es para la persona —un
     pedido esperando aprobación, un secreto aplicado— ya tiene su sitio en el
     panel del DUEÑO y aquí sería ruido. */
  /* Pinta «QUÉ ESTÁ HACIENDO · N s». Sale aparte para que la prueba pueda
     comprobar que el reloj NO lo borra al segundo siguiente, que es el fallo
     que José vio: el nombre de la herramienta aparecía y desaparecía. */
  function marcarQueHace(hace) {
    if (hace) queHace = hace;
    const e = $('#estado-txt');
    if (e) e.textContent = `${String(queHace).toUpperCase()} · ${Math.round((Date.now() - (arranqueTurno || Date.now())) / 1000)} s`;
  }

  function chips(acciones) {
    const c = $('#chips');
    const botones = (acciones || []).map((a) => {
      if (typeof a === 'string') return { texto: a };
      if (a?.tipo === 'abrir' && a.url) return { texto: a.nombre || 'Abrir', url: a.url };
      if (a?.tipo === 'pr' && a.url) return { texto: `Ver el cambio propuesto (${a.rama || 'rama'})`, url: a.url };
      /* El del hilo no abre una pestaña: abre el día aquí mismo. */
      if (a?.tipo === 'hilo' && a.conv) return { texto: a.nombre || 'Ver todo el hilo', conv: a.conv };
      if (a?.tipo === 'seguir') return { texto: a.nombre || 'SEGUIR CON ESTO', seguir: true };
      /* ── EL PERMISO, A UN TOQUE ─────────────────────────────────────────
         La acción viajaba desde siempre y el tablero no la pintaba: el pedido
         se quedaba esperando INVISIBLE en el panel de autorizaciones, y ULTRON
         repetía «en cuanto lo apruebe, sigo» sin que nadie supiera qué había
         que aprobar. Ahora es un botón, y al aprobarlo sigue solo. */
      if (a?.tipo === 'autorizacion' && a.id) return { texto: `APROBAR: ${a.resumen || 'lo que pidió'}`, aprobar: a.id };
      return null;
    }).filter((b) => b && b.texto);
    if (!botones.length) { c.classList.add('oculto'); c.innerHTML = ''; return; }
    c.classList.remove('oculto');
    c.innerHTML = botones.map((b) => `<button class="chip"${b.url ? ` data-url="${esc(b.url)}"` : ''}${b.conv ? ` data-conv="${esc(b.conv)}"` : ''}${b.seguir ? ' data-seguir="1"' : ''}${b.aprobar ? ` data-aprobar="${esc(b.aprobar)}"` : ''}>${esc(b.texto)}</button>`).join('');
  }

  /**
   * @param texto  lo que se le dice a ULTRON
   * @param porVoz true si entró por el micrófono. NO es un detalle: manda
   *   `modo:'voz'` al servidor, que es lo que hace que la respuesta venga corta
   *   y hecha para oírse en vez de para leerse. El tablero mandaba SIEMPRE
   *   `texto`, así que la rama de voz del cerebro no se usaba nunca — estaba
   *   escrita, probada, y muerta.
   */
  async function enviar(texto, porVoz = false) {
    const t = String(texto || '').trim();
    if (!t) return;
    /* ── SI YA ESTABA PENSANDO, ESTO ES UNA INTERRUPCIÓN ────────────────────
       Antes se descartaba en silencio: José interrumpía a ULTRON hablando, y
       la frase con la que interrumpió desaparecía sin un ruido. Ahora manda la
       nueva: se corta la anterior y se sigue con ésta, que es lo que uno
       espera cuando interrumpe a alguien. */
    if (pensando) {
      interrumpirTurno();
      await new Promise((ok) => setTimeout(ok, 60));
    }
    pensando = true; $('#enviar').disabled = true;
    $('#texto').value = ''; $('#texto').style.height = 'auto';
    estado('think', 'think');
    /* ── QUE SE VEA QUE ESTÁ TRABAJANDO, Y CUÁNTO LLEVA ────────────────────
       Un turno escrito tarda veinte o treinta segundos. Durante todo ese rato
       la pantalla decía «ANALIZANDO» y nada más: quieto, sin una cifra, igual
       que si estuviera colgado. Y como se ve colgado, uno vuelve a mandar la
       pregunta — que ahora MATA el turno anterior y empieza otra espera de
       treinta segundos. Así se queda pegado de verdad, y pasó el 7-sep.
       Un contador no acelera nada, pero convierte «no responde» en «lleva 14
       segundos», que es lo que hace que uno espere en vez de insistir. */
    const arranque = Date.now();
    let ultimaSeñal = Date.now();
    /* ── QUÉ ESTÁ HACIENDO, NO SOLO CUÁNTO LLEVA ──────────────────────────
       7-sep, José: «pasa los 45 seg y no se sabe si está o no está haciendo
       algo». El nombre de la herramienta SÍ llegaba y se pintaba... y un
       segundo después este mismo reloj lo borraba con «PENSANDO 23 s». Lo
       único que quedaba en pantalla era un contador.
       Ahora las dos cosas juntas: «LEYENDO EL CÓDIGO · 23 s». Se ve que
       avanza y se ve en qué. */
    queHace = 'pensando'; arranqueTurno = arranque;
    try { window.ULTRON_TALLER && window.ULTRON_TALLER.inicio(); } catch {}
    const relojPensar = setInterval(() => {
      if (!pensando) return;
      const s = Math.round((Date.now() - arranque) / 1000);
      const e = $('#estado-txt');
      if (e && (mente.state === 'think')) e.textContent = `${queHace.toUpperCase()} · ${s} s`;
      /* ── Y SI SE QUEDA MUDO DE VERDAD ─────────────────────────────────
         Todas las demás llamadas llevan su reloj; ésta no, a propósito,
         porque un turno con herramientas puede ser largo. Pero «puede ser
         largo» no es «para siempre»: si no llega NADA —ni texto, ni una
         herramienta, ni el latido de una vuelta— en cuarenta y cinco
         segundos, se dice, y a los noventa se corta y se devuelve el
         renglón. Quedarse en «analizando» sin fin es lo peor de todo,
         porque no se puede ni esperar ni reintentar. */
      /* El vigilante mide SILENCIO, no duración: mientras llegue una vuelta o
         una herramienta, el turno está vivo por largo que sea. Sube de 45/90 a
         60/150 porque ahora un turno de trabajo de verdad —abrir la caja,
         mirar dónde está el código, leer dos archivos— pasa del minuto, y
         cortarlo a los noventa era cortar justo lo que se le pidió. */
      const mudo = Math.round((Date.now() - ultimaSeñal) / 1000);
      if (mudo === 60) avisar('ULTRON lleva 60 s sin mandar señal. Puede seguir esperando, o tocar el centro para cortar.', false);
      if (mudo >= 150) { avisar('ULTRON no dio señal en 150 s. Se cortó: vuelva a preguntar.', true); interrumpirTurno(); }
    }, 1000);
    const señal = () => { ultimaSeñal = Date.now(); };
    /* Para la prueba: mover el reloj del silencio hacia atrás, y no esperar
       noventa segundos de verdad para comprobar que corta. */
    envejecerTurno = (segundos) => { ultimaSeñal = Date.now() - segundos * 1000; };
    pintarDicho('');
    chips(null);
    let acum = ''; const usadas = [];
    pintarFuentes(null);
    /* UN SOLO LOCUTOR para toda la sesión. Antes se creaba uno por mensaje y el
       anterior se quedaba con su temporizador de 40 Hz corriendo: treinta
       preguntas, treinta temporizadores huérfanos. */
    locutor?.callar?.();
    if (hablaAhora()) { locutor = locutor || locutorNuevo(); locutor.despertar?.(); muletillaTrasEspera('general'); }

    /* try/finally, y no es adorno. `DATOS.pensar` abre un SSE que puede durar
       veinte segundos; en un teléfono que cambia de celda a mitad, la promesa
       RECHAZA y sin este envoltorio la ejecución nunca llegaba a devolver el
       botón: `pensando` se quedaba en true y ENVIAR deshabilitado para siempre.
       La consola quedaba muerta hasta recargar, en la ruta principal del
       producto y con la avería más común que hay. */
    /* El mando para cancelar este turno. Vive fuera para que interrumpir —por
       voz o tocando el centro— pueda cortarlo desde cualquier sitio. */
    cancelarTurno = new AbortController();
    const miMando = cancelarTurno;
    try {
      await DATOS.pensar(t, { conversacionId, modo: porVoz ? 'voz' : 'texto', señal: miMando.signal }, {
        /* El servidor emite `inicio`, no `abre`. Con el nombre equivocado el id
           de la conversación no se recogía NUNCA, así que cada pregunta del
           mismo rato abría hilo nuevo hasta que el servidor lo arreglaba por su
           cuenta con la conversación del día. */
        inicio: (d) => { señal(); conversacionId = d.conversacionId || conversacionId; },
        texto: (d) => {
          señal();
          if (!acum) pararMuletillas();      // empezó a contestar: nada de hablar encima
          acum += d.t || ''; pintarDicho(acum);
          if (hablaAhora()) locutor?.alimentar?.(d.t || '');
        },
        /* Cada vuelta de herramientas emite `pensando`: es la señal de que
           sigue vivo aunque todavía no haya escrito una letra. */
        pensando: (d) => { señal(); if (d?.hace) queHace = d.hace; },
        /* ── EL SERVIDOR SE CORRIGE A MITAD ─────────────────────────────
           Cuando el modelo se engancha repitiendo, la guarda del nodo corta el
           turno donde empezó el bucle y manda `reemplazo` con el texto bueno.
           El tablero no escuchaba ese evento: en pantalla quedaba el texto con
           la repetición Y, peor, la voz seguía leyendo en alto lo que el
           servidor ya había tachado. */
        reemplazo: (d) => {
          if (typeof d?.texto !== 'string') return;
          acum = d.texto; pintarDicho(acum);
          try { locutor?.olvidarLoQueFalta?.(); } catch { /* nada */ }
        },
        herramienta: (d) => {
          señal();
          if (!acum) muletillaTrasEspera(GRUPO_DE[d.nombre] || 'general', 700);
          const n = String(d.nombre || '').toUpperCase().replace(/_/g, ' ');
          /* La frase de persona la manda el servidor; el nombre crudo se guarda
             para el pie de la respuesta, donde sí se quiere el exacto. */
          marcarQueHace(d.hace || n);
          usadas.push(n);
          try { window.ULTRON_TALLER && window.ULTRON_TALLER.paso(d); } catch {}
        },
        fin: (d) => {
          try { window.ULTRON_TALLER && window.ULTRON_TALLER.fin({ ok: !d?.error }); } catch {}
          señal();
          /* El cronómetro del turno, a la vista. «Se traba» y «va lento» eran
             quejas sin un número al lado; ahora el panel del cerebro dice
             cuánto tardó la primera palabra, que es el silencio que se siente. */
          if (d?.ms?.total) { ultimoTurno = { primera: d.ms.primera || d.ms.total, total: d.ms.total }; pintarSalud(saludUltima); }
          if (d?.texto) { acum = d.texto; pintarDicho(acum); }
          if (hablaAhora()) locutor?.cerrar?.(); else estado('idle');
          /* ── SI QUEDÓ TRABAJO, UN TOQUE LO SIGUE ────────────────────────
             Un turno son seis vueltas y noventa segundos: para «mejorá el
             tablero» no alcanza, y hasta ahora lo averiguado moría ahí. Cuando
             el servidor dice que quedó algo a medias, el primer botón es
             SEGUIR — y ULTRON retoma por el paso siguiente en vez de empezar
             de cero. */
          const acs = [...(d?.acciones || [])];
          if (d?.trabajo?.falta) acs.unshift({ tipo: 'seguir', nombre: 'SEGUIR CON ESTO' });
          chips(acs.length ? acs : null);
          /* ── SI PIDIÓ PERMISO, SE PREGUNTA EN LA CARA ────────────────────
             7-sep, José: «si ocupa acceso para hacer algo, que me tire un pop
             up para aceptar y darle permiso». Y tenía razón: el botón de
             aprobar quedaba entre los demás, abajo del todo, y en el teléfono
             ni se veía — así que ULTRON se quedaba parado esperando un clic
             que nadie sabía que existía.
             Ahora sale la ventana con el comando EXACTO delante. Se lee lo que
             va a correr y se decide; eso es lo que hace que dar permiso no sea
             firmar en blanco. */
          const pide = (d?.acciones || []).find((a) => a?.tipo === 'autorizacion' && a.id);
          if (pide) setTimeout(() => pedirPermiso(pide), 400);
          /* De dónde salió la cifra. Un tablero de junta del que no se puede
             decir «esto lo leyó de Ordenex a las 04:12» no se puede citar en un
             acta. Las herramientas usadas quedan escritas bajo la respuesta. */
          pintarFuentes(usadas);
          anunciar(acum);                       // una sola vez, para el lector de pantalla
          cargarArchivos();
          DATOS.get('/pendientes').then(pintarPendientes).catch(() => {});
          DATOS.get('/autorizaciones').then(pintarAutorizaciones).catch(() => {});
      DATOS.get('/propuestas').then(pintarPropuestas).catch(() => {});
        },
        /* El servidor manda `{mensaje, codigo}`. Se pintaba el objeto entero, así
         que en el peor momento —el cerebro fallando a mitad de la respuesta—
         el aviso decía «[object Object]». */
        error: (d) => {
          const msj = typeof d === 'string' ? d : (d?.mensaje || d?.error || 'ULTRON no pudo contestar.');
          estado('error', 'concern'); avisar(msj, true); setTimeout(() => estado('idle', 'neutral'), 2600);
        },
      });
    } catch (e) {
      if (e?.name === 'AbortError' || miMando.signal.aborted) {
        /* Cancelado a propósito: no es un fallo y no se pinta como tal. */
      } else {
        estado('error', 'concern');
        avisar(`Se cortó la conexión con ULTRON: ${e?.message || e}`, true);
        setTimeout(() => { if (mente.state === 'error') estado('idle', 'neutral'); }, 3200);
      }
    } finally {
      clearInterval(relojPensar);
      if (cancelarTurno === miMando) cancelarTurno = null;
      /* Y se apaga la muletilla: si el turno se corta antes de la primera
         letra, el temporizador seguía vivo y ULTRON decía «déjeme ver» encima
         del mensaje de error. */
      pararMuletillas();
      pensando = false; $('#enviar').disabled = false;
      if (mente.state !== 'speak' && mente.state !== 'error') estado('idle', 'neutral');
      /* Si la voz se cortó por larga, se ofrece oírla entera. Es un botón y no
         una pregunta: quien quiere el resto lo toca, y quien no, no oye nada. */
      if (hablaAhora() && locutor?.cortado) chipsMas(acum);
    }
  }

  /**
   * Cortar el turno en vuelo: se aborta la conexión, se calla la voz y se
   * apagan las muletillas. El servidor deja de generar y la ranura del modelo
   * queda libre — que es lo que hacía que interrumpir no sirviera de nada.
   */
  function interrumpirTurno() {
    try { cancelarTurno?.abort(); } catch { /* ya */ }
    cancelarTurno = null;
    pararMuletillas();
    try { locutor?.callar(); } catch { /* ya */ }
    pensando = false;
    const b = $('#enviar'); if (b) b.disabled = false;
  }

  /* ── «HEY ULTRON» ──────────────────────────────────────────────────────────
     La oreja queda abierta esperando SOLO la palabra que despierta: mientras no
     se dice «ultron», nada de lo que capta se usa para nada. Se enciende a mano
     y se apaga a mano, y el botón lo dice — un micrófono que se queda abierto
     solo, sin que se vea, es exactamente lo que nadie quiere en su casa.

     LO QUE HAY QUE DECIR CON TODAS LAS LETRAS: el reconocimiento del navegador
     NO es local en el escritorio. Chrome y Edge mandan el audio a su proveedor
     mientras el reconocedor está abierto. Aquí decía lo contrario —«no se manda
     audio a ningún lado»— y era falso justo en el navegador que la propia
     pantalla recomienda. Con una junta hablando de sanciones y tasas al alcance
     del micrófono, eso no es un matiz: se avisa al encender. */
  /* LA PALABRA, CON SUS ERRORES. El reconocedor casi nunca escribe «ultron»:
     escribe «ultra», «ultrón», «el tron», «hultron», «ultran», «ultrom». Con la
     lista corta de antes, José tenía que repetirla tres veces —«no es
     sensible»—. Cada variante de aquí es un intento suyo que se perdía.
     El precio de ampliarla es alguna falsa alarma; el precio de no ampliarla es
     que la función no sirve, que es peor. */
  const DESPIERTA = /\b(?:hey|hei|ey|oye|okay|ok|he)?\s*(?:ul|hul|al|el\s)?(?:tr[oó]n|ultr[oó]n?|ultra|ultran|ultrom|ultro)\b/i;
  let cicloOreja = 0;                 // token: solo el ciclo vigente puede reprogramar

  /* ── DOS MANERAS DE ESCUCHAR, PORQUE HAY DOS MUNDOS ───────────────────────
     La palabra que despierta necesita un reconocimiento CONTINUO: abierto,
     escuchando, sin que nadie lo toque. Eso existe en Chrome y NO existe en
     Safari —o sea, en todo iPhone y iPad—: ahí `continuous` se ignora, la
     sesión se cierra sola a los pocos segundos de silencio y cada reapertura
     pelea con el audio, porque iOS conmuta la tarjeta entre grabar y sonar.
     El síntoma que vio José en el iPad fue exacto: el botón encendido y
     «cuesta que me escuche».
     Así que en iOS la oreja hace lo que SÍ se puede y encima es mejor para
     una conversación: modo CONVERSACIÓN. Un toque y ULTRON escucha un turno,
     contesta en voz alta y vuelve a abrir el micrófono. Sin palabra que
     despierta —que ahí no funciona— y sin tener que tocar entre turno y turno.
     No se promete lo que el aparato no puede: se cambia lo que se ofrece. */
  /* Cuándo la oreja es «conversación» y cuándo es «palabra que despierta»:
       · Si la persona eligió un modo en Ajustes, manda ese.
       · Si no, en iOS conversación —la palabra no funciona en Safari— y en los
         demás, la palabra.
     La palabra que despierta es para cuando el micrófono está CERRADO: es la
     manera de abrirlo sin tocar. Con la conversación abierta no hace falta
     decirla, que es lo que pidió José: «el hey ULTRON es solo cuando no quiero
     me digas escuchando». */
  const CONVERSACION = () => (PREF?.oido === 'conversacion' ? true : PREF?.oido === 'palabra' ? false : !!VOZ.esIOS);

  function orejaEncender() {
    if (!VOZ.hayOido?.()) { avisar(VOZ.porQueNoOye?.() || 'No hay reconocimiento de voz aquí.', true); return; }
    micAutorizado = true;
    despierta = true;
    $('#oreja').setAttribute('aria-pressed', 'true');
    despertarVoz();                        // el toque que enciende es el gesto que da el permiso
    if (CONVERSACION()) {
      avisar('Conversación abierta: hable y ULTRON contesta; al terminar vuelve a escucharlo. Toque otra vez para cerrar.');
      dictar(volverAEscuchar);
      return;
    }
    avisar('Oreja abierta: diga «hey ULTRON». Mientras esté encendida, su navegador manda el audio a su proveedor de reconocimiento.');
    escucharPalabra();
  }

  /* El eslabón de la conversación: cuando ULTRON termina de hablar, se vuelve a
     abrir el micrófono. Con una pausa corta, para no grabar la cola de su
     propia voz saliendo del altavoz. */
  let seguidasEnVacio = 0;      // reconocimientos que fallaron uno detrás de otro
  function volverAEscuchar() {
    if (!despierta) return;
    /* ── CUÁNDO SE VUELVE A ESCUCHAR ────────────────────────────────────────
       Esto se dispara cuando el RECONOCEDOR termina, que es en cuanto la
       persona deja de hablar — y para entonces ULTRON todavía está pensando o
       hablando. Volvía a abrir el micrófono ENCIMA de su propia voz: en iPad
       eso cambia la sesión de audio y entrecorta el sonido, y en cualquier
       aparato ULTRON se oye a sí mismo y contesta a lo que acaba de decir.
       Se espera a que haya terminado de pensar Y de hablar. Es la diferencia
       entre una conversación y dos personas hablando a la vez. */
    const listo = () => {
      if (!despierta) return;
      if (pensando || locutor?.ocupado) { setTimeout(listo, 300); return; }
      /* «SOLO EL BOTÓN» QUIERE DECIR SOLO EL BOTÓN. Con ese ajuste puesto, un
         toque en el centro dejaba el micrófono abierto para siempre: al
         terminar el dictado se volvía a abrir, y en el aparato de escritorio
         encima se quedaba escuchando «hey ULTRON». Quien elige «solo el botón»
         está diciendo que no quiere un micrófono abierto en su oficina, y el
         ajuste tiene que valer más que la comodidad de no volver a tocar. Un
         toque, un turno. */
      if (PREF?.oido === 'apagado') { orejaApagar(); estado('idle'); return; }
      if (CONVERSACION()) dictar(volverAEscuchar); else escucharPalabra(0);
    };
    setTimeout(listo, 450);
  }

  /* ── EL TOQUE EN EL CENTRO ────────────────────────────────────────────────
   * «Cambiemos el tocar el centro donde está ULTRON: darle click y nos
   * escuche, se pone en verde y aparezca "te estoy escuchando"; y si vuelvo a
   * tocar el centro lo interrumpo para que me escuche nuevamente.»
   *
   * El centro es lo más grande de la pantalla y hasta ahora solo giraba. Es el
   * botón que cualquiera busca primero, y ahora es el que hace lo único que
   * importa: hablarle. El verde y el rótulo ya los pone `estado('listen')`.
   *
   * INTERRUMPIR ES LO MISMO QUE EMPEZAR. Si está hablando, el toque lo calla y
   * abre el micrófono en el mismo gesto — no hay que tocar dos veces ni buscar
   * otro botón. Es la versión a mano de lo que el vigilante del micrófono ya
   * hace con la voz.
   */
  const YA_SABE = 'ultron.ya-sabe-hablar';
  function toqueNucleo() {
    /* La pista está para enseñar que el centro se toca. Usado una vez, sobra:
       se va y no vuelve, en este aparato y en los siguientes que abra. */
    try { localStorage.setItem(YA_SABE, '1'); } catch { /* modo privado */ }
    document.body.classList.add('ya-sabe-hablar');
    despertarVoz();                       // el toque ES el gesto que da permiso
    if (mente.state === 'listen') { orejaApagar(); avisar('Micrófono cerrado.'); return; }
    /* Hablando o pensando: se corta el turno entero —la conexión, la voz y las
       muletillas— y se escucha. Interrumpir tiene que ser inmediato: no basta
       con callar la bocina si el servidor sigue redactando. */
    if (locutor?.ocupado || mente.state === 'speak' || mente.state === 'think' || pensando) {
      /* CANCELA DE VERDAD. Antes solo se callaba la voz: el servidor seguía
         generando, ocupaba la única ranura del modelo, y dos segundos después
         ULTRON empezaba a hablar encima de la persona. */
      interrumpirTurno();
    }
    escucharYa();
  }

  /* ══ EL BOTÓN DE HABLAR ═════════════════════════════════════════════════════
   * «Botón de en medio, mejorar para hablar; que se haga fluido, bien touch y
   * con el mouse que funcione bien, y agregar air touch.»
   *
   * Antes esto era un oyente de toques sobre TODA la pantalla, filtrado por
   * quién recibió el evento. Tres cosas malas: el micrófono se abría tocando
   * cualquier hueco del fondo, no había NADA que dijera que el centro se podía
   * tocar, y con el teclado no había manera de llegar.
   *
   * Ahora es un `<button>` de verdad, del tamaño del núcleo y encima del
   * núcleo. Eso trae gratis lo que costaba escribir a mano: el tabulador llega,
   * Enter y la barra lo disparan, el lector de pantalla lo anuncia como un
   * botón, y el navegador ya sabe qué es un toque y qué es un arrastre.
   *
   * Lo que sí hay que escribir a mano son tres cosas:
   *   · DÓNDE va. Lo dice el propio dibujo, no una copia de sus números.
   *   · QUÉ es un arrastre. El botón tapa el núcleo, así que recoge el
   *     arrastre y se lo pasa al dibujo para que siga girando. Y el umbral es
   *     más ancho con el dedo que con el ratón: un dedo se mueve doce píxeles
   *     en un toque que nadie diría que se movió.
   *   · ACERCARSE. El «air touch»: el núcleo se enciende antes de que lo
   *     toquen. Vale para el ratón, para el lápiz que flota sobre un iPad y
   *     para cualquier puntero que el aparato vea sin contacto.
   */
  const UMBRAL = { mouse: 6, pen: 12, touch: 16 };

  function botonDeHablar() {
    const b = $('#hablar'); if (!b) return;

    /* ── DÓNDE VA ────────────────────────────────────────────────────────
       La posición sale de `UltronNucleo.zona()`, que la calcula el mismo
       código que dibuja el núcleo. Se vuelve a preguntar al cambiar de tamaño
       y al cambiar de figura; entre medias no cambia, así que no hay nada que
       recalcular en cada cuadro.
       El blanco es el 75 % del radio del núcleo: generoso para el dedo y sin
       tragarse media pantalla como antes. */
    let zona = null;
    const colocar = () => {
      zona = window.__ULTRON_FIGURA_VIVA?.zona?.() || null;
      const r = document.documentElement.style;
      if (zona) {
        r.setProperty('--nx', `${zona.cx}px`);
        r.setProperty('--ny', `${zona.cy}px`);
        r.setProperty('--nr', `${Math.round(zona.r * 1.5)}px`);
      } else {
        /* El busto en tres dimensiones no publica su geometría: se cae a algo
           razonable en vez de dejar el botón en una esquina. */
        r.setProperty('--nx', '50%'); r.setProperty('--ny', '46%');
        r.setProperty('--nr', `${Math.round(Math.min(innerWidth * .45, innerHeight * .5))}px`);
      }
      document.body.classList.add('puede-hablar');
    };
    /* «Toque» con el dedo y «pulse» con el ratón. Decirle «toque» a quien
       tiene un ratón delante es pedirle que haga algo que no puede hacer. */
    const pista = $('#pista-hablar');
    if (pista) pista.textContent = matchMedia('(hover:hover) and (pointer:fine)').matches ? 'PULSE PARA HABLAR' : 'TOQUE PARA HABLAR';
    try { if (localStorage.getItem(YA_SABE)) document.body.classList.add('ya-sabe-hablar'); } catch { /* modo privado */ }
    colocar();
    addEventListener('resize', colocar);
    addEventListener('ultron-holo-ready', colocar);
    /* La figura tarda un instante en montarse; si todavía no estaba, se
       coloca en cuanto esté. */
    if (!window.__ULTRON_FIGURA_VIVA) setTimeout(colocar, 600);

    /* ── TOCAR, Y ARRASTRAR ──────────────────────────────────────────────
       `setPointerCapture` es lo que hace que el arrastre siga funcionando
       aunque el dedo se salga del botón: sin él, sacar el dedo del círculo a
       media vuelta soltaba el giro en seco. */
    let baja = null;
    b.addEventListener('pointerdown', (e) => {
      baja = { x: e.clientX, y: e.clientY, t: Date.now(), giro: false, umbral: UMBRAL[e.pointerType] || UMBRAL.mouse };
      b.classList.add('apretado');
      try { b.setPointerCapture(e.pointerId); } catch { /* sin captura se vive */ }
    });
    b.addEventListener('pointermove', (e) => {
      if (!baja) return;
      const dx = e.clientX - baja.x;
      if (!baja.giro && Math.hypot(dx, e.clientY - baja.y) > baja.umbral) { baja.giro = true; b.classList.remove('apretado'); }
      if (baja.giro) {
        /* El giro va por el desplazamiento DESDE EL ÚLTIMO aviso, no desde el
           principio: si no, cada aviso repetiría todo el recorrido y el núcleo
           saldría disparado. */
        const desde = baja.ultimoX === undefined ? baja.x : baja.ultimoX;
        window.__ULTRON_FIGURA_VIVA?.girar?.(e.clientX - desde);
        baja.ultimoX = e.clientX;
      }
    });
    const soltar = (e) => {
      const p0 = baja; baja = null;
      b.classList.remove('apretado');
      try { b.releasePointerCapture(e.pointerId); } catch { /* ya */ }
      if (!p0 || p0.giro) return;                       // fue un giro, no un toque
      if (Date.now() - p0.t > 700) return;              // se quedó apoyado: tampoco es un toque
      dispararHablar();
    };
    b.addEventListener('pointerup', soltar);
    b.addEventListener('pointercancel', () => { baja = null; b.classList.remove('apretado'); });

    /* Enter y la barra: el navegador los convierte en `click`. Se atiende ahí
       y NO en `pointerup`, para no hacerlo dos veces con el ratón. */
    let ultimoToqueN = 0;
    const dispararHablar = () => {
      if (Date.now() - ultimoToqueN < 450) return;
      ultimoToqueN = Date.now();
      toqueNucleo();
    };
    b.addEventListener('click', (e) => {
      e.preventDefault();
      dispararHablar();
    });
    /* La barra espaciadora desplaza la página si no se para. */
    b.addEventListener('keydown', (e) => { if (e.key === ' ') e.preventDefault(); });

    /* ── ACERCARSE SIN TOCAR ─────────────────────────────────────────────
       `mente.cerca` va de 0 a 1 y lo lee el dibujo del núcleo. Se calcula con
       la distancia al centro: a dos radios y medio empieza a notarse, encima
       está al máximo. El mismo cálculo sirve para el ratón y para un lápiz que
       flota, que es lo que manda `pointermove` con `pointerType` «pen» antes
       de tocar la pantalla.
       Con el dedo NO se hace: un dedo no tiene «cerca», y encenderlo con cada
       toque de desplazamiento sería ruido. */
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || !zona) return;
      const d = Math.hypot(e.clientX - zona.cx, e.clientY - zona.cy);
      /* Encendido del todo dentro del botón (tres cuartos del radio) y apagado
         del todo pasado el borde de los anillos (uno coma seis radios). Entre
         medias sube gradual. Una franja más ancha dejaba el núcleo encendido
         con el puntero en cualquier parte, que es lo mismo que no reaccionar. */
      mente.cerca = Math.max(0, Math.min(1, (zona.r * 1.6 - d) / (zona.r * .85)));
    }, { passive: true });
    /* `pointerleave` no burbujea: se escucha en el elemento raíz, que es el que
       lo recibe cuando el puntero se va de la ventana. */
    document.documentElement.addEventListener('pointerleave', () => { mente.cerca = 0; });
    /* Un lápiz que se aleja de la pantalla manda `pointerout` sin tocar nada. */
    addEventListener('pointerout', (e) => { if (e.pointerType === 'pen') mente.cerca = 0; });
  }

  /** Abrir el micrófono para un turno, y dejar la oreja encendida. */
  /* ── CALENTAR EL MOTOR MIENTRAS LA PERSONA HABLA ──────────────────────────
     Los tres o cuatro segundos que alguien tarda en decir su pregunta son
     exactamente lo que el motor tarda en evaluar el prompt. Hasta hoy esos
     segundos se desperdiciaban: el motor estaba parado esperando, y recién
     cuando llegaba la pregunta empezaba a leer las seis mil fichas de
     contexto. Medido contra producción: con la caché fría la primera palabra
     tarda 6,5 s; caliente, 1,0 s.
     No se espera la respuesta y no se avisa si falla: es velocidad, no
     función. El servidor ya se cuida de no calentar si hay un turno en vuelo
     y de no hacerlo dos veces seguidas. */
  /* ── SE CALIENTA EL MODO QUE SE VA A USAR, Y NO SIEMPRE LA VOZ ─────────────
     La primera versión pedía SIEMPRE `voz`, y eso dejaba a quien escribe peor
     que antes: el prompt de texto y el de voz se separan después de la
     cabecera, así que calentar la voz no solo no ayudaba a lo escrito —le
     DESALOJABA lo que tuviera cacheado.
     Se vio en producción el 7-sep. Una conversación escrita de diez minutos,
     siete turnos seguidos:
         primera palabra 11,5 s · 11,5 s · 10,8 s · 11,9 s · 10,2 s · 11,1 s
     mientras los turnos hablados de esa misma noche iban a 2,2 s. La
     diferencia entera era ésta. */
  const calentadoEn = { voz: 0, texto: 0 };
  function calentar(modo = 'voz') {
    if (Date.now() - calentadoEn[modo] < 15_000) return;   // el servidor también frena, pero no hace falta llegar
    calentadoEn[modo] = Date.now();
    try { DATOS.post('/precalentar', { modo }).catch(() => {}); } catch { /* nada */ }
  }

  function escucharYa() {
    if (!VOZ.hayOido?.()) { avisar(VOZ.porQueNoOye?.() || 'No hay reconocimiento de voz aquí.', true); return; }
    calentar();
    micAutorizado = true;
    despierta = true;
    $('#oreja')?.setAttribute('aria-pressed', 'true');
    dictar(volverAEscuchar);
  }
  function orejaApagar() {
    despierta = false;
    soltarVigilante();
    cicloOreja++;                     // invalida cualquier reinicio ya programado
    $('#oreja').setAttribute('aria-pressed', 'false');
    try { oreja?.abort?.(); } catch { /* ya estaba */ }
    oreja = null;
    if (mente.state === 'listen') estado('idle');
  }

  /* UN SOLO RECONOCEDOR VIVO. Chrome, ante un `no-speech` —el caso normal,
     nadie habló en unos segundos— dispara `onerror` Y DESPUÉS `onend`: los dos
     callbacks entraban y se programaban DOS reinicios para una sola sesión. El
     segundo pisaba `oreja` y el primero se quedaba vivo, sin que nadie lo
     abortara nunca, programando a su vez otros dos. La duplicación era
     multiplicativa: sesiones de micrófono acumulándose sin techo, cada una con
     la captura de audio abierta. Y con el permiso DENEGADO reintentaba cada
     1,2 s para siempre con el botón encendido en cian, diciéndole a la persona
     que la escuchan cuando no la escucha nadie. */
  function escucharPalabra(intentos = 0) {
    if (!despierta) return;
    const ciclo = ++cicloOreja;
    let yaProgramado = false;
    const reintentar = (ms) => {
      if (yaProgramado || ciclo !== cicloOreja || !despierta) return;
      yaProgramado = true;
      setTimeout(() => { if (ciclo === cicloOreja) escucharPalabra(intentos + 1); }, ms);
    };
    try { oreja?.abort?.(); } catch { /* ya estaba */ }
    oreja = VOZ.oir({
      idioma: IDIOMA,
      continuo: true,
      alOir: (frase, firme) => {
        if (!DESPIERTA.test(frase)) return;
        // Dijo el nombre: se va a preguntar algo. Se calienta ya, mientras
        // termina la frase.
        calentar();
        /* Lo que viene DESPUÉS de la palabra es la orden. «Hey ULTRON, ¿cómo
           está la cadena?» tiene que valer entera: obligar a decir el nombre,
           esperar un pitido y repetir la pregunta es un paso de más que nadie
           da dos veces. */
        const resto = frase.replace(/^.*?\b(ultron|ultrón|altron)\b[,.\s]*/i, '').trim();
        if (!firme) { estado('listen'); return; }
        /* Se cierra ESTE ciclo del todo —`cicloOreja++` invalida el reinicio que
           el `alFin` del abort va a programar— para no quedarse escuchando
           mientras ULTRON contesta en voz alta y se oiga a sí mismo. La oreja
           vuelve cuando terminó de hablar. */
        cicloOreja++;
        try { oreja?.abort?.(); } catch { /* nada */ }
        oreja = null;
        const volver = () => { if (despierta) setTimeout(() => escucharPalabra(0), 400); };
        if (resto.length > 2) { estado('think'); enviar(resto, true).catch(() => {}).then(volver); }
        else { estado('listen'); dictar(volver); }
      },
      alFin: () => reintentar(300),
      alFallo: (q) => {
        /* Permiso denegado: se apaga y se dice. Reintentar contra un «no» es
           gastar batería y mentir con el botón encendido. */
        if (q === 'not-allowed' || q === 'service-not-allowed') {
          orejaApagar();
          avisar('El navegador bloqueó el micrófono. Habilítelo en el candado de la barra de direcciones.', true);
          return;
        }
        if (intentos > 20) {
          orejaApagar();
          avisar('La escucha se detuvo: el reconocimiento falló muchas veces seguidas.', true);
          return;
        }
        reintentar(Math.min(15000, 1200 * Math.pow(1.6, intentos)));   // se va espaciando
      },
    });
  }

  /** El micrófono a mano: se dicta una frase y se manda. */
  function dictar(alTerminar) {
    if (!VOZ.hayOido?.()) { avisar(VOZ.porQueNoOye?.() || 'No hay reconocimiento de voz aquí.', true); alTerminar?.(); return; }
    /* ── UN SOLO RECONOCEDOR VIVO, SIEMPRE ─────────────────────────────────
       El navegador admite UNO. Si la oreja de «hey ULTRON» estaba abierta y se
       abre además un dictado, Safari lanza «ya está empezado» y se caen los
       dos: el botón se queda encendido y no escucha nadie. Es una de las
       maneras en que «el botón de hablar se traba». Se cierra la oreja antes,
       y se invalida su ciclo para que no se reabra por detrás. */
    cicloOreja++;
    try { oreja?.abort?.(); } catch { /* ya estaba */ }
    oreja = null;

    micAutorizado = true;              // desde aquí ya se puede vigilar para interrumpir
    estado('listen');
    $('#micro').classList.add('oyendo');
    $('#micro').setAttribute('aria-pressed', 'true');
    /* `fin` se llamaba DOS veces en el camino normal: una a mano al oír la
       frase y otra desde el `alFin` que dispara el propio abort. Con ella se
       llamaba dos veces a `alTerminar`, o sea a `volverAEscuchar`, y quedaban
       dos reaperturas en marcha para un solo turno. Se cierra una vez. */
    let cerrado = false;
    let vigilia = null;
    const fin = () => {
      if (cerrado) return; cerrado = true;
      clearTimeout(vigilia);
      $('#micro').classList.remove('oyendo'); $('#micro').setAttribute('aria-pressed', 'false');
      alTerminar?.();
    };
    /* ── EL PERRO GUARDIÁN ──────────────────────────────────────────────────
       Un reconocedor puede quedarse callado para siempre: la pestaña se va a
       segundo plano a mitad, el sistema le quita el micrófono, iOS lo suspende
       al bloquear la pantalla. Entonces no llega ni `alFin` ni `alFallo`, el
       botón se queda encendido y la conversación no vuelve nunca. Es la otra
       manera en que «el botón se traba».
       Veinte segundos: más de lo que dura cualquier frase dicha de corrido, y
       poco para quedarse mirando un botón que miente. */
    vigilia = setTimeout(() => {
      if (cerrado) return;
      try { mando?.abort?.(); } catch { /* ya */ }
      fin();
      if (mente.state === 'listen') estado('idle');
    }, 20_000);
    let mando = null;
    mando = VOZ.oir({
      idioma: IDIOMA,
      continuo: false,
      alOir: (frase, firme) => {
        $('#texto').value = frase;
        if (!firme || !frase.trim()) return;
        /* «SOLO A MÍ», con lo que de verdad se puede hacer: el navegador NO
           sabe de quién es una voz, y decir que sí sería mentir. Lo que sí:
           en modo «palabra» no se atiende nada que no la lleve, y el vigilante
           del micrófono ignora lo que suena lejos. Una conversación al otro
           lado del cuarto no dispara nada. */
        if (PREF?.oido === 'palabra' && !DESPIERTA.test(frase)) { $('#texto').value = ''; return; }
        const limpia = frase.replace(/^.*?\b(ultron|ultrón|ultra|ultro|altron|tron)\b[,.\s]*/i, '').trim() || frase;
        mando?.abort(); fin(); enviar(limpia, true);
      },
      alFin: () => { seguidasEnVacio = 0; fin(); if (mente.state === 'listen') estado('idle'); },
      alFallo: (q) => {
        fin();
        /* ── NO REINTENTAR CONTRA UNA PARED ──────────────────────────────
           Con el permiso denegado o el micrófono ocupado por otra aplicación,
           el reconocedor falla al instante, y `volverAEscuchar` lo reabría a
           los 450 ms: un bucle que gasta batería con el botón encendido,
           diciéndole a la persona que la escuchan cuando no la escucha nadie.
           A la quinta seguida se para y se dice. */
        if (q === 'not-allowed' || q === 'service-not-allowed') {
          despierta = false; seguidasEnVacio = 0;
          $('#oreja')?.setAttribute('aria-pressed', 'false');
          avisar('El navegador bloqueó el micrófono. Habilítelo en el candado de la barra de direcciones.', true);
          estado('idle'); return;
        }
        if (q !== 'no-speech' && ++seguidasEnVacio >= 5) {
          despierta = false; seguidasEnVacio = 0;
          $('#oreja')?.setAttribute('aria-pressed', 'false');
          avisar('La escucha se detuvo: el reconocimiento falló cinco veces seguidas. Toque el centro para volver a intentarlo.', true);
          estado('idle'); return;
        }
        if (q !== 'no-speech') avisar(`No se pudo escuchar (${q}).`, true);
        estado('idle');
      },
    });
  }

  // ══ ARRANQUE ══════════════════════════════════════════════════════════════

  /* El reloj ROTULADO. Había tres relojes en juego —el del navegador aquí, el
     de Tegucigalpa en el saludo del servidor, y las horas en ISO de las
     herramientas— y ninguno decía de quién era. «¿Las 3:14 de quién?» es una
     discusión que no debería existir al reconstruir un incidente. */
  const ZONA = (() => {
    try {
      const z = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      return z === 'America/Tegucigalpa' ? 'TGU' : (z.split('/').pop() || '').slice(0, 4).toUpperCase() || 'LOCAL';
    } catch { return 'LOCAL'; }
  })();

  function reloj() {
    const t = new Date();
    $('#m-reloj').textContent = `${t.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ${ZONA}`;
    /* ── LA LECTURA CONGELADA ──────────────────────────────────────────────
       Lo peor que puede hacer un tablero: quedarse con las cifras de hace tres
       horas y el reloj corriendo al lado. Las tres lecturas terminaban en
       `.catch(() => {})`, así que un 500 o un corte de red dejaba los paneles
       intactos y con buena cara. Si pasan más de 90 s sin una lectura buena, la
       pantalla se apaga y lo dice. */
    /* La caja se lee a mano: su reloj corre aquí, con el de la pantalla. Y a
       los diez minutos se pone en ámbar, porque un saldo de hace diez minutos
       ya no sirve para decidir un envío. */
    if (cajaCuando) {
      const sc = $('#caja-sub'); const min = (Date.now() - new Date(cajaCuando).getTime()) / 60000;
      if (sc) { sc.textContent = `leída ${hace(cajaCuando) || 'ahora'}`; sc.className = 'sub ' + (min > 10 ? 'amb' : ''); }
    }
    const edad = (Date.now() - ultimaBuena) / 1000;
    const vieja = ultimaBuena && edad > 90;
    document.body.classList.toggle('vieja', !!vieja);
    const c = $('#cintillo');
    if (c) {
      c.classList.toggle('oculto', !vieja);
      c.classList.toggle('grave', edad > 300);
      if (vieja) c.textContent = `SIN LECTURA ${hace(new Date(ultimaBuena).toISOString())} · lo que se ve puede estar viejo`;
    }
  }
  let ultimaBuena = Date.now();

  /* EL SALUDO SE DICE EN VOZ ALTA. Se pintaba y nada más: José entraba, veía
     «Buenos días» escrito y ULTRON no abría la boca — con la voz encendida, un
     asistente que saluda por escrito es un asistente mudo con buena letra.
     Suena porque el clic de Ingresar ya despertó el audio: es el único gesto
     que hay garantizado entre cargar la página y este momento. */
  async function saludar() {
    try {
      const s = await DATOS.get('/saludo');
      /* Mientras suena la bienvenida —cinco o seis segundos— el motor está
         parado. Es el momento exacto para dejarle el prompt evaluado, así la
         PRIMERA pregunta del día ya sale caliente. */
      calentar();
      if (!s?.texto) return;
      pintarDicho(s.texto); chips(s.sugerencias || null);
      /* Saludo EN VOZ (gesto de entrar ya desbloqueó audio). Después se apaga
         vozDespierta: las respuestas siguen en texto hasta que toque el centro. */
      locutor = locutor || locutorNuevo();
      locutor.despertar?.();
      const antes = locutor.tope; locutor.tope = 0;
      locutor.alimentar(s.texto);
      locutor.cerrar();
      locutor.tope = antes;
      marcarSaludoDicho();
      vozDespierta = false;
      avisar('Toque el centro para hablar.');
      /* Y AL TERMINAR, ESCUCHA. «Quedo a su disposición, ¿en qué le ayudo?» y
         quedarse callado esperando a que la persona busque un botón es dejar la
         frase a medias. En modo conversación, el micrófono se abre solo cuando
         ULTRON termina de saludar.
         No se pide el micrófono aquí mismo: se espera a que la voz acabe, para
         que el permiso lo pida ULTRON cuando ya explicó para qué. */
      /* SOLO SI EL MICRÓFONO YA ESTÁ CONCEDIDO. Abrirlo por nuestra cuenta la
         primera vez sería sacarle a la persona un permiso que no pidió, y con
         el cartel del navegador encima del saludo. La primera vez se toca el
         micrófono una vez; desde entonces, la conversación empieza sola. */
      /* No abre el mic solo. Hablar = toque en el centro. */
    } catch { /* sin saludo se entra igual */ }
  }

  /* Hasta que la bienvenida termina de sonar no se vigila el micrófono para
     interrumpir: ver `vigilarParaInterrumpir`. Con un tope duro por si algo se
     tuerce — dejar la interrupción apagada para siempre sería peor que el
     problema que esto evita. */
  function marcarSaludoDicho() {
    const listo = () => { if (locutor?.ocupado) return setTimeout(listo, 300); saludoDicho = true; };
    setTimeout(listo, 400);
    setTimeout(() => { saludoDicho = true; }, 45_000);
  }

  /* ══ LOS DOS PERMISOS, AL ENTRAR ═══════════════════════════════════════════
   * «Necesito que apenas entramos a la página pida los permisos de micrófono y
   * ubicación, para dar el clima y poner bien la ubicación.»
   *
   * Los dos se piden UNA VEZ, nada más entrar, y con este orden y este motivo:
   *
   *   EL MICRÓFONO va primero porque hay una ventana que se cierra. El
   *   navegador solo deja pedirlo poco después de que la persona tocó algo, y
   *   el último toque fue el botón de entrar. Si se pide más tarde —cuando
   *   ULTRON terminó de saludar, que es lo que se hacía— Safari lo rechaza sin
   *   preguntar y la conversación nunca se abre sola. Se pide, se comprueba
   *   que hay micrófono, y se SUELTA en el acto: lo que queríamos era el
   *   permiso, no la grabación. La luz del micrófono no se queda encendida.
   *
   *   LA UBICACIÓN después, y no la pide el navegador dos veces a la vez: dos
   *   carteles encima del saludo es la manera más rápida de que alguien le dé
   *   a «bloquear» a los dos.
   *
   * Si dicen que no, no pasa nada y no se vuelve a insistir en esta visita: el
   * micrófono sigue estando en su botón y el clima, en el sitio de Ajustes.
   */
  async function pedirPermisos() {
    /* Ya concedido de antes: ni se pregunta ni se abre el micrófono para nada. */
    if (!(await micYaConcedido())) {
      try {
        const cinta = await navigator.mediaDevices?.getUserMedia?.({ audio: true });
        cinta?.getTracks?.().forEach((t) => t.stop());     // el permiso, no la grabación
        micAutorizado = true;
        /* En iOS, soltar la captura NO devuelve la sesión de audio a
           «reproducir» en el mismo instante: hay que darle un respiro o la
           bienvenida sale por el auricular y entrecortada. Un cuarto de
           segundo basta y no se nota. */
        if (VOZ.esIOS) await new Promise((ok) => setTimeout(ok, 250));
      } catch { /* dijo que no, o no hay micrófono: se sigue igual */ }
    }
    /* La ubicación NO se espera: su cartel puede tardar lo que la persona
       tarde en contestarlo, y el saludo no puede quedarse esperando a eso. El
       clima que use el saludo será el del sitio de Ajustes esta vez, y el de
       donde esté de verdad a partir de la siguiente. */
    ubicacion();
  }

  /* La ubicación va al servidor y de ahí al clima del saludo. Lo que se guarda
     son tres decimales —cien metros—: basta para el tiempo y no deja escrito en
     una base en qué parte de la casa está. */
  function ubicacion() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords || {};
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        try {
          await guardarPreferencia({ coords: { lat, lon } });
          /* El saludo ya se dijo con el sitio viejo; no se repite entero, pero
             sí se corrige el clima en la pantalla la próxima vez que se abra.
             Aquí solo se deja constancia de que se supo dónde está. */
        } catch { /* si no se pudo guardar, el clima usa el sitio de Ajustes */ }
      },
      () => { /* dijo que no o no se pudo medir: el sitio de Ajustes sigue valiendo */ },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 10 * 60 * 1000 },
    );
  }

  /* Abre el turno cuando ULTRON deja de hablar. Con un respiro corto, para no
     grabar la cola de su propia voz saliendo del altavoz. */
  function esperarYEscuchar() {
    const listo = () => {
      if (locutor?.ocupado) return setTimeout(listo, 350);
      if (pensando || despierta) return;
      despierta = true;
      $('#oreja')?.setAttribute('aria-pressed', 'true');
      micAutorizado = true;
      dictar(volverAEscuchar);
    };
    setTimeout(listo, 700);
  }

  function arrancar() {
    estado('idle');
    pintarMuelle();
    ondas();
    reloj(); setInterval(reloj, 1000);

    const leer = () => {
      DATOS.get('/vivo').then((v) => { ultimaBuena = Date.now(); pintarVivo(v); }).catch(() => {});
      DATOS.get('/salud').then(pintarSalud).catch(() => {});
      DATOS.get('/pendientes').then(pintarPendientes).catch(() => {});
      DATOS.get('/autorizaciones').then(pintarAutorizaciones).catch(() => {});
      DATOS.get('/propuestas').then(pintarPropuestas).catch(() => {});
      DATOS.get('/salud/profunda').then(pintarSaludPropia).catch(() => pintarSaludPropia(null));
      /* /gasto existía desde el principio y no lo llamaba nadie. Va en la misma
         ronda que el resto: es una lectura de Mongo, no una de cadena. */
      DATOS.get('/gasto').then((g) => { gastoUltimo = g; pintarSalud(saludUltima); }).catch(() => {});
    };
    leer();
    $('#b-caja').addEventListener('click', leerCaja);
    $('#registro').addEventListener('click', (e) => {
      const b = e.target.closest('[data-dia]'); if (!b || !b.dataset.conv) return;
      abrirDia(b.dataset.dia, b.dataset.conv);
    });
    $('#archivos').addEventListener('click', (e) => {
      const b = e.target.closest('[data-borrar]'); if (!b) return;
      e.preventDefault();
      borrarArchivo(b.dataset.borrar, b.dataset.nombre);
    });
    $('#autorizaciones').addEventListener('click', (e) => {
      const b = e.target.closest('[data-decision]'); if (!b) return;
      const id = b.closest('.pedido')?.dataset.id; if (!id) return;
      b.closest('.mandos').querySelectorAll('button').forEach((x) => { x.disabled = true; });
      decidir(id, b.dataset.decision);
    });
    $('#b-boveda').addEventListener('click', abrirBoveda);
    $('#b-equipo').addEventListener('click', abrirEquipo);
    $('#b-saber').addEventListener('click', abrirSaberHacer);
    $('#b-nodos').addEventListener('click', abrirNodos);
    $('#b-reparar').addEventListener('click', repararSalud);
    $('#m-ajustes').addEventListener('click', abrirAjustes);
    $('#armar-listo').addEventListener('click', salirArmar);
    $('#armar-ocultos').addEventListener('click', (e) => {
      const b = e.target.closest('[data-vuelve]'); if (!b) return;
      document.querySelector(`.p[data-panel="${b.dataset.vuelve}"]`)?.classList.remove('escondido');
      aplicarTablero(tableroActual()); guardarTablero();
    });
    $('#armar-fabrica').addEventListener('click', () => {
      aplicarTablero(null);
      guardarPreferencia({ tablero: [] });
      avisar('El tablero vuelve al reparto de fábrica.');
    });
    /* Las preferencias, lo primero: la voz, el idioma y la figura tienen que
       estar puestas antes de que ULTRON diga la primera palabra. Y AHORA SE
       ESPERAN de verdad: ver `preferenciasListas`. */
    preferenciasListas = DATOS.get('/preferencias').then(aplicarPreferencias).catch(() => {});
    cargarMuletillas();
    $('#m-salud').addEventListener('click', () => {
      if (innerWidth <= 860 && !document.body.classList.contains('cajon')) $('#tirador')?.click();
      $('#signos')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    /* Con la pestaña oculta no se lee: son tres peticiones cada treinta
       segundos, y en datos móviles eso se paga. Al volver se lee enseguida, que
       es cuando de verdad hace falta el dato fresco. */
    setInterval(() => { if (!document.hidden) leer(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) leer(); });
    cargarArchivos();
    /* La caja se lee UNA vez al entrar y después solo a mano: son cuatro
       lecturas de cadena y no se piden en bucle por tener la pantalla abierta. */
    leerCaja();
    cargarRegistro();
    /* EL HILO DEL DÍA. Se adopta la conversación de hoy antes de saludar, así
       lo primero que se escriba sigue lo de esta mañana en vez de abrir una
       conversación nueva por haber recargado la página. */
    DATOS.get('/conversaciones/hoy').then((c) => {
      if (c?._id) conversacionId = c._id;
      /* ── DÓNDE QUEDAMOS ───────────────────────────────────────────────
         7-sep, José: «el de chat poder tener cerca historial, ya que a veces
         se cierra y no sé qué quedamos». Al recargar, el tablero adoptaba la
         conversación del día —así que ULTRON sí se acordaba— pero la PANTALLA
         salía en blanco. Lo hablado hacía diez minutos no estaba a la vista en
         ningún lado, y para verlo había que ir al panel del registro, buscar
         el día y abrirlo.
         Ahora, al entrar, lo último que se dijeron está donde tiene que estar:
         en el globo, marcado como de antes para que no se confunda con una
         respuesta nueva, y con un toque para abrir el hilo entero. */
      pintarDondeQuedamos(c);
    }).catch(() => {});
    /* EL ORDEN QUE PIDIÓ JOSÉ: «poner los permisos, debe saltar, y darme
       bienvenido, el clima y todo lo demás». Y además es lo que suena bien:
       los carteles del navegador salen ANTES de que ULTRON abra la boca, no
       encima de la bienvenida. Si no hay permisos que pedir —una prueba que
       carga la consola suelta— la promesa ya está resuelta y no se espera nada. */
    /* ── POR QUÉ SE ESPERAN LAS DOS COSAS ──────────────────────────────────
       Los permisos, para que los carteles del navegador no salgan encima del
       saludo. Y las PREFERENCIAS, porque si no el saludo sale con otra voz:
       el locutor se crea en el clic de entrar —es el único gesto que hay para
       desbloquear el audio— y en ese momento todavía no se sabe qué voz eligió
       la persona, así que se queda con la de la casa. José lo oyó y lo dijo
       así: «a veces sale otra voz». */
    Promise.all([permisosListos, preferenciasListas]).finally(saludar);

    // ── escribir
    const ta = $('#texto');
    /* En el teléfono el renglón mide unos 130 px: la frase larga se partía en
       dos líneas dentro de una caja de 38 px y se leía a medias, que es peor
       que no poner nada. Se acorta con el ancho, no con el aparato. */
    const ajustarPista = () => {
      ta.placeholder = innerWidth < 540 ? 'Escriba o hable…'
        : innerWidth < 860 ? 'Escriba, hable o suelte un archivo'
        : 'Indique la consulta, o suelte un archivo aquí';
    };
    ajustarPista(); addEventListener('resize', ajustarPista);
    // crece con el texto, pero nunca por debajo del blanco del dedo (38px)
    ta.addEventListener('input', () => {
      ta.style.height = 'auto'; ta.style.height = Math.max(38, Math.min(96, ta.scrollHeight)) + 'px';
      /* Escribir una pregunta lleva unos segundos, y son los mismos que el
         motor tarda en leer el prompt. Se le manda a evaluar desde la primera
         letra: para cuando se pulsa ENVIAR, ya está leído. Es lo mismo que se
         hace al abrir el micrófono, que bajó la primera palabra de 6,5 s a
         2,3 s — y a lo escrito no se le estaba haciendo. */
      if (ta.value.trim().length >= 1) calentar('texto');
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(ta.value); }
    });
    $('#enviar').addEventListener('click', () => enviar(ta.value));

    // ── los mandos
    $('#micro').addEventListener('click', () => { despertarVoz(); dictar(); });

    botonDeHablar();
    $('#oreja').addEventListener('click', () => (despierta ? orejaApagar() : orejaEncender()));
    /* El rótulo del botón no puede prometer una palabra que despierta en un
       aparato donde no la hay. */
    const rotularOreja = () => {
      const c = CONVERSACION();
      $('#oreja').title = c ? 'Conversar: hable y ULTRON contesta, y vuelve a escucharlo'
        : 'Escuchar la palabra: diga «hey ULTRON» y le atiende';
      $('#oreja').setAttribute('aria-label', c ? 'Conversación continua' : 'Esperar «hey ULTRON»');
    };
    rotularOreja();
    document.addEventListener('ultron:preferencias', rotularOreja);
    $('#altavoz').addEventListener('click', (e) => {
      conVoz = !conVoz;
      if (conVoz) despertarVoz();          // el toque que la enciende es el permiso
      e.currentTarget.setAttribute('aria-pressed', String(conVoz));
      if (!conVoz) { locutor?.callar?.(); mente.nivel = 0; estado('idle'); }
      avisar(conVoz ? 'ULTRON vuelve a hablar.' : 'ULTRON escribe y no habla.');
    });

    // ── archivos: el clip y arrastrar
    const abrir = () => $('#fichero').click();
    $('#clip').addEventListener('click', abrir);
    $('#clip2').addEventListener('click', abrir);
    $('#fichero').addEventListener('change', (e) => { if (e.target.files?.length) subir(e.target.files); e.target.value = ''; });

    let arrastres = 0;
    addEventListener('dragenter', (e) => { e.preventDefault(); if (++arrastres === 1) $('#soltar').classList.remove('oculto'); });
    addEventListener('dragover', (e) => e.preventDefault());
    addEventListener('dragleave', (e) => { e.preventDefault(); if (--arrastres <= 0) { arrastres = 0; $('#soltar').classList.add('oculto'); } });
    addEventListener('drop', (e) => {
      e.preventDefault(); arrastres = 0; $('#soltar').classList.add('oculto');
      if (e.dataTransfer?.files?.length) subir(e.dataTransfer.files);
    });

    // ── el muelle y los chips
    $('#muelle').addEventListener('click', (e) => {
      const b = e.target.closest('.casa'); if (!b) return;
      window.open(b.dataset.url, '_blank', 'noopener');
    });
    /* Cerrar un pendiente desde el tablero. Se pinta de nuevo la lista con lo
       que devuelve el servidor: si el cierre no llegó, el punto sigue ahí. */
    $('#pendientes').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pend]'); if (!b) return;
      b.disabled = true; b.style.background = 'var(--cian)';
      try {
        const r = await fetch(`/pendientes/${encodeURIComponent(b.dataset.pend)}`, {
          method: 'PATCH', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }, body: '{"estado":"hecho"}',
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
        avisar('Cerrado.');
      } catch (err) { avisar(`No se pudo cerrar: ${err.message}`, true); b.disabled = false; b.style.background = 'transparent'; }
      DATOS.get('/pendientes').then(pintarPendientes).catch(() => {});
    });

    $('#chips').addEventListener('click', (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      /* Un botón con dirección ABRE; uno sin ella es una sugerencia y se
         pregunta. «OÍR TODO» tiene su propio manejador y no pasa por aquí: se
         le mandaba a ULTRON «OÍR TODO» como si fuera una pregunta. */
      if (b.dataset.url) { window.open(b.dataset.url, '_blank', 'noopener'); return; }
      /* El del hilo abre la conversación del día aquí mismo. Sin esto, tocarlo
         le MANDABA a ULTRON la pregunta «VER TODO EL HILO», que es justo lo que
         no se quiere: gastar un turno por querer mirar atrás. */
      if (b.dataset.conv) { abrirDia(registroUltimo?.hoy || 'hoy', b.dataset.conv); return; }
      /* «Seguí» a secas: el servidor ya lleva en el prompt qué se pidió, qué
         se hizo y cuál es el paso siguiente, así que no hace falta repetirlo
         —y repetirlo sería gastar fichas en algo que ya sabe—. */
      if (b.dataset.seguir) { enviar('Seguí con eso, por favor.'); return; }
      /* El botón abre la MISMA ventana: se aprueba leyendo lo que se aprueba,
         nunca a ciegas por tocar un botón pequeño. */
      if (b.dataset.aprobar) { pedirPermiso({ id: b.dataset.aprobar, resumen: b.textContent.replace(/^APROBAR:\s*/, '') }); return; }
      if (b.dataset.propio) return;
      enviar(b.textContent);
    });

    /* ── EL CAJÓN DEL TELÉFONO ────────────────────────────────────────────────
       `transform:translateY(101%)` desplaza el PINTADO: no saca nada del orden
       de tabulación ni del árbol de accesibilidad. Con el cajón cerrado,
       tabular desde el renglón llevaba el foco a botones y enlaces que están
       fuera de la pantalla y sin ningún indicador visible. `inert` los saca de
       verdad, del foco y del lector. */
    const tir = document.createElement('button');
    tir.id = 'tirador'; tir.innerHTML = '<span>PANELES</span>';
    tir.setAttribute('aria-expanded', 'false');
    tir.setAttribute('aria-controls', 'paneles');
    const cajonSegunAncho = () => {
      const enTelefono = innerWidth <= 860;
      const abierto = document.body.classList.contains('cajon');
      const p = $('#paneles');
      if (p) p.inert = enTelefono && !abierto;
    };
    /* El cajón es una capa como cualquier otra: subirlo deja marca en el
       historial y el gesto de atrás lo baja, en vez de sacar de ULTRON. */
    const bajarCajon = () => {
      document.body.classList.remove('cajon');
      tir.setAttribute('aria-expanded', 'false');
      tir.querySelector('span').textContent = 'PANELES';
      cajonSegunAncho();
    };
    tir.addEventListener('click', () => {
      if (document.body.classList.contains('cajon')) { if (!cerrarCapa(tir)) bajarCajon(); return; }
      document.body.classList.add('cajon');
      tir.setAttribute('aria-expanded', 'true');
      tir.querySelector('span').textContent = 'CERRAR';
      cajonSegunAncho();
      abrirCapa(tir, bajarCajon);
    });
    document.body.appendChild(tir);
    cajonSegunAncho();
    addEventListener('resize', cajonSegunAncho);

    // ── el busto sigue el ratón
    addEventListener('mousemove', (e) => {
      mente.mouse.x = (e.clientX / innerWidth) * 2 - 1;
      mente.mouse.y = (e.clientY / innerHeight) * 2 - 1;
    });

    /* El permiso de audio se pide con el PRIMER gesto, sea cual sea. Sin esto
       la primera respuesta sale muda y la persona cree que la voz no anda. */
    const despertarAudio = () => {
      locutor = locutor || locutorNuevo();
      locutor.despertar?.();
      removeEventListener('pointerdown', despertarAudio);
      removeEventListener('keydown', despertarAudio);
    };
    addEventListener('pointerdown', despertarAudio, { once: false });
    addEventListener('keydown', despertarAudio, { once: false });

    /* La sesión vencida la atiende la entrada (os-puerta.js): enseña la puerta
       encima, sin recargar y sin perder lo que hay en pantalla.
       ANTES aquí había `location.href = '/'`, y desde que la raíz ES esta misma
       página eso era un BUCLE: se carga, no hay sesión, se va a «/», que es
       ella misma, y otra vez — el navegador recargando para siempre. */

    /* Al cerrar la pestaña se suelta todo: la voz, el contexto de audio que
       mide la boca y el motor 3D. Ninguno de los tres se soltaba nunca —el
       `dispose()` del busto quedaba guardado y sin llamar—, y un navegador
       admite pocos contextos de audio por pestaña. */
    addEventListener('pagehide', () => {
      try { locutor?.callar?.(); } catch { /* ya */ }
      try { window.BOCA?.soltar?.(); } catch { /* ya */ }
      try { window.__ULTRON_FIGURA_VIVA?.dispose?.(); } catch { /* ya */ }
      orejaApagar();
    });
    /* Y si la pantalla se va a segundo plano con la oreja abierta, se cierra:
       un micrófono escuchando una pestaña que nadie mira no se hace. */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && despierta) { orejaApagar(); }
    });
  }

  /* ── NO SE PIDE NADA HASTA ESTAR ADENTRO ──────────────────────────────────
     La entrada (os-puerta.js) avisa con `ultron:adentro` cuando hay sesión de
     verdad. Antes el tablero arrancaba con la página y disparaba ocho lecturas
     que devolvían 401: ocho peticiones inútiles, ocho «sesión vencida» en el
     registro, y los paneles pintados de huecos por detrás del formulario que
     ya nunca se volvían a llenar.
     El respaldo va atado a que NO EXISTA la entrada —una prueba que carga esta
     consola suelta—, y no a un temporizador: con tres segundos, quien tarda en
     escribir su clave arrancaba el tablero antes de entrar. */
  let yaArranco = false;
  /* Por omisión no hay nada que esperar: una prueba que carga la consola suelta
     no pide permisos y no puede quedarse sin saludo por eso. */
  let permisosListos = Promise.resolve();
  const unaVez = () => { if (yaArranco) return; yaArranco = true; arrancar(); };
  document.addEventListener('ultron:adentro', () => {
    /* Los permisos se piden AQUÍ y no dentro de `arrancar()`: solo se piden
       cuando se entró de verdad, nunca en una prueba que carga la consola
       suelta, y en el mismo instante en que el toque de entrar todavía cuenta
       como gesto para el navegador.
       Se apunta la promesa ANTES de arrancar, porque `arrancar()` la espera
       para saludar. */
    permisosListos = pedirPermisos();
    unaVez();
  });
  document.addEventListener('ultron:adentro', unaVez);
  if (!document.getElementById('entrada')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', unaVez);
    else unaVez();
  }

  return { enviar, estado, avisar, mente, despertarVoz, abrirAjustes, _adentro: { pintarVivo, pintarSalud, pintarSaludPropia, pintarArchivos, pintarPendientes, pintarAutorizaciones, pintarPropuestas, pintarDicho, DESPIERTA, CASAS, entrarArmar, salirArmar, aplicarTablero, tableroActual, toqueNucleo, pedirPermisos, botonDeHablar, pintarCaja, pintarRegistro, borrarArchivo, chips, pintarNegocio,
    /* Solo para la prueba: mueve el reloj de la última lectura buena hacia
       atrás, para comprobar que la pantalla avisa cuando se queda vieja sin
       tener que esperar diez minutos de verdad. */
    envejecer: (segundos) => { ultimaBuena = Date.now() - segundos * 1000; },
    /* Para la prueba: mover hacia atrás el reloj de LA CAJA, y meter el
       cronómetro de un turno sin tener que hablar con el nodo. */
    envejecerCaja: (minutos) => { cajaCuando = new Date(Date.now() - minutos * 60_000).toISOString(); },
    marcarTurno: (ms) => { ultimoTurno = ms; pintarSalud(saludUltima); },
    pedirPermiso,
    herramienta: (d) => marcarQueHace(d?.hace || d?.nombre),
    envejecerTurno: (s) => envejecerTurno(s),
    /* Para la prueba: si el turno sigue en vuelo. Es lo que distingue
       «interrumpí y quedó libre» de «interrumpí y sigue colgado». */
    pensando: () => pensando } };
})();
window.OS = OS;
