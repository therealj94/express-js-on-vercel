import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../icons';
import { C, G } from '../theme';
import { Header, Button3D, hap, useAccount, useToast } from '../ui';
import { money, tokensFromBalances } from '../data';
import { fetchRates, STATIC_RATES } from '../fx';
import { useT, useLang } from '../i18n';

// Comisión fija de Veta Wallet por remesa. Se le resta al monto en USD
// antes de convertir a moneda local — así el simulador muestra lo que
// realmente le llega al destinatario, no el bruto.
const REMESA_FEE_USD = 1;

// Países soportados con moneda local. La tasa live viene de fx.js
// (open.er-api.com); estas cifras solo se usan si el feed no responde.
const COUNTRIES = [
  { code: 'HN', name: 'Honduras',       flag: '🇭🇳', ccy: 'HNL' },
  { code: 'SV', name: 'El Salvador',    flag: '🇸🇻', ccy: 'USD' },
  { code: 'GT', name: 'Guatemala',      flag: '🇬🇹', ccy: 'GTQ' },
  { code: 'NI', name: 'Nicaragua',      flag: '🇳🇮', ccy: 'NIO' },
  { code: 'CR', name: 'Costa Rica',     flag: '🇨🇷', ccy: 'CRC' },
  { code: 'PA', name: 'Panamá',         flag: '🇵🇦', ccy: 'USD' },
  { code: 'MX', name: 'México',         flag: '🇲🇽', ccy: 'MXN' },
  { code: 'CO', name: 'Colombia',       flag: '🇨🇴', ccy: 'COP' },
  { code: 'US', name: 'Estados Unidos', flag: '🇺🇸', ccy: 'USD' },
];

const fmtLocal = (v, ccy) => {
  const n = Number(v) || 0;
  if (n === 0) return '—';
  const s = n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 });
  return `${s} ${ccy}`;
};

// Formato bonito para la marca de tiempo del feed (dd/mm HH:mm en local).
function fmtStamp(iso, lang) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d)) return null;
    const locale = lang === 'en' ? 'en-US' : 'es-HN';
    return d.toLocaleDateString(locale, { day: '2-digit', month: 'short' })
      + ' · ' + d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return null; }
}

// Pantalla Remesas: página de aterrizaje bien diseñada + tabla de países
// + selector rápido de monto + botón que lanza el flujo Enviar reutilizando
// el link de pagos que ya existe. La idea es que la persona en el otro
// país reciba un link vetawallet://pay?... y al abrirlo caiga en Enviar
// (si tiene la app) o en la página de descarga (todavía no publicada, pero
// el link ya está listo para el día que sí).
export default function Remesas({ nav }) {
  const t = useT();
  const { lang } = useLang();
  const { account } = useAccount();
  const toast = useToast();
  const [usd, setUsd] = useState('100');
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [rates, setRates] = useState(STATIC_RATES);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [source, setSource] = useState('static');
  const [refreshing, setRefreshing] = useState(true);

  const amount = Number(usd) || 0;
  const netUsd = Math.max(0, amount - REMESA_FEE_USD);
  const rate = rates?.[country.ccy] ?? STATIC_RATES[country.ccy] ?? 1;
  const llegaLocal = netUsd * rate;

  // Precio de ORIGEN, para convertir el monto del simulador (que está en
  // DÓLARES) a la cantidad de token que Enviar espera recibir.
  const origen = tokensFromBalances(account?.balances || []).find((x) => x.s === 'ORIGEN');
  const origenPrice = origen?.hasPrice ? origen.price : 0;

  // Feed de tasas: al montar y cada vez que se enfoca la pantalla.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await fetchRates();
      if (!vivo) return;
      if (r?.rates) setRates(r.rates);
      setUpdatedAt(r?.updatedAt || null);
      setSource(r?.source || 'static');
      setRefreshing(false);
    })();
    return () => { vivo = false; };
  }, []);

  const refrescar = async () => {
    hap(); setRefreshing(true);
    const r = await fetchRates(true);
    if (r?.rates) setRates(r.rates);
    setUpdatedAt(r?.updatedAt || null);
    setSource(r?.source || 'static');
    setRefreshing(false);
  };

  const irEnviar = () => {
    hap();
    if (!(amount > 0)) { toast(t('rem.errAmt'), 'error'); return; }
    // Este simulador trabaja en DÓLARES; Enviar trabaja en ORIGEN. Antes se
    // pasaba el monto sin convertir, así que "mandar $100" llegaba a Enviar
    // como 100 ORIGEN — más del doble en valor. Sin precio no se puede
    // convertir, y mandar un número ambiguo es peor que no navegar.
    if (!(origenPrice > 0)) { toast(t('rem.errNoPrice'), 'error'); return; }
    // Se sigue enviando el monto BRUTO (con la comisión incluida), igual que
    // antes; lo que cambia es que ahora va en la unidad correcta.
    const qty = amount / origenPrice;
    nav.go('send', { amount: qty.toFixed(6), fiatUsd: amount });
  };
  const solicitar = () => {
    hap();
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
              <Text style={st.resultK}>{t('rem.resEnvias')}</Text>
              <Text style={st.resultVsm}>{money(amount)}</Text>
            </View>
            <View style={st.resultRow}>
              <Text style={st.resultK}>{t('rem.resFee')}</Text>
              <Text style={[st.resultVsm, { color: C.txt3 }]}>− {money(REMESA_FEE_USD)}</Text>
            </View>
            <View style={st.resultDivider} />
            <View style={st.resultRow}>
              <Text style={st.resultKbig}>{t('rem.resTo', { country: country.name })}</Text>
              <Text style={st.resultV}>{fmtLocal(llegaLocal, country.ccy)}</Text>
            </View>
            <View style={st.resultRow}>
              <Text style={st.resultK}>{t('rem.resRate')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[st.liveDot, { backgroundColor: source === 'live' ? C.up : source === 'cache' ? C.gold : C.down }]} />
                <Text style={st.resultVsm}>1 USD ≈ {country.ccy === 'USD' ? '1' : rate.toLocaleString('en-US', { maximumFractionDigits: rate >= 100 ? 0 : 2 })} {country.ccy}</Text>
              </View>
            </View>
          </View>

          {/* Marca de tiempo del feed y botón de actualizar manual. */}
          <Pressable onPress={refrescar} disabled={refreshing} style={st.rateFoot} accessibilityRole="button" accessibilityLabel={t('rem.updateNow')}>
            <Icon name="refresh" size={14} color={C.gold} />
            <Text style={st.rateFootTxt}>
              {refreshing
                ? t('rem.updating')
                : source === 'live'
                  ? t('rem.livePrefix') + (fmtStamp(updatedAt, lang) ? ' · ' + fmtStamp(updatedAt, lang) : '')
                  : source === 'cache'
                    ? t('rem.cachePrefix') + (fmtStamp(updatedAt, lang) ? ' · ' + fmtStamp(updatedAt, lang) : '')
                    : t('rem.staticPrefix')}
            </Text>
          </Pressable>

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
  resultKbig: { color: C.txt, fontSize: 13, fontWeight: '700' },
  resultV: { color: C.gold, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  resultVsm: { color: C.txt2, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  resultDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  rateFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 4 },
  rateFootTxt: { color: C.gold, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  disclaimer: { color: C.txt3, fontSize: 10.5, lineHeight: 15, marginTop: 6, paddingHorizontal: 2 },

  stepsCard: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingHorizontal: 18 },
  step: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  stepN: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(201,169,97,0.15)', borderWidth: 1, borderColor: 'rgba(201,169,97,0.4)', alignItems: 'center', justifyContent: 'center' },
  stepNT: { color: C.gold, fontWeight: '800', fontSize: 14 },
  stepT: { color: C.txt, fontWeight: '700', fontSize: 14 },
  stepP: { color: C.txt2, fontSize: 12.5, lineHeight: 18, marginTop: 3 },

  foot: { color: C.txt3, fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginTop: 22, paddingHorizontal: 12 },
});
