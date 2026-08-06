// ─────────────────────────────────────────────────────────────────────────────
// La caja: el comercio teclea el monto y genera el cobro.
//
// Está pensada para usarse de pie, con una mano, con gente esperando. De ahí
// tres decisiones:
//
//   · Teclado propio, grande, sin el del sistema. El nativo tapa media pantalla
//     y en algunos Android ni siquiera trae punto decimal.
//   · Los centavos se teclean de derecha a izquierda, como en cualquier caja
//     registradora: escribir «12500» da L 125,00 sin tocar ningún punto.
//   · La división de la cuenta está a un toque, no escondida en un menú. Es la
//     situación normal en una mesa, no la excepción.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { Delete, Minus, Plus, Users } from 'lucide-react-native'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { AnimatedScreen } from '../../src/components/AnimatedScreen'
import { GradientButton } from '../../src/components/ui/GradientButton'
import { TopBar } from '../../src/components/TopBar'
import { pos, lempiras } from '../../src/lib/pos'
import { ApiError } from '../../src/lib/apiError'
import { fonts, radius } from '../../src/lib/theme'
import { useTheme, type ThemeColors } from '../../src/hooks/useTheme'

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'del']
const MAX_PARTES = 20

export default function Caja() {
  const router = useRouter()
  const { colors } = useTheme()
  const styles = crearEstilos(colors)

  // El monto se guarda en centavos enteros: con decimales flotantes, sumar
  // céntimos acaba dando 124,99999999 y eso en una caja no se perdona.
  const [centavos, setCentavos] = useState(0)
  const [concepto, setConcepto] = useState('')
  const [partes, setPartes] = useState(1)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const monto = centavos / 100

  function teclear(t: string) {
    Haptics.selectionAsync().catch(() => {})
    setError(null)
    if (t === 'C') return setCentavos(0)
    if (t === 'del') return setCentavos((c) => Math.floor(c / 10))
    setCentavos((c) => {
      const siguiente = c * 10 + Number(t)
      // Tope de siete cifras: más que eso no es una venta de mostrador y solo
      // sirve para que un dedo torpe cree un cobro absurdo.
      return siguiente > 99_999_999 ? c : siguiente
    })
  }

  async function cobrar() {
    if (monto <= 0 || enviando) return
    setEnviando(true)
    setError(null)
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      const { cobro } = await pos.crearCobro({ montoHnl: monto, concepto: concepto.trim(), partes })
      router.push(`/pos/cobro/${cobro.id}`)
      setCentavos(0)
      setConcepto('')
      setPartes(1)
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      setError(e instanceof ApiError ? e.message : 'No se pudo crear el cobro')
    } finally {
      setEnviando(false)
    }
  }

  const porPersona = monto / partes

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar title="Cobrar" />
      <AnimatedScreen style={styles.cuerpo}>
        <View style={styles.pantalla}>
          <Text style={styles.moneda}>L</Text>
          <Text style={styles.monto} numberOfLines={1} adjustsFontSizeToFit>
            {monto.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>

        <TextInput
          value={concepto}
          onChangeText={setConcepto}
          placeholder="Concepto (opcional)"
          placeholderTextColor={colors.muted2}
          style={styles.concepto}
          maxLength={60}
          returnKeyType="done"
        />

        <View style={styles.division}>
          <View style={styles.divisionIzq}>
            <Users size={16} color={colors.muted} />
            <Text style={styles.divisionTexto}>
              {partes === 1 ? 'Sin dividir' : `Entre ${partes} personas`}
            </Text>
          </View>
          <View style={styles.divisionCtrl}>
            <AnimatedPressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {})
                setPartes((p) => Math.max(1, p - 1))
              }}
              style={[styles.botonRedondo, partes === 1 && styles.botonApagado]}
              disabled={partes === 1}
            >
              <Minus size={18} color={partes === 1 ? colors.muted2 : colors.text} />
            </AnimatedPressable>
            <Text style={styles.partesNum}>{partes}</Text>
            <AnimatedPressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {})
                setPartes((p) => Math.min(MAX_PARTES, p + 1))
              }}
              style={[styles.botonRedondo, partes === MAX_PARTES && styles.botonApagado]}
              disabled={partes === MAX_PARTES}
            >
              <Plus size={18} color={partes === MAX_PARTES ? colors.muted2 : colors.text} />
            </AnimatedPressable>
          </View>
        </View>

        {partes > 1 && monto > 0 && (
          <Text style={styles.porPersona}>{lempiras(porPersona)} cada uno</Text>
        )}

        <View style={styles.teclado}>
          {TECLAS.map((t) => (
            <AnimatedPressable key={t} onPress={() => teclear(t)} style={styles.tecla}>
              {t === 'del' ? (
                <Delete size={22} color={colors.text} />
              ) : (
                <Text style={[styles.teclaTexto, t === 'C' && styles.teclaBorrar]}>{t}</Text>
              )}
            </AnimatedPressable>
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <GradientButton
          label={`Cobrar${monto > 0 ? ` ${lempiras(monto)}` : ''}`}
          onPress={cobrar}
          disabled={monto <= 0}
          loading={enviando}
          style={styles.cta}
        />
      </AnimatedScreen>
    </SafeAreaView>
  )
}

function crearEstilos(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    cuerpo: { flex: 1, paddingHorizontal: 20 },

    pantalla: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, paddingTop: 18 },
    moneda: { fontFamily: fonts.display, fontSize: 26, color: colors.muted },
    monto: { fontFamily: fonts.displayBold, fontSize: 58, color: colors.text, letterSpacing: -1.5 },

    concepto: {
      alignSelf: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 10,
      maxWidth: '100%',
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: colors.text,
      textAlign: 'center',
      minWidth: 200,
    },
    

    division: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginTop: 16,
    },
    divisionIzq: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    divisionTexto: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    divisionCtrl: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    botonRedondo: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceHi,
    },
    botonApagado: { opacity: 0.4 },
    partesNum: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.text, minWidth: 22, textAlign: 'center' },
    porPersona: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 8 },

    teclado: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginTop: 'auto',
      paddingTop: 16,
      rowGap: 10,
    },
    tecla: {
      width: '31.5%',
      height: 62,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    teclaTexto: { fontFamily: fonts.display, fontSize: 26, color: colors.text },
    teclaBorrar: { color: colors.warn, fontSize: 22 },

    error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, textAlign: 'center', marginTop: 12 },
    cta: { marginTop: 16, marginBottom: 12 },
  })
}
