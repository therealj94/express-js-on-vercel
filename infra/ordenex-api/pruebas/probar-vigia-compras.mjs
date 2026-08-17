/* El vigía de compras: las cuentas puras, sin Mongo y sin red.
 *
 *   node pruebas/probar-vigia-compras.mjs
 *
 * Lo que se castiga aquí es el reparto del cupo, que es la pieza que decide
 * cuánto ORIGEN pueden vender los contratos de las dos redes. Equivocarla no
 * da un error: da una venta que cobra por ORIGEN que no existe, y eso solo se
 * descubre cuando alguien reclama lo que pagó.
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

console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
