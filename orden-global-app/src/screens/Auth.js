// La puerta. La MISMA fotografía de marca del login de Veta Wallet, la misma
// tarjeta de vidrio, la misma cuenta: quien ya entra a la wallet entra aquí
// sin pensar. Un solo login para todo el ecosistema — el SSO se encarga de
// que las apps de dentro ya te conozcan.
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, Image, ImageBackground, StyleSheet,
  KeyboardAvoidingView, Platform, Pressable, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '../theme';
import { useT, setIdioma } from '../i18n';
import { entrar } from '../api';
import { BotonOro, Entra } from '../ui';

export default function Auth({ alEntrar }) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [espera, setEspera] = useState(false);
  const [error, setError] = useState('');
  const tiembla = useRef(new Animated.Value(0)).current;

  const sacudir = () => {
    tiembla.setValue(0);
    Animated.sequence([8, -8, 5, -5, 0].map((v) =>
      Animated.timing(tiembla, { toValue: v, duration: 55, useNativeDriver: true }),
    )).start();
  };

  const intentar = async () => {
    if (!email.trim() || !clave || espera) return;
    setEspera(true); setError('');
    try {
      const cuenta = await entrar(email.trim(), clave);
      alEntrar(cuenta);
    } catch (e) {
      setError(t(e.code === 'auth' ? 'puerta.error.auth' : e.code === 'red' ? 'puerta.error.red' : 'puerta.error.servidor'));
      sacudir();
    } finally { setEspera(false); }
  };

  return (
    <ImageBackground source={require('../../assets/fondo-marca.jpg')} style={{ flex: 1 }} resizeMode="cover">
      <LinearGradient
        colors={['rgba(2,27,28,0.55)', 'rgba(2,27,28,0.82)', 'rgba(1,13,14,0.96)']}
        style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.todo}>
          <View style={s.idiomas}>
            {['es', 'en'].map((x) => (
              <Pressable key={x} onPress={() => setIdioma(x)} hitSlop={8}>
                <Text style={[s.idi, t.idioma === x && s.idiOn]}>{x.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
          <Entra style={s.cabeza}>
            <Image source={require('../../assets/og.png')} style={s.logo} resizeMode="contain" />
            <Text style={s.marca}>ORDEN GLOBAL</Text>
            <Text style={s.lema}>{t('puerta.lema')}</Text>
          </Entra>
          <Entra delay={140}>
            <Animated.View style={[s.vidrio, { transform: [{ translateX: tiembla }] }]}>
              <TextInput
                value={email} onChangeText={setEmail} placeholder={t('puerta.correo')}
                placeholderTextColor={C.txt3} style={s.input} autoCapitalize="none"
                keyboardType="email-address" autoComplete="email"
              />
              <TextInput
                value={clave} onChangeText={setClave} placeholder={t('puerta.clave')}
                placeholderTextColor={C.txt3} style={s.input} secureTextEntry
                onSubmitEditing={intentar}
              />
              {!!error && <Text style={s.error}>{error}</Text>}
              <BotonOro onPress={intentar}>{espera ? t('puerta.entrando') : t('puerta.entrar')}</BotonOro>
              <Text style={s.nota}>{t('puerta.nota')}</Text>
            </Animated.View>
          </Entra>
        </KeyboardAvoidingView>
      </LinearGradient>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  todo: { flex: 1, justifyContent: 'center', padding: 24 },
  idiomas: { position: 'absolute', top: 56, right: 26, flexDirection: 'row', gap: 14, zIndex: 2 },
  idi: { color: 'rgba(243,236,217,0.55)', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  idiOn: { color: C.gold },
  cabeza: { alignItems: 'center', marginBottom: 30 },
  logo: { width: 132, height: 92 },
  marca: { color: C.txt, fontSize: 13, letterSpacing: 6, marginTop: 10, fontWeight: '600' },
  lema: { color: C.txt2, fontSize: 13, marginTop: 6, letterSpacing: 0.3 },
  vidrio: {
    backgroundColor: 'rgba(4,30,32,0.72)', borderWidth: 1, borderColor: C.line2,
    borderRadius: 22, padding: 20,
  },
  input: {
    backgroundColor: 'rgba(8,44,46,0.85)', borderWidth: 1, borderColor: 'rgba(46,116,119,0.7)',
    borderRadius: 13, paddingHorizontal: 15, paddingVertical: 13, color: C.txt, fontSize: 15, marginBottom: 10,
  },
  error: { color: C.down, fontSize: 12.5, marginBottom: 10 },
  nota: { color: C.txt3, fontSize: 11.5, marginTop: 13, textAlign: 'center' },
});
