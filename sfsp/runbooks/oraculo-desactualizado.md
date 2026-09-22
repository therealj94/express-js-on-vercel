# Runbook: oráculo desactualizado o en discrepancia

**Regla base:** un precio viejo no se sustituye por un valor inventado ni por el último conocido sin marca. Una lectura que no se pudo obtener es `UNKNOWN_SOURCE`, y `UNKNOWN_SOURCE` bloquea la decisión que dependa de ella. **Nunca se degrada a `ALLOW` ni a cero.**

---

## 1. Disparador

- Una fuente supera su umbral de frescura.
- Dos fuentes difieren más allá del umbral de desviación.
- Una fuente devuelve error, un valor fuera de rango o un valor constante sospechoso.
- El mercado de origen está cerrado y la política no contempla ese horario.

## 2. Precondiciones

1. Cada magnitud está declarada por separado: precio de referencia, cotización de ejecución, valuación de reserva y liquidez disponible. No se derivan unas de otras.
2. Cada fuente tiene registrados su origen real, su frecuencia, su horario de mercado y su umbral de frescura y de desviación.
3. Está documentado qué consumidores dependen de cada magnitud.
4. **D01 y D04 están pendientes**: los parámetros económicos son `null` y cualquier cálculo que dependa de ellos ya devuelve `BLOCKED_DECISION`.

## 3. Pasos

1. **Identificar qué magnitud falla** y qué consumidores dependen de ella.
2. **Poner la fuente en cuarentena.** Deja de alimentar decisiones, sigue registrándose para diagnóstico.
3. **Comprobar independencia real de las fuentes alternativas.** Dos interfaces de programación **no son dos fuentes independientes si comparten el mercado de origen**. Si el precio de un activo tokenizado se toma como precio del token, se declara así; si el par cotiza contra una moneda estable, hay que comprobar la paridad de esa moneda contra la referencia, no suponerla.
4. **Bloquear las decisiones dependientes** con `UNKNOWN_SOURCE` o `BLOCKED_DECISION` según el caso, dejando el resto de la interfaz utilizable. La consulta de saldos y documentos no se suspende.
5. **Mostrar la última lectura con su marca de tiempo y la etiqueta de desactualizada**, sin usarla para autorizar nada.
6. **Diagnosticar y restablecer** la fuente. Si estuvo manipulada, tratarlo como incidente de seguridad.
7. **Revisar retroactivamente** qué operaciones se ejecutaron en la ventana afectada y si alguna usó un valor fuera de política. Documentar el impacto; no ajustar saldos de clientes.

## 4. Verificación

- La fuente restablecida entrega valores dentro de umbral durante una ventana de observación antes de volver a alimentar decisiones.
- Las cotizaciones emitidas durante la incidencia caducaron o fueron canceladas, y ninguna se ejecutó fuera de su vigencia.
- El registro muestra qué decisiones quedaron bloqueadas y por cuánto tiempo.

## 5. Criterio de parada

Se detienen las operaciones dependientes si:

- No queda ninguna fuente dentro de umbral.
- Las fuentes disponibles resultan no independientes.
- Se sospecha manipulación.
- La discrepancia afecta a la valuación de reservas que sostiene una capacidad de release o de emisión.

## 6. Qué NO hacer

- **No inventar un valor de reemplazo.** No hay recurso por defecto.
- No usar el último valor conocido como si fuera actual.
- No promediar fuentes que comparten origen para simular redundancia.
- No suponer la paridad de una moneda estable.
- No tratar la valuación de reserva como un precio de mercado ni al revés.
- No ajustar saldos de clientes para compensar un precio erróneo.
- No reanudar sin ventana de observación.
