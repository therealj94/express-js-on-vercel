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
      if (e.name === 'AbortError') throw new Error('El servidor tardó demasiado. Probá de nuevo.');
      // Un fallo de red y un error del servidor se sienten igual para quien
      // mira la pantalla, pero se arreglan de forma distinta: conviene decir cuál es.
      if (e instanceof TypeError) throw new Error('No hay conexión con el servidor. Revisá tu internet.');
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
    for (const id of ['bienvenida', 'acceso', 'app']) $('#' + id).classList.toggle('oculto', id !== destino);
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
    $('#btn-acceso').textContent = cual === 'crear' ? 'Crear mi cuenta' : 'Entrar';
    $('#i-clave').setAttribute('autocomplete', cual === 'crear' ? 'new-password' : 'current-password');
    $('#acc-aviso').classList.add('oculto');
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
      { n: 0, txt: 'Muy corta', color: '#F0776B' },
      { n: 1, txt: 'Débil', color: '#F0776B' },
      { n: 2, txt: 'Aceptable', color: '#E0B15C' },
      { n: 3, txt: 'Buena', color: '#9FD8A8' },
      { n: 4, txt: 'Fuerte', color: '#3ED9A0' },
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
    if (!correo || !clave) return avisoAcceso('Completá el correo y la contraseña.');
    if (modo === 'crear' && clave.length < 8) return avisoAcceso('La contraseña necesita al menos 8 caracteres.');
    if (modo === 'crear' && !nombre) return avisoAcceso('Escribí tu nombre completo.');

    avisoAcceso('');
    b.disabled = true;
    const antes = b.textContent;
    b.innerHTML = '<span class="girando"></span> ' + (modo === 'crear' ? 'Creando tu cuenta…' : 'Entrando…');
    try {
      if (modo === 'crear') {
        await pedir('/auth/register', { metodo: 'POST', cuerpo: { name: nombre, email: correo, password: clave }, conSesion: false });
      }
      const d = await pedir('/auth/login', { metodo: 'POST', cuerpo: { email: correo, password: clave }, conSesion: false });
      const token = d?.token || d?.accessToken || d?.access_token || d?.data?.token;
      if (!token) throw new Error('El servidor no devolvió una sesión válida.');
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
      avisar(modo === 'crear' ? `Tu cuenta está lista, ${sesion.nombre.split(' ')[0]}` : `Hola de nuevo, ${sesion.nombre.split(' ')[0]}`);
    } catch (e) {
      // El servidor devuelve "credenciales inválidas" para un correo que no
      // existe y para una contraseña equivocada. Decirlo tal cual deja a la
      // persona sin saber cuál de las dos cosas arreglar.
      const m = /credencial|invalid|incorrect|unauthor/i.test(e.message)
        ? 'El correo o la contraseña no coinciden. Revisá los dos.'
        : /exist|registrad|duplicad/i.test(e.message)
          ? 'Ya hay una cuenta con ese correo. Probá entrando.'
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
        <div class="saldo-lbl">Tu saldo</div>
        <div class="saldo-cifra"><b>—</b></div>
        <div class="saldo-fiat" style="color:var(--coral)">No pudimos leer tu saldo. ${esc(saldo.error)}</div>
        <div style="margin-top:16px"><button class="btn btn-linea btn-sm" onclick="VETA.reintentar()">Reintentar</button></div>
      </div>`;
    const cargando = !saldo;
    const sube = (saldo?.cambio ?? 0) >= 0;
    return `
    <div class="saldo vidrio">
      <div class="saldo-lbl">Tu saldo</div>
      <div class="saldo-cifra">
        <b class="${cargando ? 'esqueleto' : ''}">${cargando ? '0,0000' : oro(saldo.origen)}</b>
        <span>ORIGEN</span>
      </div>
      <div class="saldo-fiat">
        ${cargando ? '<span class="esqueleto">$0.00</span>' : esc(usd(saldo.usd))}
        ${!cargando && saldo.cambio ? `<span class="pastilla ${sube ? 'sube-p' : 'baja-p'}">${sube ? '+' : ''}${saldo.cambio.toFixed(2)}%</span>` : ''}
        <span style="color:var(--humo);margin-left:8px">1 ORIGEN = ${esc(usd(saldo?.precio || 2.35))}</span>
      </div>
      <div class="acciones">
        <button class="acc-btn" onclick="VETA.vista('enviar')"><svg viewBox="0 0 24 24">${ICO.enviar}</svg>Enviar</button>
        <button class="acc-btn" onclick="VETA.vista('recibir')"><svg viewBox="0 0 24 24">${ICO.recibir}</svg>Recibir</button>
        <button class="acc-btn" onclick="VETA.avisar('La compra con tarjeta llega en la próxima versión.')"><svg viewBox="0 0 24 24">${ICO.comprar}</svg>Comprar</button>
        <button class="acc-btn" onclick="VETA.avisar('El cambio entre monedas llega en la próxima versión.')"><svg viewBox="0 0 24 24">${ICO.cambiar}</svg>Cambiar</button>
      </div>
    </div>`;
  }

  function tarjetaIdentidad(compacta) {
    const e = (identidad?.estado || identidad?.status || (identidad?.verified ? 'verificada' : 'sin-iniciar') || '').toLowerCase();
    const mapa = {
      verificada: ['e-ok', 'Verificada', 'Tu Genesis ID está activa. Vale en Veta Wallet, MyTokenPay y todo el ecosistema.'],
      verified: ['e-ok', 'Verificada', 'Tu Genesis ID está activa. Vale en Veta Wallet, MyTokenPay y todo el ecosistema.'],
      'en-revision': ['e-rev', 'En revisión', 'Un operador de cumplimiento está revisando tus datos. Suele tardar menos de 24 horas.'],
      rechazada: ['e-mal', 'Rechazada', 'La verificación no pasó. Escribinos y lo revisamos con vos.'],
      suspendida: ['e-mal', 'Suspendida', 'Tu identidad quedó suspendida. Escribinos para reactivarla.'],
    };
    const [clase, titulo, texto] = mapa[e] || ['e-no', 'Sin verificar', 'Verificá tu identidad una sola vez y quedás verificado en todo el ecosistema.'];
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
          ${listo || compacta ? '' : `<div style="margin-top:16px"><a class="btn btn-oro btn-sm" href="https://genesis-id.onrender.com" target="_blank" rel="noopener">Verificar mi identidad</a></div>`}
        </div>
      </div>
    </div>`;
  }

  function listaMovimientos(limite) {
    const l = movimientos.slice(0, limite || movimientos.length);
    if (!l.length) return `
      <div class="vacio">
        <b>Todavía no hay movimientos</b>
        Cuando recibas o envíes ORIGEN, todo va a aparecer acá.
      </div>`;
    return l.map(m => {
      const entra = (m.direction || m.type || '').toLowerCase().includes('in') || Number(m.amount) > 0 && !m.to;
      const monto = Math.abs(Number(m.amount ?? m.value ?? 0));
      return `
      <div class="hilera">
        <div class="ic"><svg viewBox="0 0 24 24">${entra ? ICO.recibir : ICO.enviar}</svg></div>
        <div class="txt">
          <b>${entra ? 'Recibiste' : 'Enviaste'}</b>
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
        <h2>Hola, ${esc(nombre)}</h2>
        <div class="sub">${esc(sesion?.correo || '')}</div>
      </div>
      <button class="btn btn-linea btn-sm" onclick="VETA.reintentar()">Actualizar</button>
    </div>
    ${bloqueSaldo()}
    ${tarjetaIdentidad()}
    <div class="bloque vidrio">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <h3>Movimientos</h3>
        <button class="btn btn-linea btn-sm" onclick="VETA.vista('actividad')">Ver todos</button>
      </div>
      ${listaMovimientos(4)}
    </div>`;
  }

  function enviar() {
    const disp = saldo?.origen ?? 0;
    return `
    <div class="cab"><div><h2>Enviar ORIGEN</h2><div class="sub">Tenés ${oro(disp)} ORIGEN disponibles</div></div></div>
    <div class="bloque vidrio">
      <form onsubmit="return VETA.mandar(event)">
        <div class="campo">
          <label for="env-dir">Dirección de destino</label>
          <input id="env-dir" class="mono" placeholder="0x…" autocomplete="off" spellcheck="false" required>
        </div>
        <div class="campo">
          <label for="env-monto">Cantidad</label>
          <input id="env-monto" type="text" inputmode="decimal" placeholder="0,00" required>
        </div>
        <div class="campo">
          <label for="env-clave">Tu contraseña</label>
          <input id="env-clave" type="password" autocomplete="current-password" placeholder="••••••••" required>
        </div>
        <div id="env-aviso" class="aviso oculto" role="alert"></div>
        <button class="btn btn-oro btn-full" id="env-btn" type="submit">Revisar el envío</button>
      </form>
      <p class="pie" style="margin-top:16px">Los envíos en la cadena de Orden Global no se pueden deshacer. Revisá la dirección antes de confirmar.</p>
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

    if (!/^0x[a-fA-F0-9]{40}$/.test(dir)) return decir('Esa no parece una dirección de la cadena. Tiene que empezar con 0x y llevar 40 caracteres.');
    if (!(monto > 0)) return decir('Escribí una cantidad mayor que cero.');
    if (saldo?.origen != null && monto > saldo.origen) return decir(`No te alcanza: tenés ${oro(saldo.origen)} ORIGEN.`);
    if (!clave) return decir('Necesitamos tu contraseña para firmar el envío.');

    if (!pendiente || pendiente.dir !== dir || pendiente.monto !== monto) {
      pendiente = { dir, monto, sello: 'web-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) };
      a.className = 'aviso aviso-ok';
      a.innerHTML = `Vas a enviar <b>${oro(monto)} ORIGEN</b> (${esc(usd(monto * (saldo?.precio || 2.35)))}) a <span class="mono">${esc(cortaDir(dir))}</span>. Tocá otra vez para confirmar.`;
      a.classList.remove('oculto');
      b.textContent = 'Confirmar y enviar';
      return;
    }

    if (enviando) return;      // el candado: un doble toque no manda dos veces
    enviando = true;
    b.disabled = true;
    b.innerHTML = '<span class="girando"></span> Enviando…';
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
      a.innerHTML = `Enviaste ${oro(monto)} ORIGEN.${hash ? ` <span class="mono">${esc(cortaDir(hash))}</span>` : ''}`;
      $('#env-dir').value = ''; $('#env-monto').value = ''; $('#env-clave').value = '';
      b.textContent = 'Revisar el envío';
      avisar('Envío hecho');
      cargarSaldo().then(() => { if (vistaActual === 'enviar') $('.cab .sub').textContent = `Tenés ${oro(saldo?.origen ?? 0)} ORIGEN disponibles`; });
      cargarMovimientos();
    } catch (e) {
      // No se ofrece reintentar: la transferencia pudo haber salido y volver a
      // pulsar sería mandarla de nuevo. Se pide comprobar antes.
      decir(/contrase|password|credential/i.test(e.message)
        ? 'La contraseña no coincide.'
        : `${e.message} Revisá tu actividad antes de volver a intentarlo.`);
      b.textContent = 'Revisar el envío';
      pendiente = null;
    } finally { enviando = false; b.disabled = false; }
  }

  function recibir() {
    const dir = sesion?.direccion;
    if (!dir) return `
      <div class="cab"><div><h2>Recibir</h2></div></div>
      <div class="bloque vidrio"><div class="vacio">
        <b>Todavía no tenemos tu dirección</b>
        Actualizá para traerla del servidor.
        <div style="margin-top:16px"><button class="btn btn-linea btn-sm" onclick="VETA.reintentar()">Actualizar</button></div>
      </div></div>`;
    return `
    <div class="cab"><div><h2>Recibir ORIGEN</h2><div class="sub">Mostrá este código o compartí tu dirección</div></div></div>
    <div class="bloque vidrio" style="text-align:center">
      <div class="qr-caja" id="qr-caja"></div>
      <div class="dir mono" id="qr-dir">${esc(dir)}</div>
      <div style="margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-oro btn-sm" onclick="VETA.copiar()">Copiar dirección</button>
        <button class="btn btn-linea btn-sm" onclick="VETA.compartir()">Compartir</button>
      </div>
      <p class="pie" style="margin-top:18px">Solo enviá ORIGEN de la cadena de Orden Global a esta dirección. Otras monedas se pierden.</p>
    </div>`;
  }

  function pintarQr() {
    const c = $('#qr-caja');
    if (!c || !sesion?.direccion) return;
    try {
      c.innerHTML = QR.svg(sesion.direccion, { claro: '#F3ECD9', oscuro: '#021B1C', margen: 2 });
    } catch { c.innerHTML = '<p style="color:#021B1C;font-size:13px">No se pudo dibujar el código.</p>'; }
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(sesion.direccion); avisar('Dirección copiada'); }
    catch { avisar('No pudimos copiar. Seleccioná la dirección a mano.'); }
  }
  async function compartir() {
    const d = sesion.direccion;
    if (navigator.share) { try { await navigator.share({ title: 'Mi dirección de Veta Wallet', text: d }); return; } catch {} }
    copiar();
  }

  function actividad() {
    return `
    <div class="cab">
      <div><h2>Actividad</h2><div class="sub">Todo lo que entró y salió de tu billetera</div></div>
      <button class="btn btn-linea btn-sm" onclick="VETA.reintentar()">Actualizar</button>
    </div>
    <div class="bloque vidrio">${listaMovimientos()}</div>`;
  }

  function vIdentidad() {
    return `
    <div class="cab"><div><h2>Genesis ID</h2><div class="sub">Tu identidad digital en el ecosistema Orden Global</div></div></div>
    ${tarjetaIdentidad()}
    <div class="bloque vidrio">
      <h3>Una verificación, todo el ecosistema</h3>
      <p class="pie" style="margin-top:8px">Con una sola verificación de Genesis ID quedás verificado en Veta Wallet, en MyTokenPay y en el resto de los servicios de Orden Global. No hay que repetir el trámite en cada uno.</p>
      <div style="margin-top:18px">
        <div class="hilera"><div class="ic"><svg viewBox="0 0 24 24">${ICO.id}</svg></div>
          <div class="txt"><b>Veta Wallet</b><small>Enviar y recibir sin límites de cuenta no verificada</small></div></div>
        <div class="hilera"><div class="ic"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/></svg></div>
          <div class="txt"><b>MyTokenPay</b><small>Pagar en comercios afiliados y cobrar como negocio</small></div></div>
        <div class="hilera"><div class="ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14 0 18-3-4-3-14.5 0-18z"/></svg></div>
          <div class="txt"><b>Todo Orden Global</b><small>La misma identidad, en cualquier servicio del grupo</small></div></div>
      </div>
    </div>`;
  }

  function cuenta() {
    return `
    <div class="cab"><div><h2>Mi cuenta</h2><div class="sub">${esc(sesion?.correo || '')}</div></div></div>
    <div class="bloque vidrio">
      <div class="hilera"><div class="txt"><b>Nombre</b><small>${esc(sesion?.nombre || '—')}</small></div></div>
      <div class="hilera"><div class="txt"><b>Correo</b><small>${esc(sesion?.correo || '—')}</small></div></div>
      <div class="hilera"><div class="txt"><b>Dirección de la billetera</b><small class="mono">${esc(sesion?.direccion || 'todavía sin asignar')}</small></div></div>
    </div>
    <div class="bloque vidrio">
      <h3>La aplicación del teléfono</h3>
      <p class="pie" style="margin-top:8px">La misma cuenta funciona en Android y iPhone, y ahí además tenés la tarjeta, los contactos y el lector de códigos.</p>
    </div>
    <div class="bloque vidrio">
      <h3>Cerrar sesión</h3>
      <p class="pie" style="margin-top:8px">Se borra la sesión de este navegador. Tu dinero y tu cuenta no se tocan.</p>
      <div style="margin-top:16px"><button class="btn btn-linea btn-sm" onclick="VETA.salir()">Cerrar sesión</button></div>
    </div>`;
  }

  async function reintentar() {
    avisar('Actualizando…');
    saldo = null;
    if (vistaActual === 'inicio') vista('inicio');
    await cargarTodo();
  }

  // ── arranque ──────────────────────────────────────────────────────────────

  function arrancar() {
    $('#form-acceso').addEventListener('submit', enviarAcceso);
    $('#i-clave').addEventListener('input', pintarFuerza);
    sesion = recuperar();
    if (sesion?.token) { ir('app'); cargarTodo(); }
    else ir('bienvenida');
  }
  document.addEventListener('DOMContentLoaded', arrancar);

  return { ir, pestana, ojo, vista, mandar, copiar, compartir, salir, reintentar, avisar,
           _estado: () => ({ sesion, saldo, identidad, movimientos, vistaActual, modo }) };
})();
