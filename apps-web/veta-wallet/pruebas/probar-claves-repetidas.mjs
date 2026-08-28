/* NINGUNA CLAVE REPETIDA EN LAS TABLAS DE TEXTO.
 *
 * En JavaScript, dos claves iguales en el mismo objeto no son un error: gana
 * la última y la primera desaparece sin decir nada. En una tabla de textos eso
 * significa que una frase escrita, revisada y traducida no se muestra jamás, y
 * en su lugar aparece otra que no tiene nada que ver.
 *
 * Pasó, y se veía así: `AURA_TXT.es` tenía `hola` dos veces —el saludo del
 * panel de AU-RA arriba, y el «Te damos la bienvenida, » de la pantalla
 * ceremonial ochenta líneas más abajo—. Ganaba la segunda. Así que quien
 * tocaba la burbuja de AU-RA por primera vez recibía «Te damos la bienvenida,»
 * y ahí se cortaba: media frase, sin nombre detrás, y la voz cortándose igual.
 * En inglés, lo mismo con «Welcome, ».
 *
 * No se puede pedir que esto lo vea alguien leyendo: son tablas de doscientas
 * claves y las dos copias estaban lejos. Lo ve una máquina en un segundo.
 *
 * ── CÓMO SE MIRA ──────────────────────────────────────────────────────────
 *
 * Se recorre el archivo carácter a carácter llevando la cuenta de las llaves
 * abiertas, y saltando lo que está dentro de comillas, plantillas y
 * comentarios — que en estos archivos hay mucho, y una comilla mal contada
 * convierte el resto del archivo en basura. Cada `{` abre un ámbito nuevo;
 * cada `nombre:` al principio de una línea se apunta en el ámbito actual.
 *
 * Se miran solo las tablas de texto, no todo el archivo: en el código normal
 * hay objetos que se arman con claves calculadas y no se pueden comparar así.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

let fallos = 0;
const ok = (c, q, d = '') => {
  console.log(`  ${c ? 'ok   ' : 'FALLA'} ${q}${d && !c ? '\n           ' + d : ''}`);
  if (!c) fallos++;
};

/** Devuelve [{clave, lineas:[...]}] con las claves repetidas dentro de un
    mismo objeto, mirando desde `desde` hasta que se cierre su llave. */
function repetidas(texto, desde) {
  const n = texto.length;
  let i = texto.indexOf('{', desde);
  if (i < 0) return [];
  let linea = texto.slice(0, i).split('\n').length;
  const pilas = [new Map()];
  const chocan = [];
  i += 1;
  while (i < n && pilas.length) {
    const c = texto[i];
    const d = texto[i + 1];
    if (c === '\n') { linea++; i++; continue; }
    // comentarios
    if (c === '/' && d === '/') { while (i < n && texto[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(texto[i] === '*' && texto[i + 1] === '/')) { if (texto[i] === '\n') linea++; i++; }
      i += 2; continue;
    }
    // cadenas: comilla simple, doble y plantilla. La barra invertida escapa.
    if (c === "'" || c === '"' || c === '`') {
      const cierre = c; i++;
      while (i < n) {
        if (texto[i] === '\\') { i += 2; continue; }
        if (texto[i] === '\n') linea++;
        if (texto[i] === cierre) { i++; break; }
        // dentro de una plantilla, `${…}` puede traer llaves y cadenas: se
        // salta entero contando llaves, o el conteo de afuera se desbarata.
        if (cierre === '`' && texto[i] === '$' && texto[i + 1] === '{') {
          let hondo = 1; i += 2;
          while (i < n && hondo) {
            if (texto[i] === '{') hondo++;
            else if (texto[i] === '}') hondo--;
            else if (texto[i] === '\n') linea++;
            else if (texto[i] === "'" || texto[i] === '"' || texto[i] === '`') {
              const c2 = texto[i]; i++;
              while (i < n && texto[i] !== c2) { if (texto[i] === '\\') i++; if (texto[i] === '\n') linea++; i++; }
            }
            i++;
          }
          continue;
        }
        i++;
      }
      continue;
    }
    if (c === '{') { pilas.push(new Map()); i++; continue; }
    if (c === '}') { pilas.pop(); i++; continue; }
    // una clave: al principio de línea (tras espacios) o tras una coma
    const antes = texto.slice(Math.max(0, i - 40), i);
    if (/[A-Za-z_$]/.test(c) && /(^|[\n,{])\s*$/.test(antes)) {
      const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(texto.slice(i, i + 60));
      if (m) {
        const cima = pilas[pilas.length - 1];
        if (cima.has(m[1])) chocan.push({ clave: m[1], lineas: [cima.get(m[1]), linea] });
        else cima.set(m[1], linea);
        i += m[0].length; continue;
      }
    }
    i++;
  }
  return chocan;
}

console.log('\nLas tablas de texto no tienen claves repetidas\n');

const TABLAS = [
  { archivo: 'app.js', marca: 'const AURA_TXT = {', que: 'AURA_TXT (los textos de AU-RA)' },
  { archivo: 'i18n.js', marca: 'const I18N = {', que: 'I18N (los textos de la app)' },
];

for (const t of TABLAS) {
  const texto = readFileSync(join(RAIZ, t.archivo), 'utf8');
  const desde = texto.indexOf(t.marca);
  if (desde < 0) { ok(false, `se encuentra ${t.que}`, `no está «${t.marca}» en ${t.archivo}`); continue; }
  const chocan = repetidas(texto, desde);
  ok(chocan.length === 0, `${t.que}: cada clave una sola vez`,
     chocan.map((c) => `«${c.clave}» en las líneas ${c.lineas.join(' y ')} de ${t.archivo} — `
                     + 'gana la última y la primera no se muestra nunca').join('\n           '));
}

/* Y la comprobación que hace confiable a la de arriba: si le meto un duplicado
   a propósito, TIENE que verlo. Un detector que nunca encuentra nada y un
   archivo limpio se ven exactamente igual. */
const conTrampa = 'const X = {\n  uno: 1,\n  dos: `${ {a:1} } y ${"}"}`,\n  uno: 3,\n};';
const pillado = repetidas(conTrampa, 0);
ok(pillado.length === 1 && pillado[0].clave === 'uno',
   'y el detector encuentra uno puesto a mano, con plantillas de por medio',
   `encontró ${JSON.stringify(pillado)}`);

console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
