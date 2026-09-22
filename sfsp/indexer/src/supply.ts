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
// CORRECCION H15. Antes este modulo hacia dos cosas mal:
//   1. Ignoraba la marca `completo` del registro. Un mint incompleto por 999
//      entraba como 999 y salia marcado como conocido.
//   2. Etiquetaba `CHAIN_TOTALSUPPLY` una cifra derivada de eventos. Esa
//      etiqueta significa "lo lei de `totalSupply()` en la cadena" y aqui no se
//      lee la cadena: lo que hay es una reconstruccion a partir del registro de
//      eventos, cuyo origen honesto es `REGISTRY` (o `UNKNOWN` si falta algo).
// Ademas, un burn que no se puede atribuir a un activo (el caso real del
// contrato, que emitia `BurnExecuted` sin `assetId`) ya no se ignora en
// silencio dejando el emitido inflado: vuelve la cifra DESCONOCIDA.
//
// Toda cantidad es `bigint` y se publica como cadena (§5): nunca `number`.

import { ESQUEMA_EVENTOS, type RegistroIndexado } from './decode.js';

/** Origen de una cifra, exactamente como lo nombra el pasaporte (§2.3). */
export type OrigenSuministro =
  | 'CHAIN_TOTALSUPPLY'
  | 'REGISTRY'
  | 'CUSTODIAL_LEDGER'
  | 'UNKNOWN';

/**
 * Origen de toda cifra reconstruida a partir de eventos.
 * POR QUE una constante y no un literal suelto: deja escrito, en un solo sitio,
 * que este modulo NUNCA puede producir `CHAIN_TOTALSUPPLY`. Una prueba lo exige.
 */
export const ORIGEN_DERIVADO_DE_EVENTOS = 'REGISTRY' as const;

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
  /**
   * Huecos de cobertura encontrados, en texto. Vacio = cobertura completa.
   * Es lo que hay que arreglar para que las cifras dejen de ser desconocidas.
   */
  readonly huecosDeCobertura: readonly string[];
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

function leerCantidad(v: string | undefined): bigint | null {
  if (typeof v !== 'string' || !/^[0-9]+$/.test(v)) return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
}

/** Acumulador interno mientras se recorren los eventos. */
interface Acumulado {
  autorizado: bigint;
  emitido: bigint;
  vioAutorizacion: boolean;
  vioEmision: boolean;
  /** Todo lo que impide afirmar la cifra. Si no esta vacio, sale DESCONOCIDA. */
  huecos: string[];
}

/**
 * Agrega suministro a partir de registros ya decodificados y deduplicados.
 *
 * Tres formas de perder cobertura, y las tres dan DESCONOCIDO:
 *  1. Un registro CRUDO (evento que no sabemos leer). Podria ser justamente un
 *     `BurnExecuted` nuevo. Esto es lo contrario de "si no lo entiendo, no paso
 *     nada".
 *  2. Un registro cuya atribucion a activo esta incompleta: no sabemos si es de
 *     este activo, asi que no podemos descartarlo.
 *  3. Un registro de este activo marcado `completo: false`, o con una cantidad
 *     que no es entero en cadena.
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
    huecos: [],
  };

  for (const r of registros) {
    if (r.tipo === 'CRUDO') {
      acc.huecos.push(
        `evento sin decodificar (${r.firma}) en el bloque ${r.blockNumber}: podria afectar a este activo`,
      );
      continue;
    }

    if (r.atribucionIncompleta) {
      // Caso real de H15: `BurnExecuted` emitido sin `assetId`. Antes se
      // descartaba y el emitido quedaba inflado con apariencia de dato firme.
      acc.huecos.push(
        `${r.evento} en el bloque ${r.blockNumber} sin campos de atribucion (${r.camposFaltantes.join(', ')}): no se puede saber de que activo es`,
      );
      continue;
    }

    // Evento global (no pertenece a ningun activo) o de otro activo: no aporta.
    if (r.activosAtribuidos.length === 0) continue;
    if (!r.activosAtribuidos.includes(assetId)) continue;

    if (!r.completo) {
      acc.huecos.push(
        `${r.evento} en el bloque ${r.blockNumber} incompleto (faltan: ${r.camposFaltantes.join(', ') || '-'}; cantidades invalidas: ${r.cantidadesInvalidas.join(', ') || '-'})`,
      );
      continue;
    }

    // El efecto sobre el suministro lo declara la fuente unica, no un `switch`
    // escrito a mano que podria quedarse atras cuando se agregue un evento.
    const efecto = ESQUEMA_EVENTOS[r.evento].afectaSuministro;
    if (efecto === 'NINGUNO') continue;

    // Los tres eventos que mueven suministro nombran su monto `amount`; el
    // cargador lo exige como cantidad obligatoria, asi que aqui solo puede
    // faltar si alguien cambio el JSON sin regenerar (y la prueba lo caza).
    const m = leerCantidad(r.campos['amount']);
    if (m === null) {
      acc.huecos.push(`${r.evento} en el bloque ${r.blockNumber}: monto no utilizable`);
      continue;
    }
    if (efecto === 'AUTORIZA') {
      acc.autorizado += m;
      acc.vioAutorizacion = true;
    } else if (efecto === 'AUMENTA') {
      acc.emitido += m;
      acc.vioEmision = true;
    } else {
      acc.emitido -= m;
      acc.vioEmision = true;
    }
  }

  const sinCobertura = acc.huecos.length > 0;
  const motivoHuecos = `cobertura incompleta: ${acc.huecos.join(' | ')}`;

  const autorizado: CifraSuministro = sinCobertura
    ? cifraDesconocida(motivoHuecos)
    : acc.vioAutorizacion
      ? cifraConocida(acc.autorizado, ORIGEN_DERIVADO_DE_EVENTOS)
      : cifraDesconocida('no se observo ningun SupplyAuthorized para el activo');

  let emitido: CifraSuministro;
  if (sinCobertura) {
    emitido = cifraDesconocida(motivoHuecos);
  } else if (!acc.vioEmision) {
    emitido = cifraDesconocida('no se observo emision ni quema para el activo');
  } else if (acc.emitido < 0n) {
    // Quemar mas de lo emitido dentro de la ventana observada no es un negativo:
    // es que la ventana no cubre la emision original. Decirlo, no publicarlo.
    emitido = cifraDesconocida(
      'lo quemado supera lo emitido en la ventana observada: la ventana no cubre toda la historia',
    );
  } else {
    emitido = cifraConocida(acc.emitido, ORIGEN_DERIVADO_DE_EVENTOS);
  }

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
        : // El circulante no es mejor que la peor de sus dos partes: hereda el
          // origen de la tesoreria, que es la mas debil de las dos.
          cifraConocida(resultado, tesoreria.origen);
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
    huecosDeCobertura: [...acc.huecos],
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
