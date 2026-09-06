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

  function pintarVivo(v) {
    ultimoVivo = v;
    // ── el techo
    const bl = v?.ordenex?.bloque5550;
    $('#m-bloque').textContent = `CADENA 5550 · ${bl ? '#' + num(bl) : nada}`;
    const ms = [v?.ordenex?.ms, v?.aucorp?.ms, v?.genesis?.ms].filter((x) => typeof x === 'number');
    $('#m-rpc').textContent = ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : nada;
    $('#m-oro').textContent = v?.origen?.oroOnzaUsd ? `${num(v.origen.oroOnzaUsd, 0)} USD/oz` : nada;

    // ── el ecosistema, casa por casa, con su latencia de verdad
    const filas = CASAS.map((c) => {
      const d = v?.[c.k];
      if (!d) return `<div class="fila"><span>${esc(c.nb)}</span><span>${nada}</span></div>`;
      const cl = d.vivo ? 'ok' : 'mal';
      const txt = d.vivo ? `${d.ms} ms` : (d.http ? `HTTP ${d.http}` : 'CAÍDA');
      return `<div class="fila"><span>${esc(c.nb)}</span><span class="${cl}">${esc(txt)}</span></div>`;
    });
    if (v?.origen?.origenUsd) filas.push(`<div class="fila"><span>ORIGEN</span><span class="on">${num(v.origen.origenUsd, 4)} USD</span></div>`);
    $('#eco').innerHTML = filas.join('');
    const vivas = CASAS.filter((c) => v?.[c.k]?.vivo).length;
    $('#eco-sub').textContent = `${vivas} de ${CASAS.length} en pie · leído ${v?.leidoEn ? new Date(v.leidoEn).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : nada}`;
    $('#nervio-estado').textContent = vivas === CASAS.length ? 'Estado: SINCRONIZADO' : `Estado: ${CASAS.length - vivas} SIN RESPUESTA`;

    // ── integridad
    const int = [
      ['CASAS EN PIE', `${vivas} / ${CASAS.length}`, vivas === CASAS.length ? 'ok' : 'mal'],
      ['BLOQUE 5550', bl ? num(bl) : nada, ''],
      ['COMPRA USDT', v?.ordenex?.compraUsdt ? String(v.ordenex.compraUsdt).toUpperCase() : nada, v?.ordenex?.compraUsdt === 'abierta' ? 'ok' : 'mal'],
      ['SANCIONES', v?.aucorp?.sanciones?.registros ? num(v.aucorp.sanciones.registros) : nada, v?.aucorp?.sanciones?.vencidas ? 'mal' : 'ok'],
      ['TASAS FIAT', v?.aucorp?.tasas ? 'AL DÍA' : nada, v?.aucorp?.tasas ? 'ok' : 'mal'],
    ];
    $('#integridad').innerHTML = int.map(([a, b, cl]) => `<div class="fila"><span>${a}</span><span class="${cl}">${esc(b)}</span></div>`).join('');
    /* Que el rótulo diga el número de verdad: «hay una casa sin contestar» con
       seis caídas es mentira, y una mentira pequeña en un tablero enseña a no
       creerle al tablero. */
    const faltan = CASAS.length - vivas;
    $('#integridad-tag').textContent = faltan === 0 ? 'todos los nodos operativos'
      : faltan === 1 ? 'hay una casa sin contestar' : `hay ${faltan} casas sin contestar`;
    pintarMuelle();
  }

  function pintarSalud(s) {
    const n = s?.nodo || {};
    $('#nodo-modelo').textContent = n.modelo || (s?.modelo || nada);
    $('#rueda-n').textContent = n.ctx ? `${Math.round(n.ctx / 1024)}k` : nada;
    /* La rueda no es un adorno con un número al azar: enseña qué parte del
       contexto del modelo se está usando de tope. */
    const pct = n.ctx ? Math.min(100, Math.round((n.ctx / 32768) * 100)) : 0;
    $('#rueda').style.background = `conic-gradient(var(--cian) ${pct * 3.6}deg, rgba(5,225,255,.12) 0)`;
    const lineas = [
      ['MOTOR', n.vivo ? 'VIVO' : 'SIN RESPUESTA', n.vivo ? 100 : 0],
      ['PEDIDOS', num(n.pedidos), Math.min(100, (n.pedidos || 0))],
      ['RECHAZADOS', num(n.rechazados), n.rechazados ? 100 : 0],
      ['SABER', s?.saber ? `${num(s.saber)} fichas` : nada, s?.saber ? 100 : 0],
    ];
    $('#nodo-lineas').innerHTML = lineas.map(([a, b, w]) => `
      <div style="display:flex;flex-direction:column;gap:2px">
        <div class="fila" style="font-size:10px;letter-spacing:.12em"><span>${a}</span><span class="on">${esc(b)}</span></div>
        <div style="height:2px;background:rgba(200,208,216,.1);position:relative">
          <div style="position:absolute;inset:0;width:${w}%;background:var(--cian);box-shadow:0 0 8px rgba(5,225,255,.6);transition:width .6s"></div>
        </div>
      </div>`).join('');
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
  function ondas() {
    const c = $('#onda'), g = c?.getContext('2d');
    const cr = $('#red'), gr = cr?.getContext('2d');
    if (!g) return;
    const hist = new Array(120).fill(0);
    let t = 0;
    const medir = (cv) => {
      const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(r.width * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); }
      return { w: r.width, h: r.height, d };
    };
    (function paso() {
      requestAnimationFrame(paso);
      t += 0.016;
      // ── la onda
      const { w, h, d } = medir(c);
      if (w > 0) {
        g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
        hist.push(mente.state === 'speak' ? mente.nivel : mente.state === 'think' ? 0.25 + Math.sin(t * 6) * 0.12 : 0.06 + Math.sin(t * 1.6) * 0.04);
        hist.shift();
        g.beginPath();
        hist.forEach((v, i) => {
          const x = (i / (hist.length - 1)) * w;
          const y = h / 2 - (v * h * 0.42);
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        });
        g.strokeStyle = COLORES[mente.state] || COLORES.idle; g.lineWidth = 1.4;
        g.shadowColor = g.strokeStyle; g.shadowBlur = 8; g.stroke(); g.shadowBlur = 0;
        g.beginPath();
        hist.forEach((v, i) => { const x = (i / (hist.length - 1)) * w; const y = h / 2 + (v * h * 0.42); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.strokeStyle = 'rgba(5,225,255,.28)'; g.lineWidth = 1; g.stroke();
      }
      // ── la red de casas: un nodo por casa, encendido si contesta
      if (gr) {
        const m = medir(cr);
        if (m.w > 0) {
          gr.setTransform(m.d, 0, 0, m.d, 0, 0); gr.clearRect(0, 0, m.w, m.h);
          const cx = m.w / 2, cy = m.h / 2, R = Math.min(m.w, m.h) * 0.36;
          CASAS.forEach((casa, i) => {
            const a = (i / CASAS.length) * Math.PI * 2 + t * 0.12;
            const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R * 0.78;
            const viva = ultimoVivo?.[casa.k]?.vivo;
            gr.beginPath(); gr.moveTo(cx, cy); gr.lineTo(x, y);
            gr.strokeStyle = viva ? 'rgba(5,225,255,.30)' : 'rgba(255,90,110,.35)'; gr.lineWidth = 1; gr.stroke();
            gr.beginPath(); gr.arc(x, y, viva ? 2.6 + Math.sin(t * 2 + i) * 0.6 : 2.2, 0, 7);
            gr.fillStyle = viva ? '#05E1FF' : '#FF5A6E';
            gr.shadowColor = gr.fillStyle; gr.shadowBlur = viva ? 8 : 4; gr.fill(); gr.shadowBlur = 0;
          });
          gr.beginPath(); gr.arc(cx, cy, 4 + Math.sin(t * 1.8) * 0.8, 0, 7);
          gr.fillStyle = '#E4E9EE'; gr.shadowColor = '#05E1FF'; gr.shadowBlur = 14; gr.fill(); gr.shadowBlur = 0;
        }
      }
    })();
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
    let acum = '';
    locutor?.callar?.();
    if (conVoz) { locutor = locutorNuevo(); locutor.despertar?.(); }

    await DATOS.pensar(t, { conversacionId, modo: 'texto' }, {
      abre: (d) => { conversacionId = d.conversacionId || conversacionId; },
      texto: (d) => { acum += d.t || ''; pintarDicho(acum); if (conVoz) locutor?.alimentar?.(d.t || ''); },
      herramienta: (d) => { $('#estado-txt').textContent = String(d.nombre || '').toUpperCase().replace(/_/g, ' '); },
      fin: (d) => {
        if (d?.texto) { acum = d.texto; pintarDicho(acum); }
        if (conVoz) locutor?.cerrar?.(); else estado('idle');
        chips(d?.acciones?.length ? d.acciones.map((a) => a.nombre) : null);
        cargarArchivos();
        DATOS.get('/pendientes').then(pintarPendientes).catch(() => {});
      },
      error: (msj) => { estado('error', 'concern'); avisar(msj, true); setTimeout(() => estado('idle', 'neutral'), 2600); },
    });
    pensando = false; $('#enviar').disabled = false;
    if (mente.state !== 'speak') estado('idle', 'neutral');
  }

  /* ── «HEY ULTRON» ──────────────────────────────────────────────────────────
     La oreja queda abierta escuchando SOLO la palabra que despierta. Lo que
     oye no sale del navegador hasta que la palabra suena: el reconocimiento es
     el del propio sistema, no se manda audio a ningún lado, y mientras no se
     dice «ultron» nada de lo que capta se usa para nada.
     Se enciende a mano y se apaga a mano, y el botón lo dice: un micrófono que
     se queda abierto solo, sin que se vea, es exactamente lo que nadie quiere
     en su casa. */
  const DESPIERTA = /\b(hey|hei|ey|oye|ok)\s+(ultron|ultrón|altron)\b|\bultron\b/i;

  function orejaEncender() {
    if (!VOZ.hayOido?.()) { avisar('Este navegador no trae reconocimiento de voz. En Chrome sí funciona.', true); return; }
    despierta = true;
    $('#oreja').setAttribute('aria-pressed', 'true');
    avisar('Oreja abierta. Decí «hey ULTRON» y te escucho.');
    escucharPalabra();
  }
  function orejaApagar() {
    despierta = false;
    $('#oreja').setAttribute('aria-pressed', 'false');
    try { oreja?.abort?.(); } catch { /* ya estaba */ }
    oreja = null;
    if (mente.state === 'listen') estado('idle');
  }

  function escucharPalabra() {
    if (!despierta) return;
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
        try { oreja?.abort?.(); } catch { /* nada */ }
        oreja = null;
        if (resto.length > 2) { estado('think'); enviar(resto).then(() => { if (despierta) setTimeout(escucharPalabra, 400); }); }
        else { estado('listen'); dictar(() => { if (despierta) setTimeout(escucharPalabra, 400); }); }
      },
      alFin: () => { if (despierta && oreja) setTimeout(escucharPalabra, 300); },
      alFallo: () => { if (despierta) setTimeout(escucharPalabra, 1200); },
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

  function reloj() {
    const t = new Date();
    $('#m-reloj').textContent = t.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

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
      DATOS.get('/vivo').then(pintarVivo).catch(() => {});
      DATOS.get('/salud').then(pintarSalud).catch(() => {});
      DATOS.get('/pendientes').then(pintarPendientes).catch(() => {});
    };
    leer(); setInterval(leer, 30000);
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

    // ── el cajón del teléfono
    const tir = document.createElement('button');
    tir.id = 'tirador'; tir.innerHTML = '<span>PANELES</span>';
    tir.addEventListener('click', () => {
      const ab = document.body.classList.toggle('cajon');
      tir.querySelector('span').textContent = ab ? 'CERRAR' : 'PANELES';
    });
    document.body.appendChild(tir);

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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();

  return { enviar, estado, avisar, mente, _adentro: { pintarVivo, pintarSalud, pintarArchivos, pintarDicho, DESPIERTA, CASAS } };
})();
window.OS = OS;
