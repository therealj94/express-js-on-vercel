// La barra de hablar. Vive abajo en TODAS las pantallas y no desaparece:
// es la promesa de la app --dile qué quieres y te lleva--.
//
// Tres estados: escucha → entiende → confirma. Lo entendido se enseña
// ESCRITO (y la dirección og:// a la que resolvió, en letra pequeña) antes
// de tocar nada. Lo que toca dinero pide SÍ/NO; lo demás abre y ya.
//
// El dictado por voz llega por el micrófono del teclado (Gboard/iOS lo traen
// gratis y en los dos idiomas). El botón dorado enfoca la caja y lo pide en
// voz alta: cero módulos nativos extra, cero riesgo de compilación, y el
// resultado es el mismo — se habla, aparece escrito, GENESIS actúa.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Animated, StyleSheet, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from './theme';
import { useT } from './i18n';
import { traducir } from './intencion';
import { aUri, MAPA } from './rutas';
import { decir, callar } from './voz';
import { elAsistente } from './api';

export default function BarraGenesis({ contactos, abrir, ordenExterna }) {
  const t = useT();
  const [texto, setTexto] = useState('');
  const [linea, setLinea] = useState(null);   // {frase, uri, aviso, confirma}
  const caja = useRef(null);
  const pulso = useRef(new Animated.Value(0)).current;

  // Los ejemplos de la pantalla del asistente entran por aquí: tocar un chip
  // es EXACTAMENTE decirle esa frase a la barra --el mismo camino, sin atajos.
  useEffect(() => { if (ordenExterna?.f) atender(ordenExterna.f); }, [ordenExterna?.n]);

  const latir = () => {
    pulso.setValue(0);
    Animated.loop(
      Animated.timing(pulso, { toValue: 1, duration: 1300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      { iterations: 3 },
    ).start();
  };

  const micro = () => {
    latir();
    caja.current?.focus();
    decir(elAsistente() + '. ' + t('gen.escucho'));
  };

  const atender = (frase) => {
    const f = String(frase || '').trim();
    if (!f) return;
    setTexto('');
    callar();
    const r = traducir(f, contactos);
    if (!r) {
      setLinea({ frase: f, aviso: t('gen.fuera') });
      decir(t('gen.fuera'));
      return;
    }
    if (r.falla) {
      const msg = t(r.falla === 'sinContacto' ? 'gen.sinContacto' : 'gen.sinMonto');
      setLinea({ frase: f, aviso: msg });
      decir(msg);
      return;
    }
    const uri = aUri(r.ruta, r.params);
    if (MAPA[r.ruta].firma) {
      // Dinero: se enseña lo entendido y se espera el dedo. SIEMPRE.
      const msg = t('gen.confirmaEnvio', { monto: r.params.monto, quien: r.params.nombre });
      setLinea({ frase: f, uri, confirma: { r, msg } });
      decir(msg + '. ¿' + t('gen.si').toLowerCase() + '?');
      return;
    }
    setLinea({ frase: f, uri });
    abrir(uri);
  };

  const halo = {
    opacity: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
    transform: [{ scale: pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
  };

  return (
    <View style={s.caja}>
      {linea && (
        <View style={s.oido}>
          <Text style={s.frase}>«{linea.frase}»</Text>
          {!!linea.uri && <Text style={s.uri}>{linea.uri}</Text>}
          {!!linea.aviso && <Text style={s.aviso}>{linea.aviso}</Text>}
          {!!linea.confirma && (
            <View style={s.par}>
              <Pressable
                style={s.si}
                onPress={() => { const { r } = linea.confirma; setLinea({ ...linea, confirma: null }); decir(t('gen.listo')); abrir(linea.uri, r); }}>
                <Text style={s.siTxt}>{t('gen.si')}</Text>
              </Pressable>
              <Pressable style={s.no} onPress={() => { setLinea(null); callar(); }}>
                <Text style={s.noTxt}>{t('gen.no')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
      <View style={s.fila}>
        <Pressable onPress={micro}>
          <View>
            <Animated.View style={[s.halo, halo]} />
            <LinearGradient colors={G.gold} style={s.bola} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Text style={s.bolaTxt}>{elAsistente()[0]}</Text>
            </LinearGradient>
          </View>
        </Pressable>
        <TextInput
          ref={caja}
          value={texto}
          onChangeText={setTexto}
          onSubmitEditing={() => atender(texto)}
          placeholder={t('gen.placeholder')}
          placeholderTextColor={C.txt3}
          style={s.input}
          returnKeyType="send"
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  caja: { borderTopWidth: 1, borderTopColor: C.line2, backgroundColor: 'rgba(2,17,18,0.97)', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  oido: { marginBottom: 8 },
  frase: { color: C.txt, fontSize: 13 },
  uri: { color: C.goldLt, fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  aviso: { color: C.txt2, fontSize: 12.5, marginTop: 4 },
  par: { flexDirection: 'row', gap: 8, marginTop: 8 },
  si: { flex: 1, backgroundColor: C.gold, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  siTxt: { color: C.darkText, fontWeight: '800', fontSize: 11, letterSpacing: 1.5 },
  no: { flex: 1, borderWidth: 1, borderColor: C.line2, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  noTxt: { color: C.txt3, fontWeight: '700', fontSize: 11, letterSpacing: 1.5 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  halo: { position: 'absolute', left: 0, top: 0, width: 46, height: 46, borderRadius: 23, backgroundColor: C.gold },
  bola: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  bolaTxt: { color: C.darkText, fontWeight: '900', fontSize: 19 },
  input: { flex: 1, backgroundColor: C.input, borderWidth: 1, borderColor: 'rgba(46,116,119,0.6)', borderRadius: 24, paddingHorizontal: 15, paddingVertical: 11, color: C.txt, fontSize: 14 },
});
