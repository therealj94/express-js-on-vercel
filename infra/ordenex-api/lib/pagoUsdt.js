/* Hablar con la cadena para pagar USDT. Dos funciones y nada de reglas.
 *
 * POR QUÉ ESTÁ SEPARADO DE lib/venta.js. Porque un módulo que mueve dinero y
 * no se puede probar sin gastar gas no se prueba, y este tiene que estar
 * probado ANTES de que la caja tenga un centavo. `lib/venta.js` guarda ESTE
 * módulo entero —no sus funciones sueltas— para que una prueba pueda ponerle
 * enfrente una cadena fingida y recorrer el camino de producción sin salir a
 * ningún sitio. Mismo motivo, y mismo patrón, que lib/gas.js con proveedores.
 *
 * Lo único que sabe este archivo es cómo se lee un saldo y cómo se firma una
 * transferencia. Quién puede vender, cuánto, y qué pasa si falla, es de
 * lib/venta.js.
 */

const { Contract, Wallet, formatUnits } = require('ethers');
const proveedores = require('./proveedores');
const redes = require('./redesUsdt');
const decimales = require('./decimales');
const billeteras = require('./billeteras');
const { normalizarLlave } = require('./cripto');

const ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
];

/** De dónde sale el USDT. Ver la cabecera de lib/venta.js: hoy es la caja. */
const ESPERADA = billeteras.UNICA;

/**
 * La billetera que paga, comprobada contra su dirección.
 *
 * `valida` no es «tiene forma de llave»: es «es la llave DE ESA billetera».
 * Una llave perfecta de otro entorno pagaría con el dinero de otra casa y eso
 * no se ve hasta que alguien cuadra saldos. Misma regla que lib/gas.js.
 */
function pagadora(pv) {
  const llave = normalizarLlave(process.env.ORDENEX_VENTA_KEY);
  if (!llave) return { ok: false, motivo: 'falta ORDENEX_VENTA_KEY' };
  let w;
  try { w = new Wallet(llave, pv); } catch { return { ok: false, motivo: 'ORDENEX_VENTA_KEY no tiene forma de llave privada' }; }
  if (w.address !== ESPERADA) return { ok: false, motivo: `la ORDENEX_VENTA_KEY no es la de ${ESPERADA}` };
  return { ok: true, billetera: w, direccion: w.address };
}

/** ¿Hay con qué firmar? Sin salir a la red: para el panel y el arranque. */
function configurada() {
  const q = pagadora(null);
  return { ok: q.ok, motivo: q.motivo || null, direccion: ESPERADA };
}

/** Lo que la caja tiene AHORA, en crudo de la red y en canónico de 18. */
async function saldo(red) {
  const pv = await proveedores.proveedorDe(red);
  const cfg = redes.REDES[red];
  const crudo = (await new Contract(cfg.usdt, ABI, pv).balanceOf(ESPERADA)).toString();
  return { crudo, canonico: decimales.aCanonico(crudo, red, 'USDT') };
}

/**
 * Firmar la transferencia. Devuelve `{ hash }`.
 *
 * NO espera al minado a propósito: el hash es la prueba de emisión y el estado
 * final lo dice la cadena. Esperar bloquearía más de los treinta segundos del
 * router de Heroku y dejaría a quien vende mirando una pantalla colgada
 * mientras su pago ya salió.
 *
 * Lo que lance esta función lo clasifica lib/venta.js: hay errores que son
 * anteriores a la firma y otros que dejan una transacción viva, y esa
 * diferencia decide si el ORIGEN se devuelve o lo mira una persona.
 */
async function pagar(red, { a, crudo }) {
  const pv = await proveedores.proveedorDe(red);
  const quien = pagadora(pv);
  if (!quien.ok) {
    const e = new Error(quien.motivo);
    e.code = 'SIN_CONFIGURAR'; e.nuncaSalio = true;
    throw e;
  }
  const cfg = redes.REDES[red];
  const tx = await new Contract(cfg.usdt, ABI, quien.billetera).transfer(a, crudo);
  const dec = decimales.decimalesDe(red, 'USDT');
  console.log(`[venta] ${formatUnits(crudo, dec)} USDT a ${a} en ${cfg.nombre} · ${tx.hash}`);
  return { hash: tx.hash };
}

module.exports = { saldo, pagar, pagadora, configurada, ESPERADA, ABI };
