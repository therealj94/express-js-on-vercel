import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Dimensions, Easing, Modal, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  QrCode,
  ScanLine,
  Send,
  Store,
  Wallet,
  X,
} from 'lucide-react-native'
import { Screen } from '../../src/components/Screen'
import { TopBar } from '../../src/components/TopBar'
import { AnimatedText } from '../../src/components/AnimatedText'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { Pressable3D } from '../../src/components/Pressable3D'
import { Card } from '../../src/components/ui/Card'
import { TextField } from '../../src/components/ui/TextField'
import { GradientButton } from '../../src/components/ui/GradientButton'
import { api } from '../../src/lib/api'
import type { Company } from '../../src/lib/types'
import { useAuthStore } from '../../src/store/auth'
import { useWalletStore, isPayError, ORIGEN_USD, type PaymentTx } from '../../src/store/wallet'
import { useNotificationsStore } from '../../src/store/notifications'
import { fonts, radius, shadow } from '../../src/lib/theme'
import { useTheme, type ThemeColors } from '../../src/hooks/useTheme'

const { width: SCREEN_W } = Dimensions.get('window')
const SCAN_W = Math.min(SCREEN_W - 72, 300)

type Mode = 'menu' | 'scan' | 'amount' | 'success'

function fmtOrigen(n: number): string {
  return n.toLocaleString('es-HN', { maximumFractionDigits: 4 })
}
function fmtUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function Pagar() {
  const router = useRouter()
  const { colors, gradient } = useTheme()
  const styles = createStyles(colors)
  const { user } = useAuthStore()
  const wallet = useWalletStore((s) => s.wallet)
  const balance = useWalletStore((s) => s.origenBalance)
  const payments = useWalletStore((s) => s.payments)
  const pay = useWalletStore((s) => s.pay)
  const pushNotif = useNotificationsStore((s) => s.push)

  const [mode, setMode] = useState<Mode>('menu')
  const [method, setMethod] = useState<'qr' | 'transfer'>('qr')
  const [companies, setCompanies] = useState<Company[]>([])
  const [merchant, setMerchant] = useState<Company | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lastTx, setLastTx] = useState<PaymentTx | null>(null)

  useEffect(() => {
    api.listCompanies({}).then(({ companies }) => setCompanies(companies.filter((c) => c.verified))).catch(() => {})
  }, [])

  // ---- escáner simulado ----
  const scanY = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (mode !== 'scan') return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanY, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scanY, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    )
    loop.start()
    const t = setTimeout(() => {
      const pick = companies[Math.floor(Math.random() * companies.length)] ?? null
      setMerchant(pick)
      setMethod('qr')
      setMode('amount')
    }, 2800)
    return () => {
      loop.stop()
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, companies.length])

  const amountNum = useMemo(() => {
    const n = parseFloat(amount.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }, [amount])

  function confirmPay() {
    if (!merchant) return
    const res = pay({
      merchant: merchant.tradeName,
      merchantId: merchant.id,
      amountOrigen: amountNum,
      method,
      note: note.trim() || null,
    })
    if (isPayError(res)) {
      setError(res.error)
      return
    }
    setError(null)
    setLastTx(res)
    setMode('success')
    pushNotif({
      kind: 'wallet',
      title: 'Pago realizado',
      body: `Pagaste ${fmtOrigen(res.amountOrigen)} ORIGEN (${fmtUsd(res.amountUsd)}) en ${res.merchant}. Se descontó de tu Veta Wallet.`,
    })
  }

  function resetFlow() {
    setMode('menu')
    setMerchant(null)
    setAmount('')
    setNote('')
    setError(null)
  }

  const scanTranslate = scanY.interpolate({ inputRange: [0, 1], outputRange: [10, SCAN_W - 20] })

  // ---- sin sesión ----
  if (!user) {
    return (
      <Screen edges={['top']}>
        <TopBar title="Pagar" />
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <QrCode size={30} color={colors.violet} />
          </View>
          <Text style={styles.emptyTitle}>Paga con ORIGEN en segundos</Text>
          <Text style={styles.emptyBody}>Inicia sesión para escanear códigos QR y pagar en comercios afiliados con el saldo de tu Veta Wallet.</Text>
          <GradientButton label="Iniciar sesión" onPress={() => router.push('/login')} style={{ alignSelf: 'stretch', marginTop: 18 }} />
        </View>
      </Screen>
    )
  }

  return (
    <Screen edges={['top']}>
      <TopBar title="Pagar" />

      {/* Saldo Veta Wallet */}
      <View style={styles.section}>
        <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balCard}>
          <View style={styles.balTop}>
            <View style={styles.balChip}>
              <Wallet size={11} color={colors.bg} />
              <Text style={styles.balChipText}>{wallet ? 'Veta Wallet conectada' : 'Saldo demo'}</Text>
            </View>
            <Text style={styles.balUsd}>≈ {fmtUsd(balance * ORIGEN_USD)}</Text>
          </View>
          <Text style={styles.balNumber}>{fmtOrigen(balance)}</Text>
          <Text style={styles.balLabel}>ORIGEN disponibles para pagar</Text>
        </LinearGradient>
        {!wallet && (
          <AnimatedPressable onPress={() => router.push('/conectar-wallet')} style={styles.connectHint}>
            <Wallet size={13} color={colors.cyan} />
            <Text style={styles.connectHintText}>Conecta tu Veta Wallet para reflejar tu saldo real</Text>
            <ChevronRight size={14} color={colors.cyan} />
          </AnimatedPressable>
        )}
      </View>

      {mode === 'menu' && (
        <>
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable3D onPress={() => setMode('scan')} style={[styles.modeTile, { flex: 1 }]} tilt={8}>
                <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modeIcon}>
                  <ScanLine size={22} color={colors.bg} />
                </LinearGradient>
                <Text style={styles.modeTitle}>Escanear QR</Text>
                <Text style={styles.modeHint}>Escanea el código del comercio y paga al instante</Text>
              </Pressable3D>
              <Pressable3D
                onPress={() => {
                  setMethod('transfer')
                  setPickerOpen(true)
                }}
                style={[styles.modeTile, { flex: 1 }]}
                tilt={8}
              >
                <View style={[styles.modeIcon, { backgroundColor: colors.surfaceHi }]}>
                  <Send size={22} color={colors.cyan} />
                </View>
                <Text style={styles.modeTitle}>Transferir</Text>
                <Text style={styles.modeHint}>Elige el comercio y envía ORIGEN directo</Text>
              </Pressable3D>
            </View>
          </View>

          {payments.length > 0 && (
            <View style={styles.section}>
              <AnimatedText style={styles.blockTitle}>Pagos recientes</AnimatedText>
              <View style={{ gap: 10, marginTop: 12 }}>
                {payments.slice(0, 6).map((tx) => (
                  <Card key={tx.id} style={styles.txRow}>
                    <View style={styles.txIcon}>
                      {tx.method === 'qr' ? <QrCode size={16} color={colors.violet} /> : <Send size={16} color={colors.cyan} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txMerchant} numberOfLines={1}>{tx.merchant}</Text>
                      <Text style={styles.txDate}>
                        {new Date(tx.createdAt).toLocaleDateString('es-HN', { day: 'numeric', month: 'short' })} ·{' '}
                        {new Date(tx.createdAt).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.txAmount}>-{fmtOrigen(tx.amountOrigen)} ORIGEN</Text>
                      <Text style={styles.txUsd}>{fmtUsd(tx.amountUsd)}</Text>
                    </View>
                  </Card>
                ))}
              </View>
            </View>
          )}
        </>
      )}

      {mode === 'scan' && (
        <View style={[styles.section, { alignItems: 'center' }]}>
          <View style={styles.scanFrame}>
            <View style={styles.scanInner}>
              <QrCode size={70} color={colors.muted2} />
            </View>
            <Animated.View style={[styles.scanLineBar, { transform: [{ translateY: scanTranslate }] }]}>
              <LinearGradient colors={['transparent', colors.cyan, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
            </Animated.View>
            <ScanCorner style={{ top: -2, left: -2 }} colors={colors} />
            <ScanCorner style={{ top: -2, right: -2, transform: [{ rotate: '90deg' }] }} colors={colors} />
            <ScanCorner style={{ bottom: -2, right: -2, transform: [{ rotate: '180deg' }] }} colors={colors} />
            <ScanCorner style={{ bottom: -2, left: -2, transform: [{ rotate: '270deg' }] }} colors={colors} />
          </View>
          <Text style={styles.scanText}>Buscando código QR del comercio…</Text>
          <AnimatedPressable onPress={resetFlow} style={styles.cancelBtn}>
            <X size={14} color={colors.muted} />
            <Text style={styles.cancelText}>Cancelar</Text>
          </AnimatedPressable>
        </View>
      )}

      {mode === 'amount' && merchant && (
        <View style={styles.section}>
          <Card style={styles.merchantCard}>
            <View style={styles.merchantLogo}>
              <Store size={20} color={colors.bg} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.merchantName} numberOfLines={1}>{merchant.tradeName}</Text>
                <BadgeCheck size={14} color={colors.ok} />
              </View>
              <Text style={styles.merchantMeta}>
                {method === 'qr' ? 'Detectado por QR' : 'Transferencia directa'} · {merchant.citySlug || 'Comercio afiliado'}
              </Text>
            </View>
            <AnimatedPressable onPress={resetFlow} style={styles.merchantClose}>
              <X size={14} color={colors.muted} />
            </AnimatedPressable>
          </Card>

          <View style={{ marginTop: 16 }}>
            <TextField
              label="Monto a pagar (ORIGEN)"
              value={amount}
              onChangeText={(v) => {
                setAmount(v)
                setError(null)
              }}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
            <Text style={styles.usdPreview}>≈ {fmtUsd(amountNum * ORIGEN_USD)} USD · saldo: {fmtOrigen(balance)} ORIGEN</Text>
          </View>

          <View style={{ marginTop: 8 }}>
            <TextField label="Nota (opcional)" value={note} onChangeText={setNote} placeholder="Ej. Cena, habitación 204…" />
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <GradientButton
            label={`Pagar ${amountNum > 0 ? fmtOrigen(amountNum) + ' ORIGEN' : ''}`}
            onPress={confirmPay}
            disabled={amountNum <= 0}
            style={{ marginTop: 16 }}
            icon={<ArrowRight size={16} color={colors.bg} />}
          />
          <Text style={styles.deductNote}>El pago se descuenta al instante del saldo ORIGEN de tu Veta Wallet.</Text>
        </View>
      )}

      {mode === 'success' && lastTx && (
        <View style={[styles.section, { alignItems: 'center' }]}>
          <View style={styles.successBadge}>
            <CheckCircle2 size={44} color={colors.ok} />
          </View>
          <Text style={styles.successTitle}>Pago realizado</Text>
          <Text style={styles.successAmount}>-{fmtOrigen(lastTx.amountOrigen)} ORIGEN</Text>
          <Text style={styles.successUsd}>≈ {fmtUsd(lastTx.amountUsd)} USD</Text>

          <Card style={styles.receipt}>
            <ReceiptRow k="Comercio" v={lastTx.merchant} colors={colors} />
            <ReceiptRow k="Método" v={lastTx.method === 'qr' ? 'Código QR' : 'Transferencia'} colors={colors} />
            <ReceiptRow k="Referencia" v={lastTx.id} colors={colors} />
            <ReceiptRow
              k="Fecha"
              v={new Date(lastTx.createdAt).toLocaleString('es-HN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              colors={colors}
            />
            <ReceiptRow k="Nuevo saldo" v={`${fmtOrigen(balance)} ORIGEN`} colors={colors} last />
          </Card>

          <GradientButton label="Listo" onPress={resetFlow} style={{ alignSelf: 'stretch', marginTop: 16 }} />
        </View>
      )}

      {/* selector de comercio para transferencia */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.sheetBg}>
          <View style={styles.sheet}>
            <View style={styles.sheetGrab} />
            <Text style={styles.sheetTitle}>¿A qué comercio pagas?</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {companies.map((c) => (
                <AnimatedPressable
                  key={c.id}
                  onPress={() => {
                    setMerchant(c)
                    setPickerOpen(false)
                    setMode('amount')
                  }}
                  style={styles.pickRow}
                >
                  <View style={styles.pickLogo}>
                    <Store size={16} color={colors.bg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickName} numberOfLines={1}>{c.tradeName}</Text>
                    <Text style={styles.pickMeta}>{c.citySlug || c.countrySlug || 'Comercio afiliado'}</Text>
                  </View>
                  <ChevronRight size={16} color={colors.muted2} />
                </AnimatedPressable>
              ))}
            </ScrollView>
            <AnimatedPressable onPress={() => setPickerOpen(false)} style={styles.sheetClose}>
              <Text style={styles.sheetCloseText}>Cancelar</Text>
            </AnimatedPressable>
          </View>
        </View>
      </Modal>
    </Screen>
  )
}

function ScanCorner({ style, colors }: { style: object; colors: ThemeColors }) {
  return (
    <View
      style={[
        {
          position: 'absolute',
          width: 30,
          height: 30,
          borderLeftWidth: 4,
          borderTopWidth: 4,
          borderColor: colors.cyan,
          borderTopLeftRadius: 12,
        },
        style,
      ]}
    />
  )
}

function ReceiptRow({ k, v, colors, last }: { k: string; v: string; colors: ThemeColors; last?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 10,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text style={{ color: colors.muted, fontFamily: fonts.body, fontSize: 12.5 }}>{k}</Text>
      <Text style={{ color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 12.5, flexShrink: 1, textAlign: 'right' }}>{v}</Text>
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    section: { paddingHorizontal: 20, marginTop: 18 },

    emptyWrap: { paddingHorizontal: 24, marginTop: 40, alignItems: 'center' },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: radius.lg,
      backgroundColor: colors.violet + '18',
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 18, textAlign: 'center', marginTop: 18 },
    emptyBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 8 },

    balCard: { borderRadius: radius.xl, padding: 20, ...shadow(colors.violet, 'lg') },
    balTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    balChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(5,6,10,0.18)',
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    balChipText: { color: colors.bg, fontFamily: fonts.bodySemiBold, fontSize: 10 },
    balUsd: { color: colors.bg, opacity: 0.9, fontFamily: fonts.bodySemiBold, fontSize: 12 },
    balNumber: { color: colors.bg, fontFamily: fonts.displayBold, fontSize: 38, marginTop: 10 },
    balLabel: { color: colors.bg, opacity: 0.85, fontFamily: fonts.bodySemiBold, fontSize: 12, marginTop: 2 },

    connectHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
      paddingHorizontal: 4,
      paddingVertical: 6,
    },
    connectHintText: { color: colors.cyan, fontFamily: fonts.bodySemiBold, fontSize: 12, flex: 1 },

    modeTile: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: 16,
      gap: 10,
    },
    modeIcon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    modeTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
    modeHint: { color: colors.muted, fontFamily: fonts.body, fontSize: 11.5, lineHeight: 16 },

    blockTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 17 },
    txRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    txIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceHi,
      alignItems: 'center',
      justifyContent: 'center',
    },
    txMerchant: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 13.5 },
    txDate: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
    txAmount: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 13 },
    txUsd: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },

    scanFrame: {
      width: SCAN_W,
      height: SCAN_W,
      borderRadius: radius.xl,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
      marginTop: 8,
    },
    scanInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scanLineBar: { position: 'absolute', left: 14, right: 14, height: 3, borderRadius: 2 },
    scanText: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 13, marginTop: 16 },
    cancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, marginTop: 6 },
    cancelText: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 12.5 },

    merchantCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    merchantLogo: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.violet,
      alignItems: 'center',
      justifyContent: 'center',
    },
    merchantName: { color: colors.text, fontFamily: fonts.display, fontSize: 15, flexShrink: 1 },
    merchantMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 11.5, marginTop: 2 },
    merchantClose: {
      width: 30,
      height: 30,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },

    usdPreview: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11.5, marginTop: 6 },
    errorBox: {
      borderWidth: 1,
      borderColor: colors.danger + '55',
      backgroundColor: colors.danger + '18',
      borderRadius: radius.sm,
      padding: 10,
      marginTop: 12,
    },
    errorText: { color: colors.danger, fontFamily: fonts.body, fontSize: 12 },
    deductNote: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11, marginTop: 10, textAlign: 'center' },

    successBadge: {
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: colors.ok + '16',
      borderWidth: 2,
      borderColor: colors.ok + '55',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    },
    successTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 20, marginTop: 14 },
    successAmount: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 30, marginTop: 8 },
    successUsd: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
    receipt: { alignSelf: 'stretch', marginTop: 16 },

    sheetBg: { flex: 1, backgroundColor: 'rgba(4,3,10,0.6)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bgSoft,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      paddingBottom: 30,
      ...shadow(colors.bg, 'lg', 'up'),
    },
    sheetGrab: { width: 40, height: 4, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 17, marginBottom: 12 },
    pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    pickLogo: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.violet, alignItems: 'center', justifyContent: 'center' },
    pickName: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 13.5 },
    pickMeta: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
    sheetClose: { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
    sheetCloseText: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 13 },
  })
}
