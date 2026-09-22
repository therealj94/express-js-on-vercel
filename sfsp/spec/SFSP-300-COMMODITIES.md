# SFSP-300 · Commodities

| Campo | Valor |
|---|---|
| Serie | SFSP-300 · Commodities |
| Estado | `draft-0.3` |
| Fuente de tipos | `CONTRATO-INTERNO.md` §1, §2.3, §3, §6.2, §6.4 |
| Parte del plan maestro | P8-C (AUKA y AGK/AGKA), P8-R (reservas y oráculos), §1.2 |
| Decisiones que la bloquean | D05 (custodia, lotes, obligaciones y redención), D04 (reservas elegibles, haircuts, concentración), D02 (mínimos y alcance del cobro), D08 (derechos del instrumento) |

**Qué NO afirma este documento:** no afirma que exista metal asignado, custodia acreditada, derecho de entrega ejercitable ni cobertura de ninguna serie existente; no convierte ninguna emisión histórica en capacidad respaldada.

---

## 1 · Activos en alcance

### 1.1 AUKA

Diseño nuevo sujeto a validación del instrumento. Una unidad representa **una onza troy fina** del metal correspondiente. Se permiten fracciones.

### 1.2 AGK y AGKA

| Nombre | Qué es |
|---|---|
| **AGK** | Nombre de producto propuesto. |
| **AGKA** | Símbolo legacy observado en el código. |

Regla normativa: **no se crea un token nuevo por corregir el nombre.** El vínculo entre AGK y AGKA se expresa como **alias**, en `AssetPassport.aliases`, sujeto a verificación de instrumento, unidad y derechos. El `assetId` del activo legacy se conserva.

Un alias no autoriza reclamar dos veces el mismo derecho. Si en algún momento se determinara que hace falta un instrumento distinto, eso es una migración de SFSP-700, con su modo, su conciliación y su anti doble derecho, no un cambio de etiqueta.

### 1.3 Serie existente

Antes de ofrecer la serie existente como redimible se verifica: suministro, titularidad del metal asignado, pureza, derechos, gravámenes y cobertura de **todo lo prometido**.

1. La emisión histórica declarada **no se convierte en capacidad real** por poner `mintableCapacity = 0`.
2. Si falta respaldo o difieren los derechos: se registra el activo como legacy, se preservan las tenencias y DBNX formula un plan de cobertura o reestructuración **consentido**.
3. **No se usa la etiqueta «una onza garantizada»** sin la verificación completa.

---

## 2 · `MetalLot`

Un lote físico de metal. `lotId` = `lot_` + 32 hex.

Campos mínimos:

| Campo | Regla |
|---|---|
| `lotId` | Identificador único. |
| Peso bruto | En la unidad declarada, entero en unidades base. |
| Pureza | Declarada y acreditada por el ensayo referenciado. |
| **Onzas finas** | Derivadas de peso bruto y pureza. Es la magnitud del invariante. |
| Custodio y ubicación | Identificados, con jurisdicción. |
| Evidencia | `evidenceId`; un `evidenceHash` protege integridad, **no demuestra que el metal exista**. |
| Asignación exclusiva | A qué obligación está asignado. Exclusiva: un lote no respalda dos cosas. |
| Estado | Ver §2.1. |

### 2.1 Estados del lote

| Estado | Significado | Habilita emisión |
|---|---|---|
| `INTAKE` | Recibido, sin evidencia completa | No |
| `ATTESTED` | Con evidencia vigente | Sí, si está libre |
| `ASSIGNED` | Asignado en exclusiva a tokens vigentes | No (ya computado) |
| `RESERVED_FOR_DELIVERY` | Reservado para una entrega en curso | **No**, y no se reutiliza para mint |
| `DELIVERED` | Entregado; sale del inventario asignado | No |
| `EXPIRED_EVIDENCE` | Evidencia vencida | No |

Reglas:

1. **Mint requiere capacidad libre real y autorización vigente.** No basta con que exista un lote.
2. **Los lotes reservados para entrega no se reutilizan para mint.**
3. Una reserva ya asignada a AUKA **no respalda también** al activo nativo ni a otro instrumento.
4. Una evidencia vencida no habilita release ni mint. Emite `ReserveExpired` y la capacidad baja.
5. Identidad de lote o de custodio falsa o incompleta se **rechaza**.
6. La tesorería de una serie totalmente respaldada contiene tokens con metal asignado, **no** un suministro diseñado acuñado por adelantado.

---

## 3 · Invariante en onzas finas (§6.4)

```
FineOunces_assigned_not_delivered  >=  Tokens_outstanding_backed + PendingDeliveryObligations_burned
```

Lectura de cada término:

| Término | Significado |
|---|---|
| `FineOunces_assigned_not_delivered` | Onzas finas de metal asignado en exclusiva y **aún no entregado**. |
| `Tokens_outstanding_backed` | Tokens de la serie respaldada **aún vigentes**, expresados en onzas finas. |
| `PendingDeliveryObligations_burned` | Obligaciones de entrega pendientes cuyos tokens **ya fueron quemados**. |

Reglas de no doble conteo:

1. Las unidades en estado `locked` que **siguen en `totalSupply`** no se cuentan dos veces: están en `Tokens_outstanding_backed`, no además como obligación.
2. Una vez quemados los tokens, la obligación pasa a `PendingDeliveryObligations_burned` y sale de `Tokens_outstanding_backed`. El paso es simultáneo en la conciliación.
3. Un lote `RESERVED_FOR_DELIVERY` sigue dentro de `FineOunces_assigned_not_delivered` hasta que la entrega ocurra, y **no** habilita emisión nueva.
4. El invariante se evalúa en **onzas finas**, no en peso bruto ni en unidades de token, para evitar errores de pureza.
5. Una violación del invariante **bloquea** toda emisión nueva de la serie y activa el plan de normalización. **No se reducen balances de clientes para cuadrar cifras.**

---

## 4 · Máquina de redención

```
[ REQUESTED ]
     | validación de elegibilidad, mínimos, datos de entrega
     v
[ VALIDATED ]
     | bloqueo de los tokens del solicitante
     v
[ TOKENS_LOCKED ]
     | reserva exclusiva de lote(s) suficientes en onzas finas
     v
[ METAL_RESERVED ]
     | quema de los tokens bloqueados
     v
[ TOKENS_BURNED ]        <-- aquí nace la obligación exigible
     |
     v
[ DELIVERY_PENDING ]
     | entrega acreditada por el custodio
     v
[ DELIVERED ]
```

Cada transición emite `RedemptionUpdated`.

### 4.1 Por qué NO es atómica

**La redención no es una operación físicamente atómica.** El movimiento de metal ocurre en el mundo físico, con custodios, logística y plazos; la quema ocurre en la cadena. No existe un mecanismo que haga ambas cosas en una sola transacción reversible.

Consecuencias normativas:

1. Existe una ventana entre `TOKENS_BURNED` y `DELIVERED` en la que el titular ya no tiene tokens y todavía no tiene metal.
2. En esa ventana existe una **obligación exigible de redención**, reconciliada **aparte del token**.
3. Esa obligación entra en el invariante del §3 como `PendingDeliveryObligations_burned`. No desaparece del balance porque los tokens ya no existan.
4. Cada estado de la máquina es un punto de reanudación. Una interrupción se reanuda desde el último estado confirmado, no desde el principio.
5. `UNKNOWN` es un estado real en la ejecución de cualquier paso on-chain. Un `UNKNOWN` se reconcilia antes de continuar; no se reintenta quemando otra vez.

### 4.2 Cancelación y reemisión

Si no se entregó, una cancelación o reemisión requiere:

1. **Prueba de que el metal no fue liberado.**
2. **Prueba de que el derecho anterior queda anulado.**
3. Expediente completo con autoridad.

**Nunca se quema para luego olvidar el caso.** Un caso en `DELIVERY_PENDING` permanece abierto y reconciliado hasta `DELIVERED` o hasta una cancelación acreditada.

---

## 5 · Mínimos: dos conceptos distintos

| Concepto | Qué es | Valor |
|---|---|---|
| **Compra mínima** | Importe mínimo para adquirir unidades, equivalente a USD 1 como objetivo comercial | `null`, pendiente D02 |
| **Mínimo de redención física** | Cantidad mínima entregable físicamente, determinada por logística, formato del lingote y costes | `null`, pendiente D05 |

Reglas:

1. La compra mínima **no es** un mínimo universal de transferencias, liquidaciones ni redención física.
2. El mínimo logístico, las tarifas, la bóveda, el plazo y el derecho de entrega se **publican por política**, versionada.
3. Un usuario puede tener una posición perfectamente válida por debajo del mínimo de redención física. Eso se le informa antes de comprar, no después de solicitar la entrega.
4. Fracciones permitidas en la tenencia y en la transferencia. La redención física opera sobre múltiplos del mínimo logístico.

---

## 6 · Valoración de reserva (§6.2)

```
EligibleValue_i = NetRealizableValue_i
                  × EligibilityFactor_i
                  × (1 - Haircut_i)
                  × ConcentrationFactor_i
```

Reglas:

1. `NetRealizableValue` **no es «onzas × spot»**. Es el valor de derechos netos realizables: costes, permisos, deuda y tiempo incluidos, según una metodología firmada.
2. Los tres factores (`EligibilityFactor`, `Haircut`, `ConcentrationFactor`) son **distintos y no se duplican entre sí**.
3. Todos los porcentajes son **`null` hasta D04**. Una capacidad que dependa de ellos devuelve `BLOCKED_DECISION`.
4. Las categorías A–E son un catálogo amplio (liquidez inmediata, activos líquidos, proyectos avanzados, recursos in situ, alta incertidumbre) y **no significan elegibilidad automática**.
5. **No se fija un haircut universal por tipo de informe NI 43-101.** Ese estándar informa sobre proyectos minerales; no asigna por sí mismo un porcentaje monetario de garantía.
6. Un activo puede ingresar al expediente y recibir **capacidad cero** hasta completar evidencia.
7. El motor calcula límites por grupo y contraparte. No es un factor arbitrario que se edita para cuadrar.

---

## 7 · Oráculos

Se diferencian cuatro magnitudes y **no** se sustituyen entre sí:

| Magnitud | Uso |
|---|---|
| `referencePrice` | Referencia informativa. |
| `executionQuote` | Precio de una ejecución concreta, con TTL. |
| `reserveValuation` | Valoración de reserva bajo metodología firmada. |
| `liquidityAvailable` | Liquidez efectivamente disponible. |

Reglas:

1. PAXG se identifica como **precio de token**, no como precio de metal.
2. `PAXGUSDT` exige comprobar la paridad USDT/USD; no se asume 1:1.
3. **Dos APIs no son dos fuentes independientes** si comparten el mercado de origen.
4. Política explícita de freshness, desviación, horarios de mercado, cuarentena y discrepancia. **No hay fallback inventado**: una fuente stale produce `UNKNOWN_SOURCE`.

---

## 8 · Conciliación

Conciliación **por operación**, más monitoreo continuo, más **reporte diario** contra custodios y proveedores.

Conceptos que se concilian por separado:

1. Suministro de tokens de la serie.
2. Inventario de lotes por estado.
3. Onzas finas asignadas y no entregadas.
4. Obligaciones de entrega pendientes con tokens ya quemados.
5. Casos de redención abiertos por estado.
6. Evidencias de reserva y sus vencimientos.

Una diferencia **bloquea la acción que aumenta el riesgo**. No borra balances ni declara fallida una operación en `UNKNOWN`.

---

## 9 · Parámetros pendientes

| Parámetro | Valor | Decisión |
|---|---|---|
| `compraMinimaUSD` | `null` | D02 |
| `minimoRedencionFisica` | `null` | D05 |
| `haircutsPorTier` A–E | `null` | D04 |
| `factoresDeElegibilidad` A–E | `null` | D04 |
| `limitesDeConcentracion` | `null` | D04 |
| Derechos de entrega, plazos y tarifas | `null` | D05 |
| Serie redimible habilitada | `null` | D05 |
| Nuevas emisiones de commodity | `null` | D05 |

---

## 10 · Pruebas de aceptación de la serie

1. **T39**: Una reserva ya asignada a AUKA **no respalda también** al activo nativo; el motor rechaza la doble asignación.
2. **T43**: La máquina de redención recorre `REQUESTED -> VALIDATED -> TOKENS_LOCKED -> METAL_RESERVED -> TOKENS_BURNED -> DELIVERY_PENDING -> DELIVERED` emitiendo `RedemptionUpdated` en cada transición, y reanuda desde el último estado confirmado tras una interrupción.
3. **T-300-03**: Una reserva con evidencia vencida no habilita mint ni release; emite `ReserveExpired` y la capacidad baja. Ref. T40.
4. **T-300-04**: Identidad de lote o de custodio falsa o incompleta se rechaza en el intake. Ref. T41.
5. **T-300-05**: El invariante del §6.4 se mantiene en cada transición de la máquina de redención, incluidos los estados intermedios. Ref. T39.
6. **T-300-06**: Las unidades `locked` que siguen en `totalSupply` no se cuentan dos veces en el invariante. Ref. T39.
7. **T-300-07**: Un lote `RESERVED_FOR_DELIVERY` no habilita emisión nueva por ninguna ruta. Ref. T39.
8. **T-300-08**: Entre `TOKENS_BURNED` y `DELIVERED`, la obligación exigible figura en la conciliación y en el invariante; ningún reporte la omite. Ref. T43.
9. **T-300-09**: Una cancelación tras `TOKENS_BURNED` exige prueba de que el metal no fue liberado y de que el derecho anterior queda anulado; sin ambas, se rechaza. Ref. T43.
10. **T-300-10**: El alias AGK → AGKA no crea un `assetId` nuevo ni un token nuevo, y no habilita una segunda reclamación del mismo derecho. Ref. T11, T12.
11. **T-300-11**: La compra mínima y el mínimo de redención física se comprueban por separado; una posición válida por debajo del mínimo de redención no se bloquea para tenencia ni transferencia. Ref. T44.
12. **T-300-12**: `EligibleValue` con cualquier factor en `null` devuelve `BLOCKED_DECISION` y capacidad cero, no un valor con el factor omitido. Ref. T42, T50.
13. **T-300-13**: `NetRealizableValue` calculado como «onzas × spot» se rechaza por metodología: el motor exige la metodología firmada versionada. Ref. T42.
14. **T-300-14**: Dos fuentes de precio con el mismo mercado de origen se detectan como una sola fuente y no satisfacen el requisito de independencia. Ref. T40.
15. **T-300-15**: Una fuente de precio stale produce `UNKNOWN_SOURCE`; ninguna ruta inventa un fallback. Ref. T47.
16. **T-300-16**: Poner `mintableCapacity = 0` sobre la serie histórica no altera su suministro declarado ni convierte la emisión histórica en capacidad respaldada. Ref. T39.

---

## 11 · Propuestas para el contrato interno

Las cinco primeras propuestas de esta serie (`MetalLot`, `MetalLotStatus`,
`RedemptionState`, `DeliveryObligation`, `ReserveAsset`) están integradas en
`../CONTRATO-INTERNO.md` §2.10 (punto C01 del plan de corrección).

1. **`OracleQuoteKind`** (`REFERENCE_PRICE` / `EXECUTION_QUOTE` /
   `RESERVE_VALUATION` / `LIQUIDITY_AVAILABLE`) — **RECHAZADA.** Duplica
   `PriceKind` del §2.12, al que se le añadió `RESERVE_VALUATION`: dos
   enumeraciones para la misma distinción se desincronizan y entonces la
   distinción deja de proteger de nada.

