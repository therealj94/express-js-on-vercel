/* El calce puro, castigado hasta el hartazgo. Sin Mongo, sin red, sin reloj.
 *
 *   node pruebas/probar-motor.mjs
 *
 * `calzar` es una funcion pura a proposito: el calce es el sitio donde un bug
 * le da el dinero de uno al otro, y por eso tiene que poder probarse aqui,
 * entera, sin levantar medio backend. Se comprueba lo que manda el contrato:
 *
 *  - precio-tiempo: mejor precio primero, y a igual precio la mas vieja;
 *  - cruce al precio de la PASIVA: el agresor nunca paga mas de lo que pidio;
 *  - parciales: lo calzado se descuenta y el resto descansa (si es limite);
 *  - una orden de mercado barre y JAMAS descansa;
 *  - autocalce: contra uno mismo no se calza — se rechaza esa parte;
 *  - conservacion: cada wei que sale de un lado entra por el otro;
 *  - pureza: el libro de entrada no se toca;
 *  - y un fuzz de 500 ordenes al azar con los invariantes vigilados en cada paso.
 */

import motor from '../lib/motor.js';
const { calzar } = motor;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (que) => console.log(`\n── ${que} ${'─'.repeat(Math.max(2, 62 - que.length))}`);

// Un token entero, en wei. Los precios van en wei de ORIGEN por unidad entera.
const U = 10n ** 18n;
let nSeq = 0;
const o = ({ id, u, lado, tipo = 'limite', precio = null, cantidad, en = 0 }) => ({
  id,
  userId: u,
  mercado: 'AUKA-ORIGEN',
  lado,
  tipo,
  precio: precio === null ? null : String(precio),
  cantidad: String(cantidad),
  resta: String(cantidad),
  en,
  seq: ++nSeq,
});
const vacio = () => ({ compras: [], ventas: [] });
const total = (lista) => lista.reduce((s, x) => s + BigInt(x.resta), 0n);

decir('descansar y cruzar');
{
  // Libro vacio: una limite no calza nada y se queda descansando.
  const r = calzar(vacio(), o({ id: 'v1', u: 'ana', lado: 'venta', precio: 2n * U, cantidad: 5n * U }));
  comprobar(r.tratos.length === 0 && r.resto !== null && r.libro.ventas.length === 1 && r.libro.ventas[0].id === 'v1',
    'en libro vacio, una limite descansa sin calzar');

  // Y una compra que la cruza calza AL PRECIO DE LA PASIVA, no al suyo.
  const r2 = calzar(r.libro, o({ id: 'c1', u: 'beto', lado: 'compra', precio: 25n * U / 10n, cantidad: 5n * U }));
  comprobar(r2.tratos.length === 1, 'la compra que cruza produce un trato');
  comprobar(r2.tratos[0]?.precio === String(2n * U),
    'el cruce es al precio de la orden pasiva (el agresor paga menos de lo que pidio)',
    `precio ${r2.tratos[0]?.precio}`);
  comprobar(r2.tratos[0]?.compradorId === 'beto' && r2.tratos[0]?.vendedorId === 'ana' && r2.tratos[0]?.lado === 'compra',
    'con comprador, vendedor y el lado del agresor bien puestos');
  comprobar(r2.resto === null && r2.resta === '0' && r2.libro.ventas.length === 0,
    'y las dos quedan enteras: ni resto ni resta ni libro');
}

decir('precio-tiempo');
{
  // Tres ventas: ana y carla al mismo precio (ana llego antes), dani mas
  // nueva pero a MEJOR precio. El orden de calce tiene que ser: dani (mejor
  // precio aunque llego ultima), ana (empate de precio, mas vieja), carla.
  let libro = vacio();
  libro = calzar(libro, o({ id: 'va', u: 'ana', lado: 'venta', precio: 2n * U, cantidad: 3n * U, en: 1 })).libro;
  libro = calzar(libro, o({ id: 'vc', u: 'carla', lado: 'venta', precio: 2n * U, cantidad: 3n * U, en: 2 })).libro;
  libro = calzar(libro, o({ id: 'vd', u: 'dani', lado: 'venta', precio: 19n * U / 10n, cantidad: 3n * U, en: 3 })).libro;
  comprobar(libro.ventas.map((x) => x.id).join(',') === 'vd,va,vc',
    'el libro ordena por precio y, a igual precio, por antiguedad',
    libro.ventas.map((x) => x.id).join(','));

  const r = calzar(libro, o({ id: 'cb', u: 'beto', lado: 'compra', precio: 2n * U, cantidad: 7n * U, en: 4 }));
  comprobar(r.tratos.map((t) => t.vendedorId).join(',') === 'dani,ana,carla',
    'y el calce respeta ese orden: dani, ana, carla',
    r.tratos.map((t) => t.vendedorId).join(','));
  comprobar(r.tratos.map((t) => t.precio).join(',') === [19n * U / 10n, 2n * U, 2n * U].join(','),
    'cada trato al precio de SU pasiva');
  // Parcial: a carla solo le calza 1 de sus 3.
  comprobar(r.tratos[2]?.cantidad === String(1n * U) && r.libro.ventas[0]?.id === 'vc' && r.libro.ventas[0]?.resta === String(2n * U),
    'el parcial descuenta y la pasiva sigue descansando con su resta');
  comprobar(r.resto === null && r.resta === '0', 'la entrante quedo entera');
}

decir('parciales de la entrante');
{
  let libro = calzar(vacio(), o({ id: 'v1', u: 'ana', lado: 'venta', precio: 2n * U, cantidad: 4n * U })).libro;
  const r = calzar(libro, o({ id: 'c1', u: 'beto', lado: 'compra', precio: 2n * U, cantidad: 10n * U }));
  comprobar(r.tratos.length === 1 && r.tratos[0].cantidad === String(4n * U),
    'calza lo que hay');
  comprobar(r.resto !== null && r.resto.resta === String(6n * U) && r.libro.compras[0]?.id === 'c1',
    'y el resto de la limite descansa en su lado del libro');
  comprobar(r.resto.cantidad === String(10n * U), 'sin perder la cantidad original');
}

decir('la orden de mercado no descansa');
{
  let libro = vacio();
  libro = calzar(libro, o({ id: 'v1', u: 'ana', lado: 'venta', precio: 2n * U, cantidad: 2n * U, en: 1 })).libro;
  libro = calzar(libro, o({ id: 'v2', u: 'carla', lado: 'venta', precio: 3n * U, cantidad: 2n * U, en: 2 })).libro;
  const r = calzar(libro, o({ id: 'm1', u: 'beto', lado: 'compra', tipo: 'mercado', cantidad: 10n * U, en: 3 }));
  comprobar(r.tratos.length === 2 && r.tratos.map((t) => t.precio).join(',') === [2n * U, 3n * U].join(','),
    'a mercado barre todos los niveles, cada uno a su precio');
  comprobar(r.resto === null, 'lo que no calzo NO descansa');
  comprobar(r.motivo === 'sin-liquidez' && r.resta === String(6n * U),
    'y se dice por que y cuanto quedo sin calzar', `motivo=${r.motivo} resta=${r.resta}`);
  comprobar(r.libro.compras.length === 0 && r.libro.ventas.length === 0,
    'el libro queda sin rastro de ella');

  const r2 = calzar(vacio(), o({ id: 'm2', u: 'beto', lado: 'venta', tipo: 'mercado', cantidad: U }));
  comprobar(r2.tratos.length === 0 && r2.resto === null && r2.motivo === 'sin-liquidez',
    'a mercado contra libro vacio: nada, y tampoco descansa');
}

decir('autocalce: contra uno mismo no se calza');
{
  // La propia orden al frente: se rechaza entera, y la pasiva queda intacta.
  const libro = calzar(vacio(), o({ id: 'v1', u: 'ana', lado: 'venta', precio: 2n * U, cantidad: 5n * U })).libro;
  const r = calzar(libro, o({ id: 'c1', u: 'ana', lado: 'compra', precio: 3n * U, cantidad: 5n * U, en: 2 }));
  comprobar(r.tratos.length === 0 && r.motivo === 'autocalce' && r.resto === null,
    'contra la propia orden al frente: cero tratos, rechazo, nada descansa');
  comprobar(r.libro.ventas.length === 1 && r.libro.ventas[0].resta === String(5n * U),
    'y la orden propia que descansaba no se toca');

  // Una ajena delante y la propia detras: calza la ajena y el resto se
  // rechaza al toparse con la propia — ni la salta (seria calzar a peor
  // precio que el propio) ni descansa cruzada.
  let libro2 = vacio();
  libro2 = calzar(libro2, o({ id: 'v1', u: 'beto', lado: 'venta', precio: 2n * U, cantidad: 2n * U, en: 1 })).libro;
  libro2 = calzar(libro2, o({ id: 'v2', u: 'ana', lado: 'venta', precio: 21n * U / 10n, cantidad: 3n * U, en: 2 })).libro;
  const r2 = calzar(libro2, o({ id: 'c2', u: 'ana', lado: 'compra', precio: 3n * U, cantidad: 10n * U, en: 3 }));
  comprobar(r2.tratos.length === 1 && r2.tratos[0].vendedorId === 'beto',
    'lo que calzaba contra terceros se calza');
  comprobar(r2.motivo === 'autocalce' && r2.resto === null && r2.resta === String(8n * U),
    'y el resto se rechaza al llegar a la orden propia', `motivo=${r2.motivo} resta=${r2.resta}`);
  comprobar(r2.libro.ventas.length === 1 && r2.libro.ventas[0].id === 'v2' && r2.libro.ventas[0].resta === String(3n * U),
    'la orden propia pasiva sigue descansando intacta');
  comprobar(r2.tratos.every((t) => t.compradorId !== t.vendedorId),
    'y en ningun trato las dos puntas son la misma mano');
}

decir('pureza y conservacion');
{
  let libro = vacio();
  libro = calzar(libro, o({ id: 'v1', u: 'ana', lado: 'venta', precio: 2n * U, cantidad: 5n * U, en: 1 })).libro;
  libro = calzar(libro, o({ id: 'v2', u: 'carla', lado: 'venta', precio: 3n * U, cantidad: 5n * U, en: 2 })).libro;
  const foto = JSON.stringify(libro);
  const r = calzar(libro, o({ id: 'c1', u: 'beto', lado: 'compra', precio: 3n * U, cantidad: 7n * U, en: 3 }));
  comprobar(JSON.stringify(libro) === foto, 'calzar no muta el libro que recibe');

  // Conservacion por lado: lo que salio de las pasivas = lo que suman los
  // tratos = lo que consumio la entrante. Ni un wei se crea ni se pierde.
  const salioDePasivas = total(libro.ventas) - total(r.libro.ventas);
  const enTratos = r.tratos.reduce((s, t) => s + BigInt(t.cantidad), 0n);
  const consumioEntrante = 7n * U - BigInt(r.resta);
  comprobar(salioDePasivas === enTratos && enTratos === consumioEntrante,
    'cada wei que sale de un lado entra por el otro',
    `pasivas ${salioDePasivas} · tratos ${enTratos} · entrante ${consumioEntrante}`);
}

decir('fuzz: 500 ordenes al azar, invariantes en cada paso');
{
  // LCG con semilla fija: el azar de esta prueba se puede volver a correr.
  let semilla = 20260816n;
  const azar = (n) => {
    semilla = (semilla * 6364136223846793005n + 1442695040888963407n) % (2n ** 64n);
    return Number((semilla >> 16n) % BigInt(n));
  };

  const usuarios = ['u1', 'u2', 'u3', 'u4', 'u5'];
  let libro = vacio();
  const colocado = new Map(); // id -> cantidad original
  const calzado = new Map(); // id -> total calzado
  let compradoPorUsuario = new Map();
  const sumar = (m, k, v) => m.set(k, (m.get(k) ?? 0n) + v);
  let compradoTotal = 0n;
  let vendidoTotal = 0n;
  let problemas = [];

  const ordenado = (lista, esCompra) => {
    for (let i = 1; i < lista.length; i++) {
      const a = lista[i - 1];
      const b = lista[i];
      const pa = BigInt(a.precio);
      const pb = BigInt(b.precio);
      if (pa !== pb) {
        if (esCompra ? pa < pb : pa > pb) return false;
      } else if (a.en > b.en || (a.en === b.en && a.seq > b.seq)) return false;
    }
    return true;
  };

  for (let i = 0; i < 500 && problemas.length === 0; i++) {
    const lado = azar(2) ? 'compra' : 'venta';
    const tipo = azar(10) < 8 ? 'limite' : 'mercado';
    // Precios entre 0,1 y 4 ORIGEN y cantidades con wei sueltos, para que los
    // parciales y el floor trabajen de verdad.
    const precio = tipo === 'limite' ? BigInt(1 + azar(40)) * U / 10n : null;
    const cantidad = BigInt(1 + azar(20)) * U / BigInt([1, 3, 7][azar(3)]) + BigInt(azar(1000));
    const orden = o({ id: `f${i}`, u: usuarios[azar(usuarios.length)], lado, tipo, precio, cantidad, en: i });
    colocado.set(orden.id, cantidad);

    const antes = lado === 'compra' ? total(libro.ventas) : total(libro.compras);
    const r = calzar(libro, orden);

    // Conservacion del paso.
    const despues = lado === 'compra' ? total(r.libro.ventas) : total(r.libro.compras);
    const enTratos = r.tratos.reduce((s, t) => s + BigInt(t.cantidad), 0n);
    if (antes - despues !== enTratos) problemas.push(`paso ${i}: pasivas perdieron ${antes - despues} y los tratos suman ${enTratos}`);
    if (enTratos + BigInt(r.resta) !== cantidad) problemas.push(`paso ${i}: calzado ${enTratos} + resta ${r.resta} != cantidad ${cantidad}`);

    for (const t of r.tratos) {
      if (t.compradorId === t.vendedorId) problemas.push(`paso ${i}: autocalce en un trato`);
      sumar(calzado, t.ordenCompra, BigInt(t.cantidad));
      sumar(calzado, t.ordenVenta, BigInt(t.cantidad));
      sumar(compradoPorUsuario, t.compradorId, BigInt(t.cantidad));
      sumar(compradoPorUsuario, t.vendedorId, -BigInt(t.cantidad));
      compradoTotal += BigInt(t.cantidad);
      vendidoTotal += BigInt(t.cantidad);
      if (BigInt(t.cantidad) <= 0n) problemas.push(`paso ${i}: trato de cantidad ${t.cantidad}`);
    }

    // El libro que queda: ordenado, sin mercados, sin restas vacias, sin cruce.
    if (!ordenado(r.libro.compras, true)) problemas.push(`paso ${i}: compras desordenadas`);
    if (!ordenado(r.libro.ventas, false)) problemas.push(`paso ${i}: ventas desordenadas`);
    for (const x of [...r.libro.compras, ...r.libro.ventas]) {
      if (x.tipo === 'mercado') problemas.push(`paso ${i}: una orden de mercado descansando`);
      if (BigInt(x.resta) <= 0n) problemas.push(`paso ${i}: resta ${x.resta} en el libro`);
    }
    if (r.libro.compras.length && r.libro.ventas.length) {
      if (BigInt(r.libro.compras[0].precio) >= BigInt(r.libro.ventas[0].precio)) {
        problemas.push(`paso ${i}: libro cruzado (${r.libro.compras[0].precio} >= ${r.libro.ventas[0].precio})`);
      }
    }
    libro = r.libro;
  }

  // Nadie calzo mas de lo que coloco.
  for (const [id, c] of calzado) {
    if (c > (colocado.get(id) ?? 0n)) problemas.push(`la orden ${id} calzo ${c} con cantidad ${colocado.get(id)}`);
  }
  // Conservacion global: todo lo comprado fue vendido, y la suma de posiciones
  // netas de todos los usuarios es cero.
  if (compradoTotal !== vendidoTotal) problemas.push(`comprado ${compradoTotal} != vendido ${vendidoTotal}`);
  const neto = [...compradoPorUsuario.values()].reduce((s, v) => s + v, 0n);
  if (neto !== 0n) problemas.push(`la suma de posiciones netas da ${neto}, no cero`);

  comprobar(problemas.length === 0,
    `500 ordenes al azar sin romper un solo invariante (${compradoTotal} wei calzados)`,
    problemas.slice(0, 5).join('\n           '));
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
