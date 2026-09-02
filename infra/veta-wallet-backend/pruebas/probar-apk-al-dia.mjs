/* ¿LA CARTA Y LA PÁGINA APUNTAN AL MISMO APK?
 *
 *   node infra/veta-wallet-backend/pruebas/probar-apk-al-dia.mjs
 *
 * ══ POR QUÉ EXISTE ════════════════════════════════════════════════════════
 *
 * La dirección del APK y su versión viven en DOS sitios: la carta que se le
 * manda a la gente (`lib/cartaInstalar.js`) y la página con los mismos pasos
 * (`apps-web/veta-wallet/instalar.html`). El comentario de la carta ya avisa
 * de que al compilar hay que cambiar los dos — y un aviso en un comentario es
 * exactamente la clase de cosa que se cumple las primeras veces.
 *
 * Que se desincronicen no da ningún error: da algo peor, que es una carta
 * mandada a cientos de personas con el enlace de la versión anterior, o una
 * página que promete una versión y entrega otra. Nadie se entera hasta que
 * alguien pregunta por qué su app no tiene lo que dice el correo.
 *
 * Esto no arregla la duplicación —para eso habría que generar la página—,
 * pero la hace ruidosa: si los dos no coinciden, se pone rojo antes de que
 * salga ni un correo.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CARTA = join(AQUI, '..', 'lib', 'cartaInstalar.js');
const PAGINA = join(AQUI, '..', '..', '..', 'apps-web', 'veta-wallet', 'instalar.html');

let fallos = 0;
const ok = (q, c, x = '') => {
  console.log(`  ${c ? 'ok   ' : 'FALLA'} ${q}${x ? '\n           ' + x : ''}`);
  if (!c) fallos++;
};

const carta = readFileSync(CARTA, 'utf8');
const pagina = readFileSync(PAGINA, 'utf8');

const apkCarta = carta.match(/export const APK\s*=\s*\n?\s*"([^"]+)"/)?.[1];
const verCarta = carta.match(/export const VERSION\s*=\s*"([^"]+)"/)?.[1];
const apkPagina = pagina.match(/href="(https:\/\/[^"]*\.apk)"/)?.[1];
const verPagina = pagina.match(/versión\s+([0-9.]+)/)?.[1];

ok('la carta tiene una dirección de APK', !!apkCarta, apkCarta || 'no la encontré');
ok('la página tiene una dirección de APK', !!apkPagina, apkPagina || 'no la encontré');
ok('y es LA MISMA', apkCarta === apkPagina,
  apkCarta === apkPagina ? '' : `carta: ${apkCarta}\n           página: ${apkPagina}`);
ok('la versión también coincide', !!verCarta && verCarta === verPagina,
  verCarta === verPagina ? '' : `carta: ${verCarta} · página: ${verPagina}`);

/* Que apunte a un artefacto de EAS y no a un enlace de paso. Un enlace
   temporal en un correo masivo se convierte en cientos de personas que no
   pueden instalar nada y no saben por qué. */
ok('el enlace es un artefacto de EAS, no algo de paso',
  !!apkCarta && apkCarta.startsWith('https://expo.dev/artifacts/eas/'), apkCarta || '');

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
