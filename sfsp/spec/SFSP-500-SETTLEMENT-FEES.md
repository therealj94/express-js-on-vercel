# SFSP-500 · Settlement & Fees

| Campo | Valor |
|---|---|
| Serie | SFSP-500 · Settlement & Fees |
| Estado | `draft-0.3` |
| Fuente de tipos | `CONTRATO-INTERNO.md` §2.4, §3, §4, §5 |
| Parte del plan maestro | P4 (DvP nativo, CashVault), P7b (Orden Markets), P6 pasos 5–7, §2.8 |
| Decisiones que la bloquean | D02 (alcance del objetivo de fee, mínimos y patrocinio de gas), D01 (política de precio), D15 (proveedor de pagos y liquidez), D03 (release de tesorería al vault) |

**Qué NO afirma este documento:** no afirma que exista un fee vigente, un carril patrocinado activo, un proveedor de pagos contratado ni liquidación DvP probada en ninguna red; no afirma que un relayer genérico pague la transacción de ningún usuario.

---

## 1 · DvP

**Delivery versus Payment** se anuncia **sólo para patas atómicas on-chain probadas**. Cualquier otra combinación usa compensaciones y límites, y se nombra de otra manera.

| Escenario | ¿Es DvP? |
|---|---|
| Activo y efectivo en la misma cadena, en una sola transacción atómica, probada | Sí |
| Activo on-chain y pago fiat por un tercero | No. Es compensación con límites. |
| Activo on-chain y pago multired | No. Es compensación con límites. |
| Activo en registro custodial y efectivo on-chain | No. Es compensación con límites. |

### 1.1 Diseño mínimo: `CashVault` prefinanciado

La opción mínima propuesta es un `CashVault` prefinanciado con la unidad nativa y **asignación de saldo interno por beneficiario**.

1. Sólo el contrato de liquidación autorizado consume las reservas de una orden, transfiere el activo y reasigna el efectivo, **de forma atómica en esa cadena**.
2. **El nativo no tiene `approve`.** Por eso el efectivo se prefinancia en el vault en lugar de depender de una `allowance`.
3. El vault concilia el activo on-chain contra los pasivos de cuentas. **El OMS no inventa balances.**
4. Una opción alternativa es una transacción `payable` enviada por el comprador. Si se usa, debe especificarse **qué actor la envía y con qué gas**.

---

## 2 · Estados de orden

```
[ RECEIVED ] --validación fallida--> [ REJECTED ]
     |
     v
  [ OPEN ] --ejecución parcial--> [ PARTIALLY_FILLED ] --> [ FILLED ]
     |  \                                |
     |   \--solicitud de cancelación--> [ CANCEL_PENDING ] --> [ CANCELLED ]
     |
     +--vencimiento--> [ EXPIRED ]
```

| Estado | Significado |
|---|---|
| `RECEIVED` | Recibida por el OMS, aún no validada. |
| `REJECTED` | Rechazada en validación, con `reasonCode`. |
| `OPEN` | Vigente en el libro. |
| `PARTIALLY_FILLED` | Ejecutada en parte; el resto sigue vigente. |
| `FILLED` | Completamente ejecutada. |
| `CANCEL_PENDING` | Cancelación solicitada, aún no efectiva. |
| `CANCELLED` | Cancelada. |
| `EXPIRED` | Vencida por su propia vigencia. |

El OMS y el matching son **deterministas y fuera de cadena**, con secuencia, reloj, prioridades y bitácora. Mantienen un ledger de fondos y activos reservados, órdenes límite, expiración, ejecución parcial, cancelación concurrente y límites de exposición.

---

## 3 · Estados de ejecución

Cada ejecución (fill) tiene su propia máquina, distinta de la de la orden.

```
[ SETTLEMENT_PENDING ] --> [ SUBMITTED ] --> [ CONFIRMED ]
                                 |
                                 +--> [ FAILED_FINAL ]
                                 |
                                 +--> [ UNKNOWN ]
```

| Estado | Significado |
|---|---|
| `SETTLEMENT_PENDING` | Ejecución acordada, liquidación no iniciada. |
| `SUBMITTED` | Transacción enviada. |
| `CONFIRMED` | Liquidación confirmada en cadena. Emite `TradeSettled`. |
| `FAILED_FINAL` | Fallo definitivo y comprobado. |
| `UNKNOWN` | **Estado real.** Ver §3.1. |

Reglas:

1. **No se cancela una ejecución ya confirmada.**
2. `FAILED_FINAL` y `UNKNOWN` son distintos y no se colapsan.
3. Cancelar una orden no cancela sus ejecuciones ya confirmadas.

### 3.1 `UNKNOWN` es un estado real

`UNKNOWN` no es un error de la interfaz ni un estado transitorio que se resuelva reintentando.

1. Un estado incierto **no se reintenta pagando otra vez**. Se registra la operación, el nonce, el `txHash` o el identificador del proveedor, y se **reconcilia antes de continuar**.
2. **Recibir un `txHash` no significa éxito.** La confirmación se relee de la fuente.
3. Un fallo de lectura del nodo es `UNKNOWN_SOURCE`, nunca cero y nunca `FAILED_FINAL`.
4. Las operaciones multiusuario pueden quedar **parcialmente ejecutadas**. El sistema las reanuda **sin duplicar ni ocultar lo ya confirmado**: se reanuda desde las confirmaciones, no desde el comienzo.
5. Una diferencia o una transacción incierta **detiene** el lote. No se continúa «para no dejarlo a medias».

### 3.2 Validación en el `SettlementEngine`

El motor verifica **en el momento de liquidar**: fondos, nonce, elegibilidad y precio. Ver SFSP-120 §4.

---

## 4 · Journal y outbox

1. **Operation journal / outbox durable**, por usuario y por operación.
2. `operationId` = `op_` + 32 hex, unidad de idempotencia de toda escritura sensible.
3. Exclusión por nonce y por firmante.
4. Relectura de recibo obligatoria antes de dar por cerrada una operación.
5. Control de reintentos con límite y con backoff; un reintento nunca produce una segunda ejecución del mismo `operationId`.
6. Registro de: estado, bloque, prueba, nonce y `txHash` o identificador del proveedor.

---

## 5 · Cotización versionada de fee

Toda cotización de tasa o comisión es una estructura **versionada y firmada**, con:

| Campo | Regla |
|---|---|
| `schemaVersion` | Obligatorio. |
| Importe | Entero en unidades base, como cadena. |
| Moneda | Explícita. |
| Gas patrocinado o no | Booleano explícito, no implícito. |
| Coste de terceros | Desglosado. |
| Monto mínimo | Explícito; `null` hasta D02. |
| Redondeo | Especificado por operación. |
| Slippage | Explícito cuando aplique. |
| Destinatario | Explícito. |
| **TTL / expiración** | Obligatorio. |
| Política de fallos | Qué ocurre si la liquidación falla tras aceptar. |

Reglas:

1. **No se recalcula el valor después de aceptar sin renovación del consentimiento.** Si la cotización expiró, se vuelve a cotizar y se vuelve a aceptar.
2. Una cotización expirada no liquida. Ni con el precio viejo, ni con el nuevo.
3. `D01` y `D02` gobiernan precio y fee. No se reutiliza una función que pueda estar en modo fijo sin comprobar su configuración efectiva.
4. El objetivo comercial de USD 0.01 por operación SFSP se conserva como **objetivo**. D02 define si es **total para el usuario en el carril patrocinado** o **sólo comisión del servicio**.
5. **No se afirma** que ese objetivo incluya spreads, conversiones, redención física, tarjeta ni ninguna transacción externa.

---

## 6 · Patrocinio de gas por tipo de cuenta

El patrocinio se elige **por tipo de cuenta y por activo**. No hay un patrocinio universal.

| Tipo de cuenta | Requisito de gas | Nota |
|---|---|---|
| EOA legacy (`PERSONAL`, dirección propia) | **Necesita gas en la cuenta, o un subsidio previamente aprobado** | La transacción la firma y la envía la EOA. Nadie puede pagar su gas por ella salvo un mecanismo explícito aprobado. |
| EOA bajo custodia (`MANAGED`) | El custodio provee gas según política | El coste se registra y se imputa. |
| Cuenta institucional (HSM/MPC/multisig) | Según la política de la institución | Puede requerir varias firmas y su propio presupuesto de gas. |
| Smart account | Exige **aceptación y migración propia** | No se asume que una cuenta existente sea una smart account. |

Reglas:

1. **`transferFrom` exige `allowance`.** Sin `allowance` previa, la ruta no existe, por mucho que haya patrocinio de gas.
2. El activo **nativo no tiene `approve`**: no hay `allowance` posible sobre él.
3. **El coste y el origen del gas se muestran** al usuario. No se oculta quién paga.
4. **No se afirma que un relayer genérico paga la transacción del usuario.** Un relayer patrocina sólo las rutas para las que existe un mecanismo aprobado y probado.
5. El presupuesto de patrocinio de gas se fija **tras medir**, no por montos históricos. Valor `null`, pendiente D02.

---

## 7 · Éxito del pago frente a cobro de comisión

Son dos hechos distintos y se registran por separado.

| Hecho | Cómo se acredita |
|---|---|
| El pago se ejecutó | Liquidación `CONFIRMED` releída de la fuente |
| La comisión se cobró | Asiento de cobro confirmado, con su propio identificador |
| El gas se pagó | Coste efectivo de la transacción, con su origen |

Reglas:

1. **El cobro de comisión no es exitoso por haber recibido un `txHash`.**
2. Se define y se registra el caso **«pago exitoso, fee perdido»**: la operación principal cerró y la comisión no se cobró. Es un estado válido que se reconcilia, no se oculta.
3. Se define **«pago exitoso, fee revertido»** y **«cambio de precio entre aceptación y liquidación»** como casos distintos con su propio tratamiento.
4. Recibo, cobro y confirmación son tres cosas distintas y así se muestran.
5. No se activa ningún cargo nuevo sin D02. Se puede **medir sin cobrar**.

---

## 8 · Precio, volumen y liquidez

1. Se distinguen **precio indicativo, declarado, de referencia y de trade real**. No se sustituyen entre sí.
2. **Volumen cero no se disfraza como liquidez.**
3. Las alertas por auto negociación, concentración y manipulación van a **revisión humana**; no sentencian fraude automáticamente.

---

## 9 · Pagos externos, POS y tarjeta

1. Se identifican proveedor y contratos, y los estados de **autorización, captura, liquidación, reverso, devolución y disputa**.
2. **No se guardan PAN ni CVV en registros.** Se prefiere la tokenización del proveedor, con evaluación del alcance de los datos de tarjeta.
3. El webhook es **autenticado y con identificador único**. La respuesta del proveedor se **reconcilia antes de reintentar**. Un doble webhook no produce un doble asiento.
4. **Una tarjeta no liquida físicamente oro** y no funciona sin liquidez fiat operativa.
5. El modo LIVE está bloqueado por D15. Una configuración incompleta nunca pasa a LIVE.

---

## 10 · Parámetros pendientes

| Parámetro | Valor | Decisión |
|---|---|---|
| `feeObjetivoUSD` | `null` | D02 |
| `feeAlcance` (total al usuario o sólo servicio) | `null` | D02 |
| `gasPatrocinado` | `null` | D02 |
| Monto mínimo de operación | `null` | D02 |
| Presupuesto de patrocinio de gas | `null` | D02, tras medición |
| Precio de referencia y modo | `null` | D01 |
| Proveedor de pagos y modo LIVE | `null` | D15 |
| Límites de exposición del OMS | `null` | D08 |

---

## 11 · Pruebas de aceptación de la serie

1. **T-500-01**: Una liquidación DvP atómica en una sola transacción mueve activo y efectivo o no mueve nada; una pata que falla revierte la otra. Ref. T35.
2. **T-500-02**: Una liquidación con una pata fiat o multired **no** se etiqueta como DvP en ninguna salida de la API ni de la interfaz. Ref. T35.
3. **T-500-03**: El `CashVault` sólo permite que el contrato de liquidación autorizado consuma reservas de una orden. Ref. T35, T36.
4. **T-500-04**: Ninguna ruta del carril nativo usa `approve`, `allowance` ni `transferFrom`. Ref. P3 entregable 4.
5. **T-500-05**: Una orden recorre `RECEIVED -> OPEN -> PARTIALLY_FILLED -> FILLED`, y otra `OPEN -> CANCEL_PENDING -> CANCELLED`; una cancelación concurrente con un fill no produce doble ejecución. Ref. T45.
6. **T-500-06**: Una ejecución `CONFIRMED` no se puede cancelar por ninguna ruta. Ref. T45.
7. **T-500-07**: Un fallo de lectura del nodo tras enviar la transacción produce `UNKNOWN`, no `FAILED_FINAL` ni `CONFIRMED`. Ref. T47.
8. **T-500-08**: Una operación en `UNKNOWN` no se reintenta automáticamente; el journal conserva `operationId`, nonce y `txHash`, y el lote se detiene. Ref. T48.
9. **T-500-09**: Un reintento con el mismo `operationId` no produce una segunda ejecución. Ref. T48.
10. **T-500-10**: Una operación multiusuario interrumpida se reanuda desde las confirmaciones existentes, sin duplicar ni ocultar lo ya confirmado. Ref. T48, T49.
11. **T-500-11**: Una cotización de fee expirada no liquida; el sistema vuelve a cotizar y exige aceptación nueva. Ref. T44.
12. **T-500-12**: El importe de una cotización aceptada no se recalcula sin renovación del consentimiento. Ref. T44.
13. **T-500-13**: Una EOA legacy sin gas y sin subsidio aprobado no puede ejecutar; el sistema lo informa y no afirma que un relayer pagará. Ref. T46.
14. **T-500-14**: Una ruta `transferFrom` sin `allowance` previa se rechaza en preflight y en el contrato. Ref. T46.
15. **T-500-15**: El origen y el coste del gas se muestran en la confirmación de toda operación patrocinada. Ref. T46.
16. **T-500-16**: Un pago confirmado con comisión no cobrada produce dos registros distintos y una entrada de reconciliación; ninguno de los dos hechos se infiere del otro. Ref. T44, T48.
17. **T-500-17**: Un doble webhook del proveedor con el mismo identificador produce un solo asiento. Ref. T46, T48.
18. **T-500-18**: Ningún registro contiene PAN ni CVV en ninguna ruta, incluidos los de error. Ref. T52.
19. **T-500-19**: Con `feeObjetivoUSD` en `null`, ninguna ruta activa un cargo; la medición sin cobro sí es posible. Ref. T50.
20. **T-500-20**: El resultado de un fill muestra precio de trade real y no lo sustituye por precio indicativo o declarado; un libro sin volumen no reporta liquidez. Ref. T45.

---

## 12 · Propuestas para el contrato interno

Integradas en `../CONTRATO-INTERNO.md` (punto C01 del plan de corrección). Esta
sección ya no propone nada: lo que este documento necesitaba está en el contrato
interno, que vuelve a ser la fuente única.

