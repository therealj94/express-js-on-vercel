# ADR-005: recuperación son cuatro operaciones distintas, no una

- Estado: **ACEPTADA** (la separación conceptual está adoptada; cada política concreta depende de D10 y D19)
- Fecha: 2026-09-22 (UTC)
- Serie relacionada: SFSP-130 Account & Key Management
- Decisiones Dxx que lo bloquean: ninguna para la separación. **D10** y **D19** bloquean ejecutar recuperación de activos y prometerla; **D18** bloquea la rotación de material criptográfico a escala.

## 1. Contexto

La palabra "recuperar" se usa para cosas que no tienen la misma dificultad, ni la misma autoridad, ni el mismo resultado. Un usuario que dice "perdí mi cuenta" puede estar en cuatro situaciones incompatibles entre sí. Tratarlas como una sola produce dos fallos simétricos: prometer lo imposible, o negar lo que sí se puede hacer.

`DECISIONES-SFSP.json` ya adopta `recuperacionDistingue: [ACCESO, ROTACION_DE_CLAVE, REBINDING, RECUPERACION_DE_ACTIVOS]`.

## 2. Decisión

Se definen cuatro operaciones con entrada, autoridad, efecto y límite propios.

### 2.1 Recuperación de acceso

Restaura la sesión y el acceso a la cuenta SFSP tras verificar a la persona. **No cambia titularidad, no cambia dirección, no mueve activos y no exporta la semilla.** En perfil `MANAGED`, recuperar acceso no exige cambiar la dirección si la clave sigue disponible en custodia. Prueba asociada: T66.

### 2.2 Rotación de clave

Sustituye el material criptográfico que controla una dirección, o cambia el esquema de cifrado bajo el que ese material está guardado. Son dos cosas distintas: **migrar el cifrado no es rotar una llave comprometida.** La clave de descifrado antigua no se retira hasta demostrar cobertura y recuperación de copias y expedientes. Un registro que no descifre conserva acceso a sus derechos visibles y abre expediente manual; nunca se borra para cerrar un porcentaje.

### 2.3 Rebinding

Cambia la ruta técnica de la cuenta hacia otra dirección. El `accountNumber` no cambia (T62). El historial de bindings es inmutable. Un binding vencido o revocado no resuelve (T63). **Rebinding no mueve activos** (T64): los saldos que estén en la dirección anterior siguen ahí.

### 2.4 Recuperación de activos

Es la única que mueve valor y la única que puede ser imposible. Se resuelve por el par **(activo, perfil de custodia)**, nunca por uno solo de los dos, y se expresa en `recoveryCapability`:

| Capacidad | Significado |
|---|---|
| `ACCESS_ONLY` | Se recupera la sesión, no el control de la llave. |
| `CUSTODIAL_KEY_RECOVERY` | El custodio conserva el control de la llave y puede firmar bajo procedimiento. |
| `CONTRACT_RECOVERY` | El contrato del activo permite recuperación reglada. |
| `ADMIN_FORCED_TRANSFER` | Existe poder administrativo, está documentado y tiene autoridad aprobada. |
| `NONE` | No hay ruta técnica. La interfaz no promete nada. |

`PERSONAL` más activo legacy sin poderes es `NONE`, y así se muestra al usuario (T65).

### 2.5 Reglas comunes

- Toda recuperación exige `caseId`, evidencia, desafío independiente, aviso por canales previamente registrados, aprobación dual con separación de funciones, tiempo de espera proporcional al riesgo, posibilidad de disputa y registro.
- **Congelar un binding no detiene a quien conserva una llave externa** de un ERC-20 sin restricciones. El freeze afecta a la ruta de SFSP, no al contrato ajeno.
- `RecoveryExecuted` se emite con expediente y sin datos personales.
- Un fallo al descifrar es una excepción, nunca permiso para crear otra posición.

## 3. Alternativas consideradas y su coste

| Alternativa | Coste |
|---|---|
| Una sola operación "recuperar cuenta" con resultado variable | Coste de producto aparentemente bajo y coste real alto: genera promesas de recuperación de fondos que el sistema no puede cumplir en perfil `PERSONAL`, y expone a reclamaciones. Rechazada. |
| Recuperación universal mediante poder administrativo en todos los activos | Exige que ese poder exista en cada contrato (NO_VERIFICADO), concentra en el operador la capacidad de mover bienes ajenos y cambia el perfil de riesgo y el tratamiento legal de toda la plataforma. Requiere D07, D19 y revisión jurídica. Rechazada como diseño por defecto. |
| Migrar a todos los usuarios a instrumentos recuperables antes de ofrecer recuperación | Es el único camino que vuelve recuperable un activo hoy `NONE`, y cuesta una migración completa por activo con sus riesgos de doble derecho (ADR-008). Se conserva como opción por activo, no como requisito general. |
| Cuatro operaciones separadas con capacidad declarada por par (elegida) | Obliga a mostrar al usuario que hay casos irrecuperables. Coste aceptado. |

## 4. Consecuencias

- La interfaz calcula y muestra `recoveryCapability` antes de que el usuario pida ayuda, no después.
- Los runbooks se separan en tres casos operativos (acceso perdido custodial, llave o dirección comprometida, wallet externa sin llave). Ver `runbooks/recuperacion-de-cuenta.md`.
- Ningún texto de producto usa "recuperación" sin decir cuál de las cuatro.
- La matriz por par (activo, perfil) es un artefacto versionado con evidencia y autoridad por fila.

## 5. Riesgos aceptados y vencimiento

| Riesgo | Aceptación | Vence |
|---|---|---|
| Mientras D19 esté pendiente, la matriz sólo puede poblarse con `NONE` o `SIN_EVALUAR` para los activos legacy. | Se acepta mostrar `NONE` antes que suponer una ruta. | Con D19 aprobada por activo. |
| Un comentario histórico menciona una llave que no descifraba (DECLARADO). No prueba una pérdida actual ni permite ignorarla. | Se acepta abrir expediente específico y conservar los derechos visibles del registro. | Al cierre del expediente, dentro de P5. |
| El usuario puede leer `ACCESS_ONLY` como recuperación de fondos. | Se acepta mitigar con texto explícito y prueba de comprensión. | Revisión al cierre de P6. |

## 6. Bloqueo por decisión Dxx

**D10** bloquea la migración de llaves y la recuperación de activos. **D19** bloquea prometer recuperación de fondos y ejecutar recovery. **D18** bloquea la migración de material criptográfico a escala. **D07** bloquea los quórums de recovery fuera de fixtures sintéticos (`quorumRecovery` es `null`).

## 7. Estado

**ACEPTADA** en cuanto a la separación en cuatro operaciones y a la regla de capacidad por par. Toda ejecución concreta permanece bloqueada.
