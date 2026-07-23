import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  Fingerprint,
  Landmark,
  Pencil,
  QrCode,
  ReceiptText,
  Send,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react-native'

// Credenciales Genesis ID (KYB) por comercio demo — mismos UID que el motor.
const GENESIS_CREDS: Record<string, { owner: string; biz: string }> = {
  'mtp-demo-cafe': { owner: 'GEN-1101-2201', biz: 'GNB-1101-2201' },
  'mtp-demo-hotel': { owner: 'GEN-1102-2202', biz: 'GNB-1102-2202' },
  'mtp-demo-gym': { owner: 'GEN-1103-2203', biz: 'GNB-1103-2203' },
  'mtp-demo-tech': { owner: 'GEN-1104-2204', biz: 'GNB-1104-2204' },
}
import { api } from '../src/lib/api'
import type { Company } from '../src/lib/types'
import { AnimatedPressable } from '../src/components/AnimatedPressable'
import { AnimatedScreen } from '../src/components/AnimatedScreen'
import { Card } from '../src/components/ui/Card'
import { GradientButton } from '../src/components/ui/GradientButton'
import { SelectField } from '../src/components/ui/SelectField'
import { useBusinessStore, isCashoutError, type Cashout } from '../src/store/business'
import { useNotificationsStore } from '../src/store/notifications'
import { payoutInfo, origenToLocal, fmtLocal, fmtOrigen, fmtUsd } from '../src/lib/commerce'
import { ORIGEN_USD } from '../src/store/wallet'
import { fonts, radius, shadow } from '../src/lib/theme'
import { useTheme, type ThemeColors } from '../src/hooks/useTheme'

type Stage = 'dash' | 'cashout' | 'done'

export default function BusinessPanel() {
  const router = useRouter()
  const { colors, gradient } = useTheme()
  const styles = createStyles(colors)
  const business = useBusinessStore()
  const pushNotif = useNotificationsStore((s) => s.push)

  const [company, setCompany] = useState<Company | null | undefined>(undefined)
  const [stage, setStage] = useState<Stage>('dash')
  const [amount, setAmount] = useState('')
  const [bank, setBank] = useState('')
  const [account, setAccount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lastCashout, setLastCashout] = useState<Cashout | null>(null)

  useEffect(() => {
    api.myCompany().then(({ company }) => setCompany(company)).catch(() => setCompany(null))
  }, [])

  const info = useMemo(() => payoutInfo(company?.countrySlug ?? ''), [company?.countrySlug])
  const balance = company ? business.balanceOf(company.id) : 0
  const sales = company ? business.salesOf(company.id) : []
  const cashouts = company ? business.cashoutsOf(company.id) : []

  const now = Date.now()
  const salesToday = sales.filter((s) => now - new Date(s.createdAt).getTime() < 24 * 3600_000)
  const todayOrigen = salesToday.reduce((a, s) => a + s.totalOrigen, 0)
  const avgTicket = sales.length ? sales.reduce((a, s) => a + s.totalOrigen, 0) / sales.length : 0

  const amountNum = parseFloat(amount.replace(',', '.')) || 0
  const amountLocal = origenToLocal(amountNum, info)

  function submitCashout() {
    if (!company) return
    const res = business.requestCashout({
      companyId: company.id,
      amountOrigen: amountNum,
      amountLocal,
      currency: info.currency,
      bank,
      account,
    })
    if (isCashoutError(res)) {
      setError(res.error)
      return
    }
    setError(null)
    setLastCashout(res)
    pushNotif({
      kind: 'wallet',
      title: 'Retiro en proceso',
      body: `Retiro de ${fmtOrigen(res.amountOrigen)} ORIGEN (${fmtLocal(res.amountLocal, info)}) a ${res.bank} ${res.accountMasked}. Se descontó de la Veta Wallet del negocio.`,
    })
    setStage('done')
  }

  if (company === undefined) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.blue} />
      </SafeAreaView>
    )
  }

  if (company === null) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.emptyTitle}>Aún no tienes una empresa registrada</Text>
        <GradientButton label="Registrar mi empresa" onPress={() => router.replace('/registrar-empresa')} style={{ marginTop: 16 }} />
      </SafeAreaView>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <AnimatedPressable onPress={() => (stage === 'dash' ? router.back() : setStage('dash'))} style={styles.iconBtn}>
          <ArrowLeft size={16} color={colors.text} />
        </AnimatedPressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.topTitle}>{stage === 'cashout' ? 'Retirar fondos' : 'Panel del negocio'}</Text>
          <Text style={styles.topSub}>{company.tradeName}</Text>
        </View>
        <AnimatedPressable onPress={() => router.push(`/negocio/${company.id}`)} style={styles.iconBtn}>
          <ExternalLink size={14} color={colors.text} />
        </AnimatedPressable>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <AnimatedScreen fill={false} animKey={stage} style={{ gap: 16 }}>
          {/* ============ DASHBOARD ============ */}
          {stage === 'dash' && (
            <>
              <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balCard}>
                <View style={styles.balTop}>
                  <View style={styles.balChip}>
                    <Wallet size={11} color={colors.bg} />
                    <Text style={styles.balChipText}>Veta Wallet del negocio · sincronizada</Text>
                  </View>
                </View>
                <Text style={styles.balNumber}>{fmtOrigen(balance)} ORIGEN</Text>
                <Text style={styles.balLabel}>
                  ≈ {fmtLocal(origenToLocal(balance, info), info)} · {fmtUsd(balance * ORIGEN_USD)}
                </Text>
              </LinearGradient>

              {/* Credencial Genesis ID del negocio (KYB) */}
              {(() => {
                const cred = GENESIS_CREDS[company.id]
                if (!cred) return null
                return (
                  <View style={styles.credCard}>
                    <View style={styles.credIcon}>
                      <Fingerprint size={18} color={colors.cyan} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.credTitle}>Genesis ID · Negocio verificado</Text>
                        <BadgeCheck size={13} color={colors.ok} />
                      </View>
                      <Text style={styles.credUid}>{cred.biz}</Text>
                      <Text style={styles.credOwner}>Titular: {cred.owner}</Text>
                    </View>
                  </View>
                )
              })()}

              <View style={styles.statsRow}>
                <Card style={styles.statCard}>
                  <TrendingUp size={16} color={colors.ok} />
                  <Text style={styles.statNum}>{fmtOrigen(todayOrigen)}</Text>
                  <Text style={styles.statLbl}>ORIGEN hoy</Text>
                </Card>
                <Card style={styles.statCard}>
                  <ReceiptText size={16} color={colors.violet} />
                  <Text style={styles.statNum}>{sales.length}</Text>
                  <Text style={styles.statLbl}>Cobros totales</Text>
                </Card>
                <Card style={styles.statCard}>
                  <Banknote size={16} color={colors.cyan} />
                  <Text style={styles.statNum}>{fmtOrigen(avgTicket)}</Text>
                  <Text style={styles.statLbl}>Ticket promedio</Text>
                </Card>
              </View>

              <View style={styles.actionRow}>
                <AnimatedPressable onPress={() => { setAmount(''); setBank(''); setAccount(''); setError(null); setStage('cashout') }} scaleTo={0.96} style={{ flex: 1 }}>
                  <LinearGradient colors={gradient as unknown as string[]} style={styles.cashoutBtn}>
                    <Landmark size={17} color={colors.bg} />
                    <Text style={styles.cashoutTxt}>Retirar a mi banco</Text>
                  </LinearGradient>
                </AnimatedPressable>
                <AnimatedPressable onPress={() => router.push('/mi-empresa')} scaleTo={0.96} style={styles.editBtn}>
                  <Pencil size={15} color={colors.text} />
                  <Text style={styles.editTxt}>Editar perfil</Text>
                </AnimatedPressable>
              </View>

              <View>
                <Text style={styles.blockTitle}>Cobros recibidos</Text>
                {sales.length === 0 ? (
                  <Card><Text style={styles.emptyRow}>Todavía no hay cobros. Comparte tu menú y cobra con QR.</Text></Card>
                ) : (
                  <View style={{ gap: 10 }}>
                    {sales.slice(0, 8).map((s) => (
                      <Card key={s.id} style={styles.saleRow}>
                        <View style={styles.saleIcon}>
                          {s.method === 'qr' ? <QrCode size={16} color={colors.cyan} /> : s.method === 'split' ? <Users size={16} color={colors.violet} /> : <Wallet size={16} color={colors.ok} />}
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.salePayer} numberOfLines={1}>{s.payer} · {s.invoiceId}</Text>
                          <Text style={styles.saleMeta}>
                            {s.items.reduce((a, i) => a + i.qty, 0)} ítems
                            {s.tipOrigen > 0 ? ` · propina ${fmtOrigen(s.tipOrigen)}` : ''} ·{' '}
                            {new Date(s.createdAt).toLocaleDateString('es-HN', { day: 'numeric', month: 'short' })}{' '}
                            {new Date(s.createdAt).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        <Text style={styles.saleAmt}>+{fmtOrigen(s.totalOrigen)}</Text>
                      </Card>
                    ))}
                  </View>
                )}
              </View>

              {cashouts.length > 0 && (
                <View>
                  <Text style={styles.blockTitle}>Retiros</Text>
                  <View style={{ gap: 10 }}>
                    {cashouts.slice(0, 5).map((c) => (
                      <Card key={c.id} style={styles.saleRow}>
                        <View style={[styles.saleIcon, { backgroundColor: colors.warn + '18' }]}>
                          <Send size={15} color={colors.warn} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.salePayer}>{c.bank} · {c.accountMasked}</Text>
                          <Text style={styles.saleMeta}>
                            {new Date(c.createdAt).toLocaleDateString('es-HN', { day: 'numeric', month: 'short' })} · {c.id}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.saleAmt, { color: colors.warn }]}>-{fmtOrigen(c.amountOrigen)}</Text>
                          <Text style={styles.saleMeta}>{fmtLocal(c.amountLocal, info)}</Text>
                        </View>
                      </Card>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}

          {/* ============ CASH OUT ============ */}
          {stage === 'cashout' && (
            <>
              <Card style={{ gap: 4 }}>
                <Text style={styles.coLabel}>Saldo disponible</Text>
                <Text style={styles.coBalance}>{fmtOrigen(balance)} ORIGEN</Text>
                <Text style={styles.coLocal}>≈ {fmtLocal(origenToLocal(balance, info), info)}</Text>
              </Card>

              <View>
                <Text style={styles.fieldLabel}>Monto a retirar (ORIGEN)</Text>
                <View style={styles.amountRow}>
                  <TextInput
                    value={amount}
                    onChangeText={(v) => { setAmount(v); setError(null) }}
                    placeholder="0.00"
                    placeholderTextColor={colors.muted2}
                    keyboardType="decimal-pad"
                    style={styles.amountInput}
                  />
                  <AnimatedPressable onPress={() => setAmount(String(balance))} scaleTo={0.94} style={styles.allChip}>
                    <Text style={styles.allChipTxt}>Todo</Text>
                  </AnimatedPressable>
                </View>
                <Text style={styles.convPreview}>
                  Recibirás ≈ <Text style={{ color: colors.text, fontFamily: fonts.bodySemiBold }}>{fmtLocal(amountLocal, info)}</Text>
                  {'  '}(tasa: 1 ORIGEN = {fmtLocal(origenToLocal(1, info), info)})
                </Text>
              </View>

              <SelectField
                label={`Banco de destino (${info.currency})`}
                value={bank}
                onChange={setBank}
                options={info.banks.map((b) => ({ value: b, label: b }))}
              />

              <View>
                <Text style={styles.fieldLabel}>Número de cuenta</Text>
                <TextInput
                  value={account}
                  onChangeText={(v) => { setAccount(v); setError(null) }}
                  placeholder="Ej. 01-234-567890"
                  placeholderTextColor={colors.muted2}
                  keyboardType="number-pad"
                  style={styles.accountInput}
                />
              </View>

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <GradientButton
                label={amountNum > 0 ? `Retirar ${fmtOrigen(amountNum)} ORIGEN` : 'Retirar'}
                onPress={submitCashout}
                disabled={amountNum <= 0 || !bank || account.trim().length === 0}
                icon={<Landmark size={16} color={colors.bg} />}
              />
              <Text style={styles.coNote}>
                El retiro se descuenta del único saldo ORIGEN del negocio — Veta Wallet y MyTokenPay
                siempre reflejan el mismo monto. Acreditación bancaria simulada: 1 día hábil.
              </Text>
            </>
          )}

          {/* ============ ÉXITO ============ */}
          {stage === 'done' && lastCashout && (
            <View style={{ alignItems: 'center', gap: 10 }}>
              <View style={styles.okBadge}>
                <CheckCircle2 size={42} color={colors.ok} />
              </View>
              <Text style={styles.okTitle}>Retiro en proceso</Text>
              <Text style={styles.okAmt}>{fmtLocal(lastCashout.amountLocal, info)}</Text>
              <Text style={styles.okSub}>-{fmtOrigen(lastCashout.amountOrigen)} ORIGEN de la Veta Wallet del negocio</Text>
              <Card style={{ alignSelf: 'stretch', marginTop: 8 }}>
                <RowKV k="Banco" v={lastCashout.bank} colors={colors} />
                <RowKV k="Cuenta" v={lastCashout.accountMasked} colors={colors} />
                <RowKV k="Referencia" v={lastCashout.id} colors={colors} />
                <RowKV k="Nuevo saldo" v={`${fmtOrigen(balance)} ORIGEN`} colors={colors} />
                <RowKV k="Acreditación" v="1 día hábil (simulado)" colors={colors} />
              </Card>
              <GradientButton label="Volver al panel" onPress={() => setStage('dash')} style={{ alignSelf: 'stretch', marginTop: 10 }} icon={<ArrowRight size={16} color={colors.bg} />} />
            </View>
          )}
        </AnimatedScreen>
      </ScrollView>
    </View>
  )
}

function RowKV({ k, v, colors }: { k: string; v: string; colors: ThemeColors }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ color: colors.muted, fontFamily: fonts.body, fontSize: 12.5 }}>{k}</Text>
      <Text style={{ color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 12.5 }}>{v}</Text>
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 8, paddingHorizontal: 40 },
    emptyTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 15, textAlign: 'center' },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    iconBtn: { width: 32, height: 32, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    topTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
    topSub: { color: colors.muted2, fontFamily: fonts.body, fontSize: 10.5, marginTop: 1 },

    balCard: { borderRadius: radius.xl, padding: 20, ...shadow(colors.violet, 'lg') },
    balTop: { flexDirection: 'row', marginBottom: 10 },
    balChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(5,6,10,0.18)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
    balChipText: { color: colors.bg, fontFamily: fonts.bodySemiBold, fontSize: 10 },
    balNumber: { color: colors.bg, fontFamily: fonts.displayBold, fontSize: 32 },
    balLabel: { color: colors.bg, opacity: 0.85, fontFamily: fonts.bodySemiBold, fontSize: 12, marginTop: 3 },

    credCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.cyan + '35',
      backgroundColor: colors.cyan + '0E',
      borderRadius: radius.lg,
      padding: 14,
    },
    credIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.cyan + '1C', alignItems: 'center', justifyContent: 'center' },
    credTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 12.5 },
    credUid: { color: colors.cyan, fontFamily: fonts.displayBold, fontSize: 16, letterSpacing: 0.5, marginTop: 3 },
    credOwner: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
    statsRow: { flexDirection: 'row', gap: 10 },
    statCard: { flex: 1, gap: 6, alignItems: 'flex-start', padding: 13 },
    statNum: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 16 },
    statLbl: { color: colors.muted, fontFamily: fonts.body, fontSize: 10.5 },

    actionRow: { flexDirection: 'row', gap: 10 },
    cashoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, paddingVertical: 14 },
    cashoutTxt: { color: colors.bg, fontFamily: fonts.displayMedium, fontSize: 13.5 },
    editBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: 16,
    },
    editTxt: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 12.5 },

    blockTitle: { color: colors.muted2, fontFamily: fonts.bodySemiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
    emptyRow: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18 },
    saleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
    saleIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
    salePayer: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 13 },
    saleMeta: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
    saleAmt: { color: colors.ok, fontFamily: fonts.displayBold, fontSize: 14.5 },

    coLabel: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
    coBalance: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 26 },
    coLocal: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5 },
    fieldLabel: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 12, marginBottom: 7 },
    amountRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    amountInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 13,
      color: colors.text,
      fontFamily: fonts.displayBold,
      fontSize: 18,
    },
    allChip: { borderWidth: 1, borderColor: colors.cyan + '55', backgroundColor: colors.cyan + '14', borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 12 },
    allChipTxt: { color: colors.cyan, fontFamily: fonts.bodySemiBold, fontSize: 12.5 },
    convPreview: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginTop: 8, lineHeight: 17 },
    accountInput: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 13,
      color: colors.text,
      fontFamily: fonts.bodyMedium,
      fontSize: 14,
    },
    errorBox: { borderWidth: 1, borderColor: colors.danger + '55', backgroundColor: colors.danger + '18', borderRadius: radius.sm, padding: 10 },
    errorText: { color: colors.danger, fontFamily: fonts.body, fontSize: 12 },
    coNote: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, textAlign: 'center' },

    okBadge: {
      width: 90,
      height: 90,
      borderRadius: 45,
      backgroundColor: colors.ok + '16',
      borderWidth: 2,
      borderColor: colors.ok + '55',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    okTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 21 },
    okAmt: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 28 },
    okSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, textAlign: 'center' },
  })
}
