// app/_layout.tsx
import React, { useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Orbitron_700Bold, Orbitron_800ExtraBold, Orbitron_900Black } from '@expo-google-fonts/orbitron';
import {
  JetBrainsMono_400Regular, JetBrainsMono_500Medium, JetBrainsMono_600SemiBold, JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import { ShareTechMono_400Regular } from '@expo-google-fonts/share-tech-mono';
import { useStore } from '@/store/useStore';
import { MarketEngine } from '@/utils/matchEngine';
import { startRealEngineLazy } from '@/utils/realMatchEngine';
import { refreshLeagueFixtures } from '@/utils/leagueFixtures';
import { startCloudSync } from '@/utils/cloudSync';
import { preloadGoalSound } from '@/utils/sound';
import { startGoalAlerts } from '@/utils/goalAlerts';
import { startAppMusic } from '@/utils/music';
import { colors, getPalette } from '@/theme/tokens';
import { Scanlines } from '@/components/Scanlines';
import { BusyBall } from '@/components/BusyBall';
import { BiometricGate } from '@/components/BiometricGate';
import { GoalAlert } from '@/components/GoalAlert';
import { BrandIntro } from '@/components/BrandIntro';
import { CrashBoundary } from '@/components/CrashBoundary';
import { CrashScreen } from '@/components/CrashScreen';
import { StartupDiagBanner } from '@/components/StartupDiagBanner';
import { installCrashCatcher, onCrash } from '@/utils/crashCatcher';
import {
  initStartupDiag, checkpoint, completeStartup, previousStartupFailure, isStepDisabled, disabledSteps,
} from '@/utils/startupCheckpoint';
import '@/theme/globalFont';

// TEMPORAL — herramientas de diagnóstico para un crash en producción, ver
// utils/crashCatcher.ts y utils/startupCheckpoint.ts. Se instalan apenas se
// evalúa este módulo (lo antes posible) para atrapar/ubicar también errores
// que ocurren antes del primer render.
installCrashCatcher();
initStartupDiag();
// Si el arranque anterior murió (crash nativo), aquí queda en qué paso — se
// muestra en el intro de esta corrida aunque esta también falle.
const PREV_STARTUP_FAILURE = previousStartupFailure();
const DISABLED_STEPS = disabledSteps();

SplashScreen.preventAutoHideAsync().catch(() => {});

// intro silenciosa: logo + slogan, con tiempo suficiente para leerse bien.
// La música arranca ya dentro de la app, no en la intro.
const MIN_LOADING_MS = 4600;

function useFlowGate(ready: boolean) {
  const router = useRouter();
  const segments = useSegments();
  const registered = useStore((s) => s.registered);
  const onboarded = useStore((s) => s.onboarded);
  const riskAccepted = useStore((s) => s.riskAccepted);

  useEffect(() => {
    // ready implica que el Stack ya está montado; navegar antes de eso
    // hace que expo-router crashee con "navigate before mounting the Root Layout".
    if (!ready) return;
    const first = segments[0] as string | undefined;

    // Nota: al reabrir la app en frío, expo-router puede aterrizar en la ruta
    // raíz sin segmentos (first === undefined) — es una "Unmatched Route" que
    // hay que redirigir igual que cualquier otra, o el usuario queda atascado
    // ahí (sitemap) sin que ninguna rama de abajo la contemple.
    if (!registered) {
      // "login" también es válido aquí: una cuenta respaldada en la nube pero
      // sin datos locales (dispositivo nuevo, o después de cerrar sesión) pasa
      // por ahí en vez de por el registro.
      if (first !== 'register' && first !== 'login') router.replace('/register');
      return;
    }
    if (!onboarded) {
      if (first !== 'onboarding') router.replace('/onboarding');
      return;
    }
    if (!riskAccepted) {
      if (first !== 'risk') router.replace('/risk');
      return;
    }
    const mainAppRoutes = ['(tabs)', 'team', 'match', 'trade', 'profile', 'leaderboard'];
    if (!first || !mainAppRoutes.includes(first)) {
      router.replace('/(tabs)/dashboard');
    }
  }, [ready, registered, onboarded, riskAccepted, segments]);
}

export default function RootLayout() {
  const hydrated = useStore((s) => s.hydrated);
  const engine = useRef<MarketEngine | null>(null);
  const [minElapsed, setMinElapsed] = useState(false);
  const [crashMsg, setCrashMsg] = useState<string | null>(null);
  useEffect(() => { onCrash(setCrashMsg); }, []);
  const [fontsLoaded] = useFonts({
    Orbitron_700Bold, Orbitron_800ExtraBold, Orbitron_900Black,
    JetBrainsMono_400Regular, JetBrainsMono_500Medium, JetBrainsMono_600SemiBold, JetBrainsMono_700Bold,
    ShareTechMono_400Regular,
  });
  const ready = hydrated && minElapsed && fontsLoaded;

  useFlowGate(ready);

  useEffect(() => {
    // el splash nativo se oculta apenas el JS está listo; de ahí en adelante
    // controlamos nosotros la pantalla de carga (con la marca) por un tiempo mínimo.
    SplashScreen.hideAsync().catch(() => {});
    const t = setTimeout(() => setMinElapsed(true), MIN_LOADING_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    // Núcleo del mercado: JS puro + timers, sin módulos nativos pesados. Se
    // hace de inmediato para que las pantallas tengan datos que mostrar.
    checkpoint('loadMarket');
    useStore.getState().loadMarket();

    checkpoint('marketEngine');
    engine.current = new MarketEngine({
      getTeams: () => useStore.getState().teams,
      applyMoves: (moves, pushCandle) => useStore.getState().applyMoves(moves, pushCandle),
      onMatchUpdate: (m) => useStore.getState().setMatch(m),
      onNews: (n) => useStore.getState().pushNews(n),
    });
    engine.current.start();
    cleanups.push(() => engine.current?.stop());

    // Todo lo que toca módulos NATIVOS pesados (audio, red, Firebase) se
    // difiere hasta DESPUÉS de que la navegación y la animación de entrada
    // terminan, y se escalona en pasos separados. Antes se disparaba todo de
    // golpe en el mismo instante en que el intro daba paso a la app —
    // justamente donde la app se cerraba sola— así que separarlos evita esa
    // colisión. Cada paso deja su "checkpoint" en disco (utils/startupCheckpoint)
    // para poder ubicar un crash nativo si volviera a ocurrir.
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const step = (delay: number, name: string, fn: () => void) => {
      // Auto-aislamiento: si este paso mató un arranque anterior, se SALTA para
      // que la app abra igual (esa función secundaria queda apagada) en vez de
      // volver a cerrarse. Ver utils/startupCheckpoint.
      if (isStepDisabled(name)) { console.warn('[startup] paso desactivado por crash previo:', name); return; }
      timers.push(setTimeout(() => {
        if (cancelled) return;
        checkpoint(name);
        try { fn(); } catch (err) { console.warn('[startup]', name, err); }
      }, delay));
    };
    cleanups.push(() => timers.forEach(clearTimeout));

    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;

      // NOTA: el motor de partidos reales (api-football.com) y la descarga del
      // calendario real YA NO se arrancan aquí. Hacían llamadas de red durante
      // el arranque que, en ciertos dispositivos, cerraban la app de golpe
      // (crash nativo). Ahora se activan de forma perezosa la primera vez que
      // el usuario entra a la pestaña de partidos
      // (startRealEngineLazy / refreshRealData en esas pantallas), así el
      // arranque queda limpio en todos los teléfonos.

      // motor de partidos REALES (api-football): arranca ya desde el inicio de
      // la app (diferido, no en el arranque crítico) para que un partido en
      // vivo se detecte de una, sin esperar a abrir la pestaña Real. Es
      // idempotente (también se dispara al entrar a la pestaña de partidos). Si en algún
      // dispositivo llegara a crashear, el auto-aislamiento desactiva este paso.
      step(300, 'realEngine', () => { startRealEngineLazy(); });

      // cartelera real de las 4 ligas (4 llamadas, cacheada 30 min): que el
      // inicio tenga partidos que mostrar sin esperar a que se abra la pestaña.
      step(900, 'leagueFixtures', () => { refreshLeagueFixtures(); });

      // respaldo en la nube (Firebase): no hace nada si no está configurado.
      step(500, 'cloudSync', () => {
        const stop = startCloudSync();
        cleanups.push(stop);
      });

      // precarga del sonido de gol (expo-av): módulo nativo de audio.
      step(1400, 'goalSound', () => { preloadGoalSound(); });

      // alertas de gol: sonido + aviso en pantalla + notificación de sistema.
      step(1700, 'goalAlerts', () => {
        const stop = startGoalAlerts();
        cleanups.push(stop);
      });

      // arranque completado sin crashear.
      step(2000, 'complete', () => { completeStartup(); });
    });

    return () => {
      cancelled = true;
      // @ts-ignore — cancel existe en el handle de InteractionManager
      task?.cancel?.();
      cleanups.forEach((c) => { try { c(); } catch { /* no-op */ } });
    };
  }, [ready]);

  // pista de fondo: arranca SOLO cuando el usuario ya está dentro de la app
  // (registro/onboarding/aviso de riesgo aceptados) — nunca en la intro ni en
  // las pantallas de alta. Así la música "aparece" recién en el dashboard.
  const riskAccepted = useStore((s) => s.riskAccepted);
  useEffect(() => {
    if (!ready || !riskAccepted) return;
    if (isStepDisabled('music')) return; // desactivada por crash previo
    // la música (expo-av, track2.mp3) es otro punto nativo — la difiere un
    // poco y deja checkpoint para poder ubicarla si crasheara.
    let stopMusic: (() => void) | null = null;
    const t = setTimeout(() => {
      checkpoint('music');
      try { stopMusic = startAppMusic(); } catch (err) { console.warn('[startup] music', err); }
    }, 500);
    return () => { clearTimeout(t); stopMusic?.(); };
  }, [ready, riskAccepted]);

  // tema e idioma activos: cambiarlos remonta la app (key de abajo)
  const themeKey = useStore((s) => s.themeKey);
  const language = useStore((s) => s.language);
  const palette = getPalette();

  if (crashMsg) {
    return <CrashScreen message={crashMsg} />;
  }

  if (!ready) {
    return (
      <CrashBoundary>
        <BrandIntro />
        <Scanlines />
        <StartupDiagBanner failure={PREV_STARTUP_FAILURE} disabled={DISABLED_STEPS} />
      </CrashBoundary>
    );
  }

  return (
    <CrashBoundary>
      {/* key por tema+idioma: al cambiar cualquiera de los dos, toda la app se
      remonta y cada pantalla se re-renderiza con la paleta y textos nuevos. */}
      <GestureHandlerRootView key={`${themeKey}-${language}`} style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style={palette.dark ? 'light' : 'dark'} />
          <BiometricGate>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'fade_from_bottom',
              animationDuration: 260,
            }}
          >
            <Stack.Screen name="register" options={{ animation: 'fade' }} />
            <Stack.Screen name="login" options={{ animation: 'fade' }} />
            <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
            <Stack.Screen name="risk" options={{ animation: 'fade' }} />
            <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
            <Stack.Screen name="team/[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="match/[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="trade/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="leaderboard" options={{ animation: 'slide_from_right' }} />
          </Stack>
          <Scanlines />
          <BusyBall />
          <GoalAlert />
          </BiometricGate>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </CrashBoundary>
  );
}
