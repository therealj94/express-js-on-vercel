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
 * ══ POR QUÉ LA SESIÓN VIVE EN sessionStorage ═══════════════════════════════
 *
 * Cerrar la pestaña cierra la sesión. En la wallet eso sería una molestia
 * diaria; en una pantalla de dinero es lo correcto: un ordenador prestado, un
 * cibercafé, una oficina compartida. Volver a entrar es un clic, porque el SSO
 * ya está hecho. Perder tres segundos gana a dejar una sesión de banca abierta
 * en una máquina ajena.
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
  const WALLET = (window.AUC_WALLET || 'https://app.vetawallet.com') + '/#sso-aucorp';

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

  // ── el estado ─────────────────────────────────────────────────────────────
  let sesion = null;      // { token, refreshToken, usuario }
  let vista = 'inicio';
  let datos = {};         // lo que la vista actual cargó
  let cargando = false;
  let recado = null;      // { texto, malo }
  let sellos = {};        // el sello vivo de cada formulario

  const guardar = () => {
    try { sessionStorage.setItem('aucorp.sesion', JSON.stringify(sesion)); } catch { /* modo privado */ }
  };
  const recuperar = () => {
    try { return JSON.parse(sessionStorage.getItem('aucorp.sesion') || 'null'); } catch { return null; }
  };
  const salir = () => {
    sesion = null;
    try { sessionStorage.removeItem('aucorp.sesion'); } catch { /* nada */ }
    pintar();
  };

  // ── hablar con el API ─────────────────────────────────────────────────────
  /* Un 401 se intenta arreglar UNA vez con el refresh y se reintenta. Si el
     refresh tampoco vale, se cierra la sesión: insistir contra un token muerto
     solo consigue que la persona vea errores raros en vez de la puerta. */
  async function pedir(ruta, { metodo = 'GET', cuerpo, sinReintento } = {}) {
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
      if (ok) return pedir(ruta, { metodo, cuerpo, sinReintento: true });
      salir();
      throw new Error('Tu sesión venció. Volvé a entrar.');
    }

    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(d.error || 'No se pudo completar la operación.');
      e.codigo = d.codigo; e.datos = d; e.estado = r.status;
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

  // ── las vistas ────────────────────────────────────────────────────────────
  const ICONOS = {
    inicio: '<path d="M3 11l9-7 9 7"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
    cuentas: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/><path d="M15.5 12h3"/>',
    mover: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    extracto: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    bancos: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3 20h18"/>',
    tarjeta: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
    limites: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/>',
    salir: '<path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15M10 16l-4-4 4-4M6 12h10"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">${ICONOS[k]}</svg>`;

  const DESTINOS = [
    ['inicio', 'Inicio', 'inicio'],
    ['cuentas', 'Cuentas', 'cuentas'],
    ['mover', 'Mover', 'mover'],
    ['extracto', 'Movimientos', 'extracto'],
    ['bancos', 'Bancos', 'bancos'],
    ['tarjeta', 'Tarjeta', 'tarjeta'],
    ['limites', 'Límites', 'limites'],
  ];
  /* En el teléfono caben cinco destinos y ni uno más. Tarjeta y Límites se
     alcanzan desde Inicio, que para eso es la portada de la casa. */
  const EN_BARRA = DESTINOS.slice(0, 5);

  function armazon(dentro) {
    const nav = DESTINOS.map(([id, nombre, ico]) =>
      `<button class="nav" data-ir="${id}" ${vista === id ? 'aria-current="page"' : ''}>${svg(ico)}${esc(nombre)}</button>`
    ).join('');
    const barra = EN_BARRA.map(([id, nombre, ico]) =>
      `<button data-ir="${id}" ${vista === id ? 'aria-current="page"' : ''}>${svg(ico)}<span>${esc(nombre)}</span></button>`
    ).join('');

    return `<div class="marco">
      <nav class="riel" aria-label="Secciones">
        ${/* El sello completo y no el emblema chico: el circuito a 26 píxeles
              se vuelve una mancha, y una marca que no se lee no es marca. */''}
        <div class="marca"><img class="lockup" src="../assets/aucorp-marca.png" alt="AuCorp"></div>
        ${nav}
        <button class="nav abajo" data-salir>${svg('salir')}Salir</button>
      </nav>
      <main class="lienzo">${dentro}</main>
    </div>
    <nav class="barra" aria-label="Secciones">${barra}</nav>`;
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
    const h = `<div class="aviso ${recado.malo ? 'malo' : ''}" role="status">${esc(recado.texto)}</div>`;
    return `<div style="margin-bottom:18px">${h}</div>`;
  };

  // ── inicio ────────────────────────────────────────────────────────────────
  /* La portada de la casa. Todo lo que se puede hacer, a un toque; lo que ya
     pasó, a la vista; y lo que viene, dicho con nombre y sin fecha inventada.
     Es la pantalla que vende la plataforma — y por eso mismo es donde más
     importa no adornar: cada número sale del libro o no sale. */
  function vistaInicio() {
    const u = sesion?.usuario || {};
    const cuentas = datos.cuentas || [];
    const movs = (datos.movimientos || []).slice(0, 5);
    const nombre = String(u.nombre || '').split(' ')[0];

    const chips = cuentas.map((c) => `
      <button class="tarj moneda" data-abrir-mover="${esc(c.moneda)}" style="text-align:left;cursor:pointer;font:inherit;color:inherit">
        <div class="top"><span class="cod">${esc(c.moneda)}</span>
          <span class="et">${esc(c.simbolo || '')}</span></div>
        <div class="saldo n">${esc(c.saldo.texto)}</div>
        <div class="pais">${esc(c.nombre || '')}</div>
      </button>`).join('');

    const filasMov = movs.map((m) => {
      const mia = (m.lineas || []).filter((l) => l.cuenta === 'yo');
      return mia.map((l) => {
        const entra = l.haber && l.haber !== '0.00' && l.haber !== '0';
        const cifra = entra ? l.haber : l.debe;
        if (!cifra || cifra === '0.00' || cifra === '0') return '';
        return `<tr><td>${esc(new Date(m.fecha).toLocaleDateString())}</td>
          <td>${esc(m.glosa)}</td>
          <td class="der n ${entra ? 'mas' : 'menos'}">${entra ? '+' : '−'} ${esc(cifra)} ${esc(l.moneda)}</td></tr>`;
      }).join('');
    }).join('');

    return `${recadoHTML()}
      <div class="cab"><h1>${nombre ? `Hola, ${esc(nombre)}` : 'Tu banca'}</h1>
        <span class="sello ${u.verificada ? 'ok' : 'esp'}">${u.verificada ? 'Identidad verificada' : 'Sin verificar'}</span></div>

      <div class="pila">
        <div class="total">
          <span class="et">Saldo disponible</span>
          <span class="cifra">${cuentas.length ? sumaVisible() : '—'}</span>
          <small>${!cuentas.length
            ? 'Todavía no abriste ninguna cuenta.'
            : datos.totalUsd
              ? 'Suma de tus cuentas convertida a dólares con la tasa de referencia de hoy.'
              : 'No se pudo convertir a dólares ahora mismo. Tus saldos por moneda son exactos.'}</small>
        </div>

        <div class="acciones">
          <button class="accion" data-abrir="depositar">${svg('bancos')}<span>Depositar</span></button>
          <button class="accion" data-ir="mover">${svg('mover')}<span>Transferir</span></button>
          <button class="accion" data-ir="mover">${svg('limites')}<span>Cambiar</span></button>
          <button class="accion" data-abrir="nueva">${svg('cuentas')}<span>Abrir moneda</span></button>
        </div>

        ${cuentas.length
          ? `<div class="rej c3">${chips}</div>`
          : `<div class="tarj vacio"><b>Ninguna cuenta abierta</b>
              Abrí la primera en la moneda que uses todos los días.
              <div style="margin-top:16px"><button class="bot" data-abrir="nueva">Abrir una cuenta</button></div></div>`}

        ${filasMov ? `
        <div class="tarj">
          <div class="fila" style="margin-bottom:8px"><span class="et crece">Lo último</span>
            <button class="bot fino chico" data-ir="extracto">Ver todo</button></div>
          <div class="envuelve"><table class="tabla"><tbody>${filasMov}</tbody></table></div>
        </div>` : ''}

        <div>
          <h2 style="font-size:19px;margin:10px 0 12px">Una sola cuenta, todo el ecosistema</h2>
          <div class="rej c3">
            <a class="tarj casa" href="https://app.vetawallet.com" rel="noopener">
              <span class="et">Cripto</span><strong>Veta Wallet</strong>
              <p>Tus activos en la cadena de Orden Global.</p></a>
            <a class="tarj casa" href="https://www.ordenexchange.com" rel="noopener">
              <span class="et">Cambio</span><strong>Ordenex</strong>
              <p>La casa de cambio. AuCorp es su dueña.</p></a>
            <button class="tarj casa" data-ir="tarjeta">
              <span class="et">Pago</span><strong>Tarjeta AuCorp</strong>
              <p>Ya se está armando. Entrá y mirala.</p></button>
          </div>
        </div>

        <div class="tarj">
          <span class="et">En el taller</span>
          <ul class="puerta-lista" style="margin-top:12px">
            <li><strong>Tarjeta AuCorp.</strong> Para gastar tus saldos directo, donde sea.</li>
            <li><strong>Tu banco, conectado.</strong> Su saldo y sus movimientos, desde esta pantalla.</li>
            <li><strong>Pagos entre casas.</strong> De la wallet a tu cuenta y de vuelta, en un toque.</li>
          </ul>
          <p style="font-size:13.5px;color:var(--tinta3);margin-top:12px">Sin fechas prometidas:
            cada pieza aparece aquí el día que abre de verdad.</p>
        </div>
      </div>${PIE}`;
  }

  // ── tarjeta ───────────────────────────────────────────────────────────────
  /* La tarjeta todavía no existe y la pantalla NO finge lo contrario: enseña
     el diseño, dice qué va a poder hacer, y el botón dice «en camino» en vez
     de recoger ilusiones en una lista. Cuando abra, este es su lugar. */
  function vistaTarjeta() {
    const u = sesion?.usuario || {};
    return `${recadoHTML()}
      <div class="cab"><h1>Tarjeta AuCorp</h1></div>
      <div class="rej c2">
        <div>
          <div class="credito" aria-label="Así va a ser la tarjeta AuCorp">
            <img class="marca-agua" src="../assets/aucorp.png" alt="">
            <div class="fila" style="justify-content:space-between">
              <span style="font-family:'Fraunces',serif;font-size:19px;letter-spacing:.02em">AUCORP<span style="color:var(--oroLt)">.</span></span>
              <span class="chip"></span>
            </div>
            <div>
              <div class="num">···· ···· ···· ····</div>
              <div class="fila" style="justify-content:space-between;margin-top:12px">
                <span style="font:500 12.5px/1 'PlexMono',monospace;letter-spacing:.1em;text-transform:uppercase">${esc(u.nombre || 'Tu nombre')}</span>
                <span class="et" style="color:var(--oroPl)">moneda local</span>
              </div>
            </div>
          </div>
          <p class="ayuda" style="margin-top:10px">Es el diseño. La tarjeta aún no se emite,
            y por eso lleva puntos y no un número.</p>
        </div>
        <div class="tarj pila">
          <span class="et">Qué va a hacer</span>
          <p style="font-size:14.5px;color:var(--tinta2)">Gastar directo de tus saldos en moneda local,
            con la misma cuenta con la que ya depositás, cambiás y retirás.</p>
          <p style="font-size:14.5px;color:var(--tinta2)">El día que abra se pide desde esta misma
            pantalla, con tu identidad de Genesis ID ya verificada. Sin lista de espera y sin
            trámite nuevo.</p>
        </div>
      </div>${PIE}`;
  }

  // ── cuentas ───────────────────────────────────────────────────────────────
  function vistaCuentas() {
    const cuentas = datos.cuentas || [];
    const tarjetas = cuentas.map((c) => `
      <button class="tarj moneda" data-abrir-mover="${esc(c.moneda)}" style="text-align:left;cursor:pointer;font:inherit;color:inherit">
        <div class="top"><span class="cod">${esc(c.moneda)}</span>
          <span class="et">${esc(c.simbolo || '')}</span></div>
        <div class="saldo n">${esc(c.saldo.texto)}</div>
        <div class="pais">${esc(c.nombre || '')}</div>
      </button>`).join('');

    return `${recadoHTML()}
      <div class="cab"><h1>Tus cuentas</h1>
        <button class="bot fino chico" data-abrir="nueva">Abrir otra moneda</button></div>

      <div class="pila">
        <div class="total">
          <span class="et">Saldo disponible</span>
          <span class="cifra">${cuentas.length ? sumaVisible() : '—'}</span>
          <small>${!cuentas.length
            ? 'Todavía no abriste ninguna cuenta.'
            : datos.totalUsd
              ? 'Suma de tus cuentas convertida a dólares con la tasa de referencia de hoy.'
              : 'No se pudo convertir a dólares ahora mismo. Tus saldos por moneda, abajo, son exactos.'}</small>
        </div>

        ${cuentas.length
          ? `<div class="rej c3">${tarjetas}</div>`
          : `<div class="tarj vacio"><b>Ninguna cuenta abierta</b>
              Abrí la primera en la moneda que uses todos los días.
              <div style="margin-top:16px"><button class="bot" data-abrir="nueva">Abrir una cuenta</button></div></div>`}

        <div class="rej c2">
          <button class="tarj" data-abrir="depositar" style="text-align:left;cursor:pointer;font:inherit;color:inherit">
            <span class="et">Recibir</span>
            <h3 style="font-size:19px;margin:8px 0 5px">Depositar</h3>
            <p style="font-size:14px;color:var(--tinta2)">A dónde mandar el dinero para que entre a tu cuenta.</p>
          </button>
          <button class="tarj" data-ir="mover" style="text-align:left;cursor:pointer;font:inherit;color:inherit">
            <span class="et">Enviar</span>
            <h3 style="font-size:19px;margin:8px 0 5px">Transferir, cambiar o retirar</h3>
            <p style="font-size:14px;color:var(--tinta2)">Mové tu dinero entre monedas, a otra cuenta o a tu banco.</p>
          </button>
        </div>
      </div>${PIE}`;
  }

  /* La suma en dólares se hace en el SERVIDOR, que es quien tiene la tasa. Si
     no vino, se pinta un guion: sumar sin tasa sería inventarse un total, y un
     total inventado en la portada de una app de dinero es la mentira más cara
     que se puede contar. */
  const sumaVisible = () => (datos.totalUsd ? `$ ${esc(datos.totalUsd)}` : '—');

  // ── mover ─────────────────────────────────────────────────────────────────
  function vistaMover() {
    const cuentas = datos.cuentas || [];
    const opciones = cuentas.map((c) =>
      `<option value="${esc(c.moneda)}">${esc(c.moneda)} · ${esc(c.saldo.texto)}</option>`).join('');
    const bens = (datos.beneficiarios || []);

    if (!cuentas.length) {
      return `${recadoHTML()}<div class="cab"><h1>Mover dinero</h1></div>
        <div class="tarj vacio"><b>Primero abrí una cuenta</b>
        No hay nada que mover todavía.</div>${PIE}`;
    }

    const opcBen = (tipo) => bens.filter((b) => !tipo || b.tipo === tipo)
      .map((b) => `<option value="${esc(b.id)}">${esc(b.alias)} · ${esc(b.moneda)}${b.numero ? ' · ' + esc(b.numero) : ''}</option>`).join('');

    return `${recadoHTML()}
      <div class="cab"><h1>Mover dinero</h1></div>
      <div class="rej c2">

        <form class="tarj pila" data-form="transferir">
          <div><span class="et">Dentro de AuCorp</span>
            <h3 style="font-size:19px;margin:7px 0 0">Transferir</h3></div>
          <div class="campo"><label for="t-ben">A quién</label>
            <select id="t-ben" name="beneficiario">
              <option value="">Elegí un destino guardado</option>${opcBen('interno')}</select>
            <p class="ayuda">Los destinos se guardan en «Bancos». Se comprueban al guardarlos, no al mandar el dinero.</p></div>
          <div class="fila">
            <div class="campo crece"><label for="t-mon">Moneda</label>
              <select id="t-mon" name="moneda">${opciones}</select></div>
            <div class="campo crece"><label for="t-monto">Monto</label>
              <input id="t-monto" class="n" name="monto" inputmode="decimal" placeholder="0.00" autocomplete="off"></div>
          </div>
          <button class="bot" type="submit">Transferir</button>
        </form>

        <form class="tarj pila" data-form="cambiar">
          <div><span class="et">Entre tus monedas</span>
            <h3 style="font-size:19px;margin:7px 0 0">Cambiar</h3></div>
          <div class="fila">
            <div class="campo crece"><label for="c-de">De</label>
              <select id="c-de" name="de">${opciones}</select></div>
            <div class="campo crece"><label for="c-a">A</label>
              <select id="c-a" name="a">${(datos.monedas || []).map((m) =>
                `<option value="${esc(m.codigo)}">${esc(m.codigo)} · ${esc(m.nombre)}</option>`).join('')}</select></div>
          </div>
          <div class="campo"><label for="c-monto">Monto</label>
            <input id="c-monto" class="n" name="monto" inputmode="decimal" placeholder="0.00" autocomplete="off"></div>
          <div class="aviso" data-cotiza>Escribí un monto para ver la tasa de hoy.</div>
          <button class="bot" type="submit">Cambiar</button>
        </form>

        <form class="tarj pila" data-form="retirar">
          <div><span class="et">Fuera de AuCorp</span>
            <h3 style="font-size:19px;margin:7px 0 0">Retirar a un banco</h3></div>
          <div class="campo"><label for="r-ben">A qué cuenta</label>
            <select id="r-ben" name="beneficiario">
              <option value="">Elegí una cuenta guardada</option>${opcBen('bancario')}</select></div>
          <div class="fila">
            <div class="campo crece"><label for="r-mon">Moneda</label>
              <select id="r-mon" name="moneda">${opciones}</select></div>
            <div class="campo crece"><label for="r-monto">Monto</label>
              <input id="r-monto" class="n" name="monto" inputmode="decimal" placeholder="0.00" autocomplete="off"></div>
          </div>
          <p class="ayuda">El dinero sale de tu saldo al pedirlo y queda apartado hasta que se pague.
            Si se rechaza, vuelve entero.</p>
          <button class="bot" type="submit">Pedir el retiro</button>
        </form>

        <button class="tarj" data-abrir="depositar" style="text-align:left;cursor:pointer;font:inherit;color:inherit">
          <span class="et">Recibir</span>
          <h3 style="font-size:19px;margin:7px 0 5px">Depositar</h3>
          <p style="font-size:14px;color:var(--tinta2)">Te decimos a qué cuenta mandar el dinero y con qué referencia.</p>
        </button>
      </div>

      ${solicitudesHTML()}${PIE}`;
  }

  function solicitudesHTML() {
    const ss = datos.solicitudes || [];
    if (!ss.length) return '';
    const SELLO = { pendiente: ['esp', 'Esperando pago'], ejecutada: ['ok', 'Pagado'], rechazada: ['no', 'Rechazado'] };
    return `<h2 style="font-size:20px;margin:34px 0 14px">Tus retiros</h2>
      <div class="tarj envuelve"><table class="tabla"><thead><tr>
        <th>Pedido</th><th>Destino</th><th>Estado</th><th class="der">Monto</th></tr></thead><tbody>
        ${ss.map((s) => {
          const [cl, txt] = SELLO[s.estado] || ['esp', s.estado];
          return `<tr>
            <td>${esc(new Date(s.creada).toLocaleDateString())}</td>
            <td>${esc(s.beneficiario?.alias || '—')}
              ${s.nota ? `<div class="ayuda">${esc(s.nota)}</div>` : ''}</td>
            <td><span class="sello ${cl}">${esc(txt)}</span></td>
            <td class="der n">${esc(s.neto.texto)} ${esc(s.moneda)}</td></tr>`;
        }).join('')}
      </tbody></table></div>`;
  }

  // ── extracto ──────────────────────────────────────────────────────────────
  function vistaExtracto() {
    const ms = datos.movimientos || [];
    if (!ms.length) {
      return `${recadoHTML()}<div class="cab"><h1>Movimientos</h1></div>
        <div class="tarj vacio"><b>Todavía no hay movimientos</b>
        Cuando entre o salga dinero, cada operación va a quedar aquí con su fecha y su explicación.</div>${PIE}`;
    }
    return `${recadoHTML()}
      <div class="cab"><h1>Movimientos</h1></div>
      <div class="tarj envuelve"><table class="tabla"><thead><tr>
        <th>Fecha</th><th>Concepto</th><th class="der">Monto</th></tr></thead><tbody>
      ${ms.map((m) => {
        const mia = (m.lineas || []).filter((l) => l.cuenta === 'yo');
        return mia.map((l) => {
          const entra = l.haber && l.haber !== '0.00' && l.haber !== '0';
          const cifra = entra ? l.haber : l.debe;
          if (!cifra || cifra === '0.00' || cifra === '0') return '';
          return `<tr>
            <td>${esc(new Date(m.fecha).toLocaleDateString())}
              <div class="ayuda">${esc(new Date(m.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</div></td>
            <td>${esc(m.glosa)}</td>
            <td class="der n ${entra ? 'mas' : 'menos'}">${entra ? '+' : '−'} ${esc(cifra)} ${esc(l.moneda)}</td>
          </tr>`;
        }).join('');
      }).join('')}
      </tbody></table></div>${PIE}`;
  }

  // ── bancos ────────────────────────────────────────────────────────────────
  /* La conexión con los bancos, dicha entera: lo que FUNCIONA hoy (depositar
     con referencia, retirar a tus cuentas guardadas) con su sello verde, y la
     conexión directa —leer tu saldo del banco sin salir de aquí— con el sello
     de «en camino». Mezclar las dos sin sello sería vender lo que no hay. */
  function vistaBancos() {
    const bs = datos.beneficiarios || [];
    const monedas = (datos.monedas || []).map((m) =>
      `<option value="${esc(m.codigo)}">${esc(m.codigo)} · ${esc(m.nombre)}</option>`).join('');

    return `${recadoHTML()}
      <div class="cab"><h1>Bancos</h1></div>

      <div class="tarj" style="margin-bottom:20px">
        <span class="et">El puente con tu banco</span>
        <div class="rej c2" style="margin-top:14px">
          <div class="pila">
            <h3 style="font-size:18px">Hoy</h3>
            <p style="font-size:14.5px;color:var(--tinta2)">El dinero entra por transferencia con tu
              referencia y sale a las cuentas que guardás abajo. Operaciones acredita cada entrada
              contra el extracto del banco.</p>
            <div class="fila">
              <button class="bot chico" data-abrir="depositar">Depositar</button>
              <button class="bot fino chico" data-ir="mover">Retirar</button>
            </div>
          </div>
          <div class="pila">
            <h3 style="font-size:18px">Lo que sigue</h3>
            <p style="font-size:14.5px;color:var(--tinta2)">La conexión directa: el saldo y los
              movimientos de tu banco desde esta pantalla, y fondear tu cuenta en un toque.
              Se abre aquí mismo el día que esté lista.</p>
          </div>
        </div>
      </div>

      <div class="aviso" style="margin-bottom:20px">Guardar un destino una vez y elegirlo después evita el
        error que más caro sale: un dígito cambiado en el número de cuenta. Una transferencia emitida no se
        deshace pidiéndolo.</div>

      <div class="rej c2">
        <div class="pila">
          ${bs.length ? bs.map((b) => `
            <div class="tarj fila">
              <div class="crece">
                <strong>${esc(b.alias)}</strong>
                <div class="ayuda">${b.tipo === 'interno'
                  ? 'Cuenta de AuCorp · ' + esc(b.gidDestino)
                  : esc(b.banco) + ' · ' + esc(b.numero)} · ${esc(b.moneda)}</div>
              </div>
              <button class="bot fino chico" data-borrar="${esc(b.id)}">Quitar</button>
            </div>`).join('')
            : `<div class="tarj vacio"><b>Sin destinos guardados</b>Agregá el primero al lado.</div>`}
        </div>

        <form class="tarj pila" data-form="destino">
          <h3 style="font-size:19px">Agregar un destino</h3>
          <div class="campo"><label for="d-alias">Nombre para reconocerlo</label>
            <input id="d-alias" name="alias" maxlength="60" placeholder="Mi cuenta del banco" autocomplete="off"></div>
          <div class="fila">
            <div class="campo crece"><label for="d-tipo">Tipo</label>
              <select id="d-tipo" name="tipo">
                <option value="bancario">Cuenta bancaria</option>
                <option value="interno">Otra cuenta de AuCorp</option></select></div>
            <div class="campo crece"><label for="d-mon">Moneda</label>
              <select id="d-mon" name="moneda">${monedas}</select></div>
          </div>
          <div data-si="interno" hidden>
            <div class="campo"><label for="d-gid">Genesis ID de la persona</label>
              <input id="d-gid" name="gidDestino" autocomplete="off" placeholder="gid-..."></div>
          </div>
          <div data-si="bancario">
            <div class="campo"><label for="d-banco">Banco</label>
              <input id="d-banco" name="banco" autocomplete="off"></div>
            <div class="campo"><label for="d-tit">Titular de la cuenta</label>
              <input id="d-tit" name="titular" autocomplete="off"></div>
            <div class="campo"><label for="d-num">Número de cuenta</label>
              <input id="d-num" class="n" name="numero" autocomplete="off"></div>
            <div class="fila">
              <div class="campo crece"><label for="d-swift">SWIFT / BIC</label>
                <input id="d-swift" name="swift" autocomplete="off"></div>
              <div class="campo crece"><label for="d-pais">País</label>
                <input id="d-pais" name="pais" autocomplete="off"></div>
            </div>
          </div>
          <button class="bot" type="submit">Guardar destino</button>
        </form>
      </div>${PIE}`;
  }

  // ── límites ───────────────────────────────────────────────────────────────
  function vistaLimites() {
    const u = sesion?.usuario || {};
    const l = datos.limite;
    return `${recadoHTML()}
      <div class="cab"><h1>Límites y verificación</h1></div>
      <div class="rej c2">
        <div class="tarj pila">
          <span class="et">Tu identidad</span>
          <div class="fila"><span class="sello ${u.verificada ? 'ok' : 'esp'}">
            ${u.verificada ? 'Verificada' : 'Sin verificar'}</span></div>
          <p style="font-size:14px;color:var(--tinta2)">${u.verificada
            ? 'Tu identidad está verificada en Genesis ID. Podés abrir cuentas y mover dinero.'
            : 'Para abrir cuentas y mover dinero hace falta terminar la verificación en Genesis ID. Podés mirar la casa mientras tanto.'}</p>
          ${u.direccionWallet ? `<p class="ayuda">Tu Veta Wallet: <span class="n">${esc(u.direccionWallet)}</span></p>` : ''}
        </div>
        <div class="tarj pila">
          <span class="et">Cuánto podés mover</span>
          <div><strong style="font-size:18px">Nivel ${esc(String(l?.nivel || u.nivel || 1))}</strong></div>
          ${l ? `
            <table class="tabla"><tbody>
              <tr><td class="et">Hoy</td><td class="der n">${l.diario.usado === null
                ? '—' : esc(l.diario.usado)} de ${esc(l.diario.tope)} ${esc(l.moneda)}</td></tr>
              <tr><td class="et">Este mes</td><td class="der n">${l.mensual.usado === null
                ? '—' : esc(l.mensual.usado)} de ${esc(l.mensual.tope)} ${esc(l.moneda)}</td></tr>
            </tbody></table>
            <p class="ayuda">Se mide en dólares sumando lo que SALE de todas tus monedas, para que el tope
              no se pueda saltar repartiéndolo entre varias. Un retiro rechazado libera lo que había usado.
              ${l.diario.usado === null ? 'Ahora mismo no se pudo medir: por eso el guion.' : ''}</p>`
              : `<p style="font-size:14px;color:var(--tinta2)">Los límites se miden en dólares, sumando lo que sale de todas tus monedas.</p>`}
          <p class="ayuda">Para subir de nivel hace falta ampliar tu expediente. Escribinos y te decimos qué falta.</p>
        </div>
      </div>${PIE}`;
  }

  // ── depositar (una hoja aparte, porque es una lectura, no un formulario) ──
  function vistaDepositar() {
    const i = datos.instrucciones;
    const monedas = (datos.cuentas || []).map((c) =>
      `<option value="${esc(c.moneda)}" ${datos.depMoneda === c.moneda ? 'selected' : ''}>${esc(c.moneda)}</option>`).join('');

    return `${recadoHTML()}
      <div class="cab"><h1>Depositar</h1>
        <button class="bot fino chico" data-ir="cuentas">Volver</button></div>
      <div class="tarj pila" style="max-width:620px">
        <div class="campo"><label for="dep-mon">¿En qué moneda?</label>
          <select id="dep-mon" data-dep-moneda>${monedas}</select></div>
        ${i ? `
          <div class="aviso">Poné <strong>${esc(datos.referencia || '')}</strong> como referencia
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
        ` : `<div class="aviso malo">Todavía no hay una cuenta habilitada para recibir esa moneda.
            Que la plataforma la maneje no quiere decir que ya haya corresponsal en esa plaza.</div>`}
      </div>${PIE}`;
  }

  // ── abrir una moneda nueva ────────────────────────────────────────────────
  function vistaNueva() {
    const abiertas = new Set((datos.cuentas || []).map((c) => c.moneda));
    const libres = (datos.monedas || []).filter((m) => !abiertas.has(m.codigo));
    return `${recadoHTML()}
      <div class="cab"><h1>Abrir una cuenta</h1>
        <button class="bot fino chico" data-ir="cuentas">Volver</button></div>
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
      <img class="puerta-marca" src="../assets/aucorp-marca.png" alt="AuCorp">
      <h1>Tus cuentas en moneda local</h1>
      <p style="color:var(--tinta2)">Se entra con tu Genesis ID, la identidad del ecosistema.
        Aquí no hay otra contraseña que recordar, ni que perder. Es la banca fiat de
        Orden Global.</p>
      <ul class="puerta-lista">
        <li>Cuentas en 21 monedas del continente, con tu misma identidad.</li>
        <li>Cambio entre monedas con la tasa real, dicha con su fecha y su margen.</li>
        <li>Depositás con referencia y retirás a tu banco. Sin letra escondida.</li>
      </ul>
      ${recado ? `<div class="aviso ${recado.malo ? 'malo' : ''}">${esc(recado.texto)}</div>` : ''}
      <button class="bot" data-entrar style="justify-content:center">
        ${cargando ? '<span class="cargando"></span> Entrando…' : 'Entrar con Genesis ID'}</button>
      ${/* Y se dice el viaje entero, porque la pantalla siguiente es la de la
            wallet y una puerta que no avisa a dónde manda parece un desvío:
            lo que abre AuCorp es tu identidad, y la sesión de tu billetera es
            donde se confirma que sos vos. */''}
      <p class="ayuda" style="text-align:center;margin-top:-4px">Tu identidad del ecosistema.
        Confirmamos que sos vos con tu sesión de Veta Wallet.</p>
      <p class="pieL" style="margin-top:8px;text-align:left">AuCorp es una institución de tecnología
        financiera constituida en Próspera ZEDE bajo la Regulación FinTech A. No es un banco con licencia
        bancaria: los saldos no están cubiertos por un seguro de depósitos.</p>
    </div></div>`;
  }

  // ── pintar ────────────────────────────────────────────────────────────────
  function pintar() {
    if (!sesion) { raiz().innerHTML = vistaPuerta(); return; }
    const cuerpo = {
      inicio: vistaInicio, cuentas: vistaCuentas, mover: vistaMover,
      extracto: vistaExtracto, bancos: vistaBancos, tarjeta: vistaTarjeta,
      limites: vistaLimites, depositar: vistaDepositar, nueva: vistaNueva,
    }[vista] || vistaInicio;
    raiz().innerHTML = armazon(cuerpo());
    // El tipo de destino decide qué campos se ven. Se hace después de pintar
    // porque el formulario acaba de nacer.
    const tipo = $('#d-tipo');
    if (tipo) alternarDestino(tipo.value);
  }

  const alternarDestino = (tipo) => {
    document.querySelectorAll('[data-si]').forEach((n) => { n.hidden = n.dataset.si !== tipo; });
  };

  // ── cargar lo que cada vista necesita ─────────────────────────────────────
  async function cargar() {
    try {
      if (vista === 'inicio' || vista === 'cuentas' || vista === 'mover' || vista === 'nueva' || vista === 'depositar') {
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
      if (vista === 'mover') {
        const [b, s] = await Promise.all([pedir('/beneficiarios'), pedir('/solicitudes')]);
        datos.beneficiarios = b.beneficiarios;
        datos.solicitudes = s.solicitudes;
      }
      if (vista === 'extracto' || vista === 'inicio')
        datos.movimientos = (await pedir('/movimientos')).movimientos;
      if (vista === 'limites') datos.limite = await pedir('/limites');
      if (vista === 'bancos') {
        const [b, m] = await Promise.all([pedir('/beneficiarios'), pedir('/monedas')]);
        datos.beneficiarios = b.beneficiarios; datos.monedas = m.monedas;
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

  /* Cambiar de pantalla limpia el aviso viejo… salvo el que se trae puesto.
     Antes no era así y el acuse de una transferencia se borraba en el mismo
     gesto que lo mostraba: el dinero salía bien y la persona no veía ni una
     palabra confirmándolo. El aviso pertenece a la pantalla a la que se LLEGA,
     no a la que se deja. */
  const ir = (v, mensaje = null, malo = false) => {
    vista = v;
    recado = mensaje ? { texto: mensaje, malo } : null;
    datos.limite = null;
    sellos = {};
    pintar();
    cargar();
  };

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

  async function enviar(form) {
    const nombre = form.dataset.form;
    const v = valores(form);
    const boton = form.querySelector('button[type=submit]');
    if (boton) { boton.disabled = true; boton.innerHTML = '<span class="cargando"></span> Un momento…'; }

    try {
      if (nombre === 'nueva') {
        await pedir('/cuentas', { metodo: 'POST', cuerpo: { moneda: v.moneda } });
        return ir('cuentas', `Tu cuenta en ${v.moneda} está abierta.`);
      }
      if (nombre === 'destino') {
        await pedir('/beneficiarios', { metodo: 'POST', cuerpo: v });
        return ir('bancos', 'Destino guardado.');
      }
      if (nombre === 'transferir') {
        const b = (datos.beneficiarios || []).find((x) => x.id === v.beneficiario);
        if (!b) throw new Error('Elegí a quién mandarle.');
        const r = await pedir('/movimientos/transferir', { metodo: 'POST', cuerpo: {
          ref: selloDe('transferir'), para: b.gidDestino, moneda: v.moneda, monto: v.monto } });
        // El sello se quema DESPUÉS de que salió bien: si hubiera fallado, el
        // reintento tiene que traer el mismo.
        delete sellos.transferir;
        return ir('cuentas', `Enviaste ${r.monto.texto} ${r.moneda} a ${b.alias}.`);
      }
      if (nombre === 'cambiar') {
        const r = await pedir('/movimientos/cambiar', { metodo: 'POST', cuerpo: {
          ref: selloDe('cambiar'), de: v.de, a: v.a, monto: v.monto } });
        delete sellos.cambiar;
        return ir('cuentas',
          `Cambiaste ${r.entrega.texto} ${r.entrega.moneda} por ${r.recibe.texto} ${r.recibe.moneda}.`);
      }
      if (nombre === 'retirar') {
        if (!v.beneficiario) throw new Error('Elegí a qué cuenta mandarlo.');
        const r = await pedir('/solicitudes/retiro', { metodo: 'POST', cuerpo: {
          ref: selloDe('retirar'), moneda: v.moneda, monto: v.monto, beneficiario: v.beneficiario } });
        delete sellos.retirar;
        return ir('mover', `Pediste retirar ${r.solicitud.neto.texto} ${r.solicitud.moneda}. `
          + 'El dinero quedó apartado hasta que se pague.');
      }
    } catch (e) {
      // El límite trae sus números: se los enseñamos, que son suyos.
      const extra = e.datos?.limite
        ? ` Llevás ${e.datos.limite.usado} de ${e.datos.limite.tope} ${e.datos.limite.moneda} hoy.`
        : '';
      avisar(e.message + extra, true);
      if (boton) { boton.disabled = false; }
    }
  }

  /* La cotización mientras se escribe. Se pide con un respiro de medio segundo
     desde la última tecla: una llamada por pulsación castigaría al servidor y
     enseñaría números que cambian mientras se lee. */
  let relojCotiza = null;
  function cotizarLuego(form) {
    clearTimeout(relojCotiza);
    relojCotiza = setTimeout(async () => {
      const caja = form.querySelector('[data-cotiza]');
      const v = valores(form);
      if (!caja) return;
      if (!v.monto || v.de === v.a) { caja.textContent = 'Escribí un monto para ver la tasa de hoy.'; return; }
      try {
        const q = await pedir(`/movimientos/cotizar?de=${encodeURIComponent(v.de)}&a=${encodeURIComponent(v.a)}`
          + `&monto=${encodeURIComponent(v.monto)}`);
        const s = q.simulacion;
        caja.textContent = s
          ? `Recibís ${s.recibe.texto} ${s.recibe.moneda}. Tasa de referencia del `
            + `${q.cotizacion.cuando ? new Date(q.cotizacion.cuando).toLocaleDateString() : 'día'}`
            + (q.cotizacion.margenBps ? `, con un margen de ${q.cotizacion.margenBps / 100}%.` : ', sin margen.')
          : 'No se pudo calcular con ese monto.';
        caja.classList.remove('malo');
      } catch {
        // Sin tasa se dice sin tasa. Nunca un número de relleno.
        caja.textContent = 'Ahora mismo no hay tasa para ese par. Probá en un momento.';
        caja.classList.add('malo');
      }
    }, 500);
  }

  // ── los gestos ────────────────────────────────────────────────────────────
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-ir],[data-abrir],[data-salir],[data-entrar],[data-borrar],[data-abrir-mover]');
    if (!t) return;
    if (t.dataset.ir) return ir(t.dataset.ir);
    if (t.dataset.abrir) return ir(t.dataset.abrir);
    if (t.dataset.abrirMover) return ir('mover');
    if (t.hasAttribute('data-salir')) return salir();
    if (t.hasAttribute('data-entrar')) { location.href = WALLET; return; }
    if (t.dataset.borrar) {
      // Quitar un destino no mueve dinero, pero sí borra una comprobación ya
      // hecha. Se pregunta.
      if (!confirm('¿Quitar este destino?')) return;
      pedir('/beneficiarios/' + encodeURIComponent(t.dataset.borrar), { metodo: 'DELETE' })
        .then(() => ir('bancos', 'Destino quitado.'))
        .catch((e) => avisar(e.message, true));
    }
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

  // ── arrancar ──────────────────────────────────────────────────────────────
  /* LA PORTADA DE CARGA. Un instante de marca —el sello latiendo sobre el
     pozo— mientras se resuelve la sesión, y la plataforma entra ya armada.
     Dura lo que tarde lo de verdad, con un mínimo para que no parpadee; con
     movimiento reducido no aparece y todo entra en seco, que es lo pedido. */
  const REDUCIDO = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function portada() {
    raiz().innerHTML = `<div class="abriendo" role="status" aria-label="Abriendo AuCorp">
      <img src="../assets/aucorp-marca-oscura.png" alt="AuCorp">
      <div class="ab-linea" aria-hidden="true"></div>
      <p>La banca del ecosistema Orden Global</p>
    </div>`;
  }

  async function arrancar() {
    const desde = Date.now();
    const conCalma = (fn) => {
      const falta = REDUCIDO ? 0 : Math.max(0, 1100 - (Date.now() - desde));
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
      try {
        const d = await pedir('/auth/sso', { metodo: 'POST', cuerpo: { token } });
        sesion = { token: d.token, refreshToken: d.refreshToken, usuario: d.usuario };
        guardar();
        cargando = false;
        return conCalma(() => ir('inicio'));
      } catch (e) {
        cargando = false;
        return conCalma(() => avisar(e.message, true));
      }
    }

    sesion = recuperar();
    if (sesion?.token) return conCalma(() => ir('inicio'));
    conCalma(pintar);
  }

  arrancar();

  return { ir, salir };
})();
