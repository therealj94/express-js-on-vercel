/* Ordenex · comprar.js — convertir USDT en ORIGEN.
 *
 * Expone `const VCOMPRA` con el contrato que app.js espera: { vista, alPintar,
 * apagar } más los manejadores de los onclick.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LO QUE ESTA PANTALLA TIENE GRABADO
 *
 * · EL NÚMERO GRANDE ES EL QUE RECIBE, NO EL QUE MANDA. Lo que a la persona le
 *   importa es cuánto ORIGEN se lleva, y ese número lleva la comisión YA
 *   DESCONTADA. No hay letra chica que reste después: el número de arriba es
 *   el que le va a llegar.
 *
 * · LA RED SE ELIGE VIENDO SU PRECIO EN TIEMPO. Un selector que solo dice
 *   «Polygon / BSC / Ethereum» esconde la única decisión que de verdad importa:
 *   Ethereum tarda entre trece y veinticinco minutos y pide un mínimo mucho más
 *   alto. Eso va EN el selector, antes de elegir — no en un aviso después.
 *
 * · TRON NO EXISTE AQUÍ, Y ES EL ERROR MÁS CARO. Es la red donde más USDT se
 *   mueve y la más barata, y la dirección de la persona no existe ahí: lo que
 *   se mande por TRC20 no llega a ningún sitio recuperable. Por eso el aviso va
 *   en rojo y ARRIBA de la dirección, con el nombre de la red repetido tres
 *   veces — no como advertencia legal al pie, que nadie lee.
 *
 * · NUNCA UNA RUEDA GIRANDO SIN TEXTO. Entre que manda el dinero y ve su
 *   ORIGEN pasan minutos, y esos minutos son donde se pierde la confianza. Cada
 *   uno tiene su renglón en el riel, diciendo algo distinto y verdadero.
 *
 * · EL RELOJ DEL PRECIO DICE QUÉ PASA AL LLEGAR A CERO, antes de que pase.
 *   Y el tiempo de la red va aparte del reloj del precio: si no, alguien que
 *   pagó a tiempo cree que llegó tarde.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * EL DINERO
 *
 * El USDT va en micro-dólares (string entero, ×10^6) y el ORIGEN en wei
 * (×10^18), los dos operados con BigInt. Un float con plata dentro no entra a
 * este archivo — es la misma regla que fiat.js y que el servidor.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CONTRA QUÉ HABLA
 *
 * El servidor de compras todavía no existe: se está construyendo (decimales,
 * derivación, gas y vigía ya están; la orden con su precio congelado es el paso
 * que sigue). Mientras tanto esta vista funciona en MODO VISTA PREVIA, rotulado
 * como tal en pantalla — nunca fingiendo ser real. Las llamadas están escritas
 * contra el contrato que el servidor va a exponer y son las tres de abajo.
 */

const VCOMPRA = (() => {
  'use strict';

  const esc = (s) => ONX.esc(s);

  // ── las redes, con su verdad ──────────────────────────────────────────────
  //
  // El tiempo NO es un adorno: es la mitad de la decisión. Los números salen de
  // lo medido contra las cadenas de verdad — Ethereum finaliza en dos epocas
  // (12,8 min en el caso bueno, mas de 19 con la red inestable) y el minimo
  // sale del gas: barrer $4 en Ethereum cuesta mas que la comision entera.
  const REDES = [
    { id: 137, clave: 'polygon', nombre: 'Polygon', tiempo: '~2 min', minimo: 2, orden: 1 },
    { id: 56, clave: 'bsc', nombre: 'BNB Chain', tiempo: '~1 min', minimo: 2, orden: 2 },
    { id: 1, clave: 'ethereum', nombre: 'Ethereum', tiempo: '13–25 min', minimo: 25, orden: 3, lenta: true },
  ];

  const TXT = {
    es: {
      t: 'Comprar ORIGEN', sub: 'Con USDT, desde tu exchange o tu billetera.',
      previa: 'Vista previa del diseño. El servidor de compras se está construyendo: acá no se mueve dinero todavía.',
      cuanto: 'Quiero depositar', red: 'Por la red', recibis: 'Vas a recibir',
      precioA: 'a', porOrigen: 'por ORIGEN', comision: 'comisión ya descontada',
      congelar: 'Congelar este precio', congelando: 'Congelando…',
      cargando: 'Buscando el precio del oro…',
      escribi: 'Escribí cuánto querés depositar',
      oroA: 'Oro a', laOnza: 'la onza', hace: 'leído hace',
      plazo: 'El precio te queda fijo 60 minutos.',
      minimo: 'Mínimo en esta red', tiempoRed: 'La red tarda',
      // la pantalla de la dirección
      manda: 'Mandá exactamente', soloPor: 'Solo por', dir: 'Tu dirección para esta compra',
      copiar: 'Copiar dirección', copiado: 'Copiada', quedan: 'Te quedan',
      vencido: 'El precio venció', tron: 'No mandes por TRON (TRC20). Esa red no existe acá y ese dinero no se recupera.',
      alVencer: 'Si el tiempo se acaba antes de que llegue, se recalcula al precio de ese momento y te avisamos antes de entregarte nada.',
      // el riel
      rEsperando: 'Esperando tu depósito', rEsperandoD: 'Mandá el USDT a la dirección de arriba.',
      rVisto: 'Lo vimos llegar', rVistoD: 'Está en la cadena. Esperando las confirmaciones de la red.',
      rConfirmado: 'Confirmado', rConfirmadoD: 'Ya no se puede deshacer. Entregando tu ORIGEN.',
      rAcreditado: 'Listo', rAcreditadoD: 'Está en tu Veta Wallet.',
      verEn: 'Ver en el explorador', otra: 'Hacer otra compra', cancelar: 'Cancelar',
      sinWallet: 'Para recibir tu ORIGEN necesitamos tu billetera de Veta Wallet.',
      sinWalletD: 'Abrila una vez y volvé — se vincula sola, no hay nada que copiar.',
      abrirWallet: 'Abrir Veta Wallet',
      sinRef: 'No hay precio de referencia ahora mismo. No se puede congelar un precio sobre un dato que no llegó.',
      malMonto: 'Escribí cuánto USDT querés depositar.',
      bajoMinimo: 'En esta red el mínimo es',
    },
    en: {
      t: 'Buy ORIGEN', sub: 'With USDT, from your exchange or wallet.',
      previa: 'Design preview. The purchase backend is being built: no money moves here yet.',
      cuanto: 'I want to deposit', red: 'On network', recibis: "You'll receive",
      precioA: 'at', porOrigen: 'per ORIGEN', comision: 'fee already deducted',
      congelar: 'Lock this price', congelando: 'Locking…',
      cargando: 'Fetching the gold price…',
      escribi: 'Enter how much you want to deposit',
      oroA: 'Gold at', laOnza: 'per ounce', hace: 'read',
      plazo: 'Your price stays fixed for 60 minutes.',
      minimo: 'Minimum on this network', tiempoRed: 'Network takes',
      manda: 'Send exactly', soloPor: 'Only on', dir: 'Your address for this purchase',
      copiar: 'Copy address', copiado: 'Copied', quedan: 'Time left',
      vencido: 'Price expired', tron: "Don't send on TRON (TRC20). That network doesn't exist here and those funds are not recoverable.",
      alVencer: "If time runs out before it arrives, we recalculate at that moment's price and tell you before delivering anything.",
      rEsperando: 'Waiting for your deposit', rEsperandoD: 'Send the USDT to the address above.',
      rVisto: 'We saw it arrive', rVistoD: "It's on chain. Waiting for network confirmations.",
      rConfirmado: 'Confirmed', rConfirmadoD: "It can't be reversed now. Delivering your ORIGEN.",
      rAcreditado: 'Done', rAcreditadoD: "It's in your Veta Wallet.",
      verEn: 'View on explorer', otra: 'Buy again', cancelar: 'Cancel',
      sinWallet: 'To receive your ORIGEN we need your Veta Wallet address.',
      sinWalletD: 'Open it once and come back — it links itself, nothing to copy.',
      abrirWallet: 'Open Veta Wallet',
      sinRef: "No reference price right now. We won't lock a price on data that didn't arrive.",
      malMonto: 'Enter how much USDT you want to deposit.',
      bajoMinimo: 'On this network the minimum is',
    },
  };
  const idioma = () => (document.documentElement.lang === 'en' ? 'en' : 'es');
  const t = (k) => TXT[idioma()][k] ?? k;

  // ── el dinero, entero y sin un double en el camino ────────────────────────

  /** De lo que teclea la gente a micro-dolares. null ante cualquier cosa rara:
   *  adivinar un monto es peor que rechazarlo. */
  function aMicro(txt) {
    const s = String(txt == null ? '' : txt).trim().replace(',', '.');
    if (!/^\d{1,10}(\.\d{1,6})?$/.test(s)) return null;
    const [e, d = ''] = s.split('.');
    return (BigInt(e) * 1000000n + BigInt((d + '000000').slice(0, 6))).toString();
  }

  const deMicro = (m, dec = 2) => (Number(BigInt(m)) / 1e6).toFixed(dec);

  /**
   * ORIGEN que sale de N micro-dolares, en wei.
   *
   *   origenWei = microUsd × 10^30 / precioWei
   *
   * Trunca hacia abajo, que es la unica direccion aceptable: redondear hacia
   * arriba seria entregar ORIGEN que nadie pago. Es la misma regla del motor.
   */
  function origenDe(microUsd, precioWei) {
    if (!microUsd || !precioWei || BigInt(precioWei) === 0n) return null;
    return ((BigInt(microUsd) * (10n ** 30n)) / BigInt(precioWei)).toString();
  }

  const deWei = (w, dec = 4) => {
    if (w == null) return '—';
    const n = Number(BigInt(w)) / 1e18;
    return n.toLocaleString(idioma() === 'en' ? 'en-US' : 'es-HN',
      { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };

  /** El numero partido en magnitud y precision. Se lee primero cuanto y despues
   *  con que exactitud, que es el orden en que lo lee un ojo — y es como lo
   *  parten los exchanges por el mismo motivo. */
  /* El separador NO se adivina: se le pregunta al idioma. Suponer coma para
     español costo que el numero no se partiera — es-HN usa PUNTO, igual que
     en-US, y el `lastIndexOf(',')` no encontraba nada. Se ve en la captura. */
  function separador() {
    const loc = idioma() === 'en' ? 'en-US' : 'es-HN';
    return (1.1).toLocaleString(loc).replace(/[0-9]/g, '');
  }

  function partido(w, dec = 4) {
    const txt = deWei(w, dec);
    const i = txt.lastIndexOf(separador());
    if (i < 0) return `<span class="ent">${esc(txt)}</span>`;
    return `<span class="ent">${esc(txt.slice(0, i))}</span><span class="dec">${esc(txt.slice(i))}</span>`;
  }

  // ── el estado de la pantalla ──────────────────────────────────────────────
  let redElegida = 137;
  let monto = '';
  let precio = null;       // { wei, usd, oro, en } — la referencia viva
  let orden = null;        // la orden congelada, cuando existe
  let copiada = false;
  let reloj = null;
  let sondeo = null;
  let cargandoPrecio = false;
  /* Distingue «todavia no pregunte» de «pregunte y no habia». Sin esta
     bandera las dos se ven igual, y la que se enseñaba era la alarma: al
     abrir la pantalla aparecia un error rojo que no era cierto todavia. */
  let precioIntentado = false;

  /** ¿El servidor de compras ya existe? Mientras no, la vista se rotula como
   *  vista previa. Nunca se finge que una compra es real. */
  let hayServidor = false;

  // ── la referencia del oro ─────────────────────────────────────────────────
  //
  // Sale del MISMO sitio que la de los mercados (DATOS.mercados → referencia),
  // para que la casa no cotice un numero en una pantalla y otro en la de al
  // lado. Si no llego, NO se congela nada: un precio congelado sobre un feed
  // caido es un numero inventado con consecuencias.
  async function traerPrecio() {
    if (cargandoPrecio) return;
    cargandoPrecio = true;
    try {
      const lista = await DATOS.mercados();
      const m = (Array.isArray(lista) ? lista : []).find((x) => x?.referencia?.origenUsd);
      const usd = Number(m?.referencia?.origenUsd);
      const oro = Number(m?.referencia?.usd);
      if (Number.isFinite(usd) && usd > 0) {
        const antes = precio?.usd;
        precio = { usd, oro: Number.isFinite(oro) ? oro : null, en: new Date() };
        // Un numero que cambia sin avisar parece un numero que nunca cambio.
        if (antes != null && antes !== usd) destellar();
      }
    } catch { /* se queda el ultimo bueno, o null */ }
    precioIntentado = true;
    cargandoPrecio = false;
    pintarCalculo();
  }

  /** El precio en wei, para la cuenta entera. */
  const precioWei = () => (precio ? BigInt(Math.round(precio.usd * 1e6)) * (10n ** 12n) : null);

  function frescura() {
    if (!precio?.en) return '';
    const s = Math.max(0, Math.round((Date.now() - precio.en.getTime()) / 1000));
    if (s < 60) return `${t('hace')} ${s} s`;
    return `${t('hace')} ${Math.round(s / 60)} min`;
  }

  function destellar() {
    const h = document.querySelector('#cp-izq .cp-hero');
    if (!h) return;
    h.classList.remove('tic');
    void h.offsetWidth; // reinicia la animacion aunque el destello anterior siga
    h.classList.add('tic');
  }

  const redDe = (id) => REDES.find((r) => r.id === Number(id)) || REDES[0];

  // ── la vista ──────────────────────────────────────────────────────────────

  function vista() {
    return `
    <div class="cab">
      <div>
        <h2>${esc(t('t'))}</h2>
        <p class="cab-sub">${esc(t('sub'))}</p>
      </div>
    </div>
    ${hayServidor ? '' : `<div class="cp-previa">${esc(t('previa'))}</div>`}
    <div class="cp-grid">
      <div class="cp-col" id="cp-izq">${orden ? panelDireccion() : panelCalculadora()}</div>
      <div class="cp-col" id="cp-der">${panelRiel()}</div>
    </div>`;
  }

  // ── 1 · la calculadora ────────────────────────────────────────────────────

  function panelCalculadora() {
    const r = redDe(redElegida);
    const micro = aMicro(monto);
    const pw = precioWei();
    const recibe = micro && pw ? origenDe(micro, pw) : null;
    const bajo = micro && Number(deMicro(micro)) < r.minimo;

    return `
    <div class="vidrio cp-caja">
      <div class="campo">
        <label for="cp-monto">${esc(t('cuanto'))}</label>
        <div class="cp-monto">
          <input id="cp-monto" inputmode="decimal" autocomplete="off" placeholder="100"
                 value="${esc(monto)}" oninput="VCOMPRA.monto(this.value)">
          <span class="cp-mon">USDT</span>
        </div>
        <div class="cp-rapidos">
          ${[50, 100, 500, 1000].map((v) => `
            <button type="button" class="cp-rap${String(monto).trim() === String(v) ? ' es' : ''}"
                    onclick="VCOMPRA.monto('${v}')">${v}</button>`).join('')}
        </div>
      </div>

      <div class="campo">
        <label>${esc(t('red'))}</label>
        <div class="cp-redes" role="radiogroup">
          ${REDES.map((x) => `
            <button type="button" role="radio" aria-checked="${x.id === redElegida}"
                    class="cp-red${x.id === redElegida ? ' es' : ''}${x.lenta ? ' lenta' : ''}"
                    onclick="VCOMPRA.red(${x.id})">
              <span class="cp-red-n">${esc(x.nombre)}</span>
              <span class="cp-red-t mono">${esc(x.tiempo)}</span>
              <span class="cp-red-m">min $${x.minimo}</span>
            </button>`).join('')}
        </div>
      </div>

      <div class="cp-recibe">
        <span class="cp-lbl">${esc(t('recibis'))}</span>
        <div class="cp-hero${recibe ? '' : ' vacio'}">
          ${recibe ? `${partido(recibe)} <em>ORIGEN</em>` : `<span>${esc(t('escribi'))}</span>`}
        </div>
        <div class="cp-precio">
          ${precio
            ? `${esc(t('precioA'))} <b class="mono">$${precio.usd.toFixed(4)}</b> ${esc(t('porOrigen'))} · <span class="cp-com">${esc(t('comision'))}</span>`
            : precioIntentado
              ? `<span class="cp-sinref">${esc(t('sinRef'))}</span>`
              : `<span class="cp-cargando">${esc(t('cargando'))}</span>`}
        </div>
        ${precio ? `<div class="cp-fuente">
          <span>${esc(t('oroA'))} <b class="mono">$${precio.oro ? precio.oro.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</b> ${esc(t('laOnza'))}</span>
          <span class="cp-fresco" id="cp-fresco">${esc(frescura())}</span>
        </div>` : ''}
      </div>

      ${bajo ? `<div class="cp-alerta">${esc(t('bajoMinimo'))} $${r.minimo} ${esc(idioma() === 'en' ? 'USDT' : 'USDT')}.</div>` : ''}

      <button class="btn btn-oro btn-full" ${(!recibe || bajo || !precio) ? 'disabled' : ''}
              onclick="VCOMPRA.congelar()">${esc(t('congelar'))}</button>
      <p class="cp-pie">${esc(t('plazo'))}</p>
    </div>`;
  }

  // ── 2 · la dirección ──────────────────────────────────────────────────────

  function panelDireccion() {
    const r = redDe(orden.cadena);
    const vencida = orden.restanSeg <= 0;
    return `
    <div class="vidrio cp-caja">
      <div class="cp-manda">
        <span class="cp-lbl">${esc(t('manda'))}</span>
        <div class="cp-hero">${esc(deMicro(orden.montoMicro))} <em>USDT</em></div>
      </div>

      <!-- EL AVISO VA ARRIBA DE LA DIRECCION, EN ROJO Y CON EL NOMBRE DE LA RED
           REPETIDO. Es el unico error de esta pantalla que no se puede reparar
           despues, asi que no puede ir de nota al pie. -->
      <div class="cp-red-aviso">
        <strong>${esc(t('soloPor'))} ${esc(r.nombre)}</strong>
        <span>${esc(t('tron'))}</span>
      </div>

      <div class="campo">
        <label>${esc(t('dir'))} · ${esc(r.nombre)}</label>
        <div class="cp-dir${copiada ? ' ok' : ''}">
          <code class="mono">${esc(orden.direccion)}</code>
          <button class="btn btn-linea btn-sm" onclick="VCOMPRA.copiar()">
            ${esc(copiada ? t('copiado') : t('copiar'))}
          </button>
        </div>
        <div class="cp-qr-caja">
          <div class="cp-qr" id="cp-qr" aria-hidden="true"></div>
          <span class="cp-qr-red">${esc(r.nombre)}</span>
        </div>
      </div>

      <div class="cp-reloj ${claseReloj()}" id="cp-reloj">
        <span class="cp-lbl">${esc(vencida ? t('vencido') : t('quedan'))}</span>
        <div class="cp-cuenta">
          <div class="cp-anillo">
            <svg viewBox="0 0 72 72" aria-hidden="true">
              <circle class="pista" cx="36" cy="36" r="32"/>
              <circle class="arco" cx="36" cy="36" r="32" id="cp-arco"
                      stroke-dasharray="${VUELTA}" stroke-dashoffset="${desfase()}"/>
            </svg>
            <b id="cp-pct">${pctTxt()}</b>
          </div>
          <div class="cp-tiempo" id="cp-cuenta">${reloj_txt(orden.restanSeg)}</div>
        </div>
        <p class="cp-pie">${esc(t('alVencer'))}</p>
      </div>

      <button class="btn btn-linea btn-full btn-sm" onclick="VCOMPRA.cancelar()">${esc(t('cancelar'))}</button>
    </div>`;
  }

  /* El perimetro del anillo (r=32). Se reparte entre lo que queda y lo que se
     fue: el anillo da la magnitud de un vistazo y los digitos la precision. */
  const VUELTA = (2 * Math.PI * 32).toFixed(1);
  const PLAZO = 3600;

  const fraccion = () => (orden ? Math.max(0, Math.min(1, orden.restanSeg / (orden.plazoSeg || PLAZO))) : 0);
  const desfase = () => (Number(VUELTA) * (1 - fraccion())).toFixed(1);
  const pctTxt = () => `${Math.round(fraccion() * 100)}%`;

  /* La urgencia ESCALA: oro mientras sobra, ambar bajo diez minutos, coral bajo
     dos y con latido. Un contador que se ve igual a los 59 minutos que a los 30
     segundos no esta contando nada. */
  function claseReloj() {
    if (!orden) return '';
    if (orden.restanSeg <= 0) return 'mal';
    if (orden.restanSeg <= 120) return 'urge';
    if (orden.restanSeg <= 600) return 'aviso';
    return '';
  }

  const reloj_txt = (s) => {
    if (s <= 0) return '00:00';
    const m = Math.floor(s / 60), q = s % 60;
    return `${String(m).padStart(2, '0')}:${String(q).padStart(2, '0')}`;
  };

  // ── 3 · el riel de estados ────────────────────────────────────────────────
  //
  // No es una barra girando: son cuatro renglones que dicen algo distinto y
  // verdadero en cada momento. El de «visto» es el que mas importa — es el
  // primero en que la casa puede decirle algo que ella no sabia, y es donde el
  // deposito deja de ser un acto de fe.

  function panelRiel() {
    const paso = orden ? orden.paso : 0;
    const r = orden ? redDe(orden.cadena) : redDe(redElegida);
    const pasos = [
      { n: 1, t: t('rEsperando'), d: t('rEsperandoD') },
      { n: 2, t: t('rVisto'), d: t('rVistoD') },
      { n: 3, t: t('rConfirmado'), d: t('rConfirmadoD'), chip: r.tiempo },
      { n: 4, t: t('rAcreditado'), d: t('rAcreditadoD') },
    ];
    return `
    <div class="vidrio cp-riel${orden ? '' : ' quieto'}">
      ${pasos.map((p) => {
        const est = p.n < paso ? 'hecho' : p.n === paso ? 'ahora' : 'porvenir';
        return `
        <div class="cp-paso ${est}">
          <div class="cp-punto">${p.n < paso ? '&#10003;' : p.n}</div>
          <div class="cp-txt">
            <b>${esc(p.t)}${p.chip ? `<i class="cp-chip mono">${esc(p.chip)}</i>` : ''}</b>
            <span>${esc(p.d)}</span>
            ${p.n === 2 && orden?.hash ? `<a class="cp-link" href="${esc(orden.explorador)}" target="_blank" rel="noopener">${esc(t('verEn'))}</a>` : ''}
          </div>
        </div>`;
      }).join('')}
      ${paso >= 4 ? `<button class="btn btn-oro btn-full btn-sm" onclick="VCOMPRA.cancelar()">${esc(t('otra'))}</button>` : ''}
    </div>`;
  }

  // ── los manejadores ───────────────────────────────────────────────────────

  function setMonto(v) { monto = v; pintarCalculo(); }
  function setRed(id) { redElegida = Number(id); repintar(); }

  /** Solo se repinta el trozo que cambia: repintar la vista entera en cada
   *  tecla le robaria el foco al campo mientras alguien escribe. */
  function pintarCalculo() {
    const izq = document.getElementById('cp-izq');
    if (!izq || orden) return;
    const foco = document.activeElement?.id === 'cp-monto';
    const pos = foco ? document.getElementById('cp-monto').selectionStart : null;
    izq.innerHTML = panelCalculadora();
    if (foco) {
      const c = document.getElementById('cp-monto');
      c.focus();
      if (pos != null) c.setSelectionRange(pos, pos);
    }
  }

  function repintar() {
    const izq = document.getElementById('cp-izq');
    const der = document.getElementById('cp-der');
    if (izq) izq.innerHTML = orden ? panelDireccion() : panelCalculadora();
    if (der) der.innerHTML = panelRiel();
    if (orden) dibujarQr();
  }

  function dibujarQr() {
    const caja = document.getElementById('cp-qr');
    if (!caja || !orden?.direccion) return;
    try {
      // qr.js ya vive en esta casa y lo usa el portafolio.
      if (typeof QR?.svg === 'function') caja.innerHTML = QR.svg(orden.direccion, 132);
    } catch { caja.innerHTML = ''; }
  }

  async function congelar() {
    const micro = aMicro(monto);
    const pw = precioWei();
    if (!micro) return ONX.avisar(t('malMonto'), 'mal');
    if (!pw) return ONX.avisar(t('sinRef'), 'mal');

    if (!hayServidor) {
      // VISTA PREVIA. Se arma una orden LOCAL para que se pueda ver la pantalla
      // entera, y se rotula como previa arriba. No se llama a ningun endpoint y
      // no se finge que hay dinero de por medio.
      orden = {
        cadena: redElegida,
        montoMicro: micro,
        origenWei: origenDe(micro, pw),
        direccion: '0x' + '0'.repeat(40),
        restanSeg: 3600,
        plazoSeg: 3600,
        paso: 1,
        hash: null,
        explorador: '#',
        previa: true,
      };
      repintar();
      arrancarReloj();
      return;
    }

    try {
      const r = await DATOS.post('/compras', {
        montoMicro: micro, cadena: redElegida,
        aceptoRecalculo: true, reglaRecalculoVersion: '2026-09-04',
      });
      orden = r; repintar(); arrancarReloj(); arrancarSondeo();
    } catch (e) {
      if (e?.codigo === 'SIN_DIRECCION_WALLET') return pedirWallet();
      ONX.avisar(e?.message || 'No se pudo congelar el precio.', 'mal');
    }
  }

  /** Sin dirección de Veta Wallet la orden NO nace. Cobrarle a alguien por una
   *  entrega que no se le puede hacer es el peor orden posible. */
  function pedirWallet() {
    const izq = document.getElementById('cp-izq');
    if (!izq) return;
    izq.innerHTML = `
      <div class="vidrio cp-caja cp-falta">
        <span class="cp-lbl">${esc(idioma() === 'en' ? 'One step missing' : 'Falta un paso')}</span>
        <p class="cp-falta-t">${esc(t('sinWallet'))}</p>
        <p class="cp-pie">${esc(t('sinWalletD'))}</p>
        <a class="btn btn-oro btn-full" href="https://app.vetawallet.com" target="_blank" rel="noopener">
          ${esc(t('abrirWallet'))}</a>
      </div>`;
  }

  function copiar() {
    if (!orden?.direccion) return;
    navigator.clipboard?.writeText(orden.direccion).then(() => {
      copiada = true; repintar();
      setTimeout(() => { copiada = false; repintar(); }, 2200);
    }).catch(() => ONX.avisar('No se pudo copiar.', 'mal'));
  }

  function cancelar() {
    orden = null; monto = ''; copiada = false;
    pararReloj(); pararSondeo(); repintar();
  }

  // ── los relojes ───────────────────────────────────────────────────────────

  function arrancarReloj() {
    pararReloj();
    reloj = setInterval(() => {
      if (!orden) return pararReloj();
      orden.restanSeg = Math.max(0, orden.restanSeg - 1);
      const c = document.getElementById('cp-cuenta');
      if (c) c.textContent = reloj_txt(orden.restanSeg);
      const arco = document.getElementById('cp-arco');
      if (arco) arco.setAttribute('stroke-dashoffset', desfase());
      const pct = document.getElementById('cp-pct');
      if (pct) pct.textContent = pctTxt();
      const caja = document.getElementById('cp-reloj');
      if (caja) caja.className = `cp-reloj ${claseReloj()}`;
      // Al llegar a cero NO se borra la orden ni se esconde la dirección: el
      // dinero que llegue tarde entra igual y el precio se decide entonces.
      // Vaciar la pantalla al vencer sería tirar el depósito de alguien.
      if (orden.restanSeg === 0) repintar();
    }, 1000);
  }
  const pararReloj = () => { if (reloj) { clearInterval(reloj); reloj = null; } };

  function arrancarSondeo() {
    pararSondeo();
    sondeo = setInterval(async () => {
      if (!orden?.id) return;
      try {
        const r = await DATOS.get(`/compras/${orden.id}`);
        const antes = orden.paso;
        orden = { ...orden, ...r };
        if (orden.paso !== antes) repintar();
      } catch { /* un sondeo que falla no rompe la pantalla */ }
    }, 8000);
  }
  const pararSondeo = () => { if (sondeo) { clearInterval(sondeo); sondeo = null; } };

  // ── ciclo de vida ─────────────────────────────────────────────────────────

  let refresco = null;

  function alPintar() {
    traerPrecio();
    /* La referencia se vuelve a pedir cada minuto y el rotulo de frescura cada
       diez segundos. Una cotizacion quieta cinco minutos es una cotizacion
       vieja que parece viva, y esa es la clase de mentira que una casa de
       cambio no se puede permitir en la pantalla donde alguien decide. */
    clearInterval(refresco);
    refresco = setInterval(() => {
      const f = document.getElementById('cp-fresco');
      if (f) f.textContent = frescura();
      if (precio && Date.now() - precio.en.getTime() > 60_000) traerPrecio();
    }, 10_000);
    if (orden) { dibujarQr(); arrancarReloj(); if (hayServidor) arrancarSondeo(); }
  }

  function apagar() { pararReloj(); pararSondeo(); clearInterval(refresco); refresco = null; }

  return {
    vista, alPintar, apagar,
    monto: setMonto, red: setRed, congelar, copiar, cancelar, qr: dibujarQr,
    _adentro: { aMicro, origenDe, REDES, TXT,
      // Solo para mirar el contador en sus tres niveles sin esperar una hora.
      forzarSegundos: (n) => { if (orden) orden.restanSeg = n; } },
  };
})();
