// Agregacion de suministro por activo, con origen declarado en cada cifra.
//
// POR QUE cuatro cifras y no una: el plan P7a exige "supply con definiciones".
// "Suministro" sin definicion es la forma mas comun de mentir con un numero
// correcto. Aqui se separan:
//   - AUTORIZADO : capacidad aprobada (SupplyAuthorized). No es lo emitido.
//   - EMITIDO    : unidades creadas menos quemadas (MintExecuted / BurnExecuted).
//   - TESORERIA  : emitido que sigue bajo control del emisor.
//   - CIRCULANTE : emitido - tesoreria.
//
// REGLAS DURAS aplicadas aqui (§6.1 del contrato interno):
//   - Depositar unidades de usuarios en tesoreria NO las vuelve "no emitidas":
//     tesoreria se resta del circulante, nunca del emitido.
//   - Enviar unidades a una direccion supuestamente inaccesible NO reduce el
//     emitido. Solo `BurnExecuted` lo reduce.
//   - Si una parte es DESCONOCIDA, el total sale DESCONOCIDO. No se rellena con
//     cero: cero es una afirmacion, y no la tenemos.
//
// Toda cantidad es `bigint` y se publica como cadena (§5): nunca `number`.

import type { RegistroIndexado } from './decode.js';

/** Origen de una cifra, exactamente como lo nombra el pasaporte (§2.3). */
export type OrigenSuministro =
  | 'CHAIN_TOTALSUPPLY'
  | 'REGISTRY'
  | 'CUSTODIAL_LEDGER'
  | 'UNKNOWN';

/** Una cifra con su procedencia. `valor: null` significa desconocida. */
export interface CifraSuministro {
  /** Entero en unidades base como cadena, o `null` si es desconocida. */
  readonly valor: string | null;
  readonly origen: OrigenSuministro;
  /** Por que es desconocida, cuando lo es. Texto para diagnostico, no para UI. */
  readonly motivo: string | null;
}

export interface SuministroActivo {
  readonly assetId: string;
  readonly autorizado: CifraSuministro;
  readonly emitido: CifraSuministro;
  readonly tesoreria: CifraSuministro;
  readonly circulante: CifraSuministro;
  /** `decimals: null` = desconocido. NUNCA se sustituye por 18 (§2.3). */
  readonly decimals: number | null;
  /** true si alguna cifra quedo desconocida. La UI debe decirlo. */
  readonly parcial: boolean;
}

/**
 * Saldo de tesoreria por activo, leido de un ledger custodial. Inyectable:
 * en produccion viene de un adaptador; aqui, de un objeto en memoria.
 * Devolver `null` = no se pudo leer (UNKNOWN_SOURCE aguas arriba).
 */
export interface FuenteTesoreria {
  readonly origen: Extract<OrigenSuministro, 'CUSTODIAL_LEDGER' | 'REGISTRY'>;
  saldo(assetId: string): bigint | null;
}

export interface OpcionesSuministro {
  readonly decimalsPorActivo?: Readonly<Record<string, number | null>>;
  readonly tesoreria?: FuenteTesoreria;
}

function cifraConocida(valor: bigint, origen: OrigenSuministro): CifraSuministro {
  return { valor: valor.toString(10), origen, motivo: null };
}

function cifraDesconocida(motivo: string): CifraSuministro {
  return { valor: null, origen: 'UNKNOWN', motivo };
}

/** Acumulador interno mientras se recorren los eventos. */
interface Acumulado {
  autorizado: bigint;
  emitido: bigint;
  vioAutorizacion: boolean;
  vioEmision: boolean;
  /** Eventos que debieron aportar una cantidad y no la traian utilizable. */
  camposRotos: string[];
}

function leerCantidad(v: string | undefined): bigint | null {
  if (typeof v !== 'string' || !/^[0-9]+$/.test(v)) return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
}

/**
 * Agrega suministro a partir de registros ya decodificados y deduplicados.
 *
 * Los registros CRUDO (evento desconocido) NO se ignoran a efectos de calidad:
 * si hay crudos para un activo, el resultado se marca desconocido, porque un
 * evento que no sabemos leer podria ser justamente un `BurnExecuted` nuevo.
 * Esto es lo contrario de "si no lo entiendo, no paso nada".
 */
export function agregarSuministro(
  assetId: string,
  registros: readonly RegistroIndexado[],
  opciones: OpcionesSuministro = {},
): SuministroActivo {
  const acc: Acumulado = {
    autorizado: 0n,
    emitido: 0n,
    vioAutorizacion: false,
    vioEmision: false,
    camposRotos: [],
  };
  let hayCrudoDelActivo = false;

  for (const r of registros) {
    if (r.tipo === 'CRUDO') {
      // No sabemos a que activo pertenece un evento que no sabemos leer.
      // Se asume que puede afectar a este: conservador, no optimista.
      hayCrudoDelActivo = true;
      continue;
    }
    if (r.campos['assetId'] !== assetId) continue;

    switch (r.evento) {
      case 'SupplyAuthorized': {
        const m = leerCantidad(r.campos['amount']);
        if (m === null) {
          acc.camposRotos.push('SupplyAuthorized.amount');
          break;
        }
        acc.autorizado += m;
        acc.vioAutorizacion = true;
        break;
      }
      case 'MintExecuted': {
        const m = leerCantidad(r.campos['amount']);
        if (m === null) {
          acc.camposRotos.push('MintExecuted.amount');
          break;
        }
        acc.emitido += m;
        acc.vioEmision = true;
        break;
      }
      case 'BurnExecuted': {
        const m = leerCantidad(r.campos['amount']);
        if (m === null) {
          acc.camposRotos.push('BurnExecuted.amount');
          break;
        }
        acc.emitido -= m;
        acc.vioEmision = true;
        break;
      }
      // TreasuryReleased mueve unidades de tesoreria al circulante. NO cambia el
      // emitido: por eso no se toca `acc.emitido` aqui. El saldo de tesoreria lo
      // da la fuente custodial, que ya refleja la salida.
      case 'TreasuryReleased':
        break;
      default:
        break;
    }
  }

  const rotos = acc.camposRotos.length > 0;

  const autorizado: CifraSuministro =
    rotos || hayCrudoDelActivo
      ? cifraDesconocida(
          rotos
            ? `cantidades no utilizables: ${acc.camposRotos.join(', ')}`
            : 'hay eventos sin decodificar que podrian afectar la cifra',
        )
      : acc.vioAutorizacion
        ? cifraConocida(acc.autorizado, 'REGISTRY')
        : cifraDesconocida('no se observo ningun SupplyAuthorized para el activo');

  const emitido: CifraSuministro =
    rotos || hayCrudoDelActivo
      ? cifraDesconocida(
          rotos
            ? `cantidades no utilizables: ${acc.camposRotos.join(', ')}`
            : 'hay eventos sin decodificar que podrian afectar la cifra',
        )
      : acc.vioEmision
        ? cifraConocida(acc.emitido, 'CHAIN_TOTALSUPPLY')
        : cifraDesconocida('no se observo emision ni quema para el activo');

  const fuente = opciones.tesoreria;
  let tesoreria: CifraSuministro;
  if (fuente === undefined) {
    tesoreria = cifraDesconocida('no se inyecto una fuente de tesoreria');
  } else {
    const saldo = fuente.saldo(assetId);
    tesoreria =
      saldo === null
        ? cifraDesconocida('la fuente de tesoreria no respondio')
        : cifraConocida(saldo, fuente.origen);
  }

  // Circulante = emitido - tesoreria. Si cualquiera de los dos falta, el
  // resultado es desconocido. Restar contra cero daria un circulante inflado y
  // con apariencia de dato firme: exactamente lo que la regla 4 prohibe.
  let circulante: CifraSuministro;
  if (emitido.valor === null || tesoreria.valor === null) {
    circulante = cifraDesconocida(
      'una parte (emitido o tesoreria) es desconocida: el total no se completa con cero',
    );
  } else {
    const resultado = BigInt(emitido.valor) - BigInt(tesoreria.valor);
    circulante =
      resultado < 0n
        ? cifraDesconocida(
            'tesoreria supera lo emitido: las fuentes no son consistentes entre si',
          )
        : cifraConocida(resultado, 'CUSTODIAL_LEDGER');
  }

  const decimals = opciones.decimalsPorActivo?.[assetId] ?? null;

  return {
    assetId,
    autorizado,
    emitido,
    tesoreria,
    circulante,
    decimals,
    parcial:
      autorizado.valor === null ||
      emitido.valor === null ||
      tesoreria.valor === null ||
      circulante.valor === null,
  };
}

/** Fuente de tesoreria en memoria para pruebas. Datos sinteticos. */
export class TesoreriaEnMemoria implements FuenteTesoreria {
  public readonly origen: 'CUSTODIAL_LEDGER' | 'REGISTRY';
  private readonly saldos: Map<string, bigint>;
  private caida = false;

  constructor(
    saldos: Readonly<Record<string, bigint>> = {},
    origen: 'CUSTODIAL_LEDGER' | 'REGISTRY' = 'CUSTODIAL_LEDGER',
  ) {
    this.saldos = new Map(Object.entries(saldos));
    this.origen = origen;
  }

  public caer(): void {
    this.caida = true;
  }

  public saldo(assetId: string): bigint | null {
    if (this.caida) return null;
    return this.saldos.get(assetId) ?? null;
  }
}
