import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowLeft, Check, Copy, Wallet } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import { AnimatedPressable } from '../src/components/AnimatedPressable'
import { AnimatedScreen } from '../src/components/AnimatedScreen'
import { TextField } from '../src/components/ui/TextField'
import { GradientButton } from '../src/components/ui/GradientButton'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { useWalletStore, ORIGEN_USD, type WalletKind } from '../src/store/wallet'
import { useNotificationsStore } from '../src/store/notifications'
import { fonts, radius, shadow } from '../src/lib/theme'
import { useTheme, type ThemeColors } from '../src/hooks/useTheme'

function mask(value: string): string {
  if (value.length <= 12) return value
  return `${value.slice(0, 6)}…${value.slice(-6)}`
}

export default function ConnectWallet() {
  const router = useRouter()
  const { colors, gradient } = useTheme()
  const styles = createStyles(colors)
  const wallet = useWalletStore((s) => s.wallet)
  const origenBalance = useWalletStore((s) => s.origenBalance)
  const connect = useWalletStore((s) => s.connect)
  const disconnect = useWalletStore((s) => s.disconnect)
  const pushNotif = useNotificationsStore((s) => s.push)

  const [kind, setKind] = useState<WalletKind>('address')
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  function handleConnect() {
    const v = value.trim()
    if (kind === 'address' && v.length < 20) {
      setError('Ingresa una coin address válida de tu billetera.')
      return
    }
    if (kind === 'uid' && v.length < 4) {
      setError('Ingresa el UID de tu Veta Wallet.')
      return
    }
    setError(null)
    connect(kind, v)
    setValue('')
    pushNotif({
      kind: 'wallet',
      title: 'Veta Wallet conectada',
      body: 'Tu billetera quedó vinculada a tu cuenta de MyTokenPay. Ya puedes recibir tus puntos ORIGEN.',
    })
  }

  async function copyValue() {
    if (!wallet) return
    await Clipboard.setStringAsync(wallet.value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <AnimatedPressable onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft size={16} color={colors.text} />
        </AnimatedPressable>
        <Text style={styles.topTitle}>Veta Wallet</Text>
        <View style={{ width: 32 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content}>
        <AnimatedScreen fill={false} style={{ gap: 18 }}>
          <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <Wallet size={22} color={colors.bg} />
            <Text style={styles.heroTitle}>
              {wallet ? 'Tu Veta Wallet está conectada' : 'Conecta tu Veta Wallet'}
            </Text>
            <Text style={styles.heroBody}>
              {wallet
                ? 'Recibirás tus puntos y recompensas ORIGEN directo en esta billetera.'
                : 'Vincula tu billetera para recibir tus puntos ORIGEN y liquidar tus compras en comercios afiliados.'}
            </Text>
          </LinearGradient>

          {wallet ? (
            <View style={styles.connectedCard}>
              <View style={styles.connectedRow}>
                <View style={styles.checkWrap}>
                  <Check size={15} color={colors.ok} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.connectedLabel}>
                    {wallet.kind === 'address' ? 'Coin address' : 'UID de Veta Wallet'}
                  </Text>
                  <Text style={styles.connectedValue}>{mask(wallet.value)}</Text>
                </View>
                <AnimatedPressable onPress={copyValue} scaleTo={0.9} style={styles.copyBtn}>
                  {copied ? <Check size={14} color={colors.ok} /> : <Copy size={14} color={colors.muted} />}
                </AnimatedPressable>
              </View>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceRowLabel}>Saldo reflejado</Text>
                <Text style={styles.balanceRowValue}>
                  {origenBalance.toLocaleString('es-HN', { maximumFractionDigits: 4 })} ORIGEN
                  <Text style={styles.balanceRowUsd}>  ≈ ${(origenBalance * ORIGEN_USD).toFixed(2)} USD</Text>
                </Text>
              </View>
              <AnimatedPressable onPress={() => setConfirmDisconnect(true)} style={styles.disconnectBtn}>
                <Text style={styles.disconnectText}>Desconectar billetera</Text>
              </AnimatedPressable>
            </View>
          ) : (
            <>
              <View style={styles.segment}>
                <AnimatedPressable
                  onPress={() => setKind('address')}
                  scaleTo={0.97}
                  style={[styles.segmentBtn, kind === 'address' && styles.segmentActive]}
                >
                  <Text style={[styles.segmentText, kind === 'address' && styles.segmentTextActive]}>Coin address</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  onPress={() => setKind('uid')}
                  scaleTo={0.97}
                  style={[styles.segmentBtn, kind === 'uid' && styles.segmentActive]}
                >
                  <Text style={[styles.segmentText, kind === 'uid' && styles.segmentTextActive]}>UID</Text>
                </AnimatedPressable>
              </View>

              <TextField
                label={kind === 'address' ? 'Coin address de tu billetera' : 'UID de Veta Wallet'}
                value={value}
                onChangeText={setValue}
                placeholder={kind === 'address' ? '0x… o dirección de tu red' : 'Ej. VETA-8841-2290'}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <Text style={styles.note}>
                Tus datos de billetera se guardan solo en tu teléfono en esta versión de demostración.
              </Text>

              <GradientButton
                label="Conectar billetera"
                onPress={handleConnect}
                disabled={!value.trim()}
                icon={<Wallet size={16} color={colors.bg} />}
              />
            </>
          )}
        </AnimatedScreen>
      </ScrollView>

      <ConfirmDialog
        visible={confirmDisconnect}
        icon={Wallet}
        danger
        title="Desconectar billetera"
        message="Se eliminará la Veta Wallet vinculada a tu cuenta. Podrás volver a conectarla cuando quieras."
        confirmLabel="Desconectar"
        onConfirm={() => {
          disconnect()
          setConfirmDisconnect(false)
        }}
        onCancel={() => setConfirmDisconnect(false)}
      />
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
    content: { padding: 20, paddingBottom: 48 },
    hero: { borderRadius: radius.xl, padding: 20, ...shadow(colors.violet, 'lg') },
    heroTitle: { color: colors.bg, fontFamily: fonts.display, fontSize: 17, marginTop: 12 },
    heroBody: { color: colors.bg, opacity: 0.85, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
    segment: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: 4,
      gap: 4,
    },
    segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.sm },
    segmentActive: { backgroundColor: colors.surfaceHi },
    segmentText: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 12.5 },
    segmentTextActive: { color: colors.text },
    errorBox: { borderWidth: 1, borderColor: colors.danger + '55', backgroundColor: colors.danger + '18', borderRadius: radius.sm, padding: 10 },
    errorText: { color: colors.danger, fontFamily: fonts.body, fontSize: 12 },
    note: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11.5, lineHeight: 16 },
    connectedCard: {
      borderWidth: 1,
      borderColor: colors.ok + '40',
      backgroundColor: colors.ok + '10',
      borderRadius: radius.lg,
      padding: 16,
      gap: 14,
    },
    connectedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    checkWrap: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      backgroundColor: colors.ok + '20',
      alignItems: 'center',
      justifyContent: 'center',
    },
    connectedLabel: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5 },
    connectedValue: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 14, marginTop: 3 },
    copyBtn: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    balanceRow: {
      borderTopWidth: 1,
      borderTopColor: colors.ok + '30',
      paddingTop: 12,
      gap: 3,
    },
    balanceRowLabel: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5 },
    balanceRowValue: { color: colors.text, fontFamily: fonts.display, fontSize: 16 },
    balanceRowUsd: { color: colors.muted2, fontFamily: fonts.body, fontSize: 12 },
    disconnectBtn: { alignItems: 'center', paddingVertical: 10 },
    disconnectText: { color: colors.danger, fontFamily: fonts.bodySemiBold, fontSize: 12.5 },
  })
}
