// app/profile.tsx
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  useStore, selectEquity, selectPortfolioValue, selectInvested, selectUnrealized,
} from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { usd, pct, shortDate, maskEmail, maskPhone } from '@/utils/format';
import { Icon, IconName } from '@/components/Icon';
import { Panel } from '@/components/Panel';
import { CyberBackground } from '@/components/CyberBackground';
import { COUNTRIES } from '@/app/register';
import { tap, success as hSuccess, error as hError } from '@/utils/haptics';
import { signOutCloud, isFirebaseConfigured, flushCloudSync, deleteAccountCloud } from '@/utils/cloudSync';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { runBusyAsync } from '@/utils/busy';
import { TRACK_LABELS } from '@/utils/music';
import { t } from '@/utils/i18n';
import { PALETTES, THEME_KEYS, THEME_LABEL, type ThemeKey } from '@/theme/palettes';
import type { MusicMode } from '@/store/useStore';

export default function Profile() {
  const insets = useSafeAreaInsets();
  const user = useStore((s) => s.user);
  const uid = useStore((s) => s.uid);
  const alias = useStore((s) => s.alias);
  const setAlias = useStore((s) => s.setAlias);
  const resetAll = useStore((s) => s.resetAll);
  const riskAcceptedAt = useStore((s) => s.riskAcceptedAt);
  const balance = useStore((s) => s.balance);
  const realizedTotal = useStore((s) => s.realizedTotal);
  const transactions = useStore((s) => s.transactions);
  const equity = useStore(selectEquity);
  const portValue = useStore(selectPortfolioValue);
  const invested = useStore(selectInvested);
  const unrealized = useStore(selectUnrealized);
  const musicMode = useStore((s) => s.musicMode);
  const setMusicMode = useStore((s) => s.setMusicMode);
  const goalSoundOn = useStore((s) => s.goalSoundOn);
  const setGoalSoundOn = useStore((s) => s.setGoalSoundOn);
  const themeKey = useStore((s) => s.themeKey);
  const setTheme = useStore((s) => s.setTheme);
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);

  const [editingAlias, setEditingAlias] = useState(false);
  const [aliasDraft, setAliasDraft] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePass, setDeletePass] = useState('');
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const country = COUNTRIES.find((c) => c.code === user?.country);
  const displayName = alias || user?.name.split(' ')[0] || 'Trader';

  const startEditAlias = () => { tap(); setAliasDraft(alias ?? ''); setEditingAlias(true); };
  const saveAlias = () => {
    if (aliasDraft.trim().length < 3) { hError(); return; }
    setAlias(aliasDraft);
    hSuccess();
    setEditingAlias(false);
  };

  const cloudBacked = isFirebaseConfigured() && Boolean(uid);

  const signOut = () => {
    tap();
    Alert.alert(
      t('prof.signOut'),
      cloudBacked ? t('prof.signOutCloud') : t('prof.signOutLocal'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('prof.signOut'), style: 'destructive',
          onPress: async () => {
            // manda cualquier cambio pendiente (ej. el bono recién reclamado)
            // ANTES de cerrar la sesión de Firebase — si no, ese último cambio
            // se queda esperando el debounce y nunca llega a guardarse.
            await flushCloudSync();
            await signOutCloud();
            resetAll();
            // limpia toda la pila de navegación (dashboard, perfil, etc.) antes de
            // reemplazar la ruta actual — si no, pantallas previas con overlays tipo
            // Modal (ej. el tutorial de bienvenida) quedan montadas por debajo.
            if (router.canDismiss()) router.dismissAll();
            router.replace('/register');
          },
        },
      ]
    );
  };

  const confirmDelete = () => {
    setDeleteErr(null);
    runBusyAsync(async () => {
      if (cloudBacked && user) {
        const res = await deleteAccountCloud(user.email, deletePass);
        if (!res.ok) { hError(); setDeleteErr(res.msg ?? null); return; }
      }
      hSuccess();
      setDeleteOpen(false);
      resetAll();
      if (router.canDismiss()) router.dismissAll();
      router.replace('/register');
    });
  };

  const stats = useMemo(() => {
    const sells = transactions.filter((t) => t.type === 'SELL');
    const wins = sells.filter((t) => (t.pnl ?? 0) >= 0);
    const winRate = sells.length > 0 ? (wins.length / sells.length) * 100 : 0;
    const best = sells.reduce((max, t) => Math.max(max, t.pnl ?? -Infinity), -Infinity);
    return {
      totalTrades: transactions.length,
      winRate,
      bestTrade: sells.length > 0 && best !== -Infinity ? best : null,
    };
  }, [transactions]);

  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <CyberBackground variant="subtle" />
      <View style={styles.header}>
        <Pressable onPress={() => { tap(); router.back(); }} style={styles.back}><Icon name="chevron-left" size={20} color={colors.text} /></Pressable>
        <Text style={styles.title}>{t('prof.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 40 }}>
        <Animated.View entering={FadeInDown.duration(350)} style={styles.avatarWrap}>
          <View style={styles.avatar}><Text style={styles.avatarTxt}>{initials}</Text></View>

          {editingAlias ? (
            <View style={styles.aliasEditRow}>
              <TextInput
                value={aliasDraft}
                onChangeText={setAliasDraft}
                placeholder={t('prof.aliasPh')}
                placeholderTextColor={colors.textTertiary}
                style={styles.aliasInput}
                autoCapitalize="none"
                maxLength={24}
                autoFocus
              />
              <Pressable onPress={saveAlias} style={styles.aliasSaveBtn}><Icon name="check" size={16} color="#012410" strokeWidth={3} /></Pressable>
              <Pressable onPress={() => { tap(); setEditingAlias(false); }} style={styles.aliasCancelBtn}><Icon name="close" size={16} color={colors.textSecondary} /></Pressable>
            </View>
          ) : (
            <Pressable onPress={startEditAlias} style={styles.nameRow}>
              <Text style={styles.name}>{displayName}</Text>
              <Icon name="settings" size={14} color={colors.textTertiary} />
            </Pressable>
          )}
          <Text style={styles.aliasHint}>{alias ? t('prof.aliasSet') : t('prof.aliasUnset')}</Text>

          <View style={styles.badgeRow}>
            <View style={styles.verifiedBadge}>
              <Icon name="shield" size={12} color={colors.profit} />
              <Text style={styles.verifiedTxt}>{t('prof.verified')}</Text>
            </View>
            {riskAcceptedAt && <Text style={styles.since}>{t('prof.memberSince', { date: shortDate(riskAcceptedAt) })}</Text>}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(60).duration(350)}>
          <Panel style={styles.card}>
            <Text style={styles.cardTitle}>{t('prof.accountData')}</Text>
            <InfoRow icon="user" label={t('prof.realName')} value={user?.name ?? '—'} />
            <InfoRow icon="news" label={t('prof.email')} value={user ? maskEmail(user.email) : '—'} />
            <InfoRow icon="bolt" label={t('prof.phone')} value={user ? maskPhone(user.phone) : '—'} />
            <InfoRow icon="target" label={t('prof.country')} value={country?.name ?? '—'} />
          </Panel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(350)} style={styles.statsGrid}>
          <Stat label={t('prof.equity')} value={usd(equity)} accent={colors.gold} />
          <Stat label={t('common.available')} value={usd(balance)} />
          <Stat label={t('port.invested')} value={usd(invested)} />
          <Stat label={t('dash.inPositions')} value={usd(portValue)} />
          <Stat label={t('dash.pnlUnreal')} value={`${unrealized >= 0 ? '+' : ''}${usd(unrealized)}`} accent={unrealized >= 0 ? colors.profit : colors.loss} />
          <Stat label={t('dash.pnlReal')} value={`${realizedTotal >= 0 ? '+' : ''}${usd(realizedTotal)}`} accent={realizedTotal >= 0 ? colors.profit : colors.loss} />
          <Stat label={t('prof.trades')} value={String(stats.totalTrades)} />
          <Stat label={t('prof.winRate')} value={stats.totalTrades > 0 ? `${stats.winRate.toFixed(0)}%` : '—'} />
        </Animated.View>

        {stats.bestTrade !== null && (
          <Animated.View entering={FadeInDown.delay(160).duration(350)}>
            <Panel style={styles.bestCard} borderColor={colors.gold}>
              <Icon name="trophy" size={18} color={colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.bestLbl}>{t('prof.bestTrade')}</Text>
                <Text style={styles.bestVal}>+{usd(stats.bestTrade)}</Text>
              </View>
            </Panel>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(200).duration(350)}>
          <Pressable onPress={() => { tap(); router.push('/leaderboard'); }}>
            <Panel style={styles.leaderCard} glow>
              <View style={styles.leaderIcon}><Icon name="trophy" size={20} color={colors.gold} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.leaderTitle}>{t('prof.topTraders')}</Text>
                <Text style={styles.leaderSub}>{t('prof.topTradersSub')}</Text>
              </View>
              <Icon name="chevron-right" size={18} color={colors.textTertiary} />
            </Panel>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(220).duration(350)}>
          <Panel style={styles.card}>
            <Text style={styles.cardTitle}>{t('prof.appearance')}</Text>
            <Text style={styles.settingLbl}>{t('prof.theme')}</Text>
            <View style={styles.musicGrid}>
              {THEME_KEYS.map((k: ThemeKey) => {
                const pal = PALETTES[k];
                const active = themeKey === k;
                return (
                  <Pressable key={k} onPress={() => { tap(); setTheme(k); }} style={[styles.themeChip, { backgroundColor: pal.bgCard, borderColor: active ? pal.gold : colors.border }]}>
                    <View style={[styles.themeChipDot, { backgroundColor: pal.profit }]} />
                    <View style={[styles.themeChipDot, { backgroundColor: pal.gold }]} />
                    <Text style={[styles.musicChipTxt, { color: active ? pal.gold : pal.textSecondary }]}>{THEME_LABEL[k][language]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.settingLbl}>{t('prof.language')}</Text>
            <View style={styles.musicGrid}>
              <MusicChip label="Español" active={language === 'es'} onPress={() => { tap(); setLanguage('es'); }} />
              <MusicChip label="English" active={language === 'en'} onPress={() => { tap(); setLanguage('en'); }} />
            </View>
          </Panel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(230).duration(350)}>
          <Panel style={styles.card}>
            <Text style={styles.cardTitle}>{t('prof.sound')}</Text>
            <Text style={styles.settingLbl}>{t('prof.music')}</Text>
            <View style={styles.musicGrid}>
              <MusicChip label={TRACK_LABELS.track2} active={musicMode === 'track2'} onPress={() => { tap(); setMusicMode('track2'); }} />
              <MusicChip label={t('common.off')} active={musicMode === 'off'} onPress={() => { tap(); setMusicMode('off'); }} />
            </View>
            <Pressable onPress={() => { tap(); setGoalSoundOn(!goalSoundOn); }} style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>{t('prof.goalSound')}</Text>
                <Text style={styles.toggleSub}>{t('prof.goalSoundSub')}</Text>
              </View>
              <View style={[styles.toggle, goalSoundOn && styles.toggleOn]}>
                <View style={[styles.toggleKnob, goalSoundOn && styles.toggleKnobOn]} />
              </View>
            </Pressable>
          </Panel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(235).duration(350)}>
          <Panel style={styles.card}>
            <Text style={styles.cardTitle}>{t('prof.privacy')}</Text>
            <Pressable onPress={() => { tap(); Linking.openURL(PRIVACY_URL).catch(() => {}); }} style={styles.linkRow}>
              <Icon name="shield" size={15} color={colors.blue} />
              <Text style={styles.linkTxt}>{t('prof.privacyPolicy')}</Text>
              <Icon name="chevron-right" size={15} color={colors.textTertiary} />
            </Pressable>
            <Pressable onPress={() => { tap(); setDeletePass(''); setDeleteErr(null); setDeleteOpen(true); }} style={styles.linkRow}>
              <Icon name="alert" size={15} color={colors.loss} />
              <Text style={[styles.linkTxt, { color: colors.loss }]}>{t('prof.deleteAccount')}</Text>
              <Icon name="chevron-right" size={15} color={colors.textTertiary} />
            </Pressable>
          </Panel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(350)}>
          <Pressable onPress={signOut} style={styles.signOutBtn}>
            <Icon name="close" size={16} color={colors.loss} />
            <Text style={styles.signOutTxt}>{t('prof.signOut')}</Text>
          </Pressable>
          <Text style={styles.versionTxt}>
            {Constants.expoConfig?.name ?? 'Sport Kapital'} v{Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </Animated.View>
      </ScrollView>

      <ConfirmDialog
        visible={deleteOpen}
        danger
        icon="alert"
        title={t('prof.deleteTitle')}
        message={cloudBacked ? t('prof.deleteMsgCloud') : t('prof.deleteMsgLocal')}
        confirmLabel={t('prof.deleteConfirm')}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
      >
        {cloudBacked && (
          <TextInput
            value={deletePass}
            onChangeText={(v) => { setDeletePass(v); setDeleteErr(null); }}
            placeholder={t('login.passwordPh')}
            placeholderTextColor={colors.textTertiary}
            style={styles.deleteInput}
            secureTextEntry
            autoCapitalize="none"
          />
        )}
        {deleteErr && <Text style={styles.deleteErr}>{deleteErr}</Text>}
      </ConfirmDialog>
    </View>
  );
}

const MusicChip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <Pressable onPress={onPress} style={[styles.musicChip, active && styles.musicChipOn]}>
    {active && <Icon name="sound-on" size={12} color={colors.gold} />}
    <Text style={[styles.musicChipTxt, active && styles.musicChipTxtOn]} numberOfLines={1}>{label}</Text>
  </Pressable>
);

const InfoRow = ({ icon, label, value }: { icon: IconName; label: string; value: string }) => (
  <View style={styles.infoRow}>
    <Icon name={icon} size={15} color={colors.textTertiary} />
    <Text style={styles.infoLbl}>{label}</Text>
    <Text style={styles.infoVal}>{value}</Text>
  </View>
);

const Stat = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
  <View style={styles.stat}>
    <Text style={styles.statLbl}>{label}</Text>
    <Text style={[styles.statVal, accent ? { color: accent } : null]}>{value}</Text>
  </View>
);

const PRIVACY_URL = 'https://sport-kapital-b0dc6.web.app/privacy.html';

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, marginBottom: 8 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: font.size.lg, fontFamily: font.family.headingBold, textTransform: 'uppercase' },
  avatarWrap: { alignItems: 'center', marginTop: 12, marginBottom: 22 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.bgCard, borderWidth: 2, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: colors.gold, fontSize: font.size['2xl'], fontFamily: font.family.heading },
  name: { color: colors.text, fontSize: font.size.xl, fontFamily: font.family.headingBold, marginTop: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  aliasEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, width: '100%' },
  aliasInput: { flex: 1, color: colors.text, fontSize: font.size.md, fontWeight: '700', backgroundColor: colors.bgCard, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.gold, paddingHorizontal: 12, height: 40 },
  aliasSaveBtn: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.profit, alignItems: 'center', justifyContent: 'center' },
  aliasCancelBtn: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  aliasHint: { color: colors.textTertiary, fontSize: font.size.xs, marginTop: 6, textAlign: 'center' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.profitDim, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  verifiedTxt: { color: colors.profit, fontSize: font.size.xs, fontWeight: '800' },
  since: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '600' },
  card: { padding: 16, marginBottom: 16 },
  cardTitle: { color: colors.text, fontSize: font.size.xs, fontFamily: font.family.headingBold, letterSpacing: 1, marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  infoLbl: { color: colors.textSecondary, fontSize: font.size.sm, flex: 1 },
  infoVal: { color: colors.text, fontSize: font.size.sm, fontWeight: '700' },
  musicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  settingLbl: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '700', marginBottom: 8, marginTop: 6, letterSpacing: 0.5 },
  themeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.full, paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1.5 },
  themeChipDot: { width: 9, height: 9, borderRadius: 5 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  toggleTitle: { color: colors.text, fontSize: font.size.sm, fontWeight: '700' },
  toggleSub: { color: colors.textTertiary, fontSize: font.size.xs, marginTop: 2 },
  toggle: { width: 46, height: 26, borderRadius: 13, backgroundColor: colors.bgCardHover, borderWidth: 1, borderColor: colors.border, padding: 2, justifyContent: 'center' },
  toggleOn: { backgroundColor: colors.profitDim, borderColor: colors.profit },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textTertiary },
  toggleKnobOn: { backgroundColor: colors.profit, alignSelf: 'flex-end' },
  musicChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.bg, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: colors.border },
  musicChipOn: { backgroundColor: colors.goldDim, borderColor: colors.gold },
  musicChipTxt: { color: colors.textSecondary, fontSize: font.size.xs, fontWeight: '700' },
  musicChipTxtOn: { color: colors.gold },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  stat: { width: '47.7%', backgroundColor: colors.bgCard, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border },
  statLbl: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '600' },
  statVal: { color: colors.text, fontSize: font.size.lg, marginTop: 4, fontFamily: font.family.headingBold },
  bestCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 16 },
  bestLbl: { color: colors.textSecondary, fontSize: font.size.xs, fontWeight: '600' },
  bestVal: { color: colors.gold, fontSize: font.size.lg, marginTop: 2, fontFamily: font.family.heading },
  leaderCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  leaderIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.goldDim, alignItems: 'center', justifyContent: 'center' },
  leaderTitle: { color: colors.text, fontSize: font.size.md, fontFamily: font.family.headingBold, textTransform: 'uppercase' },
  leaderSub: { color: colors.textTertiary, fontSize: font.size.xs, marginTop: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  linkTxt: { color: colors.text, fontSize: font.size.sm, fontWeight: '700', flex: 1 },
  deleteInput: { color: colors.text, fontSize: font.size.md, fontWeight: '700', backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.loss, paddingHorizontal: 14, height: 48 },
  deleteErr: { color: colors.loss, fontSize: font.size.sm, fontWeight: '600', marginTop: 10, textAlign: 'center' },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lossDim },
  signOutTxt: { color: colors.loss, fontSize: font.size.md, fontWeight: '700', fontFamily: font.family.bodySemiBold },
  versionTxt: { color: colors.textTertiary, fontSize: font.size.xs, textAlign: 'center', marginTop: 16 },
}));
