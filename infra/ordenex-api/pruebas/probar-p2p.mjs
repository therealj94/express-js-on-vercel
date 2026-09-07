#!/usr/bin/env node
/**
 * EL P2P: EL RELOJ, Y QUE EL DINERO NO SE PIERDA NI SE DUPLIQUE.
 *
 * ── POR QUÉ ESTA PRUEBA ES ASÍ ──────────────────────────────────────────────
 * Lo único que de verdad hay que probar de este tramo es QUÉ PASA CUANDO PASA
 * EL TIEMPO, y eso con `Date.now()` esparcido por el código sería esperar
 * quince minutos de verdad — o sea, no probarlo. Por eso `lib/p2p.js` tiene el
 * reloj inyectable y aquí se mueve a mano.
 *
 * Y la invariante que se comprueba después de cada camino no es «el estado es
 * el que esperaba»: es que **la suma de disponible + reservado de las dos
 * puntas es la misma que al empezar**. Un estado correcto con el dinero mal es
 * exactamente el bicho que nadie ve hasta que alguien reclama.
 *
 *     node pruebas/probar-p2p.mjs
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let fallos = 0;
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 58 - t.length))}`);
const decir = (ok, q, d) => { console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${q}${d ? `\n           ${d}` : ''}`); if (!ok) fallos++; };

let servidor;
try {
  servidor = await MongoMemoryServer.create();
} catch (e) {
  /* Sin binario no se finge un verde: se dice y se sale, igual que aucorp. */
  console.log(`\nNo se pudo levantar Mongo en memoria: ${String(e?.message || e).slice(0, 140)}`);
  console.log('Se puede pasar uno ya descargado con MONGOMS_SYSTEM_BINARY=/ruta/a/mongod\n');
  process.exit(0);
}
await mongoose.connect(servidor.getUri());

const { Anuncio, P2POrden, Cuenta, Falta } = await import('../models/index.js').then((m) => m.default || m);
const ledger = await import('../lib/ledger.js').then((m) => m.default || m);
const p2p = await import('../lib/p2p.js').then((m) => m.default || m);

const UNO = 10n ** 18n;
const wei = (n) => (BigInt(n) * UNO).toString();

// ── El reloj de mentira ─────────────────────────────────────────────────────
let T = new Date('2026-09-07T12:00:00Z');
p2p.ponerReloj(() => T);
const avanzar = (min) => { T = new Date(T.getTime() + min * 60 * 1000); };

const VENDEDOR = 'u-vendedor';
const COMPRADOR = 'u-comprador';

async function saldos() {
  const c = await Cuenta.find({ activo: 'ORIGEN' }).lean();
  const m = {};
  for (const x of c) m[x.userId] = { disp: BigInt(x.disponible), res: BigInt(x.reservado) };
  return m;
}
const total = (s) => Object.values(s).reduce((a, x) => a + x.disp + x.res, 0n);

async function limpiar() {
  await Promise.all([Anuncio.deleteMany({}), P2POrden.deleteMany({}), Cuenta.deleteMany({}), Falta.deleteMany({})]);
  await ledger.acreditar(VENDEDOR, 'ORIGEN', wei(1000), 'siembra');
}

async function unAnuncio(extra = {}) {
  return (await Anuncio.create({
    comercianteId: VENDEDOR, lado: 'vendo', activo: 'ORIGEN', moneda: 'HNL',
    precio: '2485',                       // 24,85 HNL por ORIGEN, en centavos
    cantidadTotal: wei(500), cantidadRestante: wei(500),
    minFiat: '10000', maxFiat: '10000000', minutosParaPagar: 15,
    ...extra,
  })).toObject();
}

// ── 1 · el camino feliz ─────────────────────────────────────────────────────
titulo('el camino entero: tomar, pagar, liberar');
await limpiar();
{
  const antes = total(await saldos());
  const a = await unAnuncio();
  const o = await p2p.tomar({ anuncioId: a._id, tomadorId: COMPRADOR, cantidad: wei(10) });

  decir(o.estado === 'creada', 'la orden nace en «creada»');
  decir(o.numero.startsWith('ONX-P2P-'), 'con un número legible', o.numero);
  decir(o.montoFiat === '24850', 'y el fiat calculado del precio', `${o.montoFiat} centavos = 248,50 HNL`);
  decir(o.pagadorId === COMPRADOR && o.entregadorId === VENDEDOR,
    'los papeles salen del LADO del anuncio, no de quién es quién');

  let s = await saldos();
  decir(s[VENDEDOR].res === BigInt(wei(10)), 'el ORIGEN del que entrega queda EN GARANTÍA', `${s[VENDEDOR].res / UNO} ORIGEN reservados`);
  decir(s[VENDEDOR].disp === BigInt(wei(990)), 'y sale de su disponible');

  const anuncio = await Anuncio.findById(a._id).lean();
  decir(anuncio.cantidadRestante === wei(490), 'el anuncio descuenta su inventario');

  decir(p2p.segundosQueQuedan(o) === 900, 'el reloj arranca en 15 minutos', `${p2p.segundosQueQuedan(o)} s`);

  avanzar(5);
  const pag = await p2p.marcarPagado({ id: o._id, quien: COMPRADOR, referencia: 'REF-12345' });
  decir(pag.estado === 'pagada', 'se marca como pagada');
  decir(pag.venceEn === null, 'y AQUÍ SE CONGELA EL TIEMPO: venceEn queda en null',
    'desde acá la orden ya no vence nunca — nadie pierde su dinero por un reloj que corrió después de pagar');
  decir(p2p.segundosQueQuedan(pag) === null, 'la pantalla ya no dibuja cronómetro');
  decir(!!pag.congeladoEn && !!pag.apelableEn, 'y queda anotado cuándo se congeló y desde cuándo se puede apelar');

  avanzar(600);                            // diez horas
  const sigue = await p2p.leer(o._id);
  decir(sigue.estado === 'pagada', 'diez horas después SIGUE en pagada: una orden pagada no vence jamás');

  const lib = await p2p.liberar({ id: o._id, quien: VENDEDOR });
  decir(lib.estado === 'liberada', 'el que entregó la libera');

  s = await saldos();
  decir(s[COMPRADOR].disp === BigInt(wei(10)), 'el ORIGEN llega a quien pagó', `${s[COMPRADOR].disp / UNO} ORIGEN`);
  decir(s[VENDEDOR].res === 0n, 'y no queda nada en garantía');
  decir(total(s) === antes + BigInt(wei(10)) - BigInt(wei(10)) || total(s) === antes,
    'INVARIANTE: no se creó ni se perdió ORIGEN en todo el camino', `${total(s) / UNO} = ${antes / UNO}`);
}

// ── 2 · el reloj: vencer ────────────────────────────────────────────────────
titulo('el reloj: la orden que nadie pagó');
await limpiar();
{
  const antes = total(await saldos());
  const a = await unAnuncio();
  const o = await p2p.tomar({ anuncioId: a._id, tomadorId: COMPRADOR, cantidad: wei(10) });

  avanzar(14);
  decir((await p2p.leer(o._id)).estado === 'creada', 'a los 14 minutos sigue viva');

  avanzar(2);                              // 16 min: pasado
  const v = await p2p.leer(o._id);
  decir(v.estado === 'vencida',
    'a los 16 se vence AL LEERLA, sin esperar al barredor',
    'entre dos pasadas del barredor hay 20 s en los que una orden muerta diría «podés pagar»');

  const s = await saldos();
  decir(s[VENDEDOR].res === 0n, 'la garantía vuelve a quien entregaba');
  decir(s[VENDEDOR].disp === BigInt(wei(1000)), 'entera');
  decir(total(s) === antes, 'INVARIANTE: ni un wei de más ni de menos');

  const anuncio = await Anuncio.findById(a._id).lean();
  decir(anuncio.cantidadRestante === wei(500), 'y el anuncio recupera su inventario',
    'sin esto el comerciante se queda vendiendo aire');

  decir(await p2p.faltasRecientes(COMPRADOR) === 1, 'al que no pagó le queda una falta');
}

// ── 3 · el barredor, y que no venza dos veces ───────────────────────────────
titulo('el barredor: idempotente aunque haya dos');
await limpiar();
{
  const antes = total(await saldos());
  const a = await unAnuncio();
  await p2p.tomar({ anuncioId: a._id, tomadorId: COMPRADOR, cantidad: wei(5) });
  await p2p.tomar({ anuncioId: a._id, tomadorId: 'otro', cantidad: wei(5) });
  avanzar(20);

  /* DOS BARREDORES A LA VEZ. Es el día que haya dos dynos, y también el
     momento en que el barredor se solapa consigo mismo porque una pasada
     tardó más que el intervalo. Sin la guarda atómica, los dos devolverían la
     garantía y el vendedor cobraría el doble de lo que puso. */
  const [n1, n2] = await Promise.all([p2p.barrer(), p2p.barrer()]);
  decir(n1 + n2 === 2, 'entre los dos vencen exactamente 2 órdenes, no 4', `${n1} + ${n2}`);

  const s = await saldos();
  decir(s[VENDEDOR].disp === BigInt(wei(1000)) && s[VENDEDOR].res === 0n,
    'y la garantía vuelve UNA sola vez');
  decir(total(s) === antes, 'INVARIANTE: la carrera no creó ORIGEN de la nada');
}

// ── 4 · quién puede qué ─────────────────────────────────────────────────────
titulo('quién puede qué, y cuándo');
await limpiar();
{
  const a = await unAnuncio();
  const o = await p2p.tomar({ anuncioId: a._id, tomadorId: COMPRADOR, cantidad: wei(10) });

  let e = null;
  try { await p2p.cancelar({ id: o._id, quien: VENDEDOR }); } catch (x) { e = x; }
  decir(e?.codigo === 'NO_ES_SUYO',
    'el que ENTREGA no puede cancelar nunca',
    'si pudiera, cancelaría cada vez que el precio se moviera en su contra — y eso no es un mercado');

  e = null;
  try { await p2p.liberar({ id: o._id, quien: VENDEDOR }); } catch (x) { e = x; }
  decir(e?.codigo === 'ESTADO', 'y no puede liberar una orden que todavía nadie marcó como pagada');

  e = null;
  try { await p2p.marcarPagado({ id: o._id, quien: VENDEDOR }); } catch (x) { e = x; }
  decir(e?.codigo === 'NO_ES_SUYO', 'solo quien paga puede decir que pagó');

  await p2p.marcarPagado({ id: o._id, quien: COMPRADOR });
  e = null;
  try { await p2p.cancelar({ id: o._id, quien: COMPRADOR }); } catch (x) { e = x; }
  decir(e?.codigo === 'YA_PAGADA',
    'y una vez marcada pagada, el que pagó YA NO puede cancelar',
    'si pudiera, cancelaría cuando el precio se moviera a su favor');
}

// ── 5 · liberar dos veces ───────────────────────────────────────────────────
titulo('dos toques del mismo botón');
await limpiar();
{
  const antes = total(await saldos());
  const a = await unAnuncio();
  const o = await p2p.tomar({ anuncioId: a._id, tomadorId: COMPRADOR, cantidad: wei(10) });
  await p2p.marcarPagado({ id: o._id, quien: COMPRADOR });

  const r = await Promise.allSettled([
    p2p.liberar({ id: o._id, quien: VENDEDOR }),
    p2p.liberar({ id: o._id, quien: VENDEDOR }),
  ]);
  const bien = r.filter((x) => x.status === 'fulfilled').length;
  decir(bien === 1, 'solo UNA de las dos libera', `${bien} de 2`);

  const s = await saldos();
  decir(s[COMPRADOR].disp === BigInt(wei(10)), 'el comprador recibe 10, no 20', `${s[COMPRADOR].disp / UNO}`);
  decir(total(s) === antes, 'INVARIANTE: no se pagó dos veces');
}

// ── 6 · las faltas ──────────────────────────────────────────────────────────
titulo('tres faltas en 24 h y no se toman más anuncios');
await limpiar();
{
  /* 5 ORIGEN y no 1: a 24,85 el ORIGEN, uno solo son 2 485 centavos y el
     anuncio pide un mínimo de 10 000. La primera versión de esta prueba se
     cayó por eso — el código tenía razón. */
  const a = await unAnuncio();
  for (let i = 0; i < 3; i++) {
    const o = await p2p.tomar({ anuncioId: a._id, tomadorId: COMPRADOR, cantidad: wei(5) });
    await p2p.cancelar({ id: o._id, quien: COMPRADOR });
  }
  decir(await p2p.faltasRecientes(COMPRADOR) === 3, 'tres cancelaciones, tres faltas');

  let e = null;
  try { await p2p.tomar({ anuncioId: a._id, tomadorId: COMPRADOR, cantidad: wei(5) }); } catch (x) { e = x; }
  decir(e?.codigo === 'BLOQUEADO',
    'la cuarta no entra',
    'sin esto, cualquiera bloquea el inventario de todos los comerciantes gratis y todo el día');

  avanzar(60 * 25);                        // pasadas las 24 h
  const o = await p2p.tomar({ anuncioId: a._id, tomadorId: COMPRADOR, cantidad: wei(5) });
  decir(o.estado === 'creada', 'y al día siguiente vuelve a poder', 'es un freno, no una expulsión');
}

// ── 7 · lo que no se puede pedir ────────────────────────────────────────────
titulo('lo que el anuncio no permite');
await limpiar();
{
  const a = await unAnuncio({ minFiat: '50000', maxFiat: '100000' });
  let e = null;
  try { await p2p.tomar({ anuncioId: a._id, tomadorId: COMPRADOR, cantidad: wei(1) }); } catch (x) { e = x; }
  decir(e?.codigo === 'FUERA_DE_LIMITE', 'por debajo del mínimo del anuncio, no entra');

  e = null;
  try { await p2p.tomar({ anuncioId: a._id, tomadorId: VENDEDOR, montoFiat: '60000' }); } catch (x) { e = x; }
  decir(e?.codigo === 'ES_SUYO', 'y nadie toma su propio anuncio');

  e = null;
  try { await p2p.tomar({ anuncioId: a._id, tomadorId: COMPRADOR, cantidad: wei(3), montoFiat: '60000' }); } catch (x) { e = x; }
  decir(e?.codigo === 'MONTO', 'pedirla por cantidad Y por fiat a la vez se rechaza',
    'aceptar las dos deja al servidor eligiendo cuál obedece, y va a obedecer la que la persona no miraba');

  /* Con el mínimo bajo a propósito: si no, 3 ORIGEN caen por debajo del
     mínimo de este anuncio y salta FUERA_DE_LIMITE antes de llegar a mirar el
     inventario — que es lo que aquí se quiere probar. */
  const b = await unAnuncio({ cantidadTotal: wei(2), cantidadRestante: wei(2), minFiat: '100' });
  e = null;
  try { await p2p.tomar({ anuncioId: b._id, tomadorId: COMPRADOR, cantidad: wei(3) }); } catch (x) { e = x; }
  decir(e?.codigo === 'SIN_INVENTARIO', 'y no se puede tomar más de lo que el anuncio tiene');
}

// ── 8 · idempotencia y redondeo ─────────────────────────────────────────────
titulo('la misma llave, y el centavo');
await limpiar();
{
  const a = await unAnuncio();
  const o1 = await p2p.tomar({ anuncioId: a._id, tomadorId: COMPRADOR, cantidad: wei(10), ordenKey: 'k-1' });
  const o2 = await p2p.tomar({ anuncioId: a._id, tomadorId: COMPRADOR, cantidad: wei(10), ordenKey: 'k-1' });
  decir(String(o1._id) === String(o2._id), 'la misma ordenKey devuelve la MISMA orden, no una segunda');

  const s = await saldos();
  decir(s[VENDEDOR].res === BigInt(wei(10)), 'y solo se bloqueó la garantía una vez');

  /* El redondeo cae en contra de quien pide: hacia abajo, quien compra pagaría
     un centavo de menos por orden y ese centavo sale del que entrega. */
  decir(p2p.fiatDe('1', '2485') === '1', 'un wei suelto cuesta un centavo, no cero');
  decir(p2p.fiatDe(wei(1), '2485') === '2485', 'y un ORIGEN entero cuesta el precio exacto');
}

await mongoose.disconnect();
await servidor.stop();
console.log(fallos ? `\n${fallos} en rojo.\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
