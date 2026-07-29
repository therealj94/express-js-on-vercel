import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../icons';
import { C, G } from '../theme';
import { Header, Logo, Glass } from '../ui';
import { VERSION, BUILD, RELEASED, CHANGELOG } from '../version';
import { useT, useLang } from '../i18n';

// Acerca de / Novedades: qué versión está corriendo en este teléfono y qué
// trajo cada una. Es la forma rápida de confirmar que el APK instalado es el
// que se acaba de entregar.
export default function About({ nav }) {
  const t = useT();
  const { lang } = useLang();

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('about.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
        <LinearGradient colors={G.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.hero}>
          <Logo size={120} />
          <Text style={st.ver}>{VERSION}</Text>
          <Text style={st.build}>{t('about.build', { b: BUILD })} · {RELEASED}</Text>
          <View style={st.pill}>
            <Icon name="checkmark-circle" size={13} color={C.up} />
            <Text style={st.pillTxt}>{t('about.current')}</Text>
          </View>
        </LinearGradient>

        <Text style={st.grp}>{t('about.news')}</Text>
        {CHANGELOG.map((r, i) => (
          <Glass key={r.v} style={st.card}>
            <View style={st.cardHead}>
              <Text style={st.cardV}>v{r.v}</Text>
              <Text style={st.cardD}>{t('about.build', { b: r.build })} · {r.date}</Text>
              {i === 0 ? <View style={st.tag}><Text style={st.tagTxt}>{t('about.latest')}</Text></View> : null}
            </View>
            {(r[lang] || r.en).map((line, k) => (
              <View key={k} style={st.item}>
                <View style={st.dot} />
                <Text style={st.itemTxt}>{line}</Text>
              </View>
            ))}
          </Glass>
        ))}

        <Text style={st.foot}>{t('set.foot')}</Text>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  hero: { borderRadius: 24, borderWidth: 1, borderColor: C.line, paddingVertical: 26, alignItems: 'center' },
  ver: { color: C.gold, fontSize: 30, fontWeight: '800', marginTop: 12, letterSpacing: 0.5 },
  build: { color: C.txt2, fontSize: 12, marginTop: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(52,211,153,0.14)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.3)' },
  pillTxt: { color: C.up, fontSize: 11.5, fontWeight: '700' },
  grp: { fontSize: 11, letterSpacing: 2, color: C.txt3, fontWeight: '700', marginTop: 24, marginBottom: 10, paddingHorizontal: 2 },
  card: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 16, marginBottom: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 },
  cardV: { color: C.txt, fontWeight: '800', fontSize: 16 },
  cardD: { color: C.txt3, fontSize: 11, flex: 1 },
  tag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8, backgroundColor: C.gold },
  tagTxt: { color: C.darkText, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
  item: { flexDirection: 'row', gap: 10, marginBottom: 7 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.gold, marginTop: 6 },
  itemTxt: { color: C.txt2, fontSize: 12.5, lineHeight: 18.5, flex: 1 },
  foot: { color: C.txt3, fontSize: 11, textAlign: 'center', marginTop: 18, lineHeight: 17 },
});
