# ADR-002: registro de activos legacy sin movimiento y límites de lo imponible

- Estado: **ACEPTADA**
- Fecha: 2026-09-22 (UTC)
- Serie relacionada: SFSP-100, SFSP-700
- Decisiones Dxx que lo bloquean: ninguna para la decisión en sí. D08 condiciona `legalClass` y la oferta; D19 condiciona cualquier promesa de recuperación. Ninguna de las dos cambia lo que técnicamente se puede imponer.

## 1. Contexto

El inventario de código declara catorce contratos más la unidad nativa (DECLARADO; inventario completo a bloque común, codehash, roles y titulares: NO_VERIFICADO). Esos contratos son ERC-20 ya desplegados, con titulares reales y saldos vivos.

La primera fase de adopción necesita catalogar esos activos sin tocar sus contratos ni sus balances. El error a evitar es que el acto de registrar se lea como que el activo ya obedece las reglas de SFSP.

## 2. Decisión

El registro es **metadato y evidencia sobre la ubicación actual del activo**. No mueve fondos, no cambia decimales, no redepliega y no altera roles.

Cada pasaporte declara sin adornos qué se puede imponer, mediante `enforcementScope`:

- `transferRestrictions`: falso en un ERC-20 legacy que no las implemente. No se declara verdadero porque el registro tenga una política escrita.
- `freeze`, `forcedTransfer`, `pause`: verdaderos sólo si existe el poder en el contrato y está documentado quién lo ejerce y bajo qué control.
- `directTransferBypass`: **verdadero en todo ERC-20 legacy**. `transfer` y `transferFrom` se llaman directamente al contrato y no pasan por ningún componente de SFSP. Una interfaz que oculte esa ruta no la elimina.
- `notes`: texto que describe rutas externas conocidas (puentes, escrows, allowances abiertas, wallets de contrato).

Lo que **no** se puede imponer sobre un ERC-20 existente, y así se documenta:

1. No se pueden bloquear transferencias directas entre EOAs.
2. No se pueden revertir transferencias ya confirmadas.
3. No se puede convertir una EOA en una cuenta recuperable.
4. No se pueden añadir restricciones de elegibilidad al camino `transfer` si el contrato no las consulta.
5. No se pueden cambiar decimales, símbolo ni supply. Si `decimals` es desconocido, se registra `null` y toda decisión financiera dependiente devuelve `UNKNOWN_SOURCE`. Nunca se sustituye por 18.
6. Registrar no produce la clasificación jurídica: el estado por defecto es `legal: UNCLASSIFIED`, `admission: DRAFT`, nunca `ACTIVE/SEC`.

## 3. Alternativas consideradas y su coste

| Alternativa | Coste |
|---|---|
| Envolver cada legacy en un wrapper obligatorio desde el inicio | Obliga a que cada titular actúe, crea dos representaciones simultáneas del mismo derecho, abre riesgo de doble circulación y exige el aparato completo de migración (ADR-008) antes de poder catalogar nada. Rechazada como primera fase. |
| Declarar enforcement en el registro y confiar en que la interfaz lo respete | Coste cero en ingeniería y coste máximo en veracidad: la restricción sólo existe mientras el usuario use la interfaz propia. Es una promesa falsable con una llamada RPC. Rechazada. |
| Usar poderes de administrador existentes para congelar activos legacy | Depende de que el poder exista (NO_VERIFICADO por contrato) y convierte al operador en parte con capacidad de mover bienes ajenos sin marco aprobado. Requiere D07 y D19. Fuera del alcance del registro. |
| Registro declarativo con `enforcementScope` honesto (elegida) | El catálogo muestra activos con enforcement nulo, lo que es menos vendible. Coste aceptado. |

## 4. Consecuencias

- La ficha de un activo legacy muestra el aviso de que las transferencias directas no pasan por SFSP.
- El registro es fuente del catálogo, capacidades y políticas declaradas. La cadena sigue siendo la fuente del saldo on-chain. Una caída del registro no vuelve inexistente un saldo conocido; se muestra la última lectura con marca de desactualizada y se bloquean las decisiones dependientes.
- Retirar un activo del catálogo (`trading: DELISTED`) no elimina saldo, documentos ni acceso del titular. `visibility` es un eje independiente.
- La compra nueva se bloquea donde falten derechos o política; la consulta y la tenencia no se bloquean.

## 5. Riesgos aceptados y vencimiento

| Riesgo | Aceptación | Vence |
|---|---|---|
| Existen rutas externas desconocidas (puentes, escrows, allowances) que el registro no enumera. | Se acepta registrar con `notes` incompleto y marca de cobertura parcial. | Al cierre del inventario P9a con snapshot reproducible a bloque y hash comunes. |
| Un titular puede interpretar el registro como una garantía de supervisión. | Se acepta mitigar con aviso explícito en la ficha y en los términos. | Revisión al cierre de P6, con prueba de comprensión de la interfaz. |
| Los poderes de administrador de cada contrato legacy son NO_VERIFICADOS. | Se acepta declarar `SIN_EVALUAR` en lugar de suponer ausencia de poderes. | Al inventario de roles por contrato, dentro de P9a. |

## 6. Bloqueo por decisión Dxx

La decisión no está bloqueada. Quedan bloqueadas capacidades derivadas: `legalClass` y la oferta por D08; cualquier promesa de recuperación por D19; un reemplazo técnico por D09.

## 7. Estado

**ACEPTADA.** Describe un límite técnico existente, no un parámetro a elegir.
