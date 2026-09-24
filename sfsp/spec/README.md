# SFSP · spec/ · Especificación normativa

| Campo | Valor |
|---|---|
| Serie | Índice de la carpeta `spec/` |
| Estado | `draft-0.3` |
| Fuente de tipos | `../CONTRATO-INTERNO.md` |
| Parte del plan maestro | P3 (Especificación SFSP ejecutable) |
| Decisiones que lo bloquean | D16 (resolver o sustituir la spec OGFP v1.0 referida) bloquea el cierre de G1 si permanecen contradicciones normativas; D11 bloquea la extracción a su repositorio |

**Qué NO afirma este índice:** no afirma que ninguna serie esté aprobada, implementada, desplegada ni certificada; `draft-0.3` es una etiqueta de especificación, **no** una release financiera v1.0.

---

## 1 · Reglas comunes a todas las series

1. Cada documento empieza con serie, estado, decisiones que lo bloquean y una línea de qué **no** afirma.
2. **Ningún valor económico concreto.** Porcentajes, quórums, precios, haircuts y límites son `null` o «pendiente Dxx».
3. **Ninguna promesa.** Privacidad, respaldo, recuperación y disponibilidad se describen con su alcance probado, que hoy es **ninguno en producción**.
4. Los nombres de tipos, eventos y códigos son **exactamente** los de `../CONTRATO-INTERNO.md`. Lo que haga falta y no exista allí va en la sección «Propuestas para el contrato interno» de cada documento y **no se usa como si existiera**. Una propuesta no puede quedarse ahí indefinidamente: o se integra al contrato interno, o se marca **RECHAZADA** con el motivo en una línea. La prueba `indexer/src/test/deriva-spec.test.ts` falla si un documento propone un tipo que el contrato interno no tiene y que no está rechazado. Eso es lo que impide que vuelva la deriva del punto C01.
5. La forma exacta de los eventos (campos, tipos, `indexed`, obligatoriedad) vive en [`eventos.json`](eventos.json), fuente única desde la que se genera el decodificador del indexador.
6. Cada serie termina con sus pruebas de aceptación numeradas, referenciando T01–T68 del plan maestro donde aplique.
7. Un valor `null` **no se sustituye** por una recomendación. Toda capacidad que dependa de un `null` devuelve `BLOCKED_DECISION`.

---

## 2 · Tabla de series

| Serie | Archivo | Contenido | Estado | Decisiones bloqueantes |
|---|---|---|---|---|
| SFSP-100 | `SFSP-100-CORE.md` | `assetId`, pasaporte, cinco ejes de estado, versionado, eventos, `implementationProfile`, `enforcementScope`, NATIVE vs CONTRACT, unidades y aritmética entera | `draft-0.4`, alineada con v0.2 | D08, D03, D16, D11 |
| SFSP-110 | `SFSP-110-IDENTITY.md` | Genesis ID canónico, attestations por propósito y audiencia, revocación, anti enumeración, qué no va on-chain, W3C VC 2.0 como objetivo | `draft-0.4`, alineada con v0.2 | D13, D08, D06, D17 |
| SFSP-120 | `SFSP-120-COMPLIANCE.md` | `EligibilityEngine`, `evaluate` sin escritura, ALLOW/DENY/REVIEW, revalidación al liquidar, políticas por acción para todas las clases, cliente frente a contrato | `draft-0.4`, alineada con v0.2 | D08, D13, D07, D03 |
| SFSP-130 | `SFSP-130-ACCOUNT-KEY.md` | `SFSPAccount`, Account Number, CSPRNG, Luhn, Alias Registry, `WalletBinding`, perfiles de custodia, `recoveryCapability`, máquinas de estado, las cuatro operaciones distintas | escrita `draft-0.3` | D17, D18, D19, D10, D07 |
| SFSP-140 | `SFSP-140-LICENSES.md` | **Nueva (v0.2 §6).** Registro de licencias por titular, dependencia de cada módulo, estados, vista pública que nunca anuncia lo no otorgado, taxonomía única de disponibilidad | `draft-0.4`, nueva | D13, titularidad de licencias compartidas, D07 |
| SFSP-150 | `SFSP-150-NETWORK-ADMISSION.md` | **Nueva (v0.2 §2.1).** Red cerrada: lista de despliegue y filtro de transacciones por destino derivado del registro; orden de encendido | `draft-0.4`, nueva | **D07**, D12, D11, mecanismo de Besu |
| SFSP-200 | `SFSP-200-SECURITIES.md` | Admisión DBNX, cinco plantillas de derechos, reporting como divulgación, corporate actions, R1–R5 y `SIN_EVALUAR`, delisting | `draft-0.4`, alineada con v0.2 | D08, D13, D07, D04 |
| SFSP-300 | `SFSP-300-COMMODITIES.md` | AUKA y AGK/AGKA como alias, `MetalLot`, invariante en onzas finas, máquina de redención no atómica, obligación exigible, mínimos distintos | `draft-0.4`, alineada con v0.2 | D05, D04, D02, D08 |
| SFSP-400 | `SFSP-400-MONETARY.md` | ORIGEN nativo, fórmulas del §6.1, las tres alternativas de D03, `U_unactivated`, techo administrativo frente a saldo técnico | `draft-0.4`, alineada con v0.2 | **D03**, D01, D04, D02 |
| SFSP-500 | `SFSP-500-SETTLEMENT-FEES.md` | DvP, `CashVault`, estados de orden y de ejecución, `UNKNOWN` como estado real, cotización de fee con TTL, patrocinio de gas, pago frente a comisión | `draft-0.4`, alineada con v0.2 | D02, D01, D15, D03 |
| SFSP-600 | `SFSP-600-PRIVACY-TRANSPARENCY.md` | Línea base transparente, qué ve cada actor, metadatos y correlación, los dos prototipos no implementados, Tessera no es la base, qué se puede anunciar | `draft-0.4`, alineada con v0.2 | **D06**, D13, D14 |
| SFSP-700 | `SFSP-700-MIGRATION.md` | `FROZEN_SNAPSHOT` y `SURRENDER_ON_CLAIM`, conciliación `S0 = A + N + P`, regla de restos, anti doble derecho, claims sin vencimiento, journal | `draft-0.4`, alineada con v0.2 | **D09**, D08, D10, D03, D14 |
| SFSP-800 | `SFSP-800-GOVERNANCE.md` | Roles y separación de funciones, firmas críticas por acción, `SignedAuthorization`, revocación y nonce, upgrades con timelock y reversión | `draft-0.4`, alineada con v0.2 | **D07**, D10, D18, D19, D13, D11 |
| SFSP-900 | `SFSP-900-OPERATIONS.md` | Observabilidad por componente, conciliación diaria, runbooks, RPO/RTO, presupuestos, estados de evidencia | `draft-0.4`, alineada con v0.2 | D12, D11, D14, D15, D07 |

Las categorías jurídicas **no se derivan de la numeración**. SFSP-200 se llama «Securities» por su contenido económico habitual, no porque clasifique nada como valor negociable.

---

## 3 · Qué decisión bloquea qué parte

| Decisión | Tema | Series afectadas | Qué queda bloqueado |
|---|---|---|---|
| **D00** | Nombre SFSP y clearance de marca | n/a | Lanzamiento de marca y uso exclusivo de la sigla. No bloquea esta redacción. |
| **D01** | Política vigente de precio y sus consumidores | 400, 500 | `ReferenceUSDperUnit`, conversión, valuación de reservas, tarjeta, nuevo esquema de fee |
| **D02** | Alcance del objetivo de fee, mínimos y patrocinio de gas | 300, 500, 900 | Activación de cualquier cobro nuevo, compra mínima, presupuesto de gas |
| **D03** | Suministro nativo: respaldo total frente a release controlado | **400**, 100, 500, 700 | Toda afirmación de respaldo, `ReleaseCap`, release de tesorería, perímetro de `U_unactivated` |
| **D04** | Reservas elegibles, haircuts, concentración y metodología | 300, 400, 200 | `RAC_units` distinto de cero, `EligibleValue`, capacidad de emisión respaldada |
| **D05** | Custodia, lotes, obligaciones y redención de AUKA/AGK | **300** | Serie redimible, nuevas emisiones de commodity, mínimo de redención física |
| **D06** | Alcance y diseño de privacidad | **600** | Carril confidencial y toda promesa de privacidad |
| **D07** | Quórums, firmantes, pausa, upgrade y recovery | **800**, 130, 120, 200 | Todos los poderes críticos fuera de fixtures sintéticos; `quorumMint`, `quorumPause`, `quorumUpgrade`, `quorumRecovery`, timelock |
| **D08** | Clasificación, derechos y elegibilidad por activo y país | **200**, 100, 120, 300, 700 | `legalClass`, oferta, cambios de derechos, negociación dependiente, políticas de elegibilidad |
| **D09** | Modo, ratio, gas, corte y claims de migración por activo | **700** | Cada P9b; toda ruta de claim |
| **D10** | Custodia canónica, excepciones y recuperación | 130, 800 | Migración de llaves y recuperación de activos |
| **D11** | Repositorios y release source por servicio | 900, 800, 100 | Escritura o despliegue sobre una copia dudosa; creación del repo propio |
| **D12** | Recursos de staging y aislamiento efectivo | **900** | Pruebas integradas o destructivas |
| **D13** | Identidad, jurisdicción, permisos y alcance RFSA/RFCA | **110**, 200, 120, 600 | Actividades que requieran esas autorizaciones |
| **D14** | Retiro de la red histórica y continuidad | 700, 900, 600 | Apagado o descarte de recursos y evidencia |
| **D15** | Proveedor de pagos, contratos y liquidez | 500, 900 | Modo LIVE en tarjeta, POS y compra multired |
| **D16** | Resolver o sustituir la spec OGFP v1.0 referida | índice, 100 | Cierre de G1 si permanecen contradicciones normativas |
| **D17** | Política de alias | **130**, 110 | Activación pública de aliases, disputas, reservados, cuarentena |
| **D18** | Arquitectura final de custodia MANAGED | **130**, 800 | Migración de material criptográfico y nuevas cuentas managed a escala |
| **D19** | Política de recuperación por activo y perfil | **130**, 800 | Prometer recuperación de fondos y ejecutar recovery de activos |

Las series en **negrita** son aquellas cuyo núcleo queda bloqueado, no sólo un parámetro.

---

## 4 · Estado global de lo que la especificación describe

| Capacidad | Estado de evidencia | Dónde |
|---|---|---|
| Especificación escrita | `DECLARADO` | esta carpeta |
| Contratos desplegados en cualquier red | `NO_VERIFICADO` | ninguno |
| Enforcement técnico sobre activos legacy | `NO_VERIFICADO` | `enforcementScope` declara `directTransferBypass` |
| Privacidad | `NO_VERIFICADO` | SFSP-600; ambos prototipos sin implementar |
| Respaldo o cobertura | `BLOQUEADO` | SFSP-400; D03 y D04 pendientes |
| Recuperación de activos | `BLOQUEADO` | SFSP-130; D19 pendiente |
| Migración de activos | `BLOQUEADO` | SFSP-700; D09 pendiente |
| Account Numbers emitidos | `NO_VERIFICADO` | ninguno |
| Lectura autorizada de redes, llaves o cuentas reales | `NO_VERIFICADO` | no hay accesos en este entorno |

**Ningún estado de esta tabla asciende por una afirmación en prosa.**

---

## 5 · Matriz de pruebas

| Rango | Origen | Series que lo referencian |
|---|---|---|
| T01–T56 | Casos mínimos del plan maestro | todas |
| T57–T68 | Pruebas de SFSP-130 (cuenta, alias, binding, custodia, censo) | 130 |
| T-nnn-xx | Pruebas propias de cada serie, numeradas localmente | cada serie |

Implementar estas pruebas **no demuestra que sean las únicas necesarias**.

---

## 6 · Relación con el resto del árbol

| Carpeta | Relación |
|---|---|
| `../CONTRATO-INTERNO.md` | Fuente única de tipos, IDs, estados, eventos, códigos y fórmulas. La spec no define tipos por su cuenta. |
| `../DECISIONES-SFSP.json` | Copia legible por herramientas de las decisiones y parámetros. Todo valor no aprobado es `null`. |
| `../adr/` | ADR-001 a ADR-012, con decisión, alternativas y riesgos. |
| `../sdk/` | Implementación de referencia y pruebas T57–T68. |
| `../contracts/` | Solidity: registro, emisión, gobierno, liquidación, migración. |
| `../indexer/`, `../dbnx-api/` | Consumidores de los eventos y los estados definidos aquí. |
| `../privacy/` | Prototipos y modelo de amenazas. Desactivado por defecto. |
| `../evidence/`, `../runbooks/`, `../fixtures/` | Evidencia sanitizada, operación y datos sintéticos etiquetados. |
