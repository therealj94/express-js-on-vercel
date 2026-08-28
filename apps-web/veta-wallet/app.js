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
  /* La casa de cambio. Adonde vuelve el circuito de #sso-ordenex (ver
     volverConLlave) y adonde lleva su esfera del Nucleo. Se puede pisar desde
     fuera —ONX_URL— igual que el API y la cadena, para ensayar el viaje de
     ida y vuelta contra una Ordenex de pruebas sin tocar la de verdad. */
  /* El APEX, no el www: es el dominio que la app de Amplify tiene asociado
     de verdad, y el `www` es un salto de más que en un marco puede quedarse
     a mitad de camino. */
  const URL_ORDENEX = window.ONX_URL || 'https://ordenexchange.link';
  /* AuCorp — el lado FIAT del ecosistema. Se llamaba AUBANK cuando era solo
     una esfera dormida en el Nucleo; el nombre cambio con la empresa, y el
     viejo no sobrevive en ningun sitio porque dos nombres para una misma casa
     es como se pierde la gente. Mismo circuito que Ordenex: la web de AuCorp
     manda a /#sso-aucorp y volverConLlave devuelve a la persona con su llave.
     Apunta a /banca y no a la portada: quien llega desde el Nucleo va a SUS
     cuentas, no a leer quienes somos. La portada sigue siendo la puerta de
     quien llega de fuera.

     Y apunta al dominio de AMPLIFY, no a www.aucorp.io, porque hoy ese
     dominio todavia sirve el WordPress viejo — /banca alli redirige a una
     pagina de servicios y la persona acabaria en cualquier sitio menos en sus
     cuentas. Es la misma situacion que MyTokenPay y se resuelve igual: cuando
     el dominio apunte a la app de Amplify, esta linea vuelve a
     'https://www.aucorp.io/banca' y nada mas cambia. Mientras tanto, mandar a
     la gente a una puerta que no existe seria peor que la URL fea. */
  const URL_AUCORP = window.AUC_URL || 'https://main.d2e55u6ls6v9xt.amplifyapp.com/banca';

  const $ = s => document.querySelector(s);
  // Todos los que coincidan, ya como lista de verdad y no como NodeList: en la
  // rejilla de la frase hay que recorrerlos y filtrarlos.
  const $$ = s => [...document.querySelectorAll(s)];
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
  /* Y LO MISMO VALE PARA EL SALDO, que es la otra mitad y faltaba.
     El comentario de arriba tenia razon y se aplicaba solo a los precios: un
     saldo que NO SE PUDO LEER tampoco puede sumar como cero. `cadena.js`
     ahora devuelve `cant: null` con `leido: false` cuando el nodo no contesto,
     y hace falta filtrarlo A MANO porque en JavaScript `null * precio` da 0
     —no NaN— asi que un total que no filtre sigue diciendo cero con toda
     tranquilidad. Ese es exactamente el fallo que se esta cerrando. */
  const leido = x => x.leido !== false && x.cant != null;
  const conPrecio = () => (cartera || []).filter(x => x.precio != null && leido(x));

  /** El patrimonio, o `null` si no se pudo leer NADA. Nunca cero de consuelo. */
  const total = () => {
    if (!hayAlgunSaldo()) return null;
    return conPrecio().reduce((s, x) => s + x.cant * x.precio, 0);
  };

  /** ¿Contesto el nodo al menos un saldo? Si no, no hay nada que sumar. */
  const hayAlgunSaldo = () => (cartera || []).some(leido);

  /** ¿Quedo algun saldo sin leer? Distinto de que valga cero. */
  const haySinLeer = () => (cartera || []).some(x => !leido(x));

  const haySinPrecio = () => (cartera || []).some(x => leido(x) && x.cant > 0 && x.precio == null);

  /* Variacion del dia, ponderada por cuanto pesa cada activo en la cartera:
     un 5 % en algo donde tenes diez dolares no mueve el patrimonio igual que
     un 5 % donde tenes mil. */
  function delDia() {
    if (!hayAlgunSaldo()) return null;
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
  // Rellena {marcas} en un texto del diccionario.
  const rell = (s, m) => String(s).replace(/\{(\w+)\}/g, (_, k) => m[k] ?? '');
  /* La fecha de un acta con el año entero: una resolución de la Junta se cita
     por su fecha completa, y sin año no se busca en un libro que abarca años. */
  const fechaCorta = iso => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const dd = x => String(x).padStart(2, '0');
    return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}`;
  };
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
    for (const id of ['portada', 'acceso', 'app', 'reclave']) $('#' + id).classList.toggle('oculto', id !== (destino === 'bienvenida' ? 'portada' : destino));
    $('#techo').classList.toggle('oculto', destino === 'app');
    /* El marco del navegador (la barra del teléfono) acompaña: azul espacio
       en la entrada, el verde del pozo adentro — un solo meta estático
       vestiría el interior con un color que no es suyo. */
    const marco = document.querySelector('meta[name=theme-color]');
    if (marco) marco.content = destino === 'app' ? '#021B1C' : '#050510';
    // el botón de pantalla completa se ofrece adentro y se guarda en la puerta
    pintarLlena();
    pintarVR();
    if (destino === 'acceso') {
      $('#acceso')?.classList.remove('se-va');
      pestana(cual || 'entrar');
      setTimeout(() => $('#i-correo').focus(), 60);
    }
    // AU-RA recibe en la puerta; en cualquier otra pantalla su saludo se apaga.
    if (destino === 'acceso') accesoEscena(); else accesoEscenaParar();
    /* La galaxia es el cielo de la ENTRADA. Adentro de la casa se apaga del
       todo —no se esconde con el bucle andando— y al salir se vuelve a
       montar: el interior del ecosistema conserva su fondo de siempre. */
    if (destino !== 'app') {
      document.getElementById('ae-saludo')?.remove();
      if (destino === 'acceso' && aetPuertaViva()) {
        /* Salir de la sesión no corta la escena: la cámara se ALEJA de vuelta
           al umbral y la puerta recibe con la misma galaxia, en silencio. */
        try { window.AETHERION.puerta(); } catch { /* nada */ }
      } else {
        try { window.AETHERION?.desmontar(); } catch { /* nada */ }
        $('#ae-cielo') && ($('#ae-cielo').innerHTML = '');
        document.body.classList.remove('cielo-vivo');
      }
    }
    if (window.GALAXIA) {
      if (destino === 'app' || (destino === 'acceso' && aetPuertaViva())) GALAXIA.apagar();
      else GALAXIA.montar($('#galaxia'));   // idempotente si ya está ahí
    }
    /* La puerta intenta su cielo 3D apenas se pisa (y si no puede, el 2D de
       arriba ya quedó puesto: la casa nunca se queda sin cielo). */
    if (destino === 'acceso') aetPuerta();
    if (destino === 'app') vista(vistaActual);
    window.scrollTo(0, 0);
    /* AU-RA acompaña toda la sesion; fuera de ella no existe. Las seis
       tarjetas de la bienvenida vieja ya no salen solas: quedaron en Ajustes
       para quien quiera leerlas — la puerta de entrada ahora es de AU-RA. */
    if (destino === 'app') { auraVisita = false; auraDespertar(); }
    else {
      /* AU-RA TAMBIÉN ATIENDE A QUIEN NO HA ENTRADO. Antes desaparecía fuera
         de la sesión, y eso dejaba mudo justo el momento en que más se duda:
         alguien que acaba de llegar y no sabe si esto es serio. En visita
         contesta del ecosistema y de nada más — no hay cuenta de la que
         hablar, así que no hay nada de nadie que pueda contar. */
      const cerrandoSesion = !auraVisita;
      auraVisita = true;
      auraDespertar();
      auraAbierta = false;
      /* La conversacion con AU-RA se VA con la sesion. Sin esto, la siguiente
         cuenta que entrara en el mismo navegador abria el panel y encontraba
         el hilo de la anterior — con su nombre y con los saldos que AU-RA le
         habia contestado.

         Pero SOLO al cerrar sesion. Entre la portada y el acceso no hay nada
         privado que borrar, y borrar ahi tiraba la conversacion de la visita
         justo cuando pulsaba «abrir mi cuenta»: llegaba al formulario y AU-RA
         ya no se acordaba de lo que le acababa de preguntar. */
      if (cerrandoSesion) auraCharla = [];
      pintarAura();
      tourApagar();
      AURA.pararVoz(); AURA.pararRed();
      AURA.dejarDeEscuchar();     // el microfono tampoco sobrevive a la salida
      document.body.classList.remove('en-cerebro');
    }
  }

  function pestana(cual) {
    if (viajando) return;
    modo = cual;
    $('#tab-entrar').setAttribute('aria-selected', String(cual === 'entrar'));
    $('#tab-crear').setAttribute('aria-selected', String(cual === 'crear'));
    $('#campo-nombre').classList.toggle('oculto', cual !== 'crear');
    $('#fuerza-caja').classList.toggle('oculto', cual !== 'crear');
    $('#acc-legal').classList.toggle('oculto', cual !== 'crear');
    /* Por `bcTexto` y no por `textContent`: escribir el texto directo le
       borraría al botón la barra y el palomeo que lleva dentro. */
    bcTexto($('#btn-acceso'), cual === 'crear' ? t('acc.btnCrear') : t('acc.btnEntrar'));
    bcSoltar($('#btn-acceso'));
    $('#i-clave').setAttribute('autocomplete', cual === 'crear' ? 'new-password' : 'current-password');
    // En «crear» no hay contraseña que olvidar: el enlace ahí sería ruido.
    $('#acc-olvide').classList.toggle('oculto', cual !== 'entrar');
    $('#acc-aviso').classList.add('oculto');
  }

  /* ── LA RECEPCIÓN: AU-RA escribe su saludo ────────────────────────────────
   *
   * Los navegadores no dejan que un audio arranque solo, así que la primera
   * voz de AU-RA es esta: su saludo tecleándose letra a letra, con el orbe
   * latiendo mientras «habla». La voz audible llega con el primer gesto:
   * tocar el orbe abre el panel de verdad y ahí sí se la oye. El bucle solo
   * vive mientras el acceso está en pantalla; salir lo apaga. */
  let agReloj = null;

  function accesoEscenaParar() {
    clearTimeout(agReloj); agReloj = null;
    $('#ag-orbe')?.classList.remove('hablando');
  }

  function accesoEscena() {
    accesoEscenaParar();
    const donde = $('#ag-dice');
    if (!donde) return;
    // Se leen en cada vuelta y no una vez: cambiar de idioma en la puerta
    // tiene que cambiar también lo que AU-RA está diciendo.
    const frases = () => [t('acc.voz1'), t('acc.voz2'), t('acc.voz3')];
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      donde.textContent = frases()[1];
      return;
    }
    const orbe = $('#ag-orbe');
    let f = 0, i = 0, borrando = false;
    const tic = () => {
      const lista = frases();
      const txt = lista[f % lista.length];
      if (!borrando) {
        i++;
        donde.textContent = txt.slice(0, i);
        orbe?.classList.add('hablando');
        if (i >= txt.length) {
          orbe?.classList.remove('hablando');
          borrando = true;
          agReloj = setTimeout(tic, 2600);   // que se alcance a leer entera
          return;
        }
        agReloj = setTimeout(tic, 34 + Math.random() * 26);
        return;
      }
      i -= 3;                                // borrar rápido: no es lectura
      donde.textContent = txt.slice(0, Math.max(0, i));
      if (i <= 0) { i = 0; borrando = false; f++; agReloj = setTimeout(tic, 420); }
      else agReloj = setTimeout(tic, 14);
    };
    tic();
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
    /* El hilo de AU-RA se REESCRIBE al cambiar de idioma, pero solo si la
       persona todavia no escribio nada. Quien llega, abre el panel y despues
       pulsa EN se quedaba con la bienvenida en español encima de una pagina
       ya traducida: la primera frase que lee del asistente, en el idioma que
       acaba de rechazar. Si ya hubo conversacion de verdad NO se toca —
       reescribirle a alguien lo que ya leyo es peor que dejarlo mezclado.

       La marca de «no escribio» es que no haya burbujas de `yo`, no que haya
       una sola burbuja: la oferta del Genesis ID empuja DOS (sorteo +
       pregunta) y compararlo con uno dejaba justo esa oferta —botones
       incluidos— en el idioma viejo, la misma regresion que este comentario
       jura haber corregido. */
    if (auraCharla.length && !auraCharla.some(b => b.de === 'yo')) {
      const T = aTxt();
      const oferta = auraCharla.some(b => Array.isArray(b.botones));
      auraCharla = oferta
        ? [...(sorteoRestante() > 0 ? [{ de: 'aura', txt: T.sorteo }] : []),
           { de: 'aura', txt: T.sinGid, botones: [
             { txt: T.sinGidSi, di: T.chips[3] },
             { txt: T.sinGidNo, di: T.sinGidNo },
           ] }]
        : [{ de: 'aura', txt: auraVisita ? T.holaVisita : T.hola }];
    }
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

  /* La misma medida de fuerza que al crear la cuenta. Quien está poniendo una
     contraseña nueva merece el mismo aviso que quien la puso la primera vez. */
  function pintarFuerzaReclave() {
    const f = fuerza($('#rc-clave').value);
    $('#rc-fuerza-caja').classList.toggle('oculto', !$('#rc-clave').value);
    $('#rc-fuerza-barra').style.width = (f.n / 4 * 100) + '%';
    $('#rc-fuerza-barra').style.background = f.color;
    $('#rc-fuerza-lbl').textContent = f.txt;
    $('#rc-fuerza-lbl').style.color = f.color;
  }

  function avisoAcceso(texto, bien) {
    const a = $('#acc-aviso');
    a.textContent = texto;
    a.className = 'aviso ' + (bien ? 'aviso-ok' : 'aviso-mal');
    a.classList.toggle('oculto', !texto);
  }

  /* ── RECUPERAR LA CONTRASEÑA ──────────────────────────────────────────────
     Esto faltaba entero del lado del navegador. El backend ya tenía las dos
     rutas bien hechas —token con hash, quince minutos de vigencia, un solo
     uso, y la misma respuesta exista o no la cuenta para que nadie averigüe
     quién está registrado—, pero el correo llevaba a `/changePassword?token=…`
     y esta app no atendía esa dirección: la persona caía en la portada, sin
     ningún sitio donde escribir la clave nueva, y el token se le vencía
     mientras buscaba. El trámite estaba roto de punta a punta.

     Son tres momentos y solo se enseña uno cada vez: pedirlo, escribirla,
     listo. */
  let reclaveToken = null;

  function reclavePaso(cual) {
    for (const p of ['pedir', 'nueva', 'listo']) {
      $('#rc-' + p).classList.toggle('oculto', p !== cual);
    }
    $('#rc-aviso1').classList.add('oculto');
    $('#rc-aviso2').classList.add('oculto');
  }

  const avisoRc = (caja, txt) => {
    const el = $(caja);
    el.textContent = txt || '';
    el.classList.toggle('oculto', !txt);
  };

  /** Desde el formulario de entrar, con el correo ya escrito si lo hay. */

  /* ── ENTRAR CON LA FRASE SEMILLA O LA LLAVE PRIVADA ──────────────────────
   *
   * Existe para el caso que hoy no tiene salida: alguien que no se acuerda de
   * la contraseña Y tampoco puede llegar a su correo. Sin esto, esa persona
   * pierde su dinero teniendo la frase en la mano.
   *
   * LA FRASE NO SALE DE ESTE NAVEGADOR. De aquí solo viaja una firma sobre un
   * reto que el servidor acaba de emitir. Toda la derivación vive en
   * llaves.js, con el porqué de cada paso.
   */

  /* ── LA REJILLA DE PALABRAS ──────────────────────────────────────────────
   *
   * Un recuadro por palabra, numerado. Lo que aporta sobre un campo corrido:
   * se ve cuantas van sin contarlas, y la palabra que no existe en el
   * diccionario de BIP-39 se marca EN SU SITIO mientras se escribe — en vez
   * de que el servidor conteste «no hay cuenta» sin decir cual de las doce
   * esta mal, que es lo mismo que no decir nada.
   */
  let llvCuantas = 12;
  let llvTapada = true;
  let llvModo = 'frase';

  const llvPalabras = () => globalThis.LLAVECRIPTO?.palabras || null;

  function llaveRejilla() {
    const caja = $('#llv-rejilla');
    if (!caja) return;
    const antes = llaveLeerPalabras();
    caja.innerHTML = Array.from({ length: llvCuantas }, (_, i) => `
      <label class="llv-slot">
        <i>${i + 1}</i>
        <input type="text" inputmode="text" spellcheck="false" autocapitalize="off"
               autocorrect="off" autocomplete="off" data-i="${i}"
               aria-label="Palabra ${i + 1}">
      </label>`).join('');
    caja.classList.toggle('tapada', llvTapada);
    // Se conserva lo que ya se habia escrito al cambiar de cuenta: nadie
    // deberia perder ocho palabras por pulsar «15» para mirar.
    const campos = [...caja.querySelectorAll('input')];
    antes.slice(0, llvCuantas).forEach((w, i) => { if (campos[i]) campos[i].value = w; });
    campos.forEach((c) => {
      c.addEventListener('input', () => { llaveMarcar(c); llaveMarcador(); });
      c.addEventListener('paste', llavePegar);
      c.addEventListener('keydown', llaveTecla);
      c.addEventListener('blur', () => llaveMarcar(c));
      llaveMarcar(c);
    });
    llaveMarcador();
  }

  const llaveLeerPalabras = () =>
    [...($('#llv-rejilla')?.querySelectorAll('input') || [])]
      .map((c) => c.value.trim().toLowerCase());

  /** El borde habla: oro si la palabra existe, coral si no, neutro si está vacía. */
  function llaveMarcar(campo) {
    const w = campo.value.trim().toLowerCase();
    if (w !== campo.value) campo.value = w;
    const slot = campo.closest('.llv-slot');
    const dicc = llvPalabras();
    slot.classList.remove('bien', 'mal');
    if (!w) return;
    /* Sin diccionario cargado no se marca NADA. Pintar todo de rojo porque el
       paquete todavía no llegó sería mentir sobre lo que la persona escribió. */
    if (!dicc) return;
    slot.classList.add(dicc.includes(w) ? 'bien' : 'mal');
  }

  function llaveMarcador() {
    const m = $('#llv-marcador');
    if (!m) return;
    const llenas = llaveLeerPalabras().filter(Boolean).length;
    m.textContent = `${llenas} / ${llvCuantas}`;
    m.classList.toggle('completa', llenas === llvCuantas);
  }

  /* Pegar la frase entera en cualquier recuadro la reparte por todos, y ajusta
     la cuenta sola. Es como llega de verdad: de un gestor de contraseñas o de
     una nota, no palabra por palabra. */
  function llavePegar(ev) {
    const texto = (ev.clipboardData || window.clipboardData)?.getData('text') || '';
    const palabras = texto.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (palabras.length < 2) return; // una sola palabra: que la pegue y ya
    ev.preventDefault();
    if ([12, 15, 18, 21, 24].includes(palabras.length)) llvCuantas = palabras.length;
    llaveRejilla();
    llaveBotonesCuenta();
    const campos = [...$('#llv-rejilla').querySelectorAll('input')];
    campos.forEach((c, i) => { c.value = palabras[i] || ''; llaveMarcar(c); });
    llaveMarcador();
    campos[Math.min(palabras.length, llvCuantas) - 1]?.focus();
  }

  /* Espacio o Enter pasan al siguiente; borrar en un recuadro vacío vuelve al
     anterior. Es como se teclea una lista, y sin esto habría que ir con el
     dedo recuadro por recuadro. */
  function llaveTecla(ev) {
    const campos = [...$('#llv-rejilla').querySelectorAll('input')];
    const i = campos.indexOf(ev.target);
    if (ev.key === ' ' || ev.key === 'Enter') {
      ev.preventDefault();
      if (ev.key === 'Enter' && i === campos.length - 1) return llaveEntrar();
      campos[i + 1]?.focus();
    } else if (ev.key === 'Backspace' && !ev.target.value && i > 0) {
      ev.preventDefault(); campos[i - 1]?.focus();
    } else if (ev.key === 'ArrowRight' && ev.target.selectionStart === ev.target.value.length) {
      campos[i + 1]?.focus();
    } else if (ev.key === 'ArrowLeft' && ev.target.selectionStart === 0) {
      campos[i - 1]?.focus();
    }
  }

  function llaveCuantas(n) {
    llvCuantas = n;
    llaveRejilla();
    llaveBotonesCuenta();
    $('#llv-rejilla')?.querySelector('input')?.focus();
  }

  function llaveBotonesCuenta() {
    for (const b of $$('.llv-cuenta button')) {
      b.classList.toggle('activo', Number(b.dataset.n) === llvCuantas);
    }
  }

  function llaveOjo() {
    llvTapada = !llvTapada;
    $('#llv-rejilla')?.classList.toggle('tapada', llvTapada);
    const e = $('#llv-ojo span');
    if (e) e.textContent = t(llvTapada ? 'llv.ver' : 'llv.tapar');
  }

  /* Frase o llave privada. Son dos cosas distintas y no se mezclan en el mismo
     campo: quien tiene la llave privada sabe lo que es, y a quien tiene la
     frase enseñarle un campo de sesenta y cuatro caracteres solo lo asusta. */
  function llaveModo() {
    llvModo = llvModo === 'frase' ? 'privada' : 'frase';
    $('#llv-frase')?.classList.toggle('oculto', llvModo !== 'frase');
    $('#llv-privada')?.classList.toggle('oculto', llvModo !== 'privada');
    const b = $('#llv-cambiar');
    if (b) b.textContent = t(llvModo === 'frase' ? 'llv.aPrivada' : 'llv.aFrase');
    $('#llv-aviso')?.classList.add('oculto');
    (llvModo === 'frase' ? $('#llv-rejilla input') : $('#i-llave'))?.focus();
  }

  /** Lo que se va a usar para entrar, venga de la rejilla o del campo. */
  function llaveSecreto() {
    if (llvModo === 'privada') return ($('#i-llave')?.value || '').trim();
    const w = llaveLeerPalabras();
    return w.every(Boolean) ? w.join(' ') : '';
  }

  /** Se borra TODO al salir: ni la rejilla ni el campo guardan nada. */
  function llaveBorrar() {
    for (const c of $$('#llv-rejilla input')) { c.value = ''; llaveMarcar(c); }
    const p = $('#i-llave'); if (p) p.value = '';
    llaveMarcador();
  }



  /* ── EL BOTON QUE CONFIRMA ───────────────────────────────────────────────
   *
   * Se le pone a un boton que ya existe, sin tocar su marcado: la funcion le
   * envuelve el texto y le mete la barra y el palomeo la primera vez que se
   * usa. Asi vale para el de entrar, el de traer una billetera y el de
   * enviar, sin repetir el mismo HTML tres veces.
   *
   * LA REGLA QUE MANDA: NO SE CANTA VICTORIA ANTES DE TIEMPO
   *
   * `trabajando()` pone la barra a recorrer en bucle —dice «estoy en eso»,
   * que es lo unico que se sabe— y `hecho()` la completa y dibuja el palomeo.
   * `hecho()` SOLO se llama cuando el servidor ya contesto que si. Una barra
   * que llega al final por reloj le dice a alguien que su dinero salio antes
   * de que nadie lo haya confirmado, y eso no es una animacion: es una
   * mentira que la persona va a creer.
   *
   * Si falla, `soltar()` devuelve el boton a reposo y el error aparece donde
   * aparecen los errores. El boton no se queda contando una historia.
   */
  const BC_CHECK = '<svg class="bc-check" viewBox="0 0 25 30" aria-hidden="true">' +
    '<path d="M2,19.2C5.9,23.6,9.4,28,9.4,28L23,2"/></svg>';

  function bcPreparar(btn) {
    if (!btn || btn.classList.contains('bc')) return btn;
    // El texto que ya tenia se envuelve para poder atenuarlo sin perderlo.
    const txt = btn.textContent.trim();
    btn.innerHTML = `<span class="bc-txt"></span><i class="bc-barra"></i>${BC_CHECK}`;
    btn.querySelector('.bc-txt').textContent = txt;
    btn.classList.add('bc');
    return btn;
  }

  /** El texto del botón, sin romper la barra ni el palomeo. */
  function bcTexto(btn, texto) {
    if (!btn) return;
    bcPreparar(btn);
    const t = btn.querySelector('.bc-txt');
    if (t) t.textContent = texto;
  }

  function bcTrabajando(btn) {
    if (!btn) return;
    bcPreparar(btn);
    btn.classList.remove('bc-hecho');
    btn.classList.add('bc-trabaja');
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
  }

  /**
   * Salió bien. Devuelve una promesa que se resuelve cuando termina el
   * palomeo, para que quien llama pueda esperar a que se vea antes de cambiar
   * de pantalla — si no, el palomeo se dibuja sobre una pantalla que ya no
   * está y no lo ve nadie.
   */
  function bcHecho(btn, ms = 620) {
    if (!btn) return Promise.resolve();
    bcPreparar(btn);
    btn.classList.remove('bc-trabaja');
    btn.classList.add('bc-hecho');
    btn.setAttribute('aria-busy', 'false');
    const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    return new Promise((r) => setTimeout(r, quieto ? 220 : ms));
  }

  /** Vuelve a reposo. Se llama al fallar, y también al salir de la pantalla. */
  function bcSoltar(btn, texto) {
    if (!btn) return;
    btn.classList.remove('bc-trabaja', 'bc-hecho');
    btn.disabled = false;
    btn.setAttribute('aria-busy', 'false');
    if (texto != null) bcTexto(btn, texto);
  }

  /* ── TRAER UNA BILLETERA DE OTRA APP ─────────────────────────────────────
   *
   * POR QUE HACE FALTA, Y POR QUE APARECE AQUI
   *
   * MetaMask y las demas derivan por la ruta estandar (m/44'/60'/0'/0/N);
   * esta casa usa los primeros 32 bytes de la semilla. La MISMA frase da
   * direcciones distintas. Alguien que trae su frase de MetaMask no se
   * reconoce en la direccion que le sale aqui, y ninguna cuenta responde a
   * ella — porque ninguna cuenta se creo nunca asi.
   *
   * Se ofrece en el momento del fallo, con la frase ya escrita, en vez de en
   * un enlace suelto en otra pantalla que nadie encuentra cuando le hace
   * falta.
   *
   * QUE CAMBIA RESPECTO DE ENTRAR
   *
   * Al ENTRAR la frase no sale del navegador: se firma un reto. Al IMPORTAR
   * la llave SI viaja, porque Veta Wallet firma las transacciones en el
   * servidor y sin la llave no podria mover nada. Eso se dice arriba del
   * todo, en rojo, antes de que nadie escriba un correo.
   */
  let impSecreto = null;     // vive solo mientras dura la pantalla
  let impElegida = null;

  function importarOfrecer() {
    // El boton se pega al aviso de «no tiene cuenta», que es donde la persona
    // esta mirando en ese momento.
    const a = $('#llv-aviso');
    if (!a || a.querySelector('.imp-ofrecer')) return;
    const b = document.createElement('button');
    b.className = 'btn btn-linea btn-sm imp-ofrecer';
    b.type = 'button';
    b.style.marginTop = '10px';
    b.textContent = t('imp.ofrecer');
    b.onclick = () => importarAbrir();
    a.appendChild(b);
  }

  async function importarAbrir() {
    impSecreto = llaveSecreto();
    if (!impSecreto) return;
    impElegida = null;
    $('#llv-frase')?.classList.add('oculto');
    $('#llv-privada')?.classList.add('oculto');
    $('#llv-cambiar')?.classList.add('oculto');
    $('#btn-llave')?.classList.add('oculto');
    $('#llv-jamas')?.classList.add('oculto');
    $('#llv-aviso')?.classList.add('oculto');
    $('#imp')?.classList.remove('oculto');
    $('#imp-paso-dir')?.classList.remove('oculto');
    $('#imp-paso-cuenta')?.classList.add('oculto');
    $('#imp-listo')?.classList.add('oculto');
    await importarPintarDirecciones();
  }

  function importarSalir() {
    /* Se borra el secreto al salir, y tambien la rejilla. Una frase no se
       queda viva en memoria «por si vuelve»: si vuelve, la escribe otra vez. */
    impSecreto = null; impElegida = null;
    $('#imp')?.classList.add('oculto');
    $('#llv-frase')?.classList.remove('oculto');
    $('#llv-cambiar')?.classList.remove('oculto');
    $('#btn-llave')?.classList.remove('oculto');
    $('#llv-jamas')?.classList.remove('oculto');
    llaveBorrar();
    llaveCerrar();
  }

  /* Las direcciones que esa frase puede querer decir, CON su saldo.
   *
   * El saldo es lo unico que de verdad le dice a alguien cual es la suya.
   * Elegir por él —quedarse con la primera— lo mandaria a una billetera vacia
   * sin que supiera por que. */
  async function importarPintarDirecciones() {
    const caja = $('#imp-dirs');
    if (!caja) return;
    caja.innerHTML = `<div class="pie">${esc(t('imp.buscando'))}</div>`;
    const lista = await LLAVES.candidatas(impSecreto);
    if (!lista) { caja.innerHTML = `<div class="pie">${esc(t('llv.malFormato'))}</div>`; return; }

    const saldos = await Promise.all(lista.map(async (c) => {
      try {
        const hex = await CADENA.rpc('eth_getBalance', [c.direccion, 'latest']);
        return Number(BigInt(hex)) / 1e18;
      } catch { return null; }
    }));

    caja.innerHTML = lista.map((c, i) => {
      const v = saldos[i];
      const vacia = !(v > 0);
      const rotulo = c.casa ? t('imp.rutaCasa') : `${t('imp.rutaOtra')} ${c.indice + 1}`;
      return `
      <button type="button" class="imp-dir${vacia ? ' vacia' : ''}" onclick="VETA.importarElegir(${c.indice})">
        ${/* La direccion va ACORTADA: entera son 42 caracteres que no caben en
             un telefono y empujan el saldo fuera de la pantalla. La entera se
             enseña despues, en la que se elija, que es cuando importa
             comprobarla letra por letra. */''}
        <div class="d"><b>${esc(cortaDir(c.direccion))}</b><small>${esc(rotulo)}</small></div>
        <div class="s">${v == null ? '—' : esc(oro(v))}<small>ORIGEN</small></div>
      </button>`;
    }).join('');
  }

  async function importarElegir(indice) {
    const lista = await LLAVES.candidatas(impSecreto);
    const c = (lista || []).find((x) => x.indice === indice);
    if (!c) return;
    impElegida = c;
    const e = $('#imp-elegida');
    if (e) e.textContent = c.direccion;
    $('#imp-paso-dir')?.classList.add('oculto');
    $('#imp-paso-cuenta')?.classList.remove('oculto');
    $('#i-imp-correo')?.focus();
  }

  let impOcupado = false;
  async function importarHacer() {
    if (impOcupado || !impElegida) return;
    const correo = ($('#i-imp-correo')?.value || '').trim().toLowerCase();
    const clave = $('#i-imp-clave')?.value || '';
    const nombre = ($('#i-imp-nombre')?.value || '').trim();
    const av = $('#imp-aviso');
    const decir = (txt) => { if (av) { av.textContent = txt; av.classList.remove('oculto'); } };
    if (av) av.classList.add('oculto');

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return decir(t('imp.errCorreo'));
    if (clave.length < 8) return decir(t('imp.claveCorta'));

    const btn = $('#btn-imp');
    impOcupado = true;
    bcTrabajando(btn);
    try {
      const llavePrivada = await LLAVES.llaveParaImportar(impSecreto, impElegida.indice);
      if (!llavePrivada) return decir(t('llv.malFormato'));
      const d = await pedir('/auth/importar', {
        metodo: 'POST', conSesion: false,
        cuerpo: { email: correo, password: clave, name: nombre,
                  llavePrivada, direccion: impElegida.direccion },
      });
      /* Se borra TODO en cuanto el servidor contesta bien: la frase, la
         rejilla y la llave que se acaba de mandar. */
      impSecreto = null;
      llaveBorrar();
      const cl = $('#i-imp-clave'); if (cl) cl.value = '';
      await bcHecho(btn);
      $('#imp-paso-cuenta')?.classList.add('oculto');
      $('#imp-listo')?.classList.remove('oculto');
      const pp = $('#imp-listo-p');
      if (pp) pp.textContent = d?.correoEnviado === false ? t('imp.listoSinCorreo') : t('imp.listoP');
      tele('accion', 'billetera.importada');
    } catch (e) {
      decir(String(e?.mensaje || e?.message || '') || t('imp.err'));
    } finally {
      impOcupado = false;
      if (!btn?.classList.contains('bc-hecho')) bcSoltar(btn, t('imp.btn'));
    }
  }

  function llaveAbrir() {
    $('#form-acceso')?.classList.add('oculto');
    $('.seg')?.classList.add('oculto');
    /* Y el «volver» de la pantalla de acceso: el panel trae el suyo, y dos
       botones de volver seguidos no dicen a dónde va cada uno. */
    $('#acceso > .acc > .acc-volver')?.classList.add('oculto');
    $('#llv')?.classList.remove('oculto');
    $('#llv-aviso')?.classList.add('oculto');
    llvModo = 'frase';
    $('#llv-frase')?.classList.remove('oculto');
    $('#llv-privada')?.classList.add('oculto');
    llaveRejilla();
    llaveBotonesCuenta();
    llaveBorrar();
    $('#llv-rejilla input')?.focus();
  }

  function llaveCerrar() {
    // Se borra al salir. Una frase semilla no se queda en un campo por si
    // acaso: el siguiente que abra el teléfono la encontraría escrita.
    llaveBorrar();
    $('#llv')?.classList.add('oculto');
    $('.seg')?.classList.remove('oculto');
    $('#acceso > .acc > .acc-volver')?.classList.remove('oculto');
    $('#form-acceso')?.classList.remove('oculto');
  }

  const llvAviso = (clave) => {
    const a = $('#llv-aviso');
    if (!a) return;
    a.textContent = t(clave);
    a.classList.remove('oculto');
  };

  let llaveOcupado = false;
  async function llaveEntrar() {
    if (llaveOcupado) return;
    const secreto = llaveSecreto();
    $('#llv-aviso')?.classList.add('oculto');

    if (!window.LLAVES || !window.LLAVECRIPTO) return llvAviso('llv.sinCripto');

    /* Se dice QUE falta, no «formato inválido». En la rejilla se puede saber:
       o quedan recuadros vacíos, o hay una palabra que no está en el
       diccionario —y esa ya está marcada en rojo en su sitio. */
    if (llvModo === 'frase') {
      const w = llaveLeerPalabras();
      const dicc = llvPalabras();
      if (w.some((x) => !x)) return llvAviso('llv.faltan');
      if (dicc && w.some((x) => !dicc.includes(x))) return llvAviso('llv.malPalabra');
    }
    if (!secreto) return llvAviso('llv.malFormato');

    const btn = $('#btn-llave');
    llaveOcupado = true;
    bcTrabajando(btn);

    try {
      /* Primero la dirección, en local, para poder pedir el reto. Se deriva
         dos veces —una aquí y otra al firmar— y es a propósito: así la llave
         no queda viva en una variable mientras se espera a la red. */
      const previa = await LLAVES.credencial(secreto, 'previo');
      if (previa.error === 'formato') return llvAviso('llv.malFormato');

      const r = await pedir('/auth/reto-llave', {
        metodo: 'POST', cuerpo: { direccion: previa.direccion }, conSesion: false,
      });
      if (!r?.reto) return llvAviso('llv.err');

      const c = await LLAVES.credencial(secreto, r.reto);
      if (c.error) return llvAviso('llv.malFormato');

      const d = await pedir('/auth/entrar-con-llave', {
        metodo: 'POST', cuerpo: { nonce: r.nonce, firma: c.firma, recupera: c.recupera },
        conSesion: false,
      });
      if (!d?.token) return llvAviso('llv.err');

      // Se borra ANTES de entrar: si algo falla después, la frase ya no está.
      llaveBorrar();

      /* La sesión se arma igual que en el login de contraseña —mismos campos,
         mismo `refresco`, misma dirección sacada del token—. Si esto se
         desviara, la renovación dejaría de funcionar y todo empezaría a
         contestar «invalid token» al vencer los cuarenta minutos. */
      const c2 = abrirToken(d.token);
      sesion = {
        token: d.token,
        refresco: d?.refreshToken || d?.refresh_token || null,
        correo: d?.user?.email || null,
        nombre: d?.user?.name || (d?.user?.email || '').split('@')[0],
        direccion: c2.address || d?.user?.address || previa.direccion,
      };
      guardar();
      tele('identificar', { ...c2, email: sesion.correo });
      tele('confirmar', d.token, {
        email: sesion.correo, nombre: sesion.nombre, direccionWallet: sesion.direccion,
      });
      tele('accion', 'sesion.entrar.llave');
      anotarSesion();
      /* El palomeo se dibuja AHORA, con la sesión ya en la mano, y se espera a
         que se vea antes de cambiar de pantalla: si no, se dibujaría sobre una
         pantalla que ya no está y no lo vería nadie. */
      await bcHecho(btn);
      llaveCerrar();
      /* Entrar con la frase también es entrar: el mismo hipersalto que el
         login de correo, con la carga corriendo durante el vuelo. */
      cargarTodo();
      viajando = true;
      const aterrizarLlave = () => {
        // entrar con la frase es entrar igual: se llega al Inicio
        vistaActual = 'nucleo';
        viajando = false;
        if (!sesion) return;
        ir('app');
      };
      if (aetPuertaViva()) { $('#acceso')?.classList.add('se-va'); AETHERION.entrar('directo', aterrizarLlave); }
      else if (window.GALAXIA) GALAXIA.saltar(aterrizarLlave); else aterrizarLlave();
    } catch (e) {
      const m = String(e?.mensaje || e?.message || '');
      if (/no corresponde a ninguna cuenta/i.test(m)) { llvAviso('llv.sinCuenta'); importarOfrecer(); }
      else if (/caduc/i.test(m)) llvAviso('llv.caduco');
      else if (m) { const a = $('#llv-aviso'); if (a) { a.textContent = m; a.classList.remove('oculto'); } }
      else llvAviso('llv.err');
    } finally {
      llaveOcupado = false;
      // Si salió bien ya se cambió de pantalla; si falló, el botón vuelve a
      // reposo para poder intentarlo otra vez.
      if (!btn?.classList.contains('bc-hecho')) bcSoltar(btn, t('llv.btn'));
    }
  }

  function reclavePedir() {
    if (viajando) return;
    reclaveToken = null;
    reclavePaso('pedir');
    ir('reclave');
    // El correo que ya venía escrito se arrastra: volver a teclearlo es un
    // peaje sin motivo justo cuando la persona ya está molesta.
    const yaEscrito = $('#i-correo').value.trim();
    if (yaEscrito) $('#rc-correo').value = yaEscrito;
    setTimeout(() => $('#rc-correo').focus(), 60);
  }

  /** Vuelve al acceso y limpia la dirección: el token no se queda en la barra. */
  function reclaveSalir() {
    reclaveToken = null;
    $('#rc-clave').value = '';
    $('#rc-clave2').value = '';
    limpiarDireccion();
    ir('acceso', 'entrar');
  }

  /* El token viaja en la dirección. Se borra de la barra en cuanto se lee: un
     enlace de recuperación en el historial del navegador —o en una captura de
     pantalla— es una cuenta ajena esperando a que alguien lo abra. */
  function limpiarDireccion() {
    try {
      if (location.search || /changePassword/i.test(location.pathname)) {
        history.replaceState(null, '', '/');
      }
    } catch {}
  }

  async function reclaveEnviarPeticion(ev) {
    ev.preventDefault();
    const b = $('#btn-rc-pedir');
    const correo = $('#rc-correo').value.trim();
    if (!correo) return avisoRc('#rc-aviso1', t('err.completa'));
    avisoRc('#rc-aviso1', '');
    b.disabled = true;
    const antes = b.textContent;
    b.innerHTML = '<span class="girando"></span> ' + t('rc.enviando');
    try {
      await pedir('/auth/recuperarPassword', {
        metodo: 'POST', cuerpo: { email: correo }, conSesion: false,
      });
    } catch {
      /* A propósito NO se distingue el fallo. El servidor contesta lo mismo
         exista o no la cuenta —para que nadie pueda averiguar quién está
         registrado—, y enseñar aquí un error de red rompería justo esa
         propiedad. Si de verdad no salió, la persona lo pide otra vez. */
    }
    b.disabled = false;
    b.textContent = antes;
    reclavePaso('listo');
    $('#rc-listo').querySelector('h2').textContent = t('rc.enviadoT');
    $('#rc-listo').querySelector('.pie').textContent = t('rc.enviadoP');
  }

  async function reclaveGuardar(ev) {
    ev.preventDefault();
    const b = $('#btn-rc-nueva');
    const clave = $('#rc-clave').value;
    const otra = $('#rc-clave2').value;
    if (clave.length < 8) return avisoRc('#rc-aviso2', t('err.corta'));
    if (clave !== otra) return avisoRc('#rc-aviso2', t('rc.noCoinciden'));
    if (!reclaveToken) return avisoRc('#rc-aviso2', t('rc.sinToken'));

    avisoRc('#rc-aviso2', '');
    b.disabled = true;
    const antes = b.textContent;
    b.innerHTML = '<span class="girando"></span> ' + t('rc.guardando');
    try {
      await pedir('/auth/resetPassword', {
        metodo: 'POST', cuerpo: { token: reclaveToken, newPassword: clave },
        conSesion: false, sinReintento: true,
      });
      reclaveToken = null;
      $('#rc-clave').value = ''; $('#rc-clave2').value = '';
      limpiarDireccion();
      reclavePaso('listo');
      $('#rc-listo').querySelector('h2').textContent = t('rc.listoT');
      $('#rc-listo').querySelector('.pie').textContent = t('rc.listoP');
    } catch (e) {
      /* El caso frecuente no es un error de red: es un enlace vencido. Quince
         minutos pasan rápido, y decir «token inválido» deja a la persona sin
         saber qué hacer. Se le dice qué pasó y se le ofrece pedir otro. */
      const vencido = /invalid|expired|token/i.test(e?.message || '');
      avisoRc('#rc-aviso2', vencido ? t('rc.vencido') : t('rc.falloGuardar'));
      b.disabled = false;
      b.textContent = antes;
    }
  }

  function ojoReclave() {
    const i = $('#rc-clave');
    i.type = i.type === 'password' ? 'text' : 'password';
  }

  /* Se llama al arrancar. Devuelve true si la dirección traía un token, para
     que el arranque sepa que esta pantalla manda sobre cualquier otra. */
  function reclaveDesdeLaDireccion() {
    let tk = null;
    try {
      const q = new URLSearchParams(location.search || '');
      tk = q.get('token');
      // El correo viejo apuntaba a /changePassword; el nuevo puede usar el
      // hash. Se atienden las dos formas: hay enlaces ya enviados por ahí.
      if (!tk && location.hash.includes('token=')) {
        tk = new URLSearchParams(location.hash.slice(location.hash.indexOf('?') + 1)).get('token');
      }
    } catch {}
    if (!tk) return false;
    reclaveToken = tk;
    limpiarDireccion();
    reclavePaso('nueva');
    ir('reclave');
    setTimeout(() => $('#rc-clave').focus(), 60);
    return true;
  }

  /* Mientras el hipersalto vuela, la puerta queda congelada: sin esto, un
     clic en la otra pestaña re-armaba el botón (bcSoltar) y un segundo login
     salía en pleno vuelo — o el enlace de recuperación arrancaba a la persona
     del viaje a mitad de camino. */
  let viajando = false;

  async function enviarAcceso(ev) {
    if (viajando) return ev?.preventDefault?.();
    ev.preventDefault();
    const b = $('#btn-acceso');
    const correo = $('#i-correo').value.trim();
    const clave = $('#i-clave').value;
    const nombre = $('#i-nombre').value.trim();
    if (!correo || !clave) return avisoAcceso(t('err.completa'));
    if (modo === 'crear' && clave.length < 8) return avisoAcceso(t('err.corta'));
    if (modo === 'crear' && !nombre) return avisoAcceso(t('err.nombre'));

    avisoAcceso('');
    const antes = b.querySelector('.bc-txt')?.textContent || b.textContent;
    bcTrabajando(b);
    bcTexto(b, modo === 'crear' ? t('acc.creando') : t('acc.entrando'));
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
      // Se espera a que el palomeo se vea antes de irse de la pantalla.
      await bcHecho(b);
      /* EL VIAJE. Entrar no es un corte de pantalla: es cruzar la galaxia.
         El fondo estira sus estrellas, hay un destello de oro, y del otro
         lado ya está la casa. La carga de la cartera arranca ANTES del salto
         a propósito: el segundo y medio del viaje es exactamente el tiempo
         que la red necesita, así que nadie espera dos veces. Todo lo que
         pasa al llegar —la bienvenida de AU-RA, la semilla recién acuñada,
         el cobro que esperaba— vive dentro de `aterrizar`: si corriera
         antes, la bienvenida se pintaría encima del viaje a medio volar.
         Con movimiento reducido no hay viaje: GALAXIA.saltar aterriza en
         seco, que es lo que esa preferencia pide. */
      cargarTodo();
      const aterrizar = () => {
        viajando = false;
        /* ENTRAR ES LLEGAR AL INICIO. La dirección conserva la última vista de
           la sesión anterior (#ajustes, #billetera…), y eso está bien para una
           RECARGA: quien refresca vuelve a donde estaba. Pero cruzar la puerta
           con usuario y contraseña es otra cosa: del otro lado está la galaxia,
           que es lo que el vuelo de la cámara acaba de prometer. Aterrizar en
           Ajustes rompía el viaje entero.
           Las intenciones de verdad —un cobro, una invitación de chat, una
           casa del ecosistema esperando su llave— se atienden más abajo y
           pisan esto con toda la razón. */
        vistaActual = 'nucleo';
        /* Si la sesión murió DURANTE el vuelo (un 401 en plena carga cierra
           la sesión y devuelve a la puerta), aterrizar en la app sería meter
           a la persona a un cascarón vacío: el aviso de «volvé a entrar» ya
           quedó puesto y ahí se termina el viaje. */
        if (!sesion) return;
        ir('app');
        /* La introduccion de AU-RA abre CADA entrada — es la puerta del
           ecosistema, y Jose la quiso siempre, con su SALTAR a la vista. El
           login es un gesto del dedo, asi que el audio puede arrancar solo.
           La unica excepcion es la frase semilla recien acunada: doce palabras
           que anotar ganan a cualquier bienvenida. */
        /* La intencion de la casa que mando a esta persona se retoma apenas hay sesion: esta
           persona vino de paso, no a pasear — y la bienvenida de AU-RA se calla
           en este viaje, que trece segundos de orbe delante de alguien que solo
           cruza el pasillo son un peaje. La unica excepcion es la cuenta recien
           creada: sin identidad verificada Genesis no va a dar el token, y sus
           doce palabras de respaldo ganan a cualquier redireccion. */
        const volviendoACasa = semillaNueva ? null : ssoDestino;
        ssoDestino = null;
        if (volviendoACasa) volverConLlave(volviendoACasa);
        // Y el cobro que esperaba en la puerta: DESPUES de la cartera, para que
        // la moneda exista cuando se intente elegir.
        if (cobroPendiente) {
          const c = cobroPendiente;
          cobroPendiente = null;
          cargarCartera().then(() => irACobro(c));
        }
        /* `volviendoACasa`, no `volviendoAOrdenex`: ese nombre no existió nunca
           y en modo estricto reventaba AQUI, el catch de abajo se tragaba el
           ReferenceError y lo pintaba como error de credenciales — el saludo de
           AU-RA no corrió ni una vez para quien entraba sin semilla. */
        if (!semillaNueva) {
          /* La bienvenida ocurre EN la galaxia, no encima de ella: se le da
             al vuelo el tiempo de aterrizar y AU-RA saluda sobre el cielo. */
          if (!volviendoACasa) setTimeout(() => auraBienvenidaGalaxia(true), 1500);
        }
        else setTimeout(auraOfrecerGid, 1200);
        // La frase se enseña ENCIMA de la billetera ya pintada, no antes de
        // entrar: quien la ve entiende que ya tiene cuenta y que esto es lo que
        // hay que guardar, no un tramite mas de la puerta.
        if (semillaNueva) setTimeout(() => mostrarSemilla(semillaNueva), 600);
        avisar(modo === 'crear' ? `${t('ok.creada')}, ${sesion.nombre.split(' ')[0]}` : `${t('ok.hola')}, ${sesion.nombre.split(' ')[0]}`);
      };
      viajando = true;
      /* EL VUELO. Con la puerta 3D viva no hay corte ninguno: la MISMA cámara
         que miraba el sistema desde el umbral vuela hasta el encuadre de casa.
         Crear cuenta desciende despacio (la fase de descubrimiento); iniciar
         sesión entra directo. AURA late más fuerte como bienvenida. El
         aterrizaje llega con el vuelo al 80%: la vista cambia debajo mientras
         la cámara sigue moviéndose y nadie ve la costura.

         Y LA PUERTA SE DISUELVE ENCIMA: el panel del formulario se desenfoca
         y se va mientras la cámara ya está viajando. Antes desaparecía de
         golpe justo antes del vuelo, y ese parpadeo era el único corte que
         quedaba en toda la entrada. */
      if (aetPuertaViva()) {
        $('#acceso')?.classList.add('se-va');
        AETHERION.entrar(modo === 'crear' ? 'descubrir' : 'directo', aterrizar);
      } else if (window.GALAXIA) GALAXIA.saltar(aterrizar); else aterrizar();
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
    // Se corta la escucha y cualquier llamada viva: una llamada que sobrevive
    // al cierre de sesión seguiría con el micrófono abierto.
    try { llamadaParar(); } catch {}
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
    /* Y la DIRECCIÓN también vuelve a cero. Sin esto, el #ajustes de la sesión
       que se cierra queda en la barra y el siguiente que entre —o esta misma
       persona— aterriza ahí en vez de en el Inicio. */
    try { history.replaceState(null, '', location.pathname + location.search); }
    catch { /* un navegador sin history no rompe la salida */ }
    /* El chat se va entero con su dueño: la lista de conversaciones de alguien
       no es lo primero que tiene que ver la persona siguiente. */
    chatParar();
    Object.assign(chatSt, { puerta: null, error: null, convs: null, con: null,
      msgs: null, busca: '', gente: null, ficha: null, yo: null,
      verCodigo: false, buscaMal: false });
    avisarChat = null; chatPendiente = null;
    try { localStorage.removeItem(LLAVE); } catch {}
    /* Al salir se vuelve AL LOGIN, no a la portada: quien cierra sesion casi
       siempre es para entrar con otra cuenta o para dejar el telefono limpio,
       y en los dos casos la pantalla util es la puerta, no el folleto. */
    ir('acceso', 'entrar');
  }

  // ── traer los datos ───────────────────────────────────────────────────────

  async function cargarTodo() {
    await Promise.allSettled([cargarCartera(), cargarIdentidad(), cargarMovimientos()]);
    // El precio se pone en vivo en cuanto hay cartera que actualizar.
    arrancarRelojPrecios();
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
  /* ═══ EL PRECIO, EN VIVO ══════════════════════════════════════════════════
     La billetera cargaba el precio del oro UNA vez, al abrir, y ahi se quedaba.
     Quien dejaba la pestaña abierta veia el oro de hace horas — y el
     patrimonio calculado con el.

     Esto lo refresca solo, y refresca SOLO EL PRECIO: no vuelve a leer los
     quince saldos de la cadena. Un saldo cambia cuando alguien mueve dinero
     —y entonces ya se recarga por su cuenta—; el precio cambia siempre. Pedir
     quince llamadas de RPC cada cuarenta segundos para enterarse de que el oro
     subio un centavo seria pagar el precio equivocado.

     Y se PARA con la pestaña escondida. Una billetera en una pestaña de fondo
     que sigue llamando a CoinGecko cada cuarenta segundos gasta bateria y
     cuota de rate limit para nadie. Al volver se refresca de inmediato, que es
     justo cuando importa. */
  const PRECIO_CADA_MS = 40_000;
  let relojPrecios = null;

  async function refrescarPrecios() {
    if (!cartera || !cartera.length) return;
    let p, chg;
    try { ({ p, chg } = await CADENA.precios()); } catch { return; }
    if (!p) return;
    // La onza del sorteo viaja gratis en este mismo ciclo: si el reloj de
    // precios ya la trajo, no hay que esperar al refresco lento del sorteo.
    if (p.AUKA > 0) sorteoOro = p.AUKA;
    let cambio = false;
    for (const m of cartera) {
      // El precio declarado por la Junta NO se toca: no sale de un feed y
      // pisarlo con un null del mercado seria borrar un dato bueno.
      if (m.declarado) continue;
      const nuevo = p[m.s];
      if (nuevo != null && nuevo > 0 && nuevo !== m.precio) { m.precio = nuevo; cambio = true; }
      const c = chg?.[m.s];
      if (c != null && c !== m.chg) { m.chg = c; cambio = true; }
    }
    // Se repinta solo si algo se movio, y solo en las pantallas donde el
    // precio se ve: repintar la de enviar en medio de una escritura no.
    if (cambio && !$('#app').classList.contains('oculto')
        && ['billetera', 'token', 'cambiar'].includes(vistaActual)) {
      vista(vistaActual, vistaDato);
    }
  }

  function arrancarRelojPrecios() {
    if (relojPrecios) return;
    relojPrecios = setInterval(() => {
      if (document.hidden) return;      // en una pestaña de fondo, nada
      refrescarPrecios();
    }, PRECIO_CADA_MS);
    // Al volver a la pestaña, de inmediato: es justo cuando importa.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refrescarPrecios();
    });
  }

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
      /* `portafolio()` NO lanza cuando falla un saldo suelto, a proposito: si
         lanzara, tres tokens caidos se llevarian por delante las doce lecturas
         buenas. Devuelve cada fila con `leido`, y es aca donde se decide si eso
         cuenta como una carga fallida: si no se pudo leer NI UNA, no hay
         cartera que enseñar y se dice, que es lo que hace alcanzable el bloque
         de «No pudimos leer tus saldos» que llevaba tiempo escrito sin que
         nadie pudiera llegar a el. */
      const ninguno = cartera.length && cartera.every(x => x.leido === false);
      if (ninguno) {
        errCartera = cartera.find(x => x.error)?.error || t('cta.sinSaldos');
        cartera = null;
        return;
      }
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
    nucleo, billetera, tarjeta: vTarjeta, cambiar, actividad, chat, ajustes, genesis,
    pay, payex, payneg, paycobro, paymio,
    enviar, recibir, comprar, deposito, token: vToken, identidad: vIdentidad,
    remesas, contactos, sesiones, lector, seguridad, perfil, verificar, cobrar,
    aucorp: vAucorp, ordenex: vOrdenex,
  };
  const PESTANAS = ['nucleo', 'billetera', 'tarjeta', 'cambiar', 'actividad', 'chat', 'ajustes'];
  // A que pestaña se le enciende la luz cuando estas en una vista que no es una.
  const DENTRO_DE = {
    enviar: 'billetera', recibir: 'billetera', comprar: 'billetera',
    deposito: 'billetera', token: 'billetera', identidad: 'ajustes',
    remesas: 'billetera', lector: 'billetera', verificar: 'ajustes', cobrar: 'billetera',
    pay: 'nucleo', payex: 'nucleo', payneg: 'nucleo', paycobro: 'nucleo', paymio: 'nucleo',
    aucorp: 'nucleo', ordenex: 'nucleo',
    genesis: 'nucleo',
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

  /* El dato con el que se pinto la vista actual —el simbolo en la ficha de un
     token, por ejemplo—. Se guarda para poder REPINTAR sin perderlo: sin esto,
     refrescar el precio en la ficha de ONDK la devolveria a la de ORIGEN. */
  let vistaDato = null;

  // ── el sorteo de 1 AUKA ───────────────────────────────────────────────────
  /* Tres semanas: del 19 de agosto al 9 de septiembre de 2026 a las 23:59 de
     Honduras (UTC−6). La fecha vive ACA y en las bases publicadas en
     /sorteo-orden-global — si un dia se mueve, se mueve en los dos sitios, o
     el banner promete algo que las bases niegan.

     El premio se dice como es: 1 AUKA SIGUE el precio de la onza de oro. La
     figura del metal no esta firmada y esta casa no escribe «respaldado»
     (Decision 4 de la Junta, expediente del 14/08). Y el precio que se enseña
     es el vivo de CADENA.precios(); si no llega, no se enseña numero — regla
     de la casa: ni un dato inventado. */
  const SORTEO_FIN = Date.UTC(2026, 8, 10, 5, 59, 59);   // 9-sep-2026 · 23:59:59 UTC−6
  const SORTEO_EN = ['billetera', 'actividad', 'cambiar', 'tarjeta'];
  let sorteoOro = null;          // la onza en USD, viva; null = no llego

  const sorteoRestante = () => SORTEO_FIN - Date.now();

  /* Pinta TODAS las cuentas atras y precios que haya en pantalla. Es una sola
     pasada barata que corre cada segundo y tras cada repintado de vista: los
     elementos se destruyen con cada innerHTML y la cuenta tiene que volver a
     aparecer sin esperar al siguiente tic. */
  function sorteoPinta() {
    const r = sorteoRestante();
    document.querySelectorAll('[data-sorteo-cuenta]').forEach(el => {
      if (r <= 0) { el.textContent = t('sor.cerro'); el.classList.add('sorteo-cerrado'); return; }
      const d = Math.floor(r / 864e5), h = Math.floor(r % 864e5 / 36e5),
            m = Math.floor(r % 36e5 / 6e4), s = Math.floor(r % 6e4 / 1e3);
      const dos = n => String(n).padStart(2, '0');
      el.innerHTML = `<b>${d}</b><i>d</i><b>${dos(h)}</b><i>h</i><b>${dos(m)}</b><i>m</i><b>${dos(s)}</b><i>s</i>`;
    });
    if (sorteoOro) {
      const loc = idiomaActivo() === 'en' ? 'en-US' : 'es-AR';
      const cifra = `USD ${Math.round(sorteoOro).toLocaleString(loc)}`;
      document.querySelectorAll('[data-sorteo-oro]').forEach(el => {
        el.textContent = `${t('sor.precio')} ${cifra}`;
      });
    }
  }

  /* Al cerrar el sorteo, las piezas fijas del HTML —la cinta de portada y la
     nota del formulario— se retiran solas. Los pedazos que pinta JS ya se
     guardan con sorteoRestante(); estos dos son los unicos que vivirian para
     siempre si nadie despliega el 10 de septiembre, con la portada
     prometiendo un sorteo que las bases dicen cerrado. */
  function sorteoCerrarPromos() {
    document.querySelectorAll('.sorteo-cinta, .acc-sorteo').forEach(el => el.remove());
  }

  function arrancarSorteo() {
    const oro = () => CADENA.precios().then(({ p }) => {
      if (p && p.AUKA > 0) { sorteoOro = p.AUKA; sorteoPinta(); }
    }).catch(() => {});
    if (sorteoRestante() <= 0) { sorteoCerrarPromos(); return; }
    sorteoPinta();
    oro();
    /* El tic respeta las reglas de la casa: con la pestaña escondida no corre
       —misma razon que relojPrecios: gasta bateria para nadie— y tras el
       cierre se para solo, retirando las promos si el cierre pillo la pestaña
       abierta. La onza se repide cada cinco minutos: una portada abierta dias
       con un precio congelado presentado como «hoy» seria un dato inventado
       por antiguedad. */
    let tics = 0;
    const reloj = setInterval(() => {
      if (document.hidden) return;
      sorteoPinta();
      if (sorteoRestante() <= 0) { sorteoCerrarPromos(); clearInterval(reloj); return; }
      if (++tics % 300 === 0) oro();
    }, 1000);
    // Al volver a la pestaña, la cuenta al dia de inmediato: es justo el
    // momento en que alguien la esta mirando.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) sorteoPinta();
    });
  }

  /* El banner de adentro. Con el tramite sin empezar invita; con el expediente
     entregado o aprobado lo dice y ya — un boton de «participar» encima de
     alguien que ya participa es la clase de mentira amable que este archivo
     jura no cometer. Y con `identidad` en null NO se opina: null es
     «cargando», no «sin verificar».

     Las bases piden identidad VERIFICADA, asi que aqui se habla en tres tonos
     y no en dos: aprobado es «estas participando»; en revision es «al
     aprobarse, tu GID es tu boleto» — prometer participacion sobre un
     expediente que un operador todavia puede rechazar es prometer lo que las
     bases niegan. Y «en revision» hereda las DOS excepciones de botonGid: con
     el rostro sin cotejar o el documento marcado invalido el expediente va
     derecho al rechazo, y el punto verde seria la mentira amable de siempre —
     a esa persona se le invita a terminar, no se le felicita. */
  function bannerSorteo() {
    if (sorteoRestante() <= 0) return '';
    if (!identidad || identidad.error) return '';
    const e = (identidad.estado || '').toLowerCase();
    // Una identidad suspendida no se arregla desde aca: la levanta un
    // operador. Invitarla a «verificarse» seria un boton a ninguna parte.
    if (e === 'suspendida') return '';
    const bases = `<a class="sb-bases" href="/sorteo-orden-global">${t('sor.mas18')}</a>`;
    const atorado = identidad.rostroPendiente ||
      (identidad.documentoAceptable === false && !identidad.documentoPorFotos);
    const enEspera = (e === 'en-revision' || e === 'biometria') && !atorado;
    if (esVerificada() || enEspera) return `
    <div class="sorteo-banner sb-dentro" role="note">
      <span class="sb-punto" aria-hidden="true"></span>
      <div class="sb-txt"><b>${t(esVerificada() ? 'sor.bannerOk' : 'sor.bannerRev')}</b>${identidad.gid ? ` <span class="mono sb-gid">${esc(identidad.gid)}</span>` : ''} ${bases}</div>
      <span class="sb-cuenta mono" data-sorteo-cuenta></span>
    </div>`;
    return `
    <div class="sorteo-banner" role="note">
      <div class="sb-txt"><b>${t('sor.banner')}</b><small>${t('sor.p')} ${bases}</small></div>
      <span class="sb-cuenta mono" data-sorteo-cuenta></span>
      <button class="btn btn-oro btn-sm" onclick="VETA.vista('verificar')">${t('sor.btn')}</button>
    </div>`;
  }

  /* Las vistas donde se mueve dinero. Con un visor puesto no se abre ninguna:
     firmar un envío con la cara tapada, sin leer la letra chica y sin teclado,
     es la clase de comodidad que termina en un arrepentimiento caro. */
  const SIN_VISOR = ['enviar', 'cobrar', 'cambiar', 'comprar', 'lector', 'mtp',
                     'tarjeta', 'llaves', 'seguridad', 'aucorp', 'ordenex'];

  function vista(cual, dato) {
    if (!VISTAS[cual]) cual = 'nucleo';
    if (window.VISOR?.activo()) {
      if (SIN_VISOR.includes(cual)) {
        avisar(t('vs.dineroNo'));
        try { window.__AE_VISOR?.negar?.(); } catch { /* nada */ }
        return;
      }
      /* Cualquier otra app SÍ se abre, pero el visor se quita primero. Las
         apps son pantallas planas y abrir una apaga el cielo 3D: si el modo
         siguiera puesto, quedaría un visor sin galaxia, sin menú y sin forma
         de salir. Se sale limpio y después se entra. */
      if (cual !== 'nucleo') window.VISOR.salir();
    }
    /* ── LA MÚSICA ES DEL INICIO ────────────────────────────────────────────
     *
     * La pista acompaña a la galaxia, no a la aplicación entera. Dentro de una
     * casa —la billetera, el chat, un cobro— sobra: ahí se está haciendo algo,
     * casi siempre con dinero, y una banda sonora encima de una pantalla de
     * enviar es exactamente el momento en que la música pasa de ambiente a
     * estorbo. Al volver al Inicio vuelve sola, sin que nadie toque nada.
     *
     * Se apaga con un fundido, no de golpe: un corte seco se oye como si algo
     * se hubiera roto. Y no se toca la DECISIÓN de la persona —quien la
     * silenció en Ajustes sigue con ella silenciada—: lo único que se mueve es
     * si suena ahora mismo. */
    musicaSegunVista(cual);

    vistaDato = dato ?? null;
    // Salir de la tarjeta borra el numero y el CVV de la memoria y la deja de
    // frente otra vez. Nadie tiene por que volver y encontrarselos puestos.
    if (vistaActual === 'tarjeta' && cual !== 'tarjeta') { secretoTarjeta = null; volteada = false; }
    if (vistaActual === 'lector' && cual !== 'lector') cerrarCamara();
    // El latido del chat solo late mientras el chat esta en pantalla: un
    // intervalo vivo en segundo plano es trafico que nadie mira.
    if (vistaActual === 'chat' && cual !== 'chat') {
      chatParar();
      /* Las capas de PULSE2CHAT cuelgan del body, así que no se van solas al
         repintar el lienzo: un visor de estados abierto seguiría tapando la
         billetera entera. */
      chatSt.viendo = null; chatSt.subeEstado = null;
      const capas = $('#p2c-capas');
      if (capas) capas.innerHTML = '';
    }
    // Salir de «enviar» cancela la intencion de publicar comprobante: la marca
    // no puede quedar esperando dias a un envio que ya es otro.
    if (vistaActual === 'enviar' && cual !== 'enviar') avisarChat = null;
    const veniaDe = vistaActual;
    vistaActual = cual;
    /* El botón de entrar en VR es del Inicio: el visor ES la galaxia, y
       ofrecerlo desde la billetera prometería un viaje que no sale de ahí. */
    pintarVR();
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
    /* El sorteo va encima de las vistas de dinero, no del Nucleo: el cerebro
       es la pantalla del asombro y un banner encima seria un cartel pegado en
       un cuadro. Y la cuenta atras se repinta ya mismo — el tic de un segundo
       llegaria tarde y el hueco parpadea. */
    if (SORTEO_EN.includes(cual)) l.insertAdjacentHTML('afterbegin', bannerSorteo());
    sorteoPinta();
    l.querySelectorAll('[data-al-cargar]').forEach(el => window[el.dataset.alCargar]?.(el));
    if (cual === 'recibir' || cual === 'deposito') pintarQr();
    if (cual === 'identidad') pintarCredencial();
    if (cual === 'cobrar') pintarCobro();
    if (cual === 'enviar') $('#env-monto')?.focus();
    if (cual === 'cambiar') cambioMonto();
    if (cual === 'tarjeta' && !tarjeta) cargarTarjeta().then(() => { if (vistaActual === 'tarjeta') vista('tarjeta'); });
    if (cual === 'remesas' && !tasas) cargarTasas().then(() => { if (vistaActual === 'remesas') vista('remesas'); });
    if (cual === 'chat') { p2cPortada(); chatEntrar(); } else p2cPortadaFuera();
    if (cual === 'token') montarVelasToken();
    else { velasApagar(); velasAmpliarCerrar(); }
    /* El cielo del Núcleo muere con su vista: si el canvas ya no está y la
       galaxia sigue enganchada a él, se apaga — el resto del interior tiene
       su fondo de siempre. */
    if (cual !== 'nucleo' && window.GALAXIA && GALAXIA.viva()
        && !document.getElementById('cielo-nucleo')) GALAXIA.apagar();
    /* El directorio de MyTokenPay se pide al ENTRAR, no al arrancar la web:
       ciento veintisiete comercios con su logo no tienen por que viajar por la
       red de alguien que solo venia a mirar su saldo. */
    if (cual === 'pay' || cual === 'payex' || cual === 'payneg') cargarComercios();
    if (cual === 'paycobro') $('#mtp-cod')?.focus();
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
    /* genesis también es cerebro: mismo cielo negro, misma respiración */
    document.body.classList.toggle('en-cerebro', cual === 'nucleo' || cual === 'genesis');
    /* PULSE2CHAT se queda con la pantalla entera. La billetera no desaparece
       —el riel y las pestañas siguen ahí— pero el fondo, el ancho y el relleno
       pasan a ser los suyos: dentro de su casa manda su marca. */
    document.body.classList.toggle('en-p2c', cual === 'chat');
    /* Las sugerencias de AU-RA son de la pantalla en la que estás, así que si
       la pantalla cambia con el panel abierto hay que volver a pintarlas. Sin
       esto quedaban las de la vista anterior: se entraba al chat y AU-RA
       seguía ofreciendo «Cobrame 25». */
    if (auraAbierta) pintarAura();
    /* Mientras la bienvenida esta encima, EL CEREBRO ES SUYO: hay una sola
       red y montarla de nuevo aqui la mataria. Pasaba de verdad — los datos
       terminaban de cargar, cargarTodo() repintaba la vista, y el cerebro de
       la bienvenida se quedaba congelado a media frase. Cuando la bienvenida
       se va, ella misma enciende el del Nucleo. */
    if (!$('#aura-bienvenida').classList.contains('oculto')) return;
    if (cual === 'nucleo') {
      // volver a Inicio baja el tono: el mismo aire del viaje, de regreso
      if (veniaDe && veniaDe !== 'nucleo') { try { TONO.zarpe(false); } catch { /* nada */ } }
      encenderInicio();
    }
    /* GENESIS CORE: el cerebro informativo respira con su vista. */
    gcCerrar();
    if (cual !== 'nucleo') aedCallar();
    if (cual === 'genesis') { AURA.pararRed(); encenderGenesis(); }
    else {
      try { window.CEREBRO_OG?.apagar(); } catch { /* nada */ }
      if (!document.getElementById('ae-casa')) delete window.__AE_VISTA;
    }
    /* El cielo 3D es del Inicio (y de la puerta): en cualquier otra vista se
       apaga DEL TODO — React quemando cuadros detrás de una billetera es
       batería tirada a la basura. */
    if (cual !== 'nucleo') {
      document.getElementById('ae-saludo')?.remove();
      if (window.AETHERION && document.getElementById('ae-casa')) {
        window.AETHERION.desmontar();
        const cielo = document.getElementById('ae-cielo');
        if (cielo) cielo.innerHTML = '';
        document.body.classList.remove('cielo-vivo');
      }
    }
    else { AURA.pararRed(); tourApagar(); }
    window.scrollTo(0, 0);
  }

  const ICO = {
    // la nota musical, para la fila de la música en Ajustes
    nota: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    // la chispa del origen, para la fila de la historia
    chispa: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/><circle cx="12" cy="12" r="2.6"/>',
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
          <b class="${cargando ? 'esqueleto' : ''}">${
            cargando ? '$0.00'
            /* `total()` devuelve null cuando no se leyo NI UN saldo. Un guion
               dice «no lo se»; un $0.00 diria «no tenes nada», que es la
               mentira mas cara que puede contar una billetera. */
            : total() == null ? '—'
            : tapa(usd(total()))}</b>
        </div>
        <svg viewBox="0 0 24 24" class="ojo-ic">${ocultos ? ICO.ojoNo : ICO.ojo}</svg>
      </button>
      <div class="saldo-fiat">
        ${!cargando && haySinLeer() ? `<span style="color:var(--coral)">${t('ini.saldosParciales')}</span>` : ''}
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

    /* SE LISTA LO PUBLICADO, Y ADEMAS LO QUE UNO TENGA.
     *
     * Nueve activos dejaron de publicarse. Quitarlos de la lista a secas le
     * borraria de la pantalla su dinero a quien tuviera saldo, y un saldo que
     * desaparece de la billetera es la clase de cosa que no se explica
     * despues. Asi que un despublicado con saldo se sigue viendo, marcado; uno
     * con saldo cero se va, porque ahi no hay nada que esconder. */
    const aLaVista = cartera.filter(x => x.publico !== false || (x.cant ?? 0) > 0);

    return aLaVista.map(x => {
      const valor = x.precio != null ? usd(x.cant * x.precio) : '—';
      const fuera = x.publico === false;
      const chg = x.chg != null
        ? `<span class="${x.chg < 0 ? 'px-baja' : 'px-sube'}">${x.chg > 0 ? '+' : ''}${x.chg.toFixed(2)}%</span>` : '';
      return `
      <button class="moneda" onclick="VETA.vista('token',${jsTxt(x.s)})"
              aria-label="${esc(x.n)}, ${esc(oro(x.cant))} ${x.s}">
        ${disco(x)}
        <div class="m-txt">
          <b>${esc(x.n)}${fuera ? `<span class="no-listado">${t('tok.noListado')}</span>` : ''}</b>
          ${/* El rotulo va PEGADO al numero, no en otra linea ni en la ficha
                de mas adentro: quien mira la lista ve el precio ahi y no entra
                a ninguna parte. Un precio declarado sin la palabra al lado se
                lee como cotizacion, y ONDK no cotiza. */''}
          <small>${x.precio != null ? esc(usd(x.precio)) : '—'} ${
            x.declarado ? `<span class="px-decl">${t('tok.decl')}</span>` : chg}</small>
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
          ${listo && sorteoRestante() > 0 ? `<p class="pie" style="margin-top:6px;color:var(--jade)">${t('sor.gidOk')}</p>` : ''}
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
    /* Lo que esta ficha cuenta — que es la moneda, a que esta referenciada, en
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
    const fueraDeLista = reg.publico === false;
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
          <h2>${esc(x.n)}${fueraDeLista ? `<span class="no-listado">${t('tok.noListado')}</span>` : ''}</h2>
          ${x.n === x.s ? '' : `<div class="sub mono">${x.s}</div>`}
        </div>
      </div>
      ${/* Si se llega aca es porque hay saldo. Se explica en la propia ficha
           que puede moverlo y que no puede comprar mas, para que nadie tenga
           que deducirlo de un boton que no aparece. */''}
      ${fueraDeLista ? `<div class="nota" style="margin-top:14px">${t('tok.noListadoP')}</div>` : ''}
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
      ${x.declarado ? `
        <div class="ficha-precio">
          <span>${t('tok.declT')} <b>${esc(usd(x.declarado.precio))}</b></span>
          <span class="pastilla decl-p">${esc(rell(t('tok.declActa'), {
            acta: x.declarado.acta, fecha: fechaCorta(x.declarado.fecha) }))}</span>
        </div>
        ${/* El porque, entero y sin manera de cerrarlo. No es letra chica: es
              la mitad del dato. El numero solo no dice de donde sale. */''}
        <p class="pie sin-precio">${t('tok.declPie')}</p>`
      : x.precio != null ? `
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
      ${CADENA.historiable(x.s) ? `
      ${/* LAS VELAS. El mismo motor que Ordenex (velas.js, copiado de alla) y
            la misma fuente: la ruta /referencia del API de la casa de cambio,
            que ya sirve la serie OHLC del metal con su rotulo de honestidad.
            A las monedas declaradas por acta no se les dibuja curva. */''}
      <div class="grf-marco">
        <div class="grf-cab">
          <span class="et">${t('grf.t')}</span>
          <span id="grf-var" class="pastilla oculto"></span>
          <div class="grf-rangos" role="tablist" aria-label="${t('grf.t')}">
            ${[['30m','1D'],['4h','1M'],['4d','1A']].map(([m, r]) =>
              `<button role="tab" data-m="${m}" aria-selected="${m === velasMarco}"
                 onclick="VETA.velasCambiar(${jsTxt(m)})">${r}</button>`).join('')}
          </div>
          <button class="grf-amp" onclick="VETA.velasAmpliar()" aria-label="${t('vls.ampliar')}"
                  title="${t('vls.ampliar')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
          </button>
        </div>
        <div id="grf-lienzo"><div class="grf-espera">${t('grf.carg')}</div></div>
        <p class="pie grf-fuente" id="grf-rotulo"></p>
      </div>` : ''}
      <p class="ficha-desc">${esc(f.d)}</p>
      <dl class="datos">
        ${filas.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="${k === t('tok.contrato') && !x.nativo ? 'mono' : ''}">${esc(v || '—')}</dd></div>`).join('')}
      </dl>
      ${x.nativo ? '' : `<button class="btn btn-linea btn-sm" onclick="VETA.copiarContrato(${jsTxt(x.contrato)})">
        <svg viewBox="0 0 24 24" class="btn-ic">${ICO.copiar}</svg>${t('tok.copiarC')}</button>`}
    </div>`;
  }

  /* ── las velas de la ficha ────────────────────────────────────────────────
     El marco elegido sobrevive a cambiar de moneda, para poder compararlas en
     el mismo encuadre. `velasVivas` es el apagador que devuelve enganchar():
     hay que llamarlo al irse, o quedan sondeo y listeners colgados de un
     canvas que ya no existe. `velasSerial` invalida las respuestas tardias:
     la curva de una moneda no puede aparecer bajo el nombre de otra. */
  let velasMarco = '4h';
  let velasVivas = null;      // apagador de la ficha
  let velasAmpliadas = null;  // apagador de la vista ampliada
  let velasSerial = 0;

  function velasApagar() {
    try { velasVivas?.(); } catch {}
    velasVivas = null;
  }

  function velasCambiar(marco) {
    velasMarco = marco;
    montarVelasToken();
    // La ampliada, si esta abierta, cambia de marco junto con la chica:
    // dos encuadres distintos de la misma moneda en pantalla seria un enredo.
    if (velasAmpliadas) { velasAmpliarCerrar(); velasAmpliar(); }
  }

  /* Enganchar un lienzo de velas a una moneda. Devuelve el apagador. */
  function velasEnganchar(canvas, sim, marco, alRotulo) {
    const serial = ++velasSerial;
    const apagar = VELAS.enganchar(canvas, async () => {
      const r = await CADENA.velasDe(sim, marco);
      if (serial !== velasSerial) return null;      // llego tarde: se descarta
      if (!r) throw new Error('sin velas');
      alRotulo?.(r);
      return {
        velas: r.velas,
        opciones: {
          unidad: 'USD',
          referencia: true,
          /* El ACTIVO, no un par: esta serie es el metal en dolares (o el
             ORIGEN derivado), no una cotizacion de la billetera. */
          par: sim,
          marco,
          rotulo: r.rotulo,
          decimales: sim === 'ORIGEN' ? 4 : 2,
          emas: [9, 21],
          idioma: idiomaActivo(),
        },
      };
    }, 30000);
    return apagar;
  }

  async function montarVelasToken() {
    const cont = $('#grf-lienzo');
    if (!cont) { velasApagar(); return; }
    const sim = tokenAbierto || 'ORIGEN';
    document.querySelectorAll('.grf-rangos [data-m]').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.m === velasMarco)));
    velasApagar();
    $('#grf-var')?.classList.add('oculto');

    /* El primer viaje se hace ANTES de montar el lienzo, porque enganchar()
       se traga los errores a proposito (un refresco fallido no borra la
       grafica que ya se ve) — pero en la PRIMERA carga eso dejaria un lienzo
       negro mudo. Si no hay datos, aviso y reintentar; si los hay, quedan en
       cache y el enganche arranca en caliente. */
    cont.innerHTML = `<div class="grf-espera">${t('grf.carg')}</div>`;
    const marco = velasMarco;
    const primero = await CADENA.velasDe(sim, marco);
    if (vistaActual !== 'token' || (tokenAbierto || 'ORIGEN') !== sim || velasMarco !== marco) return;
    const vivo = $('#grf-lienzo');
    if (!vivo) return;
    if (!primero) {
      vivo.innerHTML = `<div class="grf-espera">${t('grf.err')}
        <button class="btn btn-linea btn-sm" onclick="VETA.velasCambiar(${jsTxt(marco)})">${t('grf.reint')}</button></div>`;
      return;
    }
    const cont2 = vivo;

    cont2.innerHTML = `<canvas class="vls-lienzo" aria-label="${t('grf.t')} ${esc(sim)}"></canvas>
      <div class="grf-ctl">
        <button type="button" data-g="menos" aria-label="${t('grf.menos')}">−</button>
        <button type="button" data-g="mas" aria-label="${t('grf.mas')}">+</button>
        <button type="button" data-g="todo" aria-label="${t('grf.todo')}">⟲</button>
      </div>`;
    const canvas = cont2.querySelector('canvas');

    const apagar = velasEnganchar(canvas, sim, velasMarco, (r) => {
      const rot = $('#grf-rotulo');
      if (rot) rot.textContent = `${r.rotulo} ${t('vls.gestos')}`;
      /* La variacion del rango visible: primer abre vs ultimo cierre de la
         serie REAL. Con los colores de la casa. */
      const pv = $('#grf-var');
      if (pv && r.velas.length > 1) {
        const abre = r.velas[0][1], cierra = r.velas[r.velas.length - 1][4];
        if (abre > 0) {
          const cambio = (cierra - abre) / abre * 100;
          pv.textContent = `${cambio > 0 ? '+' : ''}${cambio.toFixed(2)}%`;
          pv.classList.remove('oculto', 'baja-p', 'sube-p');
          pv.classList.add(cambio < 0 ? 'baja-p' : 'sube-p');
        }
      }
    });
    cont2.querySelector('[data-g="mas"]').addEventListener('click', () => apagar.acercar());
    cont2.querySelector('[data-g="menos"]').addEventListener('click', () => apagar.alejar());
    cont2.querySelector('[data-g="todo"]').addEventListener('click', () => apagar.verTodo());
    velasVivas = apagar;
  }

  /* ── la vista ampliada ────────────────────────────────────────────────────
     Lo que pidio Jose: poder ver la grafica GRANDE. Es una capa a pantalla
     completa con su propio lienzo y su propio enganche — no se mueve el
     canvas chico, que al volver seguiria donde estaba. Se cierra con la X,
     con Escape o tocando el fondo. */
  function velasAmpliar() {
    if (velasAmpliadas) return;
    const sim = tokenAbierto || 'ORIGEN';
    const capa = document.createElement('div');
    capa.className = 'vls-capa';
    capa.innerHTML = `
      <div class="vls-grande" role="dialog" aria-label="${t('grf.t')} ${esc(sim)}">
        <div class="grf-cab">
          <b class="vls-titulo">${esc(sim)}</b>
          <span class="et">${t('grf.t')}</span>
          <div class="grf-rangos" role="tablist">
            ${[['30m','1D'],['4h','1M'],['4d','1A']].map(([m, r]) =>
              `<button role="tab" data-m="${m}" aria-selected="${m === velasMarco}">${r}</button>`).join('')}
          </div>
          <button class="grf-amp vls-cerrar" aria-label="${t('tok.volver')}">✕</button>
        </div>
        <div class="vls-cuerpo"><canvas class="vls-lienzo"></canvas>
          <div class="grf-ctl">
            <button type="button" data-g="menos" aria-label="${t('grf.menos')}">−</button>
            <button type="button" data-g="mas" aria-label="${t('grf.mas')}">+</button>
            <button type="button" data-g="todo" aria-label="${t('grf.todo')}">⟲</button>
          </div>
        </div>
        <p class="pie grf-fuente vls-rotulo"></p>
      </div>`;
    document.body.appendChild(capa);
    document.body.classList.add('sin-scroll');
    const canvas = capa.querySelector('canvas');
    const apagar = velasEnganchar(canvas, sim, velasMarco, (r) => {
      capa.querySelector('.vls-rotulo').textContent = `${r.rotulo} ${t('vls.gestos')}`;
    });
    capa.querySelectorAll('.grf-rangos [data-m]').forEach(b =>
      b.addEventListener('click', () => velasCambiar(b.dataset.m)));
    capa.querySelector('[data-g="mas"]').addEventListener('click', () => apagar.acercar());
    capa.querySelector('[data-g="menos"]').addEventListener('click', () => apagar.alejar());
    capa.querySelector('[data-g="todo"]').addEventListener('click', () => apagar.verTodo());
    const alEscape = e => { if (e.key === 'Escape') velasAmpliarCerrar(); };
    capa.addEventListener('click', e => {
      if (e.target === capa || e.target.closest('.vls-cerrar')) velasAmpliarCerrar();
    });
    document.addEventListener('keydown', alEscape);
    velasAmpliadas = () => {
      try { apagar(); } catch {}
      document.removeEventListener('keydown', alEscape);
      document.body.classList.remove('sin-scroll');
      capa.remove();
    };
  }

  function velasAmpliarCerrar() {
    velasAmpliadas?.();
    velasAmpliadas = null;
  }

  /* Activar los avisos del chat. La llave viene del relevo; los motivos de
     fallo se dicen con nombre propio, porque «no se pudo» no le sirve a nadie
     para arreglarlo. */
  async function chatAvisos() {
    const llave = await CHAT.llaveAvisos();
    if (!llave) return avisar(t('cha.avisosSinLlave'));
    const r = await CHAT.pedirAvisos(llave);
    if (r.ok) {
      $('#cha-avisos')?.classList.add('oculto');
      return avisar(t('cha.avisosOk'));
    }
    avisar(r.motivo === 'negado' ? t('cha.avisosNegado')
      : r.motivo === 'iphone-sin-instalar' ? t('cha.avisosIphone')
      : t('cha.avisosNo'));
  }

  const origen = () => (cartera || []).find(x => x.s === 'ORIGEN') || null;

  /* Lo que cuesta una transferencia nativa a 400 gwei por 21000 de gas. Es el
     mismo numero que usa el telefono como respaldo. Solo se usa para no dejar
     el saldo en cero al pulsar MAX: el importe real lo pone la cadena. */
  const COMISION_RED = 0.0084;

  /* Qué moneda se está enviando. Vive fuera de la vista porque la pantalla se
     redibuja entera al elegir otra y hay que acordarse de cuál era. */
  let envSim = 'ORIGEN';
  /* La direccion y la cantidad viven AQUI, no solo en el DOM.
     El fallo que esto arregla: llegar desde Ordenex rellenaba los campos a
     mano DESPUES de pintar, y cualquier repintado posterior —la cartera que
     termina de cargar y refresca los saldos de las fichas— los dejaba en
     blanco otra vez. Se veia como «me lleva a la wallet pero no sale la
     direccion»: la moneda si quedaba elegida (eso es estado del modulo) y la
     direccion no (eso era estado del DOM).
     Ahora el valor se DIBUJA desde aqui, asi que repintar lo conserva — y de
     paso tampoco se pierde lo que alguien estaba tecleando. */
  let envDir = '';
  let envCant = '';
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
          <input id="env-dir" class="mono" placeholder="0x…" autocomplete="off" spellcheck="false" required
                 value="${esc(envDir)}" oninput="VETA.envDirCambia(this.value)">
          ${contactos.length ? `<select class="env-contactos" onchange="VETA.envContacto(this.value); this.selectedIndex=0">
            <option value="">${t('env.contactos')}</option>
            ${contactos.map(c => `<option value="${esc(c.dir)}">${esc(c.nombre)}</option>`).join('')}
          </select>` : ''}
        </div>
        <div class="campo">
          <label for="env-monto">${t('env.cant')}</label>
          <div class="env-monto">
            <input id="env-monto" type="text" inputmode="decimal" placeholder="0,00"
                   value="${esc(envCant)}"
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
    envDir = dir;
    const c = $('#env-dir');
    if (c) { c.value = dir; $('#env-monto')?.focus(); }
  }

  // El eco del teclado al estado. Sin esto, repintar borraria lo tecleado.
  function envDirCambia(v) { envDir = String(v || ''); }

  // El maximo de un token es su saldo entero. En ORIGEN no: hay que dejar con
  // que pagar la comision, o el envio se cae despues de haberlo confirmado.
  function envMax() {
    const x = envActivo();
    if (!x || x.cant == null) return;
    const tope = x.nativo ? Math.max(0, x.cant - COMISION_RED) : x.cant;
    envCant = String(Number(tope.toFixed(6)));
    const c = $('#env-monto');
    if (c) { c.value = envCant; envMonto(); c.focus(); }
  }

  // El equivalente en dolares, debajo del campo, mientras se escribe. Sin
  // precio no se inventa nada: se deja el hueco vacio.
  function envMonto() {
    envCant = String($('#env-monto')?.value ?? envCant);
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
      bcTexto(b, t('env.confirmar'));
      return;
    }

    if (enviando) return;      // el candado: un doble toque no manda dos veces
    enviando = true;
    bcTrabajando(b);
    bcTexto(b, t('env.enviando'));
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
      /* El palomeo se dibuja AQUI y en ningun sitio antes: la cadena ya
         confirmo y el hash esta en la mano. Un palomeo un segundo antes le
         diria a alguien que su dinero salio cuando todavia no se sabe. */
      await bcHecho(b);
      a.innerHTML = `${t('env.hecho')} ${oro(monto)} ${esc(sim)}.${hash ? ` <span class="mono">${esc(cortaDir(hash))}</span>` : ''}`;
      envDir = ''; envCant = '';
      $('#env-dir').value = ''; $('#env-monto').value = ''; $('#env-clave').value = '';
      envMonto();
      bcTexto(b, t('env.revisar'));
      avisar(t('env.avHecho'));
      /* Si esto es una emergente de Ordenex, se le avisa y la ventana se va.
         Con `sim`, que se guardo ANTES de vaciar `pendiente` — leerlo de
         `pendiente` aqui reventaba con «null is not an object», y reventaba
         DESPUES de que el dinero ya habia salido: el envio se hacia y la
         pantalla decia error. La peor forma de fallar que hay. */
      avisarAlQueAbrio({ ok: true, hash, monto: String(monto), activo: sim || 'ORIGEN' });
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
      bcTexto(b, t('env.revisar'));
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

  /* LA CREDENCIAL. Verificarse cuesta documentos, una foto de la cara y días
     de espera; lo que se recibía a cambio era una etiqueta verde que decía
     «Verificada» sobre una tarjeta gris. Quien pasó por eso merece algo que se
     pueda ENSEÑAR: la foto, el nombre legal como está en el documento, el
     número, y el código para que lo comprueben delante tuyo.

     Tres cosas que NO lleva y no puede llevar:
      · una fecha de emisión — el puente no la manda, y ponerle una fecha
        inventada a un documento de identidad es exactamente la clase de cosa
        que convierte una credencial en un decorado;
      · una foto genérica si no hay foto — sin `fotoCredencial` va el monograma
        del nombre, que es verdad;
      · ni una palabra que insinúe que esto lo aprobó la app. Lo aprobó una
        persona del equipo de cumplimiento, del otro lado del puente.

     El código lleva el GID a secas: es lo que hay que teclear del otro lado
     para comprobarlo, y un enlace largo en un QR de una credencial solo sirve
     para que el que escanea no sepa qué está abriendo. */
  function credencial() {
    const gid = identidad?.gid;
    if (!gid) return '';
    const nombre = identidad?.nombreLegal || sesion?.nombre || '';
    const foto = identidad?.fotoCredencial;
    const inicial = (nombre.trim()[0] || '·').toUpperCase();
    return `
    <div class="pasaporte">
      <div class="pas-cab">
        <span class="pas-casa">ORDEN GLOBAL</span>
        <span class="pas-tipo">${t('id.credencial')}</span>
      </div>
      <div class="pas-cuerpo">
        <div class="pas-foto">${foto
          ? `<img src="${esc(foto)}" alt="">`
          : `<span class="pas-inicial">${esc(inicial)}</span>`}</div>
        <div class="pas-datos">
          <div class="pas-lbl">${t('id.aNombre')}</div>
          <div class="pas-nombre">${esc(nombre || '—')}</div>
          <div class="pas-lbl" style="margin-top:16px">${t('id.numero')}</div>
          <div class="pas-gid mono">${esc(gid)}</div>
          <button class="btn btn-linea btn-sm" style="margin-top:12px"
                  onclick="VETA.copiar(${jsTxt(gid)})">${t('id.copiarGid')}</button>
        </div>
        <div class="pas-qr">
          <div id="pas-codigo"></div>
          <small>${t('id.qrPie')}</small>
        </div>
      </div>
      <div class="pas-pie">
        <svg viewBox="0 0 24 24">${ICO.id}</svg>
        <span>${t('id.selloPie')}</span>
      </div>
    </div>`;
  }

  /* El código se pinta después, sobre el nodo ya puesto: armar un SVG de
     ciento y pico módulos dentro de la plantilla de texto haría la vista más
     lenta cada vez que se repinta, y esto se repinta con cada refresco de
     identidad. */
  function pintarCredencial() {
    const c = $('#pas-codigo');
    if (!c || !identidad?.gid) return;
    try { c.innerHTML = QR.svg(identidad.gid, { claro: '#F3ECD9', oscuro: '#021B1C', margen: 2 }); }
    catch { c.textContent = identidad.gid; }
  }

  function vIdentidad() {
    return `
    <div class="cab gid-cab">${selloGenesis(40)}<div><h2>Genesis ID</h2><div class="sub">${t('id.sub')}</div></div></div>
    ${esVerificada() ? credencial() : ''}
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

  /* Cuanto vale una foto ANTES de mandarla. La borrosa y la oscura son las dos
     causas de rechazo que mas se repiten, y las dos se ven en el momento con
     veinte lineas de aritmetica: el brillo es el promedio del gris, y el
     desenfoque se estima con la varianza del laplaciano —una foto nitida tiene
     bordes, y los bordes hacen saltar al laplaciano; una movida no los tiene.
     Se mide sobre una copia de 320 px porque a ese tamano el calculo es
     instantaneo y el veredicto es el mismo.

     NUNCA bloquea: es un consejo bajo la miniatura, no un portero. Una foto
     rara que pase igual la resuelve una persona, como siempre. */
  function medirCalidad(dataUrl) {
    return new Promise((listo) => {
      const img = new Image();
      img.onload = () => {
        try {
          const k = Math.min(1, 320 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
          const l = document.createElement('canvas');
          l.width = Math.max(8, Math.round((img.naturalWidth || 1) * k));
          l.height = Math.max(8, Math.round((img.naturalHeight || 1) * k));
          const cx = l.getContext('2d');
          cx.drawImage(img, 0, 0, l.width, l.height);
          const px = cx.getImageData(0, 0, l.width, l.height).data;
          const w = l.width, h = l.height;
          const g = new Float32Array(w * h);
          let suma = 0;
          for (let i = 0; i < w * h; i++) {
            const v = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
            g[i] = v; suma += v;
          }
          const brillo = suma / (w * h);
          let s1 = 0, s2 = 0, n = 0;
          for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
              const i = y * w + x;
              const lap = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
              s1 += lap; s2 += lap * lap; n++;
            }
          }
          const varianza = n ? (s2 / n) - (s1 / n) * (s1 / n) : 0;
          // Umbrales holgados a proposito: solo avisa lo claramente malo.
          listo({ borrosa: varianza < 60, oscura: brillo < 50, quemada: brillo > 228 });
        } catch { listo(null); }
      };
      img.onerror = () => listo(null);
      img.src = dataUrl;
    });
  }

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
      // El consejo de calidad de cada foto, y lo que el servidor leyo en el
      // frente. `lecturaAsumida` evita el bucle: se avisa UNA vez; si la
      // persona decide mandar igual, va, y lo mira el equipo.
      calidad: {}, lectura: null, lecturaAsumida: false,
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
    <div class="cab gid-cab">${selloGenesis(40)}<div><h2>${t('ver.t')}</h2><div class="sub">${t('ver.sub')}</div></div></div>
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

    ${sol.lectura ? `<div class="aviso aviso-mal" style="margin-top:12px">
      <b>${t('ver.lecT')}</b><br>
      ${sol.lectura.rostroEnFrente === false ? t('ver.lecRostro') + '<br>' : ''}
      ${sol.lectura.nombreConfirmado === false ? t('ver.lecNombre') + '<br>' : ''}
      ${t('ver.lecQue')}
    </div>` : ''}

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
      ${consejoCalidad(cual)}
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

  function consejoCalidad(cual) {
    const c = sol.calidad && sol.calidad[cual];
    if (!c) return '';
    const que = c.borrosa ? t('ver.qBorrosa') : c.oscura ? t('ver.qOscura') : c.quemada ? t('ver.qQuemada') : '';
    return que ? `<div class="aviso aviso-mal" style="margin-top:9px">${que}</div>` : '';
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
    sol.calidad[cual] = null;
    if (cual === 'frente') { sol.lectura = null; sol.lecturaAsumida = false; }
    if (sol[cual]) {
      const esta = sol[cual];
      medirCalidad(esta).then((c) => {
        // Si mientras se media ya cambiaron la foto, el consejo es de otra.
        if (sol && sol[cual] === esta) { sol.calidad[cual] = c; repintarCaptura(cual); }
      });
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

  /* El sello de Genesis ID — recreacion vectorial del logotipo oficial: el
     marco hexagonal en G, la i de identidad y la huella que se vuelve mano.
     Vive como funcion y no como archivo porque estas pantallas se arman con
     plantillas: asi el sello se pinta del tamano y color que pida cada sitio,
     y late (clase gid-late) donde hay que esperar. */
  function selloGenesis(px, extra) {
    return `<svg class="gid-sello ${extra || ''}" style="width:${px}px" viewBox="0 0 512 512" fill="none" aria-hidden="true">
      <path d="M 251.3 75.2 L 261.4 81 Q 232 64 202.6 81 L 100.4 140 Q 70.9 157 70.9 191 L 70.9 309 Q 70.9 343 100.4 360 L 202.6 419 Q 232 436 261.4 419 L 238.4 432.3" stroke="currentColor" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 354 124 Q 416 150 424 216 L 424 240" stroke="currentColor" stroke-width="54" stroke-linecap="round"/>
      <circle cx="272" cy="158" r="40" fill="currentColor"/>
      <rect x="236" y="212" width="70" height="122" rx="32" fill="currentColor"/>
      <circle cx="374" cy="302" r="15" fill="currentColor"/>
      <g stroke="currentColor" stroke-width="15" stroke-linecap="round" fill="none">
        <path d="M 342.8 284.0 A 36 36 0 1 1 338.8 309.5"/>
        <path d="M 333.0 261.0 A 58 58 0 1 1 316.6 310.1"/>
        <path d="M 331.6 234.2 A 80 80 0 1 1 294.2 307.6"/>
        <path d="M 377.9 413.9 A 112 112 0 0 1 272.5 349.3"/>
        <path d="M 369.3 437.9 A 136 136 0 0 1 251.8 361.6"/>
        <path d="M 360.1 461.4 A 160 160 0 0 1 232.7 377.1"/>
        <path d="M 348.4 484.2 A 184 184 0 0 1 214.7 394.0"/>
      </g>
    </svg>`;
  }

  function verEnviando() {
    return `
    <div class="cab gid-cab">${selloGenesis(40)}<div><h2>${t('ver.t')}</h2><div class="sub">${t('ver.sub')}</div></div></div>
    <div class="bloque vidrio">
      <div style="display:flex;justify-content:center;margin-bottom:16px">${selloGenesis(72, 'gid-late')}</div>
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

      /* EL SERVIDOR AHORA LEE EL FRENTE EN EL MOMENTO: busca la foto del
         titular y el nombre declarado impreso. Si algo no cuadra, se vuelve al
         paso del documento CON LA CAMARA TODAVIA EN LA MANO y se dice que —un
         rechazo del equipo tres dias despues no le sirve a nadie. Se avisa UNA
         sola vez: si la persona repite el envio sin cambiar la foto, va igual
         y lo resuelve el equipo. Nada se rechaza solo. */
      const lec = doc?.documento?.lectura || null;
      if (porFotos && lec && !sol.lecturaAsumida &&
          (lec.rostroEnFrente === false || lec.nombreConfirmado === false)) {
        sol.lectura = lec;
        sol.lecturaAsumida = true;
        sol.paso = 2;
        return;
      }
      sol.lectura = null;

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
    /* `aceptable: false` puede llegar con la lista de problemas VACIA — el
       servidor rechaza sin detallar—. Mirar solo la lista pintaba el bloque
       de exito (y ahora ademas el boleto del sorteo) sobre un documento
       rechazado. El rechazo manda aunque venga mudo. */
    const rechazado = sol.resultado?.aceptable === false;
    const rostroMal = Boolean(identidad?.rostroPendiente);
    // Lo que dijo el cotejo del rostro, con sus palabras. Un «repetir la foto»
    // a secas deja a la persona mandando la misma otra vez.
    const motivo = sol.resultado?.rostro || '';
    const porFotos = Boolean(sol.resultado?.porFotos);
    return `
    <div class="cab gid-cab">${selloGenesis(40)}<div><h2>${t('ver.t')}</h2><div class="sub">${t('ver.sub')}</div></div></div>

    ${problemas.length || rechazado ? `
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

    ${!problemas.length && !rechazado && !rostroMal && !porFotos ? `
      <div class="bloque vidrio">
        <h3>${t('ver.listoT')}</h3>
        <p class="pie" style="margin-top:8px">${t('ver.listoP')}</p>
      </div>` : ''}

    ${!problemas.length && !rechazado && !rostroMal && sorteoRestante() > 0 ? `
      <div class="bloque vidrio sorteo-boleto">
        <h3>${t('sor.boletoT')}</h3>
        <p class="pie" style="margin-top:8px">${t('sor.boletoP')} <a class="sb-bases" href="/sorteo-orden-global">${t('sor.mas18')}</a></p>
        <div class="sb-cuenta mono" data-sorteo-cuenta style="margin-top:14px"></div>
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
            <span class="tar-visa">VISA</span>
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
    const destino = (cartera || []).find(x => x.s === (destinoCambio || 'AUKA') && x.publico !== false)
      || (cartera || []).find(x => x.s === 'AUKA') || null;
    const tasa = de?.precio && destino?.precio ? de.precio / destino.precio : null;
    /* Cambiar solo ofrece lo publicado. Aqui no vale el «tengo saldo, dejame
       verlo» de la lista: una cosa es no esconderle a alguien lo que tiene, y
       otra ofrecerle comprar mas de algo que se dejo de publicar. */
    const otros = (cartera || []).filter(x => x.s !== 'ORIGEN' && x.publico !== false);
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
        ${fila(ICO.chispa || ICO.obra, t('gen.aj'), t('gen.ajP'), "VETA.tourGenesis('boton')")}
        ${fila(ICO.nota || ICO.obra, t('mus.aj'), t('mus.ajP'), "VETA.musicaAlterna()")}
        ${fila(ICO.chispa || ICO.obra, t('ver.aj'), `${VETA_V} · ${VETA_FECHA}`, "VETA.versionMirar()")}
        ${fila(ICO.tienda, t('aj.mtp'), t('aj.mtpP'), "VETA.vista('pay')")}
        ${fila(ICO.globo, t('aj.idioma'), t('aj.idiomaP'), "VETA.idioma('" + (idiomaActivo() === 'es' ? 'en' : 'es') + "')")}
        ${fila(ICO.doc, t('aj.legal'), t('aj.legalP'), "window.open('/terminos','_blank','noopener')")}
      </div>
    </div>

    <div class="bloque vidrio">
      <h3>${t('vs.t')}</h3>
      <div class="vs-caja" id="vs-caja" data-al-cargar="VETA_vsPintar">
        <div class="vs-estado"><i></i><span>${t('vs.buscando')}</span></div>
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
    /* GENESIS CORE: la memoria viva del ecosistema. No mueve dinero: cuenta
       — qué es cada casa, la cadena, ORIGEN y AUKA con las palabras exactas
       de la Junta. Es el cerebro de siempre, ahora al servicio de quien
       recién llega. */
    { id: 'genesis', x: 14, y: 49, tam: 0.62, va: 'genesis',
      grad: ['#DFF3E9', '#6FBFAA', '#0F3A33'], halo: '#8FE6CE', lente: '#04211C',
      ico: '<circle cx="12" cy="12" r="2.6"/><path d="M12 9.4V5M12 14.6V19M9.4 12H5M14.6 12H19"/><circle cx="12" cy="3.6" r="1.3"/><circle cx="12" cy="20.4" r="1.3"/><circle cx="3.6" cy="12" r="1.3"/><circle cx="20.4" cy="12" r="1.3"/><path d="M10.2 10.2 7 7M13.8 10.2 17 7M10.2 13.8 7 17M13.8 13.8 17 17"/>' },
    { id: 'ajustes', x: 82, y: 81, tam: 0.68, va: 'ajustes',
      grad: ['#E4E8EE', '#93A0AE', '#2E3844'], halo: '#A9B6C4', lente: '#0C1116',
      ico: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>' },
    { id: 'scan', x: 50, y: 12, tam: 0.60, fuera: 'https://ordenscan.com',
      grad: ['#D6F3EC', '#74E6C8', '#1B5A50'], halo: '#74E6C8', lente: '#07211D',
      ico: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 9h10M7 13h6M7 17h8"/>' },
    /* AuCorp ya abre: la esfera deja el «pronto» igual que hizo Ordenex. Sigue
       en oro viejo apagado —es la casa de cuentas, familia del oro— pero
       ahora es una puerta. */
    { id: 'aucorp', x: 50, y: 86, tam: 0.60, va: 'aucorp',
      grad: ['#E8E0C8', '#A5936A', '#463B24'], halo: '#CBBB8C', lente: '#141007',
      logo: 'assets/apps/aucorp.png', zoom: 1.5,
      ico: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20M6 15h4"/>' },
    /* Ordenexchange ya abre: la esfera deja el «pronto» y se vuelve una
       puerta de verdad, con el mismo patron que ORDENSCAN — un destino de
       fuera. Se abre la PORTADA y no un enlace con token: el SSO arranca del
       lado de Ordenex (su boton de entrar manda a #sso-ordenex y este
       arranque devuelve a la gente ya con su llave — ver volverConLlave), y
       acuñar un token de paso por cada mirada al mercado seria gastar llaves
       que nadie pidio. */
    { id: 'oxch', x: 86, y: 49, tam: 0.52, va: 'ordenex',
      grad: ['#DCD4F2', '#8D7EC9', '#372B63'], halo: '#A99CDE', lente: '#0D0A1D',
      ico: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>' },
    /* LAS DOS QUE TODAVÍA NO ABREN, y que están a la vista a propósito.
       Son las dos piezas que contestan las preguntas que cualquiera hace
       primero: «¿qué hay detrás de esto?» —las minas— y «¿bajo qué reglas?»
       —DBNX—. Enseñarlas cerradas, diciendo honestamente que falta, cuenta
       muchísimo más que esconderlas hasta el día que abran: el ecosistema se
       entiende por su forma entera, no por lo que ya está terminado. */
    { id: 'minas', x: 30, y: 64, tam: 0.56, pronto: 'minas',
      grad: ['#F0DFB4', '#B8894A', '#4A3218'], halo: '#D8B87A', lente: '#160E05',
      ico: '<path d="M2.5 19.5h19L14.6 6.2l-3.3 5.6-2.4-3z"/><path d="M9.6 16l2.2-3.3 2.2 3.3"/>' },
    { id: 'dbnx', x: 70, y: 64, tam: 0.54, pronto: 'dbnx',
      grad: ['#DCE6F2', '#7A90AE', '#2A3852'], halo: '#9FB6D4', lente: '#080D16',
      ico: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M3.5 9.4h17M3.5 15h17M9.4 3.5v17M15 3.5v17"/>' },
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
       AuCorp (entonces AUBANK)— caían DEBAJO de esa banda y en un teléfono chico no se podían
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
      ${/* El firmamento del Núcleo: el MISMO motor de la entrada, en modo
            interior (transparente, estrellas serenas, fugaces). Es lo que
            hace que el login y la casa sean UNA sola galaxia. */''}
      <canvas id="cielo-nucleo" aria-hidden="true"></canvas>
      <canvas id="red-nucleo"></canvas>
      <div class="cerebro-cab">
        <h2>${nombre ? `${t('nu.hola')}, ${esc(nombre)}` : t('nu.t')}</h2>
        <div class="sub">${t('nu.sub')}</div>
      </div>
      ${esferas}
      <div class="cerebro-pie">
        <!-- El sello de la cadena vive ABAJO, y no en la cabecera flotante:
             ahí arriba caía justo encima de la esfera de PULSE2CHAT y se comía
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
       AuCorp (entonces AUBANK) en un 360x740 —el centro del botón seguía libre, pero el nombre
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

  /* ═══ GENESIS CORE ═══════════════════════════════════════════════════════
     El cerebro que armamos para el Núcleo clásico —el cielo interior de la
     galaxia 2D y la red neuronal de AURA— puesto al servicio de contar el
     ecosistema. Cada tema es un ganglio con la MISMA esfera del Núcleo (por
     eso AIR TOUCH ya sabe mirarlas: son .nu-mundo), y tocarlo abre su hoja.
     Ni un dato inventado: cada texto dice lo que la casa puede sostener. */
  /* Los ocho temas, repartidos por la anatomía: Orden Global en el frontal
     (lo que decide), la cadena y ORIGEN en los parietales (lo que sostiene),
     AUKA y Veta Wallet en los temporales (lo que se usa a diario), Genesis ID
     en el occipital (lo que reconoce), PULSE2CHAT en el otro temporal (lo que
     habla) y AU-RA en el tronco: por ahí pasa todo. */
  const GC_TEMAS = [
    { id: 'og',     centro: [0, -40, 88],   tinte: '#EAD79C' },
    { id: 'cadena', centro: [-62, -34, 14], tinte: '#74E6C8' },
    { id: 'origen', centro: [62, -34, 14],  tinte: '#EAD79C' },
    { id: 'auka',   centro: [-52, 18, 58],  tinte: '#D9C489' },
    { id: 'veta',   centro: [52, 18, 58],   tinte: '#EAD79C' },
    { id: 'gid',    centro: [0, -30, -92],  tinte: '#7FD8C4' },
    { id: 'p2c',    centro: [-56, 26, -46], tinte: '#E0937A' },
    { id: 'aura',   centro: [0, 62, -40],   tinte: '#8FE6CE' },
    /* Las casas que faltaban y lo que la gente pregunta de verdad: dónde se
       mira la cadena, dónde se cobra, dónde se cambia, las cuentas, la tarjeta y
       —lo más importante de todo— de quién es la llave. */
    { id: 'scan',   centro: [-26, -60, 72],  tinte: '#74E6C8' },
    { id: 'pay',    centro: [40, -52, 52],   tinte: '#5FC6EA' },
    { id: 'oxch',   centro: [72, 6, -22],    tinte: '#A99CDE' },
    { id: 'aucorp', centro: [-72, 6, -22],   tinte: '#CBBB8C' },
    { id: 'tarjeta',centro: [30, 40, 4],     tinte: '#EAD79C' },
    { id: 'llave',  centro: [-30, 40, 4],    tinte: '#E8C56A' },
  ];

  const GC_ICO = {
    og: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17M6 6.5c3.5 2.6 8.5 2.6 12 0M6 17.5c3.5-2.6 8.5-2.6 12 0"/>',
    cadena: '<rect x="3" y="9" width="6" height="6" rx="1.4"/><rect x="15" y="9" width="6" height="6" rx="1.4"/><path d="M9 12h6"/>',
    origen: '<path d="M7 4h10l4 6-9 10L3 10z"/><path d="M3 10h18M12 20 8.5 10l2-6M12 20l3.5-10-2-6"/>',
    auka: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 15.5 12 7l3.5 8.5M9.8 13h4.4"/>',
    veta: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1"/><rect x="3" y="8" width="18" height="11" rx="2.5"/><circle cx="16.5" cy="13.5" r="1.3"/>',
    gid: '<path d="M12 3l8 3.5v5c0 5-3.4 8.6-8 9.5-4.6-.9-8-4.5-8-9.5v-5z"/><path d="M9 12l2 2 4-4"/>',
    p2c: '<path d="M3.5 6.6h12.2v8.2H8.1L4.4 18v-3.2H3.5z"/><path d="M18.6 9.4h1.9v8.2h-.9V20l-3-2.4H12"/>',
    aura: '<circle cx="12" cy="12" r="3.4"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8"/>',
    scan: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 9h10M7 13h6M7 17h8"/>',
    pay: '<path d="M4 9h16l-1.2 11.2H5.2z"/><path d="M8.4 9V6.6a3.6 3.6 0 0 1 7.2 0V9"/>',
    oxch: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    aucorp: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20M6 15h4"/>',
    tarjeta: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20M6 15h5"/><circle cx="17" cy="15" r="1.6"/>',
    llave: '<circle cx="8" cy="12" r="3.4"/><path d="M11.4 12H21M18 12v3.4M15 12v2.4"/>',
  };

  const GC_COLOR = {
    og:     { grad: ['#F8EFCF', '#DFC078', '#96793F'], lente: '#05201B' },
    cadena: { grad: ['#D6F3EC', '#74E6C8', '#1B5A50'], lente: '#07211D' },
    origen: { grad: ['#F8EFCF', '#DFC078', '#96793F'], lente: '#141007' },
    auka:   { grad: ['#EFE6C9', '#CBB273', '#6E5A2E'], lente: '#120E05' },
    veta:   { grad: ['#F8EFCF', '#DFC078', '#96793F'], lente: '#05201B' },
    gid:    { grad: ['#D6EBE2', '#63A493', '#123B39'], lente: '#062123' },
    p2c:    { grad: ['#FBE0D4', '#E0937A', '#8A4A38'], lente: '#20100A' },
    aura:   { grad: ['#E6F2EE', '#7ED8C4', '#123B39'], lente: '#04211C' },
    scan:   { grad: ['#D6F3EC', '#74E6C8', '#1B5A50'], lente: '#07211D' },
    pay:    { grad: ['#D8F7FF', '#5FC6EA', '#453398'], lente: '#0A0812' },
    oxch:   { grad: ['#DCD4F2', '#8D7EC9', '#372B63'], lente: '#0D0A1D' },
    aucorp: { grad: ['#E8E0C8', '#A5936A', '#463B24'], lente: '#141007' },
    tarjeta:{ grad: ['#F8EFCF', '#DFC078', '#96793F'], lente: '#05201B' },
    llave:  { grad: ['#F6E7B8', '#C9A961', '#5B4A22'], lente: '#120E05' },
  };

  function genesis() {
    const esferas = GC_TEMAS.map((m) => {
      const c = GC_COLOR[m.id];
      return `
      <button class="nu-mundo" data-tema="${m.id}"
              style="--t:.66;--g1:${c.grad[0]};--g2:${c.grad[1]};--g3:${c.grad[2]};
                     --halo:${m.tinte};--lente:${c.lente}"
              onclick="VETA.gcAbrir(${jsTxt(m.id)})"
              aria-label="${esc(t('gc.' + m.id))}">
        <span class="nu-esfera"><span class="nu-lente"><svg viewBox="0 0 24 24">${GC_ICO[m.id]}</svg></span></span>
        <span class="nu-nombre">${esc(t('gc.' + m.id))}</span>
      </button>`;
    }).join('');
    return `
    <div class="cerebro" id="cerebro">
      <canvas id="cielo-nucleo" aria-hidden="true"></canvas>
      <div class="cerebro-cab">
        <h2>GENESIS CORE</h2>
        <div class="sub">${t('gc.sub')}</div>
      </div>
      <div id="gc-caja">
        <canvas id="gc-lienzo" aria-hidden="true"></canvas>
        ${esferas}
        <!-- El mismo timón de la galaxia: acercar, alejar y volver al centro.
             Girar ya se hace con el dedo; esto es lo que faltaba. -->
        <div class="ae-timon gc-timon">
          <button type="button" aria-label="${esc(t('gc.acercar'))}" onclick="VETA.gcZoom(1)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"
              fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
          </button>
          <button type="button" aria-label="${esc(t('gc.alejar'))}" onclick="VETA.gcZoom(-1)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"
              fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
          </button>
          <button type="button" aria-label="${esc(t('gc.centrar'))}" onclick="VETA.gcZoom(0)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"
              fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"
              fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
      <div class="cerebro-pie">
        <a class="nu-power" href="https://ordenscan.com" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5z"/></svg>
          <span class="nup-txt"><b>${t('nu.powerT')}</b><small>${t('nu.powerP')}</small></span>
        </a>
      </div>
    </div>`;
  }

  function encenderGenesis() {
    const lienzo = $('#gc-lienzo');
    if (!lienzo || !window.CEREBRO_OG) return;
    if (window.GALAXIA) GALAXIA.montar($('#cielo-nucleo'), { interior: true });
    medirCerebro();
    /* Los ganglios son los botones del DOM: se le entregan al motor y él los
       coloca en cada cuadro sobre su punto del volumen. */
    const temas = GC_TEMAS.map(m => ({
      ...m,
      el: document.querySelector(`.nu-mundo[data-tema="${m.id}"]`),
    }));
    const mando = CEREBRO_OG.montar(lienzo, temas);
    /* El mando se publica en el MISMO sitio que el de la galaxia: así la mano
       abierta de AIR TOUCH acerca y aleja aquí sin enterarse de que cambió de
       escena, y los botones de arriba hablan con quien esté montado. */
    if (mando) window.__AE_VISTA = mando;
  }

  function gcZoom(dir) {
    const m = window.CEREBRO_OG?.mando();
    if (!m) return;
    if (dir > 0) m.acercar(); else if (dir < 0) m.alejar(); else m.centrar();
    try { TONO.clic(); } catch { /* nada */ }
  }

  /* La hoja de lectura de un tema. Se cierra tocando afuera, con su botón o
     con Escape — y AIR TOUCH la desplaza como a cualquier otra hoja. */
  function gcAbrir(id) {
    if (AURA.jalando()) return;
    if (!GC_TEMAS.some(m => m.id === id)) return;
    /* El cerebro enciende la región de este tema mientras se lee: se ve de
       dónde sale lo que se está contando. */
    try { window.CEREBRO_OG?.mando()?.elegir(id); } catch { /* nada */ }
    try { TONO.clic(); } catch { /* nada */ }
    $('#gc-hoja')?.remove();
    const caja = document.createElement('div');
    caja.className = 'gc-hoja'; caja.id = 'gc-hoja';
    caja.innerHTML = `
      <div class="gc-carta vidrio" role="dialog" aria-modal="true" aria-label="${esc(t('gc.' + id))}">
        <small>GENESIS CORE</small>
        <h3>${esc(t('gc.' + id))}</h3>
        ${t('gc.' + id + '.txt').split('\n').map(p => `<p>${esc(p)}</p>`).join('')}
        <button class="btn btn-linea btn-sm" onclick="VETA.gcCerrar()">${t('gc.cerrar')}</button>
      </div>`;
    caja.addEventListener('click', (e) => { if (e.target === caja) gcCerrar(); });
    document.body.appendChild(caja);
  }
  function gcCerrar() {
    $('#gc-hoja')?.remove();
    try { window.CEREBRO_OG?.mando()?.elegir(null); } catch { /* nada */ }
  }

  function encenderCerebro(despertar) {
    const c = $('#red-nucleo');
    if (!c) return;
    if (window.GALAXIA) GALAXIA.montar($('#cielo-nucleo'), { interior: true });
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
  /* ── EL MARCO DE CASA ────────────────────────────────────────────────────
   * AuCorp y Ordenex son plataformas enteras con su propio dominio. Antes se
   * abrían en otra pestaña — y desde la galaxia eso se moría en silencio: el
   * viaje de entrada termina FUERA del gesto del usuario, y un window.open
   * sin gesto es una pestaña que el navegador bloquea sin decir nada. La
   * persona veía la entrada, y del otro lado, nada. «Pegado».
   *
   * Ahora la casa se abre ADENTRO, en su marco: cabecera con su nombre, la
   * plataforma llenando el resto, y la salida siempre a la vista. AuCorp
   * dejó su portón enmarcable solo para nosotros (frame-ancestors con la
   * lista de la wallet) — cualquier otro sitio sigue sin poder meterla en un
   * iframe. */
  const CASAS_MARCO = {
    aucorp: { nombre: 'AuCorp', url: () => URL_AUCORP, logo: 'assets/apps/aucorp.png' },
    ordenex: { nombre: 'Ordenexchange', url: () => URL_ORDENEX, logo: null },
  };

  function marcoCasa(id) {
    const c = CASAS_MARCO[id];
    const u = c.url();
    return `
    <section class="marco-casa" data-al-cargar="VETA_marcoVivo">
      <header class="marco-techo">
        <button class="marco-atras" onclick="VETA.vista('nucleo')" aria-label="${t('marco.atras')}">←</button>
        ${c.logo ? `<img class="marco-logo" src="${c.logo}" alt="">` : ''}
        <b>${c.nombre}</b>
        <span class="marco-alas"></span>
        <a class="btn btn-linea btn-sm" href="${esc(u)}" target="_blank" rel="noopener">${t('marco.pestana')}</a>
      </header>
      <div class="marco-cuerpo">
        <div class="marco-carga"><span></span>${t('marco.cargando')}</div>
        <iframe class="marco-hoja" src="${esc(u)}" title="${c.nombre}"
                allow="clipboard-write" referrerpolicy="strict-origin-when-cross-origin"></iframe>
      </div>
    </section>`;
  }
  /* Declaradas —no const—: el registro de VISTAS se evalúa mucho antes de
     llegar aquí, y solo la función izada sobrevive a ese orden. */
  function vAucorp() { return marcoCasa('aucorp'); }
  function vOrdenex() { return marcoCasa('ordenex'); }

  /* El cartel de carga se retira cuando la casa de adentro respira. Si en 15
     segundos no respiró, se dice —con un botón de verdad, que sí puede abrir
     pestaña porque ES un gesto— en vez de dejar a alguien mirando un anillo
     que gira para siempre. */
  /* ── ¿LA CASA DE ADENTRO CARGÓ DE VERDAD? ────────────────────────────────
   *
   * `load` NO alcanza, y este es el fallo que dejaba un rectángulo gris con
   * una hoja rota donde tenía que estar Ordenex: cuando el navegador no
   * consigue la página, pinta SU PROPIA página de error dentro del marco —
   * y esa página también dispara `load`. Nosotros lo tomábamos por éxito,
   * quitábamos el velo y la persona se quedaba mirando el gris.
   *
   * La forma de distinguirlas sin poder leer el contenido: una página que
   * cargó de verdad es de OTRO ORIGEN, y tocar su documento lanza una
   * excepción de seguridad. La página de error del navegador, en cambio, se
   * deja tocar —es un documento vacío del propio navegador—. Así que se
   * intenta leerlo: si LANZA, cargó; si se deja leer y está vacío, falló.
   *
   * Y el vigía no se cancela con `load`: se cancela cuando esa comprobación
   * dice que sí. Un aviso honesto con su botón vale más que un gris. */
  function marcoVivo(sec) {
    const marco = sec.closest ? sec : document.querySelector('.marco-casa');
    const hoja = marco.querySelector('.marco-hoja');
    const carga = marco.querySelector('.marco-carga');
    let resuelto = false;

    const rendirse = () => {
      if (resuelto || !carga.isConnected) return;
      resuelto = true;
      carga.innerHTML = `${esc(t('marco.noRespira'))}
        <a class="btn btn-oro btn-sm" style="margin-top:12px"
           href="${esc(hoja.src)}" target="_blank" rel="noopener">${esc(t('marco.pestana'))}</a>`;
    };

    const cargoDeVerdad = () => {
      try {
        const d = hoja.contentDocument;
        /* null = otro origen y el navegador ni lo entrega: cargó bien. */
        if (d === null) return true;
        /* Se deja leer: o no navegó todavía, o es la página de error del
           propio navegador. Las dos cosas son «no cargó». */
        return !(d.location.href === 'about:blank' || !d.body || d.body.childElementCount === 0);
      } catch {
        // la excepción de seguridad ES la buena noticia: hay otra casa dentro
        return true;
      }
    };

    const mirar = () => {
      if (resuelto) return;
      if (cargoDeVerdad()) {
        resuelto = true;
        clearTimeout(reloj);
        clearInterval(latido);
        carga.remove();
        hoja.classList.add('viva');
      }
    };

    /* Se comprueba al cargar Y cada medio segundo: algunos navegadores no
       disparan `load` para un marco que falló, y quedarse esperando ese
       evento es quedarse esperando para siempre. */
    hoja.addEventListener('load', mirar);
    const latido = setInterval(mirar, 500);
    const reloj = setTimeout(() => { clearInterval(latido); rendirse(); }, 9000);
  }
  window.VETA_marcoVivo = marcoVivo;

  /* ── LA CASA QUE TODAVÍA NO ABRE ─────────────────────────────────────────
   *
   * Un aviso de esquina que dice «todavía no» es una puerta cerrada sin nota.
   * Estas dos casas contestan las dos preguntas que cualquiera hace primero
   * —qué respalda esto, y bajo qué reglas—, así que tocarlas tiene que DECIR
   * algo, aunque lo que diga sea que falta. Se enseña qué es la casa, qué va a
   * traer, y se admite sin vueltas que aún no está. Prometer poco y decirlo
   * claro es lo que hace que valga la pena volver.
   */
  function prontoMirar(m) {
    const capa = document.createElement('div');
    capa.className = 'puerta-afuera';
    const g = m.grad || ['#F8EFCF', '#C9A961', '#5C4A22'];
    capa.innerHTML = `<div class="vidrio pronto-ficha" style="max-width:420px">
      <div class="pronto-orbe" style="background:radial-gradient(circle at 34% 30%,
        ${esc(g[0])} 0%, ${esc(g[1])} 46%, ${esc(g[2])} 100%);
        box-shadow:0 0 34px ${esc(m.halo || g[1])}55">
        <svg viewBox="0 0 24 24" aria-hidden="true">${m.ico || ''}</svg>
      </div>
      <h3>${esc(t('pr.' + m.pronto + '.t'))}</h3>
      <p class="pronto-que">${esc(t('pr.' + m.pronto + '.q'))}</p>
      <p class="pronto-p">${esc(t('pr.' + m.pronto + '.p'))}</p>
      <div class="pronto-sello">${esc(t('nu.pronto'))}</div>
      <button class="btn btn-oro" style="margin-top:18px">${esc(t('gc.cerrar'))}</button>
    </div>`;
    capa.querySelector('button').onclick = () => capa.remove();
    capa.onclick = (ev) => { if (ev.target === capa) capa.remove(); };
    document.body.appendChild(capa);
  }

  function nuAbrir(id) {
    // el clic que llega pegado a un jalon es el final del jalon, no un clic
    if (AURA.jalando()) return;
    const m = MUNDOS.find(x => x.id === id);
    if (!m) return;
    if (m.pronto) return prontoMirar(m);
    /* Con la identidad todavia en camino no se le cierra la puerta a nadie:
       tocar la esfera del chat en los primeros segundos mandaba a alguien
       verificado a rehacer su KYC. La propia pantalla vuelve a preguntar el
       estado antes de decidir (chatEntrar), asi que se la deja decidir a ella. */
    if (m.pideGid && identidad && !esVerificada()) { avisar(t('nu.cerrado')); return vista('verificar'); }
    const fuera = m.paraFuera === 'pay' ? URL_MYTOKENPAY : m.fuera;
    if (fuera) {
      /* Desde la galaxia este abrir llega DESPUÉS del viaje, fuera del gesto:
         el navegador puede bloquear la pestaña sin avisar. Si la bloqueó, se
         ofrece un botón de verdad en vez de fingir que no pasó nada. */
      const pest = window.open(fuera, '_blank', 'noopener');
      if (!pest) {
        avisar(t('nu.pestanaNo'));
        const carta = document.createElement('div');
        carta.className = 'puerta-afuera';
        carta.innerHTML = `<div class="vidrio">
          <p>${t('nu.pestanaP')}</p>
          <a class="btn btn-oro" href="${esc(fuera)}" target="_blank" rel="noopener">${esc(m.id === 'scan' ? 'ORDENSCAN' : m.id.toUpperCase())} →</a>
          <button class="btn btn-linea btn-sm">${t('gc.cerrar')}</button></div>`;
        carta.querySelector('a').addEventListener('click', () => carta.remove());
        carta.querySelector('button').addEventListener('click', () => carta.remove());
        document.body.appendChild(carta);
      }
      return;
    }
    entrarPorLaEsfera(id, () => vista(m.va));
  }

  /* ── EL TOQUE QUE SE CAÍA ENTRE APRETAR Y SOLTAR ──────────────────────────
   *
   * Las esferas del Núcleo FLOTAN: cada una con su vuelta y su desfase, vivas
   * desde el primer fotograma. Eso es el diseño, y está bien. Lo que no estaba
   * bien es lo que le hacía al dedo.
   *
   * Un toque son dos momentos, y entre los dos pasan ochenta o cien
   * milisegundos. Si la esfera se corre en ese rato —y se corre, porque nunca
   * está quieta— el `pointerup` cae en otra cosa: en el lienzo de estrellas
   * que hay detrás. Y cuando apretar y soltar ocurren sobre elementos
   * distintos, el navegador NO le manda el `click` a ninguno de los dos: se lo
   * manda al ancestro común. El `onclick` del botón nunca se entera.
   *
   * Medido, no supuesto:
   *     pointerdown -> esfera wallet
   *     pointerup   -> CANVAS
   *     click       -> cerebro          (y nadie abre nada)
   *
   * Con «reducir movimiento» las esferas se quedan quietas y los tres caen en
   * la esfera, que es por lo que esto se veía sólo a veces y sólo en algunas
   * máquinas — la peor forma de romperse, porque quien lo sufre parece que
   * está tocando mal.
   *
   * Aquí se rescata: se recuerda qué esfera recibió el APRETÓN y se abre esa
   * al soltar. La intención está en el apretón; dónde termine el dedo es
   * cosa de la animación, no de la persona.
   *
   * Dos cuidados:
   *  · si soltó ENCIMA de la misma esfera, no se hace nada — el `click` nativo
   *    va a llegar solo, y meterse aquí abriría dos veces;
   *  · un jalón no es un toque. Se mira CUÁNTO SE ALEJÓ EL DEDO como máximo
   *    durante todo el gesto, no dónde terminó: quien arrastra la constelación
   *    y vuelve al punto de partida antes de soltar estaba arrastrando, no
   *    tocando, y el punto final solo no sabría distinguirlo.
   *
   * No se mira el TIEMPO a propósito. La primera versión descartaba los
   * gestos de más de 600ms, y eso dejaba fuera a quien toca despacio —una
   * pulsación larga y quieta es un toque, no un jalón—. Quien va lento no
   * tiene por qué pelearse con la pantalla.
   */
  const TOQUE_LEJOS = 12;      // px que puede correrse el dedo y seguir siendo toque
  let esferaApretada = null;

  document.addEventListener('pointerdown', (ev) => {
    const el = ev.target.closest?.('.nu-mundo[data-mundo]');
    esferaApretada = el
      ? { el, id: el.dataset.mundo, x: ev.clientX, y: ev.clientY, lejos: 0 }
      : null;
  }, true);

  document.addEventListener('pointermove', (ev) => {
    const t = esferaApretada;
    if (!t) return;
    t.lejos = Math.max(t.lejos, Math.hypot(ev.clientX - t.x, ev.clientY - t.y));
  }, true);

  document.addEventListener('pointerup', (ev) => {
    const t = esferaApretada;
    esferaApretada = null;
    if (!t) return;
    if (ev.target.closest?.('.nu-mundo[data-mundo]') === t.el) return;
    const lejos = Math.max(t.lejos, Math.hypot(ev.clientX - t.x, ev.clientY - t.y));
    if (lejos > TOQUE_LEJOS) return;
    nuAbrir(t.id);
  }, true);

  document.addEventListener('pointercancel', () => { esferaApretada = null; }, true);

  /* ── AETHERION · el web OS del Inicio ─────────────────────────────────────
   *
   * La galaxia 3D que trajo José (React + Three, compilada a un bundle
   * propio, sin CDN) puede SER el Inicio: los pozos son las casas reales del
   * ecosistema y sintonizar uno navega de verdad. El bundle pesa ~360KB gz,
   * así que se carga UNA vez y solo al pisar el Inicio; si no carga —red,
   * navegador sin WebGL, lo que sea— el cerebro clásico sigue ahí, intacto:
   * el Inicio jamás se queda en negro por una mejora. */
  let aetCarga = null;

  /* LA VERSIÓN DEL MOTOR. La entrada de Aetherion tiene nombre fijo, y un
     nombre fijo es una invitación a que un navegador se quede con la copia
     vieja: eso hizo que después de publicar el Inicio nuevo, el teléfono
     siguiera enseñando el de antes. Esta huella la sella publicar.py en cada
     compilación —no se toca a mano— y va colgada del pedido, así que motor
     nuevo es dirección nueva. Los trozos ya llevan su huella en el nombre. */
  /* ── EL SELLO DE ESTA CASA ───────────────────────────────────────────────
     Lo estampa `subir.py` en cada despliegue, a partir del CONTENIDO de los
     archivos. Existe para contestar una pregunta que mirando la pantalla no
     se puede contestar: «¿esto que estoy viendo es lo último que subimos, o
     mi navegador se quedó con una copia vieja?». La ficha de Ajustes lo
     enseña, y con eso se sabe. */
  const VETA_V = '8ff0df145b';
  const VETA_FECHA = '2026-08-28';

  const AET_V = 'e250bbe2f5';

  function aetCargar() {
    if (aetCarga) return aetCarga;
    aetCarga = new Promise((ok, mal) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = `aetherion/assets/aetherion.css?v=${AET_V}`;
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.type = 'module';
      s.src = `aetherion/assets/aetherion.js?v=${AET_V}`;
      s.onload = () => (window.AETHERION ? ok() : mal(new Error('bundle sin AETHERION')));
      s.onerror = () => mal(new Error('no cargó el bundle'));
      document.head.appendChild(s);
    });
    // un fallo no condena para siempre: el próximo intento vuelve a probar
    aetCarga.catch(() => { aetCarga = null; });
    return aetCarga;
  }

  function aeSaludoQuitar() { document.getElementById('ae-saludo')?.remove(); }

  /* ── MODO VISOR ──────────────────────────────────────────────────────────
     La ficha de Ajustes no promete nada antes de mirar: pregunta al aparato
     qué puede, lo dice con todas las letras y solo ofrece el modo que este
     visor —o esta falta de visor— puede sostener. */
  async function vsPintar(caja) {
    if (!caja || !window.VISOR) return;
    const cap = await VISOR.detectar();
    const sugerido = VISOR.modoSugerido(cap);
    const hay = cap.xr || (cap.giroscopio && matchMedia('(pointer: coarse)').matches);
    const nombre = { xr: t('vs.xr'), carton: t('vs.carton'), trescientos60: t('vs.pantalla') }[sugerido];
    const est = VISOR.ver();
    caja.innerHTML = `
      <div class="vs-estado${hay ? ' hay' : ''}"><i></i><span>${esc(nombre)}</span></div>
      <p class="vs-aviso">${t('vs.aviso')}</p>
      <div class="vs-opciones">
        <label class="vs-fila">
          <span>${t('vs.mirada')}<small>${t('vs.miradaP')}</small></span>
          <input type="checkbox" id="vs-mirada" ${est.mirada ? 'checked' : ''}
                 onchange="VETA.vsMirada(this.checked)">
        </label>
        ${sugerido === 'carton' ? `
        <label class="vs-fila">
          <span>${t('vs.ojos')}<small>${t('vs.ojosP')}</small></span>
          <input type="range" id="vs-ojos" min="40" max="80" step="1"
                 value="${Math.round(est.ojos * 1000)}" oninput="VETA.vsOjos(this.value)">
        </label>` : ''}
      </div>
      <div class="acciones" style="margin-top:6px">
        <button class="btn btn-oro btn-sm" onclick="VETA.vsEntrar()">${t('vs.entrar')}</button>
        ${sugerido !== 'trescientos60' ? `<button class="btn btn-linea btn-sm"
          onclick="VETA.vsEntrar('trescientos60')">${t('vs.probar')}</button>` : ''}
      </div>`;
  }
  window.VETA_vsPintar = vsPintar;

  async function vsEntrar(modo) {
    if (!window.VISOR) return;
    /* EL PERMISO DEL GIROSCOPIO, LO PRIMERO Y SIN ESPERAR NADA.
       iOS solo lo concede si la llamada sale del propio gesto: cualquier
       await previo —cambiar de vista, preguntar por WebXR— la convierte en
       una llamada huérfana y Safari la rechaza. Aquí es el toque de la
       persona, así que aquí se pide. La promesa se guarda y se espera
       DESPUÉS, cuando ya no importa el gesto. */
    const giro = modo === 'xr' ? Promise.resolve(true) : VISOR.pedirGiro();
    /* El cielo 3D tiene que estar montado: el visor ES la galaxia. Si la
       persona está en otra vista, se la lleva al Inicio primero. */
    if (vistaActual !== 'nucleo') {
      vista('nucleo');
      /* ══ SE ESPERA AL MOTOR, NO AL RELOJ ═══════════════════════════════════
       *
       * Salir del Inicio DESMONTA la galaxia, y volver la vuelve a montar: por
       * un rato `__AE_VISOR` no existe, y entrar en ese hueco falla con
       * «sin-cielo». Aquí había una espera de segundo y medio a ojo, que es la
       * peor de las dos opciones: de más en un aparato rápido, de menos en uno
       * cargado. Se espera a que el motor ESTÉ, que es la condición de verdad.
       *
       * Y con un visor de por medio la diferencia no es sólo de elegancia.
       * Pedir una sesión inmersiva exige que el navegador todavía esté contando
       * el toque de la persona, y ese permiso dura unos pocos segundos: cada
       * décima que se gasta esperando por si acaso es una décima menos para
       * entrar. Con esto se entra en cuanto se puede.
       *
       * El tope existe porque un cielo que no monta —movimiento reducido, el
       * bundle que no bajó— no puede dejar a nadie esperando para siempre: se
       * sigue igual, y `entrar` dirá que no hay cielo, que es la verdad. */
      const hasta = performance.now() + 6000;
      while (!window.__AE_VISOR && performance.now() < hasta) {
        await new Promise(r => setTimeout(r, 80));
      }
      /* Los modos que se quedan en la pantalla del teléfono sí agradecen ver
         entrar el Inicio antes de partirse en dos ojos. Dentro de un visor de
         verdad esa animación no la ve nadie: la sesión toma la escena. */
      if (modo !== 'xr') await new Promise(r => setTimeout(r, 700));
    }
    const hayGiro = await giro;
    try {
      const m = await VISOR.entrar(modo);
      tele('accion', 'visor.entrar', { modo: m, giro: hayGiro });
      /* Si el permiso se negó, se dice AHORA y no cuando la persona ya tenga
         el aparato en la cara preguntándose por qué no se mueve nada. */
      if (!hayGiro && m !== 'xr') avisar(t('vs.sinGiro'));
      /* Ponerse el visor por primera vez ES pedir la historia: no hay mejor
         momento para contarla que cuando alguien acaba de meterse dentro. */
      genPorVisor();
    } catch (e) {
      avisar(t(e.message === 'sin-cielo' ? 'vs.sinCielo'
        : e.message === 'sin-webxr' ? 'vs.sinXr' : 'vs.noPudo'));
    }
  }
  /* ══ EL ECOSISTEMA DENTRO DEL VISOR ═══════════════════════════════════════
   *
   * Hasta aquí, abrir un mundo con el visor puesto SACABA del visor: las casas
   * son pantallas planas de HTML, y el HTML dentro de un visor no se puede
   * leer —se pinta una vez encima de las dos mitades de la pantalla y al
   * cerebro le llega una mancha doble—. Así que la wallet hacía lo honesto que
   * podía: salir limpio y enseñar la casa en la pantalla. Sólo que en un Quest
   * eso quiere decir que la galaxia se apaga y uno cae en un panel flotante
   * del navegador. Se podía MIRAR el ecosistema con el visor puesto; usarlo,
   * no.
   *
   * Se cierra con lo mismo que hizo que la historia se pudiera contar aquí
   * dentro: las palabras dejan de ser HTML y pasan a ser un objeto de la
   * escena, dibujado por las dos cámaras como cualquier planeta. Ver
   * aetherion/src/kernel/Casa.tsx, que es el teatro con botones.
   *
   * QUÉ SE ENSEÑA. Lo que la casa ES y lo que TIENE ahora mismo: el saldo, los
   * mensajes sin leer, el estado de la identidad, la cadena. El dato vivo va
   * primero y en grande — quien entra a la billetera con el visor puesto viene
   * a ver cuánto tiene, no a leer qué es una billetera. Y debajo, la misma
   * línea institucional que la película ya dice de cada mundo: escribirla dos
   * veces sería tener dos versiones de la misma frase envejeciendo por
   * separado.
   *
   * QUÉ NO. No se mueve dinero, igual que antes. Enviar, cobrar y cambiar
   * siguen fuera del visor a propósito, y aquí se dice por qué en vez de
   * dejar un botón que no responde.
   */
  const vsColor = (id) => (MUNDOS.find(m => m.id === id)?.halo) || '#EAD79C';

  function vsDatos(k) {
    const es = idiomaActivo() === 'es';
    const G = genGuion();
    const ficha = G.casas?.[k] || [k.toUpperCase(), ''];
    const T = (a, b) => (es ? a : b);
    const volver = { id: 'volver', texto: T('Volver', 'Back') };
    const base = {
      key: k, titulo: ficha[0], sub: ficha[1], color: vsColor(k),
      parrafos: [], lineas: [], botones: [volver],
    };
    /* La frase que la película ya le dedica a los dos mundos que todavía no
       abren. Si mañana abren, esto se cae solo con ella. */
    if (G.dicho?.[k]) base.parrafos.push(G.dicho[k].replace(/\n/g, ' '));

    if (k === 'wallet') {
      const pat = total();
      /* `leido` y no `cant != null`: un saldo que no se pudo leer viaja con la
         fila puesta y en cero sería un cero de consuelo — la misma trampa que
         cadena.js se cuida de no dejar entrar. Sin lectura se escribe una raya,
         que es la verdad. */
      const ori = (cartera || []).find(x => x.s === 'ORIGEN');
      base.lineas = [
        { k: T('Patrimonio', 'Net worth'), v: pat == null ? '—' : usd(pat) },
        { k: 'ORIGEN', v: ori?.leido && ori.cant != null
          ? Number(ori.cant).toLocaleString(es ? 'es-HN' : 'en-US', { maximumFractionDigits: 4 })
          : '—' },
        { k: T('Tu dirección', 'Your address'), v: cortaDir(sesion?.direccion || '') },
      ];
      base.nota = T('Enviar, cobrar y cambiar se hacen fuera del visor: firmar con la cara tapada y sin poder leer la letra chica no es una comodidad.',
        'Sending, receiving and swapping happen outside the headset: signing with your face covered and the fine print unreadable is not convenience.');
    } else if (k === 'chat') {
      const cs = chatSt.convs;
      const sinLeer = (cs || []).reduce((s, c) => s + (Number(c.sinLeer) || 0), 0);
      base.lineas = [
        { k: T('Conversaciones', 'Conversations'), v: cs == null ? '—' : String(cs.length) },
        { k: T('Sin leer', 'Unread'), v: cs == null ? '—' : String(sinLeer) },
      ];
      base.nota = T('Escribir y llamar se hacen fuera del visor: hace falta teclado.',
        'Writing and calling happen outside the headset: they need a keyboard.');
    } else if (k === 'gid') {
      const estado = !identidad ? T('Sin empezar', 'Not started')
        : esVerificada() ? T('Verificada', 'Verified') : T('En revisión', 'Under review');
      base.lineas = [{ k: T('Tu identidad', 'Your identity'), v: estado }];
      base.nota = T('Verificarse pide documentos y una foto: eso se hace fuera del visor.',
        'Verifying needs documents and a photo: that happens outside the headset.');
    } else if (k === 'genesis') {
      base.botones = [{ id: 'historia', texto: T('La historia', 'The story') }, volver];
      base.parrafos.push(T('Cómo se levantó todo esto, contado desde el principio.',
        'How all of this was built, told from the beginning.'));
    } else if (k === 'ajustes') {
      base.lineas = [
        { k: T('Casa', 'App'), v: VETA_V },
        { k: T('Galaxia', 'Galaxy'), v: AET_V },
      ];
      base.botones = [{ id: 'salir', texto: T('Quitar el visor', 'Leave VR') }, volver];
    }

    /* Las casas de afuera abren una pestaña del navegador, y una pestaña no
       existe dentro de una sesión inmersiva. Se dice, y se ofrece el único
       camino que hay de verdad: salir del visor y abrirla. */
    const m = MUNDOS.find(x => x.id === k);
    if (m && (m.fuera || m.paraFuera)) {
      base.botones = [{ id: 'fuera', texto: T('Salir y abrir', 'Leave and open') }, volver];
      base.nota = T('Esta casa vive en su propia página: para entrar hay que quitarse el visor.',
        'This one lives on its own page: opening it means taking the headset off.');
    }
    if (m?.pronto) {
      base.nota = T('Todavía no abre. Está a la vista porque es parte de lo que se está levantando.',
        'Not open yet. It is in plain sight because it is part of what is being built.');
    }
    return base;
  }

  /* Se abre un mundo con el visor puesto: en vez de salir, se enseña aquí
     dentro. La cámara ya está aparcada delante del planeta —el vuelo lo hizo
     el motor— así que el panel entra justo donde uno acaba de llegar. */
  function vsAbrirCasa(k) {
    if (!window.__AE_CASA) return false;
    let d;
    try { d = vsDatos(k); } catch { return false; }
    /* BLINDADO mientras hay panel: la mirada no elige planetas por detrás del
       cartel. Sin esto, leer la casa abriría otra. */
    window.__AE_BLINDADO = true;
    window.__AE_CASA(d);
    tele('accion', 'visor.casa', { casa: k });
    return true;
  }

  function vsCerrarCasa() {
    try { window.__AE_CASA?.(null); } catch { /* nada */ }
    window.__AE_BLINDADO = false;
  }

  addEventListener('ae-casa', (e) => {
    const { accion, key } = e?.detail || {};
    if (!window.VISOR?.activo()) return;
    if (accion === 'volver') {
      vsCerrarCasa();
      /* Y de vuelta al cielo: el motor deshace el vuelo por donde vino, que es
         lo que hace que volver se sienta un sitio y no un botón de atrás. */
      try { window.AETHERION?.exhalar?.(); } catch { /* nada */ }
      return;
    }
    if (accion === 'historia') {
      vsCerrarCasa();
      try { window.AETHERION?.exhalar?.(); } catch { /* nada */ }
      /* La película necesita la galaxia entera y libre: se le da el tiempo del
         vuelo de vuelta antes de empezar, o arrancaría con la cámara todavía
         pegada a un planeta. */
      setTimeout(() => { genSesion.visor = true; tourGenesis('visor'); }, 1500);
      return;
    }
    if (accion === 'salir') { vsCerrarCasa(); window.VISOR.salir(); return; }
    if (accion === 'fuera') {
      /* Salir PRIMERO y abrir después: una pestaña nueva pedida desde dentro
         de una sesión inmersiva no la ve nadie. */
      vsCerrarCasa();
      window.VISOR.salir();
      setTimeout(() => nuAbrir(key), 400);
    }
  });

  const vsSalir = () => window.VISOR?.salir();
  const vsOjos = (v) => window.VISOR?.ojos(Number(v) / 1000);
  const vsMirada = (v) => window.VISOR?.mirada(v);

  /* ── LA VERSIÓN, A LA VISTA ──────────────────────────────────────────────
   *
   * «No sé si se actualizó» no se puede contestar mirando la pantalla: una
   * copia vieja se ve idéntica a una al día. Esta ficha dice qué versión está
   * cargada —la casa y la galaxia, que se despliegan por separado y pueden ir
   * desfasadas— y ofrece la única cura de verdad: tirar la copia guardada y
   * volver a pedirlo todo.
   */

  /* El mismo dato, sin abrir nada. Sirve para dos cosas que la ficha no puede:
     que una prueba compruebe contra producción qué copia está sirviendo de
     verdad, y que alguien de soporte lo lea por teléfono sin guiar a nadie por
     cuatro pantallas. */
  const version = () => ({ app: VETA_V, fecha: VETA_FECHA, galaxia: AET_V });

  async function versionMirar() {
    const sw = 'serviceWorker' in navigator
      ? (await navigator.serviceWorker.getRegistrations().catch(() => []))
      : [];
    const cajas = 'caches' in window ? await caches.keys().catch(() => []) : [];
    const es = idiomaActivo() === 'es';
    const capa = document.createElement('div');
    capa.className = 'puerta-afuera';
    capa.innerHTML = `<div class="vidrio" style="max-width:400px;text-align:left">
      <h3 style="margin:0 0 14px;font:600 15px/1.3 var(--sans);color:var(--crema);
        letter-spacing:.06em">${esc(t('ver.aj'))}</h3>
      <dl class="ver-lista">
        <dt>${es ? 'La casa' : 'The app'}</dt><dd>${esc(VETA_V)}</dd>
        <dt>${es ? 'Publicada' : 'Published'}</dt><dd>${esc(VETA_FECHA)}</dd>
        <dt>${es ? 'La galaxia' : 'The galaxy'}</dt><dd>${esc(AET_V)}</dd>
        <dt>${es ? 'Copia guardada' : 'Cached copy'}</dt>
        <dd>${sw.length || cajas.length
          ? (es ? 'sí — puede servir una versión vieja' : 'yes — may serve an old version')
          : (es ? 'no' : 'no')}</dd>
      </dl>
      <p class="ver-nota">${es
        ? 'Si este número no es el de la última publicación, tu navegador guardó una copia vieja. El botón la tira y lo pide todo de nuevo.'
        : 'If this number is not the latest published one, your browser kept an old copy. The button throws it away and fetches everything again.'}</p>
      <div class="acciones" style="margin-top:4px">
        <button class="btn btn-oro btn-sm" id="ver-refrescar">${es ? 'Traer la última' : 'Fetch the latest'}</button>
        <button class="btn btn-linea btn-sm" id="ver-cerrar">${esc(t('gc.cerrar'))}</button>
      </div></div>`;
    document.body.appendChild(capa);
    capa.querySelector('#ver-cerrar').addEventListener('click', () => capa.remove());
    capa.querySelector('#ver-refrescar').addEventListener('click', async () => {
      /* LA CURA DE VERDAD, EN ESTE ORDEN: primero se despide al obrero que
         sirve las copias, después se tiran las cajas, y recién entonces se
         recarga. Recargar antes de eso vuelve a traer lo mismo de siempre. */
      try { for (const r of sw) await r.unregister(); } catch { /* nada */ }
      try { for (const c of cajas) await caches.delete(c); } catch { /* nada */ }
      /* Y con la marca de tiempo en la dirección: hay navegadores que ni con
         las cajas vacías se dignan a volver a pedir el documento. */
      location.replace(location.pathname + '?v=' + Date.now());
    });
  }

  /* ── LA MÚSICA ───────────────────────────────────────────────────────────
     El botón, su marca visible, y el estado al arrancar. Encenderla la
     primera vez pide un gesto: por eso el botón vive donde se lo ve. */
  /* Qué vista es «el Inicio» a estos efectos: la galaxia y nada más. */
  const CON_MUSICA = new Set(['nucleo']);
  let musicaEraDelInicio = false;

  function musicaSegunVista(cual) {
    const M = window.MUSICA;
    if (!M) return;
    const toca = CON_MUSICA.has(cual);
    /* Y EL BOTÓN VIVE DONDE VIVE LA MÚSICA. Dejarlo puesto dentro de un mundo
       sería ofrecer callar algo que ya está callado — y peor: apretarlo ahí
       encendería la pista sobre una pantalla de enviar dinero, que es justo lo
       que esto viene a evitar. En Ajustes sigue estando el interruptor de
       siempre, que es el que manda de verdad. */
    $('#musica-btn')?.classList.toggle('oculto', !toca);

    if (toca) {
      /* Vuelve solo si la persona la quiere puesta: quien la calló en Ajustes
         no se la encuentra encendida al volver al Inicio. */
      if (musicaEraDelInicio && M.quiere() && !M.puesta()) M.encender(false);
      musicaEraDelInicio = true;
    } else if (M.puesta()) {
      musicaEraDelInicio = true;
      M.apagar(false);
    }
  }

  function musicaAlterna() {
    if (!window.MUSICA) return;
    MUSICA.alterna();
    tele('accion', 'musica', { puesta: MUSICA.puesta() });
  }
  function musicaMarca(puesta) {
    $('#musica-btn')?.classList.toggle('callada', !puesta);
  }

  /* ── PANTALLA COMPLETA ───────────────────────────────────────────────────
     La galaxia y las casas se ven mejor sin la barra del navegador comiéndose
     un dedo de pantalla. El botón vive arriba a la derecha, el mismo sitio en
     el teléfono y en la computadora, y el mismo botón la quita.

     Si el navegador no sabe hacerlo —el Safari del iPhone no deja pantalla
     completa fuera de un video— el botón NO aparece: un botón que no hace nada
     es peor que ninguno. */
  /* ══ ¿ESTO SE ESTA VIENDO DENTRO DE LA APP DE ORDEN GLOBAL? ═══════════════
   * La app abre algunas casas del ecosistema —el Inicio, PULSE2CHAT, Ordenex,
   * AuCorp— dentro de si misma, y antes de cargar la pagina deja esta marca.
   * Importa porque ahi ya NO tiene sentido ofrecer segun que cosas: la app YA
   * esta a pantalla completa y ya esta instalada. Un boton que no puede hacer
   * nada es peor que no tener boton. Ver orden-global-app/src/og/CasaWeb.js. */
  const EN_APP = (() => {
    try {
      return window.__EN_APP_NATIVA === true || localStorage.getItem('veta.enApp') === '1';
    } catch { return false; }
  })();

  const puedeLlena = () => !EN_APP && !!(document.documentElement.requestFullscreen
    || document.documentElement.webkitRequestFullscreen);

  const enLlena = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

  function pantallaLlena() {
    try {
      if (enLlena()) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        const el = document.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      }
    } catch { /* el navegador puede negarse: no hay nada que romper */ }
  }

  function pintarLlena() {
    const b = $('#pantalla-llena');
    if (!b) return;
    const dentro = enLlena();
    document.body.classList.toggle('a-lo-ancho', dentro);
    const txt = t(dentro ? 'pl.cerrar' : 'pl.abrir');
    b.setAttribute('aria-label', txt);
    b.title = txt;
    /* Solo se ofrece dentro de la casa: en la puerta no hace falta. */
    b.classList.toggle('oculto', !puedeLlena() || $('#app').classList.contains('oculto'));
  }

  addEventListener('fullscreenchange', pintarLlena);
  addEventListener('webkitfullscreenchange', pintarLlena);

  /* ── ENTRAR EN VR, DESDE LA MISMA CASA ───────────────────────────────────
   *
   * Con un Quest puesto, «Ajustes → Modo visor → Entrar» es un camino que
   * nadie recorre: quien se calzó un visor y abrió esta página espera el botón
   * a la vista, como en cualquier otra web de VR. Y hay una razón técnica que
   * pesa más que la costumbre — pedir la sesión inmersiva exige que el
   * navegador siga contando el toque de la persona, y ese permiso se gasta
   * cambiando de vista y esperando a que el Inicio entre.
   *
   * Se pregunta UNA vez y sólo se enseña si la respuesta es que sí: en un
   * teléfono o una computadora este botón no existe, porque ahí el cartón y el
   * 360 necesitan explicarse y para eso está la ficha de Ajustes.
   */
  /* `var` y no `let` a propósito: esto se llama desde `ir()`, que está cientos
     de líneas más arriba, y con `let` la primera llamada moriría en la zona
     muerta antes de que este bloque se haya evaluado. */
  var hayXR = null;
  async function pintarVR() {
    const b = $('#entrar-vr');
    if (!b) return;
    if (hayXR == null) {
      try { hayXR = !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr')); }
      catch { hayXR = false; }
    }
    /* Dentro de la casa y sólo en el Inicio: el visor ES la galaxia, y
       ofrecerlo desde la billetera prometería un viaje que no sale de ahí. */
    b.classList.toggle('oculto', !hayXR || vistaActual !== 'nucleo'
      || $('#app').classList.contains('oculto'));
  }

  /* ═══ LA PUERTA CONTINUA ═════════════════════════════════════════════════
     El login y la casa son LA MISMA escena. Al llegar a la puerta se monta la
     galaxia 3D lejos, a la deriva y en silencio (modo puerta); entrar es UN
     vuelo de cámara — crear cuenta desciende despacio, con descubrimiento;
     iniciar sesión llega directo — y del otro lado la casa la ADOPTA sin
     remontarla. Si el bundle no carga o hay movimiento reducido, la puerta
     conserva su cielo 2D de siempre: jamás una pantalla en negro. */
  function aetIdentidad() {
    window.__AE_LANG = idiomaActivo();
    window.__AE_APPS = MUNDOS.map((m) => ({
      id: m.id, key: m.id, ico: m.ico || null,
      logo: m.logo || (m.id === 'chat' ? 'assets/p2c-simbolo.png' : null),
      zoom: m.zoom || (m.id === 'chat' ? 1.05 : 1),
      grad: m.grad, halo: m.halo, lente: m.lente,
    }));
  }

  function aetPuerta() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    aetIdentidad();
    /* El formulario va PRIMERO. Montar la galaxia pelea por la CPU justo
       cuando la persona quiere escribir su correo: se espera al primer
       respiro del navegador (con tope, que en un aparato ocupado el respiro
       puede no llegar nunca) y recién ahí se enciende el cielo. */
    const respiro = window.requestIdleCallback || ((fn) => setTimeout(fn, 350));
    respiro(() => aetCargar().then(() => {
      const cielo = $('#ae-cielo');
      // la persona pudo entrar (o irse) mientras el bundle bajaba
      if (!cielo || !$('#app').classList.contains('oculto')) return;
      if ($('#acceso').classList.contains('oculto')) return;
      if (document.getElementById('ae-casa') && cielo.querySelector('canvas')) {
        window.AETHERION.puerta();
      } else {
        window.__AE_PUERTA = true;
        cielo.innerHTML = '<div class="ae-casa" id="ae-casa"></div>';
        AETHERION.montar($('#ae-casa'));
      }
      document.body.classList.add('cielo-vivo');
      /* el cielo 2D le pasa el turno al 3D: dos galaxias a la vez son humo */
      try { window.GALAXIA?.apagar(); } catch { /* nada */ }
    }).catch(() => { /* la puerta 2D sigue puesta: nada que hacer */ }), { timeout: 1200 });
  }

  /* ¿La puerta 3D está viva y volando se entra? */
  const aetPuertaViva = () =>
    !!(window.AETHERION?.entrar && document.getElementById('ae-casa')
       && $('#ae-cielo')?.querySelector('canvas'));

  /* El Inicio decide su cuerpo: Aetherion si puede, el cerebro si no. */
  function encenderInicio() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return encenderCerebro(false);
    /* LA IDENTIDAD VA PRIMERO. El motor arma el mapa de casas al EVALUARSE, no
       al montarse: si el idioma y las marcas llegan después, los planetas
       nacen mudos y en español aunque la persona esté en inglés. */
    aetIdentidad();
    aetCargar().then(() => {
      const cielo = $('#ae-cielo');
      if (vistaActual !== 'nucleo' || !cielo) return;
      try {
        const nombre = (sesion?.nombre || '').split(' ')[0];
        /* El corazón de la galaxia es AU-RA: tocarla la llama, igual que su
           orbe en la esquina. */
        window.__AE_AURA = () => { try { auraToca(); } catch { /* nada */ } };
        window.__AE_ABRIR = (k) => {
          /* CON EL VISOR PUESTO LA CASA SE ABRE AQUÍ DENTRO. El vuelo ya
             terminó y la cámara está aparcada delante del planeta: el panel
             entra justo donde uno acabó de llegar, sin apagar la galaxia. Ver
             vsAbrirCasa y aetherion/src/kernel/Casa.tsx.
             Si por lo que sea no hay panel —el motor viejo en caché, un mundo
             sin ficha—, se sigue de largo por el camino de siempre: salir del
             visor y enseñar la casa en la pantalla. Peor sería quedarse
             mirando un planeta que no hace nada. */
          if (window.VISOR?.activo() && vsAbrirCasa(k)) return;
          const m = MUNDOS.find((x) => x.id === k);
          if (m && (m.fuera || m.paraFuera)) {
            /* Una casa de afuera abre su pestaña y ESTA galaxia exhala de
               vuelta al cielo: la persona no se queda mirando un «Entrando…»
               eterno en una pestaña que ya no es la protagonista. */
            nuAbrir(k);
            setTimeout(() => window.AETHERION?.exhalar?.(), 600);
          } else {
            window.AETHERION.desmontar();
            nuAbrir(k);
          }
        };
        /* LA ADOPCIÓN. Si la galaxia YA está montada —venimos de la puerta,
           con la cámara todavía volando— no se toca nada: remontarla aquí
           cortaría el vuelo por la mitad, que es exactamente la costura que
           esta arquitectura elimina. Solo se cuelga el saludo. */
        const yaVive = !!document.getElementById('ae-casa') && !!cielo.querySelector('canvas');
        if (!yaVive) cielo.innerHTML = '<div class="ae-casa" id="ae-casa"></div>';
        document.body.classList.add('cielo-vivo');
        /* Con el cielo 3D vivo, la vista del Núcleo no pinta nada encima: el
           cerebro clásico que dejó vista() se retira, o taparía los gestos y
           se verían las dos escenas a la vez. */
        const lienzo = $('#lienzo');
        if (lienzo) lienzo.innerHTML = '';
        /* Si la casa se pisa con la galaxia TODAVÍA en modo umbral —una
           recarga con sesión viva, una carrera— el vuelo lo dispara la propia
           adopción: nadie se queda mirando el sistema desde lejos y sin
           mandos. */
        if (yaVive && window.__AE_PUERTA) { try { AETHERION.entrar('directo'); } catch { /* nada */ } }
        /* El saludo vive colgado del body, no del lienzo: la animación de
           entrada de vista le pone un transform al lienzo y eso secuestra el
           position:fixed (el saludo quedaba tapado por las tabs del teléfono).
           aeSaludoQuitar() lo retira en cada camino que desmonta la galaxia. */
        aeSaludoQuitar();
        const saludo = document.createElement('div');
        saludo.className = 'ae-saludo'; saludo.id = 'ae-saludo';
        saludo.setAttribute('aria-hidden', 'true');
        saludo.innerHTML = `
            <b>${nombre ? `${t('nu.hola')}, ${esc(nombre)}` : 'Orden Global'}</b>
            <small>${t('nu.sub')}</small>`;
        document.body.appendChild(saludo);
        if (!yaVive) AETHERION.montar($('#ae-casa'));
        /* AQUÍ NO ARRANCA NADA SOLO. La película se pone cuando alguien la
           pide: el visor, AIR TOUCH o su fila en Ajustes. Llegar al Inicio no
           es pedirla — quien viene a mandar plata viene a eso. */
      } catch (e) {
        // el bundle cargó pero el montaje murió: el cerebro clásico responde
        aeSaludoQuitar();
        lienzo.innerHTML = nucleo();
        encenderCerebro(false);
      }
    }).catch(() => encenderCerebro(false));
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
    /* El cielo acompaña: las estrellas se apartan del planeta elegido, el
       destello lleva SU color y el aire hace el zarpe — la apertura tiene
       firma propia, no es un fundido genérico. */
    const r = el.getBoundingClientRect();
    const tinte = MUNDOS.find(x => x.id === id)?.halo || null;
    window.GALAXIA?.empujarHacia(r.left + r.width / 2, r.top + r.height / 2, 460, tinte);
    try { TONO.zarpe(true); } catch { /* sin audio se viaja igual */ }
    caja.classList.add('cer-yendo');
    el.classList.add('nu-yendo');
    setTimeout(abrir, 420);
  }

  // ── LAS CASAS DEL ECOSISTEMA · la vuelta con la llave puesta ──────────────

  /* Ni Ordenexchange ni AuCorp tienen contraseñas: se entra con ESTA cuenta.
     Su web manda a la gente a /#sso-ordenex o /#sso-aucorp y esto es el viaje
     de vuelta: con la sesion viva se le pide al backend un token de paso de
     Genesis (POST /genesis/sso/token — la clave de API de Genesis no baja
     jamas al navegador) y se devuelve a la persona a su casa con el token en
     el hash. Ese token vale minutos y solo dice QUIEN SOS: la sesion de la
     wallet, el Bearer y la contraseña se quedan aqui.

     Sin sesion, el destino queda anotado aqui y lo retoma
     enviarAcceso en cuanto la persona entra — igual que un cobro (#pagar)
     espera en la puerta a que haya con que atenderlo. */
  /* Antes esto era un booleano «viene de Ordenex». Con AuCorp abriendo por el
     mismo circuito, un segundo booleano habria sido dos caminos paralelos que
     se separan en cuanto alguien arregla uno solo. Asi que guarda el DESTINO:
     un mundo nuevo del ecosistema solo agrega una linea a CASAS_SSO. */
  let ssoDestino = null;
  /* El cobro entrante (#pagar…) sobrevive al login, igual que el destino de
     SSO. Sin esto se perdia: quien llegaba SIN sesion iba a la puerta, y
     al entrar `arrancar` ya habia terminado — la direccion nunca se rellenaba
     y la pantalla de enviar salia en blanco. Es el fallo que se veia al tocar
     «Depositar» desde Ordenex sin la wallet abierta. */
  let cobroPendiente = null;

  /* ═══ MODO VENTANA ════════════════════════════════════════════════════════
     La wallet abierta en una emergente por otra casa del ecosistema — hoy
     Ordenex, con «Depositar». Es el patron de MetaMask, y NO es cosmetico:

     La firma y la contraseña tienen que ocurrir EN EL ORIGEN DE LA WALLET.
     Un panel de Ordenex pidiendo la clave de la billetera, por bonito que
     quede, es enseñarle a la gente el gesto exacto con el que despues le
     vacian la cuenta. Con una ventana propia se consigue lo mismo —no salir
     de Ordenex— sin que la clave cruce de sitio: lo que se ve es esta pagina,
     en su dominio, con su candado en la barra.

     Al terminar, la ventana le avisa a quien la abrio con postMessage
     APUNTADO a su origen exacto (nunca '*': un comodin ahi reparte el aviso a
     cualquiera que haya conseguido meterse en medio) y se cierra sola. */
  const ORIGENES_QUE_PUEDEN_ABRIR = [
    'https://www.ordenexchange.link',
    'https://ordenexchange.link',
  ];

  let modoVentana = false;
  let quienAbrio = null;
  let enMarcoAjeno = false;

  function mirarSiEsVentana() {
    try {
      /* Dos formas de estar «dentro de otra casa», y las dos valen: una
         ventana emergente (window.opener) y un MARCO dentro de Ordenex
         (window.parent). El marco es el que se ve como MetaMask; la emergente
         es el respaldo para iOS, que convierte toda emergente en pestaña.
         El aviso de vuelta se le manda a quien corresponda. */
      const enMarco = window.parent && window.parent !== window;
      if (!enMarco && (!window.opener || window.opener === window)) return;
      const q = new URLSearchParams(location.hash.includes('?') ? location.hash.slice(location.hash.indexOf('?') + 1) : '');
      if (q.get('pop') !== '1') return;
      /* De donde viene se toma de `document.referrer` y se COMPRUEBA contra la
         lista: no se acepta un origen que llegue en la propia URL, porque eso
         lo escribe quien arma el enlace. Si no esta en la lista, la ventana
         funciona igual pero no le avisa a nadie. */
      const ref = document.referrer ? new URL(document.referrer).origin : null;
      const permitido = ORIGENES_QUE_PUEDEN_ABRIR.includes(ref)
        || (location.hostname === '127.0.0.1' || location.hostname === 'localhost');
      modoVentana = true;
      enMarcoAjeno = enMarco;
      quienAbrio = permitido ? (ref || location.origin) : null;
      document.body.classList.add('en-ventana');
    } catch { /* si algo de esto falla, se sigue como pagina normal */ }
  }

  /* El aviso de vuelta. Se manda una sola vez y despues se cierra: una ventana
     que se queda abierta despues de firmar es una ventana que alguien vuelve a
     tocar sin querer. */
  function avisarAlQueAbrio(datos) {
    /* TODO el cuerpo va en try. Esto corre DESPUES de que el dinero salio: si
       algo aqui lanza, la pantalla enseña un error para una transferencia que
       si se hizo, y la persona la manda otra vez. Ya paso una vez —un
       `pendiente.sim` leido despues de vaciar `pendiente`— y esa clase de
       fallo no puede depender de que el codigo de abajo este bien escrito. */
    try {
      if (!modoVentana || !quienAbrio) return;
      // Al padre si es un marco; al que la abrio si es una emergente.
      const destino = enMarcoAjeno ? window.parent : window.opener;
      if (!destino) return;
      destino.postMessage({ de: 'veta-wallet', ...datos }, quienAbrio);
      // Un marco no se cierra a si mismo: lo cierra Ordenex al recibir el
      // aviso. Cerrar solo tiene sentido en una ventana propia.
      if (!enMarcoAjeno) setTimeout(() => { try { window.close(); } catch {} }, 1400);
    } catch (e) {
      console.error('[ventana] no se pudo avisar a quien abrio:', e.message);
    }
  }

  /* Las casas que entran con la llave de esta cuenta. El hash que mandan y
     adonde vuelven. Una casa nueva es una linea aqui y nada mas. */
  const CASAS_SSO = {
    '#sso-ordenex': () => URL_ORDENEX,
    '#sso-aucorp': () => URL_AUCORP,
  };

  /* ── LA LLAVE, SIN SALIR DE CASA ─────────────────────────────────────────
   *
   * Cuando Ordenex vive DENTRO de su marco y alguien toca «conectar con mi
   * Veta Wallet», lo que hacía era mandar el marco a app.vetawallet.com — o
   * sea, meter la wallet dentro de la wallet. La CSP lo bloquea (y con razón:
   * anidar la casa dentro de sí misma no tiene sentido), y quedaba la página
   * en blanco. Ese era el crash.
   *
   * La casa de adentro ya no viaja: PIDE. Manda un mensaje al marco de arriba,
   * la wallet acuña el token igual que siempre y se lo devuelve por el mismo
   * canal. Sin recargas, sin saltos, sin salir. Y con la puerta cerrada por
   * los dos lados: solo se atienden mensajes del origen que ESTA casa enmarcó,
   * y la respuesta se manda a ese origen y a ninguno más.
   */
  const ORIGEN_DE = (url) => { try { return new URL(url).origin; } catch { return null; } };

  addEventListener('message', async (ev) => {
    if (!ev.data || ev.data.og !== 'sso-pedido') return;
    /* SOLO LA CASA QUE ESTÁ ENMARCADA AHORA MISMO. Un mensaje de cualquier
       otro sitio —una pestaña abierta al lado, un anuncio— no puede pedir la
       llave de nadie. */
    const marco = $('.marco-hoja');
    const suyo = marco ? ORIGEN_DE(marco.src) : null;
    if (!suyo || ev.origin !== suyo) return;
    if (!sesion?.token) { avisar(t('err.sesion')); return; }
    try {
      const d = await pedir('/genesis/sso/token', { metodo: 'POST' });
      if (!d?.token) throw new Error(t('err.sesion'));
      ev.source?.postMessage({ og: 'sso-token', token: d.token }, suyo);
    } catch (e) {
      /* El 403 es Genesis diciendo que sin identidad verificada no hay token:
         se dice y se abre la verificación, que es lo único que la desbloquea.
         Y se le avisa a la casa de adentro para que deje de esperar. */
      try { ev.source?.postMessage({ og: 'sso-no', motivo: e.estado === 403 ? 'sin-gid' : 'error' }, suyo); }
      catch { /* nada */ }
      if (e.estado === 403) { avisar(t('nu.cerrado')); vista('verificar'); }
      else avisar(e.message);
    }
  });

  async function volverConLlave(destino) {
    ssoDestino = null;
    if (!destino) return;
    try {
      const d = await pedir('/genesis/sso/token', { metodo: 'POST' });
      if (!d?.token) throw new Error(t('err.sesion'));
      /* En la MISMA pestaña: la casa mando a su gente de paso y la espera de
         vuelta — abrir otra dejaria esta huerfana a media entrada. */
      location.href = destino + '/#sso=' + encodeURIComponent(d.token);
    } catch (e) {
      /* El 403 no es un tropiezo: es Genesis diciendo que sin identidad
         verificada no hay token. Se dice con la frase de siempre y se abre la
         verificacion, que es lo unico que desbloquea esta puerta. Cualquier
         otro fallo se enseña tal cual llego — la red y el servidor ya vienen
         traducidos por pedir(). */
      if (e.estado === 403) { avisar(t('nu.cerrado')); vista('verificar'); }
      else avisar(e.message);
    }
  }

  // ── MYTOKENPAY · el comercio, adentro de la casa ──────────────────────────

  /* MyTokenPay deja de ser un enlace que te saca de la web: vive ADENTRO, y no
     por comodidad. Su propio documento de diseño lo dice —«MyTokenPay nunca
     toca una llave privada; cuando hay que mover ORIGEN manda al usuario a Veta
     Wallet y espera a que vuelva con el comprobante»—. Ese viaje de ida y
     vuelta entre dos webs es justo el trozo donde la gente se cae. Aqui no hay
     viaje: la firma ya ocurre en esta pagina, en este dominio, con este candado.

     EL DIRECTORIO ES EL DE VERDAD. Hasta ahora esta pantalla listaba
     `PAY_COMERCIOS`, un puñado de negocios escritos a mano en `datos.js`. La
     API tiene ciento veintisiete, en diecinueve paises, con su estado de
     verificacion real. El catalogo local se queda solo como red de emergencia
     —si la API no contesta se enseña, marcado como tal— porque una vitrina en
     blanco cuando se cae un servidor es peor que una vitrina vieja.

     EL COBRO ES EL DE VERDAD. Se lee el codigo del QR o se teclea, se piden las
     porciones, se manda el ORIGEN por la cadena 8532 a la direccion del
     comercio, y se confirma con el hash. Cuatro reglas del backend gobiernan
     esto y ninguna es decorativa:

       · La tasa se congela al crear el cobro. Si el oro se mueve mientras la
         persona saca el telefono, el numero acordado sigue siendo el acordado.
       · Una porcion reservada se bloquea ocho minutos. Dos amigos tocando
         «pagar» a la vez no pagan la misma porcion.
       · El pago lleva un sello que viaja igual en el reintento. Una red que se
         corta a mitad no cobra dos veces.
       · Sin comprobante de la cadena no hay pago. Nada de «marcar como pagado». */

  const MTP = String(window.OG_MTP || 'https://mytokenpay-api-5ab43b64205a.herokuapp.com')
    .replace(/\/+$/, '');

  /* La sesion de MyTokenPay vive en MEMORIA y nada mas. No va a localStorage a
     proposito: es un token de otra casa que esta pagina consigue sola en un
     segundo, y guardarlo solo sirve para que siga existiendo cuando ya nadie lo
     necesita. Al recargar se vuelve a pedir y no se nota. */
  let mtpSesion = null;
  let mtpEntrando = null;

  /* Una peticion a MyTokenPay. Es `crudo()` apuntando a otro servidor: el
     Bearer es el suyo, nunca el de la wallet — mandarle a otra casa el token
     que abre el dinero de esta seria regalarle la llave por comodidad. */
  async function mtpCrudo(ruta, { metodo = 'GET', cuerpo, espera = 25000, token } = {}) {
    const ctl = new AbortController();
    const reloj = setTimeout(() => ctl.abort(), espera);
    try {
      const r = await fetch(MTP + ruta, {
        method: metodo,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal: ctl.signal,
      });
      const texto = await r.text();
      let d = null;
      try { d = texto ? JSON.parse(texto) : null; } catch { d = { error: texto }; }
      if (!r.ok) {
        const e = new Error(d?.error || d?.message || `El servidor respondió ${r.status}`);
        e.estado = r.status;
        if (d?.detalle) e.detalle = d.detalle;
        throw e;
      }
      return d;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error(t('err.tarda'));
      if (e instanceof TypeError) throw new Error(t('err.red'));
      throw e;
    } finally { clearTimeout(reloj); }
  }

  /* Entrar a MyTokenPay con ESTA cuenta, sin escribir nada.
     Es el mismo circuito que ya usan Ordenex y AuCorp: el backend de la wallet
     pide un pase a Genesis ID (la clave de API de Genesis no baja jamas al
     navegador), y MyTokenPay lo verifica CONTRA Genesis antes de creerselo.

     Va tambien el correo, y no es un dato de mas: MyTokenPay comprueba que ese
     correo sea el de esa identidad segun Genesis. Es lo que impide que un pase
     valido de una persona abra la cuenta de otra.

     La promesa se comparte: si tres pantallas piden a la vez, se entra una sola
     vez. Sin esto se crean tres sesiones y las dos primeras quedan sueltas. */
  async function mtpEntrar() {
    if (mtpSesion) return mtpSesion;
    if (mtpEntrando) return mtpEntrando;
    mtpEntrando = (async () => {
      const d = await pedir('/genesis/sso/token', { metodo: 'POST' });
      if (!d?.token) throw new Error(t('err.sesion'));
      const r = await mtpCrudo('/api/auth/sso', {
        metodo: 'POST',
        cuerpo: { token: d.token, email: sesion?.correo },
      });
      if (!r?.token) throw new Error(t('mtp.eEntrar'));
      mtpSesion = r;
      return r;
    })();
    try { return await mtpEntrando; } finally { mtpEntrando = null; }
  }

  /* Con sesion. Si el token de MyTokenPay vencio, se entra otra vez y se
     repite UNA sola vez: reintentar en bucle contra un servidor que dice que no
     es como golpear la puerta mas fuerte. */
  async function pedirMtp(ruta, opciones = {}) {
    const s = await mtpEntrar();
    try {
      return await mtpCrudo(ruta, { ...opciones, token: s.token });
    } catch (e) {
      if (e.estado !== 401) throw e;
      mtpSesion = null;
      const s2 = await mtpEntrar();
      return await mtpCrudo(ruta, { ...opciones, token: s2.token });
    }
  }

  /* El 403 de Genesis no es un tropiezo de red: es «sin identidad verificada no
     hay pase». Se dice con la frase de siempre y se abre la verificacion, que
     es lo unico que abre esta puerta. Devuelve true si ya se ocupo del error. */
  function mtpSinIdentidad(e) {
    if (e?.estado !== 403) return false;
    avisar(t('nu.cerrado'));
    vista('verificar');
    return true;
  }

  // ── el directorio ─────────────────────────────────────────────────────────

  let payQ = '', payPais = '', payCat = '', payNeg = null;
  let mtpNegocios = null, mtpCats = null, mtpPaisesApi = null;
  let mtpCargando = false, mtpFalloDirectorio = null;

  const PAY_EMOJI = {
    restaurantes: '🍽', cafeterias: '☕', hoteles: '🏨', gimnasios: '🏋',
    belleza: '💇', 'vida-nocturna': '🍸', conveniencia: '🛍', supermercados: '🛒',
    moda: '👗', tecnologia: '📱', salud: '🩺', educacion: '🎓',
    automotriz: '🚗', turismo: '🌴', servicios: '💼',
  };

  /* Un negocio de la API traido a la forma que ya usaban estas pantallas.
     `direccionCobro` es la unica pieza nueva y es la que decide si a este
     comercio se le puede pagar en linea o solo visitar. */
  const mtpNegocio = c => ({
    id: c.id,
    nombre: c.tradeName || c.legalName || '',
    razon: c.legalName || '',
    desc: c.description || '',
    cat: c.categorySlug || 'servicios',
    pais: c.countrySlug || '',
    ciudad: c.citySlug || '',
    dir: c.address || '',
    ofrece: Array.isArray(c.productsServices) ? c.productsServices : [],
    redes: c.socials || {},
    logo: c.logoDataUrl || null,
    estado: c.kyc?.status === 'verified' || c.verified ? 'verified' : (c.kyc?.status || 'unsubmitted'),
    direccionCobro: c.walletAddress || null,
    real: true,
  });

  const payTodos = () => mtpNegocios || (PAY_COMERCIOS || []).map(c => ({ ...c, real: false }));
  const payCatsL = () => mtpCats || PAY_CATEGORIAS;
  const payPaisesL = () => mtpPaisesApi || PAY_PAISES;
  const payCiudadesDe = pais =>
    (mtpPaisesApi ? (mtpPaisesApi.find(p => p.slug === pais)?.cities || []) : (PAY_CIUDADES[pais] || []));
  const payCiudad = (pais, ciudad) =>
    payCiudadesDe(pais).find(c => c.slug === ciudad)?.label || ciudad;
  const payCatNom = slug => payCatsL().find(c => c.slug === slug)?.label || slug;
  const payPaisNom = slug => payPaisesL().find(p => p.slug === slug)?.label || slug;
  /* A quien se le puede pagar en linea: verificado Y con direccion de cobro
     puesta. El backend rechaza crear un cobro sin direccion, asi que enseñar el
     boton sin ella seria prometer algo que se cae al tocarlo. */
  const payCobrable = c => c.estado === 'verified' && !!c.direccionCobro;

  /* El directorio, una vez por sesion de pagina. Las tres listas van juntas
     porque sin categorias ni paises los filtros se quedarian en los seis de
     `datos.js` mientras la API sirve diecinueve. Estas tres rutas son publicas:
     mirar la vitrina no exige identificarse. */
  async function cargarComercios(forzar) {
    if (mtpCargando || (mtpNegocios && !forzar)) return;
    mtpCargando = true; mtpFalloDirectorio = null;
    try {
      const [neg, cats, paises] = await Promise.all([
        mtpCrudo('/api/companies'),
        mtpCrudo('/api/categories').catch(() => null),
        mtpCrudo('/api/countries').catch(() => null),
      ]);
      const lista = Array.isArray(neg) ? neg : (neg?.companies || neg?.comercios || []);
      mtpNegocios = lista.map(mtpNegocio);
      const lc = Array.isArray(cats) ? cats : (cats?.categories || null);
      if (lc?.length) mtpCats = lc;
      const lp = Array.isArray(paises) ? paises : (paises?.countries || null);
      if (lp?.length) mtpPaisesApi = lp;
    } catch (e) {
      /* Se guarda el fallo y se sigue con el catalogo local. Una vitrina vieja
         y avisada sirve; una vitrina en blanco no. */
      mtpFalloDirectorio = e.message;
    } finally {
      mtpCargando = false;
      if (vistaActual === 'pay' || vistaActual === 'payex') vista(vistaActual);
    }
  }

  function payFiltrados() {
    const q = sinTildes(payQ.trim());
    return payTodos().filter(c => {
      if (payPais && c.pais !== payPais) return false;
      if (payCat && c.cat !== payCat) return false;
      if (!q) return true;
      return sinTildes(`${c.nombre} ${c.desc} ${payCatNom(c.cat)} ${payCiudad(c.pais, c.ciudad)}`).includes(q);
    });
  }

  const payDisco = c => c.logo
    ? `<span class="pay-emo pay-emo-img"><img src="${esc(c.logo)}" alt=""></span>`
    : `<span class="pay-emo">${PAY_EMOJI[c.cat] || '🏪'}</span>`;

  function payTarjeta(c) {
    return `
    <button class="pay-caja" onclick="VETA.payAbrir(${jsTxt(c.id)})">
      <div class="pay-cab">
        ${payDisco(c)}
        <div style="flex:1;min-width:0">
          <b>${esc(c.nombre)}</b>
          <small>${esc(payCatNom(c.cat))} · ${esc(payCiudad(c.pais, c.ciudad))}</small>
        </div>
        ${c.estado === 'verified' ? `<span class="pay-ver" title="${t('pay.verif')}">
          <svg viewBox="0 0 24 24"><path d="M12 3l8 3.5v5c0 5-3.4 8.6-8 9.5-4.6-.9-8-4.5-8-9.5v-5z"/><path d="M9 12l2 2 4-4"/></svg></span>` : ''}
      </div>
      <p>${esc(c.desc.slice(0, 92))}${c.desc.length > 92 ? '…' : ''}</p>
      ${payCobrable(c) ? `<span class="pay-enlinea">${t('mtp.enLinea')}</span>` : ''}
    </button>`;
  }

  /* El pie del directorio dice de donde salieron los numeros. Sin esto, «6
     comercios» y «127 comercios» se ven igual de ciertos, y uno de los dos es
     una lista escrita a mano hace meses. */
  function payPie() {
    if (mtpCargando && !mtpNegocios) return `<p class="pie mtp-pie">${t('mtp.cargando')}</p>`;
    if (mtpFalloDirectorio) return `<p class="pie mtp-pie mtp-pie-mal">${t('mtp.dirViejo')}</p>`;
    return '';
  }

  function pay() {
    const todos = payTodos();
    const destacados = todos.filter(payCobrable).concat(todos.filter(c => c.estado === 'verified' && !payCobrable(c)))
      .slice(0, 4);
    return `
    <button class="volver" onclick="VETA.vista('nucleo')">
      <svg viewBox="0 0 24 24">${ICO.atras}</svg>${t('pay.alNucleo')}
    </button>
    <div class="cab"><div>
      <h2><img src="assets/apps/pay.png" alt="" class="pay-logo">MyTokenPay</h2>
      <div class="sub">${t('pay.sub')}</div>
    </div></div>

    ${/* Pagar es lo primero porque es lo que se hace de pie, en el mostrador,
         con la fila detras. Buscar un negocio se hace sentado en casa. */''}
    <div class="bloque vidrio mtp-pagar-ya">
      <div>
        <h3>${t('mtp.pagarYaT')}</h3>
        <p class="pie" style="margin-top:6px">${t('mtp.pagarYaP')}</p>
      </div>
      <button class="btn btn-oro" onclick="VETA.vista('paycobro')">
        <svg viewBox="0 0 24 24" class="btn-ic">${ICO.camara}</svg>${t('mtp.pagarYaB')}
      </button>
    </div>

    <div class="bloque vidrio">
      <input class="pay-busca" placeholder="${t('pay.buscar')}" value="${esc(payQ)}"
             autocomplete="off" oninput="VETA.payBuscar(this.value)">
      <div class="pay-chips">
        ${payCatsL().slice(0, 8).map(c => `
          <button class="pay-chip${payCat === c.slug ? ' va' : ''}"
                  onclick="VETA.payCategoria(${jsTxt(c.slug)})">${PAY_EMOJI[c.slug] || ''} ${esc(c.label)}</button>`).join('')}
      </div>
    </div>

    <div class="bloque vidrio">
      <div class="bloque-cab"><h3>${t('pay.destacados')}</h3>
        <button class="btn btn-linea btn-sm" onclick="VETA.payVerTodos()">${t('pay.todos')} (${todos.length})</button>
      </div>
      <div class="pay-rejilla">${destacados.map(payTarjeta).join('')}</div>
      ${payPie()}
    </div>

    <div class="bloque vidrio pay-cobra">
      <div>
        <h3>${t('mtp.miComercioT')}</h3>
        <p class="pie" style="margin-top:6px">${t('mtp.miComercioP')}</p>
      </div>
      <button class="btn btn-linea" onclick="VETA.paymio()">${t('mtp.miComercioB')}</button>
    </div>`;
  }

  function payex() {
    const lista = payFiltrados();
    const total = payTodos().length;
    return `
    <button class="volver" onclick="VETA.vista('pay')">
      <svg viewBox="0 0 24 24">${ICO.atras}</svg>MyTokenPay
    </button>
    <div class="cab"><div><h2>${t('pay.dirT')}</h2>
      <div class="sub">${lista.length} ${t('pay.de')} ${total} · ${payPaisesL().length} ${t('mtp.paises')}</div>
    </div></div>
    <div class="bloque vidrio">
      <input class="pay-busca" placeholder="${t('pay.buscar')}" value="${esc(payQ)}"
             autocomplete="off" oninput="VETA.payBuscar(this.value)">
      <div class="pay-filtros">
        <select onchange="VETA.payDePais(this.value)">
          <option value="">${t('pay.todosPais')}</option>
          ${payPaisesL().map(x => `<option value="${esc(x.slug)}" ${payPais === x.slug ? 'selected' : ''}>${x.flag || ''} ${esc(x.label)}</option>`).join('')}
        </select>
        <select onchange="VETA.payCategoria(this.value)">
          <option value="">${t('pay.todasCat')}</option>
          ${payCatsL().map(x => `<option value="${esc(x.slug)}" ${payCat === x.slug ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}
        </select>
      </div>
      ${payPie()}
    </div>
    ${lista.length ? `<div class="pay-rejilla">${lista.map(payTarjeta).join('')}</div>`
      : `<div class="bloque vidrio"><div class="vacio"><b>${t('pay.nadaT')}</b>${t('pay.nadaP')}</div></div>`}`;
  }

  function payneg() {
    const c = payTodos().find(x => x.id === payNeg);
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
        <span class="pay-emo pay-emo-g${c.logo ? ' pay-emo-img' : ''}">${c.logo ? `<img src="${esc(c.logo)}" alt="">` : (PAY_EMOJI[c.cat] || '🏪')}</span>
        <div style="flex:1;min-width:0">
          <h2 style="font-size:20px;font-weight:800">${esc(c.nombre)}</h2>
          <small style="color:var(--humo)">${esc(payCatNom(c.cat))} · ${esc(payCiudad(c.pais, c.ciudad))}${c.pais ? ' · ' + esc(payPaisNom(c.pais)) : ''}</small>
        </div>
        ${c.estado === 'verified' ? `<span class="pay-ver"><svg viewBox="0 0 24 24"><path d="M12 3l8 3.5v5c0 5-3.4 8.6-8 9.5-4.6-.9-8-4.5-8-9.5v-5z"/><path d="M9 12l2 2 4-4"/></svg></span>` : ''}
      </div>
      ${c.desc ? `<p class="ficha-desc" style="margin-top:0">${esc(c.desc)}</p>` : ''}
      <div class="pay-ofrece">${(c.ofrece || []).map(o => `<span>${esc(o)}</span>`).join('')}</div>
      <dl class="datos" style="margin-top:16px">
        ${c.dir ? `<div><dt>${t('pay.dire')}</dt><dd>${esc(c.dir)}</dd></div>` : ''}
        ${c.razon ? `<div><dt>${t('pay.razon')}</dt><dd>${esc(c.razon)}</dd></div>` : ''}
      </dl>
      ${redes.length ? `<div class="ficha-btns">${redes.map(r => {
        const [u, nom] = enlace(r);
        return `<a class="btn btn-linea btn-sm" href="${esc(u)}" target="_blank" rel="noopener">${esc(nom)}</a>`;
      }).join('')}</div>` : ''}
    </div>
    <div class="bloque vidrio">
      <h3>${t('pay.pagarT')}</h3>
      ${/* Se dice la verdad de este comercio en concreto, no una frase general:
           un negocio con direccion de cobro puesta acepta pago en linea hoy, y
           uno sin ella no lo va a aceptar por mucho que se toque el boton. */''}
      <p class="pie" style="margin-top:8px">${payCobrable(c) ? t('mtp.pagarNegSi') : (c.estado === 'verified' ? t('mtp.pagarNegSinDir') : t('mtp.pagarNegSinVerif'))}</p>
      <div class="ficha-btns">
        <button class="btn btn-oro btn-sm" onclick="VETA.vista('paycobro')">
          <svg viewBox="0 0 24 24" class="btn-ic">${ICO.camara}</svg>${t('pay.escanear')}</button>
      </div>
    </div>`;
  }

  const payBuscar = v => {
    payQ = v;
    const cual = vistaActual === 'pay' ? 'pay' : 'payex';
    if (cual === 'payex') {
      const l = payFiltrados();
      const caja = document.querySelector('.pay-rejilla');
      if (caja) caja.innerHTML = l.map(payTarjeta).join('');
      const sub = document.querySelector('.cab .sub');
      if (sub) sub.textContent = `${l.length} ${t('pay.de')} ${payTodos().length} · ${payPaisesL().length} ${t('mtp.paises')}`;
    } else if (payQ.trim().length > 1) {
      vista('payex');
      $('.pay-busca')?.focus();
    }
  };
  const payCategoria = v => { payCat = payCat === v ? '' : v; vista(vistaActual === 'pay' && !payCat ? 'pay' : 'payex'); };
  const payDePais = v => { payPais = v; vista('payex'); };
  const payVerTodos = () => { payQ = ''; payCat = ''; payPais = ''; vista('payex'); };
  const payAbrir = id => { payNeg = id; vista('payneg'); };

  // ── pagar un cobro ────────────────────────────────────────────────────────

  /* El codigo de cobro tiene forma: seis caracteres de un alfabeto sin I, O,
     cero ni uno, partidos por un guion. Esa eleccion del backend no es un
     capricho: en la pantalla de un telefono con grasa de pollo frito, un cero y
     una O son la misma cosa, y quien dicta el codigo por encima del ruido de un
     comedor no tiene por que deletrear. Aqui se acepta escrito de cualquier
     forma —con guion o sin el, en minusculas— y se normaliza. */
  const MTP_ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function leerCodigoCobro(crudo) {
    const txt = String(crudo || '').trim();
    // Del QR llega `mtp:cobro?c=…` o una URL; el codigo es lo que importa.
    const enQr = txt.match(/(?:codigo|cod|c)=([A-Za-z0-9-]{6,8})/);
    const suelto = (enQr ? enQr[1] : txt).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (suelto.length !== 6) return null;
    if ([...suelto].some(ch => !MTP_ALFA.includes(ch))) return null;
    return `${suelto.slice(0, 3)}-${suelto.slice(3)}`;
  }

  let mtpCobro = null;        // el cobro que se esta mirando
  let mtpMias = [];           // las porciones que YO tengo reservadas
  let mtpPagando = false;
  let mtpFallo = null;
  /* El sello por codigo de cobro, fuera del cobro. Vivia dentro y se perdia en
     cuanto el servidor devolvia el cobro actualizado — es decir, justo en el
     reintento, que es la unica vez que el sello sirve para algo. */
  const mtpSellos = Object.create(null);

  const mtpHnl = n => 'L ' + (Number(n) || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function mtpTraerCobro(codigo) {
    const d = await pedirMtp('/api/cobros/codigo/' + encodeURIComponent(codigo));
    mtpCobro = d?.cobro || null;
    /* Las porciones que este navegador reservo se recuerdan aqui, no se
       deducen: la respuesta no dice quien reservo cada una, solo su estado y el
       nombre. Deducirlo por el nombre haria que dos «Jose» en la misma mesa se
       pisaran la reserva. */
    mtpMias = mtpMias.filter(id => mtpCobro?.partes?.some(p => p.id === id && p.estado === 'reservada'));
    return mtpCobro;
  }

  async function payLeerCodigo(ev) {
    ev?.preventDefault();
    const caja = $('#mtp-cod');
    const codigo = leerCodigoCobro(caja?.value);
    if (!codigo) { mtpFallo = t('mtp.eCodigo'); return vista('paycobro'); }
    mtpFallo = null;
    try {
      await mtpTraerCobro(codigo);
      vista('paycobro');
    } catch (e) {
      if (mtpSinIdentidad(e)) return;
      mtpFallo = e.message;
      vista('paycobro');
    }
  }

  /* Tomar o soltar una porcion. Se habla con el servidor en cada toque en vez
     de acumular la eleccion y mandarla al final: si alguien mas ya tomo esa
     porcion, es mejor enterarse ahora —con el 409 en la mano— que despues de
     haber mandado el ORIGEN. */
  async function payTomar(parteId) {
    if (!mtpCobro || mtpPagando) return;
    const mia = mtpMias.includes(parteId);
    try {
      const ruta = `/api/cobros/codigo/${encodeURIComponent(mtpCobro.codigo)}/${mia ? 'liberar' : 'reservar'}`;
      const d = await pedirMtp(ruta, { metodo: 'POST', cuerpo: { parteIds: [parteId] } });
      mtpCobro = d?.cobro || mtpCobro;
      mtpMias = mia ? mtpMias.filter(x => x !== parteId) : mtpMias.concat(parteId);
      mtpFallo = null;
    } catch (e) {
      mtpFallo = e.message;
    }
    vista('paycobro');
  }

  /* PAGAR. El unico sitio de MyTokenPay donde se mueve dinero, y va en este
     orden por un motivo:

       1. reservar (ya hecho al elegir)
       2. mandar el ORIGEN por la cadena, desde ESTA billetera
       3. confirmar con el hash

     Si el paso 2 falla, se SUELTAN las porciones: dejarlas tomadas bloquea
     ocho minutos una cuenta que nadie va a pagar, con el comercio mirando la
     pantalla. Si falla el paso 3, NO se sueltan y no se reintenta solo: el
     dinero ya salio, y lo que hace falta es que una persona vea el hash. */
  async function payPagar(ev) {
    ev?.preventDefault();
    if (mtpPagando || !mtpCobro) return;
    const clave = $('#mtp-clave')?.value || '';
    const btn = $('#mtp-pagar-btn');
    const decir = txt => { mtpFallo = txt; vista('paycobro'); };

    if (!mtpMias.length) return decir(t('mtp.eSinPartes'));
    if (!clave) return decir(t('env.eClave'));

    const destino = mtpCobro.negocio?.direccion;
    if (!destino || !/^0x[a-fA-F0-9]{40}$/.test(destino)) return decir(t('mtp.eSinDireccion'));

    const partes = mtpCobro.partes.filter(p => mtpMias.includes(p.id));
    const monto = partes.reduce((s, p) => s + Number(p.montoOrigen || 0), 0);
    if (!(monto > 0)) return decir(t('mtp.eSinPartes'));

    const tengo = origen()?.cant;
    if (tengo != null && monto > tengo) return decir(`${t('env.eAlcanza')} ${oro(tengo)} ORIGEN.`);

    /* El sello se acuña ANTES de firmar y se guarda: si la red se corta entre
       la cadena y la confirmacion, el reintento lleva el mismo sello y el
       servidor devuelve el mismo resultado en vez de cobrar otra vez. */
    const sello = mtpSellos[mtpCobro.codigo]
      || (mtpSellos[mtpCobro.codigo] = 'web-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));

    mtpPagando = true; mtpFallo = null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="girando"></span> ' + t('mtp.pagando'); }

    let hash = null;
    try {
      const r = await pedir('/transaction/send', {
        metodo: 'POST', espera: 90000, sinReintento: true,
        cuerpo: {
          chain_id: CHAIN, recipientAddress: destino, amount: String(monto),
          password: clave, idempotencyKey: sello,
        },
      });
      hash = r?.hash || r?.transactionHash || r?.txId || null;
      if (!hash) throw new Error(t('mtp.eSinHash'));
    } catch (e) {
      mtpPagando = false;
      /* La transferencia no salio (o no se sabe). Se sueltan las porciones para
         no dejar la cuenta del comercio bloqueada, pero solo si el error fue
         ANTES de la cadena: una clave mal escrita es seguro que no movio nada. */
      const claveMala = /contrase|password|credential/i.test(e.message);
      if (claveMala) {
        /* Una clave mal escrita no movio nada: se sueltan las porciones de una
           sola vez para no dejar la cuenta bloqueada ocho minutos con el
           comercio mirando la pantalla. Si esto falla no importa: la reserva
           caduca sola. */
        try {
          await pedirMtp(`/api/cobros/codigo/${encodeURIComponent(mtpCobro.codigo)}/liberar`,
            { metodo: 'POST', cuerpo: { parteIds: mtpMias.slice() } });
          mtpMias = [];
        } catch {}
      }
      return decir(claveMala ? t('env.eMalClave') : `${e.message} ${t('env.eDuda')}`);
    }

    try {
      const d = await pedirMtp(`/api/cobros/codigo/${encodeURIComponent(mtpCobro.codigo)}/pagar`, {
        metodo: 'POST', espera: 60000,
        cuerpo: { parteIds: mtpMias.slice(), txHash: hash, sello },
      });
      mtpCobro = d?.cobro || mtpCobro;
      mtpMias = [];
      mtpPagando = false;
      avisar(t('mtp.avPagado'));
      cargarCartera(); cargarMovimientos();
      vista('paycobro');
    } catch (e) {
      /* Lo peor que puede pasar y hay que decirlo entero: el ORIGEN SALIO y el
         comercio no lo tiene apuntado. Se enseña el hash, grande y copiable,
         porque es lo unico que arregla esto. */
      mtpPagando = false;
      mtpFallo = null;
      mtpCobro = { ...mtpCobro, _colgado: { hash, monto } };
      vista('paycobro');
    }
  }

  function paycobro() {
    const c = mtpCobro;
    const cab = `
    <button class="volver" onclick="VETA.vista('pay')">
      <svg viewBox="0 0 24 24">${ICO.atras}</svg>MyTokenPay
    </button>
    <div class="cab"><div><h2>${t('mtp.cobroT')}</h2>
      <div class="sub">${t('mtp.cobroSub')}</div>
    </div></div>`;

    // Un pago que salio de la cadena y el comercio no apunto. Manda sobre todo.
    if (c?._colgado) return `${cab}
    <div class="bloque vidrio">
      <div class="nota nota-cuidado">${t('mtp.colgadoT')}</div>
      <p class="pie" style="margin-top:12px">${t('mtp.colgadoP')}</p>
      <dl class="datos" style="margin-top:16px">
        <div><dt>${t('mtp.enviaste')}</dt><dd class="mono">${oro(c._colgado.monto)} ORIGEN</dd></div>
        <div><dt>${t('mtp.comprobante')}</dt><dd class="mono mtp-hash">${esc(c._colgado.hash)}</dd></div>
        <div><dt>${t('mtp.codigo')}</dt><dd class="mono">${esc(c.codigo)}</dd></div>
      </dl>
      <div class="ficha-btns">
        <button class="btn btn-oro btn-sm" onclick="VETA.copiarTexto(${jsTxt(c._colgado.hash)})">${t('mtp.copiarHash')}</button>
        <button class="btn btn-linea btn-sm" onclick="VETA.payOtroCobro()">${t('mtp.otroCobro')}</button>
      </div>
    </div>`;

    if (!c) return `${cab}
    <div class="bloque vidrio">
      <h3>${t('mtp.leerT')}</h3>
      <p class="pie" style="margin-top:8px">${t('mtp.leerP')}</p>
      ${mtpFallo ? `<div class="aviso aviso-mal" style="margin-top:14px">${esc(mtpFallo)}</div>` : ''}
      <form onsubmit="VETA.payLeerCodigo(event)" style="margin-top:14px">
        <label class="campo">
          <span>${t('mtp.codigo')}</span>
          <input id="mtp-cod" class="mono mtp-cod" placeholder="ABC-D23" autocomplete="off"
                 autocapitalize="characters" spellcheck="false" maxlength="8">
        </label>
        <div class="dir-btns" style="margin-top:14px">
          <button class="btn btn-oro" type="submit">${t('mtp.verCuenta')}</button>
          <button class="btn btn-linea" type="button" onclick="VETA.vista('lector')">
            <svg viewBox="0 0 24 24" class="btn-ic">${ICO.camara}</svg>${t('mtp.escanearlo')}</button>
        </div>
      </form>
    </div>`;

    const mias = c.partes.filter(p => mtpMias.includes(p.id));
    const totalOr = mias.reduce((s, p) => s + Number(p.montoOrigen || 0), 0);
    const totalHnl = mias.reduce((s, p) => s + Number(p.montoHnl || 0), 0);
    const dividida = c.partes.length > 1;
    const cerrado = c.estado !== 'abierto';
    const tengo = origen()?.cant;

    const parte = p => {
      const mia = mtpMias.includes(p.id);
      const libre = p.estado === 'libre';
      const puedo = libre || mia;
      return `
      <button class="mtp-parte${mia ? ' mia' : ''}${p.estado === 'pagada' ? ' pagada' : ''}"
              ${puedo && !cerrado ? `onclick="VETA.payTomar(${jsTxt(p.id)})"` : 'disabled'}>
        <span class="mtp-parte-n">${p.indice + 1}</span>
        <span class="mtp-parte-m">
          <b class="mono">${oro(p.montoOrigen)} ORIGEN</b>
          <small>${esc(mtpHnl(p.montoHnl))}</small>
        </span>
        <span class="mtp-parte-e">${p.estado === 'pagada' ? t('mtp.pPagada')
          : mia ? t('mtp.pTuya')
          : p.estado === 'reservada' ? `${t('mtp.pTomada')}${p.pagadorNombre ? ' · ' + esc(p.pagadorNombre) : ''}`
          : t('mtp.pLibre')}</span>
      </button>`;
    };

    return `${cab}
    <div class="bloque vidrio">
      <div class="pay-cab" style="margin-bottom:14px">
        ${c.negocio?.logo ? `<span class="pay-emo pay-emo-g pay-emo-img"><img src="${esc(c.negocio.logo)}" alt=""></span>`
          : `<span class="pay-emo pay-emo-g">🏪</span>`}
        <div style="flex:1;min-width:0">
          <h2 style="font-size:20px;font-weight:800">${esc(c.negocio?.nombre || t('mtp.negocio'))}</h2>
          <small style="color:var(--humo)">${esc(c.concepto || '')}</small>
        </div>
        ${c.negocio?.verificado ? `<span class="pay-ver"><svg viewBox="0 0 24 24"><path d="M12 3l8 3.5v5c0 5-3.4 8.6-8 9.5-4.6-.9-8-4.5-8-9.5v-5z"/><path d="M9 12l2 2 4-4"/></svg></span>` : ''}
      </div>

      <div class="mtp-total">
        <div><span>${t('mtp.laCuenta')}</span><b class="mono">${esc(mtpHnl(c.montoHnl))}</b></div>
        <div><span>${t('mtp.enOrigen')}</span><b class="mono">${oro(c.montoOrigen)} ORIGEN</b></div>
      </div>
      ${/* La tasa congelada se enseña siempre. Es la promesa que sostiene el
           cobro: si el oro se mueve mientras la persona decide, este numero no.
           Un cobro que no dice a que tasa se hizo es un cobro que hay que
           creerse de palabra. */''}
      <p class="pie mtp-tasa">${t('mtp.tasaFija')} <span class="mono">${esc(mtpHnl(c.tasaHnlPorOrigen))} / ORIGEN</span> · ${t('mtp.codigo')} <span class="mono">${esc(c.codigo)}</span></p>
    </div>

    ${cerrado ? `
    <div class="bloque vidrio">
      <div class="vacio"><b>${c.estado === 'pagado' ? t('mtp.yaPagado') : c.estado === 'anulado' ? t('mtp.anulado') : t('mtp.vencido')}</b>
        ${c.estado === 'pagado' ? t('mtp.yaPagadoP') : t('mtp.cerradoP')}</div>
      <div class="ficha-btns"><button class="btn btn-linea btn-sm" onclick="VETA.payOtroCobro()">${t('mtp.otroCobro')}</button></div>
    </div>` : `

    <div class="bloque vidrio">
      <h3>${dividida ? t('mtp.tuParteT') : t('mtp.confirmarT')}</h3>
      <p class="pie" style="margin-top:8px">${dividida ? t('mtp.tuParteP') : t('mtp.confirmarP')}</p>
      <div class="mtp-partes${dividida ? '' : ' una'}">${c.partes.map(parte).join('')}</div>
    </div>

    ${mias.length ? `
    <div class="bloque vidrio">
      <div class="mtp-resumen">
        <span>${t('mtp.vasAPagar')}</span>
        <b class="mono">${oro(totalOr)} ORIGEN</b>
        <small>${esc(mtpHnl(totalHnl))}${tengo != null ? ` · ${t('mtp.tenes')} ${tapa(oro(tengo))}` : ''}</small>
      </div>
      ${mtpFallo ? `<div class="aviso aviso-mal" style="margin-top:14px">${esc(mtpFallo)}</div>` : ''}
      <form onsubmit="VETA.payPagar(event)" style="margin-top:14px">
        <label class="campo">
          <span>${t('env.clave')}</span>
          <input id="mtp-clave" type="password" autocomplete="current-password">
        </label>
        <p class="pie" style="margin-top:10px">${t('mtp.firmaAqui')}</p>
        <button id="mtp-pagar-btn" class="btn btn-oro btn-full" type="submit" style="margin-top:14px" ${mtpPagando ? 'disabled' : ''}>${t('mtp.pagarB')} ${oro(totalOr)} ORIGEN</button>
      </form>
    </div>` : `
    <div class="bloque vidrio">
      <p class="pie">${t('mtp.elegiPrimero')}</p>
      ${mtpFallo ? `<div class="aviso aviso-mal" style="margin-top:14px">${esc(mtpFallo)}</div>` : ''}
    </div>`}`}`;
  }

  const payOtroCobro = () => { mtpCobro = null; mtpMias = []; mtpFallo = null; vista('paycobro'); };

  // ── mi comercio ───────────────────────────────────────────────────────────

  /* El otro lado del mostrador: dar de alta el negocio, mandar los papeles y
     emitir cobros. Vive aqui y no en una app aparte porque el dueño de la
     pupuseria es la misma persona que paga con la billetera el domingo, y
     obligarle a dos cuentas en dos webs para las dos mitades de su vida es
     inventarle un problema. */
  let mtpMio = null;         // el comercio propio, o null si no tiene
  let mtpMioCargado = false;
  let mtpLibro = null;
  let mtpAlta = { legalName: '', tradeName: '', taxId: '', categorySlug: '', countrySlug: '', citySlug: '', address: '', description: '', walletAddress: '' };

  async function negCargar(forzar) {
    if (mtpMioCargado && !forzar) return;
    try {
      const d = await pedirMtp('/api/companies/mine');
      mtpMio = d?.company || d?.companies?.[0] || (d?.id ? d : null);
      mtpMioCargado = true;
    } catch (e) {
      if (e.estado === 404) { mtpMio = null; mtpMioCargado = true; }
      else if (!mtpSinIdentidad(e)) mtpFallo = e.message;
    }
    if (vistaActual === 'paymio') vista('paymio');
  }

  const MTP_KYB = {
    verified: ['si', 'mtp.kOk'], pending: ['ojo', 'mtp.kRev'],
    rejected: ['no', 'mtp.kNo'], unsubmitted: ['', 'mtp.kSin'],
  };

  function paymio() {
    if (!mtpMioCargado) { negCargar(); return `
      <button class="volver" onclick="VETA.vista('pay')"><svg viewBox="0 0 24 24">${ICO.atras}</svg>MyTokenPay</button>
      <div class="bloque vidrio centrado"><span class="girando"></span>
        <p class="pie" style="margin-top:12px">${t('mtp.cargando')}</p></div>`; }

    const cab = `
    <button class="volver" onclick="VETA.vista('pay')">
      <svg viewBox="0 0 24 24">${ICO.atras}</svg>MyTokenPay
    </button>
    <div class="cab"><div><h2>${t('mtp.miComercioT')}</h2>
      <div class="sub">${mtpMio ? esc(mtpMio.tradeName || mtpMio.legalName) : t('mtp.altaSub')}</div>
    </div></div>`;

    if (!mtpMio) return `${cab}${negAlta()}`;

    const est = mtpMio.kyc?.status || 'unsubmitted';
    const [tono, clave] = MTP_KYB[est] || MTP_KYB.unsubmitted;
    const listo = est === 'verified' && !!mtpMio.walletAddress;

    return `${cab}
    <div class="bloque vidrio">
      <div class="mtp-estado mtp-estado-${tono || 'gris'}">
        <b>${t(clave)}</b>
        <span>${t(clave + 'P')}</span>
      </div>
      <dl class="datos" style="margin-top:16px">
        <div><dt>${t('pay.razon')}</dt><dd>${esc(mtpMio.legalName || '')}</dd></div>
        <div><dt>${t('mtp.rtn')}</dt><dd class="mono">${esc(mtpMio.taxId || '')}</dd></div>
        <div><dt>${t('pay.dire')}</dt><dd>${esc(mtpMio.address || '')}</dd></div>
        <div><dt>${t('mtp.dirCobro')}</dt><dd class="mono">${mtpMio.walletAddress ? esc(cortaDir(mtpMio.walletAddress)) : '—'}</dd></div>
      </dl>
      ${!mtpMio.walletAddress ? `
      <div class="nota nota-cuidado" style="margin-top:14px">${t('mtp.faltaDir')}</div>
      <div class="ficha-btns">
        <button class="btn btn-oro btn-sm" onclick="VETA.negUsarMiDireccion()">${t('mtp.usarMiDir')}</button>
      </div>` : ''}
    </div>

    ${listo ? `
    <div class="bloque vidrio">
      <h3>${t('mtp.emitirT')}</h3>
      <p class="pie" style="margin-top:8px">${t('mtp.emitirP')}</p>
      ${mtpFallo ? `<div class="aviso aviso-mal" style="margin-top:14px">${esc(mtpFallo)}</div>` : ''}
      <form onsubmit="VETA.negEmitir(event)" style="margin-top:14px">
        <div class="campo">
          <label for="neg-monto">${t('mtp.cuanto')}</label>
          <input id="neg-monto" inputmode="decimal" placeholder="0.00" autocomplete="off">
        </div>
        <div class="campo">
          <label for="neg-concepto">${t('mtp.concepto')}</label>
          <input id="neg-concepto" placeholder="${t('mtp.conceptoEj')}" maxlength="80" autocomplete="off">
        </div>
        <div class="campo">
          <label for="neg-partes">${t('mtp.entreCuantos')}</label>
          <input id="neg-partes" type="number" min="1" max="20" value="1">
        </div>
        <button class="btn btn-oro btn-full" type="submit" style="margin-top:14px">${t('mtp.emitirB')}</button>
      </form>
    </div>` : ''}

    <div class="bloque vidrio">
      <div class="bloque-cab"><h3>${t('mtp.libroT')}</h3>
        <button class="btn btn-linea btn-sm" onclick="VETA.negLibro(true)">${t('mtp.actualizar')}</button>
      </div>
      ${negLibroHtml()}
    </div>`;
  }

  function negLibroHtml() {
    if (mtpLibro === null) { negLibro(); return `<p class="pie">${t('mtp.cargando')}</p>`; }
    if (!mtpLibro.length) return `<div class="vacio"><b>${t('mtp.libroVacioT')}</b>${t('mtp.libroVacioP')}</div>`;
    const ESTADO = { abierto: 'mtp.cAbierto', pagado: 'mtp.cPagado', anulado: 'mtp.cAnulado', vencido: 'mtp.cVencido' };
    return `<div class="mtp-libro">${mtpLibro.map(c => `
      <div class="mtp-fila mtp-fila-${esc(c.estado)}">
        <div class="mtp-fila-a">
          <b class="mono">${esc(c.codigo)}</b>
          <small>${esc(c.concepto || '')}</small>
        </div>
        <div class="mtp-fila-b">
          <b class="mono">${esc(mtpHnl(c.montoHnl))}</b>
          <small>${oro(c.montoOrigen)} ORIGEN</small>
        </div>
        <div class="mtp-fila-c">
          <span class="mtp-pill mtp-pill-${esc(c.estado)}">${t(ESTADO[c.estado] || 'mtp.cAbierto')}</span>
          ${c.estado === 'abierto' ? `<button class="btn btn-linea btn-sm" onclick="VETA.negAnular(${jsTxt(c.id)})">${t('mtp.anular')}</button>` : ''}
        </div>
      </div>`).join('')}</div>`;
  }

  async function negLibro(forzar) {
    if (mtpLibro && !forzar) return;
    try {
      const d = await pedirMtp('/api/cobros/mios');
      const l = Array.isArray(d) ? d : (d?.cobros || []);
      mtpLibro = l;
    } catch (e) {
      if (!mtpSinIdentidad(e)) mtpLibro = [];
    }
    if (vistaActual === 'paymio') vista('paymio');
  }

  function negAlta() {
    const paises = payPaisesL();
    const ciudades = payCiudadesDe(mtpAlta.countrySlug);
    return `
    <div class="bloque vidrio">
      <h3>${t('mtp.altaT')}</h3>
      <p class="pie" style="margin-top:8px">${t('mtp.altaP')}</p>
      ${mtpFallo ? `<div class="aviso aviso-mal" style="margin-top:14px">${esc(mtpFallo)}</div>` : ''}
      <form onsubmit="VETA.negCrear(event)" style="margin-top:16px">
        <div class="campo">
          <label for="neg-trade">${t('mtp.nombreCom')}</label>
          <input id="neg-trade" value="${esc(mtpAlta.tradeName)}" maxlength="80" autocomplete="organization">
        </div>
        <div class="campo">
          <label for="neg-legal">${t('pay.razon')}</label>
          <input id="neg-legal" value="${esc(mtpAlta.legalName)}" maxlength="120">
        </div>
        <div class="campo">
          <label for="neg-rtn">${t('mtp.rtn')}</label>
          <input id="neg-rtn" value="${esc(mtpAlta.taxId)}" class="mono" maxlength="20" autocomplete="off">
        </div>
        <div class="campo">
          <label for="neg-cat">${t('mtp.rubro')}</label>
          <select id="neg-cat">
            <option value="">${t('mtp.elegi')}</option>
            ${payCatsL().map(c => `<option value="${esc(c.slug)}" ${mtpAlta.categorySlug === c.slug ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
          </select>
        </div>
        <div class="campo">
          <label for="neg-pais">${t('mtp.pais')}</label>
          <select id="neg-pais" onchange="VETA.negPais(this.value)">
            <option value="">${t('mtp.elegi')}</option>
            ${paises.map(p => `<option value="${esc(p.slug)}" ${mtpAlta.countrySlug === p.slug ? 'selected' : ''}>${p.flag || ''} ${esc(p.label)}</option>`).join('')}
          </select>
        </div>
        <div class="campo">
          <label for="neg-ciudad">${t('mtp.ciudad')}</label>
          <select id="neg-ciudad" ${ciudades.length ? '' : 'disabled'}>
            <option value="">${ciudades.length ? t('mtp.elegi') : t('mtp.primeroPais')}</option>
            ${ciudades.map(c => `<option value="${esc(c.slug)}" ${mtpAlta.citySlug === c.slug ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
          </select>
        </div>
        <div class="campo">
          <label for="neg-dir">${t('pay.dire')}</label>
          <input id="neg-dir" value="${esc(mtpAlta.address)}" maxlength="160">
        </div>
        <div class="campo">
          <label for="neg-desc">${t('mtp.queHacen')}</label>
          <textarea id="neg-desc" rows="3" maxlength="400">${esc(mtpAlta.description)}</textarea>
        </div>
        ${/* La direccion de cobro se ofrece rellenada con la de esta billetera,
             que es la respuesta correcta el noventa y nueve por ciento de las
             veces. Se deja editable porque un negocio puede querer cobrar en
             otra —la de la sociedad, no la del dueño— y forzarle la propia
             seria decidir por el donde va su dinero. */''}
        <div class="campo">
          <label for="neg-wallet">${t('mtp.dirCobro')}</label>
          <input id="neg-wallet" class="mono" value="${esc(mtpAlta.walletAddress || sesion?.direccion || '')}"
                 placeholder="0x…" autocomplete="off" spellcheck="false">
        </div>
        <p class="pie">${t('mtp.dirCobroP')}</p>
        <button class="btn btn-oro btn-full" type="submit" style="margin-top:16px">${t('mtp.altaB')}</button>
      </form>
    </div>`;
  }

  const negPais = v => {
    mtpAlta = { ...negLeerAlta(), countrySlug: v, citySlug: '' };
    vista('paymio');
  };

  function negLeerAlta() {
    return {
      tradeName: $('#neg-trade')?.value?.trim() || '',
      legalName: $('#neg-legal')?.value?.trim() || '',
      taxId: $('#neg-rtn')?.value?.trim() || '',
      categorySlug: $('#neg-cat')?.value || '',
      countrySlug: $('#neg-pais')?.value || '',
      citySlug: $('#neg-ciudad')?.value || '',
      address: $('#neg-dir')?.value?.trim() || '',
      description: $('#neg-desc')?.value?.trim() || '',
      walletAddress: $('#neg-wallet')?.value?.trim() || '',
    };
  }

  async function negCrear(ev) {
    ev?.preventDefault();
    const d = negLeerAlta();
    mtpAlta = d;
    const falta = k => { mtpFallo = t('mtp.eFalta') + ' ' + t(k); vista('paymio'); };
    if (!d.tradeName) return falta('mtp.nombreCom');
    if (!d.legalName) return falta('pay.razon');
    if (!d.taxId) return falta('mtp.rtn');
    if (!d.categorySlug) return falta('mtp.rubro');
    if (!d.countrySlug) return falta('mtp.pais');
    if (!d.citySlug) return falta('mtp.ciudad');
    if (!d.address) return falta('pay.dire');
    if (d.walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(d.walletAddress)) {
      mtpFallo = t('env.eDir'); return vista('paymio');
    }
    /* El backend pide lat/lng. La ciudad elegida trae las suyas y con eso basta
       para ponerlo en el mapa: pedirle a alguien que teclee sus coordenadas
       para darse de alta es perder al noventa por ciento en ese campo. */
    const ciu = payCiudadesDe(d.countrySlug).find(c => c.slug === d.citySlug);
    const pai = payPaisesL().find(p => p.slug === d.countrySlug);
    try {
      mtpFallo = null;
      const r = await pedirMtp('/api/companies', {
        metodo: 'POST',
        cuerpo: {
          ...d,
          productsServices: [],
          lat: ciu?.lat ?? pai?.lat ?? 0,
          lng: ciu?.lng ?? pai?.lng ?? 0,
        },
      });
      mtpMio = r?.company || r;
      mtpLibro = null;
      avisar(t('mtp.avAlta'));
      cargarComercios(true);
      vista('paymio');
    } catch (e) {
      if (mtpSinIdentidad(e)) return;
      mtpFallo = e.detalle ? `${e.message} ${e.detalle}` : e.message;
      vista('paymio');
    }
  }

  async function negUsarMiDireccion() {
    if (!mtpMio || !sesion?.direccion) return;
    try {
      const r = await pedirMtp('/api/companies/' + encodeURIComponent(mtpMio.id), {
        metodo: 'PUT', cuerpo: { ...mtpMio, walletAddress: sesion.direccion },
      });
      mtpMio = r?.company || { ...mtpMio, walletAddress: sesion.direccion };
      avisar(t('mtp.avDir'));
      cargarComercios(true);
    } catch (e) { mtpFallo = e.message; }
    vista('paymio');
  }

  async function negEmitir(ev) {
    ev?.preventDefault();
    const monto = Number(String($('#neg-monto')?.value || '').replace(',', '.'));
    const concepto = $('#neg-concepto')?.value?.trim() || '';
    const partes = Math.max(1, Math.min(20, Math.trunc(Number($('#neg-partes')?.value) || 1)));
    if (!(monto > 0)) { mtpFallo = t('mtp.eMonto'); return vista('paymio'); }
    if (!concepto) { mtpFallo = t('mtp.eConcepto'); return vista('paymio'); }
    try {
      mtpFallo = null;
      await pedirMtp('/api/cobros', { metodo: 'POST', cuerpo: { montoHnl: monto, concepto, partes } });
      mtpLibro = null;
      avisar(t('mtp.avEmitido'));
      vista('paymio');
    } catch (e) {
      if (mtpSinIdentidad(e)) return;
      mtpFallo = e.detalle ? `${e.message} ${e.detalle}` : e.message;
      vista('paymio');
    }
  }

  async function negAnular(id) {
    try {
      await pedirMtp('/api/cobros/mios/' + encodeURIComponent(id) + '/anular', { metodo: 'POST' });
      mtpLibro = null;
      avisar(t('mtp.avAnulado'));
    } catch (e) { mtpFallo = e.message; }
    vista('paymio');
  }

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
    /* Al ESTADO, y despues pintar. Antes era al reves —pintar y poner los
       valores a mano— y el primer repintado se los llevaba. */
    envDir = String(dir || '');
    if (monto) envCant = String(monto);
    vista('enviar');
    envMonto();
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

  // ── PULSE2CHAT ─────────────────────────────────────────────────────────────

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
    /* La casa de PULSE2CHAT. `tab` es en qué parte de su casa está uno; el
       resto es lo que se ha traído del relevo, y `null` significa «todavía no
       se ha pedido» —distinto de `[]`, que significa «no hay nada»—. Esa
       diferencia es la que decide entre enseñar esqueletos y enseñar el cartel
       de vacío, y confundirlas hace que la app parezca rota los dos segundos
       que tarda la red. */
    tab: 'chats',
    circulo: null,       // {amigos, recibidas, enviadas}
    estados: null,       // [{correo, nombre, foto, estados:[…], sinVer}]
    viendo: null,        // {quien, i} — el visor de estados a pantalla completa
    subeEstado: null,    // {texto, fondo, adj} — el compositor
  };
  let chatReloj = null, chatDebounce = null;

  /* QUE SE ENSEÑA EN LA COLUMNA DERECHA. En movil las dos columnas son dos
     pantallas: la derecha solo aparece con `data-abierto`. Se ataba a «hay un
     hilo abierto», pero la puerta de Genesis, el aviso de error y Mi perfil
     tambien viven ahi — asi que en un telefono, alguien sin Genesis ID abria
     PULSE2CHAT y veia la nada, y con el relevo caido veia esqueletos eternos
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

  /* ── LA CASA DE PULSE2CHAT ────────────────────────────────────────────────
   *
   * Antes esto era una pantalla más de la billetera: la cabecera dorada de
   * Veta Wallet arriba y, debajo, dos columnas de chat. Funcionaba, pero no
   * era PULSE2CHAT: era el chat DE la billetera. Y en un teléfono se notaba
   * el doble, porque la mitad de la altura útil se iba en el marco de otra
   * cosa.
   *
   * Ahora tocar PULSE2CHAT entra en su casa. La billetera se aparta —fondo,
   * cabecera y todo— y la marca se queda con la pantalla entera: sus estados
   * arriba, sus conversaciones, su gente. Se sale con la flecha, que devuelve
   * al Núcleo.
   *
   * QUE HAY DENTRO Y POR QUE ESO
   *
   *   · Los ESTADOS arriba del todo, en fila. Es lo que caduca: si estuviera
   *     abajo nadie lo vería a tiempo, y un estado que se ve tarde es un
   *     estado que no existió.
   *   · Dos pestañas y no cinco: CHATS y GENTE. Una app de mensajes tiene dos
   *     verbos —hablar con quien ya conocés, y encontrar a quien no—. Todo lo
   *     demás cabe dentro de uno de los dos.
   *   · Las solicitudes viven en GENTE con su número encima, no en una
   *     pantalla propia: una solicitud pendiente es gente esperando, y ahí es
   *     donde se la busca.
   *   · No hay pestaña de LLAMADAS. Haría falta un historial de llamadas y el
   *     relevo no lo guarda; una pestaña que enseñara una lista vacía para
   *     siempre sería peor que no tenerla. Se llama desde el hilo, que es
   *     desde donde se llama de verdad.
   */
  function chat() {
    const pendientes = chatSt.circulo?.recibidas?.length || 0;
    return `
    <div class="p2c" id="p2c" ${chatHayPanel() ? 'data-abierto' : ''}>
      <aside class="p2c-casa">
        <header class="p2c-barra">
          ${/* La flecha de volver es lo primero, y es de verdad: en un
                teléfono, entrar a una app sin una salida a la vista es la
                forma más rápida de que alguien cierre la pestaña entera. */''}
          <button class="p2c-atras" onclick="VETA.vista('nucleo')"
                  aria-label="${t('cha.salirCasa')}">
            <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>
          </button>
          ${/* El simbolo va como imagen porque el manual pide que se use tal
                cual y con su gradiente oficial: redibujarlo a mano seria
                cambiarle los colores, que es justo lo que prohibe. */''}
          <img src="assets/p2c-simbolo.png" alt="" class="p2c-marca">
          <h2 class="p2c-nombre">PULSE<b>2</b>CHAT</h2>
          ${/* La campana: activar los avisos aunque la app este cerrada. Solo
                se ofrece donde puede cumplirse —hay soporte y el permiso no
                esta ni dado ni negado— porque un boton que no puede hacer
                nada enseña a no tocar botones. */''}
          ${(CHAT.puedeAvisar() && typeof Notification !== 'undefined' && Notification.permission === 'default')
            ? `<button class="p2c-yo p2c-campana" id="cha-avisos" onclick="VETA.chatAvisos()"
                       title="${t('cha.avisos')}" aria-label="${t('cha.avisos')}">
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                      stroke-linecap="round" stroke-linejoin="round">
                   <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
                   <path d="M13.7 21a2 2 0 0 1-3.4 0"/>
                 </svg>
               </button>` : ''}
          <button class="p2c-yo" onclick="VETA.chatCodigo()"
                  title="${t('cha.miPerfil')}" aria-label="${t('cha.miPerfil')}">
            ${chatSt.yo?.foto
              ? `<img src="${esc(CHAT.urlArchivo(chatSt.yo.foto))}" alt="">`
              : `<span>${esc(chatIni(chatSt.yo?.nombre || sesion?.nombre || sesion?.correo))}</span>`}
          </button>
        </header>
        <div id="p2c-arriba" class="p2c-arriba">${p2cArriba()}</div>
        <div class="p2c-cuerpo" id="p2c-cuerpo">${p2cCuerpo()}</div>
      </aside>
      <section class="chat-hilo" id="chat-hilo">${chatHilo()}</section>
    </div>`;
  }

  /* Los estados y las pestañas se pintan aparte del cuerpo porque cambian por
     motivos distintos: el cuerpo se repinta con cada latido del chat, y estos
     dos solo cuando llega algo nuevo. Meterlos en el mismo repintado haría
     saltar la fila de estados cada cinco segundos. */
  function p2cArriba() {
    if (chatSt.puerta === 'falta') return '';
    const pendientes = chatSt.circulo?.recibidas?.length || 0;
    return `
      ${p2cEstados()}
      <nav class="p2c-tabs" role="tablist">
        <button role="tab" ${chatSt.tab === 'chats' ? 'aria-selected="true"' : ''}
                onclick="VETA.p2cTab('chats')">${t('cha.tabChats')}</button>
        <button role="tab" ${chatSt.tab === 'gente' ? 'aria-selected="true"' : ''}
                onclick="VETA.p2cTab('gente')">${t('cha.tabGente')}${
          pendientes ? `<i class="p2c-globo">${pendientes}</i>` : ''}</button>
      </nav>`;
  }

  const p2cCuerpo = () => chatSt.puerta === 'falta' ? ''
    : (chatSt.tab === 'gente' ? p2cGente() : chatLista());

  /* ══ EL TOKEN QUE VA AL RELEVO TIENE QUE ESTAR VIVO ═══════════════════════
   *
   * Es lo único que le prueba al relevo que este navegador es de quien dice, y
   * lo que le hace devolver la llave del correo en vez del portazo del 409 —el
   * «tu chat está en otro lado». Un token vencido no prueba nada: el relevo se
   * lo lleva al backend, el backend dice «invalid token», y desde fuera se ve
   * exactamente igual que si fuera de otra persona.
   *
   * Y vence pronto, en cuarenta minutos. La wallet lo renueva sola, pero SOLO
   * dentro de `pedir()` —su propio cliente— y el chat no pasa por ahí: habla
   * con el relevo por su cuenta. O sea que quien dejó la pestaña abierta un
   * rato y volvió al chat le entregaba al relevo un token muerto y se quedaba
   * mirando «tu chat está en otro lado» sin haber hecho nada raro. Con la app
   * abierta todo el día, que es lo normal, esto pasaba casi siempre.
   *
   * Aquí se renueva antes de entregarlo. Si no se puede —sin red, sin
   * refresco—, se manda el que haya: puede que todavía sirva, y el peor caso es
   * el 409 que ya había. */
  async function chatSesionViva() {
    try { if (!vive() && sesion?.refresco) await renovar(); } catch { /* nada */ }
    return sesion?.token;
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
                          sesion: await chatSesionViva() });
      }
      chatSt.error = null;
      /* El buzón de señales se enciende con el chat, no con la vista: una
         llamada entrante tiene que llegar aunque la persona esté mirando su
         billetera, que es donde está casi siempre. */
      llamadaArrancar();
      /* La llave pública de este aparato se publica al ENTRAR, no al mandar el
         primer mensaje. Si esperara al primer mensaje, quien acaba de instalar
         no podría RECIBIR nada cifrado hasta escribir él, y su primera
         conversación entera llegaría en claro. */
      CHAT.publicarMiLlave?.().catch(() => null);
      await chatCargarConvs();
      /* Los estados se piden ya: son la primera fila de la pantalla, y una
         fila que aparece dos segundos tarde empuja todo lo de abajo justo
         cuando alguien iba a tocarlo. El círculo espera a su pestaña. */
      chatCargarEstados();
      chatCargarCirculo();
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
    /* El 409 con `sesion-no-vale` no es «otro aparato»: es esta sesion, que
       venció. Se arregla volviendo a entrar a la cuenta, y mandar a alguien a
       buscar su teléfono viejo por esto es hacerle perder la tarde. */
    if (e?.code === 409) return e?.motivo === 'sesion-no-vale' ? 'vencida' : 'otra';
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
                               sesion: await chatSesionViva() });
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
    /* ══ DE DONDE SALE EL NOMBRE ═══════════════════════════════════════════
     * El relevo no siempre lo trae —quien nunca lo puso, o una conversacion
     * vieja— y hasta ahora se caia directo al identificador: en la cabecera se
     * leia `morenoedwardortiz` en vez de una persona. Antes de rendirse hay que
     * mirar LA LIBRETA: si alguien ya esta apuntado, su nombre es mejor que su
     * usuario, y ademas es el que esa persona eligio. */
    const dela = (() => {
      try {
        const f = buscaContacto(leerContactos(), { correo: id, dir: c?.addr || '' });
        return f?.nombre || '';
      } catch { return ''; }
    })();
    chatSt.con = c
      ? { id, nombre: c.nombre || dela || id, esGrupo: !!c.esGrupo, gid: c.gid || '',
          addr: c.addr || '', foto: c.foto || '' }
      : { id, nombre: dela || id, esGrupo: CHAT.esGrupo(id), gid: '', addr: '', foto: '' };
    // Lo que la lista ya sabía de su presencia vale como primer trazo; la
    // bandeja lo confirma en el primer latido.
    chatSt.enLinea = c && !c.esGrupo ? c.enLinea === true : null;
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
    chatSt.enLinea = null;
    chatSt.msgs = null;
    pintarChat();
    chatCargarConvs();
  }

  async function chatCargarMsgs(callado) {
    const quien = chatSt.con?.id;
    if (!quien) return;
    try {
      const { mensajes: m, enLinea } = await CHAT.bandeja(quien);
      // Si mientras llegaba la respuesta se cambio de hilo, se descarta: pintar
      // los mensajes de otra conversacion es peor que no pintar nada.
      if (chatSt.con?.id !== quien) return;
      /* La presencia se pinta DIRECTO en la cabecera, sin repintar el chat:
         repintar roba el foco del campo de texto, y el punto verde cambia
         mucho más seguido que los mensajes. */
      if (chatSt.enLinea !== enLinea) {
        chatSt.enLinea = enLinea;
        pintarPresencia();
      }
      /* CUANDO REPINTAR, Y POR QUE ESTO SE ROMPIO DOS VECES.
       *
       * No se repinta si nada cambió: repintar en cada latido roba el foco del
       * campo y tira el scroll de quien está leyendo. La pregunta es cómo se
       * sabe que «nada cambió», y ahí hubo dos fallos seguidos:
       *
       *   1. Comparar solo el LARGO. Muere en los hilos activos: /bandeja
       *      recorta a 200, así que al llegar al tope el largo queda clavado y
       *      los mensajes nuevos no se pintan nunca más.
       *   2. Agregar la fecha del último y las reacciones. Tapó esos dos casos
       *      y dejó el siguiente: un mensaje BORRADO para todos no mueve ni el
       *      largo, ni la fecha, ni las reacciones — así que a la otra persona
       *      no le desaparecía nunca.
       *
       * El patrón era el error: ir agregando el campo que se rompió esta vez.
       * Se compara UNA huella de todo lo que la burbuja dibuja, así que un
       * campo nuevo entra solo y no puede volver a pasar.
       */
      const huella = (l) => (l || []).map((x) => [
        x.id, x.cuando, x.texto, x.borrado ? 1 : 0, x.tipo, x.archivo, x.cita,
        x.reacciones ? Object.entries(x.reacciones).sort().join(',') : '',
      ].join('~')).join('|');
      const igual = callado && chatSt.msgs && huella(chatSt.msgs) === huella(m);
      chatSt.msgs = m;
      chatSt.error = null;
      if (!igual) { pintarChat(); chatAlFinal(); }
    } catch (e) {
      chatSt.error = chatMotivo(e);
      if (!callado) pintarChat();
    }
  }


  /* ── RESPONDER CITANDO, REACCIONES Y «ESTA ESCRIBIENDO» ──────────────────
   *
   * Tres cosas chicas que hacen que un chat se sienta vivo. Ninguna necesita
   * infraestructura nueva: la cita y las reacciones viajan con el mensaje, y
   * el aviso de que alguien teclea va por el buzon de señales que ya existe
   * para las llamadas.
   */

  /** Empezar a responder a un mensaje. */
  function chatCitar(id) {
    const m = (chatSt.msgs || []).find((x) => x.id === id);
    if (!m) return;
    chatSt.citando = { id, de: m.de, texto: m.texto || chatResumen(m) };
    pintarChat();
    $('#chat-txt')?.focus();
  }
  function chatDejarCita() { chatSt.citando = null; pintarChat(); }

  /** Reaccionar. Tocar la misma otra vez la quita — eso lo decide el relevo. */
  async function chatReaccion(id, emoji) {
    try {
      await CHAT.reaccionar(id, emoji);
      await chatCargarMsgs(true);
    } catch { avisar(t('cha.errReaccion')); }
    chatSt.reaccionando = null;
    pintarChat();
  }
  function chatAbrirReaccion(id) {
    chatSt.reaccionando = chatSt.reaccionando === id ? null : id;
    pintarChat();
  }

  /* Quien esta escribiendo, y desde cuando. Se olvida solo a los tres
     segundos: si la persona dejo de teclear, nadie manda un «ya pare» — se
     asume por silencio, que es como funciona en todas partes. */
  const escribiendo = new Map();     // correo -> cuando llego el ultimo aviso
  let relojEscribe = null;

  function chatAlguienEscribe(de, donde) {
    if (chatSt.con?.id !== donde && chatSt.con?.id !== de) return;
    escribiendo.set(de, Date.now());
    pintarEscribiendo();
    clearInterval(relojEscribe);
    relojEscribe = setInterval(() => {
      const antes = escribiendo.size;
      for (const [k, v] of escribiendo) if (Date.now() - v > 3000) escribiendo.delete(k);
      if (escribiendo.size !== antes) pintarEscribiendo();
      if (!escribiendo.size) { clearInterval(relojEscribe); relojEscribe = null; }
    }, 700);
  }

  /* Se pinta SOLO ese trozo y no el chat entero: repintar todo por cada tecla
     ajena tira el foco del campo y hace parpadear las imagenes ya cargadas. */
  function pintarEscribiendo() {
    const caja = $('#cha-escribe');
    if (!caja) return;
    const quienes = [...escribiendo.keys()];
    if (!quienes.length) { caja.classList.add('oculto'); caja.textContent = ''; return; }
    const nombres = quienes.map((q) => q.split('@')[0]).join(', ');
    caja.textContent = quienes.length === 1
      ? `${nombres} ${t('cha.escribiendo')}`
      : `${nombres} ${t('cha.escribiendoVarios')}`;
    caja.classList.remove('oculto');
  }

  /** Se llama al teclear. El propio modulo se encarga de no inundar el relevo. */
  function chatTecleando() {
    if (chatSt.con) CHAT.escribiendo(chatSt.con.id);
  }

  async function chatMandar(ev) {
    ev.preventDefault();
    const c = $('#chat-txt');
    const texto = (c?.value || '').trim();
    if (!texto || chatSt.mandando || !chatSt.con) return;
    chatSt.mandando = true;
    c.value = '';
    try {
      await CHAT.enviar(chatSt.con.id, texto, chatSt.citando?.id);
      chatSt.citando = null;
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





  /* ── LA LLAMADA DE GRUPO ─────────────────────────────────────────────────
   *
   * En malla: cada uno con cada uno, y el video va directo entre las
   * personas. Sigue siendo cifrado de punta a punta, que es lo que el sello
   * del chat promete — un SFU lo repartiria mejor pero tendria que
   * descifrarlo, y entonces esa promesa dejaria de ser cierta.
   *
   * El tope son cinco, y esta medido: a 360p la sexta persona empuja la
   * subida de TODOS por encima de lo que un movil sostiene.
   */
  async function grupoLlamar(conVideo) {
    const c = chatSt.con;
    if (!c?.esGrupo || !window.GRUPO?.puede()) return;
    try {
      const info = await CHAT.grupoInfo(c.id);
      const otros = (info.miembros || [])
        .map((m) => String(m.correo || '').toLowerCase())
        .filter((m) => m && m !== String(sesion?.correo || '').toLowerCase());
      if (!otros.length) return avisar(t('gru.solo'));
      if (otros.length + 1 > GRUPO.TOPE) {
        return avisar(t('gru.muchos').replace('{n}', String(GRUPO.TOPE)));
      }
      await GRUPO.llamar(c.id, otros, !!conVideo);
    } catch (e) {
      if (e?.code === 'lleno') return avisar(t('gru.muchos').replace('{n}', String(GRUPO.TOPE)));
      const negado = /NotAllowed|Permission/i.test(String(e?.name || e?.message || ''));
      avisar(negado ? t('lla.negado') : t('lla.noSePudo'));
    }
  }

  /* Achicar la de grupo. Mismo mecanismo que la de dos y por el mismo motivo:
     solo cambia una clase, no se desmonta ni un <video>. Con varias personas
     eso importa mas todavia — remontar cortaria el flujo de TODAS. */
  let gruMini = false;
  function grupoMini() {
    gruMini = true;
    $('#gru')?.classList.add('mini');
    $('#gru')?.removeAttribute('aria-modal');
    pintarGrupo(GRUPO.cuento());
  }
  function grupoGrande() {
    gruMini = false;
    $('#gru')?.classList.remove('mini');
    $('#gru')?.setAttribute('aria-modal', 'true');
    pintarGrupo(GRUPO.cuento());
  }
  function grupoTocarMini(ev) {
    if (!gruMini) return;
    if (ev.target.closest('.lla-mini-x') || ev.target.closest('#gru-min')) return;
    grupoGrande();
  }

  const grupoContestar = (v) => GRUPO.contestar(!!v).catch(() => avisar(t('lla.noSePudo')));
  const grupoRechazar = () => GRUPO.rechazar();
  const grupoColgar = () => GRUPO.colgar('yo');
  const grupoMic = () => GRUPO.micro();
  const grupoCam = () => GRUPO.camara();
  const grupoPantalla = () => puedeCompartir()
    ? GRUPO.pantalla().catch(() => avisar(t('lla.pantallaNo')))
    : avisarSinPantalla();

  /* La pantalla. Los cuadros se crean UNA vez y se reutilizan: volver a
     dibujar el HTML en cada cambio remontaria los <video> y cortaria el flujo
     de todos en cada persona que entra o sale. */
  function pintarGrupo(c) {
    const capa = $('#gru');
    if (!capa) return;
    const activa = c.estado !== 'libre';
    capa.classList.toggle('oculto', !activa);
    if (!capa._tocable) { capa._tocable = true; capa.addEventListener('click', grupoTocarMini); }
    // Cuanta gente hay, para el sello de la burbuja achicada.
    capa.dataset.cuantos = String(c.cuantos || 0);
    if (!activa) {
      capa.classList.remove('mini'); gruMini = false;
      TONO.parar();
      $('#gru-rejilla').innerHTML = '';
      if (c.motivo === 'solo') avisar(t('gru.sinNadie'));
      return;
    }
    if (c.estado === 'llamando') TONO.sonar('llamando');
    else if (c.estado === 'entrando') TONO.sonar('entrando');
    else TONO.parar();
    $('#gru-entra').classList.toggle('oculto', c.estado !== 'entrando');
    $('#gru-mandos').classList.toggle('oculto', c.estado === 'entrando');
    $('#gru-cuantos').textContent = c.estado === 'llamando'
      ? t('gru.llamando') : `${c.cuantos} ${t('gru.enLlamada')}`;
    pintarBotonPantalla('#gru-pant');
    $('#gru-mic').classList.toggle('apagado', !c.micAbierto);
    $('#gru-cam').classList.toggle('apagado', !c.camAbierta);

    const rej = $('#gru-rejilla');
    const vivos = new Set(['yo', ...c.gente.map((g) => g.correo)]);
    // Se quitan los cuadros de quien ya no esta.
    for (const n of [...rej.children]) if (!vivos.has(n.dataset.quien)) n.remove();

    const cuadro = (quien, etiqueta) => {
      let n = rej.querySelector(`[data-quien="${CSS.escape(quien)}"]`);
      if (!n) {
        n = document.createElement('div');
        n.className = 'gru-cuadro';
        n.dataset.quien = quien;
        n.innerHTML = `<video autoplay playsinline${quien === 'yo' ? ' muted' : ''}></video>
                       <span class="gru-nombre"></span>`;
        rej.appendChild(n);
      }
      n.querySelector('.gru-nombre').textContent = etiqueta;
      return n.querySelector('video');
    };

    const mio = cuadro('yo', t('gru.vos'));
    const miFlujo = GRUPO.miPista();
    if (miFlujo && mio.srcObject !== miFlujo) mio.srcObject = miFlujo;

    for (const g of c.gente) {
      const v = cuadro(g.correo, g.correo.split('@')[0]);
      // El flujo vive en el modulo y se pide por correo: un MediaStream no se
      // puede copiar, y meterlo en el objeto de estado obligaria a compararlo
      // por identidad en cada repintado.
      const flujo = GRUPO.flujoDe(g.correo);
      if (flujo && v.srcObject !== flujo) v.srcObject = flujo;
      v.closest('.gru-cuadro').classList.toggle('esperando', !g.conectado);
    }
    rej.dataset.cuantos = String(rej.children.length);
  }


  /* ¿Este aparato puede compartir pantalla, y si no, por qué?
   *
   * En iPhone y iPad, Safari NO expone `getDisplayMedia`: compartir pantalla
   * desde una web no existe ahí y no lo arregla ningún código. Antes el botón
   * simplemente no aparecía, y el resultado fue el esperable — alguien lo
   * buscó, no lo encontró, y dio por hecho que estaba roto.
   *
   * Ahora se ve, apagado, y al tocarlo dice por qué. Una limitación explicada
   * molesta menos que una ausencia inexplicable, y sobre todo no manda a
   * nadie a buscar un fallo que no existe.
   */
  const esApple = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const puedeCompartir = () => !!navigator.mediaDevices?.getDisplayMedia;

  function pintarBotonPantalla(id) {
    const b = $(id);
    if (!b) return;
    const puede = puedeCompartir();
    // Se esconde solo donde NO se puede y NO es un aparato de Apple: ahí es un
    // navegador viejo cualquiera y no hay nada que explicar.
    b.classList.toggle('oculto', !puede && !esApple());
    b.classList.toggle('apagado-siempre', !puede);
    b.disabled = false;   // tiene que poder tocarse para poder explicarse
  }

  function avisarSinPantalla() {
    avisar(esApple() ? t('lla.pantallaApple') : t('lla.pantallaNo'));
  }

  /* ── LA LLAMADA CHIQUITA ─────────────────────────────────────────────────
   *
   * Seguir hablando mientras se usa el resto del ecosistema. Lo importante de
   * como esta hecho: NO se desmonta nada. Es el mismo elemento, la misma
   * conexion y el mismo <video>; solo cambia una clase y el navegador anima
   * el tamaño. Volver a montar un <video> con WebRTC corta el flujo un
   * instante —y a veces no vuelve— y el punto entero de esto es que la
   * llamada NO se corte.
   */
  let llaMini = false;

  function llamadaMini() {
    llaMini = true;
    $('#lla')?.classList.add('mini');
    // Se quita el rol de dialogo: minimizada ya no atrapa el foco ni el
    // lector de pantalla, porque la persona esta usando la app de atras.
    $('#lla')?.removeAttribute('aria-modal');
    pintarLlamada(LLAMADA.cuento());
  }

  function llamadaGrande() {
    llaMini = false;
    $('#lla')?.classList.remove('mini');
    $('#lla')?.setAttribute('aria-modal', 'true');
    pintarLlamada(LLAMADA.cuento());
  }

  /* Tocar la burbuja la agranda — pero no si se toco el boton de colgar, ni
     si lo que hubo fue un arrastre. Sin esa segunda condicion, mover la
     burbuja de sitio la abriria a pantalla completa al soltarla. */
  function llamadaTocarMini(ev) {
    if (!llaMini) return;
    if (ev.target.closest('.lla-mini-x')) return;
    /* Y tampoco el propio boton de achicar: su clic SUBE hasta aqui —el
       manejador vive en la capa entera— y como para entonces la llamada ya
       esta chiquita, la volvia a agrandar en el mismo gesto. Achicar no
       hacia nada y parecia que el boton estaba roto. */
    if (ev.target.closest('#lla-min')) return;
    if (llaArrastro) { llaArrastro = false; return; }
    llamadaGrande();
  }

  /* Arrastrar la burbuja. Se guarda donde la dejo la persona: si vuelve al
     centro cada vez que se repinta, tapa justo lo que estaba mirando. */
  let llaArrastro = false;
  let llaPos = null;

  function llamadaArrastrar(capa) {
    if (capa._arrastrable) return;
    capa._arrastrable = true;
    let x0 = 0, y0 = 0, movido = 0;

    const mover = (e) => {
      const p = e.touches ? e.touches[0] : e;
      const dx = p.clientX - x0, dy = p.clientY - y0;
      movido = Math.max(movido, Math.abs(dx) + Math.abs(dy));
      if (movido < 6) return;          // un toque tiembla; eso no es arrastrar
      llaArrastro = true;
      const c = capa.getBoundingClientRect();
      // Se queda DENTRO de la pantalla: una burbuja arrastrada fuera del
      // borde no se puede recuperar sin colgar.
      const izq = Math.min(Math.max(0, c.left + dx), innerWidth - c.width);
      const arr = Math.min(Math.max(0, c.top + dy), innerHeight - c.height);
      llaPos = { izq, arr };
      capa.style.inset = `${arr}px auto auto ${izq}px`;
      x0 = p.clientX; y0 = p.clientY;
      e.preventDefault();
    };
    const soltar = () => {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerup', soltar);
      // El «fue arrastre» se olvida en el siguiente tic, DESPUES del click.
      setTimeout(() => { llaArrastro = false; }, 0);
    };
    capa.addEventListener('pointerdown', (e) => {
      if (!llaMini || e.target.closest('.lla-mini-x')) return;
      const p = e.touches ? e.touches[0] : e;
      x0 = p.clientX; y0 = p.clientY; movido = 0;
      document.addEventListener('pointermove', mover);
      document.addEventListener('pointerup', soltar);
    });
    capa.addEventListener('click', llamadaTocarMini);
  }

  /* ── LA LLAMADA ──────────────────────────────────────────────────────────
   *
   * Ata tres cosas: el buzón de señales del relevo (chat.js), el WebRTC
   * (llamada.js) y esta pantalla.
   *
   * LO QUE HAY QUE TENER PRESENTE
   *
   * Esta es una página web sin push: NO SUENA con la app cerrada. Una llamada
   * solo entra si la otra persona tiene PULSE2CHAT abierto. Por eso el aviso
   * de «llamando…» dice cuánto lleva sonando y se rinde solo: dejar el tono
   * eternamente le hace creer a alguien que del otro lado hay un teléfono
   * sonando, y no lo hay.
   */
  let llaReloj = null;
  let llaDesde = 0;
  let llaSono = false;      // ya se dio el golpe de «conectado»
  let llaHabla0 = 0;        // cuándo entró la llamada, para el contador

  function llamadaArrancar() {
    if (!window.LLAMADA || !LLAMADA.puede()) return;
    LLAMADA.arrancar({
      mandar: (para, tipo, datos) => CHAT.senalar(para, tipo, datos),
      alCambiar: (c) => pintarLlamada(c),
      traerTurno: () => CHAT.turno(),
    });
    // El buzón se escucha mientras haya sesión de chat: si solo se escuchara
    // dentro de la vista del chat, una llamada entrante no llegaría nunca a
    // quien está mirando su billetera, que es donde está casi siempre.
    if (window.GRUPO?.puede()) {
      GRUPO.arrancar({
        correo: sesion?.correo,
        mandar: (para, tipo, datos) => CHAT.senalar(para, tipo, datos),
        alCambiar: (c) => pintarGrupo(c),
        turno: () => CHAT.turno(),
      });
    }
    /* Las señales de grupo empiezan por `g` y las atiende el otro modulo. Se
       reparten aqui, en un solo sitio, en vez de que los dos escuchen: dos
       bucles de espera larga serian el doble de peticiones abiertas por
       telefono, y en un movil eso es bateria. */
    CHAT.escuchar((s) => {
      if (s.tipo === 'escribe') return chatAlguienEscribe(s.de, s.datos?.donde);
      if (String(s.tipo || '').startsWith('g') && window.GRUPO) return GRUPO.recibir(s);
      return LLAMADA.recibir(s);
    });
  }

  function llamadaParar() {
    CHAT.dejarDeEscuchar();
    try { LLAMADA.colgar('yo'); } catch {}
  }

  /** Llamar a la persona del hilo abierto. */
  async function llamadaLlamar(conVideo) {
    const con = chatSt.con;
    if (!con || con.esGrupo) return;   // los grupos aún no; ver el commit
    if (!LLAMADA.puede()) return avisar(t('lla.sinSoporte'));
    try {
      llaDesde = Date.now();
      await LLAMADA.llamar(con.id, !!conVideo);
    } catch (e) {
      const negado = /NotAllowed|Permission/i.test(String(e?.name || e?.message || ''));
      avisar(negado ? t('lla.negado') : t('lla.noSePudo'));
    }
  }

  async function llamadaContestar(conVideo) {
    llaDesde = Date.now();
    try { await LLAMADA.contestar(!!conVideo); }
    catch (e) {
      const negado = /NotAllowed|Permission/i.test(String(e?.name || e?.message || ''));
      avisar(negado ? t('lla.negado') : t('lla.noSePudo'));
    }
  }

  const llamadaRechazar = () => LLAMADA.rechazar();
  const llamadaColgar = () => LLAMADA.colgar('yo');
  const llamadaMic = () => LLAMADA.micro();
  const llamadaCam = () => LLAMADA.camara();
  const llamadaPantalla = () => puedeCompartir()
    ? LLAMADA.pantalla().catch(() => avisar(t('lla.pantallaNo')))
    : avisarSinPantalla();

  /* ── LA PORTADA DE PULSE2CHAT ────────────────────────────────────────────
   *
   * Un instante de marca al entrar: el símbolo late, el pulso cruza y la capa
   * se va sola. UNA vez por sesión — la segunda entrada va directa al chat,
   * porque una portada que se repite deja de ser una entrada y pasa a ser un
   * peaje. Cuelga del body para que el primer repintado del chat no la corte
   * a media animación, y con movimiento reducido no aparece.
   */
  /* ── AIR TOUCH: la mano como puntero ──────────────────────────────────────
   *
   * airtouch.js entrega {presente,x,y,pellizco} por cuadro; aquí eso se
   * vuelve UI: el cursor dorado, el toque (pellizco corto y quieto) y el
   * agarre (pellizco sostenido que arrastra lo desplazable). Los eventos se
   * emiten SINTÉTICOS sobre lo que haya bajo el cursor, así toda la casa
   * responde sin saber que existe una cámara. El botón solo aparece donde
   * puede cumplirse (hay cámara y WebAssembly): un botón que no puede hacer
   * nada enseña a no tocar botones. */
  let atAgarre = null;    // { el, sx, x0, y0, movio, desde }
  /* La MIRADA: apuntar un rato abre, con un anillo que se va llenando. SOLO
     sobre los planetas del Inicio y las pestañas de navegación — nunca sobre
     un botón de dinero: mirar fijo «Enviar» no puede mover un centavo. El
     pellizco sigue siendo el toque universal. */
  /* LA MIRADA. Novecientos milisegundos apretaban solo: al pasar la mano por
     encima de algo camino a otra parte, se disparaba sin que nadie lo pidiera.
     Un segundo y cuarto es todavía un gesto cómodo —se sostiene sin cansarse—
     y ya no se cruza con el simple hecho de pasar por al lado. */
  const AT_MIRA_MS = 1250;
  /* Lo que la mirada puede elegir. Antes eran SOLO las esferas y las
     pestañas: cada otro botón de la casa —cerrar la hoja del cerebro, volver
     de una app, un enlace— era invisible para AIR TOUCH, y quien miraba fijo
     un «Cerrar» no veía ni el aro llenarse. Ahora todo lo que se puede
     presionar con el dedo se puede presionar con la mirada. Los botones de
     dinero no corren peligro extra: los que confirman plata exigen mantener
     apretado, y un click de mirada no sostiene nada. */
  const AT_MIRABLES = '.nu-mundo, .nav, button:not([disabled]), a[href], ' +
    '[role="button"]:not([aria-disabled="true"]), input[type="checkbox"], ' +
    'label[for], summary';

  /* LA MIRADA ABRE LO QUE NAVEGA, JAMÁS LO QUE PAGA. Una mirada sostenida es
     el gesto más fácil de hacer sin querer: quedarse pensando delante de la
     pantalla no puede acabar en una pantalla de plata. Todo lo que ejecuta o
     lleva derecho al dinero queda fuera del alcance del aro — para eso está
     el pellizco, que es deliberado. */
  const AT_SIN_MIRADA = /vista\('(?:enviar|cobrar|comprar|cambiar|lector|mtp|tarjeta|llaves|seguridad)'|confirmar|firmar/;
  function atPaga(el) {
    if (el.closest('[data-sin-mirada]')) return true;
    const orden = (el.getAttribute('onclick') || '') + ' ' + (el.dataset.vista || '');
    return AT_SIN_MIRADA.test(orden)
      || /^(enviar|cobrar|comprar|cambiar|lector|mtp|tarjeta|llaves|seguridad)$/.test(el.dataset.vista || '');
  }
  let atMira = null;      // { el, desde, hecho }

  function atMirarLimpiar() {
    atMira?.el?.classList.remove('at-mira');
    atMira = null;
    const aro = $('#at-cursor i');
    if (aro) aro.style.background = '';
    $('#at-nombre')?.classList.add('oculto');
  }

  /* ── LA MIRADA SOBRE LA GALAXIA ────────────────────────────────────────
     Los planetas del Inicio no son botones del DOM: viven en el cielo 3D. La
     mirada les pregunta al motor quién está bajo el punto (__AE_MIRAR), lo
     resalta mientras se sostiene y lo abre al completarse — el mismo aro de
     progreso y la misma pastilla de nombre que sobre un botón. Sin esto, la
     mirada no encontraba NADA que mirar en el Inicio. */
  let atMiraCielo = null;

  function atMirarCieloLimpiar() {
    if (!atMiraCielo) return;
    try { window.__AE_RESALTAR?.(null); } catch { /* nada */ }
    atMiraCielo = null;
    $('#at-nombre')?.classList.add('oculto');
    const aro = $('#at-cursor i');
    if (aro) aro.style.background = '';
  }

  function atMirarCielo(p) {
    const casa = window.__AE_MIRAR?.(p.x, p.y) || null;
    if (!casa) { atMirarCieloLimpiar(); return false; }
    if (atMiraCielo?.key !== casa.key) {
      atMirarCieloLimpiar();
      atGestoVivo('g5');
      atMiraCielo = { key: casa.key, desde: performance.now(), hecho: false };
      try { window.__AE_RESALTAR(casa.key); } catch { /* nada */ }
      const past = $('#at-nombre');
      if (past) {
        past.innerHTML = `<b>${esc(casa.nombre)}</b><small>${t('at.manten')}</small>`;
        past.classList.remove('oculto');
      }
      return true;
    }
    if (atMiraCielo.hecho) return true;
    const pr = (performance.now() - atMiraCielo.desde) / AT_MIRA_MS;
    const aro = $('#at-cursor i');
    if (aro) aro.style.background =
      `conic-gradient(rgba(234,215,156,.95) ${Math.min(360, pr * 360)}deg, rgba(201,169,97,.14) 0deg)`;
    if (pr >= 1) {
      atMiraCielo.hecho = true;
      try { TONO.clic(true); } catch { /* nada */ }
      $('#at-cursor')?.classList.add('toco');
      setTimeout(() => $('#at-cursor')?.classList.remove('toco'), 320);
      try { window.__AE_TOCAR(atMiraCielo.key); } catch { /* nada */ }
      atMirarCieloLimpiar();
    }
    return true;
  }

  function atMirar(objetivo, p) {
    if (objetivo !== atMira?.el) {
      atMirarLimpiar();
      if (!objetivo) return;
      objetivo.classList.add('at-mira');
      atGestoVivo('g5');
      atMira = { el: objetivo, desde: performance.now(), hecho: false };
      const rotulo = objetivo.querySelector('.nu-nombre')?.textContent
        || objetivo.getAttribute('aria-label') || objetivo.textContent.trim();
      const past = $('#at-nombre');
      if (past && rotulo) {
        past.innerHTML = `<b>${esc(rotulo)}</b><small>${t('at.manten')}</small>`;
        past.classList.remove('oculto');
      }
      return;
    }
    if (!atMira || atMira.hecho) return;
    const pr = (performance.now() - atMira.desde) / AT_MIRA_MS;
    const aro = $('#at-cursor i');
    if (aro) aro.style.background =
      `conic-gradient(rgba(234,215,156,.95) ${Math.min(360, pr * 360)}deg, rgba(201,169,97,.14) 0deg)`;
    if (pr >= 1) {
      atMira.hecho = true;
      const el = atMira.el;
      try { TONO.clic(true); } catch { /* nada */ }
      $('#at-cursor')?.classList.add('toco');
      setTimeout(() => $('#at-cursor')?.classList.remove('toco'), 320);
      try {
        el.dispatchEvent(new MouseEvent('click', {
          bubbles: true, cancelable: true, composed: true, clientX: p.x, clientY: p.y,
        }));
      } catch { /* nada */ }
      atMirarLimpiar();
    }
  }

  function airToca() {
    if (window.AIRTOUCH?.activo()) {
      AIRTOUCH.apagar();
      $('#at-boton')?.classList.remove('encendido');
      $('#at-cursor')?.classList.add('oculto');
      $('#at-cinta')?.classList.add('oculto');
      atTablero(false);
      atMirarLimpiar();
      atMirarCieloLimpiar();
      atAgarre = null;
      return avisar(t('at.apagado'));
    }
    if (!window.AIRTOUCH?.puede()) return avisar(t('at.sinSoporte'));
    /* ══ LA PANTALLA COMPLETA SE PIDE AQUI, Y NO MAS ADENTRO ═══════════════
     * Mover la galaxia con la mano en el aire pide toda la pantalla: con la
     * barra del navegador y las pestañas encima, la mitad del gesto se pierde
     * apuntando a un cielo recortado.
     *
     * Y se pide EN ESTA LINEA a proposito. `airEncender` es asincrona —espera
     * a que la camara arranque— y despues de un `await` el navegador ya no
     * considera que hay un gesto de la persona detras: Safari niega la
     * pantalla completa en silencio. Es el mismo fallo que tuvo el permiso del
     * giroscopio en el visor, y se arregla igual: primero lo que necesita el
     * gesto, y despues lo que puede esperar. */
    if (!enLlena()) {
      try {
        const el = document.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
      } catch { /* si el navegador se niega, la mano funciona igual */ }
    }
    // La primera vez se enseña qué se puede hacer; después, directo.
    if (!localStorage.getItem('veta.airtouch.tuto')) return airTutoAbrir();
    airEncender();
  }

  async function airEncender() {
    avisar(t('at.cargando'));
    try {
      await AIRTOUCH.encender({ alCambiar: atPunto });
      $('#at-boton')?.classList.add('encendido');
      /* ══ LA MANO NO CUENTA LA HISTORIA ═══════════════════════════════════
       * Encender AIR TOUCH disparaba el origen. La idea era buena —quien
       * enciende la mano quiere jugar con la galaxia, y la historia es lo
       * mejor que tiene— pero en la practica es lo contrario de lo que uno
       * pide: se enciende la mano PARA USAR la galaxia, y encontrarse tres
       * minutos de pelicula encima es que la app haga otra cosa distinta de
       * la que se le pidio. Y para volver a usarla hay que saltarla.
       * La historia tiene su sitio y es Ajustes, donde se elige verla. */
      atTablero(true);
      const cinta = $('#at-cinta');
      if (cinta) {
        cinta.textContent = t('at.cinta');
        cinta.classList.remove('oculto');
        setTimeout(() => cinta.classList.add('oculto'), 6000);
      }
      avisar(t('at.listo'));
      tele('accion', 'airtouch.encendido');
    } catch (e) {
      avisar(t(e.motivo === 'negado' ? 'at.negado'
        : e.motivo === 'sin-modelo' ? 'at.sinModelo' : 'at.sinCamara'));
    }
  }

  function airTutoAbrir() { $('#at-tuto')?.classList.remove('oculto'); }
  function airTutoCerrar() { $('#at-tuto')?.classList.add('oculto'); }
  function airTutoActivar() {
    try { localStorage.setItem('veta.airtouch.tuto', '1'); } catch { /* nada */ }
    airTutoCerrar();
    airEncender();
  }

  /* Debajo del cursor, ignorando al propio cursor (pointer-events:none ya lo
     saca del camino). */
  const atBajo = (x, y) => document.elementFromPoint(x, y);

  /* El desplazable más cercano: el agarre arrastra ESO. Sin ninguno, la
     página entera. */
  function atRodante(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX)
          && (n.scrollHeight > n.clientHeight + 4 || n.scrollWidth > n.clientWidth + 4)) return n;
    }
    return null;
  }

  const atEvento = (tipo, x, y, el) => {
    try {
      el?.dispatchEvent(new PointerEvent(tipo, {
        bubbles: true, cancelable: true, composed: true,
        clientX: x, clientY: y, pointerId: 7, pointerType: 'touch', isPrimary: true,
      }));
    } catch { /* un navegador sin PointerEvent no llega hasta aquí */ }
  };

  /* ── EL TABLERO DE AIR TOUCH ──────────────────────────────────────────────
     Dos cosas que la persona necesita saber en todo momento con la cámara
     encendida: SI LA MANO SE VE (si no, mover la mano y que no pase nada
     parece una avería) y QUÉ PUEDE HACER con ella. Los gestos se encienden
     cuando se usan: el tablero enseña, no solo informa. */
  const AT_GESTOS = [
    { k: 'g1', ico: '<path d="M12 3v10M12 3l-3.5 3.5M12 3l3.5 3.5"/><circle cx="12" cy="18" r="2.6"/>' },
    { k: 'g2', ico: '<path d="M7 8c2-3 6-3 8 0"/><circle cx="7" cy="13" r="2.4"/><circle cx="15" cy="13" r="2.4"/><path d="M9.4 13h3.2"/>' },
    { k: 'g3', ico: '<path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6"/><path d="M17.7 3v3.6h-3.6M6.3 21v-3.6h3.6"/>' },
    { k: 'g4', ico: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.6v2.6M12 17.8v2.6M3.6 12h2.6M17.8 12h2.6"/>' },
    { k: 'g5', ico: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>' },
    { k: 'g6', ico: '<circle cx="7" cy="9" r="2.2"/><circle cx="15" cy="9" r="2.2"/><path d="M9.2 9h3.6"/><circle cx="7" cy="16" r="2.2"/><circle cx="15" cy="16" r="2.2"/><path d="M9.2 16h3.6"/>' },
  ];

  function atTablero(encendido) {
    const tab = $('#at-tablero');
    if (!tab) return;
    tab.classList.toggle('oculto', !encendido);
    if (!encendido) { tab.classList.remove('ve'); return; }
    tab.querySelector('.at-estado span').textContent = t('at.nove');
    tab.querySelector('.at-gestos').innerHTML = AT_GESTOS.map(g => `
      <li data-g="${g.k}"><svg viewBox="0 0 24 24" aria-hidden="true">${g.ico}</svg>
      <span>${esc(t('at.' + g.k))}</span></li>`).join('');
  }

  /* Se enciende el gesto que se acaba de usar y se apaga solo. */
  let atLuz = {};
  function atGestoVivo(k) {
    const li = document.querySelector(`#at-tablero li[data-g="${k}"]`);
    if (!li) return;
    li.classList.add('hace');
    clearTimeout(atLuz[k]);
    atLuz[k] = setTimeout(() => li.classList.remove('hace'), 900);
  }

  /* La mano perdida no es un fallo silencioso: se dice. Con un respiro de
     medio segundo, que un parpadeo del detector no tiene por qué asustar. */
  let atVistaReloj = null;
  function atMano(seVe) {
    const tab = $('#at-tablero');
    if (!tab || tab.classList.contains('oculto')) return;
    const decir = (k) => {
      const s = tab.querySelector('.at-estado span');
      if (s) s.textContent = t(k);
    };
    if (seVe) {
      clearTimeout(atVistaReloj); atVistaReloj = null;
      if (!tab.classList.contains('ve')) { tab.classList.add('ve'); decir('at.ve'); }
    } else if (!atVistaReloj && tab.classList.contains('ve')) {
      atVistaReloj = setTimeout(() => {
        tab.classList.remove('ve');
        decir('at.nove');
        atVistaReloj = null;
      }, 520);
    }
  }

  function atPunto(p) {
    const cur = $('#at-cursor');
    if (!cur) return;
    atMano(!!p.presente);
    if (!p.presente) {
      cur.classList.add('oculto');
      atMirarLimpiar();
      atMirarCieloLimpiar();
      if (atAgarre) atSoltar(p);
      return;
    }
    atGestoVivo('g1');
    cur.classList.remove('oculto');
    cur.style.transform = `translate(${p.x}px, ${p.y}px)`;
    cur.classList.toggle('pellizco', !!p.pellizco);
    if (!p.pellizco && !atAgarre) {
      let boton = atBajo(p.x, p.y)?.closest(AT_MIRABLES) || null;
      if (boton && atPaga(boton)) boton = null;
      if (boton) { atMirarCieloLimpiar(); atMirar(boton, p); }
      else { atMirarLimpiar(); atMirarCielo(p); }
    } else { atMirarLimpiar(); atMirarCieloLimpiar(); }
    if (!p.pellizco) atZoomMano(p);
    if (p.pellizco && !atAgarre) {
      atGestoVivo('g2');
      const el = atBajo(p.x, p.y);
      /* Qué planeta había DEBAJO al cerrar la mano. Se guarda ahora y no al
         soltar: para cuando se suelta, el motor puede estar ya en pleno
         tránsito y no contesta quién hay bajo el punto — y el doble pellizco
         se quedaba sin destino. */
      const casaBajo = (() => { try { return window.__AE_MIRAR?.(p.x, p.y) || null; } catch { return null; } })();
      /* ¿El agarre cae sobre un lienzo que MANEJA SUS PROPIOS GESTOS? La
         galaxia y el cerebro de GENESIS CORE giran solos con los eventos de
         puntero; si además se arrastrara la página, el pellizco haría dos
         cosas a la vez y ninguna bien. */
      const propio = !!el?.closest('.ae-casa, #gc-caja');
      atAgarre = { el, sx: atRodante(el), x0: p.x, y0: p.y, xa: p.x, ya: p.y,
                   movio: false, desde: performance.now(),
                   enCielo: propio, casa: casaBajo };
      atEvento('pointerdown', p.x, p.y, el);
    } else if (p.pellizco && atAgarre) {
      const dx = p.x - atAgarre.xa, dy = p.y - atAgarre.ya;
      atAgarre.xa = p.x; atAgarre.ya = p.y;
      if (Math.hypot(p.x - atAgarre.x0, p.y - atAgarre.y0) > 12) atAgarre.movio = true;
      if (atAgarre.movio) {
        /* Sobre la galaxia, agarrar es GIRAR EL CIELO: el pellizco arrastrado
           es el mismo timón que el dedo en la pantalla, y la página no se
           mueve ni un pixel debajo. En el resto de la casa, agarrar sigue
           siendo llevarse la vista. */
        if (atAgarre.enCielo) { atGestoVivo('g3'); atEvento('pointermove', p.x, p.y, atAgarre.el); }
        else if (atAgarre.sx) { atAgarre.sx.scrollTop -= dy; atAgarre.sx.scrollLeft -= dx; }
        else { window.scrollBy(-dx, -dy); atEvento('pointermove', p.x, p.y, atAgarre.el); }
      }
    } else if (!p.pellizco && atAgarre) {
      atSoltar(p);
    }
  }

  /* ACERCAR CON LA MANO. Sobre la galaxia, la mano ABIERTA que se acerca a la
     cámara acerca el cielo, y la que se aleja lo aleja: es el gesto que
     cualquiera hace sin que se lo expliquen. Se mide el ancho de la palma —el
     mismo número que usa el motor para no depender de la distancia— y solo
     cuenta si el cambio es DELIBERADO: una zona muerta del 6% deja pasar el
     temblor de la mano quieta sin mover nada. */
  let atPalma = null;
  function atZoomMano(p) {
    const mando = window.__AE_VISTA;
    if (!mando || !p.presente || !p.escala) { atPalma = null; return; }
    /* Sobre cualquier lienzo que maneje sus gestos: la galaxia y el cerebro
       de GENESIS CORE. Antes solo valía para la galaxia. */
    if (!atBajo(p.x, p.y)?.closest('.ae-casa, #gc-caja')) { atPalma = null; return; }
    if (atPalma === null) { atPalma = p.escala; return; }
    const razon = p.escala / atPalma;
    if (razon > 1.06 || razon < 1 / 1.06) {
      // palma más grande = mano más cerca = cielo más cerca
      atGestoVivo('g4');
      mando.zoom(Math.min(1.12, Math.max(0.89, 1 / razon)));
      atPalma = p.escala;
    }
  }

  /* DOBLE PELLIZCO: dos pellizcos cortos seguidos abren lo que esté debajo.
     Es la salida rápida para quien no quiere esperar a la mirada — el mismo
     gesto que un doble toque, hecho en el aire. */
  let atUltimoPellizco = 0;

  function atSoltar(p) {
    const a = atAgarre;
    atAgarre = null;
    if (!a) return;
    const x = p?.x ?? a.xa, y = p?.y ?? a.ya;
    atEvento('pointerup', x, y, a.el);
    /* Las ventanas son generosas a propósito: en un teléfono ocupado —o con
       el cielo 3D dibujando— un pellizco «corto» de verdad puede tardar medio
       segundo largo en llegar hasta aquí. Apretar la ventana no hace el gesto
       más preciso: hace que no funcione en el aparato de nadie. */
    if (!a.movio && performance.now() - a.desde < 700) {
      const ahora = performance.now();
      /* Hasta segundo y medio entre los dos: una persona los hace en medio
         segundo, pero en un teléfono ocupado el segundo pellizco puede llegar
         tarde al hilo — y que el gesto no responda es peor que aceptarlo un
         poco más lento. */
      if (ahora - atUltimoPellizco < 1500) {
        atUltimoPellizco = 0;
        const casa = a.casa || (() => { try { return window.__AE_MIRAR?.(x, y); } catch { return null; } })();
        if (casa) {
          atGestoVivo('g6');
          try { TONO.clic(true); } catch { /* nada */ }
          $('#at-cursor')?.classList.add('toco');
          setTimeout(() => $('#at-cursor')?.classList.remove('toco'), 320);
          try { window.__AE_TOCAR(casa.key); } catch { /* nada */ }
          return;
        }
      }
      atUltimoPellizco = ahora;
    }
    /* El toque: pellizco corto y quieto. El click va al elemento que está
       bajo el cursor AL SOLTAR — como un dedo de verdad. */
    if (!a.movio && performance.now() - a.desde < 700) {
      const el = atBajo(x, y);
      try { TONO.clic(); } catch { /* sin audio no pasa nada */ }
      $('#at-cursor')?.classList.add('toco');
      setTimeout(() => $('#at-cursor')?.classList.remove('toco'), 320);
      try {
        el?.dispatchEvent(new MouseEvent('click', {
          bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y,
        }));
      } catch { /* nada */ }
    }
  }

  let p2cPortadaVista = false;
  let p2cPortadaCapa = null;

  /* La quita quien salga del chat, sin esperar al reloj. */
  function p2cPortadaFuera() {
    p2cPortadaCapa?.remove();
    p2cPortadaCapa = null;
  }

  function p2cPortada() {
    if (p2cPortadaVista) return;
    p2cPortadaVista = true;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const capa = document.createElement('div');
    capa.id = 'p2c-portada';
    capa.setAttribute('aria-hidden', 'true');
    capa.innerHTML = `
      <img src="assets/p2c-simbolo.png" alt="">
      <div class="p2c-porta-nombre">PULSE<b>2</b>CHAT</div>
      <svg class="p2c-porta-pulso" viewBox="0 0 320 48" fill="none">
        <path d="M0 24h96l14-16 18 32 14-24 10 8h168" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <p>${t('cha.lema')}</p>`;
    document.body.appendChild(capa);
    // La capa se despinta con su propia animación y recién entonces se va.
    setTimeout(() => { if (vistaActual === 'chat') capa.classList.add('yendo'); }, 1700);
    setTimeout(() => capa.remove(), 2350);
    /* Y si la persona se fue del chat antes de que termine el saludo, el
       saludo se va con ella: nada de una marca ajena flotando sobre otra
       vista. */
    p2cPortadaCapa = capa;
  }

  /* Lo que el chat sabe de una persona, para pintarle la cara en la llamada.
     Busca en las charlas y en la gente ya traída; si no hay nada, la inicial. */
  function fichaDe(correo) {
    const c = String(correo || '').toLowerCase();
    return (chatSt.convs || []).find(x => x.correo === c)
        || (chatSt.gente || []).find(x => x.correo === c)
        || (chatSt.con?.id === c ? chatSt.con : null)
        || { correo: c, nombre: c.split('@')[0] };
  }

  /* La presencia se pinta sola, sin repintar el chat entero: cambia mucho más
     seguido que cualquier otra cosa y un repintado roba foco y scroll. */
  function pintarPresencia() {
    const c = chatSt.con;
    const el = $('#cha-linea');
    if (el && c && !c.esGrupo) {
      el.classList.toggle('en-linea', chatSt.enLinea === true);
      el.textContent = chatSt.enLinea ? t('cha.enLinea') : (c.gid || c.id);
    }
    // Y si hay una llamada en curso, su pantalla se repinta para que el aviso
    // de disponibilidad («le esta sonando» / «no esta en el chat») siga vivo.
    if (window.LLAMADA && LLAMADA.estado() !== 'libre') pintarLlamada(LLAMADA.cuento());
  }

  /* ── LOS AJUSTES DE LA LLAMADA ───────────────────────────────────────────
   *
   * Elegir micrófono y cámara SIN colgar. Los nombres de los aparatos solo
   * existen con el permiso ya dado, así que este panel vive dentro de la
   * llamada, que es además el único momento en que cambiarlos significa algo.
   */
  async function llamadaAjustes() {
    const panel = $('#lla-ajustes');
    if (!panel) return;
    if (!panel.classList.contains('oculto')) return panel.classList.add('oculto');
    // El panel vive en el HTML fijo; sus rótulos se traducen al abrirlo.
    panel.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
    try {
      const ap = await LLAMADA.aparatos();
      const opciones = (lista, puesto) => lista.map((x, i) =>
        `<option value="${esc(x.deviceId)}" ${x.deviceId === puesto ? 'selected' : ''}>${
          esc(x.label || `${t('lla.aparato')} ${i + 1}`)}</option>`).join('');
      $('#lla-sel-mic').innerHTML = opciones(ap.mics, ap.puestos.mic);
      const conVideo = LLAMADA.cuento().hayVideo;
      $('#lla-cam-fila').classList.toggle('oculto', !conVideo || !ap.cams.length);
      if (conVideo) $('#lla-sel-cam').innerHTML = opciones(ap.cams, ap.puestos.cam);
      panel.classList.remove('oculto');
    } catch { avisar(t('lla.aparatoNo')); }
  }

  const llamadaAparato = (clase, id) =>
    LLAMADA.usarAparato(clase, id).catch(() => avisar(t('lla.aparatoNo')));

  /* La pantalla. Se pinta a mano y no con `vista()` porque una llamada no es
     una vista: pasa POR ENCIMA de la que sea, y navegar no debe cortarla. */
  function pintarLlamada(c) {
    const capa = $('#lla');
    if (!capa) return;
    const activa = c.estado !== 'libre';
    capa.classList.toggle('oculto', !activa);
    llamadaArrastrar(capa);
    // Con video la burbuja lo enseña; sin video enseña el nombre y un pulso,
    // que en una llamada de voz es lo unico que hay para mirar.
    capa.classList.toggle('con-video', !!c.hayVideo);
    /* Mientras suena, los aros laten alrededor de la cara; ya hablando se
       quedan quietos. Es el «está sonando» que se entiende sin leer. */
    capa.classList.toggle('sonando', ['llamando', 'entrando', 'conectando'].includes(c.estado));
    clearInterval(llaReloj); llaReloj = null;

    /* EL TIMBRE.
     *
     * Se maneja aqui, donde se sabe el estado de verdad, y no dentro de
     * llamada.js: el modulo de WebRTC no deberia saber que existe un altavoz.
     * `sonar()` no hace nada si ya esta sonando ese mismo tono, asi que
     * llamarlo en cada repintado es gratis. */
    /* Y si esa conversación está silenciada, el teléfono NO suena. Es lo que
       la gente quiere decir con «silenciar a alguien»: no que la app deje de
       enseñar sus mensajes, sino que deje de hacer ruido por él. La pantalla
       de llamada entrante SIGUE apareciendo — silenciar no es bloquear, y
       esconder una llamada entera sería otra cosa que nadie pidió. */
    const mudo = estaMudo(c.conQuien);
    if (activa && c.estado === 'llamando') TONO.sonar('llamando');
    else if (activa && c.estado === 'entrando' && !mudo) TONO.sonar('entrando');
    else TONO.parar();

    if (!activa) {
      // Al colgar, la ventana vuelve a su sitio: la proxima llamada no debe
      // aparecer chiquita en una esquina porque la anterior quedo asi.
      capa.classList.remove('mini', 'sonando');
      capa.style.inset = '';
      $('#lla-ajustes')?.classList.add('oculto');
      llaMini = false; llaPos = null; llaSono = false; llaHabla0 = 0;
      /* El motivo de la caída se dice UNA vez y con nombre propio. «Sin
         camino» es el caso del TURN que no tenemos, y confundirlo con
         «colgaste» deja a la gente probando diez veces creyendo que es su
         internet. */
      // Un golpe corto al terminar: distinto si salio bien que si no. Es la
      // diferencia entre «se colgo» y «algo fallo» sin leer nada.
      TONO.golpe(c.motivo === 'yo' || c.motivo === 'el-otro');
      const dicho = { 'sin-camino': 'lla.sinCamino', 'corte': 'lla.corte',
                      'rechazada': 'lla.rechazada', 'ocupado': 'lla.ocupado',
                      'sin-respuesta': 'lla.sinRespuesta',
                      'no-se-pudo': 'lla.noSePudo' }[c.motivo];
      if (dicho) avisar(t(dicho));
      /* El diagnóstico va al registro, no a la cara de nadie: a quien llama no
         le sirve saber qué es un candidato `srflx`. A nosotros sí, para saber
         si hace falta pagar el relevo o si el problema es otro. */
      if (c.motivo === 'sin-camino') {
        console.warn('[llamada] no conectó · caminos encontrados:', c.caminos,
                     '· haría falta un relevo TURN:', c.hizoFaltaRelevo);
        tele('accion', 'llamada.sin-camino');
      }
      return;
    }

    const nombre = chatSt.con?.id === c.conQuien
      ? (chatSt.con.nombre || c.conQuien) : (c.conQuien || '');
    $('#lla-quien').textContent = nombre;
    const mq = $('#lla-mini-quien'); if (mq) mq.textContent = nombre;

    /* LA CARA. En una llamada de voz es lo único que hay para mirar, y en una
       de video acompaña mientras suena — cuando la conexión entra, el video
       remoto toma el centro y la cara se aparta. La foto sale de lo que el
       chat ya sabe de esa persona; sin foto, su inicial sobre el gradiente. */
    const conCara = c.estado !== 'hablando' || !c.hayVideo;
    const cara = $('#lla-cara');
    if (cara) {
      cara.classList.toggle('oculto', !conCara);
      const f = fichaDe(c.conQuien);
      const sello = `${c.conQuien}·${f.foto || ''}`;
      const foto = $('#lla-foto');
      if (foto && foto.dataset.sello !== sello) {
        foto.dataset.sello = sello;
        foto.innerHTML = f.foto
          ? `<img src="${esc(CHAT.urlArchivo(f.foto))}" alt="">`
          : `<span>${esc(chatIni(f.nombre || c.conQuien))}</span>`;
      }
    }

    /* Y LA DISPONIBILIDAD, dicha de frente mientras suena: si el relevo lo ve
       en el chat, «le está sonando»; si no, se dice que el aviso salió pero
       que la llamada entra recién cuando abra PULSE2CHAT. Sin esto la gente
       llama tres veces creyendo que la primera falló. */
    const lin = $('#lla-linea');
    if (lin) {
      const decir = c.estado === 'llamando'
        && chatSt.con?.id === c.conQuien && chatSt.enLinea !== null;
      lin.classList.toggle('oculto', !decir);
      if (decir) {
        lin.textContent = t(chatSt.enLinea ? 'lla.estaAhi' : 'lla.noEsta');
        lin.classList.toggle('lla-fuera', !chatSt.enLinea);
      }
    }
    // Si la persona la movio de sitio, ahi se queda.
    if (llaMini && llaPos) capa.style.inset = `${llaPos.arr}px auto auto ${llaPos.izq}px`;
    $('#lla-entra').classList.toggle('oculto', c.estado !== 'entrando');
    $('#lla-mandos').classList.toggle('oculto', c.estado === 'entrando');
    pintarBotonPantalla('#lla-pant');
    /* Los videos se re-enganchan cada vez que se pinta. Asignar `srcObject` a
       un elemento que todavía estaba dentro de un contenedor oculto no siempre
       arranca la reproducción, y el resultado es el recuadro propio en negro
       aunque la cámara esté encendida. */
    LLAMADA.reengancharVideo();
    $('#lla-mic').classList.toggle('apagado', !c.micAbierto);
    $('#lla-cam').classList.toggle('apagado', !c.camAbierta);
    $('#lla-si-video').classList.toggle('oculto', !LLAMADA.entrante()?.video);

    const est = $('#lla-estado');
    if (c.estado === 'entrando') {
      est.textContent = t(LLAMADA.entrante()?.video ? 'lla.entraVideo' : 'lla.entraVoz');
    } else if (c.estado === 'llamando') {
      /* El contador de «llamando…» no es adorno: sin push del otro lado
         puede que no haya nadie escuchando, y ver los segundos correr es lo
         que hace que alguien cuelgue en vez de esperar para siempre. */
      llaReloj = setInterval(() => {
        const seg = Math.floor((Date.now() - llaDesde) / 1000);
        if (est) est.textContent = `${t('lla.llamando')} ${seg}s`;
        // Cuarenta y cinco segundos y se rinde sola: es lo que tarda alguien
        // en darse cuenta de que del otro lado no hay nadie.
        if (seg >= 45) LLAMADA.colgar('sin-respuesta');
      }, 500);
      est.textContent = t('lla.llamando');
    } else if (c.estado === 'conectando') {
      /* Los segundos también aquí. «Conectando…» quieto es indistinguible de
         una app colgada, y con el contador la persona ve que algo pasa y sabe
         cuánto lleva esperando. */
      llaReloj = setInterval(() => {
        const seg = Math.floor((Date.now() - llaDesde) / 1000);
        if (est) est.textContent = `${t('lla.conectando')} ${seg}s`;
      }, 500);
      est.textContent = t('lla.conectando');
    } else {
      // Al pasar a hablando por primera vez: un golpe corto y «entró la
      // llamada» en palabras. Sin el, la persona sigue mirando la pantalla
      // sin saber si ya se la oye.
      if (!llaSono) { llaSono = true; llaHabla0 = Date.now(); TONO.golpe(true); }
      const pinta = () => {
        const seg = Math.floor((Date.now() - llaHabla0) / 1000);
        // El primer segundo dice QUE entró; después, cuánto lleva. Las dos
        // cosas juntas no caben y la segunda es la que sirve el resto del rato.
        if (seg < 2) { est.textContent = t('lla.entro'); return; }
        const dur = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
        est.textContent = `${c.compartiendo ? t('lla.compartiendo') : t('lla.hablando')} · ${dur}`;
      };
      llaReloj = setInterval(pinta, 1000);
      pinta();
    }
  }

  /* ── GRABAR Y MANDAR UNA NOTA DE VOZ ─────────────────────────────────────
   *
   * Se toca para empezar y se toca para mandar. NO se mantiene apretado: en
   * una web el «mantener pulsado» se corta solo cuando el dedo se desliza sin
   * querer o cuando el navegador decide que fue un gesto de scroll, y la nota
   * se pierde a media frase. Dos toques es aburrido y no falla.
   *
   * El contador se actualiza solo, sin repintar el chat entero: repintar cada
   * segundo tira el foco del campo de texto y hace parpadear las imágenes ya
   * cargadas.
   */
  let vozDesde = 0;
  let vozReloj = null;

  function vozContar() {
    clearInterval(vozReloj);
    vozReloj = setInterval(() => {
      const e = $('#cha-grab-t');
      if (!e) return;
      const seg = Math.floor((Date.now() - vozDesde) / 1000);
      e.textContent = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
      // Tope de tres minutos: una nota más larga que eso no cabe en 8MB y
      // fallaría al subir, después de que alguien la grabara entera.
      if (seg >= 180) chatVoz();
    }, 250);
  }

  async function chatVoz() {
    if (!chatSt.con || chatSt.subiendo) return;

    // ── segundo toque: cerrar y mandar ──
    if (chatSt.grabando) {
      clearInterval(vozReloj);
      const segundos = (Date.now() - vozDesde) / 1000;
      chatSt.grabando = false;
      const trozo = await CHAT.grabarFin(false);
      if (!trozo) { pintarChat(); return avisar(t('cha.vozCorta')); }
      chatSt.subiendo = true;
      pintarChat();
      try {
        const adj = await CHAT.subirVoz(trozo, segundos);
        await CHAT.enviarAdjunto(chatSt.con.id, adj, '');
        await chatCargarMsgs();
        chatCargarConvs();
      } catch (e) {
        avisar(e?.code === 413 ? t('cha.pesa') : t('cha.errVoz'));
      } finally { chatSt.subiendo = false; pintarChat(); }
      return;
    }

    // ── primer toque: pedir el micrófono y arrancar ──
    try {
      vozDesde = await CHAT.grabarInicio();
      chatSt.grabando = true;
      pintarChat();
      vozContar();
    } catch (e) {
      /* Que el micrófono esté negado y que no haya micrófono son cosas
         distintas, y la salida también: una se arregla en los permisos del
         navegador y la otra no se arregla. */
      const negado = /NotAllowed|Permission/i.test(String(e?.name || e?.message || ''));
      avisar(negado ? t('cha.vozNegado') : t('cha.vozSinMic'));
    }
  }

  /** Arrepentirse. Lo grabado se tira y no se sube nada. */
  async function chatVozCancelar() {
    if (!chatSt.grabando) return;
    clearInterval(vozReloj);
    chatSt.grabando = false;
    await CHAT.grabarFin(true);
    pintarChat();
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

  /* ── LOS MANDOS DE LA CASA ────────────────────────────────────────────── */

  /** «Hace 3 h». Un estado vive 24 horas, así que la unidad más grande que
      hace falta es la hora: poner días sería preparar un caso que no existe. */
  function hace(cuando) {
    const min = Math.max(0, Math.round((Date.now() - cuando) / 60000));
    if (min < 1) return t('cha.reciEn');
    if (min < 60) return t('cha.haceMin').replace('{n}', min);
    return t('cha.haceH').replace('{n}', Math.floor(min / 60));
  }

  function p2cTab(cual) {
    chatSt.tab = cual;
    /* Salir de «gente» limpia la búsqueda: volver a la pestaña y encontrarse
       los resultados de hace media hora hace pensar que la app se quedó
       colgada. */
    if (cual !== 'gente') { chatSt.gente = null; chatSt.busca = ''; }
    pintarChat();
    if (cual === 'gente' && chatSt.circulo === null) chatCargarCirculo();
  }

  function p2cFiltrar(v) { chatSt.filtra = v; pintarChat(); }

  async function chatCargarCirculo() {
    try { chatSt.circulo = await CHAT.circulo(); }
    catch { chatSt.circulo = { amigos: [], recibidas: [], enviadas: [] }; }
    pintarChat();
  }

  async function chatCargarEstados() {
    try { chatSt.estados = await CHAT.estados(); }
    catch { chatSt.estados = []; }
    pintarChat();
  }

  async function p2cAgregar(correo) {
    try {
      await CHAT.pedirAmistad(correo);
      /* Se retoca el resultado que ya está en pantalla en vez de volver a
         buscar: la búsqueda tarda, y el botón tiene que responder al dedo en
         el acto o parece que no se pulsó. */
      const x = (chatSt.gente || []).find(g => g.correo === correo);
      if (x) x.lazo = 'enviada';
      chatSt.circulo = null;
      pintarChat();
      TONO?.golpe(true);
    } catch (e) { avisar(chatMotivo(e)); }
  }

  async function p2cResponder(correo, aceptar) {
    try {
      await CHAT.responderAmistad(correo, aceptar);
      const x = (chatSt.gente || []).find(g => g.correo === correo);
      if (x) x.lazo = aceptar ? 'amigos' : 'no';
      await chatCargarCirculo();
      if (aceptar) {
        /* ACEPTAR A ALGUIEN LO DEJA YA EN LA LIBRETA, sin tocar «guardar».
           Es lo que hace que las dos mitades se sientan una sola: quien te
           acepta aparece en Contactos con su dirección puesta, y mandarle
           ORIGEN es tocar un botón en vez de copiar una dirección a mano. */
        const nuevo = (chatSt.circulo?.amigos || []).find(a => a.correo === correo);
        if (nuevo) apuntarContacto({ nombre: nuevo.nombre, dir: nuevo.addr,
                                     correo: nuevo.correo, gid: nuevo.gid, foto: nuevo.foto });
        chatCargarConvs();
        TONO?.golpe(true);
      }
    } catch (e) { avisar(chatMotivo(e)); }
  }

  async function p2cQuitar(correo) {
    const quien = (chatSt.circulo?.amigos || []).find(x => x.correo === correo);
    /* Se dice lo que pasa Y lo que NO pasa. Quitar a alguien del círculo no
       borra la conversación, y quien crea que sí se llevaría una sorpresa
       fea. */
    if (!await chatConfirmar(t('cha.quitar'),
      t('cha.quitarNota').replace('{n}', quien?.nombre || correo),
      t('cha.quitar'), true)) return;
    try {
      await CHAT.quitarAmigo(correo);
      await chatCargarCirculo();
    } catch (e) { avisar(chatMotivo(e)); }
  }

  /* ── los estados ──────────────────────────────────────────────────────── */

  function p2cVerEstado(correo) {
    const g = (chatSt.estados || []).find(x => x.correo === correo);
    if (!g?.estados?.length) return;
    /* Se abre en el primero SIN VER, no en el primero de todos: quien ya vio
       tres de cinco quiere el cuarto, no volver a empezar. */
    const i = Math.max(0, g.estados.findIndex(e => !e.visto));
    chatSt.viendo = { quien: correo, i: g.estados[i] ? i : 0 };
    pintarChat();
    p2cMarcarVisto();
  }

  function p2cMarcarVisto() {
    const v = chatSt.viendo;
    const g = (chatSt.estados || []).find(x => x.correo === v?.quien);
    const e = g?.estados?.[v?.i];
    if (!e || e.visto) return;
    e.visto = true;
    g.sinVer = g.estados.filter(x => !x.visto).length;
    CHAT.estadoVisto(e.id);
  }

  /** Tocar pasa al siguiente. En la mitad izquierda, al anterior — el gesto
      que ya tiene aprendido cualquiera que haya visto un estado en su vida. */
  function p2cEstadoSig(ev) {
    const v = chatSt.viendo;
    if (!v) return;
    const g = (chatSt.estados || []).find(x => x.correo === v.quien);
    if (!g) return p2cEstadoCerrar();
    const caja = ev?.currentTarget?.getBoundingClientRect?.();
    const atras = caja && ev.clientX != null && (ev.clientX - caja.left) < caja.width * 0.32;
    const sig = v.i + (atras ? -1 : 1);
    if (sig < 0) return;
    if (sig >= g.estados.length) return p2cEstadoCerrar();
    chatSt.viendo = { quien: v.quien, i: sig };
    pintarChat();
    p2cMarcarVisto();
  }

  function p2cEstadoCerrar() { chatSt.viendo = null; pintarChat(); }

  async function p2cBorrarEstado(id) {
    if (!await chatConfirmar(t('cha.borrar'), t('cha.borrarEstadoP'), t('cha.borrar'), true)) return;
    try { await CHAT.borrarEstado(id); } catch {}
    chatSt.viendo = null;
    await chatCargarEstados();
  }

  function p2cSubirAbrir() {
    chatSt.subeEstado = { texto: '', fondo: 0, adj: null, previa: '' };
    pintarChat();
    setTimeout(() => $('#p2c-est-txt')?.focus(), 60);
  }
  function p2cSubirCerrar() {
    // La previa es un blob del navegador: si no se suelta, se queda ocupando
    // memoria hasta que se recargue la pagina.
    if (chatSt.subeEstado?.previa) URL.revokeObjectURL(chatSt.subeEstado.previa);
    chatSt.subeEstado = null;
    pintarChat();
  }
  /* El texto NO repinta: repintar en cada tecla le quitaría el foco al área y
     la persona escribiría una letra por toque. Se guarda y punto. */
  function p2cSubirTexto(v) { if (chatSt.subeEstado) chatSt.subeEstado.texto = v; }
  function p2cSubirFondo(i) {
    if (!chatSt.subeEstado) return;
    chatSt.subeEstado.texto = $('#p2c-est-txt')?.value ?? chatSt.subeEstado.texto;
    chatSt.subeEstado.fondo = i;
    pintarChat();
  }
  function p2cSubirFoto(input) {
    const f = input?.files?.[0];
    if (!f || !chatSt.subeEstado) return;
    chatSt.subeEstado.texto = $('#p2c-est-txt')?.value ?? chatSt.subeEstado.texto;
    if (chatSt.subeEstado.previa) URL.revokeObjectURL(chatSt.subeEstado.previa);
    chatSt.subeEstado.adj = f;
    chatSt.subeEstado.previa = URL.createObjectURL(f);
    pintarChat();
  }

  async function p2cSubirHacer(btn) {
    const s = chatSt.subeEstado;
    if (!s) return;
    const texto = ($('#p2c-est-txt')?.value ?? s.texto).trim();
    if (!texto && !s.adj) return avisar(t('cha.estadoVacio'));
    bcPreparar(btn); bcTrabajando(btn);
    try {
      let archivo = '';
      if (s.adj) archivo = (await CHAT.subir(s.adj)).id;
      await CHAT.subirEstado({ texto, archivo, fondo: s.fondo });
      bcHecho(btn);
      setTimeout(async () => {
        p2cSubirCerrar();
        await chatCargarEstados();
      }, 620);
    } catch (e) {
      bcSoltar(btn);
      avisar(chatMotivo(e));
    }
  }

  /* ── BLOQUEAR ─────────────────────────────────────────────────────────── */

  async function p2cBloquear(correo, si = true) {
    const quien = correo.split('@')[0];
    if (si && !await chatConfirmar(t('cha.bloquear'),
      t('cha.bloquearNota').replace('{n}', quien), t('cha.bloquear'), true)) return;
    try {
      await CHAT.bloquear(correo, si);
      if (si && chatSt.con?.id === correo) { chatSt.con = null; chatSt.ficha = null; }
      await chatCargarCirculo();
      chatCargarConvs();
      chatCargarEstados();
      avisar(t(si ? 'cha.bloqueadoOk' : 'cha.desbloqueadoOk'));
    } catch (e) { avisar(chatMotivo(e)); }
  }

  /** La ficha de alguien del círculo, desde la lista de gente. */
  function p2cFichaRapida(correo) {
    const a = (chatSt.circulo?.amigos || []).find(x => x.correo === correo);
    chatSt.con = { id: correo, nombre: a?.nombre || correo, esGrupo: false,
                   gid: a?.gid || '', addr: a?.addr || '' };
    chatSt.msgs = null;
    pintarChat();
    chatVerFicha();
  }

  function borrarContactoAqui(id) {
    guardarContactos(leerContactos().filter(c => c.id !== id));
    avisar(t('con.borrado'));
    pintarChat();
  }

  /* ── BORRAR UN MENSAJE ─────────────────────────────────────────────────
   *
   * Se PREGUNTA cuál de las dos cosas, porque son cosas distintas y la gente
   * las confunde: esconderlo de mi pantalla no se lo quita a la otra persona.
   * Un solo botón que hiciera una de las dos en silencio dejaría a alguien
   * creyendo que borró algo que sigue estando.
   */
  async function chatBorrarMsg(id) {
    const m = (chatSt.msgs || []).find(x => x.id === id);
    if (!m) return;
    const mio = m.de === (sesion?.correo || '').toLowerCase();
    const que = await chatElegir({
      titulo: t('cha.borrarMsg'),
      nota: mio ? t('cha.borrarMsgP') : t('cha.borrarMsgSoloMio'),
      opciones: [
        ...(mio ? [{ clave: 'todos', texto: t('cha.borrarTodos'), peligro: true }] : []),
        { clave: 'mi', texto: t('cha.borrarMio') },
      ],
    });
    if (!que) return;
    try {
      await CHAT.borrarMsg(id, que === 'todos');
      chatSt.reaccionando = null;
      await chatCargarMsgs();
      chatCargarConvs();
    } catch (e) { avisar(chatMotivo(e)); }
  }

  /* Una hoja con varias salidas, no solo sí/no. `chatConfirmar` solo sabe de
     dos, y forzar tres decisiones en dos botones es como nacen los menús que
     nadie entiende. */
  function chatElegir({ titulo, nota, opciones }) {
    return new Promise(resolver => {
      chatSt.elegir = { titulo, nota, opciones, resolver };
      pintarChat();
    });
  }
  function chatElegido(clave) {
    const e = chatSt.elegir;
    chatSt.elegir = null;
    pintarChat();
    e?.resolver(clave || null);
  }
  function chatHojaElegir() {
    const e = chatSt.elegir;
    if (!e) return '';
    return `
      <div class="cha-ficha" onclick="if(event.target===this)VETA.chatElegido()">
        <div class="chaf-hoja">
          <button class="chaf-x" onclick="VETA.chatElegido()" aria-label="${t('tok.volver')}">✕</button>
          <h3>${esc(e.titulo)}</h3>
          ${e.nota ? `<p class="chaf-honesto" style="margin:10px 0 0;padding:0;border:0">${esc(e.nota)}</p>` : ''}
          <div class="chaf-acciones" style="margin-top:16px;flex-direction:column">
            ${e.opciones.map(o => `
              <button class="btn ${o.peligro ? 'btn-linea chaf-malo' : 'btn-p2c'} btn-sm"
                      onclick="VETA.chatElegido(${jsTxt(o.clave)})" style="width:100%">${esc(o.texto)}</button>`).join('')}
            <button class="btn btn-linea btn-sm" onclick="VETA.chatElegido()" style="width:100%">${t('cha.cancelar')}</button>
          </div>
        </div>
      </div>`;
  }

  /* ── REENVIAR ──────────────────────────────────────────────────────────
   *
   * Se manda un mensaje NUEVO con el mismo texto, no se «mueve» el original:
   * el original es de la conversación donde está y de las dos personas que la
   * tienen. Y va SIN decir de quién venía, a propósito — reenviar algo con el
   * nombre de quien lo escribió es publicar a una persona en una conversación
   * en la que no entró.
   */
  async function chatReenviar(id) {
    const m = (chatSt.msgs || []).find(x => x.id === id);
    if (!m?.texto) return avisar(t('cha.nadaQueReenviar'));
    const gente = contactosUnidos().filter(x => x.correo);
    const grupos = (chatSt.convs || []).filter(c => c.esGrupo);
    if (!gente.length && !grupos.length) return avisar(t('cha.aQuienReenviar'));
    const a = await chatElegir({
      titulo: t('cha.reenviar'),
      nota: t('cha.reenviarNota'),
      opciones: [
        ...gente.slice(0, 12).map(x => ({ clave: x.correo, texto: x.nombre })),
        ...grupos.slice(0, 8).map(g => ({ clave: g.id, texto: g.nombre })),
      ].filter(o => o.clave !== chatSt.con?.id),
    });
    if (!a) return;
    try {
      await CHAT.enviar(a, m.texto);
      chatSt.reaccionando = null;
      avisar(t('cha.reenviado'));
      chatCargarConvs();
      pintarChat();
    } catch (e) { avisar(chatMotivo(e)); }
  }

  /** Copiar lo que dice un mensaje. Lo más pedido y lo más barato de todo. */
  function chatCopiarMsg(id) {
    const m = (chatSt.msgs || []).find(x => x.id === id);
    if (!m?.texto) return avisar(t('cha.nadaQueCopiar'));
    copiarTexto(m.texto, t('cha.copiado'));
    chatSt.reaccionando = null;
    pintarChat();
  }

  /* ── BUSCAR DENTRO DE LA CONVERSACION ──────────────────────────────────
   *
   * En la memoria y no en el relevo, y por una razón que no es la velocidad:
   * los mensajes van cifrados, así que el servidor NO PUEDE buscarlos aunque
   * quisiera. Buscar solo puede pasar aquí, donde están abiertos. Es el precio
   * del candado, y es un precio que vale la pena.
   */
  function chatBuscarHilo(v) {
    chatSt.buscaHilo = v;
    pintarChat();
  }
  function chatBuscarHiloAbrir() {
    chatSt.buscaHilo = chatSt.buscaHilo == null ? '' : null;
    pintarChat();
    if (chatSt.buscaHilo === '') setTimeout(() => $('#cha-busca-hilo')?.focus(), 60);
  }

  /* ── SILENCIAR ─────────────────────────────────────────────────────────
     Vive en este navegador: silenciar es una decisión sobre MI teléfono, no
     sobre la conversación, y mandarla al servidor la aplicaría también en la
     computadora del trabajo, que no es lo que nadie pide. */
  const LLAVE_MUDOS = 'veta.chat.mudos';
  const leerMudos = () => {
    try { return JSON.parse(localStorage.getItem(LLAVE_MUDOS) || '[]'); } catch { return []; }
  };
  const estaMudo = id => leerMudos().includes(String(id));
  function chatSilenciar(id) {
    const l = leerMudos();
    const nueva = l.includes(id) ? l.filter(x => x !== id) : [...l, id];
    try { localStorage.setItem(LLAVE_MUDOS, JSON.stringify(nueva)); } catch {}
    avisar(t(nueva.includes(id) ? 'cha.silenciado' : 'cha.conSonido'));
    pintarChat();
  }

  /* ── EL CODIGO DE SEGURIDAD ────────────────────────────────────────────
     Estaba construido y no se enseñaba en ninguna pantalla, o sea que no
     existía: un código que nadie puede comparar no protege de nada. */
  async function chatVerCodigo() {
    const c = chatSt.con;
    if (!c || c.esGrupo) return;
    chatSt.codigo = { cargando: true };
    pintarChat();
    try { chatSt.codigo = { texto: await CHAT.codigoCon(c.id) }; }
    catch { chatSt.codigo = { texto: null }; }
    pintarChat();
  }
  function chatCerrarCodigo() { chatSt.codigo = null; pintarChat(); }

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

  function chatFichaCerrar() { chatSt.ficha = null; chatSt.codigo = null; pintarChat(); }

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

  /* GUARDAR UN CONTACTO DESDE EL CHAT.
   *
   * Antes guardaba solo el nombre y la direccion, se quedaba callado con un
   * aviso que se iba a los tres segundos, y no habia forma de ir a ver la
   * libreta: la sensacion era que no se habia guardado nada. Tres cosas
   * cambian:
   *
   *   · se guarda TAMBIEN el correo y el Genesis ID, para que la misma ficha
   *     sirva para escribirle y para mandarle;
   *   · el aviso dice donde quedo — «en tus contactos», no «guardado»;
   *   · y se ofrece IR a verlo, que es lo unico que de verdad convence.
   */
  async function chatGuardarContacto() {
    const c = chatSt.con;
    const f = chatSt.ficha?.persona || {};
    const correo = f.correo || (c && !c.esGrupo ? c.id : '');
    const dir = f.addr || c?.addr || '';
    if (!correo && !dir) return avisar(t('cha.sinDir'));
    const que = apuntarContacto({ nombre: c?.nombre || f.nombre || correo,
                                  dir, correo, gid: f.gid, foto: f.foto });
    if (await chatConfirmar(
          t(que === 'igual' ? 'cha.contactoYa' : 'cha.contactoOk'),
          t('cha.contactoDonde'), t('cha.verContactos'))) {
      chatSt.ficha = null;
      vista('contactos');
    }
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
  /* ══ ABRIR LOS ADJUNTOS CIFRADOS DESPUÉS DE PINTAR ═══════════════════════
   *
   * Un adjunto cerrado son bytes que ninguna etiqueta sabe dibujar: hay que
   * bajarlo del relevo, abrirlo con la llave que venía DENTRO del mensaje y
   * recién entonces dárselo. Eso no cabe en una cadena de HTML, así que el
   * pintado deja la marca `data-cif` y esto la resuelve.
   *
   * Se hace UNA vez por elemento —la marca se quita al terminar— porque el
   * latido repinta cada cinco segundos, y volver a bajar y descifrar cada foto
   * del hilo cada cinco segundos sería quemar la batería por deporte. Las
   * direcciones ya abiertas quedan guardadas en el candado (`archivoAbierto`),
   * así que un repintado las vuelve a poner sin tocar la red.
   */
  function chatAbrirAdjuntos() {
    const marcados = document.querySelectorAll('[data-cif]');
    for (const el of marcados) {
      const id = el.getAttribute('data-cif');
      const k = el.getAttribute('data-k');
      const iv = el.getAttribute('data-iv');
      el.removeAttribute('data-cif');
      CHAT.archivoAbierto(id, k, iv).then((url) => {
        if (!url) {
          /* No se pudo abrir: se dice, en vez de dejar el hueco para siempre o
             —peor— pintar los bytes cifrados y enseñar una imagen rota. */
          el.classList.remove('abriendo');
          el.classList.add('cha-adj-roto');
          el.setAttribute('title', t('cha.adjNoAbre'));
          return;
        }
        if (el.tagName === 'A') el.href = url;
        else el.src = url;
        /* La etiqueta <a> envuelve a la <img>: la de dentro también quiere su
           dirección, y es la que se ve. */
        const dentro = el.querySelector?.('img, video, audio');
        if (dentro) { dentro.src = url; dentro.classList.remove('abriendo'); }
        el.classList.remove('abriendo');
      }).catch(() => { el.classList.remove('abriendo'); });
    }
  }

  function pintarChat() {
    if (vistaActual !== 'chat') return;
    const caja = $('#p2c');
    if (!caja) return;
    caja.toggleAttribute('data-abierto', chatHayPanel());
    const a = $('#p2c-arriba'), l = $('#p2c-cuerpo'), h = $('#chat-hilo');
    if (a) a.innerHTML = p2cArriba();
    if (l) {
      /* Se guarda dónde estaba el scroll y dónde el cursor. Sin esto, el
         latido de cada cinco segundos devolvería la lista arriba del todo y
         echaría a quien está escribiendo en el buscador — que es como se
         siente una app «que se mueve sola». */
      const alto = l.scrollTop;
      const foco = document.activeElement;
      const era = foco?.closest?.('#p2c-cuerpo') ? foco.id : null;
      const donde = era ? foco.selectionStart : null;
      l.innerHTML = p2cCuerpo();
      l.scrollTop = alto;
      if (era) {
        const otra = $('#' + era);
        if (otra) { otra.focus(); try { otra.setSelectionRange(donde, donde); } catch {} }
      }
    }
    if (h) {
      const txt = $('#chat-txt')?.value;
      h.innerHTML = chatHilo();
      const c = $('#chat-txt');
      if (c && txt) c.value = txt;
    }
    /* Las capas de encima —el visor de estados y el compositor— también se
       repintan, y al compositor hay que devolverle lo escrito y el cursor por
       la misma razón que a la lista. */
    const capas = $('#p2c-capas');
    if (capas) {
      const cajaTxt = $('#p2c-est-txt');
      const guardado = cajaTxt ? { v: cajaTxt.value, i: cajaTxt.selectionStart,
                                   tenia: document.activeElement === cajaTxt } : null;
      /* LA HOJA VA ACA, y no dentro del hilo, y esto arregla un fallo que
         dejaba cuatro botones muertos.
         Estaba interpolada en `chatHilo()`, que sale por `return` antes de
         llegar en cuatro casos: puerta de Genesis, error de red, Mi perfil, y
         —el que importaba— cuando no hay ningun hilo abierto. O sea que estando
         en la LISTA, que es justo donde esta el boton, tocar «Nuevo grupo» no
         hacia nada: ni error, ni aviso, ni nada en la consola. Y con el la
         promesa de `chatGrupo()` quedaba colgada para siempre.
         Se llevaba por delante tambien el lapiz de cambiar el propio nombre
         —su unica entrada, asi que el nombre no se podia cambiar nunca—, el
         borrar un estado propio y el quitar a alguien del circulo.
         `#p2c-capas` se repinta pase lo que pase, que es lo que una hoja
         modal necesita. */
      capas.innerHTML = p2cVisor() + p2cCompositor() + chatHoja() + chatHojaElegir();
      const nueva = $('#p2c-est-txt');
      if (nueva && guardado) {
        nueva.value = guardado.v;
        if (guardado.tenia) {
          nueva.focus();
          try { nueva.setSelectionRange(guardado.i, guardado.i); } catch {}
        }
      }
    }
    /* Y los adjuntos CIFRADOS se abren después de pintar, por lo mismo: un
       repintado deja marcas nuevas, y cada marca hay que bajarla y abrirla.
       Ver `chatAbrirAdjuntos`. */
    chatAbrirAdjuntos();
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
    if (m.tipo === 'voz') return t('cha.unaVoz');
    return m.texto || '';
  }

  /* LA PESTAÑA DE CHATS. Solo las conversaciones que ya existen, con un filtro
     que trabaja EN LA MEMORIA y no pregunta al relevo: filtrar entre veinte
     charlas propias es cosa del teléfono, y hacerlo por red haría parpadear la
     lista con cada tecla. Buscar gente nueva es lo otro, y vive en su pestaña.

     El filtro solo aparece cuando hay bastantes charlas: una caja de búsqueda
     encima de tres filas es un mueble que estorba. */
  function chatLista() {
    if (chatSt.puerta === 'falta') return '';
    const nuevo = `
      <button class="p2c-nuevo" onclick="VETA.chatGrupo()">
        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        <span>${t('cha.grupo')}</span>
      </button>`;

    if (chatSt.convs === null) {
      return [0, 1, 2].map(() => `
        <div class="cha-fila"><span class="cha-av esqueleto"></span>
          <span class="cha-txt"><b class="esqueleto">Cargando</b><small class="esqueleto">…</small></span>
        </div>`).join('');
    }
    if (!chatSt.convs.length) {
      /* El boton de grupo va TAMBIEN aca, y no es un detalle: se concatenaba
         solo al final de la lista de conversaciones, asi que quien acababa de
         entrar —el que mas lo necesita— no tenia ninguna puerta a los grupos.
         Ni la veia. */
      return `<div class="vacio"><b>${t('cha.vacioT')}</b>${t('cha.vacioP')}</div>
        <div class="p2c-empuja">
          <button class="btn btn-p2c btn-sm" onclick="VETA.p2cTab('gente')">${t('cha.irGente')}</button>
        </div>` + nuevo;
    }
    const filtro = (chatSt.filtra || '').trim().toLowerCase();
    const lista = filtro
      ? chatSt.convs.filter(c => `${c.nombre || ''} ${c.correo || ''}`.toLowerCase().includes(filtro))
      : chatSt.convs;
    const caja = chatSt.convs.length >= 6 ? `
      <div class="p2c-filtro">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
        <input placeholder="${t('cha.filtrar')}" value="${esc(chatSt.filtra || '')}"
               autocomplete="off" oninput="VETA.p2cFiltrar(this.value)">
      </div>` : '';

    if (!lista.length) {
      return caja + `<div class="vacio"><b>${t('cha.nadaFiltro')}</b>${t('cha.nadaFiltroP')}</div>`;
    }
    return caja + lista.map(c => {
      const id = c.id || c.correo;
      return `
      <button class="cha-fila" ${chatSt.con?.id === id ? 'data-aqui' : ''}
              onclick="VETA.chatAbrir(${jsTxt(id)})">
        ${/* El punto verde dice «está en el chat ahora»: sale del relevo, no
              es un adorno. Solo personas — un grupo no está ni deja de estar. */''}
        <span class="cha-av-marco">${chatAvatar(c)}${
          !c.esGrupo && c.enLinea ? '<i class="cha-pto"></i>' : ''}</span>
        <span class="cha-txt">
          <b>${esc(c.nombre || c.correo)}${c.esGrupo ? ` <em>· ${c.miembros}</em>` : ''}</b>
          <small>${esc(chatResumen(c.ultimo))}</small>
        </span>
        ${estaMudo(id) ? `<svg class="cha-mudo" viewBox="0 0 24 24" aria-label="${t('cha.silenciarBtn')}">
          <path d="M11 5 6 9H3v6h3l5 4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg>`
          : (c.sinLeer ? `<span class="cha-bola">${c.sinLeer}</span>` : '')}
      </button>`;
    }).join('') + nuevo;
  }

  /* LA PESTAÑA DE GENTE.
   *
   * Tres cosas en un orden que no es casual:
   *   1. QUIEN TE ESTA ESPERANDO. Una solicitud sin contestar es una persona
   *      parada en la puerta; va primero o no va.
   *   2. BUSCAR. El buscador está en medio y no arriba del todo justo por lo
   *      anterior: si tapara las solicitudes, se contestarían tarde.
   *   3. TU CIRCULO, con la salida de quitar a alguien a la vista. Poder
   *      deshacer donde se hizo es la mitad de que la gente se atreva a
   *      aceptar.
   */
  function p2cGente() {
    const c = chatSt.circulo;
    const busca = `
      <div class="p2c-filtro p2c-buscar">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
        <input id="chat-busca" placeholder="${t('cha.buscar')}" value="${esc(chatSt.busca)}"
               autocomplete="off" oninput="VETA.chatBuscar(this.value)">
      </div>`;

    /* Los resultados de una búsqueda tapan el resto: quien está buscando
       quiere ver lo que buscó, no su lista de siempre debajo. */
    if (chatSt.gente) {
      const g = chatSt.gente;
      return busca + (g.length ? g.map(x => `
        <div class="cha-fila p2c-quieto">
          ${chatAvatar(x)}
          <span class="cha-txt"><b>${esc(x.nombre || x.correo)}</b>
            <small>${esc(x.gid || x.correo)}</small></span>
          ${p2cBotonLazo(x)}
        </div>`).join('')
        : chatSt.buscaMal
          ? `<div class="vacio"><b>${t('cha.buscaMalT')}</b>${t('cha.buscaMalP')}</div>`
          : `<div class="vacio"><b>${t('cha.nadie')}</b>${t('cha.nadieP')}</div>`);
    }

    if (c === null) {
      return busca + [0, 1].map(() => `
        <div class="cha-fila"><span class="cha-av esqueleto"></span>
          <span class="cha-txt"><b class="esqueleto">Cargando</b><small class="esqueleto">…</small></span>
        </div>`).join('');
    }

    const pide = (c.recibidas || []).length ? `
      <h3 class="p2c-titulillo">${t('cha.teEsperan')}</h3>
      ${c.recibidas.map(x => `
        <div class="cha-fila p2c-quieto p2c-pide">
          ${chatAvatar(x)}
          <span class="cha-txt"><b>${esc(x.nombre || x.correo)}</b>
            <small>${esc(x.nota || x.gid || x.correo)}</small></span>
          <span class="p2c-dos">
            <button class="btn btn-p2c btn-sm" onclick="VETA.p2cResponder(${jsTxt(x.correo)},true)">${t('cha.aceptar')}</button>
            <button class="btn btn-linea btn-sm" onclick="VETA.p2cResponder(${jsTxt(x.correo)},false)">${t('cha.rechazar')}</button>
          </span>
        </div>`).join('')}` : '';

    const mandadas = (c.enviadas || []).length ? `
      <h3 class="p2c-titulillo">${t('cha.esperando')}</h3>
      ${c.enviadas.map(x => `
        <div class="cha-fila p2c-quieto">
          ${chatAvatar(x)}
          <span class="cha-txt"><b>${esc(x.nombre || x.correo)}</b>
            <small>${t('cha.sinResponder')}</small></span>
        </div>`).join('')}` : '';

    /* TUS CONTACTOS: la libreta y el círculo en una sola lista.
       Antes aquí solo salía el círculo del chat, y la libreta de la billetera
       —donde de verdad se guardan— no aparecía por ningún lado: se tocaba
       «guardar contacto» y no había forma de ir a verlo. Ahora es la misma
       gente vista desde el mismo sitio, y cada fila dice qué se puede hacer:
       escribirle, mandarle, o las dos. */
    const gente = contactosUnidos();
    const mios = gente.length ? `
      <h3 class="p2c-titulillo">${t('cha.tusContactos')} · ${gente.length}</h3>
      ${gente.map(x => `
        <div class="cha-fila p2c-quieto">
          ${x.correo ? `<button class="p2c-tocable" onclick="VETA.chatAbrir(${jsTxt(x.correo)})">
            ${chatAvatar(x)}
            <span class="cha-txt"><b>${esc(x.nombre)}</b>
              <small>${esc(x.gid || x.correo)}</small></span>
          </button>` : `
          <span class="p2c-tocable">
            ${chatAvatar(x)}
            <span class="cha-txt"><b>${esc(x.nombre)}</b>
              <small class="mono">${esc(cortaDir(x.dir))}</small></span>
          </span>`}
          ${x.dir ? `<button class="p2c-icono" onclick="VETA.enviarA(${jsTxt(x.dir)})"
                  title="${t('con.usar')}" aria-label="${t('con.usar')}">
            <svg viewBox="0 0 24 24"><path d="M22 3 11 14M22 3l-7 19-4-8-8-4z"/></svg>
          </button>` : ''}
          ${x.enCirculo ? `<button class="p2c-icono" onclick="VETA.p2cFichaRapida(${jsTxt(x.correo)})"
                  title="${t('cha.verFicha')}" aria-label="${t('cha.verFicha')}">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
          </button>` : `<button class="p2c-quitar" onclick="VETA.borrarContactoAqui(${jsTxt(x.id)})"
                  title="${t('con.borrar')}" aria-label="${t('con.borrar')}">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>`}
        </div>`).join('')}` : '';

    const fuera = (c.bloqueados || []).length ? `
      <h3 class="p2c-titulillo">${t('cha.bloqueados')} · ${c.bloqueados.length}</h3>
      ${c.bloqueados.map(x => `
        <div class="cha-fila p2c-quieto">
          ${chatAvatar(x)}
          <span class="cha-txt"><b>${esc(x.nombre || x.correo)}</b>
            <small>${t('cha.noTeEscribe')}</small></span>
          <button class="btn btn-linea btn-sm"
                  onclick="VETA.p2cBloquear(${jsTxt(x.correo)},false)">${t('cha.desbloquearCon')}</button>
        </div>`).join('')}` : '';

    const nada = !pide && !mandadas && !mios && !fuera
      ? `<div class="vacio"><b>${t('cha.circuloVacioT')}</b>${t('cha.circuloVacioP')}</div>` : '';

    /* La puerta a la libreta entera, para apuntar una direccion a mano —alguien
       que no esta en el chat—. Se dice donde estan guardados, con esas
       palabras: es la pregunta que hizo falta contestar. */
    const libreta = `
      <button class="p2c-nuevo" onclick="VETA.vista('contactos')">
        <svg viewBox="0 0 24 24"><path d="M4 4h13a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 8h3M4 12h3M4 16h3"/></svg>
        <span>${t('cha.abrirLibreta')}</span>
      </button>`;

    return pide + busca + mios + mandadas + fuera + nada + libreta;
  }

  /* ── LOS ESTADOS ──────────────────────────────────────────────────────────
   *
   * Ocho fondos, no una paleta libre. Un selector de color en un compositor de
   * estados da mil resultados y novecientos son feos; ocho fondos sacados del
   * gradiente de la marca dan mil estados que se ven como PULSE2CHAT. La
   * restricción es la que hace la marca.
   *
   * Se guarda el ÍNDICE, no el color: el día que la paleta cambie, cambian
   * todos los estados vivos a la vez sin tocar un solo dato.
   */
  const P2C_FONDOS = [
    'linear-gradient(140deg,#0756D9,#00D9E8)',
    'linear-gradient(140deg,#061A4F,#0756D9)',
    'linear-gradient(140deg,#008CFF,#12E6D5)',
    'linear-gradient(140deg,#12E6D5,#0756D9)',
    'linear-gradient(140deg,#050B1A,#0756D9)',
    'linear-gradient(140deg,#00D9E8,#008CFF)',
    'linear-gradient(140deg,#0B2E6F,#00D9E8)',
    'linear-gradient(140deg,#008CFF,#061A4F)',
  ];
  const p2cFondo = i => P2C_FONDOS[(i | 0) % P2C_FONDOS.length];

  /* La fila de arriba. El primer círculo es siempre el propio: en todas las
     apps que ya usa la gente, «subir el mío» está en ese sitio exacto, y
     mover ese gesto no lo mejora, solo lo esconde. */
  function p2cEstados() {
    const g = chatSt.estados;
    const yo = (sesion?.correo || '').toLowerCase();
    const mios = g?.find(x => x.correo === yo);
    const otros = (g || []).filter(x => x.correo !== yo);

    const circulo = (x, propio) => `
      <button class="p2c-est ${x.sinVer ? 'sinver' : 'visto'}"
              onclick="VETA.p2cVerEstado(${jsTxt(x.correo)})">
        <span class="p2c-est-aro">${
          x.foto ? `<img src="${esc(CHAT.urlArchivo(x.foto))}" alt="">`
                 : `<i>${esc(chatIni(x.nombre || x.correo))}</i>`}</span>
        <small>${esc(propio ? t('cha.miEstado') : (x.nombre || x.correo).split(' ')[0])}</small>
      </button>`;

    return `
    <div class="p2c-estados">
      ${mios ? circulo(mios, true) : ''}
      <button class="p2c-est p2c-est-yo" onclick="VETA.p2cSubirAbrir()">
        <span class="p2c-est-aro">
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        </span>
        <small>${t(mios ? 'cha.masEstado' : 'cha.miEstado')}</small>
      </button>
      ${otros.map(x => circulo(x, false)).join('')}
      ${g && !g.length ? `<span class="p2c-est-nada">${t('cha.sinEstados')}</span>` : ''}
    </div>`;
  }

  /* El visor a pantalla completa. Sin autoavance por temporizador: en una
     pantalla táctil, un estado que salta solo mientras se está leyendo es la
     queja número uno de todas las apps que lo hacen. Se pasa tocando. */
  function p2cVisor() {
    const v = chatSt.viendo;
    if (!v) return '';
    const g = (chatSt.estados || []).find(x => x.correo === v.quien);
    const e = g?.estados?.[v.i];
    if (!e) return '';
    const mio = v.quien === (sesion?.correo || '').toLowerCase();
    return `
    <div class="p2c-visor" onclick="VETA.p2cEstadoSig(event)">
      <div class="p2c-visor-tiras">
        ${g.estados.map((_, i) => `<i class="${i < v.i ? 'ya' : i === v.i ? 'aqui' : ''}"></i>`).join('')}
      </div>
      <header class="p2c-visor-cab">
        ${chatAvatar(g)}
        <span class="p2c-visor-quien"><b>${esc(mio ? t('cha.miEstado') : (g.nombre || g.correo))}</b>
          <small>${hace(e.cuando)}${e.vistas != null ? ` · ${e.vistas} ${t('cha.vieron')}` : ''}</small></span>
        ${mio ? `<button class="p2c-visor-x" onclick="event.stopPropagation();VETA.p2cBorrarEstado(${jsTxt(e.id)})"
                  aria-label="${t('cha.borrar')}">
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg></button>` : ''}
        <button class="p2c-visor-x" onclick="event.stopPropagation();VETA.p2cEstadoCerrar()"
                aria-label="${t('tok.volver')}">
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </header>
      <div class="p2c-visor-cara" style="background:${e.archivo ? '#000' : p2cFondo(e.fondo)}">
        ${e.archivo
          ? (e.tipo === 'video'
            ? `<video src="${esc(CHAT.urlArchivo(e.archivo))}" controls autoplay playsinline></video>`
            : `<img src="${esc(CHAT.urlArchivo(e.archivo))}" alt="">`)
          : ''}
        ${e.texto ? `<p class="${e.archivo ? 'p2c-visor-pie' : 'p2c-visor-texto'}">${esc(e.texto)}</p>` : ''}
      </div>
    </div>`;
  }

  /* El compositor. La línea sobre el cifrado NO es letra pequeña de pie de
     página: va donde la persona está decidiendo qué sube, porque es ahí y solo
     ahí donde sirve de algo. */
  function p2cCompositor() {
    const s = chatSt.subeEstado;
    if (!s) return '';
    return `
    <div class="cha-ficha" onclick="if(event.target===this)VETA.p2cSubirCerrar()">
      <div class="chaf-hoja p2c-hoja">
        <button class="chaf-x" onclick="VETA.p2cSubirCerrar()" aria-label="${t('tok.volver')}">✕</button>
        <h3>${t('cha.subirEstado')}</h3>
        <div class="p2c-lienzo" style="background:${s.adj ? '#000' : p2cFondo(s.fondo)}">
          ${s.adj ? `<img src="${esc(s.previa)}" alt="">` : ''}
          <textarea id="p2c-est-txt" maxlength="300" placeholder="${t('cha.estadoPh')}"
                    oninput="VETA.p2cSubirTexto(this.value)">${esc(s.texto)}</textarea>
        </div>
        <div class="p2c-fondos" role="group" aria-label="${t('cha.fondo')}">
          ${P2C_FONDOS.map((f, i) => `
            <button style="background:${f}" ${s.fondo === i ? 'aria-pressed="true"' : ''}
                    onclick="VETA.p2cSubirFondo(${i})" aria-label="${t('cha.fondo')} ${i + 1}"></button>`).join('')}
          <label class="p2c-foto" title="${t('cha.adjuntar')}">
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="M4 17l5-5 4 4 3-2 4 4"/></svg>
            <input type="file" accept="image/*" hidden onchange="VETA.p2cSubirFoto(this)">
          </label>
        </div>
        <p class="chaf-honesto">${t('cha.estadoHonesto')}</p>
        <div class="chaf-acciones">
          <button class="btn btn-p2c btn-sm" onclick="VETA.p2cSubirHacer(this)">${t('cha.publicar')}</button>
          <button class="btn btn-linea btn-sm" onclick="VETA.p2cSubirCerrar()">${t('cha.cancelar')}</button>
        </div>
      </div>
    </div>`;
  }

  /** El botón de un resultado de búsqueda dice en qué punto está la relación.
      Uno que siempre dijera «Agregar» mandaría solicitudes repetidas a quien
      ya las recibió, que es como se llena de ruido un buzón. */
  function p2cBotonLazo(x) {
    if (x.lazo === 'amigos') return `
      <button class="btn btn-p2c btn-sm" onclick="VETA.chatAbrir(${jsTxt(x.correo)})">${t('cha.escribir')}</button>`;
    if (x.lazo === 'enviada') return `<span class="p2c-quieta">${t('cha.enviada')}</span>`;
    if (x.lazo === 'recibida') return `
      <button class="btn btn-p2c btn-sm" onclick="VETA.p2cResponder(${jsTxt(x.correo)},true)">${t('cha.aceptar')}</button>`;
    return `
      <button class="btn btn-p2c btn-sm" onclick="VETA.p2cAgregar(${jsTxt(x.correo)})">${t('cha.agregar')}</button>`;
  }

  /* UNA SALIDA EN TODA PANTALLA QUE OCUPE LA COLUMNA DEL HILO.
   *
   * «Mi perfil» no tenia boton de atras. En una pantalla grande da igual —la
   * lista sigue al lado— pero en un telefono la casa se esconde entera, y
   * entrar al perfil era entrar en un cuarto sin puerta: la unica salida eran
   * las pestañas de la billetera, o sea salirse de PULSE2CHAT.
   *
   * Va aqui y no copiada en cada pantalla porque el fallo fue justo ese: la
   * salida estaba en el hilo normal y no en las demas. Con una sola cabecera,
   * una pantalla nueva no puede nacer sin ella.
   */
  const chatCabPanel = (titulo, volver = 'VETA.chatCerrar()') => `
      <div class="cha-hcab cha-hcab-solo">
        <button class="cha-volver cha-volver-fijo" onclick="${volver}"
                aria-label="${t('cha.volverCasa')}">
          <svg viewBox="0 0 24 24">${ICO.atras}</svg>
        </button>
        <span class="cha-quien"><b title="${esc(titulo)}">${esc(titulo)}</b></span>
      </div>`;

  /* ══ EL RINCON DE AU-RA EN EL CHAT ═══════════════════════════════════════
   *
   * La charla con AU-RA no es una charla mas y no debe parecerlo: es la unica
   * ficha del chat que no es una persona. Tres diferencias, cada una con su
   * porque:
   *
   *   · SIN botones de llamada. Llamar a la inteligencia de la casa hoy es un
   *     boton que suena y nadie contesta — peor que no ponerlo.
   *   · CON su tira propia: los dos modos de pensar (rapida / pensadora) como
   *     botones que mandan la orden por el mismo chat — el asistente ya las
   *     entiende como texto, asi que el boton es solo un atajo del pulgar—, y
   *     el interruptor de la voz.
   *   · CON voz en las dos direcciones: ella LEE en voz alta lo que contesta
   *     (el texto se pinta igual: la voz acompaña, no reemplaza) y el
   *     microfono DICTA — convierte lo hablado en texto, se ve lo dicho, y se
   *     manda como cualquier mensaje. En la charla con AU-RA el microfono de
   *     notas de voz no sirve (ella solo entiende texto), asi que ese boton
   *     se convierte en dictado en vez de convivir dos microfonos.
   */
  const AURA_CHAT_ID = 'aura@ordenglobal.org';
  const esAura = (c) => !!c && !c.esGrupo && (c.id || '').toLowerCase() === AURA_CHAT_ID;

  /* ── LA VOZ, QUE YA NO ES LA DEL NAVEGADOR ──────────────────────────────
   *
   * Antes esto usaba `speechSynthesis`: la voz del sistema operativo leyendo
   * el texto. Sonaba a lo que era, a maquina, y ademas cambiaba de aparato en
   * aparato — la misma AU-RA con cinco voces distintas segun el telefono.
   *
   * Ahora la voz la fabrica nuestro servidor con un modelo de verdad y llega
   * al hilo como NOTA DE VOZ, el mismo mensaje que graba una persona. Eso
   * significa que aca no hay nada que reproducir: la burbuja de audio ya
   * existia en el chat y hace su trabajo sola. Este archivo solo elige la voz
   * y avisa; el sonido viene de arriba.
   *
   * Y arranca APAGADA. Un chat que se pone a hablar solo, en un bus o en una
   * reunion, se cierra y no se vuelve a abrir. */
  const AURA_VOCES = [
    { id: 'calida', nombre: 'Cálida', que: 'au.vozCalidaQue' },
    { id: 'sobria', nombre: 'Sobria', que: 'au.vozSobriaQue' },
    { id: 'agil',   nombre: 'Ágil',   que: 'au.vozAgilQue' },
  ];
  let auraVoz = localStorage.getItem('veta.aura.voz') || '';
  let auraVozAbierta = false;

  function auraVozMenu() {
    auraVozAbierta = !auraVozAbierta;
    pintarChat();
  }

  /** Elegir voz manda la orden POR EL CHAT, igual que los modos: es la misma
      frase que cualquiera puede escribir, el boton solo la ahorra. Quien
      decide de verdad es el servidor —el es quien graba—, asi que el estado
      que vale es el suyo; esto es un atajo, no una segunda fuente. */
  async function auraVozElegir(cual) {
    if (chatSt.mandando || !esAura(chatSt.con)) return;
    auraVozAbierta = false;
    chatSt.mandando = true;
    try {
      await CHAT.enviar(chatSt.con.id, cual ? `hablame con voz ${cual}` : 'sin voz');
      auraVoz = cual;
      localStorage.setItem('veta.aura.voz', cual);
      await chatCargarMsgs();
    } catch (e) { avisar(t('cha.eRedP')); }
    chatSt.mandando = false;
    pintarChat();
  }

  /** Los botones de modo mandan la orden POR EL CHAT: es la misma frase que
      cualquiera puede escribir, el boton solo la ahorra. */
  async function auraModoChat(cual) {
    if (chatSt.mandando || !esAura(chatSt.con)) return;
    chatSt.mandando = true;
    try {
      await CHAT.enviar(chatSt.con.id, cual === 'pensadora' ? 'modo pensador' : 'modo rápido');
      await chatCargarMsgs();
    } catch (e) { avisar(t('cha.eRedP')); }
    chatSt.mandando = false;
  }

  const puedeDictar = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  let dictando = null;

  function auraDictar() {
    if (dictando) { try { dictando.stop(); } catch (e) {} dictando = null; pintarChat(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = idiomaActivo() === 'en' ? 'en-US' : 'es-HN';
    r.interimResults = true;
    const campo = () => $('#chat-txt');
    r.onresult = (ev) => {
      // lo dicho SE VE mientras se dice: el texto es el protagonista, la voz
      // es solo la forma de escribirlo
      const txt = Array.from(ev.results).map(x => x[0].transcript).join(' ').trim();
      if (campo()) campo().value = txt;
      if (ev.results[ev.results.length - 1].isFinal) {
        dictando = null;
        if (txt) $('#chat-hilo form.cha-pie')?.requestSubmit();
        else pintarChat();
      }
    };
    r.onerror = () => { dictando = null; pintarChat(); };
    r.onend = () => { if (dictando) { dictando = null; pintarChat(); } };
    dictando = r;
    pintarChat();
    r.start();
  }

  function chatHilo() {
    if (chatSt.puerta === 'falta') return `
      ${chatCabPanel(t('cha.gateT'), "VETA.vista('nucleo')")}
      <div class="cha-puerta">
        <div class="cha-escudo"><svg viewBox="0 0 24 24">${ICO.escudo}</svg></div>
        <h3>${t('cha.gateT')}</h3>
        <p>${t('cha.gateP')}</p>
        <button class="btn btn-oro btn-sm" onclick="VETA.vista('verificar')">${t('gid.btn')}</button>
      </div>`;

    if (chatSt.error) {
      const k = chatSt.error;
      return `
      ${chatCabPanel(t('cha.e' + k + 'T'), "VETA.vista('nucleo')")}
      <div class="cha-puerta">
        <h3>${t('cha.e' + k + 'T')}</h3>
        <p>${t('cha.e' + k + 'P')}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
          ${/* ══ «TU CHAT ESTÁ EN OTRO LADO» TAMBIÉN SE DESATASCA ═══════════
                Esta pantalla se quedaba SIN BOTÓN a propósito: la llave del
                correo se la quedaba el primer aparato y desde aquí no había
                nada que hacer, así que ofrecer un botón que no podía funcionar
                era peor que no ofrecerlo.
                Ya no es así. El relevo devuelve la llave existente a quien
                demuestre ser el dueño con su sesión de la wallet —el mismo
                correo, la misma persona, otro aparato— y eso es exactamente lo
                que hace `chatReparar`. Dejar el botón fuera ahora deja a
                alguien mirando un callejón que ya tiene salida: es lo que le
                pasó a la app, con el chat abierto en el navegador. */''}
          <button class="btn btn-oro btn-sm" onclick="VETA.chatReparar()">${t('cha.desbloquear')}</button>
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
      ${chatCabPanel(t('cha.miPerfil'), 'VETA.chatCodigo()')}
      <div class="cha-puerta cha-yo">
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
    /* Con el buscador abierto, el hilo enseña solo lo que casa. No se resalta
       la palabra dentro de la burbuja a propósito: pintar dentro del texto
       obliga a meter HTML en algo que viene de otra persona, y ese es el
       camino más corto a que un mensaje se salga de su burbuja. */
    const aguja = (chatSt.buscaHilo || '').trim().toLowerCase();
    const lista = aguja
      ? (chatSt.msgs || []).filter(m => (m.texto || '').toLowerCase().includes(aguja))
      : chatSt.msgs;
    const cuerpo = chatSt.msgs === null
      ? `<div class="cha-cargando"><span class="girando"></span></div>`
      : (lista.length
          ? (aguja ? `<div class="cha-cuantos">${t('cha.cuantosCasan')
              .replace('{n}', lista.length)}</div>` : chatAvisoFirmas(lista))
            + lista.map(chatBurbuja).join('')
          : aguja
            ? `<div class="vacio"><b>${t('cha.nadaEnHilo')}</b>${t('cha.nadaEnHiloP')}</div>`
            : `<div class="vacio"><b>${t('cha.hiloT')}</b>${t('cha.hiloP')}</div>`);

    return `
      <div class="cha-hcab">
        <button class="cha-volver" onclick="VETA.chatCerrar()" aria-label="${t('tok.volver')}">
          <svg viewBox="0 0 24 24">${ICO.atras}</svg>
        </button>
        <button class="cha-quien-btn" onclick="VETA.chatVerFicha()" title="${t('cha.verFicha')}">
          ${chatAvatar(c)}
          <span class="cha-quien">
            ${/* El nombre entero va en el atributo: se acorta en pantalla para
                 que no se meta debajo de los botones, y asi sigue estando
                 disponible al mantener el dedo encima y para un lector de
                 pantalla. Acortar no puede significar perder el dato. */''}
            <b title="${esc(c.nombre)}">${esc(c.nombre)}</b>
            ${/* Debajo del nombre va la presencia si es una persona: «En
                  línea» significa que tiene PULSE2CHAT abierto ahora — o sea
                  que un mensaje lo ve ya y una llamada le suena. Si no está,
                  se queda el identificador de siempre. */''}
            <small id="cha-linea" class="${chatSt.enLinea && !esAura(c) ? 'en-linea' : ''}">${
              esAura(c) ? esc(t('au.chSub'))
              : c.esGrupo ? esc(t('cha.esGrupo'))
              : chatSt.enLinea ? t('cha.enLinea') : esc(c.gid || c.id)}</small>
          </span>
        </button>
        ${/* Llamar solo cara a cara: en grupo haria falta un SFU, que es
              infraestructura de verdad. Y solo donde el navegador puede. */''}
        ${(c.esGrupo && window.GRUPO?.puede()) ? `
        <button class="cha-mas cha-hmas" id="cha-gllamar-voz" onclick="VETA.grupoLlamar(false)" aria-label="${t('lla.voz')}">
          <svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>
        </button>
        <button class="cha-mas cha-hmas" id="cha-gllamar-video" onclick="VETA.grupoLlamar(true)" aria-label="${t('lla.video')}">
          <svg viewBox="0 0 24 24"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
        </button>` : ''}
        ${(!c.esGrupo && !esAura(c) && window.LLAMADA?.puede()) ? `
        <button class="cha-mas cha-hmas" id="cha-llamar-voz" onclick="VETA.llamadaLlamar(false)" aria-label="${t('lla.voz')}">
          <svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>
        </button>
        <button class="cha-mas cha-hmas" id="cha-llamar-video" onclick="VETA.llamadaLlamar(true)" aria-label="${t('lla.video')}">
          <svg viewBox="0 0 24 24"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
        </button>` : ''}
        <button class="cha-mas cha-hmas${chatSt.buscaHilo != null ? ' cha-hmas-on' : ''}"
                onclick="VETA.chatBuscarHiloAbrir()" aria-label="${t('cha.buscarHilo')}">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
        </button>
        <button class="cha-mas cha-hmas" onclick="VETA.chatVerFicha()" aria-label="${t('cha.verFicha')}">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
        </button>
      </div>
      ${esAura(c) ? (() => {
        /* El modo encendido no se guarda en ningun lado: se LEE del hilo.
           AU-RA confirma cada cambio con una frase fija; el ultimo de esos
           mensajes dice en que modo esta. Un estado guardado aparte se
           desincroniza (otro aparato, otra sesion); el hilo no miente. */
        let modoP = false;
        for (const m of (chatSt.msgs || [])) {
          if (m.de !== AURA_CHAT_ID) continue;
          if (/modo pensador\b/i.test(m.texto || '')) modoP = true;
          else if (/modo r[aá]pido\b/i.test(m.texto || '')) modoP = false;
        }
        return `
      <div class="cha-aura-tira">
        <span class="cha-aura-beta">AU-RA · beta</span>
        <button type="button" class="cha-aura-chip${!modoP ? ' on' : ''}"
                onclick="VETA.auraModoChat('rapida')">${t('au.chModoR')}</button>
        <button type="button" class="cha-aura-chip${modoP ? ' on' : ''}"
                onclick="VETA.auraModoChat('pensadora')">${t('au.chModoP')}</button>
        <button type="button" class="cha-aura-chip cha-aura-voz${auraVoz ? ' on' : ''}"
                onclick="VETA.auraVozMenu()"
                aria-label="${auraVoz ? t('au.chVozOn') : t('au.chVozOff')}">
          <svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5z"/>${''}
          </svg>${auraVoz ? (AURA_VOCES.find(v => v.id === auraVoz) || {}).nombre
                          : t('au.chVozOff')}
        </button>
      </div>
      ${auraVozAbierta ? `
      <div class="cha-aura-voces" role="group" aria-label="${t('au.vozElegir')}">
        ${AURA_VOCES.map(v => `
        <button type="button" class="cha-aura-vozop${auraVoz === v.id ? ' on' : ''}"
                onclick="VETA.auraVozElegir('${v.id}')">
          <b>${esc(v.nombre)}</b><span>${esc(t(v.que))}</span>
        </button>`).join('')}
        <button type="button" class="cha-aura-vozop${!auraVoz ? ' on' : ''}"
                onclick="VETA.auraVozElegir('')">
          <b>${t('au.vozNo')}</b><span>${t('au.vozNoQue')}</span>
        </button>
      </div>` : ''}`; })() : ''}
      ${chatSt.buscaHilo != null ? `
      <div class="p2c-filtro cha-busca-hilo">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
        <input id="cha-busca-hilo" placeholder="${t('cha.buscarHiloPh')}"
               value="${esc(chatSt.buscaHilo)}" autocomplete="off"
               oninput="VETA.chatBuscarHilo(this.value)">
        <button onclick="VETA.chatBuscarHiloAbrir()" aria-label="${t('cha.cancelar')}">✕</button>
      </div>` : ''}
      ${chatSt.ficha ? chatFicha() : ''}
      <div class="cha-msgs${esAura(c) ? ' cha-de-aura' : ''}" id="chat-msgs" onclick="VETA.chatGestosTocar(event)">${cuerpo}</div>
      ${chatSt.grabando ? `
      <div class="cha-grab">
        <span class="cha-grab-pt"></span>
        <span class="cha-grab-t" id="cha-grab-t">0:00</span>
        <span class="cha-grab-p">${t('cha.vozGrabando')}</span>
        <button type="button" class="cha-grab-x" onclick="VETA.chatVozCancelar()">${t('cha.vozCancelar')}</button>
      </div>` : ''}
      <div class="cha-escribe oculto" id="cha-escribe"></div>
      ${chatSt.citando ? `
      <div class="cha-citando">
        <div><b>${esc(chatSt.citando.de.split('@')[0])}</b><span>${esc(chatSt.citando.texto || '')}</span></div>
        <button onclick="VETA.chatDejarCita()" aria-label="${t('cha.quitarCita')}">×</button>
      </div>` : ''}
      <form class="cha-pie" onsubmit="return VETA.chatMandar(event)">
        <label class="cha-clip" title="${t('cha.adjuntar')}">
          <svg viewBox="0 0 24 24"><path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.4 3.4 0 0 1 4.8 4.8L10.3 17.8a1.8 1.8 0 0 1-2.5-2.5l7.8-7.8"/></svg>
          <input type="file" onchange="VETA.chatAdjuntar(this)" hidden>
        </label>
        <input id="chat-txt" placeholder="${t('cha.escribi')}" autocomplete="off" maxlength="2000"
               oninput="VETA.chatTecleando()">
        ${/* El micrófono solo aparece si el navegador sabe grabar. Un botón que
              al tocarlo dice «tu navegador no puede» es peor que no ponerlo. */''}
        ${esAura(c) && puedeDictar() ? `
        <button type="button" class="cha-mic cha-dictar${dictando ? ' grabando' : ''}"
                aria-label="${t('au.chDictar')}" title="${t('au.chDictar')}"
                onclick="VETA.auraDictar()">
          <svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/></svg>
        </button>` : ''}
        ${!esAura(c) && CHAT.puedeGrabar() ? `
        <button type="button" class="cha-mic${chatSt.grabando ? ' grabando' : ''}"
                aria-label="${t(chatSt.grabando ? 'cha.vozParar' : 'cha.vozGrabar')}"
                onclick="VETA.chatVoz()">
          ${chatSt.grabando
            ? `<span class="cha-mic-pt"></span>`
            : `<svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/></svg>`}
        </button>` : ''}
        <button class="cha-manda" type="submit" aria-label="${t('cha.mandar')}">
          ${chatSt.subiendo ? '<span class="girando"></span>'
            : `<svg viewBox="0 0 24 24"><path d="M22 3 11 14M22 3l-7 19-4-8-8-4z"/></svg>`}
        </button>
      </form>
      ${/* Lo bueno arriba y en tono normal; la limitacion debajo y en gris.
            Al reves —la advertencia primero— la gente deja de leerla a los
            tres dias, y entonces no protege a nadie. */''}
      ${/* El sello de abajo dice la verdad DE ESTE HILO, y la verdad cambia
            con quien este del otro lado. Con una persona: punta a punta, y del
            otro lado alguien real. Con AU-RA las dos cosas serian mentira —
            este hilo lo procesa nuestro servidor para poder contestar, y del
            otro lado no hay una persona—, y un sello que miente enseña a
            ignorar todos los sellos. */''}
      <div class="cha-sello${esAura(c) ? ' cha-sello-aura' : ''}">
        <svg viewBox="0 0 24 24">${esAura(c)
          ? '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>'
          : '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'}</svg>
        <div>
          <b>${t(esAura(c) ? 'au.chSello' : 'cha.e2eLlamadas')}</b>
          <span>${t(esAura(c) ? 'au.chSelloP' : 'cha.e2eIdentidad')}</span>
        </div>
      </div>
      ${/* El renglon de «las fotos y los videos todavia no» se fue de aqui.
            Debajo de la caja de escribir, en cada pantalla y para siempre, un
            parrafo de letra chica sobre lo que NO esta cifrado le quita el
            sitio a lo que si —el sello de arriba— y es lo primero que la gente
            aprende a saltarse. Donde importa es al MANDAR un adjunto: ahi la
            informacion llega cuando sirve para decidir. */''}`;
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
      ${/* EL CODIGO DE SEGURIDAD, POR FIN A LA VISTA.
            Estaba construido desde el primer día y no se enseñaba en ninguna
            pantalla, o sea que no existía: un código que nadie puede comparar
            no protege de nada. Es lo único que impide que el servidor cambie
            una llave por la suya y se meta en medio. */''}
      <div class="chaf-codigo">
        ${chatSt.codigo?.cargando
          ? `<span class="girando"></span>`
          : chatSt.codigo
            ? (chatSt.codigo.texto
              ? `<b>${t('cha.codigoTit')}</b>
                 <code class="chaf-numeros">${esc(chatSt.codigo.texto)}</code>
                 <p class="chaf-nota">${t('cha.codigoQue')}</p>`
              : `<p class="chaf-nota">${t('cha.codigoNo')}</p>`)
            : `<button class="btn btn-linea btn-sm" onclick="VETA.chatVerCodigo()">
                 <svg class="btn-ic" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                 ${t('cha.verCodigo')}</button>`}
      </div>
      <div class="chaf-acciones">
        ${dir ? `<button class="btn btn-oro btn-sm" onclick="VETA.chatEnviarOrigen()">${t('cha.mandarOrigen')}</button>` : ''}
        <button class="btn btn-linea btn-sm" onclick="VETA.chatGuardarContacto()">${t('cha.guardarCon')}</button>
        <button class="btn btn-linea btn-sm" onclick="VETA.chatSilenciar(${jsTxt(c?.id || '')})">${
          t(estaMudo(c?.id) ? 'cha.conSonidoBtn' : 'cha.silenciarBtn')}</button>
        <button class="btn btn-linea btn-sm" onclick="VETA.chatOlvidar(false)">${t('cha.vaciar')}</button>
        <button class="btn btn-linea btn-sm chaf-malo" onclick="VETA.chatOlvidar(true)">${t('cha.borrarConv')}</button>
        ${c?.id && !c.esGrupo ? `<button class="btn btn-linea btn-sm chaf-malo"
          onclick="VETA.p2cBloquear(${jsTxt(c.id)},true)">${t('cha.bloquear')}</button>` : ''}
      </div>
      <p class="chaf-honesto">${t('cha.olvidarNota')}</p>`);
  }

  /**
   * La marca de «esto no se pudo verificar», debajo del texto.
   *
   * POR QUE HACE FALTA
   *
   * Dos cosas se decidian bien y no llegaban a la pantalla:
   *
   * 1. `CHAT.enviar()` devuelve `e2e:false` cuando NO pudo cifrar y mando en
   *    claro —pasa si el otro todavia no publico llaves, si no hay IndexedDB,
   *    o si se cayo la peticion de llaves—. El comentario de `chat.js` decia
   *    que era «para que la app lo enseñe en ese mensaje», y `app.js` tiraba
   *    el valor de retorno. Mientras tanto el sello del compositor prometia
   *    «ni nosotros podemos leerlos».
   * 2. `CANDADO.abrir()` ahora dice si la firma del remitente cuadra. Un
   *    mensaje que no se pudo verificar NO se esconde —eso seria perder
   *    informacion— pero tampoco se enseña callado, que seria mentir.
   *
   * Los motivos se distinguen a proposito: `sin-firma` es un mensaje viejo, de
   * antes de que se firmara, y no acusa a nadie. Lo demas si.
   */
  function chatMarcaFirma(m, mio) {
    if (m.borrado || m.cerrado) return '';
    if (m.e2e === false) {
      return `<p class="cha-sinfirma cha-alerta">
        <svg viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
        ${t('cha.fueEnClaro')}</p>`;
    }
    // De lo propio no se dice nada: uno sabe que lo escribio uno.
    if (mio || m.verificado !== false) return '';
    /* ══ LO QUE NO SE DICE EN CADA BURBUJA ═══════════════════════════════════
     *
     * «Sin firma» y «sin llaves del remitente» NO son una anomalia: son el
     * estado normal de la transicion. Quien escribe desde el telefono todavia
     * no firma, y todo lo de antes de que existiera la firma tampoco. O sea:
     * en una conversacion de verdad esto sale DEBAJO DE CADA MENSAJE.
     *
     * Y un aviso que sale siempre deja de ser un aviso. Peor: enseñando la
     * conversacion a alguien, lo unico que se lee es «no se pudo comprobar
     * quien lo escribio» repetido diez veces, y lo que queda es que la app
     * esta rota. Eso no es honestidad, es ruido — y el ruido tapa justo el
     * caso que si importa.
     *
     * Asi que esto se dice UNA VEZ, arriba del hilo (ver chatAvisoFirmas), y
     * la burbuja se queda callada. Lo que si grita en cada mensaje es lo de
     * abajo: una firma rota, una llave sin publicar o un aparato que no cuadra
     * son anomalias de verdad y no admiten un renglon discreto. */
    if (m.motivoFirma === 'sin-firma' || m.motivoFirma === 'sin-llaves-del-remitente') {
      return '';
    }
    return `<p class="cha-sinfirma cha-alerta">
      <svg viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
      ${t('cha.firmaNoCuadra')}</p>`;
  }

  /* ══ EL ESTADO DE LAS FIRMAS, DICHO UNA VEZ ═══════════════════════════════
   * Si en el hilo hay mensajes que no se pudieron verificar —porque vienen de
   * un aparato que todavia no firma— se dice arriba y en gris, una sola vez.
   * Ahi significa algo; repetido bajo cada burbuja, no. */
  /* ══ TOCAR UNA BURBUJA ENSEÑA SUS BOTONES ═════════════════════════════════
   * Solo con el dedo: donde hay puntero, los botones aparecen al pasar por
   * encima y esto no hace falta. Se abre uno y se cierra el anterior — dos
   * filas de botones abiertas a la vez es exactamente el desorden que esto
   * viene a quitar. */
  function chatGestosTocar(ev) {
    if (matchMedia('(hover:hover)').matches) return;
    const b = ev.target.closest?.('.cha-b');
    const dentro = ev.target.closest?.('.cha-gestos,.cha-emojis,a,button,video,audio');
    document.querySelectorAll('.cha-b.gestos-abiertos').forEach((el) => {
      if (el !== b) el.classList.remove('gestos-abiertos');
    });
    if (!b || dentro) return;
    b.classList.toggle('gestos-abiertos');
  }

  function chatAvisoFirmas(msgs) {
    const mio = (sesion?.correo || '').toLowerCase();
    const hay = (msgs || []).some(m => m && !m.borrado && !m.cerrado
      && m.de !== mio && m.verificado === false
      && (m.motivoFirma === 'sin-firma' || m.motivoFirma === 'sin-llaves-del-remitente'));
    if (!hay) return '';
    return `<p class="cha-nota-hilo">
      <svg viewBox="0 0 24 24"><path d="M12 8v5m0 3h.01"/><circle cx="12" cy="12" r="9"/></svg>
      ${t('cha.sinVerificarHilo')}</p>`;
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

    /* ══ UN ADJUNTO CIFRADO NO SE PUEDE PINTAR DIRECTO ═════════════════════
     *
     * La dirección del relevo sirve para los adjuntos de siempre, que están en
     * claro. Un adjunto CERRADO son bytes que ningún navegador sabe dibujar:
     * hay que bajarlo, abrirlo con la llave que venía dentro del mensaje y
     * recién entonces dárselo a la etiqueta.
     *
     * Eso no se puede hacer mientras se arma una cadena de texto, así que se
     * deja la marca —`data-cif`— y `chatAbrirAdjuntos()` los resuelve después
     * de pintar. Hasta que llegue, la burbuja enseña su hueco: mejor un hueco
     * que se llena que una imagen rota. */
    const cifrado = !!(m.llaveArchivo && m.ivArchivo);
    const marca = cifrado
      ? ` data-cif="${esc(m.archivo)}" data-k="${esc(m.llaveArchivo)}" data-iv="${esc(m.ivArchivo)}"`
      : '';
    const dir = cifrado ? '' : CHAT.urlArchivo(m.archivo);

    let adj = '';
    if (m.tipo === 'imagen') {
      adj = `<a href="${esc(dir)}"${marca} target="_blank" rel="noopener">
               <img class="cha-img${cifrado ? ' abriendo' : ''}" src="${esc(dir)}" alt="" loading="lazy"></a>`;
    } else if (m.tipo === 'video') {
      adj = `<video class="cha-img${cifrado ? ' abriendo' : ''}" src="${esc(dir)}"${marca} controls preload="metadata"></video>`;
    } else if (m.tipo === 'archivo') {
      adj = `<a class="cha-arch" href="${esc(dir)}"${marca} target="_blank" rel="noopener">
               <svg viewBox="0 0 24 24">${ICO.doc}</svg>${esc(m.nombre || t('cha.unArchivo'))}</a>`;
    } else if (m.tipo === 'voz') {
      /* Una nota de voz se OYE en la burbuja: no es una tarjeta que se baja.
         Se usa el reproductor del navegador —`controls`— en vez de dibujar uno
         propio: el del sistema ya sabe de teclado, de lectores de pantalla y
         del botón de pausa del auricular, y ninguna de esas tres cosas se
         consigue gratis pintando barritas. */
      const segs = CHAT.segundosDeVoz(m.nombre);
      adj = `<div class="cha-voz">
               <audio src="${esc(dir)}"${marca} controls preload="metadata"></audio>
               ${segs ? `<span class="cha-voz-t">${segs}s</span>` : ''}
             </div>`;
    }

    // En un grupo hace falta saber quien habla; en un cara a cara sobra.
    const firma = (!mio && chatSt.con?.esGrupo)
      ? `<span class="cha-de">${esc(m.de.split('@')[0])}</span>` : '';

    // La cita: se lee del hilo por id, no se guarda copiada. Asi, si el
    // original cambia o se va, la cita no queda contando algo viejo.
    const citado = m.cita ? (chatSt.msgs || []).find((x) => x.id === m.cita) : null;
    const cita = m.cita ? `
      <div class="cha-cita">
        <b>${esc(citado ? citado.de.split('@')[0] : t('cha.citaIda'))}</b>
        <span>${esc(citado ? (citado.texto || chatResumen(citado)) : t('cha.citaIdaP'))}</span>
      </div>` : '';

    const reacs = m.reacciones || {};
    const cuenta = {};
    for (const e of Object.values(reacs)) cuenta[e] = (cuenta[e] || 0) + 1;
    const mias = reacs[sesion?.correo?.toLowerCase()] || null;
    const tira = Object.keys(cuenta).length ? `
      <div class="cha-reacs">${Object.entries(cuenta).map(([e, n]) => `
        <button class="cha-reac${e === mias ? ' mia' : ''}"
                onclick="VETA.chatReaccion(${jsTxt(m.id)},${jsTxt(e)})">${esc(e)}${n > 1 ? ` ${n}` : ''}</button>`).join('')}</div>` : '';

    const menu = chatSt.reaccionando === m.id ? `
      <div class="cha-emojis">${['👍','❤️','😂','😮','🙏','🔥'].map((e) => `
        <button onclick="VETA.chatReaccion(${jsTxt(m.id)},${jsTxt(e)})">${e}</button>`).join('')}</div>` : '';

    return `
      <div class="cha-b ${mio ? 'cha-mio' : ''}${!mio && m.de === AURA_CHAT_ID ? ' cha-b-aura' : ''}" data-id="${esc(m.id || '')}">
        ${m.id ? `<div class="cha-gestos">
          <button title="${t('cha.responder')}" onclick="VETA.chatCitar(${jsTxt(m.id)})">
            <svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v5"/></svg>
          </button>
          <button title="${t('cha.reaccionar')}" onclick="VETA.chatAbrirReaccion(${jsTxt(m.id)})">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/></svg>
          </button>
          ${m.texto && !m.borrado ? `<button title="${t('cha.reenviar')}" onclick="VETA.chatReenviar(${jsTxt(m.id)})">
            <svg viewBox="0 0 24 24"><path d="M15 10l5-5-5-5"/><path d="M20 5H9a5 5 0 0 0-5 5v9"/></svg>
          </button>` : ''}
          ${m.texto && !m.borrado ? `<button title="${t('cha.copiar')}" onclick="VETA.chatCopiarMsg(${jsTxt(m.id)})">
            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
          </button>` : ''}
          ${m.borrado ? '' : `<button title="${t('cha.borrar')}" onclick="VETA.chatBorrarMsg(${jsTxt(m.id)})">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
          </button>`}
        </div>` : ''}
        ${menu}
        <div class="cha-globo">${cita}${firma}${adj}${
          /* UN MENSAJE QUE ESTE APARATO NO PUEDE ABRIR SE DICE, NO SE ESCONDE.
             Pasa de verdad: un teléfono nuevo no tiene la llave con la que se
             cerró lo de la semana pasada. Un renglón en blanco haría pensar
             que el chat perdió mensajes; esto explica qué pasó y qué hacer. */
          m.borrado
            ? `<p class="cha-cerrado">
                 <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
                 ${t(mio ? 'cha.borrasteEsto' : 'cha.borraronEsto')}</p>`
            : m.cerrado
            ? `<p class="cha-cerrado">
                 <svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                 ${t('cha.e2eCerrado')}</p>`
            : (m.texto ? `<p>${esc(m.texto)}</p>` : '')}${chatMarcaFirma(m, mio)}</div>
        ${tira}
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
      /* El saludo de visita. Ni una palabra de venta: quien acaba de llegar
         quiere saber que hay alguien y que no le van a pedir nada todavia. */
      holaVisita: 'Bienvenido a Orden Global. Soy AU-RA, la inteligencia del ecosistema. Preguntame lo que quieras del ecosistema —qué es ORIGEN, cómo funciona la cadena, qué hace falta para abrir una cuenta— y te contesto acá mismo, sin que tengas que registrarte ni darme nada.',
      chipsVisita: ['¿Qué es Orden Global?', '¿Qué es ORIGEN?', '¿Es seguro?', 'Abrir mi cuenta'],
      vAbrir: 'Abrir mi cuenta',
      vSinCuenta: 'Eso ya es de tu cuenta, y todavía no tenés una — así que no hay saldo ni actividad de la que hablarte. En cuanto abrás la cuenta te lo contesto con tus números de verdad, nunca con un ejemplo.',
      vNoSe: 'Eso todavía no lo sé contestar desde acá. Puedo hablarte de ORIGEN, de la cadena, de Genesis ID, de PULSE2CHAT, de MyTokenPay o de todo el ecosistema junto. Y si preferís leerlo con calma, en ordenglobal.org está la casa entera contada.',
      hola: 'Hola. Soy AU-RA, la inteligencia del ecosistema — modelo 1, en beta. Puedo llevarte a cualquier parte, dejarte un envío preparado o explicarte cómo funciona todo. ¿Empezamos con un recorrido?',
      bienv1: 'Hola, {nombre}. Soy AU-RA, la inteligencia de Orden Global.',
      bienv1Voz: 'Hola. Soy AU-RA, la inteligencia de Orden Global.',
      bienv2: 'Este es tu Núcleo: el cerebro donde vive todo tu ecosistema. Tocá cualquier esfera para entrar, y si me necesitás, estoy siempre abajo a la derecha.',
      bienv3: 'Y todo esto late sobre nuestra propia cadena: una Layer 1 hecha en casa, más rápida, más nuestra, sin pedirle permiso a nadie. Bienvenido a Orden Global.',
      micNo: 'Este navegador no me deja escuchar. Escribime y te leo igual de bien.',
      micErr: 'No te pude escuchar. Probá otra vez, o escribime.',
      chips: ['Hacé el recorrido', '¿Qué es ORIGEN?', 'Llevame a cobrar', '¿Cómo creo mi Genesis ID?'],
      /* La del sorteo no se habla (sin mp3 grabado): solo se lee. */
      sorteo: 'Ahora mismo hay un motivo más para hacerlo: al verificarte participás en el sorteo de 1 AUKA, que sigue el precio de la onza de oro. Cierra el 9 de septiembre y las bases están en vetawallet.com/sorteo-orden-global.',
      sinGid: 'Veo que todavía no tenés tu Genesis ID. Tu billetera funciona igual — es tu dinero —, pero el chat, los comercios y el resto del ecosistema piden identidad verificada. ¿Querés que te lleve a crearlo? Toma unos minutos y vale para todo Orden Global.',
      sinGidSi: 'Crear mi Genesis ID', sinGidNo: 'Ahora no',
      listoEnvio: 'Listo: te dejé preparado el envío de {monto} {sim} a {quien}. Revisá todo y confirmalo vos con tu contraseña — firmar siempre te toca a vos.',
      sinContacto: 'No encuentro a «{quien}» en tus contactos, y yo no invento destinos: agregalo primero en Contactos y lo mando en un segundo.',
      teLlevo: 'Te llevo.',
      saldo: 'Tenés {total} en la billetera. Te la abro para que la veas entera.',
      saldoOculto: 'Tenés las cifras ocultas y no te las voy a decir en voz alta. Te abro la billetera y las destapás vos con el ojo.',
      variosCon: 'Tengo {n} contactos que se parecen a «{quien}». ¿A cuál de todos?',
      okAsi: 'Perfecto. Cuando quieras, acá estoy — abajo a la derecha.',
      nose: 'Eso todavía no lo sé — soy el modelo 1 y sigo aprendiendo. ¿Era alguna de estas?',
      // El precio y la actividad: datos que AU-RA YA tiene y hasta ahora no
      // decía. Cuando no llegaron, se dice que no llegaron.
      precio: 'El {sim} está a {precio}. Es el precio con el que se calcula todo lo que ves en tu billetera.',
      precioNo: 'Todavía no me llegó el precio de hoy. En cuanto lo tenga te lo digo — no te lo voy a inventar.',
      /* Un precio declarado se contesta con otras palabras que uno de mercado.
         Decir «el ONDK está a 2,05» sin más sería contestar como si cotizara,
         y no cotiza: de dónde sale el número es parte de la respuesta. */
      precioDecl: 'El {sim} está a {precio}, pero ese número no viene de un mercado: lo fijó la Junta Directiva en el acta {acta}, vigente desde el {fecha}. {sim} todavía no cotiza en ningún lado, así que no hay precio de mercado que darte — hay una resolución, y esa te la digo tal cual.',
      resumen: 'En los últimos siete días tuviste {n} movimientos: {entran} entradas por {sumaE} y {salen} salidas por {sumaS}. Te abro la actividad para que los veas uno a uno.',
      resumenNada: 'En los últimos siete días no se movió nada en tu billetera. Todo tranquilo.',
      resumenNoSe: 'Todavía no me llegó tu actividad, así que no te puedo hacer el resumen sin inventarlo. Probá en un momento.',
      resumenOculto: 'Tuviste {n} movimientos esta semana. Las cifras las tenés ocultas y no te las voy a cantar en voz alta: te abro la actividad y las destapás vos.',
      cobroListo: 'Listo: te dejé el cobro de {monto} {sim} con su código. Enseñalo y que lo escaneen.',
      // El estado de la identidad, dicho de una vez y con lo que toca hacer
      verifSi: 'Sí: estás verificado con Genesis ID. Tu identidad es {gid} y vale en todo Orden Global — el chat, los comercios, todo.',
      verifSin: 'Todavía no tenés tu Genesis ID. Tu billetera funciona igual —es tu dinero—, pero el chat y los comercios piden identidad verificada.',
      verifEnRevision: 'Tu Genesis ID está en revisión. No tenés que hacer nada más: cuando haya respuesta te va a aparecer acá y te avisamos por correo.',
      verifRechazada: 'Tu solicitud de Genesis ID no pasó. Se puede volver a intentar, y suele ser por una foto donde el documento no se lee entero. Te llevo y lo repasamos.',
      verifSuspendida: 'Tu Genesis ID está suspendido. Eso no lo puedo levantar yo: hay que escribirle al equipo desde Ajustes.',
      verifNoSe: 'Ahora mismo no puedo comprobar tu identidad — no me contesta el servicio. Volvé a preguntarme en un momento.',
      verifIr: 'Ir a mi Genesis ID',
      /* Lo que AU-RA sabe hacer, con las palabras por las que se lo suele
         pedir. Sirve para dos cosas: proponer lo más parecido cuando no
         entendió, y sugerir según la pantalla. `base` son las de siempre. */
      parecidos: [
        { pal: ['enviar', 'mandar', 'transferir', 'pagar'], txt: 'Enviar dinero', di: 'llevame a enviar', base: true },
        { pal: ['cobrar', 'cobro', 'factura', 'qr'], txt: 'Cobrar', di: 'llevame a cobrar', base: true },
        { pal: ['recibir', 'deposito', 'direccion'], txt: 'Recibir', di: 'llevame a recibir' },
        { pal: ['saldo', 'billetera', 'cartera', 'tengo'], txt: '¿Cuánto tengo?', di: 'cuanto tengo' },
        { pal: ['precio', 'cotizacion', 'vale', 'cuesta'], txt: '¿A cuánto está el ORIGEN?', di: 'precio del origen' },
        { pal: ['actividad', 'movimientos', 'historial', 'resumen'], txt: 'Resumen de la semana', di: 'resumen de la semana' },
        { pal: ['tarjeta', 'plastico'], txt: 'Mi tarjeta', di: 'llevame a la tarjeta' },
        { pal: ['cambiar', 'convertir', 'swap'], txt: 'Cambiar', di: 'llevame a cambiar' },
        { pal: ['chat', 'mensaje', 'escribir', 'pulse'], txt: 'PULSE2CHAT', di: 'llevame al chat' },
        { pal: ['negocio', 'comercio', 'tienda', 'mytokenpay'], txt: 'Buscar negocios', di: 'buscar negocios' },
        { pal: ['remesa', 'enviar', 'pais', 'familia'], txt: 'Remesas', di: 'llevame a remesas' },
        { pal: ['verificar', 'identidad', 'genesis', 'kyc'], txt: 'Mi Genesis ID', di: 'estoy verificado' },
        { pal: ['contacto', 'agenda'], txt: 'Mis contactos', di: 'llevame a contactos' },
        { pal: ['seguridad', 'frase', 'semilla', 'contrasena'], txt: 'Seguridad', di: 'seguridad' },
        { pal: ['origen', 'oro', 'gramin'], txt: '¿Qué es ORIGEN?', di: 'que es origen', base: true },
      ],
      /* Lo que tiene sentido ofrecer en cada pantalla. Lo demás lo completan
         las de siempre. */
      porVista: {
        nucleo: ['Hacé el recorrido', '¿Qué es ORIGEN?'],
        billetera: ['¿A cuánto está el ORIGEN?', 'Resumen de la semana', 'Llevame a enviar'],
        actividad: ['Resumen de la semana', '¿A cuánto está el ORIGEN?'],
        enviar: ['¿Cuánto tengo?', '¿Cuánto es la comisión?'],
        recibir: ['Llevame a cobrar', '¿Cuánto tengo?'],
        cobrar: ['Cobrame 25', '¿Qué es MyTokenPay?'],
        cambiar: ['¿A cuánto está el ORIGEN?', '¿Cuánto es la comisión?'],
        tarjeta: ['¿Cuánto tengo?', 'Resumen de la semana'],
        chat: ['¿Qué es PULSE2CHAT?', '¿Estoy verificado?'],
        pay: ['Buscá cafeterías', '¿Qué es MyTokenPay?'],
        payex: ['Buscá cafeterías', 'Buscá hoteles'],
        remesas: ['¿Cuánto es la comisión?', '¿Cuánto tengo?'],
        identidad: ['¿Estoy verificado?', '¿Qué es Genesis ID?'],
        verificar: ['¿Qué es Genesis ID?', '¿Estoy verificado?'],
        seguridad: ['¿Qué es ORIGEN?', 'Hacé el recorrido'],
        ajustes: ['¿Estoy verificado?', 'Hacé el recorrido'],
      },
      seguridad: 'Nunca, jamás, le digas tu frase de recuperación ni tu contraseña a nadie — ni siquiera a mí. Yo no las necesito para nada: yo preparo, vos firmás. Te llevo a Seguridad.',
      tourFin: 'Ese es tu ecosistema. Yo me quedo acá abajo, a un toque, para lo que necesites.',
      tourFinGid: 'Ese es tu ecosistema. Solo te falta una llave: tu Genesis ID. ¿Lo creamos ahora?',
      sig: 'Siguiente', atras: 'Atrás', salir: 'Salir del recorrido', fin: 'Entrar a mi Núcleo',
      toca: 'Tocá el orbe para escucharla',
      hola: 'Te damos la bienvenida, ',
      saltar: 'SALTAR',
      ecoTitulo: 'EL ECOSISTEMA ORDEN GLOBAL',
      escribi: 'Preguntame o pedime…',
      con: {
        origen: 'ORIGEN es la moneda de la cadena de Orden Global, y su valor está referenciado al oro: un ORIGEN es un gramin, la cincuentaicincoava parte de un gramo de oro, al precio del oro de hoy. La fórmula no la ponemos nosotros y no cambia, así que la podés rehacer con una calculadora. Se envía en segundos por nuestra propia cadena.',
        cadena: 'Orden Global corre sobre su propia Layer 1: la cadena 5550, con Hyperledger Besu, consenso QBFT y máquina Shanghai. Ya no vivimos prestados en la red de otro — más rápida, más nuestra, sin pedirle permiso a nadie. Todo se puede ver en ordenscan.com.',
        gid: 'Genesis ID es tu identidad para todo el ecosistema: te verificás UNA vez y quedás verificado en todas partes. Es lo que hace que del otro lado del chat o de un cobro siempre haya una persona real.',
        chat: 'PULSE2CHAT es la mensajería del ecosistema: solo entra gente con Genesis ID aprobado, podés mandar dinero sin salir del hilo y cada pago deja su comprobante verificable en la cadena.',
        pay: 'MyTokenPay es la capa de comercio: cobrás con un QR, explorás negocios que aceptan ORIGEN y pagás desde tu misma billetera.',
        aura: 'Soy AU-RA: la inteligencia de Orden Global, modelo 1, en beta. Navego por vos, te explico el ecosistema y te dejo pagos preparados — pero nunca firmo: tu dinero se mueve solo con tu contraseña. Y sigo creciendo: cada versión voy a saber hacer más.',
        og: 'Orden Global es un ecosistema completo: tu dinero (Veta Wallet), tu gente (PULSE2CHAT), tu negocio (MyTokenPay) y tu identidad (Genesis ID), todos conectados sobre nuestra propia cadena. Una cuenta, todas las puertas.',
        comision: 'La comisión de red se paga siempre en ORIGEN, también cuando enviás otro token, y es mínima: nuestra cadena es propia. El equivalente lo ves antes de confirmar cualquier envío.',
        remesas: 'Con remesas ves cuánto llega del otro lado después de la comisión y del cambio, en nueve países. Te abro el calculador.',
        aucorp: 'AuCorp lleva las cuentas en moneda local del ecosistema: tus cuentas en moneda local, en 21 monedas del continente, con esta misma cuenta y sin otra contraseña. Entrás por su esfera del Núcleo: abrís cuentas, depositás con tu referencia, cambiás con la tasa real dicha con su fecha y su margen, y retirás a tu banco. La tarjeta AuCorp ya se está armando y se va a pedir desde esa misma plataforma. AuCorp es dueña de Ordenex y aliada de Orden Global.',
        pronto: 'Ordenexchange y AuCorp ya abrieron: la casa de cambio y las cuentas en moneda local, las dos con esta misma cuenta desde su esfera del Núcleo. AuCorp es la que antes se llamaba AUBANK: cambió el nombre, no la casa. El ecosistema no es una lista cerrada. Crece.',
      },
      teEscucho: 'Te escucho…',
      ayuda: 'Podés pedirme, con la voz o escribiendo:\n\n· «Llevame a cobrar» — te abro cualquier parte\n· «Envía 15 a María» — te dejo el envío listo (firmás vos)\n· «¿Cuánto tengo?» — tu saldo\n· «¿A cuánto está el ORIGEN?» — el precio de hoy\n· «Cobrame 25» — te dejo el cobro con su código\n· «Resumen de la semana» — qué se movió estos días\n· «¿Estoy verificado?» — cómo va tu Genesis ID\n· «¿Qué es ORIGEN?» — te explico el ecosistema\n· «Buscá cafeterías» — te encuentro negocios\n· «Hacé el recorrido» — te lo enseño todo\n\nY si no me entiende el micrófono, escribime: leo igual de bien.',
      tour: [
        { id: null, k: 'TU NÚCLEO', t: 'El cerebro del ecosistema', p: 'Bienvenido a tu Núcleo. Cada esfera es un órgano vivo, y todas laten conectadas a una sola cuenta: la tuya.' },
        { id: 'wallet', k: 'TU DINERO', t: 'Veta Wallet', p: 'Oro real hecho dinero, sobre nuestra propia cadena. Enviás, recibís y cobrás en segundos.' },
        { id: 'scan', k: 'NUESTRA CADENA', t: 'Layer 1 · 5550', p: 'Ya no vivimos prestados en la red de otro: una Layer 1 hecha en casa. Y cada movimiento se comprueba en ORDENSCAN, a cualquier hora.' },
        { id: 'chat', k: 'TU GENTE', t: 'PULSE2CHAT', p: 'Solo gente verificada, y el dinero viaja dentro de la conversación, con comprobante en la cadena.' },
        { id: 'pay', k: 'TU NEGOCIO', t: 'MyTokenPay', p: 'La caja registradora del ecosistema: cobrás con un código y tu negocio crece acá adentro.' },
        { id: 'gid', k: 'TU IDENTIDAD', t: 'Genesis ID', p: 'Te verificás una sola vez y todo Orden Global te reconoce. Es la llave que abre las demás esferas.' },
        /* Parada nueva, sin mp3 grabado: sale con la voz del navegador. La
           marca `sorteo` hace que pintarTour la salte sola despues del 9 de
           septiembre — un tour invitando a un sorteo cerrado seria peor que
           no tenerla—; quitarla a mano despues sigue siendo lo aseado. */
        { sorteo: true, id: 'gid', k: 'EL SORTEO', t: '1 AUKA en juego', p: 'Y hacerlo ahora tiene premio: al verificarte participás en el sorteo de 1 AUKA, que sigue el precio de la onza de oro. Cierra el nueve de septiembre.' },
        { id: 'aucorp', k: 'Y ESTO CRECE', t: 'Ya abrieron las dos', p: 'Ordenexchange es la casa de cambio y AuCorp son tus cuentas en moneda local: dólares, lempiras, euros. Las dos con tu misma cuenta. AuCorp es la que antes se llamaba AUBANK: cambió el nombre, no la casa. Y yo soy AU-RA: cada versión voy a saber hacer más.' },
      ],
    },
    en: {
      holaVisita: 'Welcome to Orden Global. I am AU-RA, the intelligence of the house. Ask me anything about the ecosystem — what ORIGEN is, how the chain works, what it takes to open an account — and I will answer right here, with no sign-up and nothing asked of you.',
      chipsVisita: ['What is Orden Global?', 'What is ORIGEN?', 'Is it safe?', 'Open my account'],
      vAbrir: 'Open my account',
      vSinCuenta: 'That belongs to your account, and you do not have one yet — so there is no balance or activity for me to tell you about. The moment you open it I will answer with your real numbers, never with an example.',
      vNoSe: 'I cannot answer that from here yet. I can tell you about ORIGEN, the chain, Genesis ID, PULSE2CHAT, MyTokenPay, or the whole ecosystem together. And if you would rather read it at your own pace, ordenglobal.org has the whole house explained.',
      hola: 'Hi. I am AU-RA, the intelligence of the ecosystem — model 1, in beta. I can take you anywhere, leave a transfer ready for you, or explain how everything works. Shall we start with a tour?',
      bienv1: 'Hello, {nombre}. I am AU-RA, the intelligence of Orden Global.',
      bienv1Voz: 'Hello. I am AU-RA, the intelligence of Orden Global.',
      bienv2: 'This is your Nucleus: the brain where your whole ecosystem lives. Tap any sphere to enter — and if you need me, I am always at the bottom right.',
      bienv3: 'And all of it beats on our own chain: a Layer 1 built in-house — faster, entirely ours, asking no one’s permission. Welcome to Orden Global.',
      micNo: 'This browser will not let me listen. Type to me — I read just as well.',
      micErr: 'I could not hear you. Try again, or type to me.',
      chips: ['Take the tour', 'What is ORIGEN?', 'Take me to charge', 'How do I create my Genesis ID?'],
      sorteo: 'Right now there is one more reason to do it: by verifying you enter the raffle for 1 AUKA, which tracks the price of one ounce of gold. It closes September 9 and the rules live at vetawallet.com/sorteo-orden-global.',
      sinGid: 'I see you do not have your Genesis ID yet. Your wallet works anyway — it is your money — but the chat, the merchants and the rest of the ecosystem need a verified identity. Want me to take you there? It takes minutes and works across all of Orden Global.',
      sinGidSi: 'Create my Genesis ID', sinGidNo: 'Not now',
      listoEnvio: 'Done: I prepared the transfer of {monto} {sim} to {quien}. Review it and confirm with your password — signing is always yours.',
      sinContacto: 'I cannot find “{quien}” in your contacts, and I never make up destinations: add them in Contacts first and I will have it ready in a second.',
      teLlevo: 'Taking you there.',
      saldo: 'You have {total} in your wallet. Opening it so you can see everything.',
      saldoOculto: 'Your figures are hidden and I am not going to say them out loud. Opening your wallet so you reveal them yourself with the eye.',
      variosCon: 'I have {n} contacts that look like “{quien}”. Which one?',
      okAsi: 'All right. Whenever you want, I am right here — bottom right.',
      nose: 'I do not know that yet — I am model 1 and still learning. Did you mean one of these?',
      precio: '{sim} is at {precio}. That is the price everything in your wallet is calculated with.',
      precioNo: "Today's price has not reached me yet. I will tell you the moment it does — I will not make one up.",
      precioDecl: '{sim} is at {precio}, but that number does not come from a market: the Board of Directors set it in minute {acta}, in force since {fecha}. {sim} does not trade anywhere yet, so there is no market price to give you — there is a resolution, and I am telling it to you as it stands.',
      resumen: 'Over the last seven days you had {n} movements: {entran} in for {sumaE} and {salen} out for {sumaS}. Opening your activity so you can see them one by one.',
      resumenNada: 'Nothing moved in your wallet over the last seven days. All quiet.',
      resumenNoSe: 'Your activity has not reached me yet, so I cannot summarise it without inventing it. Try again in a moment.',
      resumenOculto: 'You had {n} movements this week. Your figures are hidden and I am not going to read them out loud: I will open your activity and you uncover them yourself.',
      cobroListo: 'Done: your charge for {monto} {sim} is ready with its code. Show it and let them scan.',
      verifSi: 'Yes: you are verified with Genesis ID. Your identity is {gid} and it holds across all of Orden Global — the chat, the merchants, everything.',
      verifSin: 'You do not have your Genesis ID yet. Your wallet works all the same — it is your money — but the chat and the merchants ask for a verified identity.',
      verifEnRevision: 'Your Genesis ID is under review. There is nothing else for you to do: when there is an answer it will show up here and we will email you.',
      verifRechazada: 'Your Genesis ID application did not pass. It can be tried again, and it is usually a photo where the document cannot be read in full. Let me take you and we go over it.',
      verifSuspendida: 'Your Genesis ID is suspended. That one I cannot lift: the team has to be contacted from Settings.',
      verifNoSe: 'I cannot check your identity right now — the service is not answering. Ask me again in a moment.',
      verifIr: 'Go to my Genesis ID',
      parecidos: [
        { pal: ['send', 'transfer', 'pay'], txt: 'Send money', di: 'take me to send', base: true },
        { pal: ['charge', 'invoice', 'bill', 'qr'], txt: 'Charge', di: 'take me to charge', base: true },
        { pal: ['receive', 'deposit', 'address'], txt: 'Receive', di: 'take me to receive' },
        { pal: ['balance', 'wallet', 'have'], txt: 'How much do I have?', di: 'how much do i have' },
        { pal: ['price', 'quote', 'worth', 'cost'], txt: 'What is ORIGEN at?', di: 'origen price' },
        { pal: ['activity', 'movements', 'history', 'summary'], txt: "This week's summary", di: 'summary of this week' },
        { pal: ['card', 'plastic'], txt: 'My card', di: 'take me to the card' },
        { pal: ['change', 'convert', 'swap'], txt: 'Swap', di: 'take me to swap' },
        { pal: ['chat', 'message', 'write', 'pulse'], txt: 'PULSE2CHAT', di: 'take me to the chat' },
        { pal: ['business', 'merchant', 'shop', 'mytokenpay'], txt: 'Find businesses', di: 'find businesses' },
        { pal: ['remittance', 'country', 'family'], txt: 'Remittances', di: 'take me to remittances' },
        { pal: ['verify', 'identity', 'genesis', 'kyc'], txt: 'My Genesis ID', di: 'am i verified' },
        { pal: ['contact', 'address', 'book'], txt: 'My contacts', di: 'take me to contacts' },
        { pal: ['security', 'phrase', 'seed', 'password'], txt: 'Security', di: 'security' },
        { pal: ['origen', 'origin', 'gold', 'gramin'], txt: 'What is ORIGEN?', di: 'what is origen', base: true },
      ],
      porVista: {
        nucleo: ['Take the tour', 'What is ORIGEN?'],
        billetera: ['What is ORIGEN at?', "This week's summary", 'Take me to send'],
        actividad: ["This week's summary", 'What is ORIGEN at?'],
        enviar: ['How much do I have?', 'What is the fee?'],
        recibir: ['Take me to charge', 'How much do I have?'],
        cobrar: ['Charge 25', 'What is MyTokenPay?'],
        cambiar: ['What is ORIGEN at?', 'What is the fee?'],
        tarjeta: ['How much do I have?', "This week's summary"],
        chat: ['What is PULSE2CHAT?', 'Am I verified?'],
        pay: ['Find coffee shops', 'What is MyTokenPay?'],
        payex: ['Find coffee shops', 'Find hotels'],
        remesas: ['What is the fee?', 'How much do I have?'],
        identidad: ['Am I verified?', 'What is Genesis ID?'],
        verificar: ['What is Genesis ID?', 'Am I verified?'],
        seguridad: ['What is ORIGEN?', 'Take the tour'],
        ajustes: ['Am I verified?', 'Take the tour'],
      },
      seguridad: 'Never, ever tell anyone your recovery phrase or your password — not even me. I do not need them: I prepare, you sign. Taking you to Security.',
      tourFin: 'That is your ecosystem. I stay right down here, one tap away.',
      tourFinGid: 'That is your ecosystem. You are missing one key: your Genesis ID. Shall we create it now?',
      sig: 'Next', atras: 'Back', salir: 'Exit tour', fin: 'Enter my Nucleus',
      toca: 'Tap the orb to hear her',
      hola: 'Welcome, ',
      saltar: 'SKIP',
      ecoTitulo: 'THE ORDEN GLOBAL ECOSYSTEM',
      escribi: 'Ask me or tell me…',
      con: {
        origen: 'ORIGEN — spelled with an E, and said the Spanish way: oh-REE-hen — is the currency of the Orden Global chain, and its value is referenced to gold. One ORIGEN is one gramin, the fifty-fifth part of a gram of gold, at today’s gold price. We do not set the formula and it does not change, so you can redo it with a calculator. It moves in seconds over our own chain.',
        cadena: 'Orden Global runs on its own Layer 1: chain 5550, with Hyperledger Besu, QBFT consensus and the Shanghai machine. We no longer live borrowed on someone else’s network. Everything is public at ordenscan.com.',
        gid: 'Genesis ID is your identity for the whole ecosystem: verify ONCE and you are verified everywhere. It is what guarantees there is a real person on the other side of every chat and every charge.',
        chat: 'PULSE2CHAT is the ecosystem’s messenger: only people with an approved Genesis ID get in, you can send money without leaving the thread, and every payment leaves a verifiable receipt on the chain.',
        pay: 'MyTokenPay is the commerce layer: charge with a QR, explore businesses that accept ORIGEN and pay from this same wallet.',
        aura: 'I am AU-RA: the intelligence of Orden Global, model 1, in beta. I navigate for you, explain the ecosystem and leave payments ready — but I never sign: your money moves only with your password. And I keep growing.',
        og: 'Orden Global is a complete ecosystem: your money (Veta Wallet), your people (PULSE2CHAT), your business (MyTokenPay) and your identity (Genesis ID), all wired over our own chain. One account, every door.',
        comision: 'The network fee is always paid in ORIGEN, even when you send another token, and it is minimal: the chain is ours. You see the equivalent before confirming any transfer.',
        remesas: 'Remittances shows how much arrives on the other side after fees and exchange, in nine countries. Opening the calculator.',
        aucorp: 'AuCorp is the fiat side of the ecosystem: your local-currency accounts, in 21 currencies of the continent, with this same account and no extra password. You enter through its sphere in the Nucleus: open accounts, deposit with your reference, exchange at the real rate stated with its date and margin, and withdraw to your bank. The AuCorp card is being built and will be requested from that same platform. AuCorp owns Ordenex and is an ally of Orden Global.',
        pronto: 'Ordenexchange and AuCorp are both open now: the exchange and your local-currency accounts, both with this same account from their sphere in the Nucleus. AuCorp is what used to be called AUBANK: the name changed, not the house. The ecosystem is not a closed list. It grows.',
      },
      teEscucho: 'Listening…',
      ayuda: 'You can ask me, by voice or typing:\n\n· “Take me to charge” — I open any part\n· “Send 15 to Maria” — I leave the transfer ready (you sign)\n· “How much do I have?” — your balance\n· “What is ORIGEN at?” — the price today\n· “Charge 25” — I leave the charge ready with its code\n· “Summary of this week” — what moved these days\n· “Am I verified?” — how your Genesis ID is doing\n· “What is ORIGEN?” — I explain the ecosystem\n· “Find coffee shops” — I find businesses\n· “Take the tour” — I show you everything\n\nAnd if the microphone misses you, type: I read just as well.',
      tour: [
        { id: null, k: 'YOUR NUCLEUS', t: 'The brain of the ecosystem', p: 'Welcome to your Nucleus. Each sphere is a living organ, and they all pulse connected to a single account: yours.' },
        { id: 'wallet', k: 'YOUR MONEY', t: 'Veta Wallet', p: 'Real gold turned into money, on our own chain. Send, receive and charge in seconds.' },
        { id: 'scan', k: 'OUR CHAIN', t: 'Layer 1 · 5550', p: 'We no longer live borrowed on someone else’s network: a Layer 1 built in-house. And every movement can be checked on ORDENSCAN, at any hour.' },
        { id: 'chat', k: 'YOUR PEOPLE', t: 'PULSE2CHAT', p: 'Verified people only, and money travels inside the conversation, with a receipt on the chain.' },
        { id: 'pay', k: 'YOUR BUSINESS', t: 'MyTokenPay', p: 'The ecosystem’s cash register: you charge with a code and your business grows in here.' },
        { id: 'gid', k: 'YOUR IDENTITY', t: 'Genesis ID', p: 'Verify once and all of Orden Global recognises you. It is the key that opens the other spheres.' },
        /* New stop, no recorded mp3: falls back to the browser voice. When the
           raffle closes, remove this line and its Spanish twin. */
        { sorteo: true, id: 'gid', k: 'THE RAFFLE', t: '1 AUKA at stake', p: 'And doing it now has a prize: by verifying you enter the raffle for 1 AUKA, which tracks the price of one ounce of gold. It closes on September the ninth.' },
        { id: 'aucorp', k: 'AND THIS GROWS', t: 'Both are open', p: 'Ordenexchange is the exchange and AuCorp holds your local-currency accounts: dollars, lempiras, euros. Both with your same account. AuCorp is what used to be called AUBANK: the name changed, not the house. And I am AU-RA: every version I will know how to do more.' },
      ],
    },
  };
  const aTxt = () => AURA_TXT[idiomaActivo() === 'en' ? 'en' : 'es'];

  let auraLienzo = null, auraAbierta = false, auraCharla = [], auraOyendo = false;
  /* Visita = todavía no entró. Manda sobre TODO lo que AU-RA hace: el saludo,
     los chips y a dónde va cada pregunta. Se pone en `ir()`, que es el único
     sitio donde se cambia de pantalla, así que no hay forma de que una vista
     quede en visita por descuido. */
  let auraVisita = true;

  /* El orbe aparece con la sesion y se monta UNA vez: es el mismo organismo
     toda la vida de la pagina, no un dibujo que se rehace por vista. */
  function auraDespertar() {
    /* AU-RA vive en UN lienzo a la vez (el motor del orbe es un singleton):
       en la puerta, el orbe GRANDE de la recepción — ella es la anfitriona y
       una bola de adorno al lado sería un doble—; en el resto de la casa, el
       flotante de la esquina. Aquí se decide cuál le toca y se re-monta solo
       si cambió. */
    const flotante = $('#aura-orbe');
    const enAcceso = !$('#acceso')?.classList.contains('oculto');
    const escena = enAcceso ? $('#ag-orbe canvas') : null;
    flotante.toggleAttribute('data-oculto', !!escena);
    if (!escena) flotante.removeAttribute('data-oculto');
    const objetivo = escena || flotante.querySelector('canvas');
    if (objetivo && auraLienzo !== objetivo) {
      AURA.montarOrbe(objetivo);
      auraLienzo = objetivo;
    }
    if (auraVisita) vigilarInvitacion();
  }

  /* EL ORBE SE APARTA MIENTRAS LA INVITACIÓN ESTÁ A LA VISTA. En el teléfono
     el orbe flota fijo abajo a la derecha y se plantaba justo encima de la
     tarjeta «preguntale a AU-RA»: dos puertas a lo mismo, una tapando a la
     otra. Con esto solo hay una a la vez — la tarjeta mientras se lee el
     encabezado, el orbe en cuanto se pasa de largo. */
  let ojoInvitacion = null;
  const invitacionesVisibles = new Set();
  function vigilarInvitacion() {
    if (ojoInvitacion || !window.IntersectionObserver) return;
    ojoInvitacion = new IntersectionObserver((entradas) => {
      /* El callback trae SOLO las que cambiaron, no todas. Con un `some` sobre
         el lote, dejar de ver la de la portada apagaba el escondite aunque la
         del acceso siguiera en pantalla. Se lleva el conjunto a mano. */
      for (const e of entradas) {
        if (e.isIntersecting) invitacionesVisibles.add(e.target);
        else invitacionesVisibles.delete(e.target);
      }
      ajustarOrbe();
    }, { threshold: 0.35 });
    document.querySelectorAll('.bv-aura').forEach(n => ojoInvitacion.observe(n));
  }

  function ajustarOrbe() {
    $('#aura-orbe').classList.toggle('tapado',
      auraVisita && invitacionesVisibles.size > 0 && !auraAbierta);
  }

  function auraToca() {
    auraAbierta = !auraAbierta;
    ajustarOrbe();
    if (!auraAbierta) { AURA.pararVoz(); AURA.dejarDeEscuchar(); return pintarAura(); }
    if (!auraCharla.length) {
      // El primer saludo del panel se DICE: tocar el orbe es un gesto, asi
      // que el audio tiene permiso. Es tambien la prueba viva de que la voz
      // funciona antes de pedirle nada.
      /* El saludo NO lleva botón de abrir cuenta: el chip de abajo ya es esa
         puerta y está siempre a la vista. Repetirla dentro del primer globo
         convierte una bienvenida en un anuncio, que es justo lo contrario de
         lo que hace falta con alguien que acaba de llegar y todavía duda. */
      const saludo = auraVisita ? aTxt().holaVisita : aTxt().hola;
      auraCharla.push({ de: 'aura', txt: saludo });
      AURA.hablar(saludo, idiomaActivo());
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

  /* LAS SUGERENCIAS SIGUEN A LA PERSONA. Los cuatro chips eran siempre los
     mismos cuatro: en la pantalla de cobrar te ofrecían llevarte a cobrar, y
     en la de actividad te ofrecían el recorrido de la primera vez. Un menú
     fijo delante de alguien que ya está haciendo algo es ruido.

     Ahora AU-RA sugiere lo de la pantalla en la que estás, y deja detrás las
     de siempre para que nunca haya menos de tres. Las de estado —crear el
     Genesis ID— solo aparecen cuando de verdad hace falta: ofrecerle
     verificarse a alguien que ya está verificado es la clase de detalle que
     hace pensar que la app no sabe quién sos. */
  function auraSugerencias() {
    const T = aTxt();
    // En visita no hay vista ni estado de cuenta: las cuatro son del ecosistema
    // y la última es la puerta.
    if (auraVisita) return T.chipsVisita;
    const propias = T.porVista?.[vistaActual] || [];
    const fondo = T.chips.filter(c => c !== T.chips[3] || !esVerificada());
    const vistas = new Set();
    return [...propias, ...fondo].filter(c => !vistas.has(c) && vistas.add(c)).slice(0, 4);
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
      <div class="aura-chips">${auraSugerencias().map(c =>
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

  /* Las respuestas de fábrica, buscadas por palabra. Vive fuera de `auraSeso`
     porque la usan los dos cerebros —el de la sesión y el de visita— y una
     tabla duplicada es una tabla que un día se corrige en un solo sitio. */
  function auraFabrica(d) {
    const T = aTxt();
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
      // AuCorp tiene respuesta propia: mandarla al cajón de «lo que viene»
      // era tratar una casa abierta como una promesa.
      [/aucorp|aubank|banca|fiat|moneda local|local currency/, T.con.aucorp],
      [/ordenexchange|pronto|coming/, T.con.pronto],
    ];
    for (const [re, r] of SABE) if (re.test(d)) return r;
    return null;
  }

  /* EL CEREBRO DE VISITA. Separado del de la sesión a propósito, y no con un
     `if` dentro del otro: ahí abajo hay envíos dictados, saldos, contactos y
     navegación a vistas que no existen todavía. Un guardia en medio de todo
     eso se olvida un día; una puerta distinta, no. Aquí solo entra lo que se
     puede contar sin conocer a nadie. */
  function auraSesoVisita(dicho) {
    const T = aTxt();
    const d = sinTildes(dicho);
    const voz = true;
    const abrir = [{ txt: T.vAbrir, di: T.vAbrir }];

    if (/abrir (mi )?cuenta|crear cuenta|registrar|open (my )?account|create account|sign ?up/.test(d)) {
      auraAbierta = false; pintarAura();
      return ir('acceso', 'crear');
    }
    if (/ya tengo cuenta|entrar|iniciar sesion|log ?in|sign ?in/.test(d)) {
      auraAbierta = false; pintarAura();
      return ir('acceso', 'entrar');
    }

    // Lo que una persona marcó como público en Genesis Core manda; después,
    // lo de fábrica. Es el mismo orden que dentro de la sesión.
    const deGenesis = auraSaberDe(d);
    if (deGenesis) return auraDecir(deGenesis, { voz, botones: abrir });
    const deFabrica = auraFabrica(d);
    if (deFabrica) return auraDecir(deFabrica, { voz, botones: abrir });

    /* Todo lo que huele a cuenta se contesta con la verdad —no hay cuenta— y
       con la puerta. Nunca se inventa un saldo ni se finge que hay alguien
       detrás: es la misma regla de siempre, aplicada a que no hay nadie. */
    if (/saldo|cuanto tengo|mi cuenta|mis |actividad|resumen|envia|enviar|mandar|cobrar|tarjeta|verificad|balance|my |send|charge|activity/.test(d))
      return auraDecir(T.vSinCuenta, { voz, botones: abrir });

    return auraDecir(T.vNoSe, { voz, botones: abrir });
  }

  function auraSeso(dicho) {
    if (auraVisita) return auraSesoVisita(dicho);
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
    /* EL PRECIO, HABLADO. «¿a cuánto está el ORIGEN?» es la pregunta que más
       se hace en voz alta y hasta ahora caía en «todavía no lo sé». El dato ya
       estaba en cartera: no hace falta backend nuevo, hace falta contestarlo.
       Y si no llegó, se dice que no llegó — nunca un número inventado. */
    if (/precio|cotiza|a cuanto|vale|price|worth|quote/.test(d)) {
      /* La moneda se busca por los símbolos que la persona TIENE, no por una
         lista de palabras: «precio del ondk» se llevaba el ORIGEN porque la
         primera palabra de tres letras que encontraba era «precio». Contra la
         cartera de verdad no hay confusión posible. */
      const m = (cartera || []).find(x => new RegExp('\\b' + sinTildes(String(x.s).toLowerCase()) + '\\b').test(d))
        || (cartera || []).find(x => x.nativo) || (cartera || [])[0];
      if (!m || !(Number(m.precio) > 0)) return auraDecir(T.precioNo, { voz });
      if (m.declarado) {
        return auraDecir(rell(T.precioDecl, {
          sim: m.s, precio: usd(m.declarado.precio),
          acta: m.declarado.acta, fecha: fechaCorta(m.declarado.fecha),
        }), { voz });
      }
      return auraDecir(T.precio.replace('{sim}', m.s).replace('{precio}', usd(m.precio)), { voz });
    }

    /* «¿Estoy verificado?» — la pregunta que hoy obliga a ir a mirar una
       tarjeta. Se contesta con el estado real, y si falta algo se dice QUÉ
       falta en vez de mandar a alguien a adivinar. */
    if (/estoy verific|mi verificacion|am i verified|my verification|mi genesis|my genesis/.test(d)) {
      if (esVerificada()) {
        return auraDecir(T.verifSi.replace('{gid}', identidad?.gid || '—'), { voz });
      }
      if (!identidad || identidad.error) return auraDecir(T.verifNoSe, { voz });
      const est = String(identidad.estado || '');
      const txt = /revis|pendien|review/.test(est) ? T.verifEnRevision
        : /rechaz|reject/.test(est) ? T.verifRechazada
        : /suspend/.test(est) ? T.verifSuspendida
        : T.verifSin;
      return auraDecir(txt, { voz, botones: [{ txt: T.verifIr, di: T.chips[3] }] });
    }

    /* EL RESUMEN HABLADO. Lo que pasó estos días sin leer una lista: se cuenta
       de lo que YA está cargado en movimientos. Si no llegó nada todavía, se
       dice eso y no «no tuviste movimientos», que es mentira distinta. */
    if (/resumen|que paso|esta semana|ultimos dias|summary|what happened|this week/.test(d)) {
      if (errMovs || movimientos === null) return auraDecir(T.resumenNoSe, { voz });
      const desde = Date.now() - 7 * 24 * 3600 * 1e3;
      const sem = todoMovimiento().filter(m => movCuando(m) >= desde);
      if (!sem.length) return auraDecir(T.resumenNada, { voz });
      const entran = sem.filter(m => movEntra(m)), salen = sem.filter(m => !movEntra(m));
      const suma = (l) => l.reduce((s, m) => s + Math.abs(Number(movMonto(m)) || 0), 0);
      vista('actividad'); auraApartar();
      // el ojo manda también aquí: si las cifras están tapadas, no se cantan
      if (ocultos) return auraDecir(T.resumenOculto.replace('{n}', sem.length), { voz });
      return auraDecir(T.resumen
        .replace('{n}', sem.length)
        .replace('{entran}', entran.length).replace('{sumaE}', suma(entran).toFixed(2))
        .replace('{salen}', salen.length).replace('{sumaS}', suma(salen).toFixed(2)), { voz });
    }

    /* COBRAR CON EL MONTO DICTADO. «cobrame 25» deja el cobro hecho con la
       cantidad puesta; el QR sale solo. El monto es de quien lo dice —es SU
       cobro, no un destino ajeno—, así que aquí sí puede venir de la frase. */
    const cob = d.match(/(?:cobra(?:me|r)?|charge|factura(?:me|r)?)\s+([\d.,]+)\s*([a-z]{2,10})?/);
    if (cob) {
      const monto = cob[1].replace(',', '.');
      const simDicho = (cob[2] || '').toUpperCase();
      const sim = (cartera || []).find(m => m.s === simDicho)?.s || 'ORIGEN';
      vista('cobrar');
      const campo = $('#cob-monto');
      if (campo) { campo.value = monto; pintarCobro(); }
      auraApartar();
      return auraDecir(T.cobroListo.replace('{monto}', monto).replace('{sim}', sim), { voz });
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

    /* EL SABER QUE VIENE DE GENESIS CORE MANDA. Las respuestas de aquí abajo son
       las que AU-RA trae puestas de fábrica; las de `saber.js` las escribió una
       persona en el cerebro y las marcó públicas a mano. Si una ficha habla del
       mismo tema, gana la de Genesis Core — es la que alguien revisó hoy, no la que
       se quedó escrita en el código hace meses.

       Y si `saber.js` no llegó —una versión vieja, un archivo que no cargó—
       AU-RA sigue contestando con lo suyo. Quedarse muda porque no bajó un
       archivo de texto sería cambiar una respuesta vieja por ninguna. */
    const deGenesis = auraSaberDe(d);
    if (deGenesis) return auraDecir(deGenesis, { voz });

    const deFabrica = auraFabrica(d);
    if (deFabrica) return auraDecir(deFabrica, { voz });

    /* CUANDO NO ENTIENDE. «Eso todavía no lo sé» y punto es una puerta
       cerrada: la persona no sabe si preguntó mal, si la app no sirve o si
       tiene que rendirse. Ahora se busca lo más parecido —palabra por palabra
       contra lo que AU-RA sí sabe hacer— y se ofrece con botones. Si ni eso,
       se ofrecen las tres de siempre. Nunca se queda nadie sin salida. */
    auraDecir(T.nose, { voz, botones: auraLoMasParecido(d).slice(0, 3) });
  }

  /* Lo más parecido a lo que se dijo. Sin diccionario ni modelo: cada destino
     lleva las palabras por las que se lo suele llamar, y gana el que comparta
     más letras con lo dicho. Es tosco a propósito — tiene que caber aquí y
     correr en un teléfono barato sin pedirle nada a nadie. */
  /* Lo que Genesis Core dejó salir, buscado por las palabras con que se lo pide.
     Gana la ficha que comparta MÁS palabras con la frase: si alguien pregunta
     por «la bóveda del oro», la ficha de la referencia tiene que ganarle a la
     de ORIGEN aunque las dos hablen de oro — y contestarle que bóveda no hay. */
  function auraSaberDe(d) {
    const fichas = Array.isArray(window.AURA_SABER) ? window.AURA_SABER : [];
    if (!fichas.length) return null;
    const lang = idiomaActivo() === 'en' ? 'en' : 'es';
    let mejor = null, mejorPts = 0;
    for (const f of fichas) {
      let pts = 0;
      for (const p of f.palabras || []) {
        // con bordes: «oro» no puede casar dentro de «ahorro»
        if (new RegExp('(^|[^a-z0-9])' + sinTildes(p) + '($|[^a-z0-9])').test(d)) pts += p.length;
      }
      if (pts > mejorPts) { mejorPts = pts; mejor = f; }
    }
    return mejor ? (mejor[lang] || mejor.es) : null;
  }

  function auraLoMasParecido(d) {
    const T = aTxt();
    const dichas = sinTildes(d).split(/[^a-z0-9]+/).filter(x => x.length > 2);
    const puntos = (palabras) => palabras.reduce((s, p) => s + dichas.reduce((t, x) =>
      t + (p.startsWith(x) || x.startsWith(p) ? Math.min(p.length, x.length) : 0), 0), 0);
    const marcados = T.parecidos
      .map(o => ({ ...o, pts: puntos(o.pal) }))
      .filter(o => o.pts >= 3)
      .sort((a, b) => b.pts - a.pts);
    const salida = marcados.length ? marcados : T.parecidos.filter(o => o.base);
    return salida.map(o => ({ txt: o.txt, di: o.di }));
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
    /* El sorteo va en su propia burbuja, ANTES de la pregunta: primero el
       motivo, despues la oferta con sus botones. Sin voz — esta charla nunca
       la tuvo, y una frase nueva hablada saldria con la voz del navegador al
       lado de las grabadas: se notaria el parche. */
    if (sorteoRestante() > 0) auraCharla.push({ de: 'aura', txt: T.sorteo });
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
    /* EL NOMBRE DE LA PERSONA, EN LA BIENVENIDA. El ritual saludaba igual a
       todo el mundo; ahora la primera linea es para quien acaba de entrar.
       «Te damos la bienvenida» y no «bienvenido/bienvenida»: el registro no
       sabe el genero de nadie y adivinarlo por el nombre es la forma segura
       de equivocarse con alguien. La forma neutra es ademas la mas solemne.
       `esc()` porque el nombre lo escribio la persona al registrarse: es dato
       ajeno, y sin escapar seria HTML de quien quiera ponerse <img onerror>
       de nombre. */
    const quien = (sesion?.nombre || '').trim().split(/\s+/)[0];
    el.innerHTML = `
      <canvas class="red"></canvas>
      <button class="aurab-saltar" onclick="VETA.auraBienFin()">${T.saltar}</button>
      <div class="aurab-caja">
        <div class="orbe-grande" onclick="VETA.auraBienToca()"><canvas></canvas></div>
        ${quien ? `<p class="aurab-hola">${T.hola}<b>${esc(quien)}</b></p>` : ''}
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
    // el que corresponda se re-monta al cerrar esto: auraDespertar ve que el
    // lienzo ya no es el suyo
    auraLienzo = el.querySelector('.orbe-grande canvas');
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

  /* ── LA BIENVENIDA, EN LA GALAXIA ────────────────────────────────────────
     Antes, entrar terminaba en un cartel negro a pantalla completa: se
     perdían de golpe el vuelo de la cámara y la galaxia recién llegada, que
     son justo lo que hay que ver. Ahora AU-RA saluda ENCIMA del cielo — su
     voz, el sol resplandeciendo con cada frase, y una línea de texto que se
     va sola. El cartel ceremonial sigue existiendo para quien lo pida desde
     Ajustes: ahí sí es el sitio de una presentación. */
  let aedTurno = 0;

  function aedDecir(txt) {
    const caja = $('#ae-dice');
    if (!caja) return;
    caja.classList.remove('oculto', 'yendo');
    caja.querySelector('.aed-txt').textContent = txt;
  }

  function aedCallar() {
    aedTurno++;
    const caja = $('#ae-dice');
    if (!caja || caja.classList.contains('oculto')) return;
    try { AURA.pararVoz(); } catch { /* nada */ }
    caja.classList.add('yendo');
    setTimeout(() => { caja.classList.add('oculto'); caja.classList.remove('yendo'); }, 460);
  }

  /* ── EL TOUR GÉNESIS ─────────────────────────────────────────────────────
   * La historia del origen, contada sobre la galaxia de verdad: la tiniebla
   * con el sistema suelto, LA PALABRA en letra grande, el sol que nace, los
   * mundos que viajan a su órbita y se presentan uno a uno, y el panorama.
   * El motor coreografía (window.__AE_GENESIS) y la casa pone las palabras:
   * rótulos en pantalla y la voz de AU-RA. En el visor no hay HTML que valga
   * — ahí la voz sola cuenta la historia entera.
   */
  function genGuion() {
    const es = idiomaActivo() === 'es';
    const nombre = (sesion?.nombre || '').split(' ')[0];
    /* LAS PALABRAS DE LA PELÍCULA — Y NADA MÁS QUE PALABRAS.
     *
     * Aquí hubo voz sintética y se quitó: leída por una máquina, «y dijo: sea
     * la luz» suena a locutor de ascensor y arruina justo el momento que
     * tenía que erizar la piel. Un rótulo que aparece en silencio sobre una
     * galaxia oscura dice más que cualquier voz que no sea humana. El día que
     * haya una voz grabada de verdad, vuelve. Hasta entonces: letras, tiempo
     * y movimiento, que es como se cuentan las cosas en cine mudo — y el cine
     * mudo emocionaba.
     */
    return es ? {
      /* ══ I · LA CREACIÓN ═══════════════════════════════════════════════════
         Génesis 1, Reina-Valera. NI UNA PALABRA NUESTRA en este acto: meter una
         frase propia entre los versículos rompe el préstamo — deja de ser una
         cita y pasa a ser decoración. Las dos voces se distinguen por la letra
         (la clase `escritura`), no por un rótulo que diga cuál es cuál. */
      titulo: 'EL ORIGEN DE TODO',
      tinieblas: 'Y la tierra estaba desordenada y vacía,\ny las tinieblas estaban sobre la faz del abismo.',
      /* EL VERSÍCULO EN DOS TIEMPOS, porque son dos cosas: una orden y su
         cumplimiento. Entre las dos estalla la luz. Juntas en un mismo rótulo,
         el final llega antes que el principio. */
      seaLuz: 'Y dijo Dios: Sea la luz.',
      fueLuz: 'Y fue la luz.',
      lumbreras: 'Y dijo Dios: Haya lumbreras\nen la expansión de los cielos.',

      /* ══ II · LOS MUNDOS ═══════════════════════════════════════════════════
         Rótulo y UNA línea. Institucional quiere decir que dice qué ES la pieza
         y qué función cumple, no que suene solemne. Una línea y no dos porque
         seis segundos son seis segundos: dos renglones no se terminan de leer y
         un renglón a medio leer es peor que uno que no estaba. */
      /* SEIS SEGUNDOS SON SEIS SEGUNDOS. El rótulo y la línea se leen JUNTOS,
         así que el nombre también cuenta: con nueve o diez palabras nadie llega
         al final antes de que entre el siguiente mundo, y medio renglón leído
         es peor que ninguno. Seis o siete palabras por línea, y cada una dice
         qué ES la pieza. La prueba `cine-reloj` no deja que esto se afloje. */
      casas: {
        gid: ['GENESIS ID', 'Una identidad, verificada una vez.'],
        wallet: ['VETA WALLET', 'Custodia propia. Las llaves son tuyas.'],
        pay: ['MYTOKENPAY', 'Aceptación en comercios, del ecosistema al mostrador.'],
        oxch: ['ORDENEXCHANGE', 'Casa de cambio del ecosistema.'],
        aucorp: ['AUCORP', 'Cuentas en moneda local, en veintiún monedas.'],
        chat: ['PULSE2CHAT', 'Comunicación cifrada de punta a punta.'],
        scan: ['ORDENSCAN', 'Registro público de la cadena.'],
        genesis: ['GENESIS CORE', 'La memoria del origen.'],
        minas: ['MINAS', 'Reserva mineral propia.'],
        dbnx: ['DBNX', 'Auditoría de tokenización de activos reales.'],
      },
      /* Los dos que no son sitios adonde se entra contestan una pregunta que el
         relato acaba de abrir, así que además del rótulo llevan una frase — con
         el nombre todavía puesto, porque es el mundo que se está mirando. */
      dicho: {
        minas: 'El respaldo no es una promesa:\nes metal, en minas nuestras.',
        dbnx: 'Lo que se emite sobre ella\nnace auditado.',
      },

      /* ══ IV · LO QUE LO SOSTIENE ═══════════════════════════════════════════
         Aquí las dos historias se tocan. El versículo pone la pregunta y
         nosotros contestamos con la misma palabra: SEPARAR. Es la rima que
         sostiene la película entera, y por eso ORIGEN va acá y no antes. */
      separo: 'Y separó Dios la luz de las tinieblas.',
      origen: 'Nosotros también tuvimos que separar algo:\nel valor, de la promesa.\nEso es ORIGEN.',
      /* Se cae «metal que se pesa»: MINAS lo dice mejor tres segundos después,
         y decirlo dos veces es gastar el golpe la primera. */
      respaldo: 'Una moneda con el oro detrás.\nNo la palabra de un gobierno.',
      cadena: 'Y debajo, una cadena propia.\nNo alquilada. Nuestra.\nCada movimiento, escrito para siempre.',

      /* ══ V · EL PROPÓSITO ══════════════════════════════════════════════════
         «Fructificad y multiplicaos; llenad la tierra» es el final que la
         historia venía pidiendo desde el principio: no pide nada, dice que hay
         un sitio. Y nuestra respuesta es una sola frase. */
      bueno: 'Y vio Dios todo lo que había hecho,\ny era bueno en gran manera.',
      obra: 'Nada de esto nos lo dieron.\nCada pieza la levantamos nosotros.',
      puente: 'Y lo llevamos donde nunca llegó:\na quien nunca lo tuvo cerca.',
      fructificad: 'Fructificad y multiplicaos;\nllenad la tierra.',
      proposito: nombre ? `Ese es tu lugar acá, ${nombre}.\nNo mirarlo: ser parte.`
        : 'Ese es tu lugar acá.\nNo mirarlo: ser parte.',
      cierre: 'EL FUTURO ES ORDEN.',
      saltar: 'Saltar',
    } : {
      titulo: 'THE ORIGIN OF EVERYTHING',
      tinieblas: 'And the earth was without form, and void;\nand darkness was upon the face of the deep.',
      seaLuz: 'And God said, Let there be light.',
      fueLuz: 'And there was light.',
      lumbreras: 'And God said, Let there be lights\nin the firmament of the heaven.',
      casas: {
        gid: ['GENESIS ID', 'Identity infrastructure. Verified once, it opens everything.'],
        wallet: ['VETA WALLET', 'Self-custody. Keys are encrypted on your own device.'],
        pay: ['MYTOKENPAY', 'Merchant acceptance. From the ecosystem to the counter.'],
        oxch: ['ORDENEXCHANGE', 'The exchange. One currency becomes another.'],
        aucorp: ['AUCORP', 'Local-currency accounts, in twenty-one currencies.'],
        chat: ['PULSE2CHAT', 'End-to-end encrypted communication.'],
        scan: ['ORDENSCAN', 'Public record of the chain. Verifiable by anyone.'],
        genesis: ['GENESIS CORE', 'The memory of the origin: how all of this was built.'],
        minas: ['MINAS', 'Our own mineral reserve. Precious metals under our control.'],
        dbnx: ['DBNX', 'Real-world asset tokenization auditing.'],
      },
      dicho: {
        minas: 'The backing is not a promise:\nit is metal, in mines that are ours.',
        dbnx: 'What is issued on it\nis issued audited. In order, or not at all.',
      },
      separo: 'And God divided the light from the darkness.',
      origen: 'We also had to divide something:\nvalue, from the promise of it.\nThat is ORIGEN.',
      respaldo: 'A currency with gold behind it.\nNot a government\u2019s word:\nmetal that can be weighed.',
      cadena: 'And underneath, a chain of our own.\nNot rented. Ours.\nEvery movement, written for good.',
      bueno: 'And God saw every thing that he had made,\nand it was very good.',
      obra: 'None of this was given to us.\nWe raised every piece ourselves.',
      puente: 'And we take it where it never arrived:\nto those who never had it near.',
      fructificad: 'Be fruitful, and multiply;\nreplenish the earth.',
      proposito: nombre ? `That is your place here, ${nombre}.\nNot to watch it: to be part of it.`
        : 'That is your place here.\nNot to watch it: to be part of it.',
      cierre: 'THE FUTURE IS ORDER.',
      saltar: 'Skip',
    };
  }

  let genVivo = false;
  /* Ya se conto la historia por este camino. Solo queda el visor: encender la
     mano en el aire NO la dispara — ver airEncender. */
  let genSesion = { visor: false };

  /* ── EL TOUR GÉNESIS ─────────────────────────────────────────────────────
   * La película solo se pone cuando alguien la pide: al entrar al modo visor,
   * al encender AIR TOUCH, o desde su fila en Ajustes. NUNCA sola al llegar —
   * una historia de minuto y medio que arranca sin permiso deja de ser un
   * regalo y pasa a ser un obstáculo entre la persona y su dinero.
   */
  function tourGenesis(porQue) {
    if (genVivo) return;
    if (vistaActual !== 'nucleo') {
      vista('nucleo');
      return void setTimeout(() => tourGenesis(porQue), 1800);
    }
    const motor = window.__AE_GENESIS;
    if (!motor || !document.getElementById('ae-casa')) return avisar(t('gen.sinCielo'));
    genVivo = true;
    const G = genGuion();
    const enVisor = !!window.VISOR?.activo();
    aedCallar();

    /* LA MÚSICA ES LA MITAD DE LA PELÍCULA. Se pone desde su primera nota —la
       pista empieza donde empieza la historia— y en «y fue la luz» se le
       suelta el techo un momento: es el único sitio donde se le permite
       mandar. */
    try {
      if (window.MUSICA) {
        MUSICA.desdeElPrincipio();
        if (!MUSICA.puesta()) MUSICA.encender(false);
      }
    } catch { /* sin música la historia se cuenta igual */ }

    let capa = null;
    if (!enVisor) {
      capa = document.createElement('div');
      capa.id = 'gen-letra';
      capa.innerHTML = `
        <div class="gen-velo"></div>
        <div class="gen-centro"></div>
        <div class="gen-pie"><b></b><span></span></div>
        <button class="gen-saltar" type="button">${esc(G.saltar)}</button>`;
      capa.querySelector('.gen-saltar').addEventListener('click', () => motor.saltar());
      document.body.appendChild(capa);
    }
    // se apaga la sala: el menú, el saludo y los mandos se retiran
    document.body.classList.add('en-cine');

    /* SIN VOZ. La sintética arruinaba el momento: aquí manda el silencio, la
       letra y el tiempo. */
    /* Una línea grande al centro. `peso` la hace protagonista (la Palabra, la
       Luz) y `tarde` la deja entrar unos segundos después — así un acto puede
       decir dos cosas seguidas sin apelotonarlas. */
    /* `conPie`: dejar el rotulo del mundo en su sitio mientras entra la frase.
       Sirve para MINAS y DBNX, donde el nombre NO es un titulo que ya cumplio
       —es el mundo que se esta mirando— y sacarlo deja la frase huerfana. */
    const centro = (txt, peso, tarde, marca, conPie) => {
      const poner = () => {
        /* ══ NADA DE «null» EN PANTALLA ═══════════════════════════════════════
         * Sin esto, pedir un rótulo que no existe —una clave mal escrita, un
         * acto sin texto, un idioma al que le falta una frase— pinta la palabra
         * `null` o `undefined` flotando sobre la galaxia. Y eso no se lee como
         * un fallo: se lee como que la casa está rota, que es peor. Ya pasó.
         * Un texto vacío quiere decir SILENCIO, que es una petición legítima —
         * el plano del cielo no lleva palabras a propósito— así que se retira
         * lo que hubiera y se calla, en vez de escribir la palabra `null`. */
        if (txt == null || txt === '') {
          enEscena(null, 'normal');
          if (!capa) return;
          capa.querySelector('.gen-centro')?.classList.remove('ve');
          if (!conPie) capa.querySelector('.gen-pie')?.classList.remove('ve');
          return;
        }
        // dentro del visor manda el teatro; en pantalla, la capa HTML
        enEscena(txt, marca === 'cierre' ? 'cierre'
          : marca === 'titulo' ? 'titulo'
          : marca === 'escritura' ? 'escritura'
          : peso ? 'grande' : 'normal');
        if (!capa) return;
        const c = capa.querySelector('.gen-centro');
        if (!c) return;
        c.innerHTML = esc(String(txt)).replace(/\n/g, '<br>');
        c.classList.toggle('grande', !!peso);
        c.classList.toggle('cierre', marca === 'cierre');
        c.classList.toggle('titulo', marca === 'titulo');
        c.classList.toggle('escritura', marca === 'escritura');
        c.classList.remove('ve'); void c.offsetWidth; c.classList.add('ve');
        if (!conPie) capa.querySelector('.gen-pie').classList.remove('ve');
      };
      if (tarde) setTimeout(() => { if (genVivo) poner(); }, tarde); else poner();
    };
    const pie = (nombre, frase) => {
      /* Misma regla que arriba: un mundo sin nombre no pinta «null» debajo de
         su planeta — sencillamente no pinta rótulo. */
      if (!nombre) { centro(null); return; }
      // en el visor el nombre y su frase van juntos, en dos líneas
      enEscena(nombre + '\n' + (frase || ''), 'normal');
      if (!capa) return;
      capa.querySelector('.gen-centro').classList.remove('ve');
      const p = capa.querySelector('.gen-pie');
      p.querySelector('b').textContent = nombre;
      p.querySelector('span').textContent = frase || '';
      p.classList.remove('ve'); void p.offsetWidth; p.classList.add('ve');
    };
    const porTecla = (e) => { if (e.key === 'Escape') motor.saltar(); };
    addEventListener('keydown', porTecla);

    /* DENTRO DEL VISOR LAS PALABRAS SON DE LA ESCENA. El HTML se pinta una
       sola vez encima de las dos mitades de la pantalla y al cerebro le llega
       una mancha doble: por eso la historia se veía muda con el visor puesto.
       El teatro las dibuja como un objeto más, y las dos cámaras lo ven bien.
       Y mientras cuenta, la mirada queda BLINDADA: solo el botón de salir. */
    const enEscena = (txt, peso) => {
      try { window.__AE_DECIR?.(txt, peso || 'normal'); } catch { /* nada */ }
    };
    if (enVisor) {
      window.__AE_BLINDADO = true;
      const es = idiomaActivo() === 'es';
      window.__AE_PORTICO?.('salir', es ? 'SALIR' : 'EXIT',
        window.VISOR?.modo() === 'xr'
          ? (es ? 'Gatillo para terminar' : 'Trigger to end')
          : (es ? 'Sostené la mirada para terminar' : 'Hold your gaze to end'));
    }

    motor.empezar({
      alActo(clave) {
        /* ══ EL REPARTO DE RÓTULOS ═════════════════════════════════════════
           Cada plano dice lo suyo, y con la VOZ que le toca: `escritura` para
           los versículos, la letra de siempre para lo nuestro. Las dos se
           distinguen mirando, sin que nadie tenga que explicarlo. */

        /* EL TÍTULO. Llega tarde a propósito: dos segundos de pantalla negra y
           vacía antes de la palabra. Ese silencio es lo que la convierte en un
           título y no en la primera frase del relato. */
        if (clave === 'titulo') centro(G.titulo, true, 2000, 'titulo');
        else if (clave === 'tinieblas') centro(G.tinieblas, false, 600, 'escritura');
        else if (clave === 'seaLuz') {
          /* ══ EL ORDEN DEL VERSÍCULO ═══════════════════════════════════════
             Primero se LEE la orden, sobre el negro y sin que pase nada. A los
             tres segundos y medio estalla la luz (ver `luego` en genesis.ts).
             Y el remate entra cuando el fogonazo ya se está yendo: escribirlo
             sobre el blanco es no poder leerlo y encima robarle el momento a
             la imagen. */
          centro(G.seaLuz, true, 400, 'escritura');
          centro(G.fueLuz, true, 5200, 'escritura');
          try { MUSICA?.crecer(1.6, 3.4); } catch { /* nada */ }
        }
        else if (clave === 'lumbreras') centro(G.lumbreras, false, 400, 'escritura');
        else if (clave.startsWith('casa:')) {
          const k = clave.slice(5);
          const c = G.casas[k];
          if (c) pie(c[0], c[1]);
          /* MINAS y DBNX llevan además una frase, con el nombre TODAVÍA
             PUESTO: no es un título que ya cumplió, es el mundo que se está
             mirando, y sacarlo dejaría la frase huérfana. */
          if (G.dicho?.[k]) centro(G.dicho[k], false, 2200, null, true);
        }
        /* EL CIELO: ni una palabra. Es el respiro de la película y el único
           plano que no explica nada — poner texto encima sería no confiar en
           que la imagen alcanza. */
        else if (clave === 'universo') centro(null);
        else if (clave === 'separo') centro(G.separo, true, 500, 'escritura');
        else if (clave === 'origen') {
          centro(G.origen, true, 600);
          try { MUSICA?.crecer(1.35, 3.6); } catch { /* nada */ }
        }
        else if (clave === 'respaldo') centro(G.respaldo, false, 400);
        else if (clave === 'cadena') centro(G.cadena, false, 400);
        else if (clave === 'bueno') {
          centro(G.bueno, true, 500, 'escritura');
          try { MUSICA?.crecer(1.4, 3.4); } catch { /* nada */ }
        }
        else if (clave === 'obra') centro(G.obra, false, 400);
        else if (clave === 'puente') centro(G.puente, true, 400);
        else if (clave === 'fructificad') {
          centro(G.fructificad, true, 400, 'escritura');
          try { MUSICA?.crecer(1.5, 3.6); } catch { /* nada */ }
        }
        else if (clave === 'proposito') centro(G.proposito, true, 500);
        else if (clave === 'cierre') centro(G.cierre, true, 900, 'cierre');
      },
      alFin() {
        genVivo = false;
        document.body.classList.remove('en-cine');
        removeEventListener('keydown', porTecla);
        /* TERMINÓ LA HISTORIA: el ecosistema entero queda a mano. Se retira el
           teatro, se retira el pórtico y se LEVANTA el blindaje — de aquí en
           adelante la mirada abre casas, hasta que la persona se saque el
           visor. Es el momento en que la película se vuelve producto. */
        try { window.__AE_DECIR?.(null); } catch { /* nada */ }
        try { window.__AE_PORTICO?.(null); } catch { /* nada */ }
        window.__AE_BLINDADO = false;
        if (capa) { capa.classList.add('yendo'); setTimeout(() => capa.remove(), 800); }
      },
      /* EL CAMINO QUE HACE UNA PERSONA por el ecosistema, y en ese orden: se
         entra con una identidad, se guarda valor, se cobra, se cambia, se saca
         a moneda local, se habla, se comprueba, y al final está la memoria de
         cómo empezó todo.
         MINAS y DBNX NO van en esta fila a propósito: no son sitios adonde se
         entra. La película los pone dentro del bloque de ORIGEN, cada uno
         contestando una pregunta que el relato acaba de abrir —de dónde sale
         el metal, quién pone las reglas de lo que se emite. */
      casas: ['gid', 'wallet', 'pay', 'oxch', 'aucorp', 'chat', 'scan', 'genesis'],
      /* En pantalla los nombres los pone esta capa; dentro del visor no hay
         HTML que valga y los tiene que poner la escena. */
      rotulos: enVisor ? 'escena' : 'html',
    });
    tele('accion', 'genesis.tour', { visor: enVisor, porQue: porQue || 'boton' });
  }

  /* Los dos caminos que la piden solos, una vez por sesión cada uno: ponerse
     el visor y encender AIR TOUCH. Quien vuelve a entrar en la misma sesión
     no se come la película otra vez. */
  /* ── LA LLEGADA AL VISOR ─────────────────────────────────────────────────
   *
   * Ponerse un visor es un momento torpe: uno se acomoda la correa y mira
   * alrededor. Si la mirada ya estuviera armada, el primer planeta que
   * quedara en el centro se abriría solo — y la persona terminaría dentro de
   * una app sin haber decidido nada. Así que lo primero que ve es UNA PUERTA:
   * un botón grande que se toca mirándolo, y hasta que no lo toque, la mirada
   * no abre nada más.
   */
  function genPorVisor() {
    if (!window.__AE_PORTICO) return;
    const es = idiomaActivo() === 'es';
    /* BLINDADO desde el primer instante: la retícula no elige casas hasta que
       la persona diga que sí. */
    window.__AE_BLINDADO = true;
    /* CÓMO SE APRIETA DEPENDE DE QUÉ VISOR HAY PUESTO, y decirlo mal es peor
       que no decir nada: en un Quest, «sostené la mirada» manda a alguien con
       un mando en la mano a mirar fijo un botón durante segundo y medio. Las
       dos formas funcionan siempre; el pie nombra la que este aparato tiene. */
    const conMando = window.VISOR?.modo() === 'xr';
    const pie = conMando
      ? (es ? 'Apuntá y apretá el gatillo' : 'Point and pull the trigger')
      : (es ? 'Sostené la mirada' : 'Hold your gaze');
    if (genSesion.visor || genVivo) {
      // ya vio la historia en esta sesión: la puerta solo abre la galaxia
      window.__AE_PORTICO('inicio', es ? 'ENTRAR' : 'ENTER', pie);
      return;
    }
    window.__AE_PORTICO('inicio', es ? 'INICIAR' : 'BEGIN',
      (es ? 'La historia del origen · ' : 'The story of the origin · ') + pie.toLowerCase());
  }

  /* El pórtico avisa cuando la mirada terminó de apretarlo. */
  addEventListener('ae-portico', (e) => {
    const modo = e?.detail?.modo;
    if (modo === 'inicio') {
      window.__AE_PORTICO?.(null);
      if (genSesion.visor || genVivo) {
        // la galaxia queda libre: se puede recorrer y abrir casas
        window.__AE_BLINDADO = false;
        return;
      }
      genSesion.visor = true;
      tourGenesis('visor');
    } else if (modo === 'salir') {
      window.__AE_PORTICO?.(null);
      try { window.__AE_GENESIS?.saltar(); } catch { /* nada */ }
    }
  });

  async function auraBienvenidaGalaxia(conVoz) {
    const T = aTxt();
    const mio = ++aedTurno;
    const vigente = () => mio === aedTurno && vistaActual === 'nucleo';
    const nombre = (sesion?.nombre || '').split(' ')[0];
    const frases = [
      (nombre ? T.bienv1.replace('{nombre}', nombre) : T.bienv1Voz),
      T.bienv2, T.bienv3,
    ];
    const voces = [T.bienv1Voz, T.bienv2, T.bienv3];
    const espera = (ms) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < frases.length; i++) {
      if (!vigente()) return;
      aedDecir(frases[i]);
      /* La voz y un tiempo mínimo de lectura corren a la par: quien la
         escucha no espera de más, y quien la tiene en silencio alcanza a
         leerla igual. */
      const leer = espera(2600 + frases[i].length * 34);
      if (conVoz) await Promise.all([AURA.hablar(voces[i], idiomaActivo()).catch(() => {}), leer]);
      else await leer;
    }
    if (vigente()) aedCallar();
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
    // La parada del sorteo se salta sola despues del cierre: el guion se
    // filtra en cada pintada, asi los indices de atras/adelante siguen
    // cuadrando sin trucos.
    const paradas = T.tour.filter(x => !x.sorteo || sorteoRestante() > 0);
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
      // AuCorp y Ordenexchange comparten parada: laten los dos
      if (p.id === 'aucorp') AURA.latirHacia('oxch', 4);
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

  /* UNA SOLA LIBRETA PARA LAS DOS COSAS.
   *
   * Habia dos listas de gente que no se hablaban entre si: la libreta de la
   * billetera —nombre y direccion, para mandar dinero— y el circulo de
   * PULSE2CHAT —correo y Genesis ID, para escribir—. Guardar a alguien desde el
   * chat lo metia en la primera SIN su correo, asi que despues no se le podia
   * escribir desde ahi; y aceptar a alguien en el chat no lo metia en la
   * segunda, asi que para mandarle ORIGEN habia que copiar la direccion a mano.
   *
   * Son la misma persona. Ahora es una lista sola:
   *
   *   nombre   como lo llamo yo
   *   dir      su direccion en la cadena  → se le puede ENVIAR
   *   correo   su cuenta en el chat       → se le puede ESCRIBIR
   *   gid      su Genesis ID, si lo tiene
   *
   * Los dos ultimos campos pueden faltar, y esta bien que falten: una direccion
   * apuntada a mano no tiene correo, y alguien del chat puede no tener todavia
   * su direccion a la vista. Cada fila enseña lo que SI se puede hacer con ella
   * en vez de un boton que no lleva a ningun lado.
   *
   * Sigue viviendo en este navegador y no en el servidor: es una libreta de
   * direcciones, no una cuenta.
   */
  const LLAVE_CON = 'veta.contactos';
  const leerContactos = () => {
    try {
      const l = JSON.parse(localStorage.getItem(LLAVE_CON) || '[]');
      /* Las fichas de antes solo tienen nombre y direccion. No se migran a
         disco: se completan al leerlas, y se guardan completas la proxima vez
         que se toque la lista. Reescribir la libreta de todo el mundo al abrir
         la app seria arriesgar los datos de alguien por un campo vacio. */
      return l.map(c => ({ correo: '', gid: '', foto: '', dir: '', ...c }));
    } catch { return []; }
  };
  const guardarContactos = l => {
    try { localStorage.setItem(LLAVE_CON, JSON.stringify(l)); } catch {}
  };

  /** ¿Ya está esta persona en la libreta? Por correo si lo hay; si no, por
      dirección. Un correo identifica a una persona; una dirección, a una
      cuenta — y la misma persona puede cambiar de cuenta. */
  const buscaContacto = (l, { correo, dir }) => l.find(c =>
    (correo && c.correo && c.correo.toLowerCase() === String(correo).toLowerCase()) ||
    (dir && c.dir && c.dir.toLowerCase() === String(dir).toLowerCase()));

  /**
   * Guarda o COMPLETA a alguien en la libreta.
   *
   * Completar importa tanto como guardar: quien ya estaba apuntado con su
   * direccion y despues aparece en el chat tiene que quedarse con las dos
   * cosas, no duplicarse en dos filas que son la misma persona.
   *
   * @returns {'nuevo'|'completado'|'igual'}
   */
  function apuntarContacto({ nombre, dir, correo, gid, foto }) {
    const l = leerContactos();
    const ya = buscaContacto(l, { correo, dir });
    if (!ya) {
      l.unshift({ id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
                  nombre: nombre || correo || cortaDir(dir || ''),
                  dir: dir || '', correo: (correo || '').toLowerCase(),
                  gid: gid || '', foto: foto || '' });
      guardarContactos(l);
      return 'nuevo';
    }
    let cambio = false;
    for (const [k, v] of Object.entries({ dir, correo: (correo || '').toLowerCase(), gid, foto })) {
      if (v && !ya[k]) { ya[k] = v; cambio = true; }
    }
    if (nombre && !ya.nombre) { ya.nombre = nombre; cambio = true; }
    if (cambio) guardarContactos(l);
    return cambio ? 'completado' : 'igual';
  }

  /* La lista que se enseña: la libreta MAS el círculo del chat, sin repetir.
     Quien te aceptó es un contacto tuyo aunque nunca hayas tocado «guardar» —
     tener que apuntarlo otra vez a mano es pedirle a la gente que haga el
     trabajo que la app puede hacer sola. Los del círculo van marcados para
     poder decir de dónde salen. */
  function contactosUnidos() {
    const l = leerContactos();
    const fuera = l.map(c => ({ ...c, deLibreta: true }));
    for (const a of (chatSt.circulo?.amigos || [])) {
      const ya = buscaContacto(fuera, { correo: a.correo, dir: a.addr });
      if (ya) {
        if (!ya.correo) ya.correo = a.correo;
        if (!ya.dir && a.addr) ya.dir = a.addr;
        if (!ya.foto && a.foto) ya.foto = a.foto;
        if (!ya.gid && a.gid) ya.gid = a.gid;
        ya.enCirculo = true;
      } else {
        fuera.push({ id: 'c:' + a.correo, nombre: a.nombre || a.correo, dir: a.addr || '',
                     correo: a.correo, gid: a.gid || '', foto: a.foto || '',
                     enCirculo: true, deLibreta: false });
      }
    }
    return fuera.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  }

  function contactos() {
    const l = contactosUnidos();
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
      <h3>${t('con.guardados')}${l.length ? ` · ${l.length}` : ''}</h3>
      ${l.length ? l.map(filaContacto).join('')
      : `<div class="vacio"><b>${t('con.vacioT')}</b>${t('con.vacioP')}</div>`}
      <p class="pie" style="margin-top:12px">${t('con.local')}</p>
    </div>`;
  }

  /* Una fila de contacto, con los botones que de verdad se pueden usar.
     Enseñar «Enviar» a alguien de quien no sabemos la dirección, o «Escribir»
     a una dirección apuntada a mano, es prometer algo que al tocarlo no pasa —
     y eso enseña a la gente a no fiarse de los botones. */
  function filaContacto(c) {
    return `
      <div class="hilera">
        <div class="ic">${c.foto
          ? `<img src="${esc(CHAT.urlArchivo(c.foto))}" alt="" class="con-cara">`
          : `<svg viewBox="0 0 24 24">${ICO.gente}</svg>`}</div>
        <div class="txt">
          <b>${esc(c.nombre)}${c.enCirculo && !c.deLibreta
            ? ` <em class="con-fuente">${t('con.delChat')}</em>` : ''}</b>
          <small class="mono">${esc(c.dir ? cortaDir(c.dir) : (c.gid || c.correo || ''))}</small>
        </div>
        <div class="con-btns">
          ${c.correo ? `<button class="btn btn-linea btn-sm"
            onclick="VETA.contactoEscribir(${jsTxt(c.correo)})">${t('con.escribir')}</button>` : ''}
          ${c.dir ? `<button class="btn btn-linea btn-sm"
            onclick="VETA.enviarA(${jsTxt(c.dir)})">${t('con.usar')}</button>` : ''}
          ${c.deLibreta ? `<button class="btn btn-linea btn-sm"
            onclick="VETA.borrarContacto(${jsTxt(c.id)})" aria-label="${t('con.borrar')}">✕</button>` : ''}
        </div>
      </div>`;
  }

  /** Desde la libreta al hilo. Es el puente que faltaba entre las dos mitades:
      hasta ahora, un contacto de la billetera no llevaba a ninguna parte del
      chat aunque fuera la misma persona. */
  function contactoEscribir(correo) {
    vista('chat');
    // Se espera a que el chat se dé de alta: abrir el hilo antes de eso lo
    // deja pidiendo mensajes con una llave que todavía no existe.
    const abrir = () => CHAT.listo() ? chatAbrir(correo) : setTimeout(abrir, 200);
    setTimeout(abrir, 120);
  }

  function nuevoContacto(ev) {
    ev.preventDefault();
    const nombre = $('#con-nombre').value.trim();
    const dir = $('#con-dir').value.trim();
    const av = $('#con-aviso');
    const decir = m => { av.textContent = m; av.className = 'aviso aviso-mal'; av.classList.remove('oculto'); };
    if (!nombre) return decir(t('con.eNombre')), false;
    if (!/^0x[a-fA-F0-9]{40}$/.test(dir)) return decir(t('con.eDir')), false;
    /* Si esa direccion ya estaba apuntada, se dice y no se crea una segunda
       fila: dos veces la misma persona en la libreta es como se pierde la
       confianza en una libreta. */
    const que = apuntarContacto({ nombre, dir });
    avisar(t(que === 'nuevo' ? 'con.guardado' : 'con.yaEstaba'));
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
        /* Un codigo de cobro de MyTokenPay. Va DESPUES de los otros dos porque
           es el mas permisivo —seis caracteres de un alfabeto corto— y puesto
           antes se tragaria lecturas que en realidad eran otra cosa. */
        const cod = leerCodigoCobro(crudo);
        if (cod) {
          cerrarCamara();
          avisar(t('qr.leido'));
          mtpMias = []; mtpFallo = null;
          mtpTraerCobro(cod)
            .then(() => vista('paycobro'))
            .catch(e => {
              if (mtpSinIdentidad(e)) return;
              mtpCobro = null; mtpFallo = e.message; vista('paycobro');
            });
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
  /* Las cifras cuentan cuando llegan. Un número que sube de cero a 5550 hace
     que se lea; el mismo número quieto es un dato más de la página. Se hace
     una sola vez —`data-hasta` se borra al terminar—, y a quien pidió que las
     cosas no se muevan se le pone el valor final y ya está: un contador es un
     adorno, y un adorno nunca es motivo para marear a nadie.

     El texto de partida en el HTML es YA el valor final, así que si esto no
     llega a correr —sin JS, con un error antes— la página sigue diciendo la
     verdad en vez de enseñar un cero. */
  function contarHasta(caja) {
    caja.querySelectorAll('.cuenta[data-hasta]').forEach((el) => {
      const fin = Number(el.dataset.hasta);
      if (!isFinite(fin)) return;
      const suf = el.dataset.sufijo || '';
      const dec = Number(el.dataset.fijo ?? 0);
      delete el.dataset.hasta;
      if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;
      const DURA = 1100;
      let t0 = null;
      const paso = (t) => {
        if (t0 === null) t0 = t;
        const k = Math.min(1, (t - t0) / DURA);
        // se frena al final en vez de pararse en seco: la cifra «aterriza»
        const suave = 1 - Math.pow(1 - k, 3);
        el.textContent = (fin * suave).toFixed(dec) + suf;
        if (k < 1) requestAnimationFrame(paso);
        else el.textContent = fin.toFixed(dec) + suf;
      };
      el.textContent = (0).toFixed(dec) + suf;
      requestAnimationFrame(paso);
    });
  }

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
        contarHasta(e.target);
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
          contarHasta(p);
          ojo.unobserve(p);
        }
      });
    };
    addEventListener('scroll', () => { if (!pedido) pedido = requestAnimationFrame(barrer); }, { passive: true });
    barrer();
  }

  /* El velo de apertura: el logo de Orden Global y una sola frase. A quien
     llega a la puerta se le da el momento entero; a quien ya tiene sesión,
     un respiro corto — verlo entero en cada recarga sería un peaje diario.
     Con movimiento reducido el CSS ya lo tiene apagado y aquí solo se quita. */
  /* La frase del velo, palabra por palabra y con la última en oro. Se arma
     aquí y no en el HTML para hablar el idioma de la persona; el HTML trae
     el español plano de respaldo por si este código no llega a correr. */
  /* CUÁNTO TARDA LA FRASE EN ESTAR ENTERA. Se calcula aquí y lo usa quien
     decide cuándo irse: la frase y la salida dejan de ser dos relojes
     separados que se contradicen. */
  const VELO_PASO = 0.15;      // segundos entre palabra y palabra
  const VELO_INICIO = 0.3;     // cuándo entra la primera
  const VELO_ANIM = 0.75;      // lo que dura la aparición de cada una (el CSS manda)
  const veloDura = () => {
    const n = t('velo.frase').split(' ').length;
    return (VELO_INICIO + (n - 1) * VELO_PASO + VELO_ANIM) * 1000;
  };

  function veloFrase() {
    const f = $('#velo-og .velo-frase');
    if (!f) return;
    const palabras = t('velo.frase').split(' ');
    f.innerHTML = palabras.map((p, i) =>
      `<span class="${i === palabras.length - 1 ? 'oro' : ''}"
             style="animation-delay:${(VELO_INICIO + i * VELO_PASO).toFixed(2)}s">${esc(p)}</span>`).join(' ');
  }

  /* UNA SOLA VEZ, PASE LO QUE PASE.
   *
   * A esta puerta se llama desde tres sitios —el camino feliz, el de la
   * recuperación de clave y la red de seguridad de los cuatro segundos— y los
   * tres pueden coincidir. Cada llamada programaba su propia salida, así que
   * dos llamadas encimadas podían volver a animar un velo que ya se estaba
   * yendo. Con la marca, la primera manda y las demás no hacen nada. */
  let veloYaVa = false;

  function veloFuera(conSesion) {
    const velo = $('#velo-og');
    if (!velo || veloYaVa) return;
    veloYaVa = true;
    const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
    /* LA FRASE SE LEE ENTERA, SIEMPRE. Antes, quien ya tenía sesión veía el
       velo irse a los setecientos milisegundos: la frase entra palabra por
       palabra y para entonces solo había aparecido la primera. Se leía «El» y
       se cerraba, que es peor que no poner frase. Ahora la salida NUNCA es
       antes de que la frase esté completa; el respiro corto de quien vuelve
       sigue siendo corto, pero cuenta desde ahí. */
    const completa = veloDura();
    const espera = quieto ? 0
      : conSesion ? completa + 320
      : Math.max(2450, completa + 900);
    setTimeout(() => {
      velo.classList.add('yendo');
      setTimeout(() => velo.remove(), 640);
    }, espera);
  }

  function arrancar() {
    veloFrase();
    if (window.AIRTOUCH?.puede()) $('#at-boton')?.classList.remove('oculto');
    /* La música: el botón nace mostrando lo que la persona eligió la última
       vez, y el módulo lo mantiene al día. Sonar, suena en cuanto haya un
       gesto — antes ningún navegador lo permite. */
    if (window.MUSICA) {
      MUSICA.alCambiar(musicaMarca);
      musicaMarca(MUSICA.quiere());
    } else {
      $('#musica-btn')?.classList.add('oculto');
    }
    /* La red de seguridad del velo: algunos caminos de este arranque retornan
       antes de mirar la sesión (recuperación de clave, SSO), y un velo que no
       se va es una app secuestrada por su propia apertura. Si el camino feliz
       ya lo quitó, esto no encuentra nada y no hace nada. */
    setTimeout(() => veloFuera(true), 4200);
    pintarIdioma();
    /* Se enciende la telemetría antes que nada, para que un fallo del propio
       arranque también se vea. Sin clave puesta esto no hace absolutamente
       nada — ni cola, ni peticiones. */
    tele('iniciar', {});
    /* La cuenta atras del sorteo corre desde el primer pintado y para todos:
       la portada la enseña antes de cualquier sesion. */
    arrancarSorteo();
    pintarQrPortada();
    armarRevelado();
    $('#form-acceso').addEventListener('submit', enviarAcceso);
    $('#i-clave').addEventListener('input', pintarFuerza);
    $('#form-rc-pedir').addEventListener('submit', reclaveEnviarPeticion);
    $('#form-rc-nueva').addEventListener('submit', reclaveGuardar);
    $('#rc-clave').addEventListener('input', pintarFuerzaReclave);

    /* UN ENLACE DE RECUPERACION MANDA SOBRE TODO LO DEMAS, incluida una sesion
       guardada: quien llega con ese token viene justamente porque no puede
       entrar, y mandarlo a la billetera de la sesion anterior seria dejarlo
       encerrado otra vez. Se atiende antes que cualquier otra ruta. */
    if (reclaveDesdeLaDireccion()) { veloFuera(true); return; }

    /* Quien llega con /#verificar viene de la pagina publica de Genesis ID y
       viene a verificarse, no a mirar el saldo. Basta con dejar marcada la
       vista antes de arrancar: las dos puertas de entrada —sesion recuperada
       aqui abajo y sesion recien creada en enviarAcceso— terminan en ir('app'),
       que pinta vistaActual. Si la vista todavia no existe, vista() cae sola en
       la billetera, asi que esto nunca deja una pantalla en blanco. */
    mirarSiEsVentana();
    const pideVerificar = location.hash === '#verificar';
    if (pideVerificar) vistaActual = 'verificar';

    /* Un enlace de cobro (#pagar?a=…&m=…&s=…) es alguien pasando una factura.
       Se guarda para rellenar el envio en cuanto haya sesion; sin sesion, se
       manda a la puerta y el cobro espera ahi hasta que entre. */
    const cobroEntrante = location.hash.startsWith('#pagar') ? leerCobro(location.hash) : null;
    if (cobroEntrante) { vistaActual = 'enviar'; cobroPendiente = cobroEntrante; }

    /* Una invitacion de chat (#chat?con=…) apunta directo al hilo: quien la
       escaneo quiere hablar con ALGUIEN, no ver una lista. */
    const invEntrante = location.hash.startsWith('#chat') ? leerInvitacion(location.hash) : null;
    if (invEntrante) { vistaActual = 'chat'; chatPendiente = invEntrante; }

    /* #sso-ordenex y #sso-aucorp son las casas del ecosistema pidiendo la
       llave (ver volverConLlave): una intencion que llega de fuera, no una
       ruta — se consume aqui y no entra al historial. */
    const casaSso = CASAS_SSO[location.hash] ? CASAS_SSO[location.hash]() : null;
    ssoDestino = casaSso;

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
    veloFuera(!!sesion?.token);
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
      /* Quien viene de paso hacia otra casa no se queda: se le acuña la llave y
         se lo devuelve. La app queda pintada detras por si el viaje fracasa —
         mejor caer en el Nucleo que en una pantalla en blanco — y el ritual
         de AU-RA no se estrena en un pasillo: queda para una visita de
         verdad. */
      if (casaSso) volverConLlave(casaSso);
      if (!yaSePresento() && !casaSso) {
        marcarPresentada();
        setTimeout(() => auraBienvenidaGalaxia(false), 1400);
      }
      // Despues de cargarTodo, para que la moneda del cobro exista en la
      // cartera cuando se intente elegir.
      if (cobroEntrante) { cobroPendiente = null; cargarCartera().then(() => irACobro(cobroEntrante)); }
    }
    /* Sin sesion, LA PUERTA ES EL LOGIN, no la portada. La portada de venta
       sigue existiendo —el boton «Conocer Orden Global» del acceso lleva a
       ella— pero ya no es lo primero: quien escribe app.vetawallet.com viene
       a entrar o a abrir cuenta, y hacerle atravesar seis tramos de venta
       para encontrar la puerta era tratarlo de visita en su propia casa. */
    else ir('acceso', 'entrar');
  }
  document.addEventListener('DOMContentLoaded', arrancar);

  return { ir, pestana, ojo, vista, mandar, copiar, compartir, salir, reintentar, avisar, idioma,
           velasCambiar, velasAmpliar, chatAvisos,
           reclavePedir, reclaveSalir, ojoReclave,
           llaveAbrir, llaveCerrar, llaveEntrar,
           llaveCuantas, llaveOjo, llaveModo,
           importarAbrir, importarSalir, importarElegir, importarHacer,
           tapar, copiarContrato, congelar, revelar, pedirTarjeta, cambioMonto, elegirDestino,
           voltear, olvidar, remMonto, remPais, refrescarTasas, nuevoContacto, borrarContacto,
           enviarA, abrirCamara, cerrarCamara, pedirSecreto, copiarTexto, guardarNombre,
           // Enviar cualquier token, no solo ORIGEN.
           envElegir, envContacto, envMax, envMonto, envDirCambia,
           // Solo para las pruebas: entrar al cobro sin depender del arranque.
           _irACobro: irACobro,
           // Para las pruebas: mirar y forzar el refresco de precios.
           _precioDe: (sim) => (cartera || []).find(x => x.s === sim)?.precio ?? null,
           _refrescarPrecios: refrescarPrecios,
           // Cobrar: el codigo que ya lleva la cantidad puesta.
           cobElegir, cobEscribir, cobCopiar, cobCompartir,
           // MyTokenPay adentro: directorio, ficha y cobro real.
           payBuscar, payCategoria, payDePais, payVerTodos, payAbrir,
           payLeerCodigo, payTomar, payPagar, payOtroCobro,
           paymio: () => vista('paymio'), negCrear, negPais, negEmitir, negAnular,
           negUsarMiDireccion, negLibro,
           // El Nucleo: la portada del ecosistema.
           nuAbrir,
           // El rincon de AU-RA en el chat: modos, voz y dictado.
           auraModoChat, auraVozMenu, auraVozElegir, auraDictar,
           // AU-RA: el orbe, el panel, la bienvenida y el recorrido.
           auraToca, auraManda, auraMic, auraChip, auraTourVa, auraTourFin,
           pantallaLlena, gcAbrir, gcCerrar, gcZoom, aedCallar,
           chatGestosTocar, vsEntrar, vsSalir, vsOjos, vsMirada, tourGenesis, musicaAlterna, versionMirar, version, prontoMirar,
           _bienvenidaGalaxia: (v) => auraBienvenidaGalaxia(v),
           /* El aterrizaje del login, tal cual: la prueba comprueba que entrar
              siempre deja a la persona en el Inicio, aunque la dirección
              apuntara a otra vista. */
           _aterrizar: () => { vistaActual = 'nucleo'; ir('app'); },
           auraBienFin, auraBienToca, auraAyuda,
           // La bienvenida del ecosistema: sale sola la primera vez y se puede
           // volver a abrir desde Ajustes.
           bienvenida, bienSig, bienCerrar,
           // La frase de recuperacion, al crear la cuenta.
           semCopiar, semListo,
           // PULSE2CHAT. Los manejadores van en el HTML que genera la vista, asi
           // que sin figurar aca los botones del chat no hacen nada.
           chatEntrar, chatAbrir, chatCerrar, chatMandar, chatBuscar, chatGrupo,
           // La casa de PULSE2CHAT: pestañas, círculo y estados.
           p2cTab, p2cFiltrar, p2cAgregar, p2cResponder, p2cQuitar,
           p2cVerEstado, p2cEstadoSig, p2cEstadoCerrar, p2cBorrarEstado,
           p2cSubirAbrir, p2cSubirCerrar, p2cSubirTexto, p2cSubirFondo,
           p2cSubirFoto, p2cSubirHacer,
           chatAdjuntar, chatVoz, chatVozCancelar,
           chatCitar, chatDejarCita, chatReaccion, chatAbrirReaccion, chatTecleando,
           airToca, airTutoActivar, airTutoCerrar,
           llamadaLlamar, llamadaContestar, llamadaRechazar, llamadaColgar,
           llamadaMic, llamadaCam, llamadaPantalla, llamadaAjustes, llamadaAparato,
           llamadaMini, llamadaGrande,
           grupoLlamar, grupoContestar, grupoRechazar, grupoColgar,
           grupoMic, grupoCam, grupoPantalla, grupoMini, grupoGrande, chatReparar, chatCodigo, chatCodigoCopiar,
           chatVerFicha, chatFichaCerrar, chatEnviarOrigen, chatGuardarContacto,
           // Lo que le faltaba a una app de mensajeria: bloquear, borrar un
           // mensaje, buscar dentro del hilo, silenciar y comparar el codigo.
           p2cBloquear, p2cFichaRapida, borrarContactoAqui, contactoEscribir,
           chatBorrarMsg, chatCopiarMsg, chatReenviar, chatElegido,
           chatBuscarHilo, chatBuscarHiloAbrir, chatSilenciar,
           chatVerCodigo, chatCerrarCodigo,
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
           // Para poder comprobar el resumen hablado y, sobre todo, que con
           // el ojo cerrado NO se cantan las cifras por el altavoz.
           _sembrarMovs: l => { movimientos = l; errMovs = null; },
           _laTarjeta: () => tarjeta,
           _tarjeta: c => { tarjeta = c; },
           _sesion: x => { sesion = x; },
           // Sembrar la cartera sin cadena: es la unica forma de comprobar que
           // un activo despublicado CON saldo se sigue viendo y uno en cero se
           // va. Contra la red de verdad habria que tener saldo de un
           // despublicado, que es justo lo que no se puede fabricar.
           _cartera: l => { cartera = l; errCartera = null; },
           _leerCobro: c => { const x = leerCobro(c); if (x) irACobro(x); return x; },
           _sol: x => { sol = { ...(sol || {}), ...x }; },
           _semilla: f => { semillaNueva = f; mostrarSemilla(f); },
           _ofrecerGid: () => auraOfrecerGid(),
           _mtp: () => URL_MYTOKENPAY,
           _atPunto: (p) => atPunto(p), _atTablero: (v) => atTablero(v),
           _bienvenidaAura: () => auraBienvenida(true),
           _auraTxt: () => AURA_TXT,
           _identidad: x => { identidad = x; },
           /* Abrir un hilo sin relevo detrás. Es la única forma de probar las
              notas de voz de punta a punta: hace falta una conversación
              abierta, y montarla de verdad exigiría dos cuentas dadas de alta
              contra el servidor de mensajes. */
           _chatCon: c => { chatSt.con = c; chatSt.msgs = []; pintarChat(); },
           /* Solo para las pruebas: por qué el chat está como está. Sin esto,
              una prueba que falla solo puede decir «el botón no aparece», que
              es el síntoma y nunca la causa. */
           _chatEstado: () => ({ puerta: chatSt.puerta, error: chatSt.error,
                                 tab: chatSt.tab, hayCon: !!chatSt.con }),
           _estado: () => ({ sesion, cartera, identidad, movimientos, tarjeta, vistaActual, modo, ocultos }) };
})();
