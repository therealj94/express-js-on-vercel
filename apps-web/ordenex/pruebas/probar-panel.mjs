/* El panel de operación de Ordenex, leído como TEXTO.
 *
 *   node apps-web/ordenex/pruebas/probar-panel.mjs
 *
 * ══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════
 *
 * `GET /admin/estado` devolvía el circuito de entrada entero —el vigía, el
 * barrido, las entregas, el gas por red, la comisión de la casa y la deuda con
 * Orden Global— y el panel no pintaba NADA de eso. Un JSON que solo se lee con
 * curl no lo lee nadie, y esas tres piezas se rompen en silencio: el síntoma
 * es alguien que depositó y no recibió nada.
 *
 * Lo que se comprueba acá es lo que un navegador no puede: que el panel LEA
 * cada campo que el API manda. Si mañana alguien añade uno al API y se olvida
 * del panel, o al revés —renombra uno en el API y el panel se queda pintando
 * «—» para siempre—, esto se pone rojo.
 *
 * Los dos lados se leen como archivo, sin ejecutar nada. Es lo mismo que hace
 * probar-diccionarios.mjs y por el mismo motivo: desde el objeto ya montado no
 * se ve lo que falta.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..', '..');
const PANEL = readFileSync(join(AQUI, '..', 'admin.html'), 'utf8');

/* SIN COMENTARIOS. Casi todo lo de acá abajo mira si algo SE HACE, y la
   palabra suele aparecer también en el comentario que explica por qué se hace
   —o por qué NO se hace—. La primera versión de esta prueba se puso roja
   diciendo que el panel «toca localStorage» por una línea que dice, palabra
   por palabra, que no lo toca. */
const CODIGO = PANEL
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/[^\n]*/gm, '');
const API = readFileSync(join(RAIZ, 'infra', 'ordenex-api', 'controllers', 'adminController.js'), 'utf8');

let fallos = 0;
const ok = (q, c, x = '') => {
  console.log(`  ${c ? 'ok   ' : 'FALLA'} ${q}${x ? '\n           ' + x : ''}`);
  if (!c) fallos++;
};
const decir = (q) => console.log(`\n· ${q}`);

decir('el panel lee lo que el API manda');
// Los bloques que el API añadió con el circuito de entrada. Cada uno se pinta
// en su sección; si falta, esa sección queda vacía y nadie se entera.
for (const campo of ['entrada', 'gasPorRed', 'casa', 'caliente', 'configuracion']) {
  ok(`pinta d.${campo}`, new RegExp(`d\\.${campo}`).test(PANEL));
  ok(`  y el API lo manda`, new RegExp(`${campo}[,:]`).test(API));
}
for (const pieza of ['vigia', 'barrido', 'compras']) {
  ok(`lee entrada.${pieza}`, new RegExp(`e\\.${pieza}`).test(PANEL));
}

decir('la pregunta que se hace quien abre el panel');
// «¿Esto está encendido?». Un cero de entregas no distingue «apagado» de
// «encendido y sin nada que hacer», y esa confusión cuesta una tarde.
ok('el panel mira si cada pieza está encendida', /\.encendido/.test(PANEL));
for (const f of ['lib/vigiaDepositosExternos.js', 'lib/barridoExterno.js', 'lib/compra.js']) {
  const src = readFileSync(join(RAIZ, 'infra', 'ordenex-api', f), 'utf8');
  ok(`  ${f} lo dice en su resumen`, /encendido:/.test(src));
}
ok('y nombra las variables que hay que poner', /BARRIDO=1/.test(PANEL) && /COMPRAS=1/.test(PANEL));

decir('lo que necesita ojos va primero');
// Esta página es larga y quien la abre se forma su opinión con lo primero que
// lee. Una entrega en duda enterrada bajo los conteos no la ve nadie.
const iOjos = PANEL.indexOf('id="ojosCaja"');
const iConteos = PANEL.indexOf('id="conteos"');
ok('la caja de «esto necesita que alguien mire» existe', iOjos > 0);
ok('y va ANTES de los conteos', iOjos > 0 && iOjos < iConteos, `ojos: ${iOjos} · conteos: ${iConteos}`);
ok('lee las dos fuentes: entregas en duda y barridos atascados',
  /c\.quierenOjos/.test(PANEL) && /b\.quierenOjos/.test(PANEL));
// Y se esconde cuando no hay nada: una caja roja vacía en cada carga enseña a
// ignorar la caja roja.
ok('y se esconde si no hay nada que mirar', /ojosCaja'\)\.classList\.toggle\('oculto'/.test(PANEL));

decir('un solo formato de número');
/* El panel mezclaba dos: deWei escribe 1,180.42 (coma de miles, punto
   decimal) y `num` usaba toLocaleString('es'), que es el de España — punto de
   miles y coma decimal: 3029,00. El mismo número escrito de dos formas en dos
   tablas contiguas es un panel del que uno duda. Honduras usa el primero. */
ok('usa es-HN y no «es» a secas', /const LOCAL = 'es-HN'/.test(PANEL));
// Incluidas las FECHAS: `Date.toLocaleString('es')` da el formato de España
// igual que los números, y quedaba una en la tabla de lo que necesita ojos.
ok('y no queda ningún toLocale* con «es» pelado, ni en números ni en fechas',
  !/toLocale[A-Za-z]*\('es'[),]/.test(CODIGO));

decir('las dos mitades de la tabla de depósitos se juntan');
/* Las marcas del vigía vienen con clave de TEXTO (`dep:polygon`) y los
   depósitos con número de red (137). Sin la tabla de traducción la tabla sale
   partida en cuatro filas: dos con los conteos y sin bloque, dos con el
   bloque y sin conteos. Se vio pintándola, no leyéndola. */
ok('el panel traduce la clave de la marca a número de red', /POR_CLAVE/.test(PANEL));
for (const clave of ['polygon', 'bsc', 'ethereum']) {
  ok(`  conoce «${clave}»`, new RegExp(`${clave}: \\d+`).test(PANEL));
}
const vigia = readFileSync(join(RAIZ, 'infra', 'ordenex-api', 'lib', 'redesUsdt.js'), 'utf8');
for (const clave of ['polygon', 'bsc', 'ethereum']) {
  ok(`  y es una clave que el API usa de verdad`, new RegExp(`clave: '${clave}'`).test(vigia));
}

decir('no sondea');
/* /admin lleva un freno de cinco intentos por cuarto de hora —donde está la
   llave maestra el freno es duro a propósito— y un reloj que refrescara solo
   se comería el cupo en tres minutos. */
ok('no hay setInterval ni setTimeout que repita',
  !/setInterval\(/.test(CODIGO), 'el panel se refresca a mano');

decir('la clave no se guarda en ningún lado');
ok('no toca localStorage', !/localStorage/.test(CODIGO));
ok('ni sessionStorage', !/sessionStorage/.test(CODIGO));
ok('ni la mete en la URL', !/location\.(search|hash)\s*=/.test(CODIGO));

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
