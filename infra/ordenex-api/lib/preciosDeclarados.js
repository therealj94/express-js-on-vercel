/* El precio declarado por la Junta.
 *
 * Hay tres clases de precio en esta casa y no se mezclan nunca:
 *
 *   1. TRATO       — lo que se pago de verdad en el libro de Ordenex, en
 *                    ORIGEN. Nace de dos personas que se pusieron de acuerdo.
 *   2. REFERENCIA  — lo que vale el metal de verdad en OTRO mercado, en
 *                    dolares y siempre rotulado (lib/referenciaVelas.js).
 *   3. DECLARADO   — esto. Lo que la Junta Directiva le fija por resolucion a
 *                    un instrumento que todavia no cotiza en ningun lado.
 *
 * El tercero es el mas facil de convertir en mentira, y por eso es el mas
 * amarrado. Un precio declarado NO es una opinion sobre cuanto vale ONDK: es
 * el hecho verificable de que la Junta, tal dia, en tal acta, firmada por tal
 * persona, resolvio publicar tal cifra. Ese hecho se puede comprobar abriendo
 * el libro de actas. Sin acta y sin firmante no hay hecho que comprobar, y
 * entonces aqui no entra nada.
 *
 * Consecuencia que hay que tener clara antes de tocar este archivo: un precio
 * declarado NO SE MUEVE entre resoluciones. Se queda plano, en el ultimo valor
 * que la Junta firmo, hasta que la Junta firme otro. Si alguna vez alguien
 * pide que "flote" o que "se mueva un poquito" entre dos actas, la respuesta
 * es no: eso ya no seria el precio declarado, seria un precio inventado con
 * un rotulo de precio declarado encima, que es peor que no tener precio.
 */

const { PrecioDeclarado } = require('../models');

// Los instrumentos que pueden llevar precio declarado. Es una lista blanca y
// no una regla: ORIGEN, AUKA y AGKA siguen un metal y su precio se mide, no se
// declara — que la Junta pudiera "declarar" el precio del oro seria absurdo.
const DECLARABLES = ['ONDK'];

// Cache corta, igual que la lista de mercados: esto lo sondean la sala de
// Ordenex y la wallet de todo el mundo, y cambia cuando hay una Junta, no cada
// treinta segundos. Se cachea por token.
const CACHE_MS = 30_000;
const cache = new Map();

function esDeclarable(token) {
  return DECLARABLES.includes(String(token || '').toUpperCase());
}

/** Lo que sale al publico de una fila. `_id` va para poder borrar una que se
 *  tecleo mal desde el panel; no es un secreto. */
function publico(d) {
  return {
    id: String(d._id),
    fecha: d.fecha.toISOString(),
    precio: d.precio,
    moneda: d.moneda,
    acta: d.acta,
    firmante: d.firmante,
    nota: d.nota || null,
  };
}

/** La serie completa de resoluciones de un token, de la mas vieja a la mas
 *  nueva. Vacia si nunca se declaro nada — vacia de verdad, no un punto de
 *  relleno para que la grafica no se vea sola. */
async function serie(token) {
  const t = String(token || '').toUpperCase();
  if (!esDeclarable(t)) return [];

  const guardado = cache.get(t);
  if (guardado && Date.now() - guardado.en < CACHE_MS) return guardado.lista;

  const filas = await PrecioDeclarado.find({ token: t }).sort({ fecha: 1 }).lean();
  const lista = filas.map(publico);
  cache.set(t, { en: Date.now(), lista });
  return lista;
}

/** La resolucion vigente hoy: la ultima cuya fecha ya llego. Una resolucion
 *  firmada con efecto a futuro NO cuenta todavia — publicarla antes de tiempo
 *  seria adelantar una decision que aun no rige. */
function vigenteDe(lista, cuando = Date.now()) {
  let ultima = null;
  for (const d of lista) {
    if (Date.parse(d.fecha) <= cuando) ultima = d;
    else break;
  }
  return ultima;
}

/** El precio de hoy de un token, o null. Es lo que consume la wallet. */
async function vigente(token) {
  return vigenteDe(await serie(token));
}

/** Se llama al guardar o borrar una resolucion: sin esto el panel diria que
 *  la cargo y la sala seguiria enseñando la anterior durante medio minuto,
 *  que es justo el rato en el que alguien vuelve a darle al boton. */
function olvidar(token) {
  cache.delete(String(token || '').toUpperCase());
}

module.exports = { DECLARABLES, esDeclarable, serie, vigente, vigenteDe, publico, olvidar };
