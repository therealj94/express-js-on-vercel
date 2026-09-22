# SFSP-800 · Governance

| Campo | Valor |
|---|---|
| Serie | SFSP-800 · Governance |
| Estado | `draft-0.3` |
| Fuente de tipos | `CONTRATO-INTERNO.md` §1, §2.4, §3, §4 |
| Parte del plan maestro | P3 entregable 7, P4 (GovernanceController), P5 paso 5, §2.5, P11 |
| Decisiones que la bloquean | **D07 (quórums, firmantes, pausa, upgrade y recovery)**, D10 (custodia canónica), D18 (custodia MANAGED), D19 (recuperación por activo), D13 (autoridad legal), D11 (release source) |

**Qué NO afirma este documento:** no afirma que exista ningún quórum aprobado, ningún firmante designado, ninguna multisig auditada ni ningún poder de gobierno operativo; todos los quórums son `null`.

---

## 1 · Roles y separación de funciones

| Rol | Qué hace | Qué NO hace |
|---|---|---|
| **Junta** | Aprueba la acción empresarial, los parámetros económicos y el alcance | No reemplaza la revisión técnica, jurídica ni del custodio |
| **DBNX** | Recibe empresas, valida Genesis ID corporativo, revisa documentos, riesgos y derechos, y emite autorizaciones **dentro de su mandato documentado** | No ejecuta la parte tecnológica |
| **Orden Global (tecnología)** | Comprueba la autorización y ejecuta | No aprueba monetariamente |
| **Custodio o proveedor** | Da fe del hecho externo bajo su responsabilidad | No sustituye evidencia técnica |
| **Seguridad** | Revoca, rota, preserva evidencia, revisa alcance de incidentes | No aprueba emisiones |
| **Auditor independiente** | Revisa caminos críticos; **distinto del autor** | No firma aprobaciones operativas |
| **Asistentes y agentes (Ultron, Opus)** | Preparan análisis y referencias | **No son aprobadores monetarios ni reguladores.** No firman aprobaciones ni habilitan herramientas monetarias |

Reglas de separación:

1. **La aprobación humana y la validación técnica son dos actos distintos** y deben coincidir exactamente en el mismo payload (§3).
2. **Quien propone no aprueba.** Quien aprueba no ejecuta solo.
3. **Ni un score de un modelo ni un JSON con `approved: true` dan permiso de emisión.**
4. La versión exacta del modelo asistente se **verifica**, no se supone por el nombre.
5. `LegalApprovalRegister` documenta denominación, entidad autorizante, jurisdicción, actividades permitidas, restricciones transfronterizas y derechos de clientes. **No basta con dejar textos legales como parámetros.**

---

## 2 · Tabla de firmas críticas por acción

Los quórums son **parámetros pendientes de D07**. Esta tabla fija **qué roles deben concurrir**, no cuántas firmas.

| Acción | Roles que deben concurrir | Quórum | Timelock | Evento |
|---|---|---|---|---|
| `MINT` (emisión) | DBNX (autorización) + Tecnología (validación) + Junta si supera el límite aprobado | `quorumMint` = `null` | `null` | `SupplyAuthorized`, `MintExecuted` |
| `BURN` | Tecnología + DBNX | `null` | `null` | `BurnExecuted` |
| `RELEASE` (tesorería) | Junta + Tecnología + comprobación de reserva vigente | `null` (D03) | `null` | `TreasuryReleased` |
| `PAUSE` | Seguridad + Tecnología | `quorumPause` = `null` | ninguno (es una medida urgente) | `GovernanceAction` |
| `UNPAUSE` | Seguridad + Tecnología + Junta | `null` | `null` | `GovernanceAction` |
| `UPGRADE` | Junta + Tecnología + auditor independiente | `quorumUpgrade` = `null` | `timelockUpgradeSegundos` = `null` | `GovernanceAction` |
| `RECOVERY` (activos) | Seguridad + Legal + Operaciones, con aprobación dual y separación de funciones | `quorumRecovery` = `null` | espera por nivel de riesgo, `null` | `RecoveryExecuted` |
| `KEY_ROTATION` | Seguridad + Custodio | `null` | `null` | `GovernanceAction` |
| `POLICY_UPDATE` | DBNX + Tecnología | `null` | `null` | `PolicyUpdated` |
| `RISK_CHANGE` | Responsable de riesgo + DBNX | `null` | `null` | `RiskChanged` |
| `MIGRATION_CLAIM` (habilitación) | Junta + DBNX + Tecnología | `null` (D09) | `null` | `MigrationClaimed` |
| `FORCED_TRANSFER` | Legal + Seguridad + DBNX, con expediente | `null` (D19) | `null` | `RecoveryExecuted` |
| `QUORUM_CHANGE` | Junta + Seguridad | `null` | `null` | `GovernanceAction` |

**Mientras un quórum sea `null`, la acción devuelve `BLOCKED_DECISION`.** No se ejecuta con un quórum inventado, ni con el valor recomendado, ni «provisionalmente». En pruebas aisladas se admiten **fixtures sintéticos etiquetados**, que nunca son la configuración de producción.

---

## 3 · Autorizaciones firmadas

```ts
interface SignedAuthorization {
  schemaVersion: string;
  authorizationId: string;          // auth_ + 32 hex
  actionId: string;                 // MINT | RELEASE | RECOVERY | MIGRATION_CLAIM | ...
  chainId: number;
  genesisHash: string | null;
  verifyingContract: string;
  assetId: string;
  amount: string;                   // entero en unidades base, como cadena
  destination: string;
  policyVersion: string;
  evidenceRoot: string;
  nonce: string;
  notBefore: string;
  expiry: string;
  approvals: Approval[];            // firmas humanas y técnicas, separadas por rol
}
```

### 3.1 Campo por campo

| Campo | Regla |
|---|---|
| `schemaVersion` | Obligatorio. Un cambio de esquema es un payload distinto. |
| `authorizationId` | Único. Identifica la autorización a efectos de consumo y auditoría. |
| `actionId` | La acción concreta. Una autorización de `MINT` no sirve para `RELEASE`. |
| `chainId` | Explícito. Una autorización no cruza de red. |
| `genesisHash` | Cuando sea necesario distinguir redes con el mismo `chainId`. |
| `verifyingContract` | El contrato que verificará la firma. Fija el dominio. |
| `assetId` | El activo concreto. |
| `amount` | **Entero en unidades base, como cadena.** Nunca coma flotante. |
| `destination` | Destinatario explícito. No se resuelve por alias en el payload firmado. |
| `policyVersion` | La versión de política bajo la que se aprobó. |
| `evidenceRoot` | Raíz de la evidencia del expediente. |
| `nonce` | Anti replay explícito. Ver §4. |
| `notBefore` | Inicio de vigencia. |
| `expiry` | Fin de vigencia. Una autorización vencida no sirve. |
| `approvals` | Firmas **humanas y técnicas, separadas por rol**. |

### 3.2 Regla de coincidencia exacta

**La aprobación humana y la validación técnica deben coincidir exactamente en este payload.**

1. Un JSON con `approved: true` **no es una autorización**.
2. Un correo, un mensaje o una captura **no son una autorización**.
3. Una variable de entorno como `MIGRAR=si` **no basta**.
4. Si el humano aprobó un monto, una red, un destino o un activo distintos de los del payload, la autorización **no es válida**, aunque las firmas verifiquen.
5. La interfaz de aprobación muestra el payload completo que se firmará, no un resumen.

### 3.3 Qué exige toda escritura sensible

Aprobación de la operación, red, contrato, destinatario y monto; simulacro aprobado; límites; y estado previo verificado. **No hay escritura automática al cambiar una configuración.**

---

## 4 · Revocación y consumo de nonce

1. El `nonce` es **explícito**. **EIP-712 no aporta por sí mismo un contador anti replay.**
2. El consumo del nonce se **registra**. Un nonce consumido **no vuelve a servir**, aunque la firma siga siendo válida criptográficamente.
3. La **revocación es explícita**: una autorización se puede revocar antes de su `expiry`, y la revocación se registra y se comprueba en cada uso.
4. Una autorización **vencida, revocada o ya consumida** produce `DENY_AUTHORIZATION`.
5. El consumo es **idempotente por `operationId`**: reintentar la misma operación no acuña, libera ni transfiere dos veces.
6. El registro de nonces consumidos es **permanente** dentro del alcance de la autorización.
7. Una autorización parcialmente ejecutada registra la cantidad acumulada. La cantidad acumulada **nunca** supera `amount`.

---

## 5 · Upgrades

| Requisito | Regla |
|---|---|
| Timelock | Obligatorio. `timelockUpgradeSegundos` = `null`, pendiente D07. Sin valor, `BLOCKED_DECISION`. |
| Quórum | `quorumUpgrade` = `null`, pendiente D07. |
| Auditor | Un **auditor distinto del autor** revisa los caminos críticos. |
| Plan de reversión | Obligatorio y **probado** antes del upgrade. |
| Visibilidad | Un cambio que permita eludir un control requiere un **proceso excepcional visible**. |
| Evento | `GovernanceAction`. |

### 5.1 Plan de reversión

1. El plan de reversión se escribe y se prueba **antes** del upgrade, no después del fallo.
2. La reversión de la aplicación debe ser **compatible con los esquemas** de datos.
3. **El rollback del frontend o del backend no revierte transacciones ni borra eventos.** Las compensaciones financieras exigen un procedimiento aparte.
4. **No hay rollback de saldos on-chain** como si fueran una base restaurable.
5. Si el rollout falla: se para, se preserva el journal y se reconcilia.

### 5.2 Multisig

1. Se seleccionan **componentes multisig revisados**. **No se fabrica una multisig mínima para salvar una incompatibilidad de despliegue.**
2. Se verifican owners, thresholds, módulos, guards, rutas de upgrade y **todas** las rutas de ejecución.
3. Los mocks **no se vinculan a direcciones reales** por herencia accidental.

---

## 6 · Pausa

1. `PAUSE` es una medida urgente y **no lleva timelock**.
2. `UNPAUSE` sí requiere concurrencia de roles adicional.
3. Una pausa **no** elimina derechos, saldos ni documentos. La lectura de derechos no se suspende.
4. Toda pausa emite `GovernanceAction` con alcance y motivo codificado.

---

## 7 · Recuperación

Ver SFSP-130 §9 para la máquina completa. Requisitos de gobierno:

1. `caseId`, evidencia, challenge independiente, aviso por canales previos, **aprobación dual con separación de funciones**, tiempo de espera definido por riesgo, posibilidad de disputa y registro.
2. `quorumRecovery` = `null`, pendiente D07. La política por activo y perfil es pendiente D19.
3. `RecoveryExecuted` se emite **sin datos personales**.
4. **Congelar un binding no detiene por sí mismo** a quien conserva una llave externa de un ERC-20 libre.

---

## 8 · Llaves del nodo y llaves de fondos

Son dos modelos de amenazas distintos y no se confunden.

| Ámbito | Consideración |
|---|---|
| Llaves de consenso QBFT | Se comprueba la solución de módulo de seguridad del cliente y el HSM compatible. **Instalar un firmante remoto no cambia automáticamente la custodia de la llave de nodo.** |
| Llaves de fondos de clientes | Otro modelo de amenazas, otro signer, otra política de destinos y montos |

Ensayo de pérdida, rotación y recuperación: **una entidad a la vez y sin sacrificar el quórum**.

Con siete validadores, la tolerancia presupone participación y fallos no excesivamente correlacionados. **No se vende el conteo como descentralización demostrada.**

---

## 9 · Puerta de release (P11)

Toda producción pasa por P11. No existe una autorización global para ejecutar despliegues, activar flags o modificar contratos.

1. `releaseId`, propietario, alcance, tickets y hallazgos, SHA, digest, config, entorno y red. Se revisa el estado de las decisiones que habilitan **exactamente** ese alcance.
2. Pruebas, seguridad, manifiesto, servicios dependientes, capacidad del proveedor y procedimiento de rollback compatible con los esquemas. Se selecciona un artefacto previo **verificado**.
3. Aprobación humana de la operación. Para fondos, parámetros, permisos, llaves o derechos: aprobación especializada adicional y límites por acción. **No se ejecuta desde una sesión de agente con permiso ambiguo.**
4. **Se construye una vez y se promueve el artefacto probado.** Los scripts se inspeccionan antes de usarse.
5. Canary y lectura en sombra antes de la activación amplia. **Para un cambio financiero, ninguna verificación canary usa dinero real sin autorización expresa y límites.**
6. Si falla: parar, preservar el journal, reconciliar. **No se publica un sello desacoplado del artefacto para aparentar procedencia.**
7. Cierre al responsable con versión efectiva, pruebas, decisiones, resultados, discrepancias y límites. **Una compuerta no se cierra con una captura ni con un mensaje de un asistente.**

**La autorización P11 tiene alcance y caducidad.** No habilita la siguiente release automáticamente.

### 9.1 Trazabilidad

```
fuente -> commit -> build reproducible -> digest de artefacto
       -> configuración versionada sin secretos -> despliegue -> comprobación
```

Una rama llamada `main` o la salida de un agente **no es por sí sola la verdad de producción**. Un SHA de fuente **no es** un hash de bytecode: el runtime bytecode se verifica con sus parámetros, inmutables y metadatos de compilación.

---

## 10 · Parámetros pendientes

| Parámetro | Valor | Decisión |
|---|---|---|
| `quorumMint` | `null` | D07 |
| `quorumRecovery` | `null` | D07 |
| `quorumPause` | `null` | D07 |
| `quorumUpgrade` | `null` | D07 |
| `timelockUpgradeSegundos` | `null` | D07 |
| Firmantes designados y sus roles | `null` | D07 |
| Tiempo de espera de recuperación por riesgo | `null` | D07 / D19 |
| Custodia canónica y excepciones | `null` | D10 |
| Arquitectura de custodia MANAGED | `null` | D18 |
| `LegalApprovalRegister` poblado | `null` | D13 |
| Release source por servicio | `null` | D11 |

---

## 11 · Pruebas de aceptación de la serie

1. **T36**: Una autorización vencida, revocada o con el nonce ya consumido produce `DENY_AUTHORIZATION` en el contrato y en el SDK.
2. **T-800-02**: Una autorización cuyo `amount`, `destination`, `assetId` o `chainId` difiera de lo aprobado por el humano se rechaza aunque las firmas verifiquen. Ref. T36.
3. **T-800-03**: Un JSON con `approved: true` no habilita ninguna acción por ninguna ruta. Ref. T36, T50.
4. **T-800-04**: Un replay de la misma firma con el nonce ya consumido se rechaza; el registro de nonces es permanente. Ref. T36.
5. **T-800-05**: Una autorización parcialmente ejecutada acumula la cantidad y nunca supera su `amount`. Ref. T34.
6. **T-800-06**: Reintentar la misma operación con el mismo `operationId` no produce una segunda emisión, liberación ni transferencia. Ref. T48.
7. **T-800-07**: Con cualquier quórum en `null`, la acción correspondiente devuelve `BLOCKED_DECISION` y no se ejecuta con un valor recomendado. Ref. T50.
8. **T-800-08**: Un upgrade sin timelock configurado se rechaza; con timelock, no se ejecuta antes de cumplirse el plazo. Ref. T37.
9. **T-800-09**: El plan de reversión existe y se ha probado antes del upgrade; una reversión de aplicación no revierte transacciones ni borra eventos. Ref. T33, T49.
10. **T-800-10**: Las rutas de ejecución de la multisig (owners, thresholds, módulos, guards, upgrade) se enumeran y se prueban; ninguna omite los controles. Ref. T37.
11. **T-800-11**: Un mock no queda vinculado a una dirección real por herencia; la prueba lo verifica sobre el despliegue. Ref. T34.
12. **T-800-12**: `PAUSE` no elimina saldos, documentos ni la lectura de derechos. Ref. T06, regla 6 del plan.
13. **T-800-13**: Una recuperación con una sola firma no avanza; la aprobación dual con separación de funciones es obligatoria. Ref. T-130-16, T36.
14. **T-800-14**: `RecoveryExecuted` no contiene datos personales en ningún campo. Ref. T52.
15. **T-800-15**: La verificación de release compara runtime bytecode contra el build identificado; un SHA de fuente no se acepta como prueba. Ref. T31, T32.
16. **T-800-16**: Una release sin las decisiones Dxx de su alcance aprobadas no pasa P11. Ref. T31, T50.
17. **T-800-17**: Una separación de funciones violada (mismo actor propone y aprueba) se detecta y se rechaza. Ref. T53.

---

## 12 · Propuestas para el contrato interno

1. **`Approval`**: el §2.4 del contrato interno referencia `approvals: Approval[]` pero no define la estructura. Se propone: `approverRef`, `role`, `actionId`, `scope`, `limit`, `destination`, `environment`, `version`, `notBefore`, `expiry`, `evidenceId`, `nonce` y firma.
2. **`ApprovalRole`**: `BOARD` / `DBNX` / `TECH` / `SECURITY` / `LEGAL` / `OPERATIONS` / `CUSTODIAN` / `AUDITOR`.
3. **`AuthorizationState`**: `ISSUED` / `ACTIVE` / `PARTIALLY_CONSUMED` / `CONSUMED` / `REVOKED` / `EXPIRED`.
4. **`GovernanceActionKind`**: enumeración de las acciones de la tabla del §2, para que `GovernanceAction` lleve un tipo estable.
5. **`LegalApprovalRegister`**: estructura con denominación, entidad autorizante, jurisdicción, actividades permitidas, restricciones transfronterizas, derechos de clientes, vigencia y evidencia.
6. **`releaseId`**: identificador con forma `rel_` + 32 hex, usado por P11 y hoy sin forma declarada.

Ninguna se usa como si existiera hasta que se agregue a `CONTRATO-INTERNO.md`.
