/* EL BANCO DE PRUEBAS DE LA APP · el relevo de verdad, el cliente de verdad.
 *
 * ══ POR QUÉ ESTO ESTÁ EN UN ARCHIVO APARTE ════════════════════════════════
 *
 * Porque la lección más cara de este chat no fue un fallo de código, fue de
 * método: una prueba que corre en un sitio MÁS CAPAZ que el teléfono no prueba
 * nada, y una que llama a las funciones por dentro tampoco. Nos pasó tres
 * veces en el mismo día:
 *
 *   · un almacén seguro falso que aceptaba nombres que el de verdad rechaza,
 *     mientras en el teléfono la llave no se guardaba nunca;
 *   · una prueba en node, que trae `globalThis.crypto`, cubriendo un candado
 *     que en Android no podía generar ni una llave;
 *   · y la prueba del círculo de la web, que manda la solicitud con un POST
 *     directo y acepta llamando la función por JavaScript — justo los dos
 *     sitios donde la puerta de calle estaba rota.
 *
 * Así que el banco tiene una sola regla: TODO lo que la prueba usa tiene que
 * ser lo mismo que usa el teléfono, y lo que se sustituya tiene que ser MÁS
 * estricto que lo real, nunca más permisivo.
 */
const { spawn } = require('node:child_process');
const { mkdtempSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const net = require('node:net');
const http = require('node:http');

const RELEVO = join(__dirname, '..', '..', 'infra', 'mensajes', 'servidor.py');
const CLIENTE = join(__dirname, '..', 'src', 'og', 'mensajes.js');

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const puertoLibre = () => new Promise((ok) => {
  const s = net.createServer();
  s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); });
});

/* ══ EL CANDADO DE VERDAD DENTRO DEL BANCO ════════════════════════════════
 *
 * Sin esto, `cargarCliente` dejaba `CANDADO` sin definir —los imports se
 * quitan— y entonces la app de la prueba no publicaba llave ni cifraba nada.
 * O sea que cualquier comprobación sobre el cifrado salía «no cifró» SIEMPRE,
 * por el banco y no por el código. Otra vez un doble más flojo que lo real,
 * que es el error que ya nos costó un día entero.
 *
 * Dos aparatos distintos necesitan DOS candados distintos, y el módulo guarda
 * su par de llaves en una variable suya. Se consigue importándolo con una
 * consulta distinta en la dirección —node cachea por URL, así que cambia la
 * URL y hay instancia nueva— y vaciando el llavero compartido entre una y
 * otra, para que la segunda no se encuentre las llaves de la primera. Después
 * de la primera llamada cada instancia ya tiene lo suyo en memoria y el
 * llavero compartido deja de importar. */
let ganchosPuestos = false;
function ponerGanchos() {
  if (ganchosPuestos) return;
  ganchosPuestos = true;
  const { registerHooks } = require('node:module');
  globalThis.__llavero = new Map();
  const FALSOS = {
    'expo-secure-store': `
      export async function getItemAsync(k){ return globalThis.__llavero.get(k) ?? null; }
      export async function setItemAsync(k,v){ globalThis.__llavero.set(k,v); }
      export async function deleteItemAsync(k){ globalThis.__llavero.delete(k); }`,
    'expo-crypto': `
      import { randomBytes } from 'node:crypto';
      export function getRandomBytes(n){ return new Uint8Array(randomBytes(n)); }`,
  };
  registerHooks({
    resolve(pedido, ctx, sig) {
      if (FALSOS[pedido]) return { url: 'falso:' + pedido, shortCircuit: true };
      return sig(pedido, ctx);
    },
    load(url, ctx, sig) {
      const nombre = url.startsWith('falso:') ? url.slice(6) : null;
      if (nombre) return { format: 'module', source: FALSOS[nombre], shortCircuit: true };
      return sig(url, ctx);
    },
  });
}

let nCandados = 0;
async function candadoNuevo() {
  ponerGanchos();
  globalThis.__llavero.clear();          // que no herede las llaves del anterior
  const ruta = join(__dirname, '..', 'src', 'og', 'candado.js');
  const C = await import(`file://${ruta}?aparato=${++nCandados}`);
  await C.miLlave();                     // fuerza a que fabrique LAS SUYAS ya
  return C;
}

/* El cliente de la app es un módulo ES con imports nativos. Se traduce a algo
   que node pueda correr sustituyendo SÓLO las tuberías —el almacén seguro, la
   configuración y el token de la wallet—: lo que se prueba sigue siendo el
   código que va en el teléfono, no una copia escrita para la prueba. */
function cargarCliente(base, token, almacen, CANDADO) {
  let src = readFileSync(CLIENTE, 'utf8');
  src = src
    .replace(/^import .*$/gm, '')
    .replace(/^export (async function|function|const)/gm, '$1');
  const nombres = [...src.matchAll(/^(?:async function|function) (\w+)|^const (\w+) =/gm)]
    .map((m) => m[1] || m[2]);
  const envoltorio = `
    /* El almacén falso RECHAZA lo mismo que el de verdad: sólo acepta nombres
       de [A-Za-z0-9._-]. Un doble más permisivo que la pieza real no prueba
       nada; prueba que el doble funciona. */
    const nombreVale = (k) => typeof k === 'string' && /^[\\w.-]+$/.test(k);
    const SecureStore = {
      getItemAsync: async (k) => {
        if (!nombreVale(k)) throw new Error('Invalid key provided to SecureStore');
        return (k in almacen ? almacen[k] : null);
      },
      setItemAsync: async (k, v) => {
        if (!nombreVale(k)) throw new Error('Invalid key provided to SecureStore');
        almacen[k] = v;
      },
      deleteItemAsync: async (k) => {
        if (!nombreVale(k)) throw new Error('Invalid key provided to SecureStore');
        delete almacen[k];
      },
    };
    const Constants = { expoConfig: { extra: { mensajesApi: base } } };
    const getToken = () => token;
    ${src}
    return { ${[...new Set(nombres)].join(', ')} };
  `;
  // eslint-disable-next-line no-new-func
  return new Function('base', 'token', 'almacen', 'fetch', 'CANDADO', envoltorio)(
    base, token, almacen, fetch, CANDADO);
}

/* Levanta el relevo DE VERDAD (el mismo servidor.py que corre en el nodo) y un
   backend de wallet de mentira que sólo sabe decir de quién es cada sesión.
   `sesiones` es {token: correo} y se puede seguir tocando después de arrancar. */
async function levantarRelevo(sesiones) {
  const pRelevo = await puertoLibre();
  const pWallet = await puertoLibre();
  const carpeta = mkdtempSync(join(tmpdir(), 'banco-'));

  const wallet = http.createServer((q, r) => {
    const t = (q.headers.authorization || '').replace('Bearer ', '');
    const correo = sesiones[t];
    const cuerpo = JSON.stringify(correo ? { email: correo } : { message: 'invalid token' });
    r.writeHead(correo ? 200 : 401, { 'Content-Type': 'application/json' });
    r.end(cuerpo);
  });
  await new Promise((ok) => wallet.listen(pWallet, ok));

  const rel = spawn('python3', [RELEVO], {
    env: {
      ...process.env,
      MENSAJES_DATOS: join(carpeta, 'datos.json'),
      MENSAJES_PUERTO: String(pRelevo),
      MENSAJES_WALLET_URL: `http://127.0.0.1:${pWallet}`,
      HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '',
    },
    stdio: 'ignore',
  });
  await espera(1400);

  return {
    base: `http://127.0.0.1:${pRelevo}`,
    datos: join(carpeta, 'datos.json'),
    cerrar: () => { rel.kill(); wallet.close(); },
  };
}

/* El mismo nombre de cajón que arma el cliente. No se copia a mano en cada
   prueba: si un día cambia allá y no aquí, la prueba miraría un cajón que no
   existe y daría verde por vacío. */
const cajon = (c) => 'og.llaveChat.' + c.replace(
  /[^\w.]/g, (ch) => '-' + ch.charCodeAt(0).toString(16).padStart(2, '0'));

function marcador() {
  let fallos = 0;
  const comprobar = (ok, que, detalle = '') => {
    console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
    if (!ok) fallos++;
  };
  return { comprobar, fin: () => fallos };
}

module.exports = { cargarCliente, candadoNuevo, levantarRelevo, cajon, marcador, espera, puertoLibre };
