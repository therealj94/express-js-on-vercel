/* Directorio de cuentas sobre un almacén durable (P01, P10).
 *
 * El directorio en memoria de `directorio.ts` es la implementación de
 * referencia: dice qué significa cada operación. Éste dice quién la arbitra
 * cuando hay dos a la vez, que es una pregunta distinta y la que la auditoría
 * dejó sin responder.
 *
 * La diferencia de fondo con el de memoria: aquí **no se comprueba y después se
 * escribe**. Se escribe, y si el índice único rechaza, se lee el rechazo. Entre
 * un `SELECT` que dice «está libre» y un `INSERT` que se lo cree cabe otra
 * transacción, y esa grieta es exactamente por donde se cuelan dos cuentas con
 * el mismo número o dos alias que se ven igual.
 *
 * Usa `node:sqlite`, que viene con Node y no añade dependencias. No pretende ser
 * el almacén de producción: pretende demostrar que las invariantes se sostienen
 * cuando el hilo único desaparece, y servir de contrato para el adaptador que
 * se escriba de verdad. */

import { DatabaseSync } from 'node:sqlite';
import { ESQUEMA } from './esquema.js';
import { nuevoId } from '../ids.js';
import { generarNumeroCuenta, claveDeIndice, esNumeroValido } from '../numeroCuenta.js';
import { normalizarAlias, esReservado } from '../alias.js';
import { normalizarDireccion } from '../direccion.js';
import { transicionPermitida, estaVigente, resolverDestino } from '../binding.js';
import type { ResolucionDeDestino } from '../binding.js';
import { ErrorSFSP } from '../codigos.js';
import type {
  SFSPAccount,
  AliasRecord,
  WalletBinding,
  CustodyProfile,
  BindingPurpose,
  BindingStatus,
} from '../tipos.js';

/* Mismo techo que el directorio en memoria, con otro nombre para que los dos
   puedan exportarse sin que uno tape al otro. */
export const MAX_REINTENTOS_NUMERO_DURABLE = 8;

/** ¿Es este error una violación de restricción de unicidad? */
function esViolacionDeUnico(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  const texto = `${e?.code ?? ''} ${e?.message ?? ''}`;
  return /UNIQUE|PRIMARY KEY|constraint failed/i.test(texto);
}

export interface OpcionesDurable {
  /** Ruta del archivo. Cada conexión abre la misma para competir de verdad. */
  ruta: string;
  /**
   * Generador de números, inyectable para poder forzar colisiones en las
   * pruebas. Sin esto, una colisión de doce dígitos no se ve nunca y la rama
   * que la resuelve no se ejercita jamás.
   */
  generarNumero?: () => string;
}

export interface DatosDeAltaDurable {
  genesisSubjectRef: string;
  custodyProfile: CustodyProfile;
  policyVersion: string;
  createdAt?: string;
  refCuentaOrigen?: string;
  censoId?: string;
}

export class DirectorioDurable {
  private readonly db: DatabaseSync;
  private readonly generarNumero: () => string;

  constructor(opciones: OpcionesDurable) {
    this.db = new DatabaseSync(opciones.ruta);
    /* WAL permite que un lector no bloquee a un escritor, que es la situación
       normal cuando varias conexiones trabajan a la vez. */
    this.db.exec('PRAGMA journal_mode = WAL');
    /* Si otra conexión tiene la escritura tomada, se espera en vez de fallar al
       instante: un fallo por contención no es una invariante rota. */
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.db.exec(ESQUEMA);
    this.generarNumero = opciones.generarNumero ?? generarNumeroCuenta;
  }

  cerrar(): void {
    this.db.close();
  }

  private enTransaccion<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        /* ya deshecha */
      }
      throw error;
    }
  }

  /* ---------------------------------------------------------------- cuentas */

  /**
   * Consume un número. Devuelve true si lo ganó esta conexión.
   *
   * Va en su PROPIA transacción, confirmada antes de crear la cuenta. Si el
   * alta falla después, el número sigue consumido: eso es deliberado y es la
   * mitad de la afirmación A3 que el conjunto en memoria no podía sostener
   * entre dos procesos.
   */
  private consumirNumero(clave: string, cuando: string, corridaId: string | null): boolean {
    try {
      this.db
        .prepare('INSERT INTO numero_consumido (clave_indice, consumido_en, corrida_id) VALUES (?, ?, ?)')
        .run(clave, cuando, corridaId);
      return true;
    } catch (error) {
      if (esViolacionDeUnico(error)) return false;
      throw error;
    }
  }

  crearCuenta(datos: DatosDeAltaDurable): Readonly<SFSPAccount> {
    const cuando = datos.createdAt ?? new Date().toISOString();

    for (let intento = 0; intento < MAX_REINTENTOS_NUMERO_DURABLE; intento++) {
      const numero = this.generarNumero();
      const clave = claveDeIndice(numero);

      /* El árbitro es el índice, no una lectura previa. */
      if (!this.consumirNumero(clave, cuando, datos.censoId ?? null)) continue;

      const cuenta: SFSPAccount = {
        accountId: nuevoId('acc'),
        accountNumber: numero,
        status: 'ACTIVE',
        createdAt: cuando,
        genesisSubjectRef: datos.genesisSubjectRef,
        custodyProfile: datos.custodyProfile,
        primaryBindingId: null,
        policyVersion: datos.policyVersion,
      };

      try {
        this.enTransaccion(() => {
          this.db
            .prepare(
              `INSERT INTO cuenta
                 (account_id, account_number, clave_indice, status, created_at,
                  genesis_subject_ref, custody_profile, primary_binding_id, policy_version)
               VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
            )
            .run(
              cuenta.accountId,
              cuenta.accountNumber,
              clave,
              cuenta.status,
              cuenta.createdAt,
              cuenta.genesisSubjectRef,
              cuenta.custodyProfile,
              cuenta.policyVersion,
            );

          if (datos.refCuentaOrigen !== undefined) {
            this.db
              .prepare(
                `INSERT INTO origen_cuenta (ref_cuenta_origen, account_id, account_number, binding_id, censo_id)
                 VALUES (?, ?, ?, '', ?)`,
              )
              .run(datos.refCuentaOrigen, cuenta.accountId, cuenta.accountNumber, datos.censoId ?? null);
          }
        });
      } catch (error) {
        if (esViolacionDeUnico(error) && datos.refCuentaOrigen !== undefined) {
          throw new ErrorSFSP(
            'DENY_POLICY',
            `la cuenta de origen ${datos.refCuentaOrigen} ya tiene una cuenta SFSP`,
          );
        }
        throw error;
      }

      return Object.freeze(cuenta);
    }

    /* Con doce dígitos esto no debería pasar nunca. Si pasa, algo va mal con el
       generador y lo correcto es parar, no seguir sorteando. */
    throw new ErrorSFSP('UNKNOWN_SOURCE', 'no se consiguió un número libre tras varios intentos');
  }

  private fila(sql: string, ...args: unknown[]): Record<string, unknown> | undefined {
    return this.db.prepare(sql).get(...(args as never[])) as Record<string, unknown> | undefined;
  }

  private filas(sql: string, ...args: unknown[]): Array<Record<string, unknown>> {
    return this.db.prepare(sql).all(...(args as never[])) as Array<Record<string, unknown>>;
  }

  private aCuenta(f: Record<string, unknown>): SFSPAccount {
    return Object.freeze({
      accountId: f['account_id'] as string,
      accountNumber: f['account_number'] as string,
      status: f['status'] as SFSPAccount['status'],
      createdAt: f['created_at'] as string,
      genesisSubjectRef: f['genesis_subject_ref'] as string,
      custodyProfile: f['custody_profile'] as CustodyProfile,
      primaryBindingId: (f['primary_binding_id'] as string | null) ?? null,
      policyVersion: f['policy_version'] as string,
    });
  }

  cuentaPorId(accountId: string): Readonly<SFSPAccount> | null {
    const f = this.fila('SELECT * FROM cuenta WHERE account_id = ?', accountId);
    return f ? this.aCuenta(f) : null;
  }

  cuentaPorNumero(accountNumber: string): Readonly<SFSPAccount> | null {
    if (!esNumeroValido(accountNumber)) return null;
    const f = this.fila('SELECT * FROM cuenta WHERE clave_indice = ?', claveDeIndice(accountNumber));
    return f ? this.aCuenta(f) : null;
  }

  get totalCuentas(): number {
    return Number((this.fila('SELECT COUNT(*) AS n FROM cuenta') as { n: number }).n);
  }

  get totalNumerosConsumidos(): number {
    return Number((this.fila('SELECT COUNT(*) AS n FROM numero_consumido') as { n: number }).n);
  }

  get totalOrigenesLigados(): number {
    return Number((this.fila('SELECT COUNT(*) AS n FROM origen_cuenta') as { n: number }).n);
  }

  /** ¿Se entregó alguna vez este número? Incluye corridas deshechas. */
  numeroFueConsumido(accountNumber: string): boolean {
    return (
      this.fila('SELECT 1 AS x FROM numero_consumido WHERE clave_indice = ?', claveDeIndice(accountNumber)) !==
      undefined
    );
  }

  /* ------------------------------------------------- correspondencia origen */

  ligarOrigen(
    refCuentaOrigen: string,
    par: { accountId: string; accountNumber: string; bindingId: string },
    censoId?: string,
  ): void {
    try {
      this.db
        .prepare(
          `INSERT INTO origen_cuenta (ref_cuenta_origen, account_id, account_number, binding_id, censo_id)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(ref_cuenta_origen) DO UPDATE SET binding_id = excluded.binding_id
             WHERE origen_cuenta.account_id = excluded.account_id`,
        )
        .run(refCuentaOrigen, par.accountId, par.accountNumber, par.bindingId, censoId ?? null);
    } catch (error) {
      if (esViolacionDeUnico(error)) {
        throw new ErrorSFSP('DENY_POLICY', `la cuenta de origen ${refCuentaOrigen} ya está ligada`);
      }
      throw error;
    }
    const actual = this.parDeOrigen(refCuentaOrigen);
    if (actual && actual.accountId !== par.accountId) {
      throw new ErrorSFSP('DENY_POLICY', `la cuenta de origen ${refCuentaOrigen} ya está ligada`);
    }
  }

  parDeOrigen(
    refCuentaOrigen: string,
  ): Readonly<{ refCuentaOrigen: string; accountId: string; accountNumber: string; bindingId: string }> | null {
    const f = this.fila('SELECT * FROM origen_cuenta WHERE ref_cuenta_origen = ?', refCuentaOrigen);
    if (!f) return null;
    return Object.freeze({
      refCuentaOrigen: f['ref_cuenta_origen'] as string,
      accountId: f['account_id'] as string,
      accountNumber: f['account_number'] as string,
      bindingId: f['binding_id'] as string,
    });
  }

  /* ---------------------------------------------------------- corridas C4 */

  /** Abre una corrida. Dos a la vez sobre el mismo censo: gana una. */
  abrirCorrida(censoId: string, cuando: string = new Date().toISOString()): string {
    const corridaId = nuevoId('op');
    try {
      this.db
        .prepare(
          `INSERT INTO corrida_migracion (corrida_id, censo_id, estado, iniciada_en)
           VALUES (?, ?, 'EN_CURSO', ?)`,
        )
        .run(corridaId, censoId, cuando);
    } catch (error) {
      if (esViolacionDeUnico(error)) {
        throw new ErrorSFSP('DENY_LIMIT', `ya hay una corrida en curso para el censo ${censoId}`);
      }
      throw error;
    }
    return corridaId;
  }

  cerrarCorrida(corridaId: string, cuando: string = new Date().toISOString()): void {
    this.db
      .prepare(`UPDATE corrida_migracion SET estado = 'CERRADA', cerrada_en = ? WHERE corrida_id = ?`)
      .run(cuando, corridaId);
  }

  /* ------------------------------------------------------------------ alias */

  registrarAlias(accountId: string, aliasPedido: string, cuandoISO?: string): Readonly<AliasRecord> {
    if (!this.cuentaPorId(accountId)) throw new ErrorSFSP('DENY_POLICY', 'la cuenta no existe');

    const n = normalizarAlias(aliasPedido);
    if (esReservado(n.normalized)) throw new ErrorSFSP('DENY_POLICY', 'ese alias está reservado');

    const registro: AliasRecord = {
      alias: n.alias,
      normalized: n.normalized,
      skeleton: n.skeleton,
      accountId,
      status: 'ACTIVE',
      createdAt: cuandoISO ?? new Date().toISOString(),
      releasedAt: null,
    };

    /* Un alias liberado puede volver a tomarse: por eso el índice del esqueleto
       es parcial. Pero la fila sigue ahí, con su historia, así que tomarlo es
       reactivarla con dueño nuevo, no insertar una segunda.
       Las dos ramas van en UNA transacción: entre comprobar que está liberado y
       reactivarlo cabe otro que haga lo mismo, y el condicional del UPDATE es
       lo que decide, no la lectura. */
    try {
      this.enTransaccion(() => {
        const r = this.db
          .prepare(
            `UPDATE alias
                SET alias = ?, skeleton = ?, account_id = ?, status = 'ACTIVE',
                    created_at = ?, released_at = NULL
              WHERE normalized = ? AND status = 'RELEASED'`,
          )
          .run(registro.alias, registro.skeleton, accountId, registro.createdAt, registro.normalized);

        if (Number(r.changes) === 0) {
          this.db
            .prepare(
              `INSERT INTO alias (normalized, alias, skeleton, account_id, status, created_at, released_at)
               VALUES (?, ?, ?, ?, 'ACTIVE', ?, NULL)`,
            )
            .run(registro.normalized, registro.alias, registro.skeleton, accountId, registro.createdAt);
        }
      });
    } catch (error) {
      if (esViolacionDeUnico(error)) {
        /* El índice no dice cuál de los dos disparó, así que se mira después
           para dar un mensaje útil. La decisión ya la tomó la base. */
        const mismo = this.fila(
          `SELECT 1 AS x FROM alias WHERE normalized = ? AND status = 'ACTIVE'`,
          n.normalized,
        );
        throw new ErrorSFSP(
          'DENY_POLICY',
          mismo ? 'ese alias ya está tomado' : 'ya existe un alias que se ve igual que ése',
        );
      }
      throw error;
    }
    return Object.freeze(registro);
  }

  private aAlias(f: Record<string, unknown>): AliasRecord {
    return Object.freeze({
      alias: f['alias'] as string,
      normalized: f['normalized'] as string,
      skeleton: f['skeleton'] as string,
      accountId: f['account_id'] as string,
      status: f['status'] as AliasRecord['status'],
      createdAt: f['created_at'] as string,
      releasedAt: (f['released_at'] as string | null) ?? null,
    });
  }

  aliasDe(accountId: string): ReadonlyArray<Readonly<AliasRecord>> {
    return this.filas(`SELECT * FROM alias WHERE account_id = ? AND status = 'ACTIVE'`, accountId).map((f) =>
      this.aAlias(f),
    );
  }

  cuentaPorAlias(aliasPedido: string): Readonly<SFSPAccount> | null {
    let n;
    try {
      n = normalizarAlias(aliasPedido);
    } catch {
      return null;
    }
    const f = this.fila(`SELECT account_id FROM alias WHERE normalized = ? AND status = 'ACTIVE'`, n.normalized);
    return f ? this.cuentaPorId(f['account_id'] as string) : null;
  }

  /**
   * Cambia de alias. Liberar el viejo y tomar el nuevo van en UNA transacción:
   * si se hiciera en dos, entre medias la cuenta se queda sin alias y otro
   * puede llevarse el que acaba de soltar.
   */
  cambiarAlias(accountId: string, aliasNuevo: string, cuandoISO?: string): Readonly<AliasRecord> {
    const cuando = cuandoISO ?? new Date().toISOString();
    const n = normalizarAlias(aliasNuevo);
    if (esReservado(n.normalized)) throw new ErrorSFSP('DENY_POLICY', 'ese alias está reservado');

    return this.enTransaccion(() => {
      this.db
        .prepare(`UPDATE alias SET status = 'RELEASED', released_at = ? WHERE account_id = ? AND status = 'ACTIVE'`)
        .run(cuando, accountId);
      try {
        this.db
          .prepare(
            `INSERT INTO alias (normalized, alias, skeleton, account_id, status, created_at, released_at)
             VALUES (?, ?, ?, ?, 'ACTIVE', ?, NULL)`,
          )
          .run(n.normalized, n.alias, n.skeleton, accountId, cuando);
      } catch (error) {
        if (esViolacionDeUnico(error)) throw new ErrorSFSP('DENY_POLICY', 'ese alias ya está tomado');
        throw error;
      }
      return Object.freeze({
        alias: n.alias,
        normalized: n.normalized,
        skeleton: n.skeleton,
        accountId,
        status: 'ACTIVE' as const,
        createdAt: cuando,
        releasedAt: null,
      });
    });
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
    if (!this.cuentaPorId(accountId)) throw new ErrorSFSP('DENY_POLICY', 'la cuenta no existe');

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
    this.db
      .prepare(
        `INSERT INTO binding
           (binding_id, account_id, chain_id, address, purpose, status, custody_profile, valid_from, valid_until, version)
         VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, 1)`,
      )
      .run(
        binding.bindingId,
        accountId,
        chainId,
        binding.address,
        purpose,
        custodyProfile,
        validFrom,
        validUntil,
      );
    return Object.freeze(binding);
  }

  private aBinding(f: Record<string, unknown>): WalletBinding {
    return Object.freeze({
      bindingId: f['binding_id'] as string,
      accountId: f['account_id'] as string,
      chainId: Number(f['chain_id']),
      address: f['address'] as string,
      purpose: f['purpose'] as BindingPurpose,
      status: f['status'] as BindingStatus,
      custodyProfile: f['custody_profile'] as CustodyProfile,
      validFrom: f['valid_from'] as string,
      validUntil: (f['valid_until'] as string | null) ?? null,
      version: Number(f['version']),
    });
  }

  binding(bindingId: string): Readonly<WalletBinding> | null {
    const f = this.fila('SELECT * FROM binding WHERE binding_id = ?', bindingId);
    return f ? this.aBinding(f) : null;
  }

  bindingsDe(accountId: string): ReadonlyArray<Readonly<WalletBinding>> {
    return this.filas('SELECT * FROM binding WHERE account_id = ?', accountId).map((f) => this.aBinding(f));
  }

  rutasPrimarias(accountId: string): number {
    const f = this.fila(
      `SELECT COUNT(*) AS n FROM binding WHERE account_id = ? AND status = 'PRIMARY'`,
      accountId,
    ) as { n: number };
    return Number(f.n);
  }

  /**
   * Cambia el estado de una ruta con **versión optimista**.
   *
   * El `UPDATE` lleva la versión esperada en su `WHERE`. Dos transacciones que
   * parten de la misma versión: una cambia una fila, la otra cambia cero y se
   * entera. Sin eso, la segunda pisa a la primera y el historial se queda con un
   * salto que nadie puede explicar después.
   */
  cambiarEstadoBinding(
    bindingId: string,
    hacia: BindingStatus,
    actor: string,
    motivo: string,
    cuandoISO: string = new Date().toISOString(),
    versionEsperada?: number,
  ): Readonly<WalletBinding> {
    return this.enTransaccion(() => {
      const actual = this.binding(bindingId);
      if (!actual) throw new ErrorSFSP('DENY_POLICY', 'la ruta no existe');
      const version = versionEsperada ?? actual.version;

      if (!transicionPermitida(actual.status, hacia)) {
        throw new ErrorSFSP('DENY_ASSET_STATE', `transición no permitida de ${actual.status} a ${hacia}`);
      }

      if (hacia === 'PRIMARY') {
        /* Se degrada CUALQUIER otra primaria de la cuenta y red antes de
           promover: el índice parcial no admite dos, y el orden importa. */
        for (const otra of this.filas(
          `SELECT * FROM binding WHERE account_id = ? AND chain_id = ? AND status = 'PRIMARY' AND binding_id <> ?`,
          actual.accountId,
          actual.chainId,
          bindingId,
        )) {
          const b = this.aBinding(otra);
          this.db
            .prepare(`UPDATE binding SET status = 'ACTIVE', version = version + 1 WHERE binding_id = ? AND version = ?`)
            .run(b.bindingId, b.version);
          this.db
            .prepare(
              `INSERT INTO binding_historial (binding_id, version, desde, hacia, actor, motivo, en_iso)
               VALUES (?, ?, ?, 'ACTIVE', ?, 'otra ruta pasó a primaria', ?)`,
            )
            .run(b.bindingId, b.version + 1, b.status, actor, cuandoISO);
        }
      }

      const r = this.db
        .prepare('UPDATE binding SET status = ?, version = version + 1 WHERE binding_id = ? AND version = ?')
        .run(hacia, bindingId, version);

      if (Number(r.changes) !== 1) {
        throw new ErrorSFSP(
          'DENY_AUTHORIZATION',
          'la ruta cambió desde la versión que se leyó: reintentá con el estado actual',
        );
      }

      this.db
        .prepare(
          `INSERT INTO binding_historial (binding_id, version, desde, hacia, actor, motivo, en_iso)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(bindingId, version + 1, actual.status, hacia, actor, motivo, cuandoISO);

      if (hacia === 'PRIMARY') {
        this.db.prepare('UPDATE cuenta SET primary_binding_id = ? WHERE account_id = ?').run(bindingId, actual.accountId);
      } else if (hacia === 'REVOKED' || hacia === 'SUSPENDED') {
        this.db
          .prepare('UPDATE cuenta SET primary_binding_id = NULL WHERE account_id = ? AND primary_binding_id = ?')
          .run(actual.accountId, bindingId);
      }

      return this.binding(bindingId) as Readonly<WalletBinding>;
    });
  }

  get historial(): ReadonlyArray<Readonly<Record<string, unknown>>> {
    return this.filas('SELECT * FROM binding_historial ORDER BY en_iso, version').map((f) => Object.freeze(f));
  }

  /* ------------------------------------------------------------- resolución */

  resolver(destino: string, chainId: number, ahoraISO: string = new Date().toISOString()): ResolucionDeDestino {
    const cuenta = this.cuentaPorNumero(destino) ?? this.cuentaPorAlias(destino);
    if (!cuenta) throw new ErrorSFSP('DENY_POLICY', 'no hay ninguna cuenta con ese destino');
    if (cuenta.status !== 'ACTIVE') throw new ErrorSFSP('DENY_ASSET_STATE', 'la cuenta de destino no está activa');

    const rutas = this.bindingsDe(cuenta.accountId).filter(
      (b) => b.chainId === chainId && estaVigente(b, ahoraISO),
    );
    const elegida = rutas.find((b) => b.status === 'PRIMARY') ?? rutas[0];
    if (!elegida) throw new ErrorSFSP('DENY_ASSET_STATE', 'la cuenta no tiene una ruta vigente en esa red');
    return resolverDestino(cuenta.accountNumber, elegida, ahoraISO);
  }

  /**
   * Ejecuta contra la ruta leída, **condicionando la escritura a su versión**.
   *
   * La revalidación previa acota la ventana de la carrera; no la cierra. Lo que
   * la cierra es que la condición viaje dentro del `UPDATE`. Aquí se comprueba
   * que la ruta siga en la versión y el estado de la resolución en el mismo
   * momento en que se escribe.
   */
  ejecutarContraRuta(resolucion: ResolucionDeDestino, ahoraISO: string = new Date().toISOString()): void {
    this.enTransaccion(() => {
      const f = this.fila(
        `SELECT * FROM binding WHERE binding_id = ? AND version = ? AND address = ? AND chain_id = ?`,
        resolucion.bindingId,
        resolucion.version,
        resolucion.address,
        resolucion.chainId,
      );
      if (!f) throw new ErrorSFSP('DENY_AUTHORIZATION', 'el destino cambió después de resolverse');
      const b = this.aBinding(f);
      if (!estaVigente(b, ahoraISO)) {
        throw new ErrorSFSP('DENY_ASSET_STATE', 'la ruta dejó de estar vigente');
      }
    });
  }

  /* ------------------------------------------------------ idempotencia (C5) */

  /**
   * Registra una operación por identificador y huella.
   *
   * El mismo identificador con OTRA huella no es un reintento: es un error de
   * quien llama, y se rechaza en vez de devolverle el resultado de la primera.
   * Devolvérselo sería peor que fallar: creería que se ejecutó lo que pidió.
   */
  registrarOperacion(
    operationId: string,
    huella: string,
    cuando: string = new Date().toISOString(),
  ): 'NUEVA' | 'REPETIDA' {
    try {
      this.db
        .prepare('INSERT INTO operacion (operation_id, huella, ejecutada_en) VALUES (?, ?, ?)')
        .run(operationId, huella, cuando);
      return 'NUEVA';
    } catch (error) {
      if (!esViolacionDeUnico(error)) throw error;
      const f = this.fila('SELECT huella FROM operacion WHERE operation_id = ?', operationId);
      if (f && f['huella'] === huella) return 'REPETIDA';
      throw new ErrorSFSP(
        'DENY_AUTHORIZATION',
        'ese identificador de operación ya se usó con otra petición',
      );
    }
  }

  /* ------------------------------------------------------------ invariantes */

  /** Las mismas invariantes del directorio en memoria, comprobadas en la base. */
  invariantes(): string[] {
    const fallos: string[] = [];

    for (const f of this.filas(
      `SELECT account_id, chain_id, COUNT(*) AS n FROM binding WHERE status = 'PRIMARY'
       GROUP BY account_id, chain_id HAVING n > 1`,
    )) {
      fallos.push(`la cuenta ${f['account_id']} tiene ${f['n']} rutas primarias en la red ${f['chain_id']}`);
    }

    for (const f of this.filas(
      `SELECT c.account_id FROM cuenta c
       LEFT JOIN numero_consumido n ON n.clave_indice = c.clave_indice
       WHERE n.clave_indice IS NULL`,
    )) {
      fallos.push(`el número de la cuenta ${f['account_id']} no figura como consumido`);
    }

    for (const f of this.filas(
      `SELECT c.account_id, b.status FROM cuenta c JOIN binding b ON b.binding_id = c.primary_binding_id
       WHERE b.status <> 'PRIMARY'`,
    )) {
      fallos.push(`la cuenta ${f['account_id']} apunta como primaria a una ruta en estado ${f['status']}`);
    }

    for (const f of this.filas(
      `SELECT normalized, COUNT(*) AS n FROM alias
       WHERE status IN ('ACTIVE','RESERVED','DISPUTED') GROUP BY skeleton HAVING n > 1`,
    )) {
      fallos.push(`hay ${f['n']} alias activos que se ven igual que ${f['normalized']}`);
    }

    return fallos;
  }
}
