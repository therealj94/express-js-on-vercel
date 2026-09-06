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

  function pintarSalud(s) {
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
  async function decidir(id, decision) {
    try {
      const r = await fetch(`/autorizaciones/${encodeURIComponent(id)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || r.status);
      avisar(decision === 'aprobado' ? 'Aprobado. Dígale a ULTRON que siga: la aprobación vale media hora.' : 'Negado.');
      DATOS.get('/autorizaciones').then(pintarAutorizaciones).catch(() => {});
      /* Con la aprobación puesta, ULTRON tiene que volver a llamar a la
         herramienta. Se le manda el aviso como un turno corto. */
      if (decision === 'aprobado') enviar(`Aprobé el pedido ${String(id).slice(-6)}: seguí con eso.`);
    } catch (e) { avisar(`No se pudo: ${e.message}`, true); }
  }

  // ── la bóveda: el valor va de esta pantalla al servidor y a ningún otro lado
  function dialogo(html) {
    const d = document.createElement('div'); d.id = 'dialogo'; d.innerHTML = `<div>${html}</div>`;
    d.addEventListener('click', (e) => { if (e.target === d) d.remove(); });
    document.body.appendChild(d); return d;
  }
  async function abrirBoveda() {
    let lista = null; try { lista = await DATOS.get('/boveda'); } catch { /* sin lectura */ }
    const filas = (lista?.secretos || []).map((x) => `<div class="fila dato"><span>${esc(x.nombre)}</span><span class="${x.corto ? 'mal' : x.dias > 90 ? 'amb' : 'ok'}">${x.largo} car. · ${x.dias} d${x.aplicadoEn?.length ? ' · ' + x.aplicadoEn.map((a) => a.app).join(',') : ''}</span></div>`).join('');
    const d = dialogo(`<h3>LA BÓVEDA</h3>
      <div class="sub">${lista?.encendida ? 'Los valores se cifran aquí y no salen por ningún lado: ULTRON solo ve nombres y edades.' : 'APAGADA: falta ULTRON_BOVEDA_LLAVE en el servidor (32 bytes en hex).'}</div>
      <div style="display:flex;flex-direction:column;gap:3px;max-height:160px;overflow-y:auto">${filas || '<div class="sub">vacía</div>'}</div>
      ${soyDueño && lista?.encendida ? `<label>NOMBRE<input id="bv-nombre" placeholder="MONGO_PASSWORD" autocomplete="off"></label>
      <label>VALOR<input id="bv-valor" type="password" autocomplete="new-password" placeholder="se guarda cifrado"></label>
      <label>NOTA (opcional)<input id="bv-nota" placeholder="para qué es"></label>
      <div class="fila-btn"><button class="btn" id="bv-cerrar">CERRAR</button><button class="btn si" id="bv-guardar">GUARDAR</button></div>`
      : `<div class="fila-btn"><button class="btn" id="bv-cerrar">CERRAR</button></div>`}`);
    d.querySelector('#bv-cerrar').onclick = () => d.remove();
    const g = d.querySelector('#bv-guardar');
    if (g) g.onclick = async () => {
      const nombre = d.querySelector('#bv-nombre').value, valor = d.querySelector('#bv-valor').value, nota = d.querySelector('#bv-nota').value;
      g.disabled = true;
      try {
        const r = await fetch('/boveda', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre, valor, nota }) });
        const x = await r.json(); if (!r.ok) throw new Error(x.error || r.status);
        avisar(`Guardado ${x.nombre} (${x.largo} caracteres).`); d.remove();
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

  async function aplicarPreferencias(p) {
    PREF = p || PREF;
    if (!PREF) return;
    document.dispatchEvent(new CustomEvent('ultron:preferencias'));
    conVoz = PREF.conVoz !== false;
    $('#altavoz')?.setAttribute('aria-pressed', String(conVoz));
    if (locutor) locutor.vozId = PREF.vozId || null;
    /* El idioma no es solo la pantalla: también es en el que escucha el
       micrófono. Si está en inglés y el reconocedor sigue en español, lo que
       se dicta llega escrito como suena en español y no se entiende nada. */
    IDIOMA = PREF.idioma === 'en' ? 'en-US' : 'es-HN';
    document.documentElement.lang = PREF.idioma === 'en' ? 'en' : 'es';
    if (PREF.figura && window.UltronNucleo && UltronNucleo.figuraActual() !== PREF.figura) {
      UltronNucleo.cambiarFigura(PREF.figura);
    }
  }

  async function guardarPreferencia(cambios) {
    try {
      const p = await DATOS.post('/preferencias', cambios);
      await aplicarPreferencias(p);
      return p;
    } catch (e) { avisar(`No se pudo guardar: ${e.message}`, true); return null; }
  }

  async function abrirAjustes() {
    const [yo, pref, voces, ses, salud, casa] = await Promise.all([
      DATOS.get('/yo').catch(() => null),
      DATOS.get('/preferencias').catch(() => null),
      DATOS.get('/voces').catch(() => null),
      DATOS.get('/sesiones').catch(() => null),
      DATOS.get('/salud').catch(() => null),
      DATOS.get('/casa').catch(() => null),
    ]);
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
        <div class="aj-fila"><span>De dónde</span>
          <input class="aj-sel" id="aj-lugar" value="${esc(PREF?.lugar || 'Tegucigalpa')}" placeholder="Tegucigalpa" style="font-family:var(--mono)"></div>
        <p class="aj-nota">Al entrar, ULTRON saluda con el tiempo de este sitio. Roatán, Tegucigalpa, San Pedro Sula, La Ceiba, Utila y Guanaja los sabe de memoria; cualquier otro lo busca.</p>
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
      try { await DATOS.borrar(`/sesiones/${encodeURIComponent(b.dataset.cerrar)}`); avisar('Sesión cerrada.'); d.remove(); abrirAjustes(); }
      catch (e) { avisar(`No se pudo cerrar: ${e.message}`, true); b.disabled = false; b.textContent = 'CERRAR'; }
    });
    d.querySelector('#aj-otras').onclick = async () => {
      try { const r = await DATOS.post('/sesiones/cerrar-otras', {}); avisar(r.cerradas ? `${r.cerradas} sesión(es) cerradas.` : 'No había ninguna otra abierta.'); d.remove(); abrirAjustes(); }
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
      ? abiertos.slice(0, 12).map((p) => `
        <div style="display:flex;gap:7px;align-items:flex-start">
          <span style="width:5px;height:5px;border-radius:50%;background:${p.vence && +new Date(p.vence) < Date.now() ? 'var(--rojo)' : 'var(--ambar)'};margin-top:6px;flex:none;box-shadow:0 0 6px ${p.vence && +new Date(p.vence) < Date.now() ? 'var(--rojo)' : 'var(--ambar)'}"></span>
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
    vigilante = await VOZ.vigilarMicrofono({
      umbral: PREF?.soloYo === false ? 0.04 : 0.07,   // «solo a mí» exige más cerca
      alHablar: () => {
        if (!locutor?.ocupado) return;
        locutor.callar();
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

  /* ¿El navegador YA tiene el permiso del micrófono dado? Se pregunta sin
     pedirlo. Donde no se pueda preguntar —Safari no siempre deja— se contesta
     que no: nunca se abre el micrófono por si acaso. */
  async function micYaConcedido() {
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
    if (!conVoz || !muletillas?.length) return;
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
  function despertarVoz() {
    locutor = locutor || locutorNuevo();
    locutor.despertar?.();
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

  function pintarDicho(md) {
    $('#globo').classList.remove('oculto');
    $('#dicho').innerHTML = window.MARKDOWN ? MARKDOWN.aHtml(md) : esc(md);
    $('#dicho').scrollTop = $('#dicho').scrollHeight;
  }

  /* El botón de «oír el resto». Sale junto a las sugerencias, con la misma
     forma, porque es lo mismo: algo que se puede tocar y que no molesta si no. */
  function chipsMas(texto) {
    const c = $('#chips');
    if (!c || !texto) return;
    c.classList.remove('oculto');
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = 'OÍR TODO';
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
    if (conVoz) { locutor = locutor || locutorNuevo(); locutor.despertar?.(); muletillaTrasEspera('general'); }

    /* try/finally, y no es adorno. `DATOS.pensar` abre un SSE que puede durar
       veinte segundos; en un teléfono que cambia de celda a mitad, la promesa
       RECHAZA y sin este envoltorio la ejecución nunca llegaba a devolver el
       botón: `pensando` se quedaba en true y ENVIAR deshabilitado para siempre.
       La consola quedaba muerta hasta recargar, en la ruta principal del
       producto y con la avería más común que hay. */
    try {
      await DATOS.pensar(t, { conversacionId, modo: 'texto' }, {
        abre: (d) => { conversacionId = d.conversacionId || conversacionId; },
        texto: (d) => {
          if (!acum) pararMuletillas();      // empezó a contestar: nada de hablar encima
          acum += d.t || ''; pintarDicho(acum);
          if (conVoz) locutor?.alimentar?.(d.t || '');
        },
        herramienta: (d) => {
          if (!acum) muletillaTrasEspera(GRUPO_DE[d.nombre] || 'general', 700);
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
          DATOS.get('/autorizaciones').then(pintarAutorizaciones).catch(() => {});
        },
        error: (msj) => { estado('error', 'concern'); avisar(msj, true); setTimeout(() => estado('idle', 'neutral'), 2600); },
      });
    } catch (e) {
      estado('error', 'concern');
      avisar(`Se cortó la conexión con ULTRON: ${e?.message || e}`, true);
      setTimeout(() => { if (mente.state === 'error') estado('idle', 'neutral'); }, 3200);
    } finally {
      /* Y se apaga la muletilla: si el turno se corta antes de la primera
         letra, el temporizador seguía vivo y ULTRON decía «déjeme ver» encima
         del mensaje de error. */
      pararMuletillas();
      pensando = false; $('#enviar').disabled = false;
      if (mente.state !== 'speak' && mente.state !== 'error') estado('idle', 'neutral');
      /* Si la voz se cortó por larga, se ofrece oírla entera. Es un botón y no
         una pregunta: quien quiere el resto lo toca, y quien no, no oye nada. */
      if (conVoz && locutor?.cortado) chipsMas(acum);
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
    if (!VOZ.hayOido?.()) { avisar('Este navegador no trae reconocimiento de voz. En Chrome sí funciona.', true); return; }
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
  function volverAEscuchar() {
    if (!despierta) return;
    setTimeout(() => { if (despierta) dictar(volverAEscuchar); }, 450);
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
    micAutorizado = true;              // desde aquí ya se puede vigilar para interrumpir
    estado('listen');
    $('#micro').classList.add('oyendo');
    $('#micro').setAttribute('aria-pressed', 'true');
    const fin = () => { $('#micro').classList.remove('oyendo'); $('#micro').setAttribute('aria-pressed', 'false'); alTerminar?.(); };
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
        mando?.abort(); fin(); enviar(limpia);
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

  /* EL SALUDO SE DICE EN VOZ ALTA. Se pintaba y nada más: José entraba, veía
     «Buenos días» escrito y ULTRON no abría la boca — con la voz encendida, un
     asistente que saluda por escrito es un asistente mudo con buena letra.
     Suena porque el clic de Ingresar ya despertó el audio: es el único gesto
     que hay garantizado entre cargar la página y este momento. */
  async function saludar() {
    try {
      const s = await DATOS.get('/saludo');
      if (!s?.texto) return;
      pintarDicho(s.texto); chips(s.sugerencias || null);
      if (conVoz) {
        locutor = locutor || locutorNuevo();
        locutor.despertar?.();
        /* El saludo se dice ENTERO: es corto y es lo primero que se oye. */
        const antes = locutor.tope; locutor.tope = 0;
        locutor.alimentar(s.texto);
        locutor.cerrar();
        locutor.tope = antes;
      }
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
      if (PREF?.oido === 'conversacion' && VOZ.hayOido?.() && await micYaConcedido()) esperarYEscuchar();
    } catch { /* sin saludo se entra igual */ }
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
      DATOS.get('/salud/profunda').then(pintarSaludPropia).catch(() => pintarSaludPropia(null));
    };
    leer();
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
    /* Las preferencias, lo primero: la voz, el idioma y la figura tienen que
       estar puestas antes de que ULTRON diga la primera palabra. */
    DATOS.get('/preferencias').then(aplicarPreferencias).catch(() => {});
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
    $('#micro').addEventListener('click', () => { despertarVoz(); dictar(); });
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
  const unaVez = () => { if (yaArranco) return; yaArranco = true; arrancar(); };
  document.addEventListener('ultron:adentro', unaVez);
  if (!document.getElementById('entrada')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', unaVez);
    else unaVez();
  }

  return { enviar, estado, avisar, mente, despertarVoz, abrirAjustes, _adentro: { pintarVivo, pintarSalud, pintarSaludPropia, pintarArchivos, pintarPendientes, pintarAutorizaciones, pintarDicho, DESPIERTA, CASAS,
    /* Solo para la prueba: mueve el reloj de la última lectura buena hacia
       atrás, para comprobar que la pantalla avisa cuando se queda vieja sin
       tener que esperar diez minutos de verdad. */
    envejecer: (segundos) => { ultimaBuena = Date.now() - segundos * 1000; } } };
})();
window.OS = OS;
