/* La puerta del SSO exige la direccion de billetera del vinculo (SFSP v0.3 §11).
 *
 *   node pruebas/probar-sso-direccion.mjs
 *
 * Antes un vinculo de Veta Wallet sin direccion dejaba entrar igual. Era el
 * hueco del limite de exposicion por Genesis ID: se suma con las direcciones
 * de los vinculos, y quien entraba sin la suya operaba con una billetera que
 * el limite no veia.
 *
 * Con Mongo en memoria y el controlador de verdad; lo unico fingido es la
 * respuesta de Genesis (lib/genesis.verificarSso). Ninguna red de verdad.
 *
 *  1. Sin vinculo de veta-wallet, o con el vinculo sin direccion: 403
 *     VINCULO_SIN_DIRECCION, y no se crea ni se toca ningun usuario.
 *  2. Con una direccion invalida (formato, suma EIP-55 mal, la cero): 403
 *     VINCULO_DIRECCION_INVALIDA.
 *  3. Con una direccion valida en minusculas: entra, y se guarda con su suma
 *     de control.
 */

let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = await import('mongodb-memory-server'));
} catch {
  console.error('Falta mongodb-memory-server: npm install');
  process.exit(1);
}
const { default: mongoose } = await import('mongoose');
const servidor = await MongoMemoryServer.create();
await mongoose.connect(servidor.getUri(), { dbName: 'ordenex_prueba_sso' });

process.env.ORDENEX_TOKEN = 'secreto-solo-de-prueba-y-bien-largo-para-firmar';

const { Usuario } = (await import('../models/index.js')).default;
const genesis = (await import('../lib/genesis.js')).default;
const { sso } = (await import('../controllers/authController.js')).default;

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

/** Entra con un perfil de Genesis cuyo `apps` es el que se le pasa. */
async function entrar(gid, apps) {
  genesis.verificarSso = async () => ({
    valido: true, gid, perfil: { verificada: true, nombre: 'Prueba', apps },
  });
  const res = resFingido();
  await sso({ body: { token: 'pase-de-prueba' } }, res);
  return res;
}

const EIP55 = '0x52908400098527886E0F7030069857D2E4169EE7';

decir('Sin direccion no se abre sesion');
for (const [que, apps] of [
  ['sin ningun vinculo', []],
  ['solo el vinculo de otra app', [{ app: 'mytokenpay', direccion: EIP55 }]],
  ['el de veta-wallet sin direccion', [{ app: 'veta-wallet', direccion: null }]],
]) {
  const gid = `GEN-SIN-DIR-${Math.random().toString(36).slice(2, 8)}`;
  const r = await entrar(gid, apps);
  comprobar(r.estado === 403 && r.cuerpo?.codigo === 'VINCULO_SIN_DIRECCION', `${que} → 403 VINCULO_SIN_DIRECCION`, JSON.stringify(r.cuerpo));
  comprobar(!(await Usuario.findOne({ gid })), `${que} → no se crea el usuario`);
}

decir('Con direccion invalida tampoco');
for (const mala of ['0xabc', '0x' + '0'.repeat(40), EIP55.slice(0, -1) + 'e', 'hola']) {
  const gid = `GEN-MALA-${Math.random().toString(36).slice(2, 8)}`;
  const r = await entrar(gid, [{ app: 'veta-wallet', direccion: mala }]);
  comprobar(r.estado === 403 && r.cuerpo?.codigo === 'VINCULO_DIRECCION_INVALIDA', `${mala} → 403 VINCULO_DIRECCION_INVALIDA`, JSON.stringify(r.cuerpo));
  comprobar(!(await Usuario.findOne({ gid })), `${mala} → no se crea el usuario`);
}

decir('Con la direccion del vinculo, entra');
{
  const gid = 'GEN-CON-DIR-0001';
  const r = await entrar(gid, [{ app: 'veta-wallet', direccion: EIP55.toLowerCase() }]);
  comprobar(r.estado === 200 && typeof r.cuerpo?.token === 'string', 'entra y recibe su par', JSON.stringify(r.cuerpo));
  comprobar(r.cuerpo?.usuario?.direccionWallet === EIP55, 'la direccion va con su suma de control', r.cuerpo?.usuario?.direccionWallet);
  const u = await Usuario.findOne({ gid }).lean();
  comprobar(u?.direccionWallet === EIP55, 'y asi queda guardada');
}

await mongoose.disconnect();
await servidor.stop();
console.log(fallos ? `\n${fallos} fallo(s)\n` : '\nTodo en orden\n');
process.exit(fallos ? 1 : 0);
