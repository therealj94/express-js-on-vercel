/* Ordenex · recargar.js — cargarle saldo a la tarjeta de débito.
 *
 * Expone `const VRECARGA` con el mismo contrato que las demás salas:
 * { vista, alPintar, apagar } más los manejadores de los onclick.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUÉ ES UNA SALA APARTE Y NO UN BOTÓN DENTRO DE VENDER
 *
 * Por dentro es la misma operación —sale ORIGEN, entra USDT—, y por eso el
 * primer intento fue meterlo en Vender como un destino más que se ofrecía. No
 * sirve, y José lo cortó el mismo día: quien entra a Vender está decidiendo A
 * DÓNDE mandar su dinero, y ahí la libertad de elegir red y dirección es el
 * punto. Quien entra a Recargar ya decidió: va a su tarjeta, en Polygon, a la
 * dirección que le dio el emisor. Ahí la libertad no ayuda, estorba — cada
 * campo editable es una forma más de mandar el dinero a donde no hay nadie.
 *
 * Entonces son dos salas con dos leyes opuestas, y mezclarlas obligaba a que
 * una de las dos mintiera:
 *
 *   VENDER   → la red se elige, la dirección se escribe. Sigue igual que
 *              estaba; esta sala no le tocó una línea.
 *   RECARGAR → la red es Polygon y NO se puede cambiar; la dirección es la de
 *              la tarjeta de quien está mirando y NO se puede escribir.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LO QUE ESTA PANTALLA TIENE GRABADO
 *
 * · LA DIRECCIÓN NO SE TECLEA NUNCA. Son cuarenta y dos caracteres; una letra
 *   cambiada y el USDT se va a una dirección que no existe para nadie y no hay
 *   a quién reclamarle. Acá sale puesta, se enseña entera para que se pueda
 *   comparar con la del emisor, y no hay campo donde escribirla.
 *
 * · LA RED ES POLYGON Y SE DICE, NO SE ELIGE. La tarjeta se recarga en Polygon
 *   porque así la entrega CryptoMate. Un selector de redes acá sería ofrecer
 *   tres formas de perder el dinero y una de acertar.
 *
 * · SI POLYGON NO ESTÁ ABIERTA, SE DICE ANTES. La casa tiene sus redes de
 *   salida en un interruptor. Con Polygon cerrada esto no puede pagar, y
 *   enterarse después de escribir el monto es el peor momento. Se avisa
 *   arriba y el botón no se puede tocar.
 *
 * · SIN TARJETA NO ES UN ERROR. Mucha gente todavía no tiene. Se explica con
 *   calma y se dice dónde se pide, en vez de enseñar un fallo rojo.
 *
 * · EL NÚMERO GRANDE ES EL ORIGEN QUE SALE; ABAJO, LO QUE CAE EN LA TARJETA.
 *   La comisión se ve en su renglón y ya está descontada del último. Nunca se
 *   enseña un bruto donde se va a acreditar un neto.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * EL DINERO
 *
 * Se paga por `POST /ventas`, que es la MISMA puerta que usa Vender: una sola
 * ruta que mueve dinero, un solo sitio donde está el freno de la caja, la
 * comisión y el índice único contra el pago doble. Lo único que pone esta sala
 * es la red (137) y la dirección (la de la tarjeta) — y las pone ella, no la
 * persona.
 *
 * Las cuentas se hacen con BigInt, en wei para el ORIGEN y en canónico de 18
 * para el USDT. `aWei`/`deWei` salen de VVENTA._adentro a propósito: son las
 * mismas de la venta porque es el mismo dinero, y dos copias de una regla de
 * dinero es la casa diciendo una cifra y cobrando otra. Por eso vender.js va
 * ANTES que este archivo en index.html, y hay una prueba que lo vigila.
 */

const VRECARGA = (() => {
  'use strict';

  const esc = (s) => ONX.esc(s);
  const { aWei, deWei } = VVENTA._adentro;

  const POLYGON = 137;

  let saldoWei = null;          // ORIGEN en Ordenex, en wei
  let direccionDeposito = null;
  let tarjeta = null;           // null = sin preguntar; { tiene, … } = ya se sabe
  let cantidad = '';
  let redesAbiertas = [];
  let cotiza = null;
  let ventaKey = null;
  let trabajando = false;
  let resultado = null;
  let abierta = null;           // /salud → venta
  let capacidad = null;
  let tCotiza = null;

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

  /* La tarjeta de quien está mirando. La dirección de recarga la sabe la
     billetera —ahí vive la llave de CryptoMate— y Ordenex se la pregunta con
     la sesión de la persona; nunca con una dirección que venga del cliente. */
  async function traerTarjeta() {
    try { tarjeta = await DATOS.get('/ventas/tarjeta'); }
    catch (e) { tarjeta = { tiene: false, porQue: e?.message || 'no se pudo preguntar ahora mismo' }; }
  }

  async function traerLimites() {
    try {
      const l = await DATOS.limites();
      redesAbiertas = (l.redes || []).map((r) => Number(r.id));
    } catch {
      redesAbiertas = [];
    }
  }
  /* `null` mientras no se sabe: con la lista vacía por no haber podido
     preguntar, dar por cerrada la red sería inventar un motivo. */
  const polygonAbierta = () => (redesAbiertas.length ? redesAbiertas.includes(POLYGON) : null);

  async function traerCapacidad() {
    try { capacidad = await DATOS.get('/ventas/limites'); } catch { capacidad = null; }
  }
  function techoWei() {
    const r = (capacidad?.redes || []).find((x) => Number(x.id) === POLYGON);
    if (!r?.maxOrigenWei) return null;
    try { return BigInt(r.maxOrigenWei); } catch { return null; }
  }

  async function traerSalud() {
    try {
      const r = await fetch(DATOS.API + '/salud', { signal: AbortSignal.timeout(8000) });
      abierta = (await r.json()).venta === true;
    } catch {
      abierta = null;
    }
  }

  function cotizarPronto() {
    clearTimeout(tCotiza);
    const wei = aWei(cantidad);
    if (!wei) { cotiza = null; return repintar(); }
    tCotiza = setTimeout(async () => {
      const pedido = wei;
      traerCapacidad().then(() => { if (aWei(cantidad) === pedido) repintar(); });
      try {
        const c = await DATOS.post('/ventas/cotizar', { origenWei: pedido, red: POLYGON });
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
        <h2>Recargar mi tarjeta</h2>
        <p class="cab-sub">Convertí el ORIGEN que tenés en Ordenex en saldo de tu tarjeta de débito.</p>
      </div>
    </div>
    <div class="cp-grid">
      <div class="cp-col" id="rc-izq">${panel()}</div>
      <div class="cp-col" id="rc-der">${panelLado()}</div>
    </div>`;
  }

  /* LA TARJETA, PUESTA Y CERRADA CON CANDADO.
     Los tres estados se ven distinto a propósito: mientras se pregunta no se
     enseña una tarjeta que a lo mejor no existe, y «no tenés» se explica en
     vez de fallar. */
  function bloqueTarjeta() {
    if (tarjeta === null) {
      return '<div class="rc-tarjeta rc-tarjeta-esp">Buscando tu tarjeta…</div>';
    }
    if (!tarjeta.tiene) {
      return `
      <div class="rc-tarjeta rc-tarjeta-no">
        <div>
          <b>Todavía no hay una tarjeta a tu nombre</b>
          ${tarjeta.porQue ? `<small>${esc(tarjeta.porQue)}</small>` : ''}
          <small>La tarjeta se pide desde tu Veta Wallet. Cuando esté, esta pantalla la va a encontrar sola.</small>
        </div>
      </div>`;
    }
    return `
    <div class="rc-tarjeta">
      <div class="rc-t-fila">
        <span>Tarjeta</span>
        <b>···· ${esc(tarjeta.last4 || '····')}</b>
      </div>
      ${tarjeta.titular ? `
      <div class="rc-t-fila">
        <span>A nombre de</span>
        <b>${esc(tarjeta.titular)}</b>
      </div>` : ''}
      <div class="rc-t-fila">
        <span>Red</span>
        <b class="rc-fijo">Polygon <em>fija</em></b>
      </div>
      <div class="rc-t-dir">
        <span>Se acredita en</span>
        <code>${esc(tarjeta.direccion)}</code>
        <small>Es la dirección que da el emisor de tu tarjeta. No se escribe a mano y no se puede cambiar.</small>
      </div>
    </div>`;
  }

  function panel() {
    if (resultado) return panelResultado();

    const hayTarjeta = Boolean(tarjeta && tarjeta.tiene);
    const wei = aWei(cantidad);
    const sinSaldo = saldoWei !== null && BigInt(saldoWei) === 0n;
    const pasa = wei && saldoWei !== null && BigInt(wei) <= BigInt(saldoWei);
    const techo = techoWei();
    const cabe = !(wei && techo !== null && BigInt(wei) > techo);
    const abiertaPolygon = polygonAbierta();
    const listo = Boolean(hayTarjeta && pasa && cabe && cotiza && !cotiza.error
      && !trabajando && abierta !== false && abiertaPolygon !== false);

    return `
    <div class="vidrio cp-caja">
      ${abierta === false ? '<div class="cp-previa">La venta está cerrada en este momento. No vas a poder confirmar.</div>' : ''}
      ${abiertaPolygon === false ? `
        <div class="vn-alerta">
          Ahora mismo la casa no está pagando por <b>Polygon</b>, que es la red de tu tarjeta.
          No se puede recargar hasta que se abra. Tu ORIGEN sigue donde está.
        </div>` : ''}

      ${bloqueTarjeta()}

      <div class="campo">
        <label for="rc-cant">¿Cuánto ORIGEN querés pasar a la tarjeta?</label>
        <div class="cp-monto cp-grande">
          <input id="rc-cant" inputmode="decimal" autocomplete="off" placeholder="0"
                 value="${esc(cantidad)}" oninput="VRECARGA.cantidad(this.value)">
          <span class="cp-mon">ORIGEN</span>
        </div>
        <div class="vn-saldo">
          ${saldoWei === null
            ? 'No pude leer tu saldo.'
            : `Tenés <b>${deWei(saldoWei)}</b> ORIGEN en Ordenex`}
          ${saldoWei && BigInt(saldoWei) > 0n
            ? ` · <button type="button" class="vn-todo" onclick="VRECARGA.todo()">pasar todo</button>` : ''}
        </div>
        ${sinSaldo ? `
          <div class="vn-nota">
            Acá se pasa lo que está <b>en Ordenex</b>, no lo que tenés en tu Veta Wallet.
            ${direccionDeposito ? `Para traerlo, mandá ORIGEN a tu dirección de depósito:<br><code class="vn-dir">${esc(direccionDeposito)}</code>` : ''}
          </div>` : ''}
        ${saldoWei && BigInt(saldoWei) > 0n ? `
          <div class="vn-pct" role="group">
            ${[25, 50, 75, 100].map((n) => `<button type="button" onclick="VRECARGA.parte(${n})">${n} %</button>`).join('')}
          </div>` : ''}
        ${wei && !pasa && saldoWei !== null ? '<div class="vn-mal">No tenés tanto ORIGEN disponible.</div>' : ''}
        ${pasa && !cabe ? `<div class="vn-mal">La casa no puede pagar tanto ahora mismo: el máximo es ${deWei(techo, 4)} ORIGEN.</div>` : ''}
      </div>

      ${techo !== null ? `
      <div class="vn-techo">
        <span>Máximo que la casa puede pagar ahora</span>
        <b class="mono">${deWei(techo, 4)} ORIGEN</b>
        <small>Es lo que hay en la caja de salidas. Para recargar más, hacelo en dos veces o esperá a que se reponga.</small>
      </div>` : ''}

      ${cotiza && !cotiza.error ? `
      <div class="vn-cuenta">
        <div class="vn-fila"><span>Sale de Ordenex</span><b>${deWei(cotiza.origenWei)} ORIGEN</b></div>
        <div class="vn-fila"><span>Precio</span><b>${deWei(cotiza.precioWei, 6)} USD por ORIGEN</b></div>
        <div class="vn-fila"><span>Bruto</span><b>${deWei(cotiza.brutoCanonico, 6)} USD</b></div>
        <div class="vn-fila vn-com"><span>Comisión de salida (${(cotiza.comisionPpm / 10000).toFixed(2)} %)</span><b>− ${deWei(cotiza.comisionCanonico, 6)} USD</b></div>
        <div class="vn-recibe"><span>Cae en tu tarjeta</span><b>${deWei(cotiza.netoCanonico, 2)} USD</b></div>
      </div>` : cotiza?.error ? `<div class="vn-mal">${esc(cotiza.error)}</div>` : ''}

      <button class="btn btn-oro vn-btn" ${listo ? '' : 'disabled'} onclick="VRECARGA.recargar()">
        ${trabajando ? 'Recargando…'
          : listo ? `Recargar ···· ${esc(tarjeta.last4 || '····')} con ${deWei(cotiza.netoCanonico, 2)} USD`
          : 'Recargar la tarjeta'}
      </button>
      <p class="vn-pie">El precio se toma en el momento de confirmar. El emisor suele tardar unos minutos en enseñar el saldo nuevo.</p>
    </div>`;
  }

  function panelResultado() {
    if (resultado.ok) {
      return `
      <div class="vidrio cp-caja vn-ok">
        <div class="vn-tick">✓</div>
        <h3>Recarga enviada</h3>
        <p>Mandamos <b>${deWei(resultado.neto, 2)} USD</b> a tu tarjeta ···· ${esc(resultado.last4 || '····')} por Polygon.</p>
        <code class="vn-dir">${esc(resultado.direccion)}</code>
        <p class="vn-nota">El emisor lo acredita en unos minutos. En tu Veta Wallet el saldo de la tarjeta se ve en ORIGEN.</p>
        ${resultado.explorador
          ? `<p><a class="btn btn-linea" href="${esc(resultado.explorador)}" target="_blank" rel="noopener">Ver la transacción</a></p>`
          : resultado.hash ? `<code class="vn-dir">${esc(resultado.hash)}</code>` : ''}
        <button class="btn btn-linea" onclick="VRECARGA.otra()">Recargar de nuevo</button>
      </div>`;
    }
    const enDuda = resultado.codigo === 'EN_DUDA';
    return `
    <div class="vidrio cp-caja">
      <h3>${enDuda ? 'La recarga quedó en duda' : 'No se pudo recargar'}</h3>
      <p class="vn-mal">${esc(resultado.error)}</p>
      ${enDuda
        ? '<p class="vn-nota">No lo repitas: si salió, lo vas a ver en tu tarjeta. Ya lo está mirando una persona de la casa.</p>'
        : '<p class="vn-nota">Tu ORIGEN sigue en tu cuenta.</p>'}
      <button class="btn btn-linea" onclick="VRECARGA.otra()">Volver</button>
    </div>`;
  }

  function panelLado() {
    return `
    <div class="vidrio cp-caja vn-lado">
      <h3>Cómo funciona</h3>
      <ol class="vn-pasos">
        <li><b>Tu ORIGEN sale de Ordenex.</b> Se descuenta de tu saldo al confirmar.</li>
        <li><b>La casa manda el saldo a tu tarjeta.</b> Va por Polygon a la dirección que da el emisor.</li>
        <li><b>Gastás con la tarjeta.</b> Y el movimiento aparece en tu Veta Wallet, en ORIGEN.</li>
      </ol>
      <h3>Lo que no se puede cambiar acá</h3>
      <ul class="vn-pasos">
        <li>La red es <b>Polygon</b>: es la que usa el emisor de la tarjeta.</li>
        <li>La dirección es la de <b>tu</b> tarjeta y sale puesta. No se teclea.</li>
        <li>Si querés cobrar en otra dirección o en otra red, eso es <b>Vender</b>.</li>
      </ul>
      <p class="vn-pie">ORIGEN está referenciado al oro. Una referencia no es una promesa de valor.</p>
    </div>`;
  }

  /* El campo no se pierde al repintar — la sala se repinta en cada tecla y
     otra vez cuando vuelve la cotización 400 ms después. Sin esto, escribir
     «12,5» es escribir «1» y quedarse sin campo. */
  function repintar() {
    const i = document.getElementById('rc-izq');
    if (!i) return;
    const act = document.activeElement;
    const id = act && act.id === 'rc-cant' ? act.id : null;
    let ini = null, fin = null;
    if (id) { try { ini = act.selectionStart; fin = act.selectionEnd; } catch { /* algunos tipos no lo dan */ } }
    i.innerHTML = panel();
    if (!id) return;
    const nuevo = document.getElementById(id);
    if (!nuevo) return;
    nuevo.focus({ preventScroll: true });
    if (ini != null) {
      const tope = nuevo.value.length;
      try { nuevo.setSelectionRange(Math.min(ini, tope), Math.min(fin ?? ini, tope)); } catch { /* idem */ }
    }
  }

  // ── manejadores ───────────────────────────────────────────────────────────

  function cantidadCambia(v) { cantidad = v; cotizarPronto(); repintar(); }
  function todo() { parte(100); }
  function parte(pct) {
    if (saldoWei === null) return;
    const n = BigInt(Math.max(1, Math.min(100, Number(pct) || 0)));
    cantidad = deWei(((BigInt(saldoWei) * n) / 100n).toString(), 18);
    cotizarPronto(); repintar();
  }
  function otra() { resultado = null; ventaKey = null; cantidad = ''; cotiza = null; traerSaldo().then(repintar); repintar(); }

  async function recargar() {
    const wei = aWei(cantidad);
    /* La dirección se lee de `tarjeta` en el momento de pagar y no de un
       campo: no hay campo. Si por lo que sea no está, no se paga — mandar a
       una dirección vacía o vieja es dinero que no vuelve. */
    const destino = tarjeta && tarjeta.tiene ? String(tarjeta.direccion || '') : '';
    if (!wei || !/^0x[0-9a-fA-F]{40}$/.test(destino) || trabajando) return;
    trabajando = true; repintar();
    ventaKey = ventaKey || `r-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    try {
      const v = await DATOS.post('/ventas', { origenWei: wei, red: POLYGON, direccion: destino, ventaKey });
      resultado = { ok: true, id: v.id, hash: v.hash, explorador: v.explorador,
                    neto: v.netoCanonico, direccion: v.direccion, last4: tarjeta.last4 };
      await traerSaldo();
    } catch (e) {
      // Los términos no son un error de la recarga: son un paso que falta. La
      // ventaKey NO se toca, así que reintentar no puede cobrar dos veces.
      if (e?.codigo === 'TERMINOS_NO_ACEPTADOS' && typeof ONX.pedirTerminos === 'function') {
        trabajando = false; repintar();
        return ONX.pedirTerminos(() => recargar());
      }
      resultado = { ok: false, error: e?.message || 'No se pudo completar la recarga.', codigo: e?.codigo || 'ERROR' };
    } finally {
      trabajando = false;
      repintar();
    }
  }

  async function alPintar() {
    /* SE ENTRA SIEMPRE EN LIMPIO.
       El comprobante vive en el estado del módulo, y el módulo no se muere al
       salir de la sala. Sin esto, quien recarga, se va al portafolio y vuelve
       se encuentra el recibo de hace un rato como si acabara de pasar —y a
       los dos minutos no se sabe si esa recarga es la de ahora o la de antes.
       El comprobante viejo tiene su sitio: Actividad. */
    resultado = null; ventaKey = null; cantidad = ''; cotiza = null;
    await Promise.all([traerSaldo(), traerTarjeta(), traerLimites(), traerSalud(), traerCapacidad()]);
    repintar();
  }

  function apagar() { clearTimeout(tCotiza); }

  return {
    vista, alPintar, apagar,
    cantidad: cantidadCambia, todo, parte, recargar, otra,
    _adentro: { polygonAbierta, bloqueTarjeta },
  };
})();
