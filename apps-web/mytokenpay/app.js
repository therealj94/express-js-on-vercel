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
  // A donde se manda a alguien que quiere verificarse.
  //
  // Antes era https://genesis-id.onrender.com, que NO es una pagina para el
  // publico: es el panel de cumplimiento del equipo. Quien pulsaba «Empezar la
  // verificacion» aterrizaba en un formulario de Correo y Contraseña de
  // operador, escribia los suyos, y el servidor lo rechazaba —con razon: no es
  // operador— sin que nada le explicara por que. La pagina de Genesis ID de
  // Veta Wallet si esta escrita para el publico y explica el tramite entero.
  const GENESIS_WEB = 'https://www.vetawallet.com/genesis-id';

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
    for (const id of ['portada', 'acceso', 'app']) $('#' + id).classList.toggle('oculto', id !== (destino === 'bienvenida' ? 'portada' : destino));
    $('#techo').classList.toggle('oculto', destino !== 'bienvenida');
    if (destino === 'acceso') { pestana(cual || 'crear'); setTimeout(() => $('#i-correo').focus(), 60); }
    if (destino === 'app') vista(vistaActual);
    window.scrollTo(0, 0);
  }

  function pestana(cual) {
    modo = cual;
    $('#tab-entrar').setAttribute('aria-selected', String(cual === 'entrar'));
    $('#tab-crear').setAttribute('aria-selected', String(cual === 'crear'));
    $('#campo-nombre').classList.toggle('oculto', cual !== 'crear');
    $('#btn-acceso').textContent = cual === 'crear' ? t('acc.btnCrear') : t('acc.btnEntrar');
    $('#acc-tit').textContent = cual === 'crear' ? t('acc.titCrear') : t('acc.titEntrar');
    $('#acc-sub').textContent = t(cual === 'crear' ? 'acc.subCrear' : 'acc.subEntrar');
    $('#i-clave').setAttribute('autocomplete', cual === 'crear' ? 'new-password' : 'current-password');
    $('#acc-aviso').classList.add('oculto');
  }


  /* Cambiar de idioma en caliente. Las vistas se generan enteras cada vez que se
     navega, asi que basta con repintar los textos fijos y volver a dibujar la
     vista actual: no queda nada a medio traducir. */
  function idioma(cual) {
    if (cual !== 'es' && cual !== 'en') return;
    idiomaActual = cual;
    try { localStorage.setItem('mtp.idioma', cual); } catch {}
    pintarIdioma();
    pintarCifras();
    if (!$('#acceso').classList.contains('oculto')) pestana(modo);
    if (!$('#app').classList.contains('oculto')) vista(vistaActual);
  }

  const pintarCifras = () => {
    const c = $('#bv-cifras');
    if (c) c.innerHTML = [[COMERCIOS.length, t('c.comercios')], [verificados(), t('c.verificados')], [PAISES.length, t('c.paises')]]
      .map(([n, l]) => `<div class="cifra"><b>${n}</b><small>${l}</small></div>`).join('');
  };

  /* La calle de la portada: los rotulos del directorio pasando de largo, en dos
     columnas que corren en sentidos opuestos. Cada tira lleva los comercios dos
     veces seguidas porque la animacion desplaza justo la mitad de su altura: al
     llegar al final, la segunda copia esta exactamente donde estaba la primera y
     el salto no se ve. */
  function pintarCalle() {
    const c = $('#calle');
    if (!c) return;
    const rotulo = m => `<div class="mini" style="--neon:${neon(m.cat)}">
      <b>${esc(m.nombre)}</b><small>${esc(catNom(m.cat))} · ${esc(ciudadNom(m.pais, m.ciudad))}</small></div>`;
    const mitad = Math.ceil(COMERCIOS.length / 2);
    const tira = lista => `<div class="tira">${(lista.concat(lista)).map(rotulo).join('')}</div>`;
    c.innerHTML = tira(COMERCIOS.slice(0, mitad))
      + tira(COMERCIOS.slice(mitad)).replace('class="tira"', 'class="tira b"');
  }

  /* Cada bloque del recorrido sube a su sitio al entrar en pantalla, y se queda:
     un elemento que aparece y desaparece mientras uno sube y baja no es una
     animacion, es un parpadeo. Se usa IntersectionObserver porque el navegador
     ya sabe que hay en pantalla; calcularlo en cada pixel de desplazamiento
     cuesta la fluidez de la pagina. */
  function armarRevelado() {
    const piezas = document.querySelectorAll('.rev');
    if (!('IntersectionObserver' in window)) {
      piezas.forEach(p => p.classList.add('ve'));
      return;
    }
    const ojo = new IntersectionObserver(entradas => {
      entradas.forEach(e => {
        // Tambien se revela lo que quedo POR ENCIMA de la pantalla: quien llega
        // por un enlace al final, o baja de un tiron, se saltaria media pagina
        // con bloques invisibles esperando una entrada que ya paso.
        if (!e.isIntersecting && e.boundingClientRect.top > 0) return;
        e.target.classList.add('ve');
        ojo.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
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

  function entrarComoInvitado() {
    E.invitado = true; guardar(); ir('app'); vista('explorar');
    avisar(t('ok.invitado'));
  }

  async function enviarAcceso(ev) {
    ev.preventDefault();
    const nombre = $('#i-nombre').value.trim(), correo = $('#i-correo').value.trim(), clave = $('#i-clave').value;
    const a = $('#acc-aviso');
    const decir = t => { a.textContent = t; a.className = 'aviso aviso-mal'; a.classList.remove('oculto'); };
    if (!correo || !clave) return decir(t('err.completa'));
    if (modo === 'crear' && !nombre) return decir(t('err.nombre'));
    if (modo === 'crear' && clave.length < 8) return decir(t('err.corta'));
    a.classList.add('oculto');

    const b = $('#btn-acceso'); b.disabled = true;
    const antes = b.textContent;
    b.innerHTML = '<span class="girando"></span> ' + (modo === 'crear' ? t('acc.creando') : t('acc.entrando'));
    try {
      if (API) {
        const r = await fetch(API + (modo === 'crear' ? '/api/auth/register' : '/api/auth/login'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(modo === 'crear' ? { fullName: nombre, email: correo, password: clave } : { email: correo, password: clave }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || t('err.acceso'));
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
    $('#barra-der').innerHTML =
      `<a class="btn btn-linea btn-sm" href="https://www.vetawallet.com/">${t('x.eco')}</a>
       <span class="chapa ch-rev" title="${t('x.demoP')}">${t('x.demo')}</span>
       <div class="idiomas" role="group" aria-label="Idioma">
         <button data-lang="es" aria-pressed="${idiomaActual === 'es'}" onclick="MTP.idioma('es')">ES</button>
         <button data-lang="en" aria-pressed="${idiomaActual === 'en'}" onclick="MTP.idioma('en')">EN</button>
       </div>` + (E.sesion
      ? `<span class="chapa ${E.identidad === 'verificada' ? 'ch-ok' : 'ch-rev'}">${t(E.identidad === 'verificada' ? 'x.verificado' : 'x.sinVerificar')}</span>`
      : `<button class="btn btn-neon btn-sm" onclick="MTP.ir('acceso','crear')">${t('x.crearCuenta')}</button>`);
    if (cual === 'cobro') pintarQr();
    window.scrollTo(0, 0);
  }

  const verificados = () => COMERCIOS.filter(c => c.estado === 'verified').length;

  function inicio() {
    const nom = (E.sesion?.nombre || '').split(' ')[0];
    return `
    <div class="cab">
      <h2>${E.sesion ? `${t('ini.hola')}, ${esc(nom)}` : t('ini.bienvenido')}</h2>
      <div class="sub">${t('ini.sub')}</div>
    </div>
    ${E.sesion ? tarjetaSaldo() : ''}
    <div class="rejilla" style="grid-template-columns:repeat(3,1fr);gap:10px">
      ${[[COMERCIOS.length, t('c.comercios')], [verificados(), t('c.verificados')], [PAISES.length, t('c.paises')]]
        .map(([n, l]) => `<div class="cifra"><b>${n}</b><small>${l}</small></div>`).join('')}
    </div>
    ${tarjetaBilletera()}
    ${tarjetaIdentidad()}
    <div class="bloque">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <h3>${t('ini.cerca')}</h3>
        <button class="btn btn-linea btn-sm" onclick="MTP.vista('explorar')">${t('ini.verTodos')}</button>
      </div>
      <div class="rejilla">${COMERCIOS.slice(0, 4).map(tarjetaComercio).join('')}</div>
    </div>`;
  }

  function tarjetaSaldo() {
    return `
    <div class="saldo">
      <div class="saldo-lbl">${t(E.billetera ? 'sal.conectada' : 'sal.demo')}</div>
      <div class="saldo-cifra">${oro(E.saldo)}<span>ORIGEN</span></div>
      <div class="saldo-fiat">${esc(usd(E.saldo * ORIGEN_USD))} · 1 ORIGEN = ${esc(usd(ORIGEN_USD))}</div>
      <div style="margin-top:18px;display:flex;gap:9px;flex-wrap:wrap">
        <button class="btn btn-neon btn-sm" onclick="MTP.vista('pagar')">${t('sal.pagar')}</button>
        ${E.billetera ? '' : `<button class="btn btn-linea btn-sm" onclick="MTP.vista('billetera')">${t('sal.conectar')}</button>`}
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
        <span class="chapa ${abierto ? 'ch-ok' : 'ch-rev'}">${t(abierto ? 'x.verificado' : 'x.enRevision')}</span>
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
      <h2>${t('exp.t')}</h2>
      <div class="sub">${lista.length} ${t('exp.sub1')} ${COMERCIOS.length} ${t('exp.sub2')}</div>
    </div>
    <input class="buscar" id="buscar" placeholder="${t('exp.buscar')}" value="${esc(filtro.texto)}"
      oninput="MTP.buscar(this.value)" autocomplete="off">
    <div class="filtros">
      <button class="pastilla" aria-pressed="${!filtro.pais}" onclick="MTP.filtrarPais(null)">${t('exp.todosPaises')}</button>
      ${PAISES.map(p => `<button class="pastilla" aria-pressed="${filtro.pais === p.slug}" onclick="MTP.filtrarPais('${p.slug}')">${p.flag} ${esc(p.label)}</button>`).join('')}
    </div>
    <div class="filtros" style="margin-top:8px">
      <button class="pastilla" aria-pressed="${!filtro.cat}" onclick="MTP.filtrarCat(null)">${t('exp.todosRubros')}</button>
      ${usadas.map(s => `<button class="pastilla" aria-pressed="${filtro.cat === s}" onclick="MTP.filtrarCat('${s}')">${esc(catNom(s))}</button>`).join('')}
    </div>
    ${lista.length
      ? `<div class="rejilla">${lista.map(tarjetaComercio).join('')}</div>`
      : `<div class="bloque"><div class="vacio"><b>${t('exp.vacioT')}</b>${t('exp.vacioP')}</div></div>`}`;
  }

  function buscar(v) { filtro.texto = v; const f = document.activeElement === $('#buscar'); vista('explorar'); if (f) { const i = $('#buscar'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  function filtrarCat(s) { filtro.cat = s; vista('explorar'); }
  function filtrarPais(s) { filtro.pais = s; vista('explorar'); }

  function comercio() {
    const c = COMERCIOS.find(x => x.id === verComercio);
    if (!c) return `<div class="bloque"><div class="vacio"><b>${t('com.noT')}</b>${t('com.noP')}</div></div>`;
    const redes = Object.entries(c.redes || {}).filter(([, v]) => v);
    return `
    <button class="btn btn-linea btn-sm" style="margin-bottom:16px" onclick="MTP.vista('explorar')">${t('x.volver')}</button>
    <div class="ficha-top" style="--neon:${neon(c.cat)}">
      <div class="r-cat">${esc(catNom(c.cat))}</div>
      <h2>${esc(c.nombre)}</h2>
      <div class="r-pie" style="margin-top:10px">
        <span class="chapa ${c.estado === 'verified' ? 'ch-ok' : 'ch-rev'}">${t(c.estado === 'verified' ? 'x.verificado' : 'x.enRevision')}</span>
        <span>${esc(c.dir)} · ${esc(ciudadNom(c.pais, c.ciudad))}, ${esc(paisNom(c.pais))}</span>
      </div>
      <p style="margin-top:16px;color:var(--niebla);line-height:1.65;font-size:14.5px">${esc(c.desc)}</p>
      ${c.ofrece?.length ? `<div class="lista-p">${c.ofrece.map(o => `<span>${esc(o)}</span>`).join('')}</div>` : ''}
      <div style="margin-top:20px;display:flex;gap:9px;flex-wrap:wrap">
        <button class="btn btn-neon btn-sm" onclick="MTP.pagarA('${c.id}')">${t('com.pagarAqui')}</button>
        <a class="btn btn-linea btn-sm" href="https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}" target="_blank" rel="noopener">${t('com.comoLlegar')}</a>
      </div>
    </div>
    ${redes.length ? `<div class="bloque"><h3>${t('com.tambien')}</h3>
      <div class="lista-p">${redes.map(([k, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener"><span>${esc(k)}</span></a>`).join('')}</div></div>` : ''}
    <div class="bloque">
      <h3>${t('com.razon')}</h3>
      <p class="pie">${esc(c.razon)}</p>
    </div>`;
  }

  function pagar() {
    if (!E.sesion) return `
      <div class="cab"><h2>${t('pag.t')}</h2><div class="sub">${t('pag.sub')}</div></div>
      <div class="bloque"><div class="vacio">
        <b>${t('pag.necesitaT')}</b>${t('pag.necesitaP')}
        <div style="margin-top:16px"><button class="btn btn-neon btn-sm" onclick="MTP.ir('acceso','crear')">${t('bv.crear')}</button></div>
      </div></div>`;
    return `
    <div class="cab"><h2>${t('pag.t')}</h2><div class="sub">${t('pag.sub')}</div></div>
    ${tarjetaSaldo()}
    <div class="bloque">
      <h3>${t('pag.quien')}</h3>
      <p class="pie">${t('pag.quienP')}</p>
      <div class="rejilla">${COMERCIOS.filter(c => c.estado === 'verified').slice(0, 6).map(c => `
        <button class="rotulo" style="--neon:${neon(c.cat)}" onclick="MTP.pagarA('${c.id}')">
          <div class="r-top"><div class="r-ini">${esc(c.nombre.trim()[0])}</div>
            <div style="flex:1;min-width:0"><div class="r-nom">${esc(c.nombre)}</div>
            <div class="r-cat">${esc(ciudadNom(c.pais, c.ciudad))}</div></div></div>
        </button>`).join('')}</div>
    </div>
    ${E.pagos.length ? `<div class="bloque"><h3>${t('pag.tus')}</h3>${E.pagos.slice(0, 8).map(p => `
      <div class="hilera"><div class="txt"><b>${esc(p.comercio)}</b><small>${esc(cuando(p.fecha))}</small></div>
      <div class="val">−${oro(p.origen)} ORIGEN</div></div>`).join('')}</div>` : ''}`;
  }

  function pagarA(id) { cobro = { monto: '', comercio: id }; vista('cobro'); }

  function vCobro() {
    const c = COMERCIOS.find(x => x.id === cobro.comercio);
    const monto = Number(cobro.monto || 0);
    const cadena = `mtp://pago?comercio=${cobro.comercio}&origen=${monto || 0}`;
    return `
    <button class="btn btn-linea btn-sm" style="margin-bottom:16px" onclick="MTP.vista('pagar')">${t('x.volver')}</button>
    <div class="cab"><h2>${t('cob.a')} ${esc(c?.nombre || t('cob.unComercio'))}</h2>
      <div class="sub">${t('cob.tenes')} ${oro(E.saldo)} ${t('cob.disp')}</div></div>
    <div class="bloque">
      <div class="monto-grande">${cobro.monto || '0'}<span>ORIGEN</span></div>
      <div style="text-align:center;color:var(--niebla);margin-top:6px">${esc(usd(monto * ORIGEN_USD))}</div>
      <div class="tecla">
        ${['1','2','3','4','5','6','7','8','9','.','0','←'].map(t =>
          `<button onclick="MTP.tecla('${t}')">${t}</button>`).join('')}
      </div>
      <div style="margin-top:18px"><button class="btn btn-neon btn-full" onclick="MTP.confirmarPago()" ${monto > 0 ? '' : 'disabled'}>${t('cob.pagar')} ${monto > 0 ? oro(monto) + ' ORIGEN' : ''}</button></div>
    </div>
    <div class="bloque" style="text-align:center">
      <h3>${t('cob.oCodigo')}</h3>
      <p class="pie">${t('cob.oCodigoP')}</p>
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
    if (!(monto > 0)) return avisar(t('cob.escribi'));
    if (monto > E.saldo) return avisar(`${t('cob.noAlcanza')} ${oro(E.saldo)} ORIGEN.`);
    E.saldo -= monto;
    E.pagos.unshift({ comercio: c?.nombre || 'Comercio', origen: monto, fecha: new Date().toISOString() });
    guardar();
    avisar(`${t('cob.pagaste')} ${oro(monto)} ORIGEN ${t('cob.en')} ${c?.nombre || t('cob.unComercio')}`);
    cobro = { monto: '', comercio: null };
    vista('pagar');
  }

  function tarjetaBilletera() {
    if (!E.sesion) return '';
    return `
    <div class="bloque">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div><h3>${t('w.t')}</h3>
          <p class="pie">${E.billetera
            ? `${t('w.conectadaP')} · <span class="mono">${esc(E.billetera.valor.slice(0, 10))}…${esc(E.billetera.valor.slice(-6))}</span>`
            : t('w.sinP')}</p></div>
        <button class="btn ${E.billetera ? 'btn-linea' : 'btn-neon'} btn-sm" onclick="MTP.vista('billetera')">${t(E.billetera ? 'w.cambiar' : 'w.conectar')}</button>
      </div>
    </div>`;
  }

  function billetera() {
    return `
    <button class="btn btn-linea btn-sm" style="margin-bottom:16px" onclick="MTP.vista('cuenta')">${t('x.volver')}</button>
    <div class="cab"><h2>${t('w.t')}</h2><div class="sub">${t('w.sub')}</div></div>
    <div class="bloque">
      ${E.billetera ? `
        <h3>${t('w.conectadaT')}</h3>
        <p class="pie mono" style="margin-top:8px">${esc(t(E.billetera.tipo === 'address' ? 'w.dir' : 'w.uid'))}: ${esc(E.billetera.valor)}</p>
        <div style="margin-top:16px;display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn btn-linea btn-sm" onclick="MTP.desconectar()">${t('w.desconectar')}</button>
          <a class="btn btn-linea btn-sm" href="${VETA_WEB}" target="_blank" rel="noopener">${t('w.abrir')}</a>
        </div>` : `
        <h3>${t('w.conectaT')}</h3>
        <p class="pie">${t('w.conectaP')}</p>
        <div class="seg" style="margin-top:16px">
          <button role="tab" id="w-address" aria-selected="true" onclick="MTP.tipoBilletera('address')">${t('w.dir')}</button>
          <button role="tab" id="w-uid" aria-selected="false" onclick="MTP.tipoBilletera('uid')">${t('w.uid')}</button>
        </div>
        <div class="campo"><label for="w-valor" id="w-lbl">${t('w.dirLbl')}</label>
          <input id="w-valor" class="mono" placeholder="0x…" autocomplete="off" spellcheck="false"></div>
        <div id="w-aviso" class="aviso oculto" role="alert"></div>
        <button class="btn btn-neon btn-full" onclick="MTP.conectar()">${t('w.conectar')}</button>
        <p class="pie" style="margin-top:14px">${t('w.noTenes')} <a href="${VETA_WEB}" target="_blank" rel="noopener" style="color:var(--cian)">${t('w.abriGratis')}</a>.</p>`}
    </div>`;
  }

  let tipoW = 'address';
  function tipoBilletera(tipo) {
    tipoW = tipo;
    $('#w-address').setAttribute('aria-selected', String(tipo === 'address'));
    $('#w-uid').setAttribute('aria-selected', String(tipo === 'uid'));
    $('#w-lbl').textContent = t(tipo === 'address' ? 'w.dirLbl' : 'w.uidLbl');
    $('#w-valor').placeholder = tipo === 'address' ? '0x…' : 'VW-…';
    $('#w-valor').focus();
  }
  function conectar() {
    const v = $('#w-valor').value.trim(), a = $('#w-aviso');
    const decir = t => { a.textContent = t; a.className = 'aviso aviso-mal'; a.classList.remove('oculto'); };
    if (tipoW === 'address' && !/^0x[a-fA-F0-9]{40}$/.test(v))
      return decir(t('w.eDir'));
    if (tipoW === 'uid' && v.length < 6) return decir(t('w.eUid'));
    E.billetera = { tipo: tipoW, valor: v }; guardar();
    avisar(t('w.ok')); vista('cuenta');
  }
  function desconectar() { E.billetera = null; guardar(); avisar(t('w.fuera')); vista('billetera'); }

  function tarjetaIdentidad() {
    if (!E.sesion) return '';
    const v = E.identidad === 'verificada', rev = E.identidad === 'en-revision';
    return `
    <div class="bloque">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div><h3>Genesis ID <span class="chapa ${v ? 'ch-ok' : 'ch-rev'}">${t(v ? 'x.verificado' : rev ? 'x.enRevision' : 'x.sinVerificar')}</span></h3>
          <p class="pie">${t(v ? 'g.verT' : rev ? 'g.revT' : 'g.noT')}</p></div>
        ${v ? '' : `<button class="btn btn-neon btn-sm" onclick="MTP.vista('identidad')">${t(rev ? 'g.verEstado' : 'g.verificar')}</button>`}
      </div>
    </div>`;
  }

  function vIdentidad() {
    const pasos = [1, 2, 3, 4].map(n => [t(`g.p${n}t`), t(`g.p${n}p`)]);
    return `
    <button class="btn btn-linea btn-sm" style="margin-bottom:16px" onclick="MTP.vista('cuenta')">${t('x.volver')}</button>
    <div class="cab"><h2>${t('g.t')}</h2><div class="sub">${t('g.sub')}</div></div>
    <div class="bloque">
      <h3>${t('g.unaT')}</h3>
      <p class="pie">${t('g.unaP')}</p>
      <div style="margin-top:16px">
        ${pasos.map(([t, s], i) => `<div class="hilera">
          <div class="r-ini" style="--neon:var(--cian);width:32px;height:32px;font-size:14px">${i + 1}</div>
          <div class="txt"><b>${t}</b><small>${s}</small></div></div>`).join('')}
      </div>
      <div style="margin-top:20px">
        <a class="btn btn-neon btn-full" href="${GENESIS_WEB}" target="_blank" rel="noopener">${t('g.empezar')}</a>
      </div>
      <p class="pie" style="margin-top:14px">${t('g.nota')}</p>
    </div>`;
  }

  function cuenta() {
    if (!E.sesion) return `
      <div class="cab"><h2>${t('cta.t')}</h2></div>
      <div class="bloque"><div class="vacio">
        <b>${t('cta.sinT')}</b>${t('cta.sinP')}
        <div style="margin-top:16px;display:flex;gap:9px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-neon btn-sm" onclick="MTP.ir('acceso','crear')">${t('bv.crear')}</button>
          <button class="btn btn-linea btn-sm" onclick="MTP.ir('acceso','entrar')">${t('cta.yaTengo')}</button>
        </div>
      </div></div>`;
    return `
    <div class="cab"><h2>${t('cta.t')}</h2><div class="sub">${esc(E.sesion.correo)}</div></div>
    ${tarjetaIdentidad()}
    ${tarjetaBilletera()}
    <div class="bloque">
      <h3>${t('cta.datos')}</h3>
      <div class="hilera"><div class="txt"><b>${t('cta.nombre')}</b><small>${esc(E.sesion.nombre)}</small></div></div>
      <div class="hilera"><div class="txt"><b>${t('cta.correo')}</b><small>${esc(E.sesion.correo)}</small></div></div>
    </div>
    <div class="bloque">
      <h3>${t('cta.negT')}</h3>
      <p class="pie">${t('cta.negP')}</p>
      <div style="margin-top:14px"><button class="btn btn-linea btn-sm" onclick="MTP.avisar(t('cta.negAviso'))">${t('cta.negBtn')}</button></div>
    </div>
    <div class="bloque">
      <h3>${t('cta.salirT')}</h3>
      <p class="pie">${t('cta.salirP')}</p>
      <div style="margin-top:14px"><button class="btn btn-linea btn-sm" onclick="MTP.salir()">${t('cta.salirT')}</button></div>
    </div>`;
  }

  // ── arranque ──────────────────────────────────────────────────────────────

  function arrancar() {
    $('#form-acceso').addEventListener('submit', enviarAcceso);
    pintarIdioma();
    pintarCifras();
    pintarCalle();
    armarRevelado();
    const g = recuperar();
    if (g) E = { ...E, ...g };
    if (E.sesion || E.invitado) { ir('app'); vista(E.sesion ? 'inicio' : 'explorar'); }
    else ir('bienvenida');
  }
  document.addEventListener('DOMContentLoaded', arrancar);

  return { ir, pestana, vista, buscar, idioma, filtrarCat, filtrarPais, pagarA, tecla, confirmarPago,
           tipoBilletera, conectar, desconectar, salir, avisar, entrarComoInvitado,
           _estado: () => E };
})();
