// Un proveedor RPC por cadena, con respaldo y con memoria corta.
//
// POR QUE EXISTE
//
// Los RPC publicos se caen, se atrasan y a veces contestan mal sin decirlo.
// La respuesta de esta casa ya estaba escrita dentro de lib/vigiaCompras.js:
// varias direcciones por red, se prueba una por una, y la que sirve se
// recuerda un rato para no repetir el descarte en cada vuelta. Lo que faltaba
// era sacarla de ahi para que la usen tambien el vigia de depositos externos,
// el barrido y la comprobacion de decimales — tres sitios que si cada uno
// trae su propia lista, el dia que se cambie un RPC se cambia en un sitio y se
// olvida en dos.
//
// LA COMPROBACION QUE NO ES OBVIA
//
// No basta con que el nodo conteste: tiene que contestar por LA CADENA QUE
// DICE. Un RPC mal configurado, o un dominio que cambio de dueño, contesta
// perfectamente por otra red, y entonces se leerian saldos de una cadena
// creyendo que son de otra. Por eso se le pregunta getNetwork() y se compara
// el chainId antes de darlo por bueno.
//
// LO QUE ESTE ARCHIVO NO HACE TODAVIA
//
// lib/vigiaCompras.js sigue con SU copia de las listas y de esta logica. No se
// toca aqui a proposito: hoy no esta enganchado en app.js (es codigo que no
// corre) y migrarlo es un cambio en codigo que firma pagos, que merece ir solo
// y con su prueba. Mientras tanto las dos listas dicen lo mismo, y esta nota
// existe para que quien cambie una se acuerde de la otra.

const { JsonRpcProvider } = require('ethers');

// Las cuatro cadenas donde esta casa lee. Las de Polygon y BSC son las mismas
// que lib/vigiaCompras.js:46-68; Ethereum es nueva y la 5550 sale de la misma
// variable que usa lib/cadena5550.js:21, para no tener dos verdades sobre
// nuestra propia cadena.
const REDES = {
  5550: {
    nombre: 'Orden Global',
    rpcs: [process.env.OG_CHAIN_PROVIDER, 'https://rpc.ordenglobal-rpc.com'].filter(Boolean),
  },
  /* ── EL ORDEN DE ESTAS LISTAS SE MIDIO, NO SE COPIO ──────────────────────
   *
   * El 4 de septiembre se probaron veinticinco RPC publicos con LA CONSULTA
   * QUE DE VERDAD HACE EL VIGIA —getLogs de Transfer de USDT filtrando por
   * destinatario, 500 bloques, dos horas hacia atras— y casi todos fallaron.
   * No por estar caidos: contestaban `eth_chainId` al instante y rechazaban
   * el getLogs, unos por pedir cuenta de pago para leer archivo y otros por
   * limite de peticiones. De veinticinco pasaron TRES, uno por cadena.
   *
   * Los que pasaron van primero. Los que no, quedan detras como ultimo
   * recurso: un nodo que hoy limita puede servir mañana, y la alternativa a
   * intentarlo es quedarse sin cadena.
   *
   * OJO CON EL PARECIDO: en BSC `bsc.publicnode.com` sirvio y
   * `bsc-rpc.publicnode.com` no. Se parecen y no son lo mismo.
   *
   * Y LO QUE HAY QUE ENTENDER: esto es una lista de nodos gratuitos, y ser
   * gratis es justamente el motivo por el que rechazan. Sirven para mirar,
   * no para depender. Cuando el circuito mueva dinero de verdad, la respuesta
   * es RPC_POLYGON / RPC_BSC / RPC_ETHEREUM con un nodo pagado — van primero
   * en la lista y todo esto pasa a ser el respaldo. */
  137: {
    nombre: 'Polygon',
    rpcs: [process.env.RPC_POLYGON,
           'https://polygon-bor-rpc.publicnode.com',   // sirvio
           'https://polygon.gateway.tenderly.co',      // sirvio
           'https://polygon.drpc.org', 'https://polygon-rpc.com'].filter(Boolean),
  },
  56: {
    nombre: 'BNB Smart Chain',
    rpcs: [process.env.RPC_BSC,
           'https://bsc.publicnode.com',               // sirvio
           'https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.bnbchain.org',
           'https://bsc-dataseed1.defibit.io'].filter(Boolean),
  },
  1: {
    nombre: 'Ethereum',
    rpcs: [process.env.RPC_ETHEREUM,
           'https://rpc.mevblocker.io',                // sirvio
           'https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'].filter(Boolean),
  },
};

// Cinco minutos, el mismo plazo que vigiaCompras. Ni tanto que un nodo caido
// se quede elegido media hora, ni tan poco que cada vuelta pague el descarte.
const VIDA_MS = 5 * 60 * 1000;
const recordado = new Map(); // red -> { pv, en, url }

/* ── EL CASTIGO, Y POR QUE HACIA FALTA ──────────────────────────────────────
 *
 * getNetwork() es la pregunta equivocada para saber si un nodo sirve.
 *
 * El 4 de septiembre, con el vigia externo recien desplegado, Ethereum y BSC
 * llevaban horas sin ver un solo bloque. Los nodos no estaban caidos: a
 * `eth_chainId` contestaban al instante y por la cadena correcta, asi que
 * pasaban esta puerta y se quedaban elegidos. Lo que rechazaban era el
 * `eth_getLogs`:
 *
 *   {"code":-32602,"message":"Archive requests require a personal token"}
 *
 * O sea: sirvo la punta, no sirvo historia. Y como el unico criterio para
 * cambiar de nodo era «no contesta», el vigia se quedaba pegado al que lo
 * rechazaba y fallaba cada treinta segundos, en silencio, para siempre.
 *
 * De ahi `descartar`: quien USA el proveedor es el unico que sabe si de verdad
 * le sirvio, y ahora puede decirlo. El nodo descartado queda castigado un rato
 * para que el reintento inmediato no vuelva a elegirlo — sin el castigo,
 * `descartar` solo borra la memoria y la linea siguiente elige otra vez al
 * mismo, que es un bucle y no un respaldo.
 *
 * El castigo es CORTO a proposito: casi todos estos rechazos son limites por
 * minuto, no politicas. Un castigo largo regalaria el mejor nodo de una cadena
 * por un tropiezo. */
const CASTIGO_MS = Number(process.env.RPC_CASTIGO_MS || 90_000);
const castigados = new Map(); // url -> hasta cuando (ms)

function castigado(url) {
  const hasta = castigados.get(url);
  if (!hasta) return false;
  if (Date.now() >= hasta) { castigados.delete(url); return false; }
  return true;
}

/** Cuanto se espera a que un nodo diga por que cadena habla. */
const PLAZO_MS = Number(process.env.RPC_PLAZO_MS || 6000);

function conPlazo(promesa, ms, que) {
  let reloj;
  const corte = new Promise((_, rechaza) => {
    reloj = setTimeout(() => rechaza(new Error(`${que} no contestó en ${ms} ms`)), ms);
  });
  return Promise.race([promesa, corte]).finally(() => clearTimeout(reloj));
}

/**
 * Un proveedor vivo para esa cadena, o lanza.
 *
 * Lanza en vez de devolver null a proposito: un null se cuela en la linea de
 * abajo y revienta lejos de aqui, con un mensaje que no dice que la culpa fue
 * de la red. Quien llame tiene que decidir que hace sin poder ignorarlo.
 */
async function proveedorDe(red) {
  const id = Number(red);
  const cfg = REDES[id];
  if (!cfg) throw new Error(`no hay RPC configurado para la cadena ${red}`);

  const antes = recordado.get(id);
  if (antes && Date.now() - antes.en < VIDA_MS) return antes.pv;

  const fallos = [];
  /* Los castigados van al FINAL, no fuera. Si todos lo estan —una caida de
     medio internet, o un limite que pegó a los tres a la vez— es mejor
     reintentar con uno castigado que quedarse sin cadena: el castigo ordena,
     no excluye. */
  const orden = [...cfg.rpcs.filter((u) => !castigado(u)), ...cfg.rpcs.filter(castigado)];
  for (const url of orden) {
    try {
      const pv = new JsonRpcProvider(url, undefined, { staticNetwork: true });
      const n = await conPlazo(pv.getNetwork(), PLAZO_MS, url);
      if (Number(n.chainId) !== id) {
        fallos.push(`${url}: dijo ser la cadena ${n.chainId} y no la ${id}`);
        continue;
      }
      recordado.set(id, { pv, en: Date.now(), url });
      return pv;
    } catch (e) {
      fallos.push(`${url}: ${e?.message || e}`);
    }
  }
  // El olvido es a proposito: si ninguno sirvio, la vuelta siguiente vuelve a
  // probar desde el primero. Recordar un fallo seria quedarse cinco minutos
  // sin cadena por un tropiezo de un segundo.
  recordado.delete(id);
  throw new Error(`ningún RPC de ${cfg.nombre} contestó — ${fallos.join(' · ')}`);
}

/**
 * «Este proveedor no me sirvio»: lo olvida y lo castiga un rato, para que la
 * llamada siguiente elija otro. Devuelve la URL descartada, o null si no habia
 * ninguno elegido para esa cadena.
 *
 * Lo llama quien USA el proveedor, que es el unico que sabe si de verdad le
 * sirvio. Nunca lanza: descartar es lo que se hace cuando algo ya salio mal, y
 * una excepcion aqui taparia el error de verdad con uno peor.
 */
function descartar(red, motivo) {
  const id = Number(red);
  const r = recordado.get(id);
  if (!r) return null;
  recordado.delete(id);
  castigados.set(r.url, Date.now() + CASTIGO_MS);
  if (motivo) console.warn(`[rpc] ${REDES[id]?.nombre || id}: descarto ${r.url} — ${motivo}`);
  return r.url;
}

/** Cual se esta usando ahora mismo, para el panel. Nunca lanza. */
function enUso() {
  const salida = {};
  for (const id of Object.keys(REDES).map(Number)) {
    const r = recordado.get(id);
    salida[id] = {
      nombre: REDES[id].nombre, url: r ? r.url : null, desde: r ? new Date(r.en) : null,
      // Los castigados, para que el panel explique por qué se está usando el
      // segundo de la lista en vez del primero.
      castigados: REDES[id].rpcs.filter(castigado),
    };
  }
  return salida;
}

module.exports = {
  REDES, proveedorDe, descartar, enUso,
  _adentro: { recordado, castigados, castigado, conPlazo, CASTIGO_MS },
};
