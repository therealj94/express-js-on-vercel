// El asistente, a pantalla completa: un orbe de oro que respira --tres
// anillos girando a ritmos distintos sobre el núcleo--, su nombre en grande
// (EL QUE TÚ LE PONGAS), los ejemplos que se tocan y funcionan, y las tres
// reglas dichas a la cara. Tocar el orbe lo saluda con la voz.
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Animated, Easing, TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from '../theme';
import { useT } from '../i18n';
import { EJEMPLOS } from '../intencion';
import { elAsistente, ponerNombreAsistente } from '../api';
import { Tarjeta, Etiqueta, Entra, BotonOro } from '../ui';
import { decir } from '../voz';

function Orbe({ alTocar }) {
  const g1 = useRef(new Animated.Value(0)).current;
  const g2 = useRef(new Animated.Value(0)).current;
  const alma = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const gira = (v, dur) => Animated.loop(
      Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }),
    ).start();
    gira(g1, 9000); gira(g2, 14000);
    Animated.loop(Animated.sequence([
      Animated.timing(alma, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(alma, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();
  }, []);
  const rota = (v, alReves) => v.interpolate({ inputRange: [0, 1], outputRange: alReves ? ['360deg', '0deg'] : ['0deg', '360deg'] });
  return (
    <Pressable onPress={alTocar}>
      <View style={o.centro}>
        <Animated.View style={[o.anillo, o.a1, { transform: [{ rotate: rota(g1) }] }]} />
        <Animated.View style={[o.anillo, o.a2, { transform: [{ rotate: rota(g2, true) }] }]} />
        <Animated.View style={{
          transform: [{ scale: alma.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }],
        }}>
          <LinearGradient colors={G.gold} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={o.nucleo}>
            <View style={o.destello} />
          </LinearGradient>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const o = StyleSheet.create({
  centro: { width: 168, height: 168, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  anillo: { position: 'absolute', borderRadius: 100, borderColor: C.gold },
  a1: { width: 150, height: 150, borderWidth: 1.2, borderStyle: 'dashed', opacity: 0.6 },
  a2: { width: 168, height: 168, borderWidth: 1, opacity: 0.28, borderColor: C.goldLt },
  nucleo: { width: 108, height: 108, borderRadius: 54, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  destello: { position: 'absolute', top: 12, left: 18, width: 34, height: 20, borderRadius: 12, backgroundColor: 'rgba(255,255,250,0.5)', transform: [{ rotate: '-24deg' }] },
});

export default function Asistente({ probar }) {
  const t = useT();
  const [nombre, setNombre] = useState(elAsistente());
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState('');
  const ejemplos = EJEMPLOS[t.idioma] || EJEMPLOS.es;

  const saludar = () => decir(t('asis.saludo', { nombre }));

  const renombrar = async () => {
    const n = await ponerNombreAsistente(borrador);
    setNombre(n); setEditando(false);
    decir(t('asis.mellamo', { nombre: n }));
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.dentro}>
      <Entra><Orbe alTocar={saludar} /></Entra>
      <Entra delay={100} style={{ alignItems: 'center' }}>
        <Text style={s.nombre}>{nombre}</Text>
        <Text style={s.txt}>{t('asis.texto')}</Text>
        {editando ? (
          <View style={s.renombra}>
            <TextInput
              value={borrador} onChangeText={setBorrador} placeholder={nombre}
              placeholderTextColor={C.txt3} style={s.inputNombre} maxLength={16} autoFocus
              onSubmitEditing={renombrar}
            />
            <BotonOro onPress={renombrar} style={{ paddingVertical: 11 }}>{t('asis.guardar')}</BotonOro>
          </View>
        ) : (
          <Pressable onPress={() => { setBorrador(''); setEditando(true); }}>
            <Text style={s.renombraTxt}>✎ {t('asis.renombrar')}</Text>
          </Pressable>
        )}
      </Entra>

      <Etiqueta style={{ marginTop: 22 }}>{t('gen.ayuda.titulo').toUpperCase()}</Etiqueta>
      <View style={s.nube}>
        {ejemplos.map((f, i) => (
          <Entra key={f} delay={140 + i * 45}>
            <Pressable style={s.chip} onPress={() => probar(f)}>
              <Text style={s.chipTxt}>«{f}»</Text>
            </Pressable>
          </Entra>
        ))}
      </View>

      <Entra delay={480}>
        <Tarjeta style={{ marginTop: 18 }}>
          {[t('asis.regla1'), t('asis.regla2'), t('asis.regla3')].map((r, i) => (
            <View key={i} style={s.regla}>
              <Text style={s.num}>{i + 1}</Text>
              <Text style={s.reglaTxt}>{r}</Text>
            </View>
          ))}
        </Tarjeta>
      </Entra>

      <Entra delay={560}>
        <View style={s.cadena}>
          <Text style={s.cadenaTxt}>⛓ {t('gen.web3')}</Text>
        </View>
      </Entra>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  dentro: { padding: 20, paddingTop: 16, paddingBottom: 30 },
  nombre: { color: C.txt, fontSize: 30, fontWeight: '200', letterSpacing: 5, marginTop: 16 },
  txt: { color: C.txt2, fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginTop: 8, paddingHorizontal: 8 },
  renombra: { width: '100%', marginTop: 12, gap: 8 },
  inputNombre: { backgroundColor: C.input, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, color: C.txt, fontSize: 16, textAlign: 'center', letterSpacing: 2 },
  renombraTxt: { color: C.gold, fontSize: 12.5, marginTop: 10, letterSpacing: 0.5 },
  nube: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line2, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9 },
  chipTxt: { color: C.txt2, fontSize: 13 },
  regla: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 10 },
  num: { color: C.gold, fontWeight: '800', fontSize: 15, width: 16 },
  reglaTxt: { color: C.txt2, fontSize: 13, lineHeight: 19, flex: 1 },
  cadena: { borderLeftWidth: 2, borderLeftColor: C.gold, backgroundColor: 'rgba(201,169,97,0.07)', borderRadius: 8, padding: 12, marginTop: 14 },
  cadenaTxt: { color: C.txt2, fontSize: 12.5, lineHeight: 19 },
});
