import { useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { BadgeCheck, Copy, ExternalLink, MapPin, MoreVertical, Navigation, Share2 } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { Company } from '../lib/types'
import { useMetaStore } from '../store/meta'
import { fonts, radius } from '../lib/theme'
import { useTheme, type ThemeColors } from '../hooks/useTheme'
import { CategoryIcon } from './CategoryIcon'
import { Card } from './ui/Card'
import { Chip } from './ui/Chip'
import { ActionSheet, type ActionItem } from './ActionSheet'
import { copyAddress, openDirections, shareCompany } from '../lib/companyActions'

export function CompanyCard({ company }: { company: Company }) {
  const { colors, gradient } = useTheme()
  const styles = createStyles(colors)
  const router = useRouter()
  const { categories, countries, cityLabel } = useMetaStore()
  const category = categories.find((c) => c.slug === company.categorySlug)
  const country = countries.find((c) => c.slug === company.countrySlug)
  const [menuOpen, setMenuOpen] = useState(false)

  const items: ActionItem[] = [
    { key: 'view', label: 'Ver ficha', icon: ExternalLink, onPress: () => router.push(`/negocio/${company.id}`) },
    { key: 'directions', label: 'Cómo llegar', icon: Navigation, onPress: () => openDirections(company) },
    { key: 'share', label: 'Compartir negocio', icon: Share2, onPress: () => shareCompany(company) },
    { key: 'copy', label: 'Copiar dirección', icon: Copy, onPress: () => copyAddress(company) },
  ]

  return (
    <Card onPress={() => router.push(`/negocio/${company.id}`)} style={{ padding: 16 }}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {company.logoDataUrl ? (
            <Image source={{ uri: company.logoDataUrl }} style={styles.logo} />
          ) : (
            <LinearGradient colors={gradient as unknown as string[]} style={styles.logo}>
              <CategoryIcon name={category?.icon ?? ''} size={22} color={colors.bg} />
            </LinearGradient>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{company.tradeName}</Text>
            <Text style={styles.category}>{category?.label ?? company.categorySlug}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {company.verified && <BadgeCheck size={18} color={colors.ok} />}
          <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} style={styles.moreBtn}>
            <MoreVertical size={16} color={colors.muted} />
          </Pressable>
        </View>
      </View>

      <Text style={styles.description} numberOfLines={2}>{company.description}</Text>

      {company.productsServices.length > 0 && (
        <View style={styles.tagRow}>
          {company.productsServices.slice(0, 3).map((tag) => (
            <Chip key={tag} label={tag} />
          ))}
        </View>
      )}

      <View style={styles.footer}>
        <MapPin size={12} color={colors.muted2} />
        <Text style={styles.footerText} numberOfLines={1}>
          {cityLabel(company.countrySlug, company.citySlug)}, {country?.label ?? company.countrySlug}
        </Text>
        <Text style={styles.flag}>{country?.flag}</Text>
      </View>

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={company.tradeName}
        items={items}
      />
    </Card>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moreBtn: { padding: 2 },
  logo: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  name: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
  category: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  description: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 14 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11, flex: 1 },
  flag: { fontSize: 13 },
  })
}
