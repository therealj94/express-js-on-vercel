import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  BadgeCheck,
  Clock,
  Link2,
  Globe,
  Camera,
  MapPin,
  MessageCircle,
  ArrowLeft,
} from 'lucide-react'
import { api } from '../lib/api'
import type { Company, DayKey } from '../types'
import { useMetaStore } from '../store/meta'
import { CategoryIcon } from '../components/CategoryIcon'
import { MapView } from '../components/MapView'

const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Lunes',
  tue: 'Martes',
  wed: 'Miércoles',
  thu: 'Jueves',
  fri: 'Viernes',
  sat: 'Sábado',
  sun: 'Domingo',
}
const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export function CompanyDetail() {
  const { id } = useParams<{ id: string }>()
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
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <div className="skeleton h-56 w-full rounded-3xl" />
        <div className="skeleton mt-6 h-8 w-1/2 rounded-lg" />
        <div className="skeleton mt-3 h-4 w-3/4 rounded-lg" />
      </div>
    )
  }

  if (status === 'error' || !company) {
    return (
      <div className="mx-auto max-w-lg px-5 py-24 text-center">
        <p className="font-display text-lg font-semibold">No encontramos este comercio</p>
        <Link to="/explorar" className="btn-primary mt-6 inline-flex">
          Volver al directorio
        </Link>
      </div>
    )
  }

  const category = categories.find((c) => c.slug === company.categorySlug)
  const country = countries.find((c) => c.slug === company.countrySlug)

  return (
    <div className="pb-16">
      <div className="relative h-56 w-full overflow-hidden sm:h-72">
        {company.coverDataUrl ? (
          <img src={company.coverDataUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-brand opacity-30" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
        <Link
          to="/explorar"
          className="glass absolute left-5 top-5 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold sm:left-8"
        >
          <ArrowLeft size={14} />
          Directorio
        </Link>
      </div>

      <div className="mx-auto -mt-14 max-w-5xl px-5 sm:px-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border-4 border-bg bg-gradient-brand shadow-xl">
            {company.logoDataUrl ? (
              <img src={company.logoDataUrl} alt={company.tradeName} className="h-full w-full object-cover" />
            ) : (
              <CategoryIcon name={category?.icon ?? ''} className="h-10 w-10 text-bg" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold sm:text-3xl">{company.tradeName}</h1>
              {company.verified && (
                <span className="inline-flex items-center gap-1 rounded-full border border-ok/30 bg-ok/10 px-2.5 py-1 text-xs font-semibold text-ok">
                  <BadgeCheck size={13} />
                  Verificado
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">
              {category?.label} · {cityLabel(company.countrySlug, company.citySlug)}, {country?.label} {country?.flag}
            </p>
          </div>

          {company.socials.whatsapp && (
            <a
              href={`https://wa.me/${company.socials.whatsapp.replace(/[^\d]/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
            >
              <MessageCircle size={16} />
              Contactar
            </a>
          )}
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-8">
            <div>
              <h2 className="font-display text-lg font-semibold">Sobre este comercio</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{company.description}</p>
            </div>

            {company.productsServices.length > 0 && (
              <div>
                <h2 className="font-display text-lg font-semibold">Productos y servicios</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {company.productsServices.map((tag) => (
                    <span key={tag} className="chip">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {company.gallery.length > 0 && (
              <div>
                <h2 className="font-display text-lg font-semibold">Galería</h2>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {company.gallery.map((src, i) => (
                    <img key={i} src={src} alt="" className="aspect-square rounded-xl object-cover" />
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="font-display text-lg font-semibold">Ubicación</h2>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                <MapPin size={14} />
                {company.address}
              </p>
              <div className="mt-3">
                <MapView companies={[company]} center={[company.lat, company.lng]} zoom={15} />
              </div>
            </div>
          </div>

          <div className="space-y-5">
            {company.hours && (
              <div className="bento-card p-5">
                <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
                  <Clock size={15} />
                  Horario
                </h3>
                <ul className="mt-3 space-y-1.5 text-xs">
                  {DAY_ORDER.map((day) => (
                    <li key={day} className="flex items-center justify-between text-muted">
                      <span>{DAY_LABELS[day]}</span>
                      <span className={company.hours![day].closed ? 'text-muted-2' : 'text-text'}>
                        {company.hours![day].closed ? 'Cerrado' : `${company.hours![day].open} – ${company.hours![day].close}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(company.socials.website || company.socials.instagram || company.socials.facebook) && (
              <div className="bento-card space-y-3 p-5">
                <h3 className="font-display text-sm font-semibold">Enlaces</h3>
                {company.socials.website && (
                  <a href={company.socials.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-muted hover:text-text">
                    <Globe size={15} />
                    Sitio web
                  </a>
                )}
                {company.socials.instagram && (
                  <a href={company.socials.instagram} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-muted hover:text-text">
                    <Camera size={15} />
                    Instagram
                  </a>
                )}
                {company.socials.facebook && (
                  <a href={company.socials.facebook} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-muted hover:text-text">
                    <Link2 size={15} />
                    Facebook
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
