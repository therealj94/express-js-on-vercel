# SFSP-800 · Governance

> **Enmienda SFSP-410 (propuesta, 26-sep-2026, pendiente D23 y D07):** acciones nuevas `SET_MINT_BUDGET`, `SET_RELEASE_BUDGET` (doble control **y espera**) y `RELEASE_NATIVE` (doble control). Cortar un cupo lo puede hacer un solo firmante; desmarcar una cuenta interna sólo la Junta. El ISSUER de servicio ejecuta dentro del cupo y no aprueba nada. Tabla completa en `spec/SFSP-410-SUPPLY-POLICY.md` §5.

| Campo | Valor |
|---|---|
| Serie | SFSP-800 · Governance |
| Estado | `draft-0.4` (alineada con el borrador SFSP v0.2) |
| Fuente de tipos | `CONTRATO-INTERNO.md` §1, §2.4, §3, §4 |
| Parte del plan maestro | P3 entregable 7, P4 (GovernanceController), P5 paso 5, §2.5, P11 |
| Decisiones que la bloquean | **D07 (quórums, firmantes, pausa, upgrade y recovery)**, D10 (custodia canónica), D18 (custodia MANAGED), D19 (recuperación por activo), D13 (autoridad legal), D11 (release source) |

**Qué NO afirma este documento:** no afirma que exista ningún quórum aprobado, ningún firmante designado, ninguna multisig auditada ni ningún poder de gobierno operativo; todos los quórums son `null`.

---

## 0 · Alineación con el borrador SFSP v0.2 (23-sep-2026)

> **Cómo leer esta sección.** El borrador SFSP v0.2 (`../fuente/`) es un borrador de trabajo: lo que sigue es **su posición**, llevada a esta serie. Hasta que la Junta lo firme, las decisiones afectadas siguen `PENDIENTE` en `../DECISIONES-SFSP.json` y todo lo que dependa de ellas devuelve `BLOCKED_DECISION`. Donde el v0.2 **cambia** una regla de más abajo, se dice aquí y la regla de abajo queda sustituida en cuanto se firme. La trazabilidad completa está en `../TRAZABILIDAD-SFSP-v0.2.md`.

### 0.1 Roles y límites (v0.2 §5)

| Rol | Puede | No puede |
|---|---|---|
| DBNX | Admitir, clasificar, autorizar supply, evaluar riesgo, exigir reporte, suspender | Emitir ni acuñar; administrar el negocio del emisor; valuar cuando el emisor es del ecosistema |
| Orden Global | Desplegar módulos, ejecutar emisiones autorizadas, operar nodos y liquidación, operar MyTokenPay | Crear supply sin autorización de DBNX; valuar; administrar recursos de terceros |
| Au Corp. (por Ordenex y AuBank) | Operar el mercado secundario (Ordenex); custodia y moneda fiduciaria (AuBank) | Admitir ni clasificar; valuar; acuñar; ser fuente del registro |
| **AU-RA FP** (antes Ultron FP) | Analizar documentación, detectar inconsistencias, proponer clasificación y riesgo, generar listas de verificación | **Aprobar, firmar emisiones, mover fondos u omitir controles** |
| Custodios y atestadores | Acreditar metal, efectivo, lotes y vigencia | Emitir tokens |
| Emisor | Presentar, reportar, ejecutar acciones corporativas | Cambiar derechos o riesgo sin proceso formal |
| Adquirente | Adquirir, mantener, transferir, ejercer derechos | Eludir elegibilidad o restricciones |
| Auditor y autoridad | Acceso ampliado con procedimiento | Acceso ilimitado sin registro ni fundamento |

**Denominación:** DBNX es operador y entidad de autorregulación del Mercado de Valores Inclusivo. **«Regulador» queda reservado a RFSA.** La escala R1–R5 es clasificación interna de admisión divulgada con advertencia, no calificación de agencia.

### 0.2 Regla de control y firmas críticas (v0.2 §5.2 y §5.3)

Ninguna llave individual puede crear oferta monetaria, modificar reservas, reescribir identidad, forzar una transferencia **ni alterar la lista de permisos de la red**.

| Acción | Control mínimo |
|---|---|
| Emisión de security | Autorización de DBNX + ejecución de Orden Global + verificación de política |
| Emisión de commodity | Lote verificado + atestación del custodio + doble autorización |
| Ampliación de supply | Gobernanza + divulgación + demora programada + mayoría calificada |
| Transferencia por recuperación | Reverificación de identidad + doble control + demora proporcional al riesgo |
| Pausa de emergencia | Firma múltiple rápida + código de motivo + vencimiento y revisión + estado público |
| Actualización de módulo | Propuesta versionada + evidencia de pruebas + demora + plan de reversión |
| **Permisos de red o filtro de transacciones** (SFSP-150) | Firma múltiple + código de motivo + registro público |
| **Habilitación de módulo por licencia** (SFSP-140) | Acción registrada con código de motivo y número de licencia |
| **Cambio de estado de un país** (SFSP-120) | Acción registrada con su fundamento |

Firmantes y umbrales por acción: **`null` (D07)**. `SFSPGovernanceController` ya implementa propuesta, aprobación, demora programada y pausa que caduca; falta cargarle los firmantes reales.

---

## 1 · Roles y separación de funciones

| Rol | Qué hace | Qué NO hace |
|---|---|---|
| **Junta** | Aprueba la acción empresarial, los parámetros económicos y el alcance | No reemplaza la revisión técnica, jurídica ni del custodio |
| **DBNX** | Empresa aparte. Recibe empresas, valida Genesis ID corporativo, revisa documentos, riesgos y derechos, emite autorizaciones **dentro de su mandato documentado**, es la única que escribe pasaportes y publica los datos de cada activo | No ejecuta la parte tecnológica. No admite ni audita activos que ella emita |
| **AU-RA FP (operador del protocolo)** | Presta los servicios de SFSP a todas las empresas, comprueba la autorización, ejecuta y vigila el cumplimiento (ADR-014) | No aprueba monetariamente. No se audita a sí mismo |
| **Orden Global** | Dueña de Veta Wallet, de la cadena y de la tesorería. Su Junta aprueba lo que es suyo | No certifica sus propias reservas ni ejecuta sola su propia liberación |
| **AuCorp** | Dueña de Ordenex y de la plataforma fiat | No decide qué activos son aptos para listarse en su propio mercado |
| **Custodio o proveedor** | Da fe del hecho externo bajo su responsabilidad | No sustituye evidencia técnica |
| **Seguridad** | Revoca, rota, preserva evidencia, revisa alcance de incidentes | No aprueba emisiones |
| **Auditor independiente** | Revisa caminos críticos; **distinto del autor** | No firma aprobaciones operativas |
| **Asistentes y agentes (la asistente AU-RA y el copiloto de admisión de AU-RA FP, Opus)** | Preparan análisis y referencias | **No son aprobadores monetarios ni reguladores.** No firman aprobaciones ni habilitan herramientas monetarias |

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

## 12 · Autorización ligada al contenido (SFSP-AUTH-v1)

**Normativo.** Añadido tras la auditoría del commit `f1d57a31`, que encontró la
misma raíz en siete hallazgos: H01, H02, H04, H05, H06, H18 y H19. En todos
ellos la autorización se identificaba por una clave que **no compromete el
contenido** de lo que se va a hacer —un `operationId`, un `bytes32(amount)`, un
`migrationId`, un tipo de acción— y en algunos no se consumía una sola vez.

Implementación de referencia: `contracts/src/lib/SFSPAuthorization.sol` y
`sdk/src/autorizacion.ts`. Vectores compartidos:
`fixtures/vectores-autorizacion.json`.

### 12.1 Forma canónica

```
digest = keccak256(abi.encode(
    ETIQUETA_DOMINIO,      // keccak256("SFSP-AUTH-v1")
    TYPEHASH_PAYLOAD,      // keccak256(cadena de tipo del §12.2)
    chainId, verifyingContract,
    action, assetId,
    origin, destination,
    amount, amountSecondary,
    nonce, notBefore, expiry,
    evidenceRoot))
```

Catorce palabras de **32 bytes exactos**, en ese orden, sin excepción.

**Prohibido `abi.encodePacked` y toda concatenación equivalente.** Concatenar
campos de longitud variable sin prefijo de longitud permite reagrupar dos
contenidos distintos en la misma cadena de bytes: `action="AB", assetId="C"` y
`action="A", assetId="BC"` producirían el mismo digest, y una aprobación para
uno habilitaría el otro. Con posición fija por campo la reagrupación es
imposible por construcción, no improbable.

**La etiqueta de dominio está versionada.** Cambiar la versión cambia la
etiqueta e invalida de golpe toda aprobación emitida bajo la anterior. Es el
comportamiento deseado: un formato nuevo no puede reinterpretar aprobaciones
viejas.

**El typehash entra en el digest.** Así el formato queda comprometido junto con
los valores: añadir un campo cambia el typehash, y ninguna aprobación anterior
se puede releer contra el formato nuevo.

### 12.2 Campos

Cadena de tipo, byte a byte idéntica en las dos implementaciones:

```
SFSPAuthPayload(uint256 chainId,address verifyingContract,bytes32 action,
bytes32 assetId,address origin,address destination,uint256 amount,
uint256 amountSecondary,bytes32 nonce,uint64 notBefore,uint64 expiry,
bytes32 evidenceRoot)
```

| Campo | Obligatorio | Qué impide que se cambie después |
|---|---|---|
| `chainId` | sí | Presentar en una red una aprobación emitida para otra. |
| `verifyingContract` | sí | Usar la aprobación en otro contrato del mismo despliegue. |
| `action` | sí, no nulo | Ejecutar un `BURN` con una aprobación de `MINT`. |
| `assetId` | sí, no nulo | Cerrar contra B una reserva abierta sobre A (H18). |
| `origin` | sí; puede ser la dirección cero | Confiscar o quemar el saldo de otro titular (H01, H02). El cero es legítimo cuando la acción no tiene origen —`MINT` crea unidades, no las mueve desde nadie— y ese cero también se compromete. |
| `destination` | sí | Desviar el destino de lo aprobado (H01). |
| `amount` | sí | Reutilizar la aprobación para otra operación del mismo monto (H06). |
| `amountSecondary` | sí; 0 si no aplica | Cambiar el efectivo o el precio de una liquidación ya aprobada (H05). |
| `nonce` | sí, no nulo | Que dos autorizaciones idénticas en todo lo demás colapsen en un digest y la segunda sea irrepresentable tras consumir la primera. Es también lo que ata una reanudación a **su** incidente (H19). |
| `notBefore` | sí | Adelantar la ventana. |
| `expiry` | sí, `> notBefore` | Extender la ventana. |
| `evidenceRoot` | opcional; 0 = ausente | Añadir o quitar la evidencia asociada después de aprobada. Aunque sea opcional, **entra siempre en el digest**. |

Vigencia: `notBefore` es **inclusivo** y `expiry` es **exclusivo**, para que dos
ventanas consecutivas de la misma acción no compartan nunca un segundo.
`block.timestamp` lo elige el productor del bloque dentro de un margen: la
ventana es un control grueso y **no sustituye al consumo único**.

### 12.3 El ejecutor recalcula

```
aprobar(digest)   →   ejecutar(payload) recalcula el digest desde sus
                      argumentos REALES, compara, comprueba atadura y
                      vigencia, y lo consume
```

1. El aprobador aprueba un **digest**, nunca un identificador.
2. El ejecutor **recalcula** el digest desde los argumentos que va a ejecutar.
   No lee el digest de la petición. Si se limitara a confiar en el digest
   recibido, H01 volvería con más ceremonia.
3. El digest se **consume una sola vez**, como efecto y antes de cualquier
   interacción externa (checks-effects-interactions).

Un intento fallido **no** gasta la autorización: un payload alterado, una
ventana cerrada o una atadura equivocada rechazan sin consumir, para que un
tercero no pueda quemar una aprobación legítima presentándola mal.

Todo rechazo lleva `DENY_AUTHORIZATION` (§4 del contrato interno), con motivo
estable: `CHAIN_MISMATCH`, `CONTRACT_MISMATCH`, `ACTION_EMPTY`, `ASSET_EMPTY`,
`NONCE_EMPTY`, `WINDOW_EMPTY`, `NOT_YET_VALID`, `EXPIRED`, `DIGEST_MISMATCH`,
`CONSUMED_AT:<t>`. Un reloj ilegible es `UNKNOWN_SOURCE` y nunca se degrada a
`ALLOW`.

### 12.4 Prohibición explícita

**Ninguna acción crítica puede autorizarse por una clave que no comprometa el
contenido.** Quedan prohibidos como control de autorización, por sí solos:

- `operationId` y cualquier identificador arbitrario elegido por el llamador.
  Es idempotencia, no autorización: impide repetir, no impide sustituir.
- `bytes32(amount)` o cualquier proyección de un solo campo.
- `migrationId`, que además abre un dominio de nullifier nuevo por migración y
  permite reemplazar dos veces la misma posición de origen (H04). El nullifier
  se deriva de la **posición de origen**, globalmente, no del identificador de
  la migración.
- El tipo de acción sin el objeto concreto sobre el que se actúa (H19).
- Un registro `approved: true`, un `detail` de texto libre o un hash genérico
  que no sea el digest de §12.1.

**Ninguna implementación redefine el digest por su cuenta.** Las dos
implementaciones de referencia se comprueban contra los mismos vectores, y la
prueba que exige que coincidan es obligatoria: si Solidity y TypeScript
divergen en un vector, la suite se pone roja en los dos lados.

### 12.5 Acciones críticas y su control mínimo (P03)

La fila F9 de `AFIRMACIONES-A-DESAFIAR.md` quedó **refutada en su alcance
universal**: existen rutas críticas gobernadas por un solo rol, entre ellas la
pausa y la quema. La regla se corrige aquí:

> **Toda acción crítica lleva doble control.** No sólo la transferencia forzada.
> Doble control significa quórum de aprobadores con **separación de funciones**:
> quien propone no aprueba, y un mismo actor no cuenta dos veces por llevar dos
> roles.

| Acción | `action` | Control mínimo | Qué compromete el digest |
|---|---|---|---|
| Emisión | `MINT` | Doble control + autorización de capacidad vigente | activo, destino, monto, nonce, ventana |
| Quema | `BURN` | Doble control **o** autorización del titular; motivo obligatorio | activo, titular (`origin`), monto, motivo en `evidenceRoot`, nonce |
| Transferencia forzosa | `FORCED_TRANSFER` | Doble control + expediente | activo, origen, destino, monto, nonce |
| Pausa | `PAUSE` | Doble control | alcance de la pausa en `assetId`, incidente en `nonce` |
| Reanudación | `UNPAUSE` | Doble control, atada al **incidente concreto** | el `nonce` de la pausa que levanta |
| Actualización | `UPGRADE` | Doble control + timelock | implementación destino, versión, nonce |
| Recuperación | `RECOVERY` | Doble control + separación de funciones + espera | cuenta, activo, destino, expediente, nonce |
| Migración | `MIGRATION_CLAIM` | Doble control + nullifier por posición de origen | posición de origen, beneficiario, unidades, raíz de prueba |
| Release de tesorería | `TREASURY_RELEASE` | Doble control + techo y capacidad vigentes | activo, monto, nonce, ventana |
| Liquidación | `SETTLE_DVP` | Orden autorizada por ambas partes + contrato canónico | activo, partes, cantidad, efectivo, nonce |
| Cambio de quórum | `SET_QUORUM` | Doble control con el quórum **anterior** | acción afectada, valor nuevo, nonce |
| Cambio de política | `SET_POLICY` | Doble control | política, versión anterior y nueva, nonce |

Los quórums concretos de cada fila son `null` hasta **D07**. Una acción con su
quórum sin fijar devuelve `BLOCKED_DECISION` y **no** se ejecuta con un valor
recomendado (§10, T-800-07). Que el control mínimo esté escrito aquí no lo
convierte en un número aprobado.

### 12.6 Pruebas de aceptación añadidas

18. **T-800-18**: Los vectores compartidos de `fixtures/vectores-autorizacion.json`
    producen el mismo digest en Solidity y en TypeScript. Una divergencia en un
    solo vector pone roja la suite en los dos lados. Ref. T36.
19. **T-800-19**: Cambiar un solo campo del payload cambia el digest, campo por
    campo, incluidos `amountSecondary` y `evidenceRoot`. Ref. T-800-02.
20. **T-800-20**: Una aprobación legítima no ejecuta un payload que difiera en
    un campo; el intento fallido **no** consume la autorización. Ref. T-800-02.
21. **T-800-21**: El segundo consumo del mismo digest revierte en cadena y
    devuelve `DENY_AUTHORIZATION` en el SDK. Ref. T-800-04.
22. **T-800-22**: Un payload vencido y uno aún no vigente se rechazan, con
    `notBefore` inclusivo y `expiry` exclusivo. Ref. T36.
23. **T-800-23**: Dos payloads que una concatenación sin prefijo de longitud
    confundiría producen digests distintos. Ref. T-800-02.
24. **T-800-24**: Ninguna acción de la tabla de §12.5 se ejecuta con un solo
    rol. Ref. T53, F9. **Pendiente**: esta prueba exige los ejecutores reales y
    entra con el lote de contratos, no con el patrón.

---

## 13 · Propuestas para el contrato interno

Integradas en `../CONTRATO-INTERNO.md` (punto C01 del plan de corrección). Esta
sección ya no propone nada: lo que este documento necesitaba está en el contrato
interno, que vuelve a ser la fuente única.

