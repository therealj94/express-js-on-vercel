/* La puerta del dinero, contra un Mongo de verdad (en memoria).
 *
 *   node pruebas/probar-asientos.mjs
 *
 * Lo que el cálculo puro no puede probar es justo esto: que bajo fuego —dos
 * retiros a la vez sobre el mismo saldo— NO salen los dos. Y que el atajo
 * (`saldos`) y el libro (`asientos`) dicen siempre lo mismo.
 *
 * Corre contra mongodb-memory-server. Si no está instalado, se dice y se sale:
 * sin fingir un verde que no se ganó.
 */
let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = await import('mongodb-memory-server'));
} catch {
  console.log('mongodb-memory-server no está instalado (falta npm install): esta prueba NO corrió y NO probó nada.');
  process.exit(0);
}

const { default: mongoose } = await import('mongoose');
const servidor = await MongoMemoryServer.create();
await mongoose.connect(servidor.getUri(), { dbName: 'aucorp_prueba' });

const { Asiento, Saldo } = (await import('../models/index.js')).default;
const { asentar, saldoDe, saldoReal, reconciliar } = (await import('../lib/asientos.js')).default;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (q) => console.log(`\n── ${q} ${'─'.repeat(Math.max(2, 62 - q.length))}`);

const deposito = (ref, quien, monto) => ({
  ref, glosa: `Depósito de ${quien}`,
  lineas: [
    { cuenta: 'banco.corresponsal', tipo: 'activo', moneda: 'USD', debe: monto },
    { cuenta: `cliente:${quien}`, tipo: 'pasivo', moneda: 'USD', haber: monto },
  ],
});
const retiro = (ref, quien, monto) => ({
  ref, glosa: `Retiro de ${quien}`,
  lineas: [
    { cuenta: `cliente:${quien}`, tipo: 'pasivo', moneda: 'USD', debe: monto },
    { cuenta: 'banco.corresponsal', tipo: 'activo', moneda: 'USD', haber: monto },
  ],
});

decir('un depósito mueve el atajo Y deja el asiento');
{
  await asentar(deposito('d1', 'ana', '10000'), { clase: 'deposito' });
  comprobar(await saldoDe('cliente:ana', 'USD') === '10000', 'el atajo dice 100.00');
  comprobar(await saldoReal('cliente:ana', 'USD') === '10000', 'y el libro dice lo mismo');
  comprobar(await Asiento.countDocuments({}) === 1, 'y hay exactamente un asiento');
}

decir('EL SELLO DE IDEMPOTENCIA: reintentar no duplica dinero');
{
  const r = await asentar(deposito('d1', 'ana', '10000'), { clase: 'deposito' });
  comprobar(r.repetido === true, 'el segundo intento se reconoce como repetido');
  comprobar(await saldoDe('cliente:ana', 'USD') === '10000',
    'y el saldo NO se duplicó', await saldoDe('cliente:ana', 'USD'));
  comprobar(await Asiento.countDocuments({}) === 1, 'y sigue habiendo un solo asiento');
}

decir('NUNCA un saldo negativo de cliente');
{
  let msg = null;
  try { await asentar(retiro('r-malo', 'ana', '20000')); } catch (e) { msg = e.codigo || e.message; }
  comprobar(msg === 'SALDO_INSUFICIENTE', 'un retiro por más de lo que hay se rechaza', String(msg));
  comprobar(await saldoDe('cliente:ana', 'USD') === '10000', 'y el saldo quedó intacto');
  comprobar(await Asiento.findOne({ ref: 'r-malo' }) === null,
    'y NO quedó un asiento a medias del intento fallido');
  const s = await reconciliar();
  comprobar(s.problemas.length === 0, 'el atajo y el libro siguen calzando tras el rechazo',
    JSON.stringify(s.problemas));
}

decir('LA CARRERA: dos retiros a la vez, solo cabe uno');
{
  // Ana tiene 100.00. Se lanzan DOS retiros de 60.00 al mismo tiempo. Si la
  // comprobación del saldo estuviera fuera de la guarda, los dos leerían 100,
  // los dos pasarían, y saldrían 120.00 de una cuenta de 100.00.
  const dos = await Promise.allSettled([
    asentar(retiro('r-a', 'ana', '6000')),
    asentar(retiro('r-b', 'ana', '6000')),
  ]);
  const pasaron = dos.filter((x) => x.status === 'fulfilled').length;
  comprobar(pasaron === 1, 'pasó exactamente UNO de los dos retiros',
    dos.map((x) => x.status === 'fulfilled' ? 'ok' : (x.reason.codigo || x.reason.message)).join(' / '));
  comprobar(await saldoDe('cliente:ana', 'USD') === '4000',
    'y a Ana le quedan 40.00, no -20.00', await saldoDe('cliente:ana', 'USD'));
  comprobar(await saldoReal('cliente:ana', 'USD') === '4000', 'el libro dice lo mismo');
}

decir('el libro manda sobre el atajo');
{
  // Se ensucia el atajo a mano —lo que pasaría si un proceso se muriera en el
  // peor momento— y se comprueba que la reconciliación lo caza y lo arregla
  // CON EL LIBRO, no al revés.
  await Saldo.updateOne({ cuenta: 'cliente:ana', moneda: 'USD' }, { $set: { monto: '999999' } });
  const antes = await reconciliar();
  comprobar(antes.problemas.length === 1, 'la reconciliación caza el descuadre',
    JSON.stringify(antes.problemas));

  const arreglo = await reconciliar({ arreglar: true });
  comprobar(arreglo.problemas.length === 1, 'lo arregla');
  comprobar(await saldoDe('cliente:ana', 'USD') === '4000',
    'y el atajo vuelve a lo que dice el libro, no al revés');
  comprobar(await saldoReal('cliente:ana', 'USD') === '4000', 'el libro nunca se tocó');
}

decir('varias monedas conviven sin mezclarse');
{
  await asentar({
    ref: 'd-hnl', glosa: 'Depósito en lempiras de Beto',
    lineas: [
      { cuenta: 'banco.hn', tipo: 'activo', moneda: 'HNL', debe: '250000' },
      { cuenta: 'cliente:beto', tipo: 'pasivo', moneda: 'HNL', haber: '250000' },
    ],
  }, { clase: 'deposito' });
  comprobar(await saldoDe('cliente:beto', 'HNL') === '250000', 'Beto tiene 2500.00 HNL');
  comprobar(await saldoDe('cliente:beto', 'USD') === '0',
    'y CERO dólares — no se le contagia el saldo de una moneda a la otra');
}

decir('un asiento que no cuadra ni siquiera toca la base');
{
  const antes = await Asiento.countDocuments({});
  let msg = null;
  try {
    await asentar({ ref: 'x', glosa: 'descuadrado', lineas: [
      { cuenta: 'banco.corresponsal', tipo: 'activo', moneda: 'USD', debe: '100' },
      { cuenta: 'cliente:ana', tipo: 'pasivo', moneda: 'USD', haber: '99' },
    ]});
  } catch (e) { msg = e.message; }
  comprobar(msg !== null, 'se rechaza antes de escribir nada', String(msg));
  comprobar(await Asiento.countDocuments({}) === antes, 'y el número de asientos no cambió');
  const s = await reconciliar();
  comprobar(s.problemas.length === 0, 'y todo sigue calzando');
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
await mongoose.disconnect();
await servidor.stop();
process.exit(fallos ? 1 : 0);
