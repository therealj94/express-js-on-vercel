import { useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { BadgeCheck, Copy, ExternalLink, Heart, MapPin, MoreVertical, Navigation, Share2 } from 'lucide-react-native'
import type { Company } from '../lib/types'
import { useMetaStore } from '../store/meta'
import { useFavoritesStore } from '../store/favorites'
import { fonts, radius, shadow } from '../lib/theme'
import { useTheme, type ThemeColors } from '../hooks/useTheme'
import { CategoryIcon } from './CategoryIcon'
import { Pressable3D } from './Pressable3D'
import { Chip } from './ui/Chip'
import { ActionSheet, type ActionItem } from './ActionSheet'
import { copyAddress, openDirections, shareCompany } from '../lib/companyActions'

// Photo-forward, tappable-in-3D business card: the cover image is the hero,
// with the logo + name floating over a gradient scrim and only the essential
// info below. Reads as "visual first, text second".
export function CompanyCard({ company }: { company: Company }) {
  const { colors, gradient } = useTheme()
  const styles = createStyles(colors)
  const router = useRouter()
  const { categories, countries, cityLabel } = useMetaStore()
  const category = categories.find((c) => c.slug === company.categorySlug)
  const country = countries.find((c) => c.slug === company.countrySlug)
  const favorite = useFavoritesStore((s) => s.ids.includes(company.id))
  const toggleFavorite = useFavoritesStore((s) => s.toggle)
  const [menuOpen, setMenuOpen] = useState(false)

  const items: ActionItem[] = [
    { key: 'view', label: 'Ver ficha', icon: ExternalLink, onPress: () => router.push(`/negocio/${company.id}`) },
    { key: 'directions', label: 'Cómo llegar', icon: Navigation, onPress: () => openDirections(company) },
    { key: 'share', label: 'Compartir negocio', icon: Share2, onPress: () => shareCompany(company) },
    { key: 'copy', label: 'Copiar dirección', icon: Copy, onPress: () => copyAddress(company) },
  ]

  return (
    <Pressable3D onPress={() => router.push(`/negocio/${company.id}`)} tilt={6} style={styles.card}>
      <View style={styles.coverWrap}>
        {company.coverDataUrl ? (
          <Image source={{ uri: company.coverDataUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(6,7,13,0.35)', 'rgba(6,7,13,0.88)']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />

        {company.verified && (
          <View style={styles.verifiedPill}>
            <BadgeCheck size={12} color="#fff" />
            <Text style={styles.verifiedText}>Verificado</Text>
          </View>
        )}

        <View style={styles.topRight}>
          <Pressable onPress={() => toggleFavorite(company.id)} hitSlop={8} style={styles.iconBtn}>
            <Heart size={15} color={favorite ? colors.danger : '#fff'} fill={favorite ? colors.danger : 'transparent'} />
          </Pressable>
          <Pressable onPress={() => setMenuOpen(true)} hitSlop={8} style={styles.iconBtn}>
            <MoreVertical size={16} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.coverContent}>
          <View style={styles.logoWrap}>
            {company.logoDataUrl ? (
              <Image source={{ uri: company.logoDataUrl }} style={styles.logo} />
            ) : (
              <LinearGradient colors={gradient} style={styles.logo}>
                <CategoryIcon name={category?.icon ?? ''} size={20} color={colors.bg} />
              </LinearGradient>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{company.tradeName}</Text>
            <View style={styles.metaRow}>
              <MapPin size={11} color="rgba(255,255,255,0.85)" />
              <Text style={styles.metaText} numberOfLines={1}>
                {cityLabel(company.countrySlug, company.citySlug)}, {country?.label ?? ''} {country?.flag}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.tagRow}>
          <Chip label={category?.label ?? company.categorySlug} />
          {company.productsServices.slice(0, 1).map((tag) => (
            <Chip key={tag} label={tag} />
          ))}
        </View>
      </View>

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={company.tradeName}
        items={items}
      />
    </Pressable3D>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      ...shadow(colors.bg, 'sm'),
    },
    coverWrap: { height: 168, backgroundColor: colors.bgSoft, justifyContent: 'flex-end' },
    verifiedPill: {
      position: 'absolute',
      top: 12,
      left: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(52,211,153,0.9)',
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    verifiedText: { color: '#fff', fontFamily: fonts.bodySemiBold, fontSize: 10.5 },
    topRight: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 8 },
    iconBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: 'rgba(6,7,13,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    coverContent: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    logoWrap: {
      width: 48,
      height: 48,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.85)',
      overflow: 'hidden',
    },
    logo: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
    name: { color: '#fff', fontFamily: fonts.displayBold, fontSize: 17, textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 8 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
    metaText: { color: 'rgba(255,255,255,0.9)', fontFamily: fonts.body, fontSize: 11.5, flex: 1 },
    footer: { paddingHorizontal: 14, paddingVertical: 12 },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  })
}
