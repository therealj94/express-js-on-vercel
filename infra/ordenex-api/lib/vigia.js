// El vigia de los depositos.
//
// Cada 30 segundos recorre las direcciones de deposito y compara lo que la
// cadena dice que hay con la MARCA DE AGUA — el ultimo saldo que este proceso
// vio y proceso — por cada (usuario, activo). Delta positivo: llego un
// deposito, se anota y se acredita en el ledger. Delta negativo: salio dinero
// (un barrido del admin) y la marca simplemente baja. Delta cero: nada.
//
// LAS DOS PROMESAS DEL VIGIA
//
// 1. NUNCA acredita si la lectura fallo. saldosDe() es fail-closed: si un
//    solo token no se pudo leer, la direccion entera se salta este sondeo.
//    Un RPC a medias no puede convertirse en un saldo a medias.
//
// 2. NUNCA acredita dos veces. La marca sube al procesar un deposito y el
//    orden de escritura esta elegido para el lado correcto del fallo: primero
//    el documento Deposito (la memoria durable), despues el ledger. Si el
//    proceso muere entre medio, al rearrancar la marca se reconstruye de los
//    depositos anotados y ese delta ya no vuelve a aparecer — queda un
//    deposito anotado sin acreditar, que se canta a gritos en el log y lo
//    arregla un humano. El orden inverso (ledger primero) tendria el fallo
//    contrario: un deposito acreditado sin memoria, que al reiniciar se
//    acreditaria OTRA VEZ. Entre regalarle dinero dos veces a un tercero y
//    deberle una acreditacion visible a un usuario, lo segundo se arregla y
//    lo primero no.
//
// LA MARCA Y LOS REINICIOS
//
// La marca vive en memoria y se reconstruye al arrancar sumando los
// depositos anotados de cada (usuario, activo). Un barrido baja el saldo en
// cadena sin dejar documento, asi que tras un reinicio la marca puede
// arrancar por ENCIMA del saldo real; el primer sondeo la corrige hacia
// abajo. La ventana que queda —un deposito que entra mientras el proceso
// esta caido DESPUES de un barrido— se pierde por el lado cerrado: no se
// acredita solo, jamas se acredita de mas. (El barrido es manual y de admin:
// no barrer justo antes de un deploy es parte del oficio.)

const { Usuario, Deposito } = require('../models');
const ledger = require('./ledger');
const { saldosDe } = require('./cadena5550');
const { TOKENS } = require('./tokens');

const CADA_MS = 30000;

// La marca de agua: `${userId}|${activo}` → BigInt del ultimo saldo visto.
const marcas = new Map();
const claveDe = (userId, activo) => `${userId}|${activo}`;

let temporizador = null;
let sondeando = false;

/** Reconstruye las marcas desde la coleccion de depositos. */
async function reconstruirMarcas() {
  marcas.clear();
  // Cursor y suma con BigInt en JS, no un $group de Mongo: el agregador suma
  // en double o Decimal128 y ninguno de los dos promete enteros de wei
  // exactos. Lento pero correcto; corre una vez por arranque.
  const cursor = Deposito.find({}, { userId: 1, activo: 1, cantidad: 1 }).lean().cursor();
  for await (const d of cursor) {
    const k = claveDe(d.userId, d.activo);
    marcas.set(k, (marcas.get(k) || 0n) + BigInt(d.cantidad));
  }
  console.log(`[vigia] marcas reconstruidas: ${marcas.size} pares (usuario, activo)`);
}

/** Procesa UNA direccion ya leida con exito. */
async function procesarDireccion(usuario, lectura) {
  const userId = String(usuario._id);
  for (const s of lectura.saldos) {
    const k = claveDe(userId, s.simbolo);
    const actual = BigInt(s.wei);
    const marca = marcas.get(k) || 0n;
    const delta = actual - marca;

    if (delta < 0n) {
      // Salio dinero (un barrido): la marca baja y no se toca el ledger. El
      // ledger del usuario no cambia con un barrido — su saldo interno ya
      // estaba acreditado; solo se movio la custodia de sitio.
      marcas.set(k, actual);
      continue;
    }
    if (delta === 0n) continue;

    // Llego un deposito. Primero la memoria, despues el dinero (ver arriba).
    let deposito;
    try {
      deposito = await Deposito.create({
        userId,
        activo: s.simbolo,
        cantidad: delta.toString(),
        direccion: usuario.direccionDeposito,
      });
    } catch (e) {
      // No se pudo anotar: no se acredita y la marca NO sube — el proximo
      // sondeo vuelve a ver el mismo delta y lo intenta de nuevo.
      console.error(`[vigia] no se pudo anotar el deposito de ${userId} ${s.simbolo}: ${e.message}`);
      continue;
    }

    // La marca sube ya, con el deposito anotado: pase lo que pase con el
    // ledger, este delta no se vuelve a contar.
    marcas.set(k, actual);

    try {
      await ledger.acreditar(userId, s.simbolo, delta.toString(), `deposito:${deposito._id}`);
      console.log(`[vigia] acreditado ${delta} wei de ${s.simbolo} a ${userId} (deposito ${deposito._id})`);
    } catch (e) {
      // El caso que se arregla a mano: deposito anotado, ledger sin acreditar.
      console.error(
        `[vigia] ACREDITACION PENDIENTE: el deposito ${deposito._id} (${userId}, ${s.simbolo}, ${delta} wei) quedo anotado pero el ledger no lo acredito: ${e.message}`
      );
    }
  }
}

/** Un sondeo completo: todas las direcciones de deposito, una a una. */
async function ciclo() {
  // Si el sondeo anterior sigue vivo (un RPC lento), no se le monta otro
  // encima: dos ciclos a la vez verian la misma marca y acreditarian doble.
  if (sondeando) return;
  sondeando = true;
  try {
    const usuarios = await Usuario.find(
      { direccionDeposito: { $ne: null } },
      { direccionDeposito: 1 }
    ).lean();

    for (const u of usuarios) {
      const lectura = await saldosDe(u.direccionDeposito);
      if (!lectura.ok) {
        // Promesa 1: lectura fallida, direccion saltada. Sin marca tocada,
        // sin ledger tocado. El proximo sondeo la vuelve a mirar.
        console.error(`[vigia] no se pudo leer ${u.direccionDeposito}: ${lectura.error}`);
        continue;
      }
      await procesarDireccion(u, lectura);
    }
  } catch (e) {
    // Mongo caido u otra averia general: este sondeo se pierde, el vigia no.
    console.error(`[vigia] sondeo fallido: ${e.message}`);
  } finally {
    sondeando = false;
  }
}

/**
 * Arranca el vigia: reconstruye las marcas, hace un primer sondeo y queda
 * sondeando cada 30 segundos. Idempotente: llamarlo dos veces no monta dos
 * relojes.
 */
async function arrancar() {
  if (temporizador) return;
  await reconstruirMarcas();
  temporizador = setInterval(() => {
    ciclo().catch((e) => console.error(`[vigia] ciclo: ${e.message}`));
  }, CADA_MS);
  console.log(`[vigia] sondeando ${TOKENS.length} activos cada ${CADA_MS / 1000}s`);
  await ciclo();
}

/** Para las pruebas y para apagar limpio. */
function detener() {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
}

module.exports = {
  arrancar,
  detener,
  // Las piezas, expuestas para pruebas — el reloj de 30s no se puede esperar
  // en un test, pero un ciclo() con la cadena fingida si.
  _adentro: { ciclo, reconstruirMarcas, marcas, claveDe },
};
