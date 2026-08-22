# 🥇 ORO SCALPING PRO v3 — Estrategia final (XAUUSD)

Sistema de scalping para oro con **score de probabilidad de 0 a 100**, motor de operación en vivo, alarmas con sonido por evento y adaptación automática a cualquier temporalidad.

**Archivos de esta carpeta**

| Archivo | Para qué sirve |
|---------|----------------|
| `ORO_Scalping_PRO_v3.pine` | **El indicador.** Pégalo en el Editor Pine de TradingView. Da señales, dibuja SL/TP, panel en vivo y las 8 alertas. |
| `ORO_Scalping_PRO_v3_Backtest.pine` | La misma lógica en versión *strategy* para medir el % de acierto real en el Probador de Estrategias. |
| `ALERTAS_Y_SONIDOS.md` | Cómo configurar sonidos distintos por evento en web, iPad y Android. |
| `ORO_Scalping_3en1*.pine` | Versiones v1/v2 anteriores (se conservan como referencia). |

---

## 1. Cómo funciona en una frase

En cada vela el indicador puntúa **LONG** y **SHORT** por separado sumando 11 factores de confluencia y restando penalizaciones. Cuando un lado cruza el umbral (70 por defecto) dispara la entrada con su stop y sus dos objetivos ya calculados, y a partir de ahí sigue la operación en vivo: avisa cuando toca TP1, mueve el stop a la entrada, aplica trailing y avisa del TP2 o del stop.

---

## 2. La tabla de probabilidad — los 11 factores

| # | Factor | Qué mide | Condición LONG (SHORT = inverso) | Puntos |
|---|--------|----------|----------------------------------|--------|
| 1 | Tendencia de tu temporalidad | Dirección inmediata | EMA 9 > EMA 21 **y** precio > EMA 200 (solo EMAs alineadas = mitad) | **15** |
| 2 | Tendencia superior 1 (15 m) | Que no vayas contra la marea | EMA 21 > EMA 50 | **8** |
| 3 | Tendencia superior 2 (1 H) | Sesgo de fondo | EMA 21 > EMA 50 | **7** |
| 4 | Momentum institucional | De qué lado está el dinero grande | Precio > VWAP (7) + RSI > 50 (6) | **13** |
| 5 | Ruptura de rango | El detonante de entrada | Cierre sobre el rango de apertura (en killzone) o sobre el rango de la última hora (fuera) | **12** |
| 6 | Fuerza direccional (ADX) | Que no sea mercado plano | Escalado: ADX 40+ = 10 pts, ADX 20 = 5 pts | **10** |
| 7 | Calidad del horario | Liquidez del momento | Killzone = 12 · Londres/NY normal = 6.6 · Asia = 2.4 | **12** |
| 8 | Vela de confirmación | Convicción de la última vela | Cuerpo ≥ 50% del rango a favor | **8** |
| 9 | Volumen relativo | Que el movimiento tenga respaldo | Volumen ≥ 1.3× su media de 20 (≥1.0× = mitad) | **7** |
| 10 | Régimen de volatilidad | Ni mercado muerto ni caos de noticia | ATR entre el percentil 25 y 92 | **4** |
| 11 | Correlación con el dólar | El oro sube cuando el DXY baja | DXY por debajo de su EMA 21 | **4** |
| | **TOTAL** | | | **100** |

### Penalizaciones (restan del score)

| Situación | Resta | Por qué |
|-----------|-------|---------|
| RSI > 76 en un LONG (o < 24 en un SHORT) | **−12** | Estás entrando tarde, en el clímax del movimiento |
| Precio a más de 2 × ATR del VWAP | **−8** | Demasiado extendido: alto riesgo de que el precio vuelva al VWAP justo cuando entras |

### Cómo leer el score

| Score | Qué significa | Qué hacer |
|-------|---------------|-----------|
| **85–100** | Confluencia casi perfecta | Entrar con riesgo 1% |
| **70–84** | Alta probabilidad — umbral por defecto | Entrar con riesgo 0.5–1% |
| **60–69** | Aceptable solo dentro de killzone | Solo con experiencia, riesgo 0.5% |
| **< 60** | Ruido | **No operar** |

⚠️ **Sé honesto con lo que mide esto:** el score mide **calidad de confluencia**, no probabilidad estadística garantizada. Un 85/100 no significa "85% de ganar". Significa que casi todos los factores están alineados. El porcentaje de acierto real te lo da el backtest con el histórico de tu broker.

---

## 3. Horarios — funciona a cualquier hora sin perder el filtro

Tres modos en el input **Ventana de operación**:

| Modo | Cuándo opera | Para quién |
|------|--------------|-----------|
| **Solo killzones** (por defecto) | Londres 03:00–06:00 y NY 08:30–11:30 (hora NY) | Recomendado. Las horas de más volumen del oro. |
| **Londres + NY completo** | 02:00–17:00 hora NY | Si quieres más oportunidades durante el día |
| **24 horas** | Siempre | Si operas de madrugada o en otra zona horaria |

**El truco que hace esto seguro:** el factor horario (12 puntos) baja solo fuera de killzone — en sesión asiática vale apenas 2.4 de 12. Así, una señal de madrugada necesita confluencia casi perfecta en todo lo demás para llegar a 70. Puedes operar 24 h sin que el sistema se vuelva permisivo.

Se eligió 08:30 NY (y no 09:30) porque a esa hora salen los datos económicos de EE. UU. (IPC, empleo, PIB) que son los que de verdad mueven el oro.

⚠️ **Regla manual obligatoria:** en días de noticia roja (NFP, IPC, FOMC) no entres 5 minutos antes ni 2–3 minutos después del dato, aunque haya señal. Pine Script no puede leer el calendario económico — eso lo controlas tú con ForexFactory o Investing.

---

## 4. Cualquier temporalidad — adaptación automática

El indicador lee la temporalidad del gráfico y ajusta solo:

| Parámetro | Cómo se calcula |
|-----------|-----------------|
| Rango de ruptura local | ≈ última **1 hora** de velas (12 en M5, 60 en M1, 4 en M15) |
| Velas de swing para el SL | ≈ últimos **30 minutos** |
| Trailing | ≈ últimos **30 minutos** |
| Enfriamiento entre señales | ≈ **1 hora** |
| Rango de apertura | Por **minutos** (15 por defecto), no por número de velas — si tu vela dura más de 15 min, el rango es la primera vela de la sesión |

Todos se pueden fijar a mano poniendo un valor distinto de 0. **Recomendado para scalping: 1 m, 3 m, 5 m o 15 m.** En 1 m hay muchas más señales y más ruido; en 15 m menos señales pero más limpias.

---

## 5. Stop Loss y Take Profit — el criterio completo

**Stop Loss por estructura, no por número fijo:**
- Debajo del mínimo de las últimas velas de swing (≈30 min), + un colchón de 0.5 × ATR para sobrevivir a las mechas típicas del oro.
- Si la estructura queda demasiado lejos, se limita a **1.5 × ATR**. Nunca arriesgas más de eso.

**Objetivos escalonados:**
- **TP1 = 1R** (misma distancia que el stop) → cierras el **50%** y el stop se mueve al **precio de entrada**. Desde ese momento la operación ya no puede perder dinero.
- **TP2 = 2R** → el 50% restante, con **trailing por ATR** (1.5 × ATR desde el máximo) para dejar correr los movimientos grandes.

**Por qué esto funciona:** con esta gestión, acertando solo **4 de cada 10** operaciones ya eres rentable. No necesitas adivinar el mercado, necesitas que las ganadoras midan más que las perdedoras.

**Tamaño de posición:** el panel te calcula el lote exacto en vivo.

```
Lote = (Capital × %riesgo) ÷ (distancia al SL en $ × onzas por lote)
```

Metes tu capital y tu % de riesgo en los inputs y el panel te dice "0.29 lotes = $100 en riesgo". Sin calculadora aparte.

**Límites de disciplina que aplica el propio indicador:**
- Máximo **4 operaciones por día**
- Máximo **2 pérdidas por día** → después deja de dar señales y el panel muestra `LÍMITE DIARIO 🛑`
- **Riesgo por operación 0.5%–1%.** Nunca más.

---

## 6. El panel en vivo — toda la información para decidir

Arriba a la derecha (posición configurable) verás en tiempo real:

**Bloque de factores** — los 11 factores con sus puntos, columna LONG y columna SHORT, más las penalizaciones. Ves exactamente *por qué* el score es el que es.

**SCORE** — el número grande de cada dirección, con fondo verde/rojo cuando supera el umbral.

**DECISIÓN** — `ENTRAR LONG 🟢` · `ENTRAR SHORT 🔴` · `ESPERAR ⏸` · `FUERA DE HORARIO ⏸` · `LÍMITE DIARIO 🛑` · `EN OPERACIÓN`

**Mercado en vivo** — precio, RSI, ADX, ATR en dólares y en %, distancia al VWAP (con ⚠ si estás extendido) y **cuenta regresiva al cierre de la vela** (para saber cuántos segundos faltan para que la señal se confirme).

**Operación** — estado, precio de entrada, stop actual (te avisa "sin riesgo" cuando ya está en break-even), TP1/TP2, lote sugerido y **resultado flotante en R y en dólares**.

**Día** — operaciones hechas de tu límite, ganadas/perdidas y resultado acumulado del día en R y en dólares.

En el gráfico además: EMAs, VWAP, rango de apertura en amarillo, killzones sombreadas, líneas de SL/TP de la operación activa y las velas coloreadas mientras estás dentro.

---

## 7. Alarmas con sonido distinto por evento

Está todo en **`ALERTAS_Y_SONIDOS.md`**. Resumen de la realidad técnica:

- **Web y app de escritorio:** ✅ sonido distinto por alerta, nativo. Solo suena con la app abierta.
- **iPad y Android:** ❌ TradingView usa un único tono de notificación para toda la app. **No se puede** cambiar por alerta dentro de TradingView.
- **Solución real para móvil:** webhook → **Telegram** (tres canales, cada uno con su tono — gratis y funciona en iOS y Android) o **Pushover** (tono por mensaje). Requiere plan de pago de TradingView para los webhooks.

El indicador expone **8 condiciones separadas** justamente para que puedas asignarles sonidos distintos: entrada LONG, entrada SHORT, cualquier entrada, TP1, TP2, Stop Loss, cualquier TP y aviso previo de setup formándose.

Las alertas de TP y SL se detectan **dentro de la vela** (no al cierre), así que el aviso te llega en el momento, no un minuto tarde.

---

## 8. Instalación (5 minutos)

1. TradingView → gráfico **XAUUSD** (OANDA o FOREXCOM) en la temporalidad que vayas a operar.
2. **Editor Pine** (pestaña de abajo) → borra todo → pega `ORO_Scalping_PRO_v3.pine` → **Añadir al gráfico**.
3. Abre los ajustes del indicador (⚙️) y pon **tu capital real** y tu **% de riesgo** en el grupo "Gestión de capital". Esto hace que el lote sugerido sea correcto.
4. Elige tu **Ventana de operación** según a qué hora operas.
5. Crea las alertas siguiendo `ALERTAS_Y_SONIDOS.md`.
6. **Antes de operar en real:** pega `ORO_Scalping_PRO_v3_Backtest.pine` y corre el Probador de Estrategias con 6–12 meses. Prueba umbral 70 vs 65 vs 75 y compara.

---

## 9. Crítica honesta de la estrategia

| Debilidad real | Qué se hizo para mitigarla | Lo que sigue siendo tu responsabilidad |
|----------------|---------------------------|----------------------------------------|
| Las rupturas de apertura fallan (fakeouts) | Se exige **cierre** de vela fuera del rango + confluencia de tendencia, VWAP y volumen | ~1 de cada 3 rupturas fallará igual. El TP1 a 1R es lo que te protege. |
| En mercado lateral se acumulan stops | Filtro ADX + filtro de percentil de ATR: sin fuerza ni volatilidad sana, no hay puntos suficientes | Si ves 3 stops seguidos, para. El límite diario lo hace por ti. |
| Las noticias de 08:30 revientan el stop con un latigazo | Colchón de ATR en el stop + filtro de volatilidad extrema | **No hay solución técnica.** Mira el calendario y no entres en el minuto del dato. |
| El score puede dar 70+ y aun así perder | Se añadieron penalizaciones por entrar tarde (RSI extremo) y por extensión del VWAP | Ninguna confluencia garantiza nada. Por eso el riesgo es 1%, no 10%. |
| Exigir 70 puntos deja pocas señales (0–3 al día) | Es intencional. En scalping la rentabilidad viene de la calidad. | Si bajas a 60 tendrás más acción y menos acierto. Es un intercambio, no una mejora. |
| El indicador señala, pero tu broker ejecuta | Slippage y spread no se ven en Pine | Usa brokers con spread bajo en XAUUSD (< 25 centavos) y evita los de spread variable alto en aperturas. |
| Ninguna estrategia funciona para siempre | El backtest está incluido | Revalida cada mes. Si el % de acierto cae bajo 40% durante 2 meses, revisa parámetros. |
| Las temporalidades superiores podrían repintar | Por defecto usa el valor **cerrado** de la TF superior: no repinta nunca | Si activas "en vivo" ganas velocidad pero la señal puede cambiar dentro de la vela. |

**Expectativa realista:** este sistema apunta a **45–55% de acierto con un R promedio de 1.2–1.5**. Eso es matemáticamente muy rentable a largo plazo. Cualquiera que te prometa 90% de acierto en scalping de oro te está mintiendo.

---

## 10. Checklist diario

```
□ ¿El panel muestra ventana operable = SÍ?
□ ¿Hay noticia roja en los próximos 5 minutos? → si sí, espera
□ ¿El SCORE está en 70 o más de un solo lado?
□ ¿La penalización está en 0? (si resta 12, estás entrando tarde)
□ ¿La cuenta regresiva llegó a 0:00? (la señal se confirma al cierre)
□ ¿Puse el lote que dice el panel, ni uno más?
□ SL, TP1 y TP2 puestos ANTES de confirmar la orden
□ Sonó el TP1 → cerrar 50% y mover SL a la entrada
□ ¿Ya llevo 2 pérdidas o 4 operaciones hoy? → cerrar la plataforma
```

---

*Material educativo. El trading con apalancamiento puede generar pérdidas superiores al depósito. Valida siempre en cuenta demo antes de operar con dinero real.*
