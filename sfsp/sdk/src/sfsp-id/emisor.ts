/* El emisor de credenciales de Genesis ID (SFSP-160 §6).
 *
 * Todo lo que Genesis ID hace al aprobar a una persona, en un solo lugar y con
 * sus dependencias inyectadas: la persistencia, la firma de cadena (KMS) y el
 * envío a la 5550 los pone el servicio; aquí está la regla. Así el servicio es
 * una capa fina y la regla se prueba sin red, sin base y sin nodo.
 *
 * Reglas que no se negocian:
 *   · La aprobación es humana (SFSP-110 §0). Este módulo NO decide aprobar:
 *     recibe la aprobación ya firmada por quien tiene facultad.
 *   · El emisor NO guarda las divulgaciones: se entregan a la persona y se
 *     olvidan. Guardar los claims con su sal sería guardar la llave para
 *     reconstruir lo que la persona decide revelar.
 *   · El índice en la lista de estado es AL AZAR: índices consecutivos dirían
 *     en qué orden se aprobó a la gente.
 *   · Revocar es revocar en las dos partes (lista y cadena) o en ninguna
 *     visible: si la cadena falla, la lista ya revocada queda y la operación se
 *     reintenta, porque la dirección segura es «revocada». */

import { randomInt } from 'node:crypto';
import { ErrorSFSP } from '../codigos.js';
import { b32Texto } from './codificacion.js';
import { emitirCredencial, type Emisor, type Emision } from './credencial.js';
import { ListaDeEstado, firmarLista } from './estado.js';
import { digestDeAtestacion, proyectarCredencial, type AtestacionSFSP } from './proyeccion.js';

export interface AlmacenEmisor {
  /** Estado de la lista vigente, cifrado en reposo por el servicio. */
  leerLista(url: string): Promise<ListaDeEstado | null>;
  guardarLista(url: string, lista: ListaDeEstado, jwt: string): Promise<void>;
  /** Índices ya dados en una lista: para no repetir. */
  indiceUsado(url: string, i: number): Promise<boolean>;
  /** Qué se emitió, sin datos personales: id, propósito, índice, compromiso, vigencia. */
  registrarEmision(r: RegistroEmision): Promise<void>;
  leerEmision(credencialId: string): Promise<RegistroEmision | null>;
  marcarRevocada(credencialId: string, motivo: string, enCadena: boolean): Promise<void>;
}

export interface RegistroEmision {
  credencialId: string;
  proposito: string;
  sujeto: string;
  lista: string;
  indice: number;
  atestacion: AtestacionSFSP;
  validoHasta: string;
  revocada: boolean;
}

export interface Cadena {
  chainId: number;
  adaptador: string;
  /** Firma secp256k1 del digest, con la llave del emisor en el KMS. */
  firmar(digest: string): Promise<string>;
  /** `recordAttestation(att, firma)` como ATTESTOR. Devuelve el hash de la transacción. */
  registrar(att: AtestacionSFSP, firma: string): Promise<string>;
  /** `revokeAttestation(compromiso, propósito, motivo)` como ATTESTOR. */
  revocar(subjectCommitment: string, purpose: string, motivo: string): Promise<string>;
}

export interface Aprobacion {
  /** Quién aprobó (su identificador de operador), que la bitácora firmada guarda. */
  aprobadaPor: string;
  expediente: string;
}

export interface ResultadoEmision {
  emision: Emision;
  atestacion: AtestacionSFSP;
  digest: string;
  firma: string;
  tx: string | null;
}

export class EmisorGenesis {
  constructor(
    private readonly emisor: Emisor,
    private readonly almacen: AlmacenEmisor,
    private readonly cadena: Cadena,
    private readonly listaUrl: string,
    /** Interruptor propio: apagado salvo que el servicio lo encienda (patrón de Ordenex). */
    private readonly publicarEnCadena: boolean,
  ) {}

  private async lista(): Promise<ListaDeEstado> {
    return (await this.almacen.leerLista(this.listaUrl)) ?? new ListaDeEstado();
  }

  private async indiceAlAzar(lista: ListaDeEstado): Promise<number> {
    for (let intento = 0; intento < 64; intento++) {
      const i = randomInt(0, lista.tamano);
      if (!(await this.almacen.indiceUsado(this.listaUrl, i))) return i;
    }
    throw new ErrorSFSP('REVIEW_REQUIRED', 'lista de estado casi llena: abrir una nueva');
  }

  async emitir(o: {
    aprobacion: Aprobacion;
    sujeto: string;
    proposito: string;
    claims: Record<string, unknown>;
    politica: string;
    validoDesde: Date;
    validoHasta: Date;
    /** Del directorio privado: nunca salen de Genesis ID. */
    subjectRef: string;
    salt: string;
  }): Promise<ResultadoEmision> {
    if (!o.aprobacion.aprobadaPor || !o.aprobacion.expediente) {
      throw new ErrorSFSP('DENY_AUTHORIZATION', 'sin aprobación humana no se emite (SFSP-110 §0)');
    }
    const lista = await this.lista();
    const indice = await this.indiceAlAzar(lista);
    const emision = emitirCredencial({
      emisor: this.emisor,
      sujeto: o.sujeto,
      proposito: o.proposito,
      claims: o.claims,
      politica: o.politica,
      validoDesde: o.validoDesde,
      validoHasta: o.validoHasta,
      estado: { lista: this.listaUrl, indice },
    });
    const atestacion = proyectarCredencial(emision.credencial, o.subjectRef, o.salt);
    const digest = digestDeAtestacion(atestacion, this.cadena.chainId, this.cadena.adaptador);
    const firma = await this.cadena.firmar(digest);
    await this.almacen.registrarEmision({
      credencialId: emision.credencial.id,
      proposito: o.proposito,
      sujeto: o.sujeto,
      lista: this.listaUrl,
      indice,
      atestacion,
      validoHasta: emision.credencial.validUntil,
      revocada: false,
    });
    const tx = this.publicarEnCadena ? await this.cadena.registrar(atestacion, firma) : null;
    return { emision, atestacion, digest, firma, tx };
  }

  /** Revoca en la lista (ya) y en la cadena. Devuelve el JWT nuevo de la lista. */
  async revocar(credencialId: string, motivo: string): Promise<{ listaJwt: string; tx: string | null }> {
    const r = await this.almacen.leerEmision(credencialId);
    if (!r) throw new ErrorSFSP('UNKNOWN_SOURCE', 'no hay registro de esa credencial');
    const lista = await this.lista();
    lista.marcar(r.indice, true);
    const listaJwt = firmarLista({ emisor: this.emisor, url: this.listaUrl, lista });
    await this.almacen.guardarLista(this.listaUrl, lista, listaJwt);
    let tx: string | null = null;
    if (this.publicarEnCadena) {
      tx = await this.cadena.revocar(r.atestacion.subjectCommitment, r.atestacion.purpose, b32Texto(motivo));
    }
    await this.almacen.marcarRevocada(credencialId, motivo, tx !== null);
    return { listaJwt, tx };
  }
}
