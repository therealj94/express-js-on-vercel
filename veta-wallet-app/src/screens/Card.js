import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { C, G } from '../theme';
import { Logo, Button3D, ListRow, Toggle, SectionHead, useToast, hap } from '../ui';
import { TXNS } from '../data';

export default function CardScreen({ nav }) {
  const rot = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const toast = useToast();

  const flip = () => {
    hap();
    const to = flipped ? 0 : 1;
    Animated.spring(rot, { toValue: to, useNativeDriver: true, friction: 8, tension: 10 }).start();
    setFlipped(!flipped);
  };
  const frontRot = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRot = rot.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <View style={styles.top}>
        <Pressable onPress={() => nav.go('home')} style={styles.iconBtn}><Ionicons name="chevron-back" size={20} color={C.txt} /></Pressable>
        <Text style={styles.title}>Tarjeta débito</Text>
        <Pressable onPress={() => nav.go('activity')} style={styles.iconBtn}><Ionicons name="time-outline" size={20} color={C.txt} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={flip} style={{ height: 210 }}>
          <Animated.View style={[styles.face, { transform: [{ perspective: 1000 }, { rotateY: frontRot }] }]}>
            <LinearGradient colors={G.greenCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardBg}>
              <Waves />
              <View style={styles.cardIn}>
                <View style={styles.cardTop}><Logo size={42} /><Text style={styles.visa}>VISA</Text></View>
                <LinearGradient colors={['#F8EFCF', '#C9A961', '#96793F']} style={styles.chip} />
                <Text style={styles.cardNum}>4821  5530  9012  7760</Text>
                <View style={styles.cardBot}>
                  <View><Text style={styles.k}>TITULAR</Text><Text style={styles.v}>JOSÉ ENAMORADO</Text></View>
                  <View><Text style={[styles.k, { textAlign: 'right' }]}>DÉBITO · ORDEN GLOBAL</Text><Text style={[styles.v, { textAlign: 'right' }]}>Vence 12/29</Text></View>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          <Animated.View style={[styles.face, styles.faceBack, { transform: [{ perspective: 1000 }, { rotateY: backRot }] }]}>
            <LinearGradient colors={['#0B4A42', '#052824']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardBg}>
              <View style={styles.magstripe} />
              <View style={styles.sig} />
              <View style={styles.cvvBox}><Text style={styles.cvv}>742</Text></View>
              <View style={styles.backFoot}>
                <Text style={styles.backTxt}>Veta Wallet · Orden Global{'\n'}Servicio: roa.corphn@gmail.com</Text>
                <Text style={styles.visa}>VISA</Text>
              </View>
            </LinearGradient>
          </Animated.View>
        </Pressable>

        <View style={styles.hint}><Ionicons name="sync" size={13} color={C.txt3} /><Text style={styles.hintTxt}>Toca la tarjeta para ver el reverso y el CVV</Text></View>

        <LinearGradient colors={G.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avail}>
          <View>
            <Text style={styles.availLbl}>DISPONIBLE PARA GASTAR</Text>
            <Text style={styles.availAmt}>$2,000.00</Text>
          </View>
          <View style={{ width: 130 }}><Button3D title="Recargar" onPress={() => nav.go('remit')} /></View>
        </LinearGradient>

        <View style={styles.group}>
          <ListRow first icon="eye" title="Ver datos de tarjeta" sub="Número, CVV y vencimiento" onPress={() => toast('Datos visibles por 30s')} />
          <ListRow icon="snow" title="Congelar tarjeta" sub="Bloqueo temporal instantáneo" onPress={() => {}} right={<Toggle value={frozen} onValueChange={(v) => { setFrozen(v); toast(v ? 'Tarjeta congelada' : 'Tarjeta activa'); }} />} />
          <ListRow icon="keypad" title="Cambiar PIN" sub="Actualiza tu PIN de 4 dígitos" onPress={() => toast('Cambiar PIN')} />
          <ListRow icon="options" title="Límites de gasto" sub="ATM, compras y online" onPress={() => toast('Límites')} right={<Text style={{ color: C.gold, fontWeight: '600' }}>$5,000/día</Text>} />
        </View>

        <SectionHead title="Movimientos" action="Ver todo" onAction={() => nav.go('activity')} />
        {TXNS.filter((x) => x.kind === 'card').slice(0, 5).map((x, i) => (
          <View key={i} style={styles.txn}>
            <View style={styles.txnIc}><Ionicons name={x.ic} size={19} color={C.gold} /></View>
            <View style={{ flex: 1 }}><Text style={styles.txnT}>{x.t}</Text><Text style={styles.txnD}>{x.d}</Text></View>
            <Text style={[styles.txnV, x.pos && { color: C.up }]}>{x.v}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Waves() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 320 200" preserveAspectRatio="none">
      {[132, 147, 162, 117].map((y, i) => (
        <Path key={i} d={`M-20 ${y} Q 80 ${y - 40} 160 ${y - 10} T 340 ${y - 20}`} stroke="rgba(201,169,97,0.4)" strokeWidth={1.3} fill="none" />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingBottom: 14, paddingTop: 4 },
  iconBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 19, fontWeight: '800', color: C.txt },
  face: { position: 'absolute', top: 0, left: 0, right: 0, height: 210, borderRadius: 22, backfaceVisibility: 'hidden' },
  faceBack: { },
  cardBg: { flex: 1, borderRadius: 22, overflow: 'hidden' },
  cardIn: { flex: 1, padding: 20, justifyContent: 'space-between' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  visa: { fontSize: 22, fontWeight: '800', fontStyle: 'italic', color: '#F3ECD9' },
  chip: { width: 44, height: 34, borderRadius: 7 },
  cardNum: { fontSize: 19, letterSpacing: 2, color: '#F3ECD9', fontWeight: '600' },
  cardBot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  k: { fontSize: 8, letterSpacing: 1.2, color: 'rgba(243,236,217,0.6)' },
  v: { fontSize: 12.5, color: '#F3ECD9', fontWeight: '600', marginTop: 3 },
  magstripe: { position: 'absolute', top: 22, left: 0, right: 0, height: 42, backgroundColor: '#04211d' },
  sig: { position: 'absolute', top: 80, left: 21, right: 70, height: 28, backgroundColor: '#e8e0cf', borderRadius: 4 },
  cvvBox: { position: 'absolute', top: 82, right: 21, backgroundColor: '#e8e0cf', borderRadius: 5, paddingHorizontal: 12, paddingVertical: 5 },
  cvv: { color: '#1a1a1a', fontWeight: '700', letterSpacing: 1 },
  backFoot: { position: 'absolute', bottom: 16, left: 21, right: 21, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  backTxt: { fontSize: 9, color: 'rgba(243,236,217,0.6)', lineHeight: 13 },
  hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, marginBottom: 16 },
  hintTxt: { fontSize: 11, color: C.txt3 },
  avail: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 22, padding: 18, borderWidth: 1, borderColor: C.line, marginBottom: 16 },
  availLbl: { fontSize: 10, letterSpacing: 2, color: C.gold, fontWeight: '600' },
  availAmt: { fontSize: 27, fontWeight: '800', color: C.goldHi, marginTop: 4 },
  group: { backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 18, overflow: 'hidden', marginBottom: 6 },
  txn: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 11 },
  txnIc: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' },
  txnT: { fontSize: 14, fontWeight: '600', color: C.txt },
  txnD: { fontSize: 11.5, color: C.txt3, marginTop: 2 },
  txnV: { fontSize: 14, fontWeight: '600', color: C.txt },
});
