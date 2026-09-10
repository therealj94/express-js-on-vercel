// La barra del asistente, sobre las pestañas: escucha → entiende → confirma.
// Enseña lo entendido (y la dirección og://) antes de tocar nada; lo que
// toca dinero pide SÍ/NO y abre la pantalla nativa de ENVIAR ya preparada.
// El dictado entra por el micrófono del teclado; el botón dorado enfoca y
// saluda con la voz.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Animated, StyleSheet, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from '../theme';
import { useLang } from '../i18n';
import { traducir } from '../intencion';
import { aUri, MAPA, abrir } from './rutas';
import { decir, callar } from '../voz';
import { nombreAsistente } from './asistente';
import * as M from './mensajes';

const TXT = {
  es: {
    escucho: 'Te escucho. Dime qué quieres hacer.',
    ph: '«envía 15 a Juan» · «abre mytokenpay»',
    si: 'SÍ, ABRE', no: 'NO', listo: 'Te la dejé lista. La firmas tú.',
    fuera: 'Eso no lo puedo hacer. Puedo abrir tus apps, preparar envíos, cobrar y enseñarte tus cosas.',
    sinContacto: 'No encuentro a esa persona en tu chat. Búscala primero o escanea su código.',
    sinMonto: 'No entendí el monto. Dímelo con número: envía 15 a Juan.',
    confirma: (m, q) => `Preparar envío de ${m} ORIGEN a ${q}`,
  },
  en: {
    escucho: 'Listening. Tell me what you want to do.',
    ph: '“send 15 to Juan” · “open mytokenpay”',
    si: 'YES, OPEN', no: 'NO', listo: 'It is ready. You sign it.',
    fuera: 'I cannot do that. I can open your apps, prepare sends, charge, and show you your things.',
    sinContacto: 'I cannot find that person in your chat. Search them first or scan their code.',
    sinMonto: 'I did not catch the amount. Say it with a number: send 15 to Juan.',
    confirma: (m, q) => `Prepare sending ${m} ORIGEN to ${q}`,
  },
};

export default function BarraOG({ nav }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const [texto, setTexto] = useState('');
  const [linea, setLinea] = useState(null);
  const [libreta, setLibreta] = useState([]);
  const caja = useRef(null);
  const pulso = useRef(new Animated.Value(0)).current;

  // la libreta del asistente es la gente real del chat
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

  const latir = () => {
    pulso.setValue(0);
    Animated.loop(
      Animated.timing(pulso, { toValue: 1, duration: 1300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      { iterations: 3 },
    ).start();
  };

  const micro = () => { latir(); caja.current?.focus(); decir(nombreAsistente() + '. ' + t.escucho, lang); };

  const atender = (frase) => {
    const f = String(frase || '').trim();
    if (!f) return;
    setTexto(''); callar();
    const r = traducir(f, libreta);
    if (!r) { setLinea({ frase: f, aviso: t.fuera }); decir(t.fuera, lang); return; }
    if (r.falla) {
      const msg = r.falla === 'sinContacto' ? t.sinContacto : t.sinMonto;
      setLinea({ frase: f, aviso: msg }); decir(msg, lang); return;
    }
    const uri = aUri(r.ruta, r.params);
    if (MAPA[r.ruta].firma) {
      const msg = t.confirma(r.params.amount, r.params.nombre || '');
      setLinea({ frase: f, uri, confirma: msg });
      decir(msg, lang);
      return;
    }
    setLinea({ frase: f, uri });
    abrir(uri, nav);
  };

  const halo = {
    opacity: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
    transform: [{ scale: pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
  };

  return (
    <View style={st.caja}>
      {linea && (
        <View style={st.oido}>
          <Text style={st.frase}>«{linea.frase}»</Text>
          {!!linea.uri && <Text style={st.uri}>{linea.uri}</Text>}
          {!!linea.aviso && <Text style={st.aviso}>{linea.aviso}</Text>}
          {!!linea.confirma && (
            <View style={st.par}>
              <Pressable style={st.si} onPress={() => { decir(t.listo, lang); abrir(linea.uri, nav); setLinea(null); }}>
                <Text style={st.siTxt}>{t.si}</Text>
              </Pressable>
              <Pressable style={st.no} onPress={() => { setLinea(null); callar(); }}>
                <Text style={st.noTxt}>{t.no}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
      <View style={st.fila}>
        <Pressable onPress={micro}>
          <View>
            <Animated.View style={[st.halo, halo]} />
            <LinearGradient colors={G.gold} style={st.bola} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Text style={st.bolaTxt}>{nombreAsistente()[0]}</Text>
            </LinearGradient>
          </View>
        </Pressable>
        <TextInput
          ref={caja} value={texto} onChangeText={setTexto}
          onSubmitEditing={() => atender(texto)}
          placeholder={t.ph} placeholderTextColor={C.txt3}
          style={st.input} returnKeyType="send"
        />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  caja: { borderTopWidth: 1, borderTopColor: 'rgba(201,169,97,0.16)', backgroundColor: 'rgba(2,17,18,0.95)', paddingHorizontal: 12, paddingTop: 7, paddingBottom: 7 },
  oido: { marginBottom: 7 },
  frase: { color: C.txt, fontSize: 13 },
  uri: { color: C.goldLt, fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  aviso: { color: C.txt2, fontSize: 12.5, marginTop: 4 },
  par: { flexDirection: 'row', gap: 8, marginTop: 8 },
  si: { flex: 1, backgroundColor: C.gold, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  siTxt: { color: '#3A2C08', fontWeight: '800', fontSize: 11, letterSpacing: 1.5 },
  no: { flex: 1, borderWidth: 1, borderColor: 'rgba(201,169,97,0.3)', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  noTxt: { color: C.txt3, fontWeight: '700', fontSize: 11, letterSpacing: 1.5 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  halo: { position: 'absolute', left: 0, top: 0, width: 42, height: 42, borderRadius: 21, backgroundColor: C.gold },
  bola: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  bolaTxt: { color: '#3A2C08', fontWeight: '900', fontSize: 17 },
  input: { flex: 1, backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 22, paddingHorizontal: 15, paddingVertical: 10, color: C.txt, fontSize: 14 },
});
