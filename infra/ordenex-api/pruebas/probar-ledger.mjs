/* El ledger contra un Mongo de verdad (en memoria): las guardas bajo fuego.
 *
 *   node pruebas/probar-ledger.mjs
 *
 * Lo que el calce puro no puede probar es justamente lo que aqui se prueba:
 * que las cinco primitivas, contra un Mongo real, jamas dejan un saldo
 * negativo, que cada movimiento deja su rastro en `asientos`, que la doble
 * entrada cuadra (las operaciones internas suman cero por activo, y el total
 * es exactamente lo acreditado menos lo debitado), y que la guarda
 * lee-compara-escribe aguanta la carrera: dos debitos a la vez sobre el mismo
 * saldo y solo pasa el que cabe.
 *
 * Corre contra mongodb-memory-server (devDependencies). Si no esta instalado
 * se dice y se sale — sin fingir un verde que no se gano.
 */

let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = await import('mongodb-memory-server'));
} catch {
  console.log('mongodb-memory-server no esta instalado (falta npm install): esta prueba NO corrio y NO probo nada.');
  process.exit(0);
}

const { default: mongoose } = await import('mongoose');
const servidor = await MongoMemoryServer.create();
await mongoose.connect(servidor.getUri(), { dbName: 'ordenex_prueba' });

const { Cuenta, Asiento } = (await import('../models/index.js')).default;
const ledger = (await import('../lib/ledger.js')).default;
const { acreditar, debitar, reservar, liberar, ejecutarReserva } = ledger;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (que) => console.log(`\n── ${que} ${'─'.repeat(Math.max(2, 62 - que.length))}`);

const U = 10n ** 18n;
const w = (n) => (BigInt(n) * U).toString();
const cuentaDe = async (u, a) => {
  const c = await Cuenta.findOne({ userId: u, activo: a }).lean();
  return c ? { disponible: BigInt(c.disponible), reservado: BigInt(c.reservado) } : null;
};
const fallaCon = async (codigo, fn) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return e.codigo === codigo;
  }
};

decir('acreditar y debitar: la frontera con el exterior');
{
  await acreditar('ana', 'ORIGEN', w(100), 'dep:1');
  let c = await cuentaDe('ana', 'ORIGEN');
  comprobar(c.disponible === 100n * U && c.reservado === 0n, 'un deposito acredita el disponible');

  const a = await Asiento.findOne({ ref: 'dep:1' }).lean();
  comprobar(a?.tipo === 'acreditar' && a?.monto === w(100) && a?.saldoDespues === w(100),
    'y deja su asiento con el saldo despues', JSON.stringify(a));

  await debitar('ana', 'ORIGEN', w(30), 'ret:1');
  c = await cuentaDe('ana', 'ORIGEN');
  comprobar(c.disponible === 70n * U, 'un debito lo baja');

  comprobar(await fallaCon('SALDO_INSUFICIENTE', () => debitar('ana', 'ORIGEN', w(100), 'ret:2')),
    'debitar mas de lo que hay FALLA con SALDO_INSUFICIENTE');
  c = await cuentaDe('ana', 'ORIGEN');
  comprobar(c.disponible === 70n * U, 'y el saldo no se toco: nunca negativo');
  comprobar(await Asiento.countDocuments({ ref: 'ret:2' }) === 0,
    'ni quedo asiento de lo que no paso');

  comprobar(await fallaCon('SALDO_INSUFICIENTE', () => debitar('nadie', 'ORIGEN', w(1), 'ret:3')),
    'debitar a quien nunca tuvo cuenta tambien falla, no inventa saldo');
}

decir('montos que no son montos');
{
  for (const malo of ['0', '-5', '1.5', '1e18', '', 12, null, ' 7', w(1) + 'x']) {
    const ok = await fallaCon('MONTO_INVALIDO', () => acreditar('ana', 'ORIGEN', malo, 'malo:1'));
    comprobar(ok, `un monto ${JSON.stringify(malo)} se rechaza con MONTO_INVALIDO`);
  }
}

decir('reservar, liberar, ejecutar: la garantia');
{
  await reservar('ana', 'ORIGEN', w(50), 'orden:1');
  let c = await cuentaDe('ana', 'ORIGEN');
  comprobar(c.disponible === 20n * U && c.reservado === 50n * U,
    'reservar mueve disponible → reservado');

  const patas = await Asiento.find({ ref: 'orden:1' }).lean();
  const suma = patas.reduce((s, x) => s + BigInt(x.monto), 0n);
  comprobar(patas.length === 2 && suma === 0n,
    'con dos patas que suman cero: la doble entrada de la reserva');

  comprobar(await fallaCon('SALDO_INSUFICIENTE', () => reservar('ana', 'ORIGEN', w(21), 'orden:2')),
    'reservar mas del disponible falla');

  await liberar('ana', 'ORIGEN', w(10), 'orden:1');
  c = await cuentaDe('ana', 'ORIGEN');
  comprobar(c.disponible === 30n * U && c.reservado === 40n * U,
    'liberar la devuelve reservado → disponible');

  comprobar(await fallaCon('RESERVA_INSUFICIENTE', () => liberar('ana', 'ORIGEN', w(41), 'orden:1')),
    'liberar mas de lo reservado falla con RESERVA_INSUFICIENTE');

  await ejecutarReserva('ana', 'ORIGEN', w(40), 'beto', 'trato:1');
  c = await cuentaDe('ana', 'ORIGEN');
  const b = await cuentaDe('beto', 'ORIGEN');
  comprobar(c.reservado === 0n && c.disponible === 30n * U,
    'ejecutar consume la reserva del que paga');
  comprobar(b.disponible === 40n * U && b.reservado === 0n,
    'y aparece en el disponible del que cobra');

  const patasT = await Asiento.find({ ref: 'trato:1' }).lean();
  comprobar(patasT.length === 2 && patasT.reduce((s, x) => s + BigInt(x.monto), 0n) === 0n,
    'dos patas que suman cero, una por cada punta');
  comprobar(patasT.every((x) => x.contraparte === (x.userId === 'ana' ? 'beto' : 'ana')),
    'cada pata dice quien esta enfrente');

  comprobar(await fallaCon('RESERVA_INSUFICIENTE', () => ejecutarReserva('ana', 'ORIGEN', w(1), 'beto', 'trato:2')),
    'ejecutar sin reserva falla');
  comprobar(await fallaCon('CONTRAPARTE_INVALIDA', () => ejecutarReserva('beto', 'ORIGEN', w(1), 'beto', 'trato:3')),
    'y ejecutar contra uno mismo se rechaza: eso es liberar, no ejecutar');
}

decir('la doble entrada cuadra');
{
  // Un circuito completo mas, con otro activo, para ensuciar la suma.
  await acreditar('carla', 'AUKA', w(8), 'dep:2');
  await reservar('carla', 'AUKA', w(5), 'orden:3');
  await ejecutarReserva('carla', 'AUKA', w(3), 'dani', 'trato:4');
  await liberar('carla', 'AUKA', w(2), 'orden:3');
  await debitar('dani', 'AUKA', w(1), 'ret:4');

  const asientos = await Asiento.find({}).lean();
  const INTERNOS = ['reservar-sale', 'reservar-entra', 'liberar-sale', 'liberar-entra', 'ejecutar-sale', 'ejecutar-entra'];
  const porActivo = new Map();
  const internos = new Map();
  const frontera = new Map();
  for (const a of asientos) {
    const m = BigInt(a.monto);
    porActivo.set(a.activo, (porActivo.get(a.activo) ?? 0n) + m);
    if (INTERNOS.includes(a.tipo)) internos.set(a.activo, (internos.get(a.activo) ?? 0n) + m);
    else frontera.set(a.activo, (frontera.get(a.activo) ?? 0n) + m);
  }
  comprobar([...internos.values()].every((v) => v === 0n),
    'las operaciones internas suman CERO por activo',
    JSON.stringify([...internos].map(([k, v]) => `${k}:${v}`)));
  comprobar([...porActivo].every(([k, v]) => v === (frontera.get(k) ?? 0n)),
    'y el total del ledger es exactamente lo acreditado menos lo debitado');

  // La otra cara: los saldos de las cuentas cuadran con los asientos.
  for (const activo of porActivo.keys()) {
    const cuentas = await Cuenta.find({ activo }).lean();
    const enCuentas = cuentas.reduce((s, c) => s + BigInt(c.disponible) + BigInt(c.reservado), 0n);
    comprobar(enCuentas === porActivo.get(activo),
      `lo que dicen las cuentas de ${activo} es lo que dicen los asientos`,
      `cuentas ${enCuentas} · asientos ${porActivo.get(activo)}`);
  }
}

decir('la carrera: dos debitos a la vez sobre el mismo saldo');
{
  await acreditar('remo', 'ORIGEN', w(100), 'dep:3');
  const res = await Promise.allSettled([
    debitar('remo', 'ORIGEN', w(60), 'carrera:a'),
    debitar('remo', 'ORIGEN', w(60), 'carrera:b'),
  ]);
  const pasaron = res.filter((r) => r.status === 'fulfilled').length;
  comprobar(pasaron === 1, 'de dos debitos de 60 sobre 100, pasa EXACTAMENTE uno',
    res.map((r) => r.status).join(','));
  const c = await cuentaDe('remo', 'ORIGEN');
  comprobar(c.disponible === 40n * U, 'y el saldo queda en 40, no en -20 ni en 100',
    `disponible=${c.disponible}`);
  const lineas = await Asiento.countDocuments({ ref: { $in: ['carrera:a', 'carrera:b'] } });
  comprobar(lineas === 1, 'con UN solo asiento: el del debito que paso');

  // Mas brutal: diez debitos de 15 sobre 100. Caben seis, ni uno mas.
  await acreditar('rita', 'ORIGEN', w(100), 'dep:4');
  const diez = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) => debitar('rita', 'ORIGEN', w(15), `carrera:${i}`))
  );
  const ok10 = diez.filter((r) => r.status === 'fulfilled').length;
  const c10 = await cuentaDe('rita', 'ORIGEN');
  comprobar(ok10 === 6 && c10.disponible === 10n * U,
    'de diez debitos de 15 sobre 100 pasan seis y quedan 10',
    `pasaron=${ok10} disponible=${c10.disponible}`);
  comprobar(diez.filter((r) => r.status === 'rejected').every((r) => r.reason?.codigo === 'SALDO_INSUFICIENTE'),
    'y los que no cupieron fallaron por saldo, no por la guarda');

  // Y la carrera de la garantia: dos reservas de 60 sobre 100.
  await acreditar('saul', 'ORIGEN', w(100), 'dep:5');
  const rr = await Promise.allSettled([
    reservar('saul', 'ORIGEN', w(60), 'orden:r1'),
    reservar('saul', 'ORIGEN', w(60), 'orden:r2'),
  ]);
  const cs = await cuentaDe('saul', 'ORIGEN');
  comprobar(rr.filter((r) => r.status === 'fulfilled').length === 1
    && cs.disponible === 40n * U && cs.reservado === 60n * U,
    'dos reservas de 60 sobre 100: entra una, la otra rebota',
    `disponible=${cs.disponible} reservado=${cs.reservado}`);
}

await mongoose.disconnect();
await servidor.stop();

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
