import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  Clock,
  ExternalLink,
  FileCheck2,
  MapPin,
  Pencil,
  Rocket,
  ShieldAlert,
  ShieldQuestion,
} from 'lucide-react'
import { api } from '../lib/api'
import type { Company } from '../types'
import { useAuthStore } from '../store/auth'
import { useMetaStore } from '../store/meta'
import { CategoryIcon } from '../components/CategoryIcon'
import { StatusBadge } from '../components/StatusBadge'

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

export function Dashboard() {
  const { user } = useAuthStore()
  const { categories, load } = useMetaStore()
  const [company, setCompany] = useState<Company | null | undefined>(undefined)

  useEffect(() => {
    load()
    api.myCompany().then(({ company }) => setCompany(company))
  }, [load])

  const completeness = useMemo(() => (company ? profileCompleteness(company) : 0), [company])
  const category = categories.find((c) => c.slug === company?.categorySlug)

  const stepIndex =
    company?.kyc.status === 'verified' ? 2 : company?.kyc.status === 'pending' || company?.kyc.status === 'rejected' ? 1 : 0

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Hola, {user?.fullName?.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-muted">Este es el panel de tu cuenta en MyTokenPay.</p>
      </div>

      {company === undefined ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-40 rounded-3xl" />
          ))}
        </div>
      ) : company === null ? (
        <div className="mt-8 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Link
            to="/panel/registrar-empresa"
            className="group flex flex-col justify-between rounded-3xl bg-gradient-brand p-8 text-bg transition-transform hover:-translate-y-0.5"
          >
            <Rocket className="h-7 w-7" />
            <div>
              <h2 className="font-display text-xl font-semibold">Registra tu empresa</h2>
              <p className="mt-2 max-w-sm text-sm opacity-80">
                Completa el registro con KYC/KYB, ubicación exacta y perfil público para empezar a
                aparecer en el directorio.
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold">
                Empezar registro
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </Link>

          <div className="bento-card p-8">
            <h3 className="font-display text-base font-semibold">Lo que vas a necesitar</h3>
            <ul className="mt-4 space-y-3 text-sm text-muted">
              <li>· Nombre legal y comercial de tu empresa</li>
              <li>· Identificación tributaria (RTN / NIT)</li>
              <li>· Rubro, productos o servicios que ofreces</li>
              <li>· Ubicación exacta en el mapa</li>
              <li>· Documento de identidad y constitución legal</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="mt-8 space-y-5">
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="bento-card p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-gradient-brand">
                  {company.logoDataUrl ? (
                    <img src={company.logoDataUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <CategoryIcon name={category?.icon ?? ''} className="h-6 w-6 text-bg" />
                  )}
                </div>
                <div>
                  <p className="font-display text-base font-semibold">{company.tradeName}</p>
                  <p className="text-xs text-muted">{category?.label}</p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <StatusBadge status={company.kyc.status} />
              </div>
              <Link
                to={`/negocio/${company.id}`}
                className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-blue hover:underline"
              >
                Ver ficha pública
                <ExternalLink size={12} />
              </Link>
            </div>

            <div className="bento-card p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-2">Perfil completo</p>
              <p className="mt-2 font-display text-3xl font-bold">{completeness}%</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-hi">
                <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${completeness}%` }} />
              </div>
              <Link
                to="/panel/mi-empresa"
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue hover:underline"
              >
                <Pencil size={12} />
                Completar perfil
              </Link>
            </div>

            <div className="bento-card p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-2">Ubicación</p>
              <p className="mt-2 flex items-start gap-1.5 text-sm text-text">
                <MapPin size={15} className="mt-0.5 shrink-0" />
                {company.address}
              </p>
              <Link
                to="/panel/mi-empresa"
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue hover:underline"
              >
                Editar ubicación
              </Link>
            </div>
          </div>

          <div className="bento-card p-6">
            <h3 className="font-display text-base font-semibold">Estado de verificación (Genesis ID)</h3>
            <p className="mt-1 text-sm text-muted">
              {company.kyc.status === 'verified'
                ? 'Tu empresa está verificada y visible en el directorio público.'
                : company.kyc.status === 'pending'
                  ? 'Tus documentos están en revisión. Este proceso puede tardar algunas horas.'
                  : company.kyc.status === 'rejected'
                    ? 'Tu verificación fue rechazada. Revisa el motivo y vuelve a enviar tus documentos.'
                    : 'Aún no has enviado tus documentos de verificación KYC/KYB.'}
            </p>

            <div className="mt-6 flex items-center">
              {KYC_STEPS.map((step, i) => (
                <div key={step.key} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${
                        i <= stepIndex ? 'border-blue bg-blue/15 text-blue' : 'border-border text-muted-2'
                      }`}
                    >
                      <step.icon size={15} />
                    </div>
                    <span className={`text-[11px] font-semibold ${i <= stepIndex ? 'text-text' : 'text-muted-2'}`}>
                      {step.label}
                    </span>
                  </div>
                  {i < KYC_STEPS.length - 1 && (
                    <div className={`mx-2 h-0.5 flex-1 rounded-full ${i < stepIndex ? 'bg-blue' : 'bg-border'}`} />
                  )}
                </div>
              ))}
            </div>

            {company.kyc.status === 'unsubmitted' && (
              <Link to="/panel/registrar-empresa" className="btn-primary mt-6">
                Enviar documentos de verificación
              </Link>
            )}
            {company.kyc.status === 'rejected' && (
              <div className="mt-6 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
                <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                {company.kyc.note ?? 'No se especificó el motivo. Contacta a soporte.'}
              </div>
            )}
            {company.kyc.status === 'pending' && (
              <div className="mt-6 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
                <ShieldQuestion size={16} className="mt-0.5 shrink-0" />
                DBNX revisa tus documentos contra listas AML, OFAC y ONU antes de emitir tu Genesis ID.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
