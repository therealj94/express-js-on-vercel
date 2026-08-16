// El ledger de Ordenex: doble entrada, en wei, con reserva.
//
// Toda mutacion de dinero de esta casa pasa por aqui. Nadie escribe `cuentas`
// a mano: estas cinco primitivas son la unica puerta, y cada una deja rastro
// en `asientos`. El dinero es SIEMPRE un string de wei que se opera con BigInt
// en memoria — Number pierde enteros pasado 2^53, y 2^53 wei son 0,009 ORIGEN.
//
// LA GUARDA: lee-compara-escribe, con el propio string como version.
//
// Se penso primero en la otra via del contrato, un $expr que compare dentro de
// Mongo, y se descarto por una razon de precision, no de gusto: $toDecimal
// mete el wei en un Decimal128 de 34 digitos significativos y un saldo en wei
// puede tener hasta 78. El redondeo seria silencioso, y una guarda que
// redondea no es una guarda: es una opinion. Comparar los strings tal cual
// tampoco sirve — el orden lexicografico jura que '900' es mas que '1000'.
//
// Asi que la comparacion BigInt se hace en memoria, donde es exacta, y la
// atomicidad la pone el findOneAndUpdate: el $set solo aplica si `disponible`
// y `reservado` siguen siendo EXACTAMENTE los strings que se leyeron. Si otro
// escribio en medio, el update no encuentra el documento, se relee y se
// reintenta. El string es su propia version — dos estados distintos del saldo
// jamas comparten string (todo se escribe normalizado por BigInt), asi que no
// hace falta un campo `version` aparte que alguien pueda olvidar subir.
//
// Los reintentos van acotados: con la cola por mercado del motor la
// contencion real es casi nula, y si N vueltas no alcanzan es que algo anda
// muy mal — lo honesto es un 503, no seguir dando vueltas. Y la regla de
// siempre: si la guarda no calza o el numero saldria negativo, ERROR. Nunca
// un saldo negativo, nunca un cero de consuelo.
//
// EL RASTRO: un asiento por cada pata.
//
// Cada campo que se mueve deja su linea, con el monto FIRMADO respecto del
// campo que toca y `saldoDespues` = como quedo ese campo. Asi la doble
// entrada se puede auditar sumando: las operaciones internas (reservar,
// liberar, ejecutar) suman cero por activo, y el total del ledger es
// exactamente lo acreditado menos lo debitado — la frontera con el exterior.
//
//   acreditar       +m  (disponible)      frontera: entro dinero a la casa
//   debitar         -m  (disponible)      frontera: salio dinero de la casa
//   reservar-sale   -m  (disponible)  ┐
//   reservar-entra  +m  (reservado)   ┘   suman cero
//   liberar-sale    -m  (reservado)   ┐
//   liberar-entra   +m  (disponible)  ┘   suman cero
//   ejecutar-sale   -m  (reservado del que pago)    ┐
//   ejecutar-entra  +m  (disponible del que cobro)  ┘  suman cero
//
// El asiento se escribe DESPUES de mover el saldo, no antes: si fallara al
// reves quedaria historia de un dinero que nunca se movio, que es fabricar
// pruebas. Al derecho, lo peor es un movimiento sin su linea — se canta como
// CRITICO con la ref y se puede reconstruir desde la propia cuenta.

const { Cuenta, Asiento } = require('../models');

// Cuantas veces se reintenta la guarda antes de rendirse con un 503.
const INTENTOS = 8;

function fallo(codigo, status, mensaje) {
  const e = new Error(mensaje);
  e.codigo = codigo;
  e.status = status;
  return e;
}

// Un monto valido es un entero positivo en string (o BigInt), de hasta 78
// digitos — el tope de un uint256. Cero tambien se rechaza: mover nada no es
// una operacion, es ruido en los asientos.
function aWei(monto, que = 'monto') {
  let v;
  if (typeof monto === 'bigint') v = monto;
  else if (typeof monto === 'string' && /^[0-9]{1,78}$/.test(monto)) v = BigInt(monto);
  else throw fallo('MONTO_INVALIDO', 400, `El ${que} tiene que ser un string de wei.`);
  if (v <= 0n) throw fallo('MONTO_INVALIDO', 400, `El ${que} tiene que ser mayor que cero.`);
  return v;
}

// La mutacion atomica de UNA cuenta: aplica los dos deltas o no aplica nada.
// Aqui vive la guarda descrita arriba; todas las primitivas pasan por esta
// puerta y por eso ninguna puede dejar un saldo negativo.
async function mutarCuenta(userId, activo, deltaDisponible, deltaReservado) {
  for (let i = 0; i < INTENTOS; i++) {
    // Leer-o-crear atomico: el $setOnInsert solo pone los ceros si la cuenta
    // no existia. Si dos peticiones crean la misma cuenta a la vez, el indice
    // unico (userId, activo) convierte la carrera en un E11000 y se reintenta
    // — jamas dos documentos con el saldo partido en dos.
    let cuenta;
    try {
      cuenta = await Cuenta.findOneAndUpdate(
        { userId, activo },
        { $setOnInsert: { disponible: '0', reservado: '0' } },
        { upsert: true, new: true }
      );
    } catch (e) {
      if (e.code === 11000) continue;
      throw e;
    }

    const disponible = BigInt(cuenta.disponible) + deltaDisponible;
    const reservado = BigInt(cuenta.reservado) + deltaReservado;
    if (disponible < 0n) throw fallo('SALDO_INSUFICIENTE', 409, 'El disponible no alcanza.');
    if (reservado < 0n) throw fallo('RESERVA_INSUFICIENTE', 409, 'La reserva no alcanza.');

    const nueva = await Cuenta.findOneAndUpdate(
      // La guarda: el documento tiene que seguir diciendo EXACTAMENTE lo que
      // decia cuando se leyo. Si no, otro gano la carrera y se vuelve a leer.
      { _id: cuenta._id, disponible: cuenta.disponible, reservado: cuenta.reservado },
      { $set: { disponible: disponible.toString(), reservado: reservado.toString() } },
      { new: true }
    );
    if (nueva) return nueva;
  }
  throw fallo('LEDGER_CONGESTIONADO', 503, 'No se pudo asegurar el saldo; proba de nuevo.');
}

// El rastro. Si la linea no se pudo escribir se canta CRITICO y se lanza:
// quien llamo tiene que saber que el rastro quedo cojo, aunque el saldo ya
// este bien.
async function anotar(lineas) {
  try {
    await Asiento.create(lineas);
  } catch (e) {
    console.error(
      `[ledger] CRITICO: saldo movido SIN asiento (ref ${lineas[0]?.ref}): ${e.message}`
    );
    throw fallo('ASIENTO_PERDIDO', 500, 'El movimiento salio pero el rastro fallo.');
  }
}

/** Entra dinero a la casa (un deposito visto por el vigia, una liquidacion). */
async function acreditar(userId, activo, monto, ref) {
  const m = aWei(monto);
  const c = await mutarCuenta(userId, activo, m, 0n);
  await anotar([{
    ref, tipo: 'acreditar', userId, activo,
    monto: m.toString(), contraparte: null, saldoDespues: c.disponible,
  }]);
  return c;
}

/** Sale dinero de la casa. Falla si el disponible no alcanza. */
async function debitar(userId, activo, monto, ref) {
  const m = aWei(monto);
  const c = await mutarCuenta(userId, activo, -m, 0n);
  await anotar([{
    ref, tipo: 'debitar', userId, activo,
    monto: (-m).toString(), contraparte: null, saldoDespues: c.disponible,
  }]);
  return c;
}

/** disponible → reservado. La garantia de una orden o de una solicitud fiat. */
async function reservar(userId, activo, monto, ref) {
  const m = aWei(monto);
  const c = await mutarCuenta(userId, activo, -m, m);
  await anotar([
    { ref, tipo: 'reservar-sale', userId, activo, monto: (-m).toString(), contraparte: null, saldoDespues: c.disponible },
    { ref, tipo: 'reservar-entra', userId, activo, monto: m.toString(), contraparte: null, saldoDespues: c.reservado },
  ]);
  return c;
}

/** reservado → disponible. La garantia vuelve porque la orden se cancelo o sobro. */
async function liberar(userId, activo, monto, ref) {
  const m = aWei(monto);
  const c = await mutarCuenta(userId, activo, m, -m);
  await anotar([
    { ref, tipo: 'liberar-sale', userId, activo, monto: (-m).toString(), contraparte: null, saldoDespues: c.reservado },
    { ref, tipo: 'liberar-entra', userId, activo, monto: m.toString(), contraparte: null, saldoDespues: c.disponible },
  ]);
  return c;
}

/**
 * reservado de `userId` → disponible de `aQuien`. La garantia se consuma: es
 * la pata con la que se liquida un trato o una solicitud fiat.
 *
 * Son dos documentos y Mongo (sin replica set) no da transaccion entre ambos,
 * asi que el orden elige de que lado equivocarse: primero SALE de la reserva
 * (la unica pata que puede fallar por saldo), y solo despues ENTRA al otro.
 * Acreditar no puede fallar por negativo; si aun asi falla (Mongo a medias),
 * se intenta devolver la reserva y, si tampoco, se canta CRITICO con la ref —
 * los asientos y las cuentas permiten reconstruir a mano. Lo que este orden
 * hace imposible es lo unico imperdonable: crear dinero que nadie pago.
 */
async function ejecutarReserva(userId, activo, monto, aQuien, ref) {
  const m = aWei(monto);
  if (!aQuien || aQuien === userId) {
    // Consigo mismo no hay ejecucion: eso es `liberar`, y confundirlas
    // dejaria asientos que juran que alguien se pago a si mismo.
    throw fallo('CONTRAPARTE_INVALIDA', 400, 'La contraparte no puede ser uno mismo.');
  }

  const cPagador = await mutarCuenta(userId, activo, 0n, -m);
  let cCobrador;
  try {
    cCobrador = await mutarCuenta(aQuien, activo, m, 0n);
  } catch (e) {
    try {
      await mutarCuenta(userId, activo, 0n, m);
    } catch (e2) {
      console.error(
        `[ledger] CRITICO: ${m} ${activo} salieron de la reserva de ${userId} y no llegaron a ${aQuien} ni volvieron (ref ${ref}): ${e2.message}`
      );
    }
    throw e;
  }

  await anotar([
    { ref, tipo: 'ejecutar-sale', userId, activo, monto: (-m).toString(), contraparte: aQuien, saldoDespues: cPagador.reservado },
    { ref, tipo: 'ejecutar-entra', userId: aQuien, activo, monto: m.toString(), contraparte: userId, saldoDespues: cCobrador.disponible },
  ]);
  return { pagador: cPagador, cobrador: cCobrador };
}

module.exports = { acreditar, debitar, reservar, liberar, ejecutarReserva };
