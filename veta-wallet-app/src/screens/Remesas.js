import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../icons';
import { C, G } from '../theme';
import { Header, Button3D, hap, useAccount } from '../ui';
import { money } from '../data';
import { useT } from '../i18n';

// Países soportados con moneda local y tasa aproximada de USD → local.
// Los tipos de cambio se muestran como referencia informativa: no se usan
// para pactar ningún envío. Cuando conectemos el backend con un feed real
// (Fixer.io o similar) se reemplazan por vivos.
const COUNTRIES = [
  { code: 'HN', name: 'Honduras',       flag: '🇭🇳', ccy: 'HNL', rate: 24.60 },
  { code: 'SV', name: 'El Salvador',    flag: '🇸🇻', ccy: 'USD', rate: 1 },
  { code: 'GT', name: 'Guatemala',      flag: '🇬🇹', ccy: 'GTQ', rate: 7.75 },
  { code: 'NI', name: 'Nicaragua',      flag: '🇳🇮', ccy: 'NIO', rate: 36.80 },
  { code: 'CR', name: 'Costa Rica',     flag: '🇨🇷', ccy: 'CRC', rate: 525 },
  { code: 'PA', name: 'Panamá',         flag: '🇵🇦', ccy: 'USD', rate: 1 },
  { code: 'MX', name: 'México',         flag: '🇲🇽', ccy: 'MXN', rate: 17.50 },
  { code: 'CO', name: 'Colombia',       flag: '🇨🇴', ccy: 'COP', rate: 4200 },
  { code: 'US', name: 'Estados Unidos', flag: '🇺🇸', ccy: 'USD', rate: 1 },
];

const fmtLocal = (v, ccy) => {
  const n = Number(v) || 0;
  if (n === 0) return '—';
  const s = n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 });
  return `${s} ${ccy}`;
};

// Pantalla Remesas: página de aterrizaje bien diseñada + tabla de países
// + selector rápido de monto + botón que lanza el flujo Enviar reutilizando
// el link de pagos que ya existe. La idea es que la persona en el otro
// país reciba un link vetawallet://pay?... y al abrirlo caiga en Enviar
// (si tiene la app) o en la página de descarga (todavía no publicada, pero
// el link ya está listo para el día que sí).
export default function Remesas({ nav }) {
  const t = useT();
  const { account } = useAccount();
  const [usd, setUsd] = useState('100');
  const [country, setCountry] = useState(COUNTRIES[0]);
  const amount = Number(usd) || 0;

  const irEnviar = () => {
    hap();
    // Salta a Enviar con el monto pre-relleno. El destinatario lo pega el
    // usuario en la pantalla (o escanea el QR de quien va a recibir).
    nav.go('send', { amount: amount > 0 ? String(amount) : undefined });
  };
  const solicitar = () => {
    hap();
    // Alterna: si soy quien VA A RECIBIR, genero un link/QR desde Recibir.
    // Recibir ya soporta "solicitud de pago" — se abre allí para ese caso.
    nav.go('receive');
  };

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('rem.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>

        {/* HERO */}
        <LinearGradient colors={['#0f5f55', '#0a3a3d', '#06282b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.hero}>
          <View style={st.heroPlane}>
            <Icon name="paper-plane" size={30} color={C.gold} />
          </View>
          <Text style={st.heroT}>{t('rem.heroT')}</Text>
          <Text style={st.heroP}>{t('rem.heroP')}</Text>
        </LinearGradient>

        {/* BENEFICIOS · tres pilares que separan cripto de banco/Western Union */}
        <View style={st.benefits}>
          <Benefit icon="time" title={t('rem.b1t')} body={t('rem.b1p')} />
          <Benefit icon="trending-up" title={t('rem.b2t')} body={t('rem.b2p')} />
          <Benefit icon="shield-checkmark" title={t('rem.b3t')} body={t('rem.b3p')} />
        </View>

        {/* SIMULADOR · cuánto llega en la moneda del destino */}
        <Text style={st.grp}>{t('rem.simGrp')}</Text>
        <View style={st.simCard}>
          <Text style={st.label}>{t('rem.amountLbl')}</Text>
          <View style={st.amtRow}>
            <View style={st.amtBig}>
              <Text style={st.dollar}>$</Text>
              <Text style={st.amt}>{amount || 0}</Text>
              <Text style={st.usd}>USD</Text>
            </View>
          </View>
          <View style={st.chipsRow}>
            {[25, 50, 100, 200, 500].map((v) => (
              <Pressable
                key={v}
                onPress={() => { hap(); setUsd(String(v)); }}
                accessibilityRole="button"
                accessibilityLabel={`${v} dólares`}
                style={[st.chip, amount === v && st.chipOn]}>
                <Text style={[st.chipTxt, amount === v && { color: C.darkText }]}>${v}</Text>
              </Pressable>
            ))}
          </View>

          <View style={st.divider} />

          <Text style={st.label}>{t('rem.countryLbl')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {COUNTRIES.map((c) => {
              const on = country.code === c.code;
              return (
                <Pressable
                  key={c.code}
                  onPress={() => { hap(); setCountry(c); }}
                  accessibilityRole="button"
                  accessibilityLabel={c.name}
                  style={[st.ctry, on && st.ctryOn]}>
                  <Text style={{ fontSize: 22, marginRight: 6 }}>{c.flag}</Text>
                  <Text style={[st.ctryTxt, on && { color: C.txt }]}>{c.ccy}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={st.result}>
            <View style={st.resultRow}>
              <Text style={st.resultK}>{t('rem.resTo', { country: country.name })}</Text>
              <Text style={st.resultV}>{fmtLocal(amount * country.rate, country.ccy)}</Text>
            </View>
            <View style={st.resultRow}>
              <Text style={st.resultK}>{t('rem.resRate')}</Text>
              <Text style={st.resultVsm}>1 USD ≈ {country.rate} {country.ccy}</Text>
            </View>
          </View>
          <Text style={st.disclaimer}>{t('rem.disclaimer')}</Text>
        </View>

        {/* ACCIONES */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <Button3D title={t('rem.sendCta')} icon="paper-plane" onPress={irEnviar} style={{ flex: 1.4 }} />
          <Button3D title={t('rem.requestCta')} icon="qr-code" variant="teal" onPress={solicitar} style={{ flex: 1 }} />
        </View>

        {/* CÓMO FUNCIONA · 3 pasos */}
        <Text style={st.grp}>{t('rem.howGrp')}</Text>
        <View style={st.stepsCard}>
          <Step n="1" t={t('rem.s1t')} p={t('rem.s1p')} />
          <Step n="2" t={t('rem.s2t')} p={t('rem.s2p')} />
          <Step n="3" t={t('rem.s3t')} p={t('rem.s3p')} last />
        </View>

        <Text style={st.foot}>{t('rem.foot')}</Text>
      </ScrollView>
    </View>
  );
}

function Benefit({ icon, title, body }) {
  return (
    <View style={st.benefit}>
      <View style={st.benefitIc}><Icon name={icon} size={20} color={C.gold} /></View>
      <Text style={st.benefitT}>{title}</Text>
      <Text style={st.benefitP} numberOfLines={2}>{body}</Text>
    </View>
  );
}

function Step({ n, t, p, last }) {
  return (
    <View style={[st.step, last && { borderBottomWidth: 0 }]}>
      <View style={st.stepN}><Text style={st.stepNT}>{n}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={st.stepT}>{t}</Text>
        <Text style={st.stepP}>{p}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  hero: { borderRadius: 24, padding: 24, borderWidth: 1, borderColor: 'rgba(201,169,97,0.35)', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  heroPlane: {
    width: 66, height: 66, borderRadius: 20,
    backgroundColor: 'rgba(201,169,97,0.16)',
    borderWidth: 1, borderColor: 'rgba(201,169,97,0.35)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  heroT: { color: C.txt, fontWeight: '800', fontSize: 22, textAlign: 'center', lineHeight: 28 },
  heroP: { color: C.txt2, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },

  benefits: { flexDirection: 'row', gap: 8, marginTop: 16 },
  benefit: { flex: 1, alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 12 },
  benefitIc: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  benefitT: { color: C.txt, fontWeight: '700', fontSize: 12, textAlign: 'center' },
  benefitP: { color: C.txt3, fontSize: 10.5, textAlign: 'center', marginTop: 4, lineHeight: 14 },

  grp: { fontSize: 11, letterSpacing: 2, color: C.txt3, fontWeight: '700', marginTop: 24, marginBottom: 10, paddingHorizontal: 2 },

  simCard: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 18 },
  label: { fontSize: 11, letterSpacing: 1.5, color: C.txt3, fontWeight: '700', marginBottom: 10 },
  amtRow: { alignItems: 'center', marginBottom: 12 },
  amtBig: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  dollar: { color: C.txt3, fontSize: 22, fontWeight: '700' },
  amt: { color: C.gold, fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  usd: { color: C.gold, fontSize: 14, fontWeight: '700', marginLeft: 4 },
  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  chip: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 11, borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2 },
  chipOn: { backgroundColor: C.gold, borderColor: C.gold },
  chipTxt: { color: C.txt2, fontWeight: '700', fontSize: 12.5 },

  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 16 },

  ctry: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2, marginRight: 8 },
  ctryOn: { backgroundColor: 'rgba(201,169,97,0.14)', borderColor: 'rgba(201,169,97,0.5)' },
  ctryTxt: { color: C.txt2, fontWeight: '700', fontSize: 12.5, letterSpacing: 0.5 },

  result: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, marginTop: 4 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 4 },
  resultK: { color: C.txt3, fontSize: 12.5 },
  resultV: { color: C.gold, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  resultVsm: { color: C.txt2, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  disclaimer: { color: C.txt3, fontSize: 10.5, lineHeight: 15, marginTop: 10, paddingHorizontal: 2 },

  stepsCard: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingHorizontal: 18 },
  step: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  stepN: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(201,169,97,0.15)', borderWidth: 1, borderColor: 'rgba(201,169,97,0.4)', alignItems: 'center', justifyContent: 'center' },
  stepNT: { color: C.gold, fontWeight: '800', fontSize: 14 },
  stepT: { color: C.txt, fontWeight: '700', fontSize: 14 },
  stepP: { color: C.txt2, fontSize: 12.5, lineHeight: 18, marginTop: 3 },

  foot: { color: C.txt3, fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginTop: 22, paddingHorizontal: 12 },
});
