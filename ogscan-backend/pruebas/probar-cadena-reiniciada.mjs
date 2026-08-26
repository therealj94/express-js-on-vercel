/* El indexador tiene que darse cuenta de que la cadena se reinició.
 *
 * ══ EL FALLO QUE ESTE ARCHIVO FIJA ══════════════════════════════════════════
 *
 * El 25 de agosto la 5550 se reinició con un génesis nuevo, y el explorador se
 * quedó mudo sin que nada lo delatara. Por fuera parecía sano —la altura la lee
 * del RPC y salía bien—, pero servía las 23 transacciones de una cadena muerta,
 * apuntando a bloques que ya no puede abrir nadie.
 *
 * El motivo: la marca de progreso decía 92.834, la punta de la cadena vieja, y
 * la nueva iba por 1.500. Como `desde > punta`, el indexador se daba por
 * adelantado y volvía sin hacer nada. No habría indexado un solo bloque hasta
 * que la cadena nueva pasara los 92.834 — diez días y medio.
 *
 * ══ LO QUE SE COMPRUEBA ═════════════════════════════════════════════════════
 *
 * La decisión de `mismaCadena()`, que es donde vive el criterio. Se prueba con
 * los dos lados, porque una decisión que sólo se comprueba en un sentido no
 * está comprobada:
 *
 *  · que RECONOCE una cadena reiniciada (hashes del bloque cero distintos);
 *  · y sobre todo que NO se confunde cuando la cadena es la misma. Ese es el
 *    error caro: un falso positivo borra una base buena.
 *
 * La lógica se copia aquí en vez de importar el módulo. `EventBlockchain.js`
 * abre una conexión a Mongo y un cliente web3 nada más cargarse, y montar todo
 * eso para comprobar quince líneas de decisión daría una prueba lenta y frágil
 * que en realidad probaría a Mongo. Si alguien cambia el criterio allá, tiene
 * que cambiarlo aquí — y esa es justamente la señal que se quiere.
 */

// ── la decisión, tal como está en EventBlockchain.js ────────────────────────
const mismaCadena = async ({ bloqueCeroCadena, bloqueCeroGuardado, progreso, punta }) => {
  const cero = bloqueCeroCadena;
  const guardado = bloqueCeroGuardado;
  if (guardado && guardado.hash && cero && cero.hash) {
    return String(guardado.hash).toLowerCase() === String(cero.hash).toLowerCase();
  }
  if (guardado) return true;
  if (!progreso) return true;
  return Number(progreso.valor) <= Number(punta);
};

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};

const VIEJO = '0x1111111111111111111111111111111111111111111111111111111111111111';
const NUEVO = '0x56b3cf56694f61c8a1ff1eae8bb50c57723899a1f493910a59f797b3ce734405';

console.log('\n── reconoce que la cadena cambió ────────────────────────────');
comprobar(
  false === await mismaCadena({ bloqueCeroCadena: { hash: NUEVO },
                                bloqueCeroGuardado: { hash: VIEJO } }),
  'con dos bloques cero distintos, dice que NO es la misma cadena');

comprobar(
  false === await mismaCadena({ bloqueCeroCadena: { hash: NUEVO },
                                bloqueCeroGuardado: null,
                                progreso: { valor: '92834' }, punta: 1587 }),
  'sin bloque cero guardado, un progreso por delante de la punta también la delata',
  'es el caso exacto del 25-ago: marca en 92.834, cadena en 1.587');

console.log('\n── y NO se confunde cuando la cadena es la misma ─────────────');
comprobar(
  true === await mismaCadena({ bloqueCeroCadena: { hash: NUEVO },
                               bloqueCeroGuardado: { hash: NUEVO } }),
  'con el mismo bloque cero, dice que sí es la misma');

comprobar(
  true === await mismaCadena({ bloqueCeroCadena: { hash: NUEVO.toUpperCase() },
                               bloqueCeroGuardado: { hash: NUEVO } }),
  'y no se pelea con las mayúsculas del hash');

comprobar(
  true === await mismaCadena({ bloqueCeroCadena: { hash: NUEVO },
                               bloqueCeroGuardado: null,
                               progreso: { valor: '1500' }, punta: 1587 }),
  'con la marca detrás de la punta, todo normal');

console.log('\n── en la duda no se borra ───────────────────────────────────');
comprobar(
  true === await mismaCadena({ bloqueCeroCadena: null,
                               bloqueCeroGuardado: { hash: VIEJO } }),
  'si el nodo no devuelve el bloque cero, NO se declara otra cadena',
  'equivocarse hacia el borrado tira una base buena; hacia el otro lado, se espera una vuelta');

comprobar(
  true === await mismaCadena({ bloqueCeroCadena: { hash: NUEVO },
                               bloqueCeroGuardado: { hash: '' } }),
  'si lo guardado está a medias, tampoco');

comprobar(
  true === await mismaCadena({ bloqueCeroCadena: { hash: NUEVO },
                               bloqueCeroGuardado: null, progreso: null }),
  'y con la base vacía no hay nada que contradecir');

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
