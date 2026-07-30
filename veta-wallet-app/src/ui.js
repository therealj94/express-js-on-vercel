import React, { useRef, createContext, useContext } from 'react';
import { View, Text, Pressable, TextInput, Animated, Image, ImageBackground, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Icon } from './icons';
import Svg, { Rect, Line, Path, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { C, G } from './theme';

export const LOGO = require('../assets/logo.png');
// Logo corporativo de la empresa dueña del ecosistema (marca en el pie).
export const LOGO_ORDEN = require('../assets/orden-global.png');
export const BG = require('../assets/login-bg.jpg');       // iniciar sesión y contenido
export const BG_SPLASH = require('../assets/splash-bg.jpg'); // al abrir la app
export const hap = (style = Haptics.ImpactFeedbackStyle.Light) => { try { Haptics.impactAsync(style); } catch (e) {} };

// Fondo de marca de toda la app: la fotografía del ecosistema con un velo
// oscuro encima. `intensity` controla cuánta imagen se deja ver:
//   'hero'    → pantallas de marca (splash, login): imagen protagonista
//   'content' → pantallas con datos: apenas una textura de profundidad
export function AppBackground({ children, intensity = 'content', image, style }) {
  const hero = intensity === 'hero';
  // La fotografía se deja ver; la legibilidad la resuelven las tarjetas, que
  // van en vidrio bien sólido encima (no oscureciendo la foto entera).
  const veil = hero
    ? ['rgba(4,30,30,0.14)', 'rgba(2,18,19,0.38)', 'rgba(1,12,13,0.60)']
    : ['rgba(4,30,30,0.26)', 'rgba(2,20,21,0.50)', 'rgba(1,12,13,0.66)'];
  return (
    <ImageBackground source={image || BG} resizeMode="cover" style={[{ flex: 1, backgroundColor: '#021B1C' }, style]}>
      <LinearGradient colors={veil} style={StyleSheet.absoluteFill} />
      {children}
    </ImageBackground>
  );
}

// ---- Navigation context ----
export const Nav = createContext({ go: () => {}, back: () => {}, route: 'splash' });
export const useNav = () => useContext(Nav);

// ---- Toast context ----
export const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

// ---- Account context (sesión / cuenta actual) ----
export const AccountCtx = createContext({ account: null, login: () => {}, logout: () => {} });
export const useAccount = () => useContext(AccountCtx);

// El logo real mide 520x354 → relación de aspecto 0.6808. Usar otra proporción
// dejaba un hueco vertical vacío alrededor de la marca.
export const LOGO_RATIO = 354 / 520;
export function Logo({ size = 60, style }) {
  return <Image source={LOGO} resizeMode="contain" style={[{ width: size, height: Math.round(size * LOGO_RATIO) }, style]} />;
}

export function TokenIcon({ t, size = 44 }) {
  const r = size / 2;
  // Logo real del token: se muestra sobre un disco negro con anillo dorado
  // sutil. Los logos vienen sobre fondo negro y así se funden bien.
  if (t.image) {
    return (
      <View style={{ width: size, height: size, borderRadius: r, backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(201,169,97,0.35)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <Image source={t.image} style={{ width: size * 0.94, height: size * 0.94, borderRadius: r }} resizeMode="contain" />
      </View>
    );
  }
  // Compat: si aún hubiese un token con `logo: true` (banner "gold" con logo).
  if (t.logo) {
    return (
      <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: r, alignItems: 'center', justifyContent: 'center' }}>
        <Logo size={size * 0.7} />
      </LinearGradient>
    );
  }
  return (
    <LinearGradient colors={t.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: r, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: t.fg, fontWeight: '800', fontSize: t.glyph.length > 1 ? size * 0.3 : size * 0.4 }}>{t.glyph}</Text>
    </LinearGradient>
  );
}

// ---- 3D Button (press depresses + shadow) ----
export function Button3D({ title, onPress, variant = 'gold', icon, style, disabled }) {
  const y = useRef(new Animated.Value(0)).current;
  const press = (to) => Animated.spring(y, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  const isGold = variant === 'gold';
  const colors = isGold ? G.gold : variant === 'teal' ? ['#177A72', '#0D4F4C'] : ['#123F41', '#0A3436'];
  const txtColor = isGold ? C.darkText : C.txt;
  return (
    <Animated.View style={[{ transform: [{ translateY: y }] }, style]}>
      <View style={[styles.btnShadow, isGold ? styles.btnShadowGold : styles.btnShadowDark, disabled && { opacity: 0.4 }]}>
        <Pressable
          disabled={disabled}
          onPressIn={() => { press(3); hap(); }}
          onPressOut={() => press(0)}
          onPress={onPress}
          style={{ borderRadius: 17, overflow: 'hidden' }}>
          <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnInner}>
            {icon ? <Icon name={icon} size={18} color={txtColor} style={{ marginRight: 8 }} /> : null}
            <Text style={[styles.btnText, { color: txtColor }]}>{title}</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ---- Circular 3D action (Send/Receive/Buy/Swap) ----
export function ActionBtn({ icon, label, onPress, size = 54 }) {
  const s = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPressIn={() => { Animated.spring(s, { toValue: 0.88, useNativeDriver: true }).start(); hap(); }}
      onPressOut={() => Animated.spring(s, { toValue: 1, useNativeDriver: true }).start()}
      onPress={onPress}
      style={{ alignItems: 'center', gap: 8 }}>
      <Animated.View style={{ transform: [{ scale: s }] }}>
        <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
          <Icon name={icon} size={size * 0.42} color={C.darkText} />
        </LinearGradient>
      </Animated.View>
      {label ? <Text style={styles.actLabel}>{label}</Text> : null}
    </Pressable>
  );
}

export function IconBtn({ icon, onPress, badge }) {
  return (
    <Pressable onPress={() => { hap(); onPress && onPress(); }} style={styles.iconBtn}>
      <Icon name={icon} size={20} color={C.txt} />
      {badge ? <View style={styles.iconDot} /> : null}
    </Pressable>
  );
}

export function Header({ title, sub, onBack, right }) {
  return (
    <View style={styles.header}>
      {onBack ? <IconBtn icon="chevron-back" onPress={onBack} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.hTitle}>{title}</Text>
        {sub ? <Text style={styles.hSub}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Field({ label, ...props }) {
  return (
    <View style={{ marginBottom: 15 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput placeholderTextColor="#6f938f" style={styles.input} {...props} />
    </View>
  );
}

export function Toggle({ value, onValueChange }) {
  return (
    <Pressable onPress={() => { hap(); onValueChange(!value); }} style={[styles.switch, value && { backgroundColor: C.gold, borderColor: 'transparent' }]}>
      <View style={[styles.knob, value && { left: 22, backgroundColor: '#fff' }]} />
    </Pressable>
  );
}

export function ListRow({ icon, title, sub, right, onPress, first }) {
  return (
    <Pressable onPress={onPress ? () => { hap(); onPress(); } : undefined} style={[styles.listRow, first && { borderTopWidth: 0 }]}>
      <View style={styles.liIcon}><Icon name={icon} size={19} color={C.gold} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.liTitle}>{title}</Text>
        {sub ? <Text style={styles.liSub}>{sub}</Text> : null}
      </View>
      {right !== undefined ? right : <Icon name="chevron-forward" size={17} color={C.txt3} />}
    </Pressable>
  );
}

export function SectionHead({ title, action, onAction }) {
  return (
    <View style={styles.secHead}>
      <Text style={styles.secTitle}>{title}</Text>
      {action ? <Text onPress={onAction} style={styles.secMore}>{action}</Text> : null}
    </View>
  );
}

// ---- Candlestick chart (velas japonesas) ----
export function Candles({ data, width = Dimensions.get('window').width - 68, height = 170, up = true }) {
  if (!data || !data.length) return null;
  const pad = 6;
  const highs = data.map((d) => d.h), lows = data.map((d) => d.l);
  const max = Math.max(...highs), min = Math.min(...lows);
  const span = max - min || 1;
  const n = data.length;
  const cw = (width - pad * 2) / n;
  const bw = Math.max(2, cw * 0.6);
  const yOf = (v) => pad + (1 - (v - min) / span) * (height - pad * 2);
  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGrad id="upg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.up} stopOpacity="1" />
          <Stop offset="1" stopColor="#2CB183" stopOpacity="1" />
        </SvgGrad>
      </Defs>
      {[0.25, 0.5, 0.75].map((g, i) => (
        <Line key={i} x1={0} y1={height * g} x2={width} y2={height * g} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
      ))}
      {data.map((d, i) => {
        const x = pad + i * cw + cw / 2;
        const green = d.c >= d.o;
        const col = green ? C.up : C.down;
        const bodyTop = yOf(Math.max(d.o, d.c));
        const bodyH = Math.max(1.5, Math.abs(yOf(d.o) - yOf(d.c)));
        return (
          <React.Fragment key={i}>
            <Line x1={x} y1={yOf(d.h)} x2={x} y2={yOf(d.l)} stroke={col} strokeWidth={1.2} />
            <Rect x={x - bw / 2} y={bodyTop} width={bw} height={bodyH} rx={1} fill={col} opacity={green ? 1 : 0.9} />
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// ---- Area sparkline (mini) ----
export function Spark({ data, width, height = 40, up = true }) {
  if (!data || !data.length) return null;
  const vals = data.map((d) => d.c);
  const max = Math.max(...vals), min = Math.min(...vals), span = max - min || 1;
  const step = width / (vals.length - 1);
  const pts = vals.map((v, i) => `${i * step},${(1 - (v - min) / span) * height}`);
  const col = up ? C.up : C.down;
  return (
    <Svg width={width} height={height}>
      <Path d={`M${pts.join(' L')}`} fill="none" stroke={col} strokeWidth={1.6} />
    </Svg>
  );
}

// Vidrio esmerilado: el mismo tratamiento de la tarjeta del login, para que
// todas las pantallas compartan ese acabado premium sobre la fotografía.
export function Glass({ children, style, intensity = 26, radius = 18 }) {
  return (
    <BlurView intensity={intensity} tint="dark" style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
      {children}
    </BlurView>
  );
}

export function Card({ children, style }) {
  return <Glass style={[styles.card, style]}>{children}</Glass>;
}

export const styles = StyleSheet.create({
  btnShadow: { borderRadius: 17 },
  btnShadowGold: { shadowColor: '#C9A961', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  btnShadowDark: { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 17 },
  btnText: { fontSize: 15.5, fontWeight: '800' },
  circle: { alignItems: 'center', justifyContent: 'center', shadowColor: '#C9A961', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  actLabel: { fontSize: 11.5, fontWeight: '600', color: C.txt },
  iconBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  iconDot: { position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: C.down, borderWidth: 2, borderColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingBottom: 14, paddingTop: 4 },
  hTitle: { fontSize: 19, fontWeight: '800', color: C.txt },
  hSub: { fontSize: 11.5, color: C.txt2 },
  label: { fontSize: 12, color: C.txt2, marginBottom: 7, fontWeight: '500' },
  input: { backgroundColor: C.input, borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, color: C.txt, fontSize: 15 },
  switch: { width: 46, height: 27, borderRadius: 20, backgroundColor: '#0E3A3C', borderWidth: 1, borderColor: C.line2, justifyContent: 'center' },
  knob: { position: 'absolute', left: 2, width: 21, height: 21, borderRadius: 11, backgroundColor: C.txt2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  liIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center' },
  liTitle: { fontSize: 14, fontWeight: '600', color: C.txt },
  liSub: { fontSize: 11.5, color: C.txt3, marginTop: 2 },
  secHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 12, paddingHorizontal: 2 },
  secTitle: { fontSize: 16.5, fontWeight: '700', color: C.txt },
  secMore: { fontSize: 13, color: C.gold, fontWeight: '600' },
  card: {
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
});
