// La comisión de salida: 1 %, y solo al salir.
//
// ══════════════════════════════════════════════════════════════════════════
// LA DECISIÓN, TAL COMO SE TOMÓ
//
// «Comisión para salir, nada más, es de 1 %.» Las tres partes cuentan:
//
//   · 1 % — diez mil partes por millón.
//   · PARA SALIR — sobre el retiro. Entrar no cuesta nada: comprar ORIGEN con
//     USDT no lleva comisión, y el libro de órdenes tampoco (ese es
//     ORDENEX_COMISION_PPM en lib/motor.js, que sigue en cero a propósito).
//   · NADA MÁS — no hay una segunda comisión escondida en ningún sitio.
//
// ══════════════════════════════════════════════════════════════════════════
// PIDE X, RECIBE X MENOS EL 1 %
//
// De las dos formas de cobrarlo, se elige la que nunca debita más de lo que la
// persona escribió:
//
//   Se hace  →  se debitan 100, salen 99, la casa se queda 1.
//   No       →  se debitan 101 para que salgan 100.
//
// La segunda parece más amable y es peor: alguien con 100 exactos no puede
// sacar sus 100, y el mensaje de «saldo insuficiente» sobre un saldo que
// alcanza es de los que hacen escribir a la gente. Además es lo que hace
// cualquier exchange, así que es lo que se espera.
//
// LA PANTALLA TIENE QUE ENSEÑARLO ANTES. Cobrar un 1 % que la persona
// descubre después es un 1 % que se cobró a escondidas, aunque esté en los
// términos. Por eso `partir` existe suelta y sin tocar nada: la pantalla la
// llama para pintar el desglose, y el retiro la llama para cobrarlo — la misma
// cuenta en los dos sitios, que es lo que hace que el número cuadre.

/** 1 % = 10.000 partes por millón. */
const PPM_POR_OMISION = 10_000;
const DIVISOR = 1_000_000n;
/** Un techo de cordura. Un 10 % no es una comisión, es un error de tipeo con
 *  tres ceros de más, y a esta altura del código nadie lo iba a mirar. */
const PPM_MAXIMO = 100_000;

/**
 * Las partes por millón que se cobran hoy.
 *
 * Una variable mal escrita NO apaga la comisión ni la dispara: se ignora, se
 * canta por consola y se usa el 1 %. Que un error de tipeo en Heroku pueda
 * poner la comisión en cero —o en 50 %— sin que nadie se entere es peor que
 * no poder cambiarla.
 */
function ppm() {
  const crudo = (process.env.ORDENEX_COMISION_SALIDA_PPM || '').trim();
  if (crudo === '') return PPM_POR_OMISION;
  const n = Number(crudo);
  if (!Number.isInteger(n) || n < 0 || n > PPM_MAXIMO) {
    console.error(`[comision] ORDENEX_COMISION_SALIDA_PPM="${crudo}" no vale: se usa ${PPM_POR_OMISION} (1 %)`);
    return PPM_POR_OMISION;
  }
  return n;
}

/** El porcentaje, para enseñarlo. `1` significa 1 %. */
const porciento = () => ppm() / 10_000;

/**
 * Parte una cantidad en lo que se cobra y lo que sale.
 *
 * @param {string|bigint} bruto  wei, entero, lo que la persona escribió
 * @returns {{bruto:string, comision:string, neto:string, ppm:number}}
 *
 * La división entera TRUNCA la comisión hacia abajo, o sea A FAVOR DE LA
 * PERSONA. Es la dirección correcta: cuando el redondeo no se puede evitar,
 * el medio wei se lo queda quien saca su dinero, no la casa. (En la compra se
 * trunca en la otra dirección por el mismo motivo: nunca a favor de la casa
 * cuando la casa es la que decide.)
 */
function partir(bruto) {
  const b = BigInt(bruto);
  if (b <= 0n) {
    throw Object.assign(new Error('La cantidad tiene que ser positiva.'), { codigo: 'CANTIDAD_INVALIDA' });
  }
  const p = ppm();
  const comision = (b * BigInt(p)) / DIVISOR;
  const neto = b - comision;
  return { bruto: b.toString(), comision: comision.toString(), neto: neto.toString(), ppm: p };
}

/**
 * ¿Sale algo después de la comisión?
 *
 * Con cantidades muy chicas la comisión trunca a cero y el neto es el bruto —
 * eso está bien y no es un caso raro que haya que bloquear. Lo que no puede
 * pasar es emitir una transacción de cero: cuesta gas y no mueve nada.
 */
const vale = (bruto) => BigInt(partir(bruto).neto) > 0n;

module.exports = { partir, vale, ppm, porciento, PPM_POR_OMISION, PPM_MAXIMO };
