/* Ordenex · convertir.js — ORIGEN ⇄ USDT en UNA pantalla.
 *
 * Expone `const VCONVERTIR` con el contrato que app.js espera: { vista,
 * alPintar, apagar } más los manejadores de los onclick.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE
 *
 * La casa tenía «Comprar» y «Vender» como dos salas distintas, con dos
 * calculadoras que no se parecían: una pedía USDT y enseñaba ORIGEN, la otra
 * pedía ORIGEN y enseñaba USDT, y ninguna dejaba escribir del otro lado. Un
 * exchange lo resuelve con una sola pantalla —Convertir— con dos cajas: lo
 * que das y lo que recibís, una flecha que les da la vuelta, y que se pueda
 * escribir en CUALQUIERA de las dos. Esta es esa pantalla.
 *
 * Es una CALCULADORA, no una caja registradora: acá no nace ninguna orden.
 * «Continuar» lleva a la sala que ya sabe hacer cada cosa —comprar.js congela
 * el precio y espera el depósito; vender.js pide la dirección y paga— con los
 * números ya puestos. Esas dos salas siguen siendo la confirmación y la
 * ejecución, y no se tocan: son las que tienen grabadas las lecciones del
 * dinero que sale.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LAS CUENTAS, Y DE DÓNDE SALEN
 *
 * · Comprar: la misma función que usa comprar.js (VCOMPRA._adentro.origenDe),
 *   sobre el mismo precio de referencia (/mercados). Un número distinto acá y
 *   allá sería una cotización que cambia al pasar de sala.
 * · Vender: el neto por ORIGEN que publica GET /ventas/limites —precio menos
 *   la comisión de salida, del mismo sitio que la cobra— y el TECHO de lo que
 *   la caja puede pagar ahora. Ese techo se dice antes de escribir: un
 *   exchange no deja descubrir el máximo con un error después.
 * · La dirección contraria (escribir lo que se quiere RECIBIR) es la misma
 *   cuenta al revés, con el resultado marcado «≈»: la sala de destino vuelve
 *   a cotizar con el dato exacto antes de mover nada.
 *
 * Todo en BigInt sobre wei y micro-dólares. Un float con plata no entra.
 */

const VCONVERTIR = (() => {
  'use strict';

  const esc = (s) => ONX.esc(s);
  const U = 10n ** 18n;
  const MICRO = 10n ** 6n;

  const TXT = {
    es: {
      t: 'Convertir', sub: 'ORIGEN por USDT y USDT por ORIGEN, al precio de referencia del oro. Sin libro: la casa es la contraparte.',
      das: 'Das', recibis: 'Recibís', aprox: 'aproximado: la sala siguiente cotiza el número exacto',
      girar: 'Dar la vuelta', saldo: 'Tenés', enOrdenex: 'en Ordenex', max: 'máx',
      red: 'Red del USDT', techo: 'Máximo que la casa puede pagar ahora',
      techoNota: 'Es lo que hay en la caja de salidas. Si necesitás vender más, hacelo en dos veces o esperá a que se reponga.',
      precio: '1 ORIGEN =', oro: 'oro a', laOnza: 'la onza', leido: 'leído hace', s: 's',
      comCompra: 'Comisión de compra', comVenta: 'Comisión de salida', yaDesc: 'ya descontada del número grande',
      cont: 'Continuar', contCompra: 'Continuar: congelar este precio', contVenta: 'Continuar: elegir dónde recibir el USDT',
      sinSesion: 'Para convertir entrá con tu cuenta de Veta Wallet.', entrar: 'Entrar con mi cuenta Veta Wallet',
      cerradaCompra: 'La compra con USDT está cerrada en este momento.', cerradaVenta: 'La venta por USDT está cerrada en este momento.',
      sinRef: 'Sin precio de referencia ahora mismo.', cargando: 'Buscando el precio del oro…',
      minRed: 'mínimo', escribi: 'Escribí un monto',
      pasa: 'No tenés tanto ORIGEN en Ordenex.', pasaTecho: 'Supera lo que la casa puede pagar ahora.',
      bajoMin: 'Por debajo del mínimo de la red', comoT: 'Cómo funciona',
      comoCompra: ['Congelás el precio 15 minutos y te damos una dirección.', 'Mandás el USDT por la red que elegiste.', 'Al confirmarse, el ORIGEN llega a tu Veta Wallet.'],
      comoVenta: ['Decís a qué dirección de la red querés el USDT.', 'El ORIGEN sale de tu saldo en Ordenex al confirmar.', 'La casa paga y te deja el comprobante.'],
      tarifasT: 'Tarifas', tarifaLibro: 'Libro de órdenes', tarifaCompra: 'Compra con USDT', tarifaVenta: 'Venta por USDT',
      refNota: 'ORIGEN está referenciado al oro. Una referencia no es una promesa de valor.',
      soloOrdenex: 'Se vende lo que está en Ordenex, no lo que tenés en la Veta Wallet. Para traerlo, depositá desde Portafolio.',
    },
    en: {
      t: 'Convert', sub: 'ORIGEN for USDT and USDT for ORIGEN at the gold reference price. No order book: the house is the counterparty.',
      das: 'You give', recibis: 'You receive', aprox: 'approximate: the next screen quotes the exact figure',
      girar: 'Flip', saldo: 'You have', enOrdenex: 'in Ordenex', max: 'max',
      red: 'USDT network', techo: 'Maximum the house can pay right now',
      techoNota: 'That is what the payout box holds. To sell more, do it in two goes or wait for it to be topped up.',
      precio: '1 ORIGEN =', oro: 'gold at', laOnza: 'per ounce', leido: 'read', s: 's ago',
      comCompra: 'Purchase fee', comVenta: 'Exit fee', yaDesc: 'already deducted from the big number',
      cont: 'Continue', contCompra: 'Continue: lock this price', contVenta: 'Continue: choose where to receive USDT',
      sinSesion: 'Sign in with your Veta Wallet account to convert.', entrar: 'Sign in with Veta Wallet',
      cerradaCompra: 'Buying with USDT is closed right now.', cerradaVenta: 'Selling for USDT is closed right now.',
      sinRef: 'No reference price right now.', cargando: 'Fetching the gold price…',
      minRed: 'minimum', escribi: 'Enter an amount',
      pasa: "You don't have that much ORIGEN in Ordenex.", pasaTecho: 'Above what the house can pay right now.',
      bajoMin: 'Below the network minimum', comoT: 'How it works',
      comoCompra: ['Lock the price for 15 minutes and get an address.', 'Send the USDT on the network you chose.', 'Once confirmed, ORIGEN lands in your Veta Wallet.'],
      comoVenta: ['Tell us the network address where you want the USDT.', 'ORIGEN leaves your Ordenex balance when you confirm.', 'The house pays and leaves you the receipt.'],
      tarifasT: 'Fees', tarifaLibro: 'Order book', tarifaCompra: 'Buy with USDT', tarifaVenta: 'Sell for USDT',
      refNota: 'ORIGEN is referenced to gold. A reference is not a promise of value.',
      soloOrdenex: 'You sell what is in Ordenex, not what sits in your Veta Wallet. Deposit from Portfolio to bring it in.',
    },
  };
  const idioma = () => (document.documentElement.lang === 'en' ? 'en' : 'es');
  const t = (k) => TXT[idioma()][k] ?? k;

  // ── estado ────────────────────────────────────────────────────────────────
  let sentido = 'compra';        // 'compra' USDT→ORIGEN · 'venta' ORIGEN→USDT
  let usdt = '';                 // lo escrito, en USDT
  let origen = '';               // lo escrito, en ORIGEN
  let editado = 'usdt';          // cuál de las dos cajas escribió la persona
  let red = 56;
  let precio = null;             // { usd, oro, en }
  let precioIntentado = false;
  let limites = null;            // GET /limites  → redes abiertas para comprar
  let capacidad = null;          // GET /ventas/limites → techo y neto por ORIGEN
  let salud = null;              // { entrega, venta }
  let saldoWei = null;           // ORIGEN en Ordenex
  let tarifaLibro = null;        // { comisionPpm }
  let refresco = null;

  const REDES = { 56: { nombre: 'BNB Smart Chain', tiempo: '~1 min' }, 137: { nombre: 'Polygon', tiempo: '~2 min' }, 1: { nombre: 'Ethereum', tiempo: '13–25 min' } };

  // ── números ───────────────────────────────────────────────────────────────
  function aEntero(txt, decimales) {
    const s = String(txt == null ? '' : txt).trim().replace(',', '.');
    if (!s || !/^\d*\.?\d*$/.test(s)) return null;
    const [ent, dec = ''] = s.split('.');
    if (!ent && !dec) return null;
    const d = (dec + '0'.repeat(decimales)).slice(0, decimales);
    const v = BigInt(ent || '0') * 10n ** BigInt(decimales) + BigInt(d || '0');
    return v > 0n ? v : null;
  }
  const aWei = (x) => aEntero(x, 18);
  const aMicro = (x) => aEntero(x, 6);
  function de(v, decimales, max) {
    if (v == null) return '';
    const b = BigInt(v), base = 10n ** BigInt(decimales);
    const ent = (b / base).toString();
    const dec = (b % base).toString().padStart(decimales, '0').slice(0, max).replace(/0+$/, '');
    return dec ? `${ent}.${dec}` : ent;
  }
  const conMiles = (s) => String(s).replace(/^(\d+)/, (m) => m.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
  const precioWei = () => (precio ? BigInt(Math.round(precio.usd * 1e6)) * 10n ** 12n : null);
  const netoPorOrigen = () => (capacidad?.netoPorOrigen ? BigInt(capacidad.netoPorOrigen) : null);
  const techoWei = () => { const r = (capacidad?.redes || []).find((x) => Number(x.id) === red); return r?.maxOrigenWei ? BigInt(r.maxOrigenWei) : null; };

  /** La cuenta entera, en las dos direcciones y del lado que se escribió.
   *  Devuelve { dasWei|dasMicro, recibeWei|recibeMicro, aprox } o null. */
  function cuenta() {
    const pw = precioWei();
    if (sentido === 'compra') {
      if (!pw) return null;
      const origenDe = VCOMPRA?._adentro?.origenDe;
      if (editado === 'usdt') {
        const micro = aMicro(usdt); if (!micro) return null;
        const wei = origenDe ? origenDe(micro.toString(), pw.toString()) : ((micro * 10n ** 30n) / pw).toString();
        return { micro, wei: BigInt(wei), aprox: false };
      }
      const wei = aWei(origen); if (!wei) return null;
      // Al revés: cuánto USDT hace falta para ese ORIGEN, redondeado hacia
      // arriba al micro —quedarse corto es recibir menos de lo que se pidió.
      const micro = (wei * pw + 10n ** 30n - 1n) / 10n ** 30n;
      return { micro, wei, aprox: true };
    }
    const neto = netoPorOrigen();
    if (!neto) return null;
    if (editado === 'origen') {
      const wei = aWei(origen); if (!wei) return null;
      return { wei, canonico: (wei * neto) / U, aprox: false };
    }
    const quiere = aEntero(usdt, 18); if (!quiere) return null;
    const wei = (quiere * U + neto - 1n) / neto;
    return { wei, canonico: quiere, aprox: true };
  }

  // ── datos ─────────────────────────────────────────────────────────────────
  async function traerPrecio() {
    try {
      const lista = await DATOS.mercados();
      const m = (Array.isArray(lista) ? lista : []).find((x) => x?.referencia?.origenUsd);
      const usd = Number(m?.referencia?.origenUsd), oro = Number(m?.referencia?.usd);
      if (Number.isFinite(usd) && usd > 0) precio = { usd, oro: Number.isFinite(oro) ? oro : null, en: Date.now() };
    } catch { /* se queda el último bueno */ }
    precioIntentado = true;
  }
  async function traerLimites() {
    try { limites = await DATOS.limites(); } catch { limites = null; }
    const abiertas = (limites?.redes || []).map((r) => Number(r.id)).filter((id) => REDES[id]);
    if (abiertas.length && !abiertas.includes(red)) red = abiertas[0];
  }
  async function traerCapacidad() {
    try { capacidad = await DATOS.get('/ventas/limites'); } catch { capacidad = null; }
  }
  async function traerSalud() {
    try {
      const r = await fetch(DATOS.API + '/salud', { signal: AbortSignal.timeout(8000) });
      const j = await r.json(); salud = { entrega: j.entrega === true, venta: j.venta === true };
    } catch { salud = null; }
  }
  async function traerSaldo() {
    if (!DATOS.haySesion()) { saldoWei = null; return; }
    try {
      const p = await DATOS.portafolio();
      const c = (p.cuentas || []).find((x) => x.activo === 'ORIGEN');
      saldoWei = c ? BigInt(c.disponible) : 0n;
    } catch { saldoWei = null; }
  }
  async function traerTarifa() { try { tarifaLibro = await DATOS.tarifas(); } catch { tarifaLibro = null; } }

  // ── la vista ──────────────────────────────────────────────────────────────
  function vista() {
    return `
    <div class="cab"><div><h2>${esc(t('t'))}</h2><p class="cab-sub">${esc(t('sub'))}</p></div></div>
    <div class="cp-grid">
      <div class="cp-col" id="cv-izq">${panel()}</div>
      <div class="cp-col" id="cv-der">${lado()}</div>
    </div>`;
  }

  const pct = (ppm) => (Number(ppm) / 10000).toFixed(2).replace(/\.?0+$/, '') + ' %';

  function panel() {
    const compra = sentido === 'compra';
    const c = cuenta();
    const r = REDES[red] || { nombre: String(red), tiempo: '' };
    const abiertas = (limites?.redes || []).filter((x) => REDES[Number(x.id)]);
    const minUsd = Number(abiertas.find((x) => Number(x.id) === red)?.minimoUsd || 0);
    const cerrada = salud && (compra ? !salud.entrega : !salud.venta);
    const techo = techoWei();

    // Lo que hay que decirle a la persona antes de dejarla seguir.
    let traba = null;
    if (c) {
      if (compra && minUsd && c.micro < BigInt(Math.round(minUsd * 1e6))) traba = `${t('bajoMin')}: $${minUsd}`;
      if (!compra && saldoWei != null && c.wei > saldoWei) traba = t('pasa');
      if (!compra && techo != null && c.wei > techo) traba = t('pasaTecho');
    }
    const listo = Boolean(c && !traba && !cerrada && DATOS.haySesion());

    const dasVal = compra ? (editado === 'usdt' ? usdt : (c ? de(c.micro, 6, 2) : '')) : (editado === 'origen' ? origen : (c ? de(c.wei, 18, 6) : ''));
    const recVal = compra ? (editado === 'origen' ? origen : (c ? de(c.wei, 18, 6) : '')) : (editado === 'usdt' ? usdt : (c ? de(c.canonico, 18, 2) : ''));

    return `
    <div class="vidrio cp-caja cv-caja">
      ${cerrada ? `<div class="cp-previa">${esc(compra ? t('cerradaCompra') : t('cerradaVenta'))}</div>` : ''}

      <div class="cv-lado">
        <div class="cv-et"><span>${esc(t('das'))}</span>
          ${!compra && saldoWei != null ? `<button type="button" class="cv-max" onclick="VCONVERTIR.max()">${esc(t('saldo'))} <b class="mono">${esc(conMiles(de(saldoWei, 18, 4)))}</b> ORIGEN ${esc(t('enOrdenex'))} · ${esc(t('max'))}</button>` : ''}
        </div>
        <div class="cv-campo">
          <input id="cv-das" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="0"
                 value="${esc(dasVal)}" oninput="VCONVERTIR.das(this.value)">
          <span class="cv-mon">${compra ? 'USDT' : 'ORIGEN'}</span>
        </div>
        <div class="cp-rapidos">
          ${compra
            ? [50, 100, 500, 1000].map((v) => `<button type="button" class="cp-rap${editado === 'usdt' && usdt === String(v) ? ' es' : ''}" onclick="VCONVERTIR.das('${v}')">${v}</button>`).join('')
            : [25, 50, 75, 100].map((p) => `<button type="button" class="cp-rap" onclick="VCONVERTIR.parte(${p})">${p} %</button>`).join('')}
        </div>
      </div>

      <button type="button" class="cv-girar" onclick="VCONVERTIR.girar()" title="${esc(t('girar'))}" aria-label="${esc(t('girar'))}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v13M7 17l-3-3M7 17l3-3M17 20V7M17 7l-3 3M17 7l3 3"/></svg>
      </button>

      <div class="cv-lado">
        <div class="cv-et"><span>${esc(t('recibis'))}</span>${c?.aprox ? `<em>≈ ${esc(t('aprox'))}</em>` : ''}</div>
        <div class="cv-campo">
          <input id="cv-rec" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="0"
                 value="${esc(recVal)}" oninput="VCONVERTIR.recibe(this.value)">
          <span class="cv-mon">${compra ? 'ORIGEN' : 'USDT'}</span>
        </div>
      </div>

      <div class="cv-precio">
        ${precio
          ? `<span>${esc(t('precio'))} <b class="mono">$${precio.usd.toFixed(4)}</b> · ${esc(t('oro'))} <b class="mono">$${precio.oro ? precio.oro.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</b> ${esc(t('laOnza'))}</span>
             <span class="cv-fresco" id="cv-fresco">${esc(frescura())}</span>`
          : `<span class="${precioIntentado ? 'cp-sinref' : 'cp-cargando'}">${esc(precioIntentado ? t('sinRef') : t('cargando'))}</span>`}
      </div>
      <div class="cv-com">
        ${compra
          ? `<span>${esc(t('comCompra'))}: <b>0 %</b></span>`
          : `<span>${esc(t('comVenta'))}: <b>${capacidad ? esc(pct(capacidad.comisionPpm)) : '—'}</b> · ${esc(t('yaDesc'))}</span>`}
      </div>

      <div class="campo cv-red">
        <label>${esc(t('red'))}</label>
        <div class="vn-redes">
          ${(abiertas.length ? abiertas : [{ id: 56, minimoUsd: 2 }]).map((x) => {
            const id = Number(x.id), rr = REDES[id];
            return `<button type="button" class="vn-red${id === red ? ' es' : ''}" onclick="VCONVERTIR.red(${id})">
              <b>${esc(rr.nombre)}</b><span>${esc(rr.tiempo)}${compra && x.minimoUsd ? ` · ${esc(t('minRed'))} $${esc(String(x.minimoUsd))}` : ''}</span>
            </button>`;
          }).join('')}
        </div>
      </div>

      ${!compra && techo != null ? `
      <div class="cv-techo">
        <span>${esc(t('techo'))}</span>
        <b class="mono">${esc(conMiles(de(techo, 18, 4)))} ORIGEN</b>
        <small>${esc(t('techoNota'))}</small>
      </div>` : ''}

      ${traba ? `<div class="vn-mal">${esc(traba)}</div>` : ''}
      ${!compra && saldoWei === 0n ? `<div class="vn-nota">${esc(t('soloOrdenex'))}</div>` : ''}

      ${DATOS.haySesion()
        ? `<button class="btn btn-oro btn-full cv-btn" ${listo ? '' : 'disabled'} onclick="VCONVERTIR.continuar()">${esc(compra ? t('contCompra') : t('contVenta'))}</button>`
        : `<p class="vn-nota">${esc(t('sinSesion'))}</p><button class="btn btn-oro btn-full" onclick="ONX.entrar()">${esc(t('entrar'))}</button>`}
    </div>`;
  }

  function lado() {
    const compra = sentido === 'compra';
    const pasos = compra ? t('comoCompra') : t('comoVenta');
    const libro = tarifaLibro && Number.isInteger(tarifaLibro.comisionPpm) ? pct(tarifaLibro.comisionPpm) : '—';
    return `
    <div class="vidrio cp-caja vn-lado">
      <h3>${esc(t('comoT'))}</h3>
      <ol class="vn-pasos">${pasos.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>
      <h3>${esc(t('tarifasT'))}</h3>
      <div class="cv-tarifas">
        <div><span>${esc(t('tarifaLibro'))}</span><b class="mono">${esc(libro)}</b></div>
        <div><span>${esc(t('tarifaCompra'))}</span><b class="mono">0 %</b></div>
        <div><span>${esc(t('tarifaVenta'))}</span><b class="mono">${capacidad ? esc(pct(capacidad.comisionPpm)) : '—'}</b></div>
      </div>
      <p class="vn-pie">${esc(t('refNota'))}</p>
    </div>`;
  }

  function frescura() {
    if (!precio) return '';
    return `${t('leido')} ${Math.max(0, Math.round((Date.now() - precio.en) / 1000))} ${t('s')}`;
  }

  /** Solo se repinta lo que cambia, sin robarle el foco al campo que se
   *  está tecleando: el mismo cuidado que comprar.js. */
  function repintar() {
    const izq = document.getElementById('cv-izq'), der = document.getElementById('cv-der');
    if (!izq) return;
    const foco = document.activeElement?.id;
    const pos = foco && /^cv-(das|rec)$/.test(foco) ? document.getElementById(foco).selectionStart : null;
    izq.innerHTML = panel();
    if (der) der.innerHTML = lado();
    if (foco && /^cv-(das|rec)$/.test(foco)) {
      const c = document.getElementById(foco);
      if (c) { c.focus(); if (pos != null) try { c.setSelectionRange(pos, pos); } catch {} }
    }
  }

  // ── manejadores ───────────────────────────────────────────────────────────
  function das(v) { if (sentido === 'compra') { usdt = v; editado = 'usdt'; } else { origen = v; editado = 'origen'; } repintar(); }
  function recibe(v) { if (sentido === 'compra') { origen = v; editado = 'origen'; } else { usdt = v; editado = 'usdt'; } repintar(); }
  function girar() {
    sentido = sentido === 'compra' ? 'venta' : 'compra';
    // Lo escrito se conserva del lado que corresponde: si daba USDT y pasa a
    // vender, lo que quiere RECIBIR es ese USDT.
    editado = editado === 'usdt' ? 'usdt' : 'origen';
    repintar();
  }
  function parte(p) {
    if (saldoWei == null) return;
    origen = de((saldoWei * BigInt(p)) / 100n, 18, 18); editado = 'origen'; repintar();
  }
  function max() { parte(100); }
  function redCambia(id) { red = Number(id); repintar(); }

  /** A la sala que ejecuta, con los números puestos. */
  function continuar() {
    const c = cuenta();
    if (!c) return;
    if (sentido === 'compra') {
      VCOMPRA.red(red);
      VCOMPRA.monto(de(c.micro, 6, 2));
      ONX.vista('comprar');
    } else {
      VVENTA.red(red);
      VVENTA.cantidad(de(c.wei, 18, 18));
      ONX.vista('vender');
    }
  }

  async function alPintar() {
    await Promise.all([traerPrecio(), traerLimites(), traerCapacidad(), traerSalud(), traerSaldo(), traerTarifa()]);
    repintar();
    clearInterval(refresco);
    refresco = setInterval(async () => {
      const f = document.getElementById('cv-fresco');
      if (f) f.textContent = frescura();
      if (!precio || Date.now() - precio.en > 60_000) { await traerPrecio(); repintar(); }
      // El techo cambia con cada venta de cualquiera: se vuelve a leer.
      if (sentido === 'venta') { await traerCapacidad(); repintar(); }
    }, 15_000);
  }
  function apagar() { clearInterval(refresco); refresco = null; }

  return {
    vista, alPintar, apagar,
    das, recibe, girar, parte, max, red: redCambia, continuar,
    _adentro: { cuenta, aWei, aMicro, de, sentidoActual: () => sentido, poner: (s) => { sentido = s; } },
  };
})();
