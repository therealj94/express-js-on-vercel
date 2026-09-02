/* La portada tiene que seguir siendo LA GALAXIA, y no la piel de una hija.
 *
 * ── POR QUE EXISTE ─────────────────────────────────────────────────────────
 *
 * Dos veces se rompió el mismo sitio por el mismo motivo, y las dos las cazó
 * José y no una prueba:
 *
 *   1. La portada del 2-sep nació con fondo plano y tarjetas opacas: no era de
 *      ninguna casa. «rompió patrón que teníamos para nuestra web os».
 *   2. El arreglo se pasó de largo y la vistió del verde de Veta Wallet, que
 *      es de UNA casa y no de la madre. «quitemos esos cuadros verdes, eso
 *      solo es para veta wallet».
 *
 * La regla que sale de las dos: el ecosistema es la galaxia —cielo, oro y las
 * casas como planetas—; cada casa tiene su color y la madre no se pone el de
 * ninguna. Aquí se comprueba, porque recordarlo ya falló dos veces.
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
const nucleo = leer('orden-global-app/src/og/Nucleo.js');
const css = leer('sitio-ordenglobal/assets/portada.css');
const orbes = leer('sitio-ordenglobal/assets/constelacion.js');
const paginas = [['portada', leer('sitio-ordenglobal/index.html')],
                 ['/en', leer('sitio-ordenglobal/en/index.html')]];

console.log('\nEl cielo es EL MISMO archivo que el de la puerta de la billetera\n');
ok(huella('sitio-ordenglobal/assets/galaxia.js')
   === huella('apps-web/veta-wallet/galaxia.js'),
   'galaxia.js no se ha separado de su fuente',
   'copialo otra vez: cp apps-web/veta-wallet/galaxia.js sitio-ordenglobal/assets/');

console.log('\nEl oro y las letras, de la casa madre\n');
const raiz = casa.slice(casa.indexOf(':root{'), casa.indexOf(':root{') + 1400);
for (const nombre of ['--oro', '--oroLt', '--oroHi', '--crema', '--r', '--r2']) {
  const m = raiz.match(new RegExp(`${nombre}:([^;}]+)`));
  ok(!!m && css.includes(`${nombre}:${m[1]}`), `${nombre} vale lo mismo que en la billetera`,
     m ? `la billetera dice ${nombre}:${m[1]}` : 'no está en la billetera');
}
/* Cinzel es una capital lapidaria: sirve para el lockup y para nada más. De
   texto se leía como el serif dorado sobre negro que usa todo el mundo para
   aparentar lujo, y José lo cazó mirando el teléfono. La letra editorial de
   la casa es la de /historia/, así que portada e historia comparten cara. */
const historia = leer('sitio-ordenglobal/historia/index.html');
ok(css.includes("--marca:'Cinzel'"), 'Cinzel se queda SOLO en el lockup');
ok(css.includes("--serif:'Fraunces'") && historia.includes("--serif:'Fraunces'"),
   'la portada y la historia usan la misma cara editorial');
ok(css.includes("--sans:'Manrope'") && historia.includes("--sans:'Manrope'"),
   'y el mismo texto');
ok(!/\.h1[^}]*em\{[^}]*color/.test(css),
   'el titular va de un solo color, sin una palabra pintada aparte');
ok(/\.btn\{[^}]*border-radius:100px/.test(css.replace(/\s+/g, ' ')),
   'los botones siguen siendo píldoras de 100 px');

console.log('\nY NADA del verde de Veta Wallet: ese color es de una casa, no de la madre\n');
for (const verde of ['#021B1C', '#063430', 'rgba(6,40,42', 'rgba(12,54,56', '#2E7477']) {
  ok(!css.includes(verde), `sin ${verde}`,
     'ese verde es de la billetera; la madre viste el espacio');
}

console.log('\nLas casas son planetas, con los colores del mapa de la app\n');
// Los degradados salen de Nucleo.js: si allá se repinta una casa, aquí se
// pone rojo. Es lo que sostiene «se reconoce por sitio y por color».
for (const [id, primera] of [['chat', '#FBE0D4'], ['pay', '#D8F7FF'],
                             ['gid', '#D6EBE2'], ['aucorp', '#E8E0C8']]) {
  ok(nucleo.includes(primera) && orbes.includes(primera),
     `${id} lleva el color que tiene en la app`,
     `Nucleo.js: ${nucleo.includes(primera) ? 'sí' : 'ya no'} · constelacion.js: ${orbes.includes(primera) ? 'sí' : 'no'}`);
}
ok((orbes.match(/\{ id: '/g) || []).length === 7, 'las siete casas están en el sistema');

console.log('\nLo que se quitó, sigue quitado\n');
for (const [nombre, h] of paginas) {
  ok(!/FUNCIONA HOY|EN BETA|Works today|In beta|class="estado"/i.test(h),
     `${nombre}: sin pastillas de estado`,
     'un tablero de madurez no es una portada');
  ok(!/no un dibujo|not a mock-up/i.test(h),
     `${nombre}: sin el pie que se defendía solo`);
  ok(!/billetera\.png/.test(h), `${nombre}: sin la captura de teléfono flotando`);
}

console.log('\nLa entrada y el sistema, en los dos idiomas\n');
for (const [nombre, h] of paginas) {
  ok(h.includes('class="veta-svg"') && h.includes('id="vetaGrad"'),
     `${nombre}: la veta cruza la entrada`);
  ok(h.includes('<canvas id="galaxia">') && h.includes('/assets/galaxia.js'),
     `${nombre}: el cielo de la casa está y se dibuja`);
  ok(h.includes('/assets/constelacion.js') && h.includes('id="constelacion"'),
     `${nombre}: el sistema está`);
  ok((h.match(/class="orbe"/g) || []).length === 7,
     `${nombre}: los siete planetas son enlaces de verdad`);
  ok(/<div class="sol">[\s\S]{0,80}<b>AU-RA<\/b>/.test(h),
     `${nombre}: AU-RA es el sol`);
  ok(h.includes('<b class="marca">'), `${nombre}: la marca se compone como en la casa`);
}

console.log(fallos ? `\n${fallos} fallo(s)\n` : '\nTodo en verde: la galaxia es la casa\n');
process.exit(fallos ? 1 : 0);
