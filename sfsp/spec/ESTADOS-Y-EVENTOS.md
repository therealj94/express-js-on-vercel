# SFSP · Estados, eventos y códigos de motivo (Apéndices A y B del v0.2)

| Campo | Valor |
|---|---|
| Estado | `draft-0.4` |
| Qué es | La versión **unificada** de los Apéndices A y B del borrador SFSP v0.2, contrastada con lo que ya existe en el código. Hasta ahora los estados estaban repartidos entre `CONTRATO-INTERNO.md` §2, cada serie y `sdk/src/maquinas.ts` |
| Fuente de eventos | `eventos.json` sigue siendo la fuente única. Este documento no redefine ningún evento: dice a qué evento del JSON corresponde cada fila del Apéndice B |

**Reglas transversales del v0.2 que valen para todo lo de abajo:**

1. Un estado cambia **solo** por una transición definida, y toda transición emite su evento con código de motivo.
2. Un objeto **no salta estados**, salvo que la excepción esté definida con su control.
3. **Ninguna transición ocurre sin actor identificado**: una persona con facultades, un módulo del protocolo o el vencimiento de un plazo (que se registra como transición automática con su causa, código `VENCIMIENTO_PLAZO`).
4. Los estados terminales conservan la historia; no borran el periodo anterior.
5. **Ningún evento lleva datos personales ni saldos legibles.**

---

## A · Estados por objeto

| Objeto | Estados del v0.2 | Dónde vive hoy | Diferencia |
|---|---|---|---|
| **Activo** | Borrador, en revisión, aprobado, activo, restringido, suspendido, reactivado, dado de baja, retirado | Seis ejes independientes en `sdk/src/maquinas.ts` (`legal`, `admission`, `trading`, `transferability`, `redemption`, `visibility`) | **Decisión de diseño pendiente (ver A.1)** |
| Caso de admisión | Abierto, en análisis, en subsanación, en valuación, resuelto favorablemente, resuelto con condiciones, rechazado, desistido | `dbnx-api/src/casos.ts`: `DRAFT`, `REVIEW`, `NEEDS_INFO`, `REJECTED`, `APPROVED` | Faltan **en valuación**, **resuelto con condiciones** y **desistido** |
| Reporte del emisor | Al día, próximo a vencer, vencido, en advertencia, suspendido | `dbnx-api/src/reporting.ts`: `CURRENT`, `DUE`, `LATE`, `WARNING`, `NONE` | Falta **suspendido** |
| Activo de la canasta | Presentado, verificado, elegible, degradado, vencido, liberado | No existe | Nuevo (SFSP-200 §0.3) |
| Solicitud de emisión | Borrador, autorizada por la autoridad de admisión, aprobada técnicamente, ejecutada, rechazada, vencida | Máquina de emisión de SFSP-200 §3.2 y `SFSPIssuanceController` | Cotejar nombres; el contrato ya exige autorización vigente y no reutilizable |
| Lote de metal | Recibido, verificado, asignado, parcialmente tokenizado, bloqueado por redención, liberado | SFSP-300 §2.1 (solo especificación) | Sin código |
| Redención | Solicitada, elegible, en cola, bloqueada, liquidada, entregada, cancelada, **vencida por incomparecencia** | SFSP-300 §4 (solo especificación) | Añadir **vencida por incomparecencia** (retiro presencial) |
| Operación de mercado | Recibida, elegible, calzada, en liquidación, liquidada, fallida, cancelada | SFSP-500 (con `UNKNOWN` como estado real) | El repo añade `UNKNOWN`, que se conserva: una liquidación sin confirmar no es fallida ni liquidada |
| Identidad | Pendiente, en revisión, verificada, rechazada, vencida, suspendida | Genesis ID (código propio) | Mapear el código de Genesis a estos seis (SFSP-110 §0) |
| Vínculo de billetera | Activo, en recuperación, revocado | `BindingStatus` en `sdk/src/tipos.ts` (con `PENDING` y `PRIMARY`) | El repo distingue además pendiente y principal; se conserva |
| Recuperación | Abierta, verificada, aprobada, en demora, ejecutada, rechazada | SFSP-130 y SFSP-800 | Cotejar nombres |
| Reclamo de migración | No reclamado, verificado, bloqueo confirmado, emitido, conciliado, no reclamable | SFSP-700 §7.1 | Dentro de la misma cadena la acuñación va a la misma dirección (SFSP-700 §0.3) |
| **Licencia** | En trámite, otorgada, vigente, suspendida, vencida, revocada | SFSP-140 §4 | Nuevo |
| **País en la matriz** | Solo entrante, permitido, permitido con condiciones, bloqueado | SFSP-120 §0.2 | Nuevo |

### A.1 · El activo: un estado o seis ejes

El v0.2 da al activo **un único estado en línea**. El repositorio usa **seis ejes independientes**, y no por descuido: con un solo estado, «suspender la negociación» y «congelar las transferencias» serían la misma cosa, y un problema de reporte del emisor terminaría congelando los saldos de los tenedores. Los ejes impiden eso (SFSP-100 §4, regla 5).

**Propuesta:** los seis ejes siguen siendo la norma, y el estado del v0.2 se publica como una **vista derivada** de ellos:

| Estado del v0.2 | Se muestra cuando… |
|---|---|
| Borrador | `admission = DRAFT` |
| En revisión | `admission = REVIEW` |
| Aprobado | `admission = APPROVED` y `trading = NOT_LISTED` |
| Activo | `admission = APPROVED` y `trading = LISTED` y `transferability = FREE` |
| Restringido | `transferability = RESTRICTED` o `legal = RESTRICTED_BY_LAW` |
| Suspendido | `trading = SUSPENDED` o `transferability = FROZEN` |
| Reactivado | Transición de `SUSPENDED` a `LISTED` (es un evento, no un estado que dure) |
| Dado de baja | `trading = DELISTED` |
| Retirado | `admission = WITHDRAWN` |

**Esto lo tiene que aceptar José o la Junta.** Hasta entonces, la interfaz pública no muestra un estado único del activo.

---

## B · Eventos del Apéndice B y su nombre en `eventos.json`

| Evento del v0.2 | Nombre canónico | Contrato |
|---|---|---|
| Activo registrado | `AssetRegistered` | ✅ implementado |
| Passport actualizado | `PassportUpdated` | nuevo, sin contrato |
| Estado de activo modificado | `AssetStatusChanged` (uno por eje) | nuevo, sin contrato |
| Supply autorizado | `SupplyAuthorized` | ✅ |
| Ampliación declarada | `SupplyExpansionDeclared` | nuevo, sin contrato |
| Emisión ejecutada | `MintExecuted` | ✅ |
| Quema ejecutada | `BurnExecuted` | ✅ |
| División ejecutada | `SplitExecuted` | nuevo, sin contrato |
| Vínculo de identidad modificado | `IdentityLinkChanged` (solo la referencia del vínculo) | nuevo, sin contrato |
| Elegibilidad evaluada | `EligibilityRecorded` (solo un compromiso; **sin identidad, dirección ni resultado**) | nuevo, sin contrato |
| Límite de exposición registrado | `ExposureLimitRecorded` | nuevo, sin contrato |
| Declaración del adquirente registrada | `AcquirerDeclarationRecorded` | nuevo, sin contrato |
| Reserva atestada | `ReserveAttested` | sin contrato (ya estaba) |
| Reserva vencida | `ReserveExpired` | sin contrato (ya estaba) |
| Cobertura publicada | `CoveragePublished` (contra lo **colocado**; tesorería aparte) | nuevo, sin contrato |
| Redención solicitada / liquidada | `RedemptionUpdated` (una transición por evento) | sin contrato (ya estaba) |
| Divulgación publicada | `DisclosurePublished` | ✅ |
| Nivel de riesgo modificado | `RiskChanged` | ✅ |
| Operación liquidada | `TradeSettled` | ✅ |
| Recuperación ejecutada | `RecoveryExecuted` | ✅ |
| Migración reclamada | `MigrationClaimed` | ✅ |
| Licencia modificada | `LicenseStatusChanged` | nuevo, sin contrato |
| Módulo habilitado o bloqueado | `ModuleAvailabilityChanged` | nuevo, sin contrato |
| País modificado | `CountryStatusChanged` | nuevo, sin contrato |
| Permiso de red modificado | `NetworkPermissionChanged` | nuevo, sin contrato |
| Acción de gobernanza | `GovernanceAction` | ✅ |
| Conciliación registrada | `ConciliationRecorded` | nuevo, sin contrato |
| *(del repo, no del v0.2)* | `PolicyUpdated`, `TreasuryReleased` | ✅ |

Total: **29 eventos**, 12 con contrato y 17 sin contrato. La prueba H15 de `contracts/` exigirá la firma exacta de cada uno en cuanto se escriba su contrato.

---

## C · Catálogo inicial de códigos de motivo

El v0.2 lo deja pendiente para la especificación técnica. Este es el **primer borrador**: se codifica como `bytes32` con el texto en ASCII, alineado a la izquierda. Un código nuevo se añade aquí antes de usarse; **uno retirado no se reutiliza**.

| Código | Se usa en |
|---|---|
| `VENCIMIENTO_PLAZO` | Toda transición automática por vencimiento (atestación, valuación, dictamen, licencia, reporte) |
| `SANCION_INTERNACIONAL` | País a `BLOQUEADO` |
| `ORDEN_AUTORIDAD` | País a `BLOQUEADO`; acatamiento de una orden formal |
| `APERTURA_PAIS` | País a `PERMITIDO` o `PERMITIDO_CON_CONDICIONES`, con asesoría local |
| `LICENCIA_OTORGADA` | Licencia a `OTORGADA`; habilitación de módulo |
| `LICENCIA_NO_OTORGADA` | Rechazo de una operación por dependencia de licencia |
| `LICENCIA_SUSPENDIDA` / `LICENCIA_REVOCADA` | Transiciones de licencia |
| `ATESTACION_VENCIDA` | Degradación automática de reserva o de activo de canasta |
| `DESCUADRE_CONCILIACION` | Detención de emisión por conciliación fuera de tolerancia |
| `EMERGENCIA` | Pausa de emergencia |
| `EVENTO_MATERIAL` | Publicación inmediata y posible cambio de riesgo |
| `REPORTE_ATRASADO` | Reporte del emisor a vencido o en advertencia |
| `INCUMPLIMIENTO` | Restricción o suspensión por incumplimiento |
| `REACTIVACION` | Vuelta de un activo suspendido, tras revisión de DBNX |
| `DECLARACION_FALSA` | Revocación de una admisión |
| `COLOCACION_NUEVA` / `DIVISION` | Tipo de ampliación de supply |
| `RECUPERACION_IDENTIDAD` | Transferencia por recuperación |
| `CORTE_MIGRACION` | Bloqueo de un heredado en su bloque de corte |
| `INACTIVACION_HEREDADO` | Contrato heredado fuera del catálogo |
| `ACTUALIZACION_MODULO` | Actualización de un módulo con su plan de reversión |
| `PERMISO_RED` | Alta o baja en la lista de despliegue o en el filtro |
| `CORRECCION_REGISTRO` | Corrección de un dato del pasaporte, con referencia al dato anterior |
