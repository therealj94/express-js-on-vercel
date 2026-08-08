/* Veta Wallet · web
 *
 * Habla con el mismo backend que la aplicación del teléfono, con las mismas
 * rutas y el mismo contrato. No hay una "versión web" de los datos: es la misma
 * cuenta, el mismo saldo y la misma identidad, vistos desde otra pantalla.
 */

const VETA = (() => {
  'use strict';

  const API = 'https://vetawallet-1a2e38ac52b1.herokuapp.com';
  const CHAIN = '8532';
  const LLAVE = 'veta.sesion';

  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let sesion = null;          // { token, correo, nombre, direccion }
  let cartera = null;         // los quince tokens, tal como los devuelve CADENA
  let errCartera = null;      // por que no se pudieron leer
  let identidad = null;       // estado de Genesis ID
  let movimientos = [];
  let tarjeta = null;         // { estado, last4, saldo… } o { falta: true }
  let movsTarjeta = [];
  let transferencias = [];   // el historial de la cadena
  let tokenAbierto = null;    // simbolo del token cuya ficha se esta mirando
  let ocultos = false;        // el ojo: esconde todas las cifras de una vez
  let vistaActual = 'billetera';
  let modo = 'entrar';

  /* El saldo total solo suma lo que tiene precio de mercado. Un feed caido no
     puede aparecer como si el activo valiera cero: eso convierte una falla de
     lectura en una perdida aparente, y es la peor lectura posible en algo que
     guarda dinero. Lo que no tiene precio se cuenta aparte y se avisa. */
  const conPrecio = () => (cartera || []).filter(x => x.precio != null);
  const total = () => conPrecio().reduce((s, x) => s + x.cant * x.precio, 0);
  const haySinPrecio = () => (cartera || []).some(x => x.cant > 0 && x.precio == null);

  /* Variacion del dia, ponderada por cuanto pesa cada activo en la cartera:
     un 5 % en algo donde tenes diez dolares no mueve el patrimonio igual que
     un 5 % donde tenes mil. */
  function delDia() {
    const l = conPrecio().filter(x => x.chg != null && x.cant * x.precio > 0);
    const base = l.reduce((s, x) => s + x.cant * x.precio, 0);
    if (!base) return null;
    const pct = l.reduce((s, x) => s + x.chg * (x.cant * x.precio), 0) / base;
    return { pct, usd: total() * (pct / 100) };
  }

  // ── el servidor ───────────────────────────────────────────────────────────

  async function pedir(ruta, { metodo = 'GET', cuerpo, espera = 25000, conSesion = true } = {}) {
    const ctl = new AbortController();
    const reloj = setTimeout(() => ctl.abort(), espera);
    try {
      const r = await fetch(API + ruta, {
        method: metodo,
        headers: {
          'Content-Type': 'application/json',
          ...(conSesion && sesion?.token ? { Authorization: 'Bearer ' + sesion.token } : {}),
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal: ctl.signal,
      });
      const texto = await r.text();
      let datos = null;
      try { datos = texto ? JSON.parse(texto) : null; } catch { datos = { message: texto }; }
      if (!r.ok) {
        const e = new Error(datos?.message || datos?.error || `El servidor respondió ${r.status}`);
        e.estado = r.status;
        throw e;
      }
      return datos;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error(t('err.tarda'));
      // Un fallo de red y un error del servidor se sienten igual para quien
      // mira la pantalla, pero se arreglan de forma distinta: conviene decir cuál es.
      if (e instanceof TypeError) throw new Error(t('err.red'));
      throw e;
    } finally { clearTimeout(reloj); }
  }

  /** El token trae dentro la dirección de la billetera y el estado de verificación. */
  function abrirToken(token) {
    try {
      const p = token.split('.')[1];
      return JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')));
    } catch { return {}; }
  }

  function guardar() {
    try { localStorage.setItem(LLAVE, JSON.stringify(sesion)); } catch {}
  }
  function recuperar() {
    try {
      const s = JSON.parse(localStorage.getItem(LLAVE) || 'null');
      // Un token vencido deja la sesión inservible: mejor pedir la contraseña
      // que enseñar una pantalla que falla en cada petición.
      if (s?.token) {
        const c = abrirToken(s.token);
        if (c.exp && c.exp * 1000 < Date.now()) return null;
      }
      return s;
    } catch { return null; }
  }

  // ── formato ───────────────────────────────────────────────────────────────

  const nfOro = new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  /* El dinero se escribe igual que en el telefono: signo pegado al numero.
     Con Intl en es-HN, `style:'currency'` devuelve "USD 16,763.83" — correcto
     para un banco y horrible en una lista de quince monedas, donde esas tres
     letras se repiten treinta veces y no aportan nada. */
  const nfUsd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const oro = n => nfOro.format(Number(n) || 0);
  const usd = n => '$' + nfUsd.format(Number(n) || 0);
  const cortaDir = d => !d ? '' : d.length > 16 ? `${d.slice(0, 8)}…${d.slice(-6)}` : d;
  const cuando = iso => {
    const t = new Date(iso);
    if (isNaN(t)) return '';
    const min = Math.round((Date.now() - t) / 60000);
    if (min < 1) return 'recién';
    if (min < 60) return `hace ${min} min`;
    if (min < 1440) return `hace ${Math.round(min / 60)} h`;
    return t.toLocaleDateString('es-HN', { day: 'numeric', month: 'short' });
  };

  let relojTostada;
  function avisar(texto) {
    const t = $('#tostada');
    t.textContent = texto;
    t.classList.add('ver');
    clearTimeout(relojTostada);
    relojTostada = setTimeout(() => t.classList.remove('ver'), 3200);
  }

  // ── navegación entre las tres pantallas grandes ───────────────────────────

  function ir(destino, cual) {
    for (const id of ['portada', 'acceso', 'app']) $('#' + id).classList.toggle('oculto', id !== (destino === 'bienvenida' ? 'portada' : destino));
    $('#techo').classList.toggle('oculto', destino === 'app');
    if (destino === 'acceso') { pestana(cual || 'entrar'); setTimeout(() => $('#i-correo').focus(), 60); }
    if (destino === 'app') vista(vistaActual);
    window.scrollTo(0, 0);
  }

  function pestana(cual) {
    modo = cual;
    $('#tab-entrar').setAttribute('aria-selected', String(cual === 'entrar'));
    $('#tab-crear').setAttribute('aria-selected', String(cual === 'crear'));
    $('#campo-nombre').classList.toggle('oculto', cual !== 'crear');
    $('#fuerza-caja').classList.toggle('oculto', cual !== 'crear');
    $('#acc-legal').classList.toggle('oculto', cual !== 'crear');
    $('#btn-acceso').textContent = cual === 'crear' ? t('acc.btnCrear') : t('acc.btnEntrar');
    $('#i-clave').setAttribute('autocomplete', cual === 'crear' ? 'new-password' : 'current-password');
    $('#acc-aviso').classList.add('oculto');
  }


  /* Cambiar de idioma en caliente. Las vistas se generan enteras cada vez que
     se navega, asi que basta con repintar los textos fijos y volver a dibujar
     la vista actual: no queda nada a medio traducir. */
  function idioma(cual) {
    if (cual !== 'es' && cual !== 'en') return;
    idiomaActual = cual;
    try { localStorage.setItem('veta.idioma', cual); } catch {}
    pintarIdioma();
    pestana(modo);
    if (!$('#app').classList.contains('oculto')) vista(vistaActual);
  }

  function ojo() {
    const i = $('#i-clave'), b = $('#btn-ojo');
    const ver = i.type === 'password';
    i.type = ver ? 'text' : 'password';
    b.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
  }

  // Fuerza de la contraseña. No puntúa por "tener un símbolo": puntúa por largo
  // y variedad, que es lo que de verdad cuesta adivinar.
  function fuerza(c) {
    if (!c) return { n: 0, txt: '', color: 'transparent' };
    let n = 0;
    if (c.length >= 8) n++;
    if (c.length >= 12) n++;
    if (/[a-z]/.test(c) && /[A-Z]/.test(c)) n++;
    if (/\d/.test(c)) n++;
    if (/[^\w\s]/.test(c)) n++;
    const k = Math.min(4, n);
    return [
      { n: 0, txt: t('pw.0'), color: '#F0776B' },
      { n: 1, txt: t('pw.1'), color: '#F0776B' },
      { n: 2, txt: t('pw.2'), color: '#E0B15C' },
      { n: 3, txt: t('pw.3'), color: '#9FD8A8' },
      { n: 4, txt: t('pw.4'), color: '#3ED9A0' },
    ][k];
  }

  function pintarFuerza() {
    const f = fuerza($('#i-clave').value);
    $('#fuerza-barra').style.width = (f.n / 4 * 100) + '%';
    $('#fuerza-barra').style.background = f.color;
    $('#fuerza-lbl').textContent = f.txt;
    $('#fuerza-lbl').style.color = f.color;
  }

  function avisoAcceso(texto, bien) {
    const a = $('#acc-aviso');
    a.textContent = texto;
    a.className = 'aviso ' + (bien ? 'aviso-ok' : 'aviso-mal');
    a.classList.toggle('oculto', !texto);
  }

  async function enviarAcceso(ev) {
    ev.preventDefault();
    const b = $('#btn-acceso');
    const correo = $('#i-correo').value.trim();
    const clave = $('#i-clave').value;
    const nombre = $('#i-nombre').value.trim();
    if (!correo || !clave) return avisoAcceso(t('err.completa'));
    if (modo === 'crear' && clave.length < 8) return avisoAcceso(t('err.corta'));
    if (modo === 'crear' && !nombre) return avisoAcceso(t('err.nombre'));

    avisoAcceso('');
    b.disabled = true;
    const antes = b.textContent;
    b.innerHTML = '<span class="girando"></span> ' + (modo === 'crear' ? t('acc.creando') : t('acc.entrando'));
    try {
      if (modo === 'crear') {
        await pedir('/auth/register', { metodo: 'POST', cuerpo: { name: nombre, email: correo, password: clave }, conSesion: false });
      }
      const d = await pedir('/auth/login', { metodo: 'POST', cuerpo: { email: correo, password: clave }, conSesion: false });
      const token = d?.token || d?.accessToken || d?.access_token || d?.data?.token;
      if (!token) throw new Error(t('err.sesion'));
      const c = abrirToken(token);
      sesion = {
        token,
        correo: d?.user?.email || correo,
        nombre: d?.user?.name || d?.user?.fullName || nombre || (d?.user?.email || correo).split('@')[0],
        direccion: c.address || d?.user?.address || d?.user?.wallet || null,
      };
      guardar();
      ir('app');
      cargarTodo();
      avisar(modo === 'crear' ? `${t('ok.creada')}, ${sesion.nombre.split(' ')[0]}` : `${t('ok.hola')}, ${sesion.nombre.split(' ')[0]}`);
    } catch (e) {
      // El servidor devuelve "credenciales inválidas" para un correo que no
      // existe y para una contraseña equivocada. Decirlo tal cual deja a la
      // persona sin saber cuál de las dos cosas arreglar.
      const m = /credencial|invalid|incorrect|unauthor/i.test(e.message)
        ? t('err.cred')
        : /exist|registrad|duplicad/i.test(e.message)
          ? t('err.existe')
          : e.message;
      avisoAcceso(m);
      b.disabled = false;
      b.textContent = antes;
    }
  }

  function salir() {
    sesion = null; cartera = null; errCartera = null; identidad = null;
    movimientos = []; transferencias = []; tarjeta = null; movsTarjeta = []; ocultos = false;
    try { localStorage.removeItem(LLAVE); } catch {}
    ir('bienvenida');
  }

  // ── traer los datos ───────────────────────────────────────────────────────

  async function cargarTodo() {
    await Promise.allSettled([cargarCartera(), cargarIdentidad(), cargarMovimientos()]);
    if (!$('#app').classList.contains('oculto')) vista(vistaActual);
  }

  /* La tarjeta se pide aparte y solo cuando se entra a su pestaña: emitir y
     consultar pasa por el emisor y es lento, asi que no tiene por que retrasar
     la primera pintada de la billetera. Un 404 no es un fallo, es la respuesta
     correcta de "esta persona todavia no tiene tarjeta". */
  async function cargarTarjeta() {
    try {
      tarjeta = await pedir('/cards/my-card');
    } catch (e) {
      tarjeta = e.estado === 404 ? { falta: true } : { error: e.message };
      return;
    }
    try {
      const d = await pedir('/cards/transactions?limit=20');
      movsTarjeta = Array.isArray(d) ? d : (d?.items || d?.transactions || d?.data || []);
    } catch { movsTarjeta = []; }
  }

  /* Los saldos se leen de la cadena, token por token, igual que en el telefono.
     Antes esta pantalla pedia /wallet/origen-balance: un solo numero, una sola
     moneda, y un precio de respaldo de 2.35 escrito en el codigo cuando el
     servidor no mandaba ninguno. Ese respaldo entraba al patrimonio sin marca
     alguna, asi que alguien podia estar mirando un valor inventado creyendo que
     era el de mercado. Ya no existe: sin precio real se pinta un guion. */
  async function cargarCartera() {
    if (!sesion?.direccion) { errCartera = t('cta.sinDir'); return; }

    /* El precio de ONDK no esta en ningun mercado publico: lo da el backend. Va
       por su lado a proposito. Antes se esperaba a esa llamada ANTES de leer
       un solo saldo, asi que si el servidor tardaba, la billetera entera se
       quedaba en blanco por el precio de una sola moneda. Ahora los quince
       saldos salen en cuanto los devuelve la cadena, y ONDK se completa cuando
       llega — o se queda con su guion, que ya es un estado previsto. */
    const ondk = pedir(`/chains/getChainsForId/${CHAIN}`, { espera: 12000 })
      .then(c => {
        const d = Array.isArray(c) ? c[0] : (c?.chain || c?.data || c);
        // La misma respuesta trae el historial de la red. Se aprovecha: pedirlo
        // aparte seria una segunda llamada por el mismo dato.
        if (Array.isArray(d?.allTransfers)) transferencias = d.allTransfers;
        return Number(d?.price) || null;
      })
      .catch(() => null);

    try {
      cartera = await CADENA.portafolio(sesion.direccion, null);
      errCartera = null;
    } catch (e) {
      errCartera = e.message;
      return;
    }

    const p = await ondk;
    const x = p > 0 && cartera.find(m => m.s === 'ONDK');
    if (x && x.precio == null) {
      x.precio = p;
      if (!$('#app').classList.contains('oculto')) vista(vistaActual);
    }
  }

  async function cargarIdentidad() {
    try { identidad = await pedir('/genesis/status'); }
    catch (e) { identidad = e.estado === 404 ? { estado: 'sin-iniciar' } : { error: e.message }; }
  }

  async function cargarMovimientos() {
    try {
      const d = await pedir('/wallet/deposits?limit=25');
      movimientos = Array.isArray(d) ? d : (d?.items || d?.deposits || d?.data || []);
    } catch { movimientos = []; }
  }

  /* Lo que se enseña en Actividad es todo el movimiento de dinero: los
     depositos que registra el backend y las transferencias que quedaron en la
     cadena. Antes solo salian los depositos, asi que un envio recien hecho no
     aparecia por ningun lado — y no hay nada que uno quiera comprobar mas que
     eso, justo despues de mandarlo. */
  function todoMovimiento() {
    const cuando_ = m => new Date(m.createdAt || m.date || m.timestamp || 0).getTime() || 0;
    const vistos = new Set();
    return [...movimientos, ...transferencias]
      .filter(m => {
        const llave = m.hash || m.txHash || `${m.from}-${m.to}-${m.amount}-${cuando_(m)}`;
        if (vistos.has(llave)) return false;
        vistos.add(llave);
        return true;
      })
      .sort((a, b) => cuando_(b) - cuando_(a));
  }

  // ── las vistas ────────────────────────────────────────────────────────────

  /* Las cinco pestañas son las mismas del telefono — billetera, tarjeta,
     cambiar, actividad, ajustes — y por el mismo motivo: quien usa la app en el
     bolsillo no tiene que volver a aprenderse donde esta cada cosa al abrirla en
     una pantalla grande. Enviar, recibir, comprar, depositar, la ficha de un
     token y Genesis ID no son pestañas: se entra a ellas desde algun lado y se
     vuelve, igual que alla. */
  const VISTAS = {
    billetera, tarjeta: vTarjeta, cambiar, actividad, ajustes,
    enviar, recibir, comprar, deposito, token: vToken, identidad: vIdentidad,
  };
  const PESTANAS = ['billetera', 'tarjeta', 'cambiar', 'actividad', 'ajustes'];
  // A que pestaña se le enciende la luz cuando estas en una vista que no es una.
  const DENTRO_DE = {
    enviar: 'billetera', recibir: 'billetera', comprar: 'billetera',
    deposito: 'billetera', token: 'billetera', identidad: 'ajustes',
  };

  function vista(cual, dato) {
    if (!VISTAS[cual]) cual = 'billetera';
    vistaActual = cual;
    if (cual === 'token' && dato) tokenAbierto = dato;
    const encendida = PESTANAS.includes(cual) ? cual : DENTRO_DE[cual];
    document.querySelectorAll('.nav[data-vista]').forEach(b =>
      b.dataset.vista === encendida ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
    const l = $('#lienzo');
    l.innerHTML = VISTAS[cual]();
    l.querySelectorAll('[data-al-cargar]').forEach(el => window[el.dataset.alCargar]?.(el));
    if (cual === 'recibir' || cual === 'deposito') pintarQr();
    if (cual === 'enviar') $('#env-monto')?.focus();
    if (cual === 'cambiar') cambioMonto();
    if (cual === 'tarjeta' && !tarjeta) cargarTarjeta().then(() => { if (vistaActual === 'tarjeta') vista('tarjeta'); });
    window.scrollTo(0, 0);
  }

  const ICO = {
    enviar: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    recibir: '<path d="M12 5v14M5 12l7 7 7-7"/>',
    comprar: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    cambiar: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    id: '<path d="M12 3l8 3.5v5c0 5-3.4 8.6-8 9.5-4.6-.9-8-4.5-8-9.5v-5z"/><path d="M9 12l2 2 4-4"/>',
    ojo: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>',
    ojoNo: '<path d="M4 4l16 16"/><path d="M9.9 5.2A9.6 9.6 0 0 1 12 5c6.4 0 10 6 10 6a17 17 0 0 1-3.3 3.9M6.3 7.4A16.7 16.7 0 0 0 2 11s3.6 6 10 6a9.7 9.7 0 0 0 3.4-.6"/>',
    volver: '<path d="M15 6l-6 6 6 6"/>',
    atras: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    tarjeta: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20M6 15h4"/>',
    ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
    copiar: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    nieve: '<path d="M12 2v20M4 6l16 12M20 6L4 18"/>',
    tienda: '<path d="M4 9h16v11H4zM3 9l1.5-5h15L21 9"/>',
    llave: '<circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M18 4l2 2M15 7l2 2"/>',
    persona: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
    globo: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
    obra: '<path d="M3 21h18M5 21V10l7-5 7 5v11"/><path d="M10 21v-6h4v6"/>',
  };

  // Con el ojo cerrado no se tapa solo el total: se tapa cada cifra de la
  // pantalla. Esconder el patrimonio y dejar los saldos de cada moneda a la
  // vista no esconde nada — quien mira por encima del hombro los suma igual.
  const tapa = txt => ocultos ? '••••' : txt;

  function bloqueSaldo() {
    if (errCartera && !cartera) return `
      <div class="saldo vidrio">
        <div class="saldo-lbl">${t('ini.patrimonio')}</div>
        <div class="saldo-cifra"><b>—</b></div>
        <div class="saldo-fiat" style="color:var(--coral)">${t('ini.errSaldos')} ${esc(errCartera)}</div>
        <div style="margin-top:16px"><button class="btn btn-linea btn-sm" onclick="VETA.reintentar()">${t('saldo.re')}</button></div>
      </div>`;
    const cargando = !cartera;
    const dia = cargando ? null : delDia();
    const sube = (dia?.pct ?? 0) >= 0;
    return `
    <div class="saldo vidrio">
      <div class="saldo-lbl">${t('ini.patrimonio')}</div>
      <button class="saldo-ojo" onclick="VETA.tapar()"
              aria-label="${ocultos ? t('ini.mostrar') : t('ini.ocultar')}">
        <div class="saldo-cifra">
          <b class="${cargando ? 'esqueleto' : ''}">${cargando ? '$0.00' : tapa(usd(total()))}</b>
        </div>
        <svg viewBox="0 0 24 24" class="ojo-ic">${ocultos ? ICO.ojoNo : ICO.ojo}</svg>
      </button>
      <div class="saldo-fiat">
        ${cargando ? `<span class="esqueleto">${t('ini.cargando')}</span>`
          : dia ? `<span class="${sube ? 'sube' : 'baja'}">${sube ? '+' : '−'}${tapa(usd(Math.abs(dia.usd)))}</span>
                   <span class="pastilla ${sube ? 'sube-p' : 'baja-p'}">${sube ? '+' : ''}${dia.pct.toFixed(2)}%</span>
                   <span style="color:var(--humo);margin-left:8px">${t('ini.hoy')}</span>`
            : `<span style="color:var(--humo)">${t('ini.envivo')}</span>`}
      </div>
      <div class="acciones">
        <button class="acc-btn" onclick="VETA.vista('enviar')"><svg viewBox="0 0 24 24">${ICO.enviar}</svg>${t('a.enviar')}</button>
        <button class="acc-btn" onclick="VETA.vista('recibir')"><svg viewBox="0 0 24 24">${ICO.recibir}</svg>${t('a.recibir')}</button>
        <button class="acc-btn" onclick="VETA.vista('comprar')"><svg viewBox="0 0 24 24">${ICO.comprar}</svg>${t('a.comprar')}</button>
        <button class="acc-btn" onclick="VETA.vista('cambiar')"><svg viewBox="0 0 24 24">${ICO.cambiar}</svg>${t('a.cambiar')}</button>
      </div>
    </div>`;
  }

  // El disco de cada moneda: logo propio si lo tiene, glifo sobre su degradado
  // si no. Los dos ocupan el mismo hueco para que la lista no baile.
  function disco(x, grande) {
    const lado = grande ? 'disco disco-g' : 'disco';
    if (x.img) return `<span class="${lado}"><img src="${x.img}" alt="" loading="lazy"></span>`;
    const [a, b] = x.grad || ['#1E8C74', '#0A463F'];
    return `<span class="${lado}" style="background:linear-gradient(140deg,${a},${b});color:${x.fg || '#EAD79C'}">${esc(x.glifo || x.s.slice(0, 2))}</span>`;
  }

  function listaTokens() {
    if (!cartera) return [0, 1, 2, 3, 4].map(() => `
      <div class="moneda">
        <span class="disco esqueleto"></span>
        <div class="m-txt"><b class="esqueleto">Cargando</b><small class="esqueleto">0.00</small></div>
        <div class="m-val"><b class="esqueleto">$0.00</b><small class="esqueleto">0</small></div>
      </div>`).join('');

    return cartera.map(x => {
      const valor = x.precio != null ? usd(x.cant * x.precio) : '—';
      const chg = x.chg != null
        ? `<span class="${x.chg < 0 ? 'baja' : 'sube'}">${x.chg > 0 ? '+' : ''}${x.chg.toFixed(2)}%</span>` : '';
      return `
      <button class="moneda" onclick="VETA.vista('token','${x.s}')"
              aria-label="${esc(x.n)}, ${esc(oro(x.cant))} ${x.s}">
        ${disco(x)}
        <div class="m-txt">
          <b>${esc(x.n)}</b>
          <small>${x.precio != null ? esc(usd(x.precio)) : '—'} ${chg}</small>
        </div>
        <div class="m-val">
          <b>${tapa(valor)}</b>
          <small>${tapa(oro(x.cant))} ${x.s}</small>
        </div>
      </button>`;
    }).join('');
  }

  function tarjetaIdentidad(compacta) {
    const e = (identidad?.estado || identidad?.status || (identidad?.verified ? 'verificada' : 'sin-iniciar') || '').toLowerCase();
    const mapa = {
      verificada: ['e-ok', t('gid.ok'), t('gid.okP')],
      verified: ['e-ok', t('gid.ok'), t('gid.okP')],
      'en-revision': ['e-rev', t('gid.rev'), t('gid.revP')],
      rechazada: ['e-mal', t('gid.mal'), t('gid.malP')],
      suspendida: ['e-mal', t('gid.sus'), t('gid.susP')],
    };
    const [clase, titulo, texto] = mapa[e] || ['e-no', t('gid.no'), t('gid.noP')];
    const listo = clase === 'e-ok';
    return `
    <div class="bloque vidrio">
      <div class="gid">
        <div class="gid-ic"><svg viewBox="0 0 24 24">${ICO.id}</svg></div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <h3>Genesis ID</h3><span class="estado ${clase}">${titulo}</span>
          </div>
          <p class="pie" style="margin-top:8px">${texto}</p>
          ${identidad?.gid ? `<p class="pie mono" style="margin-top:8px;color:var(--oroLt)">${esc(identidad.gid)}</p>` : ''}
          ${listo || compacta ? '' : `<div style="margin-top:16px"><a class="btn btn-oro btn-sm" href="https://genesis-id.onrender.com" target="_blank" rel="noopener">${t('gid.btn')}</a></div>`}
        </div>
      </div>
    </div>`;
  }

  function listaMovimientos(limite) {
    const todos = todoMovimiento();
    const l = todos.slice(0, limite || todos.length);
    if (!l.length) return `
      <div class="vacio">
        <b>${t('ini.vacioT')}</b>
        ${t('ini.vacioP')}
      </div>`;
    return l.map(m => {
      const mia = (sesion?.direccion || '').toLowerCase();
      const entra = m.to && mia
        ? String(m.to).toLowerCase() === mia
        : (m.direction || m.type || '').toLowerCase().includes('in') || (Number(m.amount) > 0 && !m.to);
      const monto = Math.abs(Number(m.amount ?? m.value ?? 0));
      return `
      <div class="hilera">
        <div class="ic"><svg viewBox="0 0 24 24">${entra ? ICO.recibir : ICO.enviar}</svg></div>
        <div class="txt">
          <b>${entra ? t('act.entra') : t('act.sale')}</b>
          <small class="mono">${esc(cortaDir(m.from || m.to || m.hash || ''))} · ${esc(cuando(m.createdAt || m.date || m.timestamp))}</small>
        </div>
        <div class="val ${entra ? 'entra' : 'sale'}">${entra ? '+' : '−'}${oro(monto)}</div>
      </div>`;
    }).join('');
  }

  function billetera() {
    const nombre = (sesion?.nombre || '').split(' ')[0];
    return `
    <div class="cab">
      <div>
        <h2>${t('ini.hola')}, ${esc(nombre)}</h2>
        <div class="sub">${esc(sesion?.correo || '')}</div>
      </div>
      <button class="btn btn-linea btn-sm" onclick="VETA.reintentar()">${t('ini.act')}</button>
    </div>
    ${bloqueSaldo()}
    ${identidad && !esVerificada() ? tarjetaIdentidad(true) : ''}
    <div class="bloque vidrio">
      <div class="bloque-cab">
        <h3>${t('ini.activos')}</h3>
        <button class="btn btn-linea btn-sm" onclick="VETA.vista('actividad')">${t('ini.verAct')}</button>
      </div>
      <div class="monedas">${listaTokens()}</div>
      ${cartera && haySinPrecio() ? `<p class="pie sin-precio">${t('ini.sinPrecio')}</p>` : ''}
    </div>`;
  }

  // ── la ficha de una moneda ────────────────────────────────────────────────

  function vToken() {
    const volver = `
      <button class="volver" onclick="VETA.vista('billetera')">
        <svg viewBox="0 0 24 24">${ICO.atras}</svg>${t('tok.volver')}
      </button>`;
    /* Lo que esta ficha cuenta — que es la moneda, con que esta respaldada, en
       que contrato vive — no depende de la red: ya se sabe. Solo el saldo y el
       precio hay que ir a buscarlos. Asi que la pagina se dibuja entera desde el
       primer momento y lo unico que llega despues son las dos cifras, en vez de
       dejar la pantalla en blanco esperando a la cadena. */
    // Sin moneda elegida — se entro por una direccion suelta — se abre ORIGEN,
    // que es la moneda de la casa.
    const sim = tokenAbierto || 'ORIGEN';
    const reg = CADENA.TOKENS.find(m => m.s === sim);
    if (!reg) return volver + `
      <div class="bloque vidrio"><p class="pie">${t('ini.errSaldos')}</p></div>`;
    const vivo = (cartera || []).find(m => m.s === sim);
    const x = vivo || { s: sim, ...CADENA.META[sim], contrato: reg.contrato || null,
                        nativo: !!reg.nativo, cant: null, precio: null, chg: null };
    const f = CADENA.ficha(x.s, idiomaActivo()) || { d: '', t: '', r: '' };
    const filas = [
      [t('tok.tipo'), f.t],
      [t('tok.resp'), f.r],
      [t('tok.red'), 'Orden Global · 8532'],
      [t('tok.contrato'), x.nativo ? t('tok.nativo') : cortaDir(x.contrato)],
    ];
    return volver + `
    <div class="bloque vidrio">
      <div class="ficha-cab">
        ${disco(x, true)}
        <div>
          <h2>${esc(x.n)}</h2>
          ${x.n === x.s ? '' : `<div class="sub mono">${x.s}</div>`}
        </div>
      </div>
      <div class="ficha-cifra">
        <div>
          <span class="et">${t('tok.tuSaldo')}</span>
          <b>${x.cant == null ? '<span class="esqueleto">0,00</span>' : tapa(oro(x.cant))} <em>${x.s}</em></b>
        </div>
        <div>
          <span class="et">${t('tok.valor')}</span>
          <b>${x.precio != null && x.cant != null ? tapa(usd(x.cant * x.precio)) : '—'}</b>
        </div>
      </div>
      ${x.precio != null ? `
        <div class="ficha-precio">
          <span>${t('tok.precio')} <b>${esc(usd(x.precio))}</b></span>
          ${x.chg != null ? `<span class="pastilla ${x.chg < 0 ? 'baja-p' : 'sube-p'}">${x.chg > 0 ? '+' : ''}${x.chg.toFixed(2)}% · ${t('tok.cambio24')}</span>` : ''}
        </div>`
      : `<p class="pie sin-precio">${t('tok.sinPrecio')}</p>`}
      <p class="ficha-desc">${esc(f.d)}</p>
      <dl class="datos">
        ${filas.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="${k === t('tok.contrato') && !x.nativo ? 'mono' : ''}">${esc(v || '—')}</dd></div>`).join('')}
      </dl>
      ${x.nativo ? '' : `<button class="btn btn-linea btn-sm" onclick="VETA.copiarContrato('${x.contrato}')">
        <svg viewBox="0 0 24 24" class="btn-ic">${ICO.copiar}</svg>${t('tok.copiarC')}</button>`}
    </div>`;
  }

  // ORIGEN es lo unico que mueve este endpoint: transfiere la moneda nativa.
  const origen = () => (cartera || []).find(x => x.s === 'ORIGEN') || null;

  function enviar() {
    const disp = origen()?.cant ?? 0;
    return `
    <div class="cab"><div><h2>${t('env.t')}</h2><div class="sub">${t('env.tenes')} ${oro(disp)} ${t('env.disp')}</div></div></div>
    <div class="bloque vidrio">
      <form onsubmit="return VETA.mandar(event)">
        <div class="campo">
          <label for="env-dir">${t('env.dir')}</label>
          <input id="env-dir" class="mono" placeholder="0x…" autocomplete="off" spellcheck="false" required>
        </div>
        <div class="campo">
          <label for="env-monto">${t('env.cant')}</label>
          <input id="env-monto" type="text" inputmode="decimal" placeholder="0,00" required>
        </div>
        <div class="campo">
          <label for="env-clave">${t('env.clave')}</label>
          <input id="env-clave" type="password" autocomplete="current-password" placeholder="••••••••" required>
        </div>
        <div id="env-aviso" class="aviso oculto" role="alert"></div>
        <button class="btn btn-oro btn-full" id="env-btn" type="submit">${t('env.revisar')}</button>
      </form>
      <p class="pie" style="margin-top:16px">${t('env.nota')}</p>
    </div>`;
  }

  /* Enviar dinero pide dos confirmaciones distintas: primero se enseña lo que
     va a pasar, y solo después se manda. Un solo botón convierte un dedo torpe
     en una transferencia que no vuelve. */
  let enviando = false, pendiente = null;
  async function mandar(ev) {
    ev.preventDefault();
    const dir = $('#env-dir').value.trim();
    const monto = Number(String($('#env-monto').value).replace(',', '.'));
    const clave = $('#env-clave').value;
    const a = $('#env-aviso'), b = $('#env-btn');
    const decir = t => { a.textContent = t; a.className = 'aviso aviso-mal'; a.classList.remove('oculto'); };

    if (!/^0x[a-fA-F0-9]{40}$/.test(dir)) return decir(t('env.eDir'));
    if (!(monto > 0)) return decir(t('env.eCant'));
    const disp = origen()?.cant;
    if (disp != null && monto > disp) return decir(`${t('env.eAlcanza')} ${oro(disp)} ORIGEN.`);
    if (!clave) return decir(t('env.eClave'));

    if (!pendiente || pendiente.dir !== dir || pendiente.monto !== monto) {
      pendiente = { dir, monto, sello: 'web-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) };
      a.className = 'aviso aviso-ok';
      // Sin precio real no se muestra un equivalente en dolares: mas vale no
      // decir nada que decir un numero que nadie puede sostener.
      const pu = origen()?.precio;
      const enUsd = pu != null ? ` (${esc(usd(monto * pu))})` : '';
      a.innerHTML = `${t('env.vas')} <b>${oro(monto)} ORIGEN</b>${enUsd} ${t('env.a')} <span class="mono">${esc(cortaDir(dir))}</span>. ${t('env.toca')}`;
      a.classList.remove('oculto');
      b.textContent = t('env.confirmar');
      return;
    }

    if (enviando) return;      // el candado: un doble toque no manda dos veces
    enviando = true;
    b.disabled = true;
    b.innerHTML = '<span class="girando"></span> ' + t('env.enviando');
    try {
      const r = await pedir('/transaction/send', {
        metodo: 'POST', espera: 90000,
        cuerpo: {
          chain_id: CHAIN, recipientAddress: dir, amount: String(monto),
          password: clave,
          // El mismo envío reintentado lleva el mismo sello: el backend
          // descarta el segundo en vez de transferir dos veces.
          idempotencyKey: pendiente.sello,
        },
      });
      const hash = r?.hash || r?.transactionHash || r?.txId || null;
      pendiente = null;
      a.className = 'aviso aviso-ok';
      a.innerHTML = `${t('env.hecho')} ${oro(monto)} ORIGEN.${hash ? ` <span class="mono">${esc(cortaDir(hash))}</span>` : ''}`;
      $('#env-dir').value = ''; $('#env-monto').value = ''; $('#env-clave').value = '';
      b.textContent = t('env.revisar');
      avisar(t('env.avHecho'));
      cargarCartera().then(() => { if (vistaActual === 'enviar') $('.cab .sub').textContent = `${t('env.tenes')} ${oro(origen()?.cant ?? 0)} ${t('env.disp')}`; });
      cargarMovimientos();
    } catch (e) {
      // No se ofrece reintentar: la transferencia pudo haber salido y volver a
      // pulsar sería mandarla de nuevo. Se pide comprobar antes.
      decir(/contrase|password|credential/i.test(e.message)
        ? t('env.eMalClave')
        : `${e.message} ${t('env.eDuda')}`);
      b.textContent = t('env.revisar');
      pendiente = null;
    } finally { enviando = false; b.disabled = false; }
  }

  function recibir() {
    const dir = sesion?.direccion;
    if (!dir) return `
      <div class="cab"><div><h2>${t('nav.recibir')}</h2></div></div>
      <div class="bloque vidrio"><div class="vacio">
        <b>${t('rec.sinT')}</b>
        ${t('rec.sinP')}
        <div style="margin-top:16px"><button class="btn btn-linea btn-sm" onclick="VETA.reintentar()">${t('ini.act')}</button></div>
      </div></div>`;
    return `
    <div class="cab"><div><h2>${t('rec.t')}</h2><div class="sub">${t('rec.sub')}</div></div></div>
    <div class="bloque vidrio" style="text-align:center">
      <div class="qr-caja" id="qr-caja"></div>
      <div class="dir mono" id="qr-dir">${esc(dir)}</div>
      <div style="margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-oro btn-sm" onclick="VETA.copiar()">${t('rec.copiar')}</button>
        <button class="btn btn-linea btn-sm" onclick="VETA.compartir()">${t('rec.compartir')}</button>
      </div>
      <p class="pie" style="margin-top:18px">${t('rec.nota')}</p>
    </div>`;
  }


  /* El QR del lingote de la portada lleva a esta misma pagina: quien la esté
     mirando en el ordenador la escanea y sigue en el teléfono, que es donde va
     a usar la billetera. Un QR decorativo seria una mentira pequeña. */
  function pintarQrPortada() {
    const c = $('#qr-mini');
    if (!c) return;
    try { c.innerHTML = QR.svg(location.origin + location.pathname, { claro: '#F3ECD9', oscuro: '#021B1C', margen: 1 }); }
    catch { c.remove(); }
  }

  function pintarQr() {
    const c = $('#qr-caja');
    if (!c || !sesion?.direccion) return;
    try {
      c.innerHTML = QR.svg(sesion.direccion, { claro: '#F3ECD9', oscuro: '#021B1C', margen: 2 });
    } catch { c.innerHTML = '<p style="color:#021B1C;font-size:13px">No se pudo dibujar el código.</p>'; }
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(sesion.direccion); avisar(t('rec.copiada')); }
    catch { avisar(t('rec.noCopia')); }
  }
  async function compartir() {
    const d = sesion.direccion;
    if (navigator.share) { try { await navigator.share({ title: 'Mi dirección de Veta Wallet', text: d }); return; } catch {} }
    copiar();
  }

  function actividad() {
    return `
    <div class="cab">
      <div><h2>${t('act.t')}</h2><div class="sub">${t('act.sub')}</div></div>
      <button class="btn btn-linea btn-sm" onclick="VETA.reintentar()">${t('ini.act')}</button>
    </div>
    <div class="bloque vidrio">${listaMovimientos()}</div>`;
  }

  function vIdentidad() {
    return `
    <div class="cab"><div><h2>Genesis ID</h2><div class="sub">${t('id.sub')}</div></div></div>
    ${tarjetaIdentidad()}
    <div class="bloque vidrio">
      <h3>${t('id.unaT')}</h3>
      <p class="pie" style="margin-top:8px">${t('id.unaP')}</p>
      <div style="margin-top:18px">
        <div class="hilera"><div class="ic"><svg viewBox="0 0 24 24">${ICO.id}</svg></div>
          <div class="txt"><b>Veta Wallet</b><small>${t('id.r1')}</small></div></div>
        <div class="hilera"><div class="ic"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/></svg></div>
          <div class="txt"><b>MyTokenPay</b><small>${t('id.r2')}</small></div></div>
        <div class="hilera"><div class="ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14 0 18-3-4-3-14.5 0-18z"/></svg></div>
          <div class="txt"><b>${t('id.todo')}</b><small>${t('id.r3')}</small></div></div>
      </div>
    </div>`;
  }

  // ── la tarjeta ────────────────────────────────────────────────────────────

  const esVerificada = () => {
    const e = (identidad?.estado || identidad?.status || (identidad?.verified ? 'verificada' : '') || '').toLowerCase();
    return e === 'verificada' || e === 'verified';
  };

  function vTarjeta() {
    const cab = `<div class="cab"><div><h2>${t('tar.t')}</h2><div class="sub">${t('aj.tarjetaP')}</div></div></div>`;

    // Mientras se consulta al emisor se enseña el plastico apagado, no una
    // linea de texto: el hueco queda del tamaño que va a ocupar la tarjeta y la
    // pantalla no da un salto cuando llega la respuesta.
    if (!tarjeta) return cab + `
      <div class="bloque vidrio tar-vacia">
        <div class="tar-plastico tar-fantasma"><span>VETA <em>WALLET</em></span></div>
        <p class="pie">${t('tar.cargando')}</p>
      </div>`;

    if (tarjeta.error) return cab + `
      <div class="bloque vidrio">
        <p class="pie" style="color:var(--coral)">${t('tar.err')} ${esc(tarjeta.error)}</p>
        <div style="margin-top:16px"><button class="btn btn-linea btn-sm" onclick="VETA.reintentar()">${t('saldo.re')}</button></div>
      </div>`;

    // Sin tarjeta todavia. Emitirla exige Genesis ID verificado: decirlo antes
    // evita que alguien llene el formulario para que el emisor lo rechace.
    if (tarjeta.falta) return cab + `
      <div class="bloque vidrio tar-vacia">
        <div class="tar-plastico tar-fantasma"><span>VETA <em>WALLET</em></span></div>
        <h3>${t('tar.sinT')}</h3>
        <p class="pie" style="margin-top:8px">${t('tar.sinP')}</p>
        ${esVerificada() ? `
          <form onsubmit="return VETA.pedirTarjeta(event)" style="margin-top:18px">
            <div class="campo-fila">
              <div class="campo campo-cod">
                <label for="tar-cod">${t('tar.cod')}</label>
                <input id="tar-cod" inputmode="numeric" placeholder="504" required>
              </div>
              <div class="campo" style="flex:1">
                <label for="tar-tel">${t('tar.tel')}</label>
                <input id="tar-tel" inputmode="numeric" data-tp="tar.telPh" placeholder="${t('tar.telPh')}" required>
              </div>
            </div>
            <label class="checa">
              <input type="checkbox" id="tar-term" required>
              <span>${t('tar.acepto')}</span>
            </label>
            <div id="tar-aviso" class="aviso oculto" role="alert"></div>
            <button class="btn btn-oro btn-full" id="tar-btn" type="submit">${t('tar.pedir')}</button>
          </form>`
        : `<div class="nota" style="margin-top:18px">${t('tar.necesitaGid')}</div>
           <div style="margin-top:14px"><button class="btn btn-oro btn-sm" onclick="VETA.vista('identidad')">Genesis ID</button></div>`}
      </div>`;

    const estado = String(tarjeta.status || tarjeta.estado || '').toUpperCase();
    const congelada = estado === 'FROZEN';
    const bloqueada = estado === 'BLOCKED';
    const last4 = tarjeta.last4 || tarjeta.lastFour || '····';
    /* El disponible viene en ORIGEN, no en dolares: el campo se llama
       `availableOrigen` y la tarjeta gasta contra el saldo de la moneda. Poner
       un signo de dolar delante seria decir que hay 842 dolares donde hay 842
       ORIGEN — a este precio, tres veces mas. */
    const disp = tarjeta.availableOrigen;
    const limites = [
      [t('tar.limD'), tarjeta.dailyLimit],
      [t('tar.limS'), tarjeta.weeklyLimit],
      [t('tar.limM'), tarjeta.monthlyLimit],
    ].filter(([, v]) => v != null);

    return cab + `
    <div class="bloque vidrio">
      <div class="tar-plastico ${congelada ? 'tar-fria' : ''}">
        <span class="tar-marca">VETA <em>WALLET</em></span>
        <span class="tar-num mono">•••• •••• •••• ${esc(last4)}</span>
        <span class="tar-pie">
          <span class="estado ${bloqueada ? 'e-mal' : congelada ? 'e-rev' : 'e-ok'}">
            ${bloqueada ? t('tar.bloqueada') : congelada ? t('tar.congelada') : t('tar.activa')}
          </span>
          ${disp != null ? `<b>${tapa(oro(disp))} ORIGEN</b>` : ''}
        </span>
      </div>
      <p class="pie" style="margin-top:14px">
        ${congelada ? t('tar.congelada1') : t('tar.activa1')}
        ${disp == null ? ' ' + t('tar.sinSaldo') : ''}
      </p>
      ${limites.length ? `<dl class="datos">${limites.map(([k, v]) =>
        `<div><dt>${esc(k)}</dt><dd>${oro(v)} ORIGEN</dd></div>`).join('')}</dl>` : ''}
      <div class="tar-botones">
        <button class="btn btn-linea btn-sm" onclick="VETA.congelar(${congelada ? 'false' : 'true'})">
          <svg viewBox="0 0 24 24" class="btn-ic">${ICO.nieve}</svg>${congelada ? t('tar.descongelar') : t('tar.congelar')}
        </button>
        <button class="btn btn-linea btn-sm" onclick="VETA.revelar('pan')">${t('tar.verNum')}</button>
        <button class="btn btn-linea btn-sm" onclick="VETA.revelar('pin')">${t('tar.verPin')}</button>
      </div>
      <div id="tar-secreto"></div>
    </div>
    <div class="bloque vidrio">
      <h3>${t('tar.movs')}</h3>
      ${movsTarjeta.length ? movsTarjeta.map(m => `
        <div class="hilera">
          <div class="ic"><svg viewBox="0 0 24 24">${ICO.tarjeta}</svg></div>
          <div class="txt">
            <b>${esc(m.merchant || m.description || m.merchantName || '—')}</b>
            <small>${esc(cuando(m.createdAt || m.date || m.timestamp))}</small>
          </div>
          <div class="val sale">${tapa(usd(Math.abs(Number(m.amount ?? m.value ?? 0))))}</div>
        </div>`).join('')
      : `<p class="pie" style="margin-top:8px">${t('tar.sinMovs')}</p>`}
    </div>`;
  }

  // ── cambiar ───────────────────────────────────────────────────────────────

  /* La tasa se calcula y se enseña, pero la operacion NO se ejecuta: en el
     telefono tampoco. Es la misma decision y por el mismo motivo — dentro de la
     red todo se liquida contra ORIGEN, y el motor de cambio todavia no esta
     abierto. Enseñar un boton que parece funcionar y no hace nada seria peor
     que no tener la pantalla. */
  function cambiar() {
    const de = origen();
    const destino = (cartera || []).find(x => x.s === (destinoCambio || 'AUKA')) || null;
    const tasa = de?.precio && destino?.precio ? de.precio / destino.precio : null;
    const otros = (cartera || []).filter(x => x.s !== 'ORIGEN');
    return `
    <div class="cab"><div><h2>${t('sw.t')}</h2>${de && destino ? `<div class="sub mono">ORIGEN → ${destino.s}</div>` : ''}</div></div>
    <div class="bloque vidrio">
      <div class="caja-cambio">
        <div class="cc-cab"><span>${t('sw.de')}</span><span>${t('sw.saldo')}: ${oro(de?.cant ?? 0)}</span></div>
        <div class="cc-fila">
          <input id="sw-monto" type="text" inputmode="decimal" placeholder="0"
                 value="${esc(montoCambio)}" oninput="VETA.cambioMonto()">
          <span class="cc-tok">${de ? disco(de) : ''}<b>ORIGEN</b></span>
        </div>
      </div>
      <div class="cc-flecha"><svg viewBox="0 0 24 24">${ICO.cambiar}</svg></div>
      <div class="caja-cambio">
        <div class="cc-cab"><span>${t('sw.a')}</span><span>${t('sw.saldo')}: ${oro(destino?.cant ?? 0)}</span></div>
        <div class="cc-fila">
          <input id="sw-sale" type="text" value="" placeholder="0" readonly>
          <select class="cc-tok cc-sel" onchange="VETA.elegirDestino(this.value)" aria-label="${t('sw.elegir')}">
            ${otros.map(x => `<option value="${x.s}" ${x.s === destino?.s ? 'selected' : ''}>${esc(x.n)}</option>`).join('')}
          </select>
        </div>
      </div>
      <dl class="datos" style="margin-top:18px">
        <div><dt>${t('sw.tasa')}</dt><dd>${tasa ? `1 ORIGEN = ${oro(tasa)} ${destino.s}` : '—'}</dd></div>
        <div><dt>${t('sw.precio')} ORIGEN</dt><dd>${de?.precio != null ? esc(usd(de.precio)) : '—'}</dd></div>
        <div><dt>${t('sw.precio')} ${destino?.s || ''}</dt><dd>${destino?.precio != null ? esc(usd(destino.precio)) : '—'}</dd></div>
      </dl>
      ${!tasa ? `<div class="nota" style="margin-top:16px">${t('sw.sinPrecio')}</div>` : ''}
      <div class="nota" style="margin-top:12px">${t('sw.soloOrigen')}</div>
      <div class="nota nota-obra" style="margin-top:12px">${t('sw.pronto')}</div>
      <button class="btn btn-oro btn-full" disabled aria-disabled="true" style="margin-top:16px">${t('sw.cta')}</button>
    </div>`;
  }

  let destinoCambio = 'AUKA';
  let montoCambio = '';
  function elegirDestino(s) {
    montoCambio = $('#sw-monto')?.value || '';
    destinoCambio = s;
    vista('cambiar');
  }
  function cambioMonto() {
    montoCambio = $('#sw-monto')?.value || '';
    const de = origen();
    const destino = (cartera || []).find(x => x.s === destinoCambio);
    const n = Number(String($('#sw-monto')?.value || '').replace(',', '.')) || 0;
    const tasa = de?.precio && destino?.precio ? de.precio / destino.precio : null;
    const salida = $('#sw-sale');
    if (salida) salida.value = tasa && n ? oro(n * tasa) : '';
  }

  // ── comprar ───────────────────────────────────────────────────────────────

  // En obra, igual que en el telefono. Se dice qué se puede hacer mientras tanto.
  function comprar() {
    return `
    <div class="cab"><div><h2>${t('cmp.t')}</h2></div></div>
    <div class="bloque vidrio obra">
      <div class="obra-ic"><svg viewBox="0 0 24 24">${ICO.obra}</svg></div>
      <h3>${t('cmp.obraT')}</h3>
      <p class="pie" style="margin-top:10px">${t('cmp.obraP')}</p>
      <div style="margin-top:18px"><button class="btn btn-oro btn-sm" onclick="VETA.vista('recibir')">${t('cmp.ir')}</button></div>
    </div>`;
  }

  // ── depositar ─────────────────────────────────────────────────────────────

  function deposito() {
    const d = sesion?.direccion || '';
    return `
    <div class="cab"><div><h2>${t('dep.t')}</h2><div class="sub">${t('dep.p')}</div></div></div>
    <div class="bloque vidrio centrado">
      <div id="qr-caja" class="qr-caja" aria-label="${t('dep.t')}"></div>
      <div class="dir mono" id="dir-txt">${esc(d)}</div>
      <div class="dir-btns">
        <button class="btn btn-oro btn-sm" onclick="VETA.copiar()">${t('rec.copiar')}</button>
        <button class="btn btn-linea btn-sm" onclick="VETA.compartir()">${t('rec.compartir')}</button>
      </div>
      <dl class="datos" style="margin-top:20px;text-align:left">
        <div><dt>${t('dep.red')}</dt><dd>Orden Global · 8532</dd></div>
      </dl>
      <div class="nota nota-cuidado" style="margin-top:16px">${t('dep.aviso')}</div>
    </div>`;
  }

  // ── ajustes ───────────────────────────────────────────────────────────────

  function ajustes() {
    const fila = (ico, titulo, pie, accion) => `
      <button class="ajuste" onclick="${accion}">
        <span class="aj-ic"><svg viewBox="0 0 24 24">${ico}</svg></span>
        <span class="aj-txt"><b>${titulo}</b><small>${pie}</small></span>
        <svg viewBox="0 0 24 24" class="aj-flecha"><path d="M9 6l6 6-6 6"/></svg>
      </button>`;
    return `
    <div class="cab"><div><h2>${t('aj.t')}</h2><div class="sub">${esc(sesion?.correo || '')}</div></div></div>

    <div class="bloque vidrio">
      <h3>${t('aj.cuenta')}</h3>
      <div class="ajustes">
        ${fila(ICO.id, t('aj.gid'), t('aj.gidP'), "VETA.vista('identidad')")}
        ${fila(ICO.tarjeta, t('aj.tarjeta'), t('aj.tarjetaP'), "VETA.vista('tarjeta')")}
        ${fila(ICO.recibir, t('aj.deposito'), t('aj.depositoP'), "VETA.vista('deposito')")}
      </div>
      <dl class="datos" style="margin-top:16px">
        <div><dt>${t('cta.correo')}</dt><dd>${esc(sesion?.correo || '—')}</dd></div>
        <div><dt>${t('cta.dir')}</dt><dd class="mono">${esc(sesion?.direccion || t('cta.sinDir'))}</dd></div>
      </dl>
    </div>

    <div class="bloque vidrio">
      <h3>${t('aj.ecosistema')}</h3>
      <div class="ajustes">
        ${fila(ICO.tienda, t('aj.mtp'), t('aj.mtpP'), "window.open('https://www.mytokenpay-pos.com','_blank','noopener')")}
        ${fila(ICO.globo, t('aj.idioma'), t('aj.idiomaP'), "VETA.idioma('" + (idiomaActivo() === 'es' ? 'en' : 'es') + "')")}
        ${fila(ICO.doc, t('aj.legal'), t('aj.legalP'), "window.open('/terminos','_blank','noopener')")}
      </div>
    </div>

    <div class="bloque vidrio">
      <h3>${t('aj.seguridad')}</h3>
      <div class="nota nota-cuidado">${t('aj.clave')}</div>
      <div style="margin-top:16px"><button class="btn btn-linea btn-sm" onclick="VETA.salir()">${t('aj.salir')}</button></div>
    </div>

    <div class="bloque vidrio">
      <h3>${t('cta.appT')}</h3>
      <p class="pie" style="margin-top:8px">${t('cta.appP')}</p>
    </div>`;
  }

  // ── acciones ──────────────────────────────────────────────────────────────

  function tapar() { ocultos = !ocultos; vista(vistaActual); }

  async function copiarContrato(c) {
    try { await navigator.clipboard.writeText(c); avisar(t('tok.copiado')); }
    catch { avisar(t('rec.noCopia')); }
  }

  /* Congelar es un control de seguridad de verdad, no un adorno: con la tarjeta
     congelada el emisor rechaza cualquier cobro. Por eso se pinta el estado
     nuevo solo cuando el servidor lo confirma — dejar el interruptor movido
     mientras la llamada falla le haria creer a alguien que su tarjeta esta
     bloqueada cuando sigue cobrando. */
  async function congelar(v) {
    try {
      const r = await pedir('/cards/freeze', { metodo: 'POST', cuerpo: { frozen: !!v } });
      tarjeta = { ...tarjeta, status: r?.status || (v ? 'FROZEN' : 'ACTIVE') };
      avisar(v ? t('tar.congelada1') : t('tar.activa1'));
    } catch (e) { avisar(e.message); }
    if (vistaActual === 'tarjeta') vista('tarjeta');
  }

  /* El numero y el PIN se piden con la contraseña cada vez y no se guardan en
     ningun lado: ni en el estado, ni en el almacenamiento del navegador. Se
     pintan, y desaparecen al salir de la pantalla. */
  async function revelar(que, ev) {
    const caja = $('#tar-secreto');
    if (!caja) return false;

    // Primer momento: todavia no hay contraseña, se pide.
    if (!ev) {
      caja.innerHTML = `
        <form class="revelar" onsubmit="return VETA.revelar('${que}',event)">
          <div class="campo">
            <label for="rev-clave">${t('tar.claveP')}</label>
            <input id="rev-clave" type="password" autocomplete="current-password" placeholder="••••••••" required>
          </div>
          <div id="rev-aviso" class="aviso oculto" role="alert"></div>
          <button class="btn btn-oro btn-sm" type="submit">${t('tar.mostrar')}</button>
        </form>`;
      $('#rev-clave').focus();
      return false;
    }

    // Segundo momento: con la contraseña, se va a buscar el dato.
    ev.preventDefault();
    const av = $('#rev-aviso');
    const btn = ev.target.querySelector('button');
    btn.disabled = true;
    btn.innerHTML = '<span class="girando"></span>';
    try {
      const d = await pedir(`/cards/${que}`, { metodo: 'POST', cuerpo: { password: $('#rev-clave').value } });
      const filas = que === 'pan'
        ? [[t('tar.verNum'), d?.pan], ['Exp.', d?.expiry], ['CVV', d?.cvv]]
        : [['PIN', d?.pin]];
      caja.innerHTML = `
        <div class="secreto">
          ${filas.filter(([, v]) => v).map(([k, v]) =>
            `<div class="sec-fila"><span>${esc(k)}</span><b class="mono">${esc(v)}</b></div>`).join('')}
          <div class="nota nota-cuidado">${t('tar.cuidado')}</div>
          <button class="btn btn-linea btn-sm" onclick="document.getElementById('tar-secreto').innerHTML=''">${t('tar.ocultar')}</button>
        </div>`;
    } catch (e) {
      // Un 409 no es culpa de quien escribe: la tarjeta todavia no tiene PIN.
      av.textContent = e.estado === 409 ? t('tar.sinPin') : e.message;
      av.classList.remove('oculto');
      btn.disabled = false;
      btn.textContent = t('tar.mostrar');
    }
    return false;
  }

  function pedirTarjeta(ev) {
    ev.preventDefault();
    const b = $('#tar-btn'), av = $('#tar-aviso');
    av.classList.add('oculto');
    b.disabled = true;
    b.innerHTML = `<span class="girando"></span> ${t('tar.pidiendo')}`;
    pedir('/cards/request', {
      metodo: 'POST', espera: 45000,
      cuerpo: {
        acceptedTerms: true,
        phone_country_code: Number($('#tar-cod').value) || undefined,
        phone_number: String($('#tar-tel').value || ''),
      },
    }).then(() => { tarjeta = null; return cargarTarjeta(); })
      .then(() => vista('tarjeta'))
      .catch(e => {
        av.textContent = e.estado === 403 ? t('tar.necesitaGid') : e.message;
        av.classList.remove('oculto');
        b.disabled = false;
        b.textContent = t('tar.pedir');
      });
    return false;
  }

  async function reintentar() {
    avisar(t('ok.act'));
    cartera = null; errCartera = null;
    if (vistaActual === 'billetera') vista('billetera');
    await cargarTodo();
  }

  // ── arranque ──────────────────────────────────────────────────────────────


  /* Cada bloque del recorrido sube a su sitio cuando entra en pantalla, y se
     queda: no se vuelve a esconder al pasar de largo. Un elemento que aparece y
     desaparece mientras uno sube y baja no es una animacion, es un parpadeo.

     Se usa IntersectionObserver y no un manejador de scroll porque el navegador
     ya sabe que hay en pantalla: pedirselo cuesta cero, calcularlo en cada
     pixel de desplazamiento cuesta la fluidez de la pagina. */
  function armarRevelado() {
    const piezas = document.querySelectorAll('.rev');
    if (!('IntersectionObserver' in window)) {
      piezas.forEach(p => p.classList.add('ve'));
      return;
    }
    const ojo = new IntersectionObserver((entradas) => {
      entradas.forEach(e => {
        // Tambien se revela lo que quedo POR ENCIMA de la pantalla: quien llega
        // por un enlace al final, o baja de un tiron, se saltaria media pagina
        // con bloques invisibles esperando una entrada que ya paso.
        if (!e.isIntersecting && e.boundingClientRect.top > 0) return;
        e.target.classList.add('ve');
        ojo.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    // Dentro de un mismo grupo entran escalonados: la escalera se dibuja
    // peldano a peldano en vez de aparecer entera de golpe.
    let grupo = null, i = 0;
    piezas.forEach(p => {
      if (p.parentElement !== grupo) { grupo = p.parentElement; i = 0; }
      p.style.transitionDelay = (i++ * 90) + 'ms';
      ojo.observe(p);
    });

    // Y un barrido de respaldo. El observador avisa de los cambios de estado,
    // pero si alguien salta al final de la pagina de golpe hay bloques que pasan
    // de estar debajo a estar encima sin haber llegado a asomarse nunca, y
    // quedan invisibles para siempre. Esto recoge todo lo que ya se paso.
    let pedido = 0;
    const barrer = () => {
      pedido = 0;
      document.querySelectorAll('.rev:not(.ve)').forEach(p => {
        if (p.getBoundingClientRect().top < innerHeight * 0.92) {
          p.classList.add('ve');
          ojo.unobserve(p);
        }
      });
    };
    addEventListener('scroll', () => { if (!pedido) pedido = requestAnimationFrame(barrer); }, { passive: true });
    barrer();
  }

  function arrancar() {
    pintarIdioma();
    pintarQrPortada();
    armarRevelado();
    $('#form-acceso').addEventListener('submit', enviarAcceso);
    $('#i-clave').addEventListener('input', pintarFuerza);
    sesion = recuperar();
    if (sesion?.token) { ir('app'); cargarTodo(); }
    else ir('bienvenida');
  }
  document.addEventListener('DOMContentLoaded', arrancar);

  return { ir, pestana, ojo, vista, mandar, copiar, compartir, salir, reintentar, avisar, idioma,
           tapar, copiarContrato, congelar, revelar, pedirTarjeta, cambioMonto, elegirDestino,
           // Solo para las pruebas y las capturas: aqui no hay salida a la
           // cadena, y hay que poder mirar la pantalla con saldos dentro.
           _sembrar: l => { cartera = l; errCartera = null; },
           _tarjeta: c => { tarjeta = c; },
           _estado: () => ({ sesion, cartera, identidad, movimientos, tarjeta, vistaActual, modo, ocultos }) };
})();
