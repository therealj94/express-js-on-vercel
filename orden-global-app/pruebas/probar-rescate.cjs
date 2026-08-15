/* El rescate de la llave del chat, desde la app.
 *
 * El fallo que esto vigila es el que salió en pantalla: reinstalar la app
 * borra el almacén seguro y con él la llave del chat. El correo sigue
 * reclamado por la instalación anterior, el relevo contesta 409, y la persona
 * ve «este chat quedó en tu instalación anterior» con sus conversaciones
 * intactas del otro lado del cristal y sin forma de llegar a ellas.
 *
 * La salida es probar QUIÉN ES: la sesión de la wallet ya lo demuestra. El
 * alta manda ese JWT, el relevo le pregunta al backend de quién es, y al dueño
 * demostrado le devuelve la llave que YA existe — nunca una nueva, porque una
 * nueva mataría al primer dispositivo.
 *
 * Se levanta el relevo REAL y un backend de wallet DE MENTIRA, y se habla con
 * el MISMO cliente que corre en el teléfono (src/og/mensajes.js), con los
 * módulos nativos sustituidos por lo mínimo que necesitan.
 */
const { spawn } = require('node:child_process');
const { mkdtempSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const net = require('node:net');
const http = require('node:http');

const RELEVO = '/home/user/express-js-on-vercel/infra/mensajes/servidor.py';
const CLIENTE = '/home/user/express-js-on-vercel/orden-global-app/src/og/mensajes.js';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const puertoLibre = () => new Promise((ok) => {
  const s = net.createServer();
  s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); });
});

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};

/* El cliente de la app es un módulo ES con imports nativos. Se traduce a algo
   que node pueda correr sustituyendo SOLO las tuberías —el almacén seguro, la
   configuración y el token de la wallet—: lo que se prueba sigue siendo el
   código que va en el teléfono, no una copia escrita para la prueba. */
function cargarCliente(base, token, almacen) {
  let src = readFileSync(CLIENTE, 'utf8');
  src = src
    .replace(/^import .*$/gm, '')
    .replace(/^export (async function|function|const)/gm, '$1');
  const nombres = [...src.matchAll(/^(?:async function|function) (\w+)|^const (\w+) =/gm)]
    .map((m) => m[1] || m[2]);
  const envoltorio = `
    const SecureStore = {
      getItemAsync: async (k) => (k in almacen ? almacen[k] : null),
      setItemAsync: async (k, v) => { almacen[k] = v; },
      deleteItemAsync: async (k) => { delete almacen[k]; },
    };
    const Constants = { expoConfig: { extra: { mensajesApi: base } } };
    const getToken = () => token;
    ${src}
    return { ${[...new Set(nombres)].join(', ')} };
  `;
  // eslint-disable-next-line no-new-func
  return new Function('base', 'token', 'almacen', 'fetch', envoltorio)(base, token, almacen, fetch);
}

(async () => {
  const pRelevo = await puertoLibre();
  const pWallet = await puertoLibre();
  const carpeta = mkdtempSync(join(tmpdir(), 'rescate-'));

  // el backend de la wallet, de mentira: conoce una sola sesión
  const SESIONES = { 'jwt-de-jose': 'info@ordenkapital.com' };
  const wallet = http.createServer((q, r) => {
    const t = (q.headers.authorization || '').replace('Bearer ', '');
    const correo = SESIONES[t];
    const cuerpo = JSON.stringify(correo ? { email: correo } : { message: 'invalid token' });
    r.writeHead(correo ? 200 : 401, { 'Content-Type': 'application/json' });
    r.end(cuerpo);
  });
  await new Promise((ok) => wallet.listen(pWallet, ok));

  const rel = spawn('python3', [RELEVO], {
    env: { ...process.env, MENSAJES_DATOS: join(carpeta, 'datos.json'),
           MENSAJES_PUERTO: String(pRelevo),
           MENSAJES_WALLET_URL: `http://127.0.0.1:${pWallet}`,
           HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' },
    stdio: 'ignore',
  });
  await espera(1400);

  const BASE = `http://127.0.0.1:${pRelevo}`;
  const CUENTA = { email: 'info@ordenkapital.com', name: 'José Enamorado', addr: '0xaaaa' };

  try {
    // ── el primer teléfono se da de alta y se queda con la llave ──
    const tel1 = {};
    const M1 = cargarCliente(BASE, 'jwt-de-jose', tel1);
    await M1.alta(CUENTA);
    const llave1 = tel1['og.llaveChat.info@ordenkapital.com'];
    comprobar(!!llave1, 'el primer teléfono recibe su llave');

    // ── un teléfono SIN sesión: el 409 de siempre, que sigue estando bien ──
    const telSin = {};
    const MSin = cargarCliente(BASE, null, telSin);
    let code = null;
    try { await MSin.alta(CUENTA); } catch (e) { code = e.code; }
    comprobar(code === 409,
      'sin sesión el relevo sigue dando el portazo — eso NO se relaja',
      code === 409 ? '' : `devolvió ${code}`);

    // ── el mismo dueño reinstala: almacén vacío, pero con su sesión ──
    const tel2 = {};
    const M2 = cargarCliente(BASE, 'jwt-de-jose', tel2);
    await M2.alta(CUENTA);
    const llave2 = tel2['og.llaveChat.info@ordenkapital.com'];
    comprobar(!!llave2, 'tras reinstalar, la app vuelve a tener llave');
    comprobar(llave2 === llave1,
      'y es la MISMA — una nueva mataría al primer teléfono',
      llave2 === llave1 ? '' : 'devolvió una llave distinta');

    // ── la sesión de OTRA persona no abre este buzón ──
    const ajeno = {};
    const MAjeno = cargarCliente(BASE, 'jwt-de-otra-persona', ajeno);
    code = null;
    try { await MAjeno.alta(CUENTA); } catch (e) { code = e.code; }
    comprobar(code === 409, 'una sesión que el backend no reconoce no rescata nada');

    // ── y con la llave rescatada se puede usar el chat de verdad ──
    const convos = await M2.conversaciones();
    comprobar(Array.isArray(convos.conversaciones),
      'con la llave rescatada el chat responde, no 401');

    console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
    process.exit(fallos ? 1 : 0);
  } finally {
    rel.kill();
    wallet.close();
  }
})();
