// Las billeteras de la casa, escritas literales y en UN solo sitio.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ LITERALES Y NO EN VARIABLES DE ENTORNO
//
// Porque son PÚBLICAS —una dirección no es un secreto— y porque tenerlas aquí
// es lo que permite comprobar que la LLAVE que trae el entorno es la de ESTA
// billetera. Una llave perfectamente válida del entorno equivocado pasa
// cualquier comprobación de forma y firma desde una dirección que no es la
// nuestra; el fallo no se ve hasta que alguien cuadra saldos semanas después.
//
// Con la dirección escrita, esa comprobación es una línea y es imposible de
// saltarse: si la llave no deriva la dirección de aquí, no se firma.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTÁN LAS VIEJAS, Y POR QUÉ NO SE BORRAN
//
// El 4 de septiembre se cambiaron las tres. La de gas anterior quedó
// COMPROMETIDA: un bot barredor se llevó 15 USDT UN BLOQUE después de que
// llegaran — medio segundo. Eso solo pasa si alguien más tiene esa llave.
//
// Las viejas se quedan escritas por dos motivos, y los dos son operativos:
//
//  · Para poder NEGARSE. Ninguna dirección de esta lista puede ser destino de
//    una entrega ni de un barrido. Si mañana alguien pega la vieja en una
//    variable por costumbre, el código tiene con qué reconocerla y parar.
//  · Para leer el pasado. Los movimientos de antes del cambio existen en la
//    cadena y algún día habrá que explicarlos; una dirección sin nombre en un
//    explorador no le dice nada a nadie.
//
// NUNCA se les manda nada. La de gas comprometida, jamás — lo que le llegue se
// pierde en el bloque siguiente.

const { getAddress } = require('ethers');

/** La que recibe los depósitos barridos y paga los retiros. Vale en las tres
 *  redes de fuera: es la misma dirección en Polygon, BSC y Ethereum. */
const UNICA = '0x8832E2D5cCc707bC5fef5780739f6a2F1C3eCAb3';

/** La que fondea de gas las direcciones provisionales antes de barrerlas.
 *  Lleva monedas sueltas a propósito: firma sola cada pocos minutos. */
const GAS = '0x8861427c430814a1D58999D833382Dc7f4a362e8';

/** La que entrega el ORIGEN comprado, en la cadena 5550. */
const ORIGEN = '0xDE23eb4E6318E6C0660D3EEB616538926a8Dd4A2';

/** Las de antes del 4 de septiembre. Solo para reconocerlas y negarse. */
const RETIRADAS = {
  '0x8E839Af7A405f49bf72B239929b8ee3c07Ee7ba0': 'gas · COMPROMETIDA, nunca mandarle nada',
  '0x3E531Ce4fd73b5a3EA86E37fbcd92e2c36490909': 'caja USDT anterior',
  '0xDE451Ac0B5d341e4F7171AA6aD82c55ddF98f2ed': 'ORIGEN anterior',
  '0x6A1aeD0BFCC8c8aC7CB916270509CcD66911eBBc': 'tesorería del circuito de contratos',
  '0x746268404Cc9CA2ef0Ac344F02B236DB232c3ad8': 'pagadora del circuito de contratos',
};

// Que estén bien escritas se comprueba al cargar, no el día que haga falta:
// una dirección con un carácter cambiado es dinero al vacío, y el checksum de
// EIP-55 la detecta gratis. Si esto lanza, es un error de tipeo en ESTE
// archivo y hay que arreglarlo antes de seguir.
for (const [nombre, dir] of Object.entries({ UNICA, GAS, ORIGEN })) {
  if (getAddress(dir) !== dir) {
    throw new Error(`[billeteras] la dirección ${nombre} está mal escrita: ${dir}`);
  }
}

const retiradas = new Set(Object.keys(RETIRADAS).map((d) => d.toLowerCase()));

/**
 * ¿Esta dirección es de la casa?
 *
 * Sirve para lo que el plan llama la tercera guarda de la entrega: no se le
 * entrega ORIGEN a una billetera nuestra. Mandarse dinero a uno mismo y
 * anotarlo como entregado es un descuadre que después no encuentra nadie.
 */
function esDeLaCasa(dir) {
  const d = String(dir || '').toLowerCase();
  return d === UNICA.toLowerCase() || d === GAS.toLowerCase()
    || d === ORIGEN.toLowerCase() || retiradas.has(d);
}

/**
 * ¿Es una de las retiradas? Para poder decir POR QUÉ se rechaza.
 *
 * No lanza con basura a propósito: esto se llama con lo que manda un cliente,
 * y una excepción aquí sería un 500 donde toca un 400. Lo que no es dirección
 * simplemente no es una retirada.
 */
function porQueRetirada(dir) {
  const d = String(dir || '').toLowerCase();
  for (const [escrita, queEra] of Object.entries(RETIRADAS)) {
    if (escrita.toLowerCase() === d) return queEra;
  }
  return null;
}

module.exports = { UNICA, GAS, ORIGEN, RETIRADAS, esDeLaCasa, porQueRetirada };
