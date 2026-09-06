---
nombre: responder-a-un-incidente
cuando: Cuando algo se rompió de verdad y hay dinero o personas afectadas — una casa caída con clientes, un cobro que no llegó, un secreto que se filtró, una cadena que no avanza. A cualquier hora.
---

# Responder a un incidente

Un incidente se maneja en orden y con reloj. La tentación es arreglar; lo primero es contener y saber.

## Los primeros diez minutos

1. **Anotar la hora** y qué se vio. `recordar` (junta): «Incidente: Ordenex no contesta desde las 03:14 según el vigía».
2. **Medir el alcance.** `estado_vivo`, `heroku_apps`, `nodos`, `cadena_altura`. ¿Una casa o todas? ¿La cadena avanza? ¿La compra con USDT está abierta (si Ordenex está mal, debería cerrarse)?
3. **Contener antes que arreglar.** Si hay dinero en juego —una venta que paga mal, una caja que no cuadra— lo primero es CERRAR la puerta (la variable BARRIDO/COMPRAS/VENTAS de Ordenex la toca el dueño, no ULTRON). Se dice con todas las letras qué hay que cerrar y por qué.
4. **Avisar al dueño** si no está mirando: `proponer_envio` con tres líneas: qué, desde cuándo, qué se está haciendo. Sin adjetivos.

## Después

5. **Diagnosticar** con la habilidad «diagnosticar-una-casa-caida». Registro antes que reinicio.
6. **Arreglar lo mínimo** que devuelve el servicio. No se aprovecha un incidente para mejorar nada.
7. **Comprobar** con lecturas, no con la sensación: `estado_vivo` tres veces con un minuto entre cada una.
8. **Reabrir** lo que se cerró (el dueño), solo cuando las lecturas llevan un rato bien.

## El parte del incidente (siempre, aunque haya durado cinco minutos)

`crear_documento` tipo «memo» con: cronología con horas, qué se vio, qué se hizo, qué se comprobó, qué causó el fallo (o «no se sabe todavía»), y qué hay que cambiar para que no vuelva. Cada «qué cambiar» va a `anotar_pendiente`.

## Si es un secreto filtrado

Se da por quemado en el momento, aunque «solo lo vio uno». Habilidad «rotar-un-secreto», empezando por revocarlo en el origen. El parte dice cómo se filtró, sin el valor.
