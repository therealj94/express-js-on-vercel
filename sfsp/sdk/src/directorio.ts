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
 *     degrada la anterior en la misma operación: nunca hay dos rutas primarias
 *     a la vez, que es como se paga dos veces al sitio equivocado.
 *
 * El almacén es en memoria a propósito: esta es la implementación de referencia
 * y las pruebas no tocan ninguna base. Un adaptador real implementa la misma
 * interfaz con los mismos índices únicos en la base, no en el código. */

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

interface Estado {
  cuentasPorId: Map<string, SFSPAccount>;
  numeroAId: Map<string, string>;
  aliasPorNormalizado: Map<string, AliasRecord>;
  aliasPorEsqueleto: Map<string, string>;
  bindingsPorId: Map<string, WalletBinding>;
  bindingsPorCuenta: Map<string, string[]>;
  historial: EventoDeBinding[];
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
  };
}

function clonar(e: Estado): Estado {
  return {
    cuentasPorId: new Map(e.cuentasPorId),
    numeroAId: new Map(e.numeroAId),
    aliasPorNormalizado: new Map(e.aliasPorNormalizado),
    aliasPorEsqueleto: new Map(e.aliasPorEsqueleto),
    bindingsPorId: new Map(e.bindingsPorId),
    bindingsPorCuenta: new Map([...e.bindingsPorCuenta].map(([k, v]) => [k, [...v]])),
    historial: [...e.historial],
  };
}

export interface DatosDeAlta {
  genesisSubjectRef: string;
  custodyProfile: CustodyProfile;
  policyVersion: string;
  createdAt?: string;
}

export class DirectorioDeCuentas {
  private estado: Estado = estadoVacio();

  /* Monotónico: JAMÁS se restaura en una reversión. Es lo que impide que un
     número que ya se mostró a alguien se entregue después a otra persona. */
  private readonly numerosConsumidos = new Set<string>();

  /* ---------------------------------------------------------------- cuentas */

  crearCuenta(datos: DatosDeAlta): SFSPAccount {
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
    return cuenta;
  }

  /** Sortea números hasta dar con uno libre. La colisión se resuelve aquí, no se reza. */
  private reservarNumeroLibre(): string {
    for (let intento = 0; intento < MAX_REINTENTOS_NUMERO; intento++) {
      const candidato = generarNumeroCuenta();
      const clave = claveDeIndice(candidato);
      if (this.numerosConsumidos.has(clave)) continue;
      if (this.estado.numeroAId.has(clave)) continue;
      this.numerosConsumidos.add(clave);
      return candidato;
    }
    /* Con doce dígitos esto no debería pasar nunca. Si pasa, algo va mal con el
       generador y lo correcto es parar, no seguir sorteando. */
    throw new ErrorSFSP('UNKNOWN_SOURCE', 'no se consiguió un número libre tras varios intentos');
  }

  cuentaPorId(accountId: string): SFSPAccount | null {
    return this.estado.cuentasPorId.get(accountId) ?? null;
  }

  cuentaPorNumero(accountNumber: string): SFSPAccount | null {
    if (!esNumeroValido(accountNumber)) return null;
    const id = this.estado.numeroAId.get(claveDeIndice(accountNumber));
    return id ? (this.estado.cuentasPorId.get(id) ?? null) : null;
  }

  get totalCuentas(): number {
    return this.estado.cuentasPorId.size;
  }

  /** Números que existieron alguna vez. Ninguno se vuelve a entregar. */
  get totalNumerosConsumidos(): number {
    return this.numerosConsumidos.size;
  }

  /* ------------------------------------------------------------------ alias */

  registrarAlias(accountId: string, aliasPedido: string, cuandoISO?: string): AliasRecord {
    const cuenta = this.cuentaPorId(accountId);
    if (!cuenta) throw new ErrorSFSP('DENY_POLICY', 'la cuenta no existe');

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
    return registro;
  }

  aliasDe(accountId: string): AliasRecord[] {
    return [...this.estado.aliasPorNormalizado.values()].filter(
      (a) => a.accountId === accountId && a.status === 'ACTIVE',
    );
  }

  cuentaPorAlias(aliasPedido: string): SFSPAccount | null {
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
  cambiarAlias(accountId: string, aliasNuevo: string, cuandoISO?: string): AliasRecord {
    const actuales = this.aliasDe(accountId);
    const nuevo = this.registrarAlias(accountId, aliasNuevo, cuandoISO);
    for (const viejo of actuales) {
      viejo.status = 'RELEASED';
      viejo.releasedAt = cuandoISO ?? new Date().toISOString();
      /* El esqueleto se conserva apuntando al alias nuevo si coincide; si no,
         se libera para que otro pueda tomarlo bajo la política D17. */
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
  ): WalletBinding {
    const cuenta = this.cuentaPorId(accountId);
    if (!cuenta) throw new ErrorSFSP('DENY_POLICY', 'la cuenta no existe');

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
    return binding;
  }

  binding(bindingId: string): WalletBinding | null {
    return this.estado.bindingsPorId.get(bindingId) ?? null;
  }

  bindingsDe(accountId: string): WalletBinding[] {
    return (this.estado.bindingsPorCuenta.get(accountId) ?? []).map(
      (id) => this.estado.bindingsPorId.get(id) as WalletBinding,
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
  ): WalletBinding {
    const actual = this.binding(bindingId);
    if (!actual) throw new ErrorSFSP('DENY_POLICY', 'la ruta no existe');

    const { binding: nuevo, evento } = transicionar(actual, hacia, actor, motivo, cuandoISO);

    if (hacia === 'PRIMARY') {
      const cuenta = this.cuentaPorId(actual.accountId);
      if (!cuenta) throw new ErrorSFSP('DENY_POLICY', 'la cuenta no existe');
      const anteriorId = cuenta.primaryBindingId;
      if (anteriorId && anteriorId !== bindingId) {
        const anterior = this.binding(anteriorId);
        if (anterior && anterior.status === 'PRIMARY') {
          const degradado = transicionar(
            anterior,
            'ACTIVE',
            actor,
            'otra ruta pasó a primaria',
            cuandoISO,
          );
          this.estado.bindingsPorId.set(anterior.bindingId, degradado.binding);
          this.estado.historial.push(degradado.evento);
        }
      }
      cuenta.primaryBindingId = bindingId;
    } else if (hacia === 'REVOKED' || hacia === 'SUSPENDED') {
      const cuenta = this.cuentaPorId(actual.accountId);
      if (cuenta && cuenta.primaryBindingId === bindingId) cuenta.primaryBindingId = null;
    }

    this.estado.bindingsPorId.set(bindingId, nuevo);
    this.estado.historial.push(evento);
    return nuevo;
  }

  get historial(): readonly EventoDeBinding[] {
    return this.estado.historial;
  }

  /** Cuántas rutas primarias tiene una cuenta. Siempre debe ser 0 o 1. */
  rutasPrimarias(accountId: string): number {
    return this.bindingsDe(accountId).filter((b) => b.status === 'PRIMARY').length;
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

  /* -------------------------------------------------------------- reversión */

  /**
   * Devuelve una instantánea para poder deshacer un lote. La reversión NO
   * devuelve los números de cuenta al sorteo: ese conjunto es monotónico.
   */
  instantanea(): Estado {
    return clonar(this.estado);
  }

  restaurar(instantanea: Estado): void {
    this.estado = clonar(instantanea);
  }
}
