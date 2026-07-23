import { useEffect, useState } from 'react'
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, ArrowRight, Building2, Check, Globe, Camera, ShieldCheck } from 'lucide-react-native'
import { api } from '../src/lib/api'
import { useMetaStore } from '../src/store/meta'
import { CategoryIcon } from '../src/components/CategoryIcon'
import { MapPicker } from '../src/components/MapPicker'
import { TextField, Field } from '../src/components/ui/TextField'
import { SelectField } from '../src/components/ui/SelectField'
import { GradientButton } from '../src/components/ui/GradientButton'
import { TagInput } from '../src/components/forms/TagInput'
import { ImagePickerField } from '../src/components/forms/ImagePickerField'
import { DocPickerField, type PickedDoc } from '../src/components/forms/DocPickerField'
import { HoursEditor } from '../src/components/forms/HoursEditor'
import { AnimatedScreen } from '../src/components/AnimatedScreen'
import { fonts, radius } from '../src/lib/theme'
import { useTheme, type ThemeColors } from '../src/hooks/useTheme'
import type { CompanySocials, WeekHours } from '../src/lib/types'

const DEFAULT_HOURS: WeekHours = {
  mon: { open: '08:00', close: '18:00', closed: false },
  tue: { open: '08:00', close: '18:00', closed: false },
  wed: { open: '08:00', close: '18:00', closed: false },
  thu: { open: '08:00', close: '18:00', closed: false },
  fri: { open: '08:00', close: '21:00', closed: false },
  sat: { open: '09:00', close: '21:00', closed: false },
  sun: { open: '00:00', close: '00:00', closed: true },
}

interface FormState {
  legalName: string
  tradeName: string
  taxId: string
  countrySlug: string
  citySlug: string
  address: string
  lat: number
  lng: number
  categorySlug: string
  productsServices: string[]
  description: string
  logoDataUrl: string | null
  coverDataUrl: string | null
  socials: CompanySocials
  hours: WeekHours
}

const STEP_LABELS = ['Datos básicos', 'Ubicación', 'Rubro', 'Perfil público', 'Verificación', 'Revisión']

export default function RegisterCompany() {
  const { colors } = useTheme()
  const styles = createStyles(colors)
  const router = useRouter()
  const { categories, countries, load } = useMetaStore()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>({
    legalName: '',
    tradeName: '',
    taxId: '',
    countrySlug: '',
    citySlug: '',
    address: '',
    lat: 14.8,
    lng: -86.6,
    categorySlug: '',
    productsServices: [],
    description: '',
    logoDataUrl: null,
    coverDataUrl: null,
    socials: {},
    hours: DEFAULT_HOURS,
  })

  const [idDoc, setIdDoc] = useState<PickedDoc | null>(null)
  const [legalDoc, setLegalDoc] = useState<PickedDoc | null>(null)
  const [declaration, setDeclaration] = useState(false)

  useEffect(() => {
    load()
  }, [load])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const cities = countries.find((c) => c.slug === form.countrySlug)?.cities ?? []

  const canProceed: boolean[] = [
    Boolean(form.legalName.trim() && form.tradeName.trim() && form.taxId.trim()),
    Boolean(form.countrySlug && form.citySlug && form.address.trim()),
    Boolean(form.categorySlug),
    Boolean(form.description.trim().length > 10),
    Boolean(idDoc && legalDoc && declaration),
    true,
  ]

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const { company } = await api.createCompany(form)
      await api.submitKyc(company.id, [
        { label: idDoc!.label, dataUrl: idDoc!.dataUrl },
        { label: legalDoc!.label, dataUrl: legalDoc!.dataUrl },
      ])
      router.replace('/(tabs)/panel')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo completar el registro')
    } finally {
      setSubmitting(false)
    }
  }

  function next() {
    if (step === STEP_LABELS.length - 1) handleSubmit()
    else setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1))
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <Pressable onPress={() => (step === 0 ? router.back() : setStep((s) => s - 1))} style={styles.iconBtn}>
          <ArrowLeft size={16} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Registra tu empresa</Text>
        <View style={{ width: 32 }} />
      </SafeAreaView>

      <View style={styles.stepper}>
        {STEP_LABELS.map((_, i) => (
          <View key={i} style={[styles.stepDot, i <= step ? styles.stepDotActive : null]} />
        ))}
      </View>
      <Text style={styles.stepLabel}>{STEP_LABELS[step]}</Text>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AnimatedScreen animKey={step} fill={false} distance={10}>
        {step === 0 && (
          <View style={{ gap: 16 }}>
            <TextField label="Nombre legal de la empresa" value={form.legalName} onChangeText={(v) => update('legalName', v)} placeholder="Ej. Fuego Norte Parrilla S.A. de C.V." />
            <TextField label="Nombre comercial" value={form.tradeName} onChangeText={(v) => update('tradeName', v)} placeholder="Como lo conocen tus clientes" />
            <TextField label="Identificación tributaria (RTN / NIT)" value={form.taxId} onChangeText={(v) => update('taxId', v)} placeholder="RTN-00000000000" />
          </View>
        )}

        {step === 1 && (
          <View style={{ gap: 16 }}>
            <SelectField
              label="País"
              value={form.countrySlug}
              onChange={(v) => {
                const country = countries.find((c) => c.slug === v)
                update('countrySlug', v)
                update('citySlug', '')
                if (country) {
                  update('lat', country.lat)
                  update('lng', country.lng)
                }
              }}
              options={countries.map((c) => ({ value: c.slug, label: `${c.flag} ${c.label}` }))}
            />
            <SelectField
              label="Ciudad"
              value={form.citySlug}
              disabled={!form.countrySlug}
              onChange={(v) => {
                const city = cities.find((c) => c.slug === v)
                update('citySlug', v)
                if (city) {
                  update('lat', city.lat)
                  update('lng', city.lng)
                }
              }}
              options={cities.map((c) => ({ value: c.slug, label: c.label }))}
            />
            <TextField label="Dirección exacta" value={form.address} onChangeText={(v) => update('address', v)} placeholder="Calle, número, referencia" />
            <Field label="Marca tu ubicación en el mapa">
              <MapPicker lat={form.lat} lng={form.lng} onChange={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))} />
            </Field>
          </View>
        )}

        {step === 2 && (
          <View style={{ gap: 20 }}>
            <Field label="Categoría del negocio">
              <View style={styles.catGrid}>
                {categories.map((cat) => {
                  const active = form.categorySlug === cat.slug
                  return (
                    <Pressable
                      key={cat.slug}
                      onPress={() => update('categorySlug', cat.slug)}
                      style={[styles.catCard, active && styles.catCardActive]}
                    >
                      <CategoryIcon name={cat.icon} size={18} color={colors.blue} />
                      <Text style={styles.catLabel}>{cat.label}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </Field>
            <TagInput label="Productos o servicios" values={form.productsServices} onChange={(v) => update('productsServices', v)} />
          </View>
        )}

        {step === 3 && (
          <View style={{ gap: 18 }}>
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <ImagePickerField label="Logo" value={form.logoDataUrl} onChange={(v) => update('logoDataUrl', v)} round />
              </View>
              <View style={{ flex: 1 }}>
                <ImagePickerField label="Portada" value={form.coverDataUrl} onChange={(v) => update('coverDataUrl', v)} />
              </View>
            </View>
            <TextField
              label="Descripción del negocio"
              value={form.description}
              onChangeText={(v) => update('description', v)}
              placeholder="Cuéntale a tus clientes qué ofreces"
              multiline
              numberOfLines={4}
              style={{ minHeight: 90, textAlignVertical: 'top' }}
            />
            <TextField label="Sitio web" value={form.socials.website ?? ''} onChangeText={(v) => update('socials', { ...form.socials, website: v })} placeholder="https://" icon={<Globe size={14} color={colors.muted2} />} />
            <TextField label="Instagram" value={form.socials.instagram ?? ''} onChangeText={(v) => update('socials', { ...form.socials, instagram: v })} placeholder="https://instagram.com/tunegocio" icon={<Camera size={14} color={colors.muted2} />} />
            <TextField label="Facebook" value={form.socials.facebook ?? ''} onChangeText={(v) => update('socials', { ...form.socials, facebook: v })} placeholder="https://facebook.com/tunegocio" />
            <TextField label="WhatsApp" value={form.socials.whatsapp ?? ''} onChangeText={(v) => update('socials', { ...form.socials, whatsapp: v })} placeholder="+504 9999-0000" keyboardType="phone-pad" />
            <HoursEditor hours={form.hours} onChange={(h) => update('hours', h)} />
          </View>
        )}

        {step === 4 && (
          <View style={{ gap: 16 }}>
            <View style={styles.infoBox}>
              <ShieldCheck size={18} color={colors.blue} />
              <Text style={styles.infoText}>
                Este proceso corresponde a la verificación Genesis ID (KYC/KYB) gestionada por DBNX,
                requisito para operar en el ecosistema del Sistema Financiero Social.
              </Text>
            </View>
            <DocPickerField label="Identidad del representante legal" hint="DNI, pasaporte o identificación oficial" doc={idDoc} onChange={setIdDoc} />
            <DocPickerField label="Documento legal de la empresa" hint="Constitución, permiso de operación o registro mercantil" doc={legalDoc} onChange={setLegalDoc} />
            <Pressable onPress={() => setDeclaration((v) => !v)} style={styles.declarationRow}>
              <View style={[styles.checkbox, declaration && styles.checkboxActive]}>
                {declaration && <Check size={11} color={colors.bg} />}
              </View>
              <Text style={styles.declarationText}>
                Declaro que la información y los documentos proporcionados son verídicos y autorizo su
                verificación contra las listas AML, OFAC y ONU.
              </Text>
            </Pressable>
          </View>
        )}

        {step === 5 && (
          <View style={{ gap: 20 }}>
            <View style={styles.summaryHeader}>
              <View style={styles.summaryLogo}>
                {form.logoDataUrl ? <Image source={{ uri: form.logoDataUrl }} style={StyleSheet.absoluteFill} /> : <Building2 size={22} color={colors.bg} />}
              </View>
              <View>
                <Text style={styles.summaryName}>{form.tradeName || 'Tu negocio'}</Text>
                <Text style={styles.summaryCategory}>{categories.find((c) => c.slug === form.categorySlug)?.label}</Text>
              </View>
            </View>

            <View style={{ gap: 12 }}>
              <SummaryRow label="Nombre legal" value={form.legalName} />
              <SummaryRow label="RTN / NIT" value={form.taxId} />
              <SummaryRow label="Ubicación" value={`${form.address}, ${cities.find((c) => c.slug === form.citySlug)?.label ?? ''}`} />
              <SummaryRow label="País" value={countries.find((c) => c.slug === form.countrySlug)?.label ?? ''} />
              <SummaryRow label="Productos / servicios" value={form.productsServices.join(', ') || '—'} />
              <SummaryRow label="Documentos KYC" value={`${idDoc ? '1' : '0'}/2 identidad · ${legalDoc ? '1' : '0'}/2 legal`} />
            </View>

            <Text style={styles.reviewNote}>
              Al enviar, tu empresa quedará en estado <Text style={{ color: colors.text, fontFamily: fonts.bodySemiBold }}>"En revisión"</Text>.
              Aparecerá en el directorio público una vez verificada.
            </Text>

            {submitError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{submitError}</Text>
              </View>
            )}
          </View>
        )}
        </AnimatedScreen>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <GradientButton
          label={step === STEP_LABELS.length - 1 ? 'Enviar registro' : 'Continuar'}
          onPress={next}
          disabled={!canProceed[step]}
          loading={submitting}
          icon={step === STEP_LABELS.length - 1 ? undefined : <ArrowRight size={16} color={colors.bg} />}
        />
      </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme()
  const styles = createStyles(colors)
  return (
    <View>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value || '—'}</Text>
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  iconBtn: { width: 32, height: 32, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
  stepper: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginTop: 16 },
  stepDot: { flex: 1, height: 4, borderRadius: 999, backgroundColor: colors.border },
  stepDotActive: { backgroundColor: colors.blue },
  stepLabel: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 12, paddingHorizontal: 20, marginTop: 10 },
  content: { padding: 20, paddingBottom: 40 },
  row2: { flexDirection: 'row', gap: 12 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catCard: {
    width: '31%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
    gap: 8,
  },
  catCardActive: { borderColor: colors.blue, backgroundColor: colors.blue + '18' },
  catLabel: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 11, lineHeight: 14 },
  infoBox: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.blue + '40',
    backgroundColor: colors.blue + '18',
    borderRadius: radius.md,
    padding: 14,
  },
  infoText: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, flex: 1 },
  declarationRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  declarationText: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, flex: 1 },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryLogo: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.violet, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  summaryName: { color: colors.text, fontFamily: fonts.display, fontSize: 16 },
  summaryCategory: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  summaryLabel: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11 },
  summaryValue: { color: colors.text, fontFamily: fonts.body, fontSize: 13.5, marginTop: 2 },
  reviewNote: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 19 },
  errorBox: { borderWidth: 1, borderColor: colors.danger + '55', backgroundColor: colors.danger + '18', borderRadius: radius.sm, padding: 10 },
  errorText: { color: colors.danger, fontFamily: fonts.body, fontSize: 12 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  })
}
