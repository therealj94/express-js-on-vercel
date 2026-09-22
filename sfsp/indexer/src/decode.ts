// Decodificacion de los eventos del §3 del contrato interno a registros tipados.
//
// REGLA CENTRAL: un evento desconocido NO se descarta. Se conserva como crudo
// con su firma. POR QUE: descartar lo que no se reconoce hace que el indice
// mienta por omision (el portal mostraria "no paso nada") y ademas impide
// reconstruir el pasado cuando mas adelante se agregue el decodificador que
// faltaba. Conservar el crudo mantiene el indice completo y auditable.
//
// Segunda regla: toda cantidad se valida como entero decimal en cadena (§5).
// Un campo de monto que no lo sea NO se corrige ni se pone en cero: el registro
// sale marcado como invalido, que es informacion distinta de "cero".

import type { LogCrudo } from './tipos.js';

/** Los quince eventos del §3, con su emisor declarado. */
export const EVENTOS_CONOCIDOS = {
  AssetRegistered: 'AssetRegistry',
  PolicyUpdated: 'AssetRegistry',
  SupplyAuthorized: 'GovernanceController',
  MintExecuted: 'IssuanceController',
  BurnExecuted: 'RegulatedAsset',
  TreasuryReleased: 'CashVault',
  ReserveAttested: 'ReserveEngine',
  ReserveExpired: 'ReserveEngine',
  DisclosurePublished: 'AssetRegistry',
  RiskChanged: 'AssetRegistry',
  TradeSettled: 'SettlementEngine',
  RedemptionUpdated: 'CommodityEngine',
  RecoveryExecuted: 'GovernanceController',
  MigrationClaimed: 'MigrationRegistry',
  GovernanceAction: 'GovernanceController',
} as const;

export type NombreEvento = keyof typeof EVENTOS_CONOCIDOS;

/**
 * Campos requeridos por evento y cuales de ellos son cantidades enteras.
 * POR QUE declarativo: agregar un evento del §3 no debe implicar escribir un
 * decodificador a mano y arriesgar que se olvide la validacion de enteros.
 */
interface EsquemaEvento {
  readonly requeridos: readonly string[];
  readonly cantidades: readonly string[];
}

const ESQUEMAS: Readonly<Record<NombreEvento, EsquemaEvento>> = {
  AssetRegistered: { requeridos: ['assetId', 'issuerId'], cantidades: [] },
  PolicyUpdated: {
    requeridos: ['assetId', 'policyId', 'versionAnterior', 'versionNueva'],
    cantidades: [],
  },
  SupplyAuthorized: {
    requeridos: ['authorizationId', 'assetId', 'amount', 'expiry'],
    cantidades: ['amount'],
  },
  MintExecuted: {
    requeridos: ['authorizationId', 'assetId', 'amount', 'destination'],
    cantidades: ['amount'],
  },
  BurnExecuted: {
    requeridos: ['assetId', 'amount', 'motivo'],
    cantidades: ['amount'],
  },
  TreasuryReleased: {
    requeridos: ['assetId', 'amount', 'destination'],
    cantidades: ['amount'],
  },
  ReserveAttested: {
    requeridos: ['reserveAssetId', 'evidenceId', 'validUntil'],
    cantidades: [],
  },
  ReserveExpired: { requeridos: ['reserveAssetId'], cantidades: [] },
  DisclosurePublished: {
    requeridos: ['assetId', 'reportHash', 'deadline'],
    cantidades: [],
  },
  RiskChanged: {
    requeridos: ['assetId', 'level', 'methodologyVersion'],
    cantidades: [],
  },
  TradeSettled: {
    requeridos: ['operationId', 'assetId', 'amount'],
    cantidades: ['amount'],
  },
  RedemptionUpdated: {
    requeridos: ['assetId', 'estado'],
    cantidades: [],
  },
  RecoveryExecuted: {
    requeridos: ['operationId', 'caseId'],
    cantidades: [],
  },
  MigrationClaimed: {
    requeridos: ['migrationId', 'assetIdAnterior', 'assetIdNuevo', 'amount'],
    cantidades: ['amount'],
  },
  GovernanceAction: { requeridos: ['accion'], cantidades: [] },
};

/** Registro decodificado de un evento reconocido. */
export interface RegistroDecodificado {
  readonly tipo: 'DECODIFICADO';
  readonly evento: NombreEvento;
  readonly emisorEsperado: string;
  readonly chainId: number;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly txHash: string;
  readonly logIndex: number;
  readonly address: string;
  readonly campos: Readonly<Record<string, string>>;
  /** Campos requeridos ausentes. Vacio = registro completo. */
  readonly camposFaltantes: readonly string[];
  /** Campos de cantidad que no eran enteros en cadena (§5). */
  readonly cantidadesInvalidas: readonly string[];
  /** `false` si falta algo: el consumidor NO debe tratarlo como dato firme. */
  readonly completo: boolean;
}

/** Registro no reconocido, conservado tal cual con su firma. */
export interface RegistroCrudoConservado {
  readonly tipo: 'CRUDO';
  /** Firma / topic0 exactamente como llego. Es la pista para decodificar luego. */
  readonly firma: string;
  readonly chainId: number;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly txHash: string;
  readonly logIndex: number;
  readonly address: string;
  readonly topics: readonly string[];
  readonly data: string;
  readonly motivo: 'EVENTO_DESCONOCIDO';
}

export type RegistroIndexado = RegistroDecodificado | RegistroCrudoConservado;

/** Entero decimal no negativo, sin signo ni coma flotante (§5). */
const ENTERO_EN_CADENA = /^[0-9]+$/;

function esEnteroEnCadena(v: string | undefined): boolean {
  return typeof v === 'string' && ENTERO_EN_CADENA.test(v);
}

function esEventoConocido(firma: string): firma is NombreEvento {
  return Object.prototype.hasOwnProperty.call(EVENTOS_CONOCIDOS, firma);
}

/**
 * Decodifica un log. Nunca lanza por evento desconocido ni por campo faltante:
 * esos casos son datos, no excepciones, y deben quedar en el indice.
 */
export function decodificar(log: LogCrudo): RegistroIndexado {
  const firma = log.firma;
  if (!esEventoConocido(firma)) {
    return {
      tipo: 'CRUDO',
      firma,
      chainId: log.chainId,
      blockNumber: log.blockNumber,
      blockHash: log.blockHash,
      txHash: log.txHash,
      logIndex: log.logIndex,
      address: log.address,
      topics: [...log.topics],
      data: log.data,
      motivo: 'EVENTO_DESCONOCIDO',
    };
  }

  const esquema = ESQUEMAS[firma];
  const campos: Record<string, string> = { ...(log.parametros ?? {}) };

  const camposFaltantes = esquema.requeridos.filter(
    (c) => typeof campos[c] !== 'string' || campos[c] === '',
  );
  const cantidadesInvalidas = esquema.cantidades.filter(
    (c) => campos[c] !== undefined && !esEnteroEnCadena(campos[c]),
  );

  return {
    tipo: 'DECODIFICADO',
    evento: firma,
    emisorEsperado: EVENTOS_CONOCIDOS[firma],
    chainId: log.chainId,
    blockNumber: log.blockNumber,
    blockHash: log.blockHash,
    txHash: log.txHash,
    logIndex: log.logIndex,
    address: log.address,
    campos: Object.freeze(campos),
    camposFaltantes,
    cantidadesInvalidas,
    completo: camposFaltantes.length === 0 && cantidadesInvalidas.length === 0,
  };
}

/** Decodifica un lote conservando el orden de llegada. */
export function decodificarLote(
  logs: readonly LogCrudo[],
): readonly RegistroIndexado[] {
  return logs.map(decodificar);
}
