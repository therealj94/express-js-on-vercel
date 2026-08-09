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

  /* El puente con la telemetría. Va envuelto porque el reportero es opcional:
     si el archivo no se cargó, o no tiene clave puesta, aquí no se nota nada.
     Una billetera no puede romperse por culpa de su propia instrumentación. */
  const tele = (accion, ...args) => {
    try { window.TELEMETRIA?.[accion]?.(...args); } catch {}
  };

  let sesion = null;          // { token, correo, nombre, direccion }
  let cartera = null;         // los quince tokens, tal como los devuelve CADENA
  let errCartera = null;      // por que no se pudieron leer
  let identidad = null;       // estado de Genesis ID
  let movimientos = [];
  let tarjeta = null;         // { estado, last4, saldo… } o { falta: true }
  let movsTarjeta = [];
  let volteada = false;         // la tarjeta, de frente o de espaldas
  /* El numero, el CVV y el vencimiento viven SOLO en memoria y solo mientras
     dure la pantalla: no se guardan, no se escriben en el navegador, y se
     borran al salir de la tarjeta. Son los datos con los que se puede comprar
     en cualquier sitio del mundo. */
  let secretoTarjeta = null;
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

  async function crudo(ruta, { metodo = 'GET', cuerpo, espera = 25000, conSesion = true } = {}) {
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

  /* La sesion se renueva sola.
   *
   * Esta era la razon de que la tarjeta dijera "invalid token": el JWT del
   * backend dura poco, y esta pagina guardaba solo el token del login y no lo
   * renovaba nunca. Al vencer, TODA llamada con sesion empezaba a fallar — la
   * tarjeta, los depositos, Genesis — y desde afuera parecia un problema de la
   * tarjeta porque es lo que la gente abria despues de un rato.
   *
   * El telefono ya lo resolvia asi: guarda tambien el refreshToken y llama a
   * /auth/refresh antes de que el token venza, o al recibir un 401.
   */
  const vive = () => {
    const c = sesion?.token ? abrirToken(sesion.token) : null;
    return !!(c?.exp && c.exp * 1000 > Date.now() + 30000);
  };

  let renovando = null;
  async function renovar() {
    if (!sesion?.refresco) return false;
    // Si llegan cinco llamadas a la vez con el token vencido, una sola renueva
    // y las otras cuatro esperan a esa. Sin esto, cinco /auth/refresh en
    // paralelo con el mismo refreshToken: el servidor rota el token y cuatro
    // se quedan con uno que ya no vale.
    if (renovando) return renovando;
    renovando = (async () => {
      try {
        const d = await crudo('/auth/refresh', {
          metodo: 'POST', cuerpo: { refreshToken: sesion.refresco }, conSesion: false,
        });
        const tk = d?.token || d?.accessToken || d?.access_token || d?.jwt || d?.data?.token;
        if (!tk) return false;
        sesion.token = tk;
        sesion.refresco = d?.refreshToken || d?.refresh_token || d?.data?.refreshToken || sesion.refresco;
        const c = abrirToken(tk);
        if (c.address) sesion.direccion = c.address;
        guardar();
        return true;
      } catch { return false; }
      finally { renovando = null; }
    })();
    return renovando;
  }

  /* `sinReintento` para lo que mueve dinero: repetir un POST que quiza ya se
     ejecuto del otro lado es peor que enseñar el error y dejar comprobar. */
  async function pedir(ruta, opciones = {}) {
    const { conSesion = true, sinReintento = false } = opciones;
    if (conSesion && !vive() && sesion?.refresco) await renovar();
    try {
      return await crudo(ruta, opciones);
    } catch (e) {
      const vencio = e.estado === 401 || e.estado === 403 ||
                     /jwt|expired|invalid token|unauthor/i.test(e.message || '');
      if (!sinReintento && conSesion && vencio && await renovar()) {
        return await crudo(ruta, opciones);
      }
      // Sin refresco posible, la sesion esta muerta: mejor pedir la contraseña
      // que dejar la pantalla dando errores en cada gesto.
      if (vencio && conSesion && !sesion?.refresco) caduco();
      throw e;
    }
  }

  // Se llama cuando la sesion ya no se puede recuperar.
  function caduco() {
    if (!sesion) return;
    avisar(t('err.caduco'));
    salir();
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
      /* Un token vencido ya no obliga a volver a entrar: si quedo guardado el
         refreshToken, la sesion se renueva sola en la primera llamada. Solo se
         descarta cuando vencio Y no hay con que renovarla — ahi si, enseñar una
         pantalla que falla en cada gesto es peor que pedir la contraseña. */
      if (s?.token && !s?.refresco) {
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
    tele('pantalla', destino === 'app' ? 'app.' + (vistaActual || 'inicio') : destino);
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
        // Sin esto la sesion no se puede renovar y, al vencer el token, todo
        // empieza a contestar "invalid token".
        refresco: d?.refreshToken || d?.refresh_token || d?.data?.refreshToken || null,
        correo: d?.user?.email || correo,
        nombre: d?.user?.name || d?.user?.fullName || nombre || (d?.user?.email || correo).split('@')[0],
        direccion: c.address || d?.user?.address || d?.user?.wallet || null,
      };
      guardar();
      /* El identificador sale del token, no del correo: es el `_id` que el
         backend usaría al sincronizar el padrón, y las dos huellas tienen que
         coincidir o el panel enseña «fuera del padrón» para todo el mundo. */
      tele('identificar', { ...c, email: sesion.correo });
      tele('accion', modo === 'crear' ? 'cuenta.creada' : 'sesion.entrar');
      anotarSesion();
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
    tele('accion', 'sesion.salir');
    tele('vaciar');
    tele('identificar', null);
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
    remesas, contactos, sesiones, lector, seguridad, perfil,
  };
  const PESTANAS = ['billetera', 'tarjeta', 'cambiar', 'actividad', 'ajustes'];
  // A que pestaña se le enciende la luz cuando estas en una vista que no es una.
  const DENTRO_DE = {
    enviar: 'billetera', recibir: 'billetera', comprar: 'billetera',
    deposito: 'billetera', token: 'billetera', identidad: 'ajustes',
    remesas: 'billetera', lector: 'billetera',
    contactos: 'ajustes', sesiones: 'ajustes', seguridad: 'ajustes', perfil: 'ajustes',
  };

  function vista(cual, dato) {
    if (!VISTAS[cual]) cual = 'billetera';
    // Salir de la tarjeta borra el numero y el CVV de la memoria y la deja de
    // frente otra vez. Nadie tiene por que volver y encontrarselos puestos.
    if (vistaActual === 'tarjeta' && cual !== 'tarjeta') { secretoTarjeta = null; volteada = false; }
    if (vistaActual === 'lector' && cual !== 'lector') cerrarCamara();
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
    if (cual === 'remesas' && !tasas) cargarTasas().then(() => { if (vistaActual === 'remesas') vista('remesas'); });
    window.scrollTo(0, 0);
  }

  const ICO = {
    enviar: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    recibir: '<path d="M12 5v14M5 12l7 7 7-7"/>',
    comprar: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    cambiar: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    id: '<path d="M12 3l8 3.5v5c0 5-3.4 8.6-8 9.5-4.6-.9-8-4.5-8-9.5v-5z"/><path d="M9 12l2 2 4-4"/>',
    ojo: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>',
    voltear: '<path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2"/><path d="M3 18v-4h4M21 6v4h-4"/>',
    remesa: '<path d="M22 3 11 14M22 3l-7 19-4-8-8-4z"/>',
    gente: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-3.6 3.1-5.8 7-5.8s7 2.2 7 5.8"/><path d="M17 8.5a3 3 0 0 0 0-5M18.5 20c0-2.4-.9-4.3-2.4-5.6"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>',
    camara: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8l1.3-2h6.8l1.3 2h1.8A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.6"/>',
    escudo: '<path d="M12 3l8 3.5v5c0 5-3.4 8.6-8 9.5-4.6-.9-8-4.5-8-9.5v-5z"/>',
    lapiz: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="M14 6l4 4"/>',
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
    <div class="atajos">
      <button class="atajo" onclick="VETA.vista('remesas')">
        <span class="atajo-ic"><svg viewBox="0 0 24 24">${ICO.remesa}</svg></span>
        <span><b>${t('rem.t')}</b><small>${t('rem.sub')}</small></span>
      </button>
      <button class="atajo" onclick="VETA.vista('lector')">
        <span class="atajo-ic"><svg viewBox="0 0 24 24">${ICO.camara}</svg></span>
        <span><b>${t('qr.t')}</b><small>${t('qr.sub')}</small></span>
      </button>
    </div>
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
        // Sin reintento automatico: si el token vencio a mitad del envio, este
        // POST pudo haber salido igual. Repetirlo seria mandar el dinero dos
        // veces; es preferible enseñar el error y que se compruebe.
        metodo: 'POST', espera: 90000, sinReintento: true,
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

    return cab + plastico() + movimientosTarjeta();
  }

  /* El plastico, calcado del telefono: negro con el circuito grabado, el
     monograma de Orden Global grande arriba, el chip, el numero en relieve y el
     titular. Y se da vuelta — el CVV vive atras, como en una tarjeta de verdad,
     no en una lista de datos. Es lo que hace que se sienta una tarjeta y no una
     ficha de base de datos. */
  function plastico() {
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

    return `
    <div class="bloque vidrio">
      <div class="tar-escena ${volteada ? 'volteada' : ''}" id="tar-escena">
        <button class="tar-cara tar-frente ${congelada ? 'tar-fria' : ''}"
                onclick="VETA.voltear()" aria-label="${t('tar.voltear')}">
          ${circuito()}
          <img class="tar-mono" src="assets/og-mono.png" alt="">
          <span class="tar-fila-alta">
            <span class="tar-premium">PREMIUM</span>
            <span class="tar-visa">VISA</span>
          </span>
          <span class="tar-datos">
            ${chip()}
            <span class="tar-campos">
              <span class="tar-num">${secretoTarjeta?.pan ? esc(agrupaPan(secretoTarjeta.pan)) : `••••  ••••  ••••  ${esc(last4)}`}</span>
              <span class="tar-valid">
                <span class="tar-validK">VALID<br>THRU</span>
                <span class="tar-validV">${esc(secretoTarjeta?.expiry || '••/••')}</span>
              </span>
              <span class="tar-titular">${esc((sesion?.nombre || '').toUpperCase() || '—')}</span>
            </span>
          </span>
        </button>

        <button class="tar-cara tar-reverso" onclick="VETA.voltear()" aria-label="${t('tar.voltear')}">
          ${circuito()}
          <span class="tar-banda"></span>
          <span class="tar-firma-fila">
            <span class="tar-firma"></span>
            <span class="tar-cvv"><span class="tar-cvvK">CVV</span><b>${esc(secretoTarjeta?.cvv || '•••')}</b></span>
          </span>
          <span class="tar-reverso-pie">
            <span>${t('tar.atrasNota')}</span>
            <span class="tar-visa" style="font-size:17px">VISA</span>
          </span>
        </button>
      </div>
      <p class="tar-pista"><svg viewBox="0 0 24 24">${ICO.voltear}</svg>${t('tar.pista')}</p>

      <div class="tar-estado">
        <span class="estado ${bloqueada ? 'e-mal' : congelada ? 'e-rev' : 'e-ok'}">
          ${bloqueada ? t('tar.bloqueada') : congelada ? t('tar.congelada') : t('tar.activa')}
        </span>
        ${disp != null ? `<b>${tapa(oro(disp))} ORIGEN</b>` : `<span class="pie">${t('tar.sinSaldo')}</span>`}
      </div>
      <p class="pie" style="margin-top:10px">${congelada ? t('tar.congelada1') : t('tar.activa1')}</p>
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
    </div>`;
  }

  function movimientosTarjeta() {
    return `
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

  // El numero de una tarjeta se lee en grupos de cuatro. De corrido no se puede
  // dictar por telefono ni comprobar de un vistazo.
  const agrupaPan = p => String(p).replace(/\D/g, '').replace(/(.{4})/g, '$1  ').trim();

  // El circuito grabado y el chip: los mismos del telefono, en SVG.
  const circuito = () => `
    <svg class="tar-circuito" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="rgba(201,169,97,.22)" stroke-width=".8">
        <path d="M0 44h58l16 16h72M320 150h-70l-18-18h-64M0 128h40l22 22h48"/>
        <path d="M262 12v34l-16 16v40M74 196v-30l18-18v-44"/>
      </g>
      <g fill="none" stroke="rgba(223,192,120,.52)" stroke-width="1.3">
        <path d="M0 82h96l20-20h84l22 22h98"/>
        <path d="M140 200v-36l24-24h58"/>
      </g>
      <g fill="none" stroke="rgba(223,192,120,.6)" stroke-width="1">
        <circle cx="96" cy="82" r="2.4"/><circle cx="222" cy="84" r="2.4"/>
        <circle cx="164" cy="140" r="2.4"/><circle cx="62" cy="150" r="2.4"/>
      </g>
    </svg>`;

  const chip = () => `
    <span class="tar-chip" aria-hidden="true">
      <span class="tar-chip-l"></span><span class="tar-chip-c"></span>
    </span>`;

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
        ${fila(ICO.persona, t('aj.perfil'), esc(sesion?.nombre || '—'), "VETA.vista('perfil')")}
        ${fila(ICO.id, t('aj.gid'), t('aj.gidP'), "VETA.vista('identidad')")}
        ${fila(ICO.tarjeta, t('aj.tarjeta'), t('aj.tarjetaP'), "VETA.vista('tarjeta')")}
        ${fila(ICO.recibir, t('aj.deposito'), t('aj.depositoP'), "VETA.vista('deposito')")}
        ${fila(ICO.gente, t('con.t'), t('con.sub'), "VETA.vista('contactos')")}
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
      <div class="ajustes">
        ${fila(ICO.llave, t('seg.frase'), t('seg.fraseP').slice(0, 58) + '…', "VETA.vista('seguridad')")}
        ${fila(ICO.reloj, t('ses.t'), t('ses.sub'), "VETA.vista('sesiones')")}
      </div>
      <div class="nota nota-cuidado" style="margin-top:16px">${t('aj.clave')}</div>
      <div style="margin-top:16px"><button class="btn btn-linea btn-sm" onclick="VETA.salir()">${t('aj.salir')}</button></div>
    </div>

    <div class="bloque vidrio">
      <h3>${t('cta.appT')}</h3>
      <p class="pie" style="margin-top:8px">${t('cta.appP')}</p>
    </div>`;
  }


  // ── remesas ───────────────────────────────────────────────────────────────

  /* Un calculador, no una orden de envio: dice cuanto le queda al que recibe
     despues de la comision y del cambio a su moneda. Los mismos nueve paises y
     la misma fuente de tasas que el telefono. */
  const PAISES = [
    { c: 'HN', n: 'Honduras', b: '🇭🇳', m: 'HNL' },
    { c: 'SV', n: 'El Salvador', b: '🇸🇻', m: 'USD' },
    { c: 'GT', n: 'Guatemala', b: '🇬🇹', m: 'GTQ' },
    { c: 'NI', n: 'Nicaragua', b: '🇳🇮', m: 'NIO' },
    { c: 'CR', n: 'Costa Rica', b: '🇨🇷', m: 'CRC' },
    { c: 'PA', n: 'Panamá', b: '🇵🇦', m: 'USD' },
    { c: 'MX', n: 'México', b: '🇲🇽', m: 'MXN' },
    { c: 'CO', n: 'Colombia', b: '🇨🇴', m: 'COP' },
    { c: 'US', n: 'Estados Unidos', b: '🇺🇸', m: 'USD' },
  ];
  // Solo se usan si el feed nunca respondio. Van marcadas en pantalla.
  const TASAS_REF = { HNL: 25.5, GTQ: 7.77, NIO: 36.6, CRC: 512, MXN: 18.5, COP: 4050, USD: 1 };
  const COMISION_USD = 1;

  let tasas = null, tasasAl = null, paisRem = 'HN', montoRem = '';

  async function cargarTasas() {
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/USD');
      const d = await r.json();
      if (d?.rates?.USD) { tasas = d.rates; tasasAl = d.time_last_update_utc || null; }
    } catch {}
  }

  function remesas() {
    const p = PAISES.find(x => x.c === paisRem) || PAISES[0];
    const tasa = (tasas || TASAS_REF)[p.m] ?? null;
    const precio = origen()?.precio;
    const n = Number(String(montoRem).replace(',', '.')) || 0;
    const enUsd = precio != null ? n * precio : null;
    // La comision se descuenta ANTES de convertir: asi el numero de abajo es lo
    // que de verdad le llega, no el bruto.
    const neto = enUsd != null ? Math.max(0, enUsd - COMISION_USD) : null;
    const local = neto != null && tasa != null ? neto * tasa : null;

    return `
    <div class="cab"><div><h2>${t('rem.t')}</h2><div class="sub">${t('rem.sub')}</div></div></div>
    <div class="bloque vidrio">
      <div class="caja-cambio">
        <div class="cc-cab"><span>${t('rem.envias')}</span><span>${t('sw.saldo')}: ${oro(origen()?.cant ?? 0)}</span></div>
        <div class="cc-fila">
          <input id="rem-monto" type="text" inputmode="decimal" placeholder="0"
                 value="${esc(montoRem)}" oninput="VETA.remMonto()">
          <span class="cc-tok">${origen() ? disco(origen()) : ''}<b>ORIGEN</b></span>
        </div>
      </div>
      <div class="cc-flecha"><svg viewBox="0 0 24 24">${ICO.remesa}</svg></div>
      <div class="caja-cambio">
        <div class="cc-cab"><span>${t('rem.recibe')}</span><span>${t('rem.pais')}</span></div>
        <div class="cc-fila">
          <input type="text" readonly placeholder="0"
                 value="${local != null && n > 0 ? esc(nfUsd.format(local) + ' ' + p.m) : ''}">
          <select class="cc-tok cc-sel" onchange="VETA.remPais(this.value)" aria-label="${t('rem.pais')}">
            ${PAISES.map(x => `<option value="${x.c}" ${x.c === p.c ? 'selected' : ''}>${x.b} ${esc(x.n)}</option>`).join('')}
          </select>
        </div>
      </div>
      <dl class="datos" style="margin-top:18px">
        <div><dt>${t('rem.tasa')}</dt><dd>${tasa != null ? `1 USD = ${nfUsd.format(tasa)} ${p.m}` : '—'}</dd></div>
        <div><dt>${t('rem.comision')}</dt><dd>${usd(COMISION_USD)}</dd></div>
        <div><dt>${t('sw.precio')} ORIGEN</dt><dd>${precio != null ? esc(usd(precio)) : '—'}</dd></div>
      </dl>
      <p class="pie" style="margin-top:12px">
        ${tasas ? `${t('rem.act')}${tasasAl ? ' · ' + esc(tasasAl) : ''}` : t('rem.actNunca')}
      </p>
      <div class="nota" style="margin-top:12px">${t('rem.nota')}</div>
      <div style="margin-top:14px">
        <button class="btn btn-linea btn-sm" onclick="VETA.refrescarTasas()">${t('rem.refrescar')}</button>
      </div>
    </div>`;
  }

  function remMonto() { montoRem = $('#rem-monto')?.value || ''; pintarRemesa(); }
  function remPais(c) { montoRem = $('#rem-monto')?.value || ''; paisRem = c; vista('remesas'); }
  async function refrescarTasas() { await cargarTasas(); if (vistaActual === 'remesas') vista('remesas'); }

  // Recalcular sin redibujar: escribir un monto no tiene por que mover el foco.
  function pintarRemesa() {
    const p = PAISES.find(x => x.c === paisRem) || PAISES[0];
    const tasa = (tasas || TASAS_REF)[p.m] ?? null;
    const precio = origen()?.precio;
    const n = Number(String(montoRem).replace(',', '.')) || 0;
    const salida = document.querySelectorAll('.caja-cambio input')[1];
    if (!salida) return;
    if (!(n > 0) || precio == null || tasa == null) { salida.value = ''; return; }
    const neto = Math.max(0, n * precio - COMISION_USD);
    salida.value = nfUsd.format(neto * tasa) + ' ' + p.m;
  }

  // ── contactos ─────────────────────────────────────────────────────────────

  /* Viven en este navegador, igual que en el telefono viven en el telefono. No
     se mandan al servidor: es una libreta de direcciones, no una cuenta. */
  const LLAVE_CON = 'veta.contactos';
  const leerContactos = () => {
    try { return JSON.parse(localStorage.getItem(LLAVE_CON) || '[]'); } catch { return []; }
  };
  const guardarContactos = l => {
    try { localStorage.setItem(LLAVE_CON, JSON.stringify(l)); } catch {}
  };

  function contactos() {
    const l = leerContactos();
    return `
    <div class="cab"><div><h2>${t('con.t')}</h2><div class="sub">${t('con.sub')}</div></div></div>
    <div class="bloque vidrio">
      <h3>${t('con.nuevo')}</h3>
      <form onsubmit="return VETA.nuevoContacto(event)" style="margin-top:14px">
        <div class="campo">
          <label for="con-nombre">${t('con.nombre')}</label>
          <input id="con-nombre" autocomplete="off" required>
        </div>
        <div class="campo">
          <label for="con-dir">${t('con.dir')}</label>
          <input id="con-dir" class="mono" placeholder="0x…" autocomplete="off" spellcheck="false" required>
        </div>
        <div id="con-aviso" class="aviso oculto" role="alert"></div>
        <button class="btn btn-oro btn-sm" type="submit">${t('con.guardar')}</button>
      </form>
    </div>
    <div class="bloque vidrio">
      <h3>${t('con.guardados')}</h3>
      ${l.length ? l.map(c => `
        <div class="hilera">
          <div class="ic"><svg viewBox="0 0 24 24">${ICO.gente}</svg></div>
          <div class="txt">
            <b>${esc(c.nombre)}</b>
            <small class="mono">${esc(cortaDir(c.dir))}</small>
          </div>
          <div class="con-btns">
            <button class="btn btn-linea btn-sm" onclick="VETA.enviarA('${esc(c.dir)}')">${t('con.usar')}</button>
            <button class="btn btn-linea btn-sm" onclick="VETA.borrarContacto('${esc(c.id)}')" aria-label="${t('con.borrar')}">✕</button>
          </div>
        </div>`).join('')
      : `<div class="vacio"><b>${t('con.vacioT')}</b>${t('con.vacioP')}</div>`}
      <p class="pie" style="margin-top:12px">${t('con.local')}</p>
    </div>`;
  }

  function nuevoContacto(ev) {
    ev.preventDefault();
    const nombre = $('#con-nombre').value.trim();
    const dir = $('#con-dir').value.trim();
    const av = $('#con-aviso');
    const decir = m => { av.textContent = m; av.className = 'aviso aviso-mal'; av.classList.remove('oculto'); };
    if (!nombre) return decir(t('con.eNombre')), false;
    if (!/^0x[a-fA-F0-9]{40}$/.test(dir)) return decir(t('con.eDir')), false;
    const l = leerContactos();
    l.unshift({ id: String(Date.now()), nombre, dir });
    guardarContactos(l);
    avisar(t('con.guardado'));
    vista('contactos');
    return false;
  }

  function borrarContacto(id) {
    guardarContactos(leerContactos().filter(c => c.id !== id));
    avisar(t('con.borrado'));
    vista('contactos');
  }

  // Llevar a enviar con la direccion ya puesta es la mitad del valor de tener
  // contactos: si hay que copiarla igual, no sirvio de nada.
  function enviarA(dir) {
    vista('enviar');
    const c = $('#env-dir');
    if (c) { c.value = dir; $('#env-monto')?.focus(); }
  }

  // ── sesiones ──────────────────────────────────────────────────────────────

  const LLAVE_SES = 'veta.sesiones';
  const leerSesiones = () => {
    try { return JSON.parse(localStorage.getItem(LLAVE_SES) || '[]'); } catch { return []; }
  };
  function anotarSesion() {
    try {
      const l = leerSesiones();
      l.unshift({ id: String(Date.now()), en: new Date().toISOString(), ua: navigator.userAgent });
      localStorage.setItem(LLAVE_SES, JSON.stringify(l.slice(0, 20)));
    } catch {}
  }

  // Un user-agent entero no lo lee nadie. Se resume a lo que importa.
  function navegadorDe(ua) {
    const s = String(ua || '');
    const nav = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera'
      : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari'
      : /Firefox\//.test(s) ? 'Firefox' : '—';
    const so = /Android/.test(s) ? 'Android' : /iPhone|iPad/.test(s) ? 'iOS'
      : /Mac OS X/.test(s) ? 'macOS' : /Windows/.test(s) ? 'Windows'
      : /Linux/.test(s) ? 'Linux' : '—';
    return `${nav} · ${so}`;
  }

  function sesiones() {
    const l = leerSesiones();
    return `
    <div class="cab"><div><h2>${t('ses.t')}</h2><div class="sub">${t('ses.sub')}</div></div></div>
    <div class="bloque vidrio">
      ${l.length ? l.map((x, i) => `
        <div class="hilera">
          <div class="ic"><svg viewBox="0 0 24 24">${ICO.reloj}</svg></div>
          <div class="txt">
            <b>${esc(navegadorDe(x.ua))}${i === 0 ? ` · <span class="estado e-ok">${t('ses.esta')}</span>` : ''}</b>
            <small>${esc(fechaLarga(x.en))}</small>
          </div>
        </div>`).join('')
      : `<div class="vacio"><b>${t('ses.vacio')}</b></div>`}
      <div class="nota" style="margin-top:14px">${t('ses.local')}</div>
      <div style="margin-top:14px">
        <button class="btn btn-linea btn-sm" onclick="VETA.salir()">${t('ses.cerrarT')}</button>
      </div>
    </div>`;
  }

  const fechaLarga = iso => {
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString(idiomaActivo() === 'es' ? 'es-HN' : 'en-US',
      { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // ── el lector de códigos ──────────────────────────────────────────────────

  /* Se usa BarcodeDetector, que trae el propio navegador. No se incrusta una
     biblioteca de terceros para decodificar: serian cien kilobytes de codigo
     ajeno leyendo la camara de alguien, en la pantalla donde se escribe una
     direccion a la que se le va a mandar dinero.
     Donde no existe — Safari, Firefox — se dice y se ofrece pegar a mano, que
     es exactamente lo que se haria igual. */
  let camara = null;
  const hayLector = () => 'BarcodeDetector' in window;

  function lector() {
    return `
    <div class="cab"><div><h2>${t('qr.t')}</h2><div class="sub">${t('qr.sub')}</div></div></div>
    <div class="bloque vidrio centrado">
      ${hayLector() ? `
        <div class="visor"><video id="qr-video" playsinline muted></video><span class="visor-marco"></span></div>
        <p class="pie" id="qr-estado" style="margin-top:14px">${t('qr.buscando')}</p>
        <div class="dir-btns">
          <button class="btn btn-oro btn-sm" onclick="VETA.abrirCamara()">${t('qr.permiso')}</button>
          <button class="btn btn-linea btn-sm" onclick="VETA.cerrarCamara()">${t('qr.cerrar')}</button>
        </div>`
      : `<div class="obra-ic"><svg viewBox="0 0 24 24">${ICO.camara}</svg></div>
         <h3>${t('qr.noHay')}</h3>
         <p class="pie" style="margin-top:10px">${t('qr.noHayP')}</p>`}
      <div style="margin-top:16px">
        <button class="btn btn-linea btn-sm" onclick="VETA.vista('enviar')">${t('qr.pegar')}</button>
      </div>
    </div>`;
  }

  async function abrirCamara() {
    const v = $('#qr-video'), est = $('#qr-estado');
    if (!v) return;
    try {
      camara = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      v.srcObject = camara;
      await v.play();
    } catch { if (est) est.textContent = t('qr.noPermiso'); return; }

    const det = new window.BarcodeDetector({ formats: ['qr_code'] });
    const mirar = async () => {
      if (!camara || vistaActual !== 'lector') return;
      try {
        const [c] = await det.detect(v);
        const dir = (c?.rawValue || '').trim().match(/0x[a-fA-F0-9]{40}/)?.[0];
        if (dir) {
          cerrarCamara();
          avisar(t('qr.leido'));
          enviarA(dir);
          return;
        }
      } catch {}
      requestAnimationFrame(mirar);
    };
    requestAnimationFrame(mirar);
  }

  // Apagar la camara de verdad. Una pestaña que deja el piloto encendido
  // despues de salir de la pantalla asusta, y con razon.
  function cerrarCamara() {
    camara?.getTracks().forEach(p => p.stop());
    camara = null;
  }

  // ── la frase y la llave ───────────────────────────────────────────────────

  function seguridad() {
    return `
    <div class="cab"><div><h2>${t('seg.t')}</h2><div class="sub">${t('seg.sub')}</div></div></div>
    <div class="bloque vidrio">
      <h3>${t('seg.frase')}</h3>
      <p class="pie" style="margin-top:8px">${t('seg.fraseP')}</p>
      <div id="caja-seed" style="margin-top:14px">
        <button class="btn btn-linea btn-sm" onclick="VETA.pedirSecreto('seed')">${t('seg.ver')}</button>
      </div>
    </div>
    <div class="bloque vidrio">
      <h3>${t('seg.llave')}</h3>
      <p class="pie" style="margin-top:8px">${t('seg.llaveP')}</p>
      <div id="caja-llave" style="margin-top:14px">
        <button class="btn btn-linea btn-sm" onclick="VETA.pedirSecreto('llave')">${t('seg.ver')}</button>
      </div>
    </div>
    <div class="bloque vidrio">
      <div class="nota nota-cuidado">${t('seg.aviso')}</div>
    </div>`;
  }

  /* La contraseña se pide cada vez y lo que llega no se guarda: se pinta y se
     va con la pantalla. La frase de doce palabras y la llave privada son el
     dinero, no una credencial mas. */
  async function pedirSecreto(cual, ev) {
    const caja = $(cual === 'seed' ? '#caja-seed' : '#caja-llave');
    if (!caja) return false;
    if (!ev) {
      caja.innerHTML = `
        <form onsubmit="return VETA.pedirSecreto('${cual}',event)">
          <div class="campo">
            <label for="sec-${cual}">${t('seg.claveP')}</label>
            <input id="sec-${cual}" type="password" autocomplete="current-password" placeholder="••••••••" required>
          </div>
          <div class="aviso oculto" id="av-${cual}" role="alert"></div>
          <button class="btn btn-oro btn-sm" type="submit">${t('seg.ver')}</button>
        </form>`;
      $(`#sec-${cual}`).focus();
      return false;
    }
    ev.preventDefault();
    const av = $(`#av-${cual}`), btn = ev.target.querySelector('button');
    btn.disabled = true;
    btn.innerHTML = '<span class="girando"></span>';
    try {
      // Las rutas del backend son estas, con "decript" mal escrito: asi se
      // llaman del otro lado. Las que parecian obvias (/user/seed) nunca
      // existieron, y por eso esto devolvia "no disponible" siempre.
      const ruta = cual === 'seed' ? '/users/decriptSeed' : '/users/decriptPrivate';
      const d = await pedir(ruta, { metodo: 'POST', cuerpo: { password: $(`#sec-${cual}`).value }, espera: 30000 });
      const valor = cual === 'seed'
        ? (d?.seed || d?.mnemonic || d?.phrase || d?.data?.seed || null)
        : (d?.privateKey || d?.private_key || d?.key || d?.data?.privateKey || null);
      const bueno = cual === 'seed'
        ? typeof valor === 'string' && valor.trim().split(/\s+/).length >= 12
        : typeof valor === 'string' && valor.length >= 32;
      if (!bueno) throw new Error(t(cual === 'seed' ? 'seg.noHay' : 'seg.noHayLl'));
      caja.innerHTML = cual === 'seed' ? fraseEnPalabras(valor.trim()) : `
        <div class="secreto">
          <p class="mono llave-txt">${esc(valor)}</p>
          <div class="dir-btns">
            <button class="btn btn-oro btn-sm" onclick="VETA.copiarTexto(this.dataset.v)" data-v="${esc(valor)}">${t('seg.copiar')}</button>
            <button class="btn btn-linea btn-sm" onclick="VETA.vista('seguridad')">${t('seg.ocultar')}</button>
          </div>
        </div>`;
    } catch (e) {
      av.textContent = e.message;
      av.className = 'aviso aviso-mal';
      btn.disabled = false;
      btn.textContent = t('seg.ver');
    }
    return false;
  }

  // Doce palabras numeradas. De corrido es imposible copiarlas a mano sin
  // equivocarse, y copiarlas a mano es justo lo que hay que hacer con ellas.
  function fraseEnPalabras(frase) {
    const p = frase.split(/\s+/);
    return `
      <div class="secreto">
        <ol class="frase">${p.map(w => `<li><span class="mono">${esc(w)}</span></li>`).join('')}</ol>
        <div class="dir-btns">
          <button class="btn btn-oro btn-sm" onclick="VETA.copiarTexto(this.dataset.v)" data-v="${esc(frase)}">${t('seg.copiar')}</button>
          <button class="btn btn-linea btn-sm" onclick="VETA.vista('seguridad')">${t('seg.ocultar')}</button>
        </div>
      </div>`;
  }

  async function copiarTexto(v) {
    try { await navigator.clipboard.writeText(v); avisar(t('seg.copiado')); }
    catch { avisar(t('rec.noCopia')); }
  }

  // ── el perfil ─────────────────────────────────────────────────────────────

  function perfil() {
    return `
    <div class="cab"><div><h2>${t('perf.t')}</h2><div class="sub">${esc(sesion?.correo || '')}</div></div></div>
    <div class="bloque vidrio">
      <form onsubmit="return VETA.guardarNombre(event)">
        <div class="campo">
          <label for="pf-nombre">${t('perf.nombre')}</label>
          <input id="pf-nombre" value="${esc(sesion?.nombre || '')}" autocomplete="name" required>
        </div>
        <p class="pie">${t('perf.nombreP')}</p>
        <div id="pf-aviso" class="aviso oculto" role="alert"></div>
        <button class="btn btn-oro btn-sm" type="submit" style="margin-top:14px">${t('perf.guardar')}</button>
      </form>
      <dl class="datos" style="margin-top:20px">
        <div><dt>${t('cta.correo')}</dt><dd>${esc(sesion?.correo || '—')}</dd></div>
        <div><dt>${t('cta.dir')}</dt><dd class="mono">${esc(sesion?.direccion || t('cta.sinDir'))}</dd></div>
      </dl>
    </div>`;
  }

  function guardarNombre(ev) {
    ev.preventDefault();
    const v = $('#pf-nombre').value.trim();
    const av = $('#pf-aviso');
    if (!v) {
      av.textContent = t('perf.eNombre');
      av.className = 'aviso aviso-mal';
      return false;
    }
    sesion.nombre = v;
    guardar();
    avisar(t('perf.guardado'));
    vista('perfil');
    return false;
  }

  // ── acciones ──────────────────────────────────────────────────────────────

  function tapar() { ocultos = !ocultos; vista(vistaActual); }

  // Voltear no redibuja la vista: se mueve una clase y el navegador anima el
  // giro. Volver a generar el HTML cortaria la animacion en seco.
  function voltear() {
    volteada = !volteada;
    $('#tar-escena')?.classList.toggle('volteada', volteada);
  }

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
  /* El numero y el PIN se piden con la contraseña cada vez. Lo que llega NO se
     guarda en ningun lado: vive en `secretoTarjeta`, en memoria, y se borra al
     salir de la pantalla. El numero ademas se pinta en la tarjeta misma, que es
     donde uno lo busca, en vez de en una lista de datos debajo. */
  async function revelar(que, ev) {
    const caja = $('#tar-secreto');
    if (!caja) return false;

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

    ev.preventDefault();
    const av = $('#rev-aviso');
    const btn = ev.target.querySelector('button');
    btn.disabled = true;
    btn.innerHTML = '<span class="girando"></span>';
    try {
      const d = await pedir(`/cards/${que}`, { metodo: 'POST', cuerpo: { password: $('#rev-clave').value } });
      if (que === 'pan') {
        secretoTarjeta = { pan: d?.pan || null, cvv: d?.cvv || null, expiry: d?.expiry || null };
        vista('tarjeta');                       // el numero aparece en el plastico
        $('#tar-secreto').innerHTML = `
          <div class="secreto">
            <p class="pie">${t('tar.enTarjeta')}</p>
            <div class="nota nota-cuidado">${t('tar.cuidado')}</div>
            <button class="btn btn-linea btn-sm" onclick="VETA.olvidar()">${t('tar.ocultar')}</button>
          </div>`;
      } else {
        $('#tar-secreto').innerHTML = `
          <div class="secreto">
            <div class="sec-fila"><span>PIN</span><b class="mono">${esc(d?.pin || '—')}</b></div>
            <div class="nota nota-cuidado">${t('tar.cuidado')}</div>
            <button class="btn btn-linea btn-sm" onclick="document.getElementById('tar-secreto').innerHTML=''">${t('tar.ocultar')}</button>
          </div>`;
      }
    } catch (e) {
      // Un 409 no es culpa de quien escribe: la tarjeta todavia no tiene PIN.
      av.textContent = e.estado === 409 ? t('tar.sinPin') : e.message;
      av.classList.remove('oculto');
      btn.disabled = false;
      btn.textContent = t('tar.mostrar');
    }
    return false;
  }

  function olvidar() {
    secretoTarjeta = null;
    volteada = false;
    vista('tarjeta');
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
    /* Se enciende la telemetría antes que nada, para que un fallo del propio
       arranque también se vea. Sin clave puesta esto no hace absolutamente
       nada — ni cola, ni peticiones. */
    tele('iniciar', {});
    pintarQrPortada();
    armarRevelado();
    $('#form-acceso').addEventListener('submit', enviarAcceso);
    $('#i-clave').addEventListener('input', pintarFuerza);
    sesion = recuperar();
    if (sesion?.token) {
      // Volver con la sesión guardada es entrar igual: si no se contara, quien
      // no cierra sesión nunca aparecería como que usa la app.
      tele('identificar', { ...abrirToken(sesion.token), email: sesion.correo });
      tele('accion', 'sesion.recuperada');
      ir('app');
      cargarTodo();
    }
    else ir('bienvenida');
  }
  document.addEventListener('DOMContentLoaded', arrancar);

  return { ir, pestana, ojo, vista, mandar, copiar, compartir, salir, reintentar, avisar, idioma,
           tapar, copiarContrato, congelar, revelar, pedirTarjeta, cambioMonto, elegirDestino,
           voltear, olvidar, remMonto, remPais, refrescarTasas, nuevoContacto, borrarContacto,
           enviarA, abrirCamara, cerrarCamara, pedirSecreto, copiarTexto, guardarNombre,
           // Solo para las pruebas y las capturas: aqui no hay salida a la
           // cadena, y hay que poder mirar la pantalla con saldos dentro.
           _sembrar: l => { cartera = l; errCartera = null; },
           _tarjeta: c => { tarjeta = c; },
           _estado: () => ({ sesion, cartera, identidad, movimientos, tarjeta, vistaActual, modo, ocultos }) };
})();
