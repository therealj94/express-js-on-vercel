/* La convivencia de las direcciones guardadas y las derivadas, contra Mongo.
 *
 *   node pruebas/probar-convivencia.mjs
 *
 * Lo que la prueba pura de derivación no puede tocar es justo lo caro: que dos
 * personas nunca compartan índice, que a un usuario que YA tiene dirección no
 * se le cambie jamás, que el barrido no salte en silencio a nadie, y que no se
 * firme desde una llave que no controla la dirección publicada.
 *
 * Corre contra mongodb-memory-server (devDependencies). Si no está instalado se
 * dice y se sale — sin fingir un verde que no se ganó.
 */

let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = await import('mongodb-memory-server'));
} catch {
  console.log('mongodb-memory-server no esta instalado (falta npm install): esta prueba NO corrio y NO probo nada.');
  process.exit(0);
}

const { HDNodeWallet, Wallet } = await import('ethers');

// El entorno se prepara ANTES de importar los modulos que lo leen.
const FRASE = 'test test test test test test test test test test test junk';
process.env.ORDENEX_SEMILLA_DEPOSITOS = FRASE;
process.env.ORDENEX_SEMILLA_XPUB = HDNodeWallet.fromPhrase(FRASE, '', "m/44'/60'/0'/0").neuter().extendedKey;
process.env.ORDENEX_ADM = 'una-clave-de-pruebas-suficientemente-larga-1234';

const { default: mongoose } = await import('mongoose');
const servidor = await MongoMemoryServer.create();
await mongoose.connect(servidor.getUri(), { dbName: 'ordenex_prueba' });

const M = (await import('../models/index.js')).default;
const { Usuario, Contador } = M;
const dep = (await import('../lib/deposito.js')).default;
const der = (await import('../lib/derivacion.js')).default;
const { cifrar } = (await import('../lib/cripto.js')).default;

await Usuario.syncIndexes();

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (que) => console.log(`\n── ${que} ${'─'.repeat(Math.max(2, 62 - que.length))}`);

let n = 0;
const nuevoUsuario = (extra = {}) => Usuario.create({ gid: `gid-${++n}-${Date.now()}`, ...extra });

decir('una dirección nueva nace derivada, sin guardar ninguna llave');
{
  const u = await nuevoUsuario();
  const r = await dep.asegurarDireccion(u);
  const leido = await Usuario.findById(u._id).lean();
  comprobar(r.origen === 'derivada', 'el origen queda anotado como derivada', r.origen);
  comprobar(r.direccion === der.direccionDe(leido.indiceDeposito),
    'y la dirección es exactamente la que deriva su índice');
  comprobar(leido.llaveDepositoCifrada === null,
    'EN LA BASE NO QUEDA NINGUNA LLAVE: es todo el punto del cambio');
  comprobar(leido.indiceDeposito >= 1, 'el índice empieza en 1, nunca en 0', String(leido.indiceDeposito));
  comprobar(leido.generacionDeposito === 1, 'y queda anotada la generación de la semilla');
}

decir('a quien YA tiene dirección no se le cambia nunca');
{
  // Un usuario de antes: blob cifrado, sin discriminador. Como los de produccion.
  const vieja = Wallet.createRandom();
  const u = await nuevoUsuario({
    direccionDeposito: vieja.address,
    llaveDepositoCifrada: cifrar(vieja.privateKey),
  });
  const r = await dep.asegurarDireccion(u);
  const leido = await Usuario.findById(u._id).lean();
  comprobar(r.direccion === vieja.address, 'devuelve la suya, byte a byte');
  comprobar(leido.direccionDeposito === vieja.address && leido.indiceDeposito === null,
    'y en la base no se movió nada: ni dirección nueva ni índice');
  comprobar(leido.llaveDepositoCifrada !== null,
    'el blob viejo NO se borra: es lo único que recupera un depósito que llegue tarde');
}

decir('el índice es atómico: cincuenta a la vez, cincuenta índices distintos');
{
  const usuarios = await Promise.all(Array.from({ length: 50 }, () => nuevoUsuario()));
  await Promise.all(usuarios.map((u) => dep.asegurarDireccion(u)));
  const leidos = await Usuario.find({ _id: { $in: usuarios.map((u) => u._id) } }).lean();
  const indices = leidos.map((u) => u.indiceDeposito);
  const dirs = leidos.map((u) => u.direccionDeposito);
  comprobar(new Set(indices).size === 50, 'cincuenta índices, ni uno repetido', `distintos=${new Set(indices).size}`);
  comprobar(new Set(dirs).size === 50, 'y cincuenta direcciones distintas');
  comprobar(indices.every((i) => Number.isSafeInteger(i) && i >= 1), 'todos enteros y desde 1');
}

decir('la carrera sobre el MISMO usuario: una sola dirección');
{
  const u = await nuevoUsuario();
  const rs = await Promise.all(Array.from({ length: 20 }, () => dep.asegurarDireccion(u)));
  const leido = await Usuario.findById(u._id).lean();
  const dirs = new Set(rs.map((r) => r.direccion));
  comprobar(dirs.size === 1, 'veinte llamadas simultáneas devuelven UNA dirección', `distintas=${dirs.size}`);
  comprobar([...dirs][0] === leido.direccionDeposito, 'y es la que quedó en la base');
  comprobar(leido.direccionDeposito === der.direccionDe(leido.indiceDeposito),
    'la dirección guardada corresponde al índice guardado — no a uno quemado en la carrera');
}

decir('el índice único de Mongo impide dos personas en un buzón');
{
  const a = await nuevoUsuario();
  await dep.asegurarDireccion(a);
  const leidoA = await Usuario.findById(a._id).lean();
  const b = await nuevoUsuario();
  let rebotó = false;
  try {
    await Usuario.updateOne({ _id: b._id }, { $set: { indiceDeposito: leidoA.indiceDeposito } });
  } catch (e) { rebotó = e?.code === 11000; }
  comprobar(rebotó, 'darle a otro el mismo índice rebota en la base, no en un if');
}

decir('quién puede firmar, y quién no');
{
  // Derivada, todo bien.
  const u1 = await nuevoUsuario();
  await dep.asegurarDireccion(u1);
  const d1 = await Usuario.findById(u1._id).lean();
  const r1 = dep.llaveDeUsuario(d1);
  comprobar(r1.ok && new Wallet(r1.llave).address === d1.direccionDeposito,
    'derivada: la llave controla exactamente la dirección publicada');

  // Guardada, todo bien.
  const w = Wallet.createRandom();
  const u2 = await nuevoUsuario({ direccionDeposito: w.address, llaveDepositoCifrada: cifrar(w.privateKey),
                                  origenDeLlave: 'guardada' });
  const r2 = dep.llaveDeUsuario((await Usuario.findById(u2._id).lean()));
  comprobar(r2.ok && r2.llave === w.privateKey, 'guardada: se descifra y coincide');

  // Un usuario de ANTES del campo: blob, sin discriminador. No puede quedarse fuera.
  const w3 = Wallet.createRandom();
  const u3 = await nuevoUsuario({ direccionDeposito: w3.address, llaveDepositoCifrada: cifrar(w3.privateKey) });
  const r3 = dep.llaveDeUsuario((await Usuario.findById(u3._id).lean()));
  comprobar(r3.ok, 'un usuario anterior al campo `origenDeLlave` sigue pudiendo barrerse');

  // LA GUARDA: el indice deriva OTRA direccion que la publicada.
  const u4 = await nuevoUsuario();
  await dep.asegurarDireccion(u4);
  await Usuario.updateOne({ _id: u4._id }, { $set: { direccionDeposito: Wallet.createRandom().address } });
  const r4 = dep.llaveDeUsuario((await Usuario.findById(u4._id).lean()));
  comprobar(!r4.ok && r4.motivo === 'DIRECCION_NO_COINCIDE',
    'si la llave NO controla la dirección publicada, no se firma', JSON.stringify(r4));

  // Sin origen y sin blob: NO se adivina.
  const u5 = await nuevoUsuario({ direccionDeposito: Wallet.createRandom().address });
  const r5 = dep.llaveDeUsuario((await Usuario.findById(u5._id).lean()));
  comprobar(!r5.ok && r5.motivo === 'ORIGEN_DESCONOCIDO',
    'sin saber de dónde sale la llave, no se adivina: se anota');

  // Derivada sin indice: una fila a medias no puede firmar nada.
  const u6 = await nuevoUsuario({ direccionDeposito: Wallet.createRandom().address, origenDeLlave: 'derivada' });
  const r6 = dep.llaveDeUsuario((await Usuario.findById(u6._id).lean()));
  comprobar(!r6.ok && r6.motivo === 'SIN_INDICE', 'derivada sin índice: SIN_INDICE, y no se firma');

  comprobar(Object.keys(dep.MOTIVOS).every((k) => typeof dep.MOTIVOS[k] === 'string'),
    'y cada motivo tiene una explicación en castellano para el panel');
}

decir('la consulta del barrido ya no salta a los derivados');
{
  // La regresion exacta: antes se pedia `llaveDepositoCifrada: {$ne: null}` y
  // un usuario derivado no aparecia — ni en barridos ni en fallos.
  const vistos = await Usuario.countDocuments({ direccionDeposito: { $ne: null } });
  const conBlob = await Usuario.countDocuments({ direccionDeposito: { $ne: null },
                                                llaveDepositoCifrada: { $ne: null } });
  comprobar(vistos > conBlob,
    'hay usuarios con dirección que NO tienen blob: la consulta vieja los perdía',
    `con direccion=${vistos} con blob=${conBlob}`);
  const fuente = await (await import('node:fs/promises'))
    .readFile(new URL('../controllers/adminController.js', import.meta.url), 'utf8');
  comprobar(!/direccionDeposito: \{ \$ne: null \}, llaveDepositoCifrada: \{ \$ne: null \}/.test(fuente),
    'y la consulta del barrido ya no lleva ese filtro');
  comprobar(/llaveDeUsuario\(u\)/.test(fuente),
    'el barrido pide la llave por lib/deposito.js, que comprueba la dirección');
}

decir('el contador solo sube, y no recicla');
{
  const antes = await Contador.findOne({ clave: 'indiceDeposito' }).lean();
  const u = await nuevoUsuario();
  await dep.asegurarDireccion(u);
  await Usuario.deleteOne({ _id: u._id }); // el usuario se va...
  const i2 = await dep.siguienteIndice();
  comprobar(i2 > antes.valor, 'el índice siguiente no vuelve atrás aunque se borre un usuario',
    `antes=${antes.valor} ahora=${i2}`);
}

decir('sin semilla, la casa sigue dando direcciones (por el camino viejo)');
{
  const guardada = process.env.ORDENEX_SEMILLA_DEPOSITOS;
  delete process.env.ORDENEX_SEMILLA_DEPOSITOS;
  der._adentro.olvidar();
  const u = await nuevoUsuario();
  const r = await dep.asegurarDireccion(u);
  const leido = await Usuario.findById(u._id).lean();
  comprobar(r.origen === 'guardada' && leido.llaveDepositoCifrada !== null,
    'sin poder firmar, la dirección nace con llave guardada y no se rompe nada');
  comprobar(leido.indiceDeposito === null, 'y no consume un índice que nadie podría derivar');
  process.env.ORDENEX_SEMILLA_DEPOSITOS = guardada;
  der._adentro.olvidar();
}

decir('el panel puede ver cuánto falta para terminar la migración');
{
  const cuantos = await dep.cuantosConLlaveGuardada();
  comprobar(typeof cuantos === 'number' && cuantos > 0,
    'se puede contar cuántos quedan con llave guardada', String(cuantos));
}

await mongoose.disconnect();
await servidor.stop();

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
