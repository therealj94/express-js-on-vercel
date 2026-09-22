# Modelo de concurrencia del directorio SFSP (P10)

**Estado:** contrato que tendrá que cumplir el adaptador durable. No hay
adaptador todavía y este documento **no lo implementa**: define qué garantía
exige cada carrera, con qué mecanismo se cierra y qué prueba lo demostraría.

---

## 0 · Por qué existe este documento

`sdk/src/directorio.ts` guarda cuentas, alias y rutas en `Map` dentro de un solo
proceso Node. Un solo hilo y un solo proceso hacen que ninguna de las carreras de
abajo pueda ocurrir: entre el `if` que comprueba y el `set` que escribe no cabe
nadie. Por eso las 48 pruebas del SDK pasan y por eso no demuestran nada sobre
concurrencia.

El sistema real atiende peticiones a la vez, en varios procesos y probablemente
en varias instancias. Ahí **sí** cabe alguien entre el `if` y el `set`. El
auditor lo anotó como «sin cubrir 5»: persistencia, concurrencia e integración
sin probar, y sin modelo escrito.

La regla que ordena todo lo que sigue:

> **Una invariante que hoy sostiene el hecho de haber un solo hilo, mañana la
> sostiene la base de datos o no la sostiene nadie.** Ninguna invariante del
> directorio puede depender de que el código comprueba antes de escribir. Si la
> base no la impone, no está impuesta.

Segunda regla, derivada:

> **El código de aplicación no arbitra las carreras: las pierde.** No se reserva
> con un `SELECT` previo. Se intenta la escritura, se deja que el índice único o
> la comparación de versión decidan, y se traduce el fallo del motor a un código
> del §4 del contrato interno. Comprobar antes de escribir está permitido sólo
> como cortesía para dar un mensaje mejor, nunca como el mecanismo.

---

## 1 · Qué operaciones compiten

| Operación | Escribe | Compite con |
|---|---|---|
| `crearCuenta` | cuenta, `accountNumber` consumido | otra `crearCuenta`, y una migración |
| `registrarAlias` / `cambiarAlias` | alias por `normalized` y por `skeleton` | la misma solicitud de otro, y la liberación de un tercero |
| `crearBinding`, `cambiarEstadoBinding` | ruta, `version`, `PRIMARY` de la cuenta | `resolverDestino`, y la ejecución posterior |
| `resolverDestino` + ejecutar | nada (lee), pero decide a dónde va el dinero | todo cambio de ruta que ocurra en medio |
| `migrarCuentas` | altas y rutas en lote | otra corrida del mismo censo, y altas normales |
| toda escritura sensible | idempotencia por `operationId` | el reintento del propio cliente |

---

## 2 · Las carreras que importan

Cada una con lo mismo: qué compite, qué se pierde si nadie la cierra, qué
mecanismo la cierra y qué prueba lo demostraría. Los identificadores `T-CONC-xx`
son nuevos y hoy **ninguno existe**.

---

### C1 · Dos altas de cuenta simultáneas

**Qué compite.** Dos transacciones llaman a `crearCuenta`. Cada una sortea un
`accountNumber` de 12 dígitos y comprueba con `numerosConsumidos` y con el índice
`numeroAId` que esté libre. Las dos comprueban antes de que ninguna escriba.

**Qué se pierde.** Dos cuentas distintas con el mismo `accountNumber`, o —peor—
un número que ya se mostró a alguien entregado después a otra persona. El
`accountNumber` es un **destino público**: alguien lo copió en una agenda. Es
exactamente lo que A3 afirma que no puede pasar, y hoy sólo lo impide el hilo
único.

Hay un segundo perdedor menos obvio: `numerosConsumidos` es un conjunto en
memoria del proceso. Con dos procesos, cada uno tiene el suyo, así que la
monotonía que A3 promete **no existe fuera de un proceso**. Un número liberado
por una reversión en el proceso A puede volver al sorteo en el proceso B.

**Mecanismo que la cierra.** Índice único, y un consumo que no se deshace.

1. Tabla `numero_consumido(clave_indice PRIMARY KEY, consumido_en, corrida_id)`.
   `claveDeIndice(accountNumber)` es la clave, para que el guionado y el dígito
   de control no produzcan dos formas del mismo número.
2. El alta hace `INSERT` en `numero_consumido` **antes** de crear la cuenta. El
   que pierde recibe violación de clave única, **no reintenta ese número**, y
   sortea otro, hasta `MAX_REINTENTOS_NUMERO`. Agotados, `UNKNOWN_SOURCE`: se
   para, no se reza.
3. `INSERT` en `numero_consumido` es **fuera de la transacción del alta**, o en
   una transacción propia que se confirma antes. Si el alta se deshace después,
   el número **sigue consumido**. Eso es deliberado y es la mitad de A3: la
   reversión no devuelve números al sorteo.
4. `cuenta(account_number UNIQUE)` como segunda línea de defensa. Que nunca
   dispare es la prueba de que la primera funciona.

Aislamiento: `READ COMMITTED` basta, porque el árbitro es el índice único y no
una lectura previa. No hace falta `SERIALIZABLE` y no se pide.

**Prueba que lo demostraría.**

- **T-CONC-01**: N ≥ 64 altas concurrentes desde al menos 4 conexiones reales
  contra el adaptador durable, con el generador de números **forzado a repetir**
  (inyectando una secuencia con colisiones). Aceptación: tantas cuentas como
  altas exitosas, cero `accountNumber` repetidos, y cada colisión resuelta por
  violación de único y reintento, no por una lectura previa.
- **T-CONC-02**: un alta que revienta después de consumir el número. Aceptación:
  la cuenta no existe y el número **no** vuelve a entregarse nunca, ni en ese
  proceso ni en otro. Es A3 llevada a la base.

---

### C2 · Dos solicitudes del mismo alias a la vez

**Qué compite.** Dos altas de alias que colisionan por `normalized`, por
`skeleton`, o una por cada cosa. El código comprueba los dos índices y después
escribe los dos.

**Qué se pierde.** Dos alias `ACTIVE` que se ven iguales, que es justo lo que A4
afirma imposible; o peor, dos alias que resuelven a cuentas distintas. Un alias
es a dónde alguien cree que manda el dinero.

También se pierde la **atomicidad entre los dos índices**: hoy son dos `Map` y se
escriben en dos líneas. En una base son dos filas o dos columnas, y si se
escriben por separado hay un instante con el alias registrado y el esqueleto no.

**Mecanismo que la cierra.** Dos índices únicos y una sola transacción.

1. `alias(normalized PRIMARY KEY, skeleton, account_id, status, ...)`.
2. Índice **único parcial** sobre `skeleton` restringido a los estados que
   ocupan el espacio de nombres:
   `CREATE UNIQUE INDEX ON alias (skeleton) WHERE status IN ('ACTIVE','RESERVED','DISPUTED')`.
   `DISPUTED` entra porque §4.4 dice que un alias en disputa no resuelve, y no
   resolver no es lo mismo que estar libre: nadie más puede tomarlo mientras dure.
3. Las dos escrituras, en **una transacción**. No existe el estado intermedio.
4. `cambiarAlias` es una sola transacción: registrar el nuevo y liberar el viejo,
   o ninguna de las dos. Hoy son dos pasos y una excepción en medio deja a la
   cuenta con dos alias `ACTIVE`.
5. La cuarentena de `RELEASED` (pendiente **D17**) se impone con una condición de
   tiempo en la restricción, no con un `if` en el código.

Aislamiento: `READ COMMITTED` basta, otra vez porque arbitra el índice.

**Prueba que lo demostraría.**

- **T-CONC-03**: 32 solicitudes concurrentes del **mismo** alias. Aceptación:
  exactamente una `ACTIVE`, 31 rechazadas con `DENY_POLICY`, y el rechazo llega
  por violación de único.
- **T-CONC-04**: dos solicitudes concurrentes de alias **distintos con el mismo
  esqueleto** (un par confusable). Aceptación: exactamente una prospera. Es A4
  bajo concurrencia.
- **T-CONC-05**: `cambiarAlias` interrumpido entre registrar y liberar.
  Aceptación: la cuenta nunca queda con dos alias `ACTIVE` ni con cero.

---

### C3 · Un cambio de ruta mientras se resuelve un destino

**Qué compite.** Alguien pide el destino de una cuenta (`resolverDestino`), arma
la transacción, y entre medio el titular cambia, suspende o revoca su ruta. Ésta
es la única carrera que el código **ya** modela: la resolución lleva `version` y
caducidad, y `revalidarDestino` compara `bindingId`, `version` y vigencia antes
de ejecutar.

**Qué se pierde.** El dinero va a una dirección que el titular ya no reconoce.
No hay reversión posible: es una transferencia en cadena.

Lo que el modelo actual **no** cubre, y el durable tiene que cubrir:

- entre `revalidarDestino` y la ejecución real cabe otro cambio. La ventana se
  estrecha, no se cierra, mientras la revalidación y la ejecución no sean una
  sola operación;
- `version` es un entero por binding. Si dos procesos hacen dos cambios distintos
  desde la misma versión, hoy los dos escriben y la historia queda mal contada;
- que como mucho haya un `PRIMARY` por cuenta y red (A6) lo sostiene hoy que
  `cambiarEstadoBinding` degrada al anterior en la misma llamada, con un solo
  hilo. Dos llamadas a la vez dejan dos rutas primarias, y una ruta primaria es
  la que se elige sola para cobrar.

**Mecanismo que la cierra.** Versión optimista, índice único parcial y una
revalidación que ejecuta.

1. **Versión optimista** en cada escritura de ruta:
   `UPDATE binding SET ... , version = version + 1 WHERE binding_id = $1 AND version = $2`.
   Cero filas afectadas significa que otro cambió la ruta: `DENY_AUTHORIZATION`,
   no reintento silencioso. El llamador vuelve a resolver y vuelve a decidir; una
   decisión sobre a dónde va el dinero no se reintenta sola.
2. **Índice único parcial** para `PRIMARY`:
   `CREATE UNIQUE INDEX ON binding (account_id, chain_id) WHERE status = 'PRIMARY'`.
   A6 pasa a sostenerla la base. La degradación del anterior y la promoción del
   nuevo van en la misma transacción.
3. **Historial inmutable**: `binding_evento` sólo admite `INSERT`, con
   `UNIQUE (binding_id, version)`. Dos cambios desde la misma versión no pueden
   producir dos eventos con la misma versión: uno pierde.
4. **La revalidación ejecuta**: `revalidarDestino` deja de ser una comprobación
   previa y pasa a ser la condición de la escritura. El asiento de la operación
   lleva `binding_id` y `version`, y se inserta con
   `WHERE EXISTS (SELECT 1 FROM binding WHERE binding_id = $1 AND version = $2 AND <vigente>)`.
   Si la ruta cambió, no hay asiento y no hay ejecución.
5. El TTL de 60 s de la resolución se mantiene: acota la ventana, no la cierra.
   Las dos cosas hacen falta y ninguna sustituye a la otra.

**Prueba que lo demostraría.**

- **T-CONC-06**: resolver un destino, cambiar la ruta en otra conexión, e
  intentar ejecutar con la resolución vieja. Aceptación: la ejecución falla con
  `DENY_AUTHORIZATION` y **no queda ningún asiento**.
- **T-CONC-07**: dos promociones a `PRIMARY` concurrentes en la misma cuenta y
  red. Aceptación: exactamente una prospera; la cuenta nunca tiene dos `PRIMARY`.
  Es A6 bajo concurrencia.
- **T-CONC-08**: dos cambios de estado concurrentes desde la misma `version`.
  Aceptación: uno prospera, el otro recibe cero filas y falla; el historial tiene
  un solo evento por versión y ninguna versión repetida.
- **T-CONC-09**: revocar una ruta **entre** la revalidación y la ejecución.
  Aceptación: cero asientos. Si esta prueba pasa con la revalidación separada de
  la escritura, la prueba está mal escrita: tiene que forzar la ventana.

---

### C4 · Dos migraciones del mismo censo

**Qué compite.** Dos corridas de `migrarCuentas` sobre el mismo censo, a la vez o
solapadas: dos operadores, un reintento tras un tiempo de espera agotado, o un
reinicio del proceso a mitad de lote.

**Qué se pierde.** Dos cuentas SFSP para la misma cuenta de origen, con dos
números distintos, y los dos ya mostrados. C4 de las afirmaciones dice que correr
dos veces no reparte números nuevos, y hoy eso lo sostiene que la segunda corrida
ve en memoria lo que hizo la primera. Con dos procesos no lo ve.

Se pierde además la propiedad que hace utilizable un simulacro: si `SIMULACRO` y
`APLICAR` compiten por el mismo estado, un simulacro puede dejar rastro (H11,
C08) o un aplicar puede leer lo que escribió un simulacro.

**Mecanismo que la cierra.** Idempotencia por identidad de origen, más exclusión
de corrida.

1. `migracion_par(censo_id, ref_cuenta_origen)` con **clave primaria compuesta**.
   La segunda corrida no crea: choca, lee lo ya creado y devuelve el mismo par.
   Idempotencia por dato, no por memoria.
2. `UNIQUE (ref_cuenta_origen)` global además de la anterior: una cuenta de
   origen pertenece a una sola cuenta SFSP, aunque alguien reprocese el censo con
   otro `censo_id`. Es el equivalente de la unicidad global por posición que L3
   exige a la migración de activos (H04).
3. **Exclusión por censo**: `migracion_corrida(censo_id, modo, estado, ...)` con
   índice único parcial `WHERE estado = 'EN_CURSO'`. Dos corridas del mismo censo
   no pueden estar en curso a la vez. La segunda no espera: recibe `DENY_LIMIT`
   con el identificador de la que está corriendo.
4. **El simulacro no comparte estado con lo real.** `SIMULACRO` corre contra una
   copia y no escribe en ninguna tabla del directorio real (C08). Lo único que un
   simulacro consume de verdad son números de cuenta, y sigue siendo deliberado:
   un número que se sorteó no vuelve al sorteo aunque fuera un ensayo.
5. **Lote reanudable**: la corrida confirma por bloques con marca de avance, de
   modo que un reinicio reanuda desde el último bloque confirmado y no reprocesa
   lo confirmado (T49 del §10 de SFSP-900).

**Prueba que lo demostraría.**

- **T-CONC-10**: dos corridas `APLICAR` concurrentes del mismo censo desde dos
  procesos. Aceptación: una prospera y la otra recibe `DENY_LIMIT`; tantas
  cuentas SFSP como cuentas de origen, cero duplicados, cero números reutilizados.
- **T-CONC-11**: corrida interrumpida a mitad de lote y reanudada. Aceptación:
  ninguna cuenta de origen con dos cuentas SFSP, ninguna sin cuenta, y los saldos
  idénticos antes y después.
- **T-CONC-12**: `SIMULACRO` y `APLICAR` del mismo censo a la vez. Aceptación: el
  simulacro no deja ni una fila en las tablas del directorio real, y el aplicar
  no lee nada del simulacro. Es C3 de las afirmaciones, bajo concurrencia.

---

### C5 · El mismo `operationId` dos veces (transversal)

No estaba en el encargo, pero atraviesa las cuatro anteriores: toda escritura
sensible es idempotente por `operationId`, y hoy eso depende de un mapa opcional
que el llamador puede omitir (H10).

**Mecanismo.** `operacion(operation_id PRIMARY KEY, huella_peticion, resultado)`.
La escritura y el registro de la operación van en la **misma** transacción. Un
reintento con el mismo `operationId` y la misma huella devuelve el resultado
guardado sin repetir el efecto; con huella **distinta** se rechaza con
`DENY_AUTHORIZATION`, porque reusar un identificador de idempotencia para otra
cosa es exactamente el patrón que L1 persigue.

**Prueba.** **T-CONC-13**: 16 envíos concurrentes de la misma operación con el
mismo `operationId`. Aceptación: un solo efecto, 16 respuestas iguales. Y con
carga distinta: rechazo, sin efecto.

---

## 3 · Resumen del contrato del adaptador durable

| Carrera | Mecanismo | Nivel de aislamiento | Pruebas |
|---|---|---|---|
| C1 dos altas | índice único sobre `clave_indice`; consumo fuera de la transacción del alta | READ COMMITTED | T-CONC-01, T-CONC-02 |
| C2 mismo alias | único sobre `normalized`; único parcial sobre `skeleton`; una transacción | READ COMMITTED | T-CONC-03 … 05 |
| C3 ruta vs destino | versión optimista; único parcial de `PRIMARY`; revalidación que ejecuta | READ COMMITTED | T-CONC-06 … 09 |
| C4 dos migraciones | clave compuesta por censo y origen; único global por origen; exclusión de corrida en curso | READ COMMITTED | T-CONC-10 … 12 |
| C5 `operationId` | clave primaria más huella de la petición, en la misma transacción | READ COMMITTED | T-CONC-13 |

Ninguna carrera de esta tabla pide `SERIALIZABLE`. Eso es a propósito: pedir
`SERIALIZABLE` para no pensar el índice correcto sale caro en producción y
esconde el modelo. Si aparece una invariante que ningún índice puede expresar, se
escribe aquí **antes** de subir el nivel de aislamiento, con el motivo.

### Lo que el adaptador **no** puede hacer

1. No puede sostener una invariante con una lectura previa. El árbitro es el
   motor; el código traduce el fallo.
2. No puede reintentar en silencio una operación que decide a dónde va el dinero.
3. No puede devolver números de cuenta al sorteo, por ninguna ruta, incluida una
   reversión y un simulacro.
4. No puede escribir los dos índices de un alias en dos transacciones.
5. No puede considerar una prueba de concurrencia válida si corre en un solo
   proceso: tiene que haber conexiones distintas y solapamiento real, forzado con
   puntos de sincronización, no con esperas.

### Cómo se probarán

Con el corredor de pruebas de Node y sin marcos externos, como el resto del
árbol. Las trece pruebas exigen un adaptador durable, así que **hoy ninguna se
puede escribir**, y eso es precisamente lo que este documento deja dicho: el
modelo de concurrencia existe antes que el adaptador, no después, para que el
adaptador se escriba contra él y no al revés.

Mientras no exista, `INVARIANTES.md` marca estas invariantes como **sin prueba**,
y ninguna se cuenta como cerrada.
