/* El puente con Genesis ID es UNO (SFSP v0.3 §11, plan tarea 0.6).
 *
 *   node pruebas/probar-puente-genesis.mjs
 *
 * POR QUE ESTA PRUEBA EXISTE
 *
 * Llegó a haber tres puentes —este, el de infra/genesis-proxy y una reescritura
 * en TypeScript en MyTokenPay— y cada uno decía una cosa distinta: rutas que a
 * uno le faltaban, un vínculo que en MyTokenPay nunca mandaba el correo y por
 * eso fallaba siempre, y en los tres la dirección de billetera era opcional.
 * Una copia a mano diverge sola; lo único que la para es una prueba que se
 * pone roja el día que diverge.
 *
 * Así que aquí se comprueban dos cosas:
 *
 *   1. Las copias son IDÉNTICAS byte a byte (Veta y MyTokenPay), y la carpeta
 *      retirada de genesis-proxy solo reexporta, sin lógica propia.
 *   2. El comportamiento, contra un Genesis ID DE MENTIRA levantado aquí mismo
 *      en 127.0.0.1: sin sesión no pasa; sin dirección válida no hay vínculo
 *      (y Genesis ni se entera); la dirección de la sesión manda sobre la del
 *      cuerpo; la cuenta y el correo salen de la sesión; la clave de API no
 *      vuelve nunca al cliente.
 *
 * Ninguna red de verdad, ninguna clave de verdad.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Wallet, getAddress } from 'ethers';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..');
const INFRA = path.join(RAIZ, '..');

const CANONICO = path.join(RAIZ, 'lib', 'genesisPuente.js');
const COPIAS = [path.join(INFRA, 'mytokenpay-api', 'src', 'lib', 'genesisPuente.js')];

// ── 1. Una sola lógica ─────────────────────────────────────────────────────

test('las copias del puente son idénticas byte a byte al canónico', () => {
  const canon = readFileSync(CANONICO);
  for (const copia of COPIAS) {
    const otra = readFileSync(copia);
    assert.ok(canon.equals(otra),
      `${path.relative(INFRA, copia)} DIVERGE de veta-wallet-backend/lib/genesisPuente.js. ` +
      'El canónico se edita en Veta y se copia tal cual: cp infra/veta-wallet-backend/lib/genesisPuente.js ' +
      path.relative(path.join(INFRA, '..'), copia));
  }
});

test('genesis-proxy está retirado: solo reexporta el canónico', () => {
  const txt = readFileSync(path.join(INFRA, 'genesis-proxy', 'genesis.router.js'), 'utf8');
  assert.match(txt, /from '\.\.\/veta-wallet-backend\/lib\/genesisPuente\.js'/);
  assert.doesNotMatch(txt, /Router\(|router\.(get|post)|fetch\(/, 'volvió a tener lógica propia');
});

test('la ruta de MyTokenPay es un adaptador, no otro puente', () => {
  const txt = readFileSync(path.join(INFRA, 'mytokenpay-api', 'src', 'routes', 'genesis.ts'), 'utf8');
  assert.match(txt, /routerGenesis\(/);
  assert.doesNotMatch(txt, /\.(get|post)\(\s*['"]\//, 'MyTokenPay volvió a definir rutas de puente propias');
});

// ── 2. El comportamiento, contra un Genesis de mentira ─────────────────────

const puente = await import('../lib/genesisPuente.js');
const { routerGenesis, normalizarDireccion, CODIGOS_VINCULO } = puente;

const CLAVE = 'gid_test_solo_para_esta_prueba';
const recibido = [];
const genesis = express();
genesis.use(express.json({ limit: '1mb' }));
genesis.use((req, _res, next) => { recibido.push({ metodo: req.method, ruta: req.path, clave: req.get('x-api-key'), cuerpo: req.body }); next(); });
genesis.get('/api/v1/identidades/por-email/:email', (req, res) => {
  if (req.params.email === 'nadie@prueba.test') return res.status(404).json({ error: 'no' });
  res.json({ identidad: { id: 'idn-1', gid: 'GID-PRUEBA', estado: 'verificada' } });
});
genesis.post('/api/v1/vinculos', (req, res) => res.json({ ok: true, eco: req.body }));
genesis.get('/api/v1/gid/:gid', (_req, res) => res.json({
  apps: [{ app: 'mytokenpay', direccion: null }, { app: 'veta-wallet', direccion: '0x1111111111111111111111111111111111111111' }],
}));
genesis.post('/api/v1/identidades/:id/foto', (_req, res) => res.json({ ok: true }));
// `/documento-fotos` y `/documento/leer` NO existen: un Genesis anterior.
const srvGenesis = genesis.listen(0, '127.0.0.1');
await new Promise((r) => srvGenesis.once('listening', r));
process.env.GENESIS_URL = `http://127.0.0.1:${srvGenesis.address().port}/`;
process.env.GENESIS_API_KEY = CLAVE;

// La sesión de mentira: el usuario lo dicen las cabeceras de la prueba.
const exigirSesion = (req, res, next) => {
  if (!req.get('x-usuario')) return res.status(401).json({ error: 'sin sesion' });
  req.usuario = JSON.parse(req.get('x-usuario'));
  next();
};
const app = express();
app.use(express.json());
app.use('/genesis', routerGenesis({ exigirSesion }));
const srvApp = app.listen(0, '127.0.0.1');
await new Promise((r) => srvApp.once('listening', r));
const BASE = `http://127.0.0.1:${srvApp.address().port}/genesis`;

after(() => { srvApp.close(); srvGenesis.close(); });

const VETA = { id: 'cuenta-42', email: 'persona@prueba.test' };
async function pedir(ruta, { usuario = VETA, cuerpo, metodo } = {}) {
  const r = await fetch(BASE + ruta, {
    method: metodo || (cuerpo ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(usuario ? { 'x-usuario': JSON.stringify(usuario) } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { /* la página 404 de express es HTML */ }
  return { estado: r.status, cuerpo: datos, texto };
}
const vinculosRecibidos = () => recibido.filter((x) => x.ruta === '/api/v1/vinculos');

test('sin el middleware de sesión, el puente no arranca', () => {
  assert.throws(() => routerGenesis({}), /middleware de sesión/);
});

test('sin sesión no pasa nada', async () => {
  assert.equal((await pedir('/estado', { usuario: null })).estado, 401);
  assert.equal((await pedir('/vincular', { usuario: null, cuerpo: {} })).estado, 401);
});

test('vincular SIN dirección se rechaza con código claro y Genesis ni se entera', async () => {
  const antes = vinculosRecibidos().length;
  const r = await pedir('/vincular', { cuerpo: {} });
  assert.equal(r.estado, 422);
  assert.equal(r.cuerpo.codigo, CODIGOS_VINCULO.SIN_DIRECCION);
  assert.equal(r.cuerpo.codigo, 'VINCULO_SIN_DIRECCION');
  assert.equal(vinculosRecibidos().length, antes);
});

test('vincular con dirección inválida se rechaza (formato, suma EIP-55, cero)', async () => {
  const buena = Wallet.createRandom().address; // con suma de control
  const cuerpo = buena.slice(2);
  // Cambia de caja UNA letra: la suma de control deja de cuadrar.
  const i = [...cuerpo].findIndex((c) => /[a-fA-F]/.test(c));
  const c = cuerpo[i];
  const rota = '0x' + cuerpo.slice(0, i) + (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()) + cuerpo.slice(i + 1);
  const malas = [
    '0x123', 'hola', buena.slice(2), buena + '00', '0x' + 'g'.repeat(40),
    '0x' + '0'.repeat(40),
  ];
  // Si la dirección rota quedó toda en minúsculas o mayúsculas, sí es válida.
  if (rota.slice(2) !== rota.slice(2).toLowerCase() && rota.slice(2) !== rota.slice(2).toUpperCase()) malas.push(rota);
  const antes = vinculosRecibidos().length;
  for (const direccion of malas) {
    const r = await pedir('/vincular', { usuario: { ...VETA, address: direccion }, cuerpo: {} });
    assert.equal(r.estado, 422, `debió rechazar ${direccion}`);
    assert.equal(r.cuerpo.codigo, 'VINCULO_DIRECCION_INVALIDA');
  }
  assert.equal(vinculosRecibidos().length, antes);
});

test('con la dirección de la sesión: vincula en minúsculas; cuenta y correo salen de la sesión', async () => {
  const w = Wallet.createRandom().address;
  const r = await pedir('/vincular', {
    usuario: { ...VETA, address: w },
    // Lo que manda el cliente no cuenta: ni otra dirección ni otra cuenta.
    cuerpo: { direccion: '0x2222222222222222222222222222222222222222', cuenta: 'la-de-otro', email: 'otro@x.test' },
  });
  assert.equal(r.estado, 200);
  const v = vinculosRecibidos().at(-1);
  assert.equal(v.cuerpo.direccion, w.toLowerCase());
  assert.equal(v.cuerpo.cuenta, 'cuenta-42');
  assert.equal(v.cuerpo.email, 'persona@prueba.test');
  assert.equal(v.cuerpo.identidadId, 'idn-1');
  assert.equal(v.clave, CLAVE);
  assert.ok(!r.texto.includes(CLAVE), 'la clave de API volvió al cliente');
});

test('sin dirección en la sesión (MyTokenPay) la toma del cuerpo, normalizada', async () => {
  const w = Wallet.createRandom().address;
  const r = await pedir('/vincular', { cuerpo: { direccion: '0x' + w.slice(2).toUpperCase() } });
  assert.equal(r.estado, 200);
  assert.equal(vinculosRecibidos().at(-1).cuerpo.direccion, w.toLowerCase());
});

test('normalizarDireccion coincide con ethers en 200 direcciones al azar', () => {
  for (let i = 0; i < 200; i++) {
    const a = Wallet.createRandom().address;
    assert.equal(normalizarDireccion(a), a.toLowerCase());
    assert.equal(normalizarDireccion(a.toLowerCase()), a.toLowerCase());
    assert.equal(getAddress(normalizarDireccion(a)), a);
  }
  assert.equal(normalizarDireccion(null), null);
  assert.equal(normalizarDireccion(12), null);
  assert.equal(normalizarDireccion('  ' + '0x52908400098527886E0F7030069857D2E4169EE7' + ' '), '0x52908400098527886e0f7030069857d2e4169ee7');
  assert.equal(normalizarDireccion('0x52908400098527886E0F7030069857D2E4169Ee7'), null);
});

test('/status es el mismo /estado (venía de genesis-proxy)', async () => {
  const a = await pedir('/estado');
  const b = await pedir('/status');
  assert.equal(a.estado, 200);
  assert.deepEqual(a.cuerpo, b.cuerpo);
});

test('/gid no crea nada: 404 si no hay identidad', async () => {
  const antes = recibido.filter((x) => x.metodo === 'POST' && x.ruta === '/api/v1/identidades').length;
  const r = await pedir('/gid', { usuario: { id: 'x', email: 'nadie@prueba.test' } });
  assert.equal(r.estado, 404);
  assert.equal(recibido.filter((x) => x.metodo === 'POST' && x.ruta === '/api/v1/identidades').length, antes);
  assert.deepEqual((await pedir('/gid')).cuerpo, { estado: 'verificada', gid: 'GID-PRUEBA' });
});

test('un Genesis sin las rutas de fotos no asusta con «no se encontró tu identidad»', async () => {
  const f = await pedir('/documento-fotos', { cuerpo: { anverso: 'a', reverso: 'b' } });
  assert.equal(f.estado, 503);
  assert.equal(f.cuerpo.motivo, 'genesis-sin-fotos');
  const l = await pedir('/documento/leer', { cuerpo: { imagen: 'x' } });
  assert.equal(l.estado, 503);
  assert.equal(l.cuerpo.motivo, 'sin-lector');
});

test('/billetera devuelve la dirección del vínculo de Veta (venía de MyTokenPay)', async () => {
  const r = await pedir('/billetera');
  assert.deepEqual(r.cuerpo, { direccion: '0x1111111111111111111111111111111111111111', gid: 'GID-PRUEBA' });
});

test('no hay ninguna ruta que apruebe', async () => {
  for (const ruta of ['/aprobar', '/verificar', '/decision']) {
    assert.equal((await pedir(ruta, { cuerpo: {} })).estado, 404, ruta);
  }
});

test('sin GENESIS_API_KEY contesta 503 y lo dice', async () => {
  const guardada = process.env.GENESIS_API_KEY;
  process.env.GENESIS_API_KEY = '';
  try {
    const r = await pedir('/foto', { cuerpo: { foto: 'x' } });
    assert.equal(r.estado, 404); // sin clave no se encuentra ni la identidad
    const e = await pedir('/estado');
    assert.equal(e.estado, 503);
    assert.match(e.cuerpo.error, /GENESIS_API_KEY/);
  } finally {
    process.env.GENESIS_API_KEY = guardada;
  }
});
