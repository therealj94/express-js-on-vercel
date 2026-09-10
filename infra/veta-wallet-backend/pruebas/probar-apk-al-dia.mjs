/* ¿TODOS LOS SITIOS APUNTAN AL MISMO APK?
 *
 *   node infra/veta-wallet-backend/pruebas/probar-apk-al-dia.mjs
 *
 * ══ POR QUÉ EXISTE, Y POR QUÉ ESTABA MAL ══════════════════════════════════
 *
 * La dirección del APK vive en cuatro sitios y solo dos de ellos pueden leer
 * un módulo de JavaScript. La versión anterior de esta prueba comparaba la
 * PRIMERA CARTA con la página — y ese es justo el par que no importaba:
 *
 *   · la primera carta no la manda nadie (ningún archivo la llama);
 *   · y el que SÍ manda —`infra/correo-ordenglobal/instalar-android/enviar.py`,
 *     el que ya le escribió a 409 personas— esta prueba ni sabía que existía.
 *
 * Así que llevaba en rojo señalando una carta muerta mientras el archivo que
 * de verdad manda correos apuntaba a un tercer artefacto distinto.
 *
 * Ahora el enlace se escribe en UN sitio, `lib/apk.js`, las dos cartas lo
 * importan, y esta prueba comprueba que los dos que no pueden importarlo —la
 * página y el guion de Python— digan lo mismo.
 *
 * Que se desincronicen no da ningún error. Da algo peor: cientos de personas
 * con el enlace de una versión vieja, o una página que promete una cosa y
 * entrega otra, y nadie se entera hasta que alguien pregunta por qué su app
 * no tiene lo que decía el correo.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..', '..');
const FUENTE = join(AQUI, '..', 'lib', 'apk.js');
const CARTA1 = join(AQUI, '..', 'lib', 'cartaInstalar.js');
const CARTA2 = join(AQUI, '..', 'lib', 'cartaSegundaVuelta.js');
const PAGINA = join(RAIZ, 'apps-web', 'veta-wallet', 'instalar.html');
const ENVIA = join(RAIZ, 'infra', 'correo-ordenglobal', 'instalar-android', 'enviar.py');

let fallos = 0;
const ok = (q, c, x = '') => {
  console.log(`  ${c ? 'ok   ' : 'FALLA'} ${q}${x ? '\n           ' + x : ''}`);
  if (!c) fallos++;
};

const leer = (p) => readFileSync(p, 'utf8');
const fuente = leer(FUENTE);
const pagina = leer(PAGINA);
const envia = leer(ENVIA);

// ── 1. la fuente ────────────────────────────────────────────────────────────

const apk = fuente.match(/export const APK\s*=\s*\n?\s*"([^"]+)"/)?.[1];
const version = fuente.match(/export const VERSION\s*=\s*"([^"]+)"/)?.[1];

ok('lib/apk.js tiene la dirección', !!apk, apk || 'no la encontré');
ok('y la versión', !!version, version || 'no la encontré');
/* Que apunte a un artefacto de EAS y no a un enlace de paso. Un enlace
   temporal en un correo masivo son cientos de personas que no pueden
   instalar nada y no saben por qué. */
ok('es un artefacto de EAS, no algo de paso',
  !!apk && apk.startsWith('https://expo.dev/artifacts/eas/'), apk || '');

// ── 2. nadie más escribe una dirección a mano ───────────────────────────────
//
// Es la comprobación que caza el problema DE RAÍZ. Cualquier archivo de estos
// que vuelva a escribir su propio enlace se separa el día de la compilación
// siguiente, y no hay forma de notarlo mirando.

for (const [nombre, texto] of [['lib/cartaInstalar.js', leer(CARTA1)], ['lib/cartaSegundaVuelta.js', leer(CARTA2)]]) {
  const propios = texto.match(/https:\/\/expo\.dev\/artifacts\/eas\/[^"' ]+/g) || [];
  ok(`${nombre} no escribe ninguna dirección: la importa`, propios.length === 0,
    propios.join('\n           '));
  ok(`${nombre} importa de apk.js`, /from "\.\/apk\.js"/.test(texto));
}

// ── 3. los dos que NO pueden importar ───────────────────────────────────────

const apkPagina = pagina.match(/href="(https:\/\/expo\.dev\/artifacts\/eas\/[^"]+\.apk)"/)?.[1];
const verPagina = pagina.match(/versión\s+([0-9.]+)/)?.[1];
ok('la página tiene una dirección de APK', !!apkPagina, apkPagina || 'no la encontré');
ok('la página apunta al mismo APK', apk === apkPagina,
  apk === apkPagina ? '' : `apk.js:  ${apk}\n           página: ${apkPagina}`);
ok('y dice la misma versión', !!verPagina && verPagina === version,
  verPagina === version ? '' : `apk.js: ${version} · página: ${verPagina}`);

/* EL QUE MANDA DE VERDAD. Si este se queda viejo, la consecuencia no es una
   página desactualizada: son correos nuevos con el APK de antes. */
const apkEnvia = envia.match(/ENLACE\s*=\s*\(\s*'([^']+)'\s*\n?\s*'([^']+)'\s*\)/);
const enlaceEnvia = apkEnvia ? apkEnvia[1] + apkEnvia[2] : null;
ok('el guion que manda tiene su enlace', !!enlaceEnvia, enlaceEnvia || 'no lo encontré');
ok('el guion que manda apunta al mismo APK', apk === enlaceEnvia,
  apk === enlaceEnvia ? '' : `apk.js:    ${apk}\n           enviar.py: ${enlaceEnvia}`);

// ── 4. lo que ya salió, anotado ─────────────────────────────────────────────
//
// Sin esto hay que reconstruirlo leyendo `ya-enviados.txt` y el historial de
// git, y eso no lo hace nadie: se acaba mandando dos veces la misma carta, o
// dando por enviada una que no salió.

const enviados = fuente.match(/export const ENVIADOS\s*=\s*\[([\s\S]*?)\n\];/)?.[1] || '';
const cuantos = (enviados.match(/cuando:/g) || []).length;
ok('apk.js anota los envíos que ya salieron', cuantos >= 1, `${cuantos} anotado(s)`);
ok('y cada uno dice a cuánta gente y con qué enlace',
  cuantos === (enviados.match(/personas:/g) || []).length
  && cuantos === (enviados.match(/apk:/g) || []).length);

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
