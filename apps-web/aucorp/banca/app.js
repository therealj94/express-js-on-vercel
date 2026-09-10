/* AuCorp · la banca. Un archivo, sin marco, sin compilar.
 *
 * Lo que hay en el repositorio es lo que corre. Misma decisión que el resto de
 * la casa y por el mismo motivo: cuando algo falla a las once de la noche, lo
 * que se abre es este archivo y no el resultado de una cadena de herramientas.
 *
 * ══ AQUÍ NO HAY CONTRASEÑA ═════════════════════════════════════════════════
 *
 * Se entra con la cuenta de Veta Wallet. La wallet le pide a Genesis un token
 * de paso, devuelve a la persona aquí con ese token en el hash, y ESTE código
 * lo cambia por una sesión propia de AuCorp contra el API. El token de paso
 * vale minutos y solo dice QUIÉN SOS: la contraseña de la wallet no pasa por
 * esta pantalla ni una vez, y por eso no puede filtrarse desde aquí.
 *
 * ══ DENTRO DEL MARCO DE LA WALLET NO SE VIAJA: SE PIDE ═════════════════════
 *
 * Cuando la banca vive DENTRO de la wallet (su esfera del Núcleo la abre en
 * un marco, y la app del teléfono abre la wallet), mandar el marco a
 * app.vetawallet.com sería meter la wallet dentro de la wallet: su CSP lo
 * bloquea y queda una página en blanco. Estando adentro, la sesión ya existe
 * del otro lado del cristal: se le PIDE la llave con un postMessage
 * (`sso-pedido`), la wallet la acuña y la devuelve por el mismo canal
 * (`sso-token`). Es el mismo circuito que ya usa Ordenex. La puerta está
 * cerrada por los dos lados: sólo se atiende la respuesta de las direcciones
 * de la wallet escritas en CASAS_MADRE.
 *
 * ══ POR QUÉ LA SESIÓN VIVE EN sessionStorage ═══════════════════════════════
 *
 * Cerrar la pestaña cierra la sesión. En una pantalla de dinero es lo
 * correcto: un ordenador prestado, un cibercafé, una oficina compartida.
 * Volver a entrar es un clic, porque el SSO ya está hecho.
 *
 * ══ LOS SELLOS DE IDEMPOTENCIA ═════════════════════════════════════════════
 *
 * Cada formulario de dinero acuña su sello UNA vez, al abrirse, y lo conserva
 * mientras esté abierto. Así, si la red se cae después de mandar y la persona
 * toca otra vez, el API reconoce el mismo sello y no manda el dinero dos
 * veces. Acuñar uno nuevo en cada toque haría exactamente lo contrario.
 */
const BANCA = (() => {
  'use strict';

  /* El API. Se puede pisar desde fuera para ensayar contra un servidor de
     pruebas sin tocar el de verdad — misma puerta que usan la wallet y
     Ordenex. */
  const API = (window.AUCORP_API || 'https://aucorp-api-e70d3fd481ca.herokuapp.com').replace(/\/$/, '');
  /* A dónde se manda a la gente a buscar su llave. El `#sso-aucorp` es lo que
     la wallet reconoce (ver CASAS_SSO en su app.js). */
  const WALLET = (window.AUC_WALLET || 'https://app.vetawallet.com');
  /* Las direcciones de la wallet que pueden tener a esta banca enmarcada y
     devolverle la llave. Lista corta, escrita a mano: es una puerta cerrada.
     Son las mismas tres que reconoce Ordenex. */
  const CASAS_MADRE = [...new Set([WALLET,
    'https://app.vetawallet.com',
    'https://main.d289v5ffkexk23.amplifyapp.com',
    'https://main.d264zjawew1yea.amplifyapp.com'])];
  const EN_MARCO = window.top !== window.self;

  const $ = (s, d = document) => d.querySelector(s);
  const raiz = () => $('#raiz');

  /* Escapar SIEMPRE lo que viene del servidor antes de meterlo en HTML. El
     alias de un beneficiario lo escribe una persona, y una persona puede
     escribir una etiqueta. */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const sello = () => (crypto.randomUUID
    ? crypto.randomUUID()
    : 'r' + Date.now() + Math.random().toString(36).slice(2, 10));

  /* Una cifra del API («1234.56») con sus miles separados por un espacio
     fino. Es neutral entre las dos formas del continente y no toca el punto
     decimal que manda el API. */
  const cifra = (t) => {
    const s = String(t == null ? '' : t);
    const m = s.match(/^(-?)(\d+)(\.\d+)?$/);
    if (!m) return s;
    return m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (m[3] || '');
  };
  const fechaCorta = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }); };
  const horaCorta = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }); };
  const fechaLarga = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('es', { dateStyle: 'long', timeStyle: 'short' }); };
  const mesActual = () => new Date().toISOString().slice(0, 7);

  // ── el estado ─────────────────────────────────────────────────────────────
  let sesion = null;      // { token, refreshToken, usuario }
  let vista = 'inicio';
  let parametro = null;   // el número de comprobante, el id de solicitud…
  let datos = {};         // lo que la vista actual cargó
  let cargando = false;
  let recado = null;      // { texto, malo, bueno }
  let sellos = {};        // el sello vivo de cada formulario
  let filtros = { moneda: '', clase: '', desde: '', hasta: '', q: '', pagina: 0 };
  let extractoPedido = { moneda: '', mes: mesActual() };
  let instalable = null;  // el evento beforeinstallprompt, si el navegador lo dio

  const guardar = () => {
    try { sessionStorage.setItem('aucorp.sesion', JSON.stringify(sesion)); } catch { /* modo privado */ }
  };
  const recuperar = () => {
    try { return JSON.parse(sessionStorage.getItem('aucorp.sesion') || 'null'); } catch { return null; }
  };
  const salir = () => {
    sesion = null;
    datos = {};
    try { sessionStorage.removeItem('aucorp.sesion'); } catch { /* nada */ }
    history.replaceState(null, '', location.pathname);
    pintar();
  };

  // ── el tema ───────────────────────────────────────────────────────────────
  /* Oscuro por defecto, claro si la persona lo elige. Se guarda en
     localStorage porque es una preferencia de la máquina, no de la sesión. */
  const temaLeer = () => { try { return localStorage.getItem('aucorp.tema') || ''; } catch { return ''; } };
  const temaPoner = (t) => {
    try { t ? localStorage.setItem('aucorp.tema', t) : localStorage.removeItem('aucorp.tema'); } catch { /* nada */ }
    if (t) document.documentElement.dataset.tema = t; else delete document.documentElement.dataset.tema;
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = t === 'claro' ? '#F3F1ED' : '#151A20';
  };
  temaPoner(temaLeer());

  // ── hablar con el API ─────────────────────────────────────────────────────
  /* Un 401 se intenta arreglar UNA vez con el refresh y se reintenta. Si el
     refresh tampoco vale, se cierra la sesión: insistir contra un token muerto
     solo consigue que la persona vea errores raros en vez de la puerta. */
  async function pedir(ruta, { metodo = 'GET', cuerpo, sinReintento, crudo } = {}) {
    const cab = { 'Content-Type': 'application/json' };
    if (sesion?.token) cab.Authorization = `Bearer ${sesion.token}`;

    let r;
    try {
      r = await fetch(API + ruta, {
        method: metodo, headers: cab,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
    } catch {
      // Ni siquiera hubo respuesta. Se dice lo que pasó de verdad —no se pudo
      // llegar— en vez de un «algo salió mal» que no ayuda a nadie a decidir
      // si reintentar o si es su wifi.
      const e = new Error('No se pudo conectar con AuCorp. Revisá tu conexión.');
      e.red = true; throw e;
    }

    if (r.status === 401 && sesion?.refreshToken && !sinReintento) {
      const ok = await refrescar();
      if (ok) return pedir(ruta, { metodo, cuerpo, sinReintento: true, crudo });
      salir();
      throw new Error('Tu sesión venció. Volvé a entrar.');
    }

    if (crudo) {
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        const e = new Error(d.error || 'No se pudo completar la operación.');
        e.codigo = d.codigo; e.datos = d; e.estado = r.status; throw e;
      }
      return r;
    }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(d.error || 'No se pudo completar la operación.');
      e.codigo = d.codigo; e.datos = d; e.estado = r.status; e.campo = d.campo;
      throw e;
    }
    return d;
  }

  async function refrescar() {
    try {
      const r = await fetch(API + '/auth/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: sesion.refreshToken }),
      });
      if (!r.ok) return false;
      const d = await r.json();
      sesion = { ...sesion, token: d.token, refreshToken: d.refreshToken };
      guardar();
      return true;
    } catch { return false; }
  }

  const avisar = (texto, malo = false) => { recado = { texto, malo }; pintar(); };

  // ── los iconos ────────────────────────────────────────────────────────────
  const ICONOS = {
    inicio: '<path d="M3 11l9-7 9 7"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
    movimientos: '<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="18" cy="18" r="2"/>',
    mover: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    solicitudes: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/>',
    perfil: '<circle cx="12" cy="8.5" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    destinos: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3 20h18"/>',
    depositar: '<path d="M12 4v10m0 0-4-4m4 4 4-4"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    cambiar: '<path d="M4 7h12l-3-3M20 17H8l3 3"/><path d="M4 12h.01"/>',
    cuentas: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/><path d="M15.5 12h3"/>',
    extracto: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    imprimir: '<path d="M6 9V4h12v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M6 14h12v6H6z"/>',
    bajar: '<path d="M12 4v11m0 0-4-4m4 4 4-4"/><path d="M4 19h16"/>',
    salir: '<path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15M10 16l-4-4 4-4M6 12h10"/>',
    atras: '<path d="M15 5l-7 7 7 7"/>',
    instalar: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 8v7m0 0-3-3m3 3 3-3"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONOS[k]}</svg>`;

  /* Las cinco puertas de la casa. Son las mismas en el riel y en la barra del
     teléfono: cinco es lo que cabe sin que el dedo acierte la de al lado. Lo
     demás (destinos, depositar, extracto) se llega desde adentro. */
  const DESTINOS = [
    ['inicio', 'Inicio'],
    ['movimientos', 'Movimientos'],
    ['mover', 'Mover'],
    ['solicitudes', 'Solicitudes'],
    ['perfil', 'Perfil'],
  ];
  /* Qué puerta principal ilumina cada vista secundaria. */
  const PADRE = { comprobante: 'movimientos', extracto: 'movimientos', destinos: 'mover', depositar: 'mover', nueva: 'inicio', constancia: 'solicitudes' };

  function armazon(dentro) {
    const activa = PADRE[vista] || vista;
    const nav = DESTINOS.map(([id, nombre]) =>
      `<button class="nav" data-ir="${id}" ${activa === id ? 'aria-current="page"' : ''}>${svg(id)}${esc(nombre)}</button>`
    ).join('');
    const u = sesion?.usuario || {};
    return `<div class="marco">
      <nav class="riel" aria-label="Secciones">
        <div class="marca">
          <img class="oscura" src="../assets/aucorp-marca-oscura.png" alt="AuCorp">
          <img class="clara" src="../assets/aucorp-marca.png" alt="AuCorp">
        </div>
        ${nav}
        <button class="nav abajo" data-salir>${svg('salir')}Salir</button>
      </nav>
      <div>
        <header class="techo">
          <img src="../assets/aucorp-marca-oscura.png" alt="AuCorp" class="oscura">
          <span class="quien">${esc(u.gid || '')}</span>
        </header>
        <main class="lienzo">${dentro}</main>
      </div>
    </div>
    <nav class="barra" aria-label="Secciones">${DESTINOS.map(([id, nombre]) =>
      `<button data-ir="${id}" ${activa === id ? 'aria-current="page"' : ''}>${svg(id)}<span>${esc(nombre)}</span></button>`).join('')}</nav>`;
  }

  /* El pie legal. Va en TODAS las pantallas, no escondido en un «acerca de».
     Que AuCorp no sea un banco con licencia no es letra chica: es lo que
     cambia qué pasa con tu dinero si algo sale mal. */
  const PIE = `<p class="pieL">AuCorp es una institución de tecnología financiera constituida en
    Próspera ZEDE bajo la Regulación FinTech A. <strong>No es un banco con licencia bancaria:
    los saldos no están cubiertos por un seguro de depósitos.</strong> Las tasas de cambio son de
    referencia y no son un precio de ejecución garantizado.</p>`;

  const recadoHTML = () => {
    if (!recado) return '';
    return `<div style="margin-bottom:16px"><div class="aviso ${recado.malo ? 'malo' : 'bueno'}" role="status">${esc(recado.texto)}</div></div>`;
  };
  const cabecera = (titulo, acciones = '') =>
    `<div class="cab"><h1>${titulo}</h1>${acciones ? `<div class="acc">${acciones}</div>` : ''}</div>`;
  const volver = (a, texto = 'Volver') => `<button class="bot fino chico" data-ir="${a}">${svg('atras')}${texto}</button>`;

  const SELLO = {
    pendiente: 'esp', ejecutando: 'esp', rechazando: 'esp', avisada: 'esp',
    ejecutada: 'ok', acreditada: 'ok', rechazada: 'no',
  };
  const selloEstado = (s) => `<span class="sello ${SELLO[s.estado] || 'esp'}">${esc(s.estadoTexto || s.estado)}</span>`;

  /* La suma en dólares se hace en el SERVIDOR, que es quien tiene la tasa. Si
     no vino, se pinta un guion: sumar sin tasa sería inventarse un total. */
  const sumaVisible = () => (datos.totalUsd ? `${cifra(datos.totalUsd)}<small>USD</small>` : '—');

  /* Una línea del libro rayado, a partir de un movimiento del historial. */
  function lineaLibro(m, { conSaldo } = {}) {
    const mias = (m.lineas || []).filter((l) => l.cuenta === 'yo');
    const cero = (v) => !v || /^0(\.0+)?$/.test(v);
    return mias.map((l) => {
      const entra = !cero(l.haber);
      const monto = entra ? l.haber : l.debe;
      if (cero(monto)) return '';
      return `<li class="toca" data-comprobante="${esc(m.numero)}" role="button" tabindex="0">
        <div class="fecha">${esc(fechaCorta(m.fecha))}<small>${esc(horaCorta(m.fecha))}</small></div>
        <div class="concepto"><b>${esc(m.claseTexto || m.clase)}</b><span>${esc(m.glosa)}</span></div>
        <div class="cifra ${entra ? 'mas' : ''}">${entra ? '+' : '−'} ${cifra(monto)}<small>${esc(l.moneda)}</small>
          ${conSaldo && m.saldo ? `<span class="saldo">saldo ${cifra(m.saldo)}</span>` : ''}</div>
      </li>`;
    }).join('');
  }

  // ── inicio: el resumen de cuenta ──────────────────────────────────────────
  function vistaInicio() {
    const u = sesion?.usuario || {};
    const cuentas = datos.cuentas || [];
    const movs = (datos.movimientos || []).slice(0, 5);
    const abiertas = (datos.solicitudes || []).filter((s) => !s.terminada);
    const nombre = String(u.nombre || '').split(' ')[0];

    const chips = cuentas.map((c) => `
      <button class="tarj toca moneda" data-ir="movimientos" data-moneda="${esc(c.moneda)}">
        <div class="top"><span class="cod">${esc(c.moneda)}</span><span class="et">${esc(c.simbolo || '')}</span></div>
        <div class="saldo n">${cifra(c.saldo.texto)}</div>
        <div class="pais">${esc(c.nombre || '')}</div>
      </button>`).join('');

    return `${recadoHTML()}
      ${cabecera(nombre ? `Hola, ${esc(nombre)}` : 'Tus cuentas',
        `<span class="sello ${u.verificada ? 'ok' : 'esp'}">${u.verificada ? 'Identidad verificada' : 'Sin verificar'}</span>`)}

      <div class="pila">
        <div class="total">
          <span class="et">Saldo disponible</span>
          <span class="cifra">${cuentas.length ? sumaVisible() : '—'}</span>
          <span class="pie">${!cuentas.length
            ? 'Todavía no abriste ninguna cuenta.'
            : datos.totalUsd
              ? 'Suma de tus cuentas en dólares, con la tasa de referencia de hoy.'
              : 'No se pudo convertir a dólares ahora mismo. Tus saldos por moneda son exactos.'}</span>
        </div>

        <div class="acciones">
          <button class="accion" data-ir="depositar">${svg('depositar')}<span>Depositar</span></button>
          <button class="accion" data-ir="mover">${svg('mover')}<span>Transferir</span></button>
          <button class="accion" data-ir="mover" data-seccion="cambiar">${svg('cambiar')}<span>Cambiar</span></button>
          <button class="accion" data-ir="extracto">${svg('extracto')}<span>Extracto</span></button>
        </div>

        ${cuentas.length
          ? `<div class="rej c3">${chips}</div>
             <div class="fila"><button class="bot fino chico" data-ir="nueva">${svg('cuentas')}Abrir otra moneda</button></div>`
          : `<div class="tarj vacio"><b>Ninguna cuenta abierta</b>
              Abrí la primera en la moneda que usás todos los días.
              <div style="margin-top:16px"><button class="bot" data-ir="nueva">Abrir una cuenta</button></div></div>`}

        ${abiertas.length ? `
        <div class="tarj">
          <div class="fila" style="margin-bottom:6px"><span class="et crece">En trámite</span>
            <button class="bot fino chico" data-ir="solicitudes">Ver todas</button></div>
          <ul class="libro">${abiertas.slice(0, 3).map(lineaSolicitud).join('')}</ul>
        </div>` : ''}

        ${movs.length ? `
        <div class="tarj">
          <div class="fila" style="margin-bottom:6px"><span class="et crece">Lo último</span>
            <button class="bot fino chico" data-ir="movimientos">Ver todo</button></div>
          <ul class="libro">${movs.map((m) => lineaLibro(m)).join('')}</ul>
        </div>` : cuentas.length ? `<p class="sec chico">Cuando entre o salga dinero, cada operación va a quedar aquí con su fecha y su comprobante.</p>` : ''}
      </div>${PIE}`;
  }

  // ── movimientos con filtros ───────────────────────────────────────────────
  function vistaMovimientos() {
    const ms = datos.movimientos || [];
    const cuentas = datos.cuentas || [];
    const clases = datos.clases || {};
    const total = datos.totalMovimientos ?? ms.length;
    const porPagina = datos.porPagina || 50;
    const hayFiltro = filtros.moneda || filtros.clase || filtros.desde || filtros.hasta || filtros.q;

    return `${recadoHTML()}
      ${cabecera('Movimientos', `<button class="bot fino chico" data-ir="extracto">${svg('extracto')}Extracto mensual</button>`)}
      <form class="tarj" data-form="filtros" style="margin-bottom:12px">
        <div class="filtros">
          <div class="campo"><label for="f-mon">Moneda</label>
            <select id="f-mon" name="moneda"><option value="">Todas</option>${cuentas.map((c) =>
              `<option value="${esc(c.moneda)}" ${filtros.moneda === c.moneda ? 'selected' : ''}>${esc(c.moneda)}</option>`).join('')}</select></div>
          <div class="campo"><label for="f-cl">Tipo</label>
            <select id="f-cl" name="clase"><option value="">Todos</option>${Object.entries(clases).map(([k, v]) =>
              `<option value="${esc(k)}" ${filtros.clase === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
          <div class="campo"><label for="f-de">Desde</label>
            <input id="f-de" name="desde" type="date" value="${esc(filtros.desde)}"></div>
          <div class="campo"><label for="f-ha">Hasta</label>
            <input id="f-ha" name="hasta" type="date" value="${esc(filtros.hasta)}"></div>
          <div class="campo"><label for="f-q">Buscar</label>
            <input id="f-q" name="q" value="${esc(filtros.q)}" placeholder="Concepto o número" autocomplete="off"></div>
          <div class="campo fila"><button class="bot chico" type="submit">Filtrar</button>
            ${hayFiltro ? '<button class="bot fino chico" type="button" data-limpiar>Limpiar</button>' : ''}</div>
        </div>
      </form>

      ${ms.length
        ? `<div class="tarj">
            <div class="fila" style="margin-bottom:4px"><span class="et crece">${total} movimiento${total === 1 ? '' : 's'}${hayFiltro ? ' con este filtro' : ''}</span>
              <span class="chico sec">Tocá uno para ver su comprobante</span></div>
            <ul class="libro">${ms.map((m) => lineaLibro(m)).join('')}</ul>
            ${total > porPagina ? `<div class="fila" style="margin-top:12px;justify-content:space-between">
              <button class="bot fino chico" data-pagina="${filtros.pagina - 1}" ${filtros.pagina === 0 ? 'disabled' : ''}>Más recientes</button>
              <span class="chico sec">Página ${filtros.pagina + 1} de ${Math.ceil(total / porPagina)}</span>
              <button class="bot fino chico" data-pagina="${filtros.pagina + 1}" ${(filtros.pagina + 1) * porPagina >= total ? 'disabled' : ''}>Más antiguos</button></div>` : ''}
          </div>`
        : `<div class="tarj vacio"><b>${hayFiltro ? 'Nada con ese filtro' : 'Todavía no hay movimientos'}</b>
            ${hayFiltro ? 'Probá con otras fechas o sin el texto.' : 'Cuando entre o salga dinero, cada operación va a quedar aquí con su fecha y su comprobante.'}</div>`}
      ${PIE}`;
  }

  // ── comprobante ───────────────────────────────────────────────────────────
  function vistaComprobante() {
    const c = datos.comprobante;
    if (!c) {
      return `${recadoHTML()}${cabecera('Comprobante', volver('movimientos'))}
        <div class="tarj vacio"><b>No se encontró ese movimiento</b>Puede que el número esté mal copiado.</div>${PIE}`;
    }
    const principal = c.montos[0];
    return `${recadoHTML()}
      ${cabecera('Comprobante', `${volver('movimientos')}<button class="bot chico" data-imprimir>${svg('imprimir')}Imprimir o guardar en PDF</button>`)}
      <article class="papel" aria-label="Comprobante ${esc(c.numero)}">
        <div class="cabP">
          <div class="fila"><img src="../assets/aucorp.png" alt=""><div class="quien"><b>AuCorp</b><span>Cuentas en moneda local</span></div></div>
          <div class="der"><div class="et" style="color:#5F6B77">Comprobante</div><div class="num">${esc(c.numero)}</div></div>
        </div>
        <p class="titP">${esc(c.claseTexto)}</p>
        <p class="num">${esc(fechaLarga(c.fecha))}</p>
        ${c.montos.map((m) => `<div class="grande">${m.sentido === 'entra' ? '+' : '−'} ${cifra(m.monto)}<small>${esc(m.moneda)}</small></div>
          <p class="chico" style="color:#5F6B77">${m.sentido === 'entra' ? 'Entró a tu cuenta' : 'Salió de tu cuenta'} · saldo después: <span class="n">${cifra(m.saldoDespues)} ${esc(m.moneda)}</span></p>`).join('')}
        <dl>
          <dt>Concepto</dt><dd>${esc(c.glosa)}</dd>
          <dt>Titular</dt><dd class="n">${esc(c.titular)}</dd>
          <dt>Contraparte</dt><dd>${esc(c.contrapartes.join(' · ') || '—')}</dd>
          ${c.montos.map((m) => `<dt>Saldo antes</dt><dd class="n">${cifra(m.saldoAntes)} ${esc(m.moneda)}</dd>`).join('')}
          <dt>Sello</dt><dd class="n">${esc(c.ref)}</dd>
          <dt>Emitido</dt><dd>${esc(fechaLarga(c.emitido))}</dd>
        </dl>
        <div class="pieP">
          <div>Huella SHA-256 del comprobante — se puede cotejar pidiendo el mismo número al API:</div>
          <div class="huella">${esc(c.huella)}</div>
          <div style="margin-top:8px">${esc(c.emisor)}</div>
        </div>
      </article>${PIE}`;
  }

  // ── extracto mensual ──────────────────────────────────────────────────────
  function vistaExtracto() {
    const cuentas = datos.cuentas || [];
    const e = datos.extracto;
    const opciones = cuentas.map((c) =>
      `<option value="${esc(c.moneda)}" ${extractoPedido.moneda === c.moneda ? 'selected' : ''}>${esc(c.moneda)} · ${esc(c.nombre || '')}</option>`).join('');
    return `${recadoHTML()}
      ${cabecera('Extracto mensual', volver('movimientos', 'Movimientos'))}
      <form class="tarj no-imprimir" data-form="extracto" style="margin-bottom:12px">
        <div class="filtros">
          <div class="campo"><label for="x-mon">Moneda</label><select id="x-mon" name="moneda">${opciones}</select></div>
          <div class="campo"><label for="x-mes">Mes</label>
            <input id="x-mes" name="mes" type="month" value="${esc(extractoPedido.mes)}" max="${esc(mesActual())}" min="2020-01"></div>
          <div class="campo fila">
            <button class="bot chico" type="submit">Ver</button>
            ${e ? `<button class="bot fino chico" type="button" data-csv>${svg('bajar')}CSV</button>
                   <button class="bot fino chico" type="button" data-imprimir>${svg('imprimir')}PDF</button>` : ''}
          </div>
        </div>
      </form>
      ${!cuentas.length ? `<div class="tarj vacio"><b>Primero abrí una cuenta</b>No hay nada que extractar todavía.</div>` : ''}
      ${e ? `<article class="papel" aria-label="Extracto ${esc(e.periodo)} ${esc(e.moneda)}">
        <div class="cabP">
          <div class="fila"><img src="../assets/aucorp.png" alt=""><div class="quien"><b>AuCorp</b><span>Cuentas en moneda local</span></div></div>
          <div class="der"><div class="et" style="color:#5F6B77">Extracto</div><div class="num">${esc(e.periodo)} · ${esc(e.moneda)}</div></div>
        </div>
        <p class="titP">Cuenta en ${esc(e.monedaNombre)}</p>
        <p class="num">Titular ${esc(e.titular)} · del ${esc(fechaCorta(e.desde))} al ${esc(fechaCorta(e.hasta))}</p>
        <div class="resumenP">
          <div><span class="et">Saldo inicial</span><span class="n">${cifra(e.saldoInicial)}</span></div>
          <div><span class="et">Entradas</span><span class="n">+ ${cifra(e.totalEntradas)}</span></div>
          <div><span class="et">Salidas</span><span class="n">− ${cifra(e.totalSalidas)}</span></div>
          <div><span class="et">Saldo final</span><span class="n">${cifra(e.saldoFinal)}</span></div>
        </div>
        ${e.movimientos.length ? `<table>
          <thead><tr><th>Fecha</th><th>Concepto</th><th class="n">Entra</th><th class="n">Sale</th><th class="n">Saldo</th></tr></thead>
          <tbody>${e.movimientos.map((m) => `<tr>
            <td class="n" style="text-align:left">${esc(fechaCorta(m.fecha))}</td>
            <td>${esc(m.claseTexto)}<br><span class="chico" style="color:#5F6B77">${esc(m.glosa)}</span><br><span class="num">${esc(m.numero)}</span></td>
            <td class="n">${m.entra ? cifra(m.entra) : ''}</td>
            <td class="n">${m.sale ? cifra(m.sale) : ''}</td>
            <td class="n">${cifra(m.saldo)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="2">Saldo al ${esc(fechaCorta(e.hasta))}</td><td class="n">${cifra(e.totalEntradas)}</td><td class="n">${cifra(e.totalSalidas)}</td><td class="n">${cifra(e.saldoFinal)}</td></tr></tfoot>
        </table>` : `<p style="margin-top:14px;color:#5F6B77">Sin movimientos en este mes. El saldo se mantuvo en ${cifra(e.saldoFinal)} ${esc(e.moneda)}.</p>`}
        <div class="pieP">Emitido el ${esc(fechaLarga(e.emitido))}. ${esc(e.emisor)}</div>
      </article>` : cuentas.length ? `<p class="sec chico">Elegí la moneda y el mes. El extracto se puede descargar en CSV o guardar en PDF desde el navegador.</p>` : ''}
      ${PIE}`;
  }

  // ── solicitudes ───────────────────────────────────────────────────────────
  function lineaSolicitud(s) {
    const destino = s.tipo === 'retiro' ? (s.beneficiario?.alias || 'tu banco') : (s.beneficiario?.banco || 'la cuenta de AuCorp');
    return `<li class="toca" data-constancia="${esc(s.id)}" role="button" tabindex="0">
      <div class="fecha">${esc(fechaCorta(s.creada))}<small>${esc(horaCorta(s.creada))}</small></div>
      <div class="concepto"><b>${s.tipo === 'retiro' ? 'Retiro a ' : 'Depósito desde '}${esc(destino)}</b>
        <span>${selloEstado(s)}${!s.terminada && s.horasSinCambio >= 24 ? ` · lleva ${s.horasSinCambio} h` : ''}</span></div>
      <div class="cifra ${s.tipo === 'deposito' ? 'mas' : ''}">${s.tipo === 'deposito' ? '+' : '−'} ${cifra(s.neto.texto)}<small>${esc(s.moneda)}</small></div>
    </li>`;
  }

  function vistaSolicitudes() {
    const ss = datos.solicitudes || [];
    const abiertas = ss.filter((s) => !s.terminada);
    const cerradas = ss.filter((s) => s.terminada);
    const cuentas = datos.cuentas || [];
    return `${recadoHTML()}
      ${cabecera('Solicitudes', `<button class="bot fino chico" data-ir="mover">${svg('mover')}Pedir un retiro</button>`)}
      <div class="pila">
        <div class="aviso">Un retiro se <strong>pide</strong> y lo paga operaciones contra el banco; un depósito se
          <strong>avisa</strong> y operaciones lo acredita cuando lo encuentra en el extracto. Hoy las dos confirmaciones
          son manuales: por eso cada solicitud dice qué le falta.</div>

        ${abiertas.length ? `<div class="tarj"><span class="et">En trámite</span>
          <ul class="libro" style="margin-top:6px">${abiertas.map(lineaSolicitud).join('')}</ul></div>` : ''}

        <form class="tarj pila" data-form="aviso">
          <div><span class="et">Ya transferí</span><h3 style="margin-top:6px">Avisar un depósito</h3>
            <p class="sec chico" style="margin-top:4px">Si ya mandaste dinero a la cuenta de AuCorp, avisalo con la referencia
              del banco. No acredita nada por sí solo: le da a operaciones dónde buscar y a vos dónde mirar.</p></div>
          <div class="fila">
            <div class="campo crece"><label for="a-mon">Moneda</label>
              <select id="a-mon" name="moneda">${cuentas.map((c) => `<option value="${esc(c.moneda)}">${esc(c.moneda)}</option>`).join('')}</select></div>
            <div class="campo crece"><label for="a-monto">Monto transferido</label>
              <input id="a-monto" class="n" name="monto" inputmode="decimal" placeholder="0.00" autocomplete="off"></div>
          </div>
          <div class="campo"><label for="a-ref">Referencia de la transferencia</label>
            <input id="a-ref" name="referenciaBancaria" maxlength="120" autocomplete="off" placeholder="El número que te dio tu banco">
            <p class="ayuda">Poné además tu Genesis ID en el concepto de la transferencia; así se encuentra más rápido.</p></div>
          <button class="bot" type="submit" ${cuentas.length ? '' : 'disabled'}>Avisar el depósito</button>
        </form>

        ${cerradas.length ? `<div class="tarj"><span class="et">Terminadas</span>
          <ul class="libro" style="margin-top:6px">${cerradas.map(lineaSolicitud).join('')}</ul></div>` : ''}
        ${!ss.length ? `<div class="tarj vacio"><b>Sin solicitudes</b>Los retiros que pidas y los depósitos que avises van a quedar aquí, con su estado.</div>` : ''}
      </div>${PIE}`;
  }

  // ── constancia de una solicitud ───────────────────────────────────────────
  function vistaConstancia() {
    const s = datos.solicitud;
    if (!s) {
      return `${recadoHTML()}${cabecera('Solicitud', volver('solicitudes'))}
        <div class="tarj vacio"><b>No se encontró esa solicitud</b></div>${PIE}`;
    }
    const b = s.beneficiario || {};
    return `${recadoHTML()}
      ${cabecera(s.tipo === 'retiro' ? 'Retiro pedido' : 'Depósito avisado',
        `${volver('solicitudes')}<button class="bot chico" data-imprimir>${svg('imprimir')}Imprimir o guardar en PDF</button>`)}
      ${!s.terminada ? `<div class="aviso" style="margin-bottom:12px"><strong>Qué falta:</strong> ${esc(s.queFalta)}
        ${s.horasSinCambio >= 24 ? ` Lleva ${s.horasSinCambio} horas sin cambios${s.horasSinCambio >= 48 ? ': si te urge, escribinos con este número' : ''}.` : ''}</div>` : ''}
      <article class="papel" aria-label="Constancia ${esc(s.numero)}">
        <div class="cabP">
          <div class="fila"><img src="../assets/aucorp.png" alt=""><div class="quien"><b>AuCorp</b><span>Cuentas en moneda local</span></div></div>
          <div class="der"><div class="et" style="color:#5F6B77">Constancia</div><div class="num">${esc(s.numero)}</div></div>
        </div>
        <p class="titP">${s.tipo === 'retiro' ? 'Solicitud de retiro' : 'Aviso de depósito'}</p>
        <p class="num">${esc(fechaLarga(s.creada))}</p>
        <div class="grande">${cifra(s.neto.texto)}<small>${esc(s.moneda)}</small></div>
        <p class="chico" style="color:#5F6B77">${s.tipo === 'retiro' ? 'Neto a recibir' : 'Monto avisado'}
          ${s.tipo === 'retiro' && s.comision?.texto && !/^0(\.0+)?$/.test(s.comision.texto) ? ` · comisión ${cifra(s.comision.texto)} · apartado ${cifra(s.monto.texto)}` : ''}</p>
        <dl>
          <dt>Estado</dt><dd>${esc(s.estadoTexto)}${s.resuelta ? ` · ${esc(fechaLarga(s.resuelta))}` : ''}</dd>
          ${s.tipo === 'retiro' ? `
            <dt>Destino</dt><dd>${esc(b.alias || '')}${b.banco ? ` · ${esc(b.banco)}` : ''}${b.numero ? ` · <span class="n">${esc(b.numero)}</span>` : ''}</dd>
            <dt>Titular</dt><dd>${esc(b.titular || '—')}</dd>`
          : `
            <dt>A la cuenta de</dt><dd>${esc(b.titular || 'AuCorp')}${b.banco ? ` · ${esc(b.banco)}` : ''}</dd>
            <dt>Referencia</dt><dd class="n">${esc(s.referenciaBancaria || '—')}</dd>`}
          ${s.comprobante ? `<dt>Comprobante</dt><dd>${esc(s.comprobante)}</dd>` : ''}
          ${s.nota ? `<dt>Nota</dt><dd>${esc(s.nota)}</dd>` : ''}
          <dt>Sello</dt><dd class="n">${esc(s.ref)}</dd>
          <dt>Última novedad</dt><dd>${esc(fechaLarga(s.actualizada))}</dd>
        </dl>
        <div class="pieP">${s.tipo === 'retiro'
          ? 'El dinero queda apartado desde el pedido y no está disponible para gastarlo otra vez. Si el retiro se rechaza, vuelve entero a tu cuenta, comisión incluida.'
          : 'Este aviso no acredita el dinero: se acredita cuando operaciones lo encuentra en el extracto del banco corresponsal, con su comprobante.'}
          AuCorp es una institución de tecnología financiera bajo la Regulación FinTech A de Próspera ZEDE. No es un banco con licencia bancaria.</div>
      </article>${PIE}`;
  }

  // ── perfil ────────────────────────────────────────────────────────────────
  function vistaPerfil() {
    const p = datos.perfil || sesion?.usuario || {};
    const l = datos.limite;
    const tema = temaLeer();
    return `${recadoHTML()}
      ${cabecera('Perfil')}
      <div class="rej c2">
        <div class="tarj pila">
          <span class="et">Tu identidad</span>
          <div><strong style="font-size:18px;font-family:'Fraunces',serif">${esc(p.nombre || 'Sin nombre todavía')}</strong>
            <div class="n chico sec">${esc(p.gid || '')}</div></div>
          <div class="fila"><span class="sello ${p.verificada ? 'ok' : 'esp'}">${p.verificada ? 'Verificada en Genesis ID' : 'Sin verificar'}</span></div>
          <p class="chico sec">${p.verificada
            ? 'Podés abrir cuentas y mover dinero.'
            : 'Para abrir cuentas y mover dinero hace falta terminar la verificación en Genesis ID. Podés mirar la casa mientras tanto.'}</p>
          ${p.direccionWallet ? `<p class="chico sec">Tu Veta Wallet: <span class="n" style="word-break:break-all">${esc(p.direccionWallet)}</span></p>` : ''}
          ${p.cliente_desde ? `<p class="chico sec">Cliente desde ${esc(fechaCorta(p.cliente_desde))}.</p>` : ''}
        </div>

        <div class="tarj pila">
          <span class="et">Cuánto podés mover</span>
          <div><strong style="font-size:18px">Nivel ${esc(String(l?.nivel || p.nivel || 1))}</strong></div>
          ${l ? `
            <table class="tabla"><tbody>
              <tr><td class="et">Hoy</td><td class="der n">${l.diario.usado === null ? '—' : cifra(l.diario.usado)} de ${cifra(l.diario.tope)} ${esc(l.moneda)}</td></tr>
              <tr><td class="et">Este mes</td><td class="der n">${l.mensual.usado === null ? '—' : cifra(l.mensual.usado)} de ${cifra(l.mensual.tope)} ${esc(l.moneda)}</td></tr>
            </tbody></table>
            <p class="ayuda">Se mide en dólares sumando lo que SALE de todas tus monedas. Un retiro rechazado libera lo que había usado.
              ${l.diario.usado === null ? 'Ahora mismo no se pudo medir: por eso el guion.' : ''}</p>`
            : '<p class="chico sec">Los límites se miden en dólares, sumando lo que sale de todas tus monedas.</p>'}
          <p class="ayuda">Para subir de nivel hace falta ampliar tu expediente. Escribinos y te decimos qué falta.</p>
        </div>

        <div class="tarj pila">
          <span class="et">Tus cuentas</span>
          ${(p.cuentas || []).length ? `<ul class="libro">${(p.cuentas || []).map((c) => `<li>
            <div class="fecha">${esc(fechaCorta(c.creada))}</div>
            <div class="concepto"><b>${esc(c.moneda)}</b><span>${esc(c.alias || 'Cuenta en moneda local')}</span></div>
            <div class="cifra"></div></li>`).join('')}</ul>` : '<p class="chico sec">Ninguna abierta todavía.</p>'}
          <div class="fila"><button class="bot fino chico" data-ir="nueva">Abrir otra moneda</button>
            <button class="bot fino chico" data-ir="destinos">${svg('destinos')}Destinos guardados</button></div>
        </div>

        <div class="tarj pila">
          <span class="et">La app</span>
          <div class="fila"><span class="crece chico">Apariencia</span>
            <div class="seg" role="group" aria-label="Apariencia">
              <button data-tema="" aria-pressed="${tema === '' ? 'true' : 'false'}">Sistema</button>
              <button data-tema="oscuro" aria-pressed="${tema === 'oscuro' ? 'true' : 'false'}">Oscura</button>
              <button data-tema="claro" aria-pressed="${tema === 'claro' ? 'true' : 'false'}">Clara</button>
            </div></div>
          ${instalable ? `<button class="bot fino chico" data-instalar>${svg('instalar')}Instalar en el teléfono</button>`
            : `<p class="chico sec">${EN_MARCO ? 'Estás dentro de Veta Wallet.' : 'Desde el menú del navegador podés agregar AuCorp a la pantalla de inicio: abre como una app.'}</p>`}
          <div class="rej c2" style="margin-top:4px">
            <a class="casa" href="https://app.vetawallet.com" rel="noopener" target="_blank"><span class="et">Cripto</span><strong>Veta Wallet</strong><p>Tus activos en la cadena de Orden Global.</p></a>
            <a class="casa" href="https://www.ordenexchange.com" rel="noopener" target="_blank"><span class="et">Cambio</span><strong>Ordenex</strong><p>La casa de cambio. AuCorp es su dueña.</p></a>
          </div>
          <button class="bot fino chico" data-salir>${svg('salir')}Cerrar sesión</button>
        </div>
      </div>
      ${datos.naturaleza ? `<p class="pieL">${esc(datos.naturaleza)} Las tasas de cambio son de referencia y no son un precio de ejecución garantizado.</p>` : PIE}`;
  }

  // ── mover ─────────────────────────────────────────────────────────────────
  function vistaMover() {
    const cuentas = datos.cuentas || [];
    const opciones = cuentas.map((c) =>
      `<option value="${esc(c.moneda)}">${esc(c.moneda)} · ${cifra(c.saldo.texto)}</option>`).join('');
    const bens = (datos.beneficiarios || []);

    if (!cuentas.length) {
      return `${recadoHTML()}${cabecera('Mover dinero')}
        <div class="tarj vacio"><b>Primero abrí una cuenta</b>No hay nada que mover todavía.
        <div style="margin-top:16px"><button class="bot" data-ir="nueva">Abrir una cuenta</button></div></div>${PIE}`;
    }

    const opcBen = (tipo) => bens.filter((b) => !tipo || b.tipo === tipo)
      .map((b) => `<option value="${esc(b.id)}">${esc(b.alias)} · ${esc(b.moneda)}${b.numero ? ' · ' + esc(b.numero) : ''}</option>`).join('');
    const sinDestinos = (tipo) => (bens.some((b) => b.tipo === tipo) ? '' :
      `<p class="ayuda">No tenés destinos ${tipo === 'interno' ? 'de AuCorp' : 'bancarios'} guardados. <button type="button" class="bot fino chico" data-ir="destinos" style="margin-left:4px">Agregar uno</button></p>`);

    return `${recadoHTML()}
      ${cabecera('Mover dinero', `<button class="bot fino chico" data-ir="destinos">${svg('destinos')}Destinos</button>`)}
      <div class="rej c2">

        <form class="tarj pila" data-form="transferir" id="sec-transferir">
          <div><span class="et">Dentro de AuCorp</span><h3 style="margin-top:6px">Transferir</h3></div>
          <div class="campo"><label for="t-ben">A quién</label>
            <select id="t-ben" name="beneficiario"><option value="">Elegí un destino guardado</option>${opcBen('interno')}</select>
            ${sinDestinos('interno')}</div>
          <div class="fila">
            <div class="campo crece"><label for="t-mon">Moneda</label><select id="t-mon" name="moneda">${opciones}</select></div>
            <div class="campo crece"><label for="t-monto">Monto</label>
              <input id="t-monto" class="n" name="monto" inputmode="decimal" placeholder="0.00" autocomplete="off"></div>
          </div>
          <button class="bot" type="submit">Transferir</button>
        </form>

        <form class="tarj pila" data-form="cambiar" id="sec-cambiar">
          <div><span class="et">Entre tus monedas</span><h3 style="margin-top:6px">Cambiar</h3></div>
          <div class="fila">
            <div class="campo crece"><label for="c-de">De</label><select id="c-de" name="de">${opciones}</select></div>
            <div class="campo crece"><label for="c-a">A</label><select id="c-a" name="a">${(datos.monedas || []).map((m) =>
              `<option value="${esc(m.codigo)}">${esc(m.codigo)} · ${esc(m.nombre)}</option>`).join('')}</select></div>
          </div>
          <div class="campo"><label for="c-monto">Monto</label>
            <input id="c-monto" class="n" name="monto" inputmode="decimal" placeholder="0.00" autocomplete="off"></div>
          <div class="aviso" data-cotiza>Escribí un monto para ver la tasa de hoy.</div>
          <button class="bot" type="submit">Cambiar</button>
        </form>

        <form class="tarj pila" data-form="retirar" id="sec-retirar">
          <div><span class="et">Fuera de AuCorp</span><h3 style="margin-top:6px">Retirar a un banco</h3></div>
          <div class="campo"><label for="r-ben">A qué cuenta</label>
            <select id="r-ben" name="beneficiario"><option value="">Elegí una cuenta guardada</option>${opcBen('bancario')}</select>
            ${sinDestinos('bancario')}</div>
          <div class="fila">
            <div class="campo crece"><label for="r-mon">Moneda</label><select id="r-mon" name="moneda">${opciones}</select></div>
            <div class="campo crece"><label for="r-monto">Monto</label>
              <input id="r-monto" class="n" name="monto" inputmode="decimal" placeholder="0.00" autocomplete="off"></div>
          </div>
          <p class="ayuda">El dinero sale de tu saldo al pedirlo y queda apartado hasta que se pague. Si se rechaza, vuelve entero.</p>
          <button class="bot" type="submit">Pedir el retiro</button>
        </form>

        <button class="tarj toca" data-ir="depositar">
          <span class="et">Recibir</span>
          <h3 style="margin:7px 0 5px">Depositar</h3>
          <p class="chico sec">Te decimos a qué cuenta mandar el dinero y con qué referencia.</p>
        </button>
      </div>${PIE}`;
  }

  // ── destinos (la libreta) ─────────────────────────────────────────────────
  function vistaDestinos() {
    const bs = datos.beneficiarios || [];
    const monedas = (datos.monedas || []).map((m) =>
      `<option value="${esc(m.codigo)}">${esc(m.codigo)} · ${esc(m.nombre)}</option>`).join('');

    return `${recadoHTML()}
      ${cabecera('Destinos guardados', volver('mover', 'Mover'))}
      <div class="aviso" style="margin-bottom:14px">Guardar un destino una vez y elegirlo después evita el
        error que más caro sale: un dígito cambiado en el número de cuenta. Una transferencia emitida no se
        deshace pidiéndolo.</div>
      <div class="rej c2">
        <div class="pila">
          ${bs.length ? bs.map((b) => `
            <div class="tarj fila">
              <div class="crece">
                <strong>${esc(b.alias)}</strong>
                <div class="ayuda">${b.tipo === 'interno'
                  ? 'Cuenta de AuCorp · <span class="n">' + esc(b.gidDestino) + '</span>'
                  : esc(b.banco) + ' · <span class="n">' + esc(b.numero) + '</span>'} · ${esc(b.moneda)}</div>
              </div>
              <button class="bot fino chico" data-borrar="${esc(b.id)}">Quitar</button>
            </div>`).join('')
            : `<div class="tarj vacio"><b>Sin destinos guardados</b>Agregá el primero al lado.</div>`}
        </div>

        <form class="tarj pila" data-form="destino">
          <h3>Agregar un destino</h3>
          <div class="campo"><label for="d-alias">Nombre para reconocerlo</label>
            <input id="d-alias" name="alias" maxlength="60" placeholder="Mi cuenta del banco" autocomplete="off"></div>
          <div class="fila">
            <div class="campo crece"><label for="d-tipo">Tipo</label>
              <select id="d-tipo" name="tipo">
                <option value="bancario">Cuenta bancaria</option>
                <option value="interno">Otra cuenta de AuCorp</option></select></div>
            <div class="campo crece"><label for="d-mon">Moneda</label><select id="d-mon" name="moneda">${monedas}</select></div>
          </div>
          <div data-si="interno" hidden>
            <div class="campo"><label for="d-gid">Genesis ID de la persona</label>
              <input id="d-gid" name="gidDestino" autocomplete="off" placeholder="GEN-XXXX-XXXX-X" style="text-transform:uppercase"></div>
          </div>
          <div data-si="bancario">
            <div class="campo"><label for="d-banco">Banco</label><input id="d-banco" name="banco" autocomplete="off"></div>
            <div class="campo"><label for="d-tit">Titular de la cuenta</label><input id="d-tit" name="titular" autocomplete="off">
              <p class="ayuda">Tal como figura en el banco. Se comprueba contra las listas de sanciones al guardarlo.</p></div>
            <div class="campo"><label for="d-num">Número de cuenta</label><input id="d-num" class="n" name="numero" autocomplete="off"></div>
            <div class="fila">
              <div class="campo crece"><label for="d-swift">SWIFT / BIC</label><input id="d-swift" name="swift" autocomplete="off" placeholder="Opcional"></div>
              <div class="campo crece"><label for="d-pais">País</label><input id="d-pais" name="pais" autocomplete="off"></div>
            </div>
          </div>
          <button class="bot" type="submit">Guardar destino</button>
        </form>
      </div>${PIE}`;
  }

  // ── depositar ─────────────────────────────────────────────────────────────
  function vistaDepositar() {
    const i = datos.instrucciones;
    const monedas = (datos.cuentas || []).map((c) =>
      `<option value="${esc(c.moneda)}" ${datos.depMoneda === c.moneda ? 'selected' : ''}>${esc(c.moneda)}</option>`).join('');

    return `${recadoHTML()}
      ${cabecera('Depositar', volver('inicio', 'Inicio'))}
      <div class="tarj pila" style="max-width:620px">
        ${monedas ? `<div class="campo"><label for="dep-mon">¿En qué moneda?</label><select id="dep-mon" data-dep-moneda>${monedas}</select></div>`
          : '<div class="vacio"><b>Primero abrí una cuenta</b>El depósito necesita una cuenta donde entrar.</div>'}
        ${i ? `
          <div class="aviso">Poné <strong class="n">${esc(datos.referencia || '')}</strong> como referencia
            de la transferencia. Sin referencia, el depósito puede tardar en acreditarse.</div>
          <table class="tabla"><tbody>
            <tr><td class="et">Banco</td><td>${esc(i.banco)}</td></tr>
            <tr><td class="et">Titular</td><td>${esc(i.titular)}</td></tr>
            <tr><td class="et">Cuenta</td><td class="n">${esc(i.numero)}</td></tr>
            ${i.swift ? `<tr><td class="et">SWIFT</td><td class="n">${esc(i.swift)}</td></tr>` : ''}
            ${i.ruta ? `<tr><td class="et">Ruta</td><td class="n">${esc(i.ruta)}</td></tr>` : ''}
          </tbody></table>
          ${i.instrucciones ? `<p class="ayuda">${esc(i.instrucciones)}</p>` : ''}
          <p class="ayuda">Cuando el dinero llegue, operaciones lo acredita contra el extracto del banco.
            Hoy esa confirmación es manual, así que puede tardar unas horas hábiles.</p>
          <div class="fila"><button class="bot fino chico" data-ir="solicitudes">Ya transferí: avisar el depósito</button></div>
        ` : monedas ? `<div class="aviso malo">Todavía no hay una cuenta habilitada para recibir esa moneda.
            Que la plataforma la maneje no quiere decir que ya haya corresponsal en esa plaza.</div>` : ''}
      </div>${PIE}`;
  }

  // ── abrir una moneda nueva ────────────────────────────────────────────────
  function vistaNueva() {
    const abiertas = new Set((datos.cuentas || []).map((c) => c.moneda));
    const libres = (datos.monedas || []).filter((m) => !abiertas.has(m.codigo));
    return `${recadoHTML()}
      ${cabecera('Abrir una cuenta', volver('inicio', 'Inicio'))}
      <form class="tarj pila" data-form="nueva" style="max-width:520px">
        <div class="campo"><label for="n-mon">Moneda</label>
          <select id="n-mon" name="moneda">${libres.map((m) =>
            `<option value="${esc(m.codigo)}">${esc(m.codigo)} · ${esc(m.nombre)} (${esc(m.pais)})</option>`).join('')}</select>
          <p class="ayuda">${esc(datos.avisoMonedas || '')}</p></div>
        <button class="bot" type="submit" ${libres.length ? '' : 'disabled'}>
          ${libres.length ? 'Abrir la cuenta' : 'Ya las tenés todas'}</button>
      </form>${PIE}`;
  }

  // ── la puerta ─────────────────────────────────────────────────────────────
  function vistaPuerta() {
    return `<div class="puerta"><div class="caja">
      <img class="puerta-marca" src="../assets/aucorp-marca-oscura.png" alt="AuCorp">
      <h1>Tus cuentas en moneda local</h1>
      <p class="sec">Se entra con tu Genesis ID, la identidad del ecosistema.
        Aquí no hay otra contraseña que recordar, ni que perder.</p>
      <ul class="puerta-lista">
        <li>Cuentas en 21 monedas del continente, con tu misma identidad.</li>
        <li>Cambio entre monedas con la tasa real, dicha con su fecha y su margen.</li>
        <li>Comprobante de cada movimiento y extracto de cada mes, para imprimir o guardar.</li>
      </ul>
      ${recado ? `<div class="aviso ${recado.malo ? 'malo' : ''}">${esc(recado.texto)}</div>` : ''}
      <button class="bot" data-entrar ${cargando ? 'disabled' : ''}>
        ${cargando ? '<span class="cargando"></span> Entrando…' : 'Entrar con Genesis ID'}</button>
      <p class="ayuda" style="text-align:center;margin-top:-4px">${EN_MARCO
        ? 'Usamos la sesión de tu Veta Wallet: no hace falta salir de aquí.'
        : 'Confirmamos que sos vos con tu sesión de Veta Wallet.'}</p>
      <p class="pieL" style="margin-top:8px;text-align:left">AuCorp es una institución de tecnología
        financiera constituida en Próspera ZEDE bajo la Regulación FinTech A. No es un banco con licencia
        bancaria: los saldos no están cubiertos por un seguro de depósitos.</p>
    </div></div>`;
  }

  // ── pintar ────────────────────────────────────────────────────────────────
  const VISTAS = {
    inicio: vistaInicio, movimientos: vistaMovimientos, comprobante: vistaComprobante,
    extracto: vistaExtracto, solicitudes: vistaSolicitudes, constancia: vistaConstancia,
    perfil: vistaPerfil, mover: vistaMover, destinos: vistaDestinos,
    depositar: vistaDepositar, nueva: vistaNueva,
  };

  function pintar() {
    if (!sesion) { raiz().innerHTML = vistaPuerta(); return; }
    const cuerpo = VISTAS[vista] || vistaInicio;
    raiz().innerHTML = armazon(cuerpo());
    // El tipo de destino decide qué campos se ven. Se hace después de pintar
    // porque el formulario acaba de nacer.
    const tipo = $('#d-tipo');
    if (tipo) alternarDestino(tipo.value);
    if (parametro?.seccion) {
      const sec = $('#sec-' + parametro.seccion);
      if (sec) sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  const alternarDestino = (tipo) => {
    document.querySelectorAll('[data-si]').forEach((n) => { n.hidden = n.dataset.si !== tipo; });
  };

  // ── cargar lo que cada vista necesita ─────────────────────────────────────
  const consulta = (o) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v !== '' && v != null) p.set(k, v);
    const s = p.toString();
    return s ? '?' + s : '';
  };

  async function cargarCuentas() {
    const [c, m] = await Promise.all([pedir('/cuentas'), pedir('/monedas')]);
    // El nombre y el símbolo de cada moneda viven en /monedas; se juntan
    // aquí para que la tarjeta de saldo diga «Lempira» y no solo «HNL».
    const porCod = new Map(m.monedas.map((x) => [x.codigo, x]));
    datos.cuentas = c.cuentas.map((x) => ({ ...x, ...(porCod.get(x.moneda) || {}) }));
    datos.monedas = m.monedas;
    datos.avisoMonedas = m.aviso;
    // null quiere decir «no se pudo con las tasas de ahora». Se guarda tal
    // cual para que la portada pinte un guion y no un total a medias.
    datos.totalUsd = c.totalUsd;
  }

  async function cargar() {
    try {
      if (['inicio', 'mover', 'nueva', 'depositar', 'movimientos', 'extracto', 'solicitudes'].includes(vista)) await cargarCuentas();
      if (vista === 'inicio') {
        const [m, s] = await Promise.all([pedir('/movimientos'), pedir('/solicitudes')]);
        datos.movimientos = m.movimientos; datos.solicitudes = s.solicitudes;
      }
      if (vista === 'movimientos') {
        const m = await pedir('/movimientos' + consulta(filtros));
        datos.movimientos = m.movimientos; datos.totalMovimientos = m.total; datos.porPagina = m.porPagina; datos.clases = m.clases;
      }
      if (vista === 'comprobante') {
        datos.comprobante = null;
        if (parametro?.numero) datos.comprobante = (await pedir(`/movimientos/${encodeURIComponent(parametro.numero)}/comprobante`)).comprobante;
      }
      if (vista === 'extracto') {
        if (!extractoPedido.moneda) extractoPedido.moneda = datos.cuentas?.[0]?.moneda || '';
        datos.extracto = null;
        if (extractoPedido.moneda && extractoPedido.mes) {
          datos.extracto = (await pedir('/extracto' + consulta({ moneda: extractoPedido.moneda, mes: extractoPedido.mes }))).extracto;
        }
      }
      if (vista === 'solicitudes') datos.solicitudes = (await pedir('/solicitudes')).solicitudes;
      if (vista === 'constancia') {
        datos.solicitud = null;
        if (parametro?.id) datos.solicitud = (await pedir(`/solicitudes/${encodeURIComponent(parametro.id)}`)).solicitud;
      }
      if (vista === 'perfil') {
        const [p, l] = await Promise.all([pedir('/perfil'), pedir('/limites').catch(() => null)]);
        datos.perfil = p.perfil; datos.naturaleza = p.naturaleza; datos.limite = l;
      }
      if (vista === 'mover' || vista === 'destinos') {
        const b = await pedir('/beneficiarios');
        datos.beneficiarios = b.beneficiarios;
        if (vista === 'destinos') datos.monedas = (await pedir('/monedas')).monedas;
      }
      if (vista === 'depositar') await cargarDeposito(datos.depMoneda || datos.cuentas?.[0]?.moneda);
    } catch (e) {
      recado = { texto: e.message, malo: true };
    }
    pintar();
  }

  async function cargarDeposito(cod) {
    datos.depMoneda = cod;
    datos.instrucciones = null;
    if (!cod) return;
    try {
      const d = await pedir('/deposito/instrucciones?moneda=' + encodeURIComponent(cod));
      datos.instrucciones = d.instrucciones;
      datos.referencia = d.referencia;
    } catch {
      // El 404 aquí no es un error: es que no hay corresponsal en esa plaza, y
      // la vista lo dice con sus palabras.
      datos.instrucciones = null;
    }
  }

  /* Cambiar de pantalla limpia el aviso viejo… salvo el que se trae puesto:
     el aviso pertenece a la pantalla a la que se LLEGA, no a la que se deja.
     El hash guarda a dónde se fue para que «atrás» en el teléfono vuelva a la
     pantalla anterior y no a la wallet. */
  const ir = (v, mensaje = null, malo = false, param = null) => {
    vista = VISTAS[v] ? v : 'inicio';
    parametro = param;
    recado = mensaje ? { texto: mensaje, malo } : null;
    datos.limite = null;
    sellos = {};
    const hash = '#' + vista + (param?.numero ? '=' + encodeURIComponent(param.numero) : param?.id ? '=' + encodeURIComponent(param.id) : '');
    if (location.hash !== hash) history.pushState(null, '', hash);
    window.scrollTo({ top: 0 });
    pintar();
    cargar();
  };

  /* La vuelta desde el hash: «atrás» del teléfono, o un enlace guardado. */
  function desdeHash() {
    if (!sesion) return;
    const m = location.hash.match(/^#([a-z]+)(?:=(.+))?$/);
    if (!m || !VISTAS[m[1]]) return;
    const valor = m[2] ? decodeURIComponent(m[2]) : null;
    vista = m[1];
    parametro = valor ? (vista === 'comprobante' ? { numero: valor } : { id: valor }) : null;
    recado = null;
    pintar();
    cargar();
  }
  addEventListener('popstate', desdeHash);

  // ── los formularios ───────────────────────────────────────────────────────
  const valores = (form) => {
    const o = {};
    new FormData(form).forEach((v, k) => { o[k] = String(v).trim(); });
    return o;
  };

  /* Cada formulario acuña su sello UNA vez y lo conserva. Reintentar con el
     mismo sello es lo que impide el pago doble; acuñar otro en cada toque
     sería garantizarlo. */
  const selloDe = (nombre) => (sellos[nombre] = sellos[nombre] || `${nombre}-${sello()}`);

  /* El error de un campo se muestra al lado del campo, además del aviso de
     arriba: el API dice `campo`, y esa es la persona que escribió mal. */
  function marcarCampo(form, e) {
    form.querySelectorAll('.error-campo').forEach((n) => n.remove());
    if (!e?.campo) return;
    const campo = form.querySelector(`[name="${e.campo}"]`);
    if (!campo) return;
    const p = document.createElement('p');
    p.className = 'error-campo';
    p.textContent = e.message;
    campo.insertAdjacentElement('afterend', p);
    campo.focus();
  }

  async function enviar(form) {
    const nombre = form.dataset.form;
    const v = valores(form);
    const boton = form.querySelector('button[type=submit]');
    const textoBoton = boton ? boton.innerHTML : '';
    if (boton) { boton.disabled = true; boton.innerHTML = '<span class="cargando"></span> Un momento…'; }

    try {
      if (nombre === 'filtros') {
        filtros = { ...filtros, moneda: v.moneda, clase: v.clase, desde: v.desde, hasta: v.hasta, q: v.q, pagina: 0 };
        return ir('movimientos');
      }
      if (nombre === 'extracto') {
        extractoPedido = { moneda: v.moneda, mes: v.mes };
        return ir('extracto');
      }
      if (nombre === 'nueva') {
        await pedir('/cuentas', { metodo: 'POST', cuerpo: { moneda: v.moneda } });
        return ir('inicio', `Tu cuenta en ${v.moneda} está abierta.`);
      }
      if (nombre === 'destino') {
        await pedir('/beneficiarios', { metodo: 'POST', cuerpo: v });
        return ir('destinos', 'Destino guardado.');
      }
      if (nombre === 'aviso') {
        const r = await pedir('/solicitudes/deposito', { metodo: 'POST', cuerpo: {
          ref: selloDe('aviso'), moneda: v.moneda, monto: v.monto, referenciaBancaria: v.referenciaBancaria } });
        delete sellos.aviso;
        return ir('solicitudes', `Aviso registrado: ${cifra(r.solicitud.neto.texto)} ${r.solicitud.moneda}. Operaciones lo va a buscar en el extracto del banco.`);
      }
      if (nombre === 'transferir') {
        const b = (datos.beneficiarios || []).find((x) => x.id === v.beneficiario);
        if (!b) throw Object.assign(new Error('Elegí a quién mandarle.'), { campo: 'beneficiario' });
        const r = await pedir('/movimientos/transferir', { metodo: 'POST', cuerpo: {
          ref: selloDe('transferir'), para: b.gidDestino, moneda: v.moneda, monto: v.monto } });
        // El sello se quema DESPUÉS de que salió bien: si hubiera fallado, el
        // reintento tiene que traer el mismo.
        delete sellos.transferir;
        return ir('comprobante', `Enviaste ${cifra(r.monto.texto)} ${r.moneda} a ${b.alias}.`, false, { numero: r.ref.split(':').slice(1).join(':') });
      }
      if (nombre === 'cambiar') {
        const r = await pedir('/movimientos/cambiar', { metodo: 'POST', cuerpo: {
          ref: selloDe('cambiar'), de: v.de, a: v.a, monto: v.monto } });
        delete sellos.cambiar;
        return ir('comprobante', `Cambiaste ${cifra(r.entrega.texto)} ${r.entrega.moneda} por ${cifra(r.recibe.texto)} ${r.recibe.moneda}.`, false,
          { numero: r.ref.split(':').slice(1).join(':') });
      }
      if (nombre === 'retirar') {
        if (!v.beneficiario) throw Object.assign(new Error('Elegí a qué cuenta mandarlo.'), { campo: 'beneficiario' });
        const r = await pedir('/solicitudes/retiro', { metodo: 'POST', cuerpo: {
          ref: selloDe('retirar'), moneda: v.moneda, monto: v.monto, beneficiario: v.beneficiario } });
        delete sellos.retirar;
        return ir('constancia', `Pediste retirar ${cifra(r.solicitud.neto.texto)} ${r.solicitud.moneda}. El dinero quedó apartado hasta que se pague.`,
          false, { id: r.solicitud.id });
      }
    } catch (e) {
      // El límite trae sus números: se los enseñamos, que son suyos.
      const extra = e.datos?.limite
        ? ` Llevás ${cifra(e.datos.limite.usado)} de ${cifra(e.datos.limite.tope)} ${e.datos.limite.moneda} hoy.`
        : '';
      recado = { texto: e.message + extra, malo: true };
      if (boton) { boton.disabled = false; boton.innerHTML = textoBoton; }
      /* No se repinta la pantalla: eso borraría lo que la persona escribió y
         el error al lado del campo. Se marca el campo y se pone (o se cambia)
         el aviso de arriba a mano. */
      marcarCampo(form, e);
      const main = raiz().querySelector('main');
      let viejo = raiz().querySelector('.aviso[role=status]');
      if (!viejo && main) {
        const envoltorio = document.createElement('div');
        envoltorio.style.marginBottom = '16px';
        envoltorio.innerHTML = '<div class="aviso malo" role="status"></div>';
        main.prepend(envoltorio);
        viejo = envoltorio.firstElementChild;
      }
      if (viejo) { viejo.textContent = e.message + extra; viejo.className = 'aviso malo'; }
      if (!e.campo && viejo) viejo.scrollIntoView({ block: 'nearest' });
    }
  }

  /* La cotización mientras se escribe. Se pide con un respiro de medio segundo
     desde la última tecla. */
  let relojCotiza = null;
  function cotizarLuego(form) {
    clearTimeout(relojCotiza);
    relojCotiza = setTimeout(async () => {
      const caja = form.querySelector('[data-cotiza]');
      const v = valores(form);
      if (!caja) return;
      if (!v.monto || v.de === v.a) { caja.textContent = v.de === v.a && v.monto ? 'Elegí dos monedas distintas.' : 'Escribí un monto para ver la tasa de hoy.'; caja.className = 'aviso'; return; }
      try {
        const q = await pedir(`/movimientos/cotizar?de=${encodeURIComponent(v.de)}&a=${encodeURIComponent(v.a)}&monto=${encodeURIComponent(v.monto)}`);
        const s = q.simulacion;
        caja.textContent = s
          ? `Recibís ${cifra(s.recibe.texto)} ${s.recibe.moneda}. Tasa de referencia del `
            + `${q.cotizacion.cuando ? fechaCorta(q.cotizacion.cuando) : 'día'}`
            + (q.cotizacion.margenBps ? `, con un margen de ${q.cotizacion.margenBps / 100}%.` : ', sin margen.')
          : 'No se pudo calcular con ese monto.';
        caja.className = 'aviso';
      } catch (e) {
        // Sin tasa se dice sin tasa. Nunca un número de relleno.
        caja.textContent = e.codigo === 'SIN_TASA' ? 'Ahora mismo no hay tasa para ese par. Probá en un momento.' : e.message;
        caja.className = 'aviso malo';
      }
    }, 500);
  }

  // ── descargas e impresión ─────────────────────────────────────────────────
  /* El CSV se pide con la sesión (un enlace directo no llevaría el Bearer) y
     se entrega como archivo. El PDF lo hace el navegador: «imprimir» en el
     teléfono ofrece «guardar como PDF», y la hoja de estilos de impresión deja
     sólo el papel. */
  async function bajarCsv() {
    try {
      const r = await pedir('/extracto' + consulta({ moneda: extractoPedido.moneda, mes: extractoPedido.mes, formato: 'csv' }), { crudo: true });
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `aucorp-extracto-${extractoPedido.moneda}-${extractoPedido.mes}.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    } catch (e) {
      avisar(e.message, true);
    }
  }

  // ── los gestos ────────────────────────────────────────────────────────────
  const activar = (t) => {
    if (t.dataset.ir) {
      if (t.dataset.moneda) { filtros = { ...filtros, moneda: t.dataset.moneda, pagina: 0 }; }
      return ir(t.dataset.ir, null, false, t.dataset.seccion ? { seccion: t.dataset.seccion } : null);
    }
    if (t.dataset.comprobante) return ir('comprobante', null, false, { numero: t.dataset.comprobante });
    if (t.dataset.constancia) return ir('constancia', null, false, { id: t.dataset.constancia });
    if (t.dataset.pagina != null) { filtros.pagina = Math.max(0, parseInt(t.dataset.pagina, 10) || 0); return ir('movimientos'); }
    if (t.hasAttribute('data-limpiar')) { filtros = { moneda: '', clase: '', desde: '', hasta: '', q: '', pagina: 0 }; return ir('movimientos'); }
    if (t.hasAttribute('data-salir')) return salir();
    if (t.hasAttribute('data-entrar')) return entrar();
    if (t.hasAttribute('data-imprimir')) return window.print();
    if (t.hasAttribute('data-csv')) return bajarCsv();
    if (t.hasAttribute('data-instalar')) return instalar();
    if (t.dataset.tema != null) { temaPoner(t.dataset.tema); return pintar(); }
    if (t.dataset.borrar) {
      // Quitar un destino no mueve dinero, pero sí borra una comprobación ya
      // hecha. Se pregunta.
      if (!confirm('¿Quitar este destino?')) return;
      pedir('/beneficiarios/' + encodeURIComponent(t.dataset.borrar), { metodo: 'DELETE' })
        .then(() => ir('destinos', 'Destino quitado.'))
        .catch((e) => avisar(e.message, true));
    }
  };
  const SELECTOR = '[data-ir],[data-salir],[data-entrar],[data-borrar],[data-comprobante],[data-constancia],[data-pagina],[data-limpiar],[data-imprimir],[data-csv],[data-instalar],[data-tema]';
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest(SELECTOR);
    if (t) activar(t);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const t = ev.target.closest('li[role=button]');
    if (t) { ev.preventDefault(); activar(t); }
  });

  document.addEventListener('submit', (ev) => {
    const form = ev.target.closest('[data-form]');
    if (!form) return;
    ev.preventDefault();
    enviar(form);
  });

  document.addEventListener('input', (ev) => {
    const form = ev.target.closest('[data-form="cambiar"]');
    if (form) cotizarLuego(form);
  });

  document.addEventListener('change', (ev) => {
    if (ev.target.id === 'd-tipo') alternarDestino(ev.target.value);
    if (ev.target.matches('[data-dep-moneda]')) cargarDeposito(ev.target.value).then(pintar);
    const form = ev.target.closest('[data-form="cambiar"]');
    if (form) cotizarLuego(form);
  });

  // ── la app en el teléfono ─────────────────────────────────────────────────
  addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); instalable = ev; if (vista === 'perfil' && sesion) pintar(); });
  async function instalar() {
    if (!instalable) return;
    instalable.prompt();
    await instalable.userChoice.catch(() => null);
    instalable = null;
    pintar();
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin trabajador se sigue igual */ });
  }

  // ── entrar: el SSO ────────────────────────────────────────────────────────
  let esperandoLlave = false;

  function entrar() {
    if (EN_MARCO) {
      /* DENTRO DEL MARCO DE LA WALLET NO SE VIAJA: SE PIDE. La pregunta no
         lleva ningún secreto —sólo dice «soy AuCorp, dame la llave»—, así que
         se le puede preguntar a las tres direcciones: el navegador sólo
         entrega el mensaje a la que de verdad está ahí. El secreto viaja en
         la RESPUESTA, y esa sí se comprueba contra la lista. */
      esperandoLlave = true;
      cargando = true; pintar();

      const pedirLlave = () => {
        for (const casa of CASAS_MADRE) {
          try { parent.postMessage({ og: 'sso-pedido', app: 'aucorp' }, casa); } catch { /* la que no sea, no recibe */ }
        }
      };
      pedirLlave();

      /* SE PREGUNTA DOS VECES ANTES DE RENDIRSE.
         La primera pregunta puede caer en un hueco —la casa madre repintando,
         el WebView entregando el mensaje tarde— y una sola oportunidad
         convierte un tropiezo de medio segundo en un error a pantalla
         completa. La segunda va a los tres segundos y no cuesta nada: el
         mensaje no lleva secreto ninguno. */
      setTimeout(() => { if (esperandoLlave) pedirLlave(); }, 3000);

      /* Si tras las dos preguntas sigue el silencio, se dice. Y se dice lo que
         de verdad se sabe: que no hubo respuesta. Antes esto también saltaba
         cuando la wallet SÍ contestaba «no tengo sesión» —ahora eso llega como
         `sso-no` y tiene su propio mensaje—, así que este cartel ya solo
         aparece por silencio de verdad. */
      setTimeout(() => {
        if (!esperandoLlave) return;
        esperandoLlave = false;
        cargando = false;
        avisar('Veta Wallet no contestó. Cerrá y volvé a abrir AuCorp desde el Núcleo, o entrá desde app.vetawallet.com.', true);
      }, 10000);
      return;
    }
    location.href = WALLET + '/#sso-aucorp';
  }

  /* LA LLAVE QUE LLEGA DE LA CASA MADRE. Puerta cerrada: sólo se atiende a
     las direcciones de la wallet escritas arriba, y a ninguna otra. */
  addEventListener('message', (ev) => {
    if (!CASAS_MADRE.includes(ev.origin) || !ev.data) return;
    if (ev.data.og === 'sso-token' && ev.data.token) {
      esperandoLlave = false;
      canjear(String(ev.data.token));
    } else if (ev.data.og === 'sso-no') {
      esperandoLlave = false;
      cargando = false;
      /* Cada «no» con su nombre: los tres se arreglan de forma distinta, y un
         mensaje genérico manda a la persona a probar lo que no le sirve. */
      avisar(ev.data.motivo === 'sin-gid'
        ? 'Para entrar a AuCorp hace falta tener la identidad verificada en Genesis ID. Terminá la verificación en tu Veta Wallet y volvé.'
        : ev.data.motivo === 'sin-sesion'
        ? 'Tu sesión de Veta Wallet se cerró. Volvé a entrar en la wallet y abrí AuCorp de nuevo.'
        : 'No se pudo conseguir la llave de la wallet. Probá de nuevo en un momento.', true);
    }
  });

  /* El canje: el token de paso por la sesión propia de la casa. */
  async function canjear(token) {
    cargando = true;
    if (!sesion) pintar();
    try {
      const d = await pedir('/auth/sso', { metodo: 'POST', cuerpo: { token } });
      sesion = { token: d.token, refreshToken: d.refreshToken, usuario: d.usuario };
      guardar();
      cargando = false;
      return true;
    } catch (e) {
      cargando = false;
      /* CUANDO LA PUERTA NO PUEDE ABRIR, SE DICE POR QUÉ. Si el API no logra
         hablar con Genesis, es una conexión de la casa que falta terminar, y
         decirlo así ahorra el intento número siete. */
      const msg = e.codigo === 'GENESIS_NO_DISPONIBLE'
        ? 'La puerta con Genesis ID todavía no termina de conectarse de este lado. No es culpa tuya y no hace falta que hagas nada: volvé a intentar en un rato.'
        : e.message;
      avisar(msg, true);
      return false;
    }
  }

  // ── arrancar ──────────────────────────────────────────────────────────────
  /* LA PORTADA DE CARGA. Un instante de marca mientras se resuelve la sesión.
     Dura lo que tarde lo de verdad, con un mínimo para que no parpadee; con
     movimiento reducido no aparece y todo entra en seco. */
  const REDUCIDO = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function portada() {
    raiz().innerHTML = `<div class="abriendo" role="status" aria-label="Abriendo AuCorp">
      <img src="../assets/aucorp-marca-oscura.png" alt="AuCorp">
      <div class="ab-linea" aria-hidden="true"></div>
      <p>Cuentas en moneda local · Orden Global</p>
    </div>`;
  }

  async function arrancar() {
    const desde = Date.now();
    const conCalma = (fn) => {
      const falta = REDUCIDO ? 0 : Math.max(0, 900 - (Date.now() - desde));
      setTimeout(fn, falta);
    };
    if (!REDUCIDO) portada();

    /* La llave que trae la wallet. Se consume del hash INMEDIATAMENTE: un
       token de paso en la barra de direcciones es un token de paso que se
       copia, se pega en un chat y se queda en el historial del navegador. */
    const m = location.hash.match(/^#sso=(.+)$/);
    if (m) {
      const token = decodeURIComponent(m[1]);
      history.replaceState(null, '', location.pathname);
      if (REDUCIDO) { cargando = true; pintar(); }
      const ok = await canjear(token);
      return conCalma(() => (ok ? ir('inicio') : pintar()));
    }

    sesion = recuperar();
    if (sesion?.token) {
      const m2 = location.hash.match(/^#([a-z]+)(?:=(.+))?$/);
      return conCalma(() => (m2 && VISTAS[m2[1]] ? desdeHash() : ir('inicio')));
    }
    conCalma(pintar);
  }

  arrancar();

  /* Cuando llega la llave por el canal del marco, después del canje se entra. */
  addEventListener('message', (ev) => {
    if (!CASAS_MADRE.includes(ev.origin) || ev.data?.og !== 'sso-token') return;
    const espera = setInterval(() => {
      if (cargando) return;
      clearInterval(espera);
      if (sesion) ir('inicio');
    }, 100);
  });

  return { ir, salir, version: 'pizarra-1' };
})();
