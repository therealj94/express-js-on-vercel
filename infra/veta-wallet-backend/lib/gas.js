// ============================================================
// El gas: se le pregunta a la cadena, no se escribe a mano.
//
// LO QUE HABIA
//
//   transactionController.send()       400 gwei · gasLimit 210.000
//   transactionController.sendToken()  600 gwei · gasLimit 210.000
//   swapController                    2000 gwei · gasLimit  21.000
//
// Tres numeros distintos para la misma cadena, ninguno atado a nada. El
// acordado para la 5550 es **93 gwei**: los de arriba son 4,3 · 6,5 y 21,5
// veces eso.
//
// El gasLimit de 210.000 hace mas daño que el precio. Una transferencia nativa
// gasta 21.000; el limite solo reserva. Pero la comprobacion de fondos usa el
// LIMITE, no el gasto: con 210.000 a 400 gwei hay que tener 0,084 ORIGEN
// libres para mover cualquier cantidad. Con las billeteras a 1 ORIGEN que deja
// la consolidacion, eso es el 8,4% del saldo bloqueado por envio — y en el
// canje, 210.000 a 2000 gwei serian 0,42 ORIGEN, el 42% del saldo de una
// persona reservado para una sola operacion. Se ve como "no alcanza para
// cubrir el monto mas el gas" cuando si alcanzaba.
//
// LO QUE HACE ESTE ARCHIVO
//
// Pregunta el precio a la cadena (eth_gasPrice) y el limite al simulador
// (estimateGas), con un suelo y un techo para no quedar a merced de un nodo
// que conteste cualquier cosa. Si la cadena no contesta, usa el suelo: no
// inventa un numero grande "por si acaso", porque ese por-si-acaso es el que
// bloqueaba el saldo del usuario.
// ============================================================

const GWEI = 1000000000n;

// Suelo y techo, en gwei. El suelo es el precio acordado para la red: por
// debajo de --min-gas-price el nodo ni acepta la transaccion. El techo esta
// para que un nodo mal configurado no vacie una billetera.
const SUELO_GWEI = BigInt(process.env.OG_GAS_SUELO_GWEI || 93);
const TECHO_GWEI = BigInt(process.env.OG_GAS_TECHO_GWEI || 1000);

// Margenes de seguridad sobre lo estimado. La estimacion puede quedarse corta
// si el estado cambia entre estimar y minar (un `approve` que se gasta, una
// ranura que pasa de cero a distinto de cero).
const MARGEN_LIMITE = 130n; // %
const LIMITE_NATIVO = 21000n;
const LIMITE_TOKEN = 120000n; // respaldo si estimateGas no contesta

export async function precioDeGas(provider) {
  let gwei = SUELO_GWEI;
  try {
    const f = await provider.getFeeData();
    // Con zeroBaseFee la cadena no cobra base: todo el precio es propina y va
    // al validador que propone el bloque. gasPrice es el numero que manda.
    const p = f?.gasPrice;
    if (p && p > 0n) gwei = p / GWEI;
  } catch {
    // Se queda en el suelo: es el precio que la red exige de todas formas.
  }
  if (gwei < SUELO_GWEI) gwei = SUELO_GWEI;
  if (gwei > TECHO_GWEI) gwei = TECHO_GWEI;
  return gwei * GWEI;
}

export async function limiteDeGas(provider, tx, porOmision = LIMITE_NATIVO) {
  try {
    const est = await provider.estimateGas(tx);
    if (est && est > 0n) {
      const conMargen = (est * MARGEN_LIMITE) / 100n;
      return conMargen < LIMITE_NATIVO ? LIMITE_NATIVO : conMargen;
    }
  } catch {
    // Una estimacion que falla suele significar que la transaccion revertiria.
    // No es este el sitio para decidirlo: se sigue con el limite por omision y
    // que hable la cadena, con un mensaje que el usuario entienda.
  }
  return porOmision;
}

export const LIMITE_POR_OMISION_TOKEN = LIMITE_TOKEN;

// Lo que hay que tener libre para poder enviar `valor`: el monto mas el gas
// reservado. Se expone para poder decirle al usuario cuanto le falta en vez de
// un "no alcanza" a secas.
export function reservaNecesaria(valorWei, limite, precioWei) {
  return BigInt(valorWei) + BigInt(limite) * BigInt(precioWei);
}
