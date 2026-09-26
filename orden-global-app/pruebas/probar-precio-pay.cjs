/* EL PRECIO CON EL QUE PAY CONVIERTE DINERO TIENE EDAD.
 *
 *   node pruebas/probar-precio-pay.cjs
 *
 * Cobrar convierte lempiras a ORIGEN (lo que firma el cliente) con el precio
 * del ORIGEN. Ese precio salía de la cuenta guardada en el teléfono, que no
 * tenía hora: un comercio que abría Cobrar sin pasar por Inicio —o que se
 * quedaba ahí toda la mañana— cobraba con el oro de hace horas o días, sin
 * guion ni aviso. El plan SFSP v0.3 (C5, tarea 0.5) fija la regla para las
 * apps: edad máxima de 10 minutos y guion sin dato.
 *
 * cambio.js importa React: se carga con un React falso (solo useState y
 * useEffect, que aquí no se llaman) mediante los ganchos de módulos de Node.
 */
const fs = require('fs');
const path = require('path');
const { registerHooks } = require('node:module');
const { pathToFileURL } = require('node:url');

const raiz = path.join(__dirname, '..');
const leer = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

registerHooks({
  resolve(pedido, ctx, sig) {
    if (pedido === 'react') return { url: 'falso:react', shortCircuit: true };
    return sig(pedido, ctx);
  },
  load(url, ctx, sig) {
    if (url === 'falso:react') {
      return { format: 'module', source: 'export function useState(v){return [v,()=>{}]} export function useEffect(){}', shortCircuit: true };
    }
    return sig(url, ctx);
  },
});

let pasan = 0;
const fallos = [];
const prueba = (nombre, cond, detalle = '') => {
  if (cond) { pasan += 1; return; }
  fallos.push(nombre + (detalle ? `  (${detalle})` : ''));
};

(async () => {
  const C = await import(pathToFileURL(path.join(raiz, 'src/og/cambio.js')).href);
  const AHORA = Date.UTC(2026, 8, 26, 11, 30);
  const MIN = 60_000;
  const cuenta = (priceUsd, priceAt) => ({ balances: [{ symbol: 'ORIGEN', qty: 100, priceUsd, priceAt }] });

  // ── la edad ─────────────────────────────────────────────────────────────
  prueba('un precio de hace 2 minutos vale', C.precioOrigenDe(cuenta(2.41, AHORA - 2 * MIN), AHORA) === 2.41);
  prueba('uno de hace 2 h y media (el de las 9:00 a las 11:30) no vale',
    C.precioOrigenDe(cuenta(2.41, AHORA - 150 * MIN), AHORA) === null);
  prueba('el límite es 10 minutos', C.precioOrigenDe(cuenta(2.41, AHORA - 10 * MIN), AHORA) === null
    && C.precioOrigenDe(cuenta(2.41, AHORA - 10 * MIN + 1000), AHORA) === 2.41);
  prueba('una cuenta guardada sin hora no se da por fresca', C.precioOrigenDe(cuenta(2.41, undefined), AHORA) === null);
  prueba('sin precio sigue siendo null', C.precioOrigenDe(cuenta(null, AHORA), AHORA) === null);
  prueba('un precio 0 sigue siendo null', C.precioOrigenDe(cuenta(0, AHORA), AHORA) === null);

  // ── la relectura en vivo ────────────────────────────────────────────────
  const vieja = cuenta(2.41, AHORA - 150 * MIN);
  prueba('con la cuenta vieja, manda la lectura en vivo',
    C.precioOrigenVigente(vieja, { usd: 2.44, en: AHORA - MIN }, AHORA) === 2.44);
  prueba('de dos vigentes, el más fresco',
    C.precioOrigenVigente(cuenta(2.41, AHORA - 5 * MIN), { usd: 2.44, en: AHORA - MIN }, AHORA) === 2.44
    && C.precioOrigenVigente(cuenta(2.41, AHORA - MIN), { usd: 2.44, en: AHORA - 5 * MIN }, AHORA) === 2.41);
  prueba('si los dos son viejos, null',
    C.precioOrigenVigente(vieja, { usd: 2.44, en: AHORA - 11 * MIN }, AHORA) === null);
  prueba('sin lectura en vivo, el de la cuenta si es vigente',
    C.precioOrigenVigente(cuenta(2.41, AHORA - MIN), null, AHORA) === 2.41);

  // ── de dónde sale la hora ───────────────────────────────────────────────
  const api = leer('src/api.js');
  prueba('el portafolio sella la hora de cada precio (priceAt)', /priceAt: priceUsd != null && priceUsd > 0 \? priceAt : null/.test(api));

  // ── las pantallas ───────────────────────────────────────────────────────
  for (const p of ['CobroPay', 'PagarPay', 'PanelPay', 'NegocioPanel']) {
    const src = leer(`src/og/pay/${p}.js`);
    prueba(`${p} usa el precio vigente y releído`, /usePrecioOrigen\(account\)/.test(src) && !/precioOrigenDe\(account\)/.test(src));
  }
  const cobro = leer('src/og/pay/CobroPay.js');
  prueba('Cobrar fija el ORIGEN y el precio al salir de la factura: el QR no cambia con la relectura',
    /setFijo\(\{ subtotal, precio \}\)/.test(cobro) && /const subtotal = fijo \? fijo\.subtotal :/.test(cobro)
    && /const precio = fijo \? fijo\.precio : precioVivo/.test(cobro));
  prueba('volver a la factura suelta lo fijado', /const volverAFactura = \(\) => \{[^}]*setFijo\(null\)/.test(cobro));
  prueba('lo tecleado en lempiras no se relee como ORIGEN si el precio caduca',
    /if \(!puedeHnl && !leyendoPrecio && moneda === 'HNL' && !monto\) setMoneda\('ORIGEN'\)/.test(cobro));

  console.log(`\n${pasan} pasan · ${fallos.length} fallan`);
  for (const f of fallos) console.log('  ✗ ' + f);
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
