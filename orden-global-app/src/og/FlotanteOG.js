// El asistente flotante de Orden Global. Reemplaza a la barra fija (BarraOG):
// una burbuja dorada SIEMPRE visible, que se arrastra y se imanta al borde
// --como la de un chat--, y al tocarla sube una hoja con los CUATRO estados
// que pidió José, para que nunca haya duda de en qué punto está el asistente:
//   ESCUCHANDO → halo pulsando + «Dime…» + caja con foco (el dictado entra
//                por el micrófono del teclado, igual que en la barra);
//   ENTENDÍ    → la frase oída + la dirección og:// a la que resuelve; si
//                toca dinero se detiene aquí y pide SÍ ABRE / NO;
//   EJECUTANDO → un giro breve mientras se navega;
//   HECHO      → palomita + qué se hizo, y la hoja se recoge sola.
// La voz (decir) acompaña cada transición: el asistente se OYE además de verse.
// Las reglas de la casa siguen intactas: todo pasa por el MAPA de rutas, y lo
// que toca dinero solo se PREPARA — la persona firma.
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, Animated, StyleSheet, Modal, Easing,
  Dimensions, PanResponder, ActivityIndicator, KeyboardAvoidingView, Platform,
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from '../theme';
import { useLang } from '../i18n';
import { hap } from '../ui';
import { traducir } from '../intencion';
import { aUri, MAPA, abrir } from './rutas';
import { decir, callar } from '../voz';
import { nombreAsistente } from './asistente';
import * as M from './mensajes';

const TXT = {
  es: {
    k: { escucha: 'ESCUCHANDO', entendi: 'ENTENDÍ', ejecuta: 'EJECUTANDO', hecho: 'HECHO' },
    dime: 'Dime…',
    dimeVoz: 'Dime qué quieres hacer.',
    dimeSub: 'Habla con el micrófono del teclado, o escribe.',
    ph: '«envía 15 a Juan» · «hazme un reporte»',
    entendiVoz: 'Entendido.',
    si: 'SÍ, ABRE', no: 'NO', otra: 'INTENTAR DE NUEVO',
    fuera: 'Eso no lo puedo hacer. Puedo abrir tus apps, preparar envíos, cobrar y enseñarte tus cosas.',
    sinContacto: 'No encuentro a esa persona en tu chat. Búscala primero o escanea su código.',
    sinMonto: 'No entendí el monto. Dímelo con número: envía 15 a Juan.',
    confirma: (m, q) => `Preparar envío de ${m} ORIGEN a ${q}`,
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
      'id/abrir': 'Abrí tu Genesis ID.',
      'chat/abrir': 'Abrí el chat.',
      'asistente/abrir': 'Aquí estoy.',
    },
    hizoDef: 'Hecho.',
  },
  en: {
    k: { escucha: 'LISTENING', entendi: 'GOT IT', ejecuta: 'WORKING', hecho: 'DONE' },
    dime: 'Tell me…',
    dimeVoz: 'Tell me what you want to do.',
    dimeSub: 'Speak with the keyboard microphone, or type.',
    ph: '“send 15 to Juan” · “wallet report”',
    entendiVoz: 'Got it.',
    si: 'YES, OPEN', no: 'NO', otra: 'TRY AGAIN',
    fuera: 'I cannot do that. I can open your apps, prepare sends, charge, and show you your things.',
    sinContacto: 'I cannot find that person in your chat. Search them first or scan their code.',
    sinMonto: 'I did not catch the amount. Say it with a number: send 15 to Juan.',
    confirma: (m, q) => `Prepare sending ${m} ORIGEN to ${q}`,
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
      'id/abrir': 'I opened your Genesis ID.',
      'chat/abrir': 'I opened the chat.',
      'asistente/abrir': 'Here I am.',
    },
    hizoDef: 'Done.',
  },
};

const TAM = 56;          // diámetro de la burbuja
const MARGEN = 10;       // aire respecto al borde al imantarse

export default function FlotanteOG({ nav }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const [visible, setVisible] = useState(false);
  const [fase, setFase] = useState('escucha');   // escucha | entendi | ejecuta | hecho
  const [oido, setOido] = useState(null);        // { frase, uri, ruta, aviso, confirma, hecho }
  const [texto, setTexto] = useState('');
  const [libreta, setLibreta] = useState([]);
  const caja = useRef(null);

  // ── relojes con dueño: cada timeout se apunta y al cerrar (o desmontar)
  //    se limpian todos, para que una hoja cerrada no navegue sola después ──
  const relojes = useRef([]);
  const luego = (fn, ms) => { relojes.current.push(setTimeout(fn, ms)); };
  const limpiar = () => { relojes.current.forEach(clearTimeout); relojes.current = []; };
  useEffect(() => () => limpiar(), []);

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
  // Se distingue toque de arrastre por cuánto se movió el dedo: menos de
  // ~6 px es un toque. El imán decide borde por el CENTRO de la burbuja.
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

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      pos.setOffset({ x: donde.current.x, y: donde.current.y });
      pos.setValue({ x: 0, y: 0 });
    },
    onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      pos.flattenOffset();
      const w = Dimensions.get('window');
      // el imán: al borde más cercano, sin salirse ni tapar la zona de tabs
      const metaX = donde.current.x + TAM / 2 < w.width / 2 ? MARGEN : w.width - TAM - MARGEN;
      const metaY = Math.min(Math.max(donde.current.y, 60), w.height - TAM - 120);
      Animated.spring(pos, { toValue: { x: metaX, y: metaY }, friction: 6, useNativeDriver: false }).start();
      if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) abrirHoja();
    },
    onPanResponderTerminate: () => { pos.flattenOffset(); },
  })).current;

  // ══ la hoja inferior: Modal + subida animada ═══════════════════════════
  const sube = useRef(new Animated.Value(0)).current;

  const abrirHoja = () => {
    hap(); limpiar();
    setTexto(''); setOido(null); setFase('escucha'); setVisible(true);
    sube.setValue(0);
    Animated.timing(sube, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    decir(nombreAsistente() + '. ' + t.dimeVoz, lang);
    // el foco tras la animación: un foco inmediato dentro de un Modal recién
    // montado se pierde en Android
    luego(() => caja.current?.focus(), 380);
  };

  const cerrar = () => {
    limpiar(); callar(); Keyboard.dismiss();
    Animated.timing(sube, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setVisible(false));
  };

  // volver a ESCUCHANDO (tras un NO o un aviso), sin repetir el saludo
  const otraVez = () => {
    limpiar(); callar();
    setOido(null); setTexto(''); setFase('escucha');
    luego(() => caja.current?.focus(), 120);
  };

  // ══ el ciclo: frase → traducir → estados ═══════════════════════════════
  const atender = (frase) => {
    const f = String(frase || '').trim();
    if (!f) return;
    setTexto(''); Keyboard.dismiss(); callar();
    const r = traducir(f, libreta);
    if (!r) { setOido({ frase: f, aviso: t.fuera }); setFase('entendi'); decir(t.fuera, lang); return; }
    if (r.falla) {
      const msg = r.falla === 'sinContacto' ? t.sinContacto : t.sinMonto;
      setOido({ frase: f, aviso: msg }); setFase('entendi'); decir(msg, lang); return;
    }
    const uri = aUri(r.ruta, r.params);
    if (MAPA[r.ruta]?.firma) {
      // dinero: se enseña y se DETIENE — sin un SÍ explícito no se abre nada
      const msg = t.confirma(r.params.amount, r.params.nombre || '');
      setOido({ frase: f, uri, ruta: r.ruta, confirma: msg });
      setFase('entendi'); decir(msg, lang);
      return;
    }
    // sin dinero de por medio: se enseña lo entendido un instante y sigue solo
    setOido({ frase: f, uri, ruta: r.ruta });
    setFase('entendi'); decir(t.entendiVoz, lang);
    luego(() => ejecutar(uri, r.ruta), 900);
  };

  const ejecutar = (uri, ruta) => {
    setFase('ejecuta');
    luego(() => {
      abrir(uri, nav);
      const msg = t.hizo[ruta] || t.hizoDef;
      setOido((o) => ({ ...(o || {}), hecho: msg }));
      setFase('hecho'); decir(msg, lang);
      luego(cerrar, 1700);
    }, 650);
  };

  // ══ el halo que pulsa mientras ESCUCHA ═════════════════════════════════
  const pulso = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!(visible && fase === 'escucha')) return;
    pulso.setValue(0);
    const lazo = Animated.loop(
      Animated.timing(pulso, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    lazo.start();
    return () => lazo.stop();
  }, [visible, fase, pulso]);
  const halo = {
    opacity: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
    transform: [{ scale: pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) }],
  };

  const inicial = (nombreAsistente() || 'G')[0];
  const alto = Dimensions.get('window').height;

  return (
    <>
      {/* la burbuja, siempre encima de todo */}
      <Animated.View
        {...pan.panHandlers}
        style={[st.burbuja, { transform: [{ translateX: pos.x }, { translateY: pos.y }] }]}>
        <LinearGradient colors={G.gold} style={st.bola} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={st.bolaTxt}>{inicial}</Text>
        </LinearGradient>
      </Animated.View>

      {/* la hoja de los cuatro estados */}
      <Modal visible={visible} transparent animationType="none" onRequestClose={cerrar}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Animated.View style={[st.velo, { opacity: sube }]}>
            <Pressable style={{ flex: 1 }} onPress={cerrar} />
          </Animated.View>
          <View style={st.abajo} pointerEvents="box-none">
            <Animated.View style={[st.hoja, {
              transform: [{ translateY: sube.interpolate({ inputRange: [0, 1], outputRange: [Math.min(alto, 480), 0] }) }],
            }]}>
              <View style={st.asa} />
              <Text style={st.kicker}>{t.k[fase]}</Text>

              {fase === 'escucha' && (
                <View style={st.centro}>
                  <View style={st.orbeSitio}>
                    <Animated.View style={[st.halo, halo]} />
                    <LinearGradient colors={G.gold} style={st.orbe} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                      <Text style={st.orbeTxt}>{inicial}</Text>
                    </LinearGradient>
                  </View>
                  <Text style={st.dime}>{t.dime}</Text>
                  <Text style={st.dimeSub}>{t.dimeSub}</Text>
                  <TextInput
                    ref={caja} value={texto} onChangeText={setTexto} autoFocus
                    onSubmitEditing={() => atender(texto)}
                    placeholder={t.ph} placeholderTextColor={C.txt3}
                    style={st.caja} returnKeyType="send"
                  />
                </View>
              )}

              {fase === 'entendi' && !!oido && (
                <View style={st.centro}>
                  <Text style={st.frase}>«{oido.frase}»</Text>
                  {!!oido.uri && <Text style={st.uri}>{oido.uri}</Text>}
                  {!!oido.confirma && <Text style={st.confirma}>{oido.confirma}</Text>}
                  {!!oido.aviso && <Text style={st.aviso}>{oido.aviso}</Text>}
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
                  {!!oido.aviso && (
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
  bola: {
    width: TAM, height: TAM, borderRadius: TAM / 2, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(248,239,207,0.65)',
  },
  bolaTxt: { color: '#3A2C08', fontWeight: '900', fontSize: 22 },
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
  orbeSitio: { width: 64, height: 64, marginBottom: 12 },
  halo: { position: 'absolute', left: 0, top: 0, width: 64, height: 64, borderRadius: 32, backgroundColor: C.gold },
  orbe: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  orbeTxt: { color: '#3A2C08', fontWeight: '900', fontSize: 26 },
  dime: { color: C.txt, fontSize: 21, fontWeight: '700' },
  dimeSub: { color: C.txt3, fontSize: 12, marginTop: 4, marginBottom: 14, textAlign: 'center' },
  caja: {
    alignSelf: 'stretch', backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr,
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, color: C.txt, fontSize: 15,
  },
  frase: { color: C.txt, fontSize: 15.5, textAlign: 'center' },
  uri: { color: C.goldLt, fontSize: 11.5, fontFamily: 'monospace', marginTop: 6, textAlign: 'center' },
  confirma: { color: C.txt2, fontSize: 13.5, marginTop: 12, textAlign: 'center' },
  aviso: { color: C.txt2, fontSize: 13.5, marginTop: 12, textAlign: 'center', lineHeight: 19 },
  par: { flexDirection: 'row', gap: 10, marginTop: 16, alignSelf: 'stretch' },
  si: { borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  siTxt: { color: '#3A2C08', fontWeight: '800', fontSize: 12, letterSpacing: 1.5 },
  no: { flex: 1, borderWidth: 1, borderColor: 'rgba(201,169,97,0.3)', borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  noTxt: { color: C.txt3, fontWeight: '700', fontSize: 12, letterSpacing: 1.5 },
  otra: { marginTop: 14, borderWidth: 1, borderColor: 'rgba(201,169,97,0.3)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
  otraTxt: { color: C.goldLt, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  palomita: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  palomitaTxt: { color: '#3A2C08', fontSize: 28, fontWeight: '900' },
  hecho: { color: C.txt, fontSize: 15, textAlign: 'center', lineHeight: 21 },
});
