// Piezas de interfaz de Genesis ID. Compactas a propósito: esta app es una
// herramienta de trabajo — un operador la abre veinte veces al día para
// decidir expedientes — y cada pieza está pensada para leerse de un vistazo.

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Icon } from './icons';
import { C, G, SEMAFORO } from './theme';

export const hap = (style = Haptics.ImpactFeedbackStyle.Light) => {
  try { Haptics.impactAsync(style); } catch (e) {}
};

// ── Toast ───────────────────────────────────────────────────────────────────

export const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }) {
  const [msg, setMsg] = useState(null);
  const op = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  const mostrar = (texto, mal = false) => {
    setMsg({ texto, mal });
    Animated.timing(op, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(op, { toValue: 0, duration: 220, useNativeDriver: true })
        .start(() => setMsg(null));
    }, 2600);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastCtx.Provider value={mostrar}>
      <View style={{ flex: 1 }}>
        {children}
        {msg && (
          <Animated.View pointerEvents="none"
            style={[st.toast, msg.mal && st.toastMal, { opacity: op }]}>
            <Text style={[st.toastTxt, msg.mal && { color: C.bad }]}>{msg.texto}</Text>
          </Animated.View>
        )}
      </View>
    </ToastCtx.Provider>
  );
}

// ── Piezas básicas ──────────────────────────────────────────────────────────

export function Card({ children, style }) {
  return <View style={[st.card, style]}>{children}</View>;
}

export function Boton({ title, icon, onPress, disabled, tono = 'oro', style }) {
  const colores = tono === 'oro' ? G.gold
    : tono === 'ok' ? ['#5FE8B6', '#3ED9A0', '#1F9E71']
    : tono === 'mal' ? ['#F59A90', '#F0776B', '#C24C40']
    : ['#1C5E61', '#164a4d', '#0d2b2d'];
  const textoOscuro = tono !== 'neutro';
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[{ opacity: disabled ? 0.45 : 1 }, style]}>
      <LinearGradient colors={colores} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={st.boton}>
        {icon ? <Icon name={icon} size={17} color={textoOscuro ? C.darkText : C.txt} /> : null}
        <Text style={[st.botonTxt, { color: textoOscuro ? C.darkText : C.txt }]}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function BotonPlano({ title, icon, onPress, disabled, color = C.gold, style }) {
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={[st.botonPlano, { opacity: disabled ? 0.45 : 1 }, style]}>
      {icon ? <Icon name={icon} size={15} color={color} /> : null}
      <Text style={[st.botonPlanoTxt, { color }]}>{title}</Text>
    </Pressable>
  );
}

export function Campo({ label, ...props }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={st.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={C.txt3} {...props} style={[st.input, props.style]} />
    </View>
  );
}

/** Pastilla de estado/riesgo con su color del semáforo. */
export function Pastilla({ texto, color }) {
  const c = color || SEMAFORO[texto] || C.txt3;
  return (
    <View style={[st.pastilla, { borderColor: c, backgroundColor: c + '22' }]}>
      <View style={[st.punto, { backgroundColor: c }]} />
      <Text style={[st.pastillaTxt, { color: c }]}>{texto}</Text>
    </View>
  );
}

export function Kpi({ valor, etiqueta, color = C.goldHi, nota }) {
  return (
    <Card style={st.kpi}>
      <Text style={[st.kpiV, { color }]}>{valor}</Text>
      <Text style={st.kpiL}>{etiqueta}</Text>
      {nota ? <Text style={st.kpiN}>{nota}</Text> : null}
    </Card>
  );
}

export function Vacio({ icon = 'document-text', texto }) {
  return (
    <View style={st.vacio}>
      <Icon name={icon} size={30} color={C.txt3} />
      <Text style={st.vacioTxt}>{texto}</Text>
    </View>
  );
}

export function Cabecera({ titulo, sub, onAtras, derecha }) {
  return (
    <View style={st.cab}>
      {onAtras ? (
        <Pressable onPress={() => { hap(); onAtras(); }} style={st.cabAtras}>
          <Icon name="chevron-back" size={22} color={C.txt} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={st.cabT} numberOfLines={1}>{titulo}</Text>
        {sub ? <Text style={st.cabS} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {derecha}
    </View>
  );
}

/** Fila etiqueta→valor de las fichas. */
export function Dato({ k, v, color }) {
  if (v === null || v === undefined || v === '') return null;
  return (
    <View style={st.dato}>
      <Text style={st.datoK}>{k}</Text>
      <Text style={[st.datoV, color && { color }]} selectable>{String(v)}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14, padding: 14, marginBottom: 12,
  },
  boton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 13, paddingVertical: 13, paddingHorizontal: 18,
  },
  botonTxt: { fontWeight: '800', fontSize: 14.5 },
  botonPlano: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 11, paddingHorizontal: 10,
  },
  botonPlanoTxt: { fontWeight: '600', fontSize: 13 },
  label: {
    color: C.txt3, fontSize: 11, fontWeight: '700', letterSpacing: 0.4,
    textTransform: 'uppercase', marginBottom: 6,
  },
  input: {
    backgroundColor: C.input, borderWidth: 1, borderColor: C.line2, borderRadius: 11,
    color: C.txt, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14.5,
  },
  pastilla: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1,
    borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start',
  },
  pastillaTxt: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.3 },
  punto: { width: 5, height: 5, borderRadius: 3 },
  kpi: { flex: 1, minWidth: '44%', padding: 13 },
  kpiV: { fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  kpiL: { color: C.txt2, fontSize: 11, marginTop: 3 },
  kpiN: { color: C.txt3, fontSize: 10, marginTop: 3 },
  vacio: { alignItems: 'center', paddingVertical: 42, gap: 10 },
  vacioTxt: { color: C.txt3, fontSize: 12.5, textAlign: 'center', paddingHorizontal: 30 },
  cab: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12,
  },
  cabAtras: { padding: 4, marginLeft: -6 },
  cabT: { color: C.txt, fontSize: 19, fontWeight: '800' },
  cabS: { color: C.txt3, fontSize: 11.5, marginTop: 1 },
  dato: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 14,
    paddingVertical: 7, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
  },
  datoK: { color: C.txt3, fontSize: 12.5 },
  datoV: { color: C.txt, fontSize: 12.5, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  toast: {
    position: 'absolute', bottom: 92, alignSelf: 'center', maxWidth: '86%',
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.line,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11,
  },
  toastMal: { borderColor: C.bad },
  toastTxt: { color: C.txt, fontSize: 13 },
});
