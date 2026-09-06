/* LOS NÚMEROS, PARA QUE SE ENTIENDAN AL OÍRLOS.
 *
 * ── EL PROBLEMA, CON SUS PALABRAS ───────────────────────────────────────────
 * «Los números los lee mal, no se entiende; y si tenemos números largos, no
 * leer más de dos decimales después del punto: ahorramos y redondea.»
 *
 * Tiene razón dos veces. Un número escrito y un número dicho no son la misma
 * cosa:
 *
 *   ESCRITO                     DICHO (antes)                DICHO (ahora)
 *   2.5902 USD                  «dos punto cinco nueve       «dos punto cincuenta
 *                                cero dos u ese de»           y nueve dólares»
 *   #1,283,459                  «uno coma dos ocho tres…»    «bloque un millón
 *                                                             doscientos ochenta…»
 *   0x8832E2D5cCc707bC5f…       cuarenta letras deletreadas  «la dirección que
 *                                                             termina en Ab3»
 *   137/512 MB · 27 %           «ciento treinta y siete       «137 de 512 megas,
 *                                barra…»                      27 por ciento»
 *   4,431 USD/oz                «u ese de barra o zeta»      «dólares la onza»
 *
 * ── LAS TRES REGLAS ─────────────────────────────────────────────────────────
 * 1. DOS DECIMALES, redondeando. Nadie necesita oír la cuarta cifra de un
 *    precio, y cada una es media palabra más de espera.
 * 2. LO QUE NO SE DICE, NO SE DICE. Una dirección de cadena, un hash o un id de
 *    Mongo no se leen en voz alta: se nombran por su final, que es como los
 *    nombran las personas.
 * 3. LAS UNIDADES SE DICEN COMO SE HABLAN. «°C» es «grados», «%» es «por
 *    ciento», «USD/oz» es «dólares la onza». Un símbolo deletreado no es un
 *    dato: es ruido.
 *
 * Esto es SOLO para la voz. Lo escrito en pantalla no se toca: ahí el precio
 * con cuatro decimales es el precio, y la dirección entera hace falta para
 * copiarla.
 */

/* Un número con más de dos decimales se redondea a dos, y si los dos son cero
   se quitan: «2.50» se dice mejor «2.5», y «7.00» es «7».
   El separador de miles se respeta tal cual esté escrito: los motores de voz
   leen bien «1,283,459» y «1.283.459» en su idioma, y quitarlo produce
   «unodoschocientos». */
function dosDecimales(texto) {
  return String(texto)
    /* «1,250.00» se dice «mil doscientos cincuenta». Los ceros a la derecha del
       punto no aportan nada al oído y sí media palabra de espera. */
    .replace(/(\d)([.,])00\b(?!\d)/g, '$1')
    .replace(/(\d[.,]\d)0\b(?!\d)/g, '$1')
    .replace(/(\d)([.,])(\d{3,})\b/g, (todo, ent, sep, dec) => {
    /* Ojo con el separador de MILES: «1,283» no es un decimal de tres cifras,
       es mil doscientos ochenta y tres. Se distingue por lo que sigue: un
       separador de miles va seguido de exactamente tres cifras y, casi siempre,
       de otro grupo o de un final de número. */
    if (dec.length === 3 && /^\d{3}$/.test(dec)) return todo;
    const n = Number(`${ent}.${dec}`);
    if (!Number.isFinite(n)) return todo;
    const r = Math.round(n * 100) / 100;
    return String(r).replace('.', sep);
    });
}

/* Direcciones de cadena, hashes e ids: no se deletrean. Se nombran por el
   final, que es como los nombra una persona cuando los compara. */
function sinCadenasLargas(texto) {
  return String(texto)
    .replace(/\b0x[a-fA-F0-9]{8,}\b/g, (d) => `la dirección que termina en ${d.slice(-4)}`)
    .replace(/\b[a-f0-9]{24,}\b/g, (d) => `el identificador que termina en ${d.slice(-4)}`)
    .replace(/\b[A-Za-z0-9_-]{28,}\b/g, (d) => (/[0-9]/.test(d) && /[A-Za-z]/.test(d) ? `un código que termina en ${d.slice(-4)}` : d));
}

/* Las unidades y los símbolos, dichos como se hablan. El orden importa: lo más
   específico primero, para que «USD/oz» no se convierta en «USD la o zeta». */
const UNIDADES = [
  [/\bUSD\s*\/\s*oz\b/gi, 'dólares la onza'],
  [/\bUSD\s*\/\s*g\b/gi, 'dólares el gramo'],
  /* USDT NO se toca: los motores leen «u-ese-de-te», que es como lo dice todo
     el mundo. Pasarlo a minúsculas lo convertía en una palabra ilegible. */
  [/\bUSD\b/g, 'dólares'],
  [/\bHNL\b/g, 'lempiras'],
  [/(\d)\s*°\s*C\b/g, '$1 grados'],
  [/(\d)\s*%/g, '$1 por ciento'],
  [/(\d)\s*km\/h\b/gi, '$1 kilómetros por hora'],
  [/(\d)\s*MB\b/g, '$1 megas'],
  [/(\d)\s*GB\b/g, '$1 gigas'],
  [/(\d)\s*KB\b/g, '$1 kilobytes'],
  [/(\d)\s*ms\b/g, '$1 milisegundos'],
  [/(\d)\s*h\b/g, '$1 horas'],
  /* «137/512» es «137 de 512». Solo entre números: una fecha «6/9» también,
     y suena bien. */
  [/(\d)\s*\/\s*(\d)/g, '$1 de $2'],
  [/#(\d)/g, 'número $1'],
  [/\bnº\s*/gi, 'número '],
];

/* «1 milisegundos» no lo dice nadie. Se arregla al final, una vez, en vez de
   duplicar cada regla de arriba en singular y plural. */
const SINGULAR = /\b1 (milisegundo|grado|hora|mega|giga|kilobyte|dólar|lempira|kilómetro por hora)s\b/g;

function unidades(texto) {
  let t = String(texto);
  for (const [re, con] of UNIDADES) t = t.replace(re, con);
  return t.replace(SINGULAR, '1 $1').replace(/\b1 kilómetros por hora\b/g, '1 kilómetro por hora');
}

/**
 * Todo junto. Se aplica al texto que va a la voz, nunca al de la pantalla.
 */
function paraLaVoz(texto) {
  return unidades(sinCadenasLargas(dosDecimales(String(texto || ''))));
}

module.exports = { paraLaVoz, dosDecimales, sinCadenasLargas, unidades, UNIDADES };
