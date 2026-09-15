(() => {
  const $ = (id) => document.getElementById(id);
  const chat = $('chat'), bar = $('bar'), hilos = $('hilos');
  let convId = null, abortar = null, vacio = true, enCurso = false;

  const ETIQUETA = {
    buscar_web: 'Buscando en Internet',
    leer_pagina: 'Leyendo una página',
    pagina_foto: 'Sacando foto de la página',
    pagina_entrar: 'Entrando al sitio',
    repo_arbol: 'Mirando el repo',
    repo_leer: 'Leyendo código',
    repo_buscar: 'Buscando en el código',
    repo_proponer_cambio: 'Armando un cambio (PR)',
    terminal: 'En la terminal',
    crear_documento: 'Escribiendo un documento',
    listar_archivos: 'Viendo archivos subidos',
    leer_archivo: 'Leyendo un archivo',
    estado_vivo: 'Midiendo las casas',
    buscar_saber: 'Buscando en el saber',
    desplegarse: 'Desplegando',
    heroku_registro: 'Leyendo logs',
    mongo_consultar: 'Consultando la base',
  };

  function abrirProceso(titulo) {
    $('procTit').textContent = titulo || 'En ello';
    $('log').textContent = '';
    $('proceso').classList.add('on');
    if ($('cerrarFijo')) $('cerrarFijo').classList.add('on');
  }
  function cerrarProceso() {
    $('proceso').classList.remove('on');
    bar.textContent = '';
    enCurso = false;
  }
  function paso(txt) {
    const el = document.createElement('div');
    el.className = 'paso';
    el.textContent = '→ ' + txt;
    $('log').appendChild(el);
    $('log').scrollTop = $('log').scrollHeight;
    bar.textContent = txt;
    $('procTit').textContent = txt;
  }
  function trozo(txt, code) {
    if (!txt) return;
    const el = document.createElement('div');
    el.className = code ? 'code' : 'paso';
    el.textContent = String(txt).slice(0, 1200);
    $('log').appendChild(el);
    $('log').scrollTop = $('log').scrollHeight;
  }
  function pareceCodigo(s) {
    const t = String(s || '');
    return /function |const |let |import |class |def |```|\/infra\/|{/.test(t) && t.length > 40;
  }


  const api = (ruta, opt = {}) => fetch(ruta, { credentials: 'same-origin', ...opt });
  async function json(ruta, opt) {
    const r = await api(ruta, opt);
    if (r.status === 401) { $('login').style.display = 'flex'; throw new Error('SIN_SESION'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || d.mensaje || String(r.status));
    return d;
  }

  function home() {
    vacio = true;
    convId = null;
    $('titulo').textContent = 'Ultron';
    chat.innerHTML = `<div class="empty">
      <h1>Ultron</h1>
      <p>La junta, en un chat.</p>
      <div class="pills">
        <button type="button" data-q="¿Cómo está el tesoro y el ORIGEN ahora?">Tesoro</button>
        <button type="button" data-q="Seguí el trabajo que quedó a medias. ¿Qué falta?">Trabajo</button>
        <button type="button" data-q="Listá los pendientes abiertos de la junta.">Pendientes</button>
        <button type="button" data-q="Dame el parte de salud de las casas.">Casas</button>
      </div>
    </div>`;
    chat.querySelectorAll('[data-q]').forEach((b) => {
      b.onclick = () => { $('texto').value = b.dataset.q; enviar(); };
    });
  }

  function add(rol, texto) {
    if (vacio) { chat.innerHTML = ''; vacio = false; }
    const el = document.createElement('div');
    el.className = 'msg ' + (rol === 'me' ? 'me' : 'ai');
    el.innerHTML = '<div class="b"></div>';
    el.querySelector('.b').textContent = texto || '';
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return el.querySelector('.b');
  }

  function cuando(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
    return d.toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' });
  }

  async function lista() {
    const raw = await json('/conversaciones');
    const arr = Array.isArray(raw) ? raw : raw.conversaciones || [];
    hilos.innerHTML = arr.length ? '' : '<a><span class="t">Sin chats aún</span></a>';
    arr.forEach((c) => {
      const a = document.createElement('a');
      a.href = '#';
      const preview = (c.ultimo && (c.ultimo.texto || c.ultimo)) || c.preview || '';
      a.innerHTML = `<span class="t">${c.titulo || 'Sin título'}</span>
        <small>${cuando(c.tocado || c.en)} ${preview ? '· ' + String(preview).slice(0, 70) : ''}</small>
        ${c.trabajo && c.trabajo.falta ? `<div class="w">En curso · ${String(c.trabajo.falta).slice(0, 90)}</div>` : ''}`;
      a.onclick = (ev) => { ev.preventDefault(); abrir(c._id || c.id); closeNav(); };
      hilos.appendChild(a);
    });
  }

  async function abrir(id) {
    const c = await json('/conversaciones/' + id);
    convId = String(c._id || id);
    $('titulo').textContent = c.titulo || 'Ultron';
    chat.innerHTML = '';
    vacio = false;
    (c.turnos || []).forEach((t) => {
      const rol = (t.rol === 'ultron' || t.rol === 'assistant') ? 'ai' : 'me';
      const dest = add(rol, t.texto || '');
      const hs = (t.herramientas || []).map((h) => h.nombre || h).filter(Boolean);
      if (hs.length) {
        const m = document.createElement('div');
        m.className = 'tools';
        m.textContent = hs.join(' · ');
        dest.parentElement.appendChild(m);
      }
    });
    if (c.trabajo && c.trabajo.falta) {
      const w = add('ai', `Trabajo a medias.\n${c.trabajo.objetivo || ''}\nFalta: ${c.trabajo.falta}`);
      w.parentElement.style.opacity = '.85';
    }
    chat.scrollTop = chat.scrollHeight;
  }

  function closeNav() { $('drawer').classList.remove('on'); $('scrim').classList.remove('on'); }

  async function sesion() {
    try {
      await json('/yo');
      $('login').style.display = 'none';
      await lista();
      const hoy = await json('/conversaciones/hoy').catch(() => null);
      if (hoy && hoy._id && (hoy.turnos || hoy.ultimos || []).length) await abrir(hoy._id);
      else home();
    } catch { $('login').style.display = 'flex'; }
  }

  $('entrar').onclick = async () => {
    $('loginErr').textContent = '';
    const r = await api('/entrar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: $('correo').value.trim(), clave: $('clave').value }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { $('loginErr').textContent = d.error || 'No entra'; return; }
  
  function calentar() {
    api('/precalentar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modo: 'texto' }) }).catch(() => {});
  }
  sesion();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) calentar(); });
  };

  $('menu').onclick = () => { $('drawer').classList.add('on'); $('scrim').classList.add('on'); lista().catch(() => {}); };
  $('scrim').onclick = closeNav;
  $('nuevo').onclick = () => { closeNav(); home(); };

  $('adj').onclick = () => $('file').click();
  $('file').onchange = async () => {
    const f = $('file').files && $('file').files[0];
    $('file').value = '';
    if (!f) return;
    bar.textContent = 'Subiendo ' + f.name + '…';
    try {
      const r = await api('/archivos', {
        method: 'POST',
        headers: { 'Content-Type': f.type || 'application/octet-stream', 'x-nombre': encodeURIComponent(f.name), ...(convId ? { 'x-conversacion': convId } : {}) },
        body: f,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se subió');
      $('texto').value = (`Leé el archivo «${f.name}» (id ${d._id || d.id || ''}) y seguí con lo que pido.` + ($('texto').value ? '\n' + $('texto').value : '')).trim();
      bar.textContent = 'Listo · ' + f.name;
    } catch (e) { bar.textContent = String(e.message || e); }
  };

  async function enviar(forzado) {
    const texto = (forzado || $('texto').value).trim();
    if (!texto) return;
    if (!forzado) $('texto').value = '';
    add('me', texto);
    const dest = add('ai', '');
    enCurso = true;
    abrirProceso('Pensando…');
    paso(forzado ? 'Cerrando el turno con lo que hay' : 'Arrancó el turno');
    abortar?.abort();
    abortar = new AbortController();
    let acc = '';
    try {
      const r = await api('/pensar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, conversacionId: convId, modo: 'texto' }),
        signal: abortar.signal,
      });
      if (r.status === 401) { $('login').style.display = 'flex'; return; }
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        dest.textContent = d.error || d.mensaje || 'No pudo contestar';
        bar.textContent = '';
        return;
      }
      const lector = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const bloque = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(bloque)?.[1];
          const raw = /^data: (.+)$/m.exec(bloque)?.[1];
          if (!ev || !raw) continue;
          let d; try { d = JSON.parse(raw); } catch { continue; }
          if (ev === 'reemplazo') {
            const nx = d.texto || d.t || '';
            if (nx.trim()) { acc = nx; dest.textContent = acc; }
          } else if (ev === 'texto') { acc += d.texto || d.t || ''; dest.textContent = acc; chat.scrollTop = chat.scrollHeight; }
          else if (ev === 'pensando') {
            const h = d.hace || '';
            if (h && h !== 'sigue en ello' && h !== 'abriendo el hilo') paso(h);
          }
          else if (ev === 'herramienta') {
            const n = d.nombre || '';
            paso((ETIQUETA[n] || d.hace || n) + (n ? ' · ' + n : ''));
            if (d.entrada && (d.entrada.consulta || d.entrada.q || d.entrada.url || d.entrada.ruta || d.entrada.comando)) {
              trozo(d.entrada.consulta || d.entrada.q || d.entrada.url || d.entrada.ruta || d.entrada.comando);
            }
          } else if (ev === 'herramienta-lista') {
            const s = d.salida || '';
            paso('Listo · ' + (d.nombre || 'mano'));
            trozo(s, pareceCodigo(s));
          } else if (ev === 'titulo' && d.titulo) $('titulo').textContent = d.titulo;
          else if (ev === 'fin') { checarAuth();
            convId = d.conversacionId || convId;
            if (d.texto && !acc) dest.textContent = d.texto;
            const toks = d.ms && d.ms.toks;
            const prim = d.ms && d.ms.primera;
            const tot = d.ms && d.ms.total;
            const linea = [toks != null ? toks + ' tok/s' : null, prim ? (prim/1000).toFixed(1)+' s 1.ª' : null, tot ? (tot/1000).toFixed(1)+' s' : null].filter(Boolean).join(' · ');
            paso(linea ? ('Listo · ' + linea) : 'Listo');
            bar.textContent = linea || '';
            if ($('procTit')) $('procTit').textContent = linea || 'Listo';
            setTimeout(cerrarProceso, 8000);
            setTimeout(calentar, 1500);
          } else if (ev === 'error') {
            dest.textContent = d.mensaje || d.error || 'Error';
            paso(d.mensaje || 'Error');
            cerrarProceso();
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') dest.textContent = String(e.message || e);
      if (e.name === 'AbortError') paso('Corte. Pedí el cierre.');
      else cerrarProceso();
    }
  }

    function pedirCierre() {
    if (!enCurso) { bar.textContent = 'No hay un turno en curso.'; return; }
    abortar?.abort();
    paso('Cortado. Pidiendo el cierre…');
    const cierre = 'NO empieces de cero NI borres lo anterior. NO uses repo_leer. Entregá el resultado: si hay un cambio, llama repo_proponer_cambio ahora; si hay un plan, crear_documento. HECHO y FALTA. Si no podés llamar la tool, pegá el parche completo en el chat.';
    setTimeout(() => enviar(cierre), 250);
  }
  $('cerrarTurno').onclick = pedirCierre;
  if ($('cerrarFijo')) $('cerrarFijo').onclick = pedirCierre;
  if ($('cerrarHead')) $('cerrarHead').onclick = pedirCierre;
  if (false) $('cerrarTurno').onclick = () => {
    if (!enCurso) return;
    abortar?.abort();
    const cierre = 'NO empieces de cero NI borres lo anterior. NO uses repo_leer. Entregá el resultado: si hay un cambio, llama repo_proponer_cambio ahora; si hay un plan, crear_documento. HECHO y FALTA. Si no podés llamar la tool, pegá el parche completo en el chat.';
    setTimeout(() => enviar(cierre), 200);
  };

  $('box').onsubmit = (e) => { e.preventDefault(); enviar(); };
  $('texto').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
  });


  let prefs = {}, casa = {}, yo = null, esDueño = false;

  function marcar(seg, v) {
    document.querySelectorAll('#' + seg + ' button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  }

  async function abrirAjustes() {
    $('ajErr').textContent = '';
    prefs = await json('/preferencias');
    casa = await json('/casa').catch(() => ({}));
    yo = await json('/yo').catch(() => ({}));
    esDueño = yo.permiso === 'dueño' || (yo.miembro && yo.miembro.correo === yo.dueño);
    marcar('segInterfaz', prefs.interfaz === 'pro' ? 'pro' : 'lite');
    marcar('segCerebro', casa.cerebro || casa.cual || 'nodo');
    marcar('segIdioma', prefs.idioma === 'en' ? 'en' : 'es');
    marcar('segVoz', prefs.conVoz === false ? 'off' : 'on');
    $('lugar').value = prefs.lugar || 'Tegucigalpa';
    $('hintCerebro').textContent = esDueño
      ? ('Ahora: ' + (casa.cual || casa.cerebro || '?') + (casa.claudeConfigurado ? ' · Claude listo' : ' · Claude sin llave'))
      : 'El cerebro de la casa lo cambia solo el dueño.';
    $('segCerebro').style.opacity = esDueño ? '1' : '.45';
    $('ajustes').classList.add('on');
    checarAuth();
  }

  document.querySelectorAll('#segInterfaz button, #segCerebro button, #segIdioma button, #segVoz button').forEach((b) => {
    b.onclick = () => {
      const seg = b.parentElement.id;
      if (seg === 'segCerebro' && !esDueño) { $('ajErr').textContent = 'Solo el dueño cambia el cerebro.'; return; }
      marcar(seg, b.dataset.v);
    };
  });

  $('gear').onclick = () => abrirAjustes().catch((e) => { $('ajErr').textContent = e.message; $('ajustes').classList.add('on');
    checarAuth(); });
  $('cerrarAjustes').onclick = () => $('ajustes').classList.remove('on');

  $('guardarAjustes').onclick = async () => {
    $('ajErr').textContent = 'Guardando…';
    const interfaz = document.querySelector('#segInterfaz button.on')?.dataset.v || 'lite';
    const idioma = document.querySelector('#segIdioma button.on')?.dataset.v || 'es';
    const voz = document.querySelector('#segVoz button.on')?.dataset.v !== 'off';
    const cerebro = document.querySelector('#segCerebro button.on')?.dataset.v;
    try {
      await json('/preferencias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interfaz, idioma, conVoz: voz, lugar: $('lugar').value.trim() }) });
      if (esDueño && cerebro) {
        await json('/casa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cerebro }) }).catch((e) => { throw e; });
      }
      $('ajErr').textContent = 'Guardado.';
      if (interfaz === 'pro') location.href = '/os';
    } catch (e) { $('ajErr').textContent = e.message || String(e); }
  };

  $('cerrarOtras').onclick = async () => {
    try { const d = await json('/sesiones/cerrar-otras', { method: 'POST' }); $('ajErr').textContent = 'Cerradas: ' + (d.cerradas ?? 'ok'); }
    catch (e) { $('ajErr').textContent = e.message; }
  };

  $('salir').onclick = async () => {
    await api('/salir', { method: 'POST' });
    location.reload();
  };


  let authPendiente = null;

  function pintarAuthLista(d) {
    const box = $('authLista');
    if (!box) return;
    const pend = d.pendientes || [];
    const rec = (d.recientes || []).slice(0, 8);
    if (!pend.length && !rec.length) { box.innerHTML = '<p class="hint">Nada pendiente.</p>'; return; }
    box.innerHTML = pend.map((p) => `<div class="item"><b>Pendiente · ${p.herramienta || ''}</b><div>${p.resumen || ''}</div>
      <button type="button" data-id="${p._id || p.id}" data-d="aprobado">Aprobar</button>
      <button type="button" data-id="${p._id || p.id}" data-d="negado">Denegar</button></div>`).join('')
      + rec.filter((p) => p.estado !== 'pendiente').map((p) => `<div class="item">${p.estado} · ${p.herramienta || ''} · ${(p.resumen || '').slice(0, 80)}</div>`).join('');
    box.querySelectorAll('button[data-id]').forEach((b) => {
      b.onclick = () => decidir(b.dataset.id, b.dataset.d);
    });
  }

  function mostrarPopup(p) {
    if (!p || authPendiente === String(p._id || p.id)) return;
    authPendiente = String(p._id || p.id);
    $('authResumen').textContent = p.resumen || p.herramienta || 'Pedido de autorización';
    $('authMeta').textContent = (p.herramienta || '') + (p.motivo ? ' · ' + p.motivo : '');
    $('popupAuth').classList.add('on');
    $('authSi').onclick = () => decidir(authPendiente, 'aprobado');
    $('authNo').onclick = () => decidir(authPendiente, 'negado');
  }

  async function decidir(id, decision) {
    try {
      await json('/autorizaciones/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
      $('popupAuth').classList.remove('on');
      authPendiente = null;
      bar.textContent = decision === 'aprobado' ? 'Aprobado. Decile «seguí».' : 'Negado.';
      const d = await json('/autorizaciones').catch(() => ({ pendientes: [] }));
      pintarAuthLista(d);
    } catch (e) { bar.textContent = e.message || String(e); }
  }

  async function checarAuth() {
    try {
      const d = await json('/autorizaciones');
      pintarAuthLista(d);
      const p = (d.pendientes || [])[0];
      if (p) mostrarPopup(p);
      else $('popupAuth').classList.remove('on');
    } catch { /* sin sesión */ }
  }

  setInterval(checarAuth, 8000);


  function calentar() {
    api('/precalentar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modo: 'texto' }) }).catch(() => {});
  }
  sesion();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) calentar(); });
  checarAuth();
})();
