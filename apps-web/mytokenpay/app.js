/* MyTokenPay · web
 *
 * Es la aplicación del teléfono llevada al navegador: mismas pantallas, mismo
 * directorio de comercios, misma conexión con Veta Wallet y con Genesis ID.
 *
 * La cuenta, la billetera conectada y los pagos viven en este navegador,
 * igual que en la app viven en el teléfono mientras no haya un servidor
 * publicado. `API` de abajo es el único sitio donde hay que tocar cuando lo
 * haya: el resto del archivo no distingue de dónde salen los datos.
 */

const MTP = (() => {
  'use strict';

  const API = null;                     // sin backend publicado todavía
  const ORIGEN_USD = 2.35;              // 1 ORIGEN = 1/55 de gramo de oro
  const LLAVE = 'mtp.estado';
  const VETA_WEB = 'https://www.vetawallet.com';
  const GENESIS_WEB = 'https://genesis-id.onrender.com';

  // El neón de cada categoría. Los tres colores de la marca se reparten por
  // familias de negocio para que la lista se lea como una calle y no como una
  // tabla: comer en magenta, dormir y moverse en azul, cuidarse en cian.
  const NEON = {
    restaurantes: '#C266F5', cafeterias: '#C266F5', 'vida-nocturna': '#C266F5',
    supermercados: '#C266F5', conveniencia: '#C266F5',
    hoteles: '#4C6EF0', turismo: '#4C6EF0', automotriz: '#4C6EF0', servicios: '#4C6EF0',
    gimnasios: '#4FF0FF', belleza: '#4FF0FF', salud: '#4FF0FF',
    educacion: '#34D399', moda: '#FBBF24', tecnologia: '#FBBF24',
  };
  const neon = c => NEON[c] || '#C266F5';

  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const catNom = s => (CATEGORIAS.find(c => c.slug === s) || {}).label || s;
  const paisNom = s => (PAISES.find(p => p.slug === s) || {}).label || s;
  const ciudadNom = (p, c) => ((CIUDADES[p] || []).find(x => x.slug === c) || {}).label || c;

  let E = {                             // todo el estado, en un solo sitio
    sesion: null,                       // { nombre, correo }
    invitado: false,
    billetera: null,                    // { tipo: 'address'|'uid', valor }
    identidad: 'sin-iniciar',
    saldo: 120,                         // saldo de demostración, como en la app
    pagos: [],
  };
  let vistaActual = 'inicio', modo = 'crear', filtro = { cat: null, pais: null, texto: '' }, verComercio = null;
  let cobro = { monto: '', comercio: null };

  const guardar = () => { try { localStorage.setItem(LLAVE, JSON.stringify(E)); } catch {} };
  const recuperar = () => { try { return JSON.parse(localStorage.getItem(LLAVE) || 'null'); } catch { return null; } };

  const nfO = new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfU = new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'USD' });
  const oro = n => nfO.format(Number(n) || 0);
  const usd = n => nfU.format(Number(n) || 0);
  const cuando = iso => {
    const t = new Date(iso); if (isNaN(t)) return '';
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'recién'; if (m < 60) return `hace ${m} min`;
    if (m < 1440) return `hace ${Math.round(m / 60)} h`;
    return t.toLocaleDateString('es-HN', { day: 'numeric', month: 'short' });
  };

  let relojT;
  function avisar(t) {
    const e = $('#tostada'); e.textContent = t; e.classList.add('ver');
    clearTimeout(relojT); relojT = setTimeout(() => e.classList.remove('ver'), 3000);
  }

  // ── navegación ────────────────────────────────────────────────────────────

  function ir(destino, cual) {
    for (const id of ['bienvenida', 'acceso', 'app']) $('#' + id).classList.toggle('oculto', id !== destino);
    if (destino === 'acceso') { pestana(cual || 'crear'); setTimeout(() => $('#i-correo').focus(), 60); }
    if (destino === 'app') vista(vistaActual);
    window.scrollTo(0, 0);
  }

  function pestana(cual) {
    modo = cual;
    $('#tab-entrar').setAttribute('aria-selected', String(cual === 'entrar'));
    $('#tab-crear').setAttribute('aria-selected', String(cual === 'crear'));
    $('#campo-nombre').classList.toggle('oculto', cual !== 'crear');
    $('#btn-acceso').textContent = cual === 'crear' ? 'Crear mi cuenta' : 'Entrar';
    $('#acc-tit').textContent = cual === 'crear' ? 'Creá tu cuenta' : 'Entrá a tu cuenta';
    $('#acc-sub').textContent = cual === 'crear'
      ? 'Gratis. Con Genesis ID quedás verificado en todo el ecosistema.'
      : 'Con el mismo correo que usás en la app.';
    $('#i-clave').setAttribute('autocomplete', cual === 'crear' ? 'new-password' : 'current-password');
    $('#acc-aviso').classList.add('oculto');
  }

  function entrarComoInvitado() {
    E.invitado = true; guardar(); ir('app'); vista('explorar');
    avisar('Estás mirando sin cuenta. Creá una para pagar.');
  }

  async function enviarAcceso(ev) {
    ev.preventDefault();
    const nombre = $('#i-nombre').value.trim(), correo = $('#i-correo').value.trim(), clave = $('#i-clave').value;
    const a = $('#acc-aviso');
    const decir = t => { a.textContent = t; a.className = 'aviso aviso-mal'; a.classList.remove('oculto'); };
    if (!correo || !clave) return decir('Completá el correo y la contraseña.');
    if (modo === 'crear' && !nombre) return decir('Escribí tu nombre completo.');
    if (modo === 'crear' && clave.length < 8) return decir('La contraseña necesita al menos 8 caracteres.');
    a.classList.add('oculto');

    const b = $('#btn-acceso'); b.disabled = true;
    const antes = b.textContent;
    b.innerHTML = '<span class="girando"></span> ' + (modo === 'crear' ? 'Creando…' : 'Entrando…');
    try {
      if (API) {
        const r = await fetch(API + (modo === 'crear' ? '/api/auth/register' : '/api/auth/login'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(modo === 'crear' ? { fullName: nombre, email: correo, password: clave } : { email: correo, password: clave }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'No pudimos completar el acceso.');
        E.sesion = { nombre: d.user?.fullName || nombre || correo.split('@')[0], correo: d.user?.email || correo };
      } else {
        E.sesion = { nombre: nombre || correo.split('@')[0], correo };
      }
      E.invitado = false;
      guardar(); ir('app'); vista('inicio');
      avisar(`Hola, ${E.sesion.nombre.split(' ')[0]}`);
    } catch (e) {
      decir(e.message); b.disabled = false; b.textContent = antes;
    }
  }

  function salir() { E = { sesion: null, invitado: false, billetera: null, identidad: 'sin-iniciar', saldo: 120, pagos: [] }; guardar(); ir('bienvenida'); }

  // ── vistas ────────────────────────────────────────────────────────────────

  function vista(cual, arg) {
    vistaActual = cual;
    if (cual === 'comercio') verComercio = arg;
    document.querySelectorAll('.tabs button[data-vista]').forEach(b => {
      const activa = b.dataset.vista === cual || (cual === 'comercio' && b.dataset.vista === 'explorar')
        || (cual === 'cobro' && b.dataset.vista === 'pagar')
        || (['billetera', 'identidad'].includes(cual) && b.dataset.vista === 'cuenta');
      activa ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
    });
    $('#lienzo').innerHTML = ({ inicio, explorar, comercio, pagar, cobro: vCobro, cuenta, billetera, identidad: vIdentidad })[cual]();
    $('#barra-der').innerHTML = E.sesion
      ? `<span class="chapa ${E.identidad === 'verificada' ? 'ch-ok' : 'ch-rev'}">${E.identidad === 'verificada' ? 'Verificado' : 'Sin verificar'}</span>`
      : `<button class="btn btn-neon btn-sm" onclick="MTP.ir('acceso','crear')">Crear cuenta</button>`;
    if (cual === 'cobro') pintarQr();
    window.scrollTo(0, 0);
  }

  const verificados = () => COMERCIOS.filter(c => c.estado === 'verified').length;

  function inicio() {
    const nom = (E.sesion?.nombre || '').split(' ')[0];
    return `
    <div class="cab">
      <h2>${E.sesion ? `Hola, ${esc(nom)}` : 'Bienvenido'}</h2>
      <div class="sub">Capa de comercio del Sistema Financiero Social</div>
    </div>
    ${E.sesion ? tarjetaSaldo() : ''}
    <div class="rejilla" style="grid-template-columns:repeat(3,1fr);gap:10px">
      ${[[COMERCIOS.length, 'Comercios'], [verificados(), 'Verificados'], [PAISES.length, 'Países']]
        .map(([n, l]) => `<div class="cifra"><b>${n}</b><small>${l}</small></div>`).join('')}
    </div>
    ${tarjetaBilletera()}
    ${tarjetaIdentidad()}
    <div class="bloque">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <h3>Cerca de vos</h3>
        <button class="btn btn-linea btn-sm" onclick="MTP.vista('explorar')">Ver todos</button>
      </div>
      <div class="rejilla">${COMERCIOS.slice(0, 4).map(tarjetaComercio).join('')}</div>
    </div>`;
  }

  function tarjetaSaldo() {
    return `
    <div class="saldo">
      <div class="saldo-lbl">${E.billetera ? 'Veta Wallet conectada' : 'Saldo de demostración'}</div>
      <div class="saldo-cifra">${oro(E.saldo)}<span>ORIGEN</span></div>
      <div class="saldo-fiat">${esc(usd(E.saldo * ORIGEN_USD))} · 1 ORIGEN = ${esc(usd(ORIGEN_USD))}</div>
      <div style="margin-top:18px;display:flex;gap:9px;flex-wrap:wrap">
        <button class="btn btn-neon btn-sm" onclick="MTP.vista('pagar')">Pagar</button>
        ${E.billetera ? '' : `<button class="btn btn-linea btn-sm" onclick="MTP.vista('billetera')">Conectar Veta Wallet</button>`}
      </div>
    </div>`;
  }

  function tarjetaComercio(c) {
    const abierto = c.estado === 'verified';
    return `
    <button class="rotulo ${abierto ? '' : 'apagado'}" style="--neon:${neon(c.cat)}" onclick="MTP.vista('comercio','${c.id}')">
      <div class="r-top">
        <div class="r-ini">${esc(c.nombre.trim()[0] || '·')}</div>
        <div style="flex:1;min-width:0">
          <div class="r-nom">${esc(c.nombre)}</div>
          <div class="r-cat">${esc(catNom(c.cat))} · ${esc(ciudadNom(c.pais, c.ciudad))}</div>
        </div>
      </div>
      <div class="r-desc">${esc(c.desc)}</div>
      <div class="r-pie">
        <span class="chapa ${abierto ? 'ch-ok' : 'ch-rev'}">${abierto ? 'Verificado' : 'En revisión'}</span>
        <span>${esc(paisNom(c.pais))}</span>
      </div>
    </button>`;
  }

  function explorar() {
    const lista = COMERCIOS.filter(c =>
      (!filtro.cat || c.cat === filtro.cat) &&
      (!filtro.pais || c.pais === filtro.pais) &&
      (!filtro.texto || (c.nombre + ' ' + c.desc + ' ' + c.dir).toLowerCase().includes(filtro.texto.toLowerCase())));
    const usadas = [...new Set(COMERCIOS.map(c => c.cat))];
    return `
    <div class="cab">
      <h2>Explorar</h2>
      <div class="sub">${lista.length} de ${COMERCIOS.length} comercios aceptan ORIGEN</div>
    </div>
    <input class="buscar" id="buscar" placeholder="Buscar por nombre, ciudad o rubro" value="${esc(filtro.texto)}"
      oninput="MTP.buscar(this.value)" autocomplete="off">
    <div class="filtros">
      <button class="pastilla" aria-pressed="${!filtro.pais}" onclick="MTP.filtrarPais(null)">Todos los países</button>
      ${PAISES.map(p => `<button class="pastilla" aria-pressed="${filtro.pais === p.slug}" onclick="MTP.filtrarPais('${p.slug}')">${p.flag} ${esc(p.label)}</button>`).join('')}
    </div>
    <div class="filtros" style="margin-top:8px">
      <button class="pastilla" aria-pressed="${!filtro.cat}" onclick="MTP.filtrarCat(null)">Todos los rubros</button>
      ${usadas.map(s => `<button class="pastilla" aria-pressed="${filtro.cat === s}" onclick="MTP.filtrarCat('${s}')">${esc(catNom(s))}</button>`).join('')}
    </div>
    ${lista.length
      ? `<div class="rejilla">${lista.map(tarjetaComercio).join('')}</div>`
      : `<div class="bloque"><div class="vacio"><b>No encontramos comercios así</b>Probá con otro rubro, otro país o menos palabras.</div></div>`}`;
  }

  function buscar(v) { filtro.texto = v; const f = document.activeElement === $('#buscar'); vista('explorar'); if (f) { const i = $('#buscar'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  function filtrarCat(s) { filtro.cat = s; vista('explorar'); }
  function filtrarPais(s) { filtro.pais = s; vista('explorar'); }

  function comercio() {
    const c = COMERCIOS.find(x => x.id === verComercio);
    if (!c) return `<div class="bloque"><div class="vacio"><b>Ese comercio ya no está</b>Volvé al directorio.</div></div>`;
    const redes = Object.entries(c.redes || {}).filter(([, v]) => v);
    return `
    <button class="btn btn-linea btn-sm" style="margin-bottom:16px" onclick="MTP.vista('explorar')">← Volver</button>
    <div class="ficha-top" style="--neon:${neon(c.cat)}">
      <div class="r-cat">${esc(catNom(c.cat))}</div>
      <h2>${esc(c.nombre)}</h2>
      <div class="r-pie" style="margin-top:10px">
        <span class="chapa ${c.estado === 'verified' ? 'ch-ok' : 'ch-rev'}">${c.estado === 'verified' ? 'Verificado' : 'En revisión'}</span>
        <span>${esc(c.dir)} · ${esc(ciudadNom(c.pais, c.ciudad))}, ${esc(paisNom(c.pais))}</span>
      </div>
      <p style="margin-top:16px;color:var(--niebla);line-height:1.65;font-size:14.5px">${esc(c.desc)}</p>
      ${c.ofrece?.length ? `<div class="lista-p">${c.ofrece.map(o => `<span>${esc(o)}</span>`).join('')}</div>` : ''}
      <div style="margin-top:20px;display:flex;gap:9px;flex-wrap:wrap">
        <button class="btn btn-neon btn-sm" onclick="MTP.pagarA('${c.id}')">Pagar aquí</button>
        <a class="btn btn-linea btn-sm" href="https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}" target="_blank" rel="noopener">Cómo llegar</a>
      </div>
    </div>
    ${redes.length ? `<div class="bloque"><h3>Encontralos también en</h3>
      <div class="lista-p">${redes.map(([k, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener"><span>${esc(k)}</span></a>`).join('')}</div></div>` : ''}
    <div class="bloque">
      <h3>Razón social</h3>
      <p class="pie">${esc(c.razon)}</p>
    </div>`;
  }

  function pagar() {
    if (!E.sesion) return `
      <div class="cab"><h2>Pagar</h2><div class="sub">Pagá con ORIGEN en segundos</div></div>
      <div class="bloque"><div class="vacio">
        <b>Necesitás una cuenta</b>Creá tu cuenta gratis para pagar en los comercios afiliados.
        <div style="margin-top:16px"><button class="btn btn-neon btn-sm" onclick="MTP.ir('acceso','crear')">Crear mi cuenta</button></div>
      </div></div>`;
    return `
    <div class="cab"><h2>Pagar</h2><div class="sub">Elegí el comercio y enviá ORIGEN al instante</div></div>
    ${tarjetaSaldo()}
    <div class="bloque">
      <h3>¿A quién le pagás?</h3>
      <p class="pie">Elegí un comercio del directorio. En el teléfono además podés escanear su código.</p>
      <div class="rejilla">${COMERCIOS.filter(c => c.estado === 'verified').slice(0, 6).map(c => `
        <button class="rotulo" style="--neon:${neon(c.cat)}" onclick="MTP.pagarA('${c.id}')">
          <div class="r-top"><div class="r-ini">${esc(c.nombre.trim()[0])}</div>
            <div style="flex:1;min-width:0"><div class="r-nom">${esc(c.nombre)}</div>
            <div class="r-cat">${esc(ciudadNom(c.pais, c.ciudad))}</div></div></div>
        </button>`).join('')}</div>
    </div>
    ${E.pagos.length ? `<div class="bloque"><h3>Tus pagos</h3>${E.pagos.slice(0, 8).map(p => `
      <div class="hilera"><div class="txt"><b>${esc(p.comercio)}</b><small>${esc(cuando(p.fecha))}</small></div>
      <div class="val">−${oro(p.origen)} ORIGEN</div></div>`).join('')}</div>` : ''}`;
  }

  function pagarA(id) { cobro = { monto: '', comercio: id }; vista('cobro'); }

  function vCobro() {
    const c = COMERCIOS.find(x => x.id === cobro.comercio);
    const monto = Number(cobro.monto || 0);
    const cadena = `mtp://pago?comercio=${cobro.comercio}&origen=${monto || 0}`;
    return `
    <button class="btn btn-linea btn-sm" style="margin-bottom:16px" onclick="MTP.vista('pagar')">← Volver</button>
    <div class="cab"><h2>Pagar a ${esc(c?.nombre || 'un comercio')}</h2>
      <div class="sub">Tenés ${oro(E.saldo)} ORIGEN disponibles</div></div>
    <div class="bloque">
      <div class="monto-grande">${cobro.monto || '0'}<span>ORIGEN</span></div>
      <div style="text-align:center;color:var(--niebla);margin-top:6px">${esc(usd(monto * ORIGEN_USD))}</div>
      <div class="tecla">
        ${['1','2','3','4','5','6','7','8','9','.','0','←'].map(t =>
          `<button onclick="MTP.tecla('${t}')">${t}</button>`).join('')}
      </div>
      <div style="margin-top:18px"><button class="btn btn-neon btn-full" onclick="MTP.confirmarPago()" ${monto > 0 ? '' : 'disabled'}>Pagar ${monto > 0 ? oro(monto) + ' ORIGEN' : ''}</button></div>
    </div>
    <div class="bloque" style="text-align:center">
      <h3>O mostrale este código</h3>
      <p class="pie">El comercio lo escanea desde su MyTokenPay y cobra sin que tengas que dictar nada.</p>
      <div class="qr-caja" id="qr-caja" data-cadena="${esc(cadena)}"></div>
    </div>`;
  }

  function tecla(t) {
    if (t === '←') cobro.monto = cobro.monto.slice(0, -1);
    else if (t === '.') { if (!cobro.monto.includes('.')) cobro.monto = (cobro.monto || '0') + '.'; }
    else {
      // Dos decimales y nada más: un tercero no cambia el precio y sí rompe el
      // número grande de la pantalla.
      const p = cobro.monto.split('.');
      if (p[1]?.length >= 2) return;
      cobro.monto = (cobro.monto === '0' ? '' : cobro.monto) + t;
    }
    vista('cobro');
  }

  function pintarQr() {
    const c = $('#qr-caja'); if (!c) return;
    try { c.innerHTML = QR.svg(c.dataset.cadena, { claro: '#fff', oscuro: '#0A0812', margen: 2 }); }
    catch { c.innerHTML = '<p style="color:#0A0812;font-size:13px">No se pudo dibujar el código.</p>'; }
  }

  function confirmarPago() {
    const monto = Number(cobro.monto || 0);
    const c = COMERCIOS.find(x => x.id === cobro.comercio);
    if (!(monto > 0)) return avisar('Escribí una cantidad.');
    if (monto > E.saldo) return avisar(`No te alcanza: tenés ${oro(E.saldo)} ORIGEN.`);
    E.saldo -= monto;
    E.pagos.unshift({ comercio: c?.nombre || 'Comercio', origen: monto, fecha: new Date().toISOString() });
    guardar();
    avisar(`Pagaste ${oro(monto)} ORIGEN en ${c?.nombre || 'el comercio'}`);
    cobro = { monto: '', comercio: null };
    vista('pagar');
  }

  function tarjetaBilletera() {
    if (!E.sesion) return '';
    return `
    <div class="bloque">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div><h3>Veta Wallet</h3>
          <p class="pie">${E.billetera
            ? `Conectada · <span class="mono">${esc(E.billetera.valor.slice(0, 10))}…${esc(E.billetera.valor.slice(-6))}</span>`
            : 'Conectá tu billetera para reflejar tu saldo real de ORIGEN.'}</p></div>
        <button class="btn ${E.billetera ? 'btn-linea' : 'btn-neon'} btn-sm" onclick="MTP.vista('billetera')">${E.billetera ? 'Cambiar' : 'Conectar'}</button>
      </div>
    </div>`;
  }

  function billetera() {
    return `
    <button class="btn btn-linea btn-sm" style="margin-bottom:16px" onclick="MTP.vista('cuenta')">← Volver</button>
    <div class="cab"><h2>Veta Wallet</h2><div class="sub">Tu billetera de oro, conectada a MyTokenPay</div></div>
    <div class="bloque">
      ${E.billetera ? `
        <h3>Está conectada</h3>
        <p class="pie mono" style="margin-top:8px">${esc(E.billetera.tipo === 'address' ? 'Dirección' : 'UID')}: ${esc(E.billetera.valor)}</p>
        <div style="margin-top:16px;display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn btn-linea btn-sm" onclick="MTP.desconectar()">Desconectar</button>
          <a class="btn btn-linea btn-sm" href="${VETA_WEB}" target="_blank" rel="noopener">Abrir Veta Wallet</a>
        </div>` : `
        <h3>Conectá tu Veta Wallet</h3>
        <p class="pie">Pegá la dirección de tu billetera o el UID de tu cuenta. Los encontrás en Veta Wallet, en la pantalla de recibir.</p>
        <div class="seg" style="margin-top:16px">
          <button role="tab" id="w-address" aria-selected="true" onclick="MTP.tipoBilletera('address')">Dirección</button>
          <button role="tab" id="w-uid" aria-selected="false" onclick="MTP.tipoBilletera('uid')">UID</button>
        </div>
        <div class="campo"><label for="w-valor" id="w-lbl">Dirección de la billetera</label>
          <input id="w-valor" class="mono" placeholder="0x…" autocomplete="off" spellcheck="false"></div>
        <div id="w-aviso" class="aviso oculto" role="alert"></div>
        <button class="btn btn-neon btn-full" onclick="MTP.conectar()">Conectar</button>
        <p class="pie" style="margin-top:14px">¿Todavía no tenés? <a href="${VETA_WEB}" target="_blank" rel="noopener" style="color:var(--cian)">Abrí tu Veta Wallet gratis</a>.</p>`}
    </div>`;
  }

  let tipoW = 'address';
  function tipoBilletera(t) {
    tipoW = t;
    $('#w-address').setAttribute('aria-selected', String(t === 'address'));
    $('#w-uid').setAttribute('aria-selected', String(t === 'uid'));
    $('#w-lbl').textContent = t === 'address' ? 'Dirección de la billetera' : 'UID de tu Veta Wallet';
    $('#w-valor').placeholder = t === 'address' ? '0x…' : 'VW-…';
    $('#w-valor').focus();
  }
  function conectar() {
    const v = $('#w-valor').value.trim(), a = $('#w-aviso');
    const decir = t => { a.textContent = t; a.className = 'aviso aviso-mal'; a.classList.remove('oculto'); };
    if (tipoW === 'address' && !/^0x[a-fA-F0-9]{40}$/.test(v))
      return decir('Esa no parece una dirección de la cadena. Empieza con 0x y lleva 40 caracteres.');
    if (tipoW === 'uid' && v.length < 6) return decir('Escribí el UID completo de tu Veta Wallet.');
    E.billetera = { tipo: tipoW, valor: v }; guardar();
    avisar('Veta Wallet conectada'); vista('cuenta');
  }
  function desconectar() { E.billetera = null; guardar(); avisar('Billetera desconectada'); vista('billetera'); }

  function tarjetaIdentidad() {
    if (!E.sesion) return '';
    const v = E.identidad === 'verificada', rev = E.identidad === 'en-revision';
    return `
    <div class="bloque">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div><h3>Genesis ID <span class="chapa ${v ? 'ch-ok' : 'ch-rev'}">${v ? 'Verificada' : rev ? 'En revisión' : 'Sin verificar'}</span></h3>
          <p class="pie">${v ? 'Tu identidad vale en MyTokenPay, Veta Wallet y todo Orden Global.'
            : rev ? 'Un operador está revisando tus datos. Suele tardar menos de 24 horas.'
            : 'Verificate una vez y quedás verificado en todo el ecosistema.'}</p></div>
        ${v ? '' : `<button class="btn btn-neon btn-sm" onclick="MTP.vista('identidad')">${rev ? 'Ver estado' : 'Verificar'}</button>`}
      </div>
    </div>`;
  }

  function vIdentidad() {
    const pasos = [
      ['Tus datos', 'Nombre, fecha de nacimiento y país'],
      ['Tu documento', 'Frente y reverso de tu identificación'],
      ['Tu rostro', 'Una prueba de vida de unos segundos'],
      ['Revisión', 'Un operador de cumplimiento decide'],
    ];
    return `
    <button class="btn btn-linea btn-sm" style="margin-bottom:16px" onclick="MTP.vista('cuenta')">← Volver</button>
    <div class="cab"><h2>Genesis ID</h2><div class="sub">Identidad digital · Orden Global</div></div>
    <div class="bloque">
      <h3>Tu identidad única para todo el ecosistema</h3>
      <p class="pie">Con una sola verificación quedás verificado en MyTokenPay, en Veta Wallet y en el resto de los servicios del grupo. No hay que repetir el trámite en cada uno.</p>
      <div style="margin-top:16px">
        ${pasos.map(([t, s], i) => `<div class="hilera">
          <div class="r-ini" style="--neon:var(--cian);width:32px;height:32px;font-size:14px">${i + 1}</div>
          <div class="txt"><b>${t}</b><small>${s}</small></div></div>`).join('')}
      </div>
      <div style="margin-top:20px">
        <a class="btn btn-neon btn-full" href="${GENESIS_WEB}" target="_blank" rel="noopener">Empezar la verificación</a>
      </div>
      <p class="pie" style="margin-top:14px">La verificación la decide una persona del equipo de cumplimiento, no la aplicación. Hasta entonces tu estado queda en revisión.</p>
    </div>`;
  }

  function cuenta() {
    if (!E.sesion) return `
      <div class="cab"><h2>Mi cuenta</h2></div>
      <div class="bloque"><div class="vacio">
        <b>Estás mirando sin cuenta</b>Creala gratis para pagar, ganar puntos y guardar tus comercios.
        <div style="margin-top:16px;display:flex;gap:9px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-neon btn-sm" onclick="MTP.ir('acceso','crear')">Crear mi cuenta</button>
          <button class="btn btn-linea btn-sm" onclick="MTP.ir('acceso','entrar')">Ya tengo una</button>
        </div>
      </div></div>`;
    return `
    <div class="cab"><h2>Mi cuenta</h2><div class="sub">${esc(E.sesion.correo)}</div></div>
    ${tarjetaIdentidad()}
    ${tarjetaBilletera()}
    <div class="bloque">
      <h3>Tus datos</h3>
      <div class="hilera"><div class="txt"><b>Nombre</b><small>${esc(E.sesion.nombre)}</small></div></div>
      <div class="hilera"><div class="txt"><b>Correo</b><small>${esc(E.sesion.correo)}</small></div></div>
    </div>
    <div class="bloque">
      <h3>¿Tenés un negocio?</h3>
      <p class="pie">Registralo para aparecer en el directorio y empezar a cobrar en ORIGEN. Desde la app del teléfono podés subir tus fotos y tu ubicación.</p>
      <div style="margin-top:14px"><button class="btn btn-linea btn-sm" onclick="MTP.avisar('El registro de comercios se hace desde la app del teléfono.')">Registrar mi comercio</button></div>
    </div>
    <div class="bloque">
      <h3>Cerrar sesión</h3>
      <p class="pie">Se borra la sesión de este navegador.</p>
      <div style="margin-top:14px"><button class="btn btn-linea btn-sm" onclick="MTP.salir()">Cerrar sesión</button></div>
    </div>`;
  }

  // ── arranque ──────────────────────────────────────────────────────────────

  function arrancar() {
    $('#form-acceso').addEventListener('submit', enviarAcceso);
    $('#bv-cifras').innerHTML = [[COMERCIOS.length, 'Comercios'], [verificados(), 'Verificados'], [PAISES.length, 'Países']]
      .map(([n, l]) => `<div class="cifra"><b>${n}</b><small>${l}</small></div>`).join('');
    const g = recuperar();
    if (g) E = { ...E, ...g };
    if (E.sesion || E.invitado) { ir('app'); vista(E.sesion ? 'inicio' : 'explorar'); }
    else ir('bienvenida');
  }
  document.addEventListener('DOMContentLoaded', arrancar);

  return { ir, pestana, vista, buscar, filtrarCat, filtrarPais, pagarA, tecla, confirmarPago,
           tipoBilletera, conectar, desconectar, salir, avisar, entrarComoInvitado,
           _estado: () => E };
})();
