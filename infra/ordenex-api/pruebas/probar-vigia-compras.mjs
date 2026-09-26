/* El vigía de compras: las cuentas puras, sin Mongo y sin red.
 *
 *   node pruebas/probar-vigia-compras.mjs
 *
 * Lo que se castiga aquí es el reparto del cupo, que es la pieza que decide
 * cuánto ORIGEN pueden vender los contratos de las dos redes. Equivocarla no
 * da un error: da una venta que cobra por ORIGEN que no existe, y eso solo se
 * descubre cuando alguien reclama lo que pagó.
 *
 * Y el precio que se sella: el contrato cuenta su caducidad desde el sellado,
 * así que una lectura vieja del oro no se re-sella como si fuera nueva.
 */
import vigia from '../lib/vigiaCompras.js';
import { ethers } from 'ethers';

const { cupoPara, GAS_APARTADO, REDES } = vigia;
const O = (n) => ethers.parseEther(String(n));

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (q) => console.log(`\n── ${q} ${'─'.repeat(Math.max(2, 62 - q.length))}`);

decir('el gas propio se aparta siempre');
{
  comprobar(GAS_APARTADO === O(2), 'se apartan 2 ORIGEN para gas', ethers.formatEther(GAS_APARTADO));

  // Con 100 ORIGEN y una sola red, se ofrecen 98: los otros 2 son el gas con
  // el que el vigía firma los pagos. Sin apartarlos, la última compra se lleva
  // hasta el gas y el vigía se queda sin poder pagar las siguientes.
  comprobar(cupoPara(O(100), 1) === O(98), 'con 100 ORIGEN y una red, el cupo es 98',
    ethers.formatEther(cupoPara(O(100), 1)));
}

decir('el saldo NO se ofrece dos veces');
{
  /* Esta es la que de verdad importa. Con las dos redes vivas hay DOS
     contratos, cada uno con su cupo, y los dos cobran del mismo saldo de la
     5550. Ofrecerle 98 a cada uno sería prometer 196 ORIGEN teniendo 98: dos
     compradores simultáneos pagan y uno se queda sin cobrar. */
  const dos = cupoPara(O(100), 2);
  comprobar(dos === O(49), 'con dos redes, cada contrato recibe la MITAD', ethers.formatEther(dos));
  comprobar(dos * 2n <= O(100) - GAS_APARTADO,
    'y la suma de los dos cupos nunca pasa de lo que hay',
    `${ethers.formatEther(dos * 2n)} ≤ ${ethers.formatEther(O(100) - GAS_APARTADO)}`);
}

decir('sin saldo no se ofrece cupo, nunca un negativo');
{
  comprobar(cupoPara(0n, 2) === 0n, 'con la billetera vacía el cupo es cero');
  comprobar(cupoPara(O(1), 1) === 0n, 'con menos ORIGEN que el gas apartado, cero — no un negativo',
    ethers.formatEther(cupoPara(O(1), 1)));
  comprobar(cupoPara(O(2), 1) === 0n, 'y justo en el borde, cero');
  comprobar(cupoPara(O(100), 0) === 0n, 'sin redes activas, cero');
}

decir('el saldo de hoy da para muy poco, y hay que verlo');
{
  // El saldo real de 0x7462… el día que se escribió esto.
  const real = ethers.parseEther('20.959259988');
  const cupo = cupoPara(real, 2);
  const enUsd = Number(ethers.formatEther(cupo)) * 2.558;
  comprobar(cupo < O(10), 'con el saldo real, cada red puede vender menos de 10 ORIGEN',
    `${ethers.formatEther(cupo)} ORIGEN ≈ ${enUsd.toFixed(2)} USD por red`);
}

decir('las confirmaciones son de verdad, no de adorno');
{
  // Sin confirmaciones se paga por compras que una reorganización puede
  // borrar, y ese ORIGEN no vuelve.
  for (const r of REDES) {
    comprobar(r.confirmaciones >= 30, `${r.nombre}: ${r.confirmaciones} confirmaciones antes de mirar siquiera`);
    comprobar(Array.isArray(r.rpcs) && r.rpcs.length >= 2,
      `${r.nombre}: hay más de un RPC al que ir`, `${r.rpcs.length} sitios`);
  }
}

decir('sin llaves, el vigía no hace nada');
{
  // Fail-closed: las dos ausencias tienen que ser seguras. Se comprueba sobre
  // el código real, no sobre la intención.
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../lib/vigiaCompras.js', import.meta.url), 'utf8');
  comprobar(/if \(!llave\) return null/.test(src),
    'sin ORIGEN_PAGADOR_KEY, el pagador es null y no se firma nada');
  comprobar(/if \(!opKey\)[\s\S]{0,220}return;/.test(src),
    'sin OPERADOR_KEY no se refresca precio ni cupo');
  comprobar(src.includes("{ cadena: 1, txHash: 1, logIndex: 1 }, { unique: true }"),
    'el índice único (cadena, txHash, logIndex) existe: es lo que impide pagar dos veces');
  comprobar(/await CompraUsdt\.create\(/.test(src) && src.indexOf('await CompraUsdt.create(') < src.indexOf('sendTransaction'),
    'y la fila se crea ANTES de firmar el pago, no después');
  comprobar(/nunca se paga «lo que se pueda»|media compra/.test(src),
    'no existe el pago parcial: media compra parece completada');
}

decir('un precio viejo no se re-sella como nuevo');
{
  /* VentaOrigen.sol cuenta la caducidad del precio (30 min) desde que se le
     PONE, no desde que se leyó el oro. El oráculo sirve la última lectura
     buena hasta 10 min: si el vigía la re-sellara cada minuto, un feed caído
     alargaría la venta con el precio viejo de 30 a ~40 min. Aquí se monta un
     oráculo de verdad (lib/oraculo.js) con fuente y reloj fingidos, se le
     cuelga al módulo que carga el vigía, y el reloj del vigía es el mismo. */
  const { createRequire } = await import('node:module');
  const requerir = createRequire(import.meta.url);
  const mod = requerir('../lib/oraculo.js');
  const originales = { metales: mod.metales, cotizacion: mod.cotizacion, precioOrigenUsd: mod.precioOrigenUsd };
  const dateNow = Date.now;

  let t = 1_700_000_000_000;
  let resp = { oro: 4400, plata: 52 };
  const o = mod.crearOraculo({ fuentes: [{ nombre: 'f', leer: async () => resp }], ahora: () => t });
  Object.assign(mod, { metales: o.metales, cotizacion: o.cotizacion, precioOrigenUsd: o.precioOrigenUsd });
  Date.now = () => t;
  const sello = (oro) => ethers.parseUnits((oro / mod.GRAMIN_POR_ONZA).toFixed(18), 18);
  const lanza = async () => { try { await vigia.precioOrigen(); return null; } catch (e) { return e; } };

  try {
    comprobar((await vigia.precioOrigen()) === sello(4400), 'con el feed sano se sella el gramin de la lectura');

    resp = null;                 // los feeds caen
    t += 60_000;
    comprobar((await vigia.precioOrigen()) === sello(4400),
      'una vuelta con el feed caído (lectura de 60 s) todavía se sella',
      'un fallo suelto no cierra la venta');

    t += 4 * 60_000;             // lectura de 5 min
    comprobar((await o.metales())?.oro === 4400, 'a los 5 min el oráculo aún sirve el oro, para la pantalla');
    const e5 = await lanza();
    comprobar(e5 instanceof Error, 'pero el vigía NO lo re-sella: lanza y no se refresca el contrato',
      e5 ? e5.message : 'devolvió un precio de hace 5 min como si fuera nuevo');

    t += 4 * 60_000;             // lectura de 9 min
    comprobar((await lanza()) instanceof Error, 'a los 9 min, tampoco');

    resp = { oro: 4500, plata: 53 };   // vuelve el feed
    t += 30_000;
    comprobar((await vigia.precioOrigen()) === sello(4500), 'cuando el feed vuelve se sella el precio nuevo');

    // Lo que cuenta es la hora del ORO, no la de la plata.
    resp = { oro: null, plata: 54 };
    t += 2 * 60_000;
    const m = await o.metales();
    comprobar(m?.oro === 4500 && m?.plata === 54, 'llega sólo la plata: el oráculo conserva el oro de hace 2 min');
    comprobar((await lanza()) instanceof Error, 'y el vigía no sella ese oro de 2 min aunque la plata sea nueva');
    resp = { oro: 4510, plata: null };
    t += 31_000;
    comprobar((await vigia.precioOrigen()) === sello(4510), 'oro nuevo con plata vieja: se sella, el precio es del oro');
  } finally {
    Date.now = dateNow;
    Object.assign(mod, originales);
  }

  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../lib/vigiaCompras.js', import.meta.url), 'utf8');
  const cuerpo = src.slice(src.indexOf('async function vuelta'));
  comprobar(/try \{ precio = await precioOrigen\(\); \}\s*catch \(e\) \{[\s\S]{0,400}?return;\s*\}/.test(cuerpo)
    && cuerpo.indexOf('precioOrigen()') < cuerpo.indexOf('refrescar('),
    'y en la vuelta, sin precio sellable se sale ANTES de refrescar el contrato');
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
