# SFSP-500 · Settlement & Fees

| Campo | Valor |
|---|---|
| Serie | SFSP-500 · Settlement & Fees |
| Estado | `draft-0.5` (alineada con el borrador SFSP v0.3 §7, §10.3 y §13) |
| Fuente de tipos | `CONTRATO-INTERNO.md` §2.4, §3, §4, §5 |
| Parte del plan maestro | P4 (DvP nativo, CashVault), P7b (Orden Markets), P6 pasos 5–7, §2.8 |
| Decisiones que la bloquean | Actas de D01 y D02 (precio en gramín y comisión de 0,01 USD, decididos en sustancia), D02 (mínimos y patrocinio de gas), D15 (proveedor de pagos y liquidez), licencias de Au Corp. (SFSP-140), base legal de la venta de ORIGEN al público (v0.3 §18) |

**Qué NO afirma este documento:** no afirma que exista un fee vigente, un carril patrocinado activo, un proveedor de pagos contratado ni liquidación DvP probada en ninguna red; no afirma que un relayer genérico pague la transacción de ningún usuario.

---

## 0 · Alineación con el borrador SFSP v0.3 (26-sep-2026)

> **Cómo leer esta sección.** El borrador SFSP v0.3 sustituye al v0.2 y es la regla (`../PLAN-SFSP-v0.3-2026-09-26.md`). Es un documento interno y **no está en el repositorio**: aquí se cita por sección (`v0.3 §n`), no se copia. Para la especificación, el v0.3 manda: la regla de más abajo que contradiga esta sección queda sustituida. Para ejecutar en la 5550 sigue haciendo falta la decisión firmada: lo que dependa de una decisión `PENDIENTE` en `../DECISIONES-SFSP.json` devuelve `BLOCKED_DECISION`.

### 0.1 Un mercado híbrido, en Ordenex (v0.3 §13)

**Todos los mercados del sistema se concentran en Ordenex**, división de Au Corp. Ordenex opera un mercado **híbrido** con dos modos, sujetos a las mismas reglas de acceso:

| Modo | Cómo opera el usuario | Calce | Liquidación | Módulos y licencias (SFSP-140 §3.2) |
|---|---|---|---|---|
| **Libro de órdenes con custodia** | Deposita sus activos en Ordenex | Fuera de la cadena, determinista, auditado, con numeración de secuencia | Motor de liquidación del protocolo, entrega contra pago | `MOD_MERCADO_HIBRIDO` **y** `MOD_CUSTODIA_CLIENTES` |
| **Intercambio en cadena** | Opera desde su propia billetera | En cadena, contra **fondos de liquidez conformes a SFSP** con acceso controlado | En la misma transacción | `MOD_MERCADO_HIBRIDO` |

Reglas:

1. **En los dos modos solo operan billeteras vinculadas a un Genesis ID verificado.** El motor de elegibilidad (SFSP-120) se evalúa igual en los dos.
2. **Separación entre emisor y mercado.** Orden Global emite ORIGEN, AUKA, AGKA y ONDK y **no opera ningún mercado** donde se negocien. El precio se forma en Au Corp.
3. **Fondos de liquidez conformes.** Los fondos del intercambio en cadena son contratos conformes a SFSP: registrados en el protocolo, con su clase, serie y pasaporte, y sujetos al motor de elegibilidad. **Los fondos de liquidez heredados de la cadena no se reutilizan** (el envoltorio WETH y los doce pools V3 van a inactivación, SFSP-700 §0.4).
4. **GoldeX se retira.** El intercambio en cadena, concebido como mercado separado de Orden Global con el nombre GoldeX Swap, se integra en Ordenex. El nombre GoldeX no aparece en ninguna interfaz, API, contrato ni documento nuevo; los textos que lo usen se corrigen (fase 0, punto 0.7 del plan v0.3). La solicitud de ATS Clase B de Orden Global se reenfoca a la red de pagos (SFSP-140 §3.2, regla 4).

### 0.2 Libro de órdenes (v0.3 §13.1)

Cada orden **no** vive en la cadena. Calce fuera de la cadena y liquidación en el protocolo, para conservar latencia baja, privacidad del libro y verificabilidad de la liquidación.

| Función | Ubicación |
|---|---|
| Entrada de órdenes y libro | Ordenex, autenticado con Genesis ID |
| Cumplimiento previo a la operación | Motor de elegibilidad y reglas de mercado |
| Calce | Fuera de cadena, determinista, auditado, con numeración de secuencia |
| Liquidación | Motor de liquidación del protocolo (`SFSPSettlementEngine`), entrega contra pago |
| Vigilancia de mercado | DBNX: manipulación, operaciones ficticias, concentración |
| Transparencia pública | Comprobantes y datos agregados |

### 0.3 Reglas por clase de activo (v0.3 §13.2)

| Clase | Libro de órdenes | Intercambio en cadena | Condición para operar |
|---|---|---|---|
| `MON`: ORIGEN | Sí, incluido el par contra moneda fiduciaria (la puerta de entrada, §0.4) | Sí, contra AUKA y AGKA | Genesis ID verificado |
| `COM`: AUKA, AGKA | Sí | Sí | Genesis ID verificado; la redención física se tramita por la custodia de Ordenex (SFSP-300 §0.4) |
| `SEC` | Sí | **No en la primera versión** | Genesis ID, elegibilidad por jurisdicción, límite de exposición y supervisión de DBNX |
| `UTIL` | Sí | Sí | Genesis ID verificado |

1. **Los securities quedan fuera del intercambio en cadena en la versión 1**: exigen elegibilidad en cada transferencia y supervisión de DBNX sobre la formación de precio. El registro de fondos rechaza crear un fondo con un activo `SEC` (código `SECURITY_FUERA_DE_SWAP`). Se reevalúa cuando DBNX tenga herramientas de supervisión sobre la cadena.
2. Las utilities circulan con menos restricciones porque dan acceso a un servicio y no un derecho financiero. DBNX verifica esa clasificación al admitirlas: un token adquirido con expectativa de ganancia por el esfuerzo de un tercero es un security, con independencia de su nombre.
3. Un activo sin clase ni serie decidida (HARV, IBS y los del despliegue conjunto, SFSP-700 §0.4) no se negocia en ningún modo; si ya tiene mercado abierto, se muestra `USO_INTERNO` (SFSP-140 §6.1) o se retira el mercado (C7 del plan v0.3).

### 0.4 La puerta única: ORIGEN contra moneda fiduciaria (v0.3 §7, §13.3)

**El acceso al sistema tiene una sola puerta**: el adquirente deposita moneda fiduciaria por los rieles de AuBank y adquiere ORIGEN en Ordenex. Con ORIGEN adquiere cualquier otro activo.

| Tramo | Quién | Módulo y licencia |
|---|---|---|
| Depósito de moneda fiduciaria | AuBank | `MOD_DEPOSITOS` (`LIC_AUCORP_BANCA_B`) |
| Compra de ORIGEN | Ordenex | `MOD_MERCADO_HIBRIDO` (`LIC_AUCORP_CORRETAJE_C`, `LIC_AUCORP_ATS_B`) |
| Alcance de la colocación de ORIGEN | Orden Global | `MOD_COLOCACION_PRIVADA` (`AUT_OG_OFERTA_EXENTA`) |
| ORIGEN → moneda fiduciaria para la Freedom Card | Orden Global | `MOD_RED_PAGOS_OG` (`LIC_OG_ATS_B`) |

Reglas:

1. **Cada conversión responde bajo la licencia de la entidad que la ejecuta.** Fiat → ORIGEN, Ordenex bajo la ATS de Au Corp.; ORIGEN → fiat para la Freedom Card, Orden Global bajo su propia ATS.
2. **Mientras la colocación de ORIGEN se sustente en la oferta exenta, la puerta queda limitada a los inversionistas que la notificación admite** (SFSP-120 §0.5). La venta de ORIGEN al público minorista es una decisión abierta (v0.3 §18).
3. El emisor que recibe ORIGEN por una colocación lo convierte a moneda fiduciaria en Ordenex. **La tesorería actúa como contraparte de último recurso** (SFSP-400 §7), lo que exige inventario en moneda fiduciaria suficiente para esas conversiones (valor `null`).
4. **MyTokenPay** es la plataforma de comercio de Orden Global y consume **la misma interfaz de liquidación** del protocolo, sin libro contable paralelo.
5. **AuBank es adaptador de rieles fiduciarios; la custodia de activos de clientes es de Ordenex** bajo la Clase G. Ninguna de las dos es fuente del registro de activos del protocolo.
6. Una vía de entrada distinta de esta puerta (por ejemplo, la compra directa de ORIGEN con otro criptoactivo) no es la puerta del sistema y no se publica como tal; su tratamiento es un punto a decidir (ver §0.7).

### 0.5 Comisión y gas

La comisión de 0,01 USD en ORIGEN, separada del gas, está en SFSP-400 §6. Esta serie la cobra con `SFSPFeeController`, cotizada antes de la firma (§5). Con eso, D02 queda contestada en su pregunta de alcance: **la comisión es ingreso por servicio y no incluye el gas**; si el gas se patrocina sigue siendo `null` (D02).

### 0.6 Pendiente (v0.3 §13)

Modelo de órdenes, formadores de mercado, tamaños de puja, interruptores de circuito, ciclos de liquidación y diseño de los fondos de liquidez conformes.

### 0.7 Diferencia con el código actual

| v0.3 | Hoy (plan v0.3, §2 y C6/C7) |
|---|---|
| Mercado híbrido | Ordenex tiene cinco mercados abiertos (AUKA, AGKA, ONDK, IBS, HARV), todos contra ORIGEN, **sin operaciones registradas**. No hay intercambio en cadena |
| Puerta ORIGEN/fiat | **No existe el par.** Existe una compra de ORIGEN con USDT, que no es la puerta descrita |
| Fondos conformes | No existen |
| MyTokenPay sin libro paralelo | El backend de MyTokenPay **lleva un libro paralelo**, y la app móvil trabaja con datos simulados |
| Liquidación en protocolo | `SFSPSettlementEngine` existe, con entrega contra pago en contrato, sin desplegar |

### 0.8 Pruebas de aceptación nuevas

1. **T-500-21**: Crear un fondo del intercambio en cadena con un activo `SEC` se rechaza con `SECURITY_FUERA_DE_SWAP`.
2. **T-500-22**: Una billetera sin Genesis ID verificado no puede operar en ninguno de los dos modos.
3. **T-500-23**: Un intercambio contra un fondo no registrado en el protocolo (incluido cualquier pool heredado) se rechaza.
4. **T-500-24**: Con `LIC_AUCORP_CUSTODIA_G` no vigente, un depósito en el libro de órdenes se rechaza y el intercambio en cadena desde la billetera propia sigue operativo si `MOD_MERCADO_HIBRIDO` está habilitado.
5. **T-500-25**: Una compra de ORIGEN a la tesorería en la puerta por un sujeto fuera del alcance de la oferta exenta se rechaza con `FUERA_DE_ALCANCE_OFERTA_EXENTA`.
6. **T-500-26**: Una venta de MyTokenPay produce el mismo `TradeSettled` que cualquier liquidación del protocolo, y ningún saldo de MyTokenPay existe fuera de él.
7. **T-500-27**: Ninguna respuesta de la API ni texto de interfaz generado por este árbol contiene el nombre GoldeX.
8. **T-500-28**: Un activo sin clase ni serie decidida no se puede negociar en ningún modo.

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
4. El objetivo comercial de USD 0,01 por operación SFSP se conserva como **objetivo**. **draft-0.5:** el v0.3 §10.3 lo define como **comisión del servicio, separada del gas** (§0.5, SFSP-400 §6); falta el acta de D02.
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
| `feeObjetivoUSD` | 0,01 (decidido en sustancia; **falta acta**) | D02 |
| `feeAlcance` (total al usuario o sólo servicio) | Sólo servicio, separado del gas (v0.3 §10.3) | D02 (acta) |
| `gasPatrocinado` | `null` | D02 |
| Monto mínimo de operación | `null` | D02 |
| Presupuesto de patrocinio de gas | `null` | D02, tras medición |
| Precio de referencia y modo | `GRAMIN` (decidido en sustancia; **falta acta**) | D01 |
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
19. **T-500-19**: Sin el acta de D02, ninguna ruta activa un cargo aunque `feeObjetivoUSD` tenga valor en la especificación; la medición sin cobro sí es posible. Ref. T50.
20. **T-500-20**: El resultado de un fill muestra precio de trade real y no lo sustituye por precio indicativo o declarado; un libro sin volumen no reporta liquidez. Ref. T45.

---

## 12 · Propuestas para el contrato interno

Integradas en `../CONTRATO-INTERNO.md` (punto C01 del plan de corrección). Esta
sección ya no propone nada: lo que este documento necesitaba está en el contrato
interno, que vuelve a ser la fuente única.

