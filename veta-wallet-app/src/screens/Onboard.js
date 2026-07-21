import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { C, G } from '../theme';
import { Header, Button3D, Card, hap, useToast } from '../ui';
import { WALLET_SEED } from '../data';

// ---------------- KYC (simulado) ----------------
export function Kyc({ nav }) {
  const [step, setStep] = useState(0); // 0 form, 1 verifying, 2 done
  const [msg, setMsg] = useState('Analizando documentos…');
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (step === 1) {
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true })).start();
      const msgs = ['Analizando documentos…', 'Comparando rostro…', 'Validando prueba de vida…', 'Registrando en Orden Global…'];
      let i = 0;
      const t = setInterval(() => { i++; if (i < msgs.length) setMsg(msgs[i]); else { clearInterval(t); setStep(2); } }, 1000);
      return () => clearInterval(t);
    }
  }, [step]);
  const rot = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  if (step === 1)
    return (
      <View style={styles.center}>
        <Animated.View style={[styles.spinner, { transform: [{ rotate: rot }] }]} />
        <Text style={styles.bigTitle}>Verificando identidad</Text>
        <Text style={styles.dim}>{msg}</Text>
      </View>
    );
  if (step === 2)
    return (
      <View style={styles.center}>
        <View style={styles.checkBadge}><Ionicons name="checkmark" size={52} color={C.up} /></View>
        <Text style={styles.bigTitle}>Identidad verificada</Text>
        <Text style={[styles.dim, { marginBottom: 26 }]}>Bienvenido a Orden Global, José</Text>
        <Button3D title="Crear mi billetera" onPress={() => nav.go('seed')} style={{ width: 240 }} />
      </View>
    );

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Verificación KYC" sub="Requerido para proteger tu cuenta" onBack={() => nav.go('auth')} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <View style={styles.kycIcon}><Ionicons name="shield-checkmark" size={34} color={C.gold} /></View>
        <Text style={[styles.bigTitle, { fontSize: 20 }]}>Verifica tu identidad</Text>
        <Text style={[styles.dim, { textAlign: 'center', marginBottom: 18 }]}>Simulado — sin backend. Toca para completar los 3 pasos.</Text>
        {['Datos personales', 'Documento (frente y reverso)', 'Selfie · prueba de vida'].map((s, i) => (
          <Card key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10, padding: 14 }}>
            <View style={styles.stepNo}><Text style={{ color: C.gold, fontWeight: '800' }}>{i + 1}</Text></View>
            <Text style={{ color: C.txt, fontWeight: '600', flex: 1 }}>{s}</Text>
            <Ionicons name="checkmark-circle" size={20} color={C.up} />
          </Card>
        ))}
        <Button3D title="Iniciar verificación" onPress={() => setStep(1)} style={{ marginTop: 12 }} />
      </ScrollView>
    </View>
  );
}

// ---------------- Frase semilla (crear) ----------------
export function Seed({ nav }) {
  const [revealed, setRevealed] = useState(false);
  const [ack, setAck] = useState(false);
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Frase de recuperación" onBack={() => nav.go('kyc')} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <View style={styles.kycIcon}><Ionicons name="lock-closed" size={32} color={C.gold} /></View>
        <Text style={[styles.bigTitle, { fontSize: 20 }]}>Tu llave maestra</Text>
        <Text style={[styles.dim, { textAlign: 'center', marginBottom: 16 }]}>Estas 12 palabras son la única forma de recuperar tu billetera. Guárdalas en orden y en un lugar seguro.</Text>
        <View style={styles.warn}>
          <Ionicons name="warning" size={20} color={C.down} />
          <Text style={styles.warnTxt}>Nunca compartas tu frase. Veta jamás te la pedirá.</Text>
        </View>
        <SeedGrid revealed={revealed} onReveal={() => { hap(); setRevealed(true); }} />
        <Pressable onPress={() => { hap(); setAck(!ack); }} style={styles.ackRow}>
          <View style={[styles.checkbox, ack && { backgroundColor: C.gold, borderColor: C.gold }]}>{ack && <Ionicons name="checkmark" size={14} color={C.darkText} />}</View>
          <Text style={styles.ackTxt}>Ya guardé mi frase en un lugar seguro.</Text>
        </Pressable>
        <Button3D title="Continuar a mi billetera" disabled={!revealed || !ack} onPress={() => nav.go('home')} />
      </ScrollView>
    </View>
  );
}

// ---------------- Frase semilla (ver desde el menú) ----------------
export function SeedView({ nav }) {
  const [revealed, setRevealed] = useState(false);
  const toast = useToast();
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Frase de recuperación" onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <View style={styles.warn}>
          <Ionicons name="warning" size={20} color={C.down} />
          <Text style={styles.warnTxt}>Cualquiera con estas 12 palabras controla tus fondos. No hagas capturas de pantalla.</Text>
        </View>
        <SeedGrid revealed={revealed} onReveal={() => { hap(); setRevealed(true); }} />
        <Button3D variant="ghost" title="Copiar frase" icon="copy" onPress={() => { hap(); toast('Frase copiada'); }} />
      </ScrollView>
    </View>
  );
}

function SeedGrid({ revealed, onReveal }) {
  return (
    <View style={{ position: 'relative', marginBottom: 18 }}>
      <View style={styles.grid}>
        {WALLET_SEED.map((w, i) => (
          <View key={i} style={styles.cell}>
            <Text style={styles.cellNo}>{i + 1}</Text>
            <Text style={styles.cellWord}>{revealed ? w : '••••••'}</Text>
          </View>
        ))}
      </View>
      {!revealed && (
        <Pressable onPress={onReveal} style={styles.revealOverlay}>
          <Ionicons name="eye" size={30} color={C.gold} />
          <Text style={{ color: C.txt2, fontWeight: '600', marginTop: 8 }}>Toca para revelar tu frase</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 34 },
  spinner: { width: 90, height: 90, borderRadius: 45, borderWidth: 5, borderColor: 'rgba(201,169,97,0.18)', borderTopColor: C.gold, marginBottom: 26 },
  checkBadge: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(62,217,160,0.12)', borderWidth: 2, borderColor: C.up, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  bigTitle: { fontSize: 22, fontWeight: '800', color: C.txt, marginBottom: 8, textAlign: 'center' },
  dim: { color: C.txt2, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  kycIcon: { width: 76, height: 76, borderRadius: 22, backgroundColor: '#0A3A3D', borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
  stepNo: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(201,169,97,0.14)', alignItems: 'center', justifyContent: 'center' },
  warn: { flexDirection: 'row', gap: 12, backgroundColor: 'rgba(240,119,107,0.08)', borderWidth: 1, borderColor: 'rgba(240,119,107,0.3)', borderRadius: 16, padding: 14, marginBottom: 18, alignItems: 'center' },
  warnTxt: { color: '#f4b4ac', fontSize: 12.5, flex: 1, lineHeight: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cell: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.input, borderWidth: 1, borderColor: C.line2, borderRadius: 13, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10 },
  cellNo: { color: C.gold, fontSize: 12, opacity: 0.7, width: 16, textAlign: 'right' },
  cellWord: { color: C.txt, fontSize: 14, fontWeight: '500' },
  revealOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(4,26,27,0.55)', borderRadius: 14 },
  ackRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  ackTxt: { color: C.txt2, fontSize: 13, flex: 1 },
});
