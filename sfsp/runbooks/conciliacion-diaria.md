# Runbook: conciliación diaria

**Regla base y la más importante: una diferencia nunca se cierra ajustando saldos de clientes.** Una diferencia se investiga, se explica y se corrige en el lugar donde está el error. Si el error está en un libro interno, se corrige ese libro con su asiento. Si está en la cadena, no se corrige: se registra y se compensa por un procedimiento aprobado.

---

## 1. Disparador

- Cierre diario programado.
- Tras cualquier incidente de los otros runbooks.
- Antes de habilitar una emisión, un release, una migración o una activación.

## 2. Precondiciones

1. Existe un bloque de corte común para todas las lecturas de cadena. Sin bloque común, las comparaciones no significan nada.
2. Los libros a comparar están identificados con su fuente autoritativa.
3. Las tolerancias están definidas **por par comparado** y aprobadas, no improvisadas en el momento.
4. Existe el diario de operaciones con su idempotencia.

## 3. Qué se compara

| Comparación | Lado A | Lado B | Fuente autoritativa |
|---|---|---|---|
| Suministro nativo | `S_native(b)` calculado | Lectura del nodo a bloque `b` | Cadena |
| Suministro por token | `totalSupply` del contrato | Suma de tenencias conocidas más incertidumbre declarada | Cadena para el suministro |
| Inventario de tesorería y vault | Registro interno | Saldo on-chain de las direcciones del vault | Cadena |
| Pasivos de cuentas | Suma de saldos internos de clientes | Activo de custodia correspondiente | Ambos lados deben cuadrar |
| Reservas asignadas | Expediente de reservas | Obligaciones que respaldan | Expediente, con evidencia vigente |
| Órdenes y ejecuciones pendientes | Libro del sistema de órdenes | Liquidaciones confirmadas | Cadena para lo liquidado |
| Entregas físicas | Obligaciones de entrega abiertas | Lotes reservados y no entregados | Custodio |
| Tarjetas y pagos | Diario de operaciones | Extracto del proveedor | Proveedor para lo liquidado |
| Depósitos multired | Diario de operaciones | Confirmaciones en cada red | Cada red |
| Comisiones | Comisiones registradas | Comisiones efectivamente cobradas | Recibos confirmados |
| Índice y cadena | Agregados del indexador | Lectura del nodo a bloque `b` | Cadena |
| Directorio de cuentas | Conteo de cuentas y bindings | Censo fechado anterior más altas y bajas | Directorio, con censo `N/N` |

Comparaciones adicionales obligatorias antes de una migración: la conciliación `S0 = A + N + P` de ADR-008, y el invariante de commodity de la serie respaldada.

## 4. Pasos

1. **Fijar el bloque de corte** y registrar número y hash.
2. **Tomar las lecturas** de cada lado, cada una con su marca de tiempo y su fuente. Una lectura fallida es `UNKNOWN`, y marca esa fila como no conciliada. **No se sustituye por cero.**
3. **Comparar en unidades base enteras.** Nunca en representación decimal ni en coma flotante. Si `decimals` es desconocido, la fila devuelve `UNKNOWN_SOURCE` y no se concilia.
4. **Clasificar cada diferencia** por su tolerancia (tabla siguiente).
5. **Investigar** cada diferencia fuera de tolerancia hasta su causa. Una diferencia sin causa identificada no se cierra.
6. **Corregir en el libro correcto**, con asiento, responsable y referencia al caso.
7. **Registrar** el resultado del día: filas conciliadas, filas con diferencia, filas `UNKNOWN`, acciones bloqueadas.

## 5. Tolerancias y qué bloquea cada una

Las tolerancias concretas las fija la política financiera y **dependen de decisiones pendientes**; aquí se define la estructura, no los números. Mientras no estén aprobadas, se aplica el criterio más restrictivo: cualquier diferencia bloquea la acción asociada.

| Nivel | Situación | Qué bloquea |
|---|---|---|
| **Verde** | Diferencia nula o dentro de tolerancia aprobada, con causa conocida y transitoria (por ejemplo, operaciones en vuelo). | Nada. Se registra. |
| **Ámbar** | Diferencia dentro de tolerancia pero sin causa identificada, o repetida varios días. | Bloquea emisión, release de tesorería y activación de capacidades nuevas. No bloquea operación corriente ni consulta. |
| **Rojo** | Diferencia fuera de tolerancia, o afecta a pasivos de clientes, reservas asignadas u obligaciones de entrega. | Bloquea toda acción que **aumente** la exposición: emisión, release, redención, migración, nuevas órdenes sobre el activo afectado. No bloquea la consulta de saldos ni el acceso del titular. |
| **`UNKNOWN`** | No se pudo leer un lado. | Bloquea las decisiones que dependan de esa fuente y sólo esas. El resto de la interfaz sigue utilizable. |

Reglas adicionales:

- Un déficit de cobertura bloquea las distribuciones afectadas y activa un plan de normalización.
- Una reserva vencida baja la capacidad. **No elimina el activo ni el derecho.**
- Una reserva ya asignada a una obligación no respalda además otra.
- Una transacción en `UNKNOWN` no se declara fallida ni se reintenta pagando otra vez.

## 6. Verificación

- Todas las filas del día tienen estado: conciliada, diferencia clasificada o `UNKNOWN`.
- Toda diferencia ámbar o roja tiene caso abierto con responsable y fecha.
- Las acciones bloqueadas están efectivamente bloqueadas en el sistema, no sólo anotadas.
- El bloque de corte quedó registrado con número y hash.

## 7. Criterio de parada

Se escala de inmediato y se detiene toda acción que aumente exposición si:

- Los pasivos de cuentas superan el activo de custodia correspondiente.
- Una reserva aparece asignada a más de una obligación.
- El suministro leído en cadena no coincide con el calculado y la diferencia no se explica.
- Una diferencia roja se repite tras una corrección.
- Aparece una diferencia en el saldo de un cliente concreto.

## 8. Qué NO hacer

- **No ajustar saldos de clientes para cuadrar.** Nunca, en ningún nivel, por ningún importe.
- No comparar lecturas tomadas a bloques distintos.
- No sustituir una lectura fallida por cero ni por el último valor conocido.
- No relajar una tolerancia para que la conciliación pase.
- No cerrar una diferencia con la etiqueta "residual" sin causa identificada.
- No modificar `S0` ni el alcance de una migración para que la ecuación cuadre.
- No declarar fallida una transacción cuyo estado es `UNKNOWN`.
- No usar el indexador como fuente autoritativa de un saldo on-chain.
