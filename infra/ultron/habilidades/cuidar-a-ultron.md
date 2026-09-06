---
nombre: cuidar-a-ultron
cuando: Cuando ULTRON va lento, no contesta, se comporta raro, o toca la revisión de rutina de su propia salud. La usa el bot médico cada hora y cualquiera que pregunte «¿cómo estás?» en serio.
---

# Cuidar a ULTRON

El resto del sistema vigila las seis casas. Esto vigila al que las vigila. Si ULTRON se cae, nadie avisa de nada — por eso esta revisión va primero.

## El orden

1. **`salud_revisar`.** Nueve signos y una nota de 0 a 100. Leerlos en este orden de gravedad: cerebro, base, memoria del proceso, bucle de eventos, y después el resto. Un cerebro mudo es una emergencia; un bot atrasado no.
2. **`salud_reparar`** si la revisión encontró algo con arreglo. No hay que pensarlo: los arreglos que trae son internos y reversibles, y no repararlos deja a ULTRON peor de lo que estaba.
3. **`salud_historial`** cuando la nota está por debajo de 85. La pregunta no es «¿cómo está?» sino «¿desde cuándo?». Un 70 de hace diez minutos y un 70 de hace tres días son dos averías distintas.
4. **Lo que no se arregla solo** se anota con `anotar_pendiente`, con el nombre exacto de lo que hay que hacer y quién puede hacerlo.

## Qué significa cada signo cuando está mal

- **Cerebro** — si dice «de relevo», el nodo de la tarjeta no contesta y Claude está cubriendo. ULTRON sigue funcionando, pero está gastando fichas de Anthropic en cada respuesta y hay una máquina apagada que habría que encender. Se comprueba con `nodo_salud`; si la máquina está apagada en AWS, eso lo enciende una persona.
- **Base** — sin Mongo, todo lo que se recuerda vive en el aire y se pierde al reiniciar. `salud_reparar` intenta reconectar. Si no vuelve, el problema está en Atlas (IP fuera de la lista, contraseña rotada, plan pausado) y eso no lo arregla un bot.
- **Memoria del proceso** — por encima del 88 % el dyno empieza a tirar a disco y todo se arrastra. `soltar_cache` gana algo de aire; si sube otra vez en la ronda siguiente, hay una fuga y hay que decirlo con esas palabras.
- **Bucle de eventos** — retraso alto quiere decir que algo bloquea el único hilo de Node. Casi siempre es un archivo grande leído de golpe o un bucle largo. No se repara solo: se busca en el registro qué corrió justo antes.
- **Vigía o equipo parados** — se rearrancan solos. Si se paran otra vez a la hora siguiente, el rearranque no es la solución: algo los está matando, y eso va al parte.
- **Puerta con una sola persona** — no es una avería, es un riesgo: si José pierde la clave, no entra nadie. Se repite en cada parte hasta que haya un segundo miembro.

## Cómo se entrega

Corto. Si todo está bien, una línea. Si hay algo, tres partes: qué pasa, qué se reparó, qué queda para una persona. Nunca el valor de un secreto, nunca una cifra inventada — si un signo no se pudo medir, se dice que no se pudo medir.
