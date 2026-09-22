# Auditoría independiente de SFSP

> Informe preparado por Codex para revisión y entrega a Claude. La auditoría se realizó en modo de lectura sobre el commit exacto indicado y sin modificar ningún archivo del repositorio.

**Dictamen:** el commit contiene defectos que impiden considerarlo listo para conectarse a fondos, derechos o cuentas reales. Las pruebas existentes cubren casos útiles, pero dejan fuera rutas críticas de autorización, migración y conciliación.

## Identificación del objeto auditado

| Campo | Valor |
|---|---|
| Repositorio | `therealj94/express-js-on-vercel` |
| Rama | `claude/galaxy-web-review-260wt4` |
| Commit auditado | `f1d57a31751f22d9f21060a8b1f945412f80d4bb` |
| Árbol incluido | Exclusivamente `sfsp/` |
| Modalidad | Lectura; sin modificar archivos |
| Producción | Fuera de alcance; el árbol auditado no está desplegado |

[Árbol exacto auditado en GitHub](https://github.com/therealj94/express-js-on-vercel/tree/f1d57a31751f22d9f21060a8b1f945412f80d4bb/sfsp)

## 1. Resumen ejecutivo

La auditoría encontró **25 hallazgos**: **9 P0**, **14 P1** y **2 P2**.

Los riesgos más graves son:

- El gobierno aprueba un texto o hash genérico, pero la ejecución no queda vinculada al contenido concreto aprobado.
- La API acepta objetos vacíos como aprobaciones y tampoco verifica criptográficamente las firmas declaradas.
- La migración de activos congelados confía en una etiqueta de catálogo y no impide de forma permanente reutilizar o reemplazar dos veces el mismo activo de origen.
- La liquidación confía en el activo, los participantes, las cantidades y el precio elegidos por el operador.
- El directorio puede terminar con dos cuentas primarias después de restaurar un snapshot y expone referencias mutables que permiten saltar invariantes.
- Las reservas pueden contarse dos veces y aceptan factores fuera del rango válido.
- El indexador puede aceptar una reorganización incompleta y presentar como conocido un supply derivado de eventos incompatibles o incompletos.
- La afirmación de “222 pruebas” describe pruebas definidas, pero no quedó reproducida mediante el verificador oficial en este entorno.

### Pruebas observadas y reproducidas

| Componente | Pruebas definidas | Pruebas reproducidas | Resultado reproducido |
|---|---:|---:|---|
| SDK | 48 | 44 | 44/44 aprobadas |
| Contracts | 74 | 0 | No ejecutadas: Hardhat/solc no disponibles |
| Indexer | 38 | 38 | 38/38 aprobadas |
| DBNX API | 62 | 62 | 62/62 aprobadas |
| **Total** | **222** | **144** | **144/144 de las ejecutadas** |

Las 44 pruebas del SDK, las 38 del indexer y las 62 de DBNX API se reprodujeron en memoria con Node.js v24.19.0 y type stripping. Cuatro pruebas del SDK que leen JSON no se ejecutaron por su ruta original. No se ejecutaron el comando oficial `verificar-todo.mjs`, la compilación estricta de TypeScript ni las 74 pruebas Solidity.

### Convención de evidencia

- **E:** comportamiento reproducido mediante ejecución local o prueba de concepto.
- **L:** conclusión derivada de lectura directa del código y de sus rutas de ejecución.

## 2. Registro consolidado de hallazgos

| ID | Prioridad | Hallazgo | Evidencia |
|---|---|---|---|
| H01 | P0 | El gobierno no vincula la ejecución al contenido aprobado | L |
| H02 | P0 | `ISSUER` puede quemar activos ajenos sin autorización específica | L |
| H03 | P0 | La API acepta autorizaciones sin firmas verificadas | E |
| H04 | P0 | La migración congelada no garantiza exclusión ni evita reutilización | L |
| H05 | P0 | La liquidación confía en el activo y el precio elegidos por el operador | L |
| H06 | P0 | La autorización de elegibilidad se identifica por monto, no por operación | L |
| H07 | P0 | Snapshots superficiales y referencias mutables rompen invariantes del directorio | E |
| H08 | P0 | La revalidación acepta destino alterado y fechas inválidas | E |
| H09 | P0 | Las reservas se duplican y admiten factores fuera de rango | E |
| H10 | P1 | La migración no es inherentemente idempotente y usa mapas incoherentes | E |
| H11 | P1 | Un dry-run fallido deja estado y ciertas excepciones no se reportan por cuenta | E |
| H12 | P1 | La cobertura se sobreestima y se pierde precisión numérica | E |
| H13 | P1 | La liberación no comprueba inventario técnico disponible | E |
| H14 | P1 | Una reorganización incompleta puede inventar continuidad y borrar el checkpoint | E |
| H15 | P1 | Divergencia de eventos y supply entre contratos e indexador | E/L |
| H16 | P1 | El adaptador de identidad publica vínculos enumerables | L |
| H17 | P1 | Se ignora la expiración de la migración | L |
| H18 | P1 | Las reservas de emisión no quedan vinculadas al activo | L |
| H19 | P1 | La aprobación para reanudar puede reutilizarse | L |
| H20 | P1 | Un informe antiguo puede satisfacer períodos nuevos | E |
| H21 | P1 | El lector de parámetros ignora si la decisión fue aprobada | E |
| H22 | P1 | El verificador puede emitir evidencia positiva con cobertura incompleta | L |
| H23 | P1 | La reparametrización conserva estado emitido aunque falten derechos requeridos | E |
| H24 | P2 | No tener `receive` no garantiza que todo efectivo tenga pasivo | L |
| H25 | P2 | La afirmación universal sobre D19 contradice la recuperación de acceso | E |

## 3. Hallazgos detallados

### H01 — P0 — El gobierno no vincula la ejecución al contenido aprobado

**Archivos:**

- `contracts/src/SFSPGovernanceController.sol:34–41, 122–127, 190–194, 232–257`
- `contracts/src/SFSPRegulatedAsset.sol:256–274`

La propuesta conserva un `detail` o hash genérico, pero `forcedTransfer` no comprueba que ese compromiso contenga el activo, origen, destino, monto y clase de acción finalmente ejecutados. El mismo desacople aparece en operaciones como `setQuorum` y `recordRecovery`.

En consecuencia, una aprobación válida para un contenido puede servir como habilitación formal de una ejecución distinta. La barrera verifica que exista una propuesta aprobada, pero no que la transacción ejecutada sea exactamente la que los aprobadores autorizaron.

**Corrección recomendada:** comprometer el payload completo y tipado de cada acción, verificarlo en el punto de ejecución y consumir la autorización una sola vez.

### H02 — P0 — `ISSUER` puede quemar activos ajenos sin autorización específica

**Archivos:**

- `contracts/src/SFSPRegulatedAsset.sol:192–207`
- Especificación `SFSP-800`, líneas 43–44

La ruta de quema exige el rol `ISSUER`, un motivo y un identificador de operación, pero no exige autorización del titular ni una aprobación de gobierno vinculada a esa quema concreta. El emisor puede quemar saldo de cualquier titular.

**Corrección recomendada:** exigir una autorización específica del propietario o una decisión de gobierno que comprometa activo, titular, monto, motivo e identificador, con consumo único.

### H03 — P0 — La API acepta autorizaciones sin firmas verificadas

**Archivo:** `dbnx-api/src/autorizaciones.ts:149–167, 213–305, 326–375`

La API no verifica criptográficamente una firma. En algunos caminos solo compara o transporta un digest, y la validación general acepta cualquier arreglo no vacío de aprobaciones, sin comprobar identidad, rol, unicidad o prueba de posesión de clave.

Pruebas de concepto reproducidas:

- `approvals: [{}]` produce `ok: true`.
- El mismo actor puede aparecer como `COMITE` y `SISTEMA` con el digest literal `no-es-el-hash`, y la emisión devuelve `ok: true`.

Esto no demuestra un bypass de las firmas exigidas por una ruta Solidity separada, pero sí invalida la garantía de autorización atribuida a esta API.

**Corrección recomendada:** verificar firmas reales sobre un digest canónico; validar firmantes, roles, separación de funciones, unicidad, vigencia y payload completo.

### H04 — P0 — La migración congelada no garantiza exclusión ni evita reutilización

**Archivo:** `contracts/src/SFSPMigrationRegistry.sol:104–135, 166–185, 266–272`

El estado `FROZEN` se deduce de una etiqueta de ciclo de vida registrada, pero el contrato no prueba que el activo de origen haya quedado técnicamente inmovilizado. Puede volver a cambiar de estado y también pueden crearse varios identificadores de migración para un mismo origen. El nullifier incorpora `migrationId`, por lo que una nueva migración produce un dominio distinto y permite reemplazar otra vez la misma posición.

Además, la conciliación inicial informa `A = S0`, lo que es incompatible con una interpretación fuerte de activo congelado y excluido del circulante.

**Corrección recomendada:** comprobar una exclusión técnica permanente del activo de origen, imponer unicidad global por activo o posición y usar un nullifier independiente del identificador arbitrario de migración.

### H05 — P0 — La liquidación confía en el activo y el precio elegidos por el operador

**Archivo:** `contracts/src/SFSPSettlementEngine.sol:59–88`

El operador entrega el contrato del activo, participantes y cantidades. No hay una dirección canónica del activo, una orden firmada que comprometa todos los campos, una fuente de precio verificada ni una prueba de entrega efectiva. Un contrato falso que devuelva un `assetId` esperado y cuya función de transferencia no haga nada podría mover efectivo sin entregar el activo real.

La atomicidad ante un `revert` sí se conserva; el problema es la autenticidad del activo y de la operación que se considera cumplida.

**Corrección recomendada:** registrar contratos canónicos, exigir una orden autorizada con todos los términos y verificar el resultado real de la entrega.

### H06 — P0 — La autorización de elegibilidad se identifica por monto, no por operación

**Archivos:**

- `contracts/src/SFSPEligibilityEngine.sol:90–97, 161–168`
- `contracts/src/SFSPRegulatedAsset.sol:130–135`
- `contracts/src/SFSPSettlementEngine.sol:91–93`

El contexto de autorización se reduce a `bytes32(amount)`. La misma autorización puede reutilizarse para otra operación del mismo monto, activo o acción, aunque cambien las partes.

**Corrección recomendada:** comprometer un identificador completo de operación que incluya dominio, contrato, acción, activo, origen, destino, monto, nonce y vencimiento; consumirlo en el ejecutor.

### H07 — P0 — Snapshots superficiales y referencias mutables rompen invariantes del directorio

**Archivo:** `sdk/src/directorio.ts:59–67, 99–101, 119–120, 238–245, 264–285, 332–337`

Los clones de mapas son superficiales y comparten los objetos almacenados. Además, distintos métodos devuelven referencias mutables a esos objetos.

Pruebas de concepto reproducidas:

- Crear A como primaria, tomar snapshot, crear B como primaria, restaurar y crear C como primaria deja **dos cuentas primarias**.
- Modificar una referencia obtenida permite alterar `accountNumber` y revivir un vínculo revocado sin pasar por las validaciones previstas.

**Corrección recomendada:** usar copias profundas o estructuras inmutables, devolver copias defensivas y validar todas las invariantes al restaurar.

### H08 — P0 — La revalidación acepta destino alterado y fechas inválidas

**Archivo:** `sdk/src/binding.ts:72–78, 119–135`

La revalidación no compara todos los campos que identifican el vínculo, como dirección, cadena o cuenta. Fechas inválidas se convierten en `NaN` y atraviesan comparaciones que deberían rechazarlas.

Se reprodujo que una resolución con `address`, `chainId` o expiración modificadas puede ser aceptada sin error.

**Corrección recomendada:** validar el esquema antes de comparar y exigir igualdad del destino completo, cadena, cuenta, sujeto, vigencia y propósito.

### H09 — P0 — Las reservas se duplican y admiten factores fuera de rango

**Archivo:** `sdk/src/reservas.ts:55–79, 84–98`

Una misma reserva puede computarse más de una vez. Una reserva marcada como asignada a A y B puede aportar su monto completo a ambas. Además, se acepta un factor de `20000` puntos básicos, fuera del rango normal de 0 a 10000.

**Corrección recomendada:** deduplicar por identificador canónico, representar la asignación de forma no ambigua y validar rangos de factores y proporciones.

### H10 — P1 — La migración no es inherentemente idempotente y usa mapas incoherentes

**Archivo:** `sdk/src/migracionCuentas.ts:67–68, 97, 124–129, 208–215`

El mapa externo `yaMigradas` es opcional y no se actualiza ni se valida como parte de una transacción durable. Dos llamadas de aplicación sin ese mapa crean dos cuentas. Si se pasan pares obtenidos de una simulación como mapa, el total migrado puede quedar en cero mientras `cuadra` resulta verdadero y `accountsSFSP` vale uno.

**Corrección recomendada:** mantener una relación única y durable entre origen y destino, y validar y actualizar esa relación atómicamente dentro del proceso.

### H11 — P1 — Un dry-run fallido deja estado y ciertas excepciones no se reportan por cuenta

**Archivo:** `sdk/src/migracionCuentas.ts:99–103, 132–174, 217`

La restauración del estado ocurre al final, pero no dentro de un `finally`. Una falla inyectada puede dejar dos cuentas creadas durante un dry-run. Además, conversiones como `BigInt` ocurren fuera del manejo por cuenta: un saldo `UNKNOWN_SOURCE` provoca `SyntaxError` y aborta sin producir el informe esperado.

**Corrección recomendada:** restaurar siempre en `finally` y aislar la validación y conversión de cada registro para producir errores estructurados.

### H12 — P1 — La cobertura se sobreestima y se pierde precisión numérica

**Archivo:** `sdk/src/supply.ts:103–119`

La fórmula trunca resultados intermedios y convierte enteros grandes a `number`.

Pruebas reproducidas:

- `coverageBps(1n, 199n, 1n, 2)` devuelve `10000` puntos básicos, aunque el valor aproximado correcto es `5025`.
- Para un caso cuyo resultado entero esperado es `9007199254740993`, la salida es `9007199254740992`.

**Corrección recomendada:** calcular la razón completa una sola vez con `bigint` o aritmética racional y devolver `bigint` o cadena cuando el resultado pueda superar el entero seguro.

### H13 — P1 — La liberación no comprueba inventario técnico disponible

**Archivo:** `sdk/src/supply.ts:76–92`

La decisión de liberar unidades no exige `cantidad <= noActivado`. Por ejemplo, con supply 100, no activado 10, solicitud 20, cap 200 y RAC 200, devuelve `ALLOW` y un supply final liberado de 110, aunque el inventario técnico disponible era 10.

**Corrección recomendada:** comprobar tanto la capacidad económica como el inventario técnico antes de autorizar la liberación.

### H14 — P1 — Una reorganización incompleta puede inventar continuidad y borrar el checkpoint

**Archivos:**

- `indexer/src/checkpoint.ts:169–219`
- `indexer/src/reconcile.ts:136–182`

Una historia A1…A5 seguida de B6 cuyo padre B5 no fue suministrado se acepta como reorganización y deja alturas `[1,2,3,4,6]`. El algoritmo sustituye parte de la ascendencia nueva con datos de la rama vieja. Una reorganización profunda puede lanzar una excepción después de borrar el historial. Además, la conciliación con hashes nulos puede devolver `OK` solo porque las alturas coinciden.

**Corrección recomendada:** exigir cabeceras completas de la nueva rama, construir y validar la transición antes de aplicarla atómicamente y comparar identidad efectiva de bloques.

### H15 — P1 — Divergencia de eventos y supply entre contratos e indexador

**Archivos:**

- `indexer/src/decode.ts:46–98, 171–194`
- `indexer/src/supply.ts:115–162, 178–187`
- `contracts/src/SFSPRegulatedAsset.sol:17, 210–225`

El indexador espera campos que no coinciden con los eventos del contrato. `BurnExecuted` no contiene el `assetId` que el decoder requiere. El agregador ignora la marca `completo`; la migración usa `UnitsMinted` mientras el indexador espera `MintExecuted`; y un valor derivado de eventos se etiqueta como `CHAIN_TOTALSUPPLY`.

Pruebas reproducidas:

- Mint de 100 y burn de 40 deja supply emitido 100 y marcado como conocido.
- Un mint incompleto por 999 queda agregado como 999 y conocido.

**Corrección recomendada:** definir un contrato de eventos común, mapear emisor a activo de forma inequívoca, exigir cobertura completa y no presentar como conocido un supply parcial.

### H16 — P1 — El adaptador de identidad publica vínculos enumerables

**Archivo:** `contracts/src/SFSPIdentityAdapter.sol:39–52, 63–75`

El evento `SubjectRefBound` publica dirección y `subjectRef` indexados, y `subjectRefOf` conserva la relación consultable. Aunque no se almacenen nombres, permite correlacionar wallets mediante un identificador estable.

**Corrección recomendada:** usar referencias no enlazables por propósito o declarar con precisión la capacidad de correlación. No se encontraron identidades reales en el repositorio.

### H17 — P1 — Se ignora la expiración de la migración

**Archivo:** `contracts/src/SFSPMigrationRegistry.sol:112, 129, 211–215`

La migración almacena `m.expiry`, pero `claim` solo comprueba `c.expiry`. Una migración vencida puede seguir abierta si se presenta después un claim con vencimiento futuro.

**Corrección recomendada:** comprobar simultáneamente la vigencia de la migración y la del claim.

### H18 — P1 — Las reservas de emisión no quedan vinculadas al activo

**Archivo:** `contracts/src/SFSPIssuanceController.sol:141–168`

La reserva conserva solo el monto. Al cerrarla se puede indicar un `assetId` arbitrario, por lo que una reserva de A puede cerrarse contra B y corromper los contadores. `_outstanding` devuelve cero si el activo no está registrado, ocultando el error.

**Corrección recomendada:** almacenar activo y monto en la reserva y rechazar activos desconocidos o distintos al reservado.

### H19 — P1 — La aprobación para reanudar puede reutilizarse

**Archivo:** `contracts/src/SFSPGovernanceController.sol:201–224`

`liftPause` no consume la propuesta. Una aprobación `UNPAUSE` antigua puede reutilizarse para levantar una pausa posterior. Cada pausa individual puede vencer, pero la reutilización permite saltar la aprobación correspondiente al nuevo incidente.

**Corrección recomendada:** vincular la aprobación a una pausa concreta y consumirla al ejecutarla.

### H20 — P1 — Un informe antiguo puede satisfacer períodos nuevos

**Archivo:** `sdk/src/reporting.ts:157–179, 198–220`

Cualquier entrega anterior de la misma plantilla y previa al vencimiento puede contar para una obligación posterior. Un informe de enero de 2025 puede aparecer como `CURRENT` frente a un vencimiento de septiembre de 2026. Además, ramas de subsanación diferentes producen la misma advertencia y un texto posterior afirma que no hubo entrega.

**Corrección recomendada:** asociar cada entrega a una obligación y período únicos, y hacer coherentes estado y explicación.

### H21 — P1 — El lector de parámetros ignora si la decisión fue aprobada

**Archivo:** `sdk/src/decisiones.ts:62–74`

`parametro` comprueba que el valor no sea nulo, pero no que la decisión correspondiente esté aprobada. Se reprodujo que un `releaseCap` de 10 asociado a D03 pendiente permite una decisión `ALLOW`. En los JSON actuales esos parámetros están nulos, pero el código acepta estados futuros incoherentes.

**Corrección recomendada:** exigir aprobación y coherencia de versión antes de exponer cualquier parámetro operativo.

### H22 — P1 — El verificador puede emitir evidencia positiva con cobertura incompleta

**Archivo:** `scripts/verificar-todo.mjs:34–42, 48–56, 68–75, 83–115, 127`

Una suite ausente o el modo `--rapido` no hacen fallar necesariamente el resultado global. Una salida no reconocida puede contabilizar cero pruebas y aun así marcarse como `PROBADO`. Algunos valores económicos no nulos se comprueban o imprimen después de escribir la evidencia positiva.

**Corrección recomendada:** distinguir explícitamente verificación completa y parcial, hacer fallar suites ausentes o con cero pruebas y ejecutar todos los gates antes de emitir evidencia.

### H23 — P1 — La reparametrización conserva estado emitido aunque falten derechos requeridos

**Archivo:** `sdk/src/plantillas.ts:102–115, 122–150`

Una plantilla ya emitida puede reparametrizarse de modo que un parámetro requerido quede nulo mientras `emitida` continúa en verdadero.

**Corrección recomendada:** crear una nueva revisión pendiente o rechazar cambios que invaliden una emisión vigente.

### H24 — P2 — No tener `receive` no garantiza que todo efectivo tenga pasivo

**Archivo:** `contracts/src/SFSPCashVault.sol:70–71, 144–147`

Aunque el contrato no tenga `receive`, Ether puede forzarse mediante mecanismos de la EVM, por ejemplo un `SELFDESTRUCT` desde otro contrato. Esto puede aumentar el saldo on-chain sin crear un pasivo correspondiente. Desde EIP-6780 cambiaron efectos de `SELFDESTRUCT`, pero sigue siendo posible enviar el saldo al beneficiario.

No implica insolvencia ni robo: la conciliación puede detectar un superávit. La afirmación absoluta es la parte incorrecta.

**Corrección recomendada:** expresar la propiedad como solvencia o cobertura de pasivos y registrar o clasificar los superávits inesperados.

Referencia: [EIP-6780](https://eips.ethereum.org/EIPS/eip-6780).

### H25 — P2 — La afirmación universal sobre D19 contradice la recuperación de acceso

**Archivo:** `sdk/src/custodia.ts:46–55`

La afirmación B4 sostiene que no existe recuperación ejecutable sin D19, pero la ruta de recuperación solo de acceso, cuando la clave no fue perdida, devuelve `ejecutable: true` sin D19. Esa ruta no recupera fondos, pero contradice la formulación universal.

**Corrección recomendada:** limitar la afirmación a recuperación de fondos, custodia o clave, según la garantía realmente implementada.

## 4. Revisión fila por fila de las 48 afirmaciones

### Grupo A

| Fila | Resultado | Evaluación |
|---|---|---|
| A1 | Resistida | Usa `randomBytes`; las pruebas incluyen un millón de muestras. |
| A2 | Resistida | El rejection sampling descarta valores desde 250 y evita sesgo modular. |
| A3 | Resistida con límite | El conjunto de consumidos queda fuera del snapshot en memoria; no prueba persistencia entre procesos. |
| A4 | Parcial | Se cubren confusables concretos, pero no todos los pares visuales posibles. |
| A5 | Parcial | Las operaciones previstas preservan la invariante, pero las referencias mutables permiten romperla globalmente. |
| A6 | Refutada | Los snapshots superficiales permiten dos cuentas primarias; véase H07. |
| A7 | Refutada | La revalidación admite destinos alterados y fechas inválidas; véase H08. |
| A8 | Parcial | La transición terminal está protegida por la API, pero una referencia mutable permite eludirla. |

### Grupo B

| Fila | Resultado | Evaluación |
|---|---|---|
| B1 | Resistida | La ruta revisada exige la combinación prevista de condiciones. |
| B2 | Resistida | Los estados y validaciones examinados sostienen la afirmación en su alcance literal. |
| B3 | Resistida | La secuencia nominal impide la ejecución descrita. |
| B4 | Refutada literalmente | Existe recuperación ejecutable de acceso sin D19; véase H25. |

### Grupo C

| Fila | Resultado | Evaluación |
|---|---|---|
| C1 | Resistida | La ruta nominal conserva la correspondencia declarada. |
| C2 | Resistida con límite | La garantía se sostiene dentro de las entradas y formatos válidos observados. |
| C3 | Refutada | Un dry-run fallido puede dejar estado; véase H11. |
| C4 | Refutada | La idempotencia depende de un mapa externo opcional e incoherente; véase H10. |
| C5 | Parcial | Se reportan errores por cuenta en varias rutas, pero ciertas excepciones abortan todo el proceso. |
| C6 | Resistida | La validación examinada cumple la propiedad en los casos cubiertos. |

### Grupo D

| Fila | Resultado | Evaluación |
|---|---|---|
| D1 | Parcial | La ecuación del SDK se sostiene, pero la interpretación contractual de congelado falla; véase H04. |
| D2 | Resistida con límite | La aritmética revisada cuadra; no se verificó una redención futura real. |
| D3 | Parcial | Evita repetición dentro de una migración, pero no entre migraciones; véase H04. |
| D4 | Refutada | La fórmula sobreestima cobertura y pierde precisión; véase H12. |
| D5 | Resistida | Las comprobaciones observadas sostienen la afirmación en su alcance. |

### Grupo E

| Fila | Resultado | Evaluación |
|---|---|---|
| E1 | Resistida | La condición económica nominal se cumple en los casos revisados. |
| E2 | Parcial | Se controla capacidad económica, pero no inventario técnico; véase H13. |
| E3 | Refutada | Una reserva puede contarse varias veces y asignarse completa a varios destinos; véase H09. |
| E4 | Resistida con límite | La fórmula nominal es consistente; falta imponer el rango de factores. |
| E5 | Parcial | El planteo conceptual se sostiene, pero la implementación numérica pierde precisión; véase H12. |

### Grupo F

| Fila | Resultado | Evaluación |
|---|---|---|
| F1 | Resistida por lectura | Las restricciones observadas sostienen la afirmación nominal. |
| F2 | Parcial | La emisión ordinaria resiste; la migración permite doble reemplazo; véase H04. |
| F3 | Resistida por lectura | La ruta revisada conserva la propiedad declarada. |
| F4 | Resistida | El comportamiento ERC-20 relevante se mantiene en la implementación revisada. |
| F5 | Parcial | Existe aprobación formal, pero no queda ligada a la ejecución exacta; véase H01. |
| F6 | Parcial | El `revert` conserva atomicidad, pero no se autentican activo y términos; véase H05. |
| F7 | Refutada literalmente | Puede entrar efectivo forzado sin pasivo; véase H24. |
| F8 | Parcial | La pausa individual vence, pero una aprobación antigua de reanudación se reutiliza; véase H19. |
| F9 | Refutada en alcance universal | Existen rutas críticas controladas por un solo rol, entre ellas pausa y quema. |

### Grupo G

| Fila | Resultado | Evaluación |
|---|---|---|
| G1 | Parcial | Los JSON actuales mantienen valores nulos, pero el lector no exige aprobación; véase H21. |
| G2 | Refutada | Reorg y supply pueden quedar incorrectos o presentarse como conocidos; véanse H14 y H15. |
| G3 | Resistida literalmente con límite | El control nominal existe, pero la reutilización entre migraciones de H04 reduce la garantía sistémica. |
| G4 | Resistida | La lógica revisada sostiene la afirmación en su formulación literal. |
| G5 | Parcial | La documentación reconoce límites de privacidad, pero el adaptador permite correlación enumerable; véase H16. |
| G6 | Parcial | Hay 222 pruebas definidas; solo se reprodujeron 144 y el verificador puede certificar cobertura incompleta; véase H22. |

### Grupo H

| Fila | Resultado | Evaluación |
|---|---|---|
| H1 | Resistida | El escaneo no encontró credenciales, claves o PII reales. |
| H2 | Resistida | Las direcciones encontradas son sintéticas o de prueba. |
| H3 | Parcial | Se reprodujeron 144 pruebas sin red; contratos y parte del SDK dependen de disponibilidad local de proveedor o compilador. |
| H4 | Resistida | El SDK revisado no necesita dependencias de runtime para las rutas ejercitadas. |
| H5 | Resistida con límite | Hay vectores útiles; esto no sustituye una auditoría criptográfica exhaustiva. |

## 5. Afirmaciones que resistieron el desafío

Resistieron en su alcance literal o con los límites indicados:

- A1, A2 y A3.
- B1, B2 y B3.
- C1, C2 y C6.
- D2 y D5.
- E1 y E4.
- F1, F2, F3, F4 y F6.
- G3 y G4.
- H1, H2, H4 y H5.

Que una afirmación figure aquí no elimina las limitaciones descritas en la tabla fila por fila.

## 6. Sospechas investigadas y no confirmadas

- El estado `MANAGED` presupone que la custodia externa es efectiva, pero el repositorio no aporta evidencia operacional que permita confirmarlo o refutarlo.
- La cobertura de alias visuales parece incompleta, aunque no se demostró una colisión explotable universal.
- La revocación de identidad frente a attestations tardías y cambios de roles merece pruebas adicionales; no se confirmó una explotación completa.
- La prueba larga de `keccak` comprueba longitud y diferencia, pero no se contrastó con un vector externo independiente.
- Hay componentes externos de autorización no incluidos. Por eso no se afirma que todas las rutas sean explotables por un actor anónimo.

## 7. Qué quedó sin cubrir

1. **Pruebas Solidity:** las 74 pruebas de contratos no se ejecutaron porque Hardhat y el compilador Solidity requeridos no estaban disponibles localmente.
2. **Cuatro pruebas del SDK:** las que leen JSON no se reprodujeron por su ruta original.
3. **Gates oficiales:** no se ejecutaron la compilación estricta de TypeScript ni el comando oficial completo `node scripts/verificar-todo.mjs`.
4. **Arranque limpio sin red:** no se verificó. La configuración pide Solidity 0.8.28 mientras el lockfile referencia solc 0.8.26; Hardhat puede requerir una descarga. Véase la [documentación de compilación de Hardhat](https://v2.hardhat.org/hardhat-runner/docs/guides/compile-contracts).
5. **Persistencia, concurrencia e integración:** no se probaron con almacenamiento durable, múltiples procesos ni carreras reales.
6. **Producción:** red, cuentas, despliegues y datos reales quedaron fuera de alcance por instrucción expresa.
7. **Validez externa:** no se verificaron conclusiones legales, económicas ni la existencia real de reservas.

## 8. Estado final de la auditoría

- Se recuperaron e inspeccionaron **163 archivos** del árbol auditado.
- Se revisaron **las 48 afirmaciones**, fila por fila.
- Se reprodujeron **144 pruebas existentes**, todas aprobadas en las rutas ejecutadas.
- No se certifica la cifra completa de **222 pruebas** porque 78 no se ejecutaron en este entorno.
- Se identificaron **25 hallazgos**: 9 P0, 14 P1 y 2 P2.
- No se modificó ningún archivo del repositorio.

El foco estuvo en código ejecutable, pruebas, scripts de verificación, instrucciones y secciones normativas con efecto sobre las garantías declaradas.
