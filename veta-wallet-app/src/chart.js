import React, { useState, useMemo, useRef } from 'react';
import { View, Text, Pressable, PanResponder, ActivityIndicator, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Path, Defs, LinearGradient as SvgGrad, Stop, Circle, Text as SvgLabel } from 'react-native-svg';
import { C } from './theme';
import { hap } from './ui';

// ============================================================
// Velas japonesas de Veta Wallet.
//
// Lo que el gráfico tiene que resolver, en orden de importancia:
//   1. Que se lea el precio → escala de precios a la derecha, siempre visible.
//   2. Que se ubique en el tiempo → fechas abajo, con el formato adecuado a
//      la temporalidad (horas en 1D, días en 1M, meses en 1A).
//   3. Que se pueda inspeccionar → al tocar y arrastrar sale una cruz con la
//      vela exacta y su apertura, máximo, mínimo y cierre.
//
// El área de dibujo se mide con onLayout (no con Dimensions) para que se
// adapte igual en teléfono, tablet y horizontal.
// ============================================================

const PAD_R = 54;  // espacio de la escala de precios
const PAD_B = 22;  // espacio del eje de fechas
const PAD_T = 8;

const fmtPrice = (v) => {
  const n = Number(v) || 0;
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 5 });
};

const fmtTime = (ms, days, lang) => {
  const d = new Date(ms);
  const loc = lang === 'es' ? 'es-ES' : 'en-US';
  if (days <= 1) return d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: false });
  if (days <= 90) return d.toLocaleDateString(loc, { day: '2-digit', month: 'short' });
  return d.toLocaleDateString(loc, { month: 'short', year: '2-digit' });
};

const fmtFull = (ms, days, lang) => {
  const d = new Date(ms);
  const loc = lang === 'es' ? 'es-ES' : 'en-US';
  const fecha = d.toLocaleDateString(loc, { day: '2-digit', month: 'short', year: days > 90 ? 'numeric' : undefined });
  if (days > 30) return fecha;
  return `${fecha} · ${d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: false })}`;
};

/** Números "redondos" para la escala de precios (1, 2, 2.5, 5 × 10ⁿ). */
function niceTicks(min, max, n = 5) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const crudo = span / (n - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(crudo)));
  const norm = crudo / mag;
  const paso = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const first = Math.ceil(min / paso) * paso;
  const out = [];
  for (let v = first; v <= max + paso * 0.001; v += paso) out.push(v);
  return out.length >= 2 ? out : [min, max];
}

export function CandleChart({ data, height = 230, days = 1, lang = 'en', loading }) {
  const [W, setW] = useState(0);
  const [sel, setSel] = useState(null); // índice de la vela bajo el dedo
  const box = useRef({ w: 0 });

  // Ancho útil del área de velas (sin la escala de precios).
  const plotW = Math.max(0, W - PAD_R);
  const plotH = Math.max(0, height - PAD_B - PAD_T);

  const { min, max, ticks } = useMemo(() => {
    if (!data?.length) return { min: 0, max: 1, ticks: [] };
    let lo = Infinity, hi = -Infinity;
    for (const d of data) { if (d.l < lo) lo = d.l; if (d.h > hi) hi = d.h; }
    // 6 % de aire arriba y abajo: las velas nunca tocan el borde.
    const aire = (hi - lo) * 0.06 || hi * 0.01 || 1;
    lo -= aire; hi += aire;
    return { min: lo, max: hi, ticks: niceTicks(lo, hi, 5) };
  }, [data]);

  const n = data?.length || 0;
  const cw = n ? plotW / n : 0;                       // ancho por vela
  const bw = Math.max(1.5, Math.min(cw * 0.62, 14));  // ancho del cuerpo
  const yOf = (v) => PAD_T + (1 - (v - min) / (max - min || 1)) * plotH;
  const xOf = (i) => i * cw + cw / 2;

  // ---- cruz de inspección: tocar y arrastrar ----
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // El gráfico se queda con el gesto para que no se lo robe el swipe de
      // navegación mientras el dedo recorre las velas.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => { hap(); mover(e.nativeEvent.locationX); },
      onPanResponderMove: (e) => mover(e.nativeEvent.locationX),
      onPanResponderRelease: () => setSel(null),
      onPanResponderTerminate: () => setSel(null),
    })
  ).current;

  function mover(x) {
    const w = box.current.w - PAD_R;
    const total = box.current.n;
    if (!total || w <= 0) return;
    const i = Math.max(0, Math.min(total - 1, Math.floor((x / w) * total)));
    setSel(i);
  }
  box.current = { w: W, n };

  const cur = sel != null && data?.[sel] ? data[sel] : data?.[n - 1] || null;
  const first = data?.[0];
  const subiendo = cur && first ? cur.c >= first.o : true;

  // Posición de la etiqueta del precio actual, sujeta al área para que no se
  // salga por arriba ni por abajo cuando el cierre toca un extremo.
  const yUlt = n ? Math.max(PAD_T + 9, Math.min(PAD_T + plotH - 9, yOf(data[n - 1].c))) : 0;

  // Fechas del eje X sin repetidas: si dos marcas caen el mismo día (o la
  // misma hora en 1D) se muestra solo la primera.
  const marcasX = useMemo(() => {
    if (!n) return [];
    const idx = [...new Set([0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1])];
    const vistos = new Set();
    return idx.filter((i) => {
      const et = data[i] && fmtTime(data[i].t, days, lang);
      if (!et || vistos.has(et)) return false;
      vistos.add(et);
      return true;
    });
  }, [data, n, days, lang]);

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {/* Cabecera: OHLC de la vela bajo el dedo (o de la última) */}
      {cur ? (
        <View style={st.ohlc}>
          <Text style={st.ohlcDate}>{fmtFull(cur.t, days, lang)}</Text>
          <View style={st.ohlcRow}>
            <OHLC k="O" v={cur.o} />
            <OHLC k="H" v={cur.h} color={C.up} />
            <OHLC k="L" v={cur.l} color={C.down} />
            <OHLC k="C" v={cur.c} color={cur.c >= cur.o ? C.up : C.down} />
          </View>
        </View>
      ) : null}

      <View style={{ height }} {...(n ? pan.panHandlers : {})}>
        {loading && !n ? (
          <View style={[st.center, { height }]}><ActivityIndicator color={C.gold} /></View>
        ) : null}

        {W > 0 && n > 0 ? (
          <Svg width={W} height={height}>
            <Defs>
              <SvgGrad id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={subiendo ? C.up : C.down} stopOpacity="0.16" />
                <Stop offset="1" stopColor={subiendo ? C.up : C.down} stopOpacity="0" />
              </SvgGrad>
            </Defs>

            {/* Rejilla + escala de precios. El valor que quede debajo de la
                etiqueta del precio actual se dibuja sin número, para que no
                se lean dos cifras encima. */}
            {ticks.map((v) => {
              const choca = Math.abs(yOf(v) - yUlt) < 12;
              return (
                <React.Fragment key={`t${v}`}>
                  <Line x1={0} y1={yOf(v)} x2={plotW} y2={yOf(v)} stroke="rgba(255,255,255,0.055)" strokeWidth={1} />
                  {choca ? null : <SvgText x={plotW + 7} y={yOf(v) + 3.5}>{fmtPrice(v)}</SvgText>}
                </React.Fragment>
              );
            })}

            {/* sombra de tendencia bajo los cierres: da lectura de un vistazo */}
            <Path
              d={`M0 ${yOf(data[0].c)} ${data.map((d, i) => `L${xOf(i)} ${yOf(d.c)}`).join(' ')} L${plotW} ${yOf(data[n - 1].c)} L${plotW} ${PAD_T + plotH} L0 ${PAD_T + plotH} Z`}
              fill="url(#fill)"
            />

            {/* velas */}
            {data.map((d, i) => {
              const verde = d.c >= d.o;
              const col = verde ? C.up : C.down;
              const x = xOf(i);
              const top = yOf(Math.max(d.o, d.c));
              const alto = Math.max(1.4, Math.abs(yOf(d.o) - yOf(d.c)));
              const apagada = sel != null && sel !== i;
              return (
                <React.Fragment key={i}>
                  <Line x1={x} y1={yOf(d.h)} x2={x} y2={yOf(d.l)} stroke={col} strokeWidth={1.1} opacity={apagada ? 0.34 : 0.9} />
                  <Rect x={x - bw / 2} y={top} width={bw} height={alto} rx={bw > 4 ? 1.4 : 0.6} fill={col} opacity={apagada ? 0.34 : 1} />
                </React.Fragment>
              );
            })}

            {/* línea del último precio */}
            <Line
              x1={0} y1={yOf(data[n - 1].c)} x2={plotW} y2={yOf(data[n - 1].c)}
              stroke={C.gold} strokeWidth={1} strokeDasharray="4 4" opacity={0.65}
            />
            <Rect x={plotW + 2} y={yUlt - 9} width={PAD_R - 4} height={18} rx={5} fill={C.gold} />
            <SvgText x={plotW + PAD_R / 2} y={yUlt + 3.5} anchor="middle" fill={C.darkText} weight="700">
              {fmtPrice(data[n - 1].c)}
            </SvgText>

            {/* cruz de inspección */}
            {sel != null && data[sel] ? (
              <>
                <Line x1={xOf(sel)} y1={PAD_T} x2={xOf(sel)} y2={PAD_T + plotH} stroke="rgba(255,255,255,0.45)" strokeWidth={1} strokeDasharray="3 3" />
                <Line x1={0} y1={yOf(data[sel].c)} x2={plotW} y2={yOf(data[sel].c)} stroke="rgba(255,255,255,0.45)" strokeWidth={1} strokeDasharray="3 3" />
                <Circle cx={xOf(sel)} cy={yOf(data[sel].c)} r={3.6} fill={C.gold} />
              </>
            ) : null}

            {/* eje de fechas */}
            {marcasX.map((i) => (
              <SvgText
                key={`x${i}`}
                x={Math.min(Math.max(xOf(i), 20), plotW - 20)}
                y={height - 6}
                anchor="middle">
                {fmtTime(data[i].t, days, lang)}
              </SvgText>
            ))}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

// Etiqueta de texto dentro del SVG (react-native-svg exige su propio Text).
function SvgText({ children, x, y, anchor = 'start', fill = C.txt3, weight = '500' }) {
  return (
    <SvgLabel x={x} y={y} fill={fill} fontSize="9.5" fontWeight={weight} textAnchor={anchor}>
      {children}
    </SvgLabel>
  );
}

function OHLC({ k, v, color = C.txt2 }) {
  return (
    <View style={st.ohlcItem}>
      <Text style={st.ohlcK}>{k}</Text>
      <Text style={[st.ohlcV, { color }]}>{fmtPrice(v)}</Text>
    </View>
  );
}

/** Selector de temporalidad (1D · 1W · 1M · 3M · 1Y). */
export function TimeframeBar({ value, options, onChange }) {
  return (
    <View style={st.tfBar}>
      {options.map((o) => {
        const on = o.k === value;
        return (
          <Pressable key={o.k} onPress={() => { hap(); onChange(o.k); }} style={[st.tf, on && st.tfOn]}>
            <Text style={[st.tfTxt, on && { color: C.darkText, fontWeight: '800' }]}>{o.k}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  ohlc: { marginBottom: 8 },
  ohlcDate: { color: C.txt3, fontSize: 10.5, marginBottom: 5 },
  ohlcRow: { flexDirection: 'row', gap: 14 },
  ohlcItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ohlcK: { color: C.txt3, fontSize: 10.5, fontWeight: '700' },
  ohlcV: { fontSize: 11.5, fontWeight: '700' },
  tfBar: { flexDirection: 'row', gap: 6, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 4 },
  tf: { flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  tfOn: { backgroundColor: C.gold },
  tfTxt: { fontSize: 12, fontWeight: '700', color: C.txt2 },
});
