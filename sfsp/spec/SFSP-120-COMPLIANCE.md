# SFSP-120 · Compliance

| Campo | Valor |
|---|---|
| Serie | SFSP-120 · Compliance |
| Estado | `draft-0.3` |
| Fuente de tipos | `CONTRATO-INTERNO.md` §2.3, §3, §4 |
| Parte del plan maestro | P3 entregable 6, P6 paso 4, P7c |
| Decisiones que la bloquean | D08 (clasificación, derechos y elegibilidad por activo y país), D13 (jurisdicción y permisos), D07 (quórums para acciones críticas), D03 (semántica monetaria) |

**Qué NO afirma este documento:** no afirma que exista ninguna política aprobada para ninguna clase de activo, ni que ningún contrato imponga hoy las restricciones que el registro declara; describe el motor de evaluación y sus obligaciones, no un conjunto de reglas vigentes.

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

| Clase | `ISSUE` | `HOLD` | `TRANSFER` | `RECEIVE` | `TRADE` | `SETTLE` | `REDEEM` | `BURN` | `MIGRATE_CLAIM` | `RECOVER` | `RELEASE` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `SEC` | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | n/a |
| `COM` | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | n/a |
| `MON` | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria |
| `UTIL` | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | n/a |
| `LEGACY` | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | obligatoria | n/a |

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

1. **`EligibilityResult`**: el contrato interno define los códigos del §4 pero no la estructura de respuesta de `evaluate`. Se propone añadirla con `decision`, `reasonCode`, `policyVersion` y `evaluatedAt`.
2. **`EligibilityAction`**: enumeración de las once acciones del §3 (`ISSUE`, `HOLD`, `TRANSFER`, `RECEIVE`, `TRADE`, `SETTLE`, `REDEEM`, `BURN`, `MIGRATE_CLAIM`, `RECOVER`, `RELEASE`).
3. **`policyId`**: identificador con forma `pol_` + 32 hex, referido hoy por `transferPolicyId`, `redemptionPolicyId` y `listingPolicyId` sin forma declarada.

Hasta que existan allí, ninguna implementación las usa como si estuvieran definidas.
