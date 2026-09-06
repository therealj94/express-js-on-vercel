/* LA CAJA DE ORDENEX: qué hay en las billeteras de la casa, ahora mismo.
 *
 * ── POR QUÉ EXISTE, CON SUS PALABRAS ────────────────────────────────────────
 * «Poder actualizar las billeteras que usamos de Ordenex: cuánto es el saldo,
 * poder actualizar con un botón o diciéndole a ULTRON que lo actualice, para
 * saber cómo está tanto ORIGEN, USDT, comisiones para enviar y transacciones.»
 *
 * Hasta hoy esto se miraba entrando al panel de administración de Ordenex con
 * una llave a mano. Dos consecuencias: se miraba poco, y cuando se miraba ya
 * era tarde. La caja que paga las ventas se quedó una vez con diez dólares y
 * nadie lo supo hasta que una venta falló.
 *
 * ── LAS CUATRO COSAS QUE IMPORTAN ───────────────────────────────────────────
 *   LA CALIENTE   la que ENTREGA ORIGEN a quien compra. Si se queda sin
 *                 inventario, las compras se caen de una en una y en silencio.
 *   LA PAGADORA   la que PAGA los USDT de una venta, por red. Lo mismo del
 *                 otro lado del mostrador.
 *   EL GAS        ninguna de las dos puede mover nada sin gas en su red. Se
 *                 mide en OPERACIONES QUE QUEDAN y no en monedas: «0.0004 BNB»
 *                 no le dice nada a nadie, «alcanza para 12 ventas» sí.
 *   LA COMISIÓN   lo que la casa lleva ganado. Vive solo en el libro, así que
 *                 si no sale en un panel no lo mira nadie.
 *
 * ── LO QUE NO HACE ──────────────────────────────────────────────────────────
 * Solo LEE. No mueve un céntimo, no enciende ni apaga la compra ni la venta, y
 * no toca una variable. La llave de administración de Ordenex sale de la
 * bóveda, se usa para una petición y no se devuelve nunca hacia la pantalla.
 */

const boveda = require('./boveda');

const API = () => (process.env.ORDENEX_API || 'https://ordenex-api-ba4b27b8b51a.herokuapp.com').replace(/\/+$/, '');

/* Un número de la cadena viene en «wei»: dieciocho ceros de más. Se pasa a algo
   que una persona pueda leer sin contar ceros con el dedo. */
function deWei(wei, decimales = 4) {
  try {
    const n = BigInt(String(wei || '0'));
    const ent = n / (10n ** 18n);
    const resto = (n % (10n ** 18n)).toString().padStart(18, '0').slice(0, decimales).replace(/0+$/, '');
    return resto ? `${ent}.${resto}` : String(ent);
  } catch { return null; }
}

const numero = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null; };

/** La llave de administración de Ordenex, de la bóveda o del entorno. */
async function conLlave(fn) {
  const suelta = (process.env.ORDENEX_ADMIN_KEY || '').trim();
  if (suelta) return fn(suelta);
  try { return await boveda.usar('ORDENEX_API__ORDENEX_ADMIN_KEY', fn); }
  catch (e) {
    if (e.codigo === 'NO_EXISTE' || e.codigo === 'BOVEDA_APAGADA') {
      /* El nombre que se busca es el de la bóveda, con el prefijo de la casa;
         se dice cuál para que se pueda guardar sin adivinar. */
      throw Object.assign(new Error('No hay llave de administración de Ordenex: guarde ORDENEX_API__ORDENEX_ADMIN_KEY en la bóveda desde AJUSTES → LA BÓVEDA.'), { codigo: 'SIN_LLAVE_ORDENEX' });
    }
    throw e;
  }
}

/**
 * La caja, leída ahora. Nunca inventa un cero: si una lectura de cadena no
 * llegó, ese saldo va en `null` con su motivo. Un panel que pinta ceros cuando
 * el nodo está caído es un panel que un día jura que la caja está vacía.
 */
async function leer() {
  return conLlave(async (llave) => {
    const r = await fetch(`${API()}/admin/estado`, {
      headers: { 'X-Admin-Key': llave, Accept: 'application/json' },
      signal: AbortSignal.timeout(25_000),
    });
    if (r.status === 401 || r.status === 403) {
      throw Object.assign(new Error('Ordenex rechaza la llave de administración (401). Está vencida o es de otra instalación: se cambia y se vuelve a guardar en la bóveda.'), { codigo: 'LLAVE_ORDENEX', http: r.status });
    }
    if (!r.ok) throw Object.assign(new Error(`Ordenex contestó ${r.status} al pedir el estado de la caja.`), { codigo: 'ORDENEX', http: r.status });
    const d = await r.json();

    /* ── LA CALIENTE: la que entrega ORIGEN ── */
    const caliente = {
      direccion: d.caliente?.direccion || null,
      ok: !!d.caliente?.ok,
      error: d.caliente?.error || null,
      saldos: (d.caliente?.saldos || []).map((s) => ({ simbolo: s.simbolo, cantidad: deWei(s.wei) })),
    };

    /* ── LA PAGADORA: los USDT de las ventas, por red ── */
    const pagadora = Object.entries(d.venta?.caja || {}).map(([id, c]) => ({
      red: c.red || id,
      usdt: c.error ? null : numero(c.usdt),
      /* «En vuelo» es lo ya comprometido y todavía sin salir: sin restarlo, un
         saldo con buena cara puede estar entero prometido a otra persona. */
      enVuelo: c.error ? null : numero(c.enVuelo),
      gasNativo: c.error ? null : numero(c.gas?.nativo),
      ventasQueQuedan: c.error ? null : (c.gas?.ventasQueQuedan ?? null),
      alcanza: c.error ? null : (c.gas?.alcanza ?? null),
      error: c.error || null,
    }));

    /* ── EL GAS DEL BARRIDO, por red ── */
    const gas = Array.isArray(d.gasPorRed) ? d.gasPorRed.map((g) => ({
      red: g.nombre || g.red,
      ok: !!g.ok,
      saldo: numero(g.saldo),
      barridosQueQuedan: g.barridosQueQuedan ?? null,
      nivel: g.nivel || null,
    })) : [];

    /* ── LA COMISIÓN: lo que lleva ganado la casa ── */
    const comision = d.casa?.error ? { error: d.casa.error } : {
      saldos: (d.casa?.saldos || []).map((c) => ({ activo: c.activo, cantidad: numero(c.disponible) })),
      deRetiros: d.casa?.deRetiros ?? null,
      ppm: d.casa?.ppm ?? null,
    };

    /* ── LAS TRANSACCIONES EN PIE ── */
    const movimiento = {
      usuarios: d.usuarios ?? null,
      ordenesAbiertas: d.ordenesAbiertas ?? null,
      retirosPendientes: d.retirosPendientes ?? null,
      retirosEnRevision: d.retirosEnRevision ?? null,
      comprasPorPagar: d.entrada?.compras?.porPagar?.error ? null : (d.entrada?.compras?.porPagar ?? null),
      compraEncendida: d.entrada?.compras?.encendido ?? null,
      ventaEncendida: d.venta?.encendida ?? null,
    };

    return { ok: true, cuando: new Date().toISOString(), caliente, pagadora, gas, comision, movimiento, faltan: d.faltan || [] };
  });
}

/* ── LO MISMO, DICHO ──────────────────────────────────────────────────────────
   Para cuando José se lo pide hablando en vez de tocar el botón. Se dice lo que
   HAY y lo que FALTA; nada de adjetivos. Un saldo que no se pudo leer se dice
   «no leído», nunca cero. */
function contar(c) {
  const l = [`La caja de Ordenex, leída ahora (${new Date(c.cuando).toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa' })}):`];

  if (c.caliente.ok) {
    const conAlgo = c.caliente.saldos.filter((s) => s.cantidad && s.cantidad !== '0');
    l.push(`- La caliente (entrega ORIGEN), ${c.caliente.direccion}: ${conAlgo.length ? conAlgo.map((s) => `${s.cantidad} ${s.simbolo}`).join(', ') : 'vacía'}.`);
  } else l.push(`- La caliente: no se pudo leer (${c.caliente.error || 'sin motivo'}).`);

  for (const p of c.pagadora) {
    if (p.error) { l.push(`- La pagadora en ${p.red}: no se pudo leer (${p.error}).`); continue; }
    l.push(`- La pagadora en ${p.red}: ${p.usdt} USDT${p.enVuelo ? ` (${p.enVuelo} comprometidos)` : ''}`
      + `, gas para ${p.ventasQueQuedan ?? '?'} ventas${p.alcanza === false ? ' — NO ALCANZA' : ''}.`);
  }

  for (const g of c.gas) {
    if (!g.ok) { l.push(`- El gas del barrido en ${g.red}: no se pudo leer.`); continue; }
    l.push(`- El gas del barrido en ${g.red}: ${g.saldo}, alcanza para ${g.barridosQueQuedan ?? '?'} barridos (${g.nivel}).`);
  }

  if (c.comision.error) l.push(`- La comisión: no se pudo leer (${c.comision.error}).`);
  else {
    const s = c.comision.saldos.filter((x) => x.cantidad);
    l.push(`- La comisión ganada: ${s.length ? s.map((x) => `${x.cantidad} ${x.activo}`).join(', ') : 'nada todavía'}`
      + `${c.comision.deRetiros ? `, de ${c.comision.deRetiros} retiros` : ''}.`);
  }

  const m = c.movimiento;
  l.push(`- En pie: ${m.ordenesAbiertas ?? '?'} órdenes abiertas, ${m.retirosPendientes ?? '?'} retiros pendientes`
    + `${m.retirosEnRevision ? `, ${m.retirosEnRevision} EN REVISIÓN` : ''}. Compra ${m.compraEncendida ? 'encendida' : 'apagada'}, venta ${m.ventaEncendida ? 'encendida' : 'apagada'}.`);

  if (c.faltan.length) l.push(`- Sin configurar en Ordenex: ${c.faltan.join(', ')}.`);
  return l.join('\n');
}

module.exports = { leer, contar, _adentro: { deWei, API } };
