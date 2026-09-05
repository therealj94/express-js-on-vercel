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
      t: 'Comprar ORIGEN', sub: 'Decí cuánto ORIGEN querés y la casa te dice qué mandar. Se paga con USDT, desde tu exchange o tu billetera.',
      previa: 'Vista previa del diseño. El servidor de compras se está construyendo: acá no se mueve dinero todavía.',
      cerrada: 'La compra de ORIGEN con USDT está cerrada en este momento. No mandes nada todavía: no habría quién te lo entregue.',
      cuanto: '¿Cuánto ORIGEN querés comprar?', red: 'Por la red', recibis: 'Vas a recibir',
      pagas: 'Vas a pagar', porLaRed: 'por', recibisAlMenos: 'Recibís',
      escribiOrigen: 'Escribí cuánto ORIGEN querés',
      precioA: 'a', porOrigen: 'por ORIGEN', comision: 'sin comisión de compra',
      congelar: 'Congelar este precio', congelando: 'Congelando…',
      cargando: 'Buscando el precio del oro…',
      escribi: 'Escribí cuánto ORIGEN querés',
      oroA: 'Oro a', laOnza: 'la onza', hace: 'leído hace',
      plazo: 'El precio te queda fijo {min} minutos.',
      minimo: 'Mínimo en esta red', tiempoRed: 'La red tarda',
      // la pantalla de la dirección
      manda: 'Mandá exactamente', soloPor: 'Solo por', dir: 'Tu dirección para esta compra',
      llego: 'Ya recibimos', noMandesMas: 'No mandes más: este depósito ya está en curso.',
      copiar: 'Copiar dirección', copiado: 'Copiada', quedan: 'Te quedan',
      vencido: 'El precio venció', tron: 'No mandes por TRON (TRC20). Esa red no existe acá y ese dinero no se recupera.',
      alVencer: 'Si el tiempo se acaba antes de que llegue, se recalcula al precio de ese momento y te avisamos antes de entregarte nada.',
      // el riel
      rEsperando: 'Esperando tu depósito', rEsperandoD: 'Mandá el USDT a la dirección de arriba.',
      rVisto: 'Lo vimos llegar', rVistoD: 'Está en la cadena. Esperando las confirmaciones de la red.',
      rConfirmado: 'Confirmado', rConfirmadoD: 'Ya no se puede deshacer. Entregando tu ORIGEN.',
      rEsperandoVos: 'Esperando que decidas', rEsperandoVosD: 'Llegó tu depósito y el precio cambió. Mirá el aviso de arriba: nada se entrega hasta que digas que sí.',
      rRevision: 'Lo está mirando alguien', rRevisionD: 'Tu depósito llegó y está seguro. Te escribimos apenas se resuelva.',
      rAcreditado: 'Listo', rAcreditadoD: 'Está en tu Veta Wallet.',
      verEn: 'Ver en el explorador', otra: 'Hacer otra compra', cancelar: 'Cancelar',
      // el recálculo
      recalT: 'El precio cambió mientras llegaba tu depósito',
      recalD: 'Llegó después de que se acabara el plazo, así que lo recalculamos al precio de ese momento. Nada se entrega hasta que vos digas que sí.',
      recalSinOrden: 'Tu depósito llegó sin una orden abierta, así que lo calculamos al precio de ahora. Nada se entrega hasta que vos digas que sí.',
      recalLlego: 'Llegaron', recalAntes: 'Ibas a recibir', recalAhora: 'Ahora recibirías',
      recalSi: 'Sí, entregame ese ORIGEN', recalNo: 'Ahora no',
      entregado: 'Ver la entrega en OrdenScan',
      sinWallet: 'Para recibir tu ORIGEN necesitamos tu billetera de Veta Wallet.',
      sinWalletD: 'Abrila una vez y volvé — se vincula sola, no hay nada que copiar.',
      abrirWallet: 'Abrir Veta Wallet',
      sinRef: 'No hay precio de referencia ahora mismo. No se puede congelar un precio sobre un dato que no llegó.',
      malMonto: 'Escribí cuánto ORIGEN querés comprar.',
      bajoMinimo: 'En esta red el mínimo es',
    },
    en: {
      t: 'Buy ORIGEN', sub: 'Say how much ORIGEN you want and the house tells you what to send. Paid with USDT, from your exchange or wallet.',
      previa: 'Design preview. The purchase backend is being built: no money moves here yet.',
      cerrada: 'Buying ORIGEN with USDT is closed right now. Do not send anything yet: there would be nobody to deliver it.',
      cuanto: 'How much ORIGEN do you want?', red: 'On network', recibis: "You'll receive",
      pagas: "You'll pay", porLaRed: 'on', recibisAlMenos: 'You receive',
      escribiOrigen: 'Enter how much ORIGEN you want',
      precioA: 'at', porOrigen: 'per ORIGEN', comision: 'no purchase fee',
      congelar: 'Lock this price', congelando: 'Locking…',
      cargando: 'Fetching the gold price…',
      escribi: 'Enter how much ORIGEN you want',
      oroA: 'Gold at', laOnza: 'per ounce', hace: 'read',
      plazo: 'Your price stays fixed for {min} minutes.',
      minimo: 'Minimum on this network', tiempoRed: 'Network takes',
      manda: 'Send exactly', soloPor: 'Only on', dir: 'Your address for this purchase',
      llego: 'We received', noMandesMas: 'Don\'t send more: this deposit is already in progress.',
      copiar: 'Copy address', copiado: 'Copied', quedan: 'Time left',
      vencido: 'Price expired', tron: "Don't send on TRON (TRC20). That network doesn't exist here and those funds are not recoverable.",
      alVencer: "If time runs out before it arrives, we recalculate at that moment's price and tell you before delivering anything.",
      rEsperando: 'Waiting for your deposit', rEsperandoD: 'Send the USDT to the address above.',
      rVisto: 'We saw it arrive', rVistoD: "It's on chain. Waiting for network confirmations.",
      rConfirmado: 'Confirmed', rConfirmadoD: "It can't be reversed now. Delivering your ORIGEN.",
      rEsperandoVos: 'Waiting on you', rEsperandoVosD: 'Your deposit arrived and the price changed. See the notice above: nothing is delivered until you say yes.',
      rRevision: 'A person is looking at it', rRevisionD: 'Your deposit arrived and is safe. We write to you as soon as it is resolved.',
      rAcreditado: 'Done', rAcreditadoD: "It's in your Veta Wallet.",
      verEn: 'View on explorer', otra: 'Buy again', cancelar: 'Cancel',
      recalT: 'The price moved while your deposit was arriving',
      recalD: "It arrived after the window closed, so we recalculated at that moment's price. Nothing is delivered until you say yes.",
      recalSinOrden: 'Your deposit arrived without an open order, so we priced it at the current rate. Nothing is delivered until you say yes.',
      recalLlego: 'Arrived', recalAntes: 'You were getting', recalAhora: "You'd get now",
      recalSi: 'Yes, deliver that ORIGEN', recalNo: 'Not now',
      entregado: 'See the delivery on OrdenScan',
      sinWallet: 'To receive your ORIGEN we need your Veta Wallet address.',
      sinWalletD: 'Open it once and come back — it links itself, nothing to copy.',
      abrirWallet: 'Open Veta Wallet',
      sinRef: "No reference price right now. We won't lock a price on data that didn't arrive.",
      malMonto: 'Enter how much ORIGEN you want to buy.',
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

  /** De lo que teclea la gente a wei de ORIGEN. Misma severidad que aMicro. */
  function aWei(txt) {
    const s = String(txt == null ? '' : txt).trim().replace(',', '.');
    if (!/^\d{1,12}(\.\d{1,18})?$/.test(s)) return null;
    const [e, d = ''] = s.split('.');
    const v = BigInt(e) * (10n ** 18n) + BigInt((d + '0'.repeat(18)).slice(0, 18));
    return v > 0n ? v.toString() : null;
  }

  /**
   * EL CAMINO DE VUELTA: cuántos micro-dólares hay que mandar por N ORIGEN.
   *
   * Es la inversa de origenDe, y se redondea HACIA ARRIBA hasta el centavo por
   * dos razones que van juntas. La primera es de dinero: hacia abajo la casa
   * entregaría ORIGEN que nadie pagó. La segunda es práctica y pesa más —
   * quien manda USDT lo hace desde un exchange, y pedirle 310,994312 es
   * pedirle algo que su pantalla no siempre deja teclear. Al centavo, se paga
   * un pelo de más y se recibe un pelo más de ORIGEN del pedido, nunca menos.
   */
  function microDe(origenWei, precioWei) {
    if (!origenWei || !precioWei || BigInt(precioWei) === 0n) return null;
    const exacto = (BigInt(origenWei) * BigInt(precioWei)) / (10n ** 30n);
    const CENTAVO = 10000n;                       // 0,01 USD en micro
    return (((exacto + CENTAVO - 1n) / CENTAVO) * CENTAVO).toString();
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
   *  vista previa. Nunca se finge que una compra es real.
   *
   *  Desde el 4 de septiembre existe: POST /compras congela un precio de
   *  verdad y lib/compra.js entrega el ORIGEN. Se deja la bandera, y no se
   *  borra el camino de la vista previa, porque es lo que permite abrir esta
   *  pantalla en un entorno sin backend sin fingir que hay dinero de por
   *  medio. */
  let hayServidor = true;

  /* ── ¿HAY QUIEN ENTREGUE? ──────────────────────────────────────────────────
   *
   * Las rutas de compra del API viven siempre, pero quien entrega el ORIGEN
   * solo corre con COMPRAS=1. Con eso apagado se podía congelar un precio,
   * recibir una dirección y mandar el USDT — y no había nadie del otro lado
   * para entregar nada.
   *
   * El servidor ya se niega (lib/compra.js contesta ENTREGA_APAGADA), que es
   * la puerta de verdad. Esto es para DECIRLO A TIEMPO: enterarse después de
   * escribir el monto y elegir la red es enterarse tarde.
   *
   * `null` mientras no se sabe. Se arranca sin bloquear nada: si /salud no
   * contesta, la pantalla se comporta como siempre y el que dice que no es el
   * servidor cuando toque. Fingir aquí una puerta cerrada por no poder
   * preguntar sería tan malo como fingirla abierta. */
  let entregaAbierta = null;
  /* Las redes que la casa recibe HOY, dichas por el servidor (GET /limites).
     `null` es «todavía no se preguntó»: hasta que conteste se ofrecen las de
     la tabla, que es lo que se hacía siempre. Cuando contesta manda él — una
     red sin gas para barrer recibiría el depósito y lo dejaría quieto, y esa
     decisión no la puede tomar una pantalla. */
  let redesAbiertas = null;

  async function mirarEntrega() {
    if (!hayServidor) return;
    try {
      const r = await fetch(DATOS.API + '/salud', { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      const antes = entregaAbierta;
      entregaAbierta = d?.entrega === true;
      if (antes !== entregaAbierta) repintar();
    } catch { /* sin respuesta no se cambia nada: manda el servidor, no el silencio */ }
  }

  /* Las redes abiertas se preguntan UNA vez al entrar: no cambian solas, las
     cambia una persona con una variable. Si /limites no contesta, se quedan
     las de la tabla y el servidor igual se niega si alguien manda por una
     cerrada (RED_CERRADA) — la pantalla ayuda, la puerta es el servidor. */
  async function mirarRedes() {
    if (!hayServidor) return;
    try {
      const l = await DATOS.limites();
      if (!Array.isArray(l?.redes) || !l.redes.length) return;
      const ids = l.redes.map((x) => Number(x.id));
      redesAbiertas = REDES.filter((r) => ids.includes(r.id));
      // Si la elegida quedó cerrada, se mueve a la primera abierta: dejarla
      // marcada sería ofrecer un botón que el servidor va a rechazar.
      if (!redesAbiertas.some((r) => r.id === redElegida)) redElegida = redesAbiertas[0].id;
      repintar();
    } catch { /* se ofrecen las de siempre */ }
  }

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
    ${orden?.recalculo ? panelRecalculo() : ''}
    <div class="cp-grid">
      <div class="cp-col" id="cp-izq">${orden ? panelDireccion() : panelCalculadora()}</div>
      <div class="cp-col" id="cp-der">${panelRiel()}</div>
    </div>`;
  }

  // ── 1 · la calculadora ────────────────────────────────────────────────────

  function panelCalculadora() {
    const r = redDe(redElegida);
    const pw = precioWei();
    /* Se teclea ORIGEN, que es lo que la casa vende; el USDT es el medio de
       pago y va abajo, en su renglón. La cuenta va en la dirección del
       tecleo: del ORIGEN pedido al USDT que hay que mandar. */
    const quiere = aWei(monto);
    const micro = quiere && pw ? microDe(quiere, pw) : null;
    // Lo que de verdad se recibe: lo que compra el USDT redondeado al centavo,
    // que es igual o un pelo más que lo pedido. Jamás menos.
    const recibe = micro && pw ? origenDe(micro, pw) : null;
    const bajo = micro && Number(deMicro(micro)) < r.minimo;

    return `
    <div class="vidrio cp-caja">
      ${/* Va DENTRO de la calculadora y no en el marco de la vista: `repintar()`
            solo cambia #cp-izq, así que un cartel colgado fuera se pintaba una
            vez —con `entregaAbierta` todavía en null— y ya no cambiaba nunca.
            Aquí se repinta con el resto en cuanto /salud contesta. */ ''}
      ${entregaAbierta === false ? `<div class="cp-previa">${esc(t('cerrada'))}</div>` : ''}
      <div class="campo">
        <label for="cp-monto">${esc(t('cuanto'))}</label>
        <div class="cp-monto cp-grande">
          <input id="cp-monto" inputmode="decimal" autocomplete="off" placeholder="100"
                 value="${esc(monto)}" oninput="VCOMPRA.monto(this.value)">
          <span class="cp-mon">ORIGEN</span>
        </div>
        <div class="cp-rapidos">
          ${[20, 50, 100, 500].map((v) => `
            <button type="button" class="cp-rap${String(monto).trim() === String(v) ? ' es' : ''}"
                    onclick="VCOMPRA.monto('${v}')">${v}</button>`).join('')}
        </div>
      </div>

      <div class="campo">
        <label>${esc(t('red'))}</label>
        <div class="cp-redes" role="radiogroup">
          ${(redesAbiertas || REDES).map((x) => `
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
        <span class="cp-lbl">${esc(t('pagas'))}</span>
        <div class="cp-pagas${micro ? '' : ' vacio'}">
          ${micro
            ? `<b class="mono">${esc(deMicro(micro))} USDT</b> <span>${esc(t('porLaRed'))} ${esc(r.nombre)}</span>`
            : `<span>${esc(t('escribi'))}</span>`}
        </div>
        ${recibe ? `<div class="cp-recibes-min">${esc(t('recibisAlMenos'))} <b class="mono">${deWei(recibe, 4)}</b> ORIGEN</div>` : ''}
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

      <button class="btn btn-oro btn-full" ${(!recibe || bajo || !precio || entregaAbierta === false) ? 'disabled' : ''}
              onclick="VCOMPRA.congelar()">${esc(t('congelar'))}</button>
      <p class="cp-pie">${esc(t('plazo').replace('{min}', String(Math.round(PLAZO / 60))))}</p>
    </div>`;
  }

  // ── 1b · el recálculo ─────────────────────────────────────────────────────
  //
  // El único panel de esta pantalla que PIDE UNA DECISION, y por eso va arriba
  // de todo y ancho: si fuera una nota al pie dentro del riel, alguien con el
  // dinero ya depositado se quedaría esperando una entrega que no llega porque
  // no vio que le estaban preguntando algo.
  //
  // Enseña los dos números —el que iba a recibir y el que recibiría ahora— y
  // no dice cuál es mejor. A veces el nuevo es mayor. Empujar en cualquiera de
  // las dos direcciones sería vender, y acá no se vende: se informa.

  function panelRecalculo() {
    const rc = orden.recalculo;
    const sinOrden = /sin una orden|without an open order/i.test(orden.motivo || '');
    return `
    <div class="vidrio cp-recal">
      <div class="cp-recal-cab">
        <strong>${esc(t('recalT'))}</strong>
        <span>${esc(sinOrden ? t('recalSinOrden') : t('recalD'))}</span>
      </div>
      <div class="cp-recal-nums">
        <div class="cp-recal-n">
          <span class="cp-lbl">${esc(t('recalLlego'))}</span>
          <b class="mono">${esc(deWei(rc.cantidadUsdt, 2))} <em>USDT</em></b>
        </div>
        <div class="cp-recal-n vieja">
          <span class="cp-lbl">${esc(t('recalAntes'))}</span>
          <b class="mono">${esc(deWei(rc.cotizado, 4))}</b>
        </div>
        <div class="cp-recal-n nueva">
          <span class="cp-lbl">${esc(t('recalAhora'))}</span>
          <b class="mono">${partido(rc.origenWei)} <em>ORIGEN</em></b>
        </div>
      </div>
      <div class="cp-recal-btn">
        <button class="btn btn-oro" onclick="VCOMPRA.confirmar()">${esc(t('recalSi'))}</button>
        <button class="btn btn-linea" onclick="VCOMPRA.cancelar()">${esc(t('recalNo'))}</button>
      </div>
    </div>`;
  }

  // ── 2 · la dirección ──────────────────────────────────────────────────────

  function panelDireccion() {
    const r = redDe(orden.cadena);
    const vencida = orden.restanSeg <= 0;
    /* ¿Ya llegó el dinero? Es lo que decide si esta pantalla PIDE o ACUSA
       RECIBO. Las dos cosas a la vez no pueden estar. */
    const llego = Boolean(orden.recibidoUsdt) || orden.paso >= 2;
    return `
    <div class="vidrio cp-caja">
      <!-- PEDIR O ACUSAR RECIBO, NUNCA LAS DOS. Mientras no llega, el heroe es
           la cantidad que hay que mandar. En cuanto llegó, es la que llegó — y
           el aviso de la red se cambia por uno que dice que no mande mas.
           Dejar «Manda exactamente 100,00» arriba de un deposito que ya entro
           es como se consiguen dos depositos por una sola compra. -->
      ${llego ? `
      <div class="cp-manda llego">
        <span class="cp-lbl">${esc(t('llego'))}</span>
        <div class="cp-hero">${esc(deWei(orden.recibidoUsdt, 2))} <em>USDT</em></div>
      </div>
      <div class="cp-red-aviso quieto">
        <strong>${esc(r.nombre)}</strong>
        <span>${esc(t('noMandesMas'))}</span>
      </div>
      ` : `
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
      </div>`}

      <div class="campo">
        <label>${esc(t('dir'))} · ${esc(r.nombre)}</label>
        <!-- El boton de copiar desaparece en cuanto llegó el dinero. La
             direccion se queda —es parte del recibo y hay que poder mirarla en
             el explorador— pero un boton que dice «copiar direccion» al lado
             de un deposito ya hecho es una invitacion a hacer otro. -->
        <div class="cp-dir${copiada ? ' ok' : ''}${llego ? ' quieta' : ''}">
          <code class="mono">${esc(orden.direccion)}</code>
          ${llego ? '' : `<button class="btn btn-linea btn-sm" onclick="VCOMPRA.copiar()">
            ${esc(copiada ? t('copiado') : t('copiar'))}
          </button>`}
        </div>
        <div class="cp-qr-caja">
          <div class="cp-qr" id="cp-qr" aria-hidden="true"></div>
          <span class="cp-qr-red">${esc(r.nombre)}</span>
        </div>
      </div>

      ${llego ? '' : `
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
      </div>`}

      ${llego ? '' : `<button class="btn btn-linea btn-full btn-sm" onclick="VCOMPRA.cancelar()">${esc(t('cancelar'))}</button>`}
    </div>`;
  }

  /* El perimetro del anillo (r=32). Se reparte entre lo que queda y lo que se
     fue: el anillo da la magnitud de un vistazo y los digitos la precision. */
  const VUELTA = (2 * Math.PI * 32).toFixed(1);
  /* El plazo por omisión, en segundos. Lo MANDA el servidor (`plazoSeg` de la
     orden) y esto es solo lo que se rotula antes de que exista una: tiene que
     ser el mismo número que ORDENEX_COMPRA_PLAZO_SEG en lib/compra.js. Decir
     una hora y congelar quince minutos es la clase de mentira pequeña que
     destruye la confianza en la pantalla entera. */
  const PLAZO = 900;

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
      /* EL RENGLON 3 CAMBIA CON EL ESTADO, y no es un adorno: con la orden
         recalculada este renglon decia «entregando tu ORIGEN» justo al lado de
         un aviso que dice que nada se entrega hasta que la persona confirme.
         Una pantalla que se contradice a si misma no se lee dos veces: se
         cree la mitad que tranquiliza, que es justo la falsa. */
      orden?.estado === 'recalculada'
        ? { n: 3, t: t('rEsperandoVos'), d: t('rEsperandoVosD') }
        : orden?.estado === 'en-revision' || orden?.estado === 'en-duda'
        ? { n: 3, t: t('rRevision'), d: t('rRevisionD') }
        : { n: 3, t: t('rConfirmado'), d: t('rConfirmadoD'), chip: r.tiempo },
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
      ${orden?.hashEntrega ? `<a class="cp-link cp-link-entrega" href="${esc(ORDENSCAN + encodeURIComponent(orden.hashEntrega))}" target="_blank" rel="noopener">${esc(t('entregado'))}</a>` : ''}
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
    const pw = precioWei();
    const quiere = aWei(monto);
    const micro = quiere && pw ? microDe(quiere, pw) : null;
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
        restanSeg: PLAZO,
        plazoSeg: PLAZO,
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

  /* El ORIGEN se entrega en la 5550, no en la red del depósito: son dos hashes
     en dos cadenas distintas y mezclarlos manda a la gente a buscar al
     explorador equivocado. */
  const ORDENSCAN = 'https://ordenscan.com/tx/'; // el mismo que portafolio.js:33

  async function confirmar() {
    if (!orden?.id || !hayServidor) return;
    try {
      orden = { ...orden, ...(await DATOS.post(`/compras/${orden.id}/confirmar`, {})) };
      repintar();
      arrancarSondeo();
    } catch (e) {
      ONX.avisar(e?.message || 'No se pudo confirmar.', 'mal');
    }
  }

  /* Cancelar limpia la pantalla, y ADEMÁS avisa al servidor cuando hay una
     orden que todavía no tiene dinero encima. Sin eso, cada vez que alguien
     cambia de idea quedaría una cotización abierta esperando un depósito que
     no va a llegar. El servidor rechaza cancelar una orden con depósito —ese
     dinero ya llegó y hay que resolverlo— y ese rechazo se traga a propósito:
     acá la persona solo pidió volver a la calculadora. */
  function cancelar() {
    const id = hayServidor && orden?.id && !orden.previa ? orden.id : null;
    orden = null; monto = ''; copiada = false;
    pararReloj(); pararSondeo(); repintar();
    if (id) DATOS.post(`/compras/${id}/cancelar`, {}).catch(() => {});
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
    // Antes que nada: si no hay quien entregue, que se vea al abrir y no
    // después de llenar el formulario.
    mirarEntrega();
    mirarRedes();
    /* La referencia se vuelve a pedir cada minuto y el rotulo de frescura cada
       diez segundos. Una cotizacion quieta cinco minutos es una cotizacion
       vieja que parece viva, y esa es la clase de mentira que una casa de
       cambio no se puede permitir en la pantalla donde alguien decide. */
    clearInterval(refresco);
    refresco = setInterval(() => {
      const f = document.getElementById('cp-fresco');
      if (f) f.textContent = frescura();
      if (precio && Date.now() - precio.en.getTime() > 60_000) traerPrecio();
      // Barato y en el mismo reloj: así encender COMPRAS=1 se nota sola en la
      // pantalla de quien ya la tenía abierta, sin decirle que recargue.
      mirarEntrega();
    }, 10_000);
    if (orden) { dibujarQr(); arrancarReloj(); if (hayServidor) arrancarSondeo(); }
  }

  function apagar() { pararReloj(); pararSondeo(); clearInterval(refresco); refresco = null; }

  return {
    vista, alPintar, apagar,
    monto: setMonto, red: setRed, congelar, copiar, cancelar, confirmar, qr: dibujarQr,
    _adentro: { aMicro, origenDe, REDES, TXT, PLAZO,
      // Solo para mirar el contador en sus tres niveles sin esperar una hora.
      forzarSegundos: (n) => { if (orden) orden.restanSeg = n; },
      // Y para poder VER el panel del recálculo sin depositar de verdad y
      // esperar a que venza un plazo. Se mira, se critica y se arregla; un
      // panel que solo aparece en un caso raro es un panel que nadie revisa.
      forzarOrden: (o) => { orden = o; } },
  };
})();
