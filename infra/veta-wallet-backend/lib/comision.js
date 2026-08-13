import { parseEther } from "ethers";
import { precioDeGas } from "./gas";

// ============================================================
// La comision de Orden Global: 0,01 ORIGEN fijos por transaccion.
//
// QUE ES Y QUE NO ES
//
// No es el gas. El gas lo cobra la cadena, depende de lo que haga la
// transaccion y va INTEGRO al validador que propone el bloque --medido en la
// 5534: las cuatro direcciones de validador empezaron en cero y fueron
// acumulando--. Esta comision es otra cosa: un cobro fijo de la billetera, que
// va al tesoro, y que NO cambia el gas.
//
//   comision   0,010000 ORIGEN  fija, la mande quien la mande
//   gas nativo 0,001953 ORIGEN  21.000 a 93 gwei
//   gas token  0,004880 ORIGEN  52.472 a 93 gwei
//
// Fija de verdad quiere decir eso: da igual que se envie 1 ORIGEN o un millon,
// y da igual que sea ORIGEN o un token. Eso el gas no lo puede hacer --un
// envio de token gasta 2,5 veces mas que uno nativo-- y por eso la comision la
// cobra la billetera y no la cadena.
//
// COMO SE COBRA
//
// Con una transaccion aparte de 0,01 ORIGEN al tesoro, DESPUES de la del
// usuario. El orden importa: si se cobrara primero y el envio fallara, se le
// habria cobrado por nada. Al reves, lo peor que pasa es que perdemos la
// comision de un envio que si salio, que es el lado correcto en el que
// equivocarse.
//
// Con 1 ORIGEN --lo que deja la consolidacion en cada billetera-- salen 84
// envios nativos o 67 de token, comision y gas incluidos.
//
// COMO SE ENCIENDE
//
// `OG_COMISION_ORIGEN`. Sin esa variable NO se cobra nada, que es como queda
// hasta que arranque la 5550: encender un cobro a 435 personas sin avisarles
// no se hace de madrugada. Ponerla a 0.01 lo activa.
// ============================================================

const DESTINO = () => process.env.TREASURY_OG_ADDRESS;

/** La comision en wei, o 0n si no esta configurada. */
export function comisionEnWei() {
  const v = (process.env.OG_COMISION_ORIGEN || "").trim();
  if (!v) return 0n;
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return 0n;
  // Un tope de cordura: una comision de mas de 1 ORIGEN seria un dedazo, y a
  // 0,01 de precio serian mas de 1 centavo por movimiento.
  if (n > 1) {
    console.error(`[comision] OG_COMISION_ORIGEN=${v} es demasiado alta; se ignora`);
    return 0n;
  }
  return parseEther(String(n));
}

/**
 * Cobra la comision. Se llama DESPUES de que el envio del usuario ya salio.
 *
 * No lanza nunca: si falla, se anota y se sigue. Un fallo aqui no debe
 * convertir en error un envio que el usuario ya vio salir.
 *
 * @param wallet  el Wallet de ethers del usuario, ya conectado al proveedor
 * @param nonce   el nonce siguiente al del envio
 * @returns el hash del cobro, o null si no se cobro
 */
export async function cobrarComision(wallet, nonce) {
  const importe = comisionEnWei();
  if (importe === 0n) return null;

  const destino = DESTINO();
  if (!destino) {
    console.error("[comision] TREASURY_OG_ADDRESS no esta puesta: no se cobra");
    return null;
  }
  if (destino.toLowerCase() === wallet.address.toLowerCase()) return null;

  try {
    const tx = await wallet.sendTransaction({
      to: destino,
      value: importe,
      gasLimit: 21000n,
      gasPrice: await precioDeGas(wallet.provider),
      nonce,
    });
    return tx.hash;
  } catch (e) {
    // Lo mas probable es que no le alcance para la comision despues del envio.
    // Se anota con el usuario para poder reclamarla o perdonarla, y ya.
    console.error(`[comision] no se pudo cobrar a ${wallet.address}: ${e?.code || ""} ${e?.message || e}`);
    return null;
  }
}

/** Para mostrarla en la app y en los recibos. */
export function comisionEnOrigen() {
  const w = comisionEnWei();
  return w === 0n ? 0 : Number(w) / 1e18;
}
