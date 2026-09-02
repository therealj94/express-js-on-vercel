/* La web pública y la web OS tienen que ser la MISMA casa.
 *
 * ── POR QUE EXISTE ─────────────────────────────────────────────────────────
 *
 * La portada del 2-sep nació con fondo plano, tarjetas opacas y botones de
 * esquina redondeada, y se veía de otra empresa. José lo dijo así: «rompió
 * patrón que teníamos para nuestra web os con vetawallet».
 *
 * Arreglarlo una vez es fácil. Lo difícil es que siga arreglado: son dos
 * carpetas distintas, y la paleta de una se puede tocar sin que nadie mire la
 * otra. En un mes son dos casas parecidas, que es peor que dos casas
 * distintas — parece un descuido, no una decisión.
 *
 * Así que el patrón se comprueba, no se recuerda. Esta prueba lee la hoja de
 * la billetera (`apps-web/veta-wallet/index.html`), que es LA FUENTE, y exige
 * que la portada diga lo mismo.
 *
 *   node sitio-ordenglobal/probar-mismo-patron.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf8');
const huella = (p) => createHash('sha256').update(readFileSync(join(RAIZ, p))).digest('hex');

let fallos = 0;
const ok = (bien, que, porque) => {
  console.log(`  ${bien ? 'ok  ' : 'MAL '} ${que}`);
  if (!bien) { fallos++; if (porque) console.log(`       ${porque}`); }
};

const casa = leer('apps-web/veta-wallet/index.html');
const css = leer('sitio-ordenglobal/assets/portada.css');
const portada = leer('sitio-ordenglobal/index.html');
const ingles = leer('sitio-ordenglobal/en/index.html');

console.log('\nLos archivos que se comparten son EL MISMO archivo\n');
for (const [aca, alla] of [
  ['sitio-ordenglobal/assets/galaxia.js', 'apps-web/veta-wallet/galaxia.js'],
  ['sitio-ordenglobal/assets/fondo.jpg', 'apps-web/veta-wallet/assets/fondo.jpg'],
]) {
  ok(huella(aca) === huella(alla), `${aca.split('/').pop()} es el de la billetera`,
     'copialo otra vez: cp ' + alla + ' ' + aca);
}

console.log('\nLa paleta sale de la billetera, no de aquí\n');
// Los tokens que las dos casas comparten. Se lee el valor de allá y se exige
// aquí: si en la billetera cambia el oro, esta prueba se pone roja hasta que
// cambie también en la portada.
const raiz = casa.slice(casa.indexOf(':root{'), casa.indexOf(':root{') + 1400);
for (const nombre of ['--pozo', '--panel', '--linea', '--linea2', '--oro', '--oroLt',
                      '--oroHi', '--crema', '--bruma', '--humo', '--jade', '--r', '--r2']) {
  const m = raiz.match(new RegExp(`${nombre}:([^;}]+)`));
  ok(!!m && css.includes(`${nombre}:${m[1]}`), `${nombre} vale lo mismo en las dos`,
     m ? `la billetera dice ${nombre}:${m[1]}` : 'no está en la billetera');
}

console.log('\nLos componentes son los de la casa\n');
ok(/\.btn\{[^}]*border-radius:100px/.test(css.replace(/\s+/g, ' ')),
   'los botones son píldoras de 100 px, como en la billetera');
ok(css.includes('linear-gradient(120deg,var(--oroLt),var(--oro) 52%,var(--oroLt))'),
   'el botón principal es el mismo metal');
ok(css.includes("url('/assets/fondo.jpg')") && css.includes('background-attachment:fixed'),
   'el fondo es la fotografía de marca, fija — no un color plano');
ok((css.match(/backdrop-filter:blur/g) || []).length >= 6,
   'las tarjetas son de vidrio, no paneles opacos');
ok(css.includes("--serif:'Cinzel'") && css.includes("--sans:'Archivo'")
   && css.includes("--mono:'JetBrains Mono'"),
   'la misma pila de letras: Cinzel, Archivo, JetBrains Mono');

console.log('\nLa entrada lleva la veta y el cielo, en los dos idiomas\n');
for (const [nombre, h] of [['portada', portada], ['/en', ingles]]) {
  ok(h.includes('class="veta-svg"'), `${nombre}: la veta cruza la entrada`);
  ok(h.includes('id="vetaGrad"'), `${nombre}: la veta lleva su degradado de oro`);
  ok(h.includes('<canvas id="galaxia">'), `${nombre}: el cielo de la puerta está`);
  ok(h.includes('/assets/galaxia.js'), `${nombre}: y se carga el módulo que lo dibuja`);
  ok(h.includes('<b class="marca">'), `${nombre}: la marca se compone como en la casa`);
  // La veta es de la PORTADA. Si algún día se cuela una segunda, es que
  // alguien la puso también en otra sección — y ahí deja de ser una entrada.
  ok((h.match(/veta-svg/g) || []).length === 1, `${nombre}: y solo hay UNA veta`);
}

console.log(fallos ? `\n${fallos} fallo(s)\n` : '\nTodo en verde: la misma casa\n');
process.exit(fallos ? 1 : 0);
