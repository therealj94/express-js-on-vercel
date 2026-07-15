import { useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Check, ExternalLink, Globe, Camera, Save } from 'lucide-react-native'
import { api } from '../src/lib/api'
import { useMetaStore } from '../src/store/meta'
import { TextField, Field } from '../src/components/ui/TextField'
import { SelectField } from '../src/components/ui/SelectField'
import { GradientButton } from '../src/components/ui/GradientButton'
import { TagInput } from '../src/components/forms/TagInput'
import { ImagePickerField } from '../src/components/forms/ImagePickerField'
import { DocPickerField, type PickedDoc } from '../src/components/forms/DocPickerField'
import { HoursEditor } from '../src/components/forms/HoursEditor'
import { StatusBadge } from '../src/components/StatusBadge'
import { AnimatedScreen } from '../src/components/AnimatedScreen'
import { MapPicker } from '../src/components/MapPicker'
import { fonts, radius } from '../src/lib/theme'
import { useTheme, type ThemeColors } from '../src/hooks/useTheme'
import type { Company } from '../src/lib/types'

export default function EditCompany() {
  const { colors } = useTheme()
  const styles = createStyles(colors)
  const router = useRouter()
  const { categories, countries, load } = useMetaStore()
  const [company, setCompany] = useState<Company | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [idDoc, setIdDoc] = useState<PickedDoc | null>(null)
  const [legalDoc, setLegalDoc] = useState<PickedDoc | null>(null)
  const [resubmitting, setResubmitting] = useState(false)

  useEffect(() => {
    load()
    api.myCompany().then(({ company }) => setCompany(company))
  }, [load])

  function update<K extends keyof Company>(key: K, value: Company[K]) {
    setCompany((c) => (c ? { ...c, [key]: value } : c))
  }

  async function handleSave() {
    if (!company) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const { company: updated } = await api.updateCompany(company.id, company)
      setCompany(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar los cambios')
    } finally {
      setSaving(false)
    }
  }

  async function handleResubmitKyc() {
    if (!company || !idDoc || !legalDoc) return
    setResubmitting(true)
    try {
      const { company: updated } = await api.submitKyc(company.id, [idDoc, legalDoc])
      setCompany(updated)
    } finally {
      setResubmitting(false)
    }
  }

  if (company === undefined) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.blue} />
      </SafeAreaView>
    )
  }

  if (company === null) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.emptyTitle}>Aún no tienes una empresa registrada</Text>
        <GradientButton
          label="Registrar mi empresa"
          onPress={() => router.replace('/registrar-empresa')}
          style={{ marginTop: 16 }}
        />
      </SafeAreaView>
    )
  }

  const cities = countries.find((c) => c.slug === company.countrySlug)?.cities ?? []

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft size={16} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Mi empresa</Text>
        <Pressable onPress={() => router.push(`/negocio/${company.id}`)} style={styles.iconBtn}>
          <ExternalLink size={14} color={colors.text} />
        </Pressable>
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AnimatedScreen fill={false} style={{ gap: 16 }}>
        <View style={styles.statusRow}>
          <StatusBadge status={company.kyc.status} />
        </View>

        <TextField label="Nombre legal" value={company.legalName} onChangeText={(v) => update('legalName', v)} />
        <TextField label="Nombre comercial" value={company.tradeName} onChangeText={(v) => update('tradeName', v)} />

        <SelectField
          label="País"
          value={company.countrySlug}
          onChange={(v) => update('countrySlug', v)}
          options={countries.map((c) => ({ value: c.slug, label: `${c.flag} ${c.label}` }))}
        />
        <SelectField
          label="Ciudad"
          value={company.citySlug}
          onChange={(v) => update('citySlug', v)}
          options={cities.map((c) => ({ value: c.slug, label: c.label }))}
        />
        <TextField label="Dirección exacta" value={company.address} onChangeText={(v) => update('address', v)} />

        <Field label="Ubicación en el mapa">
          <MapPicker
            lat={company.lat}
            lng={company.lng}
            onChange={(lat, lng) => setCompany((c) => (c ? { ...c, lat, lng } : c))}
          />
        </Field>

        <SelectField
          label="Categoría"
          value={company.categorySlug}
          onChange={(v) => update('categorySlug', v)}
          options={categories.map((c) => ({ value: c.slug, label: c.label }))}
        />

        <TagInput label="Productos o servicios" values={company.productsServices} onChange={(v) => update('productsServices', v)} />

        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <ImagePickerField label="Logo" value={company.logoDataUrl} onChange={(v) => update('logoDataUrl', v)} round />
          </View>
          <View style={{ flex: 1 }}>
            <ImagePickerField label="Portada" value={company.coverDataUrl} onChange={(v) => update('coverDataUrl', v)} />
          </View>
        </View>

        <TextField
          label="Descripción"
          value={company.description}
          onChangeText={(v) => update('description', v)}
          multiline
          numberOfLines={4}
          style={{ minHeight: 90, textAlignVertical: 'top' }}
        />

        <TextField label="Sitio web" value={company.socials.website ?? ''} onChangeText={(v) => update('socials', { ...company.socials, website: v })} icon={<Globe size={14} color={colors.muted2} />} />
        <TextField label="Instagram" value={company.socials.instagram ?? ''} onChangeText={(v) => update('socials', { ...company.socials, instagram: v })} icon={<Camera size={14} color={colors.muted2} />} />
        <TextField label="Facebook" value={company.socials.facebook ?? ''} onChangeText={(v) => update('socials', { ...company.socials, facebook: v })} />
        <TextField label="WhatsApp" value={company.socials.whatsapp ?? ''} onChangeText={(v) => update('socials', { ...company.socials, whatsapp: v })} keyboardType="phone-pad" />

        {company.hours && <HoursEditor hours={company.hours} onChange={(h) => update('hours', h)} />}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.saveRow}>
          <GradientButton
            label="Guardar cambios"
            onPress={handleSave}
            loading={saving}
            icon={<Save size={15} color={colors.bg} />}
          />
          {saved && (
            <View style={styles.savedRow}>
              <Check size={13} color={colors.ok} />
              <Text style={styles.savedText}>Cambios guardados</Text>
            </View>
          )}
        </View>

        {(company.kyc.status === 'unsubmitted' || company.kyc.status === 'rejected') && (
          <View style={styles.kycSection}>
            <Text style={styles.kycTitle}>
              {company.kyc.status === 'rejected' ? 'Reenviar documentos de verificación' : 'Enviar documentos de verificación'}
            </Text>
            <DocPickerField label="Identidad del representante legal" hint="DNI, pasaporte o identificación oficial" doc={idDoc} onChange={setIdDoc} />
            <DocPickerField label="Documento legal de la empresa" hint="Constitución, permiso de operación o registro mercantil" doc={legalDoc} onChange={setLegalDoc} />
            <GradientButton
              label="Enviar a verificación"
              onPress={handleResubmitKyc}
              disabled={!idDoc || !legalDoc}
              loading={resubmitting}
            />
          </View>
        )}
        </AnimatedScreen>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 8, paddingHorizontal: 40 },
  emptyTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 15, textAlign: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBtn: { width: 32, height: 32, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
  content: { padding: 20, paddingBottom: 48 },
  statusRow: { flexDirection: 'row' },
  row2: { flexDirection: 'row', gap: 12 },
  errorBox: { borderWidth: 1, borderColor: colors.danger + '55', backgroundColor: colors.danger + '18', borderRadius: radius.sm, padding: 10 },
  errorText: { color: colors.danger, fontFamily: fonts.body, fontSize: 12 },
  saveRow: { gap: 10 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center' },
  savedText: { color: colors.ok, fontFamily: fonts.bodySemiBold, fontSize: 12 },
  kycSection: { gap: 14, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 20, marginTop: 4 },
  kycTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
  })
}
