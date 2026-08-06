// La red de seguridad: si algo revienta, esto es lo que se ve.
//
// Antes, un fallo en tiempo de ejecución dejaba la pantalla EN NEGRO y sin
// salida: había que cerrar la app a la fuerza. En una app donde alguien acaba
// de transferir dinero, eso es lo peor que puede pasar — la persona no sabe si
// su pago se hizo, y no tiene a dónde ir.
//
// Ahora se dice qué pasó, se ofrece reintentar sin perder la sesión, y sobre
// todo se tranquiliza sobre el dinero: una transferencia firmada en la cadena
// ya ocurrió, la pantalla no la deshace. El comprobante se puede pegar a mano
// en el cobro.

import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { TriangleAlert } from 'lucide-react-native'
import { GradientButton } from './ui/GradientButton'
import { fonts, radius } from '../lib/theme'
import { useTheme, type ThemeColors } from '../hooks/useTheme'

interface Props {
  error: Error
  retry: () => void
}

export function PantallaError({ error, retry }: Props) {
  const { colors } = useTheme()
  const styles = crearEstilos(colors)

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.cuerpo}>
          <View style={styles.icono}>
            <TriangleAlert size={30} color={colors.warn} />
          </View>

          <Text style={styles.titulo}>Algo se rompió en esta pantalla</Text>
          <Text style={styles.texto}>
            No es tu conexión ni tu cuenta: es un error nuestro. Podés reintentar aquí mismo.
          </Text>

          <View style={styles.dinero}>
            <Text style={styles.dineroTexto}>
              Si acabás de pagar desde Veta Wallet, tu transferencia ya está hecha en la cadena —
              esta pantalla no la deshace. Abrí el cobro de nuevo y pegá el comprobante para
              confirmarla.
            </Text>
          </View>

          <GradientButton label="Reintentar" onPress={retry} style={{ alignSelf: 'stretch', marginTop: 20 }} />

          {!!error?.message && (
            <View style={styles.detalle}>
              <Text style={styles.detalleEtq}>Detalle técnico</Text>
              <Text style={styles.detalleTexto}>{String(error.message).slice(0, 300)}</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

function crearEstilos(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1 },
    cuerpo: { padding: 26, paddingTop: 60, alignItems: 'center' },
    icono: {
      width: 64,
      height: 64,
      borderRadius: radius.lg,
      backgroundColor: colors.warn + '1c',
      borderWidth: 1,
      borderColor: colors.warn + '44',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    titulo: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 20, textAlign: 'center' },
    texto: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 13.5,
      lineHeight: 20,
      textAlign: 'center',
      marginTop: 8,
    },
    dinero: {
      marginTop: 18,
      borderWidth: 1,
      borderColor: colors.ok + '44',
      backgroundColor: colors.ok + '12',
      borderRadius: radius.md,
      padding: 14,
    },
    dineroTexto: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18 },
    detalle: {
      marginTop: 24,
      alignSelf: 'stretch',
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 14,
    },
    detalleEtq: { color: colors.muted2, fontFamily: fonts.bodySemiBold, fontSize: 11 },
    detalleTexto: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11.5, marginTop: 5, lineHeight: 16 },
  })
}
