// Maquina de estados del expediente de admision DBNX.
//
// DRAFT -> REVIEW -> NEEDS_INFO -> REJECTED / APPROVED
//
// POR QUE una maquina explicita y no un campo libre: el plan maestro P7c fija
// este recorrido, y un `estado = 'APPROVED'` escrito a mano desde cualquier
// punto del codigo es exactamente como se cuela una aprobacion sin revision.
// Aqui la unica manera de llegar a APPROVED es una transicion valida, hecha por
// un rol habilitado, con motivo y marca de tiempo.
//
// ADVERTENCIA DE ALCANCE, repetida a proposito: aprobar un expediente NO
// autoriza emitir nada. La autorizacion monetaria es otro objeto, con su propia
// vigencia, alcance, monto y firmas (ver `autorizaciones.ts`).

import {
  esMarcaTiempoValida,
  fallo,
  ok,
  type Actor,
  type MarcaTiempo,
  type Reloj,
  type Resultado,
  type Rol,
} from './tipos.js';

export type EstadoCaso =
  | 'DRAFT'
  | 'REVIEW'
  | 'NEEDS_INFO'
  | 'REJECTED'
  | 'APPROVED';

/** Estados terminales: desde ellos no sale ninguna transicion. */
export const ESTADOS_TERMINALES: readonly EstadoCaso[] = ['REJECTED', 'APPROVED'];

/**
 * Transiciones permitidas y quien puede hacerlas.
 *
 * POR QUE REJECTED y APPROVED no vuelven atras: reabrir un expediente cerrado
 * borraria la trazabilidad de la decision. Un caso cerrado se sustituye por uno
 * nuevo que lo referencia, no se edita.
 */
const TRANSICIONES: ReadonlyArray<{
  readonly desde: EstadoCaso;
  readonly hacia: EstadoCaso;
  readonly roles: readonly Rol[];
}> = [
  { desde: 'DRAFT', hacia: 'REVIEW', roles: ['SOLICITANTE', 'ANALISTA'] },
  { desde: 'REVIEW', hacia: 'NEEDS_INFO', roles: ['ANALISTA', 'REVISOR', 'CUMPLIMIENTO'] },
  { desde: 'REVIEW', hacia: 'APPROVED', roles: ['COMITE'] },
  { desde: 'REVIEW', hacia: 'REJECTED', roles: ['COMITE', 'CUMPLIMIENTO'] },
  { desde: 'NEEDS_INFO', hacia: 'REVIEW', roles: ['SOLICITANTE', 'ANALISTA'] },
  { desde: 'NEEDS_INFO', hacia: 'REJECTED', roles: ['COMITE', 'CUMPLIMIENTO'] },
];

/** Una entrada inmutable del historial. Se anade, nunca se modifica. */
export interface EntradaHistorial {
  readonly desde: EstadoCaso;
  readonly hacia: EstadoCaso;
  readonly actorId: string;
  readonly rol: Rol;
  readonly motivo: string;
  readonly enUTC: MarcaTiempo;
}

export interface Caso {
  readonly caseId: string;
  readonly issuerId: string;
  readonly estado: EstadoCaso;
  readonly creadoEnUTC: MarcaTiempo;
  readonly historial: readonly EntradaHistorial[];
  /**
   * Siempre `false` en este modulo. Existe para que sea imposible confundir un
   * caso aprobado con un permiso de emision: ese permiso vive en otro tipo.
   */
  readonly autorizaEmision: false;
}

export function crearCaso(
  caseId: string,
  issuerId: string,
  reloj: Reloj,
): Resultado<Caso> {
  if (!/^case_[0-9a-f]{32}$/.test(caseId)) {
    // POR QUE se valida la forma: el §1 fija `case_` + 32 hex. Un identificador
    // libre permite colisiones y referencias cruzadas entre sistemas.
    return fallo('DENY_POLICY', 'caseId no cumple la forma case_ + 32 hex', {
      caseId,
    });
  }
  if (!/^iss_[0-9a-f]{32}$/.test(issuerId)) {
    return fallo('DENY_POLICY', 'issuerId no cumple la forma iss_ + 32 hex', {
      issuerId,
    });
  }
  const ahora = reloj.ahora();
  if (!esMarcaTiempoValida(ahora)) {
    return fallo('UNKNOWN_SOURCE', 'el reloj no devolvio una marca ISO 8601 UTC');
  }
  return ok({
    caseId,
    issuerId,
    estado: 'DRAFT',
    creadoEnUTC: ahora,
    historial: [],
    autorizaEmision: false,
  });
}

export function transicionPermitida(desde: EstadoCaso, hacia: EstadoCaso): boolean {
  return TRANSICIONES.some((t) => t.desde === desde && t.hacia === hacia);
}

/** Todas las transiciones que salen de un estado. Util para la interfaz. */
export function transicionesDesde(estado: EstadoCaso): readonly EstadoCaso[] {
  return TRANSICIONES.filter((t) => t.desde === estado).map((t) => t.hacia);
}

/**
 * Aplica una transicion. Devuelve un caso NUEVO: el anterior no se muta, asi el
 * historial no puede reescribirse por referencia compartida.
 */
export function transicionar(
  caso: Caso,
  hacia: EstadoCaso,
  actor: Actor,
  motivo: string,
  reloj: Reloj,
): Resultado<Caso> {
  if (ESTADOS_TERMINALES.includes(caso.estado)) {
    return fallo(
      'DENY_ASSET_STATE',
      'el expediente esta cerrado: no admite mas transiciones',
      { estado: caso.estado, intento: hacia },
    );
  }

  const regla = TRANSICIONES.find(
    (t) => t.desde === caso.estado && t.hacia === hacia,
  );
  if (regla === undefined) {
    return fallo('DENY_ASSET_STATE', 'transicion no permitida', {
      desde: caso.estado,
      hacia,
    });
  }

  if (!regla.roles.includes(actor.rol)) {
    // POR QUE separado del caso anterior: "no se puede desde este estado" y "tu
    // rol no puede hacerlo" son problemas distintos y se resuelven distinto.
    return fallo('DENY_ELIGIBILITY', 'el rol no puede hacer esta transicion', {
      rol: actor.rol,
      desde: caso.estado,
      hacia,
    });
  }

  if (typeof motivo !== 'string' || motivo.trim().length < 3) {
    // POR QUE se exige motivo: una decision sin motivo registrado no es
    // auditable, y P7c exige apelacion, que necesita saber contra que se apela.
    return fallo('REVIEW_REQUIRED', 'toda transicion exige un motivo registrado');
  }

  const enUTC = reloj.ahora();
  if (!esMarcaTiempoValida(enUTC)) {
    return fallo('UNKNOWN_SOURCE', 'el reloj no devolvio una marca ISO 8601 UTC');
  }

  const entrada: EntradaHistorial = {
    desde: caso.estado,
    hacia,
    actorId: actor.actorId,
    rol: actor.rol,
    motivo: motivo.trim(),
    enUTC,
  };

  return ok({
    ...caso,
    estado: hacia,
    historial: [...caso.historial, entrada],
    autorizaEmision: false,
  });
}
