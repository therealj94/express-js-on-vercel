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
  let saldo = null;           // { origen, usd, precio }
  let identidad = null;       // estado de Genesis ID
  let movimientos = [];
  let vistaActual = 'inicio';
  let modo = 'entrar';

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
  const nfUsd = new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'USD' });
  const oro = n => nfOro.format(Number(n) || 0);
  const usd = n => nfUsd.format(Number(n) || 0);
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
    sesion = null; saldo = null; identidad = null; movimientos = [];
    try { localStorage.removeItem(LLAVE); } catch {}
    ir('bienvenida');
  }

  // ── traer los datos ───────────────────────────────────────────────────────

  async function cargarTodo() {
    await Promise.allSettled([cargarSaldo(), cargarIdentidad(), cargarMovimientos()]);
    if (!$('#app').classList.contains('oculto')) vista(vistaActual);
  }

  async function cargarSaldo() {
    try {
      const d = await pedir('/wallet/origen-balance');
      const n = Number(d?.balance ?? d?.origen ?? d?.amount ?? d?.data?.balance ?? 0);
      const precio = Number(d?.priceUsd ?? d?.usdPrice ?? 2.35);
      saldo = { origen: n, precio, usd: n * precio, cambio: Number(d?.change24h ?? 0) };
      if (d?.address && !sesion.direccion) { sesion.direccion = d.address; guardar(); }
    } catch (e) { saldo = { error: e.message }; }
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

  // ── las vistas ────────────────────────────────────────────────────────────

  function vista(cual) {
    vistaActual = cual;
    document.querySelectorAll('.nav[data-vista]').forEach(b =>
      b.dataset.vista === cual ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
    const l = $('#lienzo');
    l.innerHTML = ({ inicio, enviar, recibir, actividad, identidad: vIdentidad, cuenta })[cual]();
    l.querySelectorAll('[data-al-cargar]').forEach(el => window[el.dataset.alCargar]?.(el));
    if (cual === 'recibir') pintarQr();
    if (cual === 'enviar') $('#env-monto')?.focus();
    window.scrollTo(0, 0);
  }

  const ICO = {
    enviar: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    recibir: '<path d="M12 5v14M5 12l7 7 7-7"/>',
    comprar: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    cambiar: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    id: '<path d="M12 3l8 3.5v5c0 5-3.4 8.6-8 9.5-4.6-.9-8-4.5-8-9.5v-5z"/><path d="M9 12l2 2 4-4"/>',
  };

  function bloqueSaldo() {
    if (saldo?.error) return `
      <div class="saldo vidrio">
        <div class="saldo-lbl">${t('saldo.lbl')}</div>
        <div class="saldo-cifra"><b>—</b></div>
        <div class="saldo-fiat" style="color:var(--coral)">${t('saldo.err')} ${esc(saldo.error)}</div>
        <div style="margin-top:16px"><button class="btn btn-linea btn-sm" onclick="VETA.reintentar()">${t('saldo.re')}</button></div>
      </div>`;
    const cargando = !saldo;
    const sube = (saldo?.cambio ?? 0) >= 0;
    return `
    <div class="saldo vidrio">
      <div class="saldo-lbl">${t('saldo.lbl')}</div>
      <div class="saldo-cifra">
        <b class="${cargando ? 'esqueleto' : ''}">${cargando ? '0,0000' : oro(saldo.origen)}</b>
        <span>ORIGEN</span>
      </div>
      <div class="saldo-fiat">
        ${cargando ? '<span class="esqueleto">$0.00</span>' : esc(usd(saldo.usd))}
        ${!cargando && saldo.cambio ? `<span class="pastilla ${sube ? 'sube-p' : 'baja-p'}">${sube ? '+' : ''}${saldo.cambio.toFixed(2)}%</span>` : ''}
        <span style="color:var(--humo);margin-left:8px">${t('x.precio')} ${esc(usd(saldo?.precio || 2.35))}</span>
      </div>
      <div class="acciones">
        <button class="acc-btn" onclick="VETA.vista('enviar')"><svg viewBox="0 0 24 24">${ICO.enviar}</svg>${t('a.enviar')}</button>
        <button class="acc-btn" onclick="VETA.vista('recibir')"><svg viewBox="0 0 24 24">${ICO.recibir}</svg>${t('a.recibir')}</button>
        <button class="acc-btn" onclick="VETA.avisar(t('a.compraPronto'))"><svg viewBox="0 0 24 24">${ICO.comprar}</svg>${t('a.comprar')}</button>
        <button class="acc-btn" onclick="VETA.avisar(t('a.cambioPronto'))"><svg viewBox="0 0 24 24">${ICO.cambiar}</svg>${t('a.cambiar')}</button>
      </div>
    </div>`;
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
    const l = movimientos.slice(0, limite || movimientos.length);
    if (!l.length) return `
      <div class="vacio">
        <b>${t('ini.vacioT')}</b>
        ${t('ini.vacioP')}
      </div>`;
    return l.map(m => {
      const entra = (m.direction || m.type || '').toLowerCase().includes('in') || Number(m.amount) > 0 && !m.to;
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

  function inicio() {
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
    ${tarjetaIdentidad()}
    <div class="bloque vidrio">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <h3>${t('ini.movs')}</h3>
        <button class="btn btn-linea btn-sm" onclick="VETA.vista('actividad')">${t('ini.verTodos')}</button>
      </div>
      ${listaMovimientos(4)}
    </div>`;
  }

  function enviar() {
    const disp = saldo?.origen ?? 0;
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
    if (saldo?.origen != null && monto > saldo.origen) return decir(`${t('env.eAlcanza')} ${oro(saldo.origen)} ORIGEN.`);
    if (!clave) return decir(t('env.eClave'));

    if (!pendiente || pendiente.dir !== dir || pendiente.monto !== monto) {
      pendiente = { dir, monto, sello: 'web-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) };
      a.className = 'aviso aviso-ok';
      a.innerHTML = `${t('env.vas')} <b>${oro(monto)} ORIGEN</b> (${esc(usd(monto * (saldo?.precio || 2.35)))}) ${t('env.a')} <span class="mono">${esc(cortaDir(dir))}</span>. ${t('env.toca')}`;
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
      cargarSaldo().then(() => { if (vistaActual === 'enviar') $('.cab .sub').textContent = `${t('env.tenes')} ${oro(saldo?.origen ?? 0)} ${t('env.disp')}`; });
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

  function cuenta() {
    return `
    <div class="cab"><div><h2>${t('cta.t')}</h2><div class="sub">${esc(sesion?.correo || '')}</div></div></div>
    <div class="bloque vidrio">
      <div class="hilera"><div class="txt"><b>${t('cta.nombre')}</b><small>${esc(sesion?.nombre || '—')}</small></div></div>
      <div class="hilera"><div class="txt"><b>${t('cta.correo')}</b><small>${esc(sesion?.correo || '—')}</small></div></div>
      <div class="hilera"><div class="txt"><b>${t('cta.dir')}</b><small class="mono">${esc(sesion?.direccion || t('cta.sinDir'))}</small></div></div>
    </div>
    <div class="bloque vidrio">
      <h3>${t('cta.appT')}</h3>
      <p class="pie" style="margin-top:8px">${t('cta.appP')}</p>
    </div>
    <div class="bloque vidrio">
      <h3>${t('cta.salirT')}</h3>
      <p class="pie" style="margin-top:8px">${t('cta.salirP')}</p>
      <div style="margin-top:16px"><button class="btn btn-linea btn-sm" onclick="VETA.salir()">${t('cta.salirT')}</button></div>
    </div>`;
  }

  async function reintentar() {
    avisar(t('ok.act'));
    saldo = null;
    if (vistaActual === 'inicio') vista('inicio');
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
           _estado: () => ({ sesion, saldo, identidad, movimientos, vistaActual, modo }) };
})();
