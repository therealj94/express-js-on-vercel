import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Alert, StyleSheet } from 'react-native';
import { Icon } from '../icons';
import { C } from '../theme';
import { Header, Button3D, Skeleton, useToast, useAccount, hap } from '../ui';
import { listSessions } from '../sessionLog';
import { useT, useLang } from '../i18n';

const fmt = (ts, lang) => {
  if (!ts) return '—';
  const d = new Date(ts);
  const locale = lang === 'en' ? 'en-US' : 'es-HN';
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
};

// Sesiones locales del dispositivo: cuándo iniciaste sesión aquí, si sigue
// abierta y cuándo la cerraste. Es la base para el detalle remoto (IP,
// ciudad) que llegará con el backend.
export default function Sessions({ nav }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const { account, logout } = useAccount();
  const [items, setItems] = useState(null);

  const load = useCallback(() => {
    if (!account?.email) return;
    listSessions(account.email).then(setItems);
  }, [account?.email]);
  useEffect(load, [load]);

  const pedirCerrar = () => {
    hap();
    Alert.alert(
      t('sess.closeT'),
      t('sess.closeQ'),
      [
        { text: t('con.cancel'), style: 'cancel' },
        { text: t('sess.closeOk'), style: 'destructive', onPress: () => {
          logout(); nav.go('auth'); toast(t('sess.closed'), 'info');
        } },
      ],
    );
  };

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('sess.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 110 }}>
        <View style={st.hero}>
          <Icon name="shield-checkmark" size={22} color={C.gold} />
          <Text style={st.heroTxt}>{t('sess.hint')}</Text>
        </View>

        {items == null && [0, 1, 2].map((i) => (
          <View key={i} style={[st.card, { padding: 15, gap: 8 }]}>
            <Skeleton width={140} height={14} />
            <Skeleton width={200} height={11} />
            <Skeleton width={110} height={11} />
          </View>
        ))}

        {items != null && items.length === 0 && (
          <View style={st.empty}>
            <View style={st.emptyIc}><Icon name="time" size={28} color={C.txt3} /></View>
            <Text style={st.emptyT}>{t('sess.emptyT')}</Text>
          </View>
        )}

        {items?.map((s) => (
          <View key={s.id} style={[st.card, s.isCurrent && st.cardOn]}>
            <View style={st.row}>
              <View style={[st.dot, { backgroundColor: s.isCurrent ? C.up : C.txt3 }]} />
              <Text style={st.dev}>{s.device}</Text>
              {s.isCurrent ? (
                <Text style={st.now}>{t('sess.thisDevice')}</Text>
              ) : s.closedAt ? (
                <Text style={st.closed}>{t('sess.closedAgo')}</Text>
              ) : null}
            </View>
            <Text style={st.time}>{t('sess.opened')}: {fmt(s.loggedAt, lang)}</Text>
            {s.closedAt ? (
              <Text style={st.time}>{t('sess.closedLbl')}: {fmt(s.closedAt, lang)}</Text>
            ) : null}
          </View>
        ))}

        {items?.some((s) => s.isCurrent) && (
          <Button3D
            title={t('sess.closeCta')}
            icon="power"
            variant="dark"
            onPress={pedirCerrar}
            style={{ marginTop: 12 }}
          />
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  hero: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: 'rgba(201,169,97,0.10)', borderWidth: 1, borderColor: 'rgba(201,169,97,0.32)', borderRadius: 14, padding: 14, marginBottom: 14 },
  heroTxt: { flex: 1, color: C.txt2, fontSize: 12, lineHeight: 17 },
  card: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14, marginBottom: 10 },
  cardOn: { borderColor: 'rgba(62,217,160,0.42)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  dev: { flex: 1, color: C.txt, fontWeight: '700', fontSize: 14 },
  now: { color: C.up, fontSize: 10.5, fontWeight: '800', letterSpacing: 1, backgroundColor: 'rgba(62,217,160,0.13)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  closed: { color: C.txt3, fontSize: 10.5, fontWeight: '700', letterSpacing: 1 },
  time: { color: C.txt3, fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  empty: { alignItems: 'center', marginTop: 30 },
  emptyIc: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  emptyT: { color: C.txt, fontWeight: '700', fontSize: 15, marginTop: 14 },
});
