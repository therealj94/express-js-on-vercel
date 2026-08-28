/* La música se calla cuando hay voz, y vuelve sola.
 *
 * Dos piezas que se prueban juntas porque solas no dicen nada:
 *   1. musica.js  — el silencio SOSTENIDO (callar/devolver), que no es el
 *      agache de siempre: dura hasta que se lo devuelvan, no un tiempo fijo.
 *   2. app.js     — que la conversación lo pida y lo devuelva, y que lo haga
 *      desde los repintados, que son los que corren en cada cambio.
 *
 * Lo que vino a arreglar: la pista de fondo se apagaba POR PANTALLA, y la
 * burbuja se abre encima de la misma pantalla. La vista no cambiaba, así que
 * la música seguía sonando mientras AU-RA hablaba — y el micrófono abierto
 * la oía y se la mandaba a transcribir.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const musica = readFileSync(new URL('../musica.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

let mal = 0;
const prueba = async (nombre, fn) => {
  try { await fn(); console.log('  ok  ' + nombre); }
  catch (e) { mal++; console.log('  MAL ' + nombre + '\n      ' + e.message); }
};

console.log('\nmusica.js — el silencio sostenido');

/* Se corre musica.js de verdad, con un navegador de mentira: así se prueba
   el comportamiento y no la forma del texto. */
function cargarMusica() {
  const rampas = [];
  const nodo = () => ({
    connect() {}, gain: {
      value: 0.3,
      cancelScheduledValues() {}, setValueAtTime() {},
      linearRampToValueAtTime(a) { rampas.push(a); },
    },
    threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 },
    attack: { value: 0 }, release: { value: 0 },
  });
  const ctx = {
    currentTime: 0, state: 'running', destination: {},
    resume: async () => {}, createGain: nodo, createDynamicsCompressor: nodo,
    createMediaElementSource: nodo,
  };
  /* Un elemento que contesta a todo: el navegador de mentira no tiene por
     qué crecer cada vez que musica.js toca un método nuevo. */
  const el = new Proxy({
    volume: 1, currentTime: 0, loop: true, preload: '', src: '',
    play: async () => {}, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  }, { get: (o, k) => (k in o ? o[k] : () => null) });

  const g = {
    AudioContext: function () { return ctx; },
    performance: { now: () => 0 },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      getElementById: () => el, querySelector: () => el,
      createElement: () => el, addEventListener() {},
      body: { appendChild() {} },
    },
    setTimeout: () => 0, clearTimeout() {}, console,
    addEventListener() {}, removeEventListener() {},
  };
  g.window = g;
  g.self = g;
  new Function('window', 'document', 'localStorage', 'AudioContext',
    'performance', 'setTimeout', 'clearTimeout', 'console', 'self',
    'addEventListener', 'removeEventListener', 'navigator',
    musica)(g, g.document, g.localStorage, g.AudioContext, g.performance,
      g.setTimeout, g.clearTimeout, console, g,
      g.addEventListener, g.removeEventListener, { userAgent: 'prueba' });
  return { M: g.MUSICA, rampas };
}

await prueba('la API expone callar, devolver y callada', () => {
  const { M } = cargarMusica();
  for (const n of ['callar', 'devolver', 'callada']) {
    assert.equal(typeof M[n], 'function', 'falta MUSICA.' + n);
  }
});

await prueba('callar baja a cero y devolver la trae de vuelta', async () => {
  const { M, rampas } = cargarMusica();
  await M.encender(false);
  rampas.length = 0;
  M.callar('aura');
  assert.ok(rampas.includes(0.0001) || rampas.includes(0),
    'callar tenía que mandar el volumen a cero, mandó: ' + rampas.join(','));
  rampas.length = 0;
  M.devolver('aura');
  assert.ok(rampas.some(v => v > 0.01),
    'devolver tenía que subirla, mandó: ' + rampas.join(','));
});

await prueba('mientras está callada, NADA la sube', async () => {
  const { M, rampas } = cargarMusica();
  await M.encender(false);
  M.callar('aura');
  rampas.length = 0;
  /* Los tres caminos que suben el volumen. Ninguno sabe de la conversación:
     por eso el portero está en rampa() y no en cada uno. */
  M.crecer(1.55, 2.2);
  M.agachar(200);
  await M.encender(false);
  assert.ok(rampas.length, 'no se movió ninguna rampa: la prueba pasaba en vacío');
  assert.ok(rampas.every(v => v <= 0.0001),
    'algo la subió estando callada: ' + rampas.join(','));
});

await prueba('dos pedidos, una devolución: sigue callada', async () => {
  const { M, rampas } = cargarMusica();
  await M.encender(false);
  M.callar('aura');
  M.callar('pantalla-voz');
  M.devolver('aura');
  assert.equal(M.callada(), true,
    'quedó una sola devolución pendiente y ya se destapó');
  rampas.length = 0;
  M.crecer();
  assert.ok(rampas.length, 'no se movió ninguna rampa: la prueba pasaba en vacío');
  assert.ok(rampas.every(v => v <= 0.0001), 'subió con un pedido en pie');
  M.devolver('pantalla-voz');
  assert.equal(M.callada(), false, 'devueltos los dos y sigue callada');
});

await prueba('el mismo nombre dos veces no deja la música muda para siempre', async () => {
  const { M } = cargarMusica();
  await M.encender(false);
  M.callar('aura');
  M.callar('aura');     // la burbuja abre, y adentro empieza a hablar
  M.devolver('aura');   // una sola devolución
  assert.equal(M.callada(), false,
    'se llevó por cuenta y no por nombre: quedó muda con nadie escuchando');
});

console.log('\napp.js — que la conversación lo pida');

await prueba('auraMusicaAlDia existe y pide el silencio con nombre', () => {
  assert.ok(/function auraMusicaAlDia\(\)/.test(app), 'no está auraMusicaAlDia');
  assert.ok(/MUSICA\?\.callar\('aura'\)/.test(app), 'no pide el silencio');
  assert.ok(/MUSICA\?\.devolver\('aura'\)/.test(app), 'no lo devuelve nunca');
});

await prueba('la cuenta incluye escuchar, pensar y hablar', () => {
  const m = app.match(/const auraVozEnCurso = \(\) =>\s*([^;]+);/);
  assert.ok(m, 'no está auraVozEnCurso');
  const cuenta = m[1];
  for (const parte of ['auraAlguienEscucha()', 'auraSonando', 'auraCortarVozBurbuja', 'auraPensando']) {
    assert.ok(cuenta.includes(parte),
      'la cuenta se olvida de ' + parte + ': ' + cuenta.trim());
  }
});

await prueba('los dos repintados lo llaman ANTES de cortar por vista', () => {
  for (const [pintor, corte] of [
    ['pintarAura', 'if (!auraAbierta) return;'],
    ['pintarChat', "if (vistaActual !== 'chat') return;"],
  ]) {
    const i = app.indexOf('function ' + pintor + '()');
    assert.ok(i > 0, 'no está ' + pintor);
    const cuerpo = app.slice(i, i + 1400);
    const llamada = cuerpo.indexOf('auraMusicaAlDia()');
    const salida = cuerpo.indexOf(corte);
    assert.ok(llamada > 0, pintor + ' no llama a auraMusicaAlDia');
    assert.ok(salida > 0, 'cambió el corte de ' + pintor + ', revisá la prueba');
    assert.ok(llamada < salida,
      pintor + ' lo llama DESPUÉS de salir: cerrar nunca devolvería la música');
  }
});

await prueba('habla con la burbuja cerrada y la música igual se calla', () => {
  const i = app.indexOf('async function auraVozDeLaCasa(');
  assert.ok(i > 0, 'no está auraVozDeLaCasa');
  const cuerpo = app.slice(i, app.indexOf('auraOirEnLaBurbuja, 250', i));
  const sueltas = cuerpo
    .split('\n')
    .filter(l => l.includes('auraMusicaAlDia()') && !l.includes('auraAbierta'));
  assert.ok(sueltas.length >= 1,
    'todas las llamadas cuelgan de auraAbierta: el saludo de la entrada, que ' +
    'suena con la burbuja cerrada, seguiría sonando sobre la música');
});

await prueba('no la apaga de verdad: no le mueve el interruptor a nadie', () => {
  const i = app.indexOf('function auraMusicaAlDia()');
  const cuerpo = app.slice(i, i + 500);
  assert.ok(!/MUSICA\?\.apagar|MUSICA\.apagar|musicaAlterna/.test(cuerpo),
    'apagar la saca del sitio de la pista y le mueve el ajuste guardado a ' +
    'quien la quiere puesta; el silencio sostenido no toca ninguna de las dos');
});

console.log(mal ? `\n${mal} mal\n` : '\ntodo bien\n');
process.exit(mal ? 1 : 0);
