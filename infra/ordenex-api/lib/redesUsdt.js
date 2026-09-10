// Las tres redes de fuera donde esta casa recibe USDT.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTA TABLA VIVE APARTE DE lib/tokens.js
//
// Aquella es la tabla espejo de la cadena 5550, y cadena5550.js:153 lee LOS
// QUINCE de golpe con un Promise.all que invalida la lectura ENTERA si uno
// falla. El contrato de USDT no existe en la 5550: meterlo ahí haría que ese
// balanceOf tronara, que saldosDe() devolviera ok:false para TODA dirección, y
// que el vigía dejara de acreditar ORIGEN, AUKA y los otros trece — en
// silencio, con un log que solo diría «no se pudo leer».
//
// USDT no es de esa familia y no entra en esa tabla.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS CONFIRMACIONES SE DECLARAN EN SEGUNDOS, NO EN BLOQUES
//
// Y esto es una corrección a lo que estaba escrito. vigiaCompras.js:64 espera
// 30 bloques en BSC, calibrados cuando el bloque duraba 3 segundos. BSC bajó a
// 1,5 y después a 0,75: hoy esos 30 bloques son ~22 segundos de protección, no
// los 90 que alguien creyó estar poniendo. Nadie tocó el número cuando la red
// cambió, y así es como una constante que fue correcta se convierte en una
// ventana de reorganización abierta sin aparecer en ningún log.
//
// Aquí se declara EL TIEMPO que se quiere esperar y los bloques se derivan del
// tiempo de bloque MEDIDO al arrancar. El día que una red vuelva a cambiar de
// ritmo, la espera sigue siendo la misma sin que nadie edite nada.

const proveedores = require('./proveedores');

const REDES = {
  137: {
    clave: 'polygon',
    nombre: 'Polygon',
    usdt: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    // Polygon reorganiza poco pero lo hace. Es el mismo tiempo que
    // vigiaCompras ya usa para pagar ORIGEN de verdad: mismo riesgo —
    // acreditar algo que se deshace cuesta lo mismo que pagar una compra que
    // se deshizo— y por tanto mismo número.
    espera: 120,
    pisoBloques: 60,
    explorador: 'https://polygonscan.com/tx/',
    minimoMicro: 2_000_000, // 2 USDT
    bloqueSegundos: 2, // punto de partida; se mide al arrancar
  },
  56: {
    clave: 'bsc',
    nombre: 'BNB Smart Chain',
    usdt: '0x55d398326f99059fF775485246999027B3197955',
    espera: 90,
    pisoBloques: 30,
    explorador: 'https://bscscan.com/tx/',
    minimoMicro: 2_000_000, // 2 USDT
    bloqueSegundos: 0.75,
  },
  1: {
    clave: 'ethereum',
    nombre: 'Ethereum',
    usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    // Ethereum no tiene finalidad probabilística: tiene finalidad DE VERDAD
    // cada dos épocas. Antes de eso un bloque puede desaparecer entero, así
    // que no se cuenta: se pregunta por la etiqueta `finalized` y estos 64
    // slots quedan solo de piso por si el RPC no la sirve.
    espera: 900,
    pisoBloques: 64,
    explorador: 'https://etherscan.io/tx/',
    // Veinticinco, y no dos. El mínimo de Ethereum no lo pone el capricho sino
    // el gas: barrer cuatro dólares ahí cuesta más que los cuatro dólares.
    minimoMicro: 25_000_000, // 25 USDT
    bloqueSegundos: 12,
  },
};

/* El MÍNIMO por red, en micro-dólares. Vive aquí y no en la pantalla porque
   quien tiene que negarse es el servidor: una pantalla puede estar vieja, o
   puede no ser la nuestra. La pantalla enseña el mismo número y hay una prueba
   que falla si los dos se separan.

   El explorador de cada red. Va aquí, con el contrato y la espera, porque es
   parte de lo que la casa le debe a quien deposita: un recibo que se pueda
   comprobar en un sitio que no seamos nosotros. Una pantalla que dice «llegó»
   sin enlace pide un acto de fe. */

/** El evento que se busca. Es el único de todo este circuito. */
const TEMA_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const medido = new Map(); // red -> { segundos, bloques, en }

/**
 * Mide cuánto dura un bloque en esa red, de verdad, y deriva cuántos hacen
 * falta para la espera declarada.
 *
 * Se miran dos bloques separados por mil y se divide la diferencia de sus
 * marcas de tiempo. Si no se puede medir, se usa el valor de partida de la
 * tabla — y se dice, porque un valor de partida que se cree medido es
 * exactamente el fallo que este archivo existe para no repetir.
 */
async function medir(red) {
  const cfg = REDES[Number(red)];
  if (!cfg) throw new Error(`la red ${red} no recibe USDT en esta casa`);

  let segundos = cfg.bloqueSegundos;
  let deVerdad = false;
  try {
    const pv = await proveedores.proveedorDe(Number(red));
    const punta = await pv.getBlockNumber();
    const salto = Math.min(1000, Math.max(10, punta - 1));
    const [a, b] = await Promise.all([pv.getBlock(punta - salto), pv.getBlock(punta)]);
    if (a && b && b.timestamp > a.timestamp) {
      segundos = (b.timestamp - a.timestamp) / salto;
      deVerdad = true;
    }
  } catch {
    // Se queda el de la tabla. No es un fallo del arranque: es una medición
    // que no se pudo hacer, y el cuadro lo dice con `medido: false`.
  }

  const bloques = Math.max(cfg.pisoBloques, Math.ceil(cfg.espera / Math.max(segundos, 0.05)));
  const r = { segundos, bloques, medido: deVerdad, en: new Date() };
  medido.set(Number(red), r);
  console.log(`[usdt] ${cfg.nombre}: bloque ${segundos.toFixed(2)}s` +
    `${deVerdad ? '' : ' (de tabla, no se pudo medir)'} → ${bloques} bloques para ${cfg.espera}s de espera` +
    ` (piso ${cfg.pisoBloques})`);
  return r;
}

/** Cuántos bloques de confirmación pide esa red ahora mismo. */
function bloquesDe(red) {
  const id = Number(red);
  const m = medido.get(id);
  if (m) return m.bloques;
  const cfg = REDES[id];
  return cfg ? Math.max(cfg.pisoBloques, Math.ceil(cfg.espera / cfg.bloqueSegundos)) : 0;
}

/**
 * Hasta qué bloque se puede leer sin miedo a que se deshaga.
 *
 * Se prefiere la etiqueta `finalized` donde el RPC la sirva, porque es la
 * respuesta EXACTA —lo que el consenso ya no puede deshacer— y no se
 * desactualiza cuando la red cambia de parámetros. Pero NUNCA se le cree a
 * secas: un nodo que jure que `finalized` es la punta nos haría acreditar la
 * punta. Se acota contra el piso de bloques, que es el suelo que no se cruza.
 */
async function techo(pv, red) {
  const punta = await pv.getBlockNumber();
  const suelo = punta - bloquesDe(red);
  try {
    const f = await pv.getBlock('finalized');
    if (f && Number.isInteger(f.number)) {
      // Si dice ser más nuevo que el suelo, gana el suelo. Si es más viejo,
      // se le hace caso: esperar de más nunca acreditó nada que se deshiciera.
      return Math.min(f.number, suelo);
    }
  } catch {
    // El RPC no soporta la etiqueta. No es un fallo: se usa el conteo.
  }
  return suelo;
}

/* ── LAS REDES QUE LA CASA TIENE ABIERTAS HOY ────────────────────────────────
 *
 * La tabla de arriba dice qué redes SABE atender esta casa. Cuáles están
 * abiertas AHORA es otra cosa, y depende de algo que cambia solo: el gas.
 *
 * 5-sep. Ethereum tenía 0 de gas —cero barridos posibles— y la pantalla la
 * seguía ofreciendo igual que a las otras dos. Quien mandara USDT por ahí
 * habría depositado de verdad, en una dirección de verdad, y el barrido no
 * habría podido moverlo: dinero llegado y quieto, con la casa sin poder hacer
 * nada hasta fondear una billetera. La red se puede atender técnicamente y aun
 * así no se debe ofrecer.
 *
 * `ORDENEX_REDES` es la lista de las que se ofrecen: «56» para probar solo por
 * BNB, «56,137» para dos, sin la variable TODAS (lo de siempre). Es la misma
 * forma que BARRIDO y COMPRAS — una variable, a mano, sabiendo lo que se hace.
 *
 * Se lee en cada llamada, no al arrancar: cerrar una red no puede exigir un
 * despliegue el día que el gas se acabe.
 */
function abiertas() {
  const todas = Object.keys(REDES).map(Number);
  const dicho = String(process.env.ORDENEX_REDES || '').trim();
  if (!dicho) return todas;
  const pedidas = dicho.split(/[,\s]+/).map(Number).filter((n) => todas.includes(n));
  // Una lista que no deja ninguna red en pie es casi seguro un dedazo, y
  // dejaría la casa sin puerta de entrada sin decirlo. Se avisa y se abre todo:
  // el que cierra redes es quien escribe la variable, no un typo.
  if (!pedidas.length) {
    console.error(`[redes] ORDENEX_REDES="${dicho}" no nombra ninguna red conocida: se abren todas`);
    return todas;
  }
  return pedidas;
}

/** ¿Se puede depositar por esta red ahora mismo? */
function abierta(id) { return abiertas().includes(Number(id)); }

/** El cuadro del panel: qué se midió de verdad y qué salió de la tabla. */
function estado() {
  const salida = {};
  for (const id of Object.keys(REDES).map(Number)) {
    const m = medido.get(id);
    salida[id] = {
      nombre: REDES[id].nombre,
      usdt: REDES[id].usdt,
      esperaSegundos: REDES[id].espera,
      bloqueSegundos: m ? Number(m.segundos.toFixed(3)) : REDES[id].bloqueSegundos,
      confirmaciones: bloquesDe(id),
      medido: Boolean(m && m.medido),
      abierta: abierta(id),
      en: m ? m.en : null,
    };
  }
  return salida;
}

module.exports = {
  REDES, TEMA_TRANSFER,
  medir, bloquesDe, techo, estado, abiertas, abierta,
  _adentro: { medido, olvidar: () => medido.clear() },
};
