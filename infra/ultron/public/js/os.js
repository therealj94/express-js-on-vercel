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
  const mente = { state: 'idle', mood: 'neutral', nivel: 0, speech: null, mouse: { x: 0, y: 0 } };
  window.__ULTRON_MENTE = () => mente;

  const COLORES = { idle: '#05E1FF', listen: '#5CF2B0', think: '#FFB648', speak: '#05E1FF', error: '#FF5A6E' };
  const ROTULOS = { idle: 'EN LÍNEA', listen: 'ESCUCHANDO', think: 'ANALIZANDO', speak: 'HABLANDO', error: 'FALLO' };

  function estado(st, mood) {
    mente.state = st;
    if (mood !== undefined) mente.mood = mood;
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

  function pintarVivo(v) {
    ultimoVivo = v;
    /* ── el techo: la altura de la cadena ────────────────────────────────────
       CUIDADO CON LOS DOS NOMBRES. El tablero escribía «5550» a lo que dice
       Ordenex y «8532» a lo que dice OrdenScan, como si fueran dos cadenas.
       Medidas al mismo tiempo dan el MISMO número —96 805 y 96 805—, y el RPC
       de la casa contesta `chainId 5550` a esa altura: es UNA cadena leída por
       dos sitios, no dos. Así que aquí se nombra la cadena una vez y se dice
       QUIÉN lo leyó; si los dos lectores se separan, eso es un dato de salud
       (el explorador se quedó atrás) y sale abajo, en INTEGRIDAD. */
    const bOx = v?.ordenex?.bloque5550, bSc = v?.ordenscan?.bloque8532;
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
  function pintarSalud(s) {
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
    ];   // cuántos son la junta ya lo dice la puerta; aquí sería un renglón repetido
    $('#nodo-lineas').innerHTML = lineas.map(([a, b, cl]) => fila(a, b, cl)).join('');
  }

  function pintarPendientes(l) {
    const abiertos = (l || []).filter((p) => p.estado !== 'hecho');
    $('#pend-sub').textContent = abiertos.length ? `${abiertos.length} sin cerrar` : 'nada abierto';
    $('#pendientes').innerHTML = abiertos.length
      ? abiertos.slice(0, 12).map((p) => `
        <div style="display:flex;gap:7px;align-items:flex-start">
          <span style="width:5px;height:5px;border-radius:50%;background:var(--ambar);margin-top:6px;flex:none;box-shadow:0 0 6px var(--ambar)"></span>
          <div style="min-width:0">
            <div style="font-size:12.5px;line-height:1.3;color:var(--letra-f)">${esc(p.texto)}</div>
            ${p.quien ? `<div class="dato" style="color:var(--tenue)">${esc(p.quien)}</div>` : ''}
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
        <div class="et ${leible ? '' : 'gris'}">${esc(ETIQ[a.tipo] || '?')}</div>
        <div class="qui">
          <div class="nm" title="${esc(a.nombre)}">${esc(a.nombre)}</div>
          <div class="mt">${kb(a.bytes)} · ${leible ? `${num(a.texto.length)} letras leídas` : 'sin texto'}</div>
        </div>
        <a class="bj" href="/archivos/${esc(a._id)}/bajar" target="_blank" rel="noopener" title="Bajar" aria-label="Bajar ${esc(a.nombre)}">
          <svg viewBox="0 0 24 24"><path d="M12 3v13M7 11.5l5 5 5-5M4.5 20.5h15"/></svg></a>
      </div>`;
    }).join('') : '<div class="sub">Suelte un PDF, un Word o un texto en la pantalla y ULTRON lo lee.</div>';
  }

  async function subir(ficheros) {
    const l = [...ficheros].slice(0, 6);
    for (const f of l) {
      try {
        avisar(`Subiendo ${f.name}…`);
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
        avisar(`No se pudo subir ${f.name}: ${e.message}`, true);
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
  let oreja = null, despierta = false;

  function locutorNuevo() {
    return new VOZ.Locutor({
      conElevenLabs: true,
      alNivel: (n) => { mente.nivel = n; },
      alEmpezar: () => estado('speak'),
      alTerminar: () => { mente.nivel = 0; if (!pensando) estado('idle'); },
      alFallo: (q) => avisar(`La voz del navegador tomó el relevo (${q}).`, false),
    });
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

  function pintarDicho(md) {
    $('#globo').classList.remove('oculto');
    $('#dicho').innerHTML = window.MARKDOWN ? MARKDOWN.aHtml(md) : esc(md);
    $('#dicho').scrollTop = $('#dicho').scrollHeight;
  }

  function chips(l) {
    const c = $('#chips');
    if (!l?.length) { c.classList.add('oculto'); return; }
    c.classList.remove('oculto');
    c.innerHTML = l.map((s) => `<button class="chip">${esc(s)}</button>`).join('');
  }

  async function enviar(texto) {
    const t = String(texto || '').trim();
    if (!t || pensando) return;
    pensando = true; $('#enviar').disabled = true;
    $('#texto').value = ''; $('#texto').style.height = 'auto';
    estado('think', 'think');
    pintarDicho('');
    chips(null);
    let acum = ''; const usadas = [];
    pintarFuentes(null);
    /* UN SOLO LOCUTOR para toda la sesión. Antes se creaba uno por mensaje y el
       anterior se quedaba con su temporizador de 40 Hz corriendo: treinta
       preguntas, treinta temporizadores huérfanos. */
    locutor?.callar?.();
    if (conVoz) { locutor = locutor || locutorNuevo(); locutor.despertar?.(); }

    /* try/finally, y no es adorno. `DATOS.pensar` abre un SSE que puede durar
       veinte segundos; en un teléfono que cambia de celda a mitad, la promesa
       RECHAZA y sin este envoltorio la ejecución nunca llegaba a devolver el
       botón: `pensando` se quedaba en true y ENVIAR deshabilitado para siempre.
       La consola quedaba muerta hasta recargar, en la ruta principal del
       producto y con la avería más común que hay. */
    try {
      await DATOS.pensar(t, { conversacionId, modo: 'texto' }, {
        abre: (d) => { conversacionId = d.conversacionId || conversacionId; },
        texto: (d) => { acum += d.t || ''; pintarDicho(acum); if (conVoz) locutor?.alimentar?.(d.t || ''); },
        herramienta: (d) => {
          const n = String(d.nombre || '').toUpperCase().replace(/_/g, ' ');
          $('#estado-txt').textContent = n;
          usadas.push(n);                       // para dejarlas escritas al pie de la respuesta
        },
        fin: (d) => {
          if (d?.texto) { acum = d.texto; pintarDicho(acum); }
          if (conVoz) locutor?.cerrar?.(); else estado('idle');
          chips(d?.acciones?.length ? d.acciones.map((a) => a.nombre) : null);
          /* De dónde salió la cifra. Un tablero de junta del que no se puede
             decir «esto lo leyó de Ordenex a las 04:12» no se puede citar en un
             acta. Las herramientas usadas quedan escritas bajo la respuesta. */
          pintarFuentes(usadas);
          anunciar(acum);                       // una sola vez, para el lector de pantalla
          cargarArchivos();
          DATOS.get('/pendientes').then(pintarPendientes).catch(() => {});
        },
        error: (msj) => { estado('error', 'concern'); avisar(msj, true); setTimeout(() => estado('idle', 'neutral'), 2600); },
      });
    } catch (e) {
      estado('error', 'concern');
      avisar(`Se cortó la conexión con ULTRON: ${e?.message || e}`, true);
      setTimeout(() => { if (mente.state === 'error') estado('idle', 'neutral'); }, 3200);
    } finally {
      pensando = false; $('#enviar').disabled = false;
      if (mente.state !== 'speak' && mente.state !== 'error') estado('idle', 'neutral');
    }
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
  const DESPIERTA = /\b(hey|hei|ey|oye|ok)\s+(ultron|ultrón|altron)\b|\bultron\b/i;
  let cicloOreja = 0;                 // token: solo el ciclo vigente puede reprogramar

  function orejaEncender() {
    if (!VOZ.hayOido?.()) { avisar('Este navegador no trae reconocimiento de voz. En Chrome sí funciona.', true); return; }
    despierta = true;
    $('#oreja').setAttribute('aria-pressed', 'true');
    avisar('Oreja abierta: diga «hey ULTRON». Mientras esté encendida, su navegador manda el audio a su proveedor de reconocimiento.');
    escucharPalabra();
  }
  function orejaApagar() {
    despierta = false;
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
      continuo: true,
      alOir: (frase, firme) => {
        if (!DESPIERTA.test(frase)) return;
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
        if (resto.length > 2) { estado('think'); enviar(resto).catch(() => {}).then(volver); }
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
    if (!VOZ.hayOido?.()) { avisar('Este navegador no trae reconocimiento de voz.', true); alTerminar?.(); return; }
    estado('listen');
    $('#micro').classList.add('oyendo');
    $('#micro').setAttribute('aria-pressed', 'true');
    const fin = () => { $('#micro').classList.remove('oyendo'); $('#micro').setAttribute('aria-pressed', 'false'); alTerminar?.(); };
    let mando = null;
    mando = VOZ.oir({
      continuo: false,
      alOir: (frase, firme) => {
        $('#texto').value = frase;
        if (firme && frase.trim()) { mando?.abort(); fin(); enviar(frase); }
      },
      alFin: () => { fin(); if (mente.state === 'listen') estado('idle'); },
      alFallo: (q) => { fin(); avisar(`No se pudo escuchar (${q}).`, true); estado('idle'); },
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

  async function saludar() {
    try {
      const s = await DATOS.get('/saludo');
      if (s?.texto) { pintarDicho(s.texto); chips(s.sugerencias || null); }
    } catch { /* sin saludo se entra igual */ }
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
    };
    leer();
    /* Con la pestaña oculta no se lee: son tres peticiones cada treinta
       segundos, y en datos móviles eso se paga. Al volver se lee enseguida, que
       es cuando de verdad hace falta el dato fresco. */
    setInterval(() => { if (!document.hidden) leer(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) leer(); });
    cargarArchivos();
    saludar();

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
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.max(38, Math.min(96, ta.scrollHeight)) + 'px'; });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(ta.value); }
    });
    $('#enviar').addEventListener('click', () => enviar(ta.value));

    // ── los mandos
    $('#micro').addEventListener('click', () => dictar());
    $('#oreja').addEventListener('click', () => (despierta ? orejaApagar() : orejaEncender()));
    $('#altavoz').addEventListener('click', (e) => {
      conVoz = !conVoz;
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
    $('#chips').addEventListener('click', (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
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
    tir.addEventListener('click', () => {
      const ab = document.body.classList.toggle('cajon');
      tir.setAttribute('aria-expanded', String(ab));
      tir.querySelector('span').textContent = ab ? 'CERRAR' : 'PANELES';
      cajonSegunAncho();
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

    document.addEventListener('ultron:sin-sesion', () => { location.href = '/'; });

    /* Al cerrar la pestaña se suelta todo: la voz, el contexto de audio que
       mide la boca y el motor 3D. Ninguno de los tres se soltaba nunca —el
       `dispose()` del busto quedaba guardado y sin llamar—, y un navegador
       admite pocos contextos de audio por pestaña. */
    addEventListener('pagehide', () => {
      try { locutor?.callar?.(); } catch { /* ya */ }
      try { window.BOCA?.soltar?.(); } catch { /* ya */ }
      try { window.__ULTRON_BUSTO?.dispose?.(); } catch { /* ya */ }
      orejaApagar();
    });
    /* Y si la pantalla se va a segundo plano con la oreja abierta, se cierra:
       un micrófono escuchando una pestaña que nadie mira no se hace. */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && despierta) { orejaApagar(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();

  return { enviar, estado, avisar, mente, _adentro: { pintarVivo, pintarSalud, pintarArchivos, pintarPendientes, pintarDicho, DESPIERTA, CASAS,
    /* Solo para la prueba: mueve el reloj de la última lectura buena hacia
       atrás, para comprobar que la pantalla avisa cuando se queda vieja sin
       tener que esperar diez minutos de verdad. */
    envejecer: (segundos) => { ultimaBuena = Date.now() - segundos * 1000; } } };
})();
window.OS = OS;
