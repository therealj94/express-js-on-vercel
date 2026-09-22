/* Perfiles de custodia y capacidad real de recuperación.
 *
 * Aquí se decide la frase más delicada de toda la interfaz: si al usuario se le
 * puede decir «podemos recuperar tus fondos» o no. La respuesta no depende del
 * perfil de la cuenta solamente, ni del activo solamente: depende de los dos a
 * la vez, y de si alguien conserva el control de la llave.
 *
 * El error que este módulo existe para impedir: creer que volver a vincular una
 * cuenta (rebind) recupera unos ERC-20 que viven en una dirección cuya llave se
 * perdió. Cambiar el binding cambia por dónde entra la persona; no mueve nada
 * de lo que ya está en la cadena bajo una llave que ya no controla nadie. */

import type { CustodyProfile, RecoveryCapability, AssetPassport } from './tipos.js';

export interface EscenarioDeRecuperacion {
  perfil: CustodyProfile;
  pasaporte: AssetPassport;
  /** ¿Se perdió el control de la llave que gobierna la posición? */
  llavePerdida: boolean;
  /** ¿Existe un poder administrativo documentado sobre ese activo, con autoridad? */
  poderAdministrativoDocumentado: boolean;
  /** Para INSTITUTIONAL: ¿queda quórum suficiente para firmar? */
  quorumDisponible?: boolean;
  /** ¿Está aprobada la política de recuperación D19? */
  politicaD19Aprobada: boolean;
}

/**
 * Qué se recupera.
 *
 * La auditoría refutó la afirmación B4 tal como estaba escrita (H25): decía que
 * sin la política D19 no hay ninguna recuperación ejecutable, y eso es falso,
 * porque restablecer el ACCESO de alguien que no perdió su llave no mueve nada
 * y debe poder ofrecerse siempre. La afirmación era demasiado amplia, no el
 * código.
 *
 * Este campo hace la distinción explícita para que nadie vuelva a confundirlas:
 * `ACCESO` no toca posiciones; `FONDOS` sí, y ésa es la que D19 gobierna.
 */
export type AlcanceDeRecuperacion = 'ACCESO' | 'FONDOS';

export interface DictamenDeRecuperacion {
  capacidad: RecoveryCapability;
  /** Qué se recupera: el acceso a la cuenta, o el control de las posiciones. */
  alcance: AlcanceDeRecuperacion;
  /** Si es false, la interfaz NO puede ofrecer esta recuperación todavía. */
  ejecutable: boolean;
  motivo: string;
  /** Decisión pendiente que impide ejecutar, si la hay. */
  decision?: string;
  /** Texto exacto que puede mostrarse al titular. Nunca promete de más. */
  mensajeParaTitular: string;
}

const SIN_RUTA =
  'No existe una vía técnica para mover esta posición sin la llave. Conservá cualquier copia de la frase de recuperación: es lo único que la controla.';

export function capacidadDeRecuperacion(e: EscenarioDeRecuperacion): DictamenDeRecuperacion {
  const { pasaporte } = e;
  const alcance = pasaporte.enforcementScope;

  /* Caso 1: la llave no se perdió. Lo que se recupera es el acceso, no el
     control del activo. Es el caso más común y el menos dramático. */
  if (!e.llavePerdida) {
    return {
      capacidad: 'ACCESS_ONLY',
      alcance: 'ACCESO',
      ejecutable: true,
      motivo: 'la llave sigue bajo control; se restablece la sesión, no la titularidad',
      mensajeParaTitular:
        'Podemos devolverte el acceso a tu cuenta tras verificar tu identidad. Tus posiciones no se mueven.',
    };
  }

  /* Caso 2: cuenta gestionada. El custodio conserva la llave, así que puede
     mover la posición. Esto NO significa que exporte la semilla: recuperar
     acceso y exportar material criptográfico son cosas distintas (T66). */
  if (e.perfil === 'MANAGED') {
    return {
      capacidad: 'CUSTODIAL_KEY_RECOVERY',
      alcance: 'FONDOS',
      ejecutable: e.politicaD19Aprobada,
      motivo: 'el custodio conserva el control de la llave de esta cuenta',
      ...(e.politicaD19Aprobada ? {} : { decision: 'D19' }),
      mensajeParaTitular: e.politicaD19Aprobada
        ? 'Tu cuenta es de custodia gestionada. Tras la verificación y la doble aprobación podemos restablecer el acceso a tus posiciones.'
        : 'Tu cuenta es de custodia gestionada. El procedimiento de recuperación está en aprobación; abrimos tu expediente y te avisamos.',
    };
  }

  /* Caso 3: institucional. Depende del quórum, no de una frase semilla. */
  if (e.perfil === 'INSTITUTIONAL') {
    const hayQuorum = e.quorumDisponible === true;
    return {
      capacidad: hayQuorum ? 'CUSTODIAL_KEY_RECOVERY' : 'NONE',
      alcance: 'FONDOS',
      ejecutable: hayQuorum && e.politicaD19Aprobada,
      motivo: hayQuorum
        ? 'queda quórum suficiente de firmantes'
        : 'sin quórum de firmantes no hay forma de autorizar un movimiento',
      ...(hayQuorum && !e.politicaD19Aprobada ? { decision: 'D19' } : {}),
      mensajeParaTitular: hayQuorum
        ? 'La cuenta se opera por quórum de firmantes. La reposición de un firmante sigue el procedimiento acordado.'
        : 'No queda quórum suficiente de firmantes para autorizar movimientos en esta cuenta.',
    };
  }

  /* Caso 4: cuenta personal con la llave perdida. Aquí es donde la interfaz
     tiene que decir la verdad. Lo único que puede salvar la posición es un
     poder que exista DE VERDAD en el activo. */
  if (pasaporte.implementationProfile === 'SFSP_ENFORCED' && alcance.forcedTransfer) {
    return {
      capacidad: e.poderAdministrativoDocumentado ? 'CONTRACT_RECOVERY' : 'NONE',
      alcance: 'FONDOS',
      ejecutable: e.poderAdministrativoDocumentado && e.politicaD19Aprobada,
      motivo: e.poderAdministrativoDocumentado
        ? 'el contrato del activo admite recuperación reglada con autoridad documentada'
        : 'el contrato tiene el poder, pero no hay autoridad documentada que lo ejerza',
      ...(e.poderAdministrativoDocumentado && !e.politicaD19Aprobada ? { decision: 'D19' } : {}),
      mensajeParaTitular: e.poderAdministrativoDocumentado
        ? 'Este activo admite un procedimiento de recuperación con aprobación. Abrimos tu expediente.'
        : SIN_RUTA,
    };
  }

  if (pasaporte.implementationProfile === 'CUSTODIAL_ACCOUNTING') {
    return {
      capacidad: 'CUSTODIAL_KEY_RECOVERY',
      alcance: 'FONDOS',
      ejecutable: e.politicaD19Aprobada,
      motivo: 'la posición es un registro bajo custodia, no un saldo en cadena bajo tu llave',
      ...(e.politicaD19Aprobada ? {} : { decision: 'D19' }),
      mensajeParaTitular:
        'Esta posición está anotada bajo custodia. Tras la verificación podemos reasignarla a tu acceso nuevo.',
    };
  }

  if (alcance.forcedTransfer && e.poderAdministrativoDocumentado) {
    return {
      capacidad: 'ADMIN_FORCED_TRANSFER',
      alcance: 'FONDOS',
      ejecutable: e.politicaD19Aprobada,
      motivo: 'existe un poder administrativo documentado sobre el contrato legacy',
      ...(e.politicaD19Aprobada ? {} : { decision: 'D19' }),
      mensajeParaTitular:
        'Este activo tiene un poder administrativo documentado. La decisión de usarlo sigue un procedimiento con aprobación y queda registrada.',
    };
  }

  /* Legacy sin poderes y llave perdida: no hay ruta. Y así se dice. */
  return {
    capacidad: 'NONE',
    alcance: 'FONDOS',
    ejecutable: false,
    motivo: 'activo legacy sin poderes de recuperación y llave fuera de control',
    mensajeParaTitular: SIN_RUTA,
  };
}

/**
 * Volver a vincular una cuenta no mueve activos. Esta función existe para que
 * ningún llamador pueda confundir las dos operaciones: devuelve siempre la
 * misma respuesta y está escrita para leerse en una revisión de código.
 */
export function rebindMueveActivos(): false {
  return false;
}
