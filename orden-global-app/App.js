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
import { loadToken, setToken, setRefreshToken, ensureSession, clearCreds, apiPortfolio, getToken, walletApi } from './src/api';
import { desactivarDesbloqueo } from './src/unlock';
import { buscarActualizacion, aplicarActualizacion, puedeActualizar } from './src/updates';
import { recordLogout } from './src/sessionLog';
import { primerArranque } from './src/backupNudge';
import { activarAvisos, limpiarAvisos, watchIncoming, marcarVisto, stopWatch, alTocarNotificacion, avisosActivos, notificarMensaje, testigoDeEsteTelefono, soltarTestigo } from './src/notify';
import * as M from './src/og/mensajes';
import { vigilarMensajes } from './src/og/vigiaChat';
import { reproducir } from './src/og/sonidos';
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
// ── La fusión Orden Global: hub, chat, cobrar y el asistente ──
import Ecosistema from './src/og/Ecosistema';
import AuroChat from './src/og/AuroChat';
import Timbre from './src/og/Timbre';
import GruposAuro from './src/og/GruposAuro';
import AjustesAuro from './src/og/AjustesAuro';
import CobrarOG from './src/og/CobrarOG';
import FlotanteOG from './src/og/FlotanteOG';
import ReporteOG from './src/og/ReporteOG';
import Nucleo from './src/og/Nucleo';
/* Las casas del ecosistema que viven en la web y se abren DENTRO de la app:
   el Inicio con su galaxia, PULSE2CHAT con su cifrado y sus llamadas, y
   Ordenex. Ver src/og/CasaWeb.js — el dinero NO pasa por ahi. */
import CasaWeb from './src/og/CasaWeb';
import PanelPay from './src/og/pay/PanelPay';
import CobroPay from './src/og/pay/CobroPay';
import InicioPay from './src/og/pay/InicioPay';
import NegocioPanel from './src/og/pay/NegocioPanel';
import NegocioDetalle from './src/og/pay/NegocioDetalle';
import NotificacionesPay from './src/og/pay/NotificacionesPay';
import PagarPay from './src/og/pay/PagarPay';
import ExplorarPay from './src/og/pay/ExplorarPay';
import MiNegocio from './src/og/pay/MiNegocio';
import BonosPay from './src/og/pay/BonosPay';
import ActividadPay from './src/og/pay/ActividadPay';
import { abrir as abrirOG } from './src/og/rutas';
import { activarInmersivo, vigilarInmersivo } from './src/og/Inmersivo';
import { cargarNombre } from './src/og/asistente';
import Remesas from './src/screens/Remesas';
import DeleteAccount from './src/screens/DeleteAccount';
import ChangePassword from './src/screens/ChangePassword';
import ErrorBoundary from './src/ErrorBoundary';
import { arrancarTelemetria, fallo, identificar, olvidar, confirmarEnPadron, idDelToken } from './src/telemetria';

const SCREENS = {
  splash: Splash, auth: Auth, kyc: Kyc, seedview: SeedView, genesisOffer: GenesisOffer,
  home: Home, token: TokenDetail, send: Send, receive: Receive, buy: Buy, swap: Swap,
  card: CardScreen, cardSettings: CardSettings, fundCard: FundCard, deposit: Deposit, activity: Activity, notifs: Notifications, settings: Settings,
  profile: Profile, mytokenpay: MyTokenPay, passport: Passport, blocked: Blocked, privatekey: PrivateKey,
  scan: Scan, contacts: Contacts, about: About,
  onboarding: Onboarding, watchOnly: WatchOnly, sessions: Sessions, help: Help,
  remesas: Remesas, deleteAccount: DeleteAccount, changePassword: ChangePassword,
  ecosistema: Nucleo, lista: Ecosistema, chat: AuroChat, cobrar: CobrarOG,
  casa: CasaWeb,
  reporte: ReporteOG, 'pay-panel': PanelPay, 'pay-actividad': ActividadPay,
  'pay-cobro': CobroPay, 'pay-pagar': PagarPay, 'pay-explorar': ExplorarPay,
  'pay-negocio': MiNegocio, 'pay-bonos': BonosPay, 'pay-inicio': InicioPay,
  'auro-grupo': GruposAuro, 'auro-nuevo': GruposAuro, 'auro-ajustes': AjustesAuro,
  'pay-negocio-panel': NegocioPanel, 'pay-negocio-detalle': NegocioDetalle,
  'pay-notificaciones': NotificacionesPay,
};
const SECCION_TABS = {
  og: [
    { r: 'ecosistema', label: 'tab.eco', icon: 'planet' },
    { r: 'chat', label: 'tab.chat', icon: 'chatbubbles' },
    { r: 'settings', label: 'tab.settings', icon: 'settings-sharp' },
  ],
  veta: [
    { r: 'ecosistema', label: 'tab.eco', icon: 'planet' },
    { r: 'home', label: 'tab.home', icon: 'wallet' },
    { r: 'card', label: 'tab.card', icon: 'card' },
    { r: 'swap', label: 'tab.swap', icon: 'swap-horizontal' },
    { r: 'activity', label: 'tab.activity', icon: 'pulse' },
  ],
  pay: [
    { r: 'ecosistema', label: 'tab.eco', icon: 'planet' },
    { r: 'pay-inicio', label: 'tab.inicio', icon: 'home' },
    { r: 'pay-panel', label: 'tab.negocio', icon: 'storefront' },
    { r: 'pay-cobro', label: 'tab.cobrar', icon: 'qr-code' },
    { r: 'pay-pagar', label: 'tab.pagar', icon: 'scan' },
    { r: 'pay-explorar', label: 'tab.explorar', icon: 'compass' },
  ],
};
const TAB_ROUTES = [...new Set(Object.values(SECCION_TABS).flat().map((t) => t.r))];
// a que seccion pertenece cada pantalla que NO es compartida
const SECCION_DE = {
  ecosistema: 'og', chat: 'og', casa: 'og',
  // Ajustes es pestaña de la sección og: sin esta fila, entrar por el avatar
  // de Home dejaba la barra veta debajo con ninguna pestaña encendida.
  settings: 'og', changePassword: 'og',
  home: 'veta', card: 'veta', swap: 'veta', activity: 'veta', token: 'veta',
  send: 'veta', receive: 'veta', buy: 'veta', deposit: 'veta', fundCard: 'veta',
  cardSettings: 'veta', remesas: 'veta', reporte: 'veta',
  'pay-panel': 'pay', 'pay-actividad': 'pay', mytokenpay: 'pay',
  'pay-cobro': 'pay', 'pay-pagar': 'pay', 'pay-explorar': 'pay',
  'pay-negocio': 'pay', 'pay-bonos': 'pay', 'pay-inicio': 'pay',
  'auro-grupo': 'og', 'auro-nuevo': 'og', 'auro-ajustes': 'og',
  'pay-negocio-panel': 'pay', 'pay-negocio-detalle': 'pay', 'pay-notificaciones': 'pay',
  lista: 'og',
};
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
  // true cuando loadSession TERMINÓ (haya o no cuenta guardada): el splash
  // espera esta bandera para decidir ruta con la sesión en la mano.
  const [sesionLista, setSesionLista] = useState(false);
  const cur = stack[stack.length - 1];
  // Arranca en 1: la primera pantalla (splash) no llega navegando y debe
  // verse entera; el valor se resetea a 0 en cada transición real.
  const anim = useRef(new Animated.Value(1)).current;

  // Candado biométrico: protege una SESIÓN abierta al arrancar y al volver
  // del segundo plano tras más de 2 minutos afuera. Solo se pinta con cuenta
  // y después del splash (ver render): recién instalada no hay nada que
  // proteger y la primera impresión no puede ser un candado.
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
      try {
      await loadToken();
      await initAccounts();
      await primerArranque(); // marca por dispositivo, para el nudge de respaldo
      const saved = await loadSession();
      if (saved) {
        setAccount(saved);
        // Sin esto la telemetría sale ANONIMA y el panel no puede contar
        // personas: los eventos llegan pero sin nadie a quien atribuirlos, y
        // «Últimas conexiones» se queda vacío aunque la app esté reportando.
        // Es el caso más común, además: quien no cierra sesión nunca vuelve a
        // pasar por el login.
        // El identificador sale del TOKEN, no de la cuenta local: Genesis ID
        // saca el suyo de ese mismo token al dar el alta, y si los dos no
        // coinciden la huella no cuadra con la fila del padrón.
        const jwt = getToken();
        identificar(idDelToken(jwt) || saved.userId || saved.email);
        if (jwt) {
          confirmarEnPadron(jwt, {
            email: saved.email, nombre: saved.name, direccionWallet: saved.addr,
          });
        }
        ensureSession(); // renueva el JWT en segundo plano si expiró
      }
      } finally {
        // Con o sin cuenta guardada —y aunque algo fallara a medio camino—,
        // el splash necesita saber que la carga TERMINÓ: decide la ruta con
        // esta bandera y no con un timer que apuesta a que ya estará.
        setSesionLista(true);
      }
    })();
  }, []);

  // Sin sesión guardada no hay nada que el candado proteja: recién instalada
  // (o tras cerrar sesión) la app no puede recibir con una petición de huella.
  useEffect(() => {
    if (sesionLista && !account) setLocked(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesionLista, account]);

  const acctApi = {
    account,
    // el splash espera esta bandera antes de decidir ruta (ver arriba)
    ready: sesionLista,
    login: (a) => {
      setAccount(a);
      saveSession(a.email);
      // El identificador sale del TOKEN, igual que el que Genesis ID saca al
      // dar el alta: si los dos no coinciden, la huella de telemetría no cuadra
      // con la fila del padrón y todo sale como «fuera del padrón».
      const jwt = getToken();
      identificar(idDelToken(jwt) || a.userId || a.email);
      // Y se da de alta en el padrón probándolo con esta misma sesión.
      if (jwt) {
        confirmarEnPadron(jwt, { email: a.email, nombre: a.name, direccionWallet: a.addr });
      }
    },
    logout: () => {
      // Primero el servidor, con el token aún en memoria; sin esperar: lo
      // local no depende de que la red conteste. Ver walletApi.logout.
      try { walletApi.logout().catch(() => {}); } catch {}
      // Y el teléfono deja de recibir avisos de esta cuenta: sin esto, el
      // siguiente que entre en este aparato recibe los mensajes del anterior.
      // `testigoDeEsteTelefono` existía para esto y nadie lo llamaba.
      try {
        const testigo = testigoDeEsteTelefono();
        if (testigo) M.olvidarTelefono(testigo).catch(() => {});
        soltarTestigo();
      } catch {}
      olvidar(); recordLogout(); setAccount(null); clearSession(); setToken(null); setRefreshToken(null); clearCreds(); desactivarDesbloqueo(); limpiarAvisos();
    },
  };

  // Actualizaciones por aire. Se consulta al arrancar y cada vez que la app
  // vuelve del segundo plano; si hay algo nuevo se descarga y se ofrece
  // aplicarlo. Nunca se reinicia sola: hacerlo a mitad de un envío seria peor
  // que esperar al proximo arranque.
  useEffect(() => {
    // La consulta se corta AQUÍ en Expo Go y en desarrollo: puedeActualizar()
    // devuelve false y checkForUpdateAsync() no llega a llamarse nunca, así
    // que no aparece el banner de «hay una versión nueva» —que en la vista
    // previa sería mentira, porque ahí el código llega por el dev server—.
    if (!puedeActualizar()) return;
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
  /** Enlace que llego antes de que hubiera sesion. Se atiende al iniciarla. */
  const pendienteRef = useRef(null);
  const handleRef = useRef(null);
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
      if (/^og:\/\//.test(url)) {
        if (!accountRef.current) return;
        abrirOG(url, { go, back });
        return;
      }
      if (!/genesis/i.test(url)) return;
      if (!accountRef.current) return;
      setDir(1);
      setStack([{ r: 'home' }, { r: 'kyc' }]);
    };
    // Con la app CERRADA, el enlace llega antes de que la sesion termine de
    // cargar: `accountRef.current` todavia es null y el pago se descartaba en
    // silencio — habia que rehacerlo entero. Ahora el enlace se guarda y se
    // atiende en cuanto hay cuenta.
    handleRef.current = handle;

    const conSesion = async (url) => {
      if (!url) return;
      if (accountRef.current) return handle(url);
      pendienteRef.current = url;
    };

    const sub = Linking.addEventListener('url', (e) => conSesion(e.url));
    Linking.getInitialURL().then(conSesion).catch(() => {});
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cuando la sesion queda lista, se atiende el enlace que habia quedado
  // esperando. Sin esto, abrir un cobro con la wallet cerrada no hacia nada.
  useEffect(() => {
    if (!account) return;
    const url = pendienteRef.current;
    if (!url || !handleRef.current) return;
    pendienteRef.current = null;
    handleRef.current(url);
  }, [account]);

  const [seccion, setSeccion] = useState('og');
  const go = useCallback((r, params) => {
    if (TAB_ROUTES.includes(r)) { setDir(1); setStack([{ r, params }]); }
    else { setDir(1); setStack((s) => [...s, { r, params }]); }
  }, []);
  const back = useCallback(() => { setDir(-1); setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)); }, []);

  // La barra de pestañas se DERIVA de la ruta visible, no de por dónde se
  // navegó: antes `seccion` solo cambiaba dentro de go(), así que back(), el
  // botón atrás de Android, el swipe de regreso y el toque de una
  // notificación (todos hacen setStack directo) dejaban la barra de otra
  // sección bajo la pantalla nueva — chat con la barra de la billetera,
  // Home con las pestañas de Pay. Las pantallas compartidas (scan, ayuda,
  // contactos…) no están en SECCION_DE y conservan la última sección, que es
  // exactamente lo que hacía go() con ellas.
  useEffect(() => {
    const s = SECCION_DE[cur.r];
    if (s) setSeccion(s);
  }, [cur.r]);

  // ---- transición direccional con DOS capas ----
  // Durante los 380ms se pintan la pantalla SALIENTE y la ENTRANTE y se
  // animan las dos: entrar a una app SUBE con un leve zoom; volver BAJA.
  // Antes había una sola capa: la saliente desaparecía de golpe, la entrante
  // nacía en opacity 0 y en cada navegación destellaba el fondo de marca.
  const [saliente, setSaliente] = useState(null);
  const prevCur = useRef(cur);
  // Llave estable POR ENTRADA del stack: cuando la pantalla actual pasa a
  // saliente, React la reconoce por su llave y conserva la instancia — se va
  // animando CON su estado (scroll, inputs) puesto, no como una copia vacía.
  const llaves = useRef({ mapa: new WeakMap(), seq: 0 }).current;
  const llaveDe = (e) => {
    let k = llaves.mapa.get(e);
    if (!k) { k = `pantalla-${++llaves.seq}`; llaves.mapa.set(e, k); }
    return k;
  };
  useEffect(() => {
    if (prevCur.current === cur) return; // primer render: nada que animar
    const anterior = prevCur.current;
    prevCur.current = cur;
    setSaliente(anterior);
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setSaliente(null); // la capa saliente se retira al terminar
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);

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
  // El swipe navega DENTRO de la sección visible y frena en sus extremos:
  // la lista global (TAB_ROUTES) mezclaba las tres apps y desde Actividad un
  // swipe más te soltaba en el Inicio de MyTokenPay sin aviso. El regreso con
  // setStack directo ya no desincroniza la barra: la sección se deriva de la
  // ruta visible (ver arriba).
  const seccionRef = useRef('og');
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
      onPanResponderRelease: (_, g) => {
        const tabs = (SECCION_TABS[seccionRef.current] || SECCION_TABS.og).map((t) => t.r);
        const i = tabs.indexOf(stackRef.current[stackRef.current.length - 1].r);
        if (i < 0) return;
        if (g.dx < -55 && i < tabs.length - 1) go(tabs[i + 1]);
        else if (g.dx > 55 && i > 0) { setDir(-1); setStack([{ r: tabs[i - 1] }]); }
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
          // El sonido de la casa: dinero entrando se OYE, no solo se lee.
          reproducir('recibido');
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

  // ---- avisos de mensajes de AURO CHAT ----
  // El vigía (src/og/vigiaChat.js) sondea las conversaciones del relevo y
  // avisa de los sinLeer nuevos. Qué hacer con ellos se decide AQUÍ, porque
  // solo la raíz sabe qué pantalla está a la vista:
  //   app en segundo plano → notificación local que abre el hilo al tocarla;
  //   app al frente, fuera del chat → toast + el sonido suave;
  //   app al frente, EN el chat → nada: AuroChat ya pinta y suena lo suyo.
  //
  // EN EXPO GO la primera rama no hace nada, y conviene tenerlo claro:
  // notificarMensaje() devuelve false porque allí expo-notifications no se
  // puede cargar (ver la cabecera de notify.js), así que en segundo plano no
  // suena nada — tampoco siendo una notificación LOCAL. No se pierde el
  // mensaje: el vigía no lo borra de ningún sitio y sigue contando como sin
  // leer en la lista de AURO CHAT, o sea que aparece al abrir la app. No se
  // disimula tampoco: los ajustes del chat (AjustesAuro) y los de la app
  // (set.notifsGo) lo dicen con todas sus letras en la vista previa.
  useEffect(() => {
    if (!account?.email) return undefined;
    const parar = vigilarMensajes({
      account,
      lang,
      alNuevo: (avisos, estado) => {
        if (!avisos.length) return;
        if (estado === 'active') {
          const visible = stackRef.current[stackRef.current.length - 1]?.r;
          if (visible === 'chat') return;
          const a = avisos[avisos.length - 1];
          showToast(`AURO CHAT · ${a.quien}: ${a.texto}`, 'info');
          reproducir('recibido', { suave: true });
        } else {
          for (const a of avisos) notificarMensaje(a);
        }
      },
    });
    return parar;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.email, lang]);

  // Tocar una notificación abre su pantalla: la de dinero lleva a Actividad;
  // la de chat trae `con` y abre el hilo exacto. Se pasa por go() y no por
  // setStack directo para que la barra de pestañas cambie de sección junto
  // con la pantalla (antes quedaba la barra de la billetera bajo el chat).
  useEffect(() => alTocarNotificacion((pantalla, data) => {
    if (!accountRef.current) return;
    if (pantalla === 'chat') go('chat', data?.con ? { con: data.con } : undefined);
    else go(pantalla || 'activity');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  useEffect(() => { cargarNombre(); }, []);

  // Pantalla completa: se esconde la barra de navegación de Android y se deja
  // que vuelva al deslizar. Va aquí, al montar la raíz, y no en cada pantalla,
  // porque es un ajuste de la VENTANA y no de ninguna vista en concreto.
  // `vigilarInmersivo` la vuelve a esconder al regresar del segundo plano:
  // Android la saca por su cuenta cada vez que se mira una notificación.
  // Si el módulo nativo no está en el binario instalado, las dos funciones no
  // hacen nada y la app arranca igual (ver src/og/Inmersivo.js).
  useEffect(() => {
    activarInmersivo();
    return vigilarInmersivo();
  }, []);

  const Screen = SCREENS[cur.r] || Home;
  const SalientePantalla = saliente ? (SCREENS[saliente.r] || Home) : null;
  const TABS = SECCION_TABS[seccion] || SECCION_TABS.og;
  seccionRef.current = seccion; // para el swipe entre pestañas, sin re-crear el PanResponder
  const showTabs = TAB_ROUTES.includes(cur.r);
  const isFull = FULLSCREEN.includes(cur.r);

  // La coreografía direccional. ENTRAR (dir 1): la nueva sube desde abajo con
  // un leve zoom mientras la vieja se aparta hacia arriba, apenas crecida.
  // VOLVER (dir -1): todo el movimiento es hacia abajo — la que se va cae y
  // se encoge un pelo, la que regresa asienta bajando desde arriba.
  const entraY = anim.interpolate({ inputRange: [0, 1], outputRange: [dir > 0 ? 36 : -24, 0] });
  const entraEscala = anim.interpolate({ inputRange: [0, 1], outputRange: [dir > 0 ? 0.965 : 1.02, 1] });
  const saleY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, dir > 0 ? -28 : 64] });
  const saleEscala = anim.interpolate({ inputRange: [0, 1], outputRange: [1, dir > 0 ? 1.02 : 0.97] });
  const saleOp = anim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 0, 0] });

  const navApi = { go, back, route: cur.r };
  const content = (
    <View style={{ flex: 1 }} {...(showTabs ? pan.panHandlers : !isFull ? backPan.panHandlers : {})}>
      <Nav.Provider value={navApi}>
        <AccountCtx.Provider value={acctApi}>
          <ToastCtx.Provider value={showToast}>
            {/* la capa saliente vive solo los 380ms de la transición y no
                recibe toques; su llave estable hace que React la conserve
                con su estado puesto mientras se despide */}
            {saliente && SalientePantalla && (
              <Animated.View
                key={llaveDe(saliente)}
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { opacity: saleOp, transform: [{ translateY: saleY }, { scale: saleEscala }] }]}>
                <SalientePantalla nav={navApi} params={saliente.params || {}} />
              </Animated.View>
            )}
            <Animated.View
              key={llaveDe(cur)}
              style={{ flex: 1, opacity: anim, transform: [{ translateY: entraY }, { scale: entraEscala }] }}>
              <Screen nav={navApi} params={cur.params || {}} />
            </Animated.View>
          </ToastCtx.Provider>
        </AccountCtx.Provider>
      </Nav.Provider>
    </View>
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
          {/* El margen de ABAJO solo lo ponia la barra de pestañas. Las
              pantallas que no la llevan —Enviar, Recibir, la ficha de un
              token— quedaban sin nada, y en Android su ultimo boton se metia
              debajo de los tres botones del sistema: se veia a medias y no se
              podia pulsar. Cuando no hay pestañas, el margen lo pone esto.

              El SUELO de 12 es nuevo y es por el modo inmersivo: con la barra
              de navegacion escondida `insets.bottom` se va a 0, y sin este
              minimo el ultimo boton quedaba pegado al filo del cristal —en
              las pantallas curvas se deforma y cuesta acertarle—. Sigue
              mandando `insets.bottom` cuando la barra esta a la vista, asi
              que nada se tapa en los telefonos donde el modulo no exista. */}
          <View style={{ flex: 1, paddingBottom: showTabs ? 0 : Math.max(insets.bottom, 12) }}>
            {content}
          </View>
          {/* La barra de navegacion de Android —los tres botones, o la raya de
              gestos— tapaba el menu: `SafeAreaView` no la contempla en Android.
              `insets.bottom` da su altura real en cada telefono. */}
          {!isFull && <FlotanteOG nav={{ go, back, route: cur.r }} />}
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

      {/* EL TIMBRE, POR ENCIMA DE TODO Y FUERA DE LAS PESTAÑAS.
          Una llamada entrante no es una pantalla más del chat: tapa lo que
          estuvieras haciendo, igual que en cualquier teléfono. Y vive acá
          porque el buzón de señales tiene que estar abierto mires lo que
          mires — con él dentro del chat, una llamada que llegaba mientras
          alguien miraba su billetera se perdía sin sonar.
          Va casi de últimas a propósito: el último hermano pinta encima, y
          una llamada no puede depender de que el zIndex gane la discusión. */}
      {account?.email ? <Timbre correo={account.email} toast={showToast} /> : null}

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

      {/* El candado SOLO con sesión y nunca encima del splash: antes se
          montaba opaco sobre la animación de arranque —la primera impresión
          era una petición de huella con el splash invisible debajo— y hasta
          en un teléfono recién instalado, sin cuenta que proteger. */}
      {locked && account && cur.r !== 'splash' && (
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
