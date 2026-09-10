// Qué tiene de verdad una dirección en la cadena 5550.
//
// POR QUE EXISTE
//
// Porque hay una operación —borrar una cuenta— que no se puede hacer a ciegas.
// El registro de una cuenta guarda la dirección, la llave privada y la seed;
// borrar los datos personales y dejar a alguien fuera de una dirección donde
// todavía hay oro es una avería que la persona descubre el día que va a mirar
// su dinero, y para entonces ya nadie recuerda el borrado.
//
// La respuesta correcta a «¿tiene fondos?» no puede salir de la base de datos:
// la base sabe lo que el backend anotó, y en una cadena el saldo lo dice la
// cadena. Aquí se le pregunta a ella, y se le pregunta por TODO: el ORIGEN
// nativo y cada uno de los tokens del ecosistema.
//
// SI NO SE PUEDE PREGUNTAR, NO SE CONTESTA
//
// Ninguna función de aquí devuelve «cero» cuando el nodo no responde. Devuelve
// que no se pudo comprobar, y quien la llama tiene que negarse a seguir. Un
// cero por avería de red, en la puerta de un borrado, es exactamente la clase
// de dato tranquilizador y falso que hace perder el dinero de alguien.

import { JsonRpcProvider, Contract, formatEther, formatUnits } from "ethers";

const OG_RPC = process.env.OG_CHAIN_PROVIDER || "https://rpc.ordenglobal-rpc.com";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

// Los tokens del ecosistema sobre la 5550. Es la MISMA tabla que enseña la
// billetera en apps-web/veta-wallet/cadena.js: si se añade uno allí y no aquí,
// una cuenta con ese token pasaría por vacía.
/* LOS QUINCE, SIEMPRE, AUNQUE NO TODOS SE PUBLIQUEN.
 *
 * Desde el 20/08/2026 la billetera y Ordenex publican solo seis —ORIGEN, AUKA,
 * AGKA, ONDK, HARV e IBS— y los otros nueve llevan `publico: false` en
 * `apps-web/*\/cadena.js`. Esa decision es de VITRINA, no de lectura: aqui hay
 * que seguir leyendo los quince, porque quien tiene saldo de un despublicado
 * lo sigue viendo en su billetera y ese saldo sale de esta consulta.
 *
 * Borrar uno de esta lista le apaga el saldo a alguien. No es lo mismo que
 * dejar de publicarlo. */
export const TOKENS_5550 = [
  { simbolo: "AUKA", contrato: "0x6Facc8Df79cEDc6C5065442ce27e915Aa3a26B9B" },
  { simbolo: "AGKA", contrato: "0x961f798f998c7Ff44D47d62C7FA1B572eF187a4B" },
  { simbolo: "ONDK", contrato: "0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1" },
  { simbolo: "MNKA", contrato: "0x18b6680CFF71c11067bec312Fc48786bE2e54Ead" },
  { simbolo: "IBS", contrato: "0x7AF11D3E94A174f6fc290A5B7791A6DEE2718E62" },
  { simbolo: "HARV", contrato: "0x0fa04D11F28B28cbC9b98dd016F02023AdDb1923" },
  { simbolo: "AUBEX", contrato: "0xF1498640B27A66C0DC505093D70911C060e04fb0" },
  { simbolo: "ASL", contrato: "0x69846aC960D45F9946C613DFCe1b761D37Faf098" },
  { simbolo: "LOVE", contrato: "0x638F2ba0e3E1083D1ba570b449BD266F3860D164" },
  { simbolo: "REST", contrato: "0x1aC12Ebd7739003059d1E9EA2a4863C92D1505DD" },
  { simbolo: "SOL", contrato: "0xAAc6aE2E2037fC2e94d0b060792E7eB4E5fBfa66" },
  { simbolo: "AIT", contrato: "0xAE14Db486872AC07d74Ad69cC09590239b21BA2e" },
  { simbolo: "AGRO", contrato: "0x2A31ba919A5339fCB0F8aEeFfCE2c807B16007fe" },
  { simbolo: "POLITICAL", contrato: "0x92496E1848e001428A3495409a9A9f616bB6dD3B" },
];

/** Un tiempo máximo para cada consulta: un nodo lento no cuelga un borrado. */
function conPlazo(promesa, ms, que) {
  return Promise.race([
    promesa,
    new Promise((_, rechaza) => setTimeout(() => rechaza(new Error(`${que}: sin respuesta en ${ms}ms`)), ms)),
  ]);
}

/**
 * Todo lo que hay en una dirección, en la 5550.
 *
 * Devuelve `{ ok, saldos, vacia, error }`:
 *   ok=false  → NO se pudo comprobar. `vacia` viene en null, nunca en true.
 *   ok=true   → `saldos` lleva solo lo que tiene cantidad, y `vacia` dice si
 *               no tiene nada de nada.
 *
 * Los tokens se consultan a la vez, y el fallo de UNO invalida la respuesta
 * entera: si no se pudo leer el saldo de un token, no se sabe si la cuenta
 * está vacía — se sabe que no se sabe.
 */
export async function saldosDe(direccion) {
  let proveedor;
  try {
    proveedor = new JsonRpcProvider(OG_RPC, undefined, { staticNetwork: true });
  } catch (e) {
    return { ok: false, saldos: [], vacia: null, error: `no se pudo abrir el nodo: ${e.message}` };
  }

  const saldos = [];
  try {
    const nativo = await conPlazo(proveedor.getBalance(direccion), 12000, "ORIGEN nativo");
    if (nativo > 0n) saldos.push({ simbolo: "ORIGEN", cantidad: formatEther(nativo), bruto: nativo.toString() });

    const lecturas = await Promise.all(TOKENS_5550.map(async (t) => {
      const c = new Contract(t.contrato, ERC20_ABI, proveedor);
      const [bruto, decimales] = await Promise.all([
        conPlazo(c.balanceOf(direccion), 12000, t.simbolo),
        conPlazo(c.decimals(), 12000, `${t.simbolo} decimals`).catch(() => 18),
      ]);
      return { ...t, bruto, decimales };
    }));

    for (const l of lecturas) {
      if (l.bruto > 0n) {
        saldos.push({
          simbolo: l.simbolo,
          contrato: l.contrato,
          cantidad: formatUnits(l.bruto, Number(l.decimales)),
          bruto: l.bruto.toString(),
        });
      }
    }
  } catch (e) {
    // Ni un cero de consuelo: se dice que no se pudo mirar.
    return { ok: false, saldos: [], vacia: null, error: e.message };
  }

  return { ok: true, saldos, vacia: saldos.length === 0, error: null };
}

/**
 * ¿Se puede borrar esta cuenta?
 *
 * Es una función pura a propósito: sin base de datos, sin red y sin `res`. La
 * decisión de si el dinero de alguien está a salvo no puede estar enredada con
 * un manejador de Express, porque entonces solo se puede comprobar levantando
 * medio backend — y lo que no se comprueba fácil, no se comprueba.
 *
 * Devuelve `{ permitido, http, codigo, mensaje }` y quien la llama solo tiene
 * que obedecer.
 */
export function decidirBorrado({ user, saldo }) {
  if (!user) {
    return { permitido: false, http: 404, codigo: "NOT_FOUND", mensaje: "No hay ninguna cuenta con ese correo." };
  }
  if (user.deletedAt) {
    return { permitido: false, http: 409, codigo: "ALREADY_DELETED", mensaje: "La cuenta ya estaba eliminada." };
  }
  // Una cuenta de administrador no se borra por esta puerta: si alguien se hace
  // con una sesión de admin, que no pueda dejar el sistema sin administradores.
  if (user.role === "admin") {
    return { permitido: false, http: 409, codigo: "IS_ADMIN", mensaje: "Una cuenta de administrador no se borra por aquí." };
  }
  // Un nodo caído NO es una cuenta vacía. Esta rama es la razón de ser de todo
  // esto: sin ella, la primera avería de red borra una cuenta con oro dentro.
  if (!saldo || saldo.ok !== true) {
    return {
      permitido: false, http: 503, codigo: "NO_SE_PUDO_COMPROBAR",
      mensaje: "No se pudo consultar la cadena, así que no se borra nada. Probá de nuevo.",
    };
  }
  if (!saldo.vacia) {
    return {
      permitido: false, http: 409, codigo: "TIENE_FONDOS",
      mensaje: "La cuenta tiene fondos: no se borra. Vaciala primero.",
    };
  }
  return { permitido: true, http: 200, codigo: "OK", mensaje: "Se puede borrar: está vacía en la cadena." };
}
