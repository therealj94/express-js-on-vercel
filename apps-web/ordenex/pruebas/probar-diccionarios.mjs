/* Los diccionarios de Ordenex, leídos como TEXTO.
 *
 *   node apps-web/ordenex/pruebas/probar-diccionarios.mjs
 *
 * POR QUE NO SE PRUEBA EL OBJETO SINO EL ARCHIVO
 *
 * En un objeto literal de JavaScript, una clave repetida no es un error: gana
 * la última y la primera desaparece sin dejar rastro. Cargar i18n.js y mirar
 * `I18N.es` no puede encontrar un duplicado, porque para cuando hay objeto ya
 * no hay duplicado — hay un valor pisado.
 *
 * Y eso fue exactamente el fallo: `pt.mvAlto`, `pt.mvBajo` y `pt.mvVol`
 * estaban DOS veces en el diccionario español, la segunda con el texto en
 * inglés. La portada en español encabezaba sus columnas «24 h high / 24 h low
 * / 24 h vol.» y ninguna prueba lo veía, porque desde el objeto no se ve.
 * Encima el diccionario inglés no tenía esas tres claves, así que caía por el
 * respaldo a las españolas —que eran inglesas— y el inglés salía bien de pura
 * casualidad. Los dos defectos se tapaban entre sí.
 *
 * Así que esto lee el ARCHIVO y cuenta claves a mano. Comprueba dos cosas:
 *
 *   1. que ninguna clave esté dos veces dentro del mismo bloque de idioma;
 *   2. que los bloques `es` y `en` de un mismo diccionario tengan las MISMAS
 *      claves — porque una clave que falta de un lado se tapa con el respaldo
 *      del otro y el idioma equivocado se cuela sin que nadie lo note.
 *
 * Cubre el diccionario del cascarón (i18n.js) y el TXT de cada vista, que es
 * donde vive la mitad de los textos de la casa.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVOS = ['i18n.js', 'mercado.js', 'portafolio.js', 'fiat.js'];

let malas = 0;
const decir = (ok, que, extra = '') => {
  if (!ok) malas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`);
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 300)}`);
};

/* Encuentra los bloques `es: {` y `en: {` de primer nivel y devuelve, para
   cada uno, las claves en el ORDEN en que están escritas.

   El recorrido es a mano y con dos cosas en la cabeza: la profundidad de
   llaves —solo cuentan las claves del nivel de arriba del bloque— y que hay
   comillas y comentarios por todas partes. Un parser de JS entero sería más
   correcto y traería una dependencia para contar cadenas; esto alcanza
   porque los diccionarios de esta casa son literales planos y se escriben a
   mano, que es justo la razón por la que se les cuelan duplicados. */
function bloquesDeIdioma(fuente) {
  const bloques = [];
  const re = /(^|[\s{,])(es|en)\s*:\s*\{/g;
  let m;
  while ((m = re.exec(fuente))) {
    const idioma = m[2];
    const desde = re.lastIndex;             // justo después de la llave que abre
    let i = desde, prof = 1;
    const claves = [];
    let hondo = 0;                          // profundidad relativa dentro del bloque

    while (i < fuente.length && prof > 0) {
      const c = fuente[i];

      // Los comentarios se saltan enteros: dentro hay llaves y comillas que
      // no son código, y una comilla suelta en una frase descuadraría todo.
      if (c === '/' && fuente[i + 1] === '/') { i = fuente.indexOf('\n', i); if (i < 0) break; continue; }
      if (c === '/' && fuente[i + 1] === '*') { i = fuente.indexOf('*/', i); if (i < 0) break; i += 2; continue; }

      // Una cadena: se lee entera. Si estaba en el nivel de arriba y detrás
      // lleva dos puntos, es una CLAVE de este bloque.
      if (c === "'" || c === '"' || c === '`') {
        const abre = i;
        i++;
        while (i < fuente.length && fuente[i] !== c) { if (fuente[i] === '\\') i++; i++; }
        const texto = fuente.slice(abre + 1, i);
        i++;
        let j = i;
        while (j < fuente.length && /\s/.test(fuente[j])) j++;
        if (hondo === 0 && fuente[j] === ':') claves.push(texto);
        continue;
      }

      // Una clave sin comillas (mercado: 'x'), también del nivel de arriba.
      if (hondo === 0 && /[A-Za-z_$]/.test(c)) {
        const abre = i;
        while (i < fuente.length && /[\w$]/.test(fuente[i])) i++;
        const palabra = fuente.slice(abre, i);
        let j = i;
        while (j < fuente.length && /\s/.test(fuente[j])) j++;
        if (fuente[j] === ':') claves.push(palabra);
        continue;
      }

      if (c === '{') { prof++; hondo++; }
      else if (c === '}') { prof--; if (prof > 0) hondo--; }
      i++;
    }
    bloques.push({ idioma, claves, desde });
  }
  return bloques;
}

console.log('\n════ LOS DICCIONARIOS ══════════════════════════════════════');

for (const archivo of ARCHIVOS) {
  console.log(`\n── ${archivo} ${'─'.repeat(Math.max(2, 50 - archivo.length))}`);
  let fuente;
  try {
    fuente = await readFile(join(WEB, archivo), 'utf8');
  } catch {
    decir(false, `se puede leer ${archivo}`);
    continue;
  }

  const bloques = bloquesDeIdioma(fuente);
  decir(bloques.length >= 2, 'tiene un diccionario español y uno inglés',
    bloques.map(b => `${b.idioma}:${b.claves.length}`).join(' · '));

  // 1 · duplicados dentro de cada bloque
  for (const b of bloques) {
    const vistas = new Set(), repes = [];
    for (const k of b.claves) {
      if (vistas.has(k)) repes.push(k); else vistas.add(k);
    }
    decir(repes.length === 0, `«${b.idioma}» no repite ninguna clave`,
      repes.length ? `repetidas: ${[...new Set(repes)].join(', ')}` : `${b.claves.length} claves`);
  }

  // 2 · los dos idiomas dicen lo mismo. Se comparan de a pares, en el orden
  //     en que aparecen: es/en, es/en… — así vale igual para I18N que para un
  //     TXT de vista, que tienen la misma forma.
  for (let i = 0; i + 1 < bloques.length; i += 2) {
    const a = bloques[i], b = bloques[i + 1];
    if (a.idioma === b.idioma) continue;
    const ca = new Set(a.claves), cb = new Set(b.claves);
    const faltanEn = [...ca].filter(k => !cb.has(k));
    const faltanEs = [...cb].filter(k => !ca.has(k));
    decir(faltanEn.length === 0 && faltanEs.length === 0,
      'las mismas claves en los dos idiomas',
      faltanEn.length || faltanEs.length
        ? `faltan en «${b.idioma}»: ${faltanEn.join(', ') || '—'} · faltan en «${a.idioma}»: ${faltanEs.join(', ') || '—'}`
        : `${ca.size} claves a cada lado`);
  }
}

console.log(`\n${malas === 0 ? 'todo en pie.' : malas + ' comprobación(es) fallaron'}\n`);
process.exit(malas === 0 ? 0 : 1);
