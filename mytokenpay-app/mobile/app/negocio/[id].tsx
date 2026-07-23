import { useEffect, useState } from 'react'
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Clock,
  Globe,
  Camera,
  Heart,
  Link2,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  ReceiptText,
} from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AnimatedScreen } from '../../src/components/AnimatedScreen'
import { AnimatedText } from '../../src/components/AnimatedText'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { api } from '../../src/lib/api'
import type { Company, DayKey } from '../../src/lib/types'
import { useMetaStore } from '../../src/store/meta'
import { useFavoritesStore } from '../../src/store/favorites'
import { CategoryIcon } from '../../src/components/CategoryIcon'
import { CompanyMap } from '../../src/components/CompanyMap'
import { Card } from '../../src/components/ui/Card'
import { Skeleton } from '../../src/components/ui/Skeleton'
import { getCatalog, toOrigen, fmtOrigen, fmtUsd } from '../../src/lib/commerce'
import { useCartStore, cartCount, cartTotalUsd } from '../../src/store/cart'
import { fonts, radius, shadow } from '../../src/lib/theme'
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
  const favorite = useFavoritesStore((s) => (id ? s.ids.includes(id) : false))
  const toggleFavorite = useFavoritesStore((s) => s.toggle)
  const [company, setCompany] = useState<Company | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const cartLines = useCartStore((s) => s.lines)
  const cartCompanyId = useCartStore((s) => s.companyId)
  const setCartCompany = useCartStore((s) => s.setCompany)
  const addToCart = useCartStore((s) => s.add)
  const removeFromCart = useCartStore((s) => s.remove)

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (company) setCartCompany(company.id, company.tradeName, company.countrySlug)
  }, [company, setCartCompany])

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
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={styles.cover} />
        <View style={styles.header}>
          <Skeleton width={78} height={78} round="lg" style={{ marginBottom: 12 }} />
          <Skeleton width="55%" height={20} />
          <Skeleton width="35%" height={13} style={{ marginTop: 8 }} />
          <View style={{ marginTop: 24, gap: 8 }}>
            <Skeleton height={13} />
            <Skeleton height={13} width="90%" />
            <Skeleton height={13} width="70%" />
          </View>
        </View>
      </View>
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
      <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: 130 }}>
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

            {(() => {
              const catalog = getCatalog(company)
              if (catalog.length === 0) return null
              return (
                <View>
                  <Text style={styles.h2}>Menú · paga con ORIGEN</Text>
                  <View style={{ gap: 10 }}>
                    {catalog.map((item) => {
                      const line = cartCompanyId === company.id ? cartLines.find((l) => l.item.id === item.id) : undefined
                      const qty = line?.qty ?? 0
                      return (
                        <Card key={item.id} style={styles.catRow}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.catName} numberOfLines={1}>{item.name}</Text>
                            <Text style={styles.catDetail} numberOfLines={1}>{item.detail}</Text>
                            <Text style={styles.catPrice}>
                              {fmtOrigen(toOrigen(item.priceUsd))} ORIGEN
                              <Text style={styles.catUsd}>  ≈ {fmtUsd(item.priceUsd)}</Text>
                            </Text>
                          </View>
                          {qty === 0 ? (
                            <AnimatedPressable onPress={() => addToCart(item)} scaleTo={0.9} style={styles.addBtn}>
                              <Plus size={16} color={colors.bg} />
                            </AnimatedPressable>
                          ) : (
                            <View style={styles.stepper}>
                              <AnimatedPressable onPress={() => removeFromCart(item.id)} scaleTo={0.85} style={styles.stepBtn}>
                                <Minus size={14} color={colors.text} />
                              </AnimatedPressable>
                              <Text style={styles.stepQty}>{qty}</Text>
                              <AnimatedPressable onPress={() => addToCart(item)} scaleTo={0.85} style={styles.stepBtn}>
                                <Plus size={14} color={colors.text} />
                              </AnimatedPressable>
                            </View>
                          )}
                        </Card>
                      )
                    })}
                  </View>
                </View>
              )
            })()}

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

      {cartCompanyId === company.id && cartLines.length > 0 && (
        <SafeAreaView edges={['bottom']} style={styles.cartBarWrap} pointerEvents="box-none">
          <AnimatedPressable onPress={() => router.push('/cobro')} scaleTo={0.98}>
            <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cartBar}>
              <View style={styles.cartBadge}>
                <ReceiptText size={15} color={colors.bg} />
                <Text style={styles.cartBadgeText}>{cartCount(cartLines)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cartBarTitle}>Ver factura y cobrar</Text>
                <Text style={styles.cartBarSub}>
                  {fmtOrigen(toOrigen(cartTotalUsd(cartLines)))} ORIGEN · ≈ {fmtUsd(cartTotalUsd(cartLines))}
                </Text>
              </View>
              <ArrowRight size={18} color={colors.bg} />
            </LinearGradient>
          </AnimatedPressable>
        </SafeAreaView>
      )}

      <SafeAreaView style={styles.topFab} edges={['top']} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={16} color={colors.text} />
          <Text style={styles.backBtnText}>Directorio</Text>
        </Pressable>
        <AnimatedPressable onPress={() => id && toggleFavorite(id)} scaleTo={0.88} style={styles.heartBtn}>
          <Heart size={17} color={favorite ? colors.danger : colors.text} fill={favorite ? colors.danger : 'transparent'} />
        </AnimatedPressable>
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
  topFab: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: 'rgba(16,19,31,0.85)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backBtnText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 12 },
  heartBtn: {
    marginTop: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(16,19,31,0.85)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  catName: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 14 },
  catDetail: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11.5, marginTop: 2 },
  catPrice: { color: colors.text, fontFamily: fonts.display, fontSize: 13, marginTop: 6 },
  catUsd: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11 },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHi,
    borderRadius: radius.sm,
    padding: 3,
  },
  stepBtn: { width: 28, height: 28, borderRadius: radius.sm - 3, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepQty: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 13, minWidth: 22, textAlign: 'center' },
  cartBarWrap: { position: 'absolute', left: 16, right: 16, bottom: 10 },
  cartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 13,
    ...shadow(colors.violet, 'lg'),
  },
  cartBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(5,6,10,0.22)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cartBadgeText: { color: colors.bg, fontFamily: fonts.displayBold, fontSize: 12 },
  cartBarTitle: { color: colors.bg, fontFamily: fonts.display, fontSize: 14 },
  cartBarSub: { color: colors.bg, opacity: 0.85, fontFamily: fonts.bodySemiBold, fontSize: 11.5, marginTop: 1 },
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
