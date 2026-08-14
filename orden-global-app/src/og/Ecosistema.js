// El hub de Orden Global: todo el ecosistema en una pantalla, y el asistente
// con su nombre --el que tú le pongas--. Cada ficha navega por el mapa, el
// mismo camino que usa el asistente y el escáner de QR.
import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, TextInput, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { C, G } from '../theme';
import { useLang } from '../i18n';
import { useAccount, hap } from '../ui';
import { nombreAsistente, ponerNombre } from './asistente';

const TXT = {
  es: {
    sub: 'Todo tu ecosistema, en un solo lugar.',
    billetera: 'Billetera', billeteraSub: 'tu dinero en la cadena',
    pay: 'MyTokenPay', paySub: 'tu negocio cobra en ORIGEN',
    cobrar: 'Cobrar con QR', cobrarSub: 'un código, un pago',
    gid: 'Genesis ID', gidSub: 'tu identidad verificada',
    chat: 'Chat', chatSub: 'gente real, con Genesis ID',
    asis: 'Tu asistente', asisSub: 'háblale en la barra de abajo',
    renombrar: 'Ponerle mi nombre', guardar: 'GUARDAR',
  },
  en: {
    sub: 'Your whole ecosystem, in one place.',
    billetera: 'Wallet', billeteraSub: 'your money on chain',
    pay: 'MyTokenPay', paySub: 'your business charges in ORIGEN',
    cobrar: 'Charge with QR', cobrarSub: 'one code, one payment',
    gid: 'Genesis ID', gidSub: 'your verified identity',
    chat: 'Chat', chatSub: 'real people, with Genesis ID',
    asis: 'Your assistant', asisSub: 'talk to it in the bar below',
    renombrar: 'Give it my name', guardar: 'SAVE',
  },
};

export default function Ecosistema({ nav }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const { account } = useAccount();
  const [nombre, setNombre] = useState(nombreAsistente());
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState('');
  useEffect(() => { setNombre(nombreAsistente()); }, []);

  const F = ({ icono, color, titulo, sub, a }) => (
    <Pressable style={st.ficha} onPress={() => { hap(); nav.go(a.p, a.params || {}); }}>
      <View style={[st.icono, { backgroundColor: color }]}>
        <Ionicons name={icono} size={21} color="#04211d" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.fTit}>{titulo}</Text>
        <Text style={st.fSub}>{sub}</Text>
      </View>
      <Text style={st.flecha}>›</Text>
    </Pressable>
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={st.dentro}>
      <View style={st.cab}>
        <Image source={require('../../assets/og-logo.png')} style={st.logo} resizeMode="contain" />
        <Text style={st.marca}>ORDEN GLOBAL</Text>
        <Text style={st.sub}>{t.sub}</Text>
      </View>

      <F icono="wallet" color="#EAD79C" titulo={t.billetera} sub={t.billeteraSub} a={{ p: 'home' }} />
      <F icono="storefront" color="#9FE3C9" titulo={t.pay} sub={t.paySub} a={{ p: 'mytokenpay' }} />
      <F icono="qr-code" color="#F8EFCF" titulo={t.cobrar} sub={t.cobrarSub} a={{ p: 'cobrar' }} />
      <F icono="finger-print" color="#BFD8F5" titulo={t.gid} sub={t.gidSub} a={{ p: account?.genesisUid ? 'passport' : 'kyc' }} />
      <F icono="chatbubbles" color="#F2C4B3" titulo={t.chat} sub={t.chatSub} a={{ p: 'chat' }} />

      {/* el asistente, con nombre propio */}
      <View style={st.asis}>
        <LinearGradient colors={G.gold} style={st.orbe} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={st.orbeTxt}>{nombre[0]}</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={st.fTit}>{nombre}</Text>
          <Text style={st.fSub}>{t.asisSub}</Text>
        </View>
        {!editando && (
          <Pressable onPress={() => { setBorrador(''); setEditando(true); }}>
            <Text style={st.renombrar}>✎ {t.renombrar}</Text>
          </Pressable>
        )}
      </View>
      {editando && (
        <View style={st.renFila}>
          <TextInput value={borrador} onChangeText={setBorrador} placeholder={nombre}
            placeholderTextColor={C.txt3} style={st.renInput} maxLength={16} autoFocus
            onSubmitEditing={async () => { setNombre(await ponerNombre(borrador)); setEditando(false); }} />
          <Pressable onPress={async () => { setNombre(await ponerNombre(borrador)); setEditando(false); }}>
            <LinearGradient colors={G.gold} style={st.renBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Text style={st.renBtnTxt}>{t.guardar}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  dentro: { padding: 18, paddingBottom: 26 },
  cab: { alignItems: 'center', marginBottom: 18, marginTop: 6 },
  logo: { width: 96, height: 66 },
  marca: { color: C.txt, fontSize: 13, letterSpacing: 5, marginTop: 8, fontWeight: '600' },
  sub: { color: C.txt3, fontSize: 12, marginTop: 4 },
  ficha: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 14, marginBottom: 10 },
  icono: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  fTit: { color: C.txt, fontSize: 14.5, fontWeight: '600' },
  fSub: { color: C.txt3, fontSize: 11.5 },
  flecha: { color: C.gold, fontSize: 22, fontWeight: '300' },
  asis: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14, marginTop: 6, backgroundColor: 'rgba(201,169,97,0.06)' },
  orbe: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  orbeTxt: { color: '#3A2C08', fontWeight: '900', fontSize: 17 },
  renombrar: { color: C.gold, fontSize: 11, letterSpacing: 0.4 },
  renFila: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  renInput: { flex: 1, backgroundColor: C.input, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, color: C.txt, fontSize: 15, letterSpacing: 1.5 },
  renBtn: { borderRadius: 12, paddingHorizontal: 15, paddingVertical: 11 },
  renBtnTxt: { color: '#3A2C08', fontWeight: '800', fontSize: 11, letterSpacing: 1 },
});
