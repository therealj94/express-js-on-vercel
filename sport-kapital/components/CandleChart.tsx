// components/CandleChart.tsx
// Velas japonesas de grado profesional con react-native-svg (compila a APK sin módulos problemáticos).
// Cuerpos y mechas OHLC, barras de volumen, rejilla, eje de precios y línea punteada del último precio.
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, PanResponder } from 'react-native';
import Svg, { Rect, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { colors, font, radius, themedSheet, type Palette } from '@/theme/tokens';
import type { Candle } from '@/data/teams';
import { tap } from '@/utils/haptics';
import { t } from '@/utils/i18n';
import { Icon } from '@/components/Icon';

export type Timeframe = '1m' | '5m' | '15m' | '1H';
const TF_GROUP: Record<Timeframe, number> = { '1m': 1, '5m': 5, '15m': 15, '1H': 60 };
export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1H'];

function aggregate(candles: Candle[], group: number): Candle[] {
  if (group <= 1) return candles;
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i += group) {
    const chunk = candles.slice(i, i + group);
    if (!chunk.length) continue;
    out.push({
      t: chunk[0].t,
      o: chunk[0].o,
      c: chunk[chunk.length - 1].c,
      h: Math.max(...chunk.map((c) => c.h)),
      l: Math.min(...chunk.map((c) => c.l)),
      v: chunk.reduce((a, c) => a + c.v, 0),
    });
  }
  return out;
}

function chartWField(width: number, n: number): number {
  return (width - 52) / Math.max(n, 1); // mismo cálculo que cw (width - eje)
}

// Media móvil simple sobre el cierre — null hasta juntar "period" velas.
// Igual que las MA(7)/MA(25) de cualquier plataforma de trading.
function maSeries(src: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(src.length).fill(null);
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i].c;
    if (i >= period) sum -= src[i - period].c;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

const MIN_BARS = 10;
const ZOOM_STEP = 0.7; // cada tap cambia ~30% la cantidad de velas visibles

export function CandleChart({ candles, width, height = 260, visible = 42, entryPrice }: {
  candles: Candle[];
  width: number;
  height?: number;
  visible?: number;
  /** Precio promedio de compra de la posición abierta: dibuja la línea de entrada con P&L en vivo. */
  entryPrice?: number;
}) {
  const [tf, setTf] = useState<Timeframe>('1m');
  // cantidad de velas que el usuario quiere ver — se mantiene igual al
  // cambiar de temporalidad (antes era un número fijo por prop, y como cada
  // temporalidad agrupa una cantidad muy distinta de velas, el gráfico
  // "saltaba" de zoom sin que hubiera forma de corregirlo manualmente).
  const [barsShown, setBarsShown] = useState(visible);
  // desplazamiento hacia atrás en la historia (en velas, 0 = en vivo).
  // Se arrastra con el dedo, como en cualquier plataforma de trading.
  const [offset, setOffset] = useState(0);

  const fullAgg = useMemo(() => aggregate(candles, TF_GROUP[tf]), [candles, tf]);
  const maxBars = Math.max(fullAgg.length, 1);
  const clampedBars = Math.min(Math.max(barsShown, Math.min(MIN_BARS, maxBars)), maxBars);
  const maxOffset = Math.max(0, maxBars - clampedBars);
  const clampedOffset = Math.min(offset, maxOffset);

  const { data, startIdx } = useMemo(() => {
    const end = maxBars - clampedOffset;
    const start = Math.max(0, end - clampedBars);
    return { data: fullAgg.slice(start, end), startIdx: start };
  }, [fullAgg, clampedBars, clampedOffset, maxBars]);

  // medias móviles calculadas sobre TODA la serie (así la ventana visible
  // arranca con valores ya "calientes", como en un exchange de verdad)
  const ma7full = useMemo(() => maSeries(fullAgg, 7), [fullAgg]);
  const ma25full = useMemo(() => maSeries(fullAgg, 25), [fullAgg]);

  const canZoomIn = clampedBars > Math.min(MIN_BARS, maxBars);
  const canZoomOut = clampedBars < maxBars;
  const zoomIn = () => { tap(); setBarsShown((b) => Math.max(MIN_BARS, Math.round(Math.min(b, maxBars) * ZOOM_STEP))); };
  const zoomOut = () => { tap(); setBarsShown((b) => Math.min(maxBars, Math.round(Math.max(b, MIN_BARS) / ZOOM_STEP))); };

  // ---- arrastre horizontal (pan) sobre el gráfico ----
  const panStart = useRef(0);
  const barsRef = useRef<{ cw: number; maxOffset: number; startOffset?: number }>({ cw: 1, maxOffset: 0 });
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
      onPanResponderGrant: () => { panStart.current = -1; },
      onPanResponderMove: (_e, g) => {
        if (panStart.current === -1) panStart.current = barsRef.current.startOffset ?? 0;
        const deltaBars = Math.round(g.dx / Math.max(1, barsRef.current.cw));
        const next = Math.min(barsRef.current.maxOffset, Math.max(0, panStart.current + deltaBars));
        setOffset(next);
      },
    })
  ).current;

  barsRef.current = { cw: chartWField(width, data.length), maxOffset, startOffset: clampedOffset };

  const AXIS_W = 52;
  const VOL_H = 42;
  const PAD_T = 8;
  const chartW = width - AXIS_W;
  const priceH = height - VOL_H - PAD_T - 6;

  const { min, max, maxV } = useMemo(() => {
    if (!data.length) return { min: 0, max: 1, maxV: 1 };
    let mn = Infinity, mx = -Infinity, mv = 0;
    for (const c of data) { mn = Math.min(mn, c.l); mx = Math.max(mx, c.h); mv = Math.max(mv, c.v); }
    // la línea de entrada siempre debe quedar visible en el rango del gráfico
    if (entryPrice != null) { mn = Math.min(mn, entryPrice); mx = Math.max(mx, entryPrice); }
    const pad = (mx - mn) * 0.08 || mx * 0.01;
    return { min: mn - pad, max: mx + pad, maxV: mv };
  }, [data, entryPrice]);

  const y = (p: number) => PAD_T + ((max - p) / (max - min || 1)) * priceH;
  const cw = chartW / Math.max(data.length, 1);
  const bodyW = Math.max(2.5, cw * 0.62);

  const last = data[data.length - 1];
  const gridLines = 4;

  // puntos de las medias móviles dentro de la ventana visible (y acotados al
  // área de precio para que nunca invadan la zona de volumen)
  const maPoints = (serie: (number | null)[]) => {
    const pts: string[] = [];
    for (let i = 0; i < data.length; i++) {
      const v = serie[startIdx + i];
      if (v == null) continue;
      const cx = i * cw + cw / 2;
      const gy = Math.max(PAD_T, Math.min(PAD_T + priceH, y(v)));
      pts.push(`${cx},${gy}`);
    }
    return pts.join(' ');
  };
  const ma7Pts = maPoints(ma7full);
  const ma25Pts = maPoints(ma25full);
  const ma7Last = ma7full[startIdx + data.length - 1];
  const ma25Last = ma25full[startIdx + data.length - 1];

  if (!data.length) return <View style={{ height }} />;

  return (
    <View>
      {/* Selector de temporalidad + zoom */}
      <View style={styles.headRow}>
        <View style={styles.tfRow}>
          {TIMEFRAMES.map((t) => (
            <Pressable key={t} onPress={() => { tap(); setTf(t); setOffset(0); }} style={[styles.tf, tf === t && styles.tfOn]}>
              <Text style={[styles.tfTxt, tf === t && styles.tfTxtOn]}>{t}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.zoomRow}>
          <Pressable onPress={zoomOut} disabled={!canZoomOut} style={[styles.zoomBtn, !canZoomOut && styles.zoomBtnOff]}>
            <Icon name="zoom-out" size={14} color={canZoomOut ? colors.textSecondary : colors.textTertiary} />
          </Pressable>
          <Pressable onPress={zoomIn} disabled={!canZoomIn} style={[styles.zoomBtn, !canZoomIn && styles.zoomBtnOff]}>
            <Icon name="zoom-in" size={14} color={canZoomIn ? colors.textSecondary : colors.textTertiary} />
          </Pressable>
        </View>
      </View>

      {/* leyenda de indicadores, como la barra de MA de un exchange */}
      {(ma7Last != null || ma25Last != null) && (
        <View style={styles.maRow}>
          {ma7Last != null && <Text style={[styles.maTxt, { color: colors.gold }]}>MA(7) {ma7Last.toFixed(2)}</Text>}
          {ma25Last != null && <Text style={[styles.maTxt, { color: colors.purple }]}>MA(25) {ma25Last.toFixed(2)}</Text>}
        </View>
      )}

      <View {...pan.panHandlers}>
      <Svg width={width} height={height}>
        {/* rejilla + eje de precios */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const gy = PAD_T + (priceH / gridLines) * i;
          const price = max - ((max - min) / gridLines) * i;
          return (
            <React.Fragment key={i}>
              <Line x1={0} y1={gy} x2={chartW} y2={gy} stroke={colors.border} strokeWidth={1} />
              <SvgText x={chartW + 6} y={gy + 4} fill={colors.textTertiary} fontSize={10} fontWeight="600">
                {price >= 1000 ? price.toFixed(0) : price.toFixed(2)}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* línea de entrada de la posición abierta, con P&L en vivo */}
        {entryPrice != null && last && (() => {
          const pnlPct = ((last.c - entryPrice) / entryPrice) * 100;
          const entryUp = pnlPct >= 0;
          const ey = y(entryPrice);
          return (
            <React.Fragment>
              <Line x1={0} y1={ey} x2={chartW} y2={ey} stroke={colors.gold} strokeWidth={1.3} strokeDasharray="7,4" opacity={0.85} />
              <Rect x={0} y={ey - 10} width={96} height={20} rx={4} fill={colors.gold} />
              <SvgText x={6} y={ey + 4} fill="#1A1500" fontSize={10} fontWeight="800">
                {`Compra ${entryUp ? '+' : ''}${pnlPct.toFixed(1)}%`}
              </SvgText>
            </React.Fragment>
          );
        })()}

        {/* línea del último precio */}
        {last && (
          <>
            <Line x1={0} y1={y(last.c)} x2={chartW} y2={y(last.c)} stroke={last.c >= last.o ? colors.profit : colors.loss} strokeWidth={1} strokeDasharray="4,4" opacity={0.7} />
            <Rect x={chartW} y={y(last.c) - 9} width={AXIS_W} height={18} rx={4} fill={last.c >= last.o ? colors.profit : colors.loss} />
            <SvgText x={chartW + 5} y={y(last.c) + 4} fill="#04120A" fontSize={10} fontWeight="800">
              {last.c >= 1000 ? last.c.toFixed(0) : last.c.toFixed(2)}
            </SvgText>
          </>
        )}

        {/* velas */}
        {data.map((c, i) => {
          const cx = i * cw + cw / 2;
          const up = c.c >= c.o;
          const color = up ? colors.profit : colors.loss;
          const bodyTop = y(Math.max(c.o, c.c));
          const bodyH = Math.max(1.5, Math.abs(y(c.o) - y(c.c)));
          return (
            <React.Fragment key={c.t + '-' + i}>
              <Line x1={cx} y1={y(c.h)} x2={cx} y2={y(c.l)} stroke={color} strokeWidth={1.2} />
              <Rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} rx={0.5} />
            </React.Fragment>
          );
        })}

        {/* medias móviles MA(7) y MA(25), como en un exchange */}
        {ma7Pts.length > 0 && <Polyline points={ma7Pts} fill="none" stroke={colors.gold} strokeWidth={1.4} opacity={0.9} />}
        {ma25Pts.length > 0 && <Polyline points={ma25Pts} fill="none" stroke={colors.purple} strokeWidth={1.4} opacity={0.85} />}

        {/* volumen */}
        {data.map((c, i) => {
          const cx = i * cw + cw / 2;
          const up = c.c >= c.o;
          const vh = (c.v / (maxV || 1)) * (VOL_H - 6);
          return (
            <Rect
              key={'v' + c.t + '-' + i}
              x={cx - bodyW / 2}
              y={height - vh}
              width={bodyW}
              height={vh}
              fill={up ? colors.profit : colors.loss}
              opacity={0.35}
            />
          );
        })}
      </Svg>
      {clampedOffset > 0 && (
        <Pressable onPress={() => { tap(); setOffset(0); }} style={styles.livePill}>
          <Text style={styles.livePillTxt}>{t('common.live')} →</Text>
        </Pressable>
      )}
      </View>

      {/* Leyenda OHLC de la última vela */}
      {last && (
        <View style={styles.ohlc}>
          <Ohlc k="A" v={last.o} />
          <Ohlc k="Máx" v={last.h} />
          <Ohlc k="Mín" v={last.l} />
          <Ohlc k="C" v={last.c} color={last.c >= last.o ? colors.profit : colors.loss} />
        </View>
      )}
    </View>
  );
}

const Ohlc = ({ k, v, color }: { k: string; v: number; color?: string }) => (
  <Text style={styles.ohlcTxt}>
    {k} <Text style={{ color: color ?? colors.text, fontWeight: '700' }}>{v.toFixed(2)}</Text>
  </Text>
);

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  tfRow: { flexDirection: 'row', gap: 8 },
  zoomRow: { flexDirection: 'row', gap: 6 },
  zoomBtn: { width: 28, height: 28, borderRadius: radius.sm, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  zoomBtnOff: { opacity: 0.4 },
  livePill: { position: 'absolute', right: 60, bottom: 52, backgroundColor: colors.gold, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 5 },
  livePillTxt: { color: '#14000F', fontSize: font.size.xs, fontWeight: '800', letterSpacing: 0.5 },
  tf: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  tfOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  tfTxt: { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: '700' },
  tfTxtOn: { color: '#1A1500' },
  ohlc: { flexDirection: 'row', gap: 14, marginTop: 8 },
  ohlcTxt: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '600' },
  maRow: { flexDirection: 'row', gap: 14, marginBottom: 4 },
  maTxt: { fontSize: font.size.xs, fontWeight: '800', letterSpacing: 0.3 },
}));
