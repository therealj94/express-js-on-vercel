# SFSP · spec/ · Especificación normativa

| Campo | Valor |
|---|---|
| Serie | Índice de la carpeta `spec/` |
| Estado | `draft-0.5` (alineada con el borrador SFSP v0.3, 26-sep-2026) |
| Fuente de tipos | `../CONTRATO-INTERNO.md` |
| Parte del plan maestro | P3 (Especificación SFSP ejecutable) |
| Decisiones que lo bloquean | D16 (resolver o sustituir la spec OGFP v1.0 referida) bloquea el cierre de G1 si permanecen contradicciones normativas; D11 bloquea la extracción a su repositorio; las actas de D01 y D02 y la firma de D23 y D26 bloquean lo que el v0.3 da por decidido en sustancia |

**Qué NO afirma este índice:** no afirma que ninguna serie esté aprobada, implementada, desplegada ni certificada; `draft-0.5` es una etiqueta de especificación, **no** una release financiera v1.0.

---

## 0 · Cambios desde `draft-0.4`

`draft-0.5` alinea la especificación con el **borrador SFSP v0.3 (26-sep-2026)**, que sustituye al v0.2. El v0.3 es un documento interno y **no está en el repositorio**: las series lo citan por sección (`v0.3 §n`) y no lo copian. El cotejo sección por sección y las correcciones de la medición están en `../PLAN-SFSP-v0.3-2026-09-26.md` (§1 y fase 1).

| Serie o archivo | Cambio | v0.3 |
|---|---|---|
| SFSP-140 | Registro con **titular y operador**: Au Corp. titular; Ordenex y AuBank operadores; ATS Clase B y Non-Banking Lender **propias** de Orden Global, independientes de las de Au Corp.; Investment Company License para la oferta pública; Custodia Clase G a Ordenex. La **notificación de oferta exenta** pasa a autorización de alcance limitado (Próspera, acreditado, sofisticado) que aplica el motor de elegibilidad. Taxonomía única `DISPONIBLE` / `BETA` / `PROXIMAMENTE` / `USO_INTERNO`; lo que depende de una licencia no otorgada nunca se muestra disponible y su estado se dice «en trámite» | §5, §6 |
| SFSP-120 | Acción **`SUBSCRIBE`** separada de `TRANSFER` y `RECEIVE`; una salida de tesorería a un tercero se evalúa como `SUBSCRIBE`. Por defecto **`SOLO_ENTRANTE`**; `BLOQUEADO` solo por sanción u orden formal. Conjunción con el alcance de la oferta exenta. Regla de promoción, más estricta para los activos bajo oferta exenta | §7, §7.1 |
| SFSP-200 | **Bloque 7** (responsabilidades, niveles, ventanilla única, fondo de protección, declaración del adquirente con versión) como **condición de admisión**. **Verificación previa a la acuñación** (forma, no fondo; también si Orden Global es el solicitante; cantidad exacta). Colocación **hasta el 51 %** con mínimo por segmento `BLOCKED_DECISION`. **DBNX no valúa**: valuador independiente contratado por el solicitante. **Tokenización de acciones** con fiduciario, cinco documentos de admisión y certificación periódica | §5, §8.2, §8.3, §8.5, §8.9 |
| SFSP-300 | **Revierte la enmienda SFSP-410**: AUKA y AGKA se pueden acuñar por anticipado a tesorería; la **colocación** exige onzas verificadas no comprometidas. Custodia por Ordenex bajo Clase G con límite de concentración `BLOCKED_DECISION` y auditoría externa más frecuente. Canales físicos cerrados por parámetro mientras la Clase G esté en trámite. 1 AUKA = 1.710,69 ORIGEN; AGKA, liquidación permanente en ORIGEN | §9 |
| SFSP-400 | La emisión contra reservas (`RAC_units`, release contra reservas, `U_unactivated`, alternativas de D03) pasa a **histórico descartado**. Supply fijo verificado. Precio en **gramín** (D01, falta acta). Comisión de **0,01 USD en ORIGEN** separada del gas (D02, falta acta); gas real con tarifa base 0 y mínimo de 93 gwei. Tesorería cotizadora con sus cinco controles. **Oráculo único**: caché 30 s, edad máxima 10 min, guion sin dato | §10 |
| SFSP-500 | **Mercado híbrido en Ordenex** (libro con custodia e intercambio en cadena con fondos conformes). Reglas por clase: securities **fuera del intercambio en cadena** en la versión 1. **Puerta única** ORIGEN/fiat con licencias por tramo. **GoldeX retirado** | §7, §13 |
| SFSP-700 | Camino normativo: **acuñación a la misma dirección por cupo del padrón** (`SET_MINT_BUDGET` + `mintOnDemand`); el registro por reclamo queda para lo que no puede asignarse a la misma dirección. Catálogo del v0.3 §14.4 completo. Supply no ubicado **corregido: 804,5 ONDK** (el v0.3 dice 792,5; 12 son una clave de permiso contada como saldo) y 9.823,01 AUKA, medidos en la 5550, bloque 273.508 | §14 |
| SFSP-410 | Nota de reversión de §3.2 (commodities) | §9.4 |
| `ESTADOS-Y-EVENTOS.md` | Los 14 objetos y estados del Apéndice A del v0.3 como tabla normativa; las 28 filas del Apéndice B con su evento; cuatro códigos de motivo nuevos | Apéndices A y B |
| `eventos.json` | **Sin cambios**: las 28 filas del Apéndice B ya tenían evento (27 nombres canónicos) | Apéndice B |
| `../adr/ADR-016` | Nuevo: migración a la misma dirección por cupo del padrón. `PROPUESTO`, bloqueado por D26 | §14.3 |
| `../adr/ADR-015` | Nota: su consecuencia sobre SFSP-300 queda revertida | §9.4 |

Las series SFSP-100, 110, 130, 150, 160, 600, 800 y 900 no se tocan en `draft-0.5`: siguen alineadas con el v0.2 hasta su propia revisión.

---

## 1 · Reglas comunes a todas las series

1. Cada documento empieza con serie, estado, decisiones que lo bloquean y una línea de qué **no** afirma.
2. **Ningún valor económico concreto.** Porcentajes, quórums, precios, haircuts y límites son `null` o «pendiente Dxx».
3. **Ninguna promesa.** Privacidad, respaldo, recuperación y disponibilidad se describen con su alcance probado, que hoy es **ninguno en producción**.
4. Los nombres de tipos, eventos y códigos son **exactamente** los de `../CONTRATO-INTERNO.md`. Lo que haga falta y no exista allí va en la sección «Propuestas para el contrato interno» de cada documento y **no se usa como si existiera**. Una propuesta no puede quedarse ahí indefinidamente: o se integra al contrato interno, o se marca **RECHAZADA** con el motivo en una línea. La prueba `indexer/src/test/deriva-spec.test.ts` falla si un documento propone un tipo que el contrato interno no tiene y que no está rechazado. Eso es lo que impide que vuelva la deriva del punto C01.
5. La forma exacta de los eventos (campos, tipos, `indexed`, obligatoriedad) vive en [`eventos.json`](eventos.json), fuente única desde la que se genera el decodificador del indexador.
6. Cada serie termina con sus pruebas de aceptación numeradas, referenciando T01–T68 del plan maestro donde aplique.
7. Un valor `null` **no se sustituye** por una recomendación. Toda capacidad que dependa de un `null` devuelve `BLOCKED_DECISION`.
8. **El documento rector es el borrador SFSP v0.3.** Es interno: se cita por sección y no se copia al repositorio. Donde la medición lo contradice, manda la medición y la corrección se anota (C1–C10 del plan v0.3).

---

## 2 · Tabla de series

| Serie | Archivo | Contenido | Estado | Decisiones bloqueantes |
|---|---|---|---|---|
| SFSP-100 | `SFSP-100-CORE.md` | `assetId`, pasaporte, cinco ejes de estado, versionado, eventos, `implementationProfile`, `enforcementScope`, NATIVE vs CONTRACT, unidades y aritmética entera | `draft-0.4`, alineada con v0.2 | D08, D03, D16, D11 |
| SFSP-110 | `SFSP-110-IDENTITY.md` | Genesis ID canónico, attestations por propósito y audiencia, revocación, anti enumeración, qué no va on-chain, W3C VC 2.0 como objetivo | `draft-0.4`, alineada con v0.2 | D13, D08, D06, D17 |
| SFSP-120 | `SFSP-120-COMPLIANCE.md` | `EligibilityEngine`, `evaluate` sin escritura, ALLOW/DENY/REVIEW, revalidación al liquidar, políticas por acción para todas las clases, cliente frente a contrato; matriz de países con `SOLO_ENTRANTE` por defecto, `SUBSCRIBE` y alcance de la oferta exenta | `draft-0.5`, alineada con v0.3 | D08, D13, D07 |
| SFSP-130 | `SFSP-130-ACCOUNT-KEY.md` | `SFSPAccount`, Account Number, CSPRNG, Luhn, Alias Registry, `WalletBinding`, perfiles de custodia, `recoveryCapability`, máquinas de estado, las cuatro operaciones distintas | escrita `draft-0.3` | D17, D18, D19, D10, D07 |
| SFSP-140 | `SFSP-140-LICENSES.md` | Registro de licencias por **titular y operador**, dependencia de cada módulo, oferta exenta como autorización de alcance limitado, estados, vista pública que nunca anuncia lo no otorgado, taxonomía única de disponibilidad | `draft-0.5`, alineada con v0.3 | D13, D07, base legal de la venta de ORIGEN al público |
| SFSP-150 | `SFSP-150-NETWORK-ADMISSION.md` | **Nueva (v0.2 §2.1).** Red cerrada: lista de despliegue y filtro de transacciones por destino derivado del registro; orden de encendido | `draft-0.4`, nueva | **D07**, D12, D11, mecanismo de Besu |
| SFSP-160 | `SFSP-160-SELF-SOVEREIGN-IDENTITY.md` | **Nueva (25-sep). SFSP-ID**, la identidad de SFSP sobre estándares Web5: método propio `did:sfsp` (persona por relación, que se autocertifica; organización en `SFSPDidRegistry` de la 5550); el GID como raíz privada que nunca se publica; credenciales con divulgación selectiva cuya raíz es la de la atestación en cadena; permisos y datos cifrados de la persona | `draft-0.4`, nueva, con contrato, SDK y pruebas cruzadas | **D22**, D13, D06 |
| SFSP-200 | `SFSP-200-SECURITIES.md` | Admisión DBNX con Bloque 7, verificación previa a la acuñación, colocación hasta el 51 %, tokenización de acciones, plantillas de derechos, reporting como divulgación, corporate actions, R1–R5 y `SIN_EVALUAR`, delisting | `draft-0.5`, alineada con v0.3 | D08, D13, D07, D23, umbrales de segmentos y deslindes |
| SFSP-300 | `SFSP-300-COMMODITIES.md` | AUKA y AGK/AGKA como alias, acuñación previa y colocación contra metal, custodia por Ordenex con límite, `MetalLot`, invariante contra lo colocado, redención con canales físicos cerrados por parámetro, obligación exigible | `draft-0.5`, alineada con v0.3 | D05, D04, D02, D08, D23, custodia interna |
| SFSP-400 | `SFSP-400-MONETARY.md` | ORIGEN nativo con supply fijo, precio en gramín, comisión separada del gas, tesorería cotizadora, oráculo único; emisión contra reservas como histórico descartado | `draft-0.5`, alineada con v0.3 | actas de **D01** y **D02**, D23, parámetros de tesorería |
| SFSP-410 | `SFSP-410-SUPPLY-POLICY.md` | Política de suministro: circulante = usuarios; emisión bajo demanda dentro de cupo; quema al devolver; bóveda sellada de ORIGEN; transición desde el estado actual. **§3.2 revertido por el v0.3** | `draft-0.1`, propuesta 26-sep | **D23**, D24, D25, D26, D27, D07 |
| SFSP-500 | `SFSP-500-SETTLEMENT-FEES.md` | Mercado híbrido en Ordenex, reglas por clase, puerta única ORIGEN/fiat, DvP, `CashVault`, estados de orden y de ejecución, `UNKNOWN` como estado real, cotización de fee con TTL, patrocinio de gas, pago frente a comisión | `draft-0.5`, alineada con v0.3 | actas de D01 y D02, D15, licencias de Au Corp. |
| SFSP-600 | `SFSP-600-PRIVACY-TRANSPARENCY.md` | Línea base transparente, qué ve cada actor, metadatos y correlación, los dos prototipos no implementados, Tessera no es la base, qué se puede anunciar | `draft-0.4`, alineada con v0.2 | **D06**, D13, D14 |
| SFSP-700 | `SFSP-700-MIGRATION.md` | Migración dentro de la 5550 por acuñación a la misma dirección con cupo del padrón (ADR-016), catálogo de heredados, supply no ubicado, `FROZEN_SNAPSHOT` y `SURRENDER_ON_CLAIM`, conciliación `S0 = A + N + P`, anti doble derecho, journal | `draft-0.5`, alineada con v0.3 | **D26**, **D09**, D08, D25, D10, D14 |
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
| D23 | Adoptar SFSP-410 (circulante = usuarios) | 410, 200, 300, 400 | `SFSPNativeVault` y `mintOnDemand` en producción; cómo convive R1 con la tesorería del v0.3 §4.3 |
| D24 | Cupos y topes por activo | 410, 200, 700 | `setMintBudget`, `setReleaseBudget`, topes del instrumento |
| D25 | Cuentas internas | 410, 700 | Consolidar ORIGEN en la bóveda, circulante publicado, padrón de ONDK |
| **D26** | Migración de los tokens actuales y tratamiento de los heredados | **700** | Migración en la 5550 (ADR-016), inactivación de los heredados |
| D27 | Llaves operativas a multifirma y KMS | 410, 800 | Operación con llaves en variables de entorno |

Las series en **negrita** son aquellas cuyo núcleo queda bloqueado, no sólo un parámetro.

---

## 4 · Estado global de lo que la especificación describe

| Capacidad | Estado de evidencia | Dónde |
|---|---|---|
| Especificación escrita | `DECLARADO` | esta carpeta |
| Contratos desplegados en cualquier red | `NO_VERIFICADO` | ninguno |
| Enforcement técnico sobre activos legacy | `NO_VERIFICADO` | `enforcementScope` declara `directTransferBypass` |
| Privacidad | `NO_VERIFICADO` | SFSP-600; ambos prototipos sin implementar |
| Respaldo o cobertura | `BLOQUEADO` | ORIGEN no es respaldado (SFSP-400); AUKA y AGKA con 0 onzas custodiadas (SFSP-300) |
| Recuperación de activos | `BLOQUEADO` | SFSP-130; D19 pendiente |
| Migración de activos | `BLOQUEADO` | SFSP-700; D09 y D26 pendientes; conciliación de 804,5 ONDK y 9.823,01 AUKA abierta |
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
| `../adr/` | ADR-001 a ADR-016, con decisión, alternativas y riesgos. |
| `../sdk/` | Implementación de referencia y pruebas T57–T68. |
| `../contracts/` | Solidity: registro, emisión, gobierno, liquidación, migración. |
| `../indexer/`, `../dbnx-api/` | Consumidores de los eventos y los estados definidos aquí. |
| `../privacy/` | Prototipos y modelo de amenazas. Desactivado por defecto. |
| `../evidence/`, `../runbooks/`, `../fixtures/` | Evidencia sanitizada, operación y datos sintéticos etiquetados. |
