# 🚀 Instalación y prueba — Guía paso a paso

Dos partes independientes. Puedes hacer solo la A (TradingView, gratis, 20 min) o las dos.

- **PARTE A — TradingView:** el indicador que te avisa y te dice qué hacer. Tú aprietas el botón.
- **PARTE B — MetaTrader 5:** el bot que opera solo.

> Regla de oro antes de empezar: **todo se prueba primero en demo.** Ni un dólar real hasta terminar la PARTE C (protocolo de prueba).

---

# 🅰️ PARTE A — TradingView (el indicador)

## Paso A1 · Crear la cuenta

1. Entra a **tradingview.com**.
2. Arriba a la derecha: **"Empezar ahora"** o el icono de perfil → **Registrarse**.
3. Usa correo o Google. Confirma el correo si te lo pide.
4. El **plan gratuito sirve** para probar todo esto. Solo tiene límite de alertas activas (unas pocas) — más adelante te digo cuáles priorizar.

✅ **Verificación:** ya ves tu nombre arriba a la derecha.

## Paso A2 · Abrir el gráfico correcto

1. En el buscador de arriba escribe **XAUUSD**.
2. De la lista elige un proveedor con datos en tiempo real: **OANDA:XAUUSD** o **FOREXCOM:XAUUSD** (evita los que digan "retrasado").
3. Se abre el gráfico. En la barra superior, donde dice la temporalidad (por defecto suele ser "D"), haz clic y elige **5 minutos**.
4. Recomendado: pon el tema oscuro (icono de engranaje → Apariencia → Oscuro). El panel se ve mejor.

✅ **Verificación:** arriba dice `XAUUSD · 5 · OANDA` y las velas se mueven.

## Paso A3 · Pegar el indicador

1. Abajo del todo de la pantalla hay una pestaña que dice **"Editor Pine"** (o "Pine Editor"). Haz clic para abrirla.
2. Verás un código de ejemplo. **Selecciona todo (Ctrl+A / Cmd+A) y bórralo.**
3. Abre el archivo **`ORO_FINAL.pine`** que te envié, copia **todo** su contenido y pégalo ahí.
4. Arriba a la derecha del editor: **"Guardar"** → ponle nombre `ORO FINAL`.
5. Luego: **"Añadir al gráfico"**.

✅ **Verificación:** en el gráfico aparecen líneas de colores (EMAs, VWAP morado) y **arriba a la derecha el panel negro con "🥇 ORO FINAL"**.

❌ **Si sale error rojo:** copia el mensaje EXACTO y mándamelo. No sigas.

## Paso A4 · Configurar TUS datos

1. Pasa el mouse sobre el nombre "ORO FINAL" en el gráfico → clic en el **engranaje ⚙️**.
2. Pestaña **"Entradas"**. Ajusta:

| Grupo | Qué poner |
|-------|-----------|
| ⚙️ Empieza aquí → Perfil | `🟡 Equilibrado` (o `🟢 Principiante` si nunca operaste) |
| ⚙️ Ventana de operación | `Solo killzones (recomendado)` |
| 💰 Tu cuenta → Capital | Tu capital REAL (ej. 1000) |
| 💰 Riesgo por operación | `1.0` (o 0.5 si quieres ir suave) |
| 💰 Onzas por lote | `100` (déjalo así para XAUUSD) |

3. **Aceptar**.

✅ **Verificación:** en el panel, la fila "Lote" ahora muestra un número acorde a tu capital (ej. `0.29 lotes = $10`).

## Paso A5 · Aprender a leer el panel (2 minutos)

Mira el panel de arriba a la derecha. De arriba a abajo:

| Fila | Qué te dice |
|------|-------------|
| **Score** `███████░░░ 72` | Probabilidad LONG (izq) y SHORT (der) |
| **Fila ancha de color** | LA DECISIÓN: ENTRAR / ESPERAR / FUERA DE HORARIO |
| **Salud** (solo en operación) | Si mantener o salir |
| Factores | Los 11 puntos, para entender el porqué |
| Mercado en vivo | Precio, cuenta regresiva de la vela, RSI, ADX |
| **Plan si entras ahora** | Entrada, SL, TP1/TP2, R:R real y tu lote |
| Hoy | Operaciones, resultado del día y racha |

**Regla:** solo entras cuando la fila ancha esté **verde (ENTRAR LONG)** o **roja (ENTRAR SHORT)** y la vela haya **cerrado** (cuenta regresiva en 0:00).

## Paso A6 · Crear las alertas con sonido

Empieza con **3 alertas** (suficientes para el plan gratuito):

**Alerta 1 — Entradas:**
1. Clic derecho en el gráfico → **"Añadir alerta"** (o el icono ⏰ arriba).
2. **Condición:** primer desplegable → `ORO FINAL`. Segundo desplegable → `③ Cualquier entrada nueva`.
3. **Opciones de disparo:** `Una vez por cierre de barra`.
4. Pestaña **Notificaciones**: marca ✅ **Notificar en la app** (para el celular) y ✅ **Reproducir sonido** → elige un sonido, ej. *Bell*.
5. **Nombre:** "ORO Entrada". → **Crear**.

**Alerta 2 — Objetivos:** igual, pero condición `⑦ Cualquier TP alcanzado`, disparo **`Una vez por barra`**, sonido distinto (ej. *Ka-ching*).

**Alerta 3 — Stop Loss:** condición `⑥ Stop Loss alcanzado`, disparo **`Una vez por barra`**, sonido *Buzzer*.

> Si tu plan te deja más alertas, añade `⑨ MEJOR SALIR` (una vez por barra) — es la más valiosa después de las tres básicas.

✅ **Verificación:** en el panel derecho, pestaña "Alertas", ves tus 3 alertas activas con reloj verde.

## Paso A7 · Instalar la app en el celular

1. Descarga **TradingView** en App Store / Play Store.
2. Inicia sesión con la misma cuenta.
3. Ve a **Ajustes → Notificaciones** y permite las notificaciones push.

✅ **Verificación:** en la app, sección "Alertas", ves las mismas 3 alertas.

---

# 🅱️ PARTE B — MetaTrader 5 (el bot)

## Paso B1 · Abrir cuenta DEMO en Exness

1. Entra a **exness.com** → **Registrarse** (correo + contraseña).
2. Verifica tu correo.
3. En el **Área Personal**: **"Abrir cuenta nueva"** → elige **CUENTA DEMO**.
4. Tipo: **Standard** (o Raw Spread si aparece). Plataforma: **MetaTrader 5**. Apalancamiento: 1:200 está bien. Depósito virtual: **el mismo monto que planeas usar en real** (ej. $1000) — así la prueba es realista.
5. **Guarda estos 3 datos** que te da:
   - **Número de cuenta** (login, ej. 12345678)
   - **Contraseña**
   - **Servidor** (ej. `Exness-MT5Trial8`) ← este es el que más se olvida

✅ **Verificación:** en el Área Personal ves tu cuenta demo con el saldo virtual.

## Paso B2 · Instalar MetaTrader 5

1. En el Área Personal de Exness busca **"Descargar plataforma"** o ve a **metatrader5.com/es/download**.
2. **Windows:** descarga el .exe → instálalo (Siguiente, Siguiente, Finalizar).
   **Mac:** descarga la versión para Mac desde MetaQuotes. *(Nota: en Mac corre sobre una capa de compatibilidad; si te da problemas, la opción sólida es el VPS Windows del Paso B8.)*
3. Ábrelo.

✅ **Verificación:** se abre MT5 con gráficos y la ventana "Observación del mercado" a la izquierda.

## Paso B3 · Conectar tu cuenta demo

1. Menú **Archivo → Conectarse a una cuenta de trading**.
2. Escribe tu **login**, **contraseña** y busca tu **servidor** (el del paso B1).
3. Conectar.

✅ **Verificación:** abajo a la derecha, en la barra de estado, ves una barra de conexión con kb/s (no dice "Sin conexión"). En la pestaña **"Operaciones"** (abajo) ves tu **Balance**.

## Paso B4 · ⚠️ Averiguar la hora del servidor (paso crítico)

El bot usa la hora del **servidor del broker**, no la tuya. Sin esto, opera a horas equivocadas.

1. Mira arriba de la ventana **"Observación del mercado"** (panel izquierdo): ahí aparece una **hora**. Esa es la hora del servidor. Anótala.
2. Busca en Google **"hora en Nueva York"** en ese mismo momento. Anótala.
3. Calcula la diferencia: **Diferencia = Hora servidor − Hora Nueva York**.

**Ejemplo:** servidor marca 14:30, Nueva York marca 10:30 → diferencia = **+4 horas**.

4. Ahora suma esa diferencia a estos horarios base (que están en hora NY) y anota el resultado:

| Sesión | Hora NY (base) | Tu hora servidor (NY + diferencia) |
|--------|----------------|-------------------------------------|
| Londres inicio | 03:00 | ____ |
| Londres fin | 06:00 | ____ |
| NY inicio | 08:30 | ____ |
| NY fin | 11:30 | ____ |

**Con el ejemplo de +4:** Londres 07:00–10:00, NY 12:30–15:30.

✅ **Verificación:** tienes 4 horas anotadas. Las usarás en el paso B7.

## Paso B5 · Copiar el bot a MetaTrader

1. En MT5: menú **Archivo → Abrir carpeta de datos**. Se abre una carpeta de Windows.
2. Entra en la carpeta **`MQL5`** → luego **`Experts`**.
3. Copia ahí el archivo **`ORO_FINAL_EA.mq5`** que te envié.
4. Cierra esa ventana.

✅ **Verificación:** el archivo está dentro de `...\MQL5\Experts\ORO_FINAL_EA.mq5`.

## Paso B6 · Compilar

1. En MT5 pulsa **F4** (o menú Herramientas → Editor MetaQuotes). Se abre el **MetaEditor**.
2. En el panel izquierdo (Navegador), despliega **Expert Advisors** y haz **doble clic** en `ORO_FINAL_EA`.
3. Pulsa **F7** (o el botón **"Compilar"**).
4. Mira la pestaña de abajo ("Errores"):
   - ✅ Debe decir **`0 error(s), 0 warning(s)`** o similar.
   - ❌ Si hay errores en rojo: **cópialos exactos y mándamelos**. No sigas.
5. Cierra el MetaEditor y vuelve a MT5.

✅ **Verificación:** en MT5, panel **Navegador** (Ctrl+N) → **Asesores Expertos** → aparece **ORO_FINAL_EA**.

## Paso B7 · Poner el bot en el gráfico

1. **Habilita el trading algorítmico primero:** menú **Herramientas → Opciones → pestaña "Asesores Expertos"** → marca ✅ **"Permitir trading algorítmico"**. Aceptar.
2. En la barra superior de MT5, el botón **"Algo Trading"** debe estar **VERDE**. Si está rojo, haz clic para activarlo.
3. Abre el gráfico: en "Observación del mercado" busca **XAUUSD** → clic derecho → **"Ventana del gráfico"**.
4. Pon la temporalidad en **M5** (botón en la barra superior).
5. Desde el **Navegador**, arrastra **ORO_FINAL_EA** encima del gráfico.
6. Se abre la ventana de configuración:

**Pestaña "Común":**
- ✅ Marca **"Permitir trading algorítmico"**.

**Pestaña "Parámetros de entrada"** — ajusta solo esto:

| Parámetro | Valor para la prueba |
|-----------|---------------------|
| 🕐 Killzone Londres: inicio / fin | **Tus horas del paso B4** |
| 🕐 Killzone Nueva York: inicio / fin | **Tus horas del paso B4** |
| 🎚 Lote | `0` = automático por % (recomendado para probar) |
| 🎚 Agresividad | `0` = Normal |
| 💰 Riesgo por operación | `0.5` |
| 💰 Máximo de operaciones por día | `4` |
| 💰 Freno de emergencia (%) | `3.0` |
| 🔔 Push al móvil | `false` por ahora (lo activamos en C4) |

7. **Aceptar**.

✅ **Verificación (la más importante):** arriba a la derecha del gráfico aparece **`ORO_FINAL_EA` con una carita sonriente 🙂**.
- 🙂 = funcionando
- 😦 = el trading algorítmico está apagado → revisa el punto 1 y 2

También: en la esquina superior izquierda del gráfico aparece el texto de estado `🥇 ORO FINAL v2.20 | Score L .. · S ..` y en la pestaña **"Expertos"** (abajo) el mensaje de inicio.

## Paso B8 · (Opcional ahora, obligatorio para real) VPS

Para que el bot opere aunque apagues tu computadora:
1. En el Área Personal de Exness busca la sección **VPS** y solicítalo (es gratis si cumples requisitos).
2. Alternativa dentro de MT5: clic derecho en el gráfico → **"Registrar servidor virtual"** (MetaQuotes VPS, ~$15/mes) → sigue el asistente → al terminar, clic derecho → **"Sincronizar el entorno de ejecución"**.

Déjalo para después de que las pruebas salgan bien.

---

# 🅲 PARTE C — Protocolo de prueba (así compruebas que TODO funciona)

## C1 · Prueba del backtest en TradingView (10 min)

1. Editor Pine → borra todo → pega **`ORO_FINAL_Backtest.pine`** → **Añadir al gráfico**.
2. Abajo se abre la pestaña **"Probador de estrategias"**.
3. Mira la pestaña **"Resumen"**:

| Métrica | Qué buscar |
|---------|-----------|
| Total de operaciones | Que haya al menos 30 (si no, amplía el rango o baja el umbral) |
| **Factor de beneficio** | **> 1.3** es bueno |
| % de operaciones rentables | 45–55% es lo esperado y normal |
| Reducción máxima (drawdown) | **< 15%** ideal |

4. Prueba variantes: perfil Equilibrado vs Agresivo, y con la salida inteligente activada vs desactivada. Anota cuál da mejor resultado **en tu proveedor de datos**.

⚠️ Un backtest bonito no garantiza futuro, pero uno malo sí garantiza problemas. Si el factor de beneficio sale < 1.0, **no pases a real**.

## C2 · Prueba del backtest en MetaTrader (15 min)

1. En MT5 pulsa **Ctrl+R** (Probador de estrategias).
2. Configura:
   - **Expert:** `ORO_FINAL_EA`
   - **Símbolo:** XAUUSD · **Periodo:** M5
   - **Fecha:** últimos 6–12 meses
   - **Modelado:** `Cada tick basado en ticks reales`
   - **Depósito:** el mismo de tu demo
3. ⚠️ **Ajusta los horarios** en la pestaña de parámetros (los del paso B4).
4. **Iniciar**. Tarda unos minutos.
5. Revisa la pestaña **"Resultados"** y el **gráfico de balance**: debe subir con escalones, no en línea recta perfecta (eso sería sospechoso) ni cayendo.

✅ **Verificación:** el bot abrió operaciones, cada una con SL, y ves cierres parciales (el TP1 del 50%).

## C3 · Prueba de las alertas (5 min) — el truco

Para no esperar días a que salga una señal real:

1. En TradingView, abre los ajustes del indicador ⚙️.
2. Cambia temporalmente: **Perfil → `⚙️ Personalizado`** y **Umbral manual → `45`**. Ventana → **`24 horas`**.
3. Cambia el gráfico a **1 minuto**.
4. Espera unos minutos: deberían aparecer señales de prueba y **sonar tus alertas** (y llegarte al celular).
5. ✅ Confirma que: suena en la computadora, llega la notificación al celular, y el mensaje incluye entrada/SL/TP.
6. **MUY IMPORTANTE: devuelve todo a los valores normales** (Perfil `🟡 Equilibrado`, ventana `Solo killzones`, gráfico a 5 minutos) y **borra las alertas de prueba** para crearlas de nuevo en la configuración buena.

## C4 · Prueba de las notificaciones del bot (5 min)

1. En tu celular instala la app **MetaTrader 5**.
2. Abre la app → menú → **Ajustes → Mensajes** → ahí aparece tu **MetaQuotes ID** (un código de 8 caracteres). Anótalo.
3. En MT5 de escritorio: **Herramientas → Opciones → pestaña "Notificaciones"** → ✅ Habilitar notificaciones push → pega tu **MetaQuotes ID** → **Prueba**.
4. ✅ Debe llegarte una notificación de prueba al celular.
5. Ahora sí, en los parámetros del bot pon **🔔 Push al móvil = `true`**.

## C5 · Demo en vivo — 2 semanas mínimo

Deja el bot corriendo en la cuenta demo con los parámetros reales (perfil Normal, riesgo 0.5%, solo killzones) y **revisa 1 vez al día** (2 minutos):

```
□ ¿La carita sigue sonriente 🙂?
□ Pestaña "Expertos": ¿hay mensajes de error rojos?
□ Pestaña "Historial": ¿las operaciones tienen SL puesto?
□ ¿Los cierres parciales (TP1) se ejecutaron bien?
□ ¿El resultado va en línea con el backtest?
```

**Criterio para pasar a real:** 2 semanas sin errores técnicos + resultado neto positivo o plano. Si el bot tuvo errores de ejecución, no pases — mándame los mensajes de la pestaña "Expertos".

## C6 · Paso a real (cuando C5 salga bien)

1. Abre cuenta **real** en Exness (requiere verificación de identidad).
2. Deposita **solo lo que puedas permitirte perder**.
3. Repite los pasos B3 y B7 con la cuenta real. **Riesgo 0.5%**, perfil Normal, solo killzones.
4. Activa el **VPS** (paso B8).
5. Primer mes: revisa a diario, no toques nada, no subas el riesgo.
6. Solo después de 30+ operaciones con resultado positivo considera subir a 0.75% o probar el modo Agresivo.

---

# 🆘 Problemas comunes

| Síntoma | Solución |
|---------|----------|
| Error rojo al añadir el Pine | Cópialo exacto y mándamelo |
| No aparece el panel en TradingView | Ajustes ⚙️ → grupo 📊 Panel → activa "Mostrar panel" |
| El indicador no da señales nunca | Normal: con umbral 70 y solo killzones hay 0–3 al día. Verifica que estés dentro del horario (el panel te lo dice) |
| Carita triste 😦 en MT5 | Botón "Algo Trading" en verde + Herramientas→Opciones→Asesores Expertos→permitir |
| El bot no abre operaciones | Revisa la pestaña "Expertos": suele ser horario equivocado (paso B4), spread alto, o límite diario alcanzado |
| "El lote de riesgo es menor que el mínimo" | Tu capital es muy pequeño para 0.5% con ese SL. Sube el riesgo a 1% o usa una cuenta cent |
| Las alertas no suenan en el celular | TradingView: la alerta debe tener ✅ "Notificar en la app". MT5: paso C4 |
| El bot dejó de operar a media sesión | Probablemente llegó al objetivo, al límite de pérdida o al máximo de operaciones. El texto del gráfico lo dice |

---

*Recuerda: demo primero, siempre. Y si algo no cuadra en cualquier paso, párate ahí y pregúntame antes de seguir.*
