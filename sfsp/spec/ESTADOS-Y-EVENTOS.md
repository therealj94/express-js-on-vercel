# SFSP · Estados, eventos y códigos de motivo (Apéndices A y B del v0.3)

| Campo | Valor |
|---|---|
| Estado | `draft-0.5` |
| Qué es | La **tabla normativa única** de los Apéndices A y B del borrador SFSP v0.3 (26-sep-2026), contrastada con lo que ya existe en el código. El v0.3 es un documento interno y no está en el repositorio: se cita por sección; los nombres de objetos y estados de §A son exactamente los suyos |
| Fuente de eventos | `eventos.json` sigue siendo la fuente única. Este documento no redefine ningún evento: dice a qué evento del JSON corresponde cada fila del Apéndice B |
| Cambio frente a `draft-0.4` | Pasa del v0.2 al v0.3. Los catorce objetos y sus estados no cambian de nombre entre el v0.2 y el v0.3; cambian las notas de «Diferencia» (licencia por titular y operador, `SUBSCRIBE`, reclamo de migración por cupo del padrón). El Apéndice B se lista en sus 28 filas, sin fusionar las dos de redención |

**Reglas transversales del v0.3 (Apéndices A y B) que valen para todo lo de abajo:**

1. Cada objeto tiene **una** máquina de estados. Un estado cambia **solo** por una transición definida, y toda transición emite su evento con código de motivo.
2. Un objeto **no salta estados**, salvo que la excepción esté definida con su control.
3. **Ninguna transición ocurre sin actor identificado**: una persona con facultades, un módulo del protocolo o el vencimiento de un plazo (que se registra como transición automática con su causa, código `VENCIMIENTO_PLAZO`).
4. Los estados terminales conservan la historia; no borran el periodo anterior.
5. **Un cambio de estado que no emite evento es un cambio invisible**: toda transición del Apéndice A tiene evento asociado.
6. Todo evento lleva, como mínimo, identificador del objeto, estado anterior y posterior cuando aplique, actor, marca de tiempo, código de motivo y referencia documental cuando exista. **Ningún evento lleva datos personales ni saldos legibles.**

---

## A · Estados por objeto (v0.3 Apéndice A)

| # | Objeto | Estados del v0.3 | Dónde vive hoy | Diferencia |
|---|---|---|---|---|
| 1 | **Activo** | Borrador, en revisión, aprobado, activo, restringido, suspendido, reactivado, dado de baja, retirado | Seis ejes independientes en `sdk/src/maquinas.ts` (`legal`, `admission`, `trading`, `transferability`, `redemption`, `visibility`) | **Decisión de diseño pendiente (ver A.1)** |
| 2 | Caso de admisión | Abierto, en análisis, en subsanación, en valuación, resuelto favorablemente, resuelto con condiciones, rechazado, desistido | `dbnx-api/src/casos.ts`: `DRAFT`, `REVIEW`, `NEEDS_INFO`, `REJECTED`, `APPROVED` | Faltan **en valuación**, **resuelto con condiciones** y **desistido**. Los dos «resuelto» exigen el Bloque 7 (SFSP-200 §0.4.1) |
| 3 | Reporte del emisor | Al día, próximo a vencer, vencido, en advertencia, suspendido | `dbnx-api/src/reporting.ts`: `CURRENT`, `DUE`, `LATE`, `WARNING`, `NONE` | Falta **suspendido**. La certificación del fiduciario vencida entra por aquí (SFSP-200 §0.7) |
| 4 | Activo de la canasta | Presentado, verificado, elegible, degradado, vencido, liberado | No existe | Nuevo (SFSP-200 §0.4) |
| 5 | Solicitud de emisión | Borrador, autorizada por la autoridad de admisión, aprobada técnicamente, ejecutada, rechazada, vencida | Máquina de emisión de SFSP-200 §3.2 y `SFSPIssuanceController` | «Aprobada técnicamente» es la verificación previa de forma (SFSP-200 §0.5). Cotejar nombres |
| 6 | Lote de metal | Recibido, verificado, asignado, parcialmente tokenizado, bloqueado por redención, liberado | SFSP-300 §2.1 (solo especificación) | Sin código |
| 7 | Redención | Solicitada, elegible, en cola, bloqueada, liquidada, entregada, cancelada, vencida por incomparecencia | SFSP-300 §4 (solo especificación) | Añadir **vencida por incomparecencia** (retiro presencial). Con canales físicos cerrados, termina en **liquidada** (en ORIGEN) |
| 8 | Operación de mercado | Recibida, elegible, calzada, en liquidación, liquidada, fallida, cancelada | SFSP-500 (con `UNKNOWN` como estado real) | El repo añade `UNKNOWN`, que se conserva: una liquidación sin confirmar no es fallida ni liquidada |
| 9 | Identidad | Pendiente, en revisión, verificada, rechazada, vencida, suspendida | Genesis ID (código propio) | Genesis ID no tiene **vencida**, y «pendiente» está repartido en cuatro estados intermedios (C10 del plan v0.3, fase 0 punto 0.6) |
| 10 | Vínculo de billetera | Activo, en recuperación, revocado | `BindingStatus` en `sdk/src/tipos.ts` (con `PENDING` y `PRIMARY`) | El repo distingue además pendiente y principal; se conserva |
| 11 | Recuperación | Abierta, verificada, aprobada, en demora, ejecutada, rechazada | SFSP-130 y SFSP-800 | Cotejar nombres |
| 12 | Reclamo de migración | No reclamado, verificado, bloqueo confirmado, emitido, conciliado, no reclamable | SFSP-700 §7.1 (reclamo firmado) | En el camino normativo (acuñación a la misma dirección por cupo del padrón, ADR-016) los seis estados se recorren sin reclamo del tenedor: tabla en SFSP-700 §0.3 |
| 13 | **Licencia** | En trámite, otorgada, vigente, suspendida, vencida, revocada | SFSP-140 §5 | Vale también para la oferta exenta (autorización de alcance limitado) |
| 14 | **País en la matriz** | Solo entrante, permitido, permitido con condiciones, bloqueado | SFSP-120 §0.2 | Por defecto **solo entrante**; **bloqueado** solo por sanción u orden formal |

Los catorce objetos y sus estados son, en nombre y en orden, los del v0.3 Apéndice A.

### A.1 · El activo: un estado o seis ejes

El v0.3 (como el v0.2) da al activo **un único estado en línea**. El repositorio usa **seis ejes independientes**, y no por descuido: con un solo estado, «suspender la negociación» y «congelar las transferencias» serían la misma cosa, y un problema de reporte del emisor terminaría congelando los saldos de los tenedores. Los ejes impiden eso (SFSP-100 §4, regla 5).

**Propuesta:** los seis ejes siguen siendo la norma, y el estado del v0.3 se publica como una **vista derivada** de ellos:

| Estado del v0.3 | Se muestra cuando… |
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

## B · Eventos del Apéndice B del v0.3 y su nombre en `eventos.json`

| # | Evento del v0.3 | Nombre canónico | Contrato |
|---|---|---|---|
| 1 | Activo registrado | `AssetRegistered` | ✅ implementado |
| 2 | Passport actualizado | `PassportUpdated` | sin contrato |
| 3 | Estado de activo modificado | `AssetStatusChanged` (uno por eje) | sin contrato |
| 4 | Supply autorizado | `SupplyAuthorized` | ✅ |
| 5 | Ampliación declarada | `SupplyExpansionDeclared` | sin contrato |
| 6 | Emisión ejecutada | `MintExecuted` | ✅ |
| 7 | Quema ejecutada | `BurnExecuted` | ✅ |
| 8 | División ejecutada | `SplitExecuted` | sin contrato |
| 9 | Vínculo de identidad modificado | `IdentityLinkChanged` (solo la referencia del vínculo) | sin contrato |
| 10 | Elegibilidad evaluada | `EligibilityRecorded` (solo un compromiso; **sin identidad, dirección ni resultado**) | sin contrato |
| 11 | Límite de exposición registrado | `ExposureLimitRecorded` | sin contrato |
| 12 | Declaración del adquirente registrada | `AcquirerDeclarationRecorded` (con `documentHash` y `documentVersion`) | sin contrato |
| 13 | Reserva atestada | `ReserveAttested` | sin contrato |
| 14 | Reserva vencida | `ReserveExpired` | sin contrato |
| 15 | Cobertura publicada | `CoveragePublished` (contra lo **colocado**; tesorería aparte) | sin contrato |
| 16 | Redención solicitada | `RedemptionUpdated` con `newState` = solicitada | sin contrato |
| 17 | Redención liquidada | `RedemptionUpdated` con `newState` = liquidada o entregada (la forma de cumplimiento es el estado) | sin contrato |
| 18 | Divulgación publicada | `DisclosurePublished` | ✅ |
| 19 | Nivel de riesgo modificado | `RiskChanged` | ✅ |
| 20 | Operación liquidada | `TradeSettled` | ✅ |
| 21 | Recuperación ejecutada | `RecoveryExecuted` | ✅ |
| 22 | Migración reclamada | `MigrationClaimed` (registro por reclamo). En el camino normativo, `MintExecuted` + `MintOnDemand` con `paymentRef` de prefijo `MIGRACION` (ADR-016) | ✅ |
| 23 | Licencia modificada | `LicenseStatusChanged` | sin contrato |
| 24 | Módulo habilitado o bloqueado | `ModuleAvailabilityChanged` | sin contrato |
| 25 | País modificado | `CountryStatusChanged` | sin contrato |
| 26 | Permiso de red modificado | `NetworkPermissionChanged` | sin contrato |
| 27 | Acción de gobernanza | `GovernanceAction` | ✅ |
| 28 | Conciliación registrada | `ConciliationRecorded` | sin contrato |

**Las 28 filas del Apéndice B tienen evento en `eventos.json`** (27 nombres canónicos: las filas 16 y 17 comparten `RedemptionUpdated`, una transición por evento). Comprobado en `draft-0.5`: no falta ninguno, así que `eventos.json` **no cambia** en esta versión. De esos 27, **10** los emite hoy un contrato y **17** están con `implementadoEnContratos: false`; se emiten desde los contratos de la fase 2 del plan v0.3.

Eventos de `eventos.json` que no vienen del Apéndice B:

| Origen | Eventos | Contrato |
|---|---|---|
| Repositorio | `PolicyUpdated`, `TreasuryReleased` | ✅ |
| SFSP-160 | `OrgDidRegistered`, `OrgDidControllerChanged`, `OrgDidKeyChanged`, `OrgDidAttestorChanged`, `OrgDidDocumentChanged`, `OrgDidDeactivated` (registro `did:sfsp` de organizaciones) | ✅ `SFSPDidRegistry` |
| SFSP-410 | `InternalAccountFlagged`, `MintBudgetSet`, `MintBudgetRevoked`, `MintOnDemand` (`SFSPIssuanceController`); `NativeAbsorbed`, `NativeReleased`, `ReleaseBudgetSet`, `ReleaseBudgetRevoked`, `VaultInternalAccountFlagged` (`SFSPNativeVault`) | ✅ |

Total en `eventos.json`: **44 eventos**, 27 con contrato y 17 sin contrato. La prueba H15 de `contracts/` (`test/11-eventos-contra-spec.js`) exige la firma exacta de cada uno que tenga contrato, y la exigirá del resto en cuanto se escriba.

---

## C · Catálogo inicial de códigos de motivo

El v0.3 lo deja pendiente (Apéndice B, «Pendiente») para la especificación técnica. Este es el **primer borrador**: se codifica como `bytes32` con el texto en ASCII, alineado a la izquierda. Un código nuevo se añade aquí antes de usarse; **uno retirado no se reutiliza**.

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
| `FUERA_DE_ALCANCE_OFERTA_EXENTA` | `SUBSCRIBE` rechazada por estar fuera del alcance de la oferta exenta (SFSP-140 §4, SFSP-120 §0.5) |
| `VERIFICACION_PREVIA_FALLIDA` | Acuñación rechazada por la verificación de forma del documento de aprobación (SFSP-200 §0.5) |
| `SECURITY_FUERA_DE_SWAP` | Fondo de intercambio en cadena con un activo `SEC` (SFSP-500 §0.3) |
| `MIGRACION_FIN` | Revocación del cupo de migración al terminar la ventana (ADR-016) |
