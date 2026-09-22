/* Wallet bindings: la ruta técnica entre una cuenta SFSP y una dirección.
 *
 * Una cuenta puede tener varias rutas (pagos, custodia, liquidación,
 * interoperabilidad) y cada una tiene su propio estado y vigencia. Cambiar una
 * ruta no cambia el número de cuenta, y una ruta caducada o revocada no
 * resuelve.
 *
 * La carrera que este módulo cierra: alguien pide el destino de una cuenta,
 * arma la transacción, y entre medio el titular cambia su binding. Si el
 * ejecutor usa el destino viejo, el dinero va a una dirección que el titular ya
 * no reconoce. Por eso la resolución lleva versión y caducidad corta, y se
 * vuelve a validar en el momento de ejecutar. */

import type { WalletBinding, BindingStatus, BindingPurpose } from './tipos.js';
import { ErrorSFSP } from './codigos.js';

/* Transiciones permitidas. REVOKED es terminal a propósito: una ruta revocada
   no vuelve, se crea una nueva. Así el historial no miente. */
const TRANSICIONES: Record<BindingStatus, BindingStatus[]> = {
  PENDING: ['ACTIVE', 'REVOKED'],
  ACTIVE: ['PRIMARY', 'SUSPENDED', 'REVOKED', 'RECOVERY_PENDING'],
  PRIMARY: ['ACTIVE', 'SUSPENDED', 'REVOKED', 'RECOVERY_PENDING'],
  SUSPENDED: ['ACTIVE', 'REVOKED'],
  RECOVERY_PENDING: ['ACTIVE', 'REVOKED'],
  REVOKED: [],
};

export function transicionPermitida(desde: BindingStatus, hacia: BindingStatus): boolean {
  return (TRANSICIONES[desde] ?? []).includes(hacia);
}

export interface EventoDeBinding {
  bindingId: string;
  desde: BindingStatus;
  hacia: BindingStatus;
  version: number;
  actor: string;
  motivo: string;
  enISO: string;
}

/**
 * Aplica una transición. Devuelve el binding nuevo y el evento de historial.
 * El historial es inmutable: nunca se edita un evento anterior.
 */
export function transicionar(
  binding: WalletBinding,
  hacia: BindingStatus,
  actor: string,
  motivo: string,
  enISO: string = new Date().toISOString(),
): { binding: WalletBinding; evento: EventoDeBinding } {
  if (!transicionPermitida(binding.status, hacia)) {
    throw new ErrorSFSP(
      'DENY_ASSET_STATE',
      `transición no permitida de ${binding.status} a ${hacia}`,
    );
  }
  const nuevo: WalletBinding = { ...binding, status: hacia, version: binding.version + 1 };
  const evento: EventoDeBinding = {
    bindingId: binding.bindingId,
    desde: binding.status,
    hacia,
    version: nuevo.version,
    actor,
    motivo,
    enISO,
  };
  return { binding: nuevo, evento };
}

/**
 * Convierte una marca de tiempo a milisegundos, o falla.
 *
 * `Date.parse` devuelve NaN ante una fecha inválida, y NaN atraviesa en
 * silencio cualquier comparación: `NaN >= x` es false, así que una resolución
 * con una fecha corrupta pasaba el control de caducidad como si estuviera
 * vigente. Una fecha que no se entiende es una fuente que no se pudo leer, no
 * un permiso.
 */
function instante(valor: string, que: string): number {
  if (typeof valor !== 'string' || valor.length === 0) {
    throw new ErrorSFSP('UNKNOWN_SOURCE', `${que} ausente`);
  }
  const t = Date.parse(valor);
  if (Number.isNaN(t)) throw new ErrorSFSP('UNKNOWN_SOURCE', `${que} no es una fecha utilizable`);
  return t;
}

export function estaVigente(binding: WalletBinding, ahoraISO: string): boolean {
  if (binding.status !== 'ACTIVE' && binding.status !== 'PRIMARY') return false;
  const ahora = instante(ahoraISO, 'la hora actual');
  if (instante(binding.validFrom, 'el inicio de vigencia de la ruta') > ahora) return false;
  if (binding.validUntil !== null && instante(binding.validUntil, 'el fin de vigencia de la ruta') <= ahora) {
    return false;
  }
  return true;
}

/* Una resolución de destino: corta, versionada y revalidable.
 *
 * Lleva el destino ENTERO, no sólo un identificador, porque lo que se revalida
 * antes de ejecutar es a dónde va el dinero. Si sólo se comparase el
 * identificador de la ruta, alterar la dirección de la resolución pasaría
 * desapercibido. */
export interface ResolucionDeDestino {
  accountNumber: string;
  accountId: string;
  bindingId: string;
  chainId: number;
  address: string;
  purpose: BindingPurpose;
  version: number;
  emitidaEnISO: string;
  expiraEnISO: string;
}

export const TTL_RESOLUCION_MS = 60_000;

export function resolverDestino(
  accountNumber: string,
  binding: WalletBinding,
  ahoraISO: string = new Date().toISOString(),
  ttlMs: number = TTL_RESOLUCION_MS,
): ResolucionDeDestino {
  if (!estaVigente(binding, ahoraISO)) {
    throw new ErrorSFSP('DENY_ASSET_STATE', 'la ruta de destino no está vigente');
  }
  return {
    accountNumber,
    accountId: binding.accountId,
    bindingId: binding.bindingId,
    chainId: binding.chainId,
    address: binding.address,
    purpose: binding.purpose,
    version: binding.version,
    emitidaEnISO: ahoraISO,
    expiraEnISO: new Date(instante(ahoraISO, 'la hora de emisión') + ttlMs).toISOString(),
  };
}

const CAMPOS_DEL_DESTINO = [
  'accountId',
  'bindingId',
  'chainId',
  'address',
  'purpose',
  'version',
] as const;

/**
 * Revalida justo antes de ejecutar.
 *
 * Compara el destino COMPLETO, no sólo el identificador de la ruta: cuenta,
 * red, dirección, propósito y versión. La auditoría reprodujo que, comparando
 * sólo identificador y versión, una resolución con la dirección cambiada
 * pasaba el control, que es precisamente el caso en el que el dinero va a
 * parar a otro sitio.
 *
 * También valida las fechas antes de compararlas: una fecha corrupta ya no
 * atraviesa el control de caducidad convertida en NaN.
 */
export function revalidarDestino(
  resolucion: ResolucionDeDestino,
  bindingActual: WalletBinding,
  ahoraISO: string = new Date().toISOString(),
  numeroCuentaActual?: string,
): void {
  if (!resolucion || typeof resolucion !== 'object') {
    throw new ErrorSFSP('UNKNOWN_SOURCE', 'la resolución de destino no tiene forma utilizable');
  }
  for (const campo of CAMPOS_DEL_DESTINO) {
    if (resolucion[campo] === undefined || resolucion[campo] === null) {
      throw new ErrorSFSP('UNKNOWN_SOURCE', `la resolución no trae ${campo}`);
    }
  }

  const ahora = instante(ahoraISO, 'la hora actual');
  const expira = instante(resolucion.expiraEnISO, 'la caducidad de la resolución');
  const emitida = instante(resolucion.emitidaEnISO, 'la emisión de la resolución');
  if (emitida > ahora) {
    throw new ErrorSFSP('DENY_AUTHORIZATION', 'la resolución está fechada en el futuro');
  }
  if (ahora >= expira) {
    throw new ErrorSFSP('DENY_AUTHORIZATION', 'la resolución de destino caducó');
  }

  for (const campo of CAMPOS_DEL_DESTINO) {
    if (bindingActual[campo] !== resolucion[campo]) {
      throw new ErrorSFSP(
        'DENY_AUTHORIZATION',
        `el destino cambió después de resolverse: ${campo}`,
      );
    }
  }

  if (numeroCuentaActual !== undefined && numeroCuentaActual !== resolucion.accountNumber) {
    throw new ErrorSFSP('DENY_AUTHORIZATION', 'el número de cuenta del destino no coincide');
  }

  if (!estaVigente(bindingActual, ahoraISO)) {
    throw new ErrorSFSP('DENY_ASSET_STATE', 'la ruta dejó de estar vigente');
  }
}
