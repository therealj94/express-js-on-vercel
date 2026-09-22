# ADR-013: autorización ligada al contenido

- Estado: **PROPUESTA** (el patrón está escrito y probado; los quórums que lo parametrizan están bloqueados por D07)
- Fecha: 2026-09-22 (UTC)
- Serie relacionada: SFSP-800 Governance, §12
- Decisiones Dxx que lo bloquean: **D07** (quórums por acción, timelock y firmantes designados). Secundariamente **D11** y **D12** para el despliegue de los ejecutores que lo usen.
- Origen: auditoría independiente de Codex sobre el commit `f1d57a31751f22d9f21060a8b1f945412f80d4bb`, hallazgos H01, H02, H04, H05, H06, H18 y H19, y punto P03 del plan de corrección.

## 1. Contexto

Siete de los nueve P0 de la auditoría son el mismo defecto contado siete veces.
En todos, la autorización se identifica por una clave que **no compromete el
contenido** de lo que se va a hacer:

| Hallazgo | Se identificaba por | Debía comprometer |
|---|---|---|
| H01 | `operationId` de la propuesta | activo, origen, destino, monto, acción |
| H02 | nada más que el rol `ISSUER` | activo, titular, monto, motivo |
| H04 | `migrationId` arbitrario | la posición de origen, globalmente |
| H05 | lo que pasa el operador | contrato canónico, partes, cantidades, precio |
| H06 | `bytes32(amount)` | dominio, contrato, acción, activo, partes, nonce, vencimiento |
| H18 | sólo el monto de la reserva | activo y monto |
| H19 | el tipo de acción `UNPAUSE` | la pausa concreta que levanta |

La consecuencia práctica es la misma en los siete: **una aprobación legítima
para un contenido habilita la ejecución de otro contenido distinto.** El
aprobador humano mira una pantalla que dice una cosa y el ejecutor hace otra, y
no hay ningún punto del sistema donde esas dos cosas se comparen.

A esto se suma que la vigencia sin consumo único no cierra nada: H19 es
exactamente una aprobación de reanudación que sobrevive a la pausa que levantó y
sirve para el siguiente incidente.

Nada de esto está desplegado ni hay una sola cuenta conectada. Lo urgente no es
reparar producción: es no seguir construyendo encima.

## 2. Decisión

**Se adopta un digest canónico tipado que compromete el contenido completo, y el
ejecutor lo recalcula desde sus argumentos reales antes de actuar.**

La forma normativa vive en `spec/SFSP-800-GOVERNANCE.md` §12. Las dos
implementaciones de referencia son `contracts/src/lib/SFSPAuthorization.sol` y
`sdk/src/autorizacion.ts`, y comparten los vectores de
`fixtures/vectores-autorizacion.json`.

Tres compromisos, y los tres son obligatorios:

1. **El aprobador aprueba un digest, no un identificador.** El digest cubre
   dominio versionado, typehash, red, contrato verificador, acción, activo,
   origen, destino, dos montos, nonce, ventana de vigencia y raíz de evidencia.
2. **El ejecutor recalcula.** Deriva el digest de los argumentos que va a
   ejecutar y lo compara con el aprobado. No lee el digest de la petición.
3. **El digest se consume una vez**, como efecto y antes de cualquier
   interacción externa. Un intento fallido no lo gasta.

Y dos reglas de codificación que no son de estilo:

- **`abi.encode`, nunca `abi.encodePacked`.** Catorce palabras de 32 bytes en
  posición fija. Concatenar campos de longitud variable sin prefijo de longitud
  permite reagrupar dos contenidos en la misma cadena de bytes.
- **El typehash entra en el digest.** Añadir un campo cambia el typehash, y
  ninguna aprobación vieja se puede reinterpretar contra el formato nuevo.

Se adopta además la corrección de alcance de P03: **todas** las acciones
críticas llevan doble control con separación de funciones, no sólo la
transferencia forzada. La tabla está en §12.5 de SFSP-800.

## 3. Alternativas consideradas, y lo que cuestan

### 3.1 Seguir identificando por `operationId` — lo que había. **Rechazada.**

Es lo que produjo H01. Un `operationId` es un identificador que elige el
llamador; no dice nada de lo que se va a hacer. Sirve para **idempotencia**:
impide que la misma operación se ejecute dos veces. No sirve para
**autorización**: no impide que, bajo ese identificador, se ejecute otra cosa.

Coste de mantenerla: cero de implementación, y el sistema entero de aprobación
queda ceremonial. Un aprobador que firma «operación `op_a1b2…`» no ha aprobado
ningún contenido. La barrera comprueba que exista una propuesta aprobada, no que
la transacción sea la que los aprobadores autorizaron.

Se conserva `operationId` **para lo que sirve**: la unidad de idempotencia del
§1 del contrato interno. Deja de ser un control de autorización.

### 3.2 Firmar el payload con EIP-712 y nada más. **Rechazada como suficiente.**

EIP-712 ya está en el árbol (`contracts/src/lib/SFSPEIP712.sol`) y da atadura de
dominio y firma estructurada. Es necesario y se seguirá usando para el
transporte de firmas humanas.

Pero no cierra el hallazgo por sí solo, por dos razones que el propio archivo ya
documenta: **no da anti-replay**, y una firma válida sobre un payload no obliga
a nadie a ejecutar **ese** payload. Sin recálculo en el ejecutor y sin consumo
único, una firma legítima sigue siendo presentable junto a otros argumentos.

Coste de haberla tomado como suficiente: una sensación de cobertura
criptográfica sobre el mismo defecto.

### 3.3 Que el aprobador firme la calldata completa. **Rechazada.**

Firmar los bytes exactos de la llamada ata la ejecución con total precisión.

Coste: la calldata incluye el selector y el orden de argumentos de una firma de
función concreta. Cualquier refactor —añadir un parámetro, reordenar, cambiar el
nombre— invalida todas las aprobaciones en vuelo sin que nadie lo haya decidido.
Además la calldata no es legible: el aprobador humano no puede verificar en su
pantalla qué está firmando, y volveríamos a aprobar un hash opaco. El digest
tipado da la misma atadura y sí es reconstruible campo a campo desde una
interfaz.

### 3.4 Un Merkle root de acciones aprobadas por lote. **Aplazada.**

Permite aprobar muchas operaciones con una firma y consumir hojas de una en una.

Coste hoy: añade un modo de fallo —una prueba de inclusión mal construida— y un
estado extra por lote, para resolver un problema de volumen que este sistema no
tiene. Nada está desplegado. Si algún día hay volumen, la hoja del árbol puede
ser exactamente este digest, así que la decisión no se cierra: se aplaza.

### 3.5 Delegar el control a una multifirma externa. **Rechazada como sustituto.**

Una multifirma bien configurada da quórum y separación de funciones.

Coste: da quórum sobre **una transacción**, no sobre un contenido comparable en
el ejecutor. La T-800-10 ya exige enumerar sus rutas (owners, thresholds,
módulos, guards, upgrade) porque cualquiera de ellas puede omitir los controles.
La multifirma es complementaria: aporta el quórum del §12.5, no el vínculo con
el contenido.

### 3.6 Guardar el payload completo en cadena y compararlo campo a campo. **Rechazada.**

Es la versión literal de «comprometer el contenido».

Coste: almacenamiento por autorización y una comparación campo a campo que hay
que mantener sincronizada a mano en cada ejecutor; olvidar un campo en una
comparación es invisible y reintroduce el defecto en un solo sitio. El digest
hace la comparación indivisible: o coinciden los catorce campos o no coincide
nada.

## 4. Consecuencias

### Lo que mejora

- Una aprobación deja de poder servir para otro payload que difiera en un solo
  campo, incluidos `amountSecondary` y `evidenceRoot`.
- La reanudación queda atada a su incidente por el `nonce` (H19), la reserva a
  su activo (H18), la quema a su titular (H02), la liquidación a su precio (H05).
- Existe **una sola** definición del digest, escrita dos veces y comprobada
  contra los mismos vectores. Una divergencia entre Solidity y TypeScript rompe
  las dos suites, así que no puede pasar inadvertida.
- El patrón habilita el lote de firmas de la API (`crypto.verify` con Ed25519
  sobre este mismo digest) y el lote de contratos.

### Lo que cuesta

- **Todo ejecutor debe reescribirse** para recalcular y consumir. Mientras no se
  reescriban, los hallazgos siguen abiertos: este ADR escribe el patrón, no lo
  aplica. Los siete P0 se cierran en el lote de contratos y en el de la API.
- Las interfaces de aprobación tienen que mostrar los doce campos y poder
  reconstruir el digest, o el aprobador humano volverá a firmar un hash opaco.
  Un digest que nadie puede verificar en pantalla traslada el problema, no lo
  resuelve.
- Cambiar el formato invalida las aprobaciones en vuelo, por diseño. Eso obliga
  a una ventana de migración explícita cada vez que se toque el typehash.
- El registro de consumo crece sin límite y no se puede purgar: una entrada
  borrada es una autorización que vuelve a valer. El coste de almacenamiento es
  permanente y se acepta.

## 5. Riesgos aceptados, con vencimiento

| Riesgo | Por qué se acepta hoy | Vence cuando |
|---|---|---|
| El patrón está escrito y probado, pero **ningún ejecutor lo usa todavía**. Los siete hallazgos siguen abiertos en el código. | Aplicarlo a los ejecutores y escribir el patrón a la vez habría mezclado dos revisiones. Nada está desplegado. | Se cierre el lote de contratos. Hasta entonces, ningún hallazgo se marca cerrado. |
| El `keccak256` del SDK está **escrito a mano** y sólo se contrasta con un puñado de vectores (P04). Todo el digest de TypeScript descansa en él. | La coincidencia con Solidity sobre 20 vectores es evidencia fuerte, aunque indirecta: la implementación de cadena es independiente. | Se cierre P04 con el juego completo de vectores oficiales o una sustitución revisada. |
| La ventana de vigencia depende de `block.timestamp`, que el productor del bloque elige dentro de un margen. | Es un control grueso, y el consumo único no depende del reloj. | No vence: se documenta y se compensa con el consumo único. Las ventanas no se fijan por debajo del margen del productor. |
| El registro de consumo del SDK vive **en memoria** de un proceso. | Es la implementación de referencia, no el adaptador de producción. | Se cierre P01 con el adaptador durable y su índice único en base, con prueba. |
| Los **quórums** de la tabla de §12.5 son `null`. | No se elige un valor por defecto para un parámetro de gobierno (§8 del contrato interno). | **D07**. Hasta entonces cada acción devuelve `BLOCKED_DECISION`. |
| La sonda `SFSPAuthorizationProbe` vive en `src/` junto a la biblioteca. | Una biblioteca `internal` no es llamable desde fuera, y sin ella la prueba cruzada no se podría escribir. No tiene roles, ni saldos, ni participa en ninguna ruta de dinero. | Se separe a un directorio de sondas cuando exista uno, o se marque como no desplegable en la puerta de release (P11). |

## 6. Qué decisión Dxx lo bloquea

**D07** fija los quórums por acción, el timelock de actualización y los
firmantes designados con sus roles. Sin D07, la tabla de §12.5 describe el
control mínimo pero no puede ejecutarse: toda acción crítica devuelve
`BLOCKED_DECISION`.

El patrón del digest **no** depende de D07 y se adopta ya: qué se compromete es
una propiedad del formato, no un parámetro de gobierno.

**D11** y **D12** bloquean el despliegue de los ejecutores que lo usarán, no el
patrón.

## 7. Referencias

- `spec/SFSP-800-GOVERNANCE.md` §12 — forma normativa y tabla de acciones críticas.
- `contracts/src/lib/SFSPAuthorization.sol` — implementación de cadena.
- `sdk/src/autorizacion.ts` — implementación de SDK.
- `fixtures/vectores-autorizacion.json` — vectores compartidos, sintéticos.
- `contracts/test/09-authorization.js`, `sdk/src/test/autorizacion.test.ts` — la prueba cruzada.
- `auditoria/informes/auditoria-20260922-f1d57a31-codex.md` — H01, H02, H04, H05, H06, H18, H19 y la fila F9.
- ADR-008 (migración y anti-doble-derecho) y ADR-009 (gobierno y llaves), que este ADR corrige en el punto de la identificación de la autorización.
