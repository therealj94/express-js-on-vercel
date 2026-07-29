import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Pressable, Animated, Easing, StyleSheet, SafeAreaView, StatusBar, Platform, PanResponder, BackHandler, AppState } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { Icon } from './src/icons';
import { C } from './src/theme';
import { Nav, ToastCtx, AccountCtx, AppBackground } from './src/ui';
import { LangProvider, useT, useLang } from './src/i18n';
import * as Linking from 'expo-linking';
import { loadSession, saveSession, clearSession, initAccounts, setPassport, updateAccount } from './src/accounts';
import { loadToken, setToken, ensureSession, clearCreds, apiPortfolio } from './src/api';
import { readReturnUrl, genesis, mergePassport } from './src/genesis';
import { activarAvisos, limpiarAvisos, watchIncoming, marcarVisto, stopWatch, alTocarNotificacion, avisosActivos } from './src/notify';

import Splash from './src/screens/Splash';
import Auth from './src/screens/Auth';
import { Kyc, SeedView, GenesisOffer } from './src/screens/Onboard';
import Home from './src/screens/Home';
import TokenDetail from './src/screens/TokenDetail';
import { Send, Receive, Buy, Swap } from './src/screens/Trade';
import CardScreen from './src/screens/Card';
import { Activity, Notifications, Settings, Profile, MyTokenPay, Passport, Blocked, PrivateKey } from './src/screens/More';
import Scan from './src/screens/Scan';
import Contacts from './src/screens/Contacts';
import ImportPassport from './src/screens/ImportPassport';
import About from './src/screens/About';

const SCREENS = {
  splash: Splash, auth: Auth, kyc: Kyc, seedview: SeedView, genesisOffer: GenesisOffer,
  home: Home, token: TokenDetail, send: Send, receive: Receive, buy: Buy, swap: Swap,
  card: CardScreen, activity: Activity, notifs: Notifications, settings: Settings,
  profile: Profile, mytokenpay: MyTokenPay, passport: Passport, blocked: Blocked, privatekey: PrivateKey,
  scan: Scan, contacts: Contacts, importPassport: ImportPassport, about: About,
};
const TABS = [
  { r: 'home', label: 'tab.home', icon: 'wallet' },
  { r: 'card', label: 'tab.card', icon: 'card' },
  { r: 'swap', label: 'tab.swap', icon: 'swap-horizontal' },
  { r: 'activity', label: 'tab.activity', icon: 'pulse' },
  { r: 'settings', label: 'tab.settings', icon: 'settings-sharp' },
];
const TAB_ROUTES = TABS.map((t) => t.r);
const FULLSCREEN = ['splash', 'auth']; // sin barra de estado propia / sin tabbar

export default function App() {
  return (
    <LangProvider>
      <Root />
    </LangProvider>
  );
}

function Root() {
  const tr = useT();
  const [stack, setStack] = useState([{ r: 'splash' }]);
  const [dir, setDir] = useState(1);
  const [account, setAccount] = useState(null);
  const cur = stack[stack.length - 1];
  const anim = useRef(new Animated.Value(0)).current;

  // Arranque: restaura la sesión guardada y renueva el token en silencio
  // (con "Recordarme" el JWT vencido se renueva solo — la app no te saca).
  useEffect(() => {
    (async () => {
      await loadToken();
      await initAccounts();
      const saved = await loadSession();
      if (saved) {
        setAccount(saved);
        ensureSession(); // renueva el JWT en segundo plano si expiró
      }
    })();
  }, []);
  const acctApi = {
    account,
    login: (a) => { setAccount(a); saveSession(a.email); },
    logout: () => { setAccount(null); clearSession(); setToken(null); clearCreds(); limpiarAvisos(); },
  };

  // Retorno desde el portal Genesis ID (vetawallet://genesis?uid=…). Captura el
  // pasaporte aunque la app estuviera en segundo plano o se abriera de cero.
  const accountRef = useRef(account);
  accountRef.current = account;
  useEffect(() => {
    const handle = async (url) => {
      if (!url || !/genesis/i.test(url)) return;
      const acc = accountRef.current;
      if (!acc) return;
      const { token, passport } = readReturnUrl(url);
      // Con token: se valida en el servidor (allí vive la API key del portal).
      // Se combina todo para no perder GID, nombre ni foto.
      let p = passport;
      if (token) {
        const validated = await genesis.validateToken(token, { email: acc.email, walletAddress: acc.addr });
        p = mergePassport(p, validated);
      }
      if (p && (!p.photoUrl || !p.fullName)) {
        const status = await genesis.status(acc.email, acc.addr).catch(() => null);
        p = mergePassport(p, status);
      }
      if (!p) return;
      p.fullName = p.fullName || acc.name;
      p.email = p.email || acc.email;
      p.walletAddress = p.walletAddress || acc.addr;
      await genesis.save(p);
      const updated = await setPassport(acc.email, p);
      if (updated) { setAccount(updated); setDir(1); setStack([{ r: 'home' }, { r: 'passport' }]); }
    };
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    Linking.getInitialURL().then(handle).catch(() => {});
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ---- swipe a la derecha para REGRESAR en pantallas apiladas ----
  const backPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dx > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
      onPanResponderRelease: (_, g) => {
        if (g.dx > 60) {
          const s = stackRef.current;
          if (s.length > 1) { setDir(-1); setStack(s.slice(0, -1)); }
          else if (!TAB_ROUTES.includes(s[s.length - 1].r)) { setDir(-1); setStack([{ r: 'home' }]); }
        }
      },
    })
  ).current;

  // ---- botón ATRÁS de Android ----
  // Sin esto Android cierra la app en cualquier pantalla. Ahora:
  //   pantalla apilada → vuelve una atrás
  //   pestaña que no es Inicio → vuelve a Inicio
  //   Inicio → dos toques seguidos para salir (el primero avisa)
  const salir = useRef(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const s = stackRef.current;
      const actual = s[s.length - 1].r;
      if (actual === 'auth' || actual === 'splash') return false; // sin sesión, salir
      if (s.length > 1) { setDir(-1); setStack(s.slice(0, -1)); return true; }
      if (actual !== 'home') { setDir(-1); setStack([{ r: 'home' }]); return true; }
      if (Date.now() - salir.current < 2000) return false; // segundo toque: sale
      salir.current = Date.now();
      showToast(tr('nav.exit'));
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tr]);

  // ---- avisos de tokens recibidos ----
  // Con la app abierta vigila la red cada 25 s; la tarea en segundo plano
  // (src/notify.js) se encarga de cuando la app está cerrada.
  const { lang } = useLang();
  useEffect(() => {
    if (!account?.email) { stopWatch(); return; }
    const email = account.email;
    let vivo = true;
    let parar = () => {};

    const arrancar = () => {
      parar();
      parar = watchIncoming({
        email,
        lang,
        traer: apiPortfolio,
        // Al entrar dinero, el saldo en pantalla se actualiza junto con el aviso.
        onNuevas: async (n, p) => {
          const upd = await updateAccount(email, { balances: p.balances, transfers: p.transfers });
          if (!vivo) return;
          if (upd) setAccount({ ...upd });
          showToast(tr('notif.gotToast'));
        },
      });
    };

    (async () => {
      // Lo que ya está en el historial no se notifica: solo lo que llegue nuevo.
      await marcarVisto(email, account.transfers);
      if (!vivo) return;
      if (await avisosActivos()) await activarAvisos(email);
      if (!vivo) return;
      arrancar();
    })();

    // En segundo plano no se consulta desde aquí: de eso se encarga la tarea
    // de sistema, que además gasta mucha menos batería.
    const sub = AppState.addEventListener('change', (s) => {
      if (!vivo) return;
      if (s === 'active') arrancar(); else { parar(); stopWatch(); }
    });

    return () => { vivo = false; parar(); stopWatch(); sub.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.email, lang]);

  // Tocar la notificación abre Actividad.
  useEffect(() => alTocarNotificacion((pantalla) => {
    if (accountRef.current) { setDir(1); setStack([{ r: pantalla || 'activity' }]); }
  }), []);

  const Screen = SCREENS[cur.r] || Home;
  const showTabs = TAB_ROUTES.includes(cur.r);
  const isFull = FULLSCREEN.includes(cur.r);

  const tx = anim.interpolate({ inputRange: [0, 1], outputRange: [dir * 42, 0] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] });

  const content = (
    <Animated.View
      style={{ flex: 1, opacity: anim, transform: [{ translateX: tx }, { scale }] }}
      {...(showTabs ? pan.panHandlers : !isFull ? backPan.panHandlers : {})}>
      <Nav.Provider value={{ go, back, route: cur.r }}>
        <AccountCtx.Provider value={acctApi}>
          <ToastCtx.Provider value={showToast}>
            <Screen nav={{ go, back, route: cur.r }} params={cur.params || {}} />
          </ToastCtx.Provider>
        </AccountCtx.Provider>
      </Nav.Provider>
    </Animated.View>
  );

  return (
    // Fondo de marca en TODA la app: las pantallas de marca (splash/login)
    // traen el suyo propio a pantalla completa; el resto se dibuja sobre la
    // misma foto muy velada, que aporta profundidad sin restar legibilidad.
    <AppBackground intensity="content">
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
                    <Icon name={t.icon} size={23} color={on ? C.gold : C.txt3} />
                    <Text style={[styles.tabTxt, { color: on ? C.gold : C.txt3 }]}>{tr(t.label)}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </SafeAreaView>
      )}

      {toast && (
        <Animated.View style={[styles.toast, { opacity: tOp, transform: [{ translateY: tOp.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <Icon name="checkmark-circle" size={17} color={C.up} />
          <Text style={styles.toastTxt}>{toast}</Text>
        </Animated.View>
      )}
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  // Barra inferior de vidrio: deja pasar un poco del fondo de marca.
  tabbar: { flexDirection: 'row', backgroundColor: 'rgba(3,22,23,0.82)', borderTopWidth: 1, borderTopColor: 'rgba(201,169,97,0.16)', paddingTop: 9, paddingBottom: Platform.OS === 'ios' ? 24 : 10 },
  tab: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  tabTxt: { fontSize: 10, fontWeight: '600' },
  toast: { position: 'absolute', bottom: 96, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0A3A3C', borderWidth: 1, borderColor: C.gold, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20, maxWidth: '86%' },
  toastTxt: { color: C.txt, fontWeight: '600', fontSize: 13 },
});
