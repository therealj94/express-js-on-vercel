import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../icons';
import { C, G } from '../theme';
import { TokenIcon, ActionBtn, IconBtn, SectionHead, Skeleton, useToast, useAccount, hap } from '../ui';
import { money, qtyFmt, tokensFromBalances } from '../data';
import { apiPortfolio } from '../api';
import { upsertApiAccount } from '../accounts';
import { debeMostrarBackup, posponer } from '../backupNudge';
import { useT } from '../i18n';

export default function Home({ nav }) {
  const [hidden, setHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [falloCarga, setFalloCarga] = useState(false);  // no se pudieron leer los saldos
  const toast = useToast();
  const t = useT();
  const tr = t; // alias para no colisionar con la variable "t" del map de tokens
  const { account, login } = useAccount();
  const refreshedOnce = useRef(false);

  // Respaldo 'OG' (Orden Global): el 'VW' del fork era un monograma de Veta
  // Wallet suelto en una app que se firma Orden Global.
  const acc = account || { name: 'Cuenta', initials: 'OG', addr: '', balances: [], genesisUid: null };
  const shortAddr = acc.addr && acc.addr.length > 14 ? `${acc.addr.slice(0, 6)}…${acc.addr.slice(-4)}` : acc.addr || '';

  const list = tokensFromBalances(acc.balances);
  // Total solo con tokens que tienen precio real. Un feed caído no debe
  // aparecer como si valiera cero: se refleja como "sin precio" en la ficha.
  const priced = list.filter((t) => t.hasPrice);
  const total = priced.reduce((s, t) => s + t.qty * t.price, 0);
  const holdingNoPrice = list.some((t) => t.qty > 0 && !t.hasPrice);
  // Primera carga: no hay cuenta todavía o llegó sin balances. Mientras
  // llegan los datos, pintamos skeletons para que no se vea un flash con
  // "$0.00" y "0 ORIGEN" antes de tener saldos reales.
  // Si el refresco falló, se sale del estado de carga: mostrar el aviso de
  // error es mejor que dejar los skeletons latiendo indefinidamente.
  const firstLoad = !falloCarga && (!account || (list.length === 0 && !refreshedOnce.current));

  // Variación 24 h ponderada del portafolio (solo con datos reales del feed).
  const withChg = priced.filter((t) => t.chg != null && t.qty * t.price > 0);
  const chgBase = withChg.reduce((s, t) => s + t.qty * t.price, 0);
  const dayPct = chgBase > 0 ? withChg.reduce((s, t) => s + t.chg * (t.qty * t.price), 0) / chgBase : null;
  const dayUsd = dayPct != null ? total * (dayPct / 100) : null;

  async function refresh(showToast) {
    try {
      const portfolio = await apiPortfolio();
      const updated = await upsertApiAccount({ email: acc.email, name: acc.name }, acc.addr, portfolio);
      login(updated);
      setFalloCarga(false);
      if (showToast) toast(t('home.updated'));
    } catch (e) {
      // Sin esta marca, un fallo en el primer refresco dejaba los skeletons
      // latiendo para siempre (no cambiaba ningún estado, así que no había
      // re-render), y al tirar para refrescar la pantalla pasaba a mostrar
      // "$0.00" como si el usuario no tuviera nada. En una billetera, un cero
      // sin explicación es el peor mensaje posible: ahora se dice que no se
      // pudieron leer los saldos.
      setFalloCarga(true);
      if (showToast) toast(t('home.offline'));
    }
  }

  // Al abrir la app: refresca los saldos reales en segundo plano.
  useEffect(() => {
    if (account?.email && !refreshedOnce.current) {
      refreshedOnce.current = true;
      refresh(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.email]);

  // Aviso amable "respaldá tu seed" tras 24 h en la app sin haberla visto.
  const [showBackup, setShowBackup] = useState(false);
  useEffect(() => {
    debeMostrarBackup().then(setShowBackup);
  }, []);
  const cerrarBackup = async () => { hap(); await posponer(); setShowBackup(false); };
  const irBackup = () => { hap(); nav.go('seedview'); setShowBackup(false); };

  const onRefresh = async () => {
    setRefreshing(true); hap();
    await refresh(true);
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.acct}>
        <Pressable onPress={() => nav.go('settings')}>
          <LinearGradient colors={G.gold} style={styles.avatar}><Text style={styles.avatarTxt}>{acc.initials}</Text></LinearGradient>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.acctName} numberOfLines={1}>{acc.name}</Text>
          <Text style={styles.acctAddr}>{shortAddr}</Text>
        </View>
        <IconBtn icon="notifications" onPress={() => nav.go('notifs')} label={t('home.notificationsA11y')} />
        <IconBtn icon="qr-code" onPress={() => nav.go('receive')} label={t('home.qrA11y')} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 110 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gold} colors={[C.gold]} progressBackgroundColor={C.panel} />}>
        <LinearGradient colors={G.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balCard}>
          <Text style={styles.balLbl}>{t('home.balance')}</Text>
          {firstLoad ? (
            <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 20, gap: 8 }}>
              <Skeleton width={170} height={36} radius={10} />
              <Skeleton width={110} height={14} radius={7} />
            </View>
          ) : (
            <>
              <Pressable onPress={() => { hap(); setHidden(!hidden); }} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.balAmt}>{hidden ? '••••••' : (falloCarga && list.length === 0 ? '—' : money(total))}</Text>
                <Icon name={hidden ? 'eye-off' : 'eye'} size={18} color={C.txt2} style={{ marginLeft: 8 }} />
              </Pressable>
              {falloCarga && list.length === 0 ? (
                <Text style={styles.balChg}>{t('home.errSaldos')}</Text>
              ) : dayPct != null ? (
                <Text style={[styles.balChg, { color: dayPct >= 0 ? C.up : C.down }]}>
                  {hidden ? '••••' : `${dayPct >= 0 ? '+' : '-'}${money(Math.abs(dayUsd))}`}  <Text style={styles.pill}> {dayPct >= 0 ? '+' : ''}{dayPct.toFixed(2)}% </Text>  {t('home.today')}
                </Text>
              ) : (
                <Text style={styles.balChg}>{t('home.live')}</Text>
              )}
            </>
          )}
          <View style={styles.actions}>
            <ActionBtn icon="arrow-up" label={t('home.send')} onPress={() => nav.go('send')} />
            <ActionBtn icon="arrow-down" label={t('home.receive')} onPress={() => nav.go('receive')} />
            <ActionBtn icon="card" label={t('home.buy')} onPress={() => nav.go('buy')} />
            <ActionBtn icon="swap-horizontal" label={t('home.swap')} onPress={() => nav.go('swap')} />
          </View>
        </LinearGradient>

        {/* Remesas: puerta de entrada destacada. Usa el mismo lenguaje visual
            que el hero verde para conectar con "envío" a distancia. */}
        <Pressable
          onPress={() => { hap(); nav.go('remesas'); }}
          accessibilityRole="button"
          accessibilityLabel={tr('home.remesasA11y')}
          style={styles.remCard}>
          <LinearGradient colors={['#0f5f55', '#0a3a3d']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.remCardBg}>
            <View style={styles.remIc}>
              <Icon name="paper-plane" size={22} color={C.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.remT}>{tr('home.remesasT')}</Text>
              <Text style={styles.remP}>{tr('home.remesasP')}</Text>
            </View>
            <Icon name="chevron-forward" size={20} color={C.gold} />
          </LinearGradient>
        </Pressable>

        {showBackup && (
          <View style={styles.backupCard}>
            <View style={styles.backupIc}><Icon name="key" size={22} color={C.gold} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.promoT}>{tr('home.backupT')}</Text>
              <Text style={styles.promoP}>{tr('home.backupP')}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable onPress={irBackup} style={styles.backupBtn} accessibilityRole="button" accessibilityLabel={tr('home.backupCta')}>
                  <Text style={styles.backupBtnTxt}>{tr('home.backupCta')}</Text>
                </Pressable>
                <Pressable onPress={cerrarBackup} style={styles.backupLater} accessibilityRole="button" accessibilityLabel={tr('home.backupLater')}>
                  <Text style={styles.backupLaterTxt}>{tr('home.backupLater')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {!acc.genesisUid && (
          <Pressable onPress={() => nav.go('kyc')} style={styles.promo}>
            <LinearGradient colors={G.gold} style={styles.promoIc}><Icon name="finger-print" size={22} color={C.darkText} /></LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.promoT}>{t('home.genesisT')}</Text>
              <Text style={styles.promoP}>{t('home.genesisP')}</Text>
            </View>
            <Icon name="chevron-forward" size={20} color={C.gold} />
          </Pressable>
        )}

        <SectionHead title={t('home.assets')} action={t('home.activity')} onAction={() => nav.go('activity')} />
        {firstLoad ? (
          // Cinco filas fantasma con la misma silueta que un token real,
          // para que el ojo ya sepa dónde ir cuando lleguen los datos.
          [0, 1, 2, 3, 4].map((i) => (
            <View key={`sk-${i}`} style={styles.token}>
              <Skeleton width={44} height={44} radius={22} />
              <View style={{ flex: 1, marginLeft: 13, gap: 6 }}>
                <Skeleton width={80} height={13} />
                <Skeleton width={54} height={11} />
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Skeleton width={68} height={13} />
                <Skeleton width={90} height={11} />
              </View>
            </View>
          ))
        ) : (
          list.map((t) => (
            <Pressable
              key={t.s}
              onPress={() => { hap(); nav.go('token', { token: t }); }}
              accessibilityRole="button"
              accessibilityLabel={tr('home.tokenA11y', { name: t.n, qty: qtyFmt(t.qty), sym: t.s })}
              style={styles.token}>
              <TokenIcon t={t} />
              <View style={{ flex: 1, marginLeft: 13 }}>
                <Text style={styles.tName}>{t.n}</Text>
                <Text style={styles.tPrice}>
                  {t.hasPrice ? money(t.price) : '—'}
                  {t.hasPrice && t.chg != null && (
                    <Text style={{ color: t.chg < 0 ? C.down : C.up, fontWeight: '600' }}>  {t.chg > 0 ? '+' : ''}{t.chg.toFixed(2)}%</Text>
                  )}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.tVal}>{hidden ? '••••' : (t.hasPrice ? money(t.qty * t.price) : '—')}</Text>
                <Text style={styles.tQty}>{hidden ? `•••• ${t.s}` : `${qtyFmt(t.qty)} ${t.s}`}</Text>
              </View>
            </Pressable>
          ))
        )}
        {holdingNoPrice && !hidden && (
          <Text style={styles.noPriceHint}>{tr('home.noPriceHint')}</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  acct: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 22, paddingBottom: 14, paddingTop: 4 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: C.darkText, fontWeight: '800', fontSize: 15 },
  acctName: { fontSize: 14.5, fontWeight: '700', color: C.txt },
  acctAddr: { fontSize: 11, color: C.txt3 },
  balCard: { borderRadius: 26, padding: 24, borderWidth: 1, borderColor: C.line },
  balLbl: { fontSize: 11.5, letterSpacing: 3, color: C.gold, fontWeight: '600', textAlign: 'center', opacity: 0.9 },
  balAmt: { fontSize: 44, fontWeight: '800', color: C.goldHi, letterSpacing: -1, marginTop: 7, textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10 },
  balChg: { textAlign: 'center', color: C.txt2, fontSize: 13, fontWeight: '600', marginTop: 5, marginBottom: 20 },
  pill: { backgroundColor: 'rgba(62,217,160,0.16)', fontSize: 12, overflow: 'hidden', borderRadius: 8 },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  promo: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 15, marginTop: 18 },
  promoIc: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  promoT: { fontSize: 14.5, fontWeight: '700', color: C.txt },
  promoP: { fontSize: 12, color: C.txt2, marginTop: 2 },
  token: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 13, marginBottom: 10 },
  tName: { fontSize: 14.5, fontWeight: '600', color: C.txt },
  tPrice: { fontSize: 12, color: C.txt3, marginTop: 2 },
  tQty: { fontSize: 12, color: C.txt3, marginTop: 2 },
  tVal: { fontSize: 14.5, fontWeight: '600', color: C.txt },
  noPriceHint: { color: C.txt3, fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginTop: 8, paddingHorizontal: 12 },
  backupCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, backgroundColor: 'rgba(201,169,97,0.10)', borderWidth: 1, borderColor: 'rgba(201,169,97,0.38)', borderRadius: 20, padding: 15, marginTop: 18 },
  backupIc: { width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(201,169,97,0.16)', alignItems: 'center', justifyContent: 'center' },
  backupBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 11, backgroundColor: C.gold },
  backupBtnTxt: { color: C.darkText, fontSize: 12.5, fontWeight: '800' },
  backupLater: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(201,169,97,0.32)' },
  backupLaterTxt: { color: C.txt2, fontSize: 12.5, fontWeight: '700' },
  remCard: { marginTop: 18, borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  remCardBg: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderWidth: 1, borderColor: 'rgba(201,169,97,0.35)', borderRadius: 20 },
  remIc: { width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(201,169,97,0.16)', borderWidth: 1, borderColor: 'rgba(201,169,97,0.32)', alignItems: 'center', justifyContent: 'center' },
  remT: { color: C.txt, fontWeight: '800', fontSize: 14.5 },
  remP: { color: C.txt2, fontSize: 12, marginTop: 2, lineHeight: 16 },
});
