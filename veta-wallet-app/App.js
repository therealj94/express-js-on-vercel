import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Pressable, Animated, Easing, StyleSheet, SafeAreaView, StatusBar, Platform, PanResponder, BackHandler, AppState } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { Icon } from './src/icons';
import { C } from './src/theme';
import { Nav, ToastCtx, AccountCtx, AppBackground } from './src/ui';
import { LangProvider, useT, useLang } from './src/i18n';
import * as Linking from 'expo-linking';
import NetInfo from '@react-native-community/netinfo';
import { loadSession, saveSession, clearSession, initAccounts, updateAccount } from './src/accounts';
import { loadToken, setToken, setRefreshToken, ensureSession, clearCreds, apiPortfolio } from './src/api';
import { desactivarDesbloqueo } from './src/unlock';
import { buscarActualizacion, aplicarActualizacion, puedeActualizar } from './src/updates';
import { recordLogout } from './src/sessionLog';
import { primerArranque } from './src/backupNudge';
import { activarAvisos, limpiarAvisos, watchIncoming, marcarVisto, stopWatch, alTocarNotificacion, avisosActivos } from './src/notify';
import LockScreen, { useAppLock } from './src/LockScreen';

import Splash from './src/screens/Splash';
import Auth from './src/screens/Auth';
import { Kyc, SeedView, GenesisOffer } from './src/screens/Onboard';
import Home from './src/screens/Home';
import TokenDetail from './src/screens/TokenDetail';
import { Send, Receive, Buy, Swap } from './src/screens/Trade';
import CardScreen from './src/screens/Card';
import CardSettings from './src/screens/CardSettings';
import FundCard from './src/screens/FundCard';
import Deposit from './src/screens/Deposit';
import { Activity, Notifications, Settings, Profile, MyTokenPay, Passport, Blocked, PrivateKey } from './src/screens/More';
import Scan from './src/screens/Scan';
import Contacts from './src/screens/Contacts';
import About from './src/screens/About';
import Onboarding, { seenOnboarding } from './src/screens/Onboarding';
import WatchOnly from './src/screens/WatchOnly';
import Sessions from './src/screens/Sessions';
import Help from './src/screens/Help';
import Remesas from './src/screens/Remesas';
import DeleteAccount from './src/screens/DeleteAccount';
import ErrorBoundary from './src/ErrorBoundary';
import { arrancarTelemetria, fallo } from './src/telemetria';

const SCREENS = {
  splash: Splash, auth: Auth, kyc: Kyc, seedview: SeedView, genesisOffer: GenesisOffer,
  home: Home, token: TokenDetail, send: Send, receive: Receive, buy: Buy, swap: Swap,
  card: CardScreen, cardSettings: CardSettings, fundCard: FundCard, deposit: Deposit, activity: Activity, notifs: Notifications, settings: Settings,
  profile: Profile, mytokenpay: MyTokenPay, passport: Passport, blocked: Blocked, privatekey: PrivateKey,
  scan: Scan, contacts: Contacts, about: About,
  onboarding: Onboarding, watchOnly: WatchOnly, sessions: Sessions, help: Help,
  remesas: Remesas, deleteAccount: DeleteAccount,
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
    <ErrorBoundary>
      <SafeAreaProvider>
        <LangProvider>
          <Root />
        </LangProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

function Root() {
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [stack, setStack] = useState([{ r: 'splash' }]);
  const [dir, setDir] = useState(1);
  const [account, setAccount] = useState(null);
  const cur = stack[stack.length - 1];
  const anim = useRef(new Animated.Value(0)).current;

  // Candado biométrico: se pide al arrancar y al volver del segundo plano
  // tras más de 2 minutos afuera. Sin biometría configurada arranca abierto.
  const { locked, setLocked, available } = useAppLock();

  // Banner sin internet: aparece en la parte superior cuando NetInfo
  // reporta desconexión, se desvanece al recuperar.
  const [online, setOnline] = useState(true);
  const [updateLista, setUpdateLista] = useState(false);
  useEffect(() => {
    const sub = NetInfo.addEventListener((s) => {
      setOnline(s.isConnected !== false);
    });
    return () => sub();
  }, []);

  // Telemetría: se arranca una vez, al montar. Nunca lanza — si Genesis ID no
  // responde, la cola se guarda y se reintenta con espera creciente, y la app
  // ni se entera. A partir de aquí quedan enganchados también los errores que
  // nadie atrapa, que son los que dejan la pantalla en negro.
  useEffect(() => {
    arrancarTelemetria();
  }, []);

  // Arranque: restaura la sesión guardada y renueva el token en silencio
  // (con "Recordarme" el JWT vencido se renueva solo — la app no te saca).
  useEffect(() => {
    (async () => {
      await loadToken();
      await initAccounts();
      await primerArranque(); // marca por dispositivo, para el nudge de respaldo
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
    logout: () => { recordLogout(); setAccount(null); clearSession(); setToken(null); setRefreshToken(null); clearCreds(); desactivarDesbloqueo(); limpiarAvisos(); },
  };

  // Actualizaciones por aire. Se consulta al arrancar y cada vez que la app
  // vuelve del segundo plano; si hay algo nuevo se descarga y se ofrece
  // aplicarlo. Nunca se reinicia sola: hacerlo a mitad de un envío seria peor
  // que esperar al proximo arranque.
  useEffect(() => {
    if (!puedeActualizar()) return;   // Expo Go y desarrollo: no aplica
    let vivo = true;
    let ultima = 0;

    const revisar = async () => {
      // No tiene sentido preguntar en cada cambio de foco; basta cada 10 min.
      if (Date.now() - ultima < 10 * 60 * 1000) return;
      ultima = Date.now();
      const lista = await buscarActualizacion();
      if (vivo && lista) setUpdateLista(true);
    };

    revisar();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') revisar(); });
    return () => { vivo = false; sub.remove(); };
  }, []);

  // Deep links entrantes.
  // Dos casos:
  //   vetawallet://genesis → abre la verificación de identidad.
  //   vetawallet://pay?to=...&amount=...&memo=... → solicitud de pago
  //   recibida por link o QR. Se abre Enviar con los campos rellenos.
  const accountRef = useRef(account);
  accountRef.current = account;
  useEffect(() => {
    const parsePayLink = (url) => {
      // Formato esperado: vetawallet://pay?to=0x...&amount=X&sym=ORIGEN&memo=...
      try {
        const q = url.split('?')[1] || '';
        const params = {};
        for (const kv of q.split('&')) {
          if (!kv) continue;
          const [k, v] = kv.split('=');
          if (k) params[k] = v ? decodeURIComponent(v) : '';
        }
        return params;
      } catch (e) { return {}; }
    };

    const handle = async (url) => {
      if (!url) return;

      // ---- Solicitud de pago ----
      if (/vetawallet:\/\/pay(\?|$)/i.test(url)) {
        if (!accountRef.current) return; // sin sesión, no hay a quién llevar
        const p = parsePayLink(url);
        if (!/^0x[a-fA-F0-9]{40}$/.test(p.to || '')) return;
        setDir(1);
        setStack([{ r: 'home' }, { r: 'send', params: p }]);
        return;
      }

      // ---- Pago pedido por MyTokenPay ----
      //
      // MyTokenPay manda: vetawallet://pagar?a=0x…&monto=…&token=ORIGEN&
      // ref=COD&memo=…&volver=mytokenpay://pagar/COD?sello=…
      // Se abre Enviar con todo puesto; al confirmarse el envio, el
      // comprobante ofrece volver a MyTokenPay con el hash para que el cobro
      // se confirme alla.
      if (/vetawallet:\/\/pagar(\?|$)/i.test(url)) {
        if (!accountRef.current) return;
        const p = parsePayLink(url);
        if (!/^0x[a-fA-F0-9]{40}$/.test(p.a || '')) return;
        setDir(1);
        setStack([{ r: 'home' }, { r: 'send', params: {
          to: p.a, amount: p.monto, sym: p.token || 'ORIGEN',
          memo: p.memo || p.ref || '', volver: p.volver || null,
        } }]);
        return;
      }

      // ---- Puerta al ecosistema: emitir pase y saltar a MyTokenPay ----
      //
      // MyTokenPay abre vetawallet://sso?destino=mytokenpay cuando alguien
      // toca «Entrar con Genesis ID» allá. Aquí se abre la pantalla del
      // puente, que pide el pase al backend y devuelve al usuario con
      // mytokenpay://sso?token=…  El pase lo firma Genesis ID; esta app solo
      // hace de cartero.
      if (/vetawallet:\/\/sso(\?|$)/i.test(url)) {
        if (!accountRef.current) return; // sin sesión no hay pase que pedir
        const p = parsePayLink(url);
        if ((p.destino || '').toLowerCase() !== 'mytokenpay') return;
        setDir(1);
        setStack([{ r: 'home' }, { r: 'mytokenpay', params: { auto: 1 } }]);
        return;
      }

      // ---- Enlace a la verificación de identidad ----
      //
      // Antes este bloque leía un "pasaporte" de los parámetros del enlace de
      // retorno del portal genesisid.online y lo daba por bueno. Eso convertía
      // un enlace en una vía para marcarse como verificado: bastaba abrir
      // vetawallet://genesis?gid=…&name=… para que la app lo creyera.
      //
      // Ahora quien decide si alguien está verificado es el servidor, así que
      // el enlace solo abre la pantalla y esta consulta el estado real.
      if (!/genesis/i.test(url)) return;
      if (!accountRef.current) return;
      setDir(1);
      setStack([{ r: 'home' }, { r: 'kyc' }]);
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

  // ---- Toast con variantes ----
  // Antes había un solo estilo (borde dorado + tick verde) sin importar el
  // mensaje. Ahora se acepta un segundo argumento con la variante:
  //   'success' (por defecto, verde) · 'error' (rojo) · 'warn' (ámbar) · 'info' (dorado)
  // El toast pinta borde y ícono acordes. Llamadas viejas showToast('msg')
  // siguen funcionando sin cambio.
  const [toast, setToast] = useState(null);
  const tOp = useRef(new Animated.Value(0)).current;
  const tTimer = useRef(null);
  const showToast = useCallback((msg, variant = 'success') => {
    setToast({ msg, variant });
    Animated.spring(tOp, { toValue: 1, useNativeDriver: true }).start();
    clearTimeout(tTimer.current);
    tTimer.current = setTimeout(() => Animated.timing(tOp, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => setToast(null)), 2200);
  }, []);
  const toastStyle = toast
    ? (toast.variant === 'error' ? { border: C.down, icon: 'alert-circle' }
      : toast.variant === 'warn' ? { border: '#FBBF24', icon: 'warning' }
      : toast.variant === 'info' ? { border: C.gold, icon: 'information-circle' }
      : { border: C.up, icon: 'checkmark-circle' })
    : null;

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

    const arrancar = (cada = 25000) => {
      parar();
      parar = watchIncoming({
        email,
        lang,
        cada,
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

    // Al cambiar de app NO se deja de vigilar: solo se espacia la consulta.
    // Si se parara del todo, moverse un momento a otra app dejaba al usuario
    // sin aviso hasta la siguiente pasada de la tarea de sistema (~15 min).
    // Cuando el teléfono suspenda la app, esa tarea toma el relevo igual.
    const sub = AppState.addEventListener('change', (s) => {
      if (!vivo) return;
      arrancar(s === 'active' ? 25000 : 60000);
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
      {/* El margen de ARRIBA sale de los insets igual que el de abajo.
          `StatusBar.currentHeight` devuelve 0 cuando la app dibuja de borde a
          borde —lo normal desde Android 15— y el encabezado se metia debajo del
          reloj y la bateria. Se toma el mayor de los dos por si acaso. */}
      {isFull ? (
        <View style={{ flex: 1 }}>{content}</View>
      ) : (
        <SafeAreaView style={{ flex: 1, paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0) }}>
          {content}
          {/* La barra de navegacion de Android —los tres botones, o la raya de
              gestos— tapaba el menu: `SafeAreaView` no la contempla en Android.
              `insets.bottom` da su altura real en cada telefono. */}
          {showTabs && (
            <View style={[styles.tabbar, { paddingBottom: Math.max(insets.bottom, 10) + 6 }]}>
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
        <Animated.View style={[
          styles.toast,
          { borderColor: toastStyle.border, opacity: tOp, transform: [{ translateY: tOp.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
        ]}>
          <Icon name={toastStyle.icon} size={17} color={toastStyle.border} />
          <Text style={styles.toastTxt}>{toast.msg}</Text>
        </Animated.View>
      )}

      {!online && (
        <View style={styles.offline} pointerEvents="none">
          <Icon name="cloud-offline" size={14} color="#fff" />
          <Text style={styles.offlineTxt}>{tr('home.offlineBanner')}</Text>
        </View>
      )}

      {/* Actualizacion ya descargada, esperando a que el usuario decida.
          No se aplica sola: reiniciar a alguien a mitad de un envio seria
          peor que esperar al proximo arranque. */}
      {updateLista && (
        <View style={styles.updBanner}>
          <Icon name="cloud-upload" size={16} color={C.darkText} />
          <Text style={styles.updTxt}>{tr('upd.lista')}</Text>
          <Pressable onPress={aplicarActualizacion} style={styles.updBtn} accessibilityRole="button">
            <Text style={styles.updBtnTxt}>{tr('upd.aplicar')}</Text>
          </Pressable>
          <Pressable onPress={() => setUpdateLista(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr('upd.luego')}>
            <Icon name="close-circle" size={18} color="rgba(58,44,8,0.55)" />
          </Pressable>
        </View>
      )}

      {locked && (
        <View style={StyleSheet.absoluteFill}>
          <LockScreen onUnlock={() => setLocked(false)} available={available} />
        </View>
      )}
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  // Barra inferior de vidrio: deja pasar un poco del fondo de marca.
  tabbar: { flexDirection: 'row', backgroundColor: 'rgba(3,22,23,0.82)', borderTopWidth: 1, borderTopColor: 'rgba(201,169,97,0.16)', paddingTop: 9 },
  tab: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  tabTxt: { fontSize: 10, fontWeight: '600' },
  toast: { position: 'absolute', bottom: 96, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0A3A3C', borderWidth: 1, borderColor: C.gold, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20, maxWidth: '86%' },
  toastTxt: { color: C.txt, fontWeight: '600', fontSize: 13 },
  offline: {
    position: 'absolute',
    top: 0,
    left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#8A2A21',
    paddingVertical: 6, paddingHorizontal: 12,
  },
  offlineTxt: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
  updBanner: {
    position: 'absolute', left: 12, right: 12, bottom: 96,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.gold, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  updTxt: { flex: 1, color: C.darkText, fontSize: 12.5, fontWeight: '700' },
  updBtn: { backgroundColor: 'rgba(58,44,8,0.14)', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 6 },
  updBtnTxt: { color: C.darkText, fontSize: 12, fontWeight: '800' },
});
