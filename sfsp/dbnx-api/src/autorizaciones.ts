// Emision y validacion del SignedAuthorization del §2.4 del contrato interno.
//
// ================= REGLA QUE NO SE NEGOCIA =================
// APROBAR UN CASO NO AUTORIZA EMITIR.
//
// La autorizacion es un objeto APARTE del expediente: tiene su propio alcance,
// monto, destino, vigencia, nonce y firmas. Un expediente APPROVED es condicion
// necesaria y no suficiente. POR QUE importa: el camino mas corto a una emision
// indebida es que alguien lea `case.estado === 'APPROVED'` y acuñe.
//
// Y del §2.4, literal: «Un JSON con `approved: true` no es una autorizacion».
// Esa comprobacion esta implementada y probada mas abajo.
// ===========================================================

import {
  esCantidadValida,
  esMarcaTiempoValida,
  fallo,
  ok,
  type MarcaTiempo,
  type Reloj,
  type Resultado,
} from './tipos.js';
import {
  comprobarFormaAprobacion,
  digestoCanonico,
  verificarQuorum,
  type AprobacionFirmada,
  type PayloadAutorizacionDBNX,
  type RegistroFirmantes,
} from './firmas.js';

/** Acciones que una autorizacion puede habilitar. Lista cerrada a proposito. */
export type ActionId =
  | 'MINT'
  | 'RELEASE'
  | 'RECOVERY'
  | 'MIGRATION_CLAIM';

/**
 * Una firma con su rol. Humanas y tecnicas quedan separadas por `rol`, y la
 * firma es una firma Ed25519 de verdad: el tipo vive en `firmas.ts` junto a su
 * verificador, para que no pueda existir una `Approval` sin un camino que la
 * compruebe. El antiguo campo `payloadDigest` sigue ahi y SE IGNORA (H03.1).
 */
export type Approval = AprobacionFirmada;

/** §2.4 del contrato interno, campo por campo. */
export interface SignedAuthorization {
  readonly schemaVersion: string;
  readonly authorizationId: string;
  readonly actionId: ActionId;
  readonly chainId: number;
  readonly genesisHash: string | null;
  readonly verifyingContract: string;
  readonly assetId: string;
  /** Entero en unidades base, como cadena. Nunca `number` (§5). */
  readonly amount: string;
  readonly destination: string;
  readonly policyVersion: string;
  readonly evidenceRoot: string;
  readonly nonce: string;
  readonly notBefore: MarcaTiempo;
  readonly expiry: MarcaTiempo;
  readonly approvals: readonly Approval[];
  /** Expediente del que nace. Referencia, NO sustituto de esta autorizacion. */
  readonly caseId: string;
  /**
   * Digest canonico DERIVADO, puesto por el emisor para que un panel pueda
   * mostrarlo. No es una entrada de confianza: `validarAutorizacion` lo
   * recalcula siempre desde los campos y NUNCA lee este. Si alguien lo sustituye
   * por `no-es-el-hash`, la validacion da exactamente el mismo veredicto, y hay
   * una prueba que lo exige.
   */
  readonly payloadDigest: string;
}

/** Lo que el ejecutor pide hacer, y que debe coincidir con la autorizacion. */
export interface PeticionUso {
  readonly actionId: ActionId;
  readonly chainId: number;
  readonly assetId: string;
  readonly amount: string;
  readonly destination: string;
  readonly verifyingContract: string;
}

export interface EntradaEmision {
  readonly authorizationId: string;
  readonly actionId: ActionId;
  readonly chainId: number;
  readonly genesisHash: string | null;
  readonly verifyingContract: string;
  readonly assetId: string;
  readonly amount: string;
  readonly destination: string;
  readonly policyVersion: string;
  readonly evidenceRoot: string;
  readonly nonce: string;
  readonly notBefore: MarcaTiempo;
  readonly expiry: MarcaTiempo;
  readonly approvals: readonly Approval[];
  readonly caseId: string;
  /** Estado del expediente en el momento de emitir. Debe ser APPROVED. */
  readonly estadoCaso: string;
}

export const SCHEMA_VERSION_AUTORIZACION = 'draft-0.3';

// El minimo de firmas —una humana de COMITE y una tecnica de CUMPLIMIENTO o
// SISTEMA, de actores DISTINTOS— lo impone `verificarQuorum` en `firmas.ts`,
// junto con la verificacion criptografica. Estaban separados y por eso se podia
// cumplir el reparto de roles sin que ninguna firma fuese real.

export function emitirAutorizacion(
  entrada: EntradaEmision,
  registro: RegistroFirmantes,
  reloj: Reloj,
): Resultado<SignedAuthorization> {
  if (entrada.estadoCaso !== 'APPROVED') {
    return fallo(
      'DENY_AUTHORIZATION',
      'el expediente no esta APPROVED: no puede nacer una autorizacion',
      { estadoCaso: entrada.estadoCaso },
    );
  }
  if (!/^auth_[0-9a-f]{32}$/.test(entrada.authorizationId)) {
    return fallo('DENY_POLICY', 'authorizationId no cumple auth_ + 32 hex');
  }
  if (!esCantidadValida(entrada.amount)) {
    // Un monto que no es entero en cadena no se redondea ni se convierte:
    // se rechaza. §5 prohibe coma flotante en cantidades.
    return fallo('DENY_LIMIT', 'amount no es un entero en unidades base', {
      amount: String(entrada.amount),
    });
  }
  if (entrada.amount === '0') {
    return fallo('DENY_LIMIT', 'una autorizacion de monto cero no tiene efecto');
  }
  if (
    !esMarcaTiempoValida(entrada.notBefore) ||
    !esMarcaTiempoValida(entrada.expiry)
  ) {
    return fallo('DENY_AUTHORIZATION', 'vigencia con marcas de tiempo invalidas');
  }
  if (Date.parse(entrada.expiry) <= Date.parse(entrada.notBefore)) {
    return fallo('DENY_AUTHORIZATION', 'expiry no es posterior a notBefore');
  }
  if (typeof entrada.nonce !== 'string' || entrada.nonce.trim() === '') {
    // Sin nonce no hay consumo unico posible: la autorizacion seria reusable.
    return fallo('DENY_AUTHORIZATION', 'falta el nonce');
  }
  if (typeof entrada.evidenceRoot !== 'string' || entrada.evidenceRoot === '') {
    return fallo('DENY_AUTHORIZATION', 'falta evidenceRoot');
  }
  if (typeof entrada.policyVersion !== 'string' || entrada.policyVersion === '') {
    // POR QUE bloquea y no asume una version: elegir una politica por defecto es
    // inventar un parametro operativo no aprobado.
    return fallo('BLOCKED_DECISION', 'falta policyVersion: no se elige por defecto');
  }

  // El digest lo calcula EL EMISOR a partir de los campos que acaba de validar,
  // no lo aporta ningun firmante. §2.4: «La aprobacion humana y la validacion
  // tecnica deben coincidir exactamente en este payload» — y coincidir se
  // comprueba verificando las dos firmas contra ESTE digest, no comparando entre
  // si dos cadenas que los firmantes eligieron.
  const payload: PayloadAutorizacionDBNX = {
    schemaVersion: SCHEMA_VERSION_AUTORIZACION,
    authorizationId: entrada.authorizationId,
    actionId: entrada.actionId,
    chainId: entrada.chainId,
    genesisHash: entrada.genesisHash,
    verifyingContract: entrada.verifyingContract,
    assetId: entrada.assetId,
    amount: entrada.amount,
    destination: entrada.destination,
    policyVersion: entrada.policyVersion,
    evidenceRoot: entrada.evidenceRoot,
    nonce: entrada.nonce,
    notBefore: entrada.notBefore,
    expiry: entrada.expiry,
    caseId: entrada.caseId,
  };
  const digest = digestoCanonico(payload);

  const quorum = verificarQuorum(digest, entrada.approvals, registro, reloj.ahora());
  if (!quorum.ok) return quorum;

  return ok({
    schemaVersion: SCHEMA_VERSION_AUTORIZACION,
    authorizationId: entrada.authorizationId,
    actionId: entrada.actionId,
    chainId: entrada.chainId,
    genesisHash: entrada.genesisHash,
    verifyingContract: entrada.verifyingContract,
    assetId: entrada.assetId,
    amount: entrada.amount,
    destination: entrada.destination,
    policyVersion: entrada.policyVersion,
    evidenceRoot: entrada.evidenceRoot,
    nonce: entrada.nonce,
    notBefore: entrada.notBefore,
    expiry: entrada.expiry,
    approvals: [...entrada.approvals],
    caseId: entrada.caseId,
    payloadDigest: digest,
  });
}

/**
 * Registro de nonces consumidos. Interfaz: en produccion es una tabla con
 * restriccion de unicidad; aqui, un conjunto en memoria. No se escribe cliente.
 */
export interface RegistroConsumo {
  yaConsumido(chainId: number, nonce: string): boolean;
  marcarConsumido(chainId: number, nonce: string): void;
}

export class ConsumoEnMemoria implements RegistroConsumo {
  private readonly usados = new Set<string>();
  public yaConsumido(chainId: number, nonce: string): boolean {
    return this.usados.has(`${chainId}|${nonce}`);
  }
  public marcarConsumido(chainId: number, nonce: string): void {
    this.usados.add(`${chainId}|${nonce}`);
  }
}

/**
 * Valida una autorizacion contra una peticion concreta, en un instante concreto.
 * NO consume: consumir es un paso aparte (`consumir`), para que el ejecutor
 * pueda validar en seco antes de comprometerse.
 */
export function validarAutorizacion(
  autorizacion: unknown,
  peticion: PeticionUso,
  reloj: Reloj,
  consumo: RegistroConsumo,
  registro: RegistroFirmantes,
): Resultado<SignedAuthorization> {
  // Paso 0: ¿esto tiene forma de autorizacion? Un objeto arbitrario con
  // `approved: true` cae aqui y no pasa de aqui.
  const forma = comprobarForma(autorizacion);
  if (!forma.ok) return forma;
  const a = forma.valor;

  if (a.schemaVersion !== SCHEMA_VERSION_AUTORIZACION) {
    return fallo('DENY_AUTHORIZATION', 'schemaVersion desconocida', {
      schemaVersion: a.schemaVersion,
    });
  }

  const ahora = reloj.ahora();
  if (!esMarcaTiempoValida(ahora)) {
    return fallo('UNKNOWN_SOURCE', 'el reloj no devolvio una marca utilizable');
  }
  const t = Date.parse(ahora);
  if (t < Date.parse(a.notBefore)) {
    return fallo('DENY_AUTHORIZATION', 'la autorizacion todavia no es vigente', {
      notBefore: a.notBefore,
      ahora,
    });
  }
  if (t >= Date.parse(a.expiry)) {
    return fallo('DENY_AUTHORIZATION', 'la autorizacion esta vencida', {
      expiry: a.expiry,
      ahora,
    });
  }

  // Firmas. El digest se RECALCULA aqui desde los campos de la autorizacion que
  // se esta presentando: si el validador se fiara de `a.payloadDigest`, quien
  // presenta la autorizacion elegiria sobre que se firmo, que es H03 con mas
  // ceremonia. Y se re-verifica en CADA presentacion, no solo al emitir, porque
  // entre la emision y el uso un firmante puede haber sido revocado.
  const quorum = verificarQuorum(
    digestoCanonico({
      schemaVersion: a.schemaVersion,
      authorizationId: a.authorizationId,
      actionId: a.actionId,
      chainId: a.chainId,
      genesisHash: a.genesisHash,
      verifyingContract: a.verifyingContract,
      assetId: a.assetId,
      amount: a.amount,
      destination: a.destination,
      policyVersion: a.policyVersion,
      evidenceRoot: a.evidenceRoot,
      nonce: a.nonce,
      notBefore: a.notBefore,
      expiry: a.expiry,
      caseId: a.caseId,
    }),
    a.approvals,
    registro,
    ahora,
  );
  if (!quorum.ok) return quorum;

  if (consumo.yaConsumido(a.chainId, a.nonce)) {
    // Consumo unico: reusar una autorizacion vigente es el mismo riesgo que
    // usar una vencida, por eso comparte codigo DENY_AUTHORIZATION.
    return fallo('DENY_AUTHORIZATION', 'el nonce ya fue consumido', {
      nonce: a.nonce,
    });
  }

  // Alcance: cada campo se compara por separado para poder decir cual falla.
  if (a.actionId !== peticion.actionId) {
    return fallo('DENY_AUTHORIZATION', 'la accion pedida no es la autorizada', {
      autorizada: a.actionId,
      pedida: peticion.actionId,
    });
  }
  if (a.chainId !== peticion.chainId) {
    return fallo('DENY_AUTHORIZATION', 'la cadena no coincide', {
      autorizada: a.chainId,
      pedida: peticion.chainId,
    });
  }
  if (a.verifyingContract !== peticion.verifyingContract) {
    return fallo('DENY_AUTHORIZATION', 'el contrato verificador no coincide');
  }
  if (a.assetId !== peticion.assetId) {
    return fallo('DENY_AUTHORIZATION', 'el activo no coincide', {
      autorizado: a.assetId,
      pedido: peticion.assetId,
    });
  }
  if (a.destination !== peticion.destination) {
    // POR QUE es rechazo y no advertencia: cambiar el destino de una emision es
    // desviar valor, aunque el monto sea el aprobado.
    return fallo('DENY_AUTHORIZATION', 'el destino no coincide con el autorizado', {
      autorizado: a.destination,
      pedido: peticion.destination,
    });
  }
  if (!esCantidadValida(peticion.amount)) {
    return fallo('DENY_LIMIT', 'el monto pedido no es un entero en unidades base');
  }
  if (BigInt(peticion.amount) > BigInt(a.amount)) {
    return fallo('DENY_LIMIT', 'el monto pedido supera el autorizado', {
      autorizado: a.amount,
      pedido: peticion.amount,
    });
  }
  if (BigInt(peticion.amount) !== BigInt(a.amount)) {
    // Monto distinto al aprobado, aunque sea menor: se rechaza. Una autorizacion
    // no es un cupo parcial; si hace falta emitir menos, se emite otra.
    return fallo('DENY_AUTHORIZATION', 'el monto pedido no es exactamente el autorizado', {
      autorizado: a.amount,
      pedido: peticion.amount,
    });
  }

  return ok(a);
}

/** Valida y, si pasa, marca el nonce como consumido. Idempotencia por nonce. */
export function consumir(
  autorizacion: unknown,
  peticion: PeticionUso,
  reloj: Reloj,
  consumo: RegistroConsumo,
  registro: RegistroFirmantes,
): Resultado<SignedAuthorization> {
  const r = validarAutorizacion(autorizacion, peticion, reloj, consumo, registro);
  if (!r.ok) return r;
  consumo.marcarConsumido(r.valor.chainId, r.valor.nonce);
  return r;
}

/**
 * Comprueba la forma estructural. Aqui es donde muere `{ approved: true }`:
 * no tiene `schemaVersion`, ni `nonce`, ni `approvals`, ni vigencia. No existe
 * ninguna ruta por la que un booleano se convierta en permiso de emision.
 */
function comprobarForma(v: unknown): Resultado<SignedAuthorization> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    return fallo('DENY_AUTHORIZATION', 'la autorizacion no es un objeto');
  }
  const o = v as Record<string, unknown>;

  // Guarda explicita y nombrada: un payload de "aprobacion" no es autorizacion.
  if ('approved' in o) {
    return fallo(
      'DENY_AUTHORIZATION',
      'un objeto con `approved` no es una autorizacion firmada (§2.4)',
    );
  }

  const cadenas = [
    'schemaVersion',
    'authorizationId',
    'actionId',
    'verifyingContract',
    'assetId',
    'amount',
    'destination',
    'policyVersion',
    'evidenceRoot',
    'nonce',
    'notBefore',
    'expiry',
    'caseId',
  ];
  for (const c of cadenas) {
    if (typeof o[c] !== 'string' || (o[c] as string) === '') {
      return fallo('DENY_AUTHORIZATION', `falta o es invalido el campo ${c}`);
    }
  }
  if (typeof o['chainId'] !== 'number' || !Number.isInteger(o['chainId'])) {
    return fallo('DENY_AUTHORIZATION', 'chainId invalido');
  }
  if (o['genesisHash'] !== null && typeof o['genesisHash'] !== 'string') {
    return fallo('DENY_AUTHORIZATION', 'genesisHash invalido: se espera cadena o null');
  }
  if (!Array.isArray(o['approvals']) || (o['approvals'] as unknown[]).length === 0) {
    return fallo('DENY_AUTHORIZATION', 'no hay firmas');
  }
  // La forma de CADA aprobacion, antes que nada. Aqui muere `approvals: [{}]`,
  // la primera prueba de concepto del auditor: un arreglo de objetos vacios no
  // es una lista de aprobaciones, y no debe llegar siquiera a la criptografia.
  for (const cruda of o['approvals'] as unknown[]) {
    const f = comprobarFormaAprobacion(cruda);
    if (!f.ok) return f;
  }
  if (!esCantidadValida(o['amount'])) {
    return fallo('DENY_LIMIT', 'amount no es un entero en unidades base');
  }
  if (
    !esMarcaTiempoValida(o['notBefore']) ||
    !esMarcaTiempoValida(o['expiry'])
  ) {
    return fallo('DENY_AUTHORIZATION', 'vigencia invalida');
  }
  return ok(o as unknown as SignedAuthorization);
}
