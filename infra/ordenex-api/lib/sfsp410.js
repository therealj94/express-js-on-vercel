// SFSP-410 · el adaptador de emisión bajo demanda.
//
// ══════════════════════════════════════════════════════════════════════════
// QUÉ CAMBIA
//
// Hoy el ORIGEN que se le entrega a alguien SALE DE UN INVENTARIO: una
// billetera de la casa que tiene ORIGEN guardado y lo transfiere. SFSP-410
// (sfsp/spec/SFSP-410-SUPPLY-POLICY.md §0, §4) dice que eso no puede existir:
// el circulante es lo que tienen los usuarios, y todo el ORIGEN que no es de
// usuarios vive sellado en la bóveda (`SFSPNativeVault`). Una entrega pasa a
// ser `releaseOnDemand` desde la bóveda, dentro del cupo que aprobó gobierno,
// ligada a la referencia del pago; una devolución es `absorb`.
//
// Para los tokens SFSP (AUKA, AGKA, ONDK…) es lo mismo con
// `SFSPIssuanceController.mintOnDemand`.
//
// ══════════════════════════════════════════════════════════════════════════
// EL INTERRUPTOR
//
// SFSP410_EMISION=1 lo enciende. Cualquier otro valor, o ninguno, lo deja
// APAGADO, y apagado este módulo no hace nada: quien lo llama sigue por su
// camino de siempre. Se lee en cada llamada, igual que COMPRAS en compra.js,
// para que apagarlo no exija reiniciar nada.
//
// ══════════════════════════════════════════════════════════════════════════
// LA REFERENCIA DEL PAGO (paymentRef)
//
// Es el identificador de operación en la cadena y SE GASTA: un mismo pago no
// puede entregar dos veces (regla R7, error OperationReplay). Tiene que ser:
//
//   · DETERMINISTA — el mismo pago da siempre la misma referencia, para que un
//     reintento choque contra la primera entrega y no haga una segunda;
//   · ÚNICA Y NUNCA REUSADA — dos pagos distintos no pueden compartirla, o el
//     segundo se daría por "ya entregado" sin haberse entregado.
//
// Formato canónico (texto UTF-8, sin espacios), y su hash:
//
//     SFSP410/v1|<sistema>|<tipo>|<id>
//     paymentRef = keccak256(utf8(canonica))
//
//   sistema  quién cobra:          ordenex | veta
//   tipo     qué se cobró:         compra-usdt | deposito-usdt | …
//   id       el identificador del REGISTRO DEL PAGO en su base: el _id de Mongo
//            de la orden (Ordenex) o del depósito (Veta). Es único por
//            construcción y no se recicla. NUNCA un monto, una dirección o un
//            rango de saldos: esos se repiten.
//
// Cada parte: [A-Za-z0-9._:-], 1 a 96 caracteres. Ejemplo:
//     SFSP410/v1|ordenex|compra-usdt|66f1c0ffee0000000000abcd
//
// ══════════════════════════════════════════════════════════════════════════
// LA EVIDENCIA (evidenceRoot)
//
// keccak256 del JSON canónico (claves ordenadas, sin espacios, todo en texto)
// de lo que prueba el pago: la tx del depósito, la red, la cantidad, el precio.
// Queda en el evento de la cadena y se puede recalcular desde la base.
//
// ══════════════════════════════════════════════════════════════════════════
// QUÉ PASA CUANDO LA CADENA DICE QUE NO
//
// Cada error del contrato se traduce a un código, un mensaje en castellano y
// UNA acción, que es lo que decide quien llama:
//
//   'ya-entregado'   OperationReplay: ese pago ya se entregó. No es un fallo:
//                    se lee el evento de la primera entrega y se devuelve su
//                    hash. Esto es lo que hace SEGURO reintentar.
//   'cola-gobierno'  cupo agotado, vencido, sin fijar, o monto por encima del
//                    máximo por operación; topes del instrumento. NO se
//                    reintenta en bucle: hace falta que gobierno amplíe el
//                    cupo, espere al periodo siguiente o libere con orden.
//   'esperar'        gobierno en pausa. Se retoma cuando levanten la pausa.
//   'rechazar'       el destino es una cuenta interna o los argumentos no
//                    valen. Definitivo para ESTE destino.
//   'revisar'        todo lo demás (destino no elegible, bóveda sin saldo,
//                    emisor sin rol, configuración): lo mira una persona.
//
// Y la duda: si la transacción se firmó y el nodo no contestó, NO se sabe si
// salió. Con paymentRef, reintentar es seguro (o entrega, o choca con la
// primera y la encuentra), pero no se hace solo: se devuelve 'en-duda' y quien
// llama decide cuándo.
//
// ══════════════════════════════════════════════════════════════════════════
// LA LLAVE DEL EMISOR
//
// SFSP410_ISSUER_KEY. Se lee perezosamente, en el momento de firmar, y JAMÁS
// se escribe en un log ni en un error: los errores nombran la VARIABLE, nunca
// el valor. Es una llave de servicio sin poder de aprobación (SFSP-410 §5): lo
// más que puede hacer si se compromete es agotar el cupo vigente hacia
// usuarios elegibles, y un solo firmante de gobierno puede cortarlo.
//
// Este archivo es EL MISMO en infra/ordenex-api/lib y en
// infra/veta-wallet-backend/lib. Si se toca uno, se toca el otro.

'use strict';

const {
  Contract, Interface, JsonRpcProvider, Wallet,
  getAddress, keccak256, toUtf8Bytes, encodeBytes32String, isHexString,
} = require('ethers');

const PREFIJO = 'SFSP410/v1';
const PARTE = /^[A-Za-z0-9._:-]{1,96}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const CERO32 = '0x' + '00'.repeat(32);

// ── ABIs: sólo lo que se usa, copiado de los artefactos compilados ──────────
// Las firmas de los errores tienen que ser EXACTAS (el selector sale de ellas):
// BudgetPeriodExceeded no es el mismo error en la bóveda que en el emisor.

const ERRORES_COMUNES = [
  'error OperationReplay(bytes32 operationId)',
  'error Paused()',
  'error BudgetInvalid(bytes32 reason)',
  'error Unauthorized(bytes32 role, address account)',
  'error Reentrancy()',
];

const VAULT_ABI = [
  ...ERRORES_COMUNES,
  'error BudgetNotSet(uint8 code)',
  'error BudgetExpired(uint64 validUntil)',
  'error BudgetPeriodExceeded(uint256 used, uint256 requested, uint256 perPeriod)',
  'error BudgetOperationTooLarge(uint256 requested, uint256 maxPerOperation)',
  'error ReleaseToInternalAccount(address destination)',
  'error ReleaseRejected(uint8 code, bytes32 reason)',
  'error InsufficientVaultBalance(uint256 balance, uint256 requested)',
  'error TransferFailed()',
  'event NativeReleased(bytes32 indexed assetId, address indexed destination, bytes32 indexed operationId, uint256 amount, bytes32 route, bytes32 evidenceRoot)',
  'event NativeAbsorbed(bytes32 indexed assetId, address indexed from, bytes32 indexed reasonCode, uint256 amount)',
  'function releaseOnDemand(address destination, uint256 amount, bytes32 paymentRef, bytes32 evidenceRoot)',
  'function absorb(bytes32 reasonCode) payable',
  'function isOperationUsed(bytes32 operationId) view returns (bool)',
  'function isInternalAccount(address account) view returns (bool)',
  'function budgetRemaining() view returns (uint256)',
  'function vaultBalance() view returns (uint256)',
  'function releaseBudget() view returns (tuple(uint256 perPeriod, uint64 period, uint256 maxPerOperation, uint64 validUntil, uint64 periodIndex, uint256 usedInPeriod))',
];

const ISSUANCE_ABI = [
  ...ERRORES_COMUNES,
  'error BudgetNotSet(bytes32 assetId, uint8 code)',
  'error BudgetExpired(bytes32 assetId, uint64 validUntil)',
  'error BudgetPeriodExceeded(bytes32 assetId, uint256 used, uint256 requested, uint256 perPeriod)',
  'error BudgetOperationTooLarge(bytes32 assetId, uint256 requested, uint256 maxPerOperation)',
  'error MintToInternalAccount(address destination)',
  'error PaymentReferenceRequired()',
  'error OutstandingLimitExceeded(uint256 outstanding, uint256 reserved, uint256 requested, uint256 limit)',
  'error CumulativeIssuanceCapExceeded(uint256 issued, uint256 requested, uint256 cap)',
  'error LimitsNotFixed(bytes32 assetId, uint8 code)',
  'error AssetMismatch(bytes32 expected, bytes32 got)',
  'error AssetContractUnknown(bytes32 assetId, uint8 code)',
  'event MintOnDemand(bytes32 indexed assetId, address indexed destination, bytes32 indexed paymentRef, uint256 amount, uint256 usedInPeriod, uint64 periodIndex)',
  'function mintOnDemand(bytes32 assetId, address destination, uint256 amount, bytes32 paymentRef, bytes32 evidenceRoot)',
  'function isInternalAccount(address account) view returns (bool)',
  'function budgetRemaining(bytes32 assetId) view returns (uint256)',
];

const IFACE_VAULT = new Interface(VAULT_ABI);
const IFACE_ISSUANCE = new Interface(ISSUANCE_ABI);

// ── Qué significa cada error, y qué hacer con él ────────────────────────────

const TRADUCCION = {
  OperationReplay: ['YA_ENTREGADO', 'ya-entregado', 'Ese pago ya se entregó: la referencia de pago ya está gastada en la cadena.'],
  BudgetPeriodExceeded: ['CUPO_AGOTADO', 'cola-gobierno', 'Se agotó el cupo de emisión de este periodo. Queda en la cola de gobierno: no se reintenta solo.'],
  BudgetOperationTooLarge: ['MONTO_SOBRE_CUPO', 'cola-gobierno', 'El monto supera el máximo por operación del cupo. Necesita una orden de gobierno fuera de cupo.'],
  BudgetNotSet: ['SIN_CUPO', 'cola-gobierno', 'No hay cupo de emisión aprobado para este activo (decisión pendiente de gobierno).'],
  BudgetExpired: ['CUPO_VENCIDO', 'cola-gobierno', 'El cupo de emisión venció. Gobierno tiene que aprobar uno nuevo.'],
  OutstandingLimitExceeded: ['TOPE_STOCK', 'cola-gobierno', 'La emisión superaría el tope de stock del instrumento.'],
  CumulativeIssuanceCapExceeded: ['TOPE_ACUMULADO', 'cola-gobierno', 'La emisión superaría el tope acumulado del instrumento.'],
  LimitsNotFixed: ['TOPES_SIN_FIJAR', 'cola-gobierno', 'El instrumento no tiene topes fijados (decisión pendiente de gobierno).'],
  Paused: ['PAUSADO', 'esperar', 'Gobierno tiene la emisión en pausa. Se retoma cuando se levante la pausa.'],
  MintToInternalAccount: ['DESTINO_INTERNO', 'rechazar', 'El destino es una cuenta interna de la organización: no se le puede emitir (SFSP-410 R1).'],
  ReleaseToInternalAccount: ['DESTINO_INTERNO', 'rechazar', 'El destino es una cuenta interna de la organización: no se le puede liberar ORIGEN (SFSP-410 R2).'],
  PaymentReferenceRequired: ['ARGUMENTO_INVALIDO', 'rechazar', 'Falta la referencia del pago.'],
  BudgetInvalid: ['ARGUMENTO_INVALIDO', 'rechazar', 'Argumentos inválidos para la emisión (monto cero o referencia vacía).'],
  ReleaseRejected: ['DESTINO_NO_ELEGIBLE', 'revisar', 'El destino no es elegible (usuario no verificado para este activo).'],
  InsufficientVaultBalance: ['BOVEDA_SIN_SALDO', 'revisar', 'La bóveda no tiene ORIGEN suficiente para esta liberación.'],
  TransferFailed: ['TRANSFERENCIA_FALLIDA', 'revisar', 'La bóveda no pudo transferir al destino.'],
  Unauthorized: ['EMISOR_SIN_ROL', 'revisar', 'La llave del emisor no tiene el rol ISSUER en el contrato.'],
  AssetMismatch: ['CONFIGURACION', 'revisar', 'El activo registrado en el emisor no coincide con el pedido.'],
  AssetContractUnknown: ['CONFIGURACION', 'revisar', 'El activo no tiene contrato registrado en el emisor.'],
  Reentrancy: ['REENTRADA', 'revisar', 'El contrato rechazó una reentrada.'],
};

function fallo(codigo, mensaje, extra = {}) {
  return Object.assign(new Error(mensaje), { codigo }, extra);
}

/** Marca "esto no llegó a firmarse": no hay nada en vuelo. */
function nuncaSalio(e) {
  if (e && typeof e === 'object') e.nuncaSalio = true;
  return e;
}

/** Busca los datos del revert en los sitios donde ethers v6 los deja. */
function datosDelRevert(e) {
  const candidatos = [
    e?.data, e?.info?.error?.data, e?.error?.data, e?.info?.error?.data?.data,
    e?.error?.error?.data, e?.revert?.data,
  ];
  for (const c of candidatos) {
    if (typeof c === 'string' && isHexString(c) && c.length >= 10) return c;
    if (c && typeof c === 'object' && typeof c.data === 'string' && isHexString(c.data)) return c.data;
  }
  return null;
}

/**
 * Traduce un error de la cadena a { codigo, accion, mensaje, error, args }.
 * Si no se reconoce, accion = 'revisar'. Nunca lanza.
 */
function traducirError(e, iface) {
  const datos = datosDelRevert(e);
  if (datos) {
    for (const i of [iface, IFACE_VAULT, IFACE_ISSUANCE].filter(Boolean)) {
      try {
        const p = i.parseError(datos);
        if (p) {
          const t = TRADUCCION[p.name] || ['REVERT_' + p.name.toUpperCase(), 'revisar', `La cadena rechazó la operación (${p.name}).`];
          return { codigo: t[0], accion: t[1], mensaje: t[2], error: p.name, args: p.args.map((a) => String(a)) };
        }
      } catch { /* otro contrato, se prueba el siguiente */ }
    }
  }
  // Revert sin datos que se entiendan, o un error que no es de la cadena.
  const texto = String(e?.shortMessage || e?.message || e);
  return { codigo: 'DESCONOCIDO', accion: 'revisar', mensaje: `La cadena rechazó la operación: ${texto}`, error: null, args: [] };
}

// ── Configuración (nombres de variables; los valores no se escriben nunca) ──

function activo() {
  return process.env.SFSP410_EMISION === '1';
}

function idsDeActivos() {
  const crudo = process.env.SFSP410_ASSET_IDS;
  if (!crudo) return {};
  let j;
  try { j = JSON.parse(crudo); } catch {
    throw nuncaSalio(fallo('SFSP410_CONFIG', 'SFSP410_ASSET_IDS no es JSON válido.'));
  }
  const out = {};
  for (const [s, v] of Object.entries(j || {})) {
    if (!BYTES32.test(String(v))) {
      throw nuncaSalio(fallo('SFSP410_CONFIG', `SFSP410_ASSET_IDS: el assetId de ${s} no es bytes32.`));
    }
    out[s] = String(v);
  }
  return out;
}

function direccionDe(variable) {
  const v = process.env[variable];
  if (!v) return null;
  try { return getAddress(String(v)); } catch {
    throw nuncaSalio(fallo('SFSP410_CONFIG', `${variable} no es una dirección válida.`));
  }
}

/** Qué está puesto, sin enseñar ningún valor secreto. Para /admin. */
function configuracion() {
  let ids = null; let idsError = null;
  try { ids = Object.keys(idsDeActivos()); } catch (e) { idsError = e.message; }
  let vault = null; let issuance = null; let dirError = null;
  try { vault = direccionDe('SFSP410_VAULT_ADDRESS'); issuance = direccionDe('SFSP410_ISSUANCE_ADDRESS'); } catch (e) { dirError = e.message; }
  return {
    encendido: activo(),
    vault,
    issuance,
    activos: ids,
    llaveEmisor: esLlave(process.env.SFSP410_ISSUER_KEY) ? 'puesta' : (process.env.SFSP410_ISSUER_KEY ? 'sin forma de llave' : 'falta'),
    chainIdEsperado: chainIdEsperado(),
    error: idsError || dirError || null,
  };
}

const esLlave = (t) => /^(0x)?[0-9a-fA-F]{64}$/.test(String(t || '').trim());

function chainIdEsperado() {
  const n = Number(process.env.SFSP410_CHAIN_ID || 5550);
  return Number.isInteger(n) && n > 0 ? n : 5550;
}

// ── La cadena ───────────────────────────────────────────────────────────────

let _proveedor = null; let _rpcDelProveedor = null;
function proveedor() {
  const rpc = process.env.SFSP410_RPC || process.env.OG_CHAIN_PROVIDER || 'https://rpc.ordenglobal-rpc.com';
  if (!_proveedor || _rpcDelProveedor !== rpc) {
    // cacheTimeout -1: sin caché de lecturas. Con la caché por omisión (250 ms)
    // dos envíos seguidos leían el MISMO nonce y el segundo rebotaba.
    _proveedor = new JsonRpcProvider(rpc, undefined, { cacheTimeout: -1 });
    _rpcDelProveedor = rpc;
  }
  return _proveedor;
}

function conPlazo(promesa, ms, que) {
  let t;
  return Promise.race([
    promesa,
    new Promise((_, rechaza) => {
      t = setTimeout(() => rechaza(fallo('SIN_RESPUESTA', `${que}: sin respuesta en ${ms}ms`)), ms);
      t.unref?.();
    }),
  ]).finally(() => clearTimeout(t));
}

/** Se niega a firmar en una cadena que no es la esperada. */
async function comprobarRed(p) {
  const red = await conPlazo(p.getNetwork(), 12000, 'chainId');
  const esperado = chainIdEsperado();
  if (Number(red.chainId) !== esperado) {
    throw nuncaSalio(fallo('SFSP410_RED',
      `La cadena conectada (${red.chainId}) no es la esperada (${esperado}). No se firma nada.`));
  }
}

/** La llave del emisor, leída en el momento. El valor no sale de aquí. */
function firmanteEmisor(p) {
  const crudo = String(process.env.SFSP410_ISSUER_KEY || '').trim();
  if (!esLlave(crudo)) {
    throw nuncaSalio(fallo('SFSP410_SIN_EMISOR', 'SFSP410_ISSUER_KEY no está puesta o no tiene forma de llave.'));
  }
  const w = new Wallet(crudo.startsWith('0x') ? crudo : `0x${crudo}`, p);
  const esperada = process.env.SFSP410_ISSUER_ADDRESS;
  if (esperada) {
    let e;
    try { e = getAddress(esperada); } catch { e = null; }
    if (e !== w.address) {
      throw nuncaSalio(fallo('SFSP410_SIN_EMISOR', 'SFSP410_ISSUER_KEY no deriva la dirección de SFSP410_ISSUER_ADDRESS.'));
    }
  }
  return w;
}

// Una sola cola para todo lo que firma el emisor: dos entregas simultáneas con
// el mismo nonce son una transacción perdida.
let cola = Promise.resolve();
function enCola(fn) {
  const tarea = cola.then(fn);
  cola = tarea.then(() => {}, () => {});
  return tarea;
}

// ── Referencia y evidencia ──────────────────────────────────────────────────

/** La referencia canónica de un pago, y su hash. Ver la cabecera. */
function referenciaDePago(sistema, tipo, id) {
  for (const [n, v] of [['sistema', sistema], ['tipo', tipo], ['id', id]]) {
    if (!PARTE.test(String(v ?? ''))) {
      throw nuncaSalio(fallo('REFERENCIA_INVALIDA', `La parte "${n}" de la referencia de pago no es válida.`));
    }
  }
  const canonica = `${PREFIJO}|${sistema}|${tipo}|${id}`;
  return { canonica, paymentRef: keccak256(toUtf8Bytes(canonica)) };
}

/** Acepta { canonica } / texto canónico / bytes32 ya calculado. */
function resolverReferencia(refPago) {
  if (refPago && typeof refPago === 'object' && refPago.paymentRef) {
    return resolverReferencia(refPago.canonica || refPago.paymentRef);
  }
  const t = String(refPago || '');
  if (BYTES32.test(t)) {
    if (t === CERO32) throw nuncaSalio(fallo('REFERENCIA_INVALIDA', 'La referencia de pago no puede ser cero.'));
    return { canonica: null, paymentRef: t.toLowerCase() };
  }
  const partes = t.split('|');
  if (partes.length !== 4 || partes[0] !== PREFIJO) {
    throw nuncaSalio(fallo('REFERENCIA_INVALIDA', `La referencia de pago tiene que tener la forma ${PREFIJO}|sistema|tipo|id.`));
  }
  return referenciaDePago(partes[1], partes[2], partes[3]);
}

function canonicoJson(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'bigint') return JSON.stringify(v.toString());
  if (Array.isArray(v)) return `[${v.map(canonicoJson).join(',')}]`;
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicoJson(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(String(v));
}

/** evidenceRoot: bytes32 tal cual, o keccak256 del JSON canónico. */
function raizDeEvidencia(evidencia) {
  if (typeof evidencia === 'string' && BYTES32.test(evidencia)) return evidencia;
  if (evidencia === null || evidencia === undefined) {
    throw nuncaSalio(fallo('EVIDENCIA_REQUERIDA', 'Toda emisión lleva su evidencia de pago.'));
  }
  return keccak256(toUtf8Bytes(canonicoJson(evidencia)));
}

function montoWei(monto) {
  let m;
  try { m = BigInt(String(monto)); } catch { m = -1n; }
  if (m <= 0n) throw nuncaSalio(fallo('MONTO_INVALIDO', 'El monto tiene que ser un entero positivo de unidades mínimas.'));
  return m;
}

// ── Leer la primera entrega (para el caso "ya entregado") ───────────────────

function desdeBloque() {
  const n = Number(process.env.SFSP410_DESDE_BLOQUE || 0);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

async function buscarEntrega(p, direccion, iface, evento, paymentRef) {
  const ev = iface.getEvent(evento);
  const logs = await conPlazo(p.getLogs({
    address: direccion,
    topics: [ev.topicHash, null, null, paymentRef],
    fromBlock: desdeBloque(),
    toBlock: 'latest',
  }), 20000, 'eventos');
  if (!logs.length) return null;
  const l = logs[0];
  const d = iface.parseLog(l);
  return {
    hash: l.transactionHash,
    bloque: l.blockNumber,
    destino: getAddress(d.args.destination),
    monto: d.args.amount.toString(),
  };
}

// ── Enviar, con la frontera de la duda en su sitio ──────────────────────────

/**
 * Llama a `metodo` como el emisor. Primero SIMULA (estimateGas): si revierte,
 * no se firmó nada y el error se traduce. Después firma; a partir de ahí, un
 * error sin rechazo explícito del nodo es DUDA.
 */
async function llamarComoEmisor({ direccion, iface, metodo, args, esperar }) {
  const p = proveedor();
  const w = firmanteEmisor(p);
  const c = new Contract(direccion, iface, w);

  let gas;
  try {
    await comprobarRed(p);
    gas = await conPlazo(c[metodo].estimateGas(...args), 15000, `${metodo} estimateGas`);
  } catch (e) {
    if (e.codigo === 'SFSP410_RED' || e.codigo === 'SFSP410_SIN_EMISOR') throw e;
    if (e.codigo === 'SIN_RESPUESTA' || e.code === 'NETWORK_ERROR' || e.code === 'TIMEOUT' || e.code === 'SERVER_ERROR') {
      throw nuncaSalio(fallo('SIN_RED', `No se pudo hablar con la cadena: ${e.message}`));
    }
    return { firmado: false, traduccion: traducirError(e, iface) };
  }

  let nonce;
  try {
    // El nonce, pedido crudo y contando lo pendiente: la cola ya serializa.
    nonce = Number(await conPlazo(p.send('eth_getTransactionCount', [w.address, 'pending']), 12000, 'nonce'));
  } catch (e) {
    throw nuncaSalio(fallo('SIN_RED', `No se pudo leer el nonce del emisor: ${e.message}`));
  }

  let tx;
  try {
    tx = await conPlazo(c[metodo](...args, { gasLimit: (gas * 130n) / 100n, nonce }), 20000, `${metodo} envío`);
  } catch (e) {
    const rechazo = ['INSUFFICIENT_FUNDS', 'NONCE_EXPIRED', 'REPLACEMENT_UNDERPRICED', 'INVALID_ARGUMENT', 'CALL_EXCEPTION', 'ACTION_REJECTED'];
    if (rechazo.includes(e.code)) {
      return { firmado: false, traduccion: traducirError(e, iface), rechazoNodo: e.code };
    }
    return { firmado: true, duda: true, error: e };
  }

  if (!esperar) return { firmado: true, hash: tx.hash };
  try {
    const r = await conPlazo(tx.wait(), 60000, 'minado');
    if (r && r.status === 1) return { firmado: true, hash: tx.hash, minado: true, bloque: r.blockNumber };
    return { firmado: true, hash: tx.hash, revertida: true };
  } catch (e) {
    if (e.code === 'CALL_EXCEPTION') return { firmado: true, hash: tx.hash, revertida: true };
    return { firmado: true, hash: tx.hash, duda: true, error: e };
  }
}

/**
 * El molde común de entregarOrigen y emitirToken.
 *
 * Devuelve SIEMPRE un objeto (no lanza por un "no" de la cadena):
 *   { ok: true,  estado: 'entregada',    hash, paymentRef, canonica }
 *   { ok: true,  estado: 'ya-entregado', hash, paymentRef, canonica, primera }
 *   { ok: false, estado: 'en-duda',      hash?, reintentable: true, … }
 *   { ok: false, estado: 'cola-gobierno' | 'esperar' | 'rechazada' | 'revisar',
 *     codigo, mensaje, error, args }
 * Lanza sólo antes de firmar (configuración, argumentos, red), con
 * `nuncaSalio = true`.
 */
async function operar({ direccion, iface, metodo, args, evento, ref, destino, monto, esperar }) {
  const p = proveedor();
  const leerPrimera = async () => {
    try { return await buscarEntrega(p, direccion, iface, evento, ref.paymentRef); } catch { return null; }
  };

  const r = await llamarComoEmisor({ direccion, iface, metodo, args, esperar });
  const base = { paymentRef: ref.paymentRef, canonica: ref.canonica };

  if (!r.firmado) {
    const t = r.traduccion;
    if (t.accion === 'ya-entregado') {
      const primera = await leerPrimera();
      const discrepancia = primera && (primera.destino !== destino || primera.monto !== String(monto))
        ? 'la primera entrega con esta referencia fue a otro destino o por otro monto: revisar' : null;
      return { ok: true, estado: 'ya-entregado', hash: primera?.hash || null, primera, discrepancia, ...base };
    }
    const estado = { 'cola-gobierno': 'cola-gobierno', esperar: 'esperar', rechazar: 'rechazada' }[t.accion] || 'revisar';
    return { ok: false, estado, codigo: t.codigo, mensaje: t.mensaje, error: t.error, args: t.args, ...base };
  }
  if (r.duda) {
    return {
      ok: false, estado: 'en-duda', hash: r.hash || null, reintentable: true,
      codigo: 'EN_DUDA',
      mensaje: 'La transacción se firmó y no hubo respuesta. Reintentar con la MISMA referencia es seguro: o entrega, o encuentra la primera.',
      ...base,
    };
  }
  if (r.revertida) {
    return {
      ok: false, estado: 'revisar', hash: r.hash, reintentable: true, codigo: 'REVERTIDA_AL_MINAR',
      mensaje: 'La transacción se minó revertida (probablemente otra operación consumió el cupo en el mismo bloque). Reintentar con la misma referencia es seguro.',
      ...base,
    };
  }
  return { ok: true, estado: 'entregada', hash: r.hash, minado: !!r.minado, ...base };
}

// ── La API ──────────────────────────────────────────────────────────────────

function exigirEncendido() {
  if (!activo()) throw nuncaSalio(fallo('SFSP410_APAGADO', 'La emisión bajo demanda (SFSP410_EMISION) está apagada.'));
}

/**
 * Entrega ORIGEN a un usuario: `SFSPNativeVault.releaseOnDemand`.
 * @param destino  dirección del usuario (nunca una cuenta interna)
 * @param monto    wei de ORIGEN (string | bigint)
 * @param refPago  texto canónico SFSP410/v1|… o el resultado de referenciaDePago
 * @param evidencia objeto (se hashea canónico) o bytes32
 * @param opciones { esperar: bool } — esperar el minado (por omisión, no)
 */
async function entregarOrigen(destino, monto, refPago, evidencia, opciones = {}) {
  exigirEncendido();
  const vault = direccionDe('SFSP410_VAULT_ADDRESS');
  if (!vault) throw nuncaSalio(fallo('SFSP410_CONFIG', 'SFSP410_VAULT_ADDRESS no está puesta.'));
  let d;
  try { d = getAddress(String(destino)); } catch {
    throw nuncaSalio(fallo('DESTINO_INVALIDO', 'La dirección de destino no es válida.'));
  }
  const m = montoWei(monto);
  const ref = resolverReferencia(refPago);
  const ev = raizDeEvidencia(evidencia);

  return enCola(() => operar({
    direccion: vault, iface: IFACE_VAULT, metodo: 'releaseOnDemand',
    args: [d, m, ref.paymentRef, ev], evento: 'NativeReleased',
    ref, destino: d, monto: m.toString(), esperar: !!opciones.esperar,
  }));
}

/**
 * Emite un token SFSP a un usuario: `SFSPIssuanceController.mintOnDemand`.
 * `simbolo` se traduce a assetId con SFSP410_ASSET_IDS.
 */
async function emitirToken(simbolo, destino, monto, refPago, evidencia, opciones = {}) {
  exigirEncendido();
  const issuance = direccionDe('SFSP410_ISSUANCE_ADDRESS');
  if (!issuance) throw nuncaSalio(fallo('SFSP410_CONFIG', 'SFSP410_ISSUANCE_ADDRESS no está puesta.'));
  const assetId = idsDeActivos()[simbolo];
  if (!assetId) throw nuncaSalio(fallo('SFSP410_CONFIG', `SFSP410_ASSET_IDS no tiene el assetId de ${simbolo}.`));
  let d;
  try { d = getAddress(String(destino)); } catch {
    throw nuncaSalio(fallo('DESTINO_INVALIDO', 'La dirección de destino no es válida.'));
  }
  const m = montoWei(monto);
  const ref = resolverReferencia(refPago);
  const ev = raizDeEvidencia(evidencia);

  return enCola(() => operar({
    direccion: issuance, iface: IFACE_ISSUANCE, metodo: 'mintOnDemand',
    args: [assetId, d, m, ref.paymentRef, ev], evento: 'MintOnDemand',
    ref, destino: d, monto: m.toString(), esperar: !!opciones.esperar,
  }));
}

/**
 * Devuelve ORIGEN a la bóveda: `SFSPNativeVault.absorb{value: monto}(motivo)`.
 *
 * Firma QUIEN DEVUELVE (el usuario que paga su recarga, o una cuenta interna
 * que consolida), no el emisor: `opciones.llave` es su llave privada. Si no se
 * da, firma el emisor (sólo tiene sentido para devolver su propio sobrante de
 * gas). La llave no se guarda ni se escribe en ningún sitio.
 *
 * Devuelve la TransactionResponse de ethers (con .hash y .wait()), igual que
 * un envío nativo, para que quien llama la trate como hasta ahora.
 * `motivo`: texto corto (≤31 bytes, p.ej. 'RECARGA_TARJETA') o bytes32.
 */
async function devolverOrigen(monto, motivo, opciones = {}) {
  exigirEncendido();
  const vault = direccionDe('SFSP410_VAULT_ADDRESS');
  if (!vault) throw nuncaSalio(fallo('SFSP410_CONFIG', 'SFSP410_VAULT_ADDRESS no está puesta.'));
  const m = montoWei(monto);
  let razon;
  try {
    razon = BYTES32.test(String(motivo)) ? String(motivo) : encodeBytes32String(String(motivo || ''));
  } catch {
    throw nuncaSalio(fallo('MOTIVO_INVALIDO', 'El motivo tiene que caber en 31 bytes.'));
  }
  if (razon === CERO32) throw nuncaSalio(fallo('MOTIVO_INVALIDO', 'Devolver a la bóveda exige un motivo.'));

  const p = proveedor();
  let w;
  if (opciones.llave) {
    if (!esLlave(opciones.llave)) throw nuncaSalio(fallo('LLAVE_INVALIDA', 'La llave de quien devuelve no tiene forma de llave.'));
    const k = String(opciones.llave).trim();
    w = new Wallet(k.startsWith('0x') ? k : `0x${k}`, p);
  } else {
    w = firmanteEmisor(p);
  }
  const c = new Contract(vault, IFACE_VAULT, w);
  let gas;
  try {
    await comprobarRed(p);
    gas = await conPlazo(c.absorb.estimateGas(razon, { value: m }), 15000, 'absorb estimateGas');
  } catch (e) {
    if (e.codigo) throw nuncaSalio(e);
    const t = traducirError(e, IFACE_VAULT);
    throw nuncaSalio(fallo(t.codigo === 'DESCONOCIDO' ? 'NO_SE_PUDO_DEVOLVER' : t.codigo, t.mensaje));
  }
  // De aquí en adelante puede haber transacción en vuelo: el error sube tal
  // cual, sin `nuncaSalio`, y quien llama lo trata como duda.
  return conPlazo(c.absorb(razon, { value: m, gasLimit: (gas * 130n) / 100n }), 20000, 'absorb envío');
}

/**
 * Lo que queda para entregar ORIGEN ahora mismo: el cupo del periodo, el
 * máximo por operación y el saldo de la bóveda. `{ ok:false }` si no se pudo
 * leer — y quien llama NO abre una orden a ciegas.
 */
async function capacidadOrigen() {
  try {
    const vault = direccionDe('SFSP410_VAULT_ADDRESS');
    if (!vault) return { ok: false, error: 'SFSP410_VAULT_ADDRESS no está puesta.' };
    const p = proveedor();
    await comprobarRed(p);
    const c = new Contract(vault, IFACE_VAULT, p);
    const [restante, saldo, cupo] = await Promise.all([
      conPlazo(c.budgetRemaining(), 12000, 'budgetRemaining'),
      conPlazo(c.vaultBalance(), 12000, 'vaultBalance'),
      conPlazo(c.releaseBudget(), 12000, 'releaseBudget'),
    ]);
    return {
      ok: true,
      restanteWei: restante.toString(),
      saldoBovedaWei: saldo.toString(),
      maxPorOperacionWei: cupo.maxPerOperation.toString(),
      venceEn: Number(cupo.validUntil),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** ¿La bóveda tiene esta dirección declarada como cuenta interna? */
async function esCuentaInterna(direccion) {
  const vault = direccionDe('SFSP410_VAULT_ADDRESS');
  if (!vault) return { ok: false, error: 'SFSP410_VAULT_ADDRESS no está puesta.' };
  try {
    const c = new Contract(vault, IFACE_VAULT, proveedor());
    return { ok: true, interna: await conPlazo(c.isInternalAccount(getAddress(direccion)), 12000, 'isInternalAccount') };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  activo,
  configuracion,
  referenciaDePago,
  raizDeEvidencia,
  entregarOrigen,
  emitirToken,
  devolverOrigen,
  capacidadOrigen,
  esCuentaInterna,
  traducirError,
  PREFIJO,
  _adentro: { resolverReferencia, canonicoJson, IFACE_VAULT, IFACE_ISSUANCE, TRADUCCION },
};
