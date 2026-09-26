# SFSP-400 · Monetary

> **Enmienda SFSP-410 (propuesta, 26-sep-2026, pendiente D23 y D03):** para ORIGEN se adopta la alternativa **(b) de D03: bóveda sellada** (`SFSPNativeVault`). Todo el ORIGEN que no es de usuarios vive en la bóveda; liberar a un usuario es emitir y devolver a la bóveda es quemar. El circulante publicado es `génesis − bóveda − cuentas internas fuera de la bóveda`. No es respaldo ni cambia el suministro del génesis. Ver `spec/SFSP-410-SUPPLY-POLICY.md` §4 y ADR-015.
>
> **Nota draft-0.5:** la bóveda controla **distribución**, no emisión contra reservas, así que es compatible con el v0.3 §10.1, que descarta la capacidad de emisión contra reservas. Lo que queda histórico es el cálculo de capacidad por reservas (`RAC_units`) que la alternativa (b) de D03 llevaba consigo (§H).

| Campo | Valor |
|---|---|
| Serie | SFSP-400 · Monetary |
| Estado | `draft-0.5` (alineada con el borrador SFSP v0.3 §10) |
| Fuente de tipos | `CONTRATO-INTERNO.md` §2.3, §3, §6.1, §6.2 |
| Parte del plan maestro | P8-O (ORIGEN nativo: suministro real y distribución controlada), §2.8. Fase 0.5 (oráculo único) y fase 2 puntos 4 y 6 del plan v0.3 |
| Decisiones que la bloquean | **Acta de D01** (precio en gramín, decidido en sustancia), **acta de D02** (comisión de 0,01 USD, decidida en sustancia), parámetros de tesorería (v0.3 §18), política de estabilización, D23 (bóveda) |

**Qué NO afirma este documento:** no afirma respaldo, cobertura, paridad de mercado con el oro, estabilidad ni derecho individual de redención de ORIGEN; no afirma que la comisión de 0,01 USD se esté cobrando ni que la tesorería cotice; no convierte en vigente nada que dependa de un acta que no existe.

---

## 0 · Alineación con el borrador SFSP v0.3 (26-sep-2026)

> **Cómo leer esta sección.** El borrador SFSP v0.3 sustituye al v0.2 y es la regla (`../PLAN-SFSP-v0.3-2026-09-26.md`). Es un documento interno y **no está en el repositorio**: aquí se cita por sección (`v0.3 §n`), no se copia. Para la especificación, el v0.3 manda: la regla que lo contradiga queda sustituida o pasa al apartado histórico (§H). Para ejecutar en la 5550 sigue haciendo falta la decisión firmada: lo que dependa de una decisión `PENDIENTE` en `../DECISIONES-SFSP.json` devuelve `BLOCKED_DECISION`.

| v0.3 | Efecto en esta serie | Dónde |
|---|---|---|
| §10.1 · Supply fijo de 1.000.000.000.000 ORIGEN, **sin emisión nueva** | El suministro nativo es el del génesis. Emisión o quema de consenso distinta de cero es un **incidente**, no supply nuevo | §3 |
| §10.1 · **Referenciado, no respaldado**: sin reserva asignada ni derecho de redención | Regla de comunicación en todo material | §1, §9 |
| §10.1 · **Se descarta la capacidad de emisión contra reservas** | `RAC_units`, `EligibleReserveUSD` aplicado a ORIGEN, la regla de release contra reservas, el perímetro `U_unactivated` y las tres alternativas de D03 **dejan de ser camino vigente**. Se conservan como histórico descartado | §H |
| §10.1 · Referencia de valor: el **gramín** (1/55 de gramo de oro). D01 decidido en sustancia, falta acta | Fórmula de precio normativa; su uso en capacidades nuevas espera el acta | §4 |
| §10.2 · Unidades de liquidación autorizadas: categoría abierta; hoy **solo ORIGEN** | Categoría del registro; designar otra no exige enmendar la especificación | §5 |
| §10.3 · Comisión de **0,01 USD** por transacción, pagada **en ORIGEN**, cotizada antes de la firma y **separada del gas**. D02 decidido en sustancia, falta acta | Objetivo de `SFSPFeeController`; no se cobra hasta el acta | §6 |
| §10.3 · Gas real: tarifa base 0, precio mínimo 93 gwei | Medido; 0,001953 ORIGEN por transferencia simple, para el validador | §6 |
| §10.4 · **Tesorería cotizadora** con cinco controles | Parámetros `null` | §7 |
| §10.5 · **Oráculo único** de oro para ORIGEN y AUKA: caché 30 s, edad máxima 10 min, guion sin dato | Normativo | §8 |
| §10.1 · Política de estabilización | Pendiente: bandas, inventario, operaciones y divulgación | §4 |

---

## 1 · ORIGEN es nativo

ORIGEN es la criptomoneda **nativa** de la red (v0.3 §10.1). En el pasaporte:

| Campo | Valor |
|---|---|
| `assetKind` | `NATIVE` |
| `settlementLocation` | `{ chainId, address: null, codehash: null }` |
| `supplySource` | según lo que la lectura autorizada acredite; `UNKNOWN` mientras no exista |

Consecuencias técnicas:

1. **No se simula que `address(0)` es un ERC-20.** No hay contrato, no hay `approve`, no hay `allowance`, no hay `transferFrom`.
2. Todo diseño de liquidación sobre el nativo se resuelve sin `allowance` (ver SFSP-500, DvP con `CashVault`).
3. Un adaptador que presente el nativo con interfaz ERC-20 sería un instrumento envuelto distinto, con su propio `assetId` y su propia migración. No es ORIGEN.

**ORIGEN es referenciado y no respaldado.** No existe reserva asignada ni derecho de redención: el tenedor no tiene, por serlo, derecho a exigir una fracción de oro ni de otro activo.

---

## 2 · SFSP no acuña moneda nativa con un contrato ordinario

El suministro de una unidad nativa lo determinan el génesis y las reglas de consenso, no un contrato de aplicación. Un contrato sobre la EVM **no puede** crear ni destruir unidades nativas.

1. Un `CashVault`, un `ReleaseController` o la bóveda de SFSP-410 controlan **distribución**, no emisión nativa.
2. Cambiar génesis, consenso o política de precio no se hace **silenciosamente**: es una decisión con autoridad y con migración de derechos.

---

## 3 · Suministro fijo (v0.3 §10.1)

```
S_native(b) = S_genesis = 1.000.000.000.000 ORIGEN        para todo bloque b
```

1. **No hay emisión nueva.** Ninguna regla del protocolo crea ORIGEN.
2. La conciliación diaria (SFSP-900) **comprueba** que la cadena no emite ni quema por consenso: recompensa de bloque cero y tarifa base cero (v0.3 §10.3). No se supone; se lee a un bloque identificado.
3. Si aparece una recompensa de bloque, una quema por tarifa base o cualquier otra variación del suministro nativo, es un **descuadre** (`DESCUADRE_CONCILIACION`): detiene las distribuciones y escala. **No es supply nuevo** y no se publica como tal.
4. **Enviar unidades a una dirección supuestamente inaccesible no reduce el suministro.** No es una quema.
5. **Las transferencias entre cuentas no cambian el suministro**, ni entre usuarios ni hacia tesorería. Depositar unidades de usuarios en tesorería no las vuelve «no emitidas».
6. Comparar dos cifras de suministro o de circulante exige el **mismo bloque**.
7. **Circulante.** Según el v0.3 §4.3, el circulante son las unidades colocadas que no volvieron a tesorería. Para ORIGEN se calcula con la bóveda de SFSP-410 (`génesis − bóveda − cuentas internas fuera de la bóveda`), pendiente D23.

---

## 4 · Precio: el gramín (v0.3 §10.1, D01)

```
1 gramín            = 1/55 g de oro fino
precioORIGEN_USD    = precioOro_USD_por_gramo / 55
1 oz troy           = 31,1035 g = 1.710,69 gramín
```

1. **La referencia de valor de ORIGEN es el gramín.** La decisión está tomada en sustancia (D01) y falta formalizarla en acta. `DECISIONES-SFSP.json` mantiene D01 `PENDIENTE` hasta el acta.
2. **Una sola fuente de precio** para ORIGEN, consumida por todos los componentes: la del oráculo único de §8. Ningún componente calcula el precio de ORIGEN con otra lectura del oro ni con un valor fijo.
3. Hasta el acta, el sistema puede **mostrar** el precio en gramín (es lo que ya hace, v0.3 §10.1, estado actual), pero ninguna capacidad nueva que dependa de D01 (tesorería cotizadora, conversión en la puerta de entrada, comisión cobrada) se activa: devuelve `BLOCKED_DECISION`.
4. **Referencia no es paridad.** No se promete que el mercado negocie ORIGEN a la referencia. Al no existir redención, la estabilidad depende de política de mercado, y esa política (bandas, inventario de tesorería, operaciones de estabilización, divulgación) **está pendiente**.
5. **Liquidez operativa y valor de reservas son libros distintos.** No se suman ni se compensan.
6. El modo de precio fijo de cualquier backend o aplicación **se retira** (C4 y C5 del plan v0.3): la falta de configuración es `BLOCKED_DECISION` o un guion, nunca un valor fijo.

---

## 5 · Unidad de liquidación autorizada (v0.3 §10.2)

Las operaciones del mercado se liquidan en unidades de liquidación autorizadas. Una unidad adquiere esa condición por **designación** del órgano competente, previo cumplimiento de los requisitos aplicables. **Hoy la única designada es ORIGEN.** La categoría queda abierta: designar otra no exige enmendar la especificación, solo una acción de gobernanza registrada.

---

## 6 · Comisión y gas (v0.3 §10.3, D02)

| Concepto | Qué es | Quién lo cobra | Valor |
|---|---|---|---|
| **Comisión** | Ingreso por servicio del sistema | `SFSPFeeController` | **0,01 USD por transacción, pagada en ORIGEN** al precio vigente del oráculo (decidido en sustancia; falta acta, D02) |
| **Gas** | Remuneración del validador por procesar la transacción | La red | Tarifa base **0**, precio mínimo **93 gwei**: una transferencia simple (21.000 de gas) cuesta **0,001953 ORIGEN** |

Reglas:

1. **La comisión y el gas son conceptos distintos** y se registran por separado, también por separado del precio del activo.
2. El controlador **cotiza la comisión antes de la firma** (SFSP-500 §5) y abstrae el gas de la red.
3. El importe en ORIGEN se calcula con la **misma lectura** del oráculo que el resto de la operación. Sin lectura fresca no hay cotización: `BLOCKED_DECISION` o guion, nunca un importe fijo en ORIGEN.
4. **Estado actual** (v0.3 §10.3): el valor de 0,01 USD está configurado como precio del «gas fee», mezclando los dos conceptos. Se separa en la fase 2. No se cobra ninguna comisión nueva hasta el acta de D02.
5. Exenciones y paquetes: **pendientes**. Cuando existan serán políticas versionadas, nunca excepciones discrecionales.
6. Una fracción de las comisiones alimenta el fondo de protección desde el lanzamiento (SFSP-200 §0.4.1.d). Fracción: `null`.

---

## 7 · Tesorería cotizadora (v0.3 §10.4)

La tesorería cotiza compra y venta **de forma permanente** contra el oráculo, con diferencial publicado y fijo, para que quien tiene posiciones pequeñas acceda al precio de referencia sin depender de la profundidad del libro ni de los mínimos de redención. Es además la contraparte de último recurso de la puerta de entrada (SFSP-500 §0.4).

| # | Control | Función | Valor |
|---|---|---|---|
| 1 | Diferencial igual o más amplio que el del mercado | Quita el incentivo de arbitrar contra la tesorería | `null` |
| 2 | **Frescura del oráculo con tolerancia** | Si el precio supera una antigüedad o una variación dadas, **la tesorería deja de cotizar sola** | tolerancia `null`; nunca mayor que la edad máxima del oráculo (§8) |
| 3 | Límite por **identidad** y ventana | Impide saltárselo con varias direcciones: se aplica por Genesis ID | `null` |
| 4 | Inventario asignado y publicado | Agotado, la tesorería cierra hasta la ventana siguiente | `null` |
| 5 | Asimetría permitida | Compra y venta pueden tener diferenciales distintos | `null` |

1. La tesorería **no condiciona** su actuación a que el precio alcance un nivel: eso dejaría sin salida al tenedor pequeño.
2. La tesorería no pierde en una operación contra una referencia confiable; pierde cuando la referencia está desfasada. Por eso **deja de cotizar cuando la referencia deja de ser confiable**.
3. Con cualquiera de los cinco valores en `null`, la tesorería no cotiza: `BLOCKED_DECISION`.

---

## 8 · Oráculo único (v0.3 §10.5)

| Regla | Valor |
|---|---|
| Registro | **Uno solo** para el oro, que alimenta ORIGEN, AUKA y la liquidación de AGKA (ratio oro/plata). La plata sigue el mismo esquema |
| Fuentes | Una principal de mercado y una de respaldo. Dos APIs que comparten mercado de origen no son dos fuentes (SFSP-300 §7) |
| Caché | **30 s** |
| Edad máxima | **10 min** |
| Sin dato fresco | **Guion.** Nunca el último valor conocido, nunca un valor fijo |
| Historial | Se almacena |
| ONDK | Precio por acta de Junta, con historial y firmante |
| Demás tokens | **Sin referencia**: se declara así, no se muestra un valor |

1. Dos denominaciones del mismo subyacente alimentadas por fuentes o frecuencias distintas abren arbitraje dentro del ecosistema. Por eso ORIGEN y AUKA se valoran con **la misma lectura** en una operación.
2. La regla del guion coincide con el control 2 de la tesorería (§7).
3. **Estado medido** (C4 y C5 del plan v0.3): hay tres lecturas independientes del oro, una sin caché ni edad máxima y otra con edad máxima de 5 min; las aplicaciones llaman directo a un proveedor externo con un valor fijo de respaldo, y tienen precios fijos para AUBEX y otros tokens. Todo eso contradice esta sección y se corrige en la fase 0 (puntos 0.4 y 0.5).

---

## 9 · Redención y obligaciones

1. ORIGEN **no da, por sí solo, derecho individual de redención** de minerales. Se declara con precisión en términos y pasaporte.
2. Eso **no elimina** obligaciones contractuales de pagos, tarjetas o compraventa. Son contratos separados.
3. La liquidación de AUKA en ORIGEN (1 AUKA = 1.710,69 ORIGEN, SFSP-300 §0.4) es una obligación de la serie de commodities, no un derecho del tenedor de ORIGEN.
4. **No se anuncia respaldo ni estabilidad garantizada** de ORIGEN.

---

## 10 · Parámetros

| Parámetro | Valor | Decisión |
|---|---|---|
| `S_genesis` | 1.000.000.000.000 ORIGEN | v0.3 §10.1; lectura en cadena a bloque identificado |
| `precioOrigenModo` | `GRAMIN` | D01, decidida en sustancia; **falta acta** |
| `comisionObjetivoUSD` | 0,01 | D02, decidida en sustancia; **falta acta** |
| Gas de red | tarifa base 0; precio mínimo 93 gwei | medido (v0.3 §10.3) |
| Oráculo: caché / edad máxima | 30 s / 10 min | v0.3 §10.5 |
| Diferencial, tolerancia, límite por identidad, inventario y asimetría de la tesorería | `null` | parámetros de tesorería (v0.3 §18) |
| Política de estabilización | `null` | pendiente (v0.3 §10.1) |
| Exenciones y paquetes de comisión | `null` | pendiente (v0.3 §10.3) |
| `gasPatrocinado` | `null` | D02 |

---

## 11 · Pruebas de aceptación de la serie

1. **T08**: El suministro nativo se lee a un bloque identificado y es igual a `S_genesis`; ninguna transferencia entre cuentas lo modifica.
2. **T09**: Enviar unidades a una dirección declarada inaccesible **no** reduce el suministro en el cálculo.
3. **T-400-12**: Una liberación de la bóveda en estado `UNKNOWN` no se reintenta automáticamente; queda para reconciliación con `operationId`, nonce y txHash. Ref. T48.
4. **T-400-13**: Ninguna ruta del SDK ni de los contratos trata el activo nativo como ERC-20: no existe `approve`, `allowance` ni `transferFrom` sobre él. Ref. P3 entregable 4.
5. **T-400-14**: Ninguna documentación ni interfaz generada por este árbol afirma respaldo, cobertura o estabilidad de ORIGEN. Ref. T50.
6. **T-400-15**: El cálculo de suministro o de circulante se rechaza si las lecturas provienen de bloques distintos. Ref. T38.
7. **T-400-16**: Una recompensa de bloque o una quema por tarifa base distinta de cero se detecta y produce `DESCUADRE_CONCILIACION`; no se publica como supply nuevo. Ref. T08.
8. **T-400-17**: ORIGEN y AUKA se valoran con la **misma lectura** del oráculo (misma fuente y marca de tiempo); dos lecturas distintas en una operación se rechazan.
9. **T-400-18**: Con el oráculo fuera de tolerancia, la tesorería no cotiza y la interfaz muestra un guion.
10. **T-400-19**: El límite de la tesorería se aplica por Genesis ID: dos direcciones de la misma identidad comparten ventana.
11. **T-400-20**: Agotado el inventario publicado, la tesorería rechaza hasta la ventana siguiente.
12. **T-400-21**: Ninguna ruta aplica un precio fijo cuando falta la configuración: la falta es `BLOCKED_DECISION` o un guion.
13. **T-400-22**: La comisión se cotiza antes de la firma y se registra aparte del precio del activo y del gas.
14. **T-400-23**: Un dato del oro de más de 10 min produce guion en todas las superficies; ninguna muestra el último valor.
15. **T-400-24**: Con D01 sin acta, la tesorería cotizadora y la comisión cobrada devuelven `BLOCKED_DECISION`, y la visualización del precio en gramín sigue disponible.
16. **T-400-25**: Una transferencia simple en la red de ensayo con la configuración de la 5550 cuesta 21.000 × 93 gwei de gas, pagados al validador, y ninguna parte de ese importe se registra como comisión.
17. **T-400-26**: Ninguna ruta calcula capacidad de emisión de ORIGEN contra reservas: las funciones del apartado histórico no existen en el código vigente o devuelven error.

Las pruebas T10 y T-400-04 a T-400-11 de `draft-0.4` pertenecen al camino descartado y están en §H.6.

---

## H · Histórico descartado: capacidad de emisión contra reservas

> **DESCARTADO por el borrador SFSP v0.3 §10.1.** El modelo de capacidad de emisión contra reservas que contemplaba el borrador anterior queda descartado, por ser incompatible con el supply fijo ya declarado en materiales de adquirentes. Lo que sigue es el texto de `draft-0.4` (§3, §4 y §5), conservado para la trazabilidad. **No es camino vigente**: ninguna capacidad se calcula con estas fórmulas, `RAC_units` y `ReleaseCap` contra reservas no se implementan para ORIGEN, `I_consensus` y `B_protocol` solo sobreviven como la comprobación de §3 (deben ser cero), y las tres alternativas de D03 dejan de ser alternativas para ORIGEN (la bóveda de SFSP-410 controla distribución, no emisión). Si en el futuro se designa otra unidad de liquidación que sí declare reservas (§5), este apartado es el punto de partida y se reabre con su propia decisión.

### H.3 · Fórmulas normativas (§6.1)

Todas las cantidades son enteros en unidades base.

```
S_native(b) = S_genesis + I_consensus(0..b) - B_protocol(0..b)

R_released  = S_native - U_unactivated

RAC_units   = floor(EligibleReserveUSD / ReferenceUSDperUnit * 10^decimals)

release(x) exige  R_released + x <= min(ReleaseCap, RAC_units)
```

#### H.3.1 · `S_native(b)`

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

#### H.3.2 · `R_released` y `U_unactivated`

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

#### H.3.3 · `RAC_units`

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

#### H.3.4 · Regla de release

```
release(x) exige  R_released + x <= min(ReleaseCap, RAC_units)
```

1. `ReleaseCap` es un **límite de distribución**, no una capacidad de crear nativo. Valor `null`, pendiente D03.
2. La comprobación usa el **mínimo** de los dos límites. Superar cualquiera bloquea.
3. Estas fórmulas **sólo se aplican tras fijar D01/D03**, el perímetro y las unidades.
4. Si la política exige respaldo de `S_native` completo, se evalúa **esa** cobertura, en lugar de ocultar inventario reclasificándolo.
5. Las cuentas fuera del control del vault y las emisiones de consenso **impiden prometer un límite universal** si no están cubiertas.

#### H.3.5 · Ampliar un techo administrativo no aumenta el saldo técnico

Subir `ReleaseCap` es un acto administrativo. **No crea unidades, no aumenta `S_native`, no aumenta el saldo disponible en ninguna cuenta y no mejora la cobertura.** Lo único que hace es permitir distribuir más de lo que ya existe, si además `RAC_units` lo permite.

Recíprocamente, bajar `ReleaseCap` no destruye unidades ya distribuidas.

---

### H.4 · Las tres alternativas de D03

**SFSP-400 no elige ninguna.** Las describe con sus condiciones y sus límites de comunicación.

#### H.4 (a) · Cobertura total del suministro nativo

Demostrar cobertura del suministro nativo al que se promete respaldo, **incluido el inventario ya emitido**.

| Aspecto | Contenido |
|---|---|
| Qué exige | Acreditar reservas elegibles suficientes para `S_native` completo, no sólo para el stock liberado |
| Qué permite afirmar | Respaldo del suministro cubierto, con su alcance y su fecha |
| Riesgo | Las emisiones de consenso futuras y las cuentas fuera de control del vault amplían el numerador continuamente |
| Dependencias | D01, D03, D04, evidencia de reservas vigente |

#### H.4 (b) · Control de distribución por vault

Controlar la distribución adicional desde un vault, **informando expresamente que ese control no equivale a emisión nativa condicionada desde el génesis**.

| Aspecto | Contenido |
|---|---|
| Qué exige | `CashVault` con validación por salida, perímetro `U_unactivated` definido, conciliación |
| Qué permite afirmar | Que la **distribución adicional** está sujeta a una regla de capacidad |
| Qué NO permite afirmar | Respaldo del suministro nativo. No se anuncia (b) como si fuera (a) |
| Dependencias | D03, D04 para `RAC_units` distinto de cero |

#### H.4 (c) · Instrumento nuevo o cambio de cliente

Diseñar, en otro proyecto, un instrumento monetario nuevo o una modificación del cliente de la cadena, con migración y derechos aprobados.

| Aspecto | Contenido |
|---|---|
| Qué exige | Proyecto separado, migración de derechos (SFSP-700), aprobación jurídica |
| Estado | **No se ejecuta con este plan** |
| Dependencias | D03, D08, D09, D10 |

#### H.4 · Nota de la decisión

La recomendación registrada en el plan para avanzar sin cambios irreversibles es desarrollar **(b) en prueba, sin anunciarla como (a)**. Esa es una recomendación, **no una decisión**. Mientras D03 esté `PENDIENTE`, toda capacidad de release devuelve `BLOCKED_DECISION`.

---

### H.5 · `CashVault` y release

`CashVault` valida en **cada salida**:

1. Autorización vigente (`SignedAuthorization`, SFSP-800).
2. Reserva vigente y no asignada a otra obligación.
3. Capacidad disponible según §3.4.

Alcance de la validación: **todas** las salidas, incluidas transferencias a Markets o AuCorp, gas y subsidios, y retiros administrativos. No hay una ruta administrativa exenta.

Emite `TreasuryReleased`.

#### H.5.1 · Máquina de estado del release

```
[ SOLICITADO ] --autorización vigente--> [ VALIDADO ] --capacidad disponible--> [ EJECUTADO ]
      |                                       |                                     |
      | autorización vencida/consumida        | capacidad insuficiente              +--> [ UNKNOWN ]
      v                                       v
[ RECHAZADO ]                           [ BLOQUEADO ]
```

`UNKNOWN` es un estado real: se reconcilia antes de continuar y no se reintenta liberando otra vez.

#### H.5.2 · Déficit de cobertura

Un déficit de cobertura **bloquea nuevas distribuciones afectadas** y activa un plan de normalización.

**No reduce balances de clientes para cuadrar cifras.** Nunca.

#### H.5.3 · Upgrades del vault

Auditoría de módulos, guards y upgrades. Un cambio que permita eludir el control requiere un **proceso excepcional visible**, con timelock y registro (SFSP-800).

### H.6 · Pruebas del camino descartado (no se ejecutan)

1. **T10**: Depositar unidades de usuarios en tesorería **no** las mueve a `U_unactivated`; siguen en `R_released`.
2. **T-400-04**: `RAC_units` usa `floor` explícito y los decimales comprobados; nunca asume 18. Ref. T21.
3. **T-400-05**: Con `EligibleReserveUSD` o `ReferenceUSDperUnit` en `null`, `RAC_units` devuelve `BLOCKED_DECISION` y la capacidad efectiva es cero. Ref. T42, T50.
4. **T-400-06**: `release(x)` se rechaza si supera `ReleaseCap` **o** `RAC_units`; la comprobación usa el mínimo de ambos. Ref. T42.
5. **T-400-07**: Ampliar `ReleaseCap` no modifica `S_native`, `R_released`, ningún saldo ni la cobertura calculada. Ref. T42.
6. **T-400-08**: Una reserva vencida (`ReserveExpired`) reduce `RAC_units` y bloquea el siguiente release. Ref. T40, T41.
7. **T-400-09**: Una reserva ya asignada a un activo de commodity no computa en `EligibleReserveUSD` del nativo. Ref. T39.
8. **T-400-10**: Toda salida del `CashVault`, incluidas las administrativas y las de subsidio de gas, pasa por la validación de autorización, reserva y capacidad. Ref. T42, T36.
9. **T-400-11**: Un déficit de cobertura bloquea distribuciones nuevas y **no** modifica ningún balance de cliente. Ref. T42.

---

## 12 · Propuestas para el contrato interno

Integradas en `../CONTRATO-INTERNO.md` (punto C01 del plan de corrección). Esta
sección ya no propone nada: lo que este documento necesitaba está en el contrato
interno, que vuelve a ser la fuente única.

