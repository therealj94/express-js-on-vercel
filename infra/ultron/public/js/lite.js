(() => {
  const $ = (id) => document.getElementById(id);
  const chat = $('chat'), estado = $('estado'), hilos = $('hilos');
  let convId = null, abortar = null, yo = null;

  const api = (ruta, opt = {}) => fetch(ruta, { credentials: 'same-origin', ...opt });

  async function json(ruta, opt) {
    const r = await api(ruta, opt);
    if (r.status === 401) { $('login').style.display = 'flex'; throw new Error('SIN_SESION'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || r.status);
    return d;
  }

  function burbuja(rol, texto) {
    const el = document.createElement('div');
    el.className = 'msg ' + (rol === 'user' || rol === 'usuario' ? 'user' : 'bot');
    const pre = document.createElement('pre');
    pre.textContent = texto || '';
    el.appendChild(pre);
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return pre;
  }

  async function cargarHilos() {
    const lista = await json('/conversaciones');
    hilos.innerHTML = '';
    (Array.isArray(lista) ? lista : lista.conversaciones || []).forEach((c) => {
      const a = document.createElement('a');
      a.href = '#';
      a.innerHTML = `${c.titulo || 'Sin título'}<small>${(c.trabajo && c.trabajo.falta) ? 'Trabajo: ' + c.trabajo.falta.slice(0, 80) : (c.tocado || c.en || '')}</small>`;
      a.onclick = (e) => { e.preventDefault(); abrir(c._id || c.id); cerrarMenu(); };
      hilos.appendChild(a);
    });
  }

  async function abrir(id) {
    const c = await json('/conversaciones/' + id);
    convId = c._id || id;
    $('titulo').textContent = c.titulo || 'Ultron';
    chat.innerHTML = '';
    (c.turnos || []).forEach((t) => burbuja(t.rol === 'ultron' || t.rol === 'assistant' ? 'bot' : 'user', t.texto));
    if (c.trabajo && c.trabajo.falta) {
      const w = document.createElement('div');
      w.className = 'trabajo';
      w.textContent = 'En curso · ' + (c.trabajo.objetivo || '') + ' → ' + c.trabajo.falta;
      chat.appendChild(w);
    }
    chat.scrollTop = chat.scrollHeight;
  }

  function cerrarMenu() { $('lista').classList.remove('abierta'); $('fondo').classList.remove('on'); }

  async function sesion() {
    try {
      yo = await json('/yo');
      $('login').style.display = 'none';
      await cargarHilos();
      const hoy = await json('/conversaciones/hoy').catch(() => null);
      if (hoy && hoy._id) await abrir(hoy._id);
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
    sesion();
  };

  $('menu').onclick = () => { $('lista').classList.add('abierta'); $('fondo').classList.add('on'); cargarHilos().catch(() => {}); };
  $('fondo').onclick = cerrarMenu;
  $('nuevo').onclick = () => { convId = null; chat.innerHTML = ''; $('titulo').textContent = 'Ultron'; };

  $('caja').onsubmit = async (e) => {
    e.preventDefault();
    const texto = $('texto').value.trim();
    if (!texto) return;
    $('texto').value = '';
    burbuja('user', texto);
    const dest = burbuja('bot', '');
    estado.textContent = 'Pensando…';
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
        estado.textContent = '';
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
          if (ev === 'texto') { acc += d.texto || d.t || ''; dest.textContent = acc; chat.scrollTop = chat.scrollHeight; }
          else if (ev === 'pensando') estado.textContent = d.hace || 'Pensando…';
          else if (ev === 'herramienta') estado.textContent = d.nombre || d.hace || 'herramienta';
          else if (ev === 'titulo' && d.titulo) $('titulo').textContent = d.titulo;
          else if (ev === 'fin') {
            convId = d.conversacionId || convId;
            if (d.texto && !acc) dest.textContent = d.texto;
            estado.textContent = '';
          } else if (ev === 'error') {
            dest.textContent = d.mensaje || d.error || 'Error';
            estado.textContent = '';
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') dest.textContent = String(err.message || err);
      estado.textContent = '';
    }
  };

  sesion();
})();
