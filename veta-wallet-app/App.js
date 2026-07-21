import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Pressable, Animated, Easing, StyleSheet, SafeAreaView, StatusBar, Platform, PanResponder } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { C } from './src/theme';
import { Nav, ToastCtx } from './src/ui';

import Splash from './src/screens/Splash';
import Auth from './src/screens/Auth';
import { Kyc, Seed, SeedView } from './src/screens/Onboard';
import Home from './src/screens/Home';
import TokenDetail from './src/screens/TokenDetail';
import { Send, Receive, Buy, Swap } from './src/screens/Trade';
import CardScreen from './src/screens/Card';
import { Remit, Activity, Notifications, Earn, Settings, Profile, MyTokenPay } from './src/screens/More';

const SCREENS = {
  splash: Splash, auth: Auth, kyc: Kyc, seed: Seed, seedview: SeedView,
  home: Home, token: TokenDetail, send: Send, receive: Receive, buy: Buy, swap: Swap,
  card: CardScreen, remit: Remit, activity: Activity, notifs: Notifications, earn: Earn, settings: Settings,
  profile: Profile, mytokenpay: MyTokenPay,
};
const TABS = [
  { r: 'home', label: 'Inicio', icon: 'wallet' },
  { r: 'card', label: 'Tarjeta', icon: 'card' },
  { r: 'swap', label: 'Swap', icon: 'swap-horizontal' },
  { r: 'activity', label: 'Actividad', icon: 'pulse' },
  { r: 'settings', label: 'Ajustes', icon: 'settings-sharp' },
];
const TAB_ROUTES = TABS.map((t) => t.r);
const FULLSCREEN = ['splash', 'auth']; // sin barra de estado propia / sin tabbar

export default function App() {
  const [stack, setStack] = useState([{ r: 'splash' }]);
  const [dir, setDir] = useState(1);
  const cur = stack[stack.length - 1];
  const anim = useRef(new Animated.Value(0)).current;

  const go = useCallback((r, params) => {
    if (TAB_ROUTES.includes(r)) { setDir(1); setStack([{ r, params }]); }
    else { setDir(1); setStack((s) => [...s, { r, params }]); }
  }, []);
  const back = useCallback(() => { setDir(-1); setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)); }, []);

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [cur.r, stack.length]);

  // ---- Toast ----
  const [toast, setToast] = useState(null);
  const tOp = useRef(new Animated.Value(0)).current;
  const tTimer = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    Animated.spring(tOp, { toValue: 1, useNativeDriver: true }).start();
    clearTimeout(tTimer.current);
    tTimer.current = setTimeout(() => Animated.timing(tOp, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => setToast(null)), 1900);
  }, []);

  // ---- swipe entre pestañas ----
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
      onPanResponderRelease: (_, g) => {
        const i = TAB_ROUTES.indexOf(stackRef.current[stackRef.current.length - 1].r);
        if (i < 0) return;
        if (g.dx < -55 && i < TAB_ROUTES.length - 1) go(TAB_ROUTES[i + 1]);
        else if (g.dx > 55 && i > 0) { setDir(-1); setStack([{ r: TAB_ROUTES[i - 1] }]); }
      },
    })
  ).current;

  const Screen = SCREENS[cur.r] || Home;
  const showTabs = TAB_ROUTES.includes(cur.r);
  const isFull = FULLSCREEN.includes(cur.r);

  const tx = anim.interpolate({ inputRange: [0, 1], outputRange: [dir * 42, 0] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] });

  const content = (
    <Animated.View style={{ flex: 1, opacity: anim, transform: [{ translateX: tx }, { scale }] }} {...(showTabs ? pan.panHandlers : {})}>
      <Nav.Provider value={{ go, back, route: cur.r }}>
        <ToastCtx.Provider value={showToast}>
          <Screen nav={{ go, back, route: cur.r }} params={cur.params || {}} />
        </ToastCtx.Provider>
      </Nav.Provider>
    </Animated.View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ExpoStatusBar style="light" />
      {isFull ? (
        <View style={{ flex: 1 }}>{content}</View>
      ) : (
        <SafeAreaView style={{ flex: 1, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 }}>
          {content}
          {showTabs && (
            <View style={styles.tabbar}>
              {TABS.map((t) => {
                const on = cur.r === t.r;
                return (
                  <Pressable key={t.r} onPress={() => go(t.r)} style={styles.tab}>
                    <Ionicons name={t.icon} size={23} color={on ? C.gold : C.txt3} />
                    <Text style={[styles.tabTxt, { color: on ? C.gold : C.txt3 }]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </SafeAreaView>
      )}

      {toast && (
        <Animated.View style={[styles.toast, { opacity: tOp, transform: [{ translateY: tOp.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <Ionicons name="checkmark-circle" size={17} color={C.up} />
          <Text style={styles.toastTxt}>{toast}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabbar: { flexDirection: 'row', backgroundColor: 'rgba(3,22,23,0.96)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 9, paddingBottom: Platform.OS === 'ios' ? 24 : 10 },
  tab: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  tabTxt: { fontSize: 10, fontWeight: '600' },
  toast: { position: 'absolute', bottom: 96, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0A3A3C', borderWidth: 1, borderColor: C.gold, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20, maxWidth: '86%' },
  toastTxt: { color: C.txt, fontWeight: '600', fontSize: 13 },
});
