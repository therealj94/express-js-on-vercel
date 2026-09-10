/* El bloqueo del ecosistema, del lado de la billetera.
 *
 *   node --test pruebas/probar-bloqueo.mjs
 *
 * AQUÍ ES DONDE MÁS IMPORTA. En esta casa está el dinero de la gente y casi
 * todo el padrón: si el bloqueo no llega hasta acá, «bloqueado» querría decir
 * «no puede entrar a la casa de cambio», que no es lo que nadie entiende al
 * apretar ese botón.
 *
 * Se pregunta por el CORREO y no por el GID porque esta casa no guarda el GID:
 * se lo pide a Genesis por correo cada vez que lo necesita. El correo ES el
 * identificador que une las dos bases.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

// Genesis fingido, por el mismo camino que en producción: `fetch`.
const identidades = new Map();   // correo -> { bloqueada }
let caido = false;
let llamadas = 0;
globalThis.fetch = async (url) => {
  llamadas += 1;
  if (caido) throw new Error('red caída');
  const correo = decodeURIComponent(String(url).split('/').pop()).toLowerCase();
  if (!identidades.has(correo)) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ identidad: identidades.get(correo) }) };
};

process.env.GENESIS_API_KEY = 'gid_test_para_la_prueba';
const { puedeOperar, _adentro, RESPUESTA, SIN_SABER } = await import('../lib/bloqueo.js');

const CORREO = 'persona@ejemplo.com';

test('quien no está bloqueado opera', async () => {
  _adentro.olvidar();
  identidades.set(CORREO, { bloqueada: false });
  assert.equal((await puedeOperar(CORREO)).puede, true);
});

test('quien sí lo está, no — y con un mensaje que una persona entiende', async () => {
  _adentro.olvidar();
  identidades.set(CORREO, { bloqueada: true });
  const r = await puedeOperar(CORREO);
  assert.equal(r.puede, false);
  assert.equal(r.respuesta.code, 'acceso-bloqueado');
  // Un 403 pelado manda a alguien a reinstalar la app. Este dice qué pasa y
  // a dónde escribir, igual que el de una dirección sancionada.
  assert.match(r.respuesta.message, /bloqueado/i);
  assert.match(r.respuesta.message, /wa\.me/);
});

test('el correo se compara sin importar mayúsculas ni espacios', async () => {
  _adentro.olvidar();
  identidades.set(CORREO, { bloqueada: true });
  assert.equal((await puedeOperar('  Persona@Ejemplo.COM ')).puede, false);
});

test('un correo que Genesis no conoce se deja pasar: no hay a quién bloquear', async () => {
  // Mucha gente usa la billetera sin haber terminado nunca su verificación.
  _adentro.olvidar();
  identidades.delete('nadie@ejemplo.com');
  assert.equal((await puedeOperar('nadie@ejemplo.com')).puede, true);
});

test('sin correo no se le pregunta nada a nadie', async () => {
  _adentro.olvidar();
  const antes = llamadas;
  assert.equal((await puedeOperar('')).puede, true);
  assert.equal((await puedeOperar(null)).puede, true);
  assert.equal(llamadas, antes, 'ni una llamada de más');
});

test('la memoria corta: tres peticiones son UNA llamada a Genesis', async () => {
  _adentro.olvidar();
  identidades.set(CORREO, { bloqueada: false });
  const antes = llamadas;
  await puedeOperar(CORREO);
  await puedeOperar(CORREO);
  await puedeOperar(CORREO);
  assert.equal(llamadas - antes, 1);
  // Sin esta memoria, cada petición de cada persona sería una llamada a
  // Genesis: la billetera entera dependería de su latencia.
  const luego = await puedeOperar(CORREO, { ahora: Date.now() + _adentro.MEMORIA_MS + 1000 });
  assert.equal(luego.puede, true);
  assert.equal(llamadas - antes, 2, 'y pasado el minuto se vuelve a preguntar');
});

test('sin GENESIS_API_KEY NO se cierra la billetera', async () => {
  // Es un fallo NUESTRO de configuración. Dejar a todo el mundo sin su dinero
  // por una variable que falta sería peor que el problema.
  _adentro.olvidar();
  const antes = process.env.GENESIS_API_KEY;
  delete process.env.GENESIS_API_KEY;
  assert.equal((await puedeOperar(CORREO)).puede, true);
  process.env.GENESIS_API_KEY = antes;
});

test('un tropiezo corto de Genesis NO tumba la billetera', async () => {
  _adentro.olvidar();
  identidades.set(CORREO, { bloqueada: false });
  await puedeOperar(CORREO);
  caido = true;
  const r = await puedeOperar(CORREO, { ahora: Date.now() + 61000 });
  assert.equal(r.puede, true, 'se usa lo último que dijo');
  caido = false;
});

test('pero pasada la ventana ciega se deja de operar', async () => {
  _adentro.olvidar();
  identidades.set(CORREO, { bloqueada: false });
  await puedeOperar(CORREO);
  caido = true;
  const r = await puedeOperar(CORREO, { ahora: Date.now() + _adentro.VENTANA_CIEGA_MS + 1000 });
  assert.equal(r.puede, false);
  assert.equal(r.respuesta.code, SIN_SABER.code, 'y se dice que no se pudo, no que está bloqueado');
  caido = false;
});

test('un bloqueado NO se desbloquea porque Genesis se caiga', async () => {
  _adentro.olvidar();
  identidades.set(CORREO, { bloqueada: true });
  await puedeOperar(CORREO);
  caido = true;
  const r = await puedeOperar(CORREO, { ahora: Date.now() + 61000 });
  assert.equal(r.puede, false, 'lo último que dijo se respeta en los DOS sentidos');
  assert.equal(r.respuesta.code, RESPUESTA.code);
  caido = false;
});

test('de quien nunca se supo, se deja pasar esta vez', async () => {
  _adentro.olvidar();
  caido = true;
  assert.equal((await puedeOperar('desconocida@ejemplo.com')).puede, true);
  caido = false;
});

test('está cableado en la puerta, y la semilla no se toca', async () => {
  const { readFileSync } = await import('node:fs');
  const guardia = readFileSync(new URL('../middleware/verifyToken.js', import.meta.url), 'utf8');
  assert.match(guardia, /puedeOperar\(user\.email\)/, 'verifyToken lo consulta');
  // Va DESPUÉS de las demás comprobaciones: no se le pregunta a Genesis por
  // una sesión que ya es inválida por cualquier otro motivo.
  const iTv = guardia.indexOf('user.tokenVersion');
  const iBloq = guardia.indexOf('puedeOperar(user.email)');
  assert.ok(iTv > 0 && iBloq > iTv, 'después de la revocación local');
  assert.ok(iBloq < guardia.lastIndexOf('next()'), 'y antes de dejar entrar');

  // LO QUE NO SE TOCA. Un bloqueo es de la empresa y de sus servicios, no una
  // confiscación: el material cifrado de la persona sigue donde estaba, y el
  // módulo del bloqueo no tiene forma de tocarlo — no importa nada que sepa
  // descifrar. La comprobación es sobre los IMPORTS, que es lo que de verdad
  // determina lo que un archivo puede hacer.
  const modulo = readFileSync(new URL('../lib/bloqueo.js', import.meta.url), 'utf8');
  const imports = modulo.split('\n').filter((l) => /^\s*(import|const .*= *require)/.test(l));
  assert.equal(imports.length, 0,
    `el bloqueo no importa nada: solo pregunta y contesta. Importa: ${imports.join(' | ')}`);
  assert.equal(/cripto|Users|privateKey|mnemonic/i.test(modulo.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')), false,
    'y en el código, fuera de los comentarios, no aparece nada de llaves ni de la base');
});
