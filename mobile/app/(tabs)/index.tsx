import { useEffect, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowRight, MapPinned, Search, ShieldCheck, Sparkle, Store, Users, X } from 'lucide-react-native'
import { Screen } from '../../src/components/Screen'
import { TopBar } from '../../src/components/TopBar'
import { CategoryIcon } from '../../src/components/CategoryIcon'
import { CompanyCard } from '../../src/components/CompanyCard'
import { Card } from '../../src/components/ui/Card'
import { TextField } from '../../src/components/ui/TextField'
import { AnimatedText } from '../../src/components/AnimatedText'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { useMetaStore } from '../../src/store/meta'
import { api } from '../../src/lib/api'
import type { Company } from '../../src/lib/types'
import { fonts, radius, shadow } from '../../src/lib/theme'
import { useTheme, type ThemeColors } from '../../src/hooks/useTheme'

const STEPS = [
  { n: '01', title: 'Regístrate y verifica', body: 'Crea tu cuenta y completa el KYC/KYB de tu empresa.', icon: ShieldCheck },
  { n: '02', title: 'Completa tu perfil', body: 'Logo, fotos, servicios, redes y tu ubicación exacta.', icon: Store },
  { n: '03', title: 'Aparece en el directorio', body: 'Visible por país, ciudad y categoría al instante.', icon: MapPinned },
  { n: '04', title: 'Recibe nuevos clientes', body: 'Usuarios que buscan dónde gastar su ORIGEN te encuentran.', icon: Users },
]

export default function Home() {
  const { colors, gradient } = useTheme()
  const styles = createStyles(colors)
  const router = useRouter()
  const { categories, countries, load } = useMetaStore()
  const [companies, setCompanies] = useState<Company[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    load()
    api.listCompanies({}).then(({ companies }) => setCompanies(companies)).catch(() => {})
  }, [load])

  const verifiedCount = companies.filter((c) => c.verified).length
  const featured = companies.filter((c) => c.verified).slice(0, 4)

  function submitSearch() {
    router.push({ pathname: '/(tabs)/explorar', params: query ? { q: query } : {} })
  }

  return (
    <Screen edges={['top']}>
      <TopBar />

      <View style={styles.section}>
        <View style={styles.badge}>
          <Sparkle size={11} color={colors.muted} />
          <Text style={styles.badgeText}>Capa de comercio del Sistema Financiero Social</Text>
        </View>
        <AnimatedText style={styles.h1}>Encuentra dónde pagar con ORIGEN</AnimatedText>
        <Text style={styles.subtitle}>
          El directorio de comercios afiliados en toda Latinoamérica, de México a la Patagonia.
        </Text>

        <View style={styles.searchRow}>
          <View style={{ flex: 1 }}>
            <TextField
              value={query}
              onChangeText={setQuery}
              placeholder="Restaurantes, hoteles, gimnasios…"
              icon={<Search size={15} color={colors.muted2} />}
              rightElement={
                query.length > 0 ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={10}>
                    <X size={14} color={colors.muted2} />
                  </Pressable>
                ) : undefined
              }
              onSubmitEditing={submitSearch}
              returnKeyType="search"
            />
          </View>
          <Pressable onPress={submitSearch}>
            <LinearGradient colors={gradient as unknown as string[]} style={styles.searchBtn}>
              <Search size={17} color={colors.bg} />
            </LinearGradient>
          </Pressable>
        </View>
      </View>

      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Store size={18} color={colors.violet} />
          <Text style={styles.statNumber}>{companies.length || '—'}</Text>
          <Text style={styles.statLabel}>Comercios</Text>
        </Card>
        <Card style={styles.statCard}>
          <ShieldCheck size={18} color={colors.ok} />
          <Text style={styles.statNumber}>{verifiedCount || '—'}</Text>
          <Text style={styles.statLabel}>Verificados</Text>
        </Card>
        <Card style={styles.statCard}>
          <MapPinned size={18} color={colors.blue} />
          <Text style={styles.statNumber}>{countries.length || '—'}</Text>
          <Text style={styles.statLabel}>Países</Text>
        </Card>
      </View>

      <AnimatedPressable onPress={() => router.push('/registro?tipo=negocio')} scaleTo={0.98} style={styles.section}>
        <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cta}>
          <Sparkle size={20} color={colors.bg} />
          <Text style={styles.ctaTitle}>¿Tienes un negocio?</Text>
          <Text style={styles.ctaBody}>Actívate y empieza a recibir pagos en ORIGEN.</Text>
          <View style={styles.ctaLinkRow}>
            <Text style={styles.ctaLink}>Registrar mi negocio</Text>
            <ArrowRight size={14} color={colors.bg} />
          </View>
        </LinearGradient>
      </AnimatedPressable>

      <View style={styles.section}>
        <AnimatedText style={styles.sectionTitle}>Explora por categoría</AnimatedText>
        <View style={styles.catGrid}>
          {categories.slice(0, 8).map((cat) => (
            <AnimatedPressable
              key={cat.slug}
              scaleTo={0.94}
              style={styles.catCard}
              onPress={() => router.push({ pathname: '/(tabs)/explorar', params: { category: cat.slug } })}
            >
              <LinearGradient colors={gradient as unknown as string[]} style={styles.catIcon}>
                <CategoryIcon name={cat.icon} size={17} color={colors.bg} />
              </LinearGradient>
              <Text style={styles.catLabel} numberOfLines={2}>{cat.label}</Text>
            </AnimatedPressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <AnimatedText style={styles.sectionTitle} delay={60}>Cómo funciona para tu negocio</AnimatedText>
        <View style={{ gap: 12, marginTop: 4 }}>
          {STEPS.map((step) => (
            <Card key={step.n} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
              <View style={styles.stepIcon}>
                <step.icon size={18} color={colors.blue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepN}>{step.n}</Text>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepBody}>{step.body}</Text>
              </View>
            </Card>
          ))}
        </View>
      </View>

      {featured.length > 0 && (
        <View style={styles.section}>
          <AnimatedText style={styles.sectionTitle} delay={60}>Comercios destacados</AnimatedText>
          <View style={{ gap: 12, marginTop: 4 }}>
            {featured.map((company) => (
              <CompanyCard key={company.id} company={company} />
            ))}
          </View>
        </View>
      )}

      <View style={[styles.section, { marginTop: 8 }]}>
        <Image source={require('../../assets/hero-people.jpg')} style={styles.heroImage} resizeMode="cover" />
        <Text style={styles.heroTitle}>Tu negocio, visible para toda la comunidad</Text>
        <Text style={styles.heroBody}>
          Regístrate gratis, completa tu perfil y verifica tu empresa. Trazabilidad pública y
          liquidación en minutos.
        </Text>
        <AnimatedPressable onPress={() => router.push('/registro?tipo=negocio')} scaleTo={0.97}>
          <LinearGradient colors={gradient as unknown as string[]} style={styles.heroBtn}>
            <Text style={styles.heroBtnText}>Registrar mi negocio</Text>
            <ArrowRight size={14} color={colors.bg} />
          </LinearGradient>
        </AnimatedPressable>
      </View>
    </Screen>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  section: { paddingHorizontal: 20, marginTop: 24 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHi,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 10 },
  h1: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 30, lineHeight: 36, marginTop: 14 },
  subtitle: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 10 },
  searchRow: { flexDirection: 'row', gap: 10, marginTop: 18, alignItems: 'center' },
  searchBtn: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 20 },
  statCard: { flex: 1, gap: 8, alignItems: 'flex-start' },
  statNumber: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 20 },
  statLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 11 },
  cta: { borderRadius: radius.xl, padding: 20, ...shadow(colors.violet, 'lg') },
  ctaTitle: { color: colors.bg, fontFamily: fonts.display, fontSize: 18, marginTop: 10 },
  ctaBody: { color: colors.bg, opacity: 0.8, fontFamily: fonts.body, fontSize: 13, marginTop: 4 },
  ctaLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  ctaLink: { color: colors.bg, fontFamily: fonts.bodySemiBold, fontSize: 13 },
  sectionTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 18 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  catCard: {
    width: '31%',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 12,
    gap: 10,
  },
  catIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  catLabel: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 11.5, lineHeight: 15 },
  stepIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepN: { color: colors.muted2, fontFamily: fonts.displayBold, fontSize: 10 },
  stepTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 14, marginTop: 4 },
  stepBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  heroImage: { width: '100%', height: 160, borderRadius: radius.xl },
  heroTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 18, marginTop: 16 },
  heroBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 6 },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
    paddingVertical: 13,
    marginTop: 16,
  },
  heroBtnText: { color: colors.bg, fontFamily: fonts.displayMedium, fontSize: 14 },
  })
}
