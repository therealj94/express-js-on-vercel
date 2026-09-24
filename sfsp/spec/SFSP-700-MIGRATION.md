# SFSP-700 · Migration

| Campo | Valor |
|---|---|
| Serie | SFSP-700 · Migration |
| Estado | `draft-0.4` (alineada con el borrador SFSP v0.2) |
| Fuente de tipos | `CONTRATO-INTERNO.md` §1, §2.4, §3, §5, §6.3 |
| Parte del plan maestro | P9a (registro sin movimiento), P9b (reemplazo técnico por activo), §6.3 |
| Decisiones que la bloquean | **D09 (modo, ratio, gas, corte y claims por activo)**, D08 (derechos), D10 (custodia y recuperación), D03 (semántica monetaria si el activo es el nativo), D14 (continuidad de la 8532) |

**Qué NO afirma este documento:** no afirma que ninguna migración esté aprobada, simulada ni ejecutada; no fija ratio, modo ni fecha de corte para ningún activo; no promete que ningún derecho pueda recuperarse si no existe una ruta técnica.

---

## 0 · Alineación con el borrador SFSP v0.2 (23-sep-2026)

> **Cómo leer esta sección.** El borrador SFSP v0.2 (`../fuente/`) es un borrador de trabajo: lo que sigue es **su posición**, llevada a esta serie. Hasta que la Junta lo firme, las decisiones afectadas siguen `PENDIENTE` en `../DECISIONES-SFSP.json` y todo lo que dependa de ellas devuelve `BLOCKED_DECISION`. Donde el v0.2 **cambia** una regla de más abajo, se dice aquí y la regla de abajo queda sustituida en cuanto se firme. La trazabilidad completa está en `../TRAZABILIDAD-SFSP-v0.2.md`.

### 0.1 La migración es dentro de la misma cadena

La migración de la 8532 a la 5550 **ya ocurrió**: el génesis de la 5550 (25-ago-2026) copió 172 contratos con su código y su almacenamiento, sin que ningún tenedor perdiera saldo. Por eso esta serie regula **el paso de los contratos heredados al régimen del protocolo dentro de la 5550**, sin cambio de red.

### 0.2 Tres salidas por contrato (v0.2 §14.2)

| Salida | Condición | Efecto |
|---|---|---|
| Registro transitorio | Activo del catálogo publicado por la Junta, con responsable | Opera mientras migra a un contrato conforme. Clase `LEGACY` |
| Migración a contrato conforme | El activo debe cumplir una serie | Instantánea, bloqueo, acuñación equivalente y conciliación |
| Inactivación | Contrato fuera del catálogo | Sigue en el estado **sin poder operar**, con constancia |

### 0.3 El flujo, con el filtro de transacciones como bloqueo

1. Desplegar el contrato conforme con su Asset Passport.
2. Anunciar un **bloque de corte** reproducible.
3. Instantánea de saldos con **raíz de Merkle** publicada en `SFSPMigrationRegistry`.
4. **Bloquear el heredado con el filtro de transacciones** (SFSP-150) desde el bloque de corte. Esto **sustituye** la pausa o la quema que los contratos heredados no tienen. El modo es `FROZEN_SNAPSHOT`.
5. Acuñar en el conforme los saldos equivalentes **en la misma dirección**. Al no cambiar de cadena, el reclamo por firma de `SURRENDER_ON_CLAIM` no hace falta.
6. Conciliar instantánea contra acuñado y cerrar con historia consultable.

La equivalencia es **por contrato, no por símbolo**: hay varios contratos con el mismo símbolo y lógica distinta.

### 0.4 Catálogo (v0.2 §14.4)

| Activo | Contrato canónico | Tratamiento |
|---|---|---|
| AUKA | `0x6facc8df79cedc6c5065442ce27e915aa3a26b9b` | Transitorio → conforme SFSP-300 |
| AGKA | `0x961f798f998c7ff44d47d62c7fa1b572ef187a4b` | Transitorio → conforme SFSP-300 |
| ONDK | `0xfb83eea4b384a4b18e5a1eba7a4bb4c0b7ca19c1` | Transitorio → conforme SFSP-200 |
| HARV | `0x0fa04d11f28b28cbc9b98dd016f02023addb1923` | Publicado; clase y serie por definir (D08) |
| IBS | por confirmar entre dos contratos con el mismo símbolo | Publicado; clase y serie por definir (D08) |

Propuestos para inactivación: SILVER KAPITAL, los cuatro WORIGEN, el envoltorio WETH y los doce pools V3, los catorce HARVI duplicados, los dos AUBEX y el resto sin propósito acreditado. MONARKA: por definir. El nombre de marca sale del Asset Passport, no de la función `name()` del contrato.

### 0.5 Condiciones previas que bloquean

1. **Conciliar los 9.823,01 AUKA y 792,5 ONDK sin ubicar** con el respaldo del reinicio del 25 de agosto (su lectura exige credenciales rotadas). **Ninguna migración de AUKA ni de ONDK se ejecuta antes.**
2. El trato de los adquirentes tempranos de ONDK se decide antes de migrar ONDK.
3. **La 8532 no está del todo detenida**: consta que un nodo seguía produciendo bloques con el RPC abierto (`infra/migracion-cadena/LA-8532-SIGUE-VIVA.md`). Se aplica §8.1 y D14 antes de dar la red por histórica.

---

## 1 · Dos fases

| Fase | Qué hace | Qué NO hace |
|---|---|---|
| **P9a · Registro sin movimiento** | Crea `accountId`, Account Number y binding hacia la dirección actual; inventaria contrato, red, codehash, decimales, suministro, titulares, roles, escrows, puentes, allowances, órdenes abiertas y obligaciones | No mueve fondos, no cambia semillas, no cambia contratos |
| **P9b · Reemplazo técnico por activo** | Sustituye un activo por otro, sólo cuando sea necesario, con modo, ratio y conciliación | No se ejecuta por defecto ni de forma masiva |

La migración de cuenta (P9a) se completa **antes** de cualquier sustitución de activos. Sus criterios de aceptación están en SFSP-130 §10.

---

## 2 · Los dos modos

**Se usa exactamente uno de estos dos modos por activo.** No hay un tercero y no se mezclan.

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

La autorización de un claim incluye, además de los campos de `SignedAuthorization` (§2.4):

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
| Modo por activo (`FROZEN_SNAPSHOT` o `SURRENDER_ON_CLAIM`) | `null` | D09 |
| Ratio por activo | `null` | D09 |
| Fecha de corte | `null` | D09 |
| Quién paga el gas del claim | `null` | D09 / D02 |
| Política de claims y su mantenimiento | `null` | D09 |
| Derechos del instrumento nuevo | `null` | D08 |
| Tratamiento jurídico de `E` | `null` | D08 / D09 |
| Continuidad de la red histórica | `null` | D14 |

Mientras D09 esté pendiente, **cada P9b está bloqueada** y toda ruta de claim devuelve `BLOCKED_DECISION`.

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

