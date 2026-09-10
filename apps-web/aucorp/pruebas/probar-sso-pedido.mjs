/* El SSO de la banca dentro del marco de la wallet: las dos puntas, en el
 * código.
 *
 *   node pruebas/probar-sso-pedido.mjs
 *
 * `sso-pedido` es el circuito por el que una casa enmarcada dentro de Veta
 * Wallet PIDE la llave en vez de viajar a buscarla (ver CASAS_SSO y el
 * listener de 'sso-pedido' en apps-web/veta-wallet/app.js). Ordenex ya lo
 * usaba; la banca de AuCorp mandaba el marco a la wallet —la wallet dentro de
 * la wallet— y quedaba en blanco. Esta prueba lee los dos archivos tal como
 * se despliegan y comprueba que el circuito esté entero:
 *
 *  1. La banca pide en vez de viajar cuando está enmarcada.
 *  2. Sólo atiende la respuesta de las direcciones de la wallet.
 *  3. Reconoce las tres direcciones de la wallet (producción y los dos
 *     tableros de Amplify), como Ordenex.
 *  4. La wallet sigue escuchando el pedido y acuña el token, y sabe dónde
 *     vive la banca de AuCorp (#sso-aucorp y el marco).
 *
 * Es una prueba de texto, no de navegador: no reemplaza a probar-banca.mjs,
 * pero corre en un segundo y sin Chromium, y caza el fallo más común — que
 * una de las dos puntas cambie y la otra no.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const banca = readFileSync(join(AQUI, '..', 'banca', 'app.js'), 'utf8');
const wallet = readFileSync(join(AQUI, '..', '..', 'veta-wallet', 'app.js'), 'utf8');

let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };

console.log('\n── la banca pide, no viaja ──────────────────────────────────');
ok('detecta que está dentro de un marco', banca.includes('window.top !== window.self'));
ok('y en ese caso manda sso-pedido al padre', /parent\.postMessage\(\{ og: 'sso-pedido', app: 'aucorp' \}/.test(banca));
ok('a cada casa madre, nunca a «*»', !/postMessage\([^)]*'\*'\)/.test(banca));
ok('fuera del marco sigue el viaje de siempre a #sso-aucorp', banca.includes("WALLET + '/#sso-aucorp'"));
ok('y si nadie contesta en diez segundos, lo dice', /setTimeout\([\s\S]{0,400}esperandoLlave[\s\S]{0,400}10000\)/.test(banca));

console.log('\n── la puerta está cerrada para los demás ────────────────────');
ok('sólo atiende mensajes de CASAS_MADRE', banca.includes('if (!CASAS_MADRE.includes(ev.origin) || !ev.data) return;'));
ok('canjea el sso-token contra /auth/sso', banca.includes("ev.data.og === 'sso-token'") && banca.includes("pedir('/auth/sso'"));
ok('y entiende el sso-no (sin identidad verificada)', banca.includes("ev.data.og === 'sso-no'") && banca.includes("'sin-gid'"));
const casas = [...new Set(banca.match(/https:\/\/(?:app\.vetawallet\.com|main\.d[0-9a-z]+\.amplifyapp\.com)/g) || [])];
ok('reconoce las tres direcciones de la wallet', casas.length >= 3, casas.join(' '));
const enOrdenex = readFileSync(join(AQUI, '..', '..', 'ordenex', 'app.js'), 'utf8');
const casasOrdenex = [...new Set(enOrdenex.match(/https:\/\/(?:app\.vetawallet\.com|main\.d[0-9a-z]+\.amplifyapp\.com)/g) || [])];
ok('y son las mismas que reconoce Ordenex', casasOrdenex.every((c) => casas.includes(c)), casasOrdenex.filter((c) => !casas.includes(c)).join(' '));

console.log('\n── la wallet, del otro lado del cristal ─────────────────────');
ok('escucha el pedido', wallet.includes("ev.data.og !== 'sso-pedido'"));
ok('acuña el token', wallet.includes('/genesis/sso/token'));
ok('sólo le contesta al origen que tiene enmarcado', wallet.includes('ev.origin !== suyo'));
ok('sabe que #sso-aucorp existe', wallet.includes("'#sso-aucorp'"));
ok('y tiene a AuCorp en su marco', /aucorp: \{ nombre: 'AuCorp', url: \(\) => URL_AUCORP/.test(wallet));
ok('la banca vive bajo /banca de la dirección que la wallet enmarca', /URL_AUCORP = window\.AUC_URL \|\| 'https:\/\/[^']+\/banca'/.test(wallet));

console.log('\n── y el token de paso no se queda en la barra ───────────────');
ok('la banca consume #sso= del hash al arrancar', banca.includes('location.hash.match(/^#sso=(.+)$/)'));
ok('y lo borra de la barra en el acto', banca.includes("history.replaceState(null, '', location.pathname)"));

console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
