import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Minus,
  Plus,
  QrCode,
  ReceiptText,
  Users,
  Wallet,
  X,
} from 'lucide-react-native'
import { AnimatedPressable } from '../src/components/AnimatedPressable'
import { AnimatedScreen } from '../src/components/AnimatedScreen'
import { GradientButton } from '../src/components/ui/GradientButton'
import { Card } from '../src/components/ui/Card'
import { QrBadge } from '../src/components/QrBadge'
import { useCartStore, cartTotalUsd } from '../src/store/cart'
import { useWalletStore, isPayError, ORIGEN_USD } from '../src/store/wallet'
import { useBusinessStore } from '../src/store/business'
import { useAuthStore } from '../src/store/auth'
import { useNotificationsStore } from '../src/store/notifications'
import { toOrigen, fmtOrigen, fmtUsd } from '../src/lib/commerce'
import { fonts, radius, shadow } from '../src/lib/theme'
import { useTheme, type ThemeColors } from '../src/hooks/useTheme'

type Stage = 'invoice' | 'qr' | 'split' | 'success'
const TIPS = [0, 5, 10, 15]
const MAX_FRIENDS = 4

interface SplitPerson {
  label: string
  amount: number
  paid: boolean
}

export default function Cobro() {
  const router = useRouter()
  const { colors, gradient } = useTheme()
  const styles = createStyles(colors)
  const cart = useCartStore()
  const wallet = useWalletStore()
  const business = useBusinessStore()
  const user = useAuthStore((s) => s.user)
  const pushNotif = useNotificationsStore((s) => s.push)

  const [stage, setStage] = useState<Stage>('invoice')
  const [tipPct, setTipPct] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [invoiceId] = useState(() => `INV-${Date.now().toString(36).toUpperCase().slice(-6)}`)
  const [successInfo, setSuccessInfo] = useState<{ method: string; total: number } | null>(null)

  // split state
  const [friends, setFriends] = useState(2)
  const [manualMode, setManualMode] = useState(false)
  const [manualAmounts, setManualAmounts] = useState<string[]>(['', '', '', ''])
  const [splitPeople, setSplitPeople] = useState<SplitPerson[] | null>(null)

  const subtotalUsd = cartTotalUsd(cart.lines)
  const subtotalOr = toOrigen(subtotalUsd)
  const tipOr = Math.round(subtotalOr * tipPct) / 100
  const totalOr = Math.round((subtotalOr + tipOr) * 100) / 100
  const totalUsd = totalOr * ORIGEN_USD

  const saleItems = useMemo(
    () => cart.lines.map((l) => ({ name: l.item.name, qty: l.qty, priceOrigen: toOrigen(l.item.priceUsd) })),
    [cart.lines],
  )

  function finishSale(method: 'wallet' | 'qr' | 'split', payer: string) {
    if (!cart.companyId) return
    business.recordSale({
      companyId: cart.companyId,
      invoiceId,
      payer,
      method,
      items: saleItems,
      tipOrigen: tipOr,
      totalOrigen: totalOr,
    })
    pushNotif({
      kind: 'wallet',
      title: 'Cobro acreditado',
      body: `${cart.companyName} recibió ${fmtOrigen(totalOr)} ORIGEN (factura ${invoiceId}). Ya está en su Veta Wallet.`,
    })
    setSuccessInfo({ method: method === 'wallet' ? 'Veta Wallet' : method === 'qr' ? 'Código QR' : 'Cuenta dividida', total: totalOr })
    setStage('success')
  }

  function payWithWallet() {
    const res = wallet.pay({
      merchant: cart.companyName,
      merchantId: cart.companyId,
      amountOrigen: totalOr,
      method: 'qr',
      note: `Factura ${invoiceId}`,
    })
    if (isPayError(res)) {
      setError(res.error)
      return
    }
    setError(null)
    finishSale('wallet', user?.fullName ?? 'Cliente')
  }

  // ---- split helpers ----
  function buildEqualSplit(n: number): SplitPerson[] {
    const base = Math.floor((totalOr / n) * 100) / 100
    const people: SplitPerson[] = []
    let acc = 0
    for (let i = 0; i < n; i++) {
      const amount = i === n - 1 ? Math.round((totalOr - acc) * 100) / 100 : base
      acc += amount
      people.push({ label: `Persona ${i + 1}`, amount, paid: false })
    }
    return people
  }

  function generateSplit() {
    if (!manualMode) {
      setSplitPeople(buildEqualSplit(friends))
      setError(null)
      return
    }
    const amounts = manualAmounts.slice(0, friends).map((v) => parseFloat(v.replace(',', '.')) || 0)
    const sum = Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100
    if (amounts.some((a) => a <= 0)) {
      setError('Cada persona debe pagar un monto mayor a 0.')
      return
    }
    if (Math.abs(sum - totalOr) > 0.01) {
      setError(`La suma (${fmtOrigen(sum)}) debe ser igual al total (${fmtOrigen(totalOr)} ORIGEN).`)
      return
    }
    setError(null)
    setSplitPeople(amounts.map((amount, i) => ({ label: `Persona ${i + 1}`, amount, paid: false })))
  }

  function markPaid(index: number) {
    if (!splitPeople) return
    const next = splitPeople.map((p, i) => (i === index ? { ...p, paid: true } : p))
    setSplitPeople(next)
    if (next.every((p) => p.paid)) {
      finishSale('split', `${next.length} personas`)
    }
  }

  function closeAll() {
    cart.clear()
    router.back()
  }

  if (!cart.companyId || (cart.lines.length === 0 && stage !== 'success')) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopHeader title="Factura" onBack={() => router.back()} colors={colors} styles={styles} />
        <View style={styles.emptyWrap}>
          <ReceiptText size={34} color={colors.muted2} />
          <Text style={styles.emptyText}>No hay productos seleccionados. Vuelve al comercio y agrega ítems del menú.</Text>
        </View>
      </View>
    )
  }

  const qrPayload = `mtp:cobro?c=${cart.companyId}&inv=${invoiceId}&a=${totalOr}`

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopHeader
        title={stage === 'split' ? 'Dividir cuenta' : stage === 'qr' ? 'QR de cobro' : 'Factura'}
        sub={cart.companyName}
        onBack={() => (stage === 'invoice' || stage === 'success' ? router.back() : setStage('invoice'))}
        colors={colors}
        styles={styles}
      />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <AnimatedScreen fill={false} animKey={stage} style={{ gap: 16 }}>
          {/* ================= FACTURA ================= */}
          {stage === 'invoice' && (
            <>
              <Card style={{ gap: 2 }}>
                <View style={styles.invHead}>
                  <Text style={styles.invId}>{invoiceId}</Text>
                  <Text style={styles.invDate}>{new Date().toLocaleDateString('es-HN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                </View>
                {cart.lines.map((l) => (
                  <View key={l.item.id} style={styles.line}>
                    <View style={styles.lineQtyWrap}>
                      <AnimatedPressable onPress={() => cart.remove(l.item.id)} scaleTo={0.85} style={styles.lineBtn}>
                        <Minus size={12} color={colors.text} />
                      </AnimatedPressable>
                      <Text style={styles.lineQty}>{l.qty}</Text>
                      <AnimatedPressable onPress={() => cart.add(l.item)} scaleTo={0.85} style={styles.lineBtn}>
                        <Plus size={12} color={colors.text} />
                      </AnimatedPressable>
                    </View>
                    <Text style={styles.lineName} numberOfLines={1}>{l.item.name}</Text>
                    <Text style={styles.lineAmt}>{fmtOrigen(toOrigen(l.item.priceUsd) * l.qty)}</Text>
                  </View>
                ))}
                <View style={styles.divider} />
                <Row k="Subtotal" v={`${fmtOrigen(subtotalOr)} ORIGEN`} colors={colors} />
                <Row k={`Propina (${tipPct}%)`} v={`${fmtOrigen(tipOr)} ORIGEN`} colors={colors} />
                <View style={styles.totalRow}>
                  <Text style={styles.totalK}>Total</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.totalV}>{fmtOrigen(totalOr)} ORIGEN</Text>
                    <Text style={styles.totalUsd}>≈ {fmtUsd(totalUsd)}</Text>
                  </View>
                </View>
              </Card>

              <View>
                <Text style={styles.tipLabel}>Propina</Text>
                <View style={styles.tipRow}>
                  {TIPS.map((t) => (
                    <AnimatedPressable key={t} onPress={() => setTipPct(t)} scaleTo={0.94} style={[styles.tipChip, tipPct === t && styles.tipChipOn]}>
                      <Text style={[styles.tipTxt, tipPct === t && { color: colors.bg }]}>{t === 0 ? 'Sin' : `${t}%`}</Text>
                    </AnimatedPressable>
                  ))}
                </View>
              </View>

              {error && <ErrorBox msg={error} colors={colors} />}

              <GradientButton
                label={`Pagar con Veta Wallet · ${fmtOrigen(totalOr)} ORIGEN`}
                onPress={payWithWallet}
                icon={<Wallet size={16} color={colors.bg} />}
              />
              <Text style={styles.walletHint}>
                Saldo disponible: {fmtOrigen(wallet.origenBalance)} ORIGEN
              </Text>

              <View style={styles.altRow}>
                <AnimatedPressable onPress={() => setStage('qr')} scaleTo={0.96} style={styles.altBtn}>
                  <QrCode size={18} color={colors.cyan} />
                  <Text style={styles.altTitle}>QR de cobro</Text>
                  <Text style={styles.altHint}>Escanéalo con MyTokenPay o Veta Wallet</Text>
                </AnimatedPressable>
                <AnimatedPressable onPress={() => { setSplitPeople(null); setStage('split') }} scaleTo={0.96} style={styles.altBtn}>
                  <Users size={18} color={colors.violet} />
                  <Text style={styles.altTitle}>Dividir cuenta</Text>
                  <Text style={styles.altHint}>Hasta {MAX_FRIENDS} personas, un QR cada una</Text>
                </AnimatedPressable>
              </View>
            </>
          )}

          {/* ================= QR ÚNICO ================= */}
          {stage === 'qr' && (
            <View style={{ alignItems: 'center', gap: 14 }}>
              <Text style={styles.qrAmount}>{fmtOrigen(totalOr)} ORIGEN</Text>
              <Text style={styles.qrUsd}>≈ {fmtUsd(totalUsd)} · Factura {invoiceId}</Text>
              <View style={styles.qrCard}>
                <QrBadge payload={qrPayload} size={230} />
              </View>
              <Text style={styles.qrHint}>
                Pídele al cliente que lo escanee con MyTokenPay o Veta Wallet. El monto se acredita
                al instante en la Veta Wallet del comercio.
              </Text>
              <GradientButton
                label="Simular pago escaneado"
                onPress={() => finishSale('qr', 'Cliente con QR')}
                icon={<CheckCircle2 size={16} color={colors.bg} />}
                style={{ alignSelf: 'stretch' }}
              />
              <AnimatedPressable onPress={() => setStage('invoice')} style={styles.cancelLink}>
                <X size={13} color={colors.muted} />
                <Text style={styles.cancelTxt}>Volver a la factura</Text>
              </AnimatedPressable>
            </View>
          )}

          {/* ================= DIVIDIR CUENTA ================= */}
          {stage === 'split' && !splitPeople && (
            <>
              <Card style={{ gap: 14 }}>
                <Text style={styles.splitTitle}>¿Entre cuántos dividen {fmtOrigen(totalOr)} ORIGEN?</Text>
                <View style={styles.friendRow}>
                  {[2, 3, 4].map((n) => (
                    <AnimatedPressable key={n} onPress={() => setFriends(n)} scaleTo={0.92} style={[styles.friendChip, friends === n && styles.friendChipOn]}>
                      <Users size={15} color={friends === n ? colors.bg : colors.muted} />
                      <Text style={[styles.friendTxt, friends === n && { color: colors.bg }]}>{n}</Text>
                    </AnimatedPressable>
                  ))}
                </View>

                <View style={styles.modeRow}>
                  <AnimatedPressable onPress={() => setManualMode(false)} scaleTo={0.97} style={[styles.modeBtn, !manualMode && styles.modeOn]}>
                    <Text style={[styles.modeTxt, !manualMode && { color: colors.text }]}>Partes iguales</Text>
                  </AnimatedPressable>
                  <AnimatedPressable onPress={() => setManualMode(true)} scaleTo={0.97} style={[styles.modeBtn, manualMode && styles.modeOn]}>
                    <Text style={[styles.modeTxt, manualMode && { color: colors.text }]}>Montos manuales</Text>
                  </AnimatedPressable>
                </View>

                {manualMode ? (
                  <View style={{ gap: 10 }}>
                    {Array.from({ length: friends }).map((_, i) => (
                      <View key={i} style={styles.manualRow}>
                        <Text style={styles.manualLabel}>Persona {i + 1}</Text>
                        <TextInput
                          value={manualAmounts[i]}
                          onChangeText={(v) => {
                            const next = [...manualAmounts]
                            next[i] = v
                            setManualAmounts(next)
                            setError(null)
                          }}
                          placeholder="0.00"
                          placeholderTextColor={colors.muted2}
                          keyboardType="decimal-pad"
                          style={styles.manualInput}
                        />
                        <Text style={styles.manualUnit}>ORIGEN</Text>
                      </View>
                    ))}
                    <Text style={styles.manualHint}>La suma debe dar exactamente {fmtOrigen(totalOr)} ORIGEN.</Text>
                  </View>
                ) : (
                  <Text style={styles.equalPreview}>
                    Cada quien paga ≈ {fmtOrigen(Math.round((totalOr / friends) * 100) / 100)} ORIGEN
                  </Text>
                )}
              </Card>

              {error && <ErrorBox msg={error} colors={colors} />}

              <GradientButton label="Generar códigos QR" onPress={generateSplit} icon={<QrCode size={16} color={colors.bg} />} />
            </>
          )}

          {stage === 'split' && splitPeople && (
            <>
              <Text style={styles.splitProgress}>
                {splitPeople.filter((p) => p.paid).length} de {splitPeople.length} pagos recibidos · Factura {invoiceId}
              </Text>
              {splitPeople.map((p, i) => (
                <Card key={i} style={styles.personCard}>
                  <View style={{ alignItems: 'center', gap: 8 }}>
                    <QrBadge payload={`${qrPayload}&p=${i + 1}&pa=${p.amount}`} size={150} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.personLabel}>{p.label}</Text>
                    <Text style={styles.personAmt}>{fmtOrigen(p.amount)} ORIGEN</Text>
                    <Text style={styles.personUsd}>≈ {fmtUsd(p.amount * ORIGEN_USD)}</Text>
                    {p.paid ? (
                      <View style={styles.paidPill}>
                        <CheckCircle2 size={13} color={colors.ok} />
                        <Text style={styles.paidTxt}>Pagado</Text>
                      </View>
                    ) : (
                      <AnimatedPressable onPress={() => markPaid(i)} scaleTo={0.95}>
                        <LinearGradient colors={gradient as unknown as string[]} style={styles.simBtn}>
                          <Text style={styles.simTxt}>Simular pago</Text>
                        </LinearGradient>
                      </AnimatedPressable>
                    )}
                  </View>
                </Card>
              ))}
              <AnimatedPressable onPress={() => setSplitPeople(null)} style={styles.cancelLink}>
                <X size={13} color={colors.muted} />
                <Text style={styles.cancelTxt}>Cambiar la división</Text>
              </AnimatedPressable>
            </>
          )}

          {/* ================= ÉXITO ================= */}
          {stage === 'success' && successInfo && (
            <View style={{ alignItems: 'center', gap: 10 }}>
              <View style={styles.okBadge}>
                <CheckCircle2 size={42} color={colors.ok} />
              </View>
              <Text style={styles.okTitle}>Cobro acreditado</Text>
              <Text style={styles.okAmt}>+{fmtOrigen(successInfo.total)} ORIGEN</Text>
              <Text style={styles.okSub}>
                {cart.companyName} · {successInfo.method} · Factura {invoiceId}
              </Text>
              <Card style={{ alignSelf: 'stretch', marginTop: 8 }}>
                <Row k="Acreditado en" v="Veta Wallet del comercio" colors={colors} />
                <Row k="Visible en" v="MyTokenPay · panel del negocio" colors={colors} />
                <Row k="Estado" v="Confirmado en Orden Global" colors={colors} />
              </Card>
              <GradientButton label="Listo" onPress={closeAll} style={{ alignSelf: 'stretch', marginTop: 10 }} icon={<ArrowRight size={16} color={colors.bg} />} />
            </View>
          )}
        </AnimatedScreen>
      </ScrollView>
    </View>
  )
}

function TopHeader({ title, sub, onBack, colors, styles }: { title: string; sub?: string; onBack: () => void; colors: ThemeColors; styles: ReturnType<typeof createStyles> }) {
  return (
    <SafeAreaView edges={['top']} style={styles.topBar}>
      <AnimatedPressable onPress={onBack} style={styles.iconBtn}>
        <ArrowLeft size={16} color={colors.text} />
      </AnimatedPressable>
      <View style={{ alignItems: 'center' }}>
        <Text style={styles.topTitle}>{title}</Text>
        {sub ? <Text style={styles.topSub}>{sub}</Text> : null}
      </View>
      <View style={{ width: 32 }} />
    </SafeAreaView>
  )
}

function Row({ k, v, colors }: { k: string; v: string; colors: ThemeColors }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ color: colors.muted, fontFamily: fonts.body, fontSize: 12.5 }}>{k}</Text>
      <Text style={{ color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 12.5 }}>{v}</Text>
    </View>
  )
}

function ErrorBox({ msg, colors }: { msg: string; colors: ThemeColors }) {
  return (
    <View style={{ borderWidth: 1, borderColor: colors.danger + '55', backgroundColor: colors.danger + '18', borderRadius: radius.sm, padding: 10 }}>
      <Text style={{ color: colors.danger, fontFamily: fonts.body, fontSize: 12 }}>{msg}</Text>
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
    topSub: { color: colors.muted2, fontFamily: fonts.body, fontSize: 10.5, marginTop: 1 },

    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 14 },
    emptyText: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, textAlign: 'center', lineHeight: 19 },

    invHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    invId: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 14 },
    invDate: { color: colors.muted2, fontFamily: fonts.body, fontSize: 12 },
    line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
    lineQtyWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    lineBtn: { width: 24, height: 24, borderRadius: 7, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
    lineQty: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 12.5, minWidth: 18, textAlign: 'center' },
    lineName: { flex: 1, color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 13 },
    lineAmt: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 13 },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
    totalK: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
    totalV: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 19 },
    totalUsd: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11.5, marginTop: 1 },

    tipLabel: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    tipRow: { flexDirection: 'row', gap: 8 },
    tipChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    tipChipOn: { backgroundColor: colors.violet, borderColor: colors.violet },
    tipTxt: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 12.5 },

    walletHint: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11.5, textAlign: 'center' },

    altRow: { flexDirection: 'row', gap: 12 },
    altBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: 14,
      gap: 6,
    },
    altTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 13.5, marginTop: 4 },
    altHint: { color: colors.muted2, fontFamily: fonts.body, fontSize: 10.5, lineHeight: 14 },

    qrAmount: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 30 },
    qrUsd: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5 },
    qrCard: { padding: 14, backgroundColor: '#FFFFFF', borderRadius: radius.xl, ...shadow(colors.cyan, 'lg') },
    qrHint: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },
    cancelLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: 10 },
    cancelTxt: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 12.5 },

    splitTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 15, textAlign: 'center' },
    friendRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
    friendChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: 18,
      paddingVertical: 11,
    },
    friendChipOn: { backgroundColor: colors.violet, borderColor: colors.violet },
    friendTxt: { color: colors.muted, fontFamily: fonts.displayBold, fontSize: 15 },
    modeRow: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 4, gap: 4 },
    modeBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm },
    modeOn: { backgroundColor: colors.surfaceHi },
    modeTxt: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 12 },
    manualRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    manualLabel: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 12.5, width: 76 },
    manualInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgSoft,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      fontSize: 14,
      textAlign: 'right',
    },
    manualUnit: { color: colors.muted2, fontFamily: fonts.bodySemiBold, fontSize: 11 },
    manualHint: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11 },
    equalPreview: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 13.5, textAlign: 'center' },

    splitProgress: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 12.5, textAlign: 'center' },
    personCard: { flexDirection: 'row', gap: 16, alignItems: 'center' },
    personLabel: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5 },
    personAmt: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 20 },
    personUsd: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11.5 },
    paidPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      backgroundColor: colors.ok + '18',
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginTop: 6,
    },
    paidTxt: { color: colors.ok, fontFamily: fonts.bodySemiBold, fontSize: 12 },
    simBtn: { borderRadius: radius.sm, paddingHorizontal: 16, paddingVertical: 9, alignSelf: 'flex-start', marginTop: 6 },
    simTxt: { color: colors.bg, fontFamily: fonts.bodySemiBold, fontSize: 12 },

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
    okAmt: { color: colors.ok, fontFamily: fonts.displayBold, fontSize: 30 },
    okSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, textAlign: 'center' },
  })
}
