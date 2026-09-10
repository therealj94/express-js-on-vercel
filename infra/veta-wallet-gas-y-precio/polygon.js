import { ethers } from "ethers";

// ============================================================
// El proveedor de Polygon, con varios sitios a los que ir.
//
// POR QUE EXISTE
//
// El 12-ago-2026 el backend llevaba horas repitiendo en el log:
//
//     JsonRpcProvider failed to detect network and cannot start up
//
// Los DOS sitios que conocia estaban caidos a la vez: el de Alchemy devolvia
// 429 --"rate-limited due to unusually high global traffic"-- y el respaldo
// que traia el codigo, `polygon-rpc.com`, contestaba "API key disabled, tenant
// disabled". Con los dos fuera, el vigilante de depositos de USDT reintentaba
// en bucle y ni la pasarela de entrada ni el fondeo de tarjeta podian
// funcionar. Nadie se entero hasta que alguien miro el log.
//
// El fallo de fondo no fue que un proveedor se cayera --eso pasa-- sino que
// habia UNO, con un respaldo escrito a mano que llevaba muerto quien sabe
// cuanto y que nadie habia vuelto a probar.
//
// COMO FUNCIONA
//
// Se prueban por orden hasta que uno conteste la cadena 137. El primero es
// siempre POLYGON_CHAIN_PROVIDER, para que se pueda poner uno de pago sin
// tocar codigo. El que responde se recuerda un rato, para no pagar el precio
// de la busqueda en cada llamada, y se vuelve a buscar si deja de contestar.
//
// Si NINGUNO contesta, esto lanza un error con un mensaje que se entiende, en
// vez de dejar a ethers reintentando en silencio para siempre.
// ============================================================

const CADENA = 137n;

const SITIOS = [
  process.env.POLYGON_CHAIN_PROVIDER,
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://polygon-rpc.com",
].filter(Boolean);

// Cuanto se reutiliza el proveedor que funciono, en milisegundos.
const VIGENCIA = 5 * 60 * 1000;

let recordado = null;
let recordadoHasta = 0;

async function sirve(url) {
  const p = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });
  const red = await Promise.race([
    p.getNetwork(),
    new Promise((_, no) => setTimeout(() => no(new Error("tardo demasiado")), 6000)),
  ]);
  if (red.chainId !== CADENA) {
    throw new Error(`sirve la cadena ${red.chainId}, no Polygon`);
  }
  return p;
}

/**
 * Devuelve un proveedor de Polygon que ha respondido hace un momento.
 * @throws si ninguno de los sitios conocidos contesta.
 */
export async function proveedorPolygon() {
  if (recordado && Date.now() < recordadoHasta) return recordado;

  const fallos = [];
  for (const url of SITIOS) {
    try {
      const p = await sirve(url);
      recordado = p;
      recordadoHasta = Date.now() + VIGENCIA;
      if (fallos.length) {
        console.warn(`[polygon] usando ${url}; fallaron: ${fallos.join(" | ")}`);
      }
      return p;
    } catch (e) {
      fallos.push(`${url}: ${e.message}`);
    }
  }

  recordado = null;
  const e = new Error(
    "Ningun proveedor de Polygon responde. Probados: " + fallos.join(" | ")
  );
  e.code = "POLYGON_SIN_PROVEEDOR";
  console.error("[polygon] " + e.message);
  throw e;
}

/** Para las pruebas y para forzar una nueva busqueda. */
export function olvidarProveedorPolygon() {
  recordado = null;
  recordadoHasta = 0;
}

export default proveedorPolygon;
