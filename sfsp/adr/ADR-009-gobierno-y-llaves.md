# ADR-009: gobierno, multisig, timelock y separación de custodias

- Estado: **PROPUESTA** (bloqueada por D07 y D18)
- Fecha: 2026-09-22 (UTC)
- Serie relacionada: SFSP-800 Governance, SFSP-900 Operations
- Decisiones Dxx que lo bloquean: **D07** (quórums, firmantes, pausa, upgrade y recovery), **D18** (arquitectura final de custodia gestionada). Relacionadas: D10, D19.

## 1. Contexto

Los poderes críticos del protocolo (autorizar emisión, liberar tesorería, pausar, actualizar, ejecutar recuperación, cambiar quórum) no pueden depender de una sola firma ni de una sola persona.

Al mismo tiempo, la red QBFT necesita llaves de validador, y la plataforma necesita firmar operaciones sobre fondos de clientes. **Son dos modelos de amenaza distintos y no comparten custodia.**

Todos los valores de quórum y de timelock están en `null` en `DECISIONES-SFSP.json`.

## 2. Decisión

### 2.1 Multisig revisada, no fabricada

Los poderes críticos se ejercen desde componentes multisig revisados y de uso conocido. **No se fabrica una multisig mínima propia para salvar una incompatibilidad de despliegue.** Si hay incompatibilidad, se ajusta el toolchain (ADR-001).

De cada multisig se verifican: propietarios, umbral, módulos, guards, ruta de actualización y todas las rutas de ejecución. Un auditor distinto del autor revisa los caminos críticos.

### 2.2 Timelock en los cambios irreversibles

Actualización de implementación, cambio de quórum, cambio de firmantes y cambio de políticas críticas pasan por un retardo publicado que permita observar y objetar. La duración es `timelockUpgradeSegundos`, hoy `null` y fijada por D07. Pausa y detención de emergencia pueden ser inmediatas; reanudar no lo es.

### 2.3 Separación entre autorización de negocio y ejecución técnica

- DBNX recibe empresas, valida su identidad corporativa, revisa documentos, riesgos y derechos, y emite autorizaciones **dentro de su mandato documentado**.
- Orden Global comprueba la autorización y ejecuta la parte tecnológica.
- Un proveedor o custodio da fe del hecho externo bajo su responsabilidad.
- El asistente analítico prepara referencias y análisis. **No firma aprobaciones ni habilita herramientas monetarias.** Ni una puntuación automática ni un JSON con `approved: true` conceden permiso de emisión.

La aprobación humana y la validación técnica deben coincidir **exactamente** en el mismo payload de `SignedAuthorization` (`actionId`, `chainId`, `verifyingContract`, `assetId`, `amount`, `destination`, `policyVersion`, `evidenceRoot`, `nonce`, `notBefore`, `expiry`). Revocación y consumo de nonce son explícitos.

### 2.4 Tres custodias separadas

| Custodia | Protege | Modelo de amenaza | No comparte |
|---|---|---|---|
| Llaves de validador QBFT | Continuidad del consenso | Disponibilidad y corrección del bloque; colusión de validadores | Ni material, ni módulo, ni operador, ni procedimiento con las otras dos |
| Llaves de gobierno del protocolo | Poderes críticos sobre contratos | Colusión de firmantes, coacción, insider | Operadores con la custodia de fondos |
| Llaves de fondos de clientes | Saldos de terceros | Robo, exfiltración, uso indebido, error operativo | Nada con validadores |

Puntos concretos: **instalar un firmante remoto no cambia por sí mismo la custodia de la llave de nodo.** Hay que comprobar la solución de módulo de seguridad del cliente y la compatibilidad de hardware. El ensayo de pérdida, rotación y recuperación se hace **una entidad a la vez y sin sacrificar quórum**.

### 2.5 El material secreto nunca sale

Semillas y llaves privadas viven en el módulo de custodia. No entran en código, pruebas, registros, evidencia, integración continua, staging ni documentos. Una prueba de custodia usa material sintético generado en el acto.

El diseño objetivo de la custodia gestionada **no** mantiene indefinidamente todas las semillas descifrables con una sola contraseña maestra de aplicación (ver ADR-012).

### 2.6 Los poderes se declaran

Cada pasaporte declara qué poderes existen sobre el activo. Un poder existente y no declarado es un hallazgo, no un detalle.

## 3. Alternativas consideradas y su coste

| Alternativa | Coste |
|---|---|
| Firma única operativa con control de proceso | Coste operativo mínimo y riesgo concentrado en una persona y un dispositivo. Rechazada para poderes críticos. |
| Multisig propia escrita a medida | Ahorra una dependencia y añade un contrato con poder máximo sin historial de revisión. Rechazada explícitamente. |
| Sin timelock, con multisig alta | Permite una actualización instantánea frente a un incidente y también una captura instantánea si el umbral se compromete. Rechazada para cambios irreversibles; se conserva la pausa inmediata. |
| Custodia unificada para validadores y fondos | Simplifica operación y une dos superficies de ataque que no tienen nada que ver. Rechazada. |
| Multisig revisada más timelock más tres custodias separadas (elegida) | Más operadores, más procedimiento, respuesta más lenta. Coste aceptado. |

## 4. Consecuencias

- Hasta D07 no se ejercen poderes críticos fuera de fixtures sintéticos. Los contratos se prueban con quórums de prueba etiquetados como tales.
- `GovernanceAction` registra pausa, actualización, rotación y cambio de quórum.
- La tolerancia del consenso con el número de validadores declarado presupone participación y fallos no demasiado correlacionados. El conteo no se presenta como descentralización demostrada.
- Se identifican dependencias compartidas de cuenta de nube, región, DNS, credenciales, facturación y hardware entre validadores.

## 5. Riesgos aceptados y vencimiento

| Riesgo | Aceptación | Vence |
|---|---|---|
| La topología actual del firmante y el censo de excepciones son NO_VERIFICADOS. | Se acepta levantar el estado por métricas agregadas, sin extraer llaves. | Al cierre del censo en P5. |
| Los validadores pueden compartir proveedor, región o credenciales. | Se acepta documentarlo antes de corregirlo. | Al mapa de dependencias de P10. |
| Sin D07, los umbrales usados en pruebas no representan producción. | Se acepta sólo con etiqueta de fixture sintético. | Con D07 aprobada. |

## 6. Bloqueo por decisión Dxx

**D07** bloquea poderes críticos fuera de fixtures sintéticos. `quorumMint`, `quorumRecovery`, `quorumPause`, `quorumUpgrade` y `timelockUpgradeSegundos` son `null`. **D18** bloquea la arquitectura final de la custodia gestionada. **D10** bloquea la custodia canónica y sus excepciones.

## 7. Estado

**PROPUESTA.** La separación de custodias y la regla del payload idéntico pueden aplicarse ya en diseño y pruebas; los valores esperan a D07.
