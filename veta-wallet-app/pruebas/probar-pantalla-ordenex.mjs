/* LA PANTALLA DE ORDENEX EN LA APP, y los huecos que no dan error.
 *
 *   node veta-wallet-app/pruebas/probar-pantalla-ordenex.mjs
 *
 * ══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════
 *
 * Esta app no tiene marco de pruebas para las pantallas: no hay forma barata
 * de montarla y tocarla. Lo que sí se puede hacer —y es donde de verdad se
 * rompe— es comprobar que TODO LO QUE LA PANTALLA NOMBRA EXISTA.
 *
 * Tres cosas fallan en silencio en React Native, y las tres se ven igual que
 * si estuvieran bien:
 *
 *   1. UN ICONO QUE NO EXISTE. `Icon` devuelve un `<Svg/>` vacío y avisa por
 *      consola SOLO en `__DEV__`. En el APK firmado es un hueco mudo. Al
 *      escribir esta pantalla usé tres nombres que no estaban en el set
 *      —pricetag, list, wallet— y nada se habría quejado.
 *
 *   2. UNA CLAVE DE TEXTO QUE FALTA. Sale la clave cruda en pantalla
 *      («onx.abrir») o un hueco, según el idioma. Y falla en UN idioma: el
 *      que no habla quien lo escribió, que es la regla y no la excepción.
 *
 *   3. UNA PANTALLA SIN REGISTRAR. `nav.go('ordenex')` con la pantalla fuera
 *      del mapa de App.js no navega y no lanza: el dedo toca y no pasa nada.
 *
 * Es el mismo tipo de hueco que dejó muerta la compra en la web —`comprar.js`
 * llamaba a `DATOS.post` y `datos.js` no lo exportaba—: cada archivo está
 * bien, y lo que no encaja es el par.
 *
 * Y se barre la APP ENTERA, no solo esta pantalla: los iconos que faltan ya
 * estaban ahí antes de esta pantalla, y una lista que solo mira lo nuevo deja
 * los viejos invisibles para siempre.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf8');

let fallos = 0;
const decir = (ok, que, extra = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`);
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 190)}`);
  if (!ok) fallos++;
};
const titulo = (q) => console.log(`\n── ${q} ${'─'.repeat(Math.max(2, 58 - q.length))}`);

/** Los .js de la app, sin node_modules ni pruebas. */
function fuentes(dir = 'src', salida = []) {
  for (const n of readdirSync(join(RAIZ, dir))) {
    const rel = `${dir}/${n}`;
    if (statSync(join(RAIZ, rel)).isDirectory()) fuentes(rel, salida);
    else if (n.endsWith('.js')) salida.push(rel);
  }
  return salida;
}
const ARCHIVOS = ['App.js', ...fuentes()];

/** Sin comentarios: media pantalla explica en prosa lo que hace. */
const sinComentarios = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');

const PANTALLA = leer('src/screens/Ordenex.js');
const CODIGO = sinComentarios(PANTALLA);

// ── 1 · LOS ICONOS ──────────────────────────────────────────────────────────
titulo('todo icono nombrado existe en el set');
{
  const icons = leer('src/icons.js');
  /* CON Y SIN COMILLAS. Casi todas las claves del set van sin comillas
     (`wallet: [...]`) y solo las que llevan guion las necesitan. La primera
     versión de esta prueba solo leía las entrecomilladas y anunció que la app
     nombraba 29 iconos inexistentes —entre ellos `checkmark`, en nueve
     archivos—. Era mentira entera. Un informe que acusa de 29 defectos falsos
     no se lee: se ignora, y con él los reales. */
  const claveIcono = /^\s*'?([A-Za-z0-9-]+)'?\s*:\s*\[/gm;
  const listadas = [...icons.matchAll(claveIcono)].map((m) => m[1]);
  const hay = new Set(listadas);

  /* Y QUE NINGUNA ESTÉ ESCRITA DOS VECES. Escribir `wallet` otra vez tampoco
     da error: la segunda definición gana en silencio y cambia el icono en
     TODA la app. Lo hice al añadir los de esta pantalla — `wallet` ya existía
     y mi copia lo pisaba— y no lo habría visto nadie. */
  const repes = listadas.filter((n, i) => listadas.indexOf(n) !== i);
  decir(repes.length === 0, 'ningún icono está definido dos veces en el set',
    [...new Set(repes)].join(', '));
  // Los alias del final (`PATHS['x'] = PATHS.y`) cuentan solo si el original
  // existe: `PATHS['time-outline'] = PATHS.time` con `time` sin dibujar deja
  // los DOS invisibles, y esa es justo la trampa.
  for (const m of icons.matchAll(/PATHS\['([^']+)'\]\s*=\s*PATHS(?:\.|\[')([A-Za-z0-9-]+)/g)) {
    if (hay.has(m[2])) hay.add(m[1]);
  }

  const usados = new Map();     // nombre -> archivos
  for (const f of ARCHIVOS) {
    const src = sinComentarios(leer(f));
    for (const m of src.matchAll(/<Icon\s[^>]*name=["']([A-Za-z0-9-]+)["']/g)) {
      (usados.get(m[1]) || usados.set(m[1], new Set()).get(m[1])).add(f);
    }
    // `icon="algo"` de ListRow, Button3D y compañía: la misma tinta invisible.
    for (const m of src.matchAll(/\bicon=["']([A-Za-z0-9-]+)["']/g)) {
      (usados.get(m[1]) || usados.set(m[1], new Set()).get(m[1])).add(f);
    }
  }

  const dePantalla = [...usados].filter(([, fs]) => fs.has('src/screens/Ordenex.js')).map(([n]) => n);
  const faltanAqui = dePantalla.filter((n) => !hay.has(n));
  decir(faltanAqui.length === 0,
    `los ${dePantalla.length} iconos de la pantalla de Ordenex están dibujados`,
    faltanAqui.join(', '));

  /* Y el barrido de toda la app. Va como AVISO y no como fallo: son de antes
     de esta pantalla y arreglarlos es dibujar iconos, no un cambio de una
     línea. Pero se listan, porque un hueco que nadie lista no se arregla
     nunca — y en un APK firmado no hay ni siquiera el aviso de consola. */
  const faltanTodos = [...usados].filter(([n]) => !hay.has(n));
  if (faltanTodos.length) {
    console.log(`  ojo   ${faltanTodos.length} icono(s) que la app nombra y NO existen — se dibujan como un hueco vacío:`);
    for (const [n, fs] of faltanTodos.sort()) {
      console.log(`           ${n.padEnd(22)} ${[...fs].map((x) => x.replace('src/', '')).join(', ')}`);
    }
  } else {
    console.log('  ojo   ninguno más en toda la app');
  }
}

// ── 2 · LOS TEXTOS, EN LOS DOS IDIOMAS ──────────────────────────────────────
titulo('cada texto existe en español Y en inglés');
{
  const i18n = leer('src/i18n.js');
  /* El archivo tiene los dos diccionarios en el mismo módulo. Se parte por la
     clave que abre el inglés y se cuenta en cada mitad: una clave escrita dos
     veces en la MISMA mitad se pisa a sí misma, y una que solo está en una
     mitad falla en el idioma que no habla quien la escribió. */
  /* El corte va por donde ABRE cada diccionario (`  es: {` y `  en: {`), no
     por una frase de dentro. La primera versión buscaba una línea concreta del
     bloque inglés y se equivocó por completo: el texto nuevo se había insertado
     ANTES de esa línea, así que las claves inglesas cayeron del lado español y
     la prueba dijo que faltaban las 25 en inglés y que estaban duplicadas en
     español. Las dos cosas eran mentira, y las dos por el mismo error de corte.
     Una prueba que se equivoca de mitad no mide lo que dice medir. */
  const iEs = i18n.indexOf('\n  es: {');
  const iEn = i18n.indexOf('\n  en: {');
  if (iEs < 0 || iEn < 0 || iEn < iEs) {
    decir(false, 'se encuentran los dos diccionarios en i18n.js',
      `es en ${iEs}, en en ${iEn} — si esto falla, lo de abajo no vale nada`);
  }
  const es = i18n.slice(iEs, iEn);
  const en = i18n.slice(iEn);
  const claves = [...new Set([...CODIGO.matchAll(/\bt\(['"]([\w.]+)['"]\)/g)].map((m) => m[1]))];

  const sinEs = claves.filter((k) => !new RegExp(`'${k.replace('.', '\\.')}':`).test(es));
  const sinEn = claves.filter((k) => !new RegExp(`'${k.replace('.', '\\.')}':`).test(en));
  decir(sinEs.length === 0, `las ${claves.length} claves de la pantalla están en español`, sinEs.join(', '));
  decir(sinEn.length === 0, 'y las mismas están en inglés', sinEn.join(', '));

  // Y la fila del menú, que vive en otro archivo.
  for (const k of ['set.onx', 'set.onxSub']) {
    decir(new RegExp(`'${k.replace('.', '\\.')}':`).test(es) && new RegExp(`'${k.replace('.', '\\.')}':`).test(en),
      `la fila del menú tiene su texto en los dos idiomas (${k})`);
  }
  // Duplicadas dentro de una misma mitad: la segunda gana en silencio.
  const dobles = claves.filter((k) =>
    (es.match(new RegExp(`'${k.replace('.', '\\.')}':`, 'g')) || []).length > 1);
  decir(dobles.length === 0, 'y ninguna está escrita dos veces en el mismo idioma', dobles.join(', '));
}

// ── 3 · LA PANTALLA ESTÁ ENCHUFADA ──────────────────────────────────────────
titulo('la pantalla existe en el mapa y se llega a ella');
{
  const app = sinComentarios(leer('App.js'));
  decir(/import\s+Ordenex\s+from\s+'\.\/src\/screens\/Ordenex'/.test(app), 'App.js la importa');
  decir(/\bordenex:\s*Ordenex\b/.test(app), 'y la registra con la clave `ordenex`');
  const more = sinComentarios(leer('src/screens/More.js'));
  decir(/nav\.go\('ordenex'\)/.test(more), 'y hay una fila del menú que navega ahí');
  /* Que la clave del mapa y la del `nav.go` sean LA MISMA. Si no coinciden, el
     dedo toca y no pasa nada: `nav.go` con una ruta desconocida no lanza. */
  const enMapa = /\bordenex:\s*Ordenex\b/.test(app);
  const enMenu = /nav\.go\('ordenex'\)/.test(more);
  decir(enMapa && enMenu, 'y las dos usan la misma clave — si no, el toque no hace nada');
}

// ── 4 · LO QUE LA PANTALLA LLAMA, EXISTE ────────────────────────────────────
titulo('lo que llama del resto de la app existe');
{
  const gen = leer('src/genesis.js');
  const llamadas = [...new Set([...CODIGO.matchAll(/\bgenesis\.(\w+)\s*\(/g)].map((m) => m[1]))];
  const faltan = llamadas.filter((n) => !new RegExp(`\\b${n}\\s*[:(]`).test(gen));
  decir(faltan.length === 0, `genesis.js tiene los ${llamadas.length} métodos que se le piden`,
    faltan.map((n) => 'genesis.' + n).join(', '));
  decir(llamadas.includes('tokenEcosistema'),
    'y se usa `tokenEcosistema`, que llevaba escrito y sin llamar por nadie');

  const ui = leer('src/ui.js');
  const deUi = (CODIGO.match(/import \{([^}]+)\} from '\.\.\/ui'/) || [, ''])[1]
    .split(',').map((x) => x.trim()).filter(Boolean);
  const uiFaltan = deUi.filter((n) => !new RegExp(`export (function|const) ${n}\\b`).test(ui));
  decir(uiFaltan.length === 0, `ui.js exporta los ${deUi.length} componentes que se importan`, uiFaltan.join(', '));
}

// ── 5 · LO QUE LA PANTALLA PROMETE ──────────────────────────────────────────
titulo('el circuito de entrada es el que dice el texto');
{
  decir(/ordenexchange\.link/.test(PANTALLA), 'apunta a ordenexchange.link');
  decir(/#sso=/.test(CODIGO) && /encodeURIComponent/.test(CODIGO),
    'y entra con el pase en el hash, escapado');
  /* En el HASH y no en la ruta ni en un parámetro: lo que va después de `#` no
     viaja al servidor ni queda en el registro del proxy. Es la misma regla que
     ya cumple la Veta Wallet del navegador. */
  decir(!/\?sso=|\?token=/.test(CODIGO), 'y NO en la parte que viaja al servidor');
  decir(/nav\.go\('kyc'\)/.test(CODIGO),
    'sin identidad verificada manda al KYC, que es lo único que abre esa puerta');
  decir(/\/salud/.test(CODIGO) && /entrega/.test(CODIGO),
    'pregunta si la compra con USDT está abierta antes de que nadie salga de la app');
  /* `=== true` y no truthy: un API viejo que no manda el campo tiene que
     contar como «no sé» y no como «sí». */
  decir(/entrega === true/.test(CODIGO), 'y trata «no sé» distinto de «sí»');
  decir(/sabeEntrega/.test(CODIGO),
    'el aviso de cerrado solo sale si el servidor lo dijo, no por no poder preguntar');
}

// ── 6 · QUE COMPILE ─────────────────────────────────────────────────────────
/* Un error de sintaxis en una pantalla no rompe esa pantalla: rompe el BUILD
   entero, con un «expo export:embed exited with non-zero code: 1» que no dice
   dónde. Comprobarlo cuesta un parseo.

   Si `@babel/parser` no está instalado, se DICE y no se finge: una comprobación
   que se salta en silencio se lee igual que una que pasó, y esa es justo la
   trampa que este archivo existe para no repetir. */
titulo('los archivos tocados compilan');
{
  let parse = null;
  try { ({ parse } = await import('@babel/parser')); } catch { /* sin instalar */ }
  if (!parse) {
    console.log('  ojo   @babel/parser no está instalado: la sintaxis NO se comprobó.');
    console.log('           npm install  en veta-wallet-app, y volver a correr esto.');
  } else {
    for (const f of ['src/screens/Ordenex.js', 'src/i18n.js', 'src/icons.js',
                     'App.js', 'src/screens/More.js']) {
      let e = null;
      try { parse(leer(f), { sourceType: 'module', plugins: ['jsx'] }); }
      catch (x) { e = x; }
      decir(!e, `compila ${f}`, e ? String(e.message).slice(0, 130) : '');
    }
  }
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
