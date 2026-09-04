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
  137: {
    nombre: 'Polygon',
    rpcs: [process.env.RPC_POLYGON, 'https://polygon-bor-rpc.publicnode.com',
           'https://polygon.drpc.org', 'https://polygon-rpc.com'].filter(Boolean),
  },
  56: {
    nombre: 'BNB Smart Chain',
    rpcs: [process.env.RPC_BSC, 'https://bsc-rpc.publicnode.com',
           'https://bsc-dataseed.bnbchain.org'].filter(Boolean),
  },
  1: {
    nombre: 'Ethereum',
    rpcs: [process.env.RPC_ETHEREUM, 'https://ethereum-rpc.publicnode.com',
           'https://eth.drpc.org'].filter(Boolean),
  },
};

// Cinco minutos, el mismo plazo que vigiaCompras. Ni tanto que un nodo caido
// se quede elegido media hora, ni tan poco que cada vuelta pague el descarte.
const VIDA_MS = 5 * 60 * 1000;
const recordado = new Map(); // red -> { pv, en, url }

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
  for (const url of cfg.rpcs) {
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

/** Cual se esta usando ahora mismo, para el panel. Nunca lanza. */
function enUso() {
  const salida = {};
  for (const id of Object.keys(REDES).map(Number)) {
    const r = recordado.get(id);
    salida[id] = { nombre: REDES[id].nombre, url: r ? r.url : null, desde: r ? new Date(r.en) : null };
  }
  return salida;
}

module.exports = { REDES, proveedorDe, enUso, _adentro: { recordado, conPlazo } };
