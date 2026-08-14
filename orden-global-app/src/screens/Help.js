import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, StyleSheet } from 'react-native';
import { Icon } from '../icons';
import { C } from '../theme';
import { Header, Button3D, hap } from '../ui';
import { versionLabel } from '../version';
import { useT } from '../i18n';

// Datos de contacto oficiales del equipo Orden Global. El formato de
// WhatsApp es internacional sin "+" y sin espacios.
const SUPPORT = {
  whatsappNumber: '50432136457',
  email: 'j.ordonez@ordenglobal.org',
};

// Ayuda dentro de la app: FAQ estático + contactos. Reduce carga de soporte
// y es requisito del listing en App Store / Play Store (URL o pantalla de
// "contact us" accesible desde la app).
export default function Help({ nav }) {
  const t = useT();
  const [open, setOpen] = useState(0); // primera pregunta abierta por defecto

  const preguntas = [
    { k: 'q1', t: t('help.q1t'), body: t('help.q1p') },
    { k: 'q2', t: t('help.q2t'), body: t('help.q2p') },
    { k: 'q3', t: t('help.q3t'), body: t('help.q3p') },
    { k: 'q4', t: t('help.q4t'), body: t('help.q4p') },
    { k: 'q5', t: t('help.q5t'), body: t('help.q5p') },
    { k: 'q6', t: t('help.q6t'), body: t('help.q6p') },
    { k: 'q7', t: t('help.q7t'), body: t('help.q7p') },
  ];

  const abrirWhatsApp = async () => {
    hap();
    const contexto = encodeURIComponent(t('help.waCtx', { v: versionLabel() }));
    const url = `https://wa.me/${SUPPORT.whatsappNumber}?text=${contexto}`;
    try { await Linking.openURL(url); } catch (e) {}
  };
  const abrirCorreo = async () => {
    hap();
    const asunto = encodeURIComponent(t('help.mailSubject'));
    const cuerpo = encodeURIComponent(t('help.mailBody', { v: versionLabel() }));
    const url = `mailto:${SUPPORT.email}?subject=${asunto}&body=${cuerpo}`;
    try { await Linking.openURL(url); } catch (e) {}
  };

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('help.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
        <View style={st.hero}>
          <View style={st.heroIc}><Icon name="help-buoy" size={22} color={C.gold} /></View>
          <View style={{ flex: 1 }}>
            <Text style={st.heroT}>{t('help.heroT')}</Text>
            <Text style={st.heroP}>{t('help.heroP')}</Text>
          </View>
        </View>

        <Text style={st.grp}>{t('help.faqGrp')}</Text>
        {preguntas.map((q, i) => {
          const isOpen = open === i;
          return (
            <Pressable
              key={q.k}
              onPress={() => { hap(); setOpen(isOpen ? -1 : i); }}
              accessibilityRole="button"
              accessibilityLabel={q.t}
              style={[st.card, isOpen && st.cardOpen]}>
              <View style={st.qRow}>
                <Text style={[st.qT, isOpen && { color: C.gold }]}>{q.t}</Text>
                <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color={isOpen ? C.gold : C.txt3} />
              </View>
              {isOpen && <Text style={st.qBody}>{q.body}</Text>}
            </Pressable>
          );
        })}

        <Text style={st.grp}>{t('help.contactGrp')}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button3D title={t('help.whatsapp')} icon="chatbubbles" onPress={abrirWhatsApp} style={{ flex: 1 }} />
          <Button3D title={t('help.email')} icon="mail" variant="teal" onPress={abrirCorreo} style={{ flex: 1 }} />
        </View>
        <Text style={st.foot}>{t('help.foot')}</Text>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  hero: { flexDirection: 'row', gap: 13, alignItems: 'flex-start', backgroundColor: 'rgba(201,169,97,0.10)', borderWidth: 1, borderColor: 'rgba(201,169,97,0.38)', borderRadius: 18, padding: 15, marginBottom: 8 },
  heroIc: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(201,169,97,0.16)', alignItems: 'center', justifyContent: 'center' },
  heroT: { color: C.txt, fontWeight: '800', fontSize: 15, marginBottom: 4 },
  heroP: { color: C.txt2, fontSize: 12.5, lineHeight: 18 },
  grp: { fontSize: 11, letterSpacing: 2, color: C.txt3, fontWeight: '700', marginTop: 22, marginBottom: 10 },
  card: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 15, marginBottom: 9 },
  cardOpen: { borderColor: 'rgba(201,169,97,0.4)', backgroundColor: 'rgba(201,169,97,0.06)' },
  qRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  qT: { flex: 1, color: C.txt, fontWeight: '700', fontSize: 14 },
  qBody: { color: C.txt2, fontSize: 13, lineHeight: 19, marginTop: 10 },
  foot: { color: C.txt3, fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginTop: 20 },
});
