# SFSP-400 · Monetary

> **Enmienda SFSP-410 (propuesta, 26-sep-2026, pendiente D23 y D03):** para ORIGEN se adopta la alternativa **(b) de D03: bóveda sellada** (`SFSPNativeVault`). Todo el ORIGEN que no es de usuarios vive en la bóveda; liberar a un usuario es emitir y devolver a la bóveda es quemar. El circulante publicado es `génesis − bóveda − cuentas internas fuera de la bóveda`. No es respaldo ni cambia el suministro del génesis. Ver `spec/SFSP-410-SUPPLY-POLICY.md` §4 y ADR-015.

| Campo | Valor |
|---|---|
| Serie | SFSP-400 · Monetary |
| Estado | `draft-0.4` (alineada con el borrador SFSP v0.2) |
| Fuente de tipos | `CONTRATO-INTERNO.md` §2.3, §3, §6.1, §6.2 |
| Parte del plan maestro | P8-O (ORIGEN nativo: suministro real y distribución controlada), P8-R, §2.8 |
| Decisiones que la bloquean | **D03 (respaldo total frente a release controlado)**, D01 (política vigente de precio y sus consumidores), D04 (reservas elegibles y metodología), D02 (alcance del objetivo de fee y patrocinio de gas) |

**Qué NO afirma este documento:** no afirma respaldo, cobertura, paridad con ningún metal, estabilidad ni derecho individual de redención; no elige ninguna de las tres alternativas de D03; no declara cuál es la configuración de precio efectivamente vigente.

---

## 0 · Alineación con el borrador SFSP v0.2 (23-sep-2026)

> **Cómo leer esta sección.** El borrador SFSP v0.2 (`../fuente/`) es un borrador de trabajo: lo que sigue es **su posición**, llevada a esta serie. Hasta que la Junta lo firme, las decisiones afectadas siguen `PENDIENTE` en `../DECISIONES-SFSP.json` y todo lo que dependa de ellas devuelve `BLOCKED_DECISION`. Donde el v0.2 **cambia** una regla de más abajo, se dice aquí y la regla de abajo queda sustituida en cuanto se firme. La trazabilidad completa está en `../TRAZABILIDAD-SFSP-v0.2.md`.

### 0.1 Qué fija el v0.2

| v0.2 | Efecto en esta serie |
|---|---|
| §10.1 · ORIGEN: **supply fijo de 1.000.000.000.000 unidades, sin emisión nueva** | `S_genesis` = 10¹² ORIGEN; `I_consensus` y `B_protocol` **se espera que sean cero y se comprueba** (T-400-16 sigue vigente). La cifra cuadra en la cadena (respuesta a la solicitud de información, bloque 7) |
| §10.1 · **Referenciado, no respaldado**: sin reserva asignada ni derecho de redención | Ya lo recoge §6. Se vuelve regla de comunicación en todo material |
| §10.1 · **Se descarta la capacidad de emisión contra reservas** | **Cierra D03 si la Junta firma**: ninguna de las alternativas (a), (b) o (c) de §4 se adopta para ORIGEN. `RAC_units` y la regla de release de §3.3 y §3.4 **dejan de aplicarse a ORIGEN**. Se conservan solo para una futura unidad de liquidación que sí declare reservas |
| §10.1 · Gramín = 1/55 de gramo de oro; es la referencia de valor | Referencia, no paridad ni promesa (§7). 1 oz troy = 1.710,6925 gramín |
| §10.2 · Unidades de liquidación autorizadas: categoría abierta; hoy **solo ORIGEN** | Nueva categoría del registro; designar otra unidad no exige enmendar la especificación |
| §10.3 · Comisión objetivo **USD 0,01 por transacción, pagada en ORIGEN** al precio del oráculo, cotizada antes de la firma y separada del gas | Es el objetivo de `SFSPFeeController`. No está vigente: el código de producción cobra 0,001 ORIGEN y lo tiene apagado, y el gas cuesta 0,001953 ORIGEN por transferencia simple (93 gwei). Falta el acta (D02) |
| §10.4 · **Tesorería que cotiza** compra y venta contra el oráculo, con cinco controles | Ver §0.2 |
| §10.5 · **Oráculo único** de oro para ORIGEN y AUKA | Ver §0.3 |
| §10.1 · Política de estabilización | Pendiente: bandas, inventario, operaciones y divulgación |

### 0.2 Tesorería cotizadora

La tesorería cotiza de forma permanente contra el oráculo, con diferencial publicado y fijo, para que quien tiene posiciones pequeñas acceda al precio de referencia sin depender del libro de órdenes.

| Control | Función |
|---|---|
| Diferencial igual o más amplio que el del mercado | Quita el incentivo de arbitrar contra la tesorería |
| **Frescura del oráculo con tolerancia** | Si el precio es más viejo o se movió más de lo permitido, **la tesorería deja de cotizar sola** |
| Límite por **identidad** y ventana | Impide saltárselo con varias direcciones |
| Inventario asignado y publicado | Agotado, cierra hasta la ventana siguiente |
| Asimetría permitida | Compra y venta pueden tener diferenciales distintos |

La tesorería **no condiciona** su actuación a que el precio alcance un nivel. Deja de cotizar cuando la referencia deja de ser confiable, no cuando el precio no le gusta.

Diferencial, tolerancia de frescura, límites por identidad e inventario: `null`.

### 0.3 Oráculo único

1. **Un solo registro** de precio del oro alimenta ORIGEN, AUKA y la liquidación de AGKA (ratio oro/plata). Dos fuentes o frecuencias distintas para el mismo subyacente abren arbitraje dentro del ecosistema.
2. Sin dato fresco, la interfaz muestra un **guion**, nunca el último valor (es lo que ya hace el servicio actual de precio del oro).
3. **El modo de precio fijo del backend de la billetera no consume este oráculo y se retira.** Hoy es el modo por defecto: si falta la variable de modo, el backend usa 0,01 USD en conversiones de dinero. Esto es una condición crítica de arranque (v0.2 §16).
4. ONDK: precio por acta de Junta, con historial y firmante. Los tokens sin precio se muestran **sin referencia**.

### 0.4 Pruebas de aceptación nuevas

1. **T-400-17**: ORIGEN y AUKA se valoran con la **misma lectura** del oráculo (misma fuente y marca de tiempo); dos lecturas distintas en una operación se rechazan.
2. **T-400-18**: Con el oráculo fuera de tolerancia, la tesorería no cotiza y la interfaz muestra un guion.
3. **T-400-19**: El límite de la tesorería se aplica por Genesis ID: dos direcciones de la misma identidad comparten ventana.
4. **T-400-20**: Agotado el inventario publicado, la tesorería rechaza hasta la ventana siguiente.
5. **T-400-21**: Ninguna ruta aplica un precio fijo cuando falta la configuración: la falta es `BLOCKED_DECISION` o un guion, **nunca 0,01**.
6. **T-400-22**: La comisión se cotiza antes de la firma y se registra aparte del precio del activo y del gas.

---

## 1 · ORIGEN es nativo

ORIGEN es la unidad **nativa** de la red. En el pasaporte:

| Campo | Valor |
|---|---|
| `assetKind` | `NATIVE` |
| `settlementLocation` | `{ chainId, address: null, codehash: null }` |
| `supplySource` | según lo que la lectura autorizada acredite; `UNKNOWN` mientras no exista |

Consecuencias técnicas:

1. **No se simula que `address(0)` es un ERC-20.** No hay contrato, no hay `approve`, no hay `allowance`, no hay `transferFrom`.
2. Todo diseño de liquidación sobre el nativo se resuelve sin `allowance` (ver SFSP-500, DvP con `CashVault`).
3. Un adaptador que presente el nativo con interfaz ERC-20 sería un instrumento envuelto distinto, con su propio `assetId` y su propia migración. No es ORIGEN.

---

## 2 · SFSP no acuña moneda nativa con un contrato ordinario

**Esta es la afirmación central de la serie.**

El suministro de una unidad nativa lo determinan el génesis y las reglas de consenso de la cadena, no un contrato de aplicación. Un contrato desplegado sobre la EVM **no puede** crear ni destruir unidades nativas, y por lo tanto **no puede** aplicar una regla de mint-backing sobre el suministro nativo ya existente.

Consecuencias:

1. Conservar ORIGEN como nativo **no permite afirmar** que un contrato aplica mint-backing a todo su suministro ya creado.
2. Un `CashVault` o un `ReleaseController` controlan **distribución**, no emisión nativa.
3. Cambiar génesis, consenso o política de precio para resolver esto no se hace **silenciosamente**: es una decisión con autoridad y con migración de derechos.
4. La política exacta debe decidirse **antes** de comunicarla. D03 es bloqueante para toda afirmación monetaria y para todo release de tesorería.

---

## 3 · Fórmulas normativas (§6.1)

Todas las cantidades son enteros en unidades base.

```
S_native(b) = S_genesis + I_consensus(0..b) - B_protocol(0..b)

R_released  = S_native - U_unactivated

RAC_units   = floor(EligibleReserveUSD / ReferenceUSDperUnit * 10^decimals)

release(x) exige  R_released + x <= min(ReleaseCap, RAC_units)
```

### 3.1 `S_native(b)`

| Término | Definición |
|---|---|
| `S_genesis` | Suministro asignado en el bloque génesis. |
| `I_consensus(0..b)` | **Todas** las emisiones permitidas por las reglas efectivas y sus transiciones, hasta el bloque `b`. |
| `B_protocol(0..b)` | **Sólo** las quemas reconocidas por las reglas de la cadena. |

Reglas:

1. **Enviar unidades a una dirección supuestamente inaccesible NO reduce `S_native`.** No es una quema.
2. **Las transferencias entre cuentas no cambian `S_native`.** Ni entre usuarios, ni hacia tesorería.
3. **Depositar unidades de usuarios en tesorería no las vuelve «no emitidas».**
4. Se concilia también el destino del gas y cualquier recompensa. **No se supone `blockreward = 0`**: se comprueba.
5. `S_native` se evalúa a un bloque `b` identificado. Comparar dos cifras exige el mismo bloque.

### 3.2 `R_released` y `U_unactivated`

`U_unactivated` es el **inventario efectivamente inmovilizado** que todavía no adquirió estado de respaldo activado según la política.

**Perímetro de `U_unactivated`:**

| Dentro | Fuera |
|---|---|
| Unidades bajo control demostrable del vault, inmovilizadas, sin estado de respaldo activado | Unidades en cualquier otra cuenta de la empresa |
| n/a | Unidades en cuentas de usuarios |
| n/a | Unidades en tesorería operativa que ya salieron del vault |
| n/a | Unidades en Markets, AuCorp o cualquier cuenta de producto |
| n/a | Unidades enviadas a una dirección supuestamente inaccesible |

**Toda unidad fuera de ese perímetro se incluye en el stock liberado sujeto a la política, aun si está en otra cuenta de la empresa.**

`R_released = S_native - U_unactivated`. Por construcción, el perímetro estrecho de `U_unactivated` hace que `R_released` sea grande. Eso es intencional: el stock liberado no se reduce por conveniencia contable.

### 3.3 `RAC_units`

```
RAC_units = floor(EligibleReserveUSD / ReferenceUSDperUnit * 10^decimals)
```

| Término | Origen | Estado |
|---|---|---|
| `EligibleReserveUSD` | Suma de `EligibleValue_i` del §6.2 sobre las reservas no asignadas a otra obligación | `null` hasta D04 |
| `ReferenceUSDperUnit` | Precio de referencia por unidad según la política vigente | `null` hasta D01 |
| `decimals` | Decimales de la unidad nativa | se comprueba, nunca se asume 18 |

`floor` explícito: el redondeo está especificado y es hacia abajo. El resto no se acumula como capacidad.

Si `EligibleReserveUSD` o `ReferenceUSDperUnit` son `null`, `RAC_units` es `BLOCKED_DECISION` y **la capacidad efectiva es cero**, no infinita.

### 3.4 Regla de release

```
release(x) exige  R_released + x <= min(ReleaseCap, RAC_units)
```

1. `ReleaseCap` es un **límite de distribución**, no una capacidad de crear nativo. Valor `null`, pendiente D03.
2. La comprobación usa el **mínimo** de los dos límites. Superar cualquiera bloquea.
3. Estas fórmulas **sólo se aplican tras fijar D01/D03**, el perímetro y las unidades.
4. Si la política exige respaldo de `S_native` completo, se evalúa **esa** cobertura, en lugar de ocultar inventario reclasificándolo.
5. Las cuentas fuera del control del vault y las emisiones de consenso **impiden prometer un límite universal** si no están cubiertas.

### 3.5 Ampliar un techo administrativo no aumenta el saldo técnico

Subir `ReleaseCap` es un acto administrativo. **No crea unidades, no aumenta `S_native`, no aumenta el saldo disponible en ninguna cuenta y no mejora la cobertura.** Lo único que hace es permitir distribuir más de lo que ya existe, si además `RAC_units` lo permite.

Recíprocamente, bajar `ReleaseCap` no destruye unidades ya distribuidas.

---

## 4 · Las tres alternativas de D03

**SFSP-400 no elige ninguna.** Las describe con sus condiciones y sus límites de comunicación.

### (a) Cobertura total del suministro nativo

Demostrar cobertura del suministro nativo al que se promete respaldo, **incluido el inventario ya emitido**.

| Aspecto | Contenido |
|---|---|
| Qué exige | Acreditar reservas elegibles suficientes para `S_native` completo, no sólo para el stock liberado |
| Qué permite afirmar | Respaldo del suministro cubierto, con su alcance y su fecha |
| Riesgo | Las emisiones de consenso futuras y las cuentas fuera de control del vault amplían el numerador continuamente |
| Dependencias | D01, D03, D04, evidencia de reservas vigente |

### (b) Control de distribución por vault

Controlar la distribución adicional desde un vault, **informando expresamente que ese control no equivale a emisión nativa condicionada desde el génesis**.

| Aspecto | Contenido |
|---|---|
| Qué exige | `CashVault` con validación por salida, perímetro `U_unactivated` definido, conciliación |
| Qué permite afirmar | Que la **distribución adicional** está sujeta a una regla de capacidad |
| Qué NO permite afirmar | Respaldo del suministro nativo. No se anuncia (b) como si fuera (a) |
| Dependencias | D03, D04 para `RAC_units` distinto de cero |

### (c) Instrumento nuevo o cambio de cliente

Diseñar, en otro proyecto, un instrumento monetario nuevo o una modificación del cliente de la cadena, con migración y derechos aprobados.

| Aspecto | Contenido |
|---|---|
| Qué exige | Proyecto separado, migración de derechos (SFSP-700), aprobación jurídica |
| Estado | **No se ejecuta con este plan** |
| Dependencias | D03, D08, D09, D10 |

### Nota de la decisión

La recomendación registrada en el plan para avanzar sin cambios irreversibles es desarrollar **(b) en prueba, sin anunciarla como (a)**. Esa es una recomendación, **no una decisión**. Mientras D03 esté `PENDIENTE`, toda capacidad de release devuelve `BLOCKED_DECISION`.

---

## 5 · `CashVault` y release

`CashVault` valida en **cada salida**:

1. Autorización vigente (`SignedAuthorization`, SFSP-800).
2. Reserva vigente y no asignada a otra obligación.
3. Capacidad disponible según §3.4.

Alcance de la validación: **todas** las salidas, incluidas transferencias a Markets o AuCorp, gas y subsidios, y retiros administrativos. No hay una ruta administrativa exenta.

Emite `TreasuryReleased`.

### 5.1 Máquina de estado del release

```
[ SOLICITADO ] --autorización vigente--> [ VALIDADO ] --capacidad disponible--> [ EJECUTADO ]
      |                                       |                                     |
      | autorización vencida/consumida        | capacidad insuficiente              +--> [ UNKNOWN ]
      v                                       v
[ RECHAZADO ]                           [ BLOQUEADO ]
```

`UNKNOWN` es un estado real: se reconcilia antes de continuar y no se reintenta liberando otra vez.

### 5.2 Déficit de cobertura

Un déficit de cobertura **bloquea nuevas distribuciones afectadas** y activa un plan de normalización.

**No reduce balances de clientes para cuadrar cifras.** Nunca.

### 5.3 Upgrades del vault

Auditoría de módulos, guards y upgrades. Un cambio que permita eludir el control requiere un **proceso excepcional visible**, con timelock y registro (SFSP-800).

---

## 6 · Redención y obligaciones

1. ORIGEN conserva el requisito de **no dar, por sí solo, derecho individual de redención de minerales**. Se declara con precisión en términos y pasaporte.
2. Eso **no elimina** obligaciones contractuales de pagos, tarjetas o compraventa. Son contratos separados.
3. Las operaciones de compra de AUKA son contratos separados (SFSP-300).
4. **Sin reservas y liquidez comprobadas no se anuncia respaldo ni estabilidad garantizada.**

---

## 7 · Precio

1. El objetivo de producto de ORIGEN referenciado al oro se conserva como **objetivo**.
2. Ese objetivo **no se confunde** con la configuración operativa vigente, que debe comprobarse y reconciliarse.
3. El modo fijo encontrado en el código **no sustituye automáticamente** la visión aprobada, y la visión aprobada tampoco sustituye lo que el código hace hoy. Son dos hechos distintos y se reportan por separado.
4. **No se promete paridad de mercado con el oro** por tener una fórmula de referencia.
5. **Liquidez operativa y valor de reservas son libros distintos.** No se suman ni se compensan.
6. `precioOrigenModo` y `precioOrigenReferencia` son `null`, pendientes D01. Ninguna ruta los sustituye por el valor encontrado en código.

---

## 8 · Parámetros pendientes

| Parámetro | Valor | Decisión |
|---|---|---|
| `precioOrigenModo` | `null` | D01 |
| `precioOrigenReferencia` | `null` | D01 |
| `releaseCap` | `null` | D03 |
| Alternativa elegida de D03 | `null` | D03 |
| Perímetro operativo de `U_unactivated` | `null` | D03 |
| `EligibleReserveUSD` y sus factores | `null` | D04 |
| `gasPatrocinado` | `null` | D02 |
| `S_genesis`, `I_consensus`, `B_protocol` efectivos | `null` | lectura autorizada pendiente |

---

## 9 · Pruebas de aceptación de la serie

1. **T08**: `S_native(b)` se calcula sólo con `S_genesis`, `I_consensus` y `B_protocol`; ninguna transferencia entre cuentas lo modifica.
2. **T09**: Enviar unidades a una dirección declarada inaccesible **no** reduce `S_native` en el cálculo.
3. **T10**: Depositar unidades de usuarios en tesorería **no** las mueve a `U_unactivated`; siguen en `R_released`.
4. **T-400-04**: `RAC_units` usa `floor` explícito y los decimales comprobados; nunca asume 18. Ref. T21.
5. **T-400-05**: Con `EligibleReserveUSD` o `ReferenceUSDperUnit` en `null`, `RAC_units` devuelve `BLOCKED_DECISION` y la capacidad efectiva es cero. Ref. T42, T50.
6. **T-400-06**: `release(x)` se rechaza si supera `ReleaseCap` **o** `RAC_units`; la comprobación usa el mínimo de ambos. Ref. T42.
7. **T-400-07**: Ampliar `ReleaseCap` no modifica `S_native`, `R_released`, ningún saldo ni la cobertura calculada. Ref. T42.
8. **T-400-08**: Una reserva vencida (`ReserveExpired`) reduce `RAC_units` y bloquea el siguiente release. Ref. T40, T41.
9. **T-400-09**: Una reserva ya asignada a un activo de commodity no computa en `EligibleReserveUSD` del nativo. Ref. T39.
10. **T-400-10**: Toda salida del `CashVault`, incluidas las administrativas y las de subsidio de gas, pasa por la validación de autorización, reserva y capacidad. Ref. T42, T36.
11. **T-400-11**: Un déficit de cobertura bloquea distribuciones nuevas y **no** modifica ningún balance de cliente. Ref. T42.
12. **T-400-12**: Un release en estado `UNKNOWN` no se reintenta automáticamente; queda para reconciliación con `operationId`, nonce y txHash. Ref. T48.
13. **T-400-13**: Ninguna ruta del SDK ni de los contratos trata el activo nativo como ERC-20: no existe `approve`, `allowance` ni `transferFrom` sobre él. Ref. P3 entregable 4.
14. **T-400-14**: Ninguna documentación ni interfaz generada por este árbol afirma respaldo, cobertura o estabilidad mientras D03 y D04 estén pendientes. Ref. T50.
15. **T-400-15**: El cálculo de `S_native` se rechaza si las lecturas provienen de bloques distintos; exige un bloque común identificado. Ref. T38.
16. **T-400-16**: Una recompensa de bloque distinta de cero se detecta y se incluye en `I_consensus`; el cálculo no asume `blockreward = 0`. Ref. T08.

---

## 10 · Propuestas para el contrato interno

Integradas en `../CONTRATO-INTERNO.md` (punto C01 del plan de corrección). Esta
sección ya no propone nada: lo que este documento necesitaba está en el contrato
interno, que vuelve a ser la fuente única.

