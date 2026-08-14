// Orden Global: el contenedor. Un router propio del mismo corte que el de
// veta-wallet-app --una pila de vistas y transiciones animadas--, con una
// diferencia de fondo: AQUÍ SE NAVEGA POR EL MAPA. Todo movimiento, venga
// del dedo, de GENESIS o de un enlace og://, pasa por abrir(uri) y por
// tanto por rutas.js. Un solo camino, un solo sitio que auditar.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, Animated, StyleSheet, Linking, BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';

import { C, G } from './src/theme';
import { useT, cargarIdioma } from './src/i18n';
import { sesionGuardada, salir, listaContactos, cargarNombreAsistente, elAsistente, chatAlta, chatConversaciones } from './src/api';
import { deUri } from './src/rutas';
import BarraGenesis from './src/BarraGenesis';
import Splash from './src/screens/Splash';
import Auth from './src/screens/Auth';
import Home from './src/screens/Home';
import AppView from './src/screens/AppView';
import Cerebro from './src/screens/Cerebro';
import Chat from './src/screens/Chat';
import Asistente from './src/screens/Asistente';

SplashScreen.preventAutoHideAsync().catch(() => {});

const TITULOS = {
  home: 'ORDEN GLOBAL', veta: 'VETA WALLET', pay: 'MYTOKENPAY', gid: 'GENESIS ID',
  scan: 'ORDENSCAN', cerebro: 'EL CEREBRO', cerebroWeb: 'EL CEREBRO', chat: 'CHAT',
};
// el título del asistente es el nombre que le pusiste
const tituloDe = (v) => (v === 'asistente' ? elAsistente() : TITULOS[v] || 'ORDEN GLOBAL');

export default function App() {
  return (
    <SafeAreaProvider>
      <Raiz />
    </SafeAreaProvider>
  );
}

function Raiz() {
  const t = useT();
  const [fase, setFase] = useState('splash');            // splash | auth | dentro
  const [pila, setPila] = useState([{ v: 'home' }]);     // [{v, params, entrada}]
  const [contactos, setContactos] = useState([]);
  const [ordenExterna, setOrdenExterna] = useState(null); // frase que llega de la pantalla del asistente
  const anim = useRef(new Animated.Value(1)).current;
  const cima = pila[pila.length - 1];

  // arranque: idioma guardado y sesión guardada; el splash respira mientras
  useEffect(() => {
    (async () => {
      await cargarIdioma();
      await cargarNombreAsistente();
      const cuenta = await sesionGuardada();
      await new Promise((r) => setTimeout(r, 1400)); // que el logo se vea llegar
      SplashScreen.hideAsync().catch(() => {});
      setFase(cuenta ? 'dentro' : 'auth');
    })();
  }, []);

  // La libreta de GENESIS es la gente REAL del chat: con quien ya hablas,
  // con su dirección de wallet del directorio. Se refresca al volver a casa.
  useEffect(() => {
    if (fase !== 'dentro') return;
    (async () => {
      try {
        await chatAlta();
        const d = await chatConversaciones();
        const gente = (d?.conversaciones || []).map((c) => ({ nombre: c.nombre, correo: c.correo, addr: c.addr }));
        if (gente.length) { setContactos(gente); return; }
      } catch { /* sin red: la libreta local de abajo */ }
      setContactos(await listaContactos());
    })();
  }, [fase, cima.v === 'home']);

  const transicion = useCallback((cambia) => {
    Animated.timing(anim, { toValue: 0, duration: 130, useNativeDriver: true }).start(() => {
      cambia();
      Animated.timing(anim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    });
  }, [anim]);

  // ── EL ÚNICO CAMINO ─────────────────────────────────────────────────
  const abrir = useCallback((uri) => {
    const r = deUri(uri);
    if (!r) return false;
    transicion(() => setPila((p) => {
      const nueva = { v: r.entrada.v, params: r.params, entrada: r.entrada };
      if (r.entrada.v === 'home') return [{ v: 'home' }];
      // la misma vista con otros params sustituye, no apila
      const sin = p.filter((x) => x.v !== nueva.v);
      return [...sin, nueva];
    }));
    return true;
  }, [transicion]);

  const atras = useCallback(() => {
    transicion(() => setPila((p) => (p.length > 1 ? p.slice(0, -1) : p)));
  }, [transicion]);

  // enlaces og:// desde fuera (QR, notificación, otra app)
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => { if (fase === 'dentro') abrir(url); });
    Linking.getInitialURL().then((url) => { if (url && fase === 'dentro') abrir(url); });
    return () => sub.remove();
  }, [fase, abrir]);

  // el botón atrás de Android camina la pila antes de salir de la app
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (fase === 'dentro' && pila.length > 1) { atras(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [fase, pila.length, atras]);

  if (fase === 'splash') return <Splash />;
  if (fase === 'auth') return <Auth alEntrar={() => setFase('dentro')} />;

  const Vista = () => {
    switch (cima.v) {
      case 'home': return <Home abrir={abrir} salir={async () => { await salir(); setPila([{ v: 'home' }]); setFase('auth'); }} />;
      case 'veta': case 'pay': case 'gid': case 'scan': case 'cerebroWeb':
        return <AppView vista={cima.v} params={cima.params} entrada={cima.entrada} abrir={abrir} volver={atras} />;
      case 'cerebro': return <Cerebro abrirWeb={() => transicion(() => setPila((p) => [...p, { v: 'cerebroWeb' }]))} />;
      case 'chat': return <Chat params={cima.params} abrir={abrir} />;
      case 'asistente': return <Asistente probar={(f) => setOrdenExterna({ f, n: Date.now() })} />;
      default: return <Home abrir={abrir} salir={() => setFase('auth')} />;
    }
  };

  return (
    <LinearGradient colors={G.pantalla} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <View style={s.sup}>
          {pila.length > 1 ? (
            <Pressable onPress={atras} hitSlop={12}><Text style={s.volver}>‹</Text></Pressable>
          ) : <View style={{ width: 20 }} />}
          <Text style={s.tit}>{tituloDe(cima.v)}</Text>
          <Pressable onPress={() => abrir('og://asistente/abrir')} hitSlop={12}>
            <Text style={s.ayuda}>?</Text>
          </Pressable>
        </View>
        <Animated.View style={{
          flex: 1,
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) },
          ],
        }}>
          <Vista />
        </Animated.View>
        <BarraGenesis contactos={contactos} abrir={abrir} ordenExterna={ordenExterna} />
      </SafeAreaView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  sup: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  volver: { color: C.gold, fontSize: 26, width: 20, lineHeight: 28 },
  tit: { flex: 1, textAlign: 'center', color: C.txt2, fontSize: 11, fontWeight: '700', letterSpacing: 3 },
  ayuda: { color: C.gold, fontSize: 16, fontWeight: '700', width: 20, textAlign: 'right' },
});
