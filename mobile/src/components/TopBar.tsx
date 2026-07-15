import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { LogOut, User } from 'lucide-react-native'
import { colors, fonts } from '../lib/theme'
import { useAuthStore } from '../store/auth'

export function TopBar({ title }: { title?: string }) {
  const router = useRouter()
  const { user, logout } = useAuthStore()

  return (
    <View style={styles.wrap}>
      {title ? (
        <Text style={styles.title}>{title}</Text>
      ) : (
        <Image source={require('../../assets/logo.jpg')} style={styles.logo} resizeMode="cover" />
      )}

      {user ? (
        <Pressable onPress={logout} style={styles.pill}>
          <User size={13} color={colors.text} />
          <Text style={styles.pillText}>{user.fullName.split(' ')[0]}</Text>
          <LogOut size={13} color={colors.muted} />
        </Pressable>
      ) : (
        <Pressable onPress={() => router.push('/login')} style={styles.loginBtn}>
          <Text style={styles.loginText}>Iniciar sesión</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  logo: { width: 108, height: 32, borderRadius: 6 },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 17 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 12 },
  loginBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  loginText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 12 },
})
