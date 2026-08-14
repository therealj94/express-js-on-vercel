// La pantalla del asistente: quién es GENESIS, qué se le puede decir --con
// ejemplos que se tocan y funcionan-- y las tres reglas dichas a la cara.
// Los ejemplos salen de EJEMPLOS en intencion.js: la prueba de node
// garantiza que nunca se enseña una frase que el traductor no entiende.
import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from '../theme';
import { useT } from '../i18n';
import { EJEMPLOS } from '../intencion';
import { Tarjeta, Etiqueta, Entra } from '../ui';

export default function Asistente({ probar }) {
  const t = useT();
  const ejemplos = EJEMPLOS[t.idioma] || EJEMPLOS.es;
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.dentro}>
      <Entra style={s.cab}>
        <LinearGradient colors={G.gold} style={s.gema} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={s.gemaTxt}>G</Text>
        </LinearGradient>
        <Text style={s.tit}>{t('asis.titulo')}</Text>
        <Text style={s.txt}>{t('asis.texto')}</Text>
      </Entra>

      <Etiqueta>{t('gen.ayuda.titulo').toUpperCase()}</Etiqueta>
      <View style={s.nube}>
        {ejemplos.map((f, i) => (
          <Entra key={f} delay={60 + i * 45}>
            <Pressable style={s.chip} onPress={() => probar(f)}>
              <Text style={s.chipTxt}>«{f}»</Text>
            </Pressable>
          </Entra>
        ))}
      </View>

      <Entra delay={420}>
        <Tarjeta style={{ marginTop: 16 }}>
          {[t('asis.regla1'), t('asis.regla2'), t('asis.regla3')].map((r, i) => (
            <View key={i} style={s.regla}>
              <Text style={s.num}>{i + 1}</Text>
              <Text style={s.reglaTxt}>{r}</Text>
            </View>
          ))}
        </Tarjeta>
      </Entra>

      <Entra delay={520}>
        <View style={s.cadena}>
          <Text style={s.cadenaTxt}>⛓ {t('gen.web3')}</Text>
        </View>
      </Entra>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  dentro: { padding: 20, paddingBottom: 30 },
  cab: { alignItems: 'center', marginBottom: 20 },
  gema: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  gemaTxt: { color: C.darkText, fontSize: 26, fontWeight: '900' },
  tit: { color: C.txt, fontSize: 21, fontWeight: '300' },
  txt: { color: C.txt2, fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  nube: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line2, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9 },
  chipTxt: { color: C.txt2, fontSize: 13 },
  regla: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 10 },
  num: { color: C.gold, fontWeight: '800', fontSize: 15, width: 16 },
  reglaTxt: { color: C.txt2, fontSize: 13, lineHeight: 19, flex: 1 },
  cadena: { borderLeftWidth: 2, borderLeftColor: C.gold, backgroundColor: 'rgba(201,169,97,0.07)', borderRadius: 8, padding: 12, marginTop: 14 },
  cadenaTxt: { color: C.txt2, fontSize: 12.5, lineHeight: 19 },
});
