/* El vigía de las compras con USDT.
 *
 * Es la otra mitad de contracts/VentaOrigen.sol, y la mitad que NO puede vivir
 * en una cadena: Polygon y BNB Smart Chain no pueden leer la 5550, así que
 * alguien de fuera tiene que mirar las dos y cerrar el círculo.
 *
 * Lo que hace, en una vuelta:
 *
 *   1. Lee cuánto ORIGEN tiene de verdad la billetera pagadora en la 5550.
 *   2. Le pone al contrato de cada red ese cupo y el precio del día.
 *   3. Busca eventos `Compra` con confirmaciones de sobra.
 *   4. Por cada uno, manda el ORIGEN al destino y lo anota.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LAS TRES COSAS QUE PUEDEN SALIR MUY MAL, Y CÓMO SE EVITAN
 *
 * · PAGAR DOS VECES. Un reinicio a destiempo, un RPC que devuelve el mismo log
 *   dos veces, dos dynos. La identidad de una compra es (cadena, txHash,
 *   logIndex) y hay un ÍNDICE ÚNICO en Mongo sobre esa terna: la fila se crea
 *   ANTES de firmar nada, y si ya existía, la creación falla y no se paga. La
 *   guarda es de la base de datos, no de un `if` en memoria — un `if` no
 *   sobrevive a dos procesos.
 *
 * · PAGAR POR UNA COMPRA QUE SE DESHIZO. Una reorganización de cadena puede
 *   borrar un bloque ya visto. Por eso no se mira la punta: se mira lo que
 *   tiene CONFIRMACIONES suficientes, y antes de firmar se vuelve a pedir el
 *   recibo de esa transacción para comprobar que sigue ahí y sigue en éxito.
 *
 * · PAGAR MÁS DE LO QUE HAY. El cupo del contrato es la defensa de delante:
 *   sale del saldo real de la 5550 y el contrato no vende por encima de él. La
 *   de detrás está aquí: antes de cada pago se comprueba el saldo otra vez,
 *   con el gas apartado. Si no alcanza, no se paga, se deja la fila pendiente
 *   y se canta por el log. Nunca se paga de menos «lo que se pueda»: media
 *   compra es peor que ninguna, porque parece completada.
 *
 * NADA DE ESTO EMITE ORIGEN. Paga desde una billetera que ya lo tiene. Si esa
 * billetera se queda seca, las compras quedan pendientes y hay que fondearla —
 * y eso es una decisión de tesorería, no algo que un servicio deba resolver
 * solo.
 */

const { ethers } = require('ethers');
const mongoose = require('mongoose');

// ── las redes donde se cobra ────────────────────────────────────────────────
const REDES = [
  {
    clave: 'polygon',
    nombre: 'Polygon',
    id: 137n,
    rpcs: [process.env.RPC_POLYGON, 'https://polygon-bor-rpc.publicnode.com',
           'https://polygon.drpc.org', 'https://polygon-rpc.com'].filter(Boolean),
    venta: () => process.env.VENTA_POLYGON,
    // Polygon reorganiza poco pero lo hace. 60 bloques son ~2 minutos.
    confirmaciones: 60,
  },
  {
    clave: 'bsc',
    nombre: 'BNB Smart Chain',
    id: 56n,
    rpcs: [process.env.RPC_BSC, 'https://bsc-rpc.publicnode.com',
           'https://bsc-dataseed.bnbchain.org'].filter(Boolean),
    venta: () => process.env.VENTA_BSC,
    confirmaciones: 30,
  },
];

const ABI_VENTA = [
  'event Compra(uint256 indexed numero, address indexed comprador, address indexed destino, uint256 montoUsdt, uint256 precioUsdPorOrigen, uint256 origenDebido)',
  'function ponerPrecioYCupo(uint256 precio, uint256 cupo)',
  'function cupoOrigen() view returns (uint256)',
  'function pausar(bool si)',
];

// Cada cuánto se da una vuelta. Un minuto: el precio del oro no se mueve tanto
// en menos, y quien compra espera minutos, no segundos.
const CADA_MS = 60_000;
// Cuánto ORIGEN se aparta para gas de la propia billetera pagadora. Sin esto,
// la última compra se lleva hasta el gas y deja el vigía sin poder firmar.
const GAS_APARTADO = ethers.parseEther('2');
// Cuántos bloques se rebuscan hacia atrás la primera vez.
const VENTANA_INICIAL = 20_000;

// ── la memoria ──────────────────────────────────────────────────────────────
const compraSchema = new mongoose.Schema(
  {
    cadena: { type: Number, required: true },
    txHash: { type: String, required: true },
    logIndex: { type: Number, required: true },
    bloque: { type: Number, required: true },
    numero: { type: Number, required: true },
    comprador: { type: String, required: true },
    destino: { type: String, required: true },
    montoUsdt: { type: String, required: true },
    precio: { type: String, required: true },
    // Wei de ORIGEN, string. Nunca Number: 2^53 wei son 0,009 ORIGEN.
    origenDebido: { type: String, required: true },
    estado: {
      type: String,
      enum: ['pendiente', 'pagada', 'sin-fondos', 'anulada'],
      default: 'pendiente',
    },
    txPago: { type: String, default: null },
    intentos: { type: Number, default: 0 },
    error: { type: String, default: null },
  },
  { timestamps: true }
);
/* EL índice. Es lo único que impide pagar dos veces, y por eso la fila se crea
   antes de firmar: si dos procesos ven el mismo log, uno crea y el otro choca. */
compraSchema.index({ cadena: 1, txHash: 1, logIndex: 1 }, { unique: true });

const marcaSchema = new mongoose.Schema({
  clave: { type: String, required: true, unique: true },
  bloque: { type: Number, required: true },
});

const CompraUsdt = mongoose.models.CompraUsdt || mongoose.model('CompraUsdt', compraSchema, 'comprasUsdt');
const Marca = mongoose.models.MarcaVigia || mongoose.model('MarcaVigia', marcaSchema, 'marcasVigia');

// ── proveedores, con varios sitios a los que ir ─────────────────────────────
// La lección del 12-ago: había UN proveedor con un respaldo escrito a mano que
// llevaba muerto, y cuando los dos cayeron a la vez esto reintentó en bucle sin
// decírselo a nadie.
const recordado = new Map();

async function proveedor(red) {
  const guardado = recordado.get(red.clave);
  if (guardado && Date.now() - guardado.en < 5 * 60_000) return guardado.p;
  for (const url of red.rpcs) {
    try {
      const p = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });
      const n = await Promise.race([
        p.getNetwork(),
        new Promise((_, x) => setTimeout(() => x(new Error('tardo')), 8000)),
      ]);
      if (n.chainId === red.id) {
        recordado.set(red.clave, { p, en: Date.now() });
        return p;
      }
    } catch {}
  }
  recordado.delete(red.clave);
  throw new Error(`${red.nombre}: ningun RPC contesto`);
}

// ── la 5550: quien paga ─────────────────────────────────────────────────────
function pagador() {
  // Con `0x` o sin el: MetaMask exporta sin el. Ver lib/cripto.js.
  const llave = require('./cripto').normalizarLlave(process.env.ORIGEN_PAGADOR_KEY);
  if (!llave) return null;   // fail-closed: sin llave (o con una que no lo es) no se paga nada
  const rpc = process.env.OG_CHAIN_PROVIDER || 'https://rpc.ordenglobal-rpc.com';
  const p = new ethers.JsonRpcProvider(rpc, undefined, { staticNetwork: true });
  return new ethers.Wallet(llave, p);
}

/** El precio del gramín, medido: gramo de oro entre 55. Sin precio no se
 *  refresca el contrato — se deja con el que tenía, y si caduca deja de vender
 *  solo. Nunca se inventa uno para que la venta siga abierta. */
async function precioOrigen() {
  const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd');
  if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
  const onza = Number((await r.json())?.['pax-gold']?.usd);
  if (!(onza > 0)) throw new Error('el oro no vino en la respuesta');
  const gramin = onza / 31.1035 / 55;
  return ethers.parseUnits(gramin.toFixed(18), 18);
}

// ── una vuelta ──────────────────────────────────────────────────────────────

/** El cupo que se le puede ofrecer al contrato: lo que hay, menos el gas
 *  apartado, y repartido entre las redes activas para no vender dos veces el
 *  mismo ORIGEN en dos contratos a la vez. */
function cupoPara(saldo, redesActivas) {
  const libre = saldo > GAS_APARTADO ? saldo - GAS_APARTADO : 0n;
  return redesActivas > 0 ? libre / BigInt(redesActivas) : 0n;
}

async function refrescar(red, firmante, precio, cupo) {
  const dir = red.venta();
  if (!dir) return;
  const pv = await proveedor(red);
  // El operador firma con la MISMA llave que paga en la 5550? No: se firma con
  // OPERADOR_KEY si está, y si no, no se refresca. La llave que paga ORIGEN no
  // tiene por qué vivir también en Polygon.
  const opKey = process.env.OPERADOR_KEY;
  if (!opKey) {
    console.error('[vigia] OPERADOR_KEY no esta puesta: no se refresca precio ni cupo');
    return;
  }
  const w = new ethers.Wallet(opKey, pv);
  const c = new ethers.Contract(dir, ABI_VENTA, w);
  const tx = await c.ponerPrecioYCupo(precio, cupo);
  await tx.wait(1);
  console.log(`[vigia] ${red.nombre}: precio ${ethers.formatUnits(precio, 18)} · cupo ${ethers.formatEther(cupo)} ORIGEN`);
  void firmante;
}

async function leerCompras(red) {
  const dir = red.venta();
  if (!dir) return [];
  const pv = await proveedor(red);
  const punta = await pv.getBlockNumber();
  const hasta = punta - red.confirmaciones;
  if (hasta <= 0) return [];

  const marca = await Marca.findOne({ clave: red.clave });
  const desde = marca ? marca.bloque + 1 : Math.max(0, hasta - VENTANA_INICIAL);
  if (desde > hasta) return [];

  const c = new ethers.Contract(dir, ABI_VENTA, pv);
  const nuevos = [];
  // De 2000 en 2000: casi todos los RPC públicos cortan los rangos grandes, y
  // un getLogs que falla entero deja la marca sin avanzar para siempre.
  for (let a = desde; a <= hasta; a += 2000) {
    const b = Math.min(a + 1999, hasta);
    const logs = await c.queryFilter(c.filters.Compra(), a, b);
    nuevos.push(...logs);
  }

  for (const l of nuevos) {
    try {
      // La fila se crea ANTES de pagar. Si ya estaba, esto lanza 11000 y la
      // compra no se vuelve a tocar.
      await CompraUsdt.create({
        cadena: Number(red.id),
        txHash: l.transactionHash,
        logIndex: l.index,
        bloque: l.blockNumber,
        numero: Number(l.args.numero),
        comprador: l.args.comprador,
        destino: l.args.destino,
        montoUsdt: l.args.montoUsdt.toString(),
        precio: l.args.precioUsdPorOrigen.toString(),
        origenDebido: l.args.origenDebido.toString(),
      });
      console.log(`[vigia] ${red.nombre}: compra #${l.args.numero} · ${ethers.formatEther(l.args.origenDebido)} ORIGEN → ${l.args.destino}`);
    } catch (e) {
      if (!(e && e.code === 11000)) throw e;   // 11000 = ya la teniamos
    }
  }

  await Marca.findOneAndUpdate({ clave: red.clave }, { bloque: hasta }, { upsert: true });
  return nuevos;
}

async function pagar(firmante) {
  const pendientes = await CompraUsdt.find({ estado: { $in: ['pendiente', 'sin-fondos'] } })
    .sort({ createdAt: 1 }).limit(25);
  if (!pendientes.length) return;

  for (const c of pendientes) {
    const red = REDES.find(r => Number(r.id) === c.cadena);
    if (!red) continue;

    // Se vuelve a pedir el recibo: entre que se vio el log y ahora, una
    // reorganizacion pudo borrar el bloque. Pagar por una compra que ya no
    // existe es regalar ORIGEN.
    try {
      const pv = await proveedor(red);
      const rec = await pv.getTransactionReceipt(c.txHash);
      if (!rec || rec.status !== 1) {
        c.estado = 'anulada';
        c.error = 'la transaccion de compra ya no esta en la cadena';
        await c.save();
        console.error(`[vigia] compra ${c.txHash} ANULADA: ya no esta en ${red.nombre}`);
        continue;
      }
    } catch (e) {
      console.error(`[vigia] no se pudo releer ${c.txHash}: ${e.message}`);
      continue;   // se reintenta la vuelta que viene; NO se paga a ciegas
    }

    const debido = BigInt(c.origenDebido);
    const saldo = await firmante.provider.getBalance(firmante.address);
    if (saldo < debido + GAS_APARTADO) {
      if (c.estado !== 'sin-fondos') {
        c.estado = 'sin-fondos';
        c.error = `hacen falta ${ethers.formatEther(debido)} ORIGEN y hay ${ethers.formatEther(saldo)}`;
        await c.save();
      }
      console.error(`[vigia] SIN FONDOS para la compra ${c.txHash}: ${c.error}`);
      continue;   // nunca se paga «lo que se pueda»: media compra parece completa
    }

    try {
      c.intentos += 1;
      await c.save();
      const tx = await firmante.sendTransaction({ to: c.destino, value: debido });
      const rec = await tx.wait(1);
      c.estado = 'pagada';
      c.txPago = rec.hash;
      c.error = null;
      await c.save();
      console.log(`[vigia] pagada ${ethers.formatEther(debido)} ORIGEN → ${c.destino} · ${rec.hash}`);
    } catch (e) {
      c.error = e.message;
      await c.save();
      console.error(`[vigia] fallo pagando ${c.txHash}: ${e.message}`);
    }
  }
}

async function vuelta() {
  const firmante = pagador();
  if (!firmante) {
    console.error('[vigia] ORIGEN_PAGADOR_KEY no esta puesta: el vigia no paga nada');
    return;
  }
  const activas = REDES.filter(r => r.venta());
  if (!activas.length) {
    console.error('[vigia] ni VENTA_POLYGON ni VENTA_BSC estan puestas: no hay contrato que vigilar');
    return;
  }

  // Primero pagar lo que se debe, y DESPUÉS refrescar el cupo: al revés, el
  // cupo se calcularía con un saldo que ya está comprometido.
  for (const red of activas) {
    try { await leerCompras(red); }
    catch (e) { console.error(`[vigia] ${red.nombre}: leyendo compras: ${e.message}`); }
  }
  await pagar(firmante).catch(e => console.error(`[vigia] pagando: ${e.message}`));

  let precio;
  try { precio = await precioOrigen(); }
  catch (e) {
    // Sin precio no se refresca. El del contrato caduca solo y la venta se
    // cierra: preferimos no vender a vender a un precio que ya no es.
    console.error(`[vigia] sin precio del oro (${e.message}): no se refresca; el contrato caducara solo`);
    return;
  }
  const saldo = await firmante.provider.getBalance(firmante.address);
  const cupo = cupoPara(saldo, activas.length);
  for (const red of activas) {
    try { await refrescar(red, firmante, precio, cupo); }
    catch (e) { console.error(`[vigia] ${red.nombre}: refrescando: ${e.message}`); }
  }
}

let reloj = null;

function arrancar() {
  if (reloj) return;
  if (!process.env.ORIGEN_PAGADOR_KEY) {
    console.log('[vigia] apagado: falta ORIGEN_PAGADOR_KEY');
    return;
  }
  const correr = () => vuelta().catch(e => console.error(`[vigia] vuelta: ${e.message}`));
  correr();
  reloj = setInterval(correr, CADA_MS);
}

function parar() { if (reloj) { clearInterval(reloj); reloj = null; } }

module.exports = {
  arrancar, parar, vuelta, cupoPara, precioOrigen,
  REDES, GAS_APARTADO, CompraUsdt,
};
