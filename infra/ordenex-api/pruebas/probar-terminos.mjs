/* Los terminos y el aviso de riesgo: aceptados antes de la primera orden.
 *
 *   node pruebas/probar-terminos.mjs
 *
 * Con Mongo en memoria, porque la aceptacion se GUARDA y la puerta la LEE:
 * probarlo con un objeto fingido probaria la prueba y no la puerta.
 *
 *  1. Sin aceptar: POST /ordenes y POST /fiat/solicitudes contestan 403
 *     TERMINOS_NO_ACEPTADOS con la version que hace falta y donde leerla.
 *  2. Aceptar una version que no es la vigente no acepta nada (409).
 *  3. Aceptar la vigente abre la puerta, y la deja abierta.
 *  4. Cambiar la version (un texto nuevo) vuelve a cerrarla: un consentimiento
 *     a un texto viejo no cubre el nuevo.
 *  5. La ruta esta MONTADA: routes/ordenes.js y routes/fiat.js llevan el
 *     middleware delante del controller, no solo la pantalla.
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = await import('mongodb-memory-server'));
} catch {
  console.error('Falta mongodb-memory-server: npm install');
  process.exit(1);
}
const { default: mongoose } = await import('mongoose');
const servidor = await MongoMemoryServer.create();
await mongoose.connect(servidor.getUri(), { dbName: 'ordenex_prueba' });

const { Usuario } = (await import('../models/index.js')).default;
const terminos = (await import('../lib/terminos.js')).default;

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (que) => console.log(`\n── ${que} ${'─'.repeat(Math.max(2, 62 - que.length))}`);

function resFingido() {
  const r = { estado: 200, cuerpo: null };
  r.status = (n) => { r.estado = n; return r; };
  r.json = (c) => { r.cuerpo = c; return r; };
  return r;
}
const paso = async (mw, req) => {
  const res = resFingido();
  let siguio = false;
  await mw(req, res, () => { siguio = true; });
  return { res, siguio };
};

const u = await Usuario.create({ gid: 'GEN-PRUE-BA00-1', nombre: 'Prueba' });
const req = { usuario: { id: String(u._id), gid: u.gid }, body: {} };

decir('la version vigente tiene forma de fecha');
{
  comprobar(/^\d{4}-\d{2}-\d{2}$/.test(terminos.TERMINOS_VERSION), 'TERMINOS_VERSION es una fecha ISO', terminos.TERMINOS_VERSION);
  comprobar(/legal\.html#terminos/.test(terminos.TERMINOS_RUTA) && /legal\.html#riesgo/.test(terminos.RIESGO_RUTA),
    'y apunta a donde se leen: legal.html#terminos y #riesgo');
}

decir('sin aceptar, la puerta esta cerrada');
{
  const { res, siguio } = await paso(terminos.exigirTerminos, req);
  comprobar(!siguio && res.estado === 403 && res.cuerpo?.codigo === 'TERMINOS_NO_ACEPTADOS', '403 TERMINOS_NO_ACEPTADOS', JSON.stringify(res.cuerpo));
  comprobar(res.cuerpo?.version === terminos.TERMINOS_VERSION && res.cuerpo?.aceptada === false, 'con la version que hace falta y aceptada:false');
  comprobar(typeof res.cuerpo?.terminos === 'string' && typeof res.cuerpo?.riesgo === 'string', 'y donde leerlos');

  const c = resFingido();
  await terminos.consultar(req, c);
  comprobar(c.estado === 200 && c.cuerpo?.aceptada === false, 'GET /auth/terminos dice que no estan aceptados');
}

decir('aceptar la version equivocada no acepta nada');
{
  const res = resFingido();
  await terminos.aceptar({ ...req, body: { version: '1999-01-01' } }, res);
  comprobar(res.estado === 409 && res.cuerpo?.codigo === 'VERSION_VIEJA', '409 VERSION_VIEJA', JSON.stringify(res.cuerpo));
  const res2 = resFingido();
  await terminos.aceptar({ ...req, body: {} }, res2);
  comprobar(res2.estado === 409, 'sin version tampoco');
  const { siguio } = await paso(terminos.exigirTerminos, req);
  comprobar(!siguio, 'y la puerta sigue cerrada');
  const doc = await Usuario.findById(u._id).lean();
  comprobar(doc.terminosVersion == null && doc.terminosEn == null, 'no se guardo nada en el usuario');
}

decir('aceptar la vigente abre la puerta');
{
  const res = resFingido();
  await terminos.aceptar({ ...req, body: { version: terminos.TERMINOS_VERSION } }, res);
  comprobar(res.estado === 200 && res.cuerpo?.aceptada === true, '200 aceptada:true', JSON.stringify(res.cuerpo));
  const doc = await Usuario.findById(u._id).lean();
  comprobar(doc.terminosVersion === terminos.TERMINOS_VERSION && doc.terminosEn instanceof Date, 'se guardo version y cuando', JSON.stringify(doc));
  const { siguio } = await paso(terminos.exigirTerminos, req);
  comprobar(siguio, 'y ahora la puerta deja pasar');
  const c = resFingido();
  await terminos.consultar(req, c);
  comprobar(c.cuerpo?.aceptada === true, 'GET /auth/terminos lo confirma');
  comprobar(terminos.aceptoVigente(doc) === true && terminos.aceptoVigente({ terminosVersion: '1999-01-01' }) === false && terminos.aceptoVigente(null) === false,
    'aceptoVigente: la vigente si, otra no, nadie no');
}

decir('un texto nuevo vuelve a pedir la aceptacion');
{
  // Se simula un usuario que acepto una version anterior.
  await Usuario.updateOne({ _id: u._id }, { $set: { terminosVersion: '2020-01-01' } });
  const { siguio, res } = await paso(terminos.exigirTerminos, req);
  comprobar(!siguio && res.estado === 403, 'quien acepto la version vieja vuelve a estar afuera');
}

decir('las rutas llevan la puerta puesta');
{
  const ordenes = await readFile(join(RAIZ, 'routes/ordenes.js'), 'utf8');
  const fiat = await readFile(join(RAIZ, 'routes/fiat.js'), 'utf8');
  comprobar(/router\.post\('\/',\s*sesion,\s*exigirTerminos,\s*colocar\)/.test(ordenes), 'POST /ordenes: sesion → exigirTerminos → colocar');
  comprobar(/router\.delete\('\/:id',\s*sesion,\s*cancelar\)/.test(ordenes), 'DELETE /ordenes/:id NO la lleva: cancelar libera dinero');
  comprobar(/router\.post\('\/solicitudes',\s*sesion,\s*exigirTerminos,\s*crearSolicitud\)/.test(fiat), 'POST /fiat/solicitudes: sesion → exigirTerminos → crearSolicitud');
  comprobar(/router\.post\('\/solicitudes\/:id\/cancelar',\s*sesion,\s*cancelar\)/.test(fiat), 'y cancelar una solicitud tampoco la lleva');
  const auth = await readFile(join(RAIZ, 'routes/auth.js'), 'utf8');
  comprobar(/router\.post\('\/terminos',\s*sesion,\s*terminos\.aceptar\)/.test(auth) && /router\.get\('\/terminos',\s*sesion,\s*terminos\.consultar\)/.test(auth),
    'GET y POST /auth/terminos existen y llevan sesion');
}

decir('la puerta falla cerrada si Mongo no contesta');
{
  await mongoose.disconnect();
  await servidor.stop();
  const { res, siguio } = await paso(terminos.exigirTerminos, req);
  comprobar(!siguio && res.estado === 503, 'sin base no se sabe si acepto: 503, no se opera', JSON.stringify(res.cuerpo));
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
