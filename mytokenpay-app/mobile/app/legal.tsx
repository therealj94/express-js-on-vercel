import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft } from 'lucide-react-native'
import { AnimatedPressable } from '../src/components/AnimatedPressable'
import { fonts, radius } from '../src/lib/theme'
import { useTheme, type ThemeColors } from '../src/hooks/useTheme'

const SECTIONS = [
  {
    title: 'Política de privacidad',
    body: [
      'MyTokenPay recopila los datos que proporcionas al crear tu cuenta (nombre, correo) y, si registras un negocio, los datos de tu empresa y los documentos de verificación KYC/KYB (identidad y documento legal).',
      'Usamos estos datos únicamente para operar el directorio: mostrar tu negocio a otros usuarios, verificar tu identidad y permitirte administrar tu perfil. No vendemos tus datos a terceros.',
      'Puedes editar la información de tu perfil y de tu negocio en cualquier momento desde la app. Puedes eliminar tu cuenta y todos tus datos asociados (perfil, empresa, documentos KYC) desde el menú de cuenta, opción "Eliminar cuenta".',
      'Los datos de ubicación que compartes (el pin de tu negocio o tu ubicación actual al usar "Usar mi ubicación") se usan solo para marcar el punto exacto de tu negocio en el mapa del directorio.',
    ],
  },
  {
    title: 'Términos de servicio',
    body: [
      'MyTokenPay es un directorio de comercios afiliados al Sistema Financiero Social. Al crear una cuenta confirmas que la información que proporcionas es verídica.',
      'Si registras un negocio, eres responsable de mantener actualizada su información pública (dirección, horarios, productos o servicios) y de que los documentos enviados para verificación sean auténticos.',
      'Nos reservamos el derecho de suspender o rechazar la verificación de un negocio si la información proporcionada no puede ser validada.',
      'El uso de la app implica la aceptación de estos términos. Podemos actualizarlos ocasionalmente; los cambios importantes se comunicarán dentro de la app.',
    ],
  },
]

export default function Legal() {
  const router = useRouter()
  const { colors } = useTheme()
  const styles = createStyles(colors)

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <AnimatedPressable onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft size={16} color={colors.text} />
        </AnimatedPressable>
        <Text style={styles.topTitle}>Privacidad y términos</Text>
        <View style={{ width: 32 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content}>
        {SECTIONS.map((section) => (
          <View key={section.title} style={{ marginBottom: 28 }}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.body.map((paragraph, i) => (
              <Text key={i} style={styles.paragraph}>{paragraph}</Text>
            ))}
          </View>
        ))}
        <Text style={styles.footnote}>Última actualización: 2026.</Text>
      </ScrollView>
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
    sectionTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 18, marginBottom: 12 },
    paragraph: { color: colors.muted, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 21, marginBottom: 12 },
    footnote: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11.5, textAlign: 'center', marginTop: 8 },
  })
}
