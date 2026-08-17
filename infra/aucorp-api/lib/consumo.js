// Cuánto ha movido una persona en las últimas 24 horas y en los últimos 30
// días, medido en dólares.
//
// ══ POR QUÉ SE CUENTA LO QUE SALE Y NO LO QUE ENTRA ════════════════════════
//
// El límite existe para acotar la SALIDA de dinero, que es la que no se puede
// deshacer. Contar también los depósitos haría que a alguien que ingresó su
// sueldo se le cerrara la cuenta para usarlo, que es exactamente al revés de
// lo que la norma busca.
//
// ══ POR QUÉ SE RECORRE EL LIBRO Y NO UN CONTADOR ═══════════════════════════
//
// Un contador «gastado hoy» guardado en el usuario es un número que se puede
// quedar atrás —un asiento revertido, un proceso que murió— y cuando se queda
// atrás lo hace en silencio y a favor de quien está moviendo dinero. El libro
// no puede mentir porque es de donde sale el saldo.
//
// El coste es una consulta por operación. Con el volumen de hoy no se nota; el
// día que se note, la respuesta es un índice o un corte de periodo firmado, no
// un contador suelto.

const { Asiento } = require('../models');
const { REFERENCIA } = require('./monedas');
const { cotizar, convertir } = require('./cambio');

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Lo que salió de `cuenta` desde `desde`, por moneda, en unidades mínimas.
 *
 * El DEBE es lo que se va: en una cuenta de cliente (pasivo) el debe la baja.
 * Pero un retiro RECHAZADO no puede seguir consumiendo el límite del día —el
 * dinero volvió entero y nunca salió de la casa—, así que los asientos de
 * clase `reverso` restan lo que devolvieron.
 *
 * No se resta cualquier haber: el que RECIBE una transferencia tiene un haber
 * en su cuenta, y descontárselo del consumo le regalaría límite por el simple
 * hecho de que alguien le mandó dinero. Solo cuenta lo que deshace una salida
 * propia.
 */
async function salidasPorMoneda(cuenta, desde) {
  const r = await Asiento.aggregate([
    { $match: { 'lineas.cuenta': cuenta, fecha: { $gte: desde } } },
    { $unwind: '$lineas' },
    { $match: { 'lineas.cuenta': cuenta } },
    { $group: {
      _id: '$lineas.moneda',
      debe: { $sum: { $toDecimal: '$lineas.debe' } },
      devuelto: { $sum: { $cond: [
        { $eq: ['$clase', 'reverso'] }, { $toDecimal: '$lineas.haber' }, 0,
      ] } },
    } },
  ]);
  const out = {};
  for (const g of r) {
    const neto = BigInt(String(g.debe).split('.')[0] || '0')
      - BigInt(String(g.devuelto).split('.')[0] || '0');
    if (neto > 0n) out[g._id] = neto.toString();
  }
  return out;
}

/** Pasa un mapa {moneda: mínimas} a un total en centavos de dólar.
 *  Devuelve null si a alguna moneda le falta la tasa: un total a medias
 *  siempre sale MÁS CHICO de lo real, y un límite medido con un total chico
 *  deja pasar de más. Mejor no saber que saber mal. */
async function aReferencia(porMoneda) {
  let total = 0n;
  for (const [cod, min] of Object.entries(porMoneda)) {
    if (cod === REFERENCIA) { total += BigInt(min); continue; }
    const c = await cotizar(cod, REFERENCIA);
    if (!c) return null;
    total += BigInt(convertir(min, cod, REFERENCIA, c.media));
  }
  return total.toString();
}

/**
 * { diario, mensual } en centavos de dólar, o null si no se pudo medir.
 *
 * `ahora` se pasa desde fuera para que las pruebas puedan mirar una ventana
 * concreta sin depender del reloj de la máquina.
 */
async function movidoPor(cuenta, ahora = new Date()) {
  const dia = await salidasPorMoneda(cuenta, new Date(ahora.getTime() - DIA_MS));
  const mes = await salidasPorMoneda(cuenta, new Date(ahora.getTime() - 30 * DIA_MS));
  const diario = await aReferencia(dia);
  const mensual = await aReferencia(mes);
  if (diario === null || mensual === null) return null;
  return { diario, mensual };
}

module.exports = { movidoPor, salidasPorMoneda };
