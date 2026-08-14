// La puerta: la MISMA cuenta de Veta Wallet (mismo backend, /auth/login).
// Aquí no se crea una cuenta nueva ni un segundo login que mantener: si la
// wallet te conoce, Orden Global te conoce.
import React, { useState } from 'react';
import { View, Text, TextInput, Image, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from '../theme';
import { useT, setIdioma } from '../i18n';
import { entrar } from '../api';
import { BotonOro, Tarjeta, Entra } from '../ui';

export default function Auth({ alEntrar }) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [espera, setEspera] = useState(false);
  const [error, setError] = useState('');

  const intentar = async () => {
    if (!email.trim() || !clave || espera) return;
    setEspera(true); setError('');
    try {
      const cuenta = await entrar(email.trim(), clave);
      alEntrar(cuenta);
    } catch (e) {
      setError(t(e.code === 'auth' ? 'puerta.error.auth' : e.code === 'red' ? 'puerta.error.red' : 'puerta.error.servidor'));
    } finally { setEspera(false); }
  };

  return (
    <LinearGradient colors={G.pantalla} style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.todo}>
        <View style={s.idiomas}>
          {['es', 'en'].map((x) => (
            <Pressable key={x} onPress={() => setIdioma(x)}>
              <Text style={[s.idi, t.idioma === x && s.idiOn]}>{x.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
        <Entra style={s.cabeza}>
          <Image source={require('../../assets/og.png')} style={s.logo} resizeMode="contain" />
          <Text style={s.lema}>{t('puerta.lema')}</Text>
        </Entra>
        <Entra delay={120}>
          <Tarjeta>
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
          </Tarjeta>
        </Entra>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  todo: { flex: 1, justifyContent: 'center', padding: 22 },
  idiomas: { position: 'absolute', top: 54, right: 24, flexDirection: 'row', gap: 14 },
  idi: { color: C.txt3, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  idiOn: { color: C.gold },
  cabeza: { alignItems: 'center', marginBottom: 28 },
  logo: { width: 150, height: 104 },
  lema: { color: C.txt2, fontSize: 13, marginTop: 12, letterSpacing: 0.4 },
  input: { backgroundColor: C.input, borderWidth: 1, borderColor: 'rgba(46,116,119,0.7)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.txt, fontSize: 15, marginBottom: 10 },
  error: { color: C.down, fontSize: 12.5, marginBottom: 10 },
  nota: { color: C.txt3, fontSize: 11.5, marginTop: 12, textAlign: 'center' },
});
