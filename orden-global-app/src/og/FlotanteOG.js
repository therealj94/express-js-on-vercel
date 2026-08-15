// NEXUS, el asistente flotante de Orden Global. Reemplaza a la barra fija
// (BarraOG): un núcleo dorado SIEMPRE visible, que se arrastra y se imanta al
// borde --como la burbuja de un chat--, y al tocarlo sube una hoja con los
// estados que pidió José, para que nunca haya duda de en qué punto está:
//   PERMISO    → se pide el micrófono; si lo niegan se DICE y queda la caja
//                de texto como camino real (la pantalla nunca queda muerta);
//   ESCUCHANDO → escucha DE VERDAD (expo-speech-recognition), con la onda de
//                cinco barras latiendo y lo que va oyendo escrito en gris:
//                así se ve que el micrófono está abierto, no se promete;
//   ENTENDÍ    → la frase oída y la dirección og:// a la que resuelve; si
//                toca dinero se detiene aquí y pide SÍ ABRE / NO;
//   EJECUTANDO → un giro breve mientras se navega;
//   HECHO      → palomita + qué se hizo, y la hoja se recoge sola.
// La voz (decir) acompaña las transiciones, pero NUNCA mientras el micrófono
// está abierto: un asistente que se oye a sí mismo se dicta sus propias
// órdenes. Por eso al abrir con micrófono no hay saludo hablado — se escucha
// de inmediato, que es lo que la persona espera al tocar.
// Las reglas de la casa siguen intactas: todo pasa por el MAPA de rutas, y lo
// que toca dinero solo se PREPARA — la persona firma.
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, Animated, StyleSheet, Modal, Easing,
  Dimensions, PanResponder, ActivityIndicator, KeyboardAvoidingView, Platform,
  Keyboard,
} from 'react-native';
import { COMPORTAMIENTO } from './Teclado';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from '../theme';
import { useLang } from '../i18n';
import { hap } from '../ui';
import { traducir, EJEMPLOS } from '../intencion';
import { enExpoGo } from './entorno';
import { aUri, MAPA, abrir } from './rutas';
import { decir, callar } from '../voz';
import { nombreAsistente, suscribirNombre } from './asistente';
import * as M from './mensajes';

// REGLA DEL AIRE: expo-speech-recognition es un módulo NATIVO y este
// componente se monta en TODA la app (App.js). Un APK viejo que reciba el
// bundle por OTA no lleva ese nativo en el binario: el import estático
// reventaba el arranque entero. Require defensivo; sin módulo el asistente
// esconde el micrófono y vive de la caja de texto, que el flujo ya soporta.
// El hook de eventos cae a un no-op ESTABLE (misma función siempre): el
// módulo o está o no está desde el arranque, así que el orden de hooks de
// React no cambia nunca entre renders.
let ExpoSpeechRecognitionModule = null;
let useSpeechRecognitionEvent = () => {};
try {
  const vozNativa = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = vozNativa.ExpoSpeechRecognitionModule || null;
  if (vozNativa.useSpeechRecognitionEvent) useSpeechRecognitionEvent = vozNativa.useSpeechRecognitionEvent;
} catch (e) {
  ExpoSpeechRecognitionModule = null;
}
const HAY_VOZ = !!ExpoSpeechRecognitionModule;

// Sin oídos hay dos motivos distintos y la persona merece saber cuál es el
// suyo: en la VISTA PREVIA (Expo Go) el micrófono no está porque ese binario
// no lleva módulos de terceros —se dice, y se dice que con la app instalada
// sí escucha—; en un APK viejo que recibió esto por aire no se explica nada,
// que es el comportamiento de siempre y no hay nada útil que contar ahí.
// Se resuelve una vez al cargar el módulo: ni el entorno ni el nativo cambian
// mientras la app vive.
const VISTA_PREVIA = enExpoGo();

const TXT = {
  es: {
    // dos fases más y ninguna miente: sin micrófono el kicker dice ESCRIBE
    // (no «escuchando» sobre un micrófono negado) y cuando NO se entendió
    // dice NO ENTENDÍ (no «entendí» sobre un «eso no lo puedo hacer»)
    k: { permiso: 'PERMISO', escucha: 'ESCUCHANDO', escribe: 'ESCRIBE', entendi: 'ENTENDÍ', noEntendi: 'NO ENTENDÍ', ejecuta: 'EJECUTANDO', hecho: 'HECHO' },
    pidiendo: 'Te pido el micrófono…',
    pidiendoSub: 'Sin él no te puedo oír. Escribir siempre es una opción.',
    dime: 'Dime…',
    dimeSub: 'Habla, te estoy oyendo. También puedes escribir.',
    dimeSubMudo: 'Escríbeme aquí lo que quieres hacer.',
    // La línea de la vista previa. Una sola, en gris, sin alarma: aquí no ha
    // fallado nada ni hay nada que arreglar — es que este envoltorio no trae
    // micrófono. Lleva el nombre del asistente porque es suyo y se puede
    // cambiar en Ajustes: «NEXUS te escucha» tiene que seguir siendo verdad
    // aunque se llame de otra forma.
    previa: (n) => `En la vista previa se escribe; con la app instalada, ${n} te escucha.`,
    sinMicTit: 'No me diste el micrófono',
    sinMic: 'Sin permiso de micrófono no puedo oírte. Puedes dármelo en los ajustes del teléfono. Mientras tanto escríbeme aquí abajo: te obedezco igual.',
    sinMicVoz: 'No tengo permiso del micrófono. Escríbeme y te obedezco igual.',
    noOi: 'No te oí nada. Toca escuchar otra vez, o escríbeme.',
    falloVoz: 'El micrófono falló. Escríbeme aquí abajo mientras tanto.',
    otraVoz: '🎤 ESCUCHAR OTRA VEZ',
    ph: '«envía 15 a Juan» · «hazme un reporte»',
    entendiVoz: 'Entendido.',
    si: 'SÍ, ABRE', no: 'NO', otra: 'INTENTAR DE NUEVO',
    fuera: 'Eso no lo puedo hacer. Puedo abrir tus apps, preparar envíos, cobrar y enseñarte tus cosas.',
    // lo hablado va en UNA frase corta; el texto largo se queda en pantalla
    fueraVoz: 'Eso no lo puedo hacer.',
    sinContacto: 'No encuentro a esa persona en tu chat. Búscala primero o escanea su código.',
    sinContactoVoz: 'No encuentro a esa persona en tu chat.',
    sinMonto: 'No entendí el monto. Dímelo con número: envía 15 a Juan.',
    ayuda: 'Pídeme cosas así:',
    ayudaVoz: 'Mira, esto me puedes pedir.',
    confirma: (m, q) => `Preparar envío de ${m} ORIGEN a ${q}`,
    confirmaSwap: (m) => (m ? `Preparar un cambio de ${m} en tu billetera` : 'Preparar un cambio en tu billetera'),
    burbujaA11y: (n) => `${n}, tu asistente. Toca para hablarle o escribirle.`,
    hizoNegocio: (x) => `Te llevo a los comercios de ${x}.`,
    hizo: {
      'inicio': 'Volvimos al inicio.',
      'wallet/abrir': 'Abrí tu billetera.',
      'wallet/enviar': 'Te dejé el envío preparado. La firma es tuya.',
      'wallet/recibir': 'Abrí tu código para recibir.',
      'wallet/tarjeta': 'Abrí tu tarjeta.',
      'wallet/actividad': 'Abrí tu actividad.',
      'wallet/reporte': 'Aquí está el reporte de tu billetera.',
      'pay/abrir': 'Abrí MyTokenPay.',
      'pay/cobrar': 'Abrí el cobro con QR.',
      'pay/explorar': 'Te llevo a los comercios.',
      'wallet/swap': 'Te dejé el cambio preparado. La firma es tuya.',
      'id/abrir': 'Abrí tu Genesis ID.',
      'chat/abrir': 'Abrí el chat.',
      'asistente/abrir': 'Aquí estoy.',
      'ajustes': 'Abrí los ajustes.',
    },
    hizoDef: 'Hecho.',
  },
  en: {
    k: { permiso: 'PERMISSION', escucha: 'LISTENING', escribe: 'TYPE IT', entendi: 'GOT IT', noEntendi: 'DID NOT GET IT', ejecuta: 'WORKING', hecho: 'DONE' },
    pidiendo: 'Asking for the microphone…',
    pidiendoSub: 'Without it I cannot hear you. Typing is always an option.',
    dime: 'Tell me…',
    dimeSub: 'Speak, I am listening. You can also type.',
    dimeSubMudo: 'Type here what you want to do.',
    previa: (n) => `In preview you type; with the app installed, ${n} listens.`,
    sinMicTit: 'You did not give me the microphone',
    sinMic: 'Without microphone permission I cannot hear you. You can grant it in your phone settings. Meanwhile type below: I obey just the same.',
    sinMicVoz: 'I do not have microphone permission. Type and I obey just the same.',
    noOi: 'I heard nothing. Tap listen again, or type to me.',
    falloVoz: 'The microphone failed. Type below in the meantime.',
    otraVoz: '🎤 LISTEN AGAIN',
    ph: '“send 15 to Juan” · “wallet report”',
    entendiVoz: 'Got it.',
    si: 'YES, OPEN', no: 'NO', otra: 'TRY AGAIN',
    fuera: 'I cannot do that. I can open your apps, prepare sends, charge, and show you your things.',
    fueraVoz: 'I cannot do that.',
    sinContacto: 'I cannot find that person in your chat. Search them first or scan their code.',
    sinContactoVoz: 'I cannot find that person in your chat.',
    sinMonto: 'I did not catch the amount. Say it with a number: send 15 to Juan.',
    ayuda: 'Ask me things like:',
    ayudaVoz: 'Here is what you can ask me.',
    confirma: (m, q) => `Prepare sending ${m} ORIGEN to ${q}`,
    confirmaSwap: (m) => (m ? `Prepare a swap of ${m} in your wallet` : 'Prepare a swap in your wallet'),
    burbujaA11y: (n) => `${n}, your assistant. Tap to talk or type.`,
    hizoNegocio: (x) => `Taking you to the ${x} places.`,
    hizo: {
      'inicio': 'Back to the start.',
      'wallet/abrir': 'I opened your wallet.',
      'wallet/enviar': 'The send is prepared. You sign it.',
      'wallet/recibir': 'I opened your receiving code.',
      'wallet/tarjeta': 'I opened your card.',
      'wallet/actividad': 'I opened your activity.',
      'wallet/reporte': 'Here is your wallet report.',
      'pay/abrir': 'I opened MyTokenPay.',
      'pay/cobrar': 'I opened the QR charge.',
      'pay/explorar': 'Taking you to the merchants.',
      'wallet/swap': 'The swap is prepared. You sign it.',
      'id/abrir': 'I opened your Genesis ID.',
      'chat/abrir': 'I opened the chat.',
      'asistente/abrir': 'Here I am.',
      'ajustes': 'I opened settings.',
    },
    hizoDef: 'Done.',
  },
};

const TAM = 56;          // diámetro de la burbuja
const MARGEN = 10;       // aire respecto al borde al imantarse

// ══ EL NÚCLEO ════════════════════════════════════════════════════════════
// El icono del asistente: un núcleo con DOS anillos orbitando en planos
// distintos. El truco de la perspectiva es barato y convence: cada anillo se
// aplasta en Y (scaleY) y luego se hace girar (rotate) — como el orden de
// transformaciones en RN es de derecha a izquierda, la elipse ya aplastada es
// la que rota, y se lee como un aro visto en 3D. Los anillos van en sentidos
// opuestos y a ritmos distintos: si fueran iguales se leerían como un solo
// aro grueso. Cada uno lleva un satélite con el scaleY INVERSO, para que el
// punto salga redondo aunque su padre esté aplastado.
// Gira siempre, despacio: un asistente vivo se nota también cuando calla.
function NucleoAsistente({ tam = TAM, inicial, latiendo }) {
  const giro1 = useRef(new Animated.Value(0)).current;
  const giro2 = useRef(new Animated.Value(0)).current;
  const pulso = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.loop(Animated.timing(giro1, { toValue: 1, duration: 6200, easing: Easing.linear, useNativeDriver: true }));
    const b = Animated.loop(Animated.timing(giro2, { toValue: 1, duration: 9400, easing: Easing.linear, useNativeDriver: true }));
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [giro1, giro2]);

  // el pulso solo cuando escucha: es la señal de que el micrófono está abierto
  useEffect(() => {
    if (!latiendo) { pulso.setValue(0); return undefined; }
    const l = Animated.loop(
      Animated.timing(pulso, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    l.start();
    return () => l.stop();
  }, [latiendo, pulso]);

  const nuc = Math.round(tam * 0.56);
  const d2 = Math.round(tam * 0.82);
  const APL1 = 0.30;   // qué tan de canto se ve cada anillo
  const APL2 = 0.52;
  const sat = Math.max(3, Math.round(tam * 0.075));

  const aro = (d, apl, giro, sentido, color, grosor) => (
    <Animated.View
      style={[st.aro, {
        width: d, height: d, borderRadius: d / 2, left: (tam - d) / 2, top: (tam - d) / 2,
        borderColor: color, borderWidth: grosor,
        transform: [
          { rotate: giro.interpolate({ inputRange: [0, 1], outputRange: sentido > 0 ? ['0deg', '360deg'] : ['360deg', '0deg'] }) },
          { scaleY: apl },
        ],
      }]}>
      <View style={[st.satelite, {
        width: sat, height: sat, borderRadius: sat / 2, left: d / 2 - sat / 2, top: -sat / 2,
        transform: [{ scaleY: 1 / apl }],
      }]} />
    </Animated.View>
  );

  return (
    <View style={{ width: tam, height: tam, alignItems: 'center', justifyContent: 'center' }}>
      {latiendo && (
        <Animated.View style={[st.halo, {
          width: tam, height: tam, borderRadius: tam / 2,
          opacity: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
          transform: [{ scale: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.9, 2] }) }],
        }]} />
      )}
      {aro(tam, APL1, giro1, 1, 'rgba(234,215,156,0.55)', 1.4)}
      {aro(d2, APL2, giro2, -1, 'rgba(201,169,97,0.42)', 1.1)}
      <LinearGradient
        colors={G.gold} style={[st.nucleo, { width: nuc, height: nuc, borderRadius: nuc / 2 }]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={[st.nucleoTxt, { fontSize: Math.round(nuc * 0.52) }]}>{inicial}</Text>
      </LinearGradient>
    </View>
  );
}

// ══ LA ONDA ══════════════════════════════════════════════════════════════
// Cinco barras latiendo. Cada una con su propio ritmo y su propio arranque:
// si subieran a la vez se vería un bloque, no una voz. Encima, el volumen
// real del micrófono estira toda la onda (`vol`), que es lo que convierte el
// adorno en prueba: si te callas, la onda se encoge.
function Onda({ activa, vol }) {
  const barras = useRef([0, 1, 2, 3, 4].map((i) => new Animated.Value(0.28 + i * 0.11))).current;

  useEffect(() => {
    if (!activa) {
      // al callar, la onda baja sola: las barras siempre son el MISMO nodo
      // animado, nunca un número suelto, para no mezclar valor nativo y JS
      Animated.parallel(barras.map((v) => (
        Animated.timing(v, { toValue: 0.18, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true })
      ))).start();
      return undefined;
    }
    const lazos = barras.map((v, i) => {
      const dur = 300 + i * 85;   // ritmos distintos = desfase natural, sin relojes
      return Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.22, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]));
    });
    lazos.forEach((l) => l.start());
    return () => lazos.forEach((l) => l.stop());
  }, [activa, barras]);

  return (
    <Animated.View style={[st.onda, { opacity: activa ? 1 : 0.3, transform: [{ scaleY: vol }] }]}>
      {barras.map((v, i) => (
        <Animated.View key={i} style={[st.barra, { transform: [{ scaleY: v }] }]} />
      ))}
    </Animated.View>
  );
}

export default function FlotanteOG({ nav }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const [visible, setVisible] = useState(false);
  // permiso | escucha | escribe | entendi | noEntendi | ejecuta | hecho
  const [fase, setFase] = useState('permiso');
  const [oido, setOido] = useState(null);        // { frase, uri, ruta, aviso, confirma, hecho, etq, ejemplos }
  const [texto, setTexto] = useState('');
  const [libreta, setLibreta] = useState([]);
  const caja = useRef(null);

  // ── el nombre: si la persona lo cambia (o acaba de cargarse de SecureStore)
  //    la inicial del núcleo tiene que seguirlo, no esperar a un render suelto
  const [nombre, setNombre] = useState(nombreAsistente());
  useEffect(() => suscribirNombre(setNombre), []);
  const inicial = (nombre || 'N').trim()[0] || 'N';

  // ── voz de verdad ───────────────────────────────────────────────────────
  const [permiso, setPermiso] = useState(null);  // null pidiendo | 'si' | 'no'
  const [oyendo, setOyendo] = useState(false);   // el micrófono está abierto
  const [parcial, setParcial] = useState('');    // lo que va oyendo, en gris
  const [avisoVoz, setAvisoVoz] = useState('');
  const ultimo = useRef('');        // el último parcial, sin esperar al render
  const atendido = useRef(false);   // una frase se ejecuta UNA vez: 'result' final y 'end' compiten
  const abierta = useRef(false);    // la hoja sigue abierta: un evento tardío no navega solo
  const vol = useRef(new Animated.Value(0.6)).current;
  const ultimoVol = useRef(0);

  // ── relojes con dueño: cada timeout se apunta y al cerrar (o desmontar)
  //    se limpian todos, para que una hoja cerrada no navegue sola después ──
  const relojes = useRef([]);
  const luego = (fn, ms) => { relojes.current.push(setTimeout(fn, ms)); };
  const limpiar = () => { relojes.current.forEach(clearTimeout); relojes.current = []; };

  // el micrófono no se queda abierto ni aunque la app se desmonte de golpe.
  // Al desmontar se para el módulo A SECAS: tocar el estado de un componente
  // que ya no existe no arregla nada y ensucia.
  const detenerModulo = () => { try { if (HAY_VOZ) ExpoSpeechRecognitionModule.stop(); } catch (e) {} };
  const pararVoz = () => { setOyendo(false); detenerModulo(); };
  useEffect(() => () => { limpiar(); detenerModulo(); }, []);

  // la libreta del asistente es la gente real del chat (igual que en la barra)
  useEffect(() => {
    let vivo = true;
    const trae = async () => {
      try {
        const d = await M.conversaciones();
        if (vivo) setLibreta((d.conversaciones || []).map((c) => ({ nombre: c.nombre, correo: c.correo, addr: c.addr })));
      } catch {}
    };
    trae();
    const r = setInterval(trae, 30000);
    return () => { vivo = false; clearInterval(r); };
  }, []);

  // ══ la burbuja: arrastre con PanResponder + imán al borde ══════════════
  // Reparto de papeles: el TOQUE lo atiende un Pressable accesible (role
  // button, con el nombre del asistente — TalkBack/VoiceOver ven la puerta
  // al asistente de voz) y el PanResponder solo reclama el dedo cuando de
  // verdad se arrastra (>6 px). Así el imán jamás recoloca la burbuja por
  // un simple toque. El imán decide borde por el CENTRO de la burbuja.
  const ini = (() => {
    const w = Dimensions.get('window');
    return { x: w.width - TAM - MARGEN, y: w.height * 0.55 };
  })();
  const pos = useRef(new Animated.ValueXY(ini)).current;
  const donde = useRef({ ...ini });               // la posición viva, para soltar
  useEffect(() => {
    const id = pos.addListener((v) => { donde.current = v; });
    return () => pos.removeListener(id);
  }, [pos]);

  // el PanResponder se crea UNA vez: guarda la orden de abrir en un ref para
  // no quedarse con la versión vieja de abrirHoja del primer render
  const abrirRef = useRef(() => {});
  const pan = useRef(PanResponder.create({
    // NO se reclama el dedo al posarse: si el gesto se queda en toque, el
    // responder nunca se activa, el Pressable de dentro dispara su onPress
    // y no hay spring que valga. Solo el movimiento real entra aquí.
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
    onPanResponderGrant: () => {
      pos.setOffset({ x: donde.current.x, y: donde.current.y });
      pos.setValue({ x: 0, y: 0 });
    },
    onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
    onPanResponderRelease: () => {
      pos.flattenOffset();
      const w = Dimensions.get('window');
      // el imán: al borde más cercano, sin salirse ni tapar la zona de tabs.
      // Aquí solo llegan arrastres de verdad, así que el spring nunca
      // recoloca la burbuja por un toque.
      const metaX = donde.current.x + TAM / 2 < w.width / 2 ? MARGEN : w.width - TAM - MARGEN;
      const metaY = Math.min(Math.max(donde.current.y, 60), w.height - TAM - 120);
      Animated.spring(pos, { toValue: { x: metaX, y: metaY }, friction: 6, useNativeDriver: false }).start();
    },
    onPanResponderTerminate: () => { pos.flattenOffset(); },
  })).current;

  // ══ la hoja inferior: Modal + subida animada ═══════════════════════════
  const sube = useRef(new Animated.Value(0)).current;

  const arrancarVoz = () => {
    atendido.current = false;
    ultimo.current = '';
    setParcial(''); setAvisoVoz('');
    vol.setValue(0.6);
    try {
      ExpoSpeechRecognitionModule.start({
        lang: lang === 'en' ? 'en-US' : 'es-MX',
        interimResults: true,   // los parciales son la prueba visible de que oye
        continuous: false,      // una orden por vez: se dice y se ejecuta
      });
      setOyendo(true);
    } catch (e) {
      // sin reconocedor (emulador sin servicio de voz): no se deja la
      // pantalla muerta ni el kicker mintiendo ESCUCHANDO — a ESCRIBE
      setOyendo(false);
      setFase('escribe');
      setAvisoVoz(t.falloVoz);
      luego(() => caja.current?.focus(), 120);
    }
  };

  const pedirYEscuchar = async () => {
    // sin el módulo nativo (APK viejo que recibió esto por aire) no hay
    // micrófono que pedir: directo a ESCRIBE, sin regaño — la persona no
    // negó nada, es el teléfono el que no trae los oídos
    if (!HAY_VOZ) {
      setPermiso('no');
      setFase('escribe');
      luego(() => caja.current?.focus(), 250);
      return;
    }
    let ok = false;
    try {
      const r = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      ok = !!(r && r.granted);
    } catch (e) { ok = false; }
    if (!abierta.current) return;   // se cerró mientras el sistema preguntaba
    setPermiso(ok ? 'si' : 'no');
    // micrófono denegado = fase ESCRIBE: el kicker no puede gritar
    // ESCUCHANDO encima de «no me diste el micrófono»
    setFase(ok ? 'escucha' : 'escribe');
    if (ok) { arrancarVoz(); return; }
    // negado: se dice con todas las letras y se ofrece el otro camino
    setAvisoVoz(t.sinMic);
    decir(t.sinMicVoz, lang);
    luego(() => caja.current?.focus(), 200);
  };

  const abrirHoja = () => {
    hap(); limpiar();
    abierta.current = true;
    setTexto(''); setOido(null); setParcial(''); setAvisoVoz('');
    setPermiso(null); setOyendo(false);
    // Sin módulo de voz la hoja NO pasa por PERMISO: pedir un micrófono que
    // no existe es una promesa de medio segundo —«Te pido el micrófono…» con
    // su ruedita— que enseguida hay que retirar. Se abre directamente en
    // ESCRIBE, que aquí es el único camino de verdad.
    setFase(HAY_VOZ ? 'permiso' : 'escribe');
    setVisible(true);
    sube.setValue(0);
    Animated.timing(sube, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // sin saludo hablado: en cuanto haya permiso se abre el micrófono, y el
    // reconocedor oiría al propio asistente saludando como si fuera la orden
    pedirYEscuchar();
  };
  abrirRef.current = abrirHoja;

  const cerrar = () => {
    abierta.current = false;
    limpiar(); callar(); pararVoz(); Keyboard.dismiss();
    setParcial(''); setAvisoVoz('');
    Animated.timing(sube, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setVisible(false));
  };

  // volver a ESCUCHANDO (tras un NO, un aviso o un «no te oí») — o a
  // ESCRIBE, si nunca hubo micrófono que reabrir
  const otraVez = () => {
    limpiar(); callar();
    setOido(null); setTexto('');
    if (permiso === 'si' && HAY_VOZ) { setFase('escucha'); hap(); arrancarVoz(); return; }
    setFase('escribe');
    luego(() => caja.current?.focus(), 120);
  };

  // ══ el ciclo: frase → traducir → estados ═══════════════════════════════
  const atender = (frase) => {
    const f = String(frase || '').trim();
    if (!f) return;
    atendido.current = true;
    pararVoz();                       // el asistente no puede oírse hablar
    setTexto(''); setParcial(''); setAvisoVoz(''); Keyboard.dismiss(); callar();
    // el traductor conoce el nombre del asistente: «Nexus, envía 15 a Juan»
    // es «envía 15 a Juan»
    const r = traducir(f, libreta, nombre);
    // no entendido = fase NO ENTENDÍ, nunca «entendí» sobre lo contrario;
    // y la voz contesta en UNA frase corta — el detalle queda escrito
    if (!r) { setOido({ frase: f, aviso: t.fuera }); setFase('noEntendi'); decir(t.fueraVoz, lang); return; }
    if (r.falla) {
      const msg = r.falla === 'sinContacto' ? t.sinContacto : t.sinMonto;
      const voz = r.falla === 'sinContacto' ? t.sinContactoVoz : t.sinMonto;
      setOido({ frase: f, aviso: msg }); setFase('noEntendi'); decir(voz, lang); return;
    }
    // «ayuda» se contesta AQUÍ, con los EJEMPLOS en la propia hoja: navegar
    // al tablero para decir «aquí estoy» era responder con una mudanza
    if (r.ruta === 'asistente/ayuda') {
      setOido({ frase: f, ejemplos: (EJEMPLOS[lang] || EJEMPLOS.es).slice(0, 6) });
      setFase('entendi'); decir(t.ayudaVoz, lang);
      return;
    }
    const uri = aUri(r.ruta, r.params);
    // la etiqueta hablada del directorio: «te llevo a los comercios de …»
    const etq = r.negocio ? (r.negocio[lang] || r.negocio.es) : null;
    if (MAPA[r.ruta]?.firma) {
      // dinero: se enseña y se DETIENE — sin un SÍ explícito no se abre nada
      const msg = r.ruta === 'wallet/swap'
        ? t.confirmaSwap(r.params.amount)
        : t.confirma(r.params.amount, r.params.nombre || '');
      setOido({ frase: f, uri, ruta: r.ruta, confirma: msg });
      setFase('entendi'); decir(msg, lang);
      return;
    }
    // sin dinero de por medio: se enseña lo entendido un instante y sigue solo
    setOido({ frase: f, uri, ruta: r.ruta, etq });
    setFase('entendi'); decir(t.entendiVoz, lang);
    luego(() => ejecutar(uri, r.ruta, etq), 900);
  };

  const ejecutar = (uri, ruta, etq) => {
    setFase('ejecuta');
    luego(() => {
      abrir(uri, nav);
      const msg = etq ? t.hizoNegocio(etq) : (t.hizo[ruta] || t.hizoDef);
      setOido((o) => ({ ...(o || {}), hecho: msg }));
      setFase('hecho'); decir(msg, lang);
      luego(cerrar, 1700);
    }, 650);
  };

  // ══ los oídos ═════════════════════════════════════════════════════════
  // useSpeechRecognitionEvent se suscribe al montar y se da de baja al
  // desmontar por su cuenta; el guardia es `abierta`, para que un resultado
  // que llega tarde no abra una pantalla con la hoja ya cerrada.
  useSpeechRecognitionEvent('result', (e) => {
    if (!abierta.current) return;
    const frase = (e?.results?.[0]?.transcript || '').trim();
    if (e?.isFinal) {
      if (!frase || atendido.current) return;
      atender(frase);
    } else if (frase) {
      ultimo.current = frase;
      setParcial(frase);
    }
  });

  // 'end' cierra el turno: en Android suele llegar tras el final, y en algunos
  // teléfonos el final NO llega — ahí el último parcial es la orden.
  useSpeechRecognitionEvent('end', () => {
    if (!abierta.current) return;
    setOyendo(false);
    if (atendido.current) return;
    const f = ultimo.current.trim();
    if (f) { atender(f); return; }
    setAvisoVoz(t.noOi);
  });

  useSpeechRecognitionEvent('error', (e) => {
    if (!abierta.current) return;
    setOyendo(false);
    const cod = e?.error;
    if (cod === 'aborted' || atendido.current) return;   // lo paramos nosotros
    if (cod === 'not-allowed' || cod === 'service-not-allowed') {
      // sin permiso el kicker no puede seguir en ESCUCHANDO: a ESCRIBE
      setPermiso('no'); setFase('escribe');
      setAvisoVoz(t.sinMic); decir(t.sinMicVoz, lang);
      luego(() => caja.current?.focus(), 200);
      return;
    }
    if (cod === 'no-speech' || cod === 'speech-timeout') { setAvisoVoz(t.noOi); return; }
    setAvisoVoz(t.falloVoz);
  });

  useSpeechRecognitionEvent('nomatch', () => {
    if (!abierta.current || atendido.current) return;
    setAvisoVoz(t.noOi);
  });

  // el volumen mueve la onda entera. Llega muchas veces por segundo: se filtra
  // por salto mínimo para no lanzar una animación por cada muestra.
  useSpeechRecognitionEvent('volumechange', (e) => {
    const v = Number(e?.value);
    if (!abierta.current || !Number.isFinite(v)) return;
    if (Math.abs(v - ultimoVol.current) < 0.4) return;
    ultimoVol.current = v;
    const escala = Math.min(1.25, Math.max(0.45, 0.45 + (v + 2) / 12));
    Animated.timing(vol, { toValue: escala, duration: 120, useNativeDriver: true }).start();
  });

  const alto = Dimensions.get('window').height;

  return (
    <>
      {/* la burbuja, siempre encima de todo. El Pressable de dentro es la
          puerta ACCESIBLE al asistente: role button y el nombre en la
          etiqueta, para que TalkBack/VoiceOver la anuncien en vez de ver un
          adorno mudo. El toque abre; el arrastre lo pesca el PanResponder. */}
      <Animated.View
        {...pan.panHandlers}
        style={[st.burbuja, { transform: [{ translateX: pos.x }, { translateY: pos.y }] }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.burbujaA11y(nombre)}
          hitSlop={8}
          onPress={() => abrirRef.current()}>
          <NucleoAsistente tam={TAM} inicial={inicial} latiendo={oyendo} />
        </Pressable>
      </Animated.View>

      {/* la hoja de los estados */}
      <Modal visible={visible} transparent animationType="none" onRequestClose={cerrar}>
        {/* `undefined` en Android dejaba esto MUERTO y la hoja del asistente
            se quedaba debajo del teclado. Ver src/og/Teclado.js. */}
        <KeyboardAvoidingView behavior={COMPORTAMIENTO} style={{ flex: 1 }}>
          <Animated.View style={[st.velo, { opacity: sube }]}>
            <Pressable style={{ flex: 1 }} onPress={cerrar} />
          </Animated.View>
          <View style={st.abajo} pointerEvents="box-none">
            <Animated.View style={[st.hoja, {
              transform: [{ translateY: sube.interpolate({ inputRange: [0, 1], outputRange: [Math.min(alto, 520), 0] }) }],
            }]}>
              <View style={st.asa} />
              <Text style={st.kicker}>{t.k[fase]}</Text>

              {fase === 'permiso' && (
                <View style={[st.centro, { paddingVertical: 10 }]}>
                  <NucleoAsistente tam={72} inicial={inicial} latiendo={false} />
                  <Text style={[st.dime, { marginTop: 12 }]}>{t.pidiendo}</Text>
                  <Text style={st.dimeSub}>{t.pidiendoSub}</Text>
                  <ActivityIndicator color={C.gold} />
                </View>
              )}

              {/* ESCUCHANDO y ESCRIBE comparten cuerpo, no kicker: en escribe
                  no hay onda ni botón de micrófono — solo la caja, que es el
                  único camino real cuando no hay oídos (sin módulo nativo o
                  sin permiso) */}
              {(fase === 'escucha' || fase === 'escribe') && (
                <View style={st.centro}>
                  <NucleoAsistente tam={72} inicial={inicial} latiendo={oyendo} />
                  {fase === 'escucha' && <Onda activa={oyendo} vol={vol} />}
                  {/* el título del micrófono negado solo si de verdad se negó:
                      sin módulo nativo no hubo pregunta que negar */}
                  <Text style={st.dime}>{HAY_VOZ && permiso === 'no' ? t.sinMicTit : t.dime}</Text>
                  <Text style={st.dimeSub}>{oyendo ? t.dimeSub : t.dimeSubMudo}</Text>
                  {/* La vista previa se dice AQUÍ y en una línea: quien abre
                      la hoja esperando hablar entiende en el acto por qué solo
                      hay una caja de texto, y que no es un fallo suyo. En un
                      APK sin el nativo (OTA sobre binario viejo) no sale nada:
                      allí no habría nada cierto que contar. */}
                  {!HAY_VOZ && VISTA_PREVIA && (
                    <Text style={st.previa}>{t.previa(nombre)}</Text>
                  )}

                  {/* lo que va oyendo, en gris: la prueba de que el micro está abierto */}
                  {!!parcial && <Text style={st.parcial}>«{parcial}»</Text>}
                  {!!avisoVoz && <Text style={st.avisoVoz}>{avisoVoz}</Text>}

                  {fase === 'escucha' && permiso === 'si' && !oyendo && (
                    <Pressable style={st.otra} onPress={() => { hap(); arrancarVoz(); }}>
                      <Text style={st.otraTxt}>{t.otraVoz}</Text>
                    </Pressable>
                  )}

                  <TextInput
                    ref={caja} value={texto} onChangeText={setTexto}
                    onFocus={() => { if (oyendo) pararVoz(); }}
                    onSubmitEditing={() => atender(texto)}
                    placeholder={t.ph} placeholderTextColor={C.txt3}
                    style={st.caja} returnKeyType="send"
                  />
                </View>
              )}

              {(fase === 'entendi' || fase === 'noEntendi') && !!oido && (
                <View style={st.centro}>
                  <Text style={st.frase}>«{oido.frase}»</Text>
                  {!!oido.uri && <Text style={st.uri}>{oido.uri}</Text>}
                  {!!oido.confirma && <Text style={st.confirma}>{oido.confirma}</Text>}
                  {!!oido.aviso && <Text style={st.aviso}>{oido.aviso}</Text>}
                  {/* «ayuda»: los EJEMPLOS aquí mismo, sin navegar a ninguna
                      parte — la respuesta a «¿qué puedes hacer?» son frases
                      que el traductor entiende de verdad */}
                  {!!oido.ejemplos && (
                    <View style={st.listaEj}>
                      <Text style={st.ejTit}>{t.ayuda}</Text>
                      {oido.ejemplos.map((e, i) => (
                        <Text key={i} style={st.ej}>«{e}»</Text>
                      ))}
                    </View>
                  )}
                  {!!oido.confirma && (
                    <View style={st.par}>
                      <Pressable style={{ flex: 1 }} onPress={() => { hap(); ejecutar(oido.uri, oido.ruta); }}>
                        <LinearGradient colors={G.gold} style={st.si} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                          <Text style={st.siTxt}>{t.si}</Text>
                        </LinearGradient>
                      </Pressable>
                      <Pressable style={st.no} onPress={otraVez}>
                        <Text style={st.noTxt}>{t.no}</Text>
                      </Pressable>
                    </View>
                  )}
                  {(!!oido.aviso || !!oido.ejemplos) && (
                    <Pressable style={st.otra} onPress={otraVez}>
                      <Text style={st.otraTxt}>{t.otra}</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {fase === 'ejecuta' && (
                <View style={[st.centro, { paddingVertical: 26 }]}>
                  <ActivityIndicator color={C.gold} size="large" />
                </View>
              )}

              {fase === 'hecho' && (
                <View style={st.centro}>
                  <LinearGradient colors={G.gold} style={st.palomita} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <Text style={st.palomitaTxt}>✓</Text>
                  </LinearGradient>
                  <Text style={st.hecho}>{oido?.hecho || t.hizoDef}</Text>
                </View>
              )}
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  burbuja: {
    position: 'absolute', left: 0, top: 0, zIndex: 60, elevation: 14,
    shadowColor: '#C9A961', shadowOpacity: 0.55, shadowRadius: 12, shadowOffset: { width: 0, height: 5 },
  },
  // el núcleo y sus órbitas
  halo: { position: 'absolute', backgroundColor: C.gold },
  aro: { position: 'absolute', backgroundColor: 'transparent' },
  satelite: { position: 'absolute', backgroundColor: C.goldHi },
  nucleo: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(248,239,207,0.7)',
  },
  nucleoTxt: { color: '#3A2C08', fontWeight: '900' },
  // la onda de voz
  onda: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, marginTop: 12, marginBottom: 2 },
  barra: { width: 4, height: 28, borderRadius: 2, backgroundColor: C.goldLt },

  velo: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(1,10,11,0.72)' },
  abajo: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  hoja: {
    backgroundColor: '#052a2b', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: C.line2, borderBottomWidth: 0,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 26,
  },
  asa: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(201,169,97,0.35)', marginBottom: 10 },
  kicker: { color: C.gold, fontSize: 10.5, fontWeight: '800', letterSpacing: 3.5, textAlign: 'center', marginBottom: 12 },
  centro: { alignItems: 'center' },
  dime: { color: C.txt, fontSize: 21, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  dimeSub: { color: C.txt3, fontSize: 12, marginTop: 4, marginBottom: 12, textAlign: 'center', lineHeight: 17 },
  // La nota de la vista previa cuelga del subtítulo —de ahí el margen
  // negativo, que se come el aire de abajo del anterior— y va un punto más
  // apagada: informa, no avisa de nada.
  previa: {
    color: C.txt3, fontSize: 11.5, lineHeight: 16.5, textAlign: 'center',
    marginTop: -6, marginBottom: 12, opacity: 0.9, paddingHorizontal: 6,
  },
  parcial: { color: C.txt3, fontSize: 15, fontStyle: 'italic', textAlign: 'center', marginBottom: 12, lineHeight: 21 },
  avisoVoz: { color: C.txt2, fontSize: 12.5, textAlign: 'center', marginBottom: 12, lineHeight: 18 },
  caja: {
    alignSelf: 'stretch', backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr,
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, color: C.txt, fontSize: 15, marginTop: 4,
  },
  frase: { color: C.txt, fontSize: 15.5, textAlign: 'center' },
  uri: { color: C.goldLt, fontSize: 11.5, fontFamily: 'monospace', marginTop: 6, textAlign: 'center' },
  // la lista de EJEMPLOS de «ayuda»: alineada a la izquierda dentro de la
  // hoja centrada, porque seis frases centradas bailan y no se leen en orden
  listaEj: { alignSelf: 'stretch', marginTop: 12 },
  ejTit: { color: C.txt2, fontSize: 12.5, marginBottom: 6 },
  ej: { color: C.goldLt, fontSize: 13.5, lineHeight: 22 },
  confirma: { color: C.txt2, fontSize: 13.5, marginTop: 12, textAlign: 'center' },
  aviso: { color: C.txt2, fontSize: 13.5, marginTop: 12, textAlign: 'center', lineHeight: 19 },
  par: { flexDirection: 'row', gap: 10, marginTop: 16, alignSelf: 'stretch' },
  si: { borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  siTxt: { color: '#3A2C08', fontWeight: '800', fontSize: 12, letterSpacing: 1.5 },
  no: { flex: 1, borderWidth: 1, borderColor: 'rgba(201,169,97,0.3)', borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  noTxt: { color: C.txt3, fontWeight: '700', fontSize: 12, letterSpacing: 1.5 },
  // sirve en ESCUCHANDO (encima de la caja) y en ENTENDÍ (debajo del aviso):
  // lleva aire por los dos lados para no depender de dónde caiga
  otra: { marginTop: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(201,169,97,0.3)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
  otraTxt: { color: C.goldLt, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  palomita: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  palomitaTxt: { color: '#3A2C08', fontSize: 28, fontWeight: '900' },
  hecho: { color: C.txt, fontSize: 15, textAlign: 'center', lineHeight: 21 },
});
