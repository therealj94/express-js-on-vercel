// ¿Esta dirección es una cuenta normal, o le pusieron código encima?
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EXISTE ESTE ARCHIVO — EL ROBO DEL 4 DE SEPTIEMBRE
//
// Se robaron 15 USDT de la billetera de gas anterior, un bloque después de
// que llegaran. Durante horas se buscó una llave filtrada: se derivaron las
// 1.343 cadenas de 64 hex de todo el historial del repositorio y ninguna daba
// esa dirección. No había filtración porque no hacía falta ninguna.
//
// Lo que había era una DELEGACIÓN EIP-7702. Desde el fork de Praga una cuenta
// normal puede firmar una autorización —UNA firma, sin transacción, sin gas—
// que le pone encima el código de un contrato. La cuenta sigue siendo suya y
// su llave sigue funcionando, pero además ejecuta código ajeno.
//
// La billetera vieja tenía dos, puestas así:
//
//   Polygon → un contrato «Forwarder» de 550 caracteres cuyo receive() manda
//             todo lo que entre a 0xEc0Bcf45…74Dc9, un cobrador con más de
//             208.000 transacciones.
//   BSC     → otro drenador que apunta a 0x40211616…9E2C, que es exactamente
//             la dirección que se llevó los 15 USDT.
//
// Por eso el barrido fue instantáneo: no hubo bot compitiendo por llegar
// primero. El desvío ocurre DENTRO de la misma transacción del depósito.
// Mandar dinero a una dirección delegada es regalarlo, y no hay reintento,
// ni bloqueo, ni ventana para reaccionar.
//
// La firma que instala esto es la que piden las páginas de «reclamá tu
// airdrop» y los falsos permisos de MetaMask. No parece una transferencia.
//
// ══════════════════════════════════════════════════════════════════════════
// PARA QUÉ SE USA AQUÍ
//
// El fondeo de gas manda monedas nativas a direcciones de depósito que este
// sistema deriva de su propia semilla. Esas direcciones NACEN limpias — nadie
// firma nunca con ellas fuera de aquí — así que si una tiene código encima,
// algo pasó que no puede pasar: o la semilla no es la que creemos, o alguien
// firmó una autorización con ella. En los dos casos la respuesta es la misma
// y es no mandar nada.
//
// Es una comprobación barata: una llamada de lectura antes de firmar.

const PREFIJO = '0xef0100'; // EIP-7702: 0xef0100 ++ 20 bytes de dirección
const LARGO_DELEGACION = 2 + 2 * 23; // '0x' + 3 bytes de prefijo + 20 de dirección

/**
 * Lee un `eth_getCode` y dice qué es.
 * @returns {{limpia:boolean, tipo:'cuenta'|'delegacion'|'contrato', delegado:string|null}}
 */
function leer(codigo) {
  const c = String(codigo || '0x').toLowerCase();
  if (c === '0x' || c === '') return { limpia: true, tipo: 'cuenta', delegado: null };
  if (c.length === LARGO_DELEGACION && c.startsWith(PREFIJO)) {
    return { limpia: false, tipo: 'delegacion', delegado: `0x${c.slice(PREFIJO.length)}` };
  }
  return { limpia: false, tipo: 'contrato', delegado: null };
}

/** Cómo se le explica a una persona lo que se encontró. */
function motivo(l, direccion) {
  if (l.tipo === 'delegacion') {
    return `${direccion} tiene una delegación EIP-7702 hacia ${l.delegado}: lo que entre puede salir en la misma transacción`;
  }
  if (l.tipo === 'contrato') {
    return `${direccion} no es una cuenta normal, tiene código de contrato`;
  }
  return null;
}

// Memoria corta. Una delegación se pone y se quita con una firma, así que no
// se puede recordar mucho rato; pero dentro de una vuelta del barrido no hace
// falta preguntar dos veces por la misma dirección.
const PLAZO_MEMORIA_MS = 30_000;
const memoria = new Map();

/**
 * Mira la cadena. Devuelve lo mismo que `leer`, más `ok` (se pudo preguntar).
 *
 * Si el nodo no contesta NO se inventa que está limpia: `ok:false`. Quien
 * llame decide, y en el fondeo de gas la decisión es no mandar — una lectura
 * que falla no es un permiso.
 */
async function de(proveedor, direccion, { ahora = Date.now() } = {}) {
  const clave = `${proveedor && proveedor._red ? proveedor._red : ''}|${String(direccion).toLowerCase()}`;
  const guardado = memoria.get(clave);
  if (guardado && ahora - guardado.cuando < PLAZO_MEMORIA_MS) return guardado.dato;

  let codigo;
  try {
    codigo = await proveedor.getCode(direccion);
  } catch (e) {
    return { ok: false, limpia: false, tipo: null, delegado: null, error: e.message };
  }
  const dato = { ok: true, ...leer(codigo) };
  memoria.set(clave, { cuando: ahora, dato });
  return dato;
}

const olvidar = () => memoria.clear();

module.exports = { leer, motivo, de, PREFIJO, _adentro: { olvidar, memoria, PLAZO_MEMORIA_MS } };
