# SFSP-110 · Identity

| Campo | Valor |
|---|---|
| Serie | SFSP-110 · Identity |
| Estado | `draft-0.4` (alineada con el borrador SFSP v0.2) |
| Fuente de tipos | `CONTRATO-INTERNO.md` §1, §7 |
| Parte del plan maestro | P3 entregable 9, P5 pasos 1–3, §2.6 |
| Decisiones que la bloquean | D13 (identidad, jurisdicción, permisos y alcance RFSA/RFCA), D08 (elegibilidad por activo y país), D06 (alcance de privacidad), D17 (política de alias) |

**Desde el 25-sep:** los identificadores `did:sfsp` y las credenciales SFSP (en formato W3C DID y VC 2.0) que se proyectan en las atestaciones de esta serie están en **SFSP-160**. El GID sigue siendo la raíz privada: nunca se publica (SFSP-160 §2). Esta serie sigue gobernando Genesis ID, las atestaciones y la protección contra enumeración.

**Qué NO afirma este documento:** no afirma por sí solo compatibilidad W3C VC 2.0 (eso es SFSP-160), no afirma que exista un registro canónico de Genesis ID ya resuelto entre las dos implementaciones observadas, y no afirma que ninguna protección contra enumeración esté implementada o probada.

---

## 0 · Alineación con el borrador SFSP v0.2 (23-sep-2026)

> **Cómo leer esta sección.** El borrador SFSP v0.2 (`../fuente/`) es un borrador de trabajo: lo que sigue es **su posición**, llevada a esta serie. Hasta que la Junta lo firme, las decisiones afectadas siguen `PENDIENTE` en `../DECISIONES-SFSP.json` y todo lo que dependa de ellas devuelve `BLOCKED_DECISION`. Donde el v0.2 **cambia** una regla de más abajo, se dice aquí y la regla de abajo queda sustituida en cuanto se firme. La trazabilidad completa está en `../TRAZABILIDAD-SFSP-v0.2.md`.

| v0.2 | Efecto en esta serie |
|---|---|
| §11 · Estados de identidad: pendiente, en revisión, verificada, rechazada, vencida, suspendida | Son los estados canónicos (`ESTADOS-Y-EVENTOS.md`). El código de Genesis ID debe mapearse a estos seis sin estados propios fuera de la tabla |
| §11 · **Un solo puente** entre Genesis ID y Veta Wallet | Hoy hay dos con código divergente (`infra/genesis-proxy/genesis.router.js` y `infra/veta-wallet-backend/lib/genesisPuente.js`). Hasta unificarlos, la lectura de identidad para el protocolo es `UNKNOWN_SOURCE` si los dos discrepan |
| §11 · Cada vínculo registra la dirección de billetera | Condición del **límite de exposición por identidad** (SFSP-200 §0): sin la dirección en el vínculo, la exposición agregada no se puede calcular y la compra en Mercado de Crecimiento devuelve `BLOCKED_DECISION` |
| §11 · Desde la cadena no se sabe que dos direcciones son de la misma persona; esa relación vive en la base de Genesis ID | Coherente con los compromisos no enlazables de esta serie. El agregado por identidad se calcula **fuera de la cadena**, y a la cadena solo llega el resultado |
| §11 · Aprobación exclusivamente humana; bitácora firmada y anclada a diario | Se mantiene. Ninguna ruta automática emite `VERIFIED` |
| §11 · Recuperación con doble control y comprobante inmutable sin datos personales | Coherente con SFSP-130 y SFSP-800 |

---

## 1 · Principio canónico

> **SFSP Account != Genesis ID != Wallet Address != Private Key/Seed.**

SFSP-110 gobierna la capa **Genesis ID**. SFSP-130 gobierna la capa **SFSP Account**. Ninguna de las dos sustituye a la criptografía de la L1.

| Capa | Qué es | Qué NO es |
|---|---|---|
| Genesis ID | Identidad y compliance de la persona o empresa, privada por propósito | No es un identificador público, no es un vínculo universal de direcciones |
| SFSP Account | Identidad financiera persistente con número público | No es identidad personal, no contiene PII |
| Wallet Address | Ruta técnica en una red | No es la cuenta |
| Private Key / Seed | Material criptográfico | No es la identidad ni la cuenta |

---

## 2 · Genesis ID como fuente canónica

1. Genesis ID es la **fuente canónica de identidad y compliance** después de P5. Hasta entonces existen dos implementaciones observadas y la autoridad de datos no está resuelta.
2. Resolver cuál es canónica exige comparación de identidades, revocaciones, consentimiento y pruebas. Archivar la otra requiere verificar que ningún consumidor depende de ella, con aprobación. Un `grep` no lo demuestra.
3. Un GID estable **no** se publica como vínculo universal de todas las direcciones de una persona.
4. Jurisdicción y elegibilidad viven en Genesis ID y Compliance, y se consultan **por propósito**. El número de cuenta SFSP permanece universal y no codifica país, jurisdicción, tipo de persona ni nivel KYC.
5. En producción, si falta la base requerida, el servicio **no arranca** usando almacenamiento local efímero. Se exige escritura durable, control de versión, control de concurrencia y doble aprobación donde corresponda.

### 2.1 Referencia opaca

`SFSPAccount.genesisSubjectRef` es una referencia opaca al sujeto de Genesis ID.

| Dato | Dónde puede estar | Dónde nunca |
|---|---|---|
| `genesisSubjectRef` | Directorio privado | Ledger, eventos, API pública, QR, evidencia publicable |

El QR de SFSP contiene versión, `accountNumber` y checksum. No contiene PII ni `genesisSubjectRef`.

---

## 3 · Attestations

SFSP emite un **attestation mínimo** por propósito, audiencia, vigencia y política. El formato se llama **formato SFSP firmado**.

### 3.1 Campos mínimos

| Campo | Regla |
|---|---|
| `schemaVersion` | Obligatorio en toda estructura firmada. |
| propósito | Para qué se emite. Una attestation emitida para un propósito no se reutiliza en otro. |
| audiencia | Quién puede consumirla. Una attestation sin audiencia declarada no se acepta. |
| vigencia | `notBefore` y `expiry`. Una attestation vencida no resuelve. |
| política y versión | La versión de política con la que se emitió, para auditar la decisión contra su versión. |
| estado | Vigente, suspendida o revocada. |
| firma | Firma del emisor sobre el payload completo. |

### 3.2 Derivación por propósito y audiencia

1. Los datos mínimos se derivan **por propósito y audiencia**. No se entrega el expediente completo para responder una pregunta binaria.
2. Los documentos y la biometría quedan **fuera de la cadena**, siempre.
3. Una attestation responde una condición de elegibilidad; no transporta el dato que la sustenta salvo que el propósito lo exija y esté aprobado.
4. KYC/KYB, sanciones y cambios de titular requieren estados explícitos y revocación.

### 3.3 Revocación

1. La revocación es un estado explícito, no la ausencia de un registro.
2. Una attestation revocada deja de resolver de inmediato para toda audiencia.
3. El mecanismo de consulta de revocación no debe permitir enumeración (ver §4).
4. Una revocación se audita: quién, cuándo, motivo codificado, expediente. Sin datos personales en el registro publicable.
5. La expiración y la revocación son distintas. Una vencida puede renovarse; una revocada exige una nueva emisión con su propio expediente.

---

## 4 · Protección contra enumeración

La lectura de claims se protege contra enumeración. Requisitos mínimos:

1. La resolución de identidad exige un servicio **autenticado** y con **rate limit**.
2. Ningún endpoint devuelve listas de sujetos, de cuentas o de direcciones asociadas a un GID.
3. Conocer un `accountNumber` no permite conocer públicamente todas las wallets del mismo GID.
4. Una consulta de revocación no debe permitir barrer el espacio de identificadores. Los identificadores son de alta entropía y no secuenciales; eso reduce el barrido pero no lo sustituye por control de acceso.
5. Un `commitment` determinista y global **correlaciona personas**. Donde haga falta un compromiso público se usa aleatorización, y se documenta qué se puede inferir.
6. Un hash de un dato predecible se puede adivinar. No se usa un hash de un dato de baja entropía como pseudónimo.
7. Los agregados pequeños también pueden identificar personas. Un conteo por jurisdicción con pocos sujetos no es anónimo.

---

## 5 · Qué NO va on-chain

| Dato | Dónde puede estar | Dónde nunca |
|---|---|---|
| Semilla, llave privada | Custodia (KMS/HSM/MPC) | Código, pruebas, registros, evidencia, CI, staging, documentos |
| Datos personales, biometría, documentos | Genesis ID, bóveda cifrada | Cadena, eventos, índice público, evidencia publicable |
| `genesisSubjectRef` | Directorio privado | Ledger, API pública, QR |
| Vínculo cuenta ↔ dirección | Directorio privado, por propósito | Enumeración pública |
| `accountNumber` | Público, es un destino | n/a |
| Alias | Público | Como factor de autenticación |

Reglas adicionales:

1. `RecoveryExecuted` se emite con expediente y **sin** datos personales.
2. Ningún evento del §3 del contrato interno transporta PII.
3. La versión pública de la evidencia no contiene credenciales ni vínculos identidad-dirección.
4. Un secreto expuesto exige respuesta de incidente. Borrar el texto no lo revoca.

---

## 6 · Compatibilidad W3C VC 2.0

**Estado: objetivo, no afirmación.**

1. El formato emitido por SFSP se denomina **formato SFSP firmado**. Ese es el nombre que se usa en documentación, interfaz y contratos.
2. La compatibilidad con W3C Verifiable Credentials 2.0 se declara **sólo después de pruebas de perfil** que acrediten el perfil concreto, la suite de pruebas aplicada y sus limitaciones.
3. Hasta que exista esa evidencia, el estado es `NO_VERIFICADO` y no se anuncia compatibilidad, ni parcial, ni «basada en».
4. Una prueba de perfil que cubra un subconjunto habilita afirmar **ese subconjunto**, con su alcance explícito, no compatibilidad general.

---

## 7 · Relación con elegibilidad

1. Genesis ID provee los insumos; `EligibilityEngine` (SFSP-120) produce la decisión.
2. Una attestation vigente no es una decisión de elegibilidad: es un insumo con vigencia.
3. Un fallo al leer una attestation es `UNKNOWN_SOURCE`, nunca `DENY` silencioso ni `ALLOW`.
4. El ejecutor revalida al liquidar. Una attestation que venció entre la comprobación y la liquidación invalida la operación.

---

## 8 · Threat model de la capa de identidad

| Amenaza | Superficie | Mitigación declarada | Estado |
|---|---|---|---|
| Enumeración de sujetos | API de resolución y de revocación | Autenticación, rate limit, identificadores de alta entropía | `NO_VERIFICADO` |
| Correlación por commitment determinista | Compromisos públicos | Aleatorización del compromiso, documentar lo inferible | `NO_VERIFICADO` |
| Emisor engañoso | Documentos de onboarding | Expediente, verificación externa, `evidenceHash` que sólo prueba integridad | `NO_VERIFICADO` |
| Prompt injection en documentos | Análisis asistido | Documentos tratados como no confiables, límites de herramientas, citas al expediente | `NO_VERIFICADO` |
| Filtración de PII por evidencia | CI, logs, evidencia publicable | Perímetro del §5, escaneo de secretos, evidencia sanitizada | `NO_VERIFICADO` |
| Insider con acceso al directorio | Directorio privado | Separación de funciones, bitácora, acceso por propósito | `NO_VERIFICADO` |
| Reutilización de attestation fuera de audiencia | Consumidores | Audiencia y propósito en el payload firmado, verificación obligatoria | `NO_VERIFICADO` |

Ningún estado de esta tabla asciende por una afirmación en prosa.

---

## 9 · Pruebas de aceptación de la serie

1. **T-110-01**: Una attestation emitida para un propósito y audiencia es rechazada por un consumidor de otra audiencia. Ref. P5 paso 3.
2. **T-110-02**: Una attestation vencida no resuelve y produce `DENY_ELIGIBILITY` o `UNKNOWN_SOURCE` según el caso, nunca `ALLOW`. Ref. T25.
3. **T-110-03**: Una attestation revocada deja de resolver de inmediato para todas las audiencias. Ref. T25, T26.
4. **T-110-04**: La API de claims resiste una prueba de enumeración: no devuelve listas de sujetos y aplica rate limit. Ref. P5 paso 3, T51.
5. **T-110-05**: Ningún evento, log público ni artefacto de evidencia contiene `genesisSubjectRef`, PII ni biometría. Ref. T22, T52.
6. **T-110-06**: Conocer un `accountNumber` no permite obtener la lista de wallets del mismo GID por ninguna ruta pública. Ref. T63, T22.
7. **T-110-07**: Un fallo de lectura del proveedor de identidad produce `UNKNOWN_SOURCE` y no cero ni `ALLOW`. Ref. T47, regla 6 del plan.
8. **T-110-08**: Pruebas de falsos positivos y falsos negativos con datos controlados y sintéticos, sin documentos reales en CI. Ref. T51–T53.
9. **T-110-09**: Un commitment público generado dos veces para el mismo sujeto produce valores distintos (aleatorización) y no permite correlación directa. Ref. T22–T24.
10. **T-110-10**: La afirmación de compatibilidad W3C VC 2.0 permanece ausente de documentación e interfaz mientras el estado de la prueba de perfil sea `NO_VERIFICADO`. Ref. P5 paso 3.
11. **T-110-11**: El servicio de identidad no arranca en producción sin su base durable y no cae a almacenamiento local efímero. Ref. P5 paso 2.
12. **T-110-12**: Un documento con instrucciones maliciosas embebidas no produce ninguna acción automática ni cambia ninguna decisión. Ref. P3 entregable 9, P7c.

---

## 10 · Propuestas para el contrato interno

Integradas en `../CONTRATO-INTERNO.md` (punto C01 del plan de corrección). Esta
sección ya no propone nada: lo que este documento necesitaba está en el contrato
interno, que vuelve a ser la fuente única.

