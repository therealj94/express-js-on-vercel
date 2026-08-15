// ═══ BIENVENIDO A ORDEN GLOBAL ══════════════════════════════════════════
// La bienvenida de primera vez (PLAN-V6.md §3). Ya no presenta "una wallet":
// presenta el ECOSISTEMA — el núcleo, tu dinero, tu negocio, tu gente y
// NEXUS — con los logos reales de cada marca. Es la primera impresión del
// organismo completo, así que habla el mismo idioma visual que el Núcleo:
// esferas con lente, halos que laten y la red de neuronas de fondo.
//
// REGLA DEL AIRE: nada nuevo que sea nativo. react-native-svg ya vive en el
// binario (lo usan los iconos), expo-linear-gradient también (Button3D).
// Todo lo de esta pantalla viaja por OTA.
//
// Se muestra UNA sola vez por dispositivo (bandera en AsyncStorage).
// Auth.js decide si entrar aquí después de un registro/login exitoso.
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, Pressable, Animated, Easing, StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Line, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Icon } from '../icons';
import { C, G, F } from '../theme';
import { Button3D, hap, useAccount } from '../ui';
import { useFuenteDisplay } from '../fuentes';
import { useLang } from '../i18n';

// La llave conserva el nombre viejo a propósito: quien ya vio el tour de la
// wallet no tiene por qué volver a ver uno por un cambio de contenido.
export const ONBOARDING_KEY = 'veta-onboarding-done-v1';

export async function seenOnboarding() {
  try { return (await AsyncStorage.getItem(ONBOARDING_KEY)) === '1'; } catch (e) { return false; }
}
export async function markOnboardingDone() {
  try { await AsyncStorage.setItem(ONBOARDING_KEY, '1'); } catch (e) {}
}

// ── LOS LOGOS DE MARCA ──────────────────────────────────────────────────
// `require` con ruta literal y en el cuerpo del módulo: Metro resuelve las
// imágenes al empaquetar y una ruta calculada llega como `undefined`.
const LOGOS = {
  og: require('../../assets/og-logo.png'),
  wallet: require('../../assets/veta-wallet.png'),
  pay: require('../../assets/mytokenpay.png'),
  gid: require('../../assets/genesis-id.png'),
};

// Textos locales, es/en SIEMPRE los dos.
const TXT = {
  es: {
    saltar: 'SALTAR',
    sig: 'Siguiente',
    crear: 'Crear mi Genesis ID',
    entrar: 'Entrar a mi Núcleo',
    gidFalta: 'Todo empieza con tu Genesis ID: una sola identidad para todo el ecosistema.',
    gidListo: 'Tu Genesis ID ya está activo: todas las puertas están abiertas.',
    ecoK: 'BIENVENIDO', ecoT: 'Esto es Orden Global',
    ecoP: 'No es una app: es un ecosistema. Tu dinero, tu negocio, tu gente y tu identidad, conectados en un mismo núcleo.',
    dinK: 'TU DINERO', dinT: 'Veta Wallet',
    dinP: 'Guarda, envía y recibe en segundos. Tus tokens, tu tarjeta y tus remesas, en la billetera del ecosistema.',
    negK: 'TU NEGOCIO', negT: 'MyTokenPay',
    negP: 'Cobra con un QR, explora comercios y haz crecer lo tuyo. La caja registradora que cabe en el bolsillo.',
    genK: 'TU GENTE', genT: 'AURO CHAT',
    genP: 'Conversa con los tuyos y manda dinero sin salir del hilo. Tu gente del ecosistema, a un toque.',
    nexK: 'TU ASISTENTE', nexT: 'NEXUS',
    nexP: 'Pídeselo con la voz: «envía 15 a Juan», «abre mi tarjeta». NEXUS te lleva; firmar, siempre te toca a ti.',
  },
  en: {
    saltar: 'SKIP',
    sig: 'Next',
    crear: 'Create my Genesis ID',
    entrar: 'Enter my Nucleus',
    gidFalta: 'It all starts with your Genesis ID: one identity for the whole ecosystem.',
    gidListo: 'Your Genesis ID is active: every door is already open.',
    ecoK: 'WELCOME', ecoT: 'This is Orden Global',
    ecoP: 'Not an app — an ecosystem. Your money, your business, your people and your identity, wired into one nucleus.',
    dinK: 'YOUR MONEY', dinT: 'Veta Wallet',
    dinP: 'Store, send and receive in seconds. Your tokens, your card and your remittances, in the ecosystem’s wallet.',
    negK: 'YOUR BUSINESS', negT: 'MyTokenPay',
    negP: 'Charge with a QR, explore merchants and grow what’s yours. The cash register that fits in your pocket.',
    genK: 'YOUR PEOPLE', genT: 'AURO CHAT',
    genP: 'Talk with your people and send money without leaving the thread. Your ecosystem contacts, one tap away.',
    nexK: 'YOUR ASSISTANT', nexT: 'NEXUS',
    nexP: 'Just say it: “send 15 to Juan”, “open my card”. NEXUS takes you there; signing is always yours.',
  },
};

// ── LAS TARJETAS ────────────────────────────────────────────────────────
// El orden cuenta una historia: el todo primero, luego cada mundo, y al
// final el asistente que los une — que es también donde se invita al
// Genesis ID, porque es la llave de todo lo anterior.
// Colores por marca: los MISMOS que usan las esferas del Núcleo, para que
// al aterrizar en el tablero cada mundo se reconozca al primer vistazo.
const TARJETAS = [
  { k: 'eco', vis: 'og' },
  {
    k: 'din', vis: 'esfera', logo: 'wallet', zoom: 0.84,
    grad: G.gold, halo: C.goldLt, lente: '#05201B',
  },
  {
    k: 'neg', vis: 'esfera', logo: 'pay', zoom: 1.15,
    grad: ['#D8F7FF', '#5FC6EA', '#453398'], halo: '#5FC6EA', lente: '#0A0812',
  },
  {
    // AURO CHAT aún no tiene PNG en assets/: lleva la misma lente con su
    // icono dentro, igual que hace el Núcleo — un solo lenguaje visual.
    k: 'gen', vis: 'esfera', icono: 'chatbubbles', zoom: 0,
    grad: ['#FBE0D4', '#E0937A', '#8A4A38'], halo: '#E0937A', lente: '#20100A',
  },
  { k: 'nex', vis: 'nexus' },
];

// ── LA RED DE NEURONAS ──────────────────────────────────────────────────
// El fondo de toda la bienvenida es el mismo motivo que el Núcleo: una red
// de sinapsis doradas. Aquí es SVG estático (nada de canvas ni WebView):
// unas decenas de líneas a baja opacidad respiran con un solo Animated de
// opacidad — sobrio, barato y sin un módulo nativo más.
// Coordenadas fijas, no aleatorias: un fondo que cambia en cada render
// parpadea, y éste tiene que sentirse como un cielo quieto.
const NODOS = [
  [10, 14], [30, 6], [52, 12], [74, 5], [92, 15],
  [18, 38], [42, 30], [66, 26], [88, 38],
  [6, 64], [32, 56], [58, 52], [82, 60],
  [16, 88], [44, 82], [70, 86], [94, 92],
  [8, 118], [34, 112], [62, 116], [86, 122],
  [20, 146], [48, 140], [76, 148],
  [12, 172], [40, 168], [68, 174], [90, 178],
];
const SINAPSIS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [1, 6], [2, 6], [3, 7], [4, 8],
  [5, 6], [6, 7], [7, 8],
  [5, 10], [6, 10], [6, 11], [7, 11], [8, 12],
  [9, 10], [10, 11], [11, 12],
  [9, 13], [10, 14], [11, 14], [12, 15], [12, 16],
  [13, 14], [14, 15], [15, 16],
  [13, 17], [14, 18], [15, 19], [16, 20],
  [17, 18], [18, 19], [19, 20],
  [17, 21], [18, 22], [19, 22], [20, 23],
  [21, 22], [22, 23],
  [21, 24], [22, 25], [23, 26], [23, 27], [24, 25], [25, 26], [26, 27],
];
// Unas pocas neuronas "encendidas": más grandes y más claras, para que la
// red tenga puntos de luz y no sea una malla uniforme.
const ENCENDIDAS = [2, 6, 11, 14, 19, 22];

function Neuronas() {
  const alma = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.sequence([
      Animated.timing(alma, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(alma, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    l.start();
    return () => l.stop();
  }, [alma]);
  const op = alma.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: op }]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid slice">
        <Defs>
          {/* El resplandor central va DETRÁS del visual de cada tarjeta:
              es lo que hace que las esferas parezcan iluminadas por el
              núcleo y no pegadas sobre negro. */}
          <RadialGradient id="brasa" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={C.gold} stopOpacity="0.14" />
            <Stop offset="1" stopColor={C.gold} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="78" r="52" fill="url(#brasa)" />
        {SINAPSIS.map(([a, b], j) => (
          <Line
            key={j}
            x1={NODOS[a][0]} y1={NODOS[a][1]} x2={NODOS[b][0]} y2={NODOS[b][1]}
            stroke={C.gold} strokeOpacity={0.13} strokeWidth={0.28}
          />
        ))}
        {NODOS.map(([nx, ny], j) => (
          <Circle
            key={j}
            cx={nx} cy={ny}
            r={ENCENDIDAS.includes(j) ? 1.25 : 0.75}
            fill={C.goldLt}
            fillOpacity={ENCENDIDAS.includes(j) ? 0.55 : 0.3}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

// ── EL FLOTADOR ─────────────────────────────────────────────────────────
// Halo que late + flotación lenta, compartidos por los tres visuales. El
// halo son discos concéntricos y no una sombra porque Android ignora
// shadowColor y `elevation` sólo sabe pintar gris (lección del Núcleo).
function Flotante({ tam, halo, children }) {
  const lat = useRef(new Animated.Value(0)).current;
  const vuelo = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(lat, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(lat, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const b = Animated.loop(Animated.sequence([
      Animated.timing(vuelo, { toValue: 1, duration: 3600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(vuelo, { toValue: 0, duration: 3600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [lat, vuelo]);
  const haloOp = lat.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const y = vuelo.interpolate({ inputRange: [0, 1], outputRange: [4, -4] });
  const caja = tam * 1.7;
  return (
    <Animated.View style={{ width: caja, height: caja, alignItems: 'center', justifyContent: 'center', transform: [{ translateY: y }] }}>
      <Animated.View style={[st.aro, { width: tam * 1.66, height: tam * 1.66, borderRadius: tam * 0.83, backgroundColor: halo, opacity: Animated.multiply(haloOp, 0.07) }]} />
      <Animated.View style={[st.aro, { width: tam * 1.34, height: tam * 1.34, borderRadius: tam * 0.67, backgroundColor: halo, opacity: Animated.multiply(haloOp, 0.12) }]} />
      <Animated.View style={[st.aro, { width: tam * 1.14, height: tam * 1.14, borderRadius: tam * 0.57, backgroundColor: halo, opacity: Animated.multiply(haloOp, 0.18) }]} />
      {children}
    </Animated.View>
  );
}

// ── LA ESFERA DE MARCA ──────────────────────────────────────────────────
// La misma gramática que los mundos del Núcleo: esfera con luz entrando por
// arriba a la izquierda, lente de vidrio hundido y la marca dentro. Los
// `zoom` vienen medidos de allí — pasarse recorta el logo contra el círculo.
function EsferaMarca({ tam = 150, grad, lente, halo, logo, icono, zoom }) {
  const dl = Math.round(tam * 0.72);            // diámetro de la lente
  const dz = Math.round(dl * (zoom || 1));      // tamaño del logo dentro
  return (
    <Flotante tam={tam} halo={halo}>
      <LinearGradient
        colors={grad}
        start={{ x: 0.14, y: 0.04 }}
        end={{ x: 0.88, y: 1 }}
        style={[st.esfera, { width: tam, height: tam, borderRadius: tam / 2 }]}>
        <View style={[st.brillo, { width: tam * 0.42, height: tam * 0.30, borderRadius: tam * 0.21, top: tam * 0.09, left: tam * 0.14 }]} />
        {/* La sombra del volumen va ANTES que la lente para no apagar el
            logo: la lente es vidrio hundido, no pintura sobre la esfera. */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.10)', 'rgba(0,0,0,0.34)']}
          style={[StyleSheet.absoluteFill, { borderRadius: tam / 2 }]}
          pointerEvents="none"
        />
        <View style={[st.lente, { width: dl, height: dl, borderRadius: dl / 2, backgroundColor: lente }]}>
          {logo ? (
            // El overflow:hidden de la lente recorta en círculo el PNG
            // cuadrado; el borderRadius de la imagen es el cinturón además
            // de los tirantes por si algún Android ignora el recorte.
            <Image
              source={LOGOS[logo]}
              style={{ width: dz, height: dz, borderRadius: dz / 2 }}
              resizeMode="contain"
            />
          ) : (
            <Icon name={icono} size={Math.round(dl * 0.5)} color={halo} />
          )}
        </View>
        <View style={[st.canto, { width: dl, height: dl, borderRadius: dl / 2 }]} pointerEvents="none" />
      </LinearGradient>
    </Flotante>
  );
}

// ── EL NÚCLEO DE NEXUS ──────────────────────────────────────────────────
// El mismo truco de la burbuja flotante: cada anillo se aplasta en Y y
// luego rota — como RN aplica las transformaciones de derecha a izquierda,
// la elipse ya aplastada es la que gira y se lee como un aro en 3D. Los
// satélites llevan el scaleY inverso para salir redondos.
function NucleoNexus({ tam = 140, fuente }) {
  const giro1 = useRef(new Animated.Value(0)).current;
  const giro2 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.timing(giro1, { toValue: 1, duration: 6200, easing: Easing.linear, useNativeDriver: true }));
    const b = Animated.loop(Animated.timing(giro2, { toValue: 1, duration: 9400, easing: Easing.linear, useNativeDriver: true }));
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [giro1, giro2]);

  const nuc = Math.round(tam * 0.46);
  const sat = Math.max(4, Math.round(tam * 0.05));
  const aro = (d, apl, giro, sentido) => (
    <Animated.View
      key={d}
      style={[st.aro, {
        width: d, height: d, borderRadius: d / 2,
        borderColor: 'rgba(234,215,156,0.55)', borderWidth: 1.2,
        transform: [
          { rotate: giro.interpolate({ inputRange: [0, 1], outputRange: sentido > 0 ? ['0deg', '360deg'] : ['360deg', '0deg'] }) },
          { scaleY: apl },
        ],
      }]}>
      <View style={{
        position: 'absolute', width: sat, height: sat, borderRadius: sat / 2,
        backgroundColor: C.goldLt, left: d / 2 - sat / 2, top: -sat / 2,
        transform: [{ scaleY: 1 / apl }],
      }} />
    </Animated.View>
  );

  return (
    <Flotante tam={tam} halo={C.goldLt}>
      {aro(Math.round(tam * 0.98), 0.34, giro1, 1)}
      {aro(Math.round(tam * 1.24), 0.56, giro2, -1)}
      <LinearGradient
        colors={G.gold}
        start={{ x: 0.14, y: 0.04 }}
        end={{ x: 0.88, y: 1 }}
        style={{ width: nuc, height: nuc, borderRadius: nuc / 2, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[st.nexusN, { fontSize: nuc * 0.44 }, fuente && { fontFamily: F.h, fontWeight: 'normal' }]}>N</Text>
      </LinearGradient>
    </Flotante>
  );
}

// ── LA PANTALLA ─────────────────────────────────────────────────────────
export default function Onboarding({ nav }) {
  const { lang } = useLang();
  const T = TXT[lang] || TXT.es;
  const { account } = useAccount();
  const fuente = useFuenteDisplay();
  const { width: W } = useWindowDimensions();

  const [i, setI] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const sv = useRef(null);

  // Entrada de toda la pantalla: un solo fundido con una subida corta.
  const entra = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entra, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [entra]);

  // La salida —terminado o SALTAR— mira si la cuenta ya tiene su Genesis
  // ID: sin GID se pasa por la oferta (PLAN-V6 §1: nadie se queda sin
  // enterarse), con GID se entra directo al Núcleo. Al ECOSISTEMA, no a la
  // wallet: la bienvenida presenta el organismo entero y ahí es donde el
  // nodo Genesis con su anillo ámbar sigue recordando lo pendiente.
  const falta = !!account && !account.genesisUid;
  const salir = async () => {
    hap();
    await markOnboardingDone();
    nav.go(falta ? 'genesisOffer' : 'ecosistema');
  };

  const ultima = i >= TARJETAS.length - 1;
  const seguir = () => {
    if (ultima) { salir(); return; }
    hap();
    const n = i + 1;
    setI(n);
    if (sv.current && sv.current.scrollTo) sv.current.scrollTo({ x: n * W, animated: true });
  };

  // Parallax de cada tarjeta contra el scroll: el contenido se mueve un
  // poco más despacio que la página y se funde en los bordes. Todo por el
  // hilo nativo — opacidad y transform, nada que toque layout.
  const tarjeta = (c, k) => {
    const marco = [(k - 1) * W, k * W, (k + 1) * W];
    const op = x.interpolate({ inputRange: marco, outputRange: [0, 1, 0], extrapolate: 'clamp' });
    const tx = x.interpolate({ inputRange: marco, outputRange: [W * 0.18, 0, -W * 0.18], extrapolate: 'clamp' });
    const esc = x.interpolate({ inputRange: marco, outputRange: [0.88, 1, 0.88], extrapolate: 'clamp' });
    return (
      <View key={c.k} style={{ width: W }}>
        <Animated.View style={[st.carta, { opacity: op, transform: [{ translateX: tx }] }]}>
          <Animated.View style={[st.visual, { transform: [{ scale: esc }] }]}>
            {c.vis === 'og' && (
              <Flotante tam={150} halo={C.goldLt}>
                <Image source={LOGOS.og} style={{ width: 168, height: 115 }} resizeMode="contain" />
              </Flotante>
            )}
            {c.vis === 'esfera' && (
              <EsferaMarca grad={c.grad} lente={c.lente} halo={c.halo} logo={c.logo} icono={c.icono} zoom={c.zoom} />
            )}
            {c.vis === 'nexus' && <NucleoNexus fuente={fuente} />}
          </Animated.View>

          <Text style={st.kicker}>{T[c.k + 'K']}</Text>
          <Text style={[st.titulo, fuente && { fontFamily: F.h, fontWeight: 'normal' }]}>{T[c.k + 'T']}</Text>
          <Text style={st.cuerpo}>{T[c.k + 'P']}</Text>

          {/* La última tarjeta trae la llave: el emblema real de Genesis ID
              y una frase honesta según ya lo tenga o no. El PNG es opaco y
              su marca queda chica dentro del cuadrado: se agranda dentro de
              un marco redondo con overflow hidden (mismo zoom medido que
              usa el Núcleo para este emblema). */}
          {c.k === 'nex' && (
            <View style={st.gidChip}>
              <View style={st.gidMarco}>
                <Image source={LOGOS.gid} style={{ width: 62, height: 62 }} resizeMode="contain" />
              </View>
              <Text style={st.gidTxt}>{falta ? T.gidFalta : T.gidListo}</Text>
            </View>
          )}
        </Animated.View>
      </View>
    );
  };

  return (
    <View style={st.fondo}>
      <Neuronas />
      {/* El velo bajo la zona de texto: la red respira detrás del visual,
          pero bajo los párrafos se apaga para que se lean sin pelear. */}
      <LinearGradient
        colors={['rgba(1,13,14,0)', 'rgba(1,13,14,0.85)', '#010D0E']}
        style={st.velo}
        pointerEvents="none"
      />

      <Animated.View style={{ flex: 1, opacity: entra, transform: [{ translateY: entra.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
        <View style={st.top}>
          <Text style={[st.marca, fuente && { fontFamily: F.h, fontWeight: 'normal' }]}>ORDEN GLOBAL</Text>
          <Pressable
            onPress={salir}
            accessibilityRole="button"
            accessibilityLabel={T.saltar}
            hitSlop={12}
            style={st.saltarPill}>
            <Text style={st.saltarTxt}>{T.saltar}</Text>
          </Pressable>
        </View>

        <Animated.ScrollView
          ref={sv}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(e) => setI(Math.min(TARJETAS.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / W))))}
          style={{ flex: 1 }}>
          {TARJETAS.map(tarjeta)}
        </Animated.ScrollView>

        <View style={st.dots}>
          {TARJETAS.map((c, k) => (
            <View key={c.k} style={[st.dot, k === i && st.dotOn]} />
          ))}
        </View>

        <Button3D
          title={ultima ? (falta ? T.crear : T.entrar) : T.sig}
          icon={ultima ? (falta ? 'finger-print' : 'arrow-forward') : 'arrow-forward'}
          onPress={seguir}
          style={st.cta}
        />
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  // El negro-verdoso profundo de la bienvenida: más oscuro que C.bg a
  // propósito, para que el oro y las esferas sean lo único que brilla.
  fondo: { flex: 1, backgroundColor: '#010D0E' },
  velo: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '46%' },
  top: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 12,
  },
  marca: { color: 'rgba(234,215,156,0.8)', fontSize: 13, fontWeight: '800', letterSpacing: 3 },
  saltarPill: {
    borderWidth: 1, borderColor: C.line2, borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  saltarTxt: { color: C.goldLt, fontSize: 11.5, fontWeight: '700', letterSpacing: 2 },

  carta: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  visual: { height: 264, alignItems: 'center', justifyContent: 'center' },

  aro: { position: 'absolute' },
  esfera: { alignItems: 'center', justifyContent: 'center' },
  brillo: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.30)' },
  lente: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  canto: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  nexusN: { color: C.darkText, fontWeight: '800' },

  kicker: { color: C.gold, fontSize: 12, fontWeight: '700', letterSpacing: 3, marginTop: 6 },
  titulo: { color: C.txt, fontSize: 27, fontWeight: '800', textAlign: 'center', lineHeight: 34, marginTop: 8 },
  cuerpo: { color: C.txt2, fontSize: 14.5, lineHeight: 21.5, textAlign: 'center', marginTop: 10, maxWidth: 320 },

  gidChip: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(6,40,42,0.72)', borderWidth: 1, borderColor: C.line2,
    borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14,
    marginTop: 20, maxWidth: 330,
  },
  gidMarco: {
    width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#062123',
  },
  gidTxt: { color: C.txt2, fontSize: 12.5, lineHeight: 17.5, flex: 1 },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 18, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(201,169,97,0.28)' },
  dotOn: { width: 22, backgroundColor: C.gold },
  cta: { marginHorizontal: 30, marginBottom: 26 },
});
