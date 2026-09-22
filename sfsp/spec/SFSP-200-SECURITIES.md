# SFSP-200 · Securities

| Campo | Valor |
|---|---|
| Serie | SFSP-200 · Securities |
| Estado | `draft-0.3` |
| Fuente de tipos | `CONTRATO-INTERNO.md` §1, §2.3, §2.4, §3 |
| Parte del plan maestro | P7c (DBNX), P4 emisión de securities, P3 entregables 3 y 5 |
| Decisiones que la bloquean | D08 (clasificación, derechos y elegibilidad por activo y país), D13 (autorizaciones RFSA/RFCA), D07 (quórums de emisión), D04 (metodología de valoración cuando haya reservas involucradas) |

**Qué NO afirma este documento:** no afirma que exista ninguna autorización jurídica para ofrecer, emitir o negociar ningún instrumento, ni que ninguna plantilla de derechos haya sido aprobada; no clasifica ningún activo existente.

---

## 1 · Admisión DBNX

DBNX recibe empresas, valida su Genesis ID corporativo, revisa documentos, riesgos y derechos, y emite autorizaciones **dentro de su mandato documentado**. Orden Global comprueba la autorización y ejecuta.

### 1.1 Onboarding corporativo

Insumos mínimos: KYB, beneficiario final, mandato y representación, documentos del instrumento y derechos asociados.

### 1.2 Máquina de estado del caso

```
[ DRAFT ] --envío--> [ REVIEW ]
                        |  |  \
                        |  |   \--> [ NEEDS_INFO ] --respuesta--> [ REVIEW ]
                        |  |
                        |  +--> [ REJECTED ]   (terminal, con motivo y apelación)
                        |
                        +--> [ APPROVED ]
```

`caseId` = `case_` + 32 hex.

| Estado | Significado |
|---|---|
| `DRAFT` | Expediente en preparación por el solicitante. |
| `REVIEW` | En revisión por DBNX. |
| `NEEDS_INFO` | Falta información identificada; el plazo y el responsable están declarados. |
| `APPROVED` | Admisión aprobada. **No** es una autorización monetaria. |
| `REJECTED` | Rechazado, con motivo codificado y vía de apelación. |

Se corresponde con `AssetLifecycle.admission` (`DRAFT`, `REVIEW`, `APPROVED`, `REJECTED`, `WITHDRAWN`). `NEEDS_INFO` es un estado del caso, no del activo; el activo permanece en `REVIEW` mientras tanto.

### 1.3 Autorización posterior

La **autorización monetaria** posterior a la admisión tiene alcance, monto, versión, vigencia y firmas propias. Es una `SignedAuthorization` (§2.4 del contrato interno) y se especifica en SFSP-800.

Reglas:

1. Admisión aprobada **no** es autorización de emisión.
2. Una aprobación de Junta autoriza una acción empresarial; **no reemplaza** la revisión técnica, jurídica ni del custodio.
3. Ni un score de un modelo ni un JSON con `approved: true` dan permiso de emisión.

---

## 2 · Plantillas de derechos

Cinco plantillas mínimas. Cada una tiene `id` y `version` en `AssetPassport.rightsTemplate`.

| Plantilla | `economicType` | Contenido mínimo del derecho |
|---|---|---|
| Equity | `EQUITY` | Participación en el capital, derechos económicos, derechos políticos si existen, dilución, preferencias, transmisibilidad |
| Deuda | `DEBT` | Principal, cupón, calendario, prelación, garantías, eventos de incumplimiento, vencimiento |
| Participación de ingresos | `REVENUE_SHARE` | Base de ingresos definida, porcentaje, periodicidad, tope si existe, auditoría de la base |
| Royalty | `ROYALTY` | Base de cálculo, tasa, territorio, duración, mínimos, verificación |
| Interés económico en vehículo | `VEHICLE_INTEREST` | Vehículo, tipo de interés económico, gobierno del vehículo, gastos, waterfall, salida |

Reglas invariables:

1. **No se transforma una acción en royalty cambiando un campo.** Un cambio de plantilla es un instrumento distinto, con expediente, autoridad y, cuando corresponda, una migración (SFSP-700).
2. La `version` de la plantilla es parte del derecho. Cambiarla es cambiar derechos y requiere su propia autoridad.
3. El registro legal debe conciliar participaciones emitidas **también fuera** del contrato. El contrato no es la única fuente de la cifra emitida.
4. Una plantilla no acredita la clasificación jurídica. `legalClass` sigue siendo `null` hasta D08.

---

## 3 · Emisión

`SFSPRegulatedAsset` es una implementación real de emisión, tenencia, transferencias y retiro conforme a la política. **No es una etiqueta de registro.**

`IssuanceController` consume la autorización de DBNX/Tech, comprueba vigencia, cantidad y destinatario, y evita reutilización.

### 3.1 Límites

| Límite | Regla |
|---|---|
| Por autorización | La cantidad acuñada **acumulada** no puede superar el monto aprobado de esa autorización. |
| Por instrumento | `outstanding` más las reservas de emisión concurrentes no pueden superar el límite aprobado. |
| Tesorería | El inventario de tesorería ya acuñado **cuenta dentro** del `outstanding`. |
| Quema | Quemar **no** renueva automáticamente una autorización. |

Se distingue explícitamente un **cap de stock** (cuánto puede existir a la vez) de un **cap acumulado de emisión** (cuánto se ha podido acuñar en total). Son dos límites y se comprueban los dos.

### 3.2 Máquina de estado de emisión

```
[ AUTORIZADA ] --vigencia y límites comprobados--> [ EN_EJECUCION ] --> [ EJECUTADA ]
      |                                                  |
      | vencida / revocada / consumida                   +--> [ FALLIDA ]
      v                                                  +--> [ UNKNOWN ]  (estado real)
[ NO_DISPONIBLE ]
```

`UNKNOWN`, `FALLIDA` y `NO_DISPONIBLE` son estados distintos y no se colapsan. Un `UNKNOWN` se reconcilia; no se reintenta acuñando otra vez.

Emite `MintExecuted` con la referencia a la autorización concreta.

---

## 4 · Reporting

`AssetPassport.reportStatus`: `CURRENT` | `DUE` | `LATE` | `WARNING` | `NONE`.

| Valor | Significado |
|---|---|
| `CURRENT` | La divulgación exigida está al día. |
| `DUE` | Hay una divulgación exigible con plazo abierto. |
| `LATE` | Venció el plazo sin divulgación. |
| `WARNING` | Situación de divulgación que exige atención explícita al titular. |
| `NONE` | No hay obligación de divulgación declarada para este activo. |

### 4.1 El reporting es divulgación, no restricción de mercado

Esta es una separación normativa de la serie:

1. `reportStatus` **describe divulgación**. No es una restricción.
2. Las restricciones de mercado (`trading`, `transferability`) son **decisiones separadas y proporcionadas**, con su propia autoridad y su propio registro.
3. Un `LATE` **no suspende automáticamente** la negociación. Puede motivar una decisión de suspensión, que se toma, se documenta y se registra aparte.
4. Un activo `CURRENT` no queda por ello habilitado para negociar: eso depende de `admission`, `legal` y `trading`.

### 4.2 Plantilla de reporting

Cada plantilla de derechos declara: frecuencia, fecha límite, responsable, definición de evento material, canal de notificación y periodo de subsanación.

`DisclosurePublished` publica el hash del informe con su fecha límite. Un hash prueba integridad del documento presentado; **no prueba su veracidad externa**.

---

## 5 · Corporate actions

Se incluyen dividendos, cupones, votaciones y demás acciones societarias **según la plantilla**, y sólo **antes** de habilitar esos derechos se acredita el mecanismo completo.

### 5.1 Record date

1. Toda corporate action declara una **record date** explícita, con zona horaria y bloque o corte de referencia reproducible.
2. La determinación de titulares a la record date se hace sobre una lectura reproducible a bloque y hash comunes.
3. La cobertura e incertidumbre de la lista de titulares se **enumeran**. No se infiere que unos `Transfer` logs incompletos prueben todo el suministro.
4. Los titulares en custodia, tesorería, wallets de contrato y escrows se identifican por separado. La equivalencia no se comprueba sólo contra las cuentas del backend.

### 5.2 Entitlements no reclamados

1. Un entitlement no reclamado **no se extingue por no reclamarse a tiempo**.
2. Los entitlements no reclamados se **segregan** y se reconcilian por separado.
3. El mantenimiento del mecanismo de reclamación se **financia y se define**, con un mecanismo de continuidad jurídicamente aprobado.
4. No se promete que una página web funcionará eternamente. Se declara el mecanismo de continuidad.
5. La reconciliación de una corporate action compara: entitlements calculados, entitlements pagados, entitlements pendientes y entitlements no reclamados. La suma debe cuadrar y una diferencia bloquea la acción siguiente.

---

## 6 · Clasificación de riesgo R1–R5

`AssetPassport.riskStatus`:

```ts
{ level: 'R1'|'R2'|'R3'|'R4'|'R5'|'SIN_EVALUAR', methodologyVersion: string|null, evaluatedAt: string|null }
```

R1–R5 es una **clasificación relativa** con metodología aprobada. Requisitos de todo grado publicado:

| Requisito | Regla |
|---|---|
| Metodología | Versionada (`methodologyVersion`). Un grado sin metodología versionada no es un grado. |
| Factores | Explícitos y documentados. |
| Evidencia | Referenciada por `evidenceId`. |
| Fecha | `evaluatedAt`, en UTC. Un grado sin fecha no se publica. |
| Responsable | Identificado, con rol. |
| Apelación | Vía de apelación definida, con plazo y autoridad. |

### 6.1 `SIN_EVALUAR`

1. `SIN_EVALUAR` se usa **cuando falte información**. Es el valor correcto, no un defecto vergonzante.
2. **No se usa R5 como sustituto de falta de evaluación.** R5 es un grado evaluado.
3. **R1 no significa sin riesgo.** La presentación lo dice explícitamente.
4. La presentación explica **pérdida, liquidez y complejidad**, sin prometer ganancias.

Un cambio de grado emite `RiskChanged` con metodología y responsable.

### 6.2 Acceso minorista

El acceso minorista de montos pequeños se mantiene como **objetivo**, sujeto a la acción concreta y al régimen aplicable. Aceptar una advertencia **no sustituye** una autorización jurídica. Los umbrales concretos son `null`, pendientes D08 y D13.

---

## 7 · Delisting

**Delisting no elimina propiedad.**

| Qué cambia con `trading: 'DELISTED'` | Qué NO cambia |
|---|---|
| No se aceptan órdenes nuevas en el mercado | El saldo del titular |
| El activo sale del catálogo de oportunidades de compra | La visibilidad para el titular |
| n/a | Los documentos y el `documentRoot` |
| n/a | Los derechos de la plantilla vigente |
| n/a | La posibilidad de una transferencia legal fuera de mercado, si `transferability` lo permite |

Reglas:

1. `DELISTED` jamás implica `visibility: 'HIDDEN_FROM_CATALOG'` para el titular.
2. La interfaz muestra `SUSPENDED` y `DELISTED` **con saldo, documentos y causa**.
3. El **relisting exige una nueva revisión**, no una reversión administrativa.
4. El listado activo sólo filtra oportunidades de compra; el portafolio del titular es la unión del inventario legacy, sus posiciones y el registro conocido.

---

## 8 · Parámetros pendientes

| Parámetro | Valor | Decisión |
|---|---|---|
| `legalClass` por activo | `null` | D08 |
| Jurisdicciones y restricciones transfronterizas | `null` | D08 / D13 |
| Umbrales de acceso minorista | `null` | D08 / D13 |
| Metodología de riesgo aprobada | `null` | D08 |
| Límites por instrumento y por autorización | `null` | D07 / D08 |
| Frecuencias y plazos de reporting por plantilla | `null` | D08 |

Cualquier capacidad que dependa de estos devuelve `BLOCKED_DECISION`.

---

## 9 · Pruebas de aceptación de la serie

1. **T-200-01**: Un caso recorre `DRAFT -> REVIEW -> NEEDS_INFO -> REVIEW -> APPROVED` y un segundo caso termina en `REJECTED` con motivo codificado y vía de apelación. Ref. T06.
2. **T-200-02**: Una admisión `APPROVED` **no** habilita emisión sin una `SignedAuthorization` vigente. Ref. T36.
3. **T-200-03**: Una emisión que supera el monto acumulado de su autorización se rechaza con `DENY_LIMIT`. Ref. T34.
4. **T-200-04**: Quemar unidades **no** restaura capacidad de emisión en una autorización ya consumida. Ref. T34.
5. **T-200-05**: El inventario de tesorería ya acuñado cuenta dentro del `outstanding` al comprobar el cap de stock. Ref. T34.
6. **T-200-06**: Cambiar `rightsTemplate.id` de `EQUITY` a `ROYALTY` se rechaza como cambio de campo y exige instrumento nuevo. Ref. P7c.
7. **T-200-07**: Un activo con `reportStatus: 'LATE'` conserva `trading: 'LISTED'` salvo una decisión de suspensión registrada por separado. Ref. T25.
8. **T-200-08**: `DisclosurePublished` registra hash y fecha límite; el hash no se presenta como prueba de veracidad del contenido. Ref. T25.
9. **T-200-09**: Una corporate action con record date produce una lista de titulares reproducible a bloque y hash comunes, con su incertidumbre enumerada. Ref. T13, T38.
10. **T-200-10**: Los entitlements no reclamados quedan segregados y siguen reclamables tras el plazo nominal. Ref. T16.
11. **T-200-11**: La reconciliación de una corporate action cuadra calculados = pagados + pendientes + no reclamados; una diferencia bloquea. Ref. T39.
12. **T-200-12**: Un activo sin evaluación muestra `SIN_EVALUAR` y **no** R5; la interfaz no presenta R1 como ausencia de riesgo. Ref. T26.
13. **T-200-13**: Un grado sin `methodologyVersion` o sin `evaluatedAt` no se publica y devuelve `BLOCKED_DECISION`. Ref. T50.
14. **T-200-14**: Un activo `DELISTED` conserva saldo, documentos y visibilidad para el titular, y permite una transferencia legal fuera de mercado si `transferability` es `FREE`. Ref. T06, regla 6 del plan.
15. **T-200-15**: El relisting exige un caso de revisión nuevo; no existe una transición directa de `DELISTED` a `LISTED`. Ref. T07.
16. **T-200-16**: Un documento del expediente con instrucciones maliciosas embebidas no altera ninguna decisión ni dispara ninguna acción. Ref. P7c.

---

## 10 · Propuestas para el contrato interno

Integradas en `../CONTRATO-INTERNO.md` (punto C01 del plan de corrección). Esta
sección ya no propone nada: lo que este documento necesitaba está en el contrato
interno, que vuelve a ser la fuente única.

