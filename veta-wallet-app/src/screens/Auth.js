import React, { useState } from 'react';
import { View, Text, ImageBackground, Pressable, TextInput, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { Logo, Button3D, hap } from '../ui';

export default function Auth({ nav }) {
  const [tab, setTab] = useState('login');
  const [showPw, setShowPw] = useState(false);
  const login = tab === 'login';
  return (
    <ImageBackground source={require('../../assets/login-bg.jpg')} style={{ flex: 1 }} resizeMode="cover">
      <LinearGradient colors={['rgba(9,55,52,0.55)', 'rgba(3,20,21,0.82)']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 22 }}>
          <Logo size={92} />
          <Text style={styles.brand}>veta <Text style={styles.italic}>wallet</Text></Text>
          <Text style={styles.tag}>ORDEN GLOBAL</Text>
        </View>

        <BlurView intensity={38} tint="dark" style={styles.glass}>
          <View style={styles.glassInner}>
            <View style={styles.seg}>
              {['login', 'register'].map((k) => (
                <Pressable key={k} onPress={() => { hap(); setTab(k); }} style={[styles.segBtn, tab === k && styles.segOn]}>
                  <Text style={[styles.segTxt, tab === k && styles.segTxtOn]}>{k === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</Text>
                </Pressable>
              ))}
            </View>

            {!login && <Input label="Nombre completo" placeholder="José Enamorado" />}
            <Input label="Correo electrónico" placeholder="tu@correo.com" defaultValue={login ? 'jose@ordenglobal.com' : ''} keyboardType="email-address" autoCapitalize="none" />
            <View style={{ marginBottom: 6 }}>
              <Text style={styles.label}>Contraseña</Text>
              <View>
                <TextInput placeholderTextColor="#6f938f" secureTextEntry={!showPw} defaultValue={login ? 'veta1234' : ''} placeholder="••••••••" style={[styles.input, { paddingRight: 44 }]} />
                <Pressable onPress={() => setShowPw(!showPw)} style={styles.eye}>
                  <Ionicons name={showPw ? 'eye-off' : 'eye'} size={20} color={C.txt2} />
                </Pressable>
              </View>
            </View>

            {login ? (
              <Text style={styles.forgot}>¿Olvidaste tu contraseña?</Text>
            ) : (
              <Text style={styles.terms}>Al crear la cuenta aceptas los Términos y la Política de Privacidad.</Text>
            )}

            <Button3D title={login ? 'Ingresar' : 'Continuar a verificación'} onPress={() => nav.go(login ? 'home' : 'kyc')} style={{ marginTop: 8 }} />

            {login && (
              <>
                <View style={styles.divider}><View style={styles.dline} /><Text style={styles.dtxt}>o continúa con</Text><View style={styles.dline} /></View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Social icon="finger-print" label="Face ID" />
                  <Social icon="logo-apple" label="Apple" />
                </View>
              </>
            )}
          </View>
        </BlurView>
        <Text style={styles.foot}>Protegido por Orden Global Blockchain</Text>
      </ScrollView>
    </ImageBackground>
  );
}

function Input({ label, ...props }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#6f938f" style={styles.input} {...props} />
    </View>
  );
}
function Social({ icon, label }) {
  return (
    <Pressable onPress={hap} style={styles.social}>
      <Ionicons name={icon} size={17} color={C.gold} style={{ marginRight: 7 }} />
      <Text style={{ color: C.txt, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 22, paddingTop: 80 },
  brand: { fontSize: 26, fontWeight: '800', color: '#EAD79C', letterSpacing: 1, marginTop: 6 },
  italic: { fontWeight: '300', fontStyle: 'italic', color: '#C9A961' },
  tag: { color: 'rgba(243,236,217,0.7)', fontSize: 11, letterSpacing: 4, marginTop: 4 },
  glass: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(201,169,97,0.28)' },
  glassInner: { padding: 22, backgroundColor: 'rgba(10,52,54,0.35)' },
  seg: { flexDirection: 'row', backgroundColor: 'rgba(6,34,35,0.6)', borderRadius: 14, padding: 4, marginBottom: 18, borderWidth: 1, borderColor: 'rgba(46,116,119,0.4)' },
  segBtn: { flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center' },
  segOn: { backgroundColor: C.gold },
  segTxt: { color: C.txt2, fontWeight: '600', fontSize: 13.5 },
  segTxtOn: { color: C.darkText },
  label: { fontSize: 12, color: C.txt2, marginBottom: 7, fontWeight: '500' },
  input: { backgroundColor: 'rgba(12,58,59,0.75)', borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, color: C.txt, fontSize: 15 },
  eye: { position: 'absolute', right: 12, top: 12, padding: 2 },
  forgot: { color: C.gold, fontWeight: '600', fontSize: 13, textAlign: 'right', marginVertical: 14 },
  terms: { color: C.txt2, fontSize: 12, marginVertical: 14, lineHeight: 17 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  dline: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dtxt: { color: C.txt3, fontSize: 12 },
  social: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 13, paddingVertical: 12 },
  foot: { color: 'rgba(243,236,217,0.7)', fontSize: 12, textAlign: 'center', marginTop: 18 },
});
