/* Las máquinas de estado que hasta hoy estaban implícitas.
 *
 * El problema que cierra: la máquina del binding estaba declarada en una tabla
 * (`TRANSICIONES` de `binding.ts`) y se podía contrastar contra la
 * especificación. Las otras tres no estaban declaradas en ninguna parte. La de
 * la cuenta y la del alias vivían en asignaciones sueltas de `directorio.ts`
 * (`viejo.status = 'RELEASED'`), y la del activo no vivía en ningún sitio: la
 * especificación enumeraba los valores de cada eje sin decir qué paso de un
 * valor a otro era admisible. Una máquina que no está escrita no se puede
 * comparar con nada, y `scripts/conformidad.mjs` la marcaba NO_COMPROBADA.
 *
 * Qué hay aquí: las tres máquinas que faltaban, en el mismo formato que la del
 * binding, para que el comprobador las lea de los dos lados y `spec/` y código
 * no puedan separarse en silencio.
 *
 * Qué NO hay aquí, y por qué: la máquina del binding. Sigue en `binding.ts`,
 * junto a `transicionar`, que es quien la aplica. Copiarla aquí crearía dos
 * declaraciones de la misma cosa, que es exactamente el defecto que este
 * archivo existe para cerrar. El comprobador la lee donde está.
 *
 * Límite declarado: estas tablas dicen qué transición es ADMISIBLE, no quién
 * la autoriza. La autoridad de cada paso está en las tablas de `spec/`
 * (SFSP-130 §4.4, §5.2, §5.3 y SFSP-100 §4) y se aplica en la capa que tenga
 * la firma delante, no aquí. Esta declaración no sustituye a un control de
 * autorización.
 *
 * Límite declarado, segundo: hoy `directorio.ts` no consulta estas tablas. No
 * se tocó a propósito. Lo que impide que la declaración y el comportamiento se
 * separen es la prueba `test/maquinas.test.ts`, que recorre la API pública del
 * directorio y comprueba que cada cambio de estado que el directorio hace de
 * verdad está admitido por la tabla de aquí. Es una atadura más débil que
 * llamar a la tabla desde el código, y por eso está dicha.
 */

import type { AccountStatus, AliasStatus, AssetLifecycle } from './tipos.js';

/* ----------------------------------------------------------------- cuenta */

/**
 * Máquina de estado de la cuenta (SFSP-130 §5.3).
 *
 * `CLOSED` es terminal: el `accountNumber` queda retirado y no se recicla, así
 * que reabrir una cuenta cerrada haría que un número que ya se dio por muerto
 * volviera a resolver. Se abre una cuenta nueva.
 *
 * `SUSPENDED -> CLOSED` está admitida a propósito. El diagrama que esta tabla
 * sustituye sólo dibujaba el cierre desde `ACTIVE`, y eso dejaba una cuenta
 * suspendida sin manera de cerrarse salvo levantándole antes la suspensión,
 * que es pedirle al sistema que finja un estado para poder salir de él.
 */
export const TRANSICIONES_CUENTA: Record<AccountStatus, readonly AccountStatus[]> = {
  PENDING: ['ACTIVE', 'CLOSED'],
  ACTIVE: ['SUSPENDED', 'CLOSED'],
  SUSPENDED: ['ACTIVE', 'CLOSED'],
  CLOSED: [],
};

export function transicionDeCuentaPermitida(desde: AccountStatus, hacia: AccountStatus): boolean {
  return (TRANSICIONES_CUENTA[desde] ?? []).includes(hacia);
}

/* ------------------------------------------------------------------ alias */

/**
 * Máquina de estado del alias (SFSP-130 §4.4).
 *
 * `RELEASED` no tiene salidas: un alias liberado no se revive: entra en
 * cuarentena y después se concede por una solicitud nueva, que crea un
 * registro nuevo. Si se pudiera volver de `RELEASED` a `ACTIVE`, el alias que
 * alguien copió en una agenda podría empezar a resolver otra vez a la misma
 * cuenta sin que nadie lo hubiera vuelto a conceder.
 */
export const TRANSICIONES_ALIAS: Record<AliasStatus, readonly AliasStatus[]> = {
  RESERVED: ['ACTIVE', 'RELEASED'],
  ACTIVE: ['DISPUTED', 'RELEASED'],
  DISPUTED: ['ACTIVE', 'RELEASED'],
  RELEASED: [],
};

export function transicionDeAliasPermitida(desde: AliasStatus, hacia: AliasStatus): boolean {
  return (TRANSICIONES_ALIAS[desde] ?? []).includes(hacia);
}

/* ------------------------------------------- ciclo de vida del activo */

export type EjeDelActivo = keyof AssetLifecycle;

type TransicionesDeEje<V extends string> = Record<V, readonly V[]>;

export interface TransicionesDelActivo {
  legal: TransicionesDeEje<AssetLifecycle['legal']>;
  admission: TransicionesDeEje<AssetLifecycle['admission']>;
  trading: TransicionesDeEje<AssetLifecycle['trading']>;
  transferability: TransicionesDeEje<AssetLifecycle['transferability']>;
  redemption: TransicionesDeEje<AssetLifecycle['redemption']>;
  visibility: TransicionesDeEje<AssetLifecycle['visibility']>;
}

/**
 * Las seis máquinas del ciclo de vida del activo (SFSP-100 §4).
 *
 * Son seis máquinas, no una. Los ejes son independientes: que `trading` pase a
 * `DELISTED` no mueve `visibility`, ni `transferability`, ni el saldo de nadie.
 * Declararlas juntas en una estructura no las acopla: ninguna entrada de una
 * tabla menciona el valor de otro eje, y la regla 5 del §4 sigue siendo que
 * cada cambio tiene su propia autoridad y su propio registro.
 */
export const TRANSICIONES_ACTIVO: TransicionesDelActivo = {
  legal: {
    UNCLASSIFIED: ['UNDER_REVIEW'],
    UNDER_REVIEW: ['CLASSIFIED', 'RESTRICTED_BY_LAW', 'UNCLASSIFIED'],
    CLASSIFIED: ['UNDER_REVIEW', 'RESTRICTED_BY_LAW'],
    RESTRICTED_BY_LAW: ['UNDER_REVIEW'],
  },
  admission: {
    DRAFT: ['REVIEW', 'WITHDRAWN'],
    REVIEW: ['APPROVED', 'REJECTED', 'WITHDRAWN'],
    APPROVED: ['WITHDRAWN'],
    REJECTED: [],
    WITHDRAWN: [],
  },
  trading: {
    NOT_LISTED: ['LISTED'],
    LISTED: ['SUSPENDED', 'DELISTED'],
    SUSPENDED: ['LISTED', 'DELISTED'],
    DELISTED: ['NOT_LISTED'],
  },
  transferability: {
    FREE: ['RESTRICTED', 'FROZEN'],
    RESTRICTED: ['FREE', 'FROZEN'],
    FROZEN: ['RESTRICTED', 'FREE'],
  },
  redemption: {
    NONE: ['AVAILABLE'],
    AVAILABLE: ['SUSPENDED', 'NONE'],
    SUSPENDED: ['AVAILABLE', 'NONE'],
  },
  visibility: {
    VISIBLE_TO_HOLDER: ['HIDDEN_FROM_CATALOG'],
    HIDDEN_FROM_CATALOG: ['VISIBLE_TO_HOLDER'],
  },
};

export const EJES_DEL_ACTIVO: readonly EjeDelActivo[] = [
  'legal',
  'admission',
  'trading',
  'transferability',
  'redemption',
  'visibility',
];

/**
 * ¿Es admisible mover un eje de un valor a otro?
 *
 * Un valor que no está en la tabla devuelve `false`, no `undefined` ni una
 * excepción de índice: un estado desconocido no es un permiso.
 */
export function transicionDeActivoPermitida<E extends EjeDelActivo>(
  eje: E,
  desde: AssetLifecycle[E],
  hacia: AssetLifecycle[E],
): boolean {
  const tabla = TRANSICIONES_ACTIVO[eje] as Record<string, readonly string[] | undefined>;
  return (tabla[desde as string] ?? []).includes(hacia as string);
}

/**
 * Comprueba un cambio de ciclo de vida completo: sólo se admite si CADA eje
 * que cambió tiene su transición declarada. Devuelve los ejes que no la tienen,
 * y una lista vacía quiere decir que el cambio es admisible.
 *
 * Devuelve los fallos en vez de lanzar porque quien llama suele querer
 * enumerar todo lo que está mal de una vez, no el primer problema.
 */
export function ejesQueNoAdmitenElCambio(
  desde: AssetLifecycle,
  hacia: AssetLifecycle,
): EjeDelActivo[] {
  const fallos: EjeDelActivo[] = [];
  for (const eje of EJES_DEL_ACTIVO) {
    const a = desde[eje];
    const b = hacia[eje];
    if (a === b) continue;
    if (!transicionDeActivoPermitida(eje, a as never, b as never)) fallos.push(eje);
  }
  return fallos;
}
