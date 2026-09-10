/* El barrido automático, contra Mongo de verdad.
 *
 *   node pruebas/probar-barrido.mjs
 *
 * Lo que hay que probar aquí no son las cuentas —el barrido no hace cuentas—
 * sino las CARRERAS y las DUDAS: que dos procesos no barran la misma dirección
 * a la vez, que un candado abandonado no la bloquee para siempre, que una
 * transacción de la que no se sabe nada no se reintente en caliente, y que
 * barrer no toque el estado del depósito (barrer NO es acreditar).
 *
 * Corre contra mongodb-memory-server. Si no está, se dice y se sale — sin
 * fingir un verde que no se ganó.
 */

let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = await import('mongodb-memory-server'));
} catch {
  console.log('mongodb-memory-server no esta instalado (falta npm install): esta prueba NO corrio y NO probo nada.');
  process.exit(0);
}

const { HDNodeWallet, Wallet, AbiCoder, id: keccakId } = await import('ethers');

const FRASE = 'test test test test test test test test test test test junk';
process.env.ORDENEX_SEMILLA_DEPOSITOS = FRASE;
process.env.ORDENEX_SEMILLA_XPUB = HDNodeWallet.fromPhrase(FRASE, '', "m/44'/60'/0'/0").neuter().extendedKey;
process.env.ORDENEX_ADM = 'una-clave-de-pruebas-suficientemente-larga-1234';
process.env.ORDENEX_GAS_KEY = Wallet.createRandom().privateKey.slice(2); // NO es la de la casa: el gas se negará

const { default: mongoose } = await import('mongoose');
const servidor = await MongoMemoryServer.create();
await mongoose.connect(servidor.getUri(), { dbName: 'ordenex_barrido' });

const { Usuario } = (await import('../models/index.js')).default;
const dep = (await import('../lib/deposito.js')).default;
const decimales = (await import('../lib/decimales.js')).default;
const billeteras = (await import('../lib/billeteras.js')).default;
const { DepositoExterno } = (await import('../lib/vigiaDepositosExternos.js')).default;
const barrido = (await import('../lib/barridoExterno.js')).default;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (q) => console.log(`\n── ${q} ${'─'.repeat(Math.max(2, 62 - q.length))}`);

await Usuario.syncIndexes();
await DepositoExterno.syncIndexes();
await barrido.Barrido.syncIndexes();

// Los decimales, verificados contra una cadena FINGIDA que contesta por
// `call` como lo haría un nodo. No se parchea nada: se pasa por el mismo
// decodificador que producción. (Es el mismo truco que probar-decimales.mjs;
// en ethers v6 los métodos del ABI se resuelven por Proxy y un parche al
// prototipo no se vería.)
const POLYGON = 137;
const REALES = { 137: { USDT: 6 }, 56: { USDT: 18 }, 1: { USDT: 6 } };
function cadenaFingida() {
  const porContrato = new Map();
  for (const [red, activos] of Object.entries(decimales.ESPERADOS)) {
    for (const [simbolo, f] of Object.entries(activos)) {
      if (f.contrato) porContrato.set(f.contrato.toLowerCase(), { red: Number(red), simbolo });
    }
  }
  return async () => ({
    call: async (tx) => {
      const q = porContrato.get(String(tx.to).toLowerCase());
      if (!q) throw new Error(`contrato desconocido ${tx.to}`);
      const v = REALES[q.red]?.[q.simbolo];
      if (v === undefined) throw new Error(`sin dato para ${q.simbolo}`);
      return '0x' + BigInt(v).toString(16).padStart(64, '0');
    },
  });
}
const verificarDecimales = () => decimales.verificar({ proveedorDe: cadenaFingida(), plazoMs: 3000 });
await verificarDecimales();

let n = 0;
async function conDeposito(crudo = '15000000') {
  const u = await Usuario.create({ gid: `gid-b-${++n}-${Date.now()}` });
  const { direccion } = await dep.asegurarDireccion(u);
  await DepositoExterno.create({
    cadena: POLYGON, txHash: keccakId(`tx-${n}`), logIndex: 0, bloque: 1000 + n,
    enCadena: new Date(), de: Wallet.createRandom().address, direccion,
    userId: String(u._id), crudo, decimales: 6,
    cantidad: decimales.aCanonico(crudo, POLYGON, 'USDT'),
  });
  return { u, direccion };
}

decir('a quién le toca');
{
  const { direccion } = await conDeposito();
  const lista = await barrido.pendientes(POLYGON);
  comprobar(lista.some((p) => p.direccion === direccion),
    'una dirección con depósito en la provisional entra en la lista');

  // La misma dirección, ya barrida: no vuelve. Es la diferencia entre mirar
  // los DEPÓSITOS y mirar a los usuarios — la mayoría no tiene nada y una
  // vuelta que los recorre a todos no escala.
  await barrido.cerrar(POLYGON, direccion, '0xabc');
  const despues = await barrido.pendientes(POLYGON);
  comprobar(!despues.some((p) => p.direccion === direccion),
    'y deja de entrar en cuanto está barrida');
}

decir('barrer NO es acreditar');
{
  const { direccion } = await conDeposito();
  await barrido.cerrar(POLYGON, direccion, '0xdef');
  const d = await DepositoExterno.findOne({ direccion }).lean();
  comprobar(d.custodia === 'barrido', 'la custodia pasa a barrido', d.custodia);
  comprobar(d.estado === 'visto', 'pero el ESTADO no se toca: sigue sin acreditar', d.estado);
  comprobar(d.barridoHash === '0xdef', 'y queda el hash para poder mirarlo en la cadena');
}

decir('el candado: uno solo en vuelo por dirección');
{
  const { u, direccion } = await conDeposito();
  const base = { cadena: POLYGON, direccion, userId: String(u._id), crudo: '1', decimales: 6,
                 cantidad: '1', a: billeteras.UNICA };
  await barrido.Barrido.create(base);
  let choco = false;
  try { await barrido.Barrido.create(base); } catch (e) { choco = e.code === 11000; }
  comprobar(choco, 'el segundo barrido en vuelo choca contra el índice único');

  // Y una dirección con candado fresco no la reparte `pendientes`: el otro
  // proceso está en ello.
  const lista = await barrido.pendientes(POLYGON);
  comprobar(!lista.some((p) => p.direccion === direccion), 'y esa dirección no se reparte mientras tanto');

  // Terminado el barrido, el candado se suelta: el parcial solo indexa
  // 'enviando'. Sin el parcial, una dirección se podría barrer UNA sola vez
  // en su vida — el fallo silencioso más caro de este archivo.
  await barrido.Barrido.updateMany({ direccion }, { estado: 'hecho' });
  let segundo = true;
  try { await barrido.Barrido.create(base); } catch { segundo = false; }
  comprobar(segundo, 'y una vez hecho, esa dirección se puede volver a barrer');
}

decir('el candado abandonado');
{
  const { u, direccion } = await conDeposito();
  const viejo = await barrido.Barrido.create({
    cadena: POLYGON, direccion, userId: String(u._id), crudo: '1', decimales: 6,
    cantidad: '1', a: billeteras.UNICA,
  });
  // Un proceso que murió entre crear la fila y firmar. No puede bloquear esa
  // dirección para siempre.
  const futuro = Date.now() + barrido._adentro.CANDADO_VIEJO_MS + 1000;
  const lista = await barrido.pendientes(POLYGON, { ahora: futuro });
  comprobar(!lista.some((p) => p.direccion === direccion),
    'pasado el plazo NO se barre en el mismo aliento (podría seguir viva)');
  const tras = await barrido.Barrido.findById(viejo._id).lean();
  comprobar(tras.estado === 'en-duda', 'pero el candado se marca en duda y se suelta', tras.estado);
  comprobar(/no volvió/.test(tras.motivo || ''), 'diciendo por qué', tras.motivo);
}

decir('la duda se deja reposar');
{
  const { u, direccion } = await conDeposito();
  await barrido.Barrido.create({
    cadena: POLYGON, direccion, userId: String(u._id), crudo: '1', decimales: 6,
    cantidad: '1', a: billeteras.UNICA, estado: 'en-duda', motivo: 'plazo agotado',
  });
  const ya = await barrido.pendientes(POLYGON);
  comprobar(!ya.some((p) => p.direccion === direccion),
    'con una duda reciente NO se reintenta: puede haber una transacción viva');
  const luego = await barrido.pendientes(POLYGON, { ahora: Date.now() + barrido._adentro.ENFRIAMIENTO_MS + 1000 });
  comprobar(luego.some((p) => p.direccion === direccion),
    'pasado el enfriamiento sí se vuelve a mirar');
  comprobar(barrido._adentro.ENFRIAMIENTO_MS >= 60_000,
    'y el enfriamiento es de minutos, no de segundos', barrido._adentro.ENFRIAMIENTO_MS);
}

decir('sin decimales comprobados no se barre');
{
  const { u, direccion } = await conDeposito();
  decimales._adentro.olvidar();
  const r = await barrido.barrer(POLYGON, direccion, String(u._id));
  comprobar(r.ok === false, 'se niega');
  comprobar(/decimales/.test(r.motivo), 'y dice que es por los decimales', r.motivo);
  comprobar(r.estado === 'no-se-pudo', 'con estado no-se-pudo', r.estado);
  await verificarDecimales();
}

decir('una red que no recibe USDT');
{
  const { u, direccion } = await conDeposito();
  const r = await barrido.barrer(5550, direccion, String(u._id));
  comprobar(r.ok === false && /no recibe USDT/.test(r.motivo), 'se niega y lo explica', r.motivo);
}

decir('el destino es la caja, y solo la caja');
{
  const fuente = (await import('node:fs')).readFileSync(new URL('../lib/barridoExterno.js', import.meta.url), 'utf8');
  comprobar(/billeteras\.UNICA/.test(fuente), 'el destino sale de lib/billeteras.js, no de una literal');
  comprobar(!/0x[0-9a-fA-F]{40}/.test(fuente), 'y no hay ninguna dirección escrita a mano en el archivo');
  // El candado se crea ANTES de pedir gas: dos procesos pidiendo gas para la
  // misma dirección lo gastan dos veces, y el gas cuesta dinero de verdad.
  const iCandado = fuente.indexOf('Barrido.create(');
  const iGas = fuente.indexOf('gas.asegurarGas(');
  comprobar(iCandado > 0 && iGas > 0 && iCandado < iGas, 'y el candado se pone antes de gastar gas');
  // La delegación se comprueba antes que nada: si la dirección está delegada,
  // el gas que le mandemos para poder barrer se va por el mismo agujero.
  const iDeleg = fuente.indexOf('delegacion.de(pv, direccion)');
  comprobar(iDeleg > 0 && iDeleg < iGas, 'y la delegación se mira antes de mandarle gas');
}

decir('el resumen');
{
  const r = await barrido.resumen();
  comprobar(r.caja === billeteras.UNICA, 'dice a qué caja va todo', r.caja);
  comprobar(typeof r.pendientesDeBarrer === 'number', 'y cuántos depósitos siguen en la provisional');
  comprobar(Array.isArray(r.quierenOjos), 'y saca aparte los que necesitan que alguien mire');
}

console.log(`\n${fallos ? `FALLARON ${fallos}` : 'Todo en verde'}`);
await mongoose.disconnect();
await servidor.stop();
process.exit(fallos ? 1 : 0);
