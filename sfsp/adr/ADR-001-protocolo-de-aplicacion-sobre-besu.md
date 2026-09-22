# ADR-001: SFSP es un protocolo de aplicación sobre Besu/EVM/QBFT, sin fork del cliente

- Estado: **ACEPTADA**
- Fecha: 2026-09-22 (UTC)
- Serie relacionada: SFSP-100 Core
- Decisiones Dxx que lo bloquean: ninguna para la decisión en sí. D16 (resolver o sustituir la especificación OGFP v1.0) condiciona las referencias normativas, no la capa elegida.

## 1. Contexto

La infraestructura de partida se describe como una red Besu con consenso QBFT y siete validadores (DECLARADO; versión de cliente, génesis, reglas de emisión y validadores efectivos: NO_VERIFICADO en este entorno, que no tiene accesos de red).

Sobre esa base existen contratos ERC-20 y una unidad nativa. El requisito de negocio es tener reglas financieras propias: pasaportes de activo, políticas, autorizaciones firmadas, elegibilidad, liquidación y evidencia. Existe la tentación de resolverlo cambiando el nombre de la capa de ejecución o modificando el cliente para incorporar reglas de negocio al consenso.

## 2. Decisión

SFSP se implementa como **protocolo de aplicación**: contratos, registros, servicios y esquemas que corren sobre la EVM existente. No se hace fork del cliente Besu, no se modifica el consenso QBFT y no se cambia el génesis para introducir semántica financiera.

Consecuencias directas de la decisión:

- Los contratos legacy siguen siendo ERC-20. Registrarlos en SFSP no cambia su bytecode ni su comportamiento.
- Las reglas propias se obtienen implementando comprobaciones verificables en contratos y servicios, no renombrando interfaces. Decir "no es ERC-20" cuando se expone un adaptador ERC-20 de interoperabilidad está prohibido: el perfil técnico declara lo que hay.
- El toolchain se fija a lo que el nodo real soporte. Solidity `0.8.28` y EVM target `paris` son la configuración propuesta por compatibilidad conservadora; no se asumen opcodes posteriores hasta verificar la versión efectiva del cliente (NO_VERIFICADO).

## 3. Alternativas consideradas y su coste

| Alternativa | Coste |
|---|---|
| Fork del cliente Besu con reglas SFSP en el consenso | Obliga a mantener un cliente propio, coordinar actualización simultánea de todos los validadores, repetir auditorías de consenso y asumir divergencias con el upstream. Cualquier error de regla se convierte en un problema de cadena, no de aplicación. Rechazada. |
| Cadena nueva propia con su génesis y su moneda | Migración total de posiciones y derechos, pérdida de continuidad histórica, doble operación durante un período indefinido y una decisión monetaria que hoy no existe (ver ADR-006 y D03). Rechazada para este plan. |
| Renombrar EVM/ERC-20 en la documentación y la interfaz | Coste bajo en trabajo e inaceptable en veracidad: no añade ni una comprobación. Produce afirmaciones falsables ante cualquier lectura del bytecode. Rechazada. |
| Protocolo de aplicación sobre la cadena existente (elegida) | Limita lo que se puede imponer sobre activos preexistentes (ver ADR-002) y exige declarar explícitamente ese límite en cada pasaporte. Coste aceptado. |

## 4. Consecuencias

- Toda garantía de SFSP alcanza sólo a los activos con `implementationProfile = SFSP_ENFORCED` y a las rutas que pasen por sus contratos.
- Un activo `LEGACY_REGISTERED` recibe catálogo, documentación y políticas declaradas; no recibe enforcement.
- La red, el gas y la finalidad siguen siendo los de la cadena existente. SFSP no puede prometer finalidad ni disponibilidad distintas de las del consenso subyacente.
- Cualquier incompatibilidad de despliegue se resuelve ajustando el toolchain, nunca fabricando un contrato mínimo para esquivar la incompatibilidad.

## 5. Riesgos aceptados y vencimiento

| Riesgo | Aceptación | Vence |
|---|---|---|
| El perfil de ejecución real del nodo (versión, opcodes, límites de gas) es NO_VERIFICADO y podría rechazar el bytecode compilado. | Se acepta para seguir desarrollando en entorno aislado. | Al primer despliegue en devnet desechable con lectura de la versión efectiva del cliente. Antes de P4 cerrado. |
| El consenso QBFT con siete validadores declarados tiene una tolerancia que depende de participación y de fallos no correlacionados (DECLARADO). | Se acepta no tratar el conteo como descentralización demostrada. | Al cierre de P10, con el censo de validadores y sus dependencias compartidas verificado. |

## 6. Bloqueo por decisión Dxx

Ninguna decisión pendiente bloquea esta ADR. D16 debe resolverse antes de cerrar G1 si persisten contradicciones normativas entre esta ADR y la especificación OGFP v1.0 referida y no localizada (DECLARADO por el plan maestro; texto íntegro NO_VERIFICADO).

## 7. Estado

**ACEPTADA.** No depende de ningún valor de `DECISIONES-SFSP.json` que hoy sea `null`.
