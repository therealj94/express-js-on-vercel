# 🥇 ORO FINAL — El sistema completo de scalping de oro (XAUUSD)

Un solo indicador de TradingView que **decide contigo de principio a fin**: te da la entrada con probabilidad 1–100, calcula el stop, los dos objetivos y el lote exacto, te avisa con sonido en cada evento y — lo nuevo — **vigila la operación mientras estás dentro** y te dice "🚪 MEJOR SALIR" con el motivo exacto si el mercado se gira antes de llegar al stop.

**Archivos de esta carpeta**

| Archivo | Para qué sirve |
|---------|----------------|
| **`ORO_FINAL.pine`** | El producto final. Pégalo en el Editor Pine de TradingView. |
| `ORO_FINAL_Backtest.pine` | La misma lógica en versión *strategy* para medir el % de acierto real. |
| `ALERTAS_Y_SONIDOS.md` | Sonidos distintos por evento en web, iPad y Android (Telegram/Pushover). |
| `versiones-anteriores/` | v1, v2 y v3 conservadas como historial del desarrollo. |

---

## 1. Empezar en 3 pasos (para cualquier persona)

1. **Pega el código:** TradingView → gráfico XAUUSD (OANDA o FOREXCOM) en 5 minutos → Editor Pine → pegar → "Añadir al gráfico".
2. **Dile quién eres:** en los ajustes (⚙️) pon tu **capital**, tu **% de riesgo** (1% recomendado) y elige tu **perfil**:
   - 🟢 **Principiante** — solo señales de máxima calidad (umbral 78, máx. 2 operaciones/día)
   - 🟡 **Equilibrado** — el recomendado (umbral 70)
   - 🔴 **Experimentado** — más señales, más ruido (umbral 62)
3. **Sigue el semáforo del panel.** No hay que interpretar nada:

| El panel dice | Qué haces |
|---------------|-----------|
| ⚪ ESPERAR — SIN CONFLUENCIA | Nada. No mires el gráfico con hambre. |
| 🟡 LONG/SHORT FORMÁNDOSE… | Prepárate. Suena la alerta ⑧. |
| 🟢 ENTRAR LONG ★★ | Entra con el lote que dice el panel. SL/TP ya calculados. |
| 🔴 ENTRAR SHORT ★★ | Igual, hacia abajo. |
| EN OPERACIÓN + salud verde | Mantén. El sistema vigila por ti. |
| Salud amarilla ⚠️ VIGILAR | Atento. Mira el "Motivo" en el panel. |
| Salud roja 🚪 MEJOR SALIR | Cierra manualmente. Suena la alerta ⑨. |
| 🛑 LÍMITE DIARIO — DESCANSA | Cierra la plataforma. Mañana hay más mercado. |

Las estrellas son la calidad de la señal: ★ = score 70–79 · ★★ = 80–89 · ★★★ = 90+.

---

## 2. Cómo decide la ENTRADA — score 1–100 con 11 factores

Cada vela se puntúan LONG y SHORT por separado:

| # | Factor | Condición LONG (SHORT = inverso) | Puntos |
|---|--------|----------------------------------|--------|
| 1 | Tendencia de tu temporalidad | EMA 9 > 21 y precio > EMA 200 (solo EMAs = mitad) | 15 |
| 2 | Tendencia 15 m | EMA 21 > EMA 50 | 8 |
| 3 | Tendencia 1 H | EMA 21 > EMA 50 | 7 |
| 4 | Momentum institucional | Precio > VWAP (7) + RSI > 50 (6) | 13 |
| 5 | Ruptura | Cierre fuera del rango de apertura (killzone) o del rango de la última hora | 12 |
| 6 | Fuerza ADX | Escalado hasta ADX 40 | 10 |
| 7 | Horario | Killzone 12 · Londres/NY 6.6 · Asia 2.4 | 12 |
| 8 | Vela de confirmación | Cuerpo ≥ 50% a favor | 8 |
| 9 | Volumen relativo | ≥ 1.3× su media (≥1× = mitad) | 7 |
| 10 | Régimen de volatilidad | ATR entre percentil 25 y 92 | 4 |
| 11 | Dólar (DXY) | DXY débil = bueno para oro LONG | 4 |

**Penalizaciones:** −12 si el RSI está extremo (entras tarde) · −8 si el precio está a más de 2×ATR del VWAP (demasiado extendido). Esto mata las entradas en el clímax, el error #1 del scalper.

⚠️ El score mide **calidad de confluencia**, no un % de acierto garantizado. El % real te lo da el backtest con tu broker.

---

## 3. SL, TP y lote — todo calculado

- **Stop Loss:** debajo del swing de ~30 min + colchón de 0.5×ATR, limitado a 1.5×ATR máximo.
- **TP1 = 1R:** cierras 50% y el stop sube a la entrada → **la operación ya no puede perder**.
- **TP2 = 2R:** el resto, con trailing de 1.5×ATR para dejar correr los movimientos buenos.
- **Lote:** el panel lo calcula con tu capital y tu % de riesgo: `Lote = (Capital × %riesgo) ÷ (distancia al SL × onzas por lote)`. Copias el número y listo.
- **Disciplina automática:** máx. 4 operaciones/día (2 en perfil Principiante) y máx. 2 pérdidas/día — después el sistema deja de dar señales.

Con esta gestión, acertando 4 de cada 10 ya eres rentable.

---

## 4. LA SALIDA INTELIGENTE — lo que casi ningún indicador tiene

El peor momento del trading es estar dentro y no saber si aguantar o salir. ORO FINAL lo resuelve con la **Salud de la operación (0–100)**, visible como barra en el panel:

| Condición en contra | Resta |
|---------------------|-------|
| Las EMAs se cruzaron en tu contra | −30 |
| El precio cruzó el VWAP en tu contra | −25 |
| La operación lleva ~2 h estancada sin tocar TP1 | −20 |
| El RSI se giró en contra | −15 |
| Vela fuerte en contra | −10 |
| El mercado se murió (ADX < 15) | −10 |

- **Salud ≥ 65 → MANTENER ✅** (verde)
- **40–64 → VIGILAR ⚠️** (amarillo, el panel muestra el motivo exacto: "VWAP en contra · RSI en contra")
- **< 40 → 🚪 MEJOR SALIR** (rojo): etiqueta en el gráfico + alerta ⑨ con sonido. Tú decides, pero el sistema te lo dijo *antes* de que el precio llegara al stop.

**Por qué importa:** un stop de −1R que cierras a −0.4R porque la salud avisó a tiempo, repetido 50 veces al año, es una diferencia enorme en la cuenta. En el backtest la salida inteligente está activa para que midas su efecto real (puedes apagarla y comparar).

---

## 5. Horarios y temporalidad

- **3 ventanas:** Solo killzones (Londres 03:00–06:00 y NY 08:30–11:30, hora NY — recomendado), Londres+NY completo (02:00–17:00) o 24 horas. Fuera de killzone el factor horario baja solo, así que en 24h las señales nocturnas exigen confluencia casi perfecta.
- **Cualquier temporalidad:** el sistema convierte todo a tiempo real (ruptura ≈ 1 h, swing ≈ 30 min, estancamiento ≈ 2 h), así que funciona igual en 1m, 5m o 15m. Recomendado 5m.
- ⚠️ **Regla manual:** en noticia roja (NFP, IPC, FOMC) no entres 5 min antes ni 2–3 min después del dato. Pine no puede leer el calendario económico.

---

## 6. Notificaciones — 9 eventos, 9 sonidos posibles

① Entrada LONG · ② Entrada SHORT · ③ Cualquier entrada · ④ TP1 · ⑤ TP2 · ⑥ Stop Loss · ⑦ Cualquier TP · ⑧ Setup formándose · **⑨ MEJOR SALIR**

- **Web/escritorio:** sonido distinto por alerta, nativo (guía en `ALERTAS_Y_SONIDOS.md`).
- **iPad/Android:** TradingView usa un solo tono; para sonidos distintos: webhook → Telegram (un canal por tipo de evento, cada canal con su tono — gratis) o Pushover. Los JSON listos están en la guía.
- TP, SL y MEJOR SALIR se detectan **dentro de la vela** — el aviso llega en el momento.
- El mensaje llega completo: `🟢 ORO LONG ★★ | Score 82 | Entrada 2418.55 | SL 2415.10 | TP1 2422.00 | TP2 2425.45 | Lote 0.29`.

---

## 7. El panel — diseño final

De arriba a abajo, en orden de decisión:

1. **Cabecera** — temporalidad y sesión activa (🔥 cuando estás en killzone).
2. **Score con barra visual** — `███████░░░ 72` LONG y SHORT lado a lado. Se pone amarillo cerca del umbral, verde/rojo al superarlo.
3. **El semáforo** — una fila ancha con fondo de color que dice exactamente qué hacer: ENTRAR / FORMÁNDOSE / ESPERAR / FUERA DE HORARIO / LÍMITE DIARIO / EN OPERACIÓN.
4. **Salud de la operación** (cuando estás dentro) — barra 0–100 + MANTENER/VIGILAR/SALIR + el motivo exacto.
5. **Factores** — los 11 con sus puntos en vivo, para ver *por qué* el score es el que es.
6. **Mercado en vivo** — precio, cuenta regresiva de la vela, RSI, ADX, ATR, distancia al VWAP.
7. **Plan / Tu operación** — entrada, stop (avisa "SIN RIESGO ✅" tras TP1), TP1/TP2, lote en dorado, resultado flotante en R y $.
8. **Hoy** — operaciones usadas, ganadas/perdidas, resultado del día en R y $.

---

## 8. Crítica final (lo que este sistema NO hace)

- **No garantiza nada.** Expectativa realista: 45–55% de acierto con R promedio 1.2–1.5 — matemáticamente rentable, no magia. Quien promete 90% en scalping miente.
- **No lee noticias.** El minuto del NFP es tuyo: no entres.
- **No ejecuta por ti.** Señala y acompaña; el botón lo aprietas tú (la ejecución automática exige webhook + broker API y otra gestión de errores).
- **No sustituye el backtest.** Corre `ORO_FINAL_Backtest.pine` 6–12 meses en tu broker antes de arriesgar un dólar, y revalida cada mes. Prueba con salida inteligente ON vs OFF y umbral 70 vs 62 vs 78.
- **La salida inteligente también se equivoca:** a veces te saca de una operación que se habría recuperado. En promedio protege más de lo que cuesta, pero el backtest con TUS datos tiene la última palabra.

---

## 9. Checklist diario

```
□ Panel dice ventana operable y NO estás en los 5 min de una noticia roja
□ Semáforo en 🟢 o 🔴 con al menos ★ (y la vela CERRÓ — cuenta regresiva en 0)
□ Lote = el que dice el panel, ni uno más
□ SL, TP1 y TP2 puestos ANTES de confirmar la orden
□ Suena ④ TP1 → cierra 50% y sube el stop a la entrada
□ Suena ⑨ MEJOR SALIR → lee el motivo y cierra; no discutas con el semáforo
□ 2 pérdidas o límite de operaciones → plataforma cerrada hasta mañana
```

---

*Material educativo. El trading con apalancamiento puede generar pérdidas superiores al depósito. Valida en demo antes de operar en real.*
