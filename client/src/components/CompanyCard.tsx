import { Link } from 'react-router-dom'
import { BadgeCheck, MapPin } from 'lucide-react'
import type { Company } from '../types'
import { useMetaStore } from '../store/meta'
import { CategoryIcon } from './CategoryIcon'

export function CompanyCard({ company }: { company: Company }) {
  const { categories, countries, cityLabel } = useMetaStore()
  const category = categories.find((c) => c.slug === company.categorySlug)
  const country = countries.find((c) => c.slug === company.countrySlug)

  return (
    <Link
      to={`/negocio/${company.id}`}
      className="bento-card group flex flex-col p-5 focus-visible:outline-2 focus-visible:outline-blue"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-brand">
            {company.logoDataUrl ? (
              <img src={company.logoDataUrl} alt={company.tradeName} className="h-full w-full object-cover" />
            ) : (
              <CategoryIcon name={category?.icon ?? ''} className="h-6 w-6 text-bg" />
            )}
          </div>
          <div>
            <h3 className="font-display text-base font-semibold leading-tight text-text">
              {company.tradeName}
            </h3>
            <p className="text-xs text-muted">{category?.label ?? company.categorySlug}</p>
          </div>
        </div>
        {company.verified && (
          <span title="Negocio verificado">
            <BadgeCheck size={18} className="shrink-0 text-ok" />
          </span>
        )}
      </div>

      <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-muted">{company.description}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {company.productsServices.slice(0, 3).map((tag) => (
          <span key={tag} className="chip !py-1 !text-[11px]">
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-1.5 border-t border-border pt-4 text-xs text-muted-2">
        <MapPin size={13} />
        <span>
          {cityLabel(company.countrySlug, company.citySlug)}, {country?.label ?? company.countrySlug}
        </span>
        <span className="ml-auto">{country?.flag}</span>
      </div>
    </Link>
  )
}
