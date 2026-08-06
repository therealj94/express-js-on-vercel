// ─────────────────────────────────────────────────────────────────────────────
// Ajustes.
//
// Todo lo que el usuario controla de su cuenta, en un solo lugar y agrupado por
// lo que la gente de verdad viene a buscar: su identidad, su seguridad, cómo se
// ve la app, y las salidas (cerrar sesión, borrar cuenta).
//
// Las filas no son decorativas: cada una lleva a algo que funciona o cambia algo
// que se guarda. Un ajuste que no hace nada es peor que no tenerlo — enseña al
// usuario a no confiar en los que sí funcionan.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  BadgeCheck,
  Bell,
  ChevronRight,
  Fingerprint,
  IdCard,
  LogOut,
  Palette,
  ScanFace,
  ShieldCheck,
  Trash2,
  Wallet,
} from 'lucide-react-native'
import { AnimatedPressable } from '../src/components/AnimatedPressable'
import { AnimatedScreen } from '../src/components/AnimatedScreen'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { ThemeSheet } from '../src/components/ThemeSheet'
import { TopBar } from '../src/components/TopBar'
import { useAuthStore } from '../src/store/auth'
import { useLockStore } from '../src/store/lock'
import { useWalletStore } from '../src/store/wallet'
import { fonts, radius } from '../src/lib/theme'
import { useTheme, type ThemeColors } from '../src/hooks/useTheme'

export default function Ajustes() {
  const router = useRouter()
  const { colors } = useTheme()
  const styles = crearEstilos(colors)

  const { user, logout, deleteAccount } = useAuthStore()
  const lock = useLockStore()
  const wallet = useWalletStore((s) => s.wallet)

  const [temaAbierto, setTemaAbierto] = useState(false)
  const [confirmarSalir, setConfirmarSalir] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const [avisoBio, setAvisoBio] = useState<string | null>(null)

  async function alternarBloqueo(activar: boolean) {
    if (!activar) {
      lock.desactivar()
      return
    }
    const err = await lock.activar()
    setAvisoBio(err)
  }

  const estadoKyc = user?.kyc?.status
  const kycTexto =
    estadoKyc === 'verified'
      ? 'Verificada'
      : estadoKyc === 'pending'
        ? 'En revisión'
        : estadoKyc === 'rejected'
          ? 'Rechazada — reintentá'
          : 'Sin verificar'

  const IconoBio = lock.disponible === 'rostro' ? ScanFace : Fingerprint

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Ajustes" />
      <AnimatedScreen style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.cuerpo} showsVerticalScrollIndicator={false}>
          {/* Perfil */}
          <View style={styles.perfil}>
            <View style={styles.avatar}>
              <Text style={styles.avatarLetra}>{(user?.fullName ?? '?').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nombre} numberOfLines={1}>{user?.fullName ?? 'Invitado'}</Text>
              <Text style={styles.correo} numberOfLines={1}>{user?.email ?? ''}</Text>
            </View>
          </View>

          {/* Identidad y ecosistema */}
          <Text style={styles.grupo}>Tu identidad</Text>
          <View style={styles.tarjeta}>
            <Fila
              icono={<IdCard size={19} color={colors.violet} />}
              titulo="Verificación de identidad"
              valor={kycTexto}
              acento={estadoKyc === 'verified' ? colors.ok : estadoKyc === 'rejected' ? colors.danger : colors.muted}
              onPress={() => router.push('/verificar-identidad')}
              colors={colors}
            />
            <Separador colors={colors} />
            <Fila
              icono={<Wallet size={19} color={colors.violet} />}
              titulo="Veta Wallet"
              valor={wallet ? `${wallet.kind === 'address' ? 'Dirección' : 'UID'} vinculada` : 'Sin vincular'}
              acento={wallet ? colors.ok : colors.muted}
              onPress={() => router.push('/conectar-wallet')}
              colors={colors}
            />
          </View>

          {/* Seguridad */}
          <Text style={styles.grupo}>Seguridad</Text>
          <View style={styles.tarjeta}>
            <View style={styles.fila}>
              <View style={styles.filaIzq}>
                <IconoBio size={19} color={colors.violet} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.filaTitulo}>
                    {lock.disponible === 'rostro' ? 'Desbloqueo con rostro' : 'Desbloqueo con huella'}
                  </Text>
                  <Text style={styles.filaSub}>
                    {lock.disponible === 'ninguna'
                      ? 'Configurá rostro o huella en tu teléfono primero'
                      : 'Pedir tu identidad al abrir la app'}
                  </Text>
                </View>
              </View>
              <Switch
                value={lock.activado}
                onValueChange={alternarBloqueo}
                disabled={lock.disponible === 'ninguna'}
                trackColor={{ true: colors.violet, false: colors.border }}
                thumbColor="#fff"
              />
            </View>
            {avisoBio && <Text style={styles.avisoBio}>{avisoBio}</Text>}
          </View>

          {/* Preferencias */}
          <Text style={styles.grupo}>Preferencias</Text>
          <View style={styles.tarjeta}>
            <Fila
              icono={<Palette size={19} color={colors.violet} />}
              titulo="Tema"
              valor="Elegir"
              onPress={() => setTemaAbierto(true)}
              colors={colors}
            />
            <Separador colors={colors} />
            <Fila
              icono={<Bell size={19} color={colors.violet} />}
              titulo="Notificaciones"
              onPress={() => router.push('/notificaciones')}
              colors={colors}
            />
          </View>

          {/* Legal */}
          <Text style={styles.grupo}>Información</Text>
          <View style={styles.tarjeta}>
            <Fila
              icono={<ShieldCheck size={19} color={colors.violet} />}
              titulo="Privacidad y términos"
              onPress={() => router.push('/legal')}
              colors={colors}
            />
          </View>

          {/* Salidas */}
          <View style={[styles.tarjeta, { marginTop: 20 }]}>
            <AnimatedPressable onPress={() => setConfirmarSalir(true)} style={styles.fila}>
              <View style={styles.filaIzq}>
                <LogOut size={19} color={colors.muted} />
                <Text style={styles.filaTitulo}>Cerrar sesión</Text>
              </View>
            </AnimatedPressable>
            <Separador colors={colors} />
            <AnimatedPressable onPress={() => setConfirmarBorrar(true)} style={styles.fila}>
              <View style={styles.filaIzq}>
                <Trash2 size={19} color={colors.danger} />
                <Text style={[styles.filaTitulo, { color: colors.danger }]}>Borrar mi cuenta</Text>
              </View>
            </AnimatedPressable>
          </View>

          <Text style={styles.version}>MyTokenPay · Sistema Financiero Social</Text>
        </ScrollView>
      </AnimatedScreen>

      <ThemeSheet visible={temaAbierto} onClose={() => setTemaAbierto(false)} />

      <ConfirmDialog
        visible={confirmarSalir}
        title="¿Cerrar sesión?"
        message="Vas a tener que volver a entrar con tu correo."
        confirmLabel="Cerrar sesión"
        onConfirm={() => {
          setConfirmarSalir(false)
          logout()
          router.replace('/login')
        }}
        onCancel={() => setConfirmarSalir(false)}
      />

      <ConfirmDialog
        visible={confirmarBorrar}
        icon={Trash2}
        danger
        title="¿Borrar tu cuenta?"
        message="Se elimina tu perfil y no se puede deshacer. Tu negocio, si tenés uno, también se borra."
        confirmLabel="Borrar todo"
        onConfirm={async () => {
          setConfirmarBorrar(false)
          await deleteAccount().catch(() => {})
          router.replace('/login')
        }}
        onCancel={() => setConfirmarBorrar(false)}
      />
    </SafeAreaView>
  )
}

function Fila({
  icono,
  titulo,
  valor,
  acento,
  onPress,
  colors,
}: {
  icono: React.ReactNode
  titulo: string
  valor?: string
  acento?: string
  onPress: () => void
  colors: ThemeColors
}) {
  const styles = crearEstilos(colors)
  return (
    <AnimatedPressable onPress={onPress} style={styles.fila}>
      <View style={styles.filaIzq}>
        {icono}
        <Text style={styles.filaTitulo}>{titulo}</Text>
      </View>
      <View style={styles.filaDer}>
        {valor && <Text style={[styles.filaValor, acento ? { color: acento } : null]}>{valor}</Text>}
        <ChevronRight size={17} color={colors.muted2} />
      </View>
    </AnimatedPressable>
  )
}

function Separador({ colors }: { colors: ThemeColors }) {
  return <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 48 }} />
}

function crearEstilos(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    cuerpo: { padding: 20, paddingBottom: 40 },

    perfil: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
    avatar: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: colors.surfaceHi,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarLetra: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.violet },
    nombre: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
    correo: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 1 },

    grupo: {
      fontFamily: fonts.bodyMedium,
      fontSize: 12,
      color: colors.muted2,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: 24,
      marginBottom: 8,
      marginLeft: 4,
    },
    tarjeta: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    filaIzq: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
    filaDer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    filaTitulo: { fontFamily: fonts.bodyMedium, fontSize: 14.5, color: colors.text },
    filaSub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 },
    filaValor: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
    avisoBio: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: colors.warn,
      paddingHorizontal: 14,
      paddingBottom: 12,
    },

    version: { fontFamily: fonts.body, fontSize: 12, color: colors.muted2, textAlign: 'center', marginTop: 28 },
  })
}
