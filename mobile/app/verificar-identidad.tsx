// ─────────────────────────────────────────────────────────────────────────────
// Verificación de identidad — contra Genesis ID, de verdad.
//
// Esta pantalla ya no simula nada. Habla con el registro de identidad del
// ecosistema a través del backend de MyTokenPay (/genesis/*), y el resultado
// es un GID: la misma identidad que sirve en Veta Wallet y en el resto del
// ecosistema Orden Global.
//
// Cuatro pasos, en orden: datos declarados → documento (la franja MRZ) →
// rostro → revisión. La app aporta datos; no decide. El GID lo emite el
// servidor y solo existe cuando un oficial de cumplimiento aprueba.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions } from 'expo-camera'
import {
  ArrowLeft, BadgeCheck, Camera, FileText, RefreshCw, ShieldCheck, UserRound, XCircle,
} from 'lucide-react-native'
import { genesis, ApiError, type IdentidadGenesis } from '../src/lib/api'
import { useAuthStore } from '../src/store/auth'
import { AnimatedPressable } from '../src/components/AnimatedPressable'
import { AnimatedScreen } from '../src/components/AnimatedScreen'
import { GradientButton } from '../src/components/ui/GradientButton'
import { TextField } from '../src/components/ui/TextField'
import { SelectField } from '../src/components/ui/SelectField'
import { Card } from '../src/components/ui/Card'
import { fonts, radius } from '../src/lib/theme'
import { useTheme, type ThemeColors } from '../src/hooks/useTheme'

const ORO = '#E8B84B'
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' })

const PAISES = [
  { value: 'HN', label: 'Honduras' },
  { value: 'GT', label: 'Guatemala' },
  { value: 'SV', label: 'El Salvador' },
  { value: 'NI', label: 'Nicaragua' },
  { value: 'CR', label: 'Costa Rica' },
  { value: 'PA', label: 'Panamá' },
  { value: 'MX', label: 'México' },
  { value: 'US', label: 'Estados Unidos' },
]

export default function VerifyIdentity() {
  const router = useRouter()
  const { colors } = useTheme()
  const styles = createStyles(colors)
  const { refreshMe } = useAuthStore()

  const [identidad, setIdentidad] = useState<IdentidadGenesis | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Paso 1 · datos
  const [nombre, setNombre] = useState('')
  const [nacimiento, setNacimiento] = useState('')
  const [pais, setPais] = useState('HN')
  const [telefono, setTelefono] = useState('')

  // Paso 2 · documento
  const [mrz1, setMrz1] = useState('')
  const [mrz2, setMrz2] = useState('')
  const [problemasDoc, setProblemasDoc] = useState<string[]>([])

  // Paso 3 · rostro
  const [permisoCam, pedirPermisoCam] = useCameraPermissions()
  const camRef = useRef<CameraView | null>(null)
  const [camaraLista, setCamaraLista] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const { identidad } = await genesis.estado()
      setIdentidad(identidad)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo consultar tu identidad')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  // En revisión: se consulta cada pocos segundos hasta que el oficial decida.
  const estado = identidad?.estado
  useEffect(() => {
    if (estado === 'biometria' || estado === 'en-revision') {
      const t = setInterval(() => {
        cargar()
        refreshMe()
      }, 5000)
      return () => clearInterval(t)
    }
    if (estado === 'verificada') refreshMe()
  }, [estado, cargar, refreshMe])

  async function enviarDatos() {
    if (nombre.trim().length < 5) {
      setError('Escribí tu nombre completo, como en tu documento')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nacimiento.trim())) {
      setError('La fecha va como AAAA-MM-DD, por ejemplo 1994-01-15')
      return
    }
    setError(null)
    setEnviando(true)
    try {
      const { identidad } = await genesis.datos({
        nombreCompleto: nombre.trim(),
        fechaNacimiento: nacimiento.trim(),
        paisResidencia: pais,
        telefono: telefono.trim() || undefined,
      })
      setIdentidad(identidad)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron guardar tus datos')
    } finally {
      setEnviando(false)
    }
  }

  async function enviarDocumento() {
    const l1 = mrz1.trim().toUpperCase()
    const l2 = mrz2.trim().toUpperCase()
    if (l1.length < 30 || l2.length < 30) {
      setError('Copiá las dos líneas de la franja de tu documento (la zona con <<<)')
      return
    }
    setError(null)
    setProblemasDoc([])
    setEnviando(true)
    try {
      const r = await genesis.documento(`${l1}\n${l2}`)
      setIdentidad(r.identidad)
      if (r.documento && !r.documento.aceptable) {
        setProblemasDoc(r.documento.problemas)
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo revisar el documento')
    } finally {
      setEnviando(false)
    }
  }

  async function tomarSelfie() {
    if (!camRef.current) return
    setError(null)
    setEnviando(true)
    try {
      const foto = await camRef.current.takePictureAsync({ base64: true, quality: 0.6 })
      if (!foto?.base64) throw new Error('sin foto')
      const { identidad } = await genesis.biometria(`data:image/jpeg;base64,${foto.base64}`)
      setIdentidad(identidad)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo tomar la foto. Probá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  const paso =
    estado === 'iniciada' ? 1
      : estado === 'datos' ? 2
      : estado === 'documento' ? 3
      : 4

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <AnimatedPressable onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft size={16} color={colors.text} />
        </AnimatedPressable>
        <Text style={styles.topTitle}>Identidad Genesis</Text>
        <View style={{ width: 32 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AnimatedScreen fill={false} style={{ gap: 16 }}>
          {cargando ? (
            <View style={styles.centro}>
              <ActivityIndicator color={ORO} />
              <Text style={styles.body}>Consultando tu identidad…</Text>
            </View>
          ) : estado === 'verificada' ? (
            <View style={styles.centro}>
              <View style={[styles.iconoGrande, { backgroundColor: colors.ok + '22' }]}>
                <BadgeCheck size={30} color={colors.ok} />
              </View>
              <Text style={styles.titulo}>Identidad verificada</Text>
              {identidad?.gid && (
                <View style={styles.gidPill}>
                  <ShieldCheck size={13} color={ORO} />
                  <Text style={styles.gidText}>{identidad.gid}</Text>
                </View>
              )}
              <Text style={[styles.body, { textAlign: 'center' }]}>
                Tu identidad vale en todo el ecosistema Orden Global: MyTokenPay, Veta Wallet y las
                apps que vengan. No vas a repetir este trámite nunca más.
              </Text>
            </View>
          ) : estado === 'rechazada' || estado === 'suspendida' ? (
            <View style={styles.centro}>
              <View style={[styles.iconoGrande, { backgroundColor: colors.danger + '22' }]}>
                <XCircle size={30} color={colors.danger} />
              </View>
              <Text style={styles.titulo}>
                {estado === 'rechazada' ? 'Verificación rechazada' : 'Identidad suspendida'}
              </Text>
              <Text style={[styles.body, { textAlign: 'center' }]}>
                Un oficial de cumplimiento revisó tu trámite y no pudo aprobarlo. Escribinos a
                soporte@ordenglobal.link para saber qué falta o cómo corregirlo.
              </Text>
            </View>
          ) : estado === 'biometria' || estado === 'en-revision' ? (
            <View style={styles.centro}>
              <View style={[styles.iconoGrande, { backgroundColor: colors.warn + '22' }]}>
                <ShieldCheck size={30} color={colors.warn} />
              </View>
              <Text style={styles.titulo}>En revisión</Text>
              <Text style={[styles.body, { textAlign: 'center' }]}>
                Tus datos, tu documento y tu rostro ya están en Genesis ID. Un oficial de
                cumplimiento está revisando el trámite — suele resolverse el mismo día. Esta
                pantalla se actualiza sola en cuanto haya decisión.
              </Text>
              <View style={styles.pollRow}>
                <RefreshCw size={12} color={colors.muted} />
                <Text style={styles.pollText}>Comprobando automáticamente…</Text>
              </View>
            </View>
          ) : (
            <>
              {/* Indicador de pasos */}
              <View style={styles.pasos}>
                {[
                  { n: 1, Icono: UserRound, etiqueta: 'Datos' },
                  { n: 2, Icono: FileText, etiqueta: 'Documento' },
                  { n: 3, Icono: Camera, etiqueta: 'Rostro' },
                ].map(({ n, Icono, etiqueta }) => (
                  <View key={n} style={styles.pasoItem}>
                    <View
                      style={[
                        styles.pasoCirculo,
                        paso === n && { borderColor: ORO, backgroundColor: ORO + '22' },
                        paso > n && { borderColor: colors.ok, backgroundColor: colors.ok + '22' },
                      ]}
                    >
                      <Icono size={14} color={paso > n ? colors.ok : paso === n ? ORO : colors.muted2} />
                    </View>
                    <Text style={[styles.pasoEtiqueta, paso === n && { color: colors.text }]}>{etiqueta}</Text>
                  </View>
                ))}
              </View>

              <Card style={{ padding: 14 }}>
                <View style={styles.infoRow}>
                  <ShieldCheck size={15} color={colors.blue} />
                  <Text style={styles.infoText}>
                    Una sola verificación para todo el ecosistema. La emite Genesis ID y la aprueba
                    una persona de cumplimiento, no un algoritmo a ciegas.
                  </Text>
                </View>
              </Card>

              {paso === 1 && (
                <View style={{ gap: 12 }}>
                  <Text style={styles.tituloPaso}>¿Quién sos?</Text>
                  <TextField
                    label="Nombre completo"
                    placeholder="Como aparece en tu documento"
                    value={nombre}
                    onChangeText={setNombre}
                    autoCapitalize="words"
                  />
                  <TextField
                    label="Fecha de nacimiento"
                    placeholder="AAAA-MM-DD"
                    value={nacimiento}
                    onChangeText={setNacimiento}
                    keyboardType="numbers-and-punctuation"
                  />
                  <SelectField label="País de residencia" value={pais} options={PAISES} onChange={setPais} />
                  <TextField
                    label="Teléfono (opcional)"
                    placeholder="+504 9999 0000"
                    value={telefono}
                    onChangeText={setTelefono}
                    keyboardType="phone-pad"
                  />
                  <GradientButton label={enviando ? 'Guardando…' : 'Continuar'} onPress={enviarDatos} loading={enviando} />
                </View>
              )}

              {paso === 2 && (
                <View style={{ gap: 12 }}>
                  <Text style={styles.tituloPaso}>Tu documento</Text>
                  <Text style={styles.body}>
                    Copiá las dos líneas de la franja de lectura de tu pasaporte o DNI — la zona de
                    abajo, la que tiene {'<<<'}. Solo viaja el texto: la foto del documento no sale
                    de tu teléfono.
                  </Text>
                  <TextField
                    label="Línea 1"
                    placeholder="P<HNDAPELLIDO<<NOMBRE<<<<<<<<<<<<<<<"
                    value={mrz1}
                    onChangeText={setMrz1}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={{ fontFamily: MONO, fontSize: 12 }}
                  />
                  <TextField
                    label="Línea 2"
                    placeholder="A123456789HND9401159M3001159<<<<<02"
                    value={mrz2}
                    onChangeText={setMrz2}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={{ fontFamily: MONO, fontSize: 12 }}
                  />
                  {problemasDoc.length > 0 && (
                    <View style={styles.errorBox}>
                      {problemasDoc.map((p) => (
                        <Text key={p} style={styles.errorText}>· {p}</Text>
                      ))}
                    </View>
                  )}
                  <GradientButton
                    label={enviando ? 'Revisando…' : 'Revisar documento'}
                    onPress={enviarDocumento}
                    loading={enviando}
                  />
                </View>
              )}

              {paso === 3 && (
                <View style={{ gap: 12 }}>
                  <Text style={styles.tituloPaso}>Tu rostro</Text>
                  <Text style={styles.body}>
                    Una foto de frente, con buena luz y sin lentes oscuros. Se compara con tu
                    documento para confirmar que sos vos.
                  </Text>
                  {!permisoCam?.granted ? (
                    <GradientButton label="Permitir cámara" onPress={() => pedirPermisoCam()} />
                  ) : (
                    <>
                      <View style={styles.camaraMarco}>
                        <CameraView
                          ref={camRef}
                          style={StyleSheet.absoluteFill}
                          facing="front"
                          onCameraReady={() => setCamaraLista(true)}
                        />
                      </View>
                      <GradientButton
                        label={enviando ? 'Enviando…' : 'Tomar la foto'}
                        onPress={tomarSelfie}
                        disabled={!camaraLista}
                        loading={enviando}
                        icon={<Camera size={16} color={colors.bg} />}
                      />
                    </>
                  )}
                </View>
              )}
            </>
          )}

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </AnimatedScreen>
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
    centro: { alignItems: 'center', paddingVertical: 30, gap: 10 },
    iconoGrande: {
      width: 64,
      height: 64,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    titulo: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 18, textAlign: 'center' },
    tituloPaso: { color: colors.text, fontFamily: fonts.display, fontSize: 16 },
    body: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
    gidPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: ORO + '55',
      backgroundColor: ORO + '15',
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    gidText: { color: ORO, fontFamily: MONO, fontSize: 13, letterSpacing: 1 },
    pollRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    pollText: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11.5 },
    pasos: { flexDirection: 'row', justifyContent: 'center', gap: 26, paddingVertical: 6 },
    pasoItem: { alignItems: 'center', gap: 6 },
    pasoCirculo: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pasoEtiqueta: { color: colors.muted2, fontFamily: fonts.bodySemiBold, fontSize: 11 },
    infoRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    infoText: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, flex: 1 },
    camaraMarco: {
      height: 300,
      borderRadius: radius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    errorBox: {
      borderWidth: 1,
      borderColor: colors.danger + '55',
      backgroundColor: colors.danger + '18',
      borderRadius: radius.sm,
      padding: 10,
      gap: 4,
    },
    errorText: { color: colors.danger, fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  })
}
