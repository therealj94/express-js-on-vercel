# ADR-008: migración con dos modos y conciliación anti doble derecho

- Estado: **PROPUESTA** (bloqueada por D09; por activo también D08 y D03)
- Fecha: 2026-09-22 (UTC)
- Serie relacionada: SFSP-700 Migration
- Decisiones Dxx que lo bloquean: **D09** (modo, ratio, gas, corte y claims por activo). Relacionadas: D08, D03, D14.

## 1. Contexto

Sustituir técnicamente un activo por otro crea el riesgo central de toda migración: que el mismo derecho económico exista dos veces, una en el token viejo y otra en el nuevo. El riesgo no es teórico: basta con que el poseedor original venda el token viejo después de un snapshot informativo y reclame además el nuevo.

## 2. Decisión

### 2.1 Registrar no es migrar

La primera fase es registro sin movimiento (ADR-002) y creación de cuenta y binding sin tocar direcciones, semillas ni saldos. Sólo se migra un activo cuando hay una razón por la que registrar no basta.

### 2.2 Exactamente uno de dos modos por activo

**FROZEN_SNAPSHOT.** La congelación global debe ser **eficaz y jurídicamente válida**, verificada **antes** de habilitar reclamaciones. El snapshot final se toma con derechos ya estables, con árbol reproducible y con exclusión de custodia duplicada. No se mantiene a la vez el uso económico pleno del activo viejo.

**SURRENDER_ON_CLAIM.** El poseedor **actual** entrega los tokens válidos a un escrow de bytecode y poderes verificados, o los quema de forma comprobable, antes de la operación que habilita el nuevo derecho o en la misma operación. Un snapshot informativo no autoriza además al poseedor antiguo que ya vendió.

**Si no existe forma de exclusión, no se ejecuta migración automática.** Una dirección de "llave desconocida" no es un escrow verificable.

### 2.3 Conciliación

Expresada en unidades equivalentes del instrumento original:

```
S0 = A + E
E  = N + P
S0 = A + N + P
```

- `S0`: suministro o derecho incluido en el alcance aprobado.
- `A`: derechos originales todavía no extinguidos ni excluidos.
- `E`: derechos viejos excluidos de circulación económica por la migración.
- `N`: unidades nuevas válidas equivalentes ya emitidas.
- `P`: entitlements nuevos pendientes, correspondientes a derechos **ya excluidos**.

**`E` es la contraparte de `N + P`, no un tercer sumando de `S0`.** Sumar `E + N + P` es la ecuación equivocada. Con el ejemplo sintético del plan (`S0=1000, A=600, E=400, N=350, P=50`): se cumple `1000 = 600 + 350 + 50` y `400 = 350 + 50`; `E+N+P` daría 800 y no describe el suministro inicial.

Si la migración está completamente congelada, `A = 0` y `S0 = N + P`, con el tratamiento jurídico de `E` acreditado.

Los balances legacy que permanezcan en cadena bajo congelación se concilian técnicamente por separado: pasan a `E` económico **sólo cuando su exclusión está demostrada**, nunca por cambiar una etiqueta en el registro. Los ajustes ajenos a la migración se registran aparte y no modifican `S0` para hacer pasar la prueba.

### 2.4 Ratios, decimales y restos

Ratio racional explícito, decimales de origen y destino explícitos, y **regla de restos obligatoria**. Los derechos no se truncan en silencio: o la unidad de entitlement tiene precisión suficiente, o existe un registro de fracciones residual aprobado.

Los tokens con comisión en transferencia, con rebase o con proxy mutable no se habilitan por defecto: requieren soporte y pruebas específicas.

### 2.5 Firmas y ejecución

Las autorizaciones de reclamación incluyen red de origen y destino, registro, `migrationId`, beneficiario, ratio, nonce y vencimiento. **EIP-712 no aporta por sí solo un contador anti replay**: el nonce se consume explícitamente.

La ejecución lleva un diario por usuario y por operación con estado, bloque, prueba, nonce y txHash. Simulacro, lote canario y límites. Ante una diferencia o una transacción incierta se detiene; se reanuda desde las confirmaciones, no desde el principio. El token y el delta de unidad nativa y gas se comparan por separado. Un rebinding de identidad no autoriza una reclamación externa sin prueba de control y de exclusión previa.

### 2.6 Continuidad de derechos

**No hay pérdida de derecho por no reclamar a tiempo.** El diseño define y financia el mantenimiento de las reclamaciones y un mecanismo de continuidad jurídicamente aprobado, con los activos no reclamados segregados. No se promete que una página web funcionará eternamente.

## 3. Alternativas consideradas y su coste

| Alternativa | Coste |
|---|---|
| Snapshot informativo y emisión del nuevo token sin excluir el viejo | Doble derecho garantizado en cuanto alguien venda el token viejo. Prohibida. |
| Migración obligatoria global en una fecha | Exige congelación eficaz y jurídicamente válida de todos los activos a la vez y deja fuera a quien no actúe. Aceptable sólo como FROZEN_SNAPSHOT por activo, con base jurídica acreditada. |
| Migración voluntaria indefinida sin exclusión | Dos instrumentos con el mismo derecho conviviendo sin plazo, con precios divergentes y contabilidad imposible. Rechazada. |
| Escrow en una dirección sin llave conocida | No es verificable, no es reversible y no acredita exclusión. Rechazada explícitamente. |
| Dos modos con exclusión demostrada y conciliación `S0 = A + N + P` (elegida) | Más trabajo por activo y migraciones más lentas. Coste aceptado. |

## 4. Consecuencias

- Cada migración es un expediente por activo, con su propia aprobación D09. No hay una migración del ecosistema.
- La red congelada declarada (8532) exige revisar si existen derechos, usuarios externos o vías de cobro activas antes de cualquier retiro, y documentar el corte y la desactivación efectiva de toda vía de doble reclamación (DECLARADO que está congelada; **NO_VERIFICADO**).
- No se hace rollback de saldos on-chain como si fueran una base restaurable.
- Las pruebas de entitlement se distribuyen bajo acceso apropiado. No se publica información personal ni relaciones de clientes para hacer reproducible el árbol.

## 5. Riesgos aceptados y vencimiento

| Riesgo | Aceptación | Vence |
|---|---|---|
| La cobertura de titulares por logs de transferencia puede ser incompleta. | Se acepta declarar la incertidumbre en lugar de suponer que los logs prueban todo el suministro. | Al snapshot reproducible a bloque y hash comunes, dentro de P9a. |
| Un titular puede no reclamar nunca. | Se acepta mantener las reclamaciones abiertas con activos segregados. | Sin vencimiento automático; revisión anual con la autoridad que fije D09. |
| La validez jurídica de una congelación puede variar por jurisdicción. | Se acepta condicionarla a dictamen previo por activo. | Antes de habilitar reclamaciones en cada P9b. |

## 6. Bloqueo por decisión Dxx

**D09** bloquea cada P9b: modo, ratio, gas, corte y reclamaciones por activo. **D08** bloquea la clasificación y los derechos que la migración debe preservar. **D03** bloquea cualquier migración que toque la unidad nativa. **D14** bloquea el retiro de la red congelada y el descarte de su evidencia.

## 7. Estado

**PROPUESTA.** La conciliación es normativa y no espera a nadie; la ejecución espera a D09 por cada activo.
