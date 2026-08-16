/* Veta Wallet · web
 *
 * Habla con el mismo backend que la aplicación del teléfono, con las mismas
 * rutas y el mismo contrato. No hay una "versión web" de los datos: es la misma
 * cuenta, el mismo saldo y la misma identidad, vistos desde otra pantalla.
 */

const VETA = (() => {
  'use strict';

  // El backend de la billetera. Se puede apuntar a otro —definiendo OG_API
  // antes de este archivo— igual que OG_CHAIN_ID con la red y
  // OG_MENSAJES_API con el relevo: es lo que deja probar contra un backend
  // de mentira que se puede romper a voluntad, sin tocar el de produccion.
  const API = String(window.OG_API || 'https://vetawallet-1a2e38ac52b1.herokuapp.com')
    .replace(/\/$/, '');
  // El identificador de la red. Desde el corte del 15-ago-2026 es la 5550, y este es
  // el único sitio de la billetera web donde cambia. Se puede forzar desde
  // fuera —definiendo OG_CHAIN_ID antes de este archivo— para apuntar la misma
  // billetera a la red de pruebas (5534) o a la de ensayo sin recompilar nada.
  const CHAIN = String(window.OG_CHAIN_ID || 5550);   // red oficial desde el corte del 15-ago-2026
  const LLAVE = 'veta.sesion';
  // El explorador publico de la cadena. Un comprobante de pago sin enlace a
  // donde comprobarlo es solo una afirmacion nuestra.
  const EXPLORADOR = 'https://ordenscan.com';
  // Adonde lleva la esfera de MyTokenPay. Se puede pisar desde fuera igual
  // que la cadena y el relevo, porque su web propia esta por estrenarse.
  /* La vitrina web de MyTokenPay (el ensayo de Amplify, mientras no tenga
     dominio propio). El POS viejo de mytokenpay-pos.com quedo con el backend
     caido: enlazarlo era mandar a la gente a un login que no puede funcionar. */
  const URL_MYTOKENPAY = window.OG_MYTOKENPAY || 'https://main.d2dr8sh34hni4c.amplifyapp.com';

  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Un dato que viaja DENTRO de una cadena de JavaScript que a su vez vive en
     un atributo (onclick="VETA.algo(AQUI)") pasa por DOS lectores: primero el
     de HTML, que des-escapa las entidades, y después el de JS. esc() sirve
     para el primero y NO para el segundo: escribe &#39;, el lector de HTML lo
     devuelve a ' y esa comilla cierra la cadena — el resto del dato se
     ejecuta como código. Con un correo del relevo (que puede traer comillas)
     eso es una puerta abierta.

     Así que se escapa al revés: primero para JS —JSON.stringify, que además
     pone las comillas— y después para HTML. Las comillas dobles quedan como
     &quot;, que el lector de HTML devuelve a " dentro del atributo sin
     cerrarlo, y el JS recibe una cadena entera y correcta.

     Se usa SIN comillas alrededor: onclick="VETA.algo(${jsTxt(x)})". */
  const jsTxt = s => esc(JSON.stringify(String(s == null ? '' : s))
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'));

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
  let movimientos = null;   // null = todavia no llego; [] = llego y no hay
  /* Por que no se pudo traer la actividad. Hace falta distinguirlo de «no
     hay nada»: una lista vacia por un fallo de red le dice a la persona
     «todavia no tenes movimientos» sobre una cuenta con historial — la
     misma clase de mentira tranquilizadora que ya nos costo cara en la
     tarjeta de Genesis ID. */
  let errMovs = null;
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
  // La portada de la sesion es el NUCLEO, no la billetera: la web es la puerta
  // al ecosistema entero y la billetera es una de sus salas, la mas usada.
  let vistaActual = 'nucleo';
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
        // Algunos errores traen un motivo en clave, aparte del texto para leer.
        // Sin arrastrarlo hasta aqui, quien atrapa el error solo tiene la frase
        // y acaba adivinando con expresiones regulares sobre la traduccion.
        if (datos?.motivo) e.motivo = datos.motivo;
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
      if (vencio && conSesion) {
        /* Un token vencido se renueva y la peticion se repite. Pero si la
           RENOVACION tampoco sirve, la sesion esta muerta de verdad y hay que
           pedir la contraseña.

           Antes bastaba con TENER refresco para no cerrar sesion —se miraba si
           existia, no si servia—. Y el dia que se rota la clave que firma las
           sesiones eso le pasa a todo el mundo de golpe: el refresco viejo
           tampoco vale, nadie sale de la sesion muerta, y la persona se queda
           dentro viendo «Reintentar» en la tarjeta de Genesis ID —verificada
           desde hace meses— con un boton que no puede funcionar nunca. El
           sintoma no se parecia en nada a la causa. */
        const renovado = await renovar();
        if (renovado) { if (!sinReintento) return await crudo(ruta, opciones); }
        else caduco();
      }
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

  /* La frase de recuperacion recien acuñada, entre que se crea la cuenta y se
     entra. Vive en memoria y nada mas: no se guarda, no se manda a ningun
     sitio, y se borra en cuanto la persona confirma que la anoto. */
  let semillaNueva = null;

  // El alta la devuelve dentro de un sello firmado; aqui solo se abre para
  // leerla. Si viene rara no se inventa nada: no se enseña y punto — la frase
  // se puede volver a pedir en Seguridad con la contraseña.
  function leerSemilla(sello) {
    if (!sello || typeof sello !== 'string') return null;
    try {
      const d = abrirToken(sello);
      const s = d?.seed || d?.semilla || null;
      return (typeof s === 'string' && s.split(/\s+/).length >= 12) ? s : null;
    } catch { return null; }
  }

  function mostrarSemilla(frase) {
    const palabras = frase.split(/\s+/).filter(Boolean);
    $('#bienve').innerHTML = `
      <div class="bien-caja" style="--bE1:#F8EFCF;--bE2:#C9A961;--bE3:#96793F;--bHalo:#EAD79C;--bLente:#05201B">
        <div class="bien-esfera" aria-hidden="true"><div class="bien-lente">
          <svg viewBox="0 0 24 24">${ICO.llave}</svg></div></div>
        <div class="bien-k">${t('sem.k')}</div>
        <h2 id="bien-tit">${t('sem.t')}</h2>
        <p>${t('sem.p')}</p>
        <div class="sem-rejilla">
          ${palabras.map((w, i) => `<span><em>${i + 1}</em>${esc(w)}</span>`).join('')}
        </div>
        <div class="sem-btns">
          <button class="btn btn-linea btn-sm" onclick="VETA.semCopiar()">${t('sem.copiar')}</button>
          <button class="btn btn-oro btn-sm" onclick="VETA.semListo()">${t('sem.listo')}</button>
        </div>
        <p class="sem-pie">${t('sem.pie')}</p>
      </div>`;
    $('#bienve').classList.remove('oculto');
    document.body.style.overflow = 'hidden';
  }

  const semCopiar = () => copiarTexto(semillaNueva || '', t('sem.copiada'));
  function semListo() {
    semillaNueva = null;          // fuera de la memoria en cuanto se confirma
    $('#bienve').classList.add('oculto');
    $('#bienve').innerHTML = '';
    document.body.style.overflow = '';
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
    /* AU-RA acompaña toda la sesion; fuera de ella no existe. Las seis
       tarjetas de la bienvenida vieja ya no salen solas: quedaron en Ajustes
       para quien quiera leerlas — la puerta de entrada ahora es de AU-RA. */
    if (destino === 'app') auraDespertar();
    else {
      $('#aura-orbe').setAttribute('data-oculto', '');
      auraAbierta = false;
      /* La conversacion con AU-RA se VA con la sesion. Sin esto, la siguiente
         cuenta que entrara en el mismo navegador abria el panel y encontraba
         el hilo de la anterior — con su nombre y con los saldos que AU-RA le
         habia contestado. */
      auraCharla = [];
      pintarAura();
      tourApagar();
      AURA.pararVoz(); AURA.pararRed();
      AURA.dejarDeEscuchar();     // el microfono tampoco sobrevive a la salida
      document.body.classList.remove('en-cerebro');
    }
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
    // La bienvenida se pinta aparte del resto, asi que hay que repintarla a
    // mano o se queda a medio traducir encima de todo lo demas.
    if (!$('#bienve').classList.contains('oculto')) bienPintar();
    // El panel de AU-RA tambien vive fuera de #lienzo: abierto, sus chips y
    // su placeholder se quedarian en el idioma viejo si no se repinta aqui.
    if (auraAbierta) pintarAura();
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
        /* La respuesta del alta trae la frase de recuperacion dentro de un
           sello que vale cinco minutos. Se leia y se tiraba: quien creaba su
           cuenta nunca veia su respaldo en el momento, que es justo cuando
           tiene sentido apuntarlo. Se guarda para enseñarla en cuanto entre. */
        const alta = await pedir('/auth/register', {
          metodo: 'POST', cuerpo: { name: nombre, email: correo, password: clave }, conSesion: false });
        semillaNueva = leerSemilla(alta?.semilla);
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
      /* Y se da de alta en el padrón probándolo con esta misma sesión: sin
         esto el panel ve la conexión pero no de quién es. El token no sale de
         aquí para nada más — Genesis ID solo lo usa para preguntarle a este
         backend si lo reconoce. */
      tele('confirmar', token, {
        email: sesion.correo, nombre: sesion.nombre, direccionWallet: sesion.direccion,
      });
      tele('accion', modo === 'crear' ? 'cuenta.creada' : 'sesion.entrar');
      anotarSesion();
      ir('app');
      cargarTodo();
      /* La introduccion de AU-RA abre CADA entrada — es la puerta del
         ecosistema, y Jose la quiso siempre, con su SALTAR a la vista. El
         login es un gesto del dedo, asi que el audio puede arrancar solo.
         La unica excepcion es la frase semilla recien acunada: doce palabras
         que anotar ganan a cualquier bienvenida. */
      if (!semillaNueva) setTimeout(() => auraBienvenida(true), 300);
      else setTimeout(auraOfrecerGid, 1200);
      // La frase se enseña ENCIMA de la billetera ya pintada, no antes de
      // entrar: quien la ve entiende que ya tiene cuenta y que esto es lo que
      // hay que guardar, no un tramite mas de la puerta.
      if (semillaNueva) setTimeout(() => mostrarSemilla(semillaNueva), 600);
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
    movimientos = null; transferencias = []; tarjeta = null; movsTarjeta = []; ocultos = false;
    // El expediente de verificación se va con la sesión: dentro hay un número de
    // documento y dos fotografías, y no tienen por qué sobrevivir a un «salir».
    sol = null;
    /* Y el numero de tarjeta tampoco. Se limpiaba SOLO al cambiar de vista, asi
       que una sesion que caduca con la tarjeta destapada dejaba el PAN y el CVV
       en memoria — y como `vistaActual` tambien sobrevivia, la siguiente cuenta
       que entrara en ese navegador caia en la tarjeta y los veia pintados. Son
       dieciseis digitos que no son suyos. */
    secretoTarjeta = null; volteada = false; tokenAbierto = null;
    vistaActual = 'nucleo';
    /* El chat se va entero con su dueño: la lista de conversaciones de alguien
       no es lo primero que tiene que ver la persona siguiente. */
    chatParar();
    Object.assign(chatSt, { puerta: null, error: null, convs: null, con: null,
      msgs: null, busca: '', gente: null, ficha: null, yo: null,
      verCodigo: false, buscaMal: false });
    avisarChat = null; chatPendiente = null;
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
    // La tarjeta que ya se habia leido bien. Un tropiezo al refrescar no puede
    // hacerla desaparecer: quien la tiene en la mano no entiende que la
    // pantalla le diga que hubo un error donde antes estaba su plastico.
    const antes = tarjeta && !tarjeta.error && !tarjeta.falta ? tarjeta : null;
    try {
      tarjeta = await pedir('/cards/my-card');
    } catch (e) {
      // Un 404 SI es una respuesta: el emisor dice que esta persona no tiene
      // tarjeta, y eso manda sobre lo que hubiera guardado.
      tarjeta = e.estado === 404 ? { falta: true } : (antes || { error: e.message });
      // si se conservo la de antes, sus movimientos siguen siendo los suyos
      if (antes && e.estado !== 404) return;
      movsTarjeta = [];
      return;
    }
    try {
      const d = await pedir('/cards/transactions?limit=20');
      movsTarjeta = Array.isArray(d) ? d : (d?.items || d?.transactions || d?.data || []);
    } catch {
      // se conserva lo ultimo que llego: vaciarlo diria «no gastaste nada»
      // sobre una tarjeta con movimientos, que es la mentira de siempre
    }
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

  // El puente del backend publica /genesis/estado. Esta pantalla pedia
  // /genesis/status —una ruta que no existe— y traducia el 404 a 'sin-iniciar',
  // asi que la tarjeta decia «Sin verificar» a TODO el mundo, tuviera Genesis ID
  // aprobado o no. De ahi salia la cadena entera: como nunca constaba verificado,
  // siempre se pintaba el boton de verificar, y ese boton llevaba al panel de
  // operadores. Un 404 no es un estado del tramite: es la integracion rota, y
  // como tal hay que ensenarlo, no disfrazarlo de «sin verificar».
  /* Y la respuesta viene ANIDADA: {identidad:{estado,gid,…}}. Leyendo
     `identidad.estado` sobre el sobre —y no sobre la carta— sale `undefined`
     para todo el mundo, que es la misma mentira de antes con otra causa: el
     404 ya no la produce, pero el sobre sin abrir sí. Se desenvuelve una sola
     vez, aca, y el resto de la pantalla trabaja con un objeto plano. */
  async function cargarIdentidad() {
    // lo ultimo que se supo de esta persona, para no borrarselo por un tropiezo
    const antes = identidad && !identidad.error ? identidad : null;
    try { identidad = aVistaId(await pedir('/genesis/estado')); }
    catch (e) {
      /* Genesis ID se reinicia con cada despliegue y en ese minuto contesta
         mal. Un solo reintento con respiro cubre justo esa ventana — que es
         la diferencia entre «se cayo Genesis» y un parpadeo que nadie ve. */
      await new Promise(r => setTimeout(r, 2500));
      try { identidad = aVistaId(await pedir('/genesis/estado')); }
      catch (e2) {
        /* Si ya sabiamos que esta persona esta verificada, un fallo al
           REFRESCAR no lo desmiente: se conserva lo ultimo que dijo el
           servidor. Sin esto, un tropiezo de red le cambiaba la tarjeta a
           alguien verificado desde hace meses por un «Reintentar», y de paso
           le cerraba el chat —la puerta mira esVerificada()— hasta que
           recargara. Un estado que costo un tramite entero no se tira por una
           peticion que no llego. */
        identidad = antes || { error: e2.message, estado: null };
      }
    }
    /* Verificarse y quedar atado al GID son dos cosas distintas, y la web solo
       hacia la primera: la tarjeta decia «Verificada» y el GID salia, pero la
       cuenta nunca quedaba unida a esa identidad. Sin ese vinculo el pase a
       MyTokenPay sin repetir el KYC no funciona para quien se verifico por web.
       El telefono lo llama en el mismo momento. Se hace sin esperar y sin
       ruido: si falla, se reintenta en la siguiente carga. */
    if (esVerificada()) pedir('/genesis/vincular', { metodo: 'POST', cuerpo: {} }).catch(() => {});
  }

  /* La traduccion del servidor a lo que la pantalla necesita, calcada del
     cliente del telefono (orden-global-app/src/genesis.js) para que las dos
     lean lo mismo. `rostroPendiente` manda sobre el estado: un cotejo fallido
     se repite en veinte segundos y mandar a esa persona a la sala de espera
     serian dias perdidos por una foto con un reflejo. */
  const PASOS_GID = {
    iniciada: 'datos', datos: 'documento', documento: 'rostro',
    biometria: 'revision', 'en-revision': 'revision',
    verificada: 'listo', rechazada: 'rechazada', suspendida: 'suspendida',
  };
  function aVistaId(sobre) {
    const i = sobre?.identidad || (sobre?.estado ? sobre : null);
    if (!i) return { error: t('gid.errP'), estado: null };
    return {
      estado: i.estado,
      gid: i.gid || null,
      nombreLegal: i.nombreLegal || null,
      documentoAceptable: i.documentoAceptable,
      // El documento que entro como fotos no esta rechazado: esta esperando a
      // que lo lea una persona. Sin distinguirlo, la tarjeta le enseñaba a
      // TODO el que se verifica por web un «volve a subir el documento» sobre
      // un expediente que esta bien.
      documentoPorFotos: Boolean(i.documentoPorFotos),
      rostroPendiente: Boolean(i.rostroPendiente),
      fotoCredencial: i.fotoCredencial || null,
      faltanDatos: i.faltanDatos || [],
      umbral: Number(i.umbralDiligenciaUsd) || 10000,
      siguientePaso: i.siguientePaso || null,
      paso: i.rostroPendiente ? 'rostro' : (PASOS_GID[i.estado] || 'datos'),
      actualizadaEn: i.actualizadaEn || null,
    };
  }

  async function cargarMovimientos() {
    try {
      const d = await pedir('/wallet/deposits?limit=25');
      movimientos = Array.isArray(d) ? d : (d?.items || d?.deposits || d?.data || []);
      errMovs = null;
    } catch (e) {
      // Lo que ya se habia traido se queda: un tropiezo al refrescar no borra
      // el historial de nadie. Y se guarda el porque, para no llamarle «vacio»
      // a lo que en realidad no llego.
      errMovs = e.message;
    }
  }

  /* Lo que se enseña en Actividad es todo el movimiento de dinero: los
     depositos que registra el backend y las transferencias que quedaron en la
     cadena. Antes solo salian los depositos, asi que un envio recien hecho no
     aparecia por ningun lado — y no hay nada que uno quiera comprobar mas que
     eso, justo despues de mandarlo. */
  /* Los tres lectores de un movimiento, en un solo sitio.

     Las dos fuentes de la Actividad —los depósitos del backend y las
     transferencias de la cadena— llaman distinto a lo mismo, y cada pantalla
     que lo adivinaba por su cuenta se equivocaba en algo: la fecha de la
     cadena viene en `timestamp` EN SEGUNDOS (y por un tiempo solo con la S
     grande, `timeStamp`), mientras que la de un depósito viene en `at`; el
     monto de un depósito está en `origenAmount`, no en `amount`, así que la
     lista enseñaba ceros. Se lee todo aquí y una sola vez. */
  function movCuando(m) {
    const seg = m.timestamp ?? m.timeStamp;
    // la cadena da segundos; Date quiere milisegundos. Diez cifras = segundos.
    if (seg != null && seg !== '' && /^\d+$/.test(String(seg))) {
      const n = Number(seg);
      return new Date(n < 1e12 ? n * 1000 : n).getTime();
    }
    return new Date(m.createdAt || m.date || m.at || 0).getTime() || 0;
  }

  const movMonto = m => Number(m.amount ?? m.value ?? m.origenAmount ?? m.usdtAmount ?? 0) || 0;

  /* Entra o sale. La cadena manda `from` y `to` en los dos sentidos, así que
     lo que decide es cuál de los dos soy yo — antes, cuando solo venía `from`,
     el respaldo daba «sale» a todo lo recibido. */
  function movEntra(m) {
    const mia = (sesion?.direccion || '').toLowerCase();
    if (mia && m.to && String(m.to).toLowerCase() === mia) return true;
    if (mia && m.from && String(m.from).toLowerCase() === mia) return false;
    const d = (m.direction || m.type || '').toLowerCase();
    // «recive» está escrito así en el backend desde el principio: se acepta
    if (d.includes('in') || d.includes('reciv') || d.includes('recib')) return true;
    if (d.includes('out') || d.includes('send')) return false;
    // un depósito es dinero que llega, y no trae ni `from` ni `to`
    return m.usdtAmount != null || m.origenAmount != null;
  }

  function todoMovimiento() {
    const vistos = new Set();
    return [...(movimientos || []), ...transferencias]
      .filter(m => {
        const llave = m.hash || m.txHash || `${m.from}-${m.to}-${movMonto(m)}-${movCuando(m)}`;
        if (vistos.has(llave)) return false;
        vistos.add(llave);
        return true;
      })
      .sort((a, b) => movCuando(b) - movCuando(a));
  }

  // ── las vistas ────────────────────────────────────────────────────────────

  /* Las cinco pestañas son las mismas del telefono — billetera, tarjeta,
     cambiar, actividad, ajustes — y por el mismo motivo: quien usa la app en el
     bolsillo no tiene que volver a aprenderse donde esta cada cosa al abrirla en
     una pantalla grande. Enviar, recibir, comprar, depositar, la ficha de un
     token y Genesis ID no son pestañas: se entra a ellas desde algun lado y se
     vuelve, igual que alla. */
  const VISTAS = {
    nucleo, billetera, tarjeta: vTarjeta, cambiar, actividad, chat, ajustes,
    pay, payex, payneg,
    enviar, recibir, comprar, deposito, token: vToken, identidad: vIdentidad,
    remesas, contactos, sesiones, lector, seguridad, perfil, verificar, cobrar,
  };
  const PESTANAS = ['nucleo', 'billetera', 'tarjeta', 'cambiar', 'actividad', 'chat', 'ajustes'];
  // A que pestaña se le enciende la luz cuando estas en una vista que no es una.
  const DENTRO_DE = {
    enviar: 'billetera', recibir: 'billetera', comprar: 'billetera',
    deposito: 'billetera', token: 'billetera', identidad: 'ajustes',
    remesas: 'billetera', lector: 'billetera', verificar: 'ajustes', cobrar: 'billetera',
    pay: 'nucleo', payex: 'nucleo', payneg: 'nucleo',
    contactos: 'ajustes', sesiones: 'ajustes', seguridad: 'ajustes', perfil: 'ajustes',
  };

  /* ═══ EL BOTON ATRAS DEL NAVEGADOR ═══════════════════════════════════════
     Hasta ahora no existia una sola llamada a history en todo el proyecto:
     entrabas al chat desde el Nucleo, tocabas atras, y te ibas de la web
     entera. En un ecosistema que se vende como una sola casa, eso es una
     puerta que da a la calle en cada habitacion.

     Cada vista deja su marca en la direccion, y atras vuelve a la anterior.
     Los hash de INTENCION (#pagar, #chat?con=, #verificar con parametros) NO
     se pushean: son ordenes que llegan de fuera —un QR, un enlace— y las
     consume el arranque; empujarlas al historial haria que atras volviera a
     ejecutar el cobro. */
  let porPop = false;

  const rutaDe = (cual, dato) => {
    if (cual === 'token' && (dato || tokenAbierto)) return '#token/' + (dato || tokenAbierto);
    if (cual === 'payneg' && payNeg) return '#pay/n/' + payNeg;
    if (cual === 'payex') return '#pay/ex';
    return '#' + cual;
  };

  function leerRuta(h) {
    const txt = String(h || '').replace(/^#/, '');
    // una intencion no es una ruta: la trata el arranque, no el historial
    if (/^(pagar|chat\?|verificar\?)/.test(txt)) return null;
    const [a, b, c] = txt.split('/');
    if (a === 'token' && b) return { v: 'token', d: b };
    if (a === 'pay' && b === 'n' && c) return { v: 'payneg', neg: c };
    if (a === 'pay' && b === 'ex') return { v: 'payex' };
    return VISTAS[a] ? { v: a } : null;
  }

  addEventListener('popstate', (e) => {
    if (!sesion || $('#app').classList.contains('oculto')) return;
    const r = e.state?.v ? e.state : leerRuta(location.hash);
    if (!r) return;
    porPop = true;
    if (r.neg) payNeg = r.neg;
    vista(r.v, r.d);
    porPop = false;
  });

  function vista(cual, dato) {
    if (!VISTAS[cual]) cual = 'nucleo';
    // Salir de la tarjeta borra el numero y el CVV de la memoria y la deja de
    // frente otra vez. Nadie tiene por que volver y encontrarselos puestos.
    if (vistaActual === 'tarjeta' && cual !== 'tarjeta') { secretoTarjeta = null; volteada = false; }
    if (vistaActual === 'lector' && cual !== 'lector') cerrarCamara();
    // El latido del chat solo late mientras el chat esta en pantalla: un
    // intervalo vivo en segundo plano es trafico que nadie mira.
    if (vistaActual === 'chat' && cual !== 'chat') chatParar();
    // Salir de «enviar» cancela la intencion de publicar comprobante: la marca
    // no puede quedar esperando dias a un envio que ya es otro.
    if (vistaActual === 'enviar' && cual !== 'enviar') avisarChat = null;
    vistaActual = cual;
    if (cual === 'token' && dato) tokenAbierto = dato;
    const encendida = PESTANAS.includes(cual) ? cual : DENTRO_DE[cual];
    document.querySelectorAll('.nav[data-vista]').forEach(b =>
      b.dataset.vista === encendida ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
    const l = $('#lienzo');
    /* LA DIRECCIÓN DEL VIAJE. Entrar a una app y volver al Núcleo son dos
       gestos distintos y hasta ahora se veían igual. Yendo hacia dentro la
       pantalla llega desde un poco más lejos y se acerca; volviendo, llega
       desde un poco más cerca y se asienta. Es un detalle de 260ms que nadie
       nombra y que todo el mundo nota: sabés si avanzaste o si retrocediste
       sin leer una sola palabra.
       La clase se quita y se vuelve a poner con un reflow forzado en medio —
       si no, dos vistas seguidas no reinician la animación y la segunda entra
       en seco. */
    l.classList.remove('lz-dentro', 'lz-fuera');
    void l.offsetWidth;
    l.classList.add(cual === 'nucleo' ? 'lz-fuera' : 'lz-dentro');
    l.innerHTML = VISTAS[cual]();
    l.querySelectorAll('[data-al-cargar]').forEach(el => window[el.dataset.alCargar]?.(el));
    if (cual === 'recibir' || cual === 'deposito') pintarQr();
    if (cual === 'cobrar') pintarCobro();
    if (cual === 'enviar') $('#env-monto')?.focus();
    if (cual === 'cambiar') cambioMonto();
    if (cual === 'tarjeta' && !tarjeta) cargarTarjeta().then(() => { if (vistaActual === 'tarjeta') vista('tarjeta'); });
    if (cual === 'remesas' && !tasas) cargarTasas().then(() => { if (vistaActual === 'remesas') vista('remesas'); });
    if (cual === 'chat') chatEntrar();
    /* El cerebro solo respira cuando se lo mira: al entrar al Nucleo se monta
       sobre su canvas recien pintado, y al salir se para — un cerebro animando
       detras de la pantalla de enviar seria gastar bateria en nada. El fondo
       negro va y viene con el: la orden fue que el resto de la billetera
       quede como esta. */
    /* La direccion se actualiza DESPUES de pintar, y nunca cuando el cambio
       viene del propio boton atras (`porPop`) — si no, volver empujaria una
       entrada nueva y el historial no dejaria salir jamas. */
    if (!porPop && sesion) {
      const r = rutaDe(cual, dato);
      if (location.hash !== r) history.pushState({ v: cual, d: dato, neg: payNeg }, '', r);
    }
    document.body.classList.toggle('en-cerebro', cual === 'nucleo');
    /* Mientras la bienvenida esta encima, EL CEREBRO ES SUYO: hay una sola
       red y montarla de nuevo aqui la mataria. Pasaba de verdad — los datos
       terminaban de cargar, cargarTodo() repintaba la vista, y el cerebro de
       la bienvenida se quedaba congelado a media frase. Cuando la bienvenida
       se va, ella misma enciende el del Nucleo. */
    if (!$('#aura-bienvenida').classList.contains('oculto')) return;
    if (cual === 'nucleo') encenderCerebro(false);
    else { AURA.pararRed(); tourApagar(); }
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
          : dia ? `<span class="${sube ? 'px-sube' : 'px-baja'}">${sube ? '+' : '−'}${tapa(usd(Math.abs(dia.usd)))}</span>
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
        ? `<span class="${x.chg < 0 ? 'px-baja' : 'px-sube'}">${x.chg > 0 ? '+' : ''}${x.chg.toFixed(2)}%</span>` : '';
      return `
      <button class="moneda" onclick="VETA.vista('token',${jsTxt(x.s)})"
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
    /* Los OCHO estados del servidor, no cuatro. `biometria` es la sala de
       espera igual que `en-revision` —el expediente esta completo y le toca a
       una persona— y pintarlo como «sin verificar» le decia a alguien que ya
       habia mandado todo que no habia empezado. Y `iniciada`, `datos` y
       `documento` son un tramite a medio hacer: la salida no es empezar, es
       seguir. */
    const mapa = {
      verificada: ['e-ok', t('gid.ok'), t('gid.okP')],
      verified: ['e-ok', t('gid.ok'), t('gid.okP')],
      'en-revision': ['e-rev', t('gid.rev'), t('gid.revP')],
      biometria: ['e-rev', t('gid.rev'), t('gid.revP')],
      iniciada: ['e-no', t('gid.curso'), t('gid.cursoP')],
      datos: ['e-no', t('gid.curso'), t('gid.cursoP')],
      documento: ['e-no', t('gid.curso'), t('gid.cursoP')],
      rechazada: ['e-mal', t('gid.mal'), t('gid.malP')],
      suspendida: ['e-mal', t('gid.sus'), t('gid.susP')],
    };
    /* Si la consulta al puente falla, se dice que fallo. Ensenar «Sin
       verificar» cuando en realidad no se pudo preguntar es lo que tuvo
       escondido este fallo de integracion: la pantalla daba una respuesta
       tranquilizadora —y falsa— en lugar de un error que alguien habria
       mirado. */
    /* MIENTRAS CARGA NO SE OPINA. Con `identidad` en null —los primeros
       segundos de cada sesion— el mapa de estados caia al default «Sin
       verificar» CON su boton de verificar: a alguien con su Genesis ID
       aprobado hace meses se le ofrecia hacer el tramite otra vez. Es la
       misma mentira tranquilizadora que este archivo jura no cometer. */
    if (!identidad) return `
    <div class="bloque vidrio">
      <div class="gid">
        <div class="gid-ic"><svg viewBox="0 0 24 24">${ICO.id}</svg></div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <h3>Genesis ID</h3><span class="estado esqueleto">·····</span>
          </div>
          <p class="pie esqueleto" style="margin-top:8px">·······················</p>
        </div>
      </div>
    </div>`;
    const fallo = Boolean(identidad?.error);
    const [clase, titulo, texto] = fallo
      ? ['e-mal', t('gid.err'), t('gid.errP')]
      : (mapa[e] || ['e-no', t('gid.no'), t('gid.noP')]);
    const listo = clase === 'e-ok';
    /* El boton lleva a la verificacion de esta misma web. Antes salia a
       genesis-id.onrender.com, que es el panel de cumplimiento del equipo: se
       le pedia correo y contraseña de operador a quien solo queria verificarse,
       y ahi no hay forma de registrarse. Ahora se queda en casa, con la sesion
       que ya tiene puesta. */
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
          ${listo || compacta ? '' : fallo
            ? `<div style="margin-top:16px"><button class="btn btn-linea btn-sm" onclick="VETA.reintentar()">${t('saldo.re')}</button></div>`
            : botonGid(e)}
        </div>
      </div>
    </div>`;
  }

  /* Que ofrece la tarjeta segun donde este el tramite.
     Con el expediente ya entregado NO se ofrece nada: un boton de «verificar mi
     identidad» debajo de «en revision» le dice a alguien que lo mandado no
     valio y que hay que repetirlo. Y una identidad suspendida no se arregla
     desde acá: la levanta un operador. */
  function botonGid(estado) {
    if (estado === 'en-revision' || estado === 'biometria' || estado === 'suspendida') {
      /* Un expediente en revision no lleva boton: no hay nada que hacer mas que
         esperar. Con DOS excepciones, y las dos existen porque sin ellas la
         persona se queda encerrada:

           · el rostro no cotejo — se repite la foto;
           · el documento quedo marcado como no valido — hay que volver a
             subirlo. Esto pasaba y no habia salida: la pantalla decia «En
             revision», que es tranquilizador, sobre un expediente que iba
             derecho al rechazo. */
      if (identidad?.rostroPendiente) {
        return `<div style="margin-top:16px"><button class="btn btn-oro btn-sm" onclick="VETA.vista('verificar')">${t('ver.repetirCara')}</button></div>`;
      }
      if (identidad?.documentoAceptable === false && !identidad?.documentoPorFotos) {
        return `<div style="margin-top:16px"><button class="btn btn-oro btn-sm" onclick="VETA.vista('verificar')">${t('ver.arreglarDoc')}</button></div>`;
      }
      return '';
    }
    const etiqueta = estado === 'rechazada' ? t('gid.rehacer')
      : ['iniciada', 'datos', 'documento'].includes(estado) ? t('gid.seguir')
        : t('gid.btn');
    return `<div style="margin-top:16px"><button class="btn btn-oro btn-sm" onclick="VETA.vista('verificar')">${etiqueta}</button></div>`;
  }

  function listaMovimientos(limite) {
    const todos = todoMovimiento();
    const l = todos.slice(0, limite || todos.length);
    // Todavia sin respuesta: barras, no un veredicto.
    if (movimientos === null && !errMovs && !transferencias.length) return [0, 1, 2].map(() => `
      <div class="hilera">
        <div class="ic esqueleto"></div>
        <div class="txt"><b class="esqueleto">············</b><small class="esqueleto">·········</small></div>
      </div>`).join('');
    if (!l.length) return errMovs
      /* No llego, que no es lo mismo que no haber. Aqui el boton SI sirve:
         vuelve a pedirlo. */
      ? `<div class="vacio">
        <b>${t('ini.noVinoT')}</b>
        ${t('ini.noVinoP')}
        <div style="margin-top:16px"><button class="btn btn-linea btn-sm" onclick="VETA.reintentar()">${t('saldo.re')}</button></div>
      </div>`
      : `<div class="vacio">
        <b>${t('ini.vacioT')}</b>
        ${t('ini.vacioP')}
      </div>`;
    return l.map(m => {
      const entra = movEntra(m);
      const monto = Math.abs(movMonto(m));
      // el símbolo importa: sin él, medio ONDK y medio ORIGEN son la misma fila
      const sim = m.symbol || m.token || (m.usdtAmount != null ? 'ORIGEN' : '');
      // en un envío interesa a quién fue; en lo recibido, de quién vino
      const contra = entra ? (m.from || m.to) : (m.to || m.from);
      return `
      <div class="hilera">
        <div class="ic"><svg viewBox="0 0 24 24">${entra ? ICO.recibir : ICO.enviar}</svg></div>
        <div class="txt">
          <b>${entra ? t('act.entra') : t('act.sale')}${sim ? ` <em class="act-sim">${esc(sim)}</em>` : ''}</b>
          <small class="mono">${esc(cortaDir(contra || m.hash || ''))} · ${esc(cuando(movCuando(m)))}</small>
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
      <button class="atajo" onclick="VETA.vista('cobrar')">
        <span class="atajo-ic"><svg viewBox="0 0 24 24">${ICO.tienda}</svg></span>
        <span><b>${t('cob.t')}</b><small>${t('cob.sub')}</small></span>
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
      [t('tok.red'), 'Orden Global · 5550 · Layer 1 · Besu QBFT · Shanghai'],
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
      ${/* Leer que es una moneda y no poder moverla desde ahi es hacer volver
            atras por gusto. Enviar arranca ya con esta moneda elegida. */''}
      <div class="ficha-btns">
        <button class="btn btn-oro btn-sm" onclick="VETA.envElegir(${jsTxt(x.s)})">
          <svg viewBox="0 0 24 24" class="btn-ic">${ICO.enviar}</svg>${t('a.enviar')}</button>
        <button class="btn btn-linea btn-sm" onclick="VETA.vista('recibir')">
          <svg viewBox="0 0 24 24" class="btn-ic">${ICO.recibir}</svg>${t('a.recibir')}</button>
      </div>
      <p class="ficha-desc">${esc(f.d)}</p>
      <dl class="datos">
        ${filas.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="${k === t('tok.contrato') && !x.nativo ? 'mono' : ''}">${esc(v || '—')}</dd></div>`).join('')}
      </dl>
      ${x.nativo ? '' : `<button class="btn btn-linea btn-sm" onclick="VETA.copiarContrato(${jsTxt(x.contrato)})">
        <svg viewBox="0 0 24 24" class="btn-ic">${ICO.copiar}</svg>${t('tok.copiarC')}</button>`}
    </div>`;
  }

  const origen = () => (cartera || []).find(x => x.s === 'ORIGEN') || null;

  /* Lo que cuesta una transferencia nativa a 400 gwei por 21000 de gas. Es el
     mismo numero que usa el telefono como respaldo. Solo se usa para no dejar
     el saldo en cero al pulsar MAX: el importe real lo pone la cadena. */
  const COMISION_RED = 0.0084;

  /* Qué moneda se está enviando. Vive fuera de la vista porque la pantalla se
     redibuja entera al elegir otra y hay que acordarse de cuál era. */
  let envSim = 'ORIGEN';
  const envActivo = () => (cartera || []).find(x => x.s === envSim) || origen();

  /* Hasta hoy esta pantalla solo movía ORIGEN: quien tenía ONDK, AUKA o
     cualquiera de los otros catorce no podía mandarlos desde el navegador. El
     backend sabía hacerlo desde siempre —`/transaction/sendToken`, con el
     contrato como parámetro—; simplemente nadie lo llamaba desde acá.

     La comisión se paga SIEMPRE en ORIGEN, tambien cuando lo que viaja es un
     token. Por eso se avisa antes, y no despues de un envio que se cae. */
  function enviar() {
    if (!cartera) return `
      <div class="cab"><div><h2>${t('env.tX')}</h2></div></div>
      <div class="bloque vidrio"><div class="vacio">
        <b>${t('env.sinCartera')}</b>
        <div style="margin-top:16px"><button class="btn btn-linea btn-sm" onclick="VETA.reintentar()">${t('ini.act')}</button></div>
      </div></div>`;

    const x = envActivo();
    if (!x) return `
      <div class="cab"><div><h2>${t('env.tX')}</h2></div></div>
      <div class="bloque vidrio"><p class="pie">${t('ini.errSaldos')}</p></div>`;

    // Solo se ofrecen las monedas que se tienen: un selector lleno de ceros es
    // un catalogo, no una eleccion.
    const conSaldo = cartera.filter(m => (m.cant ?? 0) > 0);
    const lista = conSaldo.length ? conSaldo : cartera.slice(0, 1);
    const sinOrigen = (origen()?.cant ?? 0) <= 0;
    const contactos = leerContactos();

    const fichas = lista.map(m => `
      <button type="button" class="env-ficha" ${m.s === x.s ? 'data-elegida' : ''}
              onclick="VETA.envElegir(${jsTxt(m.s)})" aria-pressed="${m.s === x.s}">
        ${disco(m)}
        <span><b>${esc(m.s)}</b><small>${tapa(oro(m.cant ?? 0))}</small></span>
      </button>`).join('');

    return `
    <div class="cab"><div>
      <h2>${t('env.tX')} ${esc(x.s)}</h2>
      <div class="sub">${t('env.tenes')} ${tapa(oro(x.cant ?? 0))} ${esc(x.s)} ${t('env.dispX')}</div>
    </div></div>
    <div class="bloque vidrio">
      <h3>${t('env.moneda')}</h3>
      <div class="env-fichas">${fichas}</div>
    </div>
    <div class="bloque vidrio">
      <form onsubmit="return VETA.mandar(event)">
        <div class="campo">
          <label for="env-dir">${t('env.dir')}</label>
          <input id="env-dir" class="mono" placeholder="0x…" autocomplete="off" spellcheck="false" required>
          ${contactos.length ? `<select class="env-contactos" onchange="VETA.envContacto(this.value); this.selectedIndex=0">
            <option value="">${t('env.contactos')}</option>
            ${contactos.map(c => `<option value="${esc(c.dir)}">${esc(c.nombre)}</option>`).join('')}
          </select>` : ''}
        </div>
        <div class="campo">
          <label for="env-monto">${t('env.cant')}</label>
          <div class="env-monto">
            <input id="env-monto" type="text" inputmode="decimal" placeholder="0,00"
                   oninput="VETA.envMonto()" required>
            <button type="button" class="env-max" onclick="VETA.envMax()">${t('env.max')}</button>
          </div>
          <div class="env-usd" id="env-usd"></div>
        </div>
        <div class="campo">
          <label for="env-clave">${t('env.clave')}</label>
          <input id="env-clave" type="password" autocomplete="current-password" placeholder="••••••••" required>
        </div>
        <div id="env-aviso" class="aviso oculto" role="alert"></div>
        <button class="btn btn-oro btn-full" id="env-btn" type="submit">${t('env.revisar')}</button>
      </form>
      ${x.nativo ? '' : `<div class="nota" style="margin-top:16px">${t('env.comision')}</div>`}
      ${sinOrigen ? `<div class="nota nota-cuidado" style="margin-top:12px">${t('env.sinOrigen')}</div>` : ''}
      <p class="pie" style="margin-top:16px">${t('env.nota')}</p>
    </div>`;
  }

  /* Cambiar de moneda tira lo escrito a proposito: la cantidad que tenia
     sentido en ORIGEN no lo tiene en ONDK, y arrastrarla es como se manda de
     mas. Tambien se olvida la confirmacion pendiente, para que el segundo
     toque no confirme un envio que ya no es el que se leyo. */
  function envElegir(sim) {
    if (!(cartera || []).some(m => m.s === sim)) return;
    envSim = sim;
    pendiente = null;
    vista('enviar');
  }

  function envContacto(dir) {
    if (!dir) return;
    const c = $('#env-dir');
    if (c) { c.value = dir; $('#env-monto')?.focus(); }
  }

  // El maximo de un token es su saldo entero. En ORIGEN no: hay que dejar con
  // que pagar la comision, o el envio se cae despues de haberlo confirmado.
  function envMax() {
    const x = envActivo();
    if (!x || x.cant == null) return;
    const tope = x.nativo ? Math.max(0, x.cant - COMISION_RED) : x.cant;
    const c = $('#env-monto');
    if (c) { c.value = String(Number(tope.toFixed(6))); envMonto(); c.focus(); }
  }

  // El equivalente en dolares, debajo del campo, mientras se escribe. Sin
  // precio no se inventa nada: se deja el hueco vacio.
  function envMonto() {
    const d = $('#env-usd');
    if (!d) return;
    const x = envActivo();
    const n = Number(String($('#env-monto')?.value || '').replace(',', '.'));
    d.textContent = (x?.precio != null && n > 0) ? '≈ ' + usd(n * x.precio) : '';
  }

  /* Enviar dinero pide dos confirmaciones distintas: primero se enseña lo que
     va a pasar, y solo después se manda. Un solo botón convierte un dedo torpe
     en una transferencia que no vuelve. */
  let enviando = false, pendiente = null;
  async function mandar(ev) {
    ev.preventDefault();
    const x = envActivo();
    const dir = $('#env-dir').value.trim();
    const monto = Number(String($('#env-monto').value).replace(',', '.'));
    const clave = $('#env-clave').value;
    const a = $('#env-aviso'), b = $('#env-btn');
    const decir = t => { a.textContent = t; a.className = 'aviso aviso-mal'; a.classList.remove('oculto'); };

    if (!x) return decir(t('ini.errSaldos'));
    if (!/^0x[a-fA-F0-9]{40}$/.test(dir)) return decir(t('env.eDir'));
    if (!(monto > 0)) return decir(t('env.eCant'));
    const disp = x.cant;
    if (disp != null && monto > disp) return decir(`${t('env.eAlcanza')} ${oro(disp)} ${x.s}.`);
    if (!clave) return decir(t('env.eClave'));
    // Mover un token gasta ORIGEN. Sin ORIGEN el envio se cae en la cadena,
    // asi que se corta antes en vez de dejarlo llegar hasta el rechazo.
    if (!x.nativo && (origen()?.cant ?? 0) <= 0) return decir(t('env.sinOrigen'));

    if (!pendiente || pendiente.dir !== dir || pendiente.monto !== monto || pendiente.sim !== x.s) {
      pendiente = { dir, monto, sim: x.s, contrato: x.contrato || null, nativo: !!x.nativo,
                    sello: 'web-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) };
      a.className = 'aviso aviso-ok';
      // Sin precio real no se muestra un equivalente en dolares: mas vale no
      // decir nada que decir un numero que nadie puede sostener.
      const pu = x.precio;
      const enUsd = pu != null ? ` (${esc(usd(monto * pu))})` : '';
      a.innerHTML = `${t('env.vas')} <b>${oro(monto)} ${esc(x.s)}</b>${enUsd} ${t('env.a')} <span class="mono">${esc(cortaDir(dir))}</span>. ${t('env.toca')}`;
      a.classList.remove('oculto');
      b.textContent = t('env.confirmar');
      return;
    }

    if (enviando) return;      // el candado: un doble toque no manda dos veces
    enviando = true;
    b.disabled = true;
    b.innerHTML = '<span class="girando"></span> ' + t('env.enviando');
    try {
      /* La moneda de la casa va por una ruta y los tokens por otra: la nativa
         se transfiere sola, un ERC-20 necesita saber en que contrato vive. */
      const ruta = pendiente.nativo ? '/transaction/send' : '/transaction/sendToken';
      const r = await pedir(ruta, {
        // Sin reintento automatico: si el token vencio a mitad del envio, este
        // POST pudo haber salido igual. Repetirlo seria mandar el dinero dos
        // veces; es preferible enseñar el error y que se compruebe.
        metodo: 'POST', espera: 90000, sinReintento: true,
        cuerpo: {
          chain_id: CHAIN, recipientAddress: dir, amount: String(monto),
          password: clave,
          ...(pendiente.nativo ? {} : { tokenContractAddress: pendiente.contrato }),
          // El mismo envío reintentado lleva el mismo sello: el backend
          // descarta el segundo en vez de transferir dos veces.
          idempotencyKey: pendiente.sello,
        },
      });
      const hash = r?.hash || r?.transactionHash || r?.txId || null;
      const sim = pendiente.sim;
      pendiente = null;
      /* Si este envío salió DESDE un hilo del chat, el comprobante se publica
         allí — y solo ahora, con la cadena ya confirmada y el hash en la mano.
         No mueve dinero: deja la tarjeta con el hash para que cualquiera lo
         compruebe en el explorador. Si el relevo no está, el envío ya está
         hecho igual: esto no puede hacer fallar una transferencia. */
      if (avisarChat && hash && CHAT.listo()
          && avisarChat.dir === String(dir).toLowerCase()) {
        const destino = avisarChat;
        avisarChat = null;
        CHAT.pago({ para: destino.id, monto: String(monto), moneda: sim, hash })
          .then(() => { if (vistaActual === 'chat') chatCargarMsgs(true); })
          .catch(() => {});
      } else {
        avisarChat = null;
      }
      a.className = 'aviso aviso-ok';
      a.innerHTML = `${t('env.hecho')} ${oro(monto)} ${esc(sim)}.${hash ? ` <span class="mono">${esc(cortaDir(hash))}</span>` : ''}`;
      $('#env-dir').value = ''; $('#env-monto').value = ''; $('#env-clave').value = '';
      envMonto();
      b.textContent = t('env.revisar');
      avisar(t('env.avHecho'));
      cargarCartera().then(() => {
        if (vistaActual !== 'enviar') return;
        const y = envActivo();
        $('.cab .sub').textContent = `${t('env.tenes')} ${tapa(oro(y?.cant ?? 0))} ${y?.s || ''} ${t('env.dispX')}`;
      });
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

  // ── verificar la identidad, desde el navegador ────────────────────────────

  /* POR QUE EXISTE ESTA PANTALLA
   *
   * El boton «Verificar mi identidad» salia a genesis-id.onrender.com, que es el
   * PANEL DE CUMPLIMIENTO DEL EQUIPO —donde se aprueban las identidades ajenas—.
   * A quien solo queria verificarse se le pedia un correo y una contraseña de
   * operador que nunca tuvo, y ahi no hay forma de registrarse. Ahora el tramite
   * se hace aca entero, con la sesion que la web ya tiene puesta, y viaja por el
   * mismo puente que usa la app del telefono:
   *
   *   navegador ──JWT──▶ backend de Veta Wallet (/genesis/*) ──X-API-Key──▶ Genesis ID
   *
   * ESTA PANTALLA NO APRUEBA NADA, y ningun texto de aca puede insinuarlo. Reune
   * lo que hace falta, lo manda y enseña lo que conteste el servidor. Quien
   * decide es una persona del equipo de cumplimiento, del lado de Genesis.
   *
   * LO QUE UN NAVEGADOR NO PUEDE HACER
   *
   * El puente solo acepta el documento como TEXTO: /genesis/documento pide la
   * MRZ —las lineas del pie— y Genesis devuelve 400 sin ella. Toda la tuberia se
   * diseño dando por hecho que el reconocimiento optico se hace en el telefono y
   * que la foto del documento no viaja nunca. Aca no hay ese lector, asi que la
   * MRZ se copia a mano. Se dice sin rodeos en el primer paso, y se ofrece la app
   * a quien prefiera el otro camino: esconderlo seria vender un lector que no
   * existe y dejar a la gente peleandose con una foto que no se lee sola.
   *
   * Y `textoAnverso` NO se manda. Ese campo es donde el telefono pone lo que LEYO
   * del anverso, y Genesis lo usa para confirmar que el nombre declarado esta
   * de verdad impreso en el documento. Poner ahi el nombre que la persona acaba
   * de teclear seria confirmarlo consigo mismo: una comprobacion inventada
   * metida en un expediente de cumplimiento.
   */

  /* Los paises, con el codigo de TRES letras, que es el que guarda Genesis y el
     que lleva la MRZ. Los nombres los pone Intl.DisplayNames, que el navegador ya
     trae en los dos idiomas: doscientas cincuenta traducciones escritas a mano
     serian doscientos cincuenta sitios donde equivocarse. La tabla de tres letras
     a dos existe porque Intl solo entiende las de dos y no hay forma de deducirla.
     La lista es la misma que usa la app del telefono (orden-global-app/src/paises.js),
     que a su vez es la de Genesis: asi el codigo que se manda siempre es uno que
     el servidor reconoce. */
  const ISO_PAISES = (
    'ABWAW AFGAF AGOAO AIAAI ALAAX ALBAL ANDAD AREAE ARGAR ARMAM ASMAS ATAAQ ATFTF ATGAG ' +
    'AUSAU AUTAT AZEAZ BDIBI BELBE BENBJ BESBQ BFABF BGDBD BGRBG BHRBH BHSBS BIHBA BLMBL ' +
    'BLRBY BLZBZ BMUBM BOLBO BRABR BRBBB BRNBN BTNBT BVTBV BWABW CAFCF CANCA CCKCC CHECH ' +
    'CHLCL CHNCN CIVCI CMRCM CODCD COGCG COKCK COLCO COMKM CPVCV CRICR CUBCU CUWCW CXRCX ' +
    'CYMKY CYPCY CZECZ DEUDE DJIDJ DMADM DNKDK DOMDO DZADZ ECUEC EGYEG ERIER ESHEH ESPES ' +
    'ESTEE ETHET FINFI FJIFJ FLKFK FRAFR FROFO FSMFM GABGA GBRGB GEOGE GGYGG GHAGH GIBGI ' +
    'GINGN GLPGP GMBGM GNBGW GNQGQ GRCGR GRDGD GRLGL GTMGT GUFGF GUMGU GUYGY HKGHK HMDHM ' +
    'HNDHN HRVHR HTIHT HUNHU IDNID IMNIM INDIN IOTIO IRLIE IRNIR IRQIQ ISLIS ISRIL ITAIT ' +
    'JAMJM JEYJE JORJO JPNJP KAZKZ KENKE KGZKG KHMKH KIRKI KNAKN KORKR KWTKW LAOLA LBNLB ' +
    'LBRLR LBYLY LCALC LIELI LKALK LSOLS LTULT LUXLU LVALV MACMO MAFMF MARMA MCOMC MDAMD ' +
    'MDGMG MDVMV MEXMX MHLMH MKDMK MLIML MLTMT MMRMM MNEME MNGMN MNPMP MOZMZ MRTMR MSRMS ' +
    'MTQMQ MUSMU MWIMW MYSMY MYTYT NAMNA NCLNC NERNE NFKNF NGANG NICNI NIUNU NLDNL NORNO ' +
    'NPLNP NRUNR NZLNZ OMNOM PAKPK PANPA PCNPN PERPE PHLPH PLWPW PNGPG POLPL PRIPR PRKKP ' +
    'PRTPT PRYPY PSEPS PYFPF QATQA REURE ROURO RUSRU RWARW SAUSA SDNSD SENSN SGPSG SGSGS ' +
    'SHNSH SJMSJ SLBSB SLESL SLVSV SMRSM SOMSO SPMPM SRBRS SSDSS STPST SURSR SVKSK SVNSI ' +
    'SWESE SWZSZ SXMSX SYCSC SYRSY TCATC TCDTD TGOTG THATH TJKTJ TKLTK TKMTM TLSTL TONTO ' +
    'TTOTT TUNTN TURTR TUVTV TWNTW TZATZ UGAUG UKRUA UMIUM URYUY USAUS UZBUZ VATVA VCTVC ' +
    'VENVE VGBVG VIRVI VNMVN VUTVU WLFWF WSMWS YEMYE ZAFZA ZMBZM ZWEZW').split(' ');

  let paisesCache = null;
  function paises() {
    if (paisesCache?.i === idiomaActivo()) return paisesCache.l;
    // Navegador sin Intl.DisplayNames: se queda el codigo de tres letras. Es
    // feo, pero es cierto — y sigue siendo elegible.
    let nombre = c => c;
    try {
      const dn = new Intl.DisplayNames([idiomaActivo()], { type: 'region' });
      nombre = c => dn.of(c) || c;
    } catch {}
    const l = ISO_PAISES
      .map(p => ({ c: p.slice(0, 3), n: nombre(p.slice(3)) }))
      .sort((a, b) => a.n.localeCompare(b.n, idiomaActivo()));
    paisesCache = { i: idiomaActivo(), l };
    return l;
  }

  const opcionesPais = elegido => `<option value="">${t('ver.elegi')}</option>` +
    paises().map(p => `<option value="${p.c}"${p.c === elegido ? ' selected' : ''}>${esc(p.n)}</option>`).join('');

  // ── la MRZ ────────────────────────────────────────────────────────────────

  /* Las mismas reglas que el telefono (orden-global-app/src/genesis.js): en
     mayusculas, sin espacios y una linea por renglon. Los «<» se teclean mal con
     frecuencia, asi que se aceptan tambien los caracteres con los que la gente
     los sustituye por error. */
  function limpiarMrz(texto) {
    return String(texto || '').toUpperCase()
      .replace(/[«»‹›]/g, '<')
      .split(/[\r\n]+/)
      .map(l => l.replace(/[^A-Z0-9<]/g, ''))
      .filter(Boolean)
      .join('\n');
  }

  /* Solo la FORMA: cuantas lineas y de que largo. Los digitos de control los
     comprueba Genesis, que es donde deben comprobarse; esto unicamente evita
     gastar un viaje al servidor para que conteste lo que ya se ve desde aca. */
  function formaMrz(texto) {
    const lineas = limpiarMrz(texto).split('\n').filter(Boolean);
    const largos = lineas.map(l => l.length);
    const formato = lineas.length === 2 && largos.every(l => l === 44) ? 'TD3'
      : lineas.length === 2 && largos.every(l => l === 36) ? 'TD2'
        : lineas.length === 3 && largos.every(l => l === 30) ? 'TD1' : null;
    return { ok: Boolean(formato), formato, lineas, largos };
  }

  /* Donde estan el numero, la nacionalidad y la fecha de nacimiento dentro de la
     MRZ, segun el formato. Sirve para una sola cosa: avisar en el momento de que
     lo copiado no cuadra con lo declarado arriba. Un caracter mal transcrito se
     arregla mirando el documento, que se tiene en la mano; enterarse dias
     despues, por un rechazo, es perder el trámite por una letra. */
  function datosMrz(f) {
    if (!f.ok) return null;
    const sin = s => s.replace(/</g, '').trim();
    if (f.formato === 'TD1') {
      return { num: sin(f.lineas[0].slice(5, 14)), nacion: sin(f.lineas[1].slice(15, 18)), nacim: f.lineas[1].slice(0, 6) };
    }
    // TD2 y TD3 comparten la segunda linea en las posiciones que importan.
    return { num: sin(f.lineas[1].slice(0, 9)), nacion: sin(f.lineas[1].slice(10, 13)), nacim: f.lineas[1].slice(13, 19) };
  }

  const soloAlfa = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  /* Los desajustes entre lo declarado y lo copiado. Son AVISOS, no bloqueos: la
     MRZ de un documento raro puede traer el numero en otro sitio, y frenar a
     alguien por eso seria peor que dejarlo mandar y que el servidor lo mire. */
  function avisosMrz() {
    const f = formaMrz(sol.mrz);
    const d = datosMrz(f);
    if (!d) return [];
    const avisos = [];
    /* El hueco del numero son NUEVE caracteres, y una cedula hondureña tiene
       trece: lo que no cabe se pasa al campo opcional, asi que la MRZ trae el
       principio del numero y nada mas. Por eso se compara por el comienzo y no
       por igualdad — exigirla convertiria a media Honduras en un aviso falso. */
    const nDic = soloAlfa(sol.numDoc), nMrz = soloAlfa(d.num);
    if (nDic && nMrz && !nDic.startsWith(nMrz) && !nMrz.startsWith(nDic)) avisos.push(t('ver.mrzNum'));
    if (sol.nacion && d.nacion && sol.nacion !== d.nacion) avisos.push(t('ver.mrzNacion'));
    if (sol.dia && sol.mes && sol.anio && /^\d{6}$/.test(d.nacim)) {
      const yy = Number(d.nacim.slice(0, 2));
      const siglo = yy > Number(String(new Date().getFullYear()).slice(2)) ? 1900 : 2000;
      const mismo = siglo + yy === Number(sol.anio) &&
        Number(d.nacim.slice(2, 4)) === Number(sol.mes) &&
        Number(d.nacim.slice(4, 6)) === Number(sol.dia);
      if (!mismo) avisos.push(t('ver.mrzFecha'));
    }
    return avisos;
  }

  // ── achicar las fotos antes de mandarlas ──────────────────────────────────

  /* Una foto de un movil de hoy pesa entre tres y ocho megas, y en base64 crece
     un tercio mas. La tuberia la rechaza —Genesis corta en 5 MB por imagen ya
     decodificada— y, aunque entrara, subir eso por datos moviles son minutos.
     Asi que se reduce en el navegador ANTES de enviar: 1600 px de lado mayor,
     que es de sobra para leer un documento, y calidad 0,85. Si aun asi no entra,
     se baja la calidad y despues el tamaño; y si ni asi entra, se dice —no se
     manda algo que se sabe que va a rebotar. */
  const VER_LADO = [1600, 1200, 900];
  const VER_CALIDAD = [0.85, 0.7, 0.55, 0.42];
  // El tope se mide sobre el texto base64, que es lo que viaja de verdad. Con un
  // mega por imagen el cuerpo entero queda muy por debajo de los 25 MB del
  // puente y de los 5 MB por imagen de Genesis, y sube en un tiempo razonable.
  const VER_TOPE = 1100000;

  function achicar(archivo) {
    return new Promise((salir_, fallar) => {
      if (!archivo) return fallar(new Error(t('ver.eNoImg')));
      if (!/^image\//.test(archivo.type || '')) return fallar(new Error(t('ver.eNoImg')));
      const url = URL.createObjectURL(archivo);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let d = null;
        try { d = aLienzo(img); } catch { return fallar(new Error(t('ver.eImg'))); }
        // `null` no es un error de lectura: es una foto que no hay forma de
        // meter en el limite, y se dice con otras palabras.
        d ? salir_(d) : fallar(new Error(t('ver.ePeso')));
      };
      img.onerror = () => { URL.revokeObjectURL(url); fallar(new Error(t('ver.eImg'))); };
      img.src = url;
    });
  }

  function aLienzo(img) {
    const ancho = img.naturalWidth || img.width;
    const alto = img.naturalHeight || img.height;
    if (!ancho || !alto) throw new Error('sin medidas');
    for (const lado of VER_LADO) {
      const k = Math.min(1, lado / Math.max(ancho, alto));
      const l = document.createElement('canvas');
      l.width = Math.max(1, Math.round(ancho * k));
      l.height = Math.max(1, Math.round(alto * k));
      const cx = l.getContext('2d');
      // Fondo blanco: un JPEG no tiene transparencia y, sin esto, un PNG con
      // fondo transparente sale con el documento sobre negro.
      cx.fillStyle = '#FFFFFF';
      cx.fillRect(0, 0, l.width, l.height);
      cx.drawImage(img, 0, 0, l.width, l.height);
      for (const q of VER_CALIDAD) {
        const d = l.toDataURL('image/jpeg', q);
        if (d.length <= VER_TOPE) return d;
      }
    }
    return null;
  }

  // ── el expediente a medio llenar ──────────────────────────────────────────

  /* Vive en memoria y en ningun sitio mas. Adentro hay un numero de documento,
     una fecha de nacimiento y dos fotografias: escribir eso en localStorage lo
     dejaria en el disco de una maquina que puede ser de un cibercafe, y ahi
     sigue mañana. Se pierde al recargar, y eso es lo correcto. */
  let sol = null;

  function nuevaSolicitud() {
    return {
      paso: 1,
      nombre: '', tipoDoc: 'pasaporte', numDoc: '', dia: '', mes: '', anio: '',
      nacion: '', reside: '', volumen: '', pep: null,
      opc: false, ocupacion: '', fondos: '', proposito: '', tel: '', domicilio: '',
      frente: null, reverso: null, mrz: '', selfie: null,
      error: '', enviando: false, etapa: '', hecho: 0, resultado: null,
      // Si el punto de partida ya se fijó con el estado del servidor en la mano.
      colocado: false,
    };
  }

  /* Por donde se entra. Quien ya declaro sus datos no tiene que volver a
     escribirlos: el servidor los guardo. Se empieza en el documento incluso
     cuando lo unico que fallo fue el rostro, y no en la selfie: el cotejo
     necesita la foto del documento para comparar contra algo, y esa foto no se
     guarda en ningun lado — mandar una selfie sola dejaria el cotejo fallando
     otra vez, ahora por culpa nuestra. */
  function pasoDeEntrada() {
    const e = String(identidad?.estado || '').toLowerCase();
    if (identidad?.rostroPendiente) return 2;
    if (e === 'datos' || e === 'documento') return 2;
    return 1;
  }

  /* Si el expediente sigue en blanco. Es la condicion para recolocar el punto de
     partida o para sacar a alguien del tramite: mientras no haya escrito ni
     fotografiado nada no se le quita nada de las manos. */
  const intacta = () => sol && !sol.nombre && !sol.frente && !sol.reverso && !sol.mrz && !sol.selfie;

  const TIPOS_DOC = [['pasaporte', 'ver.tdPas'], ['dni', 'ver.tdDni'], ['licencia', 'ver.tdLic'], ['residencia', 'ver.tdRes']];
  // El volumen se manda como una cifra porque Genesis decide con ella si la
  // diligencia es simplificada o completa (su umbral son 10.000 USD). Se manda
  // el punto medio de cada tramo: es lo mas parecido a lo que la persona dijo.
  const VOLUMENES = [['1', 'ver.vol1', 500], ['2', 'ver.vol2', 5000], ['3', 'ver.vol3', 25000]];
  const FONDOS = [['salario', 'ver.fSalario'], ['negocio', 'ver.fNegocio'], ['remesas', 'ver.fRemesas'],
                  ['inversiones', 'ver.fInversiones'], ['pension', 'ver.fPension'], ['herencia', 'ver.fHerencia'], ['otro', 'ver.fOtro']];
  const PROPOSITOS = [['ahorro', 'ver.pAhorro'], ['remesas', 'ver.pRemesas'], ['pagos', 'ver.pPagos'],
                      ['negocio', 'ver.pNegocio'], ['inversion', 'ver.pInversion']];

  // ── la vista ──────────────────────────────────────────────────────────────

  function verificar() {
    /* Ya verificada: no se la vuelve a pasear por los tres pasos.
       La tarjeta esconde el boton cuando el tramite esta cerrado, pero a esta
       pantalla tambien se entra por /#verificar —el enlace de la pagina publica
       de Genesis ID, que no sabe quien lo pulsa—. Sin este corte, a quien ya
       tiene su GID se le pedian otra vez el documento y la selfie, y al mandarlos
       se reabre un expediente que cumplimiento ya cerro. Se corta solo al ENTRAR
       (`!sol`): a quien esta a mitad del tramite no se lo saca de la pantalla. */
    if (!sol && esVerificada()) return vIdentidad();
    if (!sol) { sol = nuevaSolicitud(); sol.paso = pasoDeEntrada(); sol.colocado = Boolean(identidad); }
    /* Quien llega por /#verificar entra antes de que conteste /genesis/estado, y
       en ese instante todavia no se sabe por que paso le toca empezar. Cuando la
       respuesta llega, la vista se repinta y el punto de partida se recoloca —UNA
       sola vez—. Sin esto, a quien ya declaro sus datos se le pedirian otra vez
       por una carrera de milisegundos; y recolocando siempre, nadie podria volver
       al paso 1 a corregir un nombre mal escrito. */
    if (!sol.colocado && identidad) {
      sol.colocado = true;
      /* Y si lo que llega es que ya estaba verificada, se sale del tramite: por
         /#verificar se entra antes de saberlo, y el corte de arriba no pudo
         mirarlo porque `identidad` todavia era null. Solo con el expediente
         intacto — nadie escribio ni fotografio nada. */
      if (intacta()) {
        if (esVerificada()) { sol = null; return vIdentidad(); }
        if (sol.paso === 1) sol.paso = pasoDeEntrada();
      }
    }
    if (sol.enviando) return verEnviando();
    if (sol.paso === 4) return verFinal();

    const cuerpo = sol.paso === 2 ? verDocumento() : sol.paso === 3 ? verCara() : verDatos();
    return `
    <button class="volver" onclick="VETA.verSalir()">
      <svg viewBox="0 0 24 24">${ICO.atras}</svg>${t('ver.salir')}
    </button>
    <div class="cab"><div><h2>${t('ver.t')}</h2><div class="sub">${t('ver.sub')}</div></div></div>
    ${rielPasos()}
    <div class="bloque vidrio">${cuerpo}</div>
    <p class="pie" style="margin-top:16px">${t('ver.nunca')}</p>`;
  }

  function rielPasos() {
    return `
    <div class="pasos">
      ${[['ver.paso1', 1], ['ver.paso2', 2], ['ver.paso3', 3]].map(([k, n]) => `
        <div class="paso-p ${sol.paso === n ? 'va' : sol.paso > n ? 'ya' : ''}">
          <i></i><span>${t('ver.paso')} ${n} ${t('ver.de')} 3 · ${t(k)}</span>
        </div>`).join('')}
    </div>`;
  }

  const avisoVer = () => '<div id="ver-aviso" class="aviso ' + (sol.error ? 'aviso-mal' : 'oculto') + '" role="alert">' +
    esc(sol.error) + '</div>';

  // ── paso 1: tus datos ─────────────────────────────────────────────────────

  function verDatos() {
    const campo = (id, etiqueta, valor, extra = '', ayuda = '') => `
      <div class="campo">
        <label for="${id}">${etiqueta}</label>
        <input id="${id}" value="${esc(valor)}" ${extra}>
        ${ayuda ? `<span class="ayuda">${ayuda}</span>` : ''}
      </div>`;

    return `
    <div class="nota nota-obra">
      <b style="display:block;margin-bottom:6px;color:var(--crema)">${t('ver.honestoT')}</b>
      ${t('ver.honestoP')}
      <div style="margin-top:12px">
        <a class="btn btn-linea btn-sm" href="/genesis-id">${t('ver.honestoApp')}</a>
      </div>
    </div>

    <h3 style="margin-top:22px">${t('ver.quienT')}</h3>
    <p class="pie" style="margin-top:8px;margin-bottom:18px">${t('ver.quienP')}</p>

    ${campo('ver-nombre', t('ver.nombre'), sol.nombre, 'autocomplete="name" spellcheck="false"', t('ver.nombreP'))}

    <div class="campo">
      <label for="ver-tipo">${t('ver.tipoDoc')}</label>
      <select id="ver-tipo">
        ${TIPOS_DOC.map(([v, k]) => `<option value="${v}"${v === sol.tipoDoc ? ' selected' : ''}>${t(k)}</option>`).join('')}
      </select>
    </div>

    ${campo('ver-num', t('ver.numDoc'), sol.numDoc, 'autocomplete="off" spellcheck="false" class="mono"', t('ver.numDocP'))}

    <div class="campo">
      <label for="ver-dia">${t('ver.nacim')}</label>
      <div class="campo-tres">
        <div class="campo"><input id="ver-dia" inputmode="numeric" maxlength="2" placeholder="${t('ver.dia')}" aria-label="${t('ver.dia')}" value="${esc(sol.dia)}"></div>
        <div class="campo"><input id="ver-mes" inputmode="numeric" maxlength="2" placeholder="${t('ver.mes')}" aria-label="${t('ver.mes')}" value="${esc(sol.mes)}"></div>
        <div class="campo"><input id="ver-anio" inputmode="numeric" maxlength="4" placeholder="${t('ver.anio')}" aria-label="${t('ver.anio')}" value="${esc(sol.anio)}"></div>
      </div>
    </div>

    <div class="campo">
      <label for="ver-nacion">${t('ver.nacion')}</label>
      <select id="ver-nacion">${opcionesPais(sol.nacion)}</select>
    </div>

    <div class="campo">
      <label for="ver-reside">${t('ver.reside')}</label>
      <select id="ver-reside">${opcionesPais(sol.reside)}</select>
      <span class="ayuda">${t('ver.resideP')}</span>
    </div>

    <h3 style="margin-top:26px">${t('ver.perfilT')}</h3>
    <p class="pie" style="margin-top:8px;margin-bottom:18px">${t('ver.perfilP')}</p>

    <div class="campo">
      <label>${t('ver.volumen')}</label>
      <div class="opciones">
        ${VOLUMENES.map(([v, k]) => `
          <label class="opcion">
            <input type="radio" name="ver-vol" value="${v}"${v === sol.volumen ? ' checked' : ''}
                   onchange="VETA.verVol(${jsTxt(v)})">
            <span>${t(k)}</span>
          </label>`).join('')}
      </div>
      <span class="ayuda" id="ver-volNota">${sol.volumen === '3' ? t('ver.volCompleto') : t('ver.volSimple')}</span>
    </div>

    <div class="campo">
      <label>${t('ver.pep')}</label>
      <div class="opciones">
        <label class="opcion"><input type="radio" name="ver-pep" value="no"${sol.pep === false ? ' checked' : ''}><span>${t('ver.pepNo')}</span></label>
        <label class="opcion"><input type="radio" name="ver-pep" value="si"${sol.pep === true ? ' checked' : ''}><span>${t('ver.pepSi')}</span></label>
      </div>
      <span class="ayuda">${t('ver.pepP')}</span>
    </div>

    ${sol.opc ? `
      <div class="campo">
        <label for="ver-ocupacion">${t('ver.ocupacion')}${sol.volumen === '3' ? '' : t('ver.opc')}</label>
        <input id="ver-ocupacion" value="${esc(sol.ocupacion)}" placeholder="${t('ver.ocupacionPh')}">
      </div>
      <div class="campo">
        <label for="ver-fondos">${t('ver.fondos')}${sol.volumen === '3' ? '' : t('ver.opc')}</label>
        <select id="ver-fondos">
          <option value="">—</option>
          ${FONDOS.map(([v, k]) => `<option value="${v}"${v === sol.fondos ? ' selected' : ''}>${t(k)}</option>`).join('')}
        </select>
      </div>
      <div class="campo">
        <label for="ver-proposito">${t('ver.proposito')}${t('ver.opc')}</label>
        <select id="ver-proposito">
          <option value="">—</option>
          ${PROPOSITOS.map(([v, k]) => `<option value="${v}"${v === sol.proposito ? ' selected' : ''}>${t(k)}</option>`).join('')}
        </select>
      </div>
      <div class="campo">
        <label for="ver-tel">${t('ver.tel')}${t('ver.opc')}</label>
        <input id="ver-tel" inputmode="tel" value="${esc(sol.tel)}" placeholder="${t('ver.telPh')}">
      </div>
      <div class="campo">
        <label for="ver-domicilio">${t('ver.domicilio')}${t('ver.opc')}</label>
        <input id="ver-domicilio" value="${esc(sol.domicilio)}" placeholder="${t('ver.domicilioPh')}">
      </div>`
    : ''}

    <button class="btn btn-linea btn-sm" onclick="VETA.verOpc()">${sol.opc ? t('ver.menos') : t('ver.mas')}</button>

    ${avisoVer()}
    <div class="ver-botones">
      <button class="btn btn-oro" onclick="VETA.verSeguir()">${t('ver.seguir')}</button>
    </div>`;
  }

  /* Lo escrito se recoge del DOM y no se guarda tecla a tecla: repintar la vista
     entera en cada pulsacion le quitaria el foco al campo, que es lo que hace
     que un formulario se sienta roto. */
  function leerPaso1() {
    const v = id => ($('#' + id)?.value ?? '').trim();
    if (!$('#ver-nombre')) return;
    sol.nombre = v('ver-nombre');
    sol.tipoDoc = v('ver-tipo') || 'pasaporte';
    sol.numDoc = v('ver-num');
    sol.dia = v('ver-dia'); sol.mes = v('ver-mes'); sol.anio = v('ver-anio');
    sol.nacion = v('ver-nacion');
    sol.reside = v('ver-reside');
    const vol = document.querySelector('input[name="ver-vol"]:checked');
    if (vol) sol.volumen = vol.value;
    const pep = document.querySelector('input[name="ver-pep"]:checked');
    if (pep) sol.pep = pep.value === 'si';
    if (sol.opc) {
      sol.ocupacion = v('ver-ocupacion');
      sol.fondos = v('ver-fondos');
      sol.proposito = v('ver-proposito');
      sol.tel = v('ver-tel');
      sol.domicilio = v('ver-domicilio');
    }
  }

  function verOpc() {
    leerPaso1();
    sol.opc = !sol.opc;
    vista('verificar');
  }

  /* Sobre el umbral, la ocupacion y el origen de los fondos dejan de ser
     opcionales: se abre el bloque en el momento en vez de dejar que la persona
     pulse «Continuar» y se coma un error por unos campos que ni sabia que
     existian, escondidos detras de un boton. */
  function verVol(v) {
    if (v === '3' && !sol.opc) {
      leerPaso1();
      sol.volumen = v;
      sol.opc = true;
      return vista('verificar');
    }
    sol.volumen = v;
    const n = $('#ver-volNota');
    if (n) n.textContent = v === '3' ? t('ver.volCompleto') : t('ver.volSimple');
    document.querySelectorAll('#ver-ocupacion, #ver-fondos').forEach(el => {
      const l = el.previousElementSibling;
      if (l && l.tagName === 'LABEL') {
        l.textContent = (el.id === 'ver-ocupacion' ? t('ver.ocupacion') : t('ver.fondos')) +
          (v === '3' ? '' : t('ver.opc'));
      }
    });
  }

  /* La fecha se comprueba de verdad, no con una expresion regular: el 31 de
     febrero pasa cualquier patron de dos digitos y lo rechaza el servidor tres
     pasos despues. */
  function fechaValida(d, m, a) {
    const dd = Number(d), mm = Number(m), aa = Number(a);
    if (!dd || !mm || !aa || String(a).length !== 4) return null;
    const f = new Date(Date.UTC(aa, mm - 1, dd));
    if (f.getUTCFullYear() !== aa || f.getUTCMonth() !== mm - 1 || f.getUTCDate() !== dd) return null;
    return f;
  }

  const aniosDesde = f => {
    const h = new Date();
    let n = h.getUTCFullYear() - f.getUTCFullYear();
    const m = h.getUTCMonth() - f.getUTCMonth();
    if (m < 0 || (m === 0 && h.getUTCDate() < f.getUTCDate())) n--;
    return n;
  };

  function faltaPaso1() {
    if (!sol.nombre || sol.nombre.split(/\s+/).filter(Boolean).length < 2) return t('ver.eNombre');
    if (!sol.tipoDoc) return t('ver.eTipo');
    if (!sol.numDoc) return t('ver.eNum');
    const f = fechaValida(sol.dia, sol.mes, sol.anio);
    if (!f) return t('ver.eFecha');
    if (aniosDesde(f) < 18) return t('ver.eEdad');
    if (!sol.nacion) return t('ver.eNacion');
    if (!sol.reside) return t('ver.eReside');
    if (!sol.volumen) return t('ver.eVolumen');
    if (sol.pep === null) return t('ver.ePep');
    // Sobre el umbral de diligencia, Genesis pide el perfil entero. Decirlo aca
    // ahorra un expediente que se queda parado esperando dos campos.
    if (sol.volumen === '3' && (!sol.ocupacion || !sol.fondos)) return t('ver.eAml');
    return '';
  }

  // ── paso 2: tu documento ──────────────────────────────────────────────────

  /* AQUI SE PIDEN LAS DOS CARAS, SIEMPRE.

     Antes se pedia la foto y ADEMAS teclear a mano la zona de lectura mecanica
     del documento: cuarenta y cuatro columnas por linea, con sus digitos de
     control. En el telefono eso lo lee ML Kit sin que nadie escriba nada; en un
     navegador ese lector no existe, y pedirselo a la persona era pedir un
     imposible. El tramite se caia justo ahi.

     Ahora suben el anverso y el reverso y los lee un operador. En el pasaporte
     tambien se piden los dos: la hoja de datos y la pagina de la firma. Un
     documento entero es lo que se le da a un banco, y esto es lo mismo. */
  const pideReverso = () => true;

  function verDocumento() {
    return `
    <h3>${t('ver.docT')}</h3>
    <p class="pie" style="margin-top:8px">${t('ver.docP')}</p>

    <div class="capt" id="capt-frente">${capturaHtml('frente')}</div>
    ${pideReverso() ? `<div class="capt" id="capt-reverso">${capturaHtml('reverso')}</div>` : ''}

    <div class="nota" style="margin-top:18px">
      <b style="display:block;margin-bottom:6px;color:var(--crema)">${t('ver.fotoT')}</b>
      ${t('ver.fotoP')}
    </div>

    ${avisoVer()}
    <div class="ver-botones">
      <button class="btn btn-linea" onclick="VETA.verAtras()">${t('ver.atras')}</button>
      <button class="btn btn-oro" onclick="VETA.verSeguir()">${t('ver.seguir')}</button>
    </div>`;
  }

  /* El estado de la MRZ se repinta solo en su hueco, no repintando la vista: si
     se redibujara entera, el cursor se saldria del recuadro en la primera letra. */
  function verMrz(valor) {
    sol.mrz = valor;
    const eco = $('#ver-mrz-eco');
    if (eco) eco.innerHTML = ecoMrzHtml(formaMrz(valor));
  }

  function ecoMrzHtml(f) {
    if (!f.lineas.length) return '';
    if (!f.ok) {
      return `<div class="aviso aviso-mal">
        <b>${t('ver.mrzMal')}.</b> ${t('ver.mrzLei')} ${f.lineas.length} ${t('ver.mrzLineas')}
        ${f.largos.join('/')} ${t('ver.mrzCar')} ${t('ver.mrzAyuda')}
      </div>`;
    }
    const avisos = avisosMrz();
    return `<div class="aviso aviso-ok"><b>${t('ver.mrzOk')}</b> · ${esc(f.formato)}</div>` +
      avisos.map(a => `<div class="aviso aviso-mal">${a}</div>`).join('');
  }

  // ── paso 3: tu selfie ─────────────────────────────────────────────────────

  function verCara() {
    return `
    <h3>${t('ver.caraT')}</h3>
    <p class="pie" style="margin-top:8px">${t('ver.caraP')}</p>

    <div class="capt" id="capt-selfie">${capturaHtml('selfie')}</div>

    <h3 style="margin-top:26px">${t('ver.viajaT')}</h3>
    <div style="margin-top:6px">
      <div class="hilera"><div class="ic"><svg viewBox="0 0 24 24">${ICO.doc}</svg></div>
        <div class="txt"><b>${t('ver.viaja1')}</b></div></div>
      <div class="hilera"><div class="ic"><svg viewBox="0 0 24 24">${ICO.camara}</svg></div>
        <div class="txt"><b>${t('ver.viaja2')}</b></div></div>
      <div class="hilera"><div class="ic"><svg viewBox="0 0 24 24">${ICO.persona}</svg></div>
        <div class="txt"><b>${t('ver.viaja3')}</b></div></div>
    </div>
    <p class="pie" style="margin-top:14px">${t('ver.tarda')}</p>

    ${avisoVer()}
    <div class="ver-botones">
      <button class="btn btn-linea" onclick="VETA.verAtras()">${t('ver.atras')}</button>
      <button class="btn btn-oro" onclick="VETA.verMandar()">${sol.error ? t('ver.reintentar') : t('ver.enviar')}</button>
    </div>`;
  }

  // ── las capturas ──────────────────────────────────────────────────────────

  /* Se usa <input type="file"> y no getUserMedia. En el movil, `capture` abre la
     camara directamente y en el escritorio el explorador de archivos, y funciona
     en todos los navegadores. Un visor propio con getUserMedia se ve mejor y se
     rompe en la mitad de los iPhone: en una pantalla que hay que pasar UNA vez
     en la vida, funcionar gana.

     `capture` SOLO va en la selfie, y por dos motivos distintos.

     En el DOCUMENTO estorba. En Safari de iPhone —que es donde estaba Jose— la
     sola presencia del atributo abre la camara y QUITA la opcion de elegir un
     archivo: no aparece la hoja de Fototeca / Hacer foto / Elegir archivo, se va
     derecho al visor. Eso deja fuera a quien ya le tiene la foto o el escaneo
     guardado, y encima debajo del boton decia «o elegir un archivo», que en ese
     navegador era falso. Sin el atributo iOS ofrece las tres opciones —la camara
     entre ellas— y el texto vuelve a ser cierto.

     En la SELFIE se queda a proposito: tiene que ser una foto de ahora. Poder
     sacarla de la galeria es poder mandar la cara de otra persona, y esa foto
     existe unicamente para probar que sos vos. Por eso ahi tampoco se ofrece
     elegir un archivo: no seria un atajo, seria el agujero. */
  const CAPTURAS = {
    frente: { titulo: 'ver.frente', boton: 'ver.tomar', lado: null, nota: 'ver.frenteViaja', marco: '' },
    reverso: { titulo: 'ver.reverso', boton: 'ver.tomar', lado: null, nota: 'ver.reversoQueda', marco: '' },
    // Sin titulo propio: el de la seccion ya dice «Tu selfie» dos centimetros
    // mas arriba, y repetirlo no informa de nada.
    selfie: { titulo: '', boton: 'ver.caraBtn', lado: 'user', nota: '', marco: 'cara' },
  };

  function capturaHtml(cual) {
    const c = CAPTURAS[cual];
    const foto = sol[cual];
    const icono = cual === 'selfie' ? ICO.persona : ICO.doc;
    return `
    ${c.titulo ? `<div class="capt-h"><b>${t(c.titulo)}</b></div>` : ''}
    ${foto ? `
      <img class="capt-previa" src="${esc(foto)}" alt="">
      <div class="capt-pie">
        <button class="btn btn-linea btn-sm" onclick="VETA.verQuitar(${jsTxt(cual)})">${t('ver.repetir')}</button>
      </div>`
    : `
      <label class="capt-caja">
        <input type="file" accept="image/*"${c.lado ? ` capture="${c.lado}"` : ''}
               onchange="VETA.verFoto(${jsTxt(cual)}, this)">
        <span class="capt-dentro">
          <span class="capt-marco ${c.marco}">
            <svg viewBox="0 0 24 24">${icono}</svg>
            <b>${t(c.boton)}</b>
            ${c.lado ? '' : `<small>${t('ver.archivo')}</small>`}
          </span>
        </span>
      </label>`}
    ${c.nota ? `<p class="pie" style="margin-top:9px">${t(c.nota)}</p>` : ''}`;
  }

  /* Al recibir la foto se repinta SOLO su recuadro. Repintar la vista entera
     borraria la MRZ a medio copiar del paso 2. */
  function repintarCaptura(cual) {
    const caja = $('#capt-' + cual);
    if (caja) caja.innerHTML = capturaHtml(cual);
  }

  async function verFoto(cual, campo) {
    const archivo = campo?.files?.[0];
    if (!archivo) return;
    sol.error = '';
    const caja = $('#capt-' + cual);
    if (caja) caja.innerHTML =
      (CAPTURAS[cual].titulo ? `<div class="capt-h"><b>${t(CAPTURAS[cual].titulo)}</b></div>` : '') +
      `<p class="pie"><span class="girando"></span> ${t('ver.preparando')}</p>`;
    try {
      sol[cual] = await achicar(archivo);
    } catch (e) {
      sol[cual] = null;
      sol.error = e.message;
    }
    const a = $('#ver-aviso');
    if (a) {
      a.textContent = sol.error;
      a.className = 'aviso ' + (sol.error ? 'aviso-mal' : 'oculto');
    }
    repintarCaptura(cual);
  }

  function verQuitar(cual) {
    sol[cual] = null;
    repintarCaptura(cual);
  }

  // ── el envío ──────────────────────────────────────────────────────────────

  function verEnviando() {
    return `
    <div class="cab"><div><h2>${t('ver.t')}</h2><div class="sub">${t('ver.sub')}</div></div></div>
    <div class="bloque vidrio">
      <div class="ver-barra"><i id="ver-hecho" style="width:${sol.hecho}%"></i></div>
      <div class="ver-etapa"><span class="girando"></span><span id="ver-etapa">${esc(sol.etapa)}</span></div>
      <p class="pie" style="margin-top:16px">${t('ver.tarda')}</p>
    </div>
    <p class="pie" style="margin-top:16px">${t('ver.nunca')}</p>`;
  }

  /* La barra avanza por etapas cumplidas, no por bytes: `fetch` no informa del
     progreso de subida, y una barra que se mueve sola con un temporizador seria
     una animacion disfrazada de informacion. Cada tramo se pinta cuando el
     servidor ya contesto el anterior, asi que lo que enseña es cierto. */
  function verEtapa(texto, hecho) {
    sol.etapa = texto;
    sol.hecho = hecho;
    const b = $('#ver-hecho'), e = $('#ver-etapa');
    if (b) b.style.width = hecho + '%';
    if (e) e.textContent = texto;
  }

  /* Los codigos del puente, traducidos a algo que se pueda leer. Se mira el
     ESTADO y no el mensaje: el 413 y el 404 del backend salen en HTML, no en
     JSON, asi que el texto que llega es una pagina entera de Jade. */
  function verFalla(e) {
    if (e.estado === 404) return t('ver.ePuente');
    if (e.estado === 503) return t('ver.eClaveSrv');
    if (e.estado === 413) return t('ver.e413');
    if (e.estado >= 500) return t('ver.eServidor');
    // Un 400 de Genesis SÍ trae un motivo util —que digito de control falla, por
    // ejemplo—, y ese se enseña tal cual.
    return e.message;
  }

  /* Mientras Genesis ID no sepa recibir las dos caras, el puente contesta con
     este motivo en vez de un error a secas. No es un fallo de la persona ni de
     su documento, y decirle «revisá tu conexión» seria mandarla a arreglar algo
     que no esta roto de su lado. */
  const SIN_FOTOS = 'genesis-sin-fotos';

  async function verMandar() {
    if (sol.enviando) return;
    if (!sol.selfie) { sol.error = t('ver.eCara'); return vista('verificar'); }
    if (!sol.frente) { sol.paso = 2; sol.error = t('ver.eFrente'); return vista('verificar'); }

    sol.enviando = true;
    sol.error = '';
    sol.etapa = t('ver.pDatos');
    sol.hecho = 6;
    vista('verificar');

    try {
      // 1. Lo declarado. Solo si se lleno en esta sesion: quien vuelve a mitad
      //    del tramite no tiene por que reescribir lo que el servidor ya guardo.
      if (sol.nombre) {
        verEtapa(t('ver.pDatos'), 12);
        const vol = VOLUMENES.find(v => v[0] === sol.volumen);
        await pedir('/genesis/datos', {
          metodo: 'POST', espera: 40000,
          cuerpo: {
            nombreCompleto: sol.nombre,
            fechaNacimiento: `${sol.anio}-${String(sol.mes).padStart(2, '0')}-${String(sol.dia).padStart(2, '0')}`,
            paisResidencia: sol.reside,
            telefono: sol.tel || undefined,
            direccion: sol.domicilio || undefined,
            ocupacion: sol.ocupacion || undefined,
            origenFondos: sol.fondos || undefined,
            propositoCuenta: sol.proposito || undefined,
            volumenEsperadoUsd: vol ? vol[2] : undefined,
            pepDeclarado: sol.pep,
          },
        });
      }

      /* 2. El documento, como DOS FOTOS. En el telefono sube el texto de la
            zona mecanica —que ya leyo ML Kit— y aqui no hay lector, asi que
            suben las dos caras y las lee un operador. Ver `pideReverso`. */
      verEtapa(t('ver.pDoc'), 34);
      const doc = await pedir('/genesis/documento-fotos', {
        metodo: 'POST', espera: 120000,
        cuerpo: { anverso: sol.frente, reverso: sol.reverso },
      });

      /* Genesis rechaza un documento con un 200, no con un error: devuelve
         `aceptable: false` y la lista de lo que falla. Seguir adelante sin
         mirarlo dejaba el expediente en «En revision» —tranquilizador y falso—
         con el documento ya marcado como no valido, y sin ningun boton para
         volver a intentarlo. Se para aqui, como hace el telefono.

         La via `fotos` es la excepcion: ahi `aceptable` en falso no significa
         rechazado, significa que todavia no lo ha mirado nadie. Las dos claves
         se leen juntas o ninguna. */
      const porFotos = doc?.documento?.via === 'fotos';
      if (!porFotos && doc?.documento?.aceptable === false) {
        sol.resultado = { aceptable: false, problemas: doc?.documento?.problemas || [] };
        sol.paso = 4;
        return;
      }

      // 3. Las fotos de la cara. Sin reto de vivacidad —eso son cuatro gestos
      //    grabados y vive en la app—, asi que esto NUNCA aprueba sola: el
      //    expediente queda esperando a una persona.
      verEtapa(t('ver.pCara'), 58);
      const bio = await pedir('/genesis/biometria', {
        metodo: 'POST', espera: 120000,
        cuerpo: { selfie: sol.selfie, fotoDocumento: sol.frente },
      });

      verEtapa(t('ver.pFin'), 100);
      await cargarIdentidad();
      sol.resultado = {
        aceptable: porFotos ? null : Boolean(doc?.documento?.aceptable),
        porFotos,
        problemas: doc?.documento?.problemas || [],
        // La respuesta del rostro trae el motivo exacto —«no se detecta ningun
        // rostro», «movida», «a contraluz»—. Tirarlo dejaba a la persona
        // repitiendo la misma foto sin saber que corregir.
        rostro: bio?.biometria?.motivo || null,
      };
      sol.paso = 4;
    } catch (e) {
      sol.error = e.motivo === SIN_FOTOS ? t('ver.sinFotos') : verFalla(e);
    } finally {
      sol.enviando = false;
      /* Se repinta lo que la persona esté mirando, no la verificación a la
         fuerza: subir las fotos tarda, y a quien se fue a ver su saldo mientras
         tanto no se le arrastra de vuelta. El resultado le espera acá. */
      vista(vistaActual);
    }
  }

  // ── lo que dijo el servidor ───────────────────────────────────────────────

  /* Aca no se resume ni se suaviza: se enseña el estado que devolvio Genesis con
     las mismas palabras que la tarjeta de identidad. «En revision» es «en
     revision»; nada en esta pantalla puede parecerse a una aprobacion, porque
     esta pantalla no aprueba. */
  function verFinal() {
    const problemas = sol.resultado?.problemas || [];
    const rostroMal = Boolean(identidad?.rostroPendiente);
    // Lo que dijo el cotejo del rostro, con sus palabras. Un «repetir la foto»
    // a secas deja a la persona mandando la misma otra vez.
    const motivo = sol.resultado?.rostro || '';
    const porFotos = Boolean(sol.resultado?.porFotos);
    return `
    <div class="cab"><div><h2>${t('ver.t')}</h2><div class="sub">${t('ver.sub')}</div></div></div>

    ${problemas.length ? `
      <div class="bloque vidrio">
        <h3>${t('ver.docProb')}</h3>
        <p class="pie" style="margin-top:8px">${t('ver.docProbP')}</p>
        <div style="margin-top:14px">
          ${problemas.map(p => `<div class="aviso aviso-mal">${esc(p)}</div>`).join('')}
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-oro btn-sm" onclick="VETA.verVolverA(2)">${t('ver.arreglarDoc')}</button>
        </div>
      </div>` : ''}

    ${porFotos ? `
      <div class="bloque vidrio">
        <h3>${t('ver.leeraT')}</h3>
        <p class="pie" style="margin-top:8px">${t('ver.leeraP')}</p>
      </div>` : ''}

    ${rostroMal ? `
      <div class="bloque vidrio">
        <h3>${t('ver.caraMal')}</h3>
        ${motivo ? `<div class="aviso aviso-mal" style="margin-top:10px">${esc(motivo)}</div>` : ''}
        <p class="pie" style="margin-top:8px">${t('ver.caraMalP')}</p>
        <div style="margin-top:16px">
          <button class="btn btn-oro btn-sm" onclick="VETA.verVolverA(3)">${t('ver.repetirCara')}</button>
        </div>
      </div>` : ''}

    ${!problemas.length && !rostroMal && !porFotos ? `
      <div class="bloque vidrio">
        <h3>${t('ver.listoT')}</h3>
        <p class="pie" style="margin-top:8px">${t('ver.listoP')}</p>
      </div>` : ''}

    <div class="bloque-cab" style="margin:26px 0 0"><h3 class="cab-mini">${t('ver.listoEst')}</h3></div>
    ${tarjetaIdentidad(true)}

    <div class="ver-botones">
      <button class="btn btn-oro" onclick="VETA.verSalir('identidad')">${t('ver.verId')}</button>
    </div>
    <p class="pie" style="margin-top:16px">${t('ver.nunca')}</p>`;
  }

  // ── la navegación del trámite ─────────────────────────────────────────────

  function verSeguir() {
    if (sol.paso === 1) {
      leerPaso1();
      sol.error = faltaPaso1();
      if (sol.error) return vista('verificar');
      sol.paso = 2;
      return vista('verificar');
    }
    if (sol.paso === 2) {
      if (!sol.frente) { sol.error = t('ver.eFrente'); return vista('verificar'); }
      if (!sol.reverso) { sol.error = t('ver.eReverso'); return vista('verificar'); }
      sol.error = '';
      sol.paso = 3;
      return vista('verificar');
    }
  }

  function verAtras() {
    if (sol.paso === 1) return verSalir();
    sol.error = '';
    sol.paso -= 1;
    vista('verificar');
  }

  function verVolverA(paso) {
    sol.error = '';
    sol.resultado = null;
    // Volver a por la cara es volver a TOMARLA: dejar puesta la que no sirvió,
    // con un botón de repetir al lado, invita a mandar la misma otra vez.
    if (paso === 3) sol.selfie = null;
    sol.paso = paso;
    vista('verificar');
  }

  /* Salir del tramite tira el expediente. Es lo que hay que hacer: dentro hay un
     numero de documento y dos fotografias, y dejarlos en memoria «por si vuelve»
     es guardarlos sin haberlo pedido. Lo ya enviado esta en el servidor. */
  function verSalir(destino) {
    sol = null;
    vista(destino || 'identidad');
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
        <div><dt>${t('dep.red')}</dt><dd>Orden Global · 5550 · Layer 1 · Besu QBFT · Shanghai</dd></div>
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
        ${fila(ICO.obra, t('aj.bien'), t('aj.bienP'), "VETA.bienvenida()")}
        ${fila(ICO.tienda, t('aj.mtp'), t('aj.mtpP'), "VETA.vista('pay')")}
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


  // ── la bienvenida del ecosistema ──────────────────────────────────────────

  /* Las mismas seis tarjetas que la app y en el mismo orden, que cuenta una
     historia: primero la cadena propia —que es la noticia y la razon de que
     lo demas pueda existir—, despues el ecosistema entero, y luego cada
     mundo. Sale una sola vez por navegador al entrar, y queda en Ajustes
     para el que quiera volver a leerla.

     Cada tarjeta trae su propia paleta: son los mismos colores con los que
     el telefono pinta las esferas del Nucleo, para que quien salte de un
     lado al otro reconozca cada mundo antes de leer el titulo. */
  const LLAVE_BIEN = 'veta.bienvenida.v1';

  const BIEN = [
    { k: 'red', e1: '#F8EFCF', e2: '#C9A961', e3: '#6B5220', halo: '#C9A961', lente: '#05201B',
      ico: '<path d="M12 2.5 4 6.2v5.6c0 4.9 3.3 8.4 8 9.7 4.7-1.3 8-4.8 8-9.7V6.2z"/><path d="M12 7.6v8.8M8.2 9.8l7.6 4.4M15.8 9.8l-7.6 4.4"/>' },
    /* Los logotipos de marca no entran aca: son PNG con mucho aire alrededor y
       dentro de la lente quedan del tamano de una mosca. Un trazo dibujado a
       esta medida se lee, que es de lo que se trata. */
    { k: 'eco', e1: '#F8EFCF', e2: '#C9A961', e3: '#5C4A22', halo: '#EAD79C', lente: '#05201B',
      ico: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="3.7" r="1.7"/><circle cx="20.3" cy="12" r="1.7"/><circle cx="12" cy="20.3" r="1.7"/><circle cx="3.7" cy="12" r="1.7"/><path d="M12 5.4v3.4M15.2 12h3.4M12 15.2v3.4M5.4 12h3.4"/>' },
    { k: 'din', e1: '#F8EFCF', e2: '#C9A961', e3: '#96793F', halo: '#EAD79C', lente: '#05201B',
      ico: '<path d="M3.4 17 6.1 9h11.8l2.7 8z"/><path d="M6.6 13.4h10.8"/>' },
    { k: 'neg', e1: '#D8F7FF', e2: '#5FC6EA', e3: '#453398', halo: '#5FC6EA', lente: '#0A0812',
      ico: '<path d="M4 9h16l-1.2 11.2H5.2z"/><path d="M8.4 9V6.6a3.6 3.6 0 0 1 7.2 0V9"/>' },
    { k: 'gen', e1: '#FBE0D4', e2: '#E0937A', e3: '#8A4A38', halo: '#E0937A', lente: '#20100A',
      ico: '<path d="M3.5 6.6h12.2v8.2H8.1L4.4 18v-3.2H3.5z"/><path d="M8.9 10.6h5.6M18.6 9.4h1.9v8.2h-.9V20l-3-2.4H12"/>' },
    { k: 'nex', e1: '#E4DAFF', e2: '#9E86F0', e3: '#3B2C7A', halo: '#9E86F0', lente: '#0B0818',
      ico: '<path d="M3 12h2.4l2-6 3 12 2.6-9 2 5h6"/>' },
  ];

  let bienPaso = 0;

  function bienVisto() {
    try { return localStorage.getItem(LLAVE_BIEN) === '1'; } catch { return false; }
  }
  function bienMarcar() {
    try { localStorage.setItem(LLAVE_BIEN, '1'); } catch {}
  }

  function bienPintar() {
    const c = BIEN[bienPaso];
    const ultima = bienPaso === BIEN.length - 1;
    const dentro = `<svg viewBox="0 0 24 24">${c.ico}</svg>`;
    const puntos = BIEN.map((_, i) =>
      `<span class="bien-punto"${i === bienPaso ? ' data-aqui' : ''}></span>`).join('');
    $('#bienve').innerHTML = `
      <div class="bien-caja" style="--bE1:${c.e1};--bE2:${c.e2};--bE3:${c.e3};--bHalo:${c.halo};--bLente:${c.lente}">
        <button class="bien-saltar" onclick="VETA.bienCerrar()">${t('bien.saltar')}</button>
        <div class="bien-esfera" aria-hidden="true"><div class="bien-lente">${dentro}</div></div>
        <div class="bien-k">${t('bien.' + c.k + 'K')}</div>
        <h2 id="bien-tit">${esc(t('bien.' + c.k + 'T'))}</h2>
        <p>${esc(t('bien.' + c.k + 'P'))}</p>
        <div class="bien-puntos" role="img"
             aria-label="${t('bien.paso')} ${bienPaso + 1}/${BIEN.length}">${puntos}</div>
        <button class="btn btn-oro" onclick="VETA.bienSig()">${ultima ? t('bien.fin') : t('bien.sig')}</button>
      </div>`;
    $('#bienve').querySelector('.btn')?.focus();
  }

  /* Se abre de dos maneras y hay que distinguirlas: sola al entrar la primera
     vez, o a mano desde Ajustes. Abrirla a mano no debe reiniciar nada mas
     que el paso; la marca de "ya la vio" se pone igual, porque verla es
     verla. */
  function bienvenida() {
    bienPaso = 0;
    $('#bienve').classList.remove('oculto');
    document.body.style.overflow = 'hidden';
    bienPintar();
    tele('accion', 'bienvenida.abierta');
  }

  function bienSig() {
    if (bienPaso >= BIEN.length - 1) return bienCerrar();
    bienPaso++;
    bienPintar();
  }

  function bienCerrar() {
    bienMarcar();
    $('#bienve').classList.add('oculto');
    $('#bienve').innerHTML = '';
    document.body.style.overflow = '';
  }

  // Escape cierra, como cualquier ventana modal; las flechas avanzan para
  // quien no usa el raton.
  addEventListener('keydown', e => {
    if ($('#bienve')?.classList.contains('oculto')) return;
    if (e.key === 'Escape') { e.preventDefault(); bienCerrar(); }
    if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); bienSig(); }
    if (e.key === 'ArrowLeft' && bienPaso > 0) { e.preventDefault(); bienPaso--; bienPintar(); }
  });


  // ── EL NUCLEO ─────────────────────────────────────────────────────────────

  /* El tablero del ecosistema, el mismo que el telefono: una constelacion de
     esferas colgando de la billetera, que es el centro. Las coordenadas, los
     colores y el orden salen de orden-global-app/src/og/Nucleo.js tal cual —si
     alla la esfera de MyTokenPay esta arriba a la derecha y es cian, aca
     tambien, porque la gente que salta de un lado al otro reconoce por sitio y
     por color antes que por el nombre.

     Es la PORTADA: a esto se entra al abrir sesion, y de aqui salen todas las
     puertas. Lo que en el telefono son secciones, aca son destinos.

     LO QUE CAMBIA RESPECTO AL TELEFONO: alla las esferas laten sobre una red
     de neuronas dibujada en un lienzo. Aca las lineas son un SVG estatico y el
     latido es una animacion de CSS. Ni canvas ni WebView: la misma imagen sin
     una dependencia mas, que es la regla de esta web. */
  const MUNDOS = [
    { id: 'wallet', x: 50, y: 47, tam: 1.00, va: 'billetera',
      grad: ['#F8EFCF', '#DFC078', '#96793F'], halo: '#EAD79C', lente: '#05201B',
      logo: 'assets/apps/wallet.png', zoom: 1.05,
      ico: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1"/><rect x="3" y="8" width="18" height="11" rx="2.5"/><circle cx="16.5" cy="13.5" r="1.3"/>' },
    { id: 'chat', x: 19, y: 17, tam: 0.72, va: 'chat', pideGid: true,
      grad: ['#FBE0D4', '#E0937A', '#8A4A38'], halo: '#E0937A', lente: '#20100A',
      ico: '<path d="M3.5 6.6h12.2v8.2H8.1L4.4 18v-3.2H3.5z"/><path d="M18.6 9.4h1.9v8.2h-.9V20l-3-2.4H12"/>' },
    { id: 'pay', x: 81, y: 21, tam: 0.76, va: 'pay',
      grad: ['#D8F7FF', '#5FC6EA', '#453398'], halo: '#5FC6EA', lente: '#0A0812',
      logo: 'assets/apps/pay.png', zoom: 1.15,
      ico: '<path d="M4 9h16l-1.2 11.2H5.2z"/><path d="M8.4 9V6.6a3.6 3.6 0 0 1 7.2 0V9"/>' },
    { id: 'gid', x: 18, y: 79, tam: 0.72, va: 'identidad',
      grad: ['#D6EBE2', '#63A493', '#123B39'], halo: '#7FD8C4', lente: '#062123',
      logo: 'assets/apps/gid.png', zoom: 1.3,
      ico: '<path d="M12 3l8 3.5v5c0 5-3.4 8.6-8 9.5-4.6-.9-8-4.5-8-9.5v-5z"/><path d="M9 12l2 2 4-4"/>' },
    { id: 'ajustes', x: 82, y: 81, tam: 0.68, va: 'ajustes',
      grad: ['#E4E8EE', '#93A0AE', '#2E3844'], halo: '#A9B6C4', lente: '#0C1116',
      ico: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>' },
    { id: 'scan', x: 50, y: 12, tam: 0.60, fuera: 'https://ordenscan.com',
      grad: ['#D6F3EC', '#74E6C8', '#1B5A50'], halo: '#74E6C8', lente: '#07211D',
      ico: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 9h10M7 13h6M7 17h8"/>' },
    { id: 'aubank', x: 50, y: 86, tam: 0.60, pronto: true,
      grad: ['#E8E0C8', '#A5936A', '#463B24'], halo: '#CBBB8C', lente: '#141007',
      ico: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20M6 15h4"/>' },
    { id: 'oxch', x: 86, y: 49, tam: 0.52, pronto: true,
      grad: ['#DCD4F2', '#8D7EC9', '#372B63'], halo: '#A99CDE', lente: '#0D0A1D',
      ico: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>' },
  ];

  const CENTRO = { x: 50, y: 47 };

  function nucleo() {
    /* «Hola, info» no es un saludo: cuando el nombre que tenemos es solo el
       trozo del correo antes de la arroba, se saluda sin nombre. Un saludo
       generico gana a uno que suena a maquina leyendo un campo. */
    let nombre = (sesion?.nombre || '').split(' ')[0];
    const local = String(sesion?.correo || '').split('@')[0].toLowerCase();
    if (!nombre || nombre.toLowerCase() === local || nombre.includes('@')) nombre = '';
    const verificada = esVerificada();

    /* Las esferas son las de siempre, ahora flotando sobre el cerebro entero:
       el canvas y los botones comparten el mismo cuadro y las mismas
       coordenadas en tanto por ciento, asi que el ganglio dibujado y la
       esfera que se toca son EL MISMO punto. */
    /* LA CAJA SEGURA. La constelación no ocupa el cuadro entero: arriba vive
       el saludo y abajo el sello de la cadena con los botones del recorrido.
       Sin este margen, las esferas de la fila de abajo —Genesis ID, Ajustes,
       AUBANK— caían DEBAJO de esa banda y en un teléfono chico no se podían
       ni tocar: medido con elementFromPoint en el centro de cada botón, a
       1280x860, 390x844, 360x740 y 320x568.

       Se calcula aquí y de aquí salen las DOS cosas: el botón del DOM y el
       ganglio del canvas. Si alguien las separa, el cerebro deja de coincidir
       con lo que se toca — que es justo lo que hace que esto parezca una
       sola pieza y no dos capas que se ignoran. */
    const { enCaja, enAncho } = cajaNucleo();

    /* LA PROFUNDIDAD. El tamaño de cada mundo ya decía quién está delante y
       quién detrás; lo que faltaba era que el resto del dibujo lo creyera. De
       `tam` sale `--z` —0 el más lejano, 1 el más cercano— y de ahí salen las
       cuatro cosas que hacen que un plano se vea como un espacio: la niebla
       (lo lejano se lava contra el fondo), el desenfoque de distancia, cuánto
       se mueve cada capa cuando el puntero se mueve, y en qué orden se tapan
       unas a otras. Se calcula del propio dato, no a mano: si mañana alguien
       cambia un tamaño en MUNDOS, la profundidad lo sigue. */
    const tams = MUNDOS.map((m) => m.tam);
    const tMin = Math.min(...tams), tMax = Math.max(...tams);
    const hondo = (m) => (tMax === tMin ? 1 : (m.tam - tMin) / (tMax - tMin));

    const esferas = MUNDOS.map((m, i) => {
      const cerrado = m.pideGid && !verificada;
      const z = hondo(m);
      return `
      <button class="nu-mundo${m.pronto ? ' nu-pronto' : ''}${cerrado ? ' nu-cerrado' : ''}"
              data-mundo="${m.id}"
              style="left:${enAncho(m.x)}%;top:${enCaja(m.y)}%;--t:${m.tam};
                     --z:${z.toFixed(3)};z-index:${3 + Math.round(z * 8)};
                     /* NEGATIVO a propósito. En positivo, la última esfera se
                        quedaba quieta 2,9 segundos antes de empezar a flotar:
                        se entraba al Núcleo y la constelación parecía una
                        foto que despierta a trozos. En negativo cada una
                        arranca ya metida en su vuelta, todas vivas desde el
                        primer fotograma y ninguna en el mismo punto. */
                     --d:-${i * 420}ms;
                     --g1:${m.grad[0]};--g2:${m.grad[1]};--g3:${m.grad[2]};
                     --halo:${m.halo};--lente:${m.lente}"
              onclick="VETA.nuAbrir(${jsTxt(m.id)})"
              aria-label="${esc(t('nu.' + m.id))}">
        <span class="nu-esfera"><span class="nu-lente">${m.logo
          ? `<img src="${m.logo}" alt="" style="--zoom:${m.zoom || 1}">`
          : `<svg viewBox="0 0 24 24">${m.ico}</svg>`}</span></span>
        <span class="nu-nombre">${esc(t('nu.' + m.id))}</span>
        ${m.pronto ? `<span class="nu-chip">${t('nu.pronto')}</span>` : ''}
        ${cerrado ? `<span class="nu-candado"><svg viewBox="0 0 24 24">${ICO.llave}</svg></span>` : ''}
      </button>`;
    }).join('');

    return `
    <div class="cerebro" id="cerebro">
      <canvas id="red-nucleo"></canvas>
      <div class="cerebro-cab">
        <h2>${nombre ? `${t('nu.hola')}, ${esc(nombre)}` : t('nu.t')}</h2>
        <div class="sub">${t('nu.sub')}</div>
      </div>
      ${esferas}
      <div class="cerebro-pie">
        <!-- El sello de la cadena vive ABAJO, y no en la cabecera flotante:
             ahí arriba caía justo encima de la esfera de PULSE CHAT y se comía
             el toque —medido con elementFromPoint en el centro exacto del
             botón, en tres tamaños de teléfono—. Un adorno que impide entrar a
             una app no es un adorno, es una avería. Aquí abajo tiene su propia
             banda, no estorba a nadie, y de paso se lee mejor: es lo que
             sostiene todo lo de arriba. -->
        <a class="nu-power" href="https://ordenscan.com" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5z"/></svg>
          <span class="nup-txt">
            <b>${t('nu.powerT')}</b>
            <small>${t('nu.powerP')}</small>
          </span>
        </a>
        <div class="cerebro-botones">
          <button class="btn btn-oro btn-sm" onclick="VETA.auraChip(${jsTxt(aTxt().chips[0])})">
            ▶ ${t('nu.recorrer')}</button>
          <button class="btn btn-linea btn-sm" onclick="VETA.auraAyuda()">${t('nu.decirle')}</button>
        </div>
      </div>
    </div>`;
  }

  /* Encender el cerebro: se llama DESPUES de pintar la vista, cuando el canvas
     ya existe y tiene medidas. Los ganglios son las esferas navegables — las
     dormidas (pronto) tambien laten, mas tenue, porque un organo que se ve
     antes de existir es el mensaje del ecosistema. */
  /* LA CAJA SEGURA DE LA CONSTELACIÓN — y se calcula UNA sola vez porque de
     aquí salen TRES cosas que tienen que coincidir al píxel: el botón del DOM,
     el ganglio del canvas y el foco del recorrido. Si se separan, el cerebro
     deja de estar donde están los botones y el conjunto se cae.

     La constelación no ocupa el cuadro entero: arriba vive el saludo y abajo
     el sello de la cadena con los botones del recorrido. Sin este margen las
     esferas de la fila de abajo caían debajo de esa banda y no se podían ni
     tocar — medido con elementFromPoint en el centro de cada botón, a
     1280x860, 390x844, 360x740 y 320x568.

     El alto que cuenta es el del cerebro, no el de la ventana: en el teléfono
     la barra de pestañas se lleva 76px, y no descontarlos dejaba a un
     360x740 usando el reparto de una pantalla grande. */
  let relojCerebro = 0;
  addEventListener('resize', () => {
    if (vistaActual !== 'nucleo') return;
    clearTimeout(relojCerebro);
    // el mismo respiro que usa la red para no medirse sesenta veces mientras
    // alguien arrastra el borde de la ventana
    relojCerebro = setTimeout(() => { if (vistaActual === 'nucleo') vista('nucleo'); }, 260);
  });

  /* EL SUELO, MEDIDO. Cuánto sitio come la banda de abajo —el sello de la
     cadena y los botones del recorrido— y cuánto sobresale una esfera por
     debajo de su centro. Los pone medirCerebro() con la regla puesta sobre lo
     que hay de verdad en pantalla. Hasta que eso ocurre valen los números a
     ojo de aquí abajo, que son los que dibujan el primer fotograma. */
  let sueloPie = null, altoCaja = null, vueloEsfera = 0;

  function cajaNucleo() {
    const alto = innerWidth < 901 ? innerHeight - 76 : innerHeight;
    const angosto = innerWidth < 700;
    const corta = alto < 620, baja = alto < 700;
    const arriba = corta ? 14 : baja ? 13 : 11;
    /* En el teléfono el sello y los botones se apilan en vertical y ocupan
       mucho más que en una pantalla grande, así que la banda de abajo se
       reserva por ANCHO y no solo por alto: un 390x844 tiene sitio de sobra a
       lo alto y aun así la fila de abajo caía sobre el sello. */
    const aOjo = corta ? 60 : baja ? 69 : angosto ? 68 : 79;
    /* Y aun así el número a ojo se equivocaba, porque el sello NO mide siempre
       lo mismo: crece con el idioma y con lo que tenga que decir ese día. Con
       saldo en la cartera se estiraba lo justo para comerse el nombre de
       AUBANK en un 360x740 —el centro del botón seguía libre, pero el nombre
       quedaba debajo del sello y no se podía leer—. Ningún número escrito a
       mano acierta con algo que cambia de tamaño solo; se mide y se reparte lo
       que quede. Y nunca hacia abajo: la medida solo puede subir el suelo,
       jamás bajarlo por debajo de lo que ya se había reservado. */
    const abajo = sueloPie != null && altoCaja > 0
      ? Math.min(aOjo, 100 * (1 - (sueloPie + vueloEsfera + 10) / altoCaja))
      : aOjo;
    /* Y a lo ancho lo mismo: el nombre de una esfera pegada al borde
       —«Ordenexchange» es el más largo— se salía del cuadro en un teléfono
       angosto. Se mete la constelación hacia dentro en vez de recortar el
       nombre: una app del ecosistema no se presenta con puntos suspensivos. */
    return {
      enCaja: y => arriba + (y / 100) * (abajo - arriba),
      enAncho: x => (angosto ? 15 + (x / 100) * 70 : x),
    };
  }

  /* El cerebro tiene que caber en LO QUE QUEDA de pantalla, y eso no se puede
     escribir en el CSS: depende de lo alto que sea el techo de la página, que
     cambia con el idioma y con el ancho. Antes era `100svh - 76px` a ojo, y en
     un teléfono el cuadro se pasaba de largo por el alto del techo — el
     segundo botón del pie quedaba DEBAJO de la barra de pestañas, tapado y sin
     forma de tocarlo. Se mide y se pone, que es lo único que no se equivoca. */
  function medirCerebro() {
    const el = $('#cerebro');
    if (!el) return;
    const arriba = el.getBoundingClientRect().top;
    const tabs = $('.tabs');
    const pestanas = tabs && getComputedStyle(tabs).display !== 'none' ? tabs.offsetHeight : 0;
    /* Si no cabe, que se deslice. Apretar la constelación hasta que un
       botón quede debajo de las pestañas es peor que pedir un gesto de
       dedo que todo el mundo ya conoce. */
    const cabe = Math.round(innerHeight - arriba - pestanas);
    const alto = Math.max(560, cabe);
    el.style.height = alto + 'px';
    /* Si el cerebro se pasa de largo, la página tiene que poder deslizarse
       ENTERA: en modo cerebro el lienzo va sin relleno, y ese relleno era
       justo el hueco que dejaba libre la barra de pestañas. Sin él, los
       botones del pie quedaban debajo de la barra y no se alcanzaban ni
       bajando del todo — comprobado a 320x568, que es la pantalla más
       pequeña que sigue viva ahí fuera. */
    const lienzo = $('#lienzo');
    if (lienzo) lienzo.style.paddingBottom = alto > cabe ? pestanas + 'px' : '';

    /* Ya está el cuadro con su alto de verdad: ahora se mide lo que hay dentro
       y, si el suelo estaba mal calculado, se vuelven a colocar las esferas.
       No hay bucle posible: dónde cae el sello no depende de dónde estén las
       esferas, así que la corrección se hace una vez y se queda quieta. */
    const caja = el.getBoundingClientRect();
    const pie = $('.cerebro-pie')?.getBoundingClientRect();
    if (!pie || !caja.height) return;
    const mundos = [...document.querySelectorAll('.nu-mundo[data-mundo]')];
    const antes = cajaNucleo();
    altoCaja = caja.height;
    sueloPie = Math.max(0, caja.bottom - pie.top);
    // lo que cuelga por debajo del centro de la esfera más grande: el nombre
    // va ahí abajo y es lo que se quedaba tapado
    vueloEsfera = mundos.reduce((m, x) => Math.max(m, x.getBoundingClientRect().height / 2), 0);
    const ahora = cajaNucleo();
    // se recolocan solo si la cuenta cambió de verdad; media décima de por
    // ciento no vale un repintado
    if (Math.abs(ahora.enCaja(100) - antes.enCaja(100)) < 0.5) return;
    mundos.forEach((x) => {
      const m = MUNDOS.find((y) => y.id === x.dataset.mundo);
      if (!m) return;
      x.style.top = ahora.enCaja(m.y) + '%';
      x.style.left = ahora.enAncho(m.x) + '%';
    });
  }

  function encenderCerebro(despertar) {
    const c = $('#red-nucleo');
    if (!c) return;
    medirCerebro();
    /* Cada esfera del DOM se entrega al canvas: la orbita del ganglio y el
       boton que se toca se mueven con LA MISMA formula, en el mismo cuadro. */
    const elementos = {};
    document.querySelectorAll('.nu-mundo[data-mundo]').forEach(el => {
      elementos[el.dataset.mundo] = el;
    });
    const { enCaja, enAncho } = cajaNucleo();
    AURA.montarRed(c, MUNDOS.map(m => ({
      // la MISMA caja que usan los botones: una sola cuenta para los dos
      id: m.id, x: enAncho(m.x), y: enCaja(m.y), tam: m.tam,
      tinte: tinteDe(m.halo),
    })), {
      elementos,
      despertar: Boolean(despertar),
      // El destello de llegada enciende la esfera del DOM un instante: el
      // canvas y los botones se contestan, que es lo que vuelve VIVO el
      // conjunto en vez de dos capas que se ignoran.
      /* Por clase y no por style.filter: el filtro en linea le pisaba a la
         esfera el desenfoque de distancia, y durante los 320ms del destello
         un mundo del fondo saltaba al primer plano y volvia. La clase compone
         las dos cosas. */
      alDestellar: id => {
        const el = document.querySelector(`.nu-mundo[data-mundo="${id}"] .nu-esfera`);
        if (!el) return;
        el.classList.add('nu-destello');
        setTimeout(() => el.classList.remove('nu-destello'), 320);
      },
    });
    engancharParalaje(c.closest('.cerebro'));
  }

  /* EL PARALAJE. Lo que de verdad convence al ojo de que hay hondura no es la
     niebla ni el desenfoque: es que al mover la cabeza lo cercano se desplace
     mas que lo lejano. Aqui la cabeza es el puntero. Se escriben dos numeros
     de -1 a 1 en el cuadro y el CSS reparte el movimiento por --z.

     El oyente va en el propio cuadro, no en window: cuando vista() vuelve a
     pintar #lienzo el nodo muere y se lleva el oyente puesto, sin nada que
     desenganchar y sin dejar uno vivo por cada visita al Nucleo.

     Solo con puntero fino. En un telefono no hay puntero que seguir, y el
     giroscopio pide permiso en iOS: pedir un permiso por un adorno es
     exactamente la clase de cosa que hace que alguien desconfie de la app que
     le guarda el oro. Ahi la hondura la sostienen las otras tres senas. */
  function engancharParalaje(caja) {
    if (!caja || caja.dataset.paralaje) return;
    if (!matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    caja.dataset.paralaje = '1';
    let pedido = 0, px = 0, py = 0;
    const pintar = () => {
      pedido = 0;
      caja.style.setProperty('--px', px.toFixed(3));
      caja.style.setProperty('--py', py.toFixed(3));
    };
    caja.addEventListener('pointermove', (e) => {
      const r = caja.getBoundingClientRect();
      if (!r.width || !r.height) return;
      px = ((e.clientX - r.left) / r.width - 0.5) * -2;
      py = ((e.clientY - r.top) / r.height - 0.5) * -2;
      if (!pedido) pedido = requestAnimationFrame(pintar);
    });
    // Al salir, la constelacion vuelve a su sitio en vez de quedarse torcida
    // en el ultimo gesto.
    caja.addEventListener('pointerleave', () => {
      px = 0; py = 0;
      if (!pedido) pedido = requestAnimationFrame(pintar);
    });
  }

  // '#7ED8C4' -> [126,216,196] · el canvas pinta con numeros, no con CSS
  function tinteDe(hex) {
    const h = String(hex || '#C9A961').replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  /* Un mundo cerrado no se abre a la fuerza ni se queda mudo: lleva a la
     verificacion, que es lo unico que lo abre. Uno que todavia no existe lo
     dice y no finge una pantalla vacia. */
  function nuAbrir(id) {
    // el clic que llega pegado a un jalon es el final del jalon, no un clic
    if (AURA.jalando()) return;
    const m = MUNDOS.find(x => x.id === id);
    if (!m) return;
    if (m.pronto) return avisar(t('nu.prontoP'));
    /* Con la identidad todavia en camino no se le cierra la puerta a nadie:
       tocar la esfera del chat en los primeros segundos mandaba a alguien
       verificado a rehacer su KYC. La propia pantalla vuelve a preguntar el
       estado antes de decidir (chatEntrar), asi que se la deja decidir a ella. */
    if (m.pideGid && identidad && !esVerificada()) { avisar(t('nu.cerrado')); return vista('verificar'); }
    const fuera = m.paraFuera === 'pay' ? URL_MYTOKENPAY : m.fuera;
    if (fuera) return window.open(fuera, '_blank', 'noopener');
    entrarPorLaEsfera(id, () => vista(m.va));
  }

  /* ENTRAR POR LA ESFERA. Antes, tocar un mundo borraba el Nucleo y pintaba la
     app en el mismo fotograma: funcionaba, pero no contaba nada. Ahora la
     esfera que se tocó crece y se abre —y el resto de la constelación se
     aparta y se apaga—, y la app entra por ese mismo punto. Se pasa de un
     sitio a otro; no se cambia de lámina.

     Son 240ms y ni uno más: la animación tiene que terminar antes de que a
     nadie le dé tiempo a preguntarse por qué no ha pasado nada todavía. Y si
     el navegador dice que no se mueva nada, no se mueve: se abre en seco, sin
     esperar los 240ms que ya no adornan nada. */
  function entrarPorLaEsfera(id, abrir) {
    const el = document.querySelector(`.nu-mundo[data-mundo="${id}"]`);
    const caja = el?.closest('.cerebro');
    if (!el || !caja || matchMedia('(prefers-reduced-motion:reduce)').matches) return abrir();
    caja.classList.add('cer-yendo');
    el.classList.add('nu-yendo');
    setTimeout(abrir, 240);
  }

  // ── MYTOKENPAY · el comercio, adentro de la casa ──────────────────────────

  /* MyTokenPay deja de ser un enlace que te saca de la web: vive ADENTRO,
     como el chat. El directorio es el mismo catalogo de la app —los mismos
     comercios, categorias y ciudades— y el cobro es el REAL de la wallet: el
     codigo que ya lleva la cantidad puesta.

     Lo que todavia no se finge: pagarle EN LINEA a un comercio del directorio
     exige que ese comercio haya registrado su direccion de cobro, y eso
     todavia no existe en el catalogo. A esos se les enseñan sus datos y sus
     redes — el puente honesto mientras el registro de comercios llega. */
  let payQ = '', payPais = '', payCat = '', payNeg = null;

  const PAY_EMOJI = {
    restaurantes: '🍽', cafeterias: '☕', hoteles: '🏨', gimnasios: '🏋',
    belleza: '💇', 'vida-nocturna': '🍸', conveniencia: '🛍', supermercados: '🛒',
    moda: '👗', tecnologia: '📱', salud: '🩺', educacion: '🎓',
    automotriz: '🚗', turismo: '🌴', servicios: '💼',
  };
  const payCiudad = (pais, ciudad) =>
    (PAY_CIUDADES[pais] || []).find(c => c.slug === ciudad)?.label || ciudad;
  const payCatNom = slug => PAY_CATEGORIAS.find(c => c.slug === slug)?.label || slug;

  function payFiltrados() {
    const q = sinTildes(payQ.trim());
    return PAY_COMERCIOS.filter(c => {
      if (payPais && c.pais !== payPais) return false;
      if (payCat && c.cat !== payCat) return false;
      if (!q) return true;
      return sinTildes(`${c.nombre} ${c.desc} ${payCatNom(c.cat)} ${payCiudad(c.pais, c.ciudad)}`).includes(q);
    });
  }

  function payTarjeta(c) {
    const verificado = c.estado === 'verified';
    return `
    <button class="pay-caja" onclick="VETA.payAbrir(${jsTxt(c.id)})">
      <div class="pay-cab">
        <span class="pay-emo">${PAY_EMOJI[c.cat] || '🏪'}</span>
        <div style="flex:1;min-width:0">
          <b>${esc(c.nombre)}</b>
          <small>${esc(payCatNom(c.cat))} · ${esc(payCiudad(c.pais, c.ciudad))}</small>
        </div>
        ${verificado ? `<span class="pay-ver" title="${t('pay.verif')}">
          <svg viewBox="0 0 24 24"><path d="M12 3l8 3.5v5c0 5-3.4 8.6-8 9.5-4.6-.9-8-4.5-8-9.5v-5z"/><path d="M9 12l2 2 4-4"/></svg></span>` : ''}
      </div>
      <p>${esc(c.desc.slice(0, 92))}${c.desc.length > 92 ? '…' : ''}</p>
    </button>`;
  }

  function pay() {
    const destacados = PAY_COMERCIOS.filter(c => c.estado === 'verified').slice(0, 4);
    return `
    <button class="volver" onclick="VETA.vista('nucleo')">
      <svg viewBox="0 0 24 24">${ICO.atras}</svg>${t('pay.alNucleo')}
    </button>
    <div class="cab"><div>
      <h2><img src="assets/apps/pay.png" alt="" class="pay-logo">MyTokenPay</h2>
      <div class="sub">${t('pay.sub')}</div>
    </div></div>

    <div class="bloque vidrio">
      <input class="pay-busca" placeholder="${t('pay.buscar')}" value="${esc(payQ)}"
             autocomplete="off" oninput="VETA.payBuscar(this.value)">
      <div class="pay-chips">
        ${PAY_CATEGORIAS.slice(0, 8).map(c => `
          <button class="pay-chip${payCat === c.slug ? ' va' : ''}"
                  onclick="VETA.payCategoria(${jsTxt(c.slug)})">${PAY_EMOJI[c.slug] || ''} ${esc(c.label)}</button>`).join('')}
      </div>
    </div>

    <div class="bloque vidrio">
      <div class="bloque-cab"><h3>${t('pay.destacados')}</h3>
        <button class="btn btn-linea btn-sm" onclick="VETA.payVerTodos()">${t('pay.todos')} (${PAY_COMERCIOS.length})</button>
      </div>
      <div class="pay-rejilla">${destacados.map(payTarjeta).join('')}</div>
    </div>

    ${/* El COBRO del comerciante es el real de la wallet, no una maqueta:
         el mismo codigo con la cantidad puesta que ya mueve dinero. */''}
    <div class="bloque vidrio pay-cobra">
      <div>
        <h3>${t('pay.cobraT')}</h3>
        <p class="pie" style="margin-top:6px">${t('pay.cobraP')}</p>
      </div>
      <button class="btn btn-oro" onclick="VETA.vista('cobrar')">${t('cob.t')}</button>
    </div>`;
  }

  function payex() {
    const lista = payFiltrados();
    return `
    <button class="volver" onclick="VETA.vista('pay')">
      <svg viewBox="0 0 24 24">${ICO.atras}</svg>MyTokenPay
    </button>
    <div class="cab"><div><h2>${t('pay.dirT')}</h2>
      <div class="sub">${lista.length} ${t('pay.de')} ${PAY_COMERCIOS.length} · ${t('pay.dirSub')}</div>
    </div></div>
    <div class="bloque vidrio">
      <input class="pay-busca" placeholder="${t('pay.buscar')}" value="${esc(payQ)}"
             autocomplete="off" oninput="VETA.payBuscar(this.value)">
      <div class="pay-filtros">
        <select onchange="VETA.payDePais(this.value)">
          <option value="">${t('pay.todosPais')}</option>
          ${PAY_PAISES.map(x => `<option value="${x.slug}" ${payPais === x.slug ? 'selected' : ''}>${x.flag} ${esc(x.label)}</option>`).join('')}
        </select>
        <select onchange="VETA.payCategoria(this.value)">
          <option value="">${t('pay.todasCat')}</option>
          ${PAY_CATEGORIAS.map(x => `<option value="${x.slug}" ${payCat === x.slug ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}
        </select>
      </div>
    </div>
    ${lista.length ? `<div class="pay-rejilla">${lista.map(payTarjeta).join('')}</div>`
      : `<div class="bloque vidrio"><div class="vacio"><b>${t('pay.nadaT')}</b>${t('pay.nadaP')}</div></div>`}`;
  }

  function payneg() {
    const c = PAY_COMERCIOS.find(x => x.id === payNeg);
    if (!c) return payex();
    const redes = Object.entries(c.redes || {}).filter(([, u]) => u && !/example\.com/.test(u));
    const ROTULO = { instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp', website: t('pay.web'), tiktok: 'TikTok' };
    const enlace = ([k, u]) => k === 'whatsapp'
      ? ['https://wa.me/' + String(u).replace(/[^\d]/g, ''), 'WhatsApp']
      : [u, ROTULO[k] || k];
    return `
    <button class="volver" onclick="VETA.vista('payex')">
      <svg viewBox="0 0 24 24">${ICO.atras}</svg>${t('pay.dirT')}
    </button>
    <div class="bloque vidrio">
      <div class="pay-cab" style="margin-bottom:14px">
        <span class="pay-emo pay-emo-g">${PAY_EMOJI[c.cat] || '🏪'}</span>
        <div style="flex:1;min-width:0">
          <h2 style="font-size:20px;font-weight:800">${esc(c.nombre)}</h2>
          <small style="color:var(--humo)">${esc(payCatNom(c.cat))} · ${esc(payCiudad(c.pais, c.ciudad))}</small>
        </div>
        ${c.estado === 'verified' ? `<span class="pay-ver"><svg viewBox="0 0 24 24"><path d="M12 3l8 3.5v5c0 5-3.4 8.6-8 9.5-4.6-.9-8-4.5-8-9.5v-5z"/><path d="M9 12l2 2 4-4"/></svg></span>` : ''}
      </div>
      <p class="ficha-desc" style="margin-top:0">${esc(c.desc)}</p>
      <div class="pay-ofrece">${(c.ofrece || []).map(o => `<span>${esc(o)}</span>`).join('')}</div>
      <dl class="datos" style="margin-top:16px">
        <div><dt>${t('pay.dire')}</dt><dd>${esc(c.dir)}</dd></div>
        <div><dt>${t('pay.razon')}</dt><dd>${esc(c.razon)}</dd></div>
      </dl>
      ${redes.length ? `<div class="ficha-btns">${redes.map(r => {
        const [u, nom] = enlace(r);
        return `<a class="btn btn-linea btn-sm" href="${esc(u)}" target="_blank" rel="noopener">${esc(nom)}</a>`;
      }).join('')}</div>` : ''}
    </div>
    <div class="bloque vidrio">
      <h3>${t('pay.pagarT')}</h3>
      <p class="pie" style="margin-top:8px">${t('pay.pagarP')}</p>
      <div class="ficha-btns">
        <button class="btn btn-oro btn-sm" onclick="VETA.vista('lector')">
          <svg viewBox="0 0 24 24" class="btn-ic">${ICO.camara}</svg>${t('pay.escanear')}</button>
      </div>
    </div>`;
  }

  const payBuscar = v => {
    payQ = v;
    // se repinta solo la rejilla para no matar el foco de la caja
    const cual = vistaActual === 'pay' ? 'pay' : 'payex';
    if (cual === 'payex') {
      const l = payFiltrados();
      const caja = document.querySelector('.pay-rejilla');
      if (caja) caja.innerHTML = l.map(payTarjeta).join('');
      const sub = document.querySelector('.cab .sub');
      if (sub) sub.textContent = `${l.length} ${t('pay.de')} ${PAY_COMERCIOS.length} · ${t('pay.dirSub')}`;
    } else if (payQ.trim().length > 1) {
      // escribir en la portada ya es buscar: se pasa al directorio
      vista('payex');
      $('.pay-busca')?.focus();
    }
  };
  const payCategoria = v => { payCat = payCat === v ? '' : v; vista(vistaActual === 'pay' && !payCat ? 'pay' : 'payex'); };
  const payDePais = v => { payPais = v; vista('payex'); };
  const payVerTodos = () => { payQ = ''; payCat = ''; payPais = ''; vista('payex'); };
  const payAbrir = id => { payNeg = id; vista('payneg'); };

  // ── cobrar ────────────────────────────────────────────────────────────────

  /* Recibir enseña una direccion. Cobrar enseña una CANTIDAD: quien paga no
     tiene que teclear cuanto, y por tanto no puede equivocarse tecleandolo.
     Es la diferencia entre dar tu numero de cuenta y pasar la factura.

     El codigo no lleva un formato inventado: lleva un enlace de verdad a esta
     misma web. Asi funciona en tres niveles, del mejor al peor:
       · esta web y la app lo leen entero — direccion, cantidad y moneda;
       · un lector viejo que solo busca una direccion encuentra la 0x dentro;
       · la camara del telefono, sin ninguna app nuestra, abre el enlace y
         lleva a Veta Wallet.
     Un formato propio solo habria servido para el primer caso. */
  let cobSim = 'ORIGEN', cobMonto = '';

  const enlaceCobro = (dir, monto, sim) =>
    `https://www.vetawallet.com/#pagar?a=${dir}&m=${encodeURIComponent(monto)}&s=${encodeURIComponent(sim)}`;

  /* Lo contrario: de lo que se leyo, a lo que hay que rellenar. Acepta el
     enlace entero y tambien una direccion suelta, que es lo que llevan los
     codigos de «recibir» de toda la vida. */
  function leerCobro(crudo) {
    const txt = String(crudo || '').trim();
    const dir = txt.match(/0x[a-fA-F0-9]{40}/)?.[0];
    if (!dir) return null;
    let monto = '', sim = '';
    try {
      const q = txt.includes('?') ? new URLSearchParams(txt.slice(txt.indexOf('?') + 1)) : null;
      if (q) { monto = q.get('m') || ''; sim = (q.get('s') || '').toUpperCase(); }
    } catch {}
    return { dir, monto, sim };
  }

  // Se abre enviar con todo puesto menos la contraseña: lo que hay que
  // comprobar antes de firmar se comprueba en la pantalla de siempre.
  function irACobro({ dir, monto, sim }) {
    if (sim && (cartera || []).some(m => m.s === sim)) envSim = sim;
    pendiente = null;
    vista('enviar');
    const d = $('#env-dir');
    if (d) d.value = dir;
    if (monto && $('#env-monto')) { $('#env-monto').value = monto; envMonto(); }
    $('#env-clave')?.focus();
  }

  function cobrar() {
    const dir = sesion?.direccion;
    if (!dir) return `
      <div class="cab"><div><h2>${t('cob.t')}</h2></div></div>
      <div class="bloque vidrio"><div class="vacio">
        <b>${t('rec.sinT')}</b>${t('rec.sinP')}
        <div style="margin-top:16px"><button class="btn btn-linea btn-sm" onclick="VETA.reintentar()">${t('ini.act')}</button></div>
      </div></div>`;

    const lista = (cartera || []).length ? cartera : [{ s: 'ORIGEN', n: 'ORIGEN', nativo: true }];
    const x = lista.find(m => m.s === cobSim) || lista[0];
    const n = Number(String(cobMonto).replace(',', '.'));
    const vale = n > 0;

    return `
    <div class="cab"><div><h2>${t('cob.t')}</h2><div class="sub">${t('cob.sub')}</div></div></div>
    <div class="bloque vidrio">
      <div class="campo">
        <label for="cob-monto">${t('cob.cuanto')}</label>
        <div class="env-monto">
          <input id="cob-monto" type="text" inputmode="decimal" placeholder="0,00"
                 value="${esc(cobMonto)}" oninput="VETA.cobEscribir(this.value)">
          <select class="cob-sim" onchange="VETA.cobElegir(this.value)">
            ${lista.map(m => `<option value="${esc(m.s)}" ${m.s === x.s ? 'selected' : ''}>${esc(m.s)}</option>`).join('')}
          </select>
        </div>
        <div class="env-usd">${x.precio != null && vale ? '≈ ' + usd(n * x.precio) : ''}</div>
      </div>
    </div>
    <div class="bloque vidrio" style="text-align:center">
      ${vale ? `
        <div class="qr-caja" id="cob-qr"></div>
        <div class="cob-cifra">${oro(n)} <em>${esc(x.s)}</em></div>
        <div class="dir mono">${esc(cortaDir(dir))}</div>
        <div style="margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-oro btn-sm" onclick="VETA.cobCopiar()">${t('cob.copiar')}</button>
          <button class="btn btn-linea btn-sm" onclick="VETA.cobCompartir()">${t('rec.compartir')}</button>
        </div>`
      : `<div class="vacio"><b>${t('cob.pon')}</b>${t('cob.ponP')}</div>`}
      <p class="pie" style="margin-top:18px">${t('cob.nota')}</p>
    </div>`;
  }

  function cobElegir(v) { cobSim = v; vista('cobrar'); }

  /* La cantidad NO repinta la vista entera: repintarla en cada tecla mata el
     foco del campo. Solo se redibuja el codigo y las dos cifras de debajo. */
  function cobEscribir(v) {
    cobMonto = v;
    const n = Number(String(v).replace(',', '.'));
    const antes = !!$('#cob-qr');
    if ((n > 0) !== antes) return vista('cobrar');   // aparece o desaparece
    pintarCobro();
  }

  function pintarCobro() {
    const c = $('#cob-qr');
    if (!c || !sesion?.direccion) return;
    const n = Number(String(cobMonto).replace(',', '.'));
    if (!(n > 0)) return;
    const x = (cartera || []).find(m => m.s === cobSim);
    try {
      c.innerHTML = QR.svg(enlaceCobro(sesion.direccion, n, cobSim),
                           { claro: '#F3ECD9', oscuro: '#021B1C', margen: 2 });
    } catch { c.innerHTML = ''; }
    const cifra = $('.cob-cifra');
    if (cifra) cifra.innerHTML = `${oro(n)} <em>${esc(cobSim)}</em>`;
    const eu = $('.env-usd');
    if (eu) eu.textContent = x?.precio != null ? '≈ ' + usd(n * x.precio) : '';
  }

  const textoCobro = () => {
    const n = Number(String(cobMonto).replace(',', '.'));
    return enlaceCobro(sesion?.direccion || '', n, cobSim);
  };
  const cobCopiar = () => copiarTexto(textoCobro(), t('cob.copiado'));
  function cobCompartir() {
    const url = textoCobro();
    if (navigator.share) navigator.share({ title: 'Veta Wallet', text: t('cob.pide'), url }).catch(() => {});
    else cobCopiar();
  }

  // ── PULSE CHAT ─────────────────────────────────────────────────────────────

  /* La mensajeria del ecosistema, la misma que el telefono y contra el mismo
     relevo. Dos reglas heredadas de alla y que aqui no se relajan:

       · SOLO se abre con Genesis ID aprobado. Es la red de gente real, y esa
         es toda la garantia que da: que del otro lado hay alguien verificado.
       · NO hay cifrado de punta a punta, y no se dice en ningun sitio que lo
         haya.

     En el telefono la lista y el hilo son dos pantallas. Aqui son dos
     columnas cuando la pantalla da para las dos, y dos pantallas cuando no:
     estirar una lista de conversaciones a 1400px no la mejora, y meter una
     columna de 200px en un movil la vuelve inservible. */

  const chatSt = {
    puerta: null,        // null = sin mirar · 'abierta' · 'falta' · 'rota'
    error: null,         // el fallo del relevo, si lo hubo
    convs: null,
    con: null,           // {id, nombre, esGrupo, gid, addr} — el hilo abierto
    msgs: null,
    busca: '',
    gente: null,
    mandando: false,
    subiendo: false,
  };
  let chatReloj = null, chatDebounce = null;

  /* QUE SE ENSEÑA EN LA COLUMNA DERECHA. En movil las dos columnas son dos
     pantallas: la derecha solo aparece con `data-abierto`. Se ataba a «hay un
     hilo abierto», pero la puerta de Genesis, el aviso de error y Mi perfil
     tambien viven ahi — asi que en un telefono, alguien sin Genesis ID abria
     PULSE CHAT y veia la nada, y con el relevo caido veia esqueletos eternos
     con el motivo real invisible. Todo lo que se pinte en esa columna tiene
     que abrirla. */
  /* PEDIR Y CONFIRMAR, CON LA CARA DE LA CASA.
     Crear un grupo, invitar, renombrar y confirmar un borrado usaban los
     cuadros del navegador: sin marca, con botones en el idioma del sistema y
     bloqueados de plano en algunos webviews — o sea que en ciertos telefonos
     el boton simplemente no hacia nada. En un producto que se vende premium,
     esa es la costura mas barata que se puede dejar a la vista.

     Se resuelve con la hoja que el chat ya tiene (.chaf-hoja) y una promesa:
     `await chatPedir({...})` devuelve el texto escrito, o null si se cerro. */
  function chatPedir({ titulo, nota, valor = '', ph = '', ok, peligro }) {
    return new Promise((resolver) => {
      chatSt.hoja = { titulo, nota, valor, ph, ok, peligro, resolver };
      pintarChat();
      setTimeout(() => $('#chat-hoja-txt')?.focus(), 60);
    });
  }

  function chatHojaCerrar(texto) {
    const h = chatSt.hoja;
    chatSt.hoja = null;
    pintarChat();
    h?.resolver(texto ?? null);
  }

  function chatHojaOk(ev) {
    ev?.preventDefault?.();
    const h = chatSt.hoja;
    // sin campo es una confirmacion: el «si» es el propio boton
    const v = h?.ph === null ? true : ($('#chat-hoja-txt')?.value || '').trim();
    if (h?.ph !== null && !v) return false;
    chatHojaCerrar(v);
    return false;
  }

  const chatConfirmar = (titulo, nota, ok, peligro) =>
    chatPedir({ titulo, nota, ph: null, ok, peligro }).then(Boolean);

  function chatHoja() {
    const h = chatSt.hoja;
    if (!h) return '';
    return `
      <div class="cha-ficha" onclick="if(event.target===this)VETA.chatHojaCerrar()">
        <div class="chaf-hoja">
          <button class="chaf-x" onclick="VETA.chatHojaCerrar()" aria-label="${t('tok.volver')}">✕</button>
          <h3>${esc(h.titulo)}</h3>
          ${h.nota ? `<p class="chaf-honesto" style="margin:10px 0 0;padding:0;border:0">${esc(h.nota)}</p>` : ''}
          <form onsubmit="return VETA.chatHojaOk(event)" style="margin-top:16px">
            ${h.ph === null ? '' : `<input id="chat-hoja-txt" class="editInput" value="${esc(h.valor)}"
                     placeholder="${esc(h.ph)}" maxlength="80" autocomplete="off">`}
            <div class="chaf-acciones" style="margin-top:14px">
              <button type="submit" class="btn ${h.peligro ? 'btn-linea chaf-malo' : 'btn-oro'} btn-sm">${esc(h.ok)}</button>
              <button type="button" class="btn btn-linea btn-sm" onclick="VETA.chatHojaCerrar()">${t('cha.cancelar')}</button>
            </div>
          </form>
        </div>
      </div>`;
  }

  const chatHayPanel = () => Boolean(
    chatSt.con || chatSt.verCodigo || chatSt.error || chatSt.puerta === 'falta');

  function chat() {
    return `
    <div class="cab">
      <div><h2>PULSE CHAT <svg viewBox="0 0 60 14" style="width:52px;height:14px;vertical-align:-1px">
        <path d="M0 7h18l4-5 5 9 4-6 3 2h26" fill="none" stroke="#E0937A" stroke-width="1.6" stroke-linejoin="round"/>
      </svg></h2><div class="sub">${t('cha.sub')}</div></div>
    </div>
    <div class="chat" id="chat-caja" ${chatHayPanel() ? 'data-abierto' : ''}>
      <aside class="chat-lista" id="chat-lista">${chatLista()}</aside>
      <section class="chat-hilo" id="chat-hilo">${chatHilo()}</section>
    </div>`;
  }

  /* Arrancar el chat es darse de alta en el relevo y pedir las charlas. El
     alta se espera SIEMPRE y se lee lo que devuelve: cuando el correo es
     nuevo el relevo acuña su propia llave e ignora la que le mandes, asi que
     no leerla deja al navegador usando una que el servidor jamas acepto. */
  async function chatEntrar() {
    if (!esVerificada()) {
      // Puede que la identidad aun no haya llegado; se pide y se vuelve a mirar
      // antes de cerrarle la puerta a alguien que si esta verificado.
      if (!identidad) await cargarIdentidad();
      if (!esVerificada()) { chatSt.puerta = 'falta'; return pintarChat(); }
    }
    chatSt.puerta = 'abierta';
    try {
      if (!CHAT.listo()) {
        await CHAT.alta({ correo: sesion?.correo, nombre: sesion?.nombre,
                          direccion: sesion?.direccion, gid: identidad?.gid || '',
                          sesion: sesion?.token });
      }
      chatSt.error = null;
      await chatCargarConvs();
    } catch (e) {
      chatSt.error = chatMotivo(e);
      pintarChat();
    }
    chatLatir();
  }

  /* El 401 y el 409 no son el mismo problema y no se arreglan igual: el 401
     es una llave que este navegador tiene y el relevo ya no reconoce —se
     rehace sola—; el 409 es que el correo YA tiene dueño en otra instalacion,
     y eso no lo arregla un reintento. Todo lo demas es la red. */
  function chatMotivo(e) {
    if (e?.code === 401) return 'llave';
    if (e?.code === 409) return 'otra';
    return 'red';
  }

  // El boton de desatascar: tira la llave guardada y vuelve a darse de alta.
  // Existe porque «sin conexion» con el wifi perfecto es lo mas exasperante
  // que puede pasarle a alguien, y hasta ahora habia que arreglarlo a mano.
  async function chatReparar() {
    chatSt.error = null;
    pintarChat();
    try {
      await CHAT.rehacerAlta({ correo: sesion?.correo, nombre: sesion?.nombre,
                               direccion: sesion?.direccion, gid: identidad?.gid || '',
                               sesion: sesion?.token });
      await chatCargarConvs();
      avisar(t('cha.repOk'));
    } catch (e) {
      chatSt.error = chatMotivo(e);
      pintarChat();
    }
  }

  async function chatCargarConvs() {
    try {
      chatSt.convs = await CHAT.conversaciones();
      chatSt.error = null;
    } catch (e) { chatSt.error = chatMotivo(e); }
    pintarChat();
    // La invitacion que trajo hasta aca: se abre UNA vez, con el chat ya
    // de pie, y se olvida — un enlace no es una orden permanente.
    if (chatPendiente && CHAT.listo()) {
      const p = chatPendiente;
      chatPendiente = null;
      if (p.inv) {
        /* Una invitacion de grupo se canjea UNA vez: el relevo suma a esta
           cuenta al grupo y dice cual es, y recien ahi se abre. Si ya no vale
           —la regeneraron— se dice, en vez de dejar la pantalla en blanco. */
        CHAT.grupoUnirse(p.inv)
          .then(async g => { await chatCargarConvs(); if (g?.id) chatAbrir(g.id); avisar(t('cha.entraste')); })
          .catch(() => avisar(t('cha.invMala')));
      } else {
        chatAbrir(p.con);
      }
    }
  }

  /* El latido: mientras el chat esta en pantalla se refresca solo. Cinco
     segundos con el hilo abierto y quince con solo la lista — mirar una lista
     no es esperar una respuesta. */
  function chatLatir() {
    chatParar();
    chatReloj = setInterval(() => {
      if (vistaActual !== 'chat' || document.hidden) return;
      if (chatSt.con) chatCargarMsgs(true); else chatCargarConvs();
    }, 5000);
  }
  function chatParar() { if (chatReloj) { clearInterval(chatReloj); chatReloj = null; } }

  async function chatAbrir(id) {
    /* Sin llave no se abre nada. Sin esta guarda, una peticion hecha sin llave
       vuelve con 401 y tapa el motivo verdadero: quien tiene el correo tomado
       en otro dispositivo (409) veria «el chat se trabo» y un boton de
       desbloquear que no puede funcionar. */
    if (!CHAT.listo()) return;
    const c = (chatSt.convs || []).find(x => (x.id || x.correo) === id)
      || (chatSt.gente || []).find(x => x.correo === id);
    chatSt.con = c
      ? { id, nombre: c.nombre || id, esGrupo: !!c.esGrupo, gid: c.gid || '', addr: c.addr || '' }
      : { id, nombre: id, esGrupo: CHAT.esGrupo(id), gid: '', addr: '' };
    chatSt.msgs = null;
    chatSt.gente = null;
    chatSt.busca = '';
    chatSt.verCodigo = false;
    pintarChat();
    await chatCargarMsgs();
    CHAT.leido(id);
  }

  function chatCerrar() {
    chatSt.con = null;
    chatSt.msgs = null;
    pintarChat();
    chatCargarConvs();
  }

  async function chatCargarMsgs(callado) {
    const quien = chatSt.con?.id;
    if (!quien) return;
    try {
      const m = await CHAT.bandeja(quien);
      // Si mientras llegaba la respuesta se cambio de hilo, se descarta: pintar
      // los mensajes de otra conversacion es peor que no pintar nada.
      if (chatSt.con?.id !== quien) return;
      /* Con el mismo hilo no se repinta: repintar en cada latido roba el foco
         del campo y tira el scroll a quien esta leyendo. Pero comparar SOLO el
         largo mata los hilos mas activos: /bandeja recorta a 200, asi que al
         llegar al tope el largo queda clavado y los mensajes nuevos no se
         pintan nunca mas hasta cambiar de conversacion. Se mira tambien el
         ultimo mensaje, que es lo que de verdad cambia. */
      const ult = (l) => (l && l.length ? l[l.length - 1].cuando : null);
      const igual = callado && chatSt.msgs
        && chatSt.msgs.length === m.length && ult(chatSt.msgs) === ult(m);
      chatSt.msgs = m;
      chatSt.error = null;
      if (!igual) { pintarChat(); chatAlFinal(); }
    } catch (e) {
      chatSt.error = chatMotivo(e);
      if (!callado) pintarChat();
    }
  }

  async function chatMandar(ev) {
    ev.preventDefault();
    const c = $('#chat-txt');
    const texto = (c?.value || '').trim();
    if (!texto || chatSt.mandando || !chatSt.con) return;
    chatSt.mandando = true;
    c.value = '';
    try {
      await CHAT.enviar(chatSt.con.id, texto);
      await chatCargarMsgs();
      chatCargarConvs();
    } catch (e) {
      // Lo escrito vuelve al campo: perder un mensaje por un fallo de red es
      // hacerle escribirlo otra vez a quien ya lo escribio.
      if (c) c.value = texto;
      chatSt.error = chatMotivo(e);
      pintarChat();
    } finally { chatSt.mandando = false; $('#chat-txt')?.focus(); }
  }

  async function chatAdjuntar(input) {
    const f = input?.files?.[0];
    input.value = '';
    if (!f || !chatSt.con || chatSt.subiendo) return;
    chatSt.subiendo = true;
    pintarChat();
    try {
      const adj = await CHAT.subir(f);
      await CHAT.enviarAdjunto(chatSt.con.id, adj, '');
      await chatCargarMsgs();
      chatCargarConvs();
    } catch (e) {
      avisar(e?.code === 413 ? t('cha.pesa') : t('cha.errAdj'));
    } finally { chatSt.subiendo = false; pintarChat(); }
  }

  function chatBuscar(valor) {
    chatSt.busca = valor;
    clearTimeout(chatDebounce);
    // Se espera a que deje de escribir: una peticion por tecla es ruido para
    // el relevo y parpadeo para quien busca.
    chatDebounce = setTimeout(async () => {
      const q = chatSt.busca.trim();
      if (q.length < 2) { chatSt.gente = null; return pintarChat(); }
      try { chatSt.gente = await CHAT.buscar(q); chatSt.buscaMal = false; }
      catch (e) {
        // «No encontramos a nadie» y «la búsqueda no salió» son cosas
        // distintas: la primera manda a probar con el correo completo, la
        // segunda a mirar la conexión. Decir la primera cuando pasa la segunda
        // hace que alguien dé por hecho que su contacto no está en el chat.
        chatSt.gente = []; chatSt.buscaMal = true;
      }
      pintarChat();
    }, 320);
  }

  async function chatCodigo() {
    chatSt.verCodigo = !chatSt.verCodigo;
    if (chatSt.verCodigo) { chatSt.con = null; chatSt.ficha = null; }
    pintarChat();
    if (!chatSt.verCodigo) return;
    // mi ficha tal como la ve el resto: si el relevo no contesta, la pantalla
    // sigue sirviendo con lo que ya sabe la sesion
    try {
      const yo = await CHAT.ficha((sesion?.correo || '').toLowerCase());
      if (chatSt.verCodigo) { chatSt.yo = yo; pintarChat(); }
    } catch {}
  }

  const chatCodigoCopiar = () => copiarTexto(enlaceChat(), t('cha.codCopiado'));

  async function chatGrupo() {
    const nombre = (await chatPedir({ titulo: t('cha.grupo'), ph: t('cha.grPide'),
      ok: t('cha.crear') }) || '').trim();
    if (!nombre) return;
    try {
      const g = await CHAT.grupoCrear(nombre, []);
      await chatCargarConvs();
      if (g?.id) chatAbrir(g.id);
      avisar(t('cha.grHecho'));
    } catch (e) { chatSt.error = chatMotivo(e); pintarChat(); }
  }

  /* ── LA FICHA ────────────────────────────────────────────────────────────
     Tocar la cabecera del hilo abre quién es el otro: su cara, su Genesis ID,
     su dirección en la cadena, y lo que se puede hacer con esta conversación.
     Hasta ahora el chat de la web era un hilo y nada más — no había forma de
     ver a nadie, ni de mandarle ORIGEN, ni de vaciar lo hablado. El relevo ya
     sabía contestar todo esto (/ficha, /grupo/info): lo que faltaba era la
     pantalla. */

  async function chatVerFicha() {
    const c = chatSt.con;
    if (!c) return;
    chatSt.ficha = { cargando: true };
    pintarChat();
    try {
      chatSt.ficha = c.esGrupo
        ? { grupo: await CHAT.grupoInfo(c.id) }
        : { persona: { correo: c.id, ...(await CHAT.ficha(c.id)) } };
    } catch (e) {
      chatSt.ficha = { error: chatMotivo(e) };
    }
    // mientras llegaba la respuesta pudieron cambiar de hilo o cerrarlo
    if (chatSt.con?.id !== c.id) { chatSt.ficha = null; return; }
    pintarChat();
  }

  function chatFichaCerrar() { chatSt.ficha = null; pintarChat(); }

  /* Mandarle ORIGEN a alguien SIN copiar una dirección a mano — que es donde
     la gente se equivoca y pierde el dinero. La dirección sale de su ficha,
     nunca de algo escrito; y se deja anotado a quién era, para publicar el
     comprobante en ESTE hilo cuando la cadena confirme. Antes no: un
     comprobante de algo que todavía no pasó sería una mentira firmada por
     nosotros. */
  let avisarChat = null;

  function chatEnviarOrigen() {
    const c = chatSt.con;
    const dir = chatSt.ficha?.persona?.addr || c?.addr;
    if (!dir) return avisar(t('cha.sinDir'));
    /* Se anota la DIRECCION, no solo el hilo. El comprobante se publicaba si
       el envio salia bien, fuera a donde fuera: bastaba con cancelar, cambiar
       la direccion a mano —o volver dias despues y mandarle a otra persona—
       para que el hash de ESE pago apareciera como tarjeta en el hilo de
       quien no lo recibio. Un comprobante en la conversacion equivocada es
       una mentira firmada por nosotros. */
    avisarChat = { id: c.id, nombre: c.nombre, dir: String(dir).toLowerCase() };
    chatSt.ficha = null;
    enviarA(dir);
  }

  function chatGuardarContacto() {
    const c = chatSt.con;
    const f = chatSt.ficha?.persona || {};
    const dir = f.addr || c?.addr;
    if (!dir) return avisar(t('cha.sinDir'));
    const l = leerContactos();
    // la misma dirección no se guarda dos veces: la libreta es para encontrar
    // gente, no para coleccionar la misma fila
    if (l.some(x => x.dir.toLowerCase() === dir.toLowerCase())) return avisar(t('cha.contactoYa'));
    l.unshift({ id: String(Date.now()), nombre: c.nombre || f.correo || c.id, dir });
    guardarContactos(l);
    avisar(t('cha.contactoOk'));
  }

  /* Vaciar y borrar. La pantalla lo dice sin adornos: el hilo es de dos y
     esto solo cambia MI vista. La otra persona conserva su copia — decirlo
     aquí es más barato que un juicio después. */
  async function chatOlvidar(quitar) {
    const c = chatSt.con;
    if (!c) return;
    if (!await chatConfirmar(quitar ? t('cha.borrarConv') : t('cha.vaciar'),
      quitar ? t('cha.borrarQ') : t('cha.vaciarQ'),
      quitar ? t('cha.siBorrar') : t('cha.siVaciar'), true)) return;
    try {
      await CHAT.olvidar(c.id, quitar);
      chatSt.ficha = null;
      if (quitar) { chatSt.con = null; chatSt.msgs = null; }
      else chatSt.msgs = [];
      await chatCargarConvs();
      pintarChat();
      avisar(quitar ? t('cha.borrado') : t('cha.vaciado'));
    } catch (e) { avisar(chatMotivo(e)); }
  }

  // ── grupos: lo que ya sabía el relevo y nadie podía tocar ────────────────

  async function chatGrupoInvitar() {
    const quien = (await chatPedir({ titulo: t('cha.invitar'), ph: t('cha.invPide'),
      ok: t('cha.invitar') }) || '').trim().toLowerCase();
    if (!quien) return;
    try {
      const r = await CHAT.grupoInvitar(chatSt.con.id, [quien]);
      /* «Invitación enviada» a alguien que no existe es mentirle a quien
         invita: se queda esperando a una persona que nunca va a ver nada. El
         relevo ahora dice a quién sumó de verdad y a quién no encontró. */
      const sumados = r?.['añadidos'] ?? r?.agregados ?? 0;
      if (!sumados) {
        return avisar(r?.yaEstaban?.length ? t('cha.invYa') : t('cha.invNadie'));
      }
      avisar(t('cha.invHecho'));
      chatVerFicha();
    } catch (e) { avisar(chatMotivo(e)); }
  }

  async function chatGrupoNombre() {
    const n = (await chatPedir({ titulo: t('cha.cambiarNombre'), ph: t('cha.grPide'),
      valor: chatSt.ficha?.grupo?.nombre || '', ok: t('cha.guardarNombre') }) || '').trim();
    if (!n) return;
    try {
      await CHAT.grupoEditar(chatSt.con.id, { nombre: n });
      chatSt.con.nombre = n;
      await chatCargarConvs();
      chatVerFicha();
    } catch (e) { avisar(chatMotivo(e)); }
  }

  async function chatGrupoSalir() {
    if (!await chatConfirmar(t('cha.salir'), t('cha.salirQ'), t('cha.salir'), true)) return;
    try {
      await CHAT.grupoSalir(chatSt.con.id);
      chatSt.ficha = null; chatSt.con = null; chatSt.msgs = null;
      await chatCargarConvs();
      pintarChat();
      avisar(t('cha.saliste'));
    } catch (e) { avisar(chatMotivo(e)); }
  }

  const chatInvCopiar = () => {
    const inv = chatSt.ficha?.grupo?.invitacion;
    if (inv) copiarTexto(enlaceGrupo(inv), t('cha.codCopiado'));
  };

  // ── mi perfil de chat: mi cara, mi nombre y mi código ────────────────────

  /* La foto sube como un adjunto cualquiera y después el perfil la referencia
     por su id: el relevo no guarda un binario aparte para esto. Es el mismo
     camino que usa la app, así que la misma cara se ve desde los dos lados. */
  async function chatMiFoto(input) {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) return avisar(t('cha.soloImg'));
    chatSt.subiendoFoto = true; pintarChat();
    try {
      const adj = await CHAT.subir(f);
      await CHAT.perfil({ foto: adj.id });
      chatSt.yo = { ...(chatSt.yo || {}), foto: adj.id };
      await chatCargarConvs();
      avisar(t('cha.fotoOk'));
    } catch (e) { avisar(chatMotivo(e)); }
    finally { chatSt.subiendoFoto = false; pintarChat(); }
  }

  async function chatMiFotoQuitar() {
    try {
      await CHAT.perfil({ foto: '' });
      chatSt.yo = { ...(chatSt.yo || {}), foto: '' };
      await chatCargarConvs();
      pintarChat();
    } catch (e) { avisar(chatMotivo(e)); }
  }

  async function chatMiNombre() {
    const n = (await chatPedir({ titulo: t('cha.nombre'), ph: t('cha.nombrePide'),
      valor: chatSt.yo?.nombre || sesion?.nombre || '', ok: t('cha.guardarNombre') }) || '').trim();
    if (!n) return;
    try {
      await CHAT.perfil({ nombre: n });
      chatSt.yo = { ...(chatSt.yo || {}), nombre: n };
      pintarChat();
      avisar(t('cha.nombreOk'));
    } catch (e) { avisar(chatMotivo(e)); }
  }

  // ── el dibujo ───────────────────────────────────────────────────────────

  /* Se repintan las dos columnas por dentro y no la vista entera: repintar la
     vista tira lo escrito en el campo y devuelve el scroll del hilo arriba
     del todo cada cinco segundos. */
  function pintarChat() {
    if (vistaActual !== 'chat') return;
    const caja = $('#chat-caja');
    if (!caja) return;
    caja.toggleAttribute('data-abierto', chatHayPanel());
    const l = $('#chat-lista'), h = $('#chat-hilo');
    if (l) l.innerHTML = chatLista();
    if (h) {
      const txt = $('#chat-txt')?.value;
      h.innerHTML = chatHilo();
      const c = $('#chat-txt');
      if (c && txt) c.value = txt;
    }
    /* Los códigos se dibujan DESPUÉS de pintar, y aquí y no en quien los pide:
       cualquier repintado —el latido cada cinco segundos, sin ir más lejos—
       se llevaba por delante el QR y dejaba el hueco blanco. */
    pintarQrChat('#chat-qr', enlaceChat());
    const inv = chatSt.ficha?.grupo?.invitacion;
    if (inv) pintarQrChat('#chat-qr-grupo', enlaceGrupo(inv));
  }

  function pintarQrChat(donde, texto) {
    const c = $(donde);
    if (!c) return;
    try { c.innerHTML = QR.svg(texto, { claro: '#F3ECD9', oscuro: '#021B1C', margen: 2 }); }
    catch { c.remove(); }
  }

  function chatAlFinal() {
    const m = $('#chat-msgs');
    if (m) m.scrollTop = m.scrollHeight;
  }

  /* La invitacion de contacto. Se GENERA como enlace web —la camara del
     telefono lo abre sin ninguna app nuestra, igual que el de cobrar— y se
     ENTIENDEN los dos formatos: este y el og://chat/abrir?con=… que los QR
     de la app ya llevan impresos por ahi. */
  const enlaceChat = () =>
    'https://www.vetawallet.com/#chat?con=' + encodeURIComponent((sesion?.correo || '').toLowerCase())
    + (identidad?.gid ? '&gid=' + encodeURIComponent(identidad.gid) : '');

  /* La invitación a un grupo es un permiso, no un nombre: quien tiene el
     enlace entra. Por eso se puede regenerar desde la ficha —eso invalida el
     viejo al instante— y por eso no lleva el nombre del grupo pegado. */
  const enlaceGrupo = inv =>
    'https://www.vetawallet.com/#chat?inv=' + encodeURIComponent(inv || '');

  function leerInvitacion(crudo) {
    const txt = String(crudo || '').trim();
    // og://chat/grupo?inv= es el formato que ya imprime la app en sus QR de
    // grupo; #chat?inv= es el de la web. Los dos se entienden aquí.
    const m = txt.match(/(?:og:\/\/chat\/(?:abrir|grupo)|#chat)\?([^\s]+)/);
    if (!m) return null;
    try {
      const q = new URLSearchParams(m[1]);
      const inv = (q.get('inv') || '').trim();
      if (/^[0-9a-f]{24}$/.test(inv)) return { inv };
      const con = (q.get('con') || '').toLowerCase();
      return /@/.test(con) ? { con, gid: q.get('gid') || '' } : null;
    } catch { return null; }
  }

  // El hilo que hay que abrir en cuanto el chat este de pie: quien llega por
  // una invitacion no tiene por que volver a buscar a la persona.
  let chatPendiente = null;

  const chatIni = s => (String(s || '?').trim()[0] || '?').toUpperCase();

  function chatAvatar(x) {
    if (x?.foto) return `<span class="cha-av"><img src="${esc(CHAT.urlArchivo(x.foto))}" alt="" loading="lazy"></span>`;
    return `<span class="cha-av">${esc(chatIni(x?.nombre || x?.correo))}</span>`;
  }

  // Lo ultimo dicho, resumido para la lista. Un adjunto no tiene texto, asi
  // que se nombra por lo que es en vez de dejar la fila muda.
  function chatResumen(m) {
    if (!m) return t('cha.nada');
    if (m.tipo === 'pago') return `${t('cha.pago')} ${m.monto} ${m.moneda}`;
    if (m.tipo === 'imagen') return t('cha.unaFoto');
    if (m.tipo === 'video') return t('cha.unVideo');
    if (m.tipo === 'archivo') return t('cha.unArchivo');
    return m.texto || '';
  }

  function chatLista() {
    if (chatSt.puerta === 'falta') return '';
    const cab = `
      <div class="cha-cab">
        <input id="chat-busca" placeholder="${t('cha.buscar')}" value="${esc(chatSt.busca)}"
               autocomplete="off" oninput="VETA.chatBuscar(this.value)">
        <button class="cha-mas" onclick="VETA.chatCodigo()" title="${t('cha.miCod')}"
                aria-label="${t('cha.miCod')}">
          <svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h3v3h-3zM20 14v2M17 20h3M14 19v1"/></svg>
        </button>
        <button class="cha-mas" onclick="VETA.chatGrupo()" title="${t('cha.grupo')}"
                aria-label="${t('cha.grupo')}">
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>`;

    if (chatSt.gente) {
      const g = chatSt.gente;
      return cab + (g.length ? g.map(x => `
        <button class="cha-fila" onclick="VETA.chatAbrir(${jsTxt(x.correo)})">
          ${chatAvatar(x)}
          <span class="cha-txt"><b>${esc(x.nombre || x.correo)}</b>
            <small>${esc(x.gid || x.correo)}</small></span>
        </button>`).join('')
        : chatSt.buscaMal
          ? `<div class="vacio"><b>${t('cha.buscaMalT')}</b>${t('cha.buscaMalP')}</div>`
          : `<div class="vacio"><b>${t('cha.nadie')}</b>${t('cha.nadieP')}</div>`);
    }

    if (chatSt.convs === null) {
      return cab + [0, 1, 2].map(() => `
        <div class="cha-fila"><span class="cha-av esqueleto"></span>
          <span class="cha-txt"><b class="esqueleto">Cargando</b><small class="esqueleto">…</small></span>
        </div>`).join('');
    }
    if (!chatSt.convs.length) {
      return cab + `<div class="vacio"><b>${t('cha.vacioT')}</b>${t('cha.vacioP')}</div>`;
    }
    return cab + chatSt.convs.map(c => {
      const id = c.id || c.correo;
      return `
      <button class="cha-fila" ${chatSt.con?.id === id ? 'data-aqui' : ''}
              onclick="VETA.chatAbrir(${jsTxt(id)})">
        ${chatAvatar(c)}
        <span class="cha-txt">
          <b>${esc(c.nombre || c.correo)}${c.esGrupo ? ` <em>· ${c.miembros}</em>` : ''}</b>
          <small>${esc(chatResumen(c.ultimo))}</small>
        </span>
        ${c.sinLeer ? `<span class="cha-bola">${c.sinLeer}</span>` : ''}
      </button>`;
    }).join('');
  }

  function chatHilo() {
    if (chatSt.puerta === 'falta') return `
      <div class="cha-puerta">
        <div class="cha-escudo"><svg viewBox="0 0 24 24">${ICO.escudo}</svg></div>
        <h3>${t('cha.gateT')}</h3>
        <p>${t('cha.gateP')}</p>
        <button class="btn btn-oro btn-sm" onclick="VETA.vista('verificar')">${t('gid.btn')}</button>
      </div>`;

    if (chatSt.error) {
      const k = chatSt.error;
      return `
      <div class="cha-puerta">
        <h3>${t('cha.e' + k + 'T')}</h3>
        <p>${t('cha.e' + k + 'P')}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
          ${k === 'otra' ? '' : `<button class="btn btn-oro btn-sm" onclick="VETA.chatReparar()">${t('cha.desbloquear')}</button>`}
          <button class="btn btn-linea btn-sm" onclick="VETA.chatEntrar()">${t('ini.act')}</button>
        </div>
      </div>`;
    }

    /* MI PERFIL DE CHAT. Antes esto era solo el código QR; ahora es lo que la
       gente ve de mí: la cara, el nombre con el que me encuentran y mi
       Genesis ID. La foto va aquí y no en Ajustes porque es la del chat —la
       identidad de la wallet no se toca desde una pantalla de mensajes. */
    if (chatSt.verCodigo) {
      const yo = chatSt.yo || {};
      return `
      <div class="cha-puerta cha-yo">
        <h3>${t('cha.miPerfil')}</h3>
        <div class="chay-cara">
          ${yo.foto
            ? `<img src="${esc(CHAT.urlArchivo(yo.foto))}" alt="">`
            : `<span>${esc(chatIni(yo.nombre || sesion?.nombre || sesion?.correo))}</span>`}
          ${chatSt.subiendoFoto ? '<div class="chay-subiendo"><span class="girando"></span></div>' : ''}
        </div>
        <div class="chay-fotobtn">
          <label class="btn btn-linea btn-sm">
            ${yo.foto ? t('cha.cambiarFoto') : t('cha.ponerFoto')}
            <input type="file" accept="image/*" onchange="VETA.chatMiFoto(this)" hidden>
          </label>
          ${yo.foto ? `<button class="btn btn-linea btn-sm" onclick="VETA.chatMiFotoQuitar()">${t('cha.quitarFoto')}</button>` : ''}
        </div>
        <dl class="chaf-datos">
          <dt>${t('cha.nombre')}</dt>
          <dd>${esc(yo.nombre || sesion?.nombre || '')}
            <button class="chay-lapiz" onclick="VETA.chatMiNombre()" aria-label="${t('cha.cambiarNombre')}">
              <svg viewBox="0 0 24 24">${ICO.lapiz}</svg></button></dd>
          <dt>${t('cha.gid')}</dt>
          <dd class="mono">${identidad?.gid ? esc(identidad.gid) : `<span class="chaf-nada">${t('cha.sinGid')}</span>`}</dd>
        </dl>
        <p>${t('cha.miCodP')}</p>
        <div class="qr-caja" style="max-width:240px" id="chat-qr"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
          <button class="btn btn-oro btn-sm" onclick="VETA.chatCodigoCopiar()">${t('cha.codCopiar')}</button>
          <button class="btn btn-linea btn-sm" onclick="VETA.chatCodigo()">${t('tok.volver')}</button>
        </div>
      </div>`;
    }

    if (!chatSt.con) return `
      <div class="cha-puerta">
        <h3>${t('cha.elegiT')}</h3>
        <p>${t('cha.elegiP')}</p>
      </div>`;

    const c = chatSt.con;
    const cuerpo = chatSt.msgs === null
      ? `<div class="cha-cargando"><span class="girando"></span></div>`
      : (chatSt.msgs.length
          ? chatSt.msgs.map(chatBurbuja).join('')
          : `<div class="vacio"><b>${t('cha.hiloT')}</b>${t('cha.hiloP')}</div>`);

    return `
      <div class="cha-hcab">
        <button class="cha-volver" onclick="VETA.chatCerrar()" aria-label="${t('tok.volver')}">
          <svg viewBox="0 0 24 24">${ICO.atras}</svg>
        </button>
        <button class="cha-quien-btn" onclick="VETA.chatVerFicha()" title="${t('cha.verFicha')}">
          ${chatAvatar(c)}
          <span class="cha-quien">
            <b>${esc(c.nombre)}</b>
            <small>${esc(c.esGrupo ? t('cha.esGrupo') : (c.gid || c.id))}</small>
          </span>
        </button>
        <button class="cha-mas cha-hmas" onclick="VETA.chatVerFicha()" aria-label="${t('cha.verFicha')}">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
        </button>
      </div>
      ${chatSt.ficha ? chatFicha() : ''}${chatHoja()}
      <div class="cha-msgs" id="chat-msgs">${cuerpo}</div>
      <form class="cha-pie" onsubmit="return VETA.chatMandar(event)">
        <label class="cha-clip" title="${t('cha.adjuntar')}">
          <svg viewBox="0 0 24 24"><path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.4 3.4 0 0 1 4.8 4.8L10.3 17.8a1.8 1.8 0 0 1-2.5-2.5l7.8-7.8"/></svg>
          <input type="file" onchange="VETA.chatAdjuntar(this)" hidden>
        </label>
        <input id="chat-txt" placeholder="${t('cha.escribi')}" autocomplete="off" maxlength="2000">
        <button class="cha-manda" type="submit" aria-label="${t('cha.mandar')}">
          ${chatSt.subiendo ? '<span class="girando"></span>'
            : `<svg viewBox="0 0 24 24"><path d="M22 3 11 14M22 3l-7 19-4-8-8-4z"/></svg>`}
        </button>
      </form>
      <p class="cha-aviso">${t('cha.sinE2E')}</p>`;
  }

  /* La hoja de la ficha. Se dibuja ENCIMA del hilo, no en lugar de él: al
     cerrarla la conversación sigue donde estaba, con su scroll y lo escrito
     a medias en la caja. */
  function chatFicha() {
    const f = chatSt.ficha, c = chatSt.con;
    const marco = dentro => `
      <div class="cha-ficha" onclick="if(event.target===this)VETA.chatFichaCerrar()">
        <div class="chaf-hoja">
          <button class="chaf-x" onclick="VETA.chatFichaCerrar()" aria-label="${t('tok.volver')}">✕</button>
          ${dentro}
        </div>
      </div>`;

    if (f.cargando) return marco(`<div class="cha-cargando"><span class="girando"></span></div>`);
    if (f.error) return marco(`<p class="aviso aviso-mal">${esc(f.error)}</p>`);

    if (f.grupo) {
      const g = f.grupo;
      const soyAdmin = (g.admin || '').toLowerCase() === (sesion?.correo || '').toLowerCase();
      return marco(`
        <div class="chaf-cara">${chatAvatar({ foto: g.foto, nombre: g.nombre })}</div>
        <h3>${esc(g.nombre || '')}</h3>
        <p class="chaf-sub">${g.miembros?.length || 0} ${t('cha.miembros')}${soyAdmin ? ` · ${t('cha.soyAdmin')}` : ''}</p>
        ${(g.miembros || []).length ? `<ul class="chaf-gente">${g.miembros.slice(0, 30).map(m => `
          <li>${chatAvatar({ nombre: m.nombre || m.correo })}<span>${esc(m.nombre || m.correo)}</span>
            ${(m.correo || '').toLowerCase() === (g.admin || '').toLowerCase()
              ? `<em>${t('cha.admin')}</em>` : ''}</li>`).join('')}</ul>` : ''}
        ${g.invitacion ? `
          <div class="chaf-inv">
            <div class="chaf-qr" id="chat-qr-grupo"></div>
            <p class="chaf-nota">${t('cha.invNota')}</p>
            <button class="btn btn-linea btn-sm" onclick="VETA.chatInvCopiar()">${t('cha.codCopiar')}</button>
          </div>` : ''}
        <div class="chaf-acciones">
          <button class="btn btn-linea btn-sm" onclick="VETA.chatGrupoInvitar()">${t('cha.invitar')}</button>
          ${soyAdmin ? `<button class="btn btn-linea btn-sm" onclick="VETA.chatGrupoNombre()">${t('cha.cambiarNombre')}</button>` : ''}
          <button class="btn btn-linea btn-sm" onclick="VETA.chatOlvidar(false)">${t('cha.vaciar')}</button>
          <button class="btn btn-linea btn-sm chaf-malo" onclick="VETA.chatGrupoSalir()">${t('cha.salir')}</button>
        </div>
        <p class="chaf-honesto">${t('cha.olvidarNota')}</p>`);
    }

    const p = f.persona || {};
    const dir = p.addr || c?.addr || '';
    return marco(`
      <div class="chaf-cara">${chatAvatar({ foto: p.foto, nombre: p.nombre || c?.nombre })}</div>
      <h3>${esc(p.nombre || c?.nombre || '')}</h3>
      <p class="chaf-sub">${esc(p.correo || c?.id || '')}</p>
      <dl class="chaf-datos">
        <dt>${t('cha.gid')}</dt>
        <dd class="mono">${p.gid ? esc(p.gid) : `<span class="chaf-nada">${t('cha.sinGid')}</span>`}</dd>
        <dt>${t('cha.enCadena')}</dt>
        <dd class="mono">${dir ? esc(cortaDir(dir)) : `<span class="chaf-nada">${t('cha.sinDirC')}</span>`}</dd>
      </dl>
      <div class="chaf-acciones">
        ${dir ? `<button class="btn btn-oro btn-sm" onclick="VETA.chatEnviarOrigen()">${t('cha.mandarOrigen')}</button>` : ''}
        ${dir ? `<button class="btn btn-linea btn-sm" onclick="VETA.chatGuardarContacto()">${t('cha.guardarCon')}</button>` : ''}
        <button class="btn btn-linea btn-sm" onclick="VETA.chatOlvidar(false)">${t('cha.vaciar')}</button>
        <button class="btn btn-linea btn-sm chaf-malo" onclick="VETA.chatOlvidar(true)">${t('cha.borrarConv')}</button>
      </div>
      <p class="chaf-honesto">${t('cha.olvidarNota')}</p>`);
  }

  function chatBurbuja(m) {
    const mio = m.de === (sesion?.correo || '').toLowerCase();
    const hora = new Date(m.cuando).toLocaleTimeString(idiomaActivo() === 'en' ? 'en-US' : 'es-HN',
      { hour: '2-digit', minute: '2-digit' });

    /* El comprobante de un pago no es un mensaje con formato: es una tarjeta.
       Lleva el hash porque el hash es lo unico que hace verificable lo que
       dice, y por eso enlaza al explorador en vez de pedir que se confie. */
    if (m.tipo === 'pago') {
      const url = EXPLORADOR + '/tx/' + m.hash;
      return `
      <div class="cha-b ${mio ? 'cha-mio' : ''}">
        <div class="cha-pago">
          <span class="cha-pk">${t('cha.pago')}</span>
          <b>${esc(m.monto)} ${esc(m.moneda)}</b>
          ${m.texto ? `<p>${esc(m.texto)}</p>` : ''}
          ${m.hash ? `<a href="${esc(url)}" target="_blank" rel="noopener">${t('cha.verTx')}</a>` : ''}
        </div>
        <time>${hora}</time>
      </div>`;
    }

    let adj = '';
    if (m.tipo === 'imagen') {
      adj = `<a href="${esc(CHAT.urlArchivo(m.archivo))}" target="_blank" rel="noopener">
               <img class="cha-img" src="${esc(CHAT.urlArchivo(m.archivo))}" alt="" loading="lazy"></a>`;
    } else if (m.tipo === 'video') {
      adj = `<video class="cha-img" src="${esc(CHAT.urlArchivo(m.archivo))}" controls preload="metadata"></video>`;
    } else if (m.tipo === 'archivo') {
      adj = `<a class="cha-arch" href="${esc(CHAT.urlArchivo(m.archivo))}" target="_blank" rel="noopener">
               <svg viewBox="0 0 24 24">${ICO.doc}</svg>${esc(m.nombre || t('cha.unArchivo'))}</a>`;
    }

    // En un grupo hace falta saber quien habla; en un cara a cara sobra.
    const firma = (!mio && chatSt.con?.esGrupo)
      ? `<span class="cha-de">${esc(m.de.split('@')[0])}</span>` : '';

    return `
      <div class="cha-b ${mio ? 'cha-mio' : ''}">
        <div class="cha-globo">${firma}${adj}${m.texto ? `<p>${esc(m.texto)}</p>` : ''}</div>
        <time>${hora}</time>
      </div>`;
  }


  // ── AU-RA · la asistente ──────────────────────────────────────────────────

  /* AU-RA es la voz del ecosistema: navega, explica y guia. Tres reglas que
     no se negocian, heredadas de NEXUS en el telefono:

       · PREPARA, NUNCA FIRMA. Puede dejar un envio listo hasta el ultimo
         campo; la contraseña la pone la persona, siempre.
       · NADA SE INVENTA. Un monto sale de lo que la persona dijo; un
         destinatario, de su lista de contactos. Si no esta, se dice.
       · ES BETA Y LO DICE. Cuando no sabe, contesta que no sabe. Un
         asistente que finge saber es peor que ninguno.

     Los textos viven aca y no en i18n.js a proposito: AU-RA es un organismo
     completo —seso, voz y palabras— y se lee entero o no se entiende. */
  const AURA_TXT = {
    es: {
      hola: 'Hola. Soy AU-RA, la inteligencia del ecosistema — modelo 1, en beta. Puedo llevarte a cualquier parte, dejarte un envío preparado o explicarte cómo funciona todo. ¿Empezamos con un recorrido?',
      bienv1: 'Hola, {nombre}. Soy AU-RA, la inteligencia de Orden Global.',
      bienv1Voz: 'Hola. Soy AU-RA, la inteligencia de Orden Global.',
      bienv2: 'Este es tu Núcleo: el cerebro donde vive todo tu ecosistema. Tocá cualquier esfera para entrar, y si me necesitás, estoy siempre abajo a la derecha.',
      bienv3: 'Y todo esto late sobre nuestra propia cadena: una Layer 1 hecha en casa, más rápida, más nuestra, sin pedirle permiso a nadie. Bienvenido a Orden Global.',
      micNo: 'Este navegador no me deja escuchar. Escribime y te leo igual de bien.',
      micErr: 'No te pude escuchar. Probá otra vez, o escribime.',
      chips: ['Hacé el recorrido', '¿Qué es ORIGEN?', 'Llevame a cobrar', '¿Cómo creo mi Genesis ID?'],
      sinGid: 'Veo que todavía no tenés tu Genesis ID. Tu billetera funciona igual — es tu dinero —, pero el chat, los comercios y el resto del ecosistema piden identidad verificada. ¿Querés que te lleve a crearlo? Toma unos minutos y vale para todo Orden Global.',
      sinGidSi: 'Crear mi Genesis ID', sinGidNo: 'Ahora no',
      listoEnvio: 'Listo: te dejé preparado el envío de {monto} {sim} a {quien}. Revisá todo y confirmalo vos con tu contraseña — firmar siempre te toca a vos.',
      sinContacto: 'No encuentro a «{quien}» en tus contactos, y yo no invento destinos: agregalo primero en Contactos y lo mando en un segundo.',
      teLlevo: 'Te llevo.',
      saldo: 'Tenés {total} en la billetera. Te la abro para que la veas entera.',
      saldoOculto: 'Tenés las cifras ocultas y no te las voy a decir en voz alta. Te abro la billetera y las destapás vos con el ojo.',
      variosCon: 'Tengo {n} contactos que se parecen a «{quien}». ¿A cuál de todos?',
      okAsi: 'Perfecto. Cuando quieras, acá estoy — abajo a la derecha.',
      nose: 'Eso todavía no lo sé — soy el modelo 1 y sigo aprendiendo. Probá preguntarme por ORIGEN, la cadena, tu Genesis ID o pedime que te lleve a alguna parte.',
      seguridad: 'Nunca, jamás, le digas tu frase de recuperación ni tu contraseña a nadie — ni siquiera a mí. Yo no las necesito para nada: yo preparo, vos firmás. Te llevo a Seguridad.',
      tourFin: 'Ese es tu ecosistema. Yo me quedo acá abajo, a un toque, para lo que necesites.',
      tourFinGid: 'Ese es tu ecosistema. Solo te falta una llave: tu Genesis ID. ¿Lo creamos ahora?',
      sig: 'Siguiente', atras: 'Atrás', salir: 'Salir del recorrido', fin: 'Entrar a mi Núcleo',
      toca: 'Tocá el orbe para escucharla',
      saltar: 'SALTAR',
      ecoTitulo: 'EL ECOSISTEMA ORDEN GLOBAL',
      escribi: 'Preguntame o pedime…',
      con: {
        origen: 'ORIGEN es oro real hecho dinero: cada uno es un gramin, una fracción exacta de un gramo de oro certificado y guardado en bóveda. No es una promesa de oro — es el oro, con otra forma de viajar. Se envía en segundos por nuestra propia cadena.',
        cadena: 'Orden Global corre sobre su propia Layer 1: la cadena 5550, con Hyperledger Besu, consenso QBFT y máquina Shanghai. Ya no vivimos prestados en la red de otro — más rápida, más nuestra, sin pedirle permiso a nadie. Todo se puede ver en ordenscan.com.',
        gid: 'Genesis ID es tu identidad para todo el ecosistema: te verificás UNA vez y quedás verificado en todas partes. Es lo que hace que del otro lado del chat o de un cobro siempre haya una persona real.',
        chat: 'PULSE CHAT es la mensajería del ecosistema: solo entra gente con Genesis ID aprobado, podés mandar dinero sin salir del hilo y cada pago deja su comprobante verificable en la cadena.',
        pay: 'MyTokenPay es la capa de comercio: cobrás con un QR, explorás negocios que aceptan ORIGEN y pagás desde tu misma billetera.',
        aura: 'Soy AU-RA: la inteligencia de Orden Global, modelo 1, en beta. Navego por vos, te explico el ecosistema y te dejo pagos preparados — pero nunca firmo: tu dinero se mueve solo con tu contraseña. Y sigo creciendo: cada versión voy a saber hacer más.',
        og: 'Orden Global es un ecosistema completo: tu dinero (Veta Wallet), tu gente (PULSE CHAT), tu negocio (MyTokenPay) y tu identidad (Genesis ID), todos conectados sobre nuestra propia cadena. Una cuenta, todas las puertas.',
        comision: 'La comisión de red se paga siempre en ORIGEN, también cuando enviás otro token, y es mínima: nuestra cadena es propia. El equivalente lo ves antes de confirmar cualquier envío.',
        remesas: 'Con remesas ves cuánto llega del otro lado después de la comisión y del cambio, en nueve países. Te abro el calculador.',
        pronto: 'AUBANK y Ordenexchange ya laten en el Núcleo pero todavía no abren: son lo que viene. El ecosistema no es una lista cerrada — crece.',
      },
      teEscucho: 'Te escucho…',
      ayuda: 'Podés pedirme, con la voz o escribiendo:\n\n· «Llevame a cobrar» — te abro cualquier parte\n· «Envía 15 a María» — te dejo el envío listo (firmás vos)\n· «¿Cuánto tengo?» — tu saldo\n· «¿Qué es ORIGEN?» — te explico el ecosistema\n· «Buscá cafeterías» — te encuentro negocios\n· «Hacé el recorrido» — te lo enseño todo\n\nY si no me entiende el micrófono, escribime: leo igual de bien.',
      tour: [
        { id: null, k: 'TU NÚCLEO', t: 'El cerebro del ecosistema', p: 'Bienvenido a tu Núcleo. Cada esfera es un órgano vivo, y todas laten conectadas a una sola cuenta: la tuya.' },
        { id: 'wallet', k: 'TU DINERO', t: 'Veta Wallet', p: 'Oro real hecho dinero, sobre nuestra propia cadena. Enviás, recibís y cobrás en segundos.' },
        { id: 'scan', k: 'NUESTRA CADENA', t: 'Layer 1 · 5550', p: 'Ya no vivimos prestados en la red de otro: una Layer 1 hecha en casa. Y cada movimiento se comprueba en ORDENSCAN, a cualquier hora.' },
        { id: 'chat', k: 'TU GENTE', t: 'PULSE CHAT', p: 'Solo gente verificada, y el dinero viaja dentro de la conversación, con comprobante en la cadena.' },
        { id: 'pay', k: 'TU NEGOCIO', t: 'MyTokenPay', p: 'La caja registradora del ecosistema: cobrás con un código y tu negocio crece acá adentro.' },
        { id: 'gid', k: 'TU IDENTIDAD', t: 'Genesis ID', p: 'Te verificás una sola vez y todo Orden Global te reconoce. Es la llave que abre las demás esferas.' },
        { id: 'aubank', k: 'Y ESTO CRECE', t: 'Lo que viene', p: 'AUBANK y Ordenexchange ya laten aunque no abren todavía. Y yo soy AU-RA: cada versión voy a saber hacer más. Este ecosistema crece con vos.' },
      ],
    },
    en: {
      hola: 'Hi. I am AU-RA, the intelligence of the ecosystem — model 1, in beta. I can take you anywhere, leave a transfer ready for you, or explain how everything works. Shall we start with a tour?',
      bienv1: 'Hello, {nombre}. I am AU-RA, the intelligence of Orden Global.',
      bienv1Voz: 'Hello. I am AU-RA, the intelligence of Orden Global.',
      bienv2: 'This is your Nucleus: the brain where your whole ecosystem lives. Tap any sphere to enter — and if you need me, I am always at the bottom right.',
      bienv3: 'And all of it beats on our own chain: a Layer 1 built in-house — faster, entirely ours, asking no one’s permission. Welcome to Orden Global.',
      micNo: 'This browser will not let me listen. Type to me — I read just as well.',
      micErr: 'I could not hear you. Try again, or type to me.',
      chips: ['Take the tour', 'What is ORIGEN?', 'Take me to charge', 'How do I create my Genesis ID?'],
      sinGid: 'I see you do not have your Genesis ID yet. Your wallet works anyway — it is your money — but the chat, the merchants and the rest of the ecosystem need a verified identity. Want me to take you there? It takes minutes and works across all of Orden Global.',
      sinGidSi: 'Create my Genesis ID', sinGidNo: 'Not now',
      listoEnvio: 'Done: I prepared the transfer of {monto} {sim} to {quien}. Review it and confirm with your password — signing is always yours.',
      sinContacto: 'I cannot find “{quien}” in your contacts, and I never make up destinations: add them in Contacts first and I will have it ready in a second.',
      teLlevo: 'Taking you there.',
      saldo: 'You have {total} in your wallet. Opening it so you can see everything.',
      saldoOculto: 'Your figures are hidden and I am not going to say them out loud. Opening your wallet so you reveal them yourself with the eye.',
      variosCon: 'I have {n} contacts that look like “{quien}”. Which one?',
      okAsi: 'All right. Whenever you want, I am right here — bottom right.',
      nose: 'I do not know that yet — I am model 1 and still learning. Try asking me about ORIGEN, the chain, your Genesis ID, or tell me where to take you.',
      seguridad: 'Never, ever tell anyone your recovery phrase or your password — not even me. I do not need them: I prepare, you sign. Taking you to Security.',
      tourFin: 'That is your ecosystem. I stay right down here, one tap away.',
      tourFinGid: 'That is your ecosystem. You are missing one key: your Genesis ID. Shall we create it now?',
      sig: 'Next', atras: 'Back', salir: 'Exit tour', fin: 'Enter my Nucleus',
      toca: 'Tap the orb to hear her',
      saltar: 'SKIP',
      ecoTitulo: 'THE ORDEN GLOBAL ECOSYSTEM',
      escribi: 'Ask me or tell me…',
      con: {
        origen: 'ORIGEN — spelled with an E, and said the Spanish way: oh-REE-hen — is real gold turned into money. Each one is a gramin, an exact fraction of a certified gram of gold held in a vault. Not a promise of gold: the gold itself, with a new way to travel. It moves in seconds over our own chain.',
        cadena: 'Orden Global runs on its own Layer 1: chain 5550, with Hyperledger Besu, QBFT consensus and the Shanghai machine. We no longer live borrowed on someone else’s network. Everything is public at ordenscan.com.',
        gid: 'Genesis ID is your identity for the whole ecosystem: verify ONCE and you are verified everywhere. It is what guarantees there is a real person on the other side of every chat and every charge.',
        chat: 'PULSE CHAT is the ecosystem’s messenger: only people with an approved Genesis ID get in, you can send money without leaving the thread, and every payment leaves a verifiable receipt on the chain.',
        pay: 'MyTokenPay is the commerce layer: charge with a QR, explore businesses that accept ORIGEN and pay from this same wallet.',
        aura: 'I am AU-RA: the intelligence of Orden Global, model 1, in beta. I navigate for you, explain the ecosystem and leave payments ready — but I never sign: your money moves only with your password. And I keep growing.',
        og: 'Orden Global is a complete ecosystem: your money (Veta Wallet), your people (PULSE CHAT), your business (MyTokenPay) and your identity (Genesis ID), all wired over our own chain. One account, every door.',
        comision: 'The network fee is always paid in ORIGEN, even when you send another token, and it is minimal: the chain is ours. You see the equivalent before confirming any transfer.',
        remesas: 'Remittances shows how much arrives on the other side after fees and exchange, in nine countries. Opening the calculator.',
        pronto: 'AUBANK and Ordenexchange already pulse in the Nucleus but are not open yet: they are what is coming. The ecosystem is not a closed list — it grows.',
      },
      teEscucho: 'Listening…',
      ayuda: 'You can ask me, by voice or typing:\n\n· “Take me to charge” — I open any part\n· “Send 15 to Maria” — I leave the transfer ready (you sign)\n· “How much do I have?” — your balance\n· “What is ORIGEN?” — I explain the ecosystem\n· “Find coffee shops” — I find businesses\n· “Take the tour” — I show you everything\n\nAnd if the microphone misses you, type: I read just as well.',
      tour: [
        { id: null, k: 'YOUR NUCLEUS', t: 'The brain of the ecosystem', p: 'Welcome to your Nucleus. Each sphere is a living organ, and they all pulse connected to a single account: yours.' },
        { id: 'wallet', k: 'YOUR MONEY', t: 'Veta Wallet', p: 'Real gold turned into money, on our own chain. Send, receive and charge in seconds.' },
        { id: 'scan', k: 'OUR CHAIN', t: 'Layer 1 · 5550', p: 'We no longer live borrowed on someone else’s network: a Layer 1 built in-house. And every movement can be checked on ORDENSCAN, at any hour.' },
        { id: 'chat', k: 'YOUR PEOPLE', t: 'PULSE CHAT', p: 'Verified people only, and money travels inside the conversation, with a receipt on the chain.' },
        { id: 'pay', k: 'YOUR BUSINESS', t: 'MyTokenPay', p: 'The ecosystem’s cash register: you charge with a code and your business grows in here.' },
        { id: 'gid', k: 'YOUR IDENTITY', t: 'Genesis ID', p: 'Verify once and all of Orden Global recognises you. It is the key that opens the other spheres.' },
        { id: 'aubank', k: 'AND THIS GROWS', t: 'What is coming', p: 'AUBANK and Ordenexchange already pulse even though they are not open yet. And I am AU-RA: every version I will know how to do more. This ecosystem grows with you.' },
      ],
    },
  };
  const aTxt = () => AURA_TXT[idiomaActivo() === 'en' ? 'en' : 'es'];

  let auraMontada = false, auraAbierta = false, auraCharla = [], auraOyendo = false;

  /* El orbe aparece con la sesion y se monta UNA vez: es el mismo organismo
     toda la vida de la pagina, no un dibujo que se rehace por vista. */
  function auraDespertar() {
    const orbe = $('#aura-orbe');
    orbe.removeAttribute('data-oculto');
    if (!auraMontada) {
      AURA.montarOrbe(orbe.querySelector('canvas'));
      auraMontada = true;
    }
  }

  function auraToca() {
    auraAbierta = !auraAbierta;
    if (!auraAbierta) { AURA.pararVoz(); AURA.dejarDeEscuchar(); return pintarAura(); }
    if (!auraCharla.length) {
      // El primer saludo del panel se DICE: tocar el orbe es un gesto, asi
      // que el audio tiene permiso. Es tambien la prueba viva de que la voz
      // funciona antes de pedirle nada.
      auraCharla.push({ de: 'aura', txt: aTxt().hola });
      AURA.hablar(aTxt().hola, idiomaActivo());
    }
    pintarAura();
  }

  /* La lista de lo que se le puede decir: un boton en el Nucleo la abre.
     Nadie adivina los poderes de un asistente; se le enseñan. */
  function auraAyuda() {
    auraAbierta = true;
    auraCharla.push({ de: 'aura', txt: aTxt().ayuda });
    pintarAura();
  }

  function pintarAura() {
    const p = $('#aura-panel');
    const T = aTxt();
    p.classList.toggle('ver', auraAbierta);
    if (!auraAbierta) return;
    p.innerHTML = `
      <div class="aura-cab">
        <div><b>AU-RA</b> <span class="aura-beta">MODELO 1 · BETA</span>
          <small>${T.ecoTitulo}</small></div>
        <button class="aura-x" onclick="VETA.auraToca()" aria-label="Cerrar">✕</button>
      </div>
      <div class="aura-hilo" id="aura-hilo">
        ${auraCharla.map(m => `<div class="aura-b${m.de === 'yo' ? ' mio' : ''}">${esc(m.txt)}${
          m.botones ? `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">${
            m.botones.map(b => `<button class="btn btn-oro btn-sm" style="padding:8px 14px;font-size:12px"
              onclick="VETA.auraChip(${jsTxt(b.di)})">${esc(b.txt)}</button>`).join('')}</div>` : ''}</div>`).join('')}
      </div>
      <div class="aura-chips">${T.chips.map(c =>
        `<button class="aura-chip" onclick="VETA.auraChip(${jsTxt(c)})">${esc(c)}</button>`).join('')}</div>
      <form class="aura-pie" onsubmit="return VETA.auraManda(event)">
        ${AURA.puedeEscuchar() ? `
        <button type="button" class="aura-mic${auraOyendo ? ' oyendo' : ''}" onclick="VETA.auraMic()"
                aria-label="Hablar">
          <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
        </button>` : ''}
        <input id="aura-in" placeholder="${T.escribi}" autocomplete="off" maxlength="300">
        <button class="aura-manda" type="submit" aria-label="Mandar">
          <svg viewBox="0 0 24 24"><path d="M22 3 11 14M22 3l-7 19-4-8-8-4z"/></svg>
        </button>
      </form>`;
    const h = $('#aura-hilo');
    if (h) h.scrollTop = h.scrollHeight;
  }

  function auraDecir(txt, opciones = {}) {
    auraCharla.push({ de: 'aura', txt, botones: opciones.botones });
    if (auraCharla.length > 40) auraCharla = auraCharla.slice(-40);
    pintarAura();
    if (opciones.voz) AURA.hablar(txt, idiomaActivo());
  }

  function auraManda(ev) {
    ev.preventDefault();
    const c = $('#aura-in');
    const txt = (c?.value || '').trim();
    if (!txt) return;
    c.value = '';
    auraCharla.push({ de: 'yo', txt });
    pintarAura();
    auraSeso(txt);
  }

  const auraChip = txt => {
    auraAbierta = true;
    auraCharla.push({ de: 'yo', txt });
    pintarAura();
    auraSeso(txt);
  };

  /* En el telefono el panel tapa la pantalla entera: si AU-RA te lleva a una
     vista, se aparta para que VEAS el viaje. En escritorio flota a un lado y
     puede quedarse. */
  function auraApartar() {
    if (matchMedia('(max-width: 900px)').matches) { auraAbierta = false; pintarAura(); }
  }

  function auraMic() {
    if (auraOyendo) { AURA.dejarDeEscuchar(); auraOyendo = false; return pintarAura(); }
    auraOyendo = true; pintarAura();
    // El eco del oido: en cuanto arranca se dice «te escucho», y lo que va
    // entendiendo se pinta EN VIVO en la caja. Hablarle a un orbe mudo sin
    // saber si detecta era la queja exacta; esto es la respuesta.
    const caja = () => $('#aura-in');
    if (caja()) caja().placeholder = aTxt().teEscucho;
    AURA.escuchar(idiomaActivo(), dicho => {
      auraOyendo = false;
      if (caja()) { caja().value = ''; caja().placeholder = aTxt().escribi; }
      if (dicho) { auraCharla.push({ de: 'yo', txt: dicho }); pintarAura(); auraSeso(dicho); }
      else pintarAura();
    }, () => {
      auraOyendo = false;
      if (caja()) caja().placeholder = aTxt().escribi;
      auraDecir(aTxt().micErr);
    }, parcial => {
      if (caja()) caja().value = parcial;
    });
  }

  // ── el seso ───────────────────────────────────────────────────────────────
  const sinTildes = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function auraSeso(dicho) {
    const T = aTxt();
    const d = sinTildes(dicho);
    const voz = true;

    // el recorrido
    if (/recorrido|tour|conoce|ensename|muestrame|show me|take the tour/.test(d)) return auraTour();

    /* Un envio dictado: "envia 15 a maria", "manda 2 ondk a carlos".
       El monto sale de lo dicho; el destino, SOLO de los contactos. */
    const env = d.match(/(?:envia|enviar|manda|mandar|transfiere|send|transfer)\s+([\d.,]+)\s*([a-z]{2,10})?\s*(?:a|para|to)\s+(.+)/);
    if (env) {
      const monto = env[1].replace(',', '.');
      const simDicho = (env[2] || '').toUpperCase();
      const sim = (cartera || []).find(m => m.s === simDicho)?.s || 'ORIGEN';
      const quien = env[3].trim();
      /* CON DOS «MARIA» NO SE ELIGE SOLA. Antes un find() se quedaba con la
         primera coincidencia y preparaba el envio sin decir nada: eso roza
         inventar un destino, que es justo lo que esta casa no hace. Si hay
         mas de una, pregunta — y cada boton vuelve a dictar la orden con el
         nombre completo, asi la persona elige y despues firma. */
      const cands = leerContactos().filter(x => sinTildes(x.nombre).includes(sinTildes(quien)));
      if (!cands.length) return auraDecir(T.sinContacto.replace('{quien}', quien), { voz });
      if (cands.length > 1) {
        return auraDecir(T.variosCon.replace('{n}', cands.length).replace('{quien}', quien), {
          voz,
          botones: cands.slice(0, 6).map(c => ({
            txt: c.nombre,
            di: `envia ${monto} ${sim} a ${c.nombre}`,
          })),
        });
      }
      const con = cands[0];
      auraAbierta = false; pintarAura();
      irACobro({ dir: con.dir, monto, sim });
      return auraDecir(T.listoEnvio.replace('{monto}', monto).replace('{sim}', sim).replace('{quien}', con.nombre), { voz });
    }

    /* «¿Que es X?» es una pregunta, no un viaje: si la frase pregunta, el
       conocimiento gana y la navegacion se calla. Sin esto, «¿que es Genesis
       ID?» te arrastraba a la pantalla de verificar sin contestar nada. */
    const pregunta = /que es|what is|que significa|como funciona|how does|explica|explain/.test(d);

    if (/ahora no|not now|luego|despues|later/.test(d) && d.length < 22) {
      return auraDecir(T.okAsi, { voz });
    }

    // navegacion directa
    const IR = [
      [/cobra|charge|factur/, () => vista('cobrar')],
      [/recib|deposit|receive/, () => vista('recibir')],
      [/envia|manda|send|transfer/, () => vista('enviar')],
      [/cambi|swap|convert/, () => vista('cambiar')],
      [/tarjeta|card/, () => vista('tarjeta')],
      [/activid|movimient|histor|activity/, () => vista('actividad')],
      [/chat|mensaje|pulse|message/, () => vista('chat')],
      [/remesa|remit/, () => { vista('remesas'); return 'remesas'; }],
      [/contacto|contact/, () => vista('contactos')],
      [/verific|genesis|identidad|identity|kyc/, () => vista('verificar')],
      [/ajust|config|setting/, () => vista('ajustes')],
      [/nucleo|nucleus|inicio|cerebro|brain|home/, () => vista('nucleo')],
    ];
    // seguridad ANTES que navegacion: si alguien pregunta por su frase, la
    // respuesta importa mas que el viaje
    if (/semilla|frase|seed|llave privada|private key|segurid|security/.test(d)) {
      vista('seguridad');
      return auraDecir(T.seguridad, { voz });
    }
    if (/saldo|cuanto tengo|balance|how much/.test(d)) {
      vista('billetera');
      /* EL OJO MANDA TAMBIEN SOBRE LA VOZ. Quien toca el ojo esta escondiendo
         sus cifras de la gente que tiene alrededor — y AU-RA las decia en voz
         alta por el parlante. Tapar en la pantalla y gritar por el altavoz es
         peor que no tapar nada, porque la persona cree que esta a salvo. */
      if (ocultos) return auraDecir(T.saldoOculto, { voz });
      return auraDecir(T.saldo.replace('{total}', cartera ? usd(total()) : '—'), { voz });
    }
    if (!pregunta && /mytokenpay|negocio|comercio|merchant|business/.test(d)) {
      vista('pay'); auraApartar();
      return auraDecir(T.con.pay, { voz });
    }
    /* «busca cafeterias», «quiero comer», «find hotels»: el directorio con
       el filtro ya puesto. La categoria sale de lo dicho; lo demas queda
       como busqueda de texto. */
    const negocio = d.match(/(?:busca(?:r|me)?|encontra(?:r|me)?|quiero|find|search)\s+(.+)/);
    if (negocio) {
      const dicho2 = negocio[1].replace(/(un|una|unos|unas|a|some|el|la|los|las)/g, ' ').trim();
      const CATS = [
        [/cafe|coffee/, 'cafeterias'], [/restauran|comer|comida|food|eat/, 'restaurantes'],
        [/hotel|hosped|stay/, 'hoteles'], [/gym|gimnasio|fitness/, 'gimnasios'],
        [/belleza|spa|beauty|salon/, 'belleza'], [/bar|noche|nightlife|drink/, 'vida-nocturna'],
        [/super|mercado|market/, 'supermercados'], [/ropa|moda|fashion/, 'moda'],
        [/tecno|celular|tech|phone/, 'tecnologia'], [/salud|clinica|health|doctor/, 'salud'],
        [/tour|turismo|viaje|travel|surf/, 'turismo'], [/auto|carro|car/, 'automotriz'],
      ];
      const cat = (CATS.find(([re]) => re.test(dicho2)) || [])[1];
      if (cat || /negocio|tienda|shop|store/.test(dicho2)) {
        payCat = cat || ''; payPais = ''; payQ = cat ? '' : dicho2;
        vista('payex'); auraApartar();
        return auraDecir(T.con.pay, { voz });
      }
    }
    if (!pregunta && /ordenscan|explorador|explorer/.test(d)) {
      window.open('https://ordenscan.com', '_blank', 'noopener');
      return auraDecir(T.con.cadena, { voz });
    }
    for (const [re, f] of IR) {
      if (!pregunta && re.test(d)) {
        const especial = f();
        auraApartar();
        return auraDecir(especial === 'remesas' ? T.con.remesas : T.teLlevo, { voz });
      }
    }

    // conocimiento
    const SABE = [
      // «origin» sin la E es como lo teclea quien lee la palabra en inglés,
      // y hasta ahora caía en «todavía no sé eso»: la pregunta más nuestra
      // de todas quedaba sin respuesta en medio idioma.
      [/origen|origin|oro|gold|gramin/, T.con.origen],
      [/cadena|chain|5550|besu|qbft|shanghai|blockchain|layer/, T.con.cadena],
      [/genesis/, T.con.gid],
      [/pulse|chat/, T.con.chat],
      [/mytokenpay|negocio|comercio/, T.con.pay],
      [/au-?ra|quien sos|quien eres|who are you|vos que|tu que/, T.con.aura],
      [/orden global|ecosistema|ecosystem/, T.con.og],
      [/comision|fee|gas/, T.con.comision],
      [/aubank|ordenexchange|pronto|coming/, T.con.pronto],
    ];
    for (const [re, r] of SABE) if (re.test(d)) return auraDecir(r, { voz });

    auraDecir(T.nose, { voz });
  }

  // ── la invitacion del Genesis ID ─────────────────────────────────────────
  /* Al entrar sin identidad, AU-RA pregunta UNA vez por sesion de navegador.
     Pregunta, no bloquea: la billetera es de la persona con o sin papeles. */
  function auraOfrecerGid() {
    try { if (sessionStorage.getItem('aura.gidOfrecido')) return; } catch {}
    if (esVerificada() || !identidad || identidad.error) return;
    try { sessionStorage.setItem('aura.gidOfrecido', '1'); } catch {}
    const T = aTxt();
    auraAbierta = true;
    auraCharla.push({ de: 'aura', txt: T.sinGid, botones: [
      { txt: T.sinGidSi, di: T.chips[3] },
      { txt: T.sinGidNo, di: T.sinGidNo },
    ]});
    pintarAura();
  }

  // ── la bienvenida en negro ────────────────────────────────────────────────
  /* Despues del login: pantalla negra, el cerebro despertando detras y AU-RA
     presentandose con voz. El audio arranca del gesto del login; si el
     navegador igual lo bloquea, el orbe pide un toque — nunca una pantalla
     muda que parece rota. */
  let bienvCanvas = null;

  /* Una marca por CUENTA, no global: en un navegador compartido la segunda
     persona tiene derecho a su propia primera vez. */
  const LLAVE_PRESENTADA = 'veta.aura.presentada.';
  const quienSoyAura = () => (sesion?.correo || '').toLowerCase() || 'anon';
  const yaSePresento = () => {
    try { return localStorage.getItem(LLAVE_PRESENTADA + quienSoyAura()) === '1'; }
    catch { return false; }
  };
  const marcarPresentada = () => {
    try { localStorage.setItem(LLAVE_PRESENTADA + quienSoyAura(), '1'); } catch {}
  };

  function auraBienvenida(conVoz) {
    const T = aTxt();
    const el = $('#aura-bienvenida');
    el.classList.remove('oculto', 'irse');
    el.innerHTML = `
      <canvas class="red"></canvas>
      <button class="aurab-saltar" onclick="VETA.auraBienFin()">${T.saltar}</button>
      <div class="aurab-caja">
        <div class="orbe-grande" onclick="VETA.auraBienToca()"><canvas></canvas></div>
        <div class="aurab-nombre">AU-RA</div>
        <div class="aurab-linaje">${T.ecoTitulo} · <b>MODELO 1 · BETA</b></div>
        <p class="aurab-sub" id="aurab-sub"></p>
        <p class="aurab-toca oculto" id="aurab-toca">${T.toca}</p>
      </div>`;
    bienvCanvas = el.querySelector('canvas.red');
    AURA.montarRed(bienvCanvas, MUNDOS.map(m => ({
      id: m.id, x: m.x, y: m.y, tam: m.tam, tinte: tinteDe(m.halo),
    })), { despertar: true });
    AURA.montarOrbe(el.querySelector('.orbe-grande canvas'));
    auraMontada = false;          // el orbe chico se re-monta al cerrar esto
    if (conVoz) auraBienHablar();
    else $('#aurab-toca').classList.remove('oculto');
  }

  const espera = ms => new Promise(r => setTimeout(r, ms));

  async function auraBienHablar() {
    const T = aTxt();
    const nombre = (sesion?.nombre || '').split(' ')[0] || '';
    const sub = $('#aurab-sub');
    if (sub) sub.textContent = T.bienv1.replace('{nombre}', nombre ? nombre : '').replace(', .', '.');
    // La voz dice la frase NEUTRA (una sola grabacion para todos); el nombre
    // va en el subtitulo. Y cada frase vive en pantalla un minimo legible:
    // sin esto, un navegador sin voces cerraba la bienvenida en un suspiro.
    await Promise.all([AURA.hablar(T.bienv1Voz, idiomaActivo()), espera(3400)]);
    if (!$('#aurab-sub')) return;     // la saltaron a mitad de frase
    $('#aurab-sub').textContent = T.bienv2;
    await Promise.all([AURA.hablar(T.bienv2, idiomaActivo()), espera(4600)]);
    if (!$('#aurab-sub')) return;
    // La cadena tambien se presenta: es la noticia del ecosistema, y quien
    // entra tiene que saber sobre QUE late todo esto.
    $('#aurab-sub').textContent = T.bienv3;
    await Promise.all([AURA.hablar(T.bienv3, idiomaActivo()), espera(4600)]);
    auraBienFin();
  }

  function auraBienToca() {
    const t = $('#aurab-toca');
    if (t) t.classList.add('oculto');
    auraBienHablar();
  }

  function auraBienFin() {
    const el = $('#aura-bienvenida');
    if (el.classList.contains('oculto')) return;
    AURA.pararVoz();
    el.classList.add('irse');
    setTimeout(() => {
      el.classList.add('oculto');
      el.innerHTML = '';
      AURA.pararRed();
      auraDespertar();
      // el cerebro de verdad, ya con energia plena
      if (vistaActual === 'nucleo') encenderCerebro(false);
      auraOfrecerGid();
    }, 900);
  }

  // ── el recorrido ──────────────────────────────────────────────────────────
  /* AU-RA se mueve por el ecosistema y lo explica: oscurece todo menos la
     esfera de la que habla, le manda señales por la red, y va contando con
     voz y con letras. Se entra y se sale cuando se quiera. */
  let tourPaso = -1;

  function auraTour() {
    auraAbierta = false; pintarAura();
    if (vistaActual !== 'nucleo') vista('nucleo');
    tourPaso = 0;
    pintarTour();
  }

  function pintarTour() {
    const T = aTxt();
    const paradas = T.tour;
    const el = $('#aura-tour');
    if (tourPaso < 0 || tourPaso >= paradas.length) return auraTourFin();
    const p = paradas[tourPaso];
    el.classList.remove('oculto');

    // el foco: la esfera de la que se habla, iluminada; el resto, en penumbra
    document.querySelectorAll('.nu-mundo').forEach(m => m.classList.remove('nu-foco'));
    let velo = 'rgba(1,7,8,.72)';
    if (p.id) {
      const m = MUNDOS.find(x => x.id === p.id);
      const esfera = document.querySelector(`.nu-mundo[data-mundo="${p.id}"]`);
      if (esfera) esfera.classList.add('nu-foco');
      if (m) {
        const { enCaja, enAncho } = cajaNucleo();
        velo = `radial-gradient(circle at ${enAncho(m.x)}% ${enCaja(m.y)}%, rgba(1,7,8,0) 90px, rgba(1,7,8,.82) 300px)`;
      }
      AURA.latirHacia(p.id, 6);
      // AUBANK y Ordenexchange comparten parada: laten los dos
      if (p.id === 'aubank') AURA.latirHacia('oxch', 4);
    }
    el.innerHTML = `
      <div class="velo" style="background:${velo}"></div>
      <div class="letras">
        <div class="paso">${esc(p.k)} · ${tourPaso + 1}/${paradas.length}</div>
        <h3>${esc(p.t)}</h3>
        <p>${esc(p.p)}</p>
        <div class="fila">
          ${tourPaso > 0 ? `<button class="btn btn-linea btn-sm" onclick="VETA.auraTourVa(-1)">${T.atras}</button>` : ''}
          <button class="btn btn-oro btn-sm" onclick="VETA.auraTourVa(1)">
            ${tourPaso === paradas.length - 1 ? T.fin : T.sig}</button>
          <button class="salirse" onclick="VETA.auraTourFin()">${T.salir}</button>
        </div>
      </div>`;

    /* El guion CAMINA SOLO, como la presentacion del cerebro: habla la
       parada, respira, y pasa a la siguiente. Los botones mandan mas que el
       guion — si la persona toco algo, el paso cambio y este avance se
       descarta. Sin voz, el ritmo lo pone el largo del texto: nadie lee una
       parada en menos de tres segundos y medio. */
    const yo = tourPaso;
    const lectura = Math.max(3200, p.p.length * 48);
    Promise.all([AURA.hablar(p.p, idiomaActivo()), espera(lectura)]).then(() => {
      if (tourPaso !== yo) return;                  // lo movieron a mano
      if ($('#aura-tour').classList.contains('oculto')) return;
      if (tourPaso < paradas.length - 1) { tourPaso++; pintarTour(); }
    });
  }

  function auraTourVa(d) { AURA.pararVoz(); tourPaso += d; pintarTour(); }

  /* Apagar el recorrido SIN despedida. Se usa cuando la persona se fue a otra
     vista o cerro sesion: ahi el velo y la narracion quedaban encima de la
     pantalla nueva —AU-RA explicando el Nucleo sobre la pantalla de enviar—
     y el epilogo del final no viene a cuento porque nadie lo pidio. */
  function tourApagar() {
    const el = $('#aura-tour');
    if (tourPaso < 0 && el.classList.contains('oculto')) return;
    tourPaso = -1;
    AURA.pararVoz();
    document.querySelectorAll('.nu-mundo').forEach(m => m.classList.remove('nu-foco'));
    el.classList.add('oculto');
    el.innerHTML = '';
  }

  function auraTourFin() {
    const T = aTxt();
    if ($('#aura-tour').classList.contains('oculto') && tourPaso < 0) return;
    tourApagar();
    // el cierre: honesto con quien todavia no tiene su llave
    auraAbierta = true;
    auraCharla.push(esVerificada()
      ? { de: 'aura', txt: T.tourFin }
      : { de: 'aura', txt: T.tourFinGid, botones: [
          { txt: T.sinGidSi, di: T.chips[3] },
          { txt: T.sinGidNo, di: T.sinGidNo },
        ]});
    pintarAura();
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
            <button class="btn btn-linea btn-sm" onclick="VETA.enviarA(${jsTxt(c.dir)})">${t('con.usar')}</button>
            <button class="btn btn-linea btn-sm" onclick="VETA.borrarContacto(${jsTxt(c.id)})" aria-label="${t('con.borrar')}">✕</button>
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
        const crudo = (c?.rawValue || '').trim();
        const inv = leerInvitacion(crudo);
        if (inv) {
          cerrarCamara();
          avisar(t('qr.leido'));
          chatPendiente = inv;
          vista('chat');
          return;
        }
        const cobro = leerCobro(crudo);
        if (cobro) {
          cerrarCamara();
          avisar(t('qr.leido'));
          irACobro(cobro);
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
        <form onsubmit="return VETA.pedirSecreto(${jsTxt(cual)},event)">
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

  async function copiarTexto(v, aviso) {
    try { await navigator.clipboard.writeText(v); avisar(aviso || t('seg.copiado')); }
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
        <form class="revelar" onsubmit="return VETA.revelar(${jsTxt(que)},event)">
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
    /* La tarjeta se pide aparte y `cargarTodo` no la incluye, asi que su
       propio boton de Reintentar no reintentaba nada: exactamente el boton
       que no puede funcionar que este archivo denuncia en otra parte. Se
       tira la que quedo en error para que `vista('tarjeta')` la vuelva a
       pedir. */
    if (vistaActual === 'tarjeta' && tarjeta?.error) tarjeta = null;
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

    /* Quien llega con /#verificar viene de la pagina publica de Genesis ID y
       viene a verificarse, no a mirar el saldo. Basta con dejar marcada la
       vista antes de arrancar: las dos puertas de entrada —sesion recuperada
       aqui abajo y sesion recien creada en enviarAcceso— terminan en ir('app'),
       que pinta vistaActual. Si la vista todavia no existe, vista() cae sola en
       la billetera, asi que esto nunca deja una pantalla en blanco. */
    const pideVerificar = location.hash === '#verificar';
    if (pideVerificar) vistaActual = 'verificar';

    /* Un enlace de cobro (#pagar?a=…&m=…&s=…) es alguien pasando una factura.
       Se guarda para rellenar el envio en cuanto haya sesion; sin sesion, se
       manda a la puerta y el cobro espera ahi hasta que entre. */
    const cobroEntrante = location.hash.startsWith('#pagar') ? leerCobro(location.hash) : null;
    if (cobroEntrante) vistaActual = 'enviar';

    /* Una invitacion de chat (#chat?con=…) apunta directo al hilo: quien la
       escaneo quiere hablar con ALGUIEN, no ver una lista. */
    const invEntrante = location.hash.startsWith('#chat') ? leerInvitacion(location.hash) : null;
    if (invEntrante) { vistaActual = 'chat'; chatPendiente = invEntrante; }

    /* Y si la direccion no es una intencion sino una RUTA —alguien guardo
       #billetera en favoritos, o recarga estando en el chat— se entra por
       ahi. Es lo que convierte la barra de direcciones en parte del producto
       en vez de un adorno. */
    const rutaDirecta = leerRuta(location.hash);
    if (rutaDirecta && !cobroEntrante && !invEntrante && !pideVerificar) {
      vistaActual = rutaDirecta.v;
      if (rutaDirecta.d) tokenAbierto = rutaDirecta.d;
      if (rutaDirecta.neg) payNeg = rutaDirecta.neg;
    }

    sesion = recuperar();
    if (sesion?.token) {
      // Volver con la sesión guardada es entrar igual: si no se contara, quien
      // no cierra sesión nunca aparecería como que usa la app.
      tele('identificar', { ...abrirToken(sesion.token), email: sesion.correo });
      tele('confirmar', sesion.token, {
        email: sesion.correo, nombre: sesion.nombre, direccionWallet: sesion.direccion,
      });
      tele('accion', 'sesion.recuperada');
      ir('app');
      cargarTodo();
      /* La presentacion de AU-RA es un RITUAL DE ENTRADA, no un peaje diario.
         Trece segundos de pantalla negra la primera vez son magia; todos los
         dias son un impuesto que la gente aprende a saltar buscando un boton
         chiquito. Se presenta una vez por cuenta y despues el orbe saluda en
         el panel, que es donde vive el resto del tiempo.

         Sin gesto no hay permiso de audio: sale igual, con el orbe pidiendo
         un toque para hablar. Tocar el orbe ES el gesto. */
      if (!yaSePresento()) {
        marcarPresentada();
        setTimeout(() => auraBienvenida(false), 500);
      }
      // Despues de cargarTodo, para que la moneda del cobro exista en la
      // cartera cuando se intente elegir.
      if (cobroEntrante) cargarCartera().then(() => irACobro(cobroEntrante));
    }
    /* Sin sesion no hay identidad que verificar todavia: al que venia a eso se
       le abre el acceso, no la portada, para que no tenga que buscar la puerta. */
    else ir(pideVerificar || cobroEntrante ? 'acceso' : 'bienvenida', 'entrar');
  }
  document.addEventListener('DOMContentLoaded', arrancar);

  return { ir, pestana, ojo, vista, mandar, copiar, compartir, salir, reintentar, avisar, idioma,
           tapar, copiarContrato, congelar, revelar, pedirTarjeta, cambioMonto, elegirDestino,
           voltear, olvidar, remMonto, remPais, refrescarTasas, nuevoContacto, borrarContacto,
           enviarA, abrirCamara, cerrarCamara, pedirSecreto, copiarTexto, guardarNombre,
           // Enviar cualquier token, no solo ORIGEN.
           envElegir, envContacto, envMax, envMonto,
           // Cobrar: el codigo que ya lleva la cantidad puesta.
           cobElegir, cobEscribir, cobCopiar, cobCompartir,
           // MyTokenPay adentro: directorio, ficha y cobro real.
           payBuscar, payCategoria, payDePais, payVerTodos, payAbrir,
           // El Nucleo: la portada del ecosistema.
           nuAbrir,
           // AU-RA: el orbe, el panel, la bienvenida y el recorrido.
           auraToca, auraManda, auraMic, auraChip, auraTourVa, auraTourFin,
           auraBienFin, auraBienToca, auraAyuda,
           // La bienvenida del ecosistema: sale sola la primera vez y se puede
           // volver a abrir desde Ajustes.
           bienvenida, bienSig, bienCerrar,
           // La frase de recuperacion, al crear la cuenta.
           semCopiar, semListo,
           // PULSE CHAT. Los manejadores van en el HTML que genera la vista, asi
           // que sin figurar aca los botones del chat no hacen nada.
           chatEntrar, chatAbrir, chatCerrar, chatMandar, chatBuscar, chatGrupo,
           chatAdjuntar, chatReparar, chatCodigo, chatCodigoCopiar,
           chatVerFicha, chatFichaCerrar, chatEnviarOrigen, chatGuardarContacto,
           chatHojaCerrar, chatHojaOk,
           chatOlvidar, chatGrupoInvitar, chatGrupoNombre, chatGrupoSalir,
           chatInvCopiar, chatMiFoto, chatMiFotoQuitar, chatMiNombre,
           // La verificación por web. Los manejadores van en el HTML (onclick,
           // onchange), así que sin figurar acá los botones no hacen nada.
           verSeguir, verAtras, verVolverA, verSalir, verOpc, verVol,
           verFoto, verQuitar, verMrz, verMandar,
           // Solo para las pruebas y las capturas: aqui no hay salida a la
           // cadena, y hay que poder mirar la pantalla con saldos dentro.
           _sembrar: l => { cartera = l; errCartera = null; },
           // Solo para las pruebas: saber si la persona consta verificada sin
           // tener que deducirlo del texto de una tarjeta.
           _esVerificada: () => esVerificada(),
           // Dónde está la persona ahora mismo. Lo usan las pruebas de la
           // constelación: entrar a un mundo pasó a ser una animación de
           // 240ms y DESPUÉS pintar, así que hay que poder esperar al
           // resultado en vez de a un número de milisegundos elegido a ojo.
           dondeEstoy: () => vistaActual,
           // Lo que las pruebas necesitan MIRAR para comprobar que un
           // tropiezo no borro nada. Solo lectura.
           _movs: () => todoMovimiento(),
           _laTarjeta: () => tarjeta,
           _tarjeta: c => { tarjeta = c; },
           _sesion: x => { sesion = x; },
           _leerCobro: c => { const x = leerCobro(c); if (x) irACobro(x); return x; },
           _sol: x => { sol = { ...(sol || {}), ...x }; },
           _semilla: f => { semillaNueva = f; mostrarSemilla(f); },
           _ofrecerGid: () => auraOfrecerGid(),
           _mtp: () => URL_MYTOKENPAY,
           _bienvenidaAura: () => auraBienvenida(true),
           _auraTxt: () => AURA_TXT,
           _identidad: x => { identidad = x; },
           _estado: () => ({ sesion, cartera, identidad, movimientos, tarjeta, vistaActual, modo, ocultos }) };
})();
