// Lo que cobra la casa y hasta dónde deja mover: comisiones y límites.
//
// ══ POR QUÉ ESTO ES UN ARCHIVO Y NO NÚMEROS SUELTOS ════════════════════════
//
// Una comisión escondida dentro de un controller es una comisión que nadie
// revisa. Aquí están todas juntas, en un sitio, para que la Junta pueda leer
// exactamente qué se cobra sin abrir el código del dinero.
//
// ══ TODO ARRANCA EN CERO ═══════════════════════════════════════════════════
//
// Ninguna comisión tiene un valor «razonable» por defecto. Un cobro que
// aparece porque nadie configuró nada es un cobro que nadie decidió, y el día
// que un cliente pregunte «¿por qué me quitaron 2 dólares?» la respuesta no
// puede ser «venía así». Se configuran con AUCORP_TARIFAS y quedan escritas.
//
// ══ LOS LÍMITES SÍ ARRANCAN PUESTOS ════════════════════════════════════════
//
// Al revés que las comisiones: un límite que arranca en infinito es una cuenta
// nueva por la que puede pasar cualquier cantidad el primer día. La norma de
// prevención de lavado espera lo contrario —empezar apretado y soltar según la
// verificación—, así que el defecto es el nivel más bajo y se sube a mano.
//
// ══ SE MIDEN EN DÓLARES, Y ESO TIENE UN COSTE ══════════════════════════════
//
// Un límite por moneda sería trivial de saltar: mil de tope en cada una de
// veintiuna monedas son veintiún mil. Así que todo se convierte a la moneda de
// referencia con la tasa del día. Eso significa que SIN TASA NO HAY LÍMITE
// COMPROBABLE, y entonces la operación no sale: es la misma regla fail-closed
// de siempre. Dejar pasar porque el proveedor de tasas está caído es
// exactamente cuando conviene mover dinero que no debería moverse.

const { moneda, REFERENCIA } = require('./monedas');
const { cotizar, convertir } = require('./cambio');

/** Lo que se cobra. Todo en CERO salvo que AUCORP_TARIFAS diga otra cosa.
 *  `fijo` va en unidades mínimas de la moneda de la operación; `bps` son
 *  puntos base sobre el monto (100 = 1%). */
const COMISIONES_BASE = {
  deposito: { fijo: '0', bps: 0 },
  retiro: { fijo: '0', bps: 0 },
  transferencia: { fijo: '0', bps: 0 },
  // El cambio de divisa NO cobra comisión aparte: su precio es el margen
  // sobre la tasa (AUCORP_MARGEN_BPS, en lib/cambio.js). Cobrar las dos cosas
  // sería cobrar dos veces por lo mismo con nombres distintos.
  cambio: { fijo: '0', bps: 0 },
};

/** Hasta dónde puede mover cada nivel, en centavos de dólar.
 *
 *  Estos números son POLÍTICA, no técnica: los pone la Junta y se cambian con
 *  AUCORP_LIMITES. Los de aquí son un punto de partida conservador, no una
 *  recomendación regulatoria — quien fije los definitivos tiene que mirar el
 *  régimen de cada plaza. */
const LIMITES_BASE = {
  // Identidad verificada, nada más. Es donde cae todo el mundo al entrar.
  1: { diario: '100000', mensual: '500000' },        // 1.000 / 5.000 USD
  // Verificación reforzada (domicilio, origen de fondos).
  2: { diario: '1000000', mensual: '5000000' },      // 10.000 / 50.000 USD
  // Empresa o cliente con expediente completo.
  3: { diario: '10000000', mensual: '50000000' },    // 100.000 / 500.000 USD
};

function leerJson(nombre, base) {
  const crudo = (process.env[nombre] || '').trim();
  if (!crudo) return base;
  try {
    const puesto = JSON.parse(crudo);
    // Se MEZCLA sobre la base en vez de reemplazarla: así una configuración a
    // medias no deja una operación sin tarifa ni un nivel sin límite.
    const salida = {};
    for (const k of Object.keys(base)) salida[k] = { ...base[k], ...(puesto[k] || {}) };
    return salida;
  } catch (e) {
    // Configuración rota: se usa la base y se GRITA. Arrancar con tarifas a
    // medio leer sería cobrar cualquier cosa sin que nadie lo sepa.
    console.error(`[tarifas] ${nombre} no es JSON válido, se usan los valores de fábrica: ${e.message}`);
    return base;
  }
}

const comisiones = () => leerJson('AUCORP_TARIFAS', COMISIONES_BASE);
const limites = () => leerJson('AUCORP_LIMITES', LIMITES_BASE);

/**
 * La comisión de una operación, en unidades mínimas de esa moneda.
 *
 * Se redondea HACIA ABAJO a propósito: el redondeo de una comisión favorece a
 * quien la cobra, y si va a haber medio céntimo de diferencia que sea a favor
 * del cliente. Es la decisión contraria a la de `convertir()` —donde el
 * redondeo es al más cercano— y por el mismo motivo: que el sobrante nunca
 * caiga sistemáticamente del lado de la casa.
 */
function comision(operacion, montoMin, cod) {
  const m = moneda(cod);
  const c = comisiones()[operacion];
  if (!m || !c) return '0';
  const fijo = /^\d+$/.test(String(c.fijo)) ? BigInt(c.fijo) : 0n;
  const bps = BigInt(Math.max(0, Math.min(10000, parseInt(c.bps, 10) || 0)));
  const variable = (BigInt(montoMin) * bps) / 10000n;
  const total = fijo + variable;
  // Una comisión no puede comerse el monto entero.
  return (total >= BigInt(montoMin) ? 0n : total).toString();
}

/**
 * ¿Cabe esta operación en los límites del usuario?
 *
 * Devuelve { cabe, motivo, usado, tope, moneda } con todo en centavos de
 * dólar. `cabe: false` con motivo 'SIN_TASA' significa que no se pudo
 * comprobar — y no poder comprobar es un NO, no un sí.
 *
 * `movidoUsd` lo calcula quien llama (recorriendo el libro), porque el libro
 * es de otro módulo y meterlo aquí ataría las tarifas a la base de datos.
 */
async function cabeEnLimites(nivel, montoMin, cod, movido) {
  const tope = limites()[String(nivel || 1)] || limites()['1'];

  let enUsd;
  if (cod === REFERENCIA) {
    enUsd = montoMin;
  } else {
    const c = await cotizar(cod, REFERENCIA);
    // Sin tasa no se puede medir el límite, y sin poder medirlo no se pasa.
    if (!c) return { cabe: false, motivo: 'SIN_TASA' };
    enUsd = convertir(montoMin, cod, REFERENCIA, c.media);
  }

  const nuevoDiario = BigInt(movido.diario || '0') + BigInt(enUsd);
  if (nuevoDiario > BigInt(tope.diario)) {
    return {
      cabe: false, motivo: 'LIMITE_DIARIO',
      usado: movido.diario, tope: tope.diario, intento: enUsd, moneda: REFERENCIA,
    };
  }
  const nuevoMensual = BigInt(movido.mensual || '0') + BigInt(enUsd);
  if (nuevoMensual > BigInt(tope.mensual)) {
    return {
      cabe: false, motivo: 'LIMITE_MENSUAL',
      usado: movido.mensual, tope: tope.mensual, intento: enUsd, moneda: REFERENCIA,
    };
  }
  return { cabe: true, enUsd, tope, moneda: REFERENCIA };
}

module.exports = { comisiones, limites, comision, cabeEnLimites };
