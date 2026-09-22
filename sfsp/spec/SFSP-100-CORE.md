# SFSP-100 · Core

| Campo | Valor |
|---|---|
| Serie | SFSP-100 · Core |
| Estado | `draft-0.3` |
| Fuente de tipos | `CONTRATO-INTERNO.md` §1, §2.3, §3, §4, §5 |
| Parte del plan maestro | P3 entregables 3, 4, 5, 8 |
| Decisiones que la bloquean | D08 (`legalClass`, derechos y elegibilidad), D03 (semántica monetaria del activo nativo), D16 (resolver o sustituir la spec OGFP v1.0 referida), D11 (repositorio y release source) |

**Qué NO afirma este documento:** no afirma que exista un despliegue, un registro poblado, un enforcement técnico efectivo sobre ningún activo legacy, ni una clasificación jurídica de ningún activo; describe estructuras de datos y reglas de interpretación, no capacidades verificadas en una red real.

---

## 1 · Alcance

SFSP-100 define el núcleo común del protocolo: el identificador de activo, el pasaporte, los cinco ejes independientes de estado, el versionado de políticas y pasaportes, los eventos mínimos, los perfiles de implementación, el alcance de enforcement, la distinción entre activo nativo y activo de contrato, y la aritmética de cantidades.

SFSP es un protocolo de aplicación sobre Besu/EVM/QBFT. No es otro consenso, no renombra la EVM y no niega que los contratos legacy siguen siendo ERC-20. Las reglas propias se obtienen implementando reglas verificables, no cambiando el nombre de una interfaz.

---

## 2 · `assetId`

Forma: `SFSP:<CLASE>:<EMISOR>:<SERIE>`.

Clases del espacio de nombres: `SEC`, `COM`, `MON`, `UTIL`, `LEGACY`.

Reglas:

1. La clase del identificador es un **espacio de nombres**, no una clasificación jurídica. La clasificación vive en `legalClass` del pasaporte y la fija D08.
2. El `assetId` es estable. No cambia porque cambie la clasificación, el estado de negociación, el emisor comercial ni el nombre de producto.
3. Un identificador ya asignado se conserva. Un nombre nuevo entra como **alias** en `AssetPassport.aliases`, nunca como `assetId` sustituto.
4. Un reemplazo global de cadenas de una marca a otra está prohibido en bytes firmados, dominios EIP-712 y despliegues existentes.
5. Un alias no autoriza reclamar dos veces el mismo derecho. La relación vieja-nueva vive en SFSP-700, no en el catálogo.

---

## 3 · Pasaporte de activo

`AssetPassport` es la estructura del §2.3 del contrato interno. Este documento fija su interpretación.

| Campo | Regla de interpretación |
|---|---|
| `assetId` | Estable; ver §2. |
| `issuerId` | Emisor en el registro; se vincula a un Genesis ID corporativo por referencia privada, nunca publicada. |
| `legalInstrumentId` | Referencia al instrumento jurídico. `null` = no acreditado. No se infiere de un README comercial. |
| `economicType` | Descripción económica (EQUITY, DEBT, REVENUE_SHARE, METAL, MONETARY, …). No equivale a `legalClass`. |
| `legalClass` | `null` hasta D08. Un `null` aquí bloquea toda oferta y todo cambio de derechos. |
| `jurisdiction` | `null` hasta D08/D13. |
| `implementationProfile` | Ver §5. |
| `enforcementScope` | Ver §6. Declara lo que el contrato impone de verdad. |
| `assetKind` | Ver §7. |
| `settlementLocation` | `chainId`, `address`, `codehash`. Para `NATIVE`, `address` y `codehash` son `null`. |
| `unit` | Unidad de cuenta declarada (p. ej. onza troy fina). |
| `decimals` | `null` = desconocido. **Nunca** se sustituye por 18. Ver §9. |
| `capabilities` | Capacidades declaradas y probadas. Registrar un activo no añade capacidades. |
| `rightsTemplate` | `{ id, version }` o `null`. La versión es parte del derecho, no un detalle. |
| `documentRoot` | Raíz de documentos. Un hash prueba integridad de lo presentado, no veracidad externa. |
| `reportStatus` | `CURRENT` / `DUE` / `LATE` / `WARNING` / `NONE`. Es **divulgación**, no restricción de mercado. Ver SFSP-200. |
| `riskStatus` | `R1`–`R5` o `SIN_EVALUAR`, con `methodologyVersion` y `evaluatedAt`. Ver SFSP-200. |
| `transferPolicyId`, `redemptionPolicyId`, `listingPolicyId` | Referencias a políticas versionadas. `null` = sin política aprobada, lo que bloquea la acción correspondiente. |
| `supplySource` | `CHAIN_TOTALSUPPLY` / `REGISTRY` / `CUSTODIAL_LEDGER` / `UNKNOWN`. `UNKNOWN` no se degrada a cero. |
| `aliases` | Identificadores previos conservados. |
| `status` | `AssetLifecycle`, cinco ejes independientes. Ver §4. |

El registro es la fuente del catálogo, capacidades y políticas declaradas. La cadena sigue siendo la fuente del saldo on-chain. Una caída del registro no convierte un saldo conocido en inexistente: devuelve `UNKNOWN_SOURCE`.

---

## 4 · Los cinco ejes de estado

`AssetLifecycle` no es un booleano y no se colapsa a un `ACTIVE`. Los ejes son **independientes** y se evalúan por separado.

| Eje | Valores | Qué decide |
|---|---|---|
| `legal` | `UNCLASSIFIED`, `UNDER_REVIEW`, `CLASSIFIED`, `RESTRICTED_BY_LAW` | Situación jurídica y documental. |
| `admission` | `DRAFT`, `REVIEW`, `APPROVED`, `REJECTED`, `WITHDRAWN` | Expediente DBNX. |
| `trading` | `NOT_LISTED`, `LISTED`, `SUSPENDED`, `DELISTED` | Si se aceptan órdenes nuevas en el mercado. |
| `transferability` | `FREE`, `RESTRICTED`, `FROZEN` | Si una transferencia es admisible bajo política. |
| `redemption` | `NONE`, `AVAILABLE`, `SUSPENDED` | Si existe derecho de redención ejercitable. |
| `visibility` | `VISIBLE_TO_HOLDER`, `HIDDEN_FROM_CATALOG` | Si el activo figura en el catálogo de oportunidades. |

Son seis campos en la estructura; los cinco ejes de decisión operativa son `legal`, `admission`, `trading`, `transferability` y `redemption`. `visibility` es un eje de presentación y se rige por la misma regla de independencia.

Reglas invariables:

1. `trading: 'DELISTED'` **nunca** implica `visibility: 'HIDDEN_FROM_CATALOG'`, ni toca el saldo del titular, ni oculta sus documentos.
2. `DELISTED` puede impedir órdenes nuevas y al mismo tiempo permitir consulta y una transferencia legal fuera de mercado.
3. `admission: 'REJECTED'` no borra posiciones existentes.
4. Retirar un activo del catálogo no elimina saldo, documentos ni acceso del titular.
5. Un eje en un valor restrictivo no se propaga automáticamente a otro eje. Cada cambio de eje tiene su propia autoridad y su propio registro.

### 4.1 Transiciones admisibles de cada eje

Los valores de cada eje estaban declarados; los pasos de un valor a otro no. Un
eje sin transiciones declaradas admite cualquier salto, incluido el que devuelve
un expediente rechazado a borrador o el que relista un activo retirado sin que
nadie vuelva a decidirlo. Son seis máquinas independientes, una por eje: ninguna
fila de aquí menciona el valor de otro eje, y la regla 5 de más abajo sigue en
pie.

| Eje | Desde | Hacia | Quién autoriza |
|---|---|---|---|
| `legal` | `UNCLASSIFIED` | `UNDER_REVIEW` | Apertura de revisión jurídica |
| `legal` | `UNDER_REVIEW` | `CLASSIFIED` | Dictamen jurídico |
| `legal` | `UNDER_REVIEW` | `RESTRICTED_BY_LAW` | Dictamen jurídico o mandato de autoridad |
| `legal` | `UNDER_REVIEW` | `UNCLASSIFIED` | Revisión cerrada sin dictamen |
| `legal` | `CLASSIFIED` | `UNDER_REVIEW` | Reapertura por cambio normativo o documental |
| `legal` | `CLASSIFIED` | `RESTRICTED_BY_LAW` | Mandato de autoridad |
| `legal` | `RESTRICTED_BY_LAW` | `UNDER_REVIEW` | Levantamiento del mandato, con revisión previa |
| `admission` | `DRAFT` | `REVIEW` | El emisor presenta el expediente |
| `admission` | `DRAFT` | `WITHDRAWN` | El emisor retira el expediente |
| `admission` | `REVIEW` | `APPROVED` | Comité de admisión DBNX |
| `admission` | `REVIEW` | `REJECTED` | Comité de admisión DBNX |
| `admission` | `REVIEW` | `WITHDRAWN` | El emisor retira el expediente |
| `admission` | `APPROVED` | `WITHDRAWN` | El emisor, o revocación de la admisión con expediente |
| `admission` | `REJECTED` | (ninguna) | Terminal. Volver a intentarlo es un expediente NUEVO en `DRAFT`, no el mismo reabierto, para que el rechazo quede en el historial. |
| `admission` | `WITHDRAWN` | (ninguna) | Terminal, por la misma razón. |
| `trading` | `NOT_LISTED` | `LISTED` | Decisión de listado de mercado |
| `trading` | `LISTED` | `SUSPENDED` | Mercado, por riesgo o por evento del emisor |
| `trading` | `LISTED` | `DELISTED` | Decisión de retirada de mercado |
| `trading` | `SUSPENDED` | `LISTED` | Levantamiento de la suspensión |
| `trading` | `SUSPENDED` | `DELISTED` | La suspensión se resuelve en retirada |
| `trading` | `DELISTED` | `NOT_LISTED` | Readmisión al catálogo. Vuelve al punto de partida y NO salta a `LISTED`: relistar exige la misma decisión de listado que la primera vez. |
| `transferability` | `FREE` | `RESTRICTED` | Política de transferencia del activo |
| `transferability` | `FREE` | `FROZEN` | Congelación por autoridad u orden judicial |
| `transferability` | `RESTRICTED` | `FREE` | Política de transferencia del activo |
| `transferability` | `RESTRICTED` | `FROZEN` | Congelación por autoridad u orden judicial |
| `transferability` | `FROZEN` | `RESTRICTED` | Levantamiento parcial de la congelación |
| `transferability` | `FROZEN` | `FREE` | Levantamiento total de la congelación |
| `redemption` | `NONE` | `AVAILABLE` | Apertura del derecho de redención |
| `redemption` | `AVAILABLE` | `SUSPENDED` | Suspensión temporal de la redención |
| `redemption` | `AVAILABLE` | `NONE` | Cierre del derecho de redención |
| `redemption` | `SUSPENDED` | `AVAILABLE` | Levantamiento de la suspensión |
| `redemption` | `SUSPENDED` | `NONE` | Cierre del derecho de redención |
| `visibility` | `VISIBLE_TO_HOLDER` | `HIDDEN_FROM_CATALOG` | Catálogo de oportunidades |
| `visibility` | `HIDDEN_FROM_CATALOG` | `VISIBLE_TO_HOLDER` | Catálogo de oportunidades |

Ocultar del catálogo no es retirar del mercado ni tocar el saldo: `visibility`
es un eje de presentación y por eso sus dos valores se alcanzan el uno al otro
sin expediente de mercado.

---

## 5 · `implementationProfile`

```ts
type ImplementationProfile = 'LEGACY_REGISTERED' | 'SFSP_ENFORCED' | 'CUSTODIAL_ACCOUNTING';
```

| Perfil | Significado | Lo que NO significa |
|---|---|---|
| `LEGACY_REGISTERED` | Un activo preexistente (típicamente ERC-20) registrado con metadatos, pasaporte y evidencia, sin cambiar su contrato. | No significa que SFSP pueda impedir un `transfer()` directo, congelar, ni forzar una transferencia. |
| `SFSP_ENFORCED` | Contrato SFSP que implementa emisión, tenencia, transferencias y retiro conforme a la política, con verificación en el propio contrato. | No significa que un adaptador ERC-20 de interoperabilidad quede fuera de las reglas: si existe, entra en las mismas reglas y se declara. |
| `CUSTODIAL_ACCOUNTING` | Registro de cuenta bajo custodia, con sus derechos y riesgos declarados. | No es un saldo on-chain individual y no se presenta como tal. |

Reglas:

1. Ningún perfil hereda capacidades de otro sin pruebas.
2. Registrar un activo legacy **no** le añade capacidades. El perfil y el `enforcementScope` declaran exactamente qué se puede imponer y qué no.
3. Los contratos legacy no se convierten en `SFSP_ENFORCED` por registrarlos. Eso requiere una operación distinta por activo (SFSP-700).
4. Si un activo `SFSP_ENFORCED` expone compatibilidad ERC-20, el perfil técnico lo declara. No se afirma «no ERC-20» por razones de marketing.
5. No se crean clases financieras vacías en producción para reservar extensiones futuras.

---

## 6 · `enforcementScope`

```ts
interface EnforcementScope {
  transferRestrictions: boolean;
  freeze: boolean;
  forcedTransfer: boolean;
  pause: boolean;
  directTransferBypass: boolean;
  notes: string;
}
```

| Campo | Pregunta que responde |
|---|---|
| `transferRestrictions` | ¿El contrato impone restricciones de transferencia de verdad, o sólo están declaradas en el registro? |
| `freeze` | ¿Existe congelación efectiva en el contrato? |
| `forcedTransfer` | ¿Existe transferencia forzada y está documentada con su autoridad? |
| `pause` | ¿Existe pausa efectiva? |
| `directTransferBypass` | `true` en legacy ERC-20: `transfer()` no pasa por SFSP. |
| `notes` | Rutas externas, poderes de administrador, puentes, escrows y excepciones conocidas. |

Regla: `directTransferBypass: true` es incompatible con anunciar control de transferencias. La interfaz de usuario muestra la limitación, no la esconde.

Un `enforcementScope` con todos los booleanos en `false` y `directTransferBypass: true` describe un activo que SFSP **observa** pero no **gobierna**. Ese es el estado esperado de la mayoría de los activos legacy en el registro inicial.

---

## 7 · `assetKind`: NATIVE frente a CONTRACT

```ts
type AssetKind = 'NATIVE' | 'CONTRACT' | 'OFFCHAIN_RECORD';
```

| Valor | Representación |
|---|---|
| `NATIVE` | Unidad nativa de la red. `settlementLocation = { chainId, address: null, codehash: null }`. |
| `CONTRACT` | Contrato desplegado. `address` y `codehash` obligatorios y comprobados. |
| `OFFCHAIN_RECORD` | Registro fuera de cadena, típicamente con `implementationProfile: 'CUSTODIAL_ACCOUNTING'`. |

Reglas:

1. **`address(0)` NO se simula como ERC-20.** La unidad nativa se representa con `assetKind: 'NATIVE'` y la localización de red. No se le atribuye un contrato inexistente, ni `approve`, ni `allowance`, ni `transferFrom`.
2. El nativo no tiene `approve`. Todo diseño de liquidación que dependa de `allowance` queda fuera del carril nativo (SFSP-500).
3. Los activos `CONTRACT` llevan contrato y `codehash`. `eth_getCode != 0x` no prueba equivalencia: se compara `codehash` contra el build identificado.
4. Un activo legacy incluye alias, origen y mapeo. Eso no es una autorización de reclamar dos veces.

---

## 8 · Versionado

| Objeto versionado | Campo | Regla |
|---|---|---|
| Estructuras firmadas | `schemaVersion` | Obligatorio en toda estructura firmada. |
| Políticas | `policyVersion` | Toda decisión de elegibilidad devuelve la versión con la que se evaluó. |
| Derechos | `rightsTemplate.version` | Un cambio de versión de derechos es un cambio de derechos, con su propia autoridad. |
| Metodología de riesgo | `riskStatus.methodologyVersion` | Un grado sin metodología versionada no es un grado. |
| Binding | `WalletBinding.version` | Sube en cada cambio; el historial es inmutable. |
| Contrato interno | `draft-0.3` | Versión global de tipos compartidos. |

Reglas:

1. Un cambio de política emite `PolicyUpdated` con versión anterior y nueva.
2. El historial de versiones no se reescribe. Una corrección es una versión nueva.
3. Una decisión tomada con la versión `vN` se audita contra `vN`, no contra la versión vigente hoy.
4. `PolicyUpdated` no cambia retroactivamente decisiones ya liquidadas.

---

## 9 · Unidades y aritmética entera

1. Toda cantidad viaja como **entero en unidades base**, en `string` o `bigint`. Nunca `number`, nunca coma flotante.
2. `decimals: null` significa desconocido. Una decisión financiera que dependa de un `decimals` desconocido devuelve `UNKNOWN_SOURCE` y **no** asume 18.
3. El redondeo se especifica por operación. No existe un redondeo por defecto implícito.
4. Los restos de una conversión de ratio no se truncan en silencio: van a un registro de fracciones o elevan la precisión del entitlement (SFSP-700 §regla de restos).
5. La interfaz puede redondear la **presentación** y siempre da acceso al importe exacto.
6. Las APIs usan cadenas decimales o enteros base; no exponen coma flotante.
7. Comparar cantidades entre dos fuentes exige un **bloque común** y un hash por activo y titular.

---

## 10 · Eventos mínimos

Los eventos del §3 del contrato interno son el conjunto mínimo. El indexador deduplica por `(chainId, blockHash, txHash, logIndex)`.

| Evento | Emisor | Serie que lo especifica |
|---|---|---|
| `AssetRegistered` | AssetRegistry | SFSP-100 |
| `PolicyUpdated` | AssetRegistry | SFSP-100 / SFSP-120 |
| `SupplyAuthorized` | GovernanceController | SFSP-800 |
| `MintExecuted` | IssuanceController | SFSP-200 / SFSP-300 |
| `BurnExecuted` | RegulatedAsset | SFSP-300 |
| `TreasuryReleased` | CashVault | SFSP-400 |
| `ReserveAttested` | ReserveEngine | SFSP-300 / SFSP-400 |
| `ReserveExpired` | ReserveEngine | SFSP-300 / SFSP-400 |
| `DisclosurePublished` | AssetRegistry | SFSP-200 |
| `RiskChanged` | AssetRegistry | SFSP-200 |
| `TradeSettled` | SettlementEngine | SFSP-500 |
| `RedemptionUpdated` | CommodityEngine | SFSP-300 |
| `RecoveryExecuted` | GovernanceController | SFSP-130 / SFSP-800 |
| `MigrationClaimed` | MigrationRegistry | SFSP-700 |
| `GovernanceAction` | GovernanceController | SFSP-800 |

Reglas:

1. `EligibilityEvaluated` **no es un evento**. `evaluate` es de sólo lectura y no escribe (SFSP-120).
2. Un rechazo por `revert` no deja un log on-chain útil. La auditoría de rechazos vive en el registro operativo, no en la cadena.
3. Los eventos sensibles se minimizan. Ningún evento lleva `genesisSubjectRef`, datos personales ni vínculo cuenta-dirección enumerable (SFSP-600).

---

## 11 · Códigos de resultado

Se usan los códigos del §4 del contrato interno, sin excepción y sin variantes locales.

`ALLOW`, `DENY_POLICY`, `DENY_ELIGIBILITY`, `DENY_JURISDICTION`, `DENY_ASSET_STATE`, `DENY_AUTHORIZATION`, `DENY_LIMIT`, `REVIEW_REQUIRED`, `UNKNOWN_SOURCE`, `BLOCKED_DECISION`.

Reglas:

1. `UNKNOWN_SOURCE` nunca se degrada a `ALLOW` ni a saldo cero. Bloquea la decisión que dependa de esa fuente y deja el resto de la interfaz utilizable.
2. `BLOCKED_DECISION` se devuelve cuando falta una decisión Dxx. No se elige un valor por defecto ni un valor recomendado.
3. Un rechazo siempre lleva código. El texto crudo del código no se muestra al usuario final: se traduce.

---

## 12 · Máquinas de estado del protocolo

SFSP-100 exige máquinas de estado **separadas** para: caso de admisión, autorización, emisión, mercado, redención, recuperación, migración y release. Cada una se define en su serie.

| Máquina | Serie |
|---|---|
| Caso de admisión | SFSP-200 |
| Autorización firmada | SFSP-800 |
| Emisión | SFSP-200 / SFSP-300 |
| Orden y ejecución de mercado | SFSP-500 |
| Redención | SFSP-300 |
| Recuperación | SFSP-130 |
| Migración | SFSP-700 |
| Release de tesorería | SFSP-400 |

Reglas transversales:

1. `UNKNOWN`, `REJECTED` y `FAILED` son estados **distintos** y no se colapsan.
2. Toda máquina especifica expiración, revisión y responsable de cada transición.
3. El listado de mercado no cambia ningún saldo.

---

## 13 · Pruebas de aceptación de la serie

1. **T-100-01**: Un `assetId` conserva su valor tras un cambio de `legalClass`, de `trading` y de nombre comercial. Ref. plan P3 entregable 3.
2. **T-100-02**: Un pasaporte con `decimals: null` hace que toda decisión financiera dependiente devuelva `UNKNOWN_SOURCE` y nunca asuma 18. Ref. T21.
3. **T-100-03**: Un activo con `trading: 'DELISTED'` conserva `visibility: 'VISIBLE_TO_HOLDER'`, saldo y documentos accesibles. Ref. T06, regla 6 del plan.
4. **T-100-04**: Registrar un activo legacy no modifica `capabilities` ni ningún booleano de `enforcementScope`. Ref. T07.
5. **T-100-05**: Un activo `NATIVE` rechaza toda operación que requiera `approve`, `allowance` o `transferFrom`, y su `settlementLocation.address` es `null`. Ref. P3 entregable 4.
6. **T-100-06**: Un activo `CONTRACT` con `codehash` distinto del build identificado se rechaza en el registro. Ref. T34.
7. **T-100-07**: El indexador deduplica dos entregas del mismo evento por `(chainId, blockHash, txHash, logIndex)`. Ref. T37.
8. **T-100-08**: `PolicyUpdated` registra versión anterior y nueva, y una decisión previa sigue auditándose contra su versión original. Ref. T25.
9. **T-100-09**: Una fuente de suministro caída produce `UNKNOWN_SOURCE` y no cero, y el resto de la interfaz sigue operativa. Ref. T47, regla 6 del plan.
10. **T-100-10**: Toda cantidad de la API es entero en unidades base como cadena; ninguna ruta produce coma flotante. Ref. T21.
11. **T-100-11**: Una decisión que dependa de un parámetro `null` en `DECISIONES-SFSP.json` devuelve `BLOCKED_DECISION` y no un valor recomendado. Ref. T50.
12. **T-100-12**: `evaluate` no emite ningún evento y no produce escritura de estado. Ref. T26.

---

## 14 · Propuestas para el contrato interno

Integradas en `../CONTRATO-INTERNO.md` (punto C01 del plan de corrección). Esta
sección ya no propone nada: lo que este documento necesitaba está en el contrato
interno, que vuelve a ser la fuente única.

