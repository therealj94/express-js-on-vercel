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

import type { WalletBinding, BindingStatus } from './tipos.js';
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

export function estaVigente(binding: WalletBinding, ahoraISO: string): boolean {
  if (binding.status !== 'ACTIVE' && binding.status !== 'PRIMARY') return false;
  const ahora = Date.parse(ahoraISO);
  if (Number.isNaN(ahora)) throw new ErrorSFSP('DENY_POLICY', 'fecha inválida');
  if (Date.parse(binding.validFrom) > ahora) return false;
  if (binding.validUntil !== null && Date.parse(binding.validUntil) <= ahora) return false;
  return true;
}

/* Una resolución firmada de destino: corta, versionada y revalidable. */
export interface ResolucionDeDestino {
  accountNumber: string;
  bindingId: string;
  chainId: number;
  address: string;
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
    bindingId: binding.bindingId,
    chainId: binding.chainId,
    address: binding.address,
    version: binding.version,
    emitidaEnISO: ahoraISO,
    expiraEnISO: new Date(Date.parse(ahoraISO) + ttlMs).toISOString(),
  };
}

/**
 * Revalida justo antes de ejecutar. Falla si la resolución caducó o si el
 * binding cambió de versión desde que se emitió. Sin esta comprobación existe
 * la carrera de cambio de binding.
 */
export function revalidarDestino(
  resolucion: ResolucionDeDestino,
  bindingActual: WalletBinding,
  ahoraISO: string = new Date().toISOString(),
): void {
  if (Date.parse(ahoraISO) >= Date.parse(resolucion.expiraEnISO)) {
    throw new ErrorSFSP('DENY_AUTHORIZATION', 'la resolución de destino caducó');
  }
  if (bindingActual.bindingId !== resolucion.bindingId) {
    throw new ErrorSFSP('DENY_AUTHORIZATION', 'la cuenta resolvió a otra ruta');
  }
  if (bindingActual.version !== resolucion.version) {
    throw new ErrorSFSP('DENY_AUTHORIZATION', 'la ruta cambió después de resolverse');
  }
  if (!estaVigente(bindingActual, ahoraISO)) {
    throw new ErrorSFSP('DENY_ASSET_STATE', 'la ruta dejó de estar vigente');
  }
}
