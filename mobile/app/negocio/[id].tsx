import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import {
  ArrowLeft,
  BadgeCheck,
  Clock,
  Globe,
  Camera,
  Link2,
  MapPin,
  MessageCircle,
} from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AnimatedScreen } from '../../src/components/AnimatedScreen'
import { AnimatedText } from '../../src/components/AnimatedText'
import { api } from '../../src/lib/api'
import type { Company, DayKey } from '../../src/lib/types'
import { useMetaStore } from '../../src/store/meta'
import { CategoryIcon } from '../../src/components/CategoryIcon'
import { CompanyMap } from '../../src/components/CompanyMap'
import { Card } from '../../src/components/ui/Card'
import { Chip } from '../../src/components/ui/Chip'
import { fonts, radius } from '../../src/lib/theme'
import { useTheme, type ThemeColors } from '../../src/hooks/useTheme'

const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
}
const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export default function CompanyDetail() {
  const { colors, gradient } = useTheme()
  const styles = createStyles(colors)
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { categories, countries, cityLabel, load } = useMetaStore()
  const [company, setCompany] = useState<Company | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!id) return
    setStatus('loading')
    api
      .getCompany(id)
      .then(({ company }) => {
        setCompany(company)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [id])

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.blue} />
      </SafeAreaView>
    )
  }

  if (status === 'error' || !company) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.emptyTitle}>No encontramos este comercio</Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Volver</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const category = categories.find((c) => c.slug === company.categorySlug)
  const country = countries.find((c) => c.slug === company.countrySlug)

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView bounces={false}>
        <View style={styles.cover}>
          {company.coverDataUrl ? (
            <Image source={{ uri: company.coverDataUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient colors={gradient as unknown as string[]} style={StyleSheet.absoluteFill} />
          )}
          <View style={styles.coverOverlay} />
        </View>

        <AnimatedScreen fill={false} style={styles.header}>
          <View style={styles.logoWrap}>
            {company.logoDataUrl ? (
              <Image source={{ uri: company.logoDataUrl }} style={styles.logo} />
            ) : (
              <LinearGradient colors={gradient as unknown as string[]} style={styles.logo}>
                <CategoryIcon name={category?.icon ?? ''} size={30} color={colors.bg} />
              </LinearGradient>
            )}
          </View>

          <View style={styles.nameRow}>
            <AnimatedText style={styles.name}>{company.tradeName}</AnimatedText>
            {company.verified && (
              <View style={styles.verifiedPill}>
                <BadgeCheck size={12} color={colors.ok} />
                <Text style={styles.verifiedText}>Verificado</Text>
              </View>
            )}
          </View>
          <Text style={styles.meta}>
            {category?.label} · {cityLabel(company.countrySlug, company.citySlug)}, {country?.label} {country?.flag}
          </Text>

          {company.socials.whatsapp && (
            <Pressable
              onPress={() => Linking.openURL(`https://wa.me/${company.socials.whatsapp!.replace(/[^\d]/g, '')}`)}
              style={{ marginTop: 16 }}
            >
              <LinearGradient colors={gradient as unknown as string[]} style={styles.contactBtn}>
                <MessageCircle size={15} color={colors.bg} />
                <Text style={styles.contactText}>Contactar</Text>
              </LinearGradient>
            </Pressable>
          )}

          <View style={{ marginTop: 24, gap: 20 }}>
            <View>
              <Text style={styles.h2}>Sobre este comercio</Text>
              <Text style={styles.body}>{company.description}</Text>
            </View>

            {company.productsServices.length > 0 && (
              <View>
                <Text style={styles.h2}>Productos y servicios</Text>
                <View style={styles.tagRow}>
                  {company.productsServices.map((tag) => (
                    <Chip key={tag} label={tag} />
                  ))}
                </View>
              </View>
            )}

            {company.gallery.length > 0 && (
              <View>
                <Text style={styles.h2}>Galería</Text>
                <View style={styles.gallery}>
                  {company.gallery.map((src, i) => (
                    <Image key={i} source={{ uri: src }} style={styles.galleryImg} />
                  ))}
                </View>
              </View>
            )}

            {company.hours && (
              <Card>
                <View style={styles.cardHeader}>
                  <Clock size={14} color={colors.text} />
                  <Text style={styles.cardHeaderText}>Horario</Text>
                </View>
                {DAY_ORDER.map((day) => (
                  <View key={day} style={styles.hourRow}>
                    <Text style={styles.hourDay}>{DAY_LABELS[day]}</Text>
                    <Text style={[styles.hourValue, company.hours![day].closed && { color: colors.muted2 }]}>
                      {company.hours![day].closed ? 'Cerrado' : `${company.hours![day].open} – ${company.hours![day].close}`}
                    </Text>
                  </View>
                ))}
              </Card>
            )}

            {(company.socials.website || company.socials.instagram || company.socials.facebook) && (
              <Card style={{ gap: 12 }}>
                <Text style={styles.cardHeaderText}>Enlaces</Text>
                {company.socials.website && <LinkRow icon={<Globe size={14} color={colors.muted} />} label="Sitio web" url={company.socials.website} />}
                {company.socials.instagram && <LinkRow icon={<Camera size={14} color={colors.muted} />} label="Instagram" url={company.socials.instagram} />}
                {company.socials.facebook && <LinkRow icon={<Link2 size={14} color={colors.muted} />} label="Facebook" url={company.socials.facebook} />}
              </Card>
            )}

            <View>
              <Text style={styles.h2}>Ubicación</Text>
              <View style={styles.addressRow}>
                <MapPin size={13} color={colors.muted} />
                <Text style={styles.addressText}>{company.address}</Text>
              </View>
              <View style={{ marginTop: 12 }}>
                <CompanyMap companies={[company]} center={{ latitude: company.lat, longitude: company.lng }} zoomDelta={0.05} />
              </View>
            </View>
          </View>
        </AnimatedScreen>
      </ScrollView>

      <SafeAreaView style={styles.backFab} edges={['top']} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={16} color={colors.text} />
          <Text style={styles.backBtnText}>Directorio</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  )
}

function LinkRow({ icon, label, url }: { icon: React.ReactNode; label: string; url: string }) {
  const { colors } = useTheme()
  const styles = createStyles(colors)
  return (
    <Pressable style={styles.linkRow} onPress={() => Linking.openURL(url)}>
      {icon}
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 14 },
  emptyTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
  backLink: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surface },
  backLinkText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 13 },
  cover: { height: 190, backgroundColor: colors.bgSoft },
  coverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,8,15,0.15)' },
  backFab: { position: 'absolute', top: 0, left: 0 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 16,
    marginTop: 8,
    backgroundColor: 'rgba(16,19,31,0.85)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backBtnText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 12 },
  header: { paddingHorizontal: 20, marginTop: -40 },
  logoWrap: { marginBottom: 12 },
  logo: {
    width: 78,
    height: 78,
    borderRadius: radius.lg,
    borderWidth: 4,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 22 },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.ok + '55',
    backgroundColor: colors.ok + '22',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  verifiedText: { color: colors.ok, fontFamily: fonts.bodySemiBold, fontSize: 10.5 },
  meta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 4 },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
    paddingVertical: 13,
  },
  contactText: { color: colors.bg, fontFamily: fonts.displayMedium, fontSize: 14 },
  h2: { color: colors.text, fontFamily: fonts.display, fontSize: 16, marginBottom: 8 },
  body: { color: colors.muted, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  galleryImg: { width: '31%', aspectRatio: 1, borderRadius: radius.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardHeaderText: { color: colors.text, fontFamily: fonts.display, fontSize: 14 },
  hourRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  hourDay: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5 },
  hourValue: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 12.5 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  linkText: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 13 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  addressText: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  })
}
