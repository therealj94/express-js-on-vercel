/* El directorio de cuentas SFSP.
 *
 * Guarda cuentas, alias y rutas, e impone las reglas que no pueden romperse ni
 * por una carrera ni por una reversión:
 *
 *   · un número de cuenta es único y NO se recicla, ni siquiera si la operación
 *     que lo creó se deshace después. Alguien pudo haberlo copiado en una
 *     agenda en ese rato;
 *   · un alias es único por forma normalizada Y por esqueleto, para que no
 *     convivan dos que se ven igual;
 *   · una cuenta tiene como mucho una ruta PRIMARY, y pasar una a PRIMARY
 *     degrada la anterior en la misma operación.
 *
 * DOS DEFECTOS QUE LA AUDITORÍA ENCONTRÓ AQUÍ, y cómo se cierran:
 *
 *   H07a · los clones eran superficiales. `new Map(otro)` copia el mapa pero
 *     comparte los objetos de dentro, así que una instantánea no aislaba nada:
 *     lo que se mutaba después de tomarla también cambiaba en la copia. Se
 *     reprodujo dejando DOS rutas primarias en una cuenta tras restaurar.
 *     Ahora el clon es profundo y `restaurar` valida las invariantes.
 *
 *   H07b · los lectores devolvían la referencia viva del objeto guardado, así
 *     que cualquiera podía cambiar un número de cuenta o revivir una ruta
 *     revocada sin pasar por una sola validación. Ahora todo lector público
 *     devuelve una copia congelada. El estado interno sólo se toca por los
 *     métodos de esta clase.
 *
 * El almacén es en memoria a propósito: ésta es la implementación de
 * referencia y las pruebas no tocan ninguna base. El adaptador durable tiene
 * que imponer las MISMAS invariantes en la base, no en el código: la lista
 * exacta está en RESTRICCIONES_DURABLES, más abajo. */

import { nuevoId } from './ids.js';
import { generarNumeroCuenta, claveDeIndice, esNumeroValido } from './numeroCuenta.js';
import { normalizarAlias, esReservado } from './alias.js';
import { normalizarDireccion } from './direccion.js';
import { transicionar, estaVigente, resolverDestino } from './binding.js';
import type { ResolucionDeDestino, EventoDeBinding } from './binding.js';
import { ErrorSFSP } from './codigos.js';
import type {
  SFSPAccount,
  AliasRecord,
  WalletBinding,
  CustodyProfile,
  BindingPurpose,
  BindingStatus,
} from './tipos.js';

export const MAX_REINTENTOS_NUMERO = 8;

/**
 * Lo que un adaptador durable TIENE que imponer en la base de datos, no en el
 * código de la aplicación (P01). Una comprobación en memoria no sobrevive a dos
 * procesos concurrentes; un índice único, sí.
 */
export const RESTRICCIONES_DURABLES = [
  'índice único sobre accountId',
  'índice único sobre la clave de índice del accountNumber',
  'tabla monotónica de números consumidos, sin borrado, consultada antes de emitir',
  'índice único sobre el alias normalizado',
  'índice único sobre el esqueleto del alias',
  'índice único parcial: como mucho un binding PRIMARY por accountId',
  'historial de bindings sólo de inserción, sin actualización ni borrado',
] as const;

/** Correspondencia durable entre una cuenta de origen y su cuenta SFSP. */
export interface ParDeOrigen {
  refCuentaOrigen: string;
  accountId: string;
  accountNumber: string;
  bindingId: string;
}

interface Estado {
  cuentasPorId: Map<string, SFSPAccount>;
  numeroAId: Map<string, string>;
  aliasPorNormalizado: Map<string, AliasRecord>;
  aliasPorEsqueleto: Map<string, string>;
  bindingsPorId: Map<string, WalletBinding>;
  bindingsPorCuenta: Map<string, string[]>;
  historial: EventoDeBinding[];
  /* H10: la correspondencia origen a cuenta vive aquí, no en un mapa opcional
     que el llamador puede olvidar pasar. */
  origenACuenta: Map<string, ParDeOrigen>;
}

function estadoVacio(): Estado {
  return {
    cuentasPorId: new Map(),
    numeroAId: new Map(),
    aliasPorNormalizado: new Map(),
    aliasPorEsqueleto: new Map(),
    bindingsPorId: new Map(),
    bindingsPorCuenta: new Map(),
    historial: [],
    origenACuenta: new Map(),
  };
}

/* Copia profunda. Los objetos guardados son planos, así que basta con extender
   cada uno en uno nuevo; si algún día alguno lleva un objeto anidado, hay que
   ampliar esta función y la prueba de aislamiento lo detectará. */
const copiaCuenta = (c: SFSPAccount): SFSPAccount => ({ ...c });
const copiaBinding = (b: WalletBinding): WalletBinding => ({ ...b });
const copiaAlias = (a: AliasRecord): AliasRecord => ({ ...a });

function clonar(e: Estado): Estado {
  return {
    cuentasPorId: new Map([...e.cuentasPorId].map(([k, v]) => [k, copiaCuenta(v)])),
    numeroAId: new Map(e.numeroAId),
    aliasPorNormalizado: new Map([...e.aliasPorNormalizado].map(([k, v]) => [k, copiaAlias(v)])),
    aliasPorEsqueleto: new Map(e.aliasPorEsqueleto),
    bindingsPorId: new Map([...e.bindingsPorId].map(([k, v]) => [k, copiaBinding(v)])),
    bindingsPorCuenta: new Map([...e.bindingsPorCuenta].map(([k, v]) => [k, [...v]])),
    historial: e.historial.map((h) => ({ ...h })),
    origenACuenta: new Map([...e.origenACuenta].map(([k, v]) => [k, { ...v }])),
  };
}

/** Copia congelada para devolver al exterior. Mutarla no cambia nada. */
const afuera = <T extends object>(o: T): Readonly<T> => Object.freeze({ ...o });

export interface DatosDeAlta {
  genesisSubjectRef: string;
  custodyProfile: CustodyProfile;
  policyVersion: string;
  createdAt?: string;
  /** Si viene, la cuenta queda ligada de forma durable a esa cuenta de origen. */
  refCuentaOrigen?: string;
}

export class DirectorioDeCuentas {
  private estado: Estado = estadoVacio();

  /* Monotónico: JAMÁS se restaura en una reversión. Es lo que impide que un
     número que ya se mostró a alguien se entregue después a otra persona. */
  private readonly numerosConsumidos = new Set<string>();

  /* ---------------------------------------------------------------- cuentas */

  crearCuenta(datos: DatosDeAlta): Readonly<SFSPAccount> {
    if (datos.refCuentaOrigen && this.estado.origenACuenta.has(datos.refCuentaOrigen)) {
      throw new ErrorSFSP(
        'DENY_POLICY',
        `la cuenta de origen ${datos.refCuentaOrigen} ya tiene una cuenta SFSP`,
      );
    }

    const accountNumber = this.reservarNumeroLibre();
    const cuenta: SFSPAccount = {
      accountId: nuevoId('acc'),
      accountNumber,
      status: 'ACTIVE',
      createdAt: datos.createdAt ?? new Date().toISOString(),
      genesisSubjectRef: datos.genesisSubjectRef,
      custodyProfile: datos.custodyProfile,
      primaryBindingId: null,
      policyVersion: datos.policyVersion,
    };
    this.estado.cuentasPorId.set(cuenta.accountId, cuenta);
    this.estado.numeroAId.set(claveDeIndice(accountNumber), cuenta.accountId);
    return afuera(cuenta);
  }

  /** Sortea números hasta dar con uno libre. La colisión se resuelve aquí. */
  private reservarNumeroLibre(): string {
    for (let intento = 0; intento < MAX_REINTENTOS_NUMERO; intento++) {
      const candidato = generarNumeroCuenta();
      const clave = claveDeIndice(candidato);
      if (this.numerosConsumidos.has(clave)) continue;
      if (this.estado.numeroAId.has(clave)) continue;
      this.numerosConsumidos.add(clave);
      return candidato;
    }
    throw new ErrorSFSP('UNKNOWN_SOURCE', 'no se consiguió un número libre tras varios intentos');
  }

  private cuentaViva(accountId: string): SFSPAccount | null {
    return this.estado.cuentasPorId.get(accountId) ?? null;
  }

  cuentaPorId(accountId: string): Readonly<SFSPAccount> | null {
    const c = this.cuentaViva(accountId);
    return c ? afuera(c) : null;
  }

  cuentaPorNumero(accountNumber: string): Readonly<SFSPAccount> | null {
    if (!esNumeroValido(accountNumber)) return null;
    const id = this.estado.numeroAId.get(claveDeIndice(accountNumber));
    return id ? this.cuentaPorId(id) : null;
  }

  get totalCuentas(): number {
    return this.estado.cuentasPorId.size;
  }

  /** Números que existieron alguna vez. Ninguno se vuelve a entregar. */
  get totalNumerosConsumidos(): number {
    return this.numerosConsumidos.size;
  }

  /* ------------------------------------------------- correspondencia origen */

  ligarOrigen(refCuentaOrigen: string, par: Omit<ParDeOrigen, 'refCuentaOrigen'>): void {
    const existente = this.estado.origenACuenta.get(refCuentaOrigen);
    if (existente && existente.accountId !== par.accountId) {
      throw new ErrorSFSP('DENY_POLICY', `la cuenta de origen ${refCuentaOrigen} ya está ligada`);
    }
    this.estado.origenACuenta.set(refCuentaOrigen, { refCuentaOrigen, ...par });
  }

  parDeOrigen(refCuentaOrigen: string): Readonly<ParDeOrigen> | null {
    const p = this.estado.origenACuenta.get(refCuentaOrigen);
    return p ? afuera(p) : null;
  }

  get totalOrigenesLigados(): number {
    return this.estado.origenACuenta.size;
  }

  /* ------------------------------------------------------------------ alias */

  registrarAlias(accountId: string, aliasPedido: string, cuandoISO?: string): Readonly<AliasRecord> {
    if (!this.cuentaViva(accountId)) throw new ErrorSFSP('DENY_POLICY', 'la cuenta no existe');

    const n = normalizarAlias(aliasPedido);
    if (esReservado(n.normalized)) {
      throw new ErrorSFSP('DENY_POLICY', 'ese alias está reservado');
    }
    if (this.estado.aliasPorNormalizado.has(n.normalized)) {
      throw new ErrorSFSP('DENY_POLICY', 'ese alias ya está tomado');
    }
    const dueñoDelEsqueleto = this.estado.aliasPorEsqueleto.get(n.skeleton);
    if (dueñoDelEsqueleto && dueñoDelEsqueleto !== n.normalized) {
      throw new ErrorSFSP('DENY_POLICY', 'ya existe un alias que se ve igual que ése');
    }

    const registro: AliasRecord = {
      alias: n.alias,
      normalized: n.normalized,
      skeleton: n.skeleton,
      accountId,
      status: 'ACTIVE',
      createdAt: cuandoISO ?? new Date().toISOString(),
      releasedAt: null,
    };
    this.estado.aliasPorNormalizado.set(n.normalized, registro);
    this.estado.aliasPorEsqueleto.set(n.skeleton, n.normalized);
    return afuera(registro);
  }

  aliasDe(accountId: string): ReadonlyArray<Readonly<AliasRecord>> {
    return [...this.estado.aliasPorNormalizado.values()]
      .filter((a) => a.accountId === accountId && a.status === 'ACTIVE')
      .map(afuera);
  }

  cuentaPorAlias(aliasPedido: string): Readonly<SFSPAccount> | null {
    let n;
    try {
      n = normalizarAlias(aliasPedido);
    } catch {
      return null;
    }
    const registro = this.estado.aliasPorNormalizado.get(n.normalized);
    if (!registro || registro.status !== 'ACTIVE') return null;
    return this.cuentaPorId(registro.accountId);
  }

  /** Cambiar de alias no toca el número de cuenta. El viejo queda liberado. */
  cambiarAlias(accountId: string, aliasNuevo: string, cuandoISO?: string): Readonly<AliasRecord> {
    const vivos = [...this.estado.aliasPorNormalizado.values()].filter(
      (a) => a.accountId === accountId && a.status === 'ACTIVE',
    );
    const nuevo = this.registrarAlias(accountId, aliasNuevo, cuandoISO);
    const cuando = cuandoISO ?? new Date().toISOString();
    for (const viejo of vivos) {
      viejo.status = 'RELEASED';
      viejo.releasedAt = cuando;
      if (this.estado.aliasPorEsqueleto.get(viejo.skeleton) === viejo.normalized) {
        this.estado.aliasPorEsqueleto.delete(viejo.skeleton);
      }
    }
    this.estado.aliasPorEsqueleto.set(nuevo.skeleton, nuevo.normalized);
    return nuevo;
  }

  /* --------------------------------------------------------------- bindings */

  crearBinding(
    accountId: string,
    chainId: number,
    direccion: string,
    purpose: BindingPurpose,
    custodyProfile: CustodyProfile,
    validFrom: string = new Date().toISOString(),
    validUntil: string | null = null,
  ): Readonly<WalletBinding> {
    if (!this.cuentaViva(accountId)) throw new ErrorSFSP('DENY_POLICY', 'la cuenta no existe');

    const binding: WalletBinding = {
      bindingId: nuevoId('bnd'),
      accountId,
      chainId,
      address: normalizarDireccion(direccion),
      purpose,
      status: 'PENDING',
      custodyProfile,
      validFrom,
      validUntil,
      version: 1,
    };
    this.estado.bindingsPorId.set(binding.bindingId, binding);
    const lista = this.estado.bindingsPorCuenta.get(accountId) ?? [];
    lista.push(binding.bindingId);
    this.estado.bindingsPorCuenta.set(accountId, lista);
    return afuera(binding);
  }

  private bindingVivo(bindingId: string): WalletBinding | null {
    return this.estado.bindingsPorId.get(bindingId) ?? null;
  }

  binding(bindingId: string): Readonly<WalletBinding> | null {
    const b = this.bindingVivo(bindingId);
    return b ? afuera(b) : null;
  }

  bindingsDe(accountId: string): ReadonlyArray<Readonly<WalletBinding>> {
    return (this.estado.bindingsPorCuenta.get(accountId) ?? []).map((id) =>
      afuera(this.estado.bindingsPorId.get(id) as WalletBinding),
    );
  }

  /**
   * Cambia el estado de una ruta. Si pasa a PRIMARY, la primaria anterior baja
   * a ACTIVE en la MISMA operación: nunca quedan dos rutas primarias.
   */
  cambiarEstadoBinding(
    bindingId: string,
    hacia: BindingStatus,
    actor: string,
    motivo: string,
    cuandoISO: string = new Date().toISOString(),
  ): Readonly<WalletBinding> {
    const actual = this.bindingVivo(bindingId);
    if (!actual) throw new ErrorSFSP('DENY_POLICY', 'la ruta no existe');

    const { binding: nuevo, evento } = transicionar(actual, hacia, actor, motivo, cuandoISO);

    if (hacia === 'PRIMARY') {
      const cuenta = this.cuentaViva(actual.accountId);
      if (!cuenta) throw new ErrorSFSP('DENY_POLICY', 'la cuenta no existe');

      /* Se degrada CUALQUIER otra ruta primaria de la cuenta, no sólo la que
         figure en primaryBindingId. Si por una restauración quedaran dos, esto
         las corrige en vez de añadir una tercera. */
      for (const otra of this.estado.bindingsPorCuenta.get(actual.accountId) ?? []) {
        if (otra === bindingId) continue;
        const b = this.bindingVivo(otra);
        if (b && b.status === 'PRIMARY') {
          const degradado = transicionar(b, 'ACTIVE', actor, 'otra ruta pasó a primaria', cuandoISO);
          this.estado.bindingsPorId.set(b.bindingId, degradado.binding);
          this.estado.historial.push(degradado.evento);
        }
      }
      cuenta.primaryBindingId = bindingId;
    } else if (hacia === 'REVOKED' || hacia === 'SUSPENDED') {
      const cuenta = this.cuentaViva(actual.accountId);
      if (cuenta && cuenta.primaryBindingId === bindingId) cuenta.primaryBindingId = null;
    }

    this.estado.bindingsPorId.set(bindingId, nuevo);
    this.estado.historial.push(evento);
    return afuera(nuevo);
  }

  get historial(): ReadonlyArray<Readonly<EventoDeBinding>> {
    return this.estado.historial.map(afuera);
  }

  /** Cuántas rutas primarias tiene una cuenta. Siempre debe ser 0 o 1. */
  rutasPrimarias(accountId: string): number {
    return (this.estado.bindingsPorCuenta.get(accountId) ?? []).filter(
      (id) => this.estado.bindingsPorId.get(id)?.status === 'PRIMARY',
    ).length;
  }

  /* ------------------------------------------------------------- resolución */

  /** Resuelve un destino: primero número exacto, después alias confirmado. */
  resolver(
    destino: string,
    chainId: number,
    ahoraISO: string = new Date().toISOString(),
  ): ResolucionDeDestino {
    const cuenta = this.cuentaPorNumero(destino) ?? this.cuentaPorAlias(destino);
    if (!cuenta) throw new ErrorSFSP('DENY_POLICY', 'no hay ninguna cuenta con ese destino');
    if (cuenta.status !== 'ACTIVE') {
      throw new ErrorSFSP('DENY_ASSET_STATE', 'la cuenta de destino no está activa');
    }

    const rutas = this.bindingsDe(cuenta.accountId).filter(
      (b) => b.chainId === chainId && estaVigente(b, ahoraISO),
    );
    const elegida = rutas.find((b) => b.status === 'PRIMARY') ?? rutas[0];
    if (!elegida) {
      throw new ErrorSFSP('DENY_ASSET_STATE', 'la cuenta no tiene una ruta vigente en esa red');
    }
    return resolverDestino(cuenta.accountNumber, elegida, ahoraISO);
  }

  /* -------------------------------------------------------------- invariantes */

  /**
   * Las invariantes que el directorio promete. Se comprueban después de
   * restaurar una instantánea, porque una reversión mal hecha es justo la forma
   * de romperlas sin que nadie llame a un método.
   */
  invariantes(): string[] {
    const fallos: string[] = [];

    for (const [id, cuenta] of this.estado.cuentasPorId) {
      const primarias = this.rutasPrimarias(id);
      if (primarias > 1) fallos.push(`la cuenta ${id} tiene ${primarias} rutas primarias`);

      if (cuenta.primaryBindingId) {
        const b = this.bindingVivo(cuenta.primaryBindingId);
        if (!b) fallos.push(`la cuenta ${id} apunta a una ruta primaria inexistente`);
        else if (b.status !== 'PRIMARY') {
          fallos.push(`la cuenta ${id} apunta como primaria a una ruta en estado ${b.status}`);
        }
      } else if (primarias === 1) {
        fallos.push(`la cuenta ${id} tiene una ruta primaria que no figura en primaryBindingId`);
      }

      const clave = claveDeIndice(cuenta.accountNumber);
      if (this.estado.numeroAId.get(clave) !== id) {
        fallos.push(`el número de la cuenta ${id} no está bien indexado`);
      }
      if (!this.numerosConsumidos.has(clave)) {
        fallos.push(`el número de la cuenta ${id} no figura como consumido`);
      }
    }

    for (const [normalizado, registro] of this.estado.aliasPorNormalizado) {
      if (registro.normalized !== normalizado) {
        fallos.push(`el alias ${normalizado} está indexado con otra forma`);
      }
      if (registro.status === 'ACTIVE' && !this.cuentaViva(registro.accountId)) {
        fallos.push(`el alias ${normalizado} apunta a una cuenta que no existe`);
      }
    }

    for (const [id, binding] of this.estado.bindingsPorId) {
      if (!this.cuentaViva(binding.accountId)) {
        fallos.push(`la ruta ${id} apunta a una cuenta que no existe`);
      }
    }

    return fallos;
  }

  /* -------------------------------------------------------------- reversión */

  /**
   * Instantánea profunda. La reversión NO devuelve los números de cuenta al
   * sorteo: ese conjunto es monotónico y vive fuera del estado.
   */
  instantanea(): Estado {
    return clonar(this.estado);
  }

  /** Restaura y comprueba. Una instantánea que rompe una invariante no se aplica. */
  restaurar(instantanea: Estado): void {
    const anterior = this.estado;
    this.estado = clonar(instantanea);
    const fallos = this.invariantes();
    if (fallos.length) {
      this.estado = anterior;
      throw new ErrorSFSP(
        'DENY_ASSET_STATE',
        `la instantánea rompe invariantes del directorio: ${fallos.join('; ')}`,
      );
    }
  }

  /**
   * Copia independiente para simular sin tocar el original (C08).
   *
   * Comparte el conjunto de números consumidos a propósito: un número sorteado
   * durante un simulacro tampoco se puede volver a entregar.
   */
  copiaParaSimulacro(): DirectorioDeCuentas {
    const copia = new DirectorioDeCuentas();
    copia.estado = clonar(this.estado);
    (copia as unknown as { numerosConsumidos: Set<string> }).numerosConsumidos =
      this.numerosConsumidos;
    return copia;
  }
}
