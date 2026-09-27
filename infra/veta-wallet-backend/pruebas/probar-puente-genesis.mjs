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
 *      (y Genesis ni se entera); la dirección sale SOLO de la sesión, nunca del
 *      cuerpo; la cuenta y el correo salen de la sesión; la clave de API no
 *      vuelve nunca al cliente; y sin correo comprobado (`correoVerificado`)
 *      no se ata nada, no se piden pases de SSO y no se escribe sobre una
 *      identidad ya verificada.
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

// ── 2. El comportamiento, contra un Genesis de mentira ─────────────────────

const puente = await import('../lib/genesisPuente.js');
const { routerGenesis, normalizarDireccion, CODIGOS_VINCULO, CODIGOS_CORREO, CODIGOS_PUENTE, mismoGid } = puente;

const CLAVE = 'gid_test_solo_para_esta_prueba';
const recibido = [];
const genesis = express();
genesis.use(express.json({ limit: '1mb' }));
genesis.use((req, _res, next) => { recibido.push({ metodo: req.method, ruta: req.path, clave: req.get('x-api-key'), cuerpo: req.body }); next(); });
genesis.get('/api/v1/identidades/por-email/:email', (req, res) => {
  if (req.params.email === 'nadie@prueba.test') return res.status(404).json({ error: 'no' });
  // Un trámite a medias: identidad todavía sin GID.
  if (req.params.email === 'tramite@prueba.test') return res.json({ identidad: { id: 'idn-2', gid: null, estado: 'datos' } });
  res.json({ identidad: {
    id: 'idn-1', gid: 'GID-PRUEBA', estado: 'verificada', estadoPublicado: 'verificada',
    nombreLegal: 'Persona Prueba', fotoCredencial: 'data:image/jpeg;base64,FOTO',
  } });
});
genesis.post('/api/v1/vinculos', (req, res) => res.json({ ok: true, eco: req.body }));
genesis.get('/api/v1/gid/:gid', (_req, res) => res.json({
  apps: [
    { app: 'mytokenpay', direccion: '0x3333333333333333333333333333333333333333' },
    { app: 'veta-wallet', direccion: '0x1111111111111111111111111111111111111111' },
  ],
}));
genesis.post('/api/v1/identidades/:id/foto', (_req, res) => res.json({ ok: true }));
genesis.post('/api/v1/identidades/:id/datos', (_req, res) => res.json({ identidad: { id: 'idn-1' } }));
genesis.post('/api/v1/sso/token', (req, res) => res.json({ token: 'pase-de-mentira', eco: req.body }));
genesis.post('/api/v1/movimientos', (_req, res) => res.json({ ok: true }));
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
// El correo de la sesión de mentira está comprobado salvo que el usuario diga
// `correoOk: false`: así cada prueba elige.
const correoVerificado = (req) => req.usuario.correoOk !== false;
const app = express();
app.use(express.json());
app.use('/genesis', routerGenesis({ exigirSesion, correoVerificado }));
// Un montaje que NO dice nada del correo: tiene que tratarlo como no comprobado.
app.use('/sin-correo/genesis', routerGenesis({ exigirSesion }));
// Como lo monta MyTokenPay: su sesión no prueba el correo (`exigirGidDeSesion`),
// el correo solo está comprobado en la sesión que probó el GID, y el vínculo se
// enciende y se apaga con una bandera.
let vinculoMtp = true;
app.use('/mtp', routerGenesis({
  exigirSesion,
  exigirGidDeSesion: true,
  vinculoActivo: () => vinculoMtp,
  correoVerificado: (req) => Boolean(req.usuario.gid),
}));
const srvApp = app.listen(0, '127.0.0.1');
await new Promise((r) => srvApp.once('listening', r));
const BASE = `http://127.0.0.1:${srvApp.address().port}/genesis`;
const BASE_MTP = `http://127.0.0.1:${srvApp.address().port}/mtp`;

after(() => { srvApp.close(); srvGenesis.close(); });

const VETA = { id: 'cuenta-42', email: 'persona@prueba.test' };
async function pedir(ruta, { usuario = VETA, cuerpo, metodo, base = BASE } = {}) {
  const r = await fetch(base + ruta, {
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

test('sin dirección en la sesión, la del cuerpo NO se usa: 422 VINCULO_DIRECCION_SIN_PRUEBA', async () => {
  // Antes el puente la tomaba del cuerpo (era la vía de MyTokenPay) y cualquiera
  // ataba a su GID la billetera de otro, que Genesis publicaba como «verificada».
  const antes = vinculosRecibidos().length;
  const w = Wallet.createRandom().address;
  // Ni una cualquiera, ni la de OTRO vínculo, ni siquiera la que Genesis conoce
  // del vínculo de Veta de esa identidad (integración con puente-sso: la regla
  // estricta manda; MyTokenPay ata en /api/auth/sso).
  for (const direccion of ['0x' + w.slice(2).toUpperCase(), '0x3333333333333333333333333333333333333333', '0x' + '1'.repeat(40).toUpperCase()]) {
    const r = await pedir('/vincular', { cuerpo: { direccion } });
    assert.equal(r.estado, 422, direccion);
    assert.equal(r.cuerpo.codigo, CODIGOS_VINCULO.DIRECCION_SIN_PRUEBA);
    assert.equal(r.cuerpo.codigo, 'VINCULO_DIRECCION_SIN_PRUEBA');
  }
  assert.equal(vinculosRecibidos().length, antes, 'Genesis ni se enteró');
});

// ── Correo sin comprobar (el caso de MyTokenPay) ───────────────────────────

const SIN_CORREO = { ...VETA, correoOk: false };
const pedidos = (ruta) => recibido.filter((x) => x.ruta === ruta).length;

test('sin correo comprobado no se ata la cuenta, aunque la dirección venga de la sesión', async () => {
  const antes = vinculosRecibidos().length;
  const r = await pedir('/vincular', { usuario: { ...SIN_CORREO, address: Wallet.createRandom().address }, cuerpo: {} });
  assert.equal(r.estado, 403);
  assert.equal(r.cuerpo.codigo, CODIGOS_CORREO.NO_VERIFICADO);
  assert.equal(vinculosRecibidos().length, antes, 'Genesis ni se enteró');
});

test('sin correo comprobado no se pide un pase de SSO a nombre del GID de ese correo', async () => {
  const antes = pedidos('/api/v1/sso/token');
  const r = await pedir('/sso/token', { usuario: SIN_CORREO, cuerpo: {} });
  assert.equal(r.estado, 403);
  assert.equal(r.cuerpo.codigo, 'CORREO_NO_VERIFICADO');
  assert.ok(!r.texto.includes('pase-de-mentira'));
  assert.equal(pedidos('/api/v1/sso/token'), antes);
});

test('con correo comprobado el pase sí se pide, con el GID y la cuenta de la sesión', async () => {
  const r = await pedir('/sso/token', { cuerpo: { gid: 'OTRO', cuenta: 'la-de-otro' } });
  assert.equal(r.estado, 200);
  assert.deepEqual(r.cuerpo.eco, { gid: 'GID-PRUEBA', cuenta: 'cuenta-42' });
});

test('sin correo comprobado no se escribe sobre una identidad ya verificada (foto, datos, trámite)', async () => {
  // La identidad de mentira está verificada: es la de otra persona con ese correo.
  const antes = recibido.filter((x) => x.metodo === 'POST' && x.ruta.startsWith('/api/v1/identidades/')).length;
  for (const [ruta, cuerpo] of [
    ['/foto', { foto: 'x' }], ['/datos', { nombreCompleto: 'X' }], ['/documento', { mrz: 'x' }],
    ['/documento-fotos', { anverso: 'a', reverso: 'b' }], ['/documento/leer', { imagen: 'x' }],
    ['/vivacidad', {}], ['/biometria', { selfie: 'x' }],
  ]) {
    const r = await pedir(ruta, { usuario: SIN_CORREO, cuerpo });
    assert.equal(r.estado, 403, ruta);
    assert.equal(r.cuerpo.codigo, 'CORREO_NO_VERIFICADO', ruta);
  }
  assert.equal(recibido.filter((x) => x.metodo === 'POST' && x.ruta.startsWith('/api/v1/identidades/')).length, antes);
  // Con el correo comprobado, la misma foto sí pasa.
  assert.equal((await pedir('/foto', { cuerpo: { foto: 'x' } })).estado, 200);
});

test('sin correo comprobado no se cargan movimientos al GID de ese correo (y no se dice)', async () => {
  const antes = pedidos('/api/v1/movimientos');
  const r = await pedir('/movimientos', { usuario: SIN_CORREO, cuerpo: { movimientos: [{ monto: 1 }] } });
  assert.equal(r.estado, 200);
  assert.equal(r.cuerpo.ok, true);
  assert.equal(pedidos('/api/v1/movimientos'), antes);
  assert.equal((await pedir('/movimientos', { cuerpo: { movimientos: [] } })).cuerpo.ok, true);
  assert.equal(pedidos('/api/v1/movimientos'), antes + 1);
});

test('si la cuenta sabe su GID y el correo lleva a otro: 403 SESION_GID_AJENO', async () => {
  const otro = { ...VETA, gid: 'GID-DE-OTRA-CUENTA' };
  const s = await pedir('/sso/token', { usuario: otro, cuerpo: {} });
  assert.equal(s.estado, 403);
  assert.equal(s.cuerpo.codigo, CODIGOS_CORREO.GID_AJENO);
  const v = await pedir('/vincular', { usuario: { ...otro, address: Wallet.createRandom().address }, cuerpo: {} });
  assert.equal(v.estado, 403);
  assert.equal(v.cuerpo.codigo, 'SESION_GID_AJENO');
  // Con el GID correcto, pasa.
  assert.equal((await pedir('/sso/token', { usuario: { ...VETA, gid: 'GID-PRUEBA' }, cuerpo: {} })).estado, 200);
});

test('un montaje que no declara `correoVerificado` lo da por NO comprobado', async () => {
  const r = await fetch(BASE.replace('/genesis', '/sin-correo/genesis') + '/sso/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-usuario': JSON.stringify(VETA) },
    body: '{}',
  });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).codigo, 'CORREO_NO_VERIFICADO');
  assert.throws(() => routerGenesis({ exigirSesion, correoVerificado: true }), /correoVerificado/);
});

test('Veta monta el puente declarando `correoVerificado` (detrás de su bandera)', () => {
  const txt = readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.match(txt, /routerGenesis\(\{[\s\S]*?correoVerificado:/);
  assert.match(txt, /GENESIS_PUENTE_EXIGE_CORREO_CONFIRMADO/);
  const sesion = readFileSync(path.join(RAIZ, 'middleware', 'sesionGenesis.js'), 'utf8');
  assert.match(sesion, /correoConfirmado: usuario\.isVerified === true/);
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

// ── 3. Montado como en MyTokenPay (exigirGidDeSesion, vinculoActivo) ──────

const MTP_SIN_GID = { id: 'mtp-7', email: 'persona@prueba.test' }; // alta con contraseña
const MTP_CON_GID = { id: 'mtp-7', email: 'persona@prueba.test', gid: 'gid-prueba' }; // entró con el pase
const ESCRITURAS = ['/api/v1/vinculos', '/api/v1/sso/token', '/api/v1/identidades/idn-1/foto', '/api/v1/identidades/idn-1/datos', '/api/v1/movimientos'];
const escrituras = () => ESCRITURAS.map((ruta) => recibido.filter((x) => x.metodo === 'POST' && x.ruta === ruta).length);

test('exigirGidDeSesion: sin el GID probado no toca una identidad que ya lo tiene', async () => {
  const antes = escrituras();
  const o = { usuario: MTP_SIN_GID, base: BASE_MTP };
  for (const [ruta, cuerpo] of [
    ['/sso/token', {}], ['/foto', { foto: null }], ['/datos', { nombreCompleto: 'x' }],
    ['/documento', { mrz: 'x' }], ['/documento-fotos', { anverso: 'a', reverso: 'b' }],
    ['/documento/leer', { imagen: 'x' }], ['/vivacidad', {}], ['/biometria', { selfie: 'x' }],
  ]) {
    const r = await pedir(ruta, { ...o, cuerpo });
    assert.equal(r.estado, 403, `${ruta}: ${r.texto}`);
    assert.equal(r.cuerpo.codigo, CODIGOS_PUENTE.CUENTA_NO_ATADA, ruta);
  }
  // Atar: con la dirección en la sesión, CUENTA_NO_ATADA; del cuerpo, nunca.
  const v = await pedir('/vincular', { usuario: { ...MTP_SIN_GID, address: '0x1111111111111111111111111111111111111111' }, base: BASE_MTP, cuerpo: {} });
  assert.equal(v.estado, 403, v.texto);
  assert.equal(v.cuerpo.codigo, CODIGOS_PUENTE.CUENTA_NO_ATADA);
  const vb = await pedir('/vincular', { ...o, cuerpo: { direccion: '0x1111111111111111111111111111111111111111' } });
  assert.equal(vb.estado, 422);
  assert.equal(vb.cuerpo.codigo, 'VINCULO_DIRECCION_SIN_PRUEBA');
  assert.equal((await pedir('/gid', o)).estado, 403);
  // Lo que ya respondía algo «vacío» sigue respondiéndolo, sin datos ajenos.
  assert.deepEqual((await pedir('/billetera', o)).cuerpo, { direccion: null, gid: null, codigo: 'CUENTA_NO_ATADA' });
  assert.deepEqual((await pedir('/movimientos', { ...o, cuerpo: { movimientos: [1] } })).cuerpo, { ok: true, omitido: 'sin GID verificado' });
  const e = await pedir('/estado', o);
  assert.equal(e.estado, 200);
  assert.equal(e.cuerpo.identidad.estado, 'verificada');
  assert.equal(e.cuerpo.identidad.cuentaNoAtada, true);
  for (const fuga of ['GID-PRUEBA', 'Persona Prueba', 'FOTO', 'idn-1']) assert.ok(!e.texto.includes(fuga), `/estado filtró ${fuga}`);
  assert.deepEqual(escrituras(), antes, 'Genesis recibió una escritura');
});

test('exigirGidDeSesion: con el GID probado (escrito como sea) sí, y el trámite a medias sigue abierto', async () => {
  const o = { usuario: MTP_CON_GID, base: BASE_MTP };
  const s = await pedir('/sso/token', { ...o, cuerpo: {} });
  assert.equal(s.estado, 200, s.texto);
  assert.deepEqual(recibido.filter((x) => x.ruta === '/api/v1/sso/token').at(-1).cuerpo, { gid: 'GID-PRUEBA', cuenta: 'mtp-7' });
  assert.equal((await pedir('/foto', { ...o, cuerpo: { foto: 'x' } })).estado, 200);
  assert.deepEqual((await pedir('/billetera', o)).cuerpo, { direccion: '0x1111111111111111111111111111111111111111', gid: 'GID-PRUEBA' });
  assert.equal((await pedir('/estado', o)).cuerpo.identidad.gid, 'GID-PRUEBA');
  const v = await pedir('/vincular', { usuario: { ...MTP_CON_GID, address: '0x1111111111111111111111111111111111111111' }, base: BASE_MTP, cuerpo: {} });
  assert.equal(v.estado, 200, v.texto);
  // Probar el GID no da permiso para atar una dirección del cuerpo.
  const w = await pedir('/vincular', { ...o, cuerpo: { direccion: '0x2222222222222222222222222222222222222222' } });
  assert.equal(w.estado, 422);
  assert.equal(w.cuerpo.codigo, 'VINCULO_DIRECCION_SIN_PRUEBA');
  // Otro GID en la sesión no vale por el de esta identidad.
  const otro = await pedir('/sso/token', { usuario: { ...MTP_CON_GID, gid: 'GID-OTRO' }, base: BASE_MTP, cuerpo: {} });
  assert.equal(otro.estado, 403);
  // Una identidad sin GID todavía (trámite a medias) se sigue llevando desde la app...
  const t = { usuario: { id: 'mtp-8', email: 'tramite@prueba.test' }, base: BASE_MTP };
  assert.equal((await pedir('/foto', { ...t, cuerpo: { foto: 'x' } })).estado, 200);
  assert.equal((await pedir('/datos', { ...t, cuerpo: { nombreCompleto: 'x' } })).estado, 200);
  assert.equal((await pedir('/estado', t)).cuerpo.identidad.id, 'idn-2');
  // ...pero atar sigue pidiendo el GID probado.
  const vt = await pedir('/vincular', { usuario: { ...t.usuario, address: '0x1111111111111111111111111111111111111111' }, base: BASE_MTP, cuerpo: {} });
  assert.equal(vt.estado, 403);
  assert.equal(vt.cuerpo.codigo, 'CUENTA_NO_ATADA');
});

test('vinculoActivo: apagado, /vincular contesta 503 VINCULO_APAGADO y Genesis ni se entera', async () => {
  const antes = vinculosRecibidos().length;
  vinculoMtp = false;
  try {
    const r = await pedir('/vincular', { usuario: MTP_CON_GID, base: BASE_MTP, cuerpo: { direccion: '0x1111111111111111111111111111111111111111' } });
    assert.equal(r.estado, 503);
    assert.equal(r.cuerpo.codigo, CODIGOS_PUENTE.VINCULO_APAGADO);
  } finally {
    vinculoMtp = true;
  }
  assert.equal(vinculosRecibidos().length, antes);
  assert.throws(() => routerGenesis({ exigirSesion, vinculoActivo: true }), /vinculoActivo/);
});

test('mismoGid no distingue mayúsculas ni espacios, y vacío nunca coincide', () => {
  assert.equal(mismoGid('GID-PRUEBA', ' gid-prueba '), true);
  assert.equal(mismoGid('GID-PRUEBA', 'GID-OTRO'), false);
  assert.equal(mismoGid(null, null), false);
  assert.equal(mismoGid('', ''), false);
  assert.equal(mismoGid('GID-PRUEBA', undefined), false);
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

// ── 1. Una sola lógica ─────────────────────────────────────────────────────
//
// Van AL FINAL a propósito: una prueba registrada antes del primer `await`
// de nivel superior hacía que `node --test --test-force-exit` (npm run
// probar) terminara al acabarla, y las de comportamiento no corrían nunca.

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
