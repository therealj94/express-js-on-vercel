// El motor de calce: puro por dentro, con efectos por fuera.
//
// El corazon es `calzar`: una funcion pura — sin Mongo, sin reloj, sin azar —
// que recibe un libro y una orden y devuelve tratos, resto y el libro nuevo.
// Pura a proposito: el calce es el sitio donde un bug le da el dinero de uno
// al otro, y lo que no se puede probar hasta el hartazgo sin levantar medio
// backend, no se prueba. pruebas/probar-motor.mjs la castiga con quinientas
// ordenes al azar sin tocar una base de datos.
//
// Alrededor, la cascara con estado: reserva previa en el ledger, aplicacion
// de los tratos, persistencia y velas. UNA cola-promesa por mercado: corre un
// solo dyno, y encadenar cada operacion a la anterior elimina las carreras
// sin locks — dos ordenes al mismo mercado entran en fila, a mercados
// distintos corren en paralelo, que es exactamente lo que se quiere.
//
// LA RESERVA SE CALCULA SIMULANDO PRIMERO. `calzar` no tiene efectos, asi que
// se puede llamar ANTES de tocar el ledger para saber exactamente cuanto hay
// que reservar — y como la cola serializa el mercado, entre la simulacion y
// la aplicacion el libro no puede moverse: la simulacion ES el resultado.
// Esto resuelve el unico caso incomodo, la compra a mercado, que no tiene
// precio con el que calcular un notional a ciegas.
//
// UN TRATO ES TODO O NADA. Mueve dos patas de dinero en sentidos opuestos y
// baja dos restas, y sin conjunto de replicas no hay transaccion que las
// abrace, asi que `aplicarTrato` lleva la cuenta de lo que ya movio y lo
// deshace en orden inverso si algo se cae. El argumento completo, y por que
// compensacion y no sesion de Mongo, esta arriba de esa funcion. El corolario
// vive en `cargarLibros`: al recargar no se le cree a la `resta` guardada, se
// deriva de los tratos, que son el unico papel que no existe hasta que el
// dinero ya se movio.
//
// EL REDONDEO, dicho una vez y para siempre: todo cociente va con floor, y el
// floor siempre pierde en contra de quien cobra, jamas crea wei. El pago de
// un trato es floor(cantidad × precio / 1e18); la fraccion de wei que ese
// floor deja sin pagar no existe para nadie. La reserva de una compra limite
// se toma entera al colocar y lo que sobre — por calzar a mejor precio o por
// polvo de floor — se libera cuando la orden termina, no antes: liberar de a
// gotas exigiria una contabilidad por trato que no compra nada.

const ORIGEN_WEI = 10n ** 18n;

// Requires perezosos, y no por velocidad: probar el calce puro no puede
// exigir Mongo, asi que este archivo tiene que poder importarse sin que
// ningun modelo ni el ledger se carguen. Se piden la primera vez que la
// cascara los necesita. `velas` lo implementa otro modulo y puede no existir
// todavia — por eso ademas va envuelto donde se usa.
let _ledger = null;
let _modelos = null;
let _velas = null;
const elLedger = () => (_ledger ??= require('./ledger'));
const losModelos = () => (_modelos ??= require('../models'));

function fallo(codigo, status, mensaje) {
  const e = new Error(mensaje);
  e.codigo = codigo;
  e.status = status;
  return e;
}

const menor = (a, b) => (a < b ? a : b);

/** Lo que paga el comprador por `cantidad` wei del activo a `precio` wei de
 *  ORIGEN por unidad entera. Floor: ver el ensayo del redondeo. */
function pagoDe(cantidad, precio) {
  return (BigInt(cantidad) * BigInt(precio)) / ORIGEN_WEI;
}

// ORDENEX_COMISION_PPM: partes por millon sobre lo recibido (2500 = 0,25%).
// Sin la variable: 0, y es deliberado — igual que OG_COMISION_ORIGEN en la
// wallet: encender un cobro se hace a proposito, no por defecto. Con tope de
// cordura: 50.000 ppm ya es un 5% por lado, cualquier cosa por encima es un
// dedazo, no una decision.
function comisionPpm() {
  const v = (process.env.ORDENEX_COMISION_PPM || '').trim();
  if (!v) return 0n;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return 0n;
  if (n > 50000) {
    console.error(`[motor] ORDENEX_COMISION_PPM=${v} es demasiado alta; se ignora`);
    return 0n;
  }
  return BigInt(n);
}

// ════════════════════════════════════════════════════════════════════════════
// EL CALCE PURO
// ════════════════════════════════════════════════════════════════════════════

// ¿Descansa `a` antes que `b` en su lado del libro? Precio-tiempo: mejor
// precio primero; a igual precio, la mas vieja; y `seq` (un contador que pone
// la cascara) desempata dentro del mismo milisegundo — el reloj de un dyno no
// distingue dos ordenes seguidas, y el empate no puede quedar al azar.
function antesQue(a, b, esCompra) {
  const pa = BigInt(a.precio);
  const pb = BigInt(b.precio);
  if (pa !== pb) return esCompra ? pa > pb : pa < pb;
  if ((a.en ?? 0) !== (b.en ?? 0)) return (a.en ?? 0) < (b.en ?? 0);
  return (a.seq ?? 0) < (b.seq ?? 0);
}

function insertarDescansando(lista, orden, esCompra) {
  let i = 0;
  while (i < lista.length && !antesQue(orden, lista[i], esCompra)) i++;
  lista.splice(i, 0, orden);
}

/**
 * El calce. Recibe el libro de un mercado y una orden entrante; devuelve
 * `{ tratos, resto, libro, motivo, resta }` sin tocar sus argumentos.
 *
 *  - Cruce al precio de la orden PASIVA: quien descansaba puso su precio
 *    primero y el agresor lo acepta — el agresor nunca paga mas de lo que
 *    pidio, y a veces menos.
 *  - Una orden de mercado consume el libro y lo que no calce se cancela:
 *    jamas queda una orden de mercado descansando (motivo 'sin-liquidez').
 *  - Autocalce: si la siguiente pasiva que tocaria es del MISMO usuario, la
 *    entrante se rechaza en esa parte (motivo 'autocalce') y la pasiva queda
 *    intacta. Saltarsela seria calzar a peor precio que el propio — trading a
 *    traves de uno mismo — y dejarla descansar cruzada, un libro invalido.
 *    Wash trading no pinta velas de esta casa. Los tratos ya hechos antes de
 *    toparse con uno mismo quedan: eran contra terceros y son reales.
 *  - `resto` es la orden que queda descansando (limite con sobra), ya
 *    insertada en el libro nuevo en su lugar precio-tiempo; null si no
 *    descansa nada. `resta` es lo que quedo sin calzar, descanse o no.
 */
function calzar(libro, orden) {
  const compras = (libro?.compras ?? []).map((o) => ({ ...o }));
  const ventas = (libro?.ventas ?? []).map((o) => ({ ...o }));
  const esCompra = orden.lado === 'compra';
  const contra = esCompra ? ventas : compras;

  const tratos = [];
  let resta = BigInt(orden.resta ?? orden.cantidad);
  let motivo = null;

  while (resta > 0n && contra.length > 0) {
    const pasiva = contra[0];
    const cruza =
      orden.tipo === 'mercado' ||
      (esCompra
        ? BigInt(orden.precio) >= BigInt(pasiva.precio)
        : BigInt(orden.precio) <= BigInt(pasiva.precio));
    if (!cruza) break;
    if (pasiva.userId === orden.userId) {
      motivo = 'autocalce';
      break;
    }

    const cantidad = menor(resta, BigInt(pasiva.resta));
    tratos.push({
      mercado: orden.mercado,
      precio: pasiva.precio, // el precio lo puso la pasiva
      cantidad: cantidad.toString(),
      lado: orden.lado, // el lado de la agresora: lo que pinta el tape
      compradorId: esCompra ? orden.userId : pasiva.userId,
      vendedorId: esCompra ? pasiva.userId : orden.userId,
      ordenCompra: esCompra ? orden.id : pasiva.id,
      ordenVenta: esCompra ? pasiva.id : orden.id,
    });
    resta -= cantidad;
    pasiva.resta = (BigInt(pasiva.resta) - cantidad).toString();
    if (pasiva.resta === '0') contra.shift();
  }

  let resto = null;
  if (resta > 0n && !motivo) {
    if (orden.tipo === 'mercado') {
      motivo = 'sin-liquidez';
    } else {
      resto = { ...orden, resta: resta.toString() };
      insertarDescansando(esCompra ? compras : ventas, resto, esCompra);
    }
  }

  return { tratos, resto, libro: { compras, ventas }, motivo, resta: resta.toString() };
}

// ════════════════════════════════════════════════════════════════════════════
// LA CASCARA
// ════════════════════════════════════════════════════════════════════════════

// El estado del motor. LIBROS es la copia viva de las ordenes abiertas;
// RESERVAS lleva, por cada COMPRA limite abierta, cuanto ORIGEN le queda
// reservado (la venta no lo necesita: su reserva viva es exactamente su
// resta). `listos` es el interruptor fail-closed: hasta que cargarLibros()
// no reconstruya la memoria desde la base, calzar contra un libro vacio
// mentiria — habria ordenes reales descansando que el motor no ve.
const LIBROS = new Map();
const COLAS = new Map();
const RESERVAS = new Map();
let listos = false;
let seq = 0;

// La cola-promesa por mercado: cada tarea se encadena a la anterior. La cola
// guardada nunca queda rechazada (el .catch la sanea) para que un error de
// una orden no atasque el mercado entero.
function encolar(mercado, tarea) {
  const cola = COLAS.get(mercado) ?? Promise.resolve();
  const turno = cola.then(() => tarea());
  COLAS.set(mercado, turno.catch(() => {}));
  return turno;
}

function plano(doc) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  delete o.__v;
  return o;
}

/**
 * Baja la `resta` de una orden en `cantidad` y la guarda, apuntando en
 * `papeles` como estaba para poder devolverla si el trato se cae despues.
 *
 * Si el save truena, el documento en memoria se devuelve a lo que decia ANTES
 * de rebotar el error: un doc de Mongoose mutado y no guardado es una mentira
 * que el siguiente trato del mismo bucle escribiria como verdad.
 */
async function bajarResta(orden, cantidad, papeles) {
  const resta = orden.resta;
  const estado = orden.estado;
  orden.resta = (BigInt(resta) - cantidad).toString();
  if (BigInt(orden.resta) === 0n) orden.estado = 'ejecutada';
  try {
    await orden.save();
  } catch (e) {
    orden.resta = resta;
    orden.estado = estado;
    throw e;
  }
  papeles.push({ orden, resta, estado });
}

/**
 * Deshace, EN ORDEN INVERSO, lo que un trato alcanzo a mover antes de caerse.
 * Primero los papeles (las restas vuelven a su sitio) y despues el dinero: si
 * algo se quedara a medias, se prefiere una resta que sobra a un saldo que
 * falta, porque la resta la reconstruye `cargarLibros` de los tratos y el
 * saldo no lo reconstruye nadie.
 *
 * NINGUN fallo del reverso corta el reverso: cada pata deshecha es una menos
 * que arreglar a mano, y las que no se pudieron se cantan con la ref para que
 * un humano las encuentre. La ref es la MISMA del trato a proposito: asi las
 * patas del reverso caen en el mismo grupo que las de ida y ese grupo vuelve a
 * sumar cero, que es como se lee en los asientos que este trato no paso.
 */
async function deshacerTrato(movidas, papeles, ref) {
  const led = elLedger();
  let entero = true;

  for (let i = papeles.length - 1; i >= 0; i--) {
    const p = papeles[i];
    p.orden.resta = p.resta;
    p.orden.estado = p.estado;
    try {
      await p.orden.save();
    } catch (e) {
      entero = false;
      console.error(
        `[motor] CRITICO: el trato ${ref} se deshizo pero la orden ${p.orden._id} quedo con la resta bajada: ${e.message}`
      );
    }
  }

  for (let i = movidas.length - 1; i >= 0; i--) {
    const m = movidas[i];
    try {
      await led.revertirEjecucion(m.de, m.activo, m.monto, m.a, ref);
    } catch (e) {
      entero = false;
      console.error(
        `[motor] CRITICO: el trato ${ref} se deshizo pero ${m.monto} ${m.activo} siguen en ${m.a} en vez de la reserva de ${m.de}: ${e.codigo || ''} ${e.message}`
      );
    }
  }

  return entero;
}

/**
 * Aplica UN trato ya decidido por el calce puro: las patas del ledger, la
 * comision, las restas de las dos ordenes, el documento Trato y el aviso a las
 * velas.
 *
 * La comision (ppm sobre lo recibido) se cobra partiendo la ejecucion de la
 * reserva en dos patas, la grande al que cobra y la chica a la cuenta 'casa',
 * en vez de acreditar entero y debitar despues: asi la reserva del pagador se
 * consume exacta y la casa jamas cobra de un dinero que no se movio.
 *
 * ═══ TODO O NADA, CON COMPENSACION EXPLICITA ═══
 *
 * Un trato mueve DOS patas de dinero en sentidos opuestos (el activo sale de
 * la reserva del vendedor, el ORIGEN sale de la del comprador) y hasta hoy
 * eran cuatro llamadas sueltas sin nada que las abrazara. Si la del activo
 * pasaba y la del pago fallaba, nadie deshacia la que ya se habia movido: el
 * vendedor entregaba y cobraba cero. Y los disparadores no son hipoteticos,
 * estan escritos en ledger.js: el asiento puede fallar DESPUES de mover el
 * saldo (ASIENTO_PERDIDO), la guarda puede rendirse por congestion
 * (LEDGER_CONGESTIONADO), y el proceso puede morirse entre dos await.
 *
 * Se elige COMPENSACION y no transaccion de Mongo, por tres razones:
 *
 *  1. No consta que el despliegue sea un conjunto de replicas. Ordenex se
 *     conecta con su propia MONGODB_URI y el ensayo de ledger.js dice
 *     literalmente lo contrario ("Mongo (sin replica set) no da transaccion
 *     entre ambos"). Un arreglo que solo funciona en la mitad de los
 *     despliegues posibles no es un arreglo del camino del dinero.
 *  2. La guarda del ledger es lee-compara-escribe EN MEMORIA con reintentos.
 *     Dentro de una sesion, las lecturas van contra una foto fija: el bucle
 *     releeria ocho veces la misma foto y se rendiria siempre. Meter el ledger
 *     en una transaccion obliga a reescribir su guarda, que es la pieza mejor
 *     razonada de la casa, y a cambiarla justo cuando se toca el dinero.
 *  3. La compensacion ya es el idioma de esta casa: `ejecutarReserva` se
 *     compensa a si misma por dentro, y `colocar` libera la reserva cuando el
 *     save de la orden truena. Esto no inventa un mecanismo, extiende el que
 *     hay.
 *
 * Lo que la compensacion NO puede prometer es lo que ninguna transaccion
 * promete tampoco sin dos fases: si el proceso muere DENTRO del reverso, o si
 * el cobrador ya gasto lo que le llego, queda un incidente. Por eso el reverso
 * canta CRITICO con la ref, `colocar` marca el motor frio, y `cargarLibros`
 * reconstruye restas y reservas de los tratos, que es el unico papel que aqui
 * no se escribe hasta que todo lo demas salio bien.
 */
async function aplicarTrato(t, base, entrante) {
  const led = elLedger();
  const { Trato, Orden } = losModelos();

  const entranteId = String(entrante._id);
  const doc = new Trato({ ...t, en: new Date() });
  const ref = `trato:${String(doc._id)}`;
  const cantidad = BigInt(t.cantidad);
  const pago = pagoDe(t.cantidad, t.precio);
  const ppm = comisionPpm();
  const comisionBase = (cantidad * ppm) / 1000000n;
  const comisionPago = (pago * ppm) / 1000000n;

  // La pasiva se lee ANTES de mover un wei. Antes esto se cantaba y se seguia
  // igual, y seguir era lo peor de las dos: liquidar contra una orden que no
  // esta en la base deja un trato imposible de reconstruir y una reserva que
  // ya no tiene dueño. Si no esta, el trato no se aplica y el motor se para.
  const pasivaId = t.ordenCompra === entranteId ? t.ordenVenta : t.ordenCompra;
  const pasiva = await Orden.findById(pasivaId);
  if (!pasiva) {
    console.error(`[motor] CRITICO: el trato ${ref} calzo contra una orden que no esta en la base (${pasivaId})`);
    throw fallo('PASIVA_AUSENTE', 503, 'El calce apunto a una orden que no esta en la base.');
  }

  // La unidad: `movidas` lleva la cuenta del dinero ya ejecutado y `papeles`
  // la de las restas ya bajadas. Todo lo que entre aqui sale o se deshace.
  const movidas = [];
  const papeles = [];
  const mover = async (de, activo, monto, a) => {
    await led.ejecutarReserva(de, activo, monto, a, ref);
    movidas.push({ de, activo, monto, a });
  };

  try {
    // 1. La pata del activo: de la reserva del vendedor al comprador.
    await mover(t.vendedorId, base, (cantidad - comisionBase).toString(), t.compradorId);
    if (comisionBase > 0n) {
      await mover(t.vendedorId, base, comisionBase.toString(), 'casa');
    }
    // 2. La pata del ORIGEN: de la reserva del comprador al vendedor. Un pago
    //    de cero wei (un trato de polvo) no lleva pata: el ledger no mueve nadas.
    if (pago - comisionPago > 0n) {
      await mover(t.compradorId, 'ORIGEN', (pago - comisionPago).toString(), t.vendedorId);
    }
    if (comisionPago > 0n) {
      await mover(t.compradorId, 'ORIGEN', comisionPago.toString(), 'casa');
    }

    // 3. Las DOS restas, dentro de la misma unidad. La de la entrante tambien,
    //    y ese es el arreglo del libro recargado: hasta hoy la entrante bajaba
    //    su resta DESPUES del bucle, asi que un bucle roto en el trato 3 de 3
    //    devolvia al libro una orden diciendo "me quedan 15" con garantia para
    //    5. Bajandola trato a trato, la base nunca dice mas de lo que la
    //    reserva aguanta, pase lo que pase a mitad de camino.
    await bajarResta(pasiva, cantidad, papeles);
    await bajarResta(entrante, cantidad, papeles);

    // 4. El trato, el ULTIMO papel. Es el que `cargarLibros` usa para
    //    reconstruir restas y reservas, asi que no puede existir un Trato de
    //    un dinero que se deshizo: se escribe solo cuando ya no queda nada
    //    que pueda fallar dentro de la unidad.
    await doc.save();
  } catch (e) {
    const entero = await deshacerTrato(movidas, papeles, ref);
    console.error(
      `[motor] el trato ${ref} se cayo (${e.codigo || ''} ${e.message}) y se deshizo ${entero ? 'entero' : 'A MEDIAS'}`
    );
    throw e;
  }

  // ── Fuera de la unidad: lo que no puede deshacer un trato consumado ──

  // Si la pasiva era compra y quedo ejecutada, se le devuelve el polvo de
  // reserva que el floor dejo sin gastar. Va aqui y no dentro de la unidad a
  // proposito: deshacer un trato REAL por unos wei de polvo seria cambiar un
  // problema chico por uno grande, y esa reserva la recalcula `cargarLibros`
  // exacta desde los tratos.
  if (pasiva.lado === 'compra') {
    let viva = BigInt(RESERVAS.get(pasivaId) ?? '0') - pago;
    if (viva < 0n) {
      console.error(`[motor] CRITICO: la reserva viva de ${pasivaId} quedo negativa; se ajusta a cero`);
      viva = 0n;
    }
    if (pasiva.estado === 'ejecutada') {
      RESERVAS.delete(pasivaId);
      if (viva > 0n) {
        try {
          await led.liberar(pasiva.userId, 'ORIGEN', viva.toString(), `orden:${pasivaId}`);
        } catch (e) {
          console.error(
            `[motor] CRITICO: el polvo de reserva de ${pasivaId} (${viva} wei de ORIGEN) no se pudo liberar: ${e.message}`
          );
        }
      }
    } else {
      RESERVAS.set(pasivaId, viva.toString());
    }
  }

  // El aviso a las velas: perezoso y sin poder romper el calce. Un trato real
  // ya consumado no se deshace porque la grafica tosio.
  try {
    _velas ??= require('./velas');
    Promise.resolve(_velas.anotarTrato(plano(doc))).catch((e) =>
      console.error(`[velas] no se pudo anotar el trato ${ref}: ${e.message}`)
    );
  } catch (e) {
    console.error(`[velas] no se pudo anotar el trato ${ref}: ${e.message}`);
  }

  return plano(doc);
}

/**
 * Colocar una orden. El controller ya valido mercado, tipos y minimos; aqui
 * se hace, dentro de la cola del mercado y en este orden:
 *
 *   idempotencia → simular (puro) → reservar → persistir → aplicar → libro
 *
 * El orden esta elegido para que cada fallo deje lo MENOS posible: si la
 * reserva falla no se persistio nada; si persistir falla se libera la
 * reserva; y si un trato del bucle se cae, ese trato se deshace entero solo
 * (ver `aplicarTrato`), pero los anteriores del mismo bucle YA estan hechos y
 * la memoria del libro todavia no se movio. Entonces el motor se declara frio
 * (`listos = false`) y el mercado queda parado hasta recargar los libros
 * contra la base. Parar es el lado correcto en el que equivocarse: un motor
 * que sigue calzando sobre un libro que no cuadra reparte dinero mal. Y
 * recargar ahora si devuelve la orden con la resta que su reserva aguanta,
 * porque cada trato del bucle ya la fue bajando.
 */
async function colocar({ userId, mercado, lado, tipo, precio, cantidad, ordenKey }) {
  return encolar(mercado, async () => {
    if (!listos) throw fallo('MOTOR_FRIO', 503, 'Los libros aun no estan cargados; proba en un momento.');
    const { Orden } = losModelos();

    // Idempotencia AQUI ademas del camino rapido del controller: dentro de la
    // cola no hay carrera posible — dos reintentos con la misma ordenKey
    // entran en fila y el segundo encuentra al primero. El indice unico
    // (userId, ordenKey) es la red de abajo del todo.
    if (ordenKey) {
      const previa = await Orden.findOne({ userId, ordenKey });
      if (previa) return { orden: plano(previa), tratos: [], repetida: true };
    }

    const [base] = mercado.split('-');
    const doc = new Orden({
      userId,
      mercado,
      lado,
      tipo,
      precio: tipo === 'limite' ? BigInt(precio).toString() : null,
      cantidad: BigInt(cantidad).toString(),
      resta: BigInt(cantidad).toString(),
      estado: 'abierta',
      ordenKey: ordenKey || null,
      en: new Date(),
    });
    const id = String(doc._id);
    const pura = {
      id, userId, mercado, lado, tipo,
      precio: doc.precio, cantidad: doc.cantidad, resta: doc.cantidad,
      en: doc.en.getTime(), seq: ++seq,
    };

    // 1. Simular: puro, sin efectos, y vinculante porque la cola serializa.
    const r = calzar(LIBROS.get(mercado) ?? { compras: [], ventas: [] }, pura);

    // 2. La reserva previa. Venta: la cantidad del activo. Compra limite: el
    //    notional entero al precio limite. Compra a mercado: exactamente la
    //    suma de los pagos simulados — es lo unico que va a gastar.
    let reserva = 0n;
    const activoReserva = lado === 'venta' ? base : 'ORIGEN';
    if (lado === 'venta') reserva = BigInt(doc.cantidad);
    else if (tipo === 'limite') reserva = pagoDe(doc.cantidad, doc.precio);
    else reserva = r.tratos.reduce((s, t) => s + pagoDe(t.cantidad, t.precio), 0n);
    if (reserva > 0n) {
      await elLedger().reservar(userId, activoReserva, reserva.toString(), `orden:${id}`);
    }

    // 3. Persistir la orden ANTES de aplicar: un trato jamas debe apuntar a
    //    una orden que no existe en la base. Si el indice de ordenKey salta
    //    (reintento gemelo por OTRO mercado, fuera de esta cola), se devuelve
    //    la reserva y se contesta con la primera.
    try {
      await doc.save();
    } catch (e) {
      if (reserva > 0n) {
        try {
          await elLedger().liberar(userId, activoReserva, reserva.toString(), `orden:${id}`);
        } catch (e2) {
          console.error(`[motor] CRITICO: reserva huerfana de la orden ${id}: ${e2.message}`);
        }
      }
      if (e.code === 11000 && ordenKey) {
        const previa = await Orden.findOne({ userId, ordenKey });
        if (previa) return { orden: plano(previa), tratos: [], repetida: true };
      }
      throw e;
    }

    // 4. Aplicar y cerrar.
    try {
      const hechos = [];
      let gastado = 0n;
      for (const t of r.tratos) {
        hechos.push(await aplicarTrato(t, base, doc));
        gastado += lado === 'compra' ? pagoDe(t.cantidad, t.precio) : BigInt(t.cantidad);
      }

      // La resta ya la bajo `aplicarTrato` trato a trato, dentro de la misma
      // unidad que el dinero: aqui solo tiene que CUADRAR con lo que dijo la
      // simulacion. Si no cuadrara, la base y el calce estarian contando
      // historias distintas y seguir seria repartir dinero a ciegas.
      if (doc.resta !== r.resta) {
        console.error(`[motor] CRITICO: la orden ${id} quedo con resta ${doc.resta} y el calce dijo ${r.resta}`);
        throw fallo('RESTA_NO_CUADRA', 503, 'La resta de la orden no cuadra con el calce.');
      }
      doc.estado = r.resto
        ? 'abierta'
        : r.resta === '0'
          ? 'ejecutada'
          : r.motivo === 'autocalce'
            ? 'rechazada'
            : 'cancelada';
      await doc.save();

      // Lo reservado que no se gasto: si la orden descansa, sigue en garantia
      // (y se apunta para la compra); si termino, vuelve al disponible.
      const sobra = reserva - gastado;
      if (doc.estado === 'abierta') {
        if (lado === 'compra') RESERVAS.set(id, sobra.toString());
      } else if (sobra > 0n) {
        await elLedger().liberar(userId, activoReserva, sobra.toString(), `orden:${id}`);
      }

      // La memoria se toca al final: si algo de arriba fallo, el libro viejo
      // sigue siendo el que cuadra con lo NO aplicado.
      LIBROS.set(mercado, r.libro);
      return { orden: plano(doc), tratos: hechos };
    } catch (e) {
      listos = false;
      console.error(
        `[motor] CRITICO: el calce de ${id} quedo a medias (${e.codigo || ''} ${e.message}). ` +
        'Los libros se marcan frios: hay que recargarlos contra la base (cargarLibros).'
      );
      throw fallo('MOTOR_ROTO', 503, 'El calce fallo a mitad de camino; el mercado queda parado hasta recargar.');
    }
  });
}

/**
 * Cancelar una orden propia: se saca del libro, se libera lo que quedaba en
 * garantia y se anota. El mismo 404 para «no existe» y «no es tuya»: a quien
 * tantea ids ajenos no se le confirma cuales existen.
 */
async function cancelar(id, userId) {
  const { Orden } = losModelos();
  let doc = null;
  try {
    doc = await Orden.findById(id);
  } catch {
    // Un id malformado no es un error del servidor: es una orden que no existe.
  }
  if (!doc || doc.userId !== userId) {
    throw fallo('NO_EXISTE', 404, 'No hay ninguna orden con ese id.');
  }

  return encolar(doc.mercado, async () => {
    if (!listos) throw fallo('MOTOR_FRIO', 503, 'Los libros aun no estan cargados; proba en un momento.');

    // Se relee dentro de la cola: entre el findById de afuera y este turno
    // pudo calzarse entera o cancelarse por otro reintento.
    const fresco = await Orden.findById(id);
    if (!fresco || fresco.estado !== 'abierta') {
      throw fallo('NO_ABIERTA', 409, 'La orden ya no esta abierta.');
    }

    const libro = LIBROS.get(fresco.mercado) ?? { compras: [], ventas: [] };
    const lista = fresco.lado === 'compra' ? libro.compras : libro.ventas;
    const idx = lista.findIndex((o) => o.id === id);
    if (idx === -1) {
      // Abierta en la base pero ausente de la memoria: el libro no cuadra.
      listos = false;
      console.error(`[motor] CRITICO: la orden abierta ${id} no estaba en el libro; el motor se marca frio`);
      throw fallo('MOTOR_ROTO', 503, 'El libro no cuadra; el mercado queda parado hasta recargar.');
    }
    lista.splice(idx, 1);

    const [base] = fresco.mercado.split('-');
    if (fresco.lado === 'venta') {
      await elLedger().liberar(userId, base, fresco.resta, `orden:${id}`);
    } else {
      const viva = RESERVAS.get(id);
      if (viva === undefined) {
        listos = false;
        console.error(`[motor] CRITICO: la compra abierta ${id} no tiene reserva apuntada; el motor se marca frio`);
        throw fallo('MOTOR_ROTO', 503, 'La reserva no cuadra; el mercado queda parado hasta recargar.');
      }
      if (BigInt(viva) > 0n) await elLedger().liberar(userId, 'ORIGEN', viva, `orden:${id}`);
      RESERVAS.delete(id);
    }

    fresco.estado = 'cancelada';
    await fresco.save();
    return plano(fresco);
  });
}

/**
 * Le devuelve a una COMPRA que quedo ejecutada el ORIGEN que reservo y no
 * llego a gastar. Solo se usa al recargar, para las que se encontraron
 * abiertas con la resta ya en cero: quien las cerro no llego a soltar su
 * garantia y dejarla congelada seria dinero secuestrado por una averia.
 *
 * Va envuelto porque recargar es un camino de recuperacion, y un camino de
 * recuperacion que se cae a la mitad deja las cosas peor que antes: si la
 * devolucion no sale, se canta con la ref y el libro se carga igual.
 */
async function devolverSobra(orden, pagado) {
  const sobra = pagoDe(orden.cantidad, orden.precio) - pagado;
  if (sobra <= 0n) return;
  try {
    await elLedger().liberar(orden.userId, 'ORIGEN', sobra.toString(), `orden:${orden._id}`);
  } catch (e) {
    console.error(
      `[motor] CRITICO: la orden ${orden._id} quedo ejecutada y sus ${sobra} wei de ORIGEN no se pudieron liberar: ${e.message}`
    );
  }
}

/**
 * Reconstruye los libros (y las reservas vivas) desde la base: las ordenes
 * abiertas, ordenadas precio-tiempo. Se llama al arrancar y despues de un
 * MOTOR_ROTO. La reserva viva de cada compra no se estima: se recalcula
 * exacta como notional reservado menos la suma de los pagos de sus tratos,
 * porque estimarla desde `resta` acumularia el polvo del floor y un dia
 * liberaria de mas, robandole garantia a otra orden del mismo usuario.
 *
 * Y LA `resta` TAMPOCO SE CREE. Se deriva igual que la reserva, de los tratos:
 * `cantidad` menos lo que esta orden calzo de verdad. Esto es media parte del
 * arreglo del libro recargado (la otra media esta en `aplicarTrato`, que la
 * baja dentro de la unidad atomica del trato): recargar es justamente el
 * camino por el que se vuelve DESPUES de que algo se cayo a mitad, y creerle
 * al campo `resta` de una orden que quedo a medias es como se rearma la bomba,
 * porque devuelve al libro una orden que promete mas de lo que su reserva
 * puede sostener. Los tratos son el unico papel que no se escribe hasta que el
 * dinero ya se movio, asi que son el unico que puede mandar aqui.
 *
 * Cuando lo derivado y lo guardado no coinciden, manda lo derivado y se
 * CORRIGE la base: si no, el libro en memoria y la base contarian dos
 * historias, y el proximo `aplicarTrato` bajaria la resta desde la mala.
 */
async function cargarLibros() {
  const { Orden, Trato } = losModelos();
  listos = false;

  const abiertas = await Orden.find({ estado: 'abierta' }).lean();
  LIBROS.clear();
  RESERVAS.clear();

  // Los tratos de TODAS las abiertas de una vez: una consulta en vez de dos
  // por orden, y la misma tabla sirve para derivar la resta y la reserva.
  const ids = abiertas.map((o) => String(o._id));
  const calzado = new Map(); // id de orden -> wei del activo ya calzados
  const pagado = new Map(); // id de COMPRA -> wei de ORIGEN ya gastados
  if (ids.length) {
    const tratos = await Trato.find({
      $or: [{ ordenCompra: { $in: ids } }, { ordenVenta: { $in: ids } }],
    }).lean();
    const sumar = (m, k, v) => { if (k) m.set(k, (m.get(k) ?? 0n) + v); };
    for (const t of tratos) {
      sumar(calzado, t.ordenCompra, BigInt(t.cantidad));
      sumar(calzado, t.ordenVenta, BigInt(t.cantidad));
      sumar(pagado, t.ordenCompra, pagoDe(t.cantidad, t.precio));
    }
  }

  const porMercado = new Map();
  for (const o of abiertas) {
    const id = String(o._id);
    if (o.tipo !== 'limite') {
      // Una orden de mercado jamas descansa; si una aparece abierta es un
      // dato roto y se canta, pero no se le da lugar en el libro.
      console.error(`[motor] la orden ${o._id} es de mercado y esta 'abierta': se ignora en el libro`);
      continue;
    }

    // La resta de verdad. Nunca negativa: si los tratos suman mas que la
    // cantidad hay un dato roto, y se canta, pero al libro no entra deuda.
    let resta = BigInt(o.cantidad) - (calzado.get(id) ?? 0n);
    if (resta < 0n) {
      console.error(`[motor] CRITICO: la orden ${id} calzo ${calzado.get(id)} con cantidad ${o.cantidad}; se cierra en cero`);
      resta = 0n;
    }

    // Una orden abierta con resta cero esta ejecutada y alguien no llego a
    // anotarlo. Se anota ahora y se deja fuera del libro: dentro seria una
    // pasiva que produce tratos de cero wei en cada calce.
    if (resta === 0n) {
      console.error(`[motor] la orden ${id} estaba 'abierta' con resta cero; se cierra como ejecutada`);
      try {
        await Orden.updateOne({ _id: o._id }, { $set: { resta: '0', estado: 'ejecutada' } });
      } catch (e) {
        console.error(`[motor] CRITICO: no se pudo cerrar la orden ${id}: ${e.message}`);
      }
      if (o.lado === 'compra') await devolverSobra(o, pagado.get(id) ?? 0n);
      continue;
    }

    if (resta.toString() !== o.resta) {
      console.error(
        `[motor] la orden ${id} decia resta ${o.resta} y sus tratos dicen ${resta}; manda la de los tratos`
      );
      try {
        await Orden.updateOne({ _id: o._id }, { $set: { resta: resta.toString() } });
      } catch (e) {
        console.error(`[motor] CRITICO: no se pudo corregir la resta de ${id}: ${e.message}`);
      }
    }

    if (!porMercado.has(o.mercado)) porMercado.set(o.mercado, []);
    porMercado.get(o.mercado).push({
      id,
      userId: o.userId,
      mercado: o.mercado,
      lado: o.lado,
      tipo: o.tipo,
      precio: o.precio,
      cantidad: o.cantidad,
      resta: resta.toString(),
      en: new Date(o.en).getTime(),
      seq: 0, // se asigna abajo, ya ordenadas
    });
  }

  for (const [mercado, ordenes] of porMercado) {
    const compras = ordenes.filter((o) => o.lado === 'compra');
    const ventas = ordenes.filter((o) => o.lado === 'venta');
    // El _id de Mongo crece con el tiempo: desempata dentro del mismo ms igual
    // que lo hizo `seq` cuando las ordenes entraron en vivo.
    const porLlegada = (a, b) => (a.en !== b.en ? a.en - b.en : a.id < b.id ? -1 : 1);
    compras.sort((a, b) => (BigInt(a.precio) !== BigInt(b.precio)
      ? (BigInt(b.precio) > BigInt(a.precio) ? 1 : -1)
      : porLlegada(a, b)));
    ventas.sort((a, b) => (BigInt(a.precio) !== BigInt(b.precio)
      ? (BigInt(a.precio) > BigInt(b.precio) ? 1 : -1)
      : porLlegada(a, b)));
    for (const o of [...compras, ...ventas]) o.seq = ++seq;
    LIBROS.set(mercado, { compras, ventas });

    for (const o of compras) {
      const viva = pagoDe(o.cantidad, o.precio) - (pagado.get(o.id) ?? 0n);
      RESERVAS.set(o.id, (viva > 0n ? viva : 0n).toString());
    }
  }

  listos = true;
  console.log(`[motor] libros cargados: ${abiertas.length} orden(es) abiertas en ${porMercado.size} mercado(s)`);
}

/* La copia viva de los libros, para el controller de mercados. Devuelve null
 * mientras el motor este frio: un libro vacio y un libro no cargado son
 * respuestas distintas, y el que pregunta tiene que poder diferenciarlas. */
function librosEnMemoria() {
  return listos ? LIBROS : null;
}

module.exports = { calzar, colocar, cancelar, cargarLibros, librosEnMemoria };
