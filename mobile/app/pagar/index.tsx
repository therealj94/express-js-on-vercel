// ─────────────────────────────────────────────────────────────────────────────
// Escanear para pagar.
//
// La cámara es el camino rápido, pero nunca el único: hay teléfonos con la
// cámara rota, luz imposible y gente que sencillamente prefiere teclear. El
// campo del código está a la vista desde el primer momento, no escondido tras
// un «¿problemas?».
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import { Camera, ScanLine } from 'lucide-react-native'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/ui/GradientButton'
import { TextField } from '../../src/components/ui/TextField'
import { TopBar } from '../../src/components/TopBar'
import { fonts, radius } from '../../src/lib/theme'
import { useTheme, type ThemeColors } from '../../src/hooks/useTheme'

/** Saca el código tanto de un enlace `mytokenpay://pagar/ABC-123` como del texto suelto. */
function extraerCodigo(bruto: string): string | null {
  const limpio = bruto.trim()
  const deEnlace = limpio.match(/pagar\/([A-Z0-9-]{5,12})/i)
  if (deEnlace) return deEnlace[1].toUpperCase()
  const suelto = limpio.toUpperCase().match(/^[A-Z0-9]{3}-?[A-Z0-9]{3}$/)
  if (suelto) return limpio.toUpperCase().includes('-') ? limpio.toUpperCase() : `${limpio.slice(0, 3)}-${limpio.slice(3)}`.toUpperCase()
  return null
}

export default function Escanear() {
  const router = useRouter()
  const { colors } = useTheme()
  const styles = crearEstilos(colors)
  const [permiso, pedirPermiso] = useCameraPermissions()
  const [manual, setManual] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Un QR se lee muchas veces por segundo; sin esto la pantalla navegaría en bucle.
  const yaLeido = useRef(false)

  function ir(codigo: string) {
    if (yaLeido.current) return
    yaLeido.current = true
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    router.replace(`/pagar/${codigo}`)
  }

  function enviarManual() {
    const c = extraerCodigo(manual)
    if (!c) {
      setError('Ese código no tiene la forma correcta. Son seis caracteres, como ABC-123.')
      return
    }
    ir(c)
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Pagar" />
      <View style={styles.cuerpo}>
        <View style={styles.visor}>
          {permiso?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                const c = extraerCodigo(String(data))
                if (c) ir(c)
              }}
            />
          ) : (
            <View style={styles.sinCamara}>
              <Camera size={30} color={colors.muted} />
              <Text style={styles.sinCamaraTexto}>
                {permiso?.canAskAgain === false
                  ? 'Habilitá la cámara desde los ajustes del teléfono para escanear.'
                  : 'Necesitamos la cámara para leer el código del comercio.'}
              </Text>
              {permiso?.canAskAgain !== false && (
                <AnimatedPressable onPress={pedirPermiso} style={styles.permiso}>
                  <Text style={styles.permisoTexto}>Permitir cámara</Text>
                </AnimatedPressable>
              )}
            </View>
          )}
          <View pointerEvents="none" style={styles.marco}>
            <ScanLine size={26} color={colors.violet} />
          </View>
        </View>

        <Text style={styles.ayuda}>Apuntá al código que te muestra el comercio</Text>

        <View style={styles.separador}>
          <View style={styles.linea} />
          <Text style={styles.o}>o escribilo</Text>
          <View style={styles.linea} />
        </View>

        <TextField
          value={manual}
          onChangeText={(v) => {
            setManual(v.toUpperCase())
            setError(null)
          }}
          placeholder="ABC-123"
          autoCapitalize="characters"
          maxLength={8}
        />
        {error && <Text style={styles.error}>{error}</Text>}

        <GradientButton
          label="Buscar cuenta"
          onPress={enviarManual}
          disabled={manual.replace('-', '').length < 6}
          style={{ marginTop: 12 }}
        />
      </View>
    </SafeAreaView>
  )
}

function crearEstilos(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    cuerpo: { flex: 1, padding: 20 },
    visor: {
      aspectRatio: 1,
      borderRadius: radius.xl,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sinCamara: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
    sinCamaraTexto: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: 'center' },
    permiso: {
      paddingHorizontal: 18,
      paddingVertical: 9,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.violet,
    },
    permisoTexto: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.violet },
    marco: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', opacity: 0.5 },

    ayuda: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 14 },
    separador: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
    linea: { flex: 1, height: 1, backgroundColor: colors.border },
    o: { fontFamily: fonts.body, fontSize: 12, color: colors.muted2 },
    error: { fontFamily: fonts.body, fontSize: 12, color: colors.danger, marginTop: 8 },
  })
}
