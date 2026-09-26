# SFSP-700 · Migration

| Campo | Valor |
|---|---|
| Serie | SFSP-700 · Migration |
| Estado | `draft-0.5` (alineada con el borrador SFSP v0.3 §14) |
| Fuente de tipos | `CONTRATO-INTERNO.md` §1, §2.4, §3, §5, §6.3 |
| Parte del plan maestro | P9a (registro sin movimiento), P9b (reemplazo técnico por activo), §6.3 |
| Decisiones que la bloquean | **D26 (migración por cupo del padrón, ADR-016, y ratificación del catálogo de heredados)**, **D09 (ratio, corte y `migrationId` por activo)**, D08 (clase y serie de los tokens del ecosistema), D25 (cuentas internas), D10 (custodia y recuperación), D14 (continuidad de la 8532), conciliación de supply no ubicado (§0.5) |

**Qué NO afirma este documento:** no afirma que ninguna migración esté aprobada, simulada ni ejecutada; no fija ratio, modo ni fecha de corte para ningún activo; no promete que ningún derecho pueda recuperarse si no existe una ruta técnica.

---

## 0 · Alineación con el borrador SFSP v0.3 (26-sep-2026)

> **Cómo leer esta sección.** El borrador SFSP v0.3 sustituye al v0.2 y es la regla (`../PLAN-SFSP-v0.3-2026-09-26.md`). Es un documento interno y **no está en el repositorio**: aquí se cita por sección (`v0.3 §n`), no se copia. Para la especificación, el v0.3 manda: la regla de más abajo que contradiga esta sección queda sustituida. Para ejecutar en la 5550 sigue haciendo falta la decisión firmada: lo que dependa de una decisión `PENDIENTE` en `../DECISIONES-SFSP.json` devuelve `BLOCKED_DECISION`.

### 0.1 La migración es dentro de la misma cadena (v0.3 §14.1)

La migración de la 8532 a la 5550 **ya ocurrió**: el génesis de la 5550 (25-ago-2026) copió 172 contratos con su código y su almacenamiento, sin que ningún tenedor perdiera saldo, y la comparación de estado entre las dos cadenas coincidió. El contrato de staking quedó fuera por innecesario bajo QBFT. Esta serie regula **el paso de los contratos heredados al régimen del protocolo dentro de la 5550**, sin cambio de red.

La 8532 se conserva en un respaldo cifrado del 10-ago-2026 y en los discos de los nodos; la reconstrucción del estado desde el respaldo se comprobó, la restauración completa de la historia de bloques no (v0.3 §14.1). El v0.3 la da por detenida; el repositorio conserva constancia de un nodo que seguía produciendo bloques con el RPC abierto (`infra/migracion-cadena/LA-8532-SIGUE-VIVA.md`). Se verifica y se aplica §8.1 y D14 antes de darla por histórica.

### 0.2 Tres salidas por contrato (v0.3 §14.2)

Los 172 heredados permanecen en el estado. **Todo heredado queda sin poder operar por el filtro de transacciones** (SFSP-150, v0.3 §2.1), salvo los que se registren expresamente.

| Salida | Condición | Efecto |
|---|---|---|
| Registro transitorio | Activo del catálogo publicado por la Junta, con responsable identificado | Opera mientras se ejecuta su migración a un contrato conforme. Clase `LEGACY` |
| Migración a contrato conforme | El activo debe cumplir una serie | Instantánea, bloqueo del heredado, acuñación equivalente **a la misma dirección** y conciliación (§0.3) |
| Inactivación | Contrato fuera del catálogo | Sigue en el estado **sin poder operar**, con constancia de su tratamiento |

Los canónicos actuales son ERC-20 simples, con dueño único cuando tienen funciones privilegiadas y sin roles. No implementan elegibilidad, restricción de transferencia ni suspensión: por eso el registro transitorio es temporal.

### 0.3 Camino normativo: acuñación a la misma dirección por cupo del padrón (v0.3 §14.3, ADR-016)

El v0.3 §14.3 dice que, al no haber cambio de cadena, **el reclamo por firma deja de ser necesario, porque la equivalencia se asigna a la misma dirección**. El mecanismo que hace eso con el código existente es el **cupo del padrón** (`../migracion-410/LEEME.md`, «Alternativa evaluada»; `../auditoria/REVISION-SFSP410-2026-09-26.md`, REV-410-17). Esta serie lo adopta como **camino normativo**, sujeto a D26 y a ADR-016 (`PROPUESTO`).

Flujo por activo:

| # | Paso | Mecanismo | Evento o evidencia |
|---|---|---|---|
| 1 | Desplegar el contrato conforme con su Asset Passport | SFSP-100 | `AssetRegistered` |
| 2 | Anunciar un **bloque de corte** reproducible y fijar `migrationId` | Gobernanza (D09) | `GovernanceAction` |
| 3 | **Padrón**: instantánea de saldos a ese bloque, raíz de Merkle y total `S0` publicados (sin publicar direcciones) | `migracion-410/construir-padron.mjs`, `verificar-padron.mjs` | Raíz y `S0` |
| 4 | **Bloquear el heredado** con el filtro de transacciones desde el bloque de corte. Sustituye la pausa o la quema que los heredados no tienen | SFSP-150 | `NetworkPermissionChanged`, código `CORTE_MIGRACION` |
| 5 | Topes del instrumento fijados contando `S0` | `setInstrumentLimits` (Junta) | `GovernanceAction` |
| 6 | **Un** cupo por activo: `SET_MINT_BUDGET` con monto por periodo = `S0`, máximo por operación = mayor saldo del padrón, vigencia de días, `termsDocRoot` = raíz del padrón. Quórum, espera y consumo único | `setMintBudget` (SFSP-410 R5) | `MintBudgetSet` |
| 7 | **Acuñar a cada tenedor su saldo equivalente en la misma dirección**: un `mintOnDemand` por hoja, con `paymentRef = keccak256("MIGRACION\|<assetId>\|<dirección>")` en hex y minúsculas, y `evidenceRoot` = raíz del padrón | `mintOnDemand` | `MintExecuted` + `MintOnDemand` |
| 8 | Cerrar el cupo al terminar o al vencer | `revokeMintBudget(assetId, "MIGRACION_FIN")` | `MintBudgetRevoked` |
| 9 | **Conciliación publicada**: cada `MintOnDemand` de la ventana casa con una hoja del padrón y su prueba; `paymentRef` se recalcula desde el destino; la suma es ≤ `S0` y la diferencia son los pendientes (§3). Un evento que no case es incidente: pausa y revocación | Indexador | `ConciliationRecorded` |
| 10 | Cierre con historia consultable | — | — |

Por qué este camino:

1. Pasa por `_mintTo` y aplica **R1** (nunca a una cuenta interna), **R3** (elegibilidad), **R8** (topes) y **R9** (pausa). La ruta `SFSPMigrationRegistry` → `mintForMigration` no aplica R1 ni los topes (REV-410-12).
2. `paymentRef` por (activo, dirección) es un **anulador en cadena**: la misma dirección no cobra dos veces el mismo activo, ni en reintentos ni en rondas posteriores.
3. Los firmantes aprueban **ese** padrón y **ese** total, con espera. Una aprobación por activo en vez de una por persona.

Lo que se pierde y cómo se mitiga (detalle en ADR-016 §4):

| Riesgo | Mitigación obligatoria |
|---|---|
| El reparto individual **no se comprueba en cadena**: dentro de `S0`, la llave del emisor podría acuñar a una dirección elegible fuera del padrón | Ventana corta; máximo por operación = mayor saldo; conciliación publicada del paso 9; revocación al terminar. Queda **detectable**, no impedido |
| Ocupa el único cupo del activo | Orden fijo: migración → `revokeMintBudget` → cupo comercial |
| Un saldo = una operación | Un saldo desproporcionado va por orden `MINT` individual, fuera del cupo |
| Consume el tope acumulado | Fijar los topes del instrumento contando `S0` (paso 5) |
| No emite los eventos de migración de esta serie | El indexador reconoce la migración por `paymentRef` con prefijo `MIGRACION` (§0.6) |
| Se evalúa la política `MINT`, no `MIGRATE_CLAIM` | La política `MINT` del activo nuevo tiene que admitir a los tenedores del padrón |

**Registro por reclamo como excepción.** `SFSPMigrationRegistry` (reclamo firmado por el atestador, `MigrationClaimed`) queda como **opción para los casos que no pueden asignarse a la misma dirección**:

1. Claves del padrón sin dirección (ranuras y huellas): no entran en `S0`; se pagan cuando alguien pruebe la clave.
2. Direcciones que son contratos (escrows, puentes, pools) cuyo beneficiario económico es otro.
3. Direcciones cuyo control se perdió y exigen recuperación (SFSP-130, `RECOVER`) hacia una dirección nueva.

En esos casos rigen el modo `SURRENDER_ON_CLAIM` o la ronda posterior con cupo nuevo del tamaño de lo resuelto, con la **misma** `paymentRef` por (activo, dirección) para impedir el doble derecho entre saldo por dirección y saldo por ranura.

**Encaje con los modos de §2.** La emisión por padrón es la **ejecución** de `FROZEN_SNAPSHOT`: congelación eficaz por el filtro (paso 4) antes de habilitar la acuñación, instantánea final (paso 3) y derechos calculados. No es un tercer modo.

**Estados del reclamo** (v0.3 Apéndice A, «Reclamo de migración») en este camino:

| Estado | Cuándo |
|---|---|
| No reclamado | La hoja está en el padrón y no se ha acuñado |
| Verificado | El destino es elegible para `MINT` y no es cuenta interna |
| Bloqueo confirmado | El filtro bloquea el heredado desde el bloque de corte |
| Emitido | `MintOnDemand` con la `paymentRef` canónica |
| Conciliado | La hoja figura en la conciliación publicada del paso 9 |
| No reclamable | Cuenta interna, dirección excluida por expediente o clave sin dirección todavía no probada |

**Inventario interno.** El padrón excluye las cuentas internas (R1). El inventario acuñado de AUKA y AGKA en billeteras internas (55.000.000 y 500.000.000) no se migra por este camino. Si el activo conforme necesita tesorería, se acuña a la tesorería registrada por orden de gobierno aparte (SFSP-300 §0.2) y con su propia aprobación. Es parte de D26.

La equivalencia es **por contrato, no por símbolo**: hay varios contratos con el mismo símbolo y lógica distinta.

### 0.4 Catálogo y clasificación (v0.3 §14.4)

**Contratos canónicos:**

| Activo | Contrato canónico | Tratamiento previsto |
|---|---|---|
| AUKA | `0x6facc8df79cedc6c5065442ce27e915aa3a26b9b` | Registro transitorio y migración a contrato conforme SFSP-300 |
| AGKA | `0x961f798f998c7ff44d47d62c7fa1b572ef187a4b` | Registro transitorio y migración a contrato conforme SFSP-300 |
| ONDK | `0xfb83eea4b384a4b18e5a1eba7a4bb4c0b7ca19c1` | Registro transitorio y migración a contrato conforme SFSP-200 |
| HARV | `0x0fa04d11f28b28cbc9b98dd016f02023addb1923` | Publicado por decisión de Junta; clase y serie por definir (D08) |
| IBS | Por confirmar entre dos contratos con el mismo símbolo | Publicado por decisión de Junta; clase y serie por definir (D08) |
| MONARKA | `0x18b6680cff71c11067bec312fc48786be2e54ead` | Canónico identificado; clase y serie por definir (D08) |
| REAL STATE | `0x1ac12ebd7739003059d1e9ea2a4863c92d1505dd` | Canónico identificado; clase y serie por definir (D08) |

ORIGEN es la moneda nativa y no depende de un contrato. **El nombre de marca sale del Asset Passport, no de la función `name()` del contrato**: así se resuelve que el canónico de AGKA devuelva un nombre distinto de Silver Kapital.

**Contratos con tratamiento pendiente de decisión** (ratificación de la Junta, v0.3 §18; D26):

| Contrato | Situación | Propuesta |
|---|---|---|
| SILVER KAPITAL, `0x37bcb1c800220e414ed09e044becd3bf9d06ea67` | Contrato inicial de AGKA, reemplazado por el canónico; un tenedor interno, sin movimientos | Inactivación |
| Cuatro contratos WORIGEN | Tres muestran un saldo de 55.000.000 a favor de la cuenta desplegadora, con suministro total cero y sin ORIGEN que lo respalde | Inactivación antes de cualquier migración |
| Envoltorio WETH y doce pools V3 | Envoltorio vaciado el 25-ago; los pools declaran liquidez sin contrapartida real | Inactivación (SFSP-500 §0.1, regla 3) |
| Catorce contratos HARVI duplicados | Suministros desproporcionados, un tenedor cada uno, fuera del catálogo | Inactivación |
| MONARKA, `0x632b7f72a86b39d919fafd5c6d86663caebb49eb` | Duplicado del canónico, con 10²⁶ unidades en la cuenta desplegadora | Inactivación |
| REAL STATE, `0x3607163401bc4f9135986c0d3138bff1ebd0cb96` | Duplicado del canónico, con un billón de unidades y funciones de acuñación y quema | Inactivación |
| AGROTECH, ARTIFICIAL INTELLIGENCE, SOLAR, AMOR GLOBAL, POLITICAL y ATHLETIC | Desplegados con MONARKA y REAL STATE con el mismo código; supply fijo, sin funciones privilegiadas, casi todo en una billetera interna, fuera de todo listado | Clase y serie por definir (D08). El símbolo SOL coincide con el de Solana y se revisa |
| AUBEX, `0xf1498640b27a66c0dc505093d70911c060e04fb0` | Heredado, no ofrecido en productos, visible como no listado; la app móvil le asigna un precio fijo. Transferencia de 5.000 unidades del 17-sep aprobada por la Junta, pendiente de acta; falta confirmar si el destino es interno | Inactivación hasta autorización de DBNX y retiro del precio fijo |
| AUBEX, `0xb58382be75879732f4abe96100f1b7faa6b4ce63` | Heredado, un tenedor, fuera de productos | Inactivación |
| Resto de los 172 | Factorías, routers, contratos mínimos y duplicados de prueba (Coffee, TokenA, TokenB, Token 1, SushiBar, entre otros) | Inactivación salvo que un responsable acredite propósito vigente |

### 0.5 Supply no ubicado y adquirentes tempranos (v0.3 §14.5, corregido)

| Activo | v0.3 §14.5 | Medido en la 5550, bloque 273.508 | Diferencia |
|---|---|---|---|
| AUKA | 9.823,01 | **9.823,01** | Coincide |
| ONDK | 792,5 | **804,5** | 12 ONDK: la única clave de **permiso** del contrato, que se contó como saldo |

Método: `../migracion-410/censo-tokens-5550.mjs` (saldos de la 5550 a la fecha; de la 8532 solo se usan las direcciones como diccionario). La corrección figura como C1 del plan v0.3 y se lleva al siguiente borrador rector.

1. Hipótesis: saldos creados en la cadena intermedia del 15 al 25 de agosto. La fuente para cerrarla es el respaldo del reinicio del 25 de agosto, cuya lectura exige **rotar antes las credenciales** (fase 0, punto 0.9). **No se buscan saldos en la 8532.**
2. **Ninguna migración a contrato conforme de AUKA ni de ONDK se ejecuta antes de cerrar esta conciliación.** Un padrón de AUKA u ONDK con esos residuos sin resolver no se aprueba.
3. El tratamiento de los adquirentes tempranos de ONDK se decide con el panorama completo, incluida esta conciliación, y **antes** de migrar ONDK.

### 0.6 Diferencia con el código actual

| Pieza | Estado |
|---|---|
| `SFSPIssuanceController` con `setMintBudget`, `mintOnDemand`, `revokeMintBudget` | Existe, con pruebas (SFSP-410) |
| Constructor y verificador del padrón | Existen (`migracion-410/`) |
| `SFSPMigrationRegistry` (reclamo firmado) | Existe; queda para las excepciones de §0.3 |
| Filtro de transacciones (bloqueo del heredado) | **No existe** (SFSP-150, fase 2 punto 7) |
| Reconocimiento de la migración por `paymentRef` en el indexador y conciliación publicada | **No existe** (fase 2 punto 8) |

### 0.7 Pruebas de aceptación nuevas

1. **T-700-21**: Un `mintOnDemand` a una dirección que no está en el padrón, dentro de `S0`, aparece como incidente en la conciliación publicada.
2. **T-700-22**: Una segunda acuñación del mismo activo a la misma dirección con la `paymentRef` canónica revierte con `OperationReplay`, también en una ronda posterior.
3. **T-700-23**: Una hoja del padrón que es cuenta interna revierte con `MintToInternalAccount`.
4. **T-700-24**: La suma de lo acuñado en la ventana es ≤ `S0`, y la diferencia coincide con los beneficiarios no elegibles aún más las claves sin dirección.
5. **T-700-25**: Mientras la conciliación de 804,5 ONDK y 9.823,01 AUKA siga abierta, el cupo de migración de ONDK o AUKA no se puede aprobar.
6. **T-700-26**: Un contrato fuera del catálogo no puede operar con el filtro de transacciones activo, y su constancia de inactivación es consultable.
7. **T-700-27**: No se puede fijar el cupo comercial de un activo mientras el cupo de migración siga vigente sin `revokeMintBudget`.
8. **T-700-28**: La dirección y el `assetId` en mayúsculas y en minúsculas producen la misma `paymentRef` (se normalizan antes de calcularla).
9. **T-700-29**: Una clave sin dirección no entra en `S0`; su pago posterior por reclamo o por ronda nueva no permite cobrar dos veces a una dirección que ya cobró.

---

## 1 · Dos fases

| Fase | Qué hace | Qué NO hace |
|---|---|---|
| **P9a · Registro sin movimiento** | Crea `accountId`, Account Number y binding hacia la dirección actual; inventaria contrato, red, codehash, decimales, suministro, titulares, roles, escrows, puentes, allowances, órdenes abiertas y obligaciones | No mueve fondos, no cambia semillas, no cambia contratos |
| **P9b · Reemplazo técnico por activo** | Sustituye un activo por otro, sólo cuando sea necesario, con modo, ratio y conciliación | No se ejecuta por defecto ni de forma masiva |

La migración de cuenta (P9a) se completa **antes** de cualquier sustitución de activos. Sus criterios de aceptación están en SFSP-130 §10.

---

## 2 · Los dos modos

**Se usa exactamente uno de estos dos modos por activo.** No hay un tercero y no se mezclan. **draft-0.5:** el camino normativo (§0.3) ejecuta `FROZEN_SNAPSHOT` con emisión por cupo del padrón; `SURRENDER_ON_CLAIM` queda para las excepciones de §0.3.

### 2.1 `FROZEN_SNAPSHOT`

| Aspecto | Requisito |
|---|---|
| Congelación | **Global, eficaz y jurídicamente válida**, verificada **antes** de habilitar claims |
| Snapshot | Final, con derechos estables |
| Árbol de derechos | Reproducible |
| Custodia duplicada | Excluida explícitamente del árbol |
| Entitlements | Calculados y registrados |
| Prohibición | **No mantener a la vez uso pleno económico del activo viejo** |

Si la congelación no es eficaz, este modo no aplica. Una etiqueta en el registro no es una congelación.

### 2.2 `SURRENDER_ON_CLAIM`

| Aspecto | Requisito |
|---|---|
| Entrega | El poseedor actual entrega tokens válidos a un escrow de bytecode y poderes verificados, **o** los quema de forma comprobable |
| Momento | **Antes de, o en la misma operación que**, habilita el nuevo derecho |
| Snapshot informativo | **No autoriza adicionalmente** al antiguo poseedor que ya los vendió |
| Escrow | **No se usa una dirección de «llave desconocida» como sustituto de un escrow verificable** |

### 2.3 Si no hay forma de exclusión

**Si no hay forma de exclusión, no se ejecuta migración automática.** Se registra el activo legacy, se preservan las tenencias y se formula un plan aparte.

---

## 3 · Conciliación (§6.3)

```
S0 = A + E
E  = N + P
=>  S0 = A + N + P
```

| Símbolo | Definición |
|---|---|
| `S0` | Suministro o derecho incluido en el **alcance aprobado**. |
| `A` | Derechos originales **todavía no extinguidos ni excluidos**. |
| `E` | Derechos viejos **excluidos de circulación económica** por la migración. |
| `N` | **Unidades nuevas válidas** equivalentes. |
| `P` | **Entitlements nuevos pendientes** correspondientes a derechos ya excluidos. |

Expresado en **unidades equivalentes del instrumento original**.

### 3.1 `E` es contraparte, no un tercer sumando

**`E` es la contraparte de `N + P`, no un tercer sumando junto a ellos.**

Cada derecho excluido produce, o bien una unidad nueva ya emitida (`N`), o bien un entitlement pendiente (`P`). Por eso `E = N + P`. Sumar `E` otra vez junto a `N` y `P` contaría dos veces lo mismo.

### 3.2 Ejemplo numérico

```
S0 = 1000
A  =  600
E  =  400
N  =  350
P  =   50
```

Comprobaciones correctas:

```
S0 = A + N + P   ->   1000 = 600 + 350 + 50   ✓
E  = N + P       ->    400 = 350 + 50         ✓
S0 = A + E       ->   1000 = 600 + 400        ✓
```

**La ecuación equivocada:**

```
E + N + P = 400 + 350 + 50 = 800
```

800 no es `S0`. Es `E` contado dos veces: una como `E` y otra a través de `N + P`. Esa suma **no** es el suministro inicial y usarla como comprobación es un error.

### 3.3 Migración completamente congelada

Si la migración está completamente en modo freeze: `A = 0` y `S0 = N + P`, con el **tratamiento jurídico de `E` acreditado**.

### 3.4 Balances legacy en freeze

Los balances legacy que permanezcan en cadena en modo freeze se concilian **técnicamente por separado**. Sólo pasan a `E` económico **cuando su exclusión esté demostrada**, no por cambiar una etiqueta del registro.

### 3.5 Ajustes ajenos

Los ajustes ajenos a la migración se registran aparte y **no cambian `S0`** para hacer pasar la prueba.

---

## 4 · Regla de restos de ratio

Los ratios y los cambios de decimales requieren una regla de restos explícita.

1. **Nunca se truncan derechos en silencio.**
2. Se mantiene una **unidad de entitlement de precisión suficiente**, **o** un **registro de fracciones residual aprobado**.
3. El ratio se expresa como una fracción racional `numerador / denominador` con enteros, no como decimal de coma flotante.
4. El redondeo se especifica por operación y su dirección es explícita.
5. La suma de todos los entitlements calculados más el registro de fracciones debe reproducir exactamente `E` convertido al ratio. Una diferencia bloquea.
6. **No se habilitan por defecto** tokens fee-on-transfer, rebasing ni proxy mutable sin soporte y pruebas específicas.

---

## 5 · Anti doble derecho

**Ningún reemplazo se crea sin una fuente de derecho demostrable y sin neutralizar la circulación o reclamación anterior conforme al modo aprobado.**

Controles:

1. En `FROZEN_SNAPSHOT`: la congelación eficaz **precede** a la habilitación de claims. Se verifica antes, no después.
2. En `SURRENDER_ON_CLAIM`: la entrega o quema es comprobable y ocurre antes o en la misma operación.
3. Un snapshot **informativo** no autoriza a quien ya vendió sus tokens.
4. La **custodia duplicada** se excluye del árbol: una posición no genera derecho a la vez por el titular y por el custodio.
5. Un **alias** de nombre (por ejemplo AGK sobre AGKA) **no autoriza una segunda reclamación** del mismo derecho.
6. Un **rebinding** de Genesis ID **no autoriza un claim externo** sin prueba de control y de derecho, y sin exclusión previa.
7. Un `migrationId` = `mig_` + 32 hex identifica **un** reemplazo técnico de un activo por otro. `MigrationClaimed` registra que un derecho viejo quedó excluido y uno nuevo emitido: los dos hechos, en el mismo evento.
8. **EIP-712 no aporta por sí mismo un contador anti replay.** El nonce es explícito y su consumo se registra.

### 5.1 Firma de claim

Solo aplica al registro por reclamo (excepciones de §0.3). En el camino normativo no hay firma de claim: el anulador es la `paymentRef`. La autorización de un claim incluye, además de los campos de `SignedAuthorization` (§2.4):

| Campo | Regla |
|---|---|
| Red de origen y red de destino | Explícitas |
| Registry | Dirección del `MigrationRegistry` |
| `migrationId` | Identifica la migración |
| Beneficiario | Explícito |
| Ratio | Fracción racional |
| `nonce` | Consumido una sola vez, registrado |
| `expiry` | Vencimiento de la autorización |

---

## 6 · Claims sin vencimiento

**No hay pérdida de derecho sólo por no reclamar a tiempo.**

1. El diseño **financia y define** el mantenimiento de los claims.
2. Existe un **mecanismo de continuidad jurídicamente aprobado**.
3. Los activos no reclamados se **segregan**.
4. **No se promete que una página web funcionará eternamente.** Se declara el mecanismo de continuidad, que no depende de que un sitio siga en línea.
5. Se informa por canales apropiados, se explican los límites y se ofrece soporte. Una migración correcta genera preguntas legítimas y el sistema debe poder responderlas.

---

## 7 · Journal por usuario y por operación

Toda ejecución de migración mantiene un journal **por usuario y por operación**.

| Campo | Contenido |
|---|---|
| `operationId` | `op_` + 32 hex, unidad de idempotencia |
| Usuario o titular | Referencia opaca |
| `migrationId` | Migración a la que pertenece |
| Estado | Estado de la máquina del §7.1 |
| Bloque | Número y hash |
| Prueba | Referencia al entitlement y a su prueba |
| Nonce | Consumido |
| `txHash` | O identificador del proveedor |

Reglas de ejecución:

1. **Simulacro** primero, luego **lote canario**, luego el resto, con **límites**.
2. Se comparan el token y el delta de nativo o de gas **por separado**.
3. **Se detiene ante una diferencia o una transacción incierta.**
4. **Se reanuda desde las confirmaciones, no desde el comienzo.**
5. Si una cuenta tiene una excepción, se **preserva con expediente**; no se elimina del censo en silencio.
6. **No hay rollback de saldos on-chain** como si fueran una base restaurable.

### 7.1 Máquina de estado de la migración por usuario

```
[ ELEGIBLE ] --autorización firmada--> [ CLAIM_SOLICITADO ]
                                              |
                     exclusión verificada     |
                                              v
                                    [ EXCLUSION_CONFIRMADA ]
                                              |
                                              v
                                       [ EMITIDO ]  --> MigrationClaimed
                                              |
                                              +--> [ PENDIENTE ]  (entitlement P, sin vencimiento)
                                              +--> [ UNKNOWN ]    (se reconcilia, no se reintenta)
                                              +--> [ EXCEPCION ]  (expediente individual)
```

`UNKNOWN`, `EXCEPCION` y `PENDIENTE` son estados distintos y no se colapsan.

---

## 8 · Inventario previo obligatorio (P9a)

Antes de cualquier reemplazo se inventaría, a **bloque y hash comunes**, con lectura reproducible:

contrato, red, codehash, decimales, suministro, titulares conocidos, titulares que son contratos, roles, upgrade, pausa, mint, burn, escrow, puentes, allowances, órdenes abiertas, obligaciones de redención y relaciones de custodia.

Reglas:

1. Se **enumera la cobertura y la incertidumbre** de la lista de titulares.
2. **No se infiere que unos `Transfer` logs incompletos prueban todo el suministro.**
3. La prueba de equivalencia incluye tesorería, externos, wallets de contrato y contratos de escrow. **No sólo las N cuentas del backend.**
4. Se comparan **valores base exactos**. Valor económico, derechos y cantidades son verificaciones **separadas**.
5. El activo legacy se registra con política y documentación **en revisión** cuando corresponda, **no** como aprobado por defecto.
6. El titular **sigue viendo sus activos**. La compra nueva queda bloqueada donde falten derechos o política.

### 8.1 Red histórica

Una red declarada congelada exige revisar si existen derechos, usuarios externos o vías de cobro activas.

1. **No se apagan nodos, no se reutilizan firmas y no se cuenta una copia como reserva adicional.**
2. Si es una copia histórica, se documenta el corte y **la desactivación efectiva de toda vía de doble reclamación**.
3. Bloqueado por D14.

---

## 9 · Parámetros pendientes

| Parámetro | Valor | Decisión |
|---|---|---|
| Modo por activo (`FROZEN_SNAPSHOT` o `SURRENDER_ON_CLAIM`) | `FROZEN_SNAPSHOT` con emisión por cupo del padrón (§0.3); `SURRENDER_ON_CLAIM` para las excepciones | D26 + ADR-016 |
| Ratio por activo | `null` | D09 |
| Fecha de corte | `null` | D09 |
| Quién paga el gas del claim | En el camino normativo, el emisor; en las excepciones, `null` | D09 / D02 |
| Política de claims y su mantenimiento | `null` | D09 |
| Derechos del instrumento nuevo | `null` | D08 |
| Tratamiento jurídico de `E` | `null` | D08 / D09 |
| Continuidad de la red histórica | `null` | D14 |

Mientras D09 y D26 estén pendientes, **cada P9b está bloqueada** y toda ruta de migración, por cupo o por reclamo, devuelve `BLOCKED_DECISION`.

---

## 10 · Pruebas de aceptación de la serie

1. **T11**: Un poseedor que ya vendió sus tokens y figura en un snapshot informativo **no** obtiene un claim en modo `SURRENDER_ON_CLAIM`.
2. **T12**: Un intento de doble reclamación sobre el mismo derecho se rechaza; el nonce ya consumido no vuelve a servir.
3. **T13**: El árbol de derechos es reproducible a bloque y hash comunes, y su generación no publica PII ni relaciones de clientes.
4. **T14**: Una wallet externa incluida en el alcance se trata por su modo; no se le crea un saldo sustituto.
5. **T15**: Un titular que es un contrato (escrow, puente, wallet de contrato) se identifica y se trata por separado; no se omite del censo.
6. **T16**: Un entitlement no reclamado permanece reclamable tras el plazo nominal y figura segregado.
7. **T17**: La conciliación `S0 = A + N + P` se cumple con el caso `S0=1000, A=600, E=400, N=350, P=50`, y la comprobación `E + N + P = 800` se rechaza explícitamente como ecuación equivocada.
8. **T18**: Una migración completamente congelada produce `A = 0` y `S0 = N + P`, con el tratamiento de `E` referenciado.
9. **T19**: Un balance legacy en freeze **no** pasa a `E` económico por cambiar una etiqueta del registro; exige exclusión demostrada.
10. **T20**: Un ajuste ajeno a la migración se registra aparte y no modifica `S0`.
11. **T38**: Comparación de suministro y por titular a bloque común antes y después, con su incertidumbre enumerada.
12. **T39**: Ninguna reserva o respaldo se cuenta dos veces entre el activo viejo y el nuevo durante la migración.
13. **T47**: Un fallo de RPC durante la ejecución produce `UNKNOWN`, detiene el lote y no reintenta automáticamente.
14. **T48**: El journal permite reanudar desde las confirmaciones existentes sin duplicar ni ocultar lo ya confirmado.
15. **T49**: Un lote canario con límites se ejecuta antes del resto; una diferencia detiene la ejecución.
16. **T-700-16**: La regla de restos: la suma de entitlements más el registro de fracciones reproduce exactamente `E` convertido al ratio; ningún resto se trunca. Ref. T17.
17. **T-700-17**: Una dirección de «llave desconocida» se rechaza como escrow; sólo un escrow con bytecode y poderes verificados es aceptado. Ref. T14.
18. **T-700-18**: Un rebinding de Genesis ID no habilita un claim sin prueba de control, prueba de derecho y exclusión previa. Ref. T64, T12.
19. **T-700-19**: Un token fee-on-transfer o rebasing no se habilita por defecto; su migración exige soporte y pruebas específicas. Ref. T38.
20. **T-700-20**: Una excepción de cuenta se preserva con expediente y no desaparece del censo; el reporte la cuenta como excepción, no como éxito. Ref. T67.

---

## 11 · Propuestas para el contrato interno

Integradas en `../CONTRATO-INTERNO.md` (punto C01 del plan de corrección). Esta
sección ya no propone nada: lo que este documento necesitaba está en el contrato
interno, que vuelve a ser la fuente única.

