# Runbook: custodio o proveedor no disponible

**Alcance:** custodio de metal o de activos de reserva, custodio de llaves, proveedor de pagos o cualquier tercero que dé fe de un hecho externo o que ejecute una liquidación.

**Regla base:** la indisponibilidad de un custodio **bloquea las acciones que dependen de su confirmación**. No las aprueba por silencio ni las rechaza por impaciencia.

---

## 1. Disparador

- El custodio no responde, responde con error o responde fuera de plazo.
- Una atestación vence y no llega la renovación.
- El proveedor informa de una degradación o de una interrupción.
- Una conciliación con el custodio no cuadra.

## 2. Precondiciones

1. Está registrado qué obligaciones y qué evidencias dependen de cada custodio.
2. Cada atestación de reserva tiene fecha, vigencia, emisor y alcance.
3. Está claro qué acciones dependen de una atestación vigente: emisión, release, redención, listado.
4. **D04 y D05 están pendientes**: la capacidad de reserva es cero y la serie redimible está bloqueada. Muchas acciones ya están detenidas por esa razón.

## 3. Pasos

1. **Clasificar la indisponibilidad:** técnica y transitoria, operativa, o un problema del propio custodio. Las tres tienen respuestas distintas.
2. **Marcar como vencidas las atestaciones afectadas.** Una reserva sin evidencia vigente **no habilita capacidad**. La capacidad baja; el activo no desaparece.
3. **Bloquear** emisión, release y redención que dependan de esa evidencia. Emitir el código de rechazo correspondiente, explicado en la interfaz sin filtrar información sensible.
4. **No bloquear** la consulta de saldos, documentos ni derechos del titular.
5. **Conservar las obligaciones existentes.** Una obligación de entrega ya generada sigue siendo exigible aunque el custodio no responda; se reconcilia aparte del token.
6. **Contactar por el canal contractual** y registrar la comunicación, con plazo de respuesta.
7. **Si la indisponibilidad se prolonga**, escalar a la autoridad que corresponda y evaluar el plan de contingencia contractual. La falta de un custodio alternativo se documenta como riesgo abierto.
8. **Al restablecerse**, reconciliar completo antes de reabrir capacidades: lotes, asignaciones exclusivas, gravámenes, obligaciones pendientes y evidencia con su nueva vigencia.

## 4. Verificación

- Ninguna emisión ni release ocurrió con evidencia vencida durante la ventana.
- La conciliación posterior cuadra con el invariante de la serie: el metal asignado y no entregado cubre los tokens vigentes respaldados más las obligaciones de entrega pendientes ya quemadas, sin contar dos veces las unidades inmovilizadas que siguen en el suministro.
- Las obligaciones de entrega abiertas están identificadas y con estado.

## 5. Criterio de parada

Se escala y se detiene toda acción que aumente exposición si:

- Se detecta que una reserva estaba asignada a más de una obligación.
- El custodio no confirma la existencia o la asignación exclusiva de un lote.
- Hay obligaciones de entrega abiertas sin custodio disponible.
- Se sospecha insolvencia o incumplimiento del custodio.

## 6. Qué NO hacer

- **No emitir ni liberar con una atestación vencida.**
- No suponer que la última atestación sigue vigente porque nada indica lo contrario.
- No reasignar un lote ya reservado para una entrega pendiente.
- No cancelar una obligación de entrega sin prueba de que el metal no fue liberado y de que el derecho anterior queda anulado.
- No sustituir la confirmación del custodio por un hash de documento: **un hash protege integridad, no demuestra que el bien exista**.
- No reducir saldos de clientes para cuadrar una diferencia.
