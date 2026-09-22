# SFSP-130 · Account & Key Management

| Campo | Valor |
|---|---|
| Serie | SFSP-130 · Account & Key Management |
| Estado | `draft-0.3` |
| Fuente de tipos | `CONTRATO-INTERNO.md` §1, §2.1, §2.2, §7 |
| Parte del plan maestro | P3 entregable 2, P5 completo, §2.9, Anexo D, ADR-011, ADR-012 |
| Decisiones que la bloquean | D17 (política de alias), D18 (arquitectura final de custodia MANAGED), D19 (recuperación por activo y perfil), D10 (custodia canónica y excepciones), D07 (quórums de recovery) |

**Qué NO afirma este documento:** no afirma que exista ningún Account Number emitido, ningún directorio poblado, ninguna custodia KMS/HSM/MPC desplegada, ni ninguna capacidad de recuperación de activos probada; el algoritmo de dígito de control está congelado en `draft-0.3` pero **sujeto a la prueba T58 antes de producción**.

---

## 1 · Principio canónico

> **SFSP Account != Genesis ID != Wallet Address != Private Key/Seed.**

SFSP introduce una capa de cuenta financiera que no sustituye la criptografía de la L1, sino que la desacopla de la experiencia del usuario.

```
Persona / Empresa
      |
      v
Genesis ID (identidad y compliance; privado por propósito)   -> SFSP-110
      |
      v
SFSP Account            SF-XXXX-XXXX-XXXX-C
      |\
      | \__ Alias opcional: @nombre
      |
      v
Wallet Binding Directory
      |
      +-- chain <id> / 0x... / MANAGED / ACTIVE
      +-- wallet futura / PERSONAL / ACTIVE
      +-- institucional / MPC-HSM / ACTIVE
      |
      v
Activos y derechos
```

La cuenta es persistente; las rutas criptográficas son versionadas. La vista pública **nunca** enumera automáticamente todas las wallets relacionadas.

---

## 2 · `SFSPAccount`

```ts
type AccountStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
type CustodyProfile = 'MANAGED' | 'PERSONAL' | 'INSTITUTIONAL';

interface SFSPAccount {
  accountId: string;
  accountNumber: string;
  status: AccountStatus;
  createdAt: string;            // ISO 8601 UTC
  genesisSubjectRef: string;    // referencia opaca; NUNCA se publica en el ledger
  custodyProfile: CustodyProfile;
  primaryBindingId: string | null;
  policyVersion: string;
}
```

| Campo | Regla |
|---|---|
| `accountId` | `acc_` + 32 hex. Aleatorio CSPRNG. Interno. **Nunca deriva de datos personales.** |
| `accountNumber` | `SF-XXXX-XXXX-XXXX-C`. Público, inmutable mientras la cuenta exista, **no reciclable**. Es un destino, no concede acceso. |
| `status` | Ver §7.1. |
| `genesisSubjectRef` | Referencia opaca. No se publica en el ledger, ni en la API pública, ni en el QR. |
| `custodyProfile` | Ver §6. No se infiere sólo porque exista una semilla en una base. |
| `primaryBindingId` | `PRIMARY` **no** significa que todos los activos residan allí. |
| `policyVersion` | Versión de política con la que se creó o actualizó la cuenta. |

Jurisdicción, elegibilidad y KYC **no** viven en la cuenta: viven en Genesis ID y Compliance y se consultan por propósito. El número de cuenta permanece universal.

---

## 3 · Account Number `SF-XXXX-XXXX-XXXX-C`

### 3.1 Formato

```
SF-DDDD-DDDD-DDDD-C
   \__________/  \_/
    12 dígitos    dígito de control
```

| Propiedad | Valor |
|---|---|
| Prefijo | `SF-` literal |
| Dígitos centrales | 12, decimales `0-9` |
| Separador | `-` cada 4 dígitos |
| Dígito de control | 1 dígito decimal, `C` |
| Longitud total mostrada | 20 caracteres |

### 3.2 Qué NO codifica

El Account Number **no** revela ni codifica: país, jurisdicción, tipo de persona, tipo de usuario, edad, nivel KYC, fecha de alta, cantidad de clientes, orden de registro ni ningún dato personal. No hay dígito de país, no hay dígito de segmento, no hay prefijo por producto. Una sola numeración universal.

### 3.3 Generación CSPRNG

1. Los 12 dígitos se generan con un **CSPRNG**. No son un contador, no son secuenciales y no derivan de PII ni de `accountId`.
2. La extracción de dígitos desde bytes aleatorios usa **rechazo de muestras** para evitar sesgo de módulo. No se usa `byte % 10` sin rechazo.
3. El esquema de base de datos impone **constraint único** sobre `accountId` y sobre `accountNumber`.
4. Ante colisión, el generador **reintenta** con un número nuevo. El reintento está acotado y su agotamiento es un error explícito, no un número degradado.
5. La generación es idempotente por `operationId`: reintentar la misma operación no produce dos cuentas.

### 3.4 Dígito de control

**Algoritmo: Luhn sobre los 12 dígitos.** Congelado en `draft-0.3`, **sujeto a la prueba T58 antes de producción** (`checkDigitCongelado: false` en `DECISIONES-SFSP.json`).

Cálculo, sobre la cadena de 12 dígitos `d1 d2 ... d12` de izquierda a derecha:

1. Recorrer los 12 dígitos de derecha a izquierda.
2. Duplicar cada dígito en posición impar de ese recorrido (el primero desde la derecha, el tercero, etc.), es decir, las posiciones que quedan inmediatamente a la izquierda de donde se colocará el dígito de control.
3. Si un valor duplicado supera 9, restarle 9.
4. Sumar todos los valores resultantes, duplicados y no duplicados.
5. `C = (10 - (suma mod 10)) mod 10`.

Validación: se recalcula `C` sobre los 12 dígitos y se compara. Una discrepancia produce rechazo de formato, no una búsqueda aproximada.

Alcance de detección que debe acreditar T58:

| Error de captura | Detección esperada por Luhn |
|---|---|
| Un dígito equivocado | Siempre |
| Transposición de dos dígitos adyacentes | Siempre salvo el par `09`/`90` |
| Transposición no adyacente | No garantizada |
| Dos dígitos equivocados | No garantizada |

T58 debe **medir** esta cobertura sobre el conjunto de errores definido y documentar los casos no detectados. Sólo después se congela (`checkDigitCongelado: true`). El dígito de control detecta errores de digitación; **no** es un control de seguridad y no autentica.

### 3.5 Índice único y no reciclaje

1. Constraint único sobre `accountNumber` en el directorio.
2. Un número **retirado no se reutiliza jamás**, aunque la cuenta pase a `CLOSED`. El registro de números retirados es permanente.
3. El número es inmutable para el usuario mientras la cuenta exista.
4. Cambiar alias **no** cambia `accountNumber` (T61).
5. Cambiar binding **no** cambia `accountNumber` (T62).
6. Una recuperación de acceso **no** cambia `accountNumber`.
7. Una migración de activo **no** cambia `accountNumber`.

### 3.6 Uso

El Account Number es un **destino o routing identifier**. No concede acceso, no autentica y no prueba titularidad. La pantalla principal muestra `SF-XXXX-XXXX-XXXX-C`; la dirección `0x...` queda en «Detalles técnicos».

El QR de SFSP contiene versión, `accountNumber` y checksum. **No contiene PII.**

---

## 4 · Alias Registry

```ts
interface AliasRecord {
  alias: string;                // forma mostrada, con @
  normalized: string;           // forma canónica de unicidad
  skeleton: string;             // forma anti-confusables
  accountId: string;
  status: 'ACTIVE' | 'RELEASED' | 'RESERVED' | 'DISPUTED';
  createdAt: string;
  releasedAt: string | null;
}
```

Forma: `@` + 3 a 30 caracteres. Opcional.

### 4.1 Lo que un alias NO es

1. **No es factor de autenticación.**
2. **No titula.** No prueba propiedad de nada.
3. No firma, no autoriza y no recupera cuentas.
4. No reemplaza KYC ni una llave.
5. Un alias puede cambiar; el Account Number no.

### 4.2 Normalización determinista

La normalización produce `normalized` y debe ser **determinista, idempotente y estable entre versiones**. Pasos, en este orden:

1. Retirar el `@` inicial para el cálculo interno.
2. Normalización Unicode NFKC.
3. Plegado a minúsculas (case folding).
4. Rechazo de caracteres de control, de espacios en cualquier posición, de caracteres de formato invisibles y de marcas de dirección bidireccional.
5. Restricción al conjunto de scripts permitido por la política de alias (pendiente D17). Mezclar scripts en un mismo alias se rechaza salvo que la política lo permita expresamente.
6. Validación de longitud sobre la forma normalizada.

Unicidad: se impone sobre `normalized` con constraint único.

### 4.3 Anti-confusables

Además de `normalized`, se calcula `skeleton`: una forma canónica que colapsa caracteres confundibles visualmente (homógrafos) a un representante único, según la tabla de confusables aplicada en la versión de política declarada.

Reglas:

1. Se impone **unicidad también sobre `skeleton`**. Dos alias con el mismo esqueleto no coexisten en estado `ACTIVE`.
2. Una solicitud cuyo `skeleton` colisione con un alias `ACTIVE` o `RESERVED` se rechaza. La respuesta no revela el alias con el que colisionó más allá de lo necesario.
3. La versión de la tabla de confusables se registra. Un cambio de tabla es un cambio de política versionado y no revoca retroactivamente alias ya concedidos sin expediente.
4. Los nombres críticos y de marca se **reservan** (`RESERVED`) antes de abrir el registro público.

### 4.4 Ciclo de vida del alias

```
        solicitud
            |
            v
      [ RESERVED ] --- asignación aprobada ---> [ ACTIVE ]
            ^                                      |  |
            |                                      |  |
            |                     disputa abierta  |  |  liberación voluntaria
            |                                      v  v
            +------ resolución a favor ------- [ DISPUTED ]  [ RELEASED ]
                                                   |              |
                                 resolución en contra              | cuarentena
                                                   v              v
                                              [ RELEASED ] --> disponible
```

| Estado | Significado | Transiciones salientes |
|---|---|---|
| `RESERVED` | Reservado por política (marca, nombre crítico) o durante el alta | `ACTIVE`, `RELEASED` |
| `ACTIVE` | Resuelve a una cuenta | `DISPUTED`, `RELEASED` |
| `DISPUTED` | En disputa; **no resuelve** mientras dure | `ACTIVE`, `RELEASED` |
| `RELEASED` | Liberado; sujeto a cuarentena antes de volver a estar disponible | (nueva solicitud) |

Reglas:

1. El alta y el cambio de alias exigen **autenticación fuerte y confirmación**.
2. Un alias en `DISPUTED` no resuelve. No se sustituye por el alias anterior ni por una coincidencia aproximada.
3. La duración de la cuarentena tras `RELEASED`, la política de disputas y la de recuperación de alias son **pendiente D17**.
4. Resolver un alias exige un servicio **autenticado y con rate limit**. No es un directorio público enumerable.

---

## 5 · WalletBinding

```ts
type BindingStatus =
  | 'PENDING' | 'ACTIVE' | 'PRIMARY' | 'SUSPENDED' | 'REVOKED' | 'RECOVERY_PENDING';

interface WalletBinding {
  bindingId: string;            // bnd_ + 32 hex
  accountId: string;
  chainId: number;
  address: string;              // checksum EIP-55
  purpose: 'PAYMENTS' | 'CUSTODY' | 'SETTLEMENT' | 'INTEROP';
  status: BindingStatus;
  custodyProfile: CustodyProfile;
  validFrom: string;
  validUntil: string | null;
  version: number;              // sube en cada cambio; el historial es inmutable
}
```

Un binding es **una ruta técnica de una cuenta hacia una dirección en una red**, para un propósito.

### 5.1 Los seis estados

| Estado | Significado | Resuelve para ejecutar |
|---|---|---|
| `PENDING` | Creado, aún no verificado o no aprobado | No |
| `ACTIVE` | Verificado y vigente para su propósito | Sí |
| `PRIMARY` | `ACTIVE` y además preferido para la cuenta | Sí |
| `SUSPENDED` | Suspendido temporalmente por riesgo o por el titular | No |
| `REVOKED` | Revocado de forma definitiva | No, nunca |
| `RECOVERY_PENDING` | En un expediente de recuperación, con espera y posibilidad de disputa | No |

### 5.2 Máquina de estado del binding

```
   crear
     |
     v
[ PENDING ] --verificación fallida--> [ REVOKED ]
     |
     | verificación + aprobación
     v
[ ACTIVE ] <----designar/quitar PRIMARY----> [ PRIMARY ]
   |  ^  \
   |  |   \--- riesgo o solicitud del titular ---> [ SUSPENDED ]
   |  |                                                  |
   |  +--------------- levantamiento aprobado -----------+
   |                                                     |
   |                                                     v
   |                                               [ REVOKED ]
   |
   | apertura de expediente de recuperación
   v
[ RECOVERY_PENDING ] --aprobación dual + espera--> [ REVOKED ] (el viejo)
                     --disputa o rechazo--------> [ ACTIVE ]
```

Reglas:

1. Como máximo un binding en `PRIMARY` por cuenta y red a la vez.
2. `REVOKED` es terminal. Un binding revocado no vuelve a `ACTIVE`; se crea uno nuevo con `version` superior.
3. Un binding **vencido (`validUntil` pasado) o revocado no resuelve** (T63). Resolverlo es un error, no una advertencia.
4. El historial de bindings es **inmutable y auditable**. `version` sube en cada cambio.
5. El binding visible **no publica GID ni todas las wallets relacionadas**.
6. La resolución de un binding para ejecutar tiene TTL corto, integridad firmada y **se revalida al ejecutar** para impedir una carrera de cambio de binding.
7. Congelar un binding **no** detiene por sí mismo a quien conserva una llave externa de un ERC-20 libre. Ver §9.

### 5.3 Máquina de estado de la cuenta

```
[ PENDING ] --alta completa--> [ ACTIVE ] --riesgo/solicitud--> [ SUSPENDED ]
     |                             |    ^                            |
     |                             |    +---- levantamiento ---------+
     |                             |
     | alta rechazada              | cierre aprobado
     v                             v
  [ CLOSED ]                  [ CLOSED ]
```

| Estado | Efecto |
|---|---|
| `PENDING` | La cuenta existe en el directorio; no opera. |
| `ACTIVE` | Opera conforme a política y elegibilidad. |
| `SUSPENDED` | No inicia operaciones nuevas. **Conserva** visibilidad de saldos, documentos y derechos. |
| `CLOSED` | Terminal. El `accountNumber` queda retirado y **nunca se recicla**. |

Regla: cerrar una cuenta **no** elimina derechos previos ni documentos. La lectura de derechos no se suspende.

---

## 6 · Perfiles de custodia

| Perfil | Quién controla la llave | Recuperación de acceso | Recuperación de activos |
|---|---|---|---|
| `MANAGED` | Orden Global o custodio autorizado, bajo controles reforzados | Sí, tras verificación, **sin exportar la semilla** | Depende del activo; la llave sigue disponible para el custodio |
| `PERSONAL` | El usuario | Genesis ID puede recuperar la **relación de identidad** | **No** puede recrear una llave perdida ni mover por sí solo nativo o ERC-20 legacy |
| `INSTITUTIONAL` | HSM / MPC / multisig / roles | Según política de la institución y sus roles | No depende de una frase semilla humana como control único |

Reglas:

1. El perfil **no se infiere** sólo porque exista una semilla en una base. Se clasifica con expediente.
2. Recuperar acceso en `MANAGED` **nunca exporta la semilla** (T66).
3. El diseño objetivo de `MANAGED` **no** mantiene indefinidamente todas las semillas descifrables mediante una sola contraseña maestra de aplicación. La arquitectura final de KMS/HSM/MPC, separación de funciones, rotación, backup y recuperación es **pendiente D18**.
4. No se exportan semillas durante ninguna migración.
5. No se afirma que una expresión regular o una frase de 12 palabras acredite correspondencia. Se verifica dirección derivada, checksum y esquema aprobado, **sin exponer el material**.
6. La migración de cifrado **no es** rotación de una llave comprometida. No se retira la clave de descifrado antigua hasta demostrar cobertura y recuperación de copias y expedientes.
7. Los registros no descifrables conservan acceso a sus derechos visibles y un expediente manual. **Nunca se borran para cerrar un porcentaje.**

---

## 7 · Las cuatro operaciones distintas

Esta es la distinción central de la serie. Las cuatro se documentan, se autorizan y se miden por separado.

| Operación | Qué cambia | Qué NO cambia | Qué NO logra |
|---|---|---|---|
| **1. Recuperación de acceso** | La sesión y las credenciales de acceso del usuario | Titularidad, `accountNumber`, dirección, llave, saldos | No mueve ningún activo. No cambia quién controla la llave. |
| **2. Rotación de clave** | El material criptográfico que controla una dirección o un signer | `accountId`, `accountNumber`, historial | No recupera una llave perdida. No es una respuesta suficiente a un compromiso si los activos siguen bajo la llave vieja. |
| **3. Rebinding** | El `WalletBinding` activo de la cuenta hacia otra dirección | `accountNumber`, alias, saldos on-chain existentes | **No mueve activos legacy.** Los activos siguen en la dirección anterior. |
| **4. Recuperación real de activos** | La posición: el activo pasa a estar controlado por otra dirección | n/a | Sólo es posible si existe una ruta técnica: `recoveryCapability` distinta de `NONE`. |

### 7.1 `rebind` NO mueve activos legacy

`rebind` y `asset recovery` son operaciones distintas. Cambiar el binding de una cuenta **no transfiere** activos que permanezcan en una EOA legacy.

1. La interfaz **no documenta** `rebind` como recuperación de un EOA legacy cuando no existe control de su llave.
2. Tras un `rebind`, la ficha de cada activo muestra dónde reside realmente la posición y bajo qué llave.
3. El registro de la operación distingue explícitamente «ruta de cuenta actualizada» de «posición movida».
4. Prueba obligatoria: T64.

### 7.2 `PERSONAL` con semilla perdida y capacidad `NONE`

Cuando el perfil es `PERSONAL`, la semilla se perdió y la `recoveryCapability` del activo es `NONE`, **no se promete recuperación**.

1. La interfaz muestra el activo como **no recuperable por esta vía**, con el motivo y la autoridad que lo determinó.
2. No se ofrece un flujo que sugiera lo contrario, ni un formulario de «solicitar recuperación» que no pueda cumplirse.
3. No se crea otro saldo, otra posición ni un asiento compensatorio para «resolver» el caso.
4. Se documenta qué sí queda disponible: la identidad, la cuenta, el historial, los documentos y los derechos visibles.
5. Prueba obligatoria: T65.

---

## 8 · Matriz `recoveryCapability`

```ts
type RecoveryCapability =
  | 'ACCESS_ONLY'             // se recupera la sesión, no el control de la llave
  | 'CUSTODIAL_KEY_RECOVERY'  // el custodio conserva control de la llave
  | 'CONTRACT_RECOVERY'       // el contrato del activo permite recuperación reglada
  | 'ADMIN_FORCED_TRANSFER'   // existe poder administrativo y está documentado
  | 'NONE';                   // no hay ruta técnica: la interfaz no promete nada
```

**La capacidad se resuelve por el par (activo, perfil de custodia), no por uno solo de los dos.**

| Tipo de activo | `MANAGED` | `PERSONAL` | `INSTITUTIONAL` |
|---|---|---|---|
| Nativo (`assetKind: NATIVE`) | `CUSTODIAL_KEY_RECOVERY` si el custodio conserva la llave; si no, `NONE` | `NONE` | según roles de la institución; `NONE` si se perdió el quórum |
| ERC-20 legacy sin poderes administrativos | `CUSTODIAL_KEY_RECOVERY` si el custodio conserva la llave; si no, `NONE` | **`NONE`** | según roles; `NONE` si se perdió el quórum |
| ERC-20 legacy con poder administrativo documentado | `ADMIN_FORCED_TRANSFER` o `CUSTODIAL_KEY_RECOVERY` | `ADMIN_FORCED_TRANSFER` sólo si está documentado y aprobado | `ADMIN_FORCED_TRANSFER` |
| `SFSP_ENFORCED` con recuperación reglada | `CONTRACT_RECOVERY` | `CONTRACT_RECOVERY` | `CONTRACT_RECOVERY` |
| `CUSTODIAL_ACCOUNTING` | `CUSTODIAL_KEY_RECOVERY` | `CUSTODIAL_KEY_RECOVERY` | `CUSTODIAL_KEY_RECOVERY` |
| Cualquiera, sólo acceso a la aplicación | `ACCESS_ONLY` | `ACCESS_ONLY` | `ACCESS_ONLY` |

Reglas:

1. Cada celda efectiva de esta matriz, por activo concreto, requiere **autoridad y evidencia**. La política de recuperación por activo y perfil, incluidos legacy EOA y `forced-transfer`, es **pendiente D19**.
2. Mientras D19 esté pendiente, ninguna ruta ejecuta recuperación de activos y la interfaz no la promete: devuelve `BLOCKED_DECISION`.
3. `ACCESS_ONLY` no es una capacidad de recuperación de fondos y no se presenta como tal.
4. `ADMIN_FORCED_TRANSFER` exige que el poder exista, esté documentado, tenga autoridad aprobada y quede registrado en `EnforcementScope.forcedTransfer`.
5. Que un activo tenga una capacidad distinta de `NONE` no implica que **este** caso concreto la satisfaga: hay que acreditar el expediente.

---

## 9 · Máquina de estado de recuperación

```
[ SOLICITADA ]
     |
     | caseId abierto + evidencia
     v
[ VERIFICACION ] --evidencia insuficiente--> [ RECHAZADA ]
     |
     | challenge independiente superado
     v
[ AVISO ]  aviso por canales previos; binding a RECOVERY_PENDING
     |
     | aprobación dual con separación de funciones
     v
[ ESPERA ]  tiempo de espera definido por riesgo; disputa posible
     |                          |
     | sin disputa              | disputa presentada
     v                          v
[ APROBADA ]              [ EN_DISPUTA ] --> [ RECHAZADA ] | [ APROBADA ]
     |
     | ejecución según recoveryCapability
     v
[ EJECUTADA ]  emite RecoveryExecuted (sin datos personales)
     |
     +--> si la capacidad es NONE: no llega aquí; termina en [ RECHAZADA ] con motivo
```

Requisitos de toda recuperación:

1. `caseId`, evidencia, **challenge independiente**, aviso por canales previamente registrados, **aprobación dual con separación de funciones**, tiempo de espera definido por riesgo, posibilidad de disputa y registro completo.
2. El quórum de recuperación es **`null`, pendiente D07**. Sin él, la operación devuelve `BLOCKED_DECISION`.
3. `RecoveryExecuted` se emite con expediente y **sin datos personales**.
4. Congelar un binding **no detiene por sí mismo** a quien conserva una llave externa de un ERC-20 libre. La UI dice esto cuando aplica.

### 9.1 Los tres runbooks separados

| Runbook | Situación | Qué hace | Qué NO hace |
|---|---|---|---|
| **Acceso perdido custodial** | El usuario perdió el acceso a la aplicación; la llave sigue bajo custodia | Restaura la sesión tras verificación | No cambia titularidad. No exporta la semilla. |
| **Llave o dirección comprometida** | La llave está en manos de un tercero | Revoca sesiones y **mueve activos** por capacidades reales a una dirección nueva controlada | No basta con revocar sesiones: si no se mueven los activos por una capacidad real, el atacante sigue pudiendo actuar |
| **Wallet externa sin llave** | El usuario perdió la llave de una dirección externa | Sólo se recupera mediante mecanismos ya existentes y legales | **No se crea otro saldo.** No se emite una posición compensatoria. |

---

## 10 · Migración de cuentas de usuarios actuales

La adopción inicial crea `accountId`, Account Number y un binding hacia la dirección actual.

**No mueve fondos, no cambia la semilla, no genera otra wallet y no obliga a firmar al usuario.**

Censo fechado `N/N` exigido para aceptar:

| Criterio | Umbral |
|---|---|
| Cuentas origen mapeadas a cuentas SFSP | `N = N`, cada una exactamente una vez |
| Duplicados | 0 |
| Account Numbers reutilizados | 0 |
| Direcciones con saldo sin owner o sin expediente | 0 |
| Colisiones de Account Number | 0 |
| Saldos antes y después | idénticos |
| Direcciones antes y después | idénticas |

Reglas:

1. La migración inicial se ejecuta en **modo lectura y simulacro** primero, produciendo una propuesta `accountId/accountNumber -> wallet actual`.
2. Se exporta **sólo un reporte sanitizado** de conteos y hashes. Nunca semillas ni llaves.
3. Las excepciones se **aíslan y se resuelven individualmente**, con expediente. No se crea una wallet sustitutiva automáticamente y no se elimina una cuenta del censo en silencio.
4. La migración real del Account Number debe ser **idempotente y reversible a nivel de directorio**, sin tocar la cadena.
5. Un rollback del directorio no desincroniza el ledger ni crea una doble ruta (T68).
6. Pruebas obligatorias: T67, T68.

---

## 11 · Resolución de destinos

Orden de resolución en el cliente:

1. Account Number exacto.
2. Alias confirmado.
3. Dirección explícita, en vista avanzada.

Reglas:

1. Antes de firmar se muestran nombre o alias **y los últimos 4 del Account Number**. Nunca se autoriza sólo por nombre.
2. Si el receptor requiere ruta on-chain, el directorio devuelve el binding válido **para esa acción y esa red**.
3. La resolución tiene **TTL corto, integridad firmada y revalidación al ejecutar**.
4. Un usuario con varias wallets puede elegir finalidad. `PRIMARY` no significa que todos los activos residan allí.
5. La interfaz agrega por cuenta **sólo cuando puede demostrar cada posición y su origen**. Si no, muestra las posiciones por separado.

---

## 12 · Perímetro de datos de esta serie

| Dato | Dónde puede estar | Dónde nunca |
|---|---|---|
| Semilla, llave privada | Custodia (KMS/HSM/MPC) | Código, pruebas, registros, evidencia, CI, staging, documentos |
| `genesisSubjectRef` | Directorio privado | Ledger, API pública, QR |
| Vínculo cuenta ↔ dirección | Directorio privado, por propósito | Enumeración pública |
| `accountNumber` | Público, es un destino | n/a |
| Alias | Público | Como factor de autenticación |

El directorio cuenta → wallet es **privado por defecto**. Exponer una dirección exige propósito explícito.

---

## 13 · Parámetros pendientes

| Parámetro | Valor | Decisión |
|---|---|---|
| `checkDigitCongelado` | `false` | se congela tras T58 |
| Política de alias: reservados, disputas, cambio, recuperación, cuarentena | `null` | D17 |
| Arquitectura de custodia MANAGED (KMS/HSM/MPC, quórum, backup, rotación) | `null` | D18 |
| `recoveryCapability` efectiva por activo y perfil | `null` | D19 |
| Custodia canónica y excepciones | `null` | D10 |
| `quorumRecovery` | `null` | D07 |
| Tiempo de espera de recuperación por nivel de riesgo | `null` | D07 / D19 |

---

## 14 · Pruebas de aceptación de la serie

1. **T57**: Generación de 1.000.000 de identificadores sintéticos sin colisiones después de aplicar constraint y reintento.
2. **T58**: El dígito de control detecta el conjunto definido de errores de captura; se documenta la cobertura medida y los casos no detectados. Hasta que pase, `checkDigitCongelado` sigue en `false`.
3. **T59**: Los Account Numbers generados no son secuenciales y no correlacionan con PII, orden de alta ni ningún atributo del sujeto.
4. **T60**: Un alias confusable u homógrafo de uno `ACTIVE`, y un alias reservado, se rechazan por colisión de `skeleton` o por `RESERVED`.
5. **T61**: Cambiar el alias no cambia el `accountNumber`.
6. **T62**: Cambiar el binding no cambia el `accountNumber`.
7. **T63**: Resolver un binding caducado o revocado falla; no cae a un binding anterior ni a una coincidencia aproximada.
8. **T64**: Un `rebind` sin recuperación de activos **no mueve** ningún activo legacy; la posición permanece en la dirección anterior y la interfaz lo refleja.
9. **T65**: Una cuenta `PERSONAL` con semilla perdida y `recoveryCapability: 'NONE'` se muestra como no recuperable, sin ofrecer un flujo de recuperación ni crear otra posición.
10. **T66**: Una recuperación de acceso en `MANAGED` restaura la sesión y **no exporta** la semilla por ninguna ruta, incluidos logs y evidencia.
11. **T67**: La migración `N/N` conserva saldos y direcciones: 0 duplicados, 0 números reutilizados, 0 direcciones con saldo sin expediente.
12. **T68**: Un rollback del directorio no desincroniza el ledger ni crea una doble ruta hacia la misma posición.
13. **T-130-13**: La normalización de alias es idempotente: aplicarla dos veces produce el mismo resultado, para todo el conjunto de casos de prueba.
14. **T-130-14**: La extracción de dígitos desde el CSPRNG usa rechazo de muestras: la distribución de los dígitos generados no presenta sesgo de módulo medible en la muestra de T57.
15. **T-130-15**: Un `accountNumber` de una cuenta `CLOSED` nunca se vuelve a asignar, incluso tras agotar reintentos en una prueba de espacio reducido.
16. **T-130-16**: La máquina de recuperación exige aprobación dual con separación de funciones; una sola firma no avanza el expediente y devuelve `BLOCKED_DECISION` mientras `quorumRecovery` sea `null`. Ref. T36.
17. **T-130-17**: Ninguna ruta de la API permite enumerar los bindings de una cuenta a partir de su `accountNumber`. Ref. T22.

---

## 15 · Propuestas para el contrato interno

1. **`AccountLifecycleTransition`**: estructura para registrar una transición de `AccountStatus` con autoridad, motivo codificado, `operationId` y marca de tiempo. Hoy el contrato interno define los estados pero no el registro de la transición.
2. **`RecoveryCase`**: estructura del expediente de recuperación: `caseId`, `accountId`, `assetId` cuando aplique, `recoveryCapability` resuelta, estado de la máquina del §9, aprobaciones separadas por rol, `notBefore`/`expiry` de la espera y referencia de evidencia.
3. **`RecoveryCaseState`**: `SOLICITADA` / `VERIFICACION` / `AVISO` / `ESPERA` / `EN_DISPUTA` / `APROBADA` / `EJECUTADA` / `RECHAZADA`.
4. **`aliasPolicyVersion`**: versión de la tabla de confusables y del conjunto de scripts permitido, referida por `AliasRecord`.
5. **`retiredAccountNumbers`**: registro permanente de números retirados, necesario para garantizar el no reciclaje y hoy implícito.

Ninguna de estas se usa como si existiera hasta que se agregue a `CONTRATO-INTERNO.md`.
