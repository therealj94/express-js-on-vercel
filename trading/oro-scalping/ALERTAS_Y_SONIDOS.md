# 🔔 Alarmas con sonidos distintos — Guía real (iPad, Android y web)

## Lo primero: el límite que nadie te cuenta

TradingView **no permite elegir un sonido distinto por alerta en la app móvil**. Esta es la realidad por plataforma:

| Plataforma | ¿Suena? | ¿Sonido distinto por evento? |
|-----------|---------|------------------------------|
| **Web (navegador)** | Sí, con "Reproducir sonido" | ✅ **Sí** — eliges el sonido en cada alerta |
| **App de escritorio (Mac/Win)** | Sí | ✅ **Sí** — igual que la web |
| **App iPad / iPhone** | Sí, notificación push | ❌ No — todas suenan con el tono de notificación de la app |
| **App Android** | Sí, notificación push | ❌ No — un solo tono para toda la app |

Además, el sonido de la web **solo suena con la pestaña abierta**. Si cierras el navegador, no hay sonido; la push del móvil sí llega siempre.

**Conclusión:** para tener sonidos realmente distintos en iPad y Android hay que sacar la notificación fuera de TradingView. Abajo están las dos rutas que sí funcionan.

---

## Ruta A — Web y escritorio (gratis, 5 minutos)

El indicador expone **8 condiciones de alerta independientes**. Creas una alerta por cada una y le asignas su propio sonido.

1. Abre el gráfico de XAUUSD **en la temporalidad que vas a operar** (la alerta hereda esa temporalidad automáticamente).
2. Añade el indicador `ORO Scalping PRO v3`.
3. Clic derecho en el gráfico → **Añadir alerta** (o el icono del reloj ⏰).
4. En **Condición**, elige `ORO PRO v3` y luego la condición de la lista.
5. En **Opciones de disparo**, usa la frecuencia de la tabla.
6. En la pestaña **Notificaciones**, marca **Reproducir sonido** y elige el tono y la duración.
7. Repite para cada evento.

| # | Condición a elegir | Frecuencia | Sonido sugerido | Por qué |
|---|-------------------|-----------|-----------------|---------|
| ① | Entrada LONG | Una vez por cierre de barra | *Bell / Chime* | Confirmada, sin repintado |
| ② | Entrada SHORT | Una vez por cierre de barra | *Hand-bell* (distinto de ①) | Distinguir dirección de oído |
| ③ | Cualquier entrada nueva | Una vez por cierre de barra | — | Úsala si tienes pocas alertas disponibles |
| ④ | TP1 alcanzado | **Una vez por barra** | *Ka-ching / Magic* | Avisa al instante, dentro de la vela |
| ⑤ | TP2 alcanzado | **Una vez por barra** | *Alert / Siren corta* | Cierre total |
| ⑥ | Stop Loss alcanzado | **Una vez por barra** | *Buzzer / Squeeze* | Tiene que doler al oído |
| ⑦ | Cualquier TP alcanzado | Una vez por barra | — | Alternativa a ④+⑤ |
| ⑧ | Aviso: setup formándose | Una vez por cierre de barra | *Wood / Tick suave* | Te da tiempo de sentarte |

**Set mínimo si tu plan limita las alertas:** ③ (entradas) + ⑦ (objetivos) + ⑥ (stop). Tres alertas, tres sonidos.

⚠️ Los eventos de TP y SL usan **"Una vez por barra"** a propósito: el indicador los detecta *dentro* de la vela, en tiempo real, no al cierre. Si eliges "por cierre de barra" el aviso te llega tarde.

### Mensaje con los precios dentro
En el campo **Mensaje** de cada alerta ya viene el texto rellenado con los datos en vivo. Se ve así al llegar:

```
🟢 ORO LONG XAUUSD 5 | Score 82 | Entrada 2418.55 | SL 2415.10 | TP1 2422.00 | TP2 2425.45 | Lote 0.29
```

Esto funciona porque el indicador publica series ocultas (`Score LONG`, `SL`, `TP1`, `TP2`, `Lote`) que el mensaje lee con `{{plot("...")}}`.

---

## Ruta B — Sonidos distintos en iPad y Android (la que realmente pediste)

Se saca la notificación de TradingView y se manda a una app que **sí** permite tono por mensaje.

> **Requisito:** los webhooks son función de **plan de pago** de TradingView (Essential o superior). En plan gratuito solo tienes la Ruta A.

### B1 · Telegram — gratis y con tono por chat ⭐ recomendada

Telegram permite **un tono de notificación distinto por cada chat**, tanto en iOS/iPadOS como en Android. Creamos tres canales y listo.

**Paso 1 — Crear el bot**
1. En Telegram habla con `@BotFather` → `/newbot` → ponle nombre.
2. Guarda el **token** que te da (algo como `123456789:AAH...`).

**Paso 2 — Crear los 3 canales**
Crea tres canales privados: `ORO · Entradas`, `ORO · Objetivos`, `ORO · Stops`. Añade tu bot como administrador en cada uno.

**Paso 3 — Sacar el chat_id de cada canal**
Publica un mensaje en cada canal y abre en el navegador:
`https://api.telegram.org/bot<TU_TOKEN>/getUpdates`
Apunta el `"chat":{"id":-100XXXXXXXXXX}` de cada uno.

**Paso 4 — Configurar el webhook en cada alerta**
En la alerta, pestaña **Notificaciones** → activa **Webhook URL** y pega:

```
https://api.telegram.org/bot<TU_TOKEN>/sendMessage
```

Y en el campo **Mensaje** pon este JSON (cambia el `chat_id` según el evento):

```json
{"chat_id":"-100XXXXXXXXXX","text":"🟢 ORO LONG {{ticker}} {{interval}} | Score {{plot(\"Score LONG\")}} | Entrada {{close}} | SL {{plot(\"SL\")}} | TP1 {{plot(\"TP1\")}} | TP2 {{plot(\"TP2\")}} | Lote {{plot(\"Lote\")}}"}
```

Para el stop, mismo formato apuntando al canal de stops:

```json
{"chat_id":"-100YYYYYYYYYY","text":"🛑 ORO STOP LOSS {{ticker}} {{interval}} en {{close}}"}
```

**Paso 5 — Asignar el tono en el móvil**
Abre cada canal en Telegram → nombre del canal → **Notificaciones** → **Sonido** → elige uno distinto para cada canal. Funciona igual en iPad y en Android.

Resultado: campana para entradas, caja registradora para objetivos, bocina para stops — en tu iPad, en tu Android y sin tener TradingView abierto.

### B2 · Pushover — tono por mensaje, sin crear canales

[Pushover](https://pushover.net) (app de pago único, ~$5 por plataforma) permite elegir el sonido **en cada mensaje** con el parámetro `sound`.

- **Webhook URL:** `https://api.pushover.net/1/messages.json`
- **Mensaje (entrada LONG):**

```json
{"token":"TU_APP_TOKEN","user":"TU_USER_KEY","sound":"cashregister","title":"ORO LONG","message":"{{ticker}} {{interval}} | Entrada {{close}} | SL {{plot(\"SL\")}} | TP1 {{plot(\"TP1\")}} | TP2 {{plot(\"TP2\")}}"}
```

- **Mensaje (stop loss):** el mismo con `"sound":"siren"` y `"priority":1`.

Sonidos disponibles: `pushover`, `bike`, `bugle`, `cashregister`, `classical`, `cosmic`, `falling`, `gamelan`, `incoming`, `intermission`, `magic`, `mechanical`, `pianobar`, `siren`, `spacealarm`, `tugboat`, `alien`, `climb`, `persistent`, `echo`, `updown`, `vibrate`, `none`.

---

## Cosas que conviene saber

- **La alerta usa la temporalidad del gráfico donde la creaste.** Si quieres avisos de 1m y de 5m, crea la alerta dos veces, una en cada gráfico. Puedes ponerle nombre distinto para reconocerlas.
- **Las alertas corren en el servidor de TradingView**, no en tu dispositivo. Siguen funcionando con el iPad apagado; lo que no funciona con la app cerrada es el sonido de la Ruta A.
- **Caducidad:** en algunos planes las alertas expiran a los ~2 meses. Revísalas de vez en cuando.
- **Silencio nocturno:** en iOS usa un Modo de concentración que permita solo Telegram/Pushover; en Android, "No molestar" con excepción para esa app.
- **Prueba antes:** pon el umbral de score temporalmente en 45 y espera unos minutos en un gráfico de 1m — te llegarán señales de prueba para verificar que los sonidos llegan bien. Luego devuélvelo a 70.
