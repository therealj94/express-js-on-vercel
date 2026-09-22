/* El esquema durable del directorio de cuentas (P01).
 *
 * `RESTRICCIONES_DURABLES` de `directorio.ts` enumeraba lo que un almacén real
 * tiene que imponer. Esto lo escribe en SQL, que es donde tiene que estar.
 *
 * La regla que gobierna cada línea de este archivo: **una invariante que hoy
 * sostiene el hilo único, mañana la sostiene el índice único o no la sostiene
 * nadie.** El código de la aplicación no arbitra una carrera: pierde. Arbitra
 * la base, y el perdedor recibe una violación de restricción que tiene que
 * saber leer.
 *
 * Por eso aquí no hay ni una comprobación previa disfrazada de garantía: no
 * existe un `SELECT` que decida si un alias está libre y luego un `INSERT` que
 * confíe en esa respuesta. Entre las dos cosas cabe otra transacción. */

export const ESQUEMA = `
PRAGMA foreign_keys = ON;

/* ── C1 · el número de cuenta ────────────────────────────────────────────
   Tabla monotónica: se inserta, nunca se borra. Un número consumido por una
   corrida que después se deshace SIGUE consumido, porque alguien pudo haberlo
   copiado en una agenda en ese rato. Es la mitad de la afirmación A3, y la
   mitad que el conjunto en memoria no podía sostener entre dos procesos. */
CREATE TABLE IF NOT EXISTS numero_consumido (
  clave_indice TEXT PRIMARY KEY,
  consumido_en TEXT NOT NULL,
  corrida_id   TEXT
);

CREATE TABLE IF NOT EXISTS cuenta (
  account_id          TEXT PRIMARY KEY,
  account_number      TEXT NOT NULL UNIQUE,
  /* Segunda línea de defensa: la clave de índice normaliza guiones y prefijo,
     para que dos formas del mismo número no entren como números distintos.
     Que este índice no dispare nunca es la prueba de que el primero funciona. */
  clave_indice        TEXT NOT NULL UNIQUE
                      REFERENCES numero_consumido(clave_indice),
  status              TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  genesis_subject_ref TEXT NOT NULL,
  custody_profile     TEXT NOT NULL,
  primary_binding_id  TEXT,
  policy_version      TEXT NOT NULL
);

/* ── C2 · los alias ──────────────────────────────────────────────────────
   Dos índices, no uno. El primero impide el mismo alias; el segundo impide
   uno que se VEA igual. Sin el segundo, @medardo y @medard0 conviven. */
CREATE TABLE IF NOT EXISTS alias (
  normalized  TEXT PRIMARY KEY,
  alias       TEXT NOT NULL,
  skeleton    TEXT NOT NULL,
  account_id  TEXT NOT NULL REFERENCES cuenta(account_id),
  status      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  released_at TEXT
);

/* Parcial a propósito: un alias liberado deja libre su esqueleto. Si el índice
   fuese total, nadie podría volver a tomar un nombre parecido a uno retirado. */
CREATE UNIQUE INDEX IF NOT EXISTS alias_esqueleto_ocupado
  ON alias(skeleton)
  WHERE status IN ('ACTIVE', 'RESERVED', 'DISPUTED');

/* ── C3 · las rutas ──────────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS binding (
  binding_id      TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL REFERENCES cuenta(account_id),
  chain_id        INTEGER NOT NULL,
  address         TEXT NOT NULL,
  purpose         TEXT NOT NULL,
  status          TEXT NOT NULL,
  custody_profile TEXT NOT NULL,
  valid_from      TEXT NOT NULL,
  valid_until     TEXT,
  version         INTEGER NOT NULL
);

/* Como mucho una ruta primaria por cuenta y red. Es la invariante que la
   auditoría rompió con instantáneas superficiales: aquí no depende de que
   nadie se equivoque al restaurar. */
CREATE UNIQUE INDEX IF NOT EXISTS binding_primaria_unica
  ON binding(account_id, chain_id)
  WHERE status = 'PRIMARY';

/* Historial sólo de inserción. La clave compuesta impide dos versiones con el
   mismo número, que es lo que pasaría si dos transacciones promovieran a la vez
   desde la misma versión. */
CREATE TABLE IF NOT EXISTS binding_historial (
  binding_id TEXT NOT NULL,
  version    INTEGER NOT NULL,
  desde      TEXT NOT NULL,
  hacia      TEXT NOT NULL,
  actor      TEXT NOT NULL,
  motivo     TEXT NOT NULL,
  en_iso     TEXT NOT NULL,
  PRIMARY KEY (binding_id, version)
);

/* ── C4 · la migración ───────────────────────────────────────────────────
   Único global por cuenta de origen: da igual cuántos censos existan, una
   cuenta de origen tiene una sola cuenta SFSP. Sin esto, dos censos que se
   solapan reparten dos números a la misma persona. */
CREATE TABLE IF NOT EXISTS origen_cuenta (
  ref_cuenta_origen TEXT PRIMARY KEY,
  account_id        TEXT NOT NULL REFERENCES cuenta(account_id),
  account_number    TEXT NOT NULL,
  binding_id        TEXT NOT NULL,
  censo_id          TEXT
);

CREATE TABLE IF NOT EXISTS corrida_migracion (
  corrida_id  TEXT PRIMARY KEY,
  censo_id    TEXT NOT NULL,
  estado      TEXT NOT NULL,
  iniciada_en TEXT NOT NULL,
  cerrada_en  TEXT
);

/* Una sola corrida en curso por censo. Dos corridas a la vez sobre el mismo
   censo no se estorban por los índices anteriores, pero sí producen dos
   informes que dicen cosas distintas sobre lo mismo. */
CREATE UNIQUE INDEX IF NOT EXISTS corrida_en_curso_unica
  ON corrida_migracion(censo_id)
  WHERE estado = 'EN_CURSO';

/* ── C5 · idempotencia transversal ───────────────────────────────────────
   La huella de la petición entra en la misma fila que el identificador. El
   mismo identificador con otra petición NO es un reintento: es un error, y se
   rechaza en vez de devolver el resultado de la primera. */
CREATE TABLE IF NOT EXISTS operacion (
  operation_id TEXT PRIMARY KEY,
  huella       TEXT NOT NULL,
  resultado    TEXT,
  ejecutada_en TEXT NOT NULL
);
`;

/** Las restricciones que este esquema impone, para poder comprobarlas. */
export const INDICES_ESPERADOS = [
  'numero_consumido.clave_indice PRIMARY KEY',
  'cuenta.account_number UNIQUE',
  'cuenta.clave_indice UNIQUE',
  'alias.normalized PRIMARY KEY',
  'alias.skeleton UNIQUE parcial sobre ACTIVE, RESERVED y DISPUTED',
  'binding.(account_id, chain_id) UNIQUE parcial sobre PRIMARY',
  'binding_historial.(binding_id, version) PRIMARY KEY',
  'origen_cuenta.ref_cuenta_origen PRIMARY KEY',
  'corrida_migracion.censo_id UNIQUE parcial sobre EN_CURSO',
  'operacion.operation_id PRIMARY KEY',
] as const;
