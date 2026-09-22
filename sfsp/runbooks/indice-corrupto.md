# Runbook: índice corrupto o atrasado

**Regla base:** el indexador es una vista derivada. La cadena es la fuente del saldo on-chain. **Un índice atrasado o corrupto no cambia los derechos de nadie, pero sí puede mostrar datos falsos y debe dejar de hacerlo antes que seguir sirviendo.**

---

## 1. Disparador

- El retraso respecto de la cabeza de cadena supera el umbral.
- Aparecen eventos duplicados o ausentes.
- Una reorganización de cadena deja el punto de control por delante del estado real.
- Una suma agregada no cuadra con la lectura directa del nodo.

## 2. Precondiciones

1. El indexador mantiene puntos de control por bloque y hash, no sólo por número.
2. La deduplicación es por `(chainId, blockHash, txHash, logIndex)`.
3. Hay un nodo de referencia autorizado contra el que comparar.
4. La interfaz sabe distinguir dato actual, dato desactualizado y dato no disponible.

## 3. Pasos

1. **Detectar el alcance:** retraso, huecos, duplicados o divergencia de valores.
2. **Marcar la vista como desactualizada** en todos los consumidores. **Bloquear las decisiones que dependan del índice**; mantener la consulta con la marca correspondiente.
3. **Localizar el último punto de control consistente**: aquel cuyo número **y hash** coinciden con los del nodo de referencia.
4. **Reconstruir desde ese punto.** Reprocesar eventos aplicando la deduplicación. Si hubo reorganización, revertir los eventos de los bloques que ya no están en la cadena canónica antes de aplicar los nuevos.
5. **Comparar contra el nodo** al terminar: totales por activo, conteos de eventos por tipo y muestreo de titulares.
6. **Reabrir** los consumidores por fases: primero lectura, después decisiones dependientes.
7. **Registrar** causa, alcance temporal, bloques afectados y diferencias encontradas.

## 4. Verificación

- El índice alcanza la cabeza de cadena y se mantiene dentro de umbral.
- Cero eventos duplicados bajo la clave de deduplicación.
- Cero huecos entre puntos de control.
- Los totales por activo coinciden con la lectura directa del nodo a un bloque común.
- Las diferencias que persistan están explicadas y documentadas.

## 5. Criterio de parada

Se detiene el servicio del índice y se escala si:

- La reconstrucción no converge con el nodo de referencia.
- Se detecta una reorganización más profunda que la ventana de puntos de control.
- El índice alimenta una decisión financiera y no se puede garantizar su exactitud.
- El nodo de referencia y el índice discrepan y no se puede determinar cuál está mal.

## 6. Qué NO hacer

- **No mostrar saldo cero porque el índice no tiene el dato.** Ausencia de dato es `UNKNOWN`, nunca cero.
- No confiar en un punto de control por número de bloque sin su hash.
- No parchear valores a mano en la base del índice para que cuadren.
- No usar el índice como fuente autoritativa de un saldo on-chain.
- No suponer que un portal que carga está mostrando datos actuales.
- No reanudar sin comparar contra el nodo.
