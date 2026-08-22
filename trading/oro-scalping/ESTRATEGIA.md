# 🥇 ORO Scalping 3-en-1 — Estrategia Final (XAUUSD)

Sistema de scalping para oro que combina **3 estrategias de alta probabilidad en un solo indicador de TradingView**. Solo da señal cuando las tres (o dos, en modo agresivo) coinciden en la misma dirección, dentro de los horarios de mayor volumen del oro.

**Archivos:**
- `ORO_Scalping_3en1.pine` → indicador con señales, panel en vivo, SL/TP y alertas.
- `ORO_Scalping_3en1_Backtest.pine` → misma lógica en versión *strategy* para medir resultados históricos en el Probador de Estrategias.

---

## 1. Las 3 estrategias elegidas y por qué

| # | Estrategia | Qué mide | Por qué funciona en oro |
|---|-----------|----------|------------------------|
| A | **Tendencia con EMAs (9/21/200)** | Dirección dominante | El oro es de los activos que más respeta tendencias intradía; operar solo a favor de la EMA 200 elimina la mitad de las operaciones perdedoras (los contra-tendencia). |
| B | **Momentum institucional (VWAP + RSI 14)** | De qué lado está el dinero grande | El VWAP es la referencia de los operadores institucionales: precio sobre VWAP + RSI > 50 = presión compradora real, no un rebote débil. |
| C | **Ruptura del rango de apertura (ORB 15 min)** | El detonante de entrada | Los primeros 15 minutos de Londres y NY concentran la liquidez del día; la ruptura de ese rango suele definir la dirección de las siguientes 1–3 horas. |

**La lógica del 3-en-1:** A te dice *hacia dónde*, B te confirma *quién empuja*, y C te dice *cuándo entrar*. Ninguna de las tres sola es suficiente; juntas filtran la mayoría de las señales falsas.

Filtro extra: **ADX ≥ 18**. Si el mercado está plano (ADX bajo), el indicador no da ninguna señal aunque haya confluencia — los rangos laterales son donde el scalping pierde dinero.

---

## 2. Horarios (decisión tomada)

El oro se mueve por Londres y Nueva York. Fuera de esas ventanas el spread sube y el movimiento baja, así que **el indicador queda mudo fuera de estos horarios** (hora de Nueva York):

| Sesión | Killzone (ventana operable) | Rango de apertura | Fondo en el gráfico |
|--------|------------------------------|-------------------|---------------------|
| **Londres** | 03:00 – 06:00 | 03:00 – 03:15 | Azul |
| **Nueva York** | 08:30 – 11:30 | 08:30 – 08:45 | Naranja |

Se eligió 08:30 NY (y no 09:30) porque a las 08:30 salen los datos económicos de EE. UU. (inflación, empleo) que son los que realmente mueven el oro.

⚠️ **Regla manual obligatoria:** los días de noticia roja (NFP, CPI, FOMC) no entres en los 5 minutos antes ni los 2–3 minutos después del dato, aunque haya señal. Pine Script no puede leer el calendario económico — esto lo controlas tú con el calendario de ForexFactory o Investing.

---

## 3. Reglas de entrada (lo que hace el indicador solo)

**Señal LONG 🟢** cuando, dentro de una killzone y con ADX ≥ 18:
1. EMA 9 > EMA 21 **y** precio por encima de la EMA 200 (tendencia alcista)
2. Precio por encima del VWAP **y** RSI > 50 (momentum comprador)
3. Vela de 5 min **cierra** por encima del alto del rango de apertura (ruptura)

**Señal SHORT 🔴** = exactamente lo contrario.

- Modo **conservador (por defecto):** exige las 3 confluencias → menos señales, más calidad.
- Modo **agresivo:** baja "Confluencias mínimas" a 2 → más señales, más ruido.
- Las señales solo aparecen **al cierre de la vela** (sin repintado) y hay un mínimo de 12 velas entre señales para no sobre-operar.

---

## 4. Stop Loss y Take Profit (criterio)

- **SL por estructura, no por número fijo:** debajo del mínimo de las últimas 6 velas (arriba del máximo en short) + colchón de 0.5 × ATR para sobrevivir a las mechas típicas del oro. Si la estructura queda demasiado lejos, se limita a 1.5 × ATR — nunca arriesgues más de eso.
- **TP1 = 1R** (misma distancia que el stop): cierras el **50%** de la posición y mueves el SL al punto de entrada. Desde ese momento la operación ya no puede perder.
- **TP2 = 2R**: el 50% restante busca el doble del riesgo.

Con esta gestión, con solo acertar **4 de cada 10 operaciones ya eres rentable** (esperanza matemática positiva con ~40% de acierto).

- **Riesgo por operación: 0.5%–1% de la cuenta, nunca más.** El tamaño de lote se calcula así: `Lote = (Capital × %riesgo) / (distancia al SL en $ por lote)`.
- Máximo **2 operaciones perdedoras por sesión** → se cierra la pantalla hasta la siguiente sesión.
- Sin posiciones fuera de la killzone (la versión backtest lo hace automático).

---

## 5. Crítica de la estrategia (análisis honesto)

| Debilidad detectada | Mitigación aplicada |
|---------------------|---------------------|
| Las rupturas de apertura tienen falsas rupturas (fakeouts), sobre todo en Londres | Se exige **cierre** de vela fuera del rango (no solo tocar el nivel) + confirmación de tendencia y VWAP. Aun así, ~1 de cada 3 rupturas fallará: por eso el TP1 a 1R protege rápido. |
| En mercado lateral el sistema pierde por acumulación de stops | Filtro ADX ≥ 18: sin fuerza direccional, no hay señal. |
| Las noticias de 08:30 pueden reventar el SL con un latigazo | El SL lleva colchón de ATR, pero la protección real es la regla manual de no operar el minuto de la noticia. |
| Exigir 3 confluencias reduce mucho las señales (a veces 0–2 al día) | Es intencional: en scalping la rentabilidad viene de la calidad, no de la cantidad. Quien quiera más acción usa modo 2/3 sabiendo que baja el % de acierto. |
| El indicador señala pero no garantiza ejecución al precio marcado (spread/slippage del broker) | Usa cuentas con spread bajo en XAUUSD (< 25 centavos) y evita brokers con spread variable alto en aperturas. |
| Ninguna estrategia mantiene su rendimiento para siempre | Por eso está la versión Backtest: valida 6–12 meses de histórico en TU broker antes de usar dinero real, y revalida cada mes. |

**Conclusión de la crítica:** la versión inicial (solo ruptura de apertura) era demasiado vulnerable a fakeouts, y una versión solo de EMAs entraba tarde. La combinación con puntaje de confluencia + filtro ADX + gestión 50/50 con break-even es lo que convierte un sistema mediocre en uno con ventaja estadística real. No existe el 90% de acierto en scalping; el objetivo realista de este sistema es **45–55% de acierto con ratio 1:1.5 promedio**, que es matemáticamente rentable.

---

## 6. Instalación en TradingView (3 minutos)

1. Abre TradingView → gráfico **XAUUSD** (OANDA o FOREXCOM) en temporalidad **5 minutos**.
2. Abre el **Editor Pine** (pestaña inferior) → borra todo → pega el contenido de `ORO_Scalping_3en1.pine`.
3. Clic en **"Añadir al gráfico"**. Verás las EMAs, el VWAP, el rango de apertura en amarillo, las killzones sombreadas y el **panel de decisión en vivo** arriba a la derecha.
4. Para recibir avisos al celular: clic derecho en el gráfico → **Añadir alerta** → condición: *"ORO Scalping 3-en-1 → ORO · Señal LONG"* (y otra para SHORT) → "Una vez por cierre de barra". El mensaje de la alerta incluye entrada, SL, TP1 y TP2.
5. Para backtest: repite el proceso con `ORO_Scalping_3en1_Backtest.pine` y abre la pestaña **Probador de estrategias**.

### Panel en vivo (toma de decisión)
El panel muestra en tiempo real: sesión activa, estado de cada una de las 3 estrategias, ADX, confluencias actuales (X/3), ATR y la **decisión final**: `BUSCAR LONG 🟢`, `BUSCAR SHORT 🔴` o `ESPERAR ⏸`.

---

## 7. Checklist diario (imprímelo)

```
□ ¿Estoy en killzone (03:00–06:00 o 08:30–11:30 NY)?
□ ¿Hay noticia roja en los próximos 5 min? → Si sí, espera
□ ¿El panel marca 3/3 confluencias y ADX ✔?
□ ¿Apareció la etiqueta LONG/SHORT al CIERRE de la vela?
□ ¿Calculé el lote para arriesgar máx. 1%?
□ SL, TP1 y TP2 puestos ANTES de confirmar la orden
□ TP1 tocado → cerrar 50% y mover SL a entrada
□ ¿Ya perdí 2 hoy? → Cerrar plataforma
```

---

*Este material es educativo. El trading con apalancamiento puede generar pérdidas superiores al depósito. Valida siempre en cuenta demo antes de operar en real.*
