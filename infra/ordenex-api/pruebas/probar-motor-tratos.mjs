/* La cascara del motor contra un Mongo de verdad (en memoria): el trato como
 * unidad, y el libro que se recarga sin la bomba dentro.
 *
 *   node pruebas/probar-motor-tratos.mjs
 *
 * probar-motor.mjs castiga el calce PURO, que no toca dinero. Esta prueba
 * castiga lo otro, que es donde el dinero se mueve de verdad:
 *
 *  - un trato entero mueve las dos patas y cuadra en el ledger;
 *  - MONTADO EL FALLO en la pata del pago, no queda ni un wei movido: el
 *    activo que ya habia salido de la reserva del vendedor VUELVE a su
 *    reserva, y las restas de las dos ordenes vuelven a lo que decian;
 *  - la resta de la entrante baja trato a trato, no despues del bucle, asi que
 *    un bucle roto a mitad no deja una orden prometiendo mas de lo que su
 *    garantia aguanta;
 *  - `cargarLibros` deriva la resta de los TRATOS y corrige la base cuando la
 *    orden guardada miente, que es como se desarmaba la bomba de recargar;
 *  - y al final, la de siempre: la doble entrada del ledger cuadra.
 *
 * El fallo se monta como lo monto la auditoria: se envenena `ejecutarReserva`
 * para que truene en una pata concreta. Sin el arreglo, la comprobacion de los
 * saldos se pone en rojo sola.
 *
 * CADA BLOQUE USA SU PROPIO MERCADO. `cargarLibros` recarga los libros de toda
 * la casa, y un bloque que deja ordenes abiertas se las encontraria el
 * siguiente calzando contra lo que no toca. Un mercado por bloque es lo que
 * deja que cada uno se lea solo.
 *
 * Corre contra mongodb-memory-server (devDependencies). Si no esta instalado
 * se dice y se sale, sin fingir un verde que no se gano.
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

const { Cuenta, Asiento, Orden, Trato } = (await import('../models/index.js')).default;
const ledger = (await import('../lib/ledger.js')).default;
const motor = (await import('../lib/motor.js')).default;

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
  return c ? { disponible: BigInt(c.disponible), reservado: BigInt(c.reservado) } : { disponible: 0n, reservado: 0n };
};

/* El PATRIMONIO de alguien en un activo: disponible + reservado.
 *
 * Es lo que hay que mirar para saber si un trato deshecho dejo dinero por el
 * camino, y no el disponible a secas. Colocar una orden mueve saldo de
 * disponible a reservado por su cuenta, y esa reserva es legitima: la orden
 * sigue viva. Lo que un trato deshecho NO puede haber cambiado es cuanto tiene
 * cada uno en total, porque un trato deshecho no paso. */
const patrimonio = async (quienes, activos) => {
  const f = {};
  for (const q of quienes) {
    f[q] = {};
    for (const a of activos) {
      const c = await cuentaDe(q, a);
      f[q][a] = (c.disponible + c.reservado).toString();
    }
  }
  return f;
};
const mismo = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* El veneno: envuelve `ejecutarReserva` para que truene la primera pata que
 * cumpla el predicado. Es exactamente el disparador que ledger.js ya
 * documenta: el asiento que falla DESPUES de mover el saldo. Devuelve la
 * funcion que lo quita. */
const bueno = ledger.ejecutarReserva;
function envenenar(predicado, codigo = 'ASIENTO_PERDIDO') {
  let n = 0;
  ledger.ejecutarReserva = async (userId, activo, monto, aQuien, ref) => {
    if (predicado({ userId, activo, monto, aQuien, ref }, ++n)) {
      const e = new Error(`veneno de prueba en la pata ${n} (${activo})`);
      e.codigo = codigo;
      e.status = 500;
      throw e;
    }
    return bueno(userId, activo, monto, aQuien, ref);
  };
  return () => { ledger.ejecutarReserva = bueno; };
}
// La pata del pago es la de ORIGEN: por ahi entra el veneno de la auditoria.
const laPataDelPago = (nEsima = 1) => {
  let vistas = 0;
  return ({ activo }) => activo === 'ORIGEN' && ++vistas === nEsima;
};

// ── La plata de partida ─────────────────────────────────────────────────────
await ledger.acreditar('ana', 'AUKA', w(100), 'semilla:ana-auka');
await ledger.acreditar('ana', 'AGKA', w(100), 'semilla:ana-agka');
await ledger.acreditar('ana', 'MNKA', w(100), 'semilla:ana-mnka');
await ledger.acreditar('beto', 'ORIGEN', w(5000), 'semilla:beto');
await motor.cargarLibros();

decir('un trato entero: las dos patas se mueven y cuadran');
{
  const venta = await motor.colocar({
    userId: 'ana', mercado: 'AUKA-ORIGEN', lado: 'venta', tipo: 'limite',
    precio: w(2), cantidad: w(10),
  });
  comprobar(venta.orden.estado === 'abierta' && venta.tratos.length === 0,
    'la venta descansa en el libro', String(venta.orden.estado));
  let a = await cuentaDe('ana', 'AUKA');
  comprobar(a.disponible === 90n * U && a.reservado === 10n * U,
    'con sus 10 AUKA en garantia', `${a.disponible}/${a.reservado}`);

  const compra = await motor.colocar({
    userId: 'beto', mercado: 'AUKA-ORIGEN', lado: 'compra', tipo: 'limite',
    precio: w(2), cantidad: w(10),
  });
  comprobar(compra.tratos.length === 1 && compra.orden.estado === 'ejecutada',
    'la compra que cruza calza entera');

  a = await cuentaDe('ana', 'AUKA');
  const ao = await cuentaDe('ana', 'ORIGEN');
  const b = await cuentaDe('beto', 'AUKA');
  const bo = await cuentaDe('beto', 'ORIGEN');
  comprobar(a.disponible === 90n * U && a.reservado === 0n && b.disponible === 10n * U,
    'los 10 AUKA pasaron de la reserva de ana al disponible de beto',
    `ana=${a.disponible}/${a.reservado} beto=${b.disponible}`);
  comprobar(ao.disponible === 20n * U && bo.disponible === 4980n * U && bo.reservado === 0n,
    'y los 20 ORIGEN, de la reserva de beto al disponible de ana',
    `ana=${ao.disponible} beto=${bo.disponible}/${bo.reservado}`);

  const vendida = await Orden.findById(venta.orden._id).lean();
  comprobar(vendida.resta === '0' && vendida.estado === 'ejecutada',
    'la pasiva quedo en cero y ejecutada en la base');
}

decir('MONTADO EL FALLO: revienta la pata del pago y no queda un wei movido');
{
  const venta = await motor.colocar({
    userId: 'ana', mercado: 'AUKA-ORIGEN', lado: 'venta', tipo: 'limite',
    precio: w(2), cantidad: w(10),
  });
  const antes = await patrimonio(['ana', 'beto', 'casa'], ['AUKA', 'ORIGEN']);
  const anaAntes = await cuentaDe('ana', 'AUKA');
  const restaAntes = (await Orden.findById(venta.orden._id).lean()).resta;
  const tratosAntes = await Trato.countDocuments({ mercado: 'AUKA-ORIGEN' });

  // El caso exacto de la auditoria: la pata del activo pasa (los AUKA ya
  // salieron de la reserva de ana) y la del pago no. Antes de esto, nadie
  // deshacia la primera y ana entregaba y cobraba cero.
  const limpiar = envenenar(laPataDelPago());
  let error = null;
  try {
    await motor.colocar({
      userId: 'beto', mercado: 'AUKA-ORIGEN', lado: 'compra', tipo: 'limite',
      precio: w(2), cantidad: w(10),
    });
  } catch (e) {
    error = e;
  }
  limpiar();

  comprobar(error !== null && error.codigo === 'MOTOR_ROTO',
    'colocar truena y el motor se declara frio', String(error && error.codigo));

  const despues = await patrimonio(['ana', 'beto', 'casa'], ['AUKA', 'ORIGEN']);
  comprobar(mismo(antes, despues),
    'NADIE gano ni perdio un wei: el trato deshecho no paso',
    `antes ${JSON.stringify(antes)}\n           despues ${JSON.stringify(despues)}`);

  const anaDespues = await cuentaDe('ana', 'AUKA');
  comprobar(anaDespues.reservado === anaAntes.reservado && anaDespues.disponible === anaAntes.disponible,
    'y los AUKA de ana volvieron a SU RESERVA, no a un disponible de consuelo',
    `antes ${anaAntes.disponible}/${anaAntes.reservado} · despues ${anaDespues.disponible}/${anaDespues.reservado}`);

  const pasiva = await Orden.findById(venta.orden._id).lean();
  comprobar(pasiva.resta === restaAntes && pasiva.estado === 'abierta',
    'la resta de la pasiva volvio a lo que decia', `resta=${pasiva.resta} estado=${pasiva.estado}`);

  const tratosDespues = await Trato.countDocuments({ mercado: 'AUKA-ORIGEN' });
  comprobar(tratosDespues === tratosAntes,
    'y NO quedo Trato del trato que se deshizo: el papel se escribe al final',
    `antes=${tratosAntes} despues=${tratosDespues}`);

  // El rastro cuenta la historia entera y suma cero bajo la misma ref: se
  // movio y se devolvio, que es como se lee en los asientos que esto no paso.
  const ref = (await Asiento.findOne({ tipo: 'revertir-entra' }).lean())?.ref;
  const patas = await Asiento.find({ ref }).lean();
  comprobar(patas.length === 4 && patas.reduce((s, x) => s + BigInt(x.monto), 0n) === 0n,
    'los asientos del trato deshecho suman cero bajo su propia ref',
    `ref=${ref} patas=${patas.length}`);
}

decir('la entrante baja su resta trato a trato, no despues del bucle');
let compraAMedias = null;
{
  // Tres ventas chicas y una compra que se las lleva. Se envenena la pata del
  // pago del TERCER trato: los dos primeros quedan hechos y el tercero se
  // deshace, asi que la compra tiene que quedar en la base con la resta que su
  // garantia aguanta, ni un wei mas.
  await motor.cargarLibros();
  for (let i = 0; i < 3; i++) {
    await motor.colocar({
      userId: 'ana', mercado: 'AGKA-ORIGEN', lado: 'venta', tipo: 'limite',
      precio: w(2), cantidad: w(5),
    });
  }
  const antes = await patrimonio(['ana', 'beto', 'casa'], ['AGKA', 'ORIGEN']);

  const limpiar = envenenar(laPataDelPago(3));
  let error = null;
  try {
    await motor.colocar({
      userId: 'beto', mercado: 'AGKA-ORIGEN', lado: 'compra', tipo: 'limite',
      precio: w(2), cantidad: w(15),
    });
  } catch (e) {
    error = e;
  }
  limpiar();
  comprobar(error !== null && error.codigo === 'MOTOR_ROTO',
    'el bucle se cae en el trato 3 de 3', String(error && error.codigo));

  compraAMedias = await Orden.findOne({ userId: 'beto', mercado: 'AGKA-ORIGEN' }).lean();
  const suyos = await Trato.find({ ordenCompra: String(compraAMedias._id) }).lean();
  const calzado = suyos.reduce((s, t) => s + BigInt(t.cantidad), 0n);
  comprobar(calzado === 10n * U, 'quedaron DOS tratos hechos (10 AGKA), no tres', `calzado=${calzado}`);

  comprobar(BigInt(compraAMedias.resta) === BigInt(compraAMedias.cantidad) - calzado,
    'y la compra quedo en la base con resta = cantidad - lo calzado, no con la cantidad entera',
    `resta=${compraAMedias.resta} esperada=${BigInt(compraAMedias.cantidad) - calzado}`);

  // Los dos tratos buenos SI movieron dinero; el tercero, ni un wei. La
  // cuenta se hace contra lo que deberian haber movido exactamente.
  const despues = await patrimonio(['ana', 'beto', 'casa'], ['AGKA', 'ORIGEN']);
  comprobar(BigInt(antes.ana.AGKA) - BigInt(despues.ana.AGKA) === 10n * U
    && BigInt(despues.beto.AGKA) - BigInt(antes.beto.AGKA) === 10n * U
    && BigInt(antes.beto.ORIGEN) - BigInt(despues.beto.ORIGEN) === 20n * U,
    'se movio EXACTAMENTE lo de los dos tratos buenos: 10 AGKA por 20 ORIGEN',
    `${JSON.stringify(antes)}\n           ${JSON.stringify(despues)}`);
}

decir('cargarLibros: la resta se deriva de los tratos, no del campo guardado');
{
  // Se mete a mano la averia que este arreglo desarma: una orden abierta que
  // dice "me quedan 15" cuando sus tratos dicen que ya calzo 10. Antes el
  // libro se cargaba con esa mentira, con garantia para 5.
  await Orden.updateOne({ _id: compraAMedias._id }, { $set: { resta: w(15), estado: 'abierta' } });

  await motor.cargarLibros();
  const libros = motor.librosEnMemoria();
  const enLibro = libros.get('AGKA-ORIGEN')?.compras.find((o) => o.id === String(compraAMedias._id));
  comprobar(enLibro && enLibro.resta === w(5),
    'el libro la carga con 5, que es lo que sus tratos dejan viva',
    `resta en libro=${enLibro && enLibro.resta}`);

  const corregida = await Orden.findById(compraAMedias._id).lean();
  comprobar(corregida.resta === w(5),
    'y la base se corrige: memoria y Mongo cuentan la MISMA historia', `resta=${corregida.resta}`);

  // Y la garantia alcanza para lo que el libro promete: 5 AGKA a 2 ORIGEN son
  // 10, y la reserva viva de beto tiene que dar para eso.
  const b = await cuentaDe('beto', 'ORIGEN');
  comprobar(b.reservado >= 10n * U,
    'la reserva viva sostiene la resta que el libro promete', `reservado=${b.reservado}`);
}

decir('una abierta con la resta ya en cero se cierra y no entra al libro');
{
  const venta = await motor.colocar({
    userId: 'ana', mercado: 'MNKA-ORIGEN', lado: 'venta', tipo: 'limite',
    precio: w(9), cantidad: w(3),
  });
  // Se finge lo que deja un cierre a medias: calzada del todo, sin anotarlo.
  await Trato.create({
    mercado: 'MNKA-ORIGEN', precio: w(9), cantidad: w(3), lado: 'compra',
    compradorId: 'beto', vendedorId: 'ana',
    ordenCompra: 'inventada', ordenVenta: String(venta.orden._id), en: new Date(),
  });

  await motor.cargarLibros();
  const libros = motor.librosEnMemoria();
  const sigue = libros.get('MNKA-ORIGEN')?.ventas.some((o) => o.id === String(venta.orden._id));
  comprobar(!sigue, 'no queda en el libro: una pasiva de resta cero calzaria tratos de cero wei');
  const cerrada = await Orden.findById(venta.orden._id).lean();
  comprobar(cerrada.estado === 'ejecutada' && cerrada.resta === '0',
    'y se anota como ejecutada en la base', `${cerrada.estado}/${cerrada.resta}`);
}

decir('la doble entrada cuadra despues de todo el trajin');
{
  const asientos = await Asiento.find({}).lean();
  const INTERNOS = [
    'reservar-sale', 'reservar-entra', 'liberar-sale', 'liberar-entra',
    'ejecutar-sale', 'ejecutar-entra', 'revertir-sale', 'revertir-entra',
  ];
  const internos = new Map();
  const total = new Map();
  const frontera = new Map();
  for (const x of asientos) {
    const m = BigInt(x.monto);
    total.set(x.activo, (total.get(x.activo) ?? 0n) + m);
    if (INTERNOS.includes(x.tipo)) internos.set(x.activo, (internos.get(x.activo) ?? 0n) + m);
    else frontera.set(x.activo, (frontera.get(x.activo) ?? 0n) + m);
  }
  comprobar([...internos.values()].every((v) => v === 0n),
    'lo interno suma CERO por activo, reversos incluidos',
    JSON.stringify([...internos].map(([k, v]) => `${k}:${v}`)));
  comprobar([...total].every(([k, v]) => v === (frontera.get(k) ?? 0n)),
    'y el total del ledger sigue siendo lo que entro por la frontera');

  for (const activo of total.keys()) {
    const cuentas = await Cuenta.find({ activo }).lean();
    const enCuentas = cuentas.reduce((s, c) => s + BigInt(c.disponible) + BigInt(c.reservado), 0n);
    comprobar(enCuentas === total.get(activo),
      `lo que dicen las cuentas de ${activo} es lo que dicen los asientos`,
      `cuentas ${enCuentas} · asientos ${total.get(activo)}`);
  }
}

await mongoose.disconnect();
await servidor.stop();

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
