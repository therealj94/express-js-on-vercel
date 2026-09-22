// Verificacion criptografica real de las aprobaciones de DBNX (hallazgo H03).
//
// ================= LO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR =================
// Antes de esto, `dbnx-api` no hacia UNA SOLA llamada criptografica. Las firmas
// eran cadenas que nadie verificaba, y el auditor reprodujo dos cosas:
//
//   1. `approvals: [{}]` devolvia `ok: true`.
//   2. El mismo actor podia aparecer como COMITE y como SISTEMA, con el digest
//      literal `no-es-el-hash`, y la emision devolvia `ok: true`.
//
// Las dos quedan como pruebas permanentes en `firmas.test.ts`.
//
// Cinco reglas, en este orden:
//
//   1. LA FORMA PRIMERO. Un arreglo de objetos vacios no es una lista de
//      aprobaciones, y un objeto con `approved: true` no es una autorizacion.
//      Se comprueba antes de tocar ninguna clave: verificar una firma sobre un
//      payload a medio formar es verificar otra cosa.
//   2. EL DIGEST LO CALCULA EL VERIFICADOR. Nunca se acepta un digest que venga
//      del firmante. POR QUE: si el verificador confiara en el digest recibido,
//      el firmante elegiria que firmo DESPUES de firmarlo, y la firma dejaria de
//      comprometer el contenido. El campo `payloadDigest` de una aprobacion se
//      conserva sin usarse, precisamente para que una prueba demuestre que se
//      ignora.
//   3. FIRMAS DE VERDAD. `crypto.verify` con Ed25519, de `node:crypto`, sin
//      dependencias nuevas. La clave publica sale del registro, no del mensaje.
//   4. EL FIRMANTE TIENE VIGENCIA Y SE PUEDE REVOCAR. Una firma de un firmante
//      revocado o fuera de vigencia no vale, aunque la matematica cuadre.
//   5. SEPARACION DE FUNCIONES COMPROBADA, NO DECLARADA. El mismo actor no
//      cuenta dos veces ni puede cubrir a la vez el rol humano y el tecnico.
// ===========================================================================
//
// POR QUE NO SE REUTILIZA `sdk/src/autorizacion.ts`: esa construccion es la
// canonica para la CADENA. Codifica direcciones de 20 bytes, `bytes32` y
// segundos Unix, porque su otra mitad es `SFSPAuthorization.sol` y los dos
// digests tienen que coincidir byte a byte. El payload de admision de DBNX es
// de otro dominio: el destino es un `accountNumber` (`SF-XXXX-...`), el activo
// es un `assetId` textual, las marcas son ISO 8601 y hay campos —`caseId`,
// `policyVersion`, `authorizationId`— que no existen del lado Solidity. Meterlos
// a la fuerza en palabras de 32 bytes obligaria a truncar o a hashear campos por
// separado, y el digest resultante ya no seria el de la cadena: seria uno nuevo
// con la apariencia de ser el mismo, que es peor que tener dos declarados. Por
// eso este dominio esta SEPARADO y ETIQUETADO, y nada de aqui se presenta como
// equivalente al digest de cadena.

import { createPublicKey, verify as verificarEd25519 } from 'node:crypto';
import { createHash } from 'node:crypto';

import {
  esMarcaTiempoValida,
  fallo,
  ok,
  type MarcaTiempo,
  type Resultado,
  type Rol,
} from './tipos.js';

/**
 * Etiqueta de dominio del digest de autorizacion. Versionada: subir la version
 * invalida de golpe todas las firmas emitidas bajo la anterior, que es
 * exactamente lo que se quiere cuando cambia el formato.
 */
export const DOMINIO_AUTORIZACION_DBNX = 'SFSP-DBNX-AUTH-v1';

/**
 * Etiqueta de dominio del mensaje que firma cada aprobador. Es DISTINTA de la
 * del digest a proposito: asi un digest nunca puede hacerse pasar por un mensaje
 * de firma ni al reves.
 */
export const DOMINIO_APROBACION_DBNX = 'SFSP-DBNX-APPROVAL-v1';

/** Roles admitidos en una aprobacion. Lista cerrada: un rol desconocido no es
 *  un rol nuevo, es un dato que nadie valido. */
const ROLES_VALIDOS: readonly Rol[] = [
  'SOLICITANTE',
  'ANALISTA',
  'REVISOR',
  'COMITE',
  'CUMPLIMIENTO',
  'SISTEMA',
];

/**
 * Campos del §2.4 que entran en el digest. Todos los que describen QUE se
 * autoriza; ninguno de los que describen QUIEN lo firmo, porque esos van en el
 * mensaje de cada firma.
 */
export interface PayloadAutorizacionDBNX {
  readonly schemaVersion: string;
  readonly authorizationId: string;
  readonly actionId: string;
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
  readonly caseId: string;
}

/**
 * Codificacion canonica con prefijo de longitud.
 *
 * POR QUE con prefijo y no concatenando con separadores: una concatenacion de
 * campos de longitud variable permite mover el limite entre dos campos y obtener
 * la misma cadena de bytes desde dos payloads distintos. Con la longitud por
 * delante de cada nombre y de cada valor, esa reagrupacion es imposible por
 * construccion y no depende de que ningun valor «no contenga el separador».
 */
function campo(nombre: string, valor: string): Buffer {
  const n = Buffer.from(nombre, 'utf8');
  const v = Buffer.from(valor, 'utf8');
  const cabecera = Buffer.alloc(8);
  cabecera.writeUInt32BE(n.length, 0);
  cabecera.writeUInt32BE(v.length, 4);
  return Buffer.concat([cabecera, n, v]);
}

/**
 * Digest canonico del payload. Lo calcula SIEMPRE el verificador a partir de los
 * campos reales; nunca se lee de la autorizacion ni de la aprobacion.
 *
 * `genesisHash: null` se codifica como el campo presente con la marca `\u0000null`
 * y no como cadena vacia, para que «sin genesis» y «genesis vacio» no colapsen en
 * el mismo digest.
 */
export function digestoCanonico(p: PayloadAutorizacionDBNX): string {
  const h = createHash('sha256');
  h.update(campo('dominio', DOMINIO_AUTORIZACION_DBNX));
  h.update(campo('schemaVersion', p.schemaVersion));
  h.update(campo('authorizationId', p.authorizationId));
  h.update(campo('actionId', p.actionId));
  h.update(campo('chainId', String(p.chainId)));
  h.update(campo('genesisHash', p.genesisHash === null ? '\u0000null' : p.genesisHash));
  h.update(campo('verifyingContract', p.verifyingContract));
  h.update(campo('assetId', p.assetId));
  h.update(campo('amount', p.amount));
  h.update(campo('destination', p.destination));
  h.update(campo('policyVersion', p.policyVersion));
  h.update(campo('evidenceRoot', p.evidenceRoot));
  h.update(campo('nonce', p.nonce));
  h.update(campo('notBefore', p.notBefore));
  h.update(campo('expiry', p.expiry));
  h.update(campo('caseId', p.caseId));
  return `sha256:${h.digest('hex')}`;
}

/**
 * Mensaje que firma un aprobador concreto.
 *
 * Lleva el digest del payload Y la identidad y el ROL del firmante. POR QUE el
 * rol entra en lo firmado: si no entrara, una firma hecha como COMITE serviria
 * presentada como SISTEMA, y el mismo acto cubriria las dos patas de la
 * separacion de funciones. Es tambien lo que hace que un firmante que cambio de
 * rol no pueda reutilizar su firma anterior (punto P06).
 */
export function mensajeAprobacion(
  digestoPayload: string,
  actorId: string,
  rol: Rol,
  firmadoEnUTC: MarcaTiempo,
): Buffer {
  return Buffer.concat([
    campo('dominio', DOMINIO_APROBACION_DBNX),
    campo('digesto', digestoPayload),
    campo('actorId', actorId),
    campo('rol', rol),
    campo('firmadoEnUTC', firmadoEnUTC),
  ]);
}

/* ------------------------------------------------------- registro de firmantes */

/**
 * Un firmante autorizado, para UN rol. La clave es el par (actorId, rol): un
 * cambio de rol no es una edicion de esta fila, es cerrar la vigencia de una y
 * abrir otra. POR QUE: si el rol fuese un campo editable, cambiarlo revalidaria
 * hacia atras firmas hechas con el rol anterior.
 */
export interface FirmanteRegistrado {
  readonly actorId: string;
  readonly rol: Rol;
  /** Clave publica Ed25519 en DER SPKI, en base64. NUNCA una clave privada. */
  readonly clavePublicaSPKI: string;
  readonly notBefore: MarcaTiempo;
  readonly expiry: MarcaTiempo;
  /** Instante de revocacion, o `null`. Una revocacion no se borra: se fecha. */
  readonly revocadoEnUTC: MarcaTiempo | null;
}

export interface RegistroFirmantes {
  buscar(actorId: string, rol: Rol): FirmanteRegistrado | null;
}

export class FirmantesEnMemoria implements RegistroFirmantes {
  private readonly filas = new Map<string, FirmanteRegistrado>();

  public constructor(iniciales: readonly FirmanteRegistrado[] = []) {
    for (const f of iniciales) this.registrar(f);
  }

  private static clave(actorId: string, rol: Rol): string {
    return `${actorId}|${rol}`;
  }

  public registrar(f: FirmanteRegistrado): void {
    this.filas.set(FirmantesEnMemoria.clave(f.actorId, f.rol), f);
  }

  /** Revoca con fecha. No elimina la fila: el pasado tiene que seguir siendo
   *  legible para poder explicar por que una firma dejo de valer. */
  public revocar(actorId: string, rol: Rol, enUTC: MarcaTiempo): void {
    const k = FirmantesEnMemoria.clave(actorId, rol);
    const f = this.filas.get(k);
    if (f !== undefined) this.filas.set(k, { ...f, revocadoEnUTC: enUTC });
  }

  public buscar(actorId: string, rol: Rol): FirmanteRegistrado | null {
    return this.filas.get(FirmantesEnMemoria.clave(actorId, rol)) ?? null;
  }
}

/* ------------------------------------------------------------ verificacion */

/** Una aprobacion tal como llega. `payloadDigest` se conserva y SE IGNORA. */
export interface AprobacionFirmada {
  readonly actorId: string;
  readonly rol: Rol;
  readonly firmadoEnUTC: MarcaTiempo;
  /** Firma Ed25519 en base64 sobre `mensajeAprobacion(...)`. */
  readonly firma: string;
  /**
   * Digest que dice cubrir el firmante. NO SE USA PARA NADA: el verificador
   * calcula el suyo. Se conserva en el tipo para que la prueba
   * «digest suministrado por el firmante que se ignora» tenga algo que poner.
   */
  readonly payloadDigest?: string;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Forma de una aprobacion, antes de cualquier operacion criptografica.
 * Aqui es donde muere `{}`.
 */
export function comprobarFormaAprobacion(v: unknown): Resultado<AprobacionFirmada> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    return fallo('DENY_AUTHORIZATION', 'una aprobacion no es un objeto');
  }
  const o = v as Record<string, unknown>;
  if ('approved' in o) {
    // §2.4, literal: «Un JSON con `approved: true` no es una autorizacion».
    return fallo('DENY_AUTHORIZATION', 'un campo `approved` no es una firma');
  }
  if (typeof o['actorId'] !== 'string' || o['actorId'].trim() === '') {
    return fallo('DENY_AUTHORIZATION', 'la aprobacion no identifica al firmante');
  }
  if (typeof o['rol'] !== 'string' || !ROLES_VALIDOS.includes(o['rol'] as Rol)) {
    return fallo('DENY_AUTHORIZATION', 'rol de aprobacion desconocido', {
      rol: String(o['rol']),
    });
  }
  if (!esMarcaTiempoValida(o['firmadoEnUTC'])) {
    return fallo('DENY_AUTHORIZATION', 'la aprobacion no lleva instante de firma utilizable');
  }
  if (typeof o['firma'] !== 'string' || o['firma'] === '' || !BASE64.test(o['firma'])) {
    // Una firma ausente o ilegible no es una firma invalida por poco: es que no
    // hay prueba de posesion de clave ninguna.
    return fallo('DENY_AUTHORIZATION', 'la aprobacion no lleva una firma legible');
  }
  return ok(o as unknown as AprobacionFirmada);
}

/**
 * Verifica UNA aprobacion contra el digest que calculo el verificador.
 *
 * `ahoraUTC` es el instante de PRESENTACION, distinto del instante de firma. Los
 * dos importan y por motivos distintos:
 *   - la vigencia del firmante se comprueba en el instante de FIRMA (una firma
 *     hecha antes de estar habilitado nunca valio);
 *   - la revocacion se comprueba en el instante de PRESENTACION (una firma hecha
 *     antes de la revocacion pero presentada despues NO vale: revocar sirve
 *     justamente para eso).
 */
export function verificarAprobacion(
  digestoPayload: string,
  aprobacion: unknown,
  registro: RegistroFirmantes,
  ahoraUTC: MarcaTiempo,
): Resultado<FirmanteRegistrado> {
  const forma = comprobarFormaAprobacion(aprobacion);
  if (!forma.ok) return forma;
  const a = forma.valor;

  if (!esMarcaTiempoValida(ahoraUTC)) {
    // Un reloj ilegible no es un permiso ni un rechazo (§4).
    return fallo('UNKNOWN_SOURCE', 'el instante de presentacion no es utilizable');
  }
  const ahora = Date.parse(ahoraUTC);
  const firmado = Date.parse(a.firmadoEnUTC);

  const firmante = registro.buscar(a.actorId, a.rol);
  if (firmante === null) {
    return fallo('DENY_AUTHORIZATION', 'firmante no registrado para ese rol', {
      actorId: a.actorId,
      rol: a.rol,
    });
  }

  if (firmante.revocadoEnUTC !== null && ahora >= Date.parse(firmante.revocadoEnUTC)) {
    return fallo('DENY_AUTHORIZATION', 'el firmante esta revocado', {
      actorId: a.actorId,
      revocadoEnUTC: firmante.revocadoEnUTC,
    });
  }
  if (firmado < Date.parse(firmante.notBefore) || firmado >= Date.parse(firmante.expiry)) {
    return fallo('DENY_AUTHORIZATION', 'la firma se hizo fuera de la vigencia del firmante', {
      actorId: a.actorId,
      firmadoEnUTC: a.firmadoEnUTC,
    });
  }
  if (ahora >= Date.parse(firmante.expiry)) {
    return fallo('DENY_AUTHORIZATION', 'la habilitacion del firmante esta vencida', {
      actorId: a.actorId,
      expiry: firmante.expiry,
    });
  }

  // Y recien ahora la criptografia. El mensaje se reconstruye desde el digest
  // que calculo el verificador y desde el rol que se esta invocando: nada de lo
  // que entra aqui lo eligio el firmante despues de firmar.
  const mensaje = mensajeAprobacion(digestoPayload, a.actorId, a.rol, a.firmadoEnUTC);
  let valida = false;
  try {
    const clave = createPublicKey({
      key: Buffer.from(firmante.clavePublicaSPKI, 'base64'),
      format: 'der',
      type: 'spki',
    });
    valida = verificarEd25519(null, mensaje, clave, Buffer.from(a.firma, 'base64'));
  } catch {
    // Clave o firma mal formadas. Se trata como firma invalida y no como error
    // del programa: un dato de entrada corrupto es un rechazo, no una excepcion.
    return fallo('DENY_AUTHORIZATION', 'la firma o la clave del firmante no son utilizables', {
      actorId: a.actorId,
    });
  }
  if (!valida) {
    return fallo('DENY_AUTHORIZATION', 'firma invalida: no cubre este payload', {
      actorId: a.actorId,
    });
  }
  return ok(firmante);
}

/** Roles que cuentan como aprobacion HUMANA y como validacion TECNICA. */
export const ROLES_HUMANOS: readonly Rol[] = ['COMITE'];
export const ROLES_TECNICOS: readonly Rol[] = ['CUMPLIMIENTO', 'SISTEMA'];

export interface QuorumVerificado {
  readonly firmantes: readonly FirmanteRegistrado[];
  readonly humano: string;
  readonly tecnico: string;
}

/**
 * Quorum completo: forma, unicidad, firmas y separacion de funciones.
 *
 * El orden importa. La forma se valida ANTES que nada sobre TODAS las
 * aprobaciones: si se verificara la primera firma y solo despues se mirara la
 * forma de la segunda, un arreglo `[firmaBuena, {}]` habria pasado por una ruta
 * de exito parcial antes de romperse.
 */
export function verificarQuorum(
  digestoPayload: string,
  aprobaciones: unknown,
  registro: RegistroFirmantes,
  ahoraUTC: MarcaTiempo,
): Resultado<QuorumVerificado> {
  if (!Array.isArray(aprobaciones)) {
    return fallo('DENY_AUTHORIZATION', 'las aprobaciones no son una lista');
  }
  if (aprobaciones.length === 0) {
    return fallo('DENY_AUTHORIZATION', 'no hay firmas');
  }

  const formas: AprobacionFirmada[] = [];
  for (const cruda of aprobaciones) {
    const f = comprobarFormaAprobacion(cruda);
    if (!f.ok) return f;
    formas.push(f.valor);
  }

  // Unicidad de FIRMANTE, no de (firmante, rol): el mismo actor firmando dos
  // veces con dos sombreros es una sola persona, y contarlo dos veces convierte
  // la separacion de funciones en una formalidad. Es la segunda prueba de
  // concepto del auditor.
  const vistos = new Set<string>();
  for (const f of formas) {
    if (vistos.has(f.actorId)) {
      return fallo(
        'DENY_AUTHORIZATION',
        'el mismo firmante aparece dos veces: no suma quorum',
        { actorId: f.actorId },
      );
    }
    vistos.add(f.actorId);
  }

  const firmantes: FirmanteRegistrado[] = [];
  for (const f of formas) {
    const v = verificarAprobacion(digestoPayload, f, registro, ahoraUTC);
    if (!v.ok) return v;
    firmantes.push(v.valor);
  }

  const humano = firmantes.find((f) => ROLES_HUMANOS.includes(f.rol));
  const tecnico = firmantes.find((f) => ROLES_TECNICOS.includes(f.rol));
  if (humano === undefined || tecnico === undefined) {
    return fallo(
      'REVIEW_REQUIRED',
      'faltan firmas verificadas: se exige una humana (COMITE) y una tecnica (CUMPLIMIENTO/SISTEMA)',
      { humana: humano === undefined ? 0 : 1, tecnica: tecnico === undefined ? 0 : 1 },
    );
  }
  if (humano.actorId === tecnico.actorId) {
    // Defensa en profundidad: la unicidad de arriba ya lo impide, pero la
    // separacion de funciones se comprueba explicitamente en vez de darse por
    // deducida de otra regla que alguien podria relajar manana.
    return fallo(
      'DENY_AUTHORIZATION',
      'el mismo actor cubre el rol humano y el tecnico: no hay separacion de funciones',
      { actorId: humano.actorId },
    );
  }

  return ok({ firmantes, humano: humano.actorId, tecnico: tecnico.actorId });
}
