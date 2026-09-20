/* ============================================================
   Orden Global · Tesorería — núcleo del navegador
   ------------------------------------------------------------
   Cliente de estado con dos modos:
     · local — sin servidor: el estado vive en localStorage y los
       comandos corren aquí mismo (demostración, trabajo sin red).
     · api   — con servidor: cada comando viaja a POST api/comandos,
       el servidor lo valida con las MISMAS reglas (app/reglas.js),
       lo sella con SHA-256 y devuelve el estado nuevo.
   Las vistas no distinguen el modo: llaman a T.ejecutar(...) y
   reciben una promesa.
   ============================================================ */
(function (global) {
  'use strict';

  const R = global.TesoreriaReglas;
  const SEMILLA = global.TesoreriaSemilla;
  const LLAVE = 'og.tesoreria.v2';
  const LLAVE_SESION = 'og.tesoreria.sesion';

  const ETIQUETA_ROL = { presidente: 'Presidente del Consejo', consejero: 'Consejero', tesorero: 'Tesorero', auditor: 'Auditor' };

  /* ---------------- formato ---------------- */
  const fmt = {
    num(n, d = 0) {
      if (n === null || n === undefined || Number.isNaN(n)) return '—';
      return Number(n).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
    },
    dinero(n, mon = 'USD', d = 2) {
      if (n === null || n === undefined || Number.isNaN(n)) return '—';
      return (mon === 'USD' ? '$' : mon === 'MXN' ? 'MX$' : '') + Number(n).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
    },
    compacto: (n) => R.fmt.compacto(n),
    dineroCorto: (n, mon = 'USD') => (mon === 'USD' ? '$' : 'MX$') + R.fmt.compacto(n),
    origen: (u) => R.fmt.compacto(u) + ' ORIGEN',
    pct(n, d = 2) { return n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toFixed(d) + '%'; },
    fecha(iso) { return iso ? new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; },
    fechaHora(iso) { return iso ? new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; },
    relativo(iso) {
      if (!iso) return '—';
      const ms = new Date(iso) - Date.now(); const dias = Math.round(ms / 86400000);
      if (Math.abs(dias) >= 1) return dias > 0 ? `en ${dias} d` : `hace ${-dias} d`;
      const hrs = Math.round(ms / 3600000);
      if (Math.abs(hrs) >= 1) return hrs > 0 ? `en ${hrs} h` : `hace ${-hrs} h`;
      const min = Math.round(ms / 60000);
      return min > 0 ? `en ${min} min` : `hace ${Math.max(0, -min)} min`;
    },
    rol: (r) => ETIQUETA_ROL[r] || r,
  };

  /* ---------------- estado y modo ---------------- */
  let estado = null;
  let modo = 'local';          // 'local' | 'api'
  let sesionToken = '';
  let infoServidor = null;     // lo que responde api/salud
  const oyentes = [];
  const BASE = new URL('.', location.href);       // carpeta donde vive la página
  const urlApi = (ruta) => new URL('api/' + ruta.replace(/^\/?api\//, '').replace(/^\//, ''), BASE).toString();

  try { sesionToken = localStorage.getItem(LLAVE_SESION) || ''; } catch (e) { sesionToken = ''; }

  function suscribir(fn) { oyentes.push(fn); return () => { const i = oyentes.indexOf(fn); if (i >= 0) oyentes.splice(i, 1); }; }
  function emitir() { oyentes.forEach((f) => { try { f(estado); } catch (e) { console.error(e); } }); }

  /* --- modo local --- */
  function cargarLocal() {
    let crudo = null;
    try { crudo = localStorage.getItem(LLAVE); } catch (e) { crudo = null; }
    if (crudo) {
      try { const d = JSON.parse(crudo); if (d && d.version === SEMILLA.version) { estado = d; return estado; } } catch (e) { /* semilla nueva */ }
    }
    estado = R.clon(SEMILLA.estado);
    R.sellarLibro(estado);
    guardarLocal();
    return estado;
  }
  function guardarLocal() { try { localStorage.setItem(LLAVE, JSON.stringify(estado)); } catch (e) { /* modo privado */ } }

  /** Carga síncrona en modo local. La usan las páginas sin servidor y el arranque. */
  function cargar() { if (!estado) cargarLocal(); return estado; }

  /* --- modo api --- */
  async function api(ruta, opciones) {
    const o = Object.assign({ method: 'GET' }, opciones || {});
    const cab = Object.assign({ Accept: 'application/json' }, o.headers || {});
    if (sesionToken) cab.Authorization = 'Bearer ' + sesionToken;
    if (o.cuerpo !== undefined) { cab['Content-Type'] = 'application/json'; o.body = JSON.stringify(o.cuerpo); }
    const r = await fetch(urlApi(ruta), { method: o.method, headers: cab, body: o.body });
    const tipo = r.headers.get('content-type') || '';
    if (!tipo.includes('application/json')) { const err = new Error('El servidor no respondió JSON'); err.sinApi = true; err.status = r.status; throw err; }
    const j = await r.json();
    if (!r.ok) {
      const err = new Error(j.error || `Error ${r.status}`); err.status = r.status; err.datos = j;
      // Sesión vencida o cerrada en otro sitio: se vuelve a pedir entrada, sin perder la página.
      if (r.status === 401 && sesionToken && !ruta.startsWith('sesion/')) { sesionToken = ''; try { localStorage.removeItem(LLAVE_SESION); } catch (e) {} setTimeout(() => location.reload(), 300); }
      throw err;
    }
    return j;
  }

  /**
   * Decide el modo y carga el estado.
   * Con servidor: api/salud responde → modo api. Sin sesión → pantalla de entrada.
   * Sin servidor (archivo local, Vercel estático): modo local.
   */
  async function arrancar() {
    // Abierto como archivo no hay servidor posible: ni se intenta.
    if (location.protocol === 'file:') { modo = 'local'; cargarLocal(); return { modo, sesion: estado.sesion }; }
    try {
      infoServidor = await api('salud');
      modo = 'api';
    } catch (e) {
      modo = 'local'; cargarLocal(); return { modo, sesion: estado.sesion };
    }
    try {
      const r = await api('estado');
      estado = r.estado;
      return { modo, sesion: estado.sesion };
    } catch (e) {
      if (e.status === 401) { estado = null; return { modo, sesion: null }; }
      throw e;
    }
  }

  async function entrar(email, contrasena) {
    const r = await api('sesion/entrar', { method: 'POST', cuerpo: { email, contrasena } });
    sesionToken = r.token;
    try { localStorage.setItem(LLAVE_SESION, sesionToken); } catch (e) {}
    const est = await api('estado'); estado = est.estado; emitir();
    return r;
  }
  async function entrarConGenesis(token) {
    const r = await api('sesion/genesis', { method: 'POST', cuerpo: { token } });
    sesionToken = r.token;
    try { localStorage.setItem(LLAVE_SESION, sesionToken); } catch (e) {}
    const est = await api('estado'); estado = est.estado; emitir();
    return r;
  }
  async function salir() {
    if (modo === 'api') { try { await api('sesion/salir', { method: 'POST' }); } catch (e) {} }
    sesionToken = ''; try { localStorage.removeItem(LLAVE_SESION); } catch (e) {}
    estado = null;
    location.reload();
  }

  /* --- comandos --- */

  /** Ejecuta un comando con nombre. Devuelve { evento, resultado }. Lanza Error con mensaje legible. */
  async function ejecutar(nombre, datos) {
    if (modo === 'api') {
      const r = await api('comandos', { method: 'POST', cuerpo: { nombre, datos: datos || {} } });
      estado = r.estado; emitir();
      return { evento: r.evento, resultado: r.resultado };
    }
    const r = R.ejecutar(estado, nombre, datos, { actor: estado.sesion.usuario, rol: estado.sesion.rol });
    estado = r.estado; guardarLocal(); emitir();
    return { evento: r.evento, resultado: r.resultado };
  }

  /** Ejecuta y avisa con un toast. Resuelve `true` si salió bien. */
  async function correr(nombre, datos, tituloOk, textoOk, tipoOk) {
    try {
      const r = await ejecutar(nombre, datos);
      toast(tituloOk || 'Hecho', textoOk === undefined ? r.evento.detalle : textoOk, tipoOk || 'ok');
      return r;
    } catch (e) {
      toast('No se pudo', e.message, 'bad');
      return null;
    }
  }

  async function reiniciar() {
    if (modo === 'api') {
      const r = await api('estado/reiniciar', { method: 'POST' });
      estado = r.estado; emitir(); return;
    }
    try { localStorage.removeItem(LLAVE); } catch (e) {}
    estado = R.clon(SEMILLA.estado); R.sellarLibro(estado); guardarLocal(); emitir();
  }

  /* ---------------- consultas ligadas al estado ---------------- */
  const buscar = {
    security: (i) => R.buscar.security(estado, i),
    utility: (i) => R.buscar.utility(estado, i),
    token: (i) => R.buscar.token(estado, i),
    reserva: (i) => R.buscar.reserva(estado, i),
    solicitud: (i) => R.buscar.solicitud(estado, i),
    emisor: (i) => R.buscar.emisor(estado, i),
    asignacionesDe: (i) => estado.asignaciones.filter((a) => a.tokenId === i),
    solicitudesDe: (i) => estado.solicitudes.filter((s) => s.tokenId === i),
    pendientes: () => R.buscar.pendientes(estado),
  };
  const puede = (permiso) => estado && R.puede(estado.sesion.rol, permiso);

  /* ---------------- UI ---------------- */
  const el = (sel, raiz) => (raiz || document).querySelector(sel);
  const els = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const ICONOS = {
    escudo: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/>',
    panel: '<rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="11" width="7" height="10" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
    token: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10h5M9.5 14h5"/>',
    balanza: '<path d="M12 4v16M6 8h12M6 8l-3 6h6l-3-6zM18 8l-3 6h6l-3-6zM8 20h8"/>',
    boveda: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="4"/><path d="M12 8v1.5M12 14.5V16M8 12h1.5M14.5 12H16"/>',
    lista: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    libro: '<path d="M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2V5z"/><path d="M9 7h7M9 11h7"/>',
    grafico: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    personas: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.3a3 3 0 010 5.4M18 14.2c1.8.9 3 2.7 3 4.8"/>',
    escudo2: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
    alerta: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.5 17.4A2 2 0 004.2 20.4h15.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    flecha: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    candado: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 118 0v3"/>',
    fuego: '<path d="M12 3s5 4 5 9a5 5 0 01-10 0c0-2 1-3 1-3s1 1.5 2 1.5S12 7 12 3z"/>',
    tienda: '<path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M8 20v-6h4v6"/>',
    doc: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z"/><path d="M14 3v5h5"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    engrane: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1A1.6 1.6 0 007.5 19.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 003 15H3a2 2 0 110-4h.1A1.6 1.6 0 004.6 8.5l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 009 4.6V3a2 2 0 114 0v.1a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1.3z"/>',
    pausa: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    llave: '<circle cx="8" cy="15" r="4"/><path d="M10.9 12.1L20 3M17 6l2 2M14 9l2 2"/>',
    cadena: '<path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/>',
    salir: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
  };
  const ic = (n, cls) => `<svg viewBox="0 0 24 24" class="${cls || ''}" aria-hidden="true">${ICONOS[n] || ''}</svg>`;

  function toast(titulo, texto, tipo) {
    let cont = el('.toasts');
    if (!cont) { cont = document.createElement('div'); cont.className = 'toasts'; document.body.appendChild(cont); }
    const t = document.createElement('div');
    t.className = 'toast ' + (tipo || '');
    t.innerHTML = `<b>${esc(titulo)}</b>${texto ? `<span>${esc(texto)}</span>` : ''}`;
    cont.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, tipo === 'bad' ? 7000 : 4200);
  }

  let modalActual = null;
  function modal({ titulo, cuerpo, pie, ancho, alAbrir, fijo }) {
    cerrarModal();
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `
      <div class="modal ${ancho ? 'ancho' : ''}" role="dialog" aria-modal="true">
        <div class="cab"><h3>${esc(titulo)}</h3>${fijo ? '' : '<button class="x" data-cerrar aria-label="Cerrar">&times;</button>'}</div>
        <div class="cuerpo">${cuerpo}</div>
        ${pie ? `<div class="pie">${pie}</div>` : ''}
      </div>`;
    if (!fijo) fondo.addEventListener('click', (e) => { if (e.target === fondo || e.target.closest('[data-cerrar]')) cerrarModal(); });
    document.body.appendChild(fondo);
    document.body.style.overflow = 'hidden';
    modalActual = fondo;
    if (alAbrir) alAbrir(fondo);
    return fondo;
  }
  function cerrarModal() { if (modalActual) { modalActual.remove(); modalActual = null; document.body.style.overflow = ''; } }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalActual && !modalActual.dataset.fijo) cerrarModal(); });

  function confirmar(titulo, texto, alSi, textoBoton, peligro) {
    modal({
      titulo,
      cuerpo: `<p style="font-size:13.5px;line-height:1.6;color:var(--muted)">${texto}</p>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn ${peligro ? 'peligro' : 'pri'}" data-si>${esc(textoBoton || 'Confirmar')}</button>`,
      alAbrir(f) { el('[data-si]', f).addEventListener('click', () => { cerrarModal(); alSi(); }); },
    });
  }

  function pedirMotivo(titulo, etiqueta, fn) {
    modal({
      titulo,
      cuerpo: `<div class="campo mb0"><label>${esc(etiqueta)}</label><textarea id="m" placeholder="Queda asentado en el libro de la Autoridad."></textarea></div>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" data-ok>Confirmar</button>`,
      alAbrir(f) {
        el('[data-ok]', f).addEventListener('click', () => {
          const m = el('#m', f).value.trim();
          if (!m) return toast('Escribe el motivo', '', 'bad');
          cerrarModal(); fn(m);
        });
      },
    });
  }

  function tema(v) {
    const actual = document.documentElement.getAttribute('data-theme');
    const nuevo = v || (actual === 'light' ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', nuevo);
    try { localStorage.setItem('og.tema', nuevo); } catch (e) {}
  }
  (function temaInicial() { try { const t = localStorage.getItem('og.tema'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {} })();

  function medidor(pct, etiqueta, color, tam) {
    const T = tam || 132, Rr = T / 2 - 10, C = 2 * Math.PI * Rr;
    const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 100));
    return `<div class="medidor" style="width:${T}px;height:${T}px">
      <svg width="${T}" height="${T}">
        <circle cx="${T / 2}" cy="${T / 2}" r="${Rr}" stroke="var(--surface3)" stroke-width="9" fill="none"/>
        <circle cx="${T / 2}" cy="${T / 2}" r="${Rr}" stroke="${color}" stroke-width="9" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p / 100)}" style="--c:${C}"/>
      </svg>
      <div class="centro"><b>${Number.isFinite(pct) ? fmt.pct(pct, 1) : '∞'}</b><span>${esc(etiqueta)}</span></div>
    </div>`;
  }

  /* --- pantalla de entrada (modo api sin sesión) --- */
  function pantallaEntrada(alEntrar) {
    const params = new URLSearchParams(location.search);
    const tokenGenesis = params.get('gid_token') || params.get('token') || '';
    modal({
      fijo: true,
      titulo: 'Tesorería de Orden Global',
      cuerpo: `
        <p class="muted" style="font-size:13px;line-height:1.6;margin-bottom:16px">
          Esta plataforma decide cuánto ORIGEN existe. Entra con tu cuenta de operador o con tu sesión de Genesis ID.
          ${infoServidor && infoServidor.efimero ? '<br><span class="warn-t">El servidor está en modo archivo: los datos no sobreviven a un despliegue.</span>' : ''}
        </p>
        <div class="campo"><label>Correo</label><input id="em" type="email" autocomplete="username" placeholder="tu@ordenglobal.org"></div>
        <div class="campo"><label>Contraseña</label><input id="pw" type="password" autocomplete="current-password"></div>
        <div id="err" class="bad-t" style="font-size:12.5px;min-height:18px"></div>
        <details style="margin-top:8px"><summary class="ts" style="cursor:pointer">Entrar con Genesis ID</summary>
          <div class="campo mt10 mb0"><label>Token de sesión única (GID)</label>
            <input id="gt" placeholder="Pega el token que emite Genesis ID" value="${esc(tokenGenesis)}">
            <span class="ayuda">Lo emite el panel de Genesis ID para consejeros con identidad verificada.</span></div>
          <button class="btn chico mt10" data-genesis>${ic('llave')} Entrar con Genesis ID</button>
        </details>`,
      pie: `<a class="btn fantasma izq" href="./index.html">← Portal</a><button class="btn pri" data-entrar>Entrar</button>`,
      alAbrir(f) {
        const err = el('#err', f);
        const ir = async (fn) => {
          err.textContent = '';
          try { await fn(); cerrarModal(); alEntrar(); }
          catch (e) { err.textContent = e.message; }
        };
        el('[data-entrar]', f).addEventListener('click', () => ir(() => entrar(el('#em', f).value.trim(), el('#pw', f).value)));
        el('#pw', f).addEventListener('keydown', (e) => { if (e.key === 'Enter') el('[data-entrar]', f).click(); });
        el('[data-genesis]', f).addEventListener('click', () => ir(() => entrarConGenesis(el('#gt', f).value.trim())));
        if (tokenGenesis) el('[data-genesis]', f).click();
        setTimeout(() => el('#em', f).focus(), 50);
      },
    });
  }

  /** Cambio de contraseña. Si es obligatorio (contraseña provisional) no se puede cerrar. */
  function cambiarContrasena(obligatorio, alTerminar) {
    modal({
      fijo: !!obligatorio,
      titulo: obligatorio ? 'Cambia tu contraseña provisional' : 'Cambiar contraseña',
      cuerpo: `
        ${obligatorio ? `<div class="aviso warn" style="margin-bottom:16px">${ic('alerta')}<div><b>Con contraseña provisional puedes mirar, no operar</b><span class="txt">El servidor rechaza cualquier comando hasta que la cambies. Mínimo 12 caracteres.</span></div></div>` : ''}
        <div class="campo"><label>Contraseña actual</label><input id="ca" type="password" autocomplete="current-password"></div>
        <div class="campo"><label>Contraseña nueva</label><input id="cn" type="password" autocomplete="new-password"></div>
        <div class="campo mb0"><label>Repetir la nueva</label><input id="cr" type="password" autocomplete="new-password"></div>
        <div id="err" class="bad-t" style="font-size:12.5px;min-height:18px;margin-top:8px"></div>`,
      pie: `${obligatorio ? `<button class="btn fantasma izq" data-fuera>Salir</button>` : '<button class="btn" data-cerrar>Cancelar</button>'}<button class="btn pri" data-ok>Guardar</button>`,
      alAbrir(f) {
        const fuera = el('[data-fuera]', f); if (fuera) fuera.addEventListener('click', () => salir());
        el('[data-ok]', f).addEventListener('click', async () => {
          const err = el('#err', f); err.textContent = '';
          const nueva = el('#cn', f).value;
          if (nueva !== el('#cr', f).value) { err.textContent = 'Las contraseñas nuevas no coinciden'; return; }
          try {
            await api('sesion/contrasena', { method: 'POST', cuerpo: { actual: el('#ca', f).value, nueva } });
            // El servidor cierra todas las sesiones: se vuelve a entrar con la nueva.
            const r = await api('sesion/entrar', { method: 'POST', cuerpo: { email: estado.sesion.email || el('#em') && el('#em').value, contrasena: nueva } }).catch(() => null);
            if (r) { sesionToken = r.token; try { localStorage.setItem(LLAVE_SESION, sesionToken); } catch (e) {} const est = await api('estado'); estado = est.estado; }
            cerrarModal(); toast('Contraseña cambiada', r ? 'Sesión renovada' : 'Vuelve a entrar con la nueva', 'ok');
            if (!r) return salir();
            emitir(); if (alTerminar) alTerminar();
          } catch (e) { err.textContent = e.message; }
        });
      },
    });
  }

  /* --- chasis compartido (sidebar + topbar) --- */
  function chasis({ montaje, marca, sub, acento, secciones, vistas, inicio }) {
    document.documentElement.setAttribute('data-acento', acento);
    const raiz = el(montaje);
    const navHtml = secciones.map((g) => `
      <div class="grupo">${esc(g.grupo)}</div>
      ${g.items.map((i) => `<a data-vista="${i.v}">${ic(i.ic)}<span>${esc(i.t)}</span>${i.pill ? `<b class="pill" data-pill="${i.v}"></b>` : ''}</a>`).join('')}
    `).join('');

    raiz.innerHTML = `
      <div class="velo" data-velo></div>
      <div class="shell">
        <aside class="side" data-side>
          <div class="brand"><div class="mark">${ic('escudo')}</div><div><b>${esc(marca)}</b><span>${esc(sub)}</span></div></div>
          <nav class="nav"><i class="nav-ind" data-ind></i>${navHtml}</nav>
          <div class="pie">
            <a href="./index.html">← Portal de Tesorería</a>
            <a href="./origen.html">Emisión de ORIGEN</a>
            <a href="./security.html">Tesorería Security</a>
            <a href="./utility.html">Tesorería Utility</a>
            <div style="padding:10px 12px 0" data-sello></div>
          </div>
        </aside>
        <div class="main">
          <header class="top">
            <button class="menu-btn" data-menu aria-label="Menú">${ic('lista')}</button>
            <div><h1 data-titulo></h1><div class="sub" data-subtitulo></div></div>
            <div class="der">
              <span class="tag plano" data-modo></span>
              <span class="tag plano" data-sesion></span>
              <button class="btn chico fantasma" data-cuenta title="Cambiar contraseña" style="display:none">${ic('llave')}</button>
              <button class="btn chico fantasma" data-salir title="Salir" style="display:none">${ic('salir')}</button>
              <button class="btn chico fantasma" data-tema title="Claro / oscuro">${ic('sol')}</button>
            </div>
          </header>
          <div class="contenido" data-contenido><div class="esqueleto" aria-label="Cargando"><i></i><i></i><i></i><i></i><b></b></div></div>
        </div>
      </div>`;

    const cont = el('[data-contenido]', raiz);
    const side = el('[data-side]', raiz);
    const velo = el('[data-velo]', raiz);
    el('[data-tema]', raiz).addEventListener('click', () => { tema(); render(); });
    el('[data-menu]', raiz).addEventListener('click', () => { side.classList.add('abierto'); velo.classList.add('on'); });
    el('[data-salir]', raiz).addEventListener('click', () => salir());
    el('[data-cuenta]', raiz).addEventListener('click', () => cambiarContrasena(false));
    velo.addEventListener('click', () => { side.classList.remove('abierto'); velo.classList.remove('on'); });

    let vistaActual = (location.hash || '').replace('#', '') || inicio;
    if (!vistas[vistaActual]) vistaActual = inicio;

    els('[data-vista]', raiz).forEach((a) => a.addEventListener('click', () => {
      vistaActual = a.dataset.vista; location.hash = vistaActual;
      side.classList.remove('abierto'); velo.classList.remove('on');
      render(); window.scrollTo(0, 0);
    }));
    window.addEventListener('hashchange', () => {
      const v = (location.hash || '').replace('#', '');
      if (vistas[v] && v !== vistaActual) { vistaActual = v; render(); }
    });

    function moverIndicador() {
      const ind = el('[data-ind]', raiz); const on = el('[data-vista].on', raiz);
      if (!ind || !on) return;
      ind.style.top = on.offsetTop + 8 + 'px'; ind.style.height = on.offsetHeight - 16 + 'px'; ind.classList.add('on');
    }
    function render() {
      if (!estado) return;
      const v = vistas[vistaActual] || vistas[inicio];
      els('[data-vista]', raiz).forEach((a) => a.classList.toggle('on', a.dataset.vista === vistaActual));
      moverIndicador();
      el('[data-titulo]', raiz).textContent = v.titulo;
      el('[data-subtitulo]', raiz).textContent = typeof v.sub === 'function' ? v.sub() : (v.sub || '');
      el('[data-sesion]', raiz).innerHTML = `${esc(estado.sesion.usuario)} · <span class="faint">${esc(fmt.rol(estado.sesion.rol))}</span>`;
      const m = el('[data-modo]', raiz);
      m.textContent = modo === 'api' ? (infoServidor && infoServidor.efimero ? 'servidor · archivo' : 'servidor') : 'demostración local';
      m.className = 'tag plano ' + (modo === 'api' ? 'ok' : 'warn');
      el('[data-salir]', raiz).style.display = modo === 'api' ? '' : 'none';
      el('[data-cuenta]', raiz).style.display = modo === 'api' ? '' : 'none';
      // El rol pinta la página: un auditor no ve botones de acción.
      document.documentElement.setAttribute('data-rol', estado.sesion.rol || '');
      const sello = el('[data-sello]', raiz);
      if (sello) sello.innerHTML = `<span class="ts mono">sello ${esc((estado.libro[0] || {}).hash || '—').slice(0, 12)}</span>`;
      cont.innerHTML = v.render();
      if (v.alMontar) v.alMontar(cont);
      contarCifras(cont);
      els('[data-pill]', raiz).forEach((b) => { const n = buscar.pendientes().length; b.textContent = n; b.style.display = n ? '' : 'none'; });
    }

    suscribir(render);
    const trasEntrar = () => { render(); if (estado.sesion.debeCambiarContrasena) cambiarContrasena(true); };
    arrancar().then((r) => {
      if (r.modo === 'api' && !r.sesion) pantallaEntrada(trasEntrar);
      else trasEntrar();
    }).catch((e) => {
      cont.innerHTML = `<div class="aviso bad">${ic('alerta')}<div><b>No se pudo cargar el estado</b><span class="txt">${esc(e.message)}</span></div></div>`;
    });
    return { render, ir: (v) => { vistaActual = v; location.hash = v; render(); } };
  }

  /** Las cifras grandes llegan a su valor en vez de aparecer. Respeta reduced-motion. */
  function contarCifras(raiz) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    els('.kpi .val, .medidor .centro b', raiz).forEach((elv) => {
      const nodo = Array.from(elv.childNodes).find((n) => n.nodeType === 3 && /\d/.test(n.textContent));
      if (!nodo) return;
      const txt = nodo.textContent; const m = txt.match(/^(\D*)([\d.,]+)(.*)$/); if (!m) return;
      const limpio = m[2].replace(/,/g, ''); const fin = parseFloat(limpio); if (!Number.isFinite(fin)) return;
      const dec = (limpio.split('.')[1] || '').length; const conComas = m[2].includes(',');
      const t0 = performance.now(), dur = 750;
      const paso = (t) => {
        const k = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - k, 3); const v = fin * e;
        nodo.textContent = m[1] + (conComas ? Number(v.toFixed(dec)).toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec)) + m[3];
        if (k < 1) requestAnimationFrame(paso); else nodo.textContent = txt;
      };
      requestAnimationFrame(paso);
    });
  }

  function alClic(raiz, attr, fn) {
    raiz.addEventListener('click', (e) => {
      const t = e.target.closest('[' + attr + ']');
      if (t && raiz.contains(t)) fn(t.getAttribute(attr), t, e);
    });
  }

  function exportarJSON(nombre, datos) {
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  global.T = {
    get estado() { return estado; },
    get modo() { return modo; },
    get servidor() { return infoServidor; },
    R,
    cargar, arrancar, ejecutar, correr, reiniciar, suscribir, api, entrar, salir, cambiarContrasena,
    // reglas ligadas al estado
    respaldo: () => R.respaldo(estado),
    puedeEmitir: (m) => R.puedeEmitir(estado, m),
    saludSecurity: (t) => R.saludSecurity(t),
    saludUtility: (t) => R.saludUtility(t),
    valorAdmisible: (r) => R.valorAdmisible(r),
    reservasAdmisibles: () => R.reservasAdmisibles(estado),
    verificarLibro: () => R.verificarLibro(estado),
    avisos: () => R.avisos(estado),
    buscar, puede, etiquetaAccion: R.etiquetaAccion, ACCIONES: R.ACCIONES, CAUSAS: R.CAUSAS, TIPOS_SEC: R.TIPOS_SEC,
    hash: R.hashFnv, id: R.idAzar,
    // ui
    fmt, el, els, esc, ic, ICONOS, toast, modal, cerrarModal, confirmar, pedirMotivo, tema, medidor, chasis, alClic, exportarJSON, contarCifras,
  };
})(window);
