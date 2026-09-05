/* La agregacion de velas, pura y contra tratos sinteticos. Sin Mongo, sin
 * red, sin reloj.
 *
 *   node pruebas/probar-velas.mjs
 *
 * Las velas son el principio 2 del contrato hecho codigo: SOLO tratos reales.
 * Aqui se castiga la parte pura de lib/velas.js — t0De, agregar,
 * resumen24hPuro — con lo que manda el contrato:
 *
 *  - o/h/l/c/v correctos: abre el primero, cierra el ultimo, h y l comparados
 *    como BigInt (no como strings) y v que suma todo;
 *  - cortes de marco EXACTOS en los cuatro marcos, en UTC, con el borde
 *    incluido en la vela que abre y el ms anterior en la que cierra;
 *  - pureza: la vela de entrada no se toca;
 *  - fail-closed: marco desconocido, trato de cero o vela ajena se lanzan;
 *  - resumen 24h: ultimo, cambio contra el precio en pie hace 24h, volumen
 *    solo de la ventana, y guiones honestos cuando no hay nada.
 */

import velas from '../lib/velas.js';
const { serie24hPuro } = velas;
const { MARCOS, t0De, agregar, resumen24hPuro } = velas;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (que) => console.log(`\n── ${que} ${'─'.repeat(Math.max(2, 62 - que.length))}`);

// Un token entero, en wei. Los tratos sinteticos llevan lo que anota el motor:
// mercado, precio (wei de ORIGEN por unidad), cantidad (wei del activo) y en.
const U = 10n ** 18n;
const DIA = 86_400_000;
const tr = (precio, cantidad, en, mercado = 'AUKA-ORIGEN') => ({
  mercado,
  precio: String(precio),
  cantidad: String(cantidad),
  lado: 'compra',
  en,
});

decir('los marcos de la casa');
{
  comprobar(
    MARCOS['1m'] === 60_000 && MARCOS['15m'] === 900_000 && MARCOS['1h'] === 3_600_000 && MARCOS['1d'] === 86_400_000,
    'son exactamente 1m, 15m, 1h y 1d, con sus duraciones en ms'
  );
  comprobar(Object.keys(MARCOS).length === 4, 'y ninguno mas');
}

decir('la primera vela del marco');
{
  const v = agregar(null, tr(2n * U, 5n * U, 61_000), '1m');
  comprobar(v.t0 === 60_000, 'cae en el corte de su minuto', `t0=${v.t0}`);
  comprobar(
    v.o === String(2n * U) && v.h === v.o && v.l === v.o && v.c === v.o,
    'abre con o=h=l=c al precio del trato'
  );
  comprobar(v.v === String(5n * U), 'y el volumen es su cantidad');
  comprobar(v.mercado === 'AUKA-ORIGEN' && v.marco === '1m', 'con mercado y marco puestos');
}

decir('o/h/l/c/v con varios tratos en el mismo marco');
{
  // Tres tratos dentro del mismo minuto: 2, 3, 1.5 ORIGEN. La vela tiene que
  // decir: abrio a 2, toco 3 y 1.5, cerro a 1.5, movio 6.
  let v = agregar(null, tr(2n * U, 1n * U, 60_001), '1m');
  v = agregar(v, tr(3n * U, 2n * U, 60_030), '1m');
  v = agregar(v, tr(15n * U / 10n, 3n * U, 61_999), '1m');
  comprobar(v.o === String(2n * U), 'o: el primer trato abre y nadie se lo pisa');
  comprobar(v.h === String(3n * U), 'h: el maximo');
  comprobar(v.l === String(15n * U / 10n), 'l: el minimo');
  comprobar(v.c === String(15n * U / 10n), 'c: el ultimo trato cierra');
  comprobar(v.v === String(6n * U), 'v: la suma de las cantidades');
}

decir('h y l se comparan como BigInt, no como strings');
{
  // "9" > "10" como strings. Con 9 wei y luego 10 wei, h tiene que ser 10.
  let v = agregar(null, tr(9n, 1n, 0), '1m');
  v = agregar(v, tr(10n, 1n, 1), '1m');
  comprobar(v.h === '10', 'h de 9 y 10 wei es 10', `h=${v.h}`);
  comprobar(v.l === '9', 'y l es 9');
}

decir('cortes de marco exactos, en los cuatro marcos');
{
  // El borde pertenece a la vela que ABRE; el ms anterior, a la que cierra.
  comprobar(t0De('1m', 119_999) === 60_000 && t0De('1m', 120_000) === 120_000, '1m: 119999→60000, 120000→120000');
  comprobar(t0De('15m', 899_999) === 0 && t0De('15m', 900_000) === 900_000, '15m: 899999→0, 900000→900000');
  comprobar(t0De('1h', 3_599_999) === 0 && t0De('1h', 3_600_000) === 3_600_000, '1h: 3599999→0, 3600000→3600000');

  // El diario corta a medianoche UTC de verdad, con una fecha de verdad.
  const dia = Date.UTC(2026, 7, 15); // 15-ago-2026 00:00:00.000 UTC
  comprobar(t0De('1d', dia - 1) === dia - DIA, '1d: el ultimo ms del 14 es del 14');
  comprobar(t0De('1d', dia) === dia, 'y la medianoche exacta abre el 15');
  comprobar(t0De('1d', new Date(dia + 5_000)) === dia, 'aceptando Date ademas de epoch ms');

  // Dos tratos pegados al borde caen en velas distintas.
  const a = agregar(null, tr(2n * U, U, 119_999), '1m');
  const b = agregar(null, tr(3n * U, U, 120_000), '1m');
  comprobar(a.t0 === 60_000 && b.t0 === 120_000, 'dos tratos pegados al borde: velas distintas');
}

decir('pureza: la vela de entrada no se toca');
{
  const antes = agregar(null, tr(2n * U, U, 0), '1m');
  const copia = JSON.stringify(antes);
  agregar(antes, tr(5n * U, U, 100), '1m');
  comprobar(JSON.stringify(antes) === copia, 'agregar devuelve una vela nueva y deja la vieja como estaba');
}

decir('fail-closed: lo que no es un trato de verdad, se lanza');
{
  const lanza = (f) => {
    try {
      f();
      return false;
    } catch {
      return true;
    }
  };
  comprobar(lanza(() => t0De('5m', 0)), 'marco desconocido');
  comprobar(lanza(() => t0De('1m', NaN)), 'fecha rota');
  comprobar(lanza(() => agregar(null, tr(0n, U, 0), '1m')), 'precio cero');
  comprobar(lanza(() => agregar(null, tr(U, 0n, 0), '1m')), 'cantidad cero');
  comprobar(lanza(() => agregar(null, { mercado: 'AUKA-ORIGEN', precio: 'nada', cantidad: '1', en: 0 }, '1m')), 'wei mal formado');
  const v1 = agregar(null, tr(2n * U, U, 0), '1m');
  comprobar(lanza(() => agregar(v1, tr(2n * U, U, 60_000), '1m')), 'un trato de otro minuto no entra en esta vela');
  comprobar(lanza(() => agregar(v1, tr(2n * U, U, 0, 'AGKA-ORIGEN'), '1m')), 'ni uno de otro mercado');
}

decir('resumen 24h');
{
  const ahora = 30 * DIA; // un "ahora" sintetico, alineado por comodidad
  const vela = (t0, o, c, v) => ({ t0, o: String(o), h: String(c), l: String(o), c: String(c), v: String(v) });

  // Sin velas: guiones honestos, no ceros de consuelo.
  const vacio = resumen24hPuro([], ahora);
  comprobar(
    vacio.ultimo === null && vacio.cambio24h === null && vacio.vol24h === '0',
    'sin velas: ultimo y cambio null, volumen 0'
  );

  // Mercado con historia: una vela vieja (hace 25h, cierra a 2) que da la
  // base, y dos en la ventana. Ultimo 2,5 → +25%. El volumen viejo NO cuenta.
  const conHistoria = resumen24hPuro(
    [
      vela(ahora - 25 * 3_600_000, 7n * U, 2n * U, 1000n * U), // vieja: solo presta su cierre
      vela(ahora - 2 * 3_600_000, 2n * U, 21n * U / 10n, 3n * U),
      vela(ahora - 3_600_000, 21n * U / 10n, 25n * U / 10n, 4n * U),
    ],
    ahora
  );
  comprobar(conHistoria.ultimo === String(25n * U / 10n), 'ultimo: el cierre de la vela mas nueva');
  comprobar(conHistoria.cambio24h === 25, 'cambio: contra el cierre en pie hace 24h (+25%)', `dio ${conHistoria.cambio24h}`);
  comprobar(conHistoria.vol24h === String(7n * U), 'volumen: SOLO la ventana — el de hace 25h no cuenta');

  // Mercado mas joven que un dia: la base es la apertura de su primera vela.
  const joven = resumen24hPuro(
    [vela(ahora - 3 * 3_600_000, 4n * U, 3n * U, 2n * U), vela(ahora - 3_600_000, 3n * U, 3n * U, 1n * U)],
    ahora
  );
  comprobar(joven.cambio24h === -25, 'mercado joven: cambio contra su primera apertura (-25%)', `dio ${joven.cambio24h}`);
  comprobar(joven.vol24h === String(3n * U), 'y su volumen entero cuenta');

  // 24 horas sin tratos: el ultimo precio sigue en pie, el cambio es 0 y el
  // volumen es 0 — que no haya movimiento tambien es un dato.
  const quieto = resumen24hPuro([vela(ahora - 3 * DIA, 2n * U, 2n * U, 9n * U)], ahora);
  comprobar(
    quieto.ultimo === String(2n * U) && quieto.cambio24h === 0 && quieto.vol24h === '0',
    'sin tratos en la ventana: ultimo en pie, cambio 0, volumen 0'
  );

  // El cambio trunca a dos decimales calculando entero: de 3 a 2 es -33,33.
  const fino = resumen24hPuro(
    [vela(ahora - 25 * 3_600_000, 3n * U, 3n * U, U), vela(ahora - 3_600_000, 3n * U, 2n * U, U)],
    ahora
  );
  comprobar(fino.cambio24h === -33.33, 'el cambio va con dos decimales, truncado entero', `dio ${fino.cambio24h}`);

  // La vela que cruza el borde cuenta entera (error maximo: un minuto en 1m).
  const borde = resumen24hPuro(
    [vela(ahora - DIA - 30_000, 2n * U, 2n * U, 5n * U), vela(ahora - DIA, 2n * U, 2n * U, 3n * U)],
    ahora
  );
  comprobar(borde.vol24h === String(3n * U), 'la vela con t0 justo en el corte entra; la anterior no');

  // Y el orden de llegada no importa: se ordena por t0 adentro.
  const desordenado = resumen24hPuro(
    [vela(ahora - 3_600_000, 3n * U, 5n * U, U), vela(ahora - 2 * 3_600_000, 2n * U, 3n * U, U)],
    ahora
  );
  comprobar(desordenado.ultimo === String(5n * U), 'velas desordenadas: el ultimo sigue siendo el mas nuevo');
}


decir('la serie del día para la mini gráfica');
{
  const H = 3_600_000, ahora = 100 * H;
  const v = (t0, c) => ({ t0, c: String(c) });
  comprobar(serie24hPuro([], ahora).length === 0, 'sin velas, sin serie: un guion y no una línea plana');
  // Un cierre de antes de la ventana y tres horas dentro: cuatro puntos, en orden.
  const s = serie24hPuro([v(80 * H, 5), v(77 * H, 3), v(90 * H, 7), v(70 * H, 2)], ahora);
  comprobar(s.join(',') === '2,3,5,7', 'empieza con el cierre en pie al abrir la ventana (el de 70 h) y sigue en orden de tiempo', s.join(','));
  comprobar(serie24hPuro([v(79 * H, 9)], ahora).join(',') === '9', 'un mercado viejo sin tratos hoy sigue teniendo su último precio');
  const muchas = Array.from({ length: 40 }, (_, i) => v((100 - 39 + i) * H, i));
  comprobar(serie24hPuro(muchas, ahora).length === 25, 'y nunca más de 25 puntos', String(serie24hPuro(muchas, ahora).length));
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
