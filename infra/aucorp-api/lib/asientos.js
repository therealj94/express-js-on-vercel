// La ÚNICA puerta por la que se mueve dinero fiat en AuCorp.
//
// Nadie escribe `saldos` a mano y nadie inserta en `asientos` a mano. Todo
// pasa por `asentar()`, que primero hace cuadrar el asiento (lib/libro.js) y
// después lo aplica.
//
// ══ EL ORDEN DE LAS OPERACIONES, Y POR QUÉ ES ESE ══════════════════════════
//
// Se mueven los saldos PRIMERO y se inserta el asiento DESPUÉS. Suena al
// revés —el libro es la verdad— pero el orden lo decide qué pasa si el proceso
// se muere justo en medio:
//
//   · saldo movido y asiento sin insertar → el cliente ve MENOS plata de la
//     que tiene por un rato. Se le arregla y no perdió nada.
//   · asiento insertado y saldo sin mover → el cliente ve MÁS plata de la que
//     tiene, y puede gastarla dos veces antes de que nadie se entere.
//
// El primer fallo es molesto; el segundo es dinero que desaparece. Así que se
// falla del lado molesto. Y si el insert del asiento falla, se DESHACE lo
// aplicado (la compensación de abajo) y se grita en el log.
//
// ══ LA GUARDA DE CONCURRENCIA ══════════════════════════════════════════════
//
// Comprobar el saldo y después restar es la receta del doble gasto: dos
// retiros que leen 100 al mismo tiempo y salen los dos. Aquí la comprobación
// del rojo va DENTRO del findOneAndUpdate condicionado: el $set solo aplica si
// `monto` sigue siendo EXACTAMENTE el string que se leyó. Si otro escribió en
// medio, no encuentra el documento, se relee y se reintenta. El string es su
// propia versión, porque todo se escribe normalizado por BigInt y dos estados
// distintos jamás comparten string.
//
// ══ LA RED DE ABAJO ════════════════════════════════════════════════════════
//
// `reconciliar()` recalcula los saldos sumando los asientos y compara. Si algo
// no calza, gana el libro. Esto es lo que permite que `saldos` sea un atajo y
// no una segunda verdad que compita con la primera.

const { Asiento, Saldo } = require('../models');
const { armar, TIPOS } = require('./libro');
const { moneda } = require('./monedas');

const VUELTAS = 8;
const CERO = 0n;

/** El movimiento de una línea en el sentido natural de su cuenta. */
function delta(l) {
  const d = BigInt(l.debe) - BigInt(l.haber);
  return TIPOS[l.tipo] === 'debe' ? d : -d;
}

/** Las cuentas de clientes nunca quedan en rojo; las de la casa pueden. */
const esDeCliente = (cuenta) => String(cuenta).startsWith('cliente:');

/**
 * Aplica un movimiento a un saldo, con guarda. Devuelve el monto nuevo.
 * Truena si dejaría en rojo una cuenta de cliente, o si tras VUELTAS intentos
 * sigue habiendo otro escribiendo encima.
 */
async function mover(cuenta, cod, tipo, mov, permitirRojo) {
  for (let i = 0; i < VUELTAS; i++) {
    const doc = await Saldo.findOne({ cuenta, moneda: cod });
    const viejo = doc ? BigInt(doc.monto) : CERO;
    const nuevo = viejo + mov;

    if (nuevo < CERO && esDeCliente(cuenta) && !permitirRojo) {
      // Nunca un saldo negativo de cliente, y nunca un cero de consuelo.
      const e = new Error(`saldo insuficiente en ${cuenta} (${cod})`);
      e.codigo = 'SALDO_INSUFICIENTE';
      throw e;
    }

    if (!doc) {
      // Primera vez. El índice único es la guarda: si dos llegan a la vez,
      // uno crea y el otro choca y vuelve a leer.
      try {
        await Saldo.create({ cuenta, moneda: cod, tipo, monto: nuevo.toString() });
        return nuevo.toString();
      } catch (e) {
        if (e?.code === 11000) continue;
        throw e;
      }
    }

    const ok = await Saldo.findOneAndUpdate(
      { cuenta, moneda: cod, monto: doc.monto },          // ← la guarda
      { $set: { monto: nuevo.toString(), actualizado: new Date() } },
      { new: true }
    );
    if (ok) return ok.monto;
    // Otro escribió en medio: se relee y se reintenta.
  }
  const e = new Error(`no se pudo asentar en ${cuenta} (${cod}): demasiada contención`);
  e.codigo = 'CONTENCION';
  throw e;
}

/**
 * Asienta un movimiento. `asiento.ref` es el sello de idempotencia: reintentar
 * con la misma ref no duplica nada, devuelve el asiento que ya existía.
 */
async function asentar(asiento, { clase = 'movimiento', permitirRojo = false } = {}) {
  const armado = armar(asiento);   // truena si no cuadra

  // Idempotencia antes de tocar nada.
  const yaEsta = await Asiento.findOne({ ref: armado.ref });
  if (yaEsta) return { asiento: yaEsta, repetido: true };

  const aplicados = [];
  try {
    for (const l of armado.lineas) {
      const mov = delta(l);
      await mover(l.cuenta, l.moneda, l.tipo, mov, permitirRojo);
      aplicados.push(l);
    }
    const doc = await Asiento.create({ ...armado, clase });
    return { asiento: doc, repetido: false };
  } catch (e) {
    if (e?.code === 11000) {
      // Otro proceso insertó la misma ref entre la consulta y el insert. Los
      // saldos que aplicamos son de UN asiento que no va a existir: se
      // deshacen, y el que sí existe ya movió los suyos.
      await deshacer(aplicados);
      const otro = await Asiento.findOne({ ref: armado.ref });
      if (otro) return { asiento: otro, repetido: true };
    } else {
      await deshacer(aplicados);
    }
    throw e;
  }
}

/** La compensación: deshace lo aplicado cuando el asiento no llegó a existir. */
async function deshacer(lineas) {
  for (const l of lineas.reverse()) {
    try {
      // permitirRojo en true a propósito: deshacer tiene que poder devolver el
      // saldo a donde estaba aunque el camino pase por un número raro.
      await mover(l.cuenta, l.moneda, l.tipo, -delta(l), true);
    } catch (e) {
      // Si ni la compensación entra, el atajo quedó torcido. El libro sigue
      // bien (el asiento no existe), y `reconciliar()` lo va a arreglar — pero
      // esto tiene que hacer ruido AHORA, no aparecer en un cierre de mes.
      console.error(`[asientos] NO SE PUDO DESHACER ${l.cuenta}/${l.moneda}: ${e.message}`);
    }
  }
}

/** El saldo por el atajo: lo que se usa para pintar pantallas. */
async function saldoDe(cuenta, cod) {
  const doc = await Saldo.findOne({ cuenta, moneda: String(cod || '').toUpperCase() });
  return doc ? doc.monto : '0';
}

/** Todos los saldos de un cliente, por moneda. */
async function saldosDe(cuenta) {
  const docs = await Saldo.find({ cuenta });
  const out = {};
  for (const d of docs) if (moneda(d.moneda)) out[d.moneda] = d.monto;
  return out;
}

/**
 * El saldo DE VERDAD: sumando el libro. Es lo que manda.
 *
 * Se suma en Decimal128 dentro de Mongo, que da 34 dígitos significativos
 * exactos. Un saldo fiat en unidades mínimas no se acerca ni de lejos a ese
 * techo (un billón de dólares son 10^14 céntimos), así que la suma es exacta,
 * no aproximada. Esto no valdría para wei, y por eso el ledger de Ordenex hace
 * otra cosa.
 */
async function saldoReal(cuenta, cod) {
  const codigo = String(cod || '').toUpperCase();
  const r = await Asiento.aggregate([
    { $match: { 'lineas.cuenta': cuenta } },
    { $unwind: '$lineas' },
    { $match: { 'lineas.cuenta': cuenta, 'lineas.moneda': codigo } },
    { $group: {
      _id: '$lineas.tipo',
      debe: { $sum: { $toDecimal: '$lineas.debe' } },
      haber: { $sum: { $toDecimal: '$lineas.haber' } },
    } },
  ]);
  if (!r.length) return '0';
  let total = CERO;
  for (const g of r) {
    const d = BigInt(String(g.debe).split('.')[0]);
    const h = BigInt(String(g.haber).split('.')[0]);
    total += TIPOS[g._id] === 'debe' ? d - h : h - d;
  }
  return total.toString();
}

/**
 * Compara el atajo contra el libro y devuelve las diferencias.
 *
 * `arreglar: true` reescribe el atajo con lo que dice el libro. Nunca al
 * revés: el libro no se toca para que cuadre con un caché.
 */
async function reconciliar({ arreglar = false } = {}) {
  const docs = await Saldo.find({});
  const problemas = [];
  for (const d of docs) {
    const real = await saldoReal(d.cuenta, d.moneda);
    if (real !== d.monto) {
      problemas.push({ cuenta: d.cuenta, moneda: d.moneda, atajo: d.monto, libro: real });
      if (arreglar) {
        await Saldo.updateOne({ _id: d._id }, { $set: { monto: real, actualizado: new Date() } });
      }
    }
  }
  return { revisados: docs.length, problemas, arreglado: arreglar };
}

module.exports = { asentar, saldoDe, saldosDe, saldoReal, reconciliar, delta };
