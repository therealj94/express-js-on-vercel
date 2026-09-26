# SFSP-120 · Compliance

| Campo | Valor |
|---|---|
| Serie | SFSP-120 · Compliance |
| Estado | `draft-0.5` (alineada con el borrador SFSP v0.3 §7) |
| Fuente de tipos | `CONTRATO-INTERNO.md` §2.3, §3, §4 |
| Parte del plan maestro | P3 entregable 6, P6 paso 4, P7c |
| Decisiones que la bloquean | D08 (clasificación, derechos y elegibilidad por activo y país), D13 (jurisdicción, permisos y criterios de inversionista acreditado y sofisticado), D07 (quórums para acciones críticas), primera ola de países (v0.3 §18) |

**Qué NO afirma este documento:** no afirma que exista ninguna política aprobada para ninguna clase de activo, ni que ningún contrato imponga hoy las restricciones que el registro declara; describe el motor de evaluación y sus obligaciones, no un conjunto de reglas vigentes.

---

## 0 · Alineación con el borrador SFSP v0.3 (26-sep-2026)

> **Cómo leer esta sección.** El borrador SFSP v0.3 sustituye al v0.2 y es la regla (`../PLAN-SFSP-v0.3-2026-09-26.md`). Es un documento interno y **no está en el repositorio**: aquí se cita por sección (`v0.3 §n`), no se copia. Para la especificación, el v0.3 manda: la regla de más abajo que contradiga esta sección queda sustituida. Para ejecutar en la 5550 sigue haciendo falta la decisión firmada: lo que dependa de una decisión `PENDIENTE` en `../DECISIONES-SFSP.json` devuelve `BLOCKED_DECISION`.

### 0.1 Acceso abierto por defecto (v0.3 §7)

Cualquier persona, desde cualquier país, puede crear un Genesis ID, mantener activos, recibir transferencias, operar en el mercado secundario y redimir, sin restricción por residencia. **El control por jurisdicción se aplica en solo dos puntos:** la **suscripción en oferta primaria** y la **promoción dirigida**.

### 0.2 La matriz de países

DBNX mantiene una matriz versionada con cuatro estados (v0.3 §7 y Apéndice A, «País en la matriz»):

| Estado | Significado | `SUBSCRIBE` (primaria) | `HOLD` · `RECEIVE` · `TRANSFER` · `TRADE` · `REDEEM` |
|---|---|---|---|
| `PERMITIDO` | Hay base legal para ofrecer al público o un régimen de oferta privada aplicable | `ALLOW`, sujeto al alcance de §0.5 | `ALLOW` |
| `PERMITIDO_CON_CONDICIONES` | Solo ciertos instrumentos, montos o perfiles | según la regla del instrumento | según la regla del instrumento |
| **`SOLO_ENTRANTE`** (por defecto) | Puede recibir, mantener, transferir y redimir; no puede suscribir en primaria | **`DENY`** | `ALLOW` |
| `BLOQUEADO` | Sanción internacional o prohibición expresa de la autoridad competente | `DENY` | `DENY` (la transferencia se rechaza) |

**Cómo encaja con el cierre por defecto de §3.** No hay contradicción: el motor sigue cerrado si falta política. La matriz **es** una política versionada. Sin matriz aprobada, toda acción que la consulte devuelve `BLOCKED_DECISION`. Con matriz aprobada, **un país no evaluado se resuelve como `SOLO_ENTRANTE`**, nunca como bloqueado.

### 0.3 `SUBSCRIBE` es una acción distinta de `TRANSFER` y `RECEIVE`

`SUBSCRIBE` es la adquisición en **oferta primaria**: unidades que pasan del emisor, o de su tesorería, a un tercero. En el vocabulario del v0.3 §4.3 es **colocar**. `TRANSFER` y `RECEIVE` son el **circular**: transferencias entre terceros en el mercado secundario.

| Acción | Quién la origina | Qué evalúa el motor | Lo limita la matriz de países | Lo limita el alcance de la oferta exenta |
|---|---|---|---|---|
| `SUBSCRIBE` | Emisor o tesorería → adquirente | Elegibilidad del adquirente, país, alcance de la base de colocación (§0.5), límite de exposición (§0.7) | Sí | Sí |
| `TRANSFER` | Tenedor → tenedor | Estado del activo, elegibilidad del emisor de la orden, país solo si `BLOQUEADO` | Solo `BLOQUEADO` | No |
| `RECEIVE` | Destino de un `TRANSFER` | Elegibilidad del receptor, país solo si `BLOQUEADO` | Solo `BLOQUEADO` | No |
| `ISSUE` | Emisor | Autorización de emisión (lado del emisor) | No | No |
| `RELEASE` | Tesorería | Capacidad de colocación (SFSP-300 §0.2 para `COM`) | No | No |

Reglas:

1. **Una salida del emisor o de su tesorería hacia un tercero nunca se evalúa solo como `TRANSFER`/`RECEIVE`.** El ejecutor evalúa `SUBSCRIBE` sobre el adquirente. Si no lo hiciera, un residente de un país `SOLO_ENTRANTE` podría suscribir recibiendo «una transferencia» desde la tesorería.
2. La tesorería se identifica por las cuentas internas registradas (SFSP-410 §1). Un envío desde una cuenta interna a una cuenta que no lo es es una colocación.
3. Para `COM`, una colocación exige a la vez `RELEASE` (capacidad en onzas, SFSP-300 §0.2) y `SUBSCRIBE` (elegibilidad del adquirente).
4. `SUBSCRIBE` se añade a la matriz de §3 como obligatoria para `SEC`, `COM`, `MON` y `UTIL`. Para `LEGACY` es `n/a`: un activo heredado no se coloca.

### 0.4 `BLOQUEADO` solo por sanción u orden formal

1. `BLOQUEADO` procede **solo** por sanción internacional o por orden formal de la autoridad del país (v0.3 §7). El cambio lleva código de motivo `SANCION_INTERNACIONAL` u `ORDEN_AUTORIDAD` y la referencia documental. **No hay bloqueo por precaución.**
2. Cuando llega la orden, se acata y queda registrada con su fundamento (`evidenceHash` de `CountryStatusChanged`).
3. Todo cambio de estado de un país es acción de gobernanza (SFSP-800) y emite `CountryStatusChanged`.
4. La apertura de la suscripción es progresiva: un país pasa a `PERMITIDO` cuando existe asesoría local que lo respalde, con código `APERTURA_PAIS`. La primera ola de países es una decisión abierta (v0.3 §18).

### 0.5 Interacción con el alcance de la oferta exenta (v0.3 §7, SFSP-140 §4)

La matriz de países opera **junto con** el alcance de la autorización de colocación. Cada activo declara en su pasaporte la base de su colocación (`MOD_COLOCACION_PRIVADA` u `MOD_OFERTA_PUBLICA`, SFSP-140 §3.2).

Orden de evaluación de `SUBSCRIBE`:

| Paso | Comprobación | Si falla |
|---|---|---|
| 1 | La licencia o autorización de la base de colocación está `VIGENTE` (SFSP-140) | `DENY`, `LICENCIA_NO_OTORGADA` |
| 2 | Si la base es la oferta exenta: el sujeto tiene una atestación vigente `RESIDENTE_PROSPERA`, `ACREDITADO` o `SOFISTICADO` | `DENY`, `FUERA_DE_ALCANCE_OFERTA_EXENTA`; `BLOCKED_DECISION` si el criterio aplicable es `null` |
| 3 | Estado del país del sujeto en la matriz permite `SUBSCRIBE` | `DENY`, `DENY_JURISDICTION` |
| 4 | Límite de exposición, cuando aplique (§0.7) | `DENY`, `DENY_LIMIT`; `UNKNOWN_SOURCE` si falta el dato |

Reglas:

1. Los pasos 2 y 3 se combinan por **conjunción**. Mientras la colocación se sustente en la oferta exenta, la suscripción primaria se limita a los inversionistas que la notificación admite **con independencia del estado del país**: un país `PERMITIDO` no amplía el alcance, y un inversionista admitido no suscribe desde un país `SOLO_ENTRANTE` o `BLOQUEADO`.
2. La apertura de la suscripción primaria al público general depende de la Investment Company License (`LIC_OG_ICL`). Hasta entonces el paso 2 aplica a todo activo colocado por Orden Global.
3. **La puerta única** (v0.3 §7, SFSP-500 §0.4): la compra de ORIGEN en Ordenex con moneda fiduciaria, cuando la contraparte es la tesorería, es una `SUBSCRIBE` sobre `MON` y queda limitada por este alcance. La compra a otro tenedor en el libro es `TRADE` y no lo está.
4. El alcance limita la suscripción, no la tenencia: quien ya tiene un activo lo conserva, lo transfiere y lo redime aunque no esté dentro del alcance.

### 0.6 Regla de promoción (v0.3 §7.1)

1. No se hacen campañas segmentadas por país, contenido dirigido a un mercado específico ni acuerdos con socios comerciales locales en países que no estén `PERMITIDO` para suscripción.
2. Una plataforma abierta con contenido en español accesible desde toda la región no es promoción dirigida. **Una campaña pagada apuntada a una ciudad o a un país sí lo es**, y convierte el acceso espontáneo en oferta dirigida.
3. Los activos colocados bajo la oferta exenta (ORIGEN, AUKA, AGKA, ONDK) **no admiten promoción general** en ningún país, tampoco en los `PERMITIDO` (SFSP-140 §4).
4. Esta regla no se puede imponer por contrato: es un control de operación y de mercadeo (SFSP-900) y se audita. Cada campaña pagada registra su segmentación geográfica para poder auditarla.

### 0.7 El límite de exposición entra como insumo

El motor recibe, para `SUBSCRIBE` y `TRADE` en el Mercado de Crecimiento, la **exposición agregada por Genesis ID** (SFSP-200 §0.5). Sin ese dato, la acción es `UNKNOWN_SOURCE`; nunca se supone cero. El acceso abierto por límite de exposición aplica solo a los activos cuya colocación admite oferta al público (v0.3 §8.5); para los colocados bajo la oferta exenta manda §0.5.

### 0.8 Diferencia con el código actual

`SFSPEligibilityEngine.sol` implementa una **lista blanca de jurisdicciones por activo** (`setJurisdictionAllowed`) que bloquea por defecto. Faltan: los cuatro estados, el estado por defecto `SOLO_ENTRANTE`, la acción `SUBSCRIBE`, la base de colocación en el pasaporte, las atestaciones de alcance de la oferta exenta y el evento `CountryStatusChanged`. Es el punto 2 de la fase 2 del plan v0.3.

### 0.9 Pruebas de aceptación nuevas

1. **T-120-20**: Sin matriz aprobada, `SUBSCRIBE` y `TRANSFER` devuelven `BLOCKED_DECISION`.
2. **T-120-21**: Con matriz aprobada, un país no evaluado se resuelve `SOLO_ENTRANTE`: `RECEIVE`, `TRANSFER`, `TRADE` y `REDEEM` pasan; `SUBSCRIBE` devuelve `DENY`.
3. **T-120-22**: Pasar un país a `BLOQUEADO` sin código `SANCION_INTERNACIONAL` u `ORDEN_AUTORIDAD` se rechaza.
4. **T-120-23**: Un cambio de estado de país sin autorización de gobernanza se rechaza y no emite evento.
5. **T-120-24**: En el Mercado de Crecimiento, sin exposición agregada disponible, la acción es `UNKNOWN_SOURCE`, no `ALLOW`.
6. **T-120-25**: Un envío desde una cuenta interna de tesorería a un tercero evaluado solo como `TRANSFER` se rechaza en el ejecutor: exige `SUBSCRIBE`.
7. **T-120-26**: Sobre un activo colocado bajo la oferta exenta, un sujeto sin atestación de alcance en un país `PERMITIDO` recibe `DENY` con `FUERA_DE_ALCANCE_OFERTA_EXENTA`.
8. **T-120-27**: Un sujeto con atestación `ACREDITADO` vigente en un país `SOLO_ENTRANTE` recibe `DENY` en `SUBSCRIBE`: las dos condiciones se exigen a la vez.
9. **T-120-28**: Con el criterio de `SOFISTICADO` en `null`, una `SUBSCRIBE` que dependa de él devuelve `BLOCKED_DECISION`, no `ALLOW`.
10. **T-120-29**: Un tenedor fuera del alcance de la oferta exenta puede `RECEIVE`, `TRANSFER`, `TRADE` y `REDEEM` el mismo activo en un país `SOLO_ENTRANTE`.

---

## 1 · `EligibilityEngine`

### 1.1 Firma

```
EligibilityEngine.evaluate(subject, asset, action, context) -> EligibilityResult
```

| Parámetro | Contenido |
|---|---|
| `subject` | Referencia opaca al sujeto. Nunca PII. |
| `asset` | `assetId`. |
| `action` | Acción solicitada. Ver §3. |
| `context` | Cantidad en unidades base, red, destino, momento, versión de cliente. |

```
EligibilityResult {
  decision: 'ALLOW' | 'DENY' | 'REVIEW'
  reasonCode: <código del §4 del contrato interno>
  policyVersion: string
  evaluatedAt: string   // ISO 8601 UTC
}
```

### 1.2 `evaluate` es sin escritura

1. `evaluate` es `view` o evaluación externa **sin escritura**. No cambia estado, no consume nonce, no reserva cupo.
2. `evaluate` **no emite eventos**. `EligibilityEvaluated` no existe como evento on-chain.
3. La auditoría de rechazos vive en el **registro operativo**, no en la cadena. Un rechazo por `revert` no deja un log on-chain útil.
4. Dos llamadas idénticas con la misma versión de política y el mismo instante producen el mismo resultado. El motor es determinista dada su entrada y su versión.

---

## 2 · Resultados

| `decision` | `reasonCode` admisibles | Significado |
|---|---|---|
| `ALLOW` | `ALLOW` | La acción puede proceder, sujeta a revalidación en el ejecutor. |
| `DENY` | `DENY_POLICY`, `DENY_ELIGIBILITY`, `DENY_JURISDICTION`, `DENY_ASSET_STATE`, `DENY_AUTHORIZATION`, `DENY_LIMIT` | La acción no procede con la política vigente. |
| `REVIEW` | `REVIEW_REQUIRED` | Necesita revisión humana antes de decidir. No es un `ALLOW` diferido ni un `DENY`. |

Códigos que no son una decisión de elegibilidad:

| Código | Regla |
|---|---|
| `UNKNOWN_SOURCE` | No se pudo leer una fuente necesaria. **No es cero, no es deny, no es allow.** Bloquea la decisión que dependa de esa fuente y deja el resto de la interfaz utilizable. |
| `BLOCKED_DECISION` | Falta una decisión Dxx. No se elige un valor por defecto ni el valor recomendado. |

Reglas:

1. Todo resultado lleva `policyVersion`. Una decisión sin versión no es auditable y se rechaza.
2. Un rechazo siempre lleva código. El código es estable; la interfaz lo traduce y nunca muestra el texto crudo.
3. Los rechazos se explican **sin divulgar motivos AML sensibles**. El expediente completo vive en el registro operativo con control de acceso.
4. `REVIEW_REQUIRED` tiene responsable, plazo y vía de apelación. No es un limbo sin dueño.

---

## 3 · Políticas por acción, para TODAS las clases

**No existe una clase que pase automáticamente.** En particular, `MON` no pasa automáticamente.

Acciones mínimas que toda clase debe cubrir con una política por acción:

| Acción | Descripción |
|---|---|
| `ISSUE` | Emisión contra autorización. |
| `SUBSCRIBE` | Suscripción del adquirente en oferta primaria (colocación). Ver §0.3. |
| `HOLD` | Admisibilidad de tenencia por el sujeto. |
| `TRANSFER` | Transferencia entre cuentas. |
| `RECEIVE` | Recepción por el destinatario. |
| `TRADE` | Envío de orden al mercado. |
| `SETTLE` | Liquidación de una ejecución. |
| `REDEEM` | Ejercicio de redención. |
| `BURN` | Destrucción de unidades. |
| `MIGRATE_CLAIM` | Reclamación en una migración. |
| `RECOVER` | Recuperación reglada. |
| `RELEASE` | Salida de tesorería al circulante. |

Matriz de cobertura obligatoria por clase de `assetId`:

| Clase | `ISSUE` | `SUBSCRIBE` | `HOLD` | `TRANSFER` | `RECEIVE` | `TRADE` | `SETTLE` | `REDEEM` | `BURN` | `MIGRATE_CLAIM` | `RECOVER` | `RELEASE` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `SEC` | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | n/a |
| `COM` | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria (SFSP-300 §0.2) |
| `MON` | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria |
| `UTIL` | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | n/a |
| `LEGACY` | obligatoria | n/a | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | n/a |

«obligatoria» significa que debe existir una política identificada y versionada. Si no existe, la acción devuelve `BLOCKED_DECISION`, no `ALLOW`.

Para `LEGACY`, la existencia de una política **no** implica que el contrato la imponga. Ver §5.

---

## 4 · Revalidación en el ejecutor al liquidar

1. La comprobación previa (preflight) no autoriza la liquidación. El **ejecutor valida otra vez al liquidar**.
2. El `SettlementEngine` verifica en ese momento: fondos, nonce, elegibilidad y precio.
3. Se revalidan como mínimo: estado del activo en los cinco ejes, vigencia de attestations, vigencia de la autorización firmada, límites, y el binding de destino.
4. Una attestation o una cotización que venció entre el preflight y la liquidación invalida la operación. No se completa «porque ya estaba aprobada».
5. La resolución de un destino tiene TTL corto, integridad firmada y **se revalida al ejecutar** para impedir una carrera de cambio de binding.
6. Si la revalidación devuelve `UNKNOWN_SOURCE`, la liquidación se detiene y la operación queda en un estado explícito de incertidumbre, no en `FAILED` ni en `CONFIRMED`.

---

## 5 · Comprobación de cliente frente a enforcement del contrato

Son cosas distintas y se documentan por separado en cada activo.

| Dimensión | Comprobación de cliente | Enforcement del contrato |
|---|---|---|
| Dónde ocurre | Wallet, API, OMS, preflight | Dentro del contrato del activo |
| Qué logra | Evita enviar una operación que será rechazada, mejora la experiencia, deja registro operativo | Impide que la operación ocurra en la cadena |
| Qué NO logra | No impide una llamada directa al contrato | No cubre rutas fuera de ese contrato |
| Campo que lo declara | n/a | `EnforcementScope` |
| Perfil típico | Todos | `SFSP_ENFORCED` |

Reglas:

1. En `LEGACY_REGISTERED` con `directTransferBypass: true`, una comprobación de cliente **no** impide un `transfer()` directo. La interfaz lo muestra con aviso explícito.
2. No se anuncia control de transferencias sobre un activo cuyo `EnforcementScope.transferRestrictions` sea `false`.
3. En `SFSP_ENFORCED`, ninguna ruta directa, administrativa o de `allowance` omite las reglas. Un adaptador ERC-20 de interoperabilidad entra en las mismas reglas.
4. `CUSTODIAL_ACCOUNTING` aplica sus controles en el registro custodial. Eso no es enforcement on-chain y no se presenta como tal.
5. La ficha del activo declara ambas dimensiones. Una restricción declarada en el registro sin enforcement técnico se muestra como declarativa.

---

## 6 · Insumos del motor

| Insumo | Origen | Fallo de lectura |
|---|---|---|
| Attestations del sujeto | Genesis ID (SFSP-110) | `UNKNOWN_SOURCE` |
| Pasaporte y cinco ejes | AssetRegistry (SFSP-100) | `UNKNOWN_SOURCE` |
| Políticas versionadas | AssetRegistry | `BLOCKED_DECISION` si no existe política aprobada |
| Autorización firmada | GovernanceController (SFSP-800) | `DENY_AUTHORIZATION` si falta, vencida o ya consumida |
| Límites aprobados | Parámetros de gobierno | `BLOCKED_DECISION` si el parámetro es `null` |
| Saldo y suministro | Cadena o registro custodial, según `supplySource` | `UNKNOWN_SOURCE` |

Regla transversal: un error de lectura es `UNKNOWN`, nunca cero. Un fallo al descifrar es una excepción, nunca permiso para crear otra posición.

---

## 7 · Valores económicos

Todos los umbrales, límites y porcentajes que consumiría este motor son `null` hasta su decisión.

| Parámetro | Valor | Decisión |
|---|---|---|
| Límites de exposición por sujeto | `null` | pendiente D08 |
| Límites de concentración | `null` | pendiente D04 |
| Umbrales que disparan `REVIEW_REQUIRED` | `null` | pendiente D08 |
| Restricciones por jurisdicción | `null` | pendiente D08 / D13 |
| Mínimos de operación | `null` | pendiente D02 |

Una capacidad que dependa de cualquiera de estos devuelve `BLOCKED_DECISION`.

---

## 8 · Pruebas de aceptación de la serie

1. **T-120-01**: `evaluate` no produce escritura de estado ni emite eventos en ninguna ruta, incluidas las de rechazo. Ref. T26, P3 entregable 6.
2. **T-120-02**: Todo resultado incluye `reasonCode` y `policyVersion`; una respuesta sin versión se rechaza. Ref. T25.
3. **T-120-03**: Existe al menos un caso positivo y uno negativo por cada par (clase, acción) de la matriz del §3. Ref. T06–T07.
4. **T-120-04**: Un activo `MON` sin política aprobada para una acción devuelve `BLOCKED_DECISION` y no `ALLOW`. Ref. P3 entregable 6, T50.
5. **T-120-05**: Un preflight `ALLOW` seguido de una attestation revocada antes de liquidar produce rechazo en el ejecutor. Ref. T25, T26.
6. **T-120-06**: Un cambio de binding entre la resolución del destino y la ejecución invalida la resolución y no liquida contra el binding viejo. Ref. T63.
7. **T-120-07**: Una autorización vencida o ya consumida produce `DENY_AUTHORIZATION`. Ref. T36.
8. **T-120-08**: Un fallo de la fuente de attestations produce `UNKNOWN_SOURCE`, no `DENY` ni `ALLOW`, y el resto de la interfaz sigue operativa. Ref. T47.
9. **T-120-09**: Sobre un activo `LEGACY_REGISTERED` con `directTransferBypass: true`, una comprobación de cliente negativa no impide un `transfer()` directo; la prueba documenta ese límite. Ref. T07.
10. **T-120-10**: Sobre un activo `SFSP_ENFORCED`, una transferencia por adaptador ERC-20 pasa por las mismas reglas que la ruta nativa del contrato. Ref. T35.
11. **T-120-11**: Un rechazo por motivo AML no divulga el motivo sensible al usuario final y sí queda completo en el registro operativo con control de acceso. Ref. P6 paso 4, T52.
12. **T-120-12**: Un parámetro económico `null` en `DECISIONES-SFSP.json` produce `BLOCKED_DECISION` y ninguna ruta inserta el valor recomendado. Ref. T50.

---

## 9 · Propuestas para el contrato interno

Integradas en `../CONTRATO-INTERNO.md` (punto C01 del plan de corrección). Esta
sección ya no propone nada: lo que este documento necesitaba está en el contrato
interno, que vuelve a ser la fuente única.

