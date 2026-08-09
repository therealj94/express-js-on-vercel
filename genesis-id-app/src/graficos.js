// Gráficos mínimos, dibujados a mano con react-native-svg.
//
// Sin librería de charts a propósito: las que hay traen megabytes y un motor
// de escalas para resolver lo que aquí son cuatro formas —barras, embudo y
// una serie de treinta días—. Dibujarlas cuesta menos que configurarlas.
//
// Reglas que se respetan en todas:
//   · una sola medida por gráfico, nunca dos ejes;
//   · las marcas son finas y la rejilla no compite con los datos;
//   · el valor va escrito al lado, no solo codificado en el largo de la barra:
//     el número exacto es lo que un operador anota, y leerlo de un píxel no
//     es leerlo.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Polyline, Line } from 'react-native-svg';
import { C, SERIES } from './theme';

const nf = (n) => (typeof n === 'number' ? n.toLocaleString('es') : '—');

/**
 * Barras horizontales para comparar magnitudes con nombre.
 *
 * Horizontal y no vertical porque las etiquetas son palabras («Sin listas de
 * sanciones cargadas») y en vertical habría que girarlas o cortarlas.
 */
export function Barras({ datos, color = SERIES[0], sufijo = '', vacio = 'Sin datos' }) {
  const items = (datos || []).filter((d) => d && typeof d.valor === 'number');
  if (!items.length) return <Text style={st.vacio}>{vacio}</Text>;
  const tope = Math.max(...items.map((d) => d.valor), 1);

  return (
    <View style={{ gap: 9 }}>
      {items.map((d, i) => (
        <View key={d.clave ?? i}>
          <View style={st.filaTexto}>
            <Text style={st.etiqueta} numberOfLines={1}>{d.etiqueta}</Text>
            <Text style={[st.valor, { color }]}>{nf(d.valor)}{sufijo}</Text>
          </View>
          <View style={st.carril}>
            <View style={{
              width: `${Math.max(1.5, (d.valor / tope) * 100)}%`,
              height: '100%', backgroundColor: color, borderRadius: 4,
            }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * El embudo: cuánta gente llega a cada escalón y cuánta se cae en el camino.
 *
 * La caída va marcada en rojo al lado del escalón que la produce, no al final:
 * lo que importa no es que se fueron, sino DÓNDE se fueron.
 */
export function Embudo({ pasos }) {
  const items = pasos || [];
  if (!items.length) return <Text style={st.vacio}>Todavía no hay nadie en el embudo.</Text>;
  const tope = Math.max(...items.map((p) => p.n), 1);

  return (
    <View style={{ gap: 11 }}>
      {items.map((p, i) => (
        <View key={p.paso ?? i}>
          <View style={st.filaTexto}>
            <Text style={st.etiqueta} numberOfLines={1}>{p.paso}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              {p.caida > 0 ? (
                <Text style={st.caida}>−{nf(p.caida)}</Text>
              ) : null}
              <Text style={[st.valor, { color: SERIES[0] }]}>{nf(p.n)}</Text>
              <Text style={st.pct}>{p.porcentaje}%</Text>
            </View>
          </View>
          <View style={st.carril}>
            <View style={{
              width: `${Math.max(1.5, (p.n / tope) * 100)}%`,
              height: '100%', backgroundColor: SERIES[0], borderRadius: 4,
            }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Serie de días. Dos medidas del mismo tipo (personas) comparten escala, que
 * es la única forma honesta de superponerlas: dos ejes distintos harían que
 * cualquier par de líneas pareciera relacionado.
 */
export function Serie({ serie, campos, alto = 90 }) {
  const datos = serie || [];
  if (datos.length < 2) return <Text style={st.vacio}>Hacen falta al menos dos días de datos.</Text>;

  const ancho = 320;
  const tope = Math.max(1, ...datos.flatMap((d) => campos.map((c) => Number(d[c.campo]) || 0)));
  const x = (i) => (i / (datos.length - 1)) * ancho;
  const y = (v) => alto - (Number(v) || 0) / tope * (alto - 6) - 3;

  return (
    <View>
      <Svg width="100%" height={alto} viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none">
        {/* Rejilla: tres líneas, muy tenues. Ubican la escala sin competir. */}
        {[0.25, 0.5, 0.75].map((f) => (
          <Line key={f} x1={0} x2={ancho} y1={alto * f} y2={alto * f}
            stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        ))}
        {campos.map((c, k) => (
          <Polyline key={c.campo}
            points={datos.map((d, i) => `${x(i)},${y(d[c.campo])}`).join(' ')}
            fill="none" stroke={SERIES[k]} strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </Svg>
      {/* Leyenda: con dos series la identidad no puede depender solo del color. */}
      <View style={st.leyenda}>
        {campos.map((c, k) => (
          <View key={c.campo} style={st.leyItem}>
            <View style={[st.leyMarca, { backgroundColor: SERIES[k] }]} />
            <Text style={st.leyTxt}>{c.nombre}</Text>
            <Text style={[st.leyTotal, { color: SERIES[k] }]}>
              {nf(datos.reduce((s, d) => s + (Number(d[c.campo]) || 0), 0))}
            </Text>
          </View>
        ))}
        <Text style={st.leyRango}>{datos.length} días</Text>
      </View>
    </View>
  );
}

/** Barra de proporciones con su leyenda. Para repartos, no para magnitudes. */
export function Reparto({ partes }) {
  const items = (partes || []).filter((p) => p.valor > 0);
  const total = items.reduce((s, p) => s + p.valor, 0);
  if (!total) return <Text style={st.vacio}>Sin datos todavía.</Text>;

  return (
    <View>
      <View style={st.repartoBarra}>
        {items.map((p, i) => (
          <View key={p.etiqueta} style={{
            flex: p.valor, backgroundColor: p.color,
            // Separación de 2 px entre tramos: sin ella, dos colores vecinos
            // parecen uno solo con un degradado.
            marginLeft: i === 0 ? 0 : 2,
          }} />
        ))}
      </View>
      <View style={st.leyenda}>
        {items.map((p) => (
          <View key={p.etiqueta} style={st.leyItem}>
            <View style={[st.leyMarca, { backgroundColor: p.color }]} />
            <Text style={st.leyTxt}>{p.etiqueta}</Text>
            <Text style={[st.leyTotal, { color: p.color }]}>{nf(p.valor)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  filaTexto: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 10 },
  etiqueta: { color: C.txt2, fontSize: 12.5, flex: 1 },
  valor: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pct: { color: C.txt3, fontSize: 11, fontVariant: ['tabular-nums'], width: 44, textAlign: 'right' },
  caida: { color: C.bad, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  carril: { height: 8, backgroundColor: C.input, borderRadius: 4, overflow: 'hidden' },
  vacio: { color: C.txt3, fontSize: 12, paddingVertical: 8 },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10, alignItems: 'center' },
  leyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leyMarca: { width: 9, height: 9, borderRadius: 2 },
  leyTxt: { color: C.txt2, fontSize: 11.5 },
  leyTotal: { fontSize: 11.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  leyRango: { color: C.txt3, fontSize: 10.5, marginLeft: 'auto' },
  repartoBarra: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: C.input },
});
