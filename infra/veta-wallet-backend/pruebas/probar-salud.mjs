/* La ruta de salud: que diga la verdad cuando algo esta roto.
 *
 *   node pruebas/probar-salud.mjs
 *
 * Una ruta de salud que siempre contesta 200 es peor que no tenerla: da
 * confianza falsa y nadie vuelve a mirarla. Asi que esto no comprueba «existe
 * /salud» —eso lo cumple una linea que devuelva {ok:true}— sino las tres cosas
 * que la hacen servir para algo:
 *
 *   1. Que FALLE cuando Mongo no esta. El servidor se levanta a proposito sin
 *      credenciales de base de datos, que es exactamente la averia que esta
 *      ruta existe para cantar.
 *   2. Que el limitador global no la calle. Se agota el cupo de la IP contra
 *      otra ruta y despues se pregunta por la salud: si contestara 429, el
 *      monitor avisaria de una caida que no existe, y una alarma que se
 *      dispara sola deja de mirarse.
 *   3. Que no se cuelgue. Un Mongo que no responde -que es distinto de uno que
 *      rechaza- dejaria la peticion abierta para siempre sin los plazos.
 *
 * Levanta el servidor DE VERDAD, con su babel y su arranque completo, y le
 * habla por HTTP. Probar una copia del handler no probaria el montaje, que es
 * justo donde estaba el error que esto viene a evitar.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const RAIZ = new URL('..', import.meta.url).pathname;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};

const puertoLibre = () => new Promise((res) => {
  const s = createServer();
  s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); });
});

const PUERTO = await puertoLibre();

// Sin MONGO_PASSWORD la conexion no llega a ningun sitio: es la averia que se
// quiere ver cantada. El resto de secretos tampoco se ponen; el arranque avisa
// por consola y sigue, que es lo que hace en produccion.
// `detached` para que el servidor sea su propio grupo de procesos, y poder
// matarlo ENTERO al final. babel-node arranca un nieto que es el que escucha de
// verdad; matando solo al hijo, ese nieto sobrevive, se queda con el puerto y
// se come la maquina. Paso: dos corridas dejaron dos servidores vivos y la
// tercera se quedo sin tiempo por su culpa.
const servidor = spawn('./node_modules/.bin/babel-node', ['app.js'], {
  cwd: RAIZ,
  env: { ...process.env, PORT: String(PUERTO), MONGO_PASSWORD: '', NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
const matarTodo = () => { try { process.kill(-servidor.pid, 'SIGKILL'); } catch {} };
// Tambien si esto se corta por Ctrl-C o por una excepcion: un servidor huerfano
// no puede depender de que la prueba termine bien.
process.on('exit', matarTodo);
process.on('SIGINT', () => { matarTodo(); process.exit(130); });
let salida = '';
servidor.stdout.on('data', (d) => { salida += d; });
servidor.stderr.on('data', (d) => { salida += d; });

const BASE = `http://127.0.0.1:${PUERTO}`;
const pedir = (ruta) => fetch(BASE + ruta, { signal: AbortSignal.timeout(20000) });

// Esperar a que escuche. No se usa un tiempo fijo: en una maquina lenta babel
// tarda mas, y un numero magico convierte la prueba en un sorteo.
let arriba = false;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  try { await pedir('/'); arriba = true; break; } catch { /* todavia no */ }
}
if (!arriba) {
  console.log('  FALLA el servidor no levanto en 60s');
  console.log(salida.split('\n').slice(-15).map((l) => '           ' + l).join('\n'));
  matarTodo();
  process.exit(1);
}

try {
  // ── 1 · con Mongo caido, tiene que cantarlo ────────────────────────────────
  const t0 = Date.now();
  const r = await pedir('/salud');
  const tardo = Date.now() - t0;
  const cuerpo = await r.json();

  comprobar(r.status === 503, 'con Mongo caido contesta 503, no 200',
    `contesto ${r.status} · ${JSON.stringify(cuerpo)}`);
  comprobar(cuerpo.ok === false, 'y el JSON tambien lo dice');
  comprobar(cuerpo.mongo === false, 'senala a Mongo como la pata rota');
  comprobar(typeof cuerpo.cadena === 'boolean', 'informa del estado de la cadena',
    `cadena=${cuerpo.cadena} bloque=${cuerpo.bloque}`);
  comprobar(cuerpo.bloque === null || Number.isInteger(cuerpo.bloque),
    'el bloque es un numero o null, nunca un cero de consuelo');
  comprobar(tardo < 12000, 'no se queda colgada', `tardo ${tardo}ms`);

  // ── 2 · la raiz dice donde esta la de verdad ───────────────────────────────
  // Va ANTES de agotar el cupo: preguntada despues, la raiz contesta 429 y la
  // comprobacion falla por culpa de la prueba, no del codigo. Paso en el primer
  // intento.
  const raiz = await (await pedir('/')).json().catch(() => ({}));
  comprobar(raiz.salud === '/salud', 'la raiz apunta a la ruta de salud',
    JSON.stringify(raiz));

  // ── 3 · el limitador global no puede callarla ──────────────────────────────
  // El cupo general son 100 por minuto y por IP. Se agota contra la raiz.
  let cortadas = 0;
  for (let i = 0; i < 130; i++) {
    const x = await pedir('/');
    if (x.status === 429) cortadas++;
  }
  comprobar(cortadas > 0, 'el limitador global de verdad corta (si no, esto no probaria nada)',
    `${cortadas} de 130 peticiones a / fueron cortadas`);

  const s2 = await pedir('/salud');
  comprobar(s2.status !== 429, 'y aun con el cupo agotado, /salud sigue contestando',
    `contesto ${s2.status}`);

} finally {
  matarTodo();
}

if (fallos) { console.log(`\n${fallos} comprobacion(es) fallaron`); process.exit(1); }
console.log('\nTodo en verde');
