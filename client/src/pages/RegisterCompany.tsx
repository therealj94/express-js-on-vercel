import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Building2, Check, Globe, Camera, Loader2, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'
import { useMetaStore } from '../store/meta'
import { CategoryIcon } from '../components/CategoryIcon'
import { MapPicker } from '../components/MapPicker'
import { Field, TagInput, ImageField, DocField } from '../components/FormFields'
import type { CompanySocials, DayKey, WeekHours } from '../types'

const DEFAULT_HOURS: WeekHours = {
  mon: { open: '08:00', close: '18:00', closed: false },
  tue: { open: '08:00', close: '18:00', closed: false },
  wed: { open: '08:00', close: '18:00', closed: false },
  thu: { open: '08:00', close: '18:00', closed: false },
  fri: { open: '08:00', close: '21:00', closed: false },
  sat: { open: '09:00', close: '21:00', closed: false },
  sun: { open: '00:00', close: '00:00', closed: true },
}
const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom',
}
const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

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

export function RegisterCompany() {
  const navigate = useNavigate()
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

  const [idDoc, setIdDoc] = useState<{ label: string; dataUrl: string } | null>(null)
  const [legalDoc, setLegalDoc] = useState<{ label: string; dataUrl: string } | null>(null)
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
      navigate('/panel')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo completar el registro')
    } finally {
      setSubmitting(false)
    }
  }

  function next() {
    if (step === STEP_LABELS.length - 1) {
      handleSubmit()
    } else {
      setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1))
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Registra tu empresa</h1>
      <p className="mt-1 text-sm text-muted">Completa los pasos para afiliarte al directorio de MyTokenPay.</p>

      {/* Stepper */}
      <div className="mt-8 flex items-center gap-1 overflow-x-auto pb-1">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center">
            <button
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                i < step ? 'bg-blue text-bg' : i === step ? 'border-2 border-blue text-blue' : 'border border-border text-muted-2'
              }`}
            >
              {i < step ? <Check size={14} /> : i + 1}
            </button>
            {i < STEP_LABELS.length - 1 && <div className={`mx-1.5 h-0.5 w-6 rounded-full sm:w-10 ${i < step ? 'bg-blue' : 'bg-border'}`} />}
          </div>
        ))}
      </div>
      <p className="mt-3 font-display text-sm font-semibold text-muted">{STEP_LABELS[step]}</p>

      <motion.div
        key={step}
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="bento-card mt-6 p-6 sm:p-8"
      >
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Nombre legal de la empresa">
              <input
                value={form.legalName}
                onChange={(e) => update('legalName', e.target.value)}
                placeholder="Ej. Fuego Norte Parrilla S.A. de C.V."
                className="input-field text-sm"
              />
            </Field>
            <Field label="Nombre comercial">
              <input
                value={form.tradeName}
                onChange={(e) => update('tradeName', e.target.value)}
                placeholder="Como lo conocen tus clientes"
                className="input-field text-sm"
              />
            </Field>
            <Field label="Identificación tributaria (RTN / NIT)">
              <input
                value={form.taxId}
                onChange={(e) => update('taxId', e.target.value)}
                placeholder="RTN-00000000000"
                className="input-field text-sm"
              />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="País">
                <select
                  value={form.countrySlug}
                  onChange={(e) => {
                    const country = countries.find((c) => c.slug === e.target.value)
                    update('countrySlug', e.target.value)
                    update('citySlug', '')
                    if (country) {
                      update('lat', country.lat)
                      update('lng', country.lng)
                    }
                  }}
                  className="input-field text-sm"
                >
                  <option value="">Selecciona un país</option>
                  {countries.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.flag} {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ciudad">
                <select
                  value={form.citySlug}
                  onChange={(e) => {
                    const city = cities.find((c) => c.slug === e.target.value)
                    update('citySlug', e.target.value)
                    if (city) {
                      update('lat', city.lat)
                      update('lng', city.lng)
                    }
                  }}
                  disabled={!form.countrySlug}
                  className="input-field text-sm disabled:opacity-50"
                >
                  <option value="">Selecciona una ciudad</option>
                  {cities.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Dirección exacta">
              <input
                value={form.address}
                onChange={(e) => update('address', e.target.value)}
                placeholder="Calle, número, referencia"
                className="input-field text-sm"
              />
            </Field>

            <Field label="Marca tu ubicación en el mapa">
              <MapPicker lat={form.lat} lng={form.lng} onChange={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <Field label="Categoría del negocio">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {categories.map((cat) => (
                  <button
                    key={cat.slug}
                    type="button"
                    onClick={() => update('categorySlug', cat.slug)}
                    className={`flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-colors ${
                      form.categorySlug === cat.slug ? 'border-blue bg-blue/10' : 'border-border hover:border-muted-2'
                    }`}
                  >
                    <CategoryIcon name={cat.icon} className="h-5 w-5 text-blue" />
                    <span className="text-xs font-semibold leading-tight">{cat.label}</span>
                  </button>
                ))}
              </div>
            </Field>

            <TagInput
              label="Productos o servicios"
              values={form.productsServices}
              onChange={(v) => update('productsServices', v)}
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <ImageField label="Logo" value={form.logoDataUrl} onChange={(v) => update('logoDataUrl', v)} round />
              <ImageField label="Foto de portada" value={form.coverDataUrl} onChange={(v) => update('coverDataUrl', v)} />
            </div>

            <Field label="Descripción del negocio">
              <textarea
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                rows={4}
                placeholder="Cuéntale a tus clientes qué ofreces y qué te hace diferente"
                className="input-field text-sm"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sitio web">
                <div className="relative">
                  <Globe size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-2" />
                  <input
                    value={form.socials.website ?? ''}
                    onChange={(e) => update('socials', { ...form.socials, website: e.target.value })}
                    placeholder="https://"
                    className="input-field !pl-9 text-sm"
                  />
                </div>
              </Field>
              <Field label="Instagram">
                <div className="relative">
                  <Camera size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-2" />
                  <input
                    value={form.socials.instagram ?? ''}
                    onChange={(e) => update('socials', { ...form.socials, instagram: e.target.value })}
                    placeholder="https://instagram.com/tunegocio"
                    className="input-field !pl-9 text-sm"
                  />
                </div>
              </Field>
              <Field label="Facebook">
                <input
                  value={form.socials.facebook ?? ''}
                  onChange={(e) => update('socials', { ...form.socials, facebook: e.target.value })}
                  placeholder="https://facebook.com/tunegocio"
                  className="input-field text-sm"
                />
              </Field>
              <Field label="WhatsApp">
                <input
                  value={form.socials.whatsapp ?? ''}
                  onChange={(e) => update('socials', { ...form.socials, whatsapp: e.target.value })}
                  placeholder="+504 9999-0000"
                  className="input-field text-sm"
                />
              </Field>
            </div>

            <Field label="Horario de atención">
              <div className="space-y-2 rounded-xl border border-border p-3">
                {DAY_ORDER.map((day) => (
                  <div key={day} className="grid grid-cols-[2.5rem_1fr_1fr_auto] items-center gap-2 text-sm">
                    <span className="text-xs font-semibold text-muted">{DAY_LABELS[day]}</span>
                    <input
                      type="time"
                      value={form.hours[day].open}
                      disabled={form.hours[day].closed}
                      onChange={(e) =>
                        update('hours', { ...form.hours, [day]: { ...form.hours[day], open: e.target.value } })
                      }
                      className="input-field !py-1.5 text-xs disabled:opacity-40"
                    />
                    <input
                      type="time"
                      value={form.hours[day].close}
                      disabled={form.hours[day].closed}
                      onChange={(e) =>
                        update('hours', { ...form.hours, [day]: { ...form.hours[day], close: e.target.value } })
                      }
                      className="input-field !py-1.5 text-xs disabled:opacity-40"
                    />
                    <label className="flex items-center gap-1.5 text-[11px] text-muted-2">
                      <input
                        type="checkbox"
                        checked={form.hours[day].closed}
                        onChange={(e) =>
                          update('hours', { ...form.hours, [day]: { ...form.hours[day], closed: e.target.checked } })
                        }
                      />
                      Cerrado
                    </label>
                  </div>
                ))}
              </div>
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-xl border border-blue/25 bg-blue/10 p-4 text-sm text-muted">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-blue" />
              Este proceso corresponde a la verificación Genesis ID (KYC/KYB) gestionada por DBNX, requisito
              para operar en el ecosistema del Sistema Financiero Social.
            </div>

            <DocField
              label="Identidad del representante legal"
              hint="DNI, pasaporte o identificación oficial"
              doc={idDoc}
              onChange={setIdDoc}
            />
            <DocField
              label="Documento legal de la empresa"
              hint="Constitución, permiso de operación o registro mercantil"
              doc={legalDoc}
              onChange={setLegalDoc}
            />

            <label className="flex items-start gap-2.5 text-sm text-muted">
              <input
                type="checkbox"
                checked={declaration}
                onChange={(e) => setDeclaration(e.target.checked)}
                className="mt-0.5"
              />
              Declaro que la información y los documentos proporcionados son verídicos y autorizo su
              verificación contra las listas AML, OFAC y ONU.
            </label>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-gradient-brand">
                {form.logoDataUrl ? (
                  <img src={form.logoDataUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Building2 className="h-7 w-7 text-bg" />
                )}
              </div>
              <div>
                <p className="font-display text-lg font-semibold">{form.tradeName || 'Tu negocio'}</p>
                <p className="text-xs text-muted">{categories.find((c) => c.slug === form.categorySlug)?.label}</p>
              </div>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <SummaryRow label="Nombre legal" value={form.legalName} />
              <SummaryRow label="RTN / NIT" value={form.taxId} />
              <SummaryRow
                label="Ubicación"
                value={`${form.address}, ${cities.find((c) => c.slug === form.citySlug)?.label ?? ''}`}
              />
              <SummaryRow label="País" value={countries.find((c) => c.slug === form.countrySlug)?.label ?? ''} />
              <SummaryRow label="Productos / servicios" value={form.productsServices.join(', ') || '—'} />
              <SummaryRow label="Documentos KYC" value={`${idDoc ? '1' : '0'}/2 identidad · ${legalDoc ? '1' : '0'}/2 legal`} />
            </dl>

            <p className="text-sm leading-relaxed text-muted">
              Al enviar, tu empresa quedará en estado <strong className="text-text">"En revisión"</strong>.
              Aparecerá en el directorio público una vez verificada.
            </p>

            {submitError && (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{submitError}</p>
            )}
          </div>
        )}
      </motion.div>

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="btn-ghost text-sm disabled:opacity-40"
        >
          <ArrowLeft size={15} />
          Atrás
        </button>
        <button onClick={next} disabled={!canProceed[step] || submitting} className="btn-primary text-sm disabled:opacity-50">
          {submitting ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Enviando…
            </>
          ) : step === STEP_LABELS.length - 1 ? (
            'Enviar registro'
          ) : (
            <>
              Continuar
              <ArrowRight size={15} />
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-2">{label}</dt>
      <dd className="mt-0.5 text-text">{value || '—'}</dd>
    </div>
  )
}
