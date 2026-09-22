/* Autorización ligada al contenido (SFSP-AUTH-v1).
 *
 * Este archivo es la otra mitad de `contracts/src/lib/SFSPAuthorization.sol`.
 * Las dos construyen el MISMO digest, y `fixtures/vectores-autorizacion.json`
 * existe para que una divergencia entre ambas rompa las dos suites a la vez.
 *
 * El porqué del archivo entero: la autorización se identificaba por una clave
 * débil —un `operationId`, un monto, un `migrationId`, un tipo de acción— que no
 * compromete el contenido de lo que se va a hacer. Con una clave así, una
 * aprobación legítima para un contenido habilita la ejecución de otro. La
 * corrección es que el aprobador apruebe un digest del contenido completo y que
 * el ejecutor lo RECALCULE desde sus argumentos reales.
 *
 * Modelo de error: toda frontera pública devuelve `Resultado<T>` (§4 del
 * contrato interno). No se lanza nada salvo defecto de programación; un `throw`
 * no capturado en un camino de dinero es una operación a medias. */

import { keccak256 } from './keccak.js';
import { permitir, negar, type Resultado } from './codigos.js';

/** Separación de dominio. Versionada: subir la versión invalida de golpe todas
 *  las aprobaciones emitidas bajo la anterior, que es lo que se quiere cuando
 *  cambia el formato. */
export const DOMINIO_AUTORIZACION = 'SFSP-AUTH-v1';

/** La cadena de tipo se hashea y entra en el digest junto con los valores: si
 *  algún día se añade un campo, el typehash cambia y ninguna aprobación vieja
 *  se puede reinterpretar contra el formato nuevo. Debe ser byte a byte igual a
 *  la de `SFSPAuthorization.PAYLOAD_TYPEHASH`. */
export const CADENA_TIPO_PAYLOAD =
  'SFSPAuthPayload(uint256 chainId,address verifyingContract,bytes32 action,bytes32 assetId,address origin,address destination,uint256 amount,uint256 amountSecondary,bytes32 nonce,uint64 notBefore,uint64 expiry,bytes32 evidenceRoot)';

/* Campos del §2.4 del contrato interno reducidos a palabras de 32 bytes.
 *
 * Los nombres están en inglés porque son los mismos del contrato interno y de
 * la estructura Solidity: un vector compartido no puede traducirse a mitad de
 * camino sin abrir la puerta a que los dos lados codifiquen campos distintos. */
export interface PayloadAutorizacion {
  /** Red en la que se ejecuta. Atar el digest a la red impide presentar en una
   *  cadena una aprobación emitida para otra. */
  readonly chainId: number | bigint;
  /** Contrato que ejecutará. Sin él, una aprobación serviría en cualquier
   *  contrato del mismo despliegue. */
  readonly verifyingContract: string;
  /** Acción: MINT, BURN, FORCED_TRANSFER, UNPAUSE, ... como bytes32. */
  readonly action: string;
  readonly assetId: string;
  /** Parte de origen. Puede ser la dirección cero cuando la acción no tiene
   *  origen (MINT crea unidades, no las mueve desde nadie). Ese cero también
   *  entra en el digest. */
  readonly origin: string;
  readonly destination: string;
  /** Entero en unidades base como cadena o bigint. Nunca `number`: un monto en
   *  coma flotante pierde precisión en silencio (§5). */
  readonly amount: string | bigint;
  /** Segunda pata de las acciones con dos montos (efectivo contra activo, el
   *  precio de una liquidación). 0 cuando la acción tiene un solo monto, y ese
   *  0 se compromete igual. */
  readonly amountSecondary: string | bigint;
  /** Distingue dos autorizaciones por lo demás idénticas. En cero, ambas
   *  colapsarían en el mismo digest y la segunda sería irrepresentable después
   *  de consumir la primera. */
  readonly nonce: string;
  /** Segundos Unix. */
  readonly notBefore: number;
  /** Segundos Unix. Exclusivo: en el segundo exacto de vencimiento ya no vale. */
  readonly expiry: number;
  /** Opcional. `null` o 32 bytes en cero significan «sin evidencia asociada».
   *  Al entrar en el digest deja de poder añadirse o quitarse después. */
  readonly evidenceRoot?: string | null;
}

const CERO32 = '0x' + '00'.repeat(64 / 2);
const HEX = /^0x[0-9a-fA-F]*$/;

/* ------------------------------------------------------------------ utilidades */

function esCadena(v: unknown): v is string {
  return typeof v === 'string';
}

function bytesDesdeHex(hex: string): Uint8Array {
  const cuerpo = hex.slice(2);
  const out = new Uint8Array(cuerpo.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(cuerpo.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function hexDesdeBytes(bytes: Uint8Array): string {
  let s = '0x';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/** bytes32 a partir de texto corto, con relleno a la derecha: el mismo
 *  `bytes32("MINT")` de Solidity. Se ofrece para construir vectores legibles;
 *  la forma canónica que viaja en los fixtures sigue siendo el hex completo. */
export function bytes32DeTexto(texto: string): Resultado<string> {
  const crudo = new TextEncoder().encode(texto);
  if (crudo.length > 32) return negar('DENY_POLICY', `no cabe en bytes32: ${texto}`);
  const palabra = new Uint8Array(32);
  palabra.set(crudo, 0);
  return permitir(hexDesdeBytes(palabra));
}

/** Normaliza un bytes32. Acepta sólo hex de 32 bytes exactos: admitir formas
 *  cortas y rellenarlas obligaría a elegir un lado de relleno, y esa elección
 *  tendría que coincidir con la del otro lenguaje sin que nada lo compruebe. */
function palabra32(valor: unknown, campo: string): Resultado<Uint8Array> {
  if (!esCadena(valor)) return negar('DENY_POLICY', `${campo}: se esperaba una cadena hex`);
  if (!HEX.test(valor)) return negar('DENY_POLICY', `${campo}: no es hex con prefijo 0x`);
  if (valor.length !== 66) return negar('DENY_POLICY', `${campo}: se esperaban 32 bytes exactos`);
  return permitir(bytesDesdeHex(valor.toLowerCase()));
}

/** Dirección de 20 bytes alineada a la derecha en una palabra de 32, igual que
 *  `abi.encode(address)`. No se valida el checksum EIP-55 aquí: el digest se
 *  calcula sobre los 20 bytes, y dos escrituras del mismo valor con mayúsculas
 *  distintas deben dar el mismo digest o los dos lados divergirían. */
function palabraDireccion(valor: unknown, campo: string): Resultado<Uint8Array> {
  if (!esCadena(valor)) return negar('DENY_POLICY', `${campo}: se esperaba una dirección`);
  if (!HEX.test(valor)) return negar('DENY_POLICY', `${campo}: no es hex con prefijo 0x`);
  if (valor.length !== 42) return negar('DENY_POLICY', `${campo}: se esperaban 20 bytes exactos`);
  const palabra = new Uint8Array(32);
  palabra.set(bytesDesdeHex(valor.toLowerCase()), 12);
  return permitir(palabra);
}

/** Entero sin signo en una palabra de 32 bytes, big-endian, como `abi.encode`. */
function palabraEntero(valor: unknown, campo: string, bits: number): Resultado<Uint8Array> {
  let n: bigint;
  if (typeof valor === 'bigint') {
    n = valor;
  } else if (typeof valor === 'number') {
    // Un `number` no entero o fuera del rango seguro habría perdido precisión
    // antes de llegar aquí; rechazarlo es más honesto que hashear un valor
    // que ya no es el que el llamador creía tener.
    if (!Number.isSafeInteger(valor)) return negar('DENY_POLICY', `${campo}: entero no representable`);
    n = BigInt(valor);
  } else if (esCadena(valor) && /^(0|[1-9][0-9]*)$/.test(valor)) {
    n = BigInt(valor);
  } else {
    return negar('DENY_POLICY', `${campo}: se esperaba un entero decimal sin signo`);
  }
  if (n < 0n) return negar('DENY_POLICY', `${campo}: negativo`);
  if (n >= 1n << BigInt(bits)) return negar('DENY_POLICY', `${campo}: no cabe en uint${bits}`);
  const palabra = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    palabra[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return permitir(palabra);
}

/* ------------------------------------------------------------------- codificación */

/** Constantes de dominio, calculadas una vez. Son las mismas que
 *  `SFSPAuthorization.DOMAIN_TAG` y `PAYLOAD_TYPEHASH`, y la prueba de vectores
 *  compartidos comprueba que efectivamente lo son. */
export const ETIQUETA_DOMINIO: string = hexDesdeBytes(
  keccak256(new TextEncoder().encode(DOMINIO_AUTORIZACION)),
);
export const TYPEHASH_PAYLOAD: string = hexDesdeBytes(
  keccak256(new TextEncoder().encode(CADENA_TIPO_PAYLOAD)),
);

/**
 * Codificación canónica: catorce palabras de 32 bytes, en orden fijo.
 *
 * Es el equivalente documentado de `abi.encode` en Solidity, y la razón de no
 * concatenar texto es concreta: una concatenación de campos de longitud
 * variable sin prefijo de longitud permite reagrupar dos payloads distintos en
 * la misma cadena de bytes y obtener el mismo digest. Aquí cada campo ocupa una
 * palabra, su posición es fija y la reagrupación es imposible por construcción.
 */
export function codificarPayload(p: PayloadAutorizacion): Resultado<Uint8Array> {
  const partes: Uint8Array[] = [];
  const empujar = (r: Resultado<Uint8Array>): string | null => {
    if (r.codigo !== 'ALLOW' || r.valor === null) return r.detalle;
    partes.push(r.valor);
    return null;
  };

  partes.push(bytesDesdeHex(ETIQUETA_DOMINIO));
  partes.push(bytesDesdeHex(TYPEHASH_PAYLOAD));

  const evidencia = p.evidenceRoot === undefined || p.evidenceRoot === null ? CERO32 : p.evidenceRoot;

  const fallos = [
    empujar(palabraEntero(p.chainId, 'chainId', 256)),
    empujar(palabraDireccion(p.verifyingContract, 'verifyingContract')),
    empujar(palabra32(p.action, 'action')),
    empujar(palabra32(p.assetId, 'assetId')),
    empujar(palabraDireccion(p.origin, 'origin')),
    empujar(palabraDireccion(p.destination, 'destination')),
    empujar(palabraEntero(p.amount, 'amount', 256)),
    empujar(palabraEntero(p.amountSecondary, 'amountSecondary', 256)),
    empujar(palabra32(p.nonce, 'nonce')),
    empujar(palabraEntero(p.notBefore, 'notBefore', 64)),
    empujar(palabraEntero(p.expiry, 'expiry', 64)),
    empujar(palabra32(evidencia, 'evidenceRoot')),
  ].filter((x): x is string => x !== null);

  if (fallos.length > 0) return negar('DENY_POLICY', `payload mal formado: ${fallos.join('; ')}`);

  const salida = new Uint8Array(partes.length * 32);
  partes.forEach((parte, i) => salida.set(parte, i * 32));
  return permitir(salida);
}

/** Digest canónico en hex con prefijo. Idéntico a `SFSPAuthorization.digestOf`. */
export function digestoDe(p: PayloadAutorizacion): Resultado<string> {
  const cod = codificarPayload(p);
  if (cod.codigo !== 'ALLOW' || cod.valor === null) return negar(cod.codigo as 'DENY_POLICY', cod.detalle);
  return permitir(hexDesdeBytes(keccak256(cod.valor)));
}

/* --------------------------------------------------------------- validaciones */

/**
 * Forma del payload, con independencia de dónde se ejecute.
 *
 * Se rechaza lo que hace absurda a la autorización: sin `action` no dice qué
 * autoriza, sin `assetId` no dice sobre qué, con `nonce` en cero dos
 * autorizaciones idénticas colapsarían en un digest, y una ventana vacía o
 * invertida describe una aprobación que nunca podrá ejecutarse. Aceptarla sólo
 * serviría para que algo imposible pareciera válido en un panel.
 */
export function validarPayload(p: PayloadAutorizacion): Resultado<string> {
  const digesto = digestoDe(p);
  if (digesto.codigo !== 'ALLOW') return digesto;

  if (p.action === CERO32) return negar('DENY_AUTHORIZATION', 'ACTION_EMPTY');
  if (p.assetId === CERO32) return negar('DENY_AUTHORIZATION', 'ASSET_EMPTY');
  if (p.nonce === CERO32) return negar('DENY_AUTHORIZATION', 'NONCE_EMPTY');
  if (!Number.isSafeInteger(p.notBefore) || !Number.isSafeInteger(p.expiry)) {
    return negar('DENY_AUTHORIZATION', 'WINDOW_MALFORMED');
  }
  if (p.expiry <= p.notBefore) return negar('DENY_AUTHORIZATION', 'WINDOW_EMPTY');

  return digesto;
}

/**
 * Atadura al lugar: red y contrato.
 *
 * El digest ata la autorización al contenido, pero sin esto no la ataría al
 * sitio: una aprobación emitida para otra red o para otro contrato del mismo
 * despliegue sería presentable aquí.
 */
export function validarAtadura(
  p: PayloadAutorizacion,
  chainId: number | bigint,
  contrato: string,
): Resultado<string> {
  const forma = validarPayload(p);
  if (forma.codigo !== 'ALLOW') return forma;
  if (BigInt(p.chainId) !== BigInt(chainId)) return negar('DENY_AUTHORIZATION', 'CHAIN_MISMATCH');
  if (!esCadena(contrato) || contrato.length !== 42) {
    return negar('DENY_AUTHORIZATION', 'CONTRACT_MALFORMED');
  }
  if (p.verifyingContract.toLowerCase() !== contrato.toLowerCase()) {
    return negar('DENY_AUTHORIZATION', 'CONTRACT_MISMATCH');
  }
  return forma;
}

/**
 * Vigencia contra un reloj explícito, en segundos Unix.
 *
 * El reloj se recibe como argumento y no se lee de `Date.now()` porque el lado
 * de cadena compara contra `block.timestamp`; una función que consultara el
 * reloj del proceso daría veredictos distintos a los del ejecutor real y no
 * sería comprobable con un vector fijo.
 */
export function validarVigencia(p: PayloadAutorizacion, ahoraSegundos: number): Resultado<string> {
  const forma = validarPayload(p);
  if (forma.codigo !== 'ALLOW') return forma;
  if (!Number.isSafeInteger(ahoraSegundos) || ahoraSegundos < 0) {
    // Un reloj ilegible no es un permiso ni un rechazo: es una fuente que no se
    // pudo leer, y nunca se degrada a ALLOW (§4).
    return negar('UNKNOWN_SOURCE', 'reloj no representable en segundos Unix');
  }
  if (ahoraSegundos < p.notBefore) return negar('DENY_AUTHORIZATION', 'NOT_YET_VALID');
  if (ahoraSegundos >= p.expiry) return negar('DENY_AUTHORIZATION', 'EXPIRED');
  return forma;
}

/* ------------------------------------------------------------ consumo único */

/**
 * Registro de consumo.
 *
 * La vigencia sola no basta: H19 es una aprobación de reanudación que sobrevive
 * a la pausa que levantó y sirve para el siguiente incidente. Un digest se gasta
 * una vez.
 *
 * Esta implementación es en memoria y es deliberadamente la más simple posible.
 * El adaptador durable que exige P01 tiene que llevar la MISMA invariante con un
 * índice único en la base: un registro que sólo viva en un proceso pierde la
 * invariante en cuanto haya dos.
 */
export interface RegistroConsumo {
  consumido(digest: string): boolean;
  consumir(digest: string, ahoraSegundos: number): Resultado<number>;
  consumidoEn(digest: string): number | null;
}

export function crearRegistroConsumo(): RegistroConsumo {
  const gastados = new Map<string, number>();
  const clave = (d: string): string => d.toLowerCase();
  return {
    consumido: (d) => gastados.has(clave(d)),
    consumidoEn: (d) => gastados.get(clave(d)) ?? null,
    consumir: (d, ahora) => {
      const k = clave(d);
      const previo = gastados.get(k);
      if (previo !== undefined) {
        return negar('DENY_AUTHORIZATION', `CONSUMED_AT:${previo}`);
      }
      gastados.set(k, ahora);
      return permitir(ahora);
    },
  };
}

/* ----------------------------------------------------------- camino ejecutor */

export interface EntornoEjecucion {
  readonly chainId: number | bigint;
  readonly contrato: string;
  readonly ahoraSegundos: number;
  readonly registro: RegistroConsumo;
}

/**
 * El único camino que deberían usar los ejecutores.
 *
 * `payloadReal` son los argumentos que de verdad se van a ejecutar, no los que
 * venían en la petición. El digest se RECALCULA desde ellos y se compara con el
 * aprobado: si el ejecutor se limitara a confiar en `digestAprobado`, volveríamos
 * a H01 con más ceremonia. Después forma, atadura y vigencia, y el consumo al
 * final, como efecto.
 */
export function autorizar(
  payloadReal: PayloadAutorizacion,
  digestAprobado: string,
  entorno: EntornoEjecucion,
): Resultado<string> {
  const recalculado = digestoDe(payloadReal);
  if (recalculado.codigo !== 'ALLOW' || recalculado.valor === null) return recalculado;

  if (!esCadena(digestAprobado) || digestAprobado.length !== 66 || !HEX.test(digestAprobado)) {
    return negar('DENY_AUTHORIZATION', 'APPROVED_DIGEST_MALFORMED');
  }
  if (recalculado.valor.toLowerCase() !== digestAprobado.toLowerCase()) {
    return negar('DENY_AUTHORIZATION', 'DIGEST_MISMATCH');
  }

  const atadura = validarAtadura(payloadReal, entorno.chainId, entorno.contrato);
  if (atadura.codigo !== 'ALLOW') return atadura;

  const vigencia = validarVigencia(payloadReal, entorno.ahoraSegundos);
  if (vigencia.codigo !== 'ALLOW') return vigencia;

  const consumo = entorno.registro.consumir(recalculado.valor, entorno.ahoraSegundos);
  if (consumo.codigo !== 'ALLOW') return negar('DENY_AUTHORIZATION', consumo.detalle);

  return permitir(recalculado.valor, 'autorización consumida');
}
