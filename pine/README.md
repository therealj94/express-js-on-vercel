# Fenix FF Gold — Fallo del Fallo (Pine Script v6)

Indicador + estrategia para TradingView que implementa de forma mecánica los tres manuales:

| Manual | Qué aporta al código |
|---|---|
| `Liquidity_Sweep_Indicator.pdf` | Máquina de estados de 4 fases (L → F → M → BUY/SELL), SL automático, filtro Gann |
| `Manual_Psicologico_El_Fallo_del_Fallo.pdf` | FC → mitigación → estiramiento ineficiente → **vela de testeo virgen** → rebalanceo |
| `FF_en_Acumulacion.pdf` | Doble F+F en los extremos de un rango, dominancia fractal HTF, TP en el F+F opuesto |

## Archivos

- **`FenixFF_Gold_Indicator.pine`** → para operar en vivo (alertas, zonas, panel de estado).
- **`FenixFF_Gold_Strategy.pine`** → misma lógica en formato `strategy` para el Strategy Tester.

Copiar el contenido completo y pegarlo en el Pine Editor de TradingView → *Add to chart*.

## Lógica exacta que ejecuta el código

**Fase 1 — "L" (liquidez / inducción).** Se detecta un pivote (fractal, `pivotLen`) y se espera que
el precio lo barra **y cierre de vuelta al otro lado** (`low < pivotLow and close > pivotLow`).
Esa vela crea el **FC**; su zona es `[low, max(open,close)]` para largos.

**Fase 2 — "F" (mitigación / primer fallo).** El precio debe primero **alejarse** del FC
(`awayAtr × ATR`) y luego **regresar a la zona**. Esto es la limpieza de impacientes. Si la mecha
rompe la lógica tendencial más allá de `tolAtr × ATR`, el setup muere; si la perfora dentro de la
tolerancia, se **actualiza** el mínimo estructural (así el SL siempre queda detrás de la lógica real).

**Fase 3 — "M" (Fallo del Fallo / estiramiento ineficiente).** Se exigen `minImpulse` (2 por defecto)
velas consecutivas a favor con cuerpo ≥ `dispMult × ATR`, **desplazamiento estructural** (cierre por
encima del FC) y que quede una **ineficiencia** (FVG: `low > high[2]`) de tamaño ≥ `minFvgAtr × ATR`.
Esa FVG **es** la vela de testeo virgen.

**Fase 4 — entrada.** Se espera el rebalanceo quirúrgico de esa ineficiencia
(borde / 50 % / relleno total, configurable). Con `Confirmación` se exige además cierre a favor.
- **SL** = mínimo/máximo estructural − `slBuffAtr × ATR` (la "lógica tendencial", nunca la mecha).
- **TP1** = múltiplo de R (2R por defecto).
- **TP2** = el F+F opuesto o el extremo del rango → el "camino libre" del manual.

**Acumulación.** Si ambas máquinas están en fase ≥ 2 y el rango de `accLen` velas mide ≤ `accMaxAtr × ATR`,
se marca `F+F ACUM`. Con `accOnlyDom` activo solo se opera el extremo alineado a la **Vela Memoria**
de la temporalidad mayor (M30 por defecto) — el otro extremo es el anzuelo.

## Ajustes recomendados para XAUUSD

| Temporalidad | pivotLen | dispMult | minFvgAtr | tolAtr | slBuff | HTF | Sesión |
|---|---|---|---|---|---|---|---|
| **M5** (scalping) | 6 | 0.60 | 0.20 | 0.30 | 0.25 | 30 | Londres + NY |
| **M15** (recomendado) | 8 | 0.55 | 0.18 | 0.25 | 0.20 | 60 | Londres + NY |
| **H1** (swing) | 12 | 0.50 | 0.15 | 0.20 | 0.20 | 240 | desactivada |

Notas específicas del oro:
- El oro tiene mechas grandes: `slBuffAtr` por debajo de 0.15 provoca barridos de SL constantes.
- El rango asiático genera FVGs falsas → mantener `minAtrPct = 0.03` y el filtro de sesión activo.
- Las killzones vienen en **UTC**. Si tu gráfico está en otra zona, cambia `tzInput`
  (ej. `America/New_York` con sesiones `0200-0530` y `0730-1100`).
- Evitar operar 15 min antes/después de NFP, CPI y FOMC: el patrón se cumple pero el slippage lo arruina.

## Cómo backtestear (el test hay que correrlo en TradingView)

El código no se puede compilar ni ejecutar fuera de TradingView, así que el backtest lo corres tú:

1. Abre `XAUUSD` (usa el feed de tu bróker, no OANDA vs Forex.com indistintamente: cambian mechas y spread).
2. Pega `FenixFF_Gold_Strategy.pine` → *Add to chart* → pestaña **Strategy Tester**.
3. En **Properties**, ajusta a tu cuenta real: capital inicial, comisión y `contractVal`
   (1 si tu contrato es 1 onza, 100 si tu bróker usa lotes de 100 oz).
4. Empieza con `riskPct = 1`, `rr1 = 2`, `partialPct = 50`, `moveBe = true`.
5. Mide sobre **al menos 200 operaciones**. Criterios de aceptación razonables en oro:
   Profit Factor > 1.3, drawdown máximo < 20 %, winrate 40–55 % con 2R.
6. Ajusta **de a un parámetro por vez**, en este orden de impacto:
   `dispMult` → `minFvgAtr` → `entryMode` → `fvgFillMode` → `tolAtr`.
7. Valida fuera de muestra: optimiza en 2023–2024 con `useDates`, y verifica en 2025 en adelante.

Menos señales pero más limpias: `entryMode = Confirmación`, `requireBOS = true`, `biasMode = EMA + Vela Memoria`.
Más señales: `entryMode = Toque`, `fvgFillMode = Borde`, `useHtfBias = false`.

## Alertas

`buySig`, `sellSig` y "ineficiencia virgen creada" (aviso anticipado para prepararse al rebalanceo).
Las alertas usan `alert.freq_once_per_bar_close`, es decir **no repintan**: la señal se confirma al
cierre de la vela. En modo `Toque` la señal aparece en la vela que toca la zona; en modo
`Confirmación` en la vela que cierra a favor.

## Limitaciones honestas

- Las fases se evalúan **al cierre de vela**; intrabar el estado puede cambiar hasta que la vela cierre.
- El backtest de la estrategia asume relleno en el cierre (`process_orders_on_close = true`) con
  slippage de 2 ticks; en oro con spread ancho el resultado real será algo peor.
- El TP2 "F+F opuesto" solo existe cuando hay un setup opuesto vivo; si no, cae a `rr2Fallback`.
