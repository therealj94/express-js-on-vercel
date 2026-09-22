# Runbook: webhook duplicado o fuera de orden

**Regla base:** un webhook es una notificación, no una verdad. La verdad se obtiene consultando al proveedor o a la cadena. **Recibir un identificador de transacción no significa que se haya cobrado.**

---

## 1. Disparador

- Llega una notificación con un identificador de evento ya procesado.
- Llegan dos notificaciones contradictorias para la misma operación.
- Llega una notificación fuera de orden (por ejemplo, la liquidación antes que la autorización).
- Llega una notificación que no corresponde a ninguna operación conocida.

## 2. Precondiciones

1. Cada notificación entrante está autenticada según el mecanismo del proveedor y tiene un identificador único de evento.
2. Existe un diario de operaciones durable con idempotencia por `operationId`.
3. Los estados de una operación de pago están separados: autorización, captura, liquidación, reverso, devolución y disputa.
4. Existe un mecanismo de consulta al proveedor para reconciliar.

## 3. Pasos

1. **Autenticar** la notificación. Si no autentica, se descarta y se registra como intento; no se procesa por parecer legítima.
2. **Deduplicar por identificador de evento.** Si ya fue procesado, se registra la repetición y se termina. La deduplicación es responsabilidad del receptor: los proveedores reenvían por diseño.
3. **Comprobar el orden.** Si el evento corresponde a un estado anterior al actual, no se retrocede el estado: se registra y se ignora para la máquina de estados.
4. **Si hay contradicción**, no se decide por la notificación más reciente. **Se consulta al proveedor** por la operación y el estado autoritativo se toma de esa consulta.
5. **Si no corresponde a ninguna operación conocida**, se registra como huérfana y se investiga. Nunca se crea una operación a partir de una notificación.
6. **Reconciliar antes de reintentar.** Si el estado es incierto, la operación queda en `UNKNOWN` y se resuelve por consulta, nunca por reintento de cobro.
7. **Registrar** el evento, su identificador, la decisión tomada y el estado resultante.

## 4. Verificación

- Una operación tiene exactamente un cobro y exactamente un efecto, aunque hayan llegado múltiples notificaciones.
- El diario no contiene operaciones duplicadas con el mismo `operationId`.
- La conciliación diaria con el proveedor cuadra en número de operaciones e importes.
- No quedan notificaciones huérfanas sin clasificar.

## 5. Criterio de parada

Se detiene el procesamiento del flujo afectado y se escala si:

- Aparece un cobro duplicado efectivo a un cliente.
- El proveedor y el diario propio discrepan en el estado final de una operación.
- Llegan notificaciones autenticadas correctamente para operaciones que nunca se crearon.
- El volumen de notificaciones supera de forma anómala el de operaciones.

## 6. Qué NO hacer

- **No reintentar un cobro por un estado incierto.**
- No confiar en el orden de llegada.
- No tratar el identificador de transacción como confirmación de cobro.
- No procesar una notificación sin autenticar.
- No guardar el número completo de tarjeta ni el código de verificación en registros; se usa la tokenización del proveedor.
- No corregir un descuadre modificando el saldo del cliente. Ver `conciliacion-diaria.md`.
