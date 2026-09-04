// Que variables de entorno estan puestas — SIN sus valores.
//
// POR QUE EXISTE. /admin/estado decia «ORDENEX_HOT_KEY no esta configurada»
// solo cuando la caliente fallaba, y de ORDENEX_ADM no decia nada: si la
// clave que cifra las llaves de deposito faltaba, se descubria en el primer
// portafolio que no se podia generar. Un panel de operacion tiene que poder
// contestar «¿esta todo configurado?» de un vistazo, ANTES del primer fallo.
//
// LO QUE JAMAS SALE DE AQUI: el valor. Ni entero, ni los ultimos cuatro
// caracteres, ni su largo exacto. Se contesta `puesta` (existe y no esta
// vacia) y, para las que tienen una forma comprobable, `valida`. Para las
// que no son secreto (el RPC, los umbrales, la comision) SI se devuelve el
// valor, porque son las que uno quiere leer en el panel y no dicen nada que
// no se pueda ver desde fuera.

const LARGO_MINIMO_SECRETO = 32;

const esLlavePrivada = (t) => /^0x[0-9a-fA-F]{64}$/.test(String(t || ''));

function puesta(nombre) {
  const v = process.env[nombre];
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * El cuadro de configuracion para el panel. Cada entrada es
 *   { puesta: bool, valida?: bool, valor?: string, nota?: string }
 * y NUNCA lleva el valor de un secreto.
 */
function cuadro() {
  const adm = process.env.ORDENEX_ADM || '';
  const hot = process.env.ORDENEX_HOT_KEY || '';
  const cors = process.env.CORS_ORIGENES || '';

  let caliente = null;
  try { caliente = require('./cadena5550').direccionCaliente(); } catch { caliente = null; }

  let umbrales = null;
  try { umbrales = require('./guardaPrecio').umbrales(); } catch { umbrales = null; }

  // Las unidades. Va en el cuadro porque la pregunta «¿los decimales estan
  // comprobados contra la cadena?» hay que poder contestarla ANTES del primer
  // deposito raro, no despues de que alguien note que le acreditaron una
  // millonesima. Nada de esto es secreto: son contratos publicos y un si o un
  // no.
  let decimales = null;
  try { decimales = require('./decimales').estado(); } catch { decimales = null; }

  let rpcs = null;
  try { rpcs = require('./proveedores').enUso(); } catch { rpcs = null; }

  // La derivacion: si este proceso puede calcular direcciones, si puede firmar,
  // y la HUELLA de su semilla. La huella es lo que permite ver de un vistazo
  // que el proceso web y el que barre van con la MISMA semilla — dos huellas
  // distintas significan que uno esta publicando direcciones que el otro no
  // puede barrer, y eso no se nota de ninguna otra forma hasta que hay dinero
  // atrapado. Ni la frase ni la xpub salen de aqui (ver lib/derivacion.js).
  let derivacion = null;
  try { derivacion = require('./derivacion').estado(); } catch { derivacion = null; }

  // La billetera de gas. Su direccion es publica y va con nombre propio en el
  // panel porque es la que se queda seca sin romper nada visible: los depositos
  // se siguen acreditando y lo unico que pasa es que el dinero deja de juntarse.
  // Si no esta en el panel, se descubre tarde.
  let gasBilletera = null;
  try { gasBilletera = require('./gas').estado(); } catch { gasBilletera = null; }

  return {
    decimales,
    rpcs,
    derivacion,
    gas: gasBilletera,
    // Los secretos: solo si estan y si tienen forma.
    ORDENEX_ADM: {
      puesta: puesta('ORDENEX_ADM'),
      valida: adm.length >= LARGO_MINIMO_SECRETO,
      nota: `clave AES de las llaves de deposito; se pide de ${LARGO_MINIMO_SECRETO} caracteres o mas`,
    },
    ORDENEX_HOT_KEY: {
      puesta: puesta('ORDENEX_HOT_KEY'),
      valida: esLlavePrivada(hot) && Boolean(caliente),
      // La direccion publica de la caliente NO es secreto: es la que recibe los
      // barridos y ya sale en el mismo panel.
      direccion: caliente || null,
      nota: 'llave de la billetera caliente que firma los retiros',
    },
    ORDENEX_ADMIN_KEY: {
      // Si esta respuesta salio, la clave estaba puesta: la ruta no abre sin ella.
      puesta: puesta('ORDENEX_ADMIN_KEY'),
      valida: (process.env.ORDENEX_ADMIN_KEY || '').length >= LARGO_MINIMO_SECRETO,
      nota: 'la X-Admin-Key de este panel',
    },
    ORDENEX_TOKEN: {
      puesta: puesta('ORDENEX_TOKEN'),
      valida: (process.env.ORDENEX_TOKEN || '').length >= LARGO_MINIMO_SECRETO,
      nota: 'secreto HS256 de las sesiones',
    },
    // La semilla y su xpub. NUNCA su valor, ni su largo, ni sus ultimas letras.
    // `valida` sale de la comprobacion de huella de lib/derivacion.js: es la
    // que distingue «hay una frase» de «hay LA frase de este entorno», y esa
    // distincion es la unica que impide publicar direcciones de otro universo.
    ORDENEX_SEMILLA_DEPOSITOS: {
      puesta: puesta('ORDENEX_SEMILLA_DEPOSITOS'),
      valida: Boolean(derivacion && derivacion.puedeFirmar),
      nota: 'frase BIP-39 de las direcciones de deposito; solo en el proceso que barre',
    },
    ORDENEX_SEMILLA_XPUB: {
      puesta: puesta('ORDENEX_SEMILLA_XPUB'),
      valida: Boolean(derivacion && derivacion.puedeCalcular),
      // La huella NO es secreto y no deriva nada; la xpub si se calla, porque
      // con ella se enumeran todas las direcciones de la casa sin tocar Mongo.
      huella: derivacion ? derivacion.huella : null,
      nota: 'xpub neutra con la que se calculan las direcciones sin poder firmarlas',
    },
    ORDENEX_GAS_KEY: {
      puesta: puesta('ORDENEX_GAS_KEY'),
      // `valida` no es «tiene forma de llave»: es «es la llave DE ESA
      // billetera». Una llave perfecta de otro entorno pasaria la primera
      // prueba y fondearia con el dinero de otra casa.
      valida: Boolean(gasBilletera && gasBilletera.configurada),
      direccion: gasBilletera ? gasBilletera.direccion : null,
      nota: 'llave que fondea de gas las direcciones de deposito antes de barrerlas',
    },
    GENESIS_API_KEY: { puesta: puesta('GENESIS_API_KEY'), nota: 'clave de la app ordenex en Genesis (SSO, tamiz, AML)' },
    MONGODB_URI: { puesta: puesta('MONGODB_URI'), nota: 'la base; el nombre ordenex lo fija el codigo' },
    // Lo que no es secreto va con su valor.
    GENESIS_URL: { puesta: puesta('GENESIS_URL'), valor: process.env.GENESIS_URL || null },
    OG_CHAIN_PROVIDER: { puesta: puesta('OG_CHAIN_PROVIDER'), valor: process.env.OG_CHAIN_PROVIDER || 'https://rpc.ordenglobal-rpc.com (por omision)' },
    CORS_ORIGENES: { puesta: puesta('CORS_ORIGENES'), valor: cors.split(',').map((s) => s.trim()).filter(Boolean) },
    ORDENEX_COMISION_PPM: { puesta: puesta('ORDENEX_COMISION_PPM'), valor: process.env.ORDENEX_COMISION_PPM || '0 (sin variable: no se cobra, deliberado)' },
    ORDENEX_DESVIO_AVISO_PCT: { puesta: puesta('ORDENEX_DESVIO_AVISO_PCT'), valor: umbrales ? umbrales.avisoPct : null, nota: 'X: desde aqui la orden pide confirmar el desvio' },
    ORDENEX_DESVIO_BLOQUEO_PCT: { puesta: puesta('ORDENEX_DESVIO_BLOQUEO_PCT'), valor: umbrales ? umbrales.bloqueoPct : null, nota: 'Y: desde aqui la orden no entra' },
  };
}

/** Los nombres de lo que NO puede aparecer en ninguna respuesta: para que una
 *  prueba lo compruebe contra el JSON serializado. */
const SECRETOS = ['ORDENEX_ADM', 'ORDENEX_HOT_KEY', 'ORDENEX_ADMIN_KEY', 'ORDENEX_TOKEN', 'GENESIS_API_KEY', 'MONGODB_URI', 'ORDENEX_SEMILLA_DEPOSITOS', 'ORDENEX_SEMILLA_XPUB', 'ORDENEX_GAS_KEY'];

module.exports = { cuadro, SECRETOS, LARGO_MINIMO_SECRETO };
