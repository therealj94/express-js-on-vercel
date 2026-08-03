// app/(tabs)/wallet.tsx
// Wallet estilo exchange: depósitos (USDT TRC20 con dirección propia, banco
// local con cuenta recaudadora por país, tarjeta) y retiros (USDT, PayPal,
// SWIFT con banco/código/cuenta/beneficiario) con desglose de comisiones y
// conversión a moneda local. Todo en el idioma y tema activos.
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useStore, selectPortfolioValue, selectEquity } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { usd, timeAgo } from '@/utils/format';
import { Button } from '@/components/Button';
import { Icon, IconName } from '@/components/Icon';
import { PriceFlash } from '@/components/PriceFlash';
import { Panel } from '@/components/Panel';
import { TutorialOverlay, useTutorial, HelpButton } from '@/components/TutorialOverlay';
import { COUNTRIES } from '@/app/register';
import { banksFor, collectionAccount, depositAddress } from '@/data/banks';
import { success as hSuccess, error as hError, tap } from '@/utils/haptics';
import { runBusy } from '@/utils/busy';
import { t } from '@/utils/i18n';
import { useBallRefresh, ballRefreshControl } from '@/components/BallRefresh';

type Tab = 'IN' | 'OUT' | 'HISTORY';
type InMethod = 'CRYPTO' | 'BANK' | 'CARD';
type OutMethod = 'USDT' | 'PAYPAL' | 'SWIFT';

const OUT_METHODS = (): { id: OutMethod; label: string; icon: IconName; feePct: number; feeFixed: number; desc: string }[] => [
  { id: 'USDT', label: 'USDT TRC20', icon: 'qr', feePct: 0.01, feeFixed: 1, desc: t('wal.usdtDesc') },
  { id: 'PAYPAL', label: 'PayPal', icon: 'send', feePct: 0.045, feeFixed: 0.3, desc: t('wal.paypalDesc') },
  { id: 'SWIFT', label: 'SWIFT', icon: 'bank', feePct: 0.01, feeFixed: 25, desc: t('wal.swiftDesc') },
];

const TUTORIAL = () => [
  { icon: 'receive' as IconName, title: t('tut.w1t'), body: t('tut.w1b'), accent: colors.profit },
  { icon: 'send' as IconName, title: t('tut.w2t'), body: t('tut.w2b'), accent: colors.gold },
  { icon: 'clock' as IconName, title: t('tut.w3t'), body: t('tut.w3b'), accent: colors.blue },
];

const TRC20_RE = /^T[A-Za-z0-9]{33}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Wallet() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('IN');
  const balance = useStore((s) => s.balance);
  const portfolioValue = useStore(selectPortfolioValue);
  const equity = useStore(selectEquity);
  const txs = useStore((s) => s.walletTxs);
  const tut = useTutorial('wallet');
  const refresh = useBallRefresh();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{t('wal.title')}</Text>
        <HelpButton onPress={tut.open} />
      </View>

      <Panel style={styles.balanceCard} glow cut={14}>
        <Text style={styles.balanceLbl}>{t('wal.balance')}</Text>
        <PriceFlash value={balance} format={usd} style={styles.balanceVal} />
        <Text style={styles.balanceNet}>{t('wal.balanceSub')}</Text>
        <View style={styles.balanceBreak}>
          <View style={styles.balanceBreakCol}>
            <Text style={styles.balanceBreakLbl}>{t('dash.inPositions')}</Text>
            <Text style={styles.balanceBreakVal}>{usd(portfolioValue)}</Text>
          </View>
          <View style={styles.balanceBreakDiv} />
          <View style={styles.balanceBreakCol}>
            <Text style={styles.balanceBreakLbl}>{t('wal.equity')}</Text>
            <Text style={[styles.balanceBreakVal, { color: colors.profit }]}>{usd(equity)}</Text>
          </View>
        </View>
      </Panel>

      <View style={styles.tabs}>
        {(['IN', 'OUT', 'HISTORY'] as Tab[]).map((tb) => (
          <Pressable key={tb} onPress={() => { tap(); setTab(tb); }} style={[styles.tab, tab === tb && styles.tabOn]}>
            <Text style={[styles.tabTxt, tab === tb && styles.tabTxtOn]}>
              {tb === 'IN' ? t('wal.deposit') : tb === 'OUT' ? t('wal.withdraw') : t('wal.history')}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={ballRefreshControl(refresh)}
      >
        {tab === 'IN' && <CashIn />}
        {tab === 'OUT' && <CashOut balance={balance} />}
        {tab === 'HISTORY' && <History txs={txs} />}
      </ScrollView>

      <TutorialOverlay title={t('tut.walletTitle')} steps={TUTORIAL()} visible={tut.visible} onClose={tut.close} />
    </View>
  );
}

// ============================== DEPÓSITOS ==============================

function CashIn() {
  const deposit = useStore((s) => s.deposit);
  const user = useStore((s) => s.user);
  const uid = useStore((s) => s.uid);
  const alias = useStore((s) => s.alias);
  const [method, setMethod] = useState<InMethod>('CRYPTO');
  const [countryCode, setCountryCode] = useState(user?.country ?? 'HN');
  const [amount, setAmount] = useState('');
  const [cardNum, setCardNum] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const country = COUNTRIES.find((c) => c.code === countryCode) ?? COUNTRIES[0];
  const collect = collectionAccount(countryCode);
  const myAddress = useMemo(() => depositAddress(uid ?? alias ?? user?.email ?? 'sk'), [uid, alias, user?.email]);
  const reference = (alias ?? user?.name.split(' ')[0] ?? 'SK').toUpperCase().replace(/\s/g, '').slice(0, 10) + '-' + (uid ?? 'LOCAL').slice(0, 4).toUpperCase();

  const icon: Record<InMethod, IconName> = { BANK: 'bank', CARD: 'coin', CRYPTO: 'qr' };
  const methodLabel: Record<InMethod, string> = { CRYPTO: t('wal.crypto'), BANK: t('wal.bank'), CARD: t('wal.card') };

  const cardOk = cardNum.replace(/\s/g, '').length === 16 && cardName.trim().length >= 3 && /^\d\d\/\d\d$/.test(cardExp) && cardCvv.length >= 3;

  const submit = () => {
    const a = Number(amount);
    if (a <= 0) { hError(); return; }
    if (method === 'CARD' && !cardOk) { hError(); setErr(t('wal.errCard')); return; }
    setErr(null);
    runBusy(() => {
      deposit(a, `${methodLabel[method]}${method === 'BANK' ? ` · ${collect.bank}` : ''}`);
      hSuccess();
      setConfirmed(true);
      setAmount('');
      setTimeout(() => setConfirmed(false), 1800);
    });
  };

  const formatCard = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 16);
    setCardNum(digits.replace(/(\d{4})(?=\d)/g, '$1 '));
  };
  const formatExp = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 4);
    setCardExp(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
  };

  return (
    <Animated.View entering={FadeIn}>
      <View style={styles.methodRow}>
        {(['CRYPTO', 'BANK', 'CARD'] as InMethod[]).map((m) => (
          <Pressable key={m} onPress={() => { tap(); setMethod(m); setErr(null); }} style={[styles.method, method === m && styles.methodOn]}>
            <Icon name={icon[m]} size={18} color={method === m ? colors.gold : colors.textSecondary} />
            <Text style={[styles.methodTxt, method === m && styles.methodTxtOn]}>{methodLabel[m]}</Text>
          </Pressable>
        ))}
      </View>

      {method === 'CRYPTO' && (
        <>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>{t('wal.inCryptoTitle')}</Text>
            <Text style={styles.infoTxt}>{t('wal.inCryptoTxt')}</Text>
          </View>
          <Text style={styles.fieldLabel}>{t('wal.inCryptoAddr')}</Text>
          <View style={styles.addressBox}>
            <Icon name="qr" size={18} color={colors.gold} />
            <Text style={styles.addressTxt} selectable>{myAddress}</Text>
          </View>
          <View style={styles.kvRow}><Text style={styles.kvK}>{t('wal.usdtNet')}</Text><Text style={styles.kvV}>TRON (TRC20)</Text></View>
          <View style={styles.kvRow}><Text style={styles.kvK}>Min.</Text><Text style={styles.kvV}>10 USDT</Text></View>
        </>
      )}

      {method === 'BANK' && (
        <>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>{t('wal.inBankTitle')}</Text>
            <Text style={styles.infoTxt}>{t('wal.inBankTxt')}</Text>
          </View>
          <Text style={styles.fieldLabel}>{t('wal.destCountry')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            {COUNTRIES.map((c) => (
              <Pressable key={c.code} onPress={() => { tap(); setCountryCode(c.code); }} style={[styles.chip, countryCode === c.code && styles.chipOn]}>
                <Text style={[styles.chipTxt, countryCode === c.code && styles.chipTxtOn]}>{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.kvBox}>
            <View style={styles.kvRow}><Text style={styles.kvK}>{t('wal.inBankBank')}</Text><Text style={styles.kvV}>{collect.bank}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvK}>{t('wal.inBankAcc')}</Text><Text style={styles.kvV} selectable>{collect.account}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvK}>{t('wal.inBankBenef')}</Text><Text style={styles.kvV}>{collect.beneficiary}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvK}>{t('wal.inBankRef')}</Text><Text style={[styles.kvV, { color: colors.gold }]} selectable>{reference}</Text></View>
          </View>
        </>
      )}

      {method === 'CARD' && (
        <>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>{t('wal.inCardTitle')}</Text>
            <Text style={styles.infoTxt}>{t('wal.inCardTxt')}</Text>
          </View>
          <Text style={styles.fieldLabel}>{t('wal.cardNumber')}</Text>
          <View style={styles.inputBox}>
            <Icon name="coin" size={16} color={colors.textTertiary} />
            <TextInput value={cardNum} onChangeText={formatCard} keyboardType="number-pad" placeholder="4111 1111 1111 1111" placeholderTextColor={colors.textTertiary} style={styles.input} />
          </View>
          <Text style={styles.fieldLabel}>{t('wal.cardName')}</Text>
          <View style={styles.inputBox}>
            <TextInput value={cardName} onChangeText={setCardName} autoCapitalize="characters" placeholder="NOMBRE APELLIDO" placeholderTextColor={colors.textTertiary} style={styles.input} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('wal.cardExp')}</Text>
              <View style={styles.inputBox}>
                <TextInput value={cardExp} onChangeText={formatExp} keyboardType="number-pad" placeholder="MM/AA" placeholderTextColor={colors.textTertiary} style={styles.input} maxLength={5} />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('wal.cardCvv')}</Text>
              <View style={styles.inputBox}>
                <TextInput value={cardCvv} onChangeText={(v) => setCardCvv(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="123" placeholderTextColor={colors.textTertiary} style={styles.input} secureTextEntry />
              </View>
            </View>
          </View>
        </>
      )}

      <Text style={styles.fieldLabel}>{t('wal.amountIn')}</Text>
      <View style={styles.inputBox}>
        <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textTertiary} style={styles.input} />
        <Text style={styles.suffix}>USDT</Text>
      </View>
      <View style={styles.quickAmts}>
        {[50, 100, 250, 500].map((v) => (
          <Pressable key={v} onPress={() => { tap(); setAmount(String(v)); }} style={styles.quickAmt}><Text style={styles.quickAmtTxt}>+{v}</Text></Pressable>
        ))}
      </View>
      {err && (
        <View style={styles.msgRow}>
          <Icon name="alert" size={16} color={colors.loss} />
          <Text style={[styles.msg, { color: colors.loss }]}>{err}</Text>
        </View>
      )}
      <Button label={confirmed ? t('wal.confirmedIn') : t('wal.confirmIn')} onPress={submit} variant="success" disabled={confirmed} style={{ marginTop: 16 }} />
    </Animated.View>
  );
}

// ============================== RETIROS ==============================

function CashOut({ balance }: { balance: number }) {
  const withdraw = useStore((s) => s.withdraw);
  const user = useStore((s) => s.user);
  const [method, setMethod] = useState<OutMethod>('USDT');
  const [countryCode, setCountryCode] = useState(user?.country ?? 'HN');
  const [amount, setAmount] = useState('');
  const [dest, setDest] = useState('');          // dirección TRC20 o correo PayPal
  const [holderName, setHolderName] = useState(''); // titular PayPal / beneficiario SWIFT
  const [bankName, setBankName] = useState('');
  const [swiftCode, setSwiftCode] = useState('');
  const [accountNum, setAccountNum] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const methods = OUT_METHODS();
  const m = methods.find((x) => x.id === method)!;
  const country = COUNTRIES.find((c) => c.code === countryCode) ?? COUNTRIES[0];
  const a = Number(amount) || 0;
  const fee = a * m.feePct + (a > 0 ? m.feeFixed : 0);
  const net = Math.max(0, a);
  const localAmount = net * country.rate;
  const showLocal = method !== 'USDT' && country.currency !== 'USD';

  const validate = (): string | null => {
    if (a <= 0) return t('wal.errAmountDest');
    if (method === 'USDT') {
      if (!TRC20_RE.test(dest.trim())) return t('wal.errUsdtAddr');
    } else if (method === 'PAYPAL') {
      if (!EMAIL_RE.test(dest.trim())) return t('wal.errPaypal');
    } else {
      if (!bankName.trim() || !accountNum.trim() || !holderName.trim()) return t('wal.errSwift');
    }
    return null;
  };

  const submit = () => {
    const v = validate();
    if (v) { hError(); setMsg({ ok: false, text: v }); setTimeout(() => setMsg(null), 2600); return; }
    runBusy(() => {
      const ref = method === 'USDT'
        ? `USDT TRC20 · ${dest.trim().slice(0, 10)}…`
        : method === 'PAYPAL'
          ? `PayPal · ${dest.trim()}`
          : `SWIFT · ${bankName.trim()} · ${country.name}`;
      const res = withdraw(a, fee, ref);
      if (res.ok) { hSuccess(); setMsg({ ok: true, text: res.msg }); setAmount(''); setDest(''); setAccountNum(''); }
      else { hError(); setMsg({ ok: false, text: res.msg }); }
      setTimeout(() => setMsg(null), 2600);
    });
  };

  return (
    <Animated.View entering={FadeIn}>
      <Text style={styles.fieldLabel}>{t('wal.methodWithdraw')}</Text>
      <View style={styles.methodRow}>
        {methods.map((x) => (
          <Pressable key={x.id} onPress={() => { tap(); setMethod(x.id); setMsg(null); }} style={[styles.method, method === x.id && styles.methodOn]}>
            <Icon name={x.icon} size={18} color={method === x.id ? colors.gold : colors.textSecondary} />
            <Text style={[styles.methodTxt, method === x.id && styles.methodTxtOn]}>{x.id === 'USDT' ? 'USDT' : x.id === 'PAYPAL' ? 'PayPal' : 'SWIFT'}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>{m.label}</Text>
        <Text style={styles.infoTxt}>{m.desc}</Text>
      </View>

      {method !== 'USDT' && (
        <>
          <Text style={styles.fieldLabel}>{t('wal.destCountry')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            {COUNTRIES.map((c) => (
              <Pressable key={c.code} onPress={() => { tap(); setCountryCode(c.code); setBankName(''); }} style={[styles.chip, countryCode === c.code && styles.chipOn]}>
                <Text style={[styles.chipTxt, countryCode === c.code && styles.chipTxtOn]}>{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {method === 'USDT' && (
        <>
          <Text style={styles.fieldLabel}>{t('wal.usdtAddr')}</Text>
          <View style={styles.inputBox}>
            <Icon name="qr" size={16} color={colors.textTertiary} />
            <TextInput value={dest} onChangeText={setDest} placeholder={t('wal.usdtAddrPh')} placeholderTextColor={colors.textTertiary} style={styles.input} autoCapitalize="none" />
          </View>
          <View style={styles.kvRow}><Text style={styles.kvK}>{t('wal.usdtNet')}</Text><Text style={styles.kvV}>{t('wal.usdtNetVal')}</Text></View>
          <Text style={styles.fxNote}>{t('wal.usdtMin')}</Text>
        </>
      )}

      {method === 'PAYPAL' && (
        <>
          <Text style={styles.fieldLabel}>{t('wal.ppEmail')}</Text>
          <View style={styles.inputBox}>
            <Icon name="send" size={16} color={colors.textTertiary} />
            <TextInput value={dest} onChangeText={setDest} placeholder="paypal@correo.com" placeholderTextColor={colors.textTertiary} style={styles.input} autoCapitalize="none" keyboardType="email-address" />
          </View>
          <Text style={styles.fieldLabel}>{t('wal.ppName')}</Text>
          <View style={styles.inputBox}>
            <TextInput value={holderName} onChangeText={setHolderName} placeholder={t('wal.ppNamePh')} placeholderTextColor={colors.textTertiary} style={styles.input} />
          </View>
        </>
      )}

      {method === 'SWIFT' && (
        <>
          <Text style={styles.fieldLabel}>{t('wal.swQuick', { country: country.name })}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            {banksFor(countryCode).map((b) => (
              <Pressable key={b} onPress={() => { tap(); setBankName(b); }} style={[styles.chip, bankName === b && styles.chipOn]}>
                <Text style={[styles.chipTxt, bankName === b && styles.chipTxtOn]}>{b}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.fieldLabel}>{t('wal.swBank')}</Text>
          <View style={styles.inputBox}>
            <Icon name="bank" size={16} color={colors.textTertiary} />
            <TextInput value={bankName} onChangeText={setBankName} placeholder={t('wal.swBankPh')} placeholderTextColor={colors.textTertiary} style={styles.input} />
          </View>
          <Text style={styles.fieldLabel}>{t('wal.swCode')}</Text>
          <View style={styles.inputBox}>
            <TextInput value={swiftCode} onChangeText={(v) => setSwiftCode(v.toUpperCase().slice(0, 11))} placeholder={t('wal.swCodePh')} placeholderTextColor={colors.textTertiary} style={styles.input} autoCapitalize="characters" />
          </View>
          <Text style={styles.fieldLabel}>{t('wal.swAccount')}</Text>
          <View style={styles.inputBox}>
            <TextInput value={accountNum} onChangeText={setAccountNum} placeholder={t('wal.swAccountPh')} placeholderTextColor={colors.textTertiary} style={styles.input} autoCapitalize="none" />
          </View>
          <Text style={styles.fieldLabel}>{t('wal.swBenef')}</Text>
          <View style={styles.inputBox}>
            <TextInput value={holderName} onChangeText={setHolderName} placeholder={t('wal.swBenefPh')} placeholderTextColor={colors.textTertiary} style={styles.input} />
          </View>
        </>
      )}

      <Text style={styles.fieldLabel}>{t('wal.amountOut')}</Text>
      <View style={styles.inputBox}>
        <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textTertiary} style={styles.input} />
        <Pressable onPress={() => { tap(); const max = Math.max(0, (balance - m.feeFixed) / (1 + m.feePct)); setAmount(max > 0 ? max.toFixed(2) : ''); }}>
          <Text style={styles.maxTxt}>MAX</Text>
        </Pressable>
      </View>

      <View style={styles.feeBox}>
        <FeeRow k={t('wal.receive')} v={usd(net)} bold />
        {showLocal && (
          <FeeRow k={t('wal.equivalent', { cur: country.currency })} v={`${country.symbol} ${localAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`} gold />
        )}
        <View style={styles.divider} />
        <FeeRow k={t('wal.fee', { pct: (m.feePct * 100).toFixed(1), fixed: m.feeFixed })} v={usd(fee)} />
        <FeeRow k={t('wal.totalDebit')} v={usd(a + fee)} />
        <FeeRow k={t('wal.afterBalance')} v={usd(Math.max(0, balance - a - fee))} />
      </View>
      <Text style={styles.fxNote}>{t('wal.fxNote', { rate: country.rate, cur: country.currency })}</Text>

      {msg && (
        <View style={styles.msgRow}>
          <Icon name={msg.ok ? 'check-circle' : 'alert'} size={16} color={msg.ok ? colors.profit : colors.loss} />
          <Text style={[styles.msg, { color: msg.ok ? colors.profit : colors.loss }]}>{msg.text}</Text>
        </View>
      )}
      <Button label={t('wal.confirmOut')} onPress={submit} variant="gold" disabled={a <= 0 || a + fee > balance} style={{ marginTop: 14 }} />
    </Animated.View>
  );
}

// ============================== HISTORIAL ==============================

function History({ txs }: { txs: ReturnType<typeof useStore.getState>['walletTxs'] }) {
  const [filter, setFilter] = useState<'ALL' | 'IN' | 'OUT' | 'TRADE'>('ALL');
  const filtered = txs.filter((tx) => {
    if (filter === 'ALL') return true;
    if (filter === 'IN') return tx.type === 'DEPOSIT' || tx.type === 'BONUS';
    if (filter === 'OUT') return tx.type === 'WITHDRAW';
    return tx.type === 'TRADE';
  });

  return (
    <View style={{ paddingTop: 4 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
        {(['ALL', 'IN', 'OUT', 'TRADE'] as const).map((f) => (
          <Pressable key={f} onPress={() => { tap(); setFilter(f); }} style={[styles.chip, filter === f && styles.chipGold]}>
            <Text style={[styles.chipTxt, filter === f && styles.chipTxtGold]}>
              {{ ALL: t('wal.filterAll'), IN: t('wal.filterIn'), OUT: t('wal.filterOut'), TRADE: t('wal.filterTrade') }[f]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {filtered.length === 0 ? (
        <Text style={styles.emptyHist}>{t('wal.emptyHist')}</Text>
      ) : (
        filtered.map((tx) => (
          <View key={tx.id} style={styles.histRow}>
            <View style={[styles.histDot, { backgroundColor: tx.amount >= 0 ? colors.profitDim : colors.lossDim }]}>
              <Icon name={tx.amount >= 0 ? 'receive' : 'send'} size={15} color={tx.amount >= 0 ? colors.profit : colors.loss} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.histRef} numberOfLines={1}>{tx.reference}</Text>
              <Text style={styles.histTime}>{timeAgo(tx.timestamp)}</Text>
            </View>
            <Text style={[styles.histAmt, { color: tx.amount >= 0 ? colors.profit : colors.text }]}>{tx.amount >= 0 ? '+' : ''}{usd(tx.amount)}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const FeeRow = ({ k, v, bold, gold }: { k: string; v: string; bold?: boolean; gold?: boolean }) => (
  <View style={styles.feeRow}>
    <Text style={styles.feeK}>{k}</Text>
    <Text style={[styles.feeV, bold && { fontWeight: '800', fontSize: font.size.lg }, gold && { color: colors.gold, fontWeight: '800' }]}>{v}</Text>
  </View>
);

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, marginBottom: 16 },
  title: { color: colors.text, fontSize: font.size['2xl'], fontFamily: font.family.heading, textTransform: 'uppercase', letterSpacing: 1 },
  balanceCard: { padding: 20, marginHorizontal: spacing.xl, marginBottom: 16 },
  balanceLbl: { color: colors.textSecondary, fontSize: font.size.xs, fontWeight: '600', letterSpacing: 1.5 },
  balanceVal: { color: colors.text, fontSize: font.size['4xl'], marginTop: 6, letterSpacing: -1, fontFamily: font.family.heading },
  balanceNet: { color: colors.textTertiary, fontSize: font.size.xs, marginTop: 4 },
  balanceBreak: { flexDirection: 'row', alignItems: 'center', marginTop: 16, backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 12 },
  balanceBreakCol: { flex: 1, alignItems: 'center' },
  balanceBreakDiv: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  balanceBreakLbl: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '600' },
  balanceBreakVal: { color: colors.text, fontSize: font.size.md, fontWeight: '800', marginTop: 3 },
  tabs: { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: radius.md, padding: 4, marginHorizontal: spacing.xl, marginBottom: 18 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
  tabOn: { backgroundColor: colors.bgCardHover },
  tabTxt: { color: colors.textSecondary, fontWeight: '700', fontSize: font.size.sm },
  tabTxtOn: { color: colors.gold },
  methodRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  method: { flex: 1, gap: 6, backgroundColor: colors.bgCard, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  methodOn: { borderColor: colors.gold, backgroundColor: colors.goldDim },
  methodTxt: { color: colors.textSecondary, fontWeight: '700', fontSize: font.size.xs },
  methodTxtOn: { color: colors.gold },
  infoBox: { backgroundColor: colors.bgCard, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 14 },
  infoTitle: { color: colors.text, fontSize: font.size.sm, fontWeight: '800', marginBottom: 4 },
  infoTxt: { color: colors.textSecondary, fontSize: font.size.sm, lineHeight: 19 },
  fieldLabel: { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: '600', marginBottom: 8 },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bgCard, borderRadius: radius.md, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  input: { flex: 1, color: colors.text, fontSize: font.size.md, height: 52, fontWeight: '700' },
  suffix: { color: colors.textSecondary, fontWeight: '700' },
  maxTxt: { color: colors.gold, fontWeight: '800', fontSize: font.size.sm },
  quickAmts: { flexDirection: 'row', gap: 8 },
  quickAmt: { flex: 1, backgroundColor: colors.bgCard, borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  quickAmtTxt: { color: colors.text, fontWeight: '700', fontSize: font.size.sm },
  chip: { backgroundColor: colors.bgCard, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.goldDim, borderColor: colors.gold },
  chipGold: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipTxt: { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: '700' },
  chipTxtOn: { color: colors.gold },
  chipTxtGold: { color: '#1A1500' },
  addressBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bgCard, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.borderStrong, marginBottom: 12 },
  addressTxt: { color: colors.text, fontSize: font.size.sm, fontFamily: font.family.mono, flex: 1 },
  kvBox: { backgroundColor: colors.bgCard, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: 12 },
  kvK: { color: colors.textSecondary, fontSize: font.size.sm },
  kvV: { color: colors.text, fontSize: font.size.sm, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  feeBox: { backgroundColor: colors.bgCard, borderRadius: radius.md, padding: 16, borderWidth: 1, borderColor: colors.border },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  feeK: { color: colors.textSecondary, fontSize: font.size.sm },
  feeV: { color: colors.text, fontSize: font.size.md, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
  fxNote: { color: colors.textTertiary, fontSize: font.size.xs, marginTop: 8, lineHeight: 17 },
  msgRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 },
  msg: { fontSize: font.size.sm, fontWeight: '700' },
  emptyHist: { color: colors.textSecondary, fontSize: font.size.md, textAlign: 'center', marginTop: 20 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  histDot: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  histRef: { color: colors.text, fontSize: font.size.md, fontWeight: '600' },
  histTime: { color: colors.textTertiary, fontSize: font.size.xs, marginTop: 2 },
  histAmt: { fontSize: font.size.md, fontWeight: '800' },
}));
