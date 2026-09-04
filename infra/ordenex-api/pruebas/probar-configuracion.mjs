/* El cuadro de configuracion de /admin/estado: dice QUE esta puesto y jamas
 * enseña un valor secreto. Y /limites, la ruta publica de los umbrales.
 *
 *   node pruebas/probar-configuracion.mjs
 *
 * Los secretos de esta prueba son cadenas EVIDENTES (SECRETO-ADM-…): si una
 * aparece en cualquier respuesta serializada, se ve de donde salio. Se
 * comprueba contra el JSON entero y no contra campos concretos, porque la
 * fuga que importa es la que nadie previo.
 */

import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (que) => console.log(`\n── ${que} ${'─'.repeat(Math.max(2, 62 - que.length))}`);

const SECRETOS = {
  ORDENEX_ADM: 'SECRETO-ADM-0123456789abcdefghijklmnopqrstuvwxyz',
  ORDENEX_HOT_KEY: '0x' + 'ab'.repeat(32),
  ORDENEX_ADMIN_KEY: 'SECRETO-ADMIN-KEY-0123456789abcdefghijklmnop',
  ORDENEX_TOKEN: 'SECRETO-TOKEN-0123456789abcdefghijklmnopqrstuv',
  GENESIS_API_KEY: 'SECRETO-GENESIS-KEY',
  MONGODB_URI: 'mongodb+srv://usuario:SECRETO-PASS@cluster.ejemplo/SECRETO-BASE',
  // La frase de las direcciones de deposito y su xpub. Van aqui para que la
  // comprobacion de fugas de abajo —que busca el valor entero Y sus ultimos
  // ocho caracteres en el JSON— las cubra igual que a las demas. Una frase
  // filtrada en una respuesta del panel es todas las direcciones de la casa.
  ORDENEX_SEMILLA_DEPOSITOS: 'SECRETO-FRASE-uno dos tres cuatro cinco seis siete ocho',
  ORDENEX_SEMILLA_XPUB: 'SECRETO-XPUB-0123456789abcdefghijklmnopqrstuvwxyz',
  ORDENEX_GAS_KEY: '0x' + 'ef'.repeat(32),
};

decir('el cuadro, con todo puesto');
{
  Object.assign(process.env, SECRETOS, { CORS_ORIGENES: 'https://www.ordenexchange.link, https://ordenexchange.link', ORDENEX_DESVIO_AVISO_PCT: '7' });
  const { cuadro, SECRETOS: NOMBRES } = (await import('../lib/configuracion.js')).default;
  const c = cuadro();
  const json = JSON.stringify(c);
  for (const [k, v] of Object.entries(SECRETOS)) {
    comprobar(!json.includes(v), `${k}: el valor NO sale en el cuadro`);
    comprobar(!json.includes(v.slice(-8)), `${k}: ni sus ultimos caracteres`);
  }
  comprobar(NOMBRES.every((n) => c[n] && c[n].puesta === true), 'todos los secretos declarados figuran como puestos', JSON.stringify(Object.fromEntries(NOMBRES.map((n) => [n, c[n]?.puesta]))));
  comprobar(c.ORDENEX_ADM.valida === true, 'ORDENEX_ADM larga: valida');
  comprobar(c.ORDENEX_HOT_KEY.valida === true && /^0x[0-9a-fA-F]{40}$/.test(c.ORDENEX_HOT_KEY.direccion || ''),
    'ORDENEX_HOT_KEY con forma de llave: valida, y sale la DIRECCION publica (no la llave)', JSON.stringify(c.ORDENEX_HOT_KEY));
  comprobar(Array.isArray(c.CORS_ORIGENES.valor) && c.CORS_ORIGENES.valor.length === 2, 'CORS_ORIGENES si enseña su valor: no es secreto', JSON.stringify(c.CORS_ORIGENES));
  comprobar(c.ORDENEX_DESVIO_AVISO_PCT.valor === 7 && c.ORDENEX_DESVIO_BLOQUEO_PCT.valor === 25, 'los umbrales salen con su valor vigente', JSON.stringify([c.ORDENEX_DESVIO_AVISO_PCT, c.ORDENEX_DESVIO_BLOQUEO_PCT]));
  comprobar(c.ORDENEX_ADMIN_KEY.nota && c.ORDENEX_ADM.nota, 'cada variable dice para que sirve');
}

decir('el cuadro, con cosas que faltan o estan mal');
{
  process.env.ORDENEX_ADM = 'corta';
  process.env.ORDENEX_HOT_KEY = 'no-es-una-llave';
  delete process.env.GENESIS_API_KEY;
  process.env.MONGODB_URI = '';
  const { cuadro } = (await import('../lib/configuracion.js')).default;
  const c = cuadro();
  comprobar(c.ORDENEX_ADM.puesta === true && c.ORDENEX_ADM.valida === false, 'una ORDENEX_ADM corta esta puesta pero no es valida');
  comprobar(c.ORDENEX_HOT_KEY.puesta === true && c.ORDENEX_HOT_KEY.valida === false && c.ORDENEX_HOT_KEY.direccion === null,
    'una HOT_KEY sin forma de llave: puesta, no valida, sin direccion', JSON.stringify(c.ORDENEX_HOT_KEY));
  comprobar(c.GENESIS_API_KEY.puesta === false, 'GENESIS_API_KEY ausente: no puesta');
  comprobar(c.MONGODB_URI.puesta === false, 'MONGODB_URI vacia cuenta como no puesta');
  comprobar(!JSON.stringify(c).includes('no-es-una-llave') && !JSON.stringify(c).includes('corta'), 'y tampoco se filtran los valores malos');
}

decir('/limites: los umbrales y la version de los terminos, en publico');
{
  const puerto = 3000 + Math.floor(Math.random() * 20000);
  const hijo = spawn(process.execPath, ['app.js'], {
    cwd: RAIZ, stdio: ['ignore', 'ignore', 'ignore'],
    env: { ...process.env, PORT: String(puerto), CORS_ORIGENES: 'http://ejemplo.local', MONGODB_URI: '',
           ORDENEX_DESVIO_AVISO_PCT: '4', ORDENEX_DESVIO_BLOQUEO_PCT: '20' },
  });
  const url = `http://127.0.0.1:${puerto}`;
  let d = null;
  for (let i = 0; i < 100 && !d; i++) {
    try { const r = await fetch(url + '/limites'); if (r.ok) d = await r.json(); } catch {}
    if (!d) await new Promise((r) => setTimeout(r, 150));
  }
  comprobar(d != null, 'GET /limites contesta sin sesion');
  comprobar(d?.desvio?.avisoPct === 4 && d?.desvio?.bloqueoPct === 20, 'con los umbrales del entorno (4 y 20)', JSON.stringify(d?.desvio));
  comprobar(/^\d{4}-\d{2}-\d{2}$/.test(d?.terminos?.version || ''), 'y la version vigente de los terminos', JSON.stringify(d?.terminos));
  comprobar(!JSON.stringify(d || {}).includes('SECRETO'), 'y ni un secreto');
  hijo.kill('SIGKILL');
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
