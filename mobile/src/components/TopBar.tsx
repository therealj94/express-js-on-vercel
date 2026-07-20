import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import {
  Bell,
  Building2,
  ChevronDown,
  FileText,
  Gift,
  IdCard,
  LayoutGrid,
  LogOut,
  Palette,
  UserX,
  Wallet,
} from 'lucide-react-native'
import { fonts } from '../lib/theme'
import { useTheme, type ThemeColors } from '../hooks/useTheme'
import { useAuthStore } from '../store/auth'
import { useWalletStore } from '../store/wallet'
import { useNotificationsStore } from '../store/notifications'
import { ActionSheet, type ActionItem } from './ActionSheet'
import { AnimatedPressable } from './AnimatedPressable'
import { ConfirmDialog } from './ConfirmDialog'
import { ThemeSheet } from './ThemeSheet'
import { Logo } from './Logo'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

export function TopBar({ title }: { title?: string }) {
  const { colors, gradient } = useTheme()
  const styles = createStyles(colors)
  const router = useRouter()
  const { user, logout, deleteAccount } = useAuthStore()
  const wallet = useWalletStore((s) => s.wallet)
  const unread = useNotificationsStore((s) => s.items.filter((n) => !n.read).length)
  const [menuOpen, setMenuOpen] = useState(false)
  const [themeSheetOpen, setThemeSheetOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const items: ActionItem[] = user
    ? [
        { key: 'panel', label: 'Mi panel', icon: LayoutGrid, onPress: () => router.push('/(tabs)/panel') },
        { key: 'bonos', label: 'Bonos y regalos', icon: Gift, onPress: () => router.push('/bonos') },
        {
          key: 'wallet',
          label: wallet ? 'Mi Veta Wallet' : 'Conectar mi Veta Wallet',
          icon: Wallet,
          onPress: () => router.push('/conectar-wallet'),
        },
        { key: 'identidad', label: 'Verificar mi identidad', icon: IdCard, onPress: () => router.push('/verificar-identidad') },
        { key: 'empresa', label: 'Registrar mi empresa', icon: Building2, onPress: () => router.push('/mi-empresa') },
        { key: 'apariencia', label: 'Apariencia', icon: Palette, onPress: () => setThemeSheetOpen(true) },
        { key: 'legal', label: 'Privacidad y términos', icon: FileText, onPress: () => router.push('/legal') },
        {
          key: 'logout',
          label: 'Cerrar sesión',
          icon: LogOut,
          danger: true,
          onPress: () => {
            logout()
            router.replace('/')
          },
        },
        {
          key: 'delete',
          label: 'Eliminar cuenta',
          icon: UserX,
          danger: true,
          onPress: () => setDeleteConfirmOpen(true),
        },
      ]
    : []

  async function handleDeleteAccount() {
    await deleteAccount()
    setDeleteConfirmOpen(false)
    router.replace('/')
  }

  return (
    <View style={styles.wrap}>
      {title ? <Text style={styles.title}>{title}</Text> : <Logo size="sm" />}

      <View style={styles.right}>
        {user && (
          <AnimatedPressable onPress={() => router.push('/notificaciones')} scaleTo={0.9} style={styles.bellBtn}>
            <Bell size={18} color={colors.text} />
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </AnimatedPressable>
        )}

        {user ? (
          <AnimatedPressable onPress={() => setMenuOpen(true)} style={styles.pill}>
            <LinearGradient colors={gradient as unknown as string[]} style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(user.fullName)}</Text>
            </LinearGradient>
            <Text style={styles.pillText} numberOfLines={1}>{user.fullName.split(' ')[0]}</Text>
            <ChevronDown size={13} color={colors.muted} />
          </AnimatedPressable>
        ) : (
          <AnimatedPressable onPress={() => router.push('/login')} style={styles.loginBtn}>
            <Text style={styles.loginText}>Iniciar sesión</Text>
          </AnimatedPressable>
        )}
      </View>

      {user && (
        <ActionSheet
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          items={items}
          header={
            <View style={styles.menuHeader}>
              <LinearGradient colors={gradient as unknown as string[]} style={styles.menuAvatar}>
                <Text style={styles.menuAvatarText}>{initials(user.fullName)}</Text>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuName} numberOfLines={2}>{user.fullName}</Text>
                <Text style={styles.menuEmail} numberOfLines={1}>{user.email}</Text>
              </View>
            </View>
          }
        />
      )}

      <ThemeSheet visible={themeSheetOpen} onClose={() => setThemeSheetOpen(false)} />

      <ConfirmDialog
        visible={deleteConfirmOpen}
        icon={UserX}
        danger
        title="Eliminar tu cuenta"
        message="Se eliminará tu cuenta, tu perfil de empresa y toda la información asociada (KYC, fotos, ubicación). Esta acción no se puede deshacer."
        confirmLabel="Eliminar cuenta"
        onConfirm={handleDeleteAccount}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { color: colors.text, fontFamily: fonts.display, fontSize: 17 },
    bellBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      position: 'absolute',
      top: -3,
      right: -3,
      minWidth: 17,
      height: 17,
      borderRadius: 9,
      backgroundColor: colors.danger,
      borderWidth: 1.5,
      borderColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    badgeText: { color: '#fff', fontFamily: fonts.bodySemiBold, fontSize: 9 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 6,
    },
    avatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: colors.bg, fontFamily: fonts.bodySemiBold, fontSize: 9 },
    pillText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 12, maxWidth: 90 },
    loginBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    loginText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 12 },
    menuHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 10,
      paddingBottom: 14,
      marginBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    menuAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    menuAvatarText: { color: colors.bg, fontFamily: fonts.displayBold, fontSize: 15 },
    menuName: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
    menuEmail: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  })
}
