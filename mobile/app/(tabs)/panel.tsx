import { useEffect, useMemo, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import {
  ArrowRight,
  BadgeCheck,
  Clock,
  Copy,
  ExternalLink,
  FileCheck2,
  LogIn,
  MapPin,
  MoreVertical,
  Navigation,
  Pencil,
  Rocket,
  Share2,
  ShieldAlert,
  ShieldQuestion,
} from 'lucide-react-native'
import { Screen } from '../../src/components/Screen'
import { TopBar } from '../../src/components/TopBar'
import { CategoryIcon } from '../../src/components/CategoryIcon'
import { StatusBadge } from '../../src/components/StatusBadge'
import { Card } from '../../src/components/ui/Card'
import { GradientButton } from '../../src/components/ui/GradientButton'
import { ActionSheet, type ActionItem } from '../../src/components/ActionSheet'
import { api } from '../../src/lib/api'
import { copyAddress, openDirections, shareCompany } from '../../src/lib/companyActions'
import type { Company } from '../../src/lib/types'
import { useAuthStore } from '../../src/store/auth'
import { useMetaStore } from '../../src/store/meta'
import { colors, fonts, gradient, radius } from '../../src/lib/theme'

function profileCompleteness(company: Company): number {
  const checks = [
    Boolean(company.logoDataUrl),
    Boolean(company.coverDataUrl),
    company.description.trim().length > 20,
    company.productsServices.length > 0,
    Boolean(company.socials.website || company.socials.instagram || company.socials.facebook || company.socials.whatsapp),
    company.gallery.length > 0,
    company.kyc.status !== 'unsubmitted',
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

const KYC_STEPS = [
  { key: 'unsubmitted', label: 'Registro', icon: FileCheck2 },
  { key: 'pending', label: 'En revisión', icon: Clock },
  { key: 'verified', label: 'Verificado', icon: BadgeCheck },
] as const

export default function Dashboard() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { categories, load } = useMetaStore()
  const [company, setCompany] = useState<Company | null | undefined>(undefined)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    load()
    if (user) api.myCompany().then(({ company }) => setCompany(company))
  }, [load, user])

  const completeness = useMemo(() => (company ? profileCompleteness(company) : 0), [company])
  const category = categories.find((c) => c.slug === company?.categorySlug)
  const stepIndex =
    company?.kyc.status === 'verified' ? 2 : company?.kyc.status === 'pending' || company?.kyc.status === 'rejected' ? 1 : 0

  if (!user) {
    return (
      <Screen edges={['top']}>
        <TopBar title="Mi panel" />
        <View style={styles.guestWrap}>
          <Image source={require('../../assets/hero-people.jpg')} style={styles.guestImage} resizeMode="cover" />
          <Text style={styles.guestTitle}>Inicia sesión para administrar tu negocio</Text>
          <Text style={styles.guestBody}>
            Crea una cuenta para registrar tu empresa, verificarla y aparecer en el directorio.
          </Text>
          <GradientButton
            label="Iniciar sesión"
            onPress={() => router.push('/login')}
            icon={<LogIn size={16} color={colors.bg} />}
            style={{ marginTop: 20, alignSelf: 'stretch' }}
          />
          <Pressable onPress={() => router.push('/registro?tipo=negocio')} style={{ marginTop: 12 }}>
            <Text style={styles.guestLink}>Crear una cuenta nueva</Text>
          </Pressable>
        </View>
      </Screen>
    )
  }

  return (
    <Screen edges={['top']}>
      <TopBar title="Mi panel" />
      <View style={styles.section}>
        <Text style={styles.hello}>Hola, {user.fullName.split(' ')[0]}</Text>
        <Text style={styles.subtitle}>Este es el panel de tu cuenta en MyTokenPay.</Text>
      </View>

      {company === undefined ? (
        <View style={styles.section}>
          <View style={styles.skeleton} />
        </View>
      ) : company === null ? (
        <View style={styles.section}>
          <Pressable onPress={() => router.push('/registrar-empresa')}>
            <LinearGradient colors={gradient as unknown as string[]} style={styles.registerCta}>
              <Rocket size={22} color={colors.bg} />
              <Text style={styles.registerTitle}>Registra tu empresa</Text>
              <Text style={styles.registerBody}>
                Completa el registro con KYC/KYB, ubicación exacta y perfil público.
              </Text>
              <View style={styles.registerLinkRow}>
                <Text style={styles.registerLink}>Empezar registro</Text>
                <ArrowRight size={14} color={colors.bg} />
              </View>
            </LinearGradient>
          </Pressable>

          <Card style={{ marginTop: 14 }}>
            <Text style={styles.cardTitle}>Lo que vas a necesitar</Text>
            <View style={{ marginTop: 10, gap: 8 }}>
              {[
                'Nombre legal y comercial de tu empresa',
                'Identificación tributaria (RTN / NIT)',
                'Rubro, productos o servicios que ofreces',
                'Ubicación exacta en el mapa',
                'Documento de identidad y constitución legal',
              ].map((item) => (
                <Text key={item} style={styles.listItem}>· {item}</Text>
              ))}
            </View>
          </Card>
        </View>
      ) : (
        <View style={styles.section}>
          <Card>
            <View style={styles.companyRow}>
              {company.logoDataUrl ? (
                <Image source={{ uri: company.logoDataUrl }} style={styles.companyLogo} />
              ) : (
                <LinearGradient colors={gradient as unknown as string[]} style={styles.companyLogo}>
                  <CategoryIcon name={category?.icon ?? ''} size={20} color={colors.bg} />
                </LinearGradient>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.companyName}>{company.tradeName}</Text>
                <Text style={styles.companyCategory}>{category?.label}</Text>
              </View>
              <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} style={styles.moreBtn}>
                <MoreVertical size={17} color={colors.muted} />
              </Pressable>
            </View>
            <View style={{ marginTop: 14 }}>
              <StatusBadge status={company.kyc.status} />
            </View>
            <Pressable onPress={() => router.push(`/negocio/${company.id}`)} style={styles.linkRow}>
              <Text style={styles.link}>Ver ficha pública</Text>
              <ExternalLink size={12} color={colors.blue} />
            </Pressable>
          </Card>

          <ActionSheet
            visible={menuOpen}
            onClose={() => setMenuOpen(false)}
            title={company.tradeName}
            items={
              [
                { key: 'view', label: 'Ver ficha pública', icon: ExternalLink, onPress: () => router.push(`/negocio/${company.id}`) },
                { key: 'edit', label: 'Editar perfil', icon: Pencil, onPress: () => router.push('/mi-empresa') },
                { key: 'directions', label: 'Cómo llegar', icon: Navigation, onPress: () => openDirections(company) },
                { key: 'share', label: 'Compartir negocio', icon: Share2, onPress: () => shareCompany(company) },
                { key: 'copy', label: 'Copiar dirección', icon: Copy, onPress: () => copyAddress(company) },
              ] satisfies ActionItem[]
            }
          />

          <Card style={{ marginTop: 12 }}>
            <Text style={styles.statLabel}>Perfil completo</Text>
            <Text style={styles.statNumber}>{completeness}%</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${completeness}%` }]} />
            </View>
            <Pressable onPress={() => router.push('/mi-empresa')} style={styles.linkRow}>
              <Pencil size={12} color={colors.blue} />
              <Text style={styles.link}>Completar perfil</Text>
            </Pressable>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <Text style={styles.statLabel}>Ubicación</Text>
            <View style={styles.addressRow}>
              <MapPin size={14} color={colors.text} />
              <Text style={styles.addressText}>{company.address}</Text>
            </View>
            <Pressable onPress={() => router.push('/mi-empresa')} style={styles.linkRow}>
              <Text style={styles.link}>Editar ubicación</Text>
            </Pressable>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <Text style={styles.cardTitle}>Estado de verificación (Genesis ID)</Text>
            <Text style={styles.cardBody}>
              {company.kyc.status === 'verified'
                ? 'Tu empresa está verificada y visible en el directorio público.'
                : company.kyc.status === 'pending'
                  ? 'Tus documentos están en revisión. Este proceso puede tardar algunas horas.'
                  : company.kyc.status === 'rejected'
                    ? 'Tu verificación fue rechazada. Revisa el motivo y vuelve a enviar tus documentos.'
                    : 'Aún no has enviado tus documentos de verificación KYC/KYB.'}
            </Text>

            <View style={styles.stepsRow}>
              {KYC_STEPS.map((step, i) => (
                <View key={step.key} style={styles.stepItem}>
                  <View style={[styles.stepDot, i <= stepIndex ? styles.stepDotActive : null]}>
                    <step.icon size={14} color={i <= stepIndex ? colors.blue : colors.muted2} />
                  </View>
                  <Text style={[styles.stepLabel, i <= stepIndex && { color: colors.text }]}>{step.label}</Text>
                </View>
              ))}
            </View>

            {company.kyc.status === 'unsubmitted' && (
              <GradientButton label="Enviar documentos" onPress={() => router.push('/registrar-empresa')} style={{ marginTop: 16 }} />
            )}
            {company.kyc.status === 'rejected' && (
              <View style={styles.warnBox}>
                <ShieldAlert size={14} color={colors.danger} />
                <Text style={styles.warnText}>{company.kyc.note ?? 'No se especificó el motivo. Contacta a soporte.'}</Text>
              </View>
            )}
            {company.kyc.status === 'pending' && (
              <View style={[styles.warnBox, { borderColor: colors.warn + '55', backgroundColor: colors.warn + '18' }]}>
                <ShieldQuestion size={14} color={colors.warn} />
                <Text style={[styles.warnText, { color: colors.warn }]}>
                  DBNX revisa tus documentos contra listas AML, OFAC y ONU antes de emitir tu Genesis ID.
                </Text>
              </View>
            )}
          </Card>
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 20, marginTop: 20 },
  hello: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 24 },
  subtitle: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 4 },
  skeleton: { height: 140, borderRadius: radius.xl, backgroundColor: colors.surface },
  guestWrap: { paddingHorizontal: 20, marginTop: 12, alignItems: 'center' },
  guestImage: { width: '100%', height: 160, borderRadius: radius.xl },
  guestTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 18, textAlign: 'center', marginTop: 20 },
  guestBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  guestLink: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 13 },
  registerCta: { borderRadius: radius.xl, padding: 22 },
  registerTitle: { color: colors.bg, fontFamily: fonts.display, fontSize: 19, marginTop: 14 },
  registerBody: { color: colors.bg, opacity: 0.85, fontFamily: fonts.body, fontSize: 13, marginTop: 6, lineHeight: 19 },
  registerLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  registerLink: { color: colors.bg, fontFamily: fonts.bodySemiBold, fontSize: 13 },
  cardTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 14 },
  cardBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, marginTop: 6 },
  listItem: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5 },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  moreBtn: { padding: 4 },
  companyLogo: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  companyName: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
  companyCategory: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  link: { color: colors.blue, fontFamily: fonts.bodySemiBold, fontSize: 12 },
  statLabel: { color: colors.muted2, fontFamily: fonts.bodySemiBold, fontSize: 11, textTransform: 'uppercase' },
  statNumber: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 26, marginTop: 4 },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: colors.surfaceHi, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.blue, borderRadius: 999 },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  addressText: { color: colors.text, fontFamily: fonts.body, fontSize: 13.5, flex: 1 },
  stepsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18, gap: 4 },
  stepItem: { alignItems: 'center', gap: 6, flex: 1 },
  stepDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { borderColor: colors.blue, backgroundColor: colors.blue + '22' },
  stepLabel: { color: colors.muted2, fontFamily: fonts.bodySemiBold, fontSize: 10 },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.danger + '55',
    backgroundColor: colors.danger + '18',
    borderRadius: radius.sm,
    padding: 12,
  },
  warnText: { color: colors.danger, fontFamily: fonts.body, fontSize: 12, flex: 1, lineHeight: 17 },
})
