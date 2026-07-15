import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ExternalLink, Globe, Camera, Loader2, Save } from 'lucide-react'
import { api } from '../lib/api'
import { useMetaStore } from '../store/meta'
import { Field, TagInput, ImageField, DocField } from '../components/FormFields'
import { MapPicker } from '../components/MapPicker'
import { StatusBadge } from '../components/StatusBadge'
import type { Company, DayKey } from '../types'

const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom',
}
const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export function EditCompany() {
  const { categories, countries, load } = useMetaStore()
  const [company, setCompany] = useState<Company | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [idDoc, setIdDoc] = useState<{ label: string; dataUrl: string } | null>(null)
  const [legalDoc, setLegalDoc] = useState<{ label: string; dataUrl: string } | null>(null)
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
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <div className="skeleton h-96 rounded-3xl" />
      </div>
    )
  }

  if (company === null) {
    return (
      <div className="mx-auto max-w-lg px-5 py-24 text-center">
        <p className="font-display text-lg font-semibold">Aún no tienes una empresa registrada</p>
        <Link to="/panel/registrar-empresa" className="btn-primary mt-6 inline-flex">
          Registrar mi empresa
        </Link>
      </div>
    )
  }

  const cities = countries.find((c) => c.slug === company.countrySlug)?.cities ?? []

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Mi empresa</h1>
          <p className="mt-1 text-sm text-muted">Edita el perfil público de {company.tradeName}.</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={company.kyc.status} />
          <Link to={`/negocio/${company.id}`} className="btn-ghost !py-2 !px-3.5 text-sm">
            <ExternalLink size={14} />
            Ver ficha
          </Link>
        </div>
      </div>

      <div className="bento-card mt-6 space-y-6 p-6 sm:p-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre legal">
            <input value={company.legalName} onChange={(e) => update('legalName', e.target.value)} className="input-field text-sm" />
          </Field>
          <Field label="Nombre comercial">
            <input value={company.tradeName} onChange={(e) => update('tradeName', e.target.value)} className="input-field text-sm" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="País">
            <select
              value={company.countrySlug}
              onChange={(e) => update('countrySlug', e.target.value)}
              className="input-field text-sm"
            >
              {countries.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.flag} {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ciudad">
            <select value={company.citySlug} onChange={(e) => update('citySlug', e.target.value)} className="input-field text-sm">
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Dirección exacta">
          <input value={company.address} onChange={(e) => update('address', e.target.value)} className="input-field text-sm" />
        </Field>

        <Field label="Ubicación en el mapa">
          <MapPicker lat={company.lat} lng={company.lng} onChange={(lat, lng) => setCompany((c) => (c ? { ...c, lat, lng } : c))} />
        </Field>

        <Field label="Categoría">
          <select value={company.categorySlug} onChange={(e) => update('categorySlug', e.target.value)} className="input-field text-sm">
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <TagInput label="Productos o servicios" values={company.productsServices} onChange={(v) => update('productsServices', v)} />

        <div className="grid gap-4 sm:grid-cols-2">
          <ImageField label="Logo" value={company.logoDataUrl} onChange={(v) => update('logoDataUrl', v)} round />
          <ImageField label="Foto de portada" value={company.coverDataUrl} onChange={(v) => update('coverDataUrl', v)} />
        </div>

        <Field label="Descripción">
          <textarea
            value={company.description}
            onChange={(e) => update('description', e.target.value)}
            rows={4}
            className="input-field text-sm"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sitio web">
            <div className="relative">
              <Globe size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-2" />
              <input
                value={company.socials.website ?? ''}
                onChange={(e) => update('socials', { ...company.socials, website: e.target.value })}
                className="input-field !pl-9 text-sm"
              />
            </div>
          </Field>
          <Field label="Instagram">
            <div className="relative">
              <Camera size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-2" />
              <input
                value={company.socials.instagram ?? ''}
                onChange={(e) => update('socials', { ...company.socials, instagram: e.target.value })}
                className="input-field !pl-9 text-sm"
              />
            </div>
          </Field>
          <Field label="Facebook">
            <input
              value={company.socials.facebook ?? ''}
              onChange={(e) => update('socials', { ...company.socials, facebook: e.target.value })}
              className="input-field text-sm"
            />
          </Field>
          <Field label="WhatsApp">
            <input
              value={company.socials.whatsapp ?? ''}
              onChange={(e) => update('socials', { ...company.socials, whatsapp: e.target.value })}
              className="input-field text-sm"
            />
          </Field>
        </div>

        {company.hours && (
          <Field label="Horario de atención">
            <div className="space-y-2 rounded-xl border border-border p-3">
              {DAY_ORDER.map((day) => (
                <div key={day} className="grid grid-cols-[2.5rem_1fr_1fr_auto] items-center gap-2 text-sm">
                  <span className="text-xs font-semibold text-muted">{DAY_LABELS[day]}</span>
                  <input
                    type="time"
                    value={company.hours![day].open}
                    disabled={company.hours![day].closed}
                    onChange={(e) => update('hours', { ...company.hours!, [day]: { ...company.hours![day], open: e.target.value } })}
                    className="input-field !py-1.5 text-xs disabled:opacity-40"
                  />
                  <input
                    type="time"
                    value={company.hours![day].close}
                    disabled={company.hours![day].closed}
                    onChange={(e) => update('hours', { ...company.hours!, [day]: { ...company.hours![day], close: e.target.value } })}
                    className="input-field !py-1.5 text-xs disabled:opacity-40"
                  />
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-2">
                    <input
                      type="checkbox"
                      checked={company.hours![day].closed}
                      onChange={(e) => update('hours', { ...company.hours!, [day]: { ...company.hours![day], closed: e.target.checked } })}
                    />
                    Cerrado
                  </label>
                </div>
              ))}
            </div>
          </Field>
        )}

        {error && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm disabled:opacity-60">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Guardar cambios
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-xs font-semibold text-ok">
              <Check size={13} />
              Cambios guardados
            </span>
          )}
        </div>
      </div>

      {(company.kyc.status === 'unsubmitted' || company.kyc.status === 'rejected') && (
        <div className="bento-card mt-6 space-y-4 p-6 sm:p-8">
          <h2 className="font-display text-base font-semibold">
            {company.kyc.status === 'rejected' ? 'Reenviar documentos de verificación' : 'Enviar documentos de verificación'}
          </h2>
          <DocField label="Identidad del representante legal" hint="DNI, pasaporte o identificación oficial" doc={idDoc} onChange={setIdDoc} />
          <DocField label="Documento legal de la empresa" hint="Constitución, permiso de operación o registro mercantil" doc={legalDoc} onChange={setLegalDoc} />
          <button
            onClick={handleResubmitKyc}
            disabled={!idDoc || !legalDoc || resubmitting}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {resubmitting ? <Loader2 size={15} className="animate-spin" /> : null}
            Enviar a verificación
          </button>
        </div>
      )}
    </div>
  )
}
