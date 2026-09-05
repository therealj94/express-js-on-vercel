/* Ordenex · vender.js — convertir ORIGEN en USDT.
 *
 * Expone `const VVENTA` con el contrato que app.js espera: { vista, alPintar,
 * apagar } más los manejadores de los onclick.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LO QUE ESTA PANTALLA TIENE GRABADO
 *
 * · EL NÚMERO GRANDE ES EL ORIGEN QUE SALE. La casa vende y compra ORIGEN;
 *   el USDT es el medio de pago y vive en la cuenta de abajo, en su tamaño.
 *   Lo que NO cambia es la regla vieja: el último renglón —lo que la casa
 *   paga— lleva la comisión ya descontada, y la comisión se ve en el suyo.
 *   Nunca se enseña un bruto donde se va a cobrar un neto: eso termina
 *   siempre en un reclamo.
 *
 * · LA DIRECCIÓN ES LO ÚNICO QUE NO SE PUEDE DESHACER. Vender es la única
 *   pantalla de esta casa donde el dinero sale hacia fuera. Una dirección mal
 *   escrita, o de la red equivocada, es dinero perdido y no hay a quién
 *   reclamarle. Por eso: el aviso de red va ARRIBA de la dirección y con el
 *   nombre de la red repetido, y el botón dice a dónde va a pagar.
 *
 * · SE VENDE LO QUE ESTÁ EN ORDENEX, NO LO QUE ESTÁ EN LA WALLET. Es la
 *   confusión garantizada: alguien tiene ORIGEN en su Veta Wallet, entra acá y
 *   no ve saldo. La pantalla lo dice con su dirección de depósito delante, en
 *   vez de enseñar un cero que parece un error.
 *
 * · LO QUE QUEDA EN DUDA SE DICE ASÍ, Y SE PIDE NO REPETIR. Si el pago se
 *   firmó y la respuesta no llegó, repetir es cobrar dos veces. El mensaje lo
 *   dice con esas palabras.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * EL DINERO
 *
 * El ORIGEN va en wei (×10^18) y el USDT en canónico de 18 —lo mismo que usa
 * el servidor por dentro— los dos operados con BigInt. Un float con plata
 * dentro no entra a este archivo.
 *
 * La `ventaKey` se genera UNA vez por intento y se guarda: si la respuesta se
 * pierde y la persona toca de nuevo, la misma clave devuelve la misma venta en
 * vez de pagar dos veces. Esa es la mitad de la defensa; la otra está en el
 * índice único del servidor.
 */

const VVENTA = (() => {
  'use strict';

  const esc = (s) => ONX.esc(s);
  // `DATOS` es el global de datos.js, igual que en comprar.js. No se copia a
  // una constante local: reasignarlo no tendria sentido y una copia esconde de
  // donde sale.
  const DIECIOCHO = 10n ** 18n;

  let saldoWei = null;          // lo que hay en Ordenex, en wei
  let direccionDeposito = null;
  let cantidad = '';            // lo que escribió la persona, en ORIGEN
  let red = 56;                 // BSC por omisión: es la que está abierta
  let redesAbiertas = [];
  let destino = '';
  let cotiza = null;            // { brutoCanonico, comisionCanonico, netoCanonico, … }
  let ventaKey = null;
  let trabajando = false;
  let resultado = null;         // { ok, id, hash, explorador, neto } o { error, codigo }
  let abierta = null;           // /salud → venta
  let capacidad = null;         // GET /ventas/limites → el techo de la caja
  let tCotiza = null;

  const REDES = {
    56: { nombre: 'BNB Smart Chain', corto: 'BSC', aviso: 'BEP-20' },
    137: { nombre: 'Polygon', corto: 'Polygon', aviso: 'Polygon PoS' },
    1: { nombre: 'Ethereum', corto: 'Ethereum', aviso: 'ERC-20' },
  };
  const redDe = (id) => REDES[id] || { nombre: String(id), corto: String(id), aviso: '' };

  // ── números ───────────────────────────────────────────────────────────────

  /** «12,5» → wei. Null si no es un número. Sin floats: se parte por la coma. */
  function aWei(txt) {
    const s = String(txt == null ? '' : txt).trim().replace(',', '.');
    if (!s || !/^\d*\.?\d*$/.test(s)) return null;
    const [ent, dec = ''] = s.split('.');
    if (!ent && !dec) return null;
    const d = (dec + '000000000000000000').slice(0, 18);
    const v = BigInt(ent || '0') * DIECIOCHO + BigInt(d || '0');
    return v > 0n ? v.toString() : null;
  }

  /** wei → «12,5». `max` decimales, sin ceros de relleno al final. */
  function deWei(wei, max = 6) {
    if (wei == null) return '—';
    const v = BigInt(wei);
    const ent = (v / DIECIOCHO).toString();
    let dec = (v % DIECIOCHO).toString().padStart(18, '0').slice(0, max).replace(/0+$/, '');
    const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return dec ? `${miles}.${dec}` : miles;
  }

  // ── datos ─────────────────────────────────────────────────────────────────

  async function traerSaldo() {
    try {
      const p = await DATOS.portafolio();
      direccionDeposito = p.direccionDeposito || null;
      const c = (p.cuentas || []).find((x) => x.activo === 'ORIGEN');
      saldoWei = c ? String(c.disponible) : '0';
    } catch {
      saldoWei = null;
    }
  }

  async function traerLimites() {
    try {
      const l = await DATOS.limites();
      redesAbiertas = (l.redes || []).map((r) => Number(r.id)).filter((id) => REDES[id]);
      if (redesAbiertas.length && !redesAbiertas.includes(red)) red = redesAbiertas[0];
    } catch {
      redesAbiertas = [];
    }
  }

  /* EL TECHO, ANTES DE ESCRIBIR NADA.
   *
   * Lo que se puede vender no lo decide el saldo de quien vende sino la caja
   * de la casa: si hay 10 USDT, no hay forma de pagar veinte. Hasta hoy eso se
   * descubría con un SIN_CAJA DESPUÉS de escribir la cantidad, elegir la red y
   * pegar la dirección — el peor momento para enterarse. `GET /ventas/limites`
   * lo publica, sale de la misma cuenta que hace la venta de verdad (caja
   * menos lo en vuelo menos el apartado) y se vuelve a leer con cada
   * cotización: la caja baja con cada venta de cualquiera. */
  async function traerCapacidad() {
    try { capacidad = await DATOS.get('/ventas/limites'); } catch { capacidad = null; }
  }
  function techoWei() {
    const r = (capacidad?.redes || []).find((x) => Number(x.id) === red);
    if (!r?.maxOrigenWei) return null;
    try { return BigInt(r.maxOrigenWei); } catch { return null; }
  }

  async function traerSalud() {
    try {
      const r = await fetch(DATOS.API + '/salud', { signal: AbortSignal.timeout(8000) });
      abierta = (await r.json()).venta === true;
    } catch {
      abierta = null;   // no se sabe: no se finge ni abierta ni cerrada
    }
  }

  /** La cotización, con freno: se pide 400 ms después de dejar de escribir. */
  function cotizarPronto() {
    clearTimeout(tCotiza);
    const wei = aWei(cantidad);
    if (!wei) { cotiza = null; return repintar(); }
    tCotiza = setTimeout(async () => {
      const pedido = wei;
      traerCapacidad().then(() => { if (aWei(cantidad) === pedido) repintar(); });
      try {
        const c = await DATOS.post('/ventas/cotizar', { origenWei: pedido, red });
        if (aWei(cantidad) === pedido) { cotiza = c; repintar(); }
      } catch (e) {
        cotiza = { error: e?.message || 'No se pudo cotizar.' };
        repintar();
      }
    }, 400);
  }

  // ── la vista ──────────────────────────────────────────────────────────────

  function vista() {
    return `
    <div class="cab">
      <div>
        <h2>Vender ORIGEN</h2>
        <p class="cab-sub">Vendé el ORIGEN que tenés en Ordenex y recibí USDT en la dirección que digas.</p>
      </div>
    </div>
    <div class="cp-grid">
      <div class="cp-col" id="vn-izq">${panel()}</div>
      <div class="cp-col" id="vn-der">${panelLado()}</div>
    </div>`;
  }

  function panel() {
    if (resultado) return panelResultado();
    const wei = aWei(cantidad);
    const sinSaldo = saldoWei !== null && BigInt(saldoWei) === 0n;
    const pasa = wei && saldoWei !== null && BigInt(wei) <= BigInt(saldoWei);
    const techo = techoWei();
    const cabe = !(wei && techo !== null && BigInt(wei) > techo);
    const r = redDe(red);
    const listo = Boolean(pasa && cabe && cotiza && !cotiza.error && destino && !trabajando && abierta !== false);

    return `
    <div class="vidrio cp-caja">
      ${abierta === false ? '<div class="cp-previa">La venta está cerrada en este momento. No vas a poder confirmar.</div>' : ''}

      <div class="campo">
        <label for="vn-cant">¿Cuánto ORIGEN querés vender?</label>
        <div class="cp-monto cp-grande">
          <input id="vn-cant" inputmode="decimal" autocomplete="off" placeholder="0"
                 value="${esc(cantidad)}" oninput="VVENTA.cantidad(this.value)">
          <span class="cp-mon">ORIGEN</span>
        </div>
        <div class="vn-saldo">
          ${saldoWei === null
            ? 'No pude leer tu saldo.'
            : `Tenés <b>${deWei(saldoWei)}</b> ORIGEN en Ordenex` }
          ${saldoWei && BigInt(saldoWei) > 0n
            ? ` · <button type="button" class="vn-todo" onclick="VVENTA.todo()">vender todo</button>` : ''}
        </div>
        ${sinSaldo ? `
          <div class="vn-nota">
            Acá se vende lo que está <b>en Ordenex</b>, no lo que tenés en tu Veta Wallet.
            ${direccionDeposito ? `Para traerlo, mandá ORIGEN a tu dirección de depósito:<br><code class="vn-dir">${esc(direccionDeposito)}</code>` : ''}
          </div>` : ''}
        ${saldoWei && BigInt(saldoWei) > 0n ? `
          <div class="vn-pct" role="group">
            ${[25, 50, 75, 100].map((n) => `<button type="button" onclick="VVENTA.parte(${n})">${n} %</button>`).join('')}
          </div>` : ''}
        ${wei && !pasa && saldoWei !== null ? '<div class="vn-mal">No tenés tanto ORIGEN disponible.</div>' : ''}
        ${pasa && !cabe ? `<div class="vn-mal">La casa no puede pagar tanto ahora mismo: el máximo es ${deWei(techo, 4)} ORIGEN.</div>` : ''}
      </div>

      <div class="campo">
        <label>¿En qué red te pagamos?</label>
        <div class="vn-redes">
          ${(redesAbiertas.length ? redesAbiertas : [56]).map((id) => `
            <button type="button" class="vn-red${id === red ? ' es' : ''}" onclick="VVENTA.red(${id})">
              <b>${esc(redDe(id).corto)}</b><span>${esc(redDe(id).aviso)}</span>
            </button>`).join('')}
        </div>
      </div>

      <div class="campo">
        <div class="vn-alerta">
          La dirección tiene que ser de <b>${esc(r.nombre)}</b> (${esc(r.aviso)}).
          Si mandás a otra red, el dinero no llega y no se puede recuperar.
        </div>
        <label for="vn-dir">¿A qué dirección te lo pagamos?</label>
        <input id="vn-dir" class="vn-input" autocomplete="off" spellcheck="false" placeholder="0x…"
               value="${esc(destino)}" oninput="VVENTA.destino(this.value)">
      </div>

      ${techo !== null ? `
      <div class="vn-techo">
        <span>Máximo que la casa puede pagar ahora</span>
        <b class="mono">${deWei(techo, 4)} ORIGEN</b>
        <small>Es lo que hay en la caja de salidas. Para vender más, hacelo en dos veces o esperá a que se reponga.</small>
      </div>` : ''}

      ${cotiza && !cotiza.error ? `
      <div class="vn-cuenta">
        <div class="vn-fila"><span>Vendés</span><b>${deWei(cotiza.origenWei)} ORIGEN</b></div>
        <div class="vn-fila"><span>Precio</span><b>${deWei(cotiza.precioWei, 6)} USD por ORIGEN</b></div>
        <div class="vn-fila"><span>Bruto</span><b>${deWei(cotiza.brutoCanonico, 6)} USDT</b></div>
        <div class="vn-fila vn-com"><span>Comisión de salida (${(cotiza.comisionPpm / 10000).toFixed(2)} %)</span><b>− ${deWei(cotiza.comisionCanonico, 6)} USDT</b></div>
        <div class="vn-fila vn-neto"><span>Te pagamos</span><b>${deWei(cotiza.netoCanonico, 6)} USDT</b></div>
      </div>` : cotiza?.error ? `<div class="vn-mal">${esc(cotiza.error)}</div>` : ''}

      <button class="btn btn-oro vn-btn" ${listo ? '' : 'disabled'} onclick="VVENTA.vender()">
        ${trabajando ? 'Pagando…'
          : cotiza && !cotiza.error && destino
            ? `Vender ${deWei(cotiza.origenWei, 4)} ORIGEN`
            : 'Vender'}
      </button>
      <p class="vn-pie">El precio se toma en el momento de confirmar. El pago sale enseguida y te dejamos el comprobante.</p>
    </div>`;
  }

  function panelResultado() {
    if (resultado.ok) {
      return `
      <div class="vidrio cp-caja vn-ok">
        <div class="vn-tick">✓</div>
        <h3>Pagado</h3>
        <p>Te mandamos <b>${deWei(resultado.neto, 6)} USDT</b> por ${esc(redDe(resultado.red).nombre)} a</p>
        <code class="vn-dir">${esc(resultado.direccion)}</code>
        ${resultado.explorador
          ? `<p><a class="btn btn-linea" href="${esc(resultado.explorador)}" target="_blank" rel="noopener">Ver la transacción</a></p>`
          : resultado.hash ? `<code class="vn-dir">${esc(resultado.hash)}</code>` : ''}
        <button class="btn btn-linea" onclick="VVENTA.otra()">Vender de nuevo</button>
      </div>`;
    }
    const enDuda = resultado.codigo === 'EN_DUDA';
    return `
    <div class="vidrio cp-caja">
      <h3>${enDuda ? 'El pago quedó en duda' : 'No se pudo vender'}</h3>
      <p class="vn-mal">${esc(resultado.error)}</p>
      ${enDuda
        ? '<p class="vn-nota">No lo repitas: si salió, lo vas a ver en tu billetera. Ya lo está mirando una persona de la casa.</p>'
        : '<p class="vn-nota">Tu ORIGEN sigue en tu cuenta.</p>'}
      <button class="btn btn-linea" onclick="VVENTA.otra()">Volver</button>
    </div>`;
  }

  function panelLado() {
    return `
    <div class="vidrio cp-caja vn-lado">
      <h3>Cómo funciona</h3>
      <ol class="vn-pasos">
        <li><b>Tu ORIGEN sale de Ordenex.</b> Se descuenta de tu saldo en el momento de confirmar.</li>
        <li><b>La casa te paga el USDT.</b> Sale de la caja de Ordenex hacia la dirección que pusiste.</li>
        <li><b>Te queda el comprobante.</b> Con su enlace al explorador de la red.</li>
      </ol>
      <h3>Antes de confirmar</h3>
      <ul class="vn-pasos">
        <li>La dirección tiene que ser tuya y de la red elegida.</li>
        <li>El precio sale de la referencia del oro, la misma que usa la compra.</li>
        <li>La comisión de salida ya está descontada de lo que te pagamos.</li>
      </ul>
      <p class="vn-pie">ORIGEN está referenciado al oro. Una referencia no es una promesa de valor.</p>
    </div>`;
  }

  function repintar() {
    const i = document.getElementById('vn-izq');
    if (i) i.innerHTML = panel();
  }

  // ── manejadores ───────────────────────────────────────────────────────────

  function cantidadCambia(v) { cantidad = v; cotizarPronto(); repintar(); }
  function todo() { parte(100); }
  /* Una parte del saldo. Se trunca hacia abajo —jamás se ofrece un wei que no
     se tiene— y se escribe con los dieciocho decimales para que «100 %» sea
     exactamente el saldo y no un redondeo que deje polvo sin vender. */
  function parte(pct) {
    if (saldoWei === null) return;
    const n = BigInt(Math.max(1, Math.min(100, Number(pct) || 0)));
    cantidad = deWei(((BigInt(saldoWei) * n) / 100n).toString(), 18);
    cotizarPronto(); repintar();
  }
  function redCambia(id) { red = Number(id); cotizarPronto(); repintar(); }   // el techo es por red
  function destinoCambia(v) { destino = String(v || '').trim(); repintar(); }
  function otra() { resultado = null; ventaKey = null; cantidad = ''; cotiza = null; traerSaldo().then(repintar); repintar(); }

  async function vender() {
    const wei = aWei(cantidad);
    if (!wei || !destino || trabajando) return;
    trabajando = true; repintar();
    // La clave se genera UNA vez y sobrevive a un reintento: es lo que hace
    // que tocar dos veces no pague dos veces.
    ventaKey = ventaKey || `v-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    try {
      const v = await DATOS.post('/ventas', { origenWei: wei, red, direccion: destino, ventaKey });
      resultado = { ok: true, id: v.id, hash: v.hash, explorador: v.explorador,
                    neto: v.netoCanonico, red: v.red, direccion: v.direccion };
      await traerSaldo();
    } catch (e) {
      resultado = { ok: false, error: e?.message || 'No se pudo completar la venta.', codigo: e?.codigo || 'ERROR' };
    } finally {
      trabajando = false;
      repintar();
    }
  }

  async function alPintar() {
    await Promise.all([traerSaldo(), traerLimites(), traerSalud(), traerCapacidad()]);
    repintar();
  }

  function apagar() { clearTimeout(tCotiza); }

  return {
    vista, alPintar, apagar,
    cantidad: cantidadCambia, todo, parte, red: redCambia, destino: destinoCambia, vender, otra,
    _adentro: { aWei, deWei },
  };
})();
