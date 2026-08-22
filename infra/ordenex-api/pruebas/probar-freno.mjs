/* El freno y las cabeceras de la casa, contra el API de verdad.
 *
 *   node pruebas/probar-freno.mjs
 *
 * POR QUE ESTA PRUEBA EXISTE
 *
 * Hasta hoy ordenex-api no devolvia UNA sola cabecera de seguridad, anunciaba
 * su Express por X-Powered-By, y no tenia limite de peticiones en ninguna
 * ruta: ni en /auth/sso, ni en POST /ordenes —que reserva saldo—, ni en el
 * circuito fiat, ni en /admin. Lo de /admin era lo mas caro: su clave se
 * compara en tiempo constante, que esta bien pensado y no sirve absolutamente
 * de nada si se puede probar una clave por milisegundo hasta acertar. Quien
 * acierte no se lleva una sesion, se lleva la casa.
 *
 * Se levanta el proceso de verdad (`node app.js`) contra un puerto libre y se
 * le habla por HTTP. Nada de armar un express de mentira con los mismos
 * middlewares: eso probaria que sé escribir la prueba, no que el API que se
 * despliega esté frenado.
 *
 * Mongo y la cadena no hacen falta: el API arranca igual cuando no contestan
 * —esa es su regla de arranque— y lo que se mide aqui no las toca.
 *
 * Cada escenario va en SU PROPIO proceso porque el techo general es por IP y
 * por minuto: dos escenarios en el mismo proceso se gastarian el cupo el uno
 * al otro y el fallo pareceria del codigo.
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

let malas = 0;
const decir = (ok, que, extra = '') => {
  if (!ok) malas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`);
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 150)}`);
};
const titulo = (q) => console.log(`\n── ${q} ${'─'.repeat(Math.max(2, 58 - q.length))}`);

/** Levanta el API en un puerto libre y espera a que conteste. */
async function levantar(extra = {}) {
  const puerto = 3000 + Math.floor(Math.random() * 20000);
  const hijo = spawn(process.execPath, ['app.js'], {
    cwd: RAIZ,
    stdio: ['ignore', 'ignore', 'ignore'],
    env: {
      ...process.env,
      PORT: String(puerto),
      CORS_ORIGENES: 'http://ejemplo.local',
      // Sin URI de Mongo: el API arranca igual y estas rutas no la tocan.
      MONGODB_URI: '',
      ...extra,
    },
  });
  const url = `http://127.0.0.1:${puerto}`;
  // Se sondea /tarifas y no /salud: /salud sale a la cadena y a Mongo, y este
  // arranque no tiene ninguna de las dos.
  /* Se distingue «no contesta nadie» de «contesta y da error», porque son dos
     averias distintas y el mensaje decidia mal. Paso de verdad: `/tarifas`
     devolvia 500 por un BigInt sin serializar, y esta funcion lo reportaba como
     «el API no levanto» — mandando a buscar el fallo al arranque cuando estaba
     en la ruta. */
  let ultimo = null;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(url + '/tarifas');
      if (r.ok) return { url, matar: () => hijo.kill('SIGKILL') };
      ultimo = `${r.status} ${await r.text().catch(() => '')}`.slice(0, 120);
    } catch (e) { ultimo = null; }
    await new Promise(res => setTimeout(res, 150));
  }
  hijo.kill('SIGKILL');
  throw new Error(ultimo
    ? `el API levantó pero /tarifas contesta mal: ${ultimo}`
    : 'el API no levantó: nadie contesta en el puerto');
}

console.log('\n════ EL FRENO Y LAS CABECERAS ══════════════════════════════');

// ── 1 · cabeceras, tarifa y la puerta del panel ───────────────────────────
{
  const api = await levantar({ ORDENEX_COMISION_PPM: '2500' });
  try {
    titulo('las cabeceras que no estaban');
    const r = await fetch(api.url + '/tarifas');
    decir(r.headers.get('x-powered-by') === null,
      'ya no anuncia que es Express', String(r.headers.get('x-powered-by')));
    decir(r.headers.get('x-content-type-options') === 'nosniff',
      'nosniff puesto: el navegador no adivina el tipo de una respuesta');
    decir(!!r.headers.get('x-frame-options') || !!r.headers.get('content-security-policy'),
      'y la casa dice quién puede enmarcarla');
    decir(r.headers.get('ratelimit-limit') != null || r.headers.get('ratelimit') != null,
      'el techo de peticiones viaja en la respuesta, para que un cliente honesto pueda respetarlo',
      r.headers.get('ratelimit-limit') || r.headers.get('ratelimit'));

    titulo('la tarifa, por su propia puerta');
    const t = await (await fetch(api.url + '/tarifas')).json();
    decir(t.comisionPpm === 2500 && t.sobre === 'recibido',
      'GET /tarifas dice cuánto cobra la casa y sobre qué', JSON.stringify(t));
    /* Se lee del entorno con las MISMAS reglas del motor, tope de cordura
       incluido: una comisión imposible se ignora, no se sirve. */

    titulo('/admin: el más duro de la casa');
    let ultimo = 0, cuando429 = 0;
    for (let i = 1; i <= 8; i++) {
      const q = await fetch(api.url + '/admin/estado');
      ultimo = q.status;
      if (q.status === 429 && !cuando429) cuando429 = i;
    }
    decir(ultimo === 429, 'probar claves de admin en tanda termina en 429', `último: ${ultimo}`);
    decir(cuando429 > 0 && cuando429 <= 6,
      'y el freno cae a los pocos intentos, no a los cien', `429 en el intento ${cuando429}`);

    titulo('el sondeo de la pantalla NO se cuenta como abuso');
    /* El limitador de las rutas con dinero se monta solo sobre los métodos que
       escriben: la pantalla sondea GET /ordenes cada diez segundos, y un freno
       que contara esos sondeos le cerraría la puerta al cliente honesto antes
       que al abusador. Da igual qué contesten —sin sesión ni base, un 401 o un
       503—: lo que NO puede aparecer entre ellos es un 429. */
    let hubo429 = false, codigos = new Set();
    for (let i = 0; i < 30; i++) {
      const q = await fetch(api.url + '/ordenes');
      codigos.add(q.status);
      if (q.status === 429) hubo429 = true;
    }
    decir(!hubo429, 'treinta sondeos de GET /ordenes no disparan el freno del dinero',
      `códigos vistos: ${[...codigos].join(', ')}`);
  } finally { api.matar(); }
}

// ── 2 · el techo general ──────────────────────────────────────────────────
{
  const api = await levantar();
  try {
    titulo('el techo de todos: 100 por minuto');
    let primero429 = 0;
    for (let i = 1; i <= 130 && !primero429; i++) {
      const q = await fetch(api.url + '/tarifas');
      if (q.status === 429) primero429 = i;
    }
    decir(primero429 > 0, 'un bucle contra una ruta pública acaba frenado', `429 en la petición ${primero429}`);
    decir(primero429 >= 90 && primero429 <= 115,
      'y el techo está donde dice estar: alrededor de 100', `${primero429}`);
  } finally { api.matar(); }
}

// ── 3 · sin la variable, no se inventa una comisión ───────────────────────
{
  const api = await levantar({ ORDENEX_COMISION_PPM: '' });
  try {
    titulo('sin comisión configurada');
    const t = await (await fetch(api.url + '/tarifas')).json();
    decir(t.comisionPpm === 0, 'sin la variable la comisión es CERO, no una inventada', JSON.stringify(t));
  } finally { api.matar(); }
}

// ── 4 · una comisión imposible se ignora ──────────────────────────────────
{
  const api = await levantar({ ORDENEX_COMISION_PPM: '600000' });
  try {
    titulo('una comisión imposible');
    const t = await (await fetch(api.url + '/tarifas')).json();
    // 600.000 ppm es un 60% por lado: un dedazo, no una decisión. El motor lo
    // ignora y esta ruta tiene que decir lo MISMO que el motor cobra.
    decir(t.comisionPpm === 0, 'un 60% por lado no se anuncia: se ignora, como en el motor', JSON.stringify(t));
  } finally { api.matar(); }
}

console.log(`\n${malas === 0 ? 'Todo en verde' : malas + ' comprobación(es) fallaron'}\n`);
process.exit(malas === 0 ? 0 : 1);
