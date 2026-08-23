# 🤖 ORO FINAL EA v2.00 ULTIMATE — Bot automático para MetaTrader 5 (Exness)

> **v2.10 — revisión de trader pro:** todas las órdenes van por **ticket** (cero ambigüedad aunque operes a mano en el mismo símbolo), break-even con colchón de 0.1×ATR (cubre spread y comisión), distancia mínima del SL de 0.6×ATR, **TP2 limitado por la estructura de 4 h** (cobra donde el precio suele frenar) y chequeo de margen antes de cada apertura (reduce el lote si no alcanza, jamás rechaza la orden a ciegas).
>
> **v2.00 — auditoría completa:** rango de apertura calculado por velas (sobrevive a reinicios del VPS), selección de posición por magic (puedes operar a mano en la misma cuenta sin chocar con el bot), freno diario persistente (un reinicio ya no lo resetea), respeto del stops-level del broker, velas de gracia antes de la salida inteligente, ventanas de noticias bloqueables, objetivo diario opcional, cierre automático de viernes y log de errores de cada orden.

El bot ejecuta solo la estrategia ORO FINAL: analiza, entra, pone SL y TP, cierra el 50% en TP1, mueve el stop a la entrada, hace trailing, y cierra anticipado si la salud de la operación cae. Tú solo lo enciendes.

---

## 1. Primero: la verdad sobre Exness y los bots

**Usar un Expert Advisor (EA) en Exness es 100% legal y permitido.** Exness soporta oficialmente MT4/MT5 con EAs, incluso ofrece VPS para correrlos. **Nadie te banea por usar un bot normal.**

Lo que sí prohíben los términos de Exness (y de casi todos los brokers) son **prácticas abusivas**, no los bots:

| Práctica prohibida | ¿Este bot lo hace? |
|--------------------|--------------------|
| Arbitraje de latencia (explotar precios retrasados del servidor) | ❌ No. Opera señales técnicas con velas cerradas. |
| Abuso de cuentas swap-free (mantener posiciones para evitar swaps masivos) | ❌ No. Es scalping intradía; cierra todo al terminar la sesión. |
| Abuso de bonos con múltiples cuentas | ❌ No aplica. |
| Cobertura maliciosa entre cuentas propias o con terceros | ❌ No. Una sola posición, una sola cuenta. |
| Sobrecarga del servidor con miles de órdenes/modificaciones | ❌ No. Máx. 4 entradas al día, modificaciones limitadas. |

**Diseño deliberadamente "broker-friendly":**
- Máximo 4 operaciones/día y 60 min entre entradas → frecuencia bajísima
- Siempre con Stop Loss desde el primer segundo
- Sin martingala, sin grid, sin promediar pérdidas (las prácticas que sí destruyen cuentas)
- Filtro de spread: si el spread supera $0.35/oz (noticia, madrugada), no entra
- Freno de emergencia: si el día pierde más del 3% del balance, el bot se apaga hasta mañana

**Recomendaciones de cuenta en Exness:** usa **Standard** o **Pro/Raw Spread** (Raw suele ser mejor para scalping de oro por spread bajo + comisión fija). No actives swap-free si no te corresponde por región/religión — ese sí es un motivo real de revisión de cuenta.

---

## 2. Instalación (10 minutos)

1. Abre **MetaTrader 5** de Exness → menú **Archivo → Abrir carpeta de datos**.
2. Entra a `MQL5/Experts/` y copia ahí `ORO_FINAL_EA.mq5`.
3. En MT5 abre el **MetaEditor** (F4), abre el archivo y pulsa **Compilar** (F7). Debe decir `0 errors`. *(Si aparece algún error, cópialo y me lo pasas — lo corrijo.)*
4. Vuelve a MT5 → abre un gráfico **XAUUSD** en **M5**.
5. Arrastra `ORO_FINAL_EA` desde el Navegador al gráfico.
6. En la pestaña **Común** marca ✅ *Permitir trading algorítmico*, y verifica que el botón **Algo Trading** de la barra superior esté en verde.
7. En **Parámetros de entrada**, revisa la sección de abajo (sobre todo los HORARIOS).
8. Verás el estado del bot como texto en la esquina superior izquierda del gráfico y el detalle en la pestaña **Expertos**.

### ⚠️ El único ajuste obligatorio: los horarios

El bot usa la **hora del SERVIDOR de Exness**, no la tuya. Los valores por defecto (Londres 08:00–11:00, NY 13:30–16:30) asumen servidor en GMT+0.

**Verifícalo así:** mira la hora en la esquina de "Observación del mercado" en MT5 y compárala con la hora de Nueva York en ese momento. Si el servidor va X horas adelante de NY, suma X a los horarios de NY del indicador de TradingView (03:00–06:00 y 08:30–11:30 NY). Ejemplo: servidor GMT+0 en verano = NY+4 → Londres 07:00–10:00, NY 12:30–15:30. Ajusta los 4 inputs de sesión y listo.

---

## 3. Parámetros inteligentes — qué tocar y qué no

**Para empezar (primeras 2–4 semanas):**

| Parámetro | Valor inicial | Por qué |
|-----------|--------------|---------|
| Riesgo por operación | **0.5%** | Hasta que el bot demuestre números en TU cuenta |
| Score mínimo | **70** | Equilibrado. 78 si quieres máxima selectividad |
| Ventana | **0 (solo killzones)** | Las horas estadísticamente mejores del oro |
| Freno diario | **3%** | Un día malo no puede hacer daño real (persiste aunque el VPS se reinicie) |
| Objetivo diario | **0 (apagado)** | Si pones 4, al ganar +4% el bot descansa hasta mañana — protege las ganancias |
| Ventanas de noticias | vacío | Opcional: "13:25-13:40" (hora servidor) bloquea entradas alrededor de un dato. Nota: el rango de apertura de 15 min ya evita entrar en el minuto exacto del dato de las 8:30 NY |
| Cierre de viernes | **activado, 20:00** | Nunca duerme posiciones el fin de semana (solo relevante en modo 24h) |
| Spread máximo | **0.35** | En Standard sube a 0.40; en Raw baja a 0.25 |

**No toques** (ya están optimizados para XAUUSD): ATR, EMAs, RSI, ADX, colchones del SL, RR1/RR2, trailing.

**Cuándo subir el riesgo:** solo después de 30+ operaciones reales con resultado neto positivo, y de 0.5% → 0.75% → 1%. Nunca más de 1%.

---

## 4. Backtest y demo — obligatorio antes de dinero real

1. **Probador de estrategias de MT5** (Ctrl+R): elige el EA, XAUUSD, M5, modo "Cada tick basado en ticks reales", 6–12 meses. Mira: profit factor (>1.3 bien), drawdown máximo (<15% bien) y % de acierto (45–55% es lo esperado).
2. **Demo 2 semanas mínimo:** cuenta demo de Exness con el mismo balance que piensas usar en real. El bot debe comportarse igual que el backtest.
3. **Real con poco:** empieza con una cuenta pequeña o cent. Súbela solo cuando el bot lleve un mes positivo.

---

## 5. Para que "se active solo" de verdad: VPS

El bot solo opera mientras MT5 está abierto. Para que trabaje 24/5 sin tu computadora:

- **VPS de Exness:** gratis si cumples requisitos de depósito/actividad (pídelo en el área personal). Es lo más simple: MT5 corre en su servidor, cerca del broker, latencia mínima.
- **Alternativa:** cualquier VPS Windows (Contabo, ~$8/mes). Instalas MT5, inicias sesión, cargas el EA y cierras el escritorio remoto — el bot sigue corriendo.

Con VPS: enciendes el EA una vez y se activa solo cada día en sus horarios, sin tocar nada.

---

## 6. Qué hace el bot exactamente (transparencia total)

Cada vela cerrada de M5:
1. Calcula el score LONG y SHORT (0–100) con los mismos 10 factores del indicador de TradingView (sin el DXY, que no existe de forma fiable en MT5 — su peso se redistribuye).
2. Si un lado cruza el umbral dentro de la ventana operable, con spread aceptable, sin exceder límites diarios y sin freno de emergencia activo → **entra** con el lote calculado para arriesgar exactamente tu %.
3. La orden nace con **SL** (estructura + ATR, máx. 1.5×ATR) y **TP2** (2R).
4. Al tocar **TP1** (1R): cierra el 50% y mueve el stop a la entrada → operación sin riesgo.
5. Después hace **trailing** de 1.5×ATR sobre el resto.
6. Cada vela evalúa la **salud** (0–100): si cae bajo 40 (EMAs cruzadas en contra, VWAP en contra, estancada 2h...) → **cierra anticipado** sin esperar al stop.
7. Al terminar la killzone cierra lo que quede abierto. Nunca duerme con posiciones.

En el gráfico verás el estado en vivo: score actual, operaciones del día, salud de la posición y avisos de límites.

---

## 7. Expectativas honestas

- Objetivo realista: **45–55% de acierto con R promedio 1.2–1.5** → rentable a largo plazo, con semanas perdedoras incluidas. Cualquier "bot que gana 90%" es una estafa.
- El bot ejecuta una estrategia con ventaja estadística y disciplina de hierro (que es donde fallan los humanos), pero **no elimina el riesgo**: puede tener rachas de 4–6 pérdidas seguidas. Con 0.5% de riesgo eso es −2/−3% — sobrevivible por diseño.
- **Noticias:** el filtro de spread lo protege del peor momento (el spread explota en NFP/CPI y el bot no entra), pero no lee el calendario. Los días de FOMC considera apagarlo manualmente 30 min antes del comunicado.
- Revalida el backtest cada mes. Si el mercado cambia de régimen, mejor pausar que insistir.

---

*Material educativo. El trading automatizado con apalancamiento puede generar pérdidas superiores al depósito. Pruébalo en demo y arriesga solo capital que puedas permitirte perder.*
